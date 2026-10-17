import { afterEach, describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { MAJOR_SCENES, type SceneId } from '../data/story/scenes';
import { STORY, type ScriptLine } from '../data/story.zh-TW';
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
});

describe('speakerOf', () => {
  it('a speaker without art shows only a name', async () => {
    const { game, talk, ctx } = mk();
    expect(speakerOf('bellkeeper', game.state, ART)).toEqual({ name: '鐘守' });
    expect(speakerOf('merchant', game.state, ART)).toEqual({ name: '流浪商人' });
    expect(speakerOf('narrator', game.state, ART)).toEqual({ name: '' });
    expect(speakerOf('doran', game.state, ART).face).toBeUndefined();           // no published forge portrait
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
