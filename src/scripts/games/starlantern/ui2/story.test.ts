import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { MAJOR_SCENES, type SceneId } from '../data/story/scenes';
import { chainLength } from '../data/story/chains';
import { STORY, linesWhen, type LineWhen, type ScriptLine } from '../data/story.zh-TW';
import { T } from '../data/text.zh-TW';
import { Game } from '../engine/game';
import { constRng } from '../engine/testing';
import { allArtUrls, art, NORMAL_SMILES } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { Dialogue } from './widgets';
import { linesOf, playAndRecord, playLines, playScene, shouldPlay, speakerOf, type StoryCtx } from './story';

const ART: ArtIndex = (() => { const set = new Set([...allArtUrls(), art.npc('guild', 'normal')]); return { has: (u: string) => set.has(u) }; })();
const mk = () => {
  const game = new Game(constRng(0.5), null);
  const talk = new Dialogue(Infinity);
  const ctx: StoryCtx = { game, art: ART, mode: 'all' };
  return { game, talk, ctx };
};
const shown = (talk: Dialogue) => talk.el.querySelector('.slx-text')!.textContent;
const nameOf = (talk: Dialogue) => talk.el.querySelector('.slx-name') as HTMLElement;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const saved = new Map<SceneId, (typeof STORY.scenes)[SceneId]>();
const stage = (id: SceneId, lines: ScriptLine[], summary = '概要') => {
  if (!saved.has(id)) saved.set(id, STORY.scenes[id]);
  STORY.scenes[id] = { title: 't', lines, summary };
};
afterEach(() => { for (const [id, v] of saved) STORY.scenes[id] = v; saved.clear(); });

