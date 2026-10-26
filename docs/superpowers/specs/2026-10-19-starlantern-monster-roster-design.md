# 星燈迷宮：怪物名冊擴充設計（Monster Roster）

日期：2026-10-19（第二版：依使用者回覆擴大規模、加入掉落、特性與故事連結）
狀態：**已核准（2026-10-26）**。使用者把設計核准交給 controller；controller 對照 2026-10-26 的程式碼定案，決定記在下方 §0。實作計畫：`docs/superpowers/plans/2026-10-26-starlantern-roster.md`（含逐節的對照報告）。
起因：
- 使用者：「怪物的種類目前也太少」。
- 使用者（第二次）：「可以做更多種，頭目肯定也是要夠多的，並且每種怪物要有不同的掉落物和特性，那些也應該一併考慮進去，某些怪物最好還可以跟故事本身結合」。
- controller 裁定：燈喰之母有自己的造型，數值與技能和燈喰之獸相同。

依據（皆已讀過程式碼與文件）：
- 資料：`src/scripts/games/starlantern/data/enemies.ts`、`floors.ts`、`regions.ts`、`materials.ts`、`items.ts`、`equipment.ts`、`gear.ts`、`forge.ts`
- 引擎：`engine/scaling.ts`、`battle.ts`、`skills.ts`、`combatant.ts`、`events.ts`、`game.ts`（`battleGear`、`rewards` 的呼叫）、`loot/drops.ts`（`lootRng`、`rollGear`、`pickSpecial`、`mix`）、`dungeon/run.ts`（`floorOf` 與各種 SALT）、`dungeon/rooms.ts`（`placeSpecial`）、`forge/cost.ts`（`forgeRng`）、`sim.ts`、`balance*.test.ts`
- 手冊：`engine/story/handbook.ts`、`ui2/scenes/handbook.ts`
- 美術：`render/artPaths.ts`、`render/artPaths.test.ts`（`allArtUrls` 釘在 246）、`render/BattleView.ts`、`art-factory/starlantern/contract.md`、`registry.json`、`tools/batch.py`
- 故事：`docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md`、`docs/superpowers/story/starlantern-lore-ledger.md`（落點表 §2、揭露表 §3、發明登記 I-xx）、`data/story.zh-TW.ts`
- 好感度：`docs/superpowers/specs/2026-10-18-starlantern-affinity-expressions-design.md` §6（送禮）、§11（6d、6e）
- 計畫：`docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md`、`2026-10-18-starlantern-plan6c-writing.md`

標記規則：
- 所有數值（屬性、機率、價格、經驗、表格權重）都是**提案**，必須通過平衡模擬才能定案。
- 標「決定」的是本文件的設計判斷，核准時可以改。

---

## §0 2026-10-26 定案（和下文衝突時以本節為準）

10-19 之後合併了 8c–8h（技能重做、符文、工房、建議 build）、難度（噩夢、地獄與詞綴）、故事深度、日曆與月相、好感度。controller 逐節對照現況後定案如下；每一條的依據（file:line）與完整理由在計畫的「對照報告」與「計畫裁定」。

1. **取消 §5.7「飽食個體」（M12）與 22e**：`AFFIX_SALT`、`AFFIX_IDS`、`AFFIXES`、`swift` 都已是難度詞綴，種子公式也撞上頭目詞綴；普通難度不走新分支是難度系統的契約。新頭目吃頭目詞綴、守關者吃菁英詞綴，照難度系統既有的串流。§5.8 的懸賞接口改指 `rollAffixes`。
2. **機制改名避開撞名**：守護用敵方的 `cover`；逃走 `left`；借來的招式 `mirror`；多部位 `parts`；階段 `stages`；再生 `mend`；冰封 `encased`；宣告 `hunt`；光環 `rally`；重新站起 `rise`；吸血直接用既有 `drainPct`。
3. **M27「停針」改成「遲滯」**（既有 `delay`，最後行動、不跳過回合）；**M28「吞入」的人照常行動**，只打得到施放者：難度系統已裁定「我方永遠不會失去整回合」。
4. **故事物種不用 `story` 欄位**（那是劇情戰的敵人）：改用 `lore`（夥伴）與 `remnant`（人的殘影，戰鬥紀錄寫「散成了霧」）。
5. **守關者戰**走精英的報酬與詞綴，但不掉記憶碎片；地圖用精英的事件地磚。
6. **素材**：新種類 `trophy`（30）與 `keepsake`（遺物，九位夥伴的守關者各一）。`GIFT_KINDS` 加 `keepsake`、不加 `trophy`，送禮仍完全由 `kind` 推導；新的招牌素材對所有人都是「普通」，**不新增任何「喜歡」「最愛」**；遺物照痊癒規則「集滿前婉拒、之後喜歡」，反應句寫進 `GIFT_LINES`（§7.4 的 9×2 表格作廢）。
7. **專屬獨特**帶 `owner`、`region: null`，不進任何掉落池、沒有剪影；替換後重跑 `applyStarlit`；製作的「先擊倒過」讀圖鑑的 `felled`（`bossKills` 以深度為鍵，不能用）。
8. **鹽**：八個 SHA-256 初始字都已用掉；`WARDEN_SALT = 0x428a2f98`、`TROPHY_SALT = 0x71374491`。
9. **位元保證**：parity 固定量舊表（量的是角色之間的平衡）；舊戰鬥的 fixture 就是 sim gate 的動作雜湊；上線任務刻意重錄普通帶的報告，有固定的重錄與審查規則；`contribution.json` 永遠等於 `contribution.8d-final.160.json`。
10. **美術**：`allArtUrls` 的基準是 722（不是 246），全部發布後 999；每件專屬獨特 2 張圖；圖鑑沒見過的物種不顯示剪影（5d 禁止 CSS 剪影）；R0 寫新的 `roster_style_approved`。**使用者 2026-10-26 裁定**：只有 R0 風格樣本要他核准，R1–R4 通過機械 QA 與全新脈絡的獨立代理審核後就發布，他之後可以要求換任何一張（`contract.md:145`、5d 補遺 S4 在 PR D 照此改寫）；四批全做（含地區），codex Plus 額度用完改用 codex credits，兩者都用完才暫停，絕不用佔位美術。
11. **故事**：`false-moon` 的兩個狀態叫「月明／月蝕」（避開瑟蕾的月相與第 5 片之前的「新月」），閘門 `mem:selene:2`（滿月的明亮結局）→ `:3`（結局不只一種）；「迷宮吞過追進來的巡守」登記 I-222（不是 I-17）；凜的師父就是鐘守（I-10 翻案、I-167），照樣不出現；`vault-mimic` 閘門改 `mem:liz:4`；`debt-collector` 改名「敲門的影子」、`iou-slip` 改名「泛黃的紙條」（「債」到第 2 片才揭露）；提燈人第三句改寫並用 `seen: ['mem:hero:9']`；燈喰的子嗣登記 I-223；新名詞登記 I-224；名字掃描補「要殺的人」；文字一律「菁英」；圖鑑一個「……」都不用。§16 的問題由 controller 定案：故人以沒有臉的霧中殘影出現，維持本文的寫法。
12. **燈喰之母只在終幕出現**：`FINALE_BOSS.base` 換成 `lantern-mother`（同數值、同技能），但終幕之後本道第 30 層照舊是長大的燈喰之獸（既有的劇情裁定「the grown beast, not her」，`engine/game.test.ts:3545-3551`）；§5.6「本道 30」那一格改成 `lanterneater`。她的戰利品與專屬獨特在終幕掉。
13. **檔名與代號**：`data/roster.test.ts` 已存在，新資料模組叫 `data/monsters.ts`；7a／7b／7c 和難度計畫撞名，改用計畫的 PR 代號 A、B1、B2、C、D、E1–E4、L1–L4。
14. **地區的表等原生上線才換（PR A 審查裁定）**：§8.1 的地區表，只有那個地區的原生組全部上線之後，才換成「原生 6 組＋本帶前 6 組」；之前一律是「舊表整張＋已上線的新組」，免得地區在原生上線前變成沒有原生、只有 7 種的本道表。本道照原規則。只有寶物怪的那一組不單獨加進舊表。
15. **PR B1 審查裁定（2026-10-26）**：
    - **倒下時的效果不打倒最後一個站著的隊員**：留在 1 HP（同 M28「最後一人不被吞」的精神）；`checkOutcome` 的順序不動。
    - **召喚畫不出來就不抽它**：召喚不成（場上滿了、`ROW_MAX` 滿了、次數用完、目標沒上線）時，這招在 `findIndex` 照抽但跳過（同復活），意圖不會說「呼喚」卻去「攻擊」。計畫好之後才被擋（同一回合別隻先召喚、同類剛用掉每場一次的招）時一律改普攻；只有完全沒有傷害技的敵人（燈底之巢）改用技能表裡第一個能用的招（蜷縮），所以牠永遠不攻擊（確認審查第 2 條：不讓別的招以 100% 機率出現）。
    - **燈底之巢照 §5.5**：本身不攻擊，每回合孵一隻（場上上限內，沒有每場次數上限）；孵不了就「蜷縮」（不造成傷害）。**有守關者（`rank: 'warden'`）的戰鬥和頭目戰一樣以 `BOSS_GROUP_CAP`（4）為場上上限**（確認審查第 1 條：守關者走菁英路徑、不是頭目戰，原本拿到的是 `groupCap`，五人隊伍時巢加幼體可以到 6 隻）。
    - **幻影跟著本體走**：本體倒下而且沒有站起，牠的幻影一起離場（不算打倒、不給報酬）。開場的幻影算進 `ROW_MAX`。幻影不行動，排行動順序之前就排除，不抽亂數。守護不會守幻影。
    - **被同伴復活的敵人要畫回來**：敵人的 `revive` 走和 `rise` 一樣的站起；一回合播完，所有還活著的敵人都顯示。只有畫面上有那隻敵人的格子時才發 `rise`：隊員的復活和 master 上的時間完全一樣（確認審查第 4 條）。
    - **重摺每場一次，整群共用**（不是每隻倒下的同伴各一次）：`EnemySkill.oncePerFight`，以「物種／招式名」記在 `BattleState.spent`。
    - **偷走的錢在小偷倒下的那一刻回到錢包**（守關者兩倍），不必等勝利；勝利畫面照樣說討回多少，但不再重複加進金錢。會召喚小偷的戰鬥（兩層內）也有錢包。
    - **隱匿勝過宣告**：隱匿中的隊員不會被宣告，已被宣告的人隱匿時，單體攻擊照原本抽到的目標。
    - **守關者**：拿菁英的報酬與詞綴（§0.5），**也**吃 `ELITE` 的數值倍率——§5.5「守關者用精英化的數值（§5.1）」與 §5.1 的「中頭目：精英化的標準或重（hp ×2.2、atk ×1.3，同 ELITE）」都是以戰鬥時套上 `ELITE` 為前提寫的，資料裡存的是未精英化的原型；名字前**不加 ★**（有名字的敵人），金色外框與 `eliteDmg` 照菁英。
    - **只剩逃走的敵人的「勝利」**（沒有任何敵人被打倒）不給劇情節點（`afterWin`）與「被救下」的好感。
    - **兩隻偽裝的敵人保留字母**：「寶箱？ A」「寶箱？ B」（字母前空一格，同其他名字）。
    - **凍結也打斷蓄力**（§6.2 原本只寫睡眠與遺忘）；遺忘在 B2 PR。
    - **舊名冊的整場戰鬥釘子**：七區 × 六個深度 × 每張表前四組 × 三種（普通、噩夢菁英＋tough／swift、地獄＋scorch 群體詞綴），加上地獄頭目與故事頭目，各六個種子打到結束；雜湊每場的最終狀態、途中每一個意圖、報酬與整體的抽取次數，值在 origin/master 上錄（`engine/legacyFights.test.ts`）。
16. **PR B2 實作裁定（2026-10-26）**：
    - **階段與輪替在擬定行動時決定（B7，M5、M8）**：一回合的行動抽出之前（`planEnemies` 與回合開始的重抽）才換階段或換弱點，回合中途不換，所以擬好的招式一定出自它出手時的那張技能表。依 HP 的階段（`stages[].below`）到了就不回頭，補血也一樣；`stageEvery` 的敵人（不存在的月亮）依回合輪流用自己的技能表與每一個階段。階段有寫屬性才換屬性。
    - **映月鴉的弱點（M5）**：依回合是物理→火→冰→雷，沒有抗性；名牌顯示現在的弱點（「弱火」）。`prism` 的敵人連估價也不寫 `revealed`。
    - **適應（M16）**：第一個打中牠的屬性在命中之後變成抗性，而且不再是弱點；從那一回合算起 `adapt` 個回合結束後恢復；每場一次。名牌顯示「抗〇」。
    - **借來的招式（B8，M6）**：記錄的是我方最後一次打中敵人的那一下（誰、屬性、那個效果的威力），只有場上有會借招的敵人時才記；打回去的那一下是遠程、物理用 atk、其他屬性用 mag，威力 `min(記錄, cap)`；嘲諷、盾擊、宣告、代受照樣轉向；沒有記錄或那個人已倒下就普攻。意圖照當下的記錄寫出要打誰。
    - **部件（M7）**：本體在任何一個護著牠的敵人站著時，每一下命中 × `cutPct`%（持續傷害不減）；護著牠的是 `by` 列的物種（冰中的拜殿＝冰狛犬、蜃樓之城＝蜃樓舞者），沒寫就是場上的部件。名牌「減傷」，目標說明寫明要先打護著牠的。
    - **模仿（M18）**：開戰（或被召喚）時，atk、mag 取「atk 最高的在場隊員」的 `mimic`%，再乘上牠的定義帶著的成長以外的倍率（菁英、狀態、難度、補償、隊伍人數、頭目與深層的倍率）；不乘 `ENEMY_POWER`（隊員的數值已經含成長）。
    - **遺忘（B9，M9）**：持續到中招者的下一個回合，那一回合不管是行動、睡著還是凍住都算用掉；技能（含勇者的回聲）改成普攻，打它原本點名的敵人（點的是隊友就隨機），不付 TP；道具、絕技、防禦照常。敵人中了也一樣，蓄力會斷。`sleepRes` 抵抗、頭目減半、`cure` 與無人機的「所有異常」都解；`AILMENT_IDS` 排最後；異常列的嚴重度排在睡眠之後；小圖示在 E1c 發布前只顯示字。
    - **吸 TP（M17）**：每一下命中各吸一次，最多吸到 0；名牌顯示這一場吸走的總量（「吸走N TP」）。**對中毒加傷（M25）**：在 `hitAmount` 裡乘，和 `wounded` 同一處。**抹去（M15）**：只搬正值的增益（帶著剩下的回合數），照「同方向留強的」規則加到敵人身上；減益、常駐、結界的守護都不動；沒有可搬的就什麼都不說。
    - **修復（B10，M21）**：回合結束、角色機制之後結算（逃走之前）；那一回合被 `stopBy` 屬性**打中**（命中才算）就不修，紀錄寫「短路了」。
    - **冰封（M23）**：冰封中的敵人不擬定行動、不抽亂數；被火**打中**就解凍，否則第 2 回合結束時解凍；回合中途被火解凍的，從下一回合才行動。意圖欄寫「冰封中」。
    - **光環（M26）**：活著的旗手讓**其他**敵人得到常駐（`auras`，回合數 0）的增益，倒下時拿掉；照「同方向取增益與常駐較強者」的既有規則，不和技能增益相加。影之行列用 `throng`：每一隻站著的同伴影子各給一份。
    - **遲滯（M27）**：既有的 `delay`（下一回合最後行動）加 spd −30%，增益寫 2 回合（施放那一回合結束時減 1，所以蓋住下一回合）；同一個施放者不連續遲滯同一人：抽目標時先排除上一個被牠遲滯的人（還有別人可打時），嘲諷硬把它送回同一人時，這一下照打但不遲滯。
    - **吞入（M28）**：一次只吞一人，全隊最後一個在外面站著的人不吞；被吞的人在吞的那一回合與下一回合結束各受一次最大 HP 10% 的毒傷，下一回合結束時吐出；施放者自吞入起累積失去 15% 最大 HP（任何人的命中都算）或倒下就立刻吐出。被吞的人照常行動：單體、範圍、散射都只打施放者（×1.5，不經守護、不彈射），自己的我方技能只對自己；隊友的技能與絕技選不到她，道具可以；已經張開的結界與裝置照樣罩著她（它們罩整隊，不是瞄準）；她不算在陣型裡（近戰構得到的前排照剩下的人算），她的嘲諷、盾擊、代受、被宣告都不作用。
    - **B11 補上的規則**（B1 留下的與 §5 其餘的特性）：
      - `every`：只在回合數是它的倍數時能用（其他回合照抽、跳過）；蓄力的技能在那一回合開始蓄力，下一回合落下時不再看 `every`（已蓄好的一擊一律落下）。用在領舞者的轉拍（每 3 回合）、灰化老樹的孢子（每 3 回合）、無星之鯨的吞沒（每 3 回合蓄力）、沙暴之口（每 2 回合）。
      - `needs`：至少有 `n` 隻那種同伴站著才能用。祭典的燈籠就是提燈幽影（不另做敵人 id），每回合點一盞，頭目戰的場上上限 4 讓它最多三盞；三盞全亮時「祭典之火」以 0.6 出現。
      - 影之行列的影子就是走失的影子（照樣模仿），每回合加入一隻；本體每有一隻站著的影子 atk、mag +15%（`throng`，常駐）。灰枯的孢子莢就是孢子蛾：有孢子蛾站著時本體減傷 50%，蛾倒下時用牠自己的倒下效果十字毒。
      - 走音的音樂盒：「演奏」蓄力兩回合（`windupRounds: 2`），每一個蓄力回合讓自己這一邊每一隻回 10% 最大 HP（`windupAllies`），之後整排睡眠；蓄力中被**打中**一下就斷（`fragile`，紀錄寫「演奏被打斷了」），下一次重新開始。睡眠、凍結、遺忘照樣打斷。
      - 歸途之光：守望改成 1.0（永遠不攻擊）；倒下時我方全體回 10% 最大 HP（`restore.hpPct`）。
      - 騎士殘影：每有一個同伴倒下就 def +30%（3 回合，`onAllyFall`），每一次倒下只算一次；被召喚進來之前倒下的不算。
      - 金箔拾憶鼠：每被打中一下閃避 +10（敵人的閃避照舊上限 `EVADE_MAX`）。白色寂靜的「寂靜」每次再降 10%，最多到 −30%（`stackTo`）。金庫之龍的「金幣吐息」每偷著 1 金威力 +1%，最多 +100%（`hoardPct`）。
      - 飛舞的魔法書（M5 變體）：`stageEvery: 1`，火→冰→雷一回合一頁，意圖顯示的招名就是下一頁的屬性。最初的燈：`prism: 'stage'`，三個階段（66%、33%）各自的弱點與全體技屬性。
      - 舊怪物的深層特性：`isRosterTable(region, depth)`（`encounterTable` 給的是名冊表）時，`meetEnemy` 讓 `scaleEnemy` 套 `DEEP_TRAITS`：蝙蝠伏擊、甲蟲「甲殼守護」（0.25，守護 2 回合）、魔像「重踏」（0.2，蓄力「高舉雙臂」，整排 130）。沒有任何名冊上線時哪裡都不是名冊表。
      - `EXP_TUNE` 不動：召喚來的與幻影不給經驗，經驗等價只算表裡的組（`exp holds` 照舊過）。
    - **敵人的 `restore`**：不吃我方「道具加倍」的被動（只有隊員的 `restore` 吃）；`hpPct` 是目標最大 HP 的百分比（歸途之光倒下時的回復）。

