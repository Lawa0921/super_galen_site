import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng, memoryStorage, plainItem, withGuildLive } from '../../engine/testing';
import { GUILD_TEXT } from '../../data/guild.zh-TW';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { GuildScene } from './guild';
import { LEGACY_LINEUP, START_LINEUP, meet } from '../../engine/party';
import { T } from '../../data/text.zh-TW';
import { CHARACTERS } from '../../data/characters';
import { ABSORB_CAP, ABSORB_GAIN, PERKS, SHARD_IDS, SHARD_NAMES, SHARD_PRICE, TOWN_FRAGMENTS } from '../../data/story/fragments';
import { STORY, flatLines } from '../../data/story.zh-TW';
import { linesOf } from '../story';
import { DEFAULT_SETTINGS, type StoryMode } from '../settings';
import { MEETINGS } from '../../data/meetings';

const HERO_LINEUP = ['hero', 'chizuru', 'liz', 'noel', 'selene'] as const;
/** Rin and the hero on the field, Bobby met and waiting. */
const benchBobby = (g: Game) => {
  g.state.party = meet(g.state.party, 'bobby', 1);
  g.state.party = { ...g.state.party, grid: g.state.party.grid.map((c) => (c === 'bobby' ? null : c)) };
};

function setup(from?: 'formation' | 'status' | 'workshop', lineup: readonly string[] = LEGACY_LINEUP, prep?: (g: Game) => void, story?: StoryMode, art: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.5), memoryStorage(), undefined, 0, [...lineup] as never);
  prep?.(game);
  game.state.gold = 1000;
  game.state.bag = [plainItem('iron-sword', 1)];
  game.state.nextUid = 2;
  const root = document.createElement('div');
  const go = vi.fn();
  const s = new GuildScene({ game, art, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), from, settings: story ? ({ get: () => ({ ...DEFAULT_SETTINGS, story }) } as never) : undefined }, Infinity);
  s.enter(root);
  // the greeting, and on the first visit of a stay the guild's lead after it (final review M-2 ruling)
  if (!from) for (let i = 0; i < 2 && !root.querySelector<HTMLElement>('.slx-talk')!.hidden; i++) s.onAction('confirm');
  const opts = () => [...root.querySelectorAll('.slx-layer:last-child [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  const pick = (label: string) => {
    const layer = root.querySelector('.slx-layer:last-child') ?? root.querySelector('.slx-cmd')!;
    const all = [...layer.querySelectorAll('[role=option]')];
    const i = all.findIndex((o) => o.querySelector('.slx-label')!.textContent === label);
    if (i < 0) throw new Error(`no option ${label}: ${all.map((o) => o.textContent).join('/')}`);
    (all[i] as HTMLElement).click();
  };
  return { game, root, s, opts, pick, go };
}

