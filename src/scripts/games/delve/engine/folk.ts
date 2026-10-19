// folk.ts — 世界上的 NPC（純邏輯，無 DOM）：村民、矮人、路上的旅人、洞穴裡受困的探險者。
//   · 村民 / 矮人：由世界生成的村落 / 地廳配置決定（同種子永遠同一批人；位置不存檔，好感度存檔）。
//     白天在村裡走動（各自的活動範圍），晚上回屋子裡（會開關門）；矮人在地廳裡不分日夜。離玩家很遠就凍結。
//   · 遇見（encounter）：
//       行商 / 旅行藥師：白天、玩家在地表、附近有平坦的地面（不在村落 / 據點裡）→ 在畫面外的路邊出現，停留約 1/3 天，
//         入夜或時間到就走掉。同時最多一位；出現後冷卻 TRAVELLER_CD（約大半天）才會有下一位。
//       受困探險者：玩家在地底洞穴裡 → 在畫面外的洞穴地板上等待救援（會喊救命）。同時最多一位、整個世界最多 STRANDED_MAX 位、
//         冷卻 STRANDED_CD（超過一天）。救援後跟著玩家走（卡住 / 太遠會跟上），到地表 / 村落 / 據點就算護送完成。
//   · 好感度：交易（每天每人有上限）、每天第一次說話、委託、救援累積 → 價格倍率、商品 / 服務的等級門檻（folkDefs.AFF_TIERS）。
import type { World } from './world';
import { T, isSolidTile } from './tiles';
import { makeBody, moveBody, type Body, type SolidQuery } from './physics';
import { TILE_SIZE as S, GRAVITY, MAX_FALL, JUMP_SPEED, DAY_LENGTH } from './constants';
import { findStandSpot, standable } from './npcPath';
import { Rng } from './rng';
import { HOUSE_WALLS } from './furniture';
import type { VillageInfo, HallInfo } from './gen/settlements';
import {
  ROLES, AFF_MAX, AFF_TALK, AFF_TRADE, AFF_TRADE_DAILY, folkLook, folkName, peddlerStock,
  type FolkLook, type FolkOrigin, type FolkRace, type FolkRole, type FolkShopEntry,
} from './folkDefs';

export const FOLK_WALK = 48;
/** 這麼遠（格）以外凍結 */
export const FOLK_ACTIVE = { x: 100, y: 70 };
/** 遇見檢查間隔（遊戲秒） */
export const ENCOUNTER_EVERY = 8;
export const TRAVELLER_CHANCE = 0.35;
export const STRANDED_CHANCE = 0.3;
export const TRAVELLER_CD = DAY_LENGTH * 0.6;
export const TRAVELLER_STAY = DAY_LENGTH * 0.3;
export const STRANDED_CD = DAY_LENGTH * 1.2;
/** 沒人救的探險者撐多久（之後自己摸索出去） */
export const STRANDED_WAIT = DAY_LENGTH * 1.5;
export const STRANDED_MAX = 3;
/** 遇見出現的距離（格） */
export const ENC_DIST = { min: 26, max: 46 };

export interface FolkNpc {
  id: number;
  /** 穩定的識別（好感度 / 委託用）：v0:elder、h1:runesmith、road:peddler、cave:stranded:2 */
  key: string;
  role: FolkRole; race: FolkRace; origin: FolkOrigin;
  name: string;
  look: FolkLook;
  body: Body;
  dir: 1 | -1;
  state: 'idle' | 'walk';
  /** 白天的活動範圍（tile 欄，含）與站的列 */
  zone: { x0: number; x1: number };
  /** 晚上待的地方（屋裡；矮人 / 旅人沒有） */
  night: { x: number; y: number } | null;
  /** 村落 / 地廳的索引（遇見的人 = -1） */
  site: number;
  t: number; targetX: number | null; stuck: number;
  say: string | null; sayT: number; talks: number;
  door: { x: number; top: number; bot: number } | null;
  // ── 遇見 ──
  /** 行商：第幾次遇見（決定貨色） */
  visit?: number;
  stock?: FolkShopEntry[];
  /** 出現的時間 / 該離開的時間（遊戲秒） */
  since?: number; leaveAt?: number;
  leaving?: boolean;
  /** 受困探險者：跟著玩家 / 已經安全了（護送完成） */
  following?: boolean; safe?: boolean;
  helpT?: number;
}

