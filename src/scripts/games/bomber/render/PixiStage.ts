import { Application, Container } from 'pixi.js';
import { AdvancedBloomFilter, CRTFilter } from 'pixi-filters';

/**
 * 包裝 Pixi Application 與圖層。
 * stage → [ bgLayer（固定，不隨震屏）, content[ gridLayer, entityLayer, fxLayer, hudLayer ] ]
 * CRT 套在整個 stage；震屏只晃 content（避免露出背景邊界）。
 * gridLayer 無 bloom（保持像素銳利）；entityLayer 輕柔 bloom；fxLayer 強 bloom。
 */
export class PixiStage {
  readonly app: Application;
  readonly bgLayer = new Container();
  readonly content = new Container();
  readonly gridLayer = new Container();   // 地板/牆/箱子 — 無 bloom，保持銳利
  readonly entityLayer = new Container(); // 玩家/敵人/炸彈/道具 — 輕柔 bloom
  readonly fxLayer = new Container();     // 爆風/粒子 — 強 bloom
  readonly hudLayer = new Container();    // HUD — 無 bloom

  private crt: CRTFilter;
  private shakeMag = 0;

  private constructor(app: Application) {
    this.app = app;
    app.stage.addChild(this.bgLayer, this.content);
    this.content.addChild(this.gridLayer, this.entityLayer, this.fxLayer, this.hudLayer);

    // gridLayer 無 bloom（確保格子硬邊清晰）
    // entityLayer：輕柔霓虹感，讓角色帶點發光
    this.entityLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.6, bloomScale: 0.3, brightness: 1.0, blur: 2, quality: 4 }),
    ];
    // fxLayer：強爆發感，爆風效果強烈
    this.fxLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.3, bloomScale: 1.0, brightness: 1.0, blur: 6, quality: 4 }),
    ];

    // 全畫面 CRT：掃描線 + 微曲率 + 暗角（街機科技感，保持克制以利閱讀）
    this.crt = new CRTFilter({
      curvature: 1.0,
      lineWidth: 2.0,
      lineContrast: 0.14,
      noise: 0.05,
      noiseSize: 1.1,
      vignetting: 0.28,
      vignettingAlpha: 0.45,
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
      background: '#06070f',
      antialias: false, // 像素地城風格：關掉抗鋸齒讓像素硬邊
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
  shake(mag: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  /** 每幀推進 CRT 動畫與震屏衰減。 */
  update(dt: number): void {
    this.crt.time += dt * 0.0006;
    this.crt.seed = (this.crt.seed + dt * 0.0003) % 1;

    if (this.shakeMag > 0.1) {
      this.content.x = (Math.random() - 0.5) * this.shakeMag;
      this.content.y = (Math.random() - 0.5) * this.shakeMag;
      this.shakeMag *= Math.pow(0.001, dt / 1000);
    } else {
      this.shakeMag = 0;
      this.content.x = 0;
      this.content.y = 0;
    }
  }
}
