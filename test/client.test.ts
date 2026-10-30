import { describe, expect, it, vi } from 'vitest';
import { ArcRaidersClient, ATTRIBUTION, MAPS } from '../src';
import { calls, fixtures, json, NOW, testClient } from './helpers';

describe('items', () => {
  it('fetches all pages with a stable page size', async () => {
    const { client, fetch } = testClient();
    const items = await client.items.all();
    expect(items).toHaveLength(fixtures.items.length);
    expect(calls(fetch)[0]).toBe('/api/arc-raiders/items?page=1&limit=500');
  });

  it('de-duplicates items when the API repeats them across pages', async () => {
    // MetaForge sorts non-deterministically, so pages overlap.
    const [a, b, c] = fixtures.items;
    const pages = [
      {
        data: [a, b],
        pagination: {
          page: 1,
          limit: 2,
          total: 3,
          totalPages: 2,
          hasNextPage: true,
          hasPrevPage: false,
        },
      },
      {
        data: [b, c],
        pagination: {
          page: 2,
          limit: 2,
          total: 3,
          totalPages: 2,
          hasNextPage: false,
          hasPrevPage: true,
        },
      },
    ];
    const fetch = vi.fn(async () => json(pages.shift()));
    const client = new ArcRaidersClient({ fetch, cache: false });
    expect((await client.items.all()).map((i) => i.id)).toEqual([a!.id, b!.id, c!.id]);
  });

  it('normalizes rarity and item type casing', async () => {
    const { client, fetch } = testClient();
    const epic = await client.items.all({ rarity: 'legendary', itemType: 'quick_use' });
    expect(calls(fetch)[0]).toContain('rarity=Legendary');
    expect(calls(fetch)[0]).toContain('item_type=Quick+Use');
    expect(epic.map((i) => i.id)).toEqual(['acoustic-guitar']);
  });

  it('filters multiple rarities locally since the API takes only one', async () => {
    const { client, fetch } = testClient();
    const items = await client.items.all({ rarity: ['Epic', 'amplified'] });
    expect(calls(fetch)[0]).not.toContain('rarity=');
    expect(new Set(items.map((i) => i.rarity))).toEqual(new Set(['Epic', 'Amplified']));
  });

  it('streams with iterate()', async () => {
    const { client } = testClient();
    const names: string[] = [];
    for await (const item of client.items.iterate({ search: 'ferro' })) names.push(item.name);
    expect(names).toEqual(['Ferro I', 'Ferro II', 'Ferro III']);
  });

  it('returns a single page with list()', async () => {
    const { client } = testClient();
    const page = await client.items.list({}, { page: 2, pageSize: 5 });
    expect(page.data).toHaveLength(5);
    expect(page.pagination).toMatchObject({ page: 2, hasNextPage: true });
  });

  it('gets one item or undefined', async () => {
    const { client } = testClient();
    expect((await client.items.get('ferro-i'))?.name).toBe('Ferro I');
    expect(await client.items.get('does-not-exist')).toBeUndefined();
  });
});

describe('weapons', () => {
  it('filters by weapon class', async () => {
    const { client } = testClient();
    const smgs = await client.weapons.all({ weaponClass: 'smg' });
    expect(smgs.length).toBeGreaterThan(0);
    expect(smgs.every((w) => w.subcategory === 'SMG')).toBe(true);
  });

  it('get() only returns weapons', async () => {
    const { client } = testClient();
    expect((await client.weapons.get('ferro-ii'))?.name).toBe('Ferro II');
    expect(await client.weapons.get('metal-parts')).toBeUndefined();
  });
});

describe('quests', () => {
  it('lists and gets quests, 404 becomes undefined', async () => {
    const { client } = testClient();
    expect(await client.quests.all()).toHaveLength(fixtures.quests.length);
    expect((await client.quests.get('a-bad-feeling'))?.trader_name).toBe('Celeste');
    expect(await client.quests.get('nope')).toBeUndefined();
  });

  it('resolves the prerequisite chain in play order', async () => {
    const { client } = testClient();
    const chain = (await client.quests.chain('a-bad-feeling')).map((q) => q.id);
    expect(chain.at(-1)).toBe('a-bad-feeling');
    expect(chain.indexOf('picking-up-the-pieces')).toBeLessThan(chain.indexOf('clearer-skies'));
    expect(chain.indexOf('clearer-skies')).toBeLessThan(chain.indexOf('off-the-raider'));
  });

  it('builds a shopping list for several quests', async () => {
    const { client } = testClient();
    const list = await client.quests.shoppingList(['after-rain-comes', 'clamoring-for-attention']);
    const battery = list.find((e) => e.item.id === 'battery');
    expect(battery?.neededFor).toHaveLength(2);
    expect(battery?.quantity).toBe(battery!.neededFor.reduce((s, n) => s + n.quantity, 0));
  });
});

