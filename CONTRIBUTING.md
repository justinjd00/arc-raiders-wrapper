# Contributing

Thanks for helping out. Bug reports, API drift reports and pull requests are all welcome.

## Setup

Requires Node.js 22 or newer for development (the published package runs on Node 20+).

```bash
git clone https://github.com/justinjd00/arc-raiders-wrapper.git
cd arc-raiders-wrapper
npm install
```

## Scripts

| Command                 | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `npm run build`         | Builds ESM, CJS, type declarations and the CLI        |
| `npm test`              | Offline unit tests (Vitest)                           |
| `npm run test:contract` | Runs the client against the live MetaForge API        |
| `npm run typecheck`     | `tsc --noEmit`                                        |
| `npm run lint`          | ESLint                                                |
| `npm run format`        | Prettier                                              |
| `npm run check:package` | publint and are-the-types-wrong on the packed tarball |

Before opening a PR, run `npm run build && npm run typecheck && npm run lint && npm test`.

## Guidelines

- Keep the core free of runtime dependencies.
- Anything React goes to `src/react`, anything Playwright to `src/browser`, so the core stays tree-shakeable and browser friendly.
- New API fields: add them to `src/arc-raiders/types.ts` as optional, MetaForge adds and removes fields regularly.
- Every bug fix gets a test. Fixtures in `test/fixtures` are trimmed real responses, prefer extending them over inventing data.
- Comment the why, not the what.

## When the API changes

The weekly `API contract` workflow opens an issue labeled `api-drift` when the live API no longer matches. To investigate locally:

```bash
npm run test:contract
```

## Commit messages

Conventional commits, e.g. `feat: add trader filter`, `fix: handle empty event schedule`, `docs: ...`.

## Reporting issues

Include the package version, Node.js or browser version, a minimal code sample and the `code` of the `ArcRaidersError` if one was thrown.
