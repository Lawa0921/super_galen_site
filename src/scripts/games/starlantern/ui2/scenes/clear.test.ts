import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { T } from '../../data/text.zh-TW';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { ClearScene } from './clear';
import { NIGHT_BEATS, STORY } from '../../data/story.zh-TW';
import { meet } from '../../engine/party';
import { linesOf } from '../story';
import type { SceneId } from '../../data/story/scenes';
import { DEFAULT_SETTINGS, type StoryMode } from '../settings';

describe('ClearScene', () => {
  it('celebrates the clear and returns to town', () => {
    const game = new Game(constRng(0.5), null);
    game.phase = 'clear';
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new ClearScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() });
    s.enter(root);
    expect(root.textContent).toContain(STORY.act1Card.title);
    s.onAction('confirm');
    expect(game.phase).toBe('town');
    expect(go).toHaveBeenCalledWith('town');
  });
  it("the clear card is Act 1's", () => {
    const game = new Game(constRng(0.5), null);
    game.phase = 'clear';
    const root = document.createElement('div');
    new ClearScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }).enter(root);
    expect(root.querySelector('h2')!.textContent).toBe(STORY.act1Card.title);
    expect(STORY.act1Card.title).toBe('第一幕　星燈重新亮起');
    const opts = [...root.querySelectorAll('.slx-opt')].map((o) => o.textContent);
    expect(opts).toEqual(['繼續']);
    expect(T.clear.back).toBe('繼續');
  });
});

describe('ClearScene finale', () => {
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const PIECES: SceneId[] = ['mem:hero:9', 'mem:hero:10'];
  const make = (story: StoryMode) => {
    const game = new Game(constRng(0.5), null);
    game.phase = 'clear';
    game.cleared = 'finale';
    game.finale = { pieces: [...PIECES] };
    const done: string[] = [];
    const orig = game.sceneDone.bind(game);
    vi.spyOn(game, 'sceneDone').mockImplementation((id, how) => { done.push(`${id}:${how}`); return orig(id, how); });
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new ClearScene({
      game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(),
      settings: { get: () => ({ ...DEFAULT_SETTINGS, textSpeed: 'instant', story }) },
    });
    s.enter(root);
    const card = () => root.querySelector('.slx-clear-card');
    return { game, done, go, root, s, card };
  };

  it("the finale plays the hero's last memories, then the finale, then the ending card", async () => {
    const { game, done, go, root, s, card } = make('all');
    await flush();
    expect(card()).toBeNull();
    const styles: boolean[] = [];
    for (let i = 0; i < 80 && !card(); i++) {
      if (done.length < 3) expect(card()).toBeNull();
      styles.push(root.querySelector('.slx-talk--memory') !== null);
      s.onAction('confirm');
      await flush();
    }
    expect(done).toEqual(['mem:hero:9:played', 'mem:hero:10:played', 'finale:played']);
    expect(styles[0]).toBe(true);                 // the memories are dimmed
    expect(styles[styles.length - 1]).toBe(false);   // the finale itself is not
    expect(root.querySelector('.slx-clear-card h2')!.textContent).toBe(STORY.endingTitle);
    expect(root.querySelector('.slx-clear-card p')!.textContent).toBe(STORY.scenes.finale.summary);
    expect([...root.querySelectorAll('.slx-opt')].map((o) => o.textContent)).toEqual([T.ending.back]);
    s.onAction('confirm');
    expect(game.phase).toBe('town');
    expect(go).toHaveBeenCalledWith('town');
    expect(game.state.story.seen).toEqual(expect.arrayContaining(['mem:hero:9', 'mem:hero:10', 'finale']));
  });

  it('skipping each one still reaches the card', async () => {
    const { done, card, s } = make('all');
    await flush();
    for (let i = 0; i < 40 && !card(); i++) {
      s.onAction('cancel');   // the summary instead of the lines
      await flush();
      s.onAction('confirm');
      await flush();
    }
    expect(done).toEqual(['mem:hero:9:skipped', 'mem:hero:10:skipped', 'finale:skipped']);
    expect(card()).not.toBeNull();
  });

  it('with story none the finale shows only the card and records every scene new', async () => {
    const { game, done, card, root } = make('none');
    await flush();
    expect(card()).not.toBeNull();
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);
    expect(done).toEqual(['mem:hero:9:auto', 'mem:hero:10:auto', 'finale:auto']);
    expect(game.state.story.fresh).toEqual(expect.arrayContaining(['mem:hero:9', 'mem:hero:10', 'finale']));
  });

  it('the first act keeps its own card', async () => {
    const game = new Game(constRng(0.5), null);
    game.phase = 'clear';
    game.cleared = 'act1';
    const root = document.createElement('div');
    new ClearScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }).enter(root);
    expect(root.querySelector('.slx-clear-card h2')!.textContent).toBe(STORY.act1Card.title);
  });

  it('a scene that fails to record does not lock the ending', async () => {
    const { game, card, s } = make('all');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(game, 'sceneDone').mockImplementation(() => { throw new Error('boom'); });
    await flush();
    for (let i = 0; i < 80 && !card(); i++) { s.onAction('confirm'); await flush(); }
    expect(card()).not.toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("ClearScene: the eve as the finale's fallback (story L Task 3d)", () => {
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  it('the fallback eve has a beat between two memories', async () => {
    NIGHT_BEATS.lines.push({ who: 'narrator', text: '樓下的貓叫了一聲。' });
    try {
      const game = new Game(constRng(0.5), null);
      for (const c of ['selene', 'noel'] as const) {
        game.state.party = meet(game.state.party, c, 1);
        game.state.party.roster[c].memories = 1;
      }
      game.state.story.untold = ['mem:selene:1', 'mem:noel:1'];
      game.phase = 'clear';
      game.cleared = 'finale';
      game.finale = { pieces: ['finale-eve', 'mem:selene:1', 'mem:noel:1', 'mem:hero:10'] };
      game.eve = ['mem:selene:1', 'mem:noel:1'];
      const root = document.createElement('div');
      const s = new ClearScene({
        game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(),
        settings: { get: () => ({ ...DEFAULT_SETTINGS, textSpeed: 'instant', story: 'all' }) },
      });
      s.enter(root);
      const text = () => root.querySelector('.slx-talk .slx-text')?.textContent;
      const card = () => root.querySelector('.slx-place-card')?.textContent ?? null;
      const said: { text: string | null | undefined; card: string | null }[] = [];
      for (let i = 0; i < 60 && !root.querySelector('.slx-clear-card'); i++) { said.push({ text: text(), card: card() }); s.onAction('confirm'); await tick(); }
      expect(root.querySelector('.slx-clear-card')).not.toBeNull();
      const selene = linesOf('mem:selene:1', game.state).map((l) => l.text);
      const noel = linesOf('mem:noel:1', game.state).map((l) => l.text);
      const texts = said.map((x) => x.text);
      expect(texts.slice(0, 2 + selene.length + noel.length)).toEqual([STORY.scenes['finale-eve'].lines[0].text, ...selene, '樓下的貓叫了一聲。', ...noel]);
      expect(said.slice(0, 2 + selene.length + noel.length).every((x) => x.card === '月影旅館・夜')).toBe(true);
      // no beat between the eve's last memory and Lorne's piece
      expect(texts[2 + selene.length + noel.length]).toBe(linesOf('mem:hero:10', game.state)[0].text);
      expect(texts.filter((t) => t === '樓下的貓叫了一聲。')).toHaveLength(1);
    } finally {
      NIGHT_BEATS.lines.splice(0);
    }
  });
});
