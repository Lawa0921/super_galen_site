import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng, memoryStorage } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { InnScene } from './inn';
import { LEGACY_LINEUP } from '../../engine/party';
import { TownScene } from './town';
import { STORY } from '../../data/story.zh-TW';
import { BONDS_WRITTEN } from '../../data/story/scenes';
import { DEFAULT_SETTINGS, type StoryMode } from '../settings';
import { today } from '../../engine/story/bond';
import { GIFT_LINES, RIN_OATH, type GiftPools } from '../../data/bond.zh-TW';
import { ROMANCES_WRITTEN, TOGETHER_WRITTEN } from '../../data/story/scenes';
import { CHARACTERS } from '../../data/characters';
import { meet } from '../../engine/party';
import { chainLength } from '../../data/story/chains';
import { withTold } from '../../engine/testing';
/**
 * Bond plan Task 17: the registries hold what is written now, so a test that registers its own puts back what was there
 * (`bondsBack`), registers a companion only once (`bondsAdd`), and gives a written scene back instead of deleting it.
 */
const BOND_BASE = [...BONDS_WRITTEN];
const bondsAdd = (...cs: (typeof BONDS_WRITTEN)[number][]): void => { for (const c of cs) if (!BONDS_WRITTEN.includes(c)) BONDS_WRITTEN.push(c); };
const bondsBack = (): void => { BONDS_WRITTEN.splice(0, BONDS_WRITTEN.length, ...BOND_BASE); };
// review 5: the after-story and romance registries go back to what is registered, not to empty
const regAdd = <T,>(reg: T[], ...xs: T[]): void => { for (const x of xs) if (!reg.includes(x)) reg.push(x); };
const ROMANCES_BASE = [...ROMANCES_WRITTEN];
const romancesBack = (): void => { ROMANCES_WRITTEN.splice(0, ROMANCES_WRITTEN.length, ...ROMANCES_BASE); };
const TOGETHER_BASE = TOGETHER_WRITTEN.value;
const SCENES_BASE = { ...STORY.scenes };
const scenesBack = (id: keyof typeof STORY.scenes): void => { if (SCENES_BASE[id]) STORY.scenes[id] = SCENES_BASE[id]; else delete (STORY.scenes as Partial<typeof STORY.scenes>)[id]; };

function setup(storage = memoryStorage()) {
  const game = new Game(constRng(0.5), storage, undefined, 0, LEGACY_LINEUP);
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new InnScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity, 0);
  s.enter(root);
  s.onAction('confirm');
  const opts = () => [...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  return { game, root, s, sfx, storage, opts };
}

