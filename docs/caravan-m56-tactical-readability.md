# Caravan M56 — Tactical Readability & Honest Targeting

## Why M56 exists

M49–M55 made the combat rules substantially deeper:

- front and rear ranks;
- melee / ranged / reach / mystic engagement bands;
- enemy frontline screening;
- Guard interception;
- shields and two-handed weapons;
- armor and armor piercing;
- ritual telegraphs;
- morale and convoy objectives;
- authored projectile cover.

The engine now knows more tactical truth than several battle pages show before the player clicks.

Before M56, the three dedicated high-level battle pages (`ashen-reliquary-battle`, `endurance`, `convoy-defense`) still built attack targets with the equivalent of:

> every living enemy is a normal button.

That is no longer honest after M54. A protected rear archer can be visible but illegal for melee/reach. M55 can also make the same rear target legal for a bow while applying `-1` cover, and legal for true spellcraft without a projectile-cover modifier.

M56 makes those differences visible without creating a second combat rules engine inside the UI.

## One presentation source of truth

`data/tacticalReadability.m56.ts` is a read-only adapter over existing combat APIs:

- `partyTargetAvailability()` — exact target legality and reason;
- `legalEnemyTargetsForMove()` — exact area target set;
- `targetCoverForecast()` — exact current move/target cover modifier;
- current runtime formation rows and terrain.

Pages should consume this adapter rather than re-implementing `if front exists`, `if ranged`, `if magic`, or cover math.

The adapter exposes:

- `tacticalUnitSummary()` for visible unit cards;
- `tacticalTargetChoices()` for pre-click action choices.

It does not roll dice, spend resources, move turns, change rows, or mutate combat state.

## Blocked targets stay visible

M56 deliberately does **not** hide a protected rear enemy from a melee user.

Instead the target remains visible but disabled, for example:

- `灰火縱咒師【後排｜前線保護】`

The button carries the engine's exact blocker reason.

This teaches the player that the enemy exists and is tactically protected. Hiding the enemy would make the same rule feel like missing UI or an arbitrary target list.

M56 also rejects auto-retargeting. If the player tried to attack a protected rear target, the game must not silently hit some frontline enemy instead. The M54 contract remains: the invalid action is informational and does not spend the turn.

## Physical ranged cover is move-specific

A target card can describe its general battlefield position, while an action choice describes what **this move** experiences.

On the M55 broken stone bridge:

- melee/reach against a protected rear: disabled by the frontline;
- physical ranged against the rear: legal, label includes `掩體 -1`;
- true spellcraft against the rear: legal, no projectile-cover label.

M56 does not show a generic `+DEF` or permanent cover stat because M55 never created one.

## Area actions show their real target set

Before M56, a page could label any area attack as `敵方全體` even when M54 correctly restricted a physical close-combat area attack to the enemy frontline.

M56 asks the engine for the real legal set:

- physical close-combat area while a screen exists: `敵方前排全體 (N)`;
- ranged/mystic area that can cross the line: `敵方全體 (N)`;
- if physical ranged targets in the area are covered, the label reports how many targets are affected by cover.

The UI therefore cannot advertise damage against units the resolver will not touch.

## Unit cards

Dedicated high-level battle pages now expose the same position language for both armies:

- `前排｜正面接戰`
- `後排｜受前線保護`
- `後排｜受前線保護｜掩體 -1`
- `倒下`

When a frontline collapses and M54 promotes a rear unit, the summary is recomputed from runtime state and immediately becomes `前排｜正面接戰`.

No cached tactical label survives a formation change.

## Endurance invalid-click punishment fix

M54's engine returns `acted:false` for an illegal protected-rear click and does not advance the turn.

The dedicated Reliquary and convoy pages already respected that result. `endurance.astro` did not: it called `runEnemyTurns()` unconditionally after `partyAct()`.

That meant a player could click an illegal rear target, spend no engine turn, and still be punished by enemy actions on the page.

