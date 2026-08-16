"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COLIN_ARM_STOP_SCENARIO,
  DEFAULT_PHYSICS,
  clamp,
  differentialTurns,
  finite,
  getArmStopPerformance,
  getLiftProfilePerformance,
  getLiveTelemetry,
  getStaticPerformance,
  getTargetPerformance,
  minimumMoveDuration,
  type ArmStopScenario,
  type PhysicsSettings,
  type Pose,
} from "./physics";

type CommandKind = "lift" | "rotate" | "move" | "wait" | "home";

type Command = {
  kind: CommandKind;
  line: number;
  duration: number;
  lift?: number;
  arm?: number;
  source: string;
};

type TimelineStep = Command & {
  from: Pose;
  to: Pose;
  start: number;
  end: number;
  requestedDuration: number;
  minimumDuration: number;
  physicsLimited: boolean;
};

type TimingScenario = {
  ratio: number;
  liftOnlyTimeS: number;
  armReferenceDegrees: number;
  armReferenceTimeS: number;
  liftSharePct: number;
};

const COLIN_TIMING_SCENARIO: TimingScenario = {
  ratio: 4,
  liftOnlyTimeS: 0.727,
  armReferenceDegrees: 270,
  armReferenceTimeS: 0.461538461538,
  liftSharePct: 50,
};

const LEGACY_DEFAULT_PROGRAM = `# SYSTM demo sequence
home 0.4
lift 100 1.8
rotate 90 0.8
wait 0.35
move 58 -45 1.25
rotate 180 0.9
wait 0.3
home 1.6`;

const DEFAULT_PROGRAM = `# SYSTM demo sequence
home 0.4
move 100 90 1.8
wait 0.35
move 58 -45 1.25
rotate 180 0.9
wait 0.3
home 1.6`;

const EXAMPLES: Record<string, string> = {
  showcase: DEFAULT_PROGRAM,
  differential: `# Opposite motors lift; matching motors rotate
home 0.3
lift 70 1.4
rotate 120 1.0
rotate -120 1.4
move 100 0 1.3
home 1.5`,
  quick: `# Fast scoring-style motion
home 0.2
move 82 35 1.0
wait 0.25
rotate 110 0.45
lift 35 0.8
home 1.0`,
};

function parseProgram(source: string): {
  commands: Command[];
  error: string | null;
} {
  const commands: Command[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index];
    const withoutComment = original.split("#")[0].split("//")[0].trim();

    if (!withoutComment) continue;

    const tokens = withoutComment
      .replace(/[(),]/g, " ")
      .trim()
      .split(/\s+/);
    const name = tokens[0].toLowerCase();
    const values = tokens.slice(1).map(Number);
    const line = index + 1;

    if (values.some((value) => Number.isNaN(value))) {
      return { commands: [], error: `Line ${line}: use numbers after “${tokens[0]}”.` };
    }

    const duration = (value: number | undefined, fallback = 1) => {
      const result = value ?? fallback;
      if (result < 0.05 || result > 30) {
        throw new Error(`Line ${line}: duration must be between 0.05 and 30 seconds.`);
      }
      return result;
    };

    try {
      if (name === "lift") {
        if (values.length < 1 || values.length > 2) {
          throw new Error(`Line ${line}: use lift HEIGHT [SECONDS].`);
        }
        if (values[0] < 0 || values[0] > 100) {
          throw new Error(`Line ${line}: lift height must be from 0 to 100.`);
        }
        commands.push({
          kind: "lift",
          lift: values[0],
          duration: duration(values[1]),
          line,
          source: withoutComment,
        });
      } else if (name === "rotate" || name === "arm") {
        if (values.length < 1 || values.length > 2) {
          throw new Error(`Line ${line}: use rotate DEGREES [SECONDS].`);
        }
        if (values[0] < -720 || values[0] > 720) {
          throw new Error(`Line ${line}: arm angle must be from -720° to 720°.`);
        }
        commands.push({
          kind: "rotate",
          arm: values[0],
          duration: duration(values[1]),
          line,
          source: withoutComment,
        });
      } else if (name === "move" || name === "together") {
        if (values.length < 2 || values.length > 3) {
          throw new Error(`Line ${line}: use move HEIGHT ANGLE [SECONDS].`);
        }
        if (values[0] < 0 || values[0] > 100) {
          throw new Error(`Line ${line}: lift height must be from 0 to 100.`);
        }
        if (values[1] < -720 || values[1] > 720) {
          throw new Error(`Line ${line}: arm angle must be from -720° to 720°.`);
        }
        commands.push({
          kind: "move",
          lift: values[0],
          arm: values[1],
          duration: duration(values[2], 1.25),
          line,
          source: withoutComment,
        });
      } else if (name === "wait") {
        if (values.length !== 1) {
          throw new Error(`Line ${line}: use wait SECONDS.`);
        }
        commands.push({
          kind: "wait",
          duration: duration(values[0]),
          line,
          source: withoutComment,
        });
      } else if (name === "home") {
        if (values.length > 1) {
          throw new Error(`Line ${line}: use home [SECONDS].`);
        }
        commands.push({
          kind: "home",
          duration: duration(values[0], 1.2),
          line,
          source: withoutComment,
        });
      } else {
        throw new Error(
          `Line ${line}: unknown command “${tokens[0]}”. Try lift, rotate, move, wait, or home.`,
        );
      }
    } catch (error) {
      return {
        commands: [],
        error: error instanceof Error ? error.message : `Line ${line}: invalid command.`,
      };
    }
  }

  if (commands.length === 0) {
    return { commands: [], error: "Add at least one motion command." };
  }

  return { commands, error: null };
}

function buildTimeline(
  commands: Command[],
  physics: PhysicsSettings,
  limitToPhysics: boolean,
): TimelineStep[] {
  let cursor = 0;
  let pose: Pose = { lift: 0, arm: 0 };

  return commands.map((command) => {
    const from = { ...pose };
    const to = { ...pose };

    if (command.kind === "lift") to.lift = command.lift ?? to.lift;
    if (command.kind === "rotate") to.arm = command.arm ?? to.arm;
    if (command.kind === "move") {
      to.lift = command.lift ?? to.lift;
      to.arm = command.arm ?? to.arm;
    }
    if (command.kind === "home") {
      to.lift = 0;
      to.arm = 0;
    }

    const minimumDuration = command.kind === "wait"
      ? 0
      : minimumMoveDuration(from, to, physics);
    const actualDuration = limitToPhysics
      ? Math.max(command.duration, finite(minimumDuration, 30))
      : command.duration;
    const step: TimelineStep = {
      ...command,
      from,
      to,
      start: cursor,
      end: cursor + actualDuration,
      duration: actualDuration,
      requestedDuration: command.duration,
      minimumDuration,
      physicsLimited: actualDuration > command.duration + 0.001,
    };

    cursor = step.end;
    pose = to;
    return step;
  });
}

function eased(value: number) {
  return value * value * (3 - 2 * value);
}

function easedVelocity(value: number) {
  return 6 * value * (1 - value);
}

function easedAcceleration(value: number) {
  return 6 - 12 * value;
}

function sampleTimeline(timeline: TimelineStep[], elapsed: number) {
  if (timeline.length === 0) {
    return {
      pose: { lift: 0, arm: 0 },
      activeIndex: -1,
      liftVelocityPctS: 0,
      liftAccelerationPctS2: 0,
      armVelocityDegS: 0,
      armAccelerationDegS2: 0,
    };
  }

  const activeIndex = timeline.findIndex((step) => elapsed < step.end);
  if (activeIndex === -1) {
    return {
      pose: { ...timeline[timeline.length - 1].to },
      activeIndex: timeline.length - 1,
      liftVelocityPctS: 0,
      liftAccelerationPctS2: 0,
      armVelocityDegS: 0,
      armAccelerationDegS2: 0,
    };
  }

  const step = timeline[activeIndex];
  const rawProgress = clamp((elapsed - step.start) / step.duration, 0, 1);
  const progress = step.kind === "wait" ? 0 : eased(rawProgress);
  const velocityScale = step.kind === "wait" ? 0 : easedVelocity(rawProgress) / step.duration;
  const accelerationScale = step.kind === "wait"
    ? 0
    : easedAcceleration(rawProgress) / (step.duration * step.duration);
  const liftDelta = step.to.lift - step.from.lift;
  const armDelta = step.to.arm - step.from.arm;

  return {
    pose: {
      lift: step.from.lift + liftDelta * progress,
      arm: step.from.arm + armDelta * progress,
    },
    activeIndex,
    liftVelocityPctS: liftDelta * velocityScale,
    liftAccelerationPctS2: liftDelta * accelerationScale,
    armVelocityDegS: armDelta * velocityScale,
    armAccelerationDegS2: armDelta * accelerationScale,
  };
}

function formatTime(value: number) {
  return `${value.toFixed(1)}s`;
}

function formatValue(value: number, decimals = 1) {
  if (!Number.isFinite(value)) return "—";
  const nearZero = Math.abs(value) < Math.pow(10, -decimals) / 2 ? 0 : value;
  return nearZero.toFixed(decimals);
}

function MotorDial({
  name,
  turns,
  direction,
  accent,
}: {
  name: string;
  turns: number;
  direction: number;
  accent: "red" | "blue";
}) {
  const directionLabel = direction > 0.001 ? "CW" : direction < -0.001 ? "CCW" : "HOLD";

  return (
    <div className={`motor-dial motor-${accent}`}>
      <div className="motor-name-row">
        <span>{name}</span>
        <span className="motor-direction">{directionLabel}</span>
      </div>
      <div className="motor-face" aria-hidden="true">
        <div
          className="motor-rotor"
          style={{ transform: `rotate(${turns * 360}deg)` }}
        >
          <span className="rotor-mark" />
          <span className="rotor-shaft" />
        </div>
      </div>
      <div className="motor-readout">
        <strong>{turns >= 0 ? "+" : ""}{turns.toFixed(2)}</strong>
        <span>turns</span>
      </div>
    </div>
  );
}

