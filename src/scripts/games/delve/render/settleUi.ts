// settleUi.ts — 據點 UI（DOM）：據點面板（B / 點爐心）、居民面板（點居民：對話 / 商店 / 服務）、
// 查房模式的房間標籤（H）、居民頭上的對話泡泡。內容一律 textContent / class 組成；定位用 CSS 變數（--x / --y）。
import { FOLK_TALK_RANGE, type DelveGame } from '../engine/game';
import { NPCS, NPC_KINDS, moodLabel, shopPrice, type NpcKind, type NpcLook } from '../engine/npcs';
import { LEVEL_NAMES, LEVELS, MAX_LEVEL, PERKS, PERK_ORDER, nextNeeds, type Evaluation } from '../engine/settlement';
import { roomReasonsText } from '../engine/housing';
import { ITEMS, type ItemId } from '../engine/items';
import { TILE_SIZE as S } from '../engine/constants';
import { biomeLabel } from './model';
import { drawIcon, type Atlas } from './textures';
import { npcFrames } from './settleDraw';
import { toCanvas } from './pixel';
import type { Renderer } from './renderer';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
function segBar(frac: number, n = 10): HTMLElement {
  const bar = el('span', 'delve-seg');
  const on = Math.round(Math.max(0, Math.min(1, frac)) * n);
  for (let i = 0; i < n; i++) bar.appendChild(el('span', i < on ? 'delve-seg-cell is-on' : 'delve-seg-cell'));
  return bar;
}
/** 銅幣 → 「3 銀 20 銅」 */
export function coinText(c: number): string {
  const s = Math.floor(c / 100), r = c % 100;
  return s ? (r ? `${s} 銀 ${r} 銅` : `${s} 銀`) : `${r} 銅`;
}

const portraitCache = new Map<string, HTMLCanvasElement>();
/** 居民肖像（44×34 美術 px；CSS 整數倍放大）；look = 被邀請那個人的外觀（省略 = 預設） */
export function npcPortrait(kind: NpcKind, look: NpcLook = NPCS[kind].look): HTMLCanvasElement {
  const key = `${kind}:${JSON.stringify(look)}`;
  let src = portraitCache.get(key);
  if (!src) { src = toCanvas(npcFrames(kind, look).portrait) as HTMLCanvasElement; portraitCache.set(key, src); }
  const c = el('canvas', 'delve-npc-face');
  c.width = src.width; c.height = src.height;
  c.getContext('2d')?.drawImage(src, 0, 0);
  return c;
}

export class SettleUi {
  private readonly offs: (() => void)[] = [];
  private settleId: number | null = null;
  private npcKind: NpcKind | null = null;
  private npcLine = '';
  private svcMsg = '';
  private sig = '';
  private labels: HTMLElement | null;
  private tags = new Map<string, HTMLElement>();
  private frame = 0;

  constructor(private root: HTMLElement, private game: DelveGame, private renderer: Renderer, private atlas: Atlas,
    private onToast: (m: string) => void = () => {}, private onInventory: () => void = () => {}) {
    this.labels = root.querySelector('#delve-wlabels');
    const on = (sel: string, fn: (e: Event) => void): void => {
      const b = root.querySelector(sel);
      if (!b) return;
      b.addEventListener('click', fn);
      this.offs.push(() => b.removeEventListener('click', fn));
    };
    on('#delve-settle-close', () => this.closeSettle());
    on('#delve-npc-close', () => this.closeNpc());
    on('#delve-house-btn', () => this.toggleHousing());
    on('#delve-settle-btn', () => this.toggleSettle());
    on('#delve-settle-body', (e) => this.onSettleClick(e));
    on('#delve-npc-body', (e) => this.onNpcClick(e));
  }
  private q<T extends HTMLElement = HTMLElement>(sel: string): T | null { return this.root.querySelector<T>(sel); }

