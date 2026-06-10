import { Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import type { BomberState, AbilityId } from '../engine/types';
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

/** Expanding ring shockwave effect (grid coords; radii in cell units). */
interface RingFx {
  gx: number; gy: number;
  ageMs: number; ttlMs: number;
  fromR: number; toR: number;
  color: number;
}

/** Fading afterimage ghost (blink trail). */
interface GhostFx {
  gx: number; gy: number;
  ageMs: number; ttlMs: number;
  character: 'lena' | 'mira' | 'aya' | 'rosa';
  dirRow: number;
}

/** Per-ability accent colours (match the select-screen auras). */
const ABILITY_COLOR: Record<AbilityId, number> = {
  carpet:  0xffb347,
  inferno: 0xff5a3c,
  blink:   0x36e0c0,
  bulwark: 0x6b9fd0,
};

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

  // --- ability fx state ---
  private rings:  RingFx[]  = [];
  private ghosts: GhostFx[] = [];
  private ghostPool: Sprite[] = [];
  /** Remaining bulwark-shield display time (counts down with dt). */
  private bulwarkMs = 0;
  /** Graphics layer for rings + bulwark bubble (drawn fresh each frame on fxLayer). */
  private fxG: Graphics;

  constructor(private layer: Container, private fxLayer: Container, textures: BomberTextures) {
    this.textures = textures;

    // 玩家（1 個）— 初始貼圖用 lena；render 時每幀依 character 切換
    this.playerSp = this._newSprite(textures.playerLena);

    // 出口（1 個）
    this.exitSp = this._newSprite(textures.exit);
    this.exitSp.visible = false;

    // 技能特效 Graphics（fxLayer 上享 bloom）
    this.fxG = new Graphics();
    this.fxLayer.addChild(this.fxG);
  }

  /** 觸發技能視覺特效（main.ts 在 drainEvents 收到 ability 事件時呼叫）。 */
  triggerAbility(id: AbilityId, state: BomberState): void {
    const p = state.player;
    const color = ABILITY_COLOR[id];
    const characterMap: Record<string, 'lena' | 'mira' | 'aya' | 'rosa'> = {
      lena: 'lena', mira: 'mira', aya: 'aya', rosa: 'rosa',
    };
    const character = characterMap[state.character] ?? 'lena';

    if (id === 'carpet') {
      // 中心＋十字落彈點各一圈小震波
      const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of spots) {
        this.rings.push({
          gx: p.x + dx, gy: p.y + dy,
          ageMs: 0, ttlMs: 380,
          fromR: 0.1, toR: 0.62, color,
        });
      }
    } else if (id === 'inferno') {
      // 大型擴散火環（雙層）
      this.rings.push({ gx: p.x, gy: p.y, ageMs: 0, ttlMs: 520, fromR: 0.3, toR: 4.4, color });
      this.rings.push({ gx: p.x, gy: p.y, ageMs: 0, ttlMs: 640, fromR: 0.1, toR: 3.2, color: 0xffb347 });
    } else if (id === 'blink') {
      // 殘影軌跡：從落點往反方向拖 3 個 ghost ＋ 落點小環
      const delta: Record<string, [number, number]> = {
        up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
      };
      const [dx, dy] = delta[p.dir] ?? [0, 1];
      const row = dirToRow(p.dir);
      for (let k = 1; k <= 3; k++) {
        this.ghosts.push({
          gx: p.x - dx * k, gy: p.y - dy * k,
          ageMs: 0, ttlMs: 300 + k * 110,
          character, dirRow: row,
        });
      }
      this.rings.push({ gx: p.x, gy: p.y, ageMs: 0, ttlMs: 360, fromR: 0.15, toR: 0.85, color });
    } else if (id === 'bulwark') {
      // 護盾泡：invuln 期間持續顯示（3s 與引擎 invulnMs 同步）
      this.bulwarkMs = 3000;
      this.rings.push({ gx: p.x, gy: p.y, ageMs: 0, ttlMs: 420, fromR: 0.2, toR: 1.1, color });
    }
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

    // 2. 爆風 — 4 幀爆炸動畫（依 ttl 進度選幀），true-alpha additive
    let bi = 0;
    for (const blast of state.blasts) {
      const t = Math.min(1, Math.max(0, 1 - blast.ttlMs / BLAST_TTL_MS)); // 0→1
      const frameIdx = Math.min(3, Math.floor(t * 4));
      const sp = this._blastPoolGet(bi++, this.textures.blastFrames[frameIdx]);
      // 略小於一格：爆風視覺嚴格留在傷害格內，不得外溢鄰格（視覺=判定）
      const bSize = cell * 0.94;
      sp.width  = bSize;
      sp.height = bSize;
      sp.x = ox + blast.x * cell + cell / 2;
      sp.y = oy + blast.y * cell + cell / 2;
      sp.alpha = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15; // 尾段才淡出
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

    // 4. 炸彈（脈動 scale）— 造型依角色
    const bombTexMap: Record<string, Texture> = {
      lena: this.textures.bombLena,
      mira: this.textures.bombMira,
      aya:  this.textures.bombAya,
      rosa: this.textures.bombRosa,
    };
    const bombTex = bombTexMap[state.character] ?? this.textures.bomb;
    let bmi = 0;
    for (const bomb of state.bombs) {
      const sp = this._poolGet(this.bombPool, bmi++, bombTex);
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

    // 7. 技能特效（環形震波／殘影／護盾泡）
    this._renderAbilityFx(state, layout, dtMs, ppx, ppy);
  }

  // ─── ability fx rendering ────────────────────────────────────────────────────

  private _renderAbilityFx(
    state: BomberState,
    layout: Layout,
    dtMs: number,
    playerPx: number,
    playerPy: number,
  ): void {
    const { cell, ox, oy } = layout;
    const g = this.fxG;
    g.clear();

    // -- 環形震波 --
    for (const r of this.rings) r.ageMs += dtMs;
    this.rings = this.rings.filter((r) => r.ageMs < r.ttlMs);
    for (const r of this.rings) {
      const t = r.ageMs / r.ttlMs;               // 0→1
      const ease = 1 - (1 - t) * (1 - t);        // ease-out
      const radius = (r.fromR + (r.toR - r.fromR) * ease) * cell;
      const alpha = (1 - t) * 0.9;
      const cx = ox + r.gx * cell + cell / 2;
      const cy = oy + r.gy * cell + cell / 2;
      g.circle(cx, cy, radius).stroke({ color: r.color, width: Math.max(2, cell * 0.07 * (1 - t)), alpha });
      // 內圈微光
      g.circle(cx, cy, radius * 0.7).stroke({ color: 0xffffff, width: 1, alpha: alpha * 0.35 });
    }

    // -- blink 殘影 --
    for (const gh of this.ghosts) gh.ageMs += dtMs;
    this.ghosts = this.ghosts.filter((gh) => gh.ageMs < gh.ttlMs);
    let gi = 0;
    for (const gh of this.ghosts) {
      const t = gh.ageMs / gh.ttlMs;
      let sp: Sprite;
      if (gi < this.ghostPool.length) {
        sp = this.ghostPool[gi];
        sp.visible = true;
      } else {
        sp = new Sprite();
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        this.fxLayer.addChild(sp);
        this.ghostPool.push(sp);
      }
      gi++;
      sp.texture = this._walkFrame(gh.character, gh.dirRow, 1);
      const size = cell * 0.95;
      sp.width  = size;
      sp.height = size;
      sp.x = ox + gh.gx * cell + cell / 2;
      sp.y = oy + gh.gy * cell + cell / 2;
      sp.tint = 0x36e0c0;
      sp.alpha = (1 - t) * 0.5;
    }
    for (let i = gi; i < this.ghostPool.length; i++) this.ghostPool[i].visible = false;

    // -- bulwark 護盾泡（invuln 期間圍繞玩家） --
    if (this.bulwarkMs > 0) {
      this.bulwarkMs -= dtMs;
      if (state.player.invulnMs > 0) {
        const pulse = 0.78 + Math.sin(this.pulsePhase * 2.2) * 0.12;
        const radius = cell * 0.66 * pulse;
        g.circle(playerPx, playerPy, radius).fill({ color: 0x6b9fd0, alpha: 0.13 });
        g.circle(playerPx, playerPy, radius).stroke({ color: 0x9fd0ff, width: 2, alpha: 0.75 });
        g.circle(playerPx, playerPy, radius * 0.86).stroke({ color: 0x6b9fd0, width: 1, alpha: 0.4 });
      } else {
        this.bulwarkMs = 0; // invuln 提前結束（如受擊重置）即收掉泡泡
      }
    }
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
