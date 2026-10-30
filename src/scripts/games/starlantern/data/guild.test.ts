import { describe, expect, it } from 'vitest';
import {
  ACTIVE_MAX, BOARD_CAP, BOARD_MAX, DELIVER_KINDS, DELIVER_MUL, GUILD_MAX, GUILD_SALT, GUILD_SWITCH, MERIT, RANKS, REWARD, SCOUT_K, SWEEP_N,
  WEIGHTS, deliverQty, guildOpen, runeTierAt,
} from './guild';
import { ITEMS } from './items';
import { MATERIALS } from './materials';
import { isFragmentItem } from './story/fragments';
import { newGame } from '../engine/state';
import { withGuildLive, withGuildOff } from '../engine/testing';

const unlocked = () => {
  const s = newGame();
  s.story.act1Cleared = true;
  return s;
};

describe('guild board data (guild quests plan Task A1)', () => {
  // Plan Task D1: the board goes up. Open once the first act is over, shut before it; withGuildLive still puts back what it found.
  it('the switch is on', () => {
    expect(GUILD_SWITCH.live).toBe(true);
    expect(guildOpen(unlocked())).toBe(true);
    expect(guildOpen(newGame())).toBe(false);   // before the first act
    expect(withGuildLive(() => GUILD_SWITCH.live)).toBe(true);
    expect(withGuildLive(() => guildOpen(unlocked()))).toBe(true);
    expect(withGuildLive(() => guildOpen(newGame()))).toBe(false);   // before the first act
    expect(GUILD_SWITCH.live).toBe(true);
    expect(() => withGuildLive(() => { throw new Error('boom'); })).toThrow('boom');
    expect(GUILD_SWITCH.live).toBe(true);
    // review M6: the unlock held shut, the act cleared or not; put back afterwards, a throw too
    const open = GUILD_SWITCH.open;
    expect(withGuildLive(() => guildOpen(unlocked()), { open: false })).toBe(false);
    expect(GUILD_SWITCH.open).toBe(open);
    expect(() => withGuildLive(() => { throw new Error('boom'); }, { open: false })).toThrow('boom');
    expect(GUILD_SWITCH.open).toBe(open);
    expect(GUILD_SWITCH.live).toBe(true);
    expect(withGuildLive(() => guildOpen(unlocked()))).toBe(true);
  });

  // Controller ruling 2026-10-30 (spec §0 item 24): with the board up, a test of the switched-off game says so.
  it('withGuildOff shuts the board for its callback and puts the switch back, sync, async or thrown', async () => {
    expect(withGuildOff(() => [GUILD_SWITCH.live, guildOpen(unlocked())])).toEqual([false, false]);
    expect(GUILD_SWITCH.live).toBe(true);
    expect(() => withGuildOff(() => { throw new Error('boom'); })).toThrow('boom');
    expect(GUILD_SWITCH.live).toBe(true);
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    const pending = withGuildOff(async () => { await tick(); return GUILD_SWITCH.live; });
    expect(GUILD_SWITCH.live).toBe(false);   // still off while the callback awaits
    expect(await pending).toBe(false);
    expect(GUILD_SWITCH.live).toBe(true);
    await expect(withGuildOff(async () => { await tick(); throw new Error('later'); })).rejects.toThrow('later');
    expect(GUILD_SWITCH.live).toBe(true);
    expect(withGuildLive(() => withGuildOff(() => GUILD_SWITCH.live))).toBe(false);
    expect(GUILD_SWITCH.live).toBe(true);
  });

  it('ranks climb', () => {
    expect(RANKS.map((r) => r.id)).toEqual(['novice', 'lamp1', 'lamp2', 'lamp3', 'lamp4']);
    expect(RANKS[0].merit).toBe(0);
    for (let i = 1; i < RANKS.length; i++) {
      const [a, b] = [RANKS[i - 1], RANKS[i]];
      expect(b.merit).toBeGreaterThan(a.merit);
      expect(b.offers).toBeGreaterThanOrEqual(a.offers);
      expect(b.cap).toBeGreaterThanOrEqual(a.cap);
      for (const k of a.kinds) expect(b.kinds, `${b.id} keeps ${k}`).toContain(k);
    }
    for (const r of RANKS) {
      expect(r.offers).toBeLessThanOrEqual(BOARD_MAX);
      expect(r.cap).toBeLessThanOrEqual(ACTIVE_MAX);
    }
    // spec §6.3, literally
    expect(RANKS.map((r) => [r.merit, r.offers, r.cap])).toEqual([[0, 3, 3], [12, 4, 3], [40, 4, 3], [100, 5, 4], [200, 5, 4]]);
    expect(RANKS[0].kinds).toEqual(['hunt', 'scout', 'deliver']);
    // review M4: sweeps and bounties (wardens and bosses together) open at the first lamp
    expect(RANKS[1].kinds).toEqual(['hunt', 'sweep', 'bounty', 'scout', 'deliver']);
    expect(RANKS.map((r) => r.runeBounty)).toEqual([false, false, true, true, true]);
    expect(RANKS.map((r) => r.personal)).toEqual([false, false, true, true, true]);
    expect(RANKS.map((r) => r.doubleBounty)).toEqual([false, false, false, false, true]);
    expect(RANKS.map((r) => r.gift)).toEqual([
      {}, { gold: 300, items: { 'return-lamp': 2 } }, { items: { phoenix: 1, 'star-tear': 1 } },
      { items: { 'king-scale': 1, 'shard-vivid': 1 } }, { gold: 1000, items: { 'star-tear': 2 } },
    ]);
    expect([GUILD_MAX, BOARD_MAX, ACTIVE_MAX, SWEEP_N, SCOUT_K, DELIVER_MUL]).toEqual([1e9, 5, 4, 8, [3, 5], 1.6]);
    expect(GUILD_SALT).toBe(0xb5c0fbcf);
    // spec §5.6, with the controller's ruling of 2026-10-29: a bounty never by weight, only in its fixed slots
    expect(WEIGHTS).toEqual({ hunt: 3, sweep: 2, bounty: 0, scout: 2, deliver: 3 });
  });

  it('gifts pay only reward goods', () => {
    for (const r of RANKS) {
      for (const [id, n] of Object.entries(r.gift.items ?? {})) {
        // a shard is a fragment item, in neither table (data/story/fragments.ts)
        expect(id in ITEMS || id in MATERIALS || isFragmentItem(id), `${r.id}: ${id} exists`).toBe(true);
        expect(DELIVER_KINDS.includes(MATERIALS[id]?.kind as never), `${r.id}: ${id} is no deliverable`).toBe(false);
        expect(Number.isInteger(n) && n > 0).toBe(true);
      }
      expect(r.gift.gold === undefined || (Number.isInteger(r.gift.gold) && r.gift.gold > 0)).toBe(true);
    }
  });

  it('rewards follow the table', () => {
    // spec §6.1 at d = 1, 14, 15, 29, 30, 60, 61 (lv stops at 60)
    const ds = [1, 14, 15, 29, 30, 60, 61];
    expect(ds.map((d) => REWARD.hunt(6, d))).toEqual([
      { gold: 63, items: { 'essence-magic': 1 } }, { gold: 258, items: { 'essence-magic': 1 } }, { gold: 273, items: { 'essence-rare': 1 } },
      { gold: 483, items: { 'essence-rare': 1 } }, { gold: 498, items: { 'essence-rare': 1 } }, { gold: 948, items: { 'essence-rare': 1 } },
      { gold: 948, items: { 'essence-rare': 1 } },
    ]);
    expect(REWARD.hunt(5, 1).gold).toBe(53);   // 5 × 10.5, rounded half up
    expect(ds.map((d) => REWARD.sweep(d))).toEqual([82, 238, 250, 418, 430, 790, 790].map((gold) => ({ gold, items: { 'essence-rare': 1 } })));
    expect(ds.map((d) => REWARD.warden(d))).toEqual([138, 372, 390, 642, 660, 1200, 1200].map((gold) => ({ gold, items: { 'ancient-gear': 1 } })));
    expect(ds.map((d) => REWARD.boss(d))).toEqual([
      { gold: 204, items: { 'ancient-gear': 1 } }, { gold: 516, items: { 'ancient-gear': 1 } }, { gold: 540, items: { 'star-tear': 1 } },
      { gold: 876, items: { 'star-tear': 1 } }, { gold: 900, items: { 'star-tear': 1 } }, { gold: 1620, items: { 'star-tear': 1 } },
      { gold: 1620, items: { 'star-tear': 1 } },
    ]);
    expect(ds.map((d) => REWARD.scout(d))).toEqual([60, 190, 200, 340, 350, 650, 650].map((gold) => ({ gold, items: { 'return-lamp': 1 } })));
    expect(REWARD.deliver(5, 25)).toEqual({ gold: 200 });
    expect(ds.map(runeTierAt)).toEqual(['magic', 'magic', 'rare', 'rare', 'epic', 'epic', 'epic']);
    expect(MERIT).toEqual({ hunt: 2, sweep: 3, warden: 5, boss: 6, scout: 3, deliver: 2 });
    expect([1, 30, 60, 61].map(BOARD_CAP)).toEqual([720, 4200, 7800, 7800]);
  });

  it('deliveries pay for the goods', () => {
    const goods = Object.values(MATERIALS).filter((m) => DELIVER_KINDS.includes(m.kind as never));
    expect(goods.length).toBeGreaterThan(50);
    for (const m of goods) {
      const q = deliverQty(m.price, m.kind as never);
      if (m.kind === 'trophy') expect(q, m.id).toBe(2);
      else expect(q, m.id).toBe(Math.min(8, Math.max(2, Math.round(120 / m.price))));
      expect(q).toBeGreaterThanOrEqual(2);
      expect(q).toBeLessThanOrEqual(8);
      expect(REWARD.deliver(q, m.price)).toEqual({ gold: Math.round(1.6 * q * m.price) });
    }
    expect(DELIVER_KINDS).toEqual(['monster', 'region', 'trophy']);
  });
});
