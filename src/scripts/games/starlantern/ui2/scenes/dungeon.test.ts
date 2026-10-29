import { describe, expect, it, vi } from 'vitest';
import { drawLanded } from '../lateArt';
import { Game } from '../../engine/game';
import { START_ITEMS } from '../../engine/state';
import type { Portal } from '../../engine/dungeon/run';
import { DELTA, tileAt, type Dir } from '../../engine/map';
import { chestHasGear } from '../../engine/loot/drops';
import { SHARD_IDS, fragmentName } from '../../data/story/fragments';
import type { ItemInstance } from '../../engine/types';
import { constRng } from '../../engine/testing';
import { dayOf } from '../../engine/calendar';
import { withGuildLive } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { capacity, carried, formatWeight as kg, weightOf } from '../../data/weights';
import { MATERIALS } from '../../data/materials';
import { showPillar } from '../lootFx';
import { DungeonScene } from './dungeon';
import { LEGACY_LINEUP, activeIds, meet, statsOf } from '../../engine/party';
import { floorOf } from '../../engine/dungeon/run';
import { T } from '../../data/text.zh-TW';
import { CHARACTERS } from '../../data/characters';
import { memoriesOf } from '../../engine/progression';
import type { CharacterId } from '../../engine/types';
import type { SceneCtx } from '../scene';
import { DEFAULT_SETTINGS, type StoryMode } from '../settings';
import { art } from '../../render/artPaths';
import { FOUND_LINE, STORY } from '../../data/story.zh-TW';
import { CHAINS } from '../../data/story/chains';
import { FINALE_DEPTH } from '../../data/story/scenes';
import type { ArtIndex } from '../../render/textures';
import { CONDITIONS } from '../../data/conditions';
import { SKILLS } from '../../data/skills';
import { fieldCost } from '../../engine/field';

/** The depth Selene's first piece opens at: a glimmer of hers holds a memory from there on. */
const SELENE_FIRST = CHAINS.selene.pieces[0].minDepth;

function setup(portal: Portal = { region: 'mainline', condition: 'plain' }, fast = true, extra: Partial<SceneCtx> = {}, prep?: (game: Game) => void, start = 1) {
  const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);   // 0.99: never an early encounter roll
  game.state.dungeon.reached[portal.region] = Math.max(game.state.dungeon.reached[portal.region], start);   // so `start` can be departed to
  expect(game.depart(portal, start)).toEqual({ ok: true });
  prep?.(game);
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), bump: vi.fn(), step: vi.fn(), stairs: vi.fn(), chest: vi.fn(), encounter: vi.fn(), loot: vi.fn(), heal: vi.fn() };
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new DungeonScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast, ...extra }, Infinity);
  s.enter(root);
  const text = () => root.querySelector('.slx-talk .slx-text')?.textContent ?? '';
  const pick = (label: string) => {
    const o = [...root.querySelectorAll('.slx-layer:last-child [role=option]')].find((x) => x.querySelector('.slx-label')!.textContent!.startsWith(label));
    if (!o) throw new Error(`no ${label}`);
    (o as HTMLElement).click();
  };
  return { game, sfx, go, root, s, text, pick };
}

