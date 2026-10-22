# Breach Point continuation — utility presentation

**Goal:** Continue Claude session `93c1e7af-fb2d-4283-b8f6-b5f211ac5f3b` toward the existing complete, polished single-player game. This increment completes the interrupted utility-effects implementation; it does not certify commercial readiness.

**Spec:** `docs/superpowers/specs/2026-10-03-browser-cs-design.md` and the inherited V38 tests. Preserve original art direction, weapon/actor sources, gameplay rules, input and map contracts.

**Architecture:** Keep fixed GPU pools. Reuse the existing Kenney source masks, world sun and high-quality AO depth. Low quality uses ordinary depth testing without another geometry pass. All presentation follows simulation time; round changes clear transient state. The main agent writes; explorers and the final consultant are read-only.

**Acceptance:** Smoke has stable world-space lighting and soft intersections on high quality; HE has a brief light, textured fire/debris/ring and bounded fading grounded scorch decals. No airburst ground decal, event replay, GPU feedback loop or new first-use shader variants. New resources are prewarmed and disposed. Real browser high/low captures and throwing flow must work without WebGL errors.

- [x] Locate original worktree, instructions, spec and interrupted work. Baseline: utility-effects 8 failures / 14 tests; utility-visuals 12 pass; ai-stuck 3 pass.
- [x] Complete inherited effects tests and add lifecycle/resource boundary tests before implementation.
- [x] Implement effects and renderer wiring; validate the retained mask source/hash/QA and register the asset contract.
- [x] Run focused/full Vitest, build and Chromium utility/gameplay checks; capture high/low real renderer results and inspect them.
- [x] Independent read-only review; fixed the reversed blast-ring face, first-live shader compilation, and opaque grenade exclusion from AO. GPU Red/Green evidence is archived; latest 5 targeted browser tests pass.

**Still open for the full goal:** the fullsite browser gate and coverage closeout, human actor/art source and assembly approval, and the final commercial readiness decision. The previous 2585-case matrix terminated at its three-failure cap: 805 passed, 82 intentional skips, 3 failures and 1695 not executed. It is not accepted. Failures are Chromium module loading (`ERR_NETWORK_CHANGED`), Firefox keyboard alignment overshoot, and delayed Firefox entrance-overlay completion. Bounded diagnostics retain those original failures. A test-only positioning regression now passes both desktop browsers; the fresh 2590-case matrix terminated with exit1 at its ten-failure cap:1475 passed,229 intentional skips,10 failures and876 not executed across14/20 shards. Its independent terminal integrity audit passed; acceptance remains false. Same-source NetLog and stopped-animation diagnostics completed without reproducing their failures. Mobile renderer diagnostics reproduced the timeout and located long PNG readback/result-transfer intervals. Six test files now contain verified mobile corrections. The owned test service was restarted under the shared resource lock; the subsequent armory regression produced a valid Red. After a timestamp gate and batched independent UI assertions, mobile armory/responsive checks passed8/8. Renderer readbacks are four independent visual cases; the numeric contract is six scenarios retaining171renders (4x32+15+28), and the final mobile renderer run passed10/10 with retries0. Earlier timeout runs are retained. Focused cross-browser verification passed63 with9 pre-existing intentional skips; mobile focused tests passed18 with0 skips. The fresh2635-case matrix was interrupted when another Claude session stopped all codex-* systemd units: Chromium completed523 passes/4 skips and Firefox1-3 completed318 passes/78 skips. Firefox4 had57 raw passes,10 connection-refused failures and64 not-executed cases; that whole shard is excluded. A reviewed same-version resume adopts only the first7 complete source-verified shards and executes13 fresh shards, starting at Firefox4. Its16 helper tests pass; full2635-key reconciliation is still pending. The new receipt is qa/fullsite-sharded-matrix-resume-oct14-verification.json; the original failed receipt remains immutable. Current details are in `qa/post-diagnostic-test-corrections-oct14-progress.json`. The corrected HE tread/lifetime/airburst evidence now has 14 reviewed high/low static captures and a browser-verified gallery, with its limited scene/camera scope recorded in `qa/he-surface-visual-evidence-oct14.json`. The latest 300-second high/attack and low/defend production samples passed the recorded local engineering performance targets; this does not establish an all-hardware SLA. Complete attack/defend matches and natural spectator coverage have UI evidence below. Requirement mapping in `qa/requirements-closeout-oct14.json` now records the failed current matrix and actual per-browser coverage; confirmed test fixes and remaining diagnostics precede fresh revalidation. The inherited knife candidate is an optional agent proposal, not a confirmed user requirement. Bot navigation has a focused independent audit plus a HEAD-baseline Red/current Green terrace-flank regression. No public deployment is authorized here.

## 2026-10-11 驗證紀錄

- 全套 Vitest：167 個檔案、1,651 項通過（2 workers）。預設大量平行版本有 1 項非 CS 的 Pixi import 失敗，原始報告保留；未修改 Tetris。生產 build exit 0（現有依賴，未宣稱 clean install）。
- Chromium：72 個不同案例分批通過。完整跑次 71 過、1 個舊手部測試失敗；依現行材質、蒙皮換彈與第三人稱骨架契約修正測試後通過，另外 4 項相關換彈／材質案例通過。未修改手部 runtime 或模型。
- 真頁攻方 high／low 各 120 秒、Intel D3D11：RAF p95 16.8／12.5ms，最長 279.2／207.8ms；皆到第 4 回合，未量到存活隊友觀戰。沒有 WebGL、頁面、HMR 或背景分頁錯誤；長幀尚待追查。
- 證據：`art-factory/cs/runs/run-20261011-continuation/qa/verification.json`。候選 mask 來源仍待使用者回覆，只供本機預覽；未對外發佈。
- 下一個有限里程碑：以 browser／compositor／GPU trace 區分長幀根因，再驗守方與完整比賽／觀戰；保留來源審核與整體美術驗收門檻。
- Firefox／WebKit／行動 Chrome／行動 Safari 的模型載入失敗與小觸控提示：8 項通過。這不等同完整跨瀏覽器遊玩通過。預覽 `http://127.0.0.1:4002/games/cs` 最後 HTTP 200。

## 完整比賽與長幀追查

- 攻方 high 300 秒：六回合 2：4 結束、重開、返回選單再進場，分數 0：0、ROUND 01；截圖確認換為守方。p95 23ms、最長 322.3ms、155 幀超過 50ms。此跑次未涵蓋存活隊友觀戰。
- 守方 low 300 秒：六回合 4：2 結束，涵蓋自然死亡／觀戰、炸彈引爆、重開後回合與分數歸零、返回選單換攻方再進場。p95 11.9ms、最長 203.2ms、137 幀超過 50ms。攻守兩次無頁面／WebGL／console／HMR 錯誤；功能成立，效能仍未通過。
- 證據為 `qa/full-match-native-attack/report.json`、`qa/full-match-native-defend/report.json`（相對於同一 continuation run）。這些都是原生 headless Chromium、Intel D3D11，未替換資產或注入遊戲狀態。
- 低負擔 RAF／CPU／Worker 診斷將停頓範圍縮小至 callback 外等待；系統計數顯示主要長幀群與 Windows Terminal 在同一 Intel GPU engine 上的使用量升高共時。1Hz 平均只能證明相關，不能推斷因果。守方另一次平順 high 樣本也證明 GPU 近滿載本身不必然造成群聚長幀。
- WPR GPU 排程追蹤被系統拒絕（`0xc5585011`），未變更政策，確認沒有留下 recording。已請使用者在方便時最小化 Windows Terminal 以做可控對照；尚未收到回覆，不假定已操作。詳見 `qa/gpu-diagnosis.md`。
- 獨立檢核修正診斷工具結束時遺漏 pending LoAF 的邊界：舊行為回歸測試失敗，修正後 frame recorder／clock 6 項通過。遊戲 runtime 未因這次診斷變更，全套 1,651 項與 build 的既有結果仍對應同一 runtime hash。
- Firefox 146.0.1 的真實載入、守方購買／deploy、滑鼠鎖定、移動、射擊／換彈、暫停凍結／恢復、返回選單重新開始皆通過，WebGL／頁面／console error 為 0（`qa/desktop-browsers-v2/report.json`）。初版 QA 腳本誤把守方平移當成世界 X 正方向；修正為實際位移量，沒有修改遊戲。
- Windows headless WebKit 26.0 能繪製場景，但 requestPointerLock 拒絕 `WrongDocumentError: Pointer lock requires the window to have focus.`。`document.hasFocus()` 為 true，原生 Target.activate 和 UI 重試仍失敗。最小空白 HTML／真按鈕／同源對照排除了遊戲與 Three.js：Chromium、Firefox 成功，WebKit 同錯（`qa/desktop-browsers-v2/minimal-pointer-lock.json`）。保留 WebKit 實玩驗證缺口，未用 shim 假裝支援，未自動開啟可見視窗。
- 正式 E2E 現已讓 Firefox 跑入口、戰鬥操作、守方計分板／返回選單三條流程；Firefox 3 項通過，Chromium 依現有 `playwright.cs.config.ts` D3D11 設定重跑 3 項通過。第一次誤用通用 config，5 過、1 個 Chromium 換彈 4 秒斷言逾時；失敗保留，未放寬斷言或改 runtime。獨立審查 PASS。新增診斷／測試 10 檔的基本憑證特徵掃描 0 命中，preview HTTP 200。

## 資產清冊與乾淨重建

- 補登繼承自 V37 的手榴彈、三張 HUD 圖示與牆面 detail map；更新環境／角色的過期 bytes、SHA256，以及四把武器的 V36 外部共享貼圖依賴。整合於 soldier 的眼鏡／塗層紀錄明確指向父資產，避免重複計算。
- 30 個實體檔案、26 個 runtime 語意紀錄，33,215,561 bytes（34,000,000 上限）。補齊既有 FX／天空合約連結、所有 runtime ID 的 review queue，以及步槍、炸彈／手榴彈、布料／牆面／候選 particle masks 的來源說明。所有既有核准旗標保持不變，歷史拒絕紀錄保留。
- `asset-registry.test.ts` 起初 4 項 Red（過期雜湊、漏檔、缺共享貼圖與 queue）；補登後 4 項 Green。獨立 review 找到可同步刪檔／刪紀錄及誤翻 approval 的測試漏洞；新增兩項保護後 6 項通過。隔離副本三種故意突變：刪檔和登錄、核准 pending 來源、允許外部部署，舊測試皆放過，新測試皆因正確斷言失敗。證據 `qa/registry-final.json`、`qa/registry-guard-mutations.json`。
- 在 `%TEMP%/cs-release-check-20261011-173103` 複製目前來源，排除 `node_modules` 及 `.env`，依 Windows 既定方式 `npm ci --ignore-scripts --no-audit --no-fund` 成功。清除外部 KV 四個憑證環境鍵，使用獨立 localhost:4004；不啟用 Hardhat、不碰外部資料服務、不干擾 4002 preview。
- 最終六項 guard 納入後，乾淨副本全套 Vitest 168 檔／1,657 項通過（2 workers，74.58 秒）；最新 build exit 0（22.06 秒）。`.vercel/output/static` 的 30 個 CS 資產與輸入逐檔 SHA256 一致。完整五瀏覽器 E2E 仍在跑，設定 1 worker、0 retry、累計 10 個失敗即停止並保留未執行範圍；不是宣稱全套通過。
- 初次全站 E2E 暴露兩個既有 family-missions 測試期待過期（入口早於 CS 工作在 `2216b327` 移除；heading 換行導致可存取名稱含空白）。另有三個未納入 Git 的開發候選輸入漏入快照，導致 CS opt-in 候選測試無法載入；後續查明只有 GLB 被本機 ignore 隱藏，另外兩檔是一般 untracked。停止該次無效跑次後依 `skin-candidate.ts` pinned SHA 補入三檔，再重跑；原始 log 與 artifacts 保留，詳 `qa/release-fixture-intake.json`。這揭露 clean checkout E2E 的 fixture setup 缺口，正式 runtime 素材不變。
- 補齊 fixture 後，同一乾淨副本完整 CS Chromium 區段 72 項全數通過，沒有候選載入失敗；證據 `qa/clean-release-cs-chromium.json`。五瀏覽器全站跑次仍未結束，不能把這個區段當成全站結果。產物 58 個 JavaScript 檔未找到四個開發候選來源識別字，詳 `qa/clean-release-development-exclusion.json`。
- 原始對話授權抽驗未找到 Kenney 來源選用批准；來源包 CC0 記錄與 project approval 分開，仍保持 candidate／local preview。詳 `qa/source-approval-audit.md`。商用品質、長幀根因與最終美術審核仍未完成。

