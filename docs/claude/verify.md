# 完成判準與排查順序（super_galen_site）

本檔是全域 `~/.claude/rules/judgment.md` 第 2 條「何時算真的完成」的本專案具體化。
宣告完成前逐項核對；「編譯過」「應該對」不算完成，完成的證據是**貼得出來的實際輸出**。

## 完成判準（按改動型態）

| 改動型態 | 必跑（全綠才算完成） | 另外必做 |
|----------|---------------------|----------|
| 遊戲/前端邏輯（src/scripts/**） | `npx vitest run`（全套，不是只跑新增的） | 改到 UI 就補下面 UI 那行 |
| UI / 頁面 / 樣式 | 相關 e2e spec：`npx playwright test <spec> --project=chromium` | 實跑 + 回覆尾端附 `http://localhost:4321/...` 驗收 URL（鐵則，memory `feedback_always_provide_review_url`） |
| guild 成員頁 | `guild-page-verify` skill 全項通過（不可跳過） | 連結逐一驗證、不寫粉絲數、內容原創（memory `feedback_guild_*`） |
| i18n 文案 | grep 驗證 `src/i18n/translations/*.ts` 與 `public/assets/i18n/*.json` 兩側 key 都改了 × 五語 | 4321 實際切語言看一眼 |
| 智能合約 | `npm run test:contracts` + `npx solhint 'blockchain/contracts/**/*.sol'` | 高危區規則見下 |
| 收尾 / 大改動 / merge 前 | `npm run test:all`（vitest + 全瀏覽器 e2e，導檔再摘要） | push 後 `gh pr checks` 確認 Vercel build 綠 |

**TDD 照全域鐵則**：先寫失敗測試（vitest 測試放被改模組旁邊、e2e 放 `tests/e2e/`），確認失敗再實作。純文案/樣式微調豁免。

## 「改了沒生效」排查順序（先環境後程式碼，不要跳步）

歷史上兩個假象雷各燒掉過半個 session（memory：`reference_worktree_devserver_port_squat`、`reference_vite_stale_script_cache`）。順序固定：

1. **查埠是誰的**：`ss -tlnp | grep 4321` —— 4321 可能是**別的 worktree** 起的 dev server，服務的是別的分支。**預設安全解法：改用自己的埠**（`npm run dev -- --port <其他埠>`）。要砍掉那個 server 前，先確認**不是使用者正在用的**另一分支——別 kill 掉他手上在跑的東西。
2. **清 Vite 快取**：`rm -rf node_modules/.vite` 後重啟 dev server——Astro dev 會服務舊版 `<script>`（新區塊不執行、無報錯）。
3. **DOM 探針驗證**：在頁面 evaluate 查實際 DOM，別只信 MCP console 或截圖直覺。
4. 以上都排除，才開始懷疑自己的程式碼。

## build / 部署健康 & 過期的分支 base

- **開工建新分支前先 `git fetch` 確認 local master 沒落後 origin**：
  `git fetch origin && git rev-list --left-right --count master...origin/master`——右邊數字 >0 就是 local 落後，先 pull 再分支。本 repo 多 worktree、十幾條 feat/ 分支並行，local 主線很容易落後。**從過期 base 分支會把「早已在 origin 修好的問題」當成新 bug**（2026-07-05 就這樣誤判過：clean build 失敗其實是 base 落後兩個 commit，使用者 10 天前已修好，memory `reference_fetch_before_branch`）。分支的 base 也算「環境」，屬於本檔開頭「先環境後程式碼」的一環。
- **判斷 build 真健康用 clean build**：`npm ci && npm run build`（`npm ci` 精準照 lockfile = Vercel 做的事）。碰依賴、升版本、動 `astro.config.mjs` 後跑一次再宣告完成。
- **本專案在 `astro ^7.0.2`（流血邊緣）**：浮動 `^` 依賴會漂到生態系還沒跟上的新版（rolldown 的 `manualChunks` 要函式、`@astrojs/rss` 要對上 zod 4），build 會在 bundler / zod 之類靜默壞掉。

## 高危區（審查派工時把這段複製進模板）

- **智能合約 / 金流**：`blockchain/` 任何改動都是高危。`npm run deploy:polygon` 是 Polygon 主網、UUPS 升級不可逆——只有使用者明示才能執行。私鑰在 `.env`，絕不入庫、不進 log。
- **i18n 雙檔同步**：改一邊不報錯的靜默錯誤，靠 grep 驗證，測試抓不到。
- **連線對戰 API**（`src/pages/api/_*.ts`）：外部輸入要驗證；改協定要同時跑雙方（雙頁籤 e2e）。
- **guild 頁對外形象**：內容錯誤直接傷真人聲譽——連結逐一開過、事實有來源才寫。

## 派工與 worktree 陷阱（本專案 delta，其餘照 ~/.claude/rules/dispatch.md）

- 本 repo 的 session **沒有** `error-debugger`、`code-quality-reviewer` 這類自訂 agent——以開場清單為準，沒有就用 `general-purpose` + 明確 prompt。
- **Subagent 不繼承 worktree cwd**（memory `feedback_subagent_worktree_cwd`）：派工 prompt 第一步強制 `cd <worktree絕對路徑>` 並驗證 `git branch --show-current`；收報告時核對路徑與分支。
- 視覺驗收（截圖比對、多輪微調）派 subagent 或走 skill，主對話只收「通過/不通過＋差異」。自己連續第 3 輪截圖→看→改 = 停下改派工。
- 一次生成多張候選圖時，放到 4321 可開的網址或臨時頁給使用者選——他看不到 Read 工具顯示的圖。