---

## 0. 總數一覽

| 項目 | 數量 | 新美術 |
|---|---|---|
| 一般怪物（本道 29、地區 30） | **59** | 59 張敵人圖 |
| 中頭目（具名精英「守關者」：本道 5、地區 6） | **11** | 11 張 |
| 頭目（本道 10、地區 18） | **28** | 28 張 |
| 頭目部件（多部位頭目的手、柱） | 2 | 2 張 |
| **新敵人定義合計** | **100** | **100 張敵人圖** |
| 新素材：每種一般怪物的招牌素材 | 59 | 59 個圖示 |
| 新素材：頭目與中頭目的戰利品（`trophy`） | 39 | 39 個圖示 |
| 新物品：頭目與中頭目專屬的獨特裝備（`unique`） | 39 | 39 張裝備圖（照 5d 的 `gear-<id>` 做法） |
| 銘文（一般怪物的專屬詞綴，用既有詞綴鍵） | 59 | 0 |
| 精英詞綴「飽食個體」 | 5 | 0 |
| 舊怪物的深層特性（第 4 層起） | 3 | 0 |
| **新美術合計** | | **100 敵人圖＋98 素材圖示＋39 裝備圖 = 237 件**。圖示與裝備圖做成 5×4 的工作表，共 7 張 codex 生成圖 |

---

## 1. 現況（讀過程式碼）

### 1.1 名冊
- 一般怪物只有 **8 種**（`NORMAL_ENEMIES`，`scaling.test.ts` 釘死長度 8）：第 1 層 `slime`、`bat`、`wolf`；第 2 層 `beetle`、`wisp`、`lizard`；第 3 層 `golem`、`shade`。
- 頭目只有 **1 種**：`lanterneater`。本道第 3 層、每個 5 的倍數層、所有地區的頭目層都是它，只是依深度放大。終幕也是它（`FINALE_BOSS = { base: 'lanterneater', power: 0.8 }`，只換名字）。
- 劇情敵人 `scarlet-foe`（借絲嘉蕾立繪）。
- 8 種裡有 3 種沒有任何技能：`bat`、`beetle`、`golem`。它們只差數值。

### 1.2 遇敵
- `encounterTable(region, depth)`：本道用該深度地形（1→2→3 循環）那一層的 `FLOORS[n].encounters`，所以**本道第 25 層遇到的還是第 1 層的史萊姆**；地區把 `id ≤ depth` 的各層表合在一起。
- `encounterGroup` 從表裡 `pick` 一組，**只從 `game.rng` 抽一次**。
- 精英：`eliteGroup(run, depth)` 用自己加鹽的 `mulberry32`，從同一張表挑一組，第一隻當精英。
- 地區變體：`scaleEnemy` 加前綴、**用地區的弱點與抗性蓋掉**怪物自己的、加地區技能與地區素材；`BattleView` 執行期上色。換色變體已經有了，問題是剪影只有 8 個。

### 1.3 戰利品與素材（讀過）
- **素材掉落**：`EnemyDef.drops: { mat, chance }[]`，勝利時在 `rewards(b, game.rng, …)` 裡**用 `game.rng`** 每隻每條抽一次（`dropMul` 的小數部分再抽一次）。地區素材由 `scaleEnemy` 附加（`REGION_DROP_CHANCE = 0.15`）。
- **裝備掉落**：`game.battleGear`，全部走 `lootRng(run) = mulberry32(mix(run.seed, run.lootDraws++))`：
  - 每隻一般怪物一個 `lootRng`，`rng() < GEAR_CHANCE.monster (0.08)` 才 `rollGear`；
  - 精英一個 `lootRng`：一件裝備（精英機率）＋ `rollRareMaterial`（同一個 rng 實例接著抽）；
  - 頭目一個 `lootRng`：`rollBossGear` 兩件（同一個實例）。
  - **每次呼叫 `lootRng` 是一個新的產生器**：在同一個實例裡多抽幾次，不會改變 `lootDraws`，也不會影響之後任何一次掉落；但會改變同一實例裡**後面**那次抽取（例如精英的稀有素材）。
- **特殊裝備**：`SPECIALS`（傳說、獨特、套裝）。獨特＝固定 3 條詞綴、`ROLL_FLOOR.unique = 0.9`；傳說＝帶一個技能改寫（`POWERS`）。`pickSpecial` 在 `legendaryTier` 時決定是哪一件：本道只出 8 件角色傳說；地區另有該區傳說、獨特、套裝。
- **素材用途**：
  - 賣錢（`price`）；
  - 商店底材解鎖（`EQUIPMENT.unlock`，用第 1–3 層怪物素材）；
  - 鍛造屋：底材配方（`BASE_RECIPES`）、消耗品配方（`CONSUMABLE_RECIPES`）、強化（精華與稀有素材）、重洗（`REROLL`：地區素材鎖定一組詞綴 `REGION_AFFIX_GROUP`）、融合、套裝製作（`SET_RECIPE`：地區素材 8＋星燈之淚 1）；
  - 鍛造屋的亂數是 `forgeRng`（`forgeDraws` 計數，玩家主動操作才抽）。
- **送禮**（affinity spec §6，6d 尚未實作）：`GIFTABLE` 是 `kind` 為 `monster`、`junk`、`rare`、`region` 的素材；每位夥伴有「最愛 +4／喜歡 +2／普通 +1／婉拒 0」，婉拒與痊癒各要寫專屬反應句；同一種素材第 3 份起一律 +1；`BOND_CAP.gift = 30`。
- **平衡與裝備**：第 10、19a 項的 `kitParty` 依怪物掉落的稀有度權重給全身裝備，`legendaryTier` 算成稀有（「特殊效果不是數值，不進期望」）；第 11、14 項用全身稀有＋強化。

### 1.4 敵人能做的事
- `EnemySkill { name, chance, target, effects }`；`chooseEnemyActions` 依序對每個技能抽一次 `rng() < chance`。
- 現有、可以直接給敵人用的效果：`damage`（`hits`、`crit: 'always'`、`melee: false`、`execute`、`wounded`）、`inflict`（`poison`、`sleep`）、`buff`（負值＝減益）、`heal`／`buff` 對 `ally`／`allies`。
- 平衡帶**窮舉**整張 `encounterTable`，新怪物一進表就被第 7–10、12、17–19a 項量到；頭目帶寫死 `lanterneater`。

### 1.5 美術
- 敵人圖：單張、單格、透明 PNG，沒有動畫格或表情；動作由程式做。一般 `--height 64`（prompt「about 72 art pixels tall」）、頭目 `--height 150`（「about 160」），每張附已核准的 `enemy-slime` 原圖當風格錨點。
- `allArtUrls()` 對 `ENEMIES` 每個沒有 `look` 的 id 列一張圖、對 `MATERIALS` 每個不在 `NO_ICON_YET` 的 id 列一個圖示。**只要把 id 加進去，246 就會變**，`published.test.ts` 會去找磁碟上的檔案。
- 5d 計畫的規則：獨特、傳說、套裝沒有專屬圖時只顯示文字，不借底材圖。

### 1.6 圖鑑
- 手冊第 4 頁「圖鑑」列出**全部**非劇情敵人（連沒遇過的都列），只有名字與已揭露的弱點。

---

## 2. 目標、非目標、反目標

**目標**
1. 任何連續 5–6 層的路程，看到的怪物明顯換一批（§3.4 的量化驗收）。
2. **每種怪物**都有改變打法的特性，不是換數字（§5、§6，舊的 `bat`、`beetle`、`golem` 也補上，§5.6）。
3. **頭目夠多**：本道每 5 層一隻不重複的頭目，到第 50 層；每 5 層之間再有一隻中頭目；每個地區 3 隻頭目＋1 隻中頭目。
4. **每種怪物有自己的掉落**：招牌素材、專屬銘文或專屬獨特裝備，必要時有稀有掉落；全部接進既有的素材、鍛造、送禮系統（§7）。
5. **一部分怪物和故事結合**：夥伴的過去、靜鐘會、暮霧、燈喰之母的子嗣（§4），並遵守揭露順序。
6. 任何隊伍組成都要可以用；凍結平衡帶一個都不放寬；沒有核准美術就不上線。

**非目標**
- 懸賞任務（第 2 項）；本文件留接口（§5.8）。
- 怪物動畫格。
- 戰鬥中夥伴認出故人的台詞（需要 6e 之後的文字，列為之後的計畫 7c，§12.4）。

**反目標**
- 第 1–3 層位元不變（理由：平衡第 1–6、13、15 項與新手體驗的地基；多樣性的問題出在第 4 層以後，新手前三層本來就只走一趟）。
- 不改舊怪物的定義與技能（舊怪物的深層特性只在新表上線的深度生效，§5.6）。
- 不動既有平衡旋鈕（`ENEMY_POWER`、`DEEP_ENEMIES`、`PARTY_SCALE`、`BOSS_PARTY_SCALE`、`GROUP_CAP`、`ELITE`、`AFFIX_SCALE`、`GEAR_CHANCE`、`BOSS_LEGENDARY`、`REGION_DROP_CHANCE`）。
- 不用 `Math.random`；不從既有串流多抽（§7.5）。
- 不讓怪物把夥伴的過去「當成反派」：故人的殘影不是那個人，打倒是「放下」，不是殺死（§4.1）。

---

## 3. 規模與分佈（決定）

### 3.1 深度帶
| 帶 | 深度 | 劇情階段（ledger §2 的 `ACT_DEPTHS`） | 主題 |
|---|---|---|---|
| A | 1–3 | 序章、第一幕 | **不變** |
| B | 4–9 | 第二幕 | 「霧根層」：露米亞鎮民日常的記憶 |
| C | 10–15 | 第三幕 | 「鐘聲層」：鐘、巡守、空殼、成對的影子 |
| D | 16–24 | 第四幕 | 「古城層」：古城的衛像、鎮魂歌、燈喰的幼體、祖先的機兵 |
| E | 25–30 | 第四幕到終幕 | 「燈芯層」：燭芯、提燈人、燈底的子嗣 |
| F | 31+ | 終幕之後 | 「失物層」：迷宮成了找回失去之物的地方（ledger §1.1 終幕條目），語氣明亮一些 |

`bandOf(depth)`：`≤3 → A`、`≤9 → B`、`≤15 → C`、`≤24 → D`、`≤30 → E`、其餘 `F`。

### 3.2 數量與理由
| | 本道 | 每個地區 | 合計 |
|---|---|---|---|
| 一般怪物 | B 6、C 6、D 6、E 5、F 4、寶物怪 2 = 29 | 5（其中 1–2 種是夥伴的故事） | 29 + 30 = 59 |
| 中頭目（守關者） | 5（第 8、13、18、23、28 層） | 1（第 8、13、18…層） | 5 + 6 = 11 |
| 頭目 | 10（第 5、10…50 層） | 3（第 5、10、15…層輪替） | 10 + 18 = 28 |
| 部件 | 1（執政像的手） | 霜凍 1（冰柱） | 2 |

- **一般怪物**：每帶 6 種新物種，加上延續上一帶的 3–4 種，一張表約 9–11 種。地區 5 種原生＋本道當帶 6 組，所以地區跑 10 層也會換兩次面孔。
- **頭目**：
  - 本道第 5–50 層每 5 層一隻**不重複**的頭目（10 隻），第 55 層以後依序循環。這回應「頭目肯定也是要夠多的」：玩家從第 4 層到第 50 層不會打到同一隻頭目兩次。
  - 地區 3 隻，第 5、10、15 層各一隻，之後循環（第 20 層＝第 5 層那隻）。地區一趟通常 5–15 層，所以一趟裡會遇到 2–3 隻不同的頭目。
  - 原本「地區第 10、20 層打本道頭目的上色版」不再需要。
- **中頭目（守關者）**：在不是頭目層、也不是第 1–3 層的「x3、x8」層放一個守關者房（§8.3）。打不打由玩家決定，像精英一樣。本道 5 隻依深度不同；地區每區 1 隻，都是夥伴故事的殘影（§4.2）。
- **工作量**：100 張敵人圖分 5 輪審核（§12.5）。素材圖示與裝備圖做成工作表（一張 codex 圖 20 件），共 7 張，跟著敵人圖的輪次一起審。

### 3.3 換色與詞綴（不花美術的倍增器）
- 地區色調（既有）：本道物種一進地區表，就自動得到 6 種地區外觀。
- 精英詞綴「飽食個體」5 種（§5.7）。
- 這兩者只是倍增器；剪影的多樣性靠 100 張新圖。

