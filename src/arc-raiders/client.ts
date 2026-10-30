import {
  MemoryCache,
  resolveTtl,
  type CacheOptions,
  type CacheResource,
  type CacheStore,
} from '../core/cache';
import { ArcRaidersError } from '../core/errors';
import { HttpClient, type HttpClientOptions, type Query } from '../core/http';
import { activeEvents, nextOccurrence, upcomingEvents, type EventQuery } from '../helpers/events';
import {
  buildQuestGraph,
  questShoppingList,
  type QuestGraph,
  type ShoppingListEntry,
} from '../helpers/quests';
import {
  createSearchIndex,
  type SearchHit,
  type SearchIndex,
  type SearchOptions,
} from '../helpers/search';
import { findItemUsage, type ItemUsage } from '../helpers/usage';
import { normalizeItemType, normalizeRarity, toList } from './normalize';
import type {
  Arc,
  Ermal,
  EventsScheduleResponse,
  Item,
  ItemFilter,
  MapId,
  MapMarker,
  MarkerCategory,
  Page,
  Quest,
  ScheduledEvent,
  TraderItem,
  TraderName,
  TradersResponse,
  Weapon,
  WeaponFilter,
} from './types';

export const DEFAULT_BASE_URL = 'https://metaforge.app/api';

/** MetaForge's terms ask public projects to credit them. */
export const ATTRIBUTION = {
  text: 'Game data provided by MetaForge',
  url: 'https://metaforge.app/arc-raiders',
  html: 'Game data provided by <a href="https://metaforge.app/arc-raiders">MetaForge</a>',
} as const;

/**
 * Every map MetaForge has marker data for. `name` is the spelling the events
 * schedule uses, so `events.active({ map: m.name })` and `{ map: m.id }` both work.
 */
export const MAPS: ReadonlyArray<{ id: MapId; name: string }> = [
  { id: 'dam', name: 'Dam' },
  { id: 'spaceport', name: 'Spaceport' },
  { id: 'buried-city', name: 'Buried City' },
  { id: 'blue-gate', name: 'Blue Gate' },
  { id: 'stella-montis', name: 'Stella Montis' },
  { id: 'riven-tides', name: 'Riven Tides' },
  { id: 'pendola-pass', name: 'Pendola Pass' },
];

/**
 * Page sizes that keep pagination stable. The items endpoint sorts
 * non-deterministically, small pages return duplicates and skip items.
 * Quests are capped at 100 by the server.
 */
const PAGE_SIZE = { items: 500, arcs: 100, quests: 100 } as const;
const MAX_PAGES = 200;

export interface ArcRaidersClientOptions extends HttpClientOptions {
  /** Cache settings, or `false` to disable caching. On by default. */
  cache?: CacheOptions | false;
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Skip the cache for this call (the fresh result is still stored). */
  fresh?: boolean;
}

export interface PageOptions extends CallOptions {
  page?: number;
  pageSize?: number;
}

type WithId = { id: string };

export class ArcRaidersClient {
  readonly http: HttpClient;
  readonly items: ItemsResource;
  readonly weapons: WeaponsResource;
  readonly arcs: ArcsResource;
  readonly quests: QuestsResource;
  readonly traders: TradersResource;
  readonly events: EventsResource;
  readonly maps: MapsResource;

  private readonly cacheOptions: CacheOptions | false;
  private readonly store: CacheStore | undefined;
  private readonly revalidating = new Set<string>();

  constructor(options: ArcRaidersClientOptions = {}) {
    const { cache, ...http } = options;
    this.http = new HttpClient({
      ...http,
      // v1 pointed at ".../api/arc-raiders". Accept that and strip it.
      baseURL: (http.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/arc-raiders$/, ''),
    });
    this.cacheOptions = cache ?? {};
    this.store = cache === false ? undefined : (cache?.store ?? new MemoryCache(cache?.maxEntries));

    this.items = new ItemsResource(this);
    this.weapons = new WeaponsResource(this);
    this.arcs = new ArcsResource(this);
    this.quests = new QuestsResource(this);
    this.traders = new TradersResource(this);
    this.events = new EventsResource(this);
    this.maps = new MapsResource(this);
  }

