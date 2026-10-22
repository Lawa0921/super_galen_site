# 星燈迷宮 易讀性（12／24px＋整數倍縮放）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉「似乎有缺字」。遊戲裡所有文字只用 12px 或 24px 的 Cubic 11。舞台縮放以「裝置像素」為準：每個舞台像素正好是整數個裝置像素，所以 125%、150% 縮放也清楚。觸控手機直拿時，舞台側置 1×。Pixi 文字也用 Cubic 11，並等字型載入完成。字型沒有的 4 個箭頭換成字型裡有的字。戰鬥與遊戲邏輯逐位元不動。

**Architecture:**
- **縮放只在 CSS**：
  - `.slx-screen` 改成絕對定位、`transform-origin: 0 0`，CSS 倍率是 `--slx-s`。
  - 媒體查詢依「裝置像素比 d」與視窗大小決定倍率：`s × d` 是整數（裁定 1）。左上角用 CSS `round()` 對齊 1/d px。
  - 全螢幕改用 `document.documentElement`，避開 UA 的 `:fullscreen { transform: none !important }`。
- **字級靠兩道守門**：
  - `ui2/typeScale.test.ts` 編譯 SCSS，檢查每一條宣告。
  - `tests/e2e/starlantern-legibility.ts` 在每個 e2e 測試結束時（`test.afterEach`）檢查畫面上實際算出的值：舞台倍率、字級、Pixi 文字，以及 CDP `CSS.getPlatformFontsForNode` 回報「真的用 Cubic 11 畫」。
  - 兩道守門各有一張「還沒輪到」的清單，Task 3–6 逐步清空，Task 7 刪掉清單。
- **缺字靠字型本身**：`data/woff2Cmap.ts` 用 Node 內建的 brotli 讀 `Cubic_11.woff2` 的 cmap。`data/glyphs.test.ts` 掃描玩家看得到的原始碼，每一個非 ASCII 字都必須在字型裡。

**Tech Stack:** TypeScript、Sass（`sass` ^1.97）、Pixi.js v8、Vitest（happy-dom；字型與 SCSS 測試用 node 環境）、Playwright e2e（chromium＋兩個新的 DPR 專案）、Chrome DevTools Protocol、Git Bash。

**Spec:** 本計畫沒有獨立的 spec 檔。依據是：
1. 使用者的決定「全面改 12/24px＋整數倍縮放」（2026-10-23）。
2. 控制者轉述的調查結果（下面〈背景〉）。
3. 字型稽核 `C:\msys64\tmp\claude\C--Users-bag57\2c248522-7150-4161-8ef7-00e1a1e771a9\scratchpad\glyphs\`（`missing.json`、`punct.json`、`check.py`）。
4. 審查修正：小數 DPR、全螢幕、只有觸控才側置、禁止幾何佔位圖示、真實字型守門。
5. 控制者的小螢幕裁示：側置只給觸控，提示改「請橫拿手機遊玩」，旋轉方向配合手機逆時針轉成橫拿。

使用者授權技術規格由我們決定。下面標「設計者裁定」的，都是本計畫做的決定。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`.superpowers/`、`playwright` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-23-starlantern-legibility/`，下稱 SDD。行號只用來定位，動手時一律用內容找。

## 背景（調查結果，已核對原始碼）

- **字型**：
  - Cubic 11 涵蓋所有用到的漢字，只缺 4 個箭頭：▶ U+25B6、◀ U+25C0、▸ U+25B8、▾ U+25BE。
  - 字型有 ▲▼←→↑↓◆◇（`punct.json`）。
  - `unitsPerEm` 1200。12px 時一個漢字前進 13px、數字 7px、×±− 8px、箭頭 13px。
  - 字形格線是 12px 的整數倍，所以只有「12px 或 24px，乘上整數裝置倍率」才清楚。
- **SCSS 字級**：`_starlantern-ui.scss` 有大量 8–11px 與 14–48px，例如狀態標籤 9px、技能樹 9–10px、提示 10px、橫幅 34/40px。另外還有負字距（-0.5px、-0.2px）和奇數行高（13px、15px）。
- **縮放**：
  - 視窗小於 640×360 時，整個舞台用 `scale(0.95…0.3)` 縮小（:42-50）。
  - 大的視窗用整數 CSS 倍率，但沒有考慮 DPR。125%／150% 縮放時，實際倍率是 2.5、3.75，一樣會糊。
- **全螢幕**：`ui2/main.ts:82` 對 `#sl-screen` 呼叫 `requestFullscreen`。UA 的 `:fullscreen` 規則帶 `transform: none !important`，縮放會被蓋掉。
- **Pixi**：
  - `render/BattleView.ts` 的 Pixi 文字沒有設 `fontFamily`，用的是 Arial，還有 `fontWeight: 'bold'`。
  - 畫布 640×360、`resolution: 1`。
  - 沒有任何地方等 `document.fonts`。
- **`revealIn`**：`ui2/scenes/statusTabs.ts` 用 `getBoundingClientRect` 的螢幕 px 來改 `scrollTop`（版面 px）。不是 1× 時會捲過頭；側置時方向整個錯。
- **e2e**：
  - 有 29 處用到 390×844（清單在 Task 2b）。
  - 另有 6 處用 `#sl-screen` 的寬度或 `box.height / offsetHeight` 推算倍率：spec 約 87、1669、1914、2011、2179、3216 行。

## 計畫裁定

1. **設計者裁定：倍率以裝置像素為準**。d 是 `devicePixelRatio`。
   - **d 的偵測**：
     - 已知的 d 有：1、1.1、1.25、1.5、1.75、2、2.25、2.5、2.625、2.75、3。
     - 每個 d 用 `(min-resolution: <d − 0.005>dppx) and (max-resolution: <d + 0.005>dppx)` 偵測。
     - 每個 d 設定 `--slx-d` 與 `--slx-px: <1/d>px`。
   - **一般（橫向，或非觸控）**：
     - 公式：`K = floor(min(vw·d/640, vh·d/360))`、`s = K / d`，s 上限 6。
     - d < 2 時，K ≥ 1 都採用；這時 s 可以小於 1，代表一個舞台像素正好是一個裝置像素。
     - d ≥ 2 時，只採用 s ≥ 1 的 K；沒有的話 s = 1。理由：高 DPR 手機上，一個字形像素 ≥ 2 個裝置像素，邊緣最多糊一個裝置像素。若縮到 s < 1，字會剩約 1.5mm 高，更難讀。
     - K = 0（視窗比 640×360 的裝置像素還小）時 s = 1，頁面可以捲動。
     - Sass 迴圈產生「d × K」的媒體查詢，各自設 `--slx-s`。規則依 K 由小到大排，寫在整數後備規則之後。
   - **d 不在清單裡**：`s = clamp(floor(min(vw/640, vh/360)), 1, 6)`，也就是整數 CSS 倍率。
   - **原點**：`left = max(0px, round(down, calc((100vw − 640px·s) / 2), var(--slx-px)))`。`top` 用 `100dvh` 與 360px 同理。
   - **例子**：
     - 1280×720@1 → s 2。
     - 1280×720@1.25（125%）→ K 2、s 1.6，舞台 1024×576。
     - 1280×720@1.5 → K 3、s 2。
     - 844×390@3 → s 1。
     - 851×393@2.75 → K 3、s 1.0909。
