import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SKIN_CATALOG,
  isUnlocked,
  getSelectedSkin,
  setSelectedSkin,
  resolveSkin,
  type SkinDef,
} from './skins';

// ── 1. 目錄完整性 ──────────────────────────────────────────────────────────
describe('SKIN_CATALOG', () => {
  it('恰好 5 款', () => {
    expect(SKIN_CATALOG).toHaveLength(5);
  });

  it('id 順序為 neon/bit8/rune/holo/crystal', () => {
    expect(SKIN_CATALOG.map((s) => s.id)).toEqual([
      'neon', 'bit8', 'rune', 'holo', 'crystal',
    ]);
  });

  it('neon.unlockLevel === 0', () => {
    expect(SKIN_CATALOG[0].unlockLevel).toBe(0);
  });

  it('URL 對映正確', () => {
    const map: Record<string, string> = {
      neon:    '/assets/games/tetris/block.webp',
      bit8:    '/assets/games/tetris/skins/bit8.webp',
      rune:    '/assets/games/tetris/skins/rune.webp',
      holo:    '/assets/games/tetris/skins/holo.webp',
      crystal: '/assets/games/tetris/skins/crystal.webp',
    };
    for (const skin of SKIN_CATALOG) {
      expect(skin.blockUrl).toBe(map[skin.id]);
    }
  });

  it('unlockLevel 遞增順序 0/2/4/6/9', () => {
    expect(SKIN_CATALOG.map((s) => s.unlockLevel)).toEqual([0, 2, 4, 6, 9]);
  });
});

// ── 2. isUnlocked 邊界 ──────────────────────────────────────────────────────
describe('isUnlocked', () => {
  const rune = SKIN_CATALOG.find((s) => s.id === 'rune')!; // unlockLevel 4

  it('level === unlockLevel → true', () => {
    expect(isUnlocked(rune, 4)).toBe(true);
  });

  it('level < unlockLevel → false', () => {
    expect(isUnlocked(rune, 3)).toBe(false);
  });

  it('level > unlockLevel → true', () => {
    expect(isUnlocked(rune, 5)).toBe(true);
  });
});

// ── 3. get/setSelectedSkin 往返與 key 隔離 ────────────────────────────────
describe('getSelectedSkin / setSelectedSkin', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('預設（無值）回傳 neon', () => {
    expect(getSelectedSkin()).toBe('neon');
  });

  it('set 後 get 往返', () => {
    setSelectedSkin('bit8');
    expect(getSelectedSkin()).toBe('bit8');
  });

  it('guest 與 addr key 隔離：set guest 不影響 addr', () => {
    setSelectedSkin('rune');          // guest
    setSelectedSkin('holo', '0xABCD'); // addr
    expect(getSelectedSkin()).toBe('rune');         // guest 不變
    expect(getSelectedSkin('0xABCD')).toBe('holo'); // addr 獨立
  });

  it('addr 大小寫正規化：大寫/小寫 addr 共用同一 key', () => {
    setSelectedSkin('crystal', '0xABCDEF');
    expect(getSelectedSkin('0xabcdef')).toBe('crystal');
  });

  it('空字串 addr 視為 guest', () => {
    setSelectedSkin('bit8', '');
    expect(getSelectedSkin('')).toBe('bit8');
    expect(getSelectedSkin(null)).toBe('bit8'); // '' → guest = null → guest
  });
});

// ── 4. localStorage 不可用時靜默降級 ────────────────────────────────────────
describe('localStorage 不可用', () => {
  it('get 回傳 neon（不丟例外）', () => {
    const orig = globalThis.localStorage;
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    });
    expect(() => getSelectedSkin()).not.toThrow();
    expect(getSelectedSkin()).toBe('neon');
    vi.stubGlobal('localStorage', orig);
  });

  it('set 不丟例外', () => {
    const orig = globalThis.localStorage;
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    });
    expect(() => setSelectedSkin('bit8')).not.toThrow();
    vi.stubGlobal('localStorage', orig);
  });
});

// ── 5. resolveSkin ──────────────────────────────────────────────────────────
describe('resolveSkin', () => {
  it('未知 id → neon SkinDef', () => {
    const result = resolveSkin('doesNotExist', 99);
    expect(result.id).toBe('neon');
  });

  it('已知 id 但 level 不足 → neon SkinDef', () => {
    const result = resolveSkin('crystal', 5); // crystal 需 level 9
    expect(result.id).toBe('neon');
  });

  it('已知 id 且 level 足夠 → 該款 SkinDef', () => {
    const result = resolveSkin('holo', 6); // holo 需 level 6
    expect(result.id).toBe('holo');
  });

  it('neon 在任何 level 均可解鎖（unlockLevel=0）', () => {
    const result = resolveSkin('neon', 0);
    expect(result.id).toBe('neon');
  });
});
