import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { MAJOR_SCENES, type SceneId } from '../data/story/scenes';
import { chainLength } from '../data/story/chains';
import { NIGHT_PLACE, STORY, linesWhen, type ChoiceLine, type LineWhen, type SceneLine, type ScriptLine, flatLines } from '../data/story.zh-TW';
import { meet } from '../engine/party';
import { T } from '../data/text.zh-TW';
import { Game } from '../engine/game';
import { constRng, withTold } from '../engine/testing';
import { allArtUrls, art, NORMAL_SMILES } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { drawLanded } from './lateArt';
import { Dialogue } from './widgets';
import { linesOf, playAndRecord, playLines, playScene, sceneEra, shouldPlay, speakerOf, type StoryCtx } from './story';

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

  it('a scene whose run throws still leaves the dialogue clean: no hold, no veil, no card, box away (review 1)', async () => {
    const { talk, ctx } = mk();
    const screen = document.createElement('div');
    screen.append(talk.el);
    stage('mem:rin:1', [
      { who: 'narrator', past: true, text: '一', place: { text: '月影旅館・深夜', night: true } },
      { who: 'rin', text: '二' },
    ]);
    const real = talk.say.bind(talk);
    vi.spyOn(talk, 'say').mockImplementationOnce(real).mockImplementationOnce(() => { throw new Error('boom'); });
    const p = playScene(talk, 'mem:rin:1', ctx);
    expect(talk.el.classList.contains('slx-talk--memory')).toBe(true);
    p.onAction('confirm');
    await expect(p.done).rejects.toThrow('boom');
    expect(talk.el.classList.contains('slx-talk--memory')).toBe(false);
    expect(screen.querySelector('.slx-veil.slx-on')).toBeNull();
    expect(screen.querySelector('.slx-place-card')).toBeNull();
    expect(talk.el.hidden).toBe(true);
    // not held any more: a plain line closes the box again on confirm
    void real('', '三');
    talk.onAction('confirm');
    expect(talk.el.hidden).toBe(true);
  });

  it("a scene's first narration line shows no face left over from before the scene (review 2)", async () => {
    const { talk, ctx } = mk();
    void talk.say('', '地城的一句。', { src: '/left-over.png', side: 'left' });
    stage('chat:liz:1', [{ who: 'narrator', text: '一' }, { who: 'rin', text: '二' }, { who: 'narrator', text: '三' }]);
    const p = playScene(talk, 'chat:liz:1', ctx);
    expect(talk.el.querySelector('img')).toBeNull();
    p.onAction('confirm'); await tick();
    p.onAction('confirm'); await tick();
    expect(talk.el.querySelector('.slx-talk-face--dim')).not.toBeNull();   // once a face has shown in the scene, it is kept
    p.onAction('confirm');
    await p.done;
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

  it("a place given to playScene shows from the first line, and a line's own place replaces it (story L)", async () => {
    const { talk, ctx } = mk();
    const screen = document.createElement('div');
    screen.append(talk.el);
    const card = () => screen.querySelector('.slx-place-card')?.textContent ?? null;
    const night = () => !!screen.querySelector('.slx-veil-night.slx-on');
    stage('mem:liz:1', [
      { who: 'narrator', past: true, text: '一' },
      { who: 'liz', text: '二', place: { text: '道具店・傍晚' } },
    ]);
    const p = playScene(talk, 'mem:liz:1', ctx, { place: NIGHT_PLACE });
    expect([card(), night()]).toEqual(['月影旅館・夜', true]);
    p.onAction('confirm'); await tick();
    expect([card(), night()]).toEqual(['道具店・傍晚', false]);
    p.onAction('confirm');
    await p.done;
    expect([card(), night()]).toEqual([null, false]);
    // playAndRecord hands it on, and records the scene
    const { talk: t2, ctx: c2 } = mk();
    const s2 = document.createElement('div');
    s2.append(t2.el);
    stage('chat:liz:1', [{ who: 'narrator', text: '三' }]);
    c2.game.arrival = ['chat:liz:1'];
    const r = playAndRecord(t2, 'chat:liz:1', c2, { place: NIGHT_PLACE });
    expect(s2.querySelector('.slx-place-card')?.textContent).toBe('月影旅館・夜');
    r.onAction('confirm');
    await r.done;
    expect(c2.game.state.story.seen).toContain('chat:liz:1');
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
    for (let i = 0; i < flatLines(STORY.scenes['mem:hero:1'].lines).length; i++) {
      styles.push(talk.el.classList.contains('slx-talk--memory'));
      p.onAction('confirm');
      await tick();
    }
    await p.done;
    expect(styles).toEqual(flatLines(STORY.scenes['mem:hero:1'].lines).map((l) => !!l.past));
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
    expect(flatLines(linesOf('chat:liz:1', s)).map((l) => l.text)).toEqual(['甲', '乙']);
    s.party.recruited.push('bobby');
    s.story.returned = ['anna'];
    expect(flatLines(linesOf('chat:liz:1', s)).map((l) => l.text)).toEqual(['甲', '丙', '丁']);
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
    const texts = () => flatLines(linesOf('chat:liz:1', s)).map((l) => l.text);
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

  it("linesOf reads a companion's full from the pieces told (story L Task 1)", () => {
    const { game } = mk();
    // story L Task 12: chat:sylvie:2 now waits for her told whole and reads one way; Chizuru's bell still reads both ways
    const len = chainLength('chizuru');
    const s = withTold(game.state, 'chizuru', len - 1);
    s.party.roster.chizuru.memories = len;   // all held, one untold
    const notFull = flatLines(STORY.scenes['chat:chizuru:2'].lines).filter((l) => l.if?.notFull === 'chizuru').map((l) => l.text);
    const full = flatLines(STORY.scenes['chat:chizuru:2'].lines).filter((l) => l.if?.full === 'chizuru').map((l) => l.text);
    expect(notFull.length).toBeGreaterThan(0);
    const texts = flatLines(linesOf('chat:chizuru:2', s)).map((l) => l.text);
    for (const t of notFull) expect(texts).toContain(t);
    for (const t of full) expect(texts).not.toContain(t);
    const told = withTold(s, 'chizuru', len);
    const after = flatLines(linesOf('chat:chizuru:2', told)).map((l) => l.text);
    for (const t of full) expect(after).toContain(t);
    for (const t of notFull) expect(after).not.toContain(t);
  });

  it('a scene line waits on a scene the save has seen (story depth Task 1)', async () => {
    const { game, talk, ctx } = mk();
    stage('chat:liz:1', [
      { who: 'rin', text: '看過', if: { seen: 'banter:rin-sylvie:1' } },
      { who: 'rin', text: '沒看過', if: { notSeen: 'banter:rin-sylvie:1' } },
    ]);
    const s = game.state;
    expect(s.story.seen).not.toContain('banter:rin-sylvie:1');
    expect(flatLines(linesOf('chat:liz:1', s)).map((l) => l.text)).toEqual(['沒看過']);
    s.story.seen.push('banter:rin-sylvie:1');
    expect(flatLines(linesOf('chat:liz:1', s)).map((l) => l.text)).toEqual(['看過']);
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
    // Rin's and Lorne's normal faces do not smile: a serious line keeps the portrait (「要出去，得先過我這裡」). Face wave 2
    // (2026-10-24) gave them their own grave faces; without those, a light line falls back to the normal as before.
    const noWave2: ArtIndex = { has: (u) => ART.has(u) && !/(hero|rin|rin-oath)-portrait-(serious|distant|guarded)\.png$/.test(u) };
    expect(speakerOf('rin', game.state, noWave2, 'serious').face).toBe(art.portrait('rin', 'normal'));
    expect(speakerOf('hero', game.state, noWave2, 'serious').face).toBe(art.portrait('hero', 'normal'));
    expect(speakerOf('hero', game.state, noWave2, 'distant').face).toBe(art.portrait('hero', 'normal'));
    expect(speakerOf('rin', game.state, ART, 'serious').face).toBe(art.portrait('rin', 'serious'));
    expect(speakerOf('hero', game.state, ART, 'serious').face).toBe(art.portrait('hero', 'serious'));
    expect(speakerOf('hero', game.state, ART, 'distant').face).toBe(art.portrait('hero', 'distant'));
    game.state.party.roster.rin.oath = true;
    expect(speakerOf('rin', game.state, noWave2, 'serious').face).toBe(art.portrait('rin-oath', 'normal'));
    expect(speakerOf('rin', game.state, ART, 'serious').face).toBe(art.portrait('rin-oath', 'serious'));
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
    // (Faces wave 4 published Selene's blush and Rin's averted, so the unpublished faces here are her foresee and Rin's surprised.)
    expect(speakerOf('selene', game.state, ART, 'foresee').face).toBe(art.portrait('selene', 'normal'));
    expect(speakerOf('hero', game.state, ART, 'resolve').face).toBe(art.portrait('hero', 'normal'));
    const withForesee: ArtIndex = { has: (u) => ART.has(u) || u === art.portrait('selene', 'foresee') };
    expect(speakerOf('selene', game.state, withForesee, 'foresee').face).toBe(art.portrait('selene', 'foresee'));
    expect(speakerOf('selene', game.state, ART, 'blush').face).toBe(art.portrait('selene', 'blush'));
    // Rin after her oath wears the rin-oath set of the same faces.
    game.state.party.roster.rin.oath = true;
    const withSurprised: ArtIndex = { has: (u) => ART.has(u) || u === art.portrait('rin-oath', 'surprised') };
    expect(speakerOf('rin', game.state, withSurprised, 'surprised').face).toBe(art.portrait('rin-oath', 'surprised'));
    expect(speakerOf('rin', game.state, ART, 'surprised').face).toBe(art.portrait('rin-oath', 'normal'));
    expect(speakerOf('rin', game.state, ART, 'averted').face).toBe(art.portrait('rin-oath', 'averted'));
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

  it('a group scene plays under major only (story L Task 5, spec §5.1)', () => {
    for (const id of ['group:act2', 'group:act3', 'group:act4'] as SceneId[]) {
      expect(shouldPlay(id, 'all'), id).toBe(true);
      expect(shouldPlay(id, 'major'), id).toBe(true);
      expect(shouldPlay(id, 'none'), id).toBe(false);
    }
    expect(shouldPlay('mem:selene:1', 'major')).toBe(false);
    expect(shouldPlay('banter:noel-rin:1', 'major')).toBe(false);
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

describe('Rin\'s era in a scene (handbook replays)', () => {
  const faceOf = (talk: Dialogue) => talk.el.querySelector('.slx-talk-face')?.getAttribute('src');

  it('each scene that only ever plays on one side of her choice belongs to that side; any other has no era of its own', () => {
    for (let k = 1; k <= chainLength('rin'); k++) expect(sceneEra(`mem:rin:${k}` as SceneId), `mem:rin:${k}`).toBe('before');
    expect(sceneEra('rin-reveal')).toBe('before');
    expect(sceneEra('banter:rin-sylvie:1')).toBe('before');   // beforeChoice
    expect(sceneEra('group:act3')).toBe('before');            // beforeChoice
    for (const id of ['rin-confess', 'bellkeeper-arrives', 'finale', 'finale-eve', 'hero-alone', 'epilogue', 'chat:rin:4', 'banter:noel-rin:2'] as SceneId[]) {
      expect(sceneEra(id), id).toBe('after');
    }
    for (const id of ['chat:liz:1', 'mem:scarlet:1', 'chat:rin:3', 'act3'] as SceneId[]) expect(sceneEra(id), id).toBeNull();
    // review 5: the bond's gates too. Rin's first two expire at her choice, her last two wait on it; the after-stories, the
    // romances and the walk together come after the finale; another companion's bond scene plays on either side.
    expect(sceneEra('bond:rin:1')).toBe('before');
    expect(sceneEra('bond:rin:2')).toBe('before');
    for (const id of ['bond:rin:3', 'bond:rin:4', 'ending:rin', 'romance:rin', 'ending:liz', 'romance:noel', 'together'] as SceneId[]) expect(sceneEra(id), id).toBe('after');
    for (const id of ['bond:selene:1', 'bond:liz:4'] as SceneId[]) expect(sceneEra(id), id).toBeNull();
  });

  it('a memory of hers replayed after her oath shows the faces she had then, not her rin-oath ones', async () => {
    const { game, talk, ctx } = mk();
    game.state.party.roster.rin.oath = true;
    stage('mem:rin:4', [{ who: 'rin', mood: 'averted', text: '一' }, { who: 'rin', text: '二' }]);
    const p = playScene(talk, 'mem:rin:4', ctx);
    // Her guilty averted look of before the oath, never the shy one of after it.
    expect(faceOf(talk)).toBe(art.portrait('rin', 'averted'));
    p.onAction('confirm');
    await tick();
    expect(faceOf(talk)).toBe(art.portrait('rin', 'normal'));
    // The game itself is left as it is: the replay only borrows the look.
    expect(game.state.party.roster.rin.oath).toBe(true);
    expect(speakerOf('rin', game.state, ART, 'averted').face).toBe(art.portrait('rin-oath', 'averted'));
  });

  it('a memory of hers played live (before her oath) shows the same faces', () => {
    const { game, talk, ctx } = mk();
    expect(game.state.party.roster.rin.oath).toBeUndefined();
    stage('mem:rin:5', [{ who: 'rin', mood: 'averted', text: '一' }]);
    playScene(talk, 'mem:rin:5', ctx);
    expect(faceOf(talk)).toBe(art.portrait('rin', 'averted'));
  });

  it('a scene after her choice shows her rin-oath faces, and a scene with no era of its own follows the game', () => {
    const { game, talk, ctx } = mk();
    game.state.party.roster.rin.oath = true;
    stage('rin-confess', [{ who: 'rin', mood: 'averted', text: '一' }]);
    playScene(talk, 'rin-confess', ctx);
    expect(faceOf(talk)).toBe(art.portrait('rin-oath', 'averted'));
    const t2 = new Dialogue(Infinity);
    stage('chat:liz:1', [{ who: 'rin', mood: 'averted', text: '一' }]);
    playScene(t2, 'chat:liz:1', ctx);
    expect(faceOf(t2)).toBe(art.portrait('rin-oath', 'averted'));
    delete game.state.party.roster.rin.oath;
    const t3 = new Dialogue(Infinity);
    playScene(t3, 'chat:liz:1', ctx);
    expect(faceOf(t3)).toBe(art.portrait('rin', 'averted'));
  });
});

describe('a face that lands while its line is up (ui2/lateArt)', () => {
  it('a line said before its face landed shows the face when it lands; the next line no longer waits for it', async () => {
    const landed = new Set<string>();
    const { game, talk } = mk();
    const ctx: StoryCtx = { game, art: { has: (u) => landed.has(u) }, mode: 'all' };
    const root = document.createElement('div');
    root.append(talk.el);
    stage('chat:liz:1', [{ who: 'liz', mood: 'smile', text: '一' }, { who: 'narrator', text: '二' }, { who: 'hero', text: '三' }]);
    const p = playScene(talk, 'chat:liz:1', ctx);
    const face = () => talk.el.querySelector('.slx-talk-face')?.getAttribute('src');
    expect(face()).toBeUndefined();
    landed.add(art.portrait('liz', 'normal'));
    drawLanded(root, new Set([art.portrait('liz', 'normal')]));
    expect(face()).toBe(art.portrait('liz', 'normal'));
    expect(talk.el.querySelector('.slx-talk-face--left')).not.toBeNull();
    // Her own smile lands later still: the better face takes its place.
    landed.add(art.portrait('liz', 'smile'));
    drawLanded(root, new Set([art.portrait('liz', 'smile')]));
    expect(face()).toBe(art.portrait('liz', 'smile'));
    p.onAction('confirm');
    await tick();
    p.onAction('confirm');
    await tick();
    expect(talk.el.querySelector('.slx-text')!.textContent).toBe('三');
    expect(face()).toBeUndefined();   // Lorne's face is not here
    landed.add(art.portrait('liz', 'sad'));
    drawLanded(root, new Set([art.portrait('liz', 'sad'), art.portrait('liz', 'normal')]));
    expect(face()).toBeUndefined();   // her old wait is gone with her line
  });
});

describe('the bond script format (bond plan Task 7)', () => {
  /** A scene put in for the test, taken out after (it may be an id no written scene has). */
  const put = (id: SceneId, lines: SceneLine[]) => {
    const had = Object.prototype.hasOwnProperty.call(STORY.scenes, id) ? STORY.scenes[id] : undefined;
    STORY.scenes[id] = { title: 't', lines, summary: '概要' };
    return () => { if (had) STORY.scenes[id] = had; else delete (STORY.scenes as Partial<typeof STORY.scenes>)[id]; };
  };
  const text = (l: SceneLine) => ('text' in l ? l.text : 'choice');
  const choice: ChoiceLine = {
    who: 'hero', choices: [
      { tone: 'ask', text: '「後來呢？」', reply: [{ who: 'selene', text: '四' }] },
      { tone: 'stay', text: '（在她旁邊坐下。）', reply: [{ who: 'selene', text: '五' }] },
    ],
  };

  it('tier conditions pick the right lines', () => {
    const { game } = mk();
    game.state.party = meet(game.state.party, 'selene', 1);
    const back = put('bond:selene:1', [
      { who: 'selene', text: '一' },
      { who: 'selene', text: '二', if: { tier: { who: 'selene', min: 2 } } },
      { who: 'narrator', text: '三', if: { tier: { who: 'selene', min: 1 } } },
    ]);
    try {
      expect(linesOf('bond:selene:1', game.state).map(text)).toEqual(['一']);   // 10 points: 相識
      game.state.party.roster.selene.bond = { talk: 10, field: 0, gifts: {} };   // 20: 同行
      expect(linesOf('bond:selene:1', game.state).map(text)).toEqual(['一', '三']);
      game.state.party.roster.selene.bond = { talk: 10, field: 20, gifts: {} };   // 40: 信賴
      expect(linesOf('bond:selene:1', game.state).map(text)).toEqual(['一', '二', '三']);
      // no tiers given reads every one as 0
      const w: LineWhen = { met: ['selene'], full: [], returned: [], oath: false };
      expect(linesWhen(STORY.scenes['bond:selene:1'].lines, w).map(text)).toEqual(['一']);
      expect(linesWhen(STORY.scenes['bond:selene:1'].lines, { ...w, tiers: { selene: 4 } }).map(text)).toEqual(['一', '二', '三']);
    } finally { back(); }
  });

  it('a choice line always stays', () => {
    const { game } = mk();
    const back = put('bond:selene:2', [{ who: 'sylvie', text: '一', if: { met: 'sylvie' } }, choice, { who: 'narrator', text: '二' }]);
    try {
      const w: LineWhen = { met: [], full: [], returned: [], oath: false };
      expect(linesWhen(STORY.scenes['bond:selene:2'].lines, w)).toEqual([choice, { who: 'narrator', text: '二' }]);
      expect(linesOf('bond:selene:2', game.state)[0]).toBe(choice);
      // Task 9 plays it (a choice on screen: see 'a choice on screen' below)
      const { talk, ctx } = mk();
      expect(() => playScene(talk, 'bond:selene:2', ctx)).not.toThrow();
    } finally { back(); }
  });
});

describe('a choice on screen (bond plan Task 9)', () => {
  const put = (id: SceneId, lines: SceneLine[]) => {
    const had = Object.prototype.hasOwnProperty.call(STORY.scenes, id) ? STORY.scenes[id] : undefined;
    STORY.scenes[id] = { title: 't', lines, summary: '她說了一件事。' };
    return () => { if (had) STORY.scenes[id] = had; else delete (STORY.scenes as Partial<typeof STORY.scenes>)[id]; };
  };
  const choice: ChoiceLine = {
    who: 'hero', choices: [
      { tone: 'ask', text: '「後來呢？」', reply: [{ who: 'rin', text: '問的回應' }] },
      { tone: 'stay', text: '（在她旁邊坐下。）', reply: [{ who: 'rin', text: '陪的回應' }] },
      { tone: 'promise', text: '「下次再說。」', reply: [{ who: 'rin', text: '約的回應' }] },
    ],
  };
  const scene: SceneLine[] = [{ who: 'rin', text: '開場' }, choice, { who: 'narrator', text: '結尾' }];
  const mount = (talk: Dialogue) => { const root = document.createElement('div'); root.append(talk.el); document.body.append(root); return root; };
  const opts = (root: HTMLElement) => [...root.querySelectorAll('.slx-choice .slx-opt')].map((o) => o.textContent);

  it('a choice plays its reply', async () => {
    const back = put('bond:rin:1', scene);
    try {
      const { talk, ctx } = mk();
      const root = mount(talk);
      const p = playScene(talk, 'bond:rin:1', ctx);
      expect(shown(talk)).toBe('開場');
      p.onAction('confirm');
      await tick();
      expect(nameOf(talk).textContent).toBe(CHARACTERS.hero.name);   // Lorne's plate while he chooses
      expect(opts(root)).toEqual(['「後來呢？」', '（在她旁邊坐下。）', '「下次再說。」']);
      p.onAction('down');
      p.onAction('confirm');
      await tick();
      expect(root.querySelector('.slx-choice')).toBeNull();
      expect(shown(talk)).toBe('陪的回應');
      p.onAction('confirm');
      await tick();
      expect(shown(talk)).toBe('結尾');
      p.onAction('confirm');
      expect(await p.done).toBe('done');
      expect(p.chosen()).toBe('stay');
      root.remove();
    } finally { back(); }
  });

  it("the choice stands on the side away from Lorne's portrait (review of Tasks 12-14)", async () => {
    for (const [lines, side] of [[scene, 'left'], [[{ who: 'hero', text: '我先說' }, choice], 'right']] as const) {
      const back = put('bond:rin:1', lines as SceneLine[]);
      try {
        const { talk, ctx } = mk();
        const root = mount(talk);
        const p = playScene(talk, 'bond:rin:1', ctx);
        p.onAction('confirm');
        await tick();
        // Lorne's face is on the right when another spoke first, on the left when he did: the choice takes the other side
        expect(root.querySelector('.slx-choice')!.classList.contains(`slx-choice--${side}`)).toBe(true);
        expect(root.querySelector('.slx-choice')!.classList.contains(`slx-choice--${side === 'left' ? 'right' : 'left'}`)).toBe(false);
        p.onAction('cancel');
        root.remove();
      } finally { back(); }
    }
  });

  it('cancel on the choice skips the scene and shows the summary', async () => {
    const back = put('bond:rin:1', scene);
    try {
      const { talk, ctx } = mk();
      const root = mount(talk);
      const p = playScene(talk, 'bond:rin:1', ctx);
      p.onAction('confirm');
      await tick();
      p.onAction('cancel');
      await tick();
      expect(root.querySelector('.slx-choice')).toBeNull();
      expect(shown(talk)).toBe(T.ui2.story.skipped('她說了一件事。'));
      p.onAction('confirm');
      expect(await p.done).toBe('skipped');
      expect(p.chosen()).toBeNull();
      root.remove();
    } finally { back(); }
  });

  it('a bond scene records the choice before it is done', async () => {
    const back = put('bond:rin:1', scene);
    try {
      const { talk, ctx } = mk();
      const calls: string[] = [];
      const game = ctx.game;
      game.bondChoice = (id, tone) => { calls.push(`choice ${id} ${tone}`); return true; };
      game.sceneDone = (id, how) => { calls.push(`done ${id} ${how}`); return true; };
      const root = mount(talk);
      const p = playAndRecord(talk, 'bond:rin:1', ctx);
      p.onAction('confirm'); await tick();
      p.onAction('confirm'); await tick();   // the first choice
      p.onAction('confirm'); await tick();
      p.onAction('confirm');
      await p.done;
      expect(calls).toEqual(['choice bond:rin:1 ask', 'done bond:rin:1 played']);
      // not shown (the story setting): recorded as skipped, choice null
      calls.length = 0;
      const auto = playAndRecord(talk, 'bond:rin:1', { ...ctx, mode: 'none' });
      await auto.done;
      expect(calls).toEqual(['choice bond:rin:1 null', 'done bond:rin:1 auto']);
      root.remove();
    } finally { back(); }
  });
});