2. **設計者裁定（控制者裁示）：側置只給觸控直拿**。
   - **條件**：`(orientation: portrait) and (max-width: 639px) and (pointer: coarse)`。
   - **作法**：同一套倍率規則，寬高對調：`K = floor(min(vw·d/360, (vh − 40)·d/640))`。上方保留 40px 給提示，提示文字改「請橫拿手機遊玩」（12px／16px）。
   - **方向**：玩家把手機逆時針轉成橫拿時，畫面是正的。所以直拿時舞台頂端朝螢幕右緣，`transform: translateX(<360·s>px) rotate(90deg) scale(var(--slx-s))`。
   - **例**：390×844@3 → 舞台在 x 15、y 102，大小 360×640。
   - **非觸控的窄視窗**（桌面把視窗拉窄）：不側置。照一般規則 s = 1，兩個方向都可以捲動。
   - **橫拿但高度不夠**（844×340 一類）：照一般規則；K 不夠時 s = 1，可以垂直捲動。
   - **理由**：18 個畫面全是絕對座標，重排成直式等於重做全部畫面。轉 90° 是像素對齊的整數變換，版面和橫向完全相同。
   - **被否決的方案**：1× 加水平捲動，以及小於 1 的縮小。若使用者不接受側置，另開計畫做直式版面。
   - **e2e 驗不到的**：觸控捲動在轉了 90° 的捲動區裡往哪個方向走，e2e 量不到。報告要提醒控制者，請使用者在實機（iOS Safari）確認。
3. **設計者裁定：字級只有兩級**。
   - **24px（行高 28）只給展示字**：
     - 標題 logo 的後備文字、`.slx-place`、`.slx-night`、`.slx-clear-card h2`。
     - 戰鬥／條件橫幅、奧義與行動切入的名字。
     - 隊伍欄的傷害數字（`.slx-pm-pop` 系列）。
     - Pixi 的傷害數字與地圖記號。
   - **其他全部 12px**：原本 16px 的標題一律 12px，靠金色區分。理由：改成 24 會讓頁首變高、壓到下面的視窗。
   - **行高**：12px 用 12、14、16、18；24px 用 24、28、32。行高減字級必須是偶數。
   - **字距**：只能是 0 或正整數 px；`0.08em` 改 `2px`。
   - **粗細**：一律 normal。全域加 `.slx-screen :where(b, strong, th, h1, h2, h3, h4, h5, h6) { font-weight: normal; }`，`.sl-cutin__name` 的 800 也改 normal。
4. **設計者裁定：缺的箭頭全部換成字型裡有的字**（AGENTS.md 禁止幾何佔位圖示，所以不用 CSS 三角）。
   - **◀／▶ → ←／→**：
     - 設定的值、數量視窗。
     - 狀態／裝備／工坊／建議配點的換人箭頭。
     - `T.ui2…hint` 的「◀▶ 換分頁」。
   - **敵人意圖的前綴**：`▶ ` 改成 `◆ `（`◆ 攻擊 → 絲嘉蕾`）。
   - **選單游標的後備**：`.slx-sel::before` 在沒有游標美術時改 `content: '→'`，12px。有美術（`.slx-skinned`）時照舊。
   - **能力分類的展開記號**：`→` 收合、`↓` 展開。
   - **數量視窗的提示**：改三行，`←→ ±1`、`↑↓ ±10`、`點數字 決定`。
5. **設計者裁定：Pixi 文字**。
   - **唯一入口**：全部經過 `render/pixelText.ts` 的 `pixelText()`。規格是 Cubic 11、12 或 24px、normal；描邊在 12px 用 2、24px 用 4。
   - **字級對應**：

     | 文字 | 原本 | 改成 |
     |------|------|------|
     | 敵人名字 | 14 | 12 |
     | 意圖 | 12 | 12 |
     | 狀態字 | 11 | 12 |
     | 一般／弱點／暴擊／抗性的傷害數字 | 22–36 | 24 |
     | 小數字 | 22 | 12 |
     | 標籤 | 14 | 12 |

   - **暴擊仍然最醒目**：橘色、`暴擊！` 標籤，動畫放大 1.9 倍。
   - **整數像素**：`createFixedApp` 加 `roundPixels: true`。
   - **寬度估算**：`ailmentStyle.textWidth` 改用 Cubic 11 的寬度。漢字 13/12 em，其他 8/12 em。
6. **設計者裁定：狀態頁的「寬頁」**（技能樹、天賦兩頁）。
   - **作法**：這兩頁在場景根節點加 `slx-status-wide`。面板 `left` 從 250 改 10px、`bottom` 從 40 改 52px；立繪區 `visibility: hidden`。
   - **效果**：內容寬約從 348 變成 588px。五欄技能樹每欄約從 66 變成 114px，六欄天賦約從 56 變成 96px。
   - **其他分頁照舊**：能力、裝備、技能、絕技保留立繪。只有在 844 的既有測試失敗時，才把能力或技能分頁加進寬頁，並在報告寫明。
7. **設計者裁定：隊伍欄維持 62px 高**。
   - **調整**：
     - `.slx-pm-name` 行高 14。
     - `.slx-pm-num`、`.slx-pm-tp` 12/12。
     - `.slx-pm-body` 的 `gap` 改 0。
     - `.slx-pm-row` 12/12、`padding: 0 1px`。
   - **估算**：14+12+4+12+4+4＝50，加 padding 6、邊框 2＝58 ≤ 62。
   - **狀態字**：`.slx-ail`、`.slx-mech`、`.slx-pm-cue` 12/12，放不下的照舊折成「+N」。`.slx-pm-miss` 改 12。
8. **設計者裁定：其他版面**（只在測試證明放不下時才動）。
   - **強化標記**：`.slx-enh` 12/12，留在右下角。
   - **地城**：`.slx-keyhint` 12/14，`.slx-weight` 的 `bottom` 改 84px。
   - **傳送門卡片**：名字與註記 12（行高 14）。仍然超出時，`.slx-portal-art` 高 32→24px（只是裁切不同，圖檔不動）。
   - **工坊**：插槽列在 844 溢出時，插槽欄 148→160px、卡片 `right` 168→180px。
   - **置中的視窗**：`.slx-confirm`、`.slx-layer.slx-confirm`、`.slx-result`、`.slx-settings`、`.slx-keys`、`.slx-clear-card`、`.slx-title-menu`、`.slx-depths`、`.slx-event` 改用 `translate: round(down, -50%, 1px) …`，不在半像素上。
   - **選目標的箭頭**：`.slx-target` 的 ▼ 上下動畫改 `steps(2)`，只停在整數 px。
9. **設計者裁定：等字型**。`ui2/fonts.ts` 的 `loadPixelFont()` 在 `mountNext` 與選單美術的預載一起等（`Promise.all`），最多 3000ms。逾時或失敗就回傳 `false`，遊戲照常開始。
10. **最危險的畫面**，依序：
    1. 狀態頁的技能樹與天賦。
    2. 戰鬥的隊伍欄與敵人狀態列。
    3. 工坊。
    4. 裝備。
    5. 傳送門卡片。

    建議配點畫面風險最低。

## Global Constraints

- SCSS 只放 `src/styles/`。禁 `!important`；禁行內樣式，包括 JS 設 `el.style.*` 或 `setProperty`。
- 每個畫面在 1280×720、844×390、390×844（觸控直拿，側置）都不溢出、不裁切、沒有水平捲動。
- **全域 e2e 守門**：
  - 文字只有 12px、24px，粗細 400，第一字型是 Cubic 11，而且 CDP 回報實際使用的平台字型只有 Cubic 11。
  - 舞台倍率 s 符合裁定 1／2 的 `expectedMode`：`s·d` 是整數；或是 d ≥ 2 時、沒有 s ≥ 1 的整數裝置倍率可用，s = 1；或是 d 不在清單裡，s 是整數。
