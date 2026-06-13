// characters.test.ts
import { describe, it, expect } from 'vitest';
import { CHARACTERS, DEFAULT_CHARACTER, type CharacterId } from './characters';
import { makePlayer } from './player';
import { WitchGame } from './game';
import { START_LIVES, START_BOMBS } from './constants';

describe('characters', () => {
  it('四位角色齊備、id 一致', () => {
    const ids: CharacterId[] = ['mira', 'gale', 'frost', 'volt'];
    for (const id of ids) {
      expect(CHARACTERS[id]).toBeTruthy();
      expect(CHARACTERS[id].id).toBe(id);
      expect(CHARACTERS[id].name.length).toBeGreaterThan(0);
    }
  });

  it('預設角色是 mira', () => {
    expect(DEFAULT_CHARACTER).toBe('mira');
  });

  it('mira 數值＝現有常數基準（回歸保護）', () => {
    const m = CHARACTERS.mira;
    expect(m.speedMult).toBe(1);
    expect(m.startLives).toBe(START_LIVES);
    expect(m.startBombs).toBe(START_BOMBS);
    expect(m.startPower).toBe(1);
  });

  it('每角有正向 speedMult 與合法起始值', () => {
    for (const id of Object.keys(CHARACTERS) as CharacterId[]) {
      const c = CHARACTERS[id];
      expect(c.speedMult).toBeGreaterThan(0);
      expect(c.startLives).toBeGreaterThanOrEqual(1);
      expect(c.startBombs).toBeGreaterThanOrEqual(0);
      expect(c.startPower).toBeGreaterThanOrEqual(1);
    }
  });

  it('每角有專屬主射與爆彈型（mira=基準）', () => {
    expect(CHARACTERS.mira.shotType).toBe('balanced');
    expect(CHARACTERS.mira.bombType).toBe('inferno');
    expect(CHARACTERS.gale.shotType).toBe('pierce');
    expect(CHARACTERS.gale.bombType).toBe('gust');
    expect(CHARACTERS.frost.shotType).toBe('fan');
    expect(CHARACTERS.frost.bombType).toBe('freeze');
    expect(CHARACTERS.volt.shotType).toBe('chain');
    expect(CHARACTERS.volt.bombType).toBe('storm');
  });

  it('流派定位：Gale 快、Frost 慢且命多、Volt 火力高且脆', () => {
    expect(CHARACTERS.gale.speedMult).toBeGreaterThan(CHARACTERS.mira.speedMult);
    expect(CHARACTERS.gale.startBombs).toBe(2);
    expect(CHARACTERS.frost.speedMult).toBeLessThan(CHARACTERS.mira.speedMult);
    expect(CHARACTERS.frost.startLives).toBe(4);
    expect(CHARACTERS.volt.startPower).toBe(2);
    expect(CHARACTERS.volt.startLives).toBe(2);
    expect(CHARACTERS.volt.startBombs).toBe(2);
  });
});

describe('makePlayer 依角色起始值', () => {
  it('mira → 基準命/炸/火力', () => {
    const p = makePlayer(CHARACTERS.mira);
    expect(p.lives).toBe(START_LIVES);
    expect(p.bombs).toBe(START_BOMBS);
    expect(p.power).toBe(1);
  });

  it('frost → 命 4', () => {
    expect(makePlayer(CHARACTERS.frost).lives).toBe(4);
  });

  it('gale → 炸 2', () => {
    expect(makePlayer(CHARACTERS.gale).bombs).toBe(2);
  });

  it('volt → 火力 2、命 2、炸 2', () => {
    const p = makePlayer(CHARACTERS.volt);
    expect(p.power).toBe(2);
    expect(p.lives).toBe(2);
    expect(p.bombs).toBe(2);
  });
});

describe('WitchGame 角色串接', () => {
  it('預設（無 character）＝ mira 基準命數', () => {
    expect(new WitchGame({ seed: 1 }).getState().player.lives).toBe(START_LIVES);
  });

  it('character=frost → 起始命 4', () => {
    expect(new WitchGame({ seed: 1, character: 'frost' }).getState().player.lives).toBe(4);
  });

  it('character=volt → 起始火力 2、命 2', () => {
    const s = new WitchGame({ seed: 1, character: 'volt' }).getState();
    expect(s.player.power).toBe(2);
    expect(s.player.lives).toBe(2);
  });

  it('角色 speedMult 影響移動：frost(0.88) 比 mira 慢', () => {
    const mira = new WitchGame({ seed: 1, character: 'mira' });
    const frost = new WitchGame({ seed: 1, character: 'frost' });
    mira.setHeld('up', true);
    frost.setHeld('up', true);
    const y0 = mira.getState().player.y;
    mira.step(100);
    frost.step(100);
    const miraMoved = y0 - mira.getState().player.y;
    const frostMoved = y0 - frost.getState().player.y;
    expect(miraMoved).toBeGreaterThan(0);
    expect(frostMoved).toBeLessThan(miraMoved);
    expect(frostMoved / miraMoved).toBeCloseTo(0.88, 2);
  });
});
