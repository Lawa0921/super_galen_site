# 星燈迷宮 怪物名冊擴充（Monster Roster）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把怪物從 8 種一般怪＋1 隻頭目，擴充成 100 個新敵人定義（一般 59、守關者 11、頭目 28、部件 2）。每一種都有改變打法的特性、自己的招牌掉落，一部分和夥伴的過去連在一起。第 1–3 層一個位元都不動；沒有核准美術的敵人，玩家一隻都看不到。

**Architecture:**
- **兩道開關**（spec §11.1）：`ROSTER_ART`（美術已發布）⊇ `ROSTER_LIVE`（已進遇敵表、頭目表、守關者房與圖鑑）。新定義一開始就放進 `ENEMIES`、`MATERIALS`、`SPECIALS` 供**查詢**；所有**列表**（遇敵表、`NORMAL_ENEMIES`、手冊、`allArtUrls`、守關者房、`bossFor`）只認開關。兩個集合都是空的時候，遊戲、模擬、sim gate 和今天逐位元相同。
- **先資料與引擎，後美術，最後上線**：PR A–C 把定義、機制、掉落、圖鑑全部做完並測完（敵人隱藏）；PR D 做美術工具；之後每一批美術（E1–E4）發布後，接一個上線 PR（L1–L4）把那一批加進 `ROSTER_LIVE`、寫圖鑑文字、刻意重錄 sim gate 的普通帶報告。
- **機制是資料**：每個機制是 `EnemyDef`／`EnemySkill`／`Effect` 的可選欄位；舊定義沒有這些欄位，行為逐位元相同。機制的決定一律不抽亂數。
- **新亂數只有兩條加鹽串流**：守關者位置（`WARDEN_SALT`，以樓層種子為鍵）與戰利品替換（`trophyRng`，`Run.trophyDraws` 計數）。`game.rng`、`lootRng`、`runeRng`、`memoryRng`、`forgeRng`、詞綴串流的抽取次數在舊內容上一次都不變。
- **難度系統照舊**：新頭目吃頭目詞綴、守關者吃菁英詞綴，都走 `engine/tiers.ts` 既有的串流；名冊不另做「飽食個體」詞綴（裁定 4）。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Python（Pillow／numpy，美術工具）、codex 圖片生成（`codex_still.py`）、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-19-starlantern-monster-roster-design.md`（下稱 spec §）。**spec §0 是 2026-10-26 的定案紀錄，本計畫的「計畫裁定」和 spec 正文衝突時，以裁定為準。** 另外要讀：
- `docs/superpowers/specs/2026-10-23-starlantern-difficulty-design.md` §5.0–§5.3、§6（難度、詞綴、平衡帶）；`docs/superpowers/plans/2026-10-23-starlantern-difficulty.md`（閘門的寫法）；
- `docs/superpowers/specs/2026-10-18-starlantern-affinity-expressions-design.md` §0、§6；`docs/superpowers/plans/2026-10-24-starlantern-affinity.md`（送禮、`GIFT_TASTE`、`GIFT_LINES`、W 步驟、收尾 G 的格式）；
- `docs/superpowers/story/starlantern-lore-ledger.md`（帳本）§2、§3、I-10、I-12、I-16、I-17、I-28、I-60 到 I-78、I-158、I-167、I-170、I-201、I-211；`docs/superpowers/story/starlantern-style-bible.md`（聖經）§1、§2.3–§2.5、§3、拼寫規則；
- `art-factory/starlantern/contract.md`（整份；特別是「敵人」「圖示」列、5d 的核准與發布規則 :140–:150、交給 5f 的東西 :221–:225）；`docs/superpowers/plans/2026-10-19-starlantern-plan5d-addendum.md` S4、S6、S8 與 §2。

**範圍外**：
- 懸賞任務（spec §5.8 只留接口）；怪物動畫格；戰鬥中夥伴認出故人的台詞（spec §12.4 的後續計畫）；
- 舊存檔遷移（尚未上線）；
- 任何劇情場景、`epilogue`、終幕文字的修改；
- 普通難度的既有平衡旋鈕（`ENEMY_POWER`、`DEEP_ENEMIES`、`PARTY_SCALE`、`BOSS_PARTY_SCALE`、`GROUP_CAP`、`ELITE`、`GEAR_CHANCE`、`BOSS_LEGENDARY`、`REGION_DROP_CHANCE`）與難度表 `TIERS`、`AFFIXES` 的任何數字。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`art-factory/`、`public/`、`.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-26-starlantern-roster/<PR 代號>/`，下稱 SDD（已被 `.gitignore` 排除，不進版本庫）。行號只用來定位，動手時一律用內容找。

---

## 對照報告：spec 各節 × 2026-10-26 的程式碼

「✓」＝仍然成立；「過時」＝已經不對，後面是修正（決定）。所有行號都是 `origin/master` `61e94646f` 上量的。

| spec 節 | 狀態 | 依據（file:line） | 修正 |
|---|---|---|---|
| §1.1 名冊 | ✓ | `data/enemies.ts:6-39` 仍是 10 個定義（8 一般＋`lanterneater`＋`scarlet-foe`）；`engine/scaling.ts:270` `NORMAL_ENEMIES`；`engine/scaling.test.ts:254`、`:357` 釘 8 | — |
| §1.2 遇敵、精英、地區 | ✓（簽名過時） | `engine/scaling.ts:278-285`；`engine/events.ts:46-49`；`scaleEnemy` 現在是 `(def, depth, region, elite, condition, tier, affixes)`（`scaling.ts:179`） | 決定：照新簽名寫，地區覆寫弱點只看 `!def.story`（`:210`），所以新物種的「故事」標記不可以用 `story`（裁定 6）。 |
| §1.3 掉落 | 部分過時 | 素材走 `rewards()` 的 `game.rng`（`engine/battle.ts:854-875`、`engine/game.ts:716`）✓；`lootRng` 契約 ✓（`engine/loot/drops.ts:180`）；**符文**也從怪物掉（`engine/game.ts:841-883`，`runeRng`，`engine/loot/runes.ts:50`）；稀有度現在 7 種（加 `epic`，`engine/types.ts:212`），星輝是旗標（`:224`）；**送禮已實作**（`data/story/bond.ts:64-92`） | 決定：逃走、召喚的敵人在 `battleGear` **與 `battleRunes`** 都跳過；替換專屬獨特之後重跑 `applyStarlit`（以 uid 為鍵，不抽串流）；送禮照現行的 `GIFT_TASTE`／`GIFT_LINES` 形狀（裁定 13）。 |
| §1.4 敵人能做的事 | 過時 | 敵人已能施加 6 種異常（`engine/ailments.ts:13`，高難度才有灼燒等）、`drainPct` 吸血（`engine/types.ts:39`、`engine/skills.ts:263-271`）、`taunt`、`revive`、`undying` | 見 §6 的對照（下一列）。 |
| §1.5 美術 | 過時 | `allArtUrls()` 是 **722**（`render/artPaths.test.ts:42-43`），不是 246；`NO_ICON_YET` 已刪；`allArtUrls` 直接走整張 `ENEMIES`、`MATERIALS`、`SPECIALS`（`render/artPaths.ts:230`、`:239`、`:248`）；專屬裝備每件 2 張（小圖＋大圖，`:248`） | 決定：三個迴圈改讀「舊 id ∪ `ROSTER_ART` 的 id」；總數以發布當下實際值重算（5d 補遺 S8）。 |
| §1.6 圖鑑 | ✓ | `engine/story/handbook.ts:121` 列全部非劇情敵人；`ui2/scenes/handbook.ts:222-240` | 改成只列已上線（裁定 17）。 |
| §2 目標與反目標 | ✓ | — | 「不動既有旋鈕」加上 `TIERS`、難度 `AFFIXES`。 |
| §3 規模與深度帶 | ✓ | `ACT_DEPTHS = { act2: 4, act3: 10, act4: 16 }`（`data/story/scenes.ts:8`）、`FINALE_DEPTH = 30`（`:11`） | — |
| §3.4 量化驗收 | ✓（檔名衝突） | `data/roster.test.ts` 已存在（8b 技能名冊，`:12-30`） | 決定：新資料模組叫 `data/monsters.ts`／`data/monsters.test.ts`（裁定 2）。 |
| §4.1 總則 | 部分過時 | I-17 是出口前的刀與洛恩拉她出霧（帳本 :140），**不是**巡守被吞；I-10 已翻案：凜的師父就是鐘守（帳本 :133、I-167 :290） | 決定：「迷宮吞過追進來的巡守」登記成新條目 I-222；排除理由改成「不出現鐘守（＝凜的師父，I-10、I-167）」。 |
| §4.2 故事怪物 | 部分過時 | `mem:selene:2` 只演出滿月的明亮結局（`data/story.zh-TW.ts:818-825`），「兩種結局」在第 3 片（`:832`），「新月」是第 5 片的詞（I-201、`data/story/story.test.ts:1011`）；寶庫是莉茲第 4 片（I-74，`story.test.ts:1038`），債是第 2 片（`:1036`）；`act4` 已寫出「守燈人」（`data/story.zh-TW.ts:438`）；I-211 暗示公主活著 | 決定見裁定 20：`false-moon` 的兩個狀態改叫「月明／月蝕」，圖鑑閘門改成 `mem:selene:2`→滿月、`:3`→兩種結局、`:5`→新月；`vault-mimic` 閘門改 `mem:liz:4`；`debt-collector` 改名「敲門的影子」；提燈人第三句改寫並用 `seen: ['mem:hero:9']`；子嗣登記 I-223。 |
| §4.2 名字掃描 | 過時 | 檢查詞缺 `要殺的人`（帳本 :105）；`data/terms.test.ts:96-100` 禁「精英」 | 決定：補上；全部文字用「菁英」。清單不能 import 測試檔，抄進 `data/monsters.test.ts` 並註明出處行號（`story.test.ts:428`、`:455-471`、`:1009-1047`）。 |
| §5.1 數值形狀 | ✓ | `EnemyDef.floor: 1\|2\|3`（`engine/types.ts:197`）、`BOSS_HOME = 12`（`scaling.ts:40`）、`ELITE`（`:107`）、`ELITE_REWARD = 3`（`:108`） | — |
| §5.3–§5.6 名冊表 | ✓（兩處改名） | — | `debt-collector` →「敲門的影子」、`iou-slip` →「泛黃的紙條」（裁定 20）；其他名字在 A2 過 `BattleView.test.ts:805-808` 的寬度檢查與字型檢查，過不了才縮短。 |
| §5.7 精英詞綴「飽食個體」 | **過時，取消** | `AFFIX_SALT`、`AFFIX_IDS`、`AFFIXES`、`AffixId`、`swift` 全部已被難度詞綴使用（`engine/tiers.ts:15`、`:21-41`、`data/affixes.ts:10-42`）；spec 的雜湊正好等於頭目詞綴的種子（`tiers.ts:22`）；普通難度「不走新分支」（`data/difficulty.ts:3-4`、`:68-71`） | 決定：取消 M12 與 22e（裁定 4）。 |
| §5.8 舊怪物深層特性 | ✓ | `bat`、`beetle`、`golem` 仍沒有技能（`data/enemies.ts:10`、`:15`、`:23`） | 名稱改用新機制名（裁定 9）。 |
| §6 機制 M1–M28 | 多處撞名 | 見下方「機制對照」 | 裁定 9。 |
| §7.1 招牌素材與戰利品 | 部分過時 | `MaterialKind` 沒有 `trophy`（`engine/types.ts:226`）；`MATERIALS` 22 種（`data/data.test.ts:35`）；`engine/forge/uses.test.ts:13-15` 要求每個非 junk 素材都有鍛造用途 | 決定：加 `trophy` 與 `keepsake` 兩種（裁定 12）；資料一進來就帶「銘刻」「製作」用途（A3）。 |
| §7.2 銘文 | ✓（要補一條） | 星輝要求全部詞綴頂值（`engine/loot/item.ts:52-61`） | 決定：只在**非特殊**裝備（普通到史詩）上銘刻；星輝只出現在特殊裝備，所以不衝突。 |
| §7.3 專屬獨特 | 部分過時 | `pickSpecial` 的池子由 `SPECIAL_LIST` 篩出（`data/gear.ts:185`、`engine/loot/drops.ts:132-146`）；放進去會改變既有掉落；`bossKills` 以 `地區:深度` 為鍵（普通以上的難度再加前綴，`engine/tiers.ts:68-70`），不是敵人 id | 決定：專屬獨特帶 `owner`、`region: null`，不進任何 `pickSpecial` 池、沒有剪影；製作的「先擊倒過」讀圖鑑的 `felled`（裁定 14、15）。 |
| §7.4 送禮 | 過時 | `GIFTABLE` 已由 `kind` 推導（`data/story/bond.ts:64-69`），新的 `monster` 素材會自動變成可送、普通 +1；`trophy` 不可送；`GIFT_LINES` 以素材為鍵（`data/bond.zh-TW.ts:18-24`）；`data/story/bond.test.ts:15-23` 釘死 18 種 | 裁定 13。 |
| §7.5 串流與鹽 | 過時 | 八個 SHA-256 初始字全部已用（`run.ts:99`、`:101`，`tiers.ts:15`，`drops.ts:34`、`:186`，`memories.ts:27`，`fragments.ts:100`，`runes.ts:18`）；另有 `FORGE_SALT 0x2f6b1d3a`、`0x5bd1e995`、`0x27d4eb2f`、`0xe11e`、`0x2545f491` | 決定：`WARDEN_SALT = 0x428a2f98`、`TROPHY_SALT = 0x71374491`（SHA-256 的前兩個輪常數）；不需要 `AFFIX_SALT`。 |
| §8 遇敵組成 | ✓ | `data/floors.ts:5`、`:20`、`:35` 每層只有 3–4 組 | — |
| §8.3 守關者房 | 部分過時 | 走精英路徑會掉記憶碎片（`engine/game.ts:765-769`，`source 'elite'`） | 決定：守關者戰是新的一種戰鬥（`warden`），報酬走精英分支，但 `pieceDrops`／`lootFragments` 不呼叫（裁定 10）。 |
| §9.1 位元不變 | 部分過時 | sim gate 的四個普通帶與 parity 都窮舉 `encounterTable`（`engine/parity.ts:64-66`、`engine/balance*.test.ts`）；`engine/__fixtures__/tiers/baseline.normal.txt` 也是；「舊戰鬥 fixture」其實 sim gate 的動作雜湊已經是（`engine/simGate.ts:28-32`） | 決定：parity 固定量舊表（裁定 7）；不另錄舊戰鬥 fixture，sim gate 就是它；上線任務刻意重錄普通帶報告（「重錄規則」）。 |
| §9.3 第 22 項 | 部分過時 | `BANDS` 登記（`engine/bands.ts:9-20`）；`every balance file is a normal band`（`engine/sim.test.ts`）不准 `balance*` 檔穿 build、裝符文 | 決定：普通難度的 22a–22i 在 `engine/balance.roster.test.ts`（`ROSTER_BANDS=1`）；高難度的 22j 在 `engine/tierBands.roster.test.ts`（`BANDS=1`）。 |
| §10 圖鑑 | 部分過時 | `SAVE_VERSION = 9`（`engine/state.ts:14`）；未知 id 現在讓存檔判成損壞，只有閒聊是丟掉（`engine/save.ts:261`） | 決定：`GameState.bestiary?` 可選；載入時用新的 `repairBestiary` 丟掉未知 id（裁定 17）；沒見過的不顯示剪影（裁定 18）。 |
| §11 開關 | ✓（實作過時） | 見 §1.5 列 | 裁定 3。 |
| §12 計畫切分 | 過時 | 7a/7b/7c 和難度計畫的任務代號撞名（difficulty spec :304）；6c、6d、6e 都已合併 | 決定：本計畫用 PR 代號 A、B1、B2、C、D、E1–E4、L1–L4；所有文字現在就能寫。 |
| §13 美術 | 部分過時 | `contract.md:145` 與 5d 補遺 S4：**每一批**都要使用者在審核頁核准；`style_approved` 只蓋裝備；圖示的實際尺寸約 33×35（`icon-blaze-core` 的 `qa.size`），和「24×24 方框」矛盾；沒有 `roster_art.py`、`review_roster.py`、`height_band` 等 QA | 裁定 21–24。 |

### 機制對照（spec §6.2 × 現行引擎）

| 代號 | 現況 | 依據 | 決定（新名字） |
|---|---|---|---|
| M1 蓄力 | 新 | 敵人每回合重抽（`engine/battle.ts:390-408`、`:767-770`、`:823-830`） | `EnemySkill.windup?: string`、`Combatant.winding`；蓄力中跳過 `chooseEnemyActions` 的抽取；睡眠與凍結都打斷 |
| M2 守護 | 撞名 | `BarrierKind 'guard'`（`engine/mech.ts:69`）；`cover`（`engine/types.ts:93`、`engine/battle.ts:417-436`）只轉我方受的攻擊 | 敵方用既有 `Effect cover`，`forcedTarget` 的鏡像版處理我方打向敵人的單體行動；畫面叫「守護」 |
| M3 逃走 | 撞名 | `Outcome 'fled'` 是我方逃跑（`battle.ts:47`、`:765`） | `EnemyDef.fleeAfter`、`Combatant.left`（離場） |
| M4 召喚 | 新 | 敵人只在 `createBattle` 生成（`battle.ts:206-224`）；`BattleView` 只在 `setup` 建立精靈（`render/BattleView.ts:256-329`），`syncHp` 忽略未知鍵（`:651-656`） | `Effect { kind: 'summon'; id; max }`；先抽出 `meetEnemy`；`BattleView.addFoe` 加重排 |
| M5 弱點輪替 | 部分 | 圖鑑的弱點以物種存（`engine/skills.ts:231`、`engine/game.ts:702`） | `EnemyDef.prism?: 'cycle' \| 'stage'`；有 `prism` 的物種不寫 `revealed`，圖鑑顯示「輪替」 |
| M6 借來的招式 | 撞名 | `echo` 是洛恩的機制與符文（`battle.ts:46`、`:67`、`engine/mechanics/echo.ts`） | `Effect { kind: 'mirror'; cap }`、`BattleState.lastPartyHit` |
| M7 多部位護盾 | 撞名 | `Combatant.shield` 是吸收量（`engine/combatant.ts:87`） | `EnemyDef.parts?: { cutPct: number }`（本體）＋部件 `rank: 'part'` |
| M8 階段 | 撞名 | `phase` 是瑟蕾的月相（`engine/mech.ts:39`、`battle.ts:69`） | `EnemyDef.stages` |
| M9 遺忘 | 新異常 | `AilmentId`（`engine/ailments.ts:13`）、`AILMENT_IDS`（`:144`）、圖示清單寫死（`render/artPaths.ts:27`） | `forget` 加在 `AILMENT_IDS` **最後**；圖示在 E1 發布（裁定 22） |
| M10 倒下時 | 新 | `dealDamage`（`combatant.ts:320-341`） | `EnemyDef.onFall` |
| M11 吸血 | 已有 | `damage.drainPct` | 直接用 `drainPct` |
| M12 精英詞綴 | 撞名 | 難度詞綴 | **取消**（裁定 4） |
| M13 偷竊 | 新 | Liz 的 `coinGold` 是先例（`battle.ts:872`） | `Effect { kind: 'steal'; perDepth }` |
| M14 開場 | 部分 | 睡眠已有（`combatant.ts:23`、`:148`、`:319`）；`delay` 是「最後行動」（`battle.ts:244-249`） | `EnemyDef.opener?: 'disguise' \| 'asleep' \| 'ambush' \| 'decoy' \| 'encased'`；`asleep` 直接設 `sleep` |
| M15 抹去 | 部分 | 增益模型（`combatant.ts:147`、`:175-184`）；`auras`、`ward` 不是增益 | `Effect { kind: 'dispel' }`：只搬增益，不碰常駐與護壁 |
| M16 適應 | 新 | `resist` 可在戰鬥中改（`combatant.ts:22`） | `EnemyDef.adapt?: number`（回合數） |
| M17 吸 TP | 部分（方向相反） | `tpPerHit` 是攻擊者回 TP（`engine/skills.ts:272-281`） | `damage.tpDrain`（目標扣 TP） |
| M18 模仿 | 新 | `createBattle` 的倍率鏈（`battle.ts:211-217`） | `EnemyDef.mimic?: number` |
| M19 幻影 | 新（要 M4） | — | `opener: 'decoy'` |
| M20 傷害平分 | 新 | — | `EnemyDef.shareWith?: string` |
| M21 再生 | 撞名 | 關鍵天賦 `regen`（`c.keystones.includes('regen')`）與 `tpRegen`（`battle.ts:696-704`） | `EnemyDef.mend?: { pct; stopBy? }` |
| M22 重新站起 | 撞名 | `Effect revive`（`engine/types.ts:43`）；`deadAlly` 目標已能用，但只看機率（`engine/skills.ts:393-398`） | 自己：`EnemyDef.rise?: { pct }`；替同伴：既有 `revive`＋新的 `EnemySkill.when?: 'deadAlly'` |
| M23 冰封 | 撞名 | `frozen` 是凍結異常（`combatant.ts:73-74`） | `opener: 'encased'`、`Combatant.encased` |
| M24 宣告標記 | 撞名 | `mark` 是凜的機制（`engine/types.ts:66`、`engine/skills.ts:449-457`） | `Effect { kind: 'hunt' }`；我方嘲諷優先（`forcedTarget` 的順序 `battle.ts:423-424`） |
| M25 對中毒加傷 | 新（有先例） | `wounded`（`combatant.ts:202`、`:262`） | `damage.vsPoisoned` |
| M26 光環 | 撞名 | `Combatant.auras` 是常駐符文（`combatant.ts:51`） | `EnemyDef.rally?: Partial<Record<StatKey, number>>` |
| M27 停針 | 違反難度裁定 | 我方永遠不會失去整回合（difficulty spec §5.2、`tierBands.hell.test.ts:74` 的 HX） | 改成「遲滯」：用既有 `delay` 效果打在我方（下一回合最後行動），不跳過回合（裁定 9） |
| M28 吞入 | 新（要改規則） | 沒有東西會把隊員移出陣型（`battle.ts:273`） | `Effect { kind: 'engulf' }`；被吞的人**照常行動**（裁定 9） |

---

## 計畫裁定

spec 已核准（2026-10-26，控制者依使用者授權）。下面是 spec 沒寫、或因對照報告改掉的細節，全部是「設計者裁定」，同時抄進 spec §0。

1. **分期與 PR**。照「分期與 PR」表的順序；同一個 PR 內的任務依編號執行。開工條件：
   - B1、D 要 A 已合併；B2 要 B1；C 要 B2（C 的掉落與圖鑑會讀 B 的 `left`、`summoned`）。
   - E 系列的**生成與審核**可以在 D 合併之後和 B、C 並行（只動 `art-factory/` 與暫存區）；E1 的**發布**（E1c）要 A、D、B2 已合併（`forget` 的圖示要 B9 的型別）。E2–E4 的發布要前一個 E 已合併。
   - L1 要 A、B1、B2、C、E1 都已合併（機制、第 22 項、圖鑑註冊表都要在）；L2–L4 要對應的 E 與前一個 L 已合併。
   - `data/monsters.ts`、`data/monsters.test.ts`、`render/artPaths.test.ts` 會被 A、B11、C1、D4、每個 E 與 L 改：後合併的 rebase 之後重跑全套，總數照當下實際值重算。
   - 每個 PR 的第一個任務錄自己的 `gate-0`（從開工時的 `origin/master`）。
2. **檔名**：`data/monsters.ts`（開關、表、`bossFor`、`wardenFor`、`bandOf`）、`data/monsters.test.ts`、`data/enemies.roster.ts`、`data/materials.roster.ts`、`data/gear.roster.ts`、`data/bestiary.zh-TW.ts`、`data/bestiary.test.ts`、`engine/bestiary.ts`、`engine/foes.ts`（敵方機制的純函式）、`engine/balance.roster.test.ts`、`engine/tierBands.roster.test.ts`、`art-factory/starlantern/tools/roster_art.py`、`review_roster.py`、`test_roster_art.py`。`render/gearArt.test.ts:27` 的 glob 會載入 `data/*.roster.ts`，把裡面的 id 從 5d 的交叉檢查扣掉（5d 補遺 S6 的設計），所以名冊的圖示與裝備圖由本計畫自己的測試（D4 的 `every art id is published`）守。
3. **開關的讀法**（spec §11.1）：
   - `ROSTER_ART`、`ROSTER_LIVE` 在 `data/monsters.ts`，一開始都是空的；`ROSTER_LIVE ⊆ ROSTER_ART`（測試）。
   - `listedEnemy(id)` = 舊 id（`LEGACY_ENEMY_IDS`，今天的 10 個）或 `ROSTER_LIVE.has(id)`；`artEnemy(id)` = 舊 id 或 `ROSTER_ART.has(id)`。
   - 素材與專屬獨特跟著它的主人：`ownerOf(mat)`／`SpecialDef.owner`；`artMaterial(id)` = 舊素材或主人在 `ROSTER_ART`。
   - `NORMAL_ENEMIES`（`engine/scaling.ts:270`）改成 `listedEnemy(id) && !boss && !story && !rank`：守關者與部件不是一般怪。
   - 讀列表的地方全部改用這些函式：`NORMAL_ENEMIES`、手冊（`engine/story/handbook.ts:121`）、`allArtUrls` 的敵人、素材、裝備三個迴圈（`render/artPaths.ts:230`、`:239`、`:248`）、`encounterTable`、`bossFor`、`wardenFor`、專屬獨特的替換。**查詢**（`ENEMIES[id]`、`MATERIALS[id]`、`SPECIALS[id]`）不受影響。
4. **取消 spec §5.7 的「飽食個體」（M12）與 22e**。難度系統已經讓噩夢、地獄的菁英與頭目帶詞綴，普通難度「不走新分支」是難度系統的契約；第二套詞綴會撞名、撞種子、在名字下方疊兩種標籤。spec §5.8 的懸賞接口改指向 `rollAffixes`（純函式，以位置為鍵，懸賞板可以預先算）。
5. **新頭目與守關者在高難度**：新頭目（`boss: true`）照舊吃頭目詞綴（以深度為鍵，`engine/game.ts:1652`）、`bossHp`／`bossAtk`；部件不是 `boss`，不吃詞綴；守關者走菁英路徑，吃菁英詞綴（以格子為鍵）。`tierBands.ts`、`buildBands.ts`、`parity.ts`、`balance.test.ts:191`、`balance.lineups.test.ts:81` 寫死的 `lanterneater` **保留**當參考；真正遇到的新頭目由 22b（普通）與 22j（高難度）量。
6. **「故事怪物」不用 `story` 欄位**。`story: true` 的意思是劇情戰的敵人（`scarlet-foe`）：不隨機出現、保留自己的弱點。名冊用兩個新欄位：`lore?: CharacterId`（和哪位夥伴的過去有關，給圖鑑與送禮用）與 `remnant?: true`（人的殘影：倒下的戰鬥紀錄寫「〇〇散成了霧」，不寫倒下）。`remnant` 的物種：`bell-watcher`、`bell-warden`、`hush-acolyte`、`hollow-hunter`、`hollow-champion`、`keeper-echo`、`mirage-dancer`、`mirage-lead`、`frozen-pilgrim`、`debt-collector`、`fallen-knight`、`banner-bearer`、`last-commander`。
7. **parity 固定量舊表**。`engine/parity.ts:64-66` 改用 `legacyEncounterTable('mainline', depth)`（A1 抽出，內容就是今天的 `encounterTable`）。parity 量的是「角色技能之間的平衡」，不是怪物；它本來就叫「the old roster baseline」。所以名冊上線之後，`contribution.json` 仍然和 `contribution.8d-final.160.json` 逐位元相同，`PARITY_TASK` 維持 `between plans`。
8. **舊戰鬥的位元保證就是 sim gate**。gate 的動作雜湊（`engine/simGate.ts:28-32`）逐回合記錄了第 2–25 層每一組舊遇敵的戰鬥；spec §9.1 要的「legacy fights replay bit for bit」不另錄 fixture。另外 A0 錄一份地圖快照（`engine/__fixtures__/roster/floors.before.json`），守住「放守關者不動地圖上的其他東西」。
9. **機制的名字與兩條改寫的規則**（對照表的最後一欄）。兩條規則改寫：
   - **M27 停針 → 遲滯**：難度系統已裁定「我方永遠不會失去整回合」，所以 `stopped-clock` 的「停針」改成對一名隊員施加既有的 `delay`（下一回合最後行動）並 spd −30% 1 回合；不能連兩回合對同一人（`Combatant.delayedBy` 記錄）。
   - **M28 吞入**：被吞的隊員**照常行動**，但單體行動只能打施放者（「從裡面打」，傷害 ×1.5）、範圍技只打得到施放者；敵人選不到他、隊友補不到他（道具與自己的技能可以）；每回合結束受中毒傷害；對施放者累積造成 15% 最大 HP 或過了 1 回合就吐出；全隊最後一個站著的人不會被吞。
10. **守關者戰**：
    - 地圖：`Content.kind` 與地圖的 `Tile` 都加 `'warden'`（不可以重用 `'elite'`：`move` 會把 `'elite'` 送去 `eliteGroup`，`engine/game.ts:358`）；`floorOf` 在 owner 微光的迴圈之後，用 `mulberry32(seed ^ WARDEN_SALT)` 呼叫 `placeSpecial`；條件 `d ≥ 8`、`d % 5 === 3`、不是頭目層、`wardenFor(region, d)` 已上線。`'warden'` 格**畫**精英的事件地磚（`EventTileKey 'elite'`，不需要新美術）。
    - 戰鬥：`startBattle(group, false, true, group[0], 0, { warden: true })`。數值與報酬走精英路徑（`ELITE`、`ELITE_REWARD`、`battleGear` 的精英分支、`battleRunes` 的精英列、菁英詞綴）；**不呼叫** `pieceDrops`、`lootFragments`（spec §8.3：守關者不給記憶碎片）；同隊好感照精英給（`FIELD_POINTS.strong`）。
    - 打倒後那一格變地板、這趟不再出現（照 `eliteAt` 的做法）。
    - 組：`WARDEN_GROUPS`（`data/monsters.ts`），守關者單獨或帶 1 隻護衛。
11. **`bossFor(region, depth): string[]`**：本道第 3 層與終幕照舊在 `bossFor` 之前處理（`engine/game.ts:338-342`）；本道 5 的倍數 `MAINLINE_BOSSES[(d/5 − 1) % 10]`；地區 `REGION_BOSSES[r][(d/5 − 1) % 3]`；那隻還沒上線就回 `['lanterneater']`。多部位回傳 `['old-city-archon', 'archon-hand', 'archon-hand']`、`['rime-sovereign', 'rime-pillar', 'rime-pillar']`。部件 `rank: 'part'`，等級跟本體的家鄉（`BOSS_HOME`），exp 30、gold 0、無掉落、不進表、不吃詞綴。
    - **燈喰之母只在終幕出現**（改 spec §5.6 的「本道 30」）：`MAINLINE_BOSSES` 的第 30 層那一格是 `lanterneater`。既有的劇情裁定「終幕之後第 30 層是長大的燈喰之獸，不是她」（`engine/game.test.ts:3545-3551`）照舊。`lantern-mother` 是終幕的外型（L2c），她的戰利品與專屬獨特在終幕那一戰掉，製作的「先擊倒過」也由終幕滿足。本道 5–50 層仍然兩兩不同（第 30 層的燈喰之獸只和第 3 層重複，第 3 層不在範圍內）。
12. **素材種類**：`MaterialKind` 加 `'trophy'` 與 `'keepsake'`。spec 的 39 個戰利品＝頭目 28 個各 1＋守關者 11 個各 1（部件沒有）。其中九位夥伴故事守關者的那 9 個是 `keepsake`（遺物：凜 `tower-dust`、瑟蕾 `moon-silver`、千鶴 `shrine-rope`、莎菲拉 `copper-anklet`、希爾薇 `ashen-acorn`、諾艾兒 `ash-page`、波比 `automaton-core`、莉茲 `vault-coin`、絲嘉蕾 `gate-splinter`），其餘 30 個（頭目 28＋`requiem-conductor`、`lantern-brood`）是 `trophy`。兩者都必掉 1 個、都是製作專屬獨特的材料，只差能不能送。招牌素材 59 個是 `monster`。
13. **送禮**（取代 spec §7.4）：
    - `GIFT_KINDS` 加 `'keepsake'`，不加 `'trophy'`：仍然完全由 `kind` 推導，沒有例外名單。打頭目的戰利品不能拿去刷好感；遺物可以送。
    - 新的 `monster` 素材自動成為可送、**對所有人都是普通（+1）**；本計畫**不新增任何「喜歡」或「最愛」**，送禮速度（第 21p 項）完全不變。
    - 每位夥伴自己的遺物：`GIFT_TASTE[c].declined` 加它、`healed` 設 `'liked'`；`GIFT_LINES[c].declined[mat]`、`.healed[mat]` 各一句（共 18 句），在那隻守關者上線的 L 任務寫。照現行的痊癒規則（集滿碎片才收下，`engine/story/bond.ts:178-207`）。
    - `data/story/bond.test.ts:15-23` 的十八種釘子改成「舊的十八種仍在，而且 `GIFTABLE` 等於 `giftableOf(MATERIALS)`」；不放寬任何口味表的斷言。
14. **專屬獨特**：`gear.roster.ts` 的 39 件 `SpecialDef` 加 `owner: string`（敵人 id）、`region: null`、`source`（頭目 `'boss'`、守關者 `'elite'`）、固定 3 條詞綴、`weaponKind`（武器必填，`data/data.test.ts:139-142`）、`lore` 一句。`pickSpecial` 與 `regionSpecials` 一律排除有 `owner` 的；所以剪影集合（`render/artPaths.ts:173-176`）不變，每件只有小圖＋大圖兩張。
15. **專屬獨特怎麼來**：
    - 掉落：在新頭目或守關者的戰鬥裡，`rollBossGear`／精英那一件照舊用 `lootRng` 跑完；那件是 `legendaryTier` 時，用 `trophyRng` 抽 `OWN_UNIQUE_SHARE = 0.5`，中了就換成該敵人的專屬獨特（`rollItem` 以 `trophyRng` 重擲數值，保留 uid），再以同一個 uid 跑一次 `applyStarlit`。高難度提高傳說級占比，所以專屬獨特也跟著多：這是高難度「掉落更好」的承諾，不另調。
    - 製作：鍛造屋「製作」頁新列：戰利品或遺物 5 ＋ `star-tear` 1 ＋ `setGold(ilvl)`；**條件**是圖鑑裡那隻 `felled ≥ 1`；用 `forgeRng` 抽一次，照 `craftSet`（`engine/forge/craft.ts:80-94`）。
16. **銘文**：每個一般物種的銘文鍵寫在 `EnemyDef.inscribe?: AnyStat`（spec §5.3、§5.4 的「銘文」欄，A2 加）。`ItemInstance.inscription?: string`（物種 id）。新物種那隻的 `lootRng` 掉了裝備、而且不是特殊裝備時，用 `trophyRng` 抽 `INSCRIBE_CHANCE = 0.25`；中了就把一條詞綴換成該物種的銘文鍵（槽位不允許就不換，但仍記 `inscription`），數值在同一稀有度與 ilvl 的範圍內由 `trophyRng` 重擲。名稱後加「・〇〇銘」（物種名的前兩個字，表在 `data/bestiary.zh-TW.ts`）。鍛造屋「銘刻」：同物種招牌素材 3 ＋ `REROLL.gold(ilvl)`，把一條詞綴重洗成銘文鍵，用 `forgeRng`。
17. **圖鑑**：`GameState.bestiary?: Record<string, { seen: number; felled: number; inscribed?: true }>`。`startBattle` 記 `seen`（定義 id；地區變體算同一種；召喚的算；幻影不算），勝利記 `felled`（打倒的每一隻，包含召喚的）。不抽亂數。`SAVE_VERSION` 維持 9；`isValid` 檢查形狀（非負整數），`loadGame` 在驗證之後呼叫 `repairBestiary` 丟掉 `ENEMIES` 沒有的 id（照 `dropUnknownBanters`，`engine/save.ts:261`）。
18. **沒見過的物種不顯示剪影**：只顯示「？？？」與出沒地點。5d 規定剪影只能由核准的圖確定性轉出、不能用 CSS 畫（`contract.md`、5d 補遺），為 100 隻做剪影檔不值得。
19. **sim gate 與重錄**（見「重錄規則」）：只有 L1b、L2b、L2c、L3b、L4b 可以讓普通帶的報告改變；其他任務一律 `gate: identical`。任何任務的 `contribution.json` 都必須和 `contribution.8d-final.160.json` 逐位元相同。
20. **故事的修正**（控制者是編劇，以下全部定案）：
    - `false-moon`「不存在的月亮」：兩個狀態叫「月明」（替同伴補血加防）與「月蝕」（enemies 冰），不用「滿月」「新月」：避開瑟蕾戰鬥量表的上弦／滿月／下弦／新月（`data/text.zh-TW.ts:210`），也避開帳本 I-201（第 5 片之前不說新月）。圖鑑：第一句只寫「它在明與蝕之間換來換去」；第二句 `seen: ['mem:selene:2']`：滿月照出一個明亮的結局；第三句 `seen: ['mem:selene:3']`：她說過結局不只一種。不寫新月是什麼。
    - 靜鐘會：新條目 **I-222**「迷宮吞過追進來的巡守；圖鑑裡的是他們的殘影」。巡守的圖鑑第二句 `seen: ['act3']`，可以寫「靜鐘會的巡守」；永遠不寫凜、鐘守（＝凜的師父，I-10、I-167）、殺人的任務、「從深處走出來的人」。
    - `vault-mimic` 第二句改 `mem:liz:4`（寶庫的門）；`debt-collector` 改名「敲門的影子」，招牌素材「泛黃的紙條」，第二句 `mem:liz:2` 才寫債。任何地方都不寫道具店、露米亞、歐里克。
    - `keeper-echo`：第二句 `seen: ['act4']`（可以寫「守燈人」）；第三句 `seen: ['mem:hero:9']`，寫「每一道影子走路的樣子都一樣」，不寫成第 10 片「每一次，都是一個人做的」的回聲；永遠不寫劍、燈鑰。
    - 燈喰的子嗣：新條目 **I-223**「燈喰之獸與牠的幼體、鬚、巢，都是燈喰之母的子嗣」；圖鑑第二句 `seen: ['finale']`。寫入前先讀終幕與 `mem:hero:10`，有任何矛盾就 NEEDS_CONTEXT。
    - 絲嘉蕾：公主的下落照 I-211，圖鑑不寫；「撤退」「號角是撤退的」在 `mem:scarlet:5` 之前任何地方都不寫。
    - 新名詞「霧生迴響」「守關者」「銘文」「遺物」登記 **I-224**。
    - 圖鑑文字是手冊類文字：**一個「……」都不用**（聖經 §2.3）；沒有英文字母與阿拉伯數字；全形標點；每句 ≤ 60 字；語氣是日系 RPG 的圖鑑：輕快、具體、帶一點梗；沉重留給夥伴那一句，而且只寫「她記得的那個人不在這裡」這種程度。
21. **美術核准**：照 `contract.md:145` 與 5d 補遺 S4，**每一批都要使用者在審核頁核准**（`approve --by "<使用者原話> <YYYY-MM-DD>"`）；獨立代理的視覺檢查是送審前的前置步驟。R0 是新的風格樣本（敵人圖在 5d 之外，`style_approved` 只蓋裝備）：registry 根部新增 `roster_style_approved`、`roster_style_anchor`，只有 R0 的 `approve` 成功時寫入；`gen --batch r1..r4` 沒有它就拒絕。圖示與專屬獨特沿用 5d 的風格錨點（`sheet-gear-1`）與 5d 已核准的素材圖示當參考。
22. **遺忘的圖示**：`forget` 的 14px 異常小圖示跟 E1 一起生成、審核、發布（G4 的小圖示工具）。B9 實作遺忘時，`AILMENT_ICON_IDS`（`render/artPaths.ts:27`）**不加** `forget`；異常列沒有圖示時照既有的文字顯示（B9 先確認退回文字的路徑存在，沒有就在 B9 補上文字退回，不畫任何圖）。E1 發布時才把 `forget` 加進 `AILMENT_ICON_IDS`。
23. **圖示尺寸**：照 5d 的實際產出（`icon-blaze-core` 33×35），QA 用 `--height 32`、方框 ≤ 36×36；`contract.md` 的「24×24 方框」在 D1 改成和 5d 實際一致的寫法（只改文字，附 5d 的量測）。
24. **生成**：一律 `codex_still.py generate`（`contract.md:6`）。codex 不能生圖時照使用者既有規則暫停回報，由控制者決定是否臨時改用 `--backend gemini`；工具不自動切換。

## 待使用者決定（只有美術與大取捨）

1. **美術要你核准五次**：契約規定每一批都要你在審核頁核准（R0 風格樣本 5 隻＋1 張圖示表＋1 張裝備表；R1 13 隻；R2 27 隻；R3 28 隻；R4 27 隻）。如果你願意只看 R0 的風格、之後交給機械 QA＋獨立代理審核就發布，要改 `contract.md:145`；不改的話計畫照現狀走。
2. **生成量**：至少 120 張 codex 圖（R0 每隻至少 2 版；每個 id 最多 3 次），Plus 有額度上限。照計畫分四批、每批之間有你的核准，額度用完就暫停等待，不換工具。若你想縮小規模（例如先只做本道 47 隻、地區 53 隻延後），告訴控制者，L3、L4 與 E3、E4 可以整段延後，前面不受影響。

## 分期與 PR

| PR | 分支 | 內容 | 任務 | 普通帶報告 | 美術 |
|---|---|---|---|---|---|
| **A** 骨架 | `feat/starlantern-roster-a` | 開關、100 個定義、98 個素材、39 件專屬獨特、遇敵表、`bossFor`、守關者位置、資料測試、帳本 I-222–I-224 | A0–A5（6） | identical | 0 |
| **B1** 引擎一 | `feat/starlantern-roster-b1` | `meetEnemy`、戰場加入敵人、M1–M4、M10、M11、M13、M14、M19、M20、M22、M24、守關者戰、`bossFor` 接進遊戲、戰鬥畫面 | B0–B6（7） | identical | 0 |
| **B2** 引擎二 | `feat/starlantern-roster-b2` | M5–M9、M15–M18、M21、M23、M25–M28、深層特性、第 22 項 | B7–B12（6） | identical | 0 |
| **C** 掉落與圖鑑 | `feat/starlantern-roster-c` | `trophyRng`、銘文、專屬獨特替換、鍛造屋、圖鑑狀態與頁面、文字註冊表 | C0–C6（7） | identical | 0 |
| **D** 美術工具 | `feat/starlantern-roster-d` | `roster_art.py`、QA、審核頁、發布 | D1–D4（4） | 不跑（不碰 engine） | 0 |
| **E1** 美術一 | `feat/starlantern-roster-art1` | R0（風格）＋R1 | E1a–E1c（3） | identical | 18 敵人＋18 圖示＋5 件專屬（10 張）＋1 個異常圖示 = **47 個網址** |
| **L1** 上線一 | `feat/starlantern-roster-live1` | 本道 B、C 帶 12 種＋拾憶鼠、頭目 3、守關者 2；圖鑑文字；凜、瑟蕾的遺物 | L1a–L1c（3） | **重錄** | 0 |
| **E2** 美術二 | `feat/starlantern-roster-art2` | R2 | E2a–E2b（2） | identical | 27＋26＋10 件（20 張）= **73** |
| **L2** 上線二 | `feat/starlantern-roster-live2` | 本道 D、E、F 帶 15 種＋金箔拾憶鼠、頭目 7＋執政像之手、守關者 3、深層特性、燈喰之母；波比的遺物 | L2a–L2d（4） | **重錄** | 0 |
| **E3** 美術三 | `feat/starlantern-roster-art3` | R3 | E3a–E3b（2） | identical | 28＋27＋12 件（24 張）= **79** |
| **L3** 上線三 | `feat/starlantern-roster-live3` | 熾焰、霜凍、雷鳴；莎菲拉、千鶴、諾艾兒的遺物 | L3a–L3c（3） | **重錄** | 0 |
| **E4** 美術四 | `feat/starlantern-roster-art4` | R4 | E4a–E4b（2） | identical | 27＋27＋12 件（24 張）= **78** |
| **L4** 上線四與收尾 | `feat/starlantern-roster-live4` | 腐毒、暗影、鋼鐵；希爾薇、莉茲、絲嘉蕾的遺物；全套收尾 | L4a–L4d（4） | **重錄** | 0 |

合計 13 個 PR、53 個任務。`allArtUrls()` 從 722 到 999（+277）；每次發布以當下實際值＋該批件數重算（5d 補遺 S8）。codex 生成至少 120 張：E1 26（R0 的 5 隻各 2 版＋R1 的 13 隻＋1 圖示表＋1 裝備表＋1 異常圖示）、E2 31、E3 32、E4 31。

E 與 L 的對應（敵人清單以 spec §13.5 的輪次為準，`roster_art.py plan-json` 產生精確清單）：

| 批 | 敵人 | 招牌素材／戰利品圖示 | 專屬獨特 |
|---|---|---|---|
| E1（R0） | `paper-moth`、`root-hound`、`bell-watcher`、`false-moon`、`fog-warden` | 5 | `moonless-mirror`、`fog-halberd` |
| E1（R1） | `lamp-wight`、`tin-soldier`、`dust-mimic`、`market-ghost`、`tongueless-bell`、`hollow-hunter`、`mist-twin`、`moon-crow`、`sleepwalker`、`hoarder`、`silent-bell`、`hollow-champion`、`bell-warden` | 13 | `silent-chime`、`borrowed-blade`、`unrung-clapper` |
| E2（R2） | D 帶 6、E 帶 5、F 帶 4、`gilded-hoarder`、第 20–50 層頭目 7、`archon-hand`、`toppled-automaton`、`requiem-conductor`、`lantern-brood` | 26 | 10 |
| E3（R3） | 熾焰、霜凍、雷鳴原生 15、頭目 9、`mirage-lead`、`ice-shrine`、`burning-page`、`rime-pillar` | 27 | 12 |
| E4（R4） | 腐毒、暗影、鋼鐵原生 15、頭目 9、`grey-elder`、`locked-vault`、`gate-breaker` | 27 | 12 |

---

## Global Constraints

**使用者的方向（最高依據）**
- 「怪物的種類目前也太少」「頭目肯定也是要夠多的，每種怪物要有不同的掉落物和特性，某些怪物最好還可以跟故事本身結合」。
- 只有畫風與重大取捨找使用者；技術規格、數值、劇情由控制者決定。美術每一批照契約給使用者核准（裁定 21）。
- 日系 RPG 的輕快、有梗；沉重留給回憶；「……」少用（圖鑑一個都不用）。

**分支與基準**
- 計畫與 spec 定案在 `feat/starlantern-roster`（本 commit）。每個 PR 的實作分支從開工時的 `origin/master` 開出，先 cherry-pick 本計畫的 commit（若還沒合併）。
- 開工前 `git status` 乾淨；要改的檔案有別人未提交的修改，NEEDS_CONTEXT。

**模擬閘門**（每一個碰到 `engine/`、`data/` 的任務都跑；每個 PR 的第一個任務錄 `gate-0`）
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`。
- 一般任務：最後一行必須是 `gate: identical`。
- 每一個任務：`cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
- `engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`；本計畫不錄新的 `contribution.*.160.json`。
- 不用 `Math.random`、不讀 `Date`；不為舊內容多抽任何既有串流。

**重錄規則**（只限 L1b、L2b、L2c、L3b、L4b）
1. 切換之前先跑一次閘門，必須 identical（證明切換前的樹是乾淨的）。
2. 切換之後跑閘門存成 `gate-L<n>`：vitest 必須全綠（門檻一個都沒放寬），最後一行預期是 `gate: DIFFERENT`。
3. `contribution.json` 仍然和 8d-final 逐位元相同（裁定 7）；不同就 BLOCKED。
4. 寫 SDD `rebaseline-L<n>.md`：`report.txt` 的完整差異（舊行→新行）；每個改變的平衡項目前後的數字與門檻；改變的動作雜湊檔與它們的格子名；**確認第 1–3 層的每一行都沒變**（用 `grep` 列出 depth ≤ 3 的行並 `diff`，結果附上）；`git diff --name-only` 證明凍結檔沒改。
5. 選擇性執行的帶在同一個任務裡跑，**每一波都跑**（它們也讀現行的 `encounterTable`：`engine/buildBands.ts:82`、`engine/balance.bond.test.ts:82`、`:126`，不可以拖到收尾才發現）：`ROSTER_BANDS=1` 的第 22 項、`BANDS=1` 的 `tierBands.*`（含 22j）、`npm run test:starlantern:bands`（`builds.bands.*`）、`BOND_BANDS=1`（含 `BANDS=1` 的 21e）的第 21 項；`engine/__fixtures__/tiers/baseline.normal.txt` 照難度計畫 Task 0 的方式重錄，差異附進同一份 md。這些檔案是凍結的：紅了只能照第 7 點調新物種。
6. 審查：控制者派一位全新脈絡的審查者（Opus），只給兩份 `report.txt`、`rebaseline-L<n>.md` 與 `git diff`；他確認 (a) 第 1–3 層沒有任何一行變、(b) 每一個改變的行都在原門檻內、(c) 凍結檔、`TIERS`、`AFFIXES`、既有旋鈕沒有 diff、(d) 動作雜湊改變的格子都含新上線的 id。通過才 commit；之後同一個 PR 的任務改以 `gate-L<n>` 為比較基準。
7. 紅燈時只能：調**新物種自己**的數字（spec §5.1 的 ±15% 形狀、技能機率、召喚次數）、或從表裡拿掉某一組；四輪還紅就 BLOCKED，附每一輪的表。

**測試與檢查**
- **TDD**：先寫失敗的測試，確認它因正確的理由失敗，再實作。寫作任務照 W 步驟。美術任務照工具測試先行（`test_roster_art.py`、`test_sl_art.py`），生成與審核照契約。
- **vitest**：單檔 `rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套 `rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- **第 22 項**：`engine/balance.roster.test.ts` 整檔 `describe.skipIf(process.env.ROSTER_BANDS !== '1')`；跑法 `ROSTER_BANDS=1 BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.roster.test.ts --testTimeout=300000`。22j：`BANDS=1 BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/tierBands.roster.test.ts --testTimeout=3000000`。報告行用 `[roster]`、`[roster-tier]` 開頭（sim gate 的 grep 不收）。
- **tsc**：`rtk proxy npx tsc --noEmit -p .`。`src/scripts/games/starlantern/` 與 `tests/e2e/starlantern*.ts` 底下 0 個；全 repo 總數不多於 773（每個 PR 的 `baseline.md` 記下實際值）。
- **e2e**：`E2E_PORT=4353 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium --project=chromium-dpr125 --project=chromium-dpr150`。一律 headless、靜音（spec 已帶 `--mute-audio`，不可以拿掉）。**絕不用 4354**；不結束任何程序。**不用 Playwright MCP 或任何瀏覽器 MCP 工具**（`mcp__plugin_playwright_*`、Claude in Chrome、內建瀏覽器、computer-use）。
- **Python**：`rtk proxy python -m pytest art-factory/starlantern/tools -q`（輕量，Windows 上跑）。
- **重的工作**（閘門、e2e、全套、平衡帶、生成）之前：照控制者當時指定的 `heavy.lock` 規則（檔案已存在就等，絕不結束程序）；沒有指定時 PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` ≥ 6291456（KB），一次只跑一套重的工作。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：每個任務的 Files 列出已知會紅的既有測試與改法；不放寬門檻、不刪斷言、不加 `skip`／`only`／`todo`／`it.fails`；全套出現沒列到的紅燈就 NEEDS_CONTEXT。

**決定性**
- 機制的每一個決定（召喚、輪替、逃走、標記誰、吞誰、站起）都是純函式，不抽亂數；戰鬥中的命中、暴擊、異常照用戰鬥的 rng。
- 新敵人參戰的戰鬥，抽取序列和舊戰鬥不同是預期的（新內容）；**舊組的戰鬥逐位元相同**由閘門保證。
- 召喚、幻影、逃走的敵人：沒有 exp、gold、素材、`lootRng`、`runeRng`。

**存檔**：新欄位全部可選（`GameState.bestiary?`、`ItemInstance.inscription?`）；`SAVE_VERSION` 維持 9；不寫遷移。

**平衡（凍結）**
- `balance.test.ts`、`balance.lineups.test.ts`、`balance.deep.test.ts`、`balance.pace.test.ts`、`balance.bond.test.ts`、`builds.bands.*.test.ts`、`tierBands.{baseline,nightmare,hell}.test.ts`、`tierBands.ts`、`buildBands.ts` 一個字都不改（L 任務重錄的 `baseline.normal.txt` 是資料，不是程式）。
- `ENEMY_POWER`、`DEEP_ENEMIES`、`PARTY_SCALE`、`BOSS_PARTY_SCALE`、`GROUP_CAP`、`ELITE`、`ELITE_REWARD`、`AFFIX_SCALE`、`GEAR_CHANCE`、`BOSS_LEGENDARY`、`REGION_DROP_CHANCE`、`TIERS`、難度 `AFFIXES`、`BOND_*`：一律不動。

**文字**
- 怪物、素材、裝備的名字在 `data/*.roster.ts`；圖鑑、專屬獨特以外的介面字串與圖鑑文字在 `data/bestiary.zh-TW.ts`；戰鬥的意圖、名牌、紀錄字串在 `data/text.zh-TW.ts`（先 grep 確認不撞名）；遺物的送禮反應在 `data/bond.zh-TW.ts`。
- 「菁英」不寫成「精英」（`data/terms.test.ts:96-100`）。
- 每一個新字都要在 Cubic 11 裡（`data/glyphs.test.ts`；A2 確認它掃得到新檔，掃不到就把新檔加進它的清單）。
- 字級只有 12／24px（`ui2/typeScale.test.ts`）；新介面只用既有元件（`MenuView`、手冊清單、`confirmBox`、`win`、鍛造屋的分頁）；SCSS 只改 `src/styles/_starlantern-ui.scss`，禁 `!important`、行內樣式、`element.style`。

**換行**（改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat` 必須等於 `git diff --stat --ignore-cr-at-eol`；整檔被改寫就是換行壞了，立刻再改一次修回；CRLF 與混用檔不可以用 `sed -i`；新檔一律 LF。2026-10-26 量到的：）
- LF：`data/{gear,materials}.ts`、`data/story/bond.ts`、`engine/{scaling,scaling.test,events,parity,bands,sim.test,tierBands.test}.ts`、`render/ailmentStyle.ts`、`engine/dungeon/run.ts`、`engine/loot/drops.ts`、`engine/forge/*.ts`、`engine/story/handbook.ts`、`ui2/scenes/{forge,handbook}.ts`、`docs/superpowers/**/*.md`。
- CRLF：`data/enemies.ts`、`data/data.test.ts`、`engine/{types,state,sim,testing,battle.test,game.test}.ts`、`render/artPaths.ts`、`render/artPaths.test.ts`、`art-factory/starlantern/registry.json`。
- 混用（新行照相鄰行）：`data/text.zh-TW.ts`、`engine/{battle,combatant,skills,game,save}.ts`、`render/BattleView.ts`、`ui2/partyBar.ts`、`ui2/scenes/battle.ts`。
- 上面沒列到的檔，動手前一律先 `git ls-files --eol` 量。
- 新檔（LF）：本計畫新增的所有檔案。

**git**
- 用完整路徑 add，不可以 `git add -A`／`git add .`。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不可以 `git checkout -- <path>`、`restore`、`reset`、`stash`、`clean`；要撤回就再改一次檔案。不 push（控制者在驗收後決定）。不碰 `.env`、智能合約、部署腳本。

**收尾 G（每個任務）**
1. 全套全綠；tsc 符合上面的條件。
2. 碰到 `engine/`、`data/` 時跑閘門（`gate-<N>`）與 `cmp`。
3. 動到 `ui2/`、`render/`、`src/styles/`、`tests/e2e/` 時，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現時（先 grep），跑 e2e 三個專案並全綠。
4. 換行檢查（`git diff --stat` 兩種寫法相同）。
5. 報告：新增與修改的測試名；全套兩行、tsc 數字、閘門與 e2e 結果（沒跑寫理由）；改了哪些既有斷言；偏離本計畫的地方與理由。

**子代理**：實作者不派子代理。冷讀、審查、美術的視覺檢查由控制者另派全新脈絡的代理，模型 Opus；子代理一律不准用瀏覽器 MCP。

## 寫作任務的固定步驟（L1a、L2a、L3a、L4a 的 W1–W7）

- [ ] **W1 紅**：在 `data/bestiary.test.ts` 寫本批的註冊釘子（這批每一個 id 都有 `BESTIARY[id]`，它的每一句都過守門）；遺物的反應句加進 `data/bond.test.ts` 的期待；跑 `data/bestiary.test.ts`、`data/bond.test.ts`、`data/terms.test.ts`、`data/glyphs.test.ts`；失敗清單存成 SDD `task-<N>-red.txt`。
- [ ] **W2 讀**：帳本 §3 與本批相關的 I 條目、聖經 §1、§2.3–§2.5、§3（遺物那位夥伴的聲音）、spec §4.2 與裁定 20；本批每一隻的 spec §5 列（特性、掉落）。
- [ ] **W3 寫**：每一隻：`trait`（特性一句，見過就顯示，寫打法不寫數字：「先打旗手，牠活著的時候大家都比較兇。」）；`lines[0]`（擊倒過才顯示的介紹）；故事物種的 `lines[1]`、`lines[2]` 帶 `after: StoryGate`（裁定 20 的閘門）。人的殘影那一句只寫到「她記得的那個人不在這裡」的程度。專屬獨特的 `lore` 一句（獲得時顯示，不得含揭露詞）。遺物的婉拒、痊癒各一句，照她的聲音表。帳本的新條目在同一個 commit 加。
- [ ] **W4 守門**：名字、`trait`、沒有閘門的句子都過檢查詞掃描；有檢查詞的句子必須有不早於該詞揭露點的閘門（`data/bestiary.test.ts` 的 `every gated word waits for its reveal`）。
- [ ] **W5 綠**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern` 全綠，然後做收尾 G。
- [ ] **W6 朗讀稿**：`BESTIARY_DUMP=<SDD>/task-<N>-after.md rtk proxy npx vitest run src/scripts/games/starlantern/data/bestiary.test.ts`（C5 加的匯出：每一隻的名字、特性、每一句與它的閘門）。
- [ ] **W7 冷讀**：控制者派一位沒讀過設計文件的全新讀者，只給朗讀稿。及格：讀得出每一隻怎麼打；語氣是輕快的日系圖鑑，有梗但不油；人的殘影讀起來是「記憶的形狀」，不是反派；沒有一句讓他出戲；全篇沒有「……」。不及格回到 W3。

