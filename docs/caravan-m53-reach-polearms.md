# Caravan M53 — Reach & Polearm Doctrine

## Problem

M49–M52 已經讓《商隊與劍》具備前後排、近戰／遠程距離、老兵換位、護甲材質、武器熟練、雙手武器與盾牌取捨，但物理武器距離仍幾乎只有兩種：

- 前排刀劍／錘杖；
- 後排弓弩。

這不符合中世紀戰場最常見的第三種角色：站在前線後方、依靠長柄越過同伴肩線作戰的槍兵與長槍手。

M53 加入 `reach` 交戰距離與 `polearm` 武器流派，目標不是再做一把傷害更大的劍，而是新增一個可被前線崩潰、負重、盾牌與跨職熟練反制的第三種站位構築。

## Reach engagement

`EngagementBand` 現在包含：

- `melee`
- `ranged`
- `reach`
- `mystic`

### Reach in rear rank

後排長柄攻擊命中修正 **0**。

這代表只要仍有真正的存活前排，槍兵能從第二列越肩刺擊，不必像普通近戰一樣承受後排 `-2`。

### Reach in front rank

前排長柄攻擊命中 **-1**。

長柄並非在近身時失去功能，因此沒有給到弓弩同等的 `-2`；但槍桿長度與展開空間仍使它不應成為無視站位的萬用武器。

### No positive positioning bonus

正確站位只移除懲罰，不提供 `+1/+2` 額外命中。

這延續 M49/M50 的核心原則：站位選擇決定你是否承擔代價，不再疊一層隱藏的最佳解數值。

## Frontline dependency

Reach 的後排優勢不是永久安全區。

M49 的前線崩潰規則仍然優先：

1. 最後前排倒下；
2. 存活後排被推進前線；
3. 槍兵的 runtime `formationRow` 變成 `front`；
4. 同一招式立即從 `〔長柄〕` 變成 `〔長柄 -1〕`。

全員後排的非法開場也會被 M49 正規化成前排，因此不能靠全隊長槍建立「沒人接敵、大家卻都在安全第二列」的漏洞。

## Polearm equipment

### 白蠟木戰矛

- 啟程之鎮可買
- 無等級門檻
- 負重 2
- 雙手武器
- 長柄 `reach`
- 1d8 + STR 刺擊
- 穿甲 1
- 無被動屬性

它刻意比鹽晶劍的直接輸出低，換取第二列作戰與少量穿甲能力。

### 鹽鋼長槍

- 鹽泉城可買
- Lv3+
- 負重 3
- 雙手武器
- 長柄 `reach`
- 1d10 + STR 刺擊
- 穿甲 2
- 無被動屬性

它是成熟的長柄選項，但仍不是古王之劍等高階刀劍的純傷害上位版；額外穿甲要用價格、等級與負重交換。

## M43 armory integration

新增 `polearm` 武器熟練：

- 劍士：熟練
- 游俠：可用
- 教士：可用
- 法師：勉強運用

跨職不被禁止。

法師硬拿戰矛仍能打，但會沿用 M43 的勉強運用代價：武器招式命中 -2、傷害 -1、負重 +1。

這讓長柄身份由武器與訓練共同決定，而不是鎖死在某一職業。

## M52 shield interaction

兩把長柄都是雙手武器。

若角色副手帶盾：

- 盾牌仍留在裝備意圖中；
- 盾牌仍算完整負重；
- 盾牌進入收起狀態；
- `shieldGuardBonus = 0`。

因此長柄不能同時取得「第二列 reach」與「持盾守勢」兩套優勢。

## M48 armor interaction

長柄使用刺擊屬性，並且兩把實體長柄都有有限穿甲：

- 戰矛：1
- 鹽鋼長槍：2

這讓長柄對鎖甲有戰術理由，但穿甲仍小於直接把護甲系統作廢的程度。

## M50 player-information contract

玩家按下攻擊以前就能看到：

- 後排：`越肩突刺〔長柄〕`
- 前排：`越肩突刺〔長柄 -1〕`

完整 forecast 會說明前排的「長柄近身壓力」。

前線崩潰或 M51 換位改變 runtime row 後，action label 使用 getter 即時更新，不保存過期提示。

Arcana 的 M50/M51/M52 suffix cleanup 也加入長柄格式，避免重複進戰後出現 `〔長柄〕〔長柄〕`。

## Multidimensional player adversarial review

Automated gates attack M53 from these player perspectives:

1. **Implicit-reach abuse** — 普通 STR 刺擊不能因為是 `pierce` 就自動變長柄；必須明確標記 `engagement: 'reach'`。
2. **Phantom safe rank** — 沒有真正前排時，M49 仍會把長柄使用者推進前線。
3. **Universal-row weapon** — reach 後排為 0、前排為 -1，不提供任何正命中加成。
4. **Blade replacement** — 戰矛與長槍的純傷害上限低於相近刀劍，交換的是距離與穿甲。
5. **Shield stacking** — 長柄是雙手武器，M52 盾牌只能收起且仍算負重。
6. **Cross-training bypass** — polearm 必須完整走 M43 weapon-fit 代價。
7. **Tier dominance** — 鹽鋼長槍比戰矛更強，但需 Lv3、更高價格與更高負重。
8. **Feature smuggling** — 新武器不額外帶 AOE、暈眩、被動 Defense、HP 或屬性。
9. **Magic truth** — 真正魔法永遠優先成為 `mystic`，即使資料誤帶 reach marker 也不吃物理站位懲罰。
10. **Information fairness** — `長柄` / `長柄 -1` 在出手前必須與引擎真實修正一致。
11. **Dynamic collapse truth** — 前線死亡後，實際 row 與 action label 必須同步更新。
12. **Idempotency** — 重複 `startCombat()` 不得堆疊長柄 suffix。
13. **Economy integration** — 兩把武器都必須有真實城鎮取得路徑。
14. **Regression** — M40–M52 的魔法、耐久、武裝、儀式、護運、士氣、護甲、站位、老兵與盾牌 gate 全部保持綠燈。

## Rejected alternatives

### Reach has no frontline penalty

Rejected. 這會讓長柄同時擁有後排安全與前排零代價，太接近萬用物理武器。

### Reach gets +1 from rear rank

Rejected. M49 起正確站位從來不是額外數值 buff；它只是避免錯位懲罰。

### Treat spear as ranged

Rejected. 這會讓長槍和弓弩共用前排 -2，並在 UI 上顯示「遠程」，失去長柄本身的戰場身份。

### One-handed spear + shield for M53

Rejected for this milestone. 那會同時引入單手／雙手握法切換與盾牌聯動，難以判斷到底是 reach 還是盾牌構築造成支配性。M53 先鎖定雙手戰矛／長槍。

### Add automatic counterattack / brace

Rejected for M53. 敵人目前沒有明確「衝鋒／進入射程」事件；直接做 brace counter 會建立一個缺乏可讀觸發條件的新反應系統。先讓 reach 本身成立，再考慮未來有公開意圖的衝鋒反制。

## Acceptance target

M53 成功時，玩家面前應形成三個清楚但互有代價的物理位置選擇：

- 前排刀劍／錘杖：近身最穩，可搭盾；
- 後排弓弩：遠程輸出強，被逼前排吃 -2；
- 第二列長柄：用 STR 從後排作戰，被逼前排吃 -1，且雙手占用放棄盾牌。

任何一種都不應成為所有角色、所有站位、所有敵人的普遍最佳答案。
