import { describe, expect, it } from 'vitest';
import { STORY } from '../story.zh-TW';
import { CLOSING_PIECES, SCENE_IDS, type SceneId } from './scenes';
import { WARM_MOODS, memoryTone } from './tone';

const memories = SCENE_IDS.filter((id) => id.startsWith('mem:'));
const glad = (id: SceneId) => STORY.scenes[id].lines.some((l) => !!l.mood && WARM_MOODS.has(l.mood));

describe('story L: a memory\'s tone (spec §4.3)', () => {
  it('a memory with a glad face is warm, unless it closes a chain', () => {
    const warm = memories.find((id) => glad(id) && !CLOSING_PIECES.includes(id));
    const heavy = memories.find((id) => !glad(id));
    const closingGlad = memories.find((id) => glad(id) && CLOSING_PIECES.includes(id));
    expect(warm && heavy && closingGlad, 'the script has all three kinds').toBeTruthy();
    expect(memoryTone(warm!)).toBe('warm');
    expect(memoryTone(heavy!)).toBe('heavy');
    expect(memoryTone(closingGlad!)).toBe('heavy');
    // the glad faces are the staging's: a smile, never a grave face
    expect(WARM_MOODS.has('smile')).toBe(true);
    expect(WARM_MOODS.has('sad')).toBe(false);
  });

  it('every memory has a tone', () => {
    const tones = memories.map(memoryTone);
    expect(tones.every((t) => t === 'warm' || t === 'heavy')).toBe(true);
    expect(tones.filter((t) => t === 'warm').length).toBeGreaterThan(0);
    expect(tones.filter((t) => t === 'heavy').length).toBeGreaterThan(0);
    for (const id of CLOSING_PIECES) expect(memoryTone(id)).toBe('heavy');
  });
});
