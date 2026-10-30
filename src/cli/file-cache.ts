import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CacheEntry, CacheStore } from '../core/cache';

/** Disk cache so repeated CLI calls do not refetch everything. */
export class FileCache implements CacheStore {
  constructor(readonly dir: string = defaultCacheDir()) {}

  private file(key: string): string {
    return join(this.dir, `${createHash('sha1').update(key).digest('hex')}.json`);
  }

  async get(key: string): Promise<CacheEntry | undefined> {
    try {
      return JSON.parse(await readFile(this.file(key), 'utf8')) as CacheEntry;
    } catch {
      return undefined;
    }
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.file(key), JSON.stringify(entry));
    } catch {
      // A read-only home should not break the CLI.
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }

  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }
}

export function defaultCacheDir(): string {
  const base =
    process.env.XDG_CACHE_HOME ||
    (process.platform === 'win32'
      ? process.env.LOCALAPPDATA
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Caches')
        : join(homedir(), '.cache'));
  return join(base || tmpdir(), 'arc-raiders-api');
}
