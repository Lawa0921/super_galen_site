# 星燈迷宮 asset contract

依據：`docs/superpowers/specs/2026-10-14-starlantern-drpg-design.md` 第 5 節；執行計畫：`docs/superpowers/plans/2026-10-15-starlantern-plan2-art.md`。

## 共通
- 生成：`python art-factory/starlantern/tools/codex_still.py generate --workdir C:/Users/bag57/art-refs/starlantern/raw/<id> --name <id>-a<N>.png --prompt-file art-factory/starlantern/prompts/<id>.txt [--image ...]`；每次重試換新檔名（a1、a2…），每個 id 最多 3 次，超過就回報。
- 後處理：`python art-factory/starlantern/tools/sl_art.py process --id <id> --raw <raw> --kind <kind> [...]`。
- 風格：16-bit 日式 RPG 像素畫、粗輪廓 1 px 深色線、有限色盤（每張 ≤ 32 色）、無抗鋸齒、無文字、無浮水印。
- 背景：透明素材一律畫在純 #FF00FF 上，主體四周至少留 8% 空白；不透明素材滿版。
- 原創：不得模仿既有作品角色、標誌、商標；prompt 裡不寫任何作品名或畫師名。
- 原圖保存在 `C:\Users\bag57\art-refs\starlantern\raw\<id>\`；repo 內保存 prompt、gen.json、gate.json、qa.json 與成品。
- QA（`sl_art.py` 自動）：透明素材不得有 magenta 殘留、半透明像素、碰到畫布邊；可拼接圖塊 `seam` ≤ 24（超過時交給使用者在審核頁判斷）。
- 畫布邊：主體不得被原圖畫布切到（`subject cut by the canvas edge`）。半身頭貼允許碰到下緣（`allow_edge: [bottom]`）；個別肩膀碰到側邊的頭貼，在登錄表記錄 `allow_edge` 與原因。
- 例外：主體內 16 px 以下、且原圖不是純 magenta 的封閉透明洞只列為警告（`warnings`），由人工在審核頁檢查，不自動退件。原因是 codex 輸出的頭髮、武器與身體之間常有真正的細縫。
- 尺寸：codex 不遵守指定的像素數，所以透明素材以「目標美術像素高度」決定縮放（`--height`）：立繪 280、頭貼 115、地圖隊伍 32、一般敵人 64、頭目 150、圖示 32、特效 64；圖塊表與背景用固定 `--block`（6、4）。

## 各類規格

| 類別 | id | runtime 路徑（相對 `public`） | 去背 | 像素尺寸（美術像素） |
|---|---|---|---|---|
| 立繪 | `char-<cid>-standee` | `/assets/games/starlantern/char/<cid>-standee.png` | 透明 | 高 88–120 |
| 頭貼 | `char-<cid>-portrait`、`char-<cid>-portrait-hurt` | `/assets/games/starlantern/char/<cid>-portrait.png`、`-portrait-hurt.png` | 透明 | 48×48 方框內 |
| 地圖隊伍 | `map-party-<dir>` | `/assets/games/starlantern/map/party-<dir>.png` | 透明 | 高 20–28 |
| 圖塊 | `tile-f<n>-<tile>` | `/assets/games/starlantern/tiles/f<n>-<tile>.png` | 不透明 | 32×32 |
| 可拼接牆 | `tile-f<n>-wall-top`、`tile-f<n>-wall-face` | `/assets/games/starlantern/tiles/f<n>-wall-top.png`、`f<n>-wall-face.png` | 不透明 | 62×62（同該層 floor），見「可拼接牆」 |
| 戰鬥背景 | `bg-f<n>` | `/assets/games/starlantern/bg/f<n>.png` | 不透明 | 寬 320–480，16:9 |
| 敵人 | `enemy-<eid>` | `/assets/games/starlantern/enemy/<eid>.png` | 透明 | 高 48–112；頭目 120–200 |
| 圖示 | `icon-<id>` | `/assets/games/starlantern/icon/<id>.png` | 透明 | 24×24 方框內 |
| 特效 | `fx-<key>` | `/assets/games/starlantern/fx/<key>.png` | 透明 | 高 32–96 |
| 特效動畫 | `fx-<key>-anim` | `/assets/games/starlantern/fx/<key>-anim.png`（橫向 4 格等寬，CSS `steps(4)` 播放） | 透明 | 每格同尺寸，最大格高約 64 |
| 介面框 | `ui-frame` | `/assets/games/starlantern/ui/frame.png` | 不透明 | 48×48，角 16 |

圖塊表（每層一張 3×3）順序：wall、floor、door ／ up、down、chest ／ chest-open、entrance、boss。
圖示表（3 張 5×4）內容以 `registry.json` 的 `sheet-icons-<k>.parts` 為準。

## Prompt 範本
- 立繪：`Full-body pixel art character sprite of <角色描述>, standing three-quarter view, <服裝>, plain adventurer outfit, 16-bit JRPG style, crisp 1px dark outline, limited palette, centred on a flat pure magenta #FF00FF background, no text, no shadow on the ground.` 附 `--image reference/crops/<cid>.png`。
- 頭貼：`Square bust portrait in pixel art of the same character as the reference, <表情>, facing slightly left, 16-bit JRPG style, flat pure magenta #FF00FF background, no frame, no text.` 附該角色已核准立繪；受傷版附一般頭貼，表情寫 `wincing in pain, a small scratch on the cheek, hair slightly messy`。
- 圖塊表：`A 3 by 3 grid of nine square top-down pixel art dungeon tiles for <地形>, separated by thick flat pure magenta #FF00FF gutters. Row 1: stone wall, walkable floor, wooden door. Row 2: stairs going up, stairs going down, closed treasure chest on floor. Row 3: opened empty treasure chest on floor, glowing entrance circle on floor, ominous sealed boss gate. Floor and wall tiles must tile seamlessly. Each tile fills its square edge to edge. No text.`
- 戰鬥背景：`Wide 16:9 pixel art battle backdrop of <地形>, first-person view down a corridor, empty foreground for monsters, 16-bit JRPG style, no characters, no text.`
- 敵人：`Pixel art monster sprite of <敵人描述>, facing the viewer, full body, 16-bit JRPG battle sprite, crisp 1px dark outline, flat pure magenta #FF00FF background, no text.`
- 圖示表：`A 5 by 4 grid of twenty small pixel art RPG icons separated by thick flat pure magenta #FF00FF gutters, each icon on magenta, in this order left to right, top to bottom: <清單>. No text.`
- 特效：`Single pixel art battle effect of <效果>, bold shapes, no soft glow gradients, flat pure magenta #FF00FF background, no text.`
- 特效動畫：一張橫向 4 格 strip（起手 → 爆發 → 擴散 → 消散），格間留寬 magenta 槽，四格同比例、同中心；發光用 2–3 層硬邊色階表現，不用柔和漸層或半透明。附該效果的舊單格特效原圖當配色參考。完整句子由 `batch.py` 的 `FX_ANIM` 產生。
- 介面框：`A 48 by 48 pixel art UI panel frame, dark navy fill, ornate brass border 16 pixels wide with star-lantern motif corners, edges designed to repeat, fills the canvas edge to edge, no text.`

