import type { Game } from '../engine/game';
import type { SoundManager } from '../audio/SoundManager';
import type { ArtIndex } from '../render/textures';
import type { UiAction } from './input';
import type { SettingsStore } from './settings';
import type { Stage } from './stage';

export type SceneName = 'title' | 'town' | 'guild' | 'shop' | 'inn' | 'gate' | 'dungeon' | 'battle' | 'clear' | 'settings'
  | 'formation' | 'status' | 'equip';
export interface Scene { enter(root: HTMLElement): void; exit(): void; onAction(a: UiAction): void }
export interface SceneCtx {
  game: Game; art: ArtIndex;
  /** Menu cues are required; game cues are optional so menu-only tests can pass a small fake. */
  sfx: Pick<SoundManager, 'cursor' | 'confirm' | 'cancel' | 'error'> & Partial<Pick<SoundManager, 'bump' | 'step' | 'stairs' | 'chest' | 'encounter' | 'hit' | 'weak' | 'heal' | 'ko' | 'win' | 'lose' | 'ultimate' | 'menu'>>;
  /** `arg` hands the next scene one value, e.g. which member the status screen opens on. */
  go(name: SceneName, arg?: string): void; hasSave(): boolean; newGame(): void;
  /** Reload the saved game (title → 繼續); absent in tests that never continue. */
  continueGame?(): void;
  /** The Pixi layer; null when the renderer could not start (tests, no WebGL). */
  stage?: Stage | null;
  /** Skip animations and pauses (tests: ?fast=1). */
  fast?: boolean;
  /** Player settings (volume, text speed); absent in tests means defaults. */
  settings?: SettingsStore | null;
  /** The scene shown before this one, so settings can return to it. */
  from?: SceneName;
  arg?: string;
  fullscreen?(): Promise<void> | void;
}

/** One scene at a time; fades out and in, and drops input while switching so held keys cannot skip a screen. */
export class Router {
  private scene: Scene | null = null;
  private name: SceneName | null = null;
  private switching = false;

  constructor(private root: HTMLElement, private make: (name: SceneName, ctx: SceneCtx) => Scene, private ctx: Omit<SceneCtx, 'go'>, private fadeMs = 300) {}

  current(): SceneName | null { return this.name; }

  async go(name: SceneName, arg?: string): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    this.root.setAttribute('inert', '');
    this.root.classList.add('slx-fade');
    await this.wait();
    this.scene?.exit();
    this.root.replaceChildren();
    this.scene = this.make(name, { ...this.ctx, from: this.name ?? undefined, arg, go: (n, a) => { void this.go(n, a); } });
    this.name = name;
    this.scene.enter(this.root);
    // Input is dropped only while the old scene fades out; once the new one is on screen it responds during its fade-in.
    this.root.classList.remove('slx-fade');
    this.root.removeAttribute('inert');
    this.switching = false;
    await this.wait();
  }

  onAction(a: UiAction): void {
    if (!this.switching) this.scene?.onAction(a);
  }

  private wait(): Promise<void> {
    return this.fadeMs > 0 ? new Promise((r) => setTimeout(r, this.fadeMs / 2)) : Promise.resolve();
  }
}
