// src/scripts/games/bomber/versus/versusMatch.ts
import type { Dir, Vec, PowerUpKind, Grid, Bomb, BlastCell, PowerUp } from '../engine/types';
import { isWalkable, breakCrate } from '../engine/board';
import { resolveChain } from '../engine/bomb';
import { computeBlast } from '../engine/blast';
import { dirDelta, speedMs } from '../engine/player';
import { getCharacter } from '../engine/characters';
import { BOMB_FUSE_MS, BLAST_TTL_MS, GRID_COLS, GRID_ROWS, INVULN_MS } from '../engine/constants';
import { createRng } from '../engine/rng';
import { ARENAS, parseArena } from './arenas';
import type { VersusState, VersusEvent, VersusPlayerInit, VPlayer, VersusInput } from './types';

/** versus 模式技能冷卻倍數（比單機長，給更多對抗空間）。 */
export const ABILITY_CD_MULT = 1.5;

/** versus 出生屬性（全員一致，公平競技）。 */
const VS_START = { fireRange: 2, maxBombs: 1, speedLevel: 1 } as const;

/** 箱底道具生成機率。 */
const POWERUP_RATE = 0.4;

/** versus 可生成的道具種類（不含 heart，無生命系統）。 */
const POWERUPS: PowerUpKind[] = ['fire', 'bomb', 'speed', 'shield'];

/** Sudden death 開始時間（ms）。 */
export const SUDDEN_DEATH_AT_MS = 120_000;

/** Sudden death 每次縮圈間隔（ms）。 */
export const RING_INTERVAL_MS = 3_000;

/** 最大可縮圈數。 */
export const MAX_COLLAPSE_RING = 3;

export interface VersusOptions {
  seed: number;
  arenaId: number;
  players: VersusPlayerInit[];
}

/** VersusMatch：雙人/多人競技場核心引擎。
 *  - 禁用 Math.random / Date.now；全部走 deterministic rng。
 *  - step(dtMs) 為主循環；外部每幀呼叫。
 */
export class VersusMatch {
  // ---- 遊戲核心狀態 ----
  private grid: Grid;
  private players: VPlayer[];
  private bombs: Bomb[] = [];
  private blasts: BlastCell[] = [];
  private powerUps: PowerUp[] = [];
  /** 箱底隱藏道具：key = "x,y"。 */
  private hiddenPowerUps: Record<string, PowerUpKind> = {};

  private status: VersusState['status'] = 'playing';
  private arenaId: number;
  private elapsedMs = 0;
  private collapsedRings = 0;
  private winnerId: string | null = null;

  /** 每位玩家目前按住的方向鍵集合。 */
  private held: Map<string, Set<Dir>> = new Map();

  private events: VersusEvent[] = [];

  constructor(opts: VersusOptions) {
    this.arenaId = opts.arenaId;
    const playerCount = opts.players.length as 2 | 3 | 4;
    const { grid, spawns } = parseArena(ARENAS[opts.arenaId], playerCount, opts.seed);
    this.grid = grid;

    // ---- 初始化箱底道具（左上象限擲骰，三象限鏡像複製） ----
    const rng = createRng((opts.seed ^ 0xf00dbabe) >>> 0);
    const midX = Math.floor((GRID_COLS - 1) / 2); // 6
    const midY = Math.floor((GRID_ROWS - 1) / 2); // 5

    const puMap: Record<string, PowerUpKind> = {};

    // 第一步：只對左上象限的 crate 格擲骰
    for (let y = 0; y <= midY; y++) {
      for (let x = 0; x <= midX; x++) {
        if (grid[y][x] === 'crate' && rng() < POWERUP_RATE) {
          puMap[`${x},${y}`] = POWERUPS[Math.floor(rng() * 4)];
        }
      }
    }

    // 第二步：右上象限鏡像左上（x > midX, y <= midY）
    for (let y = 0; y <= midY; y++) {
      for (let x = midX + 1; x < GRID_COLS; x++) {
        const mx = GRID_COLS - 1 - x;
        const mirrorKey = `${mx},${y}`;
        if (grid[y][x] === 'crate' && puMap[mirrorKey] !== undefined) {
          puMap[`${x},${y}`] = puMap[mirrorKey];
        }
      }
    }

    // 第三步：下半鏡像上半（y > midY）
    for (let y = midY + 1; y < GRID_ROWS; y++) {
      const my = GRID_ROWS - 1 - y;
      for (let x = 0; x < GRID_COLS; x++) {
        const mirrorKey = `${x},${my}`;
        if (grid[y][x] === 'crate' && puMap[mirrorKey] !== undefined) {
          puMap[`${x},${y}`] = puMap[mirrorKey];
        }
      }
    }

    this.hiddenPowerUps = puMap;

    // ---- 初始化玩家 ----
    this.players = opts.players.map((pi, i) => {
      const profile = getCharacter(pi.character);
      const spawn = spawns[i];
      const heldSet = new Set<Dir>();
      this.held.set(pi.id, heldSet);

      return {
        id: pi.id,
        character: pi.character,
        x: spawn.x, y: spawn.y,
        prevX: spawn.x, prevY: spawn.y,
        dir: 'down' as Dir,
        alive: true,
        placement: 0,
        // versus 平衡起始屬性
        fireRange: VS_START.fireRange,
        maxBombs: VS_START.maxBombs,
        speedLevel: VS_START.speedLevel,
        shield: false,
        invulnMs: 0,
        moveCooldownMs: 0,
        // 技能：冷卻為單機 × ABILITY_CD_MULT
        abilityId: profile.ability.id,
        abilityMaxMs: profile.ability.cooldownMs * ABILITY_CD_MULT,
        abilityCooldownMs: 0,
      } satisfies VPlayer;
    });
  }