describe('GuildScene', () => {
  it('lists the guild commands', () => {
    const { root } = setup();
    expect([...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.textContent)).toEqual(['編隊', T.ui2.guild.recall, '裝備', '狀態', '技能樹', T.ui2.guild.workshop, '天賦', T.ui2.exchange.title, T.ui2.handbook.title, '離開']);
  });

  it('the guild opens the workshop', () => {
    const { root, pick, go } = setup();
    const labels = [...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.textContent);
    expect(labels.indexOf(T.ui2.guild.workshop)).toBe(labels.indexOf(T.ui2.guild.tree) + 1);
    pick(T.ui2.guild.workshop);
    expect(go).toHaveBeenCalledWith('workshop');
  });

  it('coming back from the workshop does not greet again', () => {
    const rng = vi.fn(() => 0.5);
    const { root } = setup('workshop', LEGACY_LINEUP, (g) => { Object.assign(g, { rng }); });
    expect(rng).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(true);
    expect(root.querySelector('.slx-cmd [aria-selected=true]')!.textContent).toBe(T.ui2.guild.workshop);
  });

  it('the guild opens the handbook', () => {
    const { pick, go } = setup();
    pick(T.ui2.handbook.title);
    expect(go).toHaveBeenCalledWith('handbook');
  });

  it('recall is disabled when nobody waits', () => {
    const { root } = setup();
    const o = [...root.querySelectorAll('.slx-cmd [role=option]')].find((x) => x.textContent === T.ui2.guild.recall)!;
    expect(o.getAttribute('aria-disabled')).toBe('true');
  });

  it('recall with room asks once and places her', () => {
    const { game, pick, s, root } = setup(undefined, START_LINEUP, benchBobby);
    pick(T.ui2.guild.recall);
    expect(root.textContent).toContain(T.ui2.guild.roles.bobby);   // the info panel shows the list's first entry
    pick('技師 波比');
    expect(root.textContent).toContain(T.ui2.guild.recallAsk('波比'));
    s.onAction('up');      // confirm box defaults to 否; up wraps to 是
    s.onAction('confirm');
    expect(game.state.party.grid).toContain('bobby');
    expect(root.textContent).toContain(T.ui2.guild.welcomeBack('波比'));
  });

  it('recall places the one picked, not the first on the list', () => {
    const { game, pick, s } = setup(undefined, START_LINEUP, (g) => {
      benchBobby(g);
      g.state.party = meet(g.state.party, 'sylvie', 1);
      g.state.party = { ...g.state.party, grid: g.state.party.grid.map((c) => (c === 'sylvie' ? null : c)) };
    });
    pick(T.ui2.guild.recall);
    pick('森林遊俠 希爾薇');
    s.onAction('up');
    s.onAction('confirm');
    expect(game.state.party.grid).toContain('sylvie');
    expect(game.state.party.grid).not.toContain('bobby');
  });

  it('declining the confirmation changes nothing', () => {
    const { game, pick, s } = setup(undefined, START_LINEUP, benchBobby);
    pick(T.ui2.guild.recall);
    pick('技師 波比');
    s.onAction('confirm');   // the box defaults to 否
    expect(game.state.party.grid).not.toContain('bobby');
  });

  it('recall with a full field asks who steps out', () => {
    const { game, pick, s, root } = setup(undefined, HERO_LINEUP, (g) => { g.state.party = meet(g.state.party, 'bobby', 1); });
    expect(game.state.party.grid).not.toContain('bobby');
    pick(T.ui2.guild.recall);
    pick('技師 波比');
    s.onAction('up');
    s.onAction('confirm');
    expect(root.textContent).toContain(T.ui2.guild.swapWho);
    const labels = [...root.querySelectorAll('.slx-layer:last-child [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent!);
    expect(labels).toHaveLength(4);
    expect(labels.some((l) => l.includes('洛恩'))).toBe(false);   // the hero never steps out
    const cell = game.state.party.grid.indexOf('noel');
    pick(labels.find((l) => l.includes('諾艾兒'))!);   // not the first on the list
    expect(game.state.party.grid[cell]).toBe('bobby');   // she takes his cell
    expect(game.state.party.grid).not.toContain('noel');
    for (const id of ['hero', 'chizuru', 'liz', 'selene'] as const) expect(game.state.party.grid, id).toContain(id);
    expect(game.state.party.grid.filter((c) => c).length).toBe(5);
  });

  it('while asking who steps out, the info pane shows the highlighted candidate, clear of the list', () => {
    const { pick, s, root } = setup(undefined, HERO_LINEUP, (g) => { g.state.party = meet(g.state.party, 'bobby', 1); });
    pick(T.ui2.guild.recall);
    pick('技師 波比');
    s.onAction('up');
    s.onAction('confirm');
    const info = () => root.querySelector('.slx-info')!;
    expect(info().classList.contains('slx-info-swap')).toBe(true);   // moved right of the nested list
    expect(info().textContent).toContain(T.ui2.guild.swapOut(CHARACTERS.chizuru.name));
    expect(info().textContent).not.toContain('技師');
    s.onAction('down');
    expect(info().textContent).toContain(T.ui2.guild.swapOut(CHARACTERS.liz.name));
    s.onAction('cancel');
    expect(info().classList.contains('slx-info-swap')).toBe(false);
    expect(info().textContent).toContain('技師 波比');
  });

  it('opens the formation, equipment and status screens', () => {
    const { pick, go } = setup();
    pick('編隊');
    expect(go).toHaveBeenLastCalledWith('formation');
    pick('裝備');
    expect(go).toHaveBeenLastCalledWith('equip');
    pick('狀態');
    expect(go).toHaveBeenLastCalledWith('status');
  });

  it('技能樹 and 天賦 open the status screen on their tab', () => {
    const { pick, go } = setup();
    pick('技能樹');
    expect(go).toHaveBeenLastCalledWith('status', 'tab:tree');
    pick('天賦');
    expect(go).toHaveBeenLastCalledWith('status', 'tab:talent');
  });

  it('skips the greeting when coming back from one of its own screens, with the cursor on that command', () => {
    const { root } = setup('formation');
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.slx-cmd [aria-selected=true]')!.textContent).toBe('編隊');
    const back = setup('status');
    expect(back.root.querySelector('.slx-cmd [aria-selected=true]')!.textContent).toBe('狀態');
  });
});

/** Plays the dialogue to its end by confirming every line; returns the lines it showed. */
async function drain(root: HTMLElement, s: GuildScene): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (root.querySelector('.slx-talk')!.hasAttribute('hidden')) break;
    seen.push(root.querySelector('.slx-talk .slx-text')!.textContent ?? '');
    s.onAction('confirm');
  }
  return seen;
}
const stock = (g: Game, items: Record<string, number>) => { Object.assign(g.state.inventory, items); };
const row = (root: HTMLElement, label: string) => [...root.querySelectorAll('.slx-layer:last-child [role=option]')].find((o) => o.textContent!.includes(label)) as HTMLElement;
const cmd = (root: HTMLElement, label: string) => [...root.querySelectorAll('.slx-cmd [role=option]')].find((o) => o.textContent === label) as HTMLElement;