## 下一個角色品質缺口：樓梯接觸

- `qa/probe-stair-feet.mts` 使用正式 soldier 的幾何／蒙皮與現行引擎，沿 x=19 南北各走 270 幀；逐一計算 1,704 個鞋子頂點對實際階面的高度。只在記憶體省略無關貼圖載入，不改模型或動作資料。
- 北向最深穿階 -0.16614m（frame 72，角色支撐面 2.2m、鞋尖 y=2.23386m、下一階 2.4m）；南向 -0.14537m（frame 8）。各有 14／11 幀低於階面 5mm；平地樣本另有 -24.5mm 的既有誤差，不把 0.5mm 擅定為現行驗收門檻。完整資料 `qa/stair-feet-probe.json`。
- 初始診斷階段只確認數學穿階，當時未改 runtime；後續實作與證據見下方。方案保留 actor root／hitbox、上身與武器、正式來源與既有步態，不復活被拒絕的 V7 gait 候選。
- 獨立 consultant 已確認局部腿部 overlay 方向可行；有限方案與驗收寫入 `docs/superpowers/plans/2026-10-11-cs-stair-contact.md`。正式 GameRenderer 近景可沿用 `art-factory/cs/source/capture_cs_actor_motion_v33.mjs` 的 native 模式；必須累積實際移動歷程以重現 gait phase，不能只瞬移座標。GPU before/after 驗證要等目前全站 E2E 結束，避免量測互相干擾。

## 樓梯接觸實作里程碑

- 先取得雙向 145～166mm 穿階的有效 Red；第一版五點 probe 仍漏掉跨階的斜鞋底，最差 43～51mm，保留失敗證據後換成正式鞋底真實三角面裁切。初始化去重為每側 173 頂點／291 面，平地不蒙皮取樣；維持腳掌方向，以兩節骨骼 IK 修正腿部，預檢失敗或 solve 失敗時完整還原。
- 新版全套 Vitest 170 檔／1,675 項通過。測試包含逐腿斜向站行／蹲行、上下階、平地 no-op、騰空／死亡／非 live、不可達／失敗還原、暫停／瞬移與上身／武器不變。完整鞋子 1,704 頂點重測，北向最深 -24.52mm（既有平地），南向 -6.87mm（同高度支撐面），沒有原先額外 145～166mm 的穿階。
- 正式 renderer before／after 各 24 張、411 幀，v2 近景與慢放影片位於 `qa/stair-visual-before-v2/`、`qa/stair-visual-after-v2/`；page/WebGL error 0，切換鏡頭的骨骼差異 0。v1 部分斜角鏡頭落入樓梯，不作驗收。初次 baseline 拍攝失敗是 4004 僅 bind localhost IPv6，改用其實際 localhost URL 後成功，未變更伺服器存取控制。
- 五角色正式 renderer 高畫質 ABBA：before 平均 3.730／3.993ms，after 4.159／4.054ms，平均差約 +0.245ms；p95 before 4.7／5.8ms，after 5.2／5.4ms。四輪 geometry 102、texture 97、program 60 不變，page/WebGL error 0。第一個 after 仍有 10 個 RAF >50ms（最差 254.6ms），第二個 after 沒有；長幀問題仍未批准，不推斷這次改動的因果。
- 最終串行驗證：全套 Vitest 170 檔／1,675 項通過（83.15 秒），build exit 0（53.35 秒），整份 gameplay spec 的 Chromium／Firefox 共 15 過、5 個既有 skip（104.4 秒）。詳 `qa/stair-final-verification.json`。
- 初次新版完整 CS Chromium 為 71 過／1 失敗：舊 crouch E2E 在加速至 4.02m/s 時提前取得站立基準，因而用 `<1.608` 錯拒正確蹲速 1.80m/s。P9 原全速 5.3、蹲速比例 .34 均未改；測試改等到 5.3 穩定後取樣，保留原 timeout／比例／放開恢復斷言。修正後整檔重驗通過；合併同一 runtime 兩跑次覆蓋 72 條 Chromium、5 條 Firefox 通過，另 5 條 Firefox 原有 skip，沒有把 skip 當通過。原失敗 JSON／截圖／影片保留，`qa/stair-cs-coverage.json` 明列合併方法。
- 獨立複審已消除逐腿 contact count 可被另一腿掩蓋的 P2；程式 delta PASS、48 張指定 before／after 靜態畫面未見新缺陷。逐腿最大步幅與 ±2 幀來源包絡診斷沒有新增超額位移，仍不能代替完整連續動作美術批准。來源選用核准、Windows 長幀、WebKit 真實操作與最終全站驗證仍有缺口，本段不是商用完成宣告。

## 舊 snapshot 全站跑次的界線

- 舊版全站跑次已完成 Chromium 497 筆（494 過、3 失敗）；Firefox 前 66 筆（63 過、1 失敗、2 skip）。三個 Chromium 失敗為兩個既有 family-missions 期待過期，以及 Tetris menu 案例在首次點擊 online 後的面板 visible 斷言失敗，尚未執行返回 PLAY；後者目前不能證明原因，也不能歸因於 CS 修改。Firefox 已輸出的 failure 為同一 family 導覽期待。
- 為驗證已改版 terrain runtime，確認本流程擁有的 PID／parent／命令後停止剩餘舊 snapshot E2E，保留 logs/artifacts。1,922 筆未有結果，不能稱全站通過。權威 stage 結果為 E2E exit 1；執行中的舊 Python wrapper 尚未載入 exit propagation 修正，因此工具 exit 0 不代表通過。詳 `qa/clean-release-interruption.json`。
- 4004 原始 snapshot 伺服器在 before 對照與 profiling 完成後已停止；4002 保持新版遊戲 preview，QA 圖片／影片仍由 4002 存取並確認 HTTP 200。舊 1,657 項 unit、clean build 與 72 CS Chromium 結果留作 pre-terrain 證據，與新版驗證分開。

## 開發素材可攜性與新快照驗證

- 精確納入三個既有候選 fixture（20,559,752 bytes），新增四依賴的 path／bytes／SHA／來源契約清單。Git checkout 的測試同時檢查 index 真正含有相同 blob，防止「本機有、下次 checkout 沒有」假綠；source archive 仍無條件核對檔案內容與契約。loader、正式素材、ignore 規則及批准旗標均未改。
- Red 為六項中一項因 fixture 不在 index 而失敗；補入後六項通過。缺 index、錯 index blob、錯契約身分三項 mutation 均正確失敗，獨立複審 PASS。三素材＋清單＋測試共五檔已精確暫存，尚未 commit／push。
- 新快照由 Git 已納入檔案及明列 pending 程式輸出，不再手動補 fixture；乾淨安裝、全套 Vitest 171 檔／1,681 項及 build 通過。九項候選／真實蒙皮驗證全過。正式 Vercel 產物的 30 個 runtime 檔案位元組一致；564 個 JS/MJS 與全部 3,191 檔未發現候選程式標記／素材 hash。
- 完整 CS Chromium 仍是 71 過／1 逾時，發生於 smoke 案例的開始按鈕尚未啟用。原始 trace 的 122 請求均 200、無 loading error；當時只檢查狀態碼，尚未檢查 body 是否完整，不能据此歸因解碼／GPU 預熱。新增 snapshot-only 分階段觀測，兩次載入 3.87／3.58 秒均完成；原始 grenade 整檔重驗兩項通過。可列 72 個不同案例分批通過，不能宣稱首次全綠或啟動問題已修復。後續 body 稽核與修補見 `2026-10-11-cs-loading-recovery.md`。
- 修正 family-missions 的既有過期期待，保留直接路由、完成狀態、星數與 profile 隔離驗證；五瀏覽器共 15 項通過，無 runtime 修改。Tetris 新 trace 確認 Chromium 有 29 個 `ERR_NETWORK_CHANGED` 模組載入失敗，根本 OS／server 觸發未知；兩個 mobile 期待也與現行 touch policy 不符，尚未改動。整個全站驗收仍未完成。
- 詳見 `2026-10-11-cs-fixture-portability.md`、`qa/fixture-clean-verification.json`、`qa/fixture-final-coverage.json` 與 `qa/startup-baseline-diagnosis.json`。下一個有限工作優先定位間歇性 CS 啟動停滯；長幀、素材來源／美術核准、WebKit 真實操作及最終全站驗收仍未關閉。

## 載入復原與既有觸控基線

- 30 秒整批無活動 watchdog 與 outer GLB／HDR 原生 downloader 已驗證。原生 HTTP body 在第一段 65,536 bytes 後停住，五瀏覽器全部能結束 client read、顯示 retry、重載並进入 shop；不代表原始網路觸發原因或完整跨瀏覽器遊玩已解決。WebKit 的短命 composite signal 小型重現、舊 loader 有效 Red、nested loader 限制見 `2026-10-11-cs-loading-recovery.md`。
- 最新全套 unit 172 檔／1,694 項通過、clean-dependency build exit 0、正式產物候選隔離通過。完整 CS Chromium 72 過／1 啟動逾時；新增進度與 heartbeat 觀測後，grenade 整檔 2 過、前置取消加 grenade 序列 4 過。保留原失敗；尚無一次全綠的最新完整 CS 跑次。
- Tetris 測試依現有 `pointer:coarse` 入口契約修正，沒有更動遊戲 runtime。桌面操作保留 desktop 驗收，新增四個 touch／deep-link 案例；資訊頁籤、ARIA 與返回仍跨平台驗證。五 project 共 43 過、22 個明列平台 skip、0 failed、0 flaky；獨立檢核 PASS。`qa/tetris-baseline-verification.json` 記錄來源與執行結果。
- 當前主收據為 `qa/verification.json`；舊版全站結果與完整 CS 失敗均保留，不以個別重驗通過替換。下一步是同一來源快照的全站五 project 驗證，並由觀測資料定位再次出現的啟動停滯。
- 新版全站已實際跑到三個失敗而停止：92 過、3 failed、2,415 未執行；不能把 reporter 的 skipped 總數當成意圖略過。smoke 的新增觀測證實本次為約 295 KB/s 的持續慢傳，最大無活動只有 2.186 秒，watchdog 依契約正確不觸發；另兩案分別為主站載入逾時與明確 `ERR_NETWORK_CHANGED`。現在診斷轉為同時間、同一伺服器的 browser／獨立 raw HTTP 比較及 server event-loop 量測，不放寬原測試期限。詳 loading-recovery 計畫與 `qa/fullsite-current-failures.json`。
- 有限 paired 診斷 15 過／1 啟動失敗，真正失敗案當時沒有 bytes observer，沒有取得同步傳輸對照；主機 CPU 全程高度飽和，不能判作根因。後續九案 prefix 已補齊觀測，但 240 秒 plugin setup timeout 使九案全未執行。資源調整腳本遭 Windows 原則拒絕，沒有更動三個模擬器；本次診斷自身程序已清理、原測試精確還原，詳 `qa/loading-prefix-setup-failure.json`。765 個來源／測試／素材／設定 hash 與全站跑次一致，本輪沒有改動遊戲 runtime。下一步需新的環境／啟動證據，而不是重複滿載全套驗證。
- 診斷工具曾覆寫既有未追蹤 `NUL`，未找到可證實的原檔副本；事故與查核範圍已記入 `qa/nul-overwrite-incident.json`，已向使用者揭露，沒有猜測性恢復。

