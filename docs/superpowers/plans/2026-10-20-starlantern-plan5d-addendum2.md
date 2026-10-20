# 星燈迷宮 計畫 5d 補遺 2：G1 重做（圖示大小一致、七階稀有度外框＋星輝）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **效力**：本文件疊在 `2026-10-17-starlantern-plan5d-art.md`（5d）與 `2026-10-19-starlantern-plan5d-addendum.md`（補遺 1）之上。三者衝突時，**本補遺 > 補遺 1 > 5d**。本文件不修改前兩份檔案。
> **觸發**：使用者 2026-10-20 在 G1 審核頁的回覆（原話）：「可以 / 裝備的稀有度可以有更多種 / 另外 icon 的大小應該要大致是一致的才對」，並選擇「加史詩＋星輝」。
> **主控裁定**：畫風、大小方向與多蘭外型已核准；15 件舊底材圖示全部換新。但樣本**還沒有** `gear_art approve`：要依下面重做之後，在**同一個審核頁網址**重新交給使用者看 G1。

**Goal:** 讓每個裝備圖示在同一畫布上佔一樣的份量；稀有度外框變成七階（加史詩）並加上星輝疊層；然後重做 G1 樣本，交給使用者。

**Architecture:**
- 生成仍只用 codex，流程不變：工作表 → `sl_art.py` 後處理與機械 QA → 審核頁 → 使用者核准 → 發布。
- **大小一致分三層處理。**
  1. Prompt 要求物品畫得粗壯、置中、填滿格子。
  2. 確定性後處理：在高解析度原圖上，把主體裁到 alpha bbox，再取樣一次，讓主體長邊正好等於目標值。
  3. QA 檢查短邊與份量，超出範圍就判失敗。
- **外框**：改用 coverage 取樣，保留 2px 的邊帶。新增三道 QA：邊帶粗細、色相、七階之間的色差。傳說光暈改成格內光暈，不再向格外延伸。星輝是另一張九宮格疊層，蓋在外框上面。
- **審核頁**：新增「尺寸一致性」格狀總覽，所有圖示以原尺寸與 3 倍並排，並疊上 bbox 框線。

**Tech Stack:** Python 3 + numpy + Pillow + pytest（`python -m pytest art-factory/starlantern/tools -q`；這是 Windows 上的 python，不走 WSL 規則）、codex CLI、TypeScript + Vitest、SCSS。

**Spec:** 5d「素材總表」「QA 關卡」與 Task 4–11；補遺 1 §1、§4；SDD 帳本 `.superpowers/sdd/2026-10-17-starlantern-plan5d-art/progress.md` 中 2026-10-20 的裁定；`art-factory/starlantern/contract.md`。5g 的引擎計畫 `docs/superpowers/plans/2026-10-20-starlantern-plan5g-rarity.md` 由另一個 planner 平行撰寫，最終的稀有度與星輝 contract 由它決定（見 §3 的對照表）。

## Global Constraints
- 5d 與補遺 1 的 Global Constraints 全部照舊。重點如下：
  - 靜態圖只用 codex；不用佔位圖；不用 CSS 或 `::before`／`::after` 畫物品或外框；圖裡不放文字；prompt 加原創句。
  - 每一批都要使用者在審核頁核准（補遺 1 S4）之後，才能 `approve`／`publish`。核准綁定審核頁顯示的 hash（`work/review/<batch>-shown.json`）。
- **子代理一律用 model `opus`**。
- **後處理只能做確定性的取樣、裁切與透明補邊**，不可以手繪或補畫任何像素。
- **門檻是常數**，寫在 `sl_art.py` 裡。不可以為了讓某一件通過而在登錄表加個別放寬，例如 `allow_*` 類欄位。要改門檻，必須由主控在帳本記下裁定。
- **重做的版數**：
  - 5d「每個 id 最多 5 版」的上限，對規格改變之後的版本重新起算。
  - `sheet-gear-1` 的 a1–a4 是舊規格產的，新規格從 a5 起，最多到 a9；`sheet-rarity-frames-2` 最多到 a5。
  - 到上限仍有格子失敗，就停下來回報，不可以發布替代品。
- **Git**：只用明確路徑 `git add`。禁止 `git checkout`／`restore`／`reset`／`stash`／`clean`。commit 結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus
1. **細長物品被量成合格**：斜放的劍，bbox 是方的，長短邊都合格，看起來卻比圓盾小很多。所以除了長短邊，還要量份量（mass）。Task A 有 `test_subject_gate_fails_a_thin_weapon_below_the_mass_floor`。
2. **紫色被當成洋紅背景吃掉**：`_magenta_tint`、`SPILL_HUE = (280, 345)` 會把偏粉的紫當成 key 色，史詩就會出現破洞或 `magenta spill`。史詩一律用藍紫（色相 250–272°）。Task C 有 `test_palette_is_distinct_and_epic_stays_off_the_key`。
3. **光暈或星輝蓋住圖示或外框**：光暈只能落在格子第 2 圈，星輝在邊的中段不可以太密。Task B 有 `test_inner_glow_is_padded_inside_the_slot`、`test_starlit_overlay_needs_corners_and_light_edges_but_not_a_closed_ring`。
4. **縮放其實是放大**：原圖主體太小時，目標尺寸大於原圖，結果是放大造成的糊圖。Task A 有 `test_normalize_never_upsamples`。
5. **重做後的 hash 和使用者看到的不一致**：素材、場景、多蘭這三項不重挑；審核頁要重新寫 shown 紀錄。Task E Step 6 用 `sl_art.py status` 與 shown 檔核對。

---

## 1. 尺寸目標與容差（裁定）

**畫布維持 26×26**：背包格 28px，剛好留 1px 邊。剪影是 26＋2 = 28，也和格子一樣大。人形格 38px 以 1:1 置中。所以沒有理由改畫布。

| 量測（在最終 PNG 上，只算 alpha = 255） | 小圖示 `gear-<id>` | 大圖 `gear-<id>-large` |
|---|---|---|
| 畫布 | 26×26 | 64×64 |
| 主體長邊（bbox）目標，取樣後**正好**等於 | **22**（四邊各留 2） | **56**（四邊各留 4） |
| 長邊容差（確定性保險） | 22±1 | 56±1 |
| 置中：bbox 中心與畫布中心的距離 | ≤1 | ≤1 |
| 短邊下限 | `ceil(MIN_SHORT[slot] × 22)` | `ceil(MIN_SHORT[slot] × 56)` |
| 份量 `mass = 不透明像素數 / 目標²` | 依 `SUBJECT_CLASS[slot]` 的區間 | 同一個區間 |

