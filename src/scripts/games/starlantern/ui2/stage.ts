import type { Application } from 'pixi.js';
import { createFixedApp } from '../render/app';
import { BattleView } from '../render/BattleView';
import { MapView } from '../render/MapView';
import type { TextureBank } from '../render/textures';

export const STAGE_W = 640;
export const STAGE_H = 360;

/**
 * The Pixi layer of the game screen: a fixed 640x360 canvas under the DOM windows, scaled with the screen by CSS to a whole
 * number of device pixels per stage pixel (legibility ruling 1: s·devicePixelRatio is whole, at 125% and 150% too).
 */
export class Stage {
  readonly mapView: MapView;
  readonly battleView: BattleView;
  private app: Promise<Application | null>;

  constructor(screen: HTMLElement, bank: TextureBank, fast: boolean, create: (c: HTMLCanvasElement) => Promise<Application> = (c) => createFixedApp(c, STAGE_W, STAGE_H)) {
    const canvas = document.createElement('canvas');
    canvas.id = 'sl-canvas';
    canvas.className = 'slx-canvas';
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;
    screen.insertBefore(canvas, screen.querySelector('#sl-ui'));
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mapView = new MapView(bank, calm);
    this.battleView = new BattleView(fast, bank, calm);
    this.show(null);
    this.app = create(canvas).then((app) => {
      app.stage.addChild(this.mapView.root, this.battleView.root);
      app.ticker.add((t) => this.mapView.update(t.deltaTime));
      return app;
    }).catch((err: unknown) => {
      console.error('[starlantern] renderer failed; the game stays playable without the canvas', err);
      return null;
    });
  }

  async ready(): Promise<boolean> {
    return (await this.app) !== null;
  }

  size(): { width: number; height: number } {
    return { width: STAGE_W, height: STAGE_H };
  }

  show(which: 'map' | 'battle' | null): void {
    this.mapView.root.visible = which === 'map';
    this.battleView.root.visible = which === 'battle';
  }
}
