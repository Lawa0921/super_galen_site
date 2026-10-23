import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../data/characters';
import { STORY, type ScriptLine } from '../data/story.zh-TW';
import { Game } from '../engine/game';
import { constRng } from '../engine/testing';
import type { CharacterId } from '../engine/types';
import { SCENE_IDS, heavyScene } from '../data/story/scenes';
import { MOODS_OF, NORMAL_SMILES, PUBLISHED_FACES, allArtUrls, art, type StoryMood } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { GRAVE, GRAVE_FALLBACK, HAPPY, NEAR_FACE, speakerOf } from './story';

// Companion talking faces, wave 1 (art-factory/starlantern/runs/2026-10-23-faces-wave1; user approval 2026-10-23
// 「可以先這樣接進去看看」): a grave line shows the companion's own face, or a near one, and never her smiling normal.
const ALL = new Set(allArtUrls());
const ART: ArtIndex = { has: (u) => ALL.has(u) };
const without = (...gone: string[]): ArtIndex => ({ has: (u) => ALL.has(u) && !gone.includes(u) });
const state = () => new Game(constRng(0.5), null).state;
const face = (who: CharacterId, mood: StoryMood, index = ART) => speakerOf(who, state(), index, mood).face;

describe('companion grave faces', () => {
  it('a grave mood shows its own face when published', () => {
    expect(face('scarlet', 'shaken')).toBe(art.portrait('scarlet', 'shaken'));
    expect(face('scarlet', 'vow')).toBe(art.portrait('scarlet', 'vow'));
    expect(face('chizuru', 'solemn')).toBe(art.portrait('chizuru', 'solemn'));
    expect(face('selene', 'wistful')).toBe(art.portrait('selene', 'wistful'));
    expect(face('sylvie', 'serious')).toBe(art.portrait('sylvie', 'serious'));
    expect(face('noel', 'sad')).toBe(art.portrait('noel', 'sad'));
  });

  it('falls back to the mapped face: shaken→sad, solemn→serious, vow→serious, distant→wistful→sad, wistful→sad', () => {
    expect(GRAVE_FALLBACK).toEqual({ shaken: ['sad'], solemn: ['serious'], vow: ['serious'], distant: ['wistful', 'sad'], wistful: ['sad'] });
    expect(face('scarlet', 'shaken', without(art.portrait('scarlet', 'shaken')))).toBe(art.portrait('scarlet', 'sad'));
    expect(face('chizuru', 'solemn', without(art.portrait('chizuru', 'solemn')))).toBe(art.portrait('chizuru', 'serious'));
    expect(face('scarlet', 'vow', without(art.portrait('scarlet', 'vow')))).toBe(art.portrait('scarlet', 'serious'));
    expect(face('selene', 'distant')).toBe(art.portrait('selene', 'wistful'));
    expect(face('selene', 'distant', without(art.portrait('selene', 'wistful')))).toBe(art.portrait('selene', 'sad'));
    expect(face('selene', 'wistful', without(art.portrait('selene', 'wistful')))).toBe(art.portrait('selene', 'sad'));
  });

  it('with no suitable face the portrait stays hidden, never the smiling normal', () => {
    expect(face('noel', 'serious')).toBeUndefined();     // Noel has no serious face (and no serious line)
    expect(face('safira', 'serious')).toBeUndefined();   // nor Safira
    expect(face('noel', 'sad', without(art.portrait('noel', 'sad')))).toBeUndefined();
    expect(face('scarlet', 'shaken', without(art.portrait('scarlet', 'shaken'), art.portrait('scarlet', 'sad')))).toBeUndefined();
    expect(face('selene', 'distant', without(art.portrait('selene', 'wistful'), art.portrait('selene', 'sad')))).toBeUndefined();
    for (const id of NORMAL_SMILES) for (const m of GRAVE) expect(face(id as CharacterId, m), `${id} ${m}`).not.toBe(art.portrait(id, 'normal'));
  });

  it('Liz says her hushed lines with her hushed face', () => {
    expect(face('liz', 'hushed')).toBe(art.portrait('liz', 'hushed'));
    expect(face('liz', 'hushed', without(art.portrait('liz', 'hushed')))).toBe(art.portrait('liz', 'normal'));
  });

  it('Lorne and Rin are unchanged: a grave face of their own, else their calm normal', () => {
    expect(face('hero', 'serious')).toBe(art.portrait('hero', 'normal'));
    expect(face('hero', 'distant')).toBe(art.portrait('hero', 'normal'));
    expect(face('hero', 'sad')).toBe(art.portrait('hero', 'sad'));
    expect(face('rin', 'serious')).toBe(art.portrait('rin', 'normal'));
    expect(face('rin', 'sad')).toBe(art.portrait('rin', 'sad'));
  });

  it('every heavy companion line in the script now shows a face (100 lines, 0 hidden)', () => {
    const lines: ScriptLine[] = [];
    const seen = new Set<unknown>();
    const walk = (o: unknown): void => {
      if (!o || typeof o !== 'object' || seen.has(o)) return;
      seen.add(o);
      const l = o as Partial<ScriptLine>;
      if (typeof l.who === 'string' && typeof l.text === 'string') { lines.push(l as ScriptLine); return; }
      for (const v of Object.values(o)) walk(v);
    };
    walk(STORY);
    const heavy = lines.filter((l) => NORMAL_SMILES.has(l.who) && l.mood && GRAVE.has(l.mood));
    const s = state();
    const hidden = heavy.filter((l) => !speakerOf(l.who, s, ART, l.mood).face).map((l) => `${l.who} ${l.mood} ${l.text}`);
    expect(heavy).toHaveLength(104);   // story polish M: memories end on an action now, not on a said wound (107 -> 100); story L group:act2 +1, group:act3 +3
    expect(hidden).toEqual([]);
    // Liz's hushed lines are not grave but used to borrow her smile: all 7 now have the hushed face (story polish M: her meeting has none).
    const hushed = lines.filter((l) => l.who === 'liz' && l.mood === 'hushed');
    expect(hushed).toHaveLength(7);
    for (const l of hushed) expect(speakerOf('liz', s, ART, 'hushed').face, l.text).toBe(art.portrait('liz', 'hushed'));
  });

  it('every published face is a file under public/, and wave 1 is the 18 faces', () => {
    const companions = CHARACTER_IDS.filter((c) => NORMAL_SMILES.has(c));
    expect(companions.reduce((n, c) => n + (PUBLISHED_FACES[c]?.length ?? 0), 0)).toBe(18);
    for (const [id, faces] of Object.entries(PUBLISHED_FACES)) {
      for (const m of faces) expect(existsSync(`public${art.portrait(id, m)}`), `${id} ${m}`).toBe(true);
    }
  });
});

