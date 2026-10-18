import { describe, it, expect } from 'vitest';
import { CHARACTER_IDS } from '../../data/characters';
import { ENEMIES } from '../../data/enemies';
import { SETS, SPECIALS } from '../../data/gear';
import { REGIONS } from '../../data/regions';
import { chainLength, CHAINS } from '../../data/story/chains';
import { TOWN_FRAGMENTS } from '../../data/story/fragments';
import { CHAT_COUNT, SCENE_IDS, STAGES, memScene, type SceneId } from '../../data/story/scenes';
import { STORY } from '../../data/story.zh-TW';
import { meet } from '../party';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { handbook } from './handbook';

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
    const names = (i: number) => CHAINS.noel.pieces[i].regions.map((r) => REGIONS[r].name).join('、');
    expect(noel.pieces[4].hint).toBe(`${names(4)}・深處`);
    expect(noel.pieces[0].hint).toBe(`${names(0)}・淺層`);
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
    const segs = (n: number) => handbook(withMemories(fresh(), 'noel', n)).people.find((p) => p.id === 'noel')!.segments;
    expect(segs(0)).toEqual(STORY.people.noel.slice(0, 1));
    expect(segs(Math.ceil(len / 2) - 1)).toEqual(STORY.people.noel.slice(0, 1));
    expect(segs(Math.ceil(len / 2))).toEqual(STORY.people.noel.slice(0, 2));
    expect(segs(len - 1)).toEqual(STORY.people.noel.slice(0, 2));
    expect(segs(len)).toEqual(STORY.people.noel);
  });

  it("people pages carry the title, and Rin's changes with her oath", () => {
    const s = fresh();
    const rin = () => handbook(s).people.find((p) => p.id === 'rin')!;
    const before = rin().title;
    s.party.roster.rin.oath = true;
    expect(rin().title).not.toBe(before);
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

  it('the codex lists every ordinary monster and its known weaknesses', () => {
    const s = fresh();
    s.codex = [Object.keys(SPECIALS)[0], Object.keys(SETS)[0]];
    s.revealed = { slime: ['fire'] };
    const c = handbook(s).codex;
    expect(c.monsters.map((m) => m.id)).toEqual(Object.values(ENEMIES).filter((e) => !e.story).map((e) => e.id));
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
    expect(open(s)).toEqual(['prologue', 'act1']);
    s.story.nodes = ['act2', 'act4'];
    expect(open(s)).toEqual(['prologue', 'act1', 'act2', 'act4']);
    s.story.finaleCleared = true;
    expect(open(s)).toEqual(['prologue', 'act1', 'act2', 'act4', 'after']);
    expect(handbook(s).truths[0].text).toBe(STORY.truths.prologue);
    expect(handbook(fresh()).truths[2].text).toBeNull();
  });

  it('fresh scenes carry the new mark', () => {
    const s = everything();
    s.story.fresh = [memScene('hero', 1), 'act2', 'chat:rin:2', 'rin-reveal', 'town:orik'];
    const h = handbook(s);
    expect(h.memories.find((m) => m.id === 'hero')!.pieces[0].fresh).toBe(true);
    expect(h.memories.find((m) => m.id === 'hero')!.pieces[1].fresh).toBe(false);
    expect(h.truths.find((t) => t.stage === 'act2')!.scenes[0].fresh).toBe(true);
    expect(h.truths.find((t) => t.stage === 'act3')!.scenes[0].fresh).toBe(false);
    const rin = h.people.find((p) => p.id === 'rin')!;
    expect(rin.scenes.map((e) => [e.scene, e.fresh])).toEqual([
      ['rin-reveal', true], ['chat:rin:1', false], ['chat:rin:2', true], ['chat:rin:3', false], ['chat:rin:4', false],
    ]);
    expect(h.town.find((t) => t.id === 'orik')!.scene!.fresh).toBe(true);
    expect(h.town.find((t) => t.id === 'marta')!.scene!.fresh).toBe(false);
  });

  it('every scene in the catalogue has a page', () => {
    const h = handbook(everything());
    const ids: SceneId[] = [
      ...h.memories.flatMap((m) => m.pieces.map((p) => p.scene)),
      ...h.truths.flatMap((t) => t.scenes.map((e) => e.scene)),
      ...h.people.flatMap((p) => p.scenes.map((e) => e.scene)),
      ...h.town.flatMap((t) => (t.scene ? [t.scene.scene] : [])),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...SCENE_IDS].sort());
    for (const id of CHARACTER_IDS) {
      expect(h.people.find((p) => p.id === id)!.scenes.filter((e) => e.scene.startsWith('chat:')).length).toBe(CHAT_COUNT[id]);
    }
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
  });

  it('a piece is replayable only when it is found and seen: a found piece may still be queued', () => {
    const s = withMemories(fresh(), 'noel', 2);
    s.story.seen = [memScene('noel', 1)];
    s.story.queue = [memScene('noel', 2)];
    const noel = handbook(s).memories.find((m) => m.id === 'noel')!;
    expect(noel.pieces.map((p) => p.found)).toEqual([true, true, false, false, false]);
    expect(noel.pieces.map((p) => p.seen)).toEqual([true, false, false, false, false]);
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