describe('DungeonScene glimmers', () => {
  /** Plant a glimmer on an open cell next to the party and return the key that steps onto it. */
  const glimmerNext = (game: Game, owner?: CharacterId) => {
    const m = game.map();
    for (const dir of ['right', 'left', 'down', 'up'] as const) {
      const at = { x: game.pos.x + DELTA[dir].x, y: game.pos.y + DELTA[dir].y };
      if (m.tiles[at.y][at.x] !== 'floor') continue;
      m.tiles[at.y][at.x] = 'glimmer';
      floorOf(game.run!, game.floor).contents.push({ kind: 'glimmer', at, room: 0, ...(owner ? { owner } : {}) });
      return { dir, at };
    }
    throw new Error('no open cell beside the party');
  };

  it('stepping on a glimmer says what was found', async () => {
    const { game, s, text } = setup(undefined, true, {}, undefined, SELENE_FIRST);
    const { dir, at } = glimmerNext(game, 'selene');
    s.onAction(dir);
    await Promise.resolve();
    expect(text()).toBe(T.ui2.memory.recalled(CHARACTERS.selene.name));   // story L: who remembered, not which piece
    expect(tileAt(game.map(), at)).toBe('floor');
    expect(memoriesOf(game.state.party.roster.selene)).toBe(1);
  });

  it('a glimmer that holds no memory leaves an ownerless shard', async () => {
    const { game, s, text } = setup();
    for (const m of Object.values(game.state.party.roster)) m.memories = 99;   // every chain is complete: nothing is left to find
    const { dir } = glimmerNext(game);
    s.onAction(dir);
    await Promise.resolve();
    expect(text()).toBe(T.ui2.memory.shard(fragmentName(SHARD_IDS.dim)!));   // depth 1 only finds the dimmest grade
  });
});

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

    it('a floor whose rescue still waits adds the plea, defaults to staying, and can still be descended', () => {
      const t = setup();
      t.game.state.party.roster.scarlet.level = 6;
      t.game.state.party.recruited = t.game.state.party.recruited.filter((id) => id !== 'selene');
      floorOf(t.game.run!, 1).contents.push({ kind: 'rescue', at: { x: 0, y: 0 }, room: 0, who: 'selene' });
      toStairs(t);
      expect(lines(t.root)).toEqual(['建議等級 Lv 6', T.ui2.rescue.waiting]);
      expect(selected(t.root)).toBe('留在這層');
      t.pick('前往');
      expect(t.game.floor).toBe(2);
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
      const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
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

  it('the labyrinth menu opens the handbook, read-only, and it comes back here', () => {
    const { s, go, pick } = setup();
    s.onAction('menu');
    pick(T.ui2.handbook.title);
    expect(go).toHaveBeenCalledWith('handbook', 'dungeon');
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
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
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
      const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
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

  it("a chest line shown before the piece's gear icon landed gains it when it lands (ui2/lateArt)", () => {
    const landed = new Set<string>();
    const { game, s, root } = setup(undefined, true, { art: { has: (u) => landed.has(u) } });
    s.onAction(gearChest(game, gearOf(77, 'iron-sword', 'legendary')));
    const line = root.querySelector('.slx-talk .slx-text')!;
    expect(line.querySelector('img')).toBeNull();
    landed.add(art.gear('iron-sword'));
    drawLanded(root, new Set([art.gear('iron-sword')]));
    const img = line.querySelector('img.slx-gear-ico')!;
    expect(img.getAttribute('src')).toBe(art.gear('iron-sword'));
    expect(img.nextElementSibling!.textContent).toBe('鐵劍・傳說');
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

  describe('a rescue room', () => {
    /** Two members, Selene waiting on floor 2; the hero stands next to her room. Returns the key that steps in. */
    const rescueSetup = () => {
      const game = new Game(constRng(0.99), null, undefined, 0, ['hero', 'rin']);
      game.state.dungeon.reached.mainline = 3;
      expect(game.depart({ region: 'mainline', condition: 'plain' }, 2)).toEqual({ ok: true });
      const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), bump: vi.fn(), step: vi.fn(), stairs: vi.fn(), chest: vi.fn(), encounter: vi.fn(), loot: vi.fn() };
      const go = vi.fn();
      const root = document.createElement('div');
      const s = new DungeonScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: true }, Infinity);
      s.enter(root);
      const text = () => root.querySelector('.slx-talk .slx-text')?.textContent ?? '';
      const at = floorOf(game.run!, 2).contents.find((c) => c.kind === 'rescue')!.at;
      const dir = (['up', 'down', 'left', 'right'] as const).find((d) => !['wall', 'trap'].includes(tileAt(game.map(), { x: at.x - DELTA[d].x, y: at.y - DELTA[d].y })))!;
      game.pos = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
      return { game, sfx, go, s, text, dir, root };
    };
    const settle = () => new Promise((r) => setTimeout(r, 0));

    it('stepping in says the meeting line, then fights', async () => {
      const { game, sfx, go, s, text, dir } = rescueSetup();
      s.onAction(dir);
      expect(text()).toBe(STORY.meet.selene.before[0].text);
      expect(text()).toBe(FOUND_LINE);
      expect(game.phase).toBe('battle');
      expect(go).not.toHaveBeenCalled();
      expect(sfx.encounter).not.toHaveBeenCalled();   // the fight's cue waits for the line to be read
      // The written meeting (plan 6c Task 8) says more after the found line: each in turn, and no fight until the last.
      const before = STORY.meet.selene.before;
      expect(before.length).toBeGreaterThan(1);
      for (let i = 1; i < before.length; i++) {
        s.onAction('confirm');
        await settle();
        expect(text()).toBe(before[i].text);
        expect(go).not.toHaveBeenCalled();
        expect(sfx.encounter).not.toHaveBeenCalled();
      }
      s.onAction('confirm');
      await settle();
      expect(sfx.encounter).toHaveBeenCalledTimes(1);
      expect(go).toHaveBeenCalledWith('battle');
    });

    it('the weight and key hint step aside during the meeting and stay hidden into the fight', async () => {
      const { go, s, dir, root } = rescueSetup();
      const hidden = () => ['.slx-weight', '.slx-keyhint'].map((c) => root.querySelector(c)!.classList.contains('slx-cmd-hidden'));
      expect(hidden()).toEqual([false, false]);
      s.onAction(dir);
      expect(hidden()).toEqual([true, true]);
      for (let i = 1; i < STORY.meet.selene.before.length; i++) {   // every line of the meeting keeps them aside
        s.onAction('confirm');
        await settle();
        expect(hidden()).toEqual([true, true]);
      }
      s.onAction('confirm');
      await settle();
      expect(go).toHaveBeenCalledWith('battle');
      expect(hidden()).toEqual([true, true]);   // the scene leaves for the battle: nothing flashes back
    });

    it('they come back when the scene went before the meeting ended', async () => {
      const { s, dir, root } = rescueSetup();
      s.onAction(dir);
      s.exit();
      s.onAction('confirm');
      await settle();
      expect(root.querySelector('.slx-weight')!.classList.contains('slx-cmd-hidden')).toBe(false);
    });

    it('says every line of a longer meeting in turn, and fights after the last', async () => {
      const lines = STORY.meet.selene.before;
      const saved = [...lines];
      lines.splice(0, lines.length, { who: 'narrator', text: '第一句' }, { who: 'narrator', text: '第二句' });
      try {
        const { sfx, go, s, text, dir } = rescueSetup();
        s.onAction(dir);
        expect(text()).toBe('第一句');
        s.onAction('confirm');
        await settle();
        expect(text()).toBe('第二句');
        expect(go).not.toHaveBeenCalled();
        expect(sfx.encounter).not.toHaveBeenCalled();
        s.onAction('confirm');
        await settle();
        expect(go).toHaveBeenCalledWith('battle');
      } finally {
        lines.splice(0, lines.length, ...saved);
      }
    });

    it('leaving the scene while the line waits starts no fight', async () => {
      const { sfx, go, s, dir } = rescueSetup();
      s.onAction(dir);
      s.exit();
      s.onAction('confirm');   // a stale key or click still dismisses the line the scene left waiting
      await settle();
      expect(sfx.encounter).not.toHaveBeenCalled();
      expect(go).not.toHaveBeenCalled();
    });
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

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const withStory = (story: StoryMode): Partial<SceneCtx> => ({ settings: { get: () => ({ ...DEFAULT_SETTINGS, story }) } });

describe('DungeonScene memories', () => {
  const glimmerNext = (game: Game, owner: CharacterId) => {
    const m = game.map();
    for (const dir of ['right', 'left', 'down', 'up'] as const) {
      const at = { x: game.pos.x + DELTA[dir].x, y: game.pos.y + DELTA[dir].y };
      if (m.tiles[at.y][at.x] !== 'floor') continue;
      m.tiles[at.y][at.x] = 'glimmer';
      floorOf(game.run!, game.floor).contents.push({ kind: 'glimmer', at, room: 0, owner });
      return dir;
    }
    throw new Error('no open cell beside the party');
  };
  /** Confirms until the talk box is gone (a scene plays through). */
  const through = async (s: DungeonScene, root: HTMLElement) => {
    for (let i = 0; i < 40 && !root.querySelector('.slx-talk')!.hasAttribute('hidden'); i++) { s.onAction('confirm'); await flush(); }
  };

  it("a glimmer's piece shows one caption and plays no scene (story L)", async () => {
    const { game, s, root, text } = setup(undefined, true, {}, undefined, SELENE_FIRST);
    const done = vi.spyOn(game, 'sceneDone');
    s.onAction(glimmerNext(game, 'selene'));
    await flush();
    expect(text()).toBe(T.ui2.memory.recalled(CHARACTERS.selene.name));
    expect(text()).toBe('瑟蕾想起了什麼。');
    expect(root.querySelector('.slx-talk--memory')).toBeNull();
    s.onAction('confirm');
    await flush();
    expect(root.querySelector('.slx-talk--memory')).toBeNull();
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);   // the caption was all
    expect(root.querySelector('.slx-pad')!.classList.contains('slx-cmd-hidden')).toBe(false);
    expect(root.querySelector('.slx-pad')!.hasAttribute('inert')).toBe(false);
    expect(done).not.toHaveBeenCalled();
    expect(game.pending).toEqual([]);
    expect(game.state.story.untold).toEqual(['mem:selene:1']);   // told tonight in town
    expect(game.state.story.seen).not.toContain('mem:selene:1');
  });

  it('story none: the same caption, and the piece still waits untold (story L)', async () => {
    const { game, s, root, text } = setup(undefined, true, withStory('none'), undefined, SELENE_FIRST);
    s.onAction(glimmerNext(game, 'selene'));
    await flush();
    expect(text()).toBe(T.ui2.memory.recalled(CHARACTERS.selene.name));
    s.onAction('confirm');
    await flush();
    expect(root.querySelector('.slx-talk--memory')).toBeNull();
    expect(game.state.story.untold).toEqual(['mem:selene:1']);
    expect(game.state.story.seen).not.toContain('mem:selene:1');
    expect(game.state.story.fresh).not.toContain('mem:selene:1');
  });

  it('a wipe afterwards keeps the piece and its untold memory (story L)', async () => {
    const { game, s, root } = setup(undefined, true, {}, undefined, SELENE_FIRST);
    s.onAction(glimmerNext(game, 'selene'));
    await flush();
    await through(s, root);
    game.pos = { ...game.map().entrance };
    game.encounter = 99;
    game.move('right');
    expect(game.phase).toBe('battle');
    for (const m of game.battle!.party) { m.hp = 0; m.alive = false; }
    game.submitRound({});
    expect(game.phase).toBe('town');
    expect(game.state.story.untold).toEqual(['mem:selene:1']);
    expect(memoriesOf(game.state.party.roster.selene)).toBe(1);
  });

  it('leaving the floor waits for no memory (story L)', async () => {
    const { game, go, s, pick } = setup(undefined, true, {}, (g) => { g.state.party.roster.rin.memories = 1; g.state.story.untold = ['mem:rin:1']; });
    const done = vi.spyOn(game, 'sceneDone');
    await flush();
    const lamps = game.state.inventory['return-lamp'] ?? 0;
    s.onAction('menu');
    pick('歸還之燈');
    pick('是');
    expect(go).toHaveBeenCalledWith('town');   // at once
    expect(game.state.inventory['return-lamp'] ?? 0).toBe(lamps - 1);
    expect(done).not.toHaveBeenCalled();
    expect(game.state.story.untold).toEqual(['mem:rin:1']);
  });

  it('walking out at the entrance leaves at once, an untold memory or not (story L)', async () => {
    const { game, go, s } = setup(undefined, true, {}, (g) => { g.state.party.roster.rin.memories = 1; g.state.story.untold = ['mem:rin:1']; });
    await flush();
    s.onAction('right'); s.onAction('left');
    s.onAction('up');
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('town');
    expect(game.state.story.untold).toEqual(['mem:rin:1']);
  });

  it('two pieces in one step are one caption each, never a scene (story L)', async () => {
    const { game, s, root, text } = setup(undefined, true, {}, undefined, SELENE_FIRST);
    vi.spyOn(game, 'move').mockImplementation(() => ({ kind: 'glimmer', gained: [{ kind: 'piece', id: 'hero', n: 6 }, { kind: 'piece', id: 'hero', n: 7 }, { kind: 'piece', id: 'selene', n: 1 }] }));
    s.onAction('right');
    await flush();
    const said: string[] = [];
    for (let i = 0; i < 6 && !root.querySelector('.slx-talk')!.hasAttribute('hidden'); i++) { said.push(text()); s.onAction('confirm'); await flush(); }
    expect(said).toEqual([T.ui2.memory.recalled(CHARACTERS.hero.name), T.ui2.memory.recalled(CHARACTERS.selene.name)]);
    expect(root.querySelector('.slx-talk--memory')).toBeNull();
  });
});

describe('DungeonScene rescue meetings', () => {
  const PORTRAIT = art.portrait('selene', 'normal');
  const ART: ArtIndex = { has: (u) => u === PORTRAIT };
  const meetNext = (game: Game) => {
    const m = game.map();
    for (const dir of ['right', 'left', 'down', 'up'] as const) {
      const at = { x: game.pos.x + DELTA[dir].x, y: game.pos.y + DELTA[dir].y };
      if (m.tiles[at.y][at.x] !== 'floor') continue;
      m.tiles[at.y][at.x] = 'rescue';
      floorOf(game.run!, game.floor).contents.push({ kind: 'rescue', at, room: 0, who: 'selene' });
      return dir;
    }
    throw new Error('no open cell beside the party');
  };

  it('the found line is narration, hers carry her portrait, then the fight starts', async () => {
    const lines = STORY.meet.selene.before;
    const saved = [...lines];
    lines.splice(1, lines.length - 1, { who: 'selene', text: '謝謝你們。' });   // the real found line, then one line of hers
    try {
      const { game, go, s, root, text } = setup(undefined, true, { art: ART });
      game.state.party.recruited = game.state.party.recruited.filter((id) => id !== 'selene');
      s.onAction(meetNext(game));
      await flush();
      const name = () => root.querySelector('.slx-talk .slx-name') as HTMLElement;
      const face = () => root.querySelector('.slx-talk .slx-talk-face') as HTMLImageElement | null;
      expect(text()).toBe(FOUND_LINE);
      expect(name().hidden).toBe(true);   // narration: no name plate
      expect(face()).toBeNull();          // and no portrait
      s.onAction('confirm');
      await flush();
      expect(text()).toBe('謝謝你們。');
      expect(name().textContent).toBe(T.ui2.rescue.stranger);   // her name waits for her own words (story polish Task 1)
      expect(face()!.getAttribute('src')).toBe(PORTRAIT);
      expect(go).not.toHaveBeenCalled();
      s.onAction('confirm');
      await flush();
      expect(go).toHaveBeenCalledWith('battle');
    } finally {
      lines.splice(0, lines.length, ...saved);
    }
  });

  it('the found line names nobody, and her plate reads ？？？ before the fight', async () => {
    const lines = STORY.meet.selene.before;
    expect(lines[0].text).toBe(FOUND_LINE);
    expect(lines.some((l) => l.who === 'selene')).toBe(true);
    expect(lines.some((l) => l.who === 'rin')).toBe(true);
    const { game, go, s, root, text } = setup(undefined, true, { art: ART });
    game.state.party.recruited = game.state.party.recruited.filter((id) => id !== 'selene');
    s.onAction(meetNext(game));
    await flush();
    const plate = () => root.querySelector('.slx-talk .slx-name')!.textContent ?? '';
    for (let i = 0; i < lines.length; i++) {
      expect(text(), `line ${i}`).toBe(lines[i].text);
      const want = lines[i].who === 'selene' ? T.ui2.rescue.stranger : lines[i].who === 'rin' ? CHARACTERS.rin.name : '';
      expect(plate(), `line ${i}`).toBe(want);
      expect(plate(), `line ${i}`).not.toContain(CHARACTERS.selene.name);
      s.onAction('confirm');
      await flush();
    }
    expect(go).toHaveBeenCalledWith('battle');
  });

  it('without published art her own line still shows her name', async () => {
    const lines = STORY.meet.selene.before;
    const saved = [...lines];
    lines.splice(0, lines.length, { who: 'selene', text: '謝謝你們。' });
    try {
      const { game, s, root } = setup();
      game.state.party.recruited = game.state.party.recruited.filter((id) => id !== 'selene');
      s.onAction(meetNext(game));
      await flush();
      expect(root.querySelector('.slx-talk .slx-name')!.textContent).toBe(T.ui2.rescue.stranger);   // a plate, if not yet her name
      expect(root.querySelector('.slx-talk .slx-talk-face')).toBeNull();
    } finally {
      lines.splice(0, lines.length, ...saved);
    }
  });
});

describe("DungeonScene: the finale waits for Rin's choice", () => {
  const toBoss = (game: Game): Dir => {
    const at = game.map().boss!;
    for (const dir of ['right', 'left', 'down', 'up'] as const) {
      const from = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
      if (tileAt(game.map(), from) === 'floor') { game.pos = from; return dir; }
    }
    throw new Error('no way onto the boss');
  };

  it("the finale's waiting line plays and the map stays", async () => {
    const { game, go, s, text } = setup(undefined, true, {}, (g) => { g.state.party = meet(g.state.party, 'rin', 1); }, FINALE_DEPTH);
    s.onAction(toBoss(game));
    await flush();
    expect(game.finaleWaiting).toBe(true);
    expect(text()).toBe(STORY.finaleWait[0].text);
    expect(game.phase).toBe('map');
    expect(go).not.toHaveBeenCalled();
    expect(tileAt(game.map(), game.map().boss!)).toBe('boss');
  });

  it('with her choice the finale starts as before', async () => {
    const { game, go, s } = setup(undefined, true, {}, (g) => { g.state.party = meet(g.state.party, 'rin', 1); Object.assign(g.state.party.roster.rin, { memories: 7, oath: true }); }, FINALE_DEPTH);
    s.onAction(toBoss(game));
    await flush();
    expect(game.finaleWaiting).toBe(false);
    expect(go).toHaveBeenCalledWith('battle');
  });
});

describe('DungeonScene field menu: skills, equipment and formation (6f Task 5)', () => {
  const d = T.ui2.dungeon;
  const options = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.slx-layer:last-child [role=option]')];
  const labels = (root: HTMLElement) => options(root).map((o) => o.querySelector('.slx-label')!.textContent);
  const row = (root: HTMLElement, label: string) => {
    const o = options(root).find((x) => x.querySelector('.slx-label')!.textContent === label);
    if (!o) throw new Error(`no row ${label}`);
    return o;
  };
  const title = (root: HTMLElement) => root.querySelector('.slx-layer:last-child .slx-who')?.textContent;
  const name = (id: CharacterId) => CHARACTERS[id].name;
  /** Nobody on the roster knows any skill. */
  const unlearn = (g: Game) => { for (const m of Object.values(g.state.party.roster)) m.tree = {}; };
  /** Selene alone knows `skills` (rank 1 each): she is the only one who can cast in the field. */
  const seleneKnows = (...skills: string[]) => (g: Game) => {
    unlearn(g);
    g.state.party.roster.selene.tree = Object.fromEntries(skills.map((sk) => [sk, 1]));
  };
  const hpBar = (root: HTMLElement, id: CharacterId) => root.querySelector(`.slx-pm[data-key=${id}] [role=meter]`)!.getAttribute('aria-valuenow');

  it('the field menu lists skills, equipment and formation in order', () => {
    const { game, s, root } = setup();
    s.onAction('menu');
    expect(options(root).map((o) => o.dataset.id)).toEqual(['status', 'skills', 'items', 'equip', 'workshop', 'formation', 'lamp', 'condition', 'handbook', 'settings', 'close']);
    expect(labels(root)).toEqual([
      d.status, '技能', d.items, '裝備', d.workshop, '隊形', d.lamp(game.state.inventory['return-lamp'] ?? 0),
      d.conditionItem(CONDITIONS[game.run!.condition].name), d.handbook, T.ui2.title.settings, d.close,
    ]);
  });

  it('the field menu opens the workshop', () => {
    const { s, root, go } = setup();
    s.onAction('menu');
    row(root, d.workshop).click();
    expect(go).toHaveBeenCalledWith('workshop');
  });

  it('skills is disabled while nobody has learned a field skill', () => {
    const { s, root } = setup(undefined, true, {}, unlearn);
    s.onAction('menu');
    const skills = row(root, d.skills);
    expect(skills.getAttribute('aria-disabled')).toBe('true');
    skills.click();
    expect(labels(root)).toContain(d.status);   // a disabled line picks nothing: still the field menu
  });

  it('skills stays disabled while the only member who knows one is down, and opens while she stands', () => {
    const down = setup(undefined, true, {}, (g) => { seleneKnows('moonlight')(g); g.state.party.roster.selene.hp = 0; });
    down.s.onAction('menu');
    expect(row(down.root, d.skills).getAttribute('aria-disabled')).toBe('true');
    const up = setup(undefined, true, {}, seleneKnows('moonlight'));
    up.s.onAction('menu');
    expect(row(up.root, d.skills).getAttribute('aria-disabled')).toBe('false');
    up.pick(d.skills);
    expect(title(up.root)).toBe(d.castWho);
    expect(labels(up.root)).toEqual([name('selene')]);   // only who knows a field skill
  });

  it('casting a heal from the field menu heals and says so', () => {
    const { game, s, root, sfx, text, pick } = setup(undefined, true, {}, (g) => {
      const r = g.state.party.roster;
      r.selene.tree = { ...r.selene.tree, moonlight: 1 };
      r.noel.hp = 1;
    });
    const before = game.state.party;
    const sel = before.roster.selene;
    const tp = sel.tp;
    const cost = fieldCost(sel, 'moonlight');
    expect(cost).toBeGreaterThan(0);
    s.onAction('menu');
    pick(d.skills);
    expect(title(root)).toBe(d.castWho);
    expect(row(root, name('selene')).querySelector('.slx-right')!.textContent).toBe(`TP ${tp}/${statsOf(sel).tp}`);
    pick(name('selene'));
    expect(title(root)).toBe(d.castWhat(name('selene')));
    expect(row(root, SKILLS.moonlight.name).querySelector('.slx-right')!.textContent).toBe(T.cmd.tp(cost));
    pick(SKILLS.moonlight.name);
    expect(title(root)).toBe(d.castOn(SKILLS.moonlight.name));
    expect(labels(root)).toEqual(activeIds(before).filter((id) => before.roster[id].hp > 0).map(name));
    expect(row(root, name('noel')).querySelector('.slx-right')!.textContent).toBe(`HP 1/${statsOf(before.roster.noel).hp}`);
    pick(name('noel'));
    const healed = game.state.party.roster.noel.hp;
    expect(healed).toBeGreaterThan(1);
    expect(game.state.party.roster.selene.tp).toBe(tp - cost);
    expect(sfx.heal).toHaveBeenCalledTimes(1);
    expect(sfx.error).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-layer')).toBeNull();
    expect(text()).toBe([d.cast(name('selene'), SKILLS.moonlight.name), d.healed(name('noel'), healed - 1)].join('\n'));
    expect(d.healed('諾艾兒', 7)).toBe('諾艾兒回復了 7 HP。');
    expect(hpBar(root, 'noel')).toBe(String(healed));   // the party bar was refreshed
  });

  it('a skill short of TP is greyed out', () => {
    const { game, s, root, pick } = setup(undefined, true, {}, (g) => {
      seleneKnows('moonlight')(g);
      g.state.party.roster.selene.tp = 0;
      g.state.party.roster.noel.hp = 1;
    });
    s.onAction('menu');
    pick(d.skills);
    pick(name('selene'));
    const moon = row(root, SKILLS.moonlight.name);
    expect(moon.getAttribute('aria-disabled')).toBe('true');
    moon.click();
    expect(title(root)).toBe(d.castWhat(name('selene')));   // no target list opened
    expect(game.state.party.roster.noel.hp).toBe(1);
  });

  it('a revive is greyed out while nobody is down; with someone down it lists only the fallen and raises them', () => {
    const none = setup(undefined, true, {}, seleneKnows('moonlight', 'rebirth'));
    none.s.onAction('menu');
    none.pick(d.skills);
    none.pick(name('selene'));
    expect(row(none.root, SKILLS.rebirth.name).getAttribute('aria-disabled')).toBe('true');
    expect(row(none.root, SKILLS.moonlight.name).getAttribute('aria-disabled')).toBe('false');

    const t = setup(undefined, true, {}, (g) => { seleneKnows('moonlight', 'rebirth')(g); g.state.party.roster.noel.hp = 0; });
    t.s.onAction('menu');
    t.pick(d.skills);
    t.pick(name('selene'));
    t.pick(SKILLS.rebirth.name);
    expect(labels(t.root)).toEqual([name('noel')]);
    const tp = t.game.state.party.roster.selene.tp;
    const cost = fieldCost(t.game.state.party.roster.selene, 'rebirth');
    expect(cost).toBeGreaterThan(0);
    t.pick(name('noel'));
    expect(t.game.state.party.roster.noel.hp).toBeGreaterThan(0);
    expect(t.game.state.party.roster.selene.tp).toBe(tp - cost);
    expect(t.text()).toBe([d.cast(name('selene'), SKILLS.rebirth.name), d.revived(name('noel'))].join('\n'));
  });

  it('a whole-party heal casts without asking for a target', () => {
    const { game, s, root, sfx, text, pick } = setup(undefined, true, {}, (g) => {
      seleneKnows('moonlight', 'moon-rain')(g);
      g.state.party.roster.noel.hp = 1;
      g.state.party.roster.liz.hp = 1;
    });
    const tp = game.state.party.roster.selene.tp;
    const cost = fieldCost(game.state.party.roster.selene, 'moon-rain');
    s.onAction('menu');
    pick(d.skills);
    pick(name('selene'));
    pick(SKILLS['moon-rain'].name);
    expect(root.querySelector('.slx-layer')).toBeNull();
    const r = game.state.party.roster;
    expect(r.noel.hp).toBeGreaterThan(1);
    expect(r.liz.hp).toBeGreaterThan(1);
    expect(r.selene.tp).toBe(tp - cost);
    expect(sfx.heal).toHaveBeenCalledTimes(1);
    const lines = text().split('\n');
    expect(lines[0]).toBe(d.cast(name('selene'), SKILLS['moon-rain'].name));
    expect(lines).toContain(d.healed(name('noel'), r.noel.hp - 1));
    expect(lines).toContain(d.healed(name('liz'), r.liz.hp - 1));
  });

  it('a cast that helps nobody is refused with the reason, costs nothing and keeps the skill list open', () => {
    const { game, s, root, sfx, text, pick } = setup(undefined, true, {}, seleneKnows('moonlight', 'moon-rain'));
    const tp = game.state.party.roster.selene.tp;
    s.onAction('menu');
    pick(d.skills);
    pick(name('selene'));
    pick(SKILLS['moon-rain'].name);
    expect(sfx.error).toHaveBeenCalledTimes(1);
    expect(sfx.heal).not.toHaveBeenCalled();
    expect(text()).toBe(T.reasons['no-effect']);
    expect(game.state.party.roster.selene.tp).toBe(tp);
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(3);   // field menu, casters, skills: nothing was closed
    s.onAction('confirm');   // close the line
    expect(title(root)).toBe(d.castWhat(name('selene')));
    expect(labels(root)).toEqual([SKILLS.moonlight.name, SKILLS['moon-rain'].name]);
  });

  it('a refused cast on one member keeps the target list open, so another can be chosen', () => {
    const { game, s, root, sfx, text, pick } = setup(undefined, true, {}, (g) => { seleneKnows('moonlight')(g); g.state.party.roster.noel.hp = 1; });
    const sel = game.state.party.roster.selene;
    const tp = sel.tp;
    const cost = fieldCost(sel, 'moonlight');
    s.onAction('menu');
    pick(d.skills);
    pick(name('selene'));
    pick(SKILLS.moonlight.name);
    pick(name('scarlet'));   // at full HP: the heal would do nothing
    expect(sfx.error).toHaveBeenCalledTimes(1);
    expect(text()).toBe(T.reasons['no-effect']);
    expect(game.state.party.roster.selene.tp).toBe(tp);
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(4);   // field menu, casters, skills, targets
    s.onAction('confirm');   // close the line
    expect(title(root)).toBe(d.castOn(SKILLS.moonlight.name));
    pick(name('noel'));   // the same list: a member who needs it
    expect(game.state.party.roster.noel.hp).toBeGreaterThan(1);
    expect(game.state.party.roster.selene.tp).toBe(tp - cost);
    expect(sfx.heal).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.slx-layer')).toBeNull();   // a cast that lands closes the menu
  });

  it('a cast refused for TP keeps the target list open and says why', () => {
    const { game, s, root, sfx, text, pick } = setup(undefined, true, {}, (g) => { seleneKnows('moonlight')(g); g.state.party.roster.noel.hp = 1; });
    s.onAction('menu');
    pick(d.skills);
    pick(name('selene'));
    pick(SKILLS.moonlight.name);
    game.state.party.roster.selene.tp = 0;   // spent while the list was open
    pick(name('noel'));
    expect(sfx.error).toHaveBeenCalledTimes(1);
    expect(text()).toBe(T.reasons.tp);
    expect(game.state.party.roster.noel.hp).toBe(1);
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(4);
    s.onAction('confirm');   // close the line
    expect(title(root)).toBe(d.castOn(SKILLS.moonlight.name));
  });

  it('the skill flow works by keyboard, and Esc backs out one layer at a time', () => {
    const { game, s, root, sfx } = setup(undefined, true, {}, (g) => { seleneKnows('moonlight')(g); g.state.party.roster.noel.hp = 1; });
    const p = game.state.party;
    const selected = () => root.querySelector('.slx-layer:last-child [aria-selected=true] .slx-label')?.textContent;
    s.onAction('menu');
    expect(selected()).toBe(d.status);
    s.onAction('down');
    expect(selected()).toBe(d.skills);
    s.onAction('confirm');
    expect(title(root)).toBe(d.castWho);
    expect(selected()).toBe(name('selene'));
    s.onAction('confirm');
    expect(title(root)).toBe(d.castWhat(name('selene')));
    expect(selected()).toBe(SKILLS.moonlight.name);
    s.onAction('confirm');
    expect(title(root)).toBe(d.castOn(SKILLS.moonlight.name));
    const targets = activeIds(p).filter((id) => p.roster[id].hp > 0);
    expect(selected()).toBe(name(targets[0]));
    s.onAction('down');
    expect(selected()).toBe(name(targets[1]));
    s.onAction('cancel');
    expect(title(root)).toBe(d.castWhat(name('selene')));
    s.onAction('cancel');
    expect(title(root)).toBe(d.castWho);
    s.onAction('cancel');
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(1);
    expect(labels(root)).toContain(d.skills);   // back on the field menu
    expect(sfx.cancel).toHaveBeenCalledTimes(3);
    expect(p.roster.noel.hp).toBe(1);   // backing out cast nothing

    // Then all the way to a cast with the keys: the field menu kept its cursor on 技能.
    expect(selected()).toBe(d.skills);
    s.onAction('confirm');
    s.onAction('confirm');
    s.onAction('confirm');
    for (let i = 0; i < targets.indexOf('noel'); i++) s.onAction('down');
    expect(selected()).toBe(name('noel'));
    s.onAction('confirm');
    expect(game.state.party.roster.noel.hp).toBeGreaterThan(1);
    expect(root.querySelector('.slx-layer')).toBeNull();
  });

  it('equipment and formation open their screens and come back here', () => {
    for (const [label, scene] of [['裝備', 'equip'], ['隊形', 'formation']] as const) {
      const { s, go, root, pick } = setup();
      s.onAction('menu');
      pick(label);
      expect(go.mock.calls).toEqual([[scene]]);
      expect(root.querySelector('.slx-layer')).toBeNull();
      s.onAction('menu');   // the scene is on its way out: no menu opens behind it
      expect(root.querySelector('.slx-layer')).toBeNull();
    }
  });

  it('items reach only the members on the field', () => {
    const { game, s, root, pick } = setup(undefined, true, {}, (g) => {
      g.state.party = meet(g.state.party, 'bobby', 1);
      g.state.party.roster.bobby.hp = 1;
    });
    const p = game.state.party;
    expect(p.recruited).toContain('bobby');
    expect(activeIds(p)).not.toContain('bobby');   // met with five already on the field: on the bench, in town
    s.onAction('menu');
    pick(d.items);
    pick('回復藥');
    expect(labels(root)).toEqual(activeIds(p).map(name));
    expect(labels(root)).not.toContain(name('bobby'));
  });
});

describe('DungeonScene art (no placeholder)', () => {
  it("waits, up to the cap, for this floor's map art before drawing it", async () => {
    const { MAP_ART_WAIT_MS } = await import('./dungeon');
    const { mapArtUrls } = await import('../../render/artPaths');
    const whenReady = vi.fn(async () => {});
    const stage = { show: vi.fn(), mapView: { draw: vi.fn() } };
    const { game } = setup();
    const s = new DungeonScene({ game, art: { has: () => false, whenReady }, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true }, Infinity);
    await s.prepare!();
    expect(MAP_ART_WAIT_MS).toBe(1500);
    expect(whenReady).toHaveBeenCalledWith(mapArtUrls(game.terrain()), MAP_ART_WAIT_MS);
    const urls = mapArtUrls(1);
    expect(urls).toContain('/assets/games/starlantern/map/fog.png');
    expect(urls.some((u) => u.includes('/tiles/f1-floor'))).toBe(true);
    expect(urls.some((u) => u.includes('/map/party-'))).toBe(true);
  });
});

describe('DungeonScene tier badge (difficulty plan Task 7b)', () => {
  const enterOn = (tier: 'normal' | 'nightmare' | 'hell') => {
    const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
    game.state.dungeon.reached.mainline = 25;
    if (tier === 'hell') { game.state.story.finaleCleared = true; game.state.dungeon.bossKills['nightmare:mainline:25'] = 1; }
    expect(game.chooseTier(tier)).toMatchObject({ ok: true });
    expect(game.depart({ region: 'mainline', condition: 'fog' }, 10)).toEqual({ ok: true });
    const root = document.createElement('div');
    const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
    new DungeonScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: null, fast: true }, Infinity).enter(root);
    return root;
  };
  const top = (root: HTMLElement) => [...root.querySelector('.slx-dungeon')!.children].map((c) => c.className);

  it('the floor shows its tier beside the condition', () => {
    for (const tier of ['nightmare', 'hell'] as const) {
      const root = enterOn(tier);
      const badge = root.querySelector<HTMLElement>('.slx-tier-badge')!;
      expect(badge.textContent, tier).toBe(T.ui2.tier.names[tier]);
      expect(badge.getAttribute('aria-label'), tier).toBe(T.ui2.tier.badgeLabel(T.ui2.tier.names[tier]));
      // One row with the condition badge, the condition first; its tooltip still answers to it.
      const row = badge.parentElement!;
      expect(row.classList.contains('slx-run-badges')).toBe(true);
      expect([...row.children].map((c) => c.classList.contains('slx-condition') ? 'condition' : c.classList.contains('slx-tier-badge') ? 'tier' : c.className)).toEqual(['condition', 'tier']);
      expect(root.querySelector('.slx-condition')!.textContent).toBe(CONDITIONS.fog.name);
      expect(root.querySelector('.slx-condition')!.getAttribute('aria-describedby')).toBe(root.querySelector('.slx-condition-tip')!.id);
    }
  });

  it('a Normal floor has no tier badge and the screen it always had', () => {
    const root = enterOn('normal');
    expect(root.querySelector('.slx-tier-badge')).toBeNull();
    expect(root.querySelector('.slx-run-badges')).toBeNull();
    const plain = setup({ region: 'mainline', condition: 'fog' }).root;
    expect(top(root)).toEqual(top(plain));
    expect(top(root).slice(0, 3)).toEqual(['slx-win slx-floorname', 'slx-win slx-condition slx-cond-fog', 'slx-win slx-condition-tip']);
  });
});

describe('DungeonScene: the guild board in the labyrinth (guild quests plan Task B4)', () => {
  const B = T.ui2.board;
  /** The first act over and quests held: a scout of the main road to depth 2, a hunt of six slimes, a delivery of moss. */
  const holding = (g: Game) => {
    const day = dayOf(g.state);
    g.state.story.act1Cleared = true;
    const base = { giver: 'glen' as const, variant: 0 as const, depth: 2, reward: { gold: 70 }, merit: 3, base: 0 };
    g.state.guild = { day, offers: [], merit: 0, paid: 0, active: [
      { ...base, id: `${day}:0`, kind: 'scout', target: 'mainline', n: 2 },
      { ...base, id: `${day}:1`, kind: 'hunt', giver: 'marta', target: 'slime', n: 6 },
      { ...base, id: `${day}:2`, kind: 'deliver', giver: 'orik', target: 'moss', n: 8 },
    ] };
    g.state.inventory.moss = 3;
  };
  const toStairs = (t: ReturnType<typeof setup>) => {
    const down = t.game.map().down!;
    const dir = (['up', 'down', 'left', 'right'] as const).find((d) => tileAt(t.game.map(), { x: down.x - DELTA[d].x, y: down.y - DELTA[d].y }) !== 'wall')!;
    t.game.pos = { x: down.x - DELTA[dir].x, y: down.y - DELTA[dir].y };
    t.s.onAction(dir);
  };
  const ids = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.slx-layer:last-child [role=option]')].map((o) => o.dataset.id);

  it("a scout's goal follows the floor name, said once", () => withGuildLive(() => {
    const t = setup(undefined, true, {}, holding);
    t.game.state.party.roster.scarlet.level = 6;
    toStairs(t);
    t.pick('前往');
    expect(t.game.floor).toBe(2);
    expect(t.text()).toBe(`第 2 層　水晶洞窟\n${B.done(B.row(B.kinds.scout, B.depthAt(B.main, 2)))}`);
    expect(t.game.scoutDone ?? []).toEqual([]);   // read and cleared
  }));

  it('no scout finished: the floor name alone', () => withGuildLive(() => {
    const t = setup(undefined, true, {}, (g) => { holding(g); g.state.guild!.active[0].n = 3; });
    t.game.state.party.roster.scarlet.level = 6;
    toStairs(t);
    t.pick('前往');
    expect(t.text()).toBe('第 2 層　水晶洞窟');
  }));

  it('the field menu shows the quests read-only once the board is open', () => withGuildLive(() => {
    const t = setup(undefined, true, {}, holding);
    t.s.onAction('menu');
    expect(ids(t.root)).toEqual(['status', 'skills', 'items', 'equip', 'workshop', 'formation', 'lamp', 'condition', 'handbook', 'settings', 'quests', 'close']);
    expect(ids(t.root)).toHaveLength(12);   // FIELD_MENU_ROWS: all of it on screen, no ▼
    expect(t.root.querySelector('.slx-layer:last-child .slx-more-down')).toBeNull();
    t.pick(B.title);
    const rows = [...t.root.querySelectorAll('.slx-layer:last-child [role=option]')];
    expect(rows.map((r) => r.querySelector('.slx-label')!.textContent)).toEqual([
      B.row(B.kinds.scout, B.depthAt(B.main, 2)), B.row(B.kinds.hunt, B.count('苔蘚史萊姆', 6)), B.row(B.kinds.deliver, B.count('發光苔', 8)),
    ]);
    expect(rows.map((r) => r.querySelector('.slx-right')!.textContent)).toEqual([B.deepest(1, 2), B.progress(0, 6), B.held(3, 8)]);
    expect(t.root.querySelector('.slx-layer:last-child')!.textContent).toContain(B.fieldNote);
    t.s.onAction('confirm');   // read only: nothing happens
    expect(t.game.state.guild!.active).toHaveLength(3);
    t.s.onAction('cancel');
    expect(ids(t.root)).toContain('quests');   // back on the field menu
  }));

  it('no delivery held: no note about the stock', () => withGuildLive(() => {
    const t = setup(undefined, true, {}, (g) => { holding(g); g.state.guild!.active.pop(); });
    t.s.onAction('menu');
    t.pick(B.title);
    expect(t.root.querySelector('.slx-layer:last-child')!.textContent).not.toContain(B.fieldNote);
  }));

  it('nothing held: one greyed line', () => withGuildLive(() => {
    const t = setup(undefined, true, {}, (g) => { holding(g); g.state.guild!.active = []; });
    t.s.onAction('menu');
    t.pick(B.title);
    const rows = [...t.root.querySelectorAll('.slx-layer:last-child [role=option]')];
    expect(rows.map((r) => r.textContent)).toEqual([B.emptyActive]);
    expect(rows[0].getAttribute('aria-disabled')).toBe('true');
  }));

  it('the field menu keeps its eleven while the board is shut, or open but locked', () => {
    const eleven = ['status', 'skills', 'items', 'equip', 'workshop', 'formation', 'lamp', 'condition', 'handbook', 'settings', 'close'];
    const off = setup(undefined, true, {}, holding);
    off.s.onAction('menu');
    expect(ids(off.root)).toEqual(eleven);
    withGuildLive(() => {
      const locked = setup(undefined, true, {}, holding);
      locked.s.onAction('menu');
      expect(ids(locked.root)).toEqual(eleven);
    }, { open: false });
    withGuildLive(() => {
      const early = setup(undefined, true, {}, (g) => { holding(g); g.state.story.act1Cleared = false; });
      early.s.onAction('menu');
      expect(ids(early.root)).toEqual(eleven);
    });
  });
});
