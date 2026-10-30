/**
 * Contract tests against the live MetaForge API. MetaForge says endpoints
 * may change without notice, so CI runs these weekly to catch drift early.
 *
 *   npm run test:contract
 */
import { describe, expect, it } from 'vitest';
import { ArcRaidersClient, MAPS } from '../src';

const client = new ArcRaidersClient({ cache: { ttl: 10 * 60_000 } });

describe('MetaForge API contract', () => {
  it('items: shape, filters and complete de-duplicated pagination', async () => {
    const first = await client.items.list({}, { pageSize: 1 });
    const total = first.pagination.total;
    expect(total).toBeGreaterThan(500);

    const all = await client.items.all();
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    // Page-size workaround for the unstable server sort must still hold.
    expect(all.length).toBe(total);

    const item = all.find((i) => i.id === 'ferro-i') ?? all[0]!;
    expect(item).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      item_type: expect.any(String),
    });
    expect(typeof item.stat_block).toBe('object');

    const legendary = await client.items.all({ rarity: 'legendary' });
    expect(legendary.length).toBeGreaterThan(0);
    expect(legendary.every((i) => i.rarity === 'Legendary')).toBe(true);

    const weapons = await client.weapons.all();
    expect(weapons.length).toBeGreaterThan(0);
    expect(weapons.every((w) => w.item_type === 'Weapon')).toBe(true);
  });

  it('items: lookup by id', async () => {
    expect((await client.items.get('ferro-i'))?.name).toBe('Ferro I');
    expect(await client.items.get('definitely-not-an-item')).toBeUndefined();
  });

  it('quests: shape, prerequisites and lookup', async () => {
    const quests = await client.quests.all();
    expect(quests.length).toBeGreaterThan(50);
    const withPrereq = quests.find((q) => (q.manifest?.prerequisites.length ?? 0) > 0);
    expect(withPrereq).toBeDefined();
    expect(withPrereq!.manifest!.prerequisites[0]).toMatchObject({ quest_id: expect.any(String) });
    const one = await client.quests.get(quests[0]!.id);
    expect(one?.id).toBe(quests[0]!.id);
    expect(await client.quests.get('definitely-not-a-quest')).toBeUndefined();
  });

  it('arcs: loot is included on request', async () => {
    const arcs = await client.arcs.all({ includeLoot: true });
    expect(arcs.length).toBeGreaterThan(10);
    expect(arcs.some((a) => (a.loot?.length ?? 0) > 0)).toBe(true);
    expect(arcs[0]!.loot?.[0]).toMatchObject({
      item_id: expect.any(String),
      item: { id: expect.any(String) },
    });
  });

  it('traders: inventories and Ermal', async () => {
    const res = await client.traders.getAll();
    expect(Object.keys(res.data).length).toBeGreaterThan(2);
    const stock = Object.values(res.data)[0]!;
    expect(stock[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });
    if (res.ermal) expect(Array.isArray(res.ermal.offers)).toBe(true);
  });

  it('events: schedule has epoch timestamps', async () => {
    const events = await client.events.schedule();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.endTime).toBeGreaterThan(events[0]!.startTime);
    expect(events[0]!.startTime).toBeGreaterThan(Date.UTC(2025, 0, 1));
  });

  it('maps: every known map has markers', async () => {
    for (const map of MAPS) {
      const markers = await client.maps.markers(map.id);
      expect(markers.length, map.id).toBeGreaterThan(100);
      expect(markers[0]).toMatchObject({
        lat: expect.any(Number),
        lng: expect.any(Number),
        category: expect.any(String),
      });
    }
  });
});
