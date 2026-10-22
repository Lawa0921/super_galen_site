import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { MEETINGS } from '../data/meetings';
import { STORY, introIndex } from '../data/story.zh-TW';
import { T } from '../data/text.zh-TW';
import { Game } from '../engine/game';
import { constRng } from '../engine/testing';
import { NO_ART } from '../render/textures';
import { meetingPlate, playRescue } from './rescue';
import type { StoryCtx } from './story';
import { Dialogue } from './widgets';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('meetingPlate (story polish Task 1)', () => {
  it('meetingPlate hides her name until she says it', () => {
    for (const { id } of MEETINGS) {
      const { before, after } = STORY.meet[id];
      const intro = introIndex(id);
      expect(intro, id).toBeGreaterThanOrEqual(0);
      before.forEach((line, i) => {
        const want = line.who === id ? T.ui2.rescue.stranger : undefined;
        expect(meetingPlate(id, 'before', i, line), `${id} before ${i}`).toBe(want);
      });
      after.forEach((line, i) => {
        const want = line.who === id && i < intro ? T.ui2.rescue.stranger : undefined;
        expect(meetingPlate(id, 'after', i, line), `${id} after ${i}`).toBe(want);
      });
    }
    // The cases one by one, on lines made for the test.
    expect(T.ui2.rescue.stranger).toBe('？？？');
    const hers = { who: 'chizuru' as const, text: '「封印。」' };
    expect(meetingPlate('chizuru', 'before', 1, hers)).toBe('？？？');
    expect(meetingPlate('chizuru', 'before', 2, { who: 'rin', text: '「冰在說話。」' })).toBeUndefined();
    expect(meetingPlate('chizuru', 'before', 0, { who: 'narrator', text: '冰。' })).toBeUndefined();
    const at = introIndex('chizuru');
    expect(at).toBeGreaterThan(0);
    expect(meetingPlate('chizuru', 'after', at - 1, hers)).toBe('？？？');
    expect(meetingPlate('chizuru', 'after', at, hers)).toBeUndefined();
    expect(meetingPlate('chizuru', 'after', at + 1, hers)).toBeUndefined();
    expect(meetingPlate('chizuru', 'after', 0, { who: 'narrator', text: '冰碎了。' })).toBeUndefined();
  });
});

describe('playRescue (story polish Task 1)', () => {
  const mk = () => {
    const game = new Game(constRng(0.5), null);
    const talk = new Dialogue(Infinity);
    const ctx: StoryCtx = { game, art: NO_ART, mode: 'none' };
    return { talk, ctx };
  };
  const shown = (talk: Dialogue) => talk.el.querySelector('.slx-text')!.textContent;

  it('her after-lines, then the join line; done only once the join line is read, whatever the story setting', async () => {
    for (const benched of [false, true]) {
      const { talk, ctx } = mk();
      const p = playRescue(talk, { id: 'selene', level: 4, benched }, ctx);
      let over = false;
      void p.done.then(() => { over = true; });
      const seen: string[] = [];
      for (let i = 0; i < 10 && !over; i++) { seen.push(shown(talk) ?? ''); p.onAction('confirm'); await tick(); }
      const join = (benched ? T.ui2.rescue.benched : T.ui2.rescue.joined)(CHARACTERS.selene.name, 4);
      expect(seen).toEqual([...STORY.meet.selene.after.map((l) => l.text), join]);
      expect(over).toBe(true);
    }
  });

  it('cancel on her words goes to the join line; cancel on the join line ends it as confirm does', async () => {
    const { talk, ctx } = mk();
    const p = playRescue(talk, { id: 'selene', level: 4, benched: false }, ctx);
    let over = false;
    void p.done.then(() => { over = true; });
    p.onAction('cancel');
    await tick();
    expect(shown(talk)).toBe(T.ui2.rescue.joined(CHARACTERS.selene.name, 4));
    expect(over).toBe(false);
    p.onAction('cancel');
    await tick();
    expect(over).toBe(true);
    expect(talk.busy()).toBe(false);
  });
});
