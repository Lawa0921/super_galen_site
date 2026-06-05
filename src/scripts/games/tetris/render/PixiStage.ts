import { Application, Container, Sprite, type Texture } from 'pixi.js';
import { AdvancedBloomFilter, CRTFilter } from 'pixi-filters';

/**
 * 包裝 Pixi Application 與圖層。
 * 圖層由下到上：bgLayer（背景，不發光）→ playLayer（盤面/方塊，套 bloom）
 * → fxLayer（特效，套較強 bloom）→ hudLayer（HUD，套輕 bloom）。
 */
export class PixiStage {
  readonly app: Application;
  readonly bgLayer = new Container();
  readonly playLayer = new Container();
  readonly fxLayer = new Container();
  readonly hudLayer = new Container();

  private bgSprite: Sprite | null = null;
  private crt: CRTFilter;

  private constructor(app: Application) {
    this.app = app;
    app.stage.addChild(this.bgLayer, this.playLayer, this.fxLayer, this.hudLayer);

    // bloom 收斂：保留霓虹光暈但讓像素硬邊清楚
    this.playLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.55, bloomScale: 0.4, brightness: 1.0, blur: 3, quality: 4 }),
    ];
    this.fxLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.4, bloomScale: 0.9, brightness: 1.0, blur: 6, quality: 4 }),
    ];
    this.hudLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.55, bloomScale: 0.3, brightness: 1.0, blur: 2, quality: 4 }),
    ];

    // 全畫面 CRT：掃描線 + 微曲率 + 暗角 + 雜訊（街機科技感，保持克制以利閱讀）
    this.crt = new CRTFilter({
      curvature: 1.2,
      lineWidth: 2.2,
      lineContrast: 0.18,
      noise: 0.06,
      noiseSize: 1.1,
      vignetting: 0.32,
      vignettingAlpha: 0.5,
      vignettingBlur: 0.3,
      time: 0,
    });
    app.stage.filters = [this.crt];
  }

  /** 每幀推進 CRT 動畫（掃描線/雜訊微閃）。 */
  update(dtMs: number): void {
    this.crt.time += dtMs * 0.0006;
    this.crt.seed = (this.crt.seed + dtMs * 0.0003) % 1;
  }

  static async create(canvas: HTMLCanvasElement): Promise<PixiStage> {
    const app = new Application();
    await app.init({
      canvas,
      resizeTo: canvas.parentElement ?? window,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    return new PixiStage(app);
  }

  get width(): number {
    return this.app.screen.width;
  }
  get height(): number {
    return this.app.screen.height;
  }

  setBackground(tex: Texture): void {
    if (this.bgSprite) this.bgSprite.destroy();
    this.bgSprite = new Sprite(tex);
    this.bgLayer.addChild(this.bgSprite);
    this.layoutBackground();
  }

  /** 背景以 cover 方式填滿畫面。 */
  layoutBackground(): void {
    const bg = this.bgSprite;
    if (!bg) return;
    const tw = bg.texture.width;
    const th = bg.texture.height;
    const scale = Math.max(this.width / tw, this.height / th);
    bg.scale.set(scale);
    bg.x = (this.width - tw * scale) / 2;
    bg.y = (this.height - th * scale) / 2;
  }
}
