# Harness 診斷報告 — super_galen_site

撰寫：Claude Fable 5，2026-07-05。本檔是 super_galen_site 專案層制度的依據；全域制度（派工、判斷、維護）見 `~/.claude/rules/`，其診斷檔 `harness-diagnostic-2026-07.md` 是另一個專案（Phoenix 訂房系統）的快照，不適用本 repo。
讀者：未來在本 repo 工作的主模型（Sonnet 等級）。

## 第一名：CLAUDE.md 是張舊地圖（最漏 token，也最誤導）

**證據**（2026-07-05 逐項實查）：
- 舊 CLAUDE.md 267 行（上限 160），每 session 全載，其中大半是冷參考：完整檔案樹、8 頁籤介紹、聯絡資訊。
- 事實腐爛成片：寫 Astro 5.x（實際 `package.json` 是 ^7.0.2）、Hardhat 2.26.x（實際 ^3.9.0）、76 個合約測試（實際 52 個 `it(`）、「public/guild/ 是成員靜態頁」（實際成員內容在 `src/content/guild/*.html`，約 160 檔；public/guild/ 只剩 1 個 js）。
- 最嚴重的是**重心錯位**：舊檔把網站描述成「RPG 作品集＋區塊鏈」，但 2026 年的實際開發重心是 `/games`（4 個遊戲、約 100 個 Vitest 測試檔）與 `/guild`（159 個成員頁）——e2e 共 33 個 spec，games 與 guild 為主——舊檔隻字未提。弱模型會拿 2025 的地圖走 2026 的城市。

**修法**（本次已執行）：CLAUDE.md 重寫為薄路由層（<120 行、事實全部實查），冷內容抽到 `docs/claude/{architecture,commands,verify}.md`。日後發現文件與程式碼矛盾：程式碼是真相，順手修文件（授權見 `~/.claude/rules/maintenance.md`）。

## 第二名：視覺開發迴圈把主對話當暗房（最容易失焦）

**證據**：
- 本專案的日常是 guild 頁面與遊戲美術。過去 session 的模式：Playwright snapshot / 截圖 / console 輸出直接進主對話，一輪「改→截圖→看→再改」重複十幾次，context 前半塞滿原始資料，後半忘記最初目標。memory 裡 10+ 條 `reference_guild_*` 踩坑紀錄就是屍檢報告。
- 「改了沒生效」有兩個已知假象雷（memory 已載）：Vite 舊快取服務舊版 `<script>`、4321 埠被別的 worktree 的 dev server 佔走（服務的是別的分支）。弱模型遇到會先懷疑自己的程式碼，原地重改半個 session。
- git status 55 行 untracked（root 驗證截圖、`.research/`、`_verify/` 產物），`.gitignore` 完全不涵蓋（check-ignore 全部 exit 1）→ 每 session 開場 snapshot 被截斷、弱模型反覆困惑「這些要不要 commit」。

**修法**：
- 視覺驗收一律走 `guild-page-verify` skill（guild 頁）或派 subagent 執行「截圖→比對→回報結論」，主對話只收「通過/不通過＋差異描述」。連續第 3 輪自己截圖自己看 = 該停下改派工的訊號。
- 「改了沒生效」的排查順序已寫死在 `docs/claude/verify.md`——先查埠，再清快取，最後才懷疑程式碼。
- `.gitignore` 已補驗證產物規則（本次 PR）。

## 第三名：跨專案假事實 + 本專案特有的不可逆區（最容易出錯）

**證據**：
- 全域制度檔原本寫死 Phoenix 專案的事實：派工模板的 `mix test`/`mix credo`、dispatch.md 宣稱常駐的 `error-debugger`/`code-quality-reviewer` agent（本 repo 的 session 沒有）。弱模型照抄就是跑不存在的指令、派不存在的 agent。**2026-07-05 已去專案化**：全域檔改為「查專案 CLAUDE.md」佔位符。
- i18n 是雙檔制：`src/i18n/translations/*.ts`（伺服器端）與 `public/assets/i18n/*.json`（客戶端）各五語，同一個 key 要改兩處 × 五語。只改一邊不會報錯，只會在某一側顯示舊文案——測試抓不到的靜默錯誤。
- 智能合約是真金白銀：`npm run deploy:polygon` 部署到 Polygon 主網，UUPS 升級操作不可逆。任何 `blockchain/` 下的改動都是高危區。
- 本專案**沒有** prettier/eslint（只有 Solidity 的 solhint）——完成判準裡不存在「lint 過」這一項，弱模型不要幻想去跑。
- 十幾個未 merge 的 feat/ 分支與多個 worktree 並行。開工第一步必須確認「我在哪個分支、哪個 worktree、dev server 是誰起的」。

**修法**：高危區清單與完成判準已寫進新 CLAUDE.md 與 `docs/claude/verify.md`；審查派工時把高危區清單複製進模板（模板見 `~/.claude/rules/delegation-templates.md`）。

## 誠實條款

- 本診斷基於 2026-07-05 快照。測試數量、頁面數、依賴版本都會變——發現不符時以程式碼為準，順手更新（`~/.claude/rules/maintenance.md` 授權）。
- guild 頁面的美感、遊戲手感這類品味判斷，制度補不了：做 2-3 個候選給使用者選，或明說需要他的品味判斷（`~/.claude/rules/judgment.md` 第 6 條）。
