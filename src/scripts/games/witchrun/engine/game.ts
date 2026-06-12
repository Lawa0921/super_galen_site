// game.ts
import type {
  WitchState, WitchEvent, GameStatus, StageId, RelicId, Modifiers,
  Enemy, PlayerBullet, Coin, Drop, InputAction,
} from './types';
import {
  FIELD_W, FIELD_H, START_LIVES, START_BOMBS, BOMB_CAP, LIFE_CAP,
  FIRE_INTERVAL_MS, PLAYER_BULLET_SPEED, PLAYER_BULLET_DMG, MAX_PLAYER_BULLETS,
  INFERNO_INVULN_MS, INFERNO_DMG, HIT_CLEAR_R,
  ENEMY_R, BOSS_R, COIN_PICKUP_R, COIN_MAGNET_R, COIN_FALL_SPEED,
  MAX_ENEMIES, FIRE_FIELD_MS, FIRE_FIELD_DPS, STEP_CAP_MS,
  BELL_TOLL_INTERVAL_MS, BELL_TOLL_MAX, BELL_SURGE_MS, BELL_SURGE_MULT, CANCEL_COIN_CAP,
  POWER_DROP_EVERY, DROP_FALL_SPEED,
} from './constants';
import { createRng } from './rng';
import { makePlayer, movePlayer, hitPlayer, tickPlayer, gainPower } from './player';
import { BulletPool } from './bullet';
import { circleHit, sweepPlayerVsBullets } from './collision';
import { Overdrive } from './graze';
import { computeModifiers, draftRelics, BASE_MODIFIERS } from './relics';
import { SCORE, chainMultiplier } from './scoring';
import { makeEnemy, stepEnemy, ENEMY_DEFS } from './enemy';
import { ring } from './pattern';
import { BossRunner } from './boss';
import { StageRunner, STAGES } from './stage';

export interface WitchOptions { seed?: number; stage?: StageId; }

export class WitchGame {
  /** 公開給測試與渲染層讀取（damage 由自機彈命中觸發）。 */
  boss: BossRunner | null = null;