## 特效動畫（fx-anim）
- 生成：`python art-factory/starlantern/tools/batch.py --only=fx-<key>-anim`（codex 在背景、無主控台視窗執行）。
- 後處理：`sl_art.py process --kind fx-anim --frames 4 --height 64`。以 n−1 條最寬的 magenta 槽切格；每格依所在格子置中，取四格主體的聯集外框，全部用同一個 block 縮成美術像素，所以格內的位移與大小變化都保留。輸出橫向等寬 sheet（`<id>.png`）與單格（`<id>-f<k>.png`）。
- QA：整張 sheet 跑一般透明素材 QA（殘色、半透明、碰邊、洞警告），另外檢查：每格不得碰到自己的格邊、不得有空格、相鄰兩格差異須 ≥ 2%（`frames identical`）、主體不得被原圖畫布切到。

## 可拼接牆（tile-wrap：wall-top / wall-face）
- 用途：取代每格自帶石框的 `f<n>-wall`。地圖規則：牆格畫 `wall-top`；若該牆格南側鄰格是地板，改畫 `wall-face`；地板格畫 `floor`。
- id 與 runtime：`tile-f<n>-wall-top` → `/assets/games/starlantern/tiles/f<n>-wall-top.png`；`tile-f<n>-wall-face` → `/assets/games/starlantern/tiles/f<n>-wall-face.png`。登錄表 `kind: tile-wrap`，`wrap: xy`（牆頂，四邊重複）或 `wrap: x`（牆面，只左右重複）。
- 規格：不透明、62×62 美術像素（與該層 floor / wall 相同密度）；牆頂不得有外框、邊線、角落裝飾；牆面上緣是接在牆頂下方的蓋石、下緣是牆腳與接地陰影，不畫地板。
- 生成：`python art-factory/starlantern/tools/batch.py --only=tile-f<n>-wall-`。參考圖是該層已發布的 `f<n>-wall.png`、`f<n>-floor.png` 以最近鄰放大 8 倍的複本（放在 `raw/tile-refs/`，不進 repo）；牆面另外以同層牆頂原圖為第一張參考圖（`dep`），所以牆頂通過 QA 後才產牆面。
- 後處理（`sl_art.py process --kind tile-wrap --wrap xy|x --size 62`）：原圖取置中正方形，以 `邊長 / 62` 為 block 取每格中心像素，縮成 62×62。
- 無縫修補（確定性，只在需要時做）：任一要求軸的原始接縫比值 > 1.25 時，該軸改取 62+6 個美術像素，再做「重疊裁切」（image quilting 式，`make_seamless`）：輸出第 i 列 = 原圖第 6+i 列；最後 6 列裡，每一欄在最小誤差路徑（相鄰欄的切點最多差 1 列）選出的切點 c 之下改用原圖開頭的第 c..5 列，所以接縫處（輸出最後一列接回第一列）就是原圖本來相鄰的兩列，接縫移到圖內一條沿紋理走的隱藏切線。只搬像素、不混色，不產生新顏色；該軸內容約壓縮 9%。qa.json 記錄 `raw_seam`（修補前）、`seamless_fix`（`overlap-cut` 或 `none`）、`fixed_axes` 與 `cut.<軸>.cut_ratio`（隱藏切線的平均色差 ÷ 圖內相鄰像素平均色差）。
  - 不用邊緣羽化（兩側鏡像混色）：f3 牆頂試過，混色後吸附色盤會在接縫留下一條看得見的異色帶，雖然接縫比值是 0。
- QA（機械）：
  - `seam`：把圖 2×2 平鋪（只左右重複的牆面做 1×3），量接縫兩側那一對欄（列）的平均 RGB 差 `seam`，以及單張圖內所有相鄰欄（列）的平均差 `interior`；`ratio = seam / interior`，每個要求軸都須 ≤ 1.25，否則 `visible seam`。
  - `frame`：要求軸上，最外 1–3 px 外圈的平均亮度與內部（去掉外 4 px）平均亮度的最大差，須 ≤ 16，否則 `edge frame`（抓自帶外框、邊線的圖；這種圖兩邊彼此相同，接縫比值看不出來）。牆面只檢查左右，上緣蓋石與牆腳不算外框。
  - `top_join`（僅記錄，不擋）：牆頂最後一列與同層牆面第一列的平均差，對牆面內相鄰列平均差的比值，供審核頁參考接合是否自然。
