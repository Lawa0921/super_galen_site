import { Application, Container } from 'pixi.js';
import { AdvancedBloomFilter, CRTFilter } from 'pixi-filters';

/**
 * 包裝 Pixi Application 與圖層。
 * stage → [ bgLayer（捲動背景）, content[ entityLayer, bulletLayer, fxLayer, hudLayer ] ]
 * bulletLayer 無濾鏡（彈幕數量大、保持銳利與效能）；entityLayer 輕柔 bloom；fxLayer 強 bloom。
 * CRT 套在整個 stage；震屏只晃 content（避免露出背景邊界）。
 */
export class PixiStage {
  readonly app: Application;
  readonly bgLayer = new Container();
  readonly content = new Container();
  readonly entityLayer = new Container(); // 自機/敵機/Boss/金幣 — 輕柔 bloom
  readonly bulletLayer = new Container(); // 子彈 — 無 bloom（效能 + 保持銳利）
  readonly fxLayer = new Container();     // 特效/爆風 — 強 bloom
  readonly hudLayer = new Container();    // HUD — 無 bloom

  /** content 的場域置中基準偏移（relayout 設定）；震屏以此為中心晃動。 */
  baseX = 0;
  baseY = 0;

  private crt: CRTFilter;
  private shakeMag = 0;

  private constructor(app: Application) {
    this.app = app;
    app.stage.addChild(this.bgLayer, this.content);
    this.content.addChild(this.entityLayer, this.bulletLayer, this.fxLayer, this.hudLayer);

    // entityLayer：輕柔霓虹感，讓角色帶點發光
    this.entityLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.6, bloomScale: 0.3, brightness: 1.0, blur: 2, quality: 4 }),
    ];
    // bulletLayer 不套任何 filter（彈幕量大、保效能、保銳利）

    // fxLayer：強 bloom — 爆炎/衝擊波特效
    this.fxLayer.filters = [
      new AdvancedBloomFilter({ threshold: 0.45, bloomScale: 0.45, brightness: 1.0, blur: 3, quality: 4 }),
    ];

    // 全畫面 CRT：掃描線 + 微曲率 + 暗角
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
      background: '#0a0716',
      antialias: false,
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
      this.content.x = this.baseX + (Math.random() - 0.5) * this.shakeMag;
      this.content.y = this.baseY + (Math.random() - 0.5) * this.shakeMag;
      this.shakeMag *= Math.pow(0.001, dt / 1000);
    } else {
      this.shakeMag = 0;
      this.content.x = this.baseX;
      this.content.y = this.baseY;
    }
  }
}