## Review Focus

1. **沒上線就看不到**：`ROSTER_LIVE` 為空時，遇敵表、頭目、地圖、手冊、`allArtUrls`、模擬全部和今天相同。→ A1、A4 的 nothing-live 測試；每個 PR 的閘門。
2. **舊戰鬥逐位元相同**：閘門 identical；`contribution.json` 永遠等於 8d-final。→ 每個任務。
3. **不從舊串流多抽**：`trophy draws never move a lootRng draw`、`placing a warden moves nothing else on the floor`、`a summon or a fled foe takes no loot or rune draw`。→ A4、B4、C1、C2。
4. **機制看得懂、不形成必帶隊伍**：每個機制都在意圖、名牌或紀錄上；守護與部件只擋單體；遺忘、遲滯、吞入都不讓我方失去整回合。→ B 系列的畫面測試、22d、22f。
5. **掉落總量不變**：銘文不加條數與範圍；專屬獨特只替換、不增加特殊裝備的出現率（10 萬次統計）；製作要先擊倒過。→ C1、C2、C4。
6. **送禮速度不變**：沒有新的「最愛」「喜歡」；戰利品不可送；遺物集滿碎片才收下。→ A3、L 的寫作任務。
7. **不劇透**：名字、特性、無閘門的句子沒有檢查詞；有檢查詞的句子閘門不早於揭露點。→ A5、C5、W4。
8. **美術只發布核准的**：`ROSTER_ART` 的每個 id 的敵人圖、圖示、專屬獨特圖都是 `published`；`ROSTER_LIVE ⊆ ROSTER_ART`；runtime 路徑沒有被淘汰的圖。→ D4、E 系列。

