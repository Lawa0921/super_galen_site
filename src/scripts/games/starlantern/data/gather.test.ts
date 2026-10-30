import { describe, expect, it } from 'vitest';
import {
  COUNT_CUTS, DEEP_AT, GATHER_ART, GATHER_FLOOR_CAP, GATHER_MATERIALS, GATHER_NOISE, GATHER_NOISE_TOOL2, GATHER_PIN_QTY, GATHER_RECIPES,
  GATHER_SWITCH, GATHER_TABLE, GENERIC_TYPES, LIGHT_SHARE, REGION_WEIGHTS, RICH_BONUS, RICH_CHANCE, RICH_NOISE, SPOT_CHANCE,
  SPOT_OF, SPOT_RULES, TOOL_LEVELS, gatherOpen, gatherQty, gatherTypeOf, isDeep, spotRegionOf,
} from './gather';
import { MATERIALS } from './materials';
import { ITEMS } from './items';
import { EQUIPMENT } from './equipment';
import { REGIONS } from './regions';
import { CONSUMABLE_RECIPES } from './forge';
import { newGame } from '../engine/state';
import { withGatherLive, withGatherOff } from '../engine/testing';
import { allArtUrls } from '../render/artPaths';
import { GATHER_TEXT, type GatherText } from './gather.zh-TW';
import { speakerOf, storyTexts } from './story/voiceGates';
import { T } from './text.zh-TW';

/** The number of art urls on master before gathering (SDD A/baseline.md): the fourteen materials add none (ruling 9). */
const BASELINE_ART_URLS = 999;

const seenFirstReturn = () => {
  const s = newGame();
  s.story.seen.push('first-return');
  return s;
};

