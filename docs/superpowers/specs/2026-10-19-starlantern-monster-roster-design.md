# 星燈迷宮：怪物名冊擴充設計（Monster Roster）

日期：2026-10-19
狀態：草案，待使用者核准
起因：使用者：「怪物的種類目前也太少」。
依據（皆已讀過程式碼與文件）：
- `src/scripts/games/starlantern/data/enemies.ts`、`data/floors.ts`、`data/regions.ts`
- `engine/scaling.ts`（`encounterTable`、`scaleEnemy`、`DEEP_ENEMIES`、`ENEMY_POWER`、`PARTY_SCALE`、`BOSS_PARTY_SCALE`、`GROUP_CAP`）
- `engine/battle.ts`（敵人 AI `chooseEnemyActions`、`planEnemies`、`createBattle`）、`engine/skills.ts`（`applyEffect`）、`engine/combatant.ts`
- `engine/events.ts`（`eliteGroup`）、`engine/game.ts`（遇敵、精英、頭目、`battleGear`）
- `engine/sim.ts`、`engine/balance*.test.ts`（第 1–20 項平衡帶）
- `engine/story/handbook.ts`、`ui2/scenes/handbook.ts`（手冊的「圖鑑」頁）
- `render/artPaths.ts`、`render/artPaths.test.ts`（`allArtUrls` 釘在 246）、`render/BattleView.ts`（地區色調）
- `art-factory/starlantern/contract.md`、`registry.json`、`tools/batch.py`、`prompts/enemy-*.txt`
- `docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md`、`2026-10-18-starlantern-affinity-expressions-design.md`
- `docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md`、`2026-10-18-starlantern-plan6c-writing.md`

標記規則：本文件所有數值（屬性、機率、經驗、表格權重）都是**提案**，必須通過平衡模擬才能定案。標「決定」的是本文件的設計判斷，核准時可以改。

---

## 1. 現況（讀過程式碼）

### 1.1 名冊
- 一般怪物只有 **8 種**（`NORMAL_ENEMIES`，`scaling.test.ts` 釘死長度 8）：
  - 第 1 層：`slime`、`bat`、`wolf`
  - 第 2 層：`beetle`、`wisp`、`lizard`
  - 第 3 層：`golem`、`shade`
- 頭目只有 **1 種**：`lanterneater`。
  - 本道第 3 層（劇情）、每個 5 的倍數層、所有地區的頭目層，全部都是它，只是依深度放大。
  - 終幕的「燈喰之母」也是它：`FINALE_BOSS = { base: 'lanterneater', power: 0.8 }`，只換名字。
- 劇情敵人 1 種：`scarlet-foe`（借絲嘉蕾立繪，`look`）。

### 1.2 遇敵怎麼組
- `encounterTable(region, depth)`：
  - 本道：用該深度地形（`terrainOf`，1→2→3 循環）的那一層 `FLOORS[n].encounters`。所以**本道第 25 層遇到的還是第 1 層的史萊姆**，只是被 `growth()` 放大。
  - 地區：把 `id ≤ depth` 的各層表合在一起（第 3 層以後就是固定的 11 組）。
- `encounterGroup` 從表裡 `pick` 一組，**只從 `game.rng` 抽一次**。
- 精英：`eliteGroup(run, depth)` 用自己加鹽的 `mulberry32(run.seed ^ depth*0x9e3779b1 ^ 0xe11e)`，從同一張表挑一組，第一隻當精英（`ELITE`：hp ×2.2、atk ×1.3、報酬 ×3）。

### 1.3 「變體」其實已經有了
- 地區變體：`scaleEnemy` 加名字前綴（「熾焰・荊棘狼」），**用地區的弱點與抗性整個蓋掉**怪物自己的（劇情敵人除外），加地區技能與地區素材。
- `BattleView` 在執行期用 ColorMatrix 濾鏡上色（`tintKey`）。
- 所以「換色變體」已經在用，而且不花美術。玩家抱怨「太少」的原因不是缺色，是**同樣 8 個剪影從第 1 層看到第 30 層**。結論：擴充必須以**新物種**為主，換色只是倍增器（§3.3）。

### 1.4 敵人能做的事
- 敵人技能 `EnemySkill { name, chance, target, effects }`，`chooseEnemyActions` 依序對每個技能抽一次 `rng() < chance`，抽中第一個就用，否則普攻。
- 現有 `Effect` 已經支援、可以直接拿來給敵人用（**不需要引擎工作**）：
  - `damage`：`hits`（多段）、`crit: 'always'`、`melee: false`（打得到後排）、`execute`、`wounded`；
  - `inflict`：`poison`、`sleep`（頭目抵抗減半）；
  - `buff`：負的 `pct` 就是減益（`addBuff` 依正負號分開存，最多 `MAX_BUFFS = 3`）；
  - `heal`、`buff` 對 `ally`／`allies`：敵方的 `resolveTargets` 已經會找敵方的隊友（`ally` 找血量比例最低的）；
  - `target`：`enemy`、`enemies`、`row`、`column`、`cross`、`self`、`ally`、`allies`。
- 只有 2 種狀態：`poison`、`sleep`。

### 1.5 平衡模擬怎麼取樣
- 平衡帶**窮舉**整張 `encounterTable`：`winRate(level, groups, …)` 對每一組跑 N 個種子。
- 所以：**新怪物只要進了 `encounterTable`，就自動進入第 7、8、9、10、12、17、18、19a 項**。不需要另外「抽樣」；反過來說，進表的那一刻，所有凍結帶都會量到它。
- 頭目帶（第 6、11、14、16、18e、19b 項）寫死 `'lanterneater'` 或 `FINALE_BOSS.base`。新頭目不會被它們量到，需要新帶（§6.3）。

### 1.6 美術
- 敵人圖都是**單張、單格、透明 PNG**（沒有動畫格、沒有表情）。戰鬥中的晃動、閃白、上色都是程式做的。
- 已發布尺寸（美術像素）：slime 53×53、bat 119×65、wolf 55×67、beetle 78×65、wisp 50×65、lizard 76×68、golem 72×67、shade 39×68、lanterneater 147×154。
- 後處理：`sl_art.py process --kind sprite --height 64`（一般）／`--height 150`（頭目）。prompt 寫「about 72 art pixels tall」／「about 160 art pixels tall」。
- 風格錨點：每張敵人 prompt 都附上已核准的 `enemy-slime` 原圖。
- `allArtUrls()` 對 `ENEMIES` 裡每個沒有 `look` 的 id 都列一張 `art.enemy(id)`。**只要把新 id 加進 `ENEMIES`，246 就會變**，`published.test.ts` 也會去找磁碟上的檔案。這決定了 §8 的開關設計。

### 1.7 圖鑑
- 已經有一個很陽春的：手冊第 4 頁「圖鑑」（`CodexPage.monsters`）。
  - 它列出**全部**非劇情敵人（連沒遇過的都列）；
  - 只顯示名字與已揭露的弱點（`state.revealed`）；
  - 沒有圖、沒有介紹、沒有遇過／擊倒的紀錄。

---

## 2. 目標、非目標、反目標

**目標**
1. 玩家在任何一段連續 5–6 層的路程裡，看到的怪物組合都會明顯換一批。量化：§3.4 的「新鮮度」驗收。
2. 每種新怪物都要「打起來不一樣」，不是改數字：至少一個行為讓玩家改變選擇（先打誰、要不要防禦、要不要留 TP）。
3. 頭目不再全是燈喰之獸。
4. 任何隊伍組成都要可以用（使用者規則）：沒有任何新機制讓某種職業變成必帶。
5. 凍結的平衡帶一個都不放寬；只加新帶。
6. 沒有核准美術的怪物不上線（不用佔位圖）。

**非目標**
- 新素材、新圖示（新怪物掉既有素材，§4.6）。
- 懸賞任務（第 2 項）。本文件只留接口（§4.8）。
- 怪物動畫格。沿用單張圖＋程式動畫。

**反目標**
- 不改既有 8 種怪物與燈喰之獸的定義、技能、表格。第 1–3 層（新手區）一個位元都不變。
- 不動任何既有平衡旋鈕（`ENEMY_POWER`、`DEEP_ENEMIES`、`PARTY_SCALE`、`BOSS_PARTY_SCALE`、`GROUP_CAP`、`ELITE`）。新怪物只能調**自己**的數字。
- 不用 `Math.random`；不從既有 rng 串流多抽（§5.3）。

---

## 3. 名冊規模與分佈（決定）

### 3.1 深度帶
| 帶 | 深度 | 對應劇情（story spec §8.4） | 主題 |
|---|---|---|---|
| A | 1–3 | 第一幕 | **不變**：既有 8 種＋燈喰之獸（新手區、平衡第 1–6、13、15 項的地基） |
| B | 4–9 | 第二幕：燈芯在深處、迷宮是燈變質長出來的 | 「霧根層」：鎮民日常的記憶被吞下去後長出的迴響 |
| C | 10–15 | 第三幕：靜鐘會、主角被殺過很多次 | 「鐘聲層」：鐘、獵人、成對的影子 |
| D | 16–24 | 第四幕：艾斯特拉、守燈人 | 「碑文層」：古城的衛像、鎮魂歌、燈喰的幼體 |
| E | 25–30+ | 終幕：星燈之底、燈喰之母 | 「燈芯層」：燭芯、提燈人、餘燼。30 層之後的無限深度沿用 E |

`bandOf(depth)`：`≤3 → 'A'`、`≤9 → 'B'`、`≤15 → 'C'`、`≤24 → 'D'`、其餘 `'E'`。