---

## 檔案結構

**新增**：`data/monsters.ts`、`data/monsters.test.ts`、`data/enemies.roster.ts`、`data/materials.roster.ts`、`data/gear.roster.ts`、`data/bestiary.zh-TW.ts`、`data/bestiary.test.ts`、`engine/foes.ts`、`engine/foes.test.ts`、`engine/bestiary.ts`、`engine/bestiary.test.ts`、`engine/balance.roster.test.ts`、`engine/tierBands.roster.test.ts`、`engine/__fixtures__/roster/floors.before.json`、`art-factory/starlantern/tools/{roster_art,review_roster,test_roster_art}.py`。

**修改**：
- 資料：`data/enemies.ts`（合併）、`data/materials.ts`（合併）、`data/gear.ts`（合併、`owner`、池子排除）、`data/story/bond.ts`（`GIFT_KINDS`、遺物的口味）、`data/bond.zh-TW.ts`（遺物反應句）、`data/text.zh-TW.ts`、`data/forge.ts`（銘刻、製作的常數）。
- 引擎：`engine/types.ts`、`engine/scaling.ts`、`engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`、`engine/ailments.ts`、`engine/game.ts`、`engine/state.ts`、`engine/save.ts`、`engine/parity.ts`（只改一個呼叫）、`engine/dungeon/{run,rooms}.ts`、`engine/loot/{drops,item}.ts`、`engine/forge/{craft,forge,uses}.ts`、`engine/story/handbook.ts`、`engine/mechanics/index.ts`（`foeWords`）、`engine/sim.ts`（只加選用參數）、`engine/bands.ts`。
- 介面：`render/BattleView.ts`、`render/artPaths.ts`、`ui2/scenes/{battle,handbook,forge,forgeCraft}.ts`、`src/styles/_starlantern-ui.scss`。
- 美術：`art-factory/starlantern/{contract.md,registry.json}`、`tools/sl_art.py`、`tools/test_sl_art.py`、`public/assets/games/starlantern/{enemy,icon,gear}/`、manifest。
- 文件：帳本（I-222 起）、spec §0。
- e2e：`tests/e2e/starlantern.spec.ts`（L1c 起）。
- **不改**：凍結的平衡檔、`data/story.zh-TW.ts`、`data/story/scenes.ts`（`FINALE_BOSS` 除外，L2c）、`data/story/story.test.ts`、`engine/parity.test.ts`、`engine/__fixtures__/sim-gate/`。