describe('playScene', () => {
  it('a scene plays its lines in order and ends done', async () => {
    const { talk, ctx } = mk();
    stage('chat:liz:1', [{ who: 'hero', text: '一' }, { who: 'rin', text: '二' }, { who: 'narrator', text: '三' }]);
    const p = playScene(talk, 'chat:liz:1', ctx);
    expect(shown(talk)).toBe('一');
    expect(talk.el.querySelector('.slx-talk-face--left')).not.toBeNull();
    p.onAction('confirm');
    await tick();
    expect(shown(talk)).toBe('二');
    expect(talk.el.querySelector('.slx-talk-face--right')).not.toBeNull();   // the second speaker stands on the right
    p.onAction('confirm');
    await tick();
    expect(shown(talk)).toBe('三');
    // Narration keeps the last speaker's face, dimmed (staging S4).
    const kept = talk.el.querySelector('.slx-talk-face--right');
    expect(kept).not.toBeNull();
    expect(kept!.classList.contains('slx-talk-face--dim')).toBe(true);
    p.onAction('confirm');
    await expect(p.done).resolves.toBe('done');
    expect(talk.busy()).toBe(false);
    expect(talk.el.hidden).toBe(true);           // the scene over, the box goes
    expect(talk.el.querySelector('img')).toBeNull();
  });

  it('the box stays up between the lines of a scene (staging S4)', async () => {
    const { talk, ctx } = mk();
    stage('chat:liz:1', [{ who: 'hero', text: '一' }, { who: 'narrator', text: '二' }, { who: 'rin', text: '三' }]);
    const p = playScene(talk, 'chat:liz:1', ctx);
    for (let i = 0; i < 2; i++) {
      p.onAction('confirm');
      expect(talk.el.hidden, `after line ${i + 1}`).toBe(false);
      await tick();
    }
    expect(talk.el.querySelectorAll('img')).toHaveLength(1);   // Rin's face replaced Lorne's kept one
    p.onAction('confirm');
    await p.done;
    expect(talk.el.hidden).toBe(true);
  });

  it('a skipped scene shows its summary with no face', async () => {
    const { talk, ctx } = mk();
    stage('chat:liz:1', [{ who: 'hero', text: '一' }, { who: 'narrator', text: '二' }]);
    const p = playScene(talk, 'chat:liz:1', ctx);
    p.onAction('cancel');
    await tick();
    expect(talk.el.querySelector('img')).toBeNull();
    p.onAction('confirm');
    await p.done;
    expect(talk.el.hidden).toBe(true);
  });

  it('a heavy scene shows the near face for a mood without art; a light one the old fallback (staging S3)', async () => {
    const { talk, ctx } = mk();
    const src = () => talk.el.querySelector('.slx-talk-face')?.getAttribute('src');
    stage('mem:noel:3', [{ who: 'noel', mood: 'panic', text: '一' }]);
    const heavy = playScene(talk, 'mem:noel:3', ctx);
    expect(src()).toBe(art.portrait('noel', 'sad'));
    heavy.onAction('confirm');
    await heavy.done;
    stage('chat:noel:1', [{ who: 'noel', mood: 'panic', text: '二' }]);
    const light = playScene(talk, 'chat:noel:1', ctx);
    expect(src()).toBe(art.portrait('noel', 'normal'));
    light.onAction('confirm');
    await light.done;
  });

  it("a line's place puts up the scene's card, a later one changes it, and the scene's end takes it down (staging S6)", async () => {
    const { talk, ctx } = mk();
    const screen = document.createElement('div');
    screen.append(talk.el);
    const card = () => screen.querySelector('.slx-place-card')?.textContent ?? null;
    const night = () => !!screen.querySelector('.slx-veil-night.slx-on');
    stage('chat:liz:1', [
      { who: 'narrator', text: '一', place: { text: '月影旅館・深夜', night: true } },
      { who: 'hero', text: '二' },
      { who: 'narrator', text: '三', place: { text: '月影旅館・清晨' } },
    ]);
    const p = playScene(talk, 'chat:liz:1', ctx);
    expect([card(), night()]).toEqual(['月影旅館・深夜', true]);
    p.onAction('confirm'); await tick();
    expect([card(), night()]).toEqual(['月影旅館・深夜', true]);   // a line with no place keeps the card
    p.onAction('confirm'); await tick();
    expect([card(), night()]).toEqual(['月影旅館・清晨', false]);
    p.onAction('confirm');
    await p.done;
    expect([card(), night()]).toEqual([null, false]);
  });

  it('cancel skips the rest and shows the summary', async () => {
    const { talk, ctx } = mk();
    stage('chat:liz:1', [{ who: 'hero', text: '一' }, { who: 'rin', text: '二' }], '兩人說了幾句話。');
    const p = playScene(talk, 'chat:liz:1', ctx);
    p.onAction('cancel');
    await tick();
    expect(shown(talk)).toBe(T.ui2.story.skipped('兩人說了幾句話。'));
    p.onAction('confirm');
    await expect(p.done).resolves.toBe('skipped');
    expect(talk.busy()).toBe(false);
  });

  it('only the past lines of a memory wear the memory style, and it is given back (staging S5)', async () => {
    const { talk, ctx } = mk();
    const p = playScene(talk, 'mem:hero:1', ctx);
    const styles: boolean[] = [];
    for (let i = 0; i < STORY.scenes['mem:hero:1'].lines.length; i++) {
      styles.push(talk.el.classList.contains('slx-talk--memory'));
      p.onAction('confirm');
      await tick();
    }
    await p.done;
    expect(styles).toEqual(STORY.scenes['mem:hero:1'].lines.map((l) => !!l.past));
    expect(styles).toEqual([true, true, false, false]);
    expect(talk.el.classList.contains('slx-talk--memory')).toBe(false);
  });

  it("a memory's present line shows the normal portrait look; a past line the memory one (staging S5)", async () => {
    const { talk, ctx } = mk();
    stage('mem:rin:1', [{ who: 'narrator', past: true, text: '一' }, { who: 'hero', text: '二' }, { who: 'rin', text: '三' }]);
    const p = playScene(talk, 'mem:rin:1', ctx);
    expect(talk.el.classList.contains('slx-talk--memory')).toBe(true);
    p.onAction('confirm'); await tick();
    expect(talk.el.classList.contains('slx-talk--memory')).toBe(false);
    expect(talk.el.querySelector('.slx-talk-face')).not.toBeNull();
    p.onAction('confirm'); await tick();
    p.onAction('confirm');
    await p.done;
  });

  it('lines whose condition fails are left out', () => {
    const { game } = mk();
    stage('chat:liz:1', [
      { who: 'liz', text: '甲' },
      { who: 'liz', text: '乙', if: { notMet: 'bobby' } },
      { who: 'liz', text: '丙', if: { met: 'bobby' } },
      { who: 'liz', text: '丁', if: { returned: 'anna' } },
    ]);
    const s = game.state;
    s.party.recruited = s.party.recruited.filter((c) => c !== 'bobby');
    expect(linesOf('chat:liz:1', s).map((l) => l.text)).toEqual(['甲', '乙']);
    s.party.recruited.push('bobby');
    s.story.returned = ['anna'];
    expect(linesOf('chat:liz:1', s).map((l) => l.text)).toEqual(['甲', '丙', '丁']);
  });

  it('full and oath conditions pick the right lines', () => {
    const { game } = mk();
    stage('chat:liz:1', [
      { who: 'liz', text: '甲' },
      { who: 'liz', text: '乙', if: { full: 'rin' } },
      { who: 'liz', text: '丙', if: { oath: true } },
      { who: 'liz', text: '丁', if: { oath: false } },
      { who: 'liz', text: '戊', if: { full: 'liz' } },
    ]);
    const s = game.state;
    const texts = () => linesOf('chat:liz:1', s).map((l) => l.text);
    expect(texts()).toEqual(['甲', '丁']);                       // nobody full, no choice yet; liz is not even met
    s.party.roster.rin.memories = chainLength('rin');
    expect(texts()).toEqual(['甲', '乙', '丁']);                 // a full chain is read through memoriesOf
    s.party.roster.rin.memories = chainLength('rin') - 1;
    expect(texts()).toEqual(['甲', '丁']);
    s.party.roster.rin.oath = true;
    expect(texts()).toEqual(['甲', '丙']);
    s.party.roster.rin.memories = chainLength('rin');
    expect(texts()).toEqual(['甲', '乙', '丙']);
  });

  it('a scene line waits on a scene the save has seen (story depth Task 1)', async () => {
    const { game, talk, ctx } = mk();
    stage('chat:liz:1', [
      { who: 'rin', text: '看過', if: { seen: 'banter:rin-sylvie:1' } },
      { who: 'rin', text: '沒看過', if: { notSeen: 'banter:rin-sylvie:1' } },
    ]);
    const s = game.state;
    expect(s.story.seen).not.toContain('banter:rin-sylvie:1');
    expect(linesOf('chat:liz:1', s).map((l) => l.text)).toEqual(['沒看過']);
    s.story.seen.push('banter:rin-sylvie:1');
    expect(linesOf('chat:liz:1', s).map((l) => l.text)).toEqual(['看過']);
    const p = playScene(talk, 'chat:liz:1', ctx);   // the player reads the save as it is
    expect(shown(talk)).toBe('看過');
    p.onAction('confirm');
    await expect(p.done).resolves.toBe('done');
  });

  it('linesWhen keeps a line only when every one of its conditions holds', () => {
    const none: LineWhen = { met: [], full: [], returned: [], oath: false };
    const ls: ScriptLine[] = [
      { who: 'narrator', text: '無' },
      { who: 'liz', text: '遇', if: { met: 'liz' } },
      { who: 'liz', text: '未遇', if: { notMet: 'liz' } },
      { who: 'liz', text: '滿', if: { full: 'liz' } },
      { who: 'liz', text: '歸', if: { returned: 'anna' } },
      { who: 'liz', text: '兩', if: { met: 'liz', oath: true } },
    ];
    const t = (w: Partial<LineWhen>) => linesWhen(ls, { ...none, ...w }).map((l) => l.text);
    expect(t({})).toEqual(['無', '未遇']);
    expect(t({ met: ['liz'], full: ['liz'], returned: ['anna'] })).toEqual(['無', '遇', '滿', '歸']);
    expect(t({ met: ['liz'], oath: true })).toEqual(['無', '遇', '兩']);
  });
});

