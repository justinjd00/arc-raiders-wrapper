export { ArcRaidersClient, createArcRaidersClient } from './arc-raiders/client';
export type { ArcRaidersClientConfig } from './arc-raiders/client';

export type {
  ArcRaidersItem,
  Weapon,
  Armor,
  Quest,
  ARC,
  ArcMission,
  Location,
  MapData,
  Trader,
  TraderItem,
  ArcLoot,
  ArcRaidersFilter,
  ArcRaidersApiResponse,
  ItemRarity,
  ItemType,
  WeaponType,
  ArmorSlot,
  QuestDifficulty,
  ObjectiveType,
  ArcMissionType,
  LocationType,
  WaypointType,
  POIType,
  CurrencyType,
  PointOfInterest,
  Coordinates,
  QuestObjective,
  QuestReward,
  Waypoint,
  ResponseMeta,
} from './arc-raiders/types';

export {
  useArcRaiders,
  useItems,
  useWeapons,
  useQuests,
  useARCs,
} from './hooks/useArcRaiders';

export {
  exportToJSON,
  exportToJSONString,
} from './export/json';

export {
  exportToCSV,
  exportToCSVString,
} from './export/csv';

export {
  calculateStats,
  getWeaponStats,
  getArmorStats,
  getRarityDistribution,
  findBestWeapon,
  findBestArmor,
} from './analytics/stats';

export type { Stats } from './analytics/stats';

export { BrowserArcRaidersClient, createBrowserClient } from './arc-raiders/browser-client';
export type { BrowserClientConfig } from './arc-raiders/browser-client';
