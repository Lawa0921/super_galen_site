import { Application, Container, Sprite, type Texture } from 'pixi.js';
import { AdvancedBloomFilter, CRTFilter } from 'pixi-filters';

/**
 * 包裝 Pixi Application 與圖層。
 * stage → [ bgLayer（固定，不隨震屏）, content[ playLayer, fxLayer, hudLayer ] ]
 * CRT 套在整個 stage；震屏只晃 content（避免露出背景邊界）。
 */
export class PixiStage {
  readonly app: Application;
  readonly bgLayer = new Container();
  readonly content = new Container();
  readonly playLayer = new Container();
  readonly fxLayer = new Container();
  readonly hudLayer = new Container();

  private bgSprite: Sprite | null = null;
  private crt: CRTFilter;
  private shakeMag = 0;

  private constructor(app: Application) {
    this.app = app;
    app.stage.addChild(this.bgLayer, this.content);
    this.content.addChild(this.playLayer, this.fxLayer, this.hudLayer);

    // bloom 收斂：保留霓虹光暈但讓像素硬邊清楚
    this.playLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.55, bloomScale: 0.4, brightness: 1.0, blur: 3, quality: 4 }),
    ];
    this.fxLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.3, bloomScale: 1.1, brightness: 1.0, blur: 7, quality: 4 }),
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

  /** 觸發震屏（取最大值，逐幀衰減）。 */
  shake(px: number): void {
    this.shakeMag = Math.max(this.shakeMag, px);
  }

  /** 每幀推進 CRT 動畫與震屏衰減。 */
  update(dtMs: number): void {
    this.crt.time += dtMs * 0.0006;
    this.crt.seed = (this.crt.seed + dtMs * 0.0003) % 1;

    if (this.shakeMag > 0.4) {
      this.content.x = (Math.random() * 2 - 1) * this.shakeMag;
      this.content.y = (Math.random() * 2 - 1) * this.shakeMag;
      this.shakeMag *= Math.pow(0.0025, dtMs / 1000); // ~ 在數百毫秒內衰減
    } else {
      this.shakeMag = 0;
      this.content.position.set(0, 0);
    }
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