describe('gathering data (gathering plan Task A1)', () => {
  // Plan Task D1: gathering goes live. Open once the prologue's first return is seen, shut before it; withGatherLive still
  // puts back what it found.
  it('the switch is on', () => {
    expect(GATHER_SWITCH.live).toBe(true);
    const fresh = newGame();
    const back = seenFirstReturn();
    // the default unlock: the prologue's first return
    expect(GATHER_SWITCH.open(fresh)).toBe(false);
    expect(GATHER_SWITCH.open(back)).toBe(true);
    expect(gatherOpen(back)).toBe(true);
    expect(gatherOpen(fresh)).toBe(false);   // before the first return
    const open = GATHER_SWITCH.open;
    expect(withGatherLive(() => [GATHER_SWITCH.live, gatherOpen(fresh), gatherOpen(back)])).toEqual([true, false, true]);
    expect(GATHER_SWITCH.live).toBe(true);
    expect(GATHER_SWITCH.open).toBe(open);
    expect(() => withGatherLive(() => { throw new Error('boom'); })).toThrow('boom');
    expect(GATHER_SWITCH.live).toBe(true);
    expect(GATHER_SWITCH.open).toBe(open);
    // held shut: never open, whatever the story
    expect(withGatherLive(() => [gatherOpen(fresh), gatherOpen(back)], { open: false })).toEqual([false, false]);
    expect(GATHER_SWITCH.open).toBe(open);
    // held open: always open, the first return or not (review H1)
    expect(withGatherLive(() => [gatherOpen(fresh), gatherOpen(back)], { open: true })).toEqual([true, true]);
    expect(GATHER_SWITCH.live).toBe(true);
    expect(GATHER_SWITCH.open).toBe(open);
    expect(() => withGatherLive(() => { throw new Error('boom'); }, { open: true })).toThrow('boom');
    expect(GATHER_SWITCH.open).toBe(open);
    expect(GATHER_SWITCH.open(fresh)).toBe(false);
  });

  // As the guild's (guild spec §0 item 24): with gathering live, a test of the switched-off game says so.
  it('withGatherOff shuts gathering for its callback and puts the switch back, sync, async or thrown', async () => {
    const back = seenFirstReturn();
    expect(withGatherOff(() => [GATHER_SWITCH.live, gatherOpen(back)])).toEqual([false, false]);
    expect(GATHER_SWITCH.live).toBe(true);
    expect(() => withGatherOff(() => { throw new Error('boom'); })).toThrow('boom');
    expect(GATHER_SWITCH.live).toBe(true);
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    const pending = withGatherOff(async () => { await tick(); return GATHER_SWITCH.live; });
    expect(GATHER_SWITCH.live).toBe(false);   // still off while the callback awaits
    expect(await pending).toBe(false);
    expect(GATHER_SWITCH.live).toBe(true);
    await expect(withGatherOff(async () => { await tick(); throw new Error('later'); })).rejects.toThrow('later');
    expect(GATHER_SWITCH.live).toBe(true);
    expect(withGatherLive(() => withGatherOff(() => GATHER_SWITCH.live))).toBe(false);
    expect(GATHER_SWITCH.live).toBe(true);
  });

  it('fourteen gathered materials', () => {
    // spec §7.1, row for row
    expect(GATHER_MATERIALS.map((m) => [m.id, m.name, m.price])).toEqual([
      ['copper-ore', '銅礦石', 8], ['silver-ore', '銀礦石', 24], ['stanch-herb', '止血草', 6], ['moonbell-herb', '月鈴草', 18],
      ['cap-mushroom', '灰帽菇', 6], ['glow-mushroom', '螢光菇', 18], ['quartz-chip', '石英碎晶', 10], ['deep-quartz', '深藍晶', 28],
      ['ember-glass', '焰琉璃', 24], ['rime-moss', '霜苔', 16], ['charged-ore', '帶電礦石', 22], ['bog-resin', '黑沼脂', 22],
      ['shade-silk', '影繭絲', 20], ['scrap-iron', '廢鐵塊', 18],
    ]);
    for (const m of GATHER_MATERIALS) {
      expect(m.kind, m.id).toBe('gather');
      expect(m.owner, m.id).toBeUndefined();
    }
    const gathered = new Set(GATHER_MATERIALS.map((m) => m.id));
    const others = Object.values(MATERIALS).filter((m) => !gathered.has(m.id));
    const ids = new Set([...others.map((m) => m.id), ...Object.keys(ITEMS), ...Object.keys(EQUIPMENT)]);
    const names = new Set([...others.map((m) => m.name), ...Object.values(ITEMS).map((i) => i.name), ...Object.values(EQUIPMENT).map((e) => e.name)]);
    for (const m of GATHER_MATERIALS) {
      expect(ids.has(m.id), m.id).toBe(false);
      expect(names.has(m.name), m.name).toBe(false);
    }
    expect(new Set(GATHER_MATERIALS.map((m) => m.name)).size).toBe(14);
    // last in MATERIALS, in this order, as these very rows
    expect(Object.keys(MATERIALS).slice(-14)).toEqual(GATHER_MATERIALS.map((m) => m.id));
    for (const m of GATHER_MATERIALS) expect(MATERIALS[m.id]).toEqual(m);
    expect(Object.values(MATERIALS).filter((m) => m.kind === 'gather')).toHaveLength(14);
  });

  it('every point has its materials', () => {
    expect(GENERIC_TYPES).toEqual(['vein', 'herb', 'fungus', 'crystal']);
    expect(Object.fromEntries(GENERIC_TYPES.map((t) => [t, [GATHER_TABLE[t].name, GATHER_TABLE[t].shallow, GATHER_TABLE[t].deep]]))).toEqual({
      vein: ['礦脈', 'copper-ore', 'silver-ore'],
      herb: ['藥草叢', 'stanch-herb', 'moonbell-herb'],
      fungus: ['菇叢', 'cap-mushroom', 'glow-mushroom'],
      crystal: ['晶脈', 'quartz-chip', 'deep-quartz'],
    });
    expect(SPOT_OF).toEqual({ blaze: 'ember-glass', frost: 'rime-moss', storm: 'charged-ore', mire: 'bog-resin', shade: 'shade-silk', iron: 'scrap-iron' });
    expect(Object.keys(SPOT_OF).sort()).toEqual(Object.keys(REGIONS).filter((r) => r !== 'mainline').sort());
    expect(new Set(Object.values(SPOT_OF)).size).toBe(6);
    const expected: Record<string, [string, string | undefined, boolean]> = {
      'copper-ore': ['vein', undefined, false], 'silver-ore': ['vein', undefined, true],
      'stanch-herb': ['herb', undefined, false], 'moonbell-herb': ['herb', undefined, true],
      'cap-mushroom': ['fungus', undefined, false], 'glow-mushroom': ['fungus', undefined, true],
      'quartz-chip': ['crystal', undefined, false], 'deep-quartz': ['crystal', undefined, true],
      'ember-glass': ['spot', 'blaze', false], 'rime-moss': ['spot', 'frost', false], 'charged-ore': ['spot', 'storm', false],
      'bog-resin': ['spot', 'mire', false], 'shade-silk': ['spot', 'shade', false], 'scrap-iron': ['spot', 'iron', false],
    };
    for (const m of GATHER_MATERIALS) expect([gatherTypeOf(m.id), spotRegionOf(m.id), isDeep(m.id)], m.id).toEqual(expected[m.id]);
    // not a gathered material: nothing
    for (const id of ['moss', 'blaze-core', 'potion', 'no-such-id']) expect([gatherTypeOf(id), spotRegionOf(id), isDeep(id)], id).toEqual([undefined, undefined, false]);
  });

  it('every region has its character', () => {
    // spec §5.3: vein, herb, fungus, crystal
    const row = (r: keyof typeof REGION_WEIGHTS) => GENERIC_TYPES.map((t) => REGION_WEIGHTS[r][t]);
    expect(Object.keys(REGION_WEIGHTS).sort()).toEqual(Object.keys(REGIONS).sort());
    expect(row('mainline')).toEqual([3, 3, 2, 2]);
    expect(row('blaze')).toEqual([5, 1, 1, 3]);
    expect(row('frost')).toEqual([2, 2, 1, 5]);
    expect(row('storm')).toEqual([4, 2, 1, 3]);
    expect(row('mire')).toEqual([1, 4, 5, 0]);
    expect(row('shade')).toEqual([1, 2, 5, 2]);
    expect(row('iron')).toEqual([6, 1, 1, 2]);
    for (const r of Object.keys(REGION_WEIGHTS) as (keyof typeof REGION_WEIGHTS)[]) expect(row(r).some((w) => w > 0), r).toBe(true);
    // spec §5.3's spot table: point, rule, multipliers, the extra good, the harm
    expect(SPOT_RULES).toEqual({
      blaze: { rule: 'scald', point: '琉璃結塊', name: '燙手', noiseMul: 1, qtyMul: 1, qtyAdd: 0, hurt: 'hurt' },
      frost: { rule: 'hush', point: '霜苔岩', name: '無聲', noiseMul: 0, qtyMul: 1, qtyAdd: 0 },
      storm: { rule: 'charge', point: '帶電礦脈', name: '帶電', noiseMul: 1, qtyMul: 1, qtyAdd: 1, tp: true },
      mire: { rule: 'fumes', point: '沼脂池', name: '毒氣', noiseMul: 1, qtyMul: 1, qtyAdd: 0, hurt: 'poison' },
      shade: { rule: 'hidden', point: '影繭', name: '藏在暗處', noiseMul: 0.5, qtyMul: 1, qtyAdd: 0, hidden: true },
      iron: { rule: 'clang', point: '廢鐵堆', name: '鏗鏘', noiseMul: 2, qtyMul: 2, qtyAdd: 0 },
    });
  });

  it("the numbers are the spec's", () => {
    expect([SPOT_CHANCE, RICH_CHANCE, RICH_BONUS, RICH_NOISE, DEEP_AT]).toEqual([0.35, 0.15, 2, 15, 15]);
    expect(COUNT_CUTS).toEqual([0.25, 0.75]);
    const depths = [1, 19, 20, 39, 40, 59, 60, 61, 250];
    expect(depths.map((d) => gatherQty(1, d))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4]);
    expect(depths.map((d) => gatherQty(2, d))).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 5]);
    expect([GATHER_NOISE, GATHER_NOISE_TOOL2, LIGHT_SHARE, GATHER_PIN_QTY]).toEqual([30, 20, 0.5, 2]);
    expect([1, 20, 60, 61].map(GATHER_FLOOR_CAP)).toEqual([610, 800, 1200, 1200]);
  });

  it('tools and recipes use only what exists', () => {
    expect(TOOL_LEVELS.map((t) => [t.level, t.name, t.needs])).toEqual([[1, '鐵鎬與鐮刀', 0], [2, '精工採集工具', 1]]);
    expect(TOOL_LEVELS[0].cost).toEqual({ gold: 150, mats: { 'copper-ore': 6, 'quartz-chip': 2 } });
    expect(TOOL_LEVELS[1].cost).toEqual({ gold: 600, mats: { 'silver-ore': 6, 'deep-quartz': 2, 'ember-glass': 2, 'scrap-iron': 2 } });
    for (const t of TOOL_LEVELS) for (const id of Object.keys(t.cost.mats)) expect(MATERIALS[id], id).toBeDefined();
    for (const [item, c] of Object.entries(GATHER_RECIPES)) {
      expect(CONSUMABLE_RECIPES[item], item).toBeDefined();   // a second recipe, never a new item
      for (const id of Object.keys(c.mats)) expect(MATERIALS[id]?.kind, `${item} ${id}`).toBe('gather');
    }
    // spec §7.2, row for row
    expect(GATHER_RECIPES).toEqual({
      potion: { gold: 4, mats: { 'stanch-herb': 2 } },
      antidote: { gold: 2, mats: { 'cap-mushroom': 1 } },
      ether: { gold: 8, mats: { 'moonbell-herb': 1, 'quartz-chip': 1 } },
      'return-lamp': { gold: 8, mats: { 'quartz-chip': 2, 'copper-ore': 1 } },
      phoenix: { gold: 20, mats: { 'moonbell-herb': 2, 'glow-mushroom': 1, 'deep-quartz': 1 } },
    });
    // the second tool sends the player to the blaze and iron lands
    expect(TOOL_LEVELS[1].cost.mats['ember-glass']).toBeGreaterThan(0);
    expect(TOOL_LEVELS[1].cost.mats['scrap-iron']).toBeGreaterThan(0);
  });

  it('every gathered good wears its published icon (PR E), and the art list grows by the tiles and icons only', () => {
    expect([...GATHER_ART]).toEqual(GATHER_MATERIALS.map((m) => m.id));
    // 10 point tiles, 14 material icons, 2 tool icons (gathering plan Task E3)
    expect(allArtUrls()).toHaveLength(BASELINE_ART_URLS + 10 + 14 + 2);
  });
});