describe('GuildScene fragment exchange', () => {
  it('a refused sale goes back to the exchange menu, not to a stale grade list', () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { [SHARD_IDS.clear]: 3 }));
    vi.spyOn(game, 'sellShards').mockReturnValue({ ok: false, reason: 'stock' });
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.sell);
    pick(SHARD_NAMES.clear);
    s.onAction('confirm');
    expect(row(root, T.ui2.exchange.sell)).toBeDefined();
    expect(row(root, SHARD_NAMES.clear)).toBeUndefined();
    expect(game.state.gold).toBe(1000);
  });

  it('the exchange sells shards for their price', () => {
    const { game, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { [SHARD_IDS.clear]: 3 }));
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.sell);
    pick(SHARD_NAMES.clear);
    s.onAction('right');   // two of three
    s.onAction('confirm');
    expect(game.state.gold).toBe(1000 + 2 * SHARD_PRICE.clear);
    expect(game.state.inventory[SHARD_IDS.clear]).toBe(1);
  });

  it("Anna's returned fragment lifts the price shown and paid", () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => { stock(g, { [SHARD_IDS.dim]: 1 }); g.state.story.returned.push('anna'); });
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.sell);
    const paid = Math.round(SHARD_PRICE.dim * PERKS.shardPriceMul);
    expect(row(root, SHARD_NAMES.dim).textContent).toContain(`${paid} G`);
    pick(SHARD_NAMES.dim);
    s.onAction('confirm');
    expect(game.state.gold).toBe(1000 + paid);
  });

  it('absorbing shows the count and the cap, and refuses a full member', () => {
    const { game, root, pick } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { [SHARD_IDS.dim]: 2 }));
    const [a, b] = game.state.party.recruited;
    game.state.party.roster[b].absorbed = Array.from({ length: ABSORB_CAP }, () => ({ stat: 'atk' as const, amount: 1 }));
    game.state.party.roster[a].absorbed = [{ stat: 'atk', amount: 1 }];
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.absorb);
    pick(SHARD_NAMES.dim);
    expect(root.textContent).toContain(T.ui2.exchange.who);
    expect(row(root, CHARACTERS[a].name).textContent).toContain(T.ui2.exchange.count(1, ABSORB_CAP));
    const full = row(root, CHARACTERS[b].name);
    expect(full.textContent).toContain(T.ui2.exchange.count(ABSORB_CAP, ABSORB_CAP));
    expect(full.getAttribute('aria-disabled')).toBe('true');
    full.click();
    expect(root.querySelector('.slx-confirm')).toBeNull();
    expect(game.state.party.roster[b].absorbed).toHaveLength(ABSORB_CAP);
    expect(game.state.inventory[SHARD_IDS.dim]).toBe(2);
  });

  it("absorbing says a stranger's line and the gain", async () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { [SHARD_IDS.vivid]: 1 }));
    const id = game.state.party.recruited[0];
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.absorb);
    pick(SHARD_NAMES.vivid);
    row(root, CHARACTERS[id].name).click();
    pick('是');
    const gain = game.state.party.roster[id].absorbed!.at(-1)!;
    expect(gain.amount).toBe(ABSORB_GAIN.vivid[gain.stat]);
    const lines = await drain(root, s);
    expect(lines).toHaveLength(2);
    expect(STORY.absorb).toContain(lines[0]);
    expect(lines[1]).toContain(`${T.gear.statName[gain.stat]} +${gain.amount}`);
    expect(game.state.inventory[SHARD_IDS.vivid]).toBeUndefined();
  });

  it("a stranger's line is nobody's: no nameplate, no face, a remembered box, Anna's face left neutral; the gain is Anna's", async () => {
    const art: ArtIndex = { has: () => true };
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { [SHARD_IDS.dim]: 1 }), undefined, art);
    const id = game.state.party.recruited[0];
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.absorb);
    pick(SHARD_NAMES.dim);
    row(root, CHARACTERS[id].name).click();
    pick('是');
    await new Promise((r) => setTimeout(r, 0));
    const talk = root.querySelector('.slx-talk')!;
    const name = talk.querySelector('.slx-name') as HTMLElement;
    expect(STORY.absorb).toContain(talk.querySelector('.slx-text')!.textContent);
    expect(name.hidden || name.textContent === '').toBe(true);
    expect(talk.textContent).not.toContain(T.ui2.facility.guild.npc);
    expect(talk.querySelector('.slx-talk-face')).toBeNull();
    expect(talk.classList.contains('slx-talk--memory')).toBe(true);
    expect(root.querySelector('.slx-npc')!.getAttribute('src')).not.toContain('guild-happy');
    s.onAction('confirm');
    await new Promise((r) => setTimeout(r, 0));
    expect(name.hidden).toBe(false);
    expect(name.textContent).toBe(T.ui2.facility.guild.npc);
    expect(talk.querySelector('.slx-text')!.textContent).toContain(T.gear.statName[game.state.party.roster[id].absorbed!.at(-1)!.stat]);
    expect(talk.classList.contains('slx-talk--memory')).toBe(false);
  });

  it('absorbing lists only the members the party has met', () => {
    const { game, root, pick } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { [SHARD_IDS.dim]: 1 }));
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.absorb);
    pick(SHARD_NAMES.dim);
    const names = [...root.querySelectorAll('.slx-layer:last-child [role=option] .slx-label')].map((o) => o.textContent);
    expect(names).toHaveLength(game.state.party.recruited.length);
    expect(names.some((n) => n!.includes(CHARACTERS.bobby.name))).toBe(false);
  });

  it('giving back a fragment plays its return and pays the reward', async () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { 'tf-anna': 1 }));
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.give);
    pick('安娜的記憶碎片');
    pick('是');
    expect(game.state.story.returned).toContain('anna');
    expect(game.pending).toEqual(['town:anna']);   // it leaves `pending` only once the scene is done
    const lines = await drain(root, s);
    expect(game.pending).toEqual([]);
    const script = flatLines(linesOf('town:anna', game.state)).map((l) => l.text);
    expect(lines.slice(0, script.length)).toEqual(script);
    expect(lines.length).toBeGreaterThan(script.length);   // the reward line follows
    expect(game.state.inventory['star-tear']).toBe(1);
    expect(game.state.inventory['tf-anna']).toBeUndefined();
  });

  it('a story mode of none skips the return scene but still pays and consumes it', async () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { 'tf-orik': 1 }), 'none');
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.give);
    pick('歐里克的記憶碎片');
    pick('是');
    const lines = await drain(root, s);
    expect(lines).toHaveLength(1);
    expect(game.pending).toEqual([]);
    expect(game.state.gold).toBe(1000 + TOWN_FRAGMENTS.find((f) => f.id === 'orik')!.reward.gold!);
  });

  it('a played return is recorded as seen', async () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { 'tf-anna': 1 }));
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.give);
    pick('安娜的記憶碎片');
    pick('是');
    expect(game.state.story.seen).not.toContain('town:anna');   // still playing
    await drain(root, s);
    expect(game.state.story.seen).toContain('town:anna');
    expect(game.state.story.fresh).toEqual([]);   // played, so it is not new
    expect(game.pending).toEqual([]);
  });

  it('a story mode of none records the return as auto: seen and new', async () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { 'tf-orik': 1 }), 'none');
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.give);
    pick('歐里克的記憶碎片');
    pick('是');
    await drain(root, s);
    expect(game.state.story.seen).toContain('town:orik');
    expect(game.state.story.fresh).toContain('town:orik');
    expect(game.pending).toEqual([]);
  });

  it('a return scene that throws is reported, the command window comes back and the reward still shows', async () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { 'tf-anna': 1 }));
    vi.spyOn(game, 'sceneDone').mockImplementation(() => { throw new Error('boom'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.give);
    pick('安娜的記憶碎片');
    pick('是');
    const lines = await drain(root, s);
    expect(err).toHaveBeenCalled();
    expect(lines[lines.length - 1]).toContain('×1');   // the reward line, after the failed scene
    expect(game.state.inventory['star-tear']).toBe(1);
    expect(root.querySelector('.slx-cmd')!.classList.contains('slx-cmd-hidden')).toBe(false);
    err.mockRestore();
  });

  it('a fragment that was already returned says so', async () => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, (g) => { stock(g, { 'tf-anna': 1 }); g.state.story.returned.push('anna'); });
    pick(T.ui2.exchange.title);
    pick(T.ui2.exchange.give);
    pick('安娜的記憶碎片');
    pick('是');
    const lines = await drain(root, s);
    expect(lines).toEqual([T.ui2.exchange.giveFail.invalid]);
    expect(game.state.inventory['tf-anna']).toBe(1);
    expect(game.pending).toEqual([]);
  });

  it('empty lists are disabled, and the exchange itself never is', () => {
    const { root, pick } = setup();
    expect(cmd(root, T.ui2.exchange.title).getAttribute('aria-disabled')).toBe('false');
    pick(T.ui2.exchange.title);
    for (const label of [T.ui2.exchange.sell, T.ui2.exchange.absorb, T.ui2.exchange.give]) expect(row(root, label).getAttribute('aria-disabled'), label).toBe('true');
    const stocked = setup(undefined, LEGACY_LINEUP, (g) => stock(g, { [SHARD_IDS.dim]: 1, 'tf-glen': 1 }));
    stocked.pick(T.ui2.exchange.title);
    for (const label of [T.ui2.exchange.sell, T.ui2.exchange.absorb, T.ui2.exchange.give]) expect(row(stocked.root, label).getAttribute('aria-disabled'), label).toBe('false');
  });
});