### 3.4 「不會一直看到同一批」的量化驗收（`data/roster.test.ts`）
- `freshness`：本道任兩個相差 ≥ 6 層的深度（4–60），表內物種集合的重疊 ≤ 60%。
- 任一深度的表至少 8 種物種，每種最多出現在 40% 的組。
- 地區（第 4 層起）：表內至少 4 種原生物種，原生組至少佔 40%。
- 本道第 5–50 層的頭目兩兩不同；每個地區第 5、10、15 層的頭目兩兩不同。

---

## 4. 故事連結

### 4.1 總則（決定）
- **怪物是霧生的迴響**：迷宮吞下的記憶在暮霧裡凝成形體（story spec §3.1、§3.3）。越深，被吞的記憶越古老：淺層是露米亞鎮民的日常，中層是靜鐘會與空殼，深層是古城的悲傷，最底下是燈喰之母與一輪又一輪的提燈人。
- **故人的殘影不是那個人**：舞團、騎士團、神社的狛犬、老師的書……都是「被迷宮吞下的那段記憶的形狀」。打倒時的戰鬥紀錄寫「霧散了」，不寫死亡；圖鑑在夥伴的那一片之後，補一句「她記得的那個人不在這裡」的語氣。這守住 ledger 的語氣（一路上是暗的、快樂結局），也避免把夥伴的過去寫成反派。
- **靜鐘會的人不是活人**：迷宮吞過不少追進來的巡守（ledger I-17：凜追進迷宮、在出口前被暮霧吞沒），出現的是**被吞下的巡守的殘影**。不殺活人；不出現凜的師父（I-10：不出場）、不出現鐘守（活著的 NPC）。
- **名字不劇透**：戰鬥中的名字在任何深度都看得到，所以名字只能用揭露表（ledger §3）「在那之前只能」那一欄的程度。所有故事細節放在圖鑑，以 `story.seen` 的場景 id 閘門控制（§10）。

### 4.2 故事怪物與閘門
欄位：「出現」是最早遇得到的深度；「名字安全的理由」對照 ledger §3；「圖鑑閘門」是介紹第二句（含故事內容）解鎖的場景；「需要的文字」是圖鑑那幾句誰來寫、依賴什麼。

| 怪物 | 類別 | 出現 | 連結 | 名字安全的理由 | 圖鑑閘門與模糊規則 | 需要的文字 |
|---|---|---|---|---|---|---|
| `false-moon` 不存在的月亮 | 本道中頭目 | 本道 8 | 瑟蕾：水晶洞窟映著不存在的月亮（§6、I-60） | 相遇（本道 2）已經演出月亮 | 第一句只寫月相輪替。第二句 `mem:selene:2`：「她說過，滿月與新月是兩個結局」，不寫結局內容（I-60 在第 4、5 片） | 自足（ledger I-60、I-64） |
| `bell-watcher` 鐘樓巡守 | 本道 C 一般 | 本道 10 | 靜鐘會的巡守殘影 | 不寫「靜鐘會」「刺客」「代號」「信物」（`act3`、`mem:rin:6` 的檢查詞）；「鐘樓」在凜第 1 片就有 | 第二句 `act3`：可寫「靜鐘會的巡守」。永遠不寫凜、不寫「從深處走出來的人」與殺人的任務；`mem:rin:6` 之後也不寫（凜的事留在凜的文字裡） | 6c Task 11（鐘守的聲音）之後寫，對齊 I-28 的用語 |
| `bell-warden` 鐘樓的守門人 | 本道中頭目 | 本道 13 | 同上；守門呼應凜守的那扇石門（I-12） | 「守門」在凜第 1–5 片可提 | 同上；另外不寫「石門」「出口」的細節（I-12 的畫面屬於凜） | 同上 |
| `hush-acolyte` 靜默侍者 | 暗影一般 | 暗影 4 | 靜鐘會的誓言 | 名字中性 | 第二句 `act3` | 同上 |
| `hollow-hunter` 空殼獵人、`hollow-champion` 空殼勇者 | C 一般、本道 15 頭目 | 10、15 | 「空殼」：吸收太多別人記憶的冒險者（§3.1） | 「空殼」是鎮上的常識，不是秘密 | 不需閘門；用語對齊 6c Task 13 的吸收台詞 | 6c Task 13 之後寫 |
| `ancestor-automaton` 古代機兵 | D 一般 | 本道 16 | 波比：祖先造的機兵守在星燈底下（I-69 第 4 片） | 舊的神殿石像已經是同類；名字不寫「祖先」 | 第二句 `mem:bobby:4`：「她說，這是祖先造的」。不寫燈芯機構、閥（I-69 第 5 片與終幕） | 自足 |
| `toppled-automaton` 倒下的機兵 | 本道中頭目 | 本道 18 | 同上 | 同上 | 第二句 `mem:bobby:4`；同上 | 自足 |
| `old-city-sentinel` 古城衛像、`requiem-choir` 鎮魂歌隊、`requiem-conductor` 鎮魂指揮者、`old-city-archon` 古城執政像 | D 一般、中頭目、頭目 | 16–23 | 艾斯特拉的戰爭與悲傷（§3.4） | 名字用「古城」，不寫「艾斯特拉」（`act4` 才揭露歷史；第 16 層第一次到時，第四幕的場景要回城才播） | 第二句 `act4`：可寫「艾斯特拉」 | 自足 |
| `keeper-echo` 無名的提燈人 | E 一般 | 本道 25 | 以前每一輪的提燈人＝洛恩過去的自己（§3.4、§4） | 不寫「守燈人」 | 第一句只寫「提著燈往下走的影子」。第二句 `act4`：「很久以前，有人把自己點成燈芯」（傳說的程度）。第三句 `mem:hero:9`：「每一個都是同一個人」。永遠不寫劍、燈鑰（`mem:hero:10`） | 自足；第三句在 6c Task 14 之後對齊 |
| `lantern-larva` 燈喰幼體、`deep-tendril` 燈底之鬚、`lantern-brood` 燈底之巢、`gorged-beast` 飽食之獸 | D、E 一般；中頭目；頭目 | 16–28 | 燈喰之母的子嗣 | 不寫「母」 | 第二句 `finale`：寫出「燈喰之母」 | 6c Task 14 之後寫 |
| `lantern-mother` 燈喰之母 | 本道 30 頭目 | 30 | 終幕頭目 | 名字已經是終幕的 `STORY.finaleBossName` | 介紹在 `finale` 之前只有「？？？」；之後寫一句終幕的語氣 | 6c Task 14 之後寫 |
| `mirage-dancer` 蜃樓舞者、`mirage-lead` 蜃樓的領舞者、`mirage-city` 蜃樓之城 | 熾焰一般、中頭目、頭目 | 熾焰 4、8、15 | 莎菲拉：流浪舞團、蜃樓的城（I-63） | 相遇（熾焰 3）就是火中獨舞；「蜃樓」不揭露舞團 | 第二句 `mem:safira:1`（舞團存在）；城的介紹第二句 `mem:safira:5`（城是假的、燒起來）。不寫團長的話 | 自足 |
| `sand-scorpion` 沙海蠍、`sandstorm-maw` 沙暴之口 | 熾焰一般、頭目 | 熾焰 4、10 | 熾焰之地是被吞下的沙漠 | 名字只寫沙 | 第二句 `mem:safira:5`：「這片火海原來是沙漠」 | 自足 |
| `ice-komainu` 冰狛犬、`frozen-pilgrim` 凍結的參拜者、`ice-shrine` 冰中的拜殿、`rift-maw` 迷宮的裂口 | 霜凍一般、中頭目、頭目 | 霜凍 4、8、15 | 千鶴：神社、封印裂口、冰裡的幾十年（I-61、I-62） | 相遇（霜凍 3）就是凍在冰裡的巫女；狛犬、拜殿不揭露神社已經不在 | 拜殿第二句 `mem:chizuru:4`（神社早就不在了）；裂口第二句 `mem:chizuru:2`（她來封的就是它）。不寫鈴（I-62 是第 5 片） | 自足 |
| `star-ember` 星屑火、`stolen-tome` 飛舞的魔法書、`burning-page` 燃燒的那一頁、`starfire-colossus` 星火巨像 | 雷鳴一般、中頭目、頭目 | 雷鳴 4、8、15 | 諾艾兒：偷來的書、燒記憶的那一頁（I-67） | 名字不寫「記憶」；牠吸的是 TP | 那一頁的第二句 `mem:noel:3`（燒的是記憶）；第三句 `mem:noel:4`（老師在保護她）。不寫商人（`mem:noel:5`） | 自足 |
| `ashen-treant` 枯灰樹人、`grey-elder` 灰化的老樹、`grey-blight` 灰枯 | 腐毒一般、中頭目、頭目 | 腐毒 4、8、10 | 希爾薇：她守的林子、樹皮上的箭頭、灰化（I-66） | 「樹人」「老樹」中性 | 樹人第二句 `mem:sylvie:1`（沼澤是她的林子）；老樹第二句 `mem:sylvie:5`（最後一顆種子）；灰枯第二句 `mem:sylvie:2`（霧是射不死的） | 自足 |
| `vault-mimic` 餓肚子的寶庫、`locked-vault` 鎖著的金庫 | 暗影一般、中頭目 | 暗影 4、8 | 莉茲：上鎖的寶庫、餓著肚子（§6 相遇） | 相遇已經演出 | 第二句 `mem:liz:3`（還債）。**永遠不寫道具店、露米亞、歐里克**（ledger §3 莉茲列） | 自足 |
| `debt-collector` 討債的影子 | 暗影一般 | 暗影 10 | 莉茲：家裡的債 | 中性 | 第二句 `mem:liz:2`。同上 | 自足 |
| `fallen-knight` 要塞的騎士殘影、`banner-bearer` 紅旗旗手、`gate-breaker` 撞門的巨影、`last-commander` 最後的指揮官 | 鋼鐵一般、中頭目、頭目 | 鋼鐵 4、8、15 | 絲嘉蕾：被吞下的要塞、紅旗、被撞的城門（I-77、I-78） | 相遇（鋼鐵 8）就是守城門；名字不寫公主、撤退 | 騎士第二句 `mem:scarlet:2`（要塞是她的國家）；撞門第二句 `mem:scarlet:3`；指揮官第二句 `mem:scarlet:5`。**任何地方都不寫「撤退」「號角是撤退的」**，直到 `mem:scarlet:5` | 自足 |

- 總計：故事怪物 **42 種**（一般 20、守關者 11、頭目 11），其餘 58 個定義是世界觀的迴響與部件。
- **不做**的連結（理由）：凜的師父（I-10 不出場）；鐘守（活著的 NPC）；洛恩的劍、燈鑰（`mem:hero:10`）；公主（I-78 不寫她之後怎麼了）；老師本人（`mem:noel:5` 的重逢屬於鎮上）。
- 機械檢查（`data/bestiary.test.ts`）：
  - 名字掃描：100 個名字與 39 件獨特裝備的名字、39 個戰利品名字都不含 ledger §3 的檢查詞（`靜鐘會`、`守燈人`、`燈鑰`、`代號`、`信物`、`刺客`、`派來殺`、`派去殺`、`去殺`），也不含 `艾斯特拉`、`燈喰之母`（`lantern-mother` 本身除外）、`撤退`、`歐里克`、`道具店`；
  - 圖鑑每句含上述詞的，必須有對應的 `loreAfter`（例：含 `靜鐘會` → `act3` 以後；含 `守燈人` → `act4` 以後，且指向洛恩的句子要 `mem:hero:9`）。
  - 這份清單抄自 ledger §3；ledger 改了，這個測試要跟著改（`story.test.ts` 屬於 6c，不改它）。

---

## 5. 名冊

### 5.1 數值形狀（方法決定；數字是提案）
- 新的一般怪物與中頭目一律 `floor: 3`（家鄉 Lv10），由既有 `growth()` 放大；頭目 `boss: true`（家鄉 `BOSS_HOME = 12`），以燈喰之獸 `s(1200,36,20,30,20,12)`、exp 300 為基準。不需要新曲線。
- 原型（Lv10 家鄉；對照舊 golem `s(280,65,24,10,10,5)` exp 40、shade `s(180,30,10,70,20,15)` exp 42）：

| 原型 | 典型成組 | 基準 s(hp,atk,def,mag,res,spd) | exp / gold |
|---|---|---|---|
| 群 | 3 隻 | s(110,32,6,24,10,18) | 15 / 11 |
| 標準 | 2 隻 | s(200,48,13,24,13,13) | 28 / 21 |
| 重 | 1–2 隻 | s(310,58,25,14,14,6) | 42 / 31 |
| 術 | 1–2 隻 | s(170,24,10,62,22,13) | 38 / 29 |
| 輔 | 搭配 | s(165,22,12,44,22,12) | 28 / 21 |
| 寶 | 單獨 | s(90,18,60,18,60,30) | 90 / 150 |
| 中頭目 | 單獨或＋1 | 精英化的標準或重（hp ×2.2、atk ×1.3，同 `ELITE`），exp ×3 | — |

- 每隻在原型 ±15% 內調形狀；機制強的扣 hp 或攻擊付費。表中「形狀」欄只寫和原型的差別。
- 每張本道表：抗物理物種 ≤ 25%；任一屬性被抗的物種 ≤ 1/3；沒有弱點的物種 ≤ 20%（`no element wall`）。地區原生的弱點與抗性寫成該地區的（`scaleEnemy` 本來就會蓋掉），表中寫「區」。

### 5.2 欄位說明
- **特性**：打起來的差別；機制代號見 §6。
- **招牌素材**：該物種專屬的新素材（`kind: 'monster'`，§7.1），一般怪物 0.35–0.5。
- **稀有**：既有稀有素材（`star-tear`、`king-scale`、`ancient-gear`）的小機率，只放在合理的物種上。
- **銘文**：牠掉的裝備有機會帶的專屬詞綴鍵（§7.2）。

