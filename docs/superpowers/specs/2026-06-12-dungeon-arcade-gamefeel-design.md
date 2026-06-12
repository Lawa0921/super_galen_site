# 遊戲手感打磨（Gamefeel Polish）設計 spec

> 來源：真實玩家實測回饋（2026-06-12，使用者轉述）。逐項拆解＋根因查證。旋轉系統（SRS）玩家確認無問題，不動。

## 回饋拆解與根因

| # | 回饋 | 根因（已查證） | 修法 |
|---|---|---|---|
| G1 | 「softdrop 沒做好——有輸入時就要持續下落」 | `InputController.REPEATABLE` 只有 left/right；按住 ↓ 只觸發一次 softDrop | softDrop 加入連續觸發：**無 DAS 充能、立即以 `sdf` 間隔重複**（預設 30ms）。input 層產生更多 softDrop action 進鎖步，determinism 安全 |
| G2 | 「HOLD 放左邊比較好；NEXT/HOLD 太不明顯；同邊會把 hold 當 next 放錯」 | 對戰版面（1v1/AI/FFA 本機盤）`HudView.setLayout` 把 HOLD+NEXT 疊同一欄；SOLO 已是 hold 左/next 右 | 對戰版面本機盤 HOLD 移**盤左**、NEXT 留盤右（對齊 SOLO 慣例）；HOLD/NEXT 標題字級+亮度提升、區塊框線強化。對手小盤不變 |
| G3 | 「AI 不會 hold」＋「hard AI 自己疊死」 | `ai/bot.ts`（El-Tetris）零 hold 概念；評估只看當前塊 | bot 每手同時評估「當前塊最佳放置」與「hold 換塊後最佳放置」取優（含首次 hold 建倉）；體檢評估權重修自滅（升級為 Dellacherie 特徵組：landing height/eroded cells/row+col transitions/holes/wells，網路成熟參數）。難度仍以決策延遲+失誤率區分 |
| G4 | 「現代方塊可調 ARR/DAS/SDF」 | 寫死 `{das:150, arr:35}` | 設定面板（PLAY 分頁齒輪）：DAS 50-300/ARR 0-80/SDF 0-60（0=瞬降）滑桿＋恢復預設；localStorage `tetris-handling`；四種模式開局讀取 |

## 非目標
旋轉系統、無延遲固定模式（玩家可用 ARR=0 達成）、觸控支援。

## 測試
G1/G4：InputController 單測（sdf 重複節奏、ARR=0 行為、設定載入回退）；G3：bot 單測（hold 路徑分數較優時選 hold、不會自殺疊高基準：固定 seed 跑 N 手存活/消行數門檻回歸）；G2：layout 單測（hold 錨點在盤左）＋截圖人工驗收；e2e 既有全部零回歸（鍵盤行為變更注意 ai/items spec 的 ArrowDown 假設）。
