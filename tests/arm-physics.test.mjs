import assert from "node:assert/strict";
import test from "node:test";

import {
  COLIN_ARM_STOP_SCENARIO,
  DEFAULT_PHYSICS,
  getArmDynamics,
  getArmStopPerformance,
  getLiftProfilePerformance,
  getLiveTelemetry,
  minimumMoveDuration,
} from "../app/physics.ts";

const armDynamicsAt = (arm, armAccelerationDegS2 = 0, armVelocityDegS = 0) =>
  getArmDynamics(DEFAULT_PHYSICS, {
    pose: { lift: 0, arm },
    armAccelerationDegS2,
    armVelocityDegS,
  });

test("arm gravity torque is zero vertically and 6.5 lbf·in horizontally", () => {
  assert.ok(Math.abs(armDynamicsAt(0).gravityTorqueInLb) < 1e-9);
  assert.ok(Math.abs(armDynamicsAt(90).gravityTorqueInLb - 6.5) < 1e-9);
  assert.ok(Math.abs(armDynamicsAt(180).gravityTorqueInLb) < 1e-9);
});

test("default point-mass inertia and angular acceleration add arm torque", () => {
  const still = armDynamicsAt(0);
  const accelerating = armDynamicsAt(0, 360);

  assert.equal(still.momentOfInertiaLbIn2, 42.25);
  assert.ok(accelerating.accelerationTorqueInLb > 0.5);
  assert.ok(accelerating.requiredTorqueInLb > still.requiredTorqueInLb);
});

test("Colin stop preset produces 0.5 N·m shared before losses", () => {
  const result = getArmStopPerformance(DEFAULT_PHYSICS, COLIN_ARM_STOP_SCENARIO);

  assert.ok(Math.abs(result.idealHoldingSharedNm - 0.184) < 0.005);
  assert.ok(Math.abs(result.idealBrakingSharedNm - 0.316) < 0.005);
  assert.ok(Math.abs(result.idealCombinedSharedNm - 0.5) < 0.01);
  assert.equal(result.totalMotors, 4);
  assert.equal(result.motorsPerGroup, 2);
  assert.ok(Math.abs(result.idealCombinedPerGroupNm * 2 - result.idealCombinedSharedNm) < 1e-12);
  assert.ok(Math.abs(result.lossAdjustedPeakPerGroupNm * 2 - result.lossAdjustedPeakSharedNm) < 1e-12);
  assert.ok(
    Math.abs(
      result.lossAdjustedPeakPerMotorNm
      - result.lossAdjustedPeakSharedNm / result.totalMotors,
    ) < 1e-12,
  );
  assert.ok(result.perMotorStallLoadFraction > 0);
  assert.ok(result.perMotorStallLoadFraction < 1);
});

test("lift acceleration, deceleration, torque sharing, and power are modeled", () => {
  assert.equal(DEFAULT_PHYSICS.movingWeightLb, 8);

  const accelerating = getLiveTelemetry(DEFAULT_PHYSICS, {
    pose: { lift: 40, arm: 0 },
    liftVelocityPctS: 50,
    liftAccelerationPctS2: 400 / DEFAULT_PHYSICS.liftTravelIn * 100,
    armVelocityDegS: 0,
    armAccelerationDegS2: 0,
  });
  const decelerating = getLiveTelemetry(DEFAULT_PHYSICS, {
    pose: { lift: 60, arm: 0 },
    liftVelocityPctS: 50,
    liftAccelerationPctS2: -400 / DEFAULT_PHYSICS.liftTravelIn * 100,
    armVelocityDegS: 0,
    armAccelerationDegS2: 0,
  });

  assert.ok(accelerating.liftAccelerationForceLb > 0);
  assert.ok(decelerating.liftAccelerationForceLb < 0);
  assert.ok(accelerating.requiredLiftForceLb > decelerating.requiredLiftForceLb);
  assert.ok(Math.abs(accelerating.liftMotorTorquePerGroupNm * 2
    - accelerating.liftMotorTorqueSharedNm) < 1e-12);
  assert.ok(Math.abs(accelerating.liftMotorTorquePerMotorNm * 4
    - accelerating.liftMotorTorqueSharedNm) < 1e-12);
  assert.ok(Math.abs(accelerating.electricalPowerPerMotorW * 4
    - accelerating.electricalPowerW) < 1e-12);
  assert.ok(accelerating.liftOutputPowerW > 0);

  const profile = getLiftProfilePerformance(DEFAULT_PHYSICS, 0.727);
  assert.equal(profile.totalMotors, 4);
  assert.equal(profile.motorsPerGroup, 2);
  assert.ok(profile.acceleratingSharedTorqueNm > profile.deceleratingSharedTorqueNm);
  assert.ok(profile.peakLiftOutputPowerW > 0);
  assert.ok(profile.peakElectricalPowerW > 0);
  assert.ok(profile.peakElectricalPowerPerMotorW <= 22);
  assert.ok(profile.peakCurrentPerMotorA <= 2.5);
});

test("live load and duration checks include the dynamic arm model", () => {
  const still = getLiveTelemetry(DEFAULT_PHYSICS, {
    pose: { lift: 0, arm: 90 },
    liftVelocityPctS: 0,
    liftAccelerationPctS2: 0,
    armVelocityDegS: 0,
    armAccelerationDegS2: 0,
  });
  const accelerating = getLiveTelemetry(DEFAULT_PHYSICS, {
    pose: { lift: 0, arm: 90 },
    liftVelocityPctS: 0,
    liftAccelerationPctS2: 0,
    armVelocityDegS: 0,
    armAccelerationDegS2: 360,
  });

  assert.ok(Math.abs(still.requiredArmTorqueInLb - 6.5) < 1e-9);
  assert.ok(accelerating.requiredArmTorqueInLb > still.requiredArmTorqueInLb);

  const duration = minimumMoveDuration(
    { lift: 0, arm: 0 },
    { lift: 100, arm: 270 },
    DEFAULT_PHYSICS,
  );
  assert.ok(Number.isFinite(duration));
  assert.ok(duration > 0);
});