## 2026-10-12 恢復測試契約與新驗證

- 新環境的原有完整 CS Chromium：18 通過、1 失敗、54 未執行。失敗是 retry 超過原測試的 30 秒總等待；正常 environment body 在截止時未完成，收尾快照約 2.6 秒後已 ready，並非再次命中注入的 stall server。原失敗已完整封存。
- 修正 recovery 測試的等待契約，retry 改為 60 秒、整案 180 秒，並新增完整 GLB bytes、reader done、無讀取／載入錯誤與進 shop 的驗證。初次 30 秒無活動取消契約、production runtime 與來源批准均未修改。新增各下載階段時間及失敗時 telemetry，獨立審查 PASS。
- 修正版五 project 為 5 通過、0 skip、0 flaky，見 `qa/loading-retry-oct12-verification.json`。這是載入恢復功能通過，仍不宣稱載入速度或完整遊玩已達商用要求。接續全站五 project 與效能驗收；詳 loading-recovery 計畫。
- 新全站結果為 103 通過、3 失敗、2,404 未執行。三案分別卡在 Bomber 網路模組載入、CS 的 `ERR_NETWORK_CHANGED`、CS environment body 未完成；後兩案均在開始遊戲前，renderer 案尚未進 candidate 路徑。來源前後 2,280 檔一致，原附件封存於 `qa/fullsite-oct12-failures/`，沒有放寬原斷言或套用其他跑次的通過結果。
- 正式 static 預覽已恢復至 `http://127.0.0.1:4002/games/cs/`；它僅提供 build 內靜態頁面，不能驗證全站 API。接續以新 production QA 腳本量測真實載入與完整攻守，保持單一瀏覽器工作負載；runtime、素材與批准狀態未因診斷改動。

## 2026-10-12 正式打包版本完整攻守實跑

- 兩輪各 300 秒、串行、headless Chromium／Intel D3D11；同一 runtime source、model 與 2,636 檔 static manifest（329,960,619 bytes），每輪後置 hash 驗證通過。預覽 HTML 的 HTTP body 與 build 相符；實際 browser 資源路徑均在 manifest，沒有 dev `/src/` 模組。未逐份 hash browser response body，也未覆蓋外部 CDN 內容身分。
- 高畫質攻方：可開始 5.033 秒，16,915,872-byte environment 下載 399.3ms。18,074 個 RAF 間隔，p95 20.9ms、最差 100ms、>50ms 共 9；全程實際 drawing buffer 1440×900。比賽 1:4 完成、重開歸零、返回選單再換守方成功。自然死亡有觀測，live spectator 時間為零。
- 低畫質守方：可開始 3.499 秒，environment 下載 359.4ms。34,855 個 RAF 間隔，p95 12.5ms、最差 66.6ms、>50ms 共 1；1440×900 viewport 下 drawing buffer 為 1214×758。取得 26.493 秒自然死亡後 live spectator；比賽 4:0（攻方:守方）完成、重開歸零、返回選單再換攻方成功。
- 兩輪 page／sample console／WebGL error 都為零，功能 gates 均通過；主代理檢視初始、重進及收尾截圖，獨立代理從 raw rows 重算統計吻合。收據與 6 張截圖位於 `art-factory/cs/runs/run-20261012-production-static/qa/`，摘要為 `summary.json`。
- QA 收尾審查找到 cleanup／最終品質斷言失敗時收據停留 running 的缺口；4 條實際控制流測試先為 2 過／2 失敗，修正後 4 過，獨立複審 PASS。攻方保留修正前成功執行的腳本，守方保留修正後腳本，各有獨立 hash；主代理 diff 確認只改 terminal error handling，採樣與 gameplay 迴圈相同。Preflight 重複輸出會 EEXIST 拒絕，原證據 hash 不變。
- 本輪 runtime 沒有新增修改，既有 172 檔／1,694 項 unit 與 build 仍對應同一來源；只新增 QA 工具、報告與文件。完整整站失敗仍保留，這兩個 production 樣本不能消除 dev-server／系統網路的歷史失敗，也不能作不同時段的因果效能比較。
- 平台驗收沿用 `docs/games/breach-point.md:9`：桌面 Chromium 完整玩法，其他平台驗證載入失敗與鍵鼠提示；Firefox 額外實玩結果與 WebKit pointer-lock 限制各自保留。原 spec 未訂固定 p95 或最大幀門檻，本輪只建立可核對的效能證據，最終畫面／動態與來源批准、整站回歸及商用品質審核仍未完成。

## Linux 重播與並行取樣修正（2026-10-12）

- 新 Linux 快照以 lockfile 安裝，未複製環境檔；執行前後核對 2,280 個輸入。單 worker、零 retry、原期限重播三個 Windows 失敗案例，三項皆執行但仍失敗。精確 file/title/project 與十份附件已封存於 `qa/wsl-failures-oct12-audit.json`，沒有把新環境重播當成 Windows 原因已排除。
- Bomber 已能連線對戰；原測試依序取樣 host 第 198 幀、guest 第 208 幀，兩次 evaluate 開始時間相差 141.912ms。這只是 API 邊界，不能宣稱精確讀取時間或真實不同步。改為兩端 `Promise.all` 並保存狀態附件，保留 `>30`、`<=8` 和共同確認幀 hash 斷言。獨立審查 PASS；Linux 重驗 1 過／0 retry（37.634 秒），輸入後 181／181，共同第 222 幀 hash 同為 `aeb48b34`。僅修改 E2E，未修改 Bomber runtime。
- Linux CS feedback 的開始按鈕在 click 接近 30 秒期限時才啟用；trace 有兩個 Vite optimized dependency 504，環境 GLB body 完整。候選角色案例已通過正常／候選頁 ready 與標示，60 秒整體期限在開始操作附近耗盡；不能把後續空白 resident 屬性當成候選素材載入失敗。
- 換成 Linux Astro 伺服器＋Windows 原生 D3D11 Chromium，兩個原 CS 案例於原期限內通過（36.706 秒，0 retry），包含真實射擊／觀戰音源與五名候選角色操作。兩份 trace、聲音資料及兩張截圖保存在 `qa/cs-hybrid-oct12-archive/`。伺服器快取、瀏覽器和執行時段不同，這不構成 GPU 或網路根因證明，也不取代完整全站驗收。
- 當前爆炸效果另補高／低畫質各三張（0.03 秒、0.12 秒與近景），161 個程式／資產 hash 對應目前來源，page／console／WebGL error 0；位置為 `run-20261010-v38-utility-fx/qa/codex-current-oct12/`。來源及人工美術批准仍維持 pending。

## 低畫質爆炸塵環精修與新版驗證（2026-10-12）

- Current 近景重現灰色圓盤；僅 ground-ring shader 增加中央透明、柔邊徑向環，另分出暖土色 tint。火焰／碎屑路徑、粒子 pool、素材位元組與人工批准旗標均未改。
- 實際 GPU 回歸先驗到中心 3×3 像素在兩種 depth 模式皆為 37，修正後為 0，原本環的有效像素量與 soft-depth 可見度斷言仍保留。真正 Red 是 `qa/ring-annulus-red-v2.json`；首份 `ring-annulus-red.json` 因複製路徑錯誤執行舊測試，保留但不計 Red。修正後 utility renderer 整檔 2 過，煙霧／閃光實玩整檔另 2 過，0 retry。
- 新高／低畫質、近景及早期時間序列共 12 張，來源前後 hash 一致、error 0。主代理與獨立審查均確認原灰盤解除、塵環仍可見，中央不規則黑痕是既有 scorch。獨立檢核 PASS；未把稀疏早期幀當成完整 .55 秒壽命、所有坡面／牆邊的美術批准。檔名時間沿用既有 helper 近似值，以 `capture.json` 記錄的模擬時間為準。
- 最新全套 Vitest 172 檔／1,694 項通過（101.012 秒），build exit 0（runner 63.586 秒；Astro 顯示 server build 33.07 秒）。收據 `qa/ring-annulus-verification.json` 核對 root／Windows snapshot 共 2,280 個輸入。前一版 production build 保留於 snapshot 的 `production-static-before-annulus-oct12/`；先前兩個 300 秒效能樣本屬於該舊版，沒有宣稱新版重測同等數字。
- 新 production 靜態頁以原生控制完成 high／low 各一次購買 HE、切換、低拋、消耗數量歸零及暫停，page／console error 0、沒有載入 `/src/` 模組，保存截圖與影片。首輪 QA 在 equip delay 尚未結束便投擲而失敗；v2 依既有 E2E 等待 450ms，未改 runtime。最新可用 preview 為 `http://127.0.0.1:4002/games/cs/`，收據 `qa/ring-annulus-static-v2/report.json`。
- 同版本的五瀏覽器完整 inventory 確認 2,510 案，已啟動單 worker／零 retry 的 Linux server＋Windows client 全站跑次。狀態以 `qa/fullsite-hybrid-oct12-verification.json` 為準；執行期間固定 runtime/tests。這是尚未完成的全站 gate，來源／人工美術批准與正式商用驗收仍未關閉。
- Runner 獨立檢核發現全 skip／單瀏覽器全 skip 可被誤判通過。針對實際判定式測試，Red 為 1 過／2 失敗，加入每個 project 必須有 passed 後 3 過。執行中的舊腳本已封存為 `qa/fullsite-hybrid-oct12-running-source.mjs`；不重跑瀏覽器，待結束後必執行 `node art-factory/cs/runs/run-20261011-continuation/qa/accept-fullsite-hybrid-oct12.mjs`，取得 `fullsite-hybrid-oct12-acceptance.json`。只有 runner receipt 與 acceptance 都通過才算整站 gate 通過；目前 acceptance 仍 pending。

## 人工審閱包與新版效能準備（2026-10-12）

