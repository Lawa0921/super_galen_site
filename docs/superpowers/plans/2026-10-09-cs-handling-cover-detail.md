# Breach Point handling and modular detail

**Goal:** Continue the authorized CS2-inspired original game with measurable stopping/accuracy, covered approaches, and finer reusable rigid parts.

**Spec:** `docs/superpowers/specs/2026-10-03-browser-cs-design.md`; the user's October 9 request extends all model categories, handling, and map quality. This is one deliverable increment, not a claim of CS2 parity.

**Architecture:** Engine-owned horizontal velocity; existing hitscan and direct mouse look. One physics map feeds navigation, ray tests and authored cover. Blender collection parts cook into existing material batches; protect original model streams and anchors. No Valve assets, new dependencies, public deployment, visible browser, or replacement of rejected character candidates.

**Acceptance:** Acceleration, release and counter-strafe differ; actual speed controls accuracy; diagonal/air/wall/round-reset cases remain correct. Both sites retain routes, spawn sightlines gain cover. Rigid details use existing licensed materials, editable source, matching collision, zero new material batches, <=32 MB runtime package. Background real renderer captures, gameplay, relevant/full unit tests, Chromium E2E, build and independent review.

- [x] Add failing movement and cover regression tests; run red.
- [x] Implement horizontal velocity and velocity accuracy in `engine.ts` / `movement.ts`; existing bot objective tests pass without an AI rewrite.
- [x] Author ten crate assemblies and three sniper optical parts under `art-factory/cs/runs/run-20261009-v34-handling-detail`; preserve original streams, rig, anchors and material factors. The shared normal uses pixel-identical lossless WebP. Bolt geometry remains unchanged because its sampled tip was an incomplete ring.
- [x] Verify cover/map agreement, routes, preserved exterior, native renderer and close views. Independent review found protruding components and incomplete screenshot seals; both were corrected before local publication.
- [x] Full Vitest: 149 files / 1506 tests. Chromium: 64 tests. Build passed. Nine native captures and responsive review page passed. Two 120s gameplay samples and two 60s follow-up samples recorded.

**Outcome:** Local incremental delivery, with overall quality/performance work still open. Environment/sniper remain 32/12 primitives; runtime bundle 31,668,796 bytes. High/low 120s P95 20.9/12.7ms; low had early long frames up to245.8ms. Follow-up low had no >50ms frames, which does not establish a fix. Natural spectator performance coverage remains incomplete; functional spectator E2E passes. Full evidence: `art-factory/cs/runs/run-20261009-v34-handling-detail/qa/verification.json`.

Review focus: inertia at narrow corners/stairs; bot objective completion; shooting while blocked against walls; velocity reset after death/round changes; visuals agree with bullets/collision; art additions do not silently replace protected meshes or overshoot download/draw budgets.