### 5.3 本道一般怪物（29）
| id | 名稱 | 帶 | 原型／形狀 | 弱／抗 | 特性（機制） | 招牌素材 | 稀有 | 銘文 |
|---|---|---|---|---|---|---|---|---|
| `paper-moth` | 遺信紙蛾 | B | 群，spd+ | 火／— | 「撲粉」row 睡眠 0.25：三隻一起來，教全體技的價值（D） | `faded-letter` 褪色信紙 | `star-tear` 0.5% | `sleepRes` |
| `lamp-wight` | 提燈幽影 | B | 輔 | 冰／火 | 「借光」補血量最低的同伴：不先打牠，隊友一直回血（D） | `wight-wick` 幽影燈芯 | — | `heal` |
| `root-hound` | 霧根獵犬 | B | 標準，atk+ | 火／— | 「伏低」蓄力，下回合「撲咬」230（M1） | `mist-root` 霧根 | — | `atk` |
| `tin-soldier` | 錫兵殘影 | B | 重，def+ | 雷／冰 | 「列隊」守護 2 回合（M2） | `tin-key` 發條鑰匙 | `ancient-gear` 1% | `armor` |
| `dust-mimic` | 塵封木箱 | B | 標準 | 火／— | 偽裝：開戰時名牌顯示「寶箱？」，第一回合必定先手且 atk +50%；被打中一次就現形（M14） | `mimic-hinge` 木箱鉸鍊 | `old-coin` 10% | `goldFind` |
| `market-ghost` | 市集的吆喝聲 | B | 輔，spd+ | 雷／— | 「順手牽羊」命中時從這趟的背包偷金幣（每次上限 depth×5），打倒就全部還回；逃走前沒打倒就拿不回來（M13） | `market-token` 市集籌碼 | `old-coin` 15% | `matFind` |
| `tongueless-bell` | 無舌鐘 | C | 術，spd− | 冰／雷 | 「無聲的鐘鳴」row 遺忘 1 回合（M9） | `bell-shard` 啞鐘碎片 | — | `tpCost` |
| `hollow-hunter` | 空殼獵人 | C | 標準 | 雷／— | 「借來的招式」：用我方上一招的屬性打回施放者（M6） | `hollow-buckle` 空殼的皮扣 | `king-scale` 0.5% | `critDmg` |
| `mist-twin` | 霧雙子 | C | 群 | 火／冰 | 一定成對；一隻倒下時另一隻 atk +40%（M10） | `twin-thread` 雙生線 | — | `multi` |
| `moon-crow` | 映月鴉 | C | 標準，spd+ | 輪替 | 弱點每回合輪替，四種屬性都會輪到（M5） | `mirror-feather` 鏡羽 | `star-tear` 1% | `crit` |
| `bell-watcher` | 鐘樓巡守（故事） | C | 標準 | 冰／— | 「宣告」標記一名隊員，下回合同伴集中攻擊他；防禦或嘲諷可以化解（M24） | `grey-cord` 灰繩結 | — | `evasion` |
| `sleepwalker` | 夢遊者 | C | 重，atk+ | 火／雷 | 開戰時睡著；被打或第 3 回合醒來，醒來 atk +50% 3 回合。先處理別隻，別吵醒牠（M14） | `dream-sand` 夢砂 | — | `hp` |
| `old-city-sentinel` | 古城衛像（故事） | D | 重 | 雷／物 | 守護＋蓄力「審判之光」column 火（M1、M2） | `marble-shard` 白石碎片 | `ancient-gear` 2% | `def` |
| `requiem-choir` | 鎮魂歌隊（故事） | D | 輔 | 物／冰 | 全體補血；召喚提燈幽影（每場 1 次）（M4） | `hymn-sheet` 無字歌譜 | — | `tpRegen` |
| `lantern-larva` | 燈喰幼體（故事） | D | 標準 | 冰／火 | 「啃光」吸血 50%＋自己 atk +30%：拖越久越難打（M11） | `larva-glow` 幼體光囊 | — | `vuln` |
| `epitaph-golem` | 碑文守 | D | 重，spd−− | 火／雷 | 「抹消之文」row def −30%；很慢（D） | `epitaph-stone` 碑文石 | — | `res` |
| `ancestor-automaton` | 古代機兵（故事） | D | 重 | 雷／冰 | 每回合結束修復 12% HP；那回合被雷打中就短路不修（M21） | `old-cog` 古機齒輪 | `ancient-gear` 4% | `meleeDR` |
| `ash-archivist` | 灰燼書記 | D | 術 | 冰／— | 「抹去」清掉一名隊員的所有增益，加到自己身上（M15） | `ash-ink` 灰墨 | — | `mag` |
| `wick-shade` | 燭芯之影 | E | 群 | 冰／火 | 倒下時 enemies 火 40：三隻同時倒會連爆，分開收（M10） | `spent-wick` 燃盡的燭芯 | — | `fireRes` |
| `keeper-echo` | 無名的提燈人（故事） | E | 術 | 物／— | 借來的招式＋蓄力「燈火之誓」enemies 火 120（M1、M6） | `lantern-ash` 提燈的灰 | `star-tear` 3% | `gauge` |
| `ember-maw` | 餘燼之口 | E | 重 | 雷／冰 | 「吞吐」row 火；召喚燭芯之影（每場 2 次）（M4） | `ember-tooth` 餘燼之牙 | — | `fireDmg` |
| `sorrow-crystal` | 悲傷結晶 | E | 標準 | 物／適應 | 第一個打中牠的屬性，變成牠 3 回合的抗性；換屬性打（M16） | `sorrow-shard` 悲傷結晶片 | `star-tear` 2% | `iceRes` |
| `deep-tendril` | 燈底之鬚（故事） | E | 標準 | 火／冰 | 「汲取」命中時吸走 TP 15（M17）；名牌顯示吸走的量 | `pale-tendril` 蒼白觸鬚 | — | `tp` |
| `music-box` | 走音的音樂盒 | F | 輔 | 物／雷 | 「演奏」蓄力兩回合：期間同伴每回合回 10%，結束時我方 row 睡眠；受傷就中斷（M1 變體） | `music-comb` 音梳 | — | `wil` |
| `paper-cranes` | 千紙鶴群 | F | 群 | 火／— | 「重摺」：第一隻倒下的同伴會被摺回來（全場一次，30% HP）（M22） | `crane-paper` 紙鶴紙 | — | `agi` |
| `lost-shadow` | 走失的影子 | F | 標準 | 物／— | 開戰時複製我方攻擊最高者的 atk、mag 的 60%（M18） | `shadow-thread` 影線 | — | `str` |
| `returning-light` | 歸途之光 | F | 輔，hp− | —／— | 不攻擊，只替同伴加 def +30%；倒下時我方全體回 10% HP。打牠是好事（D＋M10） | `homeward-glow` 歸途微光 | `star-tear` 3% | `expBonus` |
| `hoarder` | 拾憶鼠 | B–D | 寶 | —／— | 第 3 回合結束逃走，逃走就什麼都不給（M3） | `glitter-scrap` 閃光碎屑 | `star-tear` 25% | `matFind` |
| `gilded-hoarder` | 金箔拾憶鼠 | E–F | 寶 | —／— | 第 2 回合結束逃走；每挨一下閃避 +10%（M3） | `gilded-scrap` 金箔碎屑 | `king-scale` 20% | `goldFind` |

### 5.4 地區一般怪物（30，第 4 層起）
| 地區 | id | 名稱 | 原型 | 特性（機制） | 招牌素材 | 稀有 | 銘文 |
|---|---|---|---|---|---|---|---|
| 熾焰 | `cinder-imp` | 灰燼小鬼 | 群 | 倒下時 row 火 35（M10） | `cinder-dust` 灰燼塵 | — | `fireDmg` |
| | `forge-hound` | 熔爐犬 | 標準 | 蓄力「熔吼」row 火 150（M1） | `forge-slag` 爐渣 | — | `atk` |
| | `ash-mourner` | 灰衣弔者 | 輔 | 同伴 mag +30%；補血（D） | `mourning-veil` 弔者面紗 | — | `heal` |
| | `mirage-dancer` | 蜃樓舞者（故事） | 標準 | 開戰召出 1 個 1 HP 的幻影（無報酬）；幻影在時本體閃避 +20%（M19） | `mirage-sequin` 蜃樓亮片 | `king-scale` 1% | `evasion` |
| | `sand-scorpion` | 沙海蠍（故事） | 標準 | 毒針；對已中毒的目標傷害 ×1.5（`wounded` 的變體 `vsPoisoned`）（M25） | `scorpion-stinger` 蠍尾針 | — | `poisonRes` |
| 霜凍 | `frost-doll` | 霜人偶 | 重 | 守護（M2） | `porcelain-chip` 瓷片 | — | `iceRes` |
| | `glacier-tortoise` | 冰河龜 | 重 | 自身 def +50%；蓄力「冰河崩落」（M1） | `glacier-scute` 冰河甲片 | — | `def` |
| | `snow-caller` | 雪中呼喚 | 術 | cross 睡眠；column 冰（D） | `snow-voice` 回音雪石 | — | `sleepRes` |
| | `ice-komainu` | 冰狛犬（故事） | 重 | 成對；兩隻都活著時傷害平分（M20） | `komainu-fang` 狛犬牙 | — | `block` |
| | `frozen-pilgrim` | 凍結的參拜者（故事） | 標準 | 冰封：開戰 def、res ×2.5 且不行動；被火打中或第 3 回合解凍（M23） | `prayer-rope` 結冰的注連繩 | `old-coin` 10% | `res` |
| 雷鳴 | `thunder-kite` | 雷鳶 | 群 | 「迅雷爪」3 段（D） | `kite-plume` 雷鳶羽 | — | `spd` |
| | `storm-totem` | 避雷石柱 | 輔 | 同伴 spd +30%、atk +20%；本身幾乎不打人（D） | `copper-band` 銅箍 | — | `thunderRes` |
| | `charge-jelly` | 蓄電水母 | 術 | 蓄力「放電」enemies 雷（M1） | `jelly-cell` 水母電囊 | — | `thunderDmg` |
| | `star-ember` | 星屑火（故事） | 術 | 命中時吸走 TP 15（M17） | `blue-ember` 藍白餘火 | `star-tear` 1% | `tpRegen` |
| | `stolen-tome` | 飛舞的魔法書（故事） | 術 | 依序施放火→冰→雷，名牌預告下一招的屬性（M5 變體） | `torn-page` 撕下的書頁 | — | `mag` |
| 腐毒 | `bog-mother` | 泥沼母體 | 重 | 召喚苔蘚史萊姆（每場 2 次）（M4） | `bog-peat` 沼泥炭 | — | `hp` |
| | `rot-lily` | 腐百合 | 輔 | cross 毒；row res −30%（D） | `rot-petal` 腐花瓣 | — | `poisonRes` |
| | `leech-knight` | 蛭甲騎士 | 標準 | 吸血 50%（M11） | `leech-plate` 蛭甲片 | — | `armor` |
| | `ashen-treant` | 枯灰樹人（故事） | 重 | 每回合再生 10%；「纏根」row spd −40%（M21） | `carved-bark` 刻痕樹皮 | — | `wil` |
| | `spore-moth` | 孢子蛾 | 群 | 倒下時 cross 毒（M10） | `spore-sac` 孢子囊 | — | `tp` |
| 暗影 | `mirror-thief` | 鏡中竊影 | 標準 | 借來的招式（M6） | `mirror-sliver` 鏡片 | — | `crit` |
| | `veil-stalker` | 帷幕潛行者 | 標準 | 「背刺」打後排、必暴（D） | `black-veil` 黑紗 | — | `critDmg` |
| | `hush-acolyte` | 靜默侍者（故事） | 術 | cross 遺忘（M9） | `hush-bell` 無聲小鈴 | — | `tpCost` |
| | `vault-mimic` | 餓肚子的寶庫（故事） | 重 | 偽裝＋偷金幣（M14、M13） | `vault-lock` 寶庫的鎖 | `old-coin` 20% | `goldFind` |
| | `debt-collector` | 討債的影子（故事） | 標準 | 宣告標記＋偷金幣（M24、M13） | `iou-slip` 泛黃的借條 | — | `vuln` |
| 鋼鐵 | `rivet-golem` | 鉚釘機兵 | 重 | 守護（M2） | `rivet` 鉚釘 | `ancient-gear` 2% | `armor` |
| | `siege-crab` | 攻城蟹 | 重 | 蓄力「破城鉗」row 170（M1） | `crab-plate` 蟹甲 | — | `meleeDR` |
| | `herald-engine` | 號令機 | 輔 | 同伴 atk +25%、def +20%（D） | `herald-horn` 號令喇叭 | — | `gauge` |
| | `fallen-knight` | 要塞的騎士殘影（故事） | 重 | 守護；同伴倒下時自己 def +30%（M2、M10） | `knight-crest` 騎士團紋章 | `king-scale` 1% | `block` |
| | `banner-bearer` | 紅旗旗手（故事） | 輔 | 活著時同伴 atk +20%；先打掉旗手（D 光環，M26） | `red-pennant` 紅旗布 | — | `str` |

### 5.5 中頭目「守關者」（11）
守關者用精英化的數值（§5.1）。招牌掉落是**戰利品**（`kind: 'trophy'`，必掉 1 個）＋專屬獨特裝備（§7.3）。

| id | 名稱 | 位置 | 特性 | 戰利品 | 專屬獨特（欄位、固定詞綴） |
|---|---|---|---|---|---|
| `false-moon` | 不存在的月亮（瑟蕾） | 本道 8、33 | 每 2 回合在滿月與新月之間切換：滿月替同伴補血加防，新月 enemies 冰（M8 變體：依回合切換） | `moon-silver` 月影銀 | `moonless-mirror` 無月之鏡（副手：`res`、`heal`、`int`） |
| `bell-warden` | 鐘樓的守門人（凜／靜鐘會） | 本道 13、38 | 宣告標記＋row 遺忘；≤ 50% 鐘聲加速（M24、M9、M8） | `tower-dust` 鐘樓的灰 | `unrung-clapper` 不響的鐘舌（頸：`sleepRes`、`tpCost`、`wil`） |
| `toppled-automaton` | 倒下的機兵（波比） | 本道 18、43 | 修復＋倒下後重新啟動一次（30% HP）（M21、M22） | `automaton-core` 機兵核心 | `ancestor-gauntlet` 祖傳的手甲（手：`armor`、`atk`、`int`） |
| `requiem-conductor` | 鎮魂指揮者（古城） | 本道 23、48 | 召喚鎮魂歌隊；「指揮」同伴 spd +40%（M4） | `dusk-baton` 暮色指揮棒 | `requiem-staff` 鎮魂之杖（武器・杖：`mag`、`heal`、`wil`） |
| `lantern-brood` | 燈底之巢（子嗣） | 本道 28、53 | 本身不攻擊；每回合孵一隻燈喰幼體（場上上限內）。先打巢還是先清幼體（M4） | `brood-shell` 巢殼 | `brood-lantern` 巢燈（頸：`hp`、`res`、`gauge`） |
| `mirage-lead` | 蜃樓的領舞者（莎菲拉） | 熾焰 8、13、18… | 召出 2 個幻影舞者；每 3 回合「轉拍」同伴 spd +30%（M19） | `copper-anklet` 銅腳環 | `last-dance-veil` 最後一支舞的紗（身：`agi`、`gauge`、`res`） |
| `ice-shrine` | 冰中的拜殿（千鶴） | 霜凍 | 不移動；召喚冰狛犬；狛犬在時本體受護盾（M4、M7） | `shrine-rope` 拜殿的繩 | `ninety-nine-steps` 九十九級石階（腳：`def`、`wil`、`iceRes`） |
| `burning-page` | 燃燒的那一頁（諾艾兒） | 雷鳴 | 吸 TP＋遺忘；倒下時我方全體 TP +20（M17、M9、M10） | `ash-page` 燒剩的書角 | `starbound-tome` 星封之書（副手：`mag`、`int`、`tp`） |
| `grey-elder` | 灰化的老樹（希爾薇） | 腐毒 | 再生＋纏根；每 3 回合長出一隻孢子蛾（M21、M4） | `ashen-acorn` 灰橡實 | `arrowmark-bow` 刻痕長弓（武器・弓：`agi`、`crit`、`critDmg`） |
| `locked-vault` | 鎖著的金庫（莉茲） | 暗影 | 高防；偷金幣；打倒時偷走的兩倍奉還（M13） | `vault-coin` 寶庫金幣 | `hungry-purse` 空腹的錢袋（戒：`goldFind`、`matFind`、`agi`） |
| `gate-breaker` | 撞門的巨影（絲嘉蕾） | 鋼鐵 | 蓄力「撞門」enemies phys；召喚爬牆的騎士殘影（M1、M4） | `gate-splinter` 城門的木片 | `gatewarden-shield` 守門者之盾（副手：`block`、`def`、`hp`） |

### 5.6 頭目（28）與部件（2）
`bossFor(region, depth)`（`data/roster.ts`）：
- 本道第 3 層：`lanterneater`（不變）；本道第 30 層第一次：終幕（`FINALE_BOSS`，§12.3 的 Task）。
- 本道其他 5 的倍數：第 5、10…50 層依表；第 55 層以後 `(depth/5 − 1) % 10` 循環。
- 地區：`(depth/5 − 1) % 3` 依序打該地區的 3 隻。
- 頭目尚未上線時，該處回到 `lanterneater`，和現在一模一樣。
- 回傳一個組（`string[]`），多部位回傳 `['old-city-archon', 'archon-hand', 'archon-hand']`。

