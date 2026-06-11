import { describe, it, expect, beforeEach, vi } from 'vitest';

// 只 mock Assets：loadGameTextures 在 vitest（無 WebGL）環境下不可能真載貼圖。
vi.mock('pixi.js', () => ({
  Assets: {
    load: vi.fn(async (url: string) => ({
      url,
      source: { scaleMode: 'linear' },
    })),
  },
}));

import { Assets } from 'pixi.js';
import { loadGameTextures, ASSET_URLS } from './assets';
import { SKIN_CATALOG } from './skins';

const loadMock = vi.mocked(Assets.load);

function loadedUrls(): string[] {
  return loadMock.mock.calls.map((c) => c[0] as unknown as string);
}

beforeEach(() => {
  loadMock.mockClear();
});

describe('loadGameTextures（皮膚參數化）', () => {
  it('無參數 → block 用 neon URL（與現狀完全一致）', async () => {
    const tex = await loadGameTextures();
    const urls = loadedUrls();
    expect(urls).toContain('/assets/games/tetris/block.webp');
    // 其餘貼圖不變
    expect(urls).toContain(ASSET_URLS.frameWell);
    expect(urls).toContain(ASSET_URLS.bg);
    expect(urls).toContain(ASSET_URLS.spark);
    expect(urls).toContain(ASSET_URLS.ring);
    expect(urls).toContain(ASSET_URLS.glow);
    expect(urls).toHaveLength(6);
    // nearest 取樣不變（block + spark）
    expect(tex.block.source.scaleMode).toBe('nearest');
    expect(tex.spark.source.scaleMode).toBe('nearest');
    expect(tex.bg.source.scaleMode).toBe('linear');
  });

  it("loadGameTextures('crystal') → block 用 crystal 皮膚 URL", async () => {
    await loadGameTextures('crystal');
    const urls = loadedUrls();
    expect(urls).toContain('/assets/games/tetris/skins/crystal.webp');
    expect(urls).not.toContain('/assets/games/tetris/block.webp');
    // 非 block 貼圖不受皮膚影響
    expect(urls).toContain(ASSET_URLS.frameWell);
    expect(urls).toContain(ASSET_URLS.bg);
  });

  it('每款皮膚 id 都對映到目錄中的 blockUrl', async () => {
    for (const skin of SKIN_CATALOG) {
      loadMock.mockClear();
      await loadGameTextures(skin.id);
      expect(loadedUrls()).toContain(skin.blockUrl);
    }
  });

  it('未知 id → 回退 neon URL', async () => {
    await loadGameTextures('no-such-skin');
    expect(loadedUrls()).toContain('/assets/games/tetris/block.webp');
  });
});
