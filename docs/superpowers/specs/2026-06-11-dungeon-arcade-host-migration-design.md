# 中離續行 Stage B：Host Migration 設計 spec

> 接續 `2026-06-11-dungeon-arcade-forfeit-continuation-design.md` 的 Stage B outline。
> 目標：FFA（N≥3）**host 中離**時，剩餘玩家重組星狀拓樸續行、舊 host 判敗；達成使用者要求「任何人中離＝那個人判敗、其他人繼續」的完整版。

## 行為規格

| 情境 | 行為 |
|---|---|
| FFA host 中離、剩餘 ≥2 人 | 約 10–25 秒內：選出新 host → 經既有 signaling 重連 → 補齊輸入缺口 → 舊 host 判敗淘汰 → 對局續行；結算照常（剩餘簽章 ≥ ⌈N/2⌉ 即計分） |
| 遷移失敗（重連逾時 `MIGRATION_TIMEOUT_MS=20000`） | 降級為現行為：「HOST 離線，對局中止」不計分（誠實降級） |
| 新 host 又中離 | 同流程再遷移（世代 gen+1，上限 `MAX_MIGRATIONS=6`，超過降級中止） |
| 1v1 host 中離 | 不適用（1v1 對手中離＝forfeit win，Stage A 已處理） |
| 開局前（lobby）host 離開 | 維持現行為（lobby 取消） |

## 核心設計

### B.1 Host 離線偵測（guest 端）
- `spoke.onClose`（Stage A 已掛）＋ host 頻道 10 秒靜默兜底（host 每 tick 都會送自己的幀；對局停滯時 host 仍持續送——靜默＝host 死）。觸發後進入遷移流程而非顯示中止。

### B.2 新 host 選舉（無需通訊的確定性規則 + signaling 仲裁兜底）
- 規則：**原始 slot index 最低、且本端視角尚未定名次（未淘汰/未棄權）的 guest** 為新 host 候選。
- 各端視角可能在「最近 INPUT_DELAY 幀內剛淘汰的玩家」上短暫分歧 → 兜底：候選把 offer 寫入世代化槽位後，**其他端輪詢時一律取「存在 offer 的最低 index 候選」**為準（signaling 為仲裁）；非候選端等待 `ELECTION_GRACE_MS=3000` 後才輪詢，給最低 index 候選先手。雙候選並存時，較高 index 候選在輪詢中發現更低 index 的 offer 即放棄自任、轉為加入者。

### B.3 世代化 signaling 槽位（重用 T11 整套交握）
- `isValidSlot` 擴充：`mig{g}-guest-{i}-offer`、`mig{g}-host-ack-{i}`（g=1..6、i=0..6）；既有槽位不動。
- 流程同 T11 guest-initiated：倖存 guest（非新 host）各自 `createOffer` → `mig{g}-guest-{i}-offer`（i=**原始** index，不重排）→ 新 host 輪詢已知倖存 index 的 offer → 逐一 answer 至 `mig{g}-host-ack-{i}` → waitOpen。
- 房號沿用原 room code（Upstash room TTL 需 ≥ 對局時長：確認現值，不足則建房時延長或遷移時 touch）。

### B.4 輸入視野合併（斷點補課，確定性命脈）
問題：舊 host 死時各端收到的輸入前綴不等長（host 轉發到一半），且彼此缺對方在斷線窗內的輸入。
- 重連完成後，每端（含新 host）送 `{t:'ffa-mig-sync', gen, cf: confirmedFrame, horizon: {playerId: maxFrame}, inputs: [...]}` 給新 host：`inputs` 為該端 inbox 中所有「尚未消化」幀＋自己 `cf` 之後已送出但未確認的本地輸入（從 lockstep 的 replayEvents/inbox 可重建；同一幀同玩家輸入在所有端必然相同——皆源自舊 host 的有序轉發——合併天然冪等，沿用 `recordInput` 首寫保留）。
- 新 host 合併全部 sync → 廣播 `{t:'ffa-mig-state', gen, inputs: 合併集, hostForfeitF}`，其中 `hostForfeitF = max(各端 horizon[舊hostId])+1`（必可達停滯點，沿用 Stage A 教訓：**禁用 confirmedFrame+1**）。
- 各端灌入合併輸入 → `scheduleForfeit(舊hostId, hostForfeitF)` → lockstep 自然推進到同一狀態 → 恢復正常 tick。replay 連續性自動成立（events/forfeits 照常累積，結算驗證不受影響）。

### B.5 傳輸層熱插拔
- `MigratingTransport implements FfaLockstepTransport`：facade，內部持有「當前 inner transport」（spoke 或 hub）；`swap(inner)` 重綁 onMessage/onControl 到同一上層回呼。FfaLockstep 不需改（仍只認一個 transport）。
- 新 host 端：inner 由 spoke 換成 `FfaHubTransport`（接新建的 N-2 條 channel）＋啟動 Stage A 的 host 偵測（forfeit controller、靜默檢查）對新 guests 生效。
- 其他 guest：inner 換成連向新 host 的 spoke。

### B.6 UI
- 遷移期間：盤面凍結＋橫幅「HOST 離線，重新連線中…」（Press Start 風格，含轉圈/省略號動畫，reduced-motion 靜態）；成功 → 橫幅消失、舊 host 盤面標 FORFEIT 續行；失敗 → 「對局中止」既有文案。
- `__tetrisDebug` 加 `migration: { gen, state }` 供 e2e。

## 測試策略
- **unit**：slot regex 世代擴充；選舉規則純函式（含分歧視角兜底）；sync/merge 純函式（冪等、horizon 計算、hostForfeitF）。
- **mock-net**：MigratingTransport swap 後鎖步不漏訊息；完整遷移序列（3 端 mock：host 死 → 選舉 → sync 合併 → forfeit → 各端狀態 JSON 一致續行到 victory）；雙候選並存收斂；遷移逾時降級。
- **e2e**：3-context FFA 開打 → **關閉 host context** → g1/g2 經遷移續行（placement 含舊 host、confirmedFrame 恢復推進、打到分出勝負 standings 一致）。逾時預算 60s。
- **零回歸**：全部既有（487 單元＋32 e2e）。

## 風險與誠實限制
- 重連用真實 WebRTC：本機/e2e 為 loopback 必成；跨網路 NAT 失敗 → 降級中止（與現狀同，不更差）。
- 遷移窗內又有 guest 中離：遷移完成後由新 host 的 Stage A 偵測接手（最壞情況降級中止）。
- 結託風險不變（⌈N/2⌉ 共識模型同前）。
- Upstash 寫入：每次遷移 ≈ 2×(N-2)+2 次 slot 操作，量級可忽略。

## 非目標（YAGNI）
- 中離者重連回局、觀戰、lobby 階段 host 轉移、1v1 host migration（無意義）。