### 3.2 數量（決定）
| 類別 | 本道 | 地區（6 個） | 合計 | 新美術 |
|---|---|---|---|---|
| 一般怪物 | B 4、C 4、D 4、E 3，另有跨帶的寶物怪 1 = **16** | 每區 3 種原生 = **18** | **34** | 34 |
| 頭目 | 第 5、10、15、20、25 層各 1 = 5，另有燈喰之母 1 = **6** | 每區 1 = **6** | **12** | 12 |
| 頭目部件（多部位頭目的手／柱） | 1 | 1 | **2** | 2 |
| 精英詞綴（不是新物種） | 5 種，任何物種都能帶 | 同左 | 5 | 0 |
| **新怪物定義合計** | | | **48** | **48 張** |

每帶每區的分佈（玩家實際遇到的種類數，含延續物種與舊物種）：

| 深度帶 | 本道：新物種 | 本道：同表其他物種 | 本道表內種類 | 地區表內種類（原生 3＋本道該帶 6 組的物種） | 頭目 |
|---|---|---|---|---|---|
| A 1–3 | 0 | 舊 8 | 3（每層） | 舊表合併（不變） | 燈喰之獸（第 3 層，劇情） |
| B 4–9 | 4＋寶物怪 | 舊 6（wolf、wisp、lizard、beetle、golem、shade） | 11 | 3＋約 6 | 第 5 層 `fog-warden`（地區第 5 層：地區頭目） |
| C 10–15 | 4 | B 帶 4 種延續、舊 2（golem、shade） | 11 | 3＋約 6 | 第 10 層 `silent-bell`；第 15 層 `hollow-champion`（地區第 15 層：地區頭目） |
| D 16–24 | 4 | C 帶 3 種延續 | 8 | 3＋約 6 | 第 20 層 `estra-archon` |
| E 25–30+ | 3 | D 帶 4 種延續 | 8 | 3＋約 6 | 第 25 層 `gorged-beast`；第 30 層 `lantern-mother` |

理由：
- 每帶 4 個新物種＋延續上一帶，所以每過一帶，表內大約一半是新面孔，另一半是「認得的」。這比整批換掉更像 DRPG 的地層感，也讓每一帶的平衡有連續性。
- 地區 3 種原生，不是 1 種：只有 1 種的話，地區跑 10 層還是在打同一隻。
- 頭目每 5 層換一隻，終於不再全是燈喰之獸。地區頭目 6 隻，地區在 5、15、25…層打自己的頭目；10、20、30…層打該深度本道頭目的地區上色版（零美術）。

### 3.3 換色／詞綴變體 vs 新物種（決定：混合，新物種為主）
- **換色（地區色調）**：已經有了（§1.3）。新物種一進表就自動得到 6 個地區上色版。等於 34 種 × 7 個地方的外觀組合，**0 張新圖**。
- **精英詞綴（新，0 張圖）**：「飽食個體」，吞了太多記憶而變怪的個體（story spec §3.1）。5 種詞綴（§4.7），畫面用既有的精英色調＋名字標籤。
- **新物種（48 張圖）**：負責剪影的多樣性，這是玩家真正抱怨的東西。
- 比例：新剪影 48；免費變體（地區 7 × 物種 42 ≈ 294 種外觀，加上精英詞綴 5 種）。換色不能取代新物種：同一個剪影換顏色，玩家一眼就認得是同一隻。

### 3.4 「不會一直看到同一批」的量化驗收
`roster.test.ts` 的 `freshness`：
- 對本道的每個深度 d（4–40），計算 `encounterTable('mainline', d)` 出現的物種集合 S(d)。
- 任兩個相差 ≥ 6 層的深度，|S(a) ∩ S(b)| / |S(a)| ≤ 0.6（6 層以上就有至少四成是新面孔）。
- 任一深度的表至少有 7 種物種（含舊物種），每種物種最多出現在表內 40% 的組。
- 地區（depth ≥ 4）：表內至少 3 種原生物種，原生組至少佔表的 40%。

---

## 4. 每隻怪物的設計

### 4.1 世界觀總則（決定，與 story spec 一致）
- **怪物是霧生的迴響**：迷宮吞下的記憶，在暮霧裡凝成形體。牠們長成原本那段記憶的樣子：沒寄出的信、等不到孩子回家的玩具兵、沒人敲的鐘。
- 越深，被吞的記憶越古老：淺層是露米亞鎮民的日常，深層是艾斯特拉古城的悲傷，最底下是一輪又一輪守燈人自己的記憶。
- 語氣：一路上是暗的，但不殘忍、不血腥。每一隻都帶一點「想被記住」的哀傷；圖鑑的介紹在終幕之後會多一句「牠們回到原主人身上了」的語氣（§7）。
- **防劇透**：名字不能早於劇情節點揭露事實。例如 E 帶的提燈人取名「無名的提燈人」，不寫「守燈人」；牠的圖鑑介紹第二句在第四幕之後才顯示（§7.3）。

### 4.2 數值形狀（決定方法；數字是提案）
- 所有新的一般怪物都用 `floor: 3`（家鄉等級 Lv10，`homeLevel`），由既有的 `growth()` 放大到遇到的深度。理由：
  - 成長曲線（`growth`、`DAMPING`、`enemySecondary`、`compensation`、`ENEMY_POWER`、`DEEP_ENEMIES`）全部沿用，**不需要新曲線**；
  - `rewardGrowth` 用 `HOME_SPAN[3]`，經驗節奏和舊的第 3 層怪物同一把尺。
- 新頭目一律 `boss: true`（家鄉 `BOSS_HOME = 12`），以燈喰之獸 `s(1200,36,20,30,20,12)`、exp 300 為基準。
- 先定 6 個「原型」（Lv10 家鄉的基準，對照舊的 golem `s(280,65,24,10,10,5)` exp 40、shade `s(180,30,10,70,20,15)` exp 42）：

| 原型 | 典型成組 | 基準 s(hp,atk,def,mag,res,spd) | exp / gold |
|---|---|---|---|
| 群 swarm | 3 隻 | s(110,32,6,24,10,18) | 15 / 11 |
| 標準 mid | 2 隻 | s(200,48,13,24,13,13) | 28 / 21 |
| 重 heavy | 1–2 隻 | s(310,58,25,14,14,6) | 42 / 31 |
| 術 caster | 1–2 隻 | s(170,24,10,62,22,13) | 38 / 29 |
| 輔 support | 搭配其他 | s(165,22,12,44,22,12) | 28 / 21 |
| 寶 treasure | 單獨 | s(90,18,60,18,60,30) | 90 / 150 |

- 每隻怪物的數值在原型 ±15% 內調形狀（例如更硬但更慢）；有強力機制的，原型上扣 hp 或攻擊來付機制的錢。§6.2 的平衡帶 22a 檢查每隻是否和原型同一個威脅等級。

### 4.3 本道一般怪物（16 種）
欄位：數值是 Lv10 家鄉的 `s(hp,atk,def,mag,res,spd)`；機制代號見 §5.1（`D` = 只用現有效果的資料）。

| id | 名稱 | 帶 | 原型 | 數值（提案） | exp/gold | 弱／抗 | 行為（打起來的差別） | 機制 | 掉落 |
|---|---|---|---|---|---|---|---|---|---|
| `paper-moth` | 遺信紙蛾 | B | 群 | s(100,30,6,26,10,19) | 14/10 | 火／— | 「撲粉」row，sleep 0.25（技能機率 0.3）。三隻一起來，讓玩家學會全體技的價值，但單體也打得完 | D | `dusk-cloth` 0.3 |
| `lamp-wight` | 提燈幽影 | B | 輔 | s(160,22,12,46,22,12) | 28/22 | 冰／火 | 「借光」ally heal 60（0.35）。不先打牠，隊友會一直回血：教玩家選目標 | D | `star-stone` 0.3 |
| `root-hound` | 霧根獵犬 | B | 標準 | s(200,50,12,10,10,13) | 27/20 | 火／— | 「伏低」蓄力一回合（意圖欄顯示），下一回合「撲咬」enemy 230 phys 近戰。玩家可以防禦、讓牠睡著打斷、或先殺掉 | M1 | `thorn-fang` 0.4 |
| `tin-soldier` | 錫兵殘影 | B | 重 | s(260,44,26,10,14,8) | 34/26 | 雷／冰 | 「列隊」守護 2 回合：我方單體攻擊打到牠身上。全體技不受影響 | M2 | `crystal-shell` 0.3 |
| `hoarder` | 拾憶鼠 | B–E | 寶 | s(90,18,60,18,60,30) | 90/150 | —／— | 身上塞滿發光碎片。不太攻擊；第 3 回合結束時逃走，逃走就什麼都不給。高防高抗：要集中火力或用暴擊 | M3 | `star-tear` 0.25、`old-coin` 0.6 |
| `tongueless-bell` | 無舌鐘 | C | 術 | s(220,24,20,56,24,7) | 38/29 | 冰／雷 | 「無聲的鐘鳴」row，遺忘 1 回合（0.3）：中招的人這回合只能普攻或用道具；「共鳴」column 雷 80 | M9 | `star-stone` 0.35 |
| `hollow-hunter` | 空殼獵人 | C | 標準 | s(200,48,14,30,14,14) | 30/22 | 雷／— | 吸了太多別人記憶的冒險者的影子（「空殼」）。「借來的招式」（0.35）：用我方上一個傷害技能的屬性打回施放者，威力上限 150 | M6 | `dusk-cloth` 0.4 |
| `mist-twin` | 霧雙子 | C | 群 | s(140,38,10,30,12,15) | 18/13 | 火／冰 | 一定成對出現。一隻倒下時，另一隻「另一半」：atk +40% 3 回合。要嘛一起壓低再收、要嘛先防禦 | M10 | `ice-crystal` 0.3 |
| `moon-crow` | 映月鴉 | C | 標準 | s(170,44,10,30,16,17) | 28/21 | 輪替 | 弱點每回合輪替 phys→fire→ice→thunder，抗性是輪到的下下個；目前弱點顯示在名牌。四種屬性都輪得到（全物理隊也有一回合打弱點） | M5 | `bat-wing` 0.5 |
| `estra-sentinel` | 艾斯特拉衛像 | D | 重 | s(320,60,28,14,14,5) | 42/31 | 雷／物 | 守護（同錫兵）＋「審判之光」蓄力後 column 火 150（mag）。本表唯一抗物理的物種 | M1、M2 | `star-stone` 0.4 |
| `requiem-choir` | 鎮魂歌隊 | D | 輔 | s(180,20,12,52,22,11) | 34/25 | 物／冰 | 「安魂曲」allies heal 40（0.3）；「呼喚」召喚 1 隻提燈幽影（每場最多 1 次，0.25） | M4 | `dusk-cloth` 0.35 |
| `lantern-larva` | 燈喰幼體 | D | 標準 | s(210,50,14,20,12,12) | 30/22 | 冰／火 | 「啃光」enemy 120 phys，吸血 50%；「長大」self atk +30% 3 回合。拖越久越難打 | M11 | `lizard-scale` 0.4 |
| `epitaph-golem` | 碑文守 | D | 重 | s(340,52,24,30,26,4) | 44/33 | 火／雷 | 「抹消之文」row def −30% 3 回合（減益，現有效果）。很慢，給玩家時間先處理別的 | D | `star-stone` 0.4 |
| `wick-shade` | 燭芯之影 | E | 群 | s(120,36,8,36,12,16) | 16/12 | 冰／火 | 倒下時「最後的火光」：enemies 火 40（mag）。三隻同時打倒會連爆，玩家可以分開收 | M10 | `dusk-cloth` 0.3 |
| `keeper-echo` | 無名的提燈人 | E | 術 | s(230,46,16,56,20,12) | 44/33 | 物／— | 以前某一輪的提燈人留下的影子。「借來的招式」＋「燈火之誓」蓄力後 enemies 火 120 | M1、M6 | `star-tear` 0.05、`star-stone` 0.4 |
| `ember-maw` | 餘燼之口 | E | 重 | s(330,58,20,40,18,6) | 44/33 | 雷／冰 | 「吞吐」row 火 90；「吐出」召喚 1 隻燭芯之影（每場最多 2 次，0.25） | M4 | `crystal-shell` 0.4 |