export interface FolkTravellerJSON {
  key: string; role: FolkRole; x: number; y: number; visit?: number; since: number; leaveAt: number;
  following?: boolean; safe?: boolean; leaving?: boolean;
}
export interface FolkJSON {
  aff: Record<string, number>;
  /** 交易好感度的每日計數、每日說話 */
  affDay: Record<string, { day: number; n: number; talk?: number }>;
  enc: { nextTraveller: number; nextStranded: number; stranded: number; visits: number };
  travellers: FolkTravellerJSON[];
}

export type FolkEvent =
  | { type: 'folk'; phase: 'appear' | 'leave' | 'safe' | 'giveup'; key: string; role: FolkRole; name: string; x: number; y: number; dx: number; dy: number };

export interface FolkHost {
  world: World;
  time: number;
  day: number;
  isNight(): boolean;
  playerTile(): { x: number; y: number };
  /** 畫面半寬 / 半高（格）：遇見要在畫面外出現 */
  viewHalf: { w: number; h: number };
  /** 地底（岩層以下）而且不在地城 */
  underground(x: number, y: number): boolean;
  /** 地表（離生成地表 ≤ 4 格、上面看得到天空） */
  onSurface(x: number, y: number): boolean;
  /** 在據點範圍 / 村落 / 地廳裡（安全的地方：旅人不在這裡出現；護送到這裡算完成） */
  safeAt(x: number, y: number): boolean;
  playerOverlaps(x: number, y: number): boolean;
  /** 健康的據點 / 治療師居民已經有了 → 旅人只會是行商 */
  wantHerbalist(): boolean;
}

const isDoor = (id: number): boolean => id === T.DOOR_CLOSED || id === T.DOOR_OPEN;

export class FolkWorld {
  npcs: FolkNpc[] = [];
  aff: Record<string, number> = {};
  affDay: Record<string, { day: number; n: number; talk?: number }> = {};
  enc = { nextTraveller: DAY_LENGTH * 0.25, nextStranded: DAY_LENGTH * 0.5, stranded: 0, visits: 0 };
  private nextId = 1;
  /** 上一刻玩家所在 tile（遇見提示的方向用） */
  private pt = { x: 0, y: 0 };
  private encT = 0;
  private events: FolkEvent[] = [];
  private readonly rng: Rng;
  /** 測試 / e2e：遇見機率覆寫（1 = 一定出現） */
  chanceOverride: number | null = null;

  constructor(readonly seed: string, readonly villages: readonly VillageInfo[], readonly halls: readonly HallInfo[]) {
    this.rng = new Rng(`${seed}:folk-enc`);
  }
  drainEvents(): FolkEvent[] { const e = this.events; this.events = []; return e; }

