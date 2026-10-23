import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../data/characters';
import { STORY, type ScriptLine } from '../data/story.zh-TW';
import { Game } from '../engine/game';
import { constRng } from '../engine/testing';
import type { CharacterId } from '../engine/types';
import { NORMAL_SMILES, PUBLISHED_FACES, allArtUrls, art, type StoryMood } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { GRAVE, GRAVE_FALLBACK, speakerOf } from './story';

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

  it('every heavy companion line in the script now shows a face (107 lines, 0 hidden)', () => {
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
    expect(heavy).toHaveLength(107);
    expect(hidden).toEqual([]);
    // Liz's hushed lines are not grave but used to borrow her smile: all 8 now have the hushed face.
    const hushed = lines.filter((l) => l.who === 'liz' && l.mood === 'hushed');
    expect(hushed).toHaveLength(8);
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
