import { describe, expect, it } from 'vitest';
import { previewGenesisForge } from './genesisForge';

describe('M30 forge combinations', () => {
  it('different jobs can share the same destiny system', () => {
    const stats = { str: 12, dex: 12, int: 12, cha: 12, con: 12 };
    const jobs = ['swordsman', 'ranger', 'mage', 'cleric'] as const;
    const previews = jobs.map((job) => previewGenesisForge({ job, stats, trait: 'seasoned' }));
    expect(previews).toHaveLength(4);
    expect(previews.every((p) => p.genesis !== null)).toBe(true);
  });
});
