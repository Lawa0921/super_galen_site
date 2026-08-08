# M47 Morale, Rout and Surrender

M47 makes intelligent enemies behave like people with something to lose. It is deliberately scoped: only explicitly profiled human enemies receive morale. Undead, beasts, constructs, dragons and unknown future enemies remain unyielding until a designer opts them in.

## Player-facing rules

The Split-Banner convoy ambushers now have resolve:

- Reaver Captain: 8 resolve and leader status.
- Hook Raider: 6 resolve.
- Ash Arsonist: 5 resolve.

Resolve is not a second HP bar that must always be attacked. It is an alternate battlefield consequence layer:

- An ordinary allied casualty shakes surviving intelligent enemies by 2 resolve.
- Losing the leader shakes survivors by 4 resolve.
- Crossing below half HP costs that enemy 1 resolve once.
- Newly suffering stun / poise-break costs that enemy 1 resolve.
- At 0 resolve, the enemy throws down arms and leaves the active battle without being counted as killed.

## Battlefield command

`戰場喝止` is a real action, not a free dialogue button.

- It is unavailable against untouched full-resolve enemies. The party must first create battlefield leverage.
- It uses Charisma and frontline presence, so a cleric is naturally good at it, but any profession can attempt it.
- The DC rises with remaining resolve, leader status and previous failed attempts.
- Natural 20 succeeds; natural 1 fails.
- Failure raises the target's defiance by 1, adding +2 DC to later attempts. Repeating failed commands is therefore a tempo trap rather than a safe spam strategy.
- Stun consumes the attempted command turn just like other actions.
- A successful command deals resolve damage; it does not deal ordinary HP damage.

Charisma therefore gains a combat identity without becoming a turn-one skip button.

## Unyielding enemies

The current M47 morale profile only contains the three Split-Banner human ambushers. The Tongueless Cantor, choir wraiths, Ashen Reliquary undead, Dragon Ember Avatar and other non-profiled enemies return no morale profile and cannot be intimidated through this system.

## Post-rout treatment

When a convoy victory contains explicitly routed enemies, reward settlement pauses for one consequence choice:

1. Release them: +1 reputation, no extra gold or supply cost.
2. Disarm and search them: +3 G per routed foe, no reputation bonus.
3. Escort them for ransom: +8 G per routed foe, but consumes 1 dried ration and is unavailable without supplies.

The base convoy contract reward is still paid exactly once. The aftermath receipt is also once per market cycle. Missing supplies or duplicate receipts are validated before mutation so no partial reward can be minted.

## Multidimensional adversarial gameplay gates

M47 acceptance is broader than unit correctness:

- High Charisma cannot skip an untouched fight.
- Failed commands consume tempo and make future attempts harder.
- Leader loss has a larger morale effect than an ordinary casualty.
- Stun and poise-break create leverage but are not mandatory; physical casualties can also break resolve.
- A rout victory can occur while surrendered enemies still had HP, proving the system is genuinely non-lethal rather than renamed damage.
- Live Reliquary undead and the Dragon Ember Avatar are explicitly checked as unyielding.
- Cleric command success is better than a low-Charisma martial captain but remains probabilistic; the martial captain still has a viable chance after setup.
- Brace, control, physical pressure and command retain different advantages across wagon protection, breakthrough pressure, HP damage, mana cost, setup cost and routed enemies.
- Release, disarm and ransom remain Pareto alternatives across gold, reputation and supplies.
- Ransom cannot create negative rations.
- M46 objective lifecycle and balance are rerun in M47 CI, along with core combat and M40–M45 gameplay regressions.

This is automated adversarial gameplay review. It does not replace multi-hour human UX playtesting, but it blocks obvious dominant strategies, free retries, charisma skips, non-human surrender bugs and reward duplication before merge.
