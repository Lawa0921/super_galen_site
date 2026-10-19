# 星燈迷宮 計畫 5d：裝備與鍛造屋美術 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補齊裝備養成系統的正式美術，並把它接進介面。內容包括：
- 25 件底材與 44 件獨特、傳說、套裝裝備，各有大圖與小圖示；
- 12 種新素材圖示、47 個技能樹技能圖示；
- 稀有度外框與光暈、限定裝備剪影；
- 鍛造屋場景與多蘭的半身像。

**Architecture:**
- 生成照 art-factory 現有流程走：codex 生成 → `sl_art.py` 後處理與機械 QA → 審核頁 → 使用者核准 → 發布。
- 新增 `tools/gear_art.py`，負責這批素材的工作表、prompt、候選版本、挑選與發布。結構照抄計畫 4 的 `portal.py`。另新增 `tools/review_gear.py` 產生審核頁。
- 一張 codex 原圖切成多格。每格同時產出兩張圖：大圖（64×64）和小圖示（24 美術像素），兩張都從同一格原圖縮出來。
- 外框是九宮格圖，在 SCSS 用 `border-image` 套上。剪影由已核准的小圖示以確定性方式轉出。
- 程式端只在 `ctx.art.has(url)` 為真時才放圖，所以美術還沒到的時候，畫面照舊只有文字。

