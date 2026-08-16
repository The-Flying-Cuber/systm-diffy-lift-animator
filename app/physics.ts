export type Pose = {
  lift: number;
  arm: number;
};

export type PhysicsSettings = {
  cartridgeRpm: 100 | 200 | 600;
  motorsPerGroup: number;
  motorSpoolDiameterIn: number;
  armSpoolDiameterIn: number;
  externalReduction: number;
  riggingMultiplier: number;
  liftTravelIn: number;
  movingWeightLb: number;
  counterbalanceLb: number;
  frictionLb: number;
  mechanismEfficiency: number;
  motorEfficiency: number;
  armMassLb: number;
  armCenterOfMassIn: number;
  payloadMassLb: number;
  payloadDistanceIn: number;
  armFrictionTorqueInLb: number;
};

export type StaticPerformance = {
  totalMotors: number;
  stallTorquePerMotorNm: number;
  effectiveLiftLoadLb: number;
  staticLoadFraction: number;
  loadedMotorRpm: number;
  loadedWinchRpm: number;
  loadedArmRpm: number;
  loadedLiftSpeedInS: number;
  noLoadLiftSpeedInS: number;
  stallLiftForceLb: number;
  safetyFactor: number;
  fullLiftMotorTurns: number;
  fullLiftTimeS: number;
  availableMechanicalW: number;
};

export type TargetPerformance = {
  targetTimeS: number;
  averageLiftSpeedInS: number;
  peakLiftSpeedInS: number;
  peakLiftAccelerationInS2: number;
  requiredPeakMotorRpm: number;
  availableMotorRpmAtPeakSpeed: number;
  requiredPeakForceLb: number;
  dynamicLoadFraction: number;
  dynamicSafetyFactor: number;
  motorSpeedUtilization: number;
  feasible: boolean;
};

export type MotionState = {
  pose: Pose;
  liftVelocityPctS: number;
  liftAccelerationPctS2: number;
  armVelocityDegS: number;
  armAccelerationDegS2: number;
};

export type LiveTelemetry = {
  motorARpm: number;
  motorBRpm: number;
  liftWinchRpm: number;
  armOutputRpm: number;
  availableMotorRpm: number;
  requestedMotorRpm: number;
  speedUtilization: number;
  liftGravityForceLb: number;
  liftFrictionForceLb: number;
  liftAccelerationForceLb: number;
  requiredLiftForceLb: number;
  stallLiftForceLb: number;
  liftMotorTorqueSharedNm: number;
  liftMotorTorquePerGroupNm: number;
  liftMotorTorquePerMotorNm: number;
  armMotorTorqueSharedNm: number;
  armMotorTorquePerGroupNm: number;
  armMotorTorquePerMotorNm: number;
  motorLoadFraction: number;
  liftOutputPowerW: number;
  armOutputPowerW: number;
  mechanicalPowerW: number;
  electricalPowerW: number;
  electricalPowerPerMotorW: number;
  currentPerMotorA: number;
  liftSpeedInS: number;
  liftAccelerationInS2: number;
  armMomentOfInertiaLbIn2: number;
  armGravityTorqueInLb: number;
  armAccelerationTorqueInLb: number;
  armFrictionTorqueInLb: number;
  requiredArmTorqueInLb: number;
  feasible: boolean;
};

export type ArmDynamics = {
  momentOfInertiaKgM2: number;
  momentOfInertiaLbIn2: number;
  maximumGravityTorqueInLb: number;
  gravityTorqueNm: number;
  gravityTorqueInLb: number;
  accelerationTorqueNm: number;
  accelerationTorqueInLb: number;
  frictionTorqueNm: number;
  frictionTorqueInLb: number;
  requiredTorqueNm: number;
  requiredTorqueInLb: number;
};

export type ArmStopScenario = {
  startRpm: number;
  stopTimeS: number;
  effectiveReduction: number;
  pidPeakMultiplier: number;
};