- 審核頁：`tmp/starlantern/review-walls/index.html`（`python art-factory/starlantern/tools/review_walls.py` 產生），每層一個 7×5 迷宮示範新舊並排、放大 3 倍，附牆頂 2×2、牆面 1×3 平鋪預覽與 QA 數字。登錄表狀態最多到 `qa_passed`，核准與發布由使用者在審核頁確認後另行執行。

## 傳送門 roguelike（計畫 4 Task 10）
- 工具：`tools/portal.py`（prompt 與 job 定義、`gen` 生成、`cand` 把每一版後處理到 `work/<id>/cand/a<N>/`、`pick` 把選中的版本寫進登錄表、`note` 記錄未採用原因）；審核頁 `tools/review_portal.py` → `tmp/starlantern/review-portal/index.html`。
- 品質優先（使用者要求）：每種素材至少 2 版，取最好的一版；這批每個 id 最多 5 次。未採用的版本在登錄表的 `rejected_attempts` 記錄原因；sheet 類可以逐一部件從不同版本挑（`chosen_attempt`）。
- 參考圖：已發布場景、圖示、f1 圖塊以最近鄰放大的複本，放在 `raw/portal-refs/`（不進 repo）。

| 類別 | id | runtime 路徑（核准後才發布） | 去背 | 尺寸 |
|---|---|---|---|---|
| 傳送門廣場 | `scene-portal-plaza` | `/assets/games/starlantern/scene/portal-plaza.png` | 不透明 | 418×235（同其他場景；`--fit 418x235`） |
| 傳送門卡片 | `portal-card-<mainline\|blaze\|frost\|storm\|mire\|shade\|iron>` | `/assets/games/starlantern/portal/<region>.png` | 不透明 | 180×110（`--fit 180x110`） |
| 屬性圖示 | `icon-trait-<fire\|ice\|thunder\|poison\|shade\|iron>`（來源 `sheet-trait-icons`，3×2） | `/assets/games/starlantern/icon/trait-<k>.png` | 透明 | 高 32 |
| 事件地磚 | `tile-event-<fountain\|merchant\|altar\|elite\|vault\|vault-open\|key\|trap>`（來源 `sheet-event-tiles`，4×2） | `/assets/games/starlantern/tiles/event-<k>.png` | 透明 | 62×62 畫布（一格地圖），主體置中 |

- `--fit WxH`（不透明）：置中裁成 W:H，再以最近鄰取樣成正好 W×H，不產生新顏色（試過 box 平均＋量化，會讓火把等亮點變灰，不採用）。
- 事件地磚：同一張 sheet 共用一個 block（`shared_block`：最大的主體邊長約 50 美術像素），所以鑰匙與寶庫的大小比例保留；每個主體置中貼到 62×62 透明畫布（`--canvas 62`），放不下時 QA 失敗（`larger than the canvas`）。其餘透明 QA 同共通規定。

## 地形與敵人描述
- f1 林間遺跡：mossy forest ruins, green and grey stone, roots, soft daylight.
- f2 水晶洞窟：dark blue crystal cave, glowing cyan crystals, wet rock.
- f3 星燈神殿：ancient star temple, deep violet stone, gold trim, floating lantern lights.
- slime 苔蘚史萊姆：a round green moss slime with tiny leaves and a small sprout on top.
- bat 遺跡蝙蝠：a grey stone-winged ruin bat with glowing amber eyes.
- wolf 荊棘狼：a lean green-grey wolf with thorny vines growing along its back.
- beetle 晶殼甲蟲：a large beetle whose shell is made of blue crystal plates.
- wisp 冰晶精靈：a floating ice-crystal spirit with a pale cyan core.
- lizard 洞窟蜥蜴：a stocky cave lizard with dark teal scales and crystal spikes.
- golem 神殿石像：a violet stone temple golem with gold inlay and a star emblem on the chest.
- shade 暮影法師：a hooded dusk shadow mage, faceless, holding a dim violet orb.
- lanterneater 燈喰之獸（頭目）：a large boss monster that devours star lanterns, imposing, dark furred beast body with swallowed lanterns glowing through cracks in its chest.

## 參考圖對照
來源：`reference/lineup1/lineup1-magenta.png`、`reference/lineup2/lineup2-magenta.png`（1774×887，各 4 人，左到右順序依其 prompt）。裁切檔在 `reference/crops/<cid>.png`。

| cid | 檔案 | 外接框 (x0,y0,x1,y1) | 外觀要點 |
|---|---|---|---|
| noel 諾艾兒 | lineup1 | 35,40,470,840 | 紫色寬簷魔女帽、青色短鮑伯、星紋大外套、彎木杖 |
| chizuru 千鶴 | lineup1 | 470,55,975,840 | 黑長低馬尾、紅白巫女服、藍繩、薙刀 |
| liz 莉茲 | lineup1 | 895,60,1270,840 | 金色刺短髮、護目鏡、橘圍巾、棕夾克、短褲、雙短刀 |
| sylvie 希爾薇 | lineup1 | 1325,60,1745,840 | 栗色長辮、綠色兜帽斗篷、皮護腕、長弓 |
| scarlet 絲嘉蕾 | lineup2 | 20,40,460,830 | 深紅高馬尾、黑金輕甲、紅短披風、闊劍 |
| selene 瑟蕾 | lineup2 | 455,90,885,830 | 淡紫波浪髮、深藍星紋斗篷、新月髮飾、提燈杖 |
| safira 莎菲拉 | lineup2 | 885,130,1385,830 | 深膚色、白長辮、青綠金色舞衣、飄帶、雙彎刀 |
| bobby 波比 | lineup2 | 1335,100,1760,830 | 粉色雙馬尾、護目鏡、黃色工作吊帶褲、工具腰帶、大扳手 |

服裝收斂：保留髮型、配色、武器；裸露較多的部分（莉茲、莎菲拉的露腹）改成一般冒險服的上衣。

