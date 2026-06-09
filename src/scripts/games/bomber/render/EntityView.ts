import { Container, Sprite, Texture, Rectangle } from 'pixi.js';
import type { BomberState } from '../engine/types';
import { speedMs } from '../engine/player';
import { BLAST_TTL_MS } from '../engine/constants';
import { enemyMoveMs } from '../engine/enemy';
import { lerp, type Layout } from './layout';
import type { BomberTextures } from './assets';

/**
 * 每幀以 Sprite 繪製所有動態實體：
 * - 玩家（blink invulnMs、護盾 alpha）
 * - 敵人（依 kind 選貼圖，僅 alive）
 * - 炸彈（脈動 scale）
 * - 爆風（additive blend，black drops out，alpha from ttlMs）
 * - 道具（依 kind 選貼圖，小 bob）
 * - 出口（exitActive 才顯示，閃爍 alpha）
 * 所有移動實體插值：lerp(prev, cur, progress)
 *
 * 策略：簡易「recreate-per-frame」pool——每類實體維護一個陣列，
 * 每幀重新配置必要數量（多的隱藏，不足時新增），避免 GC。
 */

/** Walk-cycle step sequence for ping-pong: A → stand → B → stand */
const WALK_STEPS = [0, 1, 2, 1] as const;

/** Map direction string to walk-sheet row index (row 0=down, 1=left, 2=right, 3=up). */
function dirToRow(dir: string): number {
  switch (dir) {
    case 'left':  return 1;
    case 'right': return 2;
    case 'up':    return 3;
    default:      return 0; // 'down' and any unknown default to down
  }
}

export class EntityView {
  private blinkPhase    = 0;
  private pulsePhase    = 0;
  private exitGlowPhase = 0;
  /** Accumulates ms while the player is moving; resets to 0 when idle. */
  private playerWalkMs  = 0;

  private textures: BomberTextures;

  /**
   * Frame cache for walk animations.
   * Key: `${character}-${dirRow}-${step}` → sliced Texture.
   * Built lazily on first access.
   */
  private walkFrameCache = new Map<string, Texture>();

  // --- sprite pools ---
  private playerSp:  Sprite;
  private enemyPool: Sprite[] = [];
  private bombPool:  Sprite[] = [];
  private blastPool: Sprite[] = [];
  private puPool:    Sprite[] = [];
  private exitSp:    Sprite;

  constructor(private layer: Container, private fxLayer: Container, textures: BomberTextures) {
    this.textures = textures;

    // 玩家（1 個）— 初始貼圖用 lena；render 時每幀依 character 切換
    this.playerSp = this._newSprite(textures.playerLena);

    // 出口（1 個）
    this.exitSp = this._newSprite(textures.exit);
    this.exitSp.visible = false;
  }

  // ─── pool helpers ────────────────────────────────────────────────────────────

  private _newSprite(texture: Texture): Sprite {
    const sp = new Sprite(texture);
    sp.anchor.set(0.5);
    this.layer.addChild(sp);
    return sp;
  }

  /** 在 fxLayer 上建立新的爆風 Sprite，blendMode 僅設一次。 */
  private _newBlastSprite(texture: Texture): Sprite {
    const sp = new Sprite(texture);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    this.fxLayer.addChild(sp);
    return sp;
  }

  /** 取得 pool 中第 idx 個 Sprite（不足時自動擴充）。多餘的在 render 末尾隱藏。 */
  private _poolGet(pool: Sprite[], idx: number, texture: Texture): Sprite {
    if (idx < pool.length) {
      pool[idx].texture = texture;
      pool[idx].visible = true;
      return pool[idx];
    }
    const sp = this._newSprite(texture);
    pool.push(sp);
    return sp;
  }

  /** 取得爆風 pool 中第 idx 個 Sprite（不足時自動擴充到 fxLayer）。 */
  private _blastPoolGet(idx: number, texture: Texture): Sprite {
    if (idx < this.blastPool.length) {
      this.blastPool[idx].texture = texture;
      this.blastPool[idx].visible = true;
      return this.blastPool[idx];
    }
    const sp = this._newBlastSprite(texture);
    this.blastPool.push(sp);
    return sp;
  }

