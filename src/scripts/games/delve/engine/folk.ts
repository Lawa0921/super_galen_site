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
import { findStandSpot, findPath, standable, type PathNode } from './npcPath';
import { Rng } from './rng';
import { HOUSE_WALLS } from './furniture';
import type { VillageInfo, HallInfo } from './legacy/gen/settlements';
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
/** 受困探險者的血量；被怪物碰到後的無敵時間（秒） */
export const STRANDED_HP = 60;
export const FOLK_HURT_CD = 0.8;
/** 跟隨：離玩家超過這麼遠（格）就停下來原地等（玩家傳送 / 死亡重生走掉了）；卡住超過 STUCK_TP 秒、而且在 TP_RANGE 格內才直接站到玩家身邊 */
export const FOLLOW_LOST = 40;
export const STUCK_TP = 5;
export const TP_RANGE = 30;

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
  /** 受困探險者：跟著玩家 / 已經安全了（護送完成）/ 原地等玩家回來（玩家傳送或死亡後） */
  following?: boolean; safe?: boolean; waiting?: boolean;
  helpT?: number;
  /** 行商：每項商品剩幾件 */
  left?: number[];
  /** 受困探險者的血量 / 受傷冷卻 */
  hp?: number; hurtCd?: number;
  /** 跟隨用的 BFS 路（world.rev + 目標快取）、重算倒數、最近距離 / 沒進展的秒數 */
  path?: { nodes: PathNode[]; rev: number; gx: number; gy: number } | null;
  pathT?: number; best?: number; lost?: number;
}

export interface FolkTravellerJSON {
  key: string; role: FolkRole; x: number; y: number; visit?: number; since: number; leaveAt: number;
  /** 只有 toJSON({ ids: true })（連線的世界快照）才帶；存檔不帶 */
  id?: number;
  following?: boolean; safe?: boolean; leaving?: boolean; waiting?: boolean;
  /** 行商的剩餘庫存 / 探險者的血量 */
  left?: number[]; hp?: number;
}
export interface FolkJSON {
  aff: Record<string, number>;
  /** 交易好感度的每日計數、每日說話 */
  affDay: Record<string, { day: number; n: number; talk?: number }>;
  enc: { nextTraveller: number; nextStranded: number; stranded: number; visits: number };
  travellers: FolkTravellerJSON[];
}

export type FolkEvent =
  | { type: 'folk'; phase: 'appear' | 'leave' | 'safe' | 'giveup' | 'hurt' | 'died' | 'wait'; key: string; role: FolkRole; name: string; x: number; y: number; dx: number; dy: number };

export interface FolkHost {
  world: World;
  time: number;
  day: number;
  isNight(): boolean;
  /** 活著的玩家站的 tile（插入順序，第一個 = 本地 / 最先加入的；全員死亡 → 所有人的）；呼叫端取最近者 */
  playerTiles(): { x: number; y: number }[];
  /** 畫面半寬 / 半高（格）：遇見要在畫面外出現 */
  viewHalf: { w: number; h: number };
  /** 地底（岩層以下）而且不在地城 */
  underground(x: number, y: number): boolean;
  /** 地表（離生成地表 ≤ 4 格、上面看得到天空） */
  onSurface(x: number, y: number): boolean;
  /** 在據點範圍 / 村落 / 地廳裡（安全的地方：旅人不在這裡出現；護送到這裡算完成） */
  safeAt(x: number, y: number): boolean;
  /** 有任何玩家的身體碰到 tile（關門前確認沒夾到人） */
  playerOverlaps(x: number, y: number): boolean;
  /** 健康的據點 / 治療師居民已經有了 → 旅人只會是行商 */
  wantHerbalist(): boolean;
}