---

# PR A：骨架（資料與開關）

### Task A0：基準與地圖快照

**Files:**
- SDD `A/baseline.md`。
- Create：`engine/__fixtures__/roster/floors.before.json`、`engine/floors.snapshot.test.ts`。

- [ ] **Step 1**：`git status` 乾淨；`baseline.md` 記下 `git rev-parse HEAD`、tsc 總數與 starlantern 底下的數字、全套兩行、`allArtUrls().length`（預期 722）、`NORMAL_ENEMIES.length`（8）、`Object.keys(MATERIALS).length`（22）、`Object.keys(SPECIALS).length`（44）、`GIFTABLE.length`（18）。
- [ ] **Step 2：地圖快照**。新檔 `engine/floors.snapshot.test.ts`：種子 1、2、3 × 七個區域 × 深度 1–40，`newRun(seed, region, 'plain', 1)` 後 `floorOf(run, d)` 的 `{ tiles, contents }`；`FLOORS_RECORD=1` 時寫 fixture，否則讀它 `toEqual`；fixture 不存在時失敗（不是略過）。測試名 `the floors as they were before the roster`。錄：`FLOORS_RECORD=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/floors.snapshot.test.ts`；驗：不帶變數再跑一次必須綠。本計畫任何任務都不可以重錄它（A4 起它守住「守關者不動其他東西」）。
- [ ] **Step 3**：閘門錄 `gate-0`（`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-0 <SDD>/gate-0`，第一次對自己比；之後的任務對它比），`cmp` 必須沒有輸出。
- [ ] **Step 4**：e2e 三個專案各跑一次，通過數記進 `baseline.md`。
- [ ] **Step 5**：commit 快照測試與 fixture：`test(starlantern): snapshot every floor before the roster`。

