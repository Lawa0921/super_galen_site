// levelsUi.ts — 等級系統的 DOM 介面：HUD 經驗條 + 等級徽章、升級橫幅（光芒 + 和弦 + 提示）、
// 角色 / 技能面板（像素技能樹、節點說明框、前置、鍵盤操作、手機分頁）、重置技能樹、主動技能按鍵（Q / F / R + 觸控鍵）。
// 標記與樣式在 src/components/delve/DelveLevels.astro；遊戲邏輯在 engine/levels.ts、engine/skills.ts。
import type { DelveGame, DelveEvent } from '../engine/game';
import { ACTIVE_NODE, BRANCHES, SKILLS, SKILL_CD, skillDef, nodeState, rankOf, type ActiveSkill, type Branch, type SkillId } from '../engine/skills';
import { levelDef, levelHp, titleFor, MAX_LEVEL } from '../engine/levels';
import { ITEMS } from '../engine/items';
import type { SoundManager } from '../audio/SoundManager';
import type { Hud } from './hud';
import { TOAST_HIGH, TOAST_LOW } from './toastQueue';
import { toCanvas, Bmp, hex } from './pixel';
import { activeKeyBmp, badgeBmp, nodeBmp, raysBmp, xpBarBmp, NODE_PX } from './levelArt';
import {
  ACTIVE_KEYS, ACTIVE_ZH, branchSpent, cdLabel, failText, levelUpLines, moveFocus, nextMilestone, respecLabel, skillStatLines, skillTip, xpLabel,
} from './levelModel';

const ACTIVES: readonly ActiveSkill[] = ['dash', 'slam', 'pulse'];
const KEY_ACTIVE: Record<string, ActiveSkill> = { KeyQ: 'dash', KeyF: 'slam', KeyR: 'pulse' };
const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
/** 樹狀圖格距（美術 px）：欄 34、列 32；節點 22 */
const COL_W = 34, ROW_H = 32, GRID_W = 90, GRID_H = 150;
const LINE = { on: hex('#ffd86a'), onLo: hex('#a83a10'), open: hex('#966139'), off: hex('#423f54'), ink: hex('#0c0a12') };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
/** Bmp 畫進既有 canvas（大小不同就改 canvas 的 width / height 屬性） */
function paint(c: HTMLCanvasElement | null, b: Bmp): void {
  if (!c) return;
  if (c.width !== b.w) c.width = b.w;
  if (c.height !== b.h) c.height = b.h;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, c.width, c.height);
  toCanvas(b, { ctx, x: 0, y: 0 });
}

interface NodeEl { id: SkillId; btn: HTMLButtonElement; canvas: HTMLCanvasElement; tip: HTMLElement; sig: string; }

export interface LevelsUiOptions {
  root: HTMLElement;
  game: DelveGame;
  sound: SoundManager;
  hud: Hud;
  /** 遊戲被選單 / 地圖暫停中（不含這個面板）：不能放主動技能、不能開面板 */
  isBlocked: () => boolean;
  /** 面板開 / 關（main 依此暫停模擬） */
  onToggle?: (open: boolean) => void;
}

