import { useState, useEffect, useCallback } from 'react';
import { ArcRaidersClient, createArcRaidersClient, type ArcRaidersClientConfig } from '../arc-raiders/client';
import type { ArcRaidersFilter } from '../arc-raiders/types';
import type { ArcRaidersItem, Weapon, Armor, Quest, ArcMission } from '../arc-raiders/types';

interface UseArcRaidersOptions {
  config?: ArcRaidersClientConfig;
  autoFetch?: boolean;
}

export function useArcRaiders(options: UseArcRaidersOptions = {}) {
  const [client] = useState<ArcRaidersClient>(() => createArcRaidersClient(options.config));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearCache = useCallback(() => {
    client.clearCache();
  }, [client]);

  return {
    client,
    loading,
    error,
    clearError,
    clearCache,
  };
}

export function useItems(filter?: ArcRaidersFilter, options: UseArcRaidersOptions = {}) {
  const { client } = useArcRaiders(options);
  const [items, setItems] = useState<ArcRaidersItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getItems(filter);
      setItems(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [client, filter]);

  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchItems();
    }
  }, [fetchItems, options.autoFetch]);

  return {
    items,
    loading,
    error,
    refetch: fetchItems,
  };
}

export function useWeapons(filter?: ArcRaidersFilter, options: UseArcRaidersOptions = {}) {
  const { client } = useArcRaiders(options);
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchWeapons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getWeapons(filter);
      setWeapons(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [client, filter]);

  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchWeapons();
    }
  }, [fetchWeapons, options.autoFetch]);

  return {
    weapons,
    loading,
    error,
    refetch: fetchWeapons,
  };
}

export function useQuests(filter?: ArcRaidersFilter, options: UseArcRaidersOptions = {}) {
  const { client } = useArcRaiders(options);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchQuests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getQuests(filter);
      setQuests(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [client, filter]);

  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchQuests();
    }
  }, [fetchQuests, options.autoFetch]);

  return {
    quests,
    loading,
    error,
    refetch: fetchQuests,
  };
}

export function useARCs(filter?: ArcRaidersFilter, options: UseArcRaidersOptions = {}) {
  const { client } = useArcRaiders(options);
  const [arcs, setArcs] = useState<ArcMission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchARCs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getARCs(filter);
      setArcs(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [client, filter]);

  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchARCs();
    }
  }, [fetchARCs, options.autoFetch]);

  return {
    arcs,
    loading,
    error,
    refetch: fetchARCs,
  };
}

