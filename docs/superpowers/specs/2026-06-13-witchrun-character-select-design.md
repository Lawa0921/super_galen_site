# Witch Run 選角系統設計

**日期**：2026-06-13
**分支**：`feat/witchrun-character-select`（基於 `feat/witchrun-ui-polish-clean`）
**範圍**：為 `/games/witchrun` 加入 4 位可選角色 + 電影聚光輪播選角介面，角色為「輕度差異」（換皮 + 1–2 項簡單數值微調），不加新彈幕系統。

## 決策（已與使用者確認）

- 角色性質：**輕度差異**（以換皮為主，每角少量既有旋鈕數值微調）。
- 陣容：**4 位原創鐘塔魔女**（含現有 Mira），不同魔法流派。
- 選角 UI：**電影聚光輪播**（中央大立繪、左右切換、鐘塔背景 + 流派色光暈、數值條）。
- 視覺**盡量用真實素材**（nanobanana 產立繪/sprite），非純 CSS 形狀。

## 一、角色陣容

只使用既有引擎旋鈕（`speedMult`／`startLives`／`startBombs`／`startPower`），±1 或小倍率，每位有強處＋反制，無新彈幕系統。

| id | 名稱 | 流派 | speedMult | lives | bombs | power | 定位 | 流派色 |
|----|------|------|-----------|-------|-------|-------|------|--------|
| `mira` | Mira | 爆炎 Inferno | 1.00 | 3 | 3 | 1 | 平衡（預設） | `#ff5a4d` |
| `gale` | Gale | 疾風 Gale | 1.18 | 3 | 2 | 1 | 高機動，少 1 炸 | `#36e6ff` |
| `frost` | Frost | 冰霜 Frost | 0.88 | 4 | 3 | 1 | 高續航，移速慢 | `#a8d8ff` |
| `volt` | Volt | 雷光 Volt | 1.00 | 2 | 2 | 2 | 高火力起手，脆 | `#d0baff` |

- `mira` 為預設，沿用現有 `player.png` 與基準數值（=現行行為，回歸安全）。
- 選角畫面數值條 SPD/LIFE/PWR 由實際數值換算填格（非寫死）。

## 二、引擎架構

- **新 `engine/characters.ts`**：
  - `export type CharacterId = 'mira' | 'gale' | 'frost' | 'volt';`
  - `export interface CharacterDef { id; name; school; speedMult; startLives; startBombs; startPower; color; }`
  - `export const CHARACTERS: Record<CharacterId, CharacterDef>`（純資料表）。
  - `export const DEFAULT_CHARACTER: CharacterId = 'mira';`
- **`WitchOptions`** 加 `character?: CharacterId`（預設 `mira`）。
- **`player.ts` `makePlayer(def)`**：用 `def.startLives/startBombs/startPower` 取代直接吃常數（`mira` 的值＝現有常數，行為不變）。
- **速度**：`movePlayer` 已收 `speedMult`；`game.ts` 計算有效速度時把 `characterDef.speedMult` 併入既有 relic `speedMult`（相乘）。
- `hitPlayer` 等其餘邏輯不變（Volt 起始 power 2，死亡照常 -1）。

## 三、渲染

- **`assets.ts`**：`loadWitchTextures(renderer, characterId)` 依選中角色把對應 sprite 設為 `tex.player`。Mira 用現有 `player.png`；其餘 `player-gale.png`/`player-frost.png`/`player-volt.png`。
- **自機彈**：`playerBullet` 光點 tint 改用該角色 `color`（流派色），增強辨識與一致性。
- EntityView 不變（仍讀 `tex.player`）。

## 四、選角介面（DOM/CSS + 頁內 script）

流程：Title `START` → **選角畫面** → 遊戲開始。

- **DOM**：`witchrun.astro` 加 `#witch-select` overlay：鐘塔背景層 + 流派色光暈、中央大立繪 `<img>`、左右 `◄ ►` 鈕、名稱/流派、SPD/LIFE/PWR 三條、`● ○ ○ ○` 指示點、`START` 鈕。
- **互動**：左右箭頭/鍵盤 ←→ 切換角色；切換時更新立繪、名稱、數值條、光暈色；Enter 或點 START 確認；觸控點箭頭/左右滑動。
- **持久化**：`localStorage` key `witchrun-character` 記住上次選擇；進選角畫面預設停在上次的角色。
- **流程整合**：
  - Title `START` → 顯示 `#witch-select`（不直接開遊戲）。
  - 選角 `START` → 隱藏 select → 以選定 `characterId` 呼叫 `startWitchrun(canvas, { character })`。
  - `?autostart=1`（e2e/深連結）：**跳過選角**，用 `localStorage` 或預設 `mira` 直接開局 → 不破壞既有 e2e。
- **樣式**：沿用 polish 的活背景/餘燼語言；選角畫面 z-index 介於 title 與遊戲之間；尊重 `prefers-reduced-motion`；桌機/375–390px 皆驗。

## 五、素材（nanobanana-image-gen，洋紅 chroma key 去背沿用既有管線）

- 3 張新像素自機 sprite：`player-gale.png`、`player-frost.png`、`player-volt.png`（比照 `player.png` 尺寸/像素硬邊；Mira 沿用）。
- 4 張角色立繪：`portrait-mira/gale/frost/volt.webp`（選角畫面用，哥德像素繪本風、各自流派配色）。
- 選角背景重用 `card-witchrun.webp` + CSS 流派色光暈，不另產 bg。
- 路徑：`public/assets/games/witchrun/`。

## 六、測試

- **TDD（engine）**：`characters.test.ts`——
  - `CHARACTERS` 四角齊備、`mira` 數值＝現有常數（回歸保護）。
  - `makePlayer(CHARACTERS[id])` 起始 lives/bombs/power 正確（含 Volt power=2、Frost lives=4、Gale bombs=2）。
  - 速度倍率：角色 speedMult 與 relic speedMult 相乘生效。
- **E2E（`witchrun.spec.ts` 擴充）**：
  - Title START → `#witch-select` 出現；←→ 可切換；選定後開局，`__witchDebug.game.getState()` 反映該角起始值（如 Frost lives=4）。
  - `?autostart=1` 仍直接開局且 status=playing（不經選角）。
- **視覺**：選角畫面（桌機/Pixel5/375px）+ 4 角色 in-game sprite 截圖，0 console error。

## 七、不做（YAGNI）

- 不加新彈幕/射擊系統、不加角色專屬遺物或必殺。
- 不做等級/解鎖/SGT 購買（全角色一開始可選）。
- 不改既有關卡/Boss/平衡（除角色起始值）。
- 不動其他 arcade 遊戲或全站樣式。

## 八、實作順序

1. `characters.ts` + `characters.test.ts`（TDD，純資料 + makePlayer 改造）。
2. `WitchOptions.character` 串接 + 速度倍率併入（engine 測試綠）。
3. 產素材（3 sprite + 4 立繪）。
4. `assets.ts` 依角色載 sprite + 子彈 tint。
5. 選角 UI（DOM/CSS/script）+ start 流程整合 + localStorage。
6. E2E 擴充 + 視覺截圖。

## 全域驗收

- engine unit（含新測試）全綠、`witchrun.spec.ts` + games-hall e2e 全綠、`npm run build` 成功。
- 選角畫面 production 截圖（桌機/Pixel5/375px）+ 各角色 in-game，0 console/page error。
- 4321 驗收 URL：`http://localhost:4321/games/witchrun`。
