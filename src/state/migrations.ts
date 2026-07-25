// Save-schema migration pipeline. Each entry upgrades a save from version
// N to N+1; load() runs them in order until the save reaches the current
// SCHEMA_VERSION. Keep every historical migration — old saves in the wild
// stay loadable forever.

import { COACH_TIP_IDS } from '../ui/coaching';
import type { GameState } from './gameState';

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** index 0 upgrades v1 → v2, and so on */
export const MIGRATIONS: Migration[] = [
  // v1 → v2: tuning, achievements, race history, invitationals, audio setting
  (old) => ({
    ...old,
    tuning: old.tuning ?? {},
    achievements: old.achievements ?? {},
    history: old.history ?? [],
    invitationals: old.invitationals ?? 0,
    settings: { defaultSpeed: 1, audio: true, ...(old.settings as object | undefined) },
  }),
  // v2 → v3: director licenses (trial medals) + standalone event results
  (old) => ({
    ...old,
    trialMedals: old.trialMedals ?? {},
    standaloneResults: old.standaloneResults ?? {},
  }),
  // v3 → v4: the aggression driver stat, and per-car strategy presets
  (old) => {
    const driver = (old.driver ?? {}) as Record<string, unknown>;
    const stats = (driver.stats ?? {}) as Record<string, number>;
    return {
      ...old,
      driver: {
        ...driver,
        // seed aggression from existing racecraft so migrated drivers feel
        // continuous rather than reset to a default
        stats: { ...stats, aggression: stats.aggression ?? stats.battle ?? 45 },
      },
      strategies: old.strategies ?? {},
      // an existing player has already learned the game by playing it
      coachSeen: old.coachSeen ?? Object.fromEntries(COACH_TIP_IDS.map((id) => [id, 1])),
    };
  },
];

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
