# SYSTM Diffy Lift Animator

[**Open the web tool →**](https://the-flying-cuber.github.io/systm-diffy-lift-animator/)

An interactive browser-based tool for visualizing, programming, and estimating the performance of a continuous differential lift.

## What the Tool Does

- Animates an eight-stage continuous lift and rotating end effector.
- Models the yellow arm carriage extending first.
- Extends Stage 8 next, followed by Stages 7 through 2.
- Keeps Stage 1 stationary at the base.
- Displays the movement of both differential motor groups.
- Estimates motor RPM, lift speed, force, torque load, current draw, and minimum movement time.
- Allows mechanism values such as gearing, spool diameter, weight, friction, and efficiency to be adjusted.
- Saves the current program and settings in the browser.

## How to Use It

1. Open the web tool using the link above.
2. Enter movement commands in the animation editor.
3. Adjust the timing and hardware settings to match your mechanism.
4. Press **Play** to run the animation.
5. Watch the lift, motor groups, timeline, and live engineering estimates.
6. Use the manual sliders to inspect specific lift heights and arm angles.

## Animation Commands

| Command | Description | Example |
| --- | --- | --- |
| `lift HEIGHT SECONDS` | Moves the lift to a target extension from 0–100%. | `lift 100 1.5` |
| `rotate DEGREES SECONDS` | Rotates the end effector to a target angle. | `rotate 90 0.8` |
| `move HEIGHT ANGLE SECONDS` | Moves the lift and end effector together. | `move 60 -45 1.2` |
| `wait SECONDS` | Holds the current position. | `wait 0.4` |
| `home SECONDS` | Returns the lift and end effector to zero. | `home 1.0` |

Lines beginning with `#` or `//` can be used as comments.

## Differential Behavior

The tool models the two motor groups using a differential mix:

- Opposite motor directions create lift movement.
- Matching motor directions rotate the end effector.
- Combined commands move and rotate the mechanism simultaneously.

## Engineering Notice

The calculations are intended as design estimates. Real performance will depend on the completed robot, battery condition, friction, cable routing, structural alignment, motor temperature, and other physical factors.

For the closest results, enter measurements from the finished mechanism and compare the estimates with real V5 motor telemetry.

## About SYSTM

Developed by **SYSTM Robotics** as a visualization and design tool for differential lift development.