  // ── 村民 / 矮人 ──
  /** 依世界生成的配置安排所有村民 / 矮人（建構後呼叫一次；讀檔不影響他們） */
  populate(w: World): void {
    this.npcs = this.npcs.filter((n) => n.site < 0);
    const VROLES: FolkRole[][] = [['smith', 'healer'], ['healer', 'guide'], ['guide', 'smith'], ['smith', 'guide']];
    this.villages.forEach((v, vi) => {
      const roles: FolkRole[] = ['elder', 'trader', ...VROLES[vi % VROLES.length]];
      const plaza = v.board.x;
      roles.forEach((role, k) => {
        const house = role === 'elder' ? v.houses.find((h) => h.role === 'elder')
          : role === 'trader' ? v.houses.find((h) => h.role === 'shop')
            : v.houses.find((h) => h.role === 'home') ?? v.houses[k % v.houses.length];
        const hx = house ? (house.door === house.x0 ? house.x0 - 3 : house.x1 + 3) : plaza;
        const zx = role === 'elder' ? plaza : hx;
        const zone = { x0: Math.max(v.x0 + 3, zx - 5), x1: Math.min(v.x1 - 3, zx + 5) };
        const inside = house ? { x: (house.x0 + house.x1) >> 1, y: house.floorY - 1 } : null;
        this.add(w, `v${vi}:${role}`, role, 'village', vi, zone, v.ground - 1, inside);
      });
    });
    this.halls.forEach((h, hi) => {
      const fy = h.floorY - 1, cx = (h.x0 + h.x1) >> 1;
      this.add(w, `h${hi}:runesmith`, 'runesmith', 'hall', hi, { x0: h.forge.x - 1, x1: h.forge.x + 6 }, fy, null);
      this.add(w, `h${hi}:ore_trader`, 'ore_trader', 'hall', hi, { x0: h.cart.x - 7, x1: h.cart.x - 1 }, fy, null);
      this.add(w, `h${hi}:dwarf_elder`, 'dwarf_elder', 'hall', hi, { x0: cx - 6, x1: cx + 6 }, fy, null);
    });
  }
  private add(w: World, key: string, role: FolkRole, origin: FolkOrigin, site: number, zone: { x0: number; x1: number }, y: number,
    night: { x: number; y: number } | null): FolkNpc {
    const rng = new Rng(`${this.seed}:folk:${key}`);
    const def = ROLES[role];
    const b = makeBody(0, 0);
    const x0 = (zone.x0 + zone.x1) >> 1;
    const spot = findStandSpot(w, x0, y, 6) ?? { x: x0, y };
    b.x = spot.x * S + S / 2 - b.w / 2; b.y = (spot.y + 1) * S - b.h;
    const n: FolkNpc = {
      id: this.nextId++, key, role, race: def.race, origin, name: folkName(def.race, rng), look: folkLook(role, rng), body: b, dir: 1, state: 'idle',
      zone, night, site, t: rng.next() * 3, targetX: null, stuck: 0, say: null, sayT: 0, talks: 0, door: null,
    };
    this.npcs.push(n);
    return n;
  }
  byKey(key: string): FolkNpc | null { return this.npcs.find((n) => n.key === key) ?? null; }
  /** 世界 px (x,y) 上的 NPC（點擊對話用） */
  atPx(x: number, y: number, pad = 4): FolkNpc | null {
    for (const n of this.npcs) {
      const b = n.body;
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return n;
    }
    return null;
  }
  /** 商品（行商的貨依遇見次數） */
  shop(n: FolkNpc): readonly FolkShopEntry[] { return n.role === 'peddler' ? n.stock ?? [] : ROLES[n.role].shop; }

  // ── 好感度 ──
  affinity(key: string): number { return this.aff[key] ?? 0; }
  addAff(key: string, v: number): number {
    const a = Math.max(0, Math.min(AFF_MAX, this.affinity(key) + v));
    this.aff[key] = a;
    return a;
  }
  /** 交易的好感度：每天每人最多 AFF_TRADE_DAILY */
  tradeAff(key: string, day: number): number {
    const d = this.affDay[key] && this.affDay[key].day === day ? this.affDay[key] : (this.affDay[key] = { day, n: 0, talk: this.affDay[key]?.talk });
    const g = Math.min(AFF_TRADE, AFF_TRADE_DAILY - d.n);
    if (g <= 0) return 0;
    d.n += g;
    this.addAff(key, g);
    return g;
  }
  /** 每天第一次說話 +AFF_TALK */
  talkAff(key: string, day: number): number {
    const d = this.affDay[key] ?? (this.affDay[key] = { day, n: 0 });
    if (d.talk === day) return 0;
    d.talk = day;
    this.addAff(key, AFF_TALK);
    return AFF_TALK;
  }