## 審核狀態
以 `registry.json` 為準；`python art-factory/starlantern/tools/sl_art.py status` 印出各狀態數量。
- 去背邊緣清理：預設只清一層、門檻 90，保留真正的淡紫、紫與粉紅邊。視窗框、logo、游標與已核准的 NPC 半身像在登錄表標 `defringe: strong`（最多 3 層、門檻 120、加暗洋紅），因為它們的雜邊較厚。

## 計畫 5d：裝備、素材、技能、稀有度外框與鍛造屋
依據：`docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md`，以及對它有約束力的 `docs/superpowers/plans/2026-10-19-starlantern-plan5d-addendum.md`（數量、批次、核准關卡以補遺為準）與 `docs/superpowers/plans/2026-10-20-starlantern-plan5d-addendum2.md`（圖示大小一致、七階外框＋星輝；三者衝突時補遺 2 優先）。
- 工具：`tools/gear_art.py`（工作表、描述表、`gen`／`cand`／`pick`／`note`／`approve`／`silhouettes`／`publish`／`plan-json`）；審核頁 `tools/review_gear.py <batch>` → `tmp/starlantern/review-gear/index.html`。後處理在 `tools/sl_art.py`（`process_gear_cell`、`nine_slice`、`silhouette`、`Registry.retire`）。
- `art-factory/starlantern/gear-plan.json` 由 `gear_art.py plan-json` 產生並 commit，`render/gearArt.test.ts` 用它和遊戲資料交叉比對（名冊 `data/*.roster.ts` 的 id 不算，歸 5f）。

| 類別 | 數量 | 登錄表 id | runtime（相對 `public`） | 規格 |
|---|---|---|---|---|
| 裝備小圖示（底材 25、特殊 44） | 69 | `gear-<id>` | `/assets/games/starlantern/gear/<id>.png` | 透明，主體長邊正好 22 美術像素（容差 ±1），置中於 26×26 |
| 裝備大圖 | 69 | `gear-<id>-large` | `/assets/games/starlantern/gear/<id>-large.png` | 透明，主體長邊正好 56（容差 ±1），置中於 64×64；和小圖示同一格原圖（`source` 相同） |
| 剪影（地區限定 12＋套裝 6） | 18 | `gear-<id>-silhouette` | `/assets/games/starlantern/gear/<id>-silhouette.png` | 由已核准的 `gear-<id>` 確定性轉出，每邊多 1 px（28×28）；套裝用第一件 |
| 新素材圖示 | 12 | `icon-<matId>` | `/assets/games/starlantern/icon/<matId>.png` | 透明，高 32（`--height 32`） |
| 技能樹技能圖示 | 78 | `icon-<skillId>` | `/assets/games/starlantern/icon/<skillId>.png` | 透明，高 32；夥伴樹 47＋凜 10＋洛恩 21 |
| 稀有度外框 | 6 | `ui-rarity-<magic\|rare\|epic\|legendary\|unique\|set>` | `/assets/games/starlantern/ui/rarity-<r>.png` | 九宮格 16×16，slice 5，中央透明，2 px 邊帶（普通沒有外框） |
| 傳說光暈 | 1 | `ui-glow-legendary` | `/assets/games/starlantern/ui/glow-legendary.png` | 格內光暈：原圖 12×12 的 1 px 淡橘環＋四角 2×2 火花，補 2 px 透明成 16×16，slice 5；疊在圖示下層，`inset: 0` |
| 星輝疊層 | 1 | `ui-starlit` | `/assets/games/starlantern/ui/starlit.png` | 九宮格 16×16，slice 5：四角各一顆四芒星，完全在 5×5 角落內，邊中段與中央全透明（`sheet-starlit-1`，主控裁定 2026-10-20；舊版邊上的星點在 `repeat` 下會連成虛線）；疊在外框之上，只給擲出星輝的傳說、獨特、套裝（暫定 id，5g 定案） |
| 鍛造屋場景 | 1 | `scene-forge` | `/assets/games/starlantern/scene/forge.png` | 不透明 418×235（`--fit 418x235`） |
| 多蘭半身像 | 2 | `npc-forge`、`npc-forge-happy` | `/assets/games/starlantern/npc/forge.png`、`forge-happy.png` | 透明，高 180，`allow_edge: [bottom]` |

- 15 件舊底材圖示（`icon-<base>`）沒有大圖，所以 25 件底材全部重畫在 `gear/`。`gear-<base>` 發布時，`publish` 對仍是 `published` 的 `icon-<base>` 執行 `retire`（原因 `replaced by gear-<base> (plan 5d)`）。
- `retire`：只刪 `public/assets/games/starlantern/` 以下、而且 git 有追蹤的檔（可從 git 復原）；登錄項目保留歷史，`runtime` 移到 `retired_runtime`，狀態 `retired`，manifest 重寫。

### 批次與核准（補遺 S3、S4）
| 批次 | 工作表 | 件數 |
|---|---|---|
| `sample` | `sheet-gear-1`、`sheet-mat-1`、`sheet-rarity-frames-2`、`scene-forge`、`npc-forge` | 34（9×2＋6＋8＋1＋1），另 3 個剪影（補遺 2：外框表改 4×2，舊的 `sheet-rarity-frames` 不再是工作） |
| `main-gear` | `sheet-gear-2`…`-8`、`sheet-mat-2`、`npc-forge-happy` | 127（60×2＋6＋1），另 15 個剪影 |
| `skills` | `sheet-skill-scarlet` 與其餘 7 位夥伴各 1 張、`sheet-skill-rin-1`／`-2`、`sheet-skill-hero-1`…`-4`（共 14 張） | 78 |