- `qa/visual-review-oct12/index.html` 彙整目前來源的 13 張原始圖與 2 段 production 操作錄影，網址 `http://127.0.0.1:4007/`。固定 renderer 場景與實際遊玩分別標示，沒有以 `skinCandidate` 畫面要求批准正式角色；圖片未重製或修圖。161 個 CS 輸入 hash 符合當前收據，媒體／來源檔 hash 與 21 個本機連結皆核對通過。
- 獨立檢核確認媒體及來源批准邊界，並指出原 metadata 包含多餘歷史 provenance；已收斂為目前資產欄位，另明示完整來源 hash 僅用於版本身分。瀏覽器連線工具回報無可用 browser，故審閱頁本身尚未完成瀏覽器排版驗收。已提供具體審閱網址，詢問目前整體畫面及 Kenney 來源的人工接受；未收到決定前維持所有 pending，未對外部署。
- `docs/games/breach-point.md` 修正了把新 utility mask 誤稱為「既有已核准貼圖」的過時描述，改為目前的 CC0 來源、待選用批准及 local-preview 狀態；這是文件修正，沒有更改來源授權或 runtime。
- 新 `qa/profile-annulus-production.mjs` 複用已驗證的 production profiler，改用 annulus build 收據及獨立輸出，保留 300 秒完整比賽、重開與換隊；增加採樣期間的真實 HE 投擲與前後 network resource 記錄。仍不注入 renderer hooks，network resource 數不能當 GPU allocation 數。
- 主代理事前選定本機工程基準，記於 `qa/annulus-performance-targets.json`：high p95 ≤25ms、p99 ≤50ms；low p95 ≤20ms、p99 ≤33.4ms；兩者最差 ≤250ms、>50ms 比例 ≤0.1%。這些不是使用者批准的產品 SLA，也不是所有硬體的商用保證。判定器 Red 1 過／5 失敗、Green 6 過，拒絕空樣本、缺 HE、非有限數值與錯誤／背景幀。
- 新 profiler 目前只完成無瀏覽器 preflight：2,636 檔、329,960,901 bytes，build manifest `a5a4ef864cb85ce332d623fcf59f811d77c71cb34598c2155ccc61af970cfd75`，HTTP HTML 與 build 相符。尚未執行新版 300 秒採樣；程式會拒絕在全站 receipt 仍 running 時啟動瀏覽器。
- 獨立檢核指出 performance gate 失敗仍可將 terminal status 寫成 passed；新增直接執行實際 runner 收尾區塊的測試，Red 7 過／1 失敗，修正後 8 過。現在性能失敗會寫 `status=failed`、`failureKind=performance-targets` 並回傳非零 exit；functional status 分開保留。另修正 HE coverage 說明與 300 秒預設，獨立複審三項皆解除。準備收據為 `qa/annulus-performance-preparation.json`。
- HE 流程讓原本「彈藥數曾變動」不足以證明槍械射擊；新增同武器／回合／比賽、live/alive 且原生射擊操作期間彈藥下降的判定，排除換彈、手雷切換與死亡。Red 9 過／1 失敗、Green 10 過，獨立串接檢核 PASS。這只修改尚未執行的 QA profiler，未改動受測 runtime 或全站 E2E。

## 全站 Firefox 候選來源拒絕案例（分析中，尚未套用修正）

- 全站在第 609 案出現第一個失敗：`games-cs-renderer.spec.ts:311` 的候選來源完整性案例，斷言於 line 328 找不到預期的 console 字串。四份原始附件已封存於 `qa/fullsite-hybrid-oct12-failures/games-cs-renderer-developm-b0a5b-es-before-starting-the-game-firefox/`，全站仍繼續執行。
- Trace 確認角色 fetch 收到 23-byte `invalid candidate bytes`，緊接著 Firefox console 只記錄 `Breach Point loading failed: Error`；載入錯誤 UI 已顯示、開始按鈕 disabled。沒有 pageerror 或網路 failure，除無關圖示 404 外資源皆成功。主代理抽驗 raw trace 的 console 與 fulfilled body，與獨立分析一致。Error 物件內部 message 未存於原 trace，故不能只憑這份附件宣稱已證明 hash validator 分支，也不能把 rifle 分支算作已執行。
- `qa/candidate-console-firefox.patch` 只改測試的 Error 物件訊息擷取，保留兩種損壞來源、錯誤 UI、disabled、精確 hash mismatch 與 request-count 斷言，另附觀測結果。`git apply --check` 與獨立審查 PASS；狀態為 prepared-not-applied。起初 patch 的 Windows CRLF 使 check 失敗，已將 patch 輸出改為 LF；受測來源未動。必須等全站結束及 post-seal 完成後，才套用到 root／Windows／Linux snapshot，再於五個 projects 重播兩分支，不能把準備完成當測試通過。
- 獨立核對 `docs/claude/verify.md` 的收尾要求後，修正後必須另取得一個完整五 project 全綠跑次。原失敗報告與局部重跑不能合併宣稱 canonical 全站通過；原報告、terminal acceptance 及來源 hash 均保留。該案例無平台 skip，五個 project 都需實際驗證角色與 rifle 的拒絕分支。相關 CS E2E 未找到另一個同樣依賴 Firefox Error preview 字串的斷言。
- 下一階段順序：當前全站 terminal／post-seal → 目前 annulus build 的 high／low 各 300 秒效能採樣 → 套用 E2E-only patch 並同步兩份 snapshot → 候選拒絕案例五 project 專項重播 → 新一輪完整全站驗證。效能先於 test patch 執行，讓既有 2,280 個輸入的 preflight 身分檢查保持有效；後續僅變更 test 的版本另建來源收據，不改寫舊 unit／build 證據。

## 全站 terminal 與其餘 Firefox 失敗（2026-10-12）

- 本輪已結束：771 passed、3 failed、78 intentional skips、1,658 not executed，0 flaky；reporter 的 1,736 skipped 包含未執行項，不能全部算成條件略過。Chromium 有 498 個 pass，Firefox 有 273 個 pass，其餘三個 project 尚無 pass。2,280 個來源的後置驗證完成，嚴格 acceptance 明確為 failed；完整摘要、report hash 與三組附件見 `qa/fullsite-hybrid-oct12-final-audit.json`。
- 第二案是 `/guild/` 的起始矩陣判斷：實際 CSS `scale(.5) rotateY(-90deg)` 理論 m11 為零，Firefox 回傳 `-1.1102230246251565e-16`，原本 `>=0` 斷言誤判為鏡像。`qa/guild-matrix-firefox.patch` 將數值比較容差設為 `1e-12`，保留 non-null gate 並新增同瀏覽器的 180° 鏡像負控制，確保真鏡像仍被拒絕。獨立審查與 `git apply --check` PASS；尚未套用或進行瀏覽器重驗。
- 搜尋同根樣式時另發現 `[lang]/guild/index.astro` 仍使用 180° 起始角度。這是另一條既有頁面路徑，與此次 `/guild/` 的浮點邊界失敗分開記錄；本次尚未修改或宣稱驗證其畫面。
- 第三案 `guild-mitsu-jing.spec.ts:382` 尚未進入 Food 標籤斷言，停在 beforeEach 的 `page.goto` 等待 load、超過 30 秒。trace／影片／error-context 已封存，仍待網路與 lifecycle 診斷；未放寬期限或跳過測試。
- 已核對 Linux Astro PID 104906 的指令及 cwd，再送 SIGTERM；原 server handle 已退出。開始目前 annulus production 的 native/high/attack 300 秒採樣，snapshot 與 root 來源繼續維持不變，待 high／low 兩輪完成後才套用測試修正。

- 第三案獨立診斷及主代理抽驗：error-context 已有 Food 的 5 個標籤，但 loader 仍顯示；raw network 存下的 100 個已完成請求全部 200。頁面僅在 window.load 後隱藏 loader，goto 實際等待 30,609.536ms。未完成請求不在此 trace 內，故不能指定某個 font 為根因。下一步先原期限重播原案，再驗 Firefox 整檔；若重現才補有限的 request／lifecycle 診斷，暫不修改頁面或放寬期限。

## 目前 annulus 正式版本的完整效能樣本與測試修正

- high/attack、low/defend 各完成 300 秒，兩輪功能 gates 通過：真實 HE、槍械射擊、換彈、瞄準、比賽結束、重開歸零、返回選單後換隊再進入。low 另覆蓋約 26.2 秒自然死亡後 live spectator；high 未觀測到此狀態。page／console／WebGL error 為零，build 與輸入後置檢查皆通過。原始資料及獨立重算摘要在 `art-factory/cs/runs/run-20261012-annulus-production/qa/summary.json`。
- 兩輪都未達事先設定的本機工程門檻。high 18,184 幀：p95 20.9ms、p99 54.2ms、worst 291.6ms，>50ms 為 238 幀（1.309%）。low 25,170 幀：p95 29.2ms、p99 41.7ms、worst 287.4ms，>50ms 為 95 幀（0.3774%）。保留 `status=failed`／`failureKind=performance-targets`，不能以功能通過覆蓋此結果；不同時段與隊伍也不能當成品質設定的因果比較。
- high 的 HE window 僅有 1 個 >50ms 幀，慢幀未集中在新增爆炸效果。11 個 long tasks 只與 238 個慢幀中的 11 個重疊；GPU counter 顯示遊戲與三個 Ld9BoxHeadless 同時有活動。各自單一 3D counter 的峰值沒有相加，且沒有逐幀相關性證明，因此暫不能把卡頓歸因於遊戲或模擬器，也未因這份樣本貿然降低畫質或更動 renderer。
- 兩份已審查的 E2E-only patches 已套用到 root／Windows／Linux snapshot；2,280 個輸入僅兩個 test 檔變更，runtime／assets 與原 unit／build 相同。`qa/e2e-observers-oct12-source-seal.json` 明示 source-sealed、testsPassed=false，不冒稱驗證成功。
- 15-case 重播 v1 在 inventory 階段因 PowerShell stdin 將 grep 中文變成問號而失敗，沒有執行瀏覽器；保留原報告。v2 從原 spec 抽取精確標題並以 Unicode escapes 寫入，純 Node 與獨立檢核確認可編譯且精準命中三案。已啟動五 project 重播；其後完整全站使用 `qa/verify-fullsite-observers-oct12.mjs` 與新輸出名稱，不覆寫先前證據。

## 重播的新載入證據與來源案例隔離

- 15-case v2 結果為 7 passed、3 failed、5 not executed。矩陣檢查在 Chromium／Firefox／WebKit 通過；來源拒絕的兩分支在 Chromium／WebKit 通過。Firefox 的角色分支已明確記錄 hash mismatch，但同一個 test 的第二次完整載入開始時只剩約 10 秒總預算，尚未走到槍械完整性檢查便逾時。附件與原報告保存在 `qa/observer-replay-oct12-v2-failures/`。
- mobile-chrome 的角色分支也通過；槍械正常載入後，五個 FPS 貼圖請求同時記錄 `ERR_NETWORK_CHANGED`，renderer 因 required texture unavailable 正確停止，沒有進到第二次 rifle hash fetch。獨立分析及主代理抽驗 raw network 一致。這不能當作 hash 驗證程式錯誤，也不能只由共享 GPU 活動推定網路錯誤根因。
- 公會 Food 案仍在原 30 秒的 goto/load 逾時。改用單次、原期限的 request lifecycle 診斷後，獨立 Firefox 導航在 2,699.1039ms 完成，readyState=complete、fonts=loaded、pending requests=0；`qa/mitsu-load-diagnostic-oct12/report.json` 只記 captured，不冒稱原 E2E 通過。該次沒有重現，因此偶發原因仍未知。
- 將角色與槍械來源分成兩個獨立 parameterized tests，每案仍保留 test 60 秒、navigation 30 秒、load-error 30 秒及原 UI／disabled／hash／request-count gates。`finally` 現包住 goto，即使尚未出現錯誤 UI 也能保存 route 時戳、去 query 的 requestfailed 和 console。獨立審查 PASS；原產品程式、素材與單次載入期限不變。
- 新來源收據 `qa/e2e-source-isolation-oct12-source-seal.json` 已核對 root／Windows／Linux 的 2,280 個輸入。因新增一個獨立測試案例，全站 inventory 應為 2,515、專項為 20；已啟動 `qa/verify-source-isolation-replay-oct12.mjs`。後續完整 runner 改用 `qa/verify-fullsite-source-isolation-oct12.mjs`，前一版 2,510-case runner 不再代表目前案例集合。
- 更新後專項已 20／20 passed，0 skipped、0 flaky、0 not executed，單 worker、零 retry，168.604 秒。十個候選來源附件（兩來源 × 五 project）都保存精確 hash mismatch；角色 requests≥1、rifle requests≥2，原拒絕斷言均實際執行。摘要為 `qa/source-isolation-replay-oct12-audit.json`，不能當成網路歷史根因已消失或全站通過。
- 已以 fresh 2,515-case inventory 啟動新完整全站跑次，收據 `qa/fullsite-source-isolation-oct12-verification.json`。此次 runner 內含 strict acceptance，無需重跑舊 `accept-fullsite-hybrid-oct12.mjs`；後者屬於先前保留的失敗跑次。執行期間繼續固定 src／tests／public／snapshot controls。

