import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_IDS, CHARACTERS, titleOf } from '../../data/characters';
import { TOWN_FRAGMENTS } from '../../data/story/fragments';
import { BONDS_WRITTEN, memScene, type SceneId } from '../../data/story/scenes';
import { STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { Game } from '../../engine/game';
import { meet } from '../../engine/party';
import type { SaveStorage } from '../../engine/save';
import { restoreNight } from '../../engine/story/nights';
import { WAVE_1_LIVE, constRng, memoryStorage, withRosterLive, withRosterOnly } from '../../engine/testing';
import { BESTIARY, BESTIARY_UI } from '../../data/bestiary.zh-TW';
import { ENEMIES } from '../../data/enemies';
import { MATERIALS } from '../../data/materials';
import { codexName } from '../../data/gear';
import type { CharacterId } from '../../engine/types';
import { art, enemyArt } from '../../render/artPaths';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { artIdOf } from '../../ui/art';
import { HandbookScene, tabsFor } from './handbook';
import { AFFIXES, AFFIX_IDS } from '../../data/affixes';
import { TIERS } from '../../data/difficulty';
import { HELL_BOSS_DEPTH, NIGHTMARE_DEPTH } from '../../engine/tiers';
/**
 * Bond plan Task 17: the registries hold what is written now, so a test that registers its own puts back what was there
 * (`bondsBack`), registers a companion only once (`bondsAdd`), and gives a written scene back instead of deleting it.
 */
const BOND_BASE = [...BONDS_WRITTEN];
const bondsAdd = (...cs: (typeof BONDS_WRITTEN)[number][]): void => { for (const c of cs) if (!BONDS_WRITTEN.includes(c)) BONDS_WRITTEN.push(c); };
const bondsBack = (): void => { BONDS_WRITTEN.splice(0, BONDS_WRITTEN.length, ...BOND_BASE); };
const SCENES_BASE = { ...STORY.scenes };
const scenesBack = (id: keyof typeof STORY.scenes): void => { if (SCENES_BASE[id]) STORY.scenes[id] = SCENES_BASE[id]; else delete (STORY.scenes as Partial<typeof STORY.scenes>)[id]; };

const H = T.ui2.handbook;

function setup(arg?: string, prep?: (g: Game) => void, artIndex: ArtIndex = NO_ART, storage: SaveStorage | null = null) {
  const game = new Game(constRng(0.5), storage);
  prep?.(game);
  const root = document.createElement('div');
  const go = vi.fn();
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new HandbookScene({ game, art: artIndex, sfx, go, hasSave: () => false, newGame: vi.fn(), from: 'town', arg }, Infinity);
  s.enter(root);
  const tabs = () => [...root.querySelectorAll('.slx-tab')].map((t) => t.textContent);
  const tab = () => root.querySelector('.slx-tab-sel')!.textContent;
  const rows = () => [...root.querySelectorAll('.slx-hb-list [role=option]')];
  const labels = () => rows().map((r) => r.querySelector('.slx-label')!.textContent);
  const row = (label: string) => {
    const r = rows().find((x) => x.querySelector('.slx-label')!.textContent === label);
    if (!r) throw new Error(`no row ${label} in ${labels().join('|')}`);
    return r as HTMLElement;
  };
  const pick = (label: string) => row(label).click();
  const goTab = (name: string) => { for (let i = 0; i < 6 && tab() !== name; i++) s.onAction('next'); };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  /** Replays whatever is on screen the short way: cancel to the summary, confirm to close it. */
  const skipScene = async () => { await settle(); s.onAction('cancel'); await settle(); s.onAction('confirm'); await settle(); };
  const fresh = (label: string) => !!row(label).querySelector('.slx-fresh');
  return { game, root, go, s, tabs, tab, rows, labels, row, pick, goTab, settle, skipScene, fresh, sfx };
}

const meetAll = (g: Game, ids: CharacterId[], memories = 0) => {
  for (const id of ids) {
    if (!g.state.party.recruited.includes(id)) g.state.party = meet(g.state.party, id, 1);
    g.state.party.roster[id].memories = memories;
  }
};

describe('HandbookScene', () => {
  it('the six tabs are there in order', () => {
    const { tabs, tab, s } = setup();
    // 6c Task 16 adds 線索 after 人物: who is still out there sits beside who has been met.
    expect(tabs()).toEqual([H.tabs.memories, H.tabs.people, H.tabs.leads, H.tabs.town, H.tabs.codex, H.tabs.truths]);
    expect(tab()).toBe(H.tabs.memories);
    s.onAction('next');
    expect(tab()).toBe(H.tabs.people);
    s.onAction('prev'); s.onAction('prev');
    expect(tab()).toBe(H.tabs.truths);
  });

  it('replaying a memory changes no progress but clears the new mark', async () => {
    const piece = memScene('noel', 1);
    const t = setup(undefined, (g) => {
      meetAll(g, ['noel'], 2);
      g.state.story.seen = [piece, memScene('noel', 2)];
      g.state.story.fresh = [piece];
    });
    const done = vi.spyOn(t.game, 'sceneDone');
    const before = structuredClone({ ...t.game.state.story, fresh: [] });
    t.pick(CHARACTERS.noel.name);
    const title = STORY.scenes[piece].title;
    expect(t.fresh(title)).toBe(true);
    expect(t.row(title).querySelector('.slx-fresh')!.textContent).toBe(H.fresh);
    t.pick(title);
    expect(t.root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(false);
    await t.skipScene();
    expect(t.fresh(title)).toBe(false);
    expect(done).not.toHaveBeenCalled();
    expect({ ...t.game.state.story, fresh: [] }).toEqual(before);
    expect(t.game.state.story.fresh).toEqual([]);
  });

  it('a found piece still untold is playable and new, and a missing one shows ？？？ with its hint (story L)', () => {
    const t = setup(undefined, (g) => {
      meetAll(g, ['noel'], 2);
      g.state.story.seen = [memScene('noel', 1)];
      g.state.story.untold = [memScene('noel', 2)];
    });
    expect(t.fresh(CHARACTERS.noel.name)).toBe(true);   // her row is new while a piece is untold
    t.pick(CHARACTERS.noel.name);
    const labels = t.labels();
    expect(labels.slice(0, 2)).toEqual([STORY.scenes[memScene('noel', 1)].title, STORY.scenes[memScene('noel', 2)].title]);
    expect(t.fresh(labels[0])).toBe(false);
    expect(t.fresh(labels[1])).toBe(true);
    expect(labels.slice(2)).toEqual(Array(3).fill(H.unknown));
    expect(t.rows()[2].textContent).not.toBe(H.unknown);   // the hint sits beside it
    t.rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);
  });

  it('playing an untold piece tells it: seen, not new, out of untold (story L Task 4)', async () => {
    const piece = memScene('noel', 2);
    const storage = memoryStorage();
    const t = setup(undefined, (g) => {
      meetAll(g, ['noel'], 2);
      g.state.story.seen = [memScene('noel', 1)];
      g.state.story.untold = [piece];
      g.state.story.tonight = [piece];
    }, NO_ART, storage);
    const done = vi.spyOn(t.game, 'sceneDone');
    t.pick(CHARACTERS.noel.name);
    const title = STORY.scenes[piece].title;
    t.pick(title);
    expect(t.root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(false);
    await t.skipScene();
    const story = t.game.state.story;
    expect(story.seen).toContain(piece);
    expect(story.fresh).not.toContain(piece);
    expect(story.untold).toEqual([]);
    expect(story.tonight).toEqual([]);
    expect(done).not.toHaveBeenCalled();                 // a handbook read moves nothing else
    expect(t.fresh(title)).toBe(false);
    t.s.onAction('cancel');
    expect(t.fresh(CHARACTERS.noel.name)).toBe(false);
    // in town it is saved at once
    expect(Game.boot(constRng(0.5), storage).state.story.seen).toContain(piece);
    // a told piece read again stays told, and only its 新 mark moves
    t.game.state.story.fresh = [piece];
    t.pick(CHARACTERS.noel.name);
    t.pick(title);
    await t.skipScene();
    expect(t.game.state.story.fresh).toEqual([]);
    expect(t.game.state.story.seen.filter((id) => id === piece)).toHaveLength(1);
  });

  it('a piece told early in the handbook is skipped that night (story L Task 4)', async () => {
    const [first, second] = [memScene('noel', 1), memScene('selene', 1)];
    const t = setup('dungeon', (g) => {
      g.phase = 'map';   // read in the labyrinth: told now, saved with the next save in town
      meetAll(g, ['noel', 'selene'], 1);
      g.state.story.untold = [first, second, memScene('hero', 1)];
      g.state.story.tonight = [first, second];
      g.night = [first, second];
    });
    t.pick(CHARACTERS.noel.name);
    t.pick(STORY.scenes[first].title);
    await t.skipScene();
    const s = t.game.state;
    expect(s.story.untold).toEqual([second, memScene('hero', 1)]);
    expect(s.story.tonight).toEqual([second]);
    expect(t.game.night).toEqual([second]);
    // the night left: only the rest, and nobody in its place
    expect(restoreNight(s, [])).toEqual({ before: [], night: [second] });
  });

  it("the prologue, Rin's reveal, a chat and a return can be replayed from their tabs", async () => {
    const orik = TOWN_FRAGMENTS[0].id;
    const chat: SceneId = 'chat:hero:1';
    const scenes: SceneId[] = ['prologue', 'rin-reveal', chat, `town:${orik}`];
    const t = setup(undefined, (g) => {
      meetAll(g, ['rin']);
      g.state.story.seen = [...scenes];
      g.state.story.fresh = [...scenes];
      g.state.story.returned = [orik];
    });
    const done = vi.spyOn(t.game, 'sceneDone');
    const before = structuredClone({ ...t.game.state.story, fresh: [] });
    const replay = async (tabName: string, path: string[], target: string, scene: SceneId) => {
      t.goTab(tabName);
      for (const label of path) t.pick(label);
      expect(t.fresh(target), scene).toBe(true);
      t.pick(target);
      await t.skipScene();
      expect(t.fresh(target), scene).toBe(false);
      expect(t.game.state.story.fresh).not.toContain(scene);
      for (let i = 0; i < path.length; i++) t.s.onAction('cancel');
    };
    await replay(H.tabs.truths, [], H.stages.prologue, 'prologue');
    await replay(H.tabs.people, [CHARACTERS.rin.name], STORY.scenes['rin-reveal'].title, 'rin-reveal');
    await replay(H.tabs.people, [CHARACTERS.hero.name], STORY.scenes[chat].title, chat);
    await replay(H.tabs.town, [], TOWN_FRAGMENTS[0].npc, `town:${orik}`);
    expect(done).not.toHaveBeenCalled();
    expect(t.game.state.story.fresh).toEqual([]);
    expect({ ...t.game.state.story, fresh: [] }).toEqual(before);
  });

  it('the after page replays the finale, then the lantern festival, and clears both (story depth ruling 12, Task 20)', async () => {
    const t = setup(undefined, (g) => {
      meetAll(g, ['rin']);
      g.state.party.roster.rin.oath = true;
      g.state.story.finaleCleared = true;
      g.state.story.seen = ['prologue', 'finale', 'epilogue'];
      g.state.story.fresh = ['finale', 'epilogue'];
    });
    const done = vi.spyOn(t.game, 'sceneDone');
    t.goTab(H.tabs.truths);
    expect(t.fresh(H.stages.after)).toBe(true);
    t.pick(H.stages.after);
    await t.skipScene();                                          // the finale
    expect(t.root.querySelector('.slx-handbook')!.classList.contains('slx-hb-playing')).toBe(true);   // the festival follows
    expect(t.game.state.story.fresh).toEqual(['epilogue']);
    await t.skipScene();                                          // the festival
    expect(t.root.querySelector('.slx-handbook')!.classList.contains('slx-hb-playing')).toBe(false);
    expect(t.game.state.story.fresh).toEqual([]);
    expect(t.fresh(H.stages.after)).toBe(false);
    expect(done).not.toHaveBeenCalled();
  });

  it('a banter heard on a return is replayed from the people page of either of its two, and moves no progress (B1)', async () => {
    const id: SceneId = 'banter:noel-rin:1';
    const t = setup(undefined, (g) => {
      meetAll(g, ['noel']);
      g.state.story.seen = ['prologue', id];
      g.state.story.fresh = [id];
    });
    const done = vi.spyOn(t.game, 'sceneDone');
    const before = structuredClone({ ...t.game.state.story, fresh: [] });
    t.goTab(H.tabs.people);
    t.pick(CHARACTERS.noel.name);
    expect(t.labels()).toEqual([STORY.scenes[id].title]);
    expect(t.fresh(STORY.scenes[id].title)).toBe(true);
    t.pick(STORY.scenes[id].title);
    expect(t.root.querySelector('.slx-handbook')!.classList.contains('slx-hb-playing')).toBe(true);
    await t.skipScene();
    expect(t.fresh(STORY.scenes[id].title)).toBe(false);
    t.s.onAction('cancel');
    t.pick(CHARACTERS.rin.name);   // the same banter sits on Rin's page too
    expect(t.labels()).toContain(STORY.scenes[id].title);
    expect(done).not.toHaveBeenCalled();
    expect(t.game.state.story.fresh).toEqual([]);
    expect({ ...t.game.state.story, fresh: [] }).toEqual(before);
  });

  it('a companion not yet met shows a silhouette and ？？？, never the real name or title, and no detail heading', () => {
    const lost = CHARACTER_IDS.find((id) => !new Game(constRng(0.5), null).state.party.recruited.includes(id))!;
    const t = setup(undefined, undefined, { has: (u) => u === art.standee(lost) });
    t.goTab(H.tabs.people);
    for (let i = 0; i < CHARACTER_IDS.indexOf(lost); i++) t.s.onAction('down');
    const img = t.root.querySelector('.slx-status-standee')!;
    expect(img.classList.contains('slx-silhouette')).toBe(true);
    expect(img.getAttribute('src')).toBe(art.standee(artIdOf(t.game.state.party.roster[lost])));
    expect(t.root.textContent).toContain(H.unknown);
    expect(t.root.textContent).not.toContain(titleOf(t.game.state.party.roster[lost]));
    expect(t.root.textContent).not.toContain(CHARACTERS[lost].name);
    // a big ？？？ beside the first row would read as that row's person
    expect(t.root.querySelector('.slx-hb-detail h4')).toBeNull();
  });

  it('the standee picture is kept, not rebuilt, while the cursor stays on the same person', () => {
    const t = setup(undefined, (g) => meetAll(g, ['noel'], 1), { has: (u) => u === art.standee('noel') });
    t.pick(CHARACTERS.noel.name);
    const img = t.root.querySelector('.slx-status-standee')!;
    t.s.onAction('down');
    expect(t.root.querySelector('.slx-status-standee')).toBe(img);
  });

  it('a person not yet met with no standee art shows only ？？？', () => {
    const t = setup();
    t.goTab(H.tabs.people);
    const unmet = CHARACTER_IDS.filter((id) => !t.game.state.party.recruited.includes(id));
    for (let i = 0; i < CHARACTER_IDS.indexOf(unmet[0]); i++) t.s.onAction('down');
    expect(t.root.querySelector('.slx-status-standee')).toBeNull();
    expect(t.root.textContent).toContain(H.unknown);
  });

  it('a met person shows the standee, the title and the segments', () => {
    const t = setup(undefined, (g) => meetAll(g, ['noel']), { has: (u) => u === art.standee('noel') });
    t.goTab(H.tabs.people);
    for (let i = 0; i < CHARACTER_IDS.indexOf('noel'); i++) t.s.onAction('down');
    const img = t.root.querySelector('.slx-status-standee')!;
    expect(img.classList.contains('slx-silhouette')).toBe(false);
    expect(t.root.textContent).toContain(titleOf(t.game.state.party.roster.noel));
    expect(t.root.textContent).toContain(STORY.people.noel[0]);
  });

  it('town fragments show their state', () => {
    const t = setup();
    t.goTab(H.tabs.town);
    expect(t.rows().length).toBe(TOWN_FRAGMENTS.length);
    expect(t.rows()[0].textContent).toContain(H.status.unknown);
  });

  it('opened from the labyrinth it goes back to the labyrinth', () => {
    const t = setup('dungeon');
    t.s.onAction('cancel');
    expect(t.go).toHaveBeenCalledWith('dungeon');
  });

  it('opened from town it goes back to where it came from', () => {
    const t = setup();
    t.s.onAction('cancel');
    expect(t.go).toHaveBeenCalledWith('town');
  });

  it('cancel inside a list steps back to the list before it leaves', () => {
    const t = setup(undefined, (g) => meetAll(g, ['noel'], 1));
    t.pick(CHARACTERS.noel.name);
    expect(t.labels().length).toBe(5);
    t.s.onAction('cancel');
    expect(t.go).not.toHaveBeenCalled();
    expect(t.labels()).toContain(CHARACTERS.noel.name);   // the first list again, not noel's pieces
    t.s.onAction('cancel');
    expect(t.go).toHaveBeenCalledWith('town');
  });
});

describe('HandbookScene: the leads (6c Task 16)', () => {
  const detail = (root: HTMLElement) => root.querySelector('.slx-hb-detail')!.textContent;

  it("a new game: the lead's place, the rumour beside it, no face and nothing followed yet", () => {
    const { goTab, labels, root, rows, sfx, pick } = setup();
    goTab(H.tabs.leads);
    expect(labels()).toEqual([H.leads.place('星燈迷宮・本道', 2)]);
    expect(H.leads.place('霜凍之地', 3)).toBe('霜凍之地・第 3 層');   // UI copy: the card style
    expect(rows()[0].querySelector('.slx-label')!.classList.contains('slx-lead-now')).toBe(true);   // gold, and no right column to squeeze it
    expect(detail(root)).toContain(H.leads.now);
    expect(detail(root)).toContain(STORY.leads.selene);
    expect(root.querySelector('.slx-status-art img')).toBeNull();   // the lead never shows who she is, not even as a silhouette
    pick(H.leads.place('星燈迷宮・本道', 2));
    expect(sfx.error).toHaveBeenCalled();
  });

  it('the leads followed stay, by name and place, under the one to follow now', () => {
    const { goTab, labels, root, s } = setup(undefined, (g) => {
      meetAll(g, ['selene', 'safira']);
      g.state.dungeon.reached.mainline = 2;
    });
    goTab(H.tabs.leads);
    expect(labels()).toEqual([H.leads.place('霜凍之地', 3), CHARACTERS.selene.name, CHARACTERS.safira.name]);
    s.onAction('down');
    expect(detail(root)).toContain(H.leads.found);
    expect(detail(root)).toContain(H.leads.place('星燈迷宮・本道', 2));
    expect(detail(root)).toContain(STORY.leads.selene);
  });

  it('everyone met: the page says so', () => {
    const { goTab, labels } = setup(undefined, (g) => meetAll(g, CHARACTER_IDS.filter((id) => id !== 'hero' && id !== 'rin')));
    goTab(H.tabs.leads);
    expect(labels()[0]).toBe(H.leads.allFound);
    expect(labels()).toHaveLength(9);
  });
});

describe('HandbookScene: the tier page (difficulty plan Task 7c)', () => {
  const open = (g: Game) => { g.state.dungeon.reached.mainline = NIGHTMARE_DEPTH; };
  /** Every row's label, right column and detail, the cursor walked down the list. */
  const walk = (t: ReturnType<typeof setup>) => t.rows().map((r, i) => {
    if (i > 0) t.s.onAction('down');
    return `${r.textContent}|${t.root.querySelector('.slx-hb-detail')!.textContent}`;
  }).join('\n');

  it('the tier page opens with Nightmare', () => {
    const locked = setup();
    expect(tabsFor(locked.game.state)).not.toContain('tiers');
    expect(locked.tabs()).not.toContain(H.tabs.tiers);
    const t = setup(undefined, open);
    expect(tabsFor(t.game.state)).toEqual(['memories', 'people', 'leads', 'town', 'codex', 'truths', 'tiers']);
    expect(t.tabs()).toEqual([H.tabs.memories, H.tabs.people, H.tabs.leads, H.tabs.town, H.tabs.codex, H.tabs.truths, H.tabs.tiers]);
    t.goTab(H.tabs.tiers);
    expect(t.tab()).toBe(H.tabs.tiers);
    const page = walk(t);
    for (const d of ['normal', 'nightmare', 'hell'] as const) expect(page).toContain(T.ui2.tier.names[d]);
    // What each changes, numbers from the table; Hell's condition and that it is still shut.
    expect(page).toContain(T.ui2.tier.what.nightmare);
    expect(page).toContain(T.ui2.tier.what.hell);
    expect(page).toContain(H.tiers.rewards(Math.round((TIERS.nightmare.reward - 1) * 100)));
    expect(page).toContain(H.tiers.rewards(Math.round((TIERS.hell.reward - 1) * 100)));
    expect(page).toContain(H.tiers.affixes(TIERS.nightmare.eliteAffixes, TIERS.nightmare.bossAffixes, false));
    expect(page).toContain(H.tiers.affixes(TIERS.hell.eliteAffixes, TIERS.hell.bossAffixes, true));   // a Hell crowd may wear one too
    expect(page).toContain(H.tiers.condition(T.ui2.tier.locked.hell(HELL_BOSS_DEPTH)));
    expect(page).toContain(`${T.ui2.tier.names.hell}${H.tiers.locked}`);
    expect(page).toContain(`${T.ui2.tier.names.nightmare}${H.tiers.open}`);
    for (const id of AFFIX_IDS) {
      expect(page).toContain(AFFIXES[id].name);
      expect(page).toContain(AFFIXES[id].line);
    }
    // Hell open: its row says so.
    const hell = setup(undefined, (g) => { open(g); g.state.dungeon.reached.mainline = 30; g.state.story.finaleCleared = true; g.state.dungeon.bossKills['nightmare:mainline:25'] = 1; });
    hell.goTab(H.tabs.tiers);
    expect(walk(hell)).toContain(`${T.ui2.tier.names.hell}${H.tiers.open}`);
    // Nothing to pick on the page: a confirm only beeps.
    t.s.onAction('confirm');
    expect(t.sfx.error).toHaveBeenCalled();
  });

  it('turning tabs skips a locked tier page', () => {
    const locked = setup();
    const seen = (t: ReturnType<typeof setup>, dir: 'next' | 'prev', n: number) => Array.from({ length: n }, () => { t.s.onAction(dir); return t.tab(); });
    expect(seen(locked, 'next', 7)).toEqual([H.tabs.people, H.tabs.leads, H.tabs.town, H.tabs.codex, H.tabs.truths, H.tabs.memories, H.tabs.people]);
    expect(seen(locked, 'prev', 2)).toEqual([H.tabs.memories, H.tabs.truths]);   // left from the first page: the last one, not tiers
    const t = setup(undefined, open);
    expect(seen(t, 'prev', 1)).toEqual([H.tabs.tiers]);
    expect(seen(t, 'next', 2)).toEqual([H.tabs.memories, H.tabs.people]);
    expect(seen(t, 'next', 5)).toEqual([H.tabs.leads, H.tabs.town, H.tabs.codex, H.tabs.truths, H.tabs.tiers]);
    // A click on the tab goes there too.
    const c = setup(undefined, open);
    ([...c.root.querySelectorAll('.slx-tab')].find((x) => x.textContent === H.tabs.tiers) as HTMLElement).click();
    expect(c.tab()).toBe(H.tabs.tiers);
  });
});

describe('HandbookScene: a replayed night (time and moon Task 5)', () => {
  it('the handbook replays a night with the plain veil', async () => {
    const t = setup(undefined, (g) => {
      meetAll(g, ['rin']);
      g.state.story.seen = ['rin-reveal'];
      g.state.story.day = 5;   // tonight would be a full moon in town: the handbook keeps the plain night
    });
    t.goTab(H.tabs.people);
    t.pick(CHARACTERS.rin.name);
    t.pick(STORY.scenes['rin-reveal'].title);
    await t.settle();
    expect(t.root.querySelector('.slx-veil-night.slx-on')).not.toBeNull();
    expect(t.root.querySelector('[class*="slx-moon-"]')).toBeNull();
    await t.skipScene();
  });
});

describe('HandbookScene: the bond (bond plan Task 14)', () => {
  it("a companion's page shows her bond and what she has been offered", () => {
    const t = setup(undefined, (g) => { g.state.party.roster.rin.bond = { talk: 3, field: 40, gifts: { 'dusk-cloth': 30 }, refused: ['king-scale'] }; });
    t.goTab(H.tabs.people);
    t.s.onAction('down');   // 凜
    const text = t.root.querySelector('.slx-hb-bond')!.textContent!;
    expect(text).toContain('信賴　83／100'.replace('信賴', '羈絆'));
    expect(text).toContain('送禮　30／30（已滿）');
    expect(text).toContain('同隊　40／40（已滿）');
    expect(text).toContain('談心　3／12');
    expect(text).toContain('暮影布　最愛');
    expect(text).toContain('王者之鱗　婉拒');
    t.s.onAction('up');     // 洛恩
    expect(t.root.querySelector('.slx-hb-bond')).toBeNull();
  });

  it('a replayed bond scene adds nothing', async () => {
    bondsAdd('rin');
    STORY.scenes['bond:rin:1'] = {
      title: '凜・羈絆 1', summary: '一件小事。',
      lines: [{ who: 'hero', choices: [{ tone: 'stay', text: '（坐下。）', reply: [{ who: 'rin', text: '嗯。' }] }, { tone: 'ask', text: '「然後？」', reply: [{ who: 'rin', text: '沒了。' }] }] }],
    };
    try {
      const t = setup(undefined, (g) => { g.state.party.roster.rin.memories = 2; g.state.party.roster.rin.bond = { talk: 0, field: 10, gifts: {} }; g.state.story.seen.push('bond:rin:1'); });
      t.goTab(H.tabs.people);
      t.s.onAction('down');
      t.s.onAction('confirm');   // her scenes
      t.pick('凜・羈絆 1');
      await t.settle();
      t.s.onAction('confirm');   // 坐下
      await t.settle();
      t.s.onAction('confirm');
      await t.settle();
      expect(t.game.state.party.roster.rin.bond!.talk).toBe(0);
    } finally { bondsBack(); scenesBack('bond:rin:1'); }
  });
});

describe('the bestiary page (roster plan Task C6)', () => {
  const B = BESTIARY_UI;
  const detail = (root: HTMLElement) => root.querySelector('.slx-hb-detail')!.textContent ?? '';
  const OLD_ROAD = ['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade'];

  it('with nothing live the 圖鑑 page is as it was', () => withRosterOnly([], () => {
    // L1b: measures the game as it was with nothing live.
    const t = setup(undefined, (g) => { g.state.revealed = { slime: ['fire'] }; });
    t.goTab(H.tabs.codex);
    // The old kinds by name, each with its known weakness, whether met or not: no filter, no question marks.
    expect(t.labels()).toEqual([...OLD_ROAD, 'lanterneater'].map((id) => ENEMIES[id].name));
    expect(detail(t.root)).toBe(`${ENEMIES.slime.name}${H.codex.weak(T.element.fire)}`);
    t.s.onAction('down');
    expect(detail(t.root)).toBe(`${ENEMIES.bat.name}${H.codex.weakUnknown}`);
    expect(t.root.querySelector('.slx-status-art img')).toBeNull();
  }));

  it('the first live wave: the road and the bosses, each foe 「？？？」 until met (L1b)', () => withRosterOnly([...WAVE_1_LIVE], () => {
    // L2b: measures the game as it was with only the first wave live.
    const t = setup();
    t.goTab(H.tabs.codex);
    expect(t.labels()).toEqual([B.filters.road, B.filters.bosses]);   // no region's natives live yet
    expect(t.row(B.filters.road).querySelector('.slx-right')!.textContent).toBe(B.count(0, 21));
    expect(t.row(B.filters.bosses).querySelector('.slx-right')!.textContent).toBe(B.count(0, 6));
    t.pick(B.filters.road);
    expect(t.labels().length).toBeGreaterThan(0);   // the rows in view: none met, so every one is question marks
    expect(new Set(t.labels())).toEqual(new Set([B.unknown]));
  }));

  it('the second live wave: the road and the bosses, each foe 「？？？」 until met (L2b)', () => {
    const t = setup();
    t.goTab(H.tabs.codex);
    expect(t.labels()).toEqual([B.filters.road, B.filters.bosses]);   // no region's natives live yet
    // The road: the old eight, the first wave's 13 and the second's 16; the bosses: the lantern-eater, five wardens, nine
    // bosses, the archon's hand and the lantern-mother (L2c).
    expect(t.row(B.filters.road).querySelector('.slx-right')!.textContent).toBe(B.count(0, 37));
    expect(t.row(B.filters.bosses).querySelector('.slx-right')!.textContent).toBe(B.count(0, 17));
    t.pick(B.filters.bosses);
    expect(t.labels().length).toBeGreaterThan(0);
    expect(new Set(t.labels())).toEqual(new Set([B.unknown]));
  });

  it('the filters split main road, regions and bosses', () => {
    // L1b: exactly these live, the rest as with nothing live.
    withRosterOnly(['paper-moth'], () => {
      const t = setup();
      t.goTab(H.tabs.codex);
      expect(t.labels()).toEqual([B.filters.road, B.filters.bosses]);
      expect(t.row(B.filters.road).querySelector('.slx-right')!.textContent).toBe(B.count(0, 9));
    });
    withRosterOnly(['paper-moth', 'cinder-imp'], () => {
      const u = setup();
      u.goTab(H.tabs.codex);
      expect(u.labels()).toEqual([B.filters.road, B.filters.lands, B.filters.bosses]);
    });
  });

  it('an unseen foe is 「？？？」 and where it is met, with no picture', () => {
    // L1b: exactly this one live, the rest as with nothing live.
    withRosterOnly(['paper-moth'], () => {
      const t = setup(undefined, (g) => { g.state.bestiary = { slime: { seen: 2, felled: 1 } }; g.state.revealed = { slime: ['fire'] }; }, { has: () => true });
      t.goTab(H.tabs.codex);
      t.pick(B.filters.road);
      expect(t.labels()).toEqual([ENEMIES.slime.name, ...Array(8).fill(B.unknown)]);
      expect(t.rows()[0].querySelector('.slx-right')!.textContent).toBe(B.felledRow(1));
      // The cursor on the slime: its picture, twice its size, and what the bestiary knows.
      const img = t.root.querySelector('.slx-status-art img')!;
      expect(img.getAttribute('src')).toBe(enemyArt('slime'));
      expect(img.className).toBe('slx-hb-foe slx-hb-foe-x2');
      const text = detail(t.root);
      expect(text).toContain(B.where(B.haunts.everywhere));
      expect(text).toContain(H.codex.weak(T.element.fire));
      expect(text).toContain(B.tally(2, 1));
      // On a kind not met: the question marks and the place, no picture, not even a silhouette.
      t.s.onAction('down');
      expect(detail(t.root)).toBe(`${B.unknown}${B.where(B.haunts.everywhere)}`);
      expect(t.root.querySelector('.slx-status-art img')).toBeNull();
      for (let i = 0; i < 7; i++) t.s.onAction('down');
      expect(detail(t.root)).toBe(`${B.unknown}${B.where(B.haunts.road(4, 9))}`);
      // Back to the page's first list.
      t.s.onAction('cancel');
      expect(t.labels()).toEqual([B.filters.road, B.filters.bosses]);
    });
  });

  it('a seen foe tells its trait, its lines once felled, and its own unique', () => {
    const was = BESTIARY['fog-warden'];
    try {
      BESTIARY['fog-warden'] = { trait: '先打旗手。', lines: [{ text: '霧門前的守衛。' }, { text: '它在等人。', after: { seen: ['act3'] } }] };
      // L1b: exactly this one live, the rest as with nothing live.
      withRosterOnly(['fog-warden'], () => {
        const seen = setup(undefined, (g) => { g.state.bestiary = { 'fog-warden': { seen: 1, felled: 0 } }; });
        seen.goTab(H.tabs.codex);
        seen.pick(B.filters.bosses);
        seen.s.onAction('down');   // past the lantern-eater
        let text = detail(seen.root);
        expect(text).toContain('先打旗手。');
        expect(text).toContain(B.later);
        expect(text).not.toContain('霧門前的守衛。');
        expect(text).toContain(B.own(codexName('fog-halberd'), false));
        const felled = setup(undefined, (g) => { g.state.bestiary = { 'fog-warden': { seen: 1, felled: 2 } }; g.state.codex = ['fog-halberd']; }, { has: () => true });
        felled.goTab(H.tabs.codex);
        felled.pick(B.filters.bosses);
        felled.s.onAction('down');
        text = detail(felled.root);
        expect(text).toContain('霧門前的守衛。');
        expect(text).not.toContain('它在等人。');
        expect(text).toContain(B.own(codexName('fog-halberd'), true));
        expect(text).toContain(B.mats(MATERIALS['fog-gate-plate'].name));
        // A boss stands at its own size.
        expect(felled.root.querySelector('.slx-status-art img')!.className).toBe('slx-hb-foe');
      });
    } finally {
      if (was) BESTIARY['fog-warden'] = was; else delete BESTIARY['fog-warden'];
    }
  });
});