  /** Drops every cached response. */
  async clearCache(): Promise<void> {
    await this.store?.clear();
  }

  /** @internal Cached GET with optional stale-while-revalidate. */
  async fetch<T>(
    resource: CacheResource,
    path: string,
    query: Query = {},
    options: CallOptions = {}
  ): Promise<T> {
    const store = this.store;
    if (!store || this.cacheOptions === false) {
      return this.http.getJson<T>(path, { query, signal: options.signal });
    }

    const key = this.http.buildUrl(path, query);
    const ttl = resolveTtl(this.cacheOptions, resource);
    const swr = this.cacheOptions.staleWhileRevalidate ?? 0;
    const load = async () => {
      const value = await this.http.getJson<T>(path, { query, signal: options.signal });
      const now = Date.now();
      await store.set(key, { value, storedAt: now, expiresAt: now + ttl });
      return value;
    };

    if (!options.fresh) {
      const entry = await store.get(key);
      const now = Date.now();
      if (entry && now < entry.expiresAt) return entry.value as T;
      if (entry && swr > 0 && now < entry.expiresAt + swr) {
        if (!this.revalidating.has(key)) {
          this.revalidating.add(key);
          // Background refresh. Errors are ignored, the stale copy keeps serving.
          void load()
            .catch(() => undefined)
            .finally(() => this.revalidating.delete(key));
        }
        return entry.value as T;
      }
    }
    return load();
  }