屬性分佈檢查（每張本道表）：抗物理的物種 ≤ 25%；任一屬性被抗的物種 ≤ 1/3；沒有弱點的物種 ≤ 20%（`roster.test.ts`：`no element wall`）。E 帶表（D 的 4 種＋E 的 3 種）：抗火 2/7（幼體、燭芯）、抗冰 2/7（歌隊、餘燼之口）、抗雷 1/7、抗物 1/7。

### 4.4 地區原生怪物（18 種）
- 地區原生的 `weak`／`resist` 寫成該地區的（`scaleEnemy` 本來就會用地區的蓋掉），所以圖鑑顯示一致。
- 出現深度：該地區第 4 層起的所有深度（第 1–3 層維持舊表，平衡第 7、13 項的地區淺層不動）。
- 地區技能（`REGIONS[r].skill`）照舊由 `scaleEnemy` 加上，不寫進定義。

| 地區 | id | 名稱 | 原型 | 數值（提案） | exp/gold | 行為 | 機制 | 傳說 |
|---|---|---|---|---|---|---|---|---|
| 熾焰 blaze | `cinder-imp` | 灰燼小鬼 | 群 | s(100,32,6,30,10,17) | 14/10 | 倒下時 row 火 35 | M10 | 戰火裡燒掉的信件灰 |
| | `forge-hound` | 熔爐犬 | 標準 | s(200,50,12,24,10,13) | 27/20 | 蓄力「熔吼」row 火 150 | M1 | 守著熄滅爐子的狗 |
| | `ash-mourner` | 灰衣弔者 | 輔 | s(160,20,12,48,22,12) | 28/21 | allies mag +30% 3 回合；ally heal 50 | D | 艾斯特拉戰後沒能下葬的人的哀悼 |
| 霜凍 frost | `frost-doll` | 霜人偶 | 重 | s(260,42,26,20,20,7) | 34/26 | 守護 | M2 | 想永遠留住的童年玩偶 |
| | `glacier-tortoise` | 冰河龜 | 重 | s(360,50,30,20,20,3) | 44/33 | self def +50% 3 回合；蓄力「冰河崩落」enemies 冰 110 | M1 | 不肯融化的舊日子 |
| | `snow-caller` | 雪中呼喚 | 術 | s(170,22,10,64,22,14) | 38/29 | cross sleep 0.35；column 冰 100 | D | 在雪裡喊一個想不起來的名字 |
| 雷鳴 storm | `thunder-kite` | 雷鳶 | 群 | s(110,30,6,20,8,22) | 15/11 | 「迅雷爪」enemy 3 段 × 45 | D | 突然傳來的壞消息 |
| | `storm-totem` | 避雷石柱 | 輔 | s(200,10,20,40,30,2) | 26/20 | allies spd +30%；allies atk +20%。本身幾乎不打人 | D | 被雷打過一次就再也不敢忘的地方 |
| | `charge-jelly` | 蓄電水母 | 術 | s(180,20,10,62,22,10) | 38/29 | 蓄力「放電」enemies 雷 130 | M1 | 一直說不出口的話 |
| 腐毒 mire | `bog-mother` | 泥沼母體 | 重 | s(320,40,20,30,20,4) | 42/31 | 召喚舊的苔蘚史萊姆（地區上色，每場最多 2 次） | M4 | 腐掉的怨恨會生出更多小怨恨 |
| | `rot-lily` | 腐百合 | 輔 | s(160,20,12,46,22,8) | 28/21 | cross poison 0.5；row res −30% 3 回合 | D | 沒送出去、在花瓶裡爛掉的花 |
| | `leech-knight` | 蛭甲騎士 | 標準 | s(220,50,18,10,12,10) | 30/22 | 「吸血刺」吸血 50% | M11 | 靠別人的記憶活下去的騎士 |
| 暗影 shade | `mirror-thief` | 鏡中竊影 | 標準 | s(180,46,10,40,16,16) | 28/21 | 借來的招式 | M6 | 偷看別人人生的影子 |
| | `veil-stalker` | 帷幕潛行者 | 標準 | s(170,54,10,10,10,18) | 28/21 | 「背刺」enemy 140，`melee: false`（打得到後排）、`crit: 'always'`（0.25） | D | 藏起來不讓自己看見的記憶 |
| | `hush-acolyte` | 靜默侍者 | 術 | s(160,20,10,58,24,13) | 36/27 | cross 遺忘 1 回合 | M9 | 靜鐘會讓人忘記的誓言（第三幕之後介紹才寫出「靜鐘會」） |
| 鋼鐵 iron | `rivet-golem` | 鉚釘機兵 | 重 | s(280,48,28,10,14,6) | 36/27 | 守護 | M2 | 等不到下一道命令的哨兵 |
| | `siege-crab` | 攻城蟹 | 重 | s(300,58,26,10,12,5) | 40/30 | 蓄力「破城鉗」row 170 phys 近戰 | M1 | 要塞陷落那天的記憶 |
| | `herald-engine` | 號令機 | 輔 | s(190,24,20,40,20,9) | 30/22 | allies atk +25%、def +20% | D | 一直重複最後一道軍令 |

每個地區原生物種的掉落：該物種的近親舊素材 0.3–0.4（熾焰 `thorn-fang`、霜凍 `ice-crystal`、雷鳴 `bat-wing`、腐毒 `moss`、暗影 `dusk-cloth`、鋼鐵 `crystal-shell`）；地區素材由 `scaleEnemy` 照舊加 `REGION_DROP_CHANCE`。

### 4.5 頭目（12 隻）與部件（2 種）
`bossFor(region, depth)`（新，`data/roster.ts`）：
- 本道第 3 層：`lanterneater`（不變）。本道第 30 層第一次：終幕（`FINALE_BOSS`，見 §8.4）。
- 本道其他 5 的倍數：依 `(depth / 5 − 1) % 6` 循環 `fog-warden`、`silent-bell`、`hollow-champion`、`estra-archon`、`gorged-beast`、`lantern-mother`（第 5、10、15、20、25、30 層，35 層以後循環）。
- 地區：`depth % 10 === 5`（5、15、25…）打該地區頭目；`depth % 10 === 0` 打同深度本道頭目的地區版。
- 頭目尚未上線（§8.1）時，該處回到 `lanterneater`，和現在一模一樣。
- 回傳值是一個組（`string[]`），多部位頭目回傳 `['estra-archon', 'archon-hand', 'archon-hand']`。