- **不改遊戲邏輯**；`engine/` 不動。
  - 戰鬥閘門在 Task 0、1、4、7 各跑一次。每次都要 `gate: identical`（Task 0 除外），而且 `cmp <gate>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
  - 不覆寫 `engine/__fixtures__/`。
- 像素美術維持 `image-rendering: pixelated`；`public/assets/` 一個檔案都不改；不換字型；不畫任何幾何佔位圖示（AGENTS.md）。
- **測試指令**：
  - vitest 單檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`。
  - vitest 全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
  - tsc：`rtk proxy npx tsc --noEmit -p .`。全 repo 總數不可以多於基準 773；`src/scripts/games/starlantern/`、`tests/e2e/starlantern*.ts` 底下必須是 0 個。
  - e2e：`E2E_PORT=4352 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。Task 2a 起，再加跑 `--project=chromium-dpr125 --project=chromium-dpr150`。
  - e2e 一律 headless（絕不加 `--headed`）、靜音。只用 4352，絕不用 4354，不結束任何程序。
- **重的工作（閘門、e2e、全套）之前**：
  - PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` 必須 ≥ 6291456（KB），不足就等。
  - 拿鎖 `C:\msys64\tmp\claude\C--Users-bag57\2c248522-7150-4161-8ef7-00e1a1e771a9\scratchpad\heavy.lock`：`(set -o noclobber; echo "legibility Task <N> $(date -Is)" > <鎖>)`。已存在就等；跑完立刻刪。
- **換行**：
  - 改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat`。整檔被改寫就是換行壞了。
  - LF：`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`、`playwright.config.ts`、`render/ailmentStyle.ts`、`render/MapView.test.ts`、`ui2/stage.ts`、`ui2/scenes/{builds,equip,settings,settings.test,statusTabs,workshop}.ts`。
  - CRLF：`src/pages/games/starlantern.astro`、`ui2/scenes/status.ts`。
  - 混用（新行照相鄰行）：`data/text.zh-TW.ts`、`render/{BattleView,BattleView.test,MapView,app}.ts`、`ui2/{main,input,partyBar,partyBar.test,widgets,widgets.test}.ts`。
  - 新檔一律 LF。CRLF 與混用檔不可以用 `sed -i`。
- **git**：
  - 用完整路徑 add，不可以 `git add -A`／`git add .`。
  - Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
  - 不可以 `git checkout`、`restore`、`reset`、`stash`、`clean`；要撤回就再改一次檔案。不 push。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：
  - 既有測試只在它釘的正是本計畫改掉的值時才改：字級、箭頭字、縮放倍率、390 的螢幕座標、由螢幕寬推算的倍率。
  - 改法是換成新值，或換成舞台座標（`stageBox`／`stageScale`）。不可以放寬門檻、刪斷言或加 `skip`。
  - 每一個被改的既有斷言都列在報告。
- **收尾 G（每個任務）**：
  1. 全套全綠，tsc 符合條件。
  2. 動到 `ui2/`、`render/`、`src/styles/`、`tests/e2e/`、`playwright.config.ts` 就跑 e2e（Task 2a 起含兩個 DPR 專案），必須全綠。
  3. 有畫面的任務，用 `SL_SHOTS=<SDD>/shots-task<N>` 跑一次 Task 0 的巡檢，截圖留在 SDD。
  4. 報告：新增與修改的測試名、全套兩行、tsc 數字、e2e 結果、偏離本計畫的地方與理由。

## Review Focus

1. **125%／150% 的 Windows 縮放與瀏覽器縮放**：舞台每個像素應該是整數個裝置像素，字不糊。→ Task 2a：`expectedMode` 尺寸表，在 `chromium-dpr125`、`chromium-dpr150` 專案各跑一次。
2. **手機橫拿、工具列吃掉高度（844×340）**，以及奇數尺寸的視窗（1281×721、1919×1081）：應該不縮小、左上角對齊 1/d px、只在舞台超出時才捲動。→ Task 2a 的尺寸表。
3. **全螢幕**：按下全螢幕後，舞台倍率依新的視窗重算、字仍清楚。→ Task 2a `fullscreen keeps the whole-pixel scale`。
4. **側置時用方向鍵在技能樹往下走**（2× 也一樣）：游標那一列一直完整可見。→ Task 2a 的 `stageSpan` 單元測試與 `status.test.ts` 新案例；Task 2b 的觸控側置 e2e。
5. **字型被擋或很慢、最長的字串**：標題照樣在 3.5 秒內出現；四隻敵人各帶 5 種狀態、HP 9999 的五人隊伍欄、最長的裝備名稱，都折成「+N」或省略號，不溢出。→ Task 4 的 `loadPixelFont` 逾時、慢字型 e2e、`ailment rows of four enemies…`、`the party bar shows every line whole at 12px`；Task 7 的巡檢含最長裝備名。

---

## 檔案結構

**新增**：
- `data/woff2Cmap.ts`（＋`.test.ts`）：讀 WOFF2 的 cmap，只被測試匯入。
- `data/glyphs.test.ts`：玩家看得到的每一個非 ASCII 字都在 Cubic 11 裡。
- `ui2/stageAxis.ts`（＋`.test.ts`）：把螢幕上的矩形換成舞台座標的上下緣。
- `ui2/typeScale.test.ts`：編譯後 CSS 的靜態守門。
- `ui2/fonts.ts`（＋`.test.ts`）：等 Cubic 11。
- `render/pixelText.ts`（＋`.test.ts`）：所有 Pixi 文字的唯一入口。
- `render/app.test.ts`：確認 Pixi 以整數像素繪製。
- `tests/e2e/starlantern-legibility.ts`：e2e 的量測、守門、手機模擬與巡檢函式。

**修改**：
- `src/styles/_starlantern-ui.scss`（全部任務）。
- `playwright.config.ts`（Task 2a）。
- `tests/e2e/starlantern.spec.ts`（Task 0、2a、2b、4–7）。
- `render/{BattleView,MapView,app,ailmentStyle}.ts`。
- `ui2/{main,partyBar,widgets}.ts`。
- `ui2/scenes/{settings,status,statusTabs,equip,workshop,builds}.ts`。
- `data/text.zh-TW.ts`。

---

### Task 0：基準與巡檢骨架

**Files:**
- Modify: `ui2/main.ts`（debug 加 `go`）
- Modify: `tests/e2e/starlantern-legibility.ts`（新檔）
- Modify: `tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Produces:
  - `__starlanternDebug.go(name: SceneName, arg?: string): Promise<void>`：直接呼叫 `router.go`，只給測試用，不改任何遊戲狀態。
  - `SWEEP: { name: string; visit(page: Page, w: SpecHelpers): Promise<void> }[]`：巡檢的畫面清單。
  - `sweep(page, sizes, onScreen)`：依序走過每一個畫面並呼叫 `onScreen`。

