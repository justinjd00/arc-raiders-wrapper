import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { VERSION } from '../src';

it('VERSION matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  expect(VERSION).toBe(pkg.version);
});