### 2026-10-13 中斷恢復與完整矩陣驗證

- 上一跑次沒有終端 JSON，原程序已不存在；`580/2515` 只是已開始案例的 log 標記，不能當成通過數。原始收據保留，狀態與限制另記於 `qa/fullsite-interruption-oct13-audit.json`。
- root 與 Windows snapshot 的 2,280 個輸入比對一致；以同一來源建立持久 Linux snapshot，clean npm ci 成功，伺服器 PID 360593 的實際環境也確認沒有七個外部 KV／Redis 憑證別名。這是目前來源比對，不補稱中斷跑次有終端封存。
- 新 runner `qa/verify-project-matrix-oct13.mjs` 依序執行五個完整 project，各 503 案；共享六小時執行預算及三次失敗上限，單 worker、零 retry，原測試期限維持不變。每段都核對來源並保存不可覆寫的終端收據；只有五段精確覆蓋完整 inventory、沒有未執行／非預期跳過／失敗／flaky 才能通過。不合併舊片段，也不自動續跑。
- 驗收判定器先 Red 再 Green：13／13 Node tests 通過，含非預期跳過不得冒充 intentional skip；伺服器環境檢查 2／2 Python tests 通過。Linux 來源檢查設 60 秒逾時，逾時即停止並記 runner-error。
- 全站驗證、目前未達標的效能與人工美術／來源接受仍是未完成項目。此矩陣驗證不等同單一程序長時間 soak，也不代表可部署。

### 2026-10-13 正式版本慢幀診斷準備

- 獨立唯讀檢核確認目前 production 樣本欠缺同時軸 CPU／GPU／RAF entry 資料；歷史 30 秒 trace 未重現 GPU burst，且舊 recorder 沒驗 data loss，只能參考欄位。原 trace 解壓後 350,150,979 bytes，不能直接照搬成五分鐘全程 trace。
- `qa/profile-annulus-trace-oct13.mjs` 只允許一次 native／high／attack、300 秒診斷；使用現有正式靜態 bundle，來源與 build 身分持續核對。CPU profile、RAF timestamp／entry、LoAF 與 worker heartbeat 保留整個樣本；詳細 Chrome trace 在三個 >50ms 幀落入 500ms 窗口後開始一次後續窗口，最多要求 20 秒，未觸發則使用最後 20 秒。這不會捕捉觸發前的 trace，不能以未重現推定已修正。
- trace 串流讀取有 30 秒 deadline、512 MiB 位元組上限與 SHA-256，拒絕缺少 stream 或未知 data-loss 狀態；已知遺失只能保留診斷資料，不得宣告完整。collector 用串流寫入避免另存整份資料於 Node 記憶體，外層八分鐘 watchdog 只關閉自己建立的 browser。
- trace helper 的 Red／Green 已完成（初始 7 fail → 7 pass；窗口判定新增 2 fail → 最終 10／10 pass）。syntax check 通過；真實 `--preflight` 在完整矩陣執行期間因 `Full-site matrix must finish before profiling` 拒絕，exit 1，沒有建立診斷輸出或啟動第二個 browser。
- 診斷尚未執行、待獨立檢核。完整矩陣結束及來源封存後才能開始；診斷結果只可記 `captured`，原本兩個非診斷效能樣本及失敗門檻維持不變。
- 啟動前複審已 PASS：補上同 origin 的實際 response body 與完整 manifest 逐筆比較（path／HTTP status／byte length／SHA-256），樣本前及 page.close 後都排空 pending 並拒絕失敗；不能只由相同 HTML 推論資源相同。補上 `captureStatus`、`finding`、`traceWindowFinding` 與 `causality`，依實際 RAF rows 區分整個樣本及完整落在 trace 窗口的 cluster；未重現明記 `not-reproduced`，因果一律保持 unproven，待 raw trace 分析。新增五項先 Red，再 Green，最終 15／15 helper tests 通過。診斷仍未執行，等待同一完整矩陣終態。

### 2026-10-13 Firefox 失敗封存與兩個測試觀察修正

- 完整矩陣於 Firefox 第三筆失敗達上限後停止。Chromium 499 pass／4 skip；Firefox 403 pass／74 預期 skip／3 fail／23 未執行；WebKit 與兩個 mobile project 尚未開始。原始 runner 把 Playwright 的 max-failures report error 記為 `runner-error`，保留原紀錄；`qa/fullsite-project-matrix-oct13-terminal-audit.json` 另核對終態、報告 hash、三份副本的 2,280 個輸入、控制檔與 server 環境。矩陣仍失敗，不能由局部 replay 宣告全站通過。
- 守方選擇失敗發生在 Playwright 點擊前準備路徑，沒有實際 mouse action 已送出的證據。原版、原 15 秒門檻、無 retry 的獨立 Firefox replay 1／1 pass，僅記 `not-reproduced`；載入／渲染／控制通道或主機競爭原因尚未確定，未修改遊戲 handler。
- 貓咪泡泡的 trace 已看到戳貓動畫及 `show`，但 500ms wait 的 driver return 與下一個 assertion 之間另延遲約 7.2 秒，錯過 2.8 秒顯示窗。測試改為先等待入口問候消失，再在同一同步 browser task 擷取 click 前後 `{before:false, after:true}`，不改 runtime 時間。
- SPJ 的單次 wheel delta 8000 實際只捲到 684px／index 1；source 共 8 beats，末段 index 7。測試改為等待 index 0 初始化、捲至文件尾、驗實際位置與末段 index，再保留 opacity／名稱／連結斷言。實際 wheel 互動仍由另一既有 case 驗證。
- 兩個修正經獨立唯讀 review PASS；五瀏覽器共 10／10 pass，零 skip／flaky／retry，pre/post seal 均 2,280。新來源為 `qa/e2e-observer-fixes-oct13-source-seal.json`，只改兩份 E2E observer，runtime 與 1,694 unit／build 的 hash 相同。
- 戳貓負向對照實際阻擋 handler 得到 `{false,false}`，成功斷言確實拒絕；移除阻擋後得到 `{false,true}`。首版診斷誤等入口的 hidden class 而逾時，失敗及 runner 已保留；v2 改驗 runtime 的 `display:none` 後通過。彙整證據：`qa/observer-fixes-oct13-audit.json`。
- 待辦：既有性能／headed WebKit 診斷 gate 仍綁原來源及 raw matrix 頂層 postSeal，須以 TDD／複審接入已核對的 terminal audit 並更新來源綁定；不能把 targeted replay 冒充完整矩陣。接著完成效能根因、WebKit 能力／遊戲流程檢核、完整瀏覽器驗收與人工素材接受。

### 2026-10-13 診斷啟動與大型回應擷取修正

- 診斷 gate 已接入原始 matrix／audit bytes，驗 SHA、精確 receipt 名稱、audit 時間嚴格晚於終止時間、七項 post-seal 及程序消失；matrix acceptance 必須維持 false。舊 matrix seal 與新 observer seal 分別驗證，不混用。兩個 caller 在啟動前重讀收據；profile 另重驗目前來源。19／19 tests 及獨立唯讀檢核通過。
- 靜態預檢確認 2,636 個檔案、329,960,901 bytes，manifest SHA 仍為 `a5a4ef864cb85ce332d623fcf59f811d77c71cb34598c2155ccc61af970cfd75`；只做預檢，沒有啟動瀏覽器。新 source seal SHA 為 `6756a106f4f306cf638882c94481eaca7508a440600ce5279d1c81bd492cd63e`。
- 可見 Windows WebKit 26.0 最小頁實測在 `focused:true`、`visibility:visible` 下仍回報 `WrongDocumentError`，`pointerLockElement` 為空。收據與截圖在 `qa/webkit-headed-oct13/`；沒有遊戲／Safari 通過宣告，也不無條件重試相同探針。
- 第一輪效能診斷在正式取樣前失敗，未產生 modes／CPU profile／Chrome trace。49 筆實際回應通過 hash，但 16,915,872-byte `environment.glb` 的 `response.body()` 因 inspector cache evicted 無法取得。原始 failed run 保留於 `run-20261013-production-diagnostic/`。
- v2 改由同一 CDP session 在導覽前 `Network.enable`，以 128 MiB total／32 MiB per-resource 的明確上限保留回應，在 loadingFinished 立即讀 body 並核對；不重新 fetch、不 route 替換、不豁免大型資源。先排空 pending、停用 Network 並確認沒有新增 pending，才關閉 page，取代舊版的關頁後排空。新增 7 項 collector／caller tests，包含 16.9 MB binary、text、pending、失敗／竄改／redirect／非 200／缺 manifest。獨立檢核抓到共用 CDP 在 CPU profile 停止後過早 detach，先以 caller regression 重現，再移到 Network 收尾之後；合計 26／26 通過，複審 PASS。v2 的新增快取與 hash 負擔屬診斷成本，仍不能拿來取代正式效能驗收。
- v2 在取樣前成功直接驗證 26 筆回應（包含大型地圖），但 7 張 shared 圖片的 25 次事件從 CDP 取得空 body，因而停止，沒有五分鐘樣本。查安裝版 `crNetworkManager.js:329-348` 後確認 Playwright 的空 body fallback 會呼叫 `Network.loadNetworkResource`，所以先前「49 筆 Playwright 核對均證明原始回應、沒有另讀資源」的強度不足。兩次失敗與實作來源 hash 已封存於 `qa/response-observation-limits-oct13.json`；未採用互補 fallback，也未把過去失敗改成通過。
- 診斷改採明確限制：collector 預設仍嚴格；本診斷明示 opt-in，只有 sealed manifest 內 jpg/png/webp、HTTP 200、對應 MIME、單一整數 Content-Length 與 manifest 精確相等、且 CDP body 為空，才可逐筆記 `unavailable`／`verified:false`。這不能排除同尺寸內容替換；其餘錯誤照樣停止。JS／CSS／模型／未知路徑／錯誤或歧義 header／非空錯誤內容不適用例外。新增 Red／Green 後合計 28／28 tests 通過。
- `run-20261013-response-check/` 的短 probe 實際只執行相同路由、載入、start/deploy、回應排空及關閉流程，未採集 CPU／trace／效能樣本。26 筆 direct verified、25 筆 unavailable、errors=[]；前後 static/source 檢查通過，收據 SHA `29679d5e0ec49fc7e96591271482b9b0ad8216d9d5829628a11cc19b5f9bccfd`。`productionResponsesVerifiedAfterSample=false`、`captureStatus=no-performance-sample`。獨立檢核已 PASS；接著執行一次 `run-20261013-production-diagnostic-v3/` full diagnostic，仍保留部分圖片原始回應未觀察到的限制及原正式效能驗收失敗狀態。
- v3 已完成 300.001 秒／18,733 幀：p95 20.8ms、p99 20.9ms、worst 83.3ms，7 幀 >50ms（0.0374%）；沒有重現三個慢幀／500ms 的 cluster。完整對局、重開及換隊再入場通過，live spectator 未覆蓋。Trace 使用最後窗口 fallback，要求 17.842 秒、實際 mark 區間 17.8491 秒；198,536,055 bytes、dataLoss=false、SHA 經獨立核對，但沒有慢幀落在該窗口，不能用它宣告成因。
- 取樣期間 CPU counter 中位數 44.26%、p95 61.49%，CSV 時間依記錄的時區換算並只取遊戲樣本區間。7 個孤立慢幀對齊 LoAF 的 script attributed duration 為 0–7ms，較長部分在 renderStart 之前；重疊 Worker tick 間隔最多約 10.6–11.5ms。這不足以判定 GPU／排程／主機負載的因果，也未形成值得直接改遊戲碼的 hotspot 證據。CPU profile 總長 324.4 秒含前後診斷時間，不能全數視為精確 300 秒樣本。
- 診斷分析封存在 `qa/trace-diagnostic-oct13-analysis.json`；status 為 `captured-with-response-limitations`／`not-reproduced`，不取代舊正式效能樣本失敗。下一步使用 `qa/profile-annulus-revalidation-oct13.mjs`，保留原 high/attack、low/defend 各五分鐘的遊玩流程與門檻，在 fresh output 依序重驗；移除 CPU profiler／trace／heartbeat，現有 typeperf 多記 CPU total。舊 runner、舊結果及 policy 均不改。