// Story staging S3 (2026-10-23): in a heavy scene a mood without art takes its nearest face, never the smiling normal.
describe('faces in a heavy scene (staging S3)', () => {
  const heavyFace = (who: CharacterId, mood: StoryMood, index = ART) => speakerOf(who, state(), index, mood, true).face;

  it('every story mood is happy, grave, near-mapped, or one of normal, sad and down', () => {
    const moods = new Set<StoryMood>(Object.values(MOODS_OF).flat());
    const known = new Set<StoryMood>([...HAPPY, ...GRAVE, ...(Object.keys(NEAR_FACE) as StoryMood[]), 'normal', 'sad', 'down']);
    expect([...moods].filter((m) => !known.has(m))).toEqual([]);
    for (const m of HAPPY) expect(GRAVE.has(m) || m in NEAR_FACE, m).toBe(false);
  });

  it('maps a companion mood without art to its nearest face', () => {
    expect(heavyFace('noel', 'panic')).toBe(art.portrait('noel', 'sad'));                // panic → sad
    expect(heavyFace('scarlet', 'surprised')).toBe(art.portrait('scarlet', 'serious'));  // surprised → serious
    expect(heavyFace('chizuru', 'bewildered')).toBe(art.portrait('chizuru', 'serious')); // bewildered → serious
    expect(heavyFace('bobby', 'focused')).toBe(art.portrait('bobby', 'serious'));        // focused → serious
    expect(heavyFace('selene', 'foresee')).toBe(art.portrait('selene', 'wistful'));      // foresee → wistful
    expect(heavyFace('selene', 'foresee', without(art.portrait('selene', 'wistful')))).toBe(art.portrait('selene', 'sad'));
    expect(heavyFace('sylvie', 'alert')).toBe(art.portrait('sylvie', 'serious'));        // alert → serious
    expect(heavyFace('sylvie', 'unguarded')).toBe(art.portrait('sylvie', 'sad'));        // unguarded → sad
  });

  it('with no near face either the portrait stays hidden, never the smiling normal', () => {
    expect(heavyFace('safira', 'surprised')).toBeUndefined();   // Safira has no serious face
    expect(heavyFace('noel', 'pout')).toBeUndefined();          // nor Noel
    for (const id of NORMAL_SMILES) {
      for (const m of [...GRAVE, ...(Object.keys(NEAR_FACE) as StoryMood[])]) expect(heavyFace(id as CharacterId, m), `${id} ${m}`).not.toBe(art.portrait(id, 'normal'));
    }
  });

  it('a happy mood still borrows the smiling normal, and a light scene is as before', () => {
    expect(heavyFace('noel', 'smug')).toBe(art.portrait('noel', 'normal'));
    expect(heavyFace('safira', 'laugh')).toBe(art.portrait('safira', 'normal'));
    expect(face('noel', 'panic')).toBe(art.portrait('noel', 'normal'));
    expect(face('chizuru', 'bewildered')).toBe(art.portrait('chizuru', 'normal'));
  });

  it("Lorne's soft-smiling normal is hidden for a heavy mood without a near face; Rin keeps her calm normal", () => {
    expect(heavyFace('hero', 'serious')).toBeUndefined();
    expect(heavyFace('hero', 'surprised')).toBeUndefined();
    expect(heavyFace('hero', 'resolve')).toBeUndefined();
    expect(heavyFace('hero', 'distant')).toBe(art.portrait('hero', 'sad'));   // distant → wistful → sad
    expect(heavyFace('hero', 'sad')).toBe(art.portrait('hero', 'sad'));
    expect(heavyFace('hero', 'smile')).toBe(art.portrait('hero', 'smile'));
    expect(heavyFace('rin', 'guarded')).toBe(art.portrait('rin', 'normal'));
    expect(heavyFace('rin', 'serious')).toBe(art.portrait('rin', 'normal'));
    expect(heavyFace('rin', 'averted')).toBe(art.portrait('rin', 'sad'));      // averted → sad
  });

  it('the whole script: no non-happy line of a heavy scene shows a smiling normal', () => {
    const s = state();
    const tally: Record<string, number> = {};
    const smiling: string[] = [];
    for (const id of SCENE_IDS) {
      const heavy = heavyScene(id);
      for (const l of STORY.scenes[id].lines) {
        if (!(CHARACTER_IDS as string[]).includes(l.who)) continue;
        const mood = l.mood ?? 'normal';
        const shown = speakerOf(l.who, s, ART, mood, heavy).face;
        const normal = art.portrait(l.who, 'normal');
        const k = !shown ? 'hidden' : shown === art.portrait(l.who, mood) ? 'exact' : shown !== normal ? 'near' : NORMAL_SMILES.has(l.who) || l.who === 'hero' ? 'smiling-normal' : 'calm-normal';
        tally[`${heavy ? 'heavy' : 'light'} ${k}`] = (tally[`${heavy ? 'heavy' : 'light'} ${k}`] ?? 0) + 1;
        if (heavy && k === 'smiling-normal' && !HAPPY.has(mood)) smiling.push(`${id} ${l.who} ${mood} ${l.text}`);
      }
    }
    expect(smiling).toEqual([]);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(400);   // story polish M: 395 -> 382, present halves told by action, act 2's question folded into Anna's line
    // 395 character lines. Before S3 the 15 heavy lines of a non-glad mood without art showed a companion's smile, and 60
    // heavy lines of Lorne and Rin their normal: 75 lines, which now take a near face (35), Rin's calm normal (17) or no
    // portrait (23). A glad mood still borrows the smile (22). The light scenes are as they were.
    expect(tally).toEqual({
      // story polish M: the present halves of the early memories end on an action, so fewer heavy companion lines
      // story L Task 9, group:act2 (nine lines): exact +3, near +1 (Selene's foresee), Rin's calm normal +2, a glad mood +3
      // story L Task 10, group:act3 (nine lines): exact +6, near +1 (Sylvie's alert), Rin's calm normal +1, Bobby's grin +1
      'heavy exact': 102, 'heavy near': 35, 'heavy calm-normal': 20, 'heavy hidden': 22, 'heavy smiling-normal': 22,
      'light exact': 91, 'light calm-normal': 6, 'light smiling-normal': 102,
    });
  });
});