| id | 名稱 | 出現 | 數值（提案） | 弱／抗 | 行為 | 機制 |
|---|---|---|---|---|---|---|
| `fog-warden` | 霧門守衛 | 本道 5 | s(1150,40,22,26,20,11) exp 300 | 火／冰 | 「霧門落下」蓄力後 enemies phys 140；「霧鎖」row def −25%。第一隻新頭目，教玩家看意圖防禦 | M1 |
| `silent-bell` | 啞鐘 | 本道 10 | s(1250,30,24,40,22,8) | 冰／雷 | row 遺忘；血量 ≤ 50% 進第二階段：「破鐘」enemies 雷 120 機率提高 | M9、M8 |
| `hollow-champion` | 空殼勇者 | 本道 15 | s(1100,44,20,34,18,14) | 雷／— | 「記得一百種劍法，記不得自己的名字」。借來的招式；≤ 40%「一百種劍法」enemy 3 段 | M6、M8 |
| `estra-archon` | 艾斯特拉執政像 | 本道 20 | 本體 s(800,30,24,40,26,8)；`archon-hand` ×2 s(260,44,20,10,14,10) exp 30 | 本體 雷／火；手 火／— | 手還在時本體受到的傷害 ×0.5。手：「壓制」row phys 100。全體技一次打三個，但單體一樣可以先拆手 | M7 |
| `gorged-beast` | 飽食之獸 | 本道 25 | s(1300,40,20,34,20,10) | 冰／火 | 長大的燈喰之獸。召喚燭芯之影（每場 2 次）；「啃食」吸血 40% | M4、M11 |
| `lantern-mother` | 燈喰之母 | 本道 30 | **與 `lanterneater` 完全相同的數值與技能**，只有 id、名字、圖不同 | 冰／火 | 第一階段只換外觀，平衡位元相同（§8.4） | — |
| `ember-tyrant` | 焚城之焰 | 熾焰 5/15/25 | s(1200,38,20,36,20,12) | 依地區 | ≤ 50%：「焚城」enemies 火 130 | M8 |
| `rime-sovereign` | 永凍之守 | 霜凍 5/15/25 | 本體 s(820,30,24,40,26,8)；`rime-pillar` ×2 s(240,20,24,30,20,4) exp 30 | 依地區 | 柱子在時本體傷害 ×0.5；柱子：ally heal 50、allies def +20% | M7 |
| `thunder-roc` | 雷鳴巨鵬 | 雷鳴 5/15/25 | s(1100,40,18,36,18,18) | 依地區 | 很快；「天雷俯衝」蓄力後 enemies 雷 140；「雙爪」enemy 2 段 | M1 |
| `mire-hydra` | 腐沼多頭蛇 | 腐毒 5/15/25 | s(1350,36,22,28,20,8) | 依地區 | 66%、33% 各進一階段，每階段多一個「蛇首咬」技能（頭長出來）；cross poison | M8 |
| `faceless-host` | 無面之主 | 暗影 5/15/25 | s(1100,40,18,40,20,14) | 依地區 | 借來的招式；召喚鏡中竊影（每場 2 次） | M6、M4 |
| `fortress-colossus` | 要塞巨像 | 鋼鐵 5/15/25 | s(1300,42,30,20,20,5) | 依地區 | 召喚鉚釘機兵（每場 2 次）；蓄力「攻城砲」enemies phys 130 | M4、M1 |

頭目的 exp 都是 300、gold 0、drops `[]`，和燈喰之獸相同（頭目的裝備與記憶碎片由 `battleGear`、`pieceDrops` 依 `b.boss` 給，不看 id）。部件 exp 30、gold 0、drops `[]`，`partOf` 標記（不算一般怪物、不進遇敵表、不進 `NORMAL_ENEMIES`）。

### 4.6 掉落（決定）
- 新怪物只掉既有素材（`data/materials.ts`），所以不需要新圖示，也不動 `NO_ICON_YET`。
- 物種掉落的機率總量和舊的第 3 層怪物同級（0.3–0.5）。`engine/forge/economy.test.ts` 在每次上線切換時要重跑，素材流入的帶不放寬。

### 4.7 精英詞綴「飽食個體」（5 種，0 張圖）
- 從第 4 層起，每個精英都帶一個詞綴；第 1–3 層的精英不變。
- 選法：`eliteAffix(run, depth) = AFFIX_IDS[mix(run.seed ^ AFFIX_SALT, depth) % 5]`。純雜湊（和 `chestHasGear` 同一種寫法），**不抽任何串流**。同一層重進一樣。
- 名字：`★〔急躁〕深層・熾焰・荊棘狼`（詞綴兩個字，放在 ★ 後）。

| id | 名稱 | 效果 | 付費（讓威脅不變） |
|---|---|---|---|
| `swift` | 急躁 | spd ×1.4 | hp ×0.85 |
| `thick` | 厚重 | hp ×1.35 | atk、mag ×0.85 |
| `echoing` | 回響 | 每次行動後再普攻一次，威力 50% | atk、mag ×0.8 |
| `draining` | 吸憶 | 所有傷害吸血 30% | hp ×0.9 |
| `splitting` | 分裂 | 倒下時召喚一隻同物種、40% hp、非精英、無報酬 | hp ×0.8 |

### 4.8 給第 2 項（懸賞）的接口
- 詞綴精英就是世界觀的「吞了太多記憶的怪物」。懸賞上線時，可以指定「某地區、某詞綴、某物種」當目標，不需要新物種。
- `eliteAffix` 是純函式，懸賞板可以預先算出某次出發的某層會有哪個詞綴（若想給提示）。

---

## 5. 機制

### 5.1 引擎工作清單
原則：
- 每個新機制的**決定**（要不要召喚、換哪個弱點、何時逃走、哪個詞綴）都是確定性的，不抽 rng（§5.3）。
- 每個機制都用 `EnemyDef` 或 `EnemySkill`／`Effect` 上的可選欄位表示；舊定義沒有這些欄位，行為位元相同。
- 每個機制都在意圖欄（`intentLabel`）或名牌上看得到。DRPG 的公平：玩家看得到才算數。

| 代號 | 機制 | 資料形狀（提案） | 引擎位置 | 用到的怪物數 | 測試義務（TDD 先寫） |
|---|---|---|---|---|---|
| D | 現有效果（減益、補血、增益、多段、必暴、遠程） | 無 | 無 | 9 | `roster.test.ts`：每個 D 技能只用 §1.4 列的效果種類 |
| M1 | 蓄力 | `EnemySkill.charge?: string`（蓄力回合的名稱） | `battle.ts`：`Combatant.charging?: number`；選到蓄力技能時這回合只記 log `charge`，下一回合的 `planEnemies` 強制用該技能；睡著會清掉蓄力 | 11 | `a charged skill lands the round after its wind-up`、`sleep breaks a charge`、`the wind-up shows in intentLabel`、`charging draws nothing` |
| M2 | 守護 | `Effect { kind: 'guard'; turns }` | `battle.ts`：`Combatant.guard`；我方 `enemy` 目標的技能、普攻、絕技，目標若是另一隻活著的敵人而場上有 `guard > 0` 的敵人，改打守護者。範圍技不受影響。回合結束遞減 | 5 | `a guard takes single-target hits for its allies`、`area skills ignore a guard`、`a guard ends after its turns`、`a sleeping guard still guards`（決定：是） |
| M3 | 逃走 | `EnemyDef.fleeAfter?: number` | `battle.ts`：回合結束時 `round >= fleeAfter` 的活著的牠設 `fled`、`alive=false`，log `flee`；`checkOutcome` 把逃走的算離場；`rewards`、`game.battleGear` 跳過 `fled` | 1 | `the hoarder flees at the end of round 3`、`a fled foe pays nothing and takes no loot draw`、`a fight of only a fled foe is won with no reward` |
| M4 | 召喚 | `Effect { kind: 'summon'; id; max }` | 抽出 `meetEnemy()`（`createBattle` 的單隻生成，位元相同的重構），召喚時用同一個 scale、非精英；新的 key 接在最後（`e{n}`）；場上活著的敵人已達 `groupCap(size, depth)` 時失敗（頭目戰上限 4）；每個召喚者對該技能最多 `max` 次；被召喚的 `summoned: true`：exp、gold 0，drops 空，`battleGear` 跳過；本回合不行動 | 6 | `meetEnemy matches createBattle bit for bit`、`a summon respects the group cap`、`a summon pays nothing and takes no loot draw`、`a summon acts from the next round`、`BattleView adds a sprite for a summon` |
| M5 | 弱點輪替 | `EnemyDef.prism?: true` | `battle.ts`：每回合開始設 `weak = [ORDER[(round + i) % 4]]`、`resist = [ORDER[(round + i + 2) % 4]]`（`i` = 第幾隻）；`scaleEnemy` 對 `prism` 不套地區弱點；名牌顯示目前弱點 | 1 | `a prism foe cycles through all four elements`、`a region does not override a prism`、`prism draws nothing` |
| M6 | 借來的招式（回聲） | `Effect { kind: 'echo'; cap }` | `BattleState.lastPartyDamage?: { actor; element; power; scale }`，我方每個傷害技能結束時更新；echo 用自己的數值、該屬性、`min(power, cap)` 打回 `actor`（已倒下就隨機目標，走既有 `pickTarget`）；沒有紀錄時改普攻 | 4 | `echo returns the last party element at most cap`、`echo without a record is an attack`、`echo targets the caster` |
| M7 | 多部位護盾 | `EnemyDef.shieldedBy?: string[]`、`shieldPct` | `combatant.ts` 的傷害計算：目標有 `shieldedBy` 且場上有活著的對應部件時，傷害 × `shieldPct / 100`（提案 50）；名牌顯示「受保護」 | 2 | `a shielded core takes half while a part stands`、`the shield drops with the last part` |
| M8 | 階段 | `EnemyDef.phases?: { below: number; skills: EnemySkill[]; name?: string }[]` | `enemyDef()` 取技能時依目前 hp 比例選最後一個符合的階段；第一次進入時 log `phase`（畫面閃一下） | 4 | `a boss switches skills under its threshold`、`phases never switch back after healing`（決定：記住最低階段） |
| M9 | 遺忘（新狀態） | `inflict` 的 `status` 加 `'forget'` | `Combatant.forget`（回合數，固定 1）；被遺忘的人 `skill` 行動改成普攻（log `forgot`），`ultimate`、`item`、`defend`、`escape` 照常；用 `sleepRes` 抵抗（精神抗性，不新增次要屬性）；頭目減半照舊；`cure` 會解除 | 3 | `a forgotten member attacks instead of casting`、`items and ultimates still work while forgotten`、`cure clears forget`、`sleepRes resists forget` |
| M10 | 倒下時 | `EnemyDef.onDeath?: EnemySkill`（chance 視為 1） | `skills.ts` 的 `ko` 之後立即結算（目標依技能，`allies` 指牠的隊友）；只結算一次 | 3＋分裂詞綴 | `a twin enrages its partner when it falls`、`a wick bursts once when it falls`、`onDeath does not chain forever`（燭芯爆炸只打我方） |
| M11 | 吸血 | `damage` 效果加 `drain?: number`（%） | `skills.ts`：造成的傷害 × drain% 回到施放者 | 4＋詞綴 | `drain heals the actor by its share of the damage dealt`、`drain on a miss heals nothing` |
| M12 | 精英詞綴 | `BattleScale.affix?: AffixId`；`data/affixes.ts` | `scaleEnemy` 套數值；`echoing`、`draining`、`splitting` 用 M10、M11 與「行動後追加」 | 5 種 | `eliteAffix is a pure function of seed and depth`、`depths 1-3 elites carry no affix`、`each affix changes the elite as listed` |

