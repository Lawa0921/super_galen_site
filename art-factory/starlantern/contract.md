# 星燈迷宮 asset contract

依據：`docs/superpowers/specs/2026-10-14-starlantern-drpg-design.md` 第 5 節；執行計畫：`docs/superpowers/plans/2026-10-15-starlantern-plan2-art.md`。

## 共通
- 生成：`python art-factory/starlantern/tools/codex_still.py generate --workdir C:/Users/bag57/art-refs/starlantern/raw/<id> --name <id>-a<N>.png --prompt-file art-factory/starlantern/prompts/<id>.txt [--image ...]`；每次重試換新檔名（a1、a2…），每個 id 最多 3 次，超過就回報。
- 後處理：`python art-factory/starlantern/tools/sl_art.py process --id <id> --raw <raw> --kind <kind> [...]`。
- 風格：16-bit 日式 RPG 像素畫、粗輪廓 1 px 深色線、有限色盤（每張 ≤ 32 色）、無抗鋸齒、無文字、無浮水印。
- 背景：透明素材一律畫在純 #FF00FF 上，主體四周至少留 8% 空白；不透明素材滿版。
- 原創：不得模仿既有作品角色、標誌、商標；prompt 裡不寫任何作品名或畫師名。
- 原圖保存在 `C:\Users\bag57\art-refs\starlantern\raw\<id>\`；repo 內保存 prompt、gen.json、gate.json、qa.json 與成品。
- QA（`sl_art.py` 自動）：透明素材不得有 magenta 殘留、半透明像素、碰到畫布邊、主體內封閉透明洞（除非登錄表 `allow_holes` 另訂）；可拼接圖塊 `seam` ≤ 24。

## 各類規格

| 類別 | id | runtime 路徑（相對 `public`） | 去背 | 像素尺寸（美術像素） |
|---|---|---|---|---|
| 立繪 | `char-<cid>-standee` | `/assets/games/starlantern/char/<cid>-standee.png` | 透明 | 高 88–120 |
| 頭貼 | `char-<cid>-portrait`、`char-<cid>-portrait-hurt` | `/assets/games/starlantern/char/<cid>-portrait.png`、`-portrait-hurt.png` | 透明 | 48×48 方框內 |
| 地圖隊伍 | `map-party-<dir>` | `/assets/games/starlantern/map/party-<dir>.png` | 透明 | 高 20–28 |
| 圖塊 | `tile-f<n>-<tile>` | `/assets/games/starlantern/tiles/f<n>-<tile>.png` | 不透明 | 32×32 |
| 戰鬥背景 | `bg-f<n>` | `/assets/games/starlantern/bg/f<n>.png` | 不透明 | 寬 320–480，16:9 |
| 敵人 | `enemy-<eid>` | `/assets/games/starlantern/enemy/<eid>.png` | 透明 | 高 48–112；頭目 120–200 |
| 圖示 | `icon-<id>` | `/assets/games/starlantern/icon/<id>.png` | 透明 | 24×24 方框內 |
| 特效 | `fx-<key>` | `/assets/games/starlantern/fx/<key>.png` | 透明 | 高 32–96 |
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
- 介面框：`A 48 by 48 pixel art UI panel frame, dark navy fill, ornate brass border 16 pixels wide with star-lantern motif corners, edges designed to repeat, fills the canvas edge to edge, no text.`

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
