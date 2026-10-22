# Breach Point Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Preserve other worktrees and existing changes.

**Goal:** 將完整可玩的原創 CS 風格第一人稱爆破遊戲接入遊戲室。
**Architecture:** 純 TS 單人對戰模擬與電腦 AI；Three.js 只渲染；Astro 負責頁面和既有網站整合。Blender 資產獨立產生，使用對齊的 GLB 契約。
**Tech Stack:** Astro 7, Three.js 0.182, TypeScript, Vitest, Playwright, Blender 5.2.
**Spec:** `docs/superpowers/specs/2026-10-03-browser-cs-design.md`

## Constraints and review focus

沿用字型，不改其他遊戲或合約；禁 !important 和行內樣式；正式角色與武器必須建模。外部輸入非有限值、過量輸入、重複交易、斷線與失去焦點為重点邊界。先測試失敗再實作。原始 checkout 留原狀。

## Tasks

- [x] 1. `src/scripts/games/cs/{map,engine,ai}.ts` 與旁置測試：先寫購買、回合、開火/遮擋、彈藥、碰撞、炸彈互動、AI 目標測試；執行看到預期失敗；實作後綠燈。介面 `createMatch(team)`, `stepMatch(state, inputs, dt)`, `buyWeapon(state,id,weapon)`；座標使用 Three.js Y-up，地面 X/Z。
- [x] 2. `art-factory/cs`、`public/assets/games/cs`：建模者獨立 worktree 輸出環境、士兵、四種槍械、炸彈與封面；原始檔與 manifest；模型腳朝 Y-up，前向 -Z，地圖範圍 ±24 × ±28，所有碰撞與場景由同份 JSON。
- [x] 3. `src/pages/games/cs.astro`, `src/scripts/games/cs/{client,renderer,audio}.ts`, `src/styles/_cs.scss`：先 e2e 驗证載入、開始、移動、商店、暫停/續玩，再接渲染、輸入、HUD、音效和設定。WebGL/模型失敗可重試。
- [x] 4. 使用者明確選擇「先完成單人打電腦」，取消本次多人模組與房間 UI，保留引擎與 renderer 分離。
- [x] 5. `src/pages/games/index.astro`：只加 CS 卡片、保留當前版型。相關 e2e 更新入口斷言，若新增 i18n key 則兩份五語同步。
- [x] 6. 完整驗證：全套 Vitest、build、相關 e2e、實際 preview 與截圖、唯讀獨立審查、機密/diff 檢查；記錄實際通過與失敗，未達目標不標完成。

## Evidence ledger

- 2026-10-03：Windows；原 checkout feat/pixel-pet-sanctuary 有既有大量未提交工作。已 fetch origin，新工作樹 `.claude/worktrees/cs` 基於 origin/master 56fb730e、分支 feat/browser-cs。
- Blender MCP 未連線；本機 Blender 5.2 可用，改用隔離背景程序，保留使用者場景。
- npm.ps1 被系統既有原則阻擋，使用 npm.cmd；不更改系統原則。

- Engine RED: 16 tests executed against empty contracts and failed; GREEN: 16/16 passed. AI objective fixture originally exposed stationary defenders and ended by elimination; hiding defenders inside sealed warehouse correctly isolated navigation/planting.
- Full Vitest: npx.cmd vitest run --maxWorkers=4, 108 files / 1218 tests passed. Initial unlimited-worker baseline had one existing Pixi import timeout; limiting workers resolved it without changing tests.
- Targeted TypeScript: npx.cmd tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --resolveJsonModule --esModuleInterop --skipLibCheck --lib ES2023,DOM,DOM.Iterable [CS source files], exit 0.
- Production build: npm.cmd run build, exit 0; all pages emitted. Initial attempt caught client/audio paths; corrected before successful run.
- Full bot match simulation (both selected teams, player set to bot solely in CLI fixture): match-over at simulated 155.07s / 119.52s, score 1:4 / 0:4. No stuck rounds.
- Preview server: own worktree's Astro daemon at http://localhost:4002, PID 184484. Port 4321 belongs to super_galen_site_sol61_article PID112860 and is intentionally preserved.
- Astro7 auto-detaches under agent detection: first Playwright webServer attempt failed early but live daemon was confirmed via process command line and logs, then reused; did not restart a live handle.

## Final verification record

