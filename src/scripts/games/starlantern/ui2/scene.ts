import type { Game } from '../engine/game';
import type { SoundManager } from '../audio/SoundManager';
import type { ArtIndex } from '../render/textures';
import type { UiAction } from './input';

export type SceneName = 'title' | 'town';
export interface Scene { enter(root: HTMLElement): void; exit(): void; onAction(a: UiAction): void }
export interface SceneCtx {
  game: Game; art: ArtIndex; sfx: Pick<SoundManager, 'cursor' | 'confirm' | 'cancel' | 'error'>;
  go(name: SceneName): void; hasSave(): boolean; newGame(): void;
}

/** One scene at a time; fades out and in, and drops input while switching so held keys cannot skip a screen. */
export class Router {
  private scene: Scene | null = null;
  private name: SceneName | null = null;
  private switching = false;

  constructor(private root: HTMLElement, private make: (name: SceneName, ctx: SceneCtx) => Scene, private ctx: Omit<SceneCtx, 'go'>, private fadeMs = 300) {}

  current(): SceneName | null { return this.name; }

  async go(name: SceneName): Promise<void> {
    this.switching = true;
    this.root.classList.add('slx-fade');
    await this.wait();
    this.scene?.exit();
    this.root.replaceChildren();
    this.scene = this.make(name, { ...this.ctx, go: (n) => { void this.go(n); } });
    this.name = name;
    this.scene.enter(this.root);
    this.root.classList.remove('slx-fade');
    await this.wait();
    this.switching = false;
  }

  onAction(a: UiAction): void {
    if (!this.switching) this.scene?.onAction(a);
  }

  private wait(): Promise<void> {
    return this.fadeMs > 0 ? new Promise((r) => setTimeout(r, this.fadeMs / 2)) : Promise.resolve();
  }
}
