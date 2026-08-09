# Caravan M52 — Offhand Shields & Handedness

## Problem

M43–M51 已經讓《商隊與劍》的武器熟練、護甲材質、前後排、魔法資源、守勢與老兵換位形成可玩的戰術網路，但「角色有幾隻手」仍不存在於規則裡。

這造成三個中世紀劍與魔法世界不應存在的漏洞：

1. 弓與法杖可以在概念上和任何副手防禦同時存在；
2. 通用守勢與鐵壁衛曾使用盾牌語彙，卻沒有真正的盾牌裝備來源；
3. 若只是新增第四個裝備欄並給常駐 Defense，盾牌會變成所有角色無腦必裝的第四件護甲。

M52 補的是「手部占用與主動守勢」而不是另一層被動數值。

## Equipment model

M52 以 optional `offhand` 軟擴充現有 v6 `equipment` JSON：

- 舊存檔仍只有 `weapon / armor / trinket` 也完全合法；
- 讀取舊角色不會因為檢查副手而修改存檔；
- 新副手值可自然由 JSON 持久化，不需要提升 save version；
- 既有三欄強化規則不會把副手誤當成第四條鍛造數值線。

## Handedness

目前明確視為雙手武器：

- 霧嶺反曲弓
- 幽焰法杖
- 鹽晶法杖
- 劍聖木刀

其他既有刀劍／錘杖視為單手。

游俠即使武器 item 欄是空的，職業基礎招式仍明確使用弓，因此其預設弓也視為雙手。這阻止玩家利用「空裝備欄」在射箭時偷開盾牌。

## Shields

### 橡木小圓盾

- 啟程之鎮可買
- 負重 1
- 真正持用時，`防禦架勢` 額外 +1 Defense
- 無常駐 Defense

### 鹽鋼鳶盾

- 鹽泉城可買，Lv3+
- 負重 2
- 真正持用時，`防禦架勢` 額外 +2 Defense
- 真正持用時秘法上限 -1
- 無常駐 Defense

盾牌加成被硬性限制在 +2 以內，避免後續裝備把守勢堆成接近不可命中的狀態。

## Stowed shield rule

若角色目前使用雙手武器，副手盾牌不會被系統自動卸下或丟回背包，而是進入「收起」狀態：

- 盾牌仍算負重；
- 不提供守勢加成；
- 鹽鋼鳶盾的持盾施法干擾也不生效；
- 換回單手武器後，盾牌自然重新可用。

這保留玩家的裝備意圖，不讓切武器變成背包管理副作用，同時堵住雙手武器＋盾牌的戰鬥 exploit。

## Guard integration

基礎守勢仍然是 +4 Defense。

M52 只在 `state.guarding` 為真時額外加入 ready shield bonus：

- 無盾／盾收起：+4
- 橡木小圓盾：+5
- 鹽鋼鳶盾：+6

角色面板的常駐 `member.defense` 完全不因盾牌改變。

因此「帶盾」本身不是收益；玩家必須花一個回合進入守勢，或透過 M51 精通 II 的 guarded advance 才能兌現盾牌價值。

## M51 interaction

精通 II 的 `戰術換位〔前進・守勢〕` 使用同一個 `state.guarding`。

若盾牌 ready，按鈕會在出手前直接顯示：

- `戰術換位〔前進・守勢・盾+1〕`

並在提示裡顯示實際總 Defense bonus。盾牌收起時不顯示任何盾牌加成。

## Bulwark semantic correction

為了維持舊存檔與測試相容，鐵壁衛技能內部 ID `shield-bash` 不改。

實戰玩家面向則跟真正裝備同步：

- 盾牌 ready：`盾牆猛擊`
- 沒盾／盾收起：`壁壘猛擊`

無盾版本改用肩甲、護具與武器架勢撞擊，不會憑空生成盾牌；技能仍然可用，因此不會把既有 Lv4 專精變成死 Build。

## Player information contract

武裝整備所會在出發前顯示：

- 單手／雙手
- 副手盾牌名稱
- 盾牌「就緒」或「收起」
- 守勢額外加值
- 副手負重
- 大盾的秘法代價

戰鬥 action label 也會顯示 ready shield，例如：

- `防禦架勢〔護衛・盾+2〕`
- `防禦架勢〔自保・盾+1〕`
- `戰術換位〔前進・守勢・盾+1〕`

收起的盾不會出現在 action bonus 上。

## Multidimensional adversarial review

M52 automated gates attack the feature from these player perspectives:

1. **Mandatory-slot abuse** — shield must not change passive stats, HP, Defense or damage.
2. **Two-hand exploit** — bow/staff/two-hand weapon + shield cannot receive active shield guard.
3. **Empty-slot exploit** — ranger default bow remains two-handed even without a weapon item.
4. **Burden laundering** — stowed shield still counts its full burden.
5. **Caster punishment truth** — kite-shield mana penalty applies only while physically ready.
6. **Strict upgrade dominance** — stronger kite shield pays more burden and casting opportunity cost than buckler.
7. **Information fairness** — pre-action label/hint must match the exact guard bonus used by combat.
8. **Guard math** — deterministic A/B verifies +4 / +5 / +6 thresholds.
9. **M51 interaction** — guarded advance receives shield bonus through the same guard state, not a parallel buff.
10. **Bulwark compatibility** — `shield-bash` ID remains stable; text adapts to actual equipment.
11. **Save compatibility** — reading legacy three-slot equipment does not mutate it or require migration.
12. **Economy integration** — both shields must be obtainable in actual town stock.
13. **Regression** — M40–M51 combat, magic, armory, endurance, rituals, convoy, morale, armor, formation and veteran gates remain green.

## Rejected alternatives

### Shield = permanent Defense bonus

Rejected. This turns offhand into a mandatory fourth armor slot and gives shield value without a player decision.

### Equipping a two-handed weapon automatically unequips the shield

Rejected. It repeatedly mutates the player's inventory/loadout when switching weapons and creates unnecessary equipment churn.

### Carry shield with a two-handed weapon and keep shield benefit

Rejected. It is physically incoherent and strictly dominates two-handed loadouts without offhand.

### Give shield its own attack move

Rejected for M52. That would make shield automatically increase both offense and defense and create another move-loadout axis. M52's purpose is to deepen guard decisions first.

### Require a shield for the Bulwark specialization

Rejected. Existing characters chose Bulwark before shields existed; hard-requiring one would retroactively create dead buttons. The technique instead adapts its narration and name to real equipment.

## Acceptance target

A successful M52 means choosing a shield is a meaningful medieval-fantasy loadout decision:

- one-handed + shield gains stronger *active* defense;
- two-handed weapon retains its weapon identity but gives up active offhand defense;
- heavy shield is stronger at guarding but heavier and more awkward for arcane casting;
- no choice becomes a universal passive upgrade;
- the player can see every important consequence before committing either equipment or combat actions.