  // ── 每刻 ──
  update(dt: number, h: FolkHost): void {
    const w = h.world, pt = h.playerTile(), night = h.isNight();
    this.pt = pt;
    for (const n of this.npcs) {
      if (n.sayT > 0) { n.sayT -= dt; if (n.sayT <= 0) n.say = null; }
      const far = Math.abs(n.body.x / S - pt.x) > FOLK_ACTIVE.x || Math.abs(n.body.y / S - pt.y) > FOLK_ACTIVE.y;
      if (n.site < 0) { this.stepEncounter(n, dt, h, far); continue; }
      if (far) { this.freeze(n, night, w); continue; }
      this.stepSettled(n, dt, night, h);
    }
    this.npcs = this.npcs.filter((n) => !(n.site < 0 && n.leaving && n.state === 'idle' && (n.t > 40 || this.offscreen(n, h, 6))));
    this.encT -= dt;
    if (this.encT <= 0) { this.encT = ENCOUNTER_EVERY; this.tryEncounters(h); }
  }
  private offscreen(n: FolkNpc, h: FolkHost, extra = 0): boolean {
    const pt = h.playerTile();
    return Math.abs(n.body.x / S - pt.x) > h.viewHalf.w + extra || Math.abs(n.body.y / S - pt.y) > h.viewHalf.h + extra;
  }
  private freeze(n: FolkNpc, night: boolean, w: World): void {
    // 遠處：晚上直接在屋裡、白天回到活動範圍
    const want = night && n.night ? n.night : null;
    const fx = Math.floor((n.body.x + n.body.w / 2) / S);
    if (want && fx !== want.x) this.place(n, w, want.x, want.y);
    else if (!want && n.night && (fx < n.zone.x0 - 2 || fx > n.zone.x1 + 2)) this.place(n, w, (n.zone.x0 + n.zone.x1) >> 1, n.night.y);
    n.door = null;
  }
  private place(n: FolkNpc, w: World, x: number, y: number): void {
    const s = findStandSpot(w, x, y, 4) ?? { x, y };
    const b = n.body;
    b.x = s.x * S + S / 2 - b.w / 2; b.y = (s.y + 1) * S - b.h; b.vx = 0; b.vy = 0;
    n.targetX = null; n.state = 'idle'; n.t = 0;
  }
  private stepSettled(n: FolkNpc, dt: number, night: boolean, h: FolkHost): void {
    const w = h.world, b = n.body;
    n.t += dt;
    const home = night && n.night;
    if (n.targetX === null) {
      if (n.t < 2.5 + (n.id % 4) && !home) { b.vx = 0; this.physics(n, dt, w); this.closeDoor(n, w, h); return; }
      if (home && n.night) n.targetX = (n.night.x + 0.5) * S;
      else {
        const span = n.zone.x1 - n.zone.x0 + 1;
        n.targetX = (n.zone.x0 + ((n.id * 5 + Math.floor(n.t * 1.7)) % span) + 0.5) * S;
      }
      n.state = 'walk'; n.t = 0; n.stuck = 0;
    }
    this.walkTo(n, n.targetX, dt, h);
    if (home && n.state === 'idle') n.targetX = (n.night!.x + 0.5) * S; // 到家就停在家裡
  }
  /** 往 tx（px）走；到了 → idle */
  private walkTo(n: FolkNpc, tx: number | null, dt: number, h: FolkHost, speed = FOLK_WALK): void {
    const w = h.world, b = n.body;
    const cx = b.x + b.w / 2;
    if (tx === null || Math.abs(tx - cx) < 3) {
      b.vx = 0;
      if (n.state === 'walk') { n.state = 'idle'; n.targetX = null; n.t = 0; }
    } else {
      n.dir = tx > cx ? 1 : -1;
      b.vx = n.dir * speed;
      this.openDoorAhead(n, w);
    }
    const r = this.physics(n, dt, w);
    if (n.state === 'walk' && r.hitX) {
      n.stuck += dt;
      if (b.onGround && n.stuck > 0.2 && n.stuck < 0.26) b.vy = -JUMP_SPEED;
      if (n.stuck > 2) { n.state = 'idle'; n.targetX = null; n.t = 0; b.vx = 0; }
    } else n.stuck = 0;
    this.closeDoor(n, w, h);
  }
  private physics(n: FolkNpc, dt: number, w: World): { hitX: boolean } {
    const b = n.body;
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    const q: SolidQuery = { isSolid: (x, y) => w.isSolid(x, y), isPlatform: (x, y) => w.isPlatform(x, y), isHalf: (x, y) => w.isHalf(x, y) };
    const r = moveBody(q, b, dt, b.onGround);
    if (b.gfxOffY > 0) b.gfxOffY = Math.max(0, b.gfxOffY - 120 * dt);
    return r;
  }
  private openDoorAhead(n: FolkNpc, w: World): void {
    const b = n.body;
    const ax = n.dir > 0 ? Math.floor((b.x + b.w + 2) / S) : Math.floor((b.x - 2) / S);
    const fy = Math.floor((b.y + b.h - 1) / S);
    if (w.getFg(ax, fy) !== T.DOOR_CLOSED) return;
    let top = fy, bot = fy;
    while (isDoor(w.getFg(ax, top - 1)) && fy - top < 4) top--;
    while (isDoor(w.getFg(ax, bot + 1)) && bot - fy < 4) bot++;
    for (let y = top; y <= bot; y++) w.setFg(ax, y, T.DOOR_OPEN);
    n.door = { x: ax, top, bot };
  }
  private closeDoor(n: FolkNpc, w: World, h: FolkHost): void {
    const d = n.door;
    if (!d) return;
    const b = n.body;
    if (!(b.x > (d.x + 1) * S + 2 || b.x + b.w < d.x * S - 2)) return;
    for (let y = d.top; y <= d.bot; y++) {
      if (w.getFg(d.x, y) !== T.DOOR_OPEN) { n.door = null; return; }
      if (h.playerOverlaps(d.x, y)) return;
    }
    for (let y = d.top; y <= d.bot; y++) w.setFg(d.x, y, T.DOOR_CLOSED);
    n.door = null;
  }