| id | 名稱 | 位置 | 形狀（對照燈喰之獸） | 弱／抗 | 特性 | 戰利品 | 專屬獨特 |
|---|---|---|---|---|---|---|---|
| `fog-warden` | 霧門守衛 | 本道 5 | hp −5% | 火／冰 | 蓄力「霧門落下」；row def −25%。第一隻新頭目，教玩家看意圖防禦（M1） | `fog-gate-plate` 霧門鎧片 | `fog-halberd` 霧門長戟（武器・槍：`atk`、`str`、`eliteDmg`） |
| `silent-bell` | 啞鐘 | 本道 10 | hp +5%、spd− | 冰／雷 | row 遺忘；≤ 50% 進第二階段（M9、M8） | `silent-bronze` 啞鐘青銅 | `silent-chime` 無聲鐘墜（頸：`sleepRes`、`tpCost`、`res`） |
| `hollow-champion` | 空殼勇者 | 本道 15 | atk+ | 雷／— | 借來的招式；≤ 40%「一百種劍法」3 段（M6、M8） | `hundred-hilts` 百劍之柄 | `borrowed-blade` 借來的劍（武器・劍：`multi`、`critDmg`、`str`） |
| `old-city-archon` | 古城執政像 | 本道 20 | 本體 hp 800＋手 ×2（260） | 本體 雷／火；手 火／— | 手在時本體受傷 ×0.5；手「壓制」row（M7） | `archon-gold` 執政金冠片 | `archon-crown` 古城之冠（頭：`res`、`tpCost`、`int`） |
| `gorged-beast` | 飽食之獸 | 本道 25 | hp +8% | 冰／火 | 召喚燭芯之影；「啃食」吸血 40%（M4、M11） | `gorged-lantern` 被吞的提燈 | `glutton-gauntlet` 飽食手甲（手：`atk`、`crit`、`def`） |
| `lantern-mother` | 燈喰之母 | 本道 30 | **與 `lanterneater` 完全相同的數值與技能** | 冰／火 | 只換外觀（controller 裁定） | `mother-light` 母燈殘光 | `cradled-light` 搖籃之光（頸：`heal`、`wil`、`gauge`） |
| `forgotten-festival` | 被遺忘的祭典 | 本道 35 | — | 冰／— | 每回合點起一盞燈籠（召喚，上限 3）；燈籠全亮時「祭典之火」enemies（M4、M8） | `festival-paper` 祭典燈籠紙 | `festival-mask` 祭典面具（頭：`goldFind`、`evasion`、`agi`） |
| `starless-whale` | 無星之鯨 | 本道 40 | hp +15%、spd−− | 雷／冰 | 每 3 回合「吞沒」enemies；吸血（M1、M11） | `starless-ambergris` 無星龍涎 | `whale-song-ring` 鯨歌指環（戒：`tp`、`tpRegen`、`mag`） |
| `stopped-clock` | 停擺的鐘心 | 本道 45 | — | 物／雷 | 「停針」每回合讓一名隊員跳過下一回合（不可連續對同一人）（M27） | `clock-spring` 鐘心發條 | `still-hand-boots` 停針之靴（腳：`spd`、`evasion`、`agi`） |
| `first-lantern` | 最初的燈 | 本道 50 | hp +10% | 輪替 | 三階段，每階段換弱點與全體技的屬性（M8、M5） | `first-flame` 最初的火種 | `first-lantern-staff` 最初的燈杖（武器・杖：`mag`、`fireDmg`、`int`） |
| `ember-tyrant` | 焚城之焰 | 熾焰 | — | 區 | ≤ 50%「焚城」enemies 火（M8） | `tyrant-cinder` 暴君餘燼 | `burning-crown-ring` 焚冠之戒（戒：`fireDmg`、`atk`、`crit`） |
| `sandstorm-maw` | 沙暴之口（故事） | 熾焰 | spd+ | 區 | 每 2 回合「沙暴」enemies＋我方 spd −20%（D 增益輪替） | `storm-glass` 沙暴琉璃 | `sand-veil-boots` 沙幕之靴（腳：`evasion`、`fireRes`、`agi`） |
| `mirage-city` | 蜃樓之城（故事） | 熾焰 | 本體 hp −20% | 區 | 召喚 2 個蜃樓舞者；舞者在時本體受護盾（M4、M7） | `mirage-brick` 蜃樓磚 | `troupe-drum` 舞團的鼓（副手：`tp`、`heal`、`agi`） |
| `rime-sovereign` | 永凍之守 | 霜凍 | 本體 820＋冰柱 ×2（240） | 區 | 冰柱在時本體受傷 ×0.5；冰柱補血加防（M7） | `rime-crown-shard` 永凍冠片 | `everwinter-veil` 永冬之紗（身：`iceRes`、`res`、`hp`） |
| `white-silence` | 白色寂靜 | 霜凍 | — | 區 | 每回合我方 spd −10%（可疊 3 次）；cross 遺忘（D、M9） | `silence-snow` 寂靜之雪 | `snowmute-ring` 無聲雪戒（戒：`tp`、`iceDmg`、`int`） |
| `rift-maw` | 迷宮的裂口（故事） | 霜凍 | — | 區 | 召喚霜凍原生物種；≤ 50% 裂口張大，全體技更頻繁（M4、M8） | `rift-ice` 裂口之冰 | `sealing-spear` 封印之槍（武器・槍：`atk`、`iceDmg`、`wil`） |
| `thunder-roc` | 雷鳴巨鵬 | 雷鳴 | spd++ | 區 | 蓄力「天雷俯衝」；「雙爪」2 段（M1） | `roc-plume` 巨鵬羽 | `roc-feather-boots` 鵬羽之靴（腳：`spd`、`thunderRes`、`agi`） |
| `storm-conductor` | 雷霆指揮者 | 雷鳴 | — | 區 | 宣告標記＋cross 連鎖雷（M24） | `conductor-rod` 導雷桿 | `conductor-ring` 指揮者之戒（戒：`thunderDmg`、`crit`、`mag`） |
| `starfire-colossus` | 星火巨像（故事） | 雷鳴 | — | 區 | 吸 TP＋「星火」enemies 火（M17） | `starfire-core` 星火核 | `starfire-tiara` 星火頭冠（頭：`int`、`tp`、`tpCost`） |
| `mire-hydra` | 腐沼多頭蛇 | 腐毒 | hp +12% | 區 | 66%、33% 各長出一個頭（新技能）；cross 毒（M8） | `hydra-scale` 多頭蛇鱗 | `hydra-fang` 蛇牙短刃（武器・短刃：`crit`、`vuln`、`agi`） |
| `grey-blight` | 灰枯（故事） | 腐毒 | — | 區 | 召喚孢子莢；孢子莢在時本體受護盾、莢破裂時 cross 毒（M4、M7、M10） | `blight-ash` 灰枯之塵 | `greenward-cloak` 護林斗篷（身：`hp`、`wil`、`res`） |
| `bog-leviathan` | 沼底巨口 | 腐毒 | hp +10% | 區 | 「吞入」把一名隊員關 1 回合（期間中毒、不能行動）；對牠造成 15% 最大 HP 的傷害就吐出（M28） | `leviathan-tooth` 巨口之牙 | `bog-ring` 沼底指環（戒：`tp`、`wil`、`tpRegen`） |
| `faceless-host` | 無面之主 | 暗影 | — | 區 | 借來的招式；召喚鏡中竊影（M6、M4） | `blank-mirror` 無面之鏡 | `faceless-mask` 無面面具（頭：`evasion`、`int`、`res`） |
| `vault-dragon` | 金庫之龍 | 暗影 | hp +10% | 區 | 偷金幣；「金幣吐息」row，偷得越多越痛；打倒奉還（M13） | `dragon-gold` 龍藏金 | `gilded-mail` 鍍金之鎧（身：`armor`、`hp`、`def`） |
| `shadow-parade` | 影之行列 | 暗影 | — | 區 | 每回合行列多一個影子（召喚），影子越多本體越強（M4、M26） | `parade-lantern` 行列的燈 | `parade-boots` 夜行之靴（腳：`agi`、`evasion`、`spd`） |
| `fortress-colossus` | 要塞巨像 | 鋼鐵 | — | 區 | 召喚鉚釘機兵；蓄力「攻城砲」（M4、M1） | `colossus-bolt` 巨像螺栓 | `colossus-gauntlet` 巨像手甲（手：`armor`、`def`、`str`） |
| `siege-titan` | 攻城巨獸（故事） | 鋼鐵 | atk+ | 區 | 「破甲」row def −30%＋蓄力重擊（M1） | `titan-hide` 巨獸皮 | `wallclimber-boots` 攀牆之靴（腳：`def`、`spd`、`str`） |
| `last-commander` | 最後的指揮官（故事） | 鋼鐵 | — | 區 | 守護同伴；吹號角 allies def +30%（不寫撤退）（M2） | `commander-medal` 指揮官的勳章 | `red-horn` 紅色號角（頸：`gauge`、`hp`、`wil`） |
| `archon-hand` | 執政像之手（部件） | — | 260 | 火／— | 「壓制」row | — | — |
| `rime-pillar` | 冰柱（部件） | — | 240 | 區 | 補血、加防 | — | — |

- 專屬獨特的固定詞綴都已對照 `AFFIXES` 的欄位字母（W/O/H/B/G/F/N/R）挑過；`data/roster.test.ts` 的 `every unique's fixed keys are legal for its slot` 仍要擋住之後的修改。
- 頭目的 exp、gold、記憶碎片、頭目裝備兩件，全部照燈喰之獸（`battleGear`、`pieceDrops` 看 `b.boss`，不看 id）。部件 exp 30、gold 0、無掉落、不進表。

### 5.7 精英詞綴「飽食個體」（5 種，0 張圖）
- 第 4 層起，每個精英帶一個詞綴；第 1–3 層不變。
- `eliteAffix(run, depth) = AFFIX_IDS[mix(run.seed ^ AFFIX_SALT, depth) % 5]`，純雜湊，不抽串流。
- 名字：`★〔急躁〕深層・熾焰・荊棘狼`。

| id | 名稱 | 效果 | 付費 |
|---|---|---|---|
| `swift` | 急躁 | spd ×1.4 | hp ×0.85 |
| `thick` | 厚重 | hp ×1.35 | atk、mag ×0.85 |
| `echoing` | 回響 | 每次行動後追加一次 50% 的普攻 | atk、mag ×0.8 |
| `draining` | 吸憶 | 所有傷害吸血 30% | hp ×0.9 |
| `splitting` | 分裂 | 倒下時召喚同物種一隻（40% HP、非精英、無報酬） | hp ×0.8 |

### 5.8 舊怪物的深層特性（決定）
- 舊 8 種裡 `bat`、`beetle`、`golem` 沒有任何技能。決定：它們出現在**新表**（第 4 層起、該帶已上線）時，帶一個深層特性：
  - `bat`：偽裝的變體「伏擊」：第一回合必定先手（M14）；
  - `beetle`：守護（M2）；
  - `golem`：蓄力「重踏」row（M1）。
- 實作成 `scaleEnemy` 的 `DEEP_TRAITS`，只在 `encounterTable` 回傳新表時套用。第 1–3 層、以及新表未上線的深度不變，所以 §9.1 的位元相同保證仍成立。
- 懸賞（第 2 項）的接口：詞綴精英就是「吞了太多記憶的怪物」。`eliteAffix` 是純函式，懸賞板可以預先算出某次出發某層的詞綴。

---

## 6. 機制

### 6.1 原則
- 每個機制的**決定**（要不要召喚、換哪個弱點、何時逃走、標記誰、選哪個詞綴）都是確定性的，不抽 rng。
- 用 `EnemyDef`、`EnemySkill`、`Effect` 的可選欄位表示；舊定義沒有這些欄位，行為位元相同。
- 玩家看得到：每個機制都在意圖欄（`intentLabel`）、名牌或戰鬥紀錄上顯示。

### 6.2 引擎工作清單
| 代號 | 機制 | 資料形狀（提案） | 引擎要點 | 測試義務（先寫） |
|---|---|---|---|---|
| D | 現有效果 | 無 | 無 | 每個 D 技能只用 §1.4 的效果種類 |
| M1 | 蓄力 | `EnemySkill.charge?: string` | `Combatant.charging`；蓄力回合只記 `charge`，下一回合強制施放；睡眠、遺忘以外的狀態不影響；睡眠會打斷 | `lands the round after its wind-up`、`sleep breaks a charge`、`shows in intentLabel`、`draws nothing` |
| M2 | 守護 | `Effect { kind: 'guard'; turns }` | 我方單體行動（攻擊、技能、絕技）目標是另一隻敵人時，改打守護者；範圍技不受影響 | `takes single-target hits`、`area ignores a guard`、`ends after its turns` |
| M3 | 逃走 | `EnemyDef.fleeAfter` | 回合結束時設 `fled`；`checkOutcome` 算離場；`rewards`、`battleGear` 跳過 | `flees at the end of round N`、`a fled foe pays nothing and takes no loot draw` |
| M4 | 召喚 | `Effect { kind: 'summon'; id; max }` | 抽出 `meetEnemy()`（`createBattle` 單隻生成的位元相同重構）；達 `groupCap`（頭目戰 4）就失敗；被召喚的 `summoned`：無報酬、`battleGear` 跳過；本回合不行動；目標 id 必須已上線 | `meetEnemy matches createBattle`、`respects the cap`、`a summon pays nothing`、`acts from the next round`、`BattleView adds a sprite` |
| M5 | 弱點輪替 | `EnemyDef.prism?: 'cycle' \| 'phase'` | 每回合（或每階段）設 `weak`、`resist`；`scaleEnemy` 不套地區弱點 | `cycles through all four elements`、`a region does not override` |
| M6 | 借來的招式 | `Effect { kind: 'echo'; cap }` | `BattleState.lastPartyDamage`；用自己的數值、該屬性、`min(power, cap)` 打回施放者 | `returns the last element at most cap`、`without a record is an attack` |
| M7 | 多部位護盾 | `EnemyDef.shieldedBy`、`shieldPct` | 有活著的部件時傷害 × `shieldPct/100`（提案 50） | `half while a part stands`、`drops with the last part` |
| M8 | 階段 | `EnemyDef.phases` | 依 hp 比例（或回合，`false-moon`）換技能表；記住最低階段 | `switches under its threshold`、`never switches back after healing` |
| M9 | 遺忘（新狀態） | `inflict.status: 'forget'` | 1 回合；`skill` 改普攻；道具、絕技、防禦照常；`sleepRes` 抵抗；頭目減半；`cure` 解除 | `attacks instead of casting`、`items and ultimates still work`、`cure clears` |
| M10 | 倒下時 | `EnemyDef.onDeath` | `ko` 後立即結算一次 | `fires once`、`does not chain forever` |
| M11 | 吸血 | `damage.drain` | 傷害 × drain% 回到施放者 | `heals by its share`、`a miss heals nothing` |
| M12 | 精英詞綴 | `BattleScale.affix` | `scaleEnemy` 套數值；`echoing` 追加普攻 | `pure in seed and depth`、`d1–3 elites carry none` |
| M13 | 偷竊 | `Effect { kind: 'steal'; perDepth }` | 從 `run.loot.gold` 移到 `Combatant.stolen`；打倒時奉還（守關者 ×2）；逃走或戰鬥失敗就沒了；模擬沒有 `run`，不偷 | `returns on a kill`、`lost on a flee`、`never below zero`、`the sim steals nothing` |
| M14 | 偽裝、沉睡、伏擊 | `EnemyDef.opener?: 'disguise' \| 'asleep' \| 'ambush'` | 開場狀態；偽裝名牌顯示「寶箱？」直到第一次受傷；沉睡在受傷或第 3 回合醒；伏擊第一回合先手 | 每種一個成功、一個邊界測試 |
| M15 | 抹去增益 | `Effect { kind: 'dispel'; steal: true }` | 移除目標正值增益、加到自己身上（同 `MAX_BUFFS`） | `moves buffs`、`leaves debuffs` |
| M16 | 適應 | `EnemyDef.adapt` | 第一次受到的屬性加入 `resist` 3 回合；名牌顯示 | `adapts to the first element`、`expires` |
| M17 | 吸 TP | `damage.tpDrain` | 目標 TP 減少、名牌顯示 | `never below zero` |
| M18 | 模仿 | `EnemyDef.mimic: pct` | 開戰時把 atk、mag 設成我方最高值 × pct（再套成長以外的倍率） | `copies the strongest member`、`scales with party size` |
| M19 | 幻影 | `opener: 'decoy'` | 開戰召出 1 HP、無報酬的幻影；幻影在時本體 `evasion` +20 | `decoy pays nothing`、`evasion drops with it` |
| M20 | 傷害平分 | `EnemyDef.shareWith` | 成對的兩隻都活著時，受到的傷害各半 | `splits while both stand` |
| M21 | 再生、修復 | `EnemyDef.regen: { pct; stopBy? }` | 回合結束回復；`stopBy` 屬性在那回合打中就不回 | `stops on its element` |
| M22 | 重新站起 | `EnemyDef.revive: { pct; once }` | 第一次倒下時以 pct 復活（自己或同伴，`paper-cranes`） | `only once` |
| M23 | 冰封 | `opener: 'frozen'` | def、res ×2.5、不行動；火命中或第 3 回合解除 | `fire thaws`、`thaws by round 3` |
| M24 | 宣告標記 | `Effect { kind: 'mark' }` | 下回合所有同伴的單體目標改成被標記者；我方防禦或嘲諷可化解 | `focuses the marked member`、`taunt overrides` |
| M25 | 對中毒加傷 | `damage.vsPoisoned` | 同 `wounded` 的寫法 | `only against poisoned` |
| M26 | 光環 | `EnemyDef.aura` | 活著時同伴得到增益；倒下時移除 | `removed on death` |
| M27 | 停針 | `inflict.status: 'stop'` | 跳過下一回合（1 回合）；不能連兩回合對同一人；頭目戰才有 | `never twice in a row on one member` |
| M28 | 吞入 | `Effect { kind: 'swallow' }` | 目標離開陣型 1 回合；對施放者造成 15% 最大 HP 的傷害就提早吐出；全員被吞不會發生（最後一人不能被吞） | `released by damage`、`never swallows the last standing` |

