/**
 * Types for the MetaForge ARC Raiders API.
 *
 * These are modeled on real responses from https://metaforge.app/api/arc-raiders.
 * MetaForge adds fields over time, so every object is open for extension and
 * almost every field is nullable. Known string unions are kept open with
 * `(string & {})` so new values from the API never break your build.
 */

/** Keeps autocomplete for known values while still accepting new ones. */
export type OpenUnion<T extends string> = T | (string & {});

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type Rarity = OpenUnion<'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Amplified'>;

export type ItemType = OpenUnion<
  | 'Weapon'
  | 'Recyclable'
  | 'Furniture'
  | 'Design'
  | 'Trinket'
  | 'Blueprint'
  | 'Outfits'
  | 'Quick Use'
  | 'Topside Material'
  | 'Key'
  | 'Modification'
  | 'Cosmetic'
  | 'Augment'
  | 'Research'
  | 'Stencil'
  | 'Nature'
  | 'Refined Material'
  | 'Basic Material'
  | 'Misc'
  | 'Ammunition'
  | 'Research Item'
  | 'Shield'
  | 'Quest Item'
  | 'Material'
>;

export type WeaponClass = OpenUnion<
  | 'Assault Rifle'
  | 'Battle Rifle'
  | 'Special'
  | 'Pistol'
  | 'Sniper Rifle'
  | 'SMG'
  | 'Shotgun'
  | 'Hand Cannon'
  | 'LMG'
>;

/** Map ids as used by `locations[].map` and the map-data endpoint. */
export type MapId = OpenUnion<
  | 'dam'
  | 'spaceport'
  | 'buried-city'
  | 'blue-gate'
  | 'stella-montis'
  | 'riven-tides'
  | 'pendola-pass'
>;

export type TraderName = OpenUnion<'Apollo' | 'Celeste' | 'Lance' | 'Shani' | 'TianWen' | 'Cassio'>;

export interface GuideLink {
  url: string;
  label: string;
}

