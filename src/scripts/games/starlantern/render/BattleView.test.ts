import { ColorMatrixFilter, Container, Graphics, Sprite, Text, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { SoundManager } from '../audio/SoundManager';
import type { BattleState } from '../engine/battle';
import { makeBattle, makeCombatant } from '../engine/testing';
import { OutlineFilter } from 'pixi-filters';
import { BattleView, TINT_COLORS, TINT_STYLE, ailLabelWidth } from './BattleView';
import { AFFIX_FILL, AILMENT_FILL, AILMENT_MORE_FILL } from './ailmentStyle';
import { MECH_FILL } from './mechStyle';
import type { AilmentChip } from '../engine/ailments';
import type { MechWord } from '../engine/mechanics/index';
import type { TextureBank } from './textures';
import { enemyArt } from './artPaths';
import { T } from '../data/text.zh-TW';
import { ENEMIES } from '../data/enemies';
import { REGIONS } from '../data/regions';
import { CHARACTERS } from '../data/characters';

const sfx = { hit: vi.fn(), weak: vi.fn(), heal: vi.fn(), ko: vi.fn() } as unknown as SoundManager;
/** Five ailments, as the battle hands them over (the fixed chip order). */
const FIVE: AilmentChip[] = [{ id: 'poison' }, { id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 }, { id: 'shock', turns: 2 }, { id: 'chill', turns: 2 }];
const bank = { get: () => Texture.WHITE, has: () => true } as unknown as TextureBank;
const battle = (log: BattleState['log']): BattleState =>
  makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], [makeCombatant({ key: 'e0', side: 'enemy' })], { log });
const enemyBox = (view: BattleView) => (view.root.children[0] as Container).children.find((c) => c instanceof Container && !(c instanceof Sprite) && c.children.length > 0) as Container;

describe('BattleView', () => {
  it('lets the final shatter finish before playback resolves', async () => {
    // a real display runs frames ~16 ms apart; the test environment's rAF is near-instant
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
    const view = new BattleView(false, bank);
    view.setup(battle([]), { width: 800, height: 450 }, 1);
    const box = enemyBox(view);
    const s = battle([{ type: 'ko', target: 'e0' }]);
    s.enemies[0].alive = false;
    await view.play(s, sfx);
    const pieces = (box.children[0] as Container).children.filter((c) => c.visible);
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.every((p) => p.alpha === 0)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('cancels pending effects when a new battle is set up', async () => {
    const view = new BattleView(false, bank);
    view.setup(battle([]), { width: 800, height: 450 }, 1);
    const errors: unknown[] = [];
    const onErr = (e: unknown) => errors.push(e);
    process.on('uncaughtException', onErr);
    const playing = view.play(battle([{ type: 'damage', target: 'e0', amount: 5, element: 'phys', mult: 1 }]), sfx);
    await new Promise((r) => setTimeout(r, 20));
    view.setup(battle([]), { width: 800, height: 450 }, 1);
    await playing;
    await new Promise((r) => setTimeout(r, 600));
    process.off('uncaughtException', onErr);
    expect(errors).toEqual([]);
  });
});

describe('BattleView anchors', () => {
  it('gives the screen point above each enemy for the target cursor', () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    const a = view.anchor('e0')!;
    expect(a.x).toBeCloseTo(320, 0);
    expect(a.y).toBeLessThan(360 * 0.85);
    expect(view.anchor('nobody')).toBeNull();
  });
});

describe('BattleView left inset', () => {
  it('spreads enemies over the area right of the command window', () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1, 160);
    expect(view.anchor('e0')!.x).toBeCloseTo(160 + (640 - 160) / 2, 0);
  });
});