  // ---- 輸入介面 ----

  /** 設定某玩家的方向鍵按住狀態。 */
  setHeld(playerId: string, dir: Dir, held: boolean): void {
    const set = this.held.get(playerId);
    if (!set) return;
    if (held) set.add(dir);
    else set.delete(dir);
  }

  /** 單次動作輸入（放彈 / 技能）。 */
  input(playerId: string, action: VersusInput): void {
    if (this.status !== 'playing') return;
    const player = this.players.find((p) => p.id === playerId);
    if (!player || !player.alive) return;

    if (action === 'bomb') {
      this.placeBomb(player);
    } else if (action === 'ability') {
      this.activateAbility(player);
    }
  }

  // ---- 主循環 ----

  /** 推進遊戲時間 dtMs 毫秒。 */
  step(dtMs: number): void {
    if (this.status !== 'playing') return;

    this.elapsedMs += dtMs;

    // 沿用單機 invulnAtStart 紀律：在移動/扣冷卻前快照每位玩家的無敵值，
    // 傷害判定以「tick 開始」的無敵狀態為準，並在判定後才扣減（本 tick 取得的
    // 無敵不會被同 tick 立即消耗）。
    const invulnAtStart = new Map<string, number>();
    for (const p of this.players) invulnAtStart.set(p.id, p.invulnMs);

    // 1. 先遞減/清除上一 tick 的舊爆風（順序比照單機：blast 先於 bomb，
    //    本 tick 新生的爆風才不會在生成同 tick 就被扣掉，得以參與傷害判定）。
    this.stepBlasts(dtMs);

    // 2. 玩家移動 + 屬性遞減
    this.stepPlayers(dtMs);

    // 3. 炸彈引信 + 爆炸結算（產生本 tick 新爆風）
    this.stepBombs(dtMs);

    // 4. 爆風傷害判定（以 tick 開始的無敵快照判定）
    this.resolveDamage(invulnAtStart);

    // 5. Sudden death 縮圈（塌縮格即死，無視盾/無敵）。
    //    放在傷害判定後、勝負判定前，讓塌縮致死與本 tick 結束的勝負判定一致。
    this.stepSuddenDeath();

    // 6. 無敵值在傷害判定後才遞減（且僅遞減 tick 開始即有效者）
    for (const p of this.players) {
      if (!p.alive) continue;
      if ((invulnAtStart.get(p.id) ?? 0) > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);
    }

    // 7. 勝負判定
    this.checkFinish();
  }

  // ---- 私有步驟 ----

  /** 所有玩家：冷卻遞減、移動、道具拾取。 */
  private stepPlayers(dtMs: number): void {
    for (const p of this.players) {
      if (!p.alive) continue;

      // 遞減各項冷卻（invulnMs 不在此遞減——沿用單機紀律，於傷害判定後才扣，
      // 見 step()）
      if (p.abilityCooldownMs > 0) p.abilityCooldownMs = Math.max(0, p.abilityCooldownMs - dtMs);
      if (p.moveCooldownMs > 0) {
        p.moveCooldownMs = Math.max(0, p.moveCooldownMs - dtMs);
      }

      // 移動（冷卻歸零才處理）
      if (p.moveCooldownMs <= 0) {
        const heldSet = this.held.get(p.id);
        const dir = heldSet && heldSet.size > 0 ? heldSet.values().next().value as Dir : null;
        if (dir) {
          p.dir = dir;
          const v = dirDelta(dir);
          const nx = p.x + v.x;
          const ny = p.y + v.y;
          // 可行走且無炸彈阻擋
          if (isWalkable(this.grid, nx, ny) && !this.bombs.some((b) => b.x === nx && b.y === ny)) {
            p.prevX = p.x; p.prevY = p.y;
            p.x = nx; p.y = ny;
            p.moveCooldownMs = speedMs(p.speedLevel);
            // 移動後立即檢查道具拾取
            this.checkPickup(p);
          }
        }
      }
    }
  }

