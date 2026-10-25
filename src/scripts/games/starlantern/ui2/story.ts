import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { chainLength } from '../data/story/chains';
import { BANTER_GATE, CHAT_GATE, GROUP_GATE, MAJOR_SCENES, heavyScene, memScene, sceneKind, type SceneId, type StoryGate } from '../data/story/scenes';
import { AFTER_CHOICE } from '../data/story/voiceGates';
import { WARM_MOODS } from '../data/story/tone';
import { NIGHT_PLACE, NPC_NAMES, STORY, isChoice, linesWhen, type NpcId, type Place, type SceneLine, type ScriptLine, type Speaker } from '../data/story.zh-TW';
import { COMPANIONS } from '../data/story/bond';
import { bondTier } from '../engine/story/bond';
import { T } from '../data/text.zh-TW';
import type { Game } from '../engine/game';
import { storyPieces } from '../engine/story/events';
import type { GameState } from '../engine/state';
import type { CharacterId } from '../engine/types';
import { NORMAL_SMILES, art, type StoryMood } from '../render/artPaths';
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
/** Whether a scene starts by itself: every one, only the major ones (a group scene counts as one, story L spec §5.1), or none. */
export function shouldPlay(id: SceneId, mode: StoryMode): boolean {
  if (mode === 'all') return true;
  return mode === 'major' && (MAJOR.has(id) || sceneKind(id) === 'group');
}

/** The town people who have a published face: the facility keeper each one stands in. */
export const NPC_FACILITY: Partial<Record<NpcId, 'guild' | 'shop' | 'inn' | 'gate' | 'forge'>> = {
  anna: 'guild', orik: 'shop', marta: 'inn', glen: 'gate', doran: 'forge',
};

/** The heavy faces (story depth final review): a smile borrowed for one of these says the opposite. */
export const GRAVE: ReadonlySet<StoryMood> = new Set<StoryMood>(['serious', 'sad', 'solemn', 'shaken', 'vow', 'distant', 'wistful']);
/**
 * The near grave face a companion wears when she has no art for the exact one (wave 1 wiring, 2026-10-23): close enough
 * in feeling that it never says the opposite, unlike her smiling normal.
 */
export const GRAVE_FALLBACK: Partial<Record<StoryMood, StoryMood[]>> = {
  shaken: ['sad'], solemn: ['serious'], vow: ['serious'], distant: ['wistful', 'sad'], wistful: ['sad'],
};
/** The glad faces (staging S3): a smiling normal says the same thing, so any scene may borrow it for them (story L: `WARM_MOODS`). */
export const HAPPY: ReadonlySet<StoryMood> = WARM_MOODS;
/**
 * The nearest face for a mood that is neither glad nor normal (staging S3, 2026-10-23), tried in order in a heavy scene:
 * a fright reads as sorrow, a start or a frown as gravity, a vision as longing. The grave faces keep their
 * `GRAVE_FALLBACK`.
 */
export const NEAR_FACE: Partial<Record<StoryMood, StoryMood[]>> = {
  ...GRAVE_FALLBACK,
  panic: ['sad'], unguarded: ['sad'], hushed: ['sad'], averted: ['sad'],
  surprised: ['serious'], bewildered: ['serious'], focused: ['serious'], alert: ['serious'], guarded: ['serious'], resolve: ['serious'], pout: ['serious'],
  foresee: ['wistful', 'sad'],
};
/**
 * Art ids whose normal is calm enough to stand in for any heavy face (staging S3, by eye on the published art): Rin's,
 * both looks, a level gaze. Lorne's normal carries a soft smile, so it is no stand-in. Since face wave 2 (2026-10-24) both
 * have heavy faces of their own: Lorne serious and distant, each Rin look serious and guarded; a heavy mood takes its own
 * face or its `NEAR_FACE` (resolve and surprised → serious, guarded → serious, averted → sad), so every heavy line of
 * theirs in the script shows a face (ui2/storyFaces.test.ts).
 */
