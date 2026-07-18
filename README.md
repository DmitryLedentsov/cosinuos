# Cosinuos // Signal Drift

A compact canvas arcade game rebuilt around a dark minimal interface, geometric signal graphics and readable power-up interactions.

## Controls

- Pointer / touch — steer the signal
- WASD / arrow keys — keyboard steering
- Space or Escape — pause
- M — toggle sound

## Power anomalies

- **Pulse** — expanding radial purge
- **Phase** — temporary contact immunity
- **Orbit** — three rotating cutters
- **Drift** — slows the whole enemy field
- **Amplify** — doubles chain gain
- **Repair** — restores one integrity point

## Technical notes

The game is dependency-free and runs from static files. The main loop uses `requestAnimationFrame`, delta-time movement, capped device pixel ratio, bounded entity counts and a small spatial grid for enemy connection rendering.

Live build: https://dmitryledentsov.github.io/cosinuos/
