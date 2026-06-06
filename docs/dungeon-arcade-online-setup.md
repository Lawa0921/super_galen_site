# Dungeon Arcade 線上對戰 — Production 設定（含帳單上鎖）

線上對戰用 **WebRTC P2P**（對戰資料瀏覽器間直連、不經伺服器），只需要一個小型
Redis 做「牽線配對 + 排行榜/積分」。Production 多實例必須共享 store；本機開發無金鑰時
程式自動退回記憶體 mock（`getSignalStore` / `getRankStore`）。

## 你只需要做兩步（約 2 分鐘）

### 1. 建立免費 Upstash Redis
- 進 **Vercel → 你的專案 → Storage → Create Database → Upstash (Redis)**，選 **Free** 方案。
  Vercel 會自動把 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN` 注入到專案環境變數。
- （或）到 Upstash console 建免費 DB → 複製 **REST URL / REST TOKEN** → 貼到
  Vercel → Settings → Environment Variables（Production 環境）。

### 2. 重新部署
- 推一次 master 或在 Vercel 點 Redeploy，函式即會讀到金鑰、啟用真連線與排行榜。

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
- ❌ 無法替你**註冊 Upstash 帳號 / 進你的 Vercel dashboard 設定環境變數**（需要你的雲端登入）。
  把上面兩步做完（或把 REST URL/TOKEN 給我，我可在你已登入的 Vercel CLI 上用 `vercel env add` 代填）即可上線。