- [ ] **Step 1：基準**
  - `git status` 乾淨；`git rev-parse HEAD` 記在 SDD 的 `baseline.md`；tsc 總數也記在那裡。
  - 記憶體與鎖之後跑 `rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-23-starlantern-legibility/gate-0 > .superpowers/sdd/2026-10-23-starlantern-legibility/gate-0.stdout`。
    - 最後一行可以是 `DIFFERENT`，但 vitest 必須通過。
    - `cmp gate-0/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 必須沒有輸出；有輸出就停下來回報 BLOCKED。
  - e2e 跑一次，把通過數與失敗的測試名記在 `baseline.md`。
- [ ] **Step 2：寫巡檢**
  - 新測試 `screen sweep (legibility Task 0)`，tag `@sweep`。它對 1280×720、844×390、390×844 各走一遍 `SWEEP`。
  - `SL_SHOTS` 有設時，存 `<SL_SHOTS>/<畫面>-<寬>x<高>.png`。本任務的巡檢只截圖、不做斷言。
  - `SWEEP` 的畫面：
    - **用 `go` 進入**：標題、城鎮、公會、商店購買（含比較）、商店素材頁、旅店、傳送門卡片、深度、鍛造（強化、重鑄、製作）、設定、按鍵說明、編隊、狀態六個分頁、裝備、圖鑑、工坊、建議配點。
    - **照 spec 既有的 `setup`／`depart`／遇敵寫法**：地城、地城選單、戰鬥指令、技能清單、選目標、結算。
    - **事件房、結局**：spec 已有進入方法才加，沒有就在報告寫明。
    - **最長字串**：商店清單與鍛造清單各放一件名字最長的裝備（含 +n 與稀有度字）。
- [ ] **Step 3：前後對照的基準截圖**
  - 執行 `SL_SHOTS=.superpowers/sdd/2026-10-23-starlantern-legibility/review/before E2E_PORT=4352 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium --grep @sweep`。
  - 這時 390×844 仍是舊的 0.6× 縮小，這正是要對照的「改之前」。
- [ ] **Step 4：收尾 G，commit**：`test(starlantern): a screen sweep and its before shots for the legibility work`。

---

### Task 1：缺字守門與箭頭

**Files:**
- Create: `data/woff2Cmap.ts`、`data/woff2Cmap.test.ts`、`data/glyphs.test.ts`
- Modify：

  | 檔案 | 位置 |
  |------|------|
  | `render/BattleView.ts` | :450 |
  | `render/BattleView.test.ts` | :294 |
  | `ui2/widgets.ts` | :258-261 |
  | `ui2/scenes/settings.ts` | :46-49 |
  | `ui2/scenes/status.ts` | :52 |
  | `ui2/scenes/equip.ts` | :456-458 |
  | `ui2/scenes/workshop.ts` | :360-362 |
  | `ui2/scenes/builds.ts` | :307-309 |
  | `data/text.zh-TW.ts` | :609-610 |
  | `src/styles/_starlantern-ui.scss` | :67、:558-559 |

**Interfaces:**
- Produces: `woff2Cmap(bytes: Uint8Array, brotliDecompress: (b: Uint8Array) => Uint8Array): Set<number>`，回傳字型裡有對應字形的 code point。

- [ ] **Step 1：寫失敗的測試**（兩個新檔都 `// @vitest-environment node`；字型路徑 `public/assets/fonts/cubic-11/Cubic_11.woff2`，用 `zlib.brotliDecompressSync`）
  - `woff2Cmap.test.ts` › `reads Cubic 11's cmap`：
    - 大小是 10268（fontTools 量到的值）。
    - 包含 星 U+661F、A、▲、▼、←、→、↓、◆。
    - 不包含 ▶、◀、▸、▾。
  - `woff2Cmap.test.ts` › `rejects bytes that are not WOFF2`：開頭不是 `wOF2` 就丟出錯誤。
  - `glyphs.test.ts` › `every character the player can see is in Cubic 11`：
    - 來源：`data/`、`ui2/`、`engine/`、`render/`、`ui/`、`audio/` 底下所有非 `.test.ts` 的 `.ts`，加上 `src/pages/games/starlantern*.astro` 與 `src/styles/_starlantern-ui.scss`。走訪方式照 `data/terms.test.ts` 的 `sourceTexts`。
    - 處理順序：先把 `\uXXXX`、`\u{…}`（TS）和 `\XXXX`（CSS `content`）解碼成字元，再去掉註解（`/\/\*[\s\S]*?\*\/|(?<![:'"\\])\/\/[^\n]*/g`），然後收集 code point > 0x7E 的字。
    - 斷言 `missing` 等於 `[]`，失敗訊息列出 `字 U+XXXX 檔案:行`。
    - 另加一個自我測試：含 `'\u25B6'` 的字串會被抓到。
- [ ] **Step 2：執行，確認失敗的理由正確**
  - `woff2Cmap` 因為模組不存在而失敗。
  - 實作 Step 3 之後，`glyphs.test.ts` 應該剛好因為 ▶◀▸▾ 失敗。多出別的字就停下來回報。
- [ ] **Step 3：實作 `woff2Cmap`**
  - **檔頭**：48 位元組；`numTables` 在 offset 12。
  - **表目錄**：
    - 每筆先是 1 位元組 flags：低 6 位是已知標籤索引（0＝`cmap`，63 表示後面接 4 位元組標籤），高 2 位是轉換版本。
    - 接著是 `origLength`（UIntBase128）。
    - 有轉換時，再一個 `transformLength`：`glyf`／`loca` 版本 0 有轉換；其他表版本非 0 才有。
  - **壓縮資料**：緊接在表目錄之後。解壓後各表依目錄順序緊密相接，沒有補齊。
  - **cmap**：優先用 (3,10) format 12；沒有就用 (3,1) format 4（含 `idRangeOffset`）。`glyphId` 為 0 的不算。
- [ ] **Step 4：換掉箭頭**（裁定 4）
  - `BattleView.showIntents` 的前綴改 `◆ `。`BattleView.test.ts:294` 的期望改成 `'◆ 攻擊 → 絲嘉蕾'`。
  - 文字裡的 ◀▶ 換成 ←→。
  - 數量視窗的提示改三行。
  - `.slx-sel::before` 改 `content: '→'`、12px；`.slx-stat-cat-head::before` 改 `→`，展開時 `↓`。
  - 動手前先 grep e2e 有沒有逐字用到被改的字串。
- [ ] **Step 5：執行**新測試與 `render/BattleView.test.ts`、`ui2/widgets.test.ts`、`ui2/scenes/settings.test.ts`，必須全綠。
- [ ] **Step 6：閘門**
  - `gate-1` 對 `gate-0`，必須 `gate: identical`，並且 cmp 沒有輸出。
  - 理由：`data/text.zh-TW.ts` 也被 engine 匯入。
- [ ] **Step 7：收尾 G，commit**：`fix(starlantern): every character on screen is one Cubic 11 has — the four missing arrows become ←→, ↓ and ◆`。

---

### Task 2a：以裝置像素為準的整數縮放、全螢幕、守門

