import { describe, it, expect } from 'vitest';
import { folkFrames, folkFrame } from './folkDraw';
import { folkLook, ROLES, type FolkRole } from '../engine/folkDefs';
import { Rng } from '../engine/rng';
import { inPalette } from './pixel';

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