### Task A1：開關、清單與舊表

**Files:**
- Create：`data/monsters.ts`、`data/monsters.test.ts`。
- Modify：`engine/scaling.ts`（`legacyEncounterTable`；`encounterTable` 暫時就是它；`NORMAL_ENEMIES` 照裁定 3：`listedEnemy && !boss && !story && !rank`）、`engine/parity.ts:65`（改呼叫 `legacyEncounterTable`）、`engine/story/handbook.ts:121`（`listedEnemy`）、`render/artPaths.ts:230`（`artEnemy`）。
- Test：`data/monsters.test.ts`、`engine/scaling.test.ts`（新增）、`engine/story/handbook.test.ts`、`render/artPaths.test.ts`。
- 已知會紅：預期沒有（清單內容不變）。

**Interfaces:**
- `data/monsters.ts`：`LEGACY_ENEMY_IDS`（今天的 10 個，字面值）、`ROSTER_ART`、`ROSTER_LIVE`（空的 `ReadonlySet<string>`，附 spec §11.1 的註解）、`listedEnemy(id)`、`artEnemy(id)`、`liveRosterIds()`。
- `engine/scaling.ts`：`legacyEncounterTable(region, depth)`（今天 `encounterTable` 的內容原封不動）。

- [ ] **Step 1：寫失敗的測試**
  - `data/monsters.test.ts`：`the live set is inside the art set`；`legacy ids are listed and drawn`（10 個都 `listedEnemy`、`artEnemy`）；`nothing new is listed while nothing is live`。
  - `engine/scaling.test.ts`：`the legacy table is the table`（7 區 × 深度 1–60，`encounterTable` 等於 `legacyEncounterTable`）。
  - `engine/parity` 不加測試：閘門的 `cmp` 就是它的測試。
- [ ] **Step 2**：執行，確認紅（模組不存在）。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門 identical、`cmp` 無輸出。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): roster switches, and parity keeps to the legacy tables`。

### Task A2：一百個敵人定義

**Files:**
- Create：`data/enemies.roster.ts`。
- Modify：`engine/types.ts`（`EnemyDef` 加 `rank?: 'warden' | 'part'`、`lore?: CharacterId`、`remnant?: true`、`band?: 'B' | 'C' | 'D' | 'E' | 'F'`、`home?: RegionId`、`inscribe?: AnyStat`）、`data/enemies.ts`（`ENEMIES` 合併 `ROSTER_ENEMIES`；舊的 `LIST` 不動）。
- Test：`data/monsters.test.ts`、`data/data.test.ts`、`engine/scaling.test.ts`、`engine/story/handbook.test.ts`、`render/artPaths.test.ts`、`render/BattleView.test.ts`。
- 已知會紅與改法（意圖不變）：
  - `data/data.test.ts:31-33`（8 個非頭目、頭目只有 `lanterneater`）→ 只數 `LEGACY_ENEMY_IDS`（名冊的數量由 `one hundred new ids` 量）；
  - `engine/scaling.test.ts:460-468`（所有 `ENEMIES` 的 `scaleEnemy` 結果的 SHA-256 釘子）→ 只走 `LEGACY_ENEMY_IDS`，雜湊值不變；名冊的 `tier null` 等式另外寫一個不釘雜湊的迴圈；
  - `data/data.test.ts:95-97`「每個非頭目、非劇情的敵人都在某張表裡」→ 只看 `NORMAL_ENEMIES`（裁定 3 的定義）；A4 起改讀「舊表 ∪ `MAINLINE_TABLES` ∪ `NATIVE_GROUPS` ∪ `WARDEN_GROUPS`」，名冊物種另由 A4 的 `every roster species sits in at least two groups` 量。
  - `render/artPaths.test.ts:62`、`:235` → 只看 `artEnemy` 的 id。
  - `engine/story/handbook.test.ts:178` → 只看 `listedEnemy`。
- Read：spec §5.1–§5.6、裁定 6、11。

- [ ] **Step 1：寫失敗的測試**（`data/monsters.test.ts`）：
  - `one hundred new ids, none old`：59 一般（29 本道、30 地區）、11 守關者、28 頭目、2 部件；和舊 id 不重複。
  - `archetypes hold their shape`：每一隻的 `stats` 在 spec §5.1 原型的 ±15% 內（表寫在測試裡，標出例外：`archon-hand` 260、`rime-pillar` 240、`lantern-mother` 等於 `lanterneater`）；頭目 `boss: true`、守關者 `rank: 'warden'`、部件 `rank: 'part'`；一般與守關者 `floor: 3`。
  - `lantern-mother is the lantern-eater in another shape`：`stats`、`skills`、`weak`、`resist`、`exp`、`gold` 逐欄相等。
  - `only plain effects so far`：每個技能只用 spec §1.4 的效果種類（`damage`、`inflict` 的 `poison`／`sleep`、`buff`、`heal`）；機制欄位在 B 系列才加。
  - `drops` 在本任務一律是空陣列：`data/data.test.ts:83` 要求每個掉落素材都存在，素材在 A3 才有；A3 補上掉落與它的測試。
  - `remnants and lore are as ruled`：`remnant` 恰好是裁定 6 的 13 個；`lore` 是 spec §4.2 的故事物種，值是對的夥伴。
  - `every normal species carries its inscription key`：59 個一般物種的 `inscribe` 逐一等於 spec §5.3、§5.4 的「銘文」欄，而且是裝備 `AFFIXES`（`data/gear.ts:34`）的鍵；守關者、頭目、部件沒有。
  - `no element wall per band`：A4 量（要表）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作 `data/enemies.roster.ts`：照 spec §5.3–§5.6 的表、裁定 20 的改名；**機制先不寫**，表裡的「特性」先寫成最接近的 D 技能或省略（B 系列逐一補上，B11 有 `every trait is implemented` 測試）。故事物種的 `weak`／`resist` 照表；地區原生寫該地區的（`scaleEnemy` 本來就會蓋掉）。
- [ ] **Step 4**：`render/BattleView.test.ts:805-808`（最長的名字與技能名的標籤寬度）、`data/glyphs.test.ts`、`data/terms.test.ts` 必須綠。名字過不了就縮短（保持 spec 的意思），改動列進報告；確認 `glyphs.test.ts` 掃到 `data/enemies.roster.ts`，掃不到就加進它的清單。
- [ ] **Step 5**：全套、tsc、閘門 identical（沒有任何清單看得到新 id）。
- [ ] **Step 6**：收尾 G，commit：`feat(starlantern): one hundred foes defined, none of them met yet`。

### Task A3：素材、戰利品、遺物與專屬獨特

**Files:**
- Create：`data/materials.roster.ts`、`data/gear.roster.ts`。
- Modify：`data/enemies.roster.ts`（補上 `drops`：招牌素材、既有稀有素材、戰利品或遺物）、`engine/types.ts`（`MaterialKind` 加 `'trophy' | 'keepsake'`；`MaterialDef.owner?: string`）、`data/materials.ts`（合併）、`data/gear.ts`（`SpecialDef.owner?`；`SPECIALS` 合併；`regionSpecials` 與 `SPECIAL_LIST` 的池子排除 `owner`）、`engine/loot/drops.ts`（`pickSpecial` 只從沒有 `owner` 的挑：寫成明確的過濾，即使今天它們沒有 `region` 也一樣）、`engine/forge/uses.ts`（`monster` 名冊素材的用途「銘刻」，`trophy`／`keepsake` 的用途「製作〇〇」；資料而已，鍛造動作在 C3）、`data/story/bond.ts`（`GIFT_KINDS` 加 `'keepsake'`）、`render/artPaths.ts:239`、`:248`（`artMaterial`、`artSpecial`）、`data/monsters.ts`（`ownerOf`、`artMaterial`、`artSpecial`）。
- Test：`data/monsters.test.ts`、`data/data.test.ts`、`data/gear.test.ts`、`engine/forge/uses.test.ts`、`engine/loot/drops.test.ts`、`data/story/bond.test.ts`、`render/artPaths.test.ts`。
- 已知會紅與改法：
  - `data/data.test.ts:35`（22 種）→ 舊 22 種仍在＋名冊 98 種；
  - `render/artPaths.test.ts:84-86`（每個素材都有圖示）→ 只看 `artMaterial`；`:65-69`（每件特殊都有小大圖）→ 只看 `artSpecial`；
  - `data/story/bond.test.ts:15-23`（`EIGHTEEN`）→ 裁定 13 的寫法；
  - `engine/loot/item.test.ts:53`、`:76`、`:257`、`engine/loot/drops.test.ts:399`、`data/gear.test.ts:129`、`engine/forge/forge.test.ts:506`、`engine/forge/craft.test.ts:207` 走全部 `SPECIALS`：名冊獨特本來就要過這些（合法的固定詞綴、能擲出），預期綠；紅了就是資料錯，改資料。
- Read：spec §5.3–§5.6 的素材與獨特欄、§7.1、裁定 12–14。

- [ ] **Step 1：寫失敗的測試**
  - `data/monsters.test.ts`：`ninety-eight new materials`（59 `monster`、30 `trophy`、9 `keepsake`，`owner` 各指向唯一的敵人）；`every boss and warden pays one trophy or keepsake`（`drops` 有一條 chance 1）；`every normal species pays its signature`（0.35–0.5）；`prices follow the band`（B 20、C 30、D 40、E 50、F 60；地區原生依它最早出現的帶；戰利品與遺物 120（守關者）／200（頭目））；`thirty-nine own uniques`（每個頭目與守關者一件、`owner` 對、`region: null`、`rarity: 'unique'`、`fixed` 三條且合法於欄位、武器有 `weaponKind`）；`own uniques never enter a drop pool`（`regionSpecials` 與 `pickSpecial` 的所有候選都沒有 `owner`）。
  - `engine/loot/drops.test.ts`：`pickSpecial draws as before`（固定種子 1–200、七個區域，結果和合併前逐一相同：Step 2 先用現在的程式錄字面值）。
  - `data/story/bond.test.ts`：`GIFTABLE is every monster, junk, rare, region and keepsake material`；`no trophy is giftable`；`the eighteen are still giftable`。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作；`data/gear.roster.ts` 的固定詞綴照 spec §5.5、§5.6（spec 已對照過欄位字母；不合法的照 spec §15 微調並列進報告）；`lore` 先寫一句不含檢查詞的中性介紹（W 任務會重寫）。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門 identical。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): roster materials, trophies, keepsakes and own uniques, out of every pool`。

### Task A4：遇敵表、`bossFor`、守關者的位置

**Files:**
- Modify：`data/monsters.ts`（`bandOf`、`MAINLINE_TABLES`、`NATIVE_GROUPS`、`MAINLINE_BOSSES`、`REGION_BOSSES`、`MAINLINE_WARDENS`、`REGION_WARDENS`、`WARDEN_GROUPS`、`bossFor`、`wardenFor`）、`engine/scaling.ts`（`encounterTable` 照 spec §8.1 的五步）、`engine/dungeon/run.ts`（`WARDEN_SALT`、`floorOf` 放守關者）、`engine/dungeon/rooms.ts`（`Content.kind` 加 `'warden'`；`warden?: string`）、`engine/types.ts`（如需要）。
- Test：`data/monsters.test.ts`、`engine/scaling.test.ts`、`engine/dungeon/run.test.ts`、`engine/floors.snapshot.test.ts`（只加測試，不重錄）。
- 已知會紅：預期沒有。

**Interfaces:**
- `bandOf(depth)`（spec §3.1）；`encounterTable(region, depth)`：`depth ≤ 3` → 舊表；否則 live 過濾，沒有新組 → 舊表；新組少於 6 → 舊表＋新組；其餘 → live 表。
- `bossFor(region, depth): string[]`（裁定 11；只處理 5 的倍數；呼叫端在 B5 接上）。
- `wardenFor(region, depth): string | null`（`d ≥ 8`、`d % 5 === 3`、不是頭目層；本道 `MAINLINE_WARDENS[((d − 8) / 5) % 5]`、地區 `REGION_WARDENS[r]`；沒上線回 `null`）。
- `WARDEN_SALT = 0x428a2f98`（`engine/dungeon/run.ts`，export）。

- [ ] **Step 1：寫失敗的測試**
  - `data/monsters.test.ts`（spec §3.4、§9.1 的資料檢查，量的是**完整**表，不看 live）：`every group has one to three`；`twelve groups a table`；`every roster species sits in at least two groups`；`pairs come in pairs`（`mist-twin`、`ice-komainu`）；`freshness`（本道任兩個相差 ≥ 6 層的深度 4–60，物種集合重疊 ≤ 60%）；`no species fills a table`（每張表至少 8 種、每種 ≤ 40% 的組）；`natives lead a region`（第 4 層起至少 4 種原生、原生組 ≥ 40%）；`no element wall`（spec §5.1：抗物理 ≤ 25%、任一屬性被抗 ≤ 1/3、沒有弱點 ≤ 20%）；`exp holds against the legacy tables`（7 區 × 深度 4–30，新表平均 `groupExp`（寶物怪算 0）÷ 舊表 ∈ [0.92, 1.08]）；`bosses never repeat`（本道 5–50 兩兩不同、每區 5／10／15 兩兩不同）；`bossFor and wardenFor tables`（逐格字面值，含多部位組與循環）；`salts are distinct`（`WARDEN_SALT` 和對照報告 §7.5 列出的全部鹽與常數都不同；`TROPHY_SALT` 在 C1 才存在，C1 補進同一個測試；寫法照 `engine/loot/runes.test.ts:45`）。
  - `engine/scaling.test.ts`：`the roster with nothing live changes nothing`（7 區 × 深度 1–60 的 `encounterTable` 等於 `legacyEncounterTable`；`bossFor` 全部 `['lanterneater']`；`wardenFor` 全部 `null`）。
  - `engine/floors.snapshot.test.ts`：`placing a warden moves nothing else on the floor`（用測試注入的 live 集合：`withRosterLive(ids, f)`，`engine/testing.ts` 新增，`finally` 還原；同一份 fixture，扣掉 `warden` 的內容、並把守關者那一格的 `tiles` 遮掉（`placeSpecial` 會改寫那一格，`engine/dungeon/rooms.ts:108`；fixture 裡那一格必須是空房的地板）之後逐格相同；`d % 5 === 3`、`d ≥ 8` 的層恰好多一個守關者格，地圖格是 `'warden'`）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。表的組照 spec §8.2、§8.3；`exp holds` 紅的時候只能調新物種自己的 `exp`（spec §5.1 的表是提案），列進報告。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門 identical。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): roster tables, bosses and warden rooms, all waiting on the live set`。

### Task A5：名字的劇透掃描與帳本

**Files:**
- Modify：`data/monsters.test.ts`、`docs/superpowers/story/starlantern-lore-ledger.md`（I-222、I-223、I-224，照裁定 20；寫 I-223 之前讀終幕與 `mem:hero:10`）。
- Read：帳本 §3（:98-114）、`data/story/story.test.ts:428`、`:455-471`、`:1009-1047`。

- [ ] **Step 1：寫失敗的測試**（`data/monsters.test.ts`）：`no name gives a secret away`：100 個敵人名、98 個素材名、39 件專屬獨特名，都不含 `靜鐘會`、`守燈人`、`燈鑰`、`代號`、`信物`、`刺客`、`派來殺`、`派去殺`、`去殺`、`要殺的人`、`艾斯特拉`、`燈喰之母`（`lantern-mother` 本身除外）、`撤退`、`歐里克`、`道具店`、`露米亞`、`債`、`新月`、`滿月`、`公主`、`祖先`（清單抄自帳本 §3 與 `story.test.ts` 的 `REVEALED`，每一個詞註明出處行號；帳本改了，這裡跟著改）。
- [ ] **Step 2**：執行；有紅就照裁定 20 改名（預期 A2 已經改好，綠也算通過）。
- [ ] **Step 3**：帳本新增 I-222–I-224；`rtk proxy npx vitest run src/scripts/games/starlantern/data/story` 全綠（帳本由故事測試讀的部分不受影響）。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): roster names keep every secret; ledger I-222 to I-224`。