M56 changes the endurance page to:

1. inspect `result.acted`;
2. run enemy turns only after a real player action;
3. still persist and re-render the battle so the blocker message is visible.

This is a real fairness fix, not a tooltip-only change.

## Convoy special actions stay special

M46–M47 actions are not all weapon attacks:

- `護住馬車` uses convoy protection rules;
- `喝止` uses morale eligibility, Charisma DC and defiance;
- weapon/spell buttons use M56 tactical target choices.

M56 does not route convoy protection or surrender commands through weapon-line geometry. Doing so would make the UI "consistent" by making the game rules wrong.

## Multidimensional player adversarial review

M56 automated review attacks the feature from these perspectives:

1. **Mystery-rule risk** — blocked rear enemies remain visible with a readable reason.
2. **Turn fairness** — an illegal target click remains `acted:false` and cannot advance the combat turn.
3. **No silent retarget** — the game does not secretly hit a frontline enemy after a blocked rear click.
4. **Weapon identity** — melee and reach respect screens; bows retain legal pressure through cover.
5. **Magic honesty** — true spellcraft is legal under its own geometry but receives no fake positive terrain bonus.
6. **Area honesty** — labels report the same target set the resolver will actually hit.
7. **Support isolation** — healing/support choices stay living-allies-only and are not polluted by enemy-line language.
8. **Enemy/player symmetry** — both sides' cards use the same row/protection/cover vocabulary.
9. **Dead-unit safety** — downed units can remain visible as battle history but are not selectable.
10. **Runtime freshness** — formation collapse immediately changes legality and labels.
11. **Read-only presentation** — opening or recomputing target choices cannot alter HP, resources, rows, terrain or turn order.
12. **Page contract** — all three dedicated high-level battle pages consume the shared helper instead of keeping an hp-only attack-target helper.
13. **Objective separation** — convoy Guard/brace/morale commands retain their own rules.
14. **Historical regression** — M39–M55 gameplay, endurance, convoy, morale, armor, magic, rituals and formation rules must remain green.

## Main `play.astro` scope limitation

The main adventure battle UI has the same historical targeting debt: it still owns a large target-selection block inside a very large single Astro file.

The current GitHub connector can only replace the entire file; it does not expose a safe line patch for this environment. Rewriting the whole main game page for a small targeting change would create disproportionate regression risk across town, market, roster, expedition, events, trade and battle UI.

M56 therefore does **not** claim the main page is already wired.

The milestone creates the reusable API specifically so a later safe local/patch-capable UI change can replace the main page's target logic with `tacticalTargetChoices()` and `tacticalUnitSummary()` without copying the combat rules.

This limitation is explicit rather than hidden in the PR.

## Rejected alternatives

### Hide illegal rear targets

Rejected. It removes tactical context and makes the frontline rule look like missing UI.

### Keep all targets enabled and explain failures in the combat log

Rejected. Players should be able to understand legality before committing an action.

### Auto-retarget a blocked rear click onto the frontline

Rejected. It converts an informational mistake into an irreversible action the player did not choose.

### Copy M54/M55 conditions into each Astro page

Rejected. Four subtly different UI implementations would drift away from the resolver again.

### Weaken frontline rules to match the old UI

Rejected. UI debt is not a reason to undo the medieval formation model.

### Treat every convoy action as a tactical target choice

Rejected. Morale commands and protecting the wagon have distinct objective rules and should remain distinct.

### Rewrite the entire main `play.astro` through the connector

Rejected for this milestone. The blast radius is far larger than the change and the connector cannot safely patch the few relevant lines.

## Acceptance target

M56 succeeds when a player can answer these questions **before clicking** on the dedicated high-level battle pages:

> Is that enemy in front or rear? Is the rear protected? Can this specific sword, polearm, bow or spell target it? Does this specific shot suffer cover? If this is an area attack, who will actually be hit?

And if the player still attempts an illegal target, the answer must remain informational rather than punitive.
