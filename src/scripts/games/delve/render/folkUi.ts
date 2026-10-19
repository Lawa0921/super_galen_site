// folkUi.ts — 世界 NPC 的 DOM 介面：NPC 面板（對話 / 好感度 / 商店 / 收購 / 服務 / 委託 / 邀請 / 救援）、
// 委託清單面板（L）、NPC 頭上的對話泡泡與「！」、遇見 / 委託 / buff 的提示文字。
// 內容一律 textContent / class 組成；定位用 CSS 變數（--x / --y），沒有行內樣式。
import type { DelveGame, DelveEvent } from '../engine/game';
import type { FolkNpc } from '../engine/folk';
import { ROLES, AFF_TIERS, BUFFS, affTier } from '../engine/folkDefs';
import { questKindLabel, MAX_ACTIVE, type QuestState } from '../engine/quests';
import { ITEMS, type ItemId } from '../engine/items';
import { RARITIES, gearSlot } from '../engine/gear';
import { TILE_SIZE as S } from '../engine/constants';
import { drawIcon, type Atlas } from './textures';
import { toCanvas } from './pixel';
import { folkFrames } from './folkDraw';
import { coinText } from './settleUi';
import type { Renderer } from './renderer';
import { TOAST_HIGH, TOAST_LOW } from './toastQueue';

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
const btn = (text: string, data: Record<string, string>, cls = 'delve-btn delve-btn--sm'): HTMLButtonElement => {
  const b = el('button', cls, text);
  b.type = 'button';
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  return b;
};
/** 方向描述（「往東 32 格、往下 10 格」） */
export function dirText(dx: number, dy: number): string {
  const h = Math.abs(dx) < 3 ? '就在附近' : `往${dx > 0 ? '東' : '西'} ${Math.abs(dx)} 格`;
  const v = dy > 4 ? `、往下 ${dy} 格` : dy < -4 ? `、往上 ${-dy} 格` : '';
  return h + v;
}

export interface FolkUiOptions {
  onToast: (m: string, ms?: number, prio?: number) => void;
  onInventory: () => void;
}

export class FolkUi {
  private readonly offs: (() => void)[] = [];
  private key: string | null = null;
  private line = '';
  private board = false;
  private msg = '';
  private sig = '';
  private qsig = '';
  private frame = 0;
  private labels: HTMLElement | null;
  private tags = new Map<string, HTMLElement>();
  private portraits = new Map<string, HTMLCanvasElement>();

  constructor(private root: HTMLElement, private game: DelveGame, private renderer: Renderer, private atlas: Atlas, private o: FolkUiOptions) {
    this.labels = root.querySelector('#delve-wlabels');
    const on = (sel: string, fn: (e: Event) => void): void => {
      const b = root.querySelector(sel);
      if (!b) return;
      b.addEventListener('click', fn);
      this.offs.push(() => b.removeEventListener('click', fn));
    };
    on('#delve-folk-close', () => this.close());
    on('#delve-folk-body', (e) => this.onClick(e));
    on('#delve-quests-close', () => this.setQuests(false));
    on('#delve-quests-btn', () => this.toggleQuests());
    on('#delve-quests-body', (e) => this.onQuestClick(e));
    // 「！」：委託可以交付的委託人
    renderer.folkLayer.marks = (n) => (this.readyFor(n.key) ? 1 : null);
  }
  private q<T extends HTMLElement = HTMLElement>(sel: string): T | null { return this.root.querySelector<T>(sel); }
  private readyFor(key: string): boolean { return this.game.quests.active.some((q) => q.def.giver === key && this.game.quests.ready(q)); }

