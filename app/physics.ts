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
  armLoadTorqueInLb: number;
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
  requiredLiftForceLb: number;
  stallLiftForceLb: number;
  motorLoadFraction: number;
  mechanicalPowerW: number;
  electricalPowerW: number;
  currentPerMotorA: number;
  liftSpeedInS: number;
  liftAccelerationInS2: number;
  feasible: boolean;
};

export const DEFAULT_PHYSICS: PhysicsSettings = {
  cartridgeRpm: 600,
  motorsPerGroup: 2,
  motorSpoolDiameterIn: 1.5,
  armSpoolDiameterIn: 2,
  externalReduction: 1,
  riggingMultiplier: 1,
  liftTravelIn: 48,
  movingWeightLb: 6,
  counterbalanceLb: 2,
  frictionLb: 0.5,
  mechanismEfficiency: 0.85,
  motorEfficiency: 0.7,
  armLoadTorqueInLb: 0.5,
};

const INCH_TO_METER = 0.0254;
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

export function minimumMoveDuration(from: Pose, to: Pose, settings: PhysicsSettings) {
  const performance = getStaticPerformance(settings);
  const turns = differentialTurns(from, to, settings);
  const largestMotorMove = Math.max(Math.abs(turns.motorATurns), Math.abs(turns.motorBTurns));

  if (largestMotorMove < 0.000001) return 0;
  if (performance.loadedMotorRpm < 0.01) return Number.POSITIVE_INFINITY;
  return largestMotorMove * 60 * PEAK_PROFILE_VELOCITY / performance.loadedMotorRpm;
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
  const armTorqueOutputNm = Math.max(0, settings.armLoadTorqueInLb) * IN_LB_TO_NM;
  const armDirection = Math.abs(motion.armVelocityDegS) > 0.001
    ? Math.sign(motion.armVelocityDegS)
    : 0;
  const armTorquePerMotorNm = armTorqueOutputNm * (motorDiameter / armDiameter)
    / (reduction * mechanismEfficiency * totalMotors) * armDirection;
  const liftTorquePerMotorNm = liftTorqueTotalNm / totalMotors;
  const groupATorque = liftTorquePerMotorNm + armTorquePerMotorNm;
  const groupBTorque = -liftTorquePerMotorNm + armTorquePerMotorNm;
  const worstMotorTorque = Math.max(Math.abs(groupATorque), Math.abs(groupBTorque));
  const motorLoadFraction = worstMotorTorque / performance.stallTorquePerMotorNm;

  const liftOutputPowerW = requiredLiftForceN * liftSpeedInS * INCH_TO_METER;
  const armOutputPowerW = armTorqueOutputNm * Math.abs(motion.armVelocityDegS) * Math.PI / 180;
  const mechanicalPowerW = (Math.abs(liftOutputPowerW) + armOutputPowerW) / mechanismEfficiency;
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
  const speedUtilization = performance.loadedMotorRpm > 0
    ? requestedMotorRpm / performance.loadedMotorRpm
    : Number.POSITIVE_INFINITY;

  return {
    motorARpm,
    motorBRpm,
    liftWinchRpm,
    armOutputRpm,
    availableMotorRpm: performance.loadedMotorRpm,
    requestedMotorRpm,
    speedUtilization,
    requiredLiftForceLb,
    stallLiftForceLb: performance.stallLiftForceLb,
    motorLoadFraction,
    mechanicalPowerW,
    electricalPowerW,
    currentPerMotorA,
    liftSpeedInS,
    liftAccelerationInS2,
    feasible: speedUtilization <= 1.02 && motorLoadFraction < 1,
  };
}

export function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