describe('playLines (story polish Task 1)', () => {
  const two: ScriptLine[] = [{ who: 'rin', text: '一' }, { who: 'hero', text: '二' }];
  const plates = async (plate?: (line: ScriptLine, i: number) => string | undefined) => {
    const { talk, ctx } = mk();
    const p = playLines(talk, two, ctx, plate);
    const seen: { name: string; side: string | null }[] = [];
    for (let i = 0; i < two.length; i++) {
      const face = talk.el.querySelector('.slx-talk-face');
      seen.push({ name: nameOf(talk).textContent ?? '', side: face ? (face.classList.contains('slx-talk-face--left') ? 'left' : 'right') : null });
      p.onAction('confirm');
      await tick();
    }
    await expect(p.done).resolves.toBe('done');
    return seen;
  };

  it('playLines plays each line with its plate and face, the first speaker on the left', async () => {
    expect(await plates()).toEqual([{ name: CHARACTERS.rin.name, side: 'left' }, { name: CHARACTERS.hero.name, side: 'right' }]);
    // A plate given for a line replaces the name only: the face stays where it was.
    expect(await plates((_l, i) => (i === 0 ? '？？？' : undefined))).toEqual([{ name: '？？？', side: 'left' }, { name: CHARACTERS.hero.name, side: 'right' }]);
  });

  it("playLines keeps the box up between lines and narration keeps the last face, dimmed (staging S4)", async () => {
    const { talk, ctx } = mk();
    const p = playLines(talk, [{ who: 'rin', text: '一' }, { who: 'narrator', text: '二' }], ctx);
    p.onAction('confirm');
    expect(talk.el.hidden).toBe(false);
    await tick();
    expect(talk.el.querySelector('.slx-talk-face--dim')).not.toBeNull();
    p.onAction('confirm');
    await expect(p.done).resolves.toBe('done');
    expect(talk.el.hidden).toBe(true);
  });

  it('cancel stops playLines with skipped and no summary', async () => {
    const { talk, ctx } = mk();
    const say = vi.spyOn(talk, 'say');
    const p = playLines(talk, two, ctx);
    expect(shown(talk)).toBe('一');
    p.onAction('cancel');
    await expect(p.done).resolves.toBe('skipped');
    p.onAction('confirm');            // a key after the end does nothing
    await tick();
    expect(say.mock.calls.map((c) => c[1])).toEqual(['一']);   // nothing more said: no summary, no second line
    expect(shown(talk)).not.toBe(T.ui2.story.skipped(''));
  });
});

