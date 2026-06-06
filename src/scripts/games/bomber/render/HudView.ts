import { Container, Text, TextStyle, Graphics } from 'pixi.js';
import type { BomberState } from '../engine/types';

const FONT_FAMILY = '"Press Start 2P", Consolas, monospace';

/** HUD 頂部列：FLOOR、命數（♥×n）、SCORE、道具指示器。 */
export class HudView {
  private container = new Container();
  private bg = new Graphics();
  private floorText: Text;
  private livesText: Text;
  private scoreText: Text;
  private powerText: Text;
  private stageW = 800;

  constructor(private layer: Container) {
    const style = (size: number, color = 0xeafdff) =>
      new TextStyle({
        fontFamily: FONT_FAMILY,
        fontSize: size,
        fill: color,
        letterSpacing: 1,
      });

    this.floorText = new Text({ text: 'FLOOR 1', style: style(11, 0x36e6ff) });
    this.livesText = new Text({ text: '♥ ♥ ♥', style: style(11, 0xff4d6d) });
    this.scoreText = new Text({ text: 'SCORE 0', style: style(10, 0xffd23f) });
    this.powerText = new Text({ text: '', style: style(9, 0xc15cff) });

    this.container.addChild(this.bg, this.floorText, this.livesText, this.scoreText, this.powerText);
    layer.addChild(this.container);
  }

  /** 設定畫面寬（用於橫向佈局）。 */
  setLayout(w: number): void {
    this.stageW = w;
    this.relayout();
  }

  render(state: BomberState): void {
    const { player, floor, score } = state;

    this.floorText.text = `FLOOR ${floor}`;
    this.livesText.text = '♥ '.repeat(Math.max(0, player.lives)).trim();
    this.scoreText.text = `SCORE ${score}`;

    // 道具指示器：火力 / 炸彈 / 速度 / 護盾
    const parts: string[] = [];
    if (player.fireRange > 1) parts.push(`F${player.fireRange}`);
    if (player.maxBombs > 1) parts.push(`B${player.maxBombs}`);
    if (player.speedLevel > 0) parts.push(`S${player.speedLevel}`);
    if (player.shield) parts.push('SH');
    this.powerText.text = parts.join(' ');
  }

  private relayout(): void {
    const w = this.stageW;
    const h = 48;

    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill({ color: 0x04060d, alpha: 0.85 });
    this.bg.rect(0, h - 1, w, 1).fill({ color: 0x36e6ff, alpha: 0.2 });

    const vMid = h / 2;

    this.floorText.x = Math.round(w * 0.30);
    this.floorText.y = vMid - this.floorText.height / 2;

    this.scoreText.x = Math.round(w * 0.4);
    this.scoreText.y = vMid - this.scoreText.height / 2;

    this.livesText.x = Math.round(w * 0.68);
    this.livesText.y = vMid - this.livesText.height / 2;

    this.powerText.x = Math.round(w - 160);
    this.powerText.y = vMid - this.powerText.height / 2;
  }

  /** 在 render 後、每次 stage resize 時呼叫。 */
  onResize(w: number): void {
    this.setLayout(w);
  }
}