  /** 炸彈引信遞減；到期者觸發連鎖爆炸。 */
  private stepBombs(dtMs: number): void {
    const detonating: Bomb[] = [];
    for (const b of this.bombs) {
      b.fuseMs -= dtMs;
      if (b.fuseMs <= 0) detonating.push(b);
    }
    if (detonating.length === 0) return;

    const { cells, brokenCrates, consumed } = resolveChain(this.grid, this.bombs, detonating);

    // 移除已爆炸彈
    this.bombs = this.bombs.filter((b) => !consumed.includes(b));

    // 破壞木箱 + 揭露道具
    for (const c of brokenCrates) {
      this.grid = breakCrate(this.grid, c.x, c.y);
      this.events.push({ kind: 'crateBreak', x: c.x, y: c.y });
      const key = `${c.x},${c.y}`;
      const drop = this.hiddenPowerUps[key];
      if (drop) {
        this.powerUps.push({ x: c.x, y: c.y, kind: drop });
        delete this.hiddenPowerUps[key];
      }
    }

    // 產生爆風格
    for (const c of cells) this.blasts.push({ x: c.x, y: c.y, ttlMs: BLAST_TTL_MS });
    this.events.push({ kind: 'explode', cells });
  }

  /** 爆風存活期遞減、清除過期格。 */
  private stepBlasts(dtMs: number): void {
    for (const bl of this.blasts) bl.ttlMs -= dtMs;
    this.blasts = this.blasts.filter((bl) => bl.ttlMs > 0);
  }

  // ---- 傷害 / 淘汰 ----

  /** 爆風傷害判定（沿用單機 invulnAtStart 紀律）。
   *  versus 雙方都是「格鎖定」移動的玩家、無「視覺格」需求——對稱公平，
   *  直接以 x,y 判定是否落在爆風格。
   *  命中：有盾 → 破盾 + 短暫無敵；無盾且 tick 開始即非無敵 → 淘汰。
   *  同 tick 死亡者共享名次：placement = （本 tick 死後仍存活人數）+ 1，
   *  全滅時即 placement = 1（平局名次自然落在第 1）。 */
  private resolveDamage(invulnAtStart: Map<string, number>): void {
    const onBlast = (x: number, y: number): boolean => this.blasts.some((b) => b.x === x && b.y === y);

    // 先蒐集本 tick 命中爆風、且 tick 開始即非無敵、且無盾的待淘汰者。
    const dying: VPlayer[] = [];
    for (const p of this.players) {
      if (!p.alive) continue;
      if (!onBlast(p.x, p.y)) continue;
      if (p.shield) {
        // 盾擋一次：破盾 + 短暫無敵，不淘汰。
        p.shield = false;
        p.invulnMs = INVULN_MS;
        continue;
      }
      if ((invulnAtStart.get(p.id) ?? 0) <= 0) {
        dying.push(p);
      }
    }
    if (dying.length === 0) return;

    // 本 tick 死後仍存活人數（dying 之外的 alive 玩家）。
    const aliveAfter = this.players.filter((p) => p.alive && !dying.includes(p)).length;
    const placement = aliveAfter + 1;
    for (const p of dying) this.killPlayer(p, placement);
  }

  /** 淘汰玩家：標記死亡、回填名次、發 playerDead 事件。
   *  placement 由呼叫端依「同批死亡共享名次」語意算好後傳入
   *  （= 該批死後仍存活人數 + 1）。傷害淘汰與塌縮淘汰共用此路徑；
   *  盾/無敵的判定在呼叫端完成（塌縮路徑刻意不檢查盾/無敵）。 */
  private killPlayer(player: VPlayer, placement: number): void {
    if (!player.alive) return;
    player.alive = false;
    player.placement = placement;
    this.events.push({ kind: 'playerDead', playerId: player.id });
  }

  // ---- Sudden death 塌縮圈 ----

