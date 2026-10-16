import { Application } from 'pixi.js';

export async function createApp(canvas: HTMLCanvasElement): Promise<Application> {
  const app = new Application();
  await app.init({
    canvas, resizeTo: canvas.parentElement ?? window, background: '#0d0f1a', antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
  });
  return app;
}

/** Fixed-size renderer for the game screen: the page scales the whole screen, so the canvas never resizes. */
export async function createFixedApp(canvas: HTMLCanvasElement, width: number, height: number): Promise<Application> {
  const app = new Application();
  await app.init({ canvas, width, height, background: '#05060c', antialias: false, resolution: 1, autoDensity: false });
  return app;
}