describe('BattleView bottom inset', () => {
  it('stands enemies and their names above the party bar', () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
    const box = enemyBox(view);
    expect(box.y + 18).toBeLessThanOrEqual(360 - 66);
    expect(view.anchor('e0')!.y).toBeGreaterThan(60);   // below the message line
  });

  it("gives each enemy HP bar's box with its rim, in design px", () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
    const box = enemyBox(view);
    const bar = box.children.find((c) => c instanceof Graphics)!;
    expect(view.hpBarRect('e0')).toEqual({ x: box.x - 33, y: box.y + bar.y - 1, width: 66, height: 6 });
    expect(view.hpBarRect('nobody')).toBeNull();
  });

  it("keeps each HP bar clear of the party's one row of ailment words, lifted no more than that needs", () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
    // The party bar's top is 360 - 2 - 62 = 296; the row of words is 12 px (10 + rim) with a 1 px margin.
    const wordsTop = 296 - 1 - 12;
    const r = view.hpBarRect('e0')!;
    expect(r.y + r.height).toBeLessThanOrEqual(wordsTop - 1);
    expect(r.y + r.height).toBeGreaterThanOrEqual(wordsTop - 2);   // the minimum lift, no more
    const box = enemyBox(view);
    const name = box.children.find((c) => c instanceof Text && c.text === 'e0')!;
    expect(name.y + 18).toBeLessThanOrEqual(r.y - box.y + 1);
  });

  it("an enemy's hit number and its tags stand on its body, clear of its ailment row and its intent (the bat and a boss)", () => {
    type R = { x: number; y: number; width: number; height: number };
    const meets = (a: R, b: R) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const cases: [string, Texture, boolean, number][] = [
      ['bat, four of them', new Texture({ source: new TextureSource({ width: 119, height: 65 }) }), false, 4],
      ['bat, alone', new Texture({ source: new TextureSource({ width: 119, height: 65 }) }), false, 1],
      ['boss', new Texture({ source: new TextureSource({ width: 220, height: 300 }) }), true, 1],
    ];
    for (const [name, tex, boss, n] of cases) {
      const view = new BattleView(true, { get: () => tex, has: () => true } as unknown as TextureBank);
      const foes = Array.from({ length: n }, (_, i) => makeCombatant({ key: `e${i}`, side: 'enemy', defId: boss ? 'golem' : 'bat', boss }));
      view.setup(makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], foes), { width: 640, height: 360 }, 1, 150, 66);
      view.showIntents({ e0: '攻擊 → 絲嘉蕾' });
      view.showAilments({ e0: [{ id: 'poison' }, { id: 'burn', turns: 3 }] });
      const row = view.ailmentRowRect('e0')!, intent = view.intentRect('e0')!;
      const body = (view.enemyBoxOf('e0')!.children[0] as Container).height;
      for (const opts of [{}, { resist: true }, { weak: true }, { crit: true }, { crit: true, weak: true }, { crit: true, resist: true }]) {
        for (const text of ['7', '1234', 'MISS']) {
          const p = view.popupLayout('e0', text, opts)!;
          for (const r of [p.number, ...p.tags]) {
            expect(meets(r, row), `${name} ${text} ${JSON.stringify(opts)} vs the ailment row`).toBe(false);
            expect(meets(r, intent), `${name} ${text} ${JSON.stringify(opts)} vs the intent`).toBe(false);
          }
          // Readable on a small sprite: the number stands on the body.
          const mid = p.number.y + p.number.height / 2;
          expect(mid, `${name} ${text}`).toBeGreaterThanOrEqual(-body);
          expect(mid, `${name} ${text}`).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('a hit draws its number and tags where popupLayout puts them', async () => {
    const view = new BattleView(true, bank, true);   // calm: no scale animation
    view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
    const box = view.enemyBoxOf('e0')!;
    const added: { text: string; x: number; y: number }[] = [];
    const add = box.addChild.bind(box);
    vi.spyOn(box, 'addChild').mockImplementation(((...c: Text[]) => { added.push(...c.filter((x) => x instanceof Text).map((x) => ({ text: x.text, x: x.x, y: x.y }))); return add(...c); }) as never);
    await view.play(battle([{ type: 'damage', target: 'e0', amount: 30, element: 'fire', mult: 1.5, crit: true }]), sfx);
    const p = view.popupLayout('e0', '30', { weak: true, crit: true })!;
    expect(added.map((t) => t.text)).toEqual(['30', T.battle.pop.crit, T.battle.pop.weak]);
    expect(added[0].y).toBeCloseTo(p.number.y + p.number.height / 2, 6);
    expect(added.slice(1).map((t) => t.y)).toEqual(p.tags.map((r) => r.y + r.height / 2));
    expect(added.slice(1).map((t) => t.x)).toEqual(p.tags.map((r) => r.x + r.width / 2));
  });

  it('a small sprite (the bat) keeps at least 30 px visible above its name, its ailment words above its head', () => {
    const bat = new Texture({ source: new TextureSource({ width: 119, height: 65 }) });
    const batBank = { get: () => bat, has: () => true } as unknown as TextureBank;
    const view = new BattleView(true, batBank);
    const four = makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], ['e0', 'e1', 'e2', 'e3'].map((key) => makeCombatant({ key, side: 'enemy', defId: 'bat' })));
    view.setup(four, { width: 640, height: 360 }, 1, 150, 66);
    view.showAilments(Object.fromEntries(['e0', 'e1', 'e2', 'e3'].map((k) => [k, FIVE])));
    for (const key of ['e0', 'e1', 'e2', 'e3']) {
      const box = view.enemyBoxOf(key)!;
      const body = box.children[0] as Container;
      const name = box.children.find((c) => c instanceof Text && c.text === key)!;
      const spriteTop = -body.height;
      expect(name.y - spriteTop, key).toBeGreaterThanOrEqual(30);
      const words = view.ailmentTexts(key);
      expect(words.length).toBeGreaterThan(0);
      for (const t of words) expect(t.parent!.y + t.y + 14, key).toBeLessThanOrEqual(spriteTop);
    }
  });

  it('with four enemies of five ailments each, every row is one line inside its own slot and no two overlap', () => {
    const view = new BattleView(true, bank);
    const four = makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], ['e0', 'e1', 'e2', 'e3'].map((key) => makeCombatant({ key, side: 'enemy' })));
    view.setup(four, { width: 640, height: 360 }, 1, 150, 66);
    view.showAilments(Object.fromEntries(['e0', 'e1', 'e2', 'e3'].map((k) => [k, FIVE])));
    const slotW = (640 - 150) / 5;
    const rows = ['e0', 'e1', 'e2', 'e3'].map((key) => {
      const box = view.enemyBoxOf(key)!;
      const words = view.ailmentTexts(key);
      expect(new Set(words.map((t) => t.y)).size, key).toBe(1);   // one line
      const left = box.x + words[0].x - ailLabelWidth(words[0].text) / 2;
      const right = box.x + words.at(-1)!.x + ailLabelWidth(words.at(-1)!.text) / 2;
      expect(right - left, key).toBeLessThanOrEqual(slotW - 6);
      return { key, left, right, texts: words.map((t) => t.text) };
    });
    for (let i = 1; i < rows.length; i++) expect(rows[i].left, `${rows[i - 1].key} / ${rows[i].key}`).toBeGreaterThan(rows[i - 1].right);
    // The most severe first; what does not fit folds into +N in the ink colour.
    expect(rows[0].texts[0]).toBe('流血×2');
    expect(rows[0].texts.at(-1)).toMatch(/^\+\d$/);
    const shown = rows[0].texts.length - 1, folded = Number(rows[0].texts.at(-1)!.slice(1));
    expect(shown + folded).toBe(5);
    expect(view.ailmentTexts('e0').at(-1)!.style.fill).toBe(AILMENT_MORE_FILL);
  });

  it("four foes: one row each of words and ailments, capped with +N; freeze and sleep, then the setups, then other ailments, then other words (plan 8c final)", () => {
    const view = new BattleView(true, bank);
    const four = makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], ['e0', 'e1', 'e2', 'e3'].map((key) => makeCombatant({ key, side: 'enemy' })));
    view.setup(four, { width: 640, height: 360 }, 1, 150, 66);
    const words: MechWord[] = [
      { tone: 'aim', text: '最後行動' }, { tone: 'mark', text: '暗記', setup: true }, { tone: 'aim', text: '瞄準3・鎖定', setup: true },
      { tone: 'coins', text: '估價', setup: true }, { tone: 'expose', text: '弱點2', setup: true },
    ];
    const ail: AilmentChip[] = [...FIVE, { id: 'freeze' }];
    view.showAilments(Object.fromEntries(['e0', 'e1', 'e2', 'e3'].map((k) => [k, ail])), Object.fromEntries(['e0', 'e1', 'e2', 'e3'].map((k) => [k, words])));
    const slotW = (640 - 150) / 5;
    const rows = ['e0', 'e1', 'e2', 'e3'].map((key) => {
      const box = view.enemyBoxOf(key)!;
      const t = view.ailmentTexts(key);
      expect(new Set(t.map((x) => x.y)).size, key).toBe(1);
      const left = box.x + t[0].x - ailLabelWidth(t[0].text) / 2;
      const right = box.x + t.at(-1)!.x + ailLabelWidth(t.at(-1)!.text) / 2;
      expect(right - left, key).toBeLessThanOrEqual(slotW - 6);
      return { key, left, right, texts: t.map((x) => x.text) };
    });
    for (let i = 1; i < rows.length; i++) expect(rows[i].left).toBeGreaterThan(rows[i - 1].right);
    const texts = rows[0].texts;
    expect(texts[0]).toBe('凍結');
    expect(texts[1]).toBe('暗記');   // the first setup
    expect(texts).not.toContain('最後行動');
    expect(texts.at(-1)).toMatch(/^\+\d+$/);
    expect(texts.length - 1 + Number(texts.at(-1)!.slice(1))).toBe(ail.length + words.length);
    // A light row (one foe, a wide slot) shows all of it, in that order.
    const one = new BattleView(true, bank);
    one.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
    one.showAilments({ e0: [{ id: 'poison' }] }, { e0: [{ tone: 'aim', text: '最後行動' }, { tone: 'mark', text: '暗記', setup: true }] });
    expect(one.ailmentTexts('e0').map((x) => x.text)).toEqual(['暗記', '中毒', '最後行動']);
  });
});

