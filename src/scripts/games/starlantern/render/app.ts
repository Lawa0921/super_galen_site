import { Application } from 'pixi.js';

export async function createApp(canvas: HTMLCanvasElement): Promise<Application> {
  const app = new Application();
  await app.init({
    canvas, resizeTo: canvas.parentElement ?? window, background: '#0d0f1a', antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
  });
  return app;
}
