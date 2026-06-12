import { Text, type Container } from 'pixi.js';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import { getCells } from '../engine/piece';
import type { FfaMatch, FfaMatchEvent } from '../engine/ffa';
import type { GameTextures } from './assets';
import type { PixiStage } from './PixiStage';
import { BoardView } from './BoardView';
import { HudView } from './HudView';
import { Effects } from './Effects';
import { StandingsPanel } from './StandingsPanel';
import { computeFfaLayout, PLAYER_TINTS, type FfaSlotLayout } from './ffaLayout';
import { pieceTint, type Point } from './layout';

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

interface Slot {
  id: string;
  board: BoardView;
  hud: HudView;
  fx: Effects;
  isLocal: boolean;
  /** 當前 layout（render 時取盤面中心/矩形用）。 */
  layout: FfaSlotLayout;
}

/**
 * N 人多盤渲染器：為每位玩家建一份 BoardView/HudView/Effects，
 * 透過 computeFfaLayout 排版（本機大盤、對手環繞小盤），
 * 消費 FfaMatchEvent 放對應特效（含跨盤 attack beam），並繪製即時名次面板。
 *
 * 此類別主要靠 e2e / 手動驗證；單元測試僅確保型別正確、可 import、可 new。
 */
export class FfaBoards {
  private slots: Slot[] = [];
  private byId = new Map<string, Slot>();
  private standings: StandingsPanel;
  private playerIds: string[];
  private hudLayer: Container;
  /** 被判中離的盤面常駐標籤（ko reason='forfeit' 時掛上）。 */
  private forfeitTags = new Map<string, Text>();

  constructor(
    stage: PixiStage,
    playerIds: string[],
    private localId: string,
    tex: GameTextures,
    private nextCount = 3,
  ) {
    this.playerIds = [...playerIds];
    this.hudLayer = stage.hudLayer;
    const local = this.playerIds.includes(localId) ? localId : this.playerIds[0];

    this.playerIds.forEach((id, i) => {
      const isLocal = id === local;
      const tint = PLAYER_TINTS[i % PLAYER_TINTS.length];
      const board = new BoardView(stage.bgLayer, stage.playLayer, tex.block, tex.frameWell, { frameTint: tint });
      const hud = new HudView(stage.hudLayer, tex.block, isLocal ? this.nextCount : 1);
      const fx = new Effects(stage.fxLayer, { spark: tex.spark, ring: tex.ring, glow: tex.glow });
      const slot: Slot = {
        id,
        board,
        hud,
        fx,
        isLocal,
        layout: { id, cellSize: 24, origin: { x: 0, y: 0 }, isLocal },
      };
      this.slots.push(slot);
      this.byId.set(id, slot);
    });

    this.standings = new StandingsPanel(stage.hudLayer, this.playerIds);
  }

  /** 依當前畫面尺寸重排所有盤面與名次面板。 */
  relayout(stageW: number, stageH: number): void {
    const lay = computeFfaLayout(this.playerIds, this.localId, stageW, stageH);
    for (const slot of lay.slots) {
      const s = this.byId.get(slot.id);
      if (!s) continue;
      s.layout = slot;
      s.board.setLayout(slot.cellSize, slot.origin);
      // G2：本機盤 HOLD 拆到盤左、NEXT 留盤右（對齊 SOLO 慣例）；對手小盤維持單欄堆疊。
      if (slot.isLocal && slot.holdAnchor && slot.infoAnchor) {
        s.hud.setLayoutSolo(slot.holdAnchor, slot.infoAnchor, slot.cellSize);
      } else {
        s.hud.setLayout({ x: slot.origin.x + slot.cellSize * (BOARD_WIDTH + 0.4), y: slot.origin.y }, slot.cellSize);
      }
      s.fx.setLayout(slot.cellSize, slot.origin);
    }
    this.standings.setLayout(lay.standings.anchor, lay.standings.scale);
    // FORFEIT 標籤跟著盤面中心重排
    for (const [id, tag] of this.forfeitTags) {
      const s = this.byId.get(id);
      if (!s) continue;
      const c = this.boardCenter(s);
      tag.position.set(c.x, c.y);
      tag.style.fontSize = Math.max(10, Math.round(s.layout.cellSize * 0.55));
    }
  }

