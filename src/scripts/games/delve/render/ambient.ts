// ambient.ts — 環境粒子（純邏輯，畫在 renderer）：洞穴的浮塵、雪原的雪花、森林夜晚的螢火蟲、熔岩深淵的火星、
// 螢光菇林的孢子。每顆都是 1 個美術像素（色票色），總數有上限、只生在畫面附近，很便宜。
export type AmbientKind = 'dust' | 'snow' | 'firefly' | 'ember' | 'spore';
export const AMBIENT_CAP = 96;
export const AMBIENT_COLORS: Record<AmbientKind, readonly string[]> = {
  // 浮塵畫在光照遮罩之後（暗處也看得到），所以用中灰～淡灰：像微光裡飄的塵，不會像星星
  dust: ['#423f54', '#5e5e74', '#5e5e74', '#707490'],
  snow: ['#ffffff', '#cceaf8', '#ffffff'],
  firefly: ['#c2e478', '#ffd86a', '#fff4c0'],
  ember: ['#ffa93a', '#e8701c', '#ffd86a'],
  spore: ['#4aaeb0', '#a2c8b0', '#cceaf8'],
};
/** 會發光的種類（畫在光照遮罩之後，暗處也看得到） */
export const AMBIENT_GLOWS: Record<AmbientKind, boolean> = { dust: true, snow: false, firefly: true, ember: true, spore: true };

export interface AmbientContext {
  molten: boolean; mushroom: boolean;
  /** 在地表、天空下 */
  outdoors: boolean;
  underground: boolean;
  biome: number;
  /** 天空亮度 0..1 */
  sky: number;
  /** 正在下雨 / 下雪（天氣粒子另外畫，這裡不再放雪花 / 螢火蟲） */
  precip?: boolean;
  /** 冬天：沒有螢火蟲 */
  winter?: boolean;
}
/** 玩家所在處要哪種粒子（沒有 = null） */
export function ambientKind(c: AmbientContext): AmbientKind | null {
  if (c.molten) return 'ember';
  if (c.mushroom) return 'spore';
  if (c.outdoors) {
    if (c.precip) return null;
    if (c.biome === 2) return 'snow';
    if ((c.biome === 0 || c.biome === 3) && c.sky < 0.45 && !(c.winter && c.biome === 0)) return 'firefly';
    return null;
  }
  if (c.underground) return 'dust';
  return null;
}

export interface AmbientParticle {
  kind: AmbientKind;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; phase: number;
  color: string;
  /** 邊長（美術 px）：浮塵 1–2、雪花 2–3、其他 1 */
  size: number;
}
interface Rect { x: number; y: number; w: number; h: number; }
/** 每秒生成數 */
const RATE: Record<AmbientKind, number> = { dust: 20, snow: 40, firefly: 7, ember: 18, spore: 18 };

export class AmbientField {
  readonly particles: AmbientParticle[] = [];
  private acc = 0;
  constructor(private rnd: () => number = Math.random) {}

  /** 推進 dt 秒；kind = 目前區域的粒子（null = 不再生成，既有的照常消失）；view = 畫面（世界 px） */
  step(dt: number, kind: AmbientKind | null, view: Rect): void {
    const R = this.rnd, ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      p.phase += dt;
      if (p.kind === 'snow') p.vx = Math.sin(p.phase * 1.7) * 10;
      else if (p.kind === 'firefly') { p.vx += (R() - 0.5) * 60 * dt; p.vy += (R() - 0.5) * 60 * dt; p.vx *= 0.98; p.vy *= 0.98; }
      else if (p.kind === 'spore') p.vx = Math.sin(p.phase * 1.3) * 6;
      else if (p.kind === 'ember') p.vx = Math.sin(p.phase * 3) * 8;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const out = p.x < view.x - 40 || p.x > view.x + view.w + 40 || p.y < view.y - 40 || p.y > view.y + view.h + 40;
      if (p.life <= 0 || out) ps.splice(i, 1);
    }
    if (!kind) { this.acc = 0; return; }
    this.acc += dt * RATE[kind];
    while (this.acc >= 1) {
      this.acc -= 1;
      if (ps.length >= AMBIENT_CAP) continue;
      const cols = AMBIENT_COLORS[kind];
      const p: AmbientParticle = {
        kind, x: view.x + R() * view.w, y: view.y + R() * view.h, vx: 0, vy: 0,
        life: 0, max: 0, phase: R() * 6, color: cols[Math.floor(R() * cols.length) % cols.length], size: 1,
      };
      switch (kind) {
        case 'snow': p.y = view.y - 4 + R() * 12; p.vy = 22 + R() * 18; p.max = 14; p.size = R() < 0.3 ? 3 : 2; break;
        case 'ember': p.y = view.y + view.h * (0.4 + R() * 0.6); p.vy = -(18 + R() * 26); p.max = 3 + R() * 3; break;
        case 'spore': p.vy = -(3 + R() * 6); p.max = 5 + R() * 4; break;
        case 'firefly': p.vx = (R() - 0.5) * 16; p.vy = (R() - 0.5) * 10; p.max = 4 + R() * 4; break;
        default: p.vx = (R() - 0.5) * 6; p.vy = (R() - 0.3) * 4; p.max = 5 + R() * 4.8; p.size = R() < 0.35 ? 2 : 1;
      }
      p.life = p.max;
      ps.push(p);
    }
  }

  /** 這顆現在要不要畫（閃爍：螢火蟲 / 火星；淡入淡出用「開始和結束時隔幀畫」模擬） */
  static visible(p: AmbientParticle, frame: number): boolean {
    const age = p.max - p.life;
    if ((age < 0.4 || p.life < 0.4) && (frame & 1) === 1) return false;
    if (p.kind === 'firefly') return Math.sin(p.phase * 2.2) > -0.2;
    if (p.kind === 'ember') return Math.sin(p.phase * 9) > -0.6;
    return true;
  }
}
