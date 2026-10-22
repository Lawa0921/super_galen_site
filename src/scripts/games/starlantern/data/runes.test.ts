import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { RUNES, RUNE_NUMBERS, RUNE_TIERS, parseRuneKey, runeKey, tiersOf, type RuneId, type RuneTier } from './runes';
import { SKILLS } from './skills';
import { NODES, nodeName } from './trees';

const IDS = Object.keys(RUNES) as RuneId[];
/** The numbers a sentence says, as written (「−35%」 says 35). */
const numbersIn = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);
/** This tier's benefit numbers, by key. */
const benefits = (id: RuneId, tier: RuneTier): Record<string, number> => {
  const i = tiersOf(id).indexOf(tier);
  return Object.fromEntries(Object.entries(RUNE_NUMBERS[id].tier).map(([k, v]) => [k, v[i]]));
};

describe('the rune catalogue (plan 8e Task 1)', () => {
  it('every rune says one sentence with its own numbers', () => {
    for (const id of IDS) {
      const tiers = tiersOf(id);
      const fixed = Object.values(RUNE_NUMBERS[id].fixed).map(Math.abs);
      tiers.forEach((tier, i) => {
        const text = RUNES[id].text(tier);
        const said = numbersIn(text);
        expect(text.endsWith('。'), `${id}@${tier}: ${text}`).toBe(true);
        expect(text.split('。').length - 1, `${id}@${tier}: ${text}`).toBe(1);
        expect(text.split('；').length - 1, `${id}@${tier}: ${text}`).toBeLessThanOrEqual(1);
        expect(text.includes('……'), `${id}@${tier}`).toBe(false);
        for (const [k, v] of Object.entries(benefits(id, tier))) {
          if (k === 'effect' && v === 100) expect(text.includes('100%'), `${id}@${tier}: ${text}`).toBe(false);
          else expect(said, `${id}@${tier} ${k}=${v}: ${text}`).toContain(v);
        }
        // The fixed cost reads from the table too (雙重詠唱 says it in words: TP 兩倍).
        for (const [k, v] of Object.entries(RUNE_NUMBERS[id].fixed)) {
          if (id === 'twin-cast' && k === 'tpPct') continue;
          expect(said, `${id}@${tier} fixed ${k}=${v}: ${text}`).toContain(Math.abs(v));
        }
        if (i === 0) return;
        const before = benefits(id, tiers[i - 1]);
        for (const [k, v] of Object.entries(benefits(id, tier))) {
          // A value the sentence also says as its fixed cost (延長 +2 回合 and TP +2) is that cost, not the old tier.
          if (before[k] === v || fixed.includes(before[k])) continue;
          expect(said, `${id}@${tier} still says ${k}=${before[k]}: ${text}`).not.toContain(before[k]);
        }
      });
    }
  });

  it('the magic tier says what the spec says', () => {
    expect(RUNES.spread.text('magic')).toBe('改為對全體，威力 60%。');
    expect(RUNES.focus.text('magic')).toBe('改為對單體，威力 170%。');
    expect(RUNES.multistrike.text('magic')).toBe('段數 +1，每段威力 75%。');
    expect(RUNES.ignite.text('magic')).toBe('每段命中 35% 機率灼燒。');
    expect(RUNES.charge.text('magic')).toBe('TP +60%；威力與效果 140%。');
    expect(RUNES.lasting.text('magic')).toBe('戰鬥開始時自動生效且整場不消失，效果 60%；保留這名角色 30% 的 TP 上限。');
    // A tier at 100% leaves the power out; the next one says it.
    expect(RUNES.flame.text('common')).toBe('屬性改為火；TP +1。');
    expect(RUNES.flame.text('magic')).toBe('屬性改為火，威力 105%；TP +1。');
    expect(RUNES.thrift.text('magic')).toBe('TP −35%；威力與效果 80%。');
    expect(RUNES['twin-cast'].text('legendary')).toBe('這招連續施放兩次，第二次威力 80%；TP 兩倍。');
    // 餘波 puts the skill's own power first, so it never reads as the ailment's; what a boss halves is its chance.
    expect(RUNES.aftermath.text('common')).toBe('暴擊時附帶這招屬性的異常（物理是流血，頭目的機率減半、抗性照算）；TP +1。');
    expect(RUNES.aftermath.text('magic')).toBe('這招威力 105%，暴擊時附帶這招屬性的異常（物理是流血，頭目的機率減半、抗性照算）；TP +1。');
    expect(RUNES['blood-price'].text('legendary')).toBe('不消耗 TP，每 1 TP 改付最大 HP 的 3%。');
  });

  it('data/runes.ts writes no number by hand', () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), 'runes.ts');
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const texts: string[] = [];
    const walk = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        texts.push(n.text);
      }
      n.forEachChild(walk);
    };
    walk(src);
    expect(texts.length).toBeGreaterThan(30);
    expect(texts.filter((t) => /\d+\s*(%|回合)/.test(t))).toEqual([]);
  });

  it('rune keys round-trip and refuse junk', () => {
    for (const id of IDS) for (const tier of tiersOf(id)) expect(parseRuneKey(runeKey({ id, tier }))).toEqual({ id, tier });
    expect(runeKey({ id: 'spread', tier: 'magic' })).toBe('spread@magic');
    for (const junk of ['spread@legendary', 'twin-cast@magic', 'nope@magic', 'spread', 'spread@', '@magic', 'spread@magic@rare']) {
      expect(parseRuneKey(junk), junk).toBeNull();
    }
  });

  it('32 runes, 6 legendary, groups as the table', () => {
    expect(IDS.length).toBe(32);
    const legendary = IDS.filter((id) => RUNES[id].group === 'legendary');
    expect(legendary).toEqual(['twin-cast', 'starwheel', 'blood-price', 'sync', 'spill-shield', 'reprise']);
    for (const id of IDS) {
      expect(RUNES[id].id).toBe(id);
      expect(tiersOf(id)).toEqual(RUNES[id].group === 'legendary' ? ['legendary'] : RUNE_TIERS);
      for (const v of Object.values(RUNE_NUMBERS[id].tier)) expect(v.length, id).toBe(tiersOf(id).length);
    }
    const group = (g: string) => IDS.filter((id) => RUNES[id].group === g);
    expect(group('shape')).toEqual(['spread', 'focus', 'bounce']);
    expect(group('hits')).toEqual(['multistrike', 'heavy']);
    expect(group('element')).toEqual(['flame', 'rime', 'thunderclap']);
    expect(group('ailment')).toEqual(['ignite', 'jolt', 'tear', 'frostbite', 'venom', 'aftermath']);
    expect(group('trigger')).toEqual(['on-crit', 'on-kill', 'on-struck']);
    expect(group('economy')).toEqual(['regain', 'thrift', 'charge', 'drain']);
    expect(group('support')).toEqual(['extend', 'share', 'lasting', 'dispel', 'armor-break']);
    // The whole table (spec §6.4/§6.7 and plan 8e's rune table), written out: a change to any number is a decision made here.
    expect(RUNE_NUMBERS).toEqual({
      spread: { tier: { power: [55, 60, 65, 70] }, fixed: {} },
      focus: { tier: { power: [160, 170, 180, 190] }, fixed: {} },
      bounce: { tier: { dropPct: [35, 30, 25, 20] }, fixed: { bounces: 2 } },
      multistrike: { tier: { power: [70, 75, 80, 85] }, fixed: { hits: 1 } },
      heavy: { tier: { power: [110, 115, 120, 125] }, fixed: {} },
      flame: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 1 } },
      rime: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 1 } },
      thunderclap: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 1 } },
      ignite: { tier: { chance: [30, 35, 40, 45] }, fixed: {} },
      jolt: { tier: { chance: [30, 35, 40, 45] }, fixed: {} },
      tear: { tier: { chance: [30, 35, 40, 45] }, fixed: {} },
      frostbite: { tier: { chance: [20, 25, 30, 35] }, fixed: {} },
      venom: { tier: { chance: [25, 30, 35, 40] }, fixed: {} },
      aftermath: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 1 } },
      'on-crit': { tier: { pct: [50, 60, 70, 80] }, fixed: {} },
      'on-kill': { tier: { pct: [50, 60, 70, 80] }, fixed: {} },
      'on-struck': { tier: { pct: [40, 50, 60, 70] }, fixed: {} },
      regain: { tier: { tpPerHit: [1, 1, 1, 2], power: [80, 85, 90, 90] }, fixed: {} },
      thrift: { tier: { effect: [75, 80, 85, 90] }, fixed: { tpPct: -35 } },
      charge: { tier: { effect: [130, 140, 150, 160] }, fixed: { tpPct: 60 } },
      drain: { tier: { drainPct: [6, 8, 10, 12] }, fixed: { tpFlat: 1 } },
      extend: { tier: { turns: [1, 2, 3, 4] }, fixed: { tpFlat: 2 } },
      share: { tier: { effect: [40, 50, 60, 70] }, fixed: {} },
      lasting: { tier: { pct: [50, 60, 70, 80] }, fixed: { reservePct: 30 } },
      dispel: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 2 } },
      'armor-break': { tier: { effect: [100, 105, 110, 115] }, fixed: { tpPct: 20 } },
      'twin-cast': { tier: {}, fixed: { tpPct: 100, secondPct: 80 } },
      starwheel: { tier: {}, fixed: { tpFlat: 1 } },
      'blood-price': { tier: { bloodPct: [3] }, fixed: { perTp: 1 } },
      sync: { tier: { sync: [30] }, fixed: {} },
      'spill-shield': { tier: { overflowPct: [30] }, fixed: {} },
      reprise: { tier: { reprise: [50] }, fixed: {} },
    });
    // The table's numbers, spot checked at each end.
    expect(RUNES.spread.mod('common')).toEqual({ shape: 'spread', power: 55 });
    expect(RUNES.focus.mod('epic')).toEqual({ shape: 'focus', power: 190 });
    expect(RUNES.bounce.mod('magic')).toEqual({ bounce: { bounces: 2, dropPct: 30 } });
    expect(RUNES.heavy.mod('rare')).toEqual({ hits: 'one', power: 120 });
    expect(RUNES.regain.mod('epic')).toEqual({ tpPerHit: 2, power: 90 });
    expect(RUNES.ignite.mod('epic')).toEqual({ onHit: { status: 'burn', chance: 0.45 } });
    expect(RUNES.frostbite.mod('common')).toEqual({ inflict: { status: 'freeze', chance: 0.2 } });
    expect(RUNES.lasting.mod('rare')).toEqual({ lasting: { pct: 70, reservePct: 30 } });
    expect(RUNES.thrift.mod('common')).toEqual({ effect: 75, tpPct: -35 });
    expect(RUNES['armor-break'].mod('epic')).toEqual({ armorBreak: true, effect: 115, tpPct: 20 });
    expect(RUNES['twin-cast'].mod('legendary')).toEqual({ twice: true, tpPct: 100 });
    expect(RUNES.starwheel.mod('legendary')).toEqual({ element: 'wheel', tpFlat: 1 });
    expect(RUNES['on-struck'].mod('magic')).toEqual({ trigger: { on: 'struck', pct: 50 } });
  });

  it('rune names and ids collide with nothing', () => {
    const taken = new Set<string>(Object.values(SKILLS).map((s) => s.name));
    for (const [id, { node }] of Object.entries(NODES)) {
      taken.add(nodeName(id));
      if (node.label !== undefined) taken.add(node.label);
      if (node.name !== undefined) taken.add(node.name);
    }
    for (const id of IDS) {
      expect(taken.has(RUNES[id].name), `${id} ${RUNES[id].name}`).toBe(false);
      expect(SKILLS[id], id).toBeUndefined();
    }
    expect(new Set(IDS.map((id) => RUNES[id].name)).size).toBe(IDS.length);
    // The four renamed so they read as no skill, variant or mechanic: 彈射 (not 連鎖), 除厄 (not 淨化), 化盾 (not 滿溢), armor-break (not pierce).
    expect(RUNES.bounce.name).toBe('彈射');
    expect(taken.has('連鎖')).toBe(true);
    expect(RUNES.dispel.name).toBe('除厄');
    expect(taken.has('淨化')).toBe(true);
    expect(RUNES['spill-shield'].name).toBe('化盾');
    expect(taken.has('滿溢')).toBe(true);
    expect(RUNES['armor-break'].name).toBe('破甲');
    expect(SKILLS.pierce).toBeDefined();
  });
});
