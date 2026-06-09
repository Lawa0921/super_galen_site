# Dungeon Arcade 階段 3：最多 8 人大亂鬥（FFA）　設計 + 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。每任務先寫測試→紅→實作→綠→commit。
> 來源：Phase 3 設計 workflow（6 設計面 → 綜合 → 可行性審查，verdict=buildable/85%+/零 blocker，Run wf_ad9f748a-c70）。

**Goal:** 把現有 1v1 線上對戰泛化為 2–8 人「大亂鬥」（FFA，最後存活者勝），最大化重用既有確定性鎖步 + 引擎 + 渲染 + 排名，並維持帳單安全與可自動測試。

**Architecture（單一權威模型）:** 所有端各自跑同一份 `FfaMatch`（N 個 `TetrisGame`，**全盤共用同一 seed**），靠**確定性鎖步**保證各端一致；拓樸＝**星狀中繼**（Host 純 relay 轉發每幀輸入，非遊戲權威）；積分＝既有 `progression.xpForMatch`（已 N 人就緒）+ 新增 N 人 ELO（N=2 退化為現有 1v1）；防作弊＝多數簽章共識（≥ceil(N/2) standings 一致）+ 後端 replay 重模擬抽驗 + 事件上限；UI＝2–8 人 lobby + 多盤版面 + 即時 standings。

## 🔴 鐵則（最高優先，違反即 desync + replay 永遠失敗）
1. **全部 N 盤共用同一個 seed**（每盤 `new TetrisGame({ seed })`，**禁 `seed+i`**）。
2. **攻擊目標選擇用種子化 `targetRng = createRng((seed ^ 0x5e3779b9) >>> 0)`**，垃圾洞用既有 holeRng；**全程禁 `Math.random()`**。
3. N=2 一律退化到既有 1v1 路徑（`computeMatchLayout`、`updateRatings`）以零回歸。
4. 1v1 既有檔案（match/game/lockstep/elo/replay/netMain/...）**行為不變**；新功能一律 `ffa` 前綴新檔。
5. playerId 用 `string`（暱稱或錢包地址，對齊既有 `Identity.id`），非數字 enum。

## 檔案結構
- **engine/ffa.ts**（NEW）：`FfaMatch(playerIds: string[], {seed})`、`FfaMatchEvent` 聯合型、`AttackRouting` 介面 + `SeededRandomRouting`。
- **net/ffaElo.ts**（NEW）：`expectedScoreNWay`/`placementScore`/`updateRatingsNWay`（重用 elo.ts 常數）。
- **net/ffaReplay.ts**（NEW）：`FfaReplay` 型別 + `simulateFfaReplay` + `verifyFfaReplay`。
- **net/ffaLockstep.ts**（NEW）：`FfaLockstep` 泛化 lockstep.ts；`getReplay()`。
- **net/ffaTransport.ts**（NEW）：`FfaHubTransport`(Host relay) + `FfaSpokeTransport`(Guest)；relay 抽 `routeFrame` 純函式。
- **net/ffaNetMain.ts**（NEW）：`hostFfaGame`/`joinFfaGame`/`runFfaGame`。
- **net/ranking.ts**（MOD）：加 `reportFfaResult`（共識+原子閘+applyFfaResult）；1v1 `reportResult` 不動。
- **net/rankStore.ts**（MOD）：加 `setBRReport/getBRReportsForMatch/getBRPlacementsForMatch/isSettledBR/markSettledBR`（Memory + Upstash HASH/SET NX）。
- **net/auth.ts**（MOD）：加 `buildFfaResultMessage(matchId, sortedPlayerIds, sortedPlacements)`。
- **render/ffaLayout.ts**（NEW）：`computeFfaLayout`（N=2 委派 computeMatchLayout）+ `PLAYER_TINTS[8]`。
- **render/StandingsPanel.ts**（NEW）：Pixi 即時名次面板。
- **src/pages/api/ffa-match.ts**（NEW）：簽章+seed 綁定+replay 抽驗+共識結算。
- **src/pages/api/signal.ts**（MOD）：SLOTS 擴 host-offer + guest-0..6-answer + host-ack-0..6（保留 1v1 offer/answer）。
- **src/pages/games/tetris.astro**（MOD）：人數選擇 + N 人 lobby；人數>2 走 ffaNetMain。

