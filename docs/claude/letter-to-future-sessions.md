# 給未來 Session 的信 — super_galen_site

來自：Claude Fable 5，2026-07-05。使用者用他唯一一次 Fable session 立了兩層制度：全域的 `~/.claude/rules/*`（昨天在 Phoenix 專案建的，已於今天去專案化），與你正在讀的這層（super_galen_site 專屬）。你（Sonnet/Opus/Haiku）不需要比我聰明——照制度走，制度補等級差。全域的信在 `~/.claude/rules/letter-to-future-sessions.md`，先讀那封的「三件事」與「退化方式」，本檔只補本 repo 特有的。

## 三件使用者沒問、但你必須知道的事

### 1. 這個 repo 的真實重心跟它的自我介紹不一樣
專案叫「RPG 作品集部落格」，但打開 git log 和測試分佈就會發現：2026 年幾乎所有活動都在 `/games`（4 個遊戲 + 連線對戰 + 排行榜，約 100 個 vitest 檔集中在這）和 `/guild`（159 個成員頁）。舊 CLAUDE.md 花八成篇幅講 RPG 頁籤和區塊鏈，那是 2025 的地圖。**接到任務先看它落在哪個聚落**——遊戲題去 `src/scripts/games/`，公會題走 guild skill 鏈，別被「作品集」的框架帶偏。memory 裡 `project_*`（遊戲進度）和 `feedback_guild_*`（公會設計鐵則）是這兩塊的活知識。

### 2. 這個 repo 的失焦來自「視覺迴圈」，不是「讀太多程式碼」
Phoenix 專案的失焦是狂讀檔塞爆 context；這裡不一樣——這裡是 guild 頁和遊戲美術的「改→截圖→看→再改」迴圈，一輪十幾次，截圖和 console 直接進主對話。memory 有 10+ 條 `reference_guild_*`、`reference_*_asset_*` 就是這樣踩出來的。**解法**：視覺驗收派 subagent 或走 `guild-page-verify` skill，主對話只收「通過/不通過＋差異」。你發現自己連續第 3 輪親自截圖看圖，就是該停下改派工的訊號。

### 3. 兩個「改了沒生效」的假象雷，會騙你去改沒問題的程式碼
- **埠被佔**：4321 可能是**別的 worktree** 起的 dev server，你看到的是別的分支的頁面。先 `ss -tlnp | grep 4321`（memory `reference_worktree_devserver_port_squat`）。
- **Vite 舊快取**：Astro dev 會服務舊版 `<script>`，新程式碼靜默不執行、無報錯。`rm -rf node_modules/.vite` 重啟（memory `reference_vite_stale_script_cache`）。

排查順序寫死在 `docs/claude/verify.md`：**先環境後程式碼**。這兩個雷各燒過半個 session，弱模型的本能是先懷疑自己剛寫的 code——反過來。

## 本 repo 特有的地雷位置（2026-07-05 快照）

- **i18n 雙檔**：改一邊不報錯的靜默錯誤，是本 repo 最容易「自以為完成」的地方。靠 grep 兩側驗證，測試抓不到。
- **合約 = 不可逆**：`blockchain/` 任何改動高危；`deploy:polygon` 打主網。碰之前放慢、找第二意見、使用者明示。
- **guild 頁 = 真人聲譽**：159 個成員是真實的人。連結沒開過不要寫、粉絲數字不要寫、內容要原創理解不要照搬貼文（memory `feedback_verify_links`、`feedback_no_follower_counts`、`feedback_no_copy_paste_posts`）。
- **現存待清理**（別擅自處理不可逆部分）：git status 有 55 行 untracked（root 截圖、`.research/`、`_verify/` 產物）；本次 PR 已補 `.gitignore` 規則，但既有未追蹤檔要不要留是使用者的事，不要擅自 `git add` 或刪。
- **沒有 error-debugger / code-quality-reviewer 自訂 agent**：全域 dispatch.md 提到的那些是 Phoenix 專案的，本 repo session 開場清單沒有。以**當前 session 的開場清單**為準，沒有就用 `general-purpose` + 明確 prompt。

## 這層制度最可能的退化方式，與預防

1. **CLAUDE.md 又長回去**：每個 session 想「這條很重要，加進 CLAUDE.md」。預防：160 行是硬上限（`~/.claude/rules/maintenance.md`），新內容進 `docs/claude/*`，CLAUDE.md 只加一行路由。
2. **docs/claude 的事實悄悄過期**：測試數、頁數、版本號都會變。預防：每個 docs 檔頂都標了事實日期；發現與程式碼不符時**以程式碼為準**順手改，這屬於 maintenance.md「可自行改」。
3. **重心又飄回「作品集」框架**：新 session 讀到「RPG 作品集」就以為那是重點。預防：本信第 1 節和 CLAUDE.md 開頭都寫死了真實重心，別跳過。
4. **memory 的活知識沒被讀**：本 repo 的踩坑教訓大量在 memory（`reference_*`、`feedback_*`），不在制度檔。預防：開工先掃 MEMORY.md，遊戲題和公會題尤其要看對應條目。

## 未完成交接

（2026-07-05 建檔時：制度檔全部落地。若你中斷，把未完成項寫在這一節，並更新 MEMORY.md。）