describe('speakerOf', () => {
  it('a speaker without art shows only a name', async () => {
    const { game, talk, ctx } = mk();
    expect(speakerOf('bellkeeper', game.state, ART)).toEqual({ name: '鐘守' });
    expect(speakerOf('merchant', game.state, ART)).toEqual({ name: '流浪商人' });
    expect(speakerOf('narrator', game.state, ART)).toEqual({ name: '' });
    expect(speakerOf('doran', game.state, ART).face).toBe(art.npc('forge', 'normal'));   // published with plan 5d's G1 sample
    expect(speakerOf('doran', game.state, { has: (u) => u !== art.npc('forge', 'normal') }).face).toBeUndefined();   // without it, a name
    expect(speakerOf('anna', game.state, ART).face).toBe(art.npc('guild', 'normal'));
    stage('chat:liz:1', [{ who: 'bellkeeper', text: '叮' }, { who: 'narrator', text: '靜' }]);
    const p = playScene(talk, 'chat:liz:1', ctx);
    expect(talk.el.querySelector('img')).toBeNull();
    expect(nameOf(talk).textContent).toBe('鐘守');
    p.onAction('confirm');
    await tick();
    expect(nameOf(talk).hidden).toBe(true);
  });

  it('names a character from CHARACTERS', () => {
    const { game } = mk();
    expect(speakerOf('hero', game.state, ART).name).toBe(CHARACTERS.hero.name);
  });

  it('Rin speaks with the rin-oath face after her oath', () => {
    const { game } = mk();
    expect(speakerOf('rin', game.state, ART).face).toBe(art.portrait('rin', 'normal'));
    game.state.party.roster.rin.oath = true;
    expect(speakerOf('rin', game.state, ART).face).toBe(art.portrait('rin-oath', 'normal'));
    expect(speakerOf('rin', game.state, ART, 'smile').face).toBe(art.portrait('rin-oath', 'smile'));
  });

  it('a missing story face falls back to normal', () => {
    const { game } = mk();
    expect(speakerOf('noel', game.state, ART, 'smile').face).toBe(art.portrait('noel', 'normal'));
    expect(speakerOf('liz', game.state, { has: () => false }, 'smile').face).toBeUndefined();
  });

  it('a serious or sad line with no art for that face shows the name plate alone, never a smiling normal (final review, story depth)', () => {
    // A companion's normal portrait often smiles: borrowed for a grave line it says the opposite. Until the art pipeline
    // brings her serious and sad faces (user approval, plan leftovers), the line has no portrait at all.
    // Wave 1 (2026-10-23) brought most of them; the art index here leaves Noel's sad out to keep the rule in view.
    const { game } = mk();
    const noSad: ArtIndex = { has: (u) => ART.has(u) && u !== art.portrait('noel', 'sad') };
    for (const mood of ['serious', 'sad'] as const) {
      const said = speakerOf('noel', game.state, noSad, mood);
      expect(said.name, mood).toBe(CHARACTERS.noel.name);
      expect(said.face, mood).toBeUndefined();
      const withIt: ArtIndex = { has: (u) => noSad.has(u) || u === art.portrait('noel', mood) };
      expect(speakerOf('noel', game.state, withIt, mood).face, mood).toBe(art.portrait('noel', mood));
    }
    // The faces on disk still show: Lorne's and Rin's sad.
    expect(speakerOf('hero', game.state, ART, 'sad').face).toBe(art.portrait('hero', 'sad'));
    expect(speakerOf('noel', game.state, ART, 'normal').face).toBe(art.portrait('noel', 'normal'));
  });

  it('only a companion whose normal portrait smiles loses it on a grave line; Lorne and Rin keep theirs (re-review of the final fixes)', () => {
    const { game } = mk();
    // Rin's and Lorne's normal faces do not smile: a serious line keeps the portrait (「要出去，得先過我這裡」).
    expect(speakerOf('rin', game.state, ART, 'serious').face).toBe(art.portrait('rin', 'normal'));
    expect(speakerOf('hero', game.state, ART, 'serious').face).toBe(art.portrait('hero', 'normal'));
    expect(speakerOf('hero', game.state, ART, 'distant').face).toBe(art.portrait('hero', 'normal'));
    game.state.party.roster.rin.oath = true;
    expect(speakerOf('rin', game.state, ART, 'serious').face).toBe(art.portrait('rin-oath', 'normal'));
    // A companion's heavy faces count as grave too: Chizuru's solemn, Scarlet's vow and shaken, Selene's wistful. Without
    // their art (and their fallbacks') no portrait; wave 1 (2026-10-23) published them, so they show (storyFaces.test.ts).
    const bare: ArtIndex = { has: (u) => ART.has(u) && !/-portrait-(serious|sad|solemn|vow|shaken|wistful)\.png$/.test(u) };
    for (const [who, mood] of [['chizuru', 'solemn'], ['scarlet', 'vow'], ['scarlet', 'shaken'], ['selene', 'wistful'], ['sylvie', 'serious']] as const) {
      const said = speakerOf(who, game.state, bare, mood);
      expect(said.face, `${who} ${mood}`).toBeUndefined();
      expect(said.name).toBe(CHARACTERS[who].name);
      expect(speakerOf(who, game.state, ART, mood).face, `${who} ${mood}`).toBe(art.portrait(who, mood));
    }
    // A plain or light line keeps her smiling normal face.
    expect(speakerOf('chizuru', game.state, ART, 'normal').face).toBe(art.portrait('chizuru', 'normal'));
    expect(speakerOf('chizuru', game.state, ART, 'bewildered').face).toBe(art.portrait('chizuru', 'normal'));
    // The flag is data: every companion whose normal art smiles, and never Lorne or Rin.
    expect([...NORMAL_SMILES].sort()).toEqual(['bobby', 'chizuru', 'liz', 'noel', 'safira', 'scarlet', 'selene', 'sylvie']);
  });

  it('a face with no art yet shows normal; one with art shows itself', () => {
    // Spec §10.3: a new face never borrows another feeling; until its art is published it is the normal face.
    const { game } = mk();
    expect(speakerOf('selene', game.state, ART, 'blush').face).toBe(art.portrait('selene', 'normal'));
    expect(speakerOf('hero', game.state, ART, 'resolve').face).toBe(art.portrait('hero', 'normal'));
    const withBlush: ArtIndex = { has: (u) => ART.has(u) || u === art.portrait('selene', 'blush') };
    expect(speakerOf('selene', game.state, withBlush, 'blush').face).toBe(art.portrait('selene', 'blush'));
    // Rin after her oath wears the rin-oath set of the same faces.
    game.state.party.roster.rin.oath = true;
    const withAverted: ArtIndex = { has: (u) => ART.has(u) || u === art.portrait('rin-oath', 'averted') };
    expect(speakerOf('rin', game.state, withAverted, 'averted').face).toBe(art.portrait('rin-oath', 'averted'));
    expect(speakerOf('rin', game.state, ART, 'averted').face).toBe(art.portrait('rin-oath', 'normal'));
  });
});

