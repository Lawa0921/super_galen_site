# 星燈迷宮：好感度、羈絆內容、戀愛結局與立繪差分設計

日期：2026-10-18
狀態：草案，待使用者核准
依據：使用者 2026-10-18 的要求與四題追問的回答（§1）。上位文件是 `docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md`（下稱「故事 spec §」），文風與設定以 `docs/superpowers/story/starlantern-style-bible.md`（下稱「文風聖經」）與 `docs/superpowers/story/starlantern-lore-ledger.md`（下稱「帳本」）為準。
標記：「使用者決定」是使用者原話或追問的答案；「裁定」是本文件的設計決定，附理由；**「提案」是需要模擬或試玩校正的數字**，實作計畫可以在本文件劃定的範圍內調整，但不可以放寬任何既有平衡帶。

> 沒有以 `src/`、`tests/`、`docs/`、`art-factory/`、`public/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。

---

## 1. 為什麼要做

使用者原話：
- 「每個角色還應該要有立繪差分」
- 「差分要符合他們的設定和性格」
- 「每個人物還應該要有好感度的設定」

追問的回答（使用者決定）：
| 題目 | 回答 |
|---|---|
| 好感度給什麼 | **劇情為主＋小幅戰鬥加成**：羈絆對話、特別場景、後日談；戰鬥加成很小，絕不讓某一種隊伍變成必帶。 |
| 戀愛 | **可選一位的戀愛結局**：圓滿結局之後，一位夥伴成為戀愛結局；其他人仍是重要的同伴。 |
| 好感度來源（四種全要） | 回城對話的選項、送禮（迷宮戰利品，每人喜好不同）、記憶碎片（聽過她的每一片）、同隊探索與戰鬥（打倒強敵、救了她一命）。 |
| 立繪差分 | **8 張以上完整**：每位角色至少 8 種對話表情，符合各自的設定與性格；共通核心＋個人專屬。 |

既有的立繪只有戰鬥用的 6 種（`normal`、`attack`、`hit`、`dying`、`down`、`ultimate`），加上洛恩、凜、凜（誓約後）各 2 種故事用表情（`smile`、`sad`）。夥伴之間除了記憶線，沒有「和洛恩越來越親近」這條軸。本文件補上這條軸，並讓它和既有的記憶、各幕、`CHAT_GATE` 咬合，不劇透、不擋遊玩、不動平衡。

---

## 2. 目標、非目標、反目標

**目標**
- 每位夥伴（凜＋8 位）有一個好感度值、5 個階段，四種來源都能推進，但只刷一種來源到不了頂。
- 每升一階就有新的羈絆對話；最高階有一段特別場景；終幕之後每人一段後日談；可選一位的戀愛結局。
- 送禮用既有的迷宮素材，每人喜好不同，來自她的背景。
- 回城的羈絆對話有 2～3 個選項，**沒有錯的答案**。
- 每位角色（含洛恩、凜的兩套）至少 8 種對話表情。美術還沒到的表情顯示 `normal`，不出現破圖，`allArtUrls()` 維持 246 直到圖真的發佈。
- 戰鬥加成小到不移動任何凍結的平衡帶，而且用一條新的平衡帶證明這件事。

**非目標**
- 不新增道具經濟：不新做「禮物」道具、不新增商店品項（§6.1）。
- 洛恩對自己沒有好感度；鎮民（安娜、歐里克……）沒有好感度（他們的線由鎮民碎片與第 2 項任務承擔）。
- 不做好感度的連線對戰校正（留給終局，§5.5 留開關）。
- 不改寫已經寫好的劇情（序章、凜的 7 片、各幕、洛恩的 10 片與 4 段對話）。

**反目標**（技術上能動，但等於失敗）
- **選項變成考試**：某個選項讓好感度下降、或是明顯的「錯誤答案」。
- **好感度會掉**：因為沒帶她、全滅、送錯禮、跳過劇情而下降（§4.5）。
- **加成讓某支隊伍變成必帶**：違反故事 spec §4.5「任何隊伍組成都要可以用」。
- **刷一種來源就能把所有人刷滿**。
- **羈絆內容劇透記憶**：羈絆對話說出還沒找回的碎片內容，或凜在揭露前說出秘密。
- **有人被留在黑暗裡**：沒被選為戀愛對象的人、好感度低的人、終幕時還沒遇見的人，沒有圓滿的後日談。
- 為了好感度動用 `Math.random`，或多抽 `lootRng`、`memoryRng`、`game.rng`。

### 2.1 與上位文件的衝突與裁定
1. **故事 spec §2 非目標「不做玩家選項分歧的多結局」**。使用者這次明確要求「可選一位的戀愛結局」，以使用者的新指示為準。裁定：**主線結局仍只有一個**（終幕，§8.4 不變；凜的選擇仍是她的選擇，不是玩家的）；戀愛結局是終幕之後的後日談分支，不改變任何人的命運，只改變「洛恩和誰一起過星燈祭」。
2. **故事 spec §8.1、§14「既有 8 位的 smile／sad 屬於第 3 項（NPC 立繪）」**。裁定：8 位夥伴的對話表情改由本文件的美術計畫（§11.4）一次做完，第 3 項只剩鎮民 NPC。
3. **故事 spec §8.2「回城對話 3 句、每次回城最多 1 段」**。裁定：既有的 `chat:*` 規則不變；新的羈絆場景是玩家在旅館主動開啟的（§8.2），不佔回城的那一段，句數上限另訂（§8.4）。
4. **命名衝突**：`CharacterDef.affinity` 已經是「主屬性取向」（`'str' | 'int' | 'agi' | 'wil' | 'all'`，狀態頁 `slx-stat-affinity`）。好感度在程式裡一律叫 **`bond`**，不可以用 `affinity`。介面文字用使用者的說法「好感度」。

---

## 3. 名詞與 id

| 名詞 | id | 說明 |
|---|---|---|
| 好感度 | `bond` | 每位夥伴 0–100 的整數，由紀錄推導（§4.1） |
| 階段 | `BondTier` = `0 \| 1 \| 2 \| 3 \| 4` | 名稱見 §4.2 |
| 夥伴 | `Companion` = `Exclude<CharacterId, 'hero'>` | 凜＋8 位 |
| 羈絆場景 | `bond:${Companion}:${1..4}` | 第 4 段是「心契」特別場景 |
| 後日談 | `ending:${Companion}` | 終幕之後，每人一段 |
| 星燈祭 | `epilogue` | 終幕之後第一次回城的群像場景（major） |
| 戀愛結局 | `romance:${Companion}` | 只對可戀愛的人（§9.1） |
| 語氣 | `Tone` = `'ask' \| 'stay' \| 'promise'` | 對話選項的三種側重（§7.2） |
| 對話表情 | `StoryMood` | 核心 6 種＋個人專屬（§10） |

---

## 4. 好感度模型

### 4.1 存放：紀錄，不存總分（裁定）
- `engine/types.ts` 的 `Member` 新增可選欄位：
  ```ts
  /** Bond with Lorne (companions only; never on the hero). Absent = nothing earned yet. */
  bond?: BondRecord;
  interface BondRecord {
    /** Points from bond-scene choices, 0..BOND_CAP.talk. */
    talk: number;
    /** Points from fighting and exploring together, 0..BOND_CAP.field. */
    field: number;
    /** Accepted gifts: how many of each giftable material she has taken. */
    gifts: Partial<Record<GiftId, number>>;
  }
  ```
- 總分不存，由純函式推導：
  ```ts
  bondPoints(m: Member): number =
    clamp(BOND_START + BOND_PER_PIECE × memoriesOf(m) + talk + min(giftPoints(m), BOND_CAP.gift) + field, 0, BOND_MAX)
  bondTier(m: Member): BondTier
  ```
- 理由：
  - 放在 `Member` 上，`statsOf(m)` 不需要額外參數就能算出加成（§5），和 `memories`、`absorbed`、`oath` 同一個位置、同一套存檔驗證；
  - 記憶的部分由 `memoriesOf(m)` 推導，不另外記，所以舊存檔自動補上已找回的碎片、不會重複加分；
  - 每種來源各有自己的欄位與上限，「只刷一種來源」在資料結構上就到不了頂（§4.4）。
- 洛恩（`hero`）永遠沒有 `bond`；存檔驗證拒絕 `hero.bond`。

### 4.2 範圍與階段（數值是提案）
`BOND_MAX = 100`，`BOND_START = 10`（遇見的當下；凜開局就算遇見）。

| 階段 | id | 名稱 | 門檻（提案） | 解鎖 |
|---|---|---|---|---|
| 0 | `acquainted` | 相識 | 0 | ── |
| 1 | `companion` | 同行 | 20 | 羈絆場景 1、戰鬥加成 1% |
| 2 | `trusted` | 信賴 | 40 | 羈絆場景 2、加成 2% |
| 3 | `bonded` | 羈絆 | 60 | 羈絆場景 3、加成 3%、後日談多一句 |
| 4 | `devoted` | 心契 | 85 | 「心契」特別場景、加成 4%、戀愛資格 |

- 門檻 85 而不是 80：讓「心契」一定要三種以上的來源（§4.4 的算術）。
- 「心契」這個名字是心意相通，不等於戀愛：每一位都可戀愛（§9.1），但只有被選上的那一位走到戀愛結局，其他人的心契仍然成立（戰友、家人般的信任）。

### 4.3 四種來源（數值是提案）
| 來源 | 規則 | 單次 | 上限 |
|---|---|---|---|
| **記憶碎片** | 她自己的每一片（撿到即算，播放或跳過都一樣，故事 spec §7.2） | `BOND_PER_PIECE = 3` | 由片數決定：夥伴 15、凜 21 |
| **對話選項** | 每段羈絆場景有一個選項（§7）；偏好的語氣 +3，其他 +2；跳過或自動跳過 +2 | 2 或 3 | `BOND_CAP.talk = 12`（4 段 × 3） |
| **送禮** | 一次回城每人最多收 1 份；最愛 +4、喜歡 +2、普通 +1、婉拒 0（不消耗，§6.3）；同一種素材第 3 份起一律 +1 | 0–4 | `BOND_CAP.gift = 30` |
| **同隊探索與戰鬥** | 見下 | 1–2 | 每趟潛入每人 `BOND_RUN_CAP = 4`；終身 `BOND_CAP.field = 40` |

**同隊探索與戰鬥**（她在出戰陣型裡才算）：
- `floor`：帶著她走下樓梯，+1（每一層一次）。
- `strong`：打贏頭目戰或精英戰時她在陣上，+2。
- `saved`：打贏的戰鬥裡，她曾經倒下或 HP ≤ 30%，戰鬥結束時站著，+2（「救了她一命」；誰救的都算，洛恩永遠在隊上）。
- 判定：`BattleState` 的我方戰鬥者新增旗標 `danger?: true`，在 `resolveRound` 裡她 HP ≤ 30% 或倒下時設上。旗標只記錄、不影響任何計算、不抽亂數。
- 累計：`Run` 新增 `bond: Partial<Record<Companion, number>>`（不存檔，和 `Run` 一樣），每次加分前先看這趟還剩多少；加分直接寫進 `Member.bond.field`，所以**全滅也保留**（裁定，理由同故事 spec §7.2「記憶不是戰利品」：羈絆也不是）。
- 救援戰（相遇）不算：她在戰後才加入。逃跑的戰鬥不算。

### 4.4 防刷與算術（提案的數字必須通過 §12.2 的測試）
| 只靠 | 最高 | 階段 |
|---|---|---|
| 同隊 | 10 + 40 = 50 | 信賴 |
| 送禮 | 10 + 30 = 40 | 信賴 |
| 記憶（凜） | 10 + 21 = 31 | 同行 |
| 對話 | 羈絆場景本身要階段，單靠對話升不了 | ── |
| 同隊＋送禮 | 80 | 羈絆（到不了 85） |
| 全部 | 10 + 15 + 12 + 30 + 40 = 107 → 100 | 心契 |

- 「心契」至少要三種來源。這是「刷一種來源不能把所有人刷滿」的具體保證，用測試鎖住（§12.2 `bond caps keep every single source and every pair below 心契`）。
- 送禮的速度上限：一次回城每人一份，所以送禮最快也要 8 次回城以上才會滿（最愛 ×2 種 ×2 份 = 16，之後每份 +1）。
- 同隊的速度上限：每趟最多 4，所以滿 40 至少要 10 趟和她一起下去。
- 常見的遊玩形狀（提案，§12.2 的節奏測試）：常帶的夥伴到終幕前約在「羈絆」；不常帶、但有送禮和記憶的夥伴也能到「羈絆」；要「心契」必須和她一起潛入 6 趟以上，或接近滿額的送禮。**任何一位夥伴都能走到心契**，不需要特定隊伍。

### 4.5 不會下降（裁定）
- 好感度**沒有任何扣分**：沒帶她、坐冷板凳、全滅、婉拒的禮物、跳過劇情、選了非偏好的選項，都不扣。
- 理由：語氣是「過程沉重晦暗，結局圓滿」；這款遊戲的暗來自失去與選擇，不來自玩家被懲罰。好感度會掉的系統，會讓玩家為了不掉分而只帶固定的人，直接違反「任何隊伍組成都要可以用」。
- 不喜歡的禮物用「婉拒、退還」表現（§6.3）：她告訴你她的喜好，東西還給你，不扣分、不消耗。

### 4.6 決定性（裁定）
- 好感度的每一個加分都是對已發生事件的純函式：碎片數、場景與選擇、送了什麼、戰鬥旗標、下樓。**不需要任何亂數**，所以**不使用任何 rng 串流**。
- 禁止：`Math.random`；為了好感度多抽 `game.rng`、`lootRng`、`memoryRng`、`run.seed` 衍生的任何串流。
- 送禮的反應句由「她收過這種素材幾次」決定索引（`(count - 1) % pool.length`），不抽亂數。
- 城鎮台詞池（`ui2/scenes/town.ts` 用 `game.rng()` 抽一句）若加入戀愛對象的台詞，只是加進同一個池子，**抽的次數不變**。
- 測試：同一個種子、同一串操作，開關好感度功能，`game.rng`、`lootRng`、`memoryRng` 的抽取次數與每一次掉落都相同（§12.2 `bond draws nothing`）。

### 4.7 存檔（裁定：不升版本）
- 新欄位全部是**可選**的加法：`Member.bond?`、`StoryState.gifted?`、`StoryState.talked?`、`StoryState.romance?`、新的 `SceneId`。版本 8 的存檔原樣可讀，讀到的好感度 = 10 ＋ 已找回的碎片 × 3。
- 所以 `SAVE_VERSION` 維持 8，不觸發 `save-reset`。理由：故事 spec §13 的「舊存檔直接重置」是為了不相容的結構；這次的變更完全相容，重置會白白丟掉玩家的進度。若 6d 同時有別的不相容變更，跟著那一次升版即可。
- `engine/save.ts` 的驗證（新增 `validBond(id, m)`，接在 `validMemory` 後面）：
  - `hero` 不可以有 `bond`；
  - `talk` 是 0..`BOND_CAP.talk` 的整數，`field` 是 0..`BOND_CAP.field` 的整數；
  - `gifts` 的鍵都是 `GIFTABLE` 裡的素材，值是 1..999 的整數，而且不可以是她會婉拒的素材（婉拒的禮物不會被記錄；痊癒後的口味見 §6.2）；
  - `story.gifted` 是不重複的夥伴清單；`story.talked` 是布林；
  - `story.romance` 只能在 `finaleCleared` 為真時存在，而且必須在 `ROMANCEABLE` 裡、她已遇見。
- `newStory()` 不必改（欄位可選）；`loadGame` 不做補值，所有讀取一律經過 `bondOf(m)`、`giftedOf(s)` 這類有預設值的存取函式。

### 4.8 介面
- **狀態頁**（`ui2/scenes/statusTabs.ts`）：夥伴的能力頁標題列加一行「好感度　信賴」（洛恩沒有這一行）。能力表本來就是「每個屬性來源一欄」，新來源 `bond` 自動多一欄（§5.2）。
- **冒險者手冊・人物頁**（`ui2/scenes/handbook.ts`）：每位夥伴加一個區塊：
  - 階段名稱與分數（「信賴　四十五／一百」；介面文字可以用阿拉伯數字，劇情文字不行）；
  - 四種來源各自的進度與上限（「送禮　三十／三十（已滿）」），讓玩家看得懂防刷規則，而不是去猜；
  - 已知的喜好：送過一次之後才顯示那種素材是「最愛／喜歡／普通／婉拒」；
  - 已看過的羈絆場景、後日談、戀愛結局，可以重看（故事 spec §8.3）。
- **旅館**（`ui2/scenes/inn.ts`）新增三個指令：「談心」（§8.2）、「送禮」（§6.4）、「星燈祭之夜」（終幕之後，§9.3）。城鎮選單上，有羈絆場景可看時，旅館的標籤加「新」。
- **回城的收穫畫面**（`banked`）：這趟有人升階時多一行「凜的好感度提升到『信賴』。」
- 不新增任何圖示或圖形；用文字與既有的元件（`MenuView`、`Dialogue`、手冊的分頁清單）。

---

## 5. 小幅戰鬥加成

### 5.1 形狀與大小（數值是提案）
- 新的屬性來源 `bond`：加進 `engine/party.ts` 的 `StatSource`，`statSources(m)` 多一項 `{ source: 'bond', stats: bondStats(m) }`。
- `bondStats(m, scale = BOND_SCALE)`：她的**天生數值**（`base` ＋ `growth`，不含裝備、套裝、天賦、記憶）的 `hp`、`atk`、`def`、`mag`、`res` 各乘上 `BOND_PCT[tier]`：

| 階段 | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| `BOND_PCT`（提案） | 0% | 1% | 2% | 3% | 4% |

- **不加**：`spd`（會改變行動順序，也會碰到「凜的基礎能力全隊最快」這條規則）、`tp`、暴擊、量表、任何技能或關鍵天賦。
- 舉例：Lv30 的絲嘉蕾天生 HP 是 48 ＋ 7 × 29 = 251，心契時 +10 HP；攻擊 13 ＋ 2 × 29 = 71，+2。玩家感受得到「她狀態不錯」，但遠小於一件裝備。
- `BOND_SCALE = 1`：設成 0 就整個關掉，給終局連線用（故事 spec §12 的做法，和 `MEMORY_SCALE` 一樣）。

### 5.2 為什麼不是羈絆技能（裁定）
- 9 個專屬羈絆技能，各要自己的平衡與峰值測試，還會和凜的誓約關鍵天賦「不再鳴響的鐘」（洛恩倒下時觸發）重疊。
- 統一的百分比只有一個旋鈕、一條平衡帶，而且對每一位夥伴同一張表：**沒有哪一位的羈絆比較強，所以沒有哪支隊伍因為好感度變成必帶**（故事 spec §4.5）。差別只來自玩家自己投入在誰身上。
- 心契的「回報」放在劇情（特別場景、後日談、戀愛資格），這是使用者選的「劇情為主」。

### 5.3 與平衡模擬的關係（裁定）
- **所有凍結的平衡帶都以好感度 0 計算，一個字都不改。** `engine/sim.ts` 的 `partyAt` 建立的 `Member` 本來就沒有 `bond`，所以 `bondStats` 回傳空物件；第 1–20 項平衡帶的數字逐位元相同。使用者的規則是「平衡只對照預設配點」，預設就是沒有羈絆，和「記憶期望」之外的平衡帶都不帶記憶是同一個道理。
- **新增第 21 項平衡帶「羈絆上限不碾壓」**（新檔 `engine/balance.bond.test.ts`，不動 `balance.test.ts`）：
  - `Lineup` 新增 `bond?: 'max'`：`partyAt` 給每一位夥伴一份 `maxBondRecord(id)`（`talk` 12、`field` 40、送最愛的兩種各若干份把 `gift` 填到 30），不管碎片數都到心契；
  - 用和原帶**完全相同的門檻**重跑：
    - 21a：第 4 項（推薦等級的勝率 ≥ 85%、HP 損失 10–45%）；
    - 21b：第 10 項的記憶期望版（HP 損失下限 10% 仍成立）；
    - 21c：第 11、14 項的「記憶＋深淵上限」版（頭目不會一回合倒下）；
    - 21d：第 9 項「任何組成都能用」的「上限不碾壓」（每一種主角流派的 HP 損失 ≥ 10%）。
  - 任何一項紅了：**只能調低 `BOND_PCT`**，不可以改門檻、`ENEMY_POWER`、`PARTY_SCALE` 或任何凍結的值。
- `data/hero.test.ts` 的峰值護欄不受影響：洛恩沒有好感度。

### 5.4 為什麼不會讓特定隊伍變成必帶
- 加成只在她本人身上、只看她自己的好感度，同一張表；洛恩永遠在場，沒有「某兩人同隊才有」的組合加成。
- 加成的上限 4% 小於第 9 項「任何組成都能用」各陣容之間的差距；第 21d 項直接驗證。

### 5.5 給終局的開關
- `BOND_SCALE` 與 `MEMORY_SCALE` 並列；`bond` 是獨立的屬性來源，連線 PK 可以單獨關掉。

---

## 6. 送禮

### 6.1 可以送什麼（裁定：沿用既有素材）
`GIFTABLE`（`data/story/bond.ts`）＝ `data/materials.ts` 裡 `kind` 為 `monster`、`junk`、`rare`、`region` 的 18 種：

| 種類 | 素材 |
|---|---|
| monster | `moss` 發光苔、`bat-wing` 蝙蝠翼膜、`thorn-fang` 荊棘牙、`crystal-shell` 晶殼碎片、`ice-crystal` 冰晶核、`lizard-scale` 蜥蜴鱗、`star-stone` 星紋石、`dusk-cloth` 暮影布 |
| junk | `old-coin` 古代銀幣 |
| rare | `ancient-gear` 古代齒輪、`star-tear` 星燈之淚、`king-scale` 王者之鱗 |
| region | `blaze-core` 火焰核、`frost-heart` 霜之心、`storm-stone` 雷鳴石、`mire-gland` 毒腺、`shade-crystal` 暗影結晶、`iron-shard` 鋼鐵碎片 |

不能送：
- 精華（`essence-*`）：鍛造屋的貨幣，送禮會和鍛造搶同一份資源，讓玩家覺得在犧牲養成；
- 消耗品（回復藥、歸還之燈……）：戰鬥資源，送出去等於削弱自己；
- 裝備：背包經濟另有規則（5a），而且「送一把劍」的反應很難依每個人寫得自然；
- 碎片（無主、鎮民）：把別人的記憶當禮物，和「空殼」的世界觀（故事 spec §3.1）與「碎片不是收集品」的反目標衝突。

送禮會消耗素材，和賣錢、鍛造之間形成小小的取捨，這是刻意的；稀有素材（星燈之淚 80 G、王者之鱗 100 G）是「很貴的心意」。

### 6.2 每個人的喜好（裁定，依背景）
沒列出的素材一律是「普通」（+1）。「痊癒後」是她集滿記憶之後的口味：傷口好了，曾經婉拒的東西可以收下。痊癒只會把「婉拒」改成「喜歡」或「普通」，**已經收下的素材口味永遠不變**，所以 `giftPoints` 由紀錄推導是穩定的（§12.2 測試）。

| 夥伴 | 最愛（+4） | 喜歡（+2） | 婉拒 | 痊癒後 | 理由 |
|---|---|---|---|---|---|
| 凜 `rin` | 暮影布、荊棘牙 | 暗影結晶、星燈之淚 | 王者之鱗 | ── | 補斗篷、做細針，安靜實用的東西（故事 spec §5 外型）；星燈之淚是她跟著走出來的那一點光（帳本 I-16）。太華麗的東西「躲不了人」。 |
| 瑟蕾 `selene` | 星燈之淚、晶殼碎片 | 發光苔、冰晶核、星紋石 | 古代銀幣 | 古代銀幣 → 喜歡 | 水晶洞窟映著不存在的月亮；微光與星。錢幣一拋就有正反兩面，像在逼她選一個未來；最後一片之後，她「想看見」了。 |
| 千鶴 `chizuru` | 古代銀幣、發光苔 | 星紋石、晶殼碎片 | 冰晶核、霜之心 | ── | 銀幣像投進奉納箱的錢、青苔像神社石階；她在冰裡待了幾十年，冰的冷是她身體的記憶，結局也不勉強她。 |
| 莎菲拉 `safira` | 蜥蜴鱗、王者之鱗 | 星紋石、蝙蝠翼膜 | 火焰核 | 火焰核 → 喜歡 | 亮片與舞衣；熾焰之地是吞掉舞團的沙漠（故事 spec §6），集滿之後她能抱著那份熱度繼續跳。 |
| 希爾薇 `sylvie` | 發光苔、荊棘牙 | 蝙蝠翼膜、蜥蜴鱗 | 毒腺 | 毒腺 → 普通 | 林中夜路的苔、做箭鏃的牙；腐毒沼澤是她的森林腐爛的樣子。 |
| 諾艾兒 `noel` | 雷鳴石、晶殼碎片 | 王者之鱗、星燈之淚 | 星紋石 | 星紋石 → 喜歡 | 她的雷與魔力；貴的東西配「本小姐」。星紋石是星火魔法的觸媒（發明，6e 登記帳本），她怕它；和老師重逢之後，她知道用對了就不可怕。 |
| 波比 `bobby` | 古代齒輪、鋼鐵碎片 | 星紋石、晶殼碎片、雷鳴石 | 毒腺 | ── | 機關與金屬；毒腺會蝕壞齒輪（理由是實務的，不是傷口）。 |
| 莉茲 `liz` | 古代銀幣、王者之鱗 | 星燈之淚、古代齒輪 | 暗影結晶 | 暗影結晶 → 普通 | 估價與錢；她在暗影迴廊的寶庫裡餓得站不起來（故事 spec §6 相遇）。 |
| 絲嘉蕾 `scarlet` | 火焰核、暮影布 | 王者之鱗、星紋石 | 鋼鐵碎片 | 鋼鐵碎片 → 喜歡 | 火焰騎士、騎士的披風；王者之鱗讓她想起王家。鋼鐵要塞是她以為自己逃離的地方，集滿後她明白自己沒有逃。 |

- 婉拒的台詞**不可以劇透**：痊癒前的婉拒只能說到相遇場景已經演出的程度（「這個熱度，我不太想抱著」），不能說出記憶線的內容（「那是吞掉舞團的沙漠」）。痊癒後的那一句可以說。
- 這張表在 6e 開始時登記進帳本（發明登記），6c 的 Task 8–10 寫作者先讀這張表，不寫出和它矛盾的喜好。

### 6.3 價值與遞減（數值是提案）
- `GIFT_VALUE = { loved: 4, liked: 2, neutral: 1 }`；同一種素材給同一個人，第 1、2 份全額，第 3 份起一律 +1（`GIFT_REPEAT_FULL = 2`）。
- 婉拒：不消耗素材、不記錄、0 分，播婉拒的反應句，手冊記下「婉拒」。
- 一次回城每人最多收 1 份（`story.gifted`，出發時清空）。已經收過的人在送禮選單裡是灰的，標「今天已經收過了」。
- `gift` 上限 30 到了之後仍然可以送（反應句照播），只是不再加分；手冊顯示「已滿」，不騙玩家。

### 6.4 流程與反應句
- 旅館「送禮」→ 選一位已遇見、今天還沒收過的夥伴 → 選素材（只列出持有的 `GIFTABLE`，已知口味標在右欄）→ 確認 → `game.give(cid, item)` → 她說一句反應（`Dialogue` 帶她的立繪）。
- 反應句放在 `data/bond.zh-TW.ts` 的 `BOND_TEXT.gift[cid]`：`loved` ≥ 2 句、`liked` ≥ 2 句、`neutral` ≥ 1 句、`declined` ≥ 1 句（每種婉拒素材可以各一句）、`healed` 每種痊癒素材 1 句。每句 ≤ `MAX_LINE_CHARS`，是她一個人說的一句對白。
- 反應的表情（`GIFT_MOOD`）：最愛 `smile`、喜歡 `smile`、普通 `normal`、婉拒 `sad`；個別覆寫：凜最愛 `averted`（她把高興藏起來）、諾艾兒最愛 `smug`、波比最愛 `excited`、莉茲最愛 `scheming`、絲嘉蕾最愛 `serious`（她很少笑）。
- 語氣樣本（給 6e 抓聲音用；照文風聖經的規則，正式文字不可以一字不差地照抄）：

| 夥伴 | 最愛 | 婉拒 |
|---|---|---|
| 凜（揭露前不叫名字、不說「我們」，帳本 I-20） | 「……暮影布。斗篷的邊，剛好破了。」 | 「太亮了。帶著它，躲不了人。……收回去。」 |
| 瑟蕾 | 「星燈之淚……像月亮落下來的一滴呢。謝謝您，洛恩先生。」 | 「錢幣一拋，就有正反兩面呢。……我不想選。您留著吧。」 |
| 千鶴 | 「古代銀幣……讓我想起奉納箱的聲音。失禮了，我收下了。」 | 「冰……抱歉，洛恩大人。這雙手還記得冰裡有多冷。」 |
| 莎菲拉 | 「好亮！縫在舞衣上，轉圈的時候會一閃一閃的啦！」 | 「……這個熱度，我不太想抱著。小洛，換一拍吧。」 |
| 希爾薇 | 「發光苔。……林子裡的夜路，就靠這個。」 | 「毒腺。……這味道，我聞夠了。」 |
| 諾艾兒 | 「哼，雷鳴石？算你有眼光，本小姐的雷正缺這個！」 | 「……不、不要。我……本小姐現在用不到這個。」 |
| 波比 | 「古代齒輪！洛恩哥你看這齒距，嘿嘿，可以拆一整晚喔！」 | 「這個會把齒輪蝕壞喔……謝謝洛恩哥，可是不能讓它進工具箱。」 |
| 莉茲 | 「古代銀幣！老大，這枚少說值……不，這枚我不賣。」 | 「暗影結晶……抱歉老大，看到它，肚子就餓得發慌。」 |
| 絲嘉蕾 | 「火焰核。以我的劍起誓，我會善用它，洛恩閣下。」 | 「鋼鐵要塞的碎片。……恕我失禮，我還沒辦法拿起它。」 |

---

## 7. 回城對話的選項

### 7.1 哪裡有選項（裁定）
- **只在羈絆場景（`bond:*`）裡有選項**，每段剛好一個。
- 既有的 `chat:*`（洛恩、凜各 4 段，夥伴各 2 段）**不加選項**。理由：6c 正在寫它們，回頭加選項等於重寫；而且它們承擔各幕的伏筆，固定的文字比較安全。
- 每位夥伴 4 個選項點，全部加起來 36 個。

### 7.2 三種語氣：每個選項都是洛恩會說的話
洛恩安靜、話少、問的比說的多，溫柔是做出來的（文風聖經）。所以三個選項不是「好、普通、壞」，而是他表達同一份關心的三種方式：

| `Tone` | 名稱 | 寫法 | 例 |
|---|---|---|---|
| `ask` | 問 | 一句短問句，讓她說下去 | 「後來呢？」 |
| `stay` | 陪 | 一個動作，不說話（選項文字用全形括號寫動作） | 「（在她旁邊坐下。）」 |
| `promise` | 約 | 和「回來」有關的約定（他的主題詞，帳本 I-21） | 「下次回來，再說給我聽。」 |

- 每個選項都不可以是英雄式宣言、諷刺、或否定她（文風聖經洛恩的「絕對不會說」）。
- 每位夥伴有一個偏好的語氣（`TONE_PREF`，提案）；偏好 +3，其他 +2，跳過 +2：

| 偏好 | 夥伴 | 理由 |
|---|---|---|
| `ask` | 莎菲拉、諾艾兒、波比 | 莎菲拉要有人接她的拍子；諾艾兒愛炫耀魔法；波比講到機關停不下來 |
| `stay` | 凜、希爾薇、絲嘉蕾 | 凜不喜歡被問；希爾薇寡言；絲嘉蕾需要有人站在她旁邊，而不是她一個人擋在前面 |
| `promise` | 瑟蕾、千鶴、莉茲 | 瑟蕾怕未來，約定給她一個想看見的明天；千鶴重約；莉茲要的是「一起回家」 |

- 差距只有 1 分，四個選項點最多差 4 分。**沒有錯的答案**：任何選項都是加分，回應都是溫暖的；偏好只是讓她的回應多一點點（例如她笑了，或多說了一句）。
- 偏好不寫在介面上；玩家從她的回應感覺出來，手冊不顯示。

### 7.3 劇本格式（6d 的變更）
`data/story.zh-TW.ts`（或 §11.3 的新檔）新增：
```ts
export type Tone = 'ask' | 'stay' | 'promise';
export interface Choice {
  tone: Tone;
  /** Lorne's line (in 「」) or his action (in （）); at most CHOICE_MAX_CHARS. */
  text: string;
  /** What follows this choice: 1–2 lines. */
  reply: ScriptLine[];
}
/** A fork in a bond scene: Lorne picks one of 2–3 ways to say it. */
export interface ChoiceLine { who: 'hero'; choices: Choice[] }
export type SceneLine = ScriptLine | ChoiceLine;
export const CHOICE_MAX_CHARS = 30;
```
- 規則（全部有測試）：只有 `bond:*` 可以有 `ChoiceLine`，而且每段剛好一個；2～3 個選項，語氣不重複；`text` ≤ 30 字、`reply` 1～2 句；`reply` 裡的說話者規則與一般句子相同。
- 句數以最壞的路徑計：選項前的句數 ＋ 1 ＋ 最長的 `reply` ＋ 選項後的句數 ≤ `lineCap(id)`。

### 7.4 引擎與畫面（6d 的變更）
- `ui2/story.ts` 的 `playScene` 遇到 `ChoiceLine`：顯示洛恩的名牌與立繪，在對話框上方開一個 `MenuView`（2～3 項）；確認選一項後播那一項的 `reply`，再繼續。
- 取消鍵在選項上 = 跳過整段（照故事 spec §8.3：顯示摘要），記成跳過。
- 選擇的結果由 `game.bondChoice(id, tone | null)` 寫入（`null` = 跳過或自動跳過，+2），在 `sceneDone` 之前呼叫；同一段場景只計一次分，手冊重看時可以再選，但不加分（`story.seen` 已經有它）。
- `Member.bond.talk` 只增加，不超過 `BOND_CAP.talk`。

---

## 8. 每一階的羈絆內容

### 8.1 內容一覽（數量與句數是提案）
| 內容 | id | 何時 | 句數上限 | 數量 |
|---|---|---|---|---|
| 羈絆場景 1–3 | `bond:c:1`–`3` | 階段 1–3（§8.3 閘門） | 6（含選項） | 9 人 × 3 |
| 心契場景 | `bond:c:4` | 階段 4 | 10（含選項） | 9 |
| 星燈祭（群像） | `epilogue` | 終幕之後第一次回城 | 12 | 1 |
| 後日談 | `ending:c` | 終幕之後 | 6 | 9 |
| 戀愛結局 | `romance:c` | 星燈祭之夜選了她 | 12 | 9（§9.1，全部夥伴） |

- 羈絆場景的形狀：旅館、廣場、鍛造屋門口……城鎮裡的一個小地方；洛恩和她兩個人；一件小事（她在修東西、她睡不著、她在練舞）；一個選項；結尾停在一個畫面。
- 心契場景：她的記憶已經找齊，第一次說出「為什麼她選擇留在這支隊伍」的私人版本，對象是洛恩。每一位都可戀愛（§9.1），所以這一段可以有心動，但**不告白**（告白留給戀愛結局，而且是玩家選了才發生）；心動要寫得讓「沒被選上」也成立：讀起來是深厚的信任，不是等待回應的告白。

### 8.2 播放方式（裁定）
- 羈絆場景**不進回城佇列**，由玩家在旅館「談心」開啟：列出有場景可看的夥伴（標「新」），選一位就播她的下一段。每次回城最多 1 段（`story.talked`，出發時清空）。
- 理由：
  - 回城佇列已經有幕節點、補齊的主角碎片、鎮民交還、凜的揭露，加上每次一段 `chat`；再塞羈絆會讓回城變成看劇情，違反「故事擋住遊玩」的反目標；
  - 主動開啟就沒有「劇情播放設定」的問題，也不會擠掉承擔伏筆的 `chat`；
  - 一次一段，維持節奏，也讓「回城」本身有期待。
- 都可以跳過（跳過算看過，+2），都可以在手冊重看。

### 8.3 閘門：和記憶、各幕、`CHAT_GATE` 咬合，不劇透（提案）
`data/story/bond.ts` 的 `BOND_GATE`：

| 場景 | 夥伴（8 位） | 凜 |
|---|---|---|
| `bond:c:1` | 階段 ≥ 1、碎片 ≥ 1 | 階段 ≥ 1、碎片 ≥ 2 |
| `bond:c:2` | 階段 ≥ 2、碎片 ≥ 3 | 階段 ≥ 2、碎片 ≥ 4（揭露前也可能播） |
| `bond:c:3` | 階段 ≥ 3、碎片 ≥ 4 | 階段 ≥ 3、`oath: true` |
| `bond:c:4` | 階段 4、碎片全滿 | 階段 4、`oath: true` |

- 另外：前一段看過了才開下一段（不跳號，和 `nextChat` 同一條規則）。
- **劇透規則**：羈絆場景的文字只能用到「閘門要求的碎片」為止的記憶內容，以及那一片的位置（`position`）已經知道的世界觀。`story.test.ts` 的 `position()` 擴充：`bond:c:n` 的位置 = 它閘門碎片的位置；`oath` 閘門的 = `rin-reveal` 的位置（與 6c 的 `{ oath: true }` 規則一致）；`ending:*`、`epilogue`、`romance:*` = `after`。既有的 `SPOILERS` 與 `RIN_SECRET_TERMS` 照樣套用，不放寬。
- **凜的特例**：`bond:rin:1`、`bond:rin:2` 在揭露之前播，所以：不叫洛恩的名字、不說「我們」（帳本 I-20）；`bond:rin:2` 的碎片 ≥ 4，她已經開始避開他的視線（帳本 I-11），可以用 `averted` 表情；不可以有 `RIN_SECRET_TERMS`。`bond:rin:3` 起在她選擇之後，叫「洛恩」、說「我們」。
- **心契一定在集滿之後**：所以心契場景可以談她的結局（千鶴的小祠、希爾薇的芽、莎菲拉的廣場……），不必擔心順序。
- 階段由好感度決定，閘門碎片由記憶決定，兩者都只會增加，所以「已經開過的場景又被鎖回去」不會發生。
- 和各幕：羈絆場景不看各幕的階段；需要世界觀的句子由位置規則管住（上面）。

### 8.4 句數上限（`data/story/scenes.ts` 的 `lineCap` 擴充，提案）
`sceneKind` 新增 `'bond' | 'ending' | 'romance'`；`epilogue` 加進 `MAJOR_SCENES`。
- `bond:c:1`–`3`：6；`bond:c:4`：10；`ending:c`：6；`romance:c`：12；`epilogue`：12。

### 8.5 星燈祭與後日談：每個人都圓滿
- **星燈祭**（`epilogue`，major）：終幕之後第一次回城，鎮上第一次辦星燈祭（發明，6e 登記）。已遇見的夥伴各有一句（`if.met`），沒遇見的不出現（終幕已經念過她們的名字）。最壞情況 12 句：開場 1、夥伴 9（凜＋8 位，每人最多 1 句）、結尾 2。它在戀愛選擇**之前**播，所以**不提任何戀愛**。
- **後日談**（`ending:c`，chat 類）：門檻是終幕已過、她已遇見、記憶已集滿；終幕之後的回城佔用那一次的 `chat` 名額（依 `CHARACTER_IDS` 順序，比剩下的一般 `chat` 先）。內容是她圓滿之後的日常（故事 spec §6 的結局延伸），階段 ≥ 3 時多一句（`if.tier`）。**好感度再低也有後日談**：結局不是好感度的獎勵，好感度只是讓那一句更親近。
- 終幕之後才遇見、或才集滿的夥伴：條件一到就輪到她的後日談，不會錯過。
- `ScriptLine.if` 新增 `tier?: { who: Companion; min: BondTier }`；`LineWhen` 新增 `tiers: Partial<Record<Companion, BondTier>>`。

---

## 9. 戀愛結局

### 9.1 誰可以（使用者決定：全部 9 位夥伴）
洛恩是男性。使用者 2026-10-18：諾艾兒與波比「兩人都可以」。所以 `ROMANCEABLE`（`data/story/bond.ts`）＝ 凜＋8 位夥伴，也就是全部的 `Companion`；實作上可以直接寫成 `ROMANCEABLE = COMPANIONS`，並保留這個常數名，讓測試與存檔驗證有一個明確的出處。

| 夥伴 | 戀愛線的核心（給 6e 的寫作方向） |
|---|---|
| 凜 | 全遊戲最強的弧線：被派來殺他，選擇留下；「明天也一起回來吧」本身就是一個約定。 |
| 瑟蕾 | 她在預言裡看見「從深處走出來的人被很多人記住」；她第一次說「我想看見」的未來裡可以有他。 |
| 千鶴 | 她不再為回不去的地方守護，而是為了現在的人；禮數與心意之間的距離很好寫。結局之後可以直接叫他「洛恩」一次（文風聖經）。 |
| 莎菲拉 | 她一直在等有人配合她的拍子。 |
| 希爾薇 | 寡言的人終於說出口；「你走路很輕，像林子裡長大的」。 |
| 諾艾兒 | 好強、嘴硬，被看穿就大聲轉移話題；集滿記憶後改叫「洛恩」而且自己先臉紅（文風聖經）。她怕「再忘記誰的臉」，戀愛線的核心是：這一張臉，她不會再忘。告白時自稱掉回「我」。 |
| 波比 | 開朗、一講到機關就停不下來；終幕她修好燈芯，讓他不必再一個人燒盡自己。戀愛線的核心是：她修好的不是燈，是「他要一個人走下去」這件事。稱呼從「洛恩哥」改不改由 6e 決定並登記帳本。 |
| 莉茲 | 機靈、愛開玩笑的搭檔；家的線圓滿之後，「一起回家」有了新的意思。 |
| 絲嘉蕾 | 從誓言到選擇；「你不是盾，你是我的朋友」之後的下一步。 |

- 可戀愛的人在設定上一律是成年人（發明，6e 登記帳本）。全部夥伴都可戀愛，所以這條適用於 9 位；諾艾兒的「見習」與波比的「洛恩哥」是身分與稱呼，不是年齡。
- 每一位的心契場景、後日談的份量相同；沒被選上的人的後日談不寫失落（§9.5）。

### 9.2 怎麼選（裁定：資格門檻＋玩家明確選擇）
- **資格**：終幕已過；她在 `ROMANCEABLE`；好感度階段 4（心契）；`bond:c:4` 已看過（凜另外一定已選擇，終幕本來就要求）。
- **選擇**：旅館的「星燈祭之夜」指令（終幕之後、還沒選過、至少一人有資格時才出現）。選單：有資格的人（依好感度高到低，同分依 `CHARACTER_IDS`）＋「和大家一起」。
  - 選了她：`story.romance = id`，播 `romance:id`，**這個存檔就此定下，之後不能改**（使用者決定 2026-10-18：「不能改，選擇有份量」）。存檔驗證不需要允許覆寫；`game.chooseRomance` 在 `story.romance` 已存在時回傳失敗。
  - 「和大家一起」：播一段 3 句以內的短場景（全隊在祭典上），這次就不再問；下一次回城指令仍在。不記錄任何東西。
- 為什麼不是「好感度最高的自動成為戀人」：
  - 會把最佳化變成告白：玩家為了平衡帶誰下去，結果被系統配了對象；
  - 平手要另外的規則；
  - 戀愛是玩家的意圖，必須是玩家的選擇。好感度只決定「誰有資格被邀請」。
- 這和故事 spec §5.2「凜的選擇是她的，不是玩家的」不衝突：凜選擇留下（主線），玩家選擇和誰過星燈祭（後日談），是兩件事。

### 9.3 平手與沒有人有資格
- 平手：不存在（明確選擇）；選單排序是決定性的（上面）。
- 沒有人有資格：指令不出現。玩家已經有完整的圓滿結局：終幕、結局卡片、星燈祭、每個人的後日談。遊戲照常繼續（無限深度），之後有人到心契，指令就出現。
- 永遠不選：完全合法，沒有任何懲罰或提示催促。

### 9.4 接在終幕之後的位置
```
第 30 層頭目 → 主角第 9、10 片（補齊）→ 終幕（≤12 句，6c Task 14，不變）→ 結局卡片
→ 回城：星燈祭 epilogue（major，佇列第一）
→ 之後每次回城：一段 ending:c（佔 chat 名額）
→ 任何一次回城：旅館「星燈祭之夜」→ romance:c（玩家選了才播）
```
- 終幕不需要任何改動，也不暗示戀愛。6c Task 14 照原計畫寫。
- 戀愛結局完全在終幕之後，所以一定在凜的選擇之後（6c 的 U3）。

### 9.5 戀愛結局的寫法限制
- 每段最多 12 句；地點是星燈祭的夜晚；洛恩的告白用他自己的方式：不說英雄式宣言，圍繞「回來」（例：以後每一次，都回到她這裡）。
- **其他人仍是重要的同伴**：戀愛結局裡至少一句讓其他夥伴出現（遠處的祭典、某人的祝福），而且沒有任何人失落、吃醋、退出隊伍。
- 選了之後的城鎮：`romanceLines[id]` 的 2 句加進城鎮台詞池（同一次抽籤，§4.6）；其他人的台詞、後日談、心契場景都不改。
- 凜的戀愛結局：她第一次主動說出想要的東西（文風聖經：「揭露之後，她第一次學著說想要什麼」），並呼應「這個名字是我自己決定要用的」。
- 手冊可以重看選過的戀愛結局；沒選的人的戀愛結局不存在於這個存檔。

---

## 10. 立繪差分

### 10.1 表情的分類
| 類別 | id | 誰有 | 用在哪 |
|---|---|---|---|
| 戰鬥 | `normal`、`attack`、`hit`、`dying`、`down`、`ultimate` | 全員（已發佈） | 戰鬥介面（`moodFor`、`showMood`）。故事台詞只可以用 `normal` 與 `down`（倒下、崩潰的瞬間，沿用現有的 `STORY_MOODS`） |
| 對話核心 | `normal`、`smile`、`sad`、`surprised`、`serious`、`blush` | 全員 | 故事與羈絆的對白 |
| 對話專屬 | 見 §10.2 | 各自 | 只有那個人可以用 |

- 戰鬥表情不出現在對話裡（`attack`、`hit`、`ultimate`、`dying` 用在對白會像在打架）；對話表情不出現在戰鬥介面。`normal` 共用。
- 現況：`STORY_MOODS` = `normal`、`smile`、`sad`、`down`。（`miss` 是 `ui2/partyBar.ts` 的 `PulseMood`，戰鬥的閃避提示，不是立繪表情。）
- 核心 6 種的選擇理由：這 6 種是每一個人都會有的反應；不放「生氣」，因為瑟蕾、千鶴、希爾薇的生氣不會寫在臉上，`serious` 涵蓋得比較好。

### 10.2 每個人的完整對話表情（每人 ≥ 8）
| 角色（art id） | 核心 6 | 專屬 | 合計 | 專屬的理由 |
|---|---|---|---|---|
| 洛恩 `hero` | ✓ | `resolve` 決意、`distant` 遠望 | 8 | `resolve`：握著劍看向深處，「回來」的那張臉；`distant`：過去每一輪的殘響浮上來時，像在聽很遠的聲音（帳本 I-41 到 I-46） |
| 凜 `rin` | ✓ | `averted` 移開視線、`guarded` 戒備 | 8 | `averted`：故事 spec §5.1「刻意避開他的視線」、帳本 I-05「在他回頭之前移開視線」；`guarded`：半垂眼、手按刀柄，揭露前的常態 |
| 凜（誓約後）`rin-oath` | ✓ | 同上 | 8 | 同一套表情，領口換成被她敲平的小鐘（故事 spec §5.3）；誓約後 `averted` 變成害羞的那一種，`guarded` 留給鐘守出現的時候 |
| 瑟蕾 `selene` | ✓ | `foresee` 讀月、`wistful` 欲言又止 | 8 | `foresee`：眼裡映著月光、凝望遠方（讀月相、預言）；`wistful`：隔著一點距離的淺笑，她怕話說太清楚會改變未來 |
| 千鶴 `chizuru` | ✓ | `solemn` 祈禱、`bewildered` 愣住 | 8 | `solemn`：閉眼、端正的巫女儀態；`bewildered`：對新東西停一拍（文風聖經：她用詞比別人舊） |
| 莎菲拉 `safira` | ✓ | `wink` 眨眼、`laugh` 大笑 | 8 | 愛逗人、步調輕快；笑聲底下的罪惡感由核心的 `sad` 承擔 |
| 希爾薇 `sylvie` | ✓ | `alert` 警覺、`unguarded` 卸下防備 | 8 | `alert`：側耳、瞇眼看風向（「別出聲」）；`unguarded`：她難得放鬆的臉，給心契與後日談 |
| 諾艾兒 `noel` | ✓ | `smug` 得意、`pout` 嘴硬、`panic` 慌張 | 9 | 「哼」與自誇；被說中時嘴硬；慌的時候自稱掉回「我」 |
| 波比 `bobby` | ✓ | `excited` 眼睛發亮、`grin` 嘿嘿、`focused` 專注 | 9 | 講到機關停不下來；口癖「嘿嘿」；修東西時什麼都看不見 |
| 莉茲 `liz` | ✓ | `scheming` 估價、`hushed` 突然安靜 | 8 | 「這個值多少？」的壞笑；說到家人時突然安靜（文風聖經） |
| 絲嘉蕾 `scarlet` | ✓ | `vow` 起誓、`shaken` 動搖 | 8 | `vow`：手按劍的正式起誓；`shaken`：「不可以再一次轉身」的那份動搖 |

- 每個人另外還能用既有的 `down`，實際可用的表情 ≥ 9。
- 型別（`render/artPaths.ts`）：
  ```ts
  export type CoreMood = 'normal' | 'smile' | 'sad' | 'surprised' | 'serious' | 'blush';
  export type SpecialMood = 'resolve' | 'distant' | 'averted' | 'guarded' | 'foresee' | 'wistful' | 'solemn' | 'bewildered'
    | 'wink' | 'laugh' | 'alert' | 'unguarded' | 'smug' | 'pout' | 'panic' | 'excited' | 'grin' | 'focused'
    | 'scheming' | 'hushed' | 'vow' | 'shaken';
  export type StoryMood = CoreMood | SpecialMood | 'down';
  export const CORE_MOODS: CoreMood[];
  /** The faces each art id may wear in story lines (Rin and her oath look share one list). */
  export const MOODS_OF: Record<string, StoryMood[]>;
  ```
- `story.test.ts` 的 `speakers and moods are valid` 改成：說話者是角色時，`mood` 必須在 `MOODS_OF[who]` 裡；NPC 與旁白照舊不帶 `mood`。

### 10.3 美術還沒到時：一律顯示 `normal`（裁定）
- `ui2/story.ts` 的 `faceOrder`：
  - `normal` → `[normal]`；
  - `smile` → `[smile, normal]`（不變）；
  - `sad` → `[sad, down, normal]`（不變）；
  - 其他新表情 → `[mood, normal]`。**不借用別的情緒**：錯的表情比中性的表情糟。
- `speakerOf` 本來就只挑 `ArtIndex`（manifest）裡有的 url，所以沒有圖的表情不會產生破圖，只會顯示 `normal`；連 `normal` 都沒有就只顯示名字（現況）。
- `allArtUrls()` 不再用 `EXTRA_MOOD_IDS` × `EXTRA_MOODS`，改用已發佈清單：
  ```ts
  /** Story faces on disk, by art id. Each art batch adds its moods here together with the registry entries. */
  export const PUBLISHED_FACES: Record<string, StoryMood[]> = {
    hero: ['smile', 'sad'], rin: ['smile', 'sad'], 'rin-oath': ['smile', 'sad'],
  };
  ```
  初值正好是現在的 6 個 url，所以總數仍是 **246**，`art-factory/starlantern/registry.json` 不變。`MOODS_OF` 宣告了、但還沒發佈的表情不產生 url。
- 每一批美術發佈時，同一個 commit 一起改：`PUBLISHED_FACES`、registry 的 runtime、`render/artPaths.test.ts` 的總數（246 ＋ 這批的張數）。

### 10.4 檔名
- 沿用 `art.portrait(cid, mood)`：`/assets/games/starlantern/char/<artId>-portrait-<mood>.png`（`normal` 沒有後綴）。例：`rin-oath-portrait-averted.png`、`bobby-portrait-grin.png`。
- 美術工廠的 asset id：`char-<artId>-portrait-<mood>`；prompt 檔 `art-factory/starlantern/prompts/char-<artId>-portrait-<mood>.txt`；batch 名稱 `faces-<artId>`。
- 新增張數：洛恩 5、凜 5、凜（誓約後）5、瑟蕾 7、千鶴 7、莎菲拉 7、希爾薇 7、莉茲 7、絲嘉蕾 7、諾艾兒 8、波比 8，共 **73 張**；全部發佈後 `allArtUrls()` = **319**。

### 10.5 美術生成簡報
**流程**（專案美術政策、`art-factory/starlantern/contract.md`）：codex 靜態圖（`codex-image-generation`）→ `sl_art.py process`（頭貼：`--height 115`，`allow_edge: ["bottom"]`）→ 機械 QA（magenta 殘留 0、半透明 0、碰邊只允許底邊；16 px 以下的封閉洞列警告人工看）→ 審核 → 發佈到 `public/assets/games/starlantern/char/` → registry 登記（`raw`、`final`、`qa`、`status`、`chosen_attempt`、`rejected_attempts`、`depends_on`: 該角色的 `char-<artId>-portrait` 與 `char-<id>-standee`）。退件不留在 runtime 路徑。

**共同 prompt**（沿用已發佈的 `char-rin-portrait-smile.txt` 的句型）：
> Square bust portrait in pixel art of exactly the same {girl|young man} as the first attached portrait, same framing, head size, palette, hair and outfit (the second attached image is the same character in full body, for reference only), but {EXPRESSION}. Keep the face recognisably the same person. 16-bit JRPG dialogue portrait style, strict square pixel grid, crisp 1px dark outline, limited palette, light from upper left, no anti-aliasing, no blur, no gradients. Perfectly flat solid pure magenta #FF00FF background around {her|him} with empty margin at the top and sides; the body is cut off by the bottom edge. No frame, no text. Generate the image once with the image tool; do not post-process, resize, quantize or regenerate it.

附圖：第一張 `public/assets/games/starlantern/char/<artId>-portrait.png`，第二張 `<id>-standee.png`。

**核心表情的 `{EXPRESSION}`**：
- `smile`、`sad`：沿用已發佈的句子。
- `surprised`：eyes wide open, brows raised high, mouth a small round open shape, head pulled back slightly.
- `serious`：a firm, focused look, brows level and slightly lowered, lips pressed together, steady eyes looking straight ahead.
- `blush`：a shy, flustered look, a short row of hard-edged pink pixels across both cheeks (no soft gradient), eyes glancing aside, a small embarrassed smile.

**專屬表情與角色注意事項**：
| 角色 | 專屬的 `{EXPRESSION}` | 注意 |
|---|---|---|
| 洛恩 | `resolve`：jaw set, eyes narrowed with quiet determination, looking slightly past the viewer into the distance；`distant`：eyes unfocused and soft, as if hearing a faraway voice, lips slightly parted | 全隊唯一的男性，要和少女們同一款遊戲的畫風（故事 spec §14）；頭貼不帶劍 |
| 凜／凜（誓約後） | `averted`：face turned a little away, eyes looking off to the side, avoiding the viewer；`guarded`：eyes half-lidded and wary, chin lowered, one hand rising to the hilt at her chest | 黑短髮左側一縷銀白、灰紫眼、連帽短斗篷；**領口小銅鐘**：`rin` 有裂痕，`rin-oath` 是被敲平、沒有裂痕的版本，兩套各自附自己的 normal 頭貼，不可以混用 |
| 瑟蕾 | `foresee`：gazing upward into the distance, eyes reflecting pale moonlight as two small hard-edged highlights, calm and entranced；`wistful`：a faint, distant smile with lowered eyes, as if holding back words | 月光用 2–3 個硬邊亮點表現，不用光暈 |
| 千鶴 | `solemn`：eyes closed, head slightly bowed, a composed prayerful calm；`bewildered`：blinking, frozen mid-thought, brows slightly raised, mouth a small flat line | ── |
| 莎菲拉 | `wink`：one eye closed in a playful wink, a teasing grin；`laugh`：laughing openly, eyes squeezed shut, mouth wide | ── |
| 希爾薇 | `alert`：eyes narrowed and sharp, head tilted as if listening to the wind；`unguarded`：a rare relaxed look, soft eyes, the faintest smile | ── |
| 諾艾兒 | `smug`：chin raised, a self-satisfied smirk, eyes half-closed；`pout`：cheeks puffed, lips pushed out, looking away stubbornly；`panic`：eyes wide and darting, a nervous open mouth, a single hard-edged sweat drop | 汗滴是 1–2 個硬邊像素塊，不畫漫畫符號以外的特效 |
| 波比 | `excited`：eyes sparkling wide with two hard-edged highlights, leaning forward, open delighted grin；`grin`：a cheeky toothy grin, one eye slightly narrowed；`focused`：eyes narrowed on something below the frame, tongue tip at the corner of the mouth | ── |
| 莉茲 | `scheming`：a sly sideways smirk, eyes narrowed as if appraising treasure；`hushed`：suddenly quiet, eyes lowered, lips closed, a small still sadness | ── |
| 絲嘉蕾 | `vow`：formal and resolute, chin up, eyes steady, a gloved hand raised to her chest in an oath；`shaken`：eyes wide and unsteady, brows knit, lips parted, composure cracking | ── |

- 任何表情都不放文字、對話框、漫畫符號（汗滴除外，見上）、背景物件。
- 審核：洛恩、凜的兩套照故事 spec §14 由 controller 以玩家角度判斷後直接接入；8 位夥伴是既有已核准畫風的延伸，用既有的審核頁一次給使用者看一批，照美術政策。

---

## 11. 整合計畫

### 11.1 現在 6c 的寫作者該做什麼（Task 7–15）
- **插入一個小的程式任務「6c Task 7.5：對話表情 id」**，計畫檔是 `docs/superpowers/plans/2026-10-18-starlantern-plan6c-moods.md`。它排在 6c **Task 7 之後、Task 8 之前**（控制者裁定），由 6c 的控制者執行，因為它要改 `data/story.zh-TW.ts`，這個檔案在 6c 寫作期間只有一個寫入者：
  - `render/artPaths.ts`：`CoreMood`、`SpecialMood`、`StoryMood`、`MOODS_OF`、`PUBLISHED_FACES`；`allArtUrls()` 改用 `PUBLISHED_FACES`，總數仍 246；
  - `data/story.zh-TW.ts`：`ScriptLine.mood` 改成 `StoryMood`；`STORY_MOODS` 改成依說話者的 `moodsFor(who)`；
  - `ui2/story.ts`：`faceOrder` 依 §10.3；
  - 測試（先紅後綠）：`allArtUrls` 仍 246；`speakerOf(… 'blush')` 在沒發佈時給 `normal` 的圖，發佈後（測試注入 ArtIndex）給 `blush` 的圖；說話者用不屬於自己的專屬表情是紅燈（例：瑟蕾用 `smug`）；**凜的 `averted` 位置規則**：帶 `averted` 的凜的句子，位置必須不早於 `mem:rin:4`，或帶條件（帳本 I-11、I-29：第二幕的城鎮台詞不可以先寫出避開視線）；
  - **重標已經寫好的台詞**：序章、凜的 7 片、各幕節點、洛恩的 10 片與 4 段對話、凜的揭露、凜的回城對話、`rinOath`（Task 4–7 的產出）。
- **Task 8–14 的寫作者**：照 §10.2 替每一句角色台詞標上合適的表情（不標就是 `normal`）。這是零成本的：美術到之前畫面不變，美術到之後自動帶上，不必再回頭重標。
- **Task 8–10**：先讀 §6.2 的喜好表與 §9.1（全部夥伴都可戀愛），不寫出和它們矛盾的事實（例：希爾薇喜歡毒腺、把某位夥伴寫成和洛恩之間不可能有戀愛的關係，例如把波比的「洛恩哥」寫成親兄妹）。**不要**在 `chat:*` 加選項、不要寫羈絆場景、後日談、戀愛：格式還不存在。
- **Task 11–13**：不受影響（鎮民沒有好感度、沒有表情）。
- **Task 14（終幕）**：照原計畫 12 句；不暗示戀愛，不提星燈祭（那是 6e 的群像場景）。
- **Task 15**：照原計畫；`PLACEHOLDERS.size === 0` 只管 `data/story.zh-TW.ts`，好感度的文字另有自己的清單（§11.3），不會互相干擾。
- 已經寫好的 Task 4–7 由 Task 7.5 一次重標，Task 15 的連續性審查只需要抽查。

### 11.2 新的引擎計畫「6d：好感度」（6c Task 15 之後開始）
在 6c 結束之後開始，因為它要改 `ScriptLine`、`linesWhen`、`SceneId` 與 `story.test.ts` 的位置規則，這些是 6c 寫作期間的共用檔。全部文字用暫定文案（`bondPh()`），由 6e 寫。

| Task | 內容 | 主要檔案 |
|---|---|---|
| 1 | 好感度資料與推導：`BondRecord`、`bondPoints`、`bondTier`、`BOND_*` 常數、`GIFTABLE`、`GIFT_TASTE`、`TONE_PREF`、`ROMANCEABLE`、`BOND_GATE` | `data/story/bond.ts`（新）、`engine/story/bond.ts`（新）、`engine/types.ts` |
| 2 | 存檔驗證（不升版本）：`validBond`、`StoryState` 的可選欄位；v8 存檔可讀 | `engine/save.ts`、`engine/state.ts` |
| 3 | 屬性來源 `bond` 與第 21 項平衡帶；`Lineup.bond`、`maxBondRecord` | `engine/party.ts`、`engine/sim.ts`、`engine/balance.bond.test.ts`（新） |
| 4 | 同隊來源：`danger` 旗標、`Run.bond`、下樓／強敵／救命的加分、每趟上限；`bond draws nothing` 測試 | `engine/battle.ts`、`engine/game.ts`、`engine/dungeon/run.ts` |
| 5 | 送禮：`game.give`、喜好與遞減、每次回城一份、婉拒不消耗 | `engine/story/bond.ts`、`engine/game.ts` |
| 6 | 劇本格式：`ChoiceLine`、`if.tier`、`SceneId` 擴充、`lineCap`、`sceneKind`；位置規則與劇透檢查擴充；`game.bondChoice` | `data/story.zh-TW.ts`、`data/story/scenes.ts`、`data/story/story.test.ts`、`engine/story/events.ts` |
| 7 | 播放：`playScene` 的選項、旅館「談心」「送禮」、城鎮的「新」標記 | `ui2/story.ts`、`ui2/scenes/inn.ts`、`ui2/scenes/town.ts`、`data/text.zh-TW.ts` |
| 8 | 終幕之後：`epilogue` 入佇列、`ending:*` 佔 chat 名額、「星燈祭之夜」與 `story.romance` | `engine/story/events.ts`、`engine/game.ts`、`ui2/scenes/inn.ts` |
| 9 | 顯示：狀態頁的好感度行、手冊人物頁的區塊、收穫畫面的升階行 | `ui2/scenes/statusTabs.ts`、`ui2/scenes/handbook.ts`、`ui2/scenes/town.ts` |
| 10 | 收尾：全套、平衡（含第 21 項）、e2e（送禮、談心選項、跳過、星燈祭選擇）、截圖 | `tests/e2e/starlantern.spec.ts` |

### 11.3 新的寫作計畫「6e：羈絆的文字」（6d 之後）
- 新檔 `data/bond.zh-TW.ts`：羈絆場景、送禮反應、星燈祭、後日談、戀愛結局、`romanceLines`；自己的 `BOND_PLACEHOLDERS` 與閘門測試（照 6c 的 `WRITTEN` 做法），結束時為 0。場景由 `buildScenes` 合併進 `STORY.scenes`。
- 工作量：羈絆場景 36 段（每人 3 段 ≤ 6 句＋心契 ≤ 10 句）、選項 36 組、送禮反應約 9 × 7 句、星燈祭 1 段、後日談 9 段、戀愛結局 9 段、戀愛後城鎮台詞 9 × 2 句。
- 帳本新增：喜好表、星燈祭、可戀愛者為成年人、諾艾兒與星紋石、每位夥伴的心契內容。
- 審查清單沿用 6c 的寫作任務審查清單，另加：選項沒有錯的答案（每一個回應都溫暖）；戀愛結局裡其他人沒有失落；凜在 `bond:rin:1`、`2` 不叫名字、不說「我們」。

### 11.4 新的美術計畫「5e：對話表情差分」（現在就可以開始，與 6c、6d 並行）
- 範圍：§10.4 的 73 張、§10.5 的簡報。
- 依賴：只依賴 §10 的 id（本文件核准即可），以及 6c Task 7.5 的 `PUBLISHED_FACES`（發佈的那一步要等它）。生成、後處理、QA 可以先做。
- 批次順序：洛恩與凜（兩套）先（開局就看得到、他們的文字最多）；再依 6c 寫作的順序：瑟蕾、千鶴、莎菲拉 → 希爾薇、諾艾兒、波比 → 莉茲、絲嘉蕾。
- 每一批的 commit：圖、registry、`PUBLISHED_FACES`、`artPaths.test.ts` 的總數一起改；`published.test.ts` 與 registry 測試必須綠。
- 不碰 `data/story.zh-TW.ts`。

### 11.5 順序建議（重工最少）
```
現在 ─┬─ 6c Task 7 → Task 7.5（表情 id＋重標 Task 4–7）→ 6c Task 8–15（寫作時順手標表情）
      └─ 5e 美術（生成與 QA；發佈等 7.5）
