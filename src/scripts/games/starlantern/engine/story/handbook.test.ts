import { afterEach, describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from '../../data/characters';
import { ENEMIES } from '../../data/enemies';
import { LEGACY_ENEMY_IDS, listedEnemy } from '../../data/monsters';
import { BESTIARY, BESTIARY_UI as B } from '../../data/bestiary.zh-TW';
import { SETS, SPECIALS } from '../../data/gear';
import { REGIONS } from '../../data/regions';
import { chainLength, CHAINS } from '../../data/story/chains';
import { TOWN_FRAGMENTS } from '../../data/story/fragments';
import { BONDS_WRITTEN, CHAT_COUNT, ENDINGS_WRITTEN, HOME_OWNERS, ROMANCES_WRITTEN, SCENE_IDS, SEASON_SCENES, STAGES, bondScene, homeScene, memScene, sceneKind, type SceneId } from '../../data/story/scenes';
import { SEASON_TITLES, STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { meet } from '../party';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { handbook } from './handbook';
import { WAVE_1_LIVE, WAVE_2_LIVE, WAVE_3_LIVE, withRosterLive, withRosterOnly, withTold } from '../testing';
import { arrivalScenes, onReturn, sceneDone } from './events';
/**
 * Bond plan Task 17: the registries hold what is written now, so a test that registers its own puts back what was there
 * (`bondsBack`), registers a companion only once (`bondsAdd`), and gives a written scene back instead of deleting it.
 */
const BOND_BASE = [...BONDS_WRITTEN];
const bondsAdd = (...cs: (typeof BONDS_WRITTEN)[number][]): void => { for (const c of cs) if (!BONDS_WRITTEN.includes(c)) BONDS_WRITTEN.push(c); };
const bondsBack = (): void => { BONDS_WRITTEN.splice(0, BONDS_WRITTEN.length, ...BOND_BASE); };
// review 5: the after-story and romance registries go back to what is registered, not to empty
const regAdd = <T,>(reg: T[], ...xs: T[]): void => { for (const x of xs) if (!reg.includes(x)) reg.push(x); };
const ENDINGS_BASE = [...ENDINGS_WRITTEN];
const endingsBack = (): void => { ENDINGS_WRITTEN.splice(0, ENDINGS_WRITTEN.length, ...ENDINGS_BASE); };
const ROMANCES_BASE = [...ROMANCES_WRITTEN];
const romancesBack = (): void => { ROMANCES_WRITTEN.splice(0, ROMANCES_WRITTEN.length, ...ROMANCES_BASE); };
const SCENES_BASE = { ...STORY.scenes };
const scenesBack = (id: keyof typeof STORY.scenes): void => { if (SCENES_BASE[id]) STORY.scenes[id] = SCENES_BASE[id]; else delete (STORY.scenes as Partial<typeof STORY.scenes>)[id]; };

/** Rin's banters, in the pairs' fixed order: what her people page lists after her chats (B1, B2; ids are frozen once shipped). */
const RIN_BANTERS: SceneId[] = [
  'banter:chizuru-rin:1', 'banter:chizuru-rin:2', 'banter:noel-rin:1', 'banter:noel-rin:2', 'banter:rin-scarlet:1', 'banter:rin-scarlet:2',
  'banter:rin-scarlet:3', 'banter:rin-selene:1', 'banter:rin-selene:2', 'banter:rin-sylvie:1', 'banter:rin-sylvie:2',
];   // story depth Task 4 (I6): the friction banters and the moved rin-sylvie

const withMemories = (s: GameState, id: CharacterId, n: number): GameState => {
  if (!s.party.recruited.includes(id)) s.party = meet(s.party, id, 1);
  s.party.roster[id].memories = n;
  return s;
};
const fresh = (): GameState => newGame();
/** Everything found, met, returned and seen. */
const everything = (): GameState => {
  const s = newGame();
  for (const id of CHARACTER_IDS) withMemories(s, id, chainLength(id));
  s.story.seen = [...SCENE_IDS];
  s.story.returned = TOWN_FRAGMENTS.map((f) => f.id);
  s.story.nodes = ['act2', 'act3', 'act4'];
  s.story.act1Cleared = true;
  s.story.finaleCleared = true;
  s.story.queue = [];
  return s;
};

describe("the adventurer's handbook", () => {
  it('the memory pages show what was found and hint at the rest', () => {
    const s = withMemories(fresh(), 'noel', 2);
    const noel = handbook(s).memories.find((m) => m.id === 'noel')!;
    expect(noel.met).toBe(true);
    expect(noel.pieces.map((p) => p.found)).toEqual([true, true, false, false, false]);
    expect(noel.pieces.map((p) => p.scene)).toEqual([1, 2, 3, 4, 5].map((n) => memScene('noel', n)));
    const names = (id: CharacterId, i: number) => CHAINS[id].pieces[i].regions.map((r) => REGIONS[r].name).join('、');
    expect(CHAINS.noel.pieces[4].minDepth).toBeGreaterThanOrEqual(6);
    expect(noel.pieces[4].hint).toBe(`${names('noel', 4)}・深處`);
    // A shallow piece: Rin's first, which lies on the first floor (minDepth below 6).
    expect(CHAINS.rin.pieces[0].minDepth).toBeLessThan(6);
    expect(handbook(s).memories.find((m) => m.id === 'rin')!.pieces[0].hint).toBe(`${names('rin', 0)}・淺層`);
    expect(handbook(s).memories.map((m) => m.id)).toEqual(CHARACTER_IDS);
  });

  it('a companion not yet met is a silhouette', () => {
    const h = handbook(fresh());
    expect(h.memories.find((m) => m.id === 'noel')!.met).toBe(false);
    expect(h.people.find((p) => p.id === 'noel')!.met).toBe(false);
    expect(h.people.find((p) => p.id === 'noel')!.segments).toEqual([]);
    expect(h.memories.find((m) => m.id === 'hero')!.met).toBe(true);
  });

  it('people pages unlock with the pieces', () => {
    const len = chainLength('noel');
    const segs = (n: number) => handbook(withTold(fresh(), 'noel', n)).people.find((p) => p.id === 'noel')!.segments;   // story L: told
    expect(segs(0)).toEqual(STORY.people.noel.slice(0, 1));
    expect(segs(Math.ceil(len / 2) - 1)).toEqual(STORY.people.noel.slice(0, 1));
    expect(segs(Math.ceil(len / 2))).toEqual(STORY.people.noel.slice(0, 2));
    expect(segs(len - 1)).toEqual(STORY.people.noel.slice(0, 2));
    expect(segs(len)).toEqual(STORY.people.noel);
  });

  it("a person's page opens by the pieces told (story L Task 1)", () => {
    const len = chainLength('noel');
    const half = Math.ceil(len / 2);
    const page = (s: GameState) => handbook(s).people.find((p) => p.id === 'noel')!.segments;
    const held = withMemories(fresh(), 'noel', len);   // all held, none told
    expect(page(held)).toEqual(STORY.people.noel.slice(0, 1));
    expect(page(withTold(held, 'noel', half))).toEqual(STORY.people.noel.slice(0, 2));
    expect(page(withTold(held, 'noel', len))).toEqual(STORY.people.noel);
    // Lorne reads what he holds
    const hero = withMemories(fresh(), 'hero', chainLength('hero'));
    expect(handbook(hero).people.find((p) => p.id === 'hero')!.segments).toEqual(STORY.people.hero);
  });

  it("people pages carry the title, and Rin's changes with her oath", () => {
    const s = fresh();
    const rin = () => handbook(s).people.find((p) => p.id === 'rin')!;
    const before = rin().title;
    s.party.roster.rin.oath = true;
    expect(rin().title).not.toBe(before);
  });

  it("Rin's page ends on her choice once she has made it, and on her mission until then (continuity fix 3)", () => {
    const s = withMemories(fresh(), 'rin', chainLength('rin'));
    const segs = () => handbook(s).people.find((p) => p.id === 'rin')!.segments;
    expect(STORY.people.rin).toHaveLength(4);
    expect(segs()).toEqual(STORY.people.rin.slice(0, 3));   // seven pieces, no choice yet
    s.party.roster.rin.oath = true;
    expect(segs()).toEqual(STORY.people.rin);
    expect(segs()[3]).toMatch(/不做了.*自己決定/);   // story polish Task 2: the choice, in the reveal's new words
    // the others keep three pages, whatever her oath
    expect(handbook(withTold(s, 'noel', chainLength('noel'))).people.find((p) => p.id === 'noel')!.segments).toHaveLength(3);
  });

  it('a homecoming is replayed from her own page', () => {
    const s = everything();
    for (const c of HOME_OWNERS) {
      const page = handbook(s).people.find((p) => p.id === c)!;
      // time and moon Task 8: the spring festival follows Chizuru's homecoming on her page
      // bond plan Task 20: her after-story, once written, follows on her page
      const ending: SceneId[] = [...(ENDINGS_WRITTEN.includes(c) ? [`ending:${c}` as SceneId] : []), ...(ROMANCES_WRITTEN.includes(c) ? [`romance:${c}` as SceneId] : [])];   // Task 21: then her romance
      const tail: SceneId[] = c === 'chizuru' ? [homeScene(c), 'season:spring', ...ending] : [homeScene(c), ...ending];
      expect(page.scenes.map((e) => e.scene).slice(-tail.length), c).toEqual(tail);
    }
    s.story.seen = s.story.seen.filter((id) => id !== 'home:liz');
    expect(handbook(s).people.find((p) => p.id === 'liz')!.scenes.map((e) => e.scene)).not.toContain('home:liz');
  });

  it('townsfolk pages follow the fragment', () => {
    const f = TOWN_FRAGMENTS[0];
    const page = (s: GameState) => handbook(s).town.find((t) => t.id === f.id)!;
    expect(page(fresh())).toMatchObject({ status: 'unknown', lines: [], scene: null });
    const held = fresh();
    held.inventory[f.item] = 1;
    expect(page(held)).toMatchObject({ status: 'held', lines: [STORY.town[f.id].lost], scene: null });
    const back = fresh();
    back.story.returned = [f.id];
    back.story.seen = [`town:${f.id}`];
    expect(page(back)).toMatchObject({ status: 'returned', lines: [STORY.town[f.id].lost, STORY.town[f.id].after] });
    expect(page(back).scene).toEqual({ scene: `town:${f.id}`, title: STORY.scenes[`town:${f.id}`].title, fresh: false });
  });

  it('a returned fragment whose scene was not seen keeps its lines but offers no replay', () => {
    const f = TOWN_FRAGMENTS[0];
    const back = fresh();
    back.story.returned = [f.id];
    back.story.queue = [`town:${f.id}`];
    const page = handbook(back).town.find((t) => t.id === f.id)!;
    expect(page.scene).toBeNull();
    expect(page.lines).toEqual([STORY.town[f.id].lost, STORY.town[f.id].after]);
    // newness without a seen mark is not a replay either
    back.story.fresh = [`town:${f.id}`];
    expect(handbook(back).town.find((t) => t.id === f.id)!.scene).toBeNull();
  });

  it('inherited names are not codex entries', () => {
    const s = fresh();
    s.codex = ['constructor', 'toString', '__proto__'];
    const c = handbook(s).codex;
    expect([c.specials, c.sets]).toEqual([[], []]);
  });

  it('the codex lists every ordinary monster and its known weaknesses', () => {
    const s = fresh();
    s.codex = [Object.keys(SPECIALS)[0], Object.keys(SETS)[0]];
    s.revealed = { slime: ['fire'] };
    // Roster plan C6: a weakness shows once the kind is seen (the bestiary), as the revealed one always was in play.
    s.bestiary = { slime: { seen: 1, felled: 0 }, bat: { seen: 1, felled: 0 } };
    const c = handbook(s).codex;
    expect(c.monsters.map((m) => m.id)).toEqual(Object.values(ENEMIES).filter((e) => listedEnemy(e.id) && !e.story).map((e) => e.id));
    expect(c.monsters.some((m) => m.id === 'scarlet-foe')).toBe(false);
    expect(c.monsters.find((m) => m.id === 'slime')!.weak).toEqual(['fire']);
    expect(c.monsters.find((m) => m.id === 'bat')!.weak).toBeNull();
    expect(c.specials).toEqual([Object.keys(SPECIALS)[0]]);
    expect(c.sets).toEqual([Object.keys(SETS)[0]]);
  });

  it('truths unlock with the acts and the finale', () => {
    const open = (s: GameState) => handbook(s).truths.filter((t) => t.unlocked).map((t) => t.stage);
    expect(handbook(fresh()).truths.map((t) => t.stage)).toEqual(STAGES);
    expect(open(fresh())).toEqual(['prologue']);
    const s = fresh();
    s.story.act1Cleared = true;
    s.story.seen = ['act1-after'];
    expect(open(s)).toEqual(['prologue', 'act1']);
    s.story.nodes = ['act2', 'act4'];
    s.story.seen.push('act2', 'act4');
    expect(open(s)).toEqual(['prologue', 'act1', 'act2', 'act4']);
    s.story.finaleCleared = true;
    expect(open(s)).toEqual(['prologue', 'act1', 'act2', 'act4', 'after']);
    expect(handbook(s).truths[0].text).toBe(STORY.truths.prologue);
    expect(handbook(fresh()).truths[2].text).toBeNull();
  });

  it('a truth page waits for its act scene, not only for the depth (final review I-2)', () => {
    const open = (s: GameState) => handbook(s).truths.filter((t) => t.unlocked).map((t) => t.stage);
    const s = fresh();
    s.story.act1Cleared = true;
    s.story.nodes = ['act2', 'act3', 'act4'];
    s.story.queue = ['act1-after', 'act2', 'act3', 'act4'];   // reached, queued, not played yet
    expect(open(s)).toEqual(['prologue']);
    expect(handbook(s).truths.find((t) => t.stage === 'act4')!.text).toBeNull();
    for (const id of ['act1-after', 'act2', 'act3', 'act4'] as const) s.story = sceneDone(s, id, 'played').story;
    expect(open(s)).toEqual(['prologue', 'act1', 'act2', 'act3', 'act4']);
  });

  it('the fast dive: one dive past depth 16 with Rin whole at 22 plays her reveal alone, and the act pages stay shut until their scenes play', () => {
    const open = (s: GameState) => handbook(s).truths.filter((t) => t.unlocked).map((t) => t.stage);
    let s = withMemories(fresh(), 'rin', chainLength('rin'));
    s.story.seen = ['prologue', 'prologue-inn', 'act1-after'];
    s.story.queue = [];
    s.story.act1Cleared = true;
    s.dungeon.reached.mainline = 22;
    s.story = onReturn(s);
    expect(s.story.nodes).toEqual(['act2', 'act3', 'act4']);
    expect(arrivalScenes(s, { chat: true })).toEqual(['rin-reveal']);
    s = sceneDone(s, 'rin-reveal', 'played');
    expect(open(s)).toEqual(['prologue', 'act1']);   // the stay after the reveal: the acts wait for the next return
    // story depth Task 3: her confession plays alone, then one heavy major scene an arrival: each act page opens as its act plays
    const pages: string[][] = [];
    for (let back = 0; back < 6 && s.story.queue.length; back++) {
      for (const id of arrivalScenes(s, { chat: false })) s = sceneDone(s, id, 'played');
      pages.push(open(s).slice(2));
    }
    expect(pages.slice(0, 4)).toEqual([[], ['act2'], ['act2', 'act3'], ['act2', 'act3', 'act4']]);
    expect(open(s)).toEqual(['prologue', 'act1', 'act2', 'act3', 'act4']);
  });

  it('fresh scenes carry the new mark', () => {
    const s = everything();
    s.story.fresh = [memScene('hero', 1), 'act2', 'chat:rin:2', 'rin-reveal', 'town:orik', 'first-return'];
    const h = handbook(s);
    expect(h.memories.find((m) => m.id === 'hero')!.pieces[0].fresh).toBe(true);
    expect(h.memories.find((m) => m.id === 'hero')!.pieces[1].fresh).toBe(false);
    expect(h.truths.find((t) => t.stage === 'act2')!.scenes[0].fresh).toBe(true);
    expect(h.truths.find((t) => t.stage === 'act3')!.scenes[0].fresh).toBe(false);
    const rin = h.people.find((p) => p.id === 'rin')!;
    // Task 10b: the inn night and the first return are the two of them before her story; they sit on her page, in story order.
    expect(rin.scenes.map((e) => [e.scene, e.fresh])).toEqual([
      ['prologue-inn', false], ['first-return', true], ['rin-reveal', true], ['rin-confess', false], ['bellkeeper-arrives', false], ['hero-alone', false], ['chat:rin:1', false], ['chat:rin:2', true], ['chat:rin:3', false], ['chat:rin:4', false],
      ...(BONDS_WRITTEN.includes('rin') ? [1, 2, 3, 4].map((n) => [bondScene('rin', n), false]) : []),   // bond plan Task 17: her bond scenes after her chats
      ...RIN_BANTERS.map((id) => [id, false]),   // B1: her banters follow her chats, in the pairs' order (B2: all of them)
      ...(ENDINGS_WRITTEN.includes('rin') ? [['ending:rin', false]] : []),   // bond plan Task 20: her after-story last
      ...(ROMANCES_WRITTEN.includes('rin') ? [['romance:rin', false]] : []),   // bond plan Task 21: then her romance
    ]);
    expect(h.town.find((t) => t.id === 'orik')!.scene!.fresh).toBe(true);
    expect(h.town.find((t) => t.id === 'marta')!.scene!.fresh).toBe(false);
  });

  it("Rin's page replays her confession and the lone morning once seen; the after page replays the festival (story depth Task 2)", () => {
    const s = everything();
    const unseen: SceneId[] = ['rin-confess', 'hero-alone', 'epilogue'];
    s.story.seen = s.story.seen.filter((id) => !unseen.includes(id));
    const before = handbook(s);
    const rinOf = (h: typeof before) => h.people.find((p) => p.id === 'rin')!.scenes.map((e) => e.scene);
    const after = (h: typeof before) => h.truths.find((t) => t.stage === 'after')!.scenes.map((e) => e.scene);
    for (const id of unseen) expect(rinOf(before), id).not.toContain(id);
    expect(after(before)).toEqual(['finale']);
    s.story.seen.push(...unseen);
    const h = handbook(s);
    expect(rinOf(h).slice(0, 6)).toEqual(['prologue-inn', 'first-return', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone']);
    expect(rinOf(h)[6]).toBe('chat:rin:1');   // then her chats, then her banters
    expect(after(h)).toEqual(['finale', 'epilogue']);
    expect(h.people.every((p) => !p.scenes.some((e) => e.scene === 'epilogue'))).toBe(true);   // the festival is the after page's alone
  });

  it('every scene in the catalogue has a page', () => {
    const h = handbook(everything());
    const ids: SceneId[] = [
      ...h.memories.flatMap((m) => m.pieces.map((p) => p.scene)),
      ...h.truths.flatMap((t) => t.scenes.map((e) => e.scene)),
      ...h.people.flatMap((p) => p.scenes.map((e) => e.scene)),
      ...h.town.flatMap((t) => (t.scene ? [t.scene.scene] : [])),
    ];
    // B1: a banter sits on the page of each of its two, and every other scene on exactly one page.
    const banters = ids.filter((id) => sceneKind(id) === 'banter');
    const rest = ids.filter((id) => sceneKind(id) !== 'banter');
    expect(new Set(rest).size).toBe(rest.length);
    for (const id of new Set(banters)) expect(banters.filter((b) => b === id), id).toHaveLength(2);
    // bond plan Task 14: every scene on its page but the walk with everyone, which is on none
    expect([...new Set(ids)].sort()).toEqual([...SCENE_IDS].filter((id) => id !== 'together').sort());
    for (const id of CHARACTER_IDS) {
      expect(h.people.find((p) => p.id === id)!.scenes.filter((e) => e.scene.startsWith('chat:')).length).toBe(CHAT_COUNT[id]);
    }
  });

  it("a group scene sits on its act's truth page, after the act (story L spec §5.1)", () => {
    const scenes = STORY.scenes as Record<string, { title: string; summary: string; lines: unknown[] }>;
    // a stand-in for each one not written yet (story L Tasks 9-11 write them); a written one is put back as it was
    const ids = ['group:act2', 'group:act3', 'group:act4'];
    const written = Object.fromEntries(ids.map((id) => [id, scenes[id]]));
    for (const id of ids) scenes[id] ??= { title: id, summary: '', lines: [] };
    try {
      const s = everything();
      s.story.seen.push('group:act2', 'group:act3', 'group:act4');
      s.story.fresh = ['group:act3'];
      const page = (stage: string) => handbook(s).truths.find((t) => t.stage === stage)!.scenes;
      expect(page('act2').map((e) => e.scene)).toEqual(['act2', 'group:act2']);
      expect(page('act3').map((e) => [e.scene, e.fresh])).toEqual([['act3', false], ['group:act3', true]]);
      expect(page('act4').map((e) => e.scene)).toEqual(['act4', 'group:act4', 'finale-eve']);
      // one missed (never seen) is simply not listed
      s.story.seen = s.story.seen.filter((id) => id !== 'group:act2');
      expect(page('act2').map((e) => e.scene)).toEqual(['act2']);
    } finally {
      for (const id of ids) if (written[id]) scenes[id] = written[id]; else delete scenes[id];
    }
  });

  it('a banter is replayable from the page of each of its two, once seen: after her chats, before her homecoming (B1)', () => {
    const s = withMemories(withMemories(fresh(), 'safira', 0), 'sylvie', 0);
    const id: SceneId = 'banter:safira-sylvie:1';
    const scenesOf = (st: GameState, c: CharacterId) => handbook(st).people.find((p) => p.id === c)!.scenes.map((e) => e.scene);
    expect(scenesOf(s, 'safira')).toEqual([]);   // not yet heard: not listed
    s.story.seen.push('chat:safira:1', id, 'home:safira');
    s.story.fresh.push(id);
    expect(scenesOf(s, 'safira')).toEqual(['chat:safira:1', id, 'home:safira']);
    expect(scenesOf(s, 'sylvie')).toEqual([id]);
    const entry = handbook(s).people.find((p) => p.id === 'sylvie')!.scenes[0];
    expect(entry).toEqual({ scene: id, title: STORY.scenes[id].title, fresh: true });
    expect(scenesOf(s, 'noel')).toEqual([]);   // nobody else's page
    // everyone's banters, in the fixed pair order
    const all = everything();
    expect(scenesOf(all, 'rin').filter((x) => x.startsWith('banter:'))).toEqual(RIN_BANTERS);
    expect(scenesOf(all, 'hero').filter((x) => x.startsWith('banter:'))).toEqual([]);   // Lorne listens
  });

  it('only seen scenes are listed', () => {
    const s = fresh();
    s.story.seen = [];
    const h = handbook(s);
    expect(h.truths.every((t) => t.scenes.length === 0)).toBe(true);
    expect(h.people.every((p) => p.scenes.length === 0)).toBe(true);
    s.story.seen = ['prologue', 'chat:hero:2'];
    const h2 = handbook(s);
    expect(h2.truths[0].scenes.map((e) => e.scene)).toEqual(['prologue']);
    expect(h2.people.find((p) => p.id === 'hero')!.scenes.map((e) => e.scene)).toEqual(['chat:hero:2']);
    s.story.seen = ['prologue', 'prologue-inn'];
    const h3 = handbook(s);
    expect(h3.truths[0].scenes.map((e) => e.scene)).toEqual(['prologue']);   // the truth page replays the prologue alone
    expect(h3.people.find((p) => p.id === 'rin')!.scenes.map((e) => e.scene)).toEqual(['prologue-inn']);   // not the first return, unseen
  });

  it('a piece is playable when it is found and seen, or found and untold (story L spec §4.7)', () => {
    const s = withMemories(fresh(), 'noel', 2);
    s.story.seen = [memScene('noel', 1)];
    s.story.untold = [memScene('noel', 2)];
    const noel = handbook(s).memories.find((m) => m.id === 'noel')!;
    expect(noel.pieces.map((p) => p.found)).toEqual([true, true, false, false, false]);
    expect(noel.pieces.map((p) => p.seen)).toEqual([true, false, false, false, false]);
    expect(noel.pieces.map((p) => p.untold)).toEqual([false, true, false, false, false]);
  });

  it('an untold piece is playable and new; a character row is new while any is (story L Task 4)', () => {
    const s = withMemories(withMemories(fresh(), 'noel', 3), 'selene', 1);
    s.story.seen = [memScene('noel', 1), memScene('selene', 1)];
    s.story.untold = [memScene('noel', 3), memScene('noel', 2)];
    const page = (id: CharacterId) => handbook(s).memories.find((m) => m.id === id)!;
    const noel = page('noel');
    expect(noel.pieces.map((p) => p.untold)).toEqual([false, true, true, false, false]);
    expect(noel.pieces.map((p) => p.fresh)).toEqual([false, true, true, false, false]);   // untold reads as new
    expect(noel.fresh).toBe(true);
    expect(page('selene').fresh).toBe(false);            // told and opened: nothing new
    // told one by one, the row stays new while any is untold, then it is not
    s.story.untold = [memScene('noel', 3)];
    s.story.seen.push(memScene('noel', 2));
    expect(page('noel').fresh).toBe(true);
    s.story.untold = [];
    s.story.seen.push(memScene('noel', 3));
    expect(page('noel').fresh).toBe(false);
    expect(page('noel').pieces.every((p) => !p.untold)).toBe(true);
    // a piece the story setting skipped (auto) is seen and new: the row is new for it as well
    s.story.fresh = [memScene('noel', 3)];
    expect(page('noel').fresh).toBe(true);
    // an unmet one has no row to mark
    expect(page('bobby').fresh).toBe(false);
  });

  it('a set piece is listed under its set only, never under the specials too', () => {
    const piece = Object.values(SPECIALS).find((d) => d.set)!;
    const lone = Object.values(SPECIALS).find((d) => !d.set)!;
    const s = fresh();
    s.codex = [lone.id, piece.id, piece.set!];
    const c = handbook(s).codex;
    expect(c.specials).toEqual([lone.id]);
    expect(c.sets).toEqual([piece.set]);
  });
});

describe("the handbook's leads (6c Task 16)", () => {
  it('a new game holds the first lead and nothing followed yet', () => {
    expect(handbook(fresh()).leads).toEqual({ current: { id: 'selene', region: 'mainline', depth: 2 }, followed: [], allMet: false });
  });

  it('keeps the leads followed, in lead order, and the next one', () => {
    const s = withMemories(fresh(), 'selene', 0);
    s.dungeon.reached.mainline = 2;
    withMemories(s, 'safira', 0);
    const { leads } = handbook(s);
    expect(leads.current).toEqual({ id: 'chizuru', region: 'frost', depth: 3 });
    expect(leads.followed.map((l) => l.id)).toEqual(['selene', 'safira']);
    expect(leads.allMet).toBe(false);
  });

  it('once everyone is met there is no lead left', () => {
    const { leads } = handbook(everything());
    expect(leads.current).toBeNull();
    expect(leads.followed).toHaveLength(8);
    expect(leads.allMet).toBe(true);
  });
});

describe('time and moon: the handbook says the moon (Task 4)', () => {
  it('a moon piece not found yet says its moon in the hint', () => {
    const s = withMemories(fresh(), 'selene', 0);
    const where = CHAINS.selene.pieces[0].regions.map((r) => REGIONS[r].name).join('、');
    const hints = handbook(s).memories.find((m) => m.id === 'selene')!.pieces.map((p) => p.hint);
    expect(hints).toEqual([`${where}・淺層`, `${where}・深處・滿月`, `${where}・深處`, `${where}・深處・滿月`, `${where}・深處・新月`]);
    // no other chain waits on a moon: no moon in its hints
    for (const id of CHARACTER_IDS.filter((c) => c !== 'selene')) {
      for (const p of handbook(withMemories(fresh(), id, 0)).memories.find((m) => m.id === id)!.pieces) expect(p.hint, id).not.toMatch(/[新滿]月|[上下]弦/);
    }
  });

  it('a piece under more than one moon names them all', () => {
    expect(T.ui2.handbook.pieceHint('本道', true, '新月、滿月')).toBe('本道・深處・新月、滿月');
    expect(T.ui2.handbook.pieceHint('本道', false)).toBe('本道・淺層');
    const where = CHAINS.selene.pieces[1].regions.map((r) => REGIONS[r].name).join('、');
    const piece = CHAINS.selene.pieces[1];
    const was = piece.when;
    piece.when = { moon: ['new', 'full'] };
    try {
      expect(handbook(withMemories(fresh(), 'selene', 0)).memories.find((m) => m.id === 'selene')!.pieces[1].hint).toBe(`${where}・深處・新月、滿月`);
    } finally {
      piece.when = was;
    }
  });
});

describe('time and moon: the spring festival in the handbook (Task 7)', () => {
  it("the festival sits after Chizuru's homecoming on her page", () => {
    expect(SEASON_SCENES.spring).toBe('season:spring');   // Task 8: written and registered
    const s = withMemories(fresh(), 'chizuru', chainLength('chizuru'));
    for (let n = 1; n <= chainLength('chizuru'); n++) s.story.seen.push(memScene('chizuru', n));
    s.story.seen.push('home:chizuru');
    const page = () => handbook(s).people.find((p) => p.id === 'chizuru')!.scenes.map((e) => e.scene);
    expect(page().at(-1)).toBe('home:chizuru');   // not yet seen: not listed
    s.story.seen.push('season:spring');
    s.story.fresh = ['season:spring'];
    expect(page().slice(-2)).toEqual(['home:chizuru', 'season:spring']);
    expect(handbook(s).people.find((p) => p.id === 'chizuru')!.scenes.at(-1)).toMatchObject({ title: `${CHARACTERS.chizuru.name}・春祭`, fresh: true });
    // no one else's page lists it
    for (const p of handbook(s).people.filter((x) => x.id !== 'chizuru')) expect(p.scenes.map((e) => e.scene)).not.toContain('season:spring');
  });
});

describe('the handbook and the bond (bond plan Task 14)', () => {
  const page = (s: GameState, id: CharacterId) => handbook(s).people.find((p) => p.id === id)!;
  it('the bond page counts every source against its cap', () => {
    const s = newGame();
    s.party.roster.rin.memories = 3;
    s.party.roster.rin.bond = { talk: 5, field: 41, gifts: { 'dusk-cloth': 30 } };
    const b = page(s, 'rin').bond!;
    expect(b.tier).toBe(4);
    expect(b.points).toBe(Math.min(100, 10 + 9 + 5 + 30 + 40));
    expect(b.sources).toEqual({ memory: [9, 21], talk: [5, 12], gift: [30, 30], field: [40, 40] });
    expect(page(s, 'hero').bond).toBeUndefined();
    expect(page(s, 'selene').bond).toBeUndefined();   // not met
    s.party = meet(s.party, 'selene', 1);
    expect(page(s, 'selene').bond).toEqual({ tier: 0, points: 10, sources: { memory: [0, 15], talk: [0, 12], gift: [0, 30], field: [0, 40] }, tastes: [] });
  });

  it('a taste shows only once she has been offered it (a refusal too), in GIFTABLE order', () => {
    const s = newGame();
    s.party.roster.rin.bond = { talk: 0, field: 0, gifts: { 'star-tear': 1, 'dusk-cloth': 2, moss: 1 }, refused: ['king-scale'] };
    expect(page(s, 'rin').bond!.tastes).toEqual([
      { mat: 'moss', taste: 'neutral' }, { mat: 'dusk-cloth', taste: 'loved' }, { mat: 'star-tear', taste: 'liked' }, { mat: 'king-scale', taste: 'declined' },
    ]);
  });

  it('bond scenes, endings and the romance are listed once seen', () => {
    bondsAdd('rin', 'liz');
    regAdd(ENDINGS_WRITTEN, 'rin', 'liz');
    regAdd(ROMANCES_WRITTEN, 'rin', 'liz');
    const titled = (id: SceneId) => { STORY.scenes[id] = { title: id, lines: [{ who: 'narrator', text: '甲。' }], summary: '乙。' }; };
    const ids: SceneId[] = ['bond:rin:1', 'bond:rin:2', 'bond:rin:3', 'bond:rin:4', 'ending:rin', 'romance:rin', 'bond:liz:1', 'bond:liz:2', 'bond:liz:3', 'bond:liz:4', 'ending:liz', 'romance:liz'];
    for (const id of ids) titled(id);
    try {
      const s = newGame();
      s.party = meet(s.party, 'liz', 1);
      s.story.seen.push('bond:rin:1', 'bond:rin:2', 'chat:rin:1', 'bond:liz:1', 'chat:liz:1', 'chat:liz:2');
      const rin = page(s, 'rin').scenes.map((e) => e.scene);
      expect(rin.indexOf('bond:rin:1')).toBe(rin.indexOf('chat:rin:1') + 1);   // her bonds after her chats
      expect(rin).toContain('bond:rin:2');
      expect(rin).not.toContain('bond:rin:3');
      expect(page(s, 'liz').scenes.map((e) => e.scene)).toEqual(['chat:liz:1', 'chat:liz:2', 'bond:liz:1']);
      s.party.roster.rin.oath = true;
      s.story.seen.push('bond:rin:3', 'ending:rin', 'romance:rin', 'ending:liz');
      const after = page(s, 'rin').scenes.map((e) => e.scene);
      expect(after.slice(-2)).toEqual(['ending:rin', 'romance:rin']);
      expect(after).toContain('bond:rin:3');
      expect(page(s, 'liz').scenes.map((e) => e.scene).at(-1)).toBe('ending:liz');
    } finally {
      bondsBack(); endingsBack(); romancesBack();
      for (const id of ids) scenesBack(id);
    }
  });
});

describe('the handbook and a healed refusal (review of bond plan Tasks 12-14)', () => {
  it('a material she refused stays 婉拒 after her healing until she takes it', () => {
    const s = withTold(newGame(), 'noel', chainLength('noel'));
    s.party.roster.noel.bond = { talk: 0, field: 0, gifts: {}, refused: ['star-stone'] };
    const page = () => handbook(s).people.find((p) => p.id === 'noel')!.bond!.tastes;
    expect(page()).toEqual([{ mat: 'star-stone', taste: 'declined' }]);
    s.party.roster.noel.bond.gifts['star-stone'] = 1;
    expect(page()).toEqual([{ mat: 'star-stone', taste: 'liked' }]);
  });
});

describe('the bestiary page (roster plan Task C6)', () => {
  const fresh = (): GameState => newGame();
  const page = (s: GameState, id: string) => handbook(s).codex.monsters.find((m) => m.id === id);

  it('only live foes are listed', () => withRosterOnly([], () => {
    // L1b: measures the game as it was with nothing live.
    const s = fresh();
    expect(page(s, 'paper-moth')).toBeUndefined();
    expect(handbook(s).codex.monsters.map((m) => m.id)).toEqual(LEGACY_ENEMY_IDS.filter((id) => !ENEMIES[id].story));
    withRosterLive(['paper-moth', 'fog-warden'], () => {
      expect(page(s, 'paper-moth')).toBeDefined();
      expect(page(s, 'fog-warden')).toBeDefined();
      expect(page(s, 'root-hound')).toBeUndefined();
    });
  }));

  it('the first live wave is listed, each a name of question marks until met (L1b)', () => withRosterOnly([...WAVE_1_LIVE], () => {
    // L2b: measures the game as it was with only the first wave live.
    const s = fresh();
    const by = (f: string) => handbook(s).codex.monsters.filter((m) => m.filter === f).map((m) => m.id);
    expect(by('road')).toEqual(['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade', 'paper-moth', 'lamp-wight', 'root-hound',
      'tin-soldier', 'dust-mimic', 'market-ghost', 'tongueless-bell', 'hollow-hunter', 'mist-twin', 'moon-crow', 'bell-watcher', 'sleepwalker', 'hoarder']);
    expect(by('lands')).toEqual([]);
    expect(by('bosses')).toEqual(['lanterneater', 'false-moon', 'bell-warden', 'fog-warden', 'silent-bell', 'hollow-champion']);
    expect(page(s, 'old-city-sentinel')).toBeUndefined();   // R2, not live yet
    expect(page(s, 'paper-moth')).toMatchObject({ name: B.unknown, seen: 0, trait: null, lines: [] });
    s.bestiary = { 'paper-moth': { seen: 1, felled: 1 } };
    expect(page(s, 'paper-moth')).toMatchObject({ name: ENEMIES['paper-moth'].name, trait: BESTIARY['paper-moth']!.trait });
  }));

  it('the second live wave is listed too, each a name of question marks until met (L2b)', () => withRosterOnly([...WAVE_2_LIVE], () => {
    // L3b: measures the game as it was before the third wave.
    const s = fresh();
    const by = (f: string) => handbook(s).codex.monsters.filter((m) => m.filter === f).map((m) => m.id);
    expect(by('road')).toEqual(['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade', 'paper-moth', 'lamp-wight', 'root-hound',
      'tin-soldier', 'dust-mimic', 'market-ghost', 'tongueless-bell', 'hollow-hunter', 'mist-twin', 'moon-crow', 'bell-watcher', 'sleepwalker',
      'old-city-sentinel', 'requiem-choir', 'lantern-larva', 'epitaph-golem', 'ancestor-automaton', 'ash-archivist', 'wick-shade', 'keeper-echo',
      'ember-maw', 'sorrow-crystal', 'deep-tendril', 'music-box', 'paper-cranes', 'lost-shadow', 'returning-light', 'hoarder', 'gilded-hoarder']);
    expect(by('lands')).toEqual([]);
    expect(by('bosses')).toEqual(['lanterneater', 'false-moon', 'bell-warden', 'toppled-automaton', 'requiem-conductor', 'lantern-brood',
      'fog-warden', 'silent-bell', 'hollow-champion', 'old-city-archon', 'gorged-beast', 'lantern-mother', 'forgotten-festival', 'starless-whale',
      'stopped-clock', 'first-lantern', 'archon-hand']);
    // L2c: the finale's foe is listed too, met only at the bottom (ruling 11).
    expect(page(s, 'lantern-mother')).toMatchObject({ name: B.unknown, haunts: B.haunts.finale });
    expect(page(s, 'cinder-imp')).toBeUndefined();   // R3, not live yet
    expect(page(s, 'keeper-echo')).toMatchObject({ name: B.unknown, seen: 0, trait: null, lines: [] });
    s.bestiary = { 'keeper-echo': { seen: 1, felled: 1 } };
    expect(page(s, 'keeper-echo')).toMatchObject({ name: ENEMIES['keeper-echo'].name, trait: BESTIARY['keeper-echo']!.trait });
  }));

  it('the third live wave is listed too: the fire, frost and storm lands (L3b)', () => withRosterOnly([...WAVE_3_LIVE], () => {
    // L4b: measures the game as it was before the fourth wave.
    const s = fresh();
    const by = (f: string) => handbook(s).codex.monsters.filter((m) => m.filter === f).map((m) => m.id);
    expect(by('road')).toHaveLength(37);
    expect(by('lands')).toEqual(['cinder-imp', 'forge-hound', 'ash-mourner', 'mirage-dancer', 'sand-scorpion', 'frost-doll', 'glacier-tortoise',
      'snow-caller', 'ice-komainu', 'frozen-pilgrim', 'thunder-kite', 'storm-totem', 'charge-jelly', 'star-ember', 'stolen-tome']);
    expect(by('bosses')).toEqual(['lanterneater', 'false-moon', 'bell-warden', 'toppled-automaton', 'requiem-conductor', 'lantern-brood',
      'mirage-lead', 'ice-shrine', 'burning-page', 'fog-warden', 'silent-bell', 'hollow-champion', 'old-city-archon', 'gorged-beast',
      'lantern-mother', 'forgotten-festival', 'starless-whale', 'stopped-clock', 'first-lantern', 'ember-tyrant', 'sandstorm-maw', 'mirage-city',
      'rime-sovereign', 'white-silence', 'rift-maw', 'thunder-roc', 'storm-conductor', 'starfire-colossus', 'archon-hand', 'rime-pillar']);
    expect(page(s, 'bog-mother')).toBeUndefined();   // R4, not live yet
    // A land's native says where: its land from depth 4 (spec §10); its story line waits for its gate.
    expect(page(s, 'mirage-dancer')).toMatchObject({ name: B.unknown, seen: 0, trait: null, lines: [] });
    s.bestiary = { 'mirage-dancer': { seen: 1, felled: 1 } };
    expect(page(s, 'mirage-dancer')).toMatchObject({ name: ENEMIES['mirage-dancer'].name, trait: BESTIARY['mirage-dancer']!.trait });
    expect(page(s, 'mirage-dancer')!.lines).toEqual([BESTIARY['mirage-dancer']!.lines[0].text]);   // Safira's 1st piece not seen
  }));

  it('the fourth live wave is listed too: the mire, shade and iron lands, the whole roster (L4b)', () => {
    const s = fresh();
    const by = (f: string) => handbook(s).codex.monsters.filter((m) => m.filter === f).map((m) => m.id);
    expect(by('road')).toHaveLength(37);
    expect(by('lands')).toEqual(['cinder-imp', 'forge-hound', 'ash-mourner', 'mirage-dancer', 'sand-scorpion', 'frost-doll', 'glacier-tortoise',
      'snow-caller', 'ice-komainu', 'frozen-pilgrim', 'thunder-kite', 'storm-totem', 'charge-jelly', 'star-ember', 'stolen-tome',
      ...['bog-mother', 'rot-lily', 'leech-knight', 'ashen-treant', 'spore-moth', 'mirror-thief', 'veil-stalker',
      'hush-acolyte', 'vault-mimic', 'debt-collector', 'rivet-golem', 'siege-crab', 'herald-engine', 'fallen-knight', 'banner-bearer']]);
    expect(by('bosses')).toEqual(['lanterneater', 'false-moon', 'bell-warden', 'toppled-automaton', 'requiem-conductor', 'lantern-brood',
      'mirage-lead', 'ice-shrine', 'burning-page', 'grey-elder', 'locked-vault', 'gate-breaker', 'fog-warden', 'silent-bell', 'hollow-champion',
      'old-city-archon', 'gorged-beast', 'lantern-mother', 'forgotten-festival', 'starless-whale', 'stopped-clock', 'first-lantern', 'ember-tyrant',
      'sandstorm-maw', 'mirage-city', 'rime-sovereign', 'white-silence', 'rift-maw', 'thunder-roc', 'storm-conductor', 'starfire-colossus',
      'mire-hydra', 'grey-blight', 'bog-leviathan', 'faceless-host', 'vault-dragon', 'shadow-parade', 'fortress-colossus', 'siege-titan',
      'last-commander', 'archon-hand', 'rime-pillar']);
    // A land's native says where: its land from depth 4 (spec §10); its story line waits for its gate.
    expect(page(s, 'ashen-treant')).toMatchObject({ name: B.unknown, seen: 0, trait: null, lines: [] });
    s.bestiary = { 'ashen-treant': { seen: 1, felled: 1 } };
    expect(page(s, 'ashen-treant')).toMatchObject({ name: ENEMIES['ashen-treant'].name, trait: BESTIARY['ashen-treant']!.trait });
    expect(page(s, 'ashen-treant')!.lines).toEqual([BESTIARY['ashen-treant']!.lines[0].text]);   // Sylvie's 1st piece not seen
  });

  it('an unseen foe is a name of question marks and a place', () => {
    const s = fresh();
    s.revealed = { slime: ['fire'] };
    expect(page(s, 'slime')).toEqual({
      id: 'slime', name: B.unknown, filter: 'road', seen: 0, felled: 0, haunts: B.haunts.everywhere,
      weak: null, trait: null, lines: [], mats: [], inscription: null,
    });
    s.bestiary = { slime: { seen: 2, felled: 0 } };
    expect(page(s, 'slime')).toMatchObject({ name: ENEMIES.slime.name, seen: 2, felled: 0, weak: ['fire'], mats: [] });
    // Felled: its materials, as the bestiary has seen them drop.
    s.bestiary.slime.felled = 1;
    expect(page(s, 'slime')!.mats).toEqual([...new Set(ENEMIES.slime.drops.map((d) => d.mat))]);
    // Where each kind is met.
    withRosterLive(['paper-moth', 'cinder-imp', 'fog-warden', 'false-moon', 'mirage-lead', 'mire-hydra', 'old-city-archon', 'archon-hand'], () => {
      expect(page(s, 'paper-moth')!.haunts).toBe(B.haunts.road(4, 9));
      expect(page(s, 'cinder-imp')!.haunts).toBe(REGIONS.blaze.name);
      expect(page(s, 'fog-warden')!.haunts).toBe(B.haunts.depth(B.haunts.main, 5));
      expect(page(s, 'false-moon')!.haunts).toBe(B.haunts.depth(B.haunts.main, 8));
      expect(page(s, 'mirage-lead')!.haunts).toBe(B.haunts.from(REGIONS.blaze.name, 8));
      expect(page(s, 'mire-hydra')!.haunts).toBe(B.haunts.depth(REGIONS.mire.name, 5));
      expect(page(s, 'old-city-archon')!.haunts).toBe(B.haunts.depth(B.haunts.main, 20));
      expect(page(s, 'archon-hand')!.haunts).toBe(B.haunts.depth(B.haunts.main, 20));
    });
    expect(page(s, 'lanterneater')!.haunts).toBe(B.haunts.bossFloors);
  });

  it('the filters split main road, regions and bosses', () => {
    const s = fresh();
    // L1b: exactly these live, the rest as with nothing live.
    withRosterOnly(['paper-moth', 'cinder-imp', 'fog-warden', 'false-moon', 'old-city-archon', 'archon-hand'], () => {
      const by = (f: string) => handbook(s).codex.monsters.filter((m) => m.filter === f).map((m) => m.id);
      expect(by('road')).toEqual(['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade', 'paper-moth']);
      expect(by('lands')).toEqual(['cinder-imp']);
      expect(by('bosses')).toEqual(['lanterneater', 'false-moon', 'fog-warden', 'old-city-archon', 'archon-hand']);
    });
  });

  it('lines open with their gates', () => {
    const was = BESTIARY['false-moon'];
    try {
      BESTIARY['false-moon'] = {
        trait: '它在明與蝕之間換來換去。',
        lines: [{ text: '第一句。' }, { text: '第二句。', after: { seen: ['mem:selene:2'] } }, { text: '第三句。', after: { seen: ['mem:selene:3'] } }],
      };
      withRosterLive(['false-moon'], () => {
        const s = fresh();
        expect(page(s, 'false-moon')).toMatchObject({ trait: null, lines: [] });
        s.bestiary = { 'false-moon': { seen: 1, felled: 0 } };
        // Seen: its trait; the lines wait for a kill.
        expect(page(s, 'false-moon')).toMatchObject({ trait: '它在明與蝕之間換來換去。', lines: [] });
        s.bestiary['false-moon'].felled = 1;
        expect(page(s, 'false-moon')!.lines).toEqual(['第一句。']);
        s.story.seen.push('mem:selene:2');
        expect(page(s, 'false-moon')!.lines).toEqual(['第一句。', '第二句。']);
        s.story.seen.push('mem:selene:3');
        expect(page(s, 'false-moon')!.lines).toEqual(['第一句。', '第二句。', '第三句。']);
      });
    } finally {
      if (was) BESTIARY['false-moon'] = was; else delete BESTIARY['false-moon'];
    }
  });

  it('a prism foe shows its weakness as turning', () => {
    withRosterLive(['moon-crow', 'paper-moth'], () => {
      const s = fresh();
      s.bestiary = { 'moon-crow': { seen: 1, felled: 1 }, 'paper-moth': { seen: 1, felled: 1, inscribed: true } };
      s.revealed = { 'moon-crow': ['ice'] };
      expect(page(s, 'moon-crow')!.weak).toBe('prism');
      // An ordinary species felled shows its inscription key.
      expect(page(s, 'paper-moth')!.inscription).toBe(ENEMIES['paper-moth'].inscribe);
      expect(page(s, 'moon-crow')!.own).toBeUndefined();
    });
  });

  it('the own-unique line reads the codex', () => {
    withRosterLive(['fog-warden'], () => {
      const s = fresh();
      s.bestiary = { 'fog-warden': { seen: 1, felled: 0 } };
      expect(page(s, 'fog-warden')!.own).toEqual({ id: 'fog-halberd', got: false });
      s.codex = ['fog-halberd'];
      expect(page(s, 'fog-warden')!.own).toEqual({ id: 'fog-halberd', got: true });
    });
  });
});
