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
  /** straights (for slipstream) need radius above this */
  straightRadiusM: 420,
  /** zone-walk tolerance: samples count as straight above this radius
   *  (transition bands oscillate, so this is looser than straightRadiusM) */
  zoneStraightRadiusM: 280,
  /** corner runs longer than this get chopped into sub-corners */
  cornerMaxLenM: 240,
  /** minimum straight length feeding a braking zone (m) */
  overtakeMinStraightM: 115,
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
  mistakeBase: 0.0025,
  mistakeConsistency: 2.5,
  mistakeWear: 2.0,
  mistakeFatigue: 1.5,
  mistakeDamage: 1.2,
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

  // -- traffic, battles and overtaking
  //
  // The model has no dice roll for "did the pass work". A follower loses
  // corner grip in dirty air, gains speed in the slipstream on straights,
  // and when it commits it pulls out of line and the move is decided by the
  // ground the two cars actually take off each other. Position is therefore
  // earned by pace, timing and nerve rather than won on a coin flip.

  battleCatchingGapS: 1.6,
  battleFollowGapS: 0.8,
  /** physical car length used for overlap maths (m) */
  carLengthM: 4.5,
  /** absolute minimum bumper-to-bumper gap on the same line (m) */
  minGapM: 3,
  /** gap below which a same-line follower must lift (s) */
  minGapS: 0.35,

  // dirty air: the reason a follower cannot simply drive through the car
  // ahead. Scales with proximity and only bites in corners.
  dirtyAirGapS: 1.1,
  dirtyAirMaxLoss: 0.032,

  // slipstream: the counterweight to dirty air, on straights only
  slipstreamMinGapS: 0.05,
  slipstreamMaxGapS: 1.3,
  slipstreamBoost: 1.055,

  // lateral movement across the road (normalised half-widths per second)
  lateralRate: 1.9,
  /** cars closer than this in normalised lateral space are on the same line */
  lateralOverlap: 0.55,
  /** offset an attacker pulls out to when committing */
  lateralPassLine: 0.85,
  /** corner-speed cost of running off the racing line */
  offLineLoss: 0.036,
  /** extra cost for a defender actively covering the inside */
  defendLoss: 0.028,

  // committing to a move
  /** minimum pace advantage (fraction) to consider a move at all */
  commitMinAdvantage: -0.012,
  /** a driver only pulls out from genuine striking distance (s) */
  commitMaxGapS: 0.5,
  /** base chance per second of committing when a move looks on */
  commitBaseRateHz: 0.3,
  /** how much the driver's aggression scales the commit rate */
  commitAggressionScale: 1.5,
  /** how much a zone's difficulty suppresses committing */
  commitZoneDifficulty: 0.55,
  /** committing outside an overtaking zone is much rarer */
  commitOffZoneScale: 0.2,
  /** seconds before the same attacker may commit again after a failed move */
  commitCooldownS: 6,
  /** seconds before a just-passed defender may counter-attack */
  counterCooldownS: 4,
  /** a move that has not resolved by now is abandoned (s) */
  commitMaxS: 8,

  // Resolving a move. The attacker arrives carrying slipstream momentum and
  // commits to a later braking point; the defender gives up the ideal line to
  // keep the position. The pass is then just arithmetic on those two facts.
  /** attacker's push relative to the defender's actual speed while alongside */
  committedAttackerBoost: 1.045,
  /** defender's cost of racing wheel-to-wheel rather than the ideal line */
  committedDefenderLoss: 0.982,
  /** a defender who has decided not to fight genuinely yields */
  committedConcedeLoss: 0.974,
  /**
   * Extra acceleration available to an attacker mid-move (m/s^2). This is the
   * tow: it is what physically lets a following car out-drag the one ahead.
   * Without it two identical cars both sit on their traction limit out of
   * every corner and no overtake can ever complete, however generous the
   * target speeds are.
   */
  committedTowAccel: 1.05,
  /** metres clear of the defender at which the pass is complete */
  passingClearM: 5,
  /** losing this much ground relative to where the move started abandons it (m) */
  passAbandonM: 8,
  /** a leader slower than this fraction of the follower is simply driven around */
  slowLeaderFrac: 0.55,
  /** overtake mode runs pace one notch hotter and doubles commit appetite */
  overtakeModePaceBoost: 1,
  overtakeModeCommitScale: 2.1,

  // contact: the price of racing too hard, too close
  /** base chance per second of contact while side by side */
  contactBaseRateHz: 0.026,
  /** how much low smoothness raises it */
  contactSmoothnessScale: 1.8,
  contactHeavyP: 0.22,
  contactLightDamage: 0.06,
  contactHeavyDamage: 0.22,
  contactLightFactor: 0.86,
  contactHeavyFactor: 0.45,
  contactLightDurS: 1.6,
  contactHeavyDurS: 3.4,

  // damage: an accumulating tax on the car, and eventually the race
  /** speed lost at full damage */
  damageSpeedLoss: 0.09,
  /** damage above this can end the race */
  damageRetireAt: 0.85,
  /** per-lap chance of retiring while above the threshold */
  damageRetireRateHz: 0.012,
  /** damage taken from a spin */
  spinDamage: 0.05,

  // full-course cautions: rare, and a real strategy fork when they land
  /** cautions allowed per race */
  cautionMaxPerRace: 1,
  /** chance a heavy incident brings out a caution */
  cautionFromContactP: 0.35,
  cautionFromRetirementP: 0.5,
  /** never deploy inside the first or last N laps */
  cautionMinLap: 2,
  cautionEndBufferLaps: 2,
  /** how many laps a caution runs */
  cautionLaps: 2,
  /** field speed under caution, as a fraction of the ideal profile */
  cautionSpeedFrac: 0.62,
  /** target spacing behind the car ahead while bunched (s) */
  cautionSpacingS: 0.7,
  /** how hard the field is pulled toward that spacing */
  cautionBunchRate: 0.5,
  /** consumption while circulating under caution */
  cautionWearFrac: 0.3,
  cautionFuelFrac: 0.55,

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