- 3×2 技能表放不滿時，空格畫 `plain empty stone slab`，切完丟棄：noel 1 格、rin-2 2 格、hero-4 3 格（照 sheet-icons-3 的先例）。
- `pick` 寫 `chosen_attempt`、`source_id`、`batch`（`gear-5d-<batch>`），**不寫 `runtime`**；`runtime` 只由 `publish` 寫入，和 `artPaths.ts` 的 `NO_ICON_YET` 刪除放在同一個 commit。
- **每一批**都要使用者在審核頁核准後，才可以 `approve --batch B --by "<使用者原話> <YYYY-MM-DD>"`（沒有日期會拒絕），再 `silhouettes`、`publish --batch B`。核准記在登錄表根部 `approved_batches`；`publish` 沒有該批的核准紀錄就拒絕。獨立代理的視覺檢查是交給使用者之前的前置步驟，不能取代使用者核准。
- 核准綁定使用者看到的圖：`review_gear.py <batch>` 把頁面上每張成品的 sha256 記在 `work/review/<batch>-shown.json`（清單欄也印出前 12 碼）。`approve` 在下列任一情況整批拒絕、什麼都不改：沒有這份紀錄、頁面什麼都沒顯示、有 part 未挑選或成品檔不見、有 part 不是 `qa_passed`（例如 `qa_failed`）、成品的 hash 和頁面紀錄不同（審核後又重挑）。重挑之後要重新產生審核頁、重新給使用者看。
- 樣本批只有在 `approve` 成功時才寫 `style_approved`，同時記下風格錨點 `style_anchor`（sheet-gear-1 多數 part 出自的那一版）；`gear-anchor.png` 只由這個紀錄的版本產生。沒有 `style_approved`，`gen` 拒絕生成 `main-gear` 與 `skills` 的任何工作表，`approve` 也拒絕這兩批。
- 已 `approved`／`published` 的 part 不能直接重挑：`pick` 拒絕，除非加 `--reopen`。`--reopen` 先把所有動作檢查一遍（原圖能切格、要刪的檔在 git 追蹤之下、要還原的舊圖示檔還在），任一不通過就什麼都不改；通過後才把已發布的檔 `retire`（刪檔、移出 manifest），清掉 `runtime` 與 `approved_by`，舊狀態記進 `history`，由它轉出的剪影也一起重開。
- 重開會讓該批的核准失效：`approved_batches[B]` 移到 `stale_approvals`，整批要重新產生審核頁、重新給使用者核准。
- 重開一件已發布的 `gear-<base>` 時，它當初取代而退役的 `icon-<base>` 會從登錄表的 `final` 還原回 `public/`、狀態回到 `published`，遊戲不會缺圖示（`artPaths.ts` 要在同一個 commit 跟著改）。
- `approve` 把核准當下每張圖的 hash 存進 `approved_batches[B].shown`。`publish` 發布前重新計算每個要發布的檔：hash 不符、不在紀錄裡、剪影不是由已核准的小圖示確定性轉出、或舊圖示無法退役，就整批拒絕、什麼都不發布。
- 舊的 `sl_art.py approve --id` 與 `sl_art.py publish --approved` 一律拒絕屬於 `gear-5d-*` 批次的 part（訊息指向 `gear_art.py`）；`publish --approved` 在複製任何檔之前就拒絕。
- 樣本重新核准而錨點換了另一版時，已存在的 `gear-anchor.png` 立即重做；`gen` 每次用到錨點也都從 `style_anchor` 重做。
- 剪影只從 `approved`／`published` 的圖示產生；它是確定性轉換，QA 通過就直接標 `approved`（`approved_by: derived from gear-<id>`，`batch` 跟來源相同），失敗就停下回報。

### QA 關卡（`sl_art.py`）
- 裝備格（`kind: gear-cell`，補遺 2 §1）：在高解析度格上 cutout、裁到 alpha bbox，只做一次 centre-sample（`normalize_subject`，不產生新顏色）讓主體長邊**正好**等於目標（大圖 56、畫布 64；小圖示 22、畫布 26），四周補 1 px 透明再置中；`scale = 原圖長邊 ÷ 目標` 小於 1 會變成放大，直接失敗（`cell too small to sample`）。洋紅 hint 用同一個倍率從原圖取樣。兩張都走 `_finish` 的透明 QA（magenta 殘留、半透明、被原圖畫布切到、16 px 以下的洞只列警告）、`larger than the canvas` 與尺寸閘門 `subject_gate`。`fit_side` 保留但裝備格不再用。
- 尺寸閘門（在最終 PNG 上只算 alpha = 255；qa 記 `subject: {long, short, mass, box, centre_off}` 與 `scale`）：

  | 量測 | 小圖示 `gear-<id>` | 大圖 `gear-<id>-large` | reason |
  |---|---|---|---|
  | 主體長邊 | 22±1 | 56±1 | `subject long edge off target` |
  | bbox 中心與畫布中心的距離 | ≤1 | ≤1 | `subject off centre` |
  | 短邊下限 | `ceil(MIN_SHORT[slot] × 22)` | `ceil(MIN_SHORT[slot] × 56)` | `subject too narrow` |
  | 份量 `mass = 不透明像素 ÷ 目標²` | `MASS_BAND[SUBJECT_CLASS[slot]]` | 同左 | `subject too light`／`subject too heavy` |

  | slot | weapon | offhand | head | body | hands | feet | neck | ring |
  |---|---|---|---|---|---|---|---|---|
  | `MIN_SHORT` | 0.70 | 0.75 | 0.65 | 0.80 | 0.70 | 0.70 | 0.60 | 0.60 |
  | 小圖示短邊下限 | 16 | 17 | 15 | 18 | 16 | 16 | 14 | 14 |
  | `SUBJECT_CLASS`（`MASS_BAND`） | long（0.28–0.65）；槍類 polearm（0.20–0.65） | broad（0.50–0.92） | broad | broad | broad | broad | small（0.35–0.80） | small |

  長柄武器（主控裁定 2026-10-20）：0.28 是在 24 px 舊圖示上校的，細桿加槍頭的長柄武器達不到。武器的種類取自遊戲資料的 `WeaponKind`（`gear_art.GEAR_KIND` → `gear-plan.json` 的 `kinds`，`gearArt.test.ts` 與 `EQUIPMENT`／`SPECIALS` 的 `weaponKind` 交叉比對），種類屬於 `sl_art.POLEARM_KINDS`（目前只有 `spear`）的武器用 polearm 份量區間（下限 0.20），短邊下限仍照 weapon；不以 id 判斷。登錄表記 `weapon_kind`。

  主體 bbox（原圖格的裁切與最終 PNG 的量測）不計 4 px 以下（`SPECK_MAX`）的 8 連通小碎點，碎點不會讓主體縮小或偏移；整張都是碎點時才用全部像素。
  slot 來自 `gear_art.GEAR_SLOT`（`gear-plan.json` 的 `slots`，`gearArt.test.ts` 與遊戲資料交叉比對）。門檻是 `sl_art.py` 的常數，不可以在登錄表為個別件加放寬欄位；要改門檻須由主控在帳本記下裁定。`slot` 不給（None）時只檢查長邊與置中。