describe('arcs', () => {
  it('only asks for loot when requested', async () => {
    const { client, fetch } = testClient();
    expect((await client.arcs.all())[0]!.loot).toBeUndefined();
    const withLoot = await client.arcs.get('bastion', { includeLoot: true });
    expect(withLoot?.loot?.length).toBeGreaterThan(0);
    expect(calls(fetch)[1]).toContain('includeLoot=true');
  });
});

describe('traders', () => {
  it('looks up traders case-insensitively', async () => {
    const { client } = testClient();
    expect(await client.traders.get('celeste')).toEqual(fixtures.traders.data.Celeste);
    expect(await client.traders.get('nobody')).toBeUndefined();
  });

  it('finds who sells an item', async () => {
    const { client } = testClient();
    const sellers = await client.traders.whoSells('battery');
    expect(sellers[0]?.trader).toBe('Celeste');
  });

  it('exposes Ermal', async () => {
    const { client } = testClient();
    const ermal = await client.traders.ermal();
    expect(ermal?.offers.length).toBeGreaterThan(0);
    expect(ermal?.permanent_services.length).toBeGreaterThan(0);
  });
});

describe('events', () => {
  it('splits the schedule into active and upcoming', async () => {
    const { client } = testClient();
    const active = await client.events.active({ at: NOW });
    expect(active.map((e) => e.name)).toEqual(['Matriarch', 'Night Raid']); // ends soonest first
    const upcoming = await client.events.upcoming({ at: NOW, map: 'buried city' });
    expect(upcoming.map((e) => e.name)).toEqual(['Hurricane']);
    expect((await client.events.next('night raid', { at: NOW }))?.startTime).toBeLessThan(NOW);
  });
});

describe('maps', () => {
  it('lists maps without a request and filters markers', async () => {
    const { client, fetch } = testClient();
    expect(client.maps.list()).toEqual(MAPS);
    expect(fetch).not.toHaveBeenCalled();
    const markers = await client.maps.markers('dam', { category: 'arc' });
    expect(markers.map((m) => m.id)).toEqual(['m2']);
    expect(calls(fetch)[0]).toBe('/api/game-map-data?mapID=dam&tableID=arc_map_data');
  });
});

describe('cross-cutting', () => {
  it('searches across items, quests and ARCs', async () => {
    const { client } = testClient();
    const hits = await client.search('ferro 2');
    expect(hits[0]).toMatchObject({ id: 'ferro-ii', value: { type: 'item' } });
    const arcHits = await client.search('bastoin', { in: ['arcs'] });
    expect(arcHits[0]?.id).toBe('bastion');
  });

  it('tells you whether to keep an item', async () => {
    const { client } = testClient();
    const reactor = await client.itemUsage('matriarch-reactor');
    expect(reactor.keep).toBe(true);
    expect(reactor.acceptedByErmal.length).toBeGreaterThan(0);
    expect(reactor.droppedBy.map((a) => a.id)).toContain('matriarch');

    const guitar = await client.itemUsage('acoustic-guitar');
    expect(guitar.keep).toBe(false);
  });

  it('throws INVALID_RESPONSE when the API shape changes', async () => {
    const client = new ArcRaidersClient({ fetch: async () => json({ items: [] }), cache: false });
    await expect(client.items.all()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('exports MetaForge attribution', () => {
    expect(ATTRIBUTION.url).toBe('https://metaforge.app/arc-raiders');
  });
});

describe('v1 compatibility', () => {
  it('accepts the old base URL', () => {
    expect(
      new ArcRaidersClient({ baseURL: 'https://metaforge.app/api/arc-raiders/' }).http.baseURL
    ).toBe('https://metaforge.app/api');
  });

  it('keeps the old methods working', async () => {
    const { client } = testClient();
    expect(await client.getItems({ rarity: 'legendary' })).toHaveLength(4);
    expect((await client.getItemById('ferro-i')).name).toBe('Ferro I');
    await expect(client.getItemById('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await client.getArmor()).every((i) => i.item_type === 'Shield')).toBe(true);
    expect((await client.getTraderById('apollo')).inventory.length).toBeGreaterThan(0);
    expect(await client.getMaps()).toHaveLength(MAPS.length);
    expect(Object.keys(await client.getTraders())).toContain('Lance');
  });
});