**短邊下限**用比例訂，大圖與小圖示共用：

| slot | weapon | offhand | head | body | hands | feet | neck | ring |
|---|---|---|---|---|---|---|---|---|
| `MIN_SHORT` | 0.70 | 0.75 | 0.65 | 0.80 | 0.70 | 0.70 | 0.60 | 0.60 |
| 小圖示短邊下限 | 16 | 17 | 15 | 18 | 16 | 16 | 14 | 14 |

**份量區間 `MASS_BAND`**

| 分類 | slot | 區間 |
|---|---|---|
| `long` | weapon | 0.28–0.65 |
| `broad` | offhand、head、body、hands、feet | 0.50–0.92 |
| `small` | neck、ring | 0.35–0.80 |

**拿目前 G1 的 a3／a4 實測（26 畫布，換算成目標 22 的 mass）**
- 不通過：
  - iron-sword：mass 0.23，太輕；
  - set-blaze-weapon：0.26，太輕；
  - iron-unbroken-shield：短邊 13/24，就是使用者指出的細長條。
- 通過：blaze-heart 0.28、lg-chizuru 0.32、leather-cap（短邊 16）、焰紋之鎧 0.74、焰紋之手甲 0.60、木圓盾 0.86。
- 這組門檻正好抓出使用者看到的問題，又不會連合理的件一起擋掉。

**取樣方式**
- 在 `sheet_cells` 切出的高解析度 cell 上 cutout，裁到 alpha bbox。
- 只用一次 centre-sample（`_sample`，不產生新顏色）縮到「長邊等於目標」；倍率 `scale = 原圖長邊 / 目標`，可以是小數。
- 縮完四周補 1 個透明美術像素，再置中貼上畫布。
- 不可以從已經縮好的圖再縮第二次。
- `scale < 1.0` 會變成放大，直接判失敗：`cell too small to sample`。

**剪影（28×28）**：由已核准的小圖示確定性轉出，主體長邊自動是 22＋2 = 24，不另設閘門。審核頁的一致性格裡會列出剪影。

**素材與技能圖示**：不在本補遺範圍內。它們沿用 contract 的 `--height 32`，執行時的位置也不同（素材清單、技能列）。`sheet-mat-1` 不重做，也不重挑。

## 2. 稀有度色盤與外框造型的階梯（裁定）

**色盤**：`gear_art.RARITY_PALETTE`。外框的色相 QA 用它；`$slx-rarity` 的文字色要和 5g 對齊（§3）。

| 階 | 中文 | 主色 | 色相 | 外框造型（逐階往上加，不只換顏色） |
|---|---|---|---|---|
| common | 普通 | `#c9c9d4` | — | **沒有外框**（第 0 階） |
| magic | 魔法 | `#3f7fff` | 220° | 2px 實心邊帶，直角，沒有角飾 |
| rare | 稀有 | `#ffe03a` | 51° | 邊帶，每角加一顆 2×2 鉚釘 |
| epic | 史詩 | `#8a5cff` | 257°（只能在 250–272°） | 邊帶，四角切 45°，每角一顆小菱形寶石 |
| legendary | 傳說 | `#ff7a14` | 26° | 邊帶，每角加火舌角飾；另有格內光暈 |
| unique | 獨特 | `#d8283a` | 354° | 邊帶，加 1px 金色內緣線與雕花角飾 |
| set | 套裝 | `#3fd05a` | 131° | 邊帶，每角一片葉形徽記 |
| 星輝疊層 | 星輝 | `#e8fbff`／`#7fe6ff` | 190° | 四角各一顆四芒星（≤5×5），邊上有稀疏的 1px 星點；只疊在擲出星輝的傳說、獨特、套裝上 |
| 傳說光暈 | — | 色相 35°±15，S ≥ 0.30 | | 格內一圈 1px 的淡橘光，四角各一個 2×2 火花 |

**色差**：六種外框兩兩之間的 CIE76 ΔE 最小值是 32.9（魔法對史詩），其次是 44.3（傳說對獨特）。QA 門檻定在 ΔE ≥ 25。舊的 G1 外框實測平均色：稀有 (207,203,33)、獨特 (171,123,7)、傳說 (187,102,6)，三者太接近，這就是要換掉的原因。

**九宮格幾何（重新檢查過，維持 16×16、slice 5）**
- 背包格 28px 時，外框的 5px 邊只壓外圈；調到 24 或 slice 8 會蓋住圖示，或變成非整數縮放。
- 以 28px 背包格為例，各層的位置：
  - 外框邊帶：格子第 0–1 px（容許到 0–2）；
  - 光暈：第 2 px；
  - 主體：第 3–24 px；
  - 角飾往內最多到第 3 px，最多只會碰到斜放兵器尖端的 1px。
- 光暈原圖畫成 12×12，取樣後補 2px 透明邊，成為 16×16。它疊在**圖示下層**，CSS 用 `inset: 0`，不會再伸進隔壁格。
- 邊的中段必須是素面，`border-image-repeat` 由 `round` 改成 `repeat`。人形格 38px 的邊中段是 28px，用 `round` 會被縮成 5.6px 的非整數倍。

## 3. 暫定 runtime key（要和 5g 對齊）
最終 contract 由 5g 決定。5g 的名稱如果不同，只改 `gear_art.runtime()`、`gear_art.assets_of()` 和 `artPaths.ts`。登錄表 id 不變。

| 5g 暫定 art key | 登錄表 id | runtime（相對 `public`） | 備註 |
|---|---|---|---|
| `frame-magic`…`frame-set`（原有 5 種） | `ui-rarity-<r>` | `/assets/games/starlantern/ui/rarity-<r>.png` | 同 5d |
| `frame-epic` | `ui-rarity-epic` | `/assets/games/starlantern/ui/rarity-epic.png` | 新增 |
| `frame-starlit` | `ui-starlit` | `/assets/games/starlantern/ui/starlit.png` | **疊層**，不是外框，不放進 `FRAMED_RARITIES` |
| （沿用） | `ui-glow-legendary` | `/assets/games/starlantern/ui/glow-legendary.png` | 改成 16×16、slice 5 的格內光暈 |

