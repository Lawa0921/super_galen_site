import { DataTexture, LinearFilter, LinearSRGBColorSpace, RGBAFormat } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Keep cancellation owned by the renderer throughout the body read. Three's
// short-lived FileLoader composite signal can be collected by WebKit while a
// response is still pending. Explicit reader cancellation also drops the body.
export async function fetchAssetBytes(url: string, signal: AbortSignal, progress: (bytes: number) => void): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error(`Asset request failed: ${response.status} (${url})`);
  }
  if (!response.body) throw new Error(`Asset response has no body (${url})`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let loaded = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      chunks.push(value); loaded += value.byteLength; progress(loaded);
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel); reader.releaseLock(); chunks.length = 0;
  }
}

// Match HDRLoader.load's texture settings while decoding an already owned body.
export function parseSkyTexture(buffer: ArrayBuffer): DataTexture {
  const data = new HDRLoader().parse(buffer);
  const texture = new DataTexture(data.data, data.width, data.height, RGBAFormat, data.type);
  texture.colorSpace = LinearSRGBColorSpace;
  texture.minFilter = LinearFilter; texture.magFilter = LinearFilter;
  texture.generateMipmaps = false; texture.flipY = true; texture.needsUpdate = true;
  return texture;
}
