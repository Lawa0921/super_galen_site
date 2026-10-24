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

  // Wave 2 (art-factory/starlantern/runs/2026-10-24-faces-wave2; user approval 2026-10-24 「繼續」): Lorne's serious and
  // distant, and serious and guarded for both of Rin's looks.
  it('Lorne and Rin say their grave lines with their own wave-2 faces', () => {
    expect(face('hero', 'serious')).toBe(art.portrait('hero', 'serious'));
    expect(face('hero', 'distant')).toBe(art.portrait('hero', 'distant'));
    expect(face('hero', 'sad')).toBe(art.portrait('hero', 'sad'));
    expect(face('rin', 'serious')).toBe(art.portrait('rin', 'serious'));
    expect(face('rin', 'guarded')).toBe(art.portrait('rin', 'guarded'));
    expect(face('rin', 'sad')).toBe(art.portrait('rin', 'sad'));
  });

  it("Rin's era picks the set by the same rule as her normal: the cracked bell before her oath, the oath set after", () => {
    const s = state();
    for (const m of ['normal', 'serious', 'guarded'] as StoryMood[]) {
      expect(speakerOf('rin', s, ART, m).face, `before ${m}`).toBe(art.portrait('rin', m));
      expect(speakerOf('rin', s, ART, m, true).face, `before, heavy ${m}`).toBe(art.portrait('rin', m));
    }
    s.party.roster.rin.oath = true;
    for (const m of ['normal', 'serious', 'guarded'] as StoryMood[]) {
      expect(speakerOf('rin', s, ART, m).face, `after ${m}`).toBe(art.portrait('rin-oath', m));
      expect(speakerOf('rin', s, ART, m, true).face, `after, heavy ${m}`).toBe(art.portrait('rin-oath', m));
    }
    // the two looks never mix: with the oath serious face missing, the oath Rin falls to her own calm normal, not the cracked bell's serious
    expect(speakerOf('rin', s, without(art.portrait('rin-oath', 'serious')), 'serious', true).face).toBe(art.portrait('rin-oath', 'normal'));
  });

  it('every heavy companion line in the script now shows a face (106 lines, 0 hidden)', () => {
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
    expect(heavy).toHaveLength(106);   // story polish M: memories end on an action now, not on a said wound (107 -> 100); story L group:act2 +1, group:act3 +3, group:act4 +7; story L Tasks 12-13: chat:sylvie:1 and :2 read one way (-2), chat:chizuru:2 waits for Bobby (-2); story L Tasks 14-15 net 0 (the finale's Selene wistful and second Scarlet vow +2, hero-alone's Scarlet -2), then the cold read's silent Scarlet in the finale (-1)
    expect(hidden).toEqual([]);
    // Liz's hushed lines are not grave but used to borrow her smile: all 7 now have the hushed face (story polish M: her meeting has none).
    const hushed = lines.filter((l) => l.who === 'liz' && l.mood === 'hushed');
    expect(hushed).toHaveLength(7);
    for (const l of hushed) expect(speakerOf('liz', s, ART, 'hushed').face, l.text).toBe(art.portrait('liz', 'hushed'));
  });

  it('every published face is a file under public/; wave 1 is the 18 companion faces, wave 2 the 6 of Lorne and Rin', () => {
    const companions = CHARACTER_IDS.filter((c) => NORMAL_SMILES.has(c));
    expect(companions.reduce((n, c) => n + (PUBLISHED_FACES[c]?.length ?? 0), 0)).toBe(18);
    expect(PUBLISHED_FACES.hero).toEqual(['smile', 'sad', 'serious', 'distant']);
    expect(PUBLISHED_FACES.rin).toEqual(['smile', 'sad', 'serious', 'guarded']);
    expect(PUBLISHED_FACES['rin-oath']).toEqual(PUBLISHED_FACES.rin);
    for (const [id, faces] of Object.entries(PUBLISHED_FACES)) {
      for (const m of faces) expect(existsSync(`public${art.portrait(id, m)}`), `${id} ${m}`).toBe(true);
    }
  });
});

