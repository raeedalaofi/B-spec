// Every tunable constant in the simulation lives here. Balancing means
// editing this file and re-running the headless harness — never hunting
// magic numbers through sim code.

export const BAL = {
  /** sim timestep (s) */
  tickS: 0.1,
  /** arc-length sampling stride for track compilation (m) */
  sampleStepM: 4,

  // -- physics reference values (car grip / track gripBase multiply these)
  /** lateral acceleration at grip 1.0 (m/s^2) */
  aLatRef: 9.81 * 1.05,
  /** braking deceleration at grip 1.0 */
  aBrakeRef: 9.81 * 1.05,
  /** traction-limited acceleration cap at grip 1.0 */
  aAccelGripRef: 9.81 * 0.85,
  /** ceiling for corner speed caps on straights (m/s) */
  vCapCeiling: 150,

  // -- track zone detection
  /** samples with |curvature| above 1/r are corner candidates */
  cornerRadiusM: 250,
  /** straights for overtaking zones need radius above this */
  straightRadiusM: 420,
  /** minimum straight length feeding a braking zone (m) */
  overtakeMinStraightM: 180,
  /** curvature smoothing window (samples) */
  curvatureSmoothWindow: 9,
  /** merge corner runs separated by less than this many meters */
  cornerMergeGapM: 64,

  // -- pace command multipliers, index 0 unused (levels 1..5)
  paceSpeed: [0, 0.96, 0.98, 1.0, 1.015, 1.025],
  paceWear: [0, 0.6, 0.8, 1.0, 1.35, 1.8],
  paceFuel: [0, 0.85, 0.92, 1.0, 1.07, 1.15],
  paceRisk: [0, 0.5, 0.75, 1.0, 1.6, 2.6],
  paceFatigue: [0, 0.6, 0.8, 1.0, 1.4, 1.9],

  // -- driver skill → corner speed
  /** fDriver = driverSkillBase + driverSkillPer * pace(0..100), corners only */
  driverSkillBase: 0.955,
  driverSkillPer: 0.0009,
  /** corner weighting: skill applies where profile < (1 - window) * profileMax */
  cornerWeightWindow: 0.3,

  // -- lap-time noise (per corner)
  noiseSigmaBase: 0.004,
  noiseSigmaConsistency: 0.01,

  // -- mistakes (rolled per corner entry)
  mistakeBase: 0.0015,
  mistakeConsistency: 2.5,
  mistakeWear: 2.0,
  mistakeFatigue: 1.5,
  /** while overtake mode engaged in a battle */
  mistakeOvertakeMult: 1.4,
  mistakeMinor: { p: 0.7, factor: 0.85, durS: 2 },
  mistakeMajor: { p: 0.25, factor: 0.5, durS: 3, morale: -0.03 },
  mistakeSpin: { factor: 0.05, durS: 6, morale: -0.06 },

  // -- fatigue / morale
  /** fatigue gained per lap at pace 3, stamina 50 */
  fatiguePerLap: 0.012,
  fatigueSpeedLoss: 0.02,
  moraleMin: 0.9,
  moraleMax: 1.1,
  moraleOvertake: 0.02,
  moralePassed: -0.015,
  /** morale multiplies corner speed delta around 1.0 by this fraction */
  moraleEffect: 0.35,

  // -- tires
  tireGripLoss: 0.03,
  tireCliffStart: 0.85,
  tireCliffLoss: 0.06,
  tireSmoothnessSpread: 0.5, // wear mult = 1.25 - spread * smoothness/100
  tireBattleWearMult: 1.2,
  tireWarnAt: [0.7, 0.85],

  // -- fuel
  /** kg per liter */
  fuelDensity: 0.75,
  /** speed loss per kg of fuel */
  fuelWeightLoss: 0.0004,
  /** m/s crawl speed when out of fuel */
  fuelEmptyCrawl: 25,

  // -- battles / overtaking
  battleCatchingGapS: 1.2,
  battleFollowGapS: 0.55,
  /** hard minimum gap while following (s) — the no-ghosting clamp */
  minGapS: 0.35,
  slipstreamMinGapS: 0.2,
  slipstreamMaxGapS: 1.0,
  slipstreamBoost: 1.03,
  passBase: 0.22,
  passPaceDelta: 9.0,
  passBattleDiff: 0.25,
  passOvertakeMode: 0.1,
  passSlipstream: 0.08,
  passZoneDifficulty: 0.15,
  passBlocking: 0.1,
  passMin: 0.03,
  passMax: 0.85,
  /** attempt failure costs the attacker this many seconds of gap */
  passFailGapS: 0.8,
  passingDurS: 2.5,
  passingForceResolveS: 3.0,
  passingAttackerBoost: 1.01,
  passingDefenderLoss: 0.985,
  /** pace advantage (fraction) beyond which anywhere-passes unlock */
  fallbackPassAdvantage: 0.03,
  fallbackPassP: 0.1,
  /** overtake mode runs pace one notch hotter */
  overtakeModePaceBoost: 1,

  // -- pit stops
  pitStationaryBaseS: 2,
  pitTiresS: 10,
  pitFuelPerLiterS: 0.35,
  /** AI pits when wear above / fuel laps below these (with seeded jitter) */
  aiPitWearAt: 0.78,
  aiPitFuelLaps: 1.6,
  aiPitJitter: 0.05,

  // -- race format
  countdownS: 3,
  /** cars are gridded this many meters apart at the start */
  gridSpacingM: 8,
  gridStagger: 0.5,

  // -- driver progression (B-Spec points)
  bspecPosPoints: [25, 18, 14, 10, 8, 6, 4, 2],
  bspecOvertakePts: 2,
  bspecFastestLapPts: 5,
  bspecComebackPts: 3,
  bspecTitlePts: 30,
  levelBase: 40,
  levelPer: 12,
  statPointsPerLevel: 3,
  statSoftCap: 90,
} as const;
