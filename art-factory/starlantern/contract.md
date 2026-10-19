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
依據：`docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md`，以及對它有約束力的 `docs/superpowers/plans/2026-10-19-starlantern-plan5d-addendum.md`（數量、批次、核准關卡以補遺為準）。
- 工具：`tools/gear_art.py`（工作表、描述表、`gen`／`cand`／`pick`／`note`／`approve`／`silhouettes`／`publish`／`plan-json`）；審核頁 `tools/review_gear.py <batch>` → `tmp/starlantern/review-gear/index.html`。後處理在 `tools/sl_art.py`（`process_gear_cell`、`nine_slice`、`silhouette`、`Registry.retire`）。
- `art-factory/starlantern/gear-plan.json` 由 `gear_art.py plan-json` 產生並 commit，`render/gearArt.test.ts` 用它和遊戲資料交叉比對（名冊 `data/*.roster.ts` 的 id 不算，歸 5f）。

| 類別 | 數量 | 登錄表 id | runtime（相對 `public`） | 規格 |
|---|---|---|---|---|
| 裝備小圖示（底材 25、特殊 44） | 69 | `gear-<id>` | `/assets/games/starlantern/gear/<id>.png` | 透明，長邊 24 美術像素，置中於 26×26 |
| 裝備大圖 | 69 | `gear-<id>-large` | `/assets/games/starlantern/gear/<id>-large.png` | 透明，長邊 60，置中於 64×64；和小圖示同一格原圖（`source` 相同） |
| 剪影（地區限定 12＋套裝 6） | 18 | `gear-<id>-silhouette` | `/assets/games/starlantern/gear/<id>-silhouette.png` | 由已核准的 `gear-<id>` 確定性轉出，每邊多 1 px（28×28）；套裝用第一件 |
| 新素材圖示 | 12 | `icon-<matId>` | `/assets/games/starlantern/icon/<matId>.png` | 透明，高 32（`--height 32`） |
| 技能樹技能圖示 | 78 | `icon-<skillId>` | `/assets/games/starlantern/icon/<skillId>.png` | 透明，高 32；夥伴樹 47＋凜 10＋洛恩 21 |
| 稀有度外框 | 5 | `ui-rarity-<magic\|rare\|legendary\|unique\|set>` | `/assets/games/starlantern/ui/rarity-<r>.png` | 九宮格 16×16，slice 5，中央透明 |
| 傳說光暈 | 1 | `ui-glow-legendary` | `/assets/games/starlantern/ui/glow-legendary.png` | 九宮格 20×20，slice 7，中央透明，硬邊階梯色 |
| 鍛造屋場景 | 1 | `scene-forge` | `/assets/games/starlantern/scene/forge.png` | 不透明 418×235（`--fit 418x235`） |
| 多蘭半身像 | 2 | `npc-forge`、`npc-forge-happy` | `/assets/games/starlantern/npc/forge.png`、`forge-happy.png` | 透明，高 180，`allow_edge: [bottom]` |

- 15 件舊底材圖示（`icon-<base>`）沒有大圖，所以 25 件底材全部重畫在 `gear/`。`gear-<base>` 發布時，`publish` 對仍是 `published` 的 `icon-<base>` 執行 `retire`（原因 `replaced by gear-<base> (plan 5d)`）。
- `retire`：只刪 `public/assets/games/starlantern/` 以下、而且 git 有追蹤的檔（可從 git 復原）；登錄項目保留歷史，`runtime` 移到 `retired_runtime`，狀態 `retired`，manifest 重寫。

### 批次與核准（補遺 S3、S4）
| 批次 | 工作表 | 件數 |
|---|---|---|
| `sample` | `sheet-gear-1`、`sheet-mat-1`、`sheet-rarity-frames`、`scene-forge`、`npc-forge` | 32（9×2＋6＋6＋1＋1），另 3 個剪影 |
| `main-gear` | `sheet-gear-2`…`-8`、`sheet-mat-2`、`npc-forge-happy` | 127（60×2＋6＋1），另 15 個剪影 |
| `skills` | `sheet-skill-scarlet` 與其餘 7 位夥伴各 1 張、`sheet-skill-rin-1`／`-2`、`sheet-skill-hero-1`…`-4`（共 14 張） | 78 |

- 3×2 技能表放不滿時，空格畫 `plain empty stone slab`，切完丟棄：noel 1 格、rin-2 2 格、hero-4 3 格（照 sheet-icons-3 的先例）。
- `pick` 寫 `chosen_attempt`、`source_id`、`batch`（`gear-5d-<batch>`），**不寫 `runtime`**；`runtime` 只由 `publish` 寫入，和 `artPaths.ts` 的 `NO_ICON_YET` 刪除放在同一個 commit。
- **每一批**都要使用者在審核頁核准後，才可以 `approve --batch B --by "<使用者原話> <YYYY-MM-DD>"`（沒有日期會拒絕），再 `silhouettes`、`publish --batch B`。核准記在登錄表根部 `approved_batches`；`publish` 沒有該批的核准紀錄就拒絕。獨立代理的視覺檢查是交給使用者之前的前置步驟，不能取代使用者核准。
- 樣本批核准時另寫 `style_approved`。沒有它，`gen` 拒絕生成 `main-gear` 與 `skills` 的任何工作表，`approve` 也拒絕這兩批。
- 剪影只從 `approved`／`published` 的圖示產生；它是確定性轉換，QA 通過就直接標 `approved`（`approved_by: derived from gear-<id>`，`batch` 跟來源相同），失敗就停下回報。

