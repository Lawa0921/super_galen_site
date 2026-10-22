import { Assets, type Texture } from 'pixi.js';
import { MANIFEST_URL, parseManifest } from './artPaths';

/**
 * What the screens may ask of the art: whether a picture is here; optionally, to wait a while for pictures already on
 * their way (`whenReady`), and to hear when a late one lands (`onLoad`) so it can be drawn then (no placeholder art).
 */
export interface ArtIndex {
  has(url: string): boolean;
  whenReady?(urls: readonly string[], ms: number): Promise<void>;
  onLoad?(fn: (url: string) => void): () => void;
}
export const NO_ART: ArtIndex = { has: () => false };

export class TextureBank implements ArtIndex {
  private textures = new Map<string, Texture>();
  /** Each request once, kept until it settles: a picture that lands after the timeout is still taken. */
  private inflight = new Map<string, Promise<Texture | null>>();
  private listeners = new Set<(url: string) => void>();
  /** Requests that failed: when, and how many times in a row. The next wait that needs one asks again after a backoff. */
  private failed = new Map<string, { at: number; tries: number }>();

  constructor(
    private load: (url: string) => Promise<Texture> = (u) => Assets.load<Texture>(u),
    /** `preload` stops waiting for a request after this time; the request itself goes on and lands when it can. */
    private timeoutMs = 8000,
    private now: () => number = () => Date.now(),
  ) {}

  /** The wait before asking again after `tries` failures in a row: 1 s, doubling, at most 30 s. */
  static retryMs(tries: number): number {
    return Math.min(30_000, 1000 * 2 ** (tries - 1));
  }

  private request(u: string): Promise<Texture | null> {
    let p = this.inflight.get(u);
    if (!p) {
      p = this.load(u).then((t) => {
        t.source.scaleMode = 'nearest';
        this.textures.set(u, t);
        this.failed.delete(u);
        for (const fn of this.listeners) fn(u);
        return t;
      }, (err: unknown) => {
        console.warn('[starlantern] art failed to load; nothing is drawn in its place (asked again later)', u, err);
        this.failed.set(u, { at: this.now(), tries: (this.failed.get(u)?.tries ?? 0) + 1 });
        this.inflight.delete(u);
        return null;
      });
      this.inflight.set(u, p);
    }
    return p;
  }

  async preload(urls: Iterable<string>): Promise<void> {
    await Promise.all([...urls].map(async (u) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = await Promise.race([
        this.request(u).then(() => false),
        new Promise<boolean>((r) => { timer = setTimeout(() => r(true), this.timeoutMs); }),
      ]).finally(() => clearTimeout(timer));
      if (late) console.warn(`[starlantern] art still loading after ${this.timeoutMs} ms; it is drawn when it lands`, u);
    }));
  }

  /**
   * Waits for those of `urls` already requested to settle, `ms` at most. A picture whose request failed is asked again
   * once its backoff has passed (a network blip does not lose it for the session). Starts no other request: a picture
   * the manifest does not list is never asked for, so it neither holds the wait nor costs a 404.
   */
  async whenReady(urls: readonly string[], ms: number): Promise<void> {
    for (const u of urls) {
      const f = this.failed.get(u);
      if (f && !this.inflight.has(u) && this.now() - f.at >= TextureBank.retryMs(f.tries)) void this.request(u);
    }
    const waits = urls.flatMap((u) => (this.textures.has(u) ? [] : this.inflight.get(u) ?? []));
    if (!waits.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.all(waits), new Promise((r) => { timer = setTimeout(r, ms); })]).finally(() => clearTimeout(timer));
  }

  /** Calls `fn` with each picture's url as it lands; returns the unsubscribe. */
  onLoad(fn: (url: string) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
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
