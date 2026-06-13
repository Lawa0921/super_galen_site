# Dungeon Arcade BGM — 設計文件

- **日期**：2026-06-13
- **狀態**：設計（待 review → writing-plans）
- **範圍主題**：用 Gemini key（Lyria 3）生成遊戲 BGM，並整合到 `/games` 街機頁面

---

## 1. 目標

替 `/games`（DUNGEON ARCADE）街機廳與三款遊戲（BATTLE TETRIS / DUNGEON BOMBER / WITCH RUN）加上**背景音樂（BGM）**，音樂用專案既有的 Gemini API key 透過 **Lyria 3** 模型生成。並建立一個可重複使用的 **Gemini 音樂生成 skill**（比照 `nanobanana-image-gen` 的純 Node 包裝模式）。

### 範圍內（In scope）
- 一個 Node skill：`gemini-music-gen`，吃文字 prompt → Lyria 3 → mp3 檔。
- 一個網頁播放器元件：`ArcadeBgm.astro`，預設靜音、右下角 🔊 開關、`localStorage` 記憶。
- 把播放器整合進 `/games` 與三款遊戲頁。
- 4 首 BGM（街機廳 + 三款遊戲各一）。**先交付 skill + 播放器 + 街機廳那首（可驗收里程碑），再補另外 3 首。**

### 範圍外（Out of scope，YAGNI）
- 音效（SFX）：遊戲已用 Web Audio 合成音效，本次不做。
- TTS 語音 / 旁白。
- 即時（runtime）線上生成：本次一律**預先生成、commit 靜態檔**。
- /games 以外頁面（首頁 RPG、guild、blog）的 BGM。

---

## 2. 已確認決策

| 項目 | 決定 |
|---|---|
| BGM 範圍 | 只 `/games` 街機廳 + 三款遊戲 |
| 交付方式 | 預先生成 `.mp3` 靜態檔，commit 進 repo，網頁播本地檔（金鑰不外露、省錢、可離線） |
| 播放 UX | 預設靜音；右下角懸浮 🔊/🔇 開關；點擊才播、可關；`localStorage` 記住 on/off 與音量 |
| skill 範圍 | 只做 BGM 音樂（Lyria 3） |
| 音軌策略 | **方案 A**：每頁主題曲（4 首），共用同一個播放器元件、各頁傳入自己的 track |

---

## 3. 環境前置（已驗證）

- Gemini key 載入鏈（沿用 nanobanana）：`--key` → `process.env.GEMINI_API_KEY` → `~/.gemini/.env`（格式 `GEMINI_API_KEY=…`）。
- 可用音樂模型（已用此 key 列出確認）：
  - `lyria-3-clip-preview` — 「Lyria 3 30s model」，生 30 秒片段，**BGM 預設模型**。
  - `lyria-3-pro-preview` — Pro 版，較高品質，`--model pro` 可選。
- `ffmpeg 6.1.1` + `libmp3lame` 已安裝 → WAV/PCM → mp3 轉檔可行。

---

## 4. 架構與元件

### ① Skill：`gemini-music-gen`

```
.claude/skills/gemini-music-gen/
├── SKILL.md                       # frontmatter + 用法（比照 nanobanana 風格）
└── scripts/
    └── generate-music.mjs         # 純 Node，無第三方相依（用內建 fetch）
```

**職責**：吃一段風格 prompt，呼叫 Lyria 3 取得音訊位元組，用 `ffmpeg` 轉成網頁用 `.mp3`（響度正規化 + 可選無縫循環交叉淡接），輸出到指定路徑。

**指令介面**
```bash
node .claude/skills/gemini-music-gen/scripts/generate-music.mjs \
  "<風格 prompt>" <output-path> \
  [--model clip|pro] [--seed <n>] [--negative "<排除項>"] \
  [--webloop] [--mp3-bitrate 192k] [--gain-normalize] [--keep-wav]
```