export const CALM_NORMALS: ReadonlySet<string> = new Set(['rin', 'rin-oath']);
/**
 * Faces to try for a mood, best first. Sad falls back to down and then normal; any other face straight to normal. But a
 * speaker whose normal portrait smiles (`NORMAL_SMILES`: the companions) takes a grave face of her own, then its
 * `GRAVE_FALLBACK`, or none: with no such art the line shows its name plate alone (story depth final review). In a
 * `heavy` scene (staging S3) a mood that is not glad takes its `NEAR_FACE` instead of the normal, and only a calm normal
 * (`CALM_NORMALS`) is left as the last resort; a light scene keeps the old order.
 */
const faceOrder = (mood: StoryMood, artId: string, heavy: boolean): StoryMood[] => {
  if (mood === 'normal') return ['normal'];
  if (GRAVE.has(mood) && NORMAL_SMILES.has(artId)) return [mood, ...(GRAVE_FALLBACK[mood] ?? [])];
  if (heavy && !HAPPY.has(mood) && mood !== 'down') {
    const near: StoryMood[] = mood === 'sad' ? ['sad', 'down'] : [mood, ...(NEAR_FACE[mood] ?? [])];
    return CALM_NORMALS.has(artId) ? [...near, 'normal'] : near;
  }
  return mood === 'sad' ? ['sad', 'down', 'normal'] : [mood, 'normal'];
};

/** Which side of Rin's choice a scene belongs to: `before` her oath, `after` it, or null when it can play on either. */
export type Era = 'before' | 'after';
const gateOf = (id: SceneId): StoryGate | undefined => CHAT_GATE[id] ?? BANTER_GATE[id] ?? (GROUP_GATE as Partial<Record<SceneId, StoryGate>>)[id];
/**
 * The era a scene belongs to, from when it can ever play: her memory pieces and her reveal (the reveal sets the oath as it
 * ends, and every piece of hers is told before it), and a scene gated `beforeChoice`, are `before`; the scenes after her
 * choice (`AFTER_CHOICE`), the eve (queued only once she has sworn) and a scene gated `oath` are `after`. Any other can play on
 * either side, so it has none and follows the game. A replay from the handbook after her oath then shows the faces she had
 * when the scene was told (her guilty averted look, not her shy one), and a scene played live reads the same as the game.
 */
export function sceneEra(id: SceneId): Era | null {
  const g = gateOf(id);
  if (id === 'rin-reveal' || g?.beforeChoice || Array.from({ length: chainLength('rin') }, (_, i) => memScene('rin', i + 1)).includes(id)) return 'before';
  if (AFTER_CHOICE.has(id) || id === 'finale-eve' || g?.oath) return 'after';
  return null;
}

/**
 * Who speaks: the name plate, and the face when there is published art for it. `heavy`: the line is in a heavy scene
 * (`faceOrder`). `era`, when given, is the side of Rin's choice the line belongs to (`sceneEra`): her look is that era's,
 * whatever the game's oath now says.
 */
export function speakerOf(who: Speaker, s: GameState, index: ArtIndex, mood: StoryMood = 'normal', heavy = false, era: Era | null = null): { name: string; face?: string } {
  const { name, faces } = speakerFaces(who, s, mood, heavy, era);
  const face = faces.find((u) => index.has(u));
  return face ? { name, face } : { name };
}

/** Every face that could stand for a line of `who`, best first (`speakerOf` shows the first one loaded; `Dialogue.faceLater`). */
export const faceCandidates = (who: Speaker, s: GameState, mood: StoryMood = 'normal', heavy = false, era: Era | null = null): string[] =>
  speakerFaces(who, s, mood, heavy, era).faces;

