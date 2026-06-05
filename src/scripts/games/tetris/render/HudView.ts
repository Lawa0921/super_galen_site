import { Container, Sprite, Text, type Texture, type TextStyleOptions } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { GameState, PieceType } from '../engine/types';
import { SHAPES } from '../engine/constants';
import { pieceTint, type Point } from './layout';

const PIXEL_FONT = '"Press Start 2P", Consolas, monospace';
const LABEL_STYLE: TextStyleOptions = {
  fontFamily: PIXEL_FONT,
  fontSize: 9,
  fill: 0x6fa8d8,
  letterSpacing: 1,
};
const VALUE_STYLE: TextStyleOptions = {
  fontFamily: PIXEL_FONT,
  fontSize: 14,
  fill: 0xffffff,
};

/** 繪製 HOLD / NEXT / SCORE / LEVEL / LINES / COMBO。 */
export class HudView {
  private root = new Container();
  private holdSlot = new Container();
  private nextSlots: Container[] = [];
  private score = new Text({ text: '0', style: VALUE_STYLE });
  private level = new Text({ text: '1', style: VALUE_STYLE });
  private lines = new Text({ text: '0', style: VALUE_STYLE });
  private combo = new Text({ text: '', style: { ...VALUE_STYLE, fill: 0xffd23f } });
  private cellSize = 24;

  constructor(
    hudLayer: Container,
    private blockTex: Texture,
    private nextCount = 3,
  ) {
    hudLayer.addChild(this.root);
    this.root.filters = [new GlowFilter({ color: 0x36e6ff, outerStrength: 1.1, innerStrength: 0, distance: 8 })];

    this.root.addChild(this.holdSlot);
    for (let i = 0; i < this.nextCount; i++) {
      const c = new Container();
      this.nextSlots.push(c);
      this.root.addChild(c);
    }

    this.addLabeled('HOLD', this.holdSlotLabel);
    this.root.addChild(
      this.label('NEXT', this.nextLabel),
      this.label('SCORE', this.scoreLabel),
      this.score,
      this.label('LEVEL', this.levelLabel),
      this.level,
      this.label('LINES', this.linesLabel),
      this.lines,
      this.combo,
    );
  }

  // 標籤 Text 物件（位置於 setLayout 設定）
  private holdSlotLabel = new Text({ text: 'HOLD', style: LABEL_STYLE });
  private nextLabel = new Text({ text: 'NEXT', style: LABEL_STYLE });
  private scoreLabel = new Text({ text: 'SCORE', style: LABEL_STYLE });
  private levelLabel = new Text({ text: 'LEVEL', style: LABEL_STYLE });
  private linesLabel = new Text({ text: 'LINES', style: LABEL_STYLE });

  private label(_text: string, t: Text): Text {
    return t;
  }
  private addLabeled(_t: string, label: Text): void {
    this.root.addChild(label);
  }

  /** anchor = HUD 欄左上角；cellSize 決定縮放。 */
  setLayout(anchor: Point, cellSize: number): void {
    this.cellSize = cellSize;
    const x = anchor.x;
    let y = anchor.y;
    const gap = cellSize * 0.5;
    const slotH = cellSize * 2.4;

    this.holdSlotLabel.position.set(x, y);
    this.holdSlot.position.set(x, y + 18);
    y += 18 + slotH + gap;

    this.nextLabel.position.set(x, y);
    y += 18;
    for (const c of this.nextSlots) {
      c.position.set(x, y);
      y += slotH * 0.78;
    }
    y += gap;

    this.scoreLabel.position.set(x, y); this.score.position.set(x, y + 16); y += 16 + 28 + gap;
    this.levelLabel.position.set(x, y); this.level.position.set(x, y + 16); y += 16 + 28 + gap;
    this.linesLabel.position.set(x, y); this.lines.position.set(x, y + 16); y += 16 + 28 + gap;
    this.combo.position.set(x, y);
  }

  private renderPiece(slot: Container, type: PieceType | null): void {
    slot.removeChildren();
    if (!type) return;
    const mini = this.cellSize * 0.55;
    const cells = SHAPES[type][0];
    const tint = pieceTint(type);
    for (const c of cells) {
      const s = new Sprite(this.blockTex);
      s.width = mini * 0.96;
      s.height = mini * 0.96;
      s.blendMode = 'add';
      s.tint = tint;
      s.x = c.x * mini;
      s.y = c.y * mini;
      slot.addChild(s);
    }
  }

  render(state: GameState): void {
    this.renderPiece(this.holdSlot, state.hold);
    for (let i = 0; i < this.nextSlots.length; i++) {
      this.renderPiece(this.nextSlots[i], state.next[i] ?? null);
    }
    this.score.text = String(state.score);
    this.level.text = String(state.level);
    this.lines.text = String(state.lines);
    this.combo.text = state.combo > 0 ? `${state.combo} COMBO` : '';
  }
}
