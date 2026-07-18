# 架構參考（super_galen_site）

事實日期：2026-07-05（逐項實查）。與程式碼矛盾時以程式碼為準，順手更新本檔。

## 技術棧（實際版本，來自 package.json）

- **Astro ^7.0.2**（靜態生成 + Vercel adapter）、TypeScript、SCSS（36 個 partials）
- **遊戲**：Pixi.js ^8.18 + pixi-filters、three ^0.182、Canvas、Web Audio 合成音效
- **區塊鏈**：Hardhat ^3.9、ethers ^6.15、OpenZeppelin 5.4（UUPS 可升級）、solhint
- **測試**：Vitest ^4（約 100 個測試檔）、Playwright ^1.58（33 個 e2e spec × 5 瀏覽器 project）、Hardhat+Chai（52 案例）
- **部署**：Vercel（無 GitHub Actions）

## 四大區塊（依 2026 年開發重心排序）

### 1. /games — 遊戲聚落（目前最活躍）
- 頁面：`src/pages/games/{index,tetris,bomber,witchrun,defense}.astro` + `leaderboard.astro`
- 引擎邏輯：`src/scripts/games/{tetris,bomber,witchrun,defense}/` ——單元測試最密集的地方（AI、lockstep 連線、matchmaking、replay）
- 連線 API：`src/pages/api/_bomber-match.ts、_ffa-match.ts、_leaderboard.ts、_queue.ts`（線上功能需 Upstash env，本機有記憶體 fallback）
- 各遊戲進度與未 merge 分支 → memory 的 `project_*` 條目

### 2. /guild — 公會成員頁（159 人）
- 名冊：`src/data/hall-of-fame.yml`（159 個 `page:` 條目）
- 成員內容：`src/content/guild/*.html`（約 160 檔）——**不是** public/guild/（那裡只剩 1 個 js）
- 路由：`src/pages/guild/[member].astro` 動態產頁
- 成員圖片：`public/assets/img/guild/<member>/`
- 工作流程固定走 skill 鏈：`guild-member-research` → `guild-page-design-immersion` → `guild-page-verify` → `guild-page-finalize`；設計鐵則在 memory 的 `feedback_guild_*` 系列

### 3. RPG 主站
- `src/components/rpg/`：狀態列、8 個互動頁籤（狀態/技能/故事/物品/成就/夥伴/購買/日誌）
- 單例管理器（`public/scripts/` + `src/scripts/`）：GameStateManager（Cookie 持久化）、I18nManager、UnifiedWalletManager（ethers.js）、SGTPurchaseManager、NetworkMonitor

### 4. Blog + 合約
- 文章：`src/content/blog/YYYY-MM-DD-title.md`（27 篇）
- 合約：`blockchain/contracts/SuperGalenTokenV1.sol`（UUPS ERC-20）+ `MockUSDT.sol`（本地用）；網路：localhost 31337 / Polygon 137

## i18n 雙檔制（本專案特有陷阱）

同一個 key 存在兩處，**必須同步改、各五語**：
- 伺服器端（Astro build 期）：`src/i18n/translations/{en,ja,ko,zh-CN,zh-TW}.ts` → `import { t } from '../i18n'`
- 客戶端（執行期 JS）：`public/assets/i18n/{en,ja,ko,zh-CN,zh-TW}.json` → `data-i18n` 屬性 / `window.i18n.t()`

只改一邊不報錯，只會某一側顯示舊文案。改完用 grep 驗兩邊 key 都在。

## 目錄速查

```
dev                     # 一鍵啟動腳本
src/pages/[lang]/       # 五語路由（guild/, journal/, index, rss）
src/pages/games/        # 遊戲頁
src/pages/api/          # 連線對戰/排行榜 API
src/content/{blog,guild}/
src/data/hall-of-fame.yml
src/scripts/games/      # 遊戲引擎（測試在旁邊 *.test.ts）
src/styles/             # 36 個 SCSS partials；禁 !important、禁行內樣式
blockchain/{contracts,scripts,test}/
tests/e2e/              # 33 spec（games + guild 為主）
public/assets/          # 靜態資源（圖片、i18n json、影片）
```