/** Compact item reference embedded in quests, ARC loot and trader offers. */
export interface ItemRef {
  id: string;
  name: string;
  icon?: string | null;
  rarity?: Rarity | null;
  item_type?: ItemType | null;
  value?: number | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** One page of a paginated endpoint. */
export interface Page<T> {
  data: T[];
  pagination: Pagination;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Item stats. MetaForge ships ~90 keys here and most are 0 for items they do
 * not apply to. The common ones are typed, everything else is still reachable.
 */
export interface StatBlock {
  damage?: number | null;
  fireRate?: number;
  range?: number;
  stability?: number;
  agility?: number;
  stealth?: number | null;
  magazineSize?: number;
  weight?: number;
  stackSize?: number;
  health?: number;
  shield?: number;
  healing?: number;
  stamina?: number;
  useTime?: number;
  duration?: number;
  ammo?: string;
  firingMode?: string;
  arcArmorPenetration?: string;
  backpackSlots?: number;
  quickUseSlots?: number;
  safePocketSlots?: number;
  weightLimit?: number;
  damageMitigation?: number;
  [stat: string]: number | string | null | undefined;
}

export interface CosmeticInfo {
  kind: string;
  slot: string;
  settings?: Array<{ name: string; options: Array<{ name: string }> }>;
}

export interface Item {
  id: string;
  name: string;
  description: string | null;
  flavor_text?: string | null;
  item_type: ItemType;
  subcategory?: string | null;
  rarity: Rarity | null;
  /** Sell value in coins. */
  value: number | null;
  icon: string;
  workbench?: string | null;
  loadout_slots?: string[];
  stat_block?: StatBlock;
  ammo_type?: string | null;
  shield_type?: string | null;
  /** Comma separated loot areas, e.g. "ARC, Electrical". */
  loot_area?: string | null;
  sources?: unknown[] | null;
  locations?: Array<{ id: string; map: MapId }>;
  guide_links?: GuideLink[];
  guide_url?: string | null;
  article?: string | null;
  cosmetic?: CosmeticInfo | null;
  unlocks_weapon?: boolean;
  created_at: string;
  updated_at: string;
  [extra: string]: unknown;
}

/** An item whose `item_type` is `"Weapon"`. */
export interface Weapon extends Item {
  item_type: 'Weapon';
  subcategory?: WeaponClass | null;
}

export interface ItemFilter {
  /**
   * One or more rarities. Case is normalized for you (`"epic"` becomes `"Epic"`).
   * The API only filters by a single rarity, so lists are filtered locally.
   */
  rarity?: Rarity | readonly Rarity[];
  /** One or more item types, e.g. `"Weapon"` or `["Key", "Trinket"]`. */
  itemType?: ItemType | readonly ItemType[];
  /** Server side name search. */
  search?: string;
}

export interface WeaponFilter extends Omit<ItemFilter, 'itemType'> {
  /** Weapon class(es) such as `"Shotgun"` or `["SMG", "Pistol"]`. */
  weaponClass?: WeaponClass | readonly WeaponClass[];
}

// ---------------------------------------------------------------------------
// ARCs
// ---------------------------------------------------------------------------

export interface ArcLoot {
  id: string;
  item_id: string;
  item: ItemRef;
  created_at?: string;
}

export interface Arc {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  image?: string | null;
  guide_url?: string | null;
  /** Only present when requested with `includeLoot: true`. */
  loot?: ArcLoot[];
  created_at: string;
  updated_at: string;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export interface QuestItemEntry {
  id: number;
  item_id: string;
  quantity: number;
  item: ItemRef;
}

export interface QuestExtraReward {
  kind: OpenUnion<'currency' | 'item'>;
  name: string;
  quantity: number;
}

export interface QuestPrerequisite {
  quest_id: string;
  name: string;
  required_state: OpenUnion<'COMPLETED' | 'ACCEPTED'>;
}

export interface QuestObjectiveNode {
  id: string;
  kind: OpenUnion<'ATOMIC' | 'ALL' | 'ANY' | 'SEQUENCE'>;
  description: string;
  hidden: boolean;
  optional: boolean;
  required_count: number;
  round_constraint?: string;
  children: string[];
  action?: { type: string; amount?: number; [extra: string]: unknown };
  [extra: string]: unknown;
}

export interface QuestManifest {
  updated_at?: string;
  cadence?: OpenUnion<'NARRATIVE' | 'DAILY' | 'WEEKLY'>;
  prerequisites: QuestPrerequisite[];
  conditions?: unknown[];
  objective_graph: QuestObjectiveNode[];
  objective_root?: string;
  [extra: string]: unknown;
}

export interface Quest {
  id: string;
  name: string;
  description: string | null;
  trader_name: TraderName;
  /** Plain text objectives. The structured version lives in `manifest.objective_graph`. */
  objectives: string[];
  xp: number;
  required_items: QuestItemEntry[];
  rewards: QuestItemEntry[];
  granted_items: QuestItemEntry[];
  additional_rewards?: QuestExtraReward[];
  additional_granted_items?: QuestItemEntry[];
  locations: Array<{ x: number; y: number; map: MapId }>;
  image?: string | null;
  guide_url?: string | null;
  guide_links?: GuideLink[];
  marker_category?: string | null;
  sort_order?: number;
  position?: { x: number; y: number } | null;
  manifest?: QuestManifest | null;
  created_at: string;
  updated_at: string;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Traders
// ---------------------------------------------------------------------------

export interface TraderItem extends ItemRef {
  description?: string | null;
  /** Buy price at this trader, `null` if not for sale. */
  trader_price: number | null;
}

export interface ErmalAcceptedItem extends ItemRef {
  /** How many Ermal wants. Missing for permanent services. */
  amount?: number;
  /** `true` when the entry stands for a whole category, e.g. "any firearm". */
  is_category?: boolean;
}

export interface ErmalOffer {
  id: string;
  offer_title: string;
  coin_cost: number;
  offer_start: string;
  offer_end: string;
  accepted_items: ErmalAcceptedItem[];
  [extra: string]: unknown;
}

export interface ErmalService {
  id: string;
  name: string;
  description: string;
  coin_cost: number;
  accepted_items: ErmalAcceptedItem[];
  [extra: string]: unknown;
}

export interface Ermal {
  offers: ErmalOffer[];
  permanent_services: ErmalService[];
  synced_at: string;
}

export interface TradersResponse {
  success: boolean;
  /** Inventory per trader name. */
  data: Record<TraderName, TraderItem[]>;
  /** Ermal's rotating offers and permanent services. */
  ermal?: Ermal;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface ScheduledEvent {
  name: string;
  /** Display name of the map, e.g. "Buried City". */
  map: string;
  icon: string;
  /** Unix epoch in milliseconds. */
  startTime: number;
  /** Unix epoch in milliseconds. */
  endTime: number;
}

export interface EventsScheduleResponse {
  data: ScheduledEvent[];
  cachedAt: number;
  region: string;
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export type MarkerCategory = OpenUnion<
  'containers' | 'nature' | 'arc' | 'events' | 'locations' | 'quests'
>;

export interface MapMarker {
  id: string;
  mapID: MapId;
  /** Y-ish coordinate in map pixels (MetaForge uses a Leaflet CRS). */
  lat: number;
  /** X-ish coordinate in map pixels. */
  lng: number;
  zlayers?: number;
  category: MarkerCategory;
  subcategory: string;
  instanceName: string | null;
  behindLockedDoor?: boolean;
  lootAreas?: string | null;
  eventConditionMask?: number;
  community?: boolean;
  updated_at?: string;
  [extra: string]: unknown;
}
