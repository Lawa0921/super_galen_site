import { afterEach, describe, expect, it, vi } from 'vitest';
import { HalfFloatType, LinearFilter, LinearSRGBColorSpace } from 'three';
import { fetchAssetBytes, parseSkyTexture } from './asset-download';

afterEach(() => vi.unstubAllGlobals());

describe('owned asset downloads', () => {
  it('downloads exact bytes with increasing progress and the owners signal', async () => {
    const signal = new AbortController().signal, progress = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3])); controller.close();
    } }));
    const fetch = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetch);
    expect(new Uint8Array(await fetchAssetBytes('/model.glb', signal, progress))).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetch).toHaveBeenCalledWith('/model.glb', { signal });
    expect(progress.mock.calls).toEqual([[2], [3]]);
    expect(response.body!.locked).toBe(false);
  });

  it('rejects an unfinished read on abort and releases the reader even if fetch does not', async () => {
    const controller = new AbortController(), cancel = vi.fn(), progress = vi.fn();
    const response = new Response(new ReadableStream({ start(stream) { stream.enqueue(new Uint8Array([1])); }, cancel }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const loading = fetchAssetBytes('/model.glb', controller.signal, progress);
    const reason = new DOMException('Asset loading stalled', 'TimeoutError');
    const rejected = expect(loading).rejects.toBe(reason);
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith(1));
    controller.abort(reason); await rejected;
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason);
    expect(response.body!.locked).toBe(false);
  });

  it('does not fetch an already cancelled request', async () => {
    const controller = new AbortController(), fetch = vi.fn(); controller.abort(); vi.stubGlobal('fetch', fetch);
    await expect(fetchAssetBytes('/model.glb', controller.signal, vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects HTTP errors and cancels their unused body', async () => {
    const cancel = vi.fn(), progress = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 503 })));
    await expect(fetchAssetBytes('/model.glb', new AbortController().signal, progress)).rejects.toThrow('503');
    expect(cancel).toHaveBeenCalledOnce(); expect(progress).not.toHaveBeenCalled();
  });

  it('preserves a transport failure and unlocks its reader', async () => {
    const reason = new Error('connection lost');
    const response = new Response(new ReadableStream({ start(controller) { controller.error(reason); } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(fetchAssetBytes('/model.glb', new AbortController().signal, vi.fn())).rejects.toBe(reason);
    expect(response.body!.locked).toBe(false);
  });
});

describe('HDR sky decoding', () => {
  it('preserves HDRLoader texture upload settings and half-float pixels', () => {
    const header = new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n');
    const bytes = new Uint8Array(header.length + 4); bytes.set(header); bytes.set([255, 128, 64, 128], header.length);
    const texture = parseSkyTexture(bytes.buffer);
    try {
      expect(texture.image.width).toBe(1); expect(texture.image.height).toBe(1);
      expect(texture.image.data).toEqual(new Uint16Array([15360, 14340, 13316, 15360]));
      expect(texture.type).toBe(HalfFloatType); expect(texture.colorSpace).toBe(LinearSRGBColorSpace);
      expect(texture.minFilter).toBe(LinearFilter); expect(texture.magFilter).toBe(LinearFilter);
      expect(texture.flipY).toBe(true); expect(texture.generateMipmaps).toBe(false);
      expect(texture.version).toBe(1);
    } finally { texture.dispose(); }
  });

  it('rejects malformed HDR data before creating a texture', () => {
    expect(() => parseSkyTexture(new Uint8Array([1, 2, 3]).buffer)).toThrow();
  });
});
