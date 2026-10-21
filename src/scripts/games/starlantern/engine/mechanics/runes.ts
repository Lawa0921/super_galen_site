/**
 * The runes that act once a cast (spec §6.4, plan 8e Task 5): 星燈輪轉 turns the element fire, ice, thunder, each skill
 * counting on its own (Combatant.wheel); 同步 lifts the next other ally's skill this round (BattleState.sync); 回聲
 * strikes the foe the cast struck first again at the next round's end (BattleState.reprises). 雙重詠唱 and 彈射 run in
 * battle.ts perform. Nothing here draws but a reprise's own hits.
 */
import type { Element } from '../types';
import { applyEffect, pctOf } from '../skills';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

/** The starwheel's turn: fire first, then ice, then thunder. */
export const WHEEL: readonly Element[] = ['fire', 'ice', 'thunder'];

export const runes: MechModule = {
  castDef(s, c, def) {
    // 星燈輪轉: the element this cast takes (the menu shows the next one).
    if (def.runeRules?.wheel) {
      const el = WHEEL[(c.wheel?.[def.id] ?? 0) % WHEEL.length];
      def = { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, element: el } : e)) };
    }
    // 同步: another ally's skill while the sync stands is that much stronger, its damage and its heals.
    const sync = s.sync;
    if (sync && c.side === 'party' && c.key !== sync.by) {
      def = { ...def, effects: def.effects.map((e) => (e.kind === 'damage' || e.kind === 'heal' ? { ...e, power: pctOf(e.power, 100 + sync.pct) } : e)) };
    }
    return def;
  },
  after(s, c, act, def, ctx) {
    if (act.kind !== 'skill' || !def) return;
    // The sync goes with the first other ally's skill it lifted.
    if (s.sync && c.key !== s.sync.by) delete s.sync;
    const rules = 'runeRules' in def ? def.runeRules : undefined;
    if (!rules) return;
    if (rules.wheel) c.wheel = { ...c.wheel, [def.id]: (c.wheel?.[def.id] ?? 0) + 1 };
    if (rules.sync !== undefined) s.sync = { pct: rules.sync, by: c.key };
    // 回聲: only a cast that struck a foe leaves one, aimed at the first foe it struck.
    if (rules.reprise !== undefined && ctx.struck) {
      const effects = def.effects.flatMap((e) => (e.kind === 'damage' ? [{ ...e, power: pctOf(e.power, rules.reprise!) }] : []));
      s.reprises = [...(s.reprises ?? []), { by: c.key, target: ctx.struck, round: s.round + 1, name: def.name, effects }];
    }
  },
  roundEnd(s, ctx) {
    delete s.sync;   // unused by the round's end, it is gone
    const due = (s.reprises ?? []).filter((r) => r.round === s.round);
    if (!due.length) return;
    s.reprises = (s.reprises ?? []).filter((r) => r.round !== s.round);
    if (!s.reprises.length) delete s.reprises;
    for (const r of due) {
      const by = s.party.find((c) => c.key === r.by && c.alive);
      const t = s.enemies.find((c) => c.key === r.target && c.alive);
      if (!by || !t) continue;
      s.log.push({ type: 'act', actor: by.key, label: T.rune.reprise(r.name) });
      for (const e of r.effects) applyEffect(by, t, e, ctx);
    }
  },
};
