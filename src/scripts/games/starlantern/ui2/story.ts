import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { chainLength } from '../data/story/chains';
import { MAJOR_SCENES, sceneKind, type SceneId } from '../data/story/scenes';
import { NPC_NAMES, STORY, linesWhen, type NpcId, type ScriptLine, type Speaker } from '../data/story.zh-TW';
import { T } from '../data/text.zh-TW';
import type { Game } from '../engine/game';
import { memoriesOf } from '../engine/progression';
import type { GameState } from '../engine/state';
import type { CharacterId } from '../engine/types';
import { art, type StoryMood } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { artIdOf } from '../ui/art';
import type { UiAction } from './input';
import type { SceneCtx } from './scene';
import { DEFAULT_SETTINGS, type StoryMode } from './settings';
import type { Dialogue } from './widgets';

export type { StoryMode } from './settings';

/** What the story player needs from a scene: the game, the published art, and how much story the player wants. */
export interface StoryCtx { game: Game; art: ArtIndex; mode: StoryMode }

export const storyCtx = (ctx: SceneCtx): StoryCtx => ({ game: ctx.game, art: ctx.art, mode: ctx.settings?.get().story ?? DEFAULT_SETTINGS.story });

const MAJOR = new Set<SceneId>(MAJOR_SCENES);
/** Whether a scene starts by itself: every one, only the major ones, or none. */
export function shouldPlay(id: SceneId, mode: StoryMode): boolean {
  if (mode === 'all') return true;
  return mode === 'major' && MAJOR.has(id);
}

/** The town people who have a published face: the facility keeper each one stands in. */
export const NPC_FACILITY: Partial<Record<NpcId, 'guild' | 'shop' | 'inn' | 'gate' | 'forge'>> = {
  anna: 'guild', orik: 'shop', marta: 'inn', glen: 'gate', doran: 'forge',
};

/** Faces to try for a mood, best first. Sad falls back to down and then normal; any other face straight to normal (never another feeling). */
const faceOrder = (mood: StoryMood): StoryMood[] =>
  mood === 'normal' ? ['normal'] : mood === 'sad' ? ['sad', 'down', 'normal'] : [mood, 'normal'];

/** Who speaks: the name plate, and the face when there is published art for it. */
export function speakerOf(who: Speaker, s: GameState, index: ArtIndex, mood: StoryMood = 'normal'): { name: string; face?: string } {
  if (who === 'narrator') return { name: '' };
  if (who in CHARACTERS) {
    const id = who as CharacterId;
    const artId = artIdOf(s.party.roster[id] ?? { id, oath: undefined });
    const face = faceOrder(mood).map((m) => art.portrait(artId, m)).find((u) => index.has(u));
    return face ? { name: CHARACTERS[id].name, face } : { name: CHARACTERS[id].name };
  }
  const npc = who as NpcId;
  const facility = NPC_FACILITY[npc];
  const face = facility ? art.npc(facility, 'normal') : null;
  return face && index.has(face) ? { name: NPC_NAMES[npc], face } : { name: NPC_NAMES[npc] };
}

/** A scene's lines without the ones whose condition does not hold for this game. */
export function linesOf(id: SceneId, s: GameState): ScriptLine[] {
  const full = CHARACTER_IDS.filter((c) => {
    const m = s.party.roster[c];
    return !!m && memoriesOf(m) >= chainLength(c);
  });
  return linesWhen(STORY.scenes[id].lines, { met: s.party.recruited, full, returned: s.story.returned, oath: !!s.party.roster.rin?.oath });
}

/** The first one to speak in `lines`: they stand on the left, everyone else on the right. */
const firstSpeaker = (lines: ScriptLine[]): Speaker | undefined => lines.find((l) => l.who !== 'narrator')?.who;

/** Says one line in the box: its speaker's plate (or `plate`, when given), and the face on its side. */
function sayLine(talk: Dialogue, line: ScriptLine, ctx: StoryCtx, first: Speaker | undefined, plate?: string): Promise<void> {
  const sp = speakerOf(line.who, ctx.game.state, ctx.art, line.mood);
  return talk.say(plate ?? sp.name, line.text, sp.face ? { src: sp.face, side: line.who === first ? 'left' : 'right' } : undefined);
}