6c 完成 → 6d 好感度引擎（暫定文案）→ 6e 羈絆文字
5e 的每一批隨時發佈
```
- 為什麼這樣排：
  - 表情 id 早一步定下，寫作者只標一次；Task 4–7 的產出由 7.5 一次重標，Task 8 以後不必回頭；
  - 6d 動的是 6c 寫作期間的共用檔，等 6c 收尾再動，避免兩個寫入者搶同一個檔；
  - 6e 要用 6c 寫好的每個人的聲音與記憶內容，也要用 6d 的格式；
  - 美術和文字完全分開，任何時候發佈都不影響文字，因為缺圖時顯示 `normal`。

---

## 12. 驗收

### 12.1 6c Task 7.5（表情 id；細節見 `docs/superpowers/plans/2026-10-18-starlantern-plan6c-moods.md`）
- `allArtUrls()` 長度 246、不重複，和 registry 的 runtime 完全相同（既有測試不改數字）。
- `MOODS_OF`：每個 art id 的對話表情 ≥ 8，都含核心 6 種；`rin` 與 `rin-oath` 相同；專屬表情只屬於一個人（`averted`、`guarded` 屬於凜的兩套）。
- `speakerOf`：沒發佈的新表情 → `normal` 的圖；發佈的 → 那張圖；`sad` 仍是 `sad → down → normal`。
- 故事台詞：說話者是角色時 `mood ∈ MOODS_OF[artId]`；凜的 `averted` 位置不早於 `mem:rin:4`（或帶條件）。

### 12.2 6d（好感度引擎）
TDD：每一條先寫成失敗的測試。
- **模型**：`bondPoints` 的公式；`bondTier` 的門檻（19→0、20→1、84→3、85→4、100→4）；洛恩沒有好感度；凜開局 10。
- `bond caps keep every single source and every pair below 心契`：任何一種來源加滿，階段 ≤ 2；任何兩種加滿，分數 < 85；四種加滿 = 100。
- **記憶**：v8 存檔（沒有 `bond`）載入後，好感度 = 10 ＋ 3 × 碎片數；跳過回憶也算。
- **不會下降**：全滅、坐冷板凳、婉拒、跳過，每一種之後分數都不變少（性質測試：任意一串操作，`bondPoints` 單調不減）。
- **同隊**：下樓 +1；頭目／精英 +2；`danger` 且活著結束 +2；每趟 4 的上限；終身 40 的上限；全滅保留已得的分；逃跑與救援戰不加分；不在陣上的人不加分。
- `bond draws nothing`：同一個種子與同一串操作，開關好感度功能（`BOND_ENABLED` 測試旗標，或比較加入 bond 前的錄製結果），`game.rng`、`lootRng`、`memoryRng` 的抽取次數與每一次的掉落都相同。
- **送禮**：喜好表的每一格；第 3 份起 +1；上限 30；一次回城一份；婉拒不消耗、不記錄；痊癒後的口味只在集滿後生效；已收下的素材口味永不改變（列舉每位夥伴的每一種素材）；不能送給洛恩、沒遇見的人、精華、消耗品、碎片。
- **選項**：每段 `bond:*` 剛好一個 `ChoiceLine`；2～3 個選項、語氣不重複；`text` ≤ 30 字；每個選項的分數 ∈ {2, 3}，最大最小差 ≤ 1；跳過 +2；同一段只計一次；手冊重看不加分。
- **閘門**：`BOND_GATE` 的每一列；不跳號；凜的 `bond:rin:3`、`4` 要 `oath`；位置規則讓 `SPOILERS` 與 `RIN_SECRET_TERMS` 照樣適用於 `bond:*`。
- **播放**：「談心」每次回城最多一段；羈絆場景不進回城佇列；`arrivalScenes` 的結果在沒有好感度內容時與現在相同（回歸）。
- **終幕之後**：`epilogue` 在終幕之後第一次回城排第一；`ending:c` 只要已遇見＋集滿＋終幕已過就會輪到，好感度 0 也一樣；終幕之後才遇見的夥伴也輪得到。
- **戀愛**：`ROMANCEABLE` 等於全部 9 位夥伴、不含洛恩；沒有人有資格時指令不出現；資格四個條件逐一檢查；選單排序決定性；選了之後 `story.romance` 固定、指令消失，再呼叫 `chooseRomance` 回傳失敗、值不變；「和大家一起」不記錄；`story.romance` 的存檔驗證（必須 `finaleCleared`、在 `ROMANCEABLE`、已遇見）。
- **存檔**：`SAVE_VERSION` 仍是 8；v8 舊檔可讀；`hero.bond`、超過上限、送了婉拒的素材、`romance` 不合法，各自被判為 corrupt。
- **平衡**：第 1–20 項的數字與 6d 之前逐位元相同（`partyAt` 不帶 `bond`）；第 21a–21d 項綠；`data/hero.test.ts` 綠。
- **e2e**：送一份最愛與一份婉拒（婉拒後素材數不變）；談心選一個選項、再跳過一段；終幕存檔進星燈祭、選一位、手冊重看。

### 12.2.1 節奏的參考測試（提案，不是凍結的平衡帶）
- 一條腳本化的遊玩（例：每趟帶固定 4 位、每次回城送一份喜歡的素材、碎片照 `memoryPace`），到本道第 30 層時：常帶的 4 位在「羈絆」以上；沒帶的 4 位在「同行」到「羈絆」之間；沒有任何人只靠一種來源到「心契」。這條用來調 §4 的提案數字，不是門檻。

### 12.3 6e（文字）
- `BOND_PLACEHOLDERS.size === 0`；每一段 ≤ `lineCap`、每一句 ≤ 60 字、說話者與表情合法、沒遇見的人不開口、每段有摘要；劇透詞的位置；凜揭露前的稱呼規則；戀愛結局裡至少一句有其他夥伴、沒有負面的失落；送禮的每一格都有反應句。

### 12.4 5e（美術）
- 每張圖通過 `sl_art.py` 的 QA；registry 完整；退件不在 runtime；每一批之後 `allArtUrls()` 的總數 = 246 ＋ 已發佈張數，全部完成時 319；截圖：每位角色的 8～9 種表情並排一張，確認是同一個人、同一個畫風。

---

## 13. 提案數字一覽（實作時可以在測試護欄內調整）
| 常數 | 提案值 | 護欄 |
|---|---|---|
| `BOND_START` | 10 | ── |
| 階段門檻 | 0／20／40／60／85 | 任兩種來源加滿 < 心契 |
| `BOND_PER_PIECE` | 3 | 同上 |
| `BOND_CAP` | talk 12、gift 30、field 40 | 同上 |
| `BOND_RUN_CAP` | 4 | ── |
| 同隊加分 | 下樓 1、強敵 2、救命 2 | ── |
| `GIFT_VALUE` | 4／2／1；第 3 份起 1 | 同上 |
| 選項分數 | 偏好 3、其他 2、跳過 2 | 差距 ≤ 1，永遠 > 0 |
| `BOND_PCT` | 0／1／2／3／4 % | 第 21 項平衡帶；只能調低 |
| 句數上限 | 羈絆 6、心契 10、後日談 6、星燈祭 12、戀愛 12 | ── |

---

## 14. 使用者已決定的事（2026-10-18）
1. **諾艾兒與波比也可以戀愛**：「兩人都可以」。全部 9 位夥伴都在 `ROMANCEABLE`（§9.1）；戀愛結局 9 段（§8.1、§11.3）。
2. **戀愛對象一經選定，同一個存檔不能改**：「不能改，選擇有份量」。手冊可以重看選過的那一段（§9.2）。

目前沒有其他需要使用者決定的事。
