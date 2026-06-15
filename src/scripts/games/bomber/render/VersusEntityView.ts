import { Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { speedMs } from '../engine/player';
import { BLAST_TTL_MS, GRID_COLS, GRID_ROWS } from '../engine/constants';
import { lerp, type Layout } from './layout';
import type { BomberTextures } from './assets';
import type { VersusState, VPlayer } from '../versus/types';
import { warningRing } from '../versus/suddenDeathWarning';
import type { AbilityId, CharacterId } from '../engine/types';

/**
 * Versus 多玩家渲染層——比照 EntityView 的玩家段，但對 N 個玩家各畫一份。
 * 繪製：
 * - 道具（小 bob）
 * - 炸彈（脈動 scale；造型依持有者角色）
 * - 爆風（方向性件型，additive blend，black drops out，alpha from ttlMs）
 * - 所有存活玩家（walk sheet：列依朝向、幀依移動 walk-cycle；淘汰者隱藏）
 * - 護盾泡（持盾玩家）、無敵閃爍
 * - 技能環形震波（drainEvents → triggerAbility）
 * - Sudden death 警告：以 elapsedMs 推算「即將塌縮的那一圈」（warningRing），
 *   在該圈真正塌縮前的提前視窗內，把該圈格子以脈動紅色半透明覆層警示。
 *   如此 ring 1 會在 120s「之前」就先閃（領先塌縮），且絕不警示引擎不塌的 ring 4+。
 *
 * 策略：沿用 EntityView 的 recreate-per-frame pool（多的隱藏、不足時新增）。
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

/** Per-player tint accents (P1 warm / P2 cool / P3 / P4) — 助辨識，疊在 walk sprite 上。 */
const PLAYER_TINTS = [0xffffff, 0x9fd8ff, 0xffd6a0, 0xc0ffc0];

/** Per-ability accent colours (match the select-screen auras). */
const ABILITY_COLOR: Record<AbilityId, number> = {
  detonate: 0xffb347,
  inferno: 0xff5a3c,
  blink:   0x36e0c0,
  bulwark: 0x6b9fd0,
};

/** Expanding ring shockwave effect (grid coords; radii in cell units). */
interface RingFx {
  gx: number; gy: number;
  ageMs: number; ttlMs: number;
  fromR: number; toR: number;
  color: number;
}

const CHAR_FALLBACK: CharacterId = 'lena';
function asCharacter(c: string): CharacterId {
  return (c === 'lena' || c === 'mira' || c === 'aya' || c === 'rosa') ? c : CHAR_FALLBACK;
}

export class VersusEntityView {
  private pulsePhase    = 0;
  private blinkPhase    = 0;
  /** 各玩家 walk-cycle 時基（id → ms），移動時累加、靜止保持站立幀。 */
  private playerWalkMs   = new Map<string, number>();

  private textures: BomberTextures;
  private walkFrameCache = new Map<string, Texture>();

  // --- sprite pools ---
  private playerPool: Sprite[] = [];
  private bombPool:   Sprite[] = [];
  private blastPool:  Sprite[] = [];
  private puPool:     Sprite[] = [];

  // --- ability fx ---
  private rings: RingFx[] = [];
  private fxG: Graphics;
  /** Sudden death 警告覆層（fxLayer 上，每幀重畫）。 */
  private warnG: Graphics;

  constructor(private layer: Container, private fxLayer: Container, textures: BomberTextures) {
    this.textures = textures;
    this.warnG = new Graphics();
    this.fxLayer.addChild(this.warnG);
    this.fxG = new Graphics();
    this.fxLayer.addChild(this.fxG);
  }

  /** 技能視覺特效（versusMain 在 drainEvents 收到 ability 事件時呼叫）。 */
  triggerAbility(id: AbilityId, player: VPlayer): void {
    const color = ABILITY_COLOR[id];
    if (id === 'inferno') {
      this.rings.push({ gx: player.x, gy: player.y, ageMs: 0, ttlMs: 520, fromR: 0.3, toR: 4.4, color });
      this.rings.push({ gx: player.x, gy: player.y, ageMs: 0, ttlMs: 640, fromR: 0.1, toR: 3.2, color: 0xffb347 });
    } else {
      // detonate / blink / bulwark：以玩家位置一圈警示環即可
      this.rings.push({ gx: player.x, gy: player.y, ageMs: 0, ttlMs: 420, fromR: 0.15, toR: 1.1, color });
    }
  }

  // ─── pool helpers ────────────────────────────────────────────────────────────

  private _newSprite(texture: Texture): Sprite {
    const sp = new Sprite(texture);
    sp.anchor.set(0.5);
    this.layer.addChild(sp);
    return sp;
  }

  private _newBlastSprite(texture: Texture): Sprite {
    const sp = new Sprite(texture);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    this.fxLayer.addChild(sp);
    return sp;
  }

  private _poolGet(pool: Sprite[], idx: number, texture: Texture): Sprite {
    if (idx < pool.length) {
      pool[idx].texture = texture;
      pool[idx].visible = true;
      pool[idx].tint = 0xffffff;
      return pool[idx];
    }
    const sp = this._newSprite(texture);
    pool.push(sp);
    return sp;
  }

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

  render(state: VersusState, layout: Layout, dtMs: number): void {
    this.pulsePhase = (this.pulsePhase + dtMs * 0.005) % (Math.PI * 2);
    this.blinkPhase = (this.blinkPhase + dtMs * 0.008) % (Math.PI * 2);

    const { cell, ox, oy } = layout;

    // 1. 爆風 — 方向性件型 × 3 階段漸弱（比照 EntityView）
    const bKey = (x: number, y: number): number => y * 64 + x;
    const blastSet = new Set(state.blasts.map((b) => bKey(b.x, b.y)));
    let bi = 0;
    for (const blast of state.blasts) {
      const L = blastSet.has(bKey(blast.x - 1, blast.y));
      const R = blastSet.has(bKey(blast.x + 1, blast.y));
      const U = blastSet.has(bKey(blast.x, blast.y - 1));
      const D = blastSet.has(bKey(blast.x, blast.y + 1));
      const horiz = L || R, vert = U || D;
      let piece: keyof BomberTextures['blastPieces'];
      if ((horiz && vert) || (!horiz && !vert)) piece = 'center';
      else if (horiz) piece = L && R ? 'armH' : L ? 'tipR' : 'tipL';
      else            piece = U && D ? 'armV' : U ? 'tipD' : 'tipU';

      const t = Math.min(1, Math.max(0, 1 - blast.ttlMs / BLAST_TTL_MS)); // 0→1
      const stg = Math.min(2, Math.floor(t * 3));
      const sp = this._blastPoolGet(bi++, this.textures.blastPieces[piece][stg]);
      const bSize = cell + 1;
      sp.width  = bSize;
      sp.height = bSize;
      sp.x = ox + blast.x * cell + cell / 2;
      sp.y = oy + blast.y * cell + cell / 2;
      sp.alpha = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
    }
    this._poolHideFrom(this.blastPool, bi);

    // 2. 道具（小 bob）
    let pi = 0;
    for (const pu of state.powerUps) {
      const sp = this._poolGet(this.puPool, pi++, this._puTexture(pu.kind));
      const bob = 1 + Math.sin(this.pulsePhase + pi * 0.7) * 0.06;
      const size = cell * 0.7 * bob;
      sp.width  = size;
      sp.height = size;
      sp.x = ox + pu.x * cell + cell / 2;
      sp.y = oy + pu.y * cell + cell / 2;
      sp.alpha = 1;
    }
    this._poolHideFrom(this.puPool, pi);

    // 3. 炸彈（脈動 scale；造型依持有者角色）
    const ownerChar = new Map<string, CharacterId>();
    for (const p of state.players) ownerChar.set(p.id, asCharacter(p.character));
    let bmi = 0;
    for (const bomb of state.bombs) {
      const ch = bomb.owner ? ownerChar.get(bomb.owner) : undefined;
      const sp = this._poolGet(this.bombPool, bmi++, this._bombTexture(ch));
      const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.12;
      const size = cell * 0.8 * pulseScale;
      sp.width  = size;
      sp.height = size;
      sp.x = ox + bomb.x * cell + cell / 2;
      sp.y = oy + bomb.y * cell + cell / 2;
      sp.alpha = 1;
    }
    this._poolHideFrom(this.bombPool, bmi);

    // 4. 玩家（walk-cycle；淘汰者隱藏）
    let pli = 0;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (!p.alive) continue;

      const progress = Math.min(1, Math.max(0, 1 - p.moveCooldownMs / speedMs(p.speedLevel)));
      const rx = lerp(p.prevX, p.x, progress);
      const ry = lerp(p.prevY, p.y, progress);

      // walk-cycle：移動中持續累加相位；靜止顯示站立幀
      const moving = p.moveCooldownMs > 0;
      let walkMs = this.playerWalkMs.get(p.id) ?? 0;
      if (moving) walkMs = (walkMs + dtMs) % (130 * 4);
      this.playerWalkMs.set(p.id, walkMs);
      const step = moving ? WALK_STEPS[Math.floor(walkMs / 130) % 4] : 1;

      const character = asCharacter(p.character);
      const dirRow = dirToRow(p.dir);

      const sp = this._poolGet(this.playerPool, pli++, this._walkFrame(character, dirRow, step));
      const pSize = cell * 0.95;
      sp.width  = pSize;
      sp.height = pSize;
      sp.x = ox + rx * cell + cell / 2;
      sp.y = oy + ry * cell + cell / 2;
      sp.scale.x = Math.abs(sp.scale.x);

      // 無敵閃爍 + 持盾微淡；以玩家序賦予辨識色調
      const isInvuln = p.invulnMs > 0;
      const blinkVisible = !isInvuln || Math.sin(this.blinkPhase) > 0;
      sp.tint  = PLAYER_TINTS[i] ?? 0xffffff;
      sp.alpha = blinkVisible ? (p.shield ? 0.95 : 1) : 0.3;
    }
    this._poolHideFrom(this.playerPool, pli);

    // 5. 特效層：sudden-death 警告 + 護盾泡 + 技能環形震波
    this._renderFx(state, layout, dtMs);
  }

  // ─── fx rendering ──────────────────────────────────────────────────────────────

  private _renderFx(state: VersusState, layout: Layout, dtMs: number): void {
    const { cell, ox, oy } = layout;

    // -- Sudden death 警告覆層（即將塌縮的那一圈，脈動紅色半透明） --
    // 由 elapsedMs 推算（warningRing）：在塌縮前的提前視窗內警示，讓 ring 1 在 120s 前先閃，
    // 且絕不警示引擎不塌的 ring 4+（warningRing 已封住 r > MAX_COLLAPSE_RING）。
    const wg = this.warnG;
    wg.clear();
    const warnRing = warningRing(state.elapsedMs);
    if (warnRing !== null) {
      const pulse = 0.18 + Math.abs(Math.sin(this.pulsePhase * 2.4)) * 0.32; // 0.18→0.5
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          const d = Math.min(x, GRID_COLS - 1 - x, y, GRID_ROWS - 1 - y);
          if (d !== warnRing) continue;
          wg.rect(ox + x * cell, oy + y * cell, cell, cell)
            .fill({ color: 0xff2a2a, alpha: pulse });
        }
      }
    }

    // -- 護盾泡 + 技能環形震波 --
    const g = this.fxG;
    g.clear();

    // 護盾泡（持盾或無敵中的玩家）
    for (const p of state.players) {
      if (!p.alive) continue;
      if (!p.shield && p.invulnMs <= 0) continue;
      const progress = Math.min(1, Math.max(0, 1 - p.moveCooldownMs / speedMs(p.speedLevel)));
      const rx = lerp(p.prevX, p.x, progress);
      const ry = lerp(p.prevY, p.y, progress);
      const px = ox + rx * cell + cell / 2;
      const py = oy + ry * cell + cell / 2;
      const ringPulse = 0.78 + Math.sin(this.pulsePhase * 2.2) * 0.12;
      const radius = cell * 0.66 * ringPulse;
      g.circle(px, py, radius).fill({ color: 0x6b9fd0, alpha: 0.1 });
      g.circle(px, py, radius).stroke({ color: 0x9fd0ff, width: 2, alpha: 0.65 });
    }

    // 環形震波
    for (const r of this.rings) r.ageMs += dtMs;
    this.rings = this.rings.filter((r) => r.ageMs < r.ttlMs);
    for (const r of this.rings) {
      const t = r.ageMs / r.ttlMs;
      const ease = 1 - (1 - t) * (1 - t);
      const radius = (r.fromR + (r.toR - r.fromR) * ease) * cell;
      const alpha = (1 - t) * 0.9;
      const cx = ox + r.gx * cell + cell / 2;
      const cy = oy + r.gy * cell + cell / 2;
      g.circle(cx, cy, radius).stroke({ color: r.color, width: Math.max(2, cell * 0.07 * (1 - t)), alpha });
      g.circle(cx, cy, radius * 0.7).stroke({ color: 0xffffff, width: 1, alpha: alpha * 0.35 });
    }
  }

  // ─── walk-cycle helpers ───────────────────────────────────────────────────────

  private _walkFrame(character: CharacterId, dirRow: number, step: number): Texture {
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

  private _bombTexture(character?: CharacterId): Texture {
    switch (character) {
      case 'lena': return this.textures.bombLena;
      case 'mira': return this.textures.bombMira;
      case 'aya':  return this.textures.bombAya;
      case 'rosa': return this.textures.bombRosa;
      default:     return this.textures.bomb;
    }
  }

  private _puTexture(kind: string): Texture {
    switch (kind) {
      case 'fire':   return this.textures.puFire;
      case 'bomb':   return this.textures.puBomb;
      case 'speed':  return this.textures.puSpeed;
      case 'shield': return this.textures.puShield;
      case 'heart':  return this.textures.heart;
      default:       return this.textures.puFire;
    }
  }
}
