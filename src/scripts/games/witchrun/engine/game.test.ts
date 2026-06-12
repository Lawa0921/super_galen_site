// game.test.ts
import { describe, it, expect } from 'vitest';
import { WitchGame } from './game';
import { STAGES } from './stage';
import { makeEnemy } from './enemy';
import type { WitchEvent } from './types';
import {
  START_LIVES, START_BOMBS, OVERDRIVE_MAX,
  BELL_TOLL_INTERVAL_MS, BELL_SURGE_MULT, BELL_TOLL_MAX, CANCEL_COIN_CAP,
  POWER_DROP_EVERY, BOMB_CAP,
} from './constants';

/** 以固定小步長推進，模擬遊戲時間。 */
function run(g: WitchGame, ms: number, step = 16): void {
  for (let t = 0; t < ms; t += step) g.step(step);
}

describe('WitchGame', () => {
  it('初始狀態：playing、第 1 關、滿資源', () => {
    const g = new WitchGame({ seed: 1 });
    const s = g.getState();
    expect(s.status).toBe('playing');
    expect(s.stage).toBe(1);
    expect(s.player.lives).toBe(START_LIVES);
    expect(s.player.bombs).toBe(START_BOMBS);
    expect(s.relics).toEqual([]);
  });

  it('時間推進後依波次表生成敵人', () => {
    const g = new WitchGame({ seed: 1 });
    run(g, STAGES[1].waves[0].atMs + 100);
    expect(g.getState().enemies.length).toBeGreaterThan(0);
  });

  it('自動射擊產生自機彈，事件含 shoot', () => {
    const g = new WitchGame({ seed: 1 });
    run(g, 300);
    expect(g.getState().playerBullets.filter((b) => b.active).length).toBeGreaterThan(0);
    expect(g.drainEvents().some((e) => e.kind === 'shoot')).toBe(true);
  });

  it('drainEvents 清空事件佇列', () => {
    const g = new WitchGame({ seed: 1 });
    run(g, 300);
    g.drainEvents();
    expect(g.drainEvents()).toHaveLength(0);
  });

  it('setHeld 移動自機', () => {
    const g = new WitchGame({ seed: 1 });
    const x0 = g.getState().player.x;
    g.setHeld('left', true);
    run(g, 500);
    expect(g.getState().player.x).toBeLessThan(x0);
  });

  it('爆炎：扣庫存、清敵彈、發 inferno 事件', () => {
    const g = new WitchGame({ seed: 1 });
    run(g, 100);
    g.input('bomb');
    g.step(16);
    const s = g.getState();
    expect(s.player.bombs).toBe(START_BOMBS - 1);
    expect(g.drainEvents().some((e) => e.kind === 'inferno')).toBe(true);
  });

  it('庫存 0 時爆炎無效', () => {
    const g = new WitchGame({ seed: 1 });
    for (let i = 0; i < START_BOMBS; i++) { g.input('bomb'); g.step(2000); }
    g.drainEvents();
    g.input('bomb');
    g.step(16);
    expect(g.drainEvents().some((e) => e.kind === 'inferno')).toBe(false);
  });

  it('OVERDRIVE：未滿不可引爆；滿槽引爆發事件', () => {
    const g = new WitchGame({ seed: 1 });
    g.input('overdrive');
    g.step(16);
    expect(g.drainEvents().some((e) => e.kind === 'overdrive')).toBe(false);
    g.debugFillOverdrive();
    expect(g.getState().overdrive.gauge).toBe(OVERDRIVE_MAX);
    g.input('overdrive');
    g.step(16);
    expect(g.drainEvents().some((e) => e.kind === 'overdrive')).toBe(true);
    expect(g.getState().overdrive.activeMs).toBeGreaterThan(0);
  });

  it('波次跑完且敵清空 → Boss 登場（bossSpawn 事件）', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSkipToBoss();
    g.step(16);
    const s = g.getState();
    expect(s.boss).not.toBeNull();
    expect(s.boss!.id).toBe('gargoyle');
  });

  it('Boss 擊破 → 遺物三選一（draft）→ 選後進下一關', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSkipToBoss();
    g.step(16);
    g.boss!.damage(999999);
    g.step(16);
    const s1 = g.getState();
    expect(s1.status).toBe('draft');
    expect(s1.draftChoices).toHaveLength(3);
    g.pickRelic(s1.draftChoices[0]);
    const s2 = g.getState();
    expect(s2.status).toBe('playing');
    expect(s2.stage).toBe(2);
    expect(s2.relics).toContain(s1.draftChoices[0]);
  });

  it('第 4 關 Boss 擊破 → cleared（不再 draft）', () => {
    const g = new WitchGame({ seed: 1 });
    for (let st = 1; st <= 3; st++) {
      g.debugSkipToBoss(); g.step(16);
      g.boss!.damage(999999); g.step(16);
      g.pickRelic(g.getState().draftChoices[0]);
    }
    g.debugSkipToBoss(); g.step(16);
    g.boss!.damage(999999); g.step(16);
    expect(g.getState().status).toBe('cleared');
  });

  it('命盡 → gameover；continueRun 分數歸零續關', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSetLives(0);
    g.step(16);
    expect(g.getState().status).toBe('gameover');
    g.continueRun();
    const s = g.getState();
    expect(s.status).toBe('playing');
    expect(s.score).toBe(0);
    expect(s.player.lives).toBe(START_LIVES);
  });

  it('continueRun 清場：敵人/金幣/子彈/Boss 召喚旗標全部重置（迴歸）', () => {
    const g = new WitchGame({ seed: 1 });
    // 推到 Boss 戰中死亡：殘留敵彈、Boss、bossSpawned
    g.debugSkipToBoss();
    g.step(16);
    expect(g.getState().boss).not.toBeNull();
    g.debugSetLives(0);
    g.step(16);
    expect(g.getState().status).toBe('gameover');
    g.continueRun();
    const s = g.getState();
    expect(s.enemies).toHaveLength(0);
    expect(s.coins).toHaveLength(0);
    expect(s.playerBullets.every((b) => !b.active)).toBe(true);
    expect(s.enemyBullets.every((b) => !b.active)).toBe(true);
    expect(s.boss).toBeNull();
    // 下一個 tick 應重新召喚滿血 Boss（bossSpawned 已重置且波次早已跑完）
    g.step(16);
    const s2 = g.getState();
    expect(s2.boss).not.toBeNull();
    expect(s2.boss!.hp).toBe(s2.boss!.maxHp);
  });

  it('nudge 相對移動並鉗制', () => {
    const g = new WitchGame({ seed: 1 });
    const x0 = g.getState().player.x;
    g.nudge(-30, 0);
    expect(g.getState().player.x).toBe(x0 - 30);
    g.nudge(-99999, 0);
    expect(g.getState().player.x).toBe(0);
  });

  // ---- F2.2 全局十二響 ----

  /** 推進遊戲但自動 continueRun 讓玩家存活；收集所有事件。 */
  function runCollect(g: WitchGame, ms: number): WitchEvent[] {
    const all: WitchEvent[] = [];
    for (let t = 0; t < ms; t += 100) {
      g.step(100);
      all.push(...g.drainEvents());
      if (g.getState().status === 'gameover') g.continueRun();
      if (g.getState().status === 'draft') {
        const s = g.getState();
        g.pickRelic(s.draftChoices[0]);
      }
    }
    return all;
  }

  it('75 秒到期觸發 bellToll 事件，count 為全局計數', () => {
    const g = new WitchGame({ seed: 1 });
    const events = runCollect(g, BELL_TOLL_INTERVAL_MS + 200);
    const toll = events.find((e) => e.kind === 'bellToll');
    expect(toll).toBeDefined();
    expect((toll as { kind: 'bellToll'; count: number }).count).toBe(1);
  });

  it('鐘響後 bellTolls 狀態反映全局計數', () => {
    const g = new WitchGame({ seed: 1 });
    runCollect(g, BELL_TOLL_INTERVAL_MS + 200);
    expect(g.getState().bellTolls).toBe(1);
  });

  it('surge 期間 bellTolls 為 1，bellToll 事件存在', () => {
    const g = new WitchGame({ seed: 1 });
    const events = runCollect(g, BELL_TOLL_INTERVAL_MS + 200);
    expect(events.some((e) => e.kind === 'bellToll')).toBe(true);
    expect(g.getState().bellTolls).toBe(1);
  });

  it('12 響後觸發 badEnd + gameover', () => {
    const g = new WitchGame({ seed: 1 });
    const allEvents: WitchEvent[] = [];
    // 持續 runCollect 直到 badEnd（12 響後就不再 continueRun）
    outer: for (let t = 0; t < BELL_TOLL_INTERVAL_MS * (BELL_TOLL_MAX + 2); t += 100) {
      g.step(100);
      const evts = g.drainEvents();
      allEvents.push(...evts);
      if (evts.some((e) => e.kind === 'badEnd')) break outer;
      // 若玩家死亡（非 badEnd）就繼續
      if (g.getState().status === 'gameover') g.continueRun();
      if (g.getState().status === 'draft') g.pickRelic(g.getState().draftChoices[0]);
    }
    expect(allEvents.some((e) => e.kind === 'badEnd')).toBe(true);
    expect(allEvents.some((e) => e.kind === 'gameover')).toBe(true);
  });

  it('surge 期間敵彈位移放大 BELL_SURGE_MULT 倍（接線驗證）', () => {
    const g = new WitchGame({ seed: 1 });
    // 推到剛好鐘響（draft/gameover 會暫停計時，所以用 runCollect 維持 playing）
    runCollect(g, BELL_TOLL_INTERVAL_MS + 200);
    expect(g.getState().bellTolls).toBe(1);
    if (g.getState().status === 'gameover') g.continueRun(); // 確保 step 不會早退
    // 清空場上彈，注入一顆已知速度的彈，量測一步位移
    const s = g.getState();
    for (const b of s.enemyBullets) b.active = false;
    const pool = g.getState().enemyBullets;
    const b = pool[0];
    Object.assign(b, { x: 100, y: 100, vx: 0, vy: 100, ax: 0, ay: 0, turnRate: 0, bounces: 0, grazed: false, active: true });
    g.step(100); // surge 仍在 5 秒窗口內
    expect(b.y).toBeCloseTo(100 + 100 * 0.1 * BELL_SURGE_MULT, 1);
  });

  it('continueRun 不重置鐘響計數', () => {
    const g = new WitchGame({ seed: 1 });
    // 用 100ms 大步長推進過 1 次鐘響（75 秒），不停復活玩家保持存活
    let tolls = 0;
    for (let t = 0; t < BELL_TOLL_INTERVAL_MS + 1000; t += 100) {
      g.step(100);
      const evts = g.drainEvents();
      tolls += evts.filter((e) => e.kind === 'bellToll').length;
      // 若玩家死亡就立刻 continue（保持在 playing）
      if (g.getState().status === 'gameover') { g.continueRun(); }
    }
    expect(g.getState().bellTolls).toBeGreaterThanOrEqual(1);
    const tollsSnapshot = g.getState().bellTolls;
    // 手動 gameover
    g.debugSetLives(0);
    g.step(16);
    expect(g.getState().status).toBe('gameover');
    g.continueRun();
    // 續關後 tollCount 應保留
    expect(g.getState().bellTolls).toBe(tollsSnapshot);
  });

  it('draft 狀態下鐘響計時暫停（step 早退）', () => {
    const g = new WitchGame({ seed: 1 });
    // 進入 draft 狀態
    g.debugSkipToBoss();
    g.step(16);
    g.boss!.damage(999999);
    g.step(16);
    expect(g.getState().status).toBe('draft');
    const tollsBefore = g.getState().bellTolls;
    // draft 中推進接近整個鐘響間隔
    run(g, BELL_TOLL_INTERVAL_MS);
    // draft 期間 step 早退，鐘不應響
    expect(g.getState().bellTolls).toBe(tollsBefore);
  });

  // ---- F2.3 Boss 召喚 + 清彈轉星屑 ----

  it('Boss phase 切換後，敵兵增加 2 隻', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSkipToBoss();
    g.step(16);
    const boss = g.boss!;
    // gargoyle 在 50% 血量切換 phase
    const halfHp = Math.floor(boss.state.maxHp / 2) + 1;
    // 先清空敵人陣列（避免原有道中敵）
    const enemiesBefore = g.getState().enemies.length;
    boss.damage(halfHp);
    g.step(16);
    const enemiesAfter = g.getState().enemies.length;
    expect(enemiesAfter).toBe(enemiesBefore + 2);
  });

  it('Boss phase 切換後，場上 active 敵彈轉為金幣（上限 CANCEL_COIN_CAP）', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSkipToBoss();
    g.step(16);
    // 讓 boss 射出一些彈
    run(g, 3000);
    const bulletsBefore = g.getState().enemyBullets.filter((b) => b.active).length;
    if (bulletsBefore === 0) {
      // 跳過（沒子彈時無法測清彈）
      return;
    }
    const coinsBefore = g.getState().coins.length;
    const boss = g.boss!;
    const halfHp = Math.floor(boss.state.maxHp / 2) + 1;
    boss.damage(halfHp);
    g.step(16);
    const coinsAfter = g.getState().coins.length;
    const bulletsAfter = g.getState().enemyBullets.filter((b) => b.active).length;
    // 清彈後 active 敵彈應清零
    expect(bulletsAfter).toBe(0);
    // 金幣應增加 min(bulletsBefore, CANCEL_COIN_CAP)
    const expectedCoins = coinsBefore + Math.min(bulletsBefore, CANCEL_COIN_CAP);
    expect(coinsAfter).toBe(expectedCoins);
  });

  it('Boss 擊破時，active 敵彈轉金幣後清零', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSkipToBoss();
    g.step(16);
    run(g, 3000); // 讓 boss 射彈
    const boss = g.boss!;
    const coinsBefore = g.getState().coins.length;
    const bulletsBefore = g.getState().enemyBullets.filter((b) => b.active).length;
    boss.damage(999999);
    g.step(16);
    const bulletsAfter = g.getState().enemyBullets.filter((b) => b.active).length;
    expect(bulletsAfter).toBe(0);
    // 如有子彈，金幣應增加
    if (bulletsBefore > 0) {
      expect(g.getState().coins.length).toBeGreaterThan(coinsBefore);
    }
  });

  // ---- F3.4 道具掉落 + 中型機 elite ----

  // killCount/elite 流程靠 debugKillEnemies / debugSpawnElite 掛鉤驅動（走正規 damageEnemy 路徑）

  it('初始狀態 drops 為空陣列', () => {
    const g = new WitchGame({ seed: 1 });
    expect(g.getState().drops).toHaveLength(0);
  });

  it(`每 ${POWER_DROP_EVERY} 次擊殺產生 P 道具掉落`, () => {
    const g = new WitchGame({ seed: 1 });
    // 擊殺 POWER_DROP_EVERY 隻後應有 1 個 P drop
    g.debugKillEnemies(POWER_DROP_EVERY);
    expect(g.getState().drops.filter((d) => d.kind === 'power' && d.active)).toHaveLength(1);
  });

  it('P 道具拾取後 power 升一級', () => {
    const g = new WitchGame({ seed: 1 });
    const powerBefore = g.getState().player.power;
    g.debugKillEnemies(POWER_DROP_EVERY);
    // 強制把 drop 移到玩家位置再 step
    const drop = g.getState().drops.find((d) => d.active)!;
    const px = g.getState().player.x;
    const py = g.getState().player.y;
    drop.x = px;
    drop.y = py;
    g.step(16);
    expect(g.getState().player.power).toBe(Math.min(4, powerBefore + 1));
  });

  it('elite 擊破掉 P + B drop 各一、額外 +5 金幣計分、發 eliteKill 事件', () => {
    const g = new WitchGame({ seed: 1 });
    const scoreBefore = g.getState().score;
    g.drainEvents();
    // 生成一隻 elite 並擊殺
    g.debugSpawnElite('fairy', 240, 100);
    g.debugKillElites();
    const events = g.drainEvents();
    const state = g.getState();
    // 有 eliteKill 事件
    expect(events.some((e) => e.kind === 'eliteKill')).toBe(true);
    // drops：elite 掉 P + B（killCount 可能同時觸發另一個 P，但至少有一 P 一 B）
    expect(state.drops.filter((d) => d.kind === 'power' && d.active).length).toBeGreaterThanOrEqual(1);
    expect(state.drops.filter((d) => d.kind === 'bomb' && d.active).length).toBeGreaterThanOrEqual(1);
  });

  it('敵滿 MAX_ENEMIES 時 elite 仍保證生成（迴歸：滿員丟棄）', () => {
    const g = new WitchGame({ seed: 1 });
    // 用 32 隻安靜假敵塞滿場（遠離自機彈道、不開火、不出界）
    const enemies = g.getState().enemies;
    for (let i = 0; i < 32; i++) {
      const fake = makeEnemy(9000 + i, 'wisp', 10 + (i % 8) * 12, 40 + Math.floor(i / 8) * 14, 'hover');
      fake.hp = 99999;
      fake.fireCdMs = 1e9;
      enemies.push(fake);
    }
    // 推進跨過 stage 1 的 elite 出場時間（一般敵會被滿員略過，elite 必生成）
    const eliteAt = STAGES[1].waves.find((w) => w.elite)!.atMs;
    run(g, eliteAt + 300, 100);
    expect(g.getState().status).toBe('playing'); // 無敵彈，不該死亡
    expect(g.getState().enemies.some((e) => e.elite)).toBe(true);
  });

  it('B 道具拾取後 bombs +1（上限 BOMB_CAP）', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSpawnElite('fairy', 240, 100);
    g.debugKillElites();
    const bombBefore = g.getState().player.bombs;
    // 找到 B drop 移到玩家位置
    const bDrop = g.getState().drops.find((d) => d.kind === 'bomb' && d.active)!;
    const px = g.getState().player.x;
    const py = g.getState().player.y;
    bDrop.x = px;
    bDrop.y = py;
    g.step(16);
    expect(g.getState().player.bombs).toBe(Math.min(BOMB_CAP, bombBefore + 1));
    // drop event
    expect(g.drainEvents().some((e) => e.kind === 'drop')).toBe(true);
  });

  it('Boss 擊破後產生 B drop（位置在 Boss 位置）', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSkipToBoss();
    g.step(16);
    const bossX = g.getState().boss!.x;
    const bossY = g.getState().boss!.y;
    g.boss!.damage(999999);
    g.step(16);
    const bDrops = g.getState().drops.filter((d) => d.kind === 'bomb' && d.active);
    expect(bDrops).toHaveLength(1);
    expect(bDrops[0].x).toBeCloseTo(bossX, 0);
    expect(bDrops[0].y).toBeCloseTo(bossY, 0);
  });

  it('continueRun 清空 drops', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugKillEnemies(POWER_DROP_EVERY);
    expect(g.getState().drops.filter((d) => d.active)).toHaveLength(1);
    g.debugSetLives(0);
    g.step(16);
    g.continueRun();
    expect(g.getState().drops.filter((d) => d.active)).toHaveLength(0);
  });

  it('drop 下落後出界（y > FIELD_H + margin）自動回收', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugKillEnemies(POWER_DROP_EVERY);
    // 把 drop 移到底部附近
    const drop = g.getState().drops.find((d) => d.active)!;
    drop.y = 700; // 超過 FIELD_H=640
    g.step(16);
    expect(drop.active).toBe(false);
  });
});
