# RTS animated 3D portraits implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Root is the only writer; independent review is read-only.

**Goal:** 選取每種兵種時，在指揮介面顯示會動的 3D 特寫。

**Architecture:** 共用 Battlefield 的 WebGLRenderer，在透明 HUD aperture 內用 scissor 繪製獨立 Scene、Camera、ModelInstance。只從 TeamView 選取第一個存活實體；建築、空選取、失去視野與死亡立即清空。人形取頭肩、騎士取騎乘者、攻城車取機械。

**Tech Stack:** Existing Astro / Three.js / TypeScript / Vitest / Playwright; no dependency or generated asset additions.

**Spec:** `docs/superpowers/specs/2026-10-04-browser-rts-design.md`; user approved animated 3D portraits on 2026-10-05. Existing spec remains the sole art direction.

## Global constraints

- Eight unit kinds use their published LOD0 GLB and Idle clip, with independent animation mixer and existing team materials.
- No second WebGL context, no additional image download, no shadow-casting portrait lights.
- Pause freezes portrait; prefers-reduced-motion uses a still pose.
- Existing generated command-panel nine-slice frame is reused without center fill.
- Performance acceptance: 80 units / 20 buildings, 1080p, active portrait, 60 seconds, median ≥55 FPS; no errors.

## Review focus

- Invisible/dead enemy cannot remain in portrait even with stale selection IDs.
- Fractional DPR and resize cannot corrupt main renderer state or overlay alignment.
- Switching same-kind units reuses clone; kind/team changes and restart release it.
- Head/helmet stays inside aperture throughout Idle, including mounted rider.
- Narrow desktop retains readable stats and accessible production commands.

### Task 1: Portrait controller and state isolation

Files: `src/scripts/games/rts/portrait.ts`, `portrait.test.ts`.
Interface: `SelectionPortrait(library, frame)`, `update(view, ids, dt)`, `render(renderer, canvasRect)`, `dispose()`; renderer coordinates remain CSS logical pixels.

- [x] Write failing assertions for selection order, hidden/dead/building clearing, reuse/dispose, pause, viewport clipping and renderer restoration after a thrown render.
- [x] Run `node node_modules/vitest/vitest.mjs run src/scripts/games/rts/portrait.test.ts`; confirm meaningful RED.
- [x] Implement a single owned model, fixed per-kind framing, Idle updates and scissored rendering with `try/finally` restoration.
- [x] Repeat the same tests; confirm GREEN.

### Task 2: HUD assembly and browser behavior

Files: `scene.ts`, `main.ts`, `src/pages/games/rts.astro`, `src/styles/_rts.scss`, `tests/e2e/games-rts-portrait.spec.ts`.

- [x] Add stable portrait frame next to `#rts-selection`; existing dynamic text updates keep the viewport intact.
- [x] Render after the world, clear the overlay aperture and dispose before the world renderer.
- [x] Browser fixture uses all eight published units and real clicks. Check moving pixels, paused pixels, multi-select, visibility loss, clearing and restart; capture each unit.
- [x] Run desktop Chromium, Firefox and WebKit RTS suite, full Vitest, strict TypeScript and production build.

### Task 3: Evidence and independent review

Files: `tests/manual/rts-performance*.ts`, `art-factory/rts/contracts/selection-portraits.json`, screen breakdown, guide/progress ledger.

- [x] Update performance observer to retain world and portrait draw statistics separately, select a real unit through UI and run the formal 60-second load scenario.
- [x] Inspect screenshots at normal/narrow desktop and DPR 1.5; archive source hashes, framing, QA and test results under `art-factory/rts/runs/selection-portraits/2026-10-05/`.
- [x] Read-only consultant review; fix verified findings with regression tests. Commit only task files; no push/deploy.

## Execution ledger

- Base: `907dfada`, worktree `rts`, branch `feat/browser-rts`. Existing environmental node_modules/pycache changes excluded.
- Ruling: explicit “直接開始” and animated 3D selection authorize this reversible implementation; no further design approval gate.
- Ruling: existing published source models supply portrait pixels. No new raster generation or competing art style guide is needed.
- RED: four behavior tests failed on the intentionally empty controller; GREEN: all four passed after implementation. A fifth regression covers live reduced-motion preference.
- Browser RED: dock exceeded its boundary by 25.59375px. Explicit minmax(0,1fr) grid tracks fixed the overflow; Chromium then passed all eight motion/clearing/restart checks.
- Read-only consultant approved code and the eight Chromium portraits, with nonblocking notes about knight horse detail and siege image occupancy. One hidden LOD mixer is retained per portrait instance; optimization only if measured performance requires it.
- Initial full unit run hit an unrelated 5s Pixi import timeout; the documented `--maxWorkers=4` run passed 129 files / 1328 tests. No test was excluded or timeout relaxed.
- First portrait browser pass found fixture startup/restart synchronization gaps; wait for network idle and the actual world model before clicking. All six portrait cases subsequently passed within the full desktop run.
- Full desktop regression: 38/39 passed (11.7 minutes). WebKit caught a stale HUD second immediately after pause: 00:03 then 00:04 while the simulation stayed frozen. Independent review confirmed the 100ms HUD throttle race. Two deterministic controller tests failed at 0.95 vs 1.05, then passed after synchronously flushing the latest TeamView in showMenu. Recheck every pause/restart/result case on all three browsers.
- Final evidence: 1330 tests / 130 files passed; strict TS exit0; build 18.34s. All 39 distinct desktop cases have passing latest applicable evidence across the initial full run, affected pause follow-up and final 6/6 portrait run. Reports remain separate; no single-run 39/39 claim.
- Exact paused image comparison exposed an intermittent mismatch. The diagnostic now records raw RGBA, world/bone matrices and viewport/scissor/camera metadata per run. Three raw diagnostic repeats and the final six cross-browser tests passed without relaxing exact comparisons. The earlier overwritten raw pair cannot establish a renderer root cause; preserved logs document this limit.
- Active knight portrait, 80 units / 20 buildings, 60 seconds: median59.8802FPS, p95 25ms, max91.6ms, zero errors. Production-build worker portrait visibly animates; no new runtime asset requests, compressed asset bytes remain28,517,198.
