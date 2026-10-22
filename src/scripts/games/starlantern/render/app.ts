import { Application } from 'pixi.js';

/** Fixed-size renderer for the game screen: the page scales the whole screen, so the canvas never resizes. */
export async function createFixedApp(canvas: HTMLCanvasElement, width: number, height: number): Promise<Application> {
  const app = new Application();
  await app.init({ canvas, width, height, background: '#05060c', antialias: false, resolution: 1, autoDensity: false });
  return app;
}
