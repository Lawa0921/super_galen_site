# Caravan M48 — Armor Profiles & Armor-Piercing

## Why this milestone exists

M43 made armor affect defense, burden, class fit, travel fatigue and mystical capacity, but incoming slash / pierce / blunt attacks still treated every player armor as the same generic defense number. In a medieval sword-and-magic game that made mail, leather and robes feel too abstract at the moment steel actually landed.

M48 adds a small, readable material layer instead of a simulation-heavy armor model.

## Material profiles

| Armor | Mundane physical protection | Magical protection | Existing tradeoff retained |
| --- | --- | --- | --- |
| Light armor | Slash -1 | — | low burden, better mobility |
| Mail | Slash -2, Pierce -1 | — | high burden, DEX / casting interference |
| Arcane robe | — | Fire -1, Frost -1 | mana capacity |
| Sacred vestment | — | Holy -2 | favor capacity |

Reductions are flat and visible in the combat log. They are applied after enemy weakness / resistance scaling and before M44 one-charge wards. Material reduction cannot reduce an otherwise successful hit below 1 damage; a magical ward may still absorb the remaining magical damage completely.

## Physical versus magical damage

M48 does not infer physicality from the element label alone. `mysticRuleForMove(move)` decides whether the move is a real spell.

That means a magical `blunt` spell such as Gravity Crush is still magical and is not stopped by mail simply because its element is blunt. Likewise, mundane fire-like fiction would need an explicit future damage model rather than being silently treated as a sword cut.

This keeps the existing M41/M44 magic rules authoritative.

## Armor-piercing

`Move.armorPiercing` bypasses only mundane physical material reduction. It never bypasses robe / vestment magical protection or M44 ward charges.

The ranger's existing `piercing-arrow` now receives `armorPiercing: 2` through the armory move preparation layer. Against current mail (-1 pierce) it ignores the full material reduction, but it does not improve accuracy, raw dice, magical damage or weakness multipliers.

## Live encounter integration

M48 is not test-only:

- Split-Banner Reaver Captain: mail
- Split-Banner Hook Raider: light armor
- Split-Banner Ash Arsonist: arcane robe
- Ashen Reliquary Ash Knight: mail
- Ashen Reliquary Cinder Squire: light armor

This gives real value to blunt pressure, ordinary arrows versus light targets, armor-piercing arrows versus mail, and magic against physical protection.

## Player-perspective adversarial gates

M48 must demonstrate all of the following before merge:

1. Mail is meaningfully better against mundane slash / pierce but does not reduce blunt attacks.
2. Armor-piercing bypasses physical material reduction but cannot bypass magical cloth protection.
3. Arcane robe and sacred vestment defenses only trigger on actual magic.
4. Passive magical cloth protection and M44 one-charge wards compose in a deterministic order instead of replacing each other.
5. Ranger light armor versus mail stays a protection / mobility tradeoff.
6. Mage robe versus mail stays an arcane-capacity / magical-defense versus steel-defense tradeoff.
7. Cleric vestment versus mail stays a favor / holy-defense versus steel-defense tradeoff.
8. Swordsman mail is strong without making light armor strictly useless because burden and DEX still matter.
9. Live convoy and Reliquary encounters carry the same profiles used by the rules tests.
10. Core combat, M40, M41, M42, M43, M44, M45, M46 and M47 regressions remain green.

## Deliberate non-goals

- no armor durability or repair tax
- no hit-location simulation
- no percentage stacking table
- no save migration requirement
- no automatic split between the physical blade and magical flame of a single hybrid attack

The goal is player-readable tactical identity, not armor simulation for its own sake.
