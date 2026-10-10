import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnvFileIfPresent } from '../src/config/env-file';
import { RosterConfig } from '../src/config/roster-config';

const KEYS = ['DATABASE_URL', 'PORT'] as const;

describe('loadEnvFileIfPresent', () => {
  let saved: Record<string, string | undefined>;
  let dir: string;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    dir = mkdtempSync(join(tmpdir(), 'roster-env-'));
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('lets the config boot from a copied .env file', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'DATABASE_URL=postgresql://roster:roster@localhost:5432/roster\nPORT=4321\n');

    // Without the file loaded, boot fails exactly like `npm run start:dev` used to.
    expect(() => RosterConfig.load()).toThrow(/DATABASE_URL/);

    expect(loadEnvFileIfPresent(file)).toBe(true);
    const config = RosterConfig.load();
    expect(config.databaseUrl).toBe('postgresql://roster:roster@localhost:5432/roster');
    expect(config.port).toBe(4321);
  });

  it('never overrides a variable that is already set', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'DATABASE_URL=postgresql://from-file\n');
    process.env.DATABASE_URL = 'postgresql://from-env';

    loadEnvFileIfPresent(file);
    expect(process.env.DATABASE_URL).toBe('postgresql://from-env');
  });

  it('does nothing when the file is missing', () => {
    expect(loadEnvFileIfPresent(join(dir, 'missing.env'))).toBe(false);
    expect(process.env.DATABASE_URL).toBeUndefined();
  });
});