- **輸出路徑解析**（比照 nanobanana）：絕對路徑照用；相對路徑從 cwd；裸檔名 → `public/assets/games/bgm/<name>`。
- **預設模型**：`clip`（30s）。`--model pro` 切 Pro。
- **`--webloop`**：把片段尾端與開頭做短交叉淡接，降低循環接縫感（ffmpeg `acrossfade` 或 `afade` 處理）。
- **`--negative`**：排除人聲/歌詞等（Lyria 支援 negative prompt 時帶入；Phase 0 探針確認欄位名）。
- 金鑰缺失、API 錯誤、ffmpeg 缺失 → 清楚錯誤訊息與非零 exit code。

**Lyria 請求形狀**：確切端點（`:predict` vs `:generateContent`）、參數名（prompt / negativePrompt / seed / sampleCount）、回傳音訊編碼（base64 PCM/WAV）於 **Phase 0 可行性探針**確認；設計假設為「單次 REST 呼叫回傳音訊位元組」。探針結果回填進 `generate-music.mjs` 與 `SKILL.md`。

### ② 網頁播放器：`src/components/ArcadeBgm.astro`

**職責**：在頁面右下角放一顆霓虹 🔊/🔇 開關，控制單一 `<audio loop>` 的播放，並記憶偏好。一個自我封裝的元件，對外只有一個 prop。

**介面**
```astro
<ArcadeBgm track="/assets/games/bgm/arcade.mp3" />
```

**行為規格**
- 結構：一顆 `button.arcade-bgm-toggle`（`aria-pressed`、`aria-label`）+ 一個 `<audio loop preload="auto">`（`src = track`）。
- 樣式：吃 /games 街機配色（霓虹青 `#36e6ff`），固定右下角；scoped style，無 inline style、無 `!important`（遵守專案 CSS 規範）。
- **預設靜音/不播**。狀態來源：`localStorage['arcade-bgm']`（`'on'`/`'off'`，預設 `'off'`）與 `localStorage['arcade-bgm-vol']`（0–1，預設 0.5）。
- 點按鈕：在 on/off 間切換，更新 `aria-pressed`、圖示、`localStorage`；播放/暫停時用小段 Web Audio（GainNode）或音量 ramp 做淡入淡出。
- **跨頁延續**：載入時若 `localStorage` 為 `'on'`，嘗試 `audio.play()`；被瀏覽器自動播放政策擋住（reject）時，**捕捉例外、按鈕維持「待點擊」視覺**、不丟 console error。
- 鍵盤可用（button 原生 focus/Enter/Space）。
- 不自動播放有聲音訊（符合瀏覽器政策）。

### ③ 頁面整合

於以下頁面插入 `<ArcadeBgm track=… />`（各自的曲目）：

| 頁面 | track |
|---|---|
| `src/pages/games/index.astro` | `/assets/games/bgm/arcade.mp3` |
| `src/pages/games/tetris.astro` | `/assets/games/bgm/tetris.mp3` |
| `src/pages/games/bomber.astro` | `/assets/games/bgm/bomber.mp3` |
| `src/pages/games/witchrun.astro` | `/assets/games/bgm/witchrun.mp3` |

里程碑切割：第一階段只在 `games/index.astro` 放 `arcade.mp3`；三款遊戲頁於第二階段補上。

### ④ 音軌與風格 prompt（對齊街機/地城霓虹調性）

全部 instrumental、約 30s、可循環、統一音色讓街機感一致。

| 檔名 | 用途 | 風格 prompt 方向 |
|---|---|---|
| `arcade.mp3` | 街機廳首頁 | 上行琶音 synthwave／chiptune，「投幣」期待能量，明亮霓虹 |
| `tetris.mp3` | BATTLE TETRIS | 緊湊推進、4/4 driving bass、解謎腎上腺素 |
| `bomber.mp3` | DUNGEON BOMBER | 地城律動、打擊感、略帶頑皮 |
| `witchrun.mp3` | WITCH RUN | 急促女巫彈幕感、快速琶音、緊張 |

---

## 5. 資料流

```
（離線，開發時跑一次）
風格 prompt ──> generate-music.mjs ──Lyria 3──> 音訊位元組
   ──ffmpeg(轉 mp3 + 正規化 + 可選 webloop)──> public/assets/games/bgm/<name>.mp3 ──> git commit

（線上，使用者瀏覽）
/games 頁 ──> <ArcadeBgm track> ──> <audio loop src=本地 mp3>
   使用者點 🔊 ──> 淡入播放 / 寫 localStorage   ；再點 ──> 淡出暫停
```

