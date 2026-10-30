import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      react: 'src/react/index.ts',
      browser: 'src/browser/index.ts',
    },
    format: ['esm', 'cjs'],
    // Shared chunks for CJS too, so every entry uses the same classes and
    // `instanceof ArcRaidersError` works across "./", "./react" and "./browser".
    splitting: true,
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node20',
    treeshake: true,
    external: ['react', 'playwright'],
  },
  {
    entry: { cli: 'src/cli/bin.ts' },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    banner: { js: '#!/usr/bin/env node' },
    clean: false,
  },
]);