export type ArmStopPerformance = {
  totalMotors: number;
  motorsPerGroup: number;
  stallTorquePerMotorNm: number;
  startAngularSpeedRadS: number;
  averageAngularDecelerationRadS2: number;
  momentOfInertiaKgM2: number;
  maximumGravityOutputTorqueNm: number;
  brakingOutputTorqueNm: number;
  idealHoldingSharedNm: number;
  idealBrakingSharedNm: number;
  idealCombinedSharedNm: number;
  idealCombinedPerGroupNm: number;
  pidAdjustedSharedNm: number;
  lossAdjustedPeakSharedNm: number;
  lossAdjustedPeakPerGroupNm: number;
  lossAdjustedPeakPerMotorNm: number;
  perMotorStallLoadFraction: number;
  withinStallTorque: boolean;
};

export type LiftProfilePerformance = {
  targetTimeS: number;
  totalMotors: number;
  motorsPerGroup: number;
  peakAccelerationInS2: number;
  acceleratingForceLb: number;
  deceleratingForceLb: number;
  acceleratingSharedTorqueNm: number;
  deceleratingSharedTorqueNm: number;
  peakSharedTorqueNm: number;
  peakPerGroupTorqueNm: number;
  peakPerMotorTorqueNm: number;
  peakTorqueLoadFraction: number;
  peakLiftOutputPowerW: number;
  peakMotorMechanicalPowerW: number;
  peakElectricalPowerW: number;
  peakElectricalPowerPerMotorW: number;
  peakCurrentPerMotorA: number;
};

export const COLIN_ARM_STOP_SCENARIO: ArmStopScenario = {
  startRpm: 97.5,
  stopTimeS: 0.1,
  effectiveReduction: 4,
  pidPeakMultiplier: 1.25,
};

export const DEFAULT_PHYSICS: PhysicsSettings = {
  cartridgeRpm: 600,
  motorsPerGroup: 2,
  motorSpoolDiameterIn: 1.5,
  armSpoolDiameterIn: 2,
  externalReduction: 1,
  riggingMultiplier: 1,
  liftTravelIn: 48,
  movingWeightLb: 8,
  counterbalanceLb: 2,
  frictionLb: 0.5,
  mechanismEfficiency: 0.85,
  motorEfficiency: 0.7,
  // These defaults reproduce Colin's two hand checks: 6.5 lbf·in maximum
  // horizontal gravity torque and 42.25 lb·in² point-mass inertia. With a
  // 97.5 RPM arm stopped in 0.1 s through 4:1 gearing, they produce about
  // 0.184 N·m holding + 0.316 N·m braking = 0.500 N·m shared by all motors.
  armMassLb: 1,
  armCenterOfMassIn: 6.5,
  payloadMassLb: 0,
  payloadDistanceIn: 6,
  armFrictionTorqueInLb: 0.5,
};

const INCH_TO_METER = 0.0254;
const POUND_MASS_TO_KG = 0.45359237;
const POUND_FORCE_TO_NEWTON = 4.4482216153;
const IN_LB_TO_NM = 0.112984829;
const PEAK_PROFILE_VELOCITY = 1.5;
const V5_STALL_CURRENT_A = 2.5;
const V5_NO_LOAD_CURRENT_A = 0.15;

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function stallTorquePerMotorNm(cartridgeRpm: number) {
  return 2.1 * (100 / cartridgeRpm);
}

// VEX holds approximately full cartridge speed through about 35% stall torque.
// Above that point this smooth approximation follows the official curve's
// broad power-limited shape and reaches zero at stall.
export function estimatedSpeedFraction(loadFraction: number) {
  const load = clamp(Math.abs(loadFraction), 0, 1);
  if (load <= 0.35) return 1;
  const normalized = (load - 0.35) / 0.65;
  return Math.pow(1 - normalized, 0.45);
}