物品資料上的星輝旗標由 5g 定義。本補遺暫定叫 `ItemInstance.starlit?: boolean`，標為**待對齊**。`ui2/gearArt.ts` 只接收一個布林參數，不直接讀資料欄位。

## 4. 既有 task brief 的修改
這些修改寫進 `.superpowers/sdd/2026-10-17-starlantern-plan5d-art/task-<N>-brief.md`，每份附一行「addendum 2 amended」。Task 1–3 已經完成，改動放在下面的新任務 A–D。

| Brief | 修改 |
|---|---|
| **task-4** | Step 2–8 的重做由本補遺 **Task E** 取代。Step 8 的四個問題改成 §6 的決定區塊。 |
| **task-5** | 改 `export const FRAMED_RARITIES = ['magic','rare','epic','legendary','unique','set'] as const; export type FramedRarity = typeof FRAMED_RARITIES[number]`，不再依賴引擎的 `Rarity`，所以 5g 還沒合併也能編譯。<br>新增 `art.starlit: string`，值為 `…/ui/starlit.png`。<br>`NO_ICON_YET` 加入 `ui:rarity-epic`、`ui:starlit`。<br>測試 `builds gear, large, silhouette and frame urls` 加上 `art.rarityFrame('epic')` 與 `art.starlit` 兩個完整網址。總數不變，新路徑都在 `NO_ICON_YET` 裡。 |
| **task-6** | `rarityFrame` 改成 `rarityFrame(art: ArtIndex, rarity: Rarity \| 'epic', starlit = false): { under: HTMLElement[]; over: HTMLElement[] }`：<br>・`under` 是傳說的 `<span class="slx-rglow">`；<br>・`over` 是 `<span class="slx-rframe slx-rframe-<r>">`，另外在 `starlit` 為真且稀有度是傳說、獨特、套裝時，加 `<span class="slx-rstar">`；<br>・圖還沒發布的層一律省略。<br>格子內容的順序：`[...under, icon, ...over, enhTag]`。<br>新測試：<br>・`glow sits under the icon and the frame over it`：用 DOM 順序判斷；<br>・`starlit overlays only legendary, unique and set`：`rare` 帶 starlit 也沒有 `.slx-rstar`；<br>・`epic gets its own frame`。<br>SCSS：<br>・`.slx-rglow { inset: 0 }`，原本是 −3px；<br>・光暈、外框、星輝都是 `border: 5px`、`border-image-slice: 5`、`border-image-repeat: repeat`；<br>・`.slx-rstar` 的 z-index 高於 `.slx-rframe`，低於 `.slx-cur`；<br>・`@each` 加入 `epic`；<br>・詳情欄三層都用 `border-width: 10px`。<br>小圖示依主控 2026-10-20 的裁定，以 26×26 原尺寸顯示。<br>`$slx-rarity` 文字色：加 `epic`，獨特改成 `#d8283a`，其餘照 §2；**和 5g 誰先合併誰寫**，後合併的一方核對。 |
| **task-7** | 不改。清單與戰利品行沒有外框；文字色跟著 `$slx-rarity`。 |
| **task-8** | 發布前要先跑完本補遺 Task E，並取得使用者在 G1 的核准。<br>`--by` 引用使用者對**重做頁**的原話與日期；2026-10-20 那句「可以」不能拿來當核准。<br>件數：sample 34 件（9×2＋6＋6 外框＋光暈＋星輝＋場景＋NPC），加 3 個剪影，減 1 件退役（只有 `icon-iron-sword` 是舊圖）。`allArtUrls` 等於「發布當下的實際值＋36」（補遺 1 S8）。<br>`NO_ICON_YET` 刪掉的 key 多出 `ui:rarity-epic`、`ui:starlit`。 |
| **task-9** | `GEAR_SHEET` 使用新的 prompt（Task C），也會套用 Task A 的閘門。<br>錨點是重做後核准的 `sheet-gear-1` 那一版。<br>G2 的一致性格要列出全部 69 件：G1 的 9 件、G2 的 60 件，以及 15 件舊圖示的對照列。<br>視覺檢查加一條：跨批次的份量是否一致。 |
| **task-10** | 數量照補遺 1 S8 的方法重算。其餘不變。 |
| **task-11** | e2e 增加兩項：史詩格有 `.slx-rframe-epic`；帶星輝的傳說格有 `.slx-rstar`。<br>截圖時另外確認兩件傳說相鄰時，光暈沒有連在一起。 |

**同時要改 `art-factory/starlantern/contract.md` 的「計畫 5d」一節**（Task C 的 commit 一起帶）：
- 長邊 24／60 改成 22／56；
- 加上 §1、§2 的表；
- 光暈改為 16／5 格內光暈；
- 加入星輝疊層。

---

### Task A：主體正規化與尺寸閘門（`sl_art.py`，TDD）

**Files:**
- Modify: `art-factory/starlantern/tools/sl_art.py`
- Test: `art-factory/starlantern/tools/test_sl_art.py`

**Interfaces:**
- Produces:
  - 常數：
    - `SUBJECT_CLASS: dict[str, str]`：slot → `long | broad | small`，照 §1；
    - `MIN_SHORT: dict[str, float]`、`MASS_BAND: dict[str, tuple[float, float]]`、`CENTRE_TOL = 1`。
  - `normalize_subject(cut: Image, target: int) -> tuple[Image, float]`：輸入已 cutout 的高解析度 cell。裁到 alpha bbox，用 `_sample` 縮到長邊正好 `target`，四周補 1px 透明。回傳 `(image, scale)`。`scale < 1` 時丟 `ValueError('cell too small to sample')`。
  - `subject_metrics(final: Image, target: int) -> dict`：回傳 `{long, short, mass, box: [x0, y0, x1, y1], centre_off}`；mass 的分母是 `target²`。
  - `subject_gate(m: dict, target: int, slot: str | None) -> list[str]`：可能的 reasons 有 `subject long edge off target`、`subject off centre`、`subject too narrow`、`subject too light`、`subject too heavy`。`slot` 是 None 時，只檢查長邊與置中（5f 相容）。
  - `_finish(..., long_side: int | None = None)`：有 `long_side` 時，用 `normalize_subject` 取代以 block 為準的縮圖。magenta 的 hint 也用同一個 scale 從原圖取樣。其餘 QA 照舊。
  - `process_gear_cell(reg, gid, cell, workdir, raw, large=(56, 64), icon=(22, 26), slot: str | None = None)`：
    - 兩張圖都跑 `subject_gate`；
    - QA 寫入 `qa['subject'] = metrics`、`qa['scale']`；
    - 閘門失敗時，reasons 併進 `qa['reasons']`，`pass` 設為 False；
    - 登錄表另外記 `slot`。
  - `fit_side` 留著（已有測試），`process_gear_cell` 不再呼叫它。

