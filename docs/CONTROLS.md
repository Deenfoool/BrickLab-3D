# Mechanism controls

BrickLab uses per-instance control profiles. Two copies of the same part may use different speeds, starting states and keyboard bindings.

## Lab Motor

BUILD Properties expose:

- Base RPM — starting speed for a new SIMULATE / TEST run.
- Runtime max RPM — upper bound for the live slider and Speed +/- bindings.
- Speed step — amount changed by Speed +/-.
- Auto-start — whether the motor starts immediately when physics starts.
- Initial direction — forward or reverse.
- Bindings — Forward, Reverse, Stop, Toggle, Speed + and Speed -.

Forward and Reverse bindings are momentary controls. While a direction key is held the motor runs in that direction; releasing the final held direction key returns the command to zero. Runtime buttons can latch Forward / Stop / Reverse.

Runtime RPM changes do not modify the BUILD base RPM. Restarting physics starts from the BUILD configuration again.

## F/N/R Gearbox

Each gearbox stores its own initial F / N / R mode and bindings for:

- Forward
- Neutral
- Reverse
- Next mode
- Previous mode

The top-bar F/N/R switch is a master control. In BUILD it changes the initial mode of all gearboxes; during SIMULATE / TEST it changes all gearbox runtime modes without restarting physics.

Neutral disables the semantic transmission coupling instead of forcing the output shaft toward zero RPM.

## Keyboard model

Bindings use `KeyboardEvent.code`, so physical key positions continue to work across English, Russian and Latvian keyboard layouts.

Click a binding field in Properties and press the desired physical key. Backspace or Delete clears a binding; Escape cancels capture.

## Runtime Control Deck

SIMULATE and TEST show a Control Deck for every controllable part:

- motor live RPM slider and Forward / Stop / Reverse buttons;
- gearbox F / N / R buttons;
- assigned key hints.

## Project persistence

Control profiles are cached in the browser by part `instanceId`. BrickLab's custom Export handler also embeds the control profile into each exported `.bricklab` part entry under `control`. Import restores these profiles before reloading the project.

## Extending the system

The control layer is intentionally per-instance and action-based. Future controllable parts can add action profiles such as steering left/right, clutch engage/release, linear actuator extend/retract, winch in/out, servo target positions and multi-speed transmissions without changing the motor control model.