/** Who speaks, and every face that could stand for the line, best first (`speakerOf` shows the first one loaded). */
function speakerFaces(who: Speaker, s: GameState, mood: StoryMood, heavy: boolean, era: Era | null): { name: string; faces: string[] } {
  if (who === 'narrator') return { name: '', faces: [] };
  if (who in CHARACTERS) {
    const id = who as CharacterId;
    const oath = era ? (era === 'after' ? true as const : undefined) : s.party.roster[id]?.oath;
    const artId = artIdOf({ id, oath });
    return { name: CHARACTERS[id].name, faces: faceOrder(mood, artId, heavy).map((m) => art.portrait(artId, m)) };
  }
  const npc = who as NpcId;
  const facility = NPC_FACILITY[npc];
  return { name: NPC_NAMES[npc], faces: facility ? [art.npc(facility, 'normal')] : [] };
}

/** A scene's lines without the ones whose condition does not hold for this game (a choice always stays). */
export function linesOf(id: SceneId, s: GameState): SceneLine[] {
  // story L spec §4.9: a companion is full once her last piece is told; Lorne and Rin once they hold it all.
  const full = CHARACTER_IDS.filter((c) => !!s.party.roster[c] && storyPieces(s, c) >= chainLength(c));
  // bond plan Task 7: each met companion's bond tier, for the lines that wait on one
  const tiers = Object.fromEntries(COMPANIONS.filter((c) => s.party.recruited.includes(c)).map((c) => [c, bondTier(s.party.roster[c])]));
  return linesWhen(STORY.scenes[id].lines, { met: s.party.recruited, full, returned: s.story.returned, oath: !!s.party.roster.rin?.oath, seen: s.story.seen, tiers });
}

/** The first one to speak in `lines`: they stand on the left, everyone else on the right. */
const firstSpeaker = (lines: readonly SceneLine[]): Speaker | undefined => lines.find((l) => l.who !== 'narrator')?.who;

/** Says one line in the box: its speaker's plate (or `plate`, when given), and the face on its side. `heavy`: see `faceOrder`; `era`: `sceneEra`. */
function sayLine(talk: Dialogue, line: ScriptLine, ctx: StoryCtx, first: Speaker | undefined, plate?: string, heavy = false, era: Era | null = null): Promise<void> {
  const sp = speakerOf(line.who, ctx.game.state, ctx.art, line.mood, heavy, era);
  const side = line.who === first ? 'left' as const : 'right' as const;
  // Narration keeps the last speaker's face up, dimmed (staging S4): the scene stays peopled between her lines.
  const face = sp.face ? { src: sp.face, side } : line.who === 'narrator' ? 'keep' as const : undefined;
  const said = talk.say(plate ?? sp.name, line.text, face);
  // A better face for the line that lands while it is up is shown then (ui2/lateArt).
  if (line.who !== 'narrator') talk.faceLater(speakerFaces(line.who, ctx.game.state, line.mood ?? 'normal', heavy, era).faces, side, ctx.art);
  return said;
}

/** How a caller sets a scene (story L plan ruling 3): `place`, the card up from its first line (a line's own place replaces it). */
export interface SceneOpts { place?: Place }

/**
 * Plays a scene in the dialogue box. While it plays the caller hands every action to `onAction`:
 * confirm turns the page, cancel (Esc, X, right click) stops and shows the summary instead.
 */