- [ ] **Step 1：先寫失敗的測試**（合成圖：洋紅底的 400×400 cell，主體是有深色描邊的實心形狀）
  - `test_normalize_subject_sets_the_long_edge_exactly`：主體 300×120 → 長邊 `== 22`、短邊 `== 9`，`scale ≈ 300/22`。
  - `test_gear_cell_icon_and_large_hit_their_targets_for_any_raw_size`：主體長 180 與長 330 兩種 → 小圖示長邊都是 22、大圖都是 56；`centre_off <= 1`；`size` 分別是 `[26, 26]`、`[64, 64]`。
  - `test_subject_gate_fails_a_sliver_shield`：300×150、`slot='offhand'` → 短邊 11 < 17 → `subject too narrow`。
  - `test_subject_gate_fails_a_thin_weapon_below_the_mass_floor`：斜線長 300、寬 12、`slot='weapon'` → `subject too light`。
  - `test_subject_gate_fails_too_heavy`：實心正方形、`slot='weapon'` → `subject too heavy`。
  - `test_subject_gate_passes_a_chunky_breastplate`：300×280 的實心形狀、`slot='body'` → `pass`，`qa['subject']` 含上列五個欄位。
  - `test_gear_cell_without_slot_checks_only_the_long_edge`：細長條加 `slot=None` → 通過。
  - `test_normalize_never_upsamples`：主體長 40px 的 cell → 大圖 qa 的 reasons 含 `cell too small to sample`。
- [ ] **Step 2：確認失敗**
  - 執行 `python -m pytest art-factory/starlantern/tools/test_sl_art.py -q`。
  - 預期上面 8 個測試以 `AttributeError` 或 `assert` 失敗。
- [ ] **Step 3：實作**：照上面的 Interfaces 實作。
- [ ] **Step 4：確認通過**
  - 執行 `python -m pytest art-factory/starlantern/tools -q`，全部通過。
  - 既有的 `test_gear_cell_makes_a_large_and_an_icon_from_the_same_cell` 也要通過。
- [ ] **Step 5：commit**：`feat(art-factory): normalise gear subjects to one long edge and gate their size`

### Task B：外框的 coverage 取樣與外框 QA（`sl_art.py`，TDD）

**Files:**
- Modify: `art-factory/starlantern/tools/sl_art.py`
- Test: `art-factory/starlantern/tools/test_sl_art.py`

**Interfaces:**
- Produces:
  - 常數：
    - `FRAME_STROKE = (2, 3)`：邊中段的邊帶厚度下限與上限；
    - `EDGE_REACH_MAX = 3`、`CORNER_REACH_MAX = 4`：從外緣往內，最多可以有不透明像素的深度；
    - `HUE_TOL = 15`、`SAT_MIN = 0.45`、`DISTINCT_DE = 25.0`。
  - `cover_sample(img: Image, w: int, h: int, min_cover: float = 0.4) -> Image`：
    - 每個輸出格對應的原圖區塊中，不透明比例 ≥ `min_cover` 才算不透明；
    - 顏色取該區塊不透明像素中最常出現的那一色，不產生新顏色。
  - `nine_slice(reg, aid, cell, workdir, raw, size, slice_, role: str = 'frame', hue: float | None = None, pad: int = 0)`：
    - 取樣改用 `cover_sample`，取樣到 `size - 2*pad`，再補 `pad` 圈透明。
    - 三種 `role`：
      - `'frame'`：檢查 `center_clear`、`ring_closed`、`edge_repeat`、`stroke`、`reach`、`hue`；
      - `'glow'`：同上，但邊中段的第 0–1 列必須透明，邊帶厚度 1–2，色相 35±15，`S ≥ 0.30`；
      - `'overlay'`（星輝）：不檢查 `ring_closed`。另外檢查：
        - 所有不透明像素都是星光色，也就是「色相 170–215° 且 S ≥ 0.2 且 V ≥ 0.7」，或「S ≤ 0.15 且 V ≥ 0.85」；
        - 四角各 5×5 範圍內至少 3 個不透明像素；
        - 邊中段外 2 列的覆蓋率 ≤ 0.35。
    - QA 新增欄位：`stroke: [min, max]`、`reach`、`stroke_colour`（邊中段外 2 列不透明像素的中位 RGB）、`hue`。
    - reasons 新增：
      - `band thinner than 2 px`
      - `band reaches into the icon`
      - `hue off tier`
      - `not starlight colours`
      - `overlay hides the frame`
      - `starlit corners missing`
      - `glow outside its ring`
  - `frames_distinct(colours: dict[str, tuple[int, int, int]], min_de: float = DISTINCT_DE) -> dict[str, list[str]]`：回傳每個 aid 的 reasons，例如 `too close to ui-rarity-rare (ΔE 12.3)`。

- [ ] **Step 1：先寫失敗的測試**
  - `test_cover_sample_keeps_a_two_pixel_band`：
    - 合成 160×160 的方框，邊帶寬 17px（比 20 略細）；
    - `nine_slice(..., 16, 5)` 後，上邊中段每一欄的厚度都是 2。
  - `test_frame_gate_fails_a_one_pixel_band`：邊帶 8px → `band thinner than 2 px`。
  - `test_frame_gate_fails_a_band_reaching_into_the_icon`：邊帶 45px → `band reaches into the icon`。
  - `test_frame_gate_checks_the_tier_hue`：
    - 黃色方框以 `hue=26` 檢查 → `hue off tier`；
    - 同一個方框以 `hue=51` 檢查 → 通過。
  - `test_frames_distinct_fails_two_close_tiers`：`#ffd84a` 和 `#ffe03a` → 兩個 aid 都有 `too close to`；`#3f7fff` 和 `#8a5cff` → 沒有 reasons。
  - `test_inner_glow_is_padded_inside_the_slot`：
    - 12 格寬的 1px 淡橘環，`role='glow'`、`pad=2`；
    - 結果 `size == [16, 16]`，邊中段第 0–1 列透明，`pass`。
  - `test_starlit_overlay_needs_corners_and_light_edges_but_not_a_closed_ring`：
    - 四角四芒星加稀疏的青白色點 → `pass`；
    - 同樣的形狀改成橘色 → `not starlight colours`；
    - 整條實心青白邊帶 → `overlay hides the frame`。