export class LevelsUi {
  private readonly root: HTMLElement;
  private readonly game: DelveGame;
  private readonly sound: SoundManager;
  private readonly hud: Hud;
  private readonly panel: HTMLElement | null;
  private nodes: NodeEl[] = [];
  private lineCanvas = new Map<Branch, HTMLCanvasElement>();
  private focusId: SkillId = 'b_vigor';
  /** 滑鼠 / 觸控點過一次的節點：再點一次同一個 = 點一級 */
  private armed: SkillId | null = null;
  private hudSig = '';
  private panelSig = '';
  private actSig = '';
  private flashT = 0;
  private bannerT = 0;
  private bannerPhase = 0;
  private pendingUp: { from: number; to: number } | null = null;
  private respecArm = 0;
  private lastFocus: HTMLElement | null = null;
  private frame = 0;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly o: LevelsUiOptions) {
    this.root = o.root; this.game = o.game; this.sound = o.sound; this.hud = o.hud;
    const q = <T extends HTMLElement>(s: string): T | null => this.root.querySelector<T>(s);
    this.panel = q('#delve-skills');
    // 經驗條（同時是「角色 / 技能」按鈕）放進生命區（愛心下方）
    const xp = q('#delve-skill-btn'), vitals = q('#delve-vitals');
    if (xp && vitals && xp.parentElement !== vitals) vitals.appendChild(xp);
    this.on(xp, 'click', () => this.toggle());
    this.on(q('#delve-skills-close'), 'click', () => this.setOpen(false));
    this.on(q('#delve-sk-learn'), 'click', () => this.learn(this.focusId));
    this.on(q('#delve-sk-respec'), 'click', () => this.respec());
    for (const t of this.root.querySelectorAll<HTMLButtonElement>('.delve-sk-tab')) this.on(t, 'click', () => this.setTab(t.dataset.tab as Branch, true));
    for (const a of ACTIVES) {
      const b = q<HTMLButtonElement>(`#delve-act-${a}`);
      this.on(b, 'pointerdown', (e) => { e.preventDefault(); if (!this.o.isBlocked() && !this.isOpen) this.game.useSkill(a); });
    }
    this.on(window, 'keydown', (e) => this.onKey(e as KeyboardEvent));
    this.on(this.panel, 'keydown', (e) => this.onPanelKey(e as KeyboardEvent));
    this.on(window, 'resize', () => this.layout());
    this.buildTree();
    this.drawHud(true);
  }

  private on(t: EventTarget | null, type: string, fn: (e: Event) => void): void {
    if (!t) return;
    t.addEventListener(type, fn);
    this.offs.push(() => t.removeEventListener(type, fn));
  }

  get isOpen(): boolean { return Boolean(this.panel && !this.panel.hidden); }
  toggle(): void { this.setOpen(!this.isOpen); }
  setOpen(open: boolean): void {
    if (!this.panel || open === this.isOpen) return;
    if (open && this.o.isBlocked()) return;
    this.panel.hidden = !open;
    if (open) {
      this.root.dataset.skills = '1';
      this.lastFocus = document.activeElement as HTMLElement | null;
      this.panelSig = '';
      this.layout();
      this.renderPanel();
      // 焦點：上次選的；沒有就第一個能點的
      const firstOpen = SKILLS.find((s) => nodeState(this.game.levels.ranks, s.id, this.game.levels.level) === 'open');
      this.focusNode(this.nodes.some((n) => n.id === this.focusId) ? this.focusId : firstOpen?.id ?? 'b_vigor');
    } else {
      delete this.root.dataset.skills;
      this.respecArm = 0;
      this.lastFocus?.focus?.();
    }
    this.o.onToggle?.(open);
  }

  // ── 鍵盤 ──
  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyK') {
      if (!e.repeat) this.toggle();
      e.preventDefault();
      return;
    }
    const a = KEY_ACTIVE[e.code];
    if (a && !e.repeat && !this.isOpen && !this.o.isBlocked()) { this.game.useSkill(a); e.preventDefault(); }
  }
  private onPanelKey(e: KeyboardEvent): void {
    const dir: 'left' | 'right' | 'up' | 'down' | undefined = ARROWS[e.key];
    const onNode = (e.target as HTMLElement | null)?.classList?.contains('delve-sk-node');
    if (dir) {
      const vis = this.visibleNodes();
      let next = moveFocus(vis, this.focusId, dir);
      // 分頁模式：左右走到分支邊緣 → 換分頁
      if (next === this.focusId && this.compact && (dir === 'left' || dir === 'right')) {
        const order = BRANCHES.map((b) => b.id), k = order.indexOf(this.tab) + (dir === 'right' ? 1 : -1);
        if (k >= 0 && k < order.length) {
          this.setTab(order[k], false);
          const row = skillDef(this.focusId).row;
          const cand = SKILLS.filter((s) => s.branch === order[k]).sort((p, q2) => Math.abs(p.row - row) - Math.abs(q2.row - row) || (dir === 'right' ? p.col - q2.col : q2.col - p.col));
          next = cand[0]?.id ?? next;
        }
      }
      this.focusNode(next);
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && onNode) {
      this.learn(this.focusId);
      e.preventDefault(); e.stopPropagation();
      return;
    }
    // 其他遊戲按鍵（移動 / 跳）在面板裡不要傳到遊戲；Esc / K 照常
    if (e.key !== 'Escape' && e.code !== 'KeyK' && e.key !== 'Tab') e.stopPropagation();
  }

  // ── 分頁 / 版面 ──
  private get tab(): Branch { return (this.panel?.dataset.tab as Branch) ?? 'blade'; }
  private get compact(): boolean { return this.panel?.dataset.compact === '1'; }
  private setTab(b: Branch, focus: boolean): void {
    if (!this.panel) return;
    this.panel.dataset.tab = b;
    for (const t of this.root.querySelectorAll<HTMLButtonElement>('.delve-sk-tab')) t.setAttribute('aria-selected', t.dataset.tab === b ? 'true' : 'false');
    if (focus && this.compact) {
      const cur = skillDef(this.focusId);
      if (cur.branch !== b) this.focusNode(SKILLS.find((s) => s.branch === b && s.req.length === 0)?.id ?? this.focusId);
    }
  }
  /** 三條分支並排放不下（依實際的像素大小）→ 分頁模式 */
  private layout(): void {
    if (!this.panel) return;
    const px = Number(this.root.dataset.px ?? 2) || 2;
    const need = (GRID_W * 3) * px + 16 * 2 + 40 + 12;
    // 觸控（手機 / 平板直式）一律分頁 + 大節點；滑鼠操作時只有放不下才分頁
    const compact = window.innerWidth < need || (this.root.dataset.touch === '1' && window.innerWidth < 900);
    if (compact) this.panel.dataset.compact = '1'; else delete this.panel.dataset.compact;
  }
  private visibleNodes(): { id: SkillId; gx: number; row: number }[] {
    return SKILLS.filter((s) => !this.compact || s.branch === this.tab)
      .map((s) => ({ id: s.id, gx: BRANCHES.findIndex((b) => b.id === s.branch) * 3 + s.col, row: s.row }));
  }

  // ── 技能樹 ──
  private buildTree(): void {
    const tree = this.root.querySelector('#delve-sk-tree');
    if (!tree) return;
    tree.replaceChildren();
    this.nodes = [];
    for (const b of BRANCHES) {
      const col = el('div', 'delve-sk-branch');
      col.dataset.branch = b.id;
      const h = el('p', 'delve-sk-bh', b.zh);
      const sub = el('span', 'delve-sk-bh-sub');
      sub.dataset.spent = b.id;
      h.append(' ', sub);
      col.appendChild(h);
      col.appendChild(el('p', 'delve-sk-line delve-sk-line--dim', b.desc));
      const grid = el('div', 'delve-sk-grid');
      const lines = el('canvas', 'delve-sk-lines');
      lines.width = GRID_W; lines.height = GRID_H;
      lines.setAttribute('aria-hidden', 'true');
      grid.appendChild(lines);
      this.lineCanvas.set(b.id, lines);
      for (const s of SKILLS.filter((x) => x.branch === b.id)) {
        const btn = el('button', 'delve-sk-node');
        btn.type = 'button';
        btn.dataset.skill = s.id; btn.dataset.col = String(s.col); btn.dataset.row = String(s.row); btn.dataset.kind = s.kind;
        const canvas = el('canvas');
        canvas.width = NODE_PX; canvas.height = NODE_PX;
        canvas.setAttribute('aria-hidden', 'true');
        const tip = el('div', 'delve-sk-tip');
        tip.setAttribute('role', 'tooltip');
        tip.id = `delve-sk-tip-${s.id}`;
        btn.setAttribute('aria-describedby', tip.id);
        btn.append(canvas, tip);
        btn.addEventListener('click', () => {
          // 第一下選取、再點一下（同一個）= 點一級
          if (this.armed === s.id) { this.learn(s.id); return; }
          this.focusNode(s.id);
          this.armed = s.id;
        });
        btn.addEventListener('focus', () => { if (this.focusId !== s.id) { this.focusId = s.id; this.renderDetail(); } });
        btn.addEventListener('mouseenter', () => this.renderDetail(s.id));
        btn.addEventListener('mouseleave', () => this.renderDetail());
        grid.appendChild(btn);
        this.nodes.push({ id: s.id, btn, canvas, tip, sig: '' });
      }
      col.appendChild(grid);
      tree.appendChild(col);
    }
  }
  private focusNode(id: SkillId): void {
    if (id !== this.armed) this.armed = null;
    this.focusId = id;
    const d = skillDef(id);
    if (this.compact && d.branch !== this.tab) this.setTab(d.branch, false);
    this.nodes.find((n) => n.id === id)?.btn.focus();
    this.renderDetail();
  }

  private learn(id: SkillId): void {
    const f = this.game.learnSkill(id);
    const msg = this.root.querySelector('#delve-sk-msg');
    if (f) {
      this.sound.denied();
      if (msg) msg.textContent = `${skillDef(id).zh}：${failText(f)}`;
    } else if (msg) msg.textContent = '';
    this.renderPanel();
  }
  private respec(): void {
    const g = this.game, msg = this.root.querySelector('#delve-sk-msg');
    if (g.levels.spent <= 0) { if (msg) msg.textContent = '還沒有點任何技能'; return; }
    if (!this.respecArm) {
      this.respecArm = 3;
      if (msg) msg.textContent = `再按一次確認重置（花 ${respecLabel(g.respecCost()).replace('重置技能樹', '').replace(/[（）]/g, '') || '免費'}，退回 ${g.levels.spent} 點）`;
      this.renderPanel(true);
      return;
    }
    this.respecArm = 0;
    const r = g.respecSkills();
    if (msg) msg.textContent = r.ok ? `技能樹已重置：退回 ${r.refunded} 點` : r.reason === 'cost' ? '材料不足（碎晶 / 星塵；分解裝備可以拿到）' : '還沒有點任何技能';
    if (!r.ok) this.sound.denied();
    this.renderPanel(true);
  }

  // ── 事件（main 的事件迴圈呼叫） ──
  onEvent(e: DelveEvent): void {
    switch (e.type) {
      case 'xp': this.sound.xpGain(e.amount >= 50); break;
      case 'levelup': {
        const from = this.pendingUp ? this.pendingUp.from : e.level - 1;
        this.pendingUp = { from: Math.min(from, e.level - 1), to: e.level };
        break;
      }
      case 'xploss': this.hud.toast(`倒下了：失去 ${e.amount} 經驗（不會掉級）`, 2200); break;
      case 'learn': this.sound.learn(); break;
      case 'respec': this.sound.respec(); break;
      case 'refund': this.hud.toast(`惜料：退回了 1 個${ITEMS[e.item].name.zh}`, 1400, TOAST_LOW); break;
      case 'skill':
        if (e.phase === 'cd') { this.sound.denied(); this.hud.toast(cdLabel(e.skill, e.n), 900, TOAST_LOW); }
        else if (e.phase === 'start') {
          if (e.skill === 'dash') this.sound.dash();
          else if (e.skill === 'pulse') { this.sound.pulse(); this.hud.toast(e.n ? `尋礦感知：附近有 ${e.n} 格礦脈` : '尋礦感知：附近沒有礦脈', 1800, TOAST_LOW); }
        } else if (e.phase === 'land') this.sound.slam(e.n > 0);
        break;
      default: break;
    }
  }

  // ── 每幀 ──
  tick(dt: number): void {
    this.frame++;
    if (this.pendingUp) {
      const { from, to } = this.pendingUp;
      this.pendingUp = null;
      this.showLevelUp(from, to);
    }
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (this.respecArm > 0) { this.respecArm = Math.max(0, this.respecArm - dt); if (!this.respecArm) this.renderPanel(true); }
    this.drawHud(false);
    this.tickBanner(dt);
    if ((this.frame & 3) === 0) this.drawActives();
    if (this.isOpen && (this.frame % 15) === 0) this.renderPanel();
  }

  private showLevelUp(from: number, to: number): void {
    const u = levelUpLines(from, to);
    this.flashT = 1.2;
    this.bannerT = 2.6;
    const box = this.root.querySelector<HTMLElement>('#delve-lvup');
    const t = this.root.querySelector('#delve-lvup-title'), s = this.root.querySelector('#delve-lvup-sub');
    if (t) t.textContent = u.title;
    if (s) s.textContent = u.lines.join('\n');
    if (box) { box.hidden = false; box.dataset.level = String(to); }
    this.sound.levelUp(u.milestone);
    this.hud.toast(`${u.title}　${u.lines[0]}`, 2600, TOAST_HIGH);
    if (this.isOpen) this.renderPanel(true);
  }
  private tickBanner(dt: number): void {
    if (this.bannerT <= 0) return;
    this.bannerT -= dt;
    const box = this.root.querySelector<HTMLElement>('#delve-lvup');
    if (this.bannerT <= 0) { if (box) box.hidden = true; return; }
    if ((this.frame % 3) === 0 && this.root.dataset.reduced !== '1') {
      this.bannerPhase += 0.35;
      paint(this.root.querySelector<HTMLCanvasElement>('#delve-lvup-rays'), raysBmp(120, 44, this.bannerPhase));
    }
  }

  private drawHud(force: boolean): void {
    const L = this.game.levels, p = L.progress(), flash = this.flashT > 0 && Math.floor(this.flashT * 8) % 2 === 0;
    const sig = `${L.xp}|${flash ? 1 : 0}|${L.points}`;
    if (!force && sig === this.hudSig) return;
    this.hudSig = sig;
    paint(this.root.querySelector<HTMLCanvasElement>('#delve-xp-bar'), xpBarBmp(p.frac, flash));
    paint(this.root.querySelector<HTMLCanvasElement>('#delve-xp-badge'), badgeBmp(p.level, flash));
    const txt = this.root.querySelector('#delve-xp-text');
    if (txt) txt.textContent = xpLabel(p.level, p.into, p.need);
    const xp = this.root.querySelector<HTMLElement>('#delve-skill-btn');
    if (xp) {
      xp.dataset.level = String(p.level);
      if (flash) xp.dataset.flash = '1'; else delete xp.dataset.flash;
      xp.setAttribute('aria-label', `等級 ${p.level}，${xpLabel(p.level, p.into, p.need)}${L.points ? `，${L.points} 點技能點可用` : ''}。打開角色 / 技能（K）`);
    }
    const pts = this.root.querySelector<HTMLElement>('#delve-skill-pts');
    if (pts) { pts.hidden = L.points <= 0; pts.textContent = String(L.points); }
  }

  private drawActives(): void {
    const g = this.game;
    let sig = '';
    for (const a of ACTIVES) sig += `${g.levels.has(ACTIVE_NODE[a]) ? 1 : 0}${Math.ceil(g.skillCooldown(a) * 6)}|`;
    if (sig === this.actSig) return;
    this.actSig = sig;
    for (const a of ACTIVES) {
      const b = this.root.querySelector<HTMLButtonElement>(`#delve-act-${a}`);
      if (!b) continue;
      b.hidden = !g.levels.has(ACTIVE_NODE[a]);
      if (b.hidden) continue;
      const cd = g.skillCooldown(a);
      b.dataset.cd = cd > 0 ? '1' : '0';
      paint(b.querySelector('canvas'), activeKeyBmp(a, cd / SKILL_CD[a]));
    }
  }

  // ── 面板內容 ──
  renderPanel(force = false): void {
    if (!this.panel || this.panel.hidden) return;
    const g = this.game, L = g.levels, p = L.progress();
    const cds = ACTIVES.map((a) => Math.ceil(g.skillCooldown(a))).join(',');
    const sig = `${L.xp}|${L.spent}|${JSON.stringify(L.ranks)}|${cds}|${this.respecArm > 0 ? 1 : 0}|${g.inventory.count('gear_shard')}|${g.inventory.count('stardust')}`;
    if (!force && sig === this.panelSig) return;
    this.panelSig = sig;
    const q = <T extends HTMLElement>(s: string): T | null => this.root.querySelector<T>(s);
    paint(q('#delve-sk-badge'), badgeBmp(p.level));
    paint(q('#delve-sk-xpbar'), xpBarBmp(p.frac, false, 120));
    const set = (s: string, t: string): void => { const e = q(s); if (e) e.textContent = t; };
    set('#delve-sk-name', `等級 ${p.level}「${titleFor(p.level)}」`);
    set('#delve-sk-xpline', p.level >= MAX_LEVEL ? `經驗 ${L.xp.toLocaleString('en-US')}（已滿級）` : `經驗 ${p.into.toLocaleString('en-US')} / ${p.need.toLocaleString('en-US')}（下一級還差 ${(p.need - p.into).toLocaleString('en-US')}）`);
    set('#delve-sk-growth', `等級成長：生命上限 +${levelHp(p.level)}、防禦 +${levelDef(p.level)}`);
    const nm = nextMilestone(p.level);
    set('#delve-sk-next', nm ? `下個里程碑：${nm.level} 級「${nm.title}」· 額外 +1 技能點${nm.frame ? `、${nm.frame}徽章` : ''}` : '所有里程碑都達成了');
    set('#delve-sk-points', `可用技能點 ${L.points}（已花 ${L.spent}）· ${ACTIVES.filter((a) => g.levels.has(ACTIVE_NODE[a])).map((a) => cdLabel(a, g.skillCooldown(a))).join(' · ') || '還沒學主動技能'}`);
    for (const b of BRANCHES) {
      const sub = this.root.querySelector(`[data-spent='${b.id}']`);
      if (sub) sub.textContent = `${branchSpent(L.ranks, b.id)} 點`;
    }
    for (const n of this.nodes) this.drawNode(n);
    for (const b of BRANCHES) this.drawLines(b.id);
    const respec = q<HTMLButtonElement>('#delve-sk-respec');
    if (respec) {
      respec.textContent = this.respecArm > 0 ? '確定重置？' : respecLabel(g.respecCost());
      respec.disabled = L.spent <= 0;
    }
    const stats = q('#delve-sk-stats');
    if (stats) {
      stats.replaceChildren();
      const lines = skillStatLines(L.totals());
      for (const l of lines.length ? lines : ['（還沒點技能：點一級試試看）']) stats.appendChild(el('li', '', l));
    }
    this.renderDetail();
  }
  private drawNode(n: NodeEl): void {
    const g = this.game, L = g.levels, d = skillDef(n.id), k = rankOf(L.ranks, n.id);
    const look = nodeState(L.ranks, n.id, L.level);
    const sig = `${look}|${k}|${L.points}|${L.level}`;
    if (sig === n.sig) return;
    n.sig = sig;
    paint(n.canvas, nodeBmp(n.id, d.kind, look, k, d.max));
    n.btn.dataset.state = look;
    n.btn.dataset.rank = String(k);
    const t = skillTip(n.id, L.ranks, L.level, L.points);
    n.btn.setAttribute('aria-label', `${t.name}（${t.kind}）${t.rank}`);
    n.tip.replaceChildren(...tipLines(t));
  }
  /** 前置連線：兩個節點都點了 = 金、前置點了 = 棕、否則暗灰（2 美術 px 寬、轉角走直角） */
  private drawLines(b: Branch): void {
    const c = this.lineCanvas.get(b);
    if (!c) return;
    const bmp = new Bmp(GRID_W, GRID_H), L = this.game.levels;
    const center = (id: SkillId): [number, number] => { const d = skillDef(id); return [d.col * COL_W + NODE_PX / 2, d.row * ROW_H + NODE_PX / 2]; };
    for (const s of SKILLS.filter((x) => x.branch === b)) {
      for (const r of s.req) {
        const [x0, y0] = center(r), [x1, y1] = center(s.id);
        const lit = rankOf(L.ranks, r) > 0 && rankOf(L.ranks, s.id) > 0, open = rankOf(L.ranks, r) > 0;
        const col = lit ? LINE.on : open ? LINE.open : LINE.off;
        const midY = y0 + ROW_H / 2 + 2;
        const seg = (ax: number, ay: number, bx: number, by: number): void => {
          const xa = Math.min(ax, bx), xb = Math.max(ax, bx), ya = Math.min(ay, by), yb = Math.max(ay, by);
          bmp.rect(xa - 2, ya - 2, xb - xa + 4, yb - ya + 4, LINE.ink);
        };
        const fill = (ax: number, ay: number, bx: number, by: number): void => {
          const xa = Math.min(ax, bx), xb = Math.max(ax, bx), ya = Math.min(ay, by), yb = Math.max(ay, by);
          bmp.rect(xa - 1, ya - 1, xb - xa + 2, yb - ya + 2, col);
          if (lit) bmp.rect(xa - 1, yb, xb - xa + 2, 1, LINE.onLo);
        };
        seg(x0, y0, x0, midY); seg(x0, midY, x1, midY); seg(x1, midY, x1, y1);
        fill(x0, y0, x0, midY); fill(x0, midY, x1, midY); fill(x1, midY, x1, y1);
      }
    }
    paint(c, bmp);
  }
  /** 面板下方的詳情（焦點或滑過的節點）+「點一級」按鈕 */
  private renderDetail(hover?: SkillId): void {
    const id = hover ?? this.focusId, L = this.game.levels;
    const box = this.root.querySelector('#delve-sk-detail');
    const t = skillTip(id, L.ranks, L.level, L.points);
    if (box) box.replaceChildren(...tipLines(t));
    const learn = this.root.querySelector<HTMLButtonElement>('#delve-sk-learn');
    if (learn) {
      learn.textContent = t.state === null ? `點一級：${t.name}（${skillDef(id).cost} 點）` : `${t.name}：${failText(t.state)}`;
      learn.disabled = t.state !== null;
      learn.dataset.skill = id;
    }
  }

  destroy(): void {
    for (const f of this.offs) f();
    this.offs.length = 0;
    if (this.panel) this.panel.hidden = true;
    delete this.root.dataset.skills;
    const box = this.root.querySelector<HTMLElement>('#delve-lvup');
    if (box) box.hidden = true;
  }
}

function tipLines(t: ReturnType<typeof skillTip>): HTMLElement[] {
  const out: HTMLElement[] = [];
  const head = el('p', 'is-name', `${t.name}　`);
  head.appendChild(el('span', 'is-kind', `${t.kind} · ${t.rank}`));
  out.push(head);
  if (t.now) out.push(el('p', '', t.now));
  if (t.next) out.push(el('p', 'is-dim', t.next));
  for (const r of t.reqs) out.push(el('p', r.ok ? 'is-ok' : 'is-no', `${r.ok ? '✔' : '✘'} ${r.text}`));
  out.push(el('p', t.state === null ? 'is-ok' : 'is-dim', t.state === null ? `${t.cost}（再點一下或 Enter）` : t.state === 'max' ? t.cost : `${t.cost} · ${failText(t.state)}`));
  return out;
}

export { ACTIVE_KEYS, ACTIVE_ZH };
