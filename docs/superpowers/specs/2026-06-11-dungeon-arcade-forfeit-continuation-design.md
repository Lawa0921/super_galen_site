# 線上對戰中離續行（Forfeit Continuation）設計 spec

> 來源：brainstorming（2026-06-11）。使用者決策：優先於 P4 剩餘項；「中離者判敗、其他人繼續」；採兩階段——**Stage A：Guest 中離續行**（本 spec 主體）→ **Stage B：Host Migration**（outline，另出細化 spec）。

## 目標

線上對戰中任何玩家中離（主動離開／關閉分頁／斷網）時：中離者**判敗**（視同當下淘汰），其餘玩家**對局照常續行**到分出勝負，且排名結算照常成立。

## 現狀（要被取代的行為）

1v1 與 FFA：任一端斷線 → `disconnected` 旗標 → 整局凍結顯示 DISCONNECTED、不計分。FFA 中離者更會讓鎖步永久卡幀（全員等他的輸入）。

## Stage A：Guest 中離續行

### A.1 行為規格

| 情境 | 行為 |
|---|---|
| FFA guest 中離（N≥3） | 該玩家判敗淘汰（placement=當下存活數，同 topout 規則），其盤面標示 FORFEIT，對局續行；剩餘玩家照常簽章共識結算（簽章數 ≥ ⌈N/2⌉ 即計分） |
| FFA 多人中離致剩餘簽章 < 門檻 | 對局仍續行至分出勝負，但無法達共識 → 不計分（誠實限制） |
| FFA **host** 中離 | Stage A 仍中止：guest 顯示「HOST 離線，對局中止」、不計分（Stage B 解） |
| 1v1 對手中離 | 顯示「OPPONENT FORFEIT — YOU WIN」；**不計分**（單方簽章可偽造 forfeit，無法防作弊；誠實限制） |
| 中離偵測 | ① 主動：ESC「離開對戰」先送 `{t:'ffa-leave'}` 再關閉；② 被動：RTCDataChannel close 事件；③ 靜默逾時：host 觀測某 guest 頻道連續 `SILENCE_TIMEOUT_MS=10000` 無任何訊息、且同期間至少一條其他頻道有訊息（排除全域卡頓誤判） |

### A.2 確定性棄權協定（核心）

- Host（中繼權威）判定 guest p 中離 → 取 **F = M+1**（M = host 已中繼的 p 的最大輸入幀）→ 對所有頻道廣播控制訊息 `{t:'ffa-forfeit', p, f:F}`。
- **為何無 desync**：任何端要確認幀 X 需要全員（含 p）該幀輸入，p 只送到 M → 所有端 `confirmedFrame ≤ M < F`；且 DataChannel ordered+reliable，棄權訊息必在 p 的所有中繼輸入之後到達 → 每端都先有完整前綴再套棄權。
- 各端（含 host）：`lockstep.scheduleForfeit(p, F)`；`advance()` 模擬到幀 F 時、**套用該幀輸入之前**執行 `match.forfeit(p)`。
- `FfaMatch.forfeit(id)`：alive 且 phase='playing' → 走既有淘汰路徑（placement=目前存活數、ko 事件帶 `reason:'forfeit'`、剩 1 人照常 victory）；已淘汰/已結束 → no-op。同幀呼叫結果確定。
- 棄權後該玩家缺幀由既有「已淘汰補空輸入」機制吸收，鎖步不再等他。

### A.3 Replay／防作弊相容

- `FfaReplay` 加可選欄位 `forfeits?: Array<{ f: number; p: string }>`（無此欄位＝舊格式，**向後相容**）。
- `simulateFfaReplay`：模擬到幀 f 時、套輸入前執行 forfeit（與 lockstep 同序）→ 含中離局的名次可重現。
- `verifyFfaReplay`：forfeits shape/bounds 檢查（f 為有限數且 ≤ frameCount、p ∈ playerIds、長度 ≤ playerIds.length）。
- `/api/ffa-match`：自然支援（驗證走 verifyFfaReplay）；舊 client 無 forfeits 照常。

