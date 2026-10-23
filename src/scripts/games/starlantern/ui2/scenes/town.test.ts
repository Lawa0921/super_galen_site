import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { art } from '../../render/artPaths';
import type { ItemInstance } from '../../engine/types';
import { TownScene } from './town';
import { CHARACTERS } from '../../data/characters';
import type { SceneId } from '../../data/story/scenes';
import { NPC_NAMES, STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { DEFAULT_SETTINGS, type StoryMode } from '../settings';
import { linesOf } from '../story';
import { sceneDone } from '../../engine/story/events';

describe('TownScene', () => {
  it('shows place, gold and the facility menu with a greeting', () => {
    const game = new Game(constRng(0.5), null);
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    expect(root.querySelector('.slx-place')!.textContent).toBe('邊境小鎮 露米亞');
    expect(root.querySelector('.slx-gold')!.textContent).toBe('150 G');
    expect([...root.querySelectorAll('[role=option]')].map((o) => o.textContent)).toEqual(['冒險者公會', '道具店', '旅館', '傳送門廣場', '鍛造屋', '冒險者手冊', '設定']);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent!.length).toBeGreaterThan(0);
  });

  it('enters a facility or settings, and asks before returning to the title on cancel', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');               // greeting closes
    s.onAction('confirm');               // 冒險者公會
    expect(go).toHaveBeenCalledWith('guild');
    for (let i = 0; i < 6; i++) s.onAction('down');
    s.onAction('confirm');               // 設定
    expect(go).toHaveBeenCalledWith('settings');
    s.onAction('cancel');
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('標題');
    expect(root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
    s.onAction('confirm');               // 否
    expect(root.querySelector('.slx-confirm')).toBeNull();
    expect(go).not.toHaveBeenCalledWith('title');
    s.onAction('cancel'); s.onAction('up'); s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('title');
  });

  it('the town menu opens the handbook', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');               // greeting closes
    (([...root.querySelectorAll('[role=option]')] as HTMLElement[]).find((o) => o.textContent === T.ui2.town.facilities.handbook))!.click();
    expect(go).toHaveBeenCalledWith('handbook');
  });
});

describe('TownScene pointer', () => {
  it('ignores a facility click while the greeting is still on screen', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    const line = root.querySelector('.slx-talk .slx-text')!.textContent;
    (root.querySelector('[data-id=guild]') as HTMLElement).click();
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe(line);
    expect(go).not.toHaveBeenCalled();
  });
});

describe('TownScene mouse', () => {
  it('has a 返回 control that asks before going back to the title once the greeting is closed', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    (root.querySelector('.slx-talk') as HTMLElement).click();
    (root.querySelector('.slx-back') as HTMLElement).click();
    (root.querySelector('.slx-confirm [data-id=yes]') as HTMLElement).click();
    expect(go).toHaveBeenCalledWith('title');
  });

  it('鍛造屋 opens the forge', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');               // greeting closes
    for (let i = 0; i < 4; i++) s.onAction('down');
    s.onAction('confirm');               // 鍛造屋
    expect(go).toHaveBeenCalledWith('forge');
  });
});

describe('TownScene notices', () => {
  it('tells the player about a wipe before anything else and clears the notice', () => {
    const game = new Game(constRng(0.5), null);
    game.notice = 'wipe';
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('全滅……冒險背包遺失在迷宮裡，身上的金幣也少了四分之一。');
    expect(game.notice).toBeNull();
  });

  it('says who stopped following her build, after any other notice (plan 8h Task 6)', () => {
    const game = new Game(constRng(0.5), null);
    game.followEnded = ['noel', 'liz'];
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe(T.build.followEnded([CHARACTERS.noel.name, CHARACTERS.liz.name]));
    expect(game.followEnded).toEqual([]);
  });

  it('greets with what came home, mentions the lamp, and clears the haul', () => {
    const game = new Game(constRng(0.5), null);
    game.notice = 'lamp';
    game.banked = { items: { potion: 2, 'old-coin': 3 }, gold: 120, viaLamp: true, gear: [], overflow: [] };
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('歸還之燈的光芒把隊伍帶回了城鎮。帶回了：回復藥 ×2、古代銀幣 ×3、120 G。');
    expect(game.banked).toBeNull();
    expect(game.notice).toBeNull();
  });

  it('greets a walk home the same way, without the lamp', () => {
    const game = new Game(constRng(0.5), null);
    game.notice = 'banked';
    game.banked = { items: {}, gold: 40, viaLamp: false, gear: [], overflow: [] };
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('平安回城。帶回了：40 G。');
    expect(game.banked).toBeNull();
  });
});