**Files:**
- Create: `ui2/stageAxis.ts`、`ui2/stageAxis.test.ts`、`ui2/typeScale.test.ts`
- Modify：
  - `src/styles/_starlantern-ui.scss`（:17-50、:416-428）
  - `ui2/main.ts:82`
  - `ui2/scenes/statusTabs.ts:383-388`（`revealIn`）
  - `ui2/scenes/status.test.ts`
  - `ui2/stage.ts:10`（註解）
  - `playwright.config.ts`
  - `tests/e2e/starlantern-legibility.ts`
  - `tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Produces:
  - `stageSpan(r: DOMRectReadOnly, screen: DOMRectReadOnly | null): { top: number; bottom: number }`：`r` 在舞台座標（640×360）的上下緣。
    - `screen` 是 `null` 或寬高為 0：原樣回傳。
    - `screen.width >= screen.height`：`s = screen.width / 640`，`top = (r.top − screen.top) / s`。
    - 側置：`s = screen.width / 360`，`top = (screen.right − r.right) / s`，`bottom = (screen.right − r.left) / s`。
  - e2e 模組：
    - `type StageMode = { kind: 'scale' | 'sideways'; s: number }`。
    - `expectedMode(vw: number, vh: number, d: number, touch: boolean): StageMode`：純函式，照裁定 1／2 計算。
    - `stageScale(page): Promise<StageMode>`：從計算後的矩陣讀出實際值。
    - `stageBox(page, target: Locator): Promise<Rect>`：元素在舞台座標的方框。
    - `legibility(page): Promise<string[]>`：問題清單，空陣列＝通過。
    - `PENDING_SCENES: string[]`。

- [ ] **Step 1：寫失敗的測試**
  - **`stageAxis.test.ts`**：
    - `returns the rect as is with no screen`
    - `divides by the stage scale`：screen `{top:72,width:1024,height:576}`（s 1.6）、r `{top:232,bottom:264}` → `{top:100,bottom:120}`。
    - `reads a sideways screen from its right edge`：screen `{left:15,right:375,top:102,bottom:742,width:360,height:640}`、r `{left:300,right:340}` → `{top:35,bottom:75}`。
  - **`status.test.ts` 新案例** `revealIn scrolls by stage px at 1.6x and sideways (legibility Task 2a)`：把 `.slx-tree-cols` 放進 `.slx-screen`，模擬兩種矩形。`scrollTop` 的變化必須等於舞台 px。既有的 `the cursor or a click scrolls the columns…` 不改，也必須通過。
  - **`typeScale.test.ts`**（node 環境）› `the stage scale is whole device pixels`：用 `sass.compile('src/styles/_starlantern-ui.scss').css` 檢查：
    - `.slx-screen` 的 `transform` 只能是 `scale(var(--slx-s))`，或側置的 `translateX(…) rotate(90deg) scale(var(--slx-s))`。
    - 每一條設 `--slx-s` 的規則：它所在媒體查詢的 resolution 範圍中點 d，與 s 相乘是整數（誤差 1e-4）；沒有 resolution 的規則，s 是整數。
    - CSS 裡沒有 `/(?<![\w-])scale\(\s*\d*\.\d/`（不可以誤抓 `grayscale(`）。
    - 編譯後原樣保留 `round(down,`。
  - **`playwright.config.ts`**：新增 `chromium-dpr125`、`chromium-dpr150`。設定是 `{ ...devices['Desktop Chrome'], deviceScaleFactor: 1.25 | 1.5 }`，`testMatch: /starlantern\.spec\.ts/`，`grep: /@dpr/`。
  - **e2e 尺寸表**：把 `fits a ${w}x${h} window without scrolling`（約 104 行）改寫成 tag `@dpr`。
    - 每一列斷言 `stageScale` 等於 `expectedMode(innerWidth, innerHeight, devicePixelRatio, false)`，以及 `legibility(page)` 回傳 `[]`。
    - 尺寸：`[1280,720]`、`[1366,768]`、`[2560,1440]`、`[1281,721]`、`[1919,1081]`、`[844,390]`、`[844,340]`、`[600,400]`。
    - 在 chromium 是 d 1，在兩個 DPR 專案是 1.25／1.5。
    - 1280×720 的預期值寫死：d1 → 2、d1.25 → 1.6、d1.5 → 2。
  - **e2e 新測試** `fullscreen keeps the whole-pixel scale (legibility Task 2a)`：從設定按「全螢幕」，接著斷言：
    - `document.fullscreenElement === document.documentElement`。
    - `#sl-screen` 的 `transform` 不是 `none`。
    - `legibility(page)` 回傳 `[]`。
  - **spec 最上層**：加 `test.afterEach(async ({ page }, info) => { expect(await legibility(page, { fontBlocked: info.annotations.some((a) => a.type === 'font-blocked') })).toEqual([]); })`。
  - **既有字型測試**：`uses the pixel font and still renders when it fails to load` 加註記 `font-blocked`。
- [ ] **Step 2：實作 `legibility.ts`**（本任務的部分）
  - **跳過**：沒有 `#sl-screen`，或 `#sl-ui` 的 `data-ready` 不是 `true`，就回傳 `[]`。
  - **倍率**：`getComputedStyle('#sl-screen').transform` 的矩陣，必須等於 `expectedMode(innerWidth, innerHeight, devicePixelRatio, matchMedia('(pointer: coarse)').matches)`。
  - **原點**：沒有進行中的動畫時，`#sl-screen` 方框的 x、y 乘以 d 是整數。
  - **捲動**：
    - 舞台方框在視窗內時：`scrollWidth ≤ innerWidth`、`scrollHeight ≤ innerHeight`。
    - 超出時：捲動量 ≤ 舞台超出的量（無條件進位）。
  - **文字**：目前場景根節點的第二個 class 在 `PENDING_SCENES` 裡就跳過。量測前最多等 500ms，讓次數有限的動畫跑完。
    - `#sl-screen` 裡每一個可見、非空白的文字節點，以及 `::before`／`::after` 的文字內容，必須同時符合：
      - 計算後的字級 `12px` 或 `24px`。
      - `font-weight` 400。
      - `font-family` 第一個是 Cubic 11。
      - 行高減字級 ≥ 0 且是偶數。
    - 裁定 8 的置中視窗，左上角在舞台的整數 px。
  - **實際字型**（只在 chromium，而且 `fontBlocked` 不為真）：
    - 用 `page.context().newCDPSession(page)`，啟用 `DOM`、`CSS`。
    - 對每一個帶直接文字子節點的元素，呼叫 `CSS.getPlatformFontsForNode`。回報的每一個 `familyName` 必須是 `Cubic 11`。
    - 這同時抓到「缺字落到後備字型」和「字型沒載入」。
  - **`PENDING_SCENES` 初值**：`['slx-title','slx-town','slx-facility','slx-settings-scene','slx-formation-scene','slx-clear','slx-dungeon','slx-battle','slx-status-scene','slx-equip-scene','slx-workshop','slx-builds']`。
  - **注意**：實際字型的檢查不受 `PENDING_SCENES` 影響。
- [ ] **Step 3：執行**，確認失敗的理由是舊的縮放：DPR 下的小數裝置倍率、半像素原點、全螢幕的 `transform: none`。
- [ ] **Step 4：實作**（裁定 1）
  - **SCSS**：
    - 刪掉 `$slx-steps` 迴圈。`.slx-body` 不再用 grid。
    - `.slx-screen` 改成：`position: absolute; transform-origin: 0 0; transform: scale(var(--slx-s)); --slx-s: 1; --slx-px: 1px`。
    - `left`／`top`：先寫一條 `max(0px, calc(…))` 當後備，再寫 `round()` 版。
    - 整數後備：`@each $k in 2…6`，查詢 `(min-width: 640k) and (min-height: 360k)`，設定 `--slx-s: k`。
    - 已知 d：雙層 `@each` 產生「d × K」的查詢，寫在整數後備之後。
    - `html:has(.slx-body), .slx-body` 平時維持 `overflow: hidden`。在 `(max-width: 639px), (max-height: 359px)`，以及 K = 0 的情況改 `overflow: auto`。
  - **全螢幕**：`ui2/main.ts:82` 改成 `toggleFullscreen(document.documentElement)`。
  - **`revealIn`**：改用 `stageSpan`，`screen` 取 `pane.closest('.slx-screen')` 的矩形。
  - **註解**：`ui2/stage.ts` 的註解改成以裝置像素為準的整數倍。
- [ ] **Step 5：執行**三個 vitest 檔，再跑三個 e2e 專案。
  - 這時 390×844 的既有斷言仍在桌面情境，會變成 1× 加捲動；Task 2b 才處理。
  - 這些失敗必須正好是 Task 2b 清單裡的位置，並記在報告。除此之外的失敗都要修好。
- [ ] **Step 6：收尾 G，commit**：`feat(starlantern): the stage scales by whole device pixels, at 125% and 150% too, and in fullscreen`。

---

### Task 2b：觸控直拿的側置版面與 390×844 的測試搬家

**Files:**
- Modify: `src/styles/_starlantern-ui.scss`（側置、轉向提示）
- Modify: `tests/e2e/starlantern-legibility.ts`
- Modify: `tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Produces:
  - `asPhone(page, { width = 390, height = 844, dpr = 3 } = {})`：模擬觸控手機。
  - `asDesktop(page, width, height)`：回到桌面。

- [ ] **Step 1：模擬手機的探測**
  - 一次性的探測：用 CDP 開啟 `Emulation.setDeviceMetricsOverride({ width, height, deviceScaleFactor: dpr, mobile: true })` 與 `Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 5 })`，再讀 `matchMedia('(pointer: coarse)').matches`、`devicePixelRatio`、`innerWidth`。
  - **三者都對**：`asPhone`／`asDesktop` 用這個作法，`asDesktop` 用 `clearDeviceMetricsOverride` 加關掉觸控。
  - **任何一個不對**：`asPhone` 改成開新的 context（`browser.newContext({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true })`），把下面每一處 390 的段落搬到使用該 context 的新測試，前面的準備步驟照抄。
  - 探測結果與選用的作法寫在報告；探測檔用完就刪。
- [ ] **Step 2：寫失敗的測試**
  - 尺寸表加兩列，用 `asPhone`：
    - `390×844 touch` → 側置 s 1、舞台 360×640、`y ≥ 40`、提示的 `content` 是「請橫拿手機遊玩」、字級 12px。
    - `412×915@2.625 touch` → 側置 s = 3/2.625。
  - 再加一列 `390×844` 非觸控 → 一般 s 1、可以水平捲動。
  - e2e 新測試 `on a sideways phone the tree keeps the cursor's node whole while it walks down (legibility Task 2b)`：打開諾艾爾的技能樹，連按 ↓ 到最後一個節點。每一步 `stageBox` 的游標列都在欄的可見範圍內，要扣掉釘住的分支名。
  - **搬家清單**（每一處的 `setViewportSize({ width: 390, height: 844 })` 改用 `asPhone`；由螢幕推算倍率或比較上下位置的量測改用 `stageBox`／`stageScale`）：

    | 約略行號 | 測試 |
    |---------|------|
    | 74–95 | `story portraits fit a 390x844 phone…`（:87 的 `k = width / 640`） |
    | 104 | 尺寸表（本任務新增的觸控列） |
    | 1039、1051、1059、1094 | `the tree shows pairs and swaps a side (plan 8d)` |
    | 1350、1403 | `bobby's and the hero's trees show their new nodes…` |
    | 2262 | `ailments show as coloured words on the battle screen (plan 8b)` |
    | 2373 | `heat and the mark show on the battle screen (plan 8c)` |
    | 2529 | `coins and aim show on the battle screen (plan 8c)` |
    | 2586 | `embers and the beat show on the battle screen (plan 8c)` |
    | 2663 | `devices and the echo command show on the battle screen (plan 8c)` |
    | 2886 | `two start, meet Selene, recall her` |
    | 3524 | `the depth scenes read inside the box, desktop and phone (story depth)` |
    | 3626、3642 | `the first boss names its rune on the result, once, inside a phone screen (plan 8f)` |
    | 3691 | `the shop sells and buys runes (plan 8f)` |
    | 3736 | `the forge fuses three runes into one (plan 8f)` |
    | 3801 | `the skill workshop sockets a rune, after showing what it changes (plan 8g)` |
    | 3850 | `the workshop card stays inside the stage at its fullest (plan 8g)` |
    | 3905 | `the workshop moves a rune between members, by mouse (plan 8g)` |
    | 3957、3974 | `the status page: columns line up across categories…` |
    | 4033 | `the workshop tells the rune tutorial to a player who already holds runes (plan 8g)` |
    | 4091 | `a skill with three runes and a reason in place of its TP fits the battle menu at 390 (plan 8g)` |
    | 4126 | `the suggested builds (plan 8h)` 的 `sizes` |
    | 4232 | `auto fights a round by each member's build (plan 8h)` |

  - **由螢幕推算倍率的位置**：:1669（`box.height / offsetHeight`）、:1914、:2011、:2179、:3216（`width / 640`）一律改用 `stageScale`／`stageBox`。它們在側置或小數 s 時都會算錯。
  - **其他螢幕座標的比較**：:371 的 `below`、:1462-1478 的捲動算式、:2104-2109、:3762、:4109。只要會在 `asPhone` 之後執行，就改用 `stageBox`。
- [ ] **Step 3：執行**，失敗的理由是側置還不存在。
- [ ] **Step 4：實作 SCSS**（裁定 2）
  - 側置查詢 `(orientation: portrait) and (max-width: 639px) and (pointer: coarse)`。
  - 倍率規則和一般一樣，但寬高對調；上方保留 40px。
  - 轉向提示改用同一個查詢，文字「請橫拿手機遊玩」，`12px/16px`。
- [ ] **Step 5：執行**全套與三個 e2e 專案，必須全綠。照〈測試修改規則〉，門檻都不變。
- [ ] **Step 6：收尾 G（截圖含側置），commit**：`feat(starlantern): a touch phone held upright shows the stage turned at whole device pixels`。

---

### Task 3：字級守門＋選單、設施、標題、設定、編隊、結局

**Files:**
- Modify: `ui2/typeScale.test.ts`
- Modify: `tests/e2e/starlantern-legibility.ts`（`PENDING_SCENES`）
- Modify: `src/styles/_starlantern-ui.scss`（T3 群組）

**Interfaces:**
- Produces:
  - `PENDING: Record<'T4' | 'T5' | 'T6', string[]>`：還沒輪到的規則選擇器，照編譯後 CSS 的原文。
  - `groupOf(selector: string): 'T3' | 'T4' | 'T5' | 'T6'`。

- [ ] **Step 1：寫失敗的測試**
  - **`typeScale.test.ts` › `every declaration keeps the 12/24 type scale`**：
    - 把編譯後的 CSS 用 `/([^{}]+)\{([^{}]*)\}/g` 拆成規則，逐條宣告檢查：
      - `font-size` ∈ {12px, 24px}；`font` 簡寫的字級也一樣。
      - `line-height` 的 px 值 ≥ 12 且是偶數；24px 的規則 ≥ 24。
      - `letter-spacing` 是 0 或正整數 px。
      - `font-weight` 是 `normal` 或 400。
      - 不出現 `!important`。
    - 選擇器在 `PENDING` 裡的規則跳過。
  - **`groupOf`**：
    - 逗號分開的每一段各自找群組，取最早的任務（T3 < T4 < T5 < T6）。
    - 單一段落裡，class token 等於某個前綴、或以「前綴-」開頭就算命中。優先序是 T6 > T5 > T4；都沒命中就是 T3。
    - 前綴：
      - T4：`slx-pm`、`slx-partybar`、`slx-battle`、`slx-bsub`、`slx-bcmd`、`slx-bnote`、`slx-badge`、`slx-result`、`slx-acut`、`sl-cutin`、`slx-ail`、`slx-mech`、`slx-fieldbar`、`slx-msg`、`slx-who`、`slx-target`。
      - T5：`slx-status`、`slx-stat`、`slx-tab`、`slx-tabs`、`slx-tree`、`slx-talent`、`slx-skill`、`slx-field-tag`、`slx-gear-row`、`slx-gear-slot`、`slx-gear-bonus`、`slx-gear-power`、`slx-hb`、`slx-handbook`、`slx-memkey`。
      - T6：`slx-equip`、`slx-bag`、`slx-doll`、`slx-enh`、`slx-slot-tag`、`slx-ws`、`slx-workshop`、`slx-bd`、`slx-builds`。
  - **`PENDING` 的內容**：先讓清單為空跑一次，把印出的違規選擇器依 `groupOf` 放進 T4／T5／T6。T3 的不放進去，本任務要修。
  - **`the pending lists only shrink`**：`PENDING` 裡的每一個選擇器都還存在，而且確實違規；修好了就必須移出。
  - **`PENDING_SCENES`**：移除 `slx-title`、`slx-town`、`slx-facility`、`slx-settings-scene`、`slx-formation-scene`、`slx-clear`。
- [ ] **Step 2：執行**。失敗的只能是 T3 群組的規則，以及在這六個場景結束的 e2e 測試。
- [ ] **Step 3：改 SCSS 的 T3 群組**（裁定 3、8）
  - 檔頭定義 `$slx-fs: 12px; $slx-fs-big: 24px;`，基底字型 `12px/16px`；加上全域粗細規則。
  - **展示字 24px**：
    - 地名、夜晚、logo 後備、結局 h2。
    - 橫幅：`.slx-banner-text`、`-win`、`-condition` 全部 24/28，字距取整數。
  - **其餘**：
    - `.slx-banner-sub` 12/16；`.slx-more`、`.slx-next` 12/12。
    - 地城 HUD 與置中視窗照裁定 8。
    - 奇數行高改成相鄰的偶數。
- [ ] **Step 4：執行** `typeScale.test.ts`、全套、三個 e2e 專案。
  - afterEach 在已解除的場景抓到屬於 T4–T6 群組的元素時，把那條規則提前在本任務改掉（移出 `PENDING`），並在報告寫明。不可以把場景加回 `PENDING_SCENES`。
  - 裁定沒有涵蓋的版面失敗，停下來回報 NEEDS_CONTEXT。
- [ ] **Step 5：收尾 G，commit**：`fix(starlantern): menus, facilities, settings and formation read at 12px and 24px only`。

---

### Task 4：戰鬥、地城、Pixi 文字、等字型

**Files:**
- Create: `render/pixelText.ts`、`render/pixelText.test.ts`、`render/app.test.ts`、`ui2/fonts.ts`、`ui2/fonts.test.ts`
- Modify：
  - `render/BattleView.ts:87-104,234,240,473,678,686`、`render/BattleView.test.ts`
  - `render/MapView.ts:23,186-189`、`render/MapView.test.ts`
  - `render/app.ts`
  - `render/ailmentStyle.ts:28-30`、`render/ailmentStyle.test.ts`
  - `ui2/partyBar.ts:15-16`
  - `ui2/main.ts`
  - `src/styles/_starlantern-ui.scss`（T4 群組、`.slx-target` 的動畫 :307-308）
  - `ui2/typeScale.test.ts`、`tests/e2e/starlantern-legibility.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Produces:
  - `PIXEL_FONT: string[]`：`['Cubic 11', 'Noto Sans TC', 'Microsoft JhengHei', 'sans-serif']`，取代 `MapView` 的 `GLYPH_FONT`。
  - `type PixelSize = 12 | 24`。
  - `pixelText(text: string, size: PixelSize, fill: number, stroke?: number): Text`：`stroke` 預設 `0x000000`，描邊寬 `size / 6`，`fontWeight: 'normal'`。
  - `loadPixelFont(fonts?: Pick<FontFaceSet, 'load'>, timeoutMs?: number): Promise<boolean>`：
    - 預設 `document.fonts`、3000。
    - 載入 `12px "Cubic 11"`，至少一個字面就回傳 `true`。
    - 空陣列、失敗、逾時都回傳 `false`，絕不丟出例外。

- [ ] **Step 1：寫失敗的測試**
  - **`pixelText.test.ts`** › `uses Cubic 11 at 12 or 24 px, normal weight, a 1px or 2px outline`。
  - **`BattleView.test.ts`** › `every text it draws is a pixelText (legibility Task 4)`：
    - 先 `setup` 四隻敵人、`showIntents`、`showAilments`，再用既有測試觸發跳字的公開方法，打出一次暴擊和一次小數字。
    - 走訪 `root` 底下所有 `Text`：字型第一個是 Cubic 11、字級 ∈ {12, 24}、粗細 normal。
    - 暴擊與一般 24、小數字 12、標籤 12。
  - **`BattleView.test.ts`** › `ailment rows of four enemies at 12px stay inside their slots`：四隻敵人各帶 5 種狀態與 2 個機制字。每一列的寬 ≤ `ailmentRowRect(key).width`，放不下的折成「+N」。
  - **`ailmentStyle.test.ts`**：`textWidth('流血×2', 12)` = 42、`textWidth('+3', 12)` = 16。舊比例的兩個斷言改成新值。
  - **`MapView.test.ts`**：地圖記號用 `PIXEL_FONT`、24px、normal。
  - **`render/app.test.ts`** › `asks Pixi for whole-pixel drawing`：`vi.mock('pixi.js')`，`init` 帶 `roundPixels: true`、`resolution: 1`、`antialias: false`。
  - **`fonts.test.ts`**：
    - `true when a face loads`
    - `false when no face matches`
    - `false when loading fails`
    - `false after the timeout`：用假計時器。
  - **e2e**：
    - `legibility()` 加 Pixi 檢查：走訪 `__starlanternDebug.stage` 的 `mapView.root`、`battleView.root`，字型、字級 ∈ {12, 24}、粗細 normal。
    - `PENDING_SCENES` 移除 `slx-dungeon`、`slx-battle`。
    - 新測試 `the party bar shows every line whole at 12px (legibility Task 4)`：
      - 五人，`maxHp`／`hp` 都設成 9999。
      - 在 1280×720 與 844×390：每個 `.slx-pm-body` 的 `scrollHeight ≤ clientHeight`；`.slx-pm-name`、`.slx-pm-num`、`.slx-pm-tp` 的 `scrollWidth ≤ clientWidth + 0.5`。
    - 新測試 `the title still comes when the pixel font is slow`：字型延遲 5 秒，標題在 3.5 秒內出現。這個測試加 `font-blocked` 註記。
- [ ] **Step 2：執行**，每個新測試都因為正確的理由失敗。
- [ ] **Step 3：實作**（裁定 5、7、8、9）
  - `pixelText`。
  - `BattleView` 的 5 處 `new Text` 改用 `pixelText`：`AIL_SIZE` 12、`TAG_SIZE` 12、`popSize` 照裁定 5、`INTENT_H` 14。
  - `MapView` 用 `pixelText(…, 24, fill, 0x14100a)`。
  - `app.ts` 加 `roundPixels: true`。
  - `textWidth` 改用 Cubic 11 的寬度；`partyBar.ts` 的 `ailWordWidth` 用 12。
  - `main.ts` 用 `Promise.all([bank.preload(menuArt), loadPixelFont()])`。
  - SCSS 的 T4 群組照裁定 3、7：
    - `.slx-pm-pop` 系列 24/24。
    - `.sl-cutin__name` 24/28、normal、字距 2px；`.slx-acut-label` 24/28。
    - `.slx-badge` 12、`.slx-result h3` 12。
    - `.slx-target` 改 `animation: slx-bob 0.6s steps(2) infinite alternate`。
  - 把這些選擇器移出 `PENDING.T4`。
- [ ] **Step 4：執行**相關 vitest、全套、三個 e2e 專案。放不下時只照裁定 7 的數字調；仍然放不下就停下來回報 NEEDS_CONTEXT。
- [ ] **Step 5：閘門**：`gate-4` 對 `gate-1`，必須 `identical`，並且 cmp 沒有輸出。
- [ ] **Step 6：收尾 G，commit**：`fix(starlantern): battle and labyrinth text, Pixi included, in Cubic 11 at 12px and 24px; the game waits for the font`。

---

### Task 5：狀態頁與圖鑑（寬頁）

**Files:**
- Modify: `ui2/scenes/status.ts:105-125`（`render`）、`ui2/scenes/status.test.ts`
- Modify: `src/styles/_starlantern-ui.scss`（T5 群組、寬頁）
- Modify: `ui2/typeScale.test.ts`、`tests/e2e/starlantern-legibility.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Produces:
  - `WIDE_TABS: ReadonlySet<string>`，值是 `new Set(['tree', 'talent'])`，export 出來給測試用。
  - 場景根節點在這兩頁有 class `slx-status-wide`。

- [ ] **Step 1：寫失敗的測試**
  - **`status.test.ts`** › `the tree and talent pages take the whole width; the other pages keep the standee (legibility Task 5)`。
  - **e2e**：
    - `PENDING_SCENES` 移除 `slx-status-scene`。
    - 新測試 `on the wide pages every column fits at 12px (legibility Task 5)`：
      - 角色清單照既有的 `no tree node's name wraps or spills, on any member's tree…`。
      - 在 1280×720、844×390、`asPhone`：`.slx-tree-node .slx-skill-name`、`.slx-talent-name` 的 `scrollWidth ≤ clientWidth + 0.5`。
      - 面板的 `stageBox` 和名牌、返回鍵 `apart`。
- [ ] **Step 2：執行**，必須失敗。
- [ ] **Step 3：實作**（裁定 6）
  - `render()` 依目前分頁切換 `slx-status-wide`。
  - SCSS 的寬頁規則。
  - T5 群組改成 12px：
    - 能力表。
    - 技能樹：分支名、節點、頁腳、「二選一」。
    - 天賦：層級欄寬 12→14px。
    - 技能頁、裝備頁的加成、名牌稱號。
  - 刪掉所有負字距。寬頁裡讓 `.slx-talent-per` 重新顯示。
  - 把這些選擇器移出 `PENDING.T5`。
- [ ] **Step 4：執行**相關 vitest、全套、三個 e2e 專案。
  - 仍然溢出時，依序試：寬頁的欄距 4→2px，再試節點左右 padding 2→1px。
  - 還不行就停下來回報 NEEDS_CONTEXT。
- [ ] **Step 5：收尾 G，commit**：`fix(starlantern): the status sheet reads at 12px; the tree and talent pages take the whole width`。

---

### Task 6：裝備、工坊、建議配點

**Files:**
- Modify: `src/styles/_starlantern-ui.scss`（T6 群組）
- Modify: `ui2/typeScale.test.ts`、`tests/e2e/starlantern-legibility.ts`、`tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：寫失敗的測試**
  - `PENDING_SCENES` 移除 `slx-equip-scene`、`slx-workshop`、`slx-builds`。
  - e2e 新測試 `equip, workshop and builds fit at 12px (legibility Task 6)`，在 1280×720、844×390、`asPhone` 檢查：
    - **裝備**：四個視窗、頁首、按鍵提示、返回鍵兩兩 `apart`；強化標記在它的格子裡。
    - **工坊**：三欄與頁尾在舞台內；插槽列的 `.slx-right` 不溢出。
    - **建議配點**：清單與卡片在舞台內。
- [ ] **Step 2：執行**，必須失敗。
- [ ] **Step 3：實作**（裁定 3、8）
  - T6 群組改成 12px：
    - `.slx-enh` 12/12、`.slx-slot-tag` 12/12、`.slx-equip-stats` 12/14。
    - 頁首標題 12。
    - `.slx-ws-*` 12/14。
    - `.slx-bd-title`、`.slx-bd-card-name b` 12。
  - 移出 `PENDING.T6`；這時 `PENDING` 是空的。
  - 工坊溢出時，照裁定 8 加寬插槽欄。
- [ ] **Step 4：執行**全套、三個 e2e 專案。
- [ ] **Step 5：收尾 G，commit**：`fix(starlantern): equipment, the skill workshop and the suggested builds read at 12px`。

---

### Task 7：嚴格巡檢、給使用者的截圖集、收掉清單

**Files:**
- Modify: `ui2/typeScale.test.ts`、`tests/e2e/starlantern-legibility.ts`、`tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：寫失敗的測試**
  - `typeScale.test.ts`：刪掉 `PENDING` 與 `the pending lists only shrink`。
  - `legibility.ts`：刪掉 `PENDING_SCENES`。
  - Task 0 的 `screen sweep`：
    - 改名為 `every main screen reads at 12px and 24px at 1280x720, 844x390 and a phone (legibility Task 7)`。
    - 加上 tag `@dpr`。
    - 每一個畫面都斷言 `legibility(page)` 回傳 `[]`。
    - 390×844 改用 `asPhone`。
- [ ] **Step 2：執行**。失敗代表之前的任務漏了；回到負責的任務修。
- [ ] **Step 3：截圖集**
  - `SL_SHOTS=.superpowers/sdd/2026-10-23-starlantern-legibility/review/after` 跑一次巡檢，三個專案都跑：d1、d1.25、d1.5 各一個子資料夾。
  - 再由巡檢在 `review/` 寫出 `index.html`：
    - 每列一個畫面。
    - 欄位依序：「改之前」（`before/`）、「改之後 d1」、「d1.25」、「d1.5」，三種尺寸都放。
    - 圖片用 `<img>` 的自然大小顯示（不設寬高、不縮放），加 `image-rendering: pixelated`；容器可以水平捲動。
    - 頁首放可點的 `http://localhost:4321/games/starlantern`（專案 CLAUDE.md 規定）。
    - 頁首寫明：側置的觸控捲動方向要在實機（iOS Safari）確認，e2e 驗不到。
- [ ] **Step 4：整體驗收**
  - 全套全綠；tsc 符合條件。
  - 三個 e2e 專案全綠，和 `baseline.md` 相比不可以有新的失敗。
  - `gate-final` 對 `gate-4`：最後一行 `gate: identical`，cmp 沒有輸出。
  - `git diff <基準> --stat -- src/scripts/games/starlantern/engine public/assets` 沒有任何檔案。
  - 報告列出：
    - 每一條設計者裁定實際落地的數字。
    - 裁定 6／8 的後備方案有沒有動用。
    - Task 2b 選用的手機模擬作法。
    - 每一個被改的既有斷言。
    - 沒巡到的畫面。
    - `review/index.html` 的路徑與張數。
    - 「請使用者在 iPhone 實機確認側置的觸控捲動方向」。
- [ ] **Step 5：commit**：`test(starlantern): one sweep reads every main screen at 12/24px and whole device pixels, at 100%, 125% and 150%, on desktop and a phone`。