describe('InnScene', () => {
  afterEach(() => vi.useRealTimers());

  it('rests and saves after a yes', async () => {
    const { game, s, root, storage } = setup();
    game.state.party.roster.scarlet.hp = 1;
    const gold = game.state.gold;
    s.onAction('confirm');                 // 休息
    s.onAction('up');                      // 是
    s.onAction('confirm');
    await vi.waitFor(() => expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('已存檔。'));
    expect(game.state.party.roster.scarlet.hp).toBeGreaterThan(1);
    expect(game.state.gold).toBeLessThan(gold);
    expect(storage.map.get('starlantern-save')).toBeTruthy();
  });

  it('ignores every key while the night passes, and stops the night timer on exit', async () => {
    vi.useFakeTimers();
    const game = new Game(constRng(0.5), memoryStorage(), undefined, 0, LEGACY_LINEUP);
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new InnScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity, 1000);
    s.enter(root);
    s.onAction('confirm');                 // greeting
    s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');   // 休息 → 是
    expect(root.querySelector('.slx-night')).not.toBeNull();
    s.onAction('cancel');
    s.onAction('confirm');
    expect(go).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-confirm')).toBeNull();
    s.exit();
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);   // no line typed onto a scene that has gone
  });

  it('explains when nobody needs reviving', () => {
    const { s, root } = setup();
    s.onAction('down');                    // 復活
    s.onAction('confirm');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('大家都很有精神呢。');
    expect(root.querySelector('.slx-layer')).toBeNull();
  });

  it('revives a fallen member for gold', () => {
    const { game, s } = setup();
    game.state.party.roster.liz.hp = 0;
    s.onAction('down'); s.onAction('confirm');   // 復活
    s.onAction('confirm');                       // 莉茲
    expect(game.state.party.roster.liz.hp).toBeGreaterThan(0);
  });

  it('the inn offers 休息, 復活 and 重置配點', () => {
    const { opts } = setup();
    expect(opts()).toEqual(['休息（20 G）', '復活', '重置配點', '建議配點', '夥伴', '離開']);   // bond plan Task 12: 夥伴, fifth
  });

  it('the inn opens the suggested builds (plan 8h)', () => {
    const { s, game } = setup();
    const go = vi.fn();
    const root = document.createElement('div');
    const inn = new InnScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), from: 'builds' }, Infinity, 0);
    inn.enter(root);
    // Back from the builds screen: no greeting, the cursor on 建議配點; Enter opens it again.
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.slx-cmd [aria-selected=true] .slx-label')!.textContent).toBe('建議配點');
    inn.onAction('confirm');
    expect(go).toHaveBeenCalledWith('builds');
    s.exit();
  });

  it('重置配點 lists members with their price and resets after a yes', async () => {
    const { game, s, root, opts, storage } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    const gold = game.state.gold;
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');   // 重置配點
    const rows = [...root.querySelectorAll('.slx-list [role=option]')];
    expect(rows.map((r) => r.querySelector('.slx-label')!.textContent)).toContain('絲嘉蕾');
    expect(rows[0].textContent).toContain('25 G');
    const at = rows.findIndex((r) => r.textContent!.includes('絲嘉蕾'));
    for (let i = 0; i < at; i++) s.onAction('down');
    s.onAction('confirm');                                           // 絲嘉蕾
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('25 G');
    expect(game.state.party.roster.scarlet.talents).toEqual({ 'scarlet-t01': 1 });   // not before the yes
    s.onAction('up'); s.onAction('confirm');                         // 是
    expect(game.state.party.roster.scarlet.talents).toEqual({});
    expect(game.state.gold).toBe(gold - 25);
    expect(storage.map.get('starlantern-save')).toBeTruthy();   // saved
    await vi.waitFor(() => expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('絲嘉蕾的配點已重置，點數可以重新分配了。'));
    expect(opts().length).toBe(6);   // 休息, 復活, 重置配點, 建議配點 (plan 8h), 夥伴 (bond plan Task 12), 離開
  });

  /** Opens 重置配點 and says yes for 絲嘉蕾, who has one talent point spent. */
  const respecScarlet = (r: ReturnType<typeof setup>) => {
    r.game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    r.s.onAction('down'); r.s.onAction('down'); r.s.onAction('confirm');   // 重置配點
    const rows = [...r.root.querySelectorAll('.slx-list [role=option]')];
    const at = rows.findIndex((x) => x.textContent!.includes('絲嘉蕾'));
    const from = rows.findIndex((x) => x.getAttribute('aria-selected') === 'true');
    for (let i = from; i < at; i++) r.s.onAction('down');
    r.s.onAction('confirm');                                         // 絲嘉蕾
    r.s.onAction('up'); r.s.onAction('confirm');                     // 是
  };

  it('a respec whose save fails says so, and leaves no notice for the town', async () => {
    const storage = { ...memoryStorage(), setItem: () => { throw new Error('denied'); } };
    const r = setup(storage);
    const gold = r.game.state.gold;
    respecScarlet(r);
    expect(r.game.state.party.roster.scarlet.talents).toEqual({});   // the reset happened in play
    expect(r.game.state.gold).toBe(gold - 25);
    await vi.waitFor(() => expect(r.root.querySelector('.slx-talk .slx-text')!.textContent).toBe('絲嘉蕾的配點已重置，但存檔失敗了……瀏覽器不允許儲存。'));
    expect(r.game.notice).toBeNull();
  });

  it('a respec that saves leaves no stale 已存檔 notice for the town to speak later', async () => {
    const r = setup();
    respecScarlet(r);
    await vi.waitFor(() => expect(r.root.querySelector('.slx-talk .slx-text')!.textContent).toBe('絲嘉蕾的配點已重置，點數可以重新分配了。'));
    expect(r.game.notice).toBeNull();
  });

  it('the respec list says free for a member who has one', () => {
    const { game, s, root } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    game.state.party.roster.scarlet.freeRespec = true;
    game.state.party.roster.noel = { ...game.state.party.roster.noel, level: 4, tree: { 'fire-star': 1, 'ice-star': 1 } };
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');   // 重置配點
    const rows = [...root.querySelectorAll<HTMLElement>('.slx-list [role=option]')];
    const right = (name: string) => rows.find((x) => x.textContent!.includes(name))!.querySelector('.slx-right')!.textContent;
    expect(right('絲嘉蕾')).toBe('免費');
    expect(right('諾艾兒')).toBe(`${25 * 4} G`);
  });

  it('the free respec is asked without a price, costs nothing and is used up', () => {
    const r = setup();
    r.game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    r.game.state.party.roster.scarlet.freeRespec = true;
    r.s.onAction('down'); r.s.onAction('down'); r.s.onAction('confirm');   // 重置配點
    const rows = [...r.root.querySelectorAll('.slx-list [role=option]')];
    const at = rows.findIndex((x) => x.textContent!.includes('絲嘉蕾'));
    const from = rows.findIndex((x) => x.getAttribute('aria-selected') === 'true');
    for (let i = from; i < at; i++) r.s.onAction('down');
    r.s.onAction('confirm');                                         // 絲嘉蕾
    const ask = r.root.querySelector('.slx-confirm')!.textContent!;
    expect(ask).toContain('免費');
    expect(ask).not.toContain(' G');
    const gold = r.game.state.gold;
    r.s.onAction('up'); r.s.onAction('confirm');                     // 是
    expect(r.game.state.party.roster.scarlet.talents).toEqual({});
    expect(r.game.state.gold).toBe(gold);
    expect(r.game.state.party.roster.scarlet).not.toHaveProperty('freeRespec');
  });

  it('the respec list greys out members with nothing spent', () => {
    const { game, s, root } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    const rows = [...root.querySelectorAll<HTMLElement>('.slx-list [role=option]')];
    const scarlet = rows.find((x) => x.textContent!.includes('絲嘉蕾'))!;
    expect(scarlet.getAttribute('aria-disabled')).not.toBe('true');
    expect(rows.filter((x) => x !== scarlet).every((x) => x.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(scarlet.getAttribute('aria-selected')).toBe('true');                 // the cursor starts on one that can be reset
  });

  it('with nobody to reset, 重置配點 says so without opening the list', () => {
    const { s, root, game } = setup();
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    expect(root.querySelector('.slx-list')).toBeNull();
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('還沒有配過點，不需要重置。');
    expect(game.state.gold).toBe(150);
  });

  it('no leaves everything as it was', () => {
    const { game, s, root } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    const gold = game.state.gold;
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    const rows = [...root.querySelectorAll('.slx-list [role=option]')];
    const at = rows.findIndex((r) => r.textContent!.includes('絲嘉蕾'));
    for (let i = 0; i < at; i++) s.onAction('down');
    s.onAction('confirm');
    s.onAction('confirm');                                           // cursor starts on 否
    expect(game.state.party.roster.scarlet.talents).toEqual({ 'scarlet-t01': 1 });
    expect(game.state.gold).toBe(gold);
  });
});

