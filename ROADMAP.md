# Development roadmap

These are proposed follow-up tasks for the current workshop release. They are not implemented by this document, and no delivery dates are committed.

## Playability and recovery

Expand the device checks around touch movement, small-screen HUD layout and wallet browsers. Exercise save recovery after a connection drops, the browser closes or another device opens the same account.

Acceptance: record the tested devices and reproduction steps; keep the selected character and saved progression consistent across sessions. Any discovered defect should have a separate issue and a focused fix.

## Server-validated progression

Design server-validated commands for reward-producing actions before attaching monetary value to workshop progress. Define valid job transitions, duplicate-request handling and concurrent-session behavior.

Acceptance: document the command contract and test rejected transitions in isolation. Existing client-simulated Credits and REP must not become payable balances through a configuration switch.

## Workshop expansion

Explore distinct responsibilities for a Runner and an Engineer alongside the existing Mechanic. Describe their routes, carried items, assignment rules and interaction with player-controlled work before implementation.

Acceptance: publish a small behavior specification with example jobs and interruption cases. Keep proposed features separate from the current playable feature list.

## Following progress

Track individual work items in repository issues. Link implementation commits to the relevant issue and include validation results. Update the README's current-game section only after the corresponding behavior is implemented and checked.
