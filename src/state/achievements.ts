// Achievement definitions and evaluation. Checks are pure predicates over
// GameState plus an optional event context; newly unlocked achievements are
// stamped into gs.achievements and returned for the UI to toast.

import { CARS } from '../data/cars';
import { CHAMPIONSHIPS } from '../data/championships';
import { PART_CATEGORIES, activeParts } from '../data/parts';
import type { RaceResult } from '../sim/types';
import { championshipProgress, type GameState } from './gameState';
import type { RaceRewards } from './progression';

export interface AchievementContext {
  type: 'race' | 'purchase' | 'generic';
  /** race context (career + invitational races only, not exhibitions) */
  result?: RaceResult;
  rewards?: RaceRewards;
  gridSlot?: number;
  invitational?: boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check(gs: GameState, ctx: AchievementContext): boolean;
}

const playerRow = (ctx: AchievementContext) =>
  ctx.result?.rows.find((r) => r.isPlayer) ?? null;

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-steps',
    name: 'First Set of Keys',
    desc: 'Buy your first car.',
    check: (gs) => gs.ownedCarIds.length >= 1,
  },
  {
    id: 'green-flag',
    name: 'Green Flag',
    desc: 'Finish your first race.',
    check: (gs) => gs.totals.races >= 1,
  },
  {
    id: 'taste-of-victory',
    name: 'Taste of Victory',
    desc: 'Win a race.',
    check: (gs) => gs.totals.wins >= 1,
  },
  {
    id: 'podium-regular',
    name: 'Podium Regular',
    desc: 'Score 10 podium finishes.',
    check: (gs) => gs.totals.podiums >= 10,
  },
  {
    id: 'serial-winner',
    name: 'Serial Winner',
    desc: 'Win 10 races.',
    check: (gs) => gs.totals.wins >= 10,
  },
  {
    id: 'sunday-best',
    name: 'Sunday Best',
    desc: 'Win the Sunday Cup.',
    check: (gs) => championshipProgress(gs, 'sunday-cup').champion,
  },
  {
    id: 'clubman-hero',
    name: 'Clubman Hero',
    desc: 'Win the Clubman Series.',
    check: (gs) => championshipProgress(gs, 'clubman').champion,
  },
  {
    id: 'national-legend',
    name: 'National Legend',
    desc: 'Win the National Championship.',
    check: (gs) => championshipProgress(gs, 'national').champion,
  },
  {
    id: 'clean-sweep',
    name: 'Clean Sweep',
    desc: 'Hold every championship title.',
    check: (gs) => CHAMPIONSHIPS.every((c) => championshipProgress(gs, c.id).champion),
  },
  {
    id: 'charger',
    name: 'The Charger',
    desc: 'Win a race from last on the grid.',
    check: (_gs, ctx) =>
      ctx.type === 'race' &&
      playerRow(ctx)?.position === 1 &&
      (ctx.gridSlot ?? 0) >= 8,
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    desc: 'Win with the fastest lap and zero mistakes.',
    check: (_gs, ctx) => {
      const row = playerRow(ctx);
      return ctx.type === 'race' && !!row && row.position === 1 && row.fastestLap && row.mistakes === 0;
    },
  },
  {
    id: 'predator',
    name: 'Predator',
    desc: 'Make 5 overtakes in a single race.',
    check: (_gs, ctx) => (playerRow(ctx)?.overtakes ?? 0) >= 5,
  },
  {
    id: 'century-of-passes',
    name: 'Century of Passes',
    desc: '100 career overtakes.',
    check: (gs) => gs.totals.overtakes >= 100,
  },
  {
    id: 'strategist',
    name: 'The Strategist',
    desc: 'Win a race in which you made a pit stop.',
    check: (_gs, ctx) => {
      const row = playerRow(ctx);
      return !!row && row.position === 1 && row.pitStops > 0;
    },
  },
  {
    id: 'wealthy',
    name: 'Serious Money',
    desc: 'Hold 100,000 Cr.',
    check: (gs) => gs.credits >= 100000,
  },
  {
    id: 'collector',
    name: 'Collector',
    desc: 'Own 4 cars at once.',
    check: (gs) => gs.ownedCarIds.length >= 4,
  },
  {
    id: 'top-of-the-range',
    name: 'Top of the Range',
    desc: 'Own a Class A car.',
    check: (gs) => gs.ownedCarIds.some((id) => CARS[id].class === 'A'),
  },
  {
    id: 'tuner',
    name: 'Garage Tinkerer',
    desc: 'Install your first tuning part.',
    check: (gs) => Object.values(gs.tuning).some((parts) => parts.length > 0),
  },
  {
    id: 'full-build',
    name: 'Full Build',
    desc: 'Upgrade one car in every category.',
    check: (gs) =>
      Object.values(gs.tuning).some(
        (parts) => activeParts(parts).length >= PART_CATEGORIES.length,
      ),
  },
  {
    id: 'prodigy',
    name: 'Prodigy',
    desc: 'Reach driver level 10.',
    check: (gs) => gs.driver.level >= 10,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    desc: 'Reach driver level 20.',
    check: (gs) => gs.driver.level >= 20,
  },
  {
    id: 'mastery',
    name: 'Mastery',
    desc: 'Develop any driver ability to 90.',
    check: (gs) => Object.values(gs.driver.stats).some((v) => v >= 90),
  },
  {
    id: 'marathon',
    name: 'The Long Haul',
    desc: 'Complete 50 races.',
    check: (gs) => gs.totals.races >= 50,
  },
  {
    id: 'invitation-only',
    name: 'Invitation Only',
    desc: 'Win an Invitational Series event.',
    check: (_gs, ctx) =>
      ctx.type === 'race' && !!ctx.invitational && playerRow(ctx)?.position === 1,
  },
];

/** stamps new unlocks into gs and returns them (for toasts) */
export function evaluateAchievements(
  gs: GameState,
  ctx: AchievementContext,
): AchievementDef[] {
  const unlocked: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (gs.achievements[def.id]) continue;
    let hit = false;
    try {
      hit = def.check(gs, ctx);
    } catch {
      hit = false;
    }
    if (hit) {
      gs.achievements[def.id] = Date.now();
      unlocked.push(def);
    }
  }
  return unlocked;
}
