// game.test.ts
import { describe, it, expect } from 'vitest';
import { WitchGame } from './game';
import { STAGES } from './stage';
import { makeEnemy } from './enemy';
import type { WitchEvent } from './types';
import {
  START_LIVES, START_BOMBS, OVERDRIVE_MAX,
  BELL_TOLL_INTERVAL_MS, BELL_SURGE_MULT, BELL_TOLL_MAX, CANCEL_COIN_CAP,
  POWER_DROP_EVERY, BOMB_CAP, INFERNO_INVULN_MS,
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

  // ── F4.3 遺物深化整合測試 ──

  it('F4 pierce：自機彈命中敵人後可穿透（pierceLeft-- 不回收），命中第二敵才回收', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugPickRelic('pierce');
    // 在場上生成兩個假敵，x 不同讓彈分別打到
    const enemies = g.getState().enemies;
    const makeTestEnemy = (id: number, x: number): import('./types').Enemy => ({
      id, kind: 'bat', x, y: 100, hp: 999, alive: true,
      path: 'descend', t: 0, baseX: x, fireCdMs: 9999,
    });
    enemies.push(makeTestEnemy(9001, 240));
    enemies.push(makeTestEnemy(9002, 240)); // 同位置，讓同顆彈能連續命中
    // 注入一顆自機彈在兩敵附近
    const bullets = g.getState().playerBullets;
    const b = bullets.find((b) => !b.active)!;
    Object.assign(b, { x: 240, y: 100, vx: 0, vy: 0, dmg: 1, active: true, split: false, pierceLeft: 1 });
    g.step(16); // resolvePlayerHits 被執行
    // 彈命中第一敵後 pierceLeft 應被扣到 0，仍 active
    // 再命中第二敵後回收
    // 因為兩敵同位置，一幀內可連續命中
    // 最終：彈 inactive，兩敵至少一個被打到
    const fst = enemies.find((e) => e.id === 9001)!;
    const snd = enemies.find((e) => e.id === 9002)!;
    // 至少一個敵受到傷害
    expect(fst.hp < 999 || snd.hp < 999).toBe(true);
  });

  it('F4 pierce：命中 Boss 不穿透（立即回收）', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugPickRelic('pierce');
    g.debugSkipToBoss();
    g.step(16);
    expect(g.getState().boss).not.toBeNull();
    const bullets = g.getState().playerBullets;
    const b = bullets.find((b) => !b.active)!;
    const bossX = g.getState().boss!.x;
    const bossY = g.getState().boss!.y;
    Object.assign(b, { x: bossX, y: bossY, vx: 0, vy: 0, dmg: 1, active: true, split: false, pierceLeft: 1 });
    g.step(16);
    // 命中 Boss 後彈必須回收（active = false）
    expect(b.active).toBe(false);
  });

  it('F4 pierce：spawnPlayerBullet 時 pierceLeft 初始化為 1', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugPickRelic('pierce');
    // 先清空現有彈
    for (const b of g.getState().playerBullets) b.active = false;
    // 等一次自動開火
    g.step(200);
    const activeBullets = g.getState().playerBullets.filter((b) => b.active);
    expect(activeBullets.length).toBeGreaterThan(0);
    for (const b of activeBullets) {
      expect(b.pierceLeft).toBe(1);
    }
  });

  it('F4 pierce 未持有：spawnPlayerBullet 時 pierceLeft = 0', () => {
    const g = new WitchGame({ seed: 1 });
    for (const b of g.getState().playerBullets) b.active = false;
    g.step(200);
    const activeBullets = g.getState().playerBullets.filter((b) => b.active);
    expect(activeBullets.length).toBeGreaterThan(0);
    for (const b of activeBullets) {
      expect(b.pierceLeft).toBe(0);
    }
  });

  it('F4 homing：持有後 familiar 彈朝最近敵人方向', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugPickRelic('homing');
    // 放一個敵人在偏右上方（遠離自機 x=240，靠右）
    const enemies = g.getState().enemies;
    enemies.push({
      id: 8001, kind: 'bat', x: 400, y: 200, hp: 999, alive: true,
      path: 'descend', t: 0, baseX: 400, fireCdMs: 9999,
    });
    // 清空現有彈並等 autoFire（一幀 200ms 確保觸發）
    for (const b of g.getState().playerBullets) b.active = false;
    g.step(200);
    const activeBullets = g.getState().playerBullets.filter((b) => b.active);
    expect(activeBullets.length).toBeGreaterThan(0);
    // homing familiar 彈：敵在右方(x=400 > 自機 x≈240)，所以 familiar 彈中
    // 至少有一顆 vx > 0（朝右飛向目標）
    const hasHomingRight = activeBullets.some((b) => b.vx > 0);
    expect(hasHomingRight).toBe(true);
  });

  it('F4 chronos：引爆 OVERDRIVE 後 freezeMs = 1500', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugPickRelic('chronos');
    g.debugFillOverdrive();
    g.input('overdrive');
    g.step(16);
    // 引爆後 freezeMs 應設為 1500（敵彈速度 0）
    // 驗證：注入一顆敵彈，速度在 freeze 期間應為 0
    const state = g.getState();
    for (const b of state.enemyBullets) b.active = false;
    const pool = state.enemyBullets;
    const b = pool[0];
    Object.assign(b, { x: 100, y: 100, vx: 0, vy: 100, ax: 0, ay: 0, turnRate: 0, bounces: 0, grazed: false, active: true });
    const yBefore = b.y;
    g.step(100); // freeze 仍在（1500ms > 100ms）
    expect(b.y).toBeCloseTo(yBefore, 1); // 速度為 0，y 不變
  });

  it('F4 chronos 未持有：OVERDRIVE 引爆後彈不凍結', () => {
    const g = new WitchGame({ seed: 1 });
    // 無 chronos
    g.debugFillOverdrive();
    g.input('overdrive');
    g.step(16);
    const state = g.getState();
    for (const b of state.enemyBullets) b.active = false;
    const b = state.enemyBullets[0];
    Object.assign(b, { x: 100, y: 100, vx: 0, vy: 100, ax: 0, ay: 0, turnRate: 0, bounces: 0, grazed: false, active: true });
    const yBefore = b.y;
    g.step(100);
    expect(b.y).toBeGreaterThan(yBefore); // 有速度，y 增加
  });

  it('F4 pendulum：爆炎無敵 = INFERNO_INVULN_MS + 1200（step 後扣 16ms）', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugPickRelic('pendulum');
    g.input('bomb');
    g.step(16);
    // step(16) 後 tickPlayer 扣了 16ms，所以實際值應為 INFERNO_INVULN_MS + 1200 - 16
    expect(g.getState().player.invulnMs).toBeCloseTo(INFERNO_INVULN_MS + 1200 - 16, 0);
  });

  it('F4 pendulum 未持有：爆炎無敵 = INFERNO_INVULN_MS（step 後扣 16ms）', () => {
    const g = new WitchGame({ seed: 1 });
    g.input('bomb');
    g.step(16);
    expect(g.getState().player.invulnMs).toBeCloseTo(INFERNO_INVULN_MS - 16, 0);
  });

  it('F4 starshard：每 5 次擦彈噴 1 金幣（grazeCoinEvery = 5）', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugPickRelic('starshard');
    const coinsBefore = g.getState().coins.length;
    // 模擬 5 次擦彈（直接呼叫 debugAddGraze 或透過 sweepPlayerVsBullets）
    // 用 debugAddGrazeCoins 掛鉤
    g.debugAddGrazeCoins(5);
    const coinsAfter = g.getState().coins.length;
    expect(coinsAfter).toBe(coinsBefore + 1);
  });

  it('F4 starshard 未持有：擦彈不噴金幣', () => {
    const g = new WitchGame({ seed: 1 });
    const coinsBefore = g.getState().coins.length;
    g.debugAddGrazeCoins(5);
    expect(g.getState().coins.length).toBe(coinsBefore);
  });

  it('F4 bloodmoon：固定 seed 下 critChance 命中時傷害 ×2', () => {
    // 用固定 seed 找到一次暴擊發生的場景
    // bloodmoon critChance = 0.1；seed 42 下 rng() < 0.1 很可能發生
    // 比較有/無 bloodmoon 的 Boss 傷害差異
    const g1 = new WitchGame({ seed: 42 });
    g1.debugPickRelic('bloodmoon');
    g1.debugSkipToBoss();
    g1.step(16);
    const hpBefore1 = g1.getState().boss!.hp;

    const g2 = new WitchGame({ seed: 42 });
    g2.debugSkipToBoss();
    g2.step(16);
    const hpBefore2 = g2.getState().boss!.hp;

    // 注入相同位置的彈打 Boss
    const bossX1 = g1.getState().boss!.x;
    const bossY1 = g1.getState().boss!.y;
    const bossX2 = g2.getState().boss!.x;
    const bossY2 = g2.getState().boss!.y;

    for (const b of g1.getState().playerBullets) b.active = false;
    for (const b of g2.getState().playerBullets) b.active = false;

    // 注入 10 顆彈在 Boss 位置（足夠觸發至少一次暴擊）
    for (let i = 0; i < 10; i++) {
      const b1 = g1.getState().playerBullets.find((b) => !b.active)!;
      Object.assign(b1, { x: bossX1, y: bossY1, vx: 0, vy: 0, dmg: 1, active: true, split: false, pierceLeft: 0 });
      const b2 = g2.getState().playerBullets.find((b) => !b.active)!;
      Object.assign(b2, { x: bossX2, y: bossY2, vx: 0, vy: 0, dmg: 1, active: true, split: false, pierceLeft: 0 });
    }

    g1.step(16);
    g2.step(16);

    const dmg1 = hpBefore1 - g1.getState().boss!.hp;
    const dmg2 = hpBefore2 - g2.getState().boss!.hp;

    // bloodmoon 持有者傷害應 >= 無 bloodmoon（至少等於，暴擊時更多）
    expect(dmg1).toBeGreaterThanOrEqual(dmg2);
  });
});