### 5.2 為什麼這些不會讓某種隊伍變成必帶
| 機制 | 擔心 | 處理 |
|---|---|---|
| 守護、多部位 | 沒有全體技的隊伍打不動 | 守護只擋單體、2 回合；護盾是 ×0.5 不是免疫。單體隊伍先拆部件即可；第 18、22d 項量全物理、全魔法、無坦、無補四種歪隊 |
| 遺忘 | 治療被封 | 只封技能 1 回合；道具、絕技、防禦照常；頭目減半；任何人都能用道具補血 |
| 弱點輪替 | 某屬性永遠打不到弱點 | 四種屬性（含物理）都會輪到 |
| 逃走 | 沒有爆發的隊伍拿不到 | 寶物怪只是額外獎勵，不在經驗節奏的必要路徑上（表內 1/12，§6.4 的經驗等價把牠算成 0） |
| 回聲 | 處罰大招 | 威力上限 150，屬性跟隨施放者，不分職業 |
| 蓄力 | 沒有坦就吃滿 | 任何人都能防禦；睡眠打斷；先殺掉也行。第 18 項的 `noTank` 量這件事 |
| 地區抗性 | 全物理在鋼鐵、腐毒 | 不變（既有行為，第 18b 項已在量） |
| 抗物理物種 | 全物理隊 | 每張本道表 ≤ 25%（§4.3） |

### 5.3 rng 規則（決定）
- 不用 `Math.random`（`roster.test.ts` 掃 `data/roster.ts`、`data/affixes.ts`、新增的引擎碼）。
- 遇敵：`encounterGroup` 照舊從 `game.rng` **抽一次** `pick`。表變長不會多抽。
- 精英組：照舊用 `eliteGroup` 自己的鹽。精英詞綴：純雜湊 `mix(run.seed ^ AFFIX_SALT, depth)`，`AFFIX_SALT = 0xaff1c5`（提案，必須和 `MEMORY_SALT`、`FORGE_SALT`、`0xe11e`、`0x3c6ef372` 不同；測試檢查）。
- 頭目：`bossFor` 是查表，不抽。
- 戰鬥中：新機制的決定不抽 rng。牠們的技能命中、暴擊、閃避、狀態機率，走既有的 `applyEffect`／`calcDamage`，和任何敵人一樣使用戰鬥的 rng。這不是「多抽」：舊怪物的抽取序列不變（§6.1 的位元相同測試）。
- 被召喚、逃走的敵人在 `game.battleGear` 裡不呼叫 `lootRng`、在 `rewards` 裡不抽掉落：召喚不會讓 `lootDraws` 多走。
- `lootRng`、`memoryRng`、`fillRooms` 的 rng、`forgeRng`：本計畫不碰。

---

## 6. 平衡安全

### 6.1 不動凍結帶的做法
1. **第 1–3 層位元不變**：`encounterTable(region, depth ≤ 3)` 永遠回傳舊表。第 1–6、13、15 項與第 7 項的熾焰第 2、3 層，不會因為本計畫改變任何一個數字。
2. **上線前位元不變**：`ROSTER_LIVE` 為空時，所有深度的 `encounterTable`、`bossFor`、`eliteGroup`、名字、報酬都和現在完全相同。測試：
   - `the roster with nothing live changes nothing`：對 7 個地區 × 深度 1–40，`encounterTable` 等於舊實作的快照；`bossFor` 全部是 `lanterneater`（劇情與終幕除外）。
   - `legacy fights replay bit for bit`：Task 0 先把「舊表每組 × 種子 1–3 在第 4、8 層」的完整戰鬥 log 存成 fixture（`engine/__fixtures__/legacy-fights.json`），之後每次改 `battle.ts`、`skills.ts`、`scaling.ts` 都要比對相同。
3. **上線時每一個凍結帶都要綠**：每次把一批 id 加進 `ROSTER_LIVE`，跑第 1–20 項（6d 上線後含第 21 項）全部套件，加上 §6.3 的新帶。不綠就**只調新怪物自己的數字**（或從表裡拿掉某一組），不碰既有旋鈕，也不改任何門檻。
4. **經驗等價**（`roster.test.ts`，快、不跑模擬）：對 7 個地區 × 深度 4–30，新表的平均 `groupExp`（寶物怪算 0）÷ 舊表的平均 `groupExp`，必須在 [0.92, 1.08]。這讓第 7 項的節奏與第 12 項的清層等級不會被新表推出帶外。
5. **組的大小**：每組 1–3 隻（和舊表相同）；`GROUP_CAP` 照舊裁切。表的長度 10–12 組（控制第 7、8、18 項的執行時間）。

### 6.2 模擬會不會量到新怪物
- 一般怪物：會，進表就被窮舉（§1.5）。
- 頭目、精英詞綴、地區深處（15、25 層）、深帶的歪隊：現有的帶量不到，所以加 §6.3。
- 未上線的物種：`ENEMIES` 查得到定義（§8.1），所以第 22 項可以在美術還沒好之前就調數值。

### 6.3 新增的平衡帶：第 22 項（`engine/balance.roster.test.ts`，新檔）
所有門檻都沿用既有帶的數字，沒有新的寬鬆門檻。

| 帶 | 內容 | 門檻（沿用） |
|---|---|---|
| 22a 物種等價 | 每個新一般物種的「代表組」（群 ×3、其餘 ×2）在該帶第一個深度（B 4、C 10、D 16、E 25；地區原生在 4 與 15），深度等級、期望記憶、期望裝備（同 19a 做法）；和同原型的參考組（舊的 golem ×2 或 shade ×2 在同一深度）比 | 勝率 ≥ 0.85；hpLoss 10–45%；且和參考組的 hpLoss 差 ≤ 0.08 |
| 22b 頭目等價 | 每個新頭目在它的每個出現深度（≤ 30），對照同深度、同地區的 `lanterneater`（同種子、同套裝備） | 勝率差 ≤ 0.10；稀有套裝每個種子 ≥ 3 回合（同第 11 項）；+`ENHANCE_MAX` ≥ 2 回合（同第 14 項）；2、3、4 人的勝率 ≤ 全隊 + 0.05（同第 16 項） |
| 22c 地區深處 | 6 個地區在第 15、25 層，期望隊伍（同 19a） | 勝率 ≥ 0.85；hpLoss 10–45% |
| 22d 深帶歪隊 | `ODD_LINEUPS` 四隊各配 fill build，本道第 12、20 層與 `allPhys` 的鋼鐵第 12 層 | 勝率 ≥ 0.85；hpLoss 10–45%（同 18a） |
| 22e 詞綴精英 | 5 種詞綴 × 本道第 4、8 層表的每一組 | 勝率 ≥ 0.6（同第 8 項） |
| 22f 頭目歪隊 | `ODD_LINEUPS` × fill build × 每個多部位／召喚／遺忘頭目在第一個出現深度 | 勝率 ≥ 同條件下 `lanterneater` − 0.10 |

- 22a、22b、22e、22f 在美術上線前就能跑（用 `ENEMIES` 裡的定義），這是調數字的主要工具。
- 22c、22d 量的是「上線後的表」，所以 `ROSTER_LIVE` 為空時它們量的就是舊表，必須本來就綠（Task 0 先確認；不綠就回報，不放寬）。
- 時間：每個 `it` 標 300 秒上限；整套平衡只能一次跑一個（使用者的 WSL 規則精神；在 Windows 上也照樣一次一套）。

### 6.4 寶物怪與節奏
- `hoarder` 的 exp 90、gold 150 很高，但牠第 3 回合結束就跑。經驗等價把牠算成 0；節奏帶（第 7、12 項）用 `groupExp` 算的是全額，所以表內只放 1 組，並在 22a 之外單獨量「預設隊伍 3 回合內擊殺率」，提案目標 50–70%（新帶 22g，只記錄、不擋，給調數值參考；這不是凍結帶）。

---

## 7. 圖鑑（決定：升級既有的圖鑑頁，不另開）

### 7.1 為什麼
- 已經有一頁（§1.7），但它列出沒遇過的怪物、沒有圖、沒有介紹。48 種新怪物如果只是一長串名字，反而顯得更空。
- 圖鑑是「怪物是被吞下的記憶」最好的說故事位置：每隻 1–2 句，劇情推進後多一句。這也呼應手冊「找回記憶」的主題。

