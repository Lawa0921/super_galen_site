import { Container, Graphics, Sprite, Text, type Texture, type TextStyleOptions } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { GameState, PieceType } from '../engine/types';
import { SHAPES } from '../engine/constants';
import { pieceTint, type Point } from './layout';

const PIXEL_FONT = '"Press Start 2P", Consolas, monospace';
/** G2 顯眼化：標籤由暗灰藍改霓虹青、字級加大，HOLD/NEXT 一眼可辨。 */
const LABEL_STYLE: TextStyleOptions = {
  fontFamily: PIXEL_FONT,
  fontSize: 11,
  fill: 0x36e6ff,
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
  /** HOLD / NEXT 細框背板（G2 顯眼化；風格同盤後 scrim：墨底＋霓虹細框）。 */
  private holdPlate = new Graphics();
  private nextPlate = new Graphics();
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

    this.root.addChild(this.holdPlate, this.nextPlate); // 背板先加 → 在槽位/文字後面
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

  /** 字級隨格大小縮放（HUD 在大盤面時也清楚可讀）。 */
  private applyScale(cellSize: number): void {
    const label = Math.max(11, Math.round(cellSize * 0.38)); // G2：標題字級 +2 檔
    const value = Math.max(14, Math.round(cellSize * 0.62));
    for (const t of [this.holdSlotLabel, this.nextLabel, this.scoreLabel, this.levelLabel, this.linesLabel]) {
      t.style.fontSize = label;
    }
    for (const t of [this.score, this.level, this.lines]) t.style.fontSize = value;
    this.combo.style.fontSize = Math.max(11, Math.round(cellSize * 0.4));
  }

  /**
   * 畫 HOLD / NEXT 背板（圓角墨底＋霓虹細框，風格同盤後 scrim）。
   * holdTop / nextTop 為各區標題左上角；nextH 為 NEXT 區內容高（標題之下）。
   */
  private drawPlates(holdTop: Point, nextTop: Point, cellSize: number): void {
    const pad = cellSize * 0.3;
    const w = cellSize * 3.1;
    const lh = cellSize * 0.5;
    const slotH = cellSize * 2.4;
    const r = cellSize * 0.35;
    const holdH = lh + slotH;
    const nextH = lh + this.nextSlots.length * slotH * 0.78;
    const stroke = { color: 0x36e6ff, alpha: 0.45, width: Math.max(1, cellSize * 0.05) };
    this.holdPlate.clear();
    this.holdPlate
      .roundRect(holdTop.x - pad, holdTop.y - pad, w, holdH + pad * 2, r)
      .fill({ color: 0x04060d, alpha: 0.55 })
      .stroke(stroke);
    this.nextPlate.clear();
    this.nextPlate
      .roundRect(nextTop.x - pad, nextTop.y - pad, w, nextH + pad * 2, r)
      .fill({ color: 0x04060d, alpha: 0.55 })
      .stroke(stroke);
  }

  /** 單欄堆疊（對戰雙盤的「對手側」用）：anchor = HUD 欄左上角。維持現狀、不畫背板。 */
  setLayout(anchor: Point, cellSize: number): void {
    this.cellSize = cellSize;
    this.applyScale(cellSize);
    this.holdPlate.clear();
    this.nextPlate.clear();
    const x = anchor.x;
    let y = anchor.y;
    const gap = cellSize * 0.5;
    const slotH = cellSize * 2.4;
    const lh = cellSize * 0.5;
    const vh = cellSize * 0.85;

    this.holdSlotLabel.position.set(x, y);
    this.holdSlot.position.set(x, y + lh);
    y += lh + slotH + gap;

    this.nextLabel.position.set(x, y);
    y += lh;
    for (const c of this.nextSlots) {
      c.position.set(x, y);
      y += slotH * 0.78;
    }
    y += gap;

    this.scoreLabel.position.set(x, y); this.score.position.set(x, y + lh); y += lh + vh + gap;
    this.levelLabel.position.set(x, y); this.level.position.set(x, y + lh); y += lh + vh + gap;
    this.linesLabel.position.set(x, y); this.lines.position.set(x, y + lh); y += lh + vh + gap;
    this.combo.position.set(x, y);
  }

  /**
   * 拆欄版：HOLD 置於盤左、NEXT＋分數置於盤右（盤面置中、左右平衡的構圖）。
   * SOLO 與對戰版面的「本機盤」共用（G2：對齊 SOLO 慣例、防 hold/next 誤認）。
   */
  setLayoutSolo(holdAnchor: Point, infoAnchor: Point, cellSize: number): void {
    this.cellSize = cellSize;
    this.applyScale(cellSize);
    this.drawPlates(holdAnchor, infoAnchor, cellSize);
    const gap = cellSize * 0.5;
    const slotH = cellSize * 2.4;
    const lh = cellSize * 0.5;
    const vh = cellSize * 0.85;

    // HOLD（盤左）
    this.holdSlotLabel.position.set(holdAnchor.x, holdAnchor.y);
    this.holdSlot.position.set(holdAnchor.x, holdAnchor.y + lh);

    // NEXT ＋ 分數（盤右）
    const x = infoAnchor.x;
    let y = infoAnchor.y;
    this.nextLabel.position.set(x, y);
    y += lh;
    for (const c of this.nextSlots) {
      c.position.set(x, y);
      y += slotH * 0.78;
    }
    y += gap;
    this.scoreLabel.position.set(x, y); this.score.position.set(x, y + lh); y += lh + vh + gap;
    this.levelLabel.position.set(x, y); this.level.position.set(x, y + lh); y += lh + vh + gap;
    this.linesLabel.position.set(x, y); this.lines.position.set(x, y + lh); y += lh + vh + gap;
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
