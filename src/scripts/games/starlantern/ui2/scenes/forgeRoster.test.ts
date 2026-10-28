import { describe, expect, it, vi } from 'vitest';
import { T } from '../../data/text.zh-TW';
import { ENEMIES } from '../../data/enemies';
import { ROSTER_LIVE } from '../../data/monsters';
import { Game } from '../../engine/game';
import { WAVE_1_LIVE, WAVE_2_LIVE, constRng, memoryStorage, withRosterLive, withRosterOnly } from '../../engine/testing';
import { ownCost } from '../../engine/forge/craft';
import { inscribeCost } from '../../engine/forge/cost';
import type { ItemInstance } from '../../engine/types';
import { NO_ART } from '../../render/textures';
import { ForgeScene } from './forge';

/**
 * Roster plan Task C4: the forge's 銘刻 rows and 專屬裝備 rows (kept apart from forge.test.ts, which git stores as binary).
 * Every test runs with the foes it needs live, and checks the forge is the forge it was with none.
 */
const NECK = 'moss-charm';
const neck = (extra: Partial<ItemInstance> = {}): ItemInstance =>
  ({ uid: 1, base: NECK, rarity: 'rare', ilvl: 10, affixes: [{ key: 'hp', value: 30 }, { key: 'res', value: 4 }], enhance: 0, ...extra });

function setup(game: Game) {
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), loot: vi.fn() };
  const s = new ForgeScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  const line = () => root.querySelector('.slx-talk .slx-text')!.textContent;
  const top = () => [...root.querySelectorAll('.slx-forge-list')].at(-1) as HTMLElement;
  const rows = () => [...top().querySelectorAll('[role=option]')] as HTMLElement[];
  const ids = () => rows().map((r) => r.getAttribute('data-id'));
  const row = (id: string) => rows().find((r) => r.getAttribute('data-id') === id)!;
  const info = () => root.querySelector('.slx-info') as HTMLElement;
  const confirmEl = () => root.querySelector('.slx-confirm') as HTMLElement | null;
  const go = (...a: Array<'up' | 'down' | 'confirm' | 'cancel'>) => a.forEach((x) => s.onAction(x));
  return { root, s, sfx, line, rows, ids, row, info, confirmEl, go };
}
const F = T.ui2.forge;