### 7.2 規格
- 狀態：`GameState.bestiary?: Record<string, { seen: number; felled: number }>`（可選欄位，`SAVE_VERSION` 維持 8，照 6d 的 `bond` 做法；`isGameState` 驗證：未知 id 丟掉、數字為 0–999999 的整數）。
- 記錄：`startBattle` 記 `seen`（每場每個物種 +1，以定義 id 計，地區變體算同一種）；勝利時記 `felled`。不抽 rng。召喚出來的也算見過、打倒。
- 顯示（`engine/story/handbook.ts` 的 `CodexPage.monsters` 擴充）：
  - 只列**已上線**（`liveEnemyIds()`）的物種；沒見過的顯示「？？？」與剪影（同一張圖加 CSS `brightness(0)`，不是新圖）。
  - 見過：圖、名字、出沒（「本道 10–15 層」「熾焰之地」）、已揭露弱點（沿用 `revealed`）、見過／擊倒次數。
  - 擊倒過：多顯示介紹第一句。
  - 劇情到達 `loreAfter`（`act2`／`act3`／`act4`／`after`）：多顯示第二句。
- 文字：新檔 `data/bestiary.zh-TW.ts`（不碰 `story.zh-TW.ts`、`text.zh-TW.ts`），帶自己的 `BESTIARY_PLACEHOLDERS` 與閘門測試（`PLACEHOLDERS.size === 0` 的同款做法）。寫作照 6c 的文風聖經與設定帳本；新出現的名詞（例如「霧生迴響」）登記進帳本。
- 介面字串（頁籤、標籤）放 `data/bestiary.zh-TW.ts` 的 `UI` 區塊，避免和 6d Task 7 搶 `text.zh-TW.ts`。

---

## 8. 計畫切分與順序

### 8.1 開關：沒有核准美術就不上線（決定）
`data/roster.ts`（新）：
```ts
/** 美術已發布（registry 狀態 published、檔案在 public/）的新怪物 id。只由美術計畫在發布 commit 加入。 */
export const ROSTER_ART: ReadonlySet<string> = new Set([]);
/** 已進遇敵表、頭目表與圖鑑的新怪物 id。只由引擎計畫在上線 commit 加入；必須是 ROSTER_ART 的子集。 */
export const ROSTER_LIVE: ReadonlySet<string> = new Set([]);
```
- 新怪物的定義放在 `data/enemies.roster.ts`（新），合併進 `ENEMIES` 給**查詢**用（`createBattle`、`scaleEnemy`、模擬）。
- **列表**全部改讀 `liveEnemyIds()`／`artEnemyIds()`（舊 id 永遠算在內）：
  - `allArtUrls()`：舊的迴圈改成「舊 id ＋ `ROSTER_ART`」。所以 246 只在美術發布時改；
  - `NORMAL_ENEMIES`：舊 8 ＋ `ROSTER_LIVE` 的一般物種；
  - 手冊圖鑑：舊 ＋ `ROSTER_LIVE`；
  - `encounterTable`、`bossFor`：組裡每個 id 都上線，該組才進表（§8.2）。
- 測試：
  - `ROSTER_LIVE ⊆ ROSTER_ART`；
  - `ROSTER_ART` 每個 id 的 `enemy-<id>` 在 registry 是 `published`，而且 `runtime` 等於 `art.enemy(id)`；
  - `published.test.ts` 本來就會檢查 `allArtUrls` 的檔案存在，所以「沒有圖就上線」在機械上不可能發生。
- 召喚的目標也必須上線：`roster.test.ts` 檢查 `summon.id ∈ 舊 id ∪ ROSTER_LIVE`，否則該技能在戰鬥裡跳過（不會召出沒有圖的怪）。

### 8.2 表的資料（`data/roster.ts`）
- `MAINLINE_TABLES: Record<'B'|'C'|'D'|'E', string[][]>`、`NATIVE_GROUPS: Record<Exclude<RegionId,'mainline'>, string[][]>`。
- `encounterTable(region, depth)`（改寫 `engine/scaling.ts`，舊行為保留成 `legacyTable`）：
  1. `depth ≤ 3` → `legacyTable`。
  2. 本道：`live = MAINLINE_TABLES[band].filter(allLive)`；地區：`live = [...NATIVE_GROUPS[region], ...MAINLINE_TABLES[band].slice(0, 6)].filter(allLive)`。
  3. `live` 裡沒有任何含新 id 的組 → `legacyTable`（位元相同）。
  4. `live.length < 6` → `[...legacyTable, ...live 的新組]`（過渡期，避免表太短）。
  5. 否則 → `live`。
- 本道表（提案；舊 id 永遠算上線）：

| 帶 | 組（每行一組） |
|---|---|
| B | `paper-moth×3`；`root-hound+wolf`；`tin-soldier+lamp-wight`；`lamp-wight+root-hound`；`tin-soldier+paper-moth×2`；`root-hound×2`；`wisp+paper-moth`；`lizard+lamp-wight`；`tin-soldier+beetle`；`golem`；`shade+paper-moth`；`hoarder` |
| C | `tongueless-bell+hollow-hunter`；`mist-twin×2`；`moon-crow×2`；`hollow-hunter+lamp-wight`；`tongueless-bell+tin-soldier`；`moon-crow+root-hound`；`hollow-hunter×2`；`mist-twin×2+paper-moth`；`tin-soldier+moon-crow`；`golem+tongueless-bell`；`shade+hollow-hunter`；`hoarder` |
| D | `estra-sentinel+requiem-choir`；`lantern-larva×2`；`epitaph-golem`；`requiem-choir+hollow-hunter`；`estra-sentinel+lantern-larva`；`epitaph-golem+moon-crow`；`lantern-larva+mist-twin×2`；`requiem-choir+tongueless-bell`；`estra-sentinel×2`；`epitaph-golem+lantern-larva`；`hollow-hunter+moon-crow`；`hoarder` |
| E | `wick-shade×3`；`keeper-echo`；`ember-maw`；`keeper-echo+wick-shade`；`ember-maw+estra-sentinel`；`wick-shade+lantern-larva`；`keeper-echo+requiem-choir`；`epitaph-golem+wick-shade`；`ember-maw+wick-shade`；`keeper-echo×2`；`requiem-choir+lantern-larva`；`hoarder` |

- 地區原生組（每區 6 組，提案，形狀相同）：`[群×3]`、`[標準]`、`[輔+標準]`、`[群×2+輔]`、`[標準×2]`、`[重+群]`。例：熾焰 `cinder-imp×3`、`forge-hound`、`ash-mourner+forge-hound`、`cinder-imp×2+ash-mourner`、`forge-hound×2`、`cinder-imp+ash-mourner`；各區照該區三種的原型填（重型的區以 `[重]` 取代 `[標準]`）。
- 精英：`eliteGroup` 不改，仍從 `encounterTable` 挑，所以新物種自動會當精英（寶物怪除外：`eliteGroup` 若挑到 `hoarder` 組，改取下一組，索引 +1，不多抽）。

### 8.3 兩個計畫
**計畫 7a：怪物名冊（引擎與資料）**（`docs/superpowers/plans/2026-10-xx-starlantern-plan7a-roster.md`）

| Task | 內容 | 主要檔案 | 驗收 |
|---|---|---|---|
| 0 | 基準：舊戰鬥 log fixture、舊 `encounterTable` 快照；先跑 22c、22d 在舊表上必須綠 | `engine/__fixtures__/`、`engine/roster.baseline.test.ts`（新） | fixture 產生並提交；22c、22d 舊表綠（不綠就停下回報） |
| 1 | `data/roster.ts`、`data/enemies.roster.ts`（48 個定義）、`liveEnemyIds`／`artEnemyIds`；列表改讀它們 | `data/`、`render/artPaths.ts`（一行）、`engine/story/handbook.ts`（一行）、`engine/scaling.ts` | 246 不變；`NORMAL_ENEMIES` 仍是 8；`the roster with nothing live changes nothing` |
| 2 | `encounterTable` 改寫、`bossFor`、`game.ts` 頭目改用 `bossFor` | `engine/scaling.ts`、`engine/game.ts` | 舊快照相同；`bossFor` 表格測試 |
| 3 | M1 蓄力、M2 守護、M3 逃走（第一波需要的） | `engine/battle.ts`、`engine/skills.ts`、`engine/combatant.ts`、`render/BattleView.ts`、`ui2/scenes/battle.ts` | §5.1 測試；legacy fixture 相同 |
| 4 | 第 22 項骨架（22a、22b、22e、22f 讀 `ENEMIES` 定義）＋經驗等價、`no element wall`、`freshness` 資料測試 | `engine/balance.roster.test.ts`、`data/roster.test.ts`（新） | 第一波物種的 22a、22b 綠 |
| 5 | M4 召喚（含 `meetEnemy` 重構、戰鬥畫面加圖）、M10 倒下時、M11 吸血 | 同 Task 3 | §5.1 測試；fixture 相同 |
| 6 | M5 輪替、M9 遺忘 | 同上、`engine/save.ts`（不需要：戰鬥不存檔） | §5.1 測試 |
| 7 | M6 回聲、M8 階段、M7 多部位 | 同上 | §5.1 測試 |
| 8 | M12 詞綴、`data/affixes.ts`、22e | `engine/scaling.ts`、`engine/events.ts`、`engine/game.ts` | 22e 綠；第 8 項不變 |
| 9 | 圖鑑：`bestiary` 狀態、手冊頁、`data/bestiary.zh-TW.ts`（暫定文案） | `engine/state.ts`、`engine/save.ts`、`engine/story/handbook.ts`、`ui2/scenes/handbook.ts` | 存檔 v8 可讀；未上線不列；剪影 |
| 10 | 圖鑑文字（48 條 × 1–2 句） | `data/bestiary.zh-TW.ts` | `BESTIARY_PLACEHOLDERS.size === 0`；文風審查 |
| 11–14 | 上線第 1–4 波（§8.5）：加進 `ROSTER_LIVE`、全套平衡、只調新怪物數字、更新釘住的測試（`NORMAL_ENEMIES` 長度、`scaling.test` 的「frost depth 6 見到全部」）、e2e 冒煙、截圖 | `data/roster.ts`、`data/enemies.roster.ts` | 第 1–22 項全綠；`economy.test` 綠 |
| 15 | 終幕外觀：`FINALE_BOSS.base` → `lantern-mother` | `data/story/scenes.ts` | 19b 位元相同（同數值同技能；比對 fixture） |

