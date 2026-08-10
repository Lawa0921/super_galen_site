# Caravan M55 — Battlefield Terrain & Projectile Cover

## Why M55 exists

M49–M54 finally give both armies a symmetric battlefield model:

- front and rear ranks;
- melee / ranged / reach / mystic engagement bands;
- frontline screening;
- Guard interception;
- frontline collapse;
- shields, armor and real sidearms.

The next missing layer is that every battlefield is still mechanically flat. A rear archer behind a broken stone parapet behaves exactly like an archer standing in an empty field. That makes the medieval world visually richer than the combat rules.

M55 adds the first terrain layer without pretending to be a complete tactical-grid or line-of-sight simulator.

## Scope: projectile cover, not generic Defense

M55 models **partial physical projectile cover**.

A cover modifier applies only when all of these are true:

1. the battlefield authored usable rear cover for the target's side;
2. the target is currently in the rear rank;
3. that side still has a living frontline;
4. the incoming action is a physical `ranged` attack;
5. the action is not genuine spellcraft.

Published grades are deliberately bounded:

- no cover: `0` hit modifier;
- partial cover: `-1` hit;
- strong cover: `-2` hit.

Cover never changes base Defense, damage, armor reduction, HP or saving data.

This matters because a flat `+DEF` would also make swords, polearms and magic less accurate even though a low wall or wagon side is primarily changing the projectile lane.

## First live battlefield: Ashen Reliquary bridge

Stage 1, **灰燼騎士守橋戰**, now authors `broken-stone-bridge` through the encounter itself.

The battlefield fiction already supports it:

- 灰燼騎士・守橋者 holds the front;
- 燼甲侍從 begins in the rear with a thrown cinder spear;
- broken parapets and bridge pillars give both rear ranks partial projectile cover;
- once the knight falls, M54 promotes the squire to the frontline;
- M54 then lets that exposed squire draw its real authored cinder-steel sidearm.

The same encounter data is consumed by the standalone Reliquary fight and endurance systems, so the terrain is not page-specific cosmetic state.

## Symmetric battlefield truth

`CombatState.terrain` is runtime-only.

An encounter may author one `battlefieldTerrainId`. `startCombat()` also accepts an explicit override for tests or future encounter controllers.

If multiple enemies in one encounter author conflicting terrain IDs, combat rejects the data rather than silently choosing one.

On the broken bridge:

- player physical ranged vs protected enemy rear: `-1`;
- enemy physical ranged vs protected player rear: `-1`.

The AI does not receive a terrain exemption.

## Frontline collapse is the martial counterplay

Cover is not permanent rear immunity.

If the frontline collapses, the existing M49/M54 rules force surviving rear units forward. Once the unit is no longer a rear target, rear projectile cover no longer applies.

This creates a non-magical solution to protected shooters:

- swords break the screen;
- polearms can contribute from the second rank;
- ranged attackers can accept the bounded cover penalty and keep shooting;
- spellcraft can pressure the rear under its own magical geometry.

Magic therefore remains useful without becoming mandatory.

## Guard and shields remain distinct

M52 Guard/shield protection and M55 terrain cover are intentionally different layers.

If an enemy ranged attack selects a low-HP rear target but a valid frontline guardian intercepts it, the actual final target is the guardian in the front rank. Rear projectile cover does not also apply to that redirected hit.

This prevents a shielded guardian from stacking both frontline Guard and somebody else's rear cover against the same shot.

## Magic semantics

M55 does **not** say “magic passes through walls.”

It says only that the current terrain layer represents partial projectile obstruction, so genuine mana/favor spellcraft is not treated as a bow or thrown spear for this modifier.

A later full line-of-sight system may define solid walls, sealed doors, blind corners, magical arcs or area propagation. M55 deliberately does not fake those rules.

## Area attacks

Cover is evaluated per target during real hit resolution.

For a physical ranged area attack:

- frontline targets receive no rear-cover modifier;
- protected rear targets receive their side's cover modifier.

This prevents `area:true` from either ignoring terrain entirely or granting frontline bodies fake rear cover.

## Player information contract

M55 exposes terrain through combat state and logs:

- battle start announces the authored terrain and its concrete effect;
- when cover modifies a physical ranged attack, the combat log names the terrain and hit penalty;
- `targetCoverForecast()` exposes the same pre-resolution truth for UI/test consumers.

The current milestone does not yet claim every existing combat page shows a dedicated cover badge before click. The engine API exists so a later safe UI pass can add badges without duplicating combat math.

## Multidimensional adversarial review

M55 automated review attacks the feature from these player perspectives:

1. **Legacy stability** — untagged encounters remain mechanically open ground.
2. **Bounded ranged penalty** — cover is at worst `-2`, never a hard ban.
3. **Symmetry** — the same bridge gives the same partial cover to player and enemy rear ranks.
4. **No generic Defense inflation** — melee/reach do not inherit projectile cover penalties.
5. **Magic separation** — genuine spellcraft gets no hidden positive bonus and is not misclassified as a projectile.
6. **Martial counterplay** — melee/reach can break the frontline that enables rear cover.
7. **Frontline collapse** — exposed rear units lose cover immediately when promoted forward.
8. **Guard distinction** — interception resolves against the frontline guardian without stacking rear cover.
9. **Area correctness** — cover is evaluated per target.
10. **No hidden randomness** — terrain is authored/overridden, never randomly invented by `startCombat()`.
11. **Data integrity** — conflicting encounter terrain is rejected.
12. **Runtime-only state** — no save migration or persistent party terrain fields.
13. **Historical builds** — M40–M54 regressions must remain green.
14. **Composition diversity** — M42 endurance and M46 convoy probes must stay viable rather than terrain becoming a mandatory class gate.

## Rejected alternatives

### Flat terrain `+DEF`

Rejected. It would incorrectly affect swords, polearms and magic and would hide terrain inside a generic stat.

### Physical ranged attacks cannot target covered units

Rejected. Cover should change odds and tactical priorities, not disable an entire weapon family.

### Reach ignores enemy frontlines because it is long

Rejected again. M53 reach means fighting effectively from one's own second rank, not stabbing through two organized enemy ranks.

### Cover remains after the frontline dies

Rejected. A rear position only exists while somebody is actually holding the line.

### Magic receives a positive accuracy bonus against cover

Rejected. Magic gets `0` projectile-cover penalty, not a bonus.

### “Magic ignores all terrain and walls”

Rejected. M55 has no complete LOS blocker model and must not make claims it cannot enforce.

### Random terrain every fight

Rejected for this milestone. Hidden random terrain would make deterministic encounter learning weaker and complicate historical balance probes before authored battlefield identities are proven.

### Add terrain damage bonuses

Rejected. M55 is about geometry and target protection, not another source of raw damage inflation.

## Acceptance target

M55 succeeds when terrain creates a new tactical question without deleting old answers:

> Do I accept a harder physical shot into cover, use magic to pressure the rear, or break the frontline so the enemy loses the protected shooting position?

All three routes must remain understandable, bounded and compatible with the existing sword-and-magic combat ecosystem.