  /** Sudden death：120s 後每 3s 由外向內塌一圈（最多 MAX_COLLAPSE_RING 圈）。
   *  該圈格子全變牆；格上的彈/道具/爆風一併清除；格上的玩家即死（無視盾/無敵）。
   *  以 elapsedMs 推算「應塌到第幾圈」，缺幾圈就一次補齊（步進大 dtMs 也正確）。 */
  private stepSuddenDeath(): void {
    if (this.elapsedMs < SUDDEN_DEATH_AT_MS) return;
    const due = 1 + Math.floor((this.elapsedMs - SUDDEN_DEATH_AT_MS) / RING_INTERVAL_MS);
    const target = Math.min(MAX_COLLAPSE_RING, due);
    while (this.collapsedRings < target) {
      const r = this.collapsedRings + 1;
      // 同一圈塌縮致死視為同批：共享名次 =（塌縮後仍存活人數）+ 1。
      const onRing = (px: number, py: number): boolean => {
        const d = Math.min(px, GRID_COLS - 1 - px, py, GRID_ROWS - 1 - py);
        return d === r;
      };
      const dying = this.players.filter((p) => p.alive && onRing(p.x, p.y));
      const aliveAfter = this.players.filter((p) => p.alive && !dying.includes(p)).length;
      const placement = aliveAfter + 1;
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          const d = Math.min(x, GRID_COLS - 1 - x, y, GRID_ROWS - 1 - y);
          if (d !== r) continue;
          this.grid[y][x] = 'wall';
          // 該格上的彈/道具/爆風一併清除
          this.bombs = this.bombs.filter((b) => !(b.x === x && b.y === y));
          this.powerUps = this.powerUps.filter((p) => !(p.x === x && p.y === y));
          this.blasts = this.blasts.filter((b) => !(b.x === x && b.y === y));
        }
      }
      // 塌縮致死：無視盾/無敵，直接淘汰。
      for (const p of dying) this.killPlayer(p, placement);
      this.collapsedRings = r;
      this.events.push({ kind: 'ringCollapse', ring: r });
    }
  }

  /** 勝負判定：存活 ≤ 1 即結束。
   *  - 1 人存活：倖存者 placement=1、winnerId=其 id。
   *  - 0 人存活（全滅同幀）：平局、winnerId=null（死亡者名次已於 resolveDamage 填為 1）。 */
  private checkFinish(): void {
    if (this.status !== 'playing') return;
    const alive = this.players.filter((p) => p.alive);
    if (alive.length > 1) return;

    this.status = 'finished';
    if (alive.length === 1) {
      const winner = alive[0];
      winner.placement = 1;
      this.winnerId = winner.id;
    } else {
      // 全滅 = 平局。
      this.winnerId = null;
    }
    this.events.push({ kind: 'finish', winnerId: this.winnerId });
  }

  // ---- 放彈 ----

  private placeBomb(player: VPlayer): void {
    // 該玩家現役彈數未超額
    if (this.bombs.filter((b) => b.owner === player.id).length >= player.maxBombs) return;
    // 腳下無彈
    if (this.bombs.some((b) => b.x === player.x && b.y === player.y)) return;

    this.bombs.push({
      x: player.x, y: player.y,
      fuseMs: BOMB_FUSE_MS,
      range: player.fireRange,
      owner: player.id,
    });
    this.events.push({ kind: 'bombPlaced', x: player.x, y: player.y, ownerId: player.id });
  }

  // ---- 技能 ----

  /** 技能啟動：扣冷卻、發事件、依角色執行 per-player 效果。 */
  private activateAbility(player: VPlayer): void {
    if (player.abilityCooldownMs > 0) return;

    // detonate 需要場上有自己的彈才能發動（否則不消耗冷卻）——比照單機紀律。
    if (player.abilityId === 'detonate' && !this.bombs.some((b) => b.owner === player.id)) return;

    player.abilityCooldownMs = player.abilityMaxMs;
    this.events.push({ kind: 'ability', playerId: player.id, id: player.abilityId });

    switch (player.abilityId) {
      case 'detonate': this.effectDetonate(player); break;
      case 'inferno': this.effectInferno(player); break;
      case 'blink': this.effectBlink(player); break;
      case 'bulwark': this.effectBulwark(player); break;
    }
  }

  /** 遙控起爆（per-player）：立即引爆「自己」放置的所有炸彈（下個 tick 連鎖結算），
   *  附短暫防護窗——絕不引爆他人的彈（owner 必須等於該玩家 id）。 */
  private effectDetonate(player: VPlayer): void {
    for (const b of this.bombs) {
      if (b.owner === player.id) b.fuseMs = 0;
    }
    player.invulnMs = Math.max(player.invulnMs, 600);
  }

  /** 爆炎術（per-player）：以該玩家為中心瞬發大範圍爆炎，附短暫無敵以求自保。 */
  private effectInferno(player: VPlayer): void {
    player.invulnMs = Math.max(player.invulnMs, 700);
    const { cells, brokenCrates } = computeBlast(this.grid, player.x, player.y, 4);
    for (const c of brokenCrates) {
      this.grid = breakCrate(this.grid, c.x, c.y);
      this.events.push({ kind: 'crateBreak', x: c.x, y: c.y });
      const key = `${c.x},${c.y}`;
      const drop = this.hiddenPowerUps[key];
      if (drop) { this.powerUps.push({ x: c.x, y: c.y, kind: drop }); delete this.hiddenPowerUps[key]; }
    }
    for (const c of cells) this.blasts.push({ x: c.x, y: c.y, ttlMs: BLAST_TTL_MS });
    this.events.push({ kind: 'explode', cells });
  }

  /** 瞬步（per-player）：朝面向瞬移到最遠空格（最多 3 格，遇牆/彈停）。 */
  private effectBlink(player: VPlayer): void {
    const v = dirDelta(player.dir);
    let steps = 0;
    let nx = player.x, ny = player.y;
    for (let i = 1; i <= 3; i++) {
      const cx = player.x + v.x * i, cy = player.y + v.y * i;
      if (!isWalkable(this.grid, cx, cy)) break;
      if (this.bombs.some((b) => b.x === cx && b.y === cy)) break;
      nx = cx; ny = cy;
      steps++;
    }
    if (steps > 0) {
      player.x = nx; player.y = ny;
      player.prevX = nx; player.prevY = ny;
      player.moveCooldownMs = 0;
    }
  }

  /** 鐵壁（per-player）：數秒無敵。 */
  private effectBulwark(player: VPlayer): void {
    player.invulnMs = Math.max(player.invulnMs, 3000);
  }

  // ---- 道具拾取 ----

  /** 玩家移動到 powerUp 格後呼叫。 */
  private checkPickup(player: VPlayer): void {
    const hit = this.powerUps.find((u) => u.x === player.x && u.y === player.y);
    if (!hit) return;
    this.powerUps = this.powerUps.filter((u) => u !== hit);
    this.applyPowerUp(player, hit.kind);
    this.events.push({ kind: 'pickup', playerId: player.id, powerUp: hit.kind });
  }

  /** 套用道具效果（no heart in versus）。 */
  private applyPowerUp(player: VPlayer, kind: PowerUpKind): void {
    const profile = getCharacter(player.character);
    const caps = profile.caps;
    if (kind === 'fire') player.fireRange = Math.min(player.fireRange + 1, caps.fireRange);
    else if (kind === 'bomb') player.maxBombs = Math.min(player.maxBombs + 1, caps.maxBombs);
    else if (kind === 'speed') player.speedLevel = Math.min(player.speedLevel + 1, caps.speedLevel);
    else if (kind === 'shield') player.shield = true;
    // heart 不適用於 versus（不含生命值系統）
  }

  // ---- 狀態查詢 ----

  /** 深拷貝當前狀態。 */
  getState(): VersusState {
    return {
      status: this.status,
      arenaId: this.arenaId,
      elapsedMs: this.elapsedMs,
      grid: this.grid.map((row) => row.slice()),
      players: this.players.map((p) => ({ ...p })),
      bombs: this.bombs.map((b) => ({ ...b })),
      blasts: this.blasts.map((bl) => ({ ...bl })),
      powerUps: this.powerUps.map((u) => ({ ...u })),
      collapsedRings: this.collapsedRings,
      winnerId: this.winnerId,
    };
  }

  /** 取出並清空事件佇列。 */
  drainEvents(): VersusEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---- debug seams（測試用） ----

  /** 直接對玩家套用道具效果。 */
  debugGivePowerUp(playerId: string, kind: PowerUpKind): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    this.applyPowerUp(player, kind);
  }

  /** 強制移動玩家到指定格。 */
  debugMovePlayer(playerId: string, x: number, y: number): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    player.x = x; player.y = y;
    player.prevX = x; player.prevY = y;
  }

  /** 強制設定已經過時間（供 sudden death 測試用）。 */
  debugSetElapsed(ms: number): void {
    this.elapsedMs = ms;
  }
}