function safe(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getStaticPerformance(settings: PhysicsSettings): StaticPerformance {
  const totalMotors = Math.max(2, Math.round(settings.motorsPerGroup) * 2);
  const motorRadiusM = safe(settings.motorSpoolDiameterIn, 1.5) * INCH_TO_METER / 2;
  const reduction = safe(settings.externalReduction, 1);
  const rigging = safe(settings.riggingMultiplier, 1);
  const mechanismEfficiency = clamp(settings.mechanismEfficiency, 0.3, 1);
  const effectiveLiftLoadLb = Math.max(0, settings.movingWeightLb - settings.counterbalanceLb)
    + Math.max(0, settings.frictionLb);
  const requiredOutputForceN = effectiveLiftLoadLb * POUND_FORCE_TO_NEWTON;
  const requiredMotorTorqueTotalNm =
    requiredOutputForceN * rigging * motorRadiusM / (reduction * mechanismEfficiency);
  const stallTorque = stallTorquePerMotorNm(settings.cartridgeRpm);
  const staticLoadFraction = requiredMotorTorqueTotalNm / (stallTorque * totalMotors);
  const loadedMotorRpm = settings.cartridgeRpm * estimatedSpeedFraction(staticLoadFraction);
  const loadedWinchRpm = loadedMotorRpm / reduction;
  const loadedArmRpm = loadedWinchRpm
    * safe(settings.motorSpoolDiameterIn, 1.5)
    / safe(settings.armSpoolDiameterIn, 2);
  const loadedLiftSpeedInS = loadedWinchRpm
    * Math.PI * safe(settings.motorSpoolDiameterIn, 1.5)
    * rigging / 60;
  const noLoadLiftSpeedInS = settings.cartridgeRpm / reduction
    * Math.PI * safe(settings.motorSpoolDiameterIn, 1.5)
    * rigging / 60;
  const stallForceN = stallTorque * totalMotors * reduction * mechanismEfficiency
    / (motorRadiusM * rigging);
  const stallLiftForceLb = stallForceN / POUND_FORCE_TO_NEWTON;
  const fullLiftMotorTurns = safe(settings.liftTravelIn, 48)
    / (rigging * Math.PI * safe(settings.motorSpoolDiameterIn, 1.5))
    * reduction;
  const fullLiftTimeS = loadedMotorRpm > 0.01
    ? fullLiftMotorTurns * 60 * PEAK_PROFILE_VELOCITY / loadedMotorRpm
    : Number.POSITIVE_INFINITY;

  return {
    totalMotors,
    stallTorquePerMotorNm: stallTorque,
    effectiveLiftLoadLb,
    staticLoadFraction,
    loadedMotorRpm,
    loadedWinchRpm,
    loadedArmRpm,
    loadedLiftSpeedInS,
    noLoadLiftSpeedInS,
    stallLiftForceLb,
    safetyFactor: effectiveLiftLoadLb > 0 ? stallLiftForceLb / effectiveLiftLoadLb : 99,
    fullLiftMotorTurns,
    fullLiftTimeS,
    availableMechanicalW: totalMotors * 11,
  };
}

export function getTargetPerformance(
  settings: PhysicsSettings,
  targetTimeSeconds: number,
): TargetPerformance {
  const performance = getStaticPerformance(settings);
  const targetTimeS = safe(targetTimeSeconds, performance.fullLiftTimeS);
  const travelIn = safe(settings.liftTravelIn, 48);
  const reduction = safe(settings.externalReduction, 1);
  const rigging = safe(settings.riggingMultiplier, 1);
  const motorDiameterIn = safe(settings.motorSpoolDiameterIn, 1.5);
  const averageLiftSpeedInS = travelIn / targetTimeS;
  const peakLiftSpeedInS = averageLiftSpeedInS * PEAK_PROFILE_VELOCITY;
  const peakLiftAccelerationInS2 = 6 * travelIn / (targetTimeS * targetTimeS);
  const requiredPeakWinchRpm = peakLiftSpeedInS
    / (Math.PI * motorDiameterIn * rigging) * 60;
  const requiredPeakMotorRpm = requiredPeakWinchRpm * reduction;

  const massKg = Math.max(0, settings.movingWeightLb) * 0.45359237;
  const accelerationForceN = massKg * peakLiftAccelerationInS2 * INCH_TO_METER;
  const staticForceN = performance.effectiveLiftLoadLb * POUND_FORCE_TO_NEWTON;
  const requiredPeakForceN = staticForceN + accelerationForceN;
  const requiredPeakForceLb = requiredPeakForceN / POUND_FORCE_TO_NEWTON;
  const dynamicLoadFraction = performance.stallLiftForceLb > 0
    ? requiredPeakForceLb / performance.stallLiftForceLb
    : Number.POSITIVE_INFINITY;
  const dynamicSafetyFactor = requiredPeakForceLb > 0
    ? performance.stallLiftForceLb / requiredPeakForceLb
    : 99;
  // Smoothstep reaches maximum speed at mid-stroke, where acceleration is
  // zero. Check the RPM demand against the gravity/friction-loaded speed at
  // that instant; the separate dynamic safety factor checks peak acceleration
  // near the beginning and end of the move.
  const availableMotorRpmAtPeakSpeed = performance.loadedMotorRpm;
  const motorSpeedUtilization = availableMotorRpmAtPeakSpeed > 0
    ? requiredPeakMotorRpm / availableMotorRpmAtPeakSpeed
    : Number.POSITIVE_INFINITY;

  return {
    targetTimeS,
    averageLiftSpeedInS,
    peakLiftSpeedInS,
    peakLiftAccelerationInS2,
    requiredPeakMotorRpm,
    availableMotorRpmAtPeakSpeed,
    requiredPeakForceLb,
    dynamicLoadFraction,
    dynamicSafetyFactor,
    motorSpeedUtilization,
    feasible: dynamicLoadFraction < 1 && motorSpeedUtilization <= 1.02,
  };
}

export function differentialTurns(from: Pose, to: Pose, settings: PhysicsSettings) {
  const reduction = safe(settings.externalReduction, 1);
  const rigging = safe(settings.riggingMultiplier, 1);
  const motorDiameter = safe(settings.motorSpoolDiameterIn, 1.5);
  const armDiameter = safe(settings.armSpoolDiameterIn, 2);
  const liftTravel = (to.lift - from.lift) / 100 * safe(settings.liftTravelIn, 48);
  const liftMotorTurns = liftTravel / (rigging * Math.PI * motorDiameter) * reduction;
  const armMotorTurns = (to.arm - from.arm) / 360 * (armDiameter / motorDiameter) * reduction;

  return {
    liftMotorTurns,
    armMotorTurns,
    motorATurns: liftMotorTurns + armMotorTurns,
    motorBTurns: -liftMotorTurns + armMotorTurns,
  };
}

export function getArmDynamics(
  settings: PhysicsSettings,
  motion: Pick<MotionState, "pose" | "armVelocityDegS" | "armAccelerationDegS2">,
): ArmDynamics {
  const armMassLb = Math.max(0, settings.armMassLb);
  const armCenterOfMassIn = Math.max(0, settings.armCenterOfMassIn);
  const payloadMassLb = Math.max(0, settings.payloadMassLb);
  const payloadDistanceIn = Math.max(0, settings.payloadDistanceIn);

  // Colin's I = mr² approximation treats the arm and payload as point masses
  // located at their entered radii from the pivot.
  const momentOfInertiaLbIn2 = armMassLb * armCenterOfMassIn ** 2
    + payloadMassLb * payloadDistanceIn ** 2;
  const momentOfInertiaKgM2 = momentOfInertiaLbIn2
    * POUND_MASS_TO_KG * INCH_TO_METER ** 2;

  // The visual and command system define 0° as straight up. Gravity torque is
  // therefore zero at the top/bottom and maximum at ±90° (horizontal).
  const maximumGravityTorqueInLb = armMassLb * armCenterOfMassIn
    + payloadMassLb * payloadDistanceIn;
  const angleFromVerticalRad = motion.pose.arm * Math.PI / 180;
  const gravityTorqueInLb = maximumGravityTorqueInLb * Math.sin(angleFromVerticalRad);
  const gravityTorqueNm = gravityTorqueInLb * IN_LB_TO_NM;

  const angularAccelerationRadS2 = motion.armAccelerationDegS2 * Math.PI / 180;
  const accelerationTorqueNm = momentOfInertiaKgM2 * angularAccelerationRadS2;
  const accelerationTorqueInLb = accelerationTorqueNm / IN_LB_TO_NM;

  const motionDirection = Math.abs(motion.armVelocityDegS) > 0.001
    ? Math.sign(motion.armVelocityDegS)
    : Math.abs(motion.armAccelerationDegS2) > 0.001
      ? Math.sign(motion.armAccelerationDegS2)
      : 0;
  const frictionTorqueInLb = Math.max(0, settings.armFrictionTorqueInLb) * motionDirection;
  const frictionTorqueNm = frictionTorqueInLb * IN_LB_TO_NM;
  const requiredTorqueNm = gravityTorqueNm + accelerationTorqueNm + frictionTorqueNm;

  return {
    momentOfInertiaKgM2,
    momentOfInertiaLbIn2,
    maximumGravityTorqueInLb,
    gravityTorqueNm,
    gravityTorqueInLb,
    accelerationTorqueNm,
    accelerationTorqueInLb,
    frictionTorqueNm,
    frictionTorqueInLb,
    requiredTorqueNm,
    requiredTorqueInLb: requiredTorqueNm / IN_LB_TO_NM,
  };
}

export function getArmStopPerformance(
  settings: PhysicsSettings,
  scenario: ArmStopScenario,
): ArmStopPerformance {
  const performance = getStaticPerformance(settings);
  const effectiveReduction = safe(scenario.effectiveReduction, 1);
  const stopTimeS = safe(scenario.stopTimeS, 0.1);
  const startRpm = Math.max(0, finite(scenario.startRpm));
  const pidPeakMultiplier = Math.max(1, finite(scenario.pidPeakMultiplier, 1));
  const mechanismEfficiency = clamp(settings.mechanismEfficiency, 0.3, 1);

  const horizontalArm = getArmDynamics(settings, {
    pose: { lift: 0, arm: 90 },
    armVelocityDegS: 0,
    armAccelerationDegS2: 0,
  });
  const startAngularSpeedRadS = startRpm * 2 * Math.PI / 60;
  const averageAngularDecelerationRadS2 = startAngularSpeedRadS / stopTimeS;
  const maximumGravityOutputTorqueNm = Math.abs(horizontalArm.gravityTorqueNm);
  const brakingOutputTorqueNm = horizontalArm.momentOfInertiaKgM2
    * averageAngularDecelerationRadS2;

  // These three ideal values are motor-side totals shared by every arm motor.
  // They intentionally exclude efficiency and PID overshoot so Colin's hand
  // calculation remains visible and directly comparable.
  const idealHoldingSharedNm = maximumGravityOutputTorqueNm / effectiveReduction;
  const idealBrakingSharedNm = brakingOutputTorqueNm / effectiveReduction;
  const idealCombinedSharedNm = idealHoldingSharedNm + idealBrakingSharedNm;
  const pidAdjustedSharedNm = idealHoldingSharedNm
    + idealBrakingSharedNm * pidPeakMultiplier;
  const lossAdjustedPeakSharedNm = pidAdjustedSharedNm / mechanismEfficiency;
  const motorsPerGroup = performance.totalMotors / 2;
  const idealCombinedPerGroupNm = idealCombinedSharedNm / 2;
  const lossAdjustedPeakPerGroupNm = lossAdjustedPeakSharedNm / 2;
  const lossAdjustedPeakPerMotorNm = lossAdjustedPeakSharedNm / performance.totalMotors;
  const perMotorStallLoadFraction = performance.stallTorquePerMotorNm > 0
    ? lossAdjustedPeakPerMotorNm / performance.stallTorquePerMotorNm
    : Number.POSITIVE_INFINITY;

  return {
    totalMotors: performance.totalMotors,
    motorsPerGroup,
    stallTorquePerMotorNm: performance.stallTorquePerMotorNm,
    startAngularSpeedRadS,
    averageAngularDecelerationRadS2,
    momentOfInertiaKgM2: horizontalArm.momentOfInertiaKgM2,
    maximumGravityOutputTorqueNm,
    brakingOutputTorqueNm,
    idealHoldingSharedNm,
    idealBrakingSharedNm,
    idealCombinedSharedNm,
    idealCombinedPerGroupNm,
    pidAdjustedSharedNm,
    lossAdjustedPeakSharedNm,
    lossAdjustedPeakPerGroupNm,
    lossAdjustedPeakPerMotorNm,
    perMotorStallLoadFraction,
    withinStallTorque: perMotorStallLoadFraction < 1,
  };
}

export function minimumMoveDuration(from: Pose, to: Pose, settings: PhysicsSettings) {
  const performance = getStaticPerformance(settings);
  const turns = differentialTurns(from, to, settings);
  const largestMotorMove = Math.max(Math.abs(turns.motorATurns), Math.abs(turns.motorBTurns));

  if (largestMotorMove < 0.000001) return 0;
  if (performance.loadedMotorRpm < 0.01) return Number.POSITIVE_INFINITY;
  const kinematicMinimum = largestMotorMove * 60 * PEAK_PROFILE_VELOCITY
    / performance.loadedMotorRpm;

  const liftDelta = to.lift - from.lift;
  const armDelta = to.arm - from.arm;
  const fitsDuration = (duration: number) => {
    // Sample the same smoothstep trajectory used by the animation. This makes
    // the physics limiter account for arm gravity and Iα, not RPM alone.
    for (let index = 0; index <= 40; index += 1) {
      const normalized = index / 40;
      const progress = normalized * normalized * (3 - 2 * normalized);
      const velocityScale = 6 * normalized * (1 - normalized) / duration;
      const accelerationScale = (6 - 12 * normalized) / (duration * duration);
      const telemetry = getLiveTelemetry(settings, {
        pose: {
          lift: from.lift + liftDelta * progress,
          arm: from.arm + armDelta * progress,
        },
        liftVelocityPctS: liftDelta * velocityScale,
        liftAccelerationPctS2: liftDelta * accelerationScale,
        armVelocityDegS: armDelta * velocityScale,
        armAccelerationDegS2: armDelta * accelerationScale,
      });
      if (!telemetry.feasible) return false;
    }
    return true;
  };

  let lower = Math.max(0.05, kinematicMinimum);
  if (fitsDuration(lower)) return lower;

  let upper = Math.max(0.1, lower * 1.5);
  while (upper < 30 && !fitsDuration(upper)) upper *= 1.5;
  upper = Math.min(30, upper);
  if (!fitsDuration(upper)) return Number.POSITIVE_INFINITY;

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (fitsDuration(middle)) upper = middle;
    else lower = middle;
  }
  return upper;
}

