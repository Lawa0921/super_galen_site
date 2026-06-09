# Dungeon Arcade 線上對戰 — Production 設定（含帳單上鎖）

線上對戰用 **WebRTC P2P**（對戰資料瀏覽器間直連、不經伺服器），只需要一個小型
Redis 做「牽線配對 + 排行榜/積分」。Production 多實例必須共享 store；本機開發無金鑰時
程式自動退回記憶體 mock（`getSignalStore` / `getRankStore`）。

## 現況（已完成）

- ✅ **已建立免費 Upstash for Redis**（Vercel Marketplace，方案 Free、無付款方式）並**連到 `super-galen-site` 專案**。
- ✅ Vercel 已注入 5 個變數到 production/preview/development：`KV_REST_API_URL`、`KV_REST_API_TOKEN`、`KV_REST_API_READ_ONLY_TOKEN`、`KV_URL`、`REDIS_URL`。
- ✅ 直連 Upstash REST 驗證通過（`PING`→`PONG`、`SET/GET/DEL` 正常）。
- ✅ 程式相容：`getSignalStore` / `getRankStore` 同時吃 `UPSTASH_REDIS_REST_*`（原生）與 `KV_REST_API_*`（Vercel 注入）兩種命名。

> 注意：Vercel 的 Upstash 整合注入的是 **`KV_REST_API_*`** 命名（不是 `UPSTASH_REDIS_REST_*`）。若改用 Upstash console 自建 DB 手動貼變數，則用 `UPSTASH_REDIS_REST_*`，程式皆相容。

## 上線（剩這步）

- 把 `feature/dungeon-arcade-tetris`（線上對戰）合併進 master 並部署；函式即讀到上述金鑰，啟用真連線與排行榜。
- 或先做 **Preview 部署**（不合 master）取得預覽網址實測線上對戰。

## 帳單為什麼不會爆（已從設計鎖死）
- **不綁信用卡**：Upstash Free / Vercel Hobby 沒有付款方式時是**硬上限**——超量只會被擋（throttle），**不會自動扣款**。
- **WebRTC P2P 不用 TURN**：對戰流量不經你的伺服器、零頻寬成本；只用免費公共 STUN。
- **程式層保險**：signaling 槽位短 TTL 自動過期、結果回報 TTL、排行榜 ZSET 截斷上限（1000）、`/api/match` per-IP rate limit（30/分）。實際用量（偶爾的房間配對 + 對戰結束寫一次分數）遠在免費額度內。

## 驗證（設定後）
```bash
# 應回 {"rows":[...]}（空陣列也代表 KV 連得上）
curl -s https://<你的網域>/api/leaderboard | head
```
- 開兩個瀏覽器到 `/games/tetris?mode=online`，一邊建房、一邊輸房號加入 → 連線對戰。
- 排名賽：兩邊都按「🦊 連錢包」再對戰，結束雙方自動簽章回報 → 上 `/games/leaderboard`。

## 我（AI）能/不能做
- ✅ 全部程式、mock、turnkey 設定、本機與兩瀏覽器 e2e 驗證都已完成。
- ✅ 透過 Vercel token 已完成：把使用者建立的 Upstash store **連到專案**、確認 5 個變數注入、直連 Upstash REST 驗證可用。
- ❌ 無法替你**註冊 Upstash／Vercel 帳號**（需你的雲端登入）；DB 由你在 Vercel Storage 點選建立後，其餘接線與驗證由 AI 用 token 完成。