### 6.3 為什麼這些不會讓某種隊伍變成必帶
| 機制 | 擔心 | 處理 |
|---|---|---|
| 守護、多部位、平分 | 沒有全體技打不動 | 只擋單體、有回合數；護盾 ×0.5 不是免疫；單體隊先拆部件即可 |
| 遺忘、停針、吞入 | 治療被封 | 都只有 1 回合；道具、絕技照常；遺忘頭目減半；停針不連續；最後一人不被吞 |
| 吸 TP | 處罰法系 | 每次 15、名牌看得到；道具可回 TP；第 22d 項把全魔法隊放進雷鳴 |
| 弱點輪替、適應 | 某屬性永遠打不到 | 輪替含物理；適應只擋第一個屬性 3 回合 |
| 冰封（火解凍） | 沒火就打不動 | 第 3 回合自己解凍 |
| 偷竊 | 金錢損失 | 打倒必還；只偷這趟背包的錢、上限每次 depth×5 |
| 逃走、寶物怪 | 沒爆發拿不到 | 純額外獎勵，經驗等價把牠算 0 |
| 地區抗性 | 全物理在鋼鐵、腐毒 | 既有行為，第 18b 項已在量 |

---

## 7. 掉落

### 7.1 招牌素材（59）與戰利品（39）
- **資料**：新檔 `data/materials.roster.ts`，合併進 `MATERIALS`。
  - 招牌素材 `kind: 'monster'`；
  - 頭目與守關者的戰利品 `kind: 'trophy'`（新的 `MaterialKind`）。
- **價格**（提案）：B 帶 20、C 30、D 40、E 50、F 60；地區原生依出現深度的帶；戰利品 120（守關者）／200（頭目）。
  - 舊素材 6–32 G、地區素材 25 G，所以深層的錢包跟著深度長。這會改變 `economy.test.ts` 的量測，上線時重跑，門檻不放寬。
- **掉落路徑**：
  - 招牌素材與既有稀有素材寫在 `EnemyDef.drops`，走既有的 `rewards()`；
  - 戰利品寫在 `EnemyDef.drops`，機率 1；
  - 地區素材照舊由 `scaleEnemy` 附加。
- **用途**（全部接既有系統，不另開經濟）：
  1. **賣錢**：既有的商店賣出。
  2. **鍛造屋・銘刻**（新的重洗變體，§7.2）：同種招牌素材 3 個＋`REROLL.gold(ilvl)`，把一件裝備的一條詞綴重洗成該物種的銘文鍵。和 `REGION_AFFIX_GROUP` 一樣是「用素材鎖定詞綴」，只是鎖定 1 個鍵。
  3. **鍛造屋・專屬裝備製作**（新的 `SET_RECIPE` 變體，§7.3）：戰利品 5＋`star-tear` 1＋`setGold(ilvl)`，做出該頭目或守關者的專屬獨特。要先打倒過那隻一次（`bossKills` 或新的 `wardenKills`），保證「刷不到也做得出來」。
  4. **消耗品**：不新增配方（避免回復資源的平衡變動）。
  5. **送禮**（§7.4）。

### 7.2 銘文（一般怪物的專屬詞綴）
- 每個一般物種有一個**銘文鍵**（§5.3、§5.4 的「銘文」欄），都是既有 `AFFIXES` 的鍵。沒有新詞綴、沒有新的詞綴池，`rollItem` 的抽取不變。
- **掉落**：新物種的那一次 `lootRng` 若 `rng() < GEAR_CHANCE.monster` 掉了裝備，再用 **`trophyRng`**（§7.5）抽 `INSCRIBE_CHANCE = 0.25`。中了就把該件一條詞綴**換成**銘文鍵（槽位不允許該鍵就不換）。
  - 數值在該件稀有度與 ilvl 的**同一個範圍**內，由 `trophyRng` 重擲；
  - 條數不變、範圍不變。
  - 結果：一件裝備的期望威力不變，只是「這件是紙蛾掉的、帶睡眠抗性」的身分。
- 顯示：裝備名稱後加「・紙蛾銘」，圖鑑記錄見過的銘文。
- `ItemInstance.inscription?: string`（物種 id，可選欄位；存檔驗證：必須是已知 id）。

### 7.3 專屬獨特（39）
- 每個頭目與守關者 1 件（§5.5、§5.6），`SpecialDef`：`rarity: 'unique'`、`source: 'boss'`（守關者 `'elite'`）、固定 3 條詞綴、`region` 依位置、`lore` 1 句（照 §4 的閘門寫：介紹在獲得時顯示，不得含揭露詞）。
- 威力預算＝既有獨特（同 `ROLL_FLOOR.unique`、同 3 條）。
- **掉落方式（不改總量）**：在新頭目／守關者的戰鬥裡，`rollBossGear` 或精英那一件照舊用 `lootRng` 跑完（抽取次數不變）。若結果是 `legendaryTier`，再用 `trophyRng` 抽 `OWN_UNIQUE_SHARE = 0.5`：中了就把那件換成該頭目的專屬獨特，數值由 `trophyRng` 重擲。
  - 特殊裝備的總出現率不變（第 10、11、14 項的期望不受影響）；
  - 被換掉的是角色傳說或地區特殊的一部分機率。
- **保底**：§7.1 的製作。
- **平衡**：新增 22h（§9.3）：全身換成 6 件專屬獨特（取最強的 6 件）＋其餘稀有，在第 10、20 層：頭目不在 2 回合內倒下（同第 14 項）、表的 hpLoss ≥ 10%（同第 18d 項的天花板）。
- 美術：照 5d 的 `gear-<id>` 做法；圖還沒發布時照 5d 規則只顯示文字（不借底材圖），但 §11.1 規定：頭目上線前它的專屬獨特圖必須已發布，所以玩家實際上不會看到只有文字的版本。

### 7.4 送禮（接 affinity spec §6）
- **決定**：新的 `monster` 招牌素材全部可送（`GIFTABLE` 用 `kind` 推導，而不是寫死 18 種；這一條要寫進 6d Task 1 的說明，§12.3）。戰利品（`trophy`）**只有 8 件夥伴故事的守關者戰利品可送**，其餘不可送（打頭目的成就感不該被拿去刷好感）。
- 口味原則：
  - 不新增任何「最愛」（不改變 affinity spec §6.3 的送禮速度：最愛 ×2 種 ×2 份 = 16 的節奏）；
  - 新素材預設「普通」；每位夥伴最多新增 3 種「喜歡」；
  - **夥伴自己故事的戰利品**：集滿記憶之前「婉拒」、集滿之後「喜歡」（照 §6.2 的痊癒規則：已收下的口味不變）。這是好感度系統原本就有的「傷口好了才收得下」，正好對上故事。

| 夥伴 | 新增「喜歡」（提案） | 自己故事的戰利品（集滿前婉拒 → 之後喜歡） |
|---|---|---|
| 凜 | `black-veil` 黑紗、`grey-cord` 灰繩結 | `tower-dust` 鐘樓的灰（集滿＝她立誓之後；婉拒句不得提靜鐘會） |
| 瑟蕾 | `mirror-feather` 鏡羽、`sorrow-shard` 悲傷結晶片 | `moon-silver` 月影銀 |
| 千鶴 | `prayer-rope` 結冰的注連繩、`komainu-fang` 狛犬牙 | `shrine-rope` 拜殿的繩 |
| 莎菲拉 | `mirage-sequin` 蜃樓亮片、`market-token` 市集籌碼 | `copper-anklet` 銅腳環 |
| 希爾薇 | `carved-bark` 刻痕樹皮、`kite-plume` 雷鳶羽 | `ashen-acorn` 灰橡實 |
| 諾艾兒 | `jelly-cell` 水母電囊、`blue-ember` 藍白餘火（集滿前「普通」，之後「喜歡」，避免碰星火） | `ash-page` 燒剩的書角 |
| 波比 | `old-cog` 古機齒輪、`rivet` 鉚釘、`tin-key` 發條鑰匙 | `automaton-core` 機兵核心 |
| 莉茲 | `gilded-scrap` 金箔碎屑、`vault-lock` 寶庫的鎖 | `vault-coin` 寶庫金幣 |
| 絲嘉蕾 | `knight-crest` 騎士團紋章、`marble-shard` 白石碎片 | `gate-splinter` 城門的木片 |

- 需要的文字：每位夥伴 1 句婉拒＋1 句痊癒（共 18 句），屬於 6e 的 `BOND_TEXT.gift[cid]`。在 6e 寫好之前，這 8 件戰利品先標成「不可送」（`GIFT_TASTE` 不列它們），6e 完成時才打開。
- 機械檢查：`GIFT_TASTE` 的每個鍵都在 `GIFTABLE` 裡；新素材不得出現在任何人的 `loved`。

### 7.5 決定論與串流（決定）
| 抽取 | 串流 | 對既有串流的影響 |
|---|---|---|
| 遇敵組 | `game.rng`，`pick` 一次 | 次數不變（表變長不多抽） |
| 精英組 | `eliteGroup` 自己的鹽 | 不變；挑到寶物怪組就取下一組（索引 +1，不多抽） |
| 精英詞綴 | 純雜湊 `mix(run.seed ^ AFFIX_SALT, depth)` | 無 |
| 守關者位置 | `mulberry32(floorSeed ^ WARDEN_SALT)`，在 `floorOf` 裡**排在微光之後**呼叫 `placeSpecial` | 地圖其他內容（`fillRooms`、救援、微光）一格都不動（同 `RESCUE_SALT`、`GLIMMER_SALT` 的做法） |
| 頭目選擇 | `bossFor` 查表 | 無 |
| 戰鬥中新機制的決定 | 不抽 | 無 |
| 戰鬥中命中、暴擊、狀態 | 既有的戰鬥 rng（遊戲中是 `game.rng`） | 只有**新怪物參戰**的戰鬥抽取序列不同（和任何新內容一樣）；舊組的戰鬥位元相同（§9.1 fixture） |
| 招牌素材、稀有素材、戰利品 | `rewards()` 的 `game.rng`（既有的素材掉落契約） | 同上：只在新怪物的戰鬥裡多出牠自己那幾條 |
| 裝備是否掉落、底材、稀有度 | `lootRng`，每隻一次（既有契約） | 新怪物每隻照舊用一次，和舊怪物一樣；召喚與逃走的不用 |
| 銘文、專屬獨特的替換與重擲 | **新的加鹽串流** `trophyRng(run) = mulberry32(mix(run.seed ^ TROPHY_SALT, run.trophyDraws++))`；`Run.trophyDraws` 新欄位（`Run` 不存檔） | `lootRng` 的實例內抽取次數**完全不變**（替換在 `lootRng` 用完之後才做），所以精英的稀有素材、頭目第二件都和沒有替換時相同 |
| 鍛造屋的銘刻、製作 | 既有 `forgeRng`（玩家主動操作才抽） | 只在玩家選這些新操作時抽 |
| 偷竊 | 不抽 | 無 |

- 新的鹽：`AFFIX_SALT`、`WARDEN_SALT`、`TROPHY_SALT`，測試檢查它們和 `MEMORY_SALT`、`FORGE_SALT`、`RESCUE_SALT`、`GLIMMER_SALT`、`0xe11e`、`0x3c6ef372`、`0x27d4eb2f` 都不同。
- 不用 `Math.random`（掃新檔）。

---

## 8. 遇敵組成

### 8.1 表的資料（`data/roster.ts`）
- `MAINLINE_TABLES: Record<'B'|'C'|'D'|'E'|'F', string[][]>`、`NATIVE_GROUPS: Record<地區, string[][]>`。
- `encounterTable(region, depth)`（舊實作保留為 `legacyTable`）：
  1. `depth ≤ 3` → `legacyTable`。
  2. 本道：`live = MAINLINE_TABLES[band].filter(allLive)`；地區：`live = [...NATIVE_GROUPS[region], ...MAINLINE_TABLES[band].slice(0, 6)].filter(allLive)`。
  3. `live` 沒有含新 id 的組 → `legacyTable`（位元相同）。
  4. `live.length < 6` → `[...legacyTable, ...live 的新組]`（過渡）。
  5. 否則 → `live`。
- 每組 1–3 隻；本道表 12 組；地區表 12 組（原生 6＋本道 6）。

### 8.2 本道表（提案；舊 id 永遠算上線）
| 帶 | 組 |
|---|---|
| B | `paper-moth×3`；`root-hound+wolf`；`tin-soldier+lamp-wight`；`lamp-wight+root-hound`；`dust-mimic`；`market-ghost+paper-moth×2`；`root-hound×2`；`wisp+market-ghost`；`tin-soldier+beetle`；`golem+lamp-wight`；`dust-mimic+shade`；`hoarder` |
| C | `tongueless-bell+hollow-hunter`；`mist-twin×2`；`moon-crow×2`；`bell-watcher×2`；`sleepwalker+bell-watcher`；`hollow-hunter+lamp-wight`；`tongueless-bell+tin-soldier`；`moon-crow+root-hound`；`mist-twin×2+paper-moth`；`sleepwalker`；`bell-watcher+market-ghost`；`hoarder` |
| D | `old-city-sentinel+requiem-choir`；`lantern-larva×2`；`epitaph-golem`；`ancestor-automaton+lantern-larva`；`ash-archivist+old-city-sentinel`；`requiem-choir+hollow-hunter`；`ancestor-automaton×2`；`epitaph-golem+moon-crow`；`ash-archivist+bell-watcher`；`lantern-larva+mist-twin×2`；`sleepwalker+requiem-choir`；`hoarder` |
| E | `wick-shade×3`；`keeper-echo`；`ember-maw`；`sorrow-crystal×2`；`deep-tendril+wick-shade×2`；`keeper-echo+requiem-choir`；`ember-maw+old-city-sentinel`；`sorrow-crystal+lantern-larva`；`deep-tendril×2`；`epitaph-golem+wick-shade`；`ash-archivist+keeper-echo`；`gilded-hoarder` |
| F | `music-box+paper-cranes×2`；`lost-shadow×2`；`returning-light+lost-shadow`；`paper-cranes×3`；`music-box+keeper-echo`；`sorrow-crystal+paper-cranes×2`；`lost-shadow+deep-tendril`；`returning-light+ember-maw`；`music-box+sorrow-crystal`；`lost-shadow+wick-shade×2`；`keeper-echo+paper-cranes`；`gilded-hoarder` |

### 8.3 地區原生組與守關者房
- 地區原生組（每區 6 組，形狀相同）：`[群×3]`、`[標準]`、`[輔+標準]`、`[群×2+輔]`、`[標準×2]`、`[重+群]`。各區用自己 5 種填，故事物種至少出現在 2 組；成對物種（`ice-komainu`）一律兩隻。
- **守關者房**：
  - 深度 `d ≥ 8`、`d % 5 === 3`、而且不是頭目層時，`floorOf` 在微光之後用 `WARDEN_SALT` 放一個守關者格（地圖標記沿用精英的事件地磚美術，不需要新地磚；名牌與圖鑑寫守關者的名字）；
  - 打倒後那一格變地板，這趟不再出現；
  - 戰鬥走精英的報酬路徑（`battleGear` 的精英分支）＋戰利品；
  - **不給記憶碎片**（`pieceDrops` 不用 `'warden'` 這個來源），所以 `balance.pace.test.ts` 的第 20 項不受影響。