describe('the forge for the roster (roster plan Task C4)', () => {
  /** The reroll page, on the neck piece's second affix: the methods list. */
  const methods = (prep: (g: Game) => void) => {
    const game = new Game(constRng(0.5), memoryStorage());
    game.state.bag = [neck()];
    game.state.gold = 1000;
    game.state.inventory = { 'essence-rare': 5 };
    prep(game);
    const t = setup(game);
    t.go('confirm', 'down', 'down', 'confirm');   // greeting, 重鑄
    t.go('confirm', 'down', 'confirm');           // the piece, its second affix
    return { ...t, game };
  };

  it('the inscribe row', () => {
    // With nothing live there is no 銘刻 row, whatever the stores hold. L1b: measures the game as it was with nothing live.
    withRosterOnly([], () => {
      const none = methods((g) => { g.state.inventory['faded-letter'] = 3; });
      expect(none.ids().some((id) => id?.startsWith('ins:'))).toBe(false);
    });
    withRosterLive(['paper-moth', 'root-hound', 'lamp-wight'], () => {
      // Only a live species whose signature the stores hold (none of lamp-wight's); root-hound's key (atk) cannot go on a
      // neck piece, so its row is greyed out and says why.
      const t = methods((g) => { g.state.inventory['faded-letter'] = 3; g.state.inventory['mist-root'] = 1; });
      expect(t.ids().filter((id) => id?.startsWith('ins:'))).toEqual(['ins:paper-moth', 'ins:root-hound']);
      expect(t.row('ins:root-hound').getAttribute('aria-disabled')).toBe('true');
      expect(t.row('ins:root-hound').querySelector('.slx-right')!.textContent).toBe(T.reasons.none);
      const moth = t.row('ins:paper-moth');
      expect(moth.textContent).toContain(F.inscribeWith(ENEMIES['paper-moth'].name));
      expect(moth.textContent).toContain(F.costGold(inscribeCost(neck(), 'paper-moth')!.gold));
      // The cursor on it: the detail says what the affix becomes and what it costs.
      // (The cursor skips greyed rows.)
      const steps = t.rows().slice(1, t.ids().indexOf('ins:paper-moth') + 1).filter((r) => r.getAttribute('aria-disabled') !== 'true').length;
      for (let i = 0; i < steps; i++) t.go('down');
      expect(t.info().textContent).toContain(F.inscribeTo(T.gear.statName.sleepRes, ENEMIES['paper-moth'].name));
      expect(t.info().textContent).toContain('褪色信紙 3／3');
      t.go('confirm');
      expect(t.confirmEl()!.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
      t.go('up', 'confirm');                     // 是
      const it = t.game.state.bag[0];
      expect(it).toMatchObject({ inscription: 'paper-moth', locked: 1 });
      expect(it.affixes[1].key).toBe('sleepRes');
      expect(t.game.state.inventory['faded-letter']).toBeUndefined();
      expect(t.line()).toBe(F.inscribed(T.gear.affix('res', 4), T.gear.affix('sleepRes', it.affixes[1].value)));
    });
  });

  it('a special piece offers no inscription', () => {
    withRosterLive(['paper-moth'], () => {
      const t = methods((g) => {
        g.state.bag = [neck({ rarity: 'legendary', special: 'frost-bloom-neck', affixes: [{ key: 'hp', value: 30 }, { key: 'res', value: 4 }] })];
        g.state.inventory['faded-letter'] = 3;
        g.state.inventory['star-tear'] = 1;
        g.state.inventory['essence-legendary'] = 3;
      });
      expect(t.ids().some((id) => id?.startsWith('ins:'))).toBe(false);
    });
  });

  /** The craft page's categories. */
  const craft = (prep: (g: Game) => void = () => {}) => {
    const game = new Game(constRng(0.5), memoryStorage());
    game.state.gold = 100000;
    game.state.inventory = {};
    prep(game);
    const t = setup(game);
    t.go('confirm', 'down', 'down', 'down', 'down', 'confirm');   // greeting, 製作
    return { ...t, game };
  };

  it('the own-unique rows', () => {
    withRosterOnly([], () => expect(craft().ids()).toEqual(['item', 'base', 'set']));   // L1b: measures the game as it was with nothing live.
    // L1b: exactly these two live, the rest as with nothing live.
    withRosterOnly(['fog-warden', 'false-moon'], () => {
      const t = craft((g) => {
        g.state.inventory = { 'fog-gate-plate': 5, 'star-tear': 1 };
        g.state.bestiary = { 'fog-warden': { seen: 1, felled: 1 } };
      });
      expect(t.ids()).toEqual(['item', 'base', 'set', 'own']);
      expect(t.row('own').textContent).toContain(F.craftCats.own);
      t.row('own').click();
      // Each live owner's own unique, in SPECIALS order (the wardens first).
      expect(t.ids()).toEqual(['moonless-mirror', 'fog-halberd']);
      const cost = ownCost(t.game.state, 'fog-halberd')!;
      expect(t.row('fog-halberd').textContent).toContain(F.costGold(cost.gold));
      t.go('down');
      expect(t.info().textContent).toContain(F.ownOf(ENEMIES['fog-warden'].name));
      expect(t.info().textContent).toContain('霧門鎧片 5／5');
      t.go('confirm', 'up', 'confirm');          // ask, 是
      expect(t.game.state.bag).toHaveLength(1);
      expect(t.game.state.bag[0]).toMatchObject({ rarity: 'unique', special: 'fog-halberd' });
      expect(t.game.state.gold).toBe(100000 - cost.gold);
      expect(t.sfx.loot).toHaveBeenCalledWith('unique');
    });
  });

  it("the first live wave's rows: its own uniques and its inscriptions, none of the next wave's (L1b)", () => withRosterOnly([...WAVE_1_LIVE], () => {
    // L2b: measures the game as it was with only the first wave live.
    // Own uniques: the five of the live wave, wardens first (SPECIALS order); none of R2's (the archon's crown, the
    // automaton's gauntlet), though their trophies are in the stores.
    const t = craft((g) => { g.state.inventory = { 'fog-gate-plate': 5, 'archon-gold': 5, 'automaton-core': 5, 'star-tear': 1 }; });
    expect(t.ids()).toEqual(['item', 'base', 'set', 'own']);
    t.row('own').click();
    expect(t.ids()).toEqual(['moonless-mirror', 'unrung-clapper', 'fog-halberd', 'silent-chime', 'borrowed-blade']);
    // Inscriptions: a live species whose signature the stores hold; an R2 species (the old city's sentinel) not, though held.
    const m = methods((g) => { g.state.inventory['faded-letter'] = 3; g.state.inventory['marble-shard'] = 3; });
    expect(m.ids().filter((id) => id?.startsWith('ins:'))).toEqual(['ins:paper-moth']);
  }));

  it("the second live wave's rows: its own uniques and its inscriptions, none of the third wave's (L2b)", () => withRosterOnly([...WAVE_2_LIVE], () => {
    // L3b: measures the game as it was before the third wave.
    // Own uniques: every live owner of the two waves, the lantern-mother's too since L2c, wardens first (SPECIALS order);
    // none of R3's (the mirage lead's veil), though its keepsake is in the stores.
    // Every live owner felled, so no row is greyed out and the cursor walks the whole list.
    const t = craft((g) => {
      g.state.inventory = { 'fog-gate-plate': 5, 'archon-gold': 5, 'copper-anklet': 5, 'star-tear': 1 };
      g.state.bestiary = Object.fromEntries([...ROSTER_LIVE].map((id) => [id, { seen: 1, felled: 1 }]));
    });
    expect(t.ids()).toEqual(['item', 'base', 'set', 'own']);
    t.row('own').click();
    const own = ['moonless-mirror', 'unrung-clapper', 'ancestor-gauntlet', 'requiem-staff', 'brood-lantern', 'fog-halberd',
      'silent-chime', 'borrowed-blade', 'archon-crown', 'glutton-gauntlet', 'cradled-light', 'festival-mask', 'whale-song-ring', 'still-hand-boots',
      'first-lantern-staff'];
    // The list shows a window of eight rows: the first eight, then, with the cursor at the end, the last eight.
    expect(t.ids()).toEqual(own.slice(0, 8));
    for (let i = 1; i < own.length; i++) t.go('down');
    expect(t.ids()).toEqual(own.slice(-8));
    // Inscriptions: the old city's sentinel is live now; an R3 native (the cinder imp) not, though its signature is held.
    const m = methods((g) => { g.state.inventory['faded-letter'] = 3; g.state.inventory['marble-shard'] = 3; g.state.inventory['cinder-dust'] = 3; });
    expect(m.ids().filter((id) => id?.startsWith('ins:'))).toEqual(['ins:paper-moth', 'ins:old-city-sentinel']);
  }));

  it("the third live wave's rows: its own uniques and its inscriptions, none of the fourth wave's (L3b)", () => {
    // Own uniques: every live owner of the three waves, wardens first (SPECIALS order); none of R4's (the grey elder's bow),
    // though its keepsake is in the stores. Every live owner felled, so no row is greyed out and the cursor walks the list.
    const t = craft((g) => {
      g.state.inventory = { 'fog-gate-plate': 5, 'archon-gold': 5, 'copper-anklet': 5, 'ashen-acorn': 5, 'star-tear': 1 };
      g.state.bestiary = Object.fromEntries([...ROSTER_LIVE].map((id) => [id, { seen: 1, felled: 1 }]));
    });
    t.row('own').click();
    const own = ['moonless-mirror', 'unrung-clapper', 'ancestor-gauntlet', 'requiem-staff', 'brood-lantern', 'last-dance-veil', 'ninety-nine-steps',
      'starbound-tome', 'fog-halberd', 'silent-chime', 'borrowed-blade', 'archon-crown', 'glutton-gauntlet', 'cradled-light', 'festival-mask',
      'whale-song-ring', 'still-hand-boots', 'first-lantern-staff', 'burning-crown-ring', 'sand-veil-boots', 'troupe-drum', 'everwinter-veil',
      'snowmute-ring', 'sealing-spear', 'roc-feather-boots', 'conductor-ring', 'starfire-tiara'];
    expect(t.ids()).toEqual(own.slice(0, 8));
    for (let i = 1; i < own.length; i++) t.go('down');
    expect(t.ids()).toEqual(own.slice(-8));
    // Inscriptions: the cinder imp is live now; an R4 native (the bog mother) not, though its signature is held.
    const m = methods((g) => {
      g.state.inventory['faded-letter'] = 3; g.state.inventory['marble-shard'] = 3; g.state.inventory['cinder-dust'] = 3; g.state.inventory['bog-peat'] = 3;
    });
    expect(m.ids().filter((id) => id?.startsWith('ins:'))).toEqual(['ins:paper-moth', 'ins:old-city-sentinel', 'ins:cinder-imp']);
  });

  it('an unbeaten owner is greyed out with its reason', () => {
    // L3b: exactly the fog warden live (the third wave's wardens would push its row out of the eight in view).
    withRosterOnly(['fog-warden'], () => {
      const t = craft((g) => { g.state.inventory = { 'fog-gate-plate': 5, 'star-tear': 1 }; });
      t.row('own').click();
      const why = F.unbeaten(ENEMIES['fog-warden'].name);
      const row = t.row('fog-halberd');
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(row.querySelector('.slx-right')!.textContent).toBe(why);
      t.sfx.error.mockClear();
      t.go('confirm');
      expect(t.confirmEl()).toBeNull();
      expect(t.game.state.bag).toHaveLength(0);
    });
  });
});

describe('inscribing over an inscription at the forge (PR C review L3)', () => {
  it('only the old inscription affix takes a new one', () => {
    withRosterLive(['paper-moth', 'lamp-wight'], () => {
      const game = new Game(constRng(0.5), memoryStorage());
      game.state.bag = [neck({ affixes: [{ key: 'sleepRes', value: 20 }, { key: 'hp', value: 30 }], inscription: 'paper-moth' })];
      game.state.gold = 1000;
      game.state.inventory = { 'essence-rare': 5, 'wight-wick': 3 };
      const t = setup(game);
      t.go('confirm', 'down', 'down', 'confirm');   // greeting, 重鑄
      t.go('confirm', 'down', 'confirm');           // the piece, its second affix (生命)
      const row = t.row('ins:lamp-wight');
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(row.querySelector('.slx-right')!.textContent).toBe(F.inscribeOld);
      t.go('cancel', 'up', 'confirm');              // back, the first affix (the old inscription)
      expect(t.row('ins:lamp-wight').getAttribute('aria-disabled')).toBe('false');
    });
  });
});
