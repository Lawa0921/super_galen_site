# Weapon-dependent viewmodel kick implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Root is the sole writer in the existing isolated CS worktree; reviewers are read-only.

**Goal:** Make the first-person weapon kick distinguish pistol, SMG, rifle and sniper, including ADS, while retaining the existing hitscan/recoil behavior.

**Architecture:** Share the engine's existing per-weapon recoil impulse through one pure function. Scale that impulse by 5 for the existing viewmodel translation/pitch envelope, keeping its 0.13 cap and exponential recovery. Rifle hip kick remains 0.065. No new per-frame objects, geometry, effects or render passes.

**Tech stack:** TypeScript, Three.js, Vitest, Chromium/Playwright on Windows D3D11.

**Spec:** `docs/superpowers/specs/2026-10-03-browser-cs-design.md`; user's approved CS-style hitscan/recoil/spread/tracer direction.

## Scope and review focus

- Keep current weapon balance, aim cone, first-shot direction and camera recoil unchanged.
- Use authoritative actor aim state, including viewed teammates; do not use local input for a spectator's kick.
- Ruling: the cosmetic weapon envelope observes the current actor ADS state when rendered; it is not an exact shot-time ADS replay. The engine retains its exact shot-time kick. This avoids expanding event snapshots for a cosmetic adjustment, and the renderer test locks this boundary.
- Preserve existing round/view reset and pause recovery behavior.
- Preserve final-shot feedback, reload and scoped visibility.
- Keep art assets and unrelated multi-direction HUD work out of this change.

## Task 1: Shared recoil impulse and actual renderer regression

- [x] Snapshot the existing runtime/test files under `tmp/cs-weapon-kick-v1/before`.
- [x] Add a renderer E2E covering first-shot displacement for all four weapons, hip/ADS, recovery and viewed-actor reset; run it against the old fixed kick and record the intended failure.
- [x] Add engine regression coverage for every weapon's first kick and ADS multiplier.
- [x] Extract `weaponRecoilKick(weapon, aiming)` in `engine.ts` without changing its values. Use it for engine recoil and the renderer's weapon impulse.
- [x] Run related tests, full `npx vitest run`, and CS Chromium specs. Inspect actual viewmodel screenshots. No additional geometry or render pass was introduced; no post-change FPS gain was measured.
- [x] Obtain independent read-only review, verify source snapshots/diff and preserve current capture as a pre-change diagnostic rather than claiming a measured FPS gain.

Files: `src/scripts/games/cs/engine.ts`, `renderer.ts`, `combat.test.ts`, `tests/e2e/games-cs-renderer.spec.ts`. No commit, push or deployment in this task.

Ruling after full verification: the existing death-view E2E used the first rendered dead frame as its hold origin, while the production contract intentionally uses the lethal event time. A deterministic two-step catch-up probe produces old assertion=false and event-time assertion=true. Fix only the E2E's clock reference in `games-cs-feedback.spec.ts`, retain nonempty hold coverage and later spectator assertions, and preserve the failed full-run evidence. No spectator runtime change.

Verification: 134 Vitest files / 1,397 tests passed. Latest full Chromium run had 43 passes and one `page.goto` failure with `net::ERR_NETWORK_CHANGED`, before the game loaded; that exact case then passed with a saved trace. Thus all 44 cases have passing evidence, but there was no single uninterrupted 44/44 full run. Earlier untraced module-fetch failures remain unattributed; do not claim the network trace proves those earlier failures had the same cause. No browser retries, production retry code or OS/network settings were added. Evidence: `tmp/cs-weapon-kick-v1/`.
