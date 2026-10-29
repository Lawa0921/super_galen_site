import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '../../data/enemies';
import { GUILD_SWITCH } from '../../data/guild';
import { GUILD_TEXT } from '../../data/guild.zh-TW';
import { MATERIALS } from '../../data/materials';
import { REGIONS } from '../../data/regions';
import { ITEMS } from '../../data/items';
import { RUNE_SELL } from '../../data/runeEconomy';
import { RUNE_STACK } from '../../data/runes';
import { SHARD_IDS, SHARD_NAMES } from '../../data/story/fragments';
import { T } from '../../data/text.zh-TW';
import { dayOf } from '../../engine/calendar';
import { Game } from '../../engine/game';
import { LEGACY_LINEUP } from '../../engine/party';
import type { ActiveQuest, GuildState, QuestOffer } from '../../engine/state';
import { hauntsOf } from '../../engine/story/handbook';
import { SAVE_KEY } from '../../engine/save';
import { memoryStorage, withGuildLive } from '../../engine/testing';
import { textWidth } from '../../render/ailmentStyle';
import { art, enemyArt } from '../../render/artPaths';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { GuildScene } from './guild';
import { portalArt } from './gate';

const B = T.ui2.board;
const nm = (id: string) => ITEMS[id]?.name ?? MATERIALS[id]?.name;

/** One of each kind, as the board posts them (spec §9.3): a hunt, a bounty on a boss, a scout, a delivery and a sweep. */
function notes(day: number): QuestOffer[] {
  return [
    { id: `${day}:0`, kind: 'bounty', giver: 'anna', variant: 0, target: 'fog-warden', n: 1, depth: 5, reward: { gold: 300, items: { 'ancient-gear': 1, [SHARD_IDS.clear]: 2 }, rune: 'focus@magic' }, merit: 6 },
    { id: `${day}:1`, kind: 'hunt', giver: 'marta', variant: 0, target: 'slime', n: 6, depth: 2, reward: { gold: 78, items: { 'essence-magic': 1 } }, merit: 2 },
    { id: `${day}:2`, kind: 'scout', giver: 'glen', variant: 0, target: 'frost', n: 9, depth: 9, reward: { gold: 140, items: { 'return-lamp': 1 } }, merit: 3 },
    { id: `${day}:3`, kind: 'deliver', giver: 'orik', variant: 0, target: 'moss', n: 8, depth: 0, reward: { gold: 77 }, merit: 2 },
    { id: `${day}:4`, kind: 'sweep', giver: 'glen', variant: 0, target: 'frost', n: 8, depth: 5, reward: { gold: 130, items: { 'essence-rare': 1 } }, merit: 3 },
  ];
}
/** A note taken, from `base` (a sweep's frozen kinds: the slime alone, enough for these tests). */
const held = (o: QuestOffer, base = 0): ActiveQuest => ({ ...structuredClone(o), base, ...(o.kind === 'sweep' ? { ids: ['slime'] } : {}) });

interface Opened { game: Game; root: HTMLElement; s: GuildScene; sfx: { cursor: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } }

/**
 * The guild with its board open (call it under `withGuildLive`): the first act over, today's board as `notes` (or `guild`
 * over it), Anna's greeting closed, then 委託 picked.
 */