describe("TownScene: the day's line after a return (staging S2)", () => {
  const open = (game: Game) => {
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    const text = () => root.querySelector('.slx-talk .slx-text')!.textContent;
    const menu = () => root.querySelector('.slx-town-menu') as HTMLElement;
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return { s, root, text, menu, settle };
  };
  const counted = () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = [];
    const rng = vi.fn(() => 0.5);
    Object.assign(game, { rng });
    return { game, rng };
  };

  it('a walk home says what came home, then the day line, without a draw from the game rng', async () => {
    const { game, rng } = counted();
    game.notice = 'banked';
    game.banked = { items: {}, gold: 40, viaLamp: false, gear: [], overflow: [] };
    const t = open(game);
    expect(t.text()).toBe('平安回城。帶回了：40 G。');
    t.s.onAction('confirm'); await t.settle();
    expect(STORY.townLines.prologue).toContain(t.text());
    expect(t.menu().hasAttribute('inert')).toBe(true);    // the menu waits for the day line too
    t.s.onAction('confirm'); await t.settle();
    expect(t.menu().hasAttribute('inert')).toBe(false);
    expect(rng).not.toHaveBeenCalled();
  });

  it('the lamp and a wipe are returns too: the day line follows them', async () => {
    for (const notice of ['lamp', 'wipe'] as const) {
      const { game } = counted();
      game.notice = notice;
      const t = open(game);
      expect(t.text()).toBe(T.notices[notice]);
      t.s.onAction('confirm'); await t.settle();
      expect(STORY.townLines.prologue, notice).toContain(t.text());
    }
  });

  it("Rin's lines can come after a notice too (the act 2 pool, not only the town's)", async () => {
    const said = new Set<string>();
    for (let gold = 0; gold < 40; gold++) {
      const { game } = counted();
      game.state.story.nodes.push('act2');
      game.state.gold = gold;
      game.notice = 'banked';
      game.banked = { items: {}, gold: 1, viaLamp: false, gear: [], overflow: [] };
      const t = open(game);
      t.s.onAction('confirm'); await t.settle();
      said.add(t.text()!);
    }
    expect([...said].some((x) => (STORY.rinLines.act2 ?? []).includes(x))).toBe(true);
    expect([...said].every((x) => [...STORY.townLines.act2, ...(STORY.rinLines.act2 ?? [])].includes(x))).toBe(true);
  });

  it('who stopped following a build is said after the notice, and the day line still comes last', async () => {
    const { game } = counted();
    game.notice = 'banked';
    game.banked = { items: {}, gold: 40, viaLamp: false, gear: [], overflow: [] };
    game.followEnded = ['noel'];
    const t = open(game);
    t.s.onAction('confirm'); await t.settle();
    expect(t.text()).toBe(T.build.followEnded([CHARACTERS.noel.name]));
    t.s.onAction('confirm'); await t.settle();
    expect(STORY.townLines.prologue).toContain(t.text());
  });

  it('a save notice is not a return: no day line after it', async () => {
    const { game, rng } = counted();
    game.notice = 'saved';
    const t = open(game);
    expect(t.text()).toBe(T.notices.saved);
    t.s.onAction('confirm'); await t.settle();
    expect(t.menu().hasAttribute('inert')).toBe(false);
    expect(rng).not.toHaveBeenCalled();
  });

  it('with no notice the day line is drawn from the game rng as before, once', () => {
    const { game, rng } = counted();
    const t = open(game);
    expect(STORY.townLines.prologue).toContain(t.text());
    expect(rng).toHaveBeenCalledTimes(1);
  });
});

