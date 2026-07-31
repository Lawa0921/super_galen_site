import { describe, expect, it } from 'vitest';
import { previewGenesisForge } from './genesisForge';

describe('M30 forge audit', () => {
  it('only previews and does not create persistence data', () => {
    const preview = previewGenesisForge({
      job: 'cleric',
      trait: 'charming',
      stats: { str: 10, dex: 10, int: 11, cha: 15, con: 12 },
    });
    expect(preview.projectedCareers.length).toBe(4);
    expect(Object.prototype.hasOwnProperty.call(preview, 'save')).toBe(false);
  });
});