無 runtime 對外請求、無金鑰外露。

---

## 6. 錯誤處理與邊界

- **自動播放被擋**：`play()` reject 時靜默處理，按鈕回到 off 視覺，等使用者手勢。
- **音檔缺失（404）**：`<audio>` error 事件 → 按鈕停用或維持 off，不影響頁面其餘功能。
- **localStorage 不可用**（隱私模式）：以記憶體狀態 fallback，預設 off。
- **skill**：金鑰／ffmpeg／API 失敗皆給明確訊息與非零 exit。

---

## 7. 測試（TDD）

- **網頁（Playwright e2e）** `tests/e2e/games-bgm.spec.ts`，先紅後綠：
  1. `/games` 存在 `.arcade-bgm-toggle`，初始 `aria-pressed="false"`，`<audio>` 為 paused。
  2. 點擊 toggle → `aria-pressed="true"`、`localStorage['arcade-bgm']==='on'`、`<audio>` 不再 paused（或已呼叫 play）。
  3. 再點 → 回 off、paused、localStorage 更新。
  4. `<audio>` 的 `src`/`currentSrc` 指向實際存在、可載入的檔（HTTP 200）。
  - 不依賴實際發聲；以 `paused`、`aria-pressed`、`localStorage`、資源回應碼斷言。
- **skill**：`--help` / 缺金鑰 / 缺 ffmpeg 的 dry-run 行為測試（不花錢）；真正生成手動跑、人工挑滿意版本。
- **既有測試**：不得破壞現有 e2e（變更侷限 /games 頁與新元件）。

---

## 8. 實作階段（writing-plans 會細化）

- **Phase 0 — 可行性探針**：用 key 生一段 5–10s 短曲，確認 Lyria 端點/參數/回傳編碼與 ffmpeg 轉檔，回填 API 形狀。**先驗證再展開 skill。**
- **Phase 1 — skill**：完成 `generate-music.mjs` + `SKILL.md`（含 `--webloop`、正規化、錯誤處理）。
- **Phase 2 — 街機廳那首**：生 `arcade.mp3`，人工挑版本。
- **Phase 3 — 播放器 + 整合（含 e2e，TDD）**：`ArcadeBgm.astro` + 放進 `games/index.astro`，先寫紅燈 e2e 再實作到綠燈。
- **Phase 4 — 補三款遊戲曲**：生 `tetris/bomber/witchrun.mp3`，三頁各放 `<ArcadeBgm>`。

每階段結束可獨立驗收。第一個可驗收里程碑 = Phase 0–3。

---

## 9. 檔案清單

**新增**
- `.claude/skills/gemini-music-gen/SKILL.md`
- `.claude/skills/gemini-music-gen/scripts/generate-music.mjs`
- `src/components/ArcadeBgm.astro`
- `public/assets/games/bgm/arcade.mp3`（+ Phase 4：`tetris.mp3`、`bomber.mp3`、`witchrun.mp3`）
- `tests/e2e/games-bgm.spec.ts`

**修改**
- `src/pages/games/index.astro`（+ Phase 4：`tetris.astro`、`bomber.astro`、`witchrun.astro`）

---

## 10. 風險與緩解

| 風險 | 緩解 |
|---|---|
| Lyria 請求形狀與假設不同 | Phase 0 探針先驗證再實作；skill 與 SKILL.md 依探針回填 |
| 30s 片段循環有接縫 | `--webloop` 做交叉淡接；挑律動穩定、首尾相近的版本 |
| mp3 檔過大拖慢載入 | `--mp3-bitrate` 預設 192k、可調；30s 約 0.7MB 級；`preload="auto"` 僅在使用者開啟前不強拉可改 `metadata` |
| Lyria 生成需付費 | 一次性離線生成、commit 靜態檔；不在 runtime 生成 |
| 瀏覽器擋自動播放 | 預設 off + 使用者手勢開啟，本就符合政策 |

---

## 11. 未來延伸（非本次）

- /games 以外頁面的 BGM、SFX skill（Lyria 短音效）、TTS 旁白、runtime 動態生成、音量滑桿 UI。