### QA 關卡（`sl_art.py`）
- 裝備格（`kind: gear-cell`）：`fit_side` 以主體長邊決定 block（`ceil(長邊 ÷ 目標)`），大圖目標 60、畫布 64，小圖示目標 24、畫布 26；兩張都走 `_finish` 的透明 QA（magenta 殘留、半透明、被原圖畫布切到、16 px 以下的洞只列警告）與 `larger than the canvas`。
- 九宮格（`kind: nine-slice`）：cutout → 主體 bbox → 最近鄰取樣成正好 N×N（不產生新顏色）→ 一般透明 QA（外框本來就貼齊畫布邊，所以不算 `touches edge`）＋三項檢查：
  - `center_clear`：slice 以內的中央全透明，否則 `centre not clear`；
  - `ring_closed`：上下邊帶的每一欄、左右邊帶的每一列，在 slice 深度內至少有 1 個不透明像素，否則 `ring not closed`；
  - `edge_repeat`：四條邊帶的中段各自當成只左右重複的圖塊，用 `wrap_seam` 量接縫比值，須 ≤ 1.25，否則 `edge does not repeat`。
  - 外框在登錄表標 `defringe: strong`（同其他 UI 框）。
- 剪影（`kind: silhouette`）：只接受 `approved`／`published` 的 `gear-<id>`（否則 `PermissionError`）。不透明像素一律換成 `#1d1a2e`，外圍 8 鄰接的透明格塗成 `#8f86b8` 當輪廓光，畫布每邊多 1 px；只允許這兩色、沒有半透明、不透明像素數 ≥ 原圖。
- 素材、技能、場景、NPC 沿用 `_finish`。

### Prompt 範本（完整句子在 `gear_art.py`）
- 共通：`flat pure magenta #FF00FF gutters and margin`、`No text, no numbers, no frames, no badge or circle behind the item`、原創句 `The design must be original and not resemble any existing game item.`，句尾沿用 `portal.py` 的 `PIX` 與 `GEN`。prompt 不寫任何作品名或畫師名。
- 裝備表（`GEAR_SHEET`、每格 `GEAR_DESC`）：`each item drawn alone, about 64 by 64 art pixels, three-quarter item-icon view, long weapons on the diagonal with the hilt lower left and the tip upper right, light from the upper left, a bold readable silhouette that still reads at 24 pixels`。稀有度定語氣：底材樸素低飽和不發光；傳說以底材為骨架加角色或地區母題與橘色硬邊餘燼；獨特加金色細工與一個故事母題；套裝共用配色與徽記（`SET_STYLE`）。武器照資料的種類畫：晶刃是短刃（dagger）、星紋軍刀是彎刀（scimitar）。
- 參考圖：樣本批附 `raw/portal-refs/icons-old-x8.png`；量產批另附 `raw/gear-refs/gear-anchor.png`（`gen` 由已核准的 sheet-gear-1 原圖縮半自動產生）；角色傳說附 `reference/crops/<cid>.png`；`set-blaze-ring`（sheet 6）附 sheet-gear-1 已核准的原圖。
- 素材表（`MAT_DESC`）：`about 28 by 28 art pixels`；精華是同一顆結晶滴的四階（灰白、藍、黃、橘）；地區素材照 `portal.py` 的 `TRAITS` 配色。
- 技能表（`SKILL_DESC`）：`about 28 by 28 art pixels, one bold emblem`，依角色配色；夥伴附 `reference/crops/<cid>.png`，洛恩與凜沒有 crop，改附已核准的 `char-hero-standee`、`char-rin-standee`（凜用誓約前的樣子）。
- 外框表（`FRAME_DESC`）：`six square pixel-art item-slot frames, each a thin 2-pixel border with small ornamental corners, the inside of each frame perfectly flat magenta, straight edge segments designed to repeat`；第 6 格是寬 3 px 的橘色硬邊階梯光暈。
- 鍛造屋：`UI_SCENES` 句型，附 `bg-f1` 已發布原圖；多蘭沿用 `UI_NPCS` 句型與 `JP` 前綴，附 `char-scarlet-standee`；笑臉附已核准的 `npc-forge`。

### 交給 5f 的東西（補遺 §2）
- `process_gear_cell` 接受任何 id，不寫死 69 件；
- `sheet-gear-1` 的核准原圖（`gear-anchor.png`）是 5f 專屬獨特的風格錨點；
- `ui-rarity-unique` 外框由 5f 的專屬獨特直接沿用；
- 素材圖示規格同上表（`--height 32`），5f 的素材表附 5d 已核准的素材圖當參考。
