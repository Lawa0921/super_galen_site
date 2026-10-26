import type { StoryMood } from '../../render/artPaths';
import { STORY, flatLines } from '../story.zh-TW';
import { CLOSING_PIECES, type SceneId } from './scenes';

/** The glad faces (staging S3): a smiling normal says the same thing, so any scene may borrow it for them. */
export const WARM_MOODS: ReadonlySet<StoryMood> = new Set<StoryMood>(['smile', 'laugh', 'wink', 'grin', 'excited', 'smug', 'scheming', 'blush']);

/**
 * Story L spec §4.3: whether a memory is warm or heavy, for the night's fatigue guard. The script has no tone field, so it
 * reads the faces: a memory with a glad face on any line (any reading) is warm, unless it closes a chain (`CLOSING_PIECES`).
 */
export function memoryTone(id: SceneId): 'warm' | 'heavy' {
  if (CLOSING_PIECES.includes(id)) return 'heavy';
  return flatLines(STORY.scenes[id].lines).some((l) => !!l.mood && WARM_MOODS.has(l.mood)) ? 'warm' : 'heavy';
}
