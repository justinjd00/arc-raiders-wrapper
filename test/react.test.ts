// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ArcRaidersProvider,
  useArcRaidersClient,
  useEvents,
  useItems,
  useQuests,
  useSearch,
} from '../src/react';
import { NOW, testClient } from './helpers';

function setup() {
  const { client, fetch } = testClient();
  const wrapper = ({ children }: { children?: ReactNode }) =>
    createElement(ArcRaidersProvider, { client }, children);
  return { client, fetch, wrapper };
}

afterEach(() => vi.useRealTimers());

describe('react hooks', () => {
  it('provides the client via context', () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useArcRaidersClient(), { wrapper });
    expect(result.current).toBe(client);
  });

  it('loads data and refetches bypassing the cache', async () => {
    const { fetch, wrapper } = setup();
    const { result } = renderHook(() => useItems({ itemType: 'Weapon' }), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.every((i) => i.item_type === 'Weapon')).toBe(true);

    const before = fetch.mock.calls.length;
    act(() => result.current.refetch());
    await waitFor(() => expect(fetch.mock.calls.length).toBe(before + 1));
  });

  it('does not refetch on re-render with an equal filter object', async () => {
    const { fetch, wrapper } = setup();
    const { result, rerender } = renderHook(() => useQuests(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const count = fetch.mock.calls.length;
    rerender();
    rerender();
    expect(fetch.mock.calls.length).toBe(count);
  });

  it('surfaces errors', async () => {
    const { client, wrapper } = setup();
    vi.spyOn(client.quests, 'all').mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useQuests(), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
  });

  it('builds a live event board', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { wrapper } = setup();
    const { result } = renderHook(() => useEvents({ upcomingLimit: 2 }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active.map((e) => e.name)).toEqual(['Matriarch', 'Night Raid']);
    expect(result.current.upcoming).toHaveLength(2);
  });

  it('debounces search', async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ q }) => useSearch(q, { debounceMs: 10 }), {
      wrapper,
      initialProps: { q: '' },
    });
    expect(result.current.loading).toBe(false);
    rerender({ q: 'ferro 2' });
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('ferro-ii'));
  });
});