  /** @internal Walks all pages, de-duplicating by id. */
  async *paginate<T extends WithId>(
    resource: CacheResource,
    path: string,
    query: Query,
    pageSize: number,
    options: CallOptions = {}
  ): AsyncGenerator<T, void, undefined> {
    const seen = new Set<string>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.fetch<Page<T>>(
        resource,
        path,
        { ...query, page, limit: pageSize },
        options
      );
      assertPage(res, path);
      for (const entry of res.data) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        yield entry;
      }
      if (!res.pagination?.hasNextPage || res.data.length === 0) return;
    }
  }

  /**
   * Fuzzy search across items, quests and ARCs, done locally on cached data.
   * Typos and number styles are forgiven: `"ferro 2"` finds "Ferro II".
   */
  async search(
    query: string,
    options: SearchOptions & CallOptions & { in?: SearchScope[] } = {}
  ): Promise<SearchResult[]> {
    const scopes = new Set<SearchScope>(options.in ?? ['items', 'quests', 'arcs']);
    const index = await this.searchIndex([...scopes], options);
    return index.search(query, options);
  }

  private indexPromise?: { key: string; promise: Promise<SearchIndex<SearchEntity>> };

  private searchIndex(
    scopes: SearchScope[],
    options: CallOptions
  ): Promise<SearchIndex<SearchEntity>> {
    const key = scopes.sort().join(',');
    if (this.indexPromise?.key === key && !options.fresh) return this.indexPromise.promise;

    const promise = (async () => {
      const [items, quests, arcs] = await Promise.all([
        scopes.includes('items') ? this.items.all({}, options) : [],
        scopes.includes('quests') ? this.quests.all(options) : [],
        scopes.includes('arcs') ? this.arcs.all({}, options) : [],
      ]);
      return createSearchIndex<SearchEntity>([
        ...items.map((i) => ({
          id: i.id,
          name: i.name,
          keywords: [i.item_type, i.subcategory ?? '', i.rarity ?? ''],
          value: { type: 'item' as const, data: i },
        })),
        ...quests.map((q) => ({
          id: q.id,
          name: q.name,
          keywords: [q.trader_name, 'quest'],
          value: { type: 'quest' as const, data: q },
        })),
        ...arcs.map((a) => ({
          id: a.id,
          name: a.name,
          keywords: ['arc'],
          value: { type: 'arc' as const, data: a },
        })),
      ]);
    })();
    // Do not keep a failed build around.
    promise.catch(() => {
      if (this.indexPromise?.promise === promise) this.indexPromise = undefined;
    });
    this.indexPromise = { key, promise };
    return promise;
  }

  /**
   * What is this item good for? Combines quests, ARC loot, trader stock and
   * Ermal deals. `keep` tells you whether something still needs it.
   */
  async itemUsage(itemId: string, options: CallOptions = {}): Promise<ItemUsage> {
    const [quests, arcs, traders] = await Promise.all([
      this.quests.all(options),
      this.arcs.all({ includeLoot: true }, options),
      this.traders.getAll(options),
    ]);
    return findItemUsage(itemId, { quests, arcs, traders: traders.data, ermal: traders.ermal });
  }

  // -------------------------------------------------------------------------
  // v1 compatibility. These keep old code compiling, new code should use the
  // resource methods above.
  // -------------------------------------------------------------------------

  /** @deprecated Use `client.items.all(filter)`. */
  getItems(filter?: LegacyFilter): Promise<Item[]> {
    return this.items.all(fromLegacy(filter));
  }
  /** @deprecated Use `client.items.all(filter)`. */
  getAllItems(filter?: LegacyFilter): Promise<Item[]> {
    return this.items.all(fromLegacy(filter));
  }
  /** @deprecated Use `client.items.get(id)`. Throws instead of returning `undefined`. */
  async getItemById(id: string): Promise<Item> {
    return orThrow(await this.items.get(id), `Item "${id}"`);
  }
  /** @deprecated Use `client.weapons.all(filter)`. */
  getWeapons(filter?: LegacyFilter): Promise<Weapon[]> {
    return this.weapons.all(fromLegacy(filter));
  }
  /** @deprecated Use `client.weapons.all(filter)`. */
  getAllWeapons(filter?: LegacyFilter): Promise<Weapon[]> {
    return this.weapons.all(fromLegacy(filter));
  }
  /** @deprecated Use `client.weapons.get(id)`. */
  async getWeaponById(id: string): Promise<Weapon> {
    return orThrow(await this.weapons.get(id), `Weapon "${id}"`);
  }
  /** @deprecated There is no armor endpoint anymore. Returns shields. */
  getArmor(filter?: LegacyFilter): Promise<Item[]> {
    return this.items.all({ ...fromLegacy(filter), itemType: 'Shield' });
  }
  /** @deprecated There is no armor endpoint anymore. Returns shields. */
  getAllArmor(filter?: LegacyFilter): Promise<Item[]> {
    return this.getArmor(filter);
  }
  /** @deprecated Use `client.quests.all()`. */
  getQuests(): Promise<Quest[]> {
    return this.quests.all();
  }
  /** @deprecated Use `client.quests.all()`. */
  getAllQuests(): Promise<Quest[]> {
    return this.quests.all();
  }
  /** @deprecated Use `client.quests.get(id)`. */
  async getQuestById(id: string): Promise<Quest> {
    return orThrow(await this.quests.get(id), `Quest "${id}"`);
  }
  /** @deprecated Use `client.arcs.all()`. */
  getARCs(): Promise<Arc[]> {
    return this.arcs.all();
  }
  /** @deprecated Use `client.arcs.all()`. */
  getAllARCs(): Promise<Arc[]> {
    return this.arcs.all();
  }
  /** @deprecated Use `client.arcs.get(id)`. */
  async getARCById(id: string): Promise<Arc> {
    return orThrow(await this.arcs.get(id), `ARC "${id}"`);
  }
  /** @deprecated Use `client.traders.inventories()`. */
  getTraders(): Promise<Record<TraderName, TraderItem[]>> {
    return this.traders.inventories();
  }
  /** @deprecated Use `client.traders.get(name)`. */
  async getTraderById(
    name: string
  ): Promise<{ id: string; name: string; inventory: TraderItem[] }> {
    const inventory = orThrow(await this.traders.get(name), `Trader "${name}"`);
    return { id: name, name, inventory };
  }
  /** @deprecated Use `client.maps.list()`. */
  getMaps(): Promise<Array<{ id: MapId; name: string }>> {
    return Promise.resolve(this.maps.list());
  }
  /** @deprecated Use `client.maps.markers(mapId)`. */
  getMapData(mapId: MapId): Promise<MapMarker[]> {
    return this.maps.markers(mapId);
  }
}

