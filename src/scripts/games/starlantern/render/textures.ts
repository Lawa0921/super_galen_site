import { Assets, type Texture } from 'pixi.js';
import { MANIFEST_URL, parseManifest } from './artPaths';

export interface ArtIndex { has(url: string): boolean }
export const NO_ART: ArtIndex = { has: () => false };

export class TextureBank implements ArtIndex {
  private textures = new Map<string, Texture>();

  constructor(private load: (url: string) => Promise<Texture> = (u) => Assets.load<Texture>(u)) {}

  async preload(urls: Iterable<string>): Promise<void> {
    await Promise.all([...urls].map(async (u) => {
      try {
        const t = await this.load(u);
        t.source.scaleMode = 'nearest';
        this.textures.set(u, t);
      } catch (err) {
        console.warn('[starlantern] art failed to load; using a placeholder', u, err);
      }
    }));
  }

  get(url: string): Texture | null { return this.textures.get(url) ?? null; }
  has(url: string): boolean { return this.textures.has(url); }
}

export async function loadManifest(fetchFn: typeof fetch = fetch): Promise<Set<string>> {
  try {
    const res = await fetchFn(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) return new Set();
    return parseManifest(await res.json());
  } catch {
    return new Set();
  }
}
