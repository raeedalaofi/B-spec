// The Invitational Series: the endless endgame, unlocked by the National
// Championship title. Events are generated deterministically from the
// player's invitational counter — rotating tracks, ace rosters and
// arrow-heavy fields with prize money that scales with your streak.

import { hashSeed, rngNext } from '../sim/rng';
import { AI_DRIVERS } from './aidrivers';
import { TRACK_DEFS } from './tracks';

export interface InvitationalDef {
  n: number;
  name: string;
  trackId: string;
  laps: number;
  aiDriverIds: string[];
  aiCarIds: string[];
  prize: number[];
}

const NAMES = [
  'Champions Invitational',
  'Masters Showdown',
  'Legends Trophy',
  'Elite Grand Prix',
  'Directors Cup',
];

const BASE_PRIZE = [18000, 12000, 8500, 6200, 4600, 3500, 2600, 1900];

export function generateInvitational(n: number): InvitationalDef {
  const rng = { rngState: hashSeed(`invitational-${n}`) };
  const trackIds = Object.keys(TRACK_DEFS);
  const trackId = trackIds[n % trackIds.length];
  const laps = 10 + Math.floor(rngNext(rng) * 3) * 3; // 10, 13 or 16
  // ace roster, rotated + shuffled a little each event
  const aces = AI_DRIVERS.slice(14).map((d) => d.id);
  for (let i = aces.length - 1; i > 0; i--) {
    const j = Math.floor(rngNext(rng) * (i + 1));
    [aces[i], aces[j]] = [aces[j], aces[i]];
  }
  // fields get more arrows as your streak grows
  const arrows = Math.min(6, 3 + Math.floor(n / 2));
  const aiCarIds = Array.from({ length: 7 }, (_, i) => (i < arrows ? 'arrow' : 'phantom'));
  // prize scales with streak, capped at +150%
  const scale = 1 + Math.min(1.5, n * 0.12);
  return {
    n,
    name: `${NAMES[n % NAMES.length]} #${n + 1}`,
    trackId,
    laps,
    aiDriverIds: aces.slice(0, 7),
    aiCarIds,
    prize: BASE_PRIZE.map((p) => Math.round((p * scale) / 100) * 100),
  };
}