## 任務（依相依排序，TDD）
- **T1 FfaMatch 引擎核心（unit, deps:—）**：N 盤同 seed；input 隔離；step→各盤 process()（lock 未消行才傾倒、computeAttack→cancelGarbage 抵銷→餘量用 targetRng 選存活對手整包送+attack 事件、topout→placement 淘汰反序、同幀多淘汰以 playerIds 順序 tie-break、剩 1 人→result）；drainEvents/getPlayerState/pendingGarbage/getStandings/getPlacement。測試 ~30-40 例（攻擊量全表、抵銷、合併傾倒、名次、tie-break、同 seed targetRng/holeRng 序列一致）。
- **T2 N 人 ELO（unit, deps:—）**：`updateRatingsNWay`；**N=2 與既有 updateRatings 逐位相等**（迴歸斷言，最關鍵）；3-8 人名次方向正確。
- **T3 FfaReplay 重模擬/驗證（unit, deps:T1）**：`simulateFfaReplay`→Map<id,placement>；同 seed+inputs 名次穩定；竄改一幀→名次變被抓；超 MAX_FRAMES/MAX_EVENTS 拒絕；畸形 false。
- **T4 FfaLockstep + mock Hub（mock-net, deps:T1）**：inbox Map<id,Map<frame,actions>>；需全員該幀輸入才前進；FfaFrameMsg={f,p,a}；JSON.parse 容錯；getReplay()。mock `LoopbackHub`。測 4 人互傳 120 幀各端狀態一致 + confirmedFrame 相等 + getReplay 重模擬名次==實際。
- **T5 RankStore N 人共識 + reportFfaResult（unit, deps:T2）**：rankStore 加 BR 方法（Memory+Upstash）；auth 加 buildFfaResultMessage；ranking.reportFfaResult（placement 為 1..N 排列、共識≥ceil(N/2) 且 standings 全一致→markSettledBR 原子閘→applyFfaResult: updateRatingsNWay+xpForMatch+戰績）。測共識門檻 3→2/4→2/5→3/8→5、不一致 conflict、未達 pending、並發只一次、1v1 不回歸。
- **T6 /api/ffa-match（unit, deps:T3,T5）**：沿用 match.ts rate limit+json+prerender；驗簽 buildFfaResultMessage、seed 由 matchId 綁定、verifyFfaReplay 抽驗、reportFfaResult。測壞參 400/壞簽 401/seed mismatch/replay 不符/pending→settled/already。
- **T7 signaling 多槽位（unit, deps:—）**：signal.ts SLOTS 擴 host-offer/guest-0..6-answer/host-ack-0..6（保留 1v1）；signalClient Slot 改字串白名單。測新槽位 set/get/poll、未知槽位 400。
- **T8 FfaTransport relay（mock-net, deps:T7）**：FfaHubTransport（建 N-1 channel、relay 轉發其餘）+ FfaSpokeTransport；relay 抽 `routeFrame(fromIdx, raw, channels)` 純函式。測 mock channels 轉發正確子集、自身上層也收、channel 未開不丟例外。
- **T9 ffaNetMain 牽線+主迴圈（mock-net, deps:T4,T8,T6）**：host/guest 多槽位握手 + ffa-init 廣播；runFfaGame 同步建 FfaLockstep（onMessage 立即接管，避免開局丟幀的既有雷）；KO 簽章回報。暴露 `window.__tetrisDebug={ffaLockstep, get match(){...}, stage}`。
- **T10 N 人渲染（unit, deps:T1）**：computeFfaLayout（N=2 委派 computeMatchLayout、3-4 2x2、5-8 本機大+對手環繞、PLAYER_TINTS[8]）+ StandingsPanel；runFfaGame 實例化 N 份 BoardView/HudView/Effects + 跨盤 attack beam。測 origin 不重疊/cellSize>0/N=2 一致/isLocal 正確。
- **T11 lobby 接線 + 小規模 e2e（e2e, deps:T9,T10）**：tetris.astro 人數選擇 + N 人 lobby；e2e `games-tetris-ffa.spec.ts`（3 context 建房+加入+鎖步同步+一人 topout+standings、expect.poll 去 flake）。
- **T12 全套自測 + 手動驗收 + 文件（manual, deps:T11）**：npm run test + test:e2e；1v1/AI/SOLO 既有 e2e 零回歸；手動 3-4 分頁全旅程 + 8 盤效能。誠實揭露無法自動化的 ~20%（真實延遲、8 盤效能、NAT、>N/2 結託/多錢包）。

## 測試計畫
- **A 純函式單元（可完整自動測）**：ffa.test/ffaElo.test/ffaReplay.test/ranking(BR)/ffa-match/ffaLayout.test/signal 槽位。
- **B mock-net（記憶體 LoopbackHub/mock channels）**：ffaLockstep.test（4 人同步）/ffaTransport routeFrame/ffaNetMain 握手序列。
- **C 小規模 e2e（chromium，85-90% 綠，expect.poll 去 flake）**：games-tetris-ffa.spec（3 context）+ 既有 18+ e2e 零回歸。
- **D 手動（~20% 無法自動化）**：真實延遲/jitter、8 盤 60fps、NAT 穿透、>N/2 結託與多錢包自打（文件揭露為 P2P 權衡）。

## 風險（已知，含緩解）
- **確定性破壞（最高）**：誤用 Math.random()/seed+i → 強制單測「同 seed targetRng/holeRng 序列一致」把關。
- Host 單點故障：v1 不做遷移，沿用 1v1「對手斷線顯示 DISCONNECTED、對局中止不計分」。
- 8 盤 Pixi 效能：手動 profiling，必要時對手盤降重繪/簡化特效。
- 鎖步木桶效應：最慢玩家拖慢全體；INPUT_DELAY=3，>300ms RTT 需實機調。
- 共識 timeout：REPORT_TTL（10 分）逾期視棄權、不計分，避免懸掛。
- Replay 體積：事件/幀數上限 + 抽驗（非全驗）控本，監控 Upstash 額度。
- 防作弊根本限制：>ceil(N/2) 結託、同人多錢包自打 → P2P 無解，文件誠實揭露。
- Astro lobby DOM 回歸：N=2 走既有路徑 + 跑既有 online e2e。

## 帳單安全
P2P 無 TURN（e2e/local 為 loopback；跨網路需 TURN＝基建非程式、可關）；FFA 寫入每場約 N+1 次（共識回報+結算），100 場/時≈70 次/分，遠低於免費額度；replay 抽驗非全驗控本。無新增付費套件。