  // ── 遇見 ──
  travellers(): FolkNpc[] { return this.npcs.filter((n) => n.site < 0); }
  private tryEncounters(h: FolkHost): void {
    const now = h.time, pt = h.playerTile();
    const chance = (p: number): boolean => this.rng.next() < (this.chanceOverride ?? p);
    const enc = this.travellers();
    if (!h.isNight() && now >= this.enc.nextTraveller && !enc.some((n) => n.origin === 'road') && h.onSurface(pt.x, pt.y) && !h.safeAt(pt.x, pt.y) && chance(TRAVELLER_CHANCE)) {
      const spot = this.roadSpot(h);
      if (spot) {
        const herb = h.wantHerbalist() && this.enc.visits % 2 === 1;
        this.spawnTraveller(h.world, herb ? 'herbalist' : 'peddler', spot.x, spot.y, now);
        return;
      }
    }
    if (now >= this.enc.nextStranded && this.enc.stranded < STRANDED_MAX && !enc.some((n) => n.origin === 'cave') && h.underground(pt.x, pt.y) && !h.safeAt(pt.x, pt.y)
      && chance(STRANDED_CHANCE)) {
      const spot = this.caveSpot(h);
      if (spot) this.spawnStranded(h.world, spot.x, spot.y, now);
    }
  }
  /** 地表路邊：玩家左右 ENC_DIST 格、畫面外、5 欄平坦、上面是天空、沒有水、不在村落 / 據點 */
  roadSpot(h: FolkHost): { x: number; y: number } | null {
    const w = h.world, pt = h.playerTile();
    const order = this.rng.chance(2) ? [1, -1] : [-1, 1];
    for (const dir of order) {
      for (let d = Math.max(ENC_DIST.min, h.viewHalf.w + 3); d <= Math.max(ENC_DIST.max, h.viewHalf.w + 18); d += 2) {
        const x = pt.x + dir * d;
        if (x < 6 || x >= w.width - 6) break;
        const g = this.groundAt(w, x, pt.y);
        if (g === null || !h.onSurface(x, g) || h.safeAt(x, g)) continue;
        let flat = true;
        for (let k = -2; k <= 2 && flat; k++) { const gk = this.groundAt(w, x + k, g); if (gk === null || Math.abs(gk - g) > 1) flat = false; }
        if (!flat || w.getLiquid(x, g) || w.getLiquid(x, g + 1)) continue;
        return { x, y: g };
      }
    }
    return null;
  }
  /** (x, 附近) 的站立列：往上下找第一個站得住、頭上 3 格空的位置 */
  private groundAt(w: World, x: number, near: number): number | null {
    for (let k = 0; k <= 24; k++) for (const y of k ? [near - k, near + k] : [near]) if (standable(w, x, y)) return y;
    return null;
  }
  /** 洞穴地板：玩家周圍、畫面外、天然背景（不是房子 / 地城）、沒有水、地底 */
  caveSpot(h: FolkHost): { x: number; y: number } | null {
    const w = h.world, pt = h.playerTile();
    for (let t = 0; t < 40; t++) {
      const dx = (this.rng.chance(2) ? 1 : -1) * this.rng.int(Math.max(ENC_DIST.min, h.viewHalf.w + 2), Math.max(ENC_DIST.max, h.viewHalf.w + 16));
      const dy = this.rng.int(-12, 20);
      const s = findStandSpot(w, pt.x + dx, pt.y + dy, 6);
      if (!s || !h.underground(s.x, s.y) || h.safeAt(s.x, s.y)) continue;
      if (Math.abs(s.x - pt.x) <= h.viewHalf.w && Math.abs(s.y - pt.y) <= h.viewHalf.h) continue;
      const i = w.idx(s.x, s.y);
      if (HOUSE_WALLS.has(w.wall[i]) || w.wall[i] >= 10 && w.wall[i] <= 12 || w.liquid[i] || w.getLiquid(s.x, s.y - 1)) continue;
      return s;
    }
    return null;
  }
  spawnTraveller(w: World, role: 'peddler' | 'herbalist', x: number, y: number, now: number): FolkNpc {
    const visit = this.enc.visits++;
    const n = this.add(w, `road:${role}`, role, 'road', -1, { x0: x - 3, x1: x + 3 }, y, null);
    this.npcs = this.npcs.filter((q) => q === n || q.key !== n.key);
    n.visit = visit;
    if (role === 'peddler') n.stock = peddlerStock(this.seed, visit);
    n.since = now; n.leaveAt = now + TRAVELLER_STAY;
    this.enc.nextTraveller = now + TRAVELLER_CD;
    this.emit('appear', n, w, this.pt);
    return n;
  }
  spawnStranded(w: World, x: number, y: number, now: number): FolkNpc {
    const k = this.enc.stranded++;
    const n = this.add(w, `cave:stranded:${k}`, 'stranded', 'cave', -1, { x0: x, x1: x }, y, null);
    n.since = now; n.leaveAt = now + STRANDED_WAIT;
    this.enc.nextStranded = now + STRANDED_CD;
    this.emit('appear', n, w, this.pt);
    return n;
  }
  private emit(phase: FolkEvent['phase'], n: FolkNpc, w: World, pt?: { x: number; y: number }): void {
    void w;
    const fx = Math.floor((n.body.x + n.body.w / 2) / S), fy = Math.floor((n.body.y + n.body.h - 1) / S);
    this.events.push({ type: 'folk', phase, key: n.key, role: n.role, name: n.name, x: fx, y: fy, dx: pt ? fx - pt.x : 0, dy: pt ? fy - pt.y : 0 });
  }
  /** 受困探險者：開始跟著玩家 */
  startFollow(n: FolkNpc): boolean {
    if (n.role !== 'stranded' || n.following || n.safe) return false;
    n.following = true; n.leaveAt = undefined;
    return true;
  }
  /** 護送完成後 / 旅人要走了：往遠離玩家的方向走掉 */
  dismiss(n: FolkNpc): void { n.leaving = true; n.following = false; n.targetX = null; n.state = 'walk'; n.t = 0; }