export type SearchScope = 'items' | 'quests' | 'arcs';
export type SearchEntity =
  { type: 'item'; data: Item } | { type: 'quest'; data: Quest } | { type: 'arc'; data: Arc };
export type SearchResult = SearchHit<SearchEntity>;

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

class ItemsResource {
  constructor(private readonly client: ArcRaidersClient) {}

  /** One page as returned by the API. */
  list(filter: ItemFilter = {}, options: PageOptions = {}): Promise<Page<Item>> {
    return this.client.fetch<Page<Item>>(
      'items',
      '/arc-raiders/items',
      { ...serverQuery(filter), page: options.page ?? 1, limit: options.pageSize ?? 50 },
      options
    );
  }

  /** Streams every matching item, page by page. */
  async *iterate(
    filter: ItemFilter = {},
    options: CallOptions = {}
  ): AsyncGenerator<Item, void, undefined> {
    const local = localFilter(filter);
    for await (const item of this.client.paginate<Item>(
      'items',
      '/arc-raiders/items',
      serverQuery(filter),
      PAGE_SIZE.items,
      options
    )) {
      if (local(item)) yield item;
    }
  }

  /** Every matching item, de-duplicated. */
  async all(filter: ItemFilter = {}, options: CallOptions = {}): Promise<Item[]> {
    const out: Item[] = [];
    for await (const item of this.iterate(filter, options)) out.push(item);
    return out;
  }

  /** One item by id, `undefined` when it does not exist. */
  async get(id: string, options: CallOptions = {}): Promise<Item | undefined> {
    const res = await this.client.fetch<Page<Item>>('items', '/arc-raiders/items', { id }, options);
    assertPage(res, '/arc-raiders/items');
    return res.data.find((i) => i.id === id);
  }
}

class WeaponsResource {
  constructor(private readonly client: ArcRaidersClient) {}

  async all(filter: WeaponFilter = {}, options: CallOptions = {}): Promise<Weapon[]> {
    const classes = toList(filter.weaponClass).map((c) => c.toLowerCase());
    const items = await this.client.items.all({ ...filter, itemType: 'Weapon' }, options);
    return items.filter(
      (i): i is Weapon =>
        classes.length === 0 || classes.includes((i.subcategory ?? '').toLowerCase())
    );
  }

  async get(id: string, options: CallOptions = {}): Promise<Weapon | undefined> {
    const item = await this.client.items.get(id, options);
    return item?.item_type === 'Weapon' ? (item as Weapon) : undefined;
  }
}

export interface ArcOptions {
  /** Include the loot table of each ARC. */
  includeLoot?: boolean;
}

class ArcsResource {
  constructor(private readonly client: ArcRaidersClient) {}

  list(filter: ArcOptions = {}, options: PageOptions = {}): Promise<Page<Arc>> {
    return this.client.fetch<Page<Arc>>(
      'arcs',
      '/arc-raiders/arcs',
      {
        includeLoot: filter.includeLoot || undefined,
        page: options.page ?? 1,
        limit: options.pageSize ?? 50,
      },
      options
    );
  }

  iterate(
    filter: ArcOptions = {},
    options: CallOptions = {}
  ): AsyncGenerator<Arc, void, undefined> {
    return this.client.paginate<Arc>(
      'arcs',
      '/arc-raiders/arcs',
      { includeLoot: filter.includeLoot || undefined },
      PAGE_SIZE.arcs,
      options
    );
  }

  async all(filter: ArcOptions = {}, options: CallOptions = {}): Promise<Arc[]> {
    const out: Arc[] = [];
    for await (const arc of this.iterate(filter, options)) out.push(arc);
    return out;
  }

  async get(
    id: string,
    filter: ArcOptions = {},
    options: CallOptions = {}
  ): Promise<Arc | undefined> {
    const res = await this.client.fetch<Page<Arc>>(
      'arcs',
      '/arc-raiders/arcs',
      { id, includeLoot: filter.includeLoot || undefined },
      options
    );
    assertPage(res, '/arc-raiders/arcs');
    return res.data.find((a) => a.id === id);
  }
}