### A.4 傳輸層

- `FfaHubTransport`/`FfaSpokeTransport` 加：`onChannelClose(cb(idx))`（hub）／`onClose(cb)`（spoke）＋控制訊息通道 `sendControl(raw)`/`onControl(cb)`（與 FfaFrameMsg 分流；lockstep 既有 shape 驗證本來就會忽略非 frame 形狀，控制訊息走獨立回呼不污染 inbox）。
- Hub 收到 guest 的 `ffa-leave` 控制訊息 → 視同該頻道 close（快速路徑，不等 close 事件）。
- `ffaNetMain`：host 端三種偵測 → 廣播 forfeit；guest 端 `onControl` 收 forfeit → scheduleForfeit；guest 對 host 頻道 close → Stage A 顯示中止（Stage B 改 migration）。ESC 離開對戰：先 `sendControl(ffa-leave)` 再 close。
- 1v1 `netMain`：`transport.onClose` 既有路徑，文案與結果處理改為「OPPONENT FORFEIT — YOU WIN」（match 凍結、不回報）。

### A.5 UI

- FFA：被棄權盤面疊「FORFEIT」標籤（同既有淘汰視覺語彙）、standings 即時反映；不打斷存活者操作。
- 1v1：勝利橫幅變體「OPPONENT FORFEIT — YOU WIN」＋副標「對手已離線（此局不計分）」。
- ESC 選單「離開對戰」確認文案補充「離開將判敗（排名局計入名次）」。

### A.6 測試

- **unit**：`ffa.forfeit`（淘汰名次/victory 觸發/重複與已淘汰 no-op/結果後 no-op）；`ffaLockstep.scheduleForfeit`（幀首套用順序、F 之前輸入照常生效、4 端 LoopbackHub 一人中離 → 各端狀態 JSON 一致並續行到 victory、getReplay 含 forfeits）；`ffaReplay` forfeits（重模擬名次與實際一致、竄改 f/p 被抓、畸形拒絕、無欄位向後相容）；`/api/ffa-match` 含 forfeits 結算 applied。
- **e2e**：3-context FFA 開局 → 關閉一個 guest context → 其餘兩端 `expect.poll` 觀測中離者 placement=3、對局續行至 victory、standings 一致。
- **手動**：實際多視窗關閉/斷網體感、靜默逾時觸發時間。
- **零回歸**：全套既有測試（含正常 FFA/1v1 全旅程）不變。

### A.7 風險

- 靜默逾時誤判：以「其他頻道同期活躍」為前提條件緩解；逾時值集中常數可調。
- 控制訊息與幀訊息共用頻道的順序性：依賴 DataChannel ordered（既有配置），不另建第二條 channel。
- 舊版 client 相容：forfeits 為可選欄位；協定加控制訊息型別，舊 client 的 lockstep shape 驗證會忽略未知形狀（已有測試保證不丟例外）。

## Stage B：Host Migration（outline，實作前另出細化 spec）

- 偵測 host 離線（spoke close）→ 確定性選新 host＝最低 index 存活 guest → signaling 新世代槽位（如 `mig{gen}-guest-{i}-offer`）重建星狀連線（沿用既有 Upstash signaling，短 TTL，無新服務）→ 各端上報輸入視野（confirmedFrame＋inbox 水位），新 host 合併（per-player per-frame 冪等）並重播缺口 → 對舊 host `scheduleForfeit` → 續行。
- 已知難點：重連失敗（NAT）降級為中止、視野合併正確性、結算 replay 跨 migration 連續性、lobby/UI 過場。
- 帳單安全：重用既有 signaling API 與額度模型，無新增付費資源。

## 非目標（YAGNI）

- 斷線**重連回局**（leaver rejoin）——判敗即終局，不做重入。
- 1v1 forfeit 計分——單方簽章不可信，維持不計分。
- 旁觀者模式。
