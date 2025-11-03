export interface ArcRaidersItem {
  id: string;
  name: string;
  description?: string;
  rarity?: ItemRarity;
  type?: ItemType;
  icon?: string;
}

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export type ItemType = 'weapon' | 'armor' | 'consumable' | 'material' | 'quest_item' | 'other';

export interface Weapon extends ArcRaidersItem {
  type: 'weapon';
  damage?: number;
  fireRate?: number;
  range?: number;
  weaponType?: WeaponType;
}

export type WeaponType = 'assault_rifle' | 'sniper_rifle' | 'pistol' | 'shotgun' | 'smg' | 'lmg' | 'melee';

export interface Armor extends ArcRaidersItem {
  type: 'armor';
  armorValue?: number;
  slot?: ArmorSlot;
}

export type ArmorSlot = 'head' | 'chest' | 'arms' | 'legs' | 'backpack';

export interface Quest {
  id: string;
  name: string;
  description?: string;
  objectives?: QuestObjective[];
  rewards?: QuestReward[];
  location?: string;
  difficulty?: QuestDifficulty;
  icon?: string;
}

export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'extreme';

export interface QuestObjective {
  id: string;
  description: string;
  type: ObjectiveType;
  target?: string;
  count?: number;
}

export type ObjectiveType = 'kill' | 'collect' | 'deliver' | 'interact' | 'survive' | 'other';

export interface QuestReward {
  itemId?: string;
  itemName?: string;
  quantity?: number;
  experience?: number;
  currency?: number;
}

export interface ARC {
  id: string;
  name: string;
  description?: string;
  type?: ArcMissionType;
  loot?: ArcLoot[];
  location?: string;
  difficulty?: QuestDifficulty;
  icon?: string;
}

export interface Location {
  id: string;
  name: string;
  description?: string;
  type?: LocationType;
  waypoints?: Waypoint[];
  icon?: string;
}

export type LocationType = 'raid' | 'safe_zone' | 'pvp' | 'exploration' | 'other';

export interface Waypoint {
  id: string;
  name: string;
  coordinates?: Coordinates;
  type?: WaypointType;
}

export type WaypointType = 'spawn' | 'extraction' | 'objective' | 'vendor' | 'other';

export interface Coordinates {
  x: number;
  y: number;
  z?: number;
}

export interface MapData {
  id: string;
  name: string;
  coordinates?: Coordinates[];
  waypoints?: Waypoint[];
  pois?: PointOfInterest[];
}

export interface PointOfInterest {
  id: string;
  name: string;
  type: POIType;
  coordinates?: Coordinates;
}

export type POIType = 'spawn' | 'extraction' | 'objective' | 'vendor' | 'cache' | 'other';

export interface Trader {
  id: string;
  name: string;
  location?: string;
  inventory?: TraderItem[];
  icon?: string;
}

export interface TraderItem {
  id: string;
  icon?: string;
  name: string;
  value?: number;
  rarity?: ItemRarity;
  item_type?: string;
  description?: string;
  trader_price?: number | null;
}

export type CurrencyType = 'coins' | 'credits' | 'tokens' | 'other';

export interface ArcMission {
  id: string;
  name: string;
  description?: string;
  type?: ArcMissionType;
  loot?: ArcLoot[];
  location?: string;
  difficulty?: QuestDifficulty;
  icon?: string;
}

export type ArcMissionType = 'raid' | 'event' | 'world' | 'boss' | 'other';

export interface ArcLoot {
  itemId?: string;
  itemName?: string;
  dropChance?: number;
  rarity?: ItemRarity;
}

export interface ArcRaidersApiResponse<T> {
  data: T;
  meta?: ResponseMeta;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ResponseMeta {
  total?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

export interface ArcRaidersFilter {
  rarity?: ItemRarity | ItemRarity[];
  type?: ItemType | ItemType[];
  difficulty?: QuestDifficulty | QuestDifficulty[];
  search?: string;
  page?: number;
  pageSize?: number;
}