class QuestsResource {
  constructor(private readonly client: ArcRaidersClient) {}

  list(options: PageOptions = {}): Promise<Page<Quest>> {
    return this.client.fetch<Page<Quest>>(
      'quests',
      '/arc-raiders/quests',
      { page: options.page ?? 1, limit: Math.min(options.pageSize ?? 50, PAGE_SIZE.quests) },
      options
    );
  }

  iterate(options: CallOptions = {}): AsyncGenerator<Quest, void, undefined> {
    return this.client.paginate<Quest>(
      'quests',
      '/arc-raiders/quests',
      {},
      PAGE_SIZE.quests,
      options
    );
  }

  async all(options: CallOptions = {}): Promise<Quest[]> {
    const out: Quest[] = [];
    for await (const quest of this.iterate(options)) out.push(quest);
    return out;
  }

  async get(id: string, options: CallOptions = {}): Promise<Quest | undefined> {
    try {
      const res = await this.client.fetch<{ data: Quest | null }>(
        'quests',
        '/arc-raiders/quests',
        { id },
        options
      );
      return res?.data ?? undefined;
    } catch (error) {
      if (error instanceof ArcRaidersError && error.code === 'NOT_FOUND') return undefined;
      throw error;
    }
  }

  /** Prerequisite graph over all quests. */
  async graph(options: CallOptions = {}): Promise<QuestGraph> {
    return buildQuestGraph(await this.all(options));
  }

  /** Every quest you need before `id`, in play order, ending with `id`. */
  async chain(id: string, options: CallOptions = {}): Promise<Quest[]> {
    return (await this.graph(options)).chain(id);
  }

  /** Quests you can start now, given the ids you already completed. */
  async available(completed: Iterable<string>, options: CallOptions = {}): Promise<Quest[]> {
    return (await this.graph(options)).available(completed);
  }

  /** Combined item requirements of the given quests. */
  async shoppingList(
    questIds: Iterable<string>,
    options: CallOptions = {}
  ): Promise<ShoppingListEntry[]> {
    const ids = new Set(questIds);
    const quests = (await this.all(options)).filter((q) => ids.has(q.id));
    return questShoppingList(quests);
  }
}

class TradersResource {
  constructor(private readonly client: ArcRaidersClient) {}

  /** Raw response: inventories per trader plus Ermal. */
  async getAll(options: CallOptions = {}): Promise<TradersResponse> {
    const res = await this.client.fetch<TradersResponse>(
      'traders',
      '/arc-raiders/traders',
      {},
      options
    );
    if (!res || typeof res !== 'object' || typeof res.data !== 'object' || res.data === null) {
      throw invalid('/arc-raiders/traders', res);
    }
    return res;
  }

  async inventories(options: CallOptions = {}): Promise<Record<TraderName, TraderItem[]>> {
    return (await this.getAll(options)).data;
  }

  /** Inventory of one trader, name is case-insensitive. */
  async get(name: string, options: CallOptions = {}): Promise<TraderItem[] | undefined> {
    const data = await this.inventories(options);
    const key = Object.keys(data).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? data[key] : undefined;
  }

  /** Ermal's rotating offers and permanent services. */
  async ermal(options: CallOptions = {}): Promise<Ermal | undefined> {
    return (await this.getAll(options)).ermal;
  }

  /** Who sells this item, cheapest first. */
  async whoSells(
    itemId: string,
    options: CallOptions = {}
  ): Promise<Array<{ trader: TraderName; item: TraderItem }>> {
    const data = await this.inventories(options);
    return Object.entries(data)
      .flatMap(([trader, stock]) =>
        stock.filter((i) => i.id === itemId).map((item) => ({ trader, item }))
      )
      .sort((a, b) => (a.item.trader_price ?? Infinity) - (b.item.trader_price ?? Infinity));
  }
}

class EventsResource {
  constructor(private readonly client: ArcRaidersClient) {}

