// wardrobe.test.ts — 衣櫥模式（DOM，happy-dom）：建角 'create' 只列身體特徵 + 種族 + 布衣配色；'full' = 全部欄位（舊行為）
import { describe, it, expect, beforeEach } from 'vitest';
import { Wardrobe, wardrobeFields } from './wardrobe';
import { APPEARANCE_FIELDS, OUTFIT_PLAIN, bodyDefaults, type Appearance } from '../engine/appearance';
import { createCharacter } from '../save/character';
import type { SoundManager } from '../audio/SoundManager';

/** P6：建角可選的列（順序 = 畫面順序） */
const CREATE_KEYS = ['body', 'race', 'hair', 'hairColor', 'ahoge', 'eyes', 'eyeShape', 'skin', 'blush', 'color1', 'color2'];

const quiet = { ensure() {}, uiMove() {}, uiDice() {}, uiBack() {}, uiConfirm() {} } as unknown as SoundManager;

function mount(): { root: HTMLElement; panel: HTMLElement; w: Wardrobe } {
  document.body.innerHTML = `
    <main id="delve-root">
      <section id="delve-wardrobe" hidden>
        <canvas id="delve-wr-doll"></canvas><p id="delve-wr-cap"></p>
        <button id="delve-wr-turn" type="button"></button>
        <div id="delve-wr-rows"></div>
        <button id="delve-wr-random" type="button"></button>
        <button id="delve-wr-cancel" type="button"></button>
        <button id="delve-wr-done" type="button"></button>
      </section>
    </main>`;
  const root = document.getElementById('delve-root')!, panel = document.getElementById('delve-wardrobe')!;
  return { root, panel, w: new Wardrobe(root, panel, quiet) };
}
const rowKeys = (panel: HTMLElement): string[] => [...panel.querySelectorAll<HTMLElement>('.delve-wr-row')].map((r) => r.dataset.key ?? '');
const click = (panel: HTMLElement, sel: string): void => { panel.querySelector<HTMLElement>(sel)!.click(); };

describe('wardrobeFields', () => {
  it("'create' = P6 清單（沒有服裝 / 頭飾 / 眼鏡列）；'full' = 全部欄位", () => {
    expect(wardrobeFields('create').map((f) => f.key)).toEqual(CREATE_KEYS);
    expect(wardrobeFields('full')).toEqual(APPEARANCE_FIELDS);
  });
});

describe('Wardrobe 模式', () => {
  let m: ReturnType<typeof mount>;
  beforeEach(() => { m = mount(); });

  it('沒給 mode = full（內部呼叫不受影響）', () => {
    m.w.open(bodyDefaults(0), { onDone: () => {} });
    expect(rowKeys(m.panel)).toEqual(APPEARANCE_FIELDS.map((f) => f.key));
  });
  it("'create' 只建出 P6 的列；之後再用 full 打開會換回全部", () => {
    m.w.open(bodyDefaults(0), { mode: 'create', onDone: () => {} });
    expect(rowKeys(m.panel)).toEqual(CREATE_KEYS);
    m.w.close();
    m.w.open(bodyDefaults(0), { onDone: () => {} });
    expect(rowKeys(m.panel)).toEqual(APPEARANCE_FIELDS.map((f) => f.key));
    m.w.close();
    m.w.open(bodyDefaults(0), { mode: 'create', onDone: () => {} });
    expect(rowKeys(m.panel)).toEqual(CREATE_KEYS);
  });
  it("'create' 排版：每組標題後面都有列（沒有空組）；奇數列的組才補說明；種族說明還在", () => {
    m.w.open(bodyDefaults(0), { mode: 'create', onDone: () => {} });
    const list = m.panel.querySelector('#delve-wr-rows')!;
    const kids = [...list.children] as HTMLElement[];
    kids.forEach((el, i) => {
      if (el.classList.contains('delve-wr-group')) expect(kids[i + 1]?.classList.contains('delve-wr-row')).toBe(true);
    });
    expect(kids.filter((el) => el.classList.contains('delve-wr-group')).map((el) => el.textContent)).toEqual(['頭髮', '臉', '布衣']);
    // 頭髮 3 列 → 1 則補位說明；臉 4 列、布衣 2 列 → 不補
    expect(list.querySelectorAll('.delve-wr-note').length).toBe(1);
    expect(list.querySelector('.delve-wr-blurb')?.textContent).toBeTruthy();
  });
  it("'create' 從穿著水手服 + 蝴蝶結 + 眼鏡的舊預設打開 → 完成時是布衣、沒頭飾、沒眼鏡；用它建的角色也是", () => {
    let got: Appearance | null = null;
    m.w.open({ ...bodyDefaults(0), glasses: true }, { mode: 'create', onDone: (a) => { got = a; } });
    expect(m.w.appearance.outfit).toBe(OUTFIT_PLAIN);
    // 主色往下一個：布衣的顏色可以調
    m.panel.querySelector<HTMLElement>('.delve-wr-row[data-key="color1"] .delve-wr-arrow[data-dir="1"]')!.click();
    click(m.panel, '#delve-wr-done');
    expect(got).not.toBeNull();
    const a = got! as Appearance;
    expect(a).toMatchObject({ outfit: OUTFIT_PLAIN, acc: 0, glasses: false });
    const c = createCharacter('阿明', a, 0);
    expect(c.appearance).toMatchObject({ outfit: OUTFIT_PLAIN, acc: 0, glasses: false, color1: a.color1 });
  });
  it("'create' 隨機 / 換體型之後仍是布衣、沒頭飾、沒眼鏡", () => {
    m.w.open(bodyDefaults(0), { mode: 'create', onDone: () => {} });
    for (let i = 0; i < 25; i++) {
      click(m.panel, '#delve-wr-random');
      expect(m.w.appearance).toMatchObject({ outfit: OUTFIT_PLAIN, acc: 0, glasses: false });
    }
    for (let i = 0; i < 2; i++) {
      m.panel.querySelector<HTMLElement>('.delve-wr-row[data-key="body"] .delve-wr-arrow[data-dir="1"]')!.click();
      expect(m.w.appearance).toMatchObject({ outfit: OUTFIT_PLAIN, acc: 0, glasses: false });
    }
  });
});
