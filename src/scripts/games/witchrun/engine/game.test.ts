// game.test.ts
import { describe, it, expect } from 'vitest';
import { WitchGame } from './game';
import { STAGES } from './stage';
import { START_LIVES, START_BOMBS, OVERDRIVE_MAX } from './constants';

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
    expect(g.getState().playerBullets.length).toBeGreaterThan(0);
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

  it('nudge 相對移動並鉗制', () => {
    const g = new WitchGame({ seed: 1 });
    const x0 = g.getState().player.x;
    g.nudge(-30, 0);
    expect(g.getState().player.x).toBe(x0 - 30);
    g.nudge(-99999, 0);
    expect(g.getState().player.x).toBe(0);
  });
});