  /** The full rotation as published by MetaForge (roughly the next 24h). */
  async schedule(options: CallOptions = {}): Promise<ScheduledEvent[]> {
    const res = await this.client.fetch<EventsScheduleResponse>(
      'events',
      '/arc-raiders/events-schedule',
      {},
      options
    );
    if (!res || !Array.isArray(res.data)) throw invalid('/arc-raiders/events-schedule', res);
    return res.data;
  }

  /** Events running right now (or at `query.at`). */
  async active(query: EventQuery = {}, options: CallOptions = {}): Promise<ScheduledEvent[]> {
    return activeEvents(await this.schedule(options), query);
  }

  /** Events that start later, soonest first. */
  async upcoming(
    query: EventQuery & { within?: number; limit?: number } = {},
    options: CallOptions = {}
  ): Promise<ScheduledEvent[]> {
    return upcomingEvents(await this.schedule(options), query);
  }

  /** Next (or current) run of an event by name, e.g. `"Night Raid"`. */
  async next(
    name: string,
    query: Omit<EventQuery, 'name'> = {},
    options: CallOptions = {}
  ): Promise<ScheduledEvent | undefined> {
    return nextOccurrence(await this.schedule(options), name, query);
  }
}

export interface MarkerFilter {
  category?: MarkerCategory | readonly MarkerCategory[];
  subcategory?: string | readonly string[];
}

class MapsResource {
  constructor(private readonly client: ArcRaidersClient) {}

  list(): Array<{ id: MapId; name: string }> {
    return MAPS.map((m) => ({ ...m }));
  }

  /** Every marker (containers, ARCs, quest spots, ...) on a map. */
  async markers(
    mapId: MapId,
    filter: MarkerFilter = {},
    options: CallOptions = {}
  ): Promise<MapMarker[]> {
    const res = await this.client.fetch<{ allData: MapMarker[] }>(
      'maps',
      '/game-map-data',
      { mapID: mapId, tableID: 'arc_map_data' },
      options
    );
    if (!res || !Array.isArray(res.allData)) throw invalid('/game-map-data', res);
    const categories = toList(filter.category);
    const subs = toList(filter.subcategory);
    return res.allData.filter(
      (m) =>
        (categories.length === 0 || categories.includes(m.category)) &&
        (subs.length === 0 || subs.includes(m.subcategory))
    );
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function serverQuery(filter: ItemFilter): Query {
  const rarities = toList(filter.rarity).map(normalizeRarity);
  const types = toList(filter.itemType).map(normalizeItemType);
  return {
    rarity: rarities.length === 1 ? rarities[0] : undefined,
    item_type: types.length === 1 ? types[0] : undefined,
    search: filter.search?.trim() || undefined,
  };
}

function localFilter(filter: ItemFilter): (item: Item) => boolean {
  const rarities = toList(filter.rarity).map(normalizeRarity);
  const types = toList(filter.itemType).map(normalizeItemType);
  return (item) =>
    (rarities.length <= 1 || rarities.includes(item.rarity ?? '')) &&
    (types.length <= 1 || types.includes(item.item_type));
}

function assertPage(res: unknown, path: string): asserts res is Page<unknown> {
  if (!res || typeof res !== 'object' || !Array.isArray((res as Page<unknown>).data)) {
    throw invalid(path, res);
  }
}

function invalid(path: string, body: unknown): ArcRaidersError {
  return new ArcRaidersError(`Unexpected response shape from ${path}. The API may have changed.`, {
    code: 'INVALID_RESPONSE',
    url: path,
    body,
  });
}

function orThrow<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new ArcRaidersError(`${what} not found`, { code: 'NOT_FOUND', url: '', status: 404 });
  }
  return value;
}

/** v1 filter shape. */
export interface LegacyFilter {
  rarity?: string | string[];
  type?: string | string[];
  search?: string;
  [extra: string]: unknown;
}

function fromLegacy(filter: LegacyFilter = {}): ItemFilter {
  return { rarity: filter.rarity, itemType: filter.type, search: filter.search };
}

export function createArcRaidersClient(options?: ArcRaidersClientOptions): ArcRaidersClient {
  return new ArcRaidersClient(options);
}