function LiftGraphic({ pose }: { pose: Pose }) {
  const extension = pose.lift / 100;
  const segmentCount = 8;
  const movingSegmentCount = segmentCount - 1;
  // Stage 1 is fixed to the base. The yellow carriage leads the sequence, then
  // Stage 8 pulls Stages 7–2 in order. Every moving section advances at the
  // same visual rate, so the shorter carriage stroke hands off to Stage 8
  // sooner than a full-length gray stage.
  const segmentLength = 63;
  const segmentStroke = 54;
  const carriageHalfHeight = 24;
  // Keep the carriage's lower crossbar inside the upper half of Stage 8. At
  // full carriage travel it lands exactly on Stage 8's midpoint.
  const carriageStroke = segmentLength / 2;
  const totalSequenceStroke = carriageStroke + movingSegmentCount * segmentStroke;
  const sequenceTravel = extension * totalSequenceStroke;
  const baseY = 550;
  const carriageProgress = clamp(sequenceTravel / carriageStroke, 0, 1);
  const stageProgress = Array.from({ length: segmentCount }, (_, index) => {
    if (index === 0) return 0;

    // Stage 8 has no gray stage ahead of it. Stage 7 waits for one full gray
    // stroke, Stage 6 waits for two, and so on through Stage 2.
    const precedingGrayStages = segmentCount - 1 - index;
    const stageTravel = sequenceTravel
      - carriageStroke
      - precedingGrayStages * segmentStroke;
    return clamp(stageTravel / segmentStroke, 0, 1);
  });
  const segments = Array.from({ length: segmentCount }, (_, index) => {
    // Stage 1 stays fixed. Each stage's absolute height is the sum of the
    // completed relative motion between it and every parent below it.
    const relativeProgress = stageProgress[index];
    const cumulativeRise = stageProgress
      .slice(1, index + 1)
      .reduce((sum, progress) => sum + progress, 0) * segmentStroke;
    const bottom = baseY - cumulativeRise;
    return {
      index,
      relativeProgress,
      left: 200 + index * 7,
      right: 320 - index * 7,
      top: bottom - segmentLength,
      bottom,
    };
  });
  const inner = segments.at(-1)!;
  const topStageMidpointY = inner.top + segmentLength / 2;
  const carriageBottomY = inner.bottom - carriageProgress * carriageStroke;
  const pivotY = carriageBottomY - carriageHalfHeight;
  const activeGrayStage = segmentCount - Math.floor(
    Math.max(0, sequenceTravel - carriageStroke) / segmentStroke,
  );
  const activeSegment = extension >= 1
    ? "COMPLETE"
    : carriageProgress < 1
      ? "CARRIAGE"
      : `${Math.max(2, activeGrayStage)} / ${segmentCount}`;

  return (
    <svg
      className="lift-svg"
      viewBox="0 0 520 590"
      role="img"
      aria-label={`Lift at ${pose.lift.toFixed(0)} percent with arm at ${pose.arm.toFixed(0)} degrees`}
    >
      <g className="height-guides" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => {
          const y = baseY - (index / 4) * movingSegmentCount * segmentStroke;
          return (
            <g key={index}>
              <line x1="92" y1={y} x2="428" y2={y} />
              <text x="76" y={y + 4}>{index * 25}</text>
            </g>
          );
        })}
        <text x="46" y="104" transform="rotate(-90 46 104)">EXTENSION %</text>
      </g>

      <g className="base-assembly">
        <path d="M180 551H340V574H180Z" />
        <path d="M196 574V586M324 574V586" />
        <circle cx="195" cy="575" r="8" />
        <circle cx="260" cy="575" r="8" />
        <circle cx="325" cy="575" r="8" />
      </g>

      <g className="stage-assembly">
        {segments.map((segment) => (
          <g
            key={segment.index}
            className={`lift-segment segment-${segment.index + 1}`}
            data-relative-progress={segment.relativeProgress.toFixed(3)}
            data-stationary={segment.index === 0 ? "true" : "false"}
          >
            <line
              className="segment-rail left-rail"
              x1={segment.left}
              y1={segment.bottom}
              x2={segment.left}
              y2={segment.top}
            />
            <line
              className="segment-rail right-rail"
              x1={segment.right}
              y1={segment.bottom}
              x2={segment.right}
              y2={segment.top}
            />
            <line
              className="stage-cap"
              x1={segment.left - 4}
              y1={segment.top}
              x2={segment.left + 4}
              y2={segment.top}
            />
            <line
              className="stage-cap"
              x1={segment.right - 4}
              y1={segment.top}
              x2={segment.right + 4}
              y2={segment.top}
            />
            {(segment.index === 0 || segment.relativeProgress > 0.02) && (
              <text x={segment.right + 7} y={segment.top + 3}>{segment.index + 1}</text>
            )}
          </g>
        ))}
      </g>

      <g
        className="end-effector-carriage"
        data-carriage-position={carriageProgress.toFixed(3)}
        data-carriage-bottom={carriageBottomY.toFixed(3)}
        data-top-stage-midpoint={topStageMidpointY.toFixed(3)}
        transform={`translate(260 ${pivotY})`}
      >
        <g className="bonus-stage">
          <line x1="-12" y1={carriageHalfHeight} x2="-12" y2={-carriageHalfHeight} />
          <line x1="12" y1={carriageHalfHeight} x2="12" y2={-carriageHalfHeight} />
          <line x1="-17" y1={carriageHalfHeight} x2="17" y2={carriageHalfHeight} />
          <text x="26" y="4">ARM CARRIAGE</text>
        </g>

        <g
          className="arm-assembly"
          transform={`rotate(${pose.arm})`}
        >
          <circle cx="0" cy="0" r="17" />
          <circle className="arm-hub" cx="0" cy="0" r="6" />
          <line x1="0" y1="0" x2="0" y2="-60" />
          <line className="arm-tip" x1="-20" y1="-60" x2="20" y2="-60" />
          <circle className="arm-end" cx="0" cy="-60" r="5" />
        </g>
      </g>

      <g className="datum" aria-hidden="true">
        <line x1="260" y1="575" x2="260" y2="582" />
        <text x="260" y="588">LIFT DATUM</text>
      </g>

      <g className="continuous-status" aria-hidden="true">
        <text x="428" y="44">ACTIVE SEGMENT</text>
        <text x="428" y="60">{activeSegment}</text>
      </g>
    </svg>
  );
}

