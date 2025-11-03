import { ApiClient, createApiClient } from '../client';
import { Cache } from '../cache';
import type {
  ArcRaidersItem,
  Weapon,
  Armor,
  Quest,
  ArcMission,
  MapData,
  Trader,
  TraderItem,
  ArcRaidersFilter,
  ArcRaidersApiResponse,
} from './types';

export interface ArcRaidersClientConfig {
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

export class ArcRaidersClient {
  private readonly client: ApiClient;
  private readonly cache: Cache;
  protected readonly baseURL = 'https://metaforge.app/api/arc-raiders';
  private readonly defaultTimeout = 10000;
  private readonly cacheEnabled: boolean;

  constructor(config?: ArcRaidersClientConfig) {
    this.client = createApiClient({
      baseURL: config?.baseURL || this.baseURL,
      defaultHeaders: {
        'Content-Type': 'application/json',
        ...(config?.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
      timeout: config?.timeout || this.defaultTimeout,
    });
    this.cacheEnabled = config?.cacheEnabled !== false;
    this.cache = new Cache(config?.cacheTTL || 5 * 60 * 1000);
  }

  private getCacheKey(endpoint: string, params?: ArcRaidersFilter | Record<string, any>): string {
    const paramString = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `${endpoint}:${paramString}`;
  }

  clearCache(): void {
    this.cache.clear();
  }

  protected buildQueryParams(filter?: ArcRaidersFilter): Record<string, string | number> {
    const params: Record<string, string | number> = {};

    if (filter?.rarity) {
      const normalizeRarity = (rarity: string): string => {
        const lower = rarity.toLowerCase();
        const rarityMap: Record<string, string> = {
          'common': 'Common',
          'uncommon': 'Uncommon',
          'rare': 'Rare',
          'epic': 'Epic',
          'legendary': 'Legendary'
        };
        return rarityMap[lower] || rarity;
      };

      if (Array.isArray(filter.rarity)) {
        params.rarity = filter.rarity.map(normalizeRarity).join(',');
      } else {
        params.rarity = normalizeRarity(filter.rarity);
      }
    }

    if (filter?.type) {
      params.type = Array.isArray(filter.type)
        ? filter.type.join(',')
        : filter.type;
    }

    if (filter?.difficulty) {
      params.difficulty = Array.isArray(filter.difficulty)
        ? filter.difficulty.join(',')
        : filter.difficulty;
    }

    if (filter?.search) {
      params.search = filter.search;
    }

    if (filter?.page !== undefined) {
      params.page = filter.page;
    }

    if (filter?.pageSize !== undefined) {
      params.pageSize = filter.pageSize;
    }

    return params;
  }

  async getItems(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcRaidersItem[]> {
    const cacheKey = this.getCacheKey('/items', filter);
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<ArcRaidersItem[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allItems: ArcRaidersItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<ArcRaidersItem[]>>(
        '/items',
        { params }
      );
      
      allItems.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allItems);
    }

    return allItems;
  }

  async getItemById(id: string): Promise<ArcRaidersItem> {
    const cacheKey = this.getCacheKey(`/items/${id}`);
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<ArcRaidersItem>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const response = await this.client.get<ArcRaidersItem>(`/items/${id}`);
    
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, response.data);
    }

    return response.data;
  }

  async getWeapons(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Weapon[]> {
    const filterWithType = { ...filter, type: 'weapon' as const };
    const cacheKey = this.getCacheKey('/items', { ...filterWithType, type: 'weapon' });
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<Weapon[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allWeapons: Weapon[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filterWithType, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<Weapon[]>>(
        '/items',
        { params }
      );
      
      allWeapons.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allWeapons);
    }

    return allWeapons;
  }

  async getWeaponById(id: string): Promise<Weapon> {
    const item = await this.getItemById(id);
    return item as Weapon;
  }

  async getArmor(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Armor[]> {
    const filterWithType = { ...filter, type: 'armor' as const };
    const cacheKey = this.getCacheKey('/items', { ...filterWithType, type: 'armor' });
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<Armor[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allArmor: Armor[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filterWithType, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<Armor[]>>(
        '/items',
        { params }
      );
      
      allArmor.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allArmor);
    }

    return allArmor;
  }

  async getArmorById(id: string): Promise<Armor> {
    const item = await this.getItemById(id);
    return item as Armor;
  }

  async getQuests(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Quest[]> {
    const cacheKey = this.getCacheKey('/quests', filter);
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<Quest[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allQuests: Quest[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<Quest[]>>(
        '/quests',
        { params }
      );
      
      allQuests.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allQuests);
    }

    return allQuests;
  }

  async getQuestById(id: string): Promise<Quest> {
    const response = await this.client.get<Quest>(`/quests/${id}`);
    return response.data;
  }

  async getARCs(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcMission[]> {
    const cacheKey = this.getCacheKey('/arcs', filter);
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<ArcMission[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allARCs: ArcMission[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<ArcMission[]>>(
        '/arcs',
        { params }
      );
      
      allARCs.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allARCs);
    }

    return allARCs;
  }

  async getARCById(id: string): Promise<ArcMission> {
    const response = await this.client.get<ArcMission>(`/arcs/${id}`);
    return response.data;
  }

  async getMapData(mapName: string): Promise<MapData> {
    const mapClient = createApiClient({
      baseURL: 'https://metaforge.app/api',
      defaultHeaders: {
        'Content-Type': 'application/json',
      },
      timeout: this.client['defaultTimeout'] || this.defaultTimeout,
    });
    
    const normalizedMapName = mapName.toLowerCase().replace(/\s+/g, '-');
    const response = await mapClient.get<MapData>('/game-map-data', {
      params: { map: normalizedMapName },
    });
    return response.data;
  }

  async getMaps(): Promise<MapData[]> {
    const mapNames = ['dam', 'spaceport', 'buried-city', 'blue-gate'];
    const mapData = await Promise.all(
      mapNames.map(map => this.getMapData(map).catch(() => null))
    );
    return mapData.filter((map): map is MapData => map !== null);
  }

  async getTraders(): Promise<Record<string, TraderItem[]>> {
    const cacheKey = this.getCacheKey('/traders');
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<Record<string, TraderItem[]>>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const response = await this.client.get<{ success: boolean; data: Record<string, TraderItem[]> }>('/traders');
    const data = response.data.data || {};
    
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, data);
    }

    return data;
  }

  async getTraderById(id: string): Promise<Trader> {
    const response = await this.client.get<Trader>(`/traders/${id}`);
    return response.data;
  }

  async search(query: string, filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<{
    items?: ArcRaidersItem[];
    quests?: Quest[];
    arcs?: ArcMission[];
    traders?: Trader[];
  }> {
    const searchFilter = { ...filter, search: query };
    const items = await this.getItems(searchFilter);
    
    return {
      items,
    };
  }

  async getAllItems(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcRaidersItem[]> {
    return this.getItems(filter);
  }

  async getAllWeapons(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Weapon[]> {
    return this.getWeapons(filter);
  }

  async getAllArmor(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Armor[]> {
    return this.getArmor(filter);
  }

  async getAllQuests(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Quest[]> {
    return this.getQuests(filter);
  }

  async getAllARCs(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcMission[]> {
    return this.getARCs(filter);
  }
}

export function createArcRaidersClient(config?: ArcRaidersClientConfig): ArcRaidersClient {
  return new ArcRaidersClient(config);
}
