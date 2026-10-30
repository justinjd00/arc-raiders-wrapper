import { describe, expect, it } from 'vitest';
import {
  activeEvents,
  buildQuestGraph,
  countBy,
  createSearchIndex,
  editDistance,
  mapSlug,
  msUntil,
  nextOccurrence,
  rankByStat,
  statSummary,
  summarize,
  toCSV,
  tokenize,
  upcomingEvents,
  valuePerWeight,
  type Item,
  type Quest,
} from '../src';
import { events, fixtures, NOW } from './helpers';

const quest = (id: string, prereqs: string[] = []): Quest =>
  ({
    id,
    name: id.toUpperCase(),
    manifest: {
      prerequisites: prereqs.map((p) => ({ quest_id: p, name: p, required_state: 'COMPLETED' })),
      objective_graph: [],
    },
    required_items: [],
    rewards: [],
    granted_items: [],
  }) as unknown as Quest;

describe('quest graph', () => {
  const graph = buildQuestGraph([
    quest('a'),
    quest('b', ['a']),
    quest('c', ['a']),
    quest('d', ['b', 'c']),
  ]);

  it('orders a diamond correctly and lists each quest once', () => {
    const ids = graph.chain('d').map((q) => q.id);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe('a');
    expect(ids.at(-1)).toBe('d');
  });

  it('knows what a quest unlocks and what is available', () => {
    expect(graph.unlocks('a').sort()).toEqual(['b', 'c']);
    expect(graph.available([]).map((q) => q.id)).toEqual(['a']);
    expect(graph.available(['a', 'b']).map((q) => q.id)).toEqual(['c']);
  });

  it('survives cycles and missing quests', () => {
    const cyclic = buildQuestGraph([quest('x', ['y']), quest('y', ['x']), quest('z', ['ghost'])]);
    expect(
      cyclic
        .chain('x')
        .map((q) => q.id)
        .sort()
    ).toEqual(['x', 'y']);
    expect(cyclic.chain('z').map((q) => q.id)).toEqual(['z']);
  });

  it('handles very long chains without recursion limits', () => {
    const long = Array.from({ length: 20_000 }, (_, i) => quest(`q${i}`, i ? [`q${i - 1}`] : []));
    expect(buildQuestGraph(long).chain('q19999')).toHaveLength(20_000);
  });

  it('works on real quest data', () => {
    const real = buildQuestGraph(fixtures.quests);
    expect(real.prerequisitesOf('off-the-raider')).toEqual([
      'clearer-skies',
      'trash-into-treasure',
    ]);
  });
});

describe('search', () => {
  const index = createSearchIndex(
    fixtures.items.map((i) => ({ id: i.id, name: i.name, keywords: [i.item_type], value: i }))
  );

  it('maps numbers to roman numerals', () => {
    expect(tokenize('Ferro 2')).toEqual(['ferro', 'ii']);
    expect(index.search('ferro 3')[0]?.id).toBe('ferro-iii');
  });

  it('forgives typos', () => {
    expect(index.search('matriach')[0]?.id).toBe('matriarch-reactor');
    expect(index.search('acustic guitar')[0]?.id).toBe('acoustic-guitar');
  });

  it('ranks exact over prefix over fuzzy', () => {
    const hits = index.search('ferro i');
    expect(hits[0]?.id).toBe('ferro-i');
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it('returns nothing for empty queries or nonsense', () => {
    expect(index.search('   ')).toEqual([]);
    expect(index.search('zzzzqqq')).toEqual([]);
  });

  it('computes Damerau-Levenshtein distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('ab', 'ba')).toBe(1);
    expect(editDistance('abcdef', 'zzzzzz', 2)).toBe(3);
  });
});

describe('analytics', () => {
  it('summarizes numbers', () => {
    expect(summarize([3, 1, 2, Number.NaN])).toEqual({
      count: 3,
      min: 1,
      max: 3,
      mean: 2,
      median: 2,
      sum: 6,
    });
    expect(summarize([]).count).toBe(0);
  });

  const weapons = fixtures.items.filter((i) => i.item_type === 'Weapon');

  it('ranks by stat and skips zero values', () => {
    const ranked = rankByStat(weapons, 'damage', { limit: 2 });
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.value).toBeGreaterThanOrEqual(ranked[1]!.value);
    expect(statSummary(weapons, 'damage').count).toBeGreaterThan(0);
  });

  it('computes value per weight', () => {
    const items = [
      { id: 'a', name: 'A', value: 100, stat_block: { weight: 2 } },
      { id: 'b', name: 'B', value: 300, stat_block: { weight: 1 } },
      { id: 'c', name: 'C', value: 50, stat_block: {} },
    ] as unknown as Item[];
    expect(valuePerWeight(items).map((r) => [r.item.id, r.value])).toEqual([
      ['b', 300],
      ['a', 50],
    ]);
  });

  it('counts by key', () => {
    expect(countBy([{ r: 'x' }, { r: 'x' }, { r: null }], (e) => e.r)).toEqual({
      x: 2,
      Unknown: 1,
    });
  });
});

describe('events helpers', () => {
  it('finds active, upcoming and next events', () => {
    expect(activeEvents(events, { at: NOW, map: 'DAM' }).map((e) => e.name)).toEqual(['Matriarch']);
    // Map ids work too.
    expect(upcomingEvents(events, { at: NOW, map: 'buried-city' }).map((e) => e.name)).toEqual([
      'Hurricane',
    ]);
    expect(mapSlug(' Riven Tides ')).toBe('riven-tides');
    expect(upcomingEvents(events, { at: NOW, within: 2 * 3_600_000 }).map((e) => e.name)).toEqual([
      'Hurricane',
    ]);
    expect(upcomingEvents(events, { at: NOW, limit: 1 })).toHaveLength(1);
    const next = nextOccurrence(events, 'Hurricane', { at: NOW })!;
    expect(msUntil(next, NOW)).toBe(3_600_000);
    expect(msUntil(events[0]!, NOW)).toBe(0);
  });
});

describe('CSV', () => {
  it('quotes, escapes and protects against formula injection', () => {
    const csv = toCSV([
      { name: 'Ferro, I', note: 'say "hi"', formula: '=SUM(A1)', tags: ['a', 'b'] },
      { name: 'Line\nbreak', note: null, formula: '+1', tags: [] },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'name,note,formula,tags',
      '"Ferro, I","say ""hi""",\'=SUM(A1),"[""a"",""b""]"',
      '"Line\nbreak",,\'+1,[]',
    ]);
  });

  it('supports columns and a custom delimiter', () => {
    const csv = toCSV(fixtures.items.slice(0, 1), {
      delimiter: ';',
      columns: ['id', { header: 'dmg', value: (i) => i.stat_block?.damage }],
    });
    expect(csv).toBe('id;dmg\r\nferro-i;40');
  });
});