// Lorne's and Rin's lines in heavy scenes by what they show, before and after wave 2 (filled in from the count below).
// Before: 18 of Lorne's hidden (serious, resolve, surprised), 18 more on his sad face for distant, and 20 of Rin's on her calm normal.
const BEFORE_WAVE2: Record<string, number> = {
  'hero exact': 30, 'hero near': 18, 'hero hidden': 18, 'rin exact': 16, 'rin near': 5, 'rin calm-normal': 20,
};
// After: all 107 show their own face or a near one; none hidden, none on Rin's calm normal.
const AFTER_WAVE2: Record<string, number> = { 'hero exact': 61, 'hero near': 5, 'rin exact': 34, 'rin near': 7 };

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

  it('Lorne and Rin map a heavy mood to their nearest wave-2 face instead of hiding', () => {
    expect(heavyFace('hero', 'serious')).toBe(art.portrait('hero', 'serious'));
    expect(heavyFace('hero', 'distant')).toBe(art.portrait('hero', 'distant'));
    expect(heavyFace('hero', 'resolve')).toBe(art.portrait('hero', 'serious'));     // resolve → serious
    expect(heavyFace('hero', 'surprised')).toBe(art.portrait('hero', 'serious'));   // surprised → serious
    expect(heavyFace('hero', 'sad')).toBe(art.portrait('hero', 'sad'));
    expect(heavyFace('hero', 'smile')).toBe(art.portrait('hero', 'smile'));
    expect(heavyFace('rin', 'serious')).toBe(art.portrait('rin', 'serious'));
    expect(heavyFace('rin', 'guarded')).toBe(art.portrait('rin', 'guarded'));
    expect(heavyFace('rin', 'surprised')).toBe(art.portrait('rin', 'serious'));     // surprised → serious
    expect(heavyFace('rin', 'averted')).toBe(art.portrait('rin', 'sad'));           // averted → sad (eyes down, not wary)
  });

  it("without the wave-2 art Lorne's soft-smiling normal still never stands in: distant → sad, else no portrait", () => {
    const old = without(...(['serious', 'distant'] as StoryMood[]).map((m) => art.portrait('hero', m)));
    expect(heavyFace('hero', 'distant', old)).toBe(art.portrait('hero', 'sad'));    // distant → wistful → sad
    expect(heavyFace('hero', 'serious', old)).toBeUndefined();
    expect(heavyFace('hero', 'resolve', old)).toBeUndefined();
    const oldRin = without(...(['serious', 'guarded'] as StoryMood[]).map((m) => art.portrait('rin', m)));
    expect(heavyFace('rin', 'guarded', oldRin)).toBe(art.portrait('rin', 'normal'));   // Rin's calm normal is a stand-in
  });

  it("Lorne's and Rin's heavy lines, each in its own era: every one shows a face now (wave 2)", () => {
    const tally = (index: ArtIndex) => {
      const t: Record<string, number> = {};
      const hidden: string[] = [];
      for (const id of SCENE_IDS) {
        if (!heavyScene(id)) continue;
        for (const l of STORY.scenes[id].lines) {
          if (l.who !== 'hero' && l.who !== 'rin') continue;
          const s = state();
          if (l.if?.oath === true) s.party.roster.rin.oath = true;   // a line gated on her oath plays in the oath era
          const mood = l.mood ?? 'normal';
          const artId = l.who === 'rin' && s.party.roster.rin.oath ? 'rin-oath' : l.who;
          const shown = speakerOf(l.who, s, index, mood, true).face;
          const k = !shown ? 'hidden' : shown === art.portrait(artId, mood) ? 'exact' : shown === art.portrait(artId, 'normal') ? 'calm-normal' : 'near';
          t[`${l.who} ${k}`] = (t[`${l.who} ${k}`] ?? 0) + 1;
          if (!shown) hidden.push(`${id} ${l.who} ${mood} ${l.text}`);
        }
      }
      return { t, hidden };
    };
    const before = tally(without(...(['serious', 'distant'] as StoryMood[]).map((m) => art.portrait('hero', m)),
      ...['rin', 'rin-oath'].flatMap((a) => (['serious', 'guarded'] as StoryMood[]).map((m) => art.portrait(a, m)))));
    const now = tally(ART);
    expect(before.t).toEqual(BEFORE_WAVE2);
    expect(now.t).toEqual(AFTER_WAVE2);
    expect(now.hidden).toEqual([]);
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
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(400);   // story polish M: 395 -> 382, present halves told by action, act 2's question folded into Anna's line; story L Tasks 12-13: -6 (chat:sylvie:1 without Bobby, :2 one reading, chat:chizuru:2 without the reading that has not met Bobby); story L Tasks 14-15: -4 (chat:selene:2 -2, hero-alone -2, rin-confess -1, the finale +1); the cold read: Scarlet's silent fallback is narration (-1)
    // 395 character lines. Before S3 the 15 heavy lines of a non-glad mood without art showed a companion's smile, and 60
    // heavy lines of Lorne and Rin their normal: 75 lines, which now take a near face (35), Rin's calm normal (17) or no
    // portrait (23). A glad mood still borrows the smile (22). The light scenes are as they were.
    expect(tally).toEqual({
      // story polish M: the present halves of the early memories end on an action, so fewer heavy companion lines
      // story L Task 9, group:act2 (nine lines): exact +3, near +1 (Selene's foresee), Rin's calm normal +2, a glad mood +3
      // story L Task 10, group:act3 (nine lines): exact +6, near +1 (Sylvie's alert), Rin's calm normal +1, Bobby's grin +1
      // story L Task 11, group:act4 (nine lines): exact +7, near +1 (Lorne's distant), Safira's laugh +1
      // cold read fixes: act 4's two lines more (Liz's price of running, a glad mood; Liz breaking, sad), Noel's jab glad now
      // story L Tasks 14-15: the finale's Selene wistful and Scarlet vow (exact +2, glad smiles -2), Noel's whole-chain blush gone
      // (a glad smile -1, her pout hidden +1), Bobby's third reading (near +1); hero-alone's Scarlet two lines fewer (exact -2),
      // rin-confess's Sylvie one fewer (near -1); the cold read: Scarlet's silent fallback is narration (exact -1)
      // face wave 2 (2026-10-24; this tally reads every line before Rin's oath): Lorne's and Rin's heavy lines take their own
      // face (exact +49): from a near face (-11: Lorne's distant had borrowed his sad), Rin's calm normal (-20) and no
      // portrait (-18, Lorne's serious, resolve and surprised). The 5 still hidden are companions' (Safira, Noel: no serious face).
      'heavy exact': 157, 'heavy near': 25, 'heavy hidden': 5, 'heavy smiling-normal': 22,
      // story L Tasks 12-13: light exact -5 (Bobby's and Sylvie's lines in chat:sylvie:1, Sylvie's bed line in :2, two of
      // Chizuru's bell lines), Lorne's smiling normal -1 (his two stand-ins gone, the tofu line moved to chat:sylvie:1)
      // story L Task 15: chat:selene:2 reads one way, two of Selene's lines fewer
      // face wave 2: Rin's light guarded and serious lines (5) and Lorne's one light serious line now show their own face
      'light exact': 92, 'light calm-normal': 1, 'light smiling-normal': 98,
    });
  });
});