describe('InnScene: the calendar (time and moon Task 4)', () => {
  it("after a night at the inn the town shows the next day's moon", async () => {
    const { game, s, root } = setup();
    expect(game.state.story.day).toBeUndefined();
    s.onAction('confirm');                 // 休息
    s.onAction('up');                      // 是
    s.onAction('confirm');
    await vi.waitFor(() => expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('已存檔。'));
    expect(game.state.story.day).toBe(2);
    const town = document.createElement('div');
    new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity).enter(town);
    expect(town.querySelector('.slx-calendar')!.textContent).toBe('秋・新月');
  });
});

/** Bond plan Tasks 12-14: Rin's first heart-to-heart registered for the test with a scene of its own, taken out after. */
function stageRinTalk(): () => void {
  const id = 'bond:rin:1' as const;
  bondsAdd('rin');
  STORY.scenes[id] = {
    title: '凜・羈絆 1', summary: '凜說了一件小事。',
    lines: [
      { who: 'rin', text: '一' },
      { who: 'hero', choices: [{ tone: 'ask', text: '「後來呢？」', reply: [{ who: 'rin', text: '二' }] }, { tone: 'stay', text: '（坐下。）', reply: [{ who: 'rin', text: '三' }] }] },
      { who: 'narrator', text: '四' },
    ],
  };
  return () => { bondsBack(); scenesBack(id); };
}
/** Rin at 同行 with her second piece: her first heart-to-heart is open. */
const rinReady = (game: Game): void => {
  game.state.party.roster.rin.memories = 2;
  game.state.party.roster.rin.bond = { talk: 0, field: 10, gifts: {} };
};