- 每個 Task 先寫失敗的測試（AGENTS.md 的 TDD 規則）。行為測試至少一個成功路徑、一個邊界或回歸路徑。
- 平衡數字在 Task 4 之後就能調（22a、22b 不需要美術）。

**計畫 5f：怪物美術**（`docs/superpowers/plans/2026-10-xx-starlantern-plan5f-monster-art.md`），§9。

### 8.4 和 6c、6d、6e 的關係
- **6c（Task 11–15 寫作中）**：只碰 `data/story.zh-TW.ts` 與故事測試。7a 的 Task 0–8 與 5f 全部**可以現在並行**，不碰那些檔案。
  - 例外：Task 15 改 `data/story/scenes.ts` 的 `FINALE_BOSS`，排在 6c Task 15（收尾）合併之後。
- **6d（好感度引擎，6c 之後開始）**會改 `engine/battle.ts`、`engine/game.ts`、`engine/dungeon/run.ts`（Task 4）、`engine/save.ts`、`engine/state.ts`（Task 2）、`ui2/scenes/handbook.ts`（Task 9）、`data/text.zh-TW.ts`（Task 7）。
  - 決定：7a 的 Task 2、3、5–8（`battle.ts`、`game.ts`）**在 6d 開始前合併**；來不及的話，暫停到 6d Task 4 合併後再接，不同時改。
  - 7a Task 9（圖鑑，改 `save.ts`、`state.ts`、`handbook.ts`）排在 6d Task 2 與 Task 9 之後，照它們的可選欄位做法接上。
  - 6d 的 `bond draws nothing` 測試與 7a 的 `charging/prism/summon draws nothing` 是同一種保證，互不影響。
  - 6d 加的第 21 項，在 7a 的每次上線切換時一起跑。
- **6e（羈絆文字）**：不相關；Task 10 的圖鑑文字可以和 6e 由同一組寫作者做，共用帳本。
- **5e（表情美術）**：和 5f 並行沒有檔案衝突，但都會改 `artPaths.test.ts` 的總數與 `registry.json`。決定：兩個美術計畫的發布 commit 依序合併，後合併的重算總數。

### 8.5 上線波次（引擎）與美術批次（審核）
| 上線波 | 內容 | 需要的機制 | 需要的美術批次 |
|---|---|---|---|
| 第 1 波 | B 帶 4 種＋`hoarder`＋`fog-warden` | D、M1、M2、M3 | R0、R1 |
| 第 2 波 | C、D 帶 8 種＋`silent-bell`、`hollow-champion`、`estra-archon`＋`archon-hand` | M4–M11 | R1 |
| 第 3 波 | E 帶 3 種＋`gorged-beast`、`lantern-mother`；詞綴 | M12 | R1 |
| 第 4 波 | 6 區原生 18 種＋6 隻地區頭目＋`rime-pillar` | 全部 | R2 |

- 美術先到、引擎晚到：沒關係，圖發布了只是沒人用（`ROSTER_ART` 有、`ROSTER_LIVE` 沒有）。
- 引擎先到、美術晚到：沒關係，玩家看不到（`ROSTER_LIVE` 不能超過 `ROSTER_ART`）。
- 在美術之前可以出貨給玩家的：機制（沒有怪物用它們時不會觸發）、第 22 項、精英詞綴（詞綴不需要新圖，可以在第 1 波之前就上線；但它會改第 4 層以後的精英，所以上線時跑第 8、22e 項）、圖鑑頁的升級（列的仍是舊 9 種，但多了見過／擊倒、介紹與剪影）。

---

## 9. 美術（計畫 5f）

### 9.1 資產契約（每隻都一樣，依 `contract.md` 的「敵人」列）
| 類別 | id | runtime | 去背 | 格數 | `--height` | prompt 高度 | 允許範圍（QA） |
|---|---|---|---|---|---|---|---|
| 群 | `enemy-<eid>` | `/assets/games/starlantern/enemy/<eid>.png` | 透明，magenta 去背 | 1 | 52 | about 56 art pixels tall | 高 40–64 |
| 一般 | 同上 | 同上 | 同上 | 1 | 64 | about 72 art pixels tall | 高 48–112 |
| 重型 | 同上 | 同上 | 同上 | 1 | 76 | about 84 art pixels tall | 高 48–112 |
| 部件 | 同上（`archon-hand`、`rime-pillar`） | 同上 | 同上 | 1 | 80 | about 88 art pixels tall | 高 48–112 |
| 頭目 | 同上 | 同上 | 同上 | 1 | 150 | about 160 art pixels tall, filling much of the canvas | 高 120–200 |

- 沒有姿勢差分、沒有表情：戰鬥的受擊、攻擊、倒下全由程式做（和既有 9 張相同）。
- 群（3 隻同框）的寬度上限 72 美術像素，否則 `BattleView` 的三隻排不下（QA：`width <= 72` 給群）。

### 9.2 Prompt（每張都用 `batch.py` 的敵人句型）
共同句（逐字沿用 `batch.py`）：
> Pixel art monster sprite of `<描述>`, facing the viewer, full body. Match the art style, pixel density, outline and shading of the attached approved monster sprite. 16-bit JRPG battle sprite, `<高度>`, strict square pixel grid, crisp 1px dark outline, limited palette, light from upper left, no anti-aliasing, no blur, no gradients. Centred on a perfectly flat solid pure magenta #FF00FF background with empty space around it. No text, no ground shadow, no particles. The design must be original and not resemble any existing anime or game character. Generate the image once with the image tool; do not post-process, resize, quantize or regenerate it.

附圖：一般怪物附已核准的 `enemy-slime` 原圖（既有錨點）；頭目與部件另附 `enemy-lanterneater` 原圖。R0 核准後，R1、R2 再多附一張 R0 已核准的同類型新圖（群／一般／頭目各一），讓新一批貼近新樣本。

**配色規則（重要）**：本道的新物種用**中性、偏亮**的配色（灰、象牙、淡紫、淡金），因為地區上色是以亮度乘顏色（`tintMatrix`），太暗或太飽和的圖上色後糊掉。QA 量亮度範圍（§9.3）。地區原生用該地區的本色（它們在地區裡還會被上色，同色系上色只會更濃）。

描述（`<描述>`，英文，交給 `tools/roster_art.py` 的 `DESC` 表）：

