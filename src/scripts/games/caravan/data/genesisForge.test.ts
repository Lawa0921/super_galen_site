import { describe, expect, it } from 'vitest';
import { previewGenesisForge, forgeFingerprint } from './genesisForge';

const stats = { str: 14, dex: 10, int: 11, cha: 10, con: 12 };

describe('M30 genesis forge', () => {
  it('uses the same genesis and growth formulas without mutating state', () => {
    const preview = previewGenesisForge({
      job: 'swordsman',
      stats,
      trait: 'brawny',
    });
    expect(preview.genesis).not.toBeNull();
    expect(preview.growthSignature).not.toBe('—');
    expect(preview.projectedCareers).toHaveLength(4);
  });

  it('is deterministic for the same character inputs', () => {
    const a = previewGenesisForge({ job: 'mage', stats, trait: 'learned' });
    const b = previewGenesisForge({ job: 'mage', stats, trait: 'learned' });
    expect(forgeFingerprint(a)).toBe(forgeFingerprint(b));
  });

  it('does not create a mandatory best origin', () => {
    const paths = ['brawny', 'nimble', 'learned', 'charming', 'tough'];
    const fingerprints = paths.map((trait) =>
      forgeFingerprint(previewGenesisForge({ job: 'swordsman', stats, trait })),
    );
    expect(new Set(fingerprints).size).toBe(paths.length);
  });

  it('legacy no-origin preview stays compatible', () => {
    const preview = previewGenesisForge({ job: 'swordsman', stats, trait: null });
    expect(preview.genesis).toBeNull();
    expect(preview.growth).toBeNull();
  });
});
