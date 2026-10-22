// folkLook.test.ts — 世界 NPC 的外觀產生器不受基本布衣（OUTFITS 末尾的 plain）影響：同一個種子永遠同一個樣子、不會穿布衣。
import { describe, it, expect } from 'vitest';
import { folkLook, ROLES, type FolkRole } from './folkDefs';
import { Rng } from './rng';
import { OUTFITS, OUTFIT_PLAIN } from './appearance';

const ROLE_IDS = Object.keys(ROLES) as FolkRole[];

describe('folkLook 與基本布衣', () => {
  it('釘住：每種職能 × 3 個種子的外觀和加布衣之前（5dc476ff 算出來的雜湊）一樣', () => {
    const out: string[] = [];
    for (const role of ROLE_IDS) for (let s = 0; s < 3; s++) out.push(`${role}:${s}=${JSON.stringify(folkLook(role, new Rng(`pin:${role}:${s}`)))}`);
    let x = 0x811c9dc5;
    for (const ch of out.join('\n')) { x ^= ch.charCodeAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
    expect(x.toString(16)).toBe('84509816');
    expect(folkLook('trader', new Rng('pin:trader:0')).app).toEqual({ body: 1, race: 0, blush: false, hair: 11, hairColor: 7, ahoge: false, eyes: 1, eyeShape: 0, skin: 1, outfit: 4, color1: 9, color2: 11, acc: 0, glasses: false });
  });
  it('隨機服裝只從布衣之前的服裝抽（亂數範圍 = OUTFIT_PLAIN，不是 OUTFITS.length）', () => {
    for (const role of ROLE_IDS) {
      const ranges: number[] = [];
      const rng = new Rng(`range:${role}`), int = rng.int.bind(rng);
      rng.int = (min: number, maxExcl: number): number => { ranges.push(maxExcl - min); return int(min, maxExcl); };
      folkLook(role, rng);
      expect(ranges, role).not.toContain(OUTFITS.length);
      if (ROLES[role].race !== 'dwarf') expect(ranges, role).toContain(OUTFIT_PLAIN);
    }
  });
  it('很多種子下沒有人穿布衣', () => {
    for (const role of ROLE_IDS) for (let s = 0; s < 300; s++) expect(folkLook(role, new Rng(`np:${role}:${s}`)).app.outfit, role).not.toBe(OUTFIT_PLAIN);
  });
});
