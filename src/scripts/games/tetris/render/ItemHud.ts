import { Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { SkillId } from '../engine/run';
import type { Point } from './layout';

const PIXEL_FONT = '"Press Start 2P", Consolas, monospace';
/** 充能中能量條色（同 HUD 主色調） */
const BAR_COLOR = 0x36e6ff;
/** 滿能量（可發動）色 */
const READY_COLOR = 0x4dff88;
/** 滿能量發光脈動週期（ms → 角速度除數） */
const PULSE_PERIOD_DIV = 160;

/**
 * 道具能量 HUD（Phase 4 T7）：垂直能量條＋技能槽（圖示＋ [V] 鍵提示）。
 * 無帶技能時呼叫端不建立此元件。能量值由呼叫端每幀餵入（render）。
 */
export class ItemHud {
  private root = new Container();
  private frame = new Graphics();
  private fill = new Graphics();
  private icon: Sprite;
  private keyHint: Text;
  private glow: GlowFilter;
  private anchor: Point = { x: 0, y: 0 };
  private cellSize = 24;
  private pulseT = 0;
  private lastRatio = -1;
  private lastReady: boolean | null = null;

  /** 載入技能圖示貼圖後建構（icons/skill-{id}.webp）。 */
  static async create(hudLayer: Container, skill: SkillId, barCells = 4.5): Promise<ItemHud> {
    const tex = (await Assets.load(`/assets/games/tetris/icons/skill-${skill}.webp`)) as Texture;
    return new ItemHud(hudLayer, tex, barCells);
  }

  constructor(
    hudLayer: Container,
    iconTex: Texture,
    /** 能量條高度（格數）：SOLO 側欄空間大用 4.5，vs-AI HUD 欄較擠可調小 */
    private barCells = 4.5,
  ) {
    this.glow = new GlowFilter({ color: BAR_COLOR, outerStrength: 1.1, innerStrength: 0, distance: 8 });
    this.root.filters = [this.glow];
    this.icon = new Sprite(iconTex);
    this.icon.alpha = 0.45;
    this.keyHint = new Text({
      text: '[V]',
      style: { fontFamily: PIXEL_FONT, fontSize: 9, fill: 0x6fa8d8, letterSpacing: 1 },
    });
    this.keyHint.anchor.set(0.5, 0); // 置中對齊用 anchor，避免依賴同步測字
    this.root.addChild(this.frame, this.fill, this.icon, this.keyHint);
    hudLayer.addChild(this.root);
  }

  /** anchor = 能量條左上角（呼叫端放在 HOLD 下方／旁）。 */
  setLayout(anchor: Point, cellSize: number): void {
    this.anchor = anchor;
    this.cellSize = cellSize;
    const barW = this.barW();
    const barH = this.barH();
    this.frame.clear();
    this.frame.roundRect(anchor.x, anchor.y, barW, barH, barW * 0.3);
    this.frame.stroke({ width: Math.max(1.5, cellSize * 0.07), color: 0x6fa8d8, alpha: 0.9 });

    const iconSize = cellSize * 1.5;
    this.icon.width = iconSize;
    this.icon.height = iconSize;
    this.icon.position.set(anchor.x + barW / 2 - iconSize / 2, anchor.y + barH + cellSize * 0.4);
    this.keyHint.style.fontSize = Math.max(9, Math.round(cellSize * 0.3));
    this.keyHint.position.set(anchor.x + barW / 2, anchor.y + barH + cellSize * 0.6 + iconSize);
    this.lastRatio = -1; // 版面變更 → 強制重繪填充
  }

  /** 每幀呼叫：energy/required 畫填充比例、ready 切換配色＋發光脈動。 */
  render(energy: number, required: number, ready: boolean, dt: number): void {
    this.pulseT += dt;
    const ratio = Math.max(0, Math.min(1, energy / Math.max(1, required)));
    if (ratio !== this.lastRatio || ready !== this.lastReady) {
      this.lastRatio = ratio;
      this.lastReady = ready;
      const barW = this.barW();
      const barH = this.barH();
      const inset = Math.max(2, this.cellSize * 0.12);
      const innerW = barW - inset * 2;
      const innerH = (barH - inset * 2) * ratio;
      this.fill.clear();
      if (innerH > 0.5) {
        this.fill.roundRect(
          this.anchor.x + inset,
          this.anchor.y + barH - inset - innerH, // 由下往上填
          innerW,
          innerH,
          innerW * 0.3,
        );
        this.fill.fill({ color: ready ? READY_COLOR : BAR_COLOR, alpha: 0.95 });
      }
      this.glow.color = ready ? READY_COLOR : BAR_COLOR;
      this.icon.alpha = ready ? 1 : 0.45;
      this.keyHint.style.fill = ready ? READY_COLOR : 0x6fa8d8;
    }
    // 滿能量：發光強度脈動（每幀更新 filter 即可，不需重繪幾何）
    this.glow.outerStrength = ready ? 1.6 + Math.sin(this.pulseT / PULSE_PERIOD_DIV) * 0.8 : 1.1;
  }

  destroy(): void {
    this.root.parent?.removeChild(this.root);
    this.root.destroy({ children: true });
  }

  private barW(): number {
    return this.cellSize * 0.62;
  }
  private barH(): number {
    return this.cellSize * this.barCells;
  }
}
