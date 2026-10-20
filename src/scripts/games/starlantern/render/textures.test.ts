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

describe('TextureBank late art (no placeholder)', () => {
  const deferred = () => { let resolve!: (t: Texture) => void; const p = new Promise<Texture>((r) => { resolve = r; }); return { p, resolve }; };
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

  it('takes a texture that outlasts the timeout when it lands, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = deferred();
    const bank = new TextureBank(() => d.p, 20);
    const seen: string[] = [];
    bank.onLoad((u) => seen.push(u));
    await bank.preload(['/a/slow.png']);
    expect(bank.has('/a/slow.png')).toBe(false);
    d.resolve(fakeTex());
    await tick();
    expect(bank.has('/a/slow.png')).toBe(true);
    expect(bank.get('/a/slow.png')?.source.scaleMode).toBe('nearest');
    expect(seen).toEqual(['/a/slow.png']);
    warn.mockRestore();
  });

  it('asks for each picture once, however often it is preloaded', async () => {
    const load = vi.fn(async () => fakeTex());
    const bank = new TextureBank(load);
    await Promise.all([bank.preload(['/a/x.png']), bank.preload(['/a/x.png', '/a/y.png'])]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('whenReady waits for the asked pictures in flight, at most the cap, and never starts a request', async () => {
    const slow = deferred(), fast = deferred();
    const load = vi.fn((u: string) => (u.includes('slow') ? slow.p : fast.p));
    const bank = new TextureBank(load, 10_000);
    void bank.preload(['/a/slow.png', '/a/fast.png']);
    let done = false;
    const w = bank.whenReady(['/a/fast.png'], 1000).then(() => { done = true; });
    await tick();
    expect(done).toBe(false);
    fast.resolve(fakeTex());
    await w;
    expect(bank.has('/a/fast.png')).toBe(true);
    // The slow one: the cap ends the wait, the picture still lands later.
    const t0 = Date.now();
    await bank.whenReady(['/a/slow.png', '/a/fast.png'], 40);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
    expect(bank.has('/a/slow.png')).toBe(false);
    // A picture nobody asked for (not in the manifest) is not requested and does not hold the wait.
    await bank.whenReady(['/a/unlisted.png'], 1000);
    expect(load).toHaveBeenCalledTimes(2);
    slow.resolve(fakeTex());
    await tick();
    expect(bank.has('/a/slow.png')).toBe(true);
  });
});

describe('TextureBank retries (plan 8c)', () => {
  it('asks again for a picture that failed, on the next wait that needs it, after a backoff that doubles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 0;
    let fails = 2;
    const load = vi.fn(async () => { if (fails-- > 0) throw new Error('blip'); return fakeTex(); });
    const bank = new TextureBank(load, 1000, () => now);
    await bank.preload(['/a/x.png']);
    expect(bank.has('/a/x.png')).toBe(false);
    await bank.whenReady(['/a/x.png'], 20);
    expect(load).toHaveBeenCalledTimes(1);   // still inside the first backoff
    now = 1000;
    await bank.whenReady(['/a/x.png'], 20);
    expect(load).toHaveBeenCalledTimes(2);   // asked again; it failed again
    now = 2500;
    await bank.whenReady(['/a/x.png'], 20);
    expect(load).toHaveBeenCalledTimes(2);   // the backoff doubled: 2000 after the second failure
    now = 3000;
    await bank.whenReady(['/a/x.png'], 20);
    expect(load).toHaveBeenCalledTimes(3);
    expect(bank.has('/a/x.png')).toBe(true);
    // A picture never asked for is still never requested.
    await bank.whenReady(['/a/never.png'], 20);
    expect(load).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
