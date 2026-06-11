# Dungeon Arcade 階段 4：方塊皮膚系統 + 道具玩法　設計 spec

> 來源：brainstorming（2026-06-10，含視覺陪伴頁實際素材比較，4 風格全數核可）。
> 範圍決策：道具**先進 SOLO + vs-AI**（線上模式道具留待後續階段）；皮膚**等級解鎖**；技能**開局選 1 帶入**＋ SOLO 限定 roguelite 三選一。

## 目標

1. **皮膚系統**：玩家可替換方塊皮膚（5 款），用既有 XP/等級系統解鎖，給線上對戰的升等實質獎勵。
2. **道具玩法**：SOLO 與 vs-AI 加入「充能技能」；SOLO 另加「升級三選一強化」形成 roguelite run，提升單機重玩性。

## 非目標（YAGNI，明確不做）

- ❌ 線上模式（1v1/FFA）道具——需確定性鎖步整合，留待下一階段；本階段引擎接口先確定性化鋪路。
- ❌ SGT 代幣購買皮膚——未來再議，本階段不留資料結構。
- ❌ AI 使用技能——v1 AI 不發動技能，避免 AI 決策工程膨脹。
- ❌ 皮膚影響玩法——皮膚是純視覺，零遊戲性差異。

## 一、皮膚系統

### 1.1 皮膚目錄（5 款）

| id | 名稱 | 解鎖 | 風格 |
|---|---|---|---|
| `neon` | 霓虹（預設） | 人人有 | 現有 block.webp |
| `bit8` | 復古 8-BIT | Lv2 | NES 粗像素＋黑描邊 |
| `rune` | 符文石磚 | Lv4 | 雕刻符文＋苔蘚石磚（RPG 世界觀） |
| `holo` | 全息玻璃 | Lv6 | 虹彩玻璃＋掃描線（CRT 調性） |
| `crystal` | 水晶寶石 | Lv9 | 切面寶石＋內發光（炫耀皮膚） |

等級門檻為常數表，集中一處可調。風格基準圖（brainstorm 產出）：`public/brainstorm/skins/style-*.webp`（正式素材重製後此目錄刪除）。

### 1.2 素材規格

- 每款皮膚＝**一張可平鋪單格貼圖**（與現有 `block.webp` 同尺寸規格，nearest 取樣像素硬邊）。
- 染色：沿用既有「灰階貼圖 × per-piece tint」機制；皮膚可選附**自帶調色盤**（`tints?: Record<PieceType, number>` 覆蓋預設 `pieceTint`，如 8-bit 用 NES 原色、水晶用寶石色）。
- 產出技法沿用：Gemini 產圖 → 亮度→alpha / 平鋪修整 → cwebp。

### 1.3 架構

- **`render/skins.ts`（NEW）**：`SKIN_CATALOG`（id/名稱/解鎖等級/貼圖 URL/可選 tints）、`getSelectedSkin()`/`setSelectedSkin(id)`（localStorage，錢包玩家 key 帶地址：`tetris-skin:<addr>`、訪客 `tetris-skin:guest`）、`isUnlocked(skin, level)` 純函式。
- **`render/assets.ts`（MOD）**：`loadGameTextures(skinId?: string)` —— block 貼圖 URL 由皮膚目錄決定，預設 `neon` 行為與現狀完全一致。
- **`render/layout.ts` 的 `pieceTint`（MOD 最小）**：渲染端取 tint 時先查皮膚調色盤、無則用現有表。
- **皮膚櫃 UI（`tetris.astro` PROFILE 分頁內嵌）**：5 張縮圖卡（已解鎖可點選、未解鎖灰階＋鎖＋「Lv N 解鎖」）；選中即存並即時生效（下一局套用）；訪客顯示「連錢包升級解鎖更多皮膚」。
- **適用範圍**：SOLO/AI/1v1/FFA 全部套用本機選擇的皮膚。皮膚是**本地視覺**，不進鎖步協定、不影響 determinism（線上雙方各看各的皮膚）。

### 1.4 解鎖判定

- 錢包玩家：等級來自 `/api/profile`（既有 progression）。
- 訪客：永遠只有 `neon`（等級綁錢包，與既有系統一致）。
- 防呆：已選皮膚若（換錢包後）未解鎖 → 回退 `neon`。

## 二、道具系統（SOLO + vs-AI）

### 2.1 充能技能（開局選 1 帶入）

開局介面（模式選擇後、遊戲開始前）三~四張技能卡選 1：

| id | 名稱 | 效果 | 適用 |
|---|---|---|---|
| `bomb` | 💣 地城炸彈 | 立即清除盤面最底 2 行，上方方塊整體下移（不計分、不產生攻擊、不算消行事件） | SOLO + AI |
| `slow` | ⏳ 時之沙 | 重力降為 0.3× 持續 10 秒（lock delay 不變） | SOLO + AI |
| `reroll` | 🔄 命運重抽 | 當前方塊＋NEXT 佇列全部重抽（用引擎種子化 RNG，不破壞 7-bag 完整性：重抽=從新 bag 重生成） | SOLO + AI |
| `shield` | 🛡️ 符文護盾 | 抵擋接下來 8 行待入垃圾（先進先抵） | 僅 vs-AI（SOLO 無垃圾不出現此卡） |

### 2.2 能量規則（可調常數集中一處）

