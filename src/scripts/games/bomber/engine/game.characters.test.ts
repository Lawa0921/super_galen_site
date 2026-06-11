// game.characters.test.ts — Tests for character profiles, caps, and heart pickup
import { describe, it, expect } from 'vitest';
import { BomberGame } from './game';
import { SPAWN, START_LIVES } from './constants';

describe('BomberGame: default (no character) — behavior unchanged', () => {
  it('lives=3, maxBombs=1, fireRange=1, speedLevel=0', () => {
    const g = new BomberGame({ seed: 1 });
    const p = g.getState().player;
    expect(p.lives).toBe(3);
    expect(p.maxBombs).toBe(1);
    expect(p.fireRange).toBe(1);
    expect(p.speedLevel).toBe(0);
  });
});

describe('BomberGame: character=lena', () => {
  it('player starts with lena stats: lives 4, maxBombs 2, fireRange 1, speedLevel 0', () => {
    const g = new BomberGame({ seed: 1, character: 'lena' });
    const p = g.getState().player;
    expect(p.lives).toBe(4);
    expect(p.maxBombs).toBe(2);
    expect(p.fireRange).toBe(1);
    expect(p.speedLevel).toBe(0);
  });

  it('getState().character === "lena"', () => {
    const g = new BomberGame({ seed: 1, character: 'lena' });
    expect(g.getState().character).toBe('lena');
  });

  it('lena bomb cap is 8: repeatedly applying bomb powerup caps at 8', () => {
    const g = new BomberGame({ seed: 1, character: 'lena' });
    for (let i = 0; i < 20; i++) g.debugApplyPowerUp('bomb');
    expect(g.getState().player.maxBombs).toBe(8);
  });

  it('lena fire cap is 5: repeatedly applying fire powerup caps at 5', () => {
    const g = new BomberGame({ seed: 1, character: 'lena' });
    for (let i = 0; i < 20; i++) g.debugApplyPowerUp('fire');
    expect(g.getState().player.fireRange).toBe(5);
  });

  it('heart pickup raises lives by 1 up to lena cap (5)', () => {
    const g = new BomberGame({ seed: 1, character: 'lena' });
    // lena starts at 4 lives; cap is 5
    g.debugApplyPowerUp('heart');
    expect(g.getState().player.lives).toBe(5);
    // cannot exceed cap
    g.debugApplyPowerUp('heart');
    expect(g.getState().player.lives).toBe(5);
  });

  it('heart pickup from damaged state (lives 2) raises to 3', () => {
    const g = new BomberGame({ seed: 1, character: 'lena' });
    g.debugSetLives(2);
    g.debugApplyPowerUp('heart');
    expect(g.getState().player.lives).toBe(3);
  });
});

describe('BomberGame: character=mira', () => {
  it('player starts with mira stats: lives 2, fireRange 2, maxBombs 1, speedLevel 1', () => {
    const g = new BomberGame({ seed: 1, character: 'mira' });
    const p = g.getState().player;
    expect(p.lives).toBe(2);
    expect(p.fireRange).toBe(2);
    expect(p.maxBombs).toBe(1);
    expect(p.speedLevel).toBe(1);
  });

  it('getState().character === "mira"', () => {
    const g = new BomberGame({ seed: 1, character: 'mira' });
    expect(g.getState().character).toBe('mira');
  });

  it('mira bomb cap is 4: repeatedly applying bomb powerup caps at 4', () => {
    const g = new BomberGame({ seed: 1, character: 'mira' });
    for (let i = 0; i < 20; i++) g.debugApplyPowerUp('bomb');
    expect(g.getState().player.maxBombs).toBe(4);
  });

  it('mira fire cap is 8: repeatedly applying fire powerup caps at 8', () => {
    const g = new BomberGame({ seed: 1, character: 'mira' });
    for (let i = 0; i < 20; i++) g.debugApplyPowerUp('fire');
    expect(g.getState().player.fireRange).toBe(8);
  });

  it('heart pickup raises lives by 1 up to mira cap (3)', () => {
    const g = new BomberGame({ seed: 1, character: 'mira' });
    // mira starts at 2 lives; cap is 3
    g.debugApplyPowerUp('heart');
    expect(g.getState().player.lives).toBe(3);
    // cannot exceed cap
    g.debugApplyPowerUp('heart');
    expect(g.getState().player.lives).toBe(3);
  });
});

describe('BomberGame: character=aya', () => {
  it('player starts with aya stats: lives 2, fireRange 1, maxBombs 1, speedLevel 2', () => {
    const g = new BomberGame({ seed: 1, character: 'aya' });
    const p = g.getState().player;
    expect(p.lives).toBe(2);
    expect(p.fireRange).toBe(1);
    expect(p.maxBombs).toBe(1);
    expect(p.speedLevel).toBe(2);
  });

  it('getState().character === "aya"', () => {
    const g = new BomberGame({ seed: 1, character: 'aya' });
    expect(g.getState().character).toBe('aya');
  });
});

describe('BomberGame: character=rosa', () => {
  it('player starts with rosa stats: lives 4, fireRange 2, maxBombs 2, speedLevel 0', () => {
    const g = new BomberGame({ seed: 1, character: 'rosa' });
    const p = g.getState().player;
    expect(p.lives).toBe(4);
    expect(p.fireRange).toBe(2);
    expect(p.maxBombs).toBe(2);
    expect(p.speedLevel).toBe(0);
  });

  it('getState().character === "rosa"', () => {
    const g = new BomberGame({ seed: 1, character: 'rosa' });
    expect(g.getState().character).toBe('rosa');
  });
});

describe('BomberGame: heart pickup — default (no character)', () => {
  it('heart pickup raises lives up to START_LIVES cap (3) from damaged state', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugSetLives(1);
    g.debugApplyPowerUp('heart');
    expect(g.getState().player.lives).toBe(2);
  });

  it('heart pickup at full lives (3) stays at 3', () => {
    const g = new BomberGame({ seed: 1 });
    // lives = 3, cap = 3
    g.debugApplyPowerUp('heart');
    expect(g.getState().player.lives).toBe(3);
  });
});
