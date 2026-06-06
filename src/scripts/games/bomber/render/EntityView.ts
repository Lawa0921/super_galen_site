import { Container, Graphics } from 'pixi.js';
import type { BomberState } from '../engine/types';
import { speedMs } from '../engine/player';
import { ENEMY_MOVE_MS } from '../engine/constants';
import { lerp, type Layout } from './layout';

/** 顏色常數 */
const COLOR_PLAYER = 0x4dff88;          // 玩家：亮綠
const COLOR_PLAYER_SHIELD = 0xffd23f;   // 護盾狀態：金色
const COLOR_ENEMY_WANDER = 0xff4d6d;    // 流浪敵：紅
const COLOR_ENEMY_CHASER = 0xc15cff;    // 追逐敵：紫
const COLOR_BOMB = 0x36e6ff;            // 炸彈：青
const COLOR_BLAST = 0xff9a3c;           // 爆風：橙
const COLOR_EXIT_ACTIVE = 0x00ffcc;     // 活躍出口：teal（distinct from player green）
const COLOR_EXIT_INACTIVE = 0x2a3248;   // 非活躍出口：暗
const POWERUP_COLORS: Record<string, number> = {
  fire: 0xff4d6d,
  bomb: 0x36e6ff,
  speed: 0xffd23f,
  shield: 0xc15cff,
};

/**
 * 每幀繪製所有動態實體：
 * - 玩家（blink invulnMs、護盾金色）
 * - 敵人（顏色按 kind）
 * - 炸彈（脈動圓）
 * - 爆風（亮橙色格子）
 * - 道具（彩色菱形）
 * - 出口（活躍才畫 + 閃光）
 * 所有移動實體插值：lerp(prev, cur, progress)
 */
export class EntityView {
  private gfx = new Graphics();
  private blinkPhase = 0;
  private pulsePhase = 0;
  private exitGlowPhase = 0;

  constructor(private layer: Container) {
    layer.addChild(this.gfx);
  }

  render(state: BomberState, layout: Layout, dtMs: number): void {
    this.blinkPhase = (this.blinkPhase + dtMs * 0.008) % (Math.PI * 2);
    this.pulsePhase = (this.pulsePhase + dtMs * 0.005) % (Math.PI * 2);
    this.exitGlowPhase = (this.exitGlowPhase + dtMs * 0.003) % (Math.PI * 2);

    const g = this.gfx.clear();
    const { cell, ox, oy } = layout;

    // 出口
    this.drawExit(g, state, cell, ox, oy);

    // 爆風
    for (const blast of state.blasts) {
      const bx = ox + blast.x * cell;
      const by = oy + blast.y * cell;
      const alpha = Math.max(0.3, blast.ttlMs / 480);
      g.rect(bx + 2, by + 2, cell - 4, cell - 4).fill({ color: COLOR_BLAST, alpha });
    }

    // 道具（菱形）
    for (const pu of state.powerUps) {
      const px = ox + pu.x * cell + cell / 2;
      const py = oy + pu.y * cell + cell / 2;
      const r = cell * 0.32;
      const col = POWERUP_COLORS[pu.kind] ?? 0xffffff;
      g.moveTo(px, py - r).lineTo(px + r, py).lineTo(px, py + r).lineTo(px - r, py).closePath();
      g.fill({ color: col, alpha: 0.9 });
      g.moveTo(px, py - r).lineTo(px + r, py).lineTo(px, py + r).lineTo(px - r, py).closePath();
      g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
    }

    // 炸彈（脈動圓 + 引信）
    for (const bomb of state.bombs) {
      const bx = ox + bomb.x * cell + cell / 2;
      const by = oy + bomb.y * cell + cell / 2;
      const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.12;
      const r = cell * 0.35 * pulseScale;
      g.circle(bx, by, r).fill({ color: COLOR_BOMB, alpha: 0.9 });
      g.circle(bx, by, r).stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
      // 引信（小線段）
      const fuseProgress = Math.max(0, bomb.fuseMs / 2000);
      const fuseLen = cell * 0.25 * fuseProgress;
      g.moveTo(bx, by - r).lineTo(bx + fuseLen, by - r - fuseLen);
      g.stroke({ width: 2, color: 0xffd23f, alpha: 0.9 });
    }

    // 敵人
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      // 計算插值進度：moveAccMs 累積到 ENEMY_MOVE_MS 代表移動完成
      const moveMs = ENEMY_MOVE_MS[enemy.kind];
      const progress = Math.min(1, Math.max(0, enemy.moveAccMs / moveMs));
      const rx = lerp(enemy.prevX, enemy.x, progress);
      const ry = lerp(enemy.prevY, enemy.y, progress);
      const ex = ox + rx * cell + cell / 2;
      const ey = oy + ry * cell + cell / 2;
      const r = cell * 0.38;
      const col = enemy.kind === 'wander' ? COLOR_ENEMY_WANDER : COLOR_ENEMY_CHASER;
      g.circle(ex, ey, r).fill({ color: col, alpha: 0.9 });
      g.circle(ex, ey, r).stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
      // 小眼睛方向指示
      this.drawEyes(g, enemy.dir, ex, ey, r);
    }