  // ── NPC 面板 ──
  get isOpen(): boolean { return !(this.q('#delve-folk')?.hidden ?? true); }
  get openKey(): string | null { return this.isOpen ? this.key : null; }
  open(key: string, line: string, board = false): void {
    this.key = key; this.line = line; this.board = board; this.msg = '';
    this.setQuests(false);
    const p = this.q('#delve-folk');
    if (p) p.hidden = false;
    this.sig = '';
    this.render();
    if (board) this.q('#delve-folk-body [data-testid=folk-quests]')?.scrollIntoView({ block: 'nearest' });
  }
  close(): void { const p = this.q('#delve-folk'); if (p) p.hidden = true; this.key = null; }
  private npc(): FolkNpc | null { return this.key ? this.game.folk.byKey(this.key) : null; }
  private portrait(n: FolkNpc): HTMLCanvasElement {
    let src = this.portraits.get(n.key);
    if (!src) { src = toCanvas(folkFrames(n.look).portrait) as HTMLCanvasElement; this.portraits.set(n.key, src); }
    const c = el('canvas', n.race === 'dwarf' ? 'delve-npc-face is-dwarf' : 'delve-npc-face');
    c.width = src.width; c.height = src.height;
    c.getContext('2d')?.drawImage(src, 0, 0);
    return c;
  }
  private icon(item: ItemId): HTMLCanvasElement {
    const c = el('canvas', 'delve-slot-icon');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    if (ctx) drawIcon(this.atlas, ctx, item, 16);
    return c;
  }
  private render(): void {
    const body = this.q('#delve-folk-body'), n = this.npc(), g = this.game;
    if (!body) return;
    if (!n) { this.close(); return; }
    const def = ROLES[n.role], aff = g.folk.affinity(n.key), tier = affTier(aff), coins = g.coins();
    const offers = def.quests ? g.questOffers(n.key) : [];
    const mine = g.quests.active.filter((q) => q.def.giver === n.key);
    const sellable = (Object.keys(def.buys ?? {}) as ItemId[]).filter((i) => g.inventory.count(i) > 0);
    const gearSig = n.role === 'runesmith' ? g.inventory.slots.map((s) => (s && gearSlot(s.item) ? `${s.item}${s.gear?.rarity ?? 0}` : '')).join() : '';
    const sig = [n.key, aff, coins, this.line, this.msg, n.following, n.safe, offers.map((q) => q.id).join(), mine.map((q) => `${q.def.id}${q.progress}`).join(),
      sellable.map((i) => `${i}${g.inventory.count(i)}`).join(), g.inventory.slots.filter(Boolean).length, gearSig, g.buff?.kind, g.settle.invited.size, g.hp >= g.maxHp()].join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    body.replaceChildren();
    const title = this.q('#delve-folk-title');
    const where = n.site >= 0 ? g.siteName(n.origin === 'hall' ? 'hall' : 'village', n.site) : '';
    if (title) title.textContent = `${n.name}・${def.title}${where ? `（${where}）` : ''}`;
    // 頭像 + 台詞 + 介紹
    const head = el('div', 'delve-npc-head');
    head.appendChild(this.portrait(n));
    const info = el('div', 'delve-npc-info');
    const say = el('p', 'delve-npc-line', `「${this.line}」`);
    say.dataset.testid = 'folk-line';
    info.append(say, el('p', 'delve-npc-intro', def.intro));
    head.appendChild(info);
    body.appendChild(head);
    // 好感度
    if (n.role !== 'stranded') {
      const a = el('div', 'delve-folk-aff');
      a.dataset.testid = 'folk-aff';
      a.dataset.tier = String(tier);
      const next = AFF_TIERS[tier + 1];
      a.append(el('span', 'delve-folk-aff-tier', `好感：${AFF_TIERS[tier].zh}（${aff}）`), segBar(aff / 100),
        el('span', 'delve-folk-aff-note', `價格 ×${AFF_TIERS[tier].mul.toFixed(2)}${next ? ` · 再 ${next.min - aff} 點 →「${next.zh}」` : ' · 已經是摯友'}`));
      body.appendChild(a);
      body.appendChild(el('p', 'delve-hint', '交易（每天有上限）、每天打招呼、完成委託都會增加好感：價格更便宜、解鎖更好的商品與服務。'));
    }
    if (this.msg) { const m = el('p', 'delve-folk-msg', this.msg); m.dataset.testid = 'folk-msg'; body.appendChild(m); }
    body.appendChild(el('p', 'delve-hint', `錢包：${coinText(coins)}`));
    // 救援 / 護送
    if (n.role === 'stranded') this.renderStranded(body, n);
    // 委託
    if (def.quests) this.renderQuests(body, n, offers, mine);
    // 商店
    const shop = g.folk.shop(n);
    if (shop.length) {
      body.appendChild(el('h3', 'delve-j-h', n.role === 'peddler' ? `行商的貨（這次遇見限定）` : '商店'));
      const ul = el('ul', 'delve-shop');
      ul.dataset.testid = 'folk-shop';
      shop.forEach((e, i) => {
        const need = e.tier ?? 0, locked = need > tier, price = g.folkPrice(n.key, e.price);
        const b = el('button', 'delve-recipe delve-shop-row');
        b.type = 'button'; b.dataset.buy = String(i);
        if (!locked && coins >= price) b.classList.add('is-ready');
        if (locked) b.classList.add('is-locked');
        b.disabled = locked || coins < price;
        b.appendChild(this.icon(e.item));
        b.append(el('span', 'delve-recipe-name', `${ITEMS[e.item].name.zh}${e.n > 1 ? ` ×${e.n}` : ''}`),
          el('span', 'delve-recipe-need', locked ? `好感「${AFF_TIERS[need].zh}」解鎖` : coinText(price)));
        const li = el('li'); li.appendChild(b); ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    // 收購
    if (def.buys) {
      body.appendChild(el('h3', 'delve-j-h', '收購（背包裡有的）'));
      const ul = el('ul', 'delve-shop');
      if (!sellable.length) ul.appendChild(el('li', 'delve-hint', `背包裡沒有${n.race === 'dwarf' ? '他' : '對方'}收的東西（${(Object.keys(def.buys) as ItemId[]).slice(0, 5).map((i) => ITEMS[i].name.zh).join('、')}…）`));
      for (const it of sellable) {
        const p = g.folkSellPrice(n.key, it), cnt = g.inventory.count(it);
        const li = el('li', 'delve-sell-row');
        li.append(this.icon(it), el('span', 'delve-recipe-name', `${ITEMS[it].name.zh} ×${cnt} · 每件 ${coinText(p)}`),
          btn('賣 1', { sell: it, n: '1' }), btn('全賣', { sell: it, n: String(cnt) }));
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }
    // 服務
    const svc = def.services.filter((s) => s.kind !== 'rescue' && s.kind !== 'invite' && s.kind !== 'deepforge');
    if (svc.length) {
      body.appendChild(el('h3', 'delve-j-h', '服務'));
      const box = el('div', 'delve-folk-svc');
      box.dataset.testid = 'folk-services';
      for (const s of svc) {
        const need = s.tier ?? 0, locked = need > tier, price = s.price ? g.folkPrice(n.key, s.price) : 0;
        const b = btn(`${s.zh}${price ? `（${coinText(price)}）` : ''}${locked ? ` · 好感「${AFF_TIERS[need].zh}」解鎖` : ''}`, { svc: s.kind }, 'delve-btn');
        b.disabled = locked || (price > 0 && coins < price);
        box.appendChild(b);
      }
      body.appendChild(box);
      if (g.buff) body.appendChild(el('p', 'delve-hint', `目前的效果：${BUFFS[g.buff.kind].zh}（剩 ${Math.max(0, Math.ceil((g.buff.until - g.time) / 60))} 分鐘）`));
    }
    if (n.role === 'runesmith') this.renderDeepforge(body, n, tier);
    if (n.role === 'herbalist') {
      const invited = g.settle.invited.has('healer') || Boolean(g.settle.npc('healer'));
      const b = btn(invited ? '已經邀請過她了' : '邀請她到你的據點入住（成為據點的藥師）', { svc: 'invite' }, 'delve-btn');
      b.disabled = invited;
      body.append(el('h3', 'delve-j-h', '招募'), b, el('p', 'delve-hint', '據點的藥師：治療 / 祝福 / 守護，而且據點範圍內回血加倍。'));
    }
  }
  private renderStranded(body: HTMLElement, n: FolkNpc): void {
    const g = this.game, qid = `${n.key}#escort`, q = g.quests.get(qid);
    body.appendChild(el('h3', 'delve-j-h', '救援'));
    if (!n.following && !n.safe) {
      body.appendChild(btn('救援：帶他離開這裡（他會跟著你走）', { svc: 'rescue' }, 'delve-btn'));
      body.appendChild(el('p', 'delve-hint', '帶到地表、村落或據點就安全了。走太遠他會自己跟上。'));
      return;
    }
    if (n.following) { body.appendChild(el('p', 'delve-hint', '他正跟著你。往地表、村落或據點走吧。')); return; }
    if (q) body.appendChild(btn(`收下謝禮（經驗 ${q.def.reward.xp}、${coinText(q.def.reward.coins)}${q.def.reward.item ? `、${ITEMS[q.def.reward.item.item].name.zh} ×${q.def.reward.item.n}` : ''}）`, { turnin: qid }, 'delve-btn'));
    const done = g.settle.invited.has('guide') || Boolean(g.settle.npc('guide'));
    if (!done) {
      body.append(btn('邀請他到你的據點入住（成為據點的嚮導）', { svc: 'invite' }, 'delve-btn'),
        el('p', 'delve-hint', '據點的嚮導：告訴你下一步、把沒領過的地標標在地圖上。'));
    } else if (!q) body.appendChild(el('p', 'delve-hint', '他向你揮揮手，自己往家的方向走了。'));
  }
  private renderQuests(body: HTMLElement, n: FolkNpc, offers: ReturnType<DelveGame['questOffers']>, mine: QuestState[]): void {
    const g = this.game;
    const h = el('h3', 'delve-j-h', `委託（進行中 ${g.quests.active.length} / ${MAX_ACTIVE}）`);
    h.dataset.testid = 'folk-quests';
    body.appendChild(h);
    const ul = el('ul', 'delve-quest-list');
    for (const q of mine) {
      const ready = g.quests.ready(q);
      const li = el('li', ready ? 'delve-quest is-ready' : 'delve-quest');
      li.append(el('span', 'delve-quest-title', `【${questKindLabel(q.def.kind)}】${q.def.title}`), el('span', 'delve-quest-prog', `進度 ${q.progress} / ${q.def.n}`));
      const b = btn(ready ? '交付' : '還沒完成', { turnin: q.def.id });
      b.disabled = !ready;
      li.appendChild(b);
      ul.appendChild(li);
    }
    for (const q of offers) {
      const li = el('li', 'delve-quest is-offer');
      li.dataset.offer = q.id;
      const r = q.reward;
      li.append(el('span', 'delve-quest-title', `【${questKindLabel(q.kind)}】${q.title}`), el('span', 'delve-quest-desc', q.desc),
        el('span', 'delve-quest-reward', `報酬：經驗 ${r.xp}、${coinText(r.coins)}${r.item ? `、${ITEMS[r.item.item].name.zh} ×${r.item.n}` : ''}、好感 +15`));
      const b = btn('接下', { accept: q.id });
      b.disabled = g.quests.active.length >= MAX_ACTIVE;
      li.appendChild(b);
      ul.appendChild(li);
    }
    if (!mine.length && !offers.length) ul.appendChild(el('li', 'delve-hint', '今天的委託都接完了。明天再來看看委託板吧。'));
    body.appendChild(ul);
  }
  private renderDeepforge(body: HTMLElement, n: FolkNpc, tier: number): void {
    const g = this.game;
    body.appendChild(el('h3', 'delve-j-h', '深岩升階（用錠代替星塵）'));
    if (tier < 1) { body.appendChild(el('p', 'delve-hint', '好感「熟識」之後她才肯幫你升階。')); return; }
    const ul = el('ul', 'delve-shop');
    ul.dataset.testid = 'deepforge';
    g.inventory.slots.forEach((st, i) => {
      if (!st || !gearSlot(st.item)) return;
      const c = g.deepforgeCost(i, n.key), r = st.gear?.rarity ?? 0;
      const li = el('li', 'delve-sell-row');
      li.append(this.icon(st.item), el('span', 'delve-recipe-name', `${ITEMS[st.item].name.zh}（${RARITIES[r].zh}）${c ? ` → ${RARITIES[r + 1].zh}：${ITEMS[c.bar].name.zh} ×${c.n} + ${coinText(c.coins)}` : ' · 已經是最高階'}`));
      const b = btn('升階', { deep: String(i) });
      b.disabled = !c || !g.inventory.has(c.bar, c.n) || g.coins() < c.coins;
      li.appendChild(b);
      ul.appendChild(li);
    });
    if (!ul.children.length) ul.appendChild(el('li', 'delve-hint', '背包裡沒有裝備。'));
    body.appendChild(ul);
  }
  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    const n = this.npc(), g = this.game;
    if (!t || !n) return;
    const d = t.dataset;
    if (d.buy !== undefined) {
      const it = g.folk.shop(n)[Number(d.buy)];
      if (g.folkBuy(n.key, Number(d.buy)) && it) this.msg = `買了 ${ITEMS[it.item].name.zh}${it.n > 1 ? ` ×${it.n}` : ''}`;
    } else if (d.sell) {
      if (g.folkSell(n.key, d.sell as ItemId, Number(d.n) || 1)) this.msg = `賣出 ${ITEMS[d.sell as ItemId].name.zh}`;
    } else if (d.svc) {
      if (d.svc === 'forge') { this.o.onInventory(); this.msg = '在背包裡選一件裝備，按「鍛造」：在她身邊不用鐵砧，好感度越高越便宜。'; }
      else { const r = g.folkService(n.key, d.svc as never); this.msg = r.msg; if (r.ok && d.svc === 'invite') this.o.onToast(r.msg, 3200, TOAST_HIGH); }
    } else if (d.accept) {
      if (g.acceptQuest(n.key, d.accept)) this.msg = '接下了委託（L 打開委託清單）';
    } else if (d.turnin) {
      this.msg = g.turnInQuest(d.turnin) ? '委託完成！收下了報酬。' : '還不能交付（道具不夠、或不在委託人身邊）';
    } else if (d.deep !== undefined) {
      const r = g.deepforge(Number(d.deep), n.key);
      this.msg = r.ok ? '熔爐裡的符文亮了起來——裝備升了一階！' : r.reason === 'cost' ? '錠或銅幣不夠' : '現在沒辦法升階';
    }
    this.sig = '';
    this.render();
  }

  // ── 委託清單 ──
  get questsOpen(): boolean { return !(this.q('#delve-quests')?.hidden ?? true); }
  setQuests(open: boolean): void {
    const p = this.q('#delve-quests');
    if (p) p.hidden = !open;
    this.q('#delve-quests-btn')?.setAttribute('aria-pressed', open ? 'true' : 'false');
    if (open) { this.close(); this.game.refreshQuests(); this.qsig = ''; this.renderQuestLog(); }
  }
  toggleQuests(): void { this.setQuests(!this.questsOpen); }
  private renderQuestLog(): void {
    const body = this.q('#delve-quests-body'), g = this.game;
    if (!body) return;
    const pt = g.playerTile();
    const sig = g.quests.active.map((q) => `${q.def.id}${q.progress}`).join() + `|${g.quests.completed.size}|${Math.floor(pt.x / 8)},${Math.floor(pt.y / 8)}`;
    if (sig === this.qsig) return;
    this.qsig = sig;
    body.replaceChildren();
    body.appendChild(el('p', 'delve-hint', `進行中 ${g.quests.active.length} / ${MAX_ACTIVE} · 已完成 ${g.quests.completed.size} 件。委託從村長、地廳長老（委託板）接；救出受困的探險者會自動接下護送。`));
    const ul = el('ul', 'delve-quest-list');
    ul.dataset.testid = 'quest-log';
    for (const q of g.quests.active) {
      const d = q.def, ready = g.quests.ready(q);
      const li = el('li', ready ? 'delve-quest is-ready' : 'delve-quest');
      li.dataset.quest = d.id;
      const giver = g.folk.byKey(d.giver);
      let where = '';
      if (d.kind === 'explore' && d.at && !ready) where = `目標：${dirText(d.at.x - pt.x, d.at.y - pt.y)}（地圖上有標記）`;
      else if (d.kind === 'escort' && giver) where = giver.safe ? `${giver.name}安全了：去跟他說話收下謝禮` : '帶他到地表、村落或據點';
      else if (giver) where = `${ready ? '回去交付' : '委託人'}：${giver.name}（${dirText(Math.floor(giver.body.x / S) - pt.x, Math.floor(giver.body.y / S) - pt.y)}）`;
      li.append(el('span', 'delve-quest-title', `【${questKindLabel(d.kind)}】${d.title}${ready ? ' · 可以交付' : ''}`), el('span', 'delve-quest-desc', d.desc),
        el('span', 'delve-quest-prog', `進度 ${q.progress} / ${d.n}`), segBar(q.progress / d.n), el('span', 'delve-quest-where', where));
      if (d.kind !== 'escort') li.appendChild(btn('放棄', { abandon: d.id }));
      ul.appendChild(li);
    }
    if (!g.quests.active.length) ul.appendChild(el('li', 'delve-hint', '目前沒有進行中的委託。去村子的委託板看看吧。'));
    body.appendChild(ul);
  }
  private onQuestClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (t?.dataset.abandon && this.game.quests.abandon(t.dataset.abandon)) { this.o.onToast('放棄了委託（委託板上還找得到）'); this.qsig = ''; this.renderQuestLog(); }
  }

  // ── 事件 → 提示 ──
  onEvent(e: DelveEvent): void {
    const toast = this.o.onToast;
    if (e.type === 'folk') {
      const d = ROLES[e.role], dir = dirText(e.dx, e.dy);
      if (e.phase === 'appear') {
        if (e.role === 'stranded') toast(`遠處傳來呼救聲……（${dir}）`, 3600, TOAST_HIGH);
        else toast(`路邊有一位${d.title}「${e.name}」在休息（${dir}）`, 3200);
      } else if (e.phase === 'leave') toast(`${d.title}「${e.name}」收拾好行囊，上路了`, 2400, TOAST_LOW);
      else if (e.phase === 'safe') toast(`${e.name}安全了！去跟他說話，收下謝禮`, 3200, TOAST_HIGH);
      else if (e.phase === 'giveup') toast('沒等到救援的探險者，自己摸索著離開了', 2600, TOAST_LOW);
    } else if (e.type === 'quest') {
      if (e.phase === 'progress') toast(`${e.title}：${e.progress} / ${e.n}`, 1400, TOAST_LOW);
      else if (e.phase === 'ready') toast(`委託達成：${e.title}（回去找委託人交付）`, 2800, TOAST_HIGH);
      else if (e.phase === 'done') toast(`委託完成：${e.title}`, 2600, TOAST_HIGH);
      else if (e.phase === 'accept') toast(`接下委託：${e.title}`, 2000);
      this.qsig = '';
    } else if (e.type === 'buff') {
      toast(e.on ? `得到「${BUFFS[e.kind].zh}」：${BUFFS[e.kind].desc}` : `「${BUFFS[e.kind].zh}」的效果結束了`, 2200, e.on ? TOAST_HIGH : TOAST_LOW);
    }
  }

  // ── 每幀 ──
  tick(): void {
    this.frame++;
    if ((this.frame & 15) === 0) {
      if (this.isOpen) {
        const n = this.npc(), pc = this.game.playerCenter();
        if (!n || Math.hypot(n.body.x - pc.x, n.body.y - pc.y) > 14 * S) this.close();
        else this.render();
      }
      if (this.questsOpen) this.renderQuestLog();
    }
    const ds = this.root.dataset;
    if (this.isOpen || this.questsOpen) ds.fpanel = '1'; else delete ds.fpanel;
    this.updateLabels();
  }
  /** 對話泡泡（DOM，跟著鏡頭走） */
  private updateLabels(): void {
    const box = this.labels;
    if (!box) return;
    const seen = new Set<string>();
    for (const n of this.game.folk.npcs) {
      if (!n.say) continue;
      const key = `fsay:${n.id}`;
      seen.add(key);
      let t = this.tags.get(key);
      if (!t) { t = el('span', 'delve-say'); this.tags.set(key, t); box.appendChild(t); }
      const cls = n.role === 'stranded' && !n.following && !n.safe ? 'delve-say is-help' : 'delve-say';
      if (t.className !== cls) t.className = cls;
      if (t.textContent !== n.say) t.textContent = n.say;
      const p = this.renderer.worldToScreen(n.body.x + n.body.w / 2, n.body.y - 18);
      t.style.setProperty('--x', `${Math.round(p.x)}px`);
      t.style.setProperty('--y', `${Math.round(p.y)}px`);
    }
    for (const [k, t] of this.tags) if (!seen.has(k)) { t.remove(); this.tags.delete(k); }
  }
  /** Esc：關掉最上層；有關到 → true */
  closeTop(): boolean {
    if (this.isOpen) { this.close(); return true; }
    if (this.questsOpen) { this.setQuests(false); return true; }
    return false;
  }
  destroy(): void {
    for (const f of this.offs) f();
    this.close(); this.setQuests(false);
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
    delete this.root.dataset.fpanel;
  }
}