  private _poolHideFrom(pool: Sprite[], from: number): void {
    for (let i = from; i < pool.length; i++) pool[i].visible = false;
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  render(state: BomberState, layout: Layout, dtMs: number): void {
    this.blinkPhase    = (this.blinkPhase    + dtMs * 0.008) % (Math.PI * 2);
    this.pulsePhase    = (this.pulsePhase    + dtMs * 0.005) % (Math.PI * 2);
    this.exitGlowPhase = (this.exitGlowPhase + dtMs * 0.003) % (Math.PI * 2);

    const { cell, ox, oy } = layout;

    // 1. 出口
    this._renderExit(state, cell, ox, oy);

    // 2. 爆風（additive，black drops out）— 路由到 fxLayer（強烈 bloom）
    let bi = 0;
    for (const blast of state.blasts) {
      const sp = this._blastPoolGet(bi++, this.textures.blast);
      sp.width  = cell;
      sp.height = cell;
      sp.x = ox + blast.x * cell + cell / 2;
      sp.y = oy + blast.y * cell + cell / 2;
      sp.alpha = Math.max(0.3, blast.ttlMs / BLAST_TTL_MS);
    }
    this._poolHideFrom(this.blastPool, bi);

    // 3. 道具
    let pi = 0;
    for (const pu of state.powerUps) {
      const puTex = this._puTexture(pu.kind);
      const sp = this._poolGet(this.puPool, pi++, puTex);
      const bob = 1 + Math.sin(this.pulsePhase + pi * 0.7) * 0.06;
      const size = cell * 0.7 * bob;
      sp.width  = size;
      sp.height = size;
      sp.x = ox + pu.x * cell + cell / 2;
      sp.y = oy + pu.y * cell + cell / 2;
      sp.alpha = 1;
    }
    this._poolHideFrom(this.puPool, pi);

    // 4. 炸彈（脈動 scale）
    let bmi = 0;
    for (const bomb of state.bombs) {
      const sp = this._poolGet(this.bombPool, bmi++, this.textures.bomb);
      const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.12;
      const size = cell * 0.8 * pulseScale;
      sp.width  = size;
      sp.height = size;
      sp.x = ox + bomb.x * cell + cell / 2;
      sp.y = oy + bomb.y * cell + cell / 2;
      sp.alpha = 1;
    }
    this._poolHideFrom(this.bombPool, bmi);

    // 5. 敵人
    let ei = 0;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const moveMs   = enemyMoveMs(enemy.kind, state.floor);
      const progress = Math.min(1, Math.max(0, enemy.moveAccMs / moveMs));
      const rx = lerp(enemy.prevX, enemy.x, progress);
      const ry = lerp(enemy.prevY, enemy.y, progress);
      const tex = enemy.kind === 'wander' ? this.textures.enemyWander : this.textures.enemyChaser;
      const sp  = this._poolGet(this.enemyPool, ei++, tex);
      const size = cell * 0.85;
      sp.width  = size;
      sp.height = size;
      sp.x = ox + rx * cell + cell / 2;
      sp.y = oy + ry * cell + cell / 2;
      sp.alpha = 1;
    }
    this._poolHideFrom(this.enemyPool, ei);

    // 6. 玩家（walk-cycle animation）
    const p = state.player;
    const playerProgress = Math.min(1, Math.max(0,
      1 - p.moveCooldownMs / speedMs(p.speedLevel),
    ));
    const prx = lerp(p.prevX, p.x, playerProgress);
    const pry = lerp(p.prevY, p.y, playerProgress);
    const ppx = ox + prx * cell + cell / 2;
    const ppy = oy + pry * cell + cell / 2;

    const isInvuln     = p.invulnMs > 0;
    const blinkVisible = !isInvuln || Math.sin(this.blinkPhase) > 0;

    // Walk-cycle: advance the phase continuously while moving (do NOT reset on
    // the brief idle moment between tiles, or the cycle never reaches the 2nd
    // step). Kept bounded by the cycle length. Idle shows the standing frame.
    const moving = p.moveCooldownMs > 0;
    if (moving) {
      this.playerWalkMs = (this.playerWalkMs + dtMs) % (130 * 4);
    }
    // Ping-pong: step-A → stand → step-B → stand (each 130 ms)
    const step = moving
      ? WALK_STEPS[Math.floor(this.playerWalkMs / 130) % 4]
      : 1; // idle = standing frame (col 1)

    const dirRow = dirToRow(p.dir);
    const characterMap: Record<string, 'lena' | 'mira' | 'aya' | 'rosa'> = {
      lena: 'lena', mira: 'mira', aya: 'aya', rosa: 'rosa',
    };
    const character = characterMap[state.character] ?? 'lena';

    const ps = this.playerSp;
    ps.texture = this._walkFrame(character, dirRow, step);
    const pSize = cell * 0.95;
    ps.width  = pSize;
    ps.height = pSize;
    ps.x = ppx;
    ps.y = ppy;
    // Walk sheet has separate left/right rows — no horizontal flip needed
    ps.scale.x = Math.abs(ps.scale.x);
    ps.alpha   = blinkVisible ? (p.shield ? 0.95 : 1) : 0.3;
    ps.visible = true;
  }

  // ─── walk-cycle helpers ───────────────────────────────────────────────────────

  /**
   * Returns the walk-cycle Texture for (character, dirRow, step).
   * Slices from the walk sheet and caches the result.
   * Frame rect: Rectangle(step * 64, dirRow * 64, 64, 64).
   */
  private _walkFrame(character: 'lena' | 'mira' | 'aya' | 'rosa', dirRow: number, step: number): Texture {
    const key = `${character}-${dirRow}-${step}`;
    const cached = this.walkFrameCache.get(key);
    if (cached) return cached;

    const walkTexMap = {
      lena: this.textures.walkLena,
      mira: this.textures.walkMira,
      aya:  this.textures.walkAya,
      rosa: this.textures.walkRosa,
    };
    const base = walkTexMap[character] ?? this.textures.walkLena;
    const tex = new Texture({
      source: base.source,
      frame: new Rectangle(step * 64, dirRow * 64, 64, 64),
    });
    this.walkFrameCache.set(key, tex);
    return tex;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private _renderExit(state: BomberState, cell: number, ox: number, oy: number): void {
    const { exit, exitActive } = state;
    const sp = this.exitSp;
    if (!exitActive) {
      sp.visible = false;
      return;
    }
    const glowAlpha = 0.6 + Math.sin(this.exitGlowPhase) * 0.35;
    sp.texture = this.textures.exit;
    sp.width  = cell;
    sp.height = cell;
    sp.x = ox + exit.x * cell + cell / 2;
    sp.y = oy + exit.y * cell + cell / 2;
    sp.alpha   = glowAlpha;
    sp.visible = true;
  }

  private _puTexture(kind: string): Texture {
    switch (kind) {
      case 'fire':   return this.textures.puFire;
      case 'bomb':   return this.textures.puBomb;
      case 'speed':  return this.textures.puSpeed;
      case 'shield': return this.textures.puShield;
      case 'heart':  return this.textures.heart;
      default:
        console.warn('[EntityView] unknown powerup kind:', kind);
        return this.textures.puFire;
    }
  }
}
