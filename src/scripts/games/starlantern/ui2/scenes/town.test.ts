import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { art } from '../../render/artPaths';
import type { ItemInstance } from '../../engine/types';
import { TownScene } from './town';
import { CHARACTERS } from '../../data/characters';
import { ACT_DEPTHS, type SceneId } from '../../data/story/scenes';
import { NIGHT_BEATS, NPC_NAMES, STORY, type ScriptLine, flatLines } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { DEFAULT_SETTINGS, type StoryMode } from '../settings';
import { BONDS_WRITTEN } from '../../data/story/scenes';
import { linesOf } from '../story';
import { sceneDone } from '../../engine/story/events';
import { meet } from '../../engine/party';
import type { CharacterId } from '../../engine/types';

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
  const firstLine = (id: SceneId, game: Game) => flatLines(linesOf(id, game.state))[0].text;

  it('arrival scenes play before the menu', async () => {
    const game = Game.fresh(constRng(0.5), null);
    expect(game.arrival).toEqual(['prologue', 'prologue-inn']);
    const t = open(game);
    expect(t.menu().hasAttribute('inert')).toBe(true);
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(true);
    expect(t.root.querySelector('.slx-back')!.classList.contains('slx-cmd-hidden')).toBe(true);   // 返回 is not offered over a scene
    expect(t.text()).toBe(firstLine('prologue', game));
    for (let i = 0; i < flatLines(linesOf('prologue', game.state)).length; i++) { t.s.onAction('confirm'); await t.settle(); }
    // The inn night follows at once: still no menu, no 返回 (Task 10b).
    expect(t.text()).toBe(firstLine('prologue-inn', game));
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(true);
    expect(t.root.querySelector('.slx-back')!.classList.contains('slx-cmd-hidden')).toBe(true);
    for (let i = 0; i < flatLines(linesOf('prologue-inn', game.state)).length; i++) { t.s.onAction('confirm'); await t.settle(); }
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
    for (let i = 0; i < flatLines(linesOf('act1-after', game.state)).length; i++) { t.s.onAction('confirm'); await t.settle(); }
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

// story L Task 8: the pool is written now; a test that sets its own (or none) gets the written one back after it
const WRITTEN_BEATS = [...NIGHT_BEATS.lines];
describe('TownScene: the night (story L Task 3c)', () => {
  afterEach(() => { NIGHT_BEATS.lines.splice(0, NIGHT_BEATS.lines.length, ...WRITTEN_BEATS); });
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const open = (game: Game, story: StoryMode = 'all') => {
    const root = document.createElement('div');
    const settings = { get: () => ({ ...DEFAULT_SETTINGS, story }) };
    const s = new TownScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), settings }, Infinity);
    s.enter(root);
    const menu = () => root.querySelector('.slx-town-menu') as HTMLElement;
    const text = () => root.querySelector('.slx-talk .slx-text')!.textContent;
    const plate = () => root.querySelector('.slx-talk .slx-name')!.textContent;
    const card = () => root.querySelector('.slx-place-card')?.textContent ?? null;
    const night = () => !!root.querySelector('.slx-veil-night.slx-on');
    const settle = () => new Promise((r) => setTimeout(r, 0));
    /** Confirm through `id`'s lines, checking each is up in turn. */
    const through = async (id: SceneId, each?: () => void) => {
      for (const l of flatLines(linesOf(id, game.state))) {
        expect(text()).toBe(l.text);
        each?.();
        s.onAction('confirm'); await settle();
      }
    };
    return { root, s, menu, text, plate, card, night, settle, through };
  };
  /** A game in town with the opening behind it, `ids` met and holding those pieces untold. */
  const setup = (ids: SceneId[]) => {
    const game = Game.fresh(constRng(0.5), null);
    game.state.story.queue = [];
    game.state.story.seen = ['prologue', 'prologue-inn'];
    game.arrival = [];
    for (const id of ids) {
      const [, c, k] = id.split(':') as [string, CharacterId, string];
      if (!game.state.party.recruited.includes(c)) game.state.party = meet(game.state.party, c, 1);
      game.state.party.roster[c].memories = Math.max(game.state.party.roster[c].memories ?? 0, Number(k));
    }
    game.state.story.untold = [...ids];
    return game;
  };
  const withBeats = async (lines: ScriptLine[], fn: () => Promise<void>) => {
    NIGHT_BEATS.lines.splice(0, NIGHT_BEATS.lines.length, ...lines);
    try { await fn(); } finally { NIGHT_BEATS.lines.splice(0); }
  };

  it("the night plays after the day's lines, under the night card", async () => {
    const game = setup(['mem:liz:1']);
    game.state.story.queue = ['act1-after'];
    game.arrival = ['act1-after'];
    game.night = ['mem:liz:1'];
    game.state.story.tonight = ['mem:liz:1'];
    game.notice = 'banked';
    game.banked = { items: {}, gold: 40, viaLamp: false, gear: [], overflow: [] };
    const t = open(game);
    await t.through('act1-after');
    expect(t.text()).toBe('平安回城。帶回了：40 G。');
    expect(t.card()).toBeNull();
    t.s.onAction('confirm'); await t.settle();
    expect(t.text()).not.toBe(flatLines(linesOf('mem:liz:1', game.state))[0].text);   // the day's line, before the night
    expect([t.card(), t.night()]).toEqual([null, false]);
    t.s.onAction('confirm'); await t.settle();
    await t.through('mem:liz:1', () => {
      expect([t.card(), t.night()]).toEqual(['月影旅館・夜', true]);
      expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(true);
      expect(t.root.querySelector('.slx-place')!.classList.contains('slx-cmd-hidden')).toBe(true);
    });
    expect([t.card(), t.night()]).toEqual([null, false]);
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);
    expect(t.menu().hasAttribute('inert')).toBe(false);
    expect(game.state.story.seen).toContain('mem:liz:1');
    expect(game.state.story.untold).toEqual([]);
    expect(game.night).toEqual([]);
  });

  it("a beat sits between two night memories, with its speaker's plate", async () => {
    await withBeats([{ who: 'selene', text: '水燒好了。' }, { who: 'narrator', text: '窗外起風了。' }], async () => {
      const game = setup(['mem:liz:1', 'mem:noel:1']);
      game.state.party = meet(game.state.party, 'selene', 1);
      game.night = ['mem:liz:1', 'mem:noel:1'];
      game.state.story.tonight = [...game.night];
      const t = open(game);
      t.s.onAction('confirm'); await t.settle();   // the day's line
      await t.through('mem:liz:1');
      expect(t.text()).toBe('水燒好了。');
      expect(t.plate()).toBe(CHARACTERS.selene.name);
      expect([t.card(), t.night()]).toEqual(['月影旅館・夜', true]);
      expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(true);
      expect(game.state.story.beat).toBe(1);
      t.s.onAction('confirm'); await t.settle();
      await t.through('mem:noel:1', () => expect(t.card()).toBe('月影旅館・夜'));
      expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);
      expect(game.state.story.seen).toEqual(expect.arrayContaining(['mem:liz:1', 'mem:noel:1']));
    });
  });

  it('owed pieces play first under the night card, then the act with its own card', async () => {
    await withBeats([{ who: 'narrator', text: '窗外起風了。' }], async () => {
      const game = setup(['mem:hero:3', 'mem:rin:2']);
      game.state.story.queue = ['act2'];
      game.arrival = ['mem:hero:3', 'mem:rin:2', 'act2'];
      game.state.story.tonight = ['mem:hero:3', 'mem:rin:2'];
      const t = open(game);
      await t.through('mem:hero:3', () => expect([t.card(), t.night()]).toEqual(['月影旅館・夜', true]));
      // no beat between the owed ones: they lead into the act
      await t.through('mem:rin:2', () => expect(t.card()).toBe('月影旅館・夜'));
      expect(t.text()).toBe(flatLines(linesOf('act2', game.state))[0].text);
      expect(t.card()).toBe(flatLines(linesOf('act2', game.state))[0].place!.text);
      expect(game.state.story.beat).toBeUndefined();
    });
  });

  it("the reveal's night: Rin's pieces, then the reveal, then the day's line", async () => {
    const game = setup(['mem:rin:6', 'mem:rin:7']);
    game.state.story.seen.push('mem:rin:1', 'mem:rin:2', 'mem:rin:3', 'mem:rin:4', 'mem:rin:5');
    game.state.story.queue = ['rin-reveal'];
    game.arrival = ['mem:rin:6', 'mem:rin:7', 'rin-reveal'];
    game.state.story.tonight = ['mem:rin:6', 'mem:rin:7'];
    const t = open(game);
    await t.through('mem:rin:6', () => expect(t.card()).not.toBeNull());
    await t.through('mem:rin:7');
    await t.through('rin-reveal');
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);   // the day's line is up
    expect(t.card()).toBeNull();
    expect(game.state.story.seen).toEqual(expect.arrayContaining(['mem:rin:6', 'mem:rin:7', 'rin-reveal']));
    t.s.onAction('confirm');
    expect(t.menu().hasAttribute('inert')).toBe(false);
  });

  it('the story setting skips the night but keeps it new', async () => {
    const game = setup(['mem:liz:1']);
    game.night = ['mem:liz:1'];
    game.state.story.tonight = ['mem:liz:1'];
    const t = open(game, 'major');
    await t.settle();
    expect(t.card()).toBeNull();
    t.s.onAction('confirm'); await t.settle();   // the day's line
    expect(t.card()).toBeNull();
    expect(t.menu().hasAttribute('inert')).toBe(false);
    expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);
    expect(game.state.story.seen).toContain('mem:liz:1');
    expect(game.state.story.fresh).toContain('mem:liz:1');
    expect(game.state.story.untold).toEqual([]);
  });
  it("the group scene is the night's first item, after the day's notices, under its own card (story L Task 5)", async () => {
    // a stand-in script for the group (the writing tasks write the real one): two lines, the first with its place card
    const scenes = STORY.scenes as Record<string, { title: string; summary: string; lines: ScriptLine[] }>;
    scenes['group:act2'] = { title: '碎片的價錢', summary: '', lines: [
      { who: 'narrator', text: '公會的長桌。', place: { text: '冒險者公會・打烊以後' } },
      { who: 'selene', text: '「我先說。」' },
    ] };
    try {
      await withBeats([{ who: 'narrator', text: '窗外起風了。' }], async () => {
        const game = setup(['mem:selene:1', 'mem:noel:1']);
        game.state.story.queue = ['act2'];
        game.state.story.reacts = {};
        game.arrival = ['act2'];
        game.night = ['group:act2', 'mem:selene:1', 'mem:noel:1'];
        game.state.story.tonight = ['mem:selene:1', 'mem:noel:1'];
        game.notice = 'banked';
        game.banked = { items: {}, gold: 40, viaLamp: false, gear: [], overflow: [] };
        const t = open(game, 'major');   // the group plays under 「只播主線」 too; the memories are recorded as new
        await t.through('act2');
        expect(t.text()).toBe('平安回城。帶回了：40 G。');   // the day's notices come first
        t.s.onAction('confirm'); await t.settle();
        t.s.onAction('confirm'); await t.settle();   // the day's line
        await t.through('group:act2', () => {
          expect(t.card()).toBe('冒險者公會・打烊以後');   // its own card, not the night's
          expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(true);
        });
        expect(game.state.story.seen).toContain('group:act2');
        expect(game.state.story.fresh).not.toContain('group:act2');
        expect(game.state.story.fresh).toEqual(expect.arrayContaining(['mem:selene:1', 'mem:noel:1']));   // not shown: new
        expect(game.state.story.beat).toBeUndefined();   // no beat after a group, nor around memories not shown
        expect(t.menu().classList.contains('slx-cmd-hidden')).toBe(false);
        expect(t.menu().hasAttribute('inert')).toBe(false);
        expect(game.night).toEqual([]);
      });
    } finally {
      delete scenes['group:act2'];
    }
  });

  it('a group scene then the memories: the night card comes up for the first memory, with no beat between (story L Task 5)', async () => {
    const scenes = STORY.scenes as Record<string, { title: string; summary: string; lines: ScriptLine[] }>;
    scenes['group:act2'] = { title: '碎片的價錢', summary: '', lines: [{ who: 'narrator', text: '公會的長桌。', place: { text: '冒險者公會・打烊以後' } }] };
    try {
      await withBeats([{ who: 'narrator', text: '窗外起風了。' }], async () => {
        const game = setup(['mem:selene:1', 'mem:noel:1']);
        game.night = ['group:act2', 'mem:selene:1', 'mem:noel:1'];
        game.state.story.tonight = ['mem:selene:1', 'mem:noel:1'];
        const t = open(game);
        t.s.onAction('confirm'); await t.settle();   // the day's line
        await t.through('group:act2', () => expect(t.card()).toBe('冒險者公會・打烊以後'));
        await t.through('mem:selene:1', () => expect([t.card(), t.night()]).toEqual(['月影旅館・夜', true]));
        expect(t.text()).toBe('窗外起風了。');      // the beat between the two memories only
        t.s.onAction('confirm'); await t.settle();
        await t.through('mem:noel:1');
        expect(game.state.story.beat).toBe(0);
        expect(game.state.story.seen).toEqual(expect.arrayContaining(['group:act2', 'mem:selene:1', 'mem:noel:1']));
      });
    } finally {
      delete scenes['group:act2'];
    }
  });
  it("the night's memories are told under tonight's moon (time and moon Task 5)", async () => {
    const game = setup(['mem:liz:1', 'mem:noel:1']);
    // as a return leaves it: the dive's day 4 (a full moon) planned the night, then the day became 5
    game.state.story.day = 5;
    game.night = ['mem:liz:1', 'mem:noel:1'];
    game.state.story.tonight = ['mem:liz:1', 'mem:noel:1'];
    const t = open(game);
    const tinted = (moon: string) => !!t.root.querySelector(`.slx-veil-night.slx-on.slx-moon-${moon}`);
    expect(tinted('full')).toBe(false);   // the day's line: no night yet
    t.s.onAction('confirm'); await t.settle();
    await t.through('mem:liz:1', () => expect([t.night(), tinted('full')]).toEqual([true, true]));
    for (let i = 0; i < 6 && t.text() !== flatLines(linesOf('mem:noel:1', game.state))[0].text; i++) { t.s.onAction('confirm'); await t.settle(); }   // the beat
    await t.through('mem:noel:1', () => expect(tinted('full')).toBe(true));
    expect(t.root.querySelector('[class*="slx-moon-"]')).toBeNull();   // the night over, the tint goes with the card
  });

  it("the reveal plays at night, under tonight's moon (time and moon Task 5)", async () => {
    const game = setup(['mem:rin:6', 'mem:rin:7']);
    game.state.story.seen.push('mem:rin:1', 'mem:rin:2', 'mem:rin:3', 'mem:rin:4', 'mem:rin:5');
    game.state.story.queue = ['rin-reveal'];
    game.arrival = ['mem:rin:6', 'mem:rin:7', 'rin-reveal'];
    game.state.story.tonight = ['mem:rin:6', 'mem:rin:7'];
    game.state.story.day = 3;   // after the return: tonight is day 2's, a new moon
    const t = open(game);
    await t.through('mem:rin:6');
    await t.through('mem:rin:7');
    // its night lines wear tonight's moon; its dawn card has no veil and no tint
    const lines: [boolean, boolean][] = [];
    await t.through('rin-reveal', () => { lines.push([t.night(), !!t.root.querySelector('.slx-veil-night.slx-on.slx-moon-new')]); });
    expect(lines[0]).toEqual([true, true]);
    for (const [night, tinted] of lines) expect(tinted).toBe(night);
    expect(t.root.querySelector('[class*="slx-moon-new"]')).toBeNull();
    expect(t.root.querySelector('[class*="slx-moon-"]')).toBeNull();
  });

});