export function playScene(talk: Dialogue, id: SceneId, ctx: StoryCtx, o: SceneOpts = {}): { done: Promise<'done' | 'skipped'>; onAction(a: UiAction): void } {
  let finished = false;
  let summary: Promise<void> | null = null;
  const all = linesOf(id, ctx.game.state);
  // bond plan Task 7: a choice is played from Task 9 on; until then one on screen is an error, never a silent skip
  if (all.some(isChoice)) throw new Error(`starlantern: ${id} holds a choice, and choices do not play yet`);
  const lines = all as ScriptLine[];
  const first = firstSpeaker(lines);
  const heavy = heavyScene(id);
  // Her look is the scene's era, so a memory replayed after her oath wears the faces it was told with.
  const era = sceneEra(id);
  talk.hold(true);
  if (o.place) talk.setPlace(o.place);

  const run = async (): Promise<'done' | 'skipped'> => {
    try {
      for (const line of lines) {
        if (summary) break;
        // Only a memory's remembered past wears the memory look; its present lines are any scene's (staging S5).
        talk.setStyle(line.past ? 'memory' : 'plain');
        // Where it happens, from the line that says so (staging S6); a line with no place keeps the card up.
        if (line.place) talk.setPlace(line.place);
        await sayLine(talk, line, ctx, first, undefined, heavy, era);
      }
      if (summary) await summary;
      return summary ? 'skipped' : 'done';
    } finally {
      // Ended, skipped or thrown: the screen gets its everyday look back and the box is let go (staging review 1).
      finished = true;
      talk.setStyle('plain');
      talk.setPlace(null);
      talk.hold(false);
      talk.close();
    }
  };
  const done = run();

  return {
    done,
    onAction(a) {
      if (finished) return;
      if (a === 'confirm') { talk.onAction('confirm'); return; }
      // Cancelling while the summary is up does nothing more: the summary is already the last line.
      if (a === 'cancel' && !summary) { talk.stop(); talk.setStyle('plain'); talk.setPlace(null); summary = talk.say('', T.ui2.story.skipped(STORY.scenes[id].summary)); }
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
  talk.hold(true);

  const run = async (): Promise<'done' | 'skipped'> => {
    for (const [i, line] of lines.entries()) {
      const said = sayLine(talk, line, ctx, first, plate?.(line, i)).then(() => 'said' as const);
      if ((await Promise.race([said, stopped])) === 'skipped') return 'skipped';
    }
    talk.close();
    return 'done';
  };
  // Skipped, the line on screen stays for the caller's next one; done, the box goes as it would after any last line.
  const done = run().finally(() => { finished = true; talk.hold(false); });

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
export function playAndRecord(talk: Dialogue, id: SceneId, ctx: StoryCtx, o: SceneOpts = {}): { done: Promise<void>; onAction(a: UiAction): void } {
  if (!shouldPlay(id, ctx.mode)) {
    ctx.game.sceneDone(id, 'auto');
    return { done: Promise.resolve(), onAction() {} };
  }
  // A scene that fails is still recorded (as auto, so it reads as new in the handbook) and the error goes on to the caller.
  const failed = (e: unknown): never => { ctx.game.sceneDone(id, 'auto'); throw e; };
  let p: ReturnType<typeof playScene>;
  try { p = playScene(talk, id, ctx, o); } catch (e) { return failed(e); }
  return { done: p.done.then((how) => { ctx.game.sceneDone(id, how === 'done' ? 'played' : 'skipped'); }, failed), onAction: p.onAction };
}

/**
 * Story L spec §4.5, §4.4.1: plays `ids` as a night, through the caller's `play` (each screen plays and records a scene its
 * own way): a memory under the night's card (`NIGHT_PLACE`), any other scene under its own, and between two memories the
 * night's beat (`Game.takeBeat`), said by `beat`. A memory the story setting does not show is recorded (auto) with no beat
 * around it.
 */
export async function playNight(ids: SceneId[], ctx: StoryCtx, play: (id: SceneId, o: SceneOpts) => Promise<void>, beat: (line: ScriptLine) => Promise<void>): Promise<void> {
  let prev: SceneId | null = null;
  for (const id of ids) {
    const memory = sceneKind(id) === 'memory';
    const show = shouldPlay(id, ctx.mode);
    const line = show && memory && prev ? ctx.game.takeBeat(prev, id) : null;
    if (line) await beat(line);
    await play(id, memory ? { place: NIGHT_PLACE } : {});
    if (show) prev = memory ? id : null;
  }
}

/** The night's beat (spec §4.4.1): one line with its speaker's plate and face, the night's card kept up. */
export function playBeat(talk: Dialogue, line: ScriptLine, ctx: StoryCtx): { done: Promise<'done' | 'skipped'>; onAction(a: UiAction): void } {
  talk.setPlace(NIGHT_PLACE);
  return playLines(talk, [line], ctx);
}
