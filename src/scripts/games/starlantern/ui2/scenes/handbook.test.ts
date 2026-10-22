import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_IDS, CHARACTERS, titleOf } from '../../data/characters';
import { TOWN_FRAGMENTS } from '../../data/story/fragments';
import { memScene, type SceneId } from '../../data/story/scenes';
import { STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { Game } from '../../engine/game';
import { meet } from '../../engine/party';
import { constRng } from '../../engine/testing';
import type { CharacterId } from '../../engine/types';
import { art } from '../../render/artPaths';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { artIdOf } from '../../ui/art';
import { HandbookScene } from './handbook';

const H = T.ui2.handbook;

function setup(arg?: string, prep?: (g: Game) => void, artIndex: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.5), null);
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

  it('a found piece still waiting in the queue is not replayable, and a missing one shows ？？？ with its hint', () => {
    const t = setup(undefined, (g) => {
      meetAll(g, ['noel'], 2);
      g.state.story.seen = [memScene('noel', 1)];
      g.state.story.queue = [memScene('noel', 2)];
    });
    t.pick(CHARACTERS.noel.name);
    const labels = t.labels();
    expect(labels[0]).toBe(STORY.scenes[memScene('noel', 1)].title);
    expect(labels.slice(1)).toEqual(Array(4).fill(H.unknown));
    expect(t.rows()[1].textContent).not.toBe(H.unknown);   // the hint sits beside it
    t.rows()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);
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