  private stepEncounter(n: FolkNpc, dt: number, h: FolkHost, far: boolean): void {
    const w = h.world, now = h.time, pt = h.playerTile();
    n.t += dt;
    if (n.leaving) {
      if (far) { n.state = 'idle'; n.t = 99; return; }
      const away = n.body.x / S < pt.x ? -1 : 1;
      n.state = 'walk';
      this.walkTo(n, n.body.x + away * 6 * S, dt, h);
      n.state = 'idle'; // 走掉的人 idle + 畫面外就被移除
      return;
    }
    if (n.role === 'stranded') {
      if (n.following) { this.stepFollow(n, dt, h); return; }
      if (!n.safe) {
        // 喊救命
        n.helpT = (n.helpT ?? 0) - dt;
        if (n.helpT <= 0) { n.helpT = 7; n.say = ROLES.stranded.lines[n.talks % 2]; n.sayT = 3; }
        if (n.leaveAt !== undefined && now >= n.leaveAt) { this.emit('giveup', n, w, pt); this.dismiss(n); n.t = 99; }
        if (!far) this.physics(n, dt, w);
        return;
      }
      if (!far) { n.body.vx = 0; this.physics(n, dt, w); }
      return;
    }
    // 旅人：時間到 / 天黑就上路
    if ((n.leaveAt !== undefined && now >= n.leaveAt) || h.isNight()) { this.emit('leave', n, w, pt); this.dismiss(n); return; }
    if (far) return;
    if (n.targetX === null && n.t > 3 + (n.id % 3)) { n.targetX = (n.zone.x0 + ((n.id + Math.floor(n.t)) % (n.zone.x1 - n.zone.x0 + 1)) + 0.5) * S; n.state = 'walk'; n.t = 0; }
    this.walkTo(n, n.targetX, dt, h);
  }
  /** 跟著玩家：走到玩家背後；卡住 / 掉隊太遠 → 直接站到玩家身邊（「抓著你的衣角跟上來」）；到安全的地方 → 護送完成 */
  private stepFollow(n: FolkNpc, dt: number, h: FolkHost): void {
    const w = h.world, pt = h.playerTile(), b = n.body;
    const fx = Math.floor((b.x + b.w / 2) / S), fy = Math.floor((b.y + b.h - 1) / S);
    const dist = Math.max(Math.abs(fx - pt.x), Math.abs(fy - pt.y));
    if (dist > 12 || (n.stuck > 1.2 && dist > 3)) {
      const s = findStandSpot(w, pt.x, pt.y, 4);
      if (s) { b.x = s.x * S + S / 2 - b.w / 2; b.y = (s.y + 1) * S - b.h; b.vx = 0; b.vy = 0; n.stuck = 0; }
    }
    const side = b.x / S < pt.x ? -1 : 1;
    n.state = 'walk';
    const tx = Math.abs(fx - pt.x) > 2 ? (pt.x + side * 1.5) * S : null;
    if (tx === null) n.state = 'idle';
    this.walkTo(n, tx, dt, h, FOLK_WALK * 2.2);
    if (tx !== null) n.state = 'walk';
    if (h.safeAt(fx, fy) || h.onSurface(fx, fy)) {
      n.following = false; n.safe = true; n.state = 'idle'; b.vx = 0;
      n.say = ROLES.stranded.lines[2]; n.sayT = 4;
      this.emit('safe', n, w, pt);
    }
  }

