# 快速配對隊列（Matchmaking Queue）設計 spec

> 來源：使用者需求「應該要有進入隊列配對玩家的功能」＋brainstorm 決策（2026-06-11）：**1v1+FFA 都做**；**等 60 秒沒人 → 提示轉 vs-AI**。
> 既有路線圖階段 4「公開快速配對佇列」的實作版。

## 目標

主選單加「⚡ 快速對戰 QUICK MATCH」：按下進隊列，**免交換房號**自動配對開打。湊到 2 人配 1v1、湊到 3+ 人配 FFA（最多 8），永遠有得玩（空池轉 AI）。

## 核心約束

- **無背景 worker**：Vercel serverless 只在請求期間執行 → 配對決策在「隊列輪詢請求」處理中完成（誰 poll 誰幫忙撮合）。
- **帳單安全**：Upstash 操作量＝排隊者每 3 秒 1 次 poll（每次 ≤5 個 Redis 指令），遠低於免費額度；無新增服務。
- **全部重用既有連線流程**：配對結果＝「房號＋角色＋人數」，host 自動建房、guests 自動加入——lobby/WebRTC/鎖步/結算零改動。

## 配對規則（v1 刻意簡單）

1. 進隊列：`/api/queue` `{action:'join', id, name, rating?}` → ZSET `queue:waiting`（score=加入時間戳）＋ entry hash（TTL 15 秒，client 每 5 秒 heartbeat 續命；關頁/取消即過期或主動 leave）。
2. 撮合（每次 poll 時嘗試，原子閘 `SET NX` 防並發重複撮合）：
   - 等待者 ≥3 且最早者已等 ≥10 秒 → 取最早的 min(全部, 8) 人開 **FFA**。
   - 等待者 =2 且最早者已等 ≥10 秒 → 開 **1v1**。
   - （<10 秒先不撮，給更多人湊團的機會窗。）
3. 配對成立：寫 `queue:match:{playerId}` = `{room, role:'host'|'guest', count, players}`（TTL 60s）；room 用既有 createRoom；**host＝等最久者**。
4. client poll 到 match → host 走既有 hostGame/hostFfaGame(count)、guest 自動 join——UI 全自動，玩家只看到「配對成功，連線中…」。
5. **60 秒沒配到** → 前端提示「目前沒有玩家在排隊，要先跟 AI 打一場嗎？」一鍵轉 vs-AI（不計排名）、或繼續等。
6. ELO 配對：v1 不做分段（池太小），rating 記進 entry 供未來分段用（誠實標註）。

## 檔案結構

- `src/pages/api/queue.ts`（NEW）：join/heartbeat/poll/leave；撮合邏輯抽純函式。
- `net/queueStore.ts`（NEW）：Memory＋Upstash 雙實作（照 rankStore 模式）。
- `net/matchmaking.ts`（NEW）：`tryFormMatch(waiting, now)` 純函式（規則 2 全部在此，完整單測）。
- `net/queueClient.ts`（NEW）：join/poll 迴圈/heartbeat/cancel（依賴注入 fetch/now）。
- `tetris.astro`（MOD）：PLAY 分頁加 QUICK MATCH 按鈕＋排隊中 UI（等待秒數、取消、60s AI 提示）；配對成功自動接 host/join 流程。

## 測試

- unit：tryFormMatch 全規則（2 人/3 人/8 人上限/10 秒窗/排序）；queueStore 雙實作往返+TTL+原子閘；queueClient 輪詢/heartbeat/取消（mock fetch）。
- API：join→poll(pending)→雙人 join→poll(matched 且兩端 role 互補)；過期 entry 不入撮合；併發撮合只成立一次。
- e2e：兩 context 都按 QUICK MATCH → 自動配對 → 連上開打（1v1）；三 context → FFA。60s AI 提示（mock 時間或縮短常數注入）。
- 零回歸：全套既有。

## 非目標（YAGNI）

- ELO 分段配對、跨模式偏好設定、隊列聊天室、重新排隊懲罰。