describe('InnScene: the partners (bond plan Task 12)', () => {
  const open = (story: StoryMode = 'all', prep?: (g: Game) => void) => {
    const storage = memoryStorage();
    const game = new Game(constRng(0.5), storage, undefined, 0, ['hero', 'rin']);
    prep?.(game);
    const root = document.createElement('div');
    const settings = { get: () => ({ ...DEFAULT_SETTINGS, story }) };
    const s = new InnScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), settings }, Infinity, 0);
    s.enter(root);
    s.onAction('confirm');   // the greeting
    const text = () => root.querySelector('.slx-talk .slx-text')!.textContent;
    const rows = (sel: string) => [...root.querySelectorAll(`${sel} [role=option]`)];
    const label = (o: Element) => o.querySelector('.slx-label')!.textContent;
    const fresh = (o: Element | undefined) => !!o?.querySelector('.slx-fresh');
    /** 夥伴 from the command window (a click on its row). */
    const partners = () => { (root.querySelector('.slx-cmd [data-id=partners]') as HTMLElement).click(); };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    return { game, root, s, text, rows, label, fresh, partners, tick, storage };
  };

  it('夥伴 is the fifth command, marked 新 while a talk waits', () => {
    const plain = open();
    expect(plain.rows('.slx-cmd').map(plain.label)[4]).toBe('夥伴');
    expect(plain.fresh(plain.rows('.slx-cmd')[4])).toBe(false);
    const back = stageRinTalk();
    try {
      const t = open('all', rinReady);
      expect(t.fresh(t.rows('.slx-cmd')[4])).toBe(true);
      expect(t.rows('.slx-cmd')[4].querySelector('.slx-fresh')!.textContent).toBe('新');
    } finally { back(); }
  });

  it('談心 with nobody to talk to says so', () => {
    const t = open();
    t.partners();
    expect(t.rows('.slx-layer').map(t.label)).toEqual(['談心', '送禮']);   // Task 13 added 送禮
    t.s.onAction('confirm');
    expect(t.text()).toBe('現在還沒有誰想找你談心。');
    expect(t.root.querySelector('.slx-layer')).toBeNull();
  });

  it('談心 plays her talk, and once done today says so; 新 is gone', async () => {
    const back = stageRinTalk();
    try {
      const t = open('all', rinReady);
      t.partners();
      expect(t.fresh(t.rows('.slx-layer')[0])).toBe(true);
      t.s.onAction('confirm');                         // 談心
      expect(t.rows('.slx-layer.slx-depth-1').map(t.label)).toEqual(['凜']);   // the list over 夥伴's
      t.s.onAction('confirm');                         // 凜
      await t.tick();
      expect(t.text()).toBe('一');
      t.s.onAction('confirm'); await t.tick();          // the choice
      expect([...t.root.querySelectorAll('.slx-choice [role=option]')].map(t.label)).toEqual(['「後來呢？」', '（坐下。）']);
      t.s.onAction('down'); t.s.onAction('confirm'); await t.tick();
      expect(t.text()).toBe('三');
      t.s.onAction('confirm'); await t.tick();
      expect(t.text()).toBe('四');
      t.s.onAction('confirm'); await t.tick();
      expect(t.game.state.story.seen).toContain('bond:rin:1');
      expect(today(t.game.state).talked).toBe(true);
      expect(t.game.state.party.roster.rin.bond!.talk).toBe(3);   // stay is hers
      expect(t.fresh(t.rows('.slx-cmd')[4])).toBe(false);
      t.partners();
      expect(t.fresh(t.rows('.slx-layer')[0])).toBe(false);
      t.s.onAction('confirm');
      expect(t.text()).toBe('今天已經談過心了，明天再來吧。');
    } finally { back(); }
  });

  it('a talk the player opens plays though the story is set to none', async () => {
    const back = stageRinTalk();
    try {
      const t = open('none', rinReady);
      t.partners();
      t.s.onAction('confirm');
      t.s.onAction('confirm');
      await t.tick();
      expect(t.text()).toBe('一');                       // shown, not recorded as auto
      for (let i = 0; i < 4; i++) { t.s.onAction('confirm'); await t.tick(); }
      expect(t.game.state.story.seen).toContain('bond:rin:1');
      expect(t.game.state.story.fresh).not.toContain('bond:rin:1');
    } finally { back(); }
  });
});