- User scope: single-player only; no multiplayer API, contract changes, push or public deployment.
- Independent review corrections: invalid AI cover goals, team-color reuse, loss wording; delayed Pointer Lock race; countdown minute boundary; low-FPS elapsed-time loss; scalar-material shape and imported leg rest pose. Behavioral fixes have RED→GREEN evidence under `tmp/`.
- CS unit suite: 3 files / 29 tests passed (`tmp/cs-unit-final.log`).
- Latest full Vitest: 109 files / 1231 tests passed in 117.97s. The existing Pixi import smoke intermittently exceeded the default 5s under concurrent browser/build load; final command uses one worker and a documented 15s runner timeout, without changing its assertions (`tmp/cs-final-vitest-serial.log`; original failure retained in `tmp/cs-final-vitest-import-timeout.log`).
- Latest TypeScript and production build: exit 0; build completed at 15:18:13 in 54.42s (`tmp/cs-final-build.log`).
- Latest CS e2e: 14 passed / 16 intentional skips across the five projects, including 6/6 desktop Chromium tests in 1.8m (`tmp/cs-all-browser-final.log`). Gameplay acceptance is desktop Chromium; fallback and small-device notices run on all projects. Resume explicitly reacquires pointer lock and moves the player again. Earlier build/HMR interference is retained in `tmp/cs-e2e-hmr-interruption.log` and superseded by this frozen-server rerun.
- Full-site e2e completed on the isolated frozen snapshot on port 4004: 2150 cases across 39 files / 5 projects; exit 1, 1910 passed / 129 failed / 108 skipped / 3 did not run (1.4h). This is not a green full-site result. The snapshot is based on `ad277f73` plus the recorded uncommitted CS files and older v1 test assets; it is not the final v2 visual acceptance. Final CS code/assets are covered by the latest 14-pass run above.
- Art QA: valid GLB headers/materials, all 9 collision shells and map-source comparison pass; all 8 runtime SHA256 values match registry. Factory-shape validator passes with no findings.
- Independent final model review: full soldiers, orange/blue teams, feet on ground, gun/HUD/scene readability pass. Evidence and limitations: `art-factory/cs/runs/run-20261003-v2/qa/assembly-review.md`. Human assembly review remains pending; local publication does not claim user approval.
- Independent consultant final verdict: APPROVE for client/presentation/renderer and CS tests, no unresolved P0–P2. Product source hashes stayed fixed during the final verification; only resume e2e assertions were added.
- Latest all-bot simulation fixture: both selections reach match-over at 107.58s / 102.42s simulated, both score attack 0 : defend 4 (`tmp/cs-simulation-final.log`). This establishes termination, not balance or human-input acceptance.
- `git diff --check` and scoped credential-pattern scan pass. The tracked `node_modules` symlink deletion is an environment-only Windows install detail and must not be committed.

### Full-site failure classification and bounded reruns

Original evidence remains in `../cs-regression/tmp/cs-regression-20261003/`: `playwright-full.log`, `playwright-full-failure-lines.txt`, the saved last-run state, and original failure artifacts. Snapshot manifest SHA256: `B3FA482009D08174E933D71D55F9427F93BCD76F4EF70D5E12990577C5B4BB23`.

Independent read-only classification accounts for all 129 failures:

| First-run failure mechanism | Count | Evidence and limit |
| --- | ---: | --- |
| `page.goto` waiting for `load` exceeds 30 seconds | 57 | Mitsu 43, Lubu 6, Naomiao 3, other pages 5. A common failure stage does not prove a common root cause. |
| Existing test/device expectations incompatible with unchanged source | 60 | Touch devices executing keyboard-game cases 39; family navigation/heading expectations 10; hidden desktop UI on mobile 8; mobile WebKit `mouse.wheel` unsupported 2; Firefox `m11=-1.1102230246251565e-16` against strict `>=0` 1. |
| Older frozen CS cases | 2 | Superseded for final CS acceptance by the latest whole CS spec: 14 passed / 16 deliberate skips. The original full-run failures remain recorded. |
| Other browser/interaction assertions | 10 | Host migration, SPJ, BGM, Tetris lobby, Passer, Naomiao and VIC; checked separately rather than assumed to be baseline. |

The 3 did-not-run cases follow the failed first case of the mobile-Chromium serial quick-match suite. Its `browserName` guard permits the mobile Chromium project even though the product hides keyboard-game entry points on coarse-pointer devices.