/**
 * Plays a scene in the dialogue box. While it plays the caller hands every action to `onAction`:
 * confirm turns the page, cancel (Esc, X, right click) stops and shows the summary instead.
 */
export function playScene(talk: Dialogue, id: SceneId, ctx: StoryCtx): { done: Promise<'done' | 'skipped'>; onAction(a: UiAction): void } {
  let finished = false;
  let summary: Promise<void> | null = null;
  const lines = linesOf(id, ctx.game.state);
  const first = firstSpeaker(lines);
  talk.setStyle(sceneKind(id) === 'memory' ? 'memory' : 'plain');

  const run = async (): Promise<'done' | 'skipped'> => {
    for (const line of lines) {
      if (summary) break;
      await sayLine(talk, line, ctx, first);
    }
    if (summary) await summary;
    finished = true;
    talk.setStyle('plain');
    return summary ? 'skipped' : 'done';
  };
  const done = run();

  return {
    done,
    onAction(a) {
      if (finished) return;
      if (a === 'confirm') { talk.onAction('confirm'); return; }
      // Cancelling while the summary is up does nothing more: the summary is already the last line.
      if (a === 'cancel' && !summary) { talk.stop(); summary = talk.say('', T.ui2.story.skipped(STORY.scenes[id].summary)); }
    },
  };
}

/**
 * Plays `lines` in the dialogue box as a scene plays them (plates, faces, the first speaker on the left), with no scene to
 * record and no summary (story polish Task 1). `plate`, when it gives a string, stands in for that line's name plate; the
 * face stays. Confirm turns the page; cancel stops at once and ends `done` with `skipped`, leaving the box to the caller's
 * next line.
 */
export function playLines(talk: Dialogue, lines: ScriptLine[], ctx: StoryCtx, plate?: (line: ScriptLine, i: number) => string | undefined): { done: Promise<'done' | 'skipped'>; onAction(a: UiAction): void } {
  let finished = false;
  let stop = (): void => {};
  const stopped = new Promise<'skipped'>((r) => { stop = () => r('skipped'); });
  const first = firstSpeaker(lines);

  const run = async (): Promise<'done' | 'skipped'> => {
    for (const [i, line] of lines.entries()) {
      const said = sayLine(talk, line, ctx, first, plate?.(line, i)).then(() => 'said' as const);
      if ((await Promise.race([said, stopped])) === 'skipped') return 'skipped';
    }
    return 'done';
  };
  const done = run().finally(() => { finished = true; });

  return {
    done,
    onAction(a) {
      if (finished) return;
      if (a === 'confirm') { talk.onAction('confirm'); return; }
      if (a === 'cancel') { finished = true; talk.stop(); stop(); }
    },
  };
}

/**
 * Plays scene `id` and records it with the game: played or skipped as the player chose, or `auto` (nothing shown) when the
 * story setting skips it. Every screen that plays a due scene goes through here, so none writes its own copy of this.
 */
export function playAndRecord(talk: Dialogue, id: SceneId, ctx: StoryCtx): { done: Promise<void>; onAction(a: UiAction): void } {
  if (!shouldPlay(id, ctx.mode)) {
    ctx.game.sceneDone(id, 'auto');
    return { done: Promise.resolve(), onAction() {} };
  }
  // A scene that fails is still recorded (as auto, so it reads as new in the handbook) and the error goes on to the caller.
  const failed = (e: unknown): never => { ctx.game.sceneDone(id, 'auto'); throw e; };
  let p: ReturnType<typeof playScene>;
  try { p = playScene(talk, id, ctx); } catch (e) { return failed(e); }
  return { done: p.done.then((how) => { ctx.game.sceneDone(id, how === 'done' ? 'played' : 'skipped'); }, failed), onAction: p.onAction };
}