- [ ] **Step 2：確認失敗**：執行 `python -m pytest art-factory/starlantern/tools/test_sl_art.py -q`。
- [ ] **Step 3：實作**
  - 角落與邊中段的切法：邊中段是 `slice_` 到 `size - slice_` 的那一段。
  - 色相用 HSV，取中位數；計算時要處理 0°／360° 的環繞。
- [ ] **Step 4：確認通過**
  - 執行 `python -m pytest art-factory/starlantern/tools -q`。
  - 既有的 nine_slice 測試，例如 `test_nine_slice_passes_a_clean_ring_and_samples_exact_size`，照樣要通過。
- [ ] **Step 5：commit**：`feat(art-factory): frame band, hue and distinctness gates, inner glow and starlit overlay`

### Task C：`gear_art.py` 的工作表、prompt、slot 與色盤（TDD）

**Files:**
- Modify: `art-factory/starlantern/tools/gear_art.py`、`art-factory/starlantern/gear-plan.json`（重新產生）、`art-factory/starlantern/contract.md`
- Modify: `src/scripts/games/starlantern/render/gearArt.test.ts`
- Test: `art-factory/starlantern/tools/test_gear_art.py`

**Interfaces:**
- Consumes：Task A 的 `process_gear_cell(..., slot=)`；Task B 的 `nine_slice(..., role, hue, pad)`、`frames_distinct`。
- Produces:
  - `LARGE, ICON = (56, 64), (22, 26)`。
  - `RARITY_PALETTE: dict[str, str]`，照 §2 的 7 色；`STARLIT = ('#e8fbff', '#7fe6ff')`；`GLOW_HUE = 35`。
  - `GEAR_SLOT: dict[str, str]`：69 件，每件的值都屬於 `GearSlot`。
  - `FRAME_SHEET_ID = 'sheet-rarity-frames-2'`：
    - 4×2 格，parts 依序是 `['magic', 'rare', 'epic', 'legendary', 'unique', 'set', 'glow-legendary', 'starlit']`；
    - `SAMPLE` 裡的 `'sheet-rarity-frames'` 換成這個 id，舊 job 從 `jobs()` 移除。
  - `FRAME_ROLE = {'glow-legendary': ('glow', 16, 5, 2), 'starlit': ('overlay', 16, 5, 0)}`；其餘外框是 `('frame', 16, 5, 0)`。
  - `assets_of`：`starlit` → `ui-starlit`，`epic` → `ui-rarity-epic`。
  - `runtime`：`ui-starlit` → `…/ui/starlit.png`。
  - `process_attempt`：
    - 裝備格傳入 `slot=GEAR_SLOT[part]`；
    - 外框表傳入 role、色相與 pad；
    - 整張外框表處理完後，跑 `frames_distinct`，把 reasons 併進對應的 qa，並把狀態改成 `qa_failed`。
  - `plan_data()` 增加 `slots: GEAR_SLOT`。
- **Prompt 修改**（照下列文字寫進常數）
  - **`GEAR_SHEET`**：把 `Each item drawn alone, about 64 by 64 art pixels, … reads at 24 pixels.` 換成：
    > Every item is drawn alone, centred in its own square cell and filling about nine tenths of the cell in its longest direction; all items at the same scale so they look equally big, about 64 by 64 art pixels each. Long weapons lie on the diagonal with the hilt lower left and the tip upper right, with thick chunky blades and shafts at least 6 art pixels wide. Shields, armour, helms, gloves and boots are drawn front-facing as broad, chunky, simple shapes that fill the cell in both directions: a shield is at least three quarters as wide as it is tall; a pair of gloves or boots stands side by side, overlapping. Rings and necklaces are drawn large, filling the cell like any other item. Design for the 24-pixel icon: a 2-pixel dark outline, big flat colour areas with at most three tones per material, one large crest instead of patterns, and no detail smaller than 3 art pixels. Keep every item inside its own cell with straight magenta lanes at least 60 pixels wide between columns and rows; nothing crosses a lane. Light from the upper left.
  - **`SET_NOUN`**：`body` 改成 `a chunky front-facing breastplate`；`hands` 改成 `a pair of chunky gauntlets side by side`。
  - **短刃**：`crystal-blade` 與 `shade-silent-blade` 的描述，把 `half the length of …` 換成：
    > a stubby dagger: a short broad blade and a large hilt, clearly stubbier in proportion than a sword
    - 原因：大小正規化之後，長度不再能表達短刃，要靠比例區分（見已知衝突 2）。
  - **`FRAME_SHEET`**：
    > A 4 by 2 grid of eight square pixel art item-slot frame pieces for a 16-bit Japanese console RPG, with flat pure magenta #FF00FF gutters and margin and straight magenta lanes at least 60 pixels wide between them. Draw each big pixel as a solid square. The six frames are each exactly 16 by 16 big pixels with a perfectly flat magenta inside; each frame's border is one solid band exactly 2 big pixels thick (one eighth of the frame's width) running straight along all four sides; corner ornaments stay inside a 4 by 4 big-pixel corner square; the middle of every side is plain so it can repeat. Each frame uses one hue only, with a darker and a lighter tone of it. In this order: {listing}.
  - **`FRAME_DESC`**：
    - `magic`：`royal blue #3F7FFF, a plain band with square corners, no ornament`
    - `rare`：`bright lemon yellow #FFE03A, the band plus one 2 by 2 rivet in each corner`
    - `epic`：`blue-violet #8A5CFF (a cool violet leaning to blue, never pink, never magenta), the band with each corner cut at 45 degrees and a small diamond gem in each corner`
    - `legendary`：`vivid orange #FF7A14, the band plus a small flame-tongue ornament in each corner`
    - `unique`：`deep crimson red #D8283A, the band with a thin gold inner edge line and a carved filigree ornament in each corner`
    - `set`：`leaf green #3FD05A, the band plus a small leaf emblem in each corner`
    - `glow-legendary`：`a 12 by 12 big-pixel square ring of soft pale yellow-orange light only 1 big pixel wide with a 2 by 2 spark at each corner, no other ornament`
    - `starlit`：`a 16 by 16 big-pixel starlight overlay: a small four-pointed cyan-white star (at most 5 by 5) sitting on each of the four corners, and only a few single-pixel cyan-white star dots spaced along each side, everything else magenta`

