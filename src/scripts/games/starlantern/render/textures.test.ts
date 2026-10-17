import { describe, expect, it, vi } from 'vitest';
import type { Texture } from 'pixi.js';
import { MANIFEST_URL } from './artPaths';
import { TextureBank, loadManifest } from './textures';

const fakeTex = () => ({ source: { scaleMode: 'linear' } }) as unknown as Texture;

describe('TextureBank', () => {
  it('keeps loaded textures pixel-sharp and returns null for failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bank = new TextureBank(async (u) => { if (u.endsWith('bad.png')) throw new Error('404'); return fakeTex(); });
    await bank.preload(['/assets/games/starlantern/a.png', '/assets/games/starlantern/bad.png']);
    expect(bank.get('/assets/games/starlantern/a.png')?.source.scaleMode).toBe('nearest');
    expect(bank.has('/assets/games/starlantern/a.png')).toBe(true);
    expect(bank.get('/assets/games/starlantern/bad.png')).toBeNull();
    expect(bank.has('/assets/games/starlantern/bad.png')).toBe(false);
    expect(bank.get('/never/asked.png')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('TextureBank timeouts', () => {
  it('gives up on a request that never settles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bank = new TextureBank(() => new Promise<Texture>(() => {}), 30);
    await bank.preload(['/assets/games/starlantern/stuck.png']);
    expect(bank.get('/assets/games/starlantern/stuck.png')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('loadManifest', () => {
  it('returns the listed urls', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ version: 1, urls: ['/assets/games/starlantern/enemy/slime.png'] })));
    expect(await loadManifest(f as unknown as typeof fetch)).toEqual(new Set(['/assets/games/starlantern/enemy/slime.png']));
    expect(f).toHaveBeenCalledWith(MANIFEST_URL, { cache: 'no-cache' });
  });

  it('treats a missing or broken manifest as no art', async () => {
    expect((await loadManifest((async () => new Response('', { status: 404 })) as unknown as typeof fetch)).size).toBe(0);
    expect((await loadManifest((async () => new Response('{oops')) as unknown as typeof fetch)).size).toBe(0);
    expect((await loadManifest((async () => { throw new Error('offline'); }) as unknown as typeof fetch)).size).toBe(0);
  });
});