describe('shouldPlay', () => {
  it('follows the mode', () => {
    for (const id of MAJOR_SCENES) {
      expect(shouldPlay(id, 'all')).toBe(true);
      expect(shouldPlay(id, 'major')).toBe(true);
      expect(shouldPlay(id, 'none')).toBe(false);
    }
    expect(shouldPlay('mem:hero:1', 'all')).toBe(true);
    expect(shouldPlay('mem:hero:1', 'major')).toBe(false);
    expect(shouldPlay('chat:liz:1', 'major')).toBe(false);
    expect(shouldPlay('town:anna', 'none')).toBe(false);
  });
});

describe('playAndRecord', () => {
  /** A game with `id` due on this arrival. */
  const due = (id: SceneId) => {
    const m = mk();
    m.game.arrival = [id];
    m.game.state.story.queue = [id];
    return m;
  };

  it('records a scene played to the end as played', async () => {
    const { game, talk, ctx } = due('chat:liz:1');
    stage('chat:liz:1', [{ who: 'liz', text: '一' }]);
    const p = playAndRecord(talk, 'chat:liz:1', ctx);
    expect(game.state.story.seen).not.toContain('chat:liz:1');   // not before it ends
    p.onAction('confirm');
    await p.done;
    expect(game.state.story).toMatchObject({ queue: [], fresh: [] });
    expect(game.state.story.seen).toContain('chat:liz:1');
    expect(game.arrival).toEqual([]);
  });

  it('hands the game the way it ended: played, skipped or auto', async () => {
    const calls = (mode: 'all' | 'none', cancel: boolean) => {
      const { game, talk, ctx } = due('chat:liz:1');
      const spy = vi.spyOn(game, 'sceneDone');
      stage('chat:liz:1', [{ who: 'liz', text: '一' }, { who: 'liz', text: '二' }]);
      const p = playAndRecord(talk, 'chat:liz:1', { ...ctx, mode });
      return { spy, p, talk, cancel };
    };
    const a = calls('all', false);
    a.p.onAction('confirm'); await tick(); a.p.onAction('confirm');
    await a.p.done;
    expect(a.spy.mock.calls).toEqual([['chat:liz:1', 'played']]);
    const b = calls('all', true);
    b.p.onAction('cancel'); await tick(); b.p.onAction('confirm');
    await b.p.done;
    expect(b.spy.mock.calls).toEqual([['chat:liz:1', 'skipped']]);
    const c = calls('none', false);
    await c.p.done;
    expect(c.spy.mock.calls).toEqual([['chat:liz:1', 'auto']]);
  });

  it('a scene that fails is still recorded, so the handbook can replay it', async () => {
    const { game, talk, ctx } = due('chat:liz:1');
    stage('chat:liz:1', [{ who: 'liz', text: '一' }]);
    vi.spyOn(talk, 'say').mockImplementation(() => { throw new Error('boom'); });
    await expect(playAndRecord(talk, 'chat:liz:1', ctx).done).rejects.toThrow('boom');   // callers still report it
    expect(game.state.story.seen).toContain('chat:liz:1');
    expect(game.state.story.fresh).toContain('chat:liz:1');
    expect(game.state.story.queue).toEqual([]);
    expect(game.arrival).toEqual([]);
  });

  it('records a skipped scene as seen but not new', async () => {
    const { game, talk, ctx } = due('chat:liz:1');
    stage('chat:liz:1', [{ who: 'liz', text: '一' }, { who: 'liz', text: '二' }]);
    const p = playAndRecord(talk, 'chat:liz:1', ctx);
    p.onAction('cancel');
    await tick();
    p.onAction('confirm');
    await p.done;
    expect(game.state.story.seen).toContain('chat:liz:1');
    expect(game.state.story.fresh).toEqual([]);
    expect(game.arrival).toEqual([]);
  });

  it('shows nothing and records auto when the story setting skips the scene', async () => {
    const { game, talk, ctx } = due('chat:liz:1');
    const p = playAndRecord(talk, 'chat:liz:1', { ...ctx, mode: 'none' });
    await p.done;
    expect(talk.busy()).toBe(false);
    expect(talk.el.querySelector('.slx-text')!.textContent).toBe('');
    expect(game.state.story.seen).toContain('chat:liz:1');
    expect(game.state.story.fresh).toContain('chat:liz:1');
    expect(game.arrival).toEqual([]);
    p.onAction('confirm');   // harmless with nothing playing
  });

  it('a major-only setting plays a major scene and skips a chat', async () => {
    const { game, talk, ctx } = due('chat:liz:1');
    game.arrival.push('act2');
    game.state.story.queue.push('act2');
    await playAndRecord(talk, 'chat:liz:1', { ...ctx, mode: 'major' }).done;
    expect(game.state.story.fresh).toEqual(['chat:liz:1']);
    const p = playAndRecord(talk, 'act2', { ...ctx, mode: 'major' });
    expect(talk.busy()).toBe(true);
    p.onAction('cancel');
    await tick();
    p.onAction('confirm');
    await p.done;
    expect(game.state.story.seen).toContain('act2');
    expect(game.state.story.fresh).toEqual(['chat:liz:1']);
  });

  it('does not record a scene that is not due', async () => {
    const { game, talk, ctx } = mk();
    await playAndRecord(talk, 'chat:liz:1', { ...ctx, mode: 'none' }).done;
    expect(game.state.story.seen).not.toContain('chat:liz:1');
  });
});
