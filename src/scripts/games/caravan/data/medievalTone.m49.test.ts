import { describe, expect, it } from 'vitest';
import { ITEMS } from './items';
import { TOWNS } from './towns';

describe('M49 medieval sword-and-magic tone consistency', () => {
  it('keeps the legacy silver-locket save id while removing the pocket-watch anachronism', () => {
    const keepsake = ITEMS['silver-locket'];
    expect(keepsake).toBeDefined();
    expect(keepsake.id).toBe('silver-locket');
    expect(keepsake.name).toBe('銀墜盒');
    expect(`${keepsake.name}${keepsake.desc}`).not.toMatch(/懷錶|手錶|腕錶|鐘錶/);
    expect(TOWNS['riverbend-town'].stock).toContain('silver-locket');
    expect(TOWNS['riverbend-town'].desc).toContain('銀墜盒');
  });

  it('describes an old magical battlefield without implying gunpowder-era smoke', () => {
    const robe = ITEMS['ashveil-robe'];
    expect(robe.desc).toContain('焦煙');
    expect(robe.desc).not.toContain('硝煙');
  });
});