**Tech Stack:** Python 3 + numpy + Pillow + pytest（`python -m pytest art-factory/starlantern/tools -q`）、codex CLI image_gen、TypeScript、Vitest、SCSS、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-16-starlantern-progression-design.md`（§4 裝備美術、§5 地區限定裝備的剪影、§7 鍛造屋、§8 介面）；流程依據 `art-factory/starlantern/contract.md`、`docs/superpowers/plans/2026-10-16-starlantern-plan4-portal-dungeon.md` Task 10。

## Global Constraints
- **測試指令**
  - TS：只能用 `npx vitest run <路徑>`。
  - e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。dev server 用 4354 埠，不可用 4321。
  - Python 工具：`python -m pytest art-factory/starlantern/tools -q`。
- **瀏覽器**：一律 headless，並加 `--mute-audio`。
- **樣式**：SCSS 禁用 `!important`；禁止行內樣式，包含 JS 的 `element.style`。
- **美術來源**（AGENTS.md「Game Art Asset Policy」與使用者規定）
  - 靜態圖只用 codex。
  - 不可以用色塊、線條、CSS 形狀或 `::before`／`::after` 裝飾畫物品、外框或剪影。
  - 圖片裡不可以有文字。
  - 美術必須原創，prompt 裡不寫任何作品名或畫師名。
- **流程**：生成 → QA → 審核頁 → 核准 → 發布。
  - 被淘汰的版本不可留在 `public/`。
  - 未採用的原因要記在登錄表的 `rejected_attempts`。
- **核准分工**：使用者只看風格。風格樣本批（Task 4）核准之前，不可以生成其他批次。
  - 風格核准後，其餘批次的技術規格由我們決定：通過機械 QA，再經沒參與生成的代理在審核頁做視覺檢查，就可以發布。
  - 這些批次的審核頁網址仍要給使用者。使用者在發布前提出異議時，該件照異議重做。
- **品質**：每張工作表至少 2 版，取最好的一版，每個 id 最多 5 版。可以逐格從不同版本挑（`chosen_attempt`），照計畫 4 的做法。
- **去背**：透明素材畫在純 #FF00FF 上，QA 規則照 contract 的共通規定：
  - 不得有 magenta 殘留、半透明像素；
  - 主體不得碰到畫布邊、不得被原圖畫布切到；
  - 16 px 以下的封閉洞只列為警告。
- **審核頁要有網址**：`review_gear.py` 產生 `tmp/starlantern/review-gear/index.html` 與 `img/`。主對話用 Artifact 工具發布（`files` 帶入 `img/*`）。
  - 一次發布最多 255 個檔，超過就分兩次發布到同一個 url。
  - 執行者子代理只負責產生 HTML。
- **原圖位置**：原圖存在 `C:\Users\bag57\art-refs\starlantern\raw\<sheet-id>\`。參考圖的放大複本放在 `raw/gear-refs\`，不進 repo。
- **登錄表與網址清單同步**：`artPaths.test.ts` 會檢查登錄表的 `runtime` 集合與 `allArtUrls()` 完全相等。因此 `runtime` 只在發布時寫入，並且和 `NO_ICON_YET` 的刪除放在同一個 commit。
- **commit 結尾**：加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus
1. **背包格放不下圖示**：背包格只有 28px。小圖示必須以 1:1 顯示，不可以非整數縮放；外框只能壓在圖示外緣 2px 以內。Task 6 要測 `slx-gear-ico` 的 class，並在 Task 11 的截圖中確認。
2. **獨特、傳說、套裝不可退回底材圖**：這三種裝備必須用自己的圖。若專屬圖還沒發布，就只顯示文字，不可以借底材圖。Task 5 要有測試 `gearArtId prefers the special`；Task 6 要有測試 `a special without its own art shows text, never the base icon`。
3. **未取得的限定裝備**：傳送門卡片上未取得的限定裝備，只能載入剪影檔，不可以載入真正的圖示網址。Task 7 要有測試。
4. **美術尚未發布時**：每個有圖的地方都要退回原本的純文字顯示，不可以出現破圖或空的 `<img>`。Task 6、Task 7 都要有「無美術」的測試。
5. **雜物與不適用欄位的灰化**：雜物或不適用欄位的物品，灰階與半透明要同時作用在圖示與外框上；外框不可以蓋掉 `slx-cur` 游標的光框。Task 6 要有測試；Task 11 截圖確認。

---

## 素材總表與命名

| 類別 | 數量 | 登錄表 id | runtime（相對 `public`） | 規格 |
|---|---|---|---|---|
| 裝備小圖示（底材 25、特殊 44） | 69 | `gear-<id>` | `/assets/games/starlantern/gear/<id>.png` | 透明，長邊 24 美術像素，置中於 26×26 畫布 |
| 裝備大圖 | 69 | `gear-<id>-large` | `/assets/games/starlantern/gear/<id>-large.png` | 透明，長邊 60，置中於 64×64 畫布 |
| 剪影（地區限定 12 件＋6 套） | 18 | `gear-<id>-silhouette` | `/assets/games/starlantern/gear/<id>-silhouette.png` | 由 `gear-<id>` 確定性轉出，26×26 |
| 新素材圖示 | 12 | `icon-<matId>` | `/assets/games/starlantern/icon/<matId>.png` | 透明，高 32（同現有素材圖示） |
| 技能樹技能圖示 | 47 | `icon-<skillId>` | `/assets/games/starlantern/icon/<skillId>.png` | 透明，高 32（同現有技能圖示） |
| 稀有度外框 | 5 | `ui-rarity-<magic\|rare\|legendary\|unique\|set>` | `/assets/games/starlantern/ui/rarity-<r>.png` | 九宮格 16×16，slice 5，中央透明 |
| 傳說光暈 | 1 | `ui-glow-legendary` | `/assets/games/starlantern/ui/glow-legendary.png` | 九宮格 20×20，slice 7，中央透明，硬邊階梯色 |
| 鍛造屋場景 | 1 | `scene-forge` | `/assets/games/starlantern/scene/forge.png` | 不透明 418×235（`--fit 418x235`） |
| 多蘭半身像 | 2 | `npc-forge`、`npc-forge-happy` | `/assets/games/starlantern/npc/forge.png`、`forge-happy.png` | 透明，高 180，允許碰下緣（`allow_edge: [bottom]`） |
| **合計 runtime 檔** | **224** | | | |

**數量依據**
- 底材 25 件：`data/equipment.ts`。
- 特殊裝備 44 件：`data/gear.ts` 的 `SPECIALS`。
  - 角色傳說 8 件；
  - 地區傳說 6 件、地區獨特 6 件；
  - 套裝 6 套，每套 4 件，共 24 件。
- 新素材 12 種：精華 4 種、地區素材 6 種、`star-tear`、`king-scale`。
  - 其餘 10 種素材（怪物素材 8 種、`ancient-gear`、雜物 `old-coin`）已有核准圖示，沿用。
- 47 個技能：目前 `NO_ICON_YET` 裡的計畫 5b 技能 id。
  - 現有技能圖示的模式是 `icon/<skillId>.png`，每個技能一張，所以照同一模式做（已確認）。

**15 件舊底材圖示**
- 舊圖示路徑是 `icon/<id>.png`，高約 32，來自 `sheet-icons-3`。它們沒有大圖，不能滿足「大圖與小圖示同源」的規定。
- 所以 25 件底材全部重畫，放在新路徑 `gear/`，舊路徑不覆寫。
- 新圖發布後，舊的 15 個項目在登錄表標 `retired`：
  - 刪掉 `public` 裡的檔案；
  - 移出 `allArtUrls`。
- 淘汰新圖時，永遠不會刪到舊的已發布檔。

**`allArtUrls` 的數量**
- 目前是 219。
- 風格樣本發布後是 259：
  - 加 18（9 件 × 大小 2 張）、6（素材）、6（技能）、6（外框）、3（剪影）、1（場景）、1（NPC）；
  - 減 1（退役的舊 `icon/iron-sword.png`）。
- 全部發布後是 428：
  - 減 15（退役的舊底材圖示）；
  - 加 138（裝備大小圖）、18（剪影）、12（素材）、47（技能）、6（外框）、3（場景與 NPC）。

## 工作表（codex 一張圖 = 一張工作表）

| 工作表 id | 格數 | 內容（左到右、上到下） | 批次 |
|---|---|---|---|
| `sheet-gear-1` | 3×3 | iron-sword、wooden-buckler、leather-cap、lg-chizuru、blaze-heart-sword、iron-unbroken-shield、set-blaze-weapon、set-blaze-body、set-blaze-hands | **樣本** |
| `sheet-mat-1` | 3×2 | essence-common、essence-magic、essence-rare、essence-legendary、star-tear、king-scale | **樣本** |
| `sheet-skill-scarlet` | 3×2 | guardian-roar、unbreakable、blaze-ring、crimson-end、shield-bash、fortress | **樣本** |
| `sheet-rarity-frames` | 3×2 | magic、rare、legendary、unique、set、glow-legendary | **樣本** |
| `scene-forge` | 1 | 鍛造屋內景 | **樣本** |
| `npc-forge` | 1 | 多蘭（一般表情） | **樣本** |
| `sheet-gear-2` | 3×3 | wooden-staff、hunter-bow、thorn-spear、crystal-blade、frost-staff、star-saber、crystal-aegis、scale-helm、cloth-gloves | 量產 |
| `sheet-gear-3` | 3×3 | thorn-gauntlets、straw-sandals、bat-boots、cloth-robe、leather-vest、scale-mail、dusk-mantle、moss-charm、bat-earring | 量產 |
| `sheet-gear-4` | 3×3 | crystal-pendant、gear-ring、copper-ring、star-ring、lg-noel、lg-liz、lg-sylvie、lg-scarlet、lg-selene | 量產 |
| `sheet-gear-5` | 3×3 | lg-safira、lg-bobby、frost-bloom-neck、storm-thunder-bow、mire-whisper-gloves、shade-silent-blade、iron-bulwark-plate、blaze-ember-ring、frost-winter-staff | 量產 |
| `sheet-gear-6` | 3×3 | set-blaze-ring、set-frost-weapon、set-frost-head、set-frost-neck、set-frost-ring、set-storm-weapon、set-storm-hands、set-storm-feet、set-storm-ring | 量產 |
| `sheet-gear-7` | 3×3 | set-mire-head、set-mire-body、set-mire-feet、set-mire-neck、set-shade-weapon、set-shade-head、set-shade-hands、set-shade-feet、storm-swift-boots | 量產 |
| `sheet-gear-8` | 3×2 | set-iron-offhand、set-iron-head、set-iron-body、set-iron-feet、mire-miasma-mask、shade-raven-cloak | 量產 |
| `sheet-mat-2` | 3×2 | blaze-core、frost-heart、storm-stone、mire-gland、shade-crystal、iron-shard | 量產 |
| `sheet-skill-<cid>` ×7 | 3×2 | 各角色的 6 個樹技能，順序照 `NO_ICON_YET`；noel 只有 5 個，第 6 格畫 `plain empty stone slab`，切完丟棄（照 sheet-icons-3 的先例） | 量產 |
| `npc-forge-happy` | 1 | 多蘭（笑臉），附已核准的 `npc-forge` 當參考 | 量產 |

- 每套套裝的 4 件都排在同一張工作表上，配色和紋樣才會一致。焰紋套裝分在兩張：`set-blaze-ring` 在 sheet 6，附 sheet 1 已核准的原圖當參考。
- 生成次數：樣本 6 張；量產 16 張，包括 sheet-gear 2–8、sheet-mat-2、7 張技能表、npc-forge-happy。每張至少 2 版。

## Prompt 策略
- **共通**
  - 句尾沿用 `portal.py` 的 `PIX` 與 `GEN`。
  - 寫明：`flat pure magenta #FF00FF gutters and margin`、`no text, no numbers, no frames, no badge or circle behind the item`。
  - 加上原創句：`The design must be original and not resemble any existing game item.`
- **裝備表**
  - 寫明：`each item drawn alone, about 64 by 64 art pixels, three-quarter item-icon view, long weapons on the diagonal with the hilt lower left and the tip upper right, light from the upper left, a bold readable silhouette that still reads at 24 pixels`。
  - 每格的描述寫在 `gear_art.py` 的表 `GEAR_DESC: dict[str, str]`（69 項）。依稀有度定語氣：
    - **底材**：樸素材料（木、鐵、皮、布、鱗），低飽和，不發光；同一欄位的不同底材，輪廓要明顯不同。
    - **傳說**：以同欄位的底材為骨架，加上角色或地區的母題，再加橘色餘燼的硬邊亮點。
      - 角色傳說要配合角色的武器與配色：千鶴是雙月牙薙刀，莉茲是三叉短刃，諾艾兒是星空指環。
      - 生成時附 `reference/crops/<cid>.png` 當參考圖。
    - **獨特**：金色細工與一個故事母題，例如不破之盾的「千擊無痕的盾面」。
    - **套裝**：一套共用一組配色與一個徽記：
      - 焰紋：緋紅、黑、火焰徽；
      - 霜語：銀藍、雪花徽；
      - 雷鳴：靛藍、亮黃、閃電徽；
      - 沼行：橄欖綠、青銅、葉脈徽；
      - 夜幕：深紫、黑、新月徽；
      - 鐵壁：槍鐵灰、鏽紅、鉚釘齒輪徽。
- **參考圖**
  - 樣本批：附 `raw/portal-refs/icons-old-x8.png`，舊圖示最近鄰放大 8 倍，用來對齊色盤與輪廓。
  - 量產批：另附 `sheet-gear-1` 已核准原圖的 2 倍縮圖，放在 `raw/gear-refs/`，當風格錨點。
- **素材表**：寫明 `about 28 by 28 art pixels`，附舊素材圖示 ×8。
  - 精華是同一顆「結晶滴」造型的四階：灰白、藍、黃、橘，越高階越華麗。
  - 地區素材依 `portal.py` 的 `TRAITS` 配色。
- **技能表**
  - 寫明 `about 28 by 28 art pixels, one bold emblem`。每格描述從 `SKILLS[id].name/desc` 改寫成視覺句，表名 `SKILL_DESC`。
  - 配色依角色：絲嘉蕾緋紅黑金，其餘見 contract 的參考圖對照。
  - 附 `icons-old-x8.png`。
- **外框表**
  - 寫明：`six square pixel-art item-slot frames, each a thin 2-pixel border with small ornamental corners, the inside of each frame perfectly flat magenta, straight edge segments designed to repeat`。
  - 各框的配色：
    - magic：鋼藍框；
    - rare：亮黃框；
    - legendary：橘框加火舌角飾；
    - unique：金色雕花角飾；
    - set：綠框加葉形套裝紋樣，用在四個角。
  - 第 6 格是寬 3 px 的橘色光暈環：用 2–3 階硬邊色表現，不用柔和漸層。
- **鍛造屋**
  - 場景沿用 `batch.py` 的 `UI_SCENES` 句型：
    > Interior of a blacksmith's forge: a glowing furnace on the left, an anvil, racks of blades and shields, hanging tools, warm orange firelight and soot-dark beams, the right third of the picture kept fairly plain for a character to stand in front of
  - 附 `bg-f1` 的最新版。
  - 多蘭沿用 `UI_NPCS` 句型與 `JP` 前綴：
    > the town blacksmith 多蘭 (Doran), a sturdy cheerful woman in her late twenties with short dark-red hair tied up in a bandana, soot on one cheek, a heavy leather apron over a rolled-sleeve work shirt, thick gloves, holding a forging hammer on her shoulder
  - 附 `char-scarlet-standee` 當畫風錨點。
  - 性別與外型屬於風格，由樣本批交給使用者決定。

## QA 關卡（機械，`sl_art.py`）
- **裝備格**（新 kind `gear-cell`）
  - 同一格產出兩張：大圖以「長邊 60」決定 block，置中於 64×64；小圖示以「長邊 24」決定 block，置中於 26×26。
  - 兩張的 `raw` 與 `cell` 必須相同（`source` 欄位）。
  - 兩張都跑透明 QA：殘色、半透明、碰邊、被原圖畫布切到、洞警告。
  - 放不進畫布就失敗（`larger than the canvas`）。
- **九宮格**（新 kind `nine-slice`）
  - 以最近鄰取樣成正好 N×N。
  - `center_clear`：slice 以內的中央區必須全透明。
  - `ring_closed`：四邊在 slice 帶內，每一列（欄）至少有 1 個不透明像素。
  - `edge_repeat`：四邊中段的重複接縫比值必須 ≤ 1.25，沿用 `wrap_seam` 的算法，只量邊帶。
  - 另跑一般的透明 QA。
- **剪影**（`silhouette`）
  - 只接受 `status` 為 `approved` 或 `published` 的 `gear-<id>`。
  - 不透明像素一律換成 `#1d1a2e`。
  - 外圍 1 px 的透明鄰格塗成 `#8f86b8` 當輪廓光，所以畫布要比原圖每邊多 1 px。
  - 不產生其他新顏色。
  - QA 要求不透明像素數 ≥ 原圖。
- **既有規則**：素材、技能、場景、NPC 都沿用現有的 `_finish` 規則。

## File Structure
- `art-factory/starlantern/tools/sl_art.py`：新增 `fit_side`、`process_gear_cell`、`nine_slice`、`silhouette`、`Registry.retire`，以及 CLI 子命令 `retire`。
- `art-factory/starlantern/tools/gear_art.py`（新）：工作表定義、描述表、`gen`／`cand`／`pick`／`note`／`approve`／`publish`／`plan-json`。
- `art-factory/starlantern/tools/review_gear.py`（新）：審核頁。
- `art-factory/starlantern/tools/test_sl_art.py`、`test_gear_art.py`（新）：pytest。
- `art-factory/starlantern/gear-plan.json`（新，由 `gear_art.py plan-json` 產生並 commit）：`{ sheets: { [sheetId]: string[] } }`，供 TS 測試交叉檢查。
- `art-factory/starlantern/contract.md`：新增「計畫 5d」一節，內容是上面的總表、QA 關卡與 prompt 範本。
- `src/scripts/games/starlantern/render/artPaths.ts`、`artPaths.test.ts`、新檔 `gearArt.test.ts`。
- `src/scripts/games/starlantern/ui2/gearArt.ts`（新）：`gearIcon(art, it, large)`、`rarityFrame(art, rarity)`，供各場景共用。
- 要修改的場景：
  - `ui2/scenes/equip.ts`、`shop.ts`、`forge.ts`、`forgeCraft.ts`、`gate.ts`、`statusTabs.ts`；
  - `ui2/loot.ts`、`ui2/widgets.ts`（`RichPart` 加 `icon`）；
  - 各自的 `*.test.ts`。
- `src/styles/_starlantern-ui.scss`：外框、光暈、物品圖的 class。

---

### Task 1: `sl_art.py` 的新處理與 QA（TDD）

**Files:**
- Modify: `art-factory/starlantern/tools/sl_art.py`
- Test: `art-factory/starlantern/tools/test_sl_art.py`

**Interfaces:**
- Produces:
  - `fit_side(img: Image, side: int) -> int`：block 值，等於 `max(1, ceil(max(bbox_w, bbox_h) / side))`。
  - `process_gear_cell(reg, gid: str, cell: Image, workdir: Path, raw: Path, large=(60, 64), icon=(24, 26)) -> dict[str, dict]`：回傳 `{f'gear-{gid}-large': qa, f'gear-{gid}': qa}`，兩筆登錄都寫 `source={'raw': str(raw), 'cell': gid}`。
  - `nine_slice(reg, aid: str, cell: Image, workdir: Path, raw: Path, size: int, slice_: int) -> dict`：回傳 qa。
  - `silhouette(reg, gid: str, workdir: Path, ink=(29, 26, 46), rim=(143, 134, 184)) -> dict`：回傳 qa。
  - `Registry.retire(aid: str, public_root: Path, reason: str) -> None`。
  - CLI：`sl_art.py retire --id ID --reason R`。

- [ ] **Step 1：先寫失敗的測試**
  - `test_fit_side_uses_the_longer_side`：40×20 的主體，side 10 → 4；side 40 → 1。
  - `test_gear_cell_makes_a_large_and_an_icon_from_the_same_cell`：
    - 兩筆的 `size` 分別是 `[64, 64]` 和 `[26, 26]`；
    - 兩筆的 `source` 相同；
    - 兩筆的 `status` 都是 `qa_passed`。
  - `test_gear_cell_fails_both_when_the_subject_is_cut_by_the_canvas`：主體貼左緣 → 兩筆的 `reasons` 都含 `subject cut by the canvas edge`。
  - `test_nine_slice_passes_a_clean_ring_and_samples_exact_size`：合成一個 160×160、外圈 20px 的方框 → `size == [16, 16]`、`center_clear` 為真、`pass` 為真。
  - `test_nine_slice_fails_a_filled_centre`：中央填色 → `reasons` 含 `centre not clear`。
  - `test_nine_slice_fails_a_broken_ring`：一邊缺一段 → `reasons` 含 `ring not closed`。
  - `test_silhouette_uses_only_ink_and_rim_and_grows_one_pixel`：
    - 輸出的顏色集合等於 `{ink, rim}`；
    - 尺寸是原圖每邊加 1；
    - 原本不透明的格全部是 ink。
  - `test_silhouette_refuses_unapproved_art`：狀態是 `qa_passed` → 丟出 `PermissionError`。
  - `test_retire_removes_the_runtime_file_and_url_but_keeps_history`：
    - 檔案被刪除；
    - `runtime` 移到 `retired_runtime`；
    - `status == 'retired'`；
    - manifest 不再列出這個網址。
- [ ] **Step 2：確認測試失敗**
  - 執行 `python -m pytest art-factory/starlantern/tools/test_sl_art.py -q`。
  - 預期上面 9 個測試失敗，原因是 `AttributeError`。
- [ ] **Step 3：實作**
  - `process_gear_cell` 呼叫兩次 `_finish(..., block=fit_side(cell, side), canvas=c)`，所以透明 QA、殘色清理與洞警告都沿用 `_finish`。
  - `nine_slice`：先 `cutout`，再取主體 bbox，以 `fit_opaque` 同樣的最近鄰取樣成 `size×size`，然後跑 alpha QA 與三項九宮格檢查。
  - `edge_repeat` 把四條邊帶各自當成只左右重複的圖塊，交給 `wrap_seam` 計算。
  - `retire` 刪檔前，確認目標在 `public/assets/games/starlantern/` 以下，而且 git 有追蹤（`git ls-files --error-unmatch`），所以刪掉的檔可以從 git 復原。
- [ ] **Step 4：確認測試通過**
  - 執行 `python -m pytest art-factory/starlantern/tools -q`，預期全部通過。
- [ ] **Step 5：commit**
  - 訊息：`feat(art-factory): gear cells, nine-slice frames, silhouettes and retire`

### Task 2: `gear_art.py` 工作表與 prompt（TDD）

**Files:**
- Create: `art-factory/starlantern/tools/gear_art.py`、`art-factory/starlantern/tools/test_gear_art.py`、`art-factory/starlantern/gear-plan.json`
- Create: `src/scripts/games/starlantern/render/gearArt.test.ts`
- Modify: `art-factory/starlantern/contract.md`（新增「計畫 5d」一節）

**Interfaces:**
- Consumes：Task 1 的 `process_gear_cell`、`nine_slice`、`silhouette`；`portal.py` 的 `sheet_cells`、`attempts`。
- Produces:
  - `jobs() -> list[dict]`：每個 job 有 `id`、`prompt`、`images`、`kind`、`cols`、`rows`、`parts`、`batch`，其中 `kind` 是 `gear-sheet | icon-sheet | frame-sheet | opaque | sprite`，`batch` 是 `sample | main`。
  - `SAMPLE: tuple[str, ...]`：6 個樣本 job 的 id。
  - `runtime(aid: str) -> str | None`：照總表的路徑。
  - CLI：
    - `gen [--only=..] [--n=2] [--batch=sample|main]`
    - `cand [--only=..]`
    - `pick --id SHEET --attempt N [--part P]`
    - `note --id SHEET --attempt N --reason R`
    - `approve --batch B --by TEXT`
    - `publish --batch B`
    - `silhouettes`
    - `plan-json`

- [ ] **Step 1：先寫失敗的 pytest**
  - `test_every_gear_part_appears_once_and_sheets_match_their_grid`：
    - 69 個裝備 part 不重複；
    - 每張表的 `len(parts) == cols*rows`，只有 `sheet-skill-noel` 例外：6 格中有 1 格是丟棄的 `None`。
  - `test_sample_batch_is_the_six_style_jobs`：`SAMPLE` 等於表上那 6 個 id；`gen --batch=main` 在 `registry.json` 沒有 `style_approved` 時拒絕執行，丟出 `PermissionError`。
  - `test_set_pieces_share_a_sheet_except_blaze_ring_which_references_sheet_one`。
  - `test_prompts_carry_magenta_no_text_and_originality`：每個 prompt 都含 `#FF00FF`、`No text`、`original`。
  - `test_runtime_paths_follow_the_contract`：
    - `gear-iron-sword` → `/assets/games/starlantern/gear/iron-sword.png`；
    - `gear-iron-sword-large` → `…/gear/iron-sword-large.png`；
    - `gear-set-blaze-silhouette` → `…/gear/set-blaze-silhouette.png`；
    - `ui-rarity-set` → `…/ui/rarity-set.png`。
  - `test_pick_never_writes_runtime`：pick 之後，登錄項目沒有 `runtime`，`batch` 是 `gear-5d-sample` 或 `gear-5d-main`。
  - `test_publish_requires_approval_and_writes_runtime_then_retires_replaced_base_icons`：
    - 用暫存的登錄表與 public 資料夾；
    - `gear-iron-sword` 發布後，`icon-iron-sword` 變成 `retired`。
- [ ] **Step 2：先寫失敗的 vitest** `gearArt.test.ts`，讀 `art-factory/starlantern/gear-plan.json`。
  - `every base and special has exactly one gear cell`：所有 sheet-gear 的 part 集合，等於 `Object.keys(EQUIPMENT)` 加上 `Object.keys(SPECIALS)`，共 69 個。
  - `every material without art and every tree skill has exactly one icon cell`：素材與技能的 part 集合，等於 `MATERIALS` 中不在 `['moss','bat-wing','thorn-fang','crystal-shell','ice-crystal','lizard-scale','star-stone','dusk-cloth','old-coin','ancient-gear']` 的 12 個，加上 `artPaths.ts` 裡 47 個技能 id。
  - 這兩個測試讓之後新增裝備或素材時，忘了美術就會失敗。
- [ ] **Step 3：確認測試失敗**
  - 執行 `python -m pytest art-factory/starlantern/tools/test_gear_art.py -q`。
  - 執行 `npx vitest run src/scripts/games/starlantern/render/gearArt.test.ts`。
  - 預期兩邊都失敗：Python 是 import error，vitest 是檔案不存在。
- [ ] **Step 4：實作**
  - 照「工作表」「Prompt 策略」兩節實作 `gear_art.py`：
    - `GEAR_DESC`、`MAT_DESC`、`SKILL_DESC`、`FRAME_DESC`、`SET_STYLE` 都寫成常數；
    - `pick` 把各 part 寫進主登錄表，狀態是 `qa_passed`／`qa_failed`，並記錄 `chosen_attempt`、`source_id`、`batch`，但不寫 `runtime`。
  - `approve`：只把該批 `qa_passed` 的 part 設成 `approved`，並寫 `approved_by`。批次是 `sample` 時，另外在登錄表根部寫 `style_approved: <date>`。
  - `publish`：對該批 `approved` 的 part 依序做三件事：
    1. 寫入 `runtime(aid)`；
    2. 呼叫 `Registry.publish`；
    3. 若是 `gear-<base>` 而且 `icon-<base>` 的狀態是 `published`，對它呼叫 `retire`，原因寫 `replaced by gear-<base> (plan 5d)`。
    - 最後呼叫 `write_manifest`。
  - `silhouettes`：只為已核准的來源產生剪影。
    - 12 件地區限定物品：`regionSpecials`，在 Python 端寫成常數表 `REGION_LIMITED`，並由 vitest 交叉比對。
    - 6 套套裝：來源是 `SETS[id].pieces[0]`，也寫成常數表 `SET_FIRST`。
    - 剪影是已核准圖的確定性轉換，所以 QA 通過時直接標 `approved`，`approved_by` 寫 `derived from gear-<id>`，`batch` 跟來源相同；QA 失敗就標 `qa_failed` 並停下回報。
  - 執行 `python art-factory/starlantern/tools/gear_art.py plan-json` 產生 `gear-plan.json`，同時寫出 `REGION_LIMITED` 與 `SET_FIRST`。
  - vitest 加一個測試 `silhouette sources match regionSpecials and the first piece of each set`。
- [ ] **Step 5：確認測試通過**：兩個指令都通過。
- [ ] **Step 6：commit**
  - 訊息：`feat(art-factory): plan 5d gear, material, skill and frame jobs`

### Task 3: 審核頁 `review_gear.py`

**Files:**
- Create: `art-factory/starlantern/tools/review_gear.py`
- Test: `art-factory/starlantern/tools/test_gear_art.py`（新增 1 個測試）

**Interfaces:**
- Consumes：`gear_art.jobs()`、主登錄表、`work/<sheet>/cand/a<N>/`。
- Produces：`main(batch: str) -> Path`，寫出 `tmp/starlantern/review-gear/index.html`。只讀 `public/` 與登錄表，不寫入。

- [ ] **Step 1：先寫失敗的測試** `test_review_page_lists_every_part_of_the_batch_and_copies_only_existing_files`
  - 用暫存的登錄表跑 `main('sample')`；
  - 頁面裡每個 part id 都出現一次；
  - `img/` 裡沒有指向不存在檔案的 `src`。
- [ ] **Step 2：實作頁面**
  - 版型照抄 `review_portal.py`：深色底、`image-rendering: pixelated`、標題註明「qa_passed，尚未核准、未發布」。
  - 頁面分成 9 段：
    1. **裝備頁情境**：用 HTML 模擬背包格（28px，10×2 列）與人形 9 格（38px）。
       - 每種稀有度至少放 1 件，套上候選外框與傳說光暈；
       - 右側放詳情欄的 64px 大圖；
       - 分 1 倍與 3 倍兩組。
    2. **新舊對照**：15 件舊底材圖示（`public/.../icon/<id>.png`）和新的 `gear-<id>` 並排。樣本批只有 iron-sword。
    3. **大圖與小圖示成對**：64、24 各以 1 倍與 3 倍顯示，標出 `source` 相同。
    4. **傳送門卡片情境**：用已發布的 `portal/<region>.png` 卡片，下方列出限定裝備。已取得的顯示圖示，未取得的顯示剪影，兩種並排。
    5. **清單情境**：商店清單、鍛造清單、戰利品文字行，模擬圖示加名稱的排版。
    6. **素材**：新素材在深色面板上，與舊素材圖示並排，分 32、64、128px 三種大小。
    7. **技能**：同角色的新技能圖示與現有技能圖示並排。
    8. **鍛造屋**：場景 418×235 放大到 960×540，疊上多蘭半身像，照 `facility.ts` 的位置；旁邊並排已發布的道具店。
    9. **全部版本**：所有生成版本與淘汰原因，照 `review_portal.gallery`。
- [ ] **Step 3：確認測試通過**
  - 執行 `python -m pytest art-factory/starlantern/tools -q`。
- [ ] **Step 4：commit**
  - 訊息：`feat(art-factory): plan 5d review page`

### Task 4: 風格樣本批（生成，然後停下來等使用者）

**Files:**
- 這個 task 只動 art-factory 的 `prompts/`、`work/`、`registry.json`；原圖在 repo 外。不動 `public/`。

- [ ] **Step 1：準備參考圖**
  - 在 `raw/gear-refs/` 放 `icons-old-x8.png`（從 `portal-refs` 複製）。
  - 放 `scarlet-crop.png`、`chizuru-crop.png`，來源是 `reference/crops/`。
- [ ] **Step 2：生成**
  - 執行 `python art-factory/starlantern/tools/gear_art.py gen --batch=sample --n=2`，在背景跑，codex 一次一張。
  - 預期 6 個 job 各有 a1、a2 兩版。
- [ ] **Step 3：後處理候選**
  - 執行 `python art-factory/starlantern/tools/gear_art.py cand --only=sheet-gear-1,sheet-mat-1,sheet-skill-scarlet,sheet-rarity-frames,scene-forge,npc-forge`。
  - 預期每版都印出 QA。若某張表切格數不對（`expected 3x3 cells`），就追加 a3，照計畫 4 的 `NOTES` 寫修正句。
- [ ] **Step 4：逐格挑選並記錄原因**
  - 用 `pick` 逐格選最好的版本，用 `note` 記錄未採用的原因。
  - 執行 `sl_art.py status`，預期樣本批 9×2 + 6 + 6 + 6 + 2 = 38 件全部是 `qa_passed`。
- [ ] **Step 5：產出剪影預覽**
  - 剪影只接受已核准的圖，所以樣本批的剪影由 `review_gear.py` 在頁面內即時呼叫 `silhouette` 的純函式產生，不寫入登錄表。
  - 這 3 個預覽是 blaze-heart-sword、iron-unbroken-shield、set-blaze。
- [ ] **Step 6：產生審核頁並發布成網址**
  - 執行 `python art-factory/starlantern/tools/review_gear.py sample`。
  - 主對話用 Artifact 工具發布 `tmp/starlantern/review-gear/index.html`，`files` 帶入 `img/*`，`icon` 用 `palette`。
- [ ] **Step 7：派人視覺檢查**
  - 派一個沒參與生成的代理開網址做視覺檢查。檢查項目：
    - 24px 是否還認得出物品；
    - 套裝 3 件是否一眼看得出同一套；
    - 外框是否蓋住圖示；
    - 多蘭是否符合現有 NPC 的畫風。
  - 它找到的問題，修完再發布到同一個網址。
- [ ] **Step 8：停下來，把網址交給使用者確認風格**
  - 要請使用者決定的事：
    1. 裝備圖的畫風與大小比例；
    2. 稀有度外框與光暈；
    3. 多蘭的外型；
    4. 是否接受 15 件舊底材圖示全部換新。
  - 使用者要求重做的，記在 `rejected_attempts`，回到 Step 2，用 `--n=` 加版。
  - **使用者核准之前，不可以進行 Task 8 與 Task 9。**
- [ ] **Step 9：commit**（只含 prompt、work、登錄表）
  - 訊息：`art(starlantern): plan 5d style sample candidates`

### Task 5: `artPaths.ts` 的裝備美術路徑（TDD，可以和 Task 4 並行）

**Files:**
- Modify: `src/scripts/games/starlantern/render/artPaths.ts`
- Test: `src/scripts/games/starlantern/render/artPaths.test.ts`

**Interfaces:**
- Produces:
  - `art.gear(id: string): string`：回傳 `${ART_BASE}/gear/${id}.png`。
  - `art.gearLarge(id: string): string`：回傳 `…/gear/${id}-large.png`。
  - `art.gearSilhouette(id: string): string`：回傳 `…/gear/${id}-silhouette.png`。
  - `art.rarityFrame(r: FramedRarity): string`：回傳 `…/ui/rarity-${r}.png`。
  - `art.rarityGlow: string`：值是 `…/ui/glow-legendary.png`。
  - `export type FramedRarity = Exclude<Rarity, 'common'>`；`export const FRAMED_RARITIES: FramedRarity[]`。
  - `export function gearArtId(it: Pick<ItemInstance, 'base' | 'special'>): string`：回傳 `it.special ?? it.base`。
  - `export function codexArtId(id: string): string`：套裝 id 回傳 `SETS[id].pieces[0]`，其餘回傳 `id`。
  - `allArtUrls()` 的變更：
    - `EQUIPMENT` 與 `SPECIALS` 的 id 移出 `art.icon` 的迴圈，改推 `art.gear(id)` 與 `art.gearLarge(id)`；
    - 地區限定物品與套裝 id 推 `art.gearSilhouette(id)`；
    - 推 5 個外框與 1 個光暈；
    - 場景與 NPC 清單加 `'forge'`。
    - 以上全部受 `NO_ICON_YET` 控制。
  - `NO_ICON_YET` 的處理：
    - 名稱與位置不變，直接在原地編輯；
    - 加進新 id：69 個裝備 id、18 個剪影 key（`silhouette:<id>`）、`ui:rarity-<r>`、`ui:glow-legendary`、`scene:forge`、`npc:forge`；
    - 移出 15 個舊底材 id 的 `art.icon` 網址。這 15 個在 Task 8／10 退役之前，先放進新集合 `RETIRING_ICONS`，暫時保留 `art.icon(id)`。
- [ ] **Step 1：先寫失敗的測試**
  - `builds gear, large, silhouette and frame urls`：寫明 4 個完整網址。
  - `gearArtId prefers the special`：
    - `gearArtId({ base: 'iron-sword', special: 'blaze-heart-sword' })` 回傳 `'blaze-heart-sword'`；
    - 沒有 special 時回傳 `'iron-sword'`。
  - `codexArtId maps a set to its first piece`：`set-blaze` 回傳 `'set-blaze-weapon'`；`blaze-ember-ring` 回傳原值。
  - `lists one url per asset with no duplicates`：數量仍是 219。15 個舊圖示仍在清單內，新路徑全在 `NO_ICON_YET` 內。
  - `matches the art registry runtime paths exactly`：不改。
- [ ] **Step 2：確認測試失敗**
  - 執行 `npx vitest run src/scripts/games/starlantern/render/artPaths.test.ts`。
  - 預期失敗，原因是 `art.gear is not a function`。
- [ ] **Step 3：實作**：照上面的 Interfaces 修改 `artPaths.ts`。
- [ ] **Step 4：確認測試通過**
  - 執行 `npx vitest run src/scripts/games/starlantern/render`，預期全部通過，數量是 219。
- [ ] **Step 5：commit**
  - 訊息：`feat(starlantern): gear art paths behind NO_ICON_YET`

### Task 6: 裝備頁、外框與詳情大圖（TDD）

**Files:**
- Create: `src/scripts/games/starlantern/ui2/gearArt.ts`、`ui2/gearArt.test.ts`
- Modify: `ui2/scenes/equip.ts`、`ui2/scenes/equip.test.ts`、`src/styles/_starlantern-ui.scss`

**Interfaces:**
- Consumes：Task 5 的 `art.gear`、`art.gearLarge`、`art.rarityFrame`、`art.rarityGlow`、`gearArtId`。
- Produces:
  - `gearIcon(art: ArtIndex, it: ItemInstance, large = false): HTMLElement[]`：圖已發布時，回傳 `[<img class="slx-gear-ico">]`；大圖用 class `slx-gear-art`。圖未發布時回傳 `[]`。
  - `rarityFrame(art: ArtIndex, rarity: Rarity): HTMLElement[]`：
    - 回傳 `<span class="slx-rframe slx-rframe-${r}">`；
    - 傳說另加 `<span class="slx-rglow">`；
    - 普通稀有度，或外框圖未發布時，回傳 `[]`。
- [ ] **Step 1：先寫失敗的測試** `gearArt.test.ts`
  - `a special without its own art shows text, never the base icon`：
    - `has` 只對底材的網址回真；
    - 物品帶 `special: 'blaze-heart-sword'`；
    - 結果是 `[]`。
  - `returns the icon only when published`。
  - `common has no frame; legendary has a frame and a glow`。
- [ ] **Step 2：先寫失敗的測試** `equip.test.ts`
  - `bag and doll cells show the gear icon under a rarity frame when the art exists`：
    - 格子裡依序有 `.slx-gear-ico`、`.slx-rframe-rare`；
    - 名稱文字移到 `aria-label` 與 `title`，格子不再顯示截短的名稱。
  - `without art the cells keep the short name as today`：沿用 `NO_ART`。
  - `the detail shows the 64px large image of the special`：`.slx-item-detail-body img.slx-gear-art` 的 src 是 `art.gearLarge('blaze-heart-sword')`。
  - `junk and unfit cells grey the icon and the frame together`：
    - 格子帶 `slx-junk` 或 `slx-unfit`；
    - 圖示與外框都在這個格子內，由同一個 filter 作用。
- [ ] **Step 3：確認測試失敗**
  - 執行 `npx vitest run src/scripts/games/starlantern/ui2/gearArt.test.ts src/scripts/games/starlantern/ui2/scenes/equip.test.ts`。
- [ ] **Step 4：實作**
  - **equip.ts**
    - `render()` 的格子內容：有圖時，放 `[...gearIcon, ...rarityFrame, ...enhTag]`；沒圖時照舊。
    - `renderDetail()`：在名稱前面放 `gearIcon(…, true)`，外面包 `.slx-item-art-box`，再加上該稀有度的外框。
  - **SCSS**
    - `.slx-gear-ico { width: 24px; height: 24px; image-rendering: pixelated; }`，原圖 26×26 置中、不縮放；`object-fit: none`。
    - `.slx-gear-art { width: 64px; height: 64px; image-rendering: pixelated; }`。
    - `.slx-rframe`：
      - `position: absolute; inset: 0; pointer-events: none;`
      - `border: 5px solid transparent; border-image: url('/assets/games/starlantern/ui/rarity-<r>.png') 5 round; image-rendering: pixelated;`
      - 5 種稀有度用 SCSS `@each` 產生。
    - 詳情欄的外框用 `border-width: 10px`，也就是 2 倍。
    - `.slx-rglow`：`inset: -3px`，`border-image` 用光暈圖、slice 7，放在 `.slx-rframe` 下層。
    - `.slx-cur` 的 `z-index` 要高於 `.slx-rframe`，讓游標光框永遠在最上面。
  - 外框屬於美術，所以原本 `[class*='slx-rarity-']` 的 `border-color` 與 `background` 混色只在沒有 `.slx-rframe` 時才套用（`:not(:has(.slx-rframe))`）。
- [ ] **Step 5：確認測試通過**
  - 執行 `npx vitest run src/scripts/games/starlantern/ui2`。
- [ ] **Step 6：commit**
  - 訊息：`feat(starlantern): gear icons, rarity frames and the large item image in equipment`

### Task 7: 清單、戰利品、傳送門剪影、技能圖示（TDD）

**Files:**
- Modify:
  - `ui2/scenes/shop.ts`、`ui2/scenes/forge.ts`（`forgeRows`、重鑄素材列）、`ui2/scenes/forgeCraft.ts`（套裝打造列）；
  - `ui2/loot.ts`、`ui2/widgets.ts`；
  - `ui2/scenes/gate.ts`、`ui2/scenes/statusTabs.ts`；
  - 上述檔案各自的 `*.test.ts`、`src/styles/_starlantern-ui.scss`。

**Interfaces:**
- Consumes：Task 5 的 `art.gear`、`art.gearSilhouette`、`gearArtId`、`codexArtId`；Task 6 的 `gearIcon`。
- Produces:
  - `RichPart = string | { text: string; cls: string; icon?: string }`。打字效果顯示到該段第 1 個字時，在 span 前面放 `<img class="slx-ico slx-gear-ico">`。
  - `gearPart(it: ItemInstance, icon?: string): RichPart`。
  - `forgeRows(s, o: { …; art?: ArtIndex })`：有 `art` 時，每列的 `icon` 是 `art.gear(gearArtId(it))`，前提是圖已發布。
- [ ] **Step 1：先寫失敗的測試**
  - `shop.test.ts`：`gear goods use the gear icon, not the old icon path`。條件是 `has` 只對 `art.gear('iron-sword')` 回真。
  - `forge.test.ts`：
    - `forge rows carry the gear icon of the special`；
    - `reroll material rows carry the material icon`。
  - `widgets.test.ts`：`a rich part with an icon shows it once its first character is typed`。輸入 0 字時沒有 img；輸入 1 字時有 1 個。
  - `gate.test.ts`：把現有的 `no silhouette image without art, and one when the icon is published` 改成：
    - 未取得的物品，img 的 src 必須等於 `art.gearSilhouette('blaze-ember-ring')`；
    - `has` 只對 `art.gear('blaze-ember-ring')` 回真時，仍然沒有 img；
    - 已取得的物品，src 是 `art.gear(codexArtId(id))`；
    - 套裝 `set-blaze` 已取得時，src 是 `art.gear('set-blaze-weapon')`。
  - `status.test.ts`：`tree nodes and the skills tab show the skill icon when published`。條件是 `has` 只對 `art.icon('guardian-roar')` 回真，結果只有那一個節點有 `img.slx-skill-ico`。
- [ ] **Step 2：確認測試失敗**
  - 執行 `npx vitest run src/scripts/games/starlantern/ui2`。
- [ ] **Step 3：實作**
  - **shop.ts**：裝備列改用 `art.gear`，素材與道具仍用 `art.icon`。
  - **battle.ts、event.ts、town.ts**：呼叫 `gearPart` 時傳入 `ctx.art.has(art.gear(gearArtId(it))) ? art.gear(gearArtId(it)) : undefined`。
  - **gate.ts**：已取得的物品用 `art.gear(codexArtId(id))`；未取得的用 `art.gearSilhouette(id)`。
  - **SCSS**：`.slx-codex-icon`、`.slx-codex-silhouette` 改成 24×24，並刪掉 `.slx-codex-silhouette { filter: brightness(0) }`，因為剪影已經是美術。
  - **statusTabs.ts**：在 `slx-skill-head` 前面放 `<img class="slx-skill-ico">`。強化節點用它所改的技能的圖示（`n.skill`）。
  - **清單列高**：`.slx-list` 中帶 `slx-gear-ico` 的列，行高要至少 24px。若清單版面會溢出，就在 Task 11 的截圖中修正，不可以把圖示縮成非整數倍。
- [ ] **Step 4：確認測試通過**
  - 執行 `npx vitest run src/scripts/games/starlantern`。
- [ ] **Step 5：commit**
  - 訊息：`feat(starlantern): gear icons in lists and loot lines, codex silhouettes, skill icons`

### Task 8: 發布風格樣本（使用者核准之後）

**Files:**
- Modify：`art-factory/starlantern/registry.json`、`public/assets/games/starlantern/**`、`render/artPaths.ts`、`render/artPaths.test.ts`、`render/published.test.ts`

- [ ] **Step 1：記錄核准並發布**
  - 執行 `python art-factory/starlantern/tools/gear_art.py approve --batch sample --by "user <日期>: <原話>"`。
  - 再執行 `gear_art.py silhouettes`，接著 `gear_art.py publish --batch sample`。
- [ ] **Step 2：先改測試**
  - `artPaths.test.ts` 的數量改成 **259**，並新增斷言：
    - 清單包含 `art.gear('iron-sword')`、`art.gearLarge('set-blaze-body')`、`art.gearSilhouette('set-blaze')`、`art.rarityFrame('set')`、`art.scene('forge')`、`art.npc('forge', 'normal')`；
    - 清單不包含 `art.icon('iron-sword')`。
  - `published.test.ts` 的下限從 166 改成 **206**：加上 38 件樣本素材與 3 個剪影，再減掉 1 件退役圖示。
- [ ] **Step 3：確認測試失敗**
  - 執行 `npx vitest run src/scripts/games/starlantern/render`，預期數量不符。
- [ ] **Step 4：更新 `artPaths.ts`**
  - 從 `NO_ICON_YET` 刪掉 38 件樣本素材與 3 個剪影 key。
  - 從 `RETIRING_ICONS` 移除 `iron-sword`。
- [ ] **Step 5：確認測試通過**
  - 執行 `npx vitest run src/scripts/games/starlantern`，包含 registry 比對與 published 測試。
- [ ] **Step 6：commit**
  - 訊息：`art(starlantern): plan 5d style sample (gear, essences, scarlet skills, rarity frames, forge)`

### Task 9: 量產批（使用者核准風格之後）

**Files:**
- 這個 task 只動 art-factory 的 `prompts/`、`work/`、`registry.json`。

- [ ] **Step 1：準備風格錨點**
  - 把 `sheet-gear-1` 的核准原圖縮 2 倍，存成 `raw/gear-refs/gear-anchor.png`。
  - 量產批的每張裝備表，都附 `gear-anchor.png` 與 `icons-old-x8.png`。
- [ ] **Step 2：生成**
  - 執行 `gear_art.py gen --batch=main --n=2`，在背景跑。
  - 預期 16 個 job 各有 2 版；若沒有 `style_approved`，指令會拒絕執行。
- [ ] **Step 3：後處理並挑選**
  - 依序執行 `cand`、`pick`、`note`。
  - `sl_art.py status` 的預期：除了被丟棄的 noel 格，量產批 168 件全部是 `qa_passed`：
    - 60 件裝備，各有大小圖，共 120 件；
    - 6 件地區素材、41 個技能、1 張 npc-forge-happy。
  - 某格挑到第 5 版仍然失敗時，停下來回報，不可以發布替代品。
- [ ] **Step 4：產生審核頁並發布成網址**
  - 執行 `review_gear.py main`，再用 Artifact 發布到 Task 4 的同一個網址。圖片超過 255 張時，分兩次發布。
- [ ] **Step 5：派人視覺檢查**
  - 派一個沒參與生成的代理，依 Task 4 Step 7 的項目做視覺檢查，另外加查：
    - 每套 4 件是否一致；
    - 69 件裡是否有兩件在 24px 下難以分辨。
  - 有問題的格，加版重做。
- [ ] **Step 6：把網址交給使用者，說明發布規則**
  - 風格已經核准，所以這批會在 QA 與視覺檢查通過後發布。
  - 使用者對特定物品有異議時，會先重做那一件。
- [ ] **Step 7：commit**
  - 訊息：`art(starlantern): plan 5d production candidates`

### Task 10: 發布量產批並清空 `NO_ICON_YET`

**Files:**
- Modify：`registry.json`、`public/**`、`render/artPaths.ts`、`render/artPaths.test.ts`、`render/published.test.ts`

- [ ] **Step 1：核准並發布**
  - 執行 `gear_art.py approve --batch main --by "style approved <日期>; reviewed by fresh agent <日期>"`。
  - 再依序執行 `silhouettes`、`publish --batch main`。
  - 預期其餘 14 件舊底材圖示變成 `retired`。
- [ ] **Step 2：先改測試**
  - `artPaths.test.ts` 的數量改成 **428**，並新增兩個測試：
    - `every gear, material and skill id has art`：`NO_ICON_YET` 改為匯出的 `NO_ICON_YET_IDS`，測試它的大小等於 0。
    - `no old base icon url remains`：對 `EQUIPMENT` 的每個 id，清單都不包含 `art.icon(id)`。
  - `published.test.ts` 的下限改成 **375**：206（Task 8 後）+ 168（量產批）+ 15（其餘剪影）− 14（退役的舊底材圖示）。
- [ ] **Step 3：確認測試失敗，然後更新 `artPaths.ts`**
  - 刪掉 `NO_ICON_YET` 與 `RETIRING_ICONS` 裡剩下的全部 id。
- [ ] **Step 4：確認測試通過**
  - 執行 `npx vitest run src/scripts/games/starlantern`。
  - 執行 `python -m pytest art-factory/starlantern/tools -q`。
- [ ] **Step 5：commit**
  - 訊息：`art(starlantern): plan 5d production art published; every gear, material and tree skill has art`

### Task 11: 實機截圖、e2e 與審查

**Files:**
- Modify: `tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：e2e** `equipment shows gear art and frames without console errors`
  - 用 debug 給背包放入 6 種稀有度各 1 件；
  - 背包格有 6 個 `.slx-gear-ico`；
  - 傳說格有 `.slx-rglow`；
  - 詳情欄有 `.slx-gear-art`；
  - 全程沒有 console error，也沒有 404。
- [ ] **Step 2：執行測試並截圖**
  - 執行 `npx vitest run --testTimeout=20000` 全套，以及 e2e 全套。
  - 截圖以下畫面：
    - 裝備頁：每種稀有度、雜物、不適用欄位；
    - 詳情大圖；
    - 商店裝備清單與素材頁；
    - 鍛造屋的五個頁籤與多蘭；
    - 傳送門卡片：已取得與剪影；
    - 戰鬥戰利品行；
    - 技能樹與技能頁。
  - 截圖時確認 Review Focus 1 與 5。
- [ ] **Step 3：審查**
  - 派一個沒參與開發的 opus 代理，審查本計畫的 diff 與截圖，並處理它找到的問題。
- [ ] **Step 4：commit**
  - 訊息：`test(starlantern): plan 5d gear art end-to-end`

---

## 已知衝突與決定
1. **規格與資料的武器種類不一致**
   - 規格 §4 列出「雙刀、魔導書、彎刀、扳手」，但 `data/equipment.ts` 沒有這幾種底材。現有武器底材只有：杖 2、劍 1、晶刃 1、弓 1、槍 1、軍刀 1。
   - 本計畫只畫現有的 25 件底材。缺少的武器種類要在資料上新增底材，屬於 5a 的範圍。
   - 新增之後，Task 2 的 vitest 會提醒補圖。
2. **15 件已核准的舊底材圖示要全部換新**
   - 原因：舊圖沒有大圖，不能滿足「大圖與小圖示同源」。
   - 這件事列為樣本批交給使用者決定的第 4 點。
   - 若使用者拒絕，這 15 件保留舊圖示，大圖改為舊圖示以最近鄰放大 2 倍；這樣不算真正的大圖，要回報。
3. **剪影從 CSS filter 改成美術檔**
   - 原本 5a 用 CSS `filter: brightness(0)`，在深色卡片上幾乎看不見，而且會把真正的圖示網址送到前端。
   - 本計畫改成由已核准的小圖示確定性轉出剪影檔。
4. **風格核准之後的發布權限**
   - AGENTS.md 的流程要求「使用者核准」；使用者的記憶規定「只有風格找使用者看」。
   - 本計畫的做法：樣本批由使用者核准；量產批以「風格已核准，加上機械 QA 與獨立代理的視覺檢查」發布，並把網址交給使用者，使用者可以提出異議。
5. **雜物只有古代銀幣**
   - 規格舉例的破布、碎骨、生鏽的鈕扣，在 5c 沒有新增，所以本計畫沒有雜物要畫。
   - 古代銀幣已經有圖示。
