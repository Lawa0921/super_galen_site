# Caravan M51 — Veteran Mastery & Tactical Repositioning

## Problem

《商隊與劍》的角色職涯以 Lv1–Lv5 為完整弧線：成長潛力、職涯里程碑、專精與既有 UI 都把 Lv5 當成成熟角色的共同邊界。但無盡契約會繼續提高難度、繼續發放 XP。若 Lv5 後 XP 只剩數字增加，玩家會失去一條重要的角色層長期目標。

M51 不把等級上限硬拉到 Lv10，也不在封頂後無限疊攻擊、生命或屬性。它把既有 XP 轉成三階、有限、橫向的「老兵精通」，讓成熟角色得到新的戰術選擇，而不是新的數值通膨。

## Progression

| 條件 | 精通 | 解鎖 |
| --- | --- | --- |
| Lv5 且 320 XP | I | 戰術換位 |
| Lv5 且 500 XP | II | 前進接戰時同時進入守勢 |
| Lv5 且 750 XP | III | 最後前排可由後排隊友接替後撤 |

- Lv4 即使囤積大量 XP 也不會提前取得老兵精通。
- 750 XP 後精通封頂，不建立無限 post-cap ladder。
- 使用既有 `level` / `xp` 推導，不新增存檔欄位、不升 save version。
- 無盡契約原本就會持續給 XP，因此不需要另一種抽象貨幣。

## Tactical Repositioning

`戰術換位` 是額外的 veteran action，不佔原本四格戰技配置。

### Rear → Front

- 花掉完整一回合。
- Rank I：單純進入前排。
- Rank II+：進入前排的同時使用既有 `guarding` 規則建立守勢。
- 不造成傷害、不恢復生命、不增加永久屬性。

### Front → Rear

- 花掉完整一回合。
- 若還有另一名存活前排，可正常後撤。
- Rank I–II 若自己是最後一名前排，不能後撤。
- Rank III 若自己是最後一名前排，但仍有存活後排，必須先由一名後排隊友接替前線才可後撤。
- 接替者依「防禦 → 當前 HP → 名冊順序」決定，確保 deterministic，不引入另一層目標選擇 UI。
- 若沒有人能接替，Rank III 也不能憑空消失到後排。

## Why the shift costs a full turn

M49 已讓劍、弓與前後排形成真實取捨。如果換位是免費操作，玩家可以在出手前永久切到最佳射程，M49 的站位系統會失去意義，也會形成無成本 kite。

因此 M51 把「站位修正」本身變成一個回合決策：

- 現在就輸出，承擔錯排 `-2`；或
- 花一回合重新整隊，換取後續更好的武器射程／護衛位置。

這使換位是戰術投資，而不是必按的免費最佳化。

## Why Rank II uses existing Guard

Rank II 沒有新增專屬減傷、護盾值或新的 buff 種類。前進接戰的老兵直接使用既有 `guarding`：

- 規則可讀；
- 只維持到該角色下一次自身行動前；
- 前排仍會實際承受敵人攻擊；
- 不增加新的疊乘防禦公式。

## Why Rank III requires a real replacement

允許最後一名前排直接後撤會重新製造 M49 已經消滅的「全員安全後排」。Rank III 的價值不是逃離戰場，而是老兵懂得做戰線輪替。

因此後撤必須把另一個活人暴露到前線。威脅沒有消失，只是重新分配。

## Player-facing information contract

M50 的原則延伸到 M51：如果玩家按下一個按鈕會改變站位，他必須在按下前知道結果。

動態 action label：

- `戰術換位〔前進〕`
- `戰術換位〔前進・守勢〕`
- `戰術換位〔後撤〕`
- `戰術換位〔輪替後撤〕`
- `戰術換位〔無人接替〕`

被禁止的「無人接替」不消耗回合。戰鬥開始 log 也會顯示目前老兵精通與下一個 XP 門檻。

## Multidimensional adversarial review

Automated gates attack the feature from multiple player perspectives:

1. **Power creep** — Rank I/II/III must not change stats, max HP, defense or damage bonus.
2. **Early farming** — pre-Lv5 XP stockpiling cannot bypass the career boundary.
3. **Infinite ladder** — mastery caps at Rank III even at enormous XP.
4. **Free kiting** — every successful shift consumes the actor's full turn.
5. **Phantom safe row** — no legal shift may leave zero living frontliners.
6. **Bad-button punishment** — an illegal last-front fallback returns `acted:false` and does not consume the turn.
7. **Information fairness** — live labels must say advance, guarded advance, fallback, rotation, or no replacement before click.
8. **Dynamic battlefield truth** — M49 frontline collapse and M51 repositioning use the same runtime `formationRow`; labels follow the new row automatically.
9. **Idempotency** — repeated combat initialization cannot stack M51 suffixes.
10. **Regression** — M40–M50 combat, spellcraft, endurance, armory, rituals, convoy, morale, armor and formation tests remain green.

## Rejected alternatives

### Raise level cap to Lv10

Rejected for M51. Lv5 is a shared structural boundary in genesis/growth/career/specialization systems. Raising it requires a broader progression redesign, not a combat patch.

### Infinite veteran ranks

Rejected. Endless numerical growth would eventually trivialize old content and force enemy stat inflation.

### Passive +damage / +HP per post-cap XP

Rejected. It provides no new decision and makes veteran progression mandatory power instead of optional tactical mastery.

### Free once-per-round reposition

Rejected. It deletes the cost of M49's range system and enables stance dancing before every attack.

### Last front may simply retreat at Rank III

Rejected. It recreates an all-rear exploit. Rank III is a rotation, not invisibility.

## Save compatibility

No new persistent field is required. Veteran rank is derived from existing `record.level` and `record.xp`; combat-only row/guard/runtime flags remain ephemeral. Old saves therefore obtain the correct mastery automatically from their existing values.
