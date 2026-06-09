import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { PLAYER_TINTS } from './ffaLayout';
import type { Point } from './layout';

const PIXEL_FONT = '"Press Start 2P", Consolas, monospace';

const TITLE_STYLE: TextStyleOptions = {
  fontFamily: PIXEL_FONT,
  fontSize: 11,
  fill: 0x6fa8d8,
  letterSpacing: 2,
};
const ROW_STYLE: TextStyleOptions = {
  fontFamily: PIXEL_FONT,
  fontSize: 12,
  fill: 0xffffff,
  letterSpacing: 1,
};

interface Row {
  rank: Text;
  name: Text;
  chip: Graphics;
  chipX: number;
  chipY: number;
  chipSize: number;
}

/**
 * 即時名次面板（N 人大亂鬥）：列出存活者 + 已淘汰者的當前名次，
 * 各玩家以識別色小方塊標記，本機列高亮。沿用街機點陣字風格。
 */
export class StandingsPanel {
  private root = new Container();
  private title = new Text({ text: 'STANDINGS', style: TITLE_STYLE });
  private rows: Row[] = [];
  private anchor: Point = { x: 0, y: 0 };
  private scale = 1;

  /** playerIds：建構時固定一份（決定列數與每位的識別色索引）。 */
  constructor(
    layer: Container,
    private playerIds: string[],
  ) {
    layer.addChild(this.root);
    this.root.filters = [new GlowFilter({ color: 0x36e6ff, outerStrength: 0.9, innerStrength: 0, distance: 6 })];
    this.root.addChild(this.title);
    for (let i = 0; i < this.playerIds.length; i++) {
      const chip = new Graphics();
      const rank = new Text({ text: '', style: { ...ROW_STYLE } });
      const name = new Text({ text: '', style: { ...ROW_STYLE } });
      this.root.addChild(chip, rank, name);
      this.rows.push({ rank, name, chip, chipX: 0, chipY: 0, chipSize: 0 });
    }
  }

  /** 設定面板左上錨點與字級縮放（相對基準字級）。 */
  setLayout(anchor: Point, scale = 1): void {
    this.anchor = anchor;
    this.scale = Math.max(0.5, scale);
    this.applyLayout();
  }

  private applyLayout(): void {
    const s = this.scale;
    const titleSize = Math.max(10, Math.round(11 * s));
    const rowSize = Math.max(10, Math.round(12 * s));
    const lineH = Math.round(rowSize * 1.9);
    const chipSize = Math.round(rowSize * 0.9);

    this.title.style.fontSize = titleSize;
    this.title.position.set(this.anchor.x, this.anchor.y);

    let y = this.anchor.y + Math.round(titleSize * 1.8);
    for (const row of this.rows) {
      const { rank, name } = row;
      rank.style.fontSize = rowSize;
      name.style.fontSize = rowSize;

      const chipX = this.anchor.x;
      row.chipX = chipX;
      row.chipY = y + Math.round((rowSize - chipSize) / 2);
      row.chipSize = chipSize;

      rank.position.set(chipX + chipSize + Math.round(rowSize * 0.6), y);
      name.position.set(chipX + chipSize + Math.round(rowSize * 3.0), y);
      y += lineH;
    }
  }

  /**
   * 更新名次顯示。
   * @param standings  目前已定名次者依名次排序的 id 陣列（placement 1 在前）
   * @param placements id → placement(1..N)；未含者視為存活中
   * @param localId    本機玩家 id（高亮其列）
   */
  render(standings: string[], placements: Map<string, number>, localId: string): void {
    // 顯示順序：已定名次者依 placement 升序，其後接存活者（依 playerIds 原序）。
    const ranked = [...standings];
    const rankedSet = new Set(ranked);
    const alive = this.playerIds.filter((id) => !rankedSet.has(id));
    const order = [...ranked, ...alive];

    for (let i = 0; i < this.rows.length; i++) {
      const { rank, name, chip } = this.rows[i];
      const id = order[i];
      if (!id) {
        rank.text = '';
        name.text = '';
        chip.visible = false;
        continue;
      }
      chip.visible = true;
      chip.alpha = placements.has(id) ? 0.45 : 1; // 已淘汰者稍暗
      // 以「該列當前顯示的玩家」識別色重畫色塊（名次重排後仍對得上）
      const idx = this.playerIds.indexOf(id);
      const tint = PLAYER_TINTS[(idx >= 0 ? idx : i) % PLAYER_TINTS.length];
      const row = this.rows[i];
      chip.clear().rect(row.chipX, row.chipY, row.chipSize, row.chipSize).fill({ color: tint });

      const placement = placements.get(id);
      rank.text = placement != null ? `#${placement}` : '--';
      const label = shortName(id);
      name.text = id === localId ? `${label} *` : label;

      const highlight = id === localId;
      rank.style.fill = highlight ? 0xffd23f : 0xffffff;
      name.style.fill = highlight ? 0xffd23f : placements.has(id) ? 0x9aa6b2 : 0xffffff;
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** 暱稱/地址縮短顯示（地址類取頭尾）。 */
function shortName(id: string): string {
  if (id.startsWith('0x') && id.length > 10) {
    return `${id.slice(0, 4)}..${id.slice(-3)}`;
  }
  return id.length > 8 ? `${id.slice(0, 8)}` : id;
}