  // ── 查房模式 ──
  get housing(): boolean { return this.renderer.settleLayer.housing; }
  setHousing(on: boolean): void {
    this.renderer.settleLayer.housing = on;
    this.root.dataset.housing = on ? '1' : '';
    if (!on) delete this.root.dataset.housing;
    this.q('#delve-house-btn')?.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!on) { for (const t of this.tags.values()) t.remove(); this.tags.clear(); }
  }
  toggleHousing(): void {
    this.setHousing(!this.housing);
    this.onToast(this.housing ? '查房模式：綠色 = 可入住、紅色 = 還缺東西（再按 H 關閉）' : '查房模式：關');
  }

  // ── 據點面板 ──
  get settleOpen(): boolean { return !(this.q('#delve-settle')?.hidden ?? true); }
  get npcOpen(): boolean { return !(this.q('#delve-npc')?.hidden ?? true); }
  openSettle(id: number): void {
    this.settleId = id;
    const p = this.q('#delve-settle');
    if (p) p.hidden = false;
    this.closeNpc();
    this.game.settle.refresh(this.game.world, true);
    this.sig = '';
    this.renderSettle();
  }
  closeSettle(): void { const p = this.q('#delve-settle'); if (p) p.hidden = true; this.settleId = null; }
  /** B：在據點範圍內 → 開那個據點；不在 → 開第一個（或提示怎麼建立） */
  toggleSettle(): void {
    if (this.settleOpen) { this.closeSettle(); return; }
    const here = this.game.settlementHere()?.id ?? this.game.settle.cores[0]?.id;
    if (here === undefined) { this.onToast('還沒有據點：做一個「據點爐心」（石頭 15、木材 5、火把 3）放在地上'); return; }
    this.openSettle(here);
  }
  private evaluation(): Evaluation | null {
    return this.settleId === null ? null : this.game.settle.evaluation(this.settleId, this.game.world);
  }
  private renderSettle(): void {
    const body = this.q('#delve-settle-body'), ev = this.evaluation(), g = this.game;
    if (!body) return;
    if (!ev) { this.closeSettle(); return; }
    const res = g.settle.residents(ev.core.id);
    const here = g.settlementHere();
    const sig = [ev.level, JSON.stringify(ev.metrics), ev.rooms.map((r) => `${r.key}:${r.reasons.join()}`).join('|'),
      res.map((n) => `${n.kind}${n.mood}${n.home}`).join(), g.settle.spawnCore, here?.id, g.waypoints().length, g.coins()].join('#');
    if (sig === this.sig) return;
    this.sig = sig;
    body.replaceChildren();
    const m = ev.metrics, c = ev.core;
    const title = this.q('#delve-settle-title');
    if (title) title.textContent = `${biomeLabel(g.world.biomeAt(c.x))}據點 · ${LEVEL_NAMES[ev.level]}`;
    // 等級 + 進度
    const top = el('div', 'delve-st-top');
    const badge = el('span', 'delve-st-lv', `Lv${ev.level}`);
    badge.dataset.testid = 'settle-level';
    badge.dataset.level = String(ev.level);
    const need = LEVELS[ev.level];
    top.append(badge, el('span', 'delve-st-score', `據點分數 ${m.score}${need ? ` / ${need.score || '—'}` : '（已滿級）'}`),
      segBar(need ? (need.score ? m.score / need.score : m.rooms / need.rooms) : 1));
    body.appendChild(top);
    const grid = el('dl', 'delve-st-grid');
    for (const [k, v] of [['可入住房間', m.rooms], ['舒適度', m.comfort], ['家具種類', m.variety], ['裝飾', m.decor], ['照明', m.light], ['安全', m.safety]] as [string, number][]) {
      const d = el('div', 'delve-st-cell');
      d.append(el('dt', '', k), el('dd', '', String(v)));
      grid.appendChild(d);
    }
    body.appendChild(grid);
    // 下一級
    const needs = nextNeeds(m, ev.level);
    body.appendChild(el('h3', 'delve-j-h', ev.level >= MAX_LEVEL ? '已經是最高等級的村莊了' : `升到 Lv${ev.level + 1}「${LEVEL_NAMES[ev.level + 1]}」需要`));
    if (needs.length) {
      const ul = el('ul', 'delve-st-needs');
      ul.dataset.testid = 'settle-needs';
      for (const n of needs) {
        const li = el('li', n.ok ? 'delve-st-need is-ok' : 'delve-st-need', `${n.ok ? '✓' : '✗'} ${n.zh}：${n.have} / ${n.need}`);
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }
    // 福利
    body.appendChild(el('h3', 'delve-j-h', '據點福利'));
    const perks = el('ul', 'delve-st-perks');
    for (const p of PERK_ORDER) {
      const d = PERKS[p], got = ev.level >= d.level;
      const li = el('li', got ? 'delve-st-perk is-on' : 'delve-st-perk');
      li.dataset.perk = p;
      li.append(el('span', 'delve-st-perk-name', `${got ? '★' : `Lv${d.level}`} ${d.zh}`), el('span', 'delve-st-perk-desc', d.desc));
      perks.appendChild(li);
    }
    body.appendChild(perks);
    // 動作
    const acts = el('div', 'delve-st-acts');
    const spawn = el('button', 'delve-btn delve-btn--sm', g.settle.spawnCore === c.id ? '重生點：這裡 ✓' : '設為重生點');
    spawn.type = 'button'; spawn.dataset.act = 'spawn';
    spawn.disabled = ev.level < 1 || g.settle.spawnCore === c.id;
    const hb = el('button', 'delve-btn delve-btn--sm', this.housing ? '關閉查房模式' : '查房模式（H）');
    hb.type = 'button'; hb.dataset.act = 'housing';
    acts.append(spawn, hb);
    for (const wp of g.waypoints()) {
      if (wp.id === c.id) continue;
      const b = el('button', 'delve-btn delve-btn--sm', `傳送：${biomeLabel(g.world.biomeAt(wp.x))}據點（${wp.x}, ${wp.y}）`);
      b.type = 'button'; b.dataset.travel = String(wp.id);
      b.disabled = !here || here.level < 3;
      acts.appendChild(b);
    }
    body.appendChild(acts);
    // 居民
    body.appendChild(el('h3', 'delve-j-h', `居民 ${res.length} / ${NPC_KINDS.length}`));
    const rl = el('ul', 'delve-st-res');
    rl.dataset.testid = 'settle-residents';
    for (const n of res) {
      const d = g.settle.def(n.kind), li = el('li', 'delve-st-npc');
      li.dataset.npc = n.kind;
      li.appendChild(npcPortrait(n.kind, d.look));
      const info = el('div', 'delve-st-npc-info');
      info.append(el('span', 'delve-st-npc-name', `${d.name}・${d.title}`),
        el('span', 'delve-st-npc-mood', `心情：${moodLabel(n.mood)}（${n.mood}）`), segBar(n.mood / 100),
        el('span', 'delve-st-npc-note', n.home === null ? '沒有房間（要一間有床的合格房間）' : n.moodNotes.join('、') || '住得還可以'));
      li.appendChild(info);
      rl.appendChild(li);
    }
    for (const k of NPC_KINDS) {
      if (g.settle.npc(k)) continue;
      const li = el('li', 'delve-st-npc is-wait');
      const cm = g.settle.canMoveIn(k, c.id, g.world);
      li.append(el('span', 'delve-st-npc-name', `？？？・${NPCS[k].title}`),
        el('span', 'delve-st-npc-note', cm.ok ? '條件都達成了：白天就會搬來' : `需要：${NPCS[k].need.zh}${cm.why && cm.why !== NPCS[k].need.zh ? `（${cm.why}）` : ''}`));
      rl.appendChild(li);
    }
    body.appendChild(rl);
    // 房間
    body.appendChild(el('h3', 'delve-j-h', `房間 ${ev.valid.length} 間合格 / 共 ${ev.rooms.filter((r) => r.reasons[0] !== 'open').length} 間`));
    const rooms = el('ul', 'delve-st-rooms');
    for (const r of ev.rooms) {
      if (r.reasons[0] === 'open') continue;
      const who = res.find((n) => n.home === r.key);
      rooms.appendChild(el('li', r.ok ? 'delve-st-room is-ok' : 'delve-st-room',
        `${r.ok ? '✓' : '✗'}（${r.x0}, ${r.y0}）${r.size} 格 · 舒適 ${r.comfort}${who ? ` · ${g.settle.nameOf(who.kind)}的房間` : ''}${r.ok ? '' : `：${roomReasonsText(r)}`}`));
    }
    if (!rooms.children.length) rooms.appendChild(el('li', 'delve-st-room', '範圍內還沒有房間：用方塊圍出一個空間、貼上人造背景牆'));
    body.appendChild(rooms);
  }
  private onSettleClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t || this.settleId === null) return;
    if (t.dataset.act === 'spawn' && this.game.setSpawnCore(this.settleId)) this.onToast('重生點設在據點爐心旁');
    else if (t.dataset.act === 'housing') this.toggleHousing();
    else if (t.dataset.travel && this.game.travel(Number(t.dataset.travel))) { this.closeSettle(); this.renderer.snapCamera(); }
    this.sig = '';
    this.renderSettle();
  }

  // ── 居民面板 ──
  openNpc(kind: NpcKind, line: string): void {
    this.npcKind = kind;
    this.npcLine = line;
    this.svcMsg = '';
    const p = this.q('#delve-npc');
    if (p) p.hidden = false;
    this.closeSettle();
    this.sig = '';
    this.renderNpc();
  }
  closeNpc(): void { const p = this.q('#delve-npc'); if (p) p.hidden = true; this.npcKind = null; }
  private renderNpc(): void {
    const body = this.q('#delve-npc-body'), k = this.npcKind, g = this.game;
    if (!body || !k) return;
    const n = g.settle.npc(k);
    if (!n) { this.closeNpc(); return; }
    const d = g.settle.def(k), coins = g.coins();
    const sellable = (Object.keys(d.buys ?? {}) as ItemId[]).concat(k === 'merchant' ? (Object.keys(ITEMS) as ItemId[]).filter((i) => ITEMS[i].fish && !ITEMS[i].unique) : [])
      .filter((i) => g.inventory.count(i) > 0);
    const sig = `npc|${k}|${n.mood}|${coins}|${this.npcLine}|${this.svcMsg}|${sellable.map((i) => `${i}${g.inventory.count(i)}`).join()}|${g.inventory.slots.filter(Boolean).length}`;
    if (sig === this.sig) return;
    this.sig = sig;
    body.replaceChildren();
    const title = this.q('#delve-npc-title');
    if (title) title.textContent = `${d.name}・${d.title}`;
    const head = el('div', 'delve-npc-head');
    head.appendChild(npcPortrait(k, d.look));
    const info = el('div', 'delve-npc-info');
    const say = el('p', 'delve-npc-line', `「${this.npcLine}」`);
    say.dataset.testid = 'npc-line';
    info.append(say, el('p', 'delve-npc-intro', d.intro), el('p', 'delve-npc-mood', `心情：${moodLabel(n.mood)}（${n.mood}）· 價格 ×${(shopPrice(100, n.mood) / 100).toFixed(2)}`));
    head.appendChild(info);
    body.appendChild(head);
    body.appendChild(el('p', 'delve-hint', `錢包：${coinText(coins)}`));
    // 商店
    body.appendChild(el('h3', 'delve-j-h', '商店'));
    const shop = el('ul', 'delve-shop');
    shop.dataset.testid = 'npc-shop';
    d.shop.forEach((e, i) => {
      const price = shopPrice(e.price, n.mood);
      const b = el('button', 'delve-recipe delve-shop-row');
      b.type = 'button'; b.dataset.buy = String(i);
      if (coins >= price) b.classList.add('is-ready');
      b.disabled = coins < price;
      b.appendChild(this.icon(e.item));
      b.append(el('span', 'delve-recipe-name', `${ITEMS[e.item].name.zh}${e.n > 1 ? ` ×${e.n}` : ''}`), el('span', 'delve-recipe-need', `${coinText(price)}`));
      const li = el('li'); li.appendChild(b); shop.appendChild(li);
    });
    body.appendChild(shop);
    // 收購
    if (d.buys) {
      body.appendChild(el('h3', 'delve-j-h', '收購（背包裡有的）'));
      const ul = el('ul', 'delve-shop');
      if (!sellable.length) ul.appendChild(el('li', 'delve-hint', '背包裡沒有她收的東西（凝膠、骨頭、羽毛、獠牙、甲殼、魚…）'));
      for (const it of sellable) {
        const p = g.sellPrice(k, it), cnt = g.inventory.count(it);
        const li = el('li', 'delve-sell-row');
        li.appendChild(this.icon(it));
        li.appendChild(el('span', 'delve-recipe-name', `${ITEMS[it].name.zh} ×${cnt} · 每件 ${coinText(p)}`));
        const one = el('button', 'delve-btn delve-btn--sm', '賣 1'); one.type = 'button'; one.dataset.sell = it; one.dataset.n = '1';
        const all = el('button', 'delve-btn delve-btn--sm', '全賣'); all.type = 'button'; all.dataset.sell = it; all.dataset.n = String(cnt);
        li.append(one, all);
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }
    // 服務
    if (d.service) {
      body.appendChild(el('h3', 'delve-j-h', '服務'));
      const sv = d.service;
      if (sv.kind === 'heal' || sv.kind === 'guide') {
        const acts: [string, string, number][] = sv.kind === 'heal'
          ? [['heal', '治療（回滿生命）', shopPrice(sv.price ?? 20, n.mood)], ['bless', '祝福：回血 +2／秒（4 分鐘）', shopPrice((sv.price ?? 20) * 3, n.mood)], ['ward', '守護：受到的傷害 −20%（4 分鐘）', shopPrice((sv.price ?? 20) * 5, n.mood)]]
          : [['hint', '請教下一步該做什麼（免費）', 0], ['scout', '標出附近一處沒去過的地點 / 沒領過的地標', shopPrice(sv.price ?? 40, n.mood)]];
        const box = el('div', 'delve-folk-svc');
        box.dataset.testid = 'npc-services';
        for (const [k, zh, p] of acts) {
          const b = el('button', 'delve-btn', `${zh}${p ? `（${coinText(p)}）` : ''}`);
          b.type = 'button'; b.dataset.rsvc = k; b.disabled = p > 0 && coins < p;
          box.appendChild(b);
        }
        body.appendChild(box);
        if (this.svcMsg) { const m = el('p', 'delve-folk-msg', this.svcMsg); m.dataset.testid = 'npc-msg'; body.appendChild(m); }
      } else if (sv.kind === 'forge') {
        const b = el('button', 'delve-btn', '打開背包選裝備鍛造');
        b.type = 'button'; b.dataset.openinv = '1';
        body.append(el('p', 'delve-hint', `${sv.zh} · 目前鍛造費用 ×${g.smithMul().toFixed(2)}`), b);
      } else if (sv.kind === 'reveal') {
        const price = shopPrice(sv.price ?? 100, n.mood);
        const b = el('button', 'delve-btn', `${sv.zh}（${coinText(price)}）`);
        b.type = 'button'; b.dataset.service = '1'; b.disabled = coins < price;
        body.appendChild(b);
        if (g.lastReveal) body.appendChild(el('p', 'delve-hint', `上次打聽到：${g.lastReveal.name}（地圖上的標記 · ${g.lastReveal.x}, ${g.lastReveal.y}）`));
      } else {
        body.appendChild(el('p', 'delve-hint', sv.zh));
      }
    }
    if (n.moodNotes.length) body.appendChild(el('p', 'delve-npc-note', `心情來源：${n.moodNotes.join('、')}`));
  }
  private icon(item: ItemId): HTMLCanvasElement {
    const c = el('canvas', 'delve-slot-icon');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    if (ctx) drawIcon(this.atlas, ctx, item, 16);
    return c;
  }
  private onNpcClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    const k = this.npcKind;
    if (!t || !k) return;
    if (t.dataset.buy !== undefined) {
      const e0 = NPCS[k].shop[Number(t.dataset.buy)];
      if (this.game.buy(k, Number(t.dataset.buy)) && e0) this.onToast(`買了 ${ITEMS[e0.item].name.zh}${e0.n > 1 ? ` ×${e0.n}` : ''}`);
    } else if (t.dataset.sell) {
      const it = t.dataset.sell as ItemId;
      if (this.game.sell(k, it, Number(t.dataset.n) || 1)) this.onToast(`賣出 ${ITEMS[it].name.zh}`);
    } else if (t.dataset.rsvc) {
      this.svcMsg = this.game.residentService(k, t.dataset.rsvc as never).msg;
    } else if (t.dataset.openinv) {
      this.onInventory();
    } else if (t.dataset.service) {
      if (this.game.service(k) && this.game.lastReveal) this.onToast(`打聽到「${this.game.lastReveal.name}」的位置，已標在地圖上`);
      else this.onToast('目前沒有可以打聽的地點了');
    }
    this.sig = '';
    this.renderNpc();
  }

  // ── 每幀 ──
  tick(): void {
    this.frame++;
    this.trackPanels();
    if ((this.frame & 15) === 0) {
      if (this.settleOpen) this.renderSettle();
      if (this.npcOpen) {
        // 走太遠就收起來
        const n = this.npcKind ? this.game.settle.npc(this.npcKind) : null;
        const pc = this.game.playerCenter();
        // 收起面板的距離 = 服務的距離
        if (!n || !this.game.nearNpc(n.kind, FOLK_TALK_RANGE)) { if (n) this.onToast(`離${this.game.settle.nameOf(n.kind)}太遠了，對話結束`); this.closeNpc(); }
        else this.renderNpc();
      }
    }
    this.updateLabels();
  }
  /** 開著的面板在哪一邊（root.dataset.panelSide：提示框避開它）；據點 / 居民面板開著 → data-spanel（收起觸控鍵） */
  private trackPanels(): void {
    let side = '';
    for (const p of this.root.querySelectorAll<HTMLElement>('.delve-panel')) {
      if (p.hidden) continue;
      const r = p.getBoundingClientRect();
      if (r.width <= 0) continue;
      side = r.left + r.width / 2 < window.innerWidth / 2 ? (side === 'right' ? 'both' : 'left') : (side === 'left' ? 'both' : 'right');
    }
    const ds = this.root.dataset;
    if (side && side !== 'both') { if (ds.panelSide !== side) ds.panelSide = side; } else if (side === 'both') ds.panelSide = 'right'; else delete ds.panelSide;
    const sp = this.settleOpen || this.npcOpen;
    if (sp) ds.spanel = '1'; else delete ds.spanel;
  }
  /** 查房標籤 + 對話泡泡（DOM，跟著鏡頭走） */
  private updateLabels(): void {
    const box = this.labels;
    if (!box) return;
    const seen = new Set<string>();
    const place = (key: string, cls: string, text: string, wx: number, wy: number, maxW = 0): void => {
      seen.add(key);
      let t = this.tags.get(key);
      if (!t) { t = el('span', cls); this.tags.set(key, t); box.appendChild(t); }
      if (t.className !== cls) t.className = cls;
      if (t.textContent !== text) t.textContent = text;
      const p = this.renderer.worldToScreen(wx, wy);
      t.style.setProperty('--x', `${Math.round(p.x)}px`);
      t.style.setProperty('--y', `${Math.round(p.y)}px`);
      if (maxW) t.style.setProperty('--w', `${Math.max(96, Math.round(maxW))}px`);
    };
    if (this.housing) {
      const vr = this.renderer.viewRect();
      if (vr) {
        const vb = { x: vr.x * S, y: vr.y * S, w: vr.w * S, h: vr.h * S };
        const rooms = this.renderer.settleLayer.roomsInView(vb).filter((r) => r.reasons[0] !== 'open' && r.x1 >= vr.x && r.x0 <= vr.x + vr.w && r.y1 >= vr.y && r.y0 <= vr.y + vr.h).slice(0, 16);
        for (const r of rooms) {
          const who = this.game.settle.npcs.find((n) => n.home === r.key);
          const text = r.ok ? `✓ ${who ? `${this.game.settle.nameOf(who.kind)}的房間` : '可入住（空房）'} 舒適 ${r.comfort}` : `✗ ${roomReasonsText(r)}`;
          const zoom = this.renderer.worldToScreen(S, 0).x - this.renderer.worldToScreen(0, 0).x;
          place(`room:${r.key}`, r.ok ? 'delve-room-tag is-ok' : 'delve-room-tag is-bad', text, ((r.x0 + r.x1 + 1) / 2) * S, r.y0 * S, (r.width + 1) * zoom);
        }
      }
    }
    for (const n of this.game.settle.npcs) {
      if (!n.say) continue;
      place(`say:${n.id}`, 'delve-say', n.say, n.body.x + n.body.w / 2, n.body.y - 18);
    }
    for (const [k, t] of this.tags) if (!seen.has(k)) { t.remove(); this.tags.delete(k); }
  }
  /** Esc：關掉最上層的據點面板；有關到 → true */
  closeTop(): boolean {
    if (this.npcOpen) { this.closeNpc(); return true; }
    if (this.settleOpen) { this.closeSettle(); return true; }
    return false;
  }
  destroy(): void {
    for (const f of this.offs) f();
    this.closeNpc(); this.closeSettle(); this.setHousing(false);
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
  }
}