  private rng: () => number;
  private status: GameStatus = 'playing';
  private stage: StageId;
  private stageRunner: StageRunner;
  private player = makePlayer();
  private enemyBullets = new BulletPool();
  private playerBullets: PlayerBullet[] = Array.from({ length: MAX_PLAYER_BULLETS }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, dmg: 0, active: false, split: false, pierceLeft: 0,
  }));
  private enemies: Enemy[] = [];
  private coins: Coin[] = [];
  private drops: Drop[] = [];
  private od = new Overdrive();
  private relics: RelicId[] = [];
  private mod: Modifiers = { ...BASE_MODIFIERS };
  private draftChoices: RelicId[] = [];
  private score = 0;
  private grazeChain = 0;
  private killCount = 0;          // 擊殺計數（用於 P 道具掉落）
  private fireFieldMs = 0;
  private nextEnemyId = 1;
  private bossSpawned = false;
  private held = new Set<'up' | 'down' | 'left' | 'right'>();
  private focusHeld = false;
  private events: WitchEvent[] = [];
  // 全局十二響時限（F2）
  private tollTimerMs = BELL_TOLL_INTERVAL_MS;
  private tollCount = 0;
  private surgeMs = 0;
  private freezeMs = 0;   // F4 時停用（chronos 遺物）
  private grazeCount = 0; // F4 starshard：累積擦彈計數

  constructor(opts: WitchOptions = {}) {
    this.rng = createRng(opts.seed ?? 1);
    this.stage = opts.stage ?? 1;
    this.stageRunner = new StageRunner(this.stage);
    this.events.push({ kind: 'stageStart', stage: this.stage });
  }

  // ---- 輸入 ----
  setHeld(dir: 'up' | 'down' | 'left' | 'right', down: boolean): void {
    if (down) this.held.add(dir); else this.held.delete(dir);
  }
  setFocus(down: boolean): void { this.focusHeld = down; }

  input(action: InputAction): void {
    if (this.status !== 'playing') return;
    if (action === 'bomb') this.useInferno();
    else if (action === 'overdrive') this.useOverdrive();
  }

  // ---- 遺物 ----
  pickRelic(id: RelicId): void {
    if (this.status !== 'draft' || !this.draftChoices.includes(id)) return;
    this.relics.push(id);
    this.mod = computeModifiers(this.relics);
    const lifeCap = LIFE_CAP + this.mod.lifeCapDelta;
    if (id === 'moonlight') this.player.lives = Math.min(lifeCap, this.player.lives + 1);
    if (id === 'pact') this.player.lives = Math.min(lifeCap, this.player.lives); // 上限降低時收斂現有殘機
    if (id === 'catalyst') this.player.bombs = Math.min(BOMB_CAP, this.player.bombs + 1);
    this.events.push({ kind: 'relicPicked', id });
    this.draftChoices = [];
    this.advanceStage();
  }

  /** 續關：分數歸零、清場重生；保留 stage/stageRunner/relics（從當前關卡繼續）。 */
  continueRun(): void {
    if (this.status !== 'gameover') return;
    this.score = 0;
    this.grazeChain = 0;
    this.player = makePlayer();
    this.enemies = [];
    this.coins = [];
    this.drops = [];
    this.killCount = 0;
    for (const b of this.playerBullets) b.active = false;
    this.enemyBullets.clearAll();
    this.bossSpawned = false;   // 死於 Boss 戰 → 下個 tick 重新召喚滿血 Boss
    this.boss = null;
    this.fireFieldMs = 0;
    this.od = new Overdrive();
    this.status = 'playing';
  }

  // ---- 主迴圈 ----
  step(rawDtMs: number): void {
    if (this.status !== 'playing') return;
    const dtMs = Math.min(STEP_CAP_MS, rawDtMs);

    // 0) 全局十二響計時
    this.surgeMs = Math.max(0, this.surgeMs - dtMs);
    this.freezeMs = Math.max(0, this.freezeMs - dtMs);
    this.tollTimerMs -= dtMs;
    if (this.tollTimerMs <= 0) {
      this.tollCount++;
      this.surgeMs = BELL_SURGE_MS;
      this.events.push({ kind: 'bellToll', count: this.tollCount });
      this.tollTimerMs = BELL_TOLL_INTERVAL_MS;
      if (this.tollCount >= BELL_TOLL_MAX) {
        this.status = 'gameover';
        this.events.push({ kind: 'badEnd' });
        this.events.push({ kind: 'gameover' });
        return;
      }
    }

    // 1) 自機
    const dx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    const dy = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
    this.player.focus = this.focusHeld;
    movePlayer(this.player, { dx, dy }, dtMs, this.mod.speedMult);
    tickPlayer(this.player, dtMs);
    this.od.tick(dtMs);
    this.fireFieldMs = Math.max(0, this.fireFieldMs - dtMs);
    this.autoFire(dtMs);

    // 2) 關卡生成 / Boss
    if (!this.bossSpawned) {
      for (const s of this.stageRunner.step(dtMs)) {
        // 滿員時略過一般敵（波次已消耗不補發）；elite 帶保證掉落，必定生成
        if (this.enemies.length >= MAX_ENEMIES && !s.elite) continue;
        this.enemies.push(makeEnemy(this.nextEnemyId++, s.kind, s.x, -20, s.path, s.elite === true));
      }
      if (this.stageRunner.wavesDone && this.enemies.length === 0) {
        this.boss = new BossRunner(STAGES[this.stage].boss, this.rng);
        this.bossSpawned = true;
        this.events.push({ kind: 'bossSpawn', id: this.boss.state.id });
      }
    } else if (this.boss?.state.alive) {
      for (const spec of this.boss.step(dtMs, { px: this.player.x, py: this.player.y })) {
        this.enemyBullets.spawn(spec);
      }
    }

    // 3) 道中敵
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const result = stepEnemy(e, dtMs, { px: this.player.x, py: this.player.y }, this.rng);
      for (const spec of result.spawns) {
        this.enemyBullets.spawn(spec);
      }
      if (result.telegraph) {
        this.events.push({ kind: 'telegraph', ...result.telegraph });
      }
      if (e.y > FIELD_H + 40 || e.x < -60 || e.x > FIELD_W + 60) e.alive = false; // 出場回收
      if (this.fireFieldMs > 0) this.damageEnemy(e, FIRE_FIELD_DPS * (dtMs / 1000));
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // 4) 子彈運動（surge/freeze 調整速度倍率）
    const speedMult = this.freezeMs > 0 ? 0 : this.surgeMs > 0 ? BELL_SURGE_MULT : 1;
    this.enemyBullets.step(dtMs, speedMult);
    this.stepPlayerBullets(dtMs);

    // 5) 自機彈 vs 敵 / Boss
    this.resolvePlayerHits();

    // 6) 敵彈 vs 自機（被彈 + 擦彈）
    const sweep = sweepPlayerVsBullets(this.player, this.enemyBullets, this.mod.hitboxMult);
    if (sweep.grazes > 0) {
      this.od.addGraze(sweep.grazes, this.player.focus ? this.mod.focusGrazeBonus : 0);
      this.grazeChain += sweep.grazes;
      this.score += Math.round(SCORE.graze * sweep.grazes * chainMultiplier(this.grazeChain));
      this.events.push({ kind: 'graze', x: this.player.x, y: this.player.y });
      // starshard：每 grazeCoinEvery 次擦彈噴 1 金幣
      if (this.mod.grazeCoinEvery > 0) {
        const prevCount = this.grazeCount;
        this.grazeCount += sweep.grazes;
        const prevDiv = Math.floor(prevCount / this.mod.grazeCoinEvery);
        const newDiv = Math.floor(this.grazeCount / this.mod.grazeCoinEvery);
        const coinsToSpawn = newDiv - prevDiv;
        for (let i = 0; i < coinsToSpawn; i++) {
          this.coins.push({ x: this.player.x, y: this.player.y, vy: COIN_FALL_SPEED, active: true });
        }
      }
    }
    if (sweep.hit) this.onPlayerHit();

    // 6.5) Boss phase 切換後召喚小兵 + 清彈轉星屑（damage() 設 pendingSummon；本幀殘彈已判定完才轉幣）
    if (this.boss?.state.alive && this.boss.pendingSummon) {
      this.boss.consumeSummon();
      this.cancelBulletsToCoins();
      this.spawnBossMinions();
      this.events.push({ kind: 'bossPhase', id: this.boss.state.id, phase: this.boss.state.phase });
    }

    // 7) 金幣
    this.stepCoins(dtMs);

    // 7.5) 道具掉落
    this.stepDrops(dtMs);

    // 8) Boss 擊破收尾
    if (this.bossSpawned && this.boss && !this.boss.state.alive) this.onBossDefeated();
  }

  // ---- 內部 ----
  private autoFire(dtMs: number): void {
    if (!this.player.alive) return;
    if (this.player.fireCdMs > 0) return;
    this.player.fireCdMs = this.od.isActive ? FIRE_INTERVAL_MS / 2 : FIRE_INTERVAL_MS;
    const dmg = PLAYER_BULLET_DMG * this.mod.atkMult * (this.od.isActive ? 1.5 : 1);
    const n = this.player.power;                 // 1..4 道
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 12;
      this.spawnPlayerBullet(this.player.x + off, this.player.y - 14, 0, -PLAYER_BULLET_SPEED, dmg, false);
    }
    if (this.mod.familiar) {
      if (this.mod.homingFamiliar) {
        // 追蹤使魔：瞄準最近 alive 敵人
        const target = this.nearestAliveEnemy();
        for (const fx of [this.player.x - 26, this.player.x + 26]) {
          let hvx = 0; let hvy = -PLAYER_BULLET_SPEED;
          if (target !== null) {
            const dx = target.x - fx;
            const dy = target.y - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            hvx = (dx / dist) * PLAYER_BULLET_SPEED;
            hvy = (dy / dist) * PLAYER_BULLET_SPEED;
          }
          this.spawnPlayerBullet(fx, this.player.y, hvx, hvy, dmg * 0.5, false);
        }
      } else {
        this.spawnPlayerBullet(this.player.x - 26, this.player.y, 0, -PLAYER_BULLET_SPEED, dmg * 0.5, false);
        this.spawnPlayerBullet(this.player.x + 26, this.player.y, 0, -PLAYER_BULLET_SPEED, dmg * 0.5, false);
      }
    }
    this.events.push({ kind: 'shoot' });
  }

  /** 找最近的 alive 敵人（homing 用）；無敵時回傳 null。 */
  private nearestAliveEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  private spawnPlayerBullet(x: number, y: number, vx: number, vy: number, dmg: number, split: boolean): void {
    const b = this.playerBullets.find((it) => !it.active);
    if (!b) return;
    b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.dmg = dmg; b.split = split; b.active = true;
    b.pierceLeft = this.mod.pierce ? 1 : 0;
  }

  private stepPlayerBullets(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const b of this.playerBullets) {
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -24 || b.x < -24 || b.x > FIELD_W + 24) b.active = false;
    }
  }

  private resolvePlayerHits(): void {
    for (const b of this.playerBullets) {
      if (!b.active) continue;
      // Boss 優先（命中 Boss 一律回收，不穿透）
      if (this.boss?.state.alive && circleHit(b.x, b.y, 2, this.boss.state.x, this.boss.state.y, BOSS_R)) {
        const dmg = this.applyCrit(b.dmg);
        b.active = false;
        this.boss.damage(dmg);
        // pendingSummon 在 step 的 boss loop 中處理（避免重複事件）
        this.maybeSplit(b);
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (circleHit(b.x, b.y, 2, e.x, e.y, ENEMY_R)) {
          const dmg = this.applyCrit(b.dmg);
          if (b.pierceLeft > 0) {
            // 穿透：扣次數、不回收，繼續看下一敵
            b.pierceLeft--;
            this.damageEnemy(e, dmg);
            this.maybeSplit(b);
            // 推出該敵判定圈，避免下一 tick 對同一隻（高 hp/elite）重複命中
            const spd = Math.hypot(b.vx, b.vy) || 1;
            b.x += (b.vx / spd) * (ENEMY_R + 4);
            b.y += (b.vy / spd) * (ENEMY_R + 4);
            // 繼續外層 for 尋找下一個敵（不 break）
          } else {
            // 不穿透：命中後回收
            b.active = false;
            this.damageEnemy(e, dmg);
            this.maybeSplit(b);
            break;
          }
        }
      }
    }
  }

  /** 暴擊判定（bloodmoon）。 */
  private applyCrit(dmg: number): number {
    if (this.mod.critChance > 0 && this.rng() < this.mod.critChance) return dmg * 2;
    return dmg;
  }

  private maybeSplit(b: PlayerBullet): void {
    if (!this.mod.splitShot || b.split) return;
    const s = PLAYER_BULLET_SPEED * 0.8;
    this.spawnPlayerBullet(b.x, b.y, -s * 0.4, -s, b.dmg * 0.5, true);
    this.spawnPlayerBullet(b.x, b.y, s * 0.4, -s, b.dmg * 0.5, true);
  }

  private damageEnemy(e: Enemy, dmg: number): void {
    e.hp -= dmg;
    if (e.hp > 0) return;
    e.alive = false;
    this.score += Math.round(SCORE.enemy * chainMultiplier(this.grazeChain) * (this.od.isActive ? 2 : 1));
    this.coins.push({ x: e.x, y: e.y, vy: COIN_FALL_SPEED, active: true });
    this.events.push({ kind: 'enemyKill', x: e.x, y: e.y });

    // 擊殺計數與 P 道具掉落
    this.killCount++;
    if (this.killCount % POWER_DROP_EVERY === 0) {
      this.drops.push({ x: e.x, y: e.y, vy: DROP_FALL_SPEED, kind: 'power', active: true });
    }

    // elite 擊破：額外 5 金幣 + P + B drop + eliteKill 事件
    if (e.elite) {
      this.score += Math.round(SCORE.coin * 5);  // 額外 5 金幣計分
      this.drops.push({ x: e.x, y: e.y - 8, vy: DROP_FALL_SPEED, kind: 'power', active: true });
      this.drops.push({ x: e.x, y: e.y + 8, vy: DROP_FALL_SPEED, kind: 'bomb', active: true });
      this.events.push({ kind: 'eliteKill', x: e.x, y: e.y });
    }

    // 死亡音爆：彈種/速度跟著該敵兵定義走
    const def = ENEMY_DEFS[e.kind];
    if (def.deathBurst) {
      for (const spec of ring({ x: e.x, y: e.y, n: 8, speed: def.bulletSpeed, kind: def.bulletKind })) {
        this.enemyBullets.spawn(spec);
      }
    }
  }

  private stepCoins(dtMs: number): void {
    const dt = dtMs / 1000;
    const pickupR = this.mod.magnet ? COIN_MAGNET_R : COIN_PICKUP_R;
    for (const c of this.coins) {
      if (!c.active) continue;
      c.y += c.vy * dt;
      if (c.y > FIELD_H + 20) { c.active = false; continue; }
      if (circleHit(c.x, c.y, 8, this.player.x, this.player.y, pickupR)) {
        c.active = false;
        this.score += Math.round(SCORE.coin * chainMultiplier(this.grazeChain));
        this.events.push({ kind: 'coin' });
      }
    }
    this.coins = this.coins.filter((c) => c.active);
  }

  private stepDrops(dtMs: number): void {
    const dt = dtMs / 1000;
    const pickupR = this.mod.magnet ? COIN_MAGNET_R : COIN_PICKUP_R;
    for (const d of this.drops) {
      if (!d.active) continue;
      d.y += d.vy * dt;
      if (d.y > FIELD_H + 20) { d.active = false; continue; }
      if (circleHit(d.x, d.y, 8, this.player.x, this.player.y, pickupR)) {
        d.active = false;
        if (d.kind === 'power') {
          gainPower(this.player);
        } else {
          this.player.bombs = Math.min(BOMB_CAP, this.player.bombs + 1);
        }
        this.events.push({ kind: 'drop', drop: d.kind });
      }
    }
    this.drops = this.drops.filter((d) => d.active);
  }

  private useInferno(): void {
    if (this.player.bombs <= 0 || !this.player.alive) return;
    this.player.bombs--;
    this.enemyBullets.clearAll();
    this.player.invulnMs = Math.max(this.player.invulnMs, INFERNO_INVULN_MS + this.mod.infernoInvulnBonus);
    for (const e of this.enemies) if (e.alive) this.damageEnemy(e, INFERNO_DMG);
    if (this.boss?.state.alive) {
      this.boss.damage(INFERNO_DMG);
      // pendingSummon 由 step 中 5.5 處統一處理
    }
    if (this.mod.fireField) this.fireFieldMs = FIRE_FIELD_MS;
    this.events.push({ kind: 'inferno' });
  }

  private useOverdrive(): void {
    if (!this.od.activate(this.mod.overdriveDurMult)) return;
    this.enemyBullets.clearAll();
    for (const e of this.enemies) if (e.alive) this.damageEnemy(e, INFERNO_DMG / 2);
    // chronos：引爆時凍結全場敵彈 1.5 秒
    if (this.mod.freezeOnOverdrive) this.freezeMs = 1500;
    this.events.push({ kind: 'overdrive' });
  }

  private onPlayerHit(): void {
    this.od.onPlayerHit();
    this.grazeChain = 0;
    hitPlayer(this.player);
    // 防連死：清掉出生點附近的彈
    for (const b of this.enemyBullets.items) {
      if (b.active && circleHit(b.x, b.y, b.r, this.player.x, this.player.y, HIT_CLEAR_R)) b.active = false;
    }
    this.events.push({ kind: 'playerHit' });
    if (!this.player.alive) {
      this.status = 'gameover';
      this.events.push({ kind: 'gameover' });
    }
  }

  private onBossDefeated(): void {
    const id = this.boss!.state.id;
    const bossX = this.boss!.state.x;
    const bossY = this.boss!.state.y;
    this.cancelBulletsToCoins();  // 已將全部敵彈設 inactive（前 40 顆轉金幣）
    this.boss = null;
    this.bossSpawned = false;
    this.score += SCORE.bossBonus;
    // Boss 擊破後掉 B drop（出現在 Boss 最後位置）
    this.drops.push({ x: bossX, y: bossY, vy: DROP_FALL_SPEED, kind: 'bomb', active: true });
    this.events.push({ kind: 'bossDefeat', id });
    if (this.stage === 4) {
      this.status = 'cleared';
      this.events.push({ kind: 'cleared' });
      return;
    }
    this.draftChoices = draftRelics(this.rng, this.relics);
    this.status = 'draft';
    this.events.push({ kind: 'draftOpen', choices: this.draftChoices });
  }

  /** 清彈轉星屑：前 CANCEL_COIN_CAP 顆 active 敵彈位置變金幣，其餘清掉。 */
  private cancelBulletsToCoins(): void {
    let count = 0;
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue;
      if (count < CANCEL_COIN_CAP) {
        this.coins.push({ x: b.x, y: b.y, vy: COIN_FALL_SPEED, active: true });
        count++;
      }
      b.active = false;
    }
  }

  /** Boss phase 切換時召喚 2 隻本關代表敵兵。 */
  private spawnBossMinions(): void {
    const waves = STAGES[this.stage].waves;
    // 挑第一個出現的敵種
    const kind = waves.length > 0 ? waves[0].kind : 'bat';
    const positions = [0.3 * FIELD_W, 0.7 * FIELD_W];
    for (const x of positions) {
      if (this.enemies.length >= MAX_ENEMIES) break;
      this.enemies.push(makeEnemy(this.nextEnemyId++, kind, x, -20, 'sine'));
    }
  }

  private advanceStage(): void {
    this.stage = (this.stage + 1) as StageId;
    this.stageRunner = new StageRunner(this.stage);
    this.status = 'playing';
    this.events.push({ kind: 'stageStart', stage: this.stage });
  }

  // ---- 對外 ----
  drainEvents(): WitchEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  getState(): WitchState {
    return {
      status: this.status,
      stage: this.stage,
      player: { ...this.player },
      playerBullets: this.playerBullets,
      enemyBullets: this.enemyBullets.items,
      enemies: this.enemies,
      coins: this.coins,
      boss: this.boss ? { ...this.boss.state } : null,
      score: this.score,
      grazeChain: this.grazeChain,
      overdrive: { gauge: this.od.gauge, activeMs: this.od.activeMs },
      relics: [...this.relics],
      draftChoices: [...this.draftChoices],
      bellTolls: this.tollCount,
      drops: this.drops,
    };
  }

  // ---- 觸控相對位移 ----
  /** 觸控相對位移（px，邏輯座標）。直接鉗制在場內。 */
  nudge(dx: number, dy: number): void {
    if (this.status !== 'playing') return;
    this.player.x = Math.min(FIELD_W, Math.max(0, this.player.x + dx));
    this.player.y = Math.min(FIELD_H, Math.max(0, this.player.y + dy));
  }

  // ---- 測試/除錯掛鉤（e2e 也用） ----
  debugFillOverdrive(): void { this.od.addGraze(1000, 0); }
  debugSetLives(n: number): void {
    this.player.lives = n;
    if (n <= 0) { this.player.invulnMs = 0; this.player.lives = 1; hitPlayer(this.player); if (!this.player.alive) { this.status = 'gameover'; this.events.push({ kind: 'gameover' }); } }
  }
  debugSkipToBoss(): void {
    this.stageRunner.step(30 * 60 * 1000);  // 跑完波次表
    this.enemies = [];
    this.enemyBullets.clearAll();
  }
  /** 直接擊殺 n 隻假想敵（觸發 damageEnemy 完整邏輯，含 killCount / drop）。 */
  debugKillEnemies(n: number): void {
    for (let i = 0; i < n; i++) {
      const fake: Enemy = {
        id: -(i + 1), kind: 'bat', x: 240, y: 100,
        hp: 1, alive: true, path: 'descend', t: 0, baseX: 240, fireCdMs: 9999,
      };
      this.damageEnemy(fake, 999);
    }
  }
  /** 注入一隻 elite 敵兵（用於測試 elite 擊殺邏輯）。 */
  debugSpawnElite(kind: import('./types').EnemyKind, x: number, y: number): void {
    this.enemies.push(makeEnemy(this.nextEnemyId++, kind, x, y, 'hover', true));
  }
  /** 擊殺所有 elite 敵兵（直接扣血到 0 觸發 damageEnemy）。 */
  debugKillElites(): void {
    for (const e of this.enemies) {
      if (e.elite && e.alive) this.damageEnemy(e, 999999);
    }
  }
  /** F4 測試掛鉤：直接把遺物加入持有（繞過 draft 流程）。 */
  debugPickRelic(id: RelicId): void {
    if (!this.relics.includes(id)) {
      this.relics.push(id);
      this.mod = computeModifiers(this.relics);
    }
  }
  /** F4 測試掛鉤：直接模擬 N 次擦彈（含 starshard 噴幣邏輯）。 */
  debugAddGrazeCoins(n: number): void {
    if (this.mod.grazeCoinEvery > 0) {
      const prevDiv = Math.floor(this.grazeCount / this.mod.grazeCoinEvery);
      this.grazeCount += n;
      const newDiv = Math.floor(this.grazeCount / this.mod.grazeCoinEvery);
      const coinsToSpawn = newDiv - prevDiv;
      for (let i = 0; i < coinsToSpawn; i++) {
        this.coins.push({ x: this.player.x, y: this.player.y, vy: COIN_FALL_SPEED, active: true });
      }
    } else {
      this.grazeCount += n;
    }
  }
}
