# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.1] - 2026-10-30

### Fixed

- The `arc-raiders` CLI was missing from the 2.0.0 package. npm 12 drops `bin` paths written as `./dist/cli.js` during publish, the path is now `dist/cli.js`.

### Added

- CI runs `npm publish --dry-run` with the latest npm and fails if npm would change the package on publish.

## [2.0.0] - 2026-10-30

A rewrite against the current MetaForge API. Most v1 endpoints no longer exist upstream, so v1 calls were failing. The v1 methods are kept as deprecated aliases on top of the new client, see the migration table in the README.

### Added

- Resource based API: `items`, `weapons`, `quests`, `arcs`, `traders`, `events`, `maps`, each with `all()`, `iterate()` (async iterator), `list()` and `get()` where it applies.
- Support for endpoints added by MetaForge since v1: Ermal offers and services, the live events schedule, map markers for all 7 maps including Riven Tides and Pendola Pass, ARC loot tables.
- Quest tools: prerequisite graph, `chain()` in play order, `available(completed)` and `shoppingList()` for the items your next quests need.
- `itemUsage(itemId)`: which quests, Ermal deals, ARCs and traders involve an item, with a `keep` verdict.
- Offline fuzzy `search()` across items, quests and ARCs with typo tolerance and roman numeral matching (`"ferro 2"` finds "Ferro II").
- Events helpers: `active()`, `upcoming()`, `next()`, filter by map name or map id.
- Analytics: `rankByStat`, `valuePerWeight`, `statSummary`, `rarityDistribution`, `typeDistribution`, `countBy`, `summarize`.
- Retries with exponential backoff and jitter, `Retry-After` support, per request timeout, `AbortSignal` support, in-flight request de-duplication and observability hooks (`onRequest`, `onResponse`, `onRetry`).
- `ArcRaidersError` with a machine readable `code` (`NOT_FOUND`, `RATE_LIMITED`, `BLOCKED`, `TIMEOUT`, ...) and `isArcRaidersError()` that also works across duplicated package copies.
- Cache with per resource TTLs, LRU eviction, stale-while-revalidate and pluggable sync or async stores.
- React entry `@justinjd00/arc-raiders-api/react`: `ArcRaidersProvider`, `useArcRaidersQuery`, `useItems`, `useItem`, `useWeapons`, `useQuests`, `useArcs`, `useTraders`, `useEvents` (live event board) and `useSearch` (debounced).
- Browser entry `@justinjd00/arc-raiders-api/browser`: Playwright transport that runs requests inside a real page, usable as a `fetch` for any client.
- CLI rewrite: `item`, `quest --chain`, `usage`, `search`, `rank`, `value`, `events`, `ermal`, `export`, `stats`, table or `--json` output and a disk cache.
- `ATTRIBUTION` export for MetaForge's attribution requirement.
- Unit tests (Vitest) based on trimmed real responses, plus weekly contract tests against the live API that open an issue on drift.

### Changed

- Types now match the real API (`item_type`, `stat_block`, `required_items`, `manifest.objective_graph`, ...). Known string unions are open so new values do not break builds.
- Pagination de-duplicates by id and uses page sizes that are stable on MetaForge's side. v1 could return duplicates and miss items.
- Rarity and item type filters are case-insensitive and accept several values.
- Dual ESM and CommonJS build with subpath exports, no runtime dependencies. React and Playwright are optional peer dependencies.
- Requests send an identifiable User-Agent from server runtimes.
- Node.js 20 or newer is required.
- Tooling: TypeScript 6, tsup, Vitest, ESLint flat config, Prettier, publint and are-the-types-wrong in CI, npm provenance on release.

### Fixed

- Browser client dropped the `/api/arc-raiders` path and requested the wrong URLs.
- `getWeapons()` and `getArmor()` filtered with a `type` parameter the API ignores, so they returned every item.
- `getItemById()` and the other `get...ById()` methods called `/items/:id` style paths that return 404.
- Multi-value rarity filters were sent comma separated, which the API answers with zero results.
- README examples did not match the returned types (`items.data` on an array).
- `.gitignore` excluded all `*.test.ts` files, so tests were never committed.
- Playwright was a hard dependency even for users of the plain client.

### Removed

- File writing `exportToJSON(path)` and `exportToCSV(path)` from the library core (use `toJSON()`, `toCSV()` or the CLI `export` command).

## [1.1.1] - 2025-11-03

### Added

- Browser based client using Playwright to work around Cloudflare 403 responses.

### Changed

- Rarity filter normalization.

## [1.1.0] - 2025-11-03

### Added

- In-memory caching, React hooks, CLI, JSON and CSV export, analytics helpers.

## [1.0.1] - 2025-11-03

### Fixed

- `TraderItem` type and `getTraders()` return type.

## [1.0.0] - 2025-11-03

### Added

- Initial release.

[Unreleased]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v1.1.1...v2.0.0
[1.1.1]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/justinjd00/arc-raiders-wrapper/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/justinjd00/arc-raiders-wrapper/releases/tag/v1.0.0
