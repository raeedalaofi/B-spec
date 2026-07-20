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
  d('okafor', 'C. Okafor', 50, 48, 50, 46, 52),
  d('novak', 'P. Novak', 55, 44, 54, 44, 50),
  d('reyes', 'L. Reyes', 52, 51, 47, 50, 54),
  d('kim', 'S. Kim', 57, 47, 51, 48, 51),
  d('bauer', 'R. Bauer', 49, 53, 45, 52, 56),
  d('costa', 'D. Costa', 53, 49, 55, 45, 48),
  d('yamada', 'N. Yamada', 56, 46, 50, 49, 53),
  // aces (National tier)
  d('vasseur', 'G. Vasseur', 66, 62, 64, 60, 62),
  d('kowalski', 'T. Kowalski', 71, 58, 68, 56, 60),
  d('ibarra', 'V. Ibarra', 68, 64, 62, 62, 64),
  d('schmidt', 'O. Schmidt', 64, 68, 58, 66, 68),
  d('fontaine', 'B. Fontaine', 73, 60, 70, 54, 58),
  d('nakamura', 'R. Nakamura', 69, 63, 66, 61, 63),
  d('hale', 'W. Hale', 67, 65, 60, 64, 65),
];

export const AI_BY_ID: Record<string, AiDriver> = Object.fromEntries(
  AI_DRIVERS.map((a) => [a.id, a]),
);
