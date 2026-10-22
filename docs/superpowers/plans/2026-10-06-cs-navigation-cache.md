# CS navigation continuation — 2026-10-06

## Goal and boundary

Continue the confirmed browser-CS task from `cx_6ac3ab13309c8191a4069a2d49888c78` without overwriting newer work. This increment reduces repeated bot-navigation CPU work; it does not certify CS2 art quality, fix all frame stalls, or publish rejected hand/death candidates.

Worktree: `C:/Users/bag57/projects/super_galen_site/.claude/worktrees/cs`; branch `feat/browser-cs`; starting HEAD `e0d0ea4a`. Existing dirty work is preserved. No commit, push, deployment, global settings or changes to other project servers.

## Runtime change

Only `src/scripts/games/cs/map.ts` changes runtime behavior.

- Prepare the existing 24×28 collision lattice and directed cardinal edges on module load, preserving original BFS ordering.
- Reuse walkability/edges while all collision coordinates and bounds remain unchanged. Invalidate on coordinate, obstacle-count or bounds changes.
- Project repeated blocked cover destinations through a bounded 128-entry cache. Return owned points so caller mutation cannot poison later navigation.
- Check the geometrically nearest node first; if its actual endpoint segment is blocked, retain the exhaustive ordered reachable-node search.
- Keep live start/end segment checks, return no path for nonfinite queries or a map without a reachable lattice node, and use bounded typed-array BFS scratch storage.
- Weapon, hit, damage, map geometry, asset, render-quality and AI target-selection rules are unchanged.

## TDD and evidence

Evidence folder: `tmp/cs-nav-continuation-20261006/`.

- `red.log`: 3 intended failures, 4 passes before implementation: repeated collision work and nonfinite path acceptance.
- `green.log`: first candidate retained too much endpoint-check work; one performance-contract failure preserved rather than relaxing the assertion.
- `targeted-green.log`: 18/18 pass, including 10 new navigation cases, existing map tests and autonomous plant/defuse tests.
- Tests compare exact routes with the pre-change algorithm over 45 fixed and 80 deterministic fractional queries. Coverage includes collision-layout edits, disconnected components, bounds edits, empty lattice, cache eviction and mutation isolation.
- `baseline.json` / `optimized.json`: same 700 path queries, 10,000 blocked-target projections and 2,400 simulation ticks. Exact path arrays and final 40-second simulation state match.
- Local Node CPU totals: path queries 217.44→9.86 ms; target projections 105.71→0.95 ms; simulation 93.20→29.66 ms. These are microbenchmarks, not whole-game FPS or display-latency measurements.
- `full-vitest.log`: 136 files / 1,418 tests passed, single worker.
- `production-build.log`: successful production build.
- `server-proof.json`: IPv4 4002 page is HTTP 200 and serves the new navigation implementation.

## Remaining acceptance

Full CS browser regression and normal visible gameplay sampling are recorded separately as they finish; do not infer their status from the unit or build results.

An attempted read-only independent Codex reviewer did not run successfully: the first invocation waited on stdin and was terminated; the corrected launch was denied by the tool safety review. No approval bypass or substitute delegated launch was used. Oracle tests and root code review are not an independent-agent sign-off.

The overall task still includes realistic first-person hands/reload, natural character death, character skinning and sustained gameplay quality/performance. Preserve the rejection and no-publication gates in the existing V7/V10/V12 art contracts.

## Final acceptance recorded

- Complete CS Chromium suite: 53 passed, 0 skipped, 0 failures, 0 flaky; `e2e.json` / `e2e.log`. Headed, one worker, IPv4, original test assertions and timeouts retained.
- Normal visible gameplay: high and low quality each 60 seconds on Intel ANGLE D3D11, actual mouse/keyboard controls with no route or game-state replacement. High p99 16.7 ms / worst 41.6 ms; low p99 8.5 ms / worst 41.7 ms. Neither sample had intervals over 50 ms, page errors, hidden frames, paused frames or long tasks. Both covered movement, turning, shooting, reload, aim and next round, but neither naturally entered live spectator mode. Historical intermittent stalls remain unproven fixed.
- After sampling, the only source change was map.ts CRLF→LF normalization. `formatting.json` proves normalized executable text identical. Full Vitest (1,418 tests), production build, scoped strict TypeScript and `git diff --check` were rerun successfully; see `final-checks.json`.
- Final runtime SHA-256: `71e70559a2142909de8aa2f9eb1ac4dc9ff23d2be25c6e3299c94284a66252f6`.
- Updated handoff: `tmp/cs-goal-handoff-20261006-navigation.json`. Evidence page: `tmp/cs-nav-continuation-20261006/review.html`; screenshot is the actual browser acceptance frame, not a new art asset.
- Independent-agent sign-off remains unavailable as explained above; all-site/all-browser E2E was not run. No commit, push, deployment or replacement of rejected art candidates.