- One-worker reruns of actual failed cases: Chromium 1 passed (host migration); Firefox 1 passed / 2 failed; WebKit 11 passed / 7 failed; mobile Safari VIC 1 failed. Rerun passes mean the failure did not reproduce under those conditions, not proof that parallel load was the sole cause.
- Clean base comparison: separate `cs-baseline` worktree, branch `test/browser-cs-baseline`, HEAD `56fb730e5bf1be09525f4df096a4c920467d2676`, port 4005, independently installed lockfile dependencies. Eighteen representative browser cases produced 8 passed / 10 failed. Firefox shuffle/SPJ, WebKit BGM/lobby/Passer, and mobile-Safari BGM/lobby/Passer/VIC/SPJ reproduce failures on the unchanged base. The first attempted base command had a Playwright configuration/zero-tests error; only `playwright-baseline-representatives-r2.log` is the valid 18-case comparison.
- Mitsu is not included in those 18 cases and must not be described as a confirmed baseline failure. Its WebKit `:302` representative timed out during navigation in both frozen-snapshot runs, then passed on base (15.9s) and on the actual delivery worktree `cc32a64e` / port 4002 (9.1s). Logs: `../cs-regression/tmp/cs-regression-20261003/playwright-baseline-mitsu-302.log` and `tmp/cs-mitsu-final.log`. The final environment did not reproduce this representative timeout; its root cause and the unrerun page-load cases remain undetermined.
- No full base suite was run. Static incompatibilities were not repeatedly executed; a representative result is not counted as a pass for unrerun cases. The original full suite remains red, with no product/test assertions changed to hide failures.
- Independent source/diff review found no credible new CS causal path for the non-CS failures. This supports delivery of the bounded single-player change; it does not certify the entire website as regression-free or merge-ready.

### Delivery status

The requested single-player feature is implemented and its required direct acceptance checks pass. The site-wide green gate remains unmet for the failures documented above. Preview and combat screenshot both returned HTTP 200 on final check; the user-facing server stays on port 4002. No push, public deployment, or claim of user art approval is included.

## V3 visual revision — user rejected the V2 modeling

The subsequent user request explicitly selected CS2/CS:GO realistic architecture, materials and weapons. V2 art acceptance is superseded by that feedback; its sources and rejection evidence remain available. This revision preserves single-player 3v3, buying, four weapon classes, round rules and plant/defuse mechanics.

Acceptance scope:

- Replace the sparse port with an enclosed sand-colored old quarter using reviewed offline CC0 PBR textures, distinct orange A / blue B landmarks and architecture at human scale.
- Preserve map footprints, spawns and site coordinates; synchronize taller building collision with the model and prove both spawns can reach both sites.
- Replace primitive guns with licensed textured models, frame each weapon in actual first-person rendering, retain independently hidden view hands for world models, and review human proportions separately.
- Verify high/low quality, resource disposal, real browser gameplay, model bounds and published SHA hashes. Local runtime publication is authorized; external deployment and user approval are distinct and remain false/pending.

Evidence recorded during implementation (not final bundle acceptance):

- TDD: `tmp/cs-v3-red.log` first failed the new tall-wall ray and uniform-color regression; `tmp/cs-v3-green.log` then passed all 33 CS tests.
- Full Vitest first run: 1234 passed / one unchanged Tetris import smoke timed out at 5s while Blender was rendering. With the existing timeout unchanged and workers bounded to 2, `tmp/cs-v3-vitest-stable.log` passed **1235 / 110 files** in 37.85s.
- Renderer TDD: low mode initially still made two render passes. `games-cs-renderer.spec.ts` now passes after low mode bypasses the composer and shrinks its unused targets to 1x1, including resize and high/low round trips. RED/GREEN logs: `tmp/cs-v3-renderer-{red,green}.log`.
- Environment final candidate: **110076 triangles, 30 geometry draws, 9149120 bytes** after removing unseen facade detail, 16-bit position quantization and WebP90 encoding. Exact nine collision shells, embedded PBR maps and source hashes pass `qa_cs_environment_v3.py`. Independent runtime visual review passed, with minor thin-shadow aliasing and clean crate-label polish noted.
- Reviewed CC0 M4A1 model: original author mesh/UV/PBR retained; 10540 triangles, 1899920-byte runtime GLB. Independent hip/ADS review passed at scale .62, hip (.22,-.23,-.52), ADS (0,-.108,-.42), view FOV58.
- Build completed successfully at 17:46; later rendering/asset refinements still require final targeted checks and build. Full-site Playwright is running in `tmp/cs-v3-e2e-full.log`; no green claim is made from the previous V2 run.
- Remaining at this checkpoint: other three gun/C4 conversion, soldier revision and independent visual gate, complete registry/card handoff, final actual gameplay screenshots and final regression accounting.

### V3 verification accounting