function open(o: { guild?: Partial<GuildState>; art?: ArtIndex; prep?: (g: Game) => void } = {}): Opened {
  const game = new Game(() => 0.5, memoryStorage(), undefined, 0, [...LEGACY_LINEUP] as never);
  game.state.story.act1Cleared = true;
  const day = dayOf(game.state);
  game.state.guild = { day, offers: notes(day), active: [], merit: 0, paid: 0, intro: true, ...o.guild };
  o.prep?.(game);
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new GuildScene({ game, art: o.art ?? NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  for (let i = 0; i < 3 && !talk(root).hidden; i++) s.onAction('confirm');
  [...root.querySelectorAll<HTMLElement>('.slx-cmd [role=option]')].find((x) => x.textContent === B.title)!.click();
  return { game, root, s, sfx };
}
const talk = (root: HTMLElement) => root.querySelector<HTMLElement>('.slx-talk')!;
const said = (root: HTMLElement) => root.querySelector('.slx-talk .slx-text')!.textContent;
const tabs = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.slx-board .slx-tab')];
const selTab = (root: HTMLElement) => root.querySelector('.slx-board .slx-tab-sel')?.textContent;
const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.slx-board [role=option]')];
const labels = (root: HTMLElement) => rows(root).map((r) => r.querySelector('.slx-label')!.textContent);
const rights = (root: HTMLElement) => rows(root).map((r) => r.querySelector('.slx-right')?.textContent);
const info = (root: HTMLElement) => root.querySelector<HTMLElement>('.slx-board-info')!;
const lines = (root: HTMLElement) => [...info(root).querySelectorAll('p')].map((p) => p.textContent);

afterEach(() => {
  GUILD_TEXT.notes = {};
  GUILD_TEXT.thanks = {};
  GUILD_TEXT.anna = { intro: [], stamp: {} };
  GUILD_TEXT.remarks = {};
});

describe('the guild board: tabs, rows and the detail (guild quests plan Task B2)', () => {
  it('three tabs, left and right turn them', () => withGuildLive(() => {
    const { root, s } = open({ guild: { active: [] } });
    expect(tabs(root).map((t) => t.textContent)).toEqual([B.tabs.board, B.tabs.active(0, 3), B.tabs.rank]);
    expect(selTab(root)).toBe(B.tabs.board);
    s.onAction('right');
    expect(selTab(root)).toBe(B.tabs.active(0, 3));
    s.onAction('next');
    expect(selTab(root)).toBe(B.tabs.rank);
    s.onAction('right');   // round to the first
    expect(selTab(root)).toBe(B.tabs.board);
    s.onAction('left');
    expect(selTab(root)).toBe(B.tabs.rank);
    s.onAction('prev');
    expect(selTab(root)).toBe(B.tabs.active(0, 3));
    tabs(root)[0].click();
    expect(selTab(root)).toBe(B.tabs.board);
    expect(root.querySelectorAll('.slx-board .slx-tab-sel')).toHaveLength(1);
  }));

  it('a row for every note', () => withGuildLive(() => {
    const { root } = open();
    expect(labels(root)).toEqual([
      B.row(B.kinds.bounty, ENEMIES['fog-warden'].name),
      B.row(B.kinds.hunt, B.count(ENEMIES.slime.name, 6)),
      B.row(B.kinds.scout, B.depthAt(REGIONS.frost.name, 9)),
      B.row(B.kinds.deliver, B.count(MATERIALS.moss.name, 8)),
      B.row(B.kinds.sweep, REGIONS.frost.name),
    ]);
    expect(labels(root)[0]).toBe('【懸賞】霧門守衛');
    expect(rights(root)).toEqual(['300 G', '78 G', '140 G', '77 G', '130 G']);
    // No art landed: no row has a picture.
    expect(root.querySelectorAll('.slx-board img')).toHaveLength(0);
  }));

  it("a delivery's row shows its material's icon, a scout's and a sweep's their land's; a hunt and a bounty none", () => withGuildLive(() => {
    const { root } = open({ art: { has: () => true } });
    const icon = (i: number) => rows(root)[i].querySelector('img')?.getAttribute('src');
    expect(icon(0)).toBeUndefined();
    expect(icon(1)).toBeUndefined();
    expect(icon(2)).toBe(portalArt.trait('ice'));
    expect(icon(3)).toBe(art.icon('moss'));
    expect(icon(4)).toBe(portalArt.trait('ice'));
  }));

  it('the main road has no land icon', () => withGuildLive(() => {
    const { root } = open({ art: { has: () => true }, prep: (g) => { g.state.guild!.offers = [{ ...notes(g.state.guild!.day)[2], target: 'mainline' }]; } });
    expect(labels(root)).toEqual([B.row(B.kinds.scout, B.depthAt(B.main, 9))]);
    expect(rows(root)[0].querySelector('img')).toBeNull();
  }));

  it('the detail follows the cursor', () => withGuildLive(() => {
    const { root, s } = open();
    expect(lines(root)).toEqual([
      B.giver('安娜'), B.target(ENEMIES['fog-warden'].name), B.haunts(hauntsOf(ENEMIES['fog-warden'])),
      B.reward(`300 G、${nm('ancient-gear')} ×1、${SHARD_NAMES.clear} ×2、${T.rune.label('focus', 'magic')}`), B.merit(6),
    ]);
    s.onAction('down');
    expect(lines(root)).toEqual([B.giver('瑪莎'), B.target(B.count(ENEMIES.slime.name, 6)), B.haunts(hauntsOf(ENEMIES.slime)), B.reward(`78 G、${nm('essence-magic')} ×1`), B.merit(2)]);
    s.onAction('down');
    expect(lines(root)).toEqual([B.giver('葛倫'), B.target(B.depthAt(REGIONS.frost.name, 9)), B.haunts(REGIONS.frost.name), B.reward(`140 G、${nm('return-lamp')} ×1`), B.merit(3)]);
    s.onAction('down');
    expect(lines(root)).toEqual([B.giver('歐里克'), B.target(B.count(MATERIALS.moss.name, 8)), B.reward('77 G'), B.merit(2)]);
    s.onAction('down');
    expect(lines(root)).toEqual([B.giver('葛倫'), B.target(B.natives(REGIONS.frost.name, 8)), B.haunts(REGIONS.frost.name), B.reward(`130 G、${nm('essence-rare')} ×1`), B.merit(3)]);
  }));

  it("the giver's note, once there is one, with its slots filled", () => withGuildLive(() => {
    GUILD_TEXT.notes.hunt = ['{place}的{target}，{n}隻。', '另一天的。'];
    const { root, s } = open();
    expect(info(root).querySelector('.slx-board-note')).toBeNull();   // a bounty's note is not written
    s.onAction('down');
    expect(info(root).querySelector('.slx-board-note')!.textContent).toBe(`${B.main}的${ENEMIES.slime.name}，六隻。`);
    expect(lines(root)[1]).toBe(info(root).querySelector('.slx-board-note')!.textContent);   // under the giver
  }));

  it('a foe is drawn only once its art lands, at the handbook\'s size', () => withGuildLive(() => {
    const bare = open();
    expect(info(bare.root).querySelector('.slx-hb-foe')).toBeNull();
    const landed = new Set<string>();
    const late = open({ art: { has: (u) => landed.has(u) } });
    expect(info(late.root).querySelector('.slx-hb-foe')).toBeNull();
    const full = open({ art: { has: () => true } });
    const boss = info(full.root).querySelector('.slx-hb-foe')!;
    expect(boss.getAttribute('src')).toBe(enemyArt('fog-warden'));
    expect(boss.classList.contains('slx-hb-foe-x2')).toBe(false);   // a boss at its own size
    full.s.onAction('down');
    const slime = info(full.root).querySelector('.slx-hb-foe')!;
    expect(slime.getAttribute('src')).toBe(enemyArt('slime'));
    expect(slime.classList.contains('slx-hb-foe-x2')).toBe(true);
    full.s.onAction('down');   // a scout: no foe
    expect(info(full.root).querySelector('.slx-hb-foe')).toBeNull();
  }));

  it("the giver's face only once it lands", () => withGuildLive(() => {
    const bare = open({ art: { has: (u) => u !== art.npc('guild', 'normal') && u !== art.npc('inn', 'normal') } });
    expect(info(bare.root).querySelector('.slx-board-face')).toBeNull();
    const full = open({ art: { has: () => true } });
    expect(info(full.root).querySelector('.slx-board-face')!.getAttribute('src')).toBe(art.npc('guild', 'normal'));
    full.s.onAction('down');
    expect(info(full.root).querySelector('.slx-board-face')!.getAttribute('src')).toBe(art.npc('inn', 'normal'));
  }));

  it('empty states: an empty board and an empty hand, each a greyed line', () => withGuildLive(() => {
    const { root, s } = open({ guild: { offers: [] } });
    expect(labels(root)).toEqual([B.emptyBoard]);
    expect(rows(root)[0].getAttribute('aria-disabled')).toBe('true');
    expect(info(root).textContent).toBe('');
    s.onAction('right');
    expect(labels(root)).toEqual([B.emptyActive]);
    expect(rows(root)[0].getAttribute('aria-disabled')).toBe('true');
  }));

  it('the held tab: progress, the deepest, the stock, and done', () => withGuildLive(() => {
    const { root, s } = open({
      prep: (g) => {
        const [bounty, hunt, scout, deliver] = notes(g.state.guild!.day);
        g.state.guild!.offers = [];
        g.state.guild!.active = [held(hunt, 1), held(scout), held(deliver), held(bounty)];
        g.state.guild!.merit = 100;   // three lamps: four held
        g.state.bestiary = { ...g.state.bestiary, slime: { seen: 5, felled: 4 }, 'fog-warden': { seen: 1, felled: 1 } };
        g.state.dungeon.reached.frost = 5;
        g.state.inventory.moss = 3;
      },
    });
    s.onAction('right');
    expect(selTab(root)).toBe(B.tabs.active(4, 4));
    expect(rights(root)).toEqual([B.progress(3, 6), B.deepest(5, 9), B.held(3, 8), B.ready]);
    expect(rows(root)[3].querySelector('.slx-right')!.classList.contains('slx-fresh')).toBe(true);
    expect(rows(root)[0].querySelector('.slx-right')!.classList.contains('slx-fresh')).toBe(false);
    expect(lines(root)).toContain(B.progressLine(B.progress(3, 6)));
  }));

  it('the head shows the rank and the merit', () => withGuildLive(() => {
    expect(open().root.querySelector('.slx-board-head')!.textContent).toBe(B.head('見習', 0, 12));
    expect(open({ guild: { merit: 18, paid: 1 } }).root.querySelector('.slx-board-head')!.textContent).toBe('公會評等：一燈　功績 18／40');
    expect(open({ guild: { merit: 250, paid: 4 } }).root.querySelector('.slx-board-head')!.textContent).toBe('公會評等：四燈　功績 250');
  }));

  it('cancel closes the board and its detail', () => withGuildLive(() => {
    const { root, s } = open();
    s.onAction('cancel');
    expect(root.querySelector('.slx-board')).toBeNull();
    expect(root.querySelector('.slx-board-info')).toBeNull();
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(false);
  }));

  it('no inline style', () => withGuildLive(() => {
    const { root, s } = open({ art: { has: () => true } });
    for (const a of ['down', 'right', 'right'] as const) s.onAction(a);
    expect(root.querySelectorAll('[style]').length).toBe(0);
  }));

  it('the longest name fits its row', () => {
    const widest = (names: string[]) => names.reduce((a, b) => (textWidth(b, 12) > textWidth(a, 12) ? b : a));
    const foe = widest(Object.values(ENEMIES).map((e) => e.name));
    const mat = widest(Object.values(MATERIALS).filter((m) => ['monster', 'region', 'trophy'].includes(m.kind)).map((m) => m.name));
    const land = widest(Object.values(REGIONS).map((r) => r.name).filter((n) => n !== REGIONS.mainline.name));
    // The row's own room (styles: .slx-board 340px wide, border-box): the window's 2px border and 8px padding each side, the
    // row's 16px and 8px padding, the right text's 4px gap and 12px lead; a 16px icon and its 4px gap where the row has one
    // (a delivery, a scout, a sweep).
    const room = (icon: boolean) => 340 - 2 * (2 + 8) - (16 + 8) - 4 - 12 - (icon ? 16 + 4 : 0);
    const w = (t: string) => textWidth(t, 12);
    const rights = (more: string[]) => Math.max(w('9999 G'), w(B.ready), ...more.map(w));
    const cases: [string, boolean, string[]][] = [
      [B.row(B.kinds.hunt, B.count(foe, 6)), false, [B.progress(6, 6)]],
      [B.row(B.kinds.bounty, foe), false, [B.progress(1, 1)]],
      [B.row(B.kinds.deliver, B.count(mat, 8)), true, [B.held(99, 8)]],
      // Two digits: deeper than any land's reward reads (60). A deeper scout's row cuts its place with 「…」 (the detail says it whole).
      [B.row(B.kinds.scout, B.depthAt(land, 99)), true, [B.deepest(98, 99)]],
      [B.row(B.kinds.sweep, land), true, [B.progress(8, 8)]],
    ];
    for (const [label, icon, more] of cases) expect(w(label) + rights(more), label).toBeLessThanOrEqual(room(icon));
    // The detail (.slx-board-info 276px wide, border-box): the target line of the longest names on one line.
    const detail = 276 - 2 * (2 + 8);
    for (const line of [B.target(B.count(foe, 6)), B.target(B.count(mat, 8)), B.target(B.natives(land, 8)), B.target(B.depthAt(land, 250))]) expect(textWidth(line, 12), line).toBeLessThanOrEqual(detail);
  });
});

/** `withGuildLive` for a test that awaits: the switch stays on until the test is over, not only until its first await. */
const liveAsync = (f: () => Promise<void>) => async () => {
  const was = GUILD_SWITCH.live;
  GUILD_SWITCH.live = true;
  try { await f(); } finally { GUILD_SWITCH.live = was; }
};

/** Plays the dialogue to its end, confirming every line; each line's nameplate and text, in order. */
async function drain(o: Opened): Promise<{ who: string; text: string }[]> {
  const out: { who: string; text: string }[] = [];
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (talk(o.root).hidden) break;
    out.push({ who: o.root.querySelector('.slx-talk .slx-name')!.textContent ?? '', text: said(o.root) ?? '' });
    o.s.onAction('confirm');
  }
  return out;
}
const top = (root: HTMLElement) => root.querySelector('.slx-layer:last-child')!;
const topOptions = (root: HTMLElement) => [...top(root).querySelectorAll('[role=option]')].map((x) => x.querySelector('.slx-label')!.textContent);
const saved = (g: Game) => (g as unknown as { storage: Storage }).storage.getItem(SAVE_KEY) ?? '';

describe('the guild board: take, drop, turn in, the rank tab (guild quests plan Task B3)', () => {
  it('taking a note: asked with 是 first, taken once, moved to the held tab and saved', liveAsync(async () => {
    const o = open();
    const accept = vi.spyOn(o.game, 'acceptQuest');
    const id = o.game.state.guild!.offers[1].id;
    const label = B.row(B.kinds.hunt, B.count(ENEMIES.slime.name, 6));
    o.s.onAction('down');
    o.s.onAction('confirm');
    expect(top(o.root).classList.contains('slx-confirm')).toBe(true);
    expect(top(o.root).textContent).toContain(B.acceptAsk(label));
    expect(top(o.root).querySelector('[aria-selected=true]')!.textContent).toBe('是');
    o.s.onAction('confirm');
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith(id);
    expect(o.game.state.guild!.active.map((q) => q.id)).toEqual([id]);
    expect(labels(o.root)).not.toContain(label);
    expect(saved(o.game)).toContain(`"active":[{"id":"${id}"`);
    expect(await drain(o)).toEqual([{ who: '安娜', text: B.accepted(label) }]);
    o.s.onAction('right');
    expect(labels(o.root)).toEqual([label]);
  }));

  it("taking a note, Anna's own words once they are written", liveAsync(async () => {
    GUILD_TEXT.anna.accepted = 'TAKEN';
    const o = open();
    o.s.onAction('confirm');
    o.s.onAction('confirm');
    expect(await drain(o)).toEqual([{ who: '安娜', text: 'TAKEN' }]);
  }));

  it('declining the question takes nothing', () => withGuildLive(() => {
    const o = open();
    o.s.onAction('confirm');
    o.s.onAction('down');   // 否
    o.s.onAction('confirm');
    expect(o.game.state.guild!.active).toEqual([]);
    expect(labels(o.root)).toHaveLength(5);
  }));

  it('a full hand says so and stays put', liveAsync(async () => {
    const o = open({ prep: (g) => { const n = notes(g.state.guild!.day); g.state.guild!.offers = n.slice(0, 2); g.state.guild!.active = n.slice(2).map((x) => held(x)); } });
    const before = structuredClone(o.game.state.guild);
    o.s.onAction('confirm');
    expect(o.sfx.error).toHaveBeenCalledTimes(1);
    expect(top(o.root).classList.contains('slx-board')).toBe(true);   // no question
    expect(o.game.state.guild).toEqual(before);
    expect(talk(o.root).hidden).toBe(true);   // nothing of hers written yet: nothing said
    GUILD_TEXT.anna.full = 'FULL';
    o.s.onAction('confirm');
    expect(await drain(o)).toEqual([{ who: '安娜', text: 'FULL' }]);
    expect(o.game.state.guild).toEqual(before);
  }));

  it('dropping asks twice, 否 first', () => withGuildLive(() => {
    const o = open({ prep: (g) => { g.state.guild!.active = [held(notes(g.state.guild!.day)[1])]; g.state.guild!.offers = []; } });
    o.s.onAction('right');
    o.s.onAction('confirm');
    expect(topOptions(o.root)).toEqual([B.abandon, B.back]);   // not done: nothing to turn in
    o.s.onAction('confirm');   // 放棄
    expect(top(o.root).textContent).toContain(B.abandonAsk(B.row(B.kinds.hunt, B.count(ENEMIES.slime.name, 6))));
    expect(top(o.root).querySelector('[aria-selected=true]')!.textContent).toBe('否');
    o.s.onAction('confirm');
    expect(o.game.state.guild!.active).toHaveLength(1);
    o.s.onAction('confirm');   // 放棄 again
    o.s.onAction('up');
    o.s.onAction('confirm');   // 是
    expect(o.game.state.guild!.active).toEqual([]);
    expect(top(o.root).classList.contains('slx-board')).toBe(true);
    expect(labels(o.root)).toEqual([B.emptyActive]);
    expect(saved(o.game)).toContain('"active":[]');
  }));

  it('返回 leaves the quest as it was', () => withGuildLive(() => {
    const o = open({ prep: (g) => { g.state.guild!.active = [held(notes(g.state.guild!.day)[1])]; } });
    o.s.onAction('right');
    o.s.onAction('confirm');
    o.s.onAction('down');
    o.s.onAction('confirm');   // 返回
    expect(top(o.root).classList.contains('slx-board')).toBe(true);
    expect(o.game.state.guild!.active).toHaveLength(1);
  }));

  /** A sweep of the frost done (eight slimes since it was taken), at ten merit: turning it in reaches the first lamp. */
  const doneSweep = (g: Game) => {
    g.state.guild!.active = [held(notes(g.state.guild!.day)[4])];
    g.state.guild!.merit = 10;
    g.state.bestiary = { ...g.state.bestiary, slime: { seen: 8, felled: 8 } };
  };

  it('turning in: the reward, then the new lamp and its gift; the list and the gold after it', liveAsync(async () => {
    const o = open({ prep: doneSweep });
    const gold = o.game.state.gold;
    o.s.onAction('right');
    expect(rights(o.root)).toEqual([B.ready]);
    o.s.onAction('confirm');
    expect(topOptions(o.root)).toEqual([B.turnIn, B.abandon, B.back]);
    o.s.onAction('confirm');
    expect(await drain(o)).toEqual([
      { who: '安娜', text: T.ui2.exchange.reward(`130 G、${nm('essence-rare')} ×1`) },
      { who: '安娜', text: B.rankUp('一燈') },
      { who: '安娜', text: B.gift(`300 G、${nm('return-lamp')} ×2`) },
    ]);
    expect(o.game.state.gold).toBe(gold + 130 + 300);
    expect(o.root.querySelector('.slx-gold')!.textContent).toBe(`${gold + 430} G`);
    expect(labels(o.root)).toEqual([B.emptyActive]);
    expect(o.root.querySelector('.slx-board-head')!.textContent).toBe(B.head('一燈', 13, 40));
    expect(saved(o.game)).toContain('"merit":13');
  }));

  it("turning in, every line once written: the giver's thanks, her word, the reward, the stamp and the gift", liveAsync(async () => {
    GUILD_TEXT.thanks.glen = ['THANKS0', 'THANKS1'];
    GUILD_TEXT.remarks.chizuru = 'REMARK';
    GUILD_TEXT.anna.stamp = { 1: 'STAMP1' };
    const o = open({ prep: doneSweep });
    o.s.onAction('right');
    o.s.onAction('confirm');
    o.s.onAction('confirm');
    const said = await drain(o);
    expect(said.map((l) => l.text)).toEqual([
      `${B.note('葛倫')}THANKS0`, 'REMARK', T.ui2.exchange.reward(`130 G、${nm('essence-rare')} ×1`), 'STAMP1', B.rankUp('一燈'), B.gift(`300 G、${nm('return-lamp')} ×2`),
    ]);
    expect(said[0].who).toBe('安娜');   // passed on by Anna
    expect(said[1].who).toContain('千鶴');   // the companion says it in her own name
    expect(said[2].who).toBe('安娜');
  }));

  it('a rune that does not fit says the gold it became', liveAsync(async () => {
    const o = open({ prep: (g) => {
      g.state.guild!.active = [held(notes(g.state.guild!.day)[0])];
      g.state.bestiary = { ...g.state.bestiary, 'fog-warden': { seen: 1, felled: 1 } };
      g.state.runesOpen = true;
      g.state.runes = { ...g.state.runes, 'focus@magic': RUNE_STACK };
    } });
    const gold = o.game.state.gold;
    o.s.onAction('right');
    o.s.onAction('confirm');
    o.s.onAction('confirm');
    const said = (await drain(o)).map((l) => l.text);
    expect(said[1]).toBe(T.rune.overStack(T.rune.label('focus', 'magic'), RUNE_STACK, RUNE_SELL.magic));
    expect(o.game.state.gold).toBe(gold + 300 + RUNE_SELL.magic);
  }));

  it('not enough goods: no 回報 on a delivery short of them', () => withGuildLive(() => {
    const o = open({ prep: (g) => { g.state.guild!.active = [held(notes(g.state.guild!.day)[3])]; g.state.inventory.moss = 7; } });
    o.s.onAction('right');
    expect(rights(o.root)).toEqual([B.held(7, 8)]);
    o.s.onAction('confirm');
    expect(topOptions(o.root)).toEqual([B.abandon, B.back]);
  }));

  it('a delivery with its goods in stock hands them over', liveAsync(async () => {
    const o = open({ prep: (g) => { g.state.guild!.active = [held(notes(g.state.guild!.day)[3])]; g.state.inventory.moss = 9; } });
    o.s.onAction('right');
    o.s.onAction('confirm');
    o.s.onAction('confirm');   // 回報
    expect(o.game.state.inventory.moss).toBe(1);
    expect((await drain(o)).map((l) => l.text)).toEqual([T.ui2.exchange.reward('77 G')]);
  }));

  it('the rank tab: the lamp now, the merit, the next threshold and what each lamp brings', () => withGuildLive(() => {
    const o = open({ guild: { merit: 18, paid: 1 } });
    o.s.onAction('left');
    expect(selTab(o.root)).toBe(B.tabs.rank);
    expect(labels(o.root)).toEqual(B.rankNames);
    expect(rights(o.root)).toEqual([B.rankFrom(0), B.current, B.rankFrom(40), B.rankFrom(100), B.rankFrom(200)]);
    expect(o.root.querySelector('.slx-board [aria-selected=true] .slx-label')!.textContent).toBe('一燈');
    const text = () => info(o.root).textContent!;
    expect(lines(o.root).slice(0, 3)).toEqual([B.rankNow('一燈'), B.merit(18), B.rankNext('二燈', 40)]);
    expect(text()).toContain(B.perks(['討伐', '掃蕩', '懸賞', '探路', '收購'].join('、')));
    expect(text()).toContain(B.offers(4));
    expect(text()).toContain(B.gift(`300 G、${nm('return-lamp')} ×2`));
    o.s.onAction('down');
    expect(text()).toContain(B.runeBounty);
    o.s.onAction('down'); o.s.onAction('down');
    expect(text()).toContain(B.doubleBounty);
    expect(text()).toContain(B.cap(4));
    o.s.onAction('confirm');   // a lamp is only read
    expect(top(o.root).classList.contains('slx-board')).toBe(true);
    const top4 = open({ guild: { merit: 250, paid: 4 } });
    top4.s.onAction('left');
    expect(lines(top4.root).slice(0, 3)).toEqual([B.rankNow('四燈'), B.merit(250), B.rankTop]);
  }));

  it('nothing draws: opening, taking, dropping and turning in leave the game rng alone', liveAsync(async () => {
    let n = 0;
    const o = open({ prep: (g) => { Object.assign(g, { rng: () => { n++; return 0.5; } }); doneSweep(g); } });
    const before = n;
    o.s.onAction('confirm'); o.s.onAction('confirm');   // take the bounty
    await drain(o);
    o.s.onAction('right');
    o.s.onAction('down'); o.s.onAction('confirm'); o.s.onAction('confirm'); o.s.onAction('up'); o.s.onAction('confirm');   // drop it
    o.s.onAction('confirm'); o.s.onAction('confirm');   // turn the sweep in
    await drain(o);
    expect(o.game.state.guild!.active).toEqual([]);
    expect(n).toBe(before);
  }));
});
