# CLAUDE.md — super_galen_site

給在此 repo 工作的 Claude Code。**全域制度**（派工、判斷、維護）在 `~/.claude/rules/`，本檔只放本專案的路由與最高頻的「別踩雷」事實。
事實日期 2026-07-05；與程式碼矛盾時**程式碼是真相**，順手改本檔（授權見 `~/.claude/rules/maintenance.md`）。

## 一句話定位

Astro 7 靜態站 + RPG 遊戲化介面 + Web3 代幣，但 2026 的**實際開發重心是 `/games`（4 個遊戲、連線對戰）與 `/guild`（159 個成員頁）**。舊版 CLAUDE.md 把它當「作品集部落格」是過時的重心。

## 按需讀取（不要憑記憶行動）

| 何時讀 | 檔案 |
|--------|------|
| 要跑指令、測試、啟動、生圖 | `docs/claude/commands.md` |
| 要理解架構、找檔、i18n 雙檔制 | `docs/claude/architecture.md` |
| 要宣告完成、排查「改了沒生效」、審查高危區 | `docs/claude/verify.md` |
| 開工 / 久未接觸本 repo | `docs/claude/letter-to-future-sessions.md` |
| 想懂本 repo 的制度為何長這樣 | `docs/claude/harness-diagnostic-supergalen-2026-07.md` |

## 每 session 必記的五條雷（不讀上表也要知道）

1. **i18n 是雙檔制**：`src/i18n/translations/*.ts`（伺服器端）+ `public/assets/i18n/*.json`（客戶端），各五語（en/ja/ko/zh-CN/zh-TW）。同一 key 改一邊不報錯、只顯示舊文案——**兩邊都要改**，改完 grep 驗證。
2. **本專案沒有 prettier / eslint**，只有 `solhint` 管 Solidity。完成判準裡沒有「跑 lint」這項（合約除外），別幻想去跑不存在的指令。
3. **智能合約是真金白銀**：`npm run deploy:polygon` 打 Polygon 主網、UUPS 升級不可逆——**只有使用者明示才能碰**。私鑰在 `.env`，絕不入庫。
4. **「改了沒生效」先查環境再查程式碼**：4321 埠可能被別的 worktree 佔（服務別分支）、Vite 可能服務舊 `<script>`。排查順序見 `docs/claude/verify.md`，別急著重改程式碼。
5. **驗收 UI 後必附 4321 可點連結**給使用者（memory 鐵則）；產圖後也要放到可開的網址（他看不到 Read 工具的圖）。

## 完成判準（摘要，全文見 docs/claude/verify.md）

- 先寫失敗測試（全域 TDD 鐵則；純文案/樣式微調豁免）→ 實作 → `npx vitest run` 全套綠（不是只跑新增的）。
- **`npm run test` 是 watch 模式會掛住**，一律用 `npx vitest run`。
- UI 改動跑相關 e2e：`npx playwright test <spec> --project=chromium`（e2e 自動在 4002 起 server，與 4321 無關）。
- guild 頁走 `guild-page-verify` skill；合約跑 `npm run test:contracts` + solhint。
- push 後查 Vercel build（`gh pr checks <PR#>`）；本專案**無 GitHub Actions**。

## 樣式規則

SCSS 模組化（`src/styles/`，36 partials）。**禁 `!important`、禁行內樣式。**

## 素材生成 skill 路由

任何圖 → `nanobanana-image-gen`（預設）；使用者說「用 codex」→ `codex-image-generation`；BGM → `gemini-music-gen`；音效 → Web Audio 合成不生檔。

## Git

- Conventional Commits；末尾署名 `Co-Authored-By: Claude <noreply@anthropic.com>`。
- 開工先確認**當前分支 / worktree / dev server 是誰起的**——本 repo 有十幾個 feat/ 分支與多個 worktree 並行。