export function getLiveTelemetry(
  settings: PhysicsSettings,
  motion: MotionState,
): LiveTelemetry {
  const performance = getStaticPerformance(settings);
  const totalMotors = performance.totalMotors;
  const reduction = safe(settings.externalReduction, 1);
  const rigging = safe(settings.riggingMultiplier, 1);
  const motorDiameter = safe(settings.motorSpoolDiameterIn, 1.5);
  const armDiameter = safe(settings.armSpoolDiameterIn, 2);
  const motorRadiusM = motorDiameter * INCH_TO_METER / 2;
  const mechanismEfficiency = clamp(settings.mechanismEfficiency, 0.3, 1);
  const motorEfficiency = clamp(settings.motorEfficiency, 0.3, 0.95);

  const liftSpeedInS = motion.liftVelocityPctS / 100 * safe(settings.liftTravelIn, 48);
  const liftAccelerationInS2 = motion.liftAccelerationPctS2 / 100 * safe(settings.liftTravelIn, 48);
  const liftWinchRpm = liftSpeedInS / rigging / (Math.PI * motorDiameter) * 60;
  const liftMotorRpm = liftWinchRpm * reduction;
  const armOutputRpm = motion.armVelocityDegS / 360 * 60;
  const armMotorRpm = armOutputRpm * (armDiameter / motorDiameter) * reduction;
  const motorARpm = liftMotorRpm + armMotorRpm;
  const motorBRpm = -liftMotorRpm + armMotorRpm;
  const requestedMotorRpm = Math.max(Math.abs(motorARpm), Math.abs(motorBRpm));

  const massKg = Math.max(0, settings.movingWeightLb) * 0.45359237;
  const gravityLoadN = Math.max(0, settings.movingWeightLb - settings.counterbalanceLb)
    * POUND_FORCE_TO_NEWTON;
  const frictionDirection = Math.abs(liftSpeedInS) > 0.001 ? Math.sign(liftSpeedInS) : 0;
  const frictionN = Math.max(0, settings.frictionLb) * POUND_FORCE_TO_NEWTON * frictionDirection;
  const accelerationN = massKg * liftAccelerationInS2 * INCH_TO_METER;
  const requiredLiftForceN = gravityLoadN + frictionN + accelerationN;
  const requiredLiftForceLb = requiredLiftForceN / POUND_FORCE_TO_NEWTON;

  const liftTorqueTotalNm = requiredLiftForceN * rigging * motorRadiusM
    / (reduction * mechanismEfficiency);
  const armDynamics = getArmDynamics(settings, motion);
  const armTorqueSharedNm = armDynamics.requiredTorqueNm * (motorDiameter / armDiameter)
    / (reduction * mechanismEfficiency);
  const armTorquePerMotorNm = armTorqueSharedNm / totalMotors;
  const liftTorquePerMotorNm = liftTorqueTotalNm / totalMotors;
  const groupATorque = liftTorquePerMotorNm + armTorquePerMotorNm;
  const groupBTorque = -liftTorquePerMotorNm + armTorquePerMotorNm;
  const worstMotorTorque = Math.max(Math.abs(groupATorque), Math.abs(groupBTorque));
  const motorLoadFraction = worstMotorTorque / performance.stallTorquePerMotorNm;

  const liftOutputPowerW = requiredLiftForceN * liftSpeedInS * INCH_TO_METER;
  const armOutputPowerW = armDynamics.requiredTorqueNm
    * motion.armVelocityDegS * Math.PI / 180;
  const mechanicalPowerW = (Math.abs(liftOutputPowerW) + Math.abs(armOutputPowerW))
    / mechanismEfficiency;
  const modeledElectricalFromWork = mechanicalPowerW / motorEfficiency;
  const currentPerMotorA = V5_NO_LOAD_CURRENT_A
    + (V5_STALL_CURRENT_A - V5_NO_LOAD_CURRENT_A) * clamp(motorLoadFraction, 0, 1);
  const torqueBasedElectricalW = totalMotors * Math.min(22, 1.5 + 20.5 * clamp(motorLoadFraction, 0, 1));
  // The V5 API reports up to 22 W per motor. Cap the estimate at that
  // observable range while the feasibility flag separately exposes overloads.
  const electricalPowerW = Math.min(
    totalMotors * 22,
    Math.max(modeledElectricalFromWork, torqueBasedElectricalW),
  );
  const electricalPowerPerMotorW = electricalPowerW / totalMotors;
  const availableMotorRpm = settings.cartridgeRpm * estimatedSpeedFraction(motorLoadFraction);
  const speedUtilization = availableMotorRpm > 0
    ? requestedMotorRpm / availableMotorRpm
    : Number.POSITIVE_INFINITY;

  return {
    motorARpm,
    motorBRpm,
    liftWinchRpm,
    armOutputRpm,
    availableMotorRpm,
    requestedMotorRpm,
    speedUtilization,
    liftGravityForceLb: gravityLoadN / POUND_FORCE_TO_NEWTON,
    liftFrictionForceLb: frictionN / POUND_FORCE_TO_NEWTON,
    liftAccelerationForceLb: accelerationN / POUND_FORCE_TO_NEWTON,
    requiredLiftForceLb,
    stallLiftForceLb: performance.stallLiftForceLb,
    liftMotorTorqueSharedNm: liftTorqueTotalNm,
    liftMotorTorquePerGroupNm: liftTorqueTotalNm / 2,
    liftMotorTorquePerMotorNm: liftTorquePerMotorNm,
    armMotorTorqueSharedNm: armTorqueSharedNm,
    armMotorTorquePerGroupNm: armTorqueSharedNm / 2,
    armMotorTorquePerMotorNm: armTorquePerMotorNm,
    motorLoadFraction,
    liftOutputPowerW,
    armOutputPowerW,
    mechanicalPowerW,
    electricalPowerW,
    electricalPowerPerMotorW,
    currentPerMotorA,
    liftSpeedInS,
    liftAccelerationInS2,
    armMomentOfInertiaLbIn2: armDynamics.momentOfInertiaLbIn2,
    armGravityTorqueInLb: armDynamics.gravityTorqueInLb,
    armAccelerationTorqueInLb: armDynamics.accelerationTorqueInLb,
    armFrictionTorqueInLb: armDynamics.frictionTorqueInLb,
    requiredArmTorqueInLb: armDynamics.requiredTorqueInLb,
    feasible: speedUtilization <= 1.02 && motorLoadFraction < 1,
  };
}

