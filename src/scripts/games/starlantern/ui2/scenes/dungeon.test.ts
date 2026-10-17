import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { START_ITEMS } from '../../engine/state';
import type { Portal } from '../../engine/dungeon/run';
import { DELTA, tileAt, type Dir } from '../../engine/map';
import { chestHasGear } from '../../engine/loot/drops';
import type { ItemInstance } from '../../engine/types';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { capacity, carried, formatWeight as kg, weightOf } from '../../data/weights';
import { MATERIALS } from '../../data/materials';
import { showPillar } from '../lootFx';
import { DungeonScene } from './dungeon';

function setup(portal: Portal = { region: 'mainline', condition: 'plain' }, fast = true) {
  const game = new Game(constRng(0.99), null);   // 0.99: never an early encounter roll
  expect(game.depart(portal, 1)).toEqual({ ok: true });
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), bump: vi.fn(), step: vi.fn(), stairs: vi.fn(), chest: vi.fn(), encounter: vi.fn(), loot: vi.fn() };
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new DungeonScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast }, Infinity);
  s.enter(root);
  const text = () => root.querySelector('.slx-talk .slx-text')?.textContent ?? '';
  const pick = (label: string) => {
    const o = [...root.querySelectorAll('.slx-layer:last-child [role=option]')].find((x) => x.querySelector('.slx-label')!.textContent!.startsWith(label));
    if (!o) throw new Error(`no ${label}`);
    (o as HTMLElement).click();
  };
  return { game, sfx, go, root, s, text, pick };
}

