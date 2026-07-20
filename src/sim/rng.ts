// Seeded PRNG (mulberry32). The integer state lives inside RaceState so a
// race is fully determined by (config, seed, command log) and serializable.

export interface RngCarrier {
  rngState: number;
}

/** uniform [0, 1) */
export function rngNext(carrier: RngCarrier): number {
  carrier.rngState = (carrier.rngState + 0x6d2b79f5) | 0;
  let t = carrier.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** standard normal via Box-Muller, clamped to ±clampSigma */
export function rngGaussian(carrier: RngCarrier, clampSigma = 2.5): number {
  const u1 = Math.max(rngNext(carrier), 1e-12);
  const u2 = rngNext(carrier);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-clampSigma, Math.min(clampSigma, z));
}

/** deterministic 32-bit hash of a string (for deriving seeds) */
export function hashSeed(s: string): number {
  let h = 2166136261 | 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h | 0;
}