---

## 9. 平衡安全

### 9.1 不動凍結帶的做法
1. 第 1–3 層位元不變（`encounterTable` 回舊表、舊怪物的深層特性只在新表生效、精英詞綴從第 4 層起、守關者從第 8 層起）。
2. 上線前位元不變：`ROSTER_LIVE` 為空時，`encounterTable`、`bossFor`、`eliteGroup`、`floorOf`（不放守關者）、名字、報酬全部和現在相同。測試：
   - `the roster with nothing live changes nothing`：7 區 × 深度 1–60 的表快照、`bossFor`、`floorOf` 的地圖快照；
   - `legacy fights replay bit for bit`：Task 0 把「舊表每組 × 種子 1–3、第 4、8 層」的完整戰鬥 log 存成 fixture，之後每次改 `battle.ts`、`skills.ts`、`scaling.ts`、`drops.ts` 都比對。
3. 每次上線切換（把一批 id 加進 `ROSTER_LIVE`）跑第 1–20 項（6d 之後含第 21 項）全部套件，再加第 22 項。不綠就只調新怪物自己的數字，或從表裡拿掉某一組；不碰既有旋鈕與門檻。
4. 經驗等價（`roster.test.ts`，不跑模擬）：7 區 × 深度 4–30，新表的平均 `groupExp`（寶物怪算 0）÷ 舊表平均，必須在 [0.92, 1.08]。
5. 裝備威力：銘文不增加條數與範圍（`an inscription never raises an item's affix count or range`）；專屬獨特只替換、不增加特殊裝備的總出現率（`own uniques never raise the special rate`，以 10 萬次頭目掉落的統計測試）；製作要先擊倒過。
6. 送禮速度：不新增「最愛」（`no new loved gift`）。

### 9.2 模擬會不會量到新內容
- 一般怪物：會，進表就被窮舉。
- 頭目、守關者、詞綴、地區深處、深帶歪隊、專屬獨特：現有帶量不到 → 第 22 項。
- 未上線的物種：`ENEMIES` 查得到定義，第 22a、22b、22e、22f、22i 在美術還沒好之前就能調數字。

### 9.3 新增：第 22 項（`engine/balance.roster.test.ts`）
門檻全部沿用既有帶的數字。

| 帶 | 內容 | 門檻（沿用） |
|---|---|---|
| 22a 物種等價 | 每個新一般物種的代表組（群 ×3、成對 ×2、其餘 ×2）在它的帶的第一個深度，期望隊伍（同 19a）；對照同原型的舊參考組 | 勝率 ≥ 0.85；hpLoss 10–45%；和參考組的 hpLoss 差 ≤ 0.08 |
| 22b 頭目等價 | 每個新頭目在每個出現深度（≤ 50），對照同深度同地區的 `lanterneater` | 勝率差 ≤ 0.10；稀有套裝每種子 ≥ 3 回合（第 11 項）；+`ENHANCE_MAX` ≥ 2 回合（第 14 項）；2、3、4 人勝率 ≤ 全隊 + 0.05（第 16 項） |
| 22c 地區深處 | 6 區在第 15、25 層，期望隊伍 | 勝率 ≥ 0.85；hpLoss 10–45% |
| 22d 深帶歪隊 | `ODD_LINEUPS` 四隊配 fill build：本道第 12、20、35 層；`allPhys` 在鋼鐵、腐毒第 12 層；`allMagic` 在雷鳴第 12 層 | 勝率 ≥ 0.85；hpLoss 10–45%（第 18a 項） |
| 22e 詞綴精英 | 5 種詞綴 × 本道第 4、8 層表的每一組 | 勝率 ≥ 0.6（第 8 項） |
| 22f 頭目歪隊 | `ODD_LINEUPS` × fill build × 每個有 M4、M7、M9、M17、M27、M28 的頭目，第一個出現深度 | 勝率 ≥ 同條件 `lanterneater` − 0.10 |
| 22g 寶物怪（只記錄） | 預設隊伍在逃走前擊殺的比率 | 不擋；提案目標 50–70% |
| 22h 專屬獨特天花板 | 6 件最強專屬獨特＋稀有，第 10、20 層 | 頭目 ≥ 2 回合（第 14 項）；表 hpLoss ≥ 10%（第 18d 項） |
| 22i 守關者 | 每個守關者在它的第一、二個深度，深度等級＋期望裝備 | 勝率 ≥ 0.6（第 8 項）；稀有套裝 ≥ 2 回合（第 14 項） |

- 22c、22d 在 `ROSTER_LIVE` 為空時量的是舊表，Task 0 先確認本來就綠；不綠就回報，不放寬。
- 每個 `it` 上限 300 秒；整套平衡一次只跑一套。

---

## 10. 圖鑑（決定：升級既有的圖鑑頁）

- **狀態**：`GameState.bestiary?: Record<string, { seen; felled; inscriptions?: number }>`，可選欄位，`SAVE_VERSION` 維持 8（照 6d `bond` 的做法）；驗證丟掉未知 id。
- **記錄**：`startBattle` 記 `seen`（以定義 id；地區變體算同一種；召喚的也算），勝利記 `felled`。不抽 rng。
- **顯示**（`CodexPage.monsters` 擴充）：
  - 只列已上線；沒見過顯示「？？？」＋剪影（同一張圖加 CSS `brightness(0)`，不是新圖）；
  - 見過：圖、名字、出沒（「本道 10–15 層」「熾焰之地」）、已揭露弱點（`revealed`）、見過與擊倒次數、特性一句；
  - 擊倒過：介紹第一句、招牌素材與銘文；
  - 第二、三句依 `loreAfter`（§4.2）解鎖；
  - 頭目與守關者另列「專屬裝備：已取得／未取得」。
- **分頁**：圖鑑內加篩選「本道／各地區／頭目」，100 種才不會變成一長串。
- **文字**：新檔 `data/bestiary.zh-TW.ts`，帶 `BESTIARY_PLACEHOLDERS` 與閘門測試；介面字串也放這個檔（避開 6d Task 7 的 `text.zh-TW.ts`）。新名詞（「霧生迴響」「守關者」「銘文」）登記進 ledger 的發明登記。

---

## 11. 開關

### 11.1 沒有核准美術就不上線
`data/roster.ts`：
```ts
/** 美術已發布的新敵人 id（敵人圖，以及它的招牌素材或戰利品圖示、專屬獨特的裝備圖）。只由美術計畫在發布 commit 加入。 */
export const ROSTER_ART: ReadonlySet<string> = new Set([]);
/** 已進遇敵表、頭目表、守關者房與圖鑑的 id。只由引擎計畫在上線 commit 加入；必須是 ROSTER_ART 的子集。 */
export const ROSTER_LIVE: ReadonlySet<string> = new Set([]);
```
- 新定義在 `data/enemies.roster.ts`、`data/materials.roster.ts`、`data/gear.roster.ts`，合併進 `ENEMIES`、`MATERIALS`、`SPECIALS` 供**查詢**；**列表**改讀 `liveEnemyIds()`、`artEnemyIds()`：
  - `allArtUrls()`：舊 id ＋ `ROSTER_ART` 的敵人圖與它的素材圖示；
  - 新素材的圖示在 `ROSTER_ART` 之前一律視為 `NO_ICON_YET`；
  - `NORMAL_ENEMIES`、手冊、`encounterTable`、`bossFor`、守關者房：只認 `ROSTER_LIVE`；
  - `pickSpecial` 的替換：只換成 `ROSTER_LIVE` 頭目的專屬獨特。
- 測試：
  - `ROSTER_LIVE ⊆ ROSTER_ART`；
  - `ROSTER_ART` 的每個 id：`enemy-<id>` 在 registry 是 `published`；它的招牌素材或戰利品 `icon-<mat>` 是 `published`；頭目與守關者的 `gear-<unique>` 是 `published`；
  - 召喚目標必須已上線；
  - `published.test.ts` 本來就會檢查檔案存在。

### 11.2 在美術之前可以先出貨給玩家的
- 引擎機制（沒有怪物用時不觸發）；
- 第 22 項；
- 精英詞綴（不需要新圖；上線時跑第 8、22e 項）；
- 舊怪物的深層特性**不行**：它們只在新表生效，新表要等美術；
- 圖鑑頁升級（列的仍是舊 9 種，但多了見過／擊倒、剪影、篩選）。

---

## 12. 計畫切分與順序

### 12.1 四個計畫
| 計畫 | 範圍 | 主要檔案 |
|---|---|---|
| **7a 怪物名冊：引擎與資料** | 定義、表、`bossFor`、守關者房、M1–M28、詞綴、深層特性、第 22 項、上線切換 | `data/roster.ts`、`data/enemies.roster.ts`（新）；`engine/scaling.ts`、`battle.ts`、`skills.ts`、`combatant.ts`、`events.ts`、`game.ts`、`dungeon/run.ts`；`render/BattleView.ts`、`ui2/scenes/battle.ts` |
| **7b 掉落、鍛造與送禮** | 招牌素材、戰利品、銘文、專屬獨特、`trophyRng`、銘刻與製作、`GIFTABLE` 推導、口味表 | `data/materials.roster.ts`、`data/gear.roster.ts`（新）；`engine/loot/drops.ts`、`engine/forge/*`、`ui2/scenes/forge*.ts`；6d 之後的 `data/story/bond.ts` |
| **7c 圖鑑與文字** | 圖鑑狀態與頁面、100 條介紹、39 件裝備介紹、（之後）夥伴認出故人的戰鬥台詞 | `data/bestiary.zh-TW.ts`（新）、`engine/state.ts`、`engine/save.ts`、`engine/story/handbook.ts`、`ui2/scenes/handbook.ts` |
| **5f 怪物美術** | 100 張敵人圖、7 張圖示與裝備工作表 | `art-factory/starlantern/tools/roster_art.py`、`review_roster.py`（新）、`registry.json`、`public/assets/games/starlantern/enemy|icon|gear/` |

### 12.2 7a 的 Task
| Task | 內容 | 驗收 |
|---|---|---|
| 0 | 基準：舊戰鬥 fixture、表與地圖快照；22c、22d 舊表綠 | fixture 提交；不綠就停下回報 |
| 1 | `data/roster.ts`、100 個定義、列表改讀 live／art | 246 不變；`NORMAL_ENEMIES` 仍 8；nothing-live 測試 |
| 2 | `encounterTable`、`bossFor`、守關者房（`WARDEN_SALT`） | 快照相同；`bossFor` 表格測試；地圖其他內容不動 |
| 3 | 第一波機制：M1、M2、M3、M13、M14 | §6.2 測試；fixture 相同 |
| 4 | 第 22 項骨架＋資料測試（等價、元素牆、freshness、名字劇透掃描） | 第一波 22a、22b 綠 |
| 5 | M4、M10、M11、M19、M20、M22 | 同上 |
| 6 | M5、M9、M15、M16、M17、M18、M21、M23、M25、M26 | 同上 |
| 7 | M6、M7、M8、M24、M27、M28 | 同上 |
| 8 | M12 詞綴、舊怪物深層特性、22e | 第 8 項不變 |
| 9–13 | 上線第 1–5 波（§12.5）：加 `ROSTER_LIVE`、全套平衡、只調新數字、更新釘住的測試（`NORMAL_ENEMIES` 長度、`scaling.test` 的「frost depth 6 見到全部」）、e2e 冒煙、截圖 | 第 1–22 項全綠；`economy.test` 綠 |
| 14 | `FINALE_BOSS.base` → `lantern-mother` | 19b 位元相同（同數值同技能） |

### 12.3 和 6c、6d、6e、5e 的關係
- **6c（Task 11–15 寫作中）**：只碰 `data/story.zh-TW.ts` 與故事測試。
  - 7a Task 0–8、7b 的資料層、5f 全部可以**現在並行**。
  - 7a Task 14（`data/story/scenes.ts`）排在 6c Task 15 合併之後。
  - 7c 的介紹文字依 §4.2 的「需要的文字」欄：自足的現在就能寫；靜鐘會相關等 Task 11；空殼等 Task 13；燈喰之母與子嗣、提燈人第三句等 Task 14。
- **6d（6c 之後開始）**會改 `battle.ts`、`game.ts`、`dungeon/run.ts`（Task 4）、`save.ts`、`state.ts`（Task 2）、`ui2/scenes/handbook.ts`（Task 9）、`text.zh-TW.ts`（Task 7）。
  - 7a 改 `battle.ts`、`game.ts`、`run.ts` 的 Task 2、3、5–8 **在 6d 開始前合併**；來不及就暫停到 6d Task 4 合併之後。
  - 7b 的送禮部分（`GIFTABLE` 推導、口味表）**依附 6d Task 1**：在 6d Task 1 的說明裡寫明「`GIFTABLE` 由 `kind` 推導」，7b 在 6d Task 5 合併後補口味表。
  - 7c 的圖鑑狀態（`save.ts`、`state.ts`、`handbook.ts`）排在 6d Task 2 與 Task 9 之後。
  - 6d 的第 21 項在每次上線切換時一起跑。
- **6e（羈絆文字）**：§7.4 的 18 句婉拒與痊癒反應句列入 6e 的工作量；6e 完成前，8 件故事戰利品不可送。
- **5e（表情美術）**：和 5f 沒有檔案衝突，但都改 `artPaths.test.ts` 的總數與 `registry.json`；兩者的發布 commit 依序合併，後合併的重算。
- **5d（裝備美術）**：專屬獨特的 `gear-<id>` 沿用 5d 的工具與欄位。5d 尚未發布時，5f 的裝備圖批次排在 5d 的工具合併之後。

### 12.4 之後的計畫（非本文件範圍，留接口）
- **7c 後半：故人台詞**。夥伴在隊上、遇到自己故事的守關者或頭目時，戰鬥開始說一句（只是台詞，沒有數值效果，避免「帶她才好打」）。需要 6e 之後的寫作與 `ScriptLine` 格式；閘門照 §4.2。
- **第 2 項懸賞**：以 `eliteAffix`、守關者、詞綴為目標。

### 12.5 上線波次與審核輪次
| 上線波 | 內容 | 機制 | 需要的美術輪 |
|---|---|---|---|
| 第 1 波 | 本道 B 帶 6＋`hoarder`＋`fog-warden`＋`false-moon`（`bell-watcher` 在 R0 但屬 C 帶，第 2 波上線） | M1–M3、M13、M14 | R0、R1 |
| 第 2 波 | 本道 C 帶 6＋`silent-bell`、`hollow-champion`＋`bell-warden` | 加 M5、M6、M8、M9、M10、M24 | R1 |
| 第 3 波 | 本道 D、E、F 帶 15＋`gilded-hoarder`＋第 20–50 層頭目 7＋`archon-hand`＋守關者 3；詞綴；深層特性 | 其餘 | R2 |
| 第 4 波 | 熾焰、霜凍、雷鳴：原生 15＋頭目 9＋守關者 3＋`rime-pillar` | 全部 | R3 |
| 第 5 波 | 腐毒、暗影、鋼鐵：原生 15＋頭目 9＋守關者 3 | 全部 | R4 |

美術先到、引擎晚到：沒關係（`ROSTER_ART` 有、`ROSTER_LIVE` 沒有）。引擎先到：玩家看不到。

---

## 13. 美術（計畫 5f）

### 13.1 敵人圖的資產契約（依 `contract.md` 的「敵人」列）
| 類別 | `--height` | prompt 高度 | 允許範圍（QA） |
|---|---|---|---|
| 群 | 52 | about 56 art pixels tall | 高 40–64，寬 ≤ 72 |
| 一般 | 64 | about 72 art pixels tall | 高 48–112 |
| 重 | 76 | about 84 art pixels tall | 高 48–112 |
| 中頭目、部件 | 96 | about 104 art pixels tall | 高 80–120 |
| 頭目 | 150 | about 160 art pixels tall, filling much of the canvas | 高 120–200 |

- 全部：透明、magenta `#FF00FF` 去背、單格、沒有姿勢或表情差分（受擊、攻擊、倒下由程式做）。
- runtime：`/assets/games/starlantern/enemy/<id>.png`；registry id `enemy-<id>`、`kind: sprite`。