describe('BattleView element flash', () => {
  it('washes the picture in the element colour on a fire, ice or thunder hit, not on a plain one', () => {
    const fire = new BattleView(false, bank);
    fire.setup(battle([]), { width: 640, height: 360 }, 1);
    void fire.play(battle([{ type: 'damage', target: 'e0', amount: 5, element: 'fire', mult: 1 }]), sfx);   // no act line, so no read pause first
    expect((fire.root.children[0] as Container).children.some((c) => c.label === 'flash')).toBe(true);
    const plain = new BattleView(false, bank);
    plain.setup(battle([]), { width: 640, height: 360 }, 1);
    void plain.play(battle([{ type: 'damage', target: 'e0', amount: 5, element: 'phys', mult: 1 }]), sfx);
    expect((plain.root.children[0] as Container).children.some((c) => c.label === 'flash')).toBe(false);
  });
});

describe('BattleView animated effects', () => {
  it('plays the 4-frame effect sheet when it is published, frame by frame', () => {
    const view = new BattleView(false, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    void view.play(battle([{ type: 'damage', target: 'e0', amount: 5, element: 'fire', mult: 1 }]), sfx);
    const box = enemyBox(view);
    const anim = box.children.find((c) => c.label === 'fx-anim') as Sprite;
    expect(anim).toBeDefined();
    expect(anim.texture.frame.width).toBeCloseTo(Texture.WHITE.width / 4, 5);
  });
});

describe('BattleView reduced motion', () => {
  it('skips the full-screen flash and the camera moves when the player asked for less motion', () => {
    const view = new BattleView(false, bank, true);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    void view.play(battle([{ type: 'damage', target: 'e0', amount: 5, element: 'thunder', mult: 1.5 }]), sfx);
    expect((view.root.children[0] as Container).children.some((c) => c.label === 'flash')).toBe(false);
    expect(view.root.scale.x).toBe(1);
  });
});

describe('BattleView camera', () => {
  it('keeps the push-in centred while the screen shakes', async () => {
    const view = new BattleView(false, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    void view.play(battle([{ type: 'damage', target: 'e0', amount: 5, element: 'phys', mult: 1.5 }]), sfx);
    await new Promise((r) => setTimeout(r, 10));
    const k = view.root.scale.x;
    expect(k).toBeGreaterThan(1);
    // the shake moves an inner layer, so the root's offset still matches its scale
    expect(view.root.x).toBeCloseTo(-((k - 1) * 640) / 2, 5);
  });
});

describe('BattleView enemy status', () => {
  it('shows the HP of each enemy and lowers it hit by hit during playback', async () => {
    const view = new BattleView(true, bank);
    const b = battle([]);
    b.enemies[0].hp = 80; b.enemies[0].max.hp = 100;
    view.setup(b, { width: 640, height: 360 }, 1);
    expect(view.enemyHp('e0')).toEqual({ hp: 80, max: 100 });
    await view.play(battle([{ type: 'damage', target: 'e0', amount: 30, element: 'phys', mult: 1 }]), sfx);
    expect(view.enemyHp('e0')!.hp).toBe(50);
  });

  it('shows what each enemy will do next, and hides it while a round plays', () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    view.showIntents({ e0: '攻擊 → 絲嘉蕾' });
    expect(view.intentText('e0')).toBe('◆ 攻擊 → 絲嘉蕾');
    view.showIntents({});
    expect(view.intentText('e0')).toBe('');
  });

  it('showAilments draws one coloured label per ailment above the head, most severe first, and replaces them', () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    view.showAilments({ e0: [{ id: 'shock', turns: 2 }, { id: 'bleed', stacks: 3, turns: 2 }] });
    const labels = view.ailmentTexts('e0');
    expect(labels.map((t) => t.text)).toEqual(['流血×3', '感電2']);
    expect(labels.map((t) => t.style.fill)).toEqual([AILMENT_FILL.bleed, AILMENT_FILL.shock]);
    expect(labels.every((t) => t instanceof Text && t.style.fontSize === 12)).toBe(true);   // the pixel font's 12px (legibility Task 4)
    const box = enemyBox(view);
    for (const t of labels) {
      expect(t.parent?.parent).toBe(box);
      // Above the head (the body's top), never over the sprite, the name or the bar.
      expect(t.parent!.y + t.y + 14).toBeLessThanOrEqual(-(box.children[0] as Container).height);
    }
    // Side by side, centred on the enemy.
    expect(labels[0].x).toBeLessThan(labels[1].x);
    const left = labels[0].x - ailLabelWidth('流血×3') / 2, right = labels[1].x + ailLabelWidth('感電2') / 2;
    expect(right - left).toBeCloseTo(ailLabelWidth('感電2') + ailLabelWidth('流血×3') + 4, 6);
    expect(left + right).toBeCloseTo(0, 6);
    expect(ailLabelWidth('感電2')).toBeCloseTo(13 * 2 + 8, 6);   // Cubic 11's advances at 12px (legibility Task 4)
    view.showAilments({ e0: [{ id: 'poison' }] });
    expect(view.ailmentTexts('e0').map((t) => t.text)).toEqual(['中毒']);
    expect(labels.every((t) => t.destroyed)).toBe(true);
    view.showAilments({ e0: [] });
    expect(view.ailmentTexts('e0')).toEqual([]);
    view.showAilments({});
    expect(view.ailmentTexts('e0')).toEqual([]);
  });
});