- QA 規格戳記（主控裁定 2026-10-20；審查第 2 輪改為自動推導）：`gear-cell` 與 `nine-slice` 的 QA 記錄帶 `spec`＝`sl_art.qa_spec(kind)`，格式 `<kind>:<12 位十六進位>`，是 `SPEC_INPUTS[kind]` 列出的全部門檻常數與規則說明（`GEAR_CELL_RULES`／`NINE_SLICE_RULES`）排序後 JSON 的 sha256 前 12 碼；改任何一個門檻，戳記就自動改變，不需要手動升版。測試檢查閘門程式讀到的每個大寫常數（函式本體與預設參數都算，例如 `SPILL_BAND`、`SPECK_MAX`、`COVER_MIN`）都列在 `SPEC_INPUTS` 裡；門檻不寫成行內數字（星光色 `STARLIGHT_*`、白色星心 `STAR_WHITE_*`、角落 `STAR_CORNER`、邊中段外圈 `EDGE_OUTER_ROWS`、裝備目標 `GEAR_LARGE`／`GEAR_ICON`）；改規則邏輯時要同步改規則說明。登錄表的 QA 若是舊規格（`sl_art.qa_stale`：沒有戳記或戳記不同），`approve` 整批拒絕（`QA recorded under an older spec`）；`pick` 每次都在現行規格下重跑 QA，`gear_art.py requa --batch <b>` 對整批過期的挑選照原本的 job 與版本重挑（已核准、已發布的不碰，要先 reopen）；重做的 final 可能換 bytes（例如在 22／56 正規化之前取樣的舊 final），`requa` 會回報並在登錄表 `requa_log` 記下日期、批次、重做的 id 與每個換了 bytes 的 final 的 {old, new} sha256；換了 bytes 的件要重新產生審核頁給使用者看。素材、場景、NPC 的關卡沒變，沒有版本。
- 九宮格（`kind: nine-slice`）：cutout → 主體 bbox → coverage 取樣（`cover_sample`：輸出像素對應的原圖區塊不透明比例 ≥ 0.4 才算不透明，顏色取區塊中最常見的不透明色，不產生新顏色；2 px 邊帶不會被取樣跳掉）成正好 (N − 2×pad)²，再補 `pad` 圈透明 → 一般透明 QA（外框本來就貼齊畫布邊，所以不算 `touches edge`；slice 以內的中央當成背景傳給 `bg_hint`，所以刻意透明的中央不算洞，外框帶內的小洞仍列警告）＋三項檢查：
  - `center_clear`：slice 以內的中央全透明，否則 `centre not clear`；
  - `ring_closed`：上下邊帶的每一欄、左右邊帶的每一列，在 slice 深度內至少有 1 個不透明像素，否則 `ring not closed`；
  - `edge_repeat`：四條邊帶的中段各自當成只左右重複的圖塊，用 `wrap_seam` 量接縫差（seam）與帶內相鄰差（interior），比值 `seam ÷ max(interior, 6)` 須 ≤ 1.25，否則 `edge does not repeat`。分母下限 6（0–255）是因為單色細邊的帶內差只有編碼雜訊（約 ±3），直接相除會讓同一條均勻邊的比值在 0–3.3 之間亂跳；有下限時均勻邊通過，接縫處真正的色差仍然失敗。qa.json 另記 `edge_steps`（每邊的 seam 與 interior）。
  - 邊帶顏色（修正第 1 輪，主控裁定；門檻不變）：取四條邊中段從 pad 到邊帶最深處的全部不透明像素，只留有彩像素（S ≥ 0.25 且 V ≥ 0.30），色相分成 30° 的環狀區間，以最多像素的區間為種子，保留距種子 ±15° 的像素；`hue`（環狀中位數）、`stroke_colour`（中位 RGB）、`saturation` 都只由這群像素算。所以外側的深色描邊、內側的金色細線都不會變成「邊帶顏色」。有彩像素占比 `chroma_share` < 0.3 時（外框與光暈）記 `band colour unreadable`。
  - 依 `role` 的檢查（補遺 2 §2；qa 另記 `stroke: [min, max]`、`reach: {edge, corner}`、`stroke_colour`、`hue`、`saturation`、`chroma_share`）：
    - `frame`：邊中段的邊帶厚度 2–3（`band thinner than 2 px`）；邊中段從外緣往內最深 3、角落（每像素取 min(離兩外緣的深度)）最深 4，超過或邊帶厚於 3 都是 `band reaches into the icon`；邊帶色相與該階色相差 ≤ 15° 且飽和度 ≥ 0.45（`hue off tier`）。
    - `glow`（傳說光暈，pad 2）：邊中段第 0–1 列必須透明（`glow outside its ring`）；厚度 ≤ 2、往內最深 4；色相 35°±15、飽和度 ≥ 0.30。`ring_closed` 在 pad 以內檢查。
    - `overlay`（星輝）：不檢查 `ring_closed` 與邊帶厚度；`edge_repeat` 改為 `edge_joint`：稀疏星點只有在重複時於接縫處併成 2 px 短線（同一列在邊中段的第一欄與最後一欄都有點）才算 `edge does not repeat`；所有不透明像素都要是星光色（色相 170–215° 且 S ≥ 0.2 且 V ≥ 0.7，或 S ≤ 0.15 且 V ≥ 0.85，否則 `not starlight colours`）；四角 5×5 各至少 3 個不透明像素（`starlit corners missing`）；任一邊中段外 2 列的覆蓋率 ≤ 0.35（`overlay hides the frame`）。
    - `corners`（改版星輝，`sheet-starlit-1`）：星光色同上；四個 slice×slice 角落以外不可有任何不透明像素（`starlit outside its corners`：邊中段與中央全透明，重複時不會變虛線）；每角一顆完整的星：至少 3 個像素（`starlit corners missing`）、bbox 至少 3×3 且長寬差 ≤ 1（`starlit corner star cut or too small`）、要有白色星心 S ≤ 0.15 且 V ≥ 0.85（`starlit star too dim`）、是四芒星形（星心的北、南、西、東各有超出星心的尖端，而且星的 bbox 四個角是空的：`starlit star is not a four-point star`；實心方塊、少一個尖端都不過）、不碰圖塊外緣（`starlit star touches the tile edge`；這個 job 畫 14×14、pad 1，所以正常的星不會貼邊）。qa 另記 `outside` 與每角的 `stars`（px、w、h、core、arms、diagonal、edge）。`approve` 另外要求 `ui-starlit` 是 `sheet-starlit-1` 的挑選而且 `qa.role == 'corners'`，否則整批拒絕（外框表 a5 那張會連成虛線的舊星輝永遠不會被核准）。審核頁把 `sheet-starlit-1` 每一版通過 QA 的候選並排（28px 背包格、38px 人形格，疊在傳說、獨特、套裝外框上，1 倍與 3 倍），shown 紀錄另記 `alternatives: {ui-starlit: {aN: sha256}}`；`approve` 接受挑選的 final 等於 `parts` 或任一 alternative 的 hash，核准紀錄存實際的 hash。
  - 七階之間的色差（`frames_distinct`）：六種外框的 `stroke_colour` 兩兩之間 CIE76 ΔE ≥ 25，太近的兩個都記 `too close to <aid> (ΔE n)` 並轉 `qa_failed`。每次處理外框（`cand`／`pick`，含 `--part`）後都對登錄表裡**整組**外框重算，與挑選順序無關：先挑的那一件也會一起失敗，不再成立的舊 `too close to` 會清掉；`approve` 前再對整組重算一次，有太近的就整批拒絕；審核頁的外框段也標出太近的組合（`data-close`）。
  - 外框在登錄表標 `defringe: strong`（同其他 UI 框）。例外：史詩 `#8A5CFF` 離洋紅最遠的一個通道只差 117，落在 strong defringe 的 120 範圍內，會被從外往內剝掉，所以 `ui-rarity-epic` 標 `defringe: default`（`gear_art.frame_defringe`，依色碼自動判斷，不是個別放寬）。