describe("GuildScene: the guild's lead (6c Task 16)", () => {
  /** The guild entered fresh from the town, with an rng that counts its draws. */
  const enter = (prep?: (g: Game) => void) => {
    const counter = { n: 0 };
    const game = new Game(() => { counter.n++; return 0.5; }, memoryStorage(), undefined, 0, [...START_LINEUP]);
    prep?.(game);
    counter.n = 0;
    const root = document.createElement('div');
    const s = new GuildScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    return { game, root, s, counter, said: () => root.querySelector('.slx-talk .slx-text')!.textContent };
  };

  it("a new game: Anna greets as usual, then passes on Selene's lead in a second box, with the greeting's one draw", () => {
    const { said, counter, root, s } = enter();
    expect(STORY.greet.guild.prologue).toContain(said());
    expect(counter.n).toBe(1);   // the greeting's one draw, and the lead takes none: the stream after the guild is the same
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(true);
    s.onAction('confirm');
    expect(said()).toBe(STORY.leads.selene);
    expect(root.querySelector('.slx-talk .slx-name')!.textContent).toBe(T.ui2.facility.guild.npc);
    expect(root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(false);
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(true);   // the menu stays locked under the second box
    s.onAction('confirm');
    expect(root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(true);   // two boxes: two confirms and the guild is free
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(false);
    expect(counter.n).toBe(1);
  });

  it('a click on the box brings the lead as well', () => {
    const { said, root } = enter();
    root.querySelector<HTMLElement>('.slx-talk')!.click();
    expect(said()).toBe(STORY.leads.selene);
    expect(root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(false);
  });

  it('the menu stays locked under the lead, after the first line has settled', async () => {
    const { root, s } = enter();
    s.onAction('confirm');
    await Promise.resolve(); await Promise.resolve();   // the greeting's own promise settles after the lead is up
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(true);
  });

  it('the lead follows who is met: past the prologue with Selene met, the frost', () => {
    const { said, s } = enter((g) => { g.state.party = meet(g.state.party, 'selene', 1); g.state.dungeon.reached.mainline = 2; });
    expect(STORY.greet.guild.act1).toContain(said());
    s.onAction('confirm');
    expect(said()).toBe(STORY.leads.chizuru);
  });

  it('nobody left out there: the plain greeting of the stage, one box', () => {
    const { said, counter, s, root } = enter((g) => { for (const m of MEETINGS) g.state.party = meet(g.state.party, m.id, 1); });
    expect(STORY.greet.guild.prologue).toContain(said());
    expect(counter.n).toBe(1);
    s.onAction('confirm');
    expect(root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(true);
  });

  it('coming back from one of its own screens says nothing, lead or not', () => {
    const counter = { n: 0 };
    const game = new Game(() => { counter.n++; return 0.5; }, memoryStorage(), undefined, 0, [...START_LINEUP]);
    counter.n = 0;
    const root = document.createElement('div');
    new GuildScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), from: 'formation' }, Infinity).enter(root);
    expect(root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(true);
    expect(counter.n).toBe(0);
  });
});

describe('GuildScene: the lead once per arrival, after the greeting (final review M-2 ruling)', () => {
  /** A game whose rng returns what `next` holds, so a test picks the greeting each visit draws. */
  const world = (prep?: (g: Game) => void) => {
    const r = { next: 0.5, n: 0 };
    const game = new Game(() => { r.n++; return r.next; }, memoryStorage(), undefined, 0, [...START_LINEUP]);
    prep?.(game);
    r.n = 0;
    /** One visit from the town: every box Anna says, in order, each closed with a confirm. */
    const visit = (): string[] => {
      const root = document.createElement('div');
      const s = new GuildScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
      s.enter(root);
      const box = root.querySelector<HTMLElement>('.slx-talk')!;
      const said: string[] = [];
      for (let i = 0; i < 4 && !box.hidden; i++) {
        said.push(root.querySelector('.slx-talk .slx-text')!.textContent!);
        s.onAction('confirm');
      }
      s.exit();
      return said;
    };
    return { game, r, visit };
  };
  const act1 = (g: Game) => { g.state.party = meet(g.state.party, 'selene', 1); g.state.dungeon.reached.mainline = 2; };

  it('the first visit of a stay says the greeting, then the lead; a second visit in the same stay says the greeting only', () => {
    const { visit, r } = world();
    const first = visit();
    expect(first).toHaveLength(2);
    expect(STORY.greet.guild.prologue).toContain(first[0]);
    expect(first[1]).toBe(STORY.leads.selene);
    const second = visit();
    expect(second).toHaveLength(1);
    expect(STORY.greet.guild.prologue).toContain(second[0]);
    expect(r.n).toBe(2);   // one draw per visit, lead or not
  });

  it('a new arrival brings the lead back', () => {
    const { visit, game } = world(act1);
    game.state.inventory['return-lamp'] = 1;
    expect(visit()[1]).toBe(STORY.leads.chizuru);
    expect(visit()).toHaveLength(1);
    expect(game.depart({ region: 'mainline', condition: 'plain' }, 1)).toEqual({ ok: true });
    expect(game.useReturnLamp()).toBe(true);
    expect(visit()[1]).toBe(STORY.leads.chizuru);
  });

  it('every drawn greeting is said on the lead visit, the payoffs too: the debt paid off (I-96) and her thanks', () => {
    const debt = world(act1);
    expect(STORY.greet.guild.act1[0]).toContain('劃掉了');
    debt.r.next = 0;                                 // draws act 1's first line, the debt
    expect(debt.visit()).toEqual([STORY.greet.guild.act1[0], STORY.leads.chizuru]);
    const thanks = world((g) => { g.state.story.returned.push('anna'); });
    const pool = [...STORY.greet.guild.prologue, STORY.town.anna.after];
    thanks.r.next = 0.99;   // draws the thanks, the pool's last line
    expect(Math.floor(0.99 * pool.length)).toBe(pool.length - 1);
    expect(thanks.visit()).toEqual([STORY.town.anna.after, STORY.leads.selene]);
    // A thread-bearing greeting of a later act is heard on the lead visit as well (act 2's first line, the stone that glows).
    const act2 = world((g) => { act1(g); g.state.story.nodes.push('act2'); });
    act2.r.next = 0;
    expect(act2.visit()).toEqual([STORY.greet.guild.act2[0], STORY.leads.chizuru]);
  });
});

describe('GuildScene: the guild board on the list (guild quests plan Task B1)', () => {
  const LIST = ['編隊', T.ui2.guild.recall, '裝備', '狀態', '技能樹', T.ui2.guild.workshop, '天賦', T.ui2.exchange.title, T.ui2.handbook.title, '離開'];
  const commands = (root: HTMLElement) => [...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.textContent);
  const open = (g: Game) => { g.state.story.act1Cleared = true; };
  /** Anna's locked line, for one test: the registry is empty until PR C writes it. */
  const withLocked = <R,>(line: string, f: () => R): R => {
    const was = GUILD_TEXT.anna.locked;
    GUILD_TEXT.anna.locked = line;
    try { return f(); } finally { if (was === undefined) delete GUILD_TEXT.anna.locked; else GUILD_TEXT.anna.locked = was; }
  };

  it("the board is not on the guild's list while the switch is off", () => {
    expect(commands(setup(undefined, LEGACY_LINEUP, open).root)).toEqual(LIST);
  });

  it('with the switch on, the board comes last before leaving', () => withGuildLive(() => {
    expect(commands(setup().root)).toEqual([...LIST.slice(0, -1), T.ui2.board.title, '離開']);   // locked, it is still there
    expect(commands(setup(undefined, LEGACY_LINEUP, open).root)).toEqual([...LIST.slice(0, -1), T.ui2.board.title, '離開']);
  }));

  it('locked before the first act: one line, nothing written', () => withGuildLive(() => {
    const { game, root, pick, s } = setup();
    const error = vi.mocked(s['ctx'].sfx.error);
    pick(T.ui2.board.title);
    expect(game.state.guild).toBeUndefined();
    expect(root.querySelector('.slx-layer')).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    // Nothing written for Anna (PR C deferred, spec §0 item 24): the guild's box says when the board opens, in plain words.
    expect(root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(false);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe(T.ui2.board.locked);
    s.onAction('confirm');   // the line read
    expect(root.querySelector<HTMLElement>('.slx-talk')!.hidden).toBe(true);
    withLocked('LOCKED', () => {
      pick(T.ui2.board.title);
      expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('LOCKED');
    });
    expect(game.state.guild).toBeUndefined();
  }));

  it('locked reads guildOpen: shut, the first act over is still locked', () => withGuildLive(() => {
    const { game, root, pick, s } = setup(undefined, LEGACY_LINEUP, open);
    pick(T.ui2.board.title);
    expect(game.state.guild).toBeUndefined();
    expect(root.querySelector('.slx-layer')).toBeNull();
    expect(vi.mocked(s['ctx'].sfx.error)).toHaveBeenCalledTimes(1);
  }, { open: false }));

  it("listed, the board makes the window's rows 16px tall (slx-cmd-board) so its eleven stand above Anna's box; off, today's window", () => {
    expect(setup().root.querySelector('.slx-cmd')!.classList.contains('slx-cmd-board')).toBe(false);
    withGuildLive(() => expect(setup().root.querySelector('.slx-cmd')!.classList.contains('slx-cmd-board')).toBe(true));
  });

  it('opening the board draws no greeting', () => withGuildLive(() => {
    const rng = vi.fn(() => 0.5);
    const { game, root, pick } = setup(undefined, LEGACY_LINEUP, (g) => { open(g); Object.assign(g, { rng }); });
    const before = rng.mock.calls.length;
    pick(T.ui2.board.title);
    expect(rng.mock.calls.length).toBe(before);
    expect(root.querySelector('.slx-layer')).not.toBeNull();
    expect(game.state.guild?.viewed).toBe(game.state.guild?.day);
  }));
});