  // ── 存檔 ──
  toJSON(): FolkJSON {
    const r = (v: number): number => Math.round(v * 100) / 100;
    return {
      aff: { ...this.aff },
      affDay: Object.fromEntries(Object.entries(this.affDay).map(([k, v]) => [k, { ...v }])),
      enc: { ...this.enc, nextTraveller: r(this.enc.nextTraveller), nextStranded: r(this.enc.nextStranded) },
      travellers: this.travellers().filter((n) => !n.leaving).map((n) => {
        const o: FolkTravellerJSON = { key: n.key, role: n.role, x: r(n.body.x), y: r(n.body.y), since: r(n.since ?? 0), leaveAt: r(n.leaveAt ?? 0) };
        if (n.visit !== undefined) o.visit = n.visit;
        if (n.following) o.following = true;
        if (n.safe) o.safe = true;
        return o;
      }),
    };
  }
  load(j: unknown, w: World): void {
    this.aff = {}; this.affDay = {};
    this.enc = { nextTraveller: DAY_LENGTH * 0.25, nextStranded: DAY_LENGTH * 0.5, stranded: 0, visits: 0 };
    this.npcs = this.npcs.filter((n) => n.site >= 0);
    if (!j || typeof j !== 'object') return;
    const o = j as Partial<FolkJSON>;
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const int = (v: unknown): v is number => Number.isInteger(v);
    if (o.aff && typeof o.aff === 'object') for (const [k, v] of Object.entries(o.aff)) if (num(v)) this.aff[k] = Math.max(0, Math.min(AFF_MAX, v));
    if (o.affDay && typeof o.affDay === 'object') {
      for (const [k, v] of Object.entries(o.affDay)) if (v && int(v.day) && int(v.n)) this.affDay[k] = { day: v.day, n: Math.max(0, Math.min(AFF_TRADE_DAILY, v.n)), ...(int(v.talk) ? { talk: v.talk } : {}) };
    }
    const e = o.enc;
    if (e && typeof e === 'object') {
      if (num(e.nextTraveller)) this.enc.nextTraveller = e.nextTraveller;
      if (num(e.nextStranded)) this.enc.nextStranded = e.nextStranded;
      if (int(e.stranded)) this.enc.stranded = Math.max(0, Math.min(STRANDED_MAX, e.stranded));
      if (int(e.visits)) this.enc.visits = Math.max(0, e.visits);
    }
    for (const t of Array.isArray(o.travellers) ? o.travellers : []) {
      if (!t || typeof t.key !== 'string' || !['peddler', 'herbalist', 'stranded'].includes(t.role) || !num(t.x) || !num(t.y)) continue;
      if (this.byKey(t.key) || t.x < 0 || t.y < 0 || t.x > w.width * S || t.y > w.height * S) continue;
      const tx = Math.floor(t.x / S), ty = Math.floor(t.y / S);
      const n = this.add(w, t.key, t.role, t.role === 'stranded' ? 'cave' : 'road', -1, { x0: tx - 3, x1: tx + 3 }, ty + 2, null);
      n.body.x = t.x; n.body.y = t.y;
      n.since = num(t.since) ? t.since : 0; n.leaveAt = num(t.leaveAt) ? t.leaveAt : 0;
      if (t.role === 'peddler') { n.visit = int(t.visit) ? t.visit : 0; n.stock = peddlerStock(this.seed, n.visit); }
      if (t.following) n.following = true;
      if (t.safe) n.safe = true;
      if (n.following || n.safe) n.leaveAt = undefined;
    }
  }
}

/** debug / 測試：站立列下面那格是不是實心 */
export function groundSolid(w: World, x: number, y: number): boolean { return isSolidTile(w.getFg(x, y + 1)); }