    // 玩家
    const p = state.player;
    const playerProgress = Math.min(1, Math.max(0,
      1 - p.moveCooldownMs / speedMs(p.speedLevel),
    ));
    const prx = lerp(p.prevX, p.x, playerProgress);
    const pry = lerp(p.prevY, p.y, playerProgress);
    const ppx = ox + prx * cell + cell / 2;
    const ppy = oy + pry * cell + cell / 2;

    // blink 無敵時
    const isInvuln = p.invulnMs > 0;
    const blinkVisible = !isInvuln || Math.sin(this.blinkPhase) > 0;

    if (blinkVisible) {
      const half = cell * 0.4;
      const playerColor = p.shield ? COLOR_PLAYER_SHIELD : COLOR_PLAYER;
      g.rect(ppx - half, ppy - half, half * 2, half * 2).fill({ color: playerColor, alpha: 0.95 });
      if (p.shield) {
        // 護盾光環
        g.circle(ppx, ppy, cell * 0.52).stroke({ width: 2, color: 0xffd23f, alpha: 0.7 });
      }
    }
  }

  private drawExit(g: Graphics, state: BomberState, cell: number, ox: number, oy: number): void {
    const { exit, exitActive } = state;
    const ex = ox + exit.x * cell;
    const ey = oy + exit.y * cell;
    if (!exitActive) {
      // 非活躍：暗色小點
      g.rect(ex + cell * 0.3, ey + cell * 0.3, cell * 0.4, cell * 0.4)
        .fill({ color: COLOR_EXIT_INACTIVE, alpha: 0.5 });
      return;
    }
    // 活躍：閃爍綠色方格 + 邊框
    const glowAlpha = 0.6 + Math.sin(this.exitGlowPhase) * 0.35;
    g.rect(ex + 2, ey + 2, cell - 4, cell - 4).fill({ color: COLOR_EXIT_ACTIVE, alpha: glowAlpha });
    g.rect(ex + 2, ey + 2, cell - 4, cell - 4).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    // 「E」圖示（簡化：三條橫線）
    const cx = ex + cell / 2;
    const cy = ey + cell / 2;
    const hw = cell * 0.2;
    for (const dy of [-cell * 0.14, 0, cell * 0.14]) {
      g.moveTo(cx - hw, cy + dy).lineTo(cx + hw, cy + dy);
      g.stroke({ width: 1.5, color: 0x06070f, alpha: 0.8 });
    }
  }

  private drawEyes(g: Graphics, dir: string, cx: number, cy: number, r: number): void {
    const offset = r * 0.35;
    let dx = 0, dy = 0;
    if (dir === 'up') dy = -1;
    else if (dir === 'down') dy = 1;
    else if (dir === 'left') dx = -1;
    else if (dir === 'right') dx = 1;
    const er = r * 0.18;
    const perp = r * 0.25;
    // 兩個眼睛
    const ex1 = cx + dx * offset + (dy !== 0 ? -perp : 0);
    const ey1 = cy + dy * offset + (dx !== 0 ? -perp : 0);
    const ex2 = cx + dx * offset + (dy !== 0 ? perp : 0);
    const ey2 = cy + dy * offset + (dx !== 0 ? perp : 0);
    g.circle(ex1, ey1, er).fill({ color: 0xffffff, alpha: 0.9 });
    g.circle(ex2, ey2, er).fill({ color: 0xffffff, alpha: 0.9 });
  }
}
