/**
 * Bobby's devices (spec §8.8, plan 8c ruling 18): a device skill sets a device on the field that runs at every round's end;
 * two at most. The same kind again is an upgrade (level +1, at most 3, its rounds start again); a new kind with both slots
 * full replaces the one closest to running out (the older on a tie). A device's power is its skill's power, +25% a level
 * above the first, +30% more with the memory blueprint. The turret shoots one foe the fight's `pick` chooses (the old
 * turret's very draw), the drone heals and the shield generator shields whoever has the least HP for their max, the mine
 * strikes every foe with thunder, the coil does the same and may shock each foe it hits. 超頻 runs each device once more
 * at once; 全面整備 raises them all. Bobby's devices go when he falls. Devices run where the old turret did: at the
 * round's end, before any tick. Only the turret and the coil draw.
 *
 * His nodes (plan 8d Task 8): 工作檯 raises how many at once (`deviceCap`, written on his state at a fight's start), 量產 the
 * top level (`deviceLevelCap`); 雙管 fires the turret twice a run (a hit roll each); 雙砲台 makes a second turret cast a new
 * turret beside the first (its own target pick), and only with two out does a turret cast upgrade (the one closest to running
 * out); 急救's drone also cures; 連鎖's mine may shock each foe it hits (one more draw a foe hit, only with the node).
 */