- [ ] **Step 1：先寫失敗的 pytest**
  - `test_sample_is_the_g1_redo_jobs`：`SAMPLE == ('sheet-gear-1', 'sheet-mat-1', 'sheet-rarity-frames-2', 'scene-forge', 'npc-forge')`，而且 `'sheet-rarity-frames'` 不在 `[j['id'] for j in jobs()]` 裡。原本的 `test_sample_batch_is_the_five_style_jobs` 改成這個測試。
  - `test_frame_sheet_is_four_by_two_with_epic_and_starlit`：
    - 確認 cols、rows、parts；
    - `assets_of` 依序產生 `ui-rarity-epic`、`ui-glow-legendary`、`ui-starlit`；
    - `len(batch_assets('sample')) == 34`。
  - `test_runtime_paths_follow_the_contract`：加上 `ui-rarity-epic` → `/assets/games/starlantern/ui/rarity-epic.png`、`ui-starlit` → `/assets/games/starlantern/ui/starlit.png`。
  - `test_every_gear_part_has_a_slot`：
    - `set(GEAR_SLOT) == 69 件 gear part`；
    - 每個套裝部件的值都等於它在 `SET_SLOTS` 的 slot；
    - 每個值都在 `SUBJECT_CLASS` 裡。
  - `test_gear_prompt_asks_for_uniform_chunky_items`：每個 gear-sheet 的 prompt 都含 `same scale`、`nine tenths`、`2-pixel dark outline`、`magenta lanes`。
  - `test_frame_prompt_names_each_tier_colour_and_ornament`：
    - 6 種外框的十六進位色碼都出現在外框表的 prompt 裡；
    - 含 `never magenta`；
    - 含 `16 by 16 big pixels`。
  - `test_palette_is_distinct_and_epic_stays_off_the_key`：
    - 六種外框色兩兩之間 ΔE ≥ 25；
    - 史詩色相在 250–272；
    - 七色都不觸發 `_magenta_tint`，也不落在 `SPILL_HUE`。
  - `test_process_attempt_gives_each_gear_cell_its_slot`：monkeypatch `A.process_gear_cell`，確認 `slot` 參數等於 `GEAR_SLOT[part]`。
  - `test_frame_sheet_marks_two_close_frames_failed`：合成外框表裡讓稀有與傳說同色，兩者都 `qa_failed`，reasons 含 `too close to`。
  - 既有的 `test_every_gear_part_appears_once_and_sheets_match_their_grid` 與 `test_committed_gear_plan_json_is_current` 要跟著更新。
- [ ] **Step 2：先寫失敗的 vitest**
  - 在 `gearArt.test.ts` 加 `every gear cell names the slot of its item`。
  - 對 `plan.slots` 的每個 id，斷言值等於 `(EQUIPMENT[id] ?? SPECIALS[id]).slot`，而且鍵的集合等於全部 69 件。
- [ ] **Step 3：確認失敗**
  - 執行 `python -m pytest art-factory/starlantern/tools/test_gear_art.py -q`。
  - 執行 `npx vitest run src/scripts/games/starlantern/render/gearArt.test.ts`。
- [ ] **Step 4：實作，然後重新產生 plan**
  - 照上面的 Interfaces 實作；
  - 執行 `python art-factory/starlantern/tools/gear_art.py plan-json`；
  - 依 §4 末段更新 `contract.md`。
- [ ] **Step 5：確認通過**：上面兩個指令都通過，再跑 `python -m pytest art-factory/starlantern/tools -q`。
- [ ] **Step 6：commit**：`feat(art-factory): plan 5d addendum 2 jobs — uniform gear prompt, slots, seven-tier frames and starlit`

### Task D：審核頁的尺寸一致性格與七階外框（`review_gear.py`，TDD）

**Files:**
- Modify: `art-factory/starlantern/tools/review_gear.py`
- Test: `art-factory/starlantern/tools/test_gear_art.py`

**Interfaces:**
- Consumes：Task A 的 `qa['subject']`；Task C 的 `RARITY_PALETTE`、`FRAME_SHEET_ID`、`GEAR_SLOT`。
- Produces:
  - `size_grid(pg: Page, reg: dict) -> str`：產生 `<section id="size">`。
    - **收錄範圍**：登錄表中所有 `gear-<id>` 小圖示，只要有 final、狀態不是 rejected 或 retired，就收進來，不論批次。所以 G2 的格子會自動帶進 G1 的 9 件，跨批次也能比較。
    - **排法**：
      - 依 slot 排成一列一列；
      - 1 倍與 3 倍各一組；
      - 每格有 `data-size-cell="<part>"`。
    - **每格的疊層**：
      - `.bbox`：主體 bbox 框線，資料來自 `qa.subject.box`；
      - `.target`：中央 22×22 的虛線目標框；
      - 數值：長邊、短邊、mass；
      - 沒通過閘門的格加 class `out`。
    - **其他列**：
      - 大圖（64）一列，目標框是 56；
      - 剪影預覽一列（28）；
      - 15 件舊底材圖示一列對照，帶 `data-old`，不計入閘門。
  - 外框段：
    - 七階各放一格示範，帶 `data-tier`；普通沒有外框。
    - 傳說、獨特、套裝再各放一格帶星輝的，帶 `data-starlit`。
    - 外框原圖放大 4 倍，旁邊附色票（§2 的色碼）與 QA 數值：stroke、hue、ΔE。
  - 光暈段：兩件傳說相鄰，用遊戲的 2px 間距。光暈改成 `inset: 0`、畫在圖示下層，標題寫成「光暈改在格內」。
  - `RARITY_NAME` 加 `epic: 史詩`。`rarity_of` 的底材示範輪替改成 `common, magic, rare, epic`。`.r-*` 的文字色改用 `RARITY_PALETTE`。
  - `DECISIONS['sample']` 換成 §6 的內容。