describe('BattleView regional tints', () => {
  const enemies = () => [
    makeCombatant({ key: 'e0', side: 'enemy', name: '熾焰・史萊姆', tint: 'fire' }),
    makeCombatant({ key: 'e1', side: 'enemy', name: '沼澤・蝙蝠', tint: 'phys' }),
    makeCombatant({ key: 'e2', side: 'enemy', name: '★精英', tint: 'elite' }),
    makeCombatant({ key: 'e3', side: 'enemy', name: '史萊姆' }),
    makeCombatant({ key: 'e4', side: 'enemy', name: '沒有星', tint: 'elite' }),
  ];
  const fight = () => makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], enemies());

  it('regional enemies are tinted and elites starred', () => {
    const view = new BattleView(true, bank);
    view.setup(fight(), { width: 640, height: 360 }, 1, 0, 0, 'mire');
    expect(view.tintOf('e0')).toEqual({ color: TINT_COLORS.fire, elite: false });
    expect(view.tintOf('e1')).toEqual({ color: TINT_COLORS.mire, elite: false });
    expect(view.tintOf('e2')).toEqual({ color: TINT_COLORS.mire, elite: true });   // an elite of the region keeps its colour
    expect(view.tintOf('e3')).toEqual({ color: null, elite: false });
    expect(view.filtersOf('e0')).toHaveLength(2);   // colour matrix + soft outer glow
    expect(view.filtersOf('e0')[0]).toBeInstanceOf(ColorMatrixFilter);
    expect(view.filtersOf('e2')).toHaveLength(3);   // + gold outline
    expect(view.filtersOf('e3')).toHaveLength(0);
    expect(view.nameOf('e2')).toBe('★精英');        // never a second star
    expect(view.nameOf('e4')).toBe('★沒有星');
    expect(view.nameOf('e3')).toBe('史萊姆');
    // the element-less regions differ by region, not by tint alone
    view.setup(fight(), { width: 640, height: 360 }, 1, 0, 0, 'shade');
    expect(view.tintOf('e1').color).toBe(TINT_COLORS.shade);
    view.setup(fight(), { width: 640, height: 360 }, 1, 0, 0, 'iron');
    expect(view.tintOf('e1').color).toBe(TINT_COLORS.iron);
    view.setup(fight(), { width: 640, height: 360 }, 1, 0, 0, 'mainline');
    expect(view.tintOf('e2')).toEqual({ color: null, elite: true });
    expect(view.filtersOf('e2')).toHaveLength(1);
    expect(new Set([TINT_COLORS.fire, TINT_COLORS.ice, TINT_COLORS.thunder, TINT_COLORS.mire, TINT_COLORS.shade, TINT_COLORS.iron]).size).toBe(6);
  });

  it('keeps every regional colour readable: a strong mix for every region, a stronger cyan glow and a cool rim on steel', () => {
    for (const k of Object.keys(TINT_COLORS) as (keyof typeof TINT_COLORS)[]) expect(TINT_STYLE[k].mix, k).toBeGreaterThanOrEqual(0.45);
    expect(TINT_STYLE.ice.glow).toBeGreaterThan(TINT_STYLE.fire.glow);
    expect(TINT_STYLE.iron.rim).toBeDefined();
    const view = new BattleView(true, bank);
    view.setup(fight(), { width: 640, height: 360 }, 1, 0, 0, 'iron');
    expect(view.filtersOf('e1').some((f) => f instanceof OutlineFilter)).toBe(true);   // the steel rim
    expect(view.filtersOf('e1')).toHaveLength(3);
    view.setup(fight(), { width: 640, height: 360 }, 1, 0, 0, 'mire');
    expect(view.filtersOf('e1')).toHaveLength(2);
  });

  it('the target highlight adds to the tint and gives it back when it moves on', () => {
    const view = new BattleView(true, bank);
    view.setup(fight(), { width: 640, height: 360 }, 1, 0, 0, 'blaze');
    const tint = [...view.filtersOf('e0')];
    view.highlight('e0');
    expect(view.filtersOf('e0')).toHaveLength(3);
    expect(view.filtersOf('e0').slice(0, 2)).toEqual(tint);
    view.highlight('e3');
    expect(view.filtersOf('e0')).toEqual(tint);
    expect(view.filtersOf('e3')).toHaveLength(1);
    view.highlight(null);
    expect(view.filtersOf('e3')).toHaveLength(0);
  });
});

