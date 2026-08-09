# Caravan M54 — Enemy Formation Parity

## Problem

M49–M53 已經讓玩家方的前後排、近戰／遠程／長柄／魔法距離、盾牌與前線崩潰形成一套可讀的戰術規則，但敵方仍存在明顯的不對稱：

1. 敵人沒有 `formationRow`，因此敵方弓手與近戰永遠不吃站位命中懲罰；
2. 玩家近戰可以直接點殺敵方後排施法者／弓手，而敵方近戰卻會先被我方前排擋住；
3. 敵方遠程也無法真正利用「越過前線」威脅玩家後排，造成後排過度安全；
4. `山嵐箭` 與 `枯骨箭` 是明確的弓箭敘事，但因為早於 M49 建立而缺少 `pierce/ranged` metadata，實際被系統當成近戰。

M54 的目標不是讓敵人單純變強，而是讓**雙方遵守同一套戰線物理規則**。

## Enemy rows

`EnemyUnit` 新增 optional runtime `formationRow`，不進存檔、不需要 migration。

開戰時 M54 依招式保守推導站位：

- 有真正 melee attack → 前排；
- 有 Guard 且沒有既定 row → 前排；
- 純 ranged / reach / mystic / support → 後排；
- encounter 明確寫出的 `formationRow` 永遠優先。

若整個遭遇推導後沒有任何前排，所有存活敵人都會被推到前排，避免產生沒有掩護者卻能享受後排保護的「幽靈戰線」。

## Symmetric line protection

只要敵方仍有存活前排：

- 玩家 **melee** 不能指定敵方後排；
- 玩家 **reach** 也不能越過敵方前線；
- 玩家 **ranged** 可以越線；
- 玩家真正的 **mystic** 魔法可以越線。

被戰線擋住的單體攻擊會回傳可讀原因，且 `acted:false`：

> 後排敵人仍受前線保護；近戰／長柄必須先處理前排。

因此誤點不會浪費玩家一回合。

物理 melee/reach 的 area attack 也只會作用於合法前排，不會因為寫成 `area:true` 就偷偷穿過戰線。Ranged/mystic area 仍可越線。

## Enemy attacks obey the same geometry

敵方現在也把自己的 `formationRow` 傳入 M49/M53 `formationAttackProfile()`：

- 後排近戰：命中 -2；
- 前排弓弩：命中 -2；
- 前排長柄：命中 -1；
- 正確後排弓弩／長柄：沒有額外正命中；
- 真正魔法仍不受 mundane row penalty。

敵人選擇玩家目標時亦使用同一個分類：

- melee/reach 必須先打我方存活前排；
- ranged/mystic 可以威脅任何存活成員，會優先依既有 AI 尋找低生命目標；
- 但我方前排若已進 Guard，仍可用既有攔截規則替後排接下單體攻擊。

所以後排從「絕對安全區」變成「需要前排與 Guard 維持的相對安全區」。

## Enemy frontline collapse

當最後一名敵方前排倒下：

- 所有存活敵方後排立即被推到前排；
- 弓手開始承受前排 ranged -2；
- 長柄開始承受前排 reach -1；
- 玩家 melee/reach 可以直接攻擊這些暴露單位；
- combat log 公開提示「敵方前線崩潰」。

這與玩家 M49 frontline collapse 同構，避免雙方規則不一致。

## Legacy enemy bow correction

M54 在 combat runtime 修正兩個 pre-M49 資料：

- `ridge-arrow`
- `bone-arrow`

兩者會被補成：

- `engagement: 'ranged'`
- `element: 'pierce'`（若原資料缺少）

這只修正戰鬥 runtime，不建立新存檔欄位，也不依名稱通用猜測其他技能；只有兩個已知、敘事明確的舊資料 ID 被修復。

## Player information contract

M54 不把戰線規則藏在 miss chance 裡：

- 開戰 log 直接列出敵方前／後排；
- log 清楚說明 melee/reach 必須先破前線、ranged/mystic 可越線；
- 被保護的後排遭非法近戰指定時，會立即顯示原因且不耗回合；
- 敵方前線崩潰時有獨立提示。

主冒險 `play.astro` 是大型單檔，GitHub connector 目前只能整檔 replacement。M54 刻意不為了少量 target-button cosmetic filter 冒整頁覆寫風險；引擎已輸出 `legalEnemyTargetsForMove()` / `partyTargetAvailability()` 供後續安全 UI patch 使用。

## Multidimensional adversarial review

M54 automated gates attack the feature from these player perspectives:

1. **Rule parity** — enemy attacks must receive the same M49/M53 row modifiers as player attacks.
2. **Backline sniping** — player melee/reach cannot bypass a living enemy screen.
3. **No punitive misclick** — a protected-rear click spends no turn or mystic resource.
4. **Counter-builds remain** — player ranged and true magic can still pressure enemy rear units.
5. **Rear is not immunity** — enemy ranged/mystic can threaten player rear units.
6. **Guard counterplay** — a guarding player frontliner can still intercept single-target backline pressure.
7. **Area exploit** — melee/reach area attacks cannot silently hit protected rear rows on either side.
8. **Frontline collapse** — enemy rear units lose protection and inherit their front-row weapon penalties when the screen dies.
9. **All-rear exploit** — encounters without a real frontline cannot keep a phantom rear screen.
10. **Authored intent** — explicit encounter rows override inferred rows.
11. **Legacy bow truth** — `ridge-arrow` and `bone-arrow` are corrected to physical ranged/pierce attacks.
12. **Magic truth** — genuine mana/favor attacks remain row-independent.
13. **Melee viability** — every living encounter always leaves at least one legal close-combat target.
14. **No free ranged buff** — bypassing the line adds no positive hit or damage bonus.
15. **Save compatibility** — enemy rows are runtime-only; no save version changes.
16. **Historical regression** — M40–M53 gameplay gates must remain green.

## Rejected alternatives

### Give every enemy a flat rear Defense bonus

Rejected. It would create another hidden stat and would not solve the actual geometry asymmetry.

### Let reach weapons stab through the frontline

Rejected for M54. M53 reach means attacking effectively from the wielder's second rank, not magically ignoring an opponent's frontline. Letting reach also bypass would make polearms too close to ranged weapons.

### Prevent enemy ranged attacks from targeting player rear

Rejected. That preserves the old player-only safety advantage and makes enemy formations cosmetic.

### Make enemy ranged always target player rear

Rejected. That would invalidate formation instead of deepening it. M54 allows rear pressure but keeps HP-based targeting and Guard interception as counterplay.

### Auto-retarget an illegal player melee click to a frontline enemy

Rejected. The game should not silently change the player's chosen target. The action is rejected without spending a turn and explains why.

### Add terrain and cover in the same milestone

Rejected. Terrain should be built on top of a symmetric battlefield model. M54 first establishes that both armies actually have front and rear lines; terrain/cover can become a later milestone without masking fundamental parity bugs.

## Acceptance target

M54 succeeds when a player can reason about both armies with the same mental model:

- frontline bodies physically matter;
- rear units gain safety, not invulnerability;
- ranged and spellcraft are the tools for backline pressure;
- Guard provides an answer to that pressure;
- breaking a frontline visibly changes both target access and weapon effectiveness;
- neither side receives invisible exceptions solely because it is controlled by AI.