**PR A 收尾**：控制者派全新脈絡的審查者看整個分支的 diff（重點：nothing-live、清單、池子排除、閘門）。

---

# PR B1：引擎一

### Task B0：基準

- [ ] 照 A0 的 Step 1、3、4 錄 SDD `B1/baseline.md` 與 `gate-0`（不錄新 fixture）。

### Task B1：`meetEnemy` 與戰鬥中加入敵人

**Files:**
- Modify：`engine/battle.ts`（從 `createBattle` 的迴圈（`:206-224`）抽出 `meetEnemy(s, id, opts)`；`Combatant.left?: true`；`checkOutcome` 把 `left` 當作不在場）、`engine/combatant.ts`（欄位）、`render/BattleView.ts`（`addFoe(c)`：加精靈並重排敵方的格子；`syncHp` 遇到未知鍵時呼叫 `addFoe`，不再忽略）、`engine/game.ts`（`battleGear`、`battleRunes`、`rewards` 跳過 `left` 與 `summoned`）。
- Test：`engine/battle.test.ts`、`render/BattleView.test.ts`、`engine/game.test.ts`。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**：`meetEnemy matches createBattle`（同一組、同一個 scale，逐欄相同）；`a foe that left is out of the fight and pays nothing`；`a summoned foe pays nothing and takes no loot or rune draw`（`lootDraws`、`runeDraws` 不變）；`BattleView adds a foe mid-fight and lays the row out again`。
- [ ] **Step 2**：紅。**Step 3**：實作（`createBattle` 改成呼叫 `meetEnemy`，鍵、A/B 名字尾碼、`enemyDefs` 的建立順序完全不變）。
- [ ] **Step 4**：測試、全套、tsc、閘門 identical、e2e。
- [ ] **Step 5**：收尾 G，commit：`refactor(starlantern): meet one foe at a time, and let the battle view take a late one`。

### Task B2：蓄力（M1）、守護（M2）、宣告（M24）

**Files:**
- Create：`engine/foes.ts`（敵方機制的純函式）、`engine/foes.test.ts`。
- Modify：`engine/types.ts`（`EnemySkill.windup?: string`；`Effect { kind: 'hunt' }`）、`engine/combatant.ts`（`winding?`、`hunted?`）、`engine/battle.ts`（`chooseEnemyActions`：蓄力中的敵人不抽、強制下一招；`intentLabel` 顯示「蓄力：〇〇」；敵方 `cover` 的鏡像版 `foeCover`：我方單體行動打向被守護的敵人時改打守護者；`hunt`：下一回合所有敵人的單體目標改成被宣告者，我方嘲諷優先、防禦會解除宣告）、`engine/skills.ts`（`cover` 的處理允許敵人施放在同伴身上）、`data/enemies.roster.ts`（用到這些機制的物種補上欄位）。
- Test：`engine/foes.test.ts`、`engine/battle.test.ts`。

