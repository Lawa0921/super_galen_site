// journal.ts — 探索 UI（DOM）：發現橫幅（佇列）、碑文閱讀面板、探險日誌（J）。
// 內容全部用 textContent / class 組出來；進度條是 20 格像素方塊（不用行內樣式）。
import { ENEMIES, ENEMY_KINDS, NATURAL_KINDS } from '../engine/enemies';
import type { DelveGame } from '../engine/game';
import { CATEGORY_LABEL, type RegionCat } from '../engine/discovery';
import { LORE, loreEntry } from '../engine/lore';
import { ITEMS } from '../engine/items';
import { drawIcon, type Atlas } from './textures';
import { BannerQueue, distanceLabel, exploredLabel, percentLabel } from './model';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
/** n 格的像素進度條（亮的格 = 比例） */
function segBar(frac: number, n = 20): HTMLElement {
  const bar = el('span', 'delve-seg');
  const on = Math.round(Math.max(0, Math.min(1, frac)) * n);
  for (let i = 0; i < n; i++) bar.appendChild(el('span', i < on ? 'delve-seg-cell is-on' : 'delve-seg-cell'));
  return bar;
}

export class ExploreUi {
  private banner = new BannerQueue(2.8);
  private bannerKey = '';
  private readonly offs: (() => void)[] = [];
  private journalSig = '';