describe('TownScene: the calendar (time and moon Task 4)', () => {
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const open = (game: Game) => {
    const root = document.createElement('div');
    const settings = { get: () => ({ ...DEFAULT_SETTINGS, story: 'all' as StoryMode }) };
    const s = new TownScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), settings }, Infinity);
    s.enter(root);
    const cal = () => root.querySelector('.slx-calendar') as HTMLElement;
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return { root, s, cal, settle };
  };

  it("the town shows the season and today's moon under its name", () => {
    const t = open(new Game(constRng(0.5), null));
    expect(t.cal().textContent).toBe('秋・下弦');   // a new game: day 1
    expect(t.root.querySelector('.slx-place')!.nextElementSibling).toBe(t.cal());
    expect(t.cal().classList.contains('slx-win')).toBe(true);
    const full = new Game(constRng(0.5), null);
    full.state.story.day = 4;
    expect(open(full).cal().textContent).toBe('秋・滿月');
    const winter = new Game(constRng(0.5), null);
    winter.state.story.nodes = ['act2', 'act3'];
    winter.state.story.seen.push('act2', 'act3');
    winter.state.story.act1Cleared = true;
    winter.state.dungeon.reached.mainline = ACT_DEPTHS.act3;
    expect(open(winter).cal().textContent).toBe('冬・下弦');
  });

  it('the calendar goes away with the HUD while a scene plays', async () => {
    const game = Game.fresh(constRng(0.5), null);
    game.arrival = ['act1-after'];
    game.state.story.queue = ['act1-after'];
    const t = open(game);
    expect(t.cal().classList.contains('slx-cmd-hidden')).toBe(true);
    for (let i = 0; i < flatLines(linesOf('act1-after', game.state)).length; i++) { t.s.onAction('confirm'); await t.settle(); }
    expect(t.cal().classList.contains('slx-cmd-hidden')).toBe(false);
  });

  it("the calendar is read again when the return's scenes end", async () => {
    // a return that reached act 3's depth: autumn on arrival, winter once act 3 has played
    const game = Game.fresh(constRng(0.5), null);
    game.state.story.seen = ['prologue', 'prologue-inn', 'act2'];
    game.state.story.nodes = ['act2', 'act3'];
    game.state.story.queue = ['act3'];
    game.state.story.act1Cleared = true;
    game.state.dungeon.reached.mainline = ACT_DEPTHS.act3;
    game.arrival = ['act3'];
    const t = open(game);
    expect(t.cal().textContent).toBe('秋・下弦');
    for (let i = 0; i < flatLines(linesOf('act3', game.state)).length; i++) { t.s.onAction('confirm'); await t.settle(); }
    expect(game.state.story.seen).toContain('act3');
    expect(t.cal().classList.contains('slx-cmd-hidden')).toBe(false);   // the menu is back, with the day's line
    expect(t.cal().textContent).toBe('冬・下弦');
  });
});