import type { BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { DEVICE, type Device, type DeviceKind } from '../mech';
import { MEMORY_KEYSTONE_VALUES } from '../../data/talents';
import { T } from '../../data/text.zh-TW';
import type { Rng } from '../rng';
import { applyEffect, healAmount, type EffectContext } from '../skills';
import { cureAilments, inflictAilment } from '../ailments';
import { knobOf } from '../progression';
import type { Effect } from '../types';
import type { MechModule, MechWord } from './index';

export { DEVICE };
export type { DeviceKind };

const devicesOf = (c: Combatant): Device[] | null => (c.mech?.kind === 'devices' ? c.mech.devices : null);
const living = (cs: Combatant[]) => cs.filter((c) => c.alive);

/** The power a device runs at: its skill's, +25% a level above the first, ×1.3 with blueprint (whole numbers only). */
export function devicePower(c: Combatant, d: Device): number {
  const level = 100 + DEVICE.levelPct * (d.level - 1);
  const blueprint = c.keystones.includes('blueprint') ? 100 + MEMORY_KEYSTONE_VALUES.devicePct : 100;
  return Math.round((d.power * level * blueprint) / 10000);
}

/** The top level `c`'s devices reach: 量產's, else DEVICE.maxLevel. */
const levelCap = (c: Combatant): number => knobOf(c, 'deviceLevelCap') ?? DEVICE.maxLevel;

/** What a device keeps from the skill as cast (plan 8d): 雙管's shots, 急救's cures, 連鎖's shock. */
const ruled = (eff: Extract<Effect, { kind: 'device' }>): Partial<Device> => ({
  ...(eff.hits !== undefined ? { hits: eff.hits } : {}),
  ...(eff.cures !== undefined ? { cures: [...eff.cures] } : {}),
  ...(eff.shock !== undefined ? { shock: eff.shock } : {}),
});

/** Sets (or upgrades, or swaps in) a device from a `device` effect cast as `skill`. */
export function placeDevice(c: Combatant, eff: Extract<Effect, { kind: 'device' }>, skill: string): void {
  const m = c.mech;
  if (m?.kind !== 'devices') return;
  const same = m.devices.filter((d) => d.kind === eff.device);
  // 雙砲台: with one turret out and a slot free, the cast is a second turret; otherwise an upgrade, of the one closest to
  // running out (the older on a tie).
  const second = eff.twin && same.length === 1 && m.devices.length < m.cap;
  if (same.length && !second) {
    const up = same.reduce((best, d) => (d.turns < best.turns ? d : best));
    up.level = Math.min(levelCap(c), up.level + 1);
    up.turns = eff.turns;
    up.power = eff.power;
    delete up.hits; delete up.cures; delete up.shock;
    Object.assign(up, ruled(eff));
    return;
  }
  if (m.devices.length >= m.cap) {
    const least = m.devices.reduce((best, d, i) => (d.turns < m.devices[best].turns ? i : best), 0);
    m.devices.splice(least, 1);
  }
  m.devices.push({ skill, kind: eff.device, power: eff.power, level: 1, turns: eff.turns, ...ruled(eff) });
}

/** Whoever has the least HP for their max (the first of them on a tie), standing. */
const lowest = (s: BattleState): Combatant | undefined =>
  living(s.party).reduce<Combatant | undefined>((best, c) => (!best || c.hp / c.max.hp < best.hp / best.max.hp ? c : best), undefined);

/** One run of a device, logged as its name. */
export function runDevice(s: BattleState, c: Combatant, d: Device, ctx: EffectContext, rng: Rng): void {
  const power = devicePower(c, d);
  const act = () => s.log.push({ type: 'act', actor: c.key, label: T.mech.device[d.kind] });
  switch (d.kind) {
    case 'turret': {
      const foes = living(s.enemies);
      if (!foes.length) return;
      const t = foes.find((e) => e.taunt > 0) ?? foes[Math.floor(rng() * foes.length)];
      act();
      applyEffect(c, t, { kind: 'damage', power, element: 'phys', scale: 'mag', melee: false, ...(d.hits !== undefined ? { hits: d.hits } : {}) }, ctx);
      return;
    }
    case 'drone': {
      const t = lowest(s);
      if (!t) return;
      act();
      applyEffect(c, t, { kind: 'heal', power }, ctx);
      // 急救: the ailments it lists go too.
      if (d.cures && t.alive) cureAilments(t, d.cures);
      return;
    }
    case 'shield': {
      const t = lowest(s);
      if (!t) return;
      act();
      const amount = healAmount(c, power);
      t.shield = { amount: Math.max(amount, t.shield?.amount ?? 0), src: c.key, skill: d.skill };
      return;
    }
    case 'mine':
    case 'coil': {
      const foes = living(s.enemies);
      if (!foes.length) return;
      act();
      for (const e of foes) {
        const from = s.log.length;
        applyEffect(c, e, { kind: 'damage', power, element: 'thunder', scale: 'mag', melee: false }, ctx);
        const hit = s.log.slice(from).some((x) => x.type === 'damage' && x.target === e.key);
        if (d.kind === 'coil' && hit && e.alive) inflictAilment(c, e, 'shock', DEVICE.coilShock, ctx);
        // 連鎖: the mine may shock each foe it hits.
        if (d.kind === 'mine' && d.shock !== undefined && hit && e.alive) inflictAilment(c, e, 'shock', d.shock, ctx);
      }
      return;
    }
  }
}

/** 超頻: every device of `c` runs once more, now; their rounds stay. */
export function overclock(c: Combatant, ctx: EffectContext): void {
  const s = ctx.battle;
  const devices = devicesOf(c);
  if (!s || !devices) return;
  for (const d of [...devices]) if (c.alive) runDevice(s, c, d, ctx, ctx.rng);
}

/** 全面整備: every device of `c` gains `levels` (at most the cap) and `turns` rounds. */
export function tuneUp(c: Combatant, levels: number, turns: number): void {
  for (const d of devicesOf(c) ?? []) {
    d.level = Math.min(levelCap(c), d.level + levels);
    d.turns += turns;
  }
}

export const devices: MechModule = {
  init(_s, c) {
    // 工作檯: more devices at once.
    const cap = knobOf(c, 'deviceCap');
    if (c.mech?.kind === 'devices' && cap !== undefined) c.mech.cap = cap;
  },
  unusable(_s, c, def) {
    // 超頻 with nothing out would spend its TP on nothing.
    const ds = devicesOf(c);
    return ds && !ds.length && def.effects.some((e) => e.kind === 'overclock') ? T.mech.noDevices : null;
  },
  beforeTicks(s, ctx, rng) {
    for (const c of living(s.party)) {
      const ds = devicesOf(c);
      if (!ds || !ds.length) continue;
      for (const d of [...ds]) if (c.alive) runDevice(s, c, d, ctx, rng);
      const m = c.mech;
      if (m?.kind === 'devices') m.devices = m.devices.filter((d) => (d.turns -= 1) > 0);
    }
  },
  words(_s, c) {
    const out: MechWord[] = (devicesOf(c) ?? []).map((d) => ({ tone: 'devices', text: T.mech.deviceWord(T.mech.deviceShort[d.kind], d.level, d.turns) }));
    if (c.shield && c.shield.amount > 0) out.push({ tone: 'devices', text: T.mech.shield(c.shield.amount) });
    return out;
  },
};