  /** 繪製所有盤面狀態 + HUD + 名次面板。 */
  renderMatch(match: FfaMatch): void {
    for (const s of this.slots) {
      const state = match.getPlayerState(s.id);
      s.board.render(state);
      s.hud.render(state);
    }
    this.standings.render(match.getStandings(), match.getPlacement(), this.localId);
  }

  private boardCenter(s: Slot): Point {
    const { cellSize, origin } = s.layout;
    return { x: origin.x + (cellSize * BOARD_WIDTH) / 2, y: origin.y + (cellSize * VISIBLE_HEIGHT) / 2 };
  }

  private boardRect(s: Slot): { x: number; y: number; w: number; h: number } {
    const { cellSize, origin } = s.layout;
    return { x: origin.x, y: origin.y, w: cellSize * BOARD_WIDTH, h: cellSize * VISIBLE_HEIGHT };
  }

  private tintFor(id: string): number {
    const idx = this.playerIds.indexOf(id);
    return PLAYER_TINTS[(idx >= 0 ? idx : 0) % PLAYER_TINTS.length];
  }

  /**
   * 消費本幀事件並放特效。本機盤吃完整特效；對手盤簡化（顧效能）。
   * 跨盤 attack 以光束自攻擊方盤面中心射向目標盤面中心。
   */
  drainAndFx(events: FfaMatchEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'lock') {
        const s = this.byId.get(ev.id);
        if (s) s.fx.lockBurst(getCells(ev.piece), pieceTint(ev.piece.type));
      } else if (ev.kind === 'lineClear') {
        const s = this.byId.get(ev.id);
        if (!s) continue;
        s.fx.lineClear(ev.rows, 0x9fefff);
        if (s.isLocal) {
          let shift = 0;
          if (ev.tSpin !== 'none') { s.fx.popup('T-SPIN!', 0xc15cff, true, shift); shift += 28; }
          s.fx.popup(`${CLEAR_NAMES[ev.count] ?? ''}!`, ev.count >= 4 ? 0xffd23f : 0x9fefff, ev.count >= 4, shift);
          shift += 28;
          if (ev.combo >= 1) s.fx.popup(`${ev.combo} COMBO`, 0x4dff88, false, shift);
        }
      } else if (ev.kind === 'attack') {
        const from = this.byId.get(ev.from);
        const to = this.byId.get(ev.to);
        if (from && to) {
          const f = this.boardCenter(from);
          const t = this.boardCenter(to);
          from.fx.attackBeam(f.x, f.y, t.x, t.y, this.tintFor(ev.from));
        }
      } else if (ev.kind === 'garbageIn') {
        const s = this.byId.get(ev.id);
        if (s) s.fx.garbageInFlash(this.boardRect(s));
      } else if (ev.kind === 'ko') {
        const s = this.byId.get(ev.id);
        if (s) {
          s.fx.topoutFlash(); // 沿用既有淘汰視覺
          if (ev.reason === 'forfeit') this.showForfeitTag(s); // 中離 → 加常駐文字標籤
        }
      }
      // 'victory' 由上層 runFfaGame 顯示橫幅，這裡不放盤面特效。
    }
  }

  /** 在該盤面中心疊上常駐「FORFEIT」標籤（同盤只掛一次）。 */
  private showForfeitTag(s: Slot): void {
    if (this.forfeitTags.has(s.id)) return;
    const tag = new Text({
      text: 'FORFEIT',
      style: {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: Math.max(10, Math.round(s.layout.cellSize * 0.55)),
        fill: 0xff5566,
        align: 'center',
      },
    });
    tag.anchor.set(0.5);
    const c = this.boardCenter(s);
    tag.position.set(c.x, c.y);
    this.hudLayer.addChild(tag);
    this.forfeitTags.set(s.id, tag);
  }

  /** 每幀推進所有盤的特效動畫。 */
  update(dtMs: number): void {
    for (const s of this.slots) s.fx.update(dtMs);
  }

  destroy(): void {
    // StandingsPanel 由本類別建立、自行銷毀；BoardView/HudView/Effects 的圖元掛在 stage
    // 各 layer，隨 stage.app.destroy() 一併釋放（runFfaGame 的拆除路徑）。
    this.standings.destroy();
    for (const tag of this.forfeitTags.values()) tag.destroy();
    this.forfeitTags.clear();
    this.slots = [];
    this.byId.clear();
  }
}