describe('BattleView text (legibility Task 4)', () => {
  const four = (log: BattleState['log'] = []) => makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], ['e0', 'e1', 'e2', 'e3'].map((key) => makeCombatant({ key, side: 'enemy' })), { log });
  const allTexts = (c: Container): Text[] => c.children.flatMap((x) => (x instanceof Text ? [x] : x instanceof Container ? allTexts(x) : []));
  const WORDS: MechWord[] = [{ tone: 'mark', text: '暗記', setup: true }, { tone: 'aim', text: '最後行動' }];

  it('every text it draws is a pixelText (legibility Task 4)', () => {
    const crit = new BattleView(false, bank);
    crit.setup(four(), { width: 640, height: 360 }, 1, 150, 66);
    crit.showIntents({ e0: '攻擊 → 絲嘉蕾' });
    crit.showAilments(Object.fromEntries(['e0', 'e1', 'e2', 'e3'].map((k) => [k, FIVE])), Object.fromEntries(['e0', 'e1', 'e2', 'e3'].map((k) => [k, WORDS])));
    void crit.play(four([{ type: 'damage', target: 'e0', amount: 30, element: 'phys', mult: 1, crit: true }]), sfx);
    const miss = new BattleView(false, bank);
    miss.setup(four(), { width: 640, height: 360 }, 1, 150, 66);
    void miss.play(four([{ type: 'miss', target: 'e1' }]), sfx);
    const texts = [...allTexts(crit.root), ...allTexts(miss.root)];
    const size = (s: string) => texts.find((t) => t.text === s)!.style.fontSize;
    expect(texts.length).toBeGreaterThan(20);
    for (const t of texts) {
      expect((t.style.fontFamily as string[])[0], t.text).toBe('Cubic 11');
      expect([12, 24], t.text).toContain(t.style.fontSize);
      expect(t.style.fontWeight, t.text).toBe('normal');
    }
    expect(size('30')).toBe(24);                         // a hit's number: 24, a crit too (it stays the biggest by its scale)
    expect(size(T.battle.pop.crit)).toBe(12);             // its tag
    expect(size(T.battle.pop.miss)).toBe(12);             // a small word
    expect(size('e0')).toBe(12);                          // a name
    expect(size('◆ 攻擊')).toBe(12);                      // an intent (four foes: its target does not fit the slot)
  });

  it('ailment rows of four enemies at 12px stay inside their slots', () => {
    const view = new BattleView(true, bank);
    view.setup(four(), { width: 640, height: 360 }, 1, 150, 66);
    view.showAilments(Object.fromEntries(['e0', 'e1', 'e2', 'e3'].map((k) => [k, FIVE])), Object.fromEntries(['e0', 'e1', 'e2', 'e3'].map((k) => [k, WORDS])));
    for (const key of ['e0', 'e1', 'e2', 'e3']) {
      const words = view.ailmentTexts(key);
      for (const t of words) expect(t.style.fontSize, t.text).toBe(12);
      const width = words.reduce((a, t) => a + ailLabelWidth(t.text), 0) + 4 * (words.length - 1);
      expect(width, key).toBeLessThanOrEqual(view.ailmentRowRect(key)!.width);
      expect(words.at(-1)!.text, key).toMatch(/^\+\d$/);   // what does not fit folds into +N
    }
  });
});

describe('BattleView stat cues', () => {
  const texts = (view: BattleView) => enemyBox(view).children.filter((c) => c instanceof Text).map((c) => (c as Text).text);

  it('pops MISS over an enemy that evaded, and tags crits and resisted hits', () => {
    const view = new BattleView(false, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    void view.play(battle([{ type: 'miss', target: 'e0' }]), sfx);
    expect(texts(view)).toContain('MISS');
    const crit = new BattleView(false, bank);
    crit.setup(battle([]), { width: 640, height: 360 }, 1);
    void crit.play(battle([{ type: 'damage', target: 'e0', amount: 30, element: 'phys', mult: 1, crit: true }]), sfx);
    expect(texts(crit)).toEqual(expect.arrayContaining(['30', '暴擊！']));
    const resist = new BattleView(false, bank);
    resist.setup(battle([]), { width: 640, height: 360 }, 1);
    void resist.play(battle([{ type: 'damage', target: 'e0', amount: 4, element: 'fire', mult: 0.5 }]), sfx);
    expect(texts(resist)).toEqual(expect.arrayContaining(['4', '抗性']));
  });

  it('hands a party miss, crit, resist and TP regen to the party bar', async () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    const on = vi.fn();
    await view.play(battle([
      { type: 'miss', target: 'scarlet' },
      { type: 'damage', target: 'scarlet', amount: 9, element: 'ice', mult: 0.5, crit: true },
      { type: 'tp', target: 'scarlet', amount: 3, regen: true },
      { type: 'tp', target: 'e0', amount: 3, regen: true },
    ]), sfx, on);
    expect(on).toHaveBeenCalledWith('scarlet', 'miss');
    expect(on).toHaveBeenCalledWith('scarlet', 'hit', undefined, 9, { fx: expect.anything(), weak: false, crit: true, resist: true });
    expect(on).toHaveBeenCalledWith('scarlet', 'tp', undefined, 3);
    expect(on.mock.calls.filter((c) => c[0] === 'e0')).toEqual([]);   // enemies show no TP
  });

  it('pops a hit number by whole steps, a crit bigger (T4 review)', () => {
    // On fake timers, each view set up again before they go back: no tween or held moment outlives the test.
    vi.useFakeTimers();
    const views: BattleView[] = [];
    try {
      const scales = (crit: boolean) => {
        const view = new BattleView(false, bank);
        views.push(view);
        view.setup(battle([]), { width: 640, height: 360 }, 1);
        void view.play(battle([{ type: 'damage', target: 'e0', amount: 30, element: 'phys', mult: 1, crit }]), sfx);
        return (enemyBox(view).children.find((c) => c instanceof Text && c.text === '30') as Text).scale.x;
      };
      expect(Number.isInteger(scales(true))).toBe(true);
      expect(Number.isInteger(scales(false))).toBe(true);
      expect(scales(true)).toBeGreaterThan(scales(false));
    } finally {
      for (const v of views) v.setup(battle([]), { width: 640, height: 360 }, 1);
      vi.useRealTimers();
    }
  });

  it('keeps pops still for reduced motion', () => {
    const view = new BattleView(false, bank, true);
    view.setup(battle([]), { width: 640, height: 360 }, 1);
    void view.play(battle([{ type: 'miss', target: 'e0' }]), sfx);
    const pop = enemyBox(view).children.find((c) => c instanceof Text && c.text === 'MISS') as Text;
    expect(pop.scale.x).toBe(1);
  });
});

