import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { Arc, Item, Quest, ScheduledEvent, TradersResponse } from '../src';
import { ArcRaidersClient, type ArcRaidersClientOptions } from '../src';

// Resolved from the project root so it also works in the jsdom environment.
const load = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'test', 'fixtures', `${name}.json`), 'utf8')) as T;

export const fixtures = {
  items: load<Item[]>('items'),
  quests: load<Quest[]>('quests'),
  arcs: load<Arc[]>('arcs'),
  traders: load<TradersResponse>('traders'),
};

export const NOW = Date.UTC(2026, 9, 30, 20, 0, 0);
const H = 3_600_000;
export const events: ScheduledEvent[] = [
  {
    name: 'Night Raid',
    map: 'Stella Montis',
    icon: '',
    startTime: NOW - H / 2,
    endTime: NOW + H / 2,
  },
  { name: 'Matriarch', map: 'Dam', icon: '', startTime: NOW - H, endTime: NOW + 10 * 60_000 },
  { name: 'Hurricane', map: 'Buried City', icon: '', startTime: NOW + H, endTime: NOW + 2 * H },
  {
    name: 'Night Raid',
    map: 'Stella Montis',
    icon: '',
    startTime: NOW + 3 * H,
    endTime: NOW + 4 * H,
  },
  {
    name: 'Husk Graveyard',
    map: 'Buried City',
    icon: '',
    startTime: NOW - 3 * H,
    endTime: NOW - 2 * H,
  },
];

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

export function page<T>(data: T[], p: number, limit: number): Record<string, unknown> {
  const slice = data.slice((p - 1) * limit, p * limit);
  const totalPages = Math.ceil(data.length / limit);
  return {
    data: slice,
    pagination: {
      page: p,
      limit,
      total: data.length,
      totalPages,
      hasNextPage: p < totalPages,
      hasPrevPage: p > 1,
    },
  };
}

/** A fetch that serves the fixtures roughly like MetaForge does. */
export function fakeApi() {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    const q = url.searchParams;
    const p = Number(q.get('page') ?? 1);
    const limit = Number(q.get('limit') ?? 50);

    switch (url.pathname) {
      case '/api/arc-raiders/items': {
        let data = fixtures.items;
        if (q.get('id')) data = data.filter((i) => i.id === q.get('id'));
        if (q.get('rarity')) data = data.filter((i) => i.rarity === q.get('rarity'));
        if (q.get('item_type')) data = data.filter((i) => i.item_type === q.get('item_type'));
        if (q.get('search'))
          data = data.filter((i) => i.name.toLowerCase().includes(q.get('search')!.toLowerCase()));
        return json(page(data, p, limit));
      }
      case '/api/arc-raiders/arcs': {
        let data = fixtures.arcs.map((a) =>
          q.get('includeLoot') === 'true' ? a : { ...a, loot: undefined }
        );
        if (q.get('id')) data = data.filter((a) => a.id === q.get('id'));
        return json(page(data, p, limit));
      }
      case '/api/arc-raiders/quests': {
        if (q.get('id')) {
          const quest = fixtures.quests.find((x) => x.id === q.get('id'));
          return quest
            ? json({ data: quest })
            : json({ error: 'Quest not found' }, { status: 404 });
        }
        return json(page(fixtures.quests, p, Math.min(limit, 100)));
      }
      case '/api/arc-raiders/traders':
        return json(fixtures.traders);
      case '/api/arc-raiders/events-schedule':
        return json({ data: events, cachedAt: NOW, region: 'europe' });
      case '/api/game-map-data':
        return json({
          allData: [
            {
              id: 'm1',
              mapID: q.get('mapID'),
              lat: 1,
              lng: 2,
              category: 'containers',
              subcategory: 'base_container',
              instanceName: 'Crate',
            },
            {
              id: 'm2',
              mapID: q.get('mapID'),
              lat: 3,
              lng: 4,
              category: 'arc',
              subcategory: 'wasp',
              instanceName: null,
            },
          ],
        });
      default:
        return new Response('Not found', { status: 404 });
    }
  });
}

export function testClient(options: ArcRaidersClientOptions = {}) {
  const fetch = fakeApi();
  const client = new ArcRaidersClient({
    fetch,
    retry: { retries: 2, minDelay: 0, maxDelay: 50 },
    ...options,
  });
  return { client, fetch };
}

/** Paths (with query) the fake fetch was called with. */
export const calls = (fetch: ReturnType<typeof fakeApi>) =>
  fetch.mock.calls.map(([u]) => {
    const url = new URL(u);
    return url.pathname + url.search;
  });