export default function Home() {
  const [source, setSource] = useState(DEFAULT_PROGRAM);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hasRun, setHasRun] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [manualPose, setManualPose] = useState<Pose>({ lift: 0, arm: 0 });
  const [copied, setCopied] = useState(false);
  const [physics, setPhysics] = useState<PhysicsSettings>(DEFAULT_PHYSICS);
  const [limitToPhysics, setLimitToPhysics] = useState(true);
  const [timingScenario, setTimingScenario] = useState<TimingScenario>(COLIN_TIMING_SCENARIO);
  const [armStopScenario, setArmStopScenario] = useState<ArmStopScenario>(COLIN_ARM_STOP_SCENARIO);
  const [guideHost, setGuideHost] = useState<HTMLDivElement | null>(null);
  const elapsedRef = useRef(0);
  const storageLoadedRef = useRef(false);

  const parsed = useMemo(() => parseProgram(source), [source]);
  const timeline = useMemo(
    () => buildTimeline(parsed.commands, physics, limitToPhysics),
    [parsed.commands, physics, limitToPhysics],
  );
  const totalDuration = timeline.at(-1)?.end ?? 0;
  const sampled = useMemo(
    () => sampleTimeline(timeline, elapsed),
    [timeline, elapsed],
  );
  const pose = hasRun ? sampled.pose : manualPose;
  const activeStep = hasRun ? timeline[sampled.activeIndex] : undefined;
  const motorPositions = useMemo(
    () => differentialTurns({ lift: 0, arm: 0 }, pose, physics),
    [pose, physics],
  );
  const staticPerformance = useMemo(() => getStaticPerformance(physics), [physics]);
  const targetPerformance = useMemo(
    () => getTargetPerformance(physics, timingScenario.liftOnlyTimeS),
    [physics, timingScenario.liftOnlyTimeS],
  );
  const liftProfilePerformance = useMemo(
    () => getLiftProfilePerformance(physics, timingScenario.liftOnlyTimeS),
    [physics, timingScenario.liftOnlyTimeS],
  );
  const armStopResults = useMemo(
    () => getArmStopPerformance(physics, armStopScenario),
    [physics, armStopScenario],
  );
  const timingResults = useMemo(() => {
    const liftOnlyTimeS = Math.max(0.01, finite(timingScenario.liftOnlyTimeS, 0.727));
    const armReferenceTimeS = Math.max(0.01, finite(timingScenario.armReferenceTimeS, 0.461538461538));
    const armReferenceDegrees = Math.max(0, finite(timingScenario.armReferenceDegrees, 270));
    const liftShare = clamp(finite(timingScenario.liftSharePct, 50) / 100, 0.01, 0.99);
    const armShare = 1 - liftShare;
    const splitLiftTimeS = liftOnlyTimeS / liftShare;
    const fullArmRpm = armReferenceDegrees / 360 / armReferenceTimeS * 60;
    const splitArmRpm = fullArmRpm * armShare;
    const armRevolutions = splitArmRpm / 60 * splitLiftTimeS;
    const armDegrees = armRevolutions * 360;
    const liftOnlySpeedInS = Math.max(0, physics.liftTravelIn) / liftOnlyTimeS;
    const splitLiftSpeedInS = Math.max(0, physics.liftTravelIn) / splitLiftTimeS;
    const groupACommandPct = (liftShare + armShare) * 100;
    const groupBCommandPct = (armShare - liftShare) * 100;
    const modeledMinimumS = minimumMoveDuration(
      { lift: 0, arm: 0 },
      { lift: 100, arm: armDegrees },
      physics,
    );
    const modeledDurationS = Math.max(splitLiftTimeS, modeledMinimumS);
    const modelFeasible = splitLiftTimeS + 0.001 >= modeledMinimumS;
    const canAnimate = Math.abs(armDegrees) <= 720
      && splitLiftTimeS >= 0.05
      && splitLiftTimeS <= 30;

    return {
      liftShare,
      armShare,
      splitLiftTimeS,
      fullArmRpm,
      splitArmRpm,
      armRevolutions,
      armDegrees,
      liftOnlySpeedInS,
      splitLiftSpeedInS,
      groupACommandPct,
      groupBCommandPct,
      modeledMinimumS,
      modeledDurationS,
      modelFeasible,
      canAnimate,
    };
  }, [timingScenario, physics]);
  const telemetry = useMemo(
    () => getLiveTelemetry(physics, {
      pose,
      liftVelocityPctS: hasRun ? sampled.liftVelocityPctS : 0,
      liftAccelerationPctS2: hasRun ? sampled.liftAccelerationPctS2 : 0,
      armVelocityDegS: hasRun ? sampled.armVelocityDegS : 0,
      armAccelerationDegS2: hasRun ? sampled.armAccelerationDegS2 : 0,
    }),
    [physics, pose, hasRun, sampled],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("systm-diffy-program");
      if (saved) {
        setSource(saved === LEGACY_DEFAULT_PROGRAM ? DEFAULT_PROGRAM : saved);
      }
      const savedPhysics = window.localStorage.getItem("systm-diffy-physics");
      if (savedPhysics) {
        try {
          const savedValues = JSON.parse(savedPhysics);
          // Preserve a customized value from the earlier constant-load model
          // by treating it as friction in the new dynamic arm model.
          if (
            savedValues.armFrictionTorqueInLb == null
            && Number.isFinite(savedValues.armLoadTorqueInLb)
          ) {
            savedValues.armFrictionTorqueInLb = savedValues.armLoadTorqueInLb;
          }
          // Migrate the previous example geometry only when it is still an
          // exact match. The new defaults preserve the same 6.5 lbf·in hold
          // torque while matching Colin's 0.316 N·m braking calculation.
          if (
            savedValues.armMassLb === 1
            && savedValues.armCenterOfMassIn === 5
            && savedValues.payloadMassLb === 0.25
            && savedValues.payloadDistanceIn === 6
          ) {
            savedValues.armCenterOfMassIn = 6.5;
            savedValues.payloadMassLb = 0;
          }
          // Correct both known earlier example weights to the team's measured
          // 8 lb moving lift while preserving other customized values.
          if (
            (savedValues.movingWeightLb === 2 || savedValues.movingWeightLb === 6)
            && savedValues.counterbalanceLb === 2
            && savedValues.frictionLb === 0.5
          ) {
            savedValues.movingWeightLb = 8;
          }
          setPhysics({ ...DEFAULT_PHYSICS, ...savedValues });
        } catch {
          window.localStorage.removeItem("systm-diffy-physics");
        }
      }
      const savedTiming = window.localStorage.getItem("systm-diffy-timing");
      if (savedTiming) {
        try {
          setTimingScenario({ ...COLIN_TIMING_SCENARIO, ...JSON.parse(savedTiming) });
        } catch {
          window.localStorage.removeItem("systm-diffy-timing");
        }
      }
      const savedArmStop = window.localStorage.getItem("systm-diffy-arm-stop");
      if (savedArmStop) {
        try {
          setArmStopScenario({ ...COLIN_ARM_STOP_SCENARIO, ...JSON.parse(savedArmStop) });
        } catch {
          window.localStorage.removeItem("systm-diffy-arm-stop");
        }
      }
      storageLoadedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!storageLoadedRef.current) return;
    window.localStorage.setItem("systm-diffy-program", source);
  }, [source]);

  useEffect(() => {
    if (!storageLoadedRef.current) return;
    window.localStorage.setItem("systm-diffy-physics", JSON.stringify(physics));
  }, [physics]);

  useEffect(() => {
    if (!storageLoadedRef.current) return;
    window.localStorage.setItem("systm-diffy-timing", JSON.stringify(timingScenario));
  }, [timingScenario]);

  useEffect(() => {
    if (!storageLoadedRef.current) return;
    window.localStorage.setItem("systm-diffy-arm-stop", JSON.stringify(armStopScenario));
  }, [armStopScenario]);

  useEffect(() => {
    if (!playing || totalDuration <= 0) return;

    let frame = 0;
    const startedAt = performance.now();
    const startedElapsed = elapsedRef.current;

    const tick = (now: number) => {
      const wallTime = ((now - startedAt) / 1000) * speed;
      const next = Math.min(startedElapsed + wallTime, totalDuration);
      elapsedRef.current = next;
      setElapsed(next);

      if (next >= totalDuration) {
        setPlaying(false);
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, totalDuration]);

  const setTime = (value: number) => {
    elapsedRef.current = value;
    setElapsed(value);
  };

  const togglePlayback = () => {
    if (parsed.error) return;
    setHasRun(true);
    if (elapsed >= totalDuration) setTime(0);
    setPlaying((value) => !value);
  };

  const reset = () => {
    setPlaying(false);
    setHasRun(true);
    setTime(0);
  };

  const changeProgram = (value: string) => {
    setPlaying(false);
    setTime(0);
    setHasRun(true);
    setSource(value);
  };

  const changeManualPose = (next: Partial<Pose>) => {
    setPlaying(false);
    setManualPose((current) => ({ ...(hasRun ? pose : current), ...next }));
    setHasRun(false);
  };

  const copyProgram = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const downloadProgram = () => {
    const blob = new Blob([source], { type: "text/plain" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "diffy-animation.diffy";
    link.click();
    URL.revokeObjectURL(href);
  };

  const updatePhysics = <Key extends keyof PhysicsSettings,>(
    key: Key,
    value: PhysicsSettings[Key],
  ) => {
    setPlaying(false);
    setTime(0);
    setPhysics((current) => ({ ...current, [key]: value }));
  };

  const updateTiming = <Key extends keyof TimingScenario,>(
    key: Key,
    value: TimingScenario[Key],
  ) => {
    setTimingScenario((current) => ({ ...current, [key]: value }));
  };

  const updateArmStop = <Key extends keyof ArmStopScenario,>(
    key: Key,
    value: ArmStopScenario[Key],
  ) => {
    setArmStopScenario((current) => ({ ...current, [key]: value }));
  };

  const loadColinArmStopPreset = () => {
    setArmStopScenario(COLIN_ARM_STOP_SCENARIO);
    setPhysics((current) => ({
      ...current,
      armMassLb: DEFAULT_PHYSICS.armMassLb,
      armCenterOfMassIn: DEFAULT_PHYSICS.armCenterOfMassIn,
      payloadMassLb: DEFAULT_PHYSICS.payloadMassLb,
      payloadDistanceIn: DEFAULT_PHYSICS.payloadDistanceIn,
    }));
  };

  const loadTimingScenario = () => {
    if (!timingResults.canAnimate) return;
    const armDegrees = Number(timingResults.armDegrees.toFixed(6));
    const splitTime = Number(timingResults.splitLiftTimeS.toFixed(6));
    const returnTime = Number(Math.min(30, Math.max(0.6, timingResults.modeledDurationS)).toFixed(6));
    changeProgram(`# ${formatValue(timingScenario.ratio, 2)}:1 differential timing scenario
home 0.4
move 100 ${armDegrees} ${splitTime}
wait 0.3
home ${returnTime}`);
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <section className="visualizer-panel" aria-label="Lift animation preview">
          <div className="panel-heading visualizer-heading">
            <div>
              <span className="eyebrow">LIVE MECHANISM VIEW</span>
              <h2>Front elevation</h2>
            </div>
            <div className="pose-stats">
              <div><span>Lift</span><strong>{pose.lift.toFixed(0)}%</strong></div>
              <div><span>Arm</span><strong>{pose.arm.toFixed(0)}°</strong></div>
              <div className={`estimate-stat ${targetPerformance.feasible ? "target-ok" : "target-warning"}`}>
                <span>0→100 target</span>
                <strong>{formatValue(targetPerformance.targetTimeS, 3)}s</strong>
              </div>
            </div>
          </div>

          <div className="simulation-stage">
            <MotorDial
              name="MOTOR GROUP A"
              turns={motorPositions.motorATurns}
              direction={playing ? telemetry.motorARpm : 0}
              accent="red"
            />

            <div className="lift-canvas">
              <div className="canvas-label">
                <span>SCHEMATIC</span>
                <span>CONTINUOUS · NOT TO SCALE</span>
              </div>
              <LiftGraphic pose={pose} />
            </div>

            <MotorDial
              name="MOTOR GROUP B"
              turns={motorPositions.motorBTurns}
              direction={playing ? telemetry.motorBRpm : 0}
              accent="blue"
            />
          </div>

          <section className="telemetry-panel" aria-label="Live engineering telemetry">
            <div className="telemetry-heading">
              <div>
                <span className="eyebrow">LIVE HOLDING / MOTION ESTIMATE</span>
                <strong>{telemetry.feasible ? "Inside modeled limits" : "Command exceeds modeled limits"}</strong>
              </div>
              <span className={`feasibility-pill ${telemetry.feasible ? "good" : "bad"}`}>
                {formatValue(telemetry.speedUtilization * 100, 0)}% SPEED LOAD
              </span>
            </div>
            <div className="telemetry-grid">
              <div><span>Group A input</span><strong>{formatValue(telemetry.motorARpm, 0)}</strong><small>RPM</small></div>
              <div><span>Group B input</span><strong>{formatValue(telemetry.motorBRpm, 0)}</strong><small>RPM</small></div>
              <div><span>Available motor</span><strong>{formatValue(telemetry.availableMotorRpm, 0)}</strong><small>RPM under load</small></div>
              <div><span>Lift winch output</span><strong>{formatValue(telemetry.liftWinchRpm, 0)}</strong><small>RPM</small></div>
              <div><span>Arm output</span><strong>{formatValue(telemetry.armOutputRpm, 1)}</strong><small>RPM</small></div>
              <div><span>Torque load</span><strong>{formatValue(telemetry.motorLoadFraction * 100, 0)}</strong><small>% of stall</small></div>
              <div><span>Lift net gravity</span><strong>{formatValue(telemetry.liftGravityForceLb, 1)}</strong><small>lbf after counterbalance</small></div>
              <div><span>Lift friction</span><strong>{formatValue(telemetry.liftFrictionForceLb, 1)}</strong><small>lbf signed</small></div>
              <div><span>Lift acceleration force</span><strong>{formatValue(telemetry.liftAccelerationForceLb, 1)}</strong><small>lbf signed · ma</small></div>
              <div><span>Total lift force</span><strong>{formatValue(telemetry.requiredLiftForceLb, 1)}</strong><small>lbf signed</small></div>
              <div><span>Stall force</span><strong>{formatValue(telemetry.stallLiftForceLb, 1)}</strong><small>lbf modeled</small></div>
              <div><span>Lift torque · shared</span><strong>{formatValue(telemetry.liftMotorTorqueSharedNm, 3)}</strong><small>N·m across both groups</small></div>
              <div><span>Lift torque / group</span><strong>{formatValue(telemetry.liftMotorTorquePerGroupNm, 3)}</strong><small>N·m each · A and B</small></div>
              <div><span>Lift torque / motor</span><strong>{formatValue(telemetry.liftMotorTorquePerMotorNm, 3)}</strong><small>N·m each</small></div>
              <div><span>Lift output power</span><strong>{formatValue(telemetry.liftOutputPowerW, 1)}</strong><small>W signed · Fv</small></div>
              <div><span>Arm output power</span><strong>{formatValue(telemetry.armOutputPowerW, 1)}</strong><small>W signed · τω</small></div>
              <div><span>Motor shaft demand</span><strong>{formatValue(telemetry.mechanicalPowerW, 1)}</strong><small>W total of {formatValue(staticPerformance.availableMechanicalW, 0)} W rated</small></div>
              <div><span>Electrical power total</span><strong>{formatValue(telemetry.electricalPowerW, 1)}</strong><small>W across all motors</small></div>
              <div><span>Electrical power / motor</span><strong>{formatValue(telemetry.electricalPowerPerMotorW, 1)}</strong><small>W each</small></div>
              <div><span>Current / motor</span><strong>{formatValue(telemetry.currentPerMotorA, 2)}</strong><small>A estimated</small></div>
              <div><span>Lift speed</span><strong>{formatValue(telemetry.liftSpeedInS, 1)}</strong><small>in/s</small></div>
              <div><span>Lift acceleration</span><strong>{formatValue(telemetry.liftAccelerationInS2, 1)}</strong><small>in/s² signed</small></div>
              <div><span>Arm gravity torque</span><strong>{formatValue(telemetry.armGravityTorqueInLb, 2)}</strong><small>lbf·in signed</small></div>
              <div><span>Arm acceleration torque</span><strong>{formatValue(telemetry.armAccelerationTorqueInLb, 2)}</strong><small>lbf·in from Iα</small></div>
              <div><span>Arm friction torque</span><strong>{formatValue(telemetry.armFrictionTorqueInLb, 2)}</strong><small>lbf·in signed</small></div>
              <div><span>Total arm torque</span><strong>{formatValue(telemetry.requiredArmTorqueInLb, 2)}</strong><small>lbf·in required</small></div>
              <div><span>Arm moment of inertia</span><strong>{formatValue(telemetry.armMomentOfInertiaLbIn2, 1)}</strong><small>lb·in² estimate</small></div>
            </div>
          </section>

          <div className="mixing-strip">
            <div className="mix-label">
              <span>DIFFERENTIAL MIX</span>
              <strong>{activeStep?.source ?? "Ready at home"}</strong>
            </div>
            <div className="mix-formula">
              <span><b>A</b> = + lift + rotate</span>
              <span><b>B</b> = − lift + rotate</span>
              {activeStep?.physicsLimited && (
                <span className="limited-note">extended to {formatValue(activeStep.duration, 2)}s</span>
              )}
            </div>
          </div>

          <div className="timeline-section">
            <div className="timeline-meta">
              <span>{formatTime(elapsed)}</span>
              <input
                aria-label="Animation timeline"
                type="range"
                min="0"
                max={Math.max(totalDuration, 0.01)}
                step="0.01"
                value={Math.min(elapsed, totalDuration)}
                onChange={(event) => {
                  setPlaying(false);
                  setHasRun(true);
                  setTime(Number(event.target.value));
                }}
              />
              <span>{formatTime(totalDuration)}</span>
            </div>
            <div className="timeline-blocks">
              {timeline.map((step, index) => (
                <button
                  key={`${step.line}-${index}`}
                  className={index === sampled.activeIndex && hasRun ? "active" : ""}
                  style={{ flexGrow: Math.max(step.duration, 0.25) }}
                  onClick={() => {
                    setPlaying(false);
                    setHasRun(true);
                    setTime(step.start);
                  }}
                  title={`Line ${step.line}: ${step.source}`}
                >
                  {step.kind}
                </button>
              ))}
            </div>
          </div>

          <div className="visualizer-guide-host" ref={setGuideHost} />
        </section>

        <aside className="control-panel">
          <div className="control-topline">
            <div>
              <span className="eyebrow">ANIMATION PROGRAM</span>
              <h2>Command sequence</h2>
            </div>
            <label className="example-picker">
              <span>Example</span>
              <select
                aria-label="Load an example program"
                defaultValue="showcase"
                onChange={(event) => changeProgram(EXAMPLES[event.target.value])}
              >
                <option value="showcase">Showcase</option>
                <option value="differential">Differential</option>
                <option value="quick">Quick cycle</option>
              </select>
            </label>
          </div>

          <div className={`editor-shell ${parsed.error ? "editor-error" : ""}`}>
            <div className="editor-bar">
              <span>animation.diffy</span>
              <div>
                <button onClick={copyProgram}>{copied ? "Copied" : "Copy"}</button>
                <button onClick={downloadProgram}>Save script</button>
              </div>
            </div>
            <textarea
              aria-label="Animation commands"
              spellCheck={false}
              value={source}
              onChange={(event) => changeProgram(event.target.value)}
            />
            <div className="editor-status" role="status">
              {parsed.error ? (
                <span className="status-error">{parsed.error}</span>
              ) : (
                <span className="status-good">
                  Ready · {parsed.commands.length} commands · {formatTime(totalDuration)}
                  {timeline.some((step) => step.physicsLimited) ? " · hardware-limited" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="playback-row">
            <button
              className="button-primary"
              onClick={togglePlayback}
              disabled={Boolean(parsed.error)}
              aria-label={playing ? "Pause animation" : "Play animation"}
            >
              <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
              {playing ? "Pause" : "Play"}
            </button>
            <button className="button-icon" onClick={reset} aria-label="Reset animation" title="Reset">
              ↺
            </button>
          </div>

          <div className="speed-row">
            <span>Playback speed</span>
            {[0.5, 1, 1.5, 2].map((value) => (
              <button
                key={value}
                className={speed === value ? "selected" : ""}
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>

          {guideHost && createPortal(<>
          <section className="manual-controls manual-move">
            <div className="section-title">
              <h3>Manual move</h3>
              <span>Stops the program and moves the schematic immediately</span>
            </div>
            <label>
              <div><span>Lift extension</span><output>{pose.lift.toFixed(0)}%</output></div>
              <input
                aria-label="Manual lift extension"
                type="range"
                min="0"
                max="100"
                value={pose.lift}
                onChange={(event) => changeManualPose({ lift: Number(event.target.value) })}
              />
            </label>
            <label>
              <div><span>Arm angle</span><output>{pose.arm.toFixed(0)}°</output></div>
              <input
                aria-label="Manual arm angle"
                type="range"
                min="-720"
                max="720"
                value={pose.arm}
                onChange={(event) => changeManualPose({ arm: Number(event.target.value) })}
              />
            </label>
          </section>

          <section className="tool-guide" aria-labelledby="tool-guide-title">
            <div className="guide-heading">
              <span className="eyebrow">COMPLETE OPERATING GUIDE</span>
              <h3 id="tool-guide-title">Commands, controls, readouts & equations</h3>
              <p>Everything Colin needs to build an animation, compare a target time with the hardware, and understand where each result comes from.</p>
            </div>

            <div className="guide-quick-start">
              <strong>Fastest way to use the tool</strong>
              <ol>
                <li>Enter one command per line in the animation editor.</li>
                <li>Set the lift target time and the real spool, weight, and gearing values.</li>
                <li>Select <b>Play</b>, then watch the motor groups and live telemetry.</li>
                <li>If a warning appears, increase the command time or change the mechanism inputs.</li>
              </ol>
            </div>

            <div className="guide-section">
              <h4>Editor and playback controls</h4>
              <dl className="guide-definition-grid">
                <div><dt>Example</dt><dd>Loads a complete sample script into the editor.</dd></div>
                <div><dt>Copy</dt><dd>Copies the current animation script to the clipboard.</dd></div>
                <div><dt>Save script</dt><dd>Downloads the commands as an <code>animation.diffy</code> text file.</dd></div>
                <div><dt>Play / Pause</dt><dd>Starts the animation, pauses it in place, or continues from the current timeline position.</dd></div>
                <div><dt>Reset ↺</dt><dd>Stops playback and returns the animation to the start.</dd></div>
                <div><dt>0.5×–2×</dt><dd>Changes visual playback speed only; it does not change the engineering calculations.</dd></div>
                <div><dt>Replay scrubber</dt><dd>Drag the time bar below the mechanism to inspect any instant in the animation.</dd></div>
                <div><dt>Timeline blocks</dt><dd>Select a labeled block to jump to the beginning of that command.</dd></div>
              </dl>
            </div>

            <div className="guide-section">
              <div className="guide-section-title">
                <h4>Animation commands</h4>
                <span>Targets, not offsets</span>
              </div>
              <div className="reference-grid guide-command-grid">
                <div><code>lift 100 1.5</code><span>Move to 100% lift height in 1.5 seconds. Range: 0–100%.</span></div>
                <div><code>rotate 720 1.2</code><span>Move the arm to +720° in 1.2 seconds. Range: −720° to +720°.</span></div>
                <div><code>move 60 -45 1.2</code><span>Move to 60% lift and −45° arm at the same time in 1.2 seconds.</span></div>
                <div><code>wait 0.4</code><span>Hold the current lift and arm pose for 0.4 seconds.</span></div>
                <div><code>home 1.0</code><span>Return both the lift and arm to zero in 1.0 second.</span></div>
                <div><code># inspection pause</code><span>Add a note. Lines beginning with <code>#</code> or <code>{"//"}</code> are ignored.</span></div>
              </div>
              <p className="guide-note">Parentheses and commas are optional, so <code>move(60, -45, 1.2)</code> works too. Every duration must be greater than zero. A yellow editor message identifies the exact bad line when syntax is invalid.</p>
            </div>

            <div className="guide-section">
              <h4>Manual move and differential behavior</h4>
              <p>The manual sliders stop the command timeline and place the schematic directly at the selected lift percentage and arm angle. The arm slider covers two complete revolutions in either direction.</p>
              <dl className="guide-definition-grid compact">
                <div><dt>Motor Group A</dt><dd>Lift component + arm component.</dd></div>
                <div><dt>Motor Group B</dt><dd>Negative lift component + arm component.</dd></div>
                <div><dt>Opposite directions</dt><dd>The motor groups create lift travel.</dd></div>
                <div><dt>Matching directions</dt><dd>The motor groups rotate the arm.</dd></div>
              </dl>
            </div>

            <div className="guide-section">
              <h4>Differential timing calculator</h4>
              <dl className="guide-definition-grid">
                <div><dt>Full lift at 100% lift power</dt><dd>The main 0→100 target. It drives required RPM, average speed, peak force, and dynamic safety.</dd></div>
                <div><dt>Ratio label</dt><dd>A name for the gearing scenario. It is displayed in the result sentence but does not change the math by itself.</dd></div>
                <div><dt>Arm reference travel / time</dt><dd>Defines the measured arm-only speed used by the split calculation.</dd></div>
                <div><dt>Use modeled lift time</dt><dd>Copies the hardware model’s estimated achievable full-stroke time into the target.</dd></div>
                <div><dt>Power sent to lift</dt><dd>Splits ideal differential command between lift and arm. The remaining percentage goes to the arm.</dd></div>
                <div><dt>Colin preset</dt><dd>Restores the 4:1 example: 0.727-second lift, 270° in 0.461538461538 seconds, and a 50/50 split.</dd></div>
                <div><dt>Load mixed move</dt><dd>Replaces the editor with the calculated lift-and-arm move plus a return home.</dd></div>
                <div><dt>Model check</dt><dd>Compares the ideal split result with the minimum duration allowed by the current motor and mechanism settings.</dd></div>
              </dl>
            </div>

            <div className="guide-section">
              <h4>Worst-case arm stop</h4>
              <dl className="guide-definition-grid">
                <div><dt>Arm starting speed</dt><dd>Arm-output speed immediately before braking. Colin’s measured example is 97.5 RPM.</dd></div>
                <div><dt>Stop time</dt><dd>Time allowed to decelerate from the starting speed to zero. A shorter stop requires more inertia torque.</dd></div>
                <div><dt>Effective motor:arm reduction</dt><dd>Total motor-shaft-to-arm ratio used only by this stop check. Unlike the timing calculator’s ratio label, this value changes the torque math.</dd></div>
                <div><dt>PID braking peak multiplier</dt><dd>Editable allowance for a PID controller commanding more than the average constant-deceleration torque. Use 1.00× to remove this allowance.</dd></div>
                <div><dt>Ideal shared total</dt><dd>Horizontal holding torque plus average braking torque after gearing, before efficiency loss. Motor Groups A and B each carry half.</dd></div>
                <div><dt>Adjusted peak total</dt><dd>Holding torque plus PID-adjusted braking torque, divided by the hardware model’s mechanism efficiency.</dd></div>
                <div><dt>Per-group torque</dt><dd>Combined drive torque divided evenly between Group A and Group B, as Colin clarified.</dd></div>
                <div><dt>Peak per motor</dt><dd>Adjusted shared total divided by the modeled total motor count.</dd></div>
                <div><dt>Stall load</dt><dd>Peak per-motor torque divided by the selected cartridge’s modeled stall torque.</dd></div>
              </dl>
            </div>

            <div className="guide-section">
              <h4>Requested lift acceleration / deceleration</h4>
              <dl className="guide-definition-grid">
                <div><dt>Profile source</dt><dd>Uses the editable full-lift target time and the same smooth motion profile as the animation.</dd></div>
                <div><dt>Moving mass</dt><dd>The corrected default is 8 lb. This full mass is used in <code>ma</code>; counterbalance only offsets gravity.</dd></div>
                <div><dt>Accelerating force / torque</dt><dd>Net gravity, upward friction, and positive <code>ma</code> are added at the start of the lift.</dd></div>
                <div><dt>Decelerating force / torque</dt><dd>Negative <code>ma</code> is applied near the top. A negative result means the motors must brake while gravity helps slow the lift.</dd></div>
                <div><dt>Peak power</dt><dd>The full profile is sampled to find peak lift-output, motor-shaft, electrical, and per-motor values.</dd></div>
                <div><dt>Physics-limit warning</dt><dd>If the requested time is impossible, the check still shows its requested peaks while the animation automatically uses a longer, safer duration.</dd></div>
              </dl>
            </div>

            <div className="guide-section">
              <h4>Hardware model inputs</h4>
              <dl className="guide-definition-grid">
                <div><dt>Motor cartridge</dt><dd>V5 internal gearset free speed: 100, 200, or 600 RPM.</dd></div>
                <div><dt>Motors per group</dt><dd>Motor count on each corner/group. Total motors in the model are twice this number.</dd></div>
                <div><dt>Motor spool diameter</dt><dd>Pitch diameter where the lift cable leaves the powered drum.</dd></div>
                <div><dt>Arm spool diameter</dt><dd>Pitch diameter used to convert motor drum travel into arm rotation.</dd></div>
                <div><dt>Motor:winch reduction</dt><dd>Motor turns per one winch turn. Larger values add force and reduce output speed.</dd></div>
                <div><dt>Rigging speed multiplier</dt><dd>Final lift travel divided by winch cable travel. Use 1.0 unless the cable routing multiplies travel.</dd></div>
                <div><dt>Full lift travel</dt><dd>Measured physical distance from 0% to 100% extension.</dd></div>
                <div><dt>Total moving weight</dt><dd>Slides, carriage, arm, game objects, and everything accelerated vertically.</dd></div>
                <div><dt>Counterbalance force</dt><dd>Upward rubber-band or surgical-tubing force that offsets static weight.</dd></div>
                <div><dt>Estimated slide friction</dt><dd>Additional opposing linear force from bearings, misalignment, and cable routing.</dd></div>
                <div><dt>Mechanism efficiency</dt><dd>Fraction of motor-side mechanical work that reaches the lift or arm.</dd></div>
                <div><dt>Motor efficiency estimate</dt><dd>Used to convert mechanical demand into estimated electrical watts.</dd></div>
                <div><dt>Arm mass</dt><dd>Moving arm/end-effector mass used in both gravity torque and moment of inertia.</dd></div>
                <div><dt>Arm center-of-mass radius</dt><dd>Distance from the pivot to the arm assembly’s balance point.</dd></div>
                <div><dt>Payload mass / radius</dt><dd>Game-object or tool mass modeled as a point mass at its distance from the pivot.</dd></div>
                <div><dt>Arm friction torque</dt><dd>Additional bearing, cable, and mechanism resistance opposing arm motion.</dd></div>
                <div><dt>Physics-limit animation</dt><dd>Automatically lengthens any command whose required motor RPM exceeds the modeled loaded speed.</dd></div>
                <div><dt>Reset defaults</dt><dd>Restores the original 4-motor, 600-RPM, 1.5-inch-spool model values.</dd></div>
              </dl>
            </div>

            <div className="guide-section">
              <h4>What the live readouts mean</h4>
              <dl className="guide-definition-grid">
                <div><dt>Group A / B input</dt><dd>Instantaneous RPM requested from each differential motor group.</dd></div>
                <div><dt>Available motor</dt><dd>Estimated motor RPM remaining at the current modeled load.</dd></div>
                <div><dt>Lift winch output</dt><dd>Winch RPM after the external reduction.</dd></div>
                <div><dt>Arm output</dt><dd>End-effector RPM after spool-diameter conversion.</dd></div>
                <div><dt>Torque load</dt><dd>Worst motor torque as a percentage of stall torque.</dd></div>
                <div><dt>Lift gravity / friction / acceleration force</dt><dd>Signed components of the live lift demand. Acceleration is calculated from the entered moving mass and the animation’s current acceleration.</dd></div>
                <div><dt>Lift shared torque</dt><dd>Combined motor-side lift torque across both groups. The per-group value is half, and the per-motor value divides it by total motor count.</dd></div>
                <div><dt>Lift / arm output watts</dt><dd>Signed mechanical power at each mechanism. Negative indicates braking or energy flowing back toward the motors.</dd></div>
                <div><dt>Motor shaft watts</dt><dd>Total positive motor-side mechanical demand after mechanism losses.</dd></div>
                <div><dt>Electrical watts</dt><dd>Estimated total electrical power across all motors, plus a separate per-motor value. Watts measure power, not current.</dd></div>
                <div><dt>Current per motor</dt><dd>Approximate current from 0.15 A at no load toward 2.5 A near stall.</dd></div>
                <div><dt>Arm gravity torque</dt><dd>Signed holding torque. It is near zero vertically and reaches maximum magnitude when horizontal.</dd></div>
                <div><dt>Arm acceleration torque</dt><dd>Signed dynamic torque calculated from the modeled moment of inertia and angular acceleration.</dd></div>
                <div><dt>Total arm torque</dt><dd>Gravity, acceleration, and friction torque combined before gearing and efficiency losses.</dd></div>
                <div><dt>Speed / acceleration</dt><dd>Instantaneous linear lift motion in inches per second and inches per second squared.</dd></div>
                <div><dt>Speed load</dt><dd>Requested peak motor RPM divided by the available modeled motor RPM.</dd></div>
                <div><dt>Dynamic force safety</dt><dd>Stall lift force divided by peak required force. Above 1.0 has modeled force margin.</dd></div>
              </dl>
            </div>

            <div className="guide-section equations-section">
              <h4>Equations used by the tool</h4>
              <p className="guide-symbols"><b>Symbols:</b> <code>D</code> lift travel, <code>T</code> move time, <code>d</code> motor-spool diameter, <code>r</code> radius, <code>R</code> reduction, <code>η</code> efficiency, <code>m</code> mass, <code>I</code> moment of inertia, <code>θ</code> arm angle from vertical, and <code>α</code> angular acceleration.</p>
              <div className="equation-list">
                <div><code>p(u) = 3u² − 2u³, &nbsp;u = t / T</code><span>Smooth position profile used for every move.</span></div>
                <div><code>vavg = D / T, &nbsp;vpeak = 1.5D / T</code><span>Average and peak lift speed for that smooth profile.</span></div>
                <div><code>apeak = 6D / T²</code><span>Peak magnitude of lift acceleration near the beginning and end.</span></div>
                <div><code>RPMwinch = 60vpeak / (πdr)</code><span>Peak winch RPM required to reach the entered lift time.</span></div>
                <div><code>RPMmotor = RPMwinch × R</code><span>Required motor RPM before the external reduction.</span></div>
                <div><code>lift turns = ΔD × R / (πdr)</code><span>Motor turns assigned to the lift component.</span></div>
                <div><code>arm turns = (Δθ / 360) × (darm / d) × R</code><span>Motor turns assigned to the arm component.</span></div>
                <div><code>A = lift turns + arm turns</code><span>Differential command for Motor Group A.</span></div>
                <div><code>B = −lift turns + arm turns</code><span>Differential command for Motor Group B.</span></div>
                <div><code>effective load = max(weight − counterbalance, 0) + friction</code><span>Static linear load used for the lift torque estimate.</span></div>
                <div><code>Frequired = Fgravity + Ffriction + ma</code><span>Instantaneous lift force; unit conversions are applied internally.</span></div>
                <div><code>τlift,shared = Frequired r / (Rη)</code><span>Combined reflected lift torque shared across both motor groups.</span></div>
                <div><code>τlift,group = τlift,shared / 2</code><span>Each differential motor group carries one-half of the lift torque.</span></div>
                <div><code>τlift,motor = τlift,shared / motor count</code><span>Lift torque assigned to each individual motor.</span></div>
                <div><code>Plift = Frequired v</code><span>Signed lift mechanism power; negative values indicate braking.</span></div>
                <div><code>Iarm = marm rcg² + mpayload rpayload²</code><span>Point-mass moment-of-inertia estimate around the arm pivot.</span></div>
                <div><code>τgravity = (Warm rcg + Wpayload rpayload) sin(θ)</code><span>Signed arm holding torque: zero vertically and maximum horizontally.</span></div>
                <div><code>τacceleration = Iarm α</code><span>Additional signed torque needed to angularly accelerate the arm and payload.</span></div>
                <div><code>τarm = τgravity + τacceleration + τfriction</code><span>Total output torque passed through the differential gearing and efficiency model.</span></div>
                <div><code>ω₀ = RPM × 2π / 60, &nbsp;|αstop| = ω₀ / tstop</code><span>Starting angular speed and average deceleration for the worst-case stop.</span></div>
                <div><code>τhold,shared = τgravity,max / Rstop</code><span>Ideal motor-side holding torque shared by the complete motor group.</span></div>
                <div><code>τbrake,shared = Iarm |αstop| / Rstop</code><span>Ideal average motor-side braking torque shared by all arm motors.</span></div>
                <div><code>τpeak,total = (τhold,shared + kPID τbrake,shared) / η</code><span>Estimated loss- and PID-adjusted shared peak.</span></div>
                <div><code>τpeak,motor = τpeak,total / motor count</code><span>Torque assigned to each motor before comparison with per-motor stall torque.</span></div>
                <div><code>τstall,motor = 2.1 × (100 / cartridge RPM) N·m</code><span>Cartridge-adjusted V5 11W stall torque per motor.</span></div>
                <div><code>Fstall = τstall × motor count × R × η / (radius × r)</code><span>Modeled maximum lift force at the cable.</span></div>
                <div><code>force safety = Fstall / Fpeak-required</code><span>Dynamic force margin for the entered full-lift target.</span></div>
                <div><code>load fraction = required torque / stall torque</code><span>Torque loading used by speed, current, and feasibility estimates.</span></div>
                <div><code>speed fraction = 1</code><span>Used through 35% of stall torque.</span></div>
                <div><code>speed fraction = [1 − (load − 0.35) / 0.65]^0.45</code><span>Approximation used above 35% load until stall.</span></div>
                <div><code>Tminimum = max(|A turns|, |B turns|) × 60 × 1.5 / loaded RPM</code><span>Physics-limited minimum command duration.</span></div>
                <div><code>Tsplit = Tlift / s</code><span>Ideal full-lift time when only share <code>s</code> goes to lifting.</span></div>
                <div><code>arm RPM = (θref / 360Tref) × 60 × (1 − s)</code><span>Arm output during the ideal power split.</span></div>
                <div><code>arm revolutions = arm RPM × Tsplit / 60</code><span>Arm travel completed while the split lift reaches 100%.</span></div>
                <div><code>Pmech = (|Fv| + |τarmω|) / ηmechanism</code><span>Total positive motor-shaft demand for lift plus the dynamic arm load.</span></div>
                <div><code>Iper-motor = 0.15 + (2.5 − 0.15) × load fraction</code><span>Approximate V5 motor current, clamped between no-load and stall.</span></div>
                <div><code>Pelectrical,total ≈ max(Pmech / ηmotor, torque-based estimate)</code><span>Total electrical power estimate, capped at 22 W times motor count.</span></div>
                <div><code>Pelectrical,motor = Pelectrical,total / motor count</code><span>Electrical watts assigned to each motor; current remains a separate amp estimate.</span></div>
              </div>
            </div>

            <p className="guide-calibration-note">This is a design estimate, not a replacement for testing. For the closest prediction, measure the real pitch diameters, moving weight, arm mass, center of mass, payload radius, full-stroke time, and V5 Motor Dashboard current, then tune friction and efficiency until the model matches the robot.</p>
          </section>
          </>, guideHost)}

          <section className="timing-calculator">
            <div className="timing-title">
              <div>
                <span className="eyebrow">DIFFERENTIAL TIMING</span>
                <h3>Editable speed scenario</h3>
                <p>The lift-time target drives every 0→100, RPM, speed, and force-safety result below.</p>
              </div>
              <button
                className="timing-preset"
                onClick={() => setTimingScenario(COLIN_TIMING_SCENARIO)}
              >
                Colin preset
              </button>
            </div>

            <div className="timing-primary-grid">
              <label className="timing-field timing-featured">
                <span>Full lift at 100% lift power</span>
                <div>
                  <input
                    aria-label="Full lift time"
                    type="number"
                    min="0.05"
                    max="30"
                    step="0.001"
                    value={timingScenario.liftOnlyTimeS}
                    onChange={(event) => updateTiming("liftOnlyTimeS", Number(event.target.value))}
                  />
                  <small>sec</small>
                </div>
              </label>
              <label className="timing-field">
                <span>Ratio label (display)</span>
                <div>
                  <input
                    aria-label="Scenario ratio"
                    type="number"
                    min="0.1"
                    max="20"
                    step="0.1"
                    value={timingScenario.ratio}
                    onChange={(event) => updateTiming("ratio", Number(event.target.value))}
                  />
                  <small>:1</small>
                </div>
              </label>
            </div>

            <div className="timing-secondary-grid">
              <label className="timing-field">
                <span>Arm reference travel</span>
                <div>
                  <input
                    aria-label="Arm reference travel"
                    type="number"
                    min="1"
                    max="720"
                    step="1"
                    value={timingScenario.armReferenceDegrees}
                    onChange={(event) => updateTiming("armReferenceDegrees", Number(event.target.value))}
                  />
                  <small>deg</small>
                </div>
              </label>
              <label className="timing-field">
                <span>Time for arm reference</span>
                <div>
                  <input
                    aria-label="Arm reference time"
                    type="number"
                    min="0.01"
                    max="30"
                    step="0.000001"
                    value={timingScenario.armReferenceTimeS}
                    onChange={(event) => updateTiming("armReferenceTimeS", Number(event.target.value))}
                  />
                  <small>sec</small>
                </div>
              </label>
            </div>

            <div className="timing-shortcuts">
              <button
                onClick={() => updateTiming("liftOnlyTimeS", Number(staticPerformance.fullLiftTimeS.toFixed(6)))}
              >
                Use modeled lift time
              </button>
              <span>Arm-only output: {formatValue(timingResults.fullArmRpm, 3)} rpm</span>
            </div>

            <label className="power-split-control">
              <div>
                <span>Power sent to lift</span>
                <output>{formatValue(timingScenario.liftSharePct, 0)}% lift / {formatValue(100 - timingScenario.liftSharePct, 0)}% arm</output>
              </div>
              <input
                aria-label="Power sent to lift"
                type="range"
                min="5"
                max="95"
                step="1"
                value={timingScenario.liftSharePct}
                onChange={(event) => updateTiming("liftSharePct", Number(event.target.value))}
              />
              <div className="power-split-axis"><span>More arm</span><span>50 / 50</span><span>More lift</span></div>
            </label>

            <div className="timing-result-grid">
              <div className="result-accent"><span>Split lift time</span><strong>{formatValue(timingResults.splitLiftTimeS, 6)}s</strong></div>
              <div className="result-accent"><span>Arm rotation</span><strong>{formatValue(timingResults.armRevolutions, 6)} rev</strong></div>
              <div><span>Arm travel</span><strong>{formatValue(timingResults.armDegrees, 3)}°</strong></div>
              <div><span>Split arm output</span><strong>{formatValue(timingResults.splitArmRpm, 3)} rpm</strong></div>
              <div><span>Motor Group A</span><strong>{timingResults.groupACommandPct >= 0 ? "+" : ""}{formatValue(timingResults.groupACommandPct, 0)}%</strong></div>
              <div><span>Motor Group B</span><strong>{timingResults.groupBCommandPct >= 0 ? "+" : ""}{formatValue(timingResults.groupBCommandPct, 0)}%</strong></div>
            </div>

            <div className="timing-sentence">
              <strong>Calculated result</strong>
              <p>
                With the {formatValue(timingScenario.ratio, 2)}:1 scenario, the full lift takes {formatValue(timingScenario.liftOnlyTimeS, 6)}s. At a {formatValue(timingScenario.liftSharePct, 0)}/{formatValue(100 - timingScenario.liftSharePct, 0)} split, it takes {formatValue(timingResults.splitLiftTimeS, 6)}s while the arm rotates {formatValue(timingResults.armRevolutions, 6)} revolutions ({formatValue(timingResults.armDegrees, 3)}°).
              </p>
            </div>

            <div className={`scenario-model-check ${timingResults.modelFeasible ? "good" : "bad"}`}>
              <div><span>Lift-only average</span><strong>{formatValue(timingResults.liftOnlySpeedInS, 2)} in/s</strong></div>
              <div><span>Split lift average</span><strong>{formatValue(timingResults.splitLiftSpeedInS, 2)} in/s</strong></div>
              <div><span>Current model minimum</span><strong>{formatValue(timingResults.modeledMinimumS, 3)}s</strong></div>
              <p>{timingResults.modelFeasible ? "This timing fits the current hardware model." : `The current hardware model would lengthen this move to about ${formatValue(timingResults.modeledDurationS, 3)}s.`}</p>
            </div>

            <code className="generated-command">
              move 100 {formatValue(timingResults.armDegrees, 6)} {formatValue(timingResults.splitLiftTimeS, 6)}
            </code>
            <button
              className="load-timing-button"
              disabled={!timingResults.canAnimate}
              onClick={loadTimingScenario}
            >
              Load this mixed move into animation
            </button>
            {!timingResults.canAnimate && (
              <p className="timing-warning">Keep the calculated arm travel within ±720° and the move duration between 0.05s and 30s to animate it.</p>
            )}
            <p className="timing-note">
              The split calculator reproduces ideal proportional math. The hardware model below still checks motor RPM, load, spool geometry, and acceleration limits.
            </p>
          </section>

          <section className="arm-stop-calculator" aria-labelledby="arm-stop-title">
            <div className="timing-title arm-stop-title">
              <div>
                <span className="eyebrow">WORST-CASE ARM STOP</span>
                <h3 id="arm-stop-title">Shared motor torque check</h3>
                <p>Uses the arm mass, center of mass, payload, motor count, cartridge, and mechanism efficiency from the hardware model.</p>
              </div>
              <button className="timing-preset" onClick={loadColinArmStopPreset}>
                Colin stop preset
              </button>
            </div>

            <div className="arm-stop-input-grid">
              <label className="timing-field">
                <span>Arm starting speed</span>
                <div>
                  <input
                    aria-label="Arm stop starting speed"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    value={armStopScenario.startRpm}
                    onChange={(event) => updateArmStop("startRpm", Number(event.target.value))}
                  />
                  <small>rpm</small>
                </div>
              </label>
              <label className="timing-field">
                <span>Stop time</span>
                <div>
                  <input
                    aria-label="Arm stop time"
                    type="number"
                    min="0.01"
                    max="10"
                    step="0.01"
                    value={armStopScenario.stopTimeS}
                    onChange={(event) => updateArmStop("stopTimeS", Number(event.target.value))}
                  />
                  <small>sec</small>
                </div>
              </label>
              <label className="timing-field">
                <span>Effective motor:arm reduction</span>
                <div>
                  <input
                    aria-label="Effective arm stop reduction"
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={armStopScenario.effectiveReduction}
                    onChange={(event) => updateArmStop("effectiveReduction", Number(event.target.value))}
                  />
                  <small>:1</small>
                </div>
              </label>
              <label className="timing-field">
                <span>PID braking peak multiplier</span>
                <div>
                  <input
                    aria-label="PID braking peak multiplier"
                    type="number"
                    min="1"
                    max="5"
                    step="0.05"
                    value={armStopScenario.pidPeakMultiplier}
                    onChange={(event) => updateArmStop("pidPeakMultiplier", Number(event.target.value))}
                  />
                  <small>×</small>
                </div>
              </label>
            </div>

            <div className="arm-stop-equation-callout">
              <span>Combined reflected drive torque · Colin preset ≈ 0.500 N·m</span>
              <strong>
                {formatValue(armStopResults.idealHoldingSharedNm, 3)} + {formatValue(armStopResults.idealBrakingSharedNm, 3)} ≈ {formatValue(
                  Math.round(armStopResults.idealHoldingSharedNm * 1000) / 1000
                    + Math.round(armStopResults.idealBrakingSharedNm * 1000) / 1000,
                  3,
                )} N·m
              </strong>
              <p>
                Both motor groups split this evenly: Group A ≈ {formatValue(armStopResults.idealCombinedPerGroupNm, 3)} N·m and Group B ≈ {formatValue(armStopResults.idealCombinedPerGroupNm, 3)} N·m. Each group’s {formatValue(armStopResults.motorsPerGroup, 0)} motors then share that half.
              </p>
            </div>

            <div className="timing-result-grid arm-stop-result-grid">
              <div><span>Ideal hold · shared</span><strong>{formatValue(armStopResults.idealHoldingSharedNm, 3)} N·m</strong></div>
              <div><span>Ideal brake · shared</span><strong>{formatValue(armStopResults.idealBrakingSharedNm, 3)} N·m</strong></div>
              <div className="result-accent"><span>Ideal combined · shared</span><strong>{formatValue(armStopResults.idealCombinedSharedNm, 3)} N·m</strong></div>
              <div><span>Ideal torque / group</span><strong>{formatValue(armStopResults.idealCombinedPerGroupNm, 3)} N·m each</strong></div>
              <div className="result-accent"><span>PID/loss peak · shared</span><strong>{formatValue(armStopResults.lossAdjustedPeakSharedNm, 3)} N·m</strong></div>
              <div><span>Adjusted peak / group</span><strong>{formatValue(armStopResults.lossAdjustedPeakPerGroupNm, 3)} N·m each</strong></div>
              <div><span>Adjusted peak per motor</span><strong>{formatValue(armStopResults.lossAdjustedPeakPerMotorNm, 3)} N·m</strong></div>
              <div><span>Per-motor stall load</span><strong>{formatValue(armStopResults.perMotorStallLoadFraction * 100, 1)}%</strong></div>
              <div><span>Starting angular speed</span><strong>{formatValue(armStopResults.startAngularSpeedRadS, 2)} rad/s</strong></div>
              <div><span>Average deceleration</span><strong>{formatValue(armStopResults.averageAngularDecelerationRadS2, 2)} rad/s²</strong></div>
            </div>

            <div className={`arm-stop-status ${armStopResults.withinStallTorque ? "good" : "bad"}`}>
              <strong>{armStopResults.withinStallTorque ? "Adjusted peak stays below modeled stall torque" : "Adjusted peak exceeds modeled stall torque"}</strong>
              <span>
                {formatValue(armStopResults.lossAdjustedPeakSharedNm, 3)} N·m total → {formatValue(armStopResults.lossAdjustedPeakPerGroupNm, 3)} N·m per group → {formatValue(armStopResults.lossAdjustedPeakPerMotorNm, 3)} N·m per motor versus {formatValue(armStopResults.stallTorquePerMotorNm, 3)} N·m stall per motor
              </span>
            </div>

            <p className="arm-stop-note">
              This worst case assumes horizontal gravity torque and commanded braking torque act in the same direction. The ideal combined line excludes losses and PID overshoot so it stays comparable to Colin’s hand calculation. The adjusted peak applies the editable PID multiplier to braking torque, then applies mechanism efficiency. Output-side check: {formatValue(armStopResults.maximumGravityOutputTorqueNm, 3)} N·m gravity + {formatValue(armStopResults.brakingOutputTorqueNm, 3)} N·m inertia with I = {formatValue(armStopResults.momentOfInertiaKgM2, 4)} kg·m².
            </p>
          </section>

          <section className="engineering-model">
            <div className="section-title model-title">
              <div>
                <h3>Hardware performance model</h3>
                <span>Edit these to match the final lift</span>
              </div>
              <button
                className="reset-model"
                onClick={() => {
                  setPlaying(false);
                  setTime(0);
                  setPhysics(DEFAULT_PHYSICS);
                }}
              >
                Reset defaults
              </button>
            </div>

            <label className="physics-toggle">
              <span>
                <strong>Physics-limit animation</strong>
                <small>Automatically lengthen commands that ask for impossible RPM.</small>
              </span>
              <input
                type="checkbox"
                checked={limitToPhysics}
                onChange={(event) => {
                  setPlaying(false);
                  setTime(0);
                  setLimitToPhysics(event.target.checked);
                }}
              />
            </label>

            <div className={`model-summary target-summary ${targetPerformance.feasible ? "target-ok" : "target-warning"}`}>
              <div><span>Target 0→100</span><strong>{formatValue(targetPerformance.targetTimeS, 3)}s</strong></div>
              <div><span>Required motor</span><strong>{formatValue(targetPerformance.requiredPeakMotorRpm, 0)} rpm</strong></div>
              <div><span>Average lift speed</span><strong>{formatValue(targetPerformance.averageLiftSpeedInS, 1)} in/s</strong></div>
              <div><span>Dynamic force safety</span><strong>{formatValue(targetPerformance.dynamicSafetyFactor, 2)}×</strong></div>
            </div>

            <div className={`target-check ${targetPerformance.feasible ? "good" : "bad"}`}>
              <strong>{targetPerformance.feasible ? "Target fits this hardware estimate" : "Target exceeds this hardware estimate"}</strong>
              <span>
                {formatValue(targetPerformance.availableMotorRpmAtPeakSpeed, 0)} rpm available at peak speed · {formatValue(targetPerformance.requiredPeakForceLb, 1)} lbf peak force · {formatValue(targetPerformance.motorSpeedUtilization * 100, 0)}% speed load
              </span>
            </div>

            <section className="lift-dynamics-card" aria-labelledby="lift-dynamics-title">
              <div className="lift-dynamics-heading">
                <div>
                  <span className="eyebrow">LIFT ACCEL / DECEL</span>
                  <h4 id="lift-dynamics-title">Requested 0→100 torque and power</h4>
                </div>
                <span>{formatValue(physics.movingWeightLb, 1)} lb moving · {formatValue(liftProfilePerformance.targetTimeS, 3)}s</span>
              </div>

              <div className="timing-result-grid lift-dynamics-grid">
                <div><span>Peak acceleration</span><strong>±{formatValue(liftProfilePerformance.peakAccelerationInS2, 1)} in/s²</strong></div>
                <div><span>Accelerating total force</span><strong>{formatValue(liftProfilePerformance.acceleratingForceLb, 1)} lbf</strong></div>
                <div><span>Decelerating total force</span><strong>{formatValue(liftProfilePerformance.deceleratingForceLb, 1)} lbf</strong></div>
                <div className="result-accent"><span>Accel torque · shared</span><strong>{formatValue(liftProfilePerformance.acceleratingSharedTorqueNm, 3)} N·m</strong></div>
                <div className="result-accent"><span>Decel torque · shared</span><strong>{formatValue(liftProfilePerformance.deceleratingSharedTorqueNm, 3)} N·m</strong></div>
                <div><span>Peak torque / group</span><strong>{formatValue(liftProfilePerformance.peakPerGroupTorqueNm, 3)} N·m</strong></div>
                <div><span>Peak torque / motor</span><strong>{formatValue(liftProfilePerformance.peakPerMotorTorqueNm, 3)} N·m</strong></div>
                <div><span>Peak torque load</span><strong>{formatValue(liftProfilePerformance.peakTorqueLoadFraction * 100, 1)}%</strong></div>
                <div><span>Peak lift output</span><strong>{formatValue(liftProfilePerformance.peakLiftOutputPowerW, 1)} W</strong></div>
                <div><span>Peak motor shaft demand</span><strong>{formatValue(liftProfilePerformance.peakMotorMechanicalPowerW, 1)} W</strong></div>
                <div className="result-accent"><span>Peak electrical · total</span><strong>{formatValue(liftProfilePerformance.peakElectricalPowerW, 1)} W</strong></div>
                <div><span>Electrical / motor</span><strong>{formatValue(liftProfilePerformance.peakElectricalPowerPerMotorW, 1)} W each</strong></div>
                <div><span>Peak current / motor</span><strong>{formatValue(liftProfilePerformance.peakCurrentPerMotorA, 2)} A</strong></div>
              </div>

              <div className="power-clarifier">
                <strong>Watts are power; amps are current.</strong>
                <span>
                  {formatValue(liftProfilePerformance.peakElectricalPowerW, 1)} W is the estimated total across all {liftProfilePerformance.totalMotors} motors ({formatValue(liftProfilePerformance.peakElectricalPowerPerMotorW, 1)} W each). The separate current estimate is {formatValue(liftProfilePerformance.peakCurrentPerMotorA, 2)} A per motor.
                </span>
              </div>

              <p className="lift-dynamics-note">
                Lift torque is shared evenly between Motor Group A and Motor Group B, then among the {formatValue(liftProfilePerformance.motorsPerGroup, 0)} motors in each group. Positive values drive upward; a negative deceleration value means gravity is helping slow the lift and the motors must brake or resist it. {targetPerformance.feasible ? "These peaks describe the requested profile." : "The requested profile exceeds the current model, so Physics-limit animation will use a longer move with lower real peaks."}
              </p>
            </section>

            <div className="model-inputs">
              <label>
                <span>Motor cartridge</span>
                <select
                  value={physics.cartridgeRpm}
                  onChange={(event) => updatePhysics("cartridgeRpm", Number(event.target.value) as 100 | 200 | 600)}
                >
                  <option value="100">Red · 100 RPM</option>
                  <option value="200">Green · 200 RPM</option>
                  <option value="600">Blue · 600 RPM</option>
                </select>
              </label>
              <label>
                <span>Motors per group</span>
                <input type="number" min="1" max="4" step="1" value={physics.motorsPerGroup}
                  onChange={(event) => updatePhysics("motorsPerGroup", Number(event.target.value))} />
              </label>
              <label>
                <span>Motor spool diameter</span>
                <div><input type="number" min="0.25" max="5" step="0.05" value={physics.motorSpoolDiameterIn}
                  onChange={(event) => updatePhysics("motorSpoolDiameterIn", Number(event.target.value))} /><small>in</small></div>
              </label>
              <label>
                <span>Arm spool diameter</span>
                <div><input type="number" min="0.25" max="8" step="0.05" value={physics.armSpoolDiameterIn}
                  onChange={(event) => updatePhysics("armSpoolDiameterIn", Number(event.target.value))} /><small>in</small></div>
              </label>
              <label>
                <span>Motor:winch reduction</span>
                <div><input type="number" min="0.1" max="10" step="0.05" value={physics.externalReduction}
                  onChange={(event) => updatePhysics("externalReduction", Number(event.target.value))} /><small>:1</small></div>
              </label>
              <label>
                <span>Rigging speed multiplier</span>
                <div><input type="number" min="0.25" max="5" step="0.05" value={physics.riggingMultiplier}
                  onChange={(event) => updatePhysics("riggingMultiplier", Number(event.target.value))} /><small>×</small></div>
              </label>
              <label>
                <span>Full lift travel</span>
                <div><input type="number" min="1" max="120" step="0.5" value={physics.liftTravelIn}
                  onChange={(event) => updatePhysics("liftTravelIn", Number(event.target.value))} /><small>in</small></div>
              </label>
              <label>
                <span>Total moving weight</span>
                <div><input type="number" min="0" max="40" step="0.1" value={physics.movingWeightLb}
                  onChange={(event) => updatePhysics("movingWeightLb", Number(event.target.value))} /><small>lb</small></div>
              </label>
              <label>
                <span>Counterbalance force</span>
                <div><input type="number" min="0" max="40" step="0.1" value={physics.counterbalanceLb}
                  onChange={(event) => updatePhysics("counterbalanceLb", Number(event.target.value))} /><small>lb</small></div>
              </label>
              <label>
                <span>Estimated slide friction</span>
                <div><input type="number" min="0" max="10" step="0.1" value={physics.frictionLb}
                  onChange={(event) => updatePhysics("frictionLb", Number(event.target.value))} /><small>lb</small></div>
              </label>
              <label>
                <span>Mechanism efficiency</span>
                <div><input type="number" min="30" max="100" step="1" value={Math.round(physics.mechanismEfficiency * 100)}
                  onChange={(event) => updatePhysics("mechanismEfficiency", Number(event.target.value) / 100)} /><small>%</small></div>
              </label>
              <label>
                <span>Motor efficiency estimate</span>
                <div><input type="number" min="30" max="95" step="1" value={Math.round(physics.motorEfficiency * 100)}
                  onChange={(event) => updatePhysics("motorEfficiency", Number(event.target.value) / 100)} /><small>%</small></div>
              </label>
              <label>
                <span>Arm mass</span>
                <div><input type="number" min="0" max="20" step="0.05" value={physics.armMassLb}
                  onChange={(event) => updatePhysics("armMassLb", Number(event.target.value))} /><small>lb</small></div>
              </label>
              <label>
                <span>Arm center of mass</span>
                <div><input type="number" min="0" max="36" step="0.1" value={physics.armCenterOfMassIn}
                  onChange={(event) => updatePhysics("armCenterOfMassIn", Number(event.target.value))} /><small>in from pivot</small></div>
              </label>
              <label>
                <span>Payload mass</span>
                <div><input type="number" min="0" max="10" step="0.05" value={physics.payloadMassLb}
                  onChange={(event) => updatePhysics("payloadMassLb", Number(event.target.value))} /><small>lb</small></div>
              </label>
              <label>
                <span>Payload distance</span>
                <div><input type="number" min="0" max="48" step="0.1" value={physics.payloadDistanceIn}
                  onChange={(event) => updatePhysics("payloadDistanceIn", Number(event.target.value))} /><small>in from pivot</small></div>
              </label>
              <label>
                <span>Arm friction torque</span>
                <div><input type="number" min="0" max="20" step="0.1" value={physics.armFrictionTorqueInLb}
                  onChange={(event) => updatePhysics("armFrictionTorqueInLb", Number(event.target.value))} /><small>lbf·in</small></div>
              </label>
            </div>
            <p className="model-help">
              Arm and payload mass should already be included in Total moving weight. The separate arm values only calculate rotation gravity and inertia. The point-mass estimate uses I = mr² at each entered radius.
            </p>
          </section>

          <p className="engineering-note">
            Engineering estimate—not a substitute for testing. The V5 baseline uses official 11W motor speed, torque, and current-limit data. Calibrate lift weight, arm mass, center of mass, friction, efficiency, and spool diameters against the finished mechanism for the closest result. <a href="https://kb.vex.com/hc/en-us/articles/360044325872-Understanding-V5-Smart-Motor-11W-Performance" target="_blank" rel="noreferrer">VEX motor reference ↗</a>
          </p>
        </aside>
      </section>
    </main>
  );
}