describe('BattleView mechanics (plan 8c)', () => {
  it("marks come first in an enemy's row", () => {
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
    view.showAilments({ e0: [{ id: 'burn', turns: 3 }] }, { e0: [{ tone: 'mark', text: '暗記', setup: true }, { tone: 'expose', text: '弱點2', setup: true }] });
    const words = view.ailmentTexts('e0');
    expect(words.map((t) => t.text)).toEqual(['暗記', '弱點2', '灼燒3']);
    expect(words.map((t) => t.style.fill)).toEqual([MECH_FILL.mark, MECH_FILL.expose, AILMENT_FILL.burn]);
    expect(new Set(words.map((t) => t.y)).size).toBe(1);
    expect(words.map((t) => t.style.fontSize)).toEqual([words[2].style.fontSize, words[2].style.fontSize, words[2].style.fontSize]);
    // Without marks, the row is the ailments alone, as before.
    view.showAilments({ e0: [{ id: 'burn', turns: 3 }] });
    expect(view.ailmentTexts('e0').map((t) => t.text)).toEqual(['灼燒3']);
    view.showAilments({}, { e0: [{ tone: 'mark', text: '暗記', setup: true }] });
    expect(view.ailmentTexts('e0').map((t) => t.text)).toEqual(['暗記']);
  });
});

