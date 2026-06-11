// characters.test.ts
import { describe, it, expect } from 'vitest';
import { CHARACTERS, getCharacter } from './characters';
import { SPEED_MS } from './constants';

describe('CHARACTERS / getCharacter', () => {
  it('lena と mira の両方が解決できる', () => {
    expect(() => getCharacter('lena')).not.toThrow();
    expect(() => getCharacter('mira')).not.toThrow();
  });

  it('aya と rosa の両方が解決できる', () => {
    expect(() => getCharacter('aya')).not.toThrow();
    expect(() => getCharacter('rosa')).not.toThrow();
  });

  it('lena と mira は start と caps の両方で異なる', () => {
    const lena = getCharacter('lena');
    const mira = getCharacter('mira');
    // start differs in at least one field
    const startDiff =
      lena.start.lives !== mira.start.lives ||
      lena.start.fireRange !== mira.start.fireRange ||
      lena.start.maxBombs !== mira.start.maxBombs ||
      lena.start.speedLevel !== mira.start.speedLevel;
    expect(startDiff).toBe(true);
    // caps differs in at least one field
    const capsDiff =
      lena.caps.lives !== mira.caps.lives ||
      lena.caps.fireRange !== mira.caps.fireRange ||
      lena.caps.maxBombs !== mira.caps.maxBombs ||
      lena.caps.speedLevel !== mira.caps.speedLevel;
    expect(capsDiff).toBe(true);
  });

  it('すべての cap >= その start 値', () => {
    for (const profile of Object.values(CHARACTERS)) {
      expect(profile.caps.lives).toBeGreaterThanOrEqual(profile.start.lives);
      expect(profile.caps.fireRange).toBeGreaterThanOrEqual(profile.start.fireRange);
      expect(profile.caps.maxBombs).toBeGreaterThanOrEqual(profile.start.maxBombs);
      expect(profile.caps.speedLevel).toBeGreaterThanOrEqual(profile.start.speedLevel);
    }
  });

  it('speedLevel cap <= SPEED_MS 配列の最後のインデックス', () => {
    const maxSpeedIdx = SPEED_MS.length - 1;
    for (const profile of Object.values(CHARACTERS)) {
      expect(profile.caps.speedLevel).toBeLessThanOrEqual(maxSpeedIdx);
    }
  });

  it('lena: 工兵 — start lives 4, maxBombs 2, fireRange 1, speedLevel 0', () => {
    const lena = getCharacter('lena');
    expect(lena.id).toBe('lena');
    expect(lena.start.lives).toBe(4);
    expect(lena.start.maxBombs).toBe(2);
    expect(lena.start.fireRange).toBe(1);
    expect(lena.start.speedLevel).toBe(0);
  });

  it('lena: caps lives 5, fireRange 5, maxBombs 8, speedLevel 2', () => {
    const lena = getCharacter('lena');
    expect(lena.caps.lives).toBe(5);
    expect(lena.caps.fireRange).toBe(5);
    expect(lena.caps.maxBombs).toBe(8);
    expect(lena.caps.speedLevel).toBe(2);
  });

  it('mira: 魔女 — start lives 2, fireRange 2, maxBombs 1, speedLevel 1', () => {
    const mira = getCharacter('mira');
    expect(mira.id).toBe('mira');
    expect(mira.start.lives).toBe(2);
    expect(mira.start.fireRange).toBe(2);
    expect(mira.start.maxBombs).toBe(1);
    expect(mira.start.speedLevel).toBe(1);
  });

  it('mira: caps lives 3, fireRange 8, maxBombs 4, speedLevel 4', () => {
    const mira = getCharacter('mira');
    expect(mira.caps.lives).toBe(3);
    expect(mira.caps.fireRange).toBe(8);
    expect(mira.caps.maxBombs).toBe(4);
    expect(mira.caps.speedLevel).toBe(4);
  });

  it('CHARACTERS レコードに lena と mira が含まれる', () => {
    expect('lena' in CHARACTERS).toBe(true);
    expect('mira' in CHARACTERS).toBe(true);
  });

  it('aya: 斥候 — start lives 2, fireRange 1, maxBombs 1, speedLevel 2', () => {
    const aya = getCharacter('aya');
    expect(aya.id).toBe('aya');
    expect(aya.start.lives).toBe(2);
    expect(aya.start.fireRange).toBe(1);
    expect(aya.start.maxBombs).toBe(1);
    expect(aya.start.speedLevel).toBe(2);
  });

  it('aya: caps lives 3, fireRange 6, maxBombs 5, speedLevel 4', () => {
    const aya = getCharacter('aya');
    expect(aya.caps.lives).toBe(3);
    expect(aya.caps.fireRange).toBe(6);
    expect(aya.caps.maxBombs).toBe(5);
    expect(aya.caps.speedLevel).toBe(4);
  });

  it('rosa: 隊長 — start lives 4, fireRange 2, maxBombs 2, speedLevel 0', () => {
    const rosa = getCharacter('rosa');
    expect(rosa.id).toBe('rosa');
    expect(rosa.start.lives).toBe(4);
    expect(rosa.start.fireRange).toBe(2);
    expect(rosa.start.maxBombs).toBe(2);
    expect(rosa.start.speedLevel).toBe(0);
  });

  it('rosa: caps lives 6, fireRange 5, maxBombs 5, speedLevel 2', () => {
    const rosa = getCharacter('rosa');
    expect(rosa.caps.lives).toBe(6);
    expect(rosa.caps.fireRange).toBe(5);
    expect(rosa.caps.maxBombs).toBe(5);
    expect(rosa.caps.speedLevel).toBe(2);
  });

  it('CHARACTERS レコードに aya と rosa が含まれる', () => {
    expect('aya' in CHARACTERS).toBe(true);
    expect('rosa' in CHARACTERS).toBe(true);
  });

  it('全キャラクターに ability があり、cooldownMs > 0 かつ name が空でない', () => {
    for (const profile of Object.values(CHARACTERS)) {
      expect(profile.ability).toBeDefined();
      expect(profile.ability.cooldownMs).toBeGreaterThan(0);
      expect(profile.ability.name.length).toBeGreaterThan(0);
      expect(profile.ability.id.length).toBeGreaterThan(0);
    }
  });

  it('lena の ability は detonate / 遙控起爆 / cooldown 9000ms', () => {
    const lena = getCharacter('lena');
    expect(lena.ability.id).toBe('detonate');
    expect(lena.ability.name).toBe('遙控起爆');
    expect(lena.ability.cooldownMs).toBe(9000);
  });

  it('mira の ability は inferno / 爆炎術 / cooldown 14000ms', () => {
    const mira = getCharacter('mira');
    expect(mira.ability.id).toBe('inferno');
    expect(mira.ability.name).toBe('爆炎術');
    expect(mira.ability.cooldownMs).toBe(14000);
  });

  it('aya の ability は blink / 瞬步 / cooldown 8000ms', () => {
    const aya = getCharacter('aya');
    expect(aya.ability.id).toBe('blink');
    expect(aya.ability.name).toBe('瞬步');
    expect(aya.ability.cooldownMs).toBe(8000);
  });

  it('rosa の ability は bulwark / 鐵壁 / cooldown 14000ms', () => {
    const rosa = getCharacter('rosa');
    expect(rosa.ability.id).toBe('bulwark');
    expect(rosa.ability.name).toBe('鐵壁');
    expect(rosa.ability.cooldownMs).toBe(14000);
  });
});
