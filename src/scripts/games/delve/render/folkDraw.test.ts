import { describe, it, expect } from 'vitest';
import { folkFrames, folkFrame } from './folkDraw';
import { folkLook, ROLES, type FolkRole } from '../engine/folkDefs';
import { Rng } from '../engine/rng';
import { HAIR_STYLES } from '../engine/appearance';
import { inPalette } from './pixel';
import { eyeRamp, MOUTH, MOUTH_RED, TONGUE } from './avatarPalette';

const topRow = (b: { w: number; h: number; on(x: number, y: number): boolean }): number => {
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) return y;
  return b.h;
};

describe('世界 NPC 的紙娃娃', () => {
  it('每種職能都烘得出影格（idle / walk / 肖像），像素都在色票上、沒有半透明', () => {
    for (const role of Object.keys(ROLES) as FolkRole[]) {
      const f = folkFrames(folkLook(role, new Rng(`t:${role}`)));
      expect(f.idle.length).toBeGreaterThan(0);
      expect(f.walk.length).toBeGreaterThan(0);
      for (const b of [f.idle[0], f.portrait]) {
        let n = 0;
        for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
          const v = b.raw(x, y), a = v >>> 24;
          if (!a) continue;
          expect(a).toBe(255);
          expect(inPalette([v & 255, (v >>> 8) & 255, (v >>> 16) & 255])).toBe(true);
          n++;
        }
        expect(n).toBeGreaterThan(100);
      }
    }
  });
  it('矮人的鬍子只長在臉的前下方和下巴：每位矮人（各種子、男女、待機 / 走路 / 肖像）的眼睛和嘴巴都看得到', () => {
    const mouth = new Set([MOUTH, MOUTH_RED, TONGUE].map((c) => c.join()));
    for (const role of ['ore_trader', 'runesmith', 'dwarf_elder'] as FolkRole[]) for (let s = 0; s < 8; s++) {
      const l = folkLook(role, new Rng(`dw:${role}:${s}`));
      const er = new Set(eyeRamp(l.app.eyes).slice(0, 2).map((c) => c.join()));
      const f = folkFrames(l);
      for (const [k, b] of [['idle0', f.idle[0]], ['idle2', f.idle[2]], ['walk1', f.walk[1]], ['walk5', f.walk[5]], ['portrait', f.portrait]] as const) {
        let eye = 0, mo = 0;
        for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
          if (!b.on(x, y)) continue;
          const c = b.get(x, y).join();
          if (er.has(c)) eye++;
          if (mouth.has(c)) mo++;
        }
        expect(eye, `${role} ${s} ${k} 眼睛`).toBeGreaterThanOrEqual(6);
        expect(mo, `${role} ${s} ${k} 嘴巴`).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('人類 NPC 的髮型從全部髮型抽（新加的髮型也抽得到）', () => {
    const hairs = new Set<number>();
    for (let s = 0; s < 400; s++) hairs.add(folkLook('trader', new Rng(`hs:${s}`)).app.hair);
    for (let h = 0; h < HAIR_STYLES.length; h++) expect(hairs.has(h), `hair ${HAIR_STYLES[h].id}`).toBe(true);
  });
  it('folkFrame：只烘要用的那一格（和整組烘出來的同一格一模一樣）', () => {
    const l = folkLook('guide', new Rng('lazy'));
    const all = folkFrames(l);
    expect(folkFrame(l, 'walk', 3).px.join()).toBe(all.walk[3].px.join());
    expect(folkFrame(l, 'idle', 1).px.join()).toBe(all.idle[1].px.join());
    expect(folkFrame(l, 'blink', 0).px.join()).toBe(all.blink.px.join());
  });
  it('矮人一眼分得出來：比人類矮、戴頭燈盔', () => {
    const human = folkFrames(folkLook('trader', new Rng('h')));
    const dwarf = folkFrames(folkLook('ore_trader', new Rng('d')));
    expect(topRow(dwarf.idle[0])).toBeGreaterThanOrEqual(topRow(human.idle[0]) + 3);
    expect(folkLook('ore_trader', new Rng('d')).head).toBe('hat:miner');
  });
});
