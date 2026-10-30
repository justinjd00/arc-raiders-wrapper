import type { Item } from '../arc-raiders/types';

export interface Summary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  sum: number;
}

export function summarize(values: readonly number[]): Summary {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return { count: 0, min: 0, max: 0, mean: 0, median: 0, sum: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: Math.round((sum / sorted.length) * 100) / 100,
    median,
    sum,
  };
}

/** Reads a numeric stat from `stat_block`, `undefined` when missing or 0. */
export function statOf(item: Item, stat: string): number | undefined {
  const value = item.stat_block?.[stat];
  return typeof value === 'number' && value !== 0 ? value : undefined;
}

/** Summary of one stat over all items that actually have it. */
export function statSummary(items: readonly Item[], stat: string): Summary {
  return summarize(items.map((i) => statOf(i, stat)).filter((v): v is number => v !== undefined));
}

export interface RankOptions {
  /** `"desc"` (default) puts the highest value first. */
  order?: 'asc' | 'desc';
  limit?: number;
}

/** Items that have `stat`, sorted by it. */
export function rankByStat<T extends Item>(
  items: readonly T[],
  stat: string,
  options: RankOptions = {}
): Array<{ item: T; value: number }> {
  const dir = options.order === 'asc' ? 1 : -1;
  const ranked = items
    .map((item) => ({ item, value: statOf(item, stat) }))
    .filter((r): r is { item: T; value: number } => r.value !== undefined)
    .sort((a, b) => (a.value - b.value) * dir || a.item.name.localeCompare(b.item.name));
  return options.limit !== undefined ? ranked.slice(0, options.limit) : ranked;
}

/**
 * Coins per weight unit. The number that tells you what is worth carrying
 * out of a raid when your backpack is full.
 */
export function valuePerWeight<T extends Item>(
  items: readonly T[],
  options: RankOptions = {}
): Array<{ item: T; value: number }> {
  const dir = options.order === 'asc' ? 1 : -1;
  const ranked = items
    .map((item) => {
      const weight = statOf(item, 'weight');
      return {
        item,
        value: item.value && weight ? Math.round((item.value / weight) * 100) / 100 : undefined,
      };
    })
    .filter((r): r is { item: T; value: number } => r.value !== undefined)
    .sort((a, b) => (a.value - b.value) * dir || a.item.name.localeCompare(b.item.name));
  return options.limit !== undefined ? ranked.slice(0, options.limit) : ranked;
}

/** Count per key. Items without a value land under `"Unknown"`. */
export function countBy<T>(
  list: readonly T[],
  key: (entry: T) => string | null | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of list) {
    const k = key(entry) || 'Unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export const rarityDistribution = (items: readonly Item[]) => countBy(items, (i) => i.rarity);
export const typeDistribution = (items: readonly Item[]) => countBy(items, (i) => i.item_type);
