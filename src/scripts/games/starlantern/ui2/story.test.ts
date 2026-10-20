import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { MAJOR_SCENES, type SceneId } from '../data/story/scenes';
import { chainLength } from '../data/story/chains';
import { STORY, linesWhen, type LineWhen, type ScriptLine } from '../data/story.zh-TW';
import { T } from '../data/text.zh-TW';
import { Game } from '../engine/game';
import { constRng } from '../engine/testing';
import { allArtUrls, art } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { Dialogue } from './widgets';
import { linesOf, playAndRecord, playScene, shouldPlay, speakerOf, type StoryCtx } from './story';

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
    expect(talk.el.querySelector('img')).toBeNull();
    p.onAction('confirm');
    await expect(p.done).resolves.toBe('done');
    expect(talk.busy()).toBe(false);
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

  it('memory scenes use the memory style and give it back', async () => {
    const { talk, ctx } = mk();
    const p = playScene(talk, 'mem:hero:1', ctx);
    expect(talk.el.classList.contains('slx-talk--memory')).toBe(true);
    for (let i = 0; i < STORY.scenes['mem:hero:1'].lines.length; i++) { p.onAction('confirm'); await tick(); }
    await p.done;
    expect(talk.el.classList.contains('slx-talk--memory')).toBe(false);
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
    expect(speakerOf('noel', game.state, ART, 'sad').face).toBe(art.portrait('noel', 'down'));
    const bare: ArtIndex = { has: (u) => u === art.portrait('noel', 'normal') };
    expect(speakerOf('noel', game.state, bare, 'sad').face).toBe(art.portrait('noel', 'normal'));
    expect(speakerOf('liz', game.state, { has: () => false }, 'smile').face).toBeUndefined();
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
