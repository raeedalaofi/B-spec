// The named AI driver roster. Skill tiers roughly track the championship
// ladder: rookies populate the Sunday Cup, aces the National Championship.

import type { DriverStats } from '../sim/types';

export interface AiDriver {
  id: string;
  name: string;
  stats: DriverStats;
  trait: DriverTrait;
}

const d = (
  id: string,
  name: string,
  pace: number,
  consistency: number,
  battle: number,
  smoothness: number,
  stamina: number,
  aggression: number,
  trait: DriverTrait,
): AiDriver => ({
  id,
  name,
  trait,
  stats: { pace, consistency, battle, smoothness, stamina, aggression },
});

/**
 * A driver's public reputation, shown to the player in the rival intel panel.
 * Traits are descriptive labels over the stat spread, not extra mechanics —
 * what they promise is what the numbers already do.
 */
export type DriverTrait =
  | 'wall'        // defends hard, rarely attacks
  | 'lunger'      // attacks constantly, error-prone
  | 'metronome'   // low error rate, relentless pace
  | 'starter'     // strong early, fades as tires go
  | 'closer'      // conserves early, dangerous late
  | 'allrounder';

export const TRAIT_INFO: Record<DriverTrait, { label: string; hint: string }> = {
  wall: { label: 'The Wall', hint: 'Defends brutally. Do not expect a gift — force the error.' },
  lunger: { label: 'The Lunger', hint: 'Always attacking, often too much. Hold your line and wait.' },
  metronome: { label: 'Metronome', hint: 'Never makes a mistake. You will have to out-strategise them.' },
  starter: { label: 'Fast Starter', hint: 'Rockets away early, fades badly on worn tires.' },
  closer: { label: 'The Closer', hint: 'Quiet for most of the race, then comes at you at the end.' },
  allrounder: { label: 'All-Rounder', hint: 'No obvious weakness, no obvious threat.' },
};

export const AI_DRIVERS: AiDriver[] = [
  // rookies (Sunday Cup tier)
  d('miller', 'J. Miller', 38, 42, 35, 45, 50, 44, 'allrounder'),
  d('sato', 'K. Sato', 42, 38, 44, 40, 48, 66, 'lunger'),
  d('weber', 'F. Weber', 40, 45, 38, 48, 52, 34, 'metronome'),
  d('rossi', 'A. Rossi', 45, 36, 48, 38, 46, 72, 'starter'),
  d('tanaka', 'H. Tanaka', 36, 48, 33, 52, 55, 28, 'wall'),
  d('lindqvist', 'E. Lindqvist', 44, 40, 40, 42, 50, 52, 'closer'),
  d('dubois', 'M. Dubois', 41, 43, 42, 44, 47, 48, 'allrounder'),
  // midfielders (Clubman tier)
  d('okafor', 'C. Okafor', 50, 48, 50, 46, 52, 46, 'allrounder'),
  d('novak', 'P. Novak', 55, 44, 54, 44, 50, 74, 'lunger'),
  d('reyes', 'L. Reyes', 52, 51, 47, 50, 54, 38, 'metronome'),
  d('kim', 'S. Kim', 57, 47, 51, 48, 51, 62, 'starter'),
  d('bauer', 'R. Bauer', 49, 53, 45, 52, 56, 30, 'wall'),
  d('costa', 'D. Costa', 53, 49, 55, 45, 48, 68, 'closer'),
  d('yamada', 'N. Yamada', 56, 46, 50, 49, 53, 55, 'allrounder'),
  // aces (National tier)
  d('vasseur', 'G. Vasseur', 66, 62, 64, 60, 62, 50, 'allrounder'),
  d('kowalski', 'T. Kowalski', 71, 58, 68, 56, 60, 76, 'lunger'),
  d('ibarra', 'V. Ibarra', 68, 64, 62, 62, 64, 42, 'metronome'),
  d('schmidt', 'O. Schmidt', 64, 68, 58, 66, 68, 26, 'wall'),
  d('fontaine', 'B. Fontaine', 73, 60, 70, 54, 58, 80, 'starter'),
  d('nakamura', 'R. Nakamura', 69, 63, 66, 61, 63, 58, 'closer'),
  d('hale', 'W. Hale', 67, 65, 60, 64, 65, 45, 'allrounder'),
];

export const AI_BY_ID: Record<string, AiDriver> = Object.fromEntries(
  AI_DRIVERS.map((a) => [a.id, a]),
);
