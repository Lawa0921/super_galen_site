import { CHARACTERS } from '../data/characters';
import type { Meetable } from '../data/meetings';
import { STORY, introIndex, type ScriptLine } from '../data/story.zh-TW';
import { T } from '../data/text.zh-TW';
import type { UiAction } from './input';
import { playLines, type StoryCtx } from './story';
import type { Dialogue } from './widgets';

/**
 * The plate over a line of a meeting (story polish ruling 2; lore ledger I-161): her own lines read 「？？？」 before the
 * fight, and after it until the line where she first says her name (`introIndex`). Everyone else keeps their own plate
 * (`undefined`: the caller's usual one).
 */
export function meetingPlate(id: Meetable, part: 'before' | 'after', i: number, line: ScriptLine): string | undefined {
  if (line.who !== id) return undefined;
  if (part === 'before' || i < introIndex(id)) return T.ui2.rescue.stranger;
  return undefined;
}

/**
 * The rescue after its won fight (story polish Task 1, ruling 1): her after-lines in the dialogue box, plates as
 * `meetingPlate` says, then the narrator's join line (or the bench line). Cancel during her words goes straight to the join
 * line; on the join line cancel reads as confirm. Joining is a change of state, so the join line always plays, and so do
 * her words, whatever the story setting (as her before-lines in the dungeon). `done` settles once the join line is read.
 */
export function playRescue(talk: Dialogue, met: { id: Meetable; level: number; benched: boolean }, ctx: StoryCtx): { done: Promise<void>; onAction(a: UiAction): void } {
  talk.setStyle('plain');
  const words = playLines(talk, STORY.meet[met.id].after, ctx, (line, i) => meetingPlate(met.id, 'after', i, line));
  let joining = false;
  let over = false;
  const run = async (): Promise<void> => {
    await words.done;
    joining = true;
    await talk.say('', (met.benched ? T.ui2.rescue.benched : T.ui2.rescue.joined)(CHARACTERS[met.id].name, met.level));
    over = true;
  };
  return {
    done: run(),
    onAction(a) {
      if (over) return;
      if (!joining) { words.onAction(a); return; }
      if (a === 'confirm' || a === 'cancel') talk.onAction('confirm');
    },
  };
}