/** Bond plan Tasks 12-14: Rin's first heart-to-heart registered for the test with a scene of its own, taken out after. */
function stageRinTalk(): () => void {
  const id = 'bond:rin:1' as const;
  BONDS_WRITTEN.push('rin');
  STORY.scenes[id] = {
    title: '凜・羈絆 1', summary: '凜說了一件小事。',
    lines: [
      { who: 'rin', text: '一' },
      { who: 'hero', choices: [{ tone: 'ask', text: '「後來呢？」', reply: [{ who: 'rin', text: '二' }] }, { tone: 'stay', text: '（坐下。）', reply: [{ who: 'rin', text: '三' }] }] },
      { who: 'narrator', text: '四' },
    ],
  };
  return () => { BONDS_WRITTEN.splice(0); delete (STORY.scenes as Partial<typeof STORY.scenes>)[id]; };
}
/** Rin at 同行 with her second piece: her first heart-to-heart is open. */
const rinReady = (game: Game): void => {
  game.state.party.roster.rin.memories = 2;
  game.state.party.roster.rin.bond = { talk: 0, field: 10, gifts: {} };
};

describe('TownScene: the inn and the bond (bond plan Task 12)', () => {
  it('the inn shows 新 while a talk waits', async () => {
    const innRow = (root: HTMLElement) => root.querySelector('.slx-town-menu [data-id=inn]')!;
    const mk = (game: Game) => {
      const root = document.createElement('div');
      new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity).enter(root);
      return root;
    };
    const plain = new Game(constRng(0.5), null);
    plain.arrival = [];
    expect(innRow(mk(plain)).querySelector('.slx-fresh')).toBeNull();
    const back = stageRinTalk();
    try {
      const g = new Game(constRng(0.5), null);
      g.arrival = [];
      rinReady(g);
      const root = mk(g);
      await new Promise((r) => setTimeout(r, 0));
      expect(innRow(root).querySelector('.slx-fresh')!.textContent).toBe('新');
      g.state.story.bondDay = 1;
      g.state.story.talked = true;
      expect(innRow(mk(g)).querySelector('.slx-fresh')).toBeNull();   // talked today
    } finally { back(); }
  });
});
