// journal.ts — 探索 UI（DOM）：發現橫幅（佇列）、碑文閱讀面板、探險日誌（J）。
// 內容全部用 textContent / class 組出來；進度條是 20 格像素方塊（不用行內樣式）。
import { ENEMIES, ENEMY_KINDS, NATURAL_KINDS } from '../engine/enemies';
import type { DelveGame } from '../engine/game';
import { CATEGORY_LABEL, type RegionCat } from '../engine/discovery';
import { LORE, loreEntry } from '../engine/lore';
import { ITEMS } from '../engine/items';
import { FISH_SPECIES } from '../engine/fishing';
import { AFFIXES, BASE_TIER, RARITIES, STAT_LABEL } from '../engine/gear';
import type { ItemId } from '../engine/items';
import { drawIcon, type Atlas } from './textures';
import { BannerQueue, biomeLabel, distanceLabel, exploredLabel, percentLabel } from './model';
import { NPCS, NPC_KINDS, moodLabel } from '../engine/npcs';
import { FURNITURE } from '../engine/furniture';
import { tileDef } from '../engine/tiles';
import { LEVEL_NAMES } from '../engine/settlement';
import { npcPortrait } from './settleUi';
import { journalLevelLine } from './levelModel';

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
        // 目錄：跳到那一節
        const j = (e.target as HTMLElement).closest<HTMLElement>('[data-jump]');
        if (j?.dataset.jump) { body.querySelector(`[data-sec="${j.dataset.jump}"]`)?.scrollIntoView({ block: 'start' }); return; }
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
  /** 同一個對話框顯示其他文字（地標的發現文字 / 線索） */
  showNote(kicker: string, title: string, text: string): void {
    const box = this.q('#delve-lore');
    if (!box) return;
    const k = this.q('#delve-lore-kicker'), t = this.q('#delve-lore-title'), x = this.q('#delve-lore-text');
    if (k) k.textContent = kicker;
    if (t) t.textContent = title;
    if (x) x.textContent = text;
    box.hidden = false;
    this.journalSig = '';
  }

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
    // 「已探索 %」只算中央區（外圍無限，百分比沒有意義）
    const explored = g.explored.centralCount() / (w.width * w.height);
    const killSig = Object.values(g.kills).reduce((a, n) => a + (n ?? 0), 0);
    const fishSig = Object.values(g.fishLog).reduce((a, n) => a + (n ?? 0), 0);
    const codexSig = [...g.codex.affixes.values()].reduce((a, n) => a + n, 0) * 100 + [...g.codex.items.values()].reduce((a, n) => a + n + 1, 0);
    const settleSig = g.settle.cores.map((c) => `${c.id}:${g.settle.evaluation(c.id, w)?.level ?? 0}`).join() + '/' + g.settle.npcs.map((n) => `${n.kind}${n.mood}`).join();
    const sig = `${g.levels.xp}|${g.levels.spent}|${d.found.size}|${d.lore.size}|${d.treasures.size}|${d.landmarks.size}|${g.quests.completed.size}|${s.depthRecord}|${Math.round(s.distance / 10)}|${exploredLabel(explored)}|${killSig}|${g.bossesDefeated.size}|${fishSig}|${codexSig}|${settleSig}`;
    if (sig === this.journalSig) return;
    this.journalSig = sig;
    body.replaceChildren();

    // 目錄（日誌很長：直接跳到裝備圖鑑等）
    const nav = el('nav', 'delve-j-nav');
    nav.setAttribute('aria-label', '日誌目錄');
    for (const [k, label] of [['regions', '地區'], ['lore', '古碑'], ['bestiary', '怪物'], ['fish', '釣魚'], ['settle', '據點'], ['codex', '裝備圖鑑']] as const) {
      const b = el('button', 'delve-btn', label);
      b.type = 'button'; b.dataset.jump = k;
      nav.appendChild(b);
    }
    body.appendChild(nav);
    const top = el('div', 'delve-j-top');
    top.append(el('span', 'delve-j-big', `完成度 ${percentLabel(s.completion)}`), segBar(s.completion));
    body.appendChild(top);
    const facts = el('p', 'delve-j-facts', `存活第 ${this.game.date().dayIndex + 1} 天（${this.game.dateText()}）· 最深 ${s.depthRecord} 格 · 移動 ${distanceLabel(s.distance)} · 地圖探索 ${exploredLabel(explored)}`);
    facts.dataset.testid = 'journal-facts';
    body.appendChild(facts);
    // 等級系統：等級 / 稱號 / 經驗 / 技能點
    const lv = el('p', 'delve-j-facts delve-j-level', journalLevelLine(g.levels));
    lv.dataset.testid = 'journal-level';
    body.appendChild(lv);

    const cats = el('ul', 'delve-j-cats');
    cats.dataset.sec = 'regions';
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

    const loreH = el('h3', 'delve-j-h', `古碑 ${s.lore.found} / ${s.lore.total}`);
    loreH.dataset.sec = 'lore';
    body.appendChild(loreH);
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

    // 地標發現物：每種地點的一次性發現物（找到 / 總數）
    const lmH = el('h3', 'delve-j-h', `地標發現物 ${s.landmarks.found} / ${s.landmarks.total}`);
    lmH.dataset.testid = 'journal-landmarks';
    body.appendChild(lmH);
    const lm = el('ul', 'delve-j-furn');
    const byTile = new Map<number, { got: number; all: number }>();
    for (const l of g.landmarks) {
      const e = byTile.get(l.tile) ?? { got: 0, all: 0 };
      e.all++;
      if (d.landmarks.has(w.idx(l.x, l.y))) e.got++;
      byTile.set(l.tile, e);
    }
    for (const [tile, e] of byTile) lm.appendChild(el('li', e.got ? 'is-got' : '', `${tileDef(tile).name.zh}：${e.got} / ${e.all}`));
    body.appendChild(lm);
    body.appendChild(el('p', 'delve-j-names', `委託完成 ${g.quests.completed.size} 件 · 結識的村民與矮人 ${Object.keys(g.folk.aff).filter((k) => g.folk.aff[k] > 0).length} 位`));

    // 首領擊敗 + 圖鑑（擊殺過的怪物種類與數量）
    const bosses = ENEMY_KINDS.filter((k) => ENEMIES[k].boss);
    const beaten = bosses.filter((k) => g.bossesDefeated.has(k)).length;
    const bossH = el('h3', 'delve-j-h', `首領擊敗 ${beaten} / ${bosses.length}`);
    bossH.dataset.sec = 'bestiary';
    body.appendChild(bossH);
    const bl = el('p', 'delve-j-names');
    bl.dataset.testid = 'journal-bosses';
    bl.textContent = bosses.map((k) => (g.bossesDefeated.has(k) ? `${ENEMIES[k].name.zh} ✓` : '？？？（燈芯祭品）')).join('、');
    body.appendChild(bl);
    const kinds = NATURAL_KINDS;
    const met = kinds.filter((k) => (g.kills[k] ?? 0) > 0);
    body.appendChild(el('h3', 'delve-j-h', `怪物圖鑑 ${met.length} / ${kinds.length}`));
    body.appendChild(el('p', 'delve-j-names', met.length ? met.map((k) => `${ENEMIES[k].name.zh} ×${g.kills[k]}`).join('、') : '還沒有擊敗任何怪物'));

    // 釣魚紀錄：每種魚一格圖示（沒釣過 = 暗格 + ？？？），滑過顯示名稱與條數
    const caught = FISH_SPECIES.filter((f) => (g.fishLog[f] ?? 0) > 0);
    const fh = el('h3', 'delve-j-h', `釣魚紀錄 ${caught.length} / ${FISH_SPECIES.length}`);
    fh.dataset.testid = 'journal-fish';
    fh.dataset.sec = 'fish';
    body.appendChild(fh);
    const fl = el('div', 'delve-j-treasures');
    for (const id of FISH_SPECIES) {
      const n = g.fishLog[id] ?? 0;
      const cell = el('span', n ? 'delve-j-treasure is-got' : 'delve-j-treasure');
      const c = el('canvas', 'delve-slot-icon');
      c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      if (ctx) drawIcon(this.atlas, ctx, id, 16);
      cell.title = n ? `${ITEMS[id].name.zh} ×${n}` : '？？？';
      cell.dataset.fish = id;
      cell.appendChild(c);
      fl.appendChild(cell);
    }
    body.appendChild(fl);
    this.renderSettle(body);
    this.renderCodex(body);
  }

  /** 據點與居民：據點等級、居民（沒來過的是黑影 + 入住條件）、家具圖鑑（舒適度） */
  private renderSettle(body: HTMLElement): void {
    const g = this.game, st = g.settle;
    const h = el('h3', 'delve-j-h', `據點與居民：據點 ${st.cores.length} 個 · 居民 ${st.npcs.length} / ${NPC_KINDS.length}`);
    h.dataset.sec = 'settle';
    h.dataset.testid = 'journal-settle';
    body.appendChild(h);
    body.appendChild(el('p', 'delve-j-names', st.cores.length
      ? st.cores.map((c) => { const lv = st.evaluation(c.id, g.world)?.level ?? 0; return `${biomeLabel(g.world.biomeAt(c.x))}據點 Lv${lv}「${LEVEL_NAMES[lv]}」（${c.x}, ${c.y}）`; }).join('、')
      : '還沒有據點：做一個「據點爐心」放在地上，範圍內的合格房間會吸引居民搬來'));
    const ppl = el('div', 'delve-j-npcs');
    for (const k of NPC_KINDS) {
      const n = st.npc(k), d = st.def(k);
      const cell = el('span', n ? 'delve-j-npc is-got' : 'delve-j-npc');
      cell.dataset.npc = k;
      cell.appendChild(npcPortrait(k, d.look));
      cell.appendChild(el('span', '', n ? `${d.name}・${d.title}` : `？？？・${d.title}`));
      cell.title = n ? `${d.intro}（心情：${moodLabel(n.mood)}）` : `入住條件：${d.need.zh}`;
      ppl.appendChild(cell);
    }
    body.appendChild(ppl);
    body.appendChild(el('p', 'delve-j-names', '合格的房間：封閉、人造背景牆、門、光源、桌子、椅子、床，20–120 格。家具越多樣、越舒適，據點等級越高。'));
    const ul = el('ul', 'delve-j-furn');
    ul.dataset.testid = 'journal-furniture';
    for (const f of FURNITURE) {
      const li = el('li');
      const c = el('canvas', 'delve-slot-icon');
      c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      if (ctx) drawIcon(this.atlas, ctx, f.item, 16);
      const role = { table: '桌子', seat: '座位', bed: '床', light: '光源', decor: '裝飾', storage: '收納', station: '合成站' }[f.role];
      const txt = el('span', '', `${ITEMS[f.item].name.zh}（${role} · 舒適 ${f.comfort}）`);
      txt.appendChild(document.createElement('br'));
      txt.appendChild(el('small', '', f.note));
      li.append(c, txt);
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  /** 裝備圖鑑：詞條（見過的最高階）、傳奇詞條（效果）、每種基底拿過的最高稀有度 */
  private renderCodex(body: HTMLElement): void {
    const cx = this.game.codex, st = cx.stats();
    const h = el('h3', 'delve-j-h', `裝備圖鑑：詞條 ${st.affixes} / ${st.affixTotal} · 傳奇 ${st.uniques} / ${st.uniqueTotal}`);
    h.dataset.testid = 'journal-codex';
    h.dataset.sec = 'codex';
    body.appendChild(h);
    const ul = el('ul', 'delve-j-affixes');
    for (const a of AFFIXES.filter((x) => x.kind !== 'unique')) {
      const t = cx.affixes.get(a.id);
      // 晶片：名稱 + 效果（沒見過也先告訴你它是什麼效果）
      const li = el('li', t ? 'delve-j-affix is-got' : 'delve-j-affix', t ? `${a.kind === 'prefix' ? a.word : `· ${a.word}`} T${t} ` : '？？？ ');
      li.appendChild(el('span', 'delve-j-affix-fx', STAT_LABEL[a.stat]));
      li.dataset.affix = a.id;
      ul.appendChild(li);
    }
    body.appendChild(ul);
    const uq = el('ul', 'delve-j-affixes');
    for (const a of AFFIXES.filter((x) => x.kind === 'unique')) {
      const got = cx.affixes.has(a.id);
      const li = el('li', got ? 'delve-j-affix is-unique is-got' : 'delve-j-affix is-unique', got ? `★ ${a.word.slice(0, -1)}：${a.desc}` : '★ ？？？（傳說以上的裝備才會出現）');
      li.dataset.affix = a.id;
      uq.appendChild(li);
    }
    body.appendChild(uq);
    const bases = (Object.keys(BASE_TIER) as ItemId[]).filter((id) => !ITEMS[id].unique);
    const got = bases.filter((id) => cx.items.has(id)).length;
    body.appendChild(el('p', 'delve-j-names', `收藏：${got} / ${bases.length} 種裝備（外框 = 拿過的最高稀有度）`));
    const grid = el('div', 'delve-j-treasures');
    for (const id of bases) {
      const r = cx.items.get(id);
      const cell = el('span', 'delve-j-gear');
      if (r !== undefined) cell.dataset.rarity = String(r);
      const c = el('canvas', 'delve-slot-icon');
      c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      if (ctx) drawIcon(this.atlas, ctx, id, 16);
      cell.title = r !== undefined ? `${ITEMS[id].name.zh}（最高：${RARITIES[r].zh}）` : '？？？';
      cell.appendChild(c);
      grid.appendChild(cell);
    }
    body.appendChild(grid);
  }

  destroy(): void { for (const f of this.offs) f(); }
}