| eid | 描述 |
|---|---|
| paper-moth | a small moth folded from an old yellowed letter, faded handwriting on its paper wings, a tiny wax-seal body |
| lamp-wight | a faint hooded ghost holding a small brass lantern, pale ivory cloth body, warm glow on its face-less hood |
| root-hound | a lean hound made of pale grey mist and twisted roots, root claws, low hunting stance |
| tin-soldier | a dented life-sized tin toy soldier with a chipped painted face, a round shield and a wind-up key in its back |
| hoarder | a plump round rat with glowing crystal shards bursting out of its stuffed cheeks and a little sack on its back, startled eyes |
| tongueless-bell | a floating cracked bronze bell with no clapper, faint violet runes, thin chains trailing below |
| hollow-hunter | an empty suit of adventurer leather armour with a hood and nothing inside, holding a short sword, faint mist where the face should be |
| mist-twin | a small childlike figure made of pale blue mist holding out one hand, as if reaching for someone beside it |
| moon-crow | a crow with mirror-like silver feathers reflecting four different colours, a pale crescent mark on its head |
| estra-sentinel | an ancient white marble guardian statue with gold inlay, a tall tower shield and a halberd, a cracked star crown |
| requiem-choir | three small hooded singers fused into one floating shape, open mouths, a shared pale lantern glow |
| lantern-larva | a fat pale larva with a lantern-shaped glowing belly and tiny sharp teeth, a young version of a lantern-devouring beast |
| epitaph-golem | a slow golem built from stacked gravestone slabs covered in worn carved letters that cannot be read, no readable text |
| wick-shade | a small flickering shadow shaped like a candle wick with a single ember eye |
| keeper-echo | a tall faceless figure in a long travelling cloak holding up a star lantern, translucent and pale gold |
| ember-maw | a large dark furnace-like mouth on stubby legs, glowing embers inside, small wick shadows rising from it |
| cinder-imp | a tiny grinning imp made of grey ash and glowing cinders |
| forge-hound | a heavy hound with an iron forge furnace in its chest and molten cracks along its legs |
| ash-mourner | a tall thin figure in tattered grey mourning robes and a veil, carrying a smouldering censer |
| frost-doll | a porcelain doll the size of a child, covered in frost, cracked cheek, holding a frozen bouquet |
| glacier-tortoise | a huge tortoise whose shell is a small glacier with blue ice spires |
| snow-caller | a pale snow spirit with long white hair blowing sideways, mouth open as if calling a name |
| thunder-kite | a sharp-winged kite bird crackling with yellow lightning, talons spread |
| storm-totem | a carved standing stone pillar with copper bands and a glowing lightning rod on top |
| charge-jelly | a floating jellyfish with glowing yellow electric tendrils and a swirling charge in its bell |
| bog-mother | a bloated mound of green-brown swamp mud with many small eyes and tiny slimes budding from its sides |
| rot-lily | a giant wilted lily with dark purple petals dripping poison, its stem in a cracked vase |
| leech-knight | a knight in dark green armour made of overlapping leech segments, a long thin piercing lance |
| mirror-thief | a slim shadow figure wearing a hand mirror as its face, long fingers, crouching |
| veil-stalker | a hunched figure hidden under a long black veil, only two thin daggers showing |
| hush-acolyte | a hooded acolyte in dark grey robes with a finger raised to where its lips would be, a small silent bell at its belt |
| rivet-golem | a squat riveted iron sentry machine with one round lamp eye and a pike |
| siege-crab | a huge armoured crab with siege-engine claws and iron plates bolted to its shell |
| herald-engine | a tall brass machine with a horn-shaped speaker for a head and flag arms |
| fog-warden（頭目） | a towering gatekeeper of grey fog wearing heavy stone gate plates as armour, holding a great lantern halberd |
| silent-bell（頭目） | a colossal cracked bronze bell hanging from chains with a hollow mouth, violet runes, small bells orbiting it |
| hollow-champion（頭目） | a huge empty suit of heroic armour with many different swords stuck in its back like a fan, mist instead of a face |
| estra-archon（頭目） | a seated colossal marble ruler statue with a gold star crown and a cracked face, no hands, glowing eyes |
| archon-hand（部件） | a giant floating marble hand with gold rings and a glowing star in the palm |
| gorged-beast（頭目） | an enormous bloated lantern-devouring beast, much older and larger, dozens of swallowed lanterns glowing through its stretched hide |
| lantern-mother（頭目） | a vast dim shadow of a fading star lantern shaped like a veiled mother figure, cradling a guttering light, sorrowful rather than monstrous |
| ember-tyrant（頭目） | a giant crowned figure made of burning city ruins and flame, holding a melted sceptre |
| rime-sovereign（頭目） | a frozen queen-like figure sealed inside a tall ice throne, cold blue light |
| rime-pillar（部件） | a tall jagged ice pillar with a faint glowing rune core |
| thunder-roc（頭目） | a huge roc bird with storm-cloud feathers and lightning crackling across its wings |
| mire-hydra（頭目） | a swamp hydra with three heads of different sizes, rotting green scales, poison dripping |
| faceless-host（頭目） | a tall figure in a black coat whose face is a blank oval mirror, many small mirror shards orbiting it |
| fortress-colossus（頭目） | a walking fortress tower colossus with cannon arms and rivet plates |

- 規則：沒有任何字（碑文守寫「worn carved letters that cannot be read, no readable text」）；不寫作品名或畫師名；全部原創。
- 終幕的燈喰之母：只用「哀傷、像母親」的剪影，不畫恐怖臉。快樂結局的語氣要成立。

### 9.3 後處理與機械 QA（`sl_art.py`，TDD 擴充）
- 沿用：magenta 殘留 0、半透明 0、碰邊 0、主體被畫布切到、16 px 以下封閉洞只列警告。
- 新增（`test_sl_art.py` 先寫失敗的測試）：
  - `height_band`：高度在 §9.1 的範圍內，否則 `out of height band`；群加 `width <= 72`。
  - `palette_max`：不透明像素的色數 ≤ 32（契約本來就寫了，現在變成機械檢查）。
  - `lum_range`：不透明像素亮度的第 5 到第 95 百分位差 ≥ 0.35（0–1），否則 `too flat to tint`；本道物種另外要求平均亮度 ≥ 0.35（`too dark to tint`）。
- 每個 id 最多 3 次生成（契約）；樣本批每個 id 至少 2 版擇優（5d、計畫 4 的品質優先做法）。

### 9.4 工具與審核頁
- `tools/roster_art.py`（新，結構照抄 `portal.py`／5d 的 `gear_art.py`）：`gen`、`cand`、`pick`、`note`、`approve --batch B --by TEXT`、`publish --batch B`、`plan-json`。
  - `gen --batch=r1|r2` 在 registry 沒有 `roster_style_approved` 時拒絕（`PermissionError`），和 5d 的樣本鎖一樣。
  - `publish` 只發布 `approved` 的件，寫 `runtime`，並在**同一個 commit** 把 id 加進 `ROSTER_ART`、更新 `artPaths.test.ts` 的總數。
- `tools/review_roster.py`（新）→ `tmp/starlantern/review-roster/index.html`：
  1. 每隻新怪物放在三張既有戰鬥背景（`bg-f1/2/3`）上，用遊戲內的大小（放大 3 倍、`image-rendering: pixelated`）；
  2. 和既有 9 張並排（風格一致性）；
  3. 7 種地區色調的模擬（用和 `tintMatrix` 同公式的 CSS 濾鏡），檢查上色後還認得出來；
  4. 群的三隻排一排、多部位頭目和部件排在一起；
  5. 黑色剪影（圖鑑的「？？？」狀態）；
  6. QA 數字與所有版本、淘汰原因。
- 主對話用 Artifact 工具發布審核頁（`files` 帶入 `img/*`），把網址給使用者。

### 9.5 批次與核准（3 輪）
| 輪 | 內容 | 張數 | 核准方式 |
|---|---|---|---|
| R0 風格樣本 | `paper-moth`（群）、`root-hound`（一般）、`hollow-hunter`（人形）、`fog-warden`（頭目） | 4 | **使用者看風格**；沒核准前不能生成其他批（`roster_style_approved` 鎖） |
| R1 本道 | 其餘本道一般怪物 13 種（含 `hoarder`）＋頭目 `silent-bell`、`hollow-champion`、`estra-archon`、`gorged-beast`、`lantern-mother`＋部件 `archon-hand` | 19 | 照 5d：機械 QA ＋沒參與生成的代理在審核頁做視覺檢查即可發布；網址仍給使用者，使用者在發布前提出異議就重做 |
| R2 地區 | 18 種原生＋6 隻地區頭目＋`rime-pillar` | 25 | 同 R1 |
| 合計 | | **48** | |

### 9.6 數量的變化
- `allArtUrls()`：246 → R0 發布後 250 → R1 後 269 → R2 後 **294**（+48）。每次發布的 commit 同時改 `artPaths.test.ts` 的數字與註解（照現有註解寫法：「246 + plan 5f R0 的 4 張敵人 = 250」）。
- `registry.json`：`assets` 從 254 → 302（+48 個 `enemy-<eid>`，`kind: sprite`）；被淘汰的版本記在各自的 `rejected_attempts`，不留在 runtime 路徑。
- 若 5e（表情）先發布，總數以合併當時的實際值重算，兩者相加。

---

## 10. 驗收總表（給計畫寫手抄進 Task）

**資料（`data/roster.test.ts`，快）**
- 48 個新 id 唯一、不和舊 id 衝突；每個 `drops.mat` 存在於 `MATERIALS`；每個 `summon.id` 存在。
- 每組 1–3 隻；本道每張表 10–12 組；地區表 12 組；每個上線物種至少出現在 2 組。
- `no element wall`、`freshness`、經驗等價 [0.92, 1.08]。
- `ROSTER_LIVE ⊆ ROSTER_ART`；`ROSTER_ART` 的 registry 狀態都是 `published`。
- `bossFor`：表格測試涵蓋本道 3、5、10…40，各地區 5、10、15、20、25、30；未上線回 `lanterneater`。
- `AFFIX_SALT` 和既有的鹽都不同；`eliteAffix` 純函式。
- 原始碼不含 `Math.random`。

**引擎（行為）**：§5.1 每列的測試；`legacy fights replay bit for bit`；`the roster with nothing live changes nothing`。

**平衡**：第 1–20 項（6d 之後含 21）不改任何門檻，全綠；第 22a–22f 項全綠；`economy.test` 綠。

**畫面**：意圖欄顯示蓄力、守護；名牌顯示輪替弱點、受保護、詞綴；召喚的怪物有圖；圖鑑的「？？？」剪影。`ui2/scenes/battle.test.ts`、`render/BattleView.test.ts`、`ui2/scenes/handbook.test.ts` 各有對應測試；e2e 冒煙（第 4 層一場戰鬥、第 5 層頭目）在第 1 波上線時加。

**美術**：每張通過 §9.3 的 QA；`published.test.ts`、`artPaths.test.ts` 綠；R0 有使用者核准紀錄（`approved_by`）。

---

## 11. 留給實作者決定的部分
- 原型的確切數字與每隻的 ±15% 形狀（以 22a 為準）。
- 召喚、蓄力、技能機率的確切值（以 22a、22b、22f 為準）。
- 地區原生組的確切組合（照 §8.2 的形狀）。
- `shieldPct`（提案 50）。
- 圖鑑頁的版面細節（照現有手冊頁的 `MenuItem` 與 detail 結構）。

## 12. 需要使用者決定的事
1. 規模：本文件提案 48 種新怪物（48 張圖、3 輪審核）。要全部做，還是先做本道的 23 種（第 1–3 波，R0＋R1），地區的 25 種之後再說？
2. 燈喰之母要不要換成自己的造型（數值與技能和燈喰之獸完全相同，終幕平衡不變）？這會改 `FINALE_BOSS.base`，排在 6c 收尾之後。