describe('TownScene banked gear', () => {
  const gearOf = (uid: number, base: string, rarity: ItemInstance['rarity']): ItemInstance => ({ uid, base, rarity, ilvl: 3, affixes: [], enhance: 0 });
  const enter = (game: Game, artIdx: ArtIndex = NO_ART) => {
    const root = document.createElement('div');
    new TownScene({ game, art: artIdx, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity).enter(root);
    return root;
  };

  it('names the gear that came home in its rarity colour', () => {
    const game = new Game(constRng(0.5), null);
    game.notice = 'banked';
    game.banked = { items: {}, gold: 40, viaLamp: false, gear: [gearOf(1, 'iron-sword', 'rare')], overflow: [] };
    const root = enter(game);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('平安回城。帶回了：鐵劍・稀有、40 G。');
    expect(root.querySelector('.slx-talk .slx-text .slx-rarity-rare')!.textContent).toBe('鐵劍・稀有');
  });

  it('the gear that came home and the gear lost show their gear icon when published', () => {
    const game = new Game(constRng(0.5), null);
    game.notice = 'banked';
    game.banked = { items: {}, gold: 0, viaLamp: false, gear: [gearOf(1, 'iron-sword', 'rare'), gearOf(4, 'leather-vest', 'magic')], overflow: [gearOf(2, 'hunter-bow', 'magic')] };
    const root = enter(game, { has: (u) => u === art.gear('iron-sword') || u === art.gear('hunter-bow') });
    const text = root.querySelector('.slx-talk .slx-text')!;
    expect([...text.querySelectorAll('img.slx-gear-ico')].map((i) => i.getAttribute('src'))).toEqual([art.gear('iron-sword'), art.gear('hunter-bow')]);
    expect(text.querySelector('img')!.nextElementSibling!.textContent).toBe('鐵劍・稀有');
  });

  it('says plainly which gear was lost because the bag was full', () => {
    const game = new Game(constRng(0.5), null);
    game.notice = 'banked';
    game.banked = { items: {}, gold: 0, viaLamp: false, gear: [gearOf(1, 'iron-sword', 'rare')], overflow: [gearOf(2, 'hunter-bow', 'magic'), gearOf(3, 'cloth-robe', 'common')] };
    const root = enter(game);
    const text = root.querySelector('.slx-talk .slx-text')!.textContent!;
    expect(text).toContain('背包已滿（60 件），沒能帶回：獵弓・魔法、布袍。');
    expect(root.querySelector('.slx-talk .slx-text .slx-rarity-magic')!.textContent).toBe('獵弓・魔法');
  });
});

describe('TownScene story', () => {
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const open = (game: Game, story: StoryMode = 'all', rng?: () => number) => {
    if (rng) Object.assign(game, { rng });
    const root = document.createElement('div');
    const settings = { get: () => ({ ...DEFAULT_SETTINGS, story }) };
    const go = vi.fn();
    const s = new TownScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), settings }, Infinity);
    s.enter(root);
    const menu = () => root.querySelector('.slx-town-menu') as HTMLElement;
    const text = () => root.querySelector('.slx-talk .slx-text')!.textContent;
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return { root, s, go, menu, text, settle };
  };
  const firstLine = (id: SceneId, game: Game) => linesOf(id, game.state)[0].text;

  it('arrival scenes play before the menu', async () => {
    const game = Game.fresh(constRng(0.5), null);
    expect(game.arrival).toEqual(['prologue', 'prologue-inn']);
    const t = open(game);
    expect(t.menu().hasAttribute('inert')).toBe(true);
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(true);
    expect(t.root.querySelector('.slx-back')!.classList.contains('slx-cmd-hidden')).toBe(true);   // 返回 is not offered over a scene
    expect(t.text()).toBe(firstLine('prologue', game));
    for (let i = 0; i < linesOf('prologue', game.state).length; i++) { t.s.onAction('confirm'); await t.settle(); }
    // The inn night follows at once: still no menu, no 返回 (Task 10b).
    expect(t.text()).toBe(firstLine('prologue-inn', game));
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(true);
    expect(t.root.querySelector('.slx-back')!.classList.contains('slx-cmd-hidden')).toBe(true);
    for (let i = 0; i < linesOf('prologue-inn', game.state).length; i++) { t.s.onAction('confirm'); await t.settle(); }
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);   // the town's own line is up now
    expect(t.root.querySelector('.slx-back')!.classList.contains('slx-cmd-hidden')).toBe(false);
    t.s.onAction('confirm');
    expect(t.menu().hasAttribute('inert')).toBe(false);
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);
    expect(game.state.story.seen).toEqual(['prologue', 'prologue-inn']);
    expect(game.arrival).toEqual([]);
  });

  it('a scene hides the town HUD (place name and gold) while it plays, and the day line brings it back (staging S1)', async () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = ['act1-after'];
    game.state.story.queue = ['act1-after'];
    const t = open(game);
    const place = t.root.querySelector('.slx-place')!, gold = t.root.querySelector('.slx-gold')!;
    expect(place.classList.contains('slx-cmd-hidden')).toBe(true);
    expect(gold.classList.contains('slx-cmd-hidden')).toBe(true);
    for (let i = 0; i < linesOf('act1-after', game.state).length; i++) { t.s.onAction('confirm'); await t.settle(); }
    expect(place.classList.contains('slx-cmd-hidden')).toBe(false);
    expect(gold.classList.contains('slx-cmd-hidden')).toBe(false);
  });

  it('cancel skips a scene, records it, and the next one plays', async () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = ['prologue', 'act1-after'];
    game.state.story.queue = ['prologue', 'act1-after'];
    const t = open(game);
    t.s.onAction('cancel');
    await t.settle();
    expect(t.text()).toContain('（略過）');
    t.s.onAction('confirm');
    await t.settle();
    expect(game.state.story.seen).toContain('prologue');
    expect(t.text()).toBe(firstLine('act1-after', game));
    expect(t.menu().hasAttribute('inert')).toBe(true);
    t.s.onAction('cancel'); await t.settle(); t.s.onAction('confirm'); await t.settle();
    expect(game.state.story.seen).toEqual(expect.arrayContaining(['prologue', 'act1-after']));
    expect(t.menu().hasAttribute('inert')).toBe(true);   // the day's greeting is up now
    t.s.onAction('confirm');
    expect(t.menu().hasAttribute('inert')).toBe(false);
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);
  });

  it('story set to none plays nothing and marks every scene new', async () => {
    const game = Game.fresh(constRng(0.5), null);
    const t = open(game, 'none');
    await t.settle();
    expect(t.text()).not.toBe(firstLine('prologue', game));
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);
    t.s.onAction('confirm');
    expect(t.menu().hasAttribute('inert')).toBe(false);
    expect(game.state.story.fresh).toContain('prologue');
    expect(game.state.story.seen).toContain('prologue');
  });

  it('major only plays the reveal but not a chat', async () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = ['chat:liz:1', 'act2'];
    game.state.story.queue = ['act2'];
    game.pending = ['chat:liz:1'];
    const t = open(game, 'major');
    await t.settle();
    expect(t.text()).toBe(firstLine('act2', game));
    expect(game.state.story.fresh).toContain('chat:liz:1');
    expect(game.state.story.fresh).not.toContain('act2');
  });

  it('town lines follow the stage', () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = [];
    game.state.story.nodes.push('act2');
    const t = open(game);
    expect([...STORY.townLines.act2, ...(STORY.rinLines.act2 ?? [])]).toContain(t.text());
  });

  it('Rin foreshadowing joins the town lines from act 2', () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = [];
    game.state.story.nodes.push('act2');
    const t = open(game, 'all', () => 0.999);
    expect(t.text()).toBe(STORY.rinLines.act2![STORY.rinLines.act2!.length - 1]);
    expect(t.root.querySelector('.slx-talk .slx-name')!.textContent).toBe(CHARACTERS.rin.name);
  });

  it('Rin says nothing in the town before act 2', () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = [];
    const t = open(game, 'all', () => 0.999);
    expect(STORY.townLines.prologue).toContain(t.text());
    expect(t.root.querySelector('.slx-talk .slx-name')!.textContent).not.toBe(CHARACTERS.rin.name);
  });

  it("the town's own day line is narration, with no name plate (story polish ruling 8)", () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = [];
    const t = open(game, 'all', () => 0);   // the pool's first line: the town's own
    expect(t.text()).toBe(STORY.townLines.prologue[0]);
    const plate = t.root.querySelector('.slx-talk .slx-name') as HTMLElement;
    expect(plate.hidden || plate.textContent === '').toBe(true);
    expect(plate.textContent).not.toBe('露米亞');
  });

  it('after her choice Rin speaks her oath lines', () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = [];
    game.state.story.nodes.push('act2');
    game.state.party.recruited.push('rin');
    Object.assign(game.state.party.roster.rin, { memories: 7, oath: true });
    // Sweep the rng across the whole pool: everything Rin says is from the oath set, none from the old one.
    const rin: string[] = [];
    for (let i = 0; i < 60; i++) {
      const t = open(game, 'all', () => i / 60);
      if (t.root.querySelector('.slx-talk .slx-name')!.textContent === CHARACTERS.rin.name) rin.push(t.text()!);
    }
    expect(rin.length).toBeGreaterThan(0);
    expect(rin.every((x) => STORY.rinOath.includes(x))).toBe(true);
    expect(rin.some((x) => (STORY.rinLines.act2 ?? []).includes(x))).toBe(false);
  });

  it('the bellkeeper speaks only after her choice, and differently after the finale', () => {
    /** Everything the town can say on a return: sweep the rng across the whole pool. */
    const said = (game: Game) => {
      const out: { who: string; text: string }[] = [];
      for (let i = 0; i < 60; i++) {
        const t = open(game, 'all', () => i / 60);
        out.push({ who: t.root.querySelector('.slx-talk .slx-name')!.textContent!, text: t.text()! });
      }
      return out;
    };
    const fresh = (oath: boolean) => {
      const g = Game.fresh(constRng(0.5), null);
      g.arrival = [];
      g.state.story.nodes.push('act2', 'act3', 'act4');
      g.state.story.act1Cleared = true;
      g.state.party.recruited.push('rin');
      if (oath) Object.assign(g.state.party.roster.rin, { memories: 7, oath: true });
      if (oath) g.state.story.seen.push('bellkeeper-arrives');   // he has come to town (final review I-1)
      return g;
    };
    const keeper = (g: Game) => said(g).filter((x) => x.who === NPC_NAMES.bellkeeper).map((x) => x.text);
    expect(keeper(fresh(false))).toEqual([]);
    const chose = keeper(fresh(true));
    expect(chose.length).toBeGreaterThan(0);
    expect(chose.every((x) => STORY.bellkeeper.oath.some((l) => l.text === x))).toBe(true);   // story depth Task 4: KeeperLine
    const done = fresh(true);
    done.state.story.finaleCleared = true;
    const after = keeper(done);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((x) => STORY.bellkeeper.after.includes(x))).toBe(true);

    // Final review I-1: her choice queues his arrival (story depth Task 3: once she has confessed); until that scene has
    // played he is not in town, however often the town's day line is drawn in this stay.
    const waiting = fresh(false);
    Object.assign(waiting.state.party.roster.rin, { memories: 7 });
    waiting.state = sceneDone(waiting.state, 'rin-reveal', 'played');
    expect(waiting.state.party.roster.rin.oath).toBe(true);
    expect(keeper(waiting)).toEqual([]);
    waiting.state = sceneDone(waiting.state, 'rin-confess', 'played');
    expect(waiting.state.story.queue).toContain('bellkeeper-arrives');
    expect(keeper(waiting)).toEqual([]);
    waiting.state = sceneDone(waiting.state, 'bellkeeper-arrives', 'played');
    expect(keeper(waiting).length).toBeGreaterThan(0);
  });

  it('a scene that throws does not lock the town: the menu comes back and the day line shows', async () => {
    const game = Game.fresh(constRng(0.5), null);
    vi.spyOn(game, 'sceneDone').mockImplementation(() => { throw new Error('boom'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = open(game);
    t.s.onAction('cancel');            // skip the scene: the summary shows
    await t.settle();
    t.s.onAction('confirm');           // recording it throws
    await t.settle(); await t.settle();
    expect(err).toHaveBeenCalled();
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);
    t.s.onAction('confirm');           // the day line closes
    expect(t.menu().hasAttribute('inert')).toBe(false);
    err.mockRestore();
  });
});