### 2026-10-13：一般重驗發現暫停選單被回合結果遮擋

- `run-20261013-annulus-revalidation/` 高畫質攻方通過：18,096 幀、300.007 秒、p95 20.8ms、p99 20.9ms、worst 95.8ms、8 幀 >50ms（0.0442%），獨立逐幀重算一致。功能退場／換隊再入場通過，live spectator 未出現。原始收據 SHA `9bc9ab2d05911d5d7eccd63655c59640e8c2ca3c8c29df1a55c6185c404e207e`。
- 同批低畫質守方的幀率門檻通過（46,953 幀、300.004 秒、p95 8.4ms、p99 12.5ms、worst 54.1ms、1 幀 >50ms；自然觀戰約 27.46 秒），但採樣後點 `#cs-quit` 被 `#cs-result .cs-panel` 攔截 30 秒，整輪 exit 1，缺再入場與最終來源校驗，不能列為驗收通過。原始失敗收據 SHA `57e4118b06c99c1e893504433b1387d510c46c174955604b96f94adf0cf38ad3`。最後採樣幀仍為 live；問題出現在採樣後退場階段，不能說採樣在 round-over 結束。
- 獨立檢核確認為產品 UI 疊層缺陷：真人在 round-over 按 Esc 也會凍結倒數，但結果 panel 仍蓋在暫停選單前。新增 `games-cs-pause-round-result.spec.ts`，Red 實際重現 Quit／Resume 兩項攔截、match-over 邊界通過。僅在 `_cs.scss` 提高 `#cs-pause` 的 stacking priority，未改 client 邏輯或 runner 退場流程；Green 3/3 通過（25.9 秒），包含暫停倒數、續行至下回合、退場再入場、match-over 原生返回按鈕。截圖與 Red/Green hash 收於 `qa/pause-result-oct13-fix-verification.json`，獨立檢核 PASS。
- 新 `pause-result-oct13-verification.json`：1,694/1,694 unit 通過（74.274 秒），build exit 0（57.624 秒）；舊 static 保留於 Windows snapshot 的 `production-static-before-pause-result-oct13/`。新來源 seal `e2e-pause-result-oct13-source-seal.json` SHA `675fa95452206f7796211a99be6001c33aa644cece376e12e2e48c2cc98eb8de`，根目錄／Windows／Linux 2,281 inputs 核對一致，Linux server credentials 檢查通過。
- `profile-pause-result-oct13.mjs` 綁定新 build／seal 與 `run-20261013-pause-result-production/` fresh output，沿用相同門檻與 native 操作，依序重測 high/attack 與 low/defend；不可把前版 high 與新版 low 混成成對驗收。進度見 `qa/pause-result-oct13-performance-preparation.json`。
- 全站新入口 `verify-project-matrix-revalidation-oct13.mjs` 尚未啟動，等待兩輪效能測試清理後才執行。新 inventory 為 2,530（506 × 5 projects），workers 1／retries 0／共用 6 小時與 3 failures 上限不變。精確 max-failures 終態會完成來源與 artifact 校驗並記 failed；未知錯誤仍是 runner-error、acceptance=false。新終態 helper Red 6 fail／1 pass，Green 加既有測試合計 20/20，獨立檢核 PASS。
- 原全站失敗、WebKit pointer-lock 缺口、圖片原始 response 未全數直接觀察，以及人工美術／來源核准仍保留；本次修正不等於商用完成。
- 修正後正式樣本已全部完成並獨立重算：high/attack 17,538 幀、p99 20.9ms、worst 95.8ms、7 幀 >50ms（0.0399%）；low/defend 41,155 幀、p99 12.5ms、worst 58.3ms、1 幀 >50ms（0.00243%）。兩輪完整對局、重開、反隊再入場、來源／static post-seal 皆通過，low 自然觀戰 11.272 秒；high 未出現自然觀戰。共同 static manifest SHA `b4c67353eacb247a13ac9be54cdc27eab05bd6e38b72fc0bff1b43f442f8fde4`。主機 CPU 中位數分別 35.70%／38.53%，只描述本次負載，不據此宣告先前慢幀成因。正式摘要 `run-20261013-pause-result-production/qa/summary.json` SHA `270e110d6e9e3483015ed9cae27f9f7e30fea444bce10f428fb59e3936dd3e71`，status `passed-scoped-engineering-targets`。
- 兩個效能程序完整退出後，全站新矩陣已啟動（exec session `50221`），fresh inventory 2,530 已核對，Chromium 506 cases 先行。權威進度為 `qa/fullsite-project-matrix-revalidation-oct13-verification.json`；保持來源不變，待五個 project 終態後再判定整體結果。
- 交付條件唯讀檢核另找出一項證據缺口：`docs/games/breach-point.md:24` 承諾靈敏度／音量／畫質持久化，以及無法儲存時仍可遊玩；現有 E2E 只測同頁切換，未直接涵蓋 reload persistence／storage denied。已準備 QA-only `verify-settings-storage-oct13.mjs`，不改 matrix 的來源或測試集合，並實測 matrix 執行中會在任何 browser／output 前拒絕啟動。
- 設定 probe 待矩陣終態後執行三個隔離 context：正常儲存與 reload；所有 `setItem` 拋 QuotaExceededError；所有 `getItem/setItem` 拋 SecurityError（標示人工建模的較嚴格韌性情境，不聲稱所有私人模式都如此）。每案調三個設定、start/deploy、滑鼠鎖定、W 移動、pause/quit；`gameplayContractPassed` 與 page errors 分开保留。`BaseLayout.astro:161` 的 theme 讀取沒有 try/catch，可能在第三案報錯；須依實跑區分站台錯誤處理缺口與遊戲是否仍可玩，不能預先宣告遊戲故障。
- 設定 probe 的獨立檢核要求避免 theme 讀取造成假綠，因此 fault observer 只記 key 名、不記 value，且必須觀察 `breach-point.settings` 本身被讀寫；兩項 callback 測試 Red 2 failed → Green 2 passed。另補 browser/watchdog close error 的終態保存。複審 PASS，準備狀態見 `qa/settings-storage-oct13-preparation.json`；實際 probe 尚未執行、此交付證據仍 pending。
- 新矩陣已於 `2026-10-13T13:26:49.914Z` 達 3 failures 上限正常停止，source／artifacts 終態核對通過，session 50221 exit 1。Chromium 502 pass／4 預期略過；Firefox 422 pass／82 預期略過／2 fail；WebKit 67 pass／2 預期略過／1 fail／436 未執行。兩個 mobile projects 尚未啟動，合計 991 pass、88 預期略過、3 fail、1,448 未執行，不能列為全站通過。Firefox 與 WebKit terminal 經獨立檢核；整體 receipt SHA `3ee731bd229664a41f37a08d033aa98b91490b11004d430b8a13b412b0cc96c3`。
- 三項原始失敗均已封存：Firefox 地圖定位在 keyup 前已超過 x 上限、Firefox 貓咪初始 greeting 隱藏斷言出現觀察空窗、WebKit 音量按鈕點擊後面板仍 hidden。WebKit click 後 `data-playing=true`，不支持整段初始化尚未執行的假說；trace 沒有 DOM click listener 的直接紀錄，仍需分辨事件送達與狀態變更。維持原始失敗，不延長 timeout 或跳過案例。
- 設定 probe 已完成：正常儲存／reload 與 setItem 拒絕兩案通過，read/write 都拒絕的額外模擬亦通過 start/deploy/move/pause/quit，但記一筆 uncaught pageerror，整體標 failed、gameplayContractPassed=true。`src/components/layout/BaseLayout.astro:161` 的 theme 讀取為已定位的 source suspect，待回歸驗證，不能把此頁錯誤說成遊戲無法遊玩。receipt `qa/settings-storage-oct13/report.json` SHA `b06048b3b68ca3953aa0d97c466f4ad7c9ebf31d51360a3db851863a3ce01c91`。
- 地圖單次 Firefox 診斷未重現超界：x `19.003842892993948`，原 wait predicate 到 native keyup 為 11ms；前後 2,281 inputs 與環境一致。receipt `qa/map-timing-diagnostic-oct13/report.json` SHA `3301e98f73476ceb84233a76f47caed8fd041d480e21ea3e0a1ca9ba9f42bec5`。此診斷未覆蓋完整樓梯流程，也不推翻矩陣失敗。
- 貓咪 timer observer 經行為 Red（1 pass／3 fail）→ Green（4/4）與獨立檢核後單次執行；原 1800ms greeting timer 準時、3200ms hide timer 晚 2ms，原 10 秒斷言通過。`qa/cat-greeting-diagnostic-oct13/report.json` 標 captured／not-reproduced，保留 instrumentation 與不同負載限制；不把原矩陣改為通過。最後的 WebKit native-event 診斷準備於 `qa/verify-bgm-click-oct13.mjs`，完成後才解除本批來源凍結並處理已證實缺陷。
- WebKit native-event probe 已重現：pointerdown／mousedown／pointerup／mouseup 各一筆，document capture 與 window bubble 皆到達同一 `.arcade-bgm-icon`，但 click 為零；沒有 preventDefault、pageerror 或 console error。`qa/bgm-click-diagnostic-oct13/report.json` SHA `bd467a3aede030d2f5404ca08a24ae3ea8e77ec6510e36a6bcf2b4d46362fdd1`。四種屬性的 observer 只觀察到 data-playing，未觀察 text node mutation，因此內部機制仍以單變因驗證，不過度歸因。
- 新 native speaker regression 先在舊碼 Red（第一次點擊後 panel hidden，10 秒失敗），再只修改 `ArcadeBgm.astro` 的 `applyMusic()`：圖示字串不同才寫 `textContent`，保留第一次按下的文字節點；Green 1/1（10.509 秒）。完整 BGM 檔五專案 55/55、零失敗／略過／flaky 通過，獨立差異與 Red/Green 檢核 PASS；額外 native WebKit 實測確認 click 一筆、靜音與恢復音量的圖示更新正常。結果強力支持同字串 text node 重建為觸發條件，沒有宣稱 WebKit 內部合成演算法已直接觀察。
- 修正與來源比對收於 `qa/bgm-first-gesture-fix-oct13/verification.json`，目前 dev preview 為 `http://127.0.0.1:4006/games`、截圖 `panel-open-webkit.png`。舊 2,281-input seal／unit-build／performance 收據保留其修正前範圍；此刻新完整 build／source seal／全站矩陣仍待完成。下一步是 BaseLayout storage-denial 的精確回歸與修正，再一起建立新驗證批次；人工美術核准仍 pending。