- 獲取：1 行=10、2 行=25、3 行=45、4 行=70；combo 每段額外 +5；T-spin 消行 ×1.5。
- 上限 100；滿時技能槽發光＋音效提示；按 **C** 發動、能量歸零重新累積。
- 暫停（ESC）時不可發動；game over/result 後不可發動。

### 2.3 SOLO Roguelite 三選一（僅 SOLO）

- 觸發：每升 1 級（沿用既有每 10 行升級）→ 暫停模擬、彈出三選一強化卡（鍵盤 1/2/3 或點選）。
- 同一局內可疊加；效果只活在該局（不持久化）。
- Perk 池（9 款，每次從未滿級的 perk 隨機抽 3，種子化 RNG）：

| perk | 效果 | 可疊 |
|---|---|---|
| 爆破擴大 | 地城炸彈 +1 行範圍 | ×3 |
| 能量湧流 | 消行能量 +30% | ×3 |
| 分數狂熱 | 全部得分 +25% | ×3 |
| 時間掌控 | 時之沙時長 +5 秒 | ×2 |
| 蓄勢待發 | 立即獲得能量 50 | ×∞（即時型） |
| 輕盈方塊 | 軟降速度 +50% | ×1 |
| 連擊行家 | combo 能量加成 ×2 | ×1 |
| 倖存者 | 升級時若盤面高度 >15 行，清除最底 1 行 | ×1（被動） |
| 開局重抽 | 命運重抽的發動能量需求 -20（100→80→60；能量條上限仍 100） | ×2 |

- 帶入技能相關的 perk（爆破擴大/時間掌控/開局重抽）只在玩家帶了對應技能時出現。

### 2.4 引擎接入（確定性，為未來線上鋪路）

- **`engine/items.ts`（NEW）**：純函式道具操作——`applyBomb(state, rows)`、`applySlow(...)`、`applyReroll(state, rng)`、`applyShield(...)`；全部吃顯式 RNG／參數，**禁 `Math.random()`**（沿用專案鐵則）。
- `TetrisGame`/`TetrisMatch` 不改既有行為；道具經新接口操作（如 `game.applyItem(itemOp)`），1v1/FFA 線上路徑完全不觸碰。
- 能量計算、perk 狀態放 **`engine/run.ts`（NEW）**（SoloRun/AiRun 包裝層：能量、perks、三選一抽卡），渲染層只讀。

### 2.5 UI/UX

- 左側 HUD（HOLD 下方）：垂直能量條＋技能槽（圖示＋`[C]` 鍵提示），mockup 見 brainstorm `mockup-skill-use.webp`。
- 技能發動：對應特效（炸彈=衝擊波環+碎塊飛散、時緩=畫面色調偏移+沙漏粒子、重抽=NEXT 區閃光洗牌、護盾=盤框符文亮起），特效素材黑底 additive→alpha 技法。
- 三選一：暫停遮罩＋三張卡（標題/圖示/描述），鍵盤 1/2/3 快選；reduced-motion 時去動畫。
- 開局技能選擇：模式選擇後插入一步「選擇技能」（卡片式，含「不帶技能」選項——純粹主義者可跳過）。

## 三、美術產出清單

| 素材 | 數量 | 規格 |
|---|---|---|
| 皮膚單格貼圖 | 4（neon 沿用現有） | 與 block.webp 同規格、可平鋪、灰階或自帶色 |
| 技能圖示 | 4 | 透明 webp，風格同既有 icons/ |
| 能量條框＋技能槽框 | 2 | 透明 webp |
| 技能特效素材 | ~4 | 黑底 additive→alpha |
| Perk 卡框＋perk 圖示 | 1＋9 | 透明 webp（圖示可先用既有色塊+字母風格簡化） |

## 四、測試策略

- **純函式單元（vitest）**：skins.ts（目錄/解鎖判定/localStorage key）、items.ts（每個道具操作的盤面前後狀態、確定性：同 seed 同結果）、run.ts（能量數值表、perk 抽卡種子化、疊加上限）。
- **既有零回歸**：1v1/FFA/engine 全套不得動——道具走新檔新接口。
- **e2e（Playwright）**：SOLO 帶炸彈開局→消行充能→按 C→底 2 行被清；升級彈三選一→選 perk→繼續；PROFILE 皮膚櫃顯示鎖定狀態；換皮膚後開局貼圖 URL 變更。
- **手動**：四款皮膚實際觀感、特效爽感、AI 對局帶護盾體感。

## 五、風險與注意

- 皮膚貼圖平鋪接縫：產圖後需驗證單格平鋪無縫（必要時手修邊緣）。
- `loadGameTextures` 簽章變更影響 main/aiMain/netMain/ffaNetMain 四個呼叫點——預設參數保持向後相容。
- 時之沙改重力：實作於 run 包裝層調 gravity 倍率，不改引擎常數，避免影響 1v1/FFA。
- 三選一暫停與既有 ESC 暫停選單的互斥（同時只能一個遮罩）。
- localStorage 在隱私模式可能不可用——try-catch 回退預設皮膚。

## 六、實作順序建議（給 writing-plans）

1. `skins.ts` + `assets.ts` 皮膚參數化（TDD）→ 皮膚櫃 UI → 4 款貼圖產製與接入。
2. `items.ts` 道具純函式（TDD）→ `run.ts` 能量/perk 層（TDD）→ 開局技能選擇 UI → HUD 能量條/技能槽 → 技能特效。
3. 三選一 UI + perk 池 → e2e → 手動驗收 → merge。
