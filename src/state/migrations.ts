// Save-schema migration pipeline. Each entry upgrades a save from version
// N to N+1; load() runs them in order until the save reaches the current
// SCHEMA_VERSION. Keep every historical migration — old saves in the wild
// stay loadable forever.

import type { GameState } from './gameState';

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** index 0 upgrades v1 → v2, and so on */
export const MIGRATIONS: Migration[] = [];

export function migrate(raw: Record<string, unknown>, targetVersion: number): GameState {
  let data = raw;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1;
  while (version < targetVersion) {
    const step = MIGRATIONS[version - 1];
    if (!step) throw new Error(`no migration from save schema v${version}`);
    data = step(data);
    version++;
    data.schemaVersion = version;
  }
  return data as unknown as GameState;
}