- [ ] **Step 1：寫失敗的測試**（spec §6.2 的測試義務，名字照抄）：M1 `lands the round after its wind-up`、`sleep breaks a charge`、`freeze breaks a charge`、`shows in intentLabel`、`draws nothing while winding`（蓄力回合的 rng 抽取次數比不蓄力少的那一次正好是 `findIndex` 的那幾次）；M2 `takes single-target hits`、`area ignores a guard`、`ends after its turns`；M24 `focuses the hunted member`、`taunt overrides`、`defending lifts the hunt`。另：`old foes act as before`（舊 10 個定義的 `chooseEnemyActions` 在 200 個種子下逐一相同）。
- [ ] **Step 2–4**：紅、實作、測試＋全套＋tsc＋閘門 identical。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): foes wind up, guard each other and call out a target`。

### Task B3：逃走（M3）、偷竊（M13）、開場（M14）

**Files:**
- Modify：`engine/types.ts`（`EnemyDef.fleeAfter?`、`opener?`、`Effect { kind: 'steal'; perDepth }`）、`engine/combatant.ts`（`stolen?`、`disguised?`）、`engine/battle.ts`（回合結束 `fleeAfter` → `left`；`opener` 在 `meetEnemy` 套用：`asleep` 設 `sleep`、`ambush` 第一回合最先、`disguise` 名牌「寶箱？」直到第一次受傷且第一回合 atk +50%）、`engine/game.ts`（偷竊：從 `run.loot.gold` 移到 `stolen`，每次上限 `depth × perDepth`，不會讓背包變負；打倒奉還，守關者 ×2；逃走或戰敗就沒了）、`engine/mechanics/index.ts`（`foeWords`：「寶箱？」「偷走 〇〇 金」）。模擬沒有 `run`：不偷（`the sim steals nothing`）。
- Test：`engine/foes.test.ts`、`engine/game.test.ts`、`engine/battle.test.ts`。

- [ ] **Step 1：寫失敗的測試**：`flees at the end of round N`、`a fled foe pays nothing and takes no loot or rune draw`、`returns on a kill`、`a warden returns twice`、`lost on a flee`、`never below zero`、`the sim steals nothing`、每種開場一個成功與一個邊界（`asleep wakes on a hit or by round three`、`ambush acts first only in round one`、`disguise lifts on the first hit`）。
- [ ] **Step 2–5**：同上；commit：`feat(starlantern): foes that run, steal and open the fight their own way`。

### Task B4：召喚（M4）、幻影（M19）、倒下時（M10）、重新站起（M22）、平分（M20）

**Files:**
- Modify：`engine/types.ts`（`Effect { kind: 'summon'; id; max }`、`EnemyDef.onFall?`、`rise?`、`shareWith?`、`EnemySkill.when?: 'deadAlly'`）、`engine/battle.ts`（召喚呼叫 `meetEnemy`，`summoned: true`，本回合不行動，達 `groupCap`（頭目戰 4）就不召喚而改普攻；`onFall` 在 `ko` 之後結算一次、不連鎖；`rise` 第一次倒下時以 pct 站起；`when: 'deadAlly'` 沒有倒下的同伴時這招視為不可用（`findIndex` 跳過它但**照抽**，抽取次數不變）；幻影 1 HP、無報酬、在場時本體 `evasion` +20；`shareWith` 兩隻都活著時傷害各半）、`render/BattleView.ts`（站起的精靈重新顯示）。
- Test：`engine/foes.test.ts`、`engine/battle.test.ts`、`render/BattleView.test.ts`。

- [ ] **Step 1：寫失敗的測試**：`respects the cap`、`a summon acts from the next round`、`the target id must exist`（資料測試）、`fires once`、`does not chain forever`、`rises only once`、`a revive with no fallen ally is passed over, and the draw count holds`、`decoy pays nothing`、`evasion drops with the decoy`、`splits while both stand`。
- [ ] **Step 2–5**：同上；commit：`feat(starlantern): summons, decoys, last words, second winds and shared wounds`。

### Task B5：守關者戰、`bossFor` 接進遊戲、多部位頭目

**Files:**
- Modify：`engine/game.ts`（`move` 的 `'boss'`：終幕與第 3 層照舊，其他改成 `startBattle(bossFor(region, depth), true)`；新的 `'warden'` 格：`startBattle(group, false, true, group[0], 0, { warden: true })`；勝利時 `warden` 不呼叫 `pieceDrops`／`lootFragments`、那一格變地板、`floorOf` 的 contents 移除它；`elite` 的報酬照舊）、`engine/dungeon/rooms.ts`／`render/MapView.ts`（`warden` 格用精英的事件地磚）、`engine/battle.ts`（部件 `rank: 'part'` 的等級與 `BOSS_HOME`；詞綴只給 `boss`）、`engine/scaling.ts`（`homeLevel` 認 `rank: 'part'`）。
- Test：`engine/game.test.ts`、`render/MapView.test.ts`、`engine/scaling.test.ts`。

- [ ] **Step 1：寫失敗的測試**：`with nothing live every boss is the lantern-eater`（深度 5、10、15 × 七區，`startBattle` 的 `enemyIds` 與今天相同）；`a live boss is met where bossFor says`（`withRosterLive`）；`the archon comes with two hands, and only the archon takes affixes`（噩夢）；`a warden pays no memory piece`；`a warden pays like an elite`（同一個種子下 `lootDraws`、`runeDraws` 的增量和精英戰相同）；`a warden takes elite affixes keyed by its tile`；`a beaten warden leaves floor behind`；`the map draws a warden on the elite tile`。
- [ ] **Step 2–5**：同上；e2e 必跑；commit：`feat(starlantern): wardens on the map and bosses by depth, once they are live`。

### Task B6：戰鬥畫面與紀錄

**Files:**
- Modify：`ui2/scenes/battle.ts`（意圖欄：蓄力、守護、宣告；名牌：寶箱？、受守護、偷走的金額；目標說明）、`engine/mechanics/index.ts`（`foeWords` 的新字）、`data/text.zh-TW.ts`（`T.battle` 底下新字串，先 grep 確認不撞名；殘影倒下「〇〇散成了霧。」）、`ui2/battleText.ts`（`remnant` 用殘影那一句）。
- Test：`ui2/scenes/battle.test.ts`、`engine/mechanics/*.test.ts`、`ui2/typeScale.test.ts`、legibility 掃描。

- [ ] **Step 1：寫失敗的測試**：每個 B2–B5 機制的畫面字（意圖、名牌、紀錄各一個測試）；`a remnant fades into mist in the log`；新字串都在 Cubic 11（`glyphs.test.ts`）。
- [ ] **Step 2–5**：同上；e2e 必跑；commit：`feat(starlantern): the battle screen shows what the new foes are doing`。

**PR B1 收尾**：全新脈絡審查（重點：舊定義的逐位元、召喚與逃走的抽取、守關者不給碎片）。

---

# PR B2：引擎二

### Task B7：弱點輪替（M5）、適應（M16）、階段（M8）

**Files:**
- Modify：`engine/types.ts`（`prism?`、`adapt?`、`stages?: { below: number; skills: EnemySkill[]; weak?; resist? }[]`）、`engine/battle.ts`（回合開始設 `weak`／`resist`；`scaleEnemy` 對 `prism` 物種不套地區的弱點；階段依 hp 比例換技能表、記住最低階段；`false-moon` 依回合在「月明／月蝕」之間切換，用 `stages` 的 `everyRounds` 變體）、`engine/skills.ts`／`engine/game.ts:702`（`prism` 物種不寫 `revealed`）、`engine/scaling.ts`。
- Test：`engine/foes.test.ts`、`engine/scaling.test.ts`、`engine/game.test.ts`。
- 開工前錄本 PR 的 `gate-0`（照 B0）。

- [ ] **Step 1：寫失敗的測試**：`cycles through all four elements`、`a region does not override a prism`、`a prism foe writes no revealed weakness`、`adapts to the first element`、`adaptation expires`、`switches under its threshold`、`never switches back after healing`、`the false moon turns between bright and eclipse every two rounds`。
- [ ] **Step 2–5**：commit：`feat(starlantern): foes that turn their weakness, adapt and change stage`。

### Task B8：借來的招式（M6）、多部位減傷（M7）、模仿（M18）

**Files:**
- Modify：`engine/types.ts`（`Effect { kind: 'mirror'; cap }`、`EnemyDef.parts?`、`mimic?`）、`engine/battle.ts`（`BattleState.lastPartyHit`：記錄我方上一個造成傷害的屬性與施放者；`mirror` 用自己的數值、該屬性、`min(power, cap)` 打回施放者；部件活著時本體受傷 × `cutPct/100`（在 `hitAmount` 裡）；`mimic` 在倍率鏈的最後套用）。
- Test：`engine/foes.test.ts`。

- [ ] **Step 1**：`returns the last element at most cap`、`without a record it is an attack`、`half while a part stands`、`drops with the last part`、`copies the strongest member`、`scales with party size`。
- [ ] **Step 2–5**：commit：`feat(starlantern): borrowed blows, guarded bodies and borrowed strength`。

### Task B9：遺忘（M9）、吸 TP（M17）、對中毒加傷（M25）、抹去（M15）

**Files:**
- Modify：`engine/ailments.ts`（`AilmentId` 加 `'forget'`，放在 `AILMENT_IDS` 最後；1 回合；`sleepRes` 抵抗；頭目減半；`cure` 解除）、`engine/battle.ts`（遺忘中 `skill` 改普攻；道具、絕技、防禦照常）、`engine/types.ts`（`damage.tpDrain`、`damage.vsPoisoned`、`Effect { kind: 'dispel' }`）、`engine/skills.ts`、`engine/combatant.ts`；`AilmentShown` 變寬之後三張窮舉表要補 `forget`：`data/text.zh-TW.ts` 的 `STATUS_LINE`、`AILMENT_NAME`（`:20`、`:23`）、`render/ailmentStyle.ts:11` 的 `AILMENT_FILL`；異常小圖示永遠去要 `ailmentIconUrl(c.id)`（`render/BattleView.ts:546`、`ui2/partyBar.ts:213`）：兩處都改成「`AILMENT_ICON_IDS` 沒有它就只顯示文字」，**不畫任何圖**。`render/artPaths.ts` 的 `AILMENT_ICON_IDS` **不改**（裁定 22）。
- Test：`engine/ailments.test.ts`、`engine/foes.test.ts`、`ui2/partyBar.test.ts`、`render/BattleView.test.ts`。
- 已知會紅：`engine/ailments.test.ts` 若有列舉 `AILMENT_IDS` 的字面值，加上 `forget`（意圖不變），列進報告。

- [ ] **Step 1**：`attacks instead of casting`、`items and ultimates still work`、`cure clears forget`、`Bobby's first aid still cures in its old order`、`a boss halves it`、`tp never below zero`、`only against the poisoned`、`moves buffs and leaves debuffs, auras and wards`、`an ailment without an icon shows its name`。
- [ ] **Step 2–5**：e2e 必跑；commit：`feat(starlantern): forget, TP thieves, poison hunters and buff thieves`。

### Task B10：修復（M21）、冰封（M23）、光環（M26）、遲滯（M27）、吞入（M28）

**Files:**
- Modify：`engine/types.ts`（`mend?`、`rally?`、`Effect { kind: 'engulf' }`；`opener: 'encased'`）、`engine/battle.ts`（回合結束 `mend`，那回合被 `stopBy` 屬性打中就不修；`encased`：def、res ×2.5、不行動，火命中或第 3 回合解除；`rally` 活著時同伴得到增益，倒下時移除；`stopped-clock` 的「遲滯」用既有 `delay` 打我方並 spd −30% 1 回合，`delayedBy` 防止連兩回合同一人；`engulf` 照裁定 9）、`ui2/scenes/battle.ts`（被吞的隊員在隊伍列標示「被吞入」、目標選單只剩施放者）。
- Test：`engine/foes.test.ts`、`ui2/scenes/battle.test.ts`。

- [ ] **Step 1**：`stops on its element`、`fire thaws`、`thaws by round three`、`the rally goes with its bearer`、`never delays one member twice in a row`、`a delay never skips a turn`、`an engulfed member still acts, on the engulfer only`、`released by damage`、`released after a round`、`never engulfs the last standing`、`no ally can heal the engulfed`。
- [ ] **Step 2–5**：e2e 必跑；commit：`feat(starlantern): mending, ice, banners, a stopped clock and a swallowing maw`。

### Task B11：深層特性與每一隻的特性都接上

**Files:**
- Modify：`data/enemies.roster.ts`（每一隻照 spec §5 的「特性」欄補上機制欄位與技能）、`engine/scaling.ts`（`DEEP_TRAITS`：`bat` 伏擊、`beetle` 守護、`golem` 蓄力「重踏」；只在 `encounterTable` 回傳新表時套用：`scaleEnemy` 收一個 `deep: boolean`，由呼叫端依 `isRosterTable(region, depth)` 傳）、`data/monsters.ts`。
- Test：`data/monsters.test.ts`、`engine/scaling.test.ts`。

- [ ] **Step 1**：`every trait is implemented`（spec §5 每一列的機制代號 → 該定義有對應欄位或技能；表寫在測試裡）；`every summon names a roster foe that summons nothing deeper than one level`；`deep traits only on a roster table`（舊表與 nothing-live 下 `bat`、`beetle`、`golem` 逐欄相同）。
- [ ] **Step 2–5**：commit：`feat(starlantern): every roster foe fights the way the roster says`。

### Task B12：第 22 項平衡帶

**Files:**
- Create：`engine/balance.roster.test.ts`、`engine/tierBands.roster.test.ts`。
- Modify：`engine/bands.ts`（`balance.roster.test.ts` 進 `BANDS.normal`；`tierBands.roster.test.ts` 進 `nightmare` 與 `hell`）、`engine/sim.ts`（`simBattle` 收選用的 `enemyIds` 已經可以；如需 `withRosterLive` 就從 `engine/testing.ts` 用）。
- 已知會紅：`engine/sim.test.ts:303`（`BANDS.nightmare`、`BANDS.hell` 逐字等於各一個檔）→ 改成「各含原本那個檔與 `tierBands.roster.test.ts`」，`:304` 的「檔案存在」照舊；列進報告。
- Read：spec §9.3、裁定 4、5；`engine/balance.bond.test.ts`（選擇性執行的寫法、不 import 凍結檔的輔助函式）。

- [ ] **Step 1：寫帶**（spec §9.3，門檻全部沿用；22e 取消）：22a 物種等價、22b 頭目等價（對照同深度同地區的 `lanterneater`）、22c 地區深處、22d 深帶歪隊、22f 頭目歪隊、22g 寶物怪（只報告）、22h 專屬獨特天花板、22i 守關者；22j（`tierBands.roster.test.ts`）：每個新頭目在它出現的第 10–25 層，噩夢魔法階與地獄稀有階（同 N3、H2 的隊伍與詞綴），勝率 ≥ 同格 `lanterneater` − 0.10、而且「不裝符文」的勝率 ≤ 同格 `lanterneater` 的不裝符文 + 0.10；每個守關者在地獄第 20、25 層（有的話）勝率 ≥ .75（同 HE）。檔頭寫跑法。
- [ ] **Step 2**：`ROSTER_BANDS=1` 跑一次（定義都查得到，不需要上線）。紅的格子：只調新物種自己的數字（四輪為限），每一輪的表存 SDD `bands-22.md`。22j 在 L 任務才是必過（這裡記錄即可）。
- [ ] **Step 3**：全套（不含選擇性帶）、tsc、閘門 identical（只調名冊數字不會動到舊表）。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): band 22, the roster against the lantern-eater and its own kin`。

**PR B2 收尾**：全新脈絡審查（重點：遺忘不影響既有異常順序；遲滯與吞入不失去回合；22 帶不 import 凍結檔）。

---

# PR C：掉落、鍛造與圖鑑

### Task C0：基準
- [ ] 照 B0。

### Task C1：`trophyRng` 與銘文

**Files:**
- Modify：`engine/loot/drops.ts`（`TROPHY_SALT = 0x71374491`、`trophyRng(run)`、`inscribe(item, speciesId, rng)`）、`engine/dungeon/run.ts`（`Run.trophyDraws`，`newRun` 設 0）、`engine/types.ts`（`ItemInstance.inscription?`）、`engine/save.ts`（`isItem`：`inscription` 必須是 `ENEMIES` 的一般物種 id）、`engine/game.ts`（`battleGear` 的一般怪迴圈：那隻是名冊物種、掉了裝備、不是特殊裝備 → `trophyRng` 抽 `INSCRIBE_CHANCE`）、`data/forge.ts`（`INSCRIBE_CHANCE`、`OWN_UNIQUE_SHARE`）、`engine/loot/item.ts`（名稱「・〇〇銘」）、`data/bestiary.zh-TW.ts`（`INSCRIPTION_NAME` 表；本任務先建檔）。
- Test：`engine/loot/drops.test.ts`、`engine/game.test.ts`、`engine/save.test.ts`、`data/monsters.test.ts`（鹽）。

- [ ] **Step 1**：`trophy draws never move a lootRng draw`（同一個種子、同一串戰鬥，有沒有銘文：`lootDraws` 與每一件 `lootRng` 的產出相同）；`an inscription never raises an item's affix count or range`（10 萬件統計：條數、每條數值範圍和不銘刻的同稀有度同 ilvl 一致）；`a slot that cannot take the key keeps its affixes but carries the mark`；`legacy foes never inscribe`；`the save keeps an inscription and refuses an unknown one`；`salts are distinct`（補上 `TROPHY_SALT`）。
- [ ] **Step 2–5**：閘門 identical（舊物種不抽 `trophyRng`）；commit：`feat(starlantern): the trophy stream and species inscriptions`。

### Task C2：專屬獨特的替換

**Files:**
- Modify：`engine/game.ts`（`battleGear` 的頭目與精英／守關者分支：`lootRng` 用完之後，名冊頭目或守關者、那件是 `legendaryTier` → `trophyRng` 抽 `OWN_UNIQUE_SHARE`，中了 `rollItem` 重擲成專屬獨特、保留 uid、再 `applyStarlit`）、`engine/loot/drops.ts`（`ownUniqueOf(enemyId)`、只換成 `ROSTER_LIVE` 主人的）。
- Test：`engine/loot/drops.test.ts`、`engine/game.test.ts`。

- [ ] **Step 1**：`own uniques never raise the special rate`（10 萬次頭目掉落：特殊裝備的總出現率和不替換時的差 < 0.5 個百分點）；`the swap moves no lootRng draw`；`a swapped piece can still be starlit, keyed by its uid`；`only a live owner's unique drops`。
- [ ] **Step 2–5**：commit：`feat(starlantern): a boss or a warden may leave its own unique`。

### Task C3：圖鑑的狀態

**Files:**
- Create：`engine/bestiary.ts`、`engine/bestiary.test.ts`。
- Modify：`engine/state.ts`（`GameState.bestiary?`）、`engine/save.ts`（`isValid` 的形狀檢查；`loadGame` 的 `repairBestiary`）、`engine/game.ts`（`startBattle` 記 `seen`、勝利記 `felled`、銘文入袋記 `inscribed`）。
- Test：`engine/bestiary.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`。

- [ ] **Step 1**：`seen counts a species once a fight, regions alike`；`a summon is seen, a decoy is not`；`felled counts every foe beaten`；`the bestiary draws nothing`（`game.rng`、`lootRng`、`runeRng`、`memoryRng`、`trophyRng` 次數不變）；`the save version stays 9`；`a bestiary round-trips`；`an unknown id is dropped on load, the save is not corrupt`；`a negative or broken count is corrupt`。
- [ ] **Step 2–5**：commit：`feat(starlantern): the bestiary remembers what was seen and felled`。

### Task C4：鍛造屋的銘刻與製作

**Files:**
- Modify：`engine/forge/forge.ts`（`inscribeAt`：同物種招牌素材 3 ＋ `REROLL.gold(ilvl)`，`forgeRng` 一次；特殊裝備與星輝不可）、`engine/forge/craft.ts`（`craftOwnUnique`：戰利品或遺物 5 ＋ `star-tear` 1 ＋ `setGold(ilvl)`，條件 `bestiary[owner].felled ≥ 1`，照 `craftSet`）、`engine/forge/uses.ts`（A3 的用途文字接上真的動作）、`ui2/scenes/forge.ts`（重洗頁加「銘刻」）、`ui2/scenes/forgeCraft.ts`（製作頁加「專屬裝備」區塊；沒擊倒過的列灰色、說明「尚未擊倒〇〇」；未上線的主人不列）、`data/text.zh-TW.ts`。
- Test：`engine/forge/forge.test.ts`、`engine/forge/craft.test.ts`、`engine/forge/economy.test.ts`、`ui2/scenes/forge.test.ts`。

- [ ] **Step 1**：`inscribing costs three of its signature and one forge draw`、`a special piece cannot be inscribed`、`crafting needs a kill first`、`crafting draws once`；`economy.test.ts` 新增 `crafting an own unique never pays more than its inputs`（每個深度，賣價 ≤ 材料價＋金幣）；畫面：`the inscribe row and the own-unique rows`、`an unbeaten owner is greyed out with its reason`。
- [ ] **Step 2–5**：e2e 必跑；commit：`feat(starlantern): inscribe at the forge, and craft what a boss would not drop`。

### Task C5：圖鑑文字的註冊表與守門

**Files:**
- Modify：`data/bestiary.zh-TW.ts`（`BESTIARY: Partial<Record<string, { trait: string; lines: { text: string; after?: StoryGate }[] }>>`，一開始是空的；`INSCRIPTION_NAME`）。
- Create：`data/bestiary.test.ts`。
- Read：`data/story/scenes.ts:232-242`（`StoryGate`）、`engine/story/events.ts:148-159`（`gateOpen`）。

- [ ] **Step 1：寫守門**：`every live foe has an entry`（`ROSTER_LIVE` 為空時通過；L 任務起生效）；`no entry for a foe that does not exist`；`every gated word waits for its reveal`（A5 的清單＋每個詞最早的揭露閘門：`靜鐘會`→`act3`、`守燈人`→`act4`、`燈喰之母`→`finale`、`艾斯特拉`→`act4`、夥伴的詞照 `REVEALED` 的片數；`after` 不早於它）；`a remnant's last line stays a memory`（含夥伴名字的句子一定有該夥伴的 `mem:` 閘門）；`handbook text spends no 「……」`、`no Latin letters or digits`、`no line over sixty`；`BESTIARY_DUMP` 匯出朗讀稿（W6 用）；`glyphs.test.ts` 掃得到本檔。
- [ ] **Step 2–5**：commit：`test(starlantern): bestiary text gates before any is written`。

### Task C6：圖鑑頁

**Files:**
- Modify：`engine/story/handbook.ts`（`CodexPage.monsters` 擴充：只列 `listedEnemy`；`{ id, name, seen, felled, haunts, weak | 'prism' | null, trait | null, lines: string[], own?: { id; got: boolean } }`；`lines` 由 C5 的註冊表與 `gateOpen` 決定）、`ui2/scenes/handbook.ts`（圖鑑內加篩選「本道／各地區／頭目」；沒見過的「？？？」只有出沒，不顯示圖；見過的顯示圖、名字、出沒、弱點、次數、特性；擊倒過加第一句、招牌素材與銘文；頭目與守關者加「專屬裝備：已取得／未取得」）、`data/bestiary.zh-TW.ts`（介面字串）、`src/styles/_starlantern-ui.scss`。
- Test：`engine/story/handbook.test.ts`、`ui2/scenes/handbook.test.ts`、`ui2/typeScale.test.ts`。
- 已知會紅：`engine/story/handbook.test.ts:178-181`（A2 已改成 `listedEnemy`）若斷言了 `monsters` 的欄位形狀，照新形狀改，意圖不變。

- [ ] **Step 1**：`only live foes are listed`、`an unseen foe is a name of question marks and a place`、`the filters split main road, regions and bosses`、`lines open with their gates`、`a prism foe shows its weakness as turning`、`the own-unique line reads the codex`；清單與右欄留在面板內（照 `8db54d901` 的工房清單）。
- [ ] **Step 2–5**：e2e 必跑；commit：`feat(starlantern): a bestiary page with filters, and nothing shown before it is met`。

**PR C 收尾**：全新脈絡審查（重點：串流、統計測試、存檔修復）。

---

# PR D：美術工具（和 B、C 並行）

### Task D1：`roster_art.py`

**Files:**
- Create：`art-factory/starlantern/tools/roster_art.py`、`test_roster_art.py`。
- Modify：`art-factory/starlantern/contract.md`（敵人的五種高度、圖示方框改成 5d 實際的寫法、名冊的批次與核准）、`tools/conftest.py`（把 `roster_art` 的 `PROMPTS` 也指到暫存資料夾）。
- Read：`tools/batch.py:192-197`（敵人工作）、`tools/gear_art.py`（批次、`pick`、`approve`、`publish`、`--reopen`、hash 綁定）、`tools/codex_still.py`。

- [ ] **Step 1：寫失敗的測試**（pytest）：`plan_json lists five rounds whose union is the hundred ids, no repeats`；`heights by class`（群 52、一般 64、重 76、守關者與部件 96、頭目 150；prompt 的高度句照 spec §13.1）；`prompts follow batch.py's sentence, with the anchors`（一般附 `enemy-slime`、守關者與頭目再附 `enemy-lanterneater`、R1 起再附一張 R0 同類；故事物種不附立繪）；`icon sheets are 5 by 4 with their parts`；`gear sheets reuse gear_art's layout and the 5d anchor`；`gen refuses r1 to r4 without roster_style_approved`；`approve refuses without the shown hashes, a date, or with any part not qa_passed`；`publish refuses an unapproved batch`；`no text in icons`（`iou-slip`、`hymn-sheet`、`torn-page`、`ash-page`、`epitaph-stone` 的描述含「blank」「unreadable marks, no letters」）。
- [ ] **Step 2**：`rtk proxy python -m pytest art-factory/starlantern/tools -q` 紅。**Step 3**：實作（結構照 `gear_art.py`；`DESC` 先放 spec §13.3 的表，其餘一般物種照 spec §5 的名稱與特性寫，審核頁顯示）。**Step 4**：pytest 綠。
- [ ] **Step 5**：commit：`feat(art): roster_art, the monster roster's batches, prompts and gates`。

### Task D2：QA 擴充

**Files:**
- Modify：`art-factory/starlantern/tools/sl_art.py`、`test_sl_art.py`。

- [ ] **Step 1：失敗的測試**：`height_band`（spec §13.1；群另有寬度上限）、`palette_max`（不透明像素色數 ≤ 32）、`lum_range`（第 5–95 百分位亮度差 ≥ 0.35，否則 `too flat to tint`；本道物種平均亮度 ≥ 0.35，否則 `too dark to tint`）；舊的 magenta 殘留、半透明、碰邊、被切到照舊。
- [ ] **Step 2–4**：紅、實作、綠。**Step 5**：commit：`feat(art): QA bands for roster sprites`。

### Task D3：審核頁

**Files:**
- Create：`art-factory/starlantern/tools/review_roster.py`（照 `review_gear.py`）。
- Test：`test_roster_art.py`。

- [ ] **Step 1**：測試：頁面寫出 `work/review/<batch>-shown.json`（每張成品的 sha256）；含 spec §13.5 的八個區塊（三張戰鬥背景上的遊戲內大小、和舊 9 張並排、7 種地區色調、群三隻一排與多部位一起、圖示放進背包與鍛造屋列、故事物種旁的閘門與「不得畫出的東西」清單、QA 數字與所有版本、淘汰原因）；**沒有**剪影區塊（裁定 18）。
- [ ] **Step 2–4**；**Step 5**：commit：`feat(art): the roster review page`。

### Task D4：發布與開關的接線

**Files:**
- Modify：`roster_art.py`（`publish --batch B`：寫 `runtime`、搬檔、更新 manifest、把該批 id 加進 `data/monsters.ts` 的 `ROSTER_ART`、更新 `render/artPaths.test.ts` 的總數與算式註解，全部在同一個工作樹的修改裡，由實作者 commit）、`data/monsters.test.ts`（`every art id is published`：`ROSTER_ART` 的每個 id 的 `enemy-<id>`、它的招牌素材或戰利品的 `icon-<mat>`、頭目與守關者的 `gear-<unique>` 在 registry 都是 `published`，檔案存在）。
- Test：`test_roster_art.py`、`data/monsters.test.ts`。

- [ ] **Step 1**：`publish with a fake approved batch writes runtime, manifest and ROSTER_ART, and the count line`（在暫存的 registry 與暫存的 `monsters.ts` 拷貝上跑）；`every art id is published`（`ROSTER_ART` 為空時通過）。
- [ ] **Step 2–5**：pytest、vitest 全套、tsc；commit：`feat(art): publishing a roster batch opens its art switch`。

---

# PR E1：美術第一批（R0＋R1）

**開工條件**：PR D 已合併（生成與審核）；E1c 發布前 A、B2 也已合併（裁定 1）。生成一次只跑一張（`codex_still` 不能並行）。

### Task E1a：R0 風格樣本

- [ ] **Step 1**：`roster_art.py gen --batch r0`：5 隻敵人（每隻至少 2 版）、`sheet-icons-roster-1`（R0＋R1 的 18 個圖示＋2 格空石板）、`sheet-gear-roster-1`（R0＋R1 的 5 件專屬獨特）、`forget` 的異常小圖示（G4 小圖示工具，照 `ailment` 圖示的規格）。
- [ ] **Step 2**：`sl_art.py process` 與 QA；不過的重生（每個 id 最多 3 次），淘汰的記進 `rejected_attempts`、不留在 runtime 路徑。
- [ ] **Step 3**：`review_roster.py r0`；控制者派全新脈絡的代理做視覺檢查（不參與生成）；控制者用 Artifact 工具發布審核頁，網址交給使用者。
- [ ] **Step 4**：使用者核准後 `approve --batch r0 --by "<使用者原話> <YYYY-MM-DD>"`（寫 `roster_style_approved`、`roster_style_anchor`）。有異議的件記淘汰、重做、回到 Step 2。**不在這一步發布。**
- [ ] **Step 5**：commit registry 與原始紀錄（不含 runtime 檔）：`chore(art): roster R0 style samples approved`。

### Task E1b：R1

- [ ] **Step 1–4**：同 E1a，13 隻敵人（圖示與裝備已在 R0 的表裡）；附 R0 同類的一張當第二錨點；使用者核准 `approve --batch r1`。

### Task E1c：發布

**Files:** `public/assets/games/starlantern/{enemy,icon,gear,ui}/`、manifest、registry、`data/monsters.ts`（`ROSTER_ART`）、`render/artPaths.ts`（`AILMENT_ICON_IDS` 加 `forget`）、`render/artPaths.test.ts`（722 → 769，註解寫算式「722 + 18 敵人 + 18 圖示 + 5×2 專屬 + 1 遺忘」；若發布前總數不是 722，以實際值重算）。

- [ ] **Step 1**：`publish --batch r0`、`publish --batch r1`。
- [ ] **Step 2**：`rtk proxy python -m pytest art-factory/starlantern/tools -q`、vitest 全套（`published.test.ts`、`artPaths.test.ts`、`data/monsters.test.ts` 的 `every art id is published`、`gearArt.test.ts`）、tsc、閘門 identical（只有 `ROSTER_ART`，沒有上線）、e2e。
- [ ] **Step 3**：收尾 G，commit：`feat(art): the first eighteen roster foes, their materials and uniques`。

---

# PR L1：上線一（本道 B、C 帶）

**開工條件**：A、B1、B2、C、E1 都已合併（裁定 1）。錄本 PR 的 `gate-0`。

### Task L1a：寫作（本道淺層＋凜與瑟蕾的遺物）

- [ ] W1–W7，範圍：E1 的 18 隻（含 `bell-watcher`、`bell-warden`、`hollow-hunter`、`hollow-champion`、`false-moon` 的故事句，閘門照裁定 20）、5 件專屬獨特的 `lore`、遺物 `tower-dust`（凜）與 `moon-silver`（瑟蕾）：`GIFT_TASTE` 的 `declined` 與 `healed: 'liked'`、`GIFT_LINES` 各兩句。凜的婉拒句不得提靜鐘會、不得違反 `RIN_SECRET_TERMS` 與她揭露前的口吻規則（聖經 §3 凜）。
- [ ] commit：`feat(starlantern): bestiary for the shallow road; Rin's and Selene's keepsakes`。

### Task L1b：上線切換與重錄

**Files:** `data/monsters.ts`（`ROSTER_LIVE` 加 `paper-moth`、`lamp-wight`、`root-hound`、`tin-soldier`、`dust-mimic`、`market-ghost`、`tongueless-bell`、`hollow-hunter`、`mist-twin`、`moon-crow`、`bell-watcher`、`sleepwalker`、`hoarder`、`fog-warden`、`silent-bell`、`hollow-champion`、`false-moon`、`bell-warden`）、`engine/__fixtures__/tiers/baseline.normal.txt`（重錄）、已知會紅的釘子。
- 已知會紅與改法（意圖都不變，全部列進報告）：
  - `engine/scaling.test.ts:254`、`:357`（`NORMAL_ENEMIES` 長度 8）→ 8 ＋本波上線的一般物種 13 ＝ 21（裁定 3 的定義不含守關者與部件），註解寫算式；
  - 這些讀現行 `encounterTable` 的測試，量的是「舊表上的某個既有行為」，改成讀 `legacyEncounterTable`：`engine/battle.test.ts:600`（第 4 層的雜湊，`BASELINE` 在 `:32`）、`engine/battle.test.ts:1143-1174`、`engine/tierBands.test.ts:119`、`:125`（`n1`、`n2` 的格數）、`engine/ledger.test.ts:539`、`engine/builds.test.ts:383`、`engine/builds.guard.test.ts:76`、`engine/runes.guard.test.ts:124`、`engine/policy.test.ts:641`；切換前先 `grep -rn "encounterTable(" src/scripts/games/starlantern --include=*.test.ts` 列出全部，名單以 grep 為準；
  - `scaling.test.ts` 裡列舉舊表覆蓋的斷言（例：霜凍第 6 層見到全部）→ 讀 `legacyEncounterTable`；
  - `data/data.test.ts:95-97`（A2、A4 改過）現在必須覆蓋本波物種；
  - 其他走 `NORMAL_ENEMIES` 的斷言（`engine/scaling.test.ts:60`、`:90`、`:375`、`:385`）開始量新物種：紅了先當成新物種的資料或機制錯去修；只有斷言本身和裁定衝突時（例：`prism` 物種不吃地區弱點，裁定 9）才加排除條件，寫註解。

- [ ] **Step 1**：切換前閘門 identical。
- [ ] **Step 2**：加進 `ROSTER_LIVE`；`data/monsters.test.ts`、`data/bestiary.test.ts`（`every live foe has an entry`）綠。
- [ ] **Step 3**：照「重錄規則」1–7：閘門 `gate-L1`、`cmp`、`rebaseline-L1.md`、22 帶與 `tierBands.*`（含 22j）全綠、`baseline.normal.txt` 重錄、`economy.test.ts` 綠。紅燈只調新物種的數字。
- [ ] **Step 4**：控制者派審查者（重錄規則 6）；通過才 commit：`feat(starlantern): the shallow road meets its new foes (live wave 1)`。

### Task L1c：e2e 冒煙與截圖

**Files:** `tests/e2e/starlantern.spec.ts`。

- [ ] **Step 1：寫失敗的 e2e**（照既有 e2e 進迷宮的寫法）：第 4 層一場有新物種的戰鬥（名字、意圖或名牌出現）；第 5 層頭目是「霧門守衛」；第 8 層有守關者格，進去是「不存在的月亮」，打完那一格變地板；圖鑑頁看得到本道篩選與一隻見過的物種。
- [ ] **Step 2**：三個專案全綠；headless 截圖存 SDD（給控制者放進回報，不 commit）。
- [ ] **Step 3**：收尾 G，commit：`test(starlantern): e2e smoke for the first live wave`。

---

# PR E2：美術第二批（R2）

### Task E2a：R2 生成與審核
- [ ] 照 E1b：27 隻（`roster_art.py plan-json` 的 r2 清單）、`sheet-icons-roster-2`、`-3`（26 個圖示）、`sheet-gear-roster-2`、`-3`（10 件）；使用者核准 `approve --batch r2`。

### Task E2b：發布
- [ ] 照 E1c：總數 ＋73（27＋26＋10×2），以發布前實際值重算；commit：`feat(art): roster R2, the deep road`。

---

# PR L2：上線二（本道 D、E、F 帶）

### Task L2a：寫作（深層、子嗣、提燈人、古城、波比的遺物）
- [ ] W1–W7：R2 的 27 隻；`keeper-echo` 三句、子嗣第二句 `finale`（I-223）、古城 `act4`、機兵 `mem:bobby:4`；10 件 `lore`；遺物 `automaton-core`（波比）。commit：`feat(starlantern): bestiary for the deep road; Bobby's keepsake`。

### Task L2b：上線切換與重錄
- [ ] 照 L1b：加入 R2 除 `lantern-mother` 以外的 26 個 id；`DEEP_TRAITS` 從這一波起在新表生效；22 帶、22j、`tierBands.*`、`baseline.normal.txt`、`economy.test.ts`；`rebaseline-L2.md`；審查。commit：`feat(starlantern): the deep road meets its new foes (live wave 2)`。

### Task L2c：燈喰之母（終幕的外型）

**Files:** `data/story/scenes.ts:16`（`FINALE_BOSS.base` → `lantern-mother`；`power` 不動）、`data/monsters.ts`（`ROSTER_LIVE` 加 `lantern-mother`）、`engine/game.test.ts:3500-3505`（地區第 30 層）與 `:3545-3551`（終幕之後本道第 30 層）。
- 已知會紅與改法：這兩個測試用 `ENEMIES[FINALE_BOSS.base].name` 表示「長大的燈喰之獸，不是她」。換成 `lantern-mother` 之後這個寫法就錯了：改成讀那一戰實際的頭目——`ENEMIES[bossFor(region, 30)[0]].name`（本道第 30 層是 `lanterneater`，裁定 11；熾焰第 30 層在 L3 之後是熾焰的頭目），`not.toBe(STORY.finaleBossName)` 照舊。意圖不變，列進報告。

- [ ] **Step 1：失敗的測試**：`the finale is fought against the mother's own shape, with the lantern-eater's numbers`（`scaleEnemy` 後的數值、技能、弱點逐欄等於舊的終幕，只有 `id`、外型不同；名字照舊由 `names` 給 `STORY.finaleBossName`）；`after the finale depth thirty is still the grown beast, not her`（本道）；`the mother's trophy and own unique drop at the finale`（`drops` 有她的戰利品；終幕勝利後圖鑑 `felled` 有她）。
- [ ] **Step 2**：閘門。第 19b 項的報告行沒有名字與 id、動作雜湊用鍵不用名字，所以**預期 identical**；若是 DIFFERENT，照重錄規則 4–6 證明差異只來自 id 或外型（數字一個都沒變），否則 BLOCKED。
- [ ] **Step 3**：審查；commit：`feat(starlantern): the finale wears the lantern-mother's own shape`。

### Task L2d：e2e
- [ ] 第 20 層執政像與兩隻手（打手之前本體受傷減半的名牌字）、第 18 層守關者「倒下的機兵」、圖鑑「頭目」篩選；commit：`test(starlantern): e2e smoke for the deep road`。

---

# PR E3：美術第三批（R3）

### Task E3a、E3b
- [ ] 照 E2：28 隻、`sheet-icons-roster-4`、`-5`（27）、`sheet-gear-roster-4`、`-5`（12）；故事物種的閘門清單另請使用者只看一次語氣（spec §13.5）；發布 ＋79。commit：`feat(art): roster R3, the fire, frost and storm lands`。

# PR L3：上線三（熾焰、霜凍、雷鳴）

### Task L3a：寫作
- [ ] W1–W7：R3 的 28 隻（蜃樓、沙海、冰狛犬、拜殿、裂口、星屑、魔法書、燃燒的那一頁；閘門照 spec §4.2 與裁定 20）；12 件 `lore`；遺物 `copper-anklet`（莎菲拉）、`shrine-rope`（千鶴）、`ash-page`（諾艾兒）。commit：`feat(starlantern): bestiary for three lands; Safira's, Chizuru's and Noel's keepsakes`。

### Task L3b：上線切換與重錄
- [ ] 照 L1b；22c、22d 的熾焰、霜凍、雷鳴格；commit：`feat(starlantern): fire, frost and storm meet their own (live wave 3)`。

### Task L3c：e2e
- [ ] 霜凍第 15 層永凍之守與冰柱、雷鳴第 8 層守關者；commit：`test(starlantern): e2e smoke for three lands`。

# PR E4：美術第四批（R4）

### Task E4a、E4b
- [ ] 照 E3：27 隻、`sheet-icons-roster-6`、`-7`（27）、`sheet-gear-roster-6`、`-7`（12）；發布 ＋78（預期總數 999）。commit：`feat(art): roster R4, the mire, the shade and the iron`。

# PR L4：上線四與收尾

### Task L4a：寫作
- [ ] W1–W7：R4 的 27 隻（樹人、老樹、灰枯、寶庫、敲門的影子、騎士殘影、旗手、撞門的巨影、指揮官；莉茲與絲嘉蕾的禁字照裁定 20）；12 件 `lore`；遺物 `ashen-acorn`（希爾薇）、`vault-coin`（莉茲）、`gate-splinter`（絲嘉蕾）。commit：`feat(starlantern): bestiary for the last three lands; Sylvie's, Liz's and Scarlet's keepsakes`。

### Task L4b：上線切換與重錄
- [ ] 照 L1b；commit：`feat(starlantern): mire, shade and iron meet their own (live wave 4)`。

### Task L4c：收尾量測
- [ ] **Step 1**：`ROSTER_LIVE` 等於全部 100 個；`ROSTER_ART` 等於 `ROSTER_LIVE`；圖鑑每一隻都有文字。
- [ ] **Step 2**：一次跑完：全套、閘門（對 `gate-L4`）、`cmp`、`ROSTER_BANDS=1` 全部、`BANDS=1` 的 `tierBands.*` 全部、`builds.bands.*`（`npm run test:starlantern:bands`）、`BOND_BANDS=1` 的第 21 項、`economy.test.ts`、22g 寶物怪擊殺率（目標 50–70%，只報告）。結果存 SDD `closeout.md`。
- [ ] **Step 3**：spec §14 驗收總表逐項打勾（附測試名或指令輸出）；沒打勾的寫理由。
- [ ] **Step 4**：commit `closeout.md` 的摘要到 spec §0 的「結果」一段：`docs(starlantern): roster close-out`。

### Task L4d：e2e 總冒煙
- [ ] 每個地區第 5 層頭目、腐毒的吞入（被吞的人仍能行動）、鍛造屋製作一件專屬獨特（先打倒）、銘刻一次；三個專案；commit：`test(starlantern): e2e smoke across the whole roster`。

**計畫收尾**：控制者派全新脈絡的審查者看整個名冊（照 `review-pr` skill）；回報使用者：PR 清單、`allArtUrls` 總數、22 帶與難度帶的結果、寶物怪擊殺率、審核頁網址。
