Original prompt: Next detail to work on is the 10 second ahead flight window. Currently it seems to stay single in its space. It should scale up, staying where it was set in space and time as the spinner passes through the safe area. Eventually, when a controller is added, not simply running on autopilot as it is now, a cyan indicator shows where the next safe zone would be, and projections further than 10 seconds, 20, 30 are inferred.

## Current work

- The magenta gate is now anchored at the route position 10 seconds ahead when placed. Its 120 m by 60 m billboard grows in perspective during approach.
- The active gate remains fixed through speed, heading, and altitude changes. A new gate appears after crossing; autopilot uses route travel and manual flight uses a world-space crossing plane.
- Added concise simulation state and deterministic stepping hooks for browser testing.
- Unit tests pass (11/11). Browser simulation confirms one gate remained at the same world coordinates through 8 seconds of travel, grew visibly, and changed to sequence 2 only after route travel crossed the gate. No browser errors were recorded.

## Later

- A controller-aware cyan next-safe-zone indicator and inferred 20- and 30-second projections are future work. The target calculation should accept a horizon so those projections can be added without changing the active gate behavior.
