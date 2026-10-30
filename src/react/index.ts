import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArcRaidersClient,
  type ArcOptions,
  type ArcRaidersClientOptions,
  type CallOptions,
  type SearchResult,
  type SearchScope,
} from '../arc-raiders/client';
import type {
  Arc,
  Item,
  ItemFilter,
  Quest,
  ScheduledEvent,
  TradersResponse,
  Weapon,
  WeaponFilter,
} from '../arc-raiders/types';
import { activeEvents, upcomingEvents } from '../helpers/events';

const ClientContext = createContext<ArcRaidersClient | null>(null);
let sharedClient: ArcRaidersClient | undefined;

export interface ArcRaidersProviderProps {
  /** Use an existing client, or let the provider create one from `options`. */
  client?: ArcRaidersClient;
  options?: ArcRaidersClientOptions;
  children?: ReactNode;
}

/** Shares one client (and therefore one cache) across your component tree. */
export function ArcRaidersProvider({ client, options, children }: ArcRaidersProviderProps) {
  const value = useMemo(() => client ?? new ArcRaidersClient(options), [client]); // eslint-disable-line react-hooks/exhaustive-deps
  return createElement(ClientContext.Provider, { value }, children);
}

/** The client from the nearest provider, or a shared default client. */
export function useArcRaidersClient(): ArcRaidersClient {
  const fromContext = useContext(ClientContext);
  if (fromContext) return fromContext;
  sharedClient ??= new ArcRaidersClient();
  return sharedClient;
}

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** Fetch again, bypassing the cache. */
  refetch: () => void;
}

export interface QueryOptions {
  /** Set to `false` to hold off fetching. */
  enabled?: boolean;
  /** Re-fetch every N ms. */
  refetchInterval?: number;
}

/**
 * Generic data hook. `key` decides when to re-run: pass every input the
 * fetcher depends on. Stale responses from earlier keys are discarded and
 * in-flight requests are aborted on unmount.
 */
export function useArcRaidersQuery<T>(
  key: unknown,
  fetcher: (client: ArcRaidersClient, options: CallOptions) => Promise<T>,
  options: QueryOptions = {}
): QueryState<T> {
  const client = useArcRaidersClient();
  const enabled = options.enabled !== false;
  const keyString = JSON.stringify(key);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({
    loading: enabled,
  });
  const [tick, setTick] = useState(0);
  const freshRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const controller = new AbortController();
    const fresh = freshRef.current;
    freshRef.current = false;
    setState((s) => ({ ...s, loading: true, error: undefined }));

    fetcherRef
      .current(client, { signal: controller.signal, fresh })
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState((s) => ({
            ...s,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      });

    return () => controller.abort();
  }, [client, keyString, enabled, tick]);

  useEffect(() => {
    if (!enabled || !options.refetchInterval) return;
    const id = setInterval(() => setTick((t) => t + 1), options.refetchInterval);
    return () => clearInterval(id);
  }, [enabled, options.refetchInterval]);

  const refetch = useCallback(() => {
    freshRef.current = true;
    setTick((t) => t + 1);
  }, []);

  return { data: state.data, error: state.error, loading: state.loading, refetch };
}

export function useItems(filter: ItemFilter = {}, options?: QueryOptions) {
  return useArcRaidersQuery<Item[]>(['items', filter], (c, o) => c.items.all(filter, o), options);
}

export function useItem(id: string | undefined, options?: QueryOptions) {
  return useArcRaidersQuery<Item | undefined>(['item', id], (c, o) => c.items.get(id!, o), {
    ...options,
    enabled: !!id && options?.enabled !== false,
  });
}

export function useWeapons(filter: WeaponFilter = {}, options?: QueryOptions) {
  return useArcRaidersQuery<Weapon[]>(
    ['weapons', filter],
    (c, o) => c.weapons.all(filter, o),
    options
  );
}

export function useQuests(options?: QueryOptions) {
  return useArcRaidersQuery<Quest[]>(['quests'], (c, o) => c.quests.all(o), options);
}

export function useArcs(filter: ArcOptions = {}, options?: QueryOptions) {
  return useArcRaidersQuery<Arc[]>(['arcs', filter], (c, o) => c.arcs.all(filter, o), options);
}

export function useTraders(options?: QueryOptions) {
  return useArcRaidersQuery<TradersResponse>(['traders'], (c, o) => c.traders.getAll(o), options);
}

export interface EventsState {
  active: ScheduledEvent[];
  upcoming: ScheduledEvent[];
  loading: boolean;
  error: Error | undefined;
}

/**
 * Live event board. Re-evaluates which events are active every `tickMs`
 * (default 15s) without hitting the network, and refreshes the schedule
 * every minute.
 */
export function useEvents(
  options: { map?: string; upcomingLimit?: number; tickMs?: number } = {}
): EventsState {
  const { data, loading, error } = useArcRaidersQuery<ScheduledEvent[]>(
    ['events'],
    (c, o) => c.events.schedule(o),
    { refetchInterval: 60_000 }
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), options.tickMs ?? 15_000);
    return () => clearInterval(id);
  }, [options.tickMs]);

  return useMemo(
    () => ({
      active: data ? activeEvents(data, { at: now, map: options.map }) : [],
      upcoming: data
        ? upcomingEvents(data, { at: now, map: options.map, limit: options.upcomingLimit ?? 10 })
        : [],
      loading,
      error,
    }),
    [data, now, options.map, options.upcomingLimit, loading, error]
  );
}

/** Debounced fuzzy search across items, quests and ARCs. */
export function useSearch(
  query: string,
  options: { debounceMs?: number; limit?: number; in?: SearchScope[] } = {}
) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), options.debounceMs ?? 200);
    return () => clearTimeout(id);
  }, [query, options.debounceMs]);

  return useArcRaidersQuery<SearchResult[]>(
    ['search', debounced, options.limit, options.in],
    (c, o) => c.search(debounced, { ...o, limit: options.limit, in: options.in }),
    { enabled: debounced.trim().length > 0 }
  );
}

/** @deprecated Use `useArcRaidersClient()`. */
export function useArcRaiders() {
  const client = useArcRaidersClient();
  return { client, clearCache: () => client.clearCache() };
}

/** @deprecated Use `useArcs()`. */
export const useARCs = useArcs;
