# 開發指令參考（super_galen_site）

事實日期：2026-07-05。與 `package.json` 不符時以 `package.json` 為準，並順手更新本檔。

## 啟動

```bash
./dev            # 一鍵：Hardhat node(8545) → 部署合約 → Astro dev(4321)
npm run dev      # 只起 Astro（http://localhost:4321），大多數前端工作用這個就夠
npm run build    # 生產編譯
npm run preview  # 預覽生產版本
```

## 測試

```bash
npx vitest run [path]         # 單元測試（約 100 檔，集中在 src/scripts/games/*）
npm run test:e2e:chromium     # e2e 單瀏覽器（日常用這個）
npm run test:e2e              # e2e 全 5 瀏覽器（很慢，大改動或收尾才跑）
npm run test:contracts        # Hardhat 合約測試（52 案例）
npm run test:all              # vitest run + 全瀏覽器 e2e（收尾用）
```

**雷**：
- `npm run test` / `npm run test:unit` 是 **vitest watch 模式，會掛住不退出**。腳本與 session 裡一律用 `npx vitest run`。
- e2e 的 Playwright 會自動在 **4002** 起 dev server（`playwright.config.ts` 的 webServer，本地會 reuse 既有的）；e2e 不需要也不使用 4321。
- 跑全套測試時導檔再摘要，不要讓原始輸出進主對話：
  `npx vitest run > /tmp/claude-vitest.log 2>&1; tail -30 /tmp/claude-vitest.log`

## 區塊鏈

```bash
npm run compile                              # 編譯合約
npm run node                                 # 只起 Hardhat node
npm run deploy:local                         # 部署到 localhost(31337)
npx solhint 'blockchain/contracts/**/*.sol'  # Solidity linter（本專案唯一的 linter）
npm run deploy:polygon                       # ⚠️ Polygon 主網，真金白銀且 UUPS 升級不可逆——必須使用者明示才能碰
```

## 素材生成（skill 路由）

| 要生什麼 | 用什麼 |
|----------|--------|
| 任何圖像（guild 頁、遊戲素材、封面…） | `nanobanana-image-gen` skill（專案預設） |
| 圖像，但使用者明說「用 codex」或 Gemini 掛了 | `codex-image-generation` skill |
| BGM / 配樂 | `gemini-music-gen` skill |
| 遊戲音效 | 不生檔案，用 Web Audio 合成（見 memory `reference_game_asset_additive_black`） |

產圖後必附 4321 可開的網址給使用者看（memory：`feedback_show_art_via_url`）。

## 本專案沒有的東西（不要幻想）

- 沒有 prettier / eslint（只有 solhint 管 Solidity）
- 沒有 GitHub Actions CI——push 後的檢查是 **Vercel** 的 build（`gh pr checks <PR#>` 查）