export function getLiftProfilePerformance(
  settings: PhysicsSettings,
  targetTimeSeconds: number,
): LiftProfilePerformance {
  const performance = getStaticPerformance(settings);
  const targetTimeS = safe(targetTimeSeconds, performance.fullLiftTimeS);
  const peakAccelerationPctS2 = 600 / (targetTimeS * targetTimeS);
  const peakAccelerationInS2 = peakAccelerationPctS2 / 100
    * safe(settings.liftTravelIn, 48);

  // A tiny positive velocity applies upward-travel friction at the two torque
  // endpoints without materially changing the acceleration calculation.
  const accelerating = getLiveTelemetry(settings, {
    pose: { lift: 0, arm: 0 },
    liftVelocityPctS: 0.01,
    liftAccelerationPctS2: peakAccelerationPctS2,
    armVelocityDegS: 0,
    armAccelerationDegS2: 0,
  });
  const decelerating = getLiveTelemetry(settings, {
    pose: { lift: 100, arm: 0 },
    liftVelocityPctS: 0.01,
    liftAccelerationPctS2: -peakAccelerationPctS2,
    armVelocityDegS: 0,
    armAccelerationDegS2: 0,
  });

  let peakSharedTorqueNm = Math.max(
    Math.abs(accelerating.liftMotorTorqueSharedNm),
    Math.abs(decelerating.liftMotorTorqueSharedNm),
  );
  let peakLiftOutputPowerW = 0;
  let peakMotorMechanicalPowerW = 0;
  let peakElectricalPowerW = 0;
  let peakCurrentPerMotorA = 0;

  for (let index = 0; index <= 200; index += 1) {
    const normalized = index / 200;
    const progress = normalized * normalized * (3 - 2 * normalized);
    const velocityScale = 6 * normalized * (1 - normalized) / targetTimeS;
    const accelerationScale = (6 - 12 * normalized) / (targetTimeS * targetTimeS);
    const sample = getLiveTelemetry(settings, {
      pose: { lift: 100 * progress, arm: 0 },
      liftVelocityPctS: 100 * velocityScale,
      liftAccelerationPctS2: 100 * accelerationScale,
      armVelocityDegS: 0,
      armAccelerationDegS2: 0,
    });

    peakSharedTorqueNm = Math.max(
      peakSharedTorqueNm,
      Math.abs(sample.liftMotorTorqueSharedNm),
    );
    peakLiftOutputPowerW = Math.max(peakLiftOutputPowerW, Math.abs(sample.liftOutputPowerW));
    peakMotorMechanicalPowerW = Math.max(peakMotorMechanicalPowerW, sample.mechanicalPowerW);
    peakElectricalPowerW = Math.max(peakElectricalPowerW, sample.electricalPowerW);
    peakCurrentPerMotorA = Math.max(peakCurrentPerMotorA, sample.currentPerMotorA);
  }

  const peakPerMotorTorqueNm = peakSharedTorqueNm / performance.totalMotors;

  return {
    targetTimeS,
    totalMotors: performance.totalMotors,
    motorsPerGroup: performance.totalMotors / 2,
    peakAccelerationInS2,
    acceleratingForceLb: accelerating.requiredLiftForceLb,
    deceleratingForceLb: decelerating.requiredLiftForceLb,
    acceleratingSharedTorqueNm: accelerating.liftMotorTorqueSharedNm,
    deceleratingSharedTorqueNm: decelerating.liftMotorTorqueSharedNm,
    peakSharedTorqueNm,
    peakPerGroupTorqueNm: peakSharedTorqueNm / 2,
    peakPerMotorTorqueNm,
    peakTorqueLoadFraction: peakPerMotorTorqueNm / performance.stallTorquePerMotorNm,
    peakLiftOutputPowerW,
    peakMotorMechanicalPowerW,
    peakElectricalPowerW,
    peakElectricalPowerPerMotorW: peakElectricalPowerW / performance.totalMotors,
    peakCurrentPerMotorA,
  };
}

export function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