/** Gathering plan Task B1 (spec §9.1, §9.2, rulings 10 and 11): the empty slots, their speakers, and the plain system words. */
describe('gathering words (gathering plan Task B1)', () => {
  /** Every slot of spec §9.2, as `path: []`. */
  const SLOTS = [
    'remarks.sylvie.herb', 'remarks.sylvie.fungus', 'remarks.bobby.vein', 'remarks.bobby.crystal', 'remarks.liz.crystal', 'remarks.liz.spot',
    'remarks.rin.any', 'inner.first', 'inner.deep', 'doran.tools', 'doran.made1', 'doran.made2',
  ];
  const at = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], o);
  /** A copy of the slots with one line in each, for the checks that walk words (the real slots are empty). */
  const filled = (): GatherText => {
    const t = structuredClone(GATHER_TEXT);
    for (const p of SLOTS) (at(t, p) as string[]).push('「好。」');
    return t;
  };

  it('the slots are there and empty', () => {
    const leaves: string[] = [];
    const walk = (v: unknown, path: string[]): void => {
      if (Array.isArray(v)) { leaves.push(path.join('.')); return; }
      for (const [k, x] of Object.entries(v as object)) walk(x, [...path, k]);
    };
    walk(GATHER_TEXT, []);
    expect(leaves.sort()).toEqual([...SLOTS].sort());
    for (const p of SLOTS) expect(at(GATHER_TEXT, p), p).toEqual([]);
    expect(storyTexts().filter((t) => t.key.startsWith('gather.'))).toEqual([]);   // nothing walked today: no line to say
  });

  it('every gathering slot has a speaker', () => {
    const texts = storyTexts(filled()).filter((t) => t.key.startsWith('gather.'));
    expect(texts.map((t) => t.key).sort()).toEqual(SLOTS.map((p) => `gather.${p}.0`).sort());
    const want = (key: string): string => {
      const [, a, b] = key.split('.');
      return a === 'remarks' ? b : a === 'inner' ? 'hero' : 'doran';
    };
    for (const t of texts) expect(speakerOf(t.key, t.line), t.key).toBe(want(t.key));
    expect(speakerOf('gather.remarks.sylvie.herb.0')).toBe('sylvie');
    expect(speakerOf('gather.inner.first.0')).toBe('hero');
    expect(speakerOf('gather.doran.made2.0')).toBe('doran');
  });

  // Review nit (PR D): the result line keeps the window's floor of 1, so a member stopped at 1 HP is not told a bigger loss.
  it("the toll's result line says the floor of 1, as the window's rule line does", () => {
    const G = T.ui2.gather;
    expect(G.toll.hp('燙手', 6)).toBe('燙手：全員 HP −6（最低剩 1）。');
    for (const rule of ['scald', 'fumes'] as const) expect(G.rules[rule](6).endsWith('（最低剩 1）'), rule).toBe(true);
  });

  it('system words are plain', () => {
    const G = T.ui2.gather;
    const words: [string, string][] = [
      ...Object.entries(G.points).map(([k, v]): [string, string] => [`points.${k}`, v]),
      ['rich', G.rich], ['hint', G.hint(G.points.vein + G.rich)], ['looks', G.looks('銅礦石')],
      ...Object.entries(G.modes).map(([k, v]): [string, string] => [`modes.${k}`, v]),
      ['modeRow', G.modeRow(3, 21, 44, T.map.danger.yellow, G.next.maybe)],
      ...Object.entries(G.next).map(([k, v]): [string, string] => [`next.${k}`, v]),
      ...Object.entries(G.rules).map(([k, f]): [string, string] => [`rules.${k}`, f(6)]),
      ['got', G.got('銅礦石', 5)], ['toll.hp', G.toll.hp('燙手', 6)], ['toll.tp', G.toll.tp('帶電', 12)],
      ['full.desc', G.full.desc('銅礦石', 5, 1.5)], ['full.left', G.full.left],
      ['tools.row', G.tools.row], ['tools.made', G.tools.made], ['tools.effect.1', G.tools.effect[1]], ['tools.effect.2', G.tools.effect[2]],
      ['tools.needs', G.tools.needs(TOOL_LEVELS[0].name)], ['made', G.made(TOOL_LEVELS[0].name)], ['altTag', G.altTag('回復藥')], ['pinQty', G.pinQty(2)],
    ];
    expect(Object.keys(G.points)).toHaveLength(10);
    for (const r of Object.keys(SPOT_RULES) as (keyof typeof SPOT_RULES)[]) expect(G.points[r]).toBe(SPOT_RULES[r].point);
    for (const t of GENERIC_TYPES) expect(G.points[t]).toBe(GATHER_TABLE[t].name);
    // each rule's line starts with the rule's own name
    for (const r of Object.values(SPOT_RULES)) expect(G.rules[r.rule](6).startsWith(`${r.name}：`), r.rule).toBe(true);
    for (const [k, w] of words) {
      expect(w.length, k).toBeGreaterThan(0);
      expect(w, k).not.toContain('……');
      expect(w, k).not.toMatch(/[！!]/);
    }
  });
});