describe('BattleView mechanic moments (plan 8c)', () => {
  it('fast mode still holds a mechanic moment for its wait', async () => {
    vi.useFakeTimers();
    try {
      const view = new BattleView(true, bank);
      view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
      const onParty = vi.fn();
      let done = false;
      const p = view.play(battle([{ type: 'mech', actor: 'scarlet', cue: 'again' }]), sfx, onParty).then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(0);
      expect(onParty).toHaveBeenCalledWith('scarlet', 'mech', 'again');
      await vi.advanceTimersByTimeAsync(250);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      await p;
      expect(done).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("a held moment's timer is the view's own: a new fight clears it", async () => {
    vi.useFakeTimers();
    try {
      const view = new BattleView(true, bank);
      view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
      void view.play(battle([{ type: 'mech', actor: 'scarlet', cue: 'again' }]), sfx, vi.fn());
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});

describe('BattleView without enemy art (no placeholder)', () => {
  it('draws no body at all for a foe whose picture has not loaded: just its name and bar', () => {
    const none = { get: () => null, has: () => false } as unknown as TextureBank;
    const view = new BattleView(true, none);
    view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
    const box = view.enemyBoxOf('e0')!;
    const body = box.children[0] as Container;
    expect(body.children).toHaveLength(0);
    expect(box.children.some((c) => c instanceof Text && c.text === 'e0')).toBe(true);
    expect(view.hpBarRect('e0')).not.toBeNull();
  });

  it('a picture that lands later fills the empty body and lifts the words above it', async () => {
    const { TextureBank: Bank } = await import('./textures');
    let resolve!: (t: Texture) => void;
    const bank = new Bank(() => new Promise<Texture>((r) => { resolve = r; }), 10_000);
    void bank.preload([enemyArt('slime')]);
    const view = new BattleView(true, bank);
    view.setup(battle([]), { width: 640, height: 360 }, 1, 150, 66);
    const body = view.enemyBoxOf('e0')!.children[0] as Container;
    expect(body.children).toHaveLength(0);
    const before = view.intentRect('e0')!.y;
    resolve(new Texture({ source: new TextureSource({ width: 120, height: 120 }) }));
    await new Promise((r) => setTimeout(r, 0));
    expect(body.children).toHaveLength(1);
    expect(body.children[0]).toBeInstanceOf(Sprite);
    expect(view.intentRect('e0')!.y).toBeLessThan(before);
    expect(view.intentRect('e0')!.y + view.intentRect('e0')!.height).toBeLessThanOrEqual(-body.height + 1);
  });
});

describe('BattleView affixes (difficulty plan Task 7b)', () => {
  type R = { x: number; y: number; width: number; height: number };
  const meets = (a: R, b: R) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const foes = (n: number, name = (i: number) => `e${i}`) => makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], Array.from({ length: n }, (_, i) => makeCombatant({ key: `e${i}`, side: 'enemy', name: name(i) })));
  const THREE: AilmentChip[] = [{ id: 'bleed', stacks: 2, turns: 3 }, { id: 'burn', turns: 3 }, { id: 'shock', turns: 2 }];
  const texts = (view: BattleView, key: string) => view.ailmentTexts(key).map((t) => t.text);

  it('affixes lead the row and fold last', () => {
    // Three foes: the row has room for two affixes and a 「+N」, not for an ailment beside them.
    const view = new BattleView(true, bank);
    view.setup(foes(3), { width: 640, height: 360 }, 1, 150, 70);
    view.showAilments({ e0: THREE }, {}, { e0: ['灼熱', '霜縛'] });
    expect(texts(view, 'e0')).toEqual(['灼熱', '霜縛', '+3']);   // the +N counts the ailments, never an affix first
    const words = view.ailmentTexts('e0');
    expect(words.slice(0, 2).map((t) => t.style.fill)).toEqual([AFFIX_FILL, AFFIX_FILL]);
    expect(words.every((t) => t.style.fontSize === 12 && (t.style.fontFamily as string[])[0] === 'Cubic 11')).toBe(true);
    // Room for all of it: affixes first, then the ailments by severity.
    const wide = new BattleView(true, bank);
    wide.setup(foes(1), { width: 640, height: 360 }, 1, 150, 70);
    wide.showAilments({ e0: THREE }, {}, { e0: ['灼熱', '霜縛'] });
    expect(texts(wide, 'e0')).toEqual(['灼熱', '霜縛', '流血×2', '灼燒3', '感電2']);
    // Freeze and sleep still never fold: with room for three words, the affixes stand first and freeze after them;
    // with room for two (four foes), the second affix folds before freeze does.
    view.showAilments({ e0: [{ id: 'freeze' }, ...THREE] }, {}, { e0: ['灼熱', '霜縛'] });
    expect(texts(view, 'e0')).toEqual(['灼熱', '霜縛', '凍結', '+3']);
    const four = new BattleView(true, bank);
    four.setup(foes(4), { width: 640, height: 360 }, 1, 150, 70);
    four.showAilments({ e0: [{ id: 'freeze' }, ...THREE] }, {}, { e0: ['灼熱', '霜縛'] });
    expect(texts(four, 'e0')).toEqual(['灼熱', '凍結', '+4']);
    // A foe with no affixes beside one with them reads as before.
    view.showAilments({ e0: THREE, e1: THREE }, {}, { e0: ['迅捷'] });
    expect(texts(view, 'e0')[0]).toBe('迅捷');
    expect(texts(view, 'e1')[0]).toBe('流血×2');
  });

  it('no affix, no change', () => {
    const marks: MechWord[] = [{ tone: 'mark', text: '暗記', setup: true }, { tone: 'aim', text: '最後行動' }];
    for (const n of [1, 3, 5]) {
      const a = new BattleView(true, bank), b = new BattleView(true, bank);
      a.setup(foes(n), { width: 640, height: 360 }, 1, 150, 70);
      b.setup(foes(n), { width: 640, height: 360 }, 1, 150, 70);
      const byKey = Object.fromEntries(Array.from({ length: n }, (_, i) => [`e${i}`, FIVE]));
      const words = Object.fromEntries(Array.from({ length: n }, (_, i) => [`e${i}`, marks]));
      a.showAilments(byKey, words);
      b.showAilments(byKey, words, {});
      for (let i = 0; i < n; i++) {
        const k = `e${i}`;
        const shape = (v: BattleView) => v.ailmentTexts(k).map((t) => [t.text, t.x, t.style.fill]);
        expect(shape(b), k).toEqual(shape(a));
      }
    }
  });

  it('affixes lead the row above five foes without touching a bar', () => {
    // 844x390 holds the 640x360 stage; five foes, each the longest name, two affixes and three ailments, over a tall
    // picture, a small one (the bat) and none yet: every row stays in its slot, clear of every HP bar, every name and
    // every other row.
    const LONG = '★深層・熾焰之地・燈喰之獸';
    const banks: [string, TextureBank][] = [
      ['tall', bank],
      ['bat', { get: () => new Texture({ source: new TextureSource({ width: 119, height: 65 }) }), has: () => true } as unknown as TextureBank],
      ['no art', { get: () => null, has: () => false } as unknown as TextureBank],
    ];
    const keys = ['e0', 'e1', 'e2', 'e3', 'e4'];
    for (const [label, b] of banks) {
      const view = new BattleView(true, b);
      view.setup(foes(5, () => LONG), { width: 640, height: 360 }, 1, 150, 70);
      view.showAilments(Object.fromEntries(keys.map((k) => [k, THREE])), {}, Object.fromEntries(keys.map((k) => [k, ['灼熱', '霜縛']])));
      const slotW = (640 - 150) / 6;
      const rows = keys.map((k) => {
        const box = view.enemyBoxOf(k)!;
        const local = view.ailmentRowRect(k)!;
        const words = view.ailmentTexts(k);
        expect(words[0].text, `${label} ${k}`).toBe('灼熱');   // an affix leads
        expect(new Set(words.map((t) => t.y)).size, `${label} ${k} one line`).toBe(1);
        const left = box.x + words[0].x - ailLabelWidth(words[0].text) / 2;
        const right = box.x + words.at(-1)!.x + ailLabelWidth(words.at(-1)!.text) / 2;
        expect(right - left, `${label} ${k} inside its slot`).toBeLessThanOrEqual(slotW - 6);
        expect(left, `${label} ${k}`).toBeGreaterThanOrEqual(box.x - local.width / 2 - 0.001);
        expect(right, `${label} ${k}`).toBeLessThanOrEqual(box.x + local.width / 2 + 0.001);
        return { k, rect: { x: box.x + local.x, y: box.y + local.y, width: local.width, height: local.height } };
      });
      for (const { k, rect } of rows) {
        for (const o of keys) {
          expect(meets(rect, view.hpBarRect(o)!), `${label} ${k} row vs ${o} bar`).toBe(false);
          expect(meets(rect, view.nameRect(o)!), `${label} ${k} row vs ${o} name`).toBe(false);
        }
        for (const other of rows) if (other.k !== k) expect(meets(rect, other.rect), `${label} ${k} row vs ${other.k} row`).toBe(false);
        expect(rect.y, `${label} ${k} under the message window`).toBeGreaterThanOrEqual(52);
      }
    }
  });
});

describe('BattleView names and intents fit their slots (legibility, difficulty plan follow-up)', () => {
  type R = { x: number; y: number; width: number; height: number };
  const meets = (a: R, b: R) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  // The longest names a deep fight can give: ★, 深層, a region's prefix, the longest enemy name and a letter.
  const longestBase = Object.values(ENEMIES).map((e) => e.name).reduce((a, b) => (ailLabelWidth(b) > ailLabelWidth(a) ? b : a));
  const LONG_NAME = (i: number) => `★深層・熾焰・${longestBase} ${String.fromCharCode(65 + i)}`;
  // The longest intent: the longest enemy or region skill name, an area, and the longest member's name.
  const skills = [...Object.values(ENEMIES).flatMap((e) => e.skills.map((k) => k.name)), ...Object.values(REGIONS).flatMap((r) => (r.skill ? [r.skill.name] : []))];
  const longestSkill = skills.reduce((a, b) => (ailLabelWidth(b) > ailLabelWidth(a) ? b : a));
  const longestMember = Object.values(CHARACTERS).map((c) => c.name).reduce((a, b) => (ailLabelWidth(b) > ailLabelWidth(a) ? b : a));
  const LONG_INTENT = `${longestSkill}（十字） → ${longestMember}`;
  const fight = (n: number) => makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], Array.from({ length: n }, (_, i) => makeCombatant({ key: `e${i}`, side: 'enemy', name: LONG_NAME(i) })));
  const textRect = (view: BattleView, key: string, text: string, y: number, h: number): R => {
    const box = view.enemyBoxOf(key)!;
    const w = ailLabelWidth(text);
    return { x: box.x - w / 2, y: box.y + y, width: w, height: h };
  };
  const banks: [string, TextureBank][] = [
    ['tall', bank],
    ['bat', { get: () => new Texture({ source: new TextureSource({ width: 119, height: 65 }) }), has: () => true } as unknown as TextureBank],
  ];

  it('names never meet each other, nor intents each other, for one to five deep foes at 844x390 and 1280x720', () => {
    // Both sizes show the same 640x360 stage (ui2/stage.ts), so one layout per foe count stands for both.
    for (const [label, b] of banks) for (let n = 1; n <= 5; n++) {
      const view = new BattleView(true, b);
      view.setup(fight(n), { width: 640, height: 360 }, 1, 150, 70);
      const keys = Array.from({ length: n }, (_, i) => `e${i}`);
      view.showIntents(Object.fromEntries(keys.map((k) => [k, LONG_INTENT])));
      const slotW = (640 - 150) / (n + 1);
      const names = keys.map((k) => view.nameRect(k)!);
      const intents = keys.map((k) => textRect(view, k, view.intentText(k), view.intentRect(k)!.y, view.intentRect(k)!.height));
      keys.forEach((k, i) => {
        expect(names[i].width, `${label} ${n} foes: ${k}'s name inside its slot`).toBeLessThanOrEqual(slotW - 4);
        expect(intents[i].width, `${label} ${n} foes: ${k}'s intent inside its slot`).toBeLessThanOrEqual(slotW - 4);
        expect(view.intentText(k), `${label} ${n}`).not.toBe('');
        keys.forEach((o, j) => {
          if (j <= i) return;
          expect(meets(names[i], names[j]), `${label} ${n} foes: ${k} / ${o} names`).toBe(false);
          expect(meets(intents[i], intents[j]), `${label} ${n} foes: ${k} / ${o} intents`).toBe(false);
        });
      });
    }
  });

  it('a name too long drops 深層 and the region first, then cuts with 「…」, keeping its star and letter', () => {
    const one = new BattleView(true, bank);
    one.setup(fight(1), { width: 640, height: 360 }, 1, 150, 70);
    expect(one.nameOf('e0')).toBe(LONG_NAME(0));                       // room enough: the whole name
    const five = new BattleView(true, bank);
    five.setup(fight(5), { width: 640, height: 360 }, 1, 150, 70);
    const shown = five.nameOf('e2');
    expect(shown).not.toContain('深層');
    expect(shown).not.toContain('熾焰');
    expect(shown.startsWith('★')).toBe(true);
    expect(shown.endsWith('C')).toBe(true);                            // the letter that tells it from its twins
    // A short regional name keeps everything.
    const short = new BattleView(true, bank);
    short.setup(makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], Array.from({ length: 5 }, (_, i) => makeCombatant({ key: `e${i}`, side: 'enemy', name: `熾焰・蝙蝠` }))), { width: 640, height: 360 }, 1, 150, 70);
    expect(short.nameOf('e0')).toBe('熾焰・蝙蝠');
    // Cut when even the bare name does not fit: 「…」 before the letter.
    const cut = new BattleView(true, bank);
    cut.setup(makeBattle([makeCombatant({ key: 'scarlet', side: 'party' })], Array.from({ length: 5 }, (_, i) => makeCombatant({ key: `e${i}`, side: 'enemy', name: `★深層・暗影・很長很長很長的名字 ${String.fromCharCode(65 + i)}` }))), { width: 640, height: 360 }, 1, 150, 70);
    expect(cut.nameOf('e1')).toMatch(/^★很長.*…B$/);
  });

  it('an intent too long drops its area, then its target, then its mark, then cuts', () => {
    const one = new BattleView(true, bank);
    one.setup(fight(1), { width: 640, height: 360 }, 1, 150, 70);
    one.showIntents({ e0: '暮色搖籃曲（十字） → 千鶴' });
    expect(one.intentText('e0')).toBe('◆ 暮色搖籃曲（十字） → 千鶴');   // room enough: as before
    const five = new BattleView(true, bank);
    five.setup(fight(5), { width: 640, height: 360 }, 1, 150, 70);
    five.showIntents({ e0: '暮色搖籃曲（十字） → 千鶴', e1: '攻擊 → 絲嘉蕾', e2: '暮色搖籃曲（十字）' });
    expect(five.intentText('e0')).toBe('暮色搖籃曲');                    // its name whole, before any cut
    expect(five.intentText('e1')).toBe('◆ 攻擊');
    expect(five.intentText('e2')).toBe('暮色搖籃曲');
    five.showIntents({});
    expect(five.intentText('e0')).toBe('');
  });
});