- 剪影（`kind: silhouette`）：只接受 `approved`／`published` 的 `gear-<id>`（否則 `PermissionError`）。不透明像素一律換成 `#1d1a2e`，外圍 8 鄰接的透明格塗成 `#8f86b8` 當輪廓光，畫布每邊多 1 px；只允許這兩色、沒有半透明、不透明像素數 ≥ 原圖。
- 素材、技能、場景、NPC 沿用 `_finish`。
- 洋紅溢色（magenta spill，計畫 5d 的透明素材都做）：key 色被抗鋸齒混進外框線，會留下 (48,4,56)、(137,52,136)、(250,42,136) 這類暗紫、灰紫、粉紅邊，原本的殘色檢查抓不到。定義：不透明像素的 R 與 B 都比 G 高至少 30，而且色相在 280–345 度之間（270 度以下的紫是美術本身）。
  - `despill`（確定性）：主體外緣 2 px 內的溢色像素，R 與 B 各減掉 min(R, B) − G，暗紫變回黑框、粉紅變回紅；alpha 不變，更內側的像素不動。裝備格、九宮格外框、素材與技能圖示、NPC 都做。
  - QA：處理後整張圖的溢色像素數記在 `magenta_spill`，超過 2 就失敗（`magenta spill`）；美術本身真的有洋紅時，在登錄表寫 `allow_magenta_spill: <數量>` 並記原因。