const isDoor = (id: number): boolean => id === T.DOOR_CLOSED || id === T.DOOR_OPEN;
/** 離 (x, y)（tile）最近的玩家 tile（距離相同取前面的） */
function nearestTile(tiles: readonly { x: number; y: number }[], x: number, y: number): { x: number; y: number } {
  let best = tiles[0], bd = Infinity;
  for (const t of tiles) { const d = (t.x - x) ** 2 + (t.y - y) ** 2; if (d < bd) { bd = d; best = t; } }
  return best;
}
/** NPC 所在 tile（中心欄、腳底列） */
const npcTile = (n: FolkNpc): { x: number; y: number } => ({ x: Math.floor((n.body.x + n.body.w / 2) / S), y: Math.floor((n.body.y + n.body.h - 1) / S) });

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
    // 第一座村子一定有嚮導（每個世界都找得到）；有兩座以上時鐵匠 / 醫者 / 嚮導都會出現
    const VROLES: FolkRole[][] = [['guide', 'smith'], ['healer', 'guide'], ['smith', 'healer'], ['guide', 'healer']];
    this.villages.forEach((v, vi) => {
      const roles: FolkRole[] = ['elder', 'trader', ...VROLES[vi % VROLES.length]];
      const zones = villageZones(v);
      const used = new Map<VillageInfo['houses'][number], number>();
      roles.forEach((role, k) => {
        const pref = role === 'elder' ? 'elder' : role === 'trader' ? 'shop' : 'home';
        const house = v.houses.find((h) => h.role === pref && !used.has(h)) ?? v.houses.find((h) => h.role === pref)
          ?? v.houses[k % v.houses.length];
        // 晚上：同一棟屋裡的人各站一格（不疊在一起）
        let inside: { x: number; y: number } | null = null;
        if (house) {
          const slot = used.get(house) ?? 0;
          used.set(house, slot + 1);
          const span = house.x1 - house.x0 - 3;
          inside = { x: house.x0 + 2 + ((slot * 3) % Math.max(1, span)), y: house.floorY - 1 };
        }
        this.add(w, `v${vi}:${role}`, role, 'village', vi, zones[k], v.ground - 1, inside);
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
  /** 世界 px (x,y) 上的 NPC（點擊對話用）：好幾位重疊時選身體中心離游標最近的那位 */
  atPx(x: number, y: number, pad = 4): FolkNpc | null {
    let best: FolkNpc | null = null, bd = Infinity;
    for (const n of this.npcs) {
      const b = n.body;
      if (!(x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad)) continue;
      const d = Math.hypot(b.x + b.w / 2 - x, (b.y + b.h / 2 - y) * 0.5);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  /** 商品（行商的貨依遇見次數） */
  shop(n: FolkNpc): readonly FolkShopEntry[] { return n.role === 'peddler' ? n.stock ?? [] : ROLES[n.role].shop; }
  /** 第 i 項還剩幾件（行商有庫存，其他人無限） */
  stockLeft(n: FolkNpc, i: number): number { return n.role === 'peddler' ? n.left?.[i] ?? 0 : Infinity; }
  takeStock(n: FolkNpc, i: number): void { if (n.role === 'peddler' && n.left && n.left[i] > 0) n.left[i]--; }
  /** 記下玩家位置（遇見提示的方向用；update 以外生出 NPC 時先呼叫） */
  notePlayer(pt: { x: number; y: number }): void { this.pt = pt; }
  /** 玩家死了：跟著的探險者停在原地等（不會跟著重生傳送、也不會算安全） */
  playerDied(): void {
    for (const n of this.npcs) if (n.following) { n.following = false; n.waiting = true; n.say = '等等我……我在這裡等你回來。'; n.sayT = 5; n.body.vx = 0; }
  }
  /** 探險者受傷（被怪物碰到）；死了 → 從世界移除、回傳 true（呼叫端讓護送失敗） */
  hurt(n: FolkNpc, amount: number, w: World): boolean {
    if ((n.hurtCd ?? 0) > 0 || amount <= 0) return false;
    n.hp = Math.max(0, (n.hp ?? STRANDED_HP) - amount);
    n.hurtCd = FOLK_HURT_CD;
    n.body.vy = -160;
    if (n.hp > 0) { this.emit('hurt', n, w, this.pt); n.say = '好痛！'; n.sayT = 1.5; return false; }
    this.emit('died', n, w, this.pt);
    this.npcs = this.npcs.filter((q) => q !== n);
    // 可以再遇到下一位（冷卻照算）
    this.enc.stranded = Math.max(0, this.enc.stranded - 1);
    return true;
  }

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
    const w = h.world, tiles = h.playerTiles(), night = h.isNight();
    // 遇見提示的方向以第一個（活著的）玩家為準
    this.pt = tiles[0];
    for (const n of this.npcs) {
      if (n.sayT > 0) { n.sayT -= dt; if (n.sayT <= 0) n.say = null; }
      // 離每個玩家都超過活動範圍才算遠
      const far = tiles.every((pt) => Math.abs(n.body.x / S - pt.x) > FOLK_ACTIVE.x || Math.abs(n.body.y / S - pt.y) > FOLK_ACTIVE.y);
      if (n.site < 0) { this.stepEncounter(n, dt, h, far); continue; }
      if (far) { this.freeze(n, night, w); continue; }
      this.stepSettled(n, dt, night, h);
    }
    this.npcs = this.npcs.filter((n) => !(n.site < 0 && n.leaving && n.state === 'idle' && (n.t > 40 || this.offscreen(n, h, 6))));
    this.encT -= dt;
    if (this.encT <= 0) { this.encT = ENCOUNTER_EVERY; this.tryEncounters(h); }
  }
  /** 在每個玩家的畫面外 */
  private offscreen(n: FolkNpc, h: FolkHost, extra = 0): boolean {
    return h.playerTiles().every((pt) => Math.abs(n.body.x / S - pt.x) > h.viewHalf.w + extra || Math.abs(n.body.y / S - pt.y) > h.viewHalf.h + extra);
  }
  /** (x, y) 在某個玩家的畫面內 */
  private onScreen(h: FolkHost, x: number, y: number): boolean {
    return h.playerTiles().some((pt) => Math.abs(x - pt.x) <= h.viewHalf.w && Math.abs(y - pt.y) <= h.viewHalf.h);
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
  /** 遇見：以第一個（活著的）玩家為中心（多人時輪流 / 各自的遇見留給之後調整） */
  private tryEncounters(h: FolkHost): void {
    const now = h.time, pt = h.playerTiles()[0];
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
    const w = h.world, pt = h.playerTiles()[0];
    const order = this.rng.chance(2) ? [1, -1] : [-1, 1];
    for (const dir of order) {
      for (let d = Math.max(ENC_DIST.min, h.viewHalf.w + 3); d <= Math.max(ENC_DIST.max, h.viewHalf.w + 18); d += 2) {
        const x = pt.x + dir * d;
        if (x < w.xMin + 6 || x >= w.xMax - 6) break;
        const g = this.groundAt(w, x, pt.y);
        if (g === null || !h.onSurface(x, g) || h.safeAt(x, g)) continue;
        let flat = true;
        for (let k = -2; k <= 2 && flat; k++) { const gk = this.groundAt(w, x + k, g); if (gk === null || Math.abs(gk - g) > 1) flat = false; }
        if (!flat || w.getLiquid(x, g) || w.getLiquid(x, g + 1)) continue;
        if (this.onScreen(h, x, g)) continue;
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
    const w = h.world, pt = h.playerTiles()[0];
    for (let t = 0; t < 40; t++) {
      const dx = (this.rng.chance(2) ? 1 : -1) * this.rng.int(Math.max(ENC_DIST.min, h.viewHalf.w + 2), Math.max(ENC_DIST.max, h.viewHalf.w + 16));
      const dy = this.rng.int(-12, 20);
      const s = findStandSpot(w, pt.x + dx, pt.y + dy, 6);
      if (!s || !h.underground(s.x, s.y) || h.safeAt(s.x, s.y)) continue;
      if (this.onScreen(h, s.x, s.y)) continue;
      const wl = w.getWall(s.x, s.y);
      if (HOUSE_WALLS.has(wl) || wl >= 10 && wl <= 12 || w.getLiquid(s.x, s.y) || w.getLiquid(s.x, s.y - 1)) continue;
      return s;
    }
    return null;
  }
  spawnTraveller(w: World, role: 'peddler' | 'herbalist', x: number, y: number, now: number): FolkNpc {
    const visit = this.enc.visits++;
    const n = this.add(w, `road:${role}`, role, 'road', -1, { x0: x - 3, x1: x + 3 }, y, null);
    this.npcs = this.npcs.filter((q) => q === n || q.key !== n.key);
    n.visit = visit;
    if (role === 'peddler') { n.stock = peddlerStock(this.seed, visit); n.left = peddlerLeft(this.seed, visit, n.stock.length); }
    n.since = now; n.leaveAt = now + TRAVELLER_STAY;
    this.enc.nextTraveller = now + TRAVELLER_CD;
    this.emit('appear', n, w, this.pt);
    return n;
  }
  spawnStranded(w: World, x: number, y: number, now: number): FolkNpc {
    const k = this.enc.stranded++;
    const n = this.add(w, `cave:stranded:${k}`, 'stranded', 'cave', -1, { x0: x, x1: x }, y, null);
    n.since = now; n.leaveAt = now + STRANDED_WAIT;
    n.hp = STRANDED_HP;
    this.enc.nextStranded = now + STRANDED_CD;
    this.emit('appear', n, w, this.pt);
    return n;
  }
  private emit(phase: FolkEvent['phase'], n: FolkNpc, w: World, pt?: { x: number; y: number }): void {
    void w;
    const fx = Math.floor((n.body.x + n.body.w / 2) / S), fy = Math.floor((n.body.y + n.body.h - 1) / S);
    this.events.push({ type: 'folk', phase, key: n.key, role: n.role, name: n.name, x: fx, y: fy, dx: pt ? fx - pt.x : 0, dy: pt ? fy - pt.y : 0 });
  }
  /** 受困探險者：開始（或繼續）跟著玩家 */
  startFollow(n: FolkNpc): boolean {
    if (n.role !== 'stranded' || n.following || n.safe) return false;
    n.following = true; n.waiting = false; n.leaveAt = undefined;
    n.path = null; n.best = undefined; n.lost = 0;
    return true;
  }
  /** 護送完成後 / 旅人要走了：往遠離玩家的方向走掉 */
  dismiss(n: FolkNpc): void { n.leaving = true; n.following = false; n.targetX = null; n.state = 'walk'; n.t = 0; }

  private stepEncounter(n: FolkNpc, dt: number, h: FolkHost, far: boolean): void {
    const t = npcTile(n), w = h.world, now = h.time, pt = nearestTile(h.playerTiles(), t.x, t.y);
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
      if ((n.hurtCd ?? 0) > 0) n.hurtCd = Math.max(0, (n.hurtCd ?? 0) - dt);
      if (n.following) { this.stepFollow(n, dt, h); return; }
      if (n.waiting) { if (!far) { n.body.vx = 0; this.physics(n, dt, w); } return; }
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
  /**
   * 跟著玩家：沿 BFS 路（npcPath.findPath，世界有改 / 玩家走開才重算）走到玩家旁邊；
   * 一直沒有進展（STUCK_TP 秒）而且玩家在 TP_RANGE 格內 → 才直接站到玩家身邊（真的被擋死）；
   * 玩家跑太遠（傳送 / 死亡重生）→ 停下來原地等。到安全的地方（自己站的地方，而且玩家就在旁邊）→ 護送完成
   */
  private stepFollow(n: FolkNpc, dt: number, h: FolkHost): void {
    const w = h.world, b = n.body;
    const fx = Math.floor((b.x + b.w / 2) / S), fy = Math.floor((b.y + b.h - 1) / S);
    // 跟著最近的（活著的）玩家
    const pt = nearestTile(h.playerTiles(), fx, fy);
    const dist = Math.max(Math.abs(fx - pt.x), Math.abs(fy - pt.y));
    if (dist > FOLLOW_LOST) {
      n.following = false; n.waiting = true; n.state = 'idle'; b.vx = 0; n.path = null;
      n.say = '等等我……我在這裡等你回來。'; n.sayT = 5;
      this.emit('wait', n, w, pt);
      return;
    }
    // 進展：離玩家的最近距離有變小就重置計時
    if (n.best === undefined || dist < n.best) { n.best = dist; n.lost = 0; } else n.lost = (n.lost ?? 0) + dt;
    if (dist <= 2) { n.best = dist; n.lost = 0; }
    if ((n.lost ?? 0) > STUCK_TP && dist <= TP_RANGE && dist > 2) {
      const s = findStandSpot(w, pt.x, pt.y, 4);
      if (s) { b.x = s.x * S + S / 2 - b.w / 2; b.y = (s.y + 1) * S - b.h; b.vx = 0; b.vy = 0; n.path = null; }
      n.lost = 0; n.best = undefined;
    }
    let tx: number | null = null, up = 0;
    if (Math.abs(fx - pt.x) > 2 || Math.abs(fy - pt.y) > 2) {
      n.pathT = (n.pathT ?? 0) - dt;
      const p = n.path;
      if (b.onGround && (!p || p.rev !== w.rev || Math.abs(p.gx - pt.x) > 1 || Math.abs(p.gy - pt.y) > 1 || (n.pathT ?? 0) <= 0)) {
        const cols = [fx, Math.floor(b.x / S), Math.floor((b.x + b.w - 0.01) / S)];
        const sx = cols.find((c) => standable(w, c, fy)) ?? fx;
        const gy = standable(w, pt.x, pt.y) ? pt.y : (findStandSpot(w, pt.x, pt.y, 3)?.y ?? pt.y);
        const bounds = { x0: Math.min(fx, pt.x) - 30, x1: Math.max(fx, pt.x) + 30, y0: Math.min(fy, pt.y) - 25, y1: Math.max(fy, pt.y) + 25 };
        n.path = { nodes: findPath(w, sx, fy, pt.x, gy, 2500, bounds), rev: w.rev, gx: pt.x, gy: pt.y };
        n.pathT = 0.7;
      }
      const nodes = n.path?.nodes ?? [];
      const cols = [fx, Math.floor(b.x / S), Math.floor((b.x + b.w - 0.01) / S)];
      let i = -1;
      for (let k = nodes.length - 1; k >= 0; k--) if (cols.includes(nodes[k].x) && Math.abs(nodes[k].y - fy) <= (b.onGround ? 1 : 5)) { i = k; break; }
      const next = nodes[i + 1];
      if (next) { tx = (next.x + 0.5) * S; up = fy - next.y; } else tx = (pt.x + (b.x / S < pt.x ? -1.5 : 1.5)) * S;
    }
    n.state = tx === null ? 'idle' : 'walk';
    if (up >= 1 && b.onGround) b.vy = -JUMP_SPEED;
    this.walkTo(n, tx, dt, h, FOLK_WALK * 2.2);
    n.state = tx === null ? 'idle' : 'walk';
    if (dist <= 8 && (h.safeAt(fx, fy) || h.onSurface(fx, fy))) {
      n.following = false; n.safe = true; n.state = 'idle'; b.vx = 0;
      n.say = ROLES.stranded.lines[2]; n.sayT = 4;
      this.emit('safe', n, w, pt);
    }
  }

  // ── 存檔 ──
  toJSON(opts: { ids?: boolean } = {}): FolkJSON {
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
        if (n.waiting) o.waiting = true;
        if (n.left) o.left = [...n.left];
        if (n.hp !== undefined) o.hp = n.hp;
        if (opts.ids) o.id = n.id;
        return o;
      }),
    };
  }
  /** trust = true：客人副本，旅人沿用房主的 id */
  load(j: unknown, w: World, trust = false): void {
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
      if (this.byKey(t.key) || t.x < w.xMin * S || t.y < 0 || t.x > w.xMax * S || t.y > w.height * S) continue;
      const tx = Math.floor(t.x / S), ty = Math.floor(t.y / S);
      const n = this.add(w, t.key, t.role, t.role === 'stranded' ? 'cave' : 'road', -1, { x0: tx - 3, x1: tx + 3 }, ty + 2, null);
      n.body.x = t.x; n.body.y = t.y;
      if (trust && int(t.id) && t.id > 0) { n.id = t.id; this.nextId = Math.max(this.nextId, t.id + 1); } // 客人副本：旅人 id 與房主一致
      n.since = num(t.since) ? t.since : 0; n.leaveAt = num(t.leaveAt) ? t.leaveAt : 0;
      if (t.role === 'peddler') {
        n.visit = int(t.visit) ? t.visit : 0; n.stock = peddlerStock(this.seed, n.visit);
        const full = peddlerLeft(this.seed, n.visit, n.stock.length);
        n.left = full.map((m, i) => (Array.isArray(t.left) && int(t.left[i]) ? Math.max(0, Math.min(m, t.left[i])) : m));
      }
      if (t.role === 'stranded') n.hp = num(t.hp) ? Math.max(1, Math.min(STRANDED_HP, t.hp)) : STRANDED_HP;
      if (t.following) n.following = true;
      if (t.safe) n.safe = true;
      if (t.waiting && !n.following && !n.safe) n.waiting = true;
      if (n.following || n.safe || n.waiting) n.leaveAt = undefined;
    }
  }
}

/** 行商每項貨的庫存（1～3 件，依種子 + 遇見次數） */
export function peddlerLeft(seed: string, visit: number, n: number): number[] {
  const rng = new Rng(`${seed}:peddler-left:${visit}`);
  return Array.from({ length: n }, () => rng.int(1, 4));
}
/**
 * 村裡四位 NPC 各自的白天活動範圍（互不重疊）：村長在廣場左半、雜貨商在廣場右半、
 * 另外兩位在村子兩端（旗桿 / 圍欄那一段）；兩端太窄就退回廣場邊緣。
 */
export function villageZones(v: VillageInfo): { x0: number; x1: number }[] {
  const bx = v.board.x;
  const leftH = v.houses.filter((h) => h.x1 < bx), rightH = v.houses.filter((h) => h.x0 > bx);
  const p0 = leftH.length ? Math.max(...leftH.map((h) => h.x1)) + 2 : bx - 6;
  const p1 = rightH.length ? Math.min(...rightH.map((h) => h.x0)) - 2 : bx + 6;
  const first = Math.min(...v.houses.map((h) => h.x0)), last = Math.max(...v.houses.map((h) => h.x1));
  const zones = [
    { x0: p0 + 1, x1: bx - 2 },
    { x0: bx + 2, x1: p1 - 1 },
    { x0: v.x0 + 3, x1: Math.max(v.x0 + 4, first - 2) },
    { x0: Math.min(v.x1 - 4, last + 2), x1: v.x1 - 3 },
  ];
  return zones.map((z) => (z.x1 < z.x0 ? { x0: z.x1, x1: z.x0 } : z));
}

/** debug / 測試：站立列下面那格是不是實心 */
export function groundSolid(w: World, x: number, y: number): boolean { return isSolidTile(w.getFg(x, y + 1)); }