- [ ] **Step 1：先寫失敗的測試**
  - `test_size_grid_boxes_every_gear_icon_at_1x_and_3x`：
    - 用暫存的登錄表，放 3 件已通過 QA、各帶 `qa.subject` 的裝備；
    - 每個 part 的 `data-size-cell` 剛好出現 2 次，各有 `.bbox`；
    - 一件故意失敗的帶 `class="… out"`。
  - `test_size_grid_includes_other_batches_and_old_icons`：
    - 一件 `gear-5d-main-gear` 的 qa_passed 裝備和一個舊的 `icon-iron-sword` 都在頁面上；
    - 舊圖示帶 `data-old`；
    - retired 的件不在頁面上。
  - `test_frames_section_shows_seven_tiers_and_starlit_on_three`：
    - `data-tier` 有 7 種；
    - `data-starlit` 剛好是 legendary、unique、set；
    - 頁面含 6 個外框色碼。
  - `test_sample_decisions_are_the_g1_redo_questions`：
    - 決定區塊有 3 個問題，標題依序是「圖示大小是否一致」「七階外框與星輝」「傳說光暈改在格內」；
    - 另有一段「已決定（2026-10-20）」列出 3 項。
  - 既有的 `test_sample_review_page_opens_with_the_decisions_and_shows_honest_previews` 與 `test_review_page_lists_every_part_of_the_batch_and_copies_only_existing_files` 要跟著更新：sample 件數變成 34。
- [ ] **Step 2：確認失敗**：執行 `python -m pytest art-factory/starlantern/tools/test_gear_art.py -q`。
- [ ] **Step 3：實作**
  - 框線與目標框是審核頁的 HTML／CSS 標示，不是遊戲美術，不違反美術規定。
  - 小圖示一律以 26×26 原尺寸，或整數倍顯示。
- [ ] **Step 4：確認通過**：執行 `python -m pytest art-factory/starlantern/tools -q`。
- [ ] **Step 5：commit**：`feat(art-factory): review page size-consistency grid, seven-tier frames, contained glow`

### Task E：重做 G1 樣本（生成，然後停下來等使用者）

**Files:**
- 只動 art-factory 的 `prompts/`、`work/`、`registry.json`、`work/review/sample-shown.json`。原圖在 repo 外。不動 `public/`。

**做哪些、不做哪些**

| Job | 這次做什麼 | 原因 |
|---|---|---|
| `sheet-gear-1` | 重新生成 a5、a6；必要時補到 a9 | 新 prompt 與尺寸閘門；舊的 a3/a4 中，盾牌、鐵劍、焰紋之刃不過閘門 |
| `sheet-rarity-frames-2` | 新生成 a1、a2；必要時補到 a5 | 七階＋光暈＋星輝，原本的 3×2 已不適用 |
| `sheet-mat-1`、`scene-forge`、`npc-forge` | **不生成、不重挑** | 已核准方向；final 的 hash 不變，重做頁照原樣顯示 |

- [ ] **Step 1：記錄舊版本淘汰的原因**
  - 對 `sheet-rarity-frames` 的 a1、a2、a3 各執行一次：
    ```
    python art-factory/starlantern/tools/gear_art.py note --id sheet-rarity-frames --attempt N --reason "G1 2026-10-20：使用者要求加史詩＋星輝；邊帶縮成 1px、稀有/獨特/傳說色相太近、光暈太重並伸進隔壁格 → 改由 sheet-rarity-frames-2 重做"
    ```
- [ ] **Step 2：用新工具重跑舊版本，當作基準**（不呼叫 codex）
  - 執行 `python art-factory/starlantern/tools/gear_art.py cand --only=sheet-gear-1`。
  - 預期：
    - a1、a2 仍然切格失敗；
    - a3／a4 的 iron-unbroken-shield 出現 `subject too narrow`；
    - iron-sword 與 set-blaze-weapon 至少一版出現 `subject too light`。
  - 預期輸出記進回報。
- [ ] **Step 3：生成**（在背景跑，codex 一次一張）
  - 執行 `python art-factory/starlantern/tools/gear_art.py gen --only=sheet-gear-1 --n=6`。`--n` 是「補到總共 N 版」，現有 4 版，所以這會產生 a5、a6。
  - 執行 `python art-factory/starlantern/tools/gear_art.py gen --only=sheet-rarity-frames-2 --n=2`，產生 a1、a2。
- [ ] **Step 4：後處理並挑選**
  - 執行 `cand --only=sheet-gear-1,sheet-rarity-frames-2`。
  - 逐格 `pick`，選擇規則：
    - 只能挑全部閘門都通過的格；
    - 優先選新 prompt 的 a5 以後的版本；
    - 套裝 3 件要出自同一版（5d 的規則）。
  - 某格兩版都失敗時，補版：
    - 執行 `gen --only=<sheet> --n=<現有+1> --extra="Revision: <失敗的閘門與修正句>"`；
    - 修正句範例：盾太窄時寫 `the shield is broad, at least three quarters as wide as it is tall`；
    - 上限：裝備表到 a9，外框表到 a5；到上限就停下來回報。
  - 未採用的版本用 `note` 寫明原因，要寫出閘門名稱與數值。
  - 執行 `sl_art.py status`，預期 sample 34 件都是 `qa_passed`：裝備 18、素材 6（不變）、外框 8、場景 1、NPC 1。
- [ ] **Step 5：產生審核頁**
  - 執行 `python art-factory/starlantern/tools/review_gear.py sample`。
  - 會寫出新的 `sample-shown.json`。檢查 `sheet-mat-1`、`scene-forge`、`npc-forge` 的 hash，要和 2026-10-20 的舊紀錄一致。
- [ ] **Step 6：發布與視覺檢查**（由主控執行）
  - 主控用 Artifact 工具發布到**同一個網址** `https://claude.ai/artifact/8GH71RzdXfpuPC18biLgkM`，`files` 帶 `img/*`，最多 255 個檔。
  - 派一個沒參與生成的代理（model `opus`）做視覺檢查，項目如下：
    - 一致性格中，1 倍下看起來是否一樣大；
    - 短刃和劍、盾和圓盾在 26px 下分不分得出來；
    - 七階外框在 1 倍是否一眼分得出，造型階梯是否看得出來；
    - 星輝有沒有蓋掉外框色；
    - 兩件傳說相鄰時，光暈有沒有連在一起；
    - 焰紋三件是否仍看得出同一套。
  - 檢查發現的問題，修完後重新發布到同一個網址。
