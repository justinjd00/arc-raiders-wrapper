import { defineConfig } from 'vitest/config';

// `npm run test:contract` hits the real MetaForge API to catch breaking
// changes on their side. The normal test run is fully offline.
const contract = process.env.CONTRACT === '1';

export default defineConfig({
  test: {
    include: contract ? ['contract/**/*.test.ts'] : ['test/**/*.test.ts'],
    testTimeout: contract ? 60_000 : 5_000,
    coverage: {
      include: ['src/**'],
      exclude: ['src/cli/bin.ts'],
    },
  },
});
