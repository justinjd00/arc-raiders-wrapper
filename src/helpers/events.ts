import type { ScheduledEvent } from '../arc-raiders/types';

export interface EventQuery {
  /** Reference time in epoch ms. Default `Date.now()`. */
  at?: number;
  /** Only events on this map: display name (`"Blue Gate"`) or map id (`"blue-gate"`). */
  map?: string;
  /** Only events with this name (case-insensitive). */
  name?: string;
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/** `"Riven Tides"` becomes `"riven-tides"`, matching the map ids. */
export const mapSlug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function matches(event: ScheduledEvent, query: EventQuery): boolean {
  if (query.map && !same(event.map, query.map) && mapSlug(event.map) !== mapSlug(query.map)) {
    return false;
  }
  if (query.name && !same(event.name, query.name)) return false;
  return true;
}

/** Events running at `at`. */
export function activeEvents(
  events: readonly ScheduledEvent[],
  query: EventQuery = {}
): ScheduledEvent[] {
  const at = query.at ?? Date.now();
  return events
    .filter((e) => e.startTime <= at && at < e.endTime && matches(e, query))
    .sort((a, b) => a.endTime - b.endTime);
}

/** Events starting after `at`, soonest first. */
export function upcomingEvents(
  events: readonly ScheduledEvent[],
  query: EventQuery & { within?: number; limit?: number } = {}
): ScheduledEvent[] {
  const at = query.at ?? Date.now();
  const until = query.within !== undefined ? at + query.within : Infinity;
  const list = events
    .filter((e) => e.startTime > at && e.startTime <= until && matches(e, query))
    .sort((a, b) => a.startTime - b.startTime);
  return query.limit !== undefined ? list.slice(0, query.limit) : list;
}

/** The next time an event with this name starts (or is running), if scheduled. */
export function nextOccurrence(
  events: readonly ScheduledEvent[],
  name: string,
  query: Omit<EventQuery, 'name'> = {}
): ScheduledEvent | undefined {
  const at = query.at ?? Date.now();
  return events
    .filter((e) => e.endTime > at && matches(e, { ...query, name }))
    .sort((a, b) => a.startTime - b.startTime)[0];
}

/** Milliseconds until the event starts (0 when it is running, negative when over). */
export function msUntil(event: ScheduledEvent, at = Date.now()): number {
  if (event.startTime <= at && at < event.endTime) return 0;
  return event.startTime > at ? event.startTime - at : event.endTime - at;
}
