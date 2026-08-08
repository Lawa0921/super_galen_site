# M46 Battlefield Objectives — Split-Banner Convoy

M46 addresses a gameplay problem rather than adding another management layer: most combat previously ended only when every enemy was defeated. A caravan / mercenary RPG needs contracts where survival, escort discipline, battlefield control, and accepting risk can matter more than annihilation.

## Player-facing contract

`黑蠟急件｜裂旗商路護運`

- The White-Wax Wagon has 30 durability.
- The escort must hold for four completed combat rounds. If the wagon still has durability when the fourth round ends, the convoy escapes even if enemies remain alive.
- Three ambushers create 3 / 3 / 4 breakthrough pressure each round while able to act.
- End-of-round wagon damage is current breakthrough pressure minus that round's convoy protection.
- Killing an enemy permanently removes its pressure.
- Stunning / poise-breaking an enemy suppresses its pressure for that round.
- Any living party member may spend their turn bracing the wagon. Constitution and frontline position improve the protection value, but total protection is capped at 10 per round.
- Healing restores escorts, not the wooden wagon. Clerics therefore preserve the people who can continue defending instead of becoming direct objective healers.
- Full annihilation is still a valid fast victory through the ordinary combat engine.
- The contract is linked directly from the existing Guild Hall / Black-Wax Documents page instead of requiring a hidden URL.

## Sword-and-magic role identities

- Frontline / high-CON characters are efficient convoy braces and can still use guard to protect wounded allies.
- Rangers reduce persistent breakthrough pressure through reliable ranged damage and target selection.
- Mages can spend mana on control, especially Frost Bind, to suppress high-pressure enemies for a round instead of only racing damage.
- Clerics convert favor into party endurance; they cannot erase wagon mistakes with magical repairs.
- Cross-class armory, mystic costs, wards, enemy caster exhaustion, poise, weakness, and M45 rituals remain active because the contract wraps the production combat engine rather than replacing it.

## Anti-abuse rules

- Convoy brace validates actual turn ownership before acting.
- Bracing consumes an ordinary combat action and still loses the action when stun prevents it.
- Multiple escorts cannot stack more than 10 convoy protection in one round.
- Closing, refreshing, deliberately retreating, or losing an unresolved convoy battle all leave the attempt receipt active. Re-entry consumes one dried ration when possible, otherwise charges emergency gold, and every unresolved retry removes four starting wagon durability down to a floor of 12.
- Contract reward settlement receives the actual battle state and rejects ongoing, retreated, defeated, or destroyed-wagon states in the data layer rather than trusting UI-only gating.
- Contract reward is issued at most once per market cycle.
- Wagon condition matters: finishing at 70% durability or better grants a 10 G intact-delivery bonus.

## Multidimensional adversarial gameplay gates

The M46 test suite does not accept simple build success as sufficient. It compares four player responses using production jobs and combat rules:

1. Escort / brace — strongest immediate wagon protection, sacrifices damage or healing tempo.
2. Control — spends mana and a move slot to suppress a high-pressure hostile for a round.
3. Pressure / kill — removes enemy HP fastest and can permanently remove future breakthrough pressure, but accepts more immediate wagon risk.
4. Sustain — restores party HP so escorts remain functional, but does not directly protect the objective.

Acceptance gates:

- No policy may dominate all measured dimensions (wagon durability, enemy HP pressure, party survival / resource posture).
- Pure martial parties must have successful seeded escorts; mage or cleric cannot become mandatory.
- A party with no swordsman must also have successful seeded escorts; the dedicated frontline class cannot become mandatory.
- Successful escorts must be possible with enemies still alive, proving that the new objective is not cosmetic kill-all combat.
- The wagon must be able to fail while party members remain alive, proving that protecting the caravan is a real independent loss condition.
- Retreat/defeat/reload retries must pay the same unresolved-attempt economy; no exit path may become a free RNG reset.
- Reward settlement must reject any non-victory battle state before mutating gold, reputation, or receipts.
- M40 live fantasy encounters, M41 magic resources, M42 composition/endurance, M43 armory, M44 spellcraft, M45 rituals, and core combat remain regression gates.

This is automated adversarial gameplay review. It is intentionally stricter than unit correctness, but it does not replace several-hour human UX playtesting.