describe('DungeonScene', () => {
  it('shows the floor name, a green lamp and the party bar', () => {
    const { root } = setup();
    expect(root.querySelector('.slx-floorname')!.textContent).toBe('第 1 層　林間遺跡');
    expect(root.querySelector('.slx-lamp')!.classList.contains('slx-lamp-green')).toBe(true);
    expect(root.querySelectorAll('.slx-partybar .slx-pm')).toHaveLength(5);
  });

  it('names each floor by its terrain, at any depth and in any region', () => {
    const { game, root, s, text, pick } = setup({ region: 'storm', condition: 'plain' });
    expect(root.querySelector('.slx-floorname')!.textContent).toBe('第 1 層　星燈神殿');
    const down = game.map().down!;
    const dir = (['up', 'down', 'left', 'right'] as const).find((d) => tileAt(game.map(), { x: down.x - DELTA[d].x, y: down.y - DELTA[d].y }) !== 'wall')!;
    game.pos = { x: down.x - DELTA[dir].x, y: down.y - DELTA[dir].y };
    s.onAction(dir);
    expect(game.floor).toBe(1);   // the stairs ask first
    pick('前往');
    expect(game.floor).toBe(2);
    expect(text()).toBe('第 2 層　星燈神殿');
    expect(root.querySelector('.slx-floorname')!.textContent).toBe('第 2 層　星燈神殿');
  });

  describe('stairs', () => {
    const toStairs = (t: ReturnType<typeof setup>) => {
      const down = t.game.map().down!;
      const dir = (['up', 'down', 'left', 'right'] as const).find((d) => tileAt(t.game.map(), { x: down.x - DELTA[d].x, y: down.y - DELTA[d].y }) !== 'wall')!;
      t.game.pos = { x: down.x - DELTA[dir].x, y: down.y - DELTA[dir].y };
      t.s.onAction(dir);
      return { down, dir };
    };
    const win = (root: HTMLElement) => root.querySelector('.slx-event-stairs');
    const lines = (root: HTMLElement) => [...win(root)!.querySelectorAll('.slx-event-text')].map((e) => e.textContent);
    const selected = (root: HTMLElement) => win(root)!.querySelector('[aria-selected=true] .slx-label')!.textContent;

    it('asks with the depth and its suggested level, warns an under-level party and defaults to staying', () => {
      const t = setup();
      toStairs(t);
      expect(t.game.floor).toBe(1);
      expect(win(t.root)!.querySelector('.slx-event-title')!.textContent).toBe('前往第 2 層？');
      expect(lines(t.root)).toEqual(['建議等級 Lv 6', '隊伍等級不足，可能會很危險']);
      expect(selected(t.root)).toBe('留在這層');
      t.s.onAction('confirm');
      expect([t.game.floor, win(t.root)]).toEqual([1, null]);
    });

    it('without a warning it defaults to going down', () => {
      const t = setup();
      t.game.state.party.roster.scarlet.level = 6;
      toStairs(t);
      expect(lines(t.root)).toEqual(['建議等級 Lv 6']);
      expect(selected(t.root)).toBe('前往');
      t.s.onAction('confirm');
      expect(t.game.floor).toBe(2);
      expect(t.sfx.stairs).toHaveBeenCalled();
      expect(t.text()).toBe('第 2 層　水晶洞窟');
    });

    it('staying keeps the party on the stairs with no new prompt until it steps off and back', () => {
      const t = setup();
      const { down, dir } = toStairs(t);
      t.pick('留在這層');
      expect([t.game.floor, t.game.pos, win(t.root)]).toEqual([1, down, null]);
      const back = ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[dir];
      t.s.onAction(back);
      expect(win(t.root)).toBeNull();
      t.s.onAction(dir);
      expect(win(t.root)).not.toBeNull();
    });

    it('after the floor name, a second message pays the clear exp', async () => {
      const t = setup();
      toStairs(t);
      t.pick('前往');
      expect(t.game.floor).toBe(2);
      expect(t.text()).toBe('第 2 層　水晶洞窟');
      t.s.onAction('confirm');
      await Promise.resolve();
      expect(t.text()).toContain('踏破獎勵：經驗值 +');
      expect(t.text()).toContain('升到 Lv');
    });

    it('shows no reward line when nobody gains exp', async () => {
      const t = setup();
      for (const id of t.game.state.party.recruited) t.game.state.party.roster[id].level = 50;
      toStairs(t);
      t.pick('前往');
      expect(t.text()).toBe('第 2 層　水晶洞窟');
      t.s.onAction('confirm');
      await Promise.resolve();
      expect(t.root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(true);
      expect(t.text()).not.toContain('踏破獎勵');
    });

    it('the reward line stays quiet once the scene has exited', async () => {
      const t = setup();
      toStairs(t);
      t.pick('前往');
      t.s.exit();
      t.s.onAction('confirm');
      await Promise.resolve();
      expect(t.text()).not.toContain('踏破獎勵');
    });

    it('the reward line does not override a newer line', async () => {
      const t = setup();
      toStairs(t);
      t.pick('前往');
      (t.s as unknown as { say(text: string): Promise<void> }).say('新的訊息');
      await Promise.resolve();
      await Promise.resolve();
      expect(t.text()).toBe('新的訊息');
    });
  });

  it('bumps into walls and walks on floors', () => {
    const { game, sfx, s } = setup();
    for (let i = 0; i < 8 && game.move('up').kind === 'moved'; i++);   // the entrance sits mid-room: walk up to the room's top wall
    const at = { ...game.pos };
    s.onAction('up');
    expect(sfx.bump).toHaveBeenCalled();
    expect(game.pos).toEqual(at);
    s.onAction('right');
    expect(game.pos).toEqual({ x: at.x + 1, y: at.y });
    expect(sfx.step).toHaveBeenCalled();
  });

  it('enters battle on an encounter and ignores further moves', () => {
    const { game, go, s, sfx } = setup();
    game.encounter = 99;
    s.onAction('right');
    expect(sfx.encounter).toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith('battle');
    const at = { ...game.pos };
    s.onAction('left');
    expect(game.pos).toEqual(at);
  });

  it('plays an encounter transition before the battle starts, red for the boss', async () => {
    vi.useFakeTimers();
    try {
      const game = new Game(constRng(0.99), null);
      game.depart({ region: 'mainline', condition: 'plain' }, 1);
      game.encounter = 99;
      const go = vi.fn();
      const root = document.createElement('div');
      const s = new DungeonScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: false }, Infinity);
      s.enter(root);
      s.onAction('right');
      expect(root.querySelector('.slx-encounter')).not.toBeNull();
      expect(root.querySelector('.slx-encounter-boss')).toBeNull();
      expect(go).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(600);
      expect(go).toHaveBeenCalledWith('battle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks before returning to town at the entrance', () => {
    const { game, go, s, root } = setup();
    s.onAction('right'); s.onAction('left');
    expect(root.querySelector('.slx-confirm')).not.toBeNull();
    s.onAction('up');            // 是
    s.onAction('confirm');
    expect(game.phase).toBe('town');
    expect(go).toHaveBeenCalledWith('town');
  });

  it('asks before using the return lamp, then tells the town about it', () => {
    const { game, go, s, pick, root } = setup();
    s.onAction('menu');
    pick('歸還之燈');
    expect(go).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
    pick('是');
    expect(game.state.inventory['return-lamp'] ?? 0).toBe(0);
    expect(game.notice).toBe('lamp');
    expect(go).toHaveBeenCalledWith('town');
  });

  it('closes windows with the mouse: a 返回 control appears while a window is open, C closes the menu too', () => {
    const { s, root } = setup();
    const back = root.querySelector('.slx-dungeon > .slx-back') as HTMLElement;
    expect(back.hidden).toBe(true);
    s.onAction('menu');
    expect(back.hidden).toBe(false);
    back.click();
    expect(root.querySelector('.slx-layer')).toBeNull();
    expect(back.hidden).toBe(true);
    s.onAction('menu');
    s.onAction('menu');
    expect(root.querySelector('.slx-layer')).toBeNull();
  });

  it('opens the status screen on the member picked from 隊伍狀態', () => {
    const { s, go, pick } = setup();
    s.onAction('menu');
    pick('隊伍狀態');
    pick('絲嘉蕾');
    expect(go).toHaveBeenCalledWith('status', 'scarlet');
  });

  it('leaves out items that do nothing outside battle', () => {
    const { game, s, root, pick } = setup();
    game.state.inventory.antidote = 2;
    s.onAction('menu');
    pick('道具');
    const names = [...root.querySelectorAll('.slx-layer:last-child [role=option] .slx-label')].map((o) => o.textContent);
    expect(names).toContain('回復藥');
    expect(names).not.toContain('解毒藥');
  });

  it('offers settings from the field menu', () => {
    const { s, go, pick } = setup();
    s.onAction('menu');
    pick('設定');
    expect(go).toHaveBeenCalledWith('settings');
  });

  it('uses a potion from the field menu', () => {
    const { game, s, pick } = setup();
    game.state.party.roster.liz.hp = 3;
    s.onAction('menu');
    pick('道具');
    pick('回復藥');
    pick('莉茲');
    expect(game.state.party.roster.liz.hp).toBeGreaterThan(3);
    expect(game.state.inventory.potion).toBe(START_ITEMS.potion - 1);
  });

  it('shows the run condition as a banner on arrival from the plaza, and not when coming back from a battle', () => {
    const game = new Game(constRng(0.99), null);
    game.depart({ region: 'blaze', condition: 'fog' }, 1);
    const mk = (from: 'gate' | 'battle') => {
      const root = document.createElement('div');
      new DungeonScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: false, from }, Infinity).enter(root);
      return root;
    };
    const banner = mk('gate').querySelector('.slx-banner.slx-banner-condition')!;
    expect(banner.textContent).toContain('本次狀況');
    expect(banner.textContent).toContain('濃霧');
    expect(banner.textContent).toContain('視野只有自己這一格');
    expect(mk('battle').querySelector('.slx-banner')).toBeNull();
  });

  it('leaves no banner or flash timer running after exit', () => {
    vi.useFakeTimers();
    try {
      const game = new Game(constRng(0.99), null);
      game.depart({ region: 'blaze', condition: 'fog' }, 1);
      const s = new DungeonScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: false, from: 'gate' }, Infinity);
      s.enter(document.createElement('div'));
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      s.exit();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DungeonScene readouts', () => {
  it('formats weights to one decimal place at most', () => {
    expect([kg(32.5), kg(60), kg(0.25 + 0.5), kg(63.49999)]).toEqual(['32.5', '60', '0.8', '63.5']);
  });

  it('shows the carried weight above the key hint, yellow over 80% and red when full', () => {
    const { game, root, s } = setup();
    const w = root.querySelector('.slx-weight')!;
    const cap = capacity(game.state.party);
    expect(w.textContent).toBe(`重量 ${kg(carried(game.state, game.run!))}／${kg(cap)}`);
    expect(w.classList.contains('slx-weight-heavy')).toBe(false);
    for (let i = 0; i < 8 && game.move('up').kind === 'moved'; i++);   // to the room's top wall: bumping it refreshes without leaving
    const mat = Object.keys(MATERIALS).find((id) => weightOf(id) === 0.5)!;
    const fill = (target: number) => { game.run!.loot.items[mat] = 0; game.run!.loot.items[mat] = Math.ceil((target - carried(game.state, game.run!)) / 0.5); };
    fill(cap * 0.85);
    s.onAction('up');   // any step (or bump) refreshes the readout
    expect(w.textContent).toBe(`重量 ${kg(carried(game.state, game.run!))}／${kg(cap)}`);
    expect(w.classList.contains('slx-weight-heavy')).toBe(true);
    expect(w.classList.contains('slx-weight-full')).toBe(false);
    fill(cap);
    s.onAction('up');
    expect(w.classList.contains('slx-weight-full')).toBe(true);
    expect(w.classList.contains('slx-weight-heavy')).toBe(false);
  });

  it('keeps the run condition in a corner badge; its description shows on hover or focus and in the field menu', () => {
    const { root, s, text, pick } = setup({ region: 'mainline', condition: 'fog' });
    const badge = root.querySelector<HTMLElement>('.slx-condition')!;
    const tip = root.querySelector<HTMLElement>('.slx-condition-tip')!;
    expect(badge.textContent).toBe('濃霧');
    expect(badge.getAttribute('tabindex')).toBe('0');
    expect(badge.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.textContent).toBe('視野只有自己這一格，遇敵率 -20%');
    expect(tip.hidden).toBe(true);
    badge.dispatchEvent(new Event('mouseenter'));
    expect(tip.hidden).toBe(false);
    badge.dispatchEvent(new Event('mouseleave'));
    expect(tip.hidden).toBe(true);
    badge.dispatchEvent(new Event('focus'));
    expect(tip.hidden).toBe(false);
    badge.dispatchEvent(new Event('blur'));
    expect(tip.hidden).toBe(true);
    s.onAction('menu');
    pick('本次狀況');
    expect(text()).toBe('濃霧：視野只有自己這一格，遇敵率 -20%');
  });

  it('has a 120×88 minimap canvas in the top-right', () => {
    const { root } = setup();
    const c = root.querySelector<HTMLCanvasElement>('canvas.slx-minimap')!;
    expect([c.width, c.height]).toEqual([120, 88]);
    expect(c.getAttribute('style')).toBeNull();
  });
});

describe('DungeonScene loot', () => {
  const gearOf = (uid: number, base: string, rarity: ItemInstance['rarity']): ItemInstance => ({ uid, base, rarity, ilvl: 3, affixes: [], enhance: 0 });
  /** Put a gear chest next to the party (moving the party beside a cell whose chest rolls gear); returns the step onto it. */
  const gearChest = (game: Game, gear: ItemInstance): Dir => {
    const m = game.map();
    for (let y = 1; y < m.height - 1; y++) for (let x = 1; x < m.width - 1; x++) {
      if (m.tiles[y][x] !== 'floor' || !chestHasGear(game.run!, game.floor, { x, y })) continue;
      const dir = (['up', 'down', 'left', 'right'] as const).find((d) => tileAt(m, { x: x - DELTA[d].x, y: y - DELTA[d].y }) === 'floor');
      if (!dir) continue;
      m.tiles[y][x] = 'chest';
      game.pos = { x: x - DELTA[dir].x, y: y - DELTA[dir].y };
      game.run!.gearRolls[`chest:${game.floor}:${x},${y}`] = gear;
      return dir;
    }
    throw new Error('no gear chest cell');
  };

  it('a chest with gear names the item in its rarity colour', () => {
    const { game, s, root, text } = setup();
    const dir = gearChest(game, gearOf(77, 'iron-sword', 'legendary'));
    s.onAction(dir);
    expect(text()).toContain('打開寶箱');
    expect(text()).toContain('鐵劍・傳說');
    expect(root.querySelector('.slx-talk .slx-text .slx-rarity-legendary')!.textContent).toBe('鐵劍・傳說');
    expect(game.run!.loot.gear.map((g) => g.uid)).toEqual([77]);
  });

  it('the best drop raises one pillar and plays loot once', () => {
    const { game, s, root, sfx } = setup();
    s.onAction(gearChest(game, gearOf(77, 'iron-sword', 'legendary')));
    expect(root.querySelectorAll('.slx-pillar').length).toBe(1);
    // It stands on the party's tile: a direct child of the labyrinth screen, which the stylesheet anchors at the party.
    const p = root.querySelector('.slx-dungeon > .slx-pillar')!;
    expect(p.classList.contains('slx-rarity-legendary')).toBe(true);
    expect(p.classList.contains('slx-pillar-legend')).toBe(true);
    expect(sfx.loot).toHaveBeenCalledTimes(1);
    expect(sfx.loot).toHaveBeenCalledWith('legendary', 150);
  });

  it('two drops in a row: one pillar and one chime each', () => {
    const { game, s, root, sfx, text } = setup();
    s.onAction(gearChest(game, gearOf(81, 'iron-sword', 'rare')));
    expect(root.querySelectorAll('.slx-pillar.slx-rarity-rare').length).toBe(1);
    expect(sfx.loot).toHaveBeenCalledTimes(1);
    s.onAction('confirm');   // close the line
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);
    s.onAction(gearChest(game, gearOf(82, 'hunter-bow', 'set')));
    expect(text()).toContain('獵弓');
    expect(root.querySelectorAll('.slx-pillar').length).toBe(1);   // the second replaced the first
    expect(root.querySelector('.slx-pillar')!.classList.contains('slx-rarity-set')).toBe(true);
    expect(sfx.loot).toHaveBeenCalledTimes(2);
    expect(sfx.loot).toHaveBeenLastCalledWith('set', 150);
  });

  it('fast mode never spends a key on the legendary moment', () => {
    const { game, s, root } = setup();
    s.onAction(gearChest(game, gearOf(83, 'iron-sword', 'legendary')));
    expect(root.querySelector('.slx-pillar-legend')).not.toBeNull();
    s.onAction('confirm');
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);   // the key closed the line
  });

  it('a direction key is never spent on the legendary moment: the party still steps', () => {
    vi.useFakeTimers();
    try {
      const { game, s, root } = setup(undefined, false);
      const body = root.querySelector<HTMLElement>('.slx-dungeon')!;
      showPillar(body, 'legendary', false);
      const dir = (['up', 'down', 'left', 'right'] as const).find((d) => tileAt(game.map(), { x: game.pos.x + DELTA[d].x, y: game.pos.y + DELTA[d].y }) === 'floor')!;
      const from = { ...game.pos };
      s.onAction(dir);
      expect(game.pos).not.toEqual(from);
      expect(root.querySelector('.slx-pillar-legend')).not.toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('leaving the labyrinth takes the pillar and its timer with it', () => {
    vi.useFakeTimers();
    try {
      const { game, s, root } = setup(undefined, false);
      s.onAction(gearChest(game, gearOf(84, 'iron-sword', 'legendary')));
      expect(root.querySelector('.slx-pillar')).not.toBeNull();
      s.exit();
      expect(root.querySelector('.slx-pillar')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('a chest of common gear raises no pillar and plays no loot cue', () => {
    const { game, s, root, sfx, text } = setup();
    s.onAction(gearChest(game, gearOf(78, 'cloth-robe', 'common')));
    expect(text()).toContain('打開寶箱');
    expect(root.querySelector('.slx-pillar')).toBeNull();
    expect(sfx.loot).not.toHaveBeenCalled();
  });

  it('any key skips the legendary moment, and only that key', () => {
    vi.useFakeTimers();
    try {
      const { game, s, root, text } = setup(undefined, false);
      s.onAction(gearChest(game, gearOf(79, 'iron-sword', 'unique')));
      expect(root.querySelector('.slx-pillar-legend')).not.toBeNull();
      s.onAction('confirm');
      expect(root.querySelector('.slx-pillar')).toBeNull();
      expect(text()).toContain('鐵劍・獨特');   // the key went to the skip, not to the line
      expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('warns at the lamp and at the entrance when the bag cannot take all the run gear', () => {
    const { game, s, pick, root } = setup();
    game.state.bag = Array.from({ length: 59 }, (_, i) => gearOf(1000 + i, 'cloth-robe', 'common'));
    game.run!.loot.gear.push(gearOf(1, 'iron-sword', 'rare'), gearOf(2, 'hunter-bow', 'magic'));
    s.onAction('menu');
    pick('歸還之燈');
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('背包剩 1 格');
    s.onAction('cancel');
    s.onAction('cancel');
    s.onAction('right'); s.onAction('left');
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('背包剩 1 格');
  });

  it('says nothing about the bag when the run gear fits', () => {
    const { game, s, pick, root } = setup();
    game.run!.loot.gear.push(gearOf(1, 'iron-sword', 'rare'));
    s.onAction('menu');
    pick('歸還之燈');
    expect(root.querySelector('.slx-confirm')!.textContent).not.toContain('背包剩');
  });
});
