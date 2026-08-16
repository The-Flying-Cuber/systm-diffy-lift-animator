# SYSTM Diffy Lift Animator

An interactive, schematic animator and first-pass performance estimator for
SYSTM's continuous differential lift. It shows eight rail segments on each side
(16 rail lines total), plus the smaller yellow arm carriage. Stage 1 is fixed to
the base while Stages 2–8 move. The two motor-group dials use the differential
mix and the current spool geometry instead of an arbitrary animation scale.

The interface uses a high-contrast black-and-yellow engineering theme across
the mechanism view, command editor, timing calculator, and hardware model.
Every panel uses a solid color with no visual gradients. Manual move controls
sit directly below the mechanism timeline/replay bar in the left column,
followed by an in-app guide covering every button, command, input, readout, and
core equation used by the estimator. This balances the two desktop columns and
keeps the editable timing and hardware controls from becoming one long stack.

The lift animation uses continuous rigging behavior. The yellow arm carriage
extends first; once it reaches full travel, it pulls the innermost/top Stage 8,
then Stage 7, Stage 6, and continues outward through Stage 2 while Stage 1
remains fixed. It does not spread extension proportionally across every stage
like cascade rigging. The yellow carriage stops with its lower crossbar at the
midpoint of Stage 8, preserving half-stage overlap, and the arm, pivot, and
carriage remain one rigid assembly throughout the motion.

## Run it in VS Code

1. Install Node.js 22 or newer.
2. Open this folder in VS Code.
3. Open the integrated terminal and run `npm install`.
4. Run `npm run dev:pages`.
5. Open the local address printed in the terminal.

## Animation commands

```text
lift 100 1.5       # target height %, duration seconds
rotate 720 1.2     # target arm angle, -720 to +720 degrees
move 60 -45 1.2    # move lift and arm together
wait 0.4           # pause
home 1.0           # return lift and arm to zero
```

Parentheses and commas are optional, so `lift(100, 1.5)` also works. Lines
beginning with `#` or `//` are comments.

The motor readouts demonstrate the differential mix:

- Motor Group A = positive lift + arm rotation
- Motor Group B = negative lift + arm rotation

The manual arm slider spans -720° through +720°, allowing two full revolutions
from home in either direction.

## Differential timing calculator

The timing calculator starts with Colin's 4:1 example. Edit the full-lift time
in seconds, the arm-only reference timing, or the lift/arm power split and it
automatically calculates the mixed lift time, arm revolutions and degrees, arm
output RPM, Group A/B commands, and a ready-to-use `move` command.

The entered full-lift time is also the performance target for the entire tool.
It updates both 0-to-100 cards, required peak motor RPM, average lift speed,
peak acceleration force, and dynamic force safety. The RPM check is evaluated
at mid-stroke peak speed; the force check is evaluated separately at the
smooth-profile acceleration peak because those events do not occur together.

The default preset recreates the example: a 0.727-second lift and a 270° arm
move in 0.461538461538 seconds. At a 50/50 split, the ideal proportional result
is a 1.454-second full lift while the arm turns 1.181375 revolutions. A separate
model check compares that ideal calculation with the current motor, load,
spool, rigging, and acceleration settings.

The ideal split uses `mixed lift time = lift-only time / lift share`. Arm
rotation is calculated from the arm-only reference speed multiplied by the
remaining arm share and the mixed lift time. The ratio field labels the design
being compared; the directly entered lift time is what drives the calculation.

## Hardware performance model

The right-side model lets Colin edit the motor cartridge, motors per group,
motor and arm spool diameters, external reduction, rigging multiplier, lift
travel, moving weight, counterbalance, friction, efficiency, and arm load.
Those inputs drive:

- The editable 0-to-100% target, required RPM, and linear speed
- Group A and B motor input RPM
- Lift-winch and arm output RPM
- Required lift force, modeled stall force, and torque load
- Estimated mechanical output, electrical draw, and current per motor
- A feasibility warning when a programmed duration requests more RPM than the
  modeled loaded motor speed

With **Physics-limit animation** enabled, a command that is too fast is
automatically lengthened to the estimated achievable duration. Animation uses
a smooth acceleration/deceleration profile, so the 0-to-100% estimate is not a
constant-speed travel-time calculation.

## Accuracy and calibration

The included defaults are a useful design estimate, not a substitute for a
measured mechanism. For the closest result, enter the finished lift's measured
moving weight and spool pitch diameters, then tune friction and efficiency by
comparing a real full-stroke time and V5 Motor Dashboard telemetry with the
simulation.

The baseline motor curve follows VEX's published V5 Smart Motor 11W speed,
torque, current-limit, and 11 W output information:
https://kb.vex.com/hc/en-us/articles/360044325872-Understanding-V5-Smart-Motor-11W-Performance

## Publish it with GitHub Pages

This repository includes an automatic GitHub Pages deployment. The workflow
detects the repository name and builds the correct URL path automatically.

1. Create a new **public** repository in the `SYSTMVEXU` organization. The
   recommended name is `systm-diffy-lift-animator`.
2. Upload everything from this project folder, including the hidden `.github`
   folder, to the repository's `main` branch.
3. Open the repository's **Settings**, select **Pages**, and set **Source** to
   **GitHub Actions**.
4. Open the **Actions** tab and wait for **Deploy SYSTM Diffy Lift Animator to
   GitHub Pages** to finish with a green checkmark.

With the recommended name, the shareable animator URL will be:

`https://systmvexu.github.io/systm-diffy-lift-animator/`

Every future change pushed to `main` will rebuild and update that link.
