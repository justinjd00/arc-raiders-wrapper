import { ArcRaidersClient, ArcRaidersClientConfig } from './client';
import type { ArcRaidersFilter } from './types';
import type { ArcRaidersItem, Weapon, Armor, Quest, ArcMission, ArcRaidersApiResponse } from './types';

export interface BrowserClientConfig extends ArcRaidersClientConfig {
  headless?: boolean;
  browser?: 'chromium' | 'firefox' | 'webkit';
}

export class BrowserArcRaidersClient extends ArcRaidersClient {
  private browser: any;
  private page: any;
  private playwright: any;
  private config?: BrowserClientConfig;

  constructor(config?: BrowserClientConfig) {
    super(config);
    this.config = config;
    this.playwright = null;
    this.browser = null;
    this.page = null;
  }

  async init(): Promise<void> {
    try {
      this.playwright = require('playwright');
    } catch (error) {
      throw new Error('Playwright is required for browser client. Install it with: npm install playwright');
    }

    const browserType = this.config?.browser || 'chromium';
    const headless = this.config?.headless !== false;

    this.browser = await this.playwright[browserType].launch({ headless });
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });
    this.page = await context.newPage();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  private async request(endpoint: string, params?: Record<string, any>): Promise<any> {
    if (!this.page) {
      await this.init();
    }

    const baseURL = this.baseURL || 'https://metaforge.app/api/arc-raiders';
    const url = new URL(endpoint.startsWith('/') ? endpoint : `/${endpoint}`, baseURL);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const response = await this.page.goto(url.toString(), { waitUntil: 'networkidle' });
    
    if (!response || !response.ok()) {
      const status = response?.status() || 'Unknown';
      throw new Error(`API Request failed: ${status}`);
    }

    await this.page.waitForTimeout(1000);

    const content = await this.page.content();
    const jsonMatch = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    try {
      return JSON.parse(content);
    } catch {
      const bodyText = await this.page.evaluate(() => {
        const doc = (globalThis as any).document;
        if (doc && doc.body) {
          return doc.body.innerText;
        }
        return '';
      });
      if (bodyText) {
        return JSON.parse(bodyText);
      }
      throw new Error('Could not parse response as JSON');
    }
  }

  async getItems(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcRaidersItem[]> {
    const allItems: ArcRaidersItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.request('/items', params);
      const data = response.data || [];
      allItems.push(...data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allItems;
  }

  async getWeapons(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Weapon[]> {
    const filterWithType = { ...filter, type: 'weapon' as const };
    const allWeapons: Weapon[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filterWithType, page, pageSize: 50 });
      const response = await this.request('/items', params);
      const data = response.data || [];
      allWeapons.push(...data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allWeapons;
  }

  async getQuests(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Quest[]> {
    const allQuests: Quest[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.request('/quests', params);
      const data = response.data || [];
      allQuests.push(...data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allQuests;
  }

  async getARCs(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcMission[]> {
    const allARCs: ArcMission[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.request('/arcs', params);
      const data = response.data || [];
      allARCs.push(...data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allARCs;
  }

  protected buildQueryParams(filter?: ArcRaidersFilter): Record<string, string | number> {
    const params: Record<string, string | number> = {};

    if (filter?.rarity) {
      params.rarity = Array.isArray(filter.rarity) 
        ? filter.rarity.join(',') 
        : filter.rarity;
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
}

export function createBrowserClient(config?: BrowserClientConfig): BrowserArcRaidersClient {
  return new BrowserArcRaidersClient(config);
}