### 13.2 圖示與裝備圖的契約
- 素材圖示：照 `contract.md` 的「圖示」列（24×24 方框、`--height 32`），5×4 工作表、厚 magenta 槽，部件清單寫在 registry 的 `sheet-icons-roster-<n>.parts`。
- 專屬獨特：照 5d 的 `gear-<id>` 規格與工具。
- 圖示不得有字：`iou-slip`（借條）、`hymn-sheet`（無字歌譜）、`torn-page`、`ash-page`、`epitaph-stone` 一律寫「blank」「unreadable marks, no letters」。

### 13.3 Prompt
- 敵人（逐字沿用 `batch.py` 的句型）：
  > Pixel art monster sprite of `<描述>`, facing the viewer, full body. Match the art style, pixel density, outline and shading of the attached approved monster sprite. 16-bit JRPG battle sprite, `<高度>`, strict square pixel grid, crisp 1px dark outline, limited palette, light from upper left, no anti-aliasing, no blur, no gradients. Centred on a perfectly flat solid pure magenta #FF00FF background with empty space around it. No text, no ground shadow, no particles. The design must be original and not resemble any existing anime or game character. Generate the image once with the image tool; do not post-process, resize, quantize or regenerate it.
- 附圖：
  - 一般怪物附 `enemy-slime` 原圖；
  - 中頭目、頭目再附 `enemy-lanterneater` 原圖；
  - R0 核准後，R1 以後再附一張 R0 同類型的新圖；
  - 故事怪物不附夥伴的立繪（避免畫成夥伴本人）。
- **配色規則**：本道物種用中性、偏亮的配色（灰、象牙、淡紫、淡金），因為地區上色是「亮度 × 顏色」（`tintMatrix`）。地區原生用該區本色。
- **故事怪物的畫法**：故人的殘影一律是「由霧、光、材質構成的剪影」，**沒有清楚的臉**。例如：
  - 舞者是熱浪與亮片構成的人形；
  - 騎士殘影是空的盔甲裡冒出灰霧；
  - 巡守是灰袍兜帽下一片霧。
  理由：不畫出可辨認的真人，語氣上是「記憶的形狀」，也避免和夥伴的回憶畫面衝突。
- 描述表（英文，交給 `roster_art.py` 的 `DESC`）。下面列出故事怪物與頭目；其餘一般怪物依 §5 的名稱與特性在 Task 2 補齊，並在審核頁顯示：

| id | 描述 |
|---|---|
| paper-moth | a small moth folded from an old yellowed letter, faded unreadable marks on its paper wings, a tiny wax-seal body |
| bell-watcher | a hooded watcher in a long grey robe with only mist under the hood, a small dull bronze bell hanging at its belt, a short staff |
| hollow-hunter | an empty suit of adventurer leather armour with a hood and nothing inside, holding a short sword, faint mist where the face should be |
| ancestor-automaton | a tall old bronze automaton with a round glass eye and riveted plates, a mark on its chest shaped like a lantern, moss in its joints |
| keeper-echo | a tall faceless figure in a long travelling cloak holding up a star lantern, translucent and pale gold |
| deep-tendril | a pale glowing tendril rising from dark ground, ending in a lantern-shaped bud, faintly translucent |
| mirage-dancer | a dancer-shaped figure made of rippling heat haze and bronze sequins, no face, one arm raised mid-twirl |
| ice-komainu | a guardian lion-dog statue carved from blue ice, a cracked rope with paper streamers around its neck |
| frozen-pilgrim | a pilgrim figure in straw cape and hat sealed inside a block of clear ice, only a silhouette visible |
| star-ember | a floating blue-white star-shaped flame with tiny sparks, a cold core |
| stolen-tome | a flying old spellbook with a star set into its cover, pages flapping like wings, no readable text |
| ashen-treant | a grey dead tree creature with tiny arrow marks carved along its bark, roots like legs, a few green buds left |
| vault-mimic | a heavy iron-banded treasure vault door with a huge padlock that opens like a hungry mouth, coins spilling |
| debt-collector | a thin shadow in a long coat holding a lantern and a blank yellowed slip of paper, no face |
| fallen-knight | an empty dented knight's armour with a red tattered tabard, grey mist rising from the neck, a broken sword |
| banner-bearer | an armoured shadow holding a tall pole with a torn red flag, mist instead of a face |
| false-moon（中頭目） | a large floating crescent-and-full moon made of pale crystal, half of it dark, soft silver light |
| bell-warden（中頭目） | a tall grey-robed gatekeeper of mist with a great bronze bell hanging from a yoke on its shoulders, faceless hood |
| toppled-automaton（中頭目） | a huge old bronze automaton half collapsed on one knee, sparks in its joints, a lantern mark on its chest plate |
| requiem-conductor（中頭目） | a tall marble figure in a ruined ceremonial robe raising a dusk-coloured baton, small hooded singers floating around it |
| lantern-brood（中頭目） | a pulsing nest of pale lantern-shaped eggs on dark roots, faint glow inside each egg |
| mirage-lead（中頭目） | a tall heat-haze dancer with flowing veils of light and a copper anklet, faceless, two faint mirror copies behind it |
| ice-shrine（中頭目） | a small wooden shrine hall frozen inside a pillar of ice, a rope and paper streamers across its front, two ice lion-dogs at its steps |
| burning-page（中頭目） | a single huge torn book page burning with blue-white star fire, no readable text, embers drifting |
| grey-elder（中頭目） | an ancient grey tree with a hollow face-like knot, arrow marks carved in its bark, one glowing acorn among dead branches |
| locked-vault（中頭目） | a giant locked vault with a starving thin frame, gold coins bulging from its seams, chains |
| gate-breaker（中頭目） | a huge hunched shadow creature carrying a battering ram made of a tree trunk, climbing mist around its legs |
| fog-warden | a towering gatekeeper of grey fog wearing heavy stone gate plates as armour, holding a great lantern halberd |
| silent-bell | a colossal cracked bronze bell hanging from chains with a hollow mouth, violet runes, small bells orbiting it |
| hollow-champion | a huge empty suit of heroic armour with many different swords stuck in its back like a fan, mist instead of a face |
| old-city-archon | a seated colossal marble ruler statue with a gold star crown and a cracked face, no hands, glowing eyes |
| archon-hand（部件） | a giant floating marble hand with gold rings and a glowing star in the palm |
| gorged-beast | an enormous bloated lantern-devouring beast, dozens of swallowed lanterns glowing through its stretched hide |
| lantern-mother | a vast dim shadow of a fading star lantern shaped like a veiled mother figure cradling a guttering light, sorrowful rather than monstrous |
| forgotten-festival | a giant paper festival lantern float with a painted smiling mask, small paper lanterns orbiting, faded colours |
| starless-whale | a huge whale swimming through dark mist, its body like a night sky with all the stars gone out |
| stopped-clock | a giant brass clock heart with frozen hands and broken springs, gears floating around it |
| first-lantern | a primitive ancient stone lantern on a pillar holding a small eternal flame, older and simpler than all others, carved with worn patterns |
| ember-tyrant | a giant crowned figure made of burning city ruins and flame, holding a melted sceptre |
| sandstorm-maw | a towering whirl of sand with a huge mouth of glassy teeth, bits of a caravan swirling inside |
| mirage-city | a floating desert city of domes made of heat haze, half of it on fire, faint dancers on its walls |
| rime-sovereign | a frozen queen-like figure sealed inside a tall ice throne, cold blue light |
| rime-pillar（部件） | a tall jagged ice pillar with a faint glowing rune core |
| white-silence | a vast white snow spirit with no features, a blizzard trailing from its sleeves |
| rift-maw | a jagged crack in the air rimmed with ice, a dark maw inside, a spear stuck in the ice at its edge |
| thunder-roc | a huge roc bird with storm-cloud feathers and lightning crackling across its wings |
| storm-conductor | a tall figure of copper rods and storm clouds raising a lightning baton |
| starfire-colossus | a colossus made of blue-white star fire and floating book pages, a star at its core |
| mire-hydra | a swamp hydra with three heads of different sizes, rotting green scales, poison dripping |
| grey-blight | a creeping mass of grey ash and fungus with pale spore pods around it, dead branches inside |
| bog-leviathan | an enormous swamp maw rising from black water, moss-covered lips, small eyes |
| faceless-host | a tall figure in a black coat whose face is a blank oval mirror, mirror shards orbiting it |
| vault-dragon | a lean dragon coiled around a hoard of gold, coins embedded in its scales |
| shadow-parade | a long procession of small shadow figures carrying lanterns, led by a tall masked shadow |
| fortress-colossus | a walking fortress tower colossus with cannon arms and rivet plates |
| siege-titan | a huge beast with iron-plated hide climbing out of fog, claws gripping a stone wall fragment |
| last-commander | an empty grand knight commander's armour with a red cape and a horn at its belt, mist rising from the collar |

### 13.4 機械 QA（`sl_art.py`，TDD 擴充 `test_sl_art.py`）
- 沿用：magenta 殘留 0、半透明 0、碰邊 0、不被畫布切到、16 px 以下的洞只列警告。
- 新增：
  - `height_band`（§13.1；群加寬度上限）；
  - `palette_max`（不透明像素色數 ≤ 32）；
  - `lum_range`（不透明像素亮度第 5–95 百分位差 ≥ 0.35，否則 `too flat to tint`）；本道物種另要求平均亮度 ≥ 0.35（`too dark to tint`）；
  - `no_face`（只限故事怪物：人工檢查項，在審核頁打勾，不自動擋）。
- 每個 id 最多 3 次生成；R0 每個至少 2 版擇優。

### 13.5 工具、審核頁、輪次
- `tools/roster_art.py`（結構照抄 `portal.py`、5d 的 `gear_art.py`）：`gen`、`cand`、`pick`、`note`、`approve --batch B --by TEXT`、`publish --batch B`、`plan-json`。
  - `gen --batch=r1..r4` 在 registry 沒有 `roster_style_approved` 時拒絕（`PermissionError`）；
  - `publish` 只發布 `approved`，在同一個 commit 寫 `runtime`、加 `ROSTER_ART`、更新 `artPaths.test.ts` 的總數與註解。
- `tools/review_roster.py` → `tmp/starlantern/review-roster/index.html`：
  1. 每隻在三張戰鬥背景（`bg-f1/2/3`）上的遊戲內大小（放大 3 倍、`pixelated`）；
  2. 和既有 9 張並排；
  3. 7 種地區色調模擬（和 `tintMatrix` 同公式的 CSS 濾鏡）；
  4. 群三隻一排、多部位頭目和部件一起、守關者和它召喚的一起；
  5. 黑色剪影（圖鑑「？？？」）；
  6. 圖示工作表切好的格子、放進背包列與鍛造屋列的樣子；
  7. 故事怪物旁邊列出它的閘門與「不得畫出的東西」清單（給人工打勾）；
  8. QA 數字、所有版本、淘汰原因。
- 主對話用 Artifact 工具發布審核頁（`files` 帶 `img/*`，超過 255 檔分兩次發布到同一個 url）。

| 輪 | 敵人圖 | 圖示與裝備工作表 | 核准 |
|---|---|---|---|
| R0 風格樣本 | 5：`paper-moth`（群）、`root-hound`（一般）、`bell-watcher`（故事人形）、`false-moon`（中頭目）、`fog-warden`（頭目） | 1 張（20 件：R0、R1 的素材＋2 件獨特） | **使用者看風格**；未核准前不生成其他批 |
| R1 本道淺層 | 13：B 其餘 4（`lamp-wight`、`tin-soldier`、`dust-mimic`、`market-ghost`）＋C 其餘 5＋`hoarder`＋`silent-bell`、`hollow-champion`＋`bell-warden` | 1 張 | 照 5d：機械 QA＋沒參與生成的代理在審核頁視覺檢查即可發布；網址仍給使用者，發布前有異議就重做 |
| R2 本道深層 | 27：D、E、F 15＋`gilded-hoarder`＋第 20–50 層頭目 7＋`archon-hand`＋守關者 3 | 2 張 | 同 R1 |
| R3 地區甲 | 28：熾焰、霜凍、雷鳴原生 15＋頭目 9＋守關者 3＋`rime-pillar` | 2 張 | 同 R1；故事怪物的閘門清單另由使用者看一次（只看語氣，不看技術） |
| R4 地區乙 | 27：腐毒、暗影、鋼鐵原生 15＋頭目 9＋守關者 3 | 1 張 | 同 R3 |
| 合計 | **100** | **7 張（137 件）** | |

五輪合計 5＋13＋27＋28＋27 = 100。`roster_art.py plan-json` 產生每輪的精確清單，測試檢查五輪的聯集剛好是 100 個 id、沒有重複。

### 13.6 數量的變化
- `allArtUrls()`：每個 id 進 `ROSTER_ART` 時加它的敵人圖與它的素材圖示。全部發布後 **+100 敵人圖 +98 素材圖示 = +198**（246 → 444，若 5d、5e 先發布則以合併當時的實際值為基準）。專屬獨特的 39 張裝備圖照 5d 的計數方式另計。
- `registry.json`：
  - +100 個 `enemy-<id>`、+98 個 `icon-<mat>`、+7 個工作表、+39 個 `gear-<id>`；
  - 被淘汰的版本記在 `rejected_attempts`，不留在 runtime 路徑。

---

## 14. 驗收總表

**資料（`data/roster.test.ts`、`data/bestiary.test.ts`，快）**
- 100 個新 id、98 個新素材、39 件獨特唯一，不和舊 id 衝突；每個 `drops.mat`、`summon.id`、銘文鍵存在；銘文鍵與獨特固定詞綴合法於欄位。
- 每組 1–3 隻；表 12 組；每個上線物種至少出現在 2 組；成對物種一律成對。
- `no element wall`、`freshness`、經驗等價、頭目不重複。
- `ROSTER_LIVE ⊆ ROSTER_ART`；`ROSTER_ART` 的圖都已發布。
- `bossFor`、守關者深度的表格測試；未上線回到舊行為。
- 鹽互不相同；原始碼不含 `Math.random`。
- 名字與介紹的劇透掃描（§4.2）。
- 不新增「最愛」禮物；故事戰利品在 6e 前不可送。

**引擎**：§6.2 每列的測試；`legacy fights replay bit for bit`；`the roster with nothing live changes nothing`；`trophy draws never move a lootRng draw`（同一個 seed，有沒有替換，`lootDraws` 與每一件 `lootRng` 產出相同）；`a warden pays no memory piece`；`placing a warden moves nothing else on the floor`。

**平衡**：第 1–20 項（6d 之後含 21）不改任何門檻，全綠；第 22a–22f、22h、22i 全綠；`economy.test` 綠。

**畫面**：
- 意圖欄：蓄力、守護、標記、演奏；
- 名牌：輪替弱點、受保護、適應、詞綴、偽裝的「寶箱？」、偷走的金額；
- 召喚有圖；圖鑑剪影與篩選；
- 鍛造屋：銘刻、製作的介面與「尚未擊倒」的灰色提示；
- 對應的 `*.test.ts`；e2e 冒煙（第 4 層一場、第 5 層頭目、第 8 層守關者）在第 1 波上線時加。

**美術**：每張通過 §13.4；`published.test.ts`、`artPaths.test.ts` 綠；R0 有使用者核准紀錄。

---

## 15. 留給實作者決定的部分
- 原型確切數字與每隻 ±15% 的形狀（以 22a 為準）；機率、召喚次數（以 22a、22b、22f、22i 為準）。
- 地區原生組的確切組合（照 §8.3 的形狀）。
- 專屬獨特固定詞綴的微調（必須仍合法於欄位）。
- 素材價格的確切值（以 `economy.test` 為準）。
- 圖鑑版面細節（照現有手冊頁的 `MenuItem` 與 detail 結構）。

## 16. 需要使用者決定的事
1. 夥伴過去的人（舞團、騎士團、神社的狛犬、老師的書）以「霧裡的殘影」出現在敵方：沒有臉，打倒時寫「霧散了」而不是死亡，夥伴集滿記憶後才收下它們的遺物。這個語氣可以嗎？還是希望這些故人完全不當敵人，只留在回憶裡？
