// The named AI driver roster. Skill tiers roughly track the championship
// ladder: rookies populate the Sunday Cup, aces the National Championship.

import type { DriverStats } from '../sim/types';

export interface AiDriver {
  id: string;
  name: string;
  stats: DriverStats;
}

const d = (
  id: string,
  name: string,
  pace: number,
  consistency: number,
  battle: number,
  smoothness: number,
  stamina: number,
): AiDriver => ({ id, name, stats: { pace, consistency, battle, smoothness, stamina } });

export const AI_DRIVERS: AiDriver[] = [
  // rookies (Sunday Cup tier)
  d('miller', 'J. Miller', 38, 42, 35, 45, 50),
  d('sato', 'K. Sato', 42, 38, 44, 40, 48),
  d('weber', 'F. Weber', 40, 45, 38, 48, 52),
  d('rossi', 'A. Rossi', 45, 36, 48, 38, 46),
  d('tanaka', 'H. Tanaka', 36, 48, 33, 52, 55),
  d('lindqvist', 'E. Lindqvist', 44, 40, 40, 42, 50),
  d('dubois', 'M. Dubois', 41, 43, 42, 44, 47),
  // midfielders (Clubman tier)
  d('okafor', 'C. Okafor', 58, 55, 56, 52, 58),
  d('novak', 'P. Novak', 62, 52, 60, 50, 55),
  d('reyes', 'L. Reyes', 60, 58, 54, 56, 60),
  d('kim', 'S. Kim', 64, 54, 58, 54, 57),
  d('bauer', 'R. Bauer', 57, 60, 52, 58, 62),
  d('costa', 'D. Costa', 61, 56, 62, 51, 54),
  d('yamada', 'N. Yamada', 63, 53, 57, 55, 59),
  // aces (National tier)
  d('vasseur', 'G. Vasseur', 78, 74, 76, 70, 72),
  d('kowalski', 'T. Kowalski', 82, 70, 80, 68, 70),
  d('ibarra', 'V. Ibarra', 80, 76, 74, 72, 74),
  d('schmidt', 'O. Schmidt', 76, 80, 70, 76, 78),
  d('fontaine', 'B. Fontaine', 84, 72, 82, 66, 68),
  d('nakamura', 'R. Nakamura', 81, 75, 78, 71, 73),
  d('hale', 'W. Hale', 79, 77, 72, 74, 75),
];

export const AI_BY_ID: Record<string, AiDriver> = Object.fromEntries(
  AI_DRIVERS.map((a) => [a.id, a]),
);
