import type { ItemType, Rarity } from './types';

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Amplified'];

const ITEM_TYPES = [
  'Weapon',
  'Recyclable',
  'Furniture',
  'Design',
  'Trinket',
  'Blueprint',
  'Outfits',
  'Quick Use',
  'Topside Material',
  'Key',
  'Modification',
  'Cosmetic',
  'Augment',
  'Research',
  'Stencil',
  'Nature',
  'Refined Material',
  'Basic Material',
  'Misc',
  'Ammunition',
  'Research Item',
  'Shield',
  'Quest Item',
  'Material',
];

function canonical(known: string[], value: string): string {
  const needle = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
  return known.find((k) => k.toLowerCase() === needle) ?? value.trim();
}

/** The API filters rarity case-sensitively, so `"epic"` would match nothing. */
export function normalizeRarity(value: string): Rarity {
  return canonical(RARITIES, value);
}

/** Accepts `"quick_use"`, `"quick use"` or `"Quick Use"`. */
export function normalizeItemType(value: string): ItemType {
  return canonical(ITEM_TYPES, value);
}

export function toList<T>(value: T | readonly T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value as T];
}