- [ ] **Step 7：停下來，把網址交給使用者**：內容照 §6。**使用者核准之前，不可以執行 Task 8／9 或 `approve`。**
- [ ] **Step 8：commit**（只含 prompts、work、登錄表與 shown 紀錄）
  - 訊息：`art(starlantern): plan 5d G1 redo — uniform icon size, seven-tier frames, starlit`

**生成次數**：最少 4 次（2＋2），最多 10 次（a5–a9 與外框表 a1–a5）。

## 5. 執行順序
1. Task A、B 改的都是 `sl_art.py`，要依序做；可以派同一個代理一起做（model `opus`）。
2. Task C 依賴 A、B，Task D 依賴 C。
3. 每完成一個 task 都跑 `python -m pytest art-factory/starlantern/tools -q`。Task C 另外跑 `npx vitest run src/scripts/games/starlantern/render/gearArt.test.ts`。
4. Task A–D 合併之後，做一次 fresh-context 審查（model `opus`），再開始 Task E。
5. 5d 的 Task 5–7（程式端）可以和 A–E 並行，但要先依 §4 改好 brief。
6. Task 6 和 5g 都會改 `$slx-rarity` 與稀有度型別，後合併的一方負責核對。

## 6. G1 決定區塊（重做頁的 `DECISIONS['sample']`）

**請你決定的事**
1. **圖示大小是否一致**（連到 `#size`、`#s1`）
   - 說明：所有圖示畫在同一個 26×26 畫布上，主體長邊統一是 22。盾、鎧甲、手甲另外要求要夠寬、夠飽滿，不合格的會被機械閘門擋下重畫。
   - 已知風險，由生成結果填入；沒有就寫「無」。可能的例子：
     - 短刃與劍現在一樣長，靠「短寬刃、大握柄」的比例區分；
     - 戒指、項鍊放大到和鎧甲同一份量後，看起來比以前大。
2. **七階外框與星輝**（連到 `#frames`、`#s1`）
   - 說明：普通沒有外框。魔法藍、稀有黃、史詩藍紫、傳說橘、獨特緋紅、套裝綠。造型也逐階增加：素邊 → 鉚釘 → 切角寶石 → 火舌 → 金邊雕花 → 葉徽。星輝是青白星光，只疊在擲出星輝的傳說、獨特、套裝上。
   - 已知風險：
     - 獨特由金色改成緋紅（和稀有黃、傳說橘分開），遊戲內的文字色要一起改；
     - 史詩只能用偏藍的紫，不能用偏粉的紫，因為生成用的是洋紅去背。
3. **傳說光暈改在格內**（連到 `#glow`）
   - 說明：光暈改成外框內側一圈 1px 淡橘光，加四角火花，畫在圖示下層，不再伸進隔壁格。請看兩件傳說相鄰的示範。

**已決定（2026-10-20，不再詢問）**
- 畫風與大小比例的方向：「可以」。
- 多蘭的外型：照目前的版本。
- 15 件舊底材圖示全部換新：本批只有鐵劍、木圓盾、皮帽，其餘在 G2。

**核准後的動作**：執行 `gear_art.py approve --batch sample --by "<使用者對重做頁的原話> <YYYY-MM-DD>"`，然後照 5d Task 8（已依 §4 修改）發布。

## 7. 已知衝突與決定
1. **5 版上限**：`sheet-gear-1` 已經有 a1–a4。裁定：規格改了，從 a5 重新起算，最多到 a9（見 Global Constraints）。**主控要在帳本確認這條。**
2. **短刃「一半長」**：補遺 1 S5 和 `GEAR_BASE` 要求短刃畫成劍的一半長，這和「長邊統一 22」互相矛盾。裁定：短刃改靠比例區分（短寬刃、大握柄），描述照 Task C 修改。視覺檢查專門看這一點。
3. **洋紅 key 與紫色**：`_magenta_tint`（r、b ≥ 150 且 g ≤ min(r, b) − 90）和 `SPILL_HUE` 280–345° 會吃掉或標記偏粉的紫。所以史詩鎖在藍紫 250–272°，不能用一般的紫色；Task C 用測試鎖住這一點。
4. **文字色盤**：`_starlantern-ui.scss` 的 `$slx-rarity` 目前是稀有 `#ffd84a`、傳說 `#ff9a3c`、獨特 `#d4af37`，也就是使用者說太接近的那三色。新色盤把獨特改成緋紅 `#d8283a`，和 `.slx-lack` 用的 `$slx-down` 紅色同屬紅色系：一個是格子外框，一個是成本欄文字，位置不同。由 5g 一併決定文字色。
5. **`FramedRarity` 原本寫成 `Exclude<Rarity, 'common'>`**，會被 5g 綁住。改成字面清單（§4 task-5），5g 合併時只要在引擎加入 `'epic'`。
6. **光暈幾何**：5d 原本是 20×20、slice 7、`inset: -3px`；task-6 brief 是 `.slx-rglow` 在外框下層。現在改成 16×16、slice 5，以 `inset: 0` 放在**圖示**下層。
7. **`border-image-repeat: round` 改成 `repeat`**：原因見 §2，避免 38px 人形格出現非整數縮放。
8. **5d 素材總表「長邊 24／60」與 `gear_art.LARGE/ICON`** 改成 22／56（Task C）。contract.md 也要跟著改。
9. **原圖資料夾有不屬於流程的檔案**：`raw/sheet-gear-1/gear-1-raw-20261020-01..03.png` 與 `raw/sheet-rarity-frames/sheet-rarity-frames-once-20261020.png`，日期是今天。`attempts()` 的 glob 不會撿到它們，本計畫也不使用。主控要確認來源，可能是 codex 自己另存的副本；不要刪除。
10. **5f 相容**：`process_gear_cell` 新增的 `slot` 參數預設為 None，5f 的專屬獨特要傳入 slot，才會套用同一套閘門。這一條要寫進 5d 的 contract 段落，交給 5f。