### 2026-10-13：儲存容錯修正與新完整驗證批次

- BaseLayout 的 storage getter／getItem 拒絕先 Red（1 pass／2 fail）；首頁與 journal 的共用 layout theme 讀取也先 Red（2 pass／2 fail）。三個同步 inline 初始化只加 try/catch，保留已存主題與 dark fallback。七項新 regression Green；相關五專案最初 73 pass／2 fail，失敗皆為手機版尚未展開選單便點其中的 theme slider。依既有 DOM 移動流程補原生展開操作後，75/75、零略過／失敗／flaky／retry，獨立檢核 PASS。證據與原始失敗附件位於 `qa/theme-storage-fix-oct13/`。
- 修正後完整 unit 1,694/1,694（84.746 秒），正式 build exit 0（70.438 秒）。`qa/e2e-theme-storage-oct13-source-seal.json` SHA `1b83fbb39a605fcddaae52fecac63f5ce108fef55f881f59f11416b002f4d0d1`，三棵 source trees 的 2,281 inputs 一致；相對前一 seal 只有 BGM、三個 layout 與兩個 E2E 檔共六檔變更。
- 新正式建置的 storage probe 三案通過：正常設定 reload、write-denied、額外 modeled read/write-denied；均完成 start/deploy/native move/Esc pause/quit，pageerror 與 console error 為零。`qa/settings-storage-fixed-oct13/report.json` SHA `173ce80dc2a4b7cd1cac711f7515d11c8775371f534034aa499e46e4f204a317`；來源與本地 static manifest 前後一致。只驗證所服務 HTML 與本地產物身份，沒有宣稱所有原始網路回應均被驗證。正式 preview `http://127.0.0.1:4002/games/cs/`，`read-write-denied-paused.png` 已目視檢查。
- 新 fullsite runner 採五專案各四個 fresh serial shards，仍 workers=1、retries=0、共用六小時 active runtime／三失敗上限，所有斷言與 timeout 保留。QA helper 的對抗測試先抓到 matrix 身份／結果狀態／raw worker-retry-exit 的拒絕缺口，再完成 Red→Green；相關純函式測試 20/20、獨立檢核 PASS。每段 raw config、來源與 immutable terminal 都核對，最後要求新 inventory exact union；不能混用任何先前 pass，也不宣稱單一長程序 soak。
- `qa/fullsite-sharded-matrix-oct13-verification.json` 已實際列出 2,570 案（每專案 514）並啟動 session 2309，來源與 runner helpers 固定至終態。前次 Firefox 地圖／貓咪失敗原因仍未定，原失敗與未重現的診斷保留；本批完整終態和人工美術核准尚未完成，商用完成仍為 false。


### 2026-10-13 server lifecycle recovery

The first sharded matrix ended with runner-error when the Linux server exited after approximately 24,000 seconds. Shard 1 has a verified terminal receipt; shard 2 raw results are 125 passed and 4 intentional skips but lack post-server verification and are not accepted. Evidence: `fullsite-sharded-matrix-oct13-server-exit-audit.json`. A bounded queued systemd service now waits for the shared resource lock without disturbing another project. The fresh persistent-matrix runner preserves terminal/raw results even if its post-source check fails, while retaining rejection; 36 helper tests passed after the new regression failed for the expected reason. Current-source smoke native and fixed-view captures remain pending. No fresh fullsite matrix has started, and commercial readiness remains incomplete.


### 2026-10-13 native platform consistency and smoke closeout

Current smoke evidence is complete within native-flow/static-image scope: 2 production quality modes, 6 screenshots, 2 videos and 10 controlled views; independent visual/source reviews passed. Preview: http://127.0.0.1:4007/smoke-oct13/ . The first fixed capture timed out and remains preserved; the successful static variant retains engine stepping and draws only two final frames. This does not replace human art approval or performance evidence.

The persistent matrix session19097 was intentionally stopped and rejected before source edits: two native Pointer Lock tests lacked unsupported-platform gates. Only those cases now skip WebKit/mobile; desktop Chromium and Firefox routes, actions, timeouts and assertions are unchanged. Policy Red4/6 became Green10/0, and real related E2E completed with4 passed/6 intentional skips/0failures. Full unit1694/1694 and build passed again. All static build files are byte-identical to the previous build. New2281-input seal is `e2e-native-pointer-platform-oct13-source-seal.json`; fresh2570-case matrix session49139 uses `fullsite-sharded-matrix-platform-oct13-verification.json` and is running. No earlier partial passes are reused.

### 2026-10-14 需求逐項核對與 HE 補拍準備

- 三項獨立唯讀檢核已完成，涵蓋原始玩法、V5/V6 音訊與動作、死亡觀戰及 V38 特效；目前未發現新的確定功能缺陷。主代理抽驗 11 個來源雜湊與相關 unit rows，整理於 `qa/requirements-closeout-oct14.json`。
- 新一輪矩陣前三個 Chromium shards 已包含完整 77 個 CS inventory cases，77 項全部通過，沒有 skip、failure、flaky 或 retry。`qa/current-cs-chromium-oct14-audit.json` 核對精確 case 集合、terminal/raw SHA、前後來源與 server PID；包含載入重試、鍵鼠操作、暫停結果頁、死亡觀戰、音訊與 renderer 檢查。全站及其餘瀏覽器仍需完整終態，不以此子集取代。
- HE 現有實際 atlas 畫面只涵蓋平地爆炸初期約 .03–.13 秒；階梯邊、空爆及後段消退仍缺視覺證據。補拍工具準備 high/low 共 14 張靜態圖，須等目前矩陣完整通過後才啟動；running-matrix guard 已實測拒絕並且沒有啟動 browser 或建立輸出目錄。
- 補拍工具的獨立審查指出晚到 page/WebGL 錯誤可能被漏判；先以真實 cleanup 區塊的 VM 回歸重現 2 項失敗，再修正為 cleanup 後判定，4 項測試全過。這次僅修改 QA helper 與證據文件，凍結中的 runtime、tests、公用素材及矩陣 helpers 未變。人工美術／來源批准與商用完成判定仍待完成。
- 補拍相機再檢核：原坡下視角位於單面焦痕背面，另一個北側視角被露台遮住；改為 `(16, 2.4, 15.7)` 的側視位置。使用當前 map/elevation/movement 與 Three 相機矩陣的純 Node 計算，確認可站立、正面、中心視線、NDC，以及空爆 16 個火焰角點在畫面內，見 `qa/he-camera-geometry-oct14.json`。helper 也加入實際渲染相機的正面／視線／NDC gates，4 項 cleanup 回歸仍通過；兩位唯讀審查均 PASS。這些是執行前幾何證據，14 張實圖仍未拍攝。

### 2026-10-14：封存失敗矩陣後的修正

