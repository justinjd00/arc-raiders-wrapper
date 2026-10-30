import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/cli';
import { VERSION } from '../src';
import { fakeApi } from './helpers';

let dir: string;
let stdout: string[];
let stderr: string[];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'arc-cli-'));
  vi.stubEnv('XDG_CACHE_HOME', join(dir, 'cache'));
  vi.stubEnv('NO_COLOR', '1');
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => void stdout.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => void stderr.push(a.join(' ')));
  vi.stubGlobal('fetch', fakeApi());
});

describe('cli', () => {
  it('prints version and help', async () => {
    expect(await run(['--version'])).toBe(0);
    expect(stdout[0]).toBe(VERSION);
    expect(await run([])).toBe(0);
    expect(stdout.join('\n')).toContain('Keep or recycle');
  });

  it('rejects unknown commands and flags with exit code 2', async () => {
    expect(await run(['nope'])).toBe(2);
    expect(await run(['items', '--bogus'])).toBe(2);
  });

  it('lists items as a table and as JSON', async () => {
    expect(await run(['items', '--rarity', 'legendary'])).toBe(0);
    expect(stdout[0]).toMatch(/^id\s+name\s+type\s+rarity\s+value/);
    stdout.length = 0;
    expect(await run(['weapons', '--class', 'SMG', '--json'])).toBe(0);
    expect(
      JSON.parse(stdout.join('\n')).every((w: { subcategory: string }) => w.subcategory === 'SMG')
    ).toBe(true);
  });

  it('answers keep or recycle', async () => {
    expect(await run(['usage', 'matriarch-reactor'])).toBe(0);
    expect(stdout[0]).toBe('KEEP matriarch-reactor');
  });

  it('searches with typos', async () => {
    expect(await run(['search', 'ferro', '2', '--json'])).toBe(0);
    expect(JSON.parse(stdout.join('\n'))[0].id).toBe('ferro-ii');
  });

  it('prints a quest chain', async () => {
    expect(await run(['quest', 'a-bad-feeling', '--chain'])).toBe(0);
    expect(stdout.at(-1)).toContain('a-bad-feeling');
  });

  it('exports CSV to a file', async () => {
    const file = join(dir, 'arcs.csv');
    expect(await run(['export', 'arcs', '--out', file])).toBe(0);
    expect(readFileSync(file, 'utf8').split('\r\n')[0]).toContain('id,name');
  });

  it('caches on disk between runs', async () => {
    expect(await run(['cache', 'clear'])).toBe(0);
    const fetch = fakeApi();
    vi.stubGlobal('fetch', fetch);
    await run(['traders']);
    await run(['traders']);
    expect(fetch).toHaveBeenCalledTimes(1);
    await run(['traders', '--no-cache']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports a missing item as a usage error', async () => {
    expect(await run(['item', 'does-not-exist'])).toBe(2);
    expect(stderr[0]).toContain('arc-raiders search');
  });
});