- Current full Vitest after the scope fix: **110 files / 1237 passed**, 38.63s, unchanged default timeout with `--maxWorkers=2` (`tmp/cs-v3-vitest-final.log`). Scope TDD first failed 2 new cases, then all 35 CS unit cases passed; death/non-live/non-sniper boundaries are included (`tmp/cs-v3-scope-{red,green}.log`). Targeted TypeScript exited 0.
- Default full-site Playwright completed: **2155 total / 1874 passed / 163 failed / 112 skipped / 6 did not run**, 58.8m (`tmp/cs-v3-e2e-full.log`). This run remains red. Independent parsing classified first errors as 75 timeouts, 81 assertion mismatches, 5 invisible-element click failures and 2 unsupported mobile-WebKit wheel calls. No identical-condition pre-change run was made; non-CS failures are not labeled proven baseline failures.
- The four default-run CS failures happened at screenshots or clicks, before combat assertions. A separate default-Chromium gameplay probe also exceeded its 4s reload assertion; its subsequent snapshot showed reloaded ammo. A diagnostic identified default headless ANGLE **SwiftShader CPU** (1280x720, six actors: high mean1151ms / low736ms, ten measured frames), versus the same scene on **Intel D3D11** (high17.53ms / low16.33ms). These diagnostic conditions and sample counts must remain attached to the numbers.
- `playwright.cs.config.ts` selects hardware D3D11 for Windows desktop Chromium; it changes no product assertions or existing device/fallback coverage. Its checkpoint run passed **15 / skipped20** in 1.1m (`tmp/cs-v3-e2e-hardware-check.log`). Final asset/scope verification is recorded separately below; this does not erase the default full-suite failures.
- All four weapons were exercised through real page controls: buy/deploy/fire/reload/aim/pause, with no page errors (`qa/ui-flow-report.json`). The sniper was bought after an actual first-round payout, without injecting money or match state. The first capture helper's synthetic zero-duration R key press missed a frame; the repeat used a realistic 100ms key hold without changing product input code.
- Independent visual review rejected the initial opaque sniper optic even after vertical correction. The final approach hides that viewmodel in live scoped view and draws a transparent-center scope aligned to the shooting center, retaining the 25-degree world FOV. It is not a claim that the physical model lens is transparent.

- Pre-final-panel six-actor candidate performance measurement: Windows headless Chromium using **Intel Graphics D3D11**, **1280x720**, 30 warm-up + 120 measured frames per mode. High mean **22.94ms** / p95 **28.40ms**; low mean **16.66ms** / p95 **17.80ms**. `qa/frame-budget.json` records every model SHA, and bundle QA must confirm those hashes match published files. These measurements describe this machine and view, not all devices or a universal 60 FPS guarantee.

- Final published bundle: **16232960 bytes** across seven GLBs and the card, below the 28 MB contract. Embedded textures, metadata byte counts, runtime SHA, visual-evidence paths and performance-sample model hashes all match (`qa/bundle-integrity.json`). Soldier is 1.798m / 4120 triangles, with a visible rust/teal front identification panel. All individual visual gates passed; user assembly review remains pending and no external deployment is authorized.
- Final published-model performance sample supersedes the earlier candidate sample: same Intel D3D11 / 1280x720 / six actors / 120 measured frames after 30 warm-up; high mean **27.36ms** (about37 FPS), p95 **43.40ms**; low mean **16.67ms** (about60 FPS), p95 **18.30ms**. This is a local sample, not a cross-device performance certification; SwiftShader is still too slow.

### V3 final local delivery

- Final published-asset CS Playwright: **15 passed / 20 deliberate skips**, 1.1m, exit0 (`tmp/cs-v3-e2e-final.log`). Scope and all replacement models are included. Production build: exit0, **39.38s**, completed **19:16:17** (`tmp/cs-v3-build-final.log`).
- Independent product code review: **APPROVE**, unchanged reviewed source hashes, no P1/P2. Independent art review: **PASS**, including 3m/10m team identification after adding the front carrier panel. Raw sources and rejected side-patch evidence remain traceable. `qa/verification.json` permanently records commands, outcomes, limitations and source hashes.
- Local bundle gate is open after all individual gates and runtime integrity pass. User assembly review remains pending; no push or external deployment occurred. The default full-site suite remains red as documented above; this delivery does not assert the entire website is regression-free.
- Preview: http://localhost:4002/games/cs ; reviewed in-engine card: http://localhost:4002/assets/games/cs/card-cs.webp . Both returned HTTP200. Port4321 belongs to another worktree and was not disturbed. Existing tracked `node_modules` deletion is an environment difference and is excluded from this commit.