- 原 platform matrix 已結束：1281 passed、168 intentional skips、3 failed、1118 not executed；12/20 shards，outer session49139 exit1。90 個 WebKit cap 後未執行案例不算 intentional skip，兩個手機專案亦未啟動。12 組 raw/terminal SHA 與三份失敗封存已重核，見 `qa/fullsite-sharded-matrix-platform-oct13-terminal-audit.json`。
- Tetris 的 transport 在顯示 lobby 前失敗會把錯誤藏在未顯示的面板。1v1/FFA error 現先顯示 lobby；缺少 WebRTC 時提供可讀訊息，保留取消。正式測試先出現4個正確失敗，再16/16通過；桌面支援 WebRTC 的 E2E 仍要求真房號，觸控替代介面由手機專用測試覆蓋。
- Passer native WebKit 實測已有15秒、1280×720影片及 readyState4，卻沒有 Playwright request/route 事件。測試改驗正式素材的 metadata、正尺寸與無 media error，保留 preload/load count/loader/section，沒有修改播放程式或略過 WebKit。
- 手機入口的原生對照確認長 RAF 間隔被 GSAP lag smoothing 壓成每 tick33ms，15秒只走到timeline .594秒。入口局部增加3500ms完成時限；健康 timeline 完成會清 timer。停鐘、連點、裝飾清理與正常路徑分別驗證，不全域改 ticker。共享測試 helper 改等待真實 hidden 狀態。
- 原14張 HE 圖發現2.8m水平焦痕跨南樓梯。修正使用既有 elevationBoxes 的最高支撐面與穩定同高 tie，保持12個 instance、單 draw call、原atlas與生命週期，以世界座標裁切到單一踏面。19項新增單測先失敗，再含既有特效共46項通過；GPU Red鄰階像素55、預期255，Green3/3通過。
- 新14張高／低HE實景已完成獨立 scoped PASS：焦痕仍可見且不跨相鄰階面，27秒淡出、30.1秒移除，空爆無焦痕。見 `qa/he-surface-visual-evidence-oct14.json`，預覽 `http://127.0.0.1:4007/he-surface-lifetime-oct14/`。不擴稱任意曲面、動態投擲、全站或人工美術批准。
- 本輪 source 已變更；下一里程碑是最終局部回歸、全單元/build、新來源封存、正式版本效能重驗與完整新矩陣。舊效能樣本保留為歷史 scoped pass，不再聲稱新 shader 與舊 CS bundle 相同。尚未 commit、push 或部署。
- 舊 `he-lifetime-oct14/` 與修正後 `he-surface-lifetime-oct14/` 對照頁皆已生成，原14張圖複製後 SHA 一致；舊頁已驗證載入，新頁的實際瀏覽器檢查待局部回歸結束後串行執行。舊 matrix 的部分 Firefox 通過結果只保留為歷史，不能取代修正後的新矩陣。
- `qa/he-surface-metadata-correction-oct14.json` 更正 capture seal 繼承的舊敘述：runtime 確實有變、相對宣告前版13個路徑差異／最近前版11個差異，舊 unit/build 不證明 HE capture 的完整來源。原 seal、report、14張圖及其 hash 鏈保持不動，新增更正與 focused unit/GPU hashes；主代理與獨立審查均核對。
- 三份相關 spec 完整重跑結果為155 passed／4 intentional skips／1 failed（`terminal-related-oct14-verification.json`）；唯一 mobile Safari 1440px Passer 案例已抵達影片終點，但內容淡入10秒仍只有 .9384。原 trace、影片與截圖已封存，不改成通過。
- Passer 對照診斷直接量到稀疏 ticker 與 lag smoothing；default在10秒後 tween .747/.8、opacity .9997仍未完成，僅停用 smoothing 的對照可完成。新增停鐘回歸在 Chromium／mobile Safari 先各因opacity0失敗；僅對內容淡入加2000ms局部完成時限後2/2通過。正常 .8秒 easing、捲動條件與所有原斷言保持；獨立檢核 PASS。證據 `qa/passer-reveal-fix-oct14.json`；相關完整50案例仍在執行，背景分頁硬時限不在本次承諾內。原wrapper誤估55，另以fresh `--list`確認每專案10案；終態將核對raw與inventory，不因計數器錯誤重跑或抹去測試結果。
- Passer 完整50/50通過，零略過／重試／錯誤。outer helper因誤估55回傳1，Playwright child實際exit0；`qa/passer-reveal-related-oct14-audit.json`核對fresh inventory exact union、五專案各10案與root/Windows/Linux來源，獨立稽核PASS；原wrapper及160案失敗結果保持不動。
- 完整unit先通過1721/173，但Astro將新增 `tetris-lobby.test.js` 當頁面導致build失敗；依既有API測試慣例只改名為 `_tetris-lobby.test.js`，三棵來源內容SHA不變。重新完整unit1721/173與build均exit0，見 `qa/terminal-remediation-final-oct14-verification.json`。
- 新2282-input source seal SHA `88fadfa7a1f9f087f050c04d3e69e75ba9f7a0d42e97287544d2f3c3a6951001`；Linux source/control/environment核對、NodePID1072678。production preflight有2636檔、329987477 bytes、manifest SHA `849ac89674b9af82b0afcda6d4830dece1969ee037312e42a9e167c6a4627d89`，服務HTML與build一致。新完整inventory2585（517×5）已列出，矩陣尚未開始。
- 修正後HE對照頁的桌面1440／手機390皆已實際開啟，14張原圖與全部14連結逐一核hash、原生開啟圖片、無水平溢出與pageerror；截圖及結果 `qa/he-surface-gallery-oct14/report.json`，主代理目視通過。current production high/attack 300秒已開始，低畫質守方待串行執行；fullsite與人工美術／來源核准仍pending。
- 兩個current production樣本均已終態通過並獨立逐幀重算：high/attack 17,998幀／300005.2ms、p95/p99約16.8ms、worst66.8ms、>50ms一幀；low/defend 17,995幀／300006.2ms、p95/p99約16.8ms、worst50.1ms、>50ms一幀，含15,250.1ms自然觀戰。兩輪完整對局、重開與反隊再入場皆通過；同一source/build、無錯誤／HMR／GLerror。`run-20261014-terminal-remediation-production/qa/summary.json` SHA `31e33d86f812b3ee8f39a32a029a64ab0a49ad36f62a33b7efd71860ca133e2c`；獨立稽核 `qa/terminal-remediation-oct14-performance-audit.json`。profile postcheck涵蓋root/Windows source及static，Linux另有前置核對；HE爆炸無獨立render marker，不把投擲時序證據擴稱逐幀渲染證明。
- fresh全站2585案矩陣已啟動（session27965），權威進度 `qa/fullsite-sharded-matrix-terminal-remediation-oct14-verification.json`；workers1、retries0、五專案各四shards，共用6小時／3fail上限。來源與helpers保持封存，未取用舊partial pass。效能通過不代表fullsite或人工美術核准完成。
- 本輪 Chromium shard1 為129 passed／1 failed，shard2為125 passed／4 intentional skips；兩批來源終態校驗均通過。唯一失敗在upload ownership案例的import階段：renderer本身HTTP200，相依 `terrain-contact.ts` 報 `net::ERR_NETWORK_CHANGED`，upload／dispose斷言尚未執行。trace與原始失敗封存於 `qa/terminal-remediation-oct14-failure-chromium-upload/`；主代理與獨立審查核對一致。附近WLAN安全連線狀態事件僅為時間關聯，未證明原因。維持原矩陣失敗記錄，完整矩陣終態後才做一次該案例的針對性驗證。
- 當前高／低畫質各兩張production終場與再入場截圖已獨立檢查，未見黑畫面、缺材質、HUD裁切或武器異常；範圍與四圖SHA見 `qa/terminal-remediation-oct14-screenshot-review.json`。這項靜態檢查不取代動畫、特效生命週期或人工作品核准。
- 上述2585案矩陣已於 `2026-10-13T20:33:09.571Z` 達3fail上限：805 pass、82 intentional skip、3 fail、1695未執行；7/20 shards，來源與附件完整性經獨立檢核，結果仍為failed。三個失敗為Chromium相依模組網路切換、Firefox初始定位超出範圍、Firefox入口延遲關閉；三次獨立單項診斷均未重現，不回填為矩陣成功，也不據此宣稱CPU或網路根因確定。
- Firefox入口trace證實click handler及GSAP都已執行，遮罩在6秒gate失敗後才關閉。加入marker的單次診斷中，遮罩於點擊後1397ms完成、整段timeline於3223ms完成；3500ms fallback未到期即取消。產品入口沒有再修改，保留延遲原因未確定。
- 僅修改 `tests/e2e/games-cs-map.spec.ts`：初始x>=19後暫存下一幀，真實keyup後恢復原RAF；所有樓梯、平台高度、北側下降及世界邊界斷言保留。600ms延遲放鍵的原流程Red得到x22.532855而正確失敗；相同故障注入與一般流程在Chromium/Firefox合計4/4 Green、0retry。獨立程式檢核PASS，見 `qa/map-timing-gate-oct14-fix.json`。
- 新seal `e2e-map-timing-gate-oct14-source-seal.json` SHA `5717bc00ed18fcde03ca3117e31dd98f0f685242839b2a93331a9a67aebe5893`。其餘2281inputs與2636static檔逐檔相同，故以 `qa/map-timing-gate-oct14-runtime-bridge.json` 明示沿用1721unit/build及兩段300s效能結果，沒有冒稱重新執行。新fresh矩陣2590案（518×5）已啟動session44401、20shards、workers1/retries0；此輪收集上限提高至10fail，6小時上限與零unexpected/flaky/retried/unexecuted的acceptance保持不變。來源凍結至終態，舊失敗不覆寫。
- 新矩陣Chromium shard1為129pass/1fail：candidate取消載入案例於renderer匯入階段，相依terrain-contact.ts再次報ERR_NETWORK_CHANGED；產品ownership/dispose斷言未執行。已封存並獨立核對，見 `qa/map-timing-gate-oct14-failure-chromium-shard1-1/diagnosis.json`。附近WLAN事件只是時間關聯；不據此修改遊戲邏輯，也不以focused pass沖銷失敗。矩陣繼續收集其餘browser結果，另查可驗證的測試環境隔離方式。
- 審閱首頁只更新日期說明及最新HE/smoke連結，明確保留10/12快照而不稱舊爆炸為目前效果；原HTML與生成器已備份。三路HTTP200與內容SHA、獨立靜態審查通過，所有原圖片/影片與批准旗標未變。`qa/verify-review-home-oct14.mjs` 已通過語法檢查，必須在matrix終態後才實際跑1440/390渲染與連結操作；目前仍pending，不能宣稱UI驗收完成。
- 目前2590案矩陣的Firefox shard3已完成：128pass/1fail/0skip，129個唯一案例、來源2282項與四個失敗附件均經獨立核對。新增失敗為 `guild-naomiao77.spec.ts:115` 的停鐘入口回歸；原生雙擊後確實建立12個裝飾節點，但6秒hidden斷言失敗，失敗後截圖則已顯示主內容。備援timer與觀測延遲原因仍待定位，不以後續畫面沖銷失敗。原magic-cards與一般入口案例這次通過。證據 `qa/map-timing-gate-oct14-firefox-shard3-audit.json`、`qa/map-timing-gate-oct14-failure-firefox-stalled-entrance/`。截至 `2026-10-13T22:05:04.227505+00:00` 共7/20批、823pass/82 intentional skip/2fail；Firefox4執行中，完整not-executed尚不能定案。五個過期現行索引已改指本輪，舊值另存歷史。
- Firefox四批已完成518個唯一案例，與fresh inventory完全相符：434pass、83 intentional skip、1fail，0重試／flaky／未執行；83個skip均保留原有annotation。最後一批新增5個witchrun的Chromium-only WebGL略過。CS子集仍是32pass/47skip/0fail，不能據此稱整個Firefox通過。獨立與主代理重算一致，見 `qa/map-timing-gate-oct14-firefox-audit.json`。截至 `2026-10-13T22:17:12.592530+00:00` 全站完成8/20批、947pass/87skip/2fail，WebKit1已接續執行；完整not-executed仍待終態。入口trace沒有timer marker，最後visible觀測與hidden快照的空窗涵蓋3500ms名義期限，不能從assertion返回時間推論timer至少延遲多久；更正與後續單次量測範圍已存 `qa/map-timing-gate-oct14-failure-firefox-stalled-entrance/diagnosis.json`。
- 截至 `2026-10-13T22:38:47.782170+00:00`，WebKit 前兩批完成 176 pass／84 intentional skip；全站累計 10／20 批、1123 pass／171 skip／2 fail，WebKit 第三批執行中。WebKit 的 CS 子集 79 案已精確對齊 inventory：26 pass／53 skip／0 fail，沒有缺漏、重複、重試或 flaky；兩批 raw／terminal SHA、來源 2282 項及原始 skip annotation 均經主代理與獨立核對。見 `qa/map-timing-gate-oct14-webkit-cs-audit.json`；此結果限載入、資源與替代介面範圍，未宣稱完整 WebKit 或 Safari 遊玩驗收。
- 停鐘入口的單次診斷已準備並通過獨立審查，尚未啟動瀏覽器：`qa/stalled-entrance-timing-oct14-preparation.json`。21 個純 Node 測試通過；審查所見的量測成本混入、後置條件失敗被誤列為原案重現、網路失敗仍可能被判成功，均先新增正確失敗案例再修正。診斷保留原生雙擊、6 秒 hidden 與後續斷言，分開紀錄 timer 註冊上下界、原 callback 執行時間和 DOM 觀測；完整矩陣終態後，與 NetLog、首頁渲染驗證依序執行。單次未重現不會沖銷原矩陣失敗。
- 截至 `2026-10-13T22:50:59.625628+00:00`，WebKit 第三批 129 案全部通過，來源與逐案 raw／terminal 紀錄經獨立核對，見 `qa/map-timing-gate-oct14-webkit-shard3-audit.json`。Naomiao 21 案在 WebKit 均通過，包含停鐘入口；此平台結果不解釋或沖銷 Firefox 的既有失敗。全站累計 11／20 批、1252 pass／171 intentional skip／2 fail，WebKit 第四批接續執行，完整全站與商用驗收仍未完成。
- WebKit 四批已完成 518 個唯一案例，與本平台 fresh inventory 精確相符：429 pass／89 intentional skip／0 fail，沒有缺漏、重複、重試或 flaky。89 個 skip 全有原始 annotation，第四批的 5 個皆為 witchrun 的 Chromium-only WebGL 案例。CS 子集維持 26 pass／53 skip；Windows Playwright WebKit 結果不擴稱為 macOS Safari 或 Pointer Lock 遊玩驗收。主代理與獨立核對一致，見 `qa/map-timing-gate-oct14-webkit-audit.json`。截至 `2026-10-13T23:03:32.710783+00:00`，全站累計 12／20 批、1376 pass／176 intentional skip／2 fail，mobile-chrome 第一批執行中；兩個既有失敗及人工美術／來源批准仍待處理。


### 2026-10-14 final map-timing matrix and mobile diagnosis

- The sealed2590-case matrix reached the10-failure cap and terminated with exit1:1475 passed,229 intentional skips,10 failed,876 not executed;14/20 shards. Terminal integrity was independently verified; acceptance remains false. See `fullsite-sharded-matrix-map-timing-gate-oct14-terminal-audit.json`.
- Mobile Chrome CS coverage is complete at23 passes,53 intentional skips and3 timeouts;mobile Safari did not execute. Raw mobile Chrome shard2 skipped125 means25 intentional skips plus100 zero-result cases.
- Confirmed test contract mismatches: responsive language menu/book layout and touch guards for Bomber/Tetris. Armory traces prove buy-to-live transition during assertions. The renderer timeout lacks stage evidence and remains unresolved. Preserve all10 original failures.
- NetLog diagnostic started in session6775 on the unchanged source; finish it and the stopped-animation/renderer diagnostics serially before editing sealed inputs. Then fix confirmed contracts with focused Red/Green verification, run a fresh complete matrix and finish readiness review. Human art/source acceptance remains pending.