### Prompt 範本（完整句子在 `gear_art.py`）
- 共通：`flat pure magenta #FF00FF gutters and margin`、`No text, no numbers, no frames, no badge or circle behind the item`、原創句 `The design must be original and not resemble any existing game item.`，句尾沿用 `portal.py` 的 `PIX` 與 `GEN`。prompt 不寫任何作品名或畫師名。
- 裝備表（`GEAR_SHEET`、每格 `GEAR_DESC`，補遺 2）：每件置中、長向填滿格子約九成、`all items at the same scale so they look equally big`；長兵器斜放、刃與柄至少 6 美術像素寬；盾、鎧、盔、手套、靴正面、粗壯、兩個方向都填滿（盾寬至少是高的四分之三；成對的手套、靴並排重疊）；戒指與項鍊一樣畫大；為 24 px 設計（2 px 深色描邊、每種材質最多三階平塗、一個大徽記、沒有小於 3 美術像素的細節）；格與格之間至少 60 px 的洋紅通道。稀有度定語氣：底材樸素低飽和不發光；傳說以底材為骨架加角色或地區母題與橘色硬邊餘燼；獨特加金色細工與一個故事母題；套裝共用配色與徽記（`SET_STYLE`；套裝的鎧與手甲是 `a chunky front-facing breastplate`、`a pair of chunky gauntlets side by side`）。武器照資料的種類畫：星紋軍刀是彎刀（scimitar）；晶刃與無聲之刃是短刃，因為長邊統一，改靠比例區分（`a stubby dagger: a short broad blade and a large hilt, clearly stubbier in proportion than a sword`）。
- 參考圖：樣本批附 `raw/portal-refs/icons-old-x8.png`；量產批另附 `raw/gear-refs/gear-anchor.png`（`gen` 由已核准的 sheet-gear-1 原圖縮半自動產生）；角色傳說附 `reference/crops/<cid>.png`；`set-blaze-ring`（sheet 6）附 sheet-gear-1 已核准的原圖。
- 素材表（`MAT_DESC`）：`about 28 by 28 art pixels`；精華是同一顆結晶滴的四階（灰白、藍、黃、橘）；地區素材照 `portal.py` 的 `TRAITS` 配色。
- 技能表（`SKILL_DESC`）：`about 28 by 28 art pixels, one bold emblem`，依角色配色；夥伴附 `reference/crops/<cid>.png`，洛恩與凜沒有 crop，改附已核准的 `char-hero-standee`、`char-rin-standee`（凜用誓約前的樣子）。
- 外框表（`sheet-rarity-frames-2`，`FRAME_SHEET`／`FRAME_DESC`，補遺 2）：4×2 共 8 格，依序魔法、稀有、史詩、傳說、獨特、套裝、傳說光暈、星輝。六個外框各正好 16×16 大像素、中央平塗洋紅、單一 2 大像素寬的邊帶、角飾限在 4×4 角落內、邊中段素面可重複、每框只用一個色相（深淺兩階）；色碼與角飾逐階往上加（見下表）；光暈是 12×12 的 1 大像素淡橘環加四角火花；星輝是四角四芒星加稀疏星點。句尾用 `PIX`、`No text` 與原創句。

  | 階 | 主色 | 色相 | 外框造型 |
  |---|---|---|---|
  | 普通 common | `#c9c9d4` | — | 沒有外框 |
  | 魔法 magic | `#3f7fff` | 220° | 2 px 實心邊帶，直角，沒有角飾 |
  | 稀有 rare | `#ffe03a` | 51° | 邊帶＋每角一顆 2×2 鉚釘 |
  | 史詩 epic | `#8a5cff` | 257°（只能在 250–272°，偏粉的紫會被洋紅去背吃掉） | 邊帶，四角切 45°，每角一顆小菱形寶石 |
  | 傳說 legendary | `#ff7a14` | 26° | 邊帶＋每角火舌角飾；另有格內光暈 |
  | 獨特 unique | `#d8283a` | 354° | 邊帶＋1 px 金色內緣線與雕花角飾（實際挑選沒有金線：細金線縮到 16 格會斷成雜點，主控 2026-10-20 已接受只用緋紅邊帶＋雕花角飾） |
  | 套裝 set | `#3fd05a` | 131° | 邊帶＋每角一片葉形徽記 |
  | 星輝疊層 | `#e8fbff`／`#7fe6ff` | 190° | 四角各一顆四芒星（完全在 5×5 角落內），邊與中間全透明（`sheet-starlit-1`）；只疊在擲出星輝的傳說、獨特、套裝上 |
  | 傳說光暈 | 色相 35°±15，S ≥ 0.30 | | 格內一圈 1 px 淡橘光，四角各一個 2×2 火花 |

  色盤在 `gear_art.RARITY_PALETTE`；六種外框兩兩 ΔE 最小 32.9（魔法對史詩），門檻 25。28 px 背包格的層次：外框邊帶第 0–1 px、光暈第 2 px、主體第 3–24 px；CSS `border-image-repeat: repeat`（不用 `round`，38 px 人形格才不會非整數縮放）。
- 星輝改版（`sheet-starlit-1`，`STARLIT_SHEET`，主控裁定 2026-10-20）：單張 1×1，不切格（四顆分開的星會被當成好幾格），整張就是一格。畫成 14×14 大像素；四角各一顆 3×3 的十字星：白色星心 1 格，上下左右各一格淡青白尖端，3×3 的四個角留空，外側兩個尖端碰到 14×14 的外緣（主控裁定 2026-10-20：a2 的 4×4 白心 2×2 在 1 倍下是圓點，a3 改畫十字星；兩種造型交給使用者在 G1 選）；邊中段與中央全透明、沒有描邊。角色 `('corners', 16, 5, 1)`：取樣到 14 後補 1 圈透明成 16，星落在 5 px 角落內的第 1–4 格，不碰圖塊外緣。版數上限 a1–a3（`gear_art.ATTEMPT_CAP`：sheet-gear-1 到 a9、外框表到 a5，`gen` 到上限就拒絕）。外框表本身不變；新版通過之前，星輝沿用外框表 a5 的挑選。
- 鍛造屋：`UI_SCENES` 句型，附 `bg-f1` 已發布原圖；多蘭沿用 `UI_NPCS` 句型與 `JP` 前綴，附 `char-scarlet-standee`；笑臉附已核准的 `npc-forge`。

### 交給 5f 的東西（補遺 §2）
- `process_gear_cell` 接受任何 id，不寫死 69 件；`slot` 參數預設 None（只檢查長邊與置中），5f 的專屬獨特要傳入自己的 slot，才會套用同一套尺寸閘門（補遺 2 §7-10）；
- `sheet-gear-1` 的核准原圖（`gear-anchor.png`）是 5f 專屬獨特的風格錨點；
- `ui-rarity-unique` 外框由 5f 的專屬獨特直接沿用；
- 素材圖示規格同上表（`--height 32`），5f 的素材表附 5d 已核准的素材圖當參考。
