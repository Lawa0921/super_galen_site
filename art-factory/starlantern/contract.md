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