describe('InnScene: gifts and the night walk (bond plan Task 13)', () => {
  const pools = (tag: string): GiftPools => ({
    loved: [`${tag}最愛一`, `${tag}最愛二`], liked: [`${tag}喜歡一`, `${tag}喜歡二`], neutral: [`${tag}普通`],
    declined: { 'king-scale': `${tag}婉拒` }, healed: {},
  });
  /** Rin's gift lines registered (before and after her choice), put back after. */
  const withRinGifts = <T,>(f: () => T): T => {
    const had = GIFT_LINES.rin;
    const hadOath = RIN_OATH.value;
    const box = (GIFT_LINES as Record<string, GiftPools | undefined>);
    box.rin = pools('前');
    RIN_OATH.value = pools('後');
    try { return f(); } finally { if (had) box.rin = had; else delete box.rin; RIN_OATH.value = hadOath; }
  };
  /** No gift lines written at all (bond plan Task 16 wrote all nine): the registry emptied for `f`, put back after. */
  const withNoGifts = <T,>(f: () => T): T => {
    const had = { ...GIFT_LINES };
    const hadOath = RIN_OATH.value;
    for (const c of Object.keys(GIFT_LINES)) delete (GIFT_LINES as Record<string, unknown>)[c];
    RIN_OATH.value = null;
    try { return f(); } finally { Object.assign(GIFT_LINES, had); RIN_OATH.value = hadOath; }
  };
  const open = (prep?: (g: Game) => void) => {
    const game = new Game(constRng(0.5), memoryStorage(), undefined, 0, ['hero', 'rin']);
    game.state.inventory = { 'dusk-cloth': 2, 'king-scale': 1, 'essence-common': 5, potion: 3 };
    prep?.(game);
    const root = document.createElement('div');
    const s = new InnScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity, 0);
    s.enter(root);
    s.onAction('confirm');
    const top = () => [...root.querySelectorAll('.slx-layer')].at(-1)!;
    const rows = () => [...top().querySelectorAll('[role=option]')];
    const label = (o: Element) => o.querySelector('.slx-label')!.textContent;
    const right = (o: Element) => o.querySelector('.slx-right')?.textContent ?? null;
    const pick = (text: string) => { const i = rows().findIndex((o) => label(o) === text); for (let k = 0; k < i; k++) s.onAction('down'); s.onAction('confirm'); };
    const partners = () => { (root.querySelector('.slx-cmd [data-id=partners]') as HTMLElement).click(); };
    const text = () => root.querySelector('.slx-talk .slx-text')!.textContent;
    const plate = () => root.querySelector('.slx-talk .slx-name')!.textContent;
    return { game, root, s, rows, label, right, pick, partners, text, plate, top };
  };

  it('送禮 lists who has lines, then only what she can be given; a declined gift stays and is marked', () => withRinGifts(() => {
    const t = open();
    t.partners();
    expect(t.rows().map(t.label)).toEqual(['談心', '送禮']);   // no night walk before the finale
    t.pick('送禮');
    expect(t.rows().map(t.label)).toEqual(['凜']);
    t.pick('凜');
    expect(t.rows().map(t.label)).toEqual(['暮影布', '王者之鱗']);   // held and giftable only
    expect(t.rows().map(t.right)).toEqual([null, null]);           // nothing known yet
    t.pick('王者之鱗');
    expect(t.root.querySelector('.slx-confirm')!.textContent).toContain('王者之鱗');
    expect(t.root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');   // 否 first
    t.s.onAction('up'); t.s.onAction('confirm');
    expect(t.text()).toBe('前婉拒');
    expect(t.plate()).toBe(CHARACTERS.rin.name);
    expect(t.game.state.inventory['king-scale']).toBe(1);
    t.s.onAction('confirm');
    t.partners(); t.pick('送禮'); t.pick('凜');
    expect(t.rows().map(t.right)).toEqual([null, '婉拒']);
  }));

  it('a loved gift: her line in her name, then greyed for the day; no keeper line follows', () => withRinGifts(() => {
    const t = open();
    t.partners(); t.pick('送禮'); t.pick('凜'); t.pick('暮影布');
    t.s.onAction('up'); t.s.onAction('confirm');
    expect(t.text()).toBe('前最愛一');
    expect(t.plate()).toBe(CHARACTERS.rin.name);   // not Marta
    t.s.onAction('confirm');
    expect(t.root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);   // no second box after hers
    t.partners(); t.pick('送禮');
    const rin = t.rows()[0];
    expect(rin.getAttribute('aria-disabled')).toBe('true');
    expect(t.right(rin)).toBe('今天已經收過了');
  }));

  it("Rin's lines read her choice", () => withRinGifts(() => {
    const t = open((g) => { g.state.party.roster.rin.memories = chainLength('rin'); g.state.party.roster.rin.oath = true; });
    t.partners(); t.pick('送禮'); t.pick('凜'); t.pick('暮影布');
    t.s.onAction('up'); t.s.onAction('confirm');
    expect(t.text()).toBe('後最愛一');
  }));

  it('nobody written, or nothing to give, is said', () => {
    withNoGifts(() => {
      const t = open();
      t.partners(); t.pick('送禮');
      expect(t.text()).toBe('現在還沒有誰能收下你的禮物。');
    });
    withRinGifts(() => {
      const u = open((g) => { g.state.inventory = { potion: 3 }; });
      u.partners(); u.pick('送禮'); u.pick('凜');
      expect(u.text()).toBe('你手上沒有能送的東西。');
    });
  });

  it('夜裡走走: only while the walk is open; the last row is 和大家一起; 否 first; she is for keeps', async () => {
    regAdd(ROMANCES_WRITTEN, 'liz');
    bondsAdd('liz');
    const id = 'romance:liz' as const;
    STORY.scenes[id] = { title: '莉茲・夜路', summary: '兩個人走了一段夜路。', lines: [{ who: 'liz', text: '走吧' }, { who: 'rin', text: '路上小心', if: { met: 'rin' } }] };
    try {
      const t = open((g) => {
        const st = g.state;
        st.story.act1Cleared = true; st.story.finaleCleared = true;
        st.story.seen.push('epilogue', 'bond:liz:1', 'bond:liz:2', 'bond:liz:3', 'bond:liz:4');
        st.party = meet(st.party, 'liz', 1);
        st.party.roster.liz.memories = chainLength('liz');
        st.party.roster.liz.bond = { talk: 12, field: 40, gifts: { 'old-coin': 24 } };
      });
      t.partners();
      expect(t.rows().map(t.label)).toEqual(['談心', '送禮', '夜裡走走']);
      t.pick('夜裡走走');
      expect(t.rows().map(t.label)).toEqual(['莉茲', '和大家一起']);
      t.pick('莉茲');
      expect(t.root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
      t.s.onAction('up'); t.s.onAction('confirm');
      await new Promise((r) => setTimeout(r, 0));
      expect(t.text()).toBe('走吧');
      expect(t.game.state.story.romance).toBe('liz');
      t.s.onAction('confirm'); await new Promise((r) => setTimeout(r, 0));
      t.s.onAction('confirm'); await new Promise((r) => setTimeout(r, 0));
      expect(t.game.state.story.seen).toContain(id);
      t.partners();
      expect(t.rows().map(t.label)).toEqual(['談心', '送禮']);   // asked: no walk until the next return
    } finally { romancesBack(); bondsBack(); scenesBack(id); }
  });

  /** After the finale and the festival, Liz at 心契 with her four bond scenes seen: the night walk is open. */
  const walkReady = () => open((g) => {
    const st = g.state;
    st.story.act1Cleared = true; st.story.finaleCleared = true;
    st.story.seen.push('epilogue', 'bond:liz:1', 'bond:liz:2', 'bond:liz:3', 'bond:liz:4');
    st.party = meet(st.party, 'liz', 1);
    st.party.roster.liz.memories = chainLength('liz');
    st.party.roster.liz.bond = { talk: 12, field: 40, gifts: { 'old-coin': 24 } };
  });

  it("和大家一起, written: the walk plays under tonight's sky and writes nothing (bond plan Task 20)", async () => {
    regAdd(ROMANCES_WRITTEN, 'liz');
    bondsAdd('liz');
    try {
      expect(TOGETHER_WRITTEN.value).toBe(true);
      const t = walkReady();
      const before = JSON.stringify(t.game.state);
      t.partners(); t.pick('夜裡走走'); t.pick('和大家一起');
      await new Promise((r) => setTimeout(r, 0));
      expect(t.text()).toContain('鎮上的夜路');
      for (let i = 0; i < 4; i++) { t.s.onAction('confirm'); await new Promise((r) => setTimeout(r, 0)); }
      expect(JSON.stringify(t.game.state)).toBe(before);
      expect(t.game.walkOpen()).toBe(false);
    } finally { romancesBack(); bondsBack(); }
  });

  it('和大家一起 writes nothing; unwritten, it is a line', () => {
    regAdd(ROMANCES_WRITTEN, 'liz');
    bondsAdd('liz');
    TOGETHER_WRITTEN.value = false;
    try {
      const t = open((g) => {
        const st = g.state;
        st.story.act1Cleared = true; st.story.finaleCleared = true;
        st.story.seen.push('epilogue', 'bond:liz:1', 'bond:liz:2', 'bond:liz:3', 'bond:liz:4');
        st.party = meet(st.party, 'liz', 1);
        st.party.roster.liz.memories = chainLength('liz');
        st.party.roster.liz.bond = { talk: 12, field: 40, gifts: { 'old-coin': 24 } };
      });
      const before = JSON.stringify(t.game.state);
      t.partners(); t.pick('夜裡走走'); t.pick('和大家一起');
      expect(t.text()).toBe('大家一起在星燈下走了一段路。');
      expect(JSON.stringify(t.game.state)).toBe(before);
      expect(t.game.walkOpen()).toBe(false);
    } finally { romancesBack(); bondsBack(); TOGETHER_WRITTEN.value = TOGETHER_BASE; }
  });
});

describe('InnScene: a healed refusal (review of bond plan Tasks 12-14)', () => {
  it('the gift list says 婉拒 after her healing until she has taken it, as the handbook does', () => {
    const had = GIFT_LINES.noel;
    GIFT_LINES.noel = { loved: ['甲', '乙'], liked: ['丙', '丁'], neutral: ['戊'], declined: { 'star-stone': '不要。' }, healed: { 'star-stone': '好。' } };
    try {
      const game = new Game(constRng(0.5), memoryStorage(), undefined, 0, ['hero', 'rin']);
      game.state = withTold(game.state, 'noel', chainLength('noel'));
      game.state.party.roster.noel.bond = { talk: 0, field: 0, gifts: {}, refused: ['star-stone'] };
      game.state.inventory = { 'star-stone': 2 };
      const root = document.createElement('div');
      const s = new InnScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity, 0);
      s.enter(root);
      s.onAction('confirm');
      const right = () => [...[...root.querySelectorAll('.slx-layer')].at(-1)!.querySelectorAll('[role=option] .slx-right')].map((e) => e.textContent);
      (root.querySelector('.slx-cmd [data-id=partners]') as HTMLElement).click();
      s.onAction('down'); s.onAction('confirm');   // 送禮
      s.onAction('down'); s.onAction('confirm');   // 諾艾兒 (after 凜: every gift table is written since Task 16)
      expect(right()).toEqual(['婉拒']);
    } finally { if (had) GIFT_LINES.noel = had; else delete GIFT_LINES.noel; }
  });
});

describe('InnScene: a talk still waiting (review of bond plan Tasks 12-14)', () => {
  it('a talk cut short and still waiting is said as that, not as today\'s talk had', () => {
    const back = stageRinTalk();
    try {
      const game = new Game(constRng(0.5), memoryStorage(), undefined, 0, ['hero', 'rin']);
      rinReady(game);
      game.pending.push('bond:rin:1');   // opened, never finished (its play failed): it waits for the next return
      const root = document.createElement('div');
      const s = new InnScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity, 0);
      s.enter(root);
      s.onAction('confirm');
      (root.querySelector('.slx-cmd [data-id=partners]') as HTMLElement).click();
      s.onAction('confirm');   // 談心
      s.onAction('confirm');   // 凜
      expect(today(game.state).talked).toBe(false);
      expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('剛才那段談心沒能說完，等下次回城再說吧。');
    } finally { back(); }
  });
});