  constructor(private root: HTMLElement, private game: DelveGame, private atlas: Atlas) {
    const on = (sel: string, fn: () => void): void => {
      const b = root.querySelector(sel);
      if (!b) return;
      b.addEventListener('click', fn);
      this.offs.push(() => b.removeEventListener('click', fn));
    };
    on('#delve-lore-close', () => this.closeLore());
    on('#delve-journal-close', () => this.setJournal(false));
    on('#delve-journal-btn', () => this.toggleJournal());
    const body = root.querySelector('#delve-journal-body');
    if (body) {
      const onBody = (e: Event): void => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lore]');
        if (b?.dataset.lore) this.showLore(Number(b.dataset.lore), false);
      };
      body.addEventListener('click', onBody);
      this.offs.push(() => body.removeEventListener('click', onBody));
    }
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T | null { return this.root.querySelector<T>(sel); }

  // ── 橫幅 ──
  discover(name: string, cat: RegionCat): void {
    this.banner.push({ title: `發現：${name}`, sub: CATEGORY_LABEL[cat] });
  }
  /** 每幀呼叫 */
  tick(dt: number): void {
    const cur = this.banner.tick(dt);
    const b = this.q('#delve-banner');
    if (!b) return;
    const key = cur ? cur.title : '';
    if (key !== this.bannerKey) {
      this.bannerKey = key;
      if (cur) {
        const t = this.q('#delve-banner-title'), s = this.q('#delve-banner-sub');
        if (t) t.textContent = cur.title;
        if (s) s.textContent = cur.sub;
      }
    }
    const p = this.banner.progress;
    b.classList.toggle('is-on', Boolean(cur) && p < 0.88);
    if (this.journalOpen && this.game.tick % 30 === 0) this.renderJournal();
  }
  get bannerText(): string { return this.bannerKey; }

  // ── 碑文 ──
  get loreOpen(): boolean { return !(this.q('#delve-lore')?.hidden ?? true); }
  showLore(id: number, first: boolean): void {
    const e = loreEntry(id), box = this.q('#delve-lore');
    if (!box) return;
    const k = this.q('#delve-lore-kicker'), t = this.q('#delve-lore-title'), x = this.q('#delve-lore-text');
    if (k) k.textContent = `古碑 · 第 ${id + 1} 篇 / ${LORE.length}${first ? ' · 新收錄進日誌' : ''}`;
    if (t) t.textContent = `《${e.title}》`;
    if (x) x.textContent = e.text;
    box.hidden = false;
    this.journalSig = '';
  }
  closeLore(): void { const b = this.q('#delve-lore'); if (b) b.hidden = true; }

  // ── 日誌 ──
  get journalOpen(): boolean { return !(this.q('#delve-journal')?.hidden ?? true); }
  setJournal(open: boolean): void {
    const j = this.q('#delve-journal');
    if (!j) return;
    j.hidden = !open;
    if (open) { this.journalSig = ''; this.renderJournal(); }
  }
  toggleJournal(): void { this.setJournal(!this.journalOpen); }

  renderJournal(): void {
    const body = this.q('#delve-journal-body');
    if (!body) return;
    const g = this.game, d = g.discovery, s = d.stats();
    const w = g.world;
    const explored = g.explored.count / (w.width * w.height);
    const killSig = Object.values(g.kills).reduce((a, n) => a + (n ?? 0), 0);
    const sig = `${d.found.size}|${d.lore.size}|${d.treasures.size}|${s.depthRecord}|${Math.round(s.distance / 10)}|${exploredLabel(explored)}|${killSig}|${g.bossesDefeated.size}`;
    if (sig === this.journalSig) return;
    this.journalSig = sig;
    body.replaceChildren();

    const top = el('div', 'delve-j-top');
    top.append(el('span', 'delve-j-big', `完成度 ${percentLabel(s.completion)}`), segBar(s.completion));
    body.appendChild(top);
    const facts = el('p', 'delve-j-facts', `存活第 ${this.game.date().dayIndex + 1} 天（${this.game.dateText()}）· 最深 ${s.depthRecord} 格 · 移動 ${distanceLabel(s.distance)} · 地圖探索 ${exploredLabel(explored)}`);
    facts.dataset.testid = 'journal-facts';
    body.appendChild(facts);

    const cats = el('ul', 'delve-j-cats');
    for (const c of s.cats) {
      const li = el('li', 'delve-j-cat');
      li.dataset.cat = c.cat;
      const head = el('div', 'delve-j-cat-head');
      const count = el('span', 'delve-j-count', `${c.found} / ${c.total}`);
      count.dataset.count = String(c.found);
      head.append(el('span', 'delve-j-cat-name', c.label), count, segBar(c.total ? c.found / c.total : 0, 10));
      li.appendChild(head);
      const names = g.regions.filter((r) => r.cat === c.cat && d.isFound(r.id)).map((r) => r.name);
      const left = c.total - c.found;
      li.appendChild(el('p', 'delve-j-names', names.length ? names.join('、') + (left ? ` …還有 ${left} 處` : '') : `尚未發現（${c.total} 處）`));
      cats.appendChild(li);
    }
    body.appendChild(cats);

    body.appendChild(el('h3', 'delve-j-h', `古碑 ${s.lore.found} / ${s.lore.total}`));
    const lore = el('ol', 'delve-j-lore');
    LORE.forEach((e, i) => {
      const li = el('li');
      if (d.lore.has(i)) {
        const b = el('button', 'delve-j-lore-btn', `《${e.title}》`);
        b.type = 'button';
        b.dataset.lore = String(i);
        li.appendChild(b);
      } else li.appendChild(el('span', 'delve-j-unknown', '？？？'));
      lore.appendChild(li);
    });
    body.appendChild(lore);

    body.appendChild(el('h3', 'delve-j-h', `珍寶 ${s.treasures.found} / ${s.treasures.total}`));
    const tr = el('div', 'delve-j-treasures');
    for (const id of d.treasureItems) {
      const got = d.treasures.has(id);
      const cell = el('span', got ? 'delve-j-treasure is-got' : 'delve-j-treasure');
      const c = el('canvas', 'delve-slot-icon');
      c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      if (ctx) drawIcon(this.atlas, ctx, id, 16);
      cell.title = got ? ITEMS[id].name.zh : '？？？';
      cell.appendChild(c);
      tr.appendChild(cell);
    }
    body.appendChild(tr);

    // 首領擊敗 + 圖鑑（擊殺過的怪物種類與數量）
    const bosses = ENEMY_KINDS.filter((k) => ENEMIES[k].boss);
    const beaten = bosses.filter((k) => g.bossesDefeated.has(k)).length;
    body.appendChild(el('h3', 'delve-j-h', `首領擊敗 ${beaten} / ${bosses.length}`));
    const bl = el('p', 'delve-j-names');
    bl.dataset.testid = 'journal-bosses';
    bl.textContent = bosses.map((k) => (g.bossesDefeated.has(k) ? `${ENEMIES[k].name.zh} ✓` : '？？？（燈芯祭品）')).join('、');
    body.appendChild(bl);
    const kinds = NATURAL_KINDS;
    const met = kinds.filter((k) => (g.kills[k] ?? 0) > 0);
    body.appendChild(el('h3', 'delve-j-h', `怪物圖鑑 ${met.length} / ${kinds.length}`));
    body.appendChild(el('p', 'delve-j-names', met.length ? met.map((k) => `${ENEMIES[k].name.zh} ×${g.kills[k]}`).join('、') : '還沒有擊敗任何怪物'));
  }

  destroy(): void { for (const f of this.offs) f(); }
}
