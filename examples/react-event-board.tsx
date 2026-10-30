/**
 * Live event board with React. Copy into your app.
 */
import { ATTRIBUTION } from '@justinjd00/arc-raiders-api';
import { ArcRaidersProvider, useEvents, useSearch } from '@justinjd00/arc-raiders-api/react';
import { useState } from 'react';

function EventBoard() {
  const { active, upcoming, loading } = useEvents({ upcomingLimit: 5 });
  if (loading) return <p>Loading events...</p>;
  return (
    <section>
      <h2>Live now</h2>
      <ul>
        {active.map((e) => (
          <li key={`${e.name}-${e.map}`}>
            {e.name} on {e.map}, ends {new Date(e.endTime).toLocaleTimeString()}
          </li>
        ))}
      </ul>
      <h2>Up next</h2>
      <ul>
        {upcoming.map((e) => (
          <li key={`${e.name}-${e.map}-${e.startTime}`}>
            {e.name} on {e.map} at {new Date(e.startTime).toLocaleTimeString()}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Search() {
  const [query, setQuery] = useState('');
  const { data } = useSearch(query, { limit: 8 });
  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search items, quests, ARCs"
      />
      <ul>
        {data?.map((hit) => (
          <li key={hit.id}>
            {hit.name} <small>{hit.value.type}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function App() {
  return (
    <ArcRaidersProvider options={{ cache: { staleWhileRevalidate: 5 * 60_000 } }}>
      <Search />
      <EventBoard />
      <footer>
        <a href={ATTRIBUTION.url}>{ATTRIBUTION.text}</a>
      </footer>
    </ArcRaidersProvider>
  );
}
