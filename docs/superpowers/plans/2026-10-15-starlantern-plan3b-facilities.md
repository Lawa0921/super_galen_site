# 《星燈迷宮》計畫三 B：城鎮設施畫面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在預覽頁 `/games/starlantern-next` 做出公會、道具店、旅館、迷宮入口四個設施畫面，全部接上現有引擎，讓城鎮循環（編隊、招募、裝備、狀態、購買、販賣、住宿存檔、復活、選樓層）可以只用鍵盤或滑鼠玩完。

**Architecture:** 一個共用的 `FacilityScene` 基底負責場景圖、NPC 半身像（一般／開心）、地名牌、金錢、指令視窗、對話框與「視窗堆疊」（子視窗一層層疊起、取消回上一層）。四個設施各自繼承它，只寫自己的指令與子視窗。引擎呼叫一律透過 `game.apply(...)`／`game.rest()`，不改引擎。迷宮與戰鬥畫面在計畫三 C，這裡選樓層後先提示「下一階段開放」。

**Tech Stack:** TypeScript、SCSS、Vitest（happy-dom）、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-15-starlantern-game-ui-design.md` 第 5 節第 3–6 點。前一段：`docs/superpowers/plans/2026-10-15-starlantern-plan3a-game-ui-foundation.md`。

## Global Constraints

- 沿用計畫三 A 的所有限制：640×360、俐方體 11 號、`slx-` 樣式前綴、禁 `!important` 與行內樣式（含 `element.style`）、不用 `<button>`／`<select>`、選項是 `role="option"`。
- 設施版面照《世界樹迷宮》：場景插畫鋪底、NPC 半身像在右、指令視窗在左、對話框在下、子視窗疊在場景上。
- 交易成功或解鎖新商品時 NPC 換開心表情約 1.5 秒；錯誤（錢不夠等）播錯誤音效並由 NPC 說明原因，原因文字沿用 `T.reasons`。
- 購買與販賣用左右鍵調整數量（spec 第 5 節第 4 點）。
- 旅館休息：確認 → 淡出 →「隔天早上」→ 淡入 → 提示「已存檔」或「存檔失敗」。
- 測試指令同計畫三 A。

## Review Focus

1. 錢不夠時連按確認購買：不能扣成負數，也不能買到超過能負擔的數量。→ Task 3 測試。
2. 編隊把所有人都清空：引擎回 `empty`，畫面要保留原編隊並說明原因。→ Task 2 測試。
3. 在子視窗中按取消：一次只回一層，最上層才離開設施。→ Task 1 測試。
4. 沒有倒下的隊員時選「復活」：不能進入空清單卡住，要直接說明。→ Task 4 測試。
5. 開心表情計時中離開設施：計時器要清掉，不能對已移除的元素操作。→ Task 1 測試。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `ui2/menu.ts` | `MenuItem` 增加選填 `icon`（圖片 URL）與 `right`（右欄文字，例如價格） |
| `ui2/widgets.ts` | `MenuView` 依 `icon`／`right` 畫出三欄；新增 `QtyView`（左右鍵調數量） |
| `ui2/scenes/facility.ts` | `FacilityScene` 基底 |
| `ui2/scenes/guild.ts`、`shop.ts`、`inn.ts`、`gate.ts` | 四個設施 |
| `ui2/scene.ts` | `SceneName` 擴充 `'guild' | 'shop' | 'inn' | 'gate'` |
| `ui2/scenes/town.ts` | 選設施改為切換場景 |
| `ui2/main.ts` | 建立四個新場景 |
| `data/text.zh-TW.ts` | `T.ui2` 增加 NPC 名字、台詞、職業說明與各畫面文字 |
| `_starlantern-ui.scss` | 設施版面、NPC、子視窗、狀態視窗、樓層卡片 |
| `tests/e2e/starlantern-next.spec.ts` | 鍵盤走過四個設施 |

---

### Task 1: 清單欄位、數量視窗與設施基底

**Files:** Modify `ui2/menu.ts`、`ui2/widgets.ts`、`ui2/scene.ts`、`data/text.zh-TW.ts`、`_starlantern-ui.scss`；Create `ui2/scenes/facility.ts`；Test `ui2/widgets.test.ts`（加）、`ui2/scenes/facility.test.ts`。

**Interfaces:**
- Produces：
  - `MenuItem` 增加 `icon?: string; right?: string`
  - `class QtyView { readonly el: HTMLElement; qty: number; constructor(max: number, on: { change(qty: number): void; done(qty: number): void; cancel(): void }); onAction(a: UiAction): boolean }`（左／右 ±1，上／下 ±10，夾在 1..max；確認 → `done`；取消 → `cancel`）
  - `type FacilityId = 'guild' | 'shop' | 'inn' | 'gate'`
  - `interface Layer { el: HTMLElement; onAction(a: UiAction): boolean }`
  - `abstract class FacilityScene implements Scene`：`constructor(ctx: SceneCtx, id: FacilityId, cps?: number)`；子類別實作 `protected abstract commands(): MenuItem[]` 與 `protected abstract onCommand(id: string): void`；提供 `protected push(layer: Layer)`、`protected pop()`、`protected say(text: string, mood?: 'normal' | 'happy'): Promise<void>`、`protected fail(reason: string)`、`protected refresh()`（重畫金錢與指令視窗）、`protected root: HTMLElement`、`protected stage: HTMLElement`（子視窗掛載處）。
  - `SceneName` 增加 `'guild' | 'shop' | 'inn' | 'gate'`。

- [ ] **Step 1: 寫失敗測試**

加到 `ui2/widgets.test.ts`：

```ts
describe('MenuView columns', () => {
  it('renders an icon and a right-hand column without changing the label', () => {
    const v = new MenuView(new Menu([{ id: 'potion', label: '回復藥', icon: '/assets/games/starlantern/icon/potion.png', right: '30 G' }]), { pick: vi.fn() });
    const li = v.el.querySelector('[role=option]')!;
    expect(li.querySelector('img')!.getAttribute('src')).toBe('/assets/games/starlantern/icon/potion.png');
    expect(li.querySelector('.slx-label')!.textContent).toBe('回復藥');
    expect(li.querySelector('.slx-right')!.textContent).toBe('30 G');
  });
});

describe('QtyView', () => {
  it('steps by 1 and 10, clamps to 1..max and reports the result', () => {
    const change = vi.fn(); const done = vi.fn(); const cancel = vi.fn();
    const q = new QtyView(12, { change, done, cancel });
    expect(q.qty).toBe(1);
    q.onAction('left'); expect(q.qty).toBe(1);
    q.onAction('right'); q.onAction('right'); expect(q.qty).toBe(3);
    q.onAction('up'); expect(q.qty).toBe(12);
    q.onAction('down'); expect(q.qty).toBe(2);
    expect(change).toHaveBeenLastCalledWith(2);
    expect(q.el.textContent).toContain('2');
    q.onAction('confirm'); expect(done).toHaveBeenCalledWith(2);
    q.onAction('cancel'); expect(cancel).toHaveBeenCalled();
  });
});
```

（`widgets.test.ts` 的 import 改成 `import { Dialogue, MenuView, QtyView, confirmBox } from './widgets';`）

`ui2/scenes/facility.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import type { MenuItem } from '../menu';
import { FacilityScene } from './facility';
import { MenuView } from '../widgets';
import { Menu } from '../menu';

class Probe extends FacilityScene {
  picked: string[] = [];
  protected commands(): MenuItem[] { return [{ id: 'open', label: '打開' }, { id: 'leave', label: '離開' }]; }
  protected onCommand(id: string): void {
    this.picked.push(id);
    if (id === 'leave') { this.leave(); return; }
    const sub = new MenuView(new Menu([{ id: 'x', label: 'X' }]), { pick: () => this.picked.push('x'), cancel: () => this.pop() });
    this.push({ el: sub.el, onAction: (a) => sub.onAction(a) });
  }
  cheer(): Promise<void> { return this.say('好！', 'happy'); }
}

const ctx = () => ({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() });

describe('FacilityScene', () => {
  afterEach(() => vi.useRealTimers());

  it('lays out the place, gold, command window and a greeting', () => {
    const c = ctx(); const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    expect(root.querySelector('.slx-place')!.textContent).toBe('冒險者公會');
    expect(root.querySelector('.slx-gold')!.textContent).toBe('150 G');
    expect(root.querySelector('.slx-talk .slx-name')!.textContent).toBe('安娜');
  });

  it('cancel closes one layer at a time and leaves only from the top', () => {
    const c = ctx(); const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    s.onAction('confirm');            // close greeting
    s.onAction('confirm');            // 打開 → sub window
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(1);
    s.onAction('cancel');             // closes the sub window only
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(0);
    expect(c.go).not.toHaveBeenCalled();
    s.onAction('cancel');             // top level → back to town
    expect(c.go).toHaveBeenCalledWith('town');
  });

  it('shows the happy face briefly and clears the timer on exit', async () => {
    vi.useFakeTimers();
    const art = { has: () => true };
    const c = { ...ctx(), art }; const root = document.createElement('div');
    const s = new Probe(c, 'guild', Infinity); s.enter(root);
    s.onAction('confirm');
    void s.cheer();
    expect(root.querySelector('.slx-npc')!.getAttribute('src')).toContain('guild-happy');
    s.exit();
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: 確認失敗**：`npx vitest run src/scripts/games/starlantern/ui2` → `QtyView` 未匯出、`./facility` 找不到。

- [ ] **Step 3: 實作**

`menu.ts` 的 `MenuItem` 改為：

```ts
export interface MenuItem { id: string; label: string; disabled?: boolean; note?: string; icon?: string; right?: string }
```

`widgets.ts` 的 `MenuView.render()` 內建立 `li` 的部分改為（保留其餘事件邏輯）：

```ts
      const li = el('li', { class: i === this.menu.cursor ? 'slx-opt slx-sel' : 'slx-opt', attrs: {
        role: 'option', 'aria-selected': String(i === this.menu.cursor), 'aria-disabled': String(!!item.disabled), 'data-id': item.id,
      } }, [
        ...(item.icon ? [el('img', { class: 'slx-ico', attrs: { src: item.icon, alt: '' } })] : []),
        el('span', { class: 'slx-label', text: item.label }),
        ...(item.right !== undefined ? [el('span', { class: 'slx-right', text: item.right })] : []),
      ]);
```

並在 `widgets.ts` 末尾加：

```ts
export class QtyView {
  readonly el: HTMLElement;
  qty = 1;
  private label = el('span', { class: 'slx-qty-n' });

  constructor(private max: number, private on: { change(qty: number): void; done(qty: number): void; cancel(): void }) {
    this.el = win('slx-qty', [el('span', { text: '◀ ' }), this.label, el('span', { text: ' ▶' })]);
    this.show();
  }

  onAction(a: UiAction): boolean {
    const step = a === 'left' ? -1 : a === 'right' ? 1 : a === 'down' ? -10 : a === 'up' ? 10 : 0;
    if (step) {
      const next = Math.min(this.max, Math.max(1, this.qty + step));
      if (next !== this.qty) { this.qty = next; this.show(); this.on.change(next); }
      return true;
    }
    if (a === 'confirm') { this.on.done(this.qty); return true; }
    if (a === 'cancel') { this.on.cancel(); return true; }
    return false;
  }

  private show(): void { this.label.textContent = `× ${this.qty}`; }
}
```

`scene.ts`：`export type SceneName = 'title' | 'town' | 'guild' | 'shop' | 'inn' | 'gate';`

`text.zh-TW.ts` 的 `ui2` 增加：

```ts
    facility: {
      guild: { place: '冒險者公會', npc: '安娜', greet: ['歡迎回來，要整頓隊伍嗎？', '今天也請平安歸來。'] },
      shop: { place: '道具店', npc: '歐里克', greet: ['歡迎光臨！看看有什麼需要的。', '剛進了新貨喔。'] },
      inn: { place: '月影旅館', npc: '瑪莎', greet: ['辛苦了，要休息一下嗎？', '熱湯已經準備好了。'] },
      gate: { place: '迷宮入口', npc: '葛倫', greet: ['要下去了嗎？別逞強。', '裂口今天也在發光。'] },
      leave: '離開',
    },
```

`ui2/scenes/facility.ts`：

```ts
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { Dialogue, MenuView, win } from '../widgets';

export type FacilityId = 'guild' | 'shop' | 'inn' | 'gate';
export interface Layer { el: HTMLElement; onAction(a: UiAction): boolean }

/** Shared facility screen: scene art, NPC bust, place sign, gold, command window, dialogue and a stack of sub-windows. */
export abstract class FacilityScene implements Scene {
  protected root!: HTMLElement;
  protected stage!: HTMLElement;
  private layers: Layer[] = [];
  private view!: MenuView;
  private cmdWin!: HTMLElement;
  private gold!: HTMLElement;
  private npc: HTMLImageElement | null = null;
  private talk: Dialogue;
  private moodTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(protected ctx: SceneCtx, protected id: FacilityId, cps = 30) {
    this.talk = new Dialogue(cps);
  }

  protected abstract commands(): MenuItem[];
  protected abstract onCommand(id: string): void;

  enter(root: HTMLElement): void {
    this.root = root;
    const f = T.ui2.facility[this.id];
    const bg = this.ctx.art.has(art.scene(this.id)) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene(this.id), alt: '' } })] : [];
    if (this.ctx.art.has(art.npc(this.id, 'normal'))) this.npc = el('img', { class: 'slx-npc', attrs: { src: art.npc(this.id, 'normal'), alt: '' } });
    this.gold = win('slx-gold');
    this.cmdWin = win('slx-cmd');
    this.stage = el('div', { class: 'slx-stage' });
    root.append(el('div', { class: `slx-scene slx-facility slx-${this.id}` }, [
      ...bg, ...(this.npc ? [this.npc] : []), win('slx-place', [document.createTextNode(f.place)]), this.gold, this.cmdWin, this.stage, this.talk.el,
    ]));
    this.refresh();
    void this.say(f.greet[Math.floor(this.ctx.game.rng() * f.greet.length)]);
  }

  exit(): void {
    if (this.moodTimer) clearTimeout(this.moodTimer);
    this.moodTimer = null;
  }

  onAction(a: UiAction): void {
    if (this.talk.busy()) { this.talk.onAction(a); return; }
    const top = this.layers[this.layers.length - 1];
    if (top) { top.onAction(a); return; }
    this.view.onAction(a);
  }

  protected refresh(): void {
    this.gold.textContent = `${this.ctx.game.state.gold} G`;
    const keep = this.view?.menu.cursor ?? 0;
    const items = [...this.commands(), { id: 'leave', label: T.ui2.facility.leave }];
    this.view = new MenuView(new Menu(items, keep), {
      pick: (it) => { this.ctx.sfx.confirm(); if (it.id === 'leave') this.leave(); else this.onCommand(it.id); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.leave(),
    });
    this.cmdWin.replaceChildren(this.view.el);
  }

  protected leave(): void {
    this.ctx.sfx.cancel();
    this.ctx.go('town');
  }

  protected push(layer: Layer): void {
    layer.el.classList.add('slx-layer');
    this.layers.push(layer);
    this.stage.append(layer.el);
  }

  protected pop(): void {
    const l = this.layers.pop();
    l?.el.remove();
    this.ctx.sfx.cancel();
  }

  protected popAll(): void {
    while (this.layers.length) this.layers.pop()!.el.remove();
  }

  protected say(text: string, mood: 'normal' | 'happy' = 'normal'): Promise<void> {
    if (mood === 'happy') this.setMood('happy');
    return this.talk.say(T.ui2.facility[this.id].npc, text);
  }

  protected fail(reason: string): void {
    this.ctx.sfx.error();
    void this.say(T.reasons[reason] ?? T.reasons.invalid);
  }

  private setMood(mood: 'normal' | 'happy'): void {
    if (!this.npc || !this.ctx.art.has(art.npc(this.id, mood))) return;
    this.npc.setAttribute('src', art.npc(this.id, mood));
    if (this.moodTimer) clearTimeout(this.moodTimer);
    this.moodTimer = mood === 'happy' ? setTimeout(() => { this.moodTimer = null; this.setMood('normal'); }, 1500) : null;
  }
}
```

註：`Probe` 的 `leave` 呼叫的是基底的 `protected leave()`；`commands()` 不含「離開」，基底自動附加，所以 Probe 的指令裡的 `leave` 不會出現兩次——把 facility.test.ts 中 `Probe.commands()` 改為只回傳 `[{ id: 'open', label: '打開' }]`，並刪掉 `onCommand` 裡 `id === 'leave'` 那一行。

`_starlantern-ui.scss` 追加：

```scss
.slx-npc { position: absolute; right: 0; bottom: 0; height: 330px; }
.slx-cmd { left: 12px; top: 56px; min-width: 120px; }
.slx-stage { position: absolute; inset: 0; pointer-events: none; }
.slx-stage > * { pointer-events: auto; }
.slx-layer { left: 150px; top: 56px; max-width: 300px; }
.slx-opt { display: flex; align-items: center; gap: 4px; }
.slx-ico { width: 12px; height: 12px; object-fit: contain; }
.slx-right { margin-left: auto; padding-left: 12px; color: $slx-dim; }
.slx-qty { left: 300px; top: 150px; min-width: 70px; text-align: center; }
```

- [ ] **Step 4: 確認通過**：`npx vitest run src/scripts/games/starlantern/ui2` → 全過。

- [ ] **Step 5: Commit**：`feat(starlantern): facility scene base, list columns and quantity picker`。

---

### Task 2: 冒險者公會（編隊、招募、裝備、狀態）

**Files:** Create `ui2/scenes/guild.ts`；Modify `data/text.zh-TW.ts`、`_starlantern-ui.scss`；Test `ui2/scenes/guild.test.ts`。

**Interfaces:**
- Consumes：`FacilityScene`、`QtyView` 不需要；引擎 `setFormation`、`recruit`、`statsOf`、`learnedSkills`、`equip`、`unequip`；資料 `CHARACTERS`、`CHARACTER_IDS`、`EQUIPMENT`、`SKILLS`、`ULTIMATES`；`portraitImg`、`standeeImg`（`ui/art.ts`）。
- Produces：`class GuildScene extends FacilityScene`；`T.ui2.guild = { formation, recruit, equip, status, empty, front, back, unequip, roles: Record<CharacterId, string>, recruited(name), nextSkill(lv), learnedAt(lv) }`。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { GuildScene } from './guild';

function setup() {
  const game = new Game(constRng(0.5), null);
  game.state.gold = 1000;
  game.state.inventory['iron-sword'] = 1;
  const root = document.createElement('div');
  const s = new GuildScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm'); // greeting
  const opts = () => [...root.querySelectorAll('.slx-layer:last-child [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  const pick = (label: string) => {
    const layer = root.querySelector('.slx-layer:last-child') ?? root.querySelector('.slx-cmd')!;
    const all = [...layer.querySelectorAll('[role=option]')];
    const i = all.findIndex((o) => o.querySelector('.slx-label')!.textContent === label);
    if (i < 0) throw new Error(`no option ${label}: ${all.map((o) => o.textContent).join('/')}`);
    (all[i] as HTMLElement).click();
  };
  return { game, root, s, opts, pick };
}

describe('GuildScene', () => {
  it('lists the guild commands', () => {
    const { root } = setup();
    expect([...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.textContent)).toEqual(['編隊', '招募', '裝備', '狀態', '離開']);
  });

  it('swaps two slots in the formation', () => {
    const { game, pick, s } = setup();
    pick('編隊');
    pick('前排 1：絲嘉蕾');
    pick('諾艾兒');
    expect(game.state.party.front[0]).toBe('noel');
    expect(game.state.party.back[0]).toBe('scarlet');
    s.onAction('cancel');
  });

  it('keeps the formation and explains when the last member would be removed', () => {
    const { game, pick, root } = setup();
    game.state.party.front = ['scarlet', null, null];
    game.state.party.back = [null, null];
    pick('編隊');
    pick('前排 1：絲嘉蕾');
    pick('（空）');
    expect(game.state.party.front[0]).toBe('scarlet');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('至少要有一人出戰');
  });

  it('recruits after a confirmation', () => {
    const { game, pick, s, root } = setup();
    pick('招募');
    pick('森林遊俠 希爾薇');
    expect(root.textContent).toContain('單體高傷');
    s.onAction('up');      // confirm box defaults to 否; up wraps to 是
    s.onAction('confirm');
    expect(game.state.party.recruited).toContain('sylvie');
  });

  it('equips from the inventory and shows the stat change', () => {
    const { game, pick, opts } = setup();
    pick('裝備');
    pick('絲嘉蕾');
    pick('武器：（未裝備）');
    expect(opts()).toContain('鐵劍');
    expect(document.body).toBeTruthy();
    pick('鐵劍');
    expect(game.state.party.roster.scarlet.equip.weapon).toBe('iron-sword');
  });

  it('shows a status sheet with skills and the ultimate', () => {
    const { pick, root } = setup();
    pick('狀態');
    pick('諾艾兒');
    const sheet = root.querySelector('.slx-status')!;
    expect(sheet.textContent).toContain('火之星彈');
    expect(sheet.textContent).toContain('流星燈火');
    expect(sheet.textContent).toContain('Lv 1');
  });
});
```

- [ ] **Step 2: 確認失敗**：`npx vitest run src/scripts/games/starlantern/ui2/scenes/guild.test.ts` → 找不到 `./guild`。

- [ ] **Step 3: 實作**

`text.zh-TW.ts` 的 `ui2` 增加：

```ts
    guild: {
      formation: '編隊', recruit: '招募', equip: '裝備', status: '狀態', empty: '（空）', unequip: '（卸下）',
      front: (i: number, name: string) => `前排 ${i}：${name}`, back: (i: number, name: string) => `後排 ${i}：${name}`,
      slot: (slot: string, name: string) => `${slot}：${name}`, none: '（未裝備）',
      ask: (name: string) => `要讓 ${name} 加入隊伍嗎？`, recruited: (name: string) => `${name} 加入了隊伍！`, equipped: '裝備好了。',
      learnedAt: (lv: number) => `Lv ${lv} 習得`, ultimate: '絕技', gauge: (n: number) => `量表 ${n}%`,
      roles: {
        noel: '後排。火、冰、雷攻擊；降低敵人能力、毒。', chizuru: '前排。全體攻擊；我方減傷。', liz: '前或後。多段攻擊；降低遇敵、素材掉落加成。',
        sylvie: '後排。單體高傷；先制攻擊、提高逃跑率。', scarlet: '前排。吸引攻擊、替隊友擋傷；消耗 HP 打火屬性大傷害。',
        selene: '後排。治療、復活、解毒；催眠。', safira: '前排。多段攻擊、提高閃避；全隊增益。', bobby: '後排。放置砲台每回合攻擊；道具效果加倍、護盾。',
      } as Record<string, string>,
    },
```

`ui2/scenes/guild.ts`：

```ts
import { CHARACTERS, CHARACTER_IDS } from '../../data/characters';
import { EQUIPMENT } from '../../data/equipment';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { ULTIMATES } from '../../data/ultimates';
import { learnedSkills, recruit, setFormation, statsOf } from '../../engine/party';
import { equip, unequip } from '../../engine/town';
import type { CharacterId, Slot } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { portraitImg, standeeImg } from '../../ui/art';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];
const name = (id: CharacterId) => CHARACTERS[id].name;

export class GuildScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'guild', cps); }

  protected commands(): MenuItem[] {
    const g = T.ui2.guild;
    const canRecruit = CHARACTER_IDS.some((id) => !this.ctx.game.state.party.recruited.includes(id));
    return [{ id: 'formation', label: g.formation }, { id: 'recruit', label: g.recruit, disabled: !canRecruit }, { id: 'equip', label: g.equip }, { id: 'status', label: g.status }];
  }

  protected onCommand(id: string): void {
    if (id === 'formation') this.formation();
    if (id === 'recruit') this.recruitList();
    if (id === 'equip') this.pickMember((m) => this.slots(m));
    if (id === 'status') this.pickMember((m) => this.status(m));
  }

  private list(items: MenuItem[], pick: (it: MenuItem) => void, cls = '', start = 0): MenuView {
    const v = new MenuView(new Menu(items, start), { pick: (it) => { this.ctx.sfx.confirm(); pick(it); }, moved: () => this.ctx.sfx.cursor(), cancel: () => this.pop() });
    this.push({ el: win(`slx-list ${cls}`, [v.el]), onAction: (a) => v.onAction(a) });
    return v;
  }

  private faceIcon(id: CharacterId): string | undefined {
    return this.ctx.art.has(art.portrait(id, 'normal')) ? art.portrait(id, 'normal') : undefined;
  }

  private formation(keep = 0): void {
    const p = this.ctx.game.state.party;
    const g = T.ui2.guild;
    const slots = [...p.front.map((id, i) => ({ row: 'front' as const, i, id })), ...p.back.map((id, i) => ({ row: 'back' as const, i, id }))];
    this.list(slots.map((s, k) => ({
      id: String(k), icon: s.id ? this.faceIcon(s.id) : undefined,
      label: (s.row === 'front' ? g.front : g.back)(s.i + 1, s.id ? name(s.id) : g.empty),
    })), (it) => this.chooseFor(slots, Number(it.id)), 'slx-formation', keep);
  }

  private chooseFor(slots: { row: 'front' | 'back'; i: number; id: CharacterId | null }[], k: number): void {
    const p = this.ctx.game.state.party;
    const items: MenuItem[] = [...p.recruited.map((id) => ({ id, label: name(id), icon: this.faceIcon(id) })), { id: '', label: T.ui2.guild.empty }];
    this.list(items, (it) => {
      const chosen = (it.id || null) as CharacterId | null;
      const ids = slots.map((s) => s.id);
      const from = chosen ? ids.indexOf(chosen) : -1;
      if (from >= 0) ids[from] = ids[k];
      ids[k] = chosen;
      const r = setFormation(p, ids.slice(0, 3), ids.slice(3));
      this.popAll();
      if (!r.ok) { this.fail(r.reason); this.formation(k); return; }
      this.ctx.game.state.party = r.party;
      this.formation(k);
    });
  }

  private recruitList(): void {
    const p = this.ctx.game.state.party;
    const ids = CHARACTER_IDS.filter((id) => !p.recruited.includes(id));
    const info = win('slx-info');
    const show = (id: CharacterId) => info.replaceChildren(...[standeeImg(this.ctx.art, id)].filter((n): n is HTMLImageElement => !!n),
      el('p', { text: `${CHARACTERS[id].title} ${name(id)}` }), el('p', { text: T.ui2.guild.roles[id] }));
    const v = this.list(ids.map((id) => ({ id, label: `${CHARACTERS[id].title} ${name(id)}`, icon: this.faceIcon(id) })), (it) => {
      const id = it.id as CharacterId;
      const box = confirmBox(T.ui2.guild.ask(name(id)), (yes) => {
        this.pop();
        if (!yes) return;
        this.ctx.game.state.party = recruit(this.ctx.game.state.party, id);
        this.popAll(); this.refresh();
        void this.say(T.ui2.guild.recruited(name(id)), 'happy');
      });
      box.view.menu.setCursor(1); box.view.render();
      this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
    });
    if (ids[0]) show(ids[0]);
    v.el.addEventListener('pointerenter', () => {}, { capture: true });
    const origMoved = () => { const c = v.menu.current(); if (c) show(c.id as CharacterId); };
    v.el.addEventListener('click', origMoved);
    this.stage.append(info);
    const onAction = (a: Parameters<MenuView['onAction']>[0]) => { const r = v.onAction(a); origMoved(); return r; };
    this.popAll();
    this.push({ el: v.el.parentElement!, onAction });
    this.push({ el: info, onAction: (a) => onAction(a) });
  }

  private pickMember(next: (id: CharacterId) => void): void {
    const p = this.ctx.game.state.party;
    this.list(p.recruited.map((id) => ({ id, label: name(id), icon: this.faceIcon(id), right: `Lv ${p.roster[id].level}` })), (it) => next(it.id as CharacterId));
  }

  private slots(id: CharacterId): void {
    const m = this.ctx.game.state.party.roster[id];
    const g = T.ui2.guild;
    this.list(SLOTS.map((slot) => ({ id: slot, label: g.slot(T.slot[slot], m.equip[slot] ? EQUIPMENT[m.equip[slot]!].name : g.none) })), (it) => this.gear(id, it.id as Slot));
  }

  private gear(id: CharacterId, slot: Slot): void {
    const s = this.ctx.game.state;
    const m = s.party.roster[id];
    const base = statsOf(m);
    const delta = (eid: string | null) => {
      const after = statsOf({ ...m, equip: { ...m.equip, [slot]: eid ?? undefined } });
      return (['atk', 'def', 'mag', 'res', 'spd', 'hp'] as const).map((k) => [k, after[k] - base[k]] as const).filter(([, d]) => d !== 0)
        .map(([k, d]) => `${T.stat[k]}${d > 0 ? '+' : ''}${d}`).join(' ') || '±0';
    };
    const items: MenuItem[] = Object.entries(s.inventory).filter(([eid, n]) => EQUIPMENT[eid]?.slot === slot && n > 0)
      .map(([eid, n]) => ({ id: eid, label: EQUIPMENT[eid].name, icon: this.ctx.art.has(art.icon(eid)) ? art.icon(eid) : undefined, right: `${delta(eid)} ×${n}` }));
    if (m.equip[slot]) items.push({ id: '', label: T.ui2.guild.unequip, right: delta(null) });
    if (!items.length) { this.fail('stock'); return; }
    this.list(items, (it) => {
      const r = this.ctx.game.apply(it.id ? equip(s, id, it.id) : unequip(s, id, slot));
      this.popAll();
      if (!r.ok) { this.fail(r.reason); return; }
      void this.say(T.ui2.guild.equipped, 'happy');
      this.slots(id);
    });
  }

  private status(id: CharacterId): void {
    const m = this.ctx.game.state.party.roster[id];
    const st = statsOf(m);
    const g = T.ui2.guild;
    const learned = new Set(learnedSkills(id, m.level));
    const skills = CHARACTERS[id].skills.map((sk) => el('li', { text: learned.has(sk) ? SKILLS[sk].name : `${SKILLS[sk].name}（${g.learnedAt(SKILLS[sk].learnLevel)}）` }));
    const u = ULTIMATES[id];
    const sheet = win('slx-status', [
      ...[standeeImg(this.ctx.art, id) ?? portraitImg(this.ctx.art, id, m.hp, st.hp)].filter((n): n is HTMLImageElement => !!n),
      el('h3', { text: `${CHARACTERS[id].title} ${name(id)}　Lv ${m.level}` }),
      el('p', { text: `HP ${m.hp}/${st.hp}　TP ${m.tp}/${st.tp}` }),
      el('p', { text: (['atk', 'def', 'mag', 'res', 'spd'] as const).map((k) => `${T.stat[k]} ${st[k]}`).join('　') }),
      el('ul', { class: 'slx-skills' }, skills),
      el('p', { text: `${g.ultimate}：${u.name}（${g.gauge(m.limit ?? 0)}）` }),
      el('p', { class: 'slx-desc', text: u.desc }),
    ]);
    this.push({ el: sheet, onAction: (a) => { if (a === 'cancel' || a === 'confirm') { this.pop(); return true; } return false; } });
  }
}
```

註：`recruitList` 需要在游標移動時更新右側資訊欄。上面的寫法把同一個清單 push 了兩次，邏輯混亂；改用下面這個乾淨版本取代整個 `recruitList`：

```ts
  private recruitList(): void {
    const p = this.ctx.game.state.party;
    const ids = CHARACTER_IDS.filter((id) => !p.recruited.includes(id));
    const info = win('slx-info');
    const show = (id: CharacterId | undefined) => {
      if (!id) return;
      info.replaceChildren(...[standeeImg(this.ctx.art, id)].filter((n): n is HTMLImageElement => !!n),
        el('p', { text: `${CHARACTERS[id].title} ${name(id)}` }), el('p', { class: 'slx-desc', text: T.ui2.guild.roles[id] }));
    };
    const v = new MenuView(new Menu(ids.map((id) => ({ id, label: `${CHARACTERS[id].title} ${name(id)}`, icon: this.faceIcon(id) }))), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askRecruit(it.id as CharacterId); },
      moved: () => { this.ctx.sfx.cursor(); show(v.menu.current()?.id as CharacterId); },
      cancel: () => { info.remove(); this.pop(); },
    });
    show(ids[0]);
    this.stage.append(info);
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askRecruit(id: CharacterId): void {
    const box = confirmBox(T.ui2.guild.ask(name(id)), (yes) => {
      this.pop();
      if (!yes) return;
      this.ctx.game.state.party = recruit(this.ctx.game.state.party, id);
      this.popAll();
      this.stage.querySelector('.slx-info')?.remove();
      this.refresh();
      void this.say(T.ui2.guild.recruited(name(id)), 'happy');
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }
```

（測試中 `pick('森林遊俠 希爾薇')` 是 click，會觸發 `pick` → 確認框；`expect(root.textContent).toContain('單體高傷')` 檢查的是資訊欄，`show(ids[0])` 在建立時已顯示第一位未招募者——預設招募名單第一位是希爾薇。）

`_starlantern-ui.scss` 追加：

```scss
.slx-list { left: 150px; top: 56px; min-width: 170px; max-height: 240px; overflow: hidden; }
.slx-list .slx-ico { width: 16px; height: 16px; }
.slx-info { left: 340px; top: 56px; width: 180px; }
.slx-info img { display: block; height: 120px; margin: 0 auto 4px; }
.slx-desc { color: $slx-dim; margin: 2px 0; }
.slx-status { left: 150px; top: 40px; width: 360px; min-height: 220px; }
.slx-status img { float: right; height: 150px; }
.slx-status h3 { margin: 0 0 4px; font-size: 12px; font-weight: normal; color: $slx-gold; }
.slx-status p { margin: 2px 0; }
.slx-skills { margin: 4px 0; padding-left: 14px; }
```

- [ ] **Step 4: 確認通過**：`npx vitest run src/scripts/games/starlantern/ui2` → 全過（若 `recruit` 測試的第一位不是希爾薇，依 `CHARACTER_IDS` 順序找出第一位未招募者——`STARTING_RECRUITS` 是 scarlet、chizuru、liz、noel、selene，順序 `noel, chizuru, liz, sylvie, …` 中第一位未招募的是 sylvie，成立）。

- [ ] **Step 5: Commit**：`feat(starlantern): guild screen with formation, recruiting, equipment and status`。

---

### Task 3: 道具店（購買、販賣）

**Files:** Create `ui2/scenes/shop.ts`；Modify `text.zh-TW.ts`、`_starlantern-ui.scss`；Test `ui2/scenes/shop.test.ts`。

**Interfaces:**
- Consumes：`buy`、`sell`、`isUnlocked`（`engine/town.ts`）、`ITEMS`、`EQUIPMENT`、`MATERIALS`、`statsOf`、`activeIds`、`QtyView`。
- Produces：`class ShopScene extends FacilityScene`；`T.ui2.shop = { buy, sell, owned(n), needs(text), bought(name, n), sold(name, n, gold), unlocked(names), nothing }`。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { ShopScene } from './shop';

function setup(gold = 100) {
  const game = new Game(constRng(0.5), null);
  game.state.gold = gold;
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new ShopScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm');
  const pick = (label: string) => {
    const layer = root.querySelector('.slx-layer:last-child') ?? root.querySelector('.slx-cmd')!;
    const o = [...layer.querySelectorAll('[role=option]')].find((x) => x.querySelector('.slx-label')!.textContent === label);
    if (!o) throw new Error(`no ${label}`);
    (o as HTMLElement).click();
  };
  return { game, root, s, pick, sfx };
}

describe('ShopScene', () => {
  it('buys a chosen quantity, capped by what the party can afford', () => {
    const { game, pick, s } = setup(100);
    pick('購買');
    pick('回復藥');                       // potion 30 G → at most 3
    s.onAction('up');                     // +10, clamped to 3
    expect(document.body).toBeTruthy();
    s.onAction('confirm');
    expect(game.state.inventory.potion).toBe(3 + 3);
    expect(game.state.gold).toBe(10);
  });

  it('refuses when even one is too expensive', () => {
    const { game, pick, sfx, root } = setup(10);
    pick('購買');
    pick('回復藥');
    expect(game.state.gold).toBe(10);
    expect(sfx.error).toHaveBeenCalled();
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('金錢不足');
  });

  it('shows locked equipment as disabled with what it needs', () => {
    const { pick, root } = setup();
    pick('購買');
    const locked = [...root.querySelectorAll('.slx-layer [role=option]')].find((o) => o.getAttribute('aria-disabled') === 'true')!;
    expect(locked.querySelector('.slx-right')!.textContent).toContain('×');
  });

  it('sells materials by quantity and announces newly unlocked goods', () => {
    const { game, pick, s, root } = setup();
    game.state.inventory['thorn-fang'] = 5;
    pick('販賣');
    pick('荊棘牙');
    s.onAction('up');                     // all 5
    s.onAction('confirm');
    expect(game.state.inventory['thorn-fang'] ?? 0).toBe(0);
    expect(game.state.sold['thorn-fang']).toBe(5);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('荊棘槍');
  });

  it('says so when there is nothing to sell', () => {
    const { pick, root } = setup();
    pick('販賣');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('沒有可以賣的素材。');
  });
});
```

（執行前確認 `data/equipment.ts` 中 `thorn-spear`（荊棘槍）的解鎖條件是賣出荊棘牙；若數量不是 ≤5，就把測試裡的 5 改成該數量，並記 Ruling。）

- [ ] **Step 2: 確認失敗**：找不到 `./shop`。

- [ ] **Step 3: 實作**

`text.zh-TW.ts` 的 `ui2` 增加：

```ts
    shop: {
      buy: '購買', sell: '販賣', owned: (n: number) => `持有 ${n}`, needs: (text: string) => `需要 ${text}`,
      bought: (name: string, n: number) => `${name} ×${n}，謝謝惠顧！`, sold: (name: string, n: number, g: number) => `收下 ${name} ×${n}，這是 ${g} G。`,
      unlocked: (names: string) => `託你的福，現在可以做出 ${names} 了！`, nothing: '沒有可以賣的素材。', canEquip: '能裝備', cannot: '不能裝備',
    },
```

`ui2/scenes/shop.ts`：

```ts
import { EQUIPMENT } from '../../data/equipment';
import { ITEMS } from '../../data/items';
import { MATERIALS } from '../../data/materials';
import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { activeIds, statsOf } from '../../engine/party';
import { buy, isUnlocked, sell } from '../../engine/town';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, QtyView, win } from '../widgets';
import { FacilityScene } from './facility';

export class ShopScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'shop', cps); }

  protected commands(): MenuItem[] {
    return [{ id: 'buy', label: T.ui2.shop.buy }, { id: 'sell', label: T.ui2.shop.sell }];
  }

  protected onCommand(id: string): void {
    if (id === 'buy') this.buyList();
    else this.sellList();
  }

  private icon(id: string): string | undefined {
    return this.ctx.art.has(art.icon(id)) ? art.icon(id) : undefined;
  }

  private goods(): MenuItem[] {
    const s = this.ctx.game.state;
    return [...Object.values(ITEMS), ...Object.values(EQUIPMENT)].map((g) => {
      const locked = 'slot' in g && !isUnlocked(s, g.id);
      const needs = locked ? (g.unlock ?? []).map((u) => `${MATERIALS[u.mat].name}×${u.qty}`).join('、') : '';
      return { id: g.id, label: g.name, icon: this.icon(g.id), disabled: locked, right: locked ? T.ui2.shop.needs(needs) : `${g.price} G  ${T.ui2.shop.owned(s.inventory[g.id] ?? 0)}` };
    });
  }

  private describe(id: string): HTMLElement[] {
    const s = this.ctx.game.state;
    const it = ITEMS[id];
    if (it) return [el('p', { text: it.desc })];
    const eq = EQUIPMENT[id];
    if (!eq) return [];
    const bonus = Object.entries(eq.bonus).map(([k, v]) => `${T.stat[k as keyof typeof T.stat]}+${v}`).join(' ');
    const rows = activeIds(s.party).map((cid) => {
      const m = s.party.roster[cid];
      const now = statsOf(m); const after = statsOf({ ...m, equip: { ...m.equip, [eq.slot]: id } });
      const d = (Object.keys(eq.bonus) as (keyof typeof now)[]).map((k) => `${T.stat[k]}${after[k] - now[k] >= 0 ? '+' : ''}${after[k] - now[k]}`).join(' ');
      return el('li', { text: `${CHARACTERS[cid].name}　${d}` });
    });
    return [el('p', { text: `${T.slot[eq.slot]}　${bonus}` }), el('ul', { class: 'slx-skills' }, rows)];
  }

  private buyList(): void {
    const info = win('slx-info');
    const show = () => { const c = v.menu.current(); if (c) info.replaceChildren(el('p', { class: 'slx-name-line', text: c.label }), ...this.describe(c.id)); };
    const v = new MenuView(new Menu(this.goods()), {
      pick: (it) => this.askQty(it.id, () => { v.menu.items.splice(0, v.menu.items.length, ...this.goods()); v.render(); }),
      moved: () => { this.ctx.sfx.cursor(); show(); },
      cancel: () => { info.remove(); this.pop(); },
    });
    show();
    this.stage.append(info);
    this.push({ el: win('slx-list slx-shop-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askQty(id: string, after: () => void): void {
    const price = ITEMS[id]?.price ?? EQUIPMENT[id]?.price ?? 0;
    const name = ITEMS[id]?.name ?? EQUIPMENT[id]?.name ?? id;
    const max = Math.min(99, Math.floor(this.ctx.game.state.gold / Math.max(1, price)));
    if (max < 1) { this.fail('gold'); return; }
    const q = new QtyView(max, {
      change: () => this.ctx.sfx.cursor(),
      done: (n) => {
        this.pop();
        let bought = 0;
        for (let i = 0; i < n; i++) { const r = this.ctx.game.apply(buy(this.ctx.game.state, id)); if (!r.ok) break; bought++; }
        this.refresh(); after();
        if (bought) void this.say(T.ui2.shop.bought(name, bought), 'happy'); else this.fail('gold');
      },
      cancel: () => this.pop(),
    });
    this.push({ el: q.el, onAction: (a) => q.onAction(a) });
  }

  private sellList(): void {
    const mats = () => Object.entries(this.ctx.game.state.inventory).filter(([id, n]) => MATERIALS[id] && n > 0)
      .map(([id, n]) => ({ id, label: MATERIALS[id].name, icon: this.icon(id), right: `${MATERIALS[id].price} G  ${T.ui2.shop.owned(n)}` }));
    if (!mats().length) { void this.say(T.ui2.shop.nothing); return; }
    const v = new MenuView(new Menu(mats()), {
      pick: (it) => {
        const have = this.ctx.game.state.inventory[it.id] ?? 0;
        const q = new QtyView(have, {
          change: () => this.ctx.sfx.cursor(),
          done: (n) => {
            this.pop();
            const before = new Set(Object.keys(EQUIPMENT).filter((e) => isUnlocked(this.ctx.game.state, e)));
            const gold = this.ctx.game.state.gold;
            const r = this.ctx.game.apply(sell(this.ctx.game.state, it.id, n));
            if (!r.ok) { this.fail(r.reason); return; }
            const fresh = Object.keys(EQUIPMENT).filter((e) => isUnlocked(this.ctx.game.state, e) && !before.has(e)).map((e) => EQUIPMENT[e].name);
            this.refresh();
            const left = mats();
            if (left.length) { v.menu.items.splice(0, v.menu.items.length, ...left); v.render(); } else this.popAll();
            void this.say(fresh.length ? T.ui2.shop.unlocked(fresh.join('、')) : T.ui2.shop.sold(it.label, n, this.ctx.game.state.gold - gold), 'happy');
          },
          cancel: () => this.pop(),
        });
        this.push({ el: q.el, onAction: (a) => q.onAction(a) });
      },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list slx-shop-list', [v.el]), onAction: (a) => v.onAction(a) });
  }
}
```

註：`MenuView.menu` 的 `items` 是 `readonly` 陣列參考但內容可變；`splice` 後 `render()` 會重畫；若游標超出新長度，`Menu` 不會自動修正——在 `render()` 前加 `if (v.menu.cursor >= v.menu.items.length) v.menu.setCursor(0);`。購買清單的 `after` 與販賣清單的更新都要套用這一行。

`_starlantern-ui.scss` 追加：

```scss
.slx-shop-list { min-width: 250px; }
.slx-name-line { color: $slx-gold; margin: 0 0 2px; }
```

- [ ] **Step 4: 確認通過**：`npx vitest run src/scripts/games/starlantern/ui2` → 全過。

- [ ] **Step 5: Commit**：`feat(starlantern): item shop with quantity buying, selling and unlock notices`。

---

### Task 4: 旅館與迷宮入口

**Files:** Create `ui2/scenes/inn.ts`、`ui2/scenes/gate.ts`；Modify `text.zh-TW.ts`、`_starlantern-ui.scss`；Test `ui2/scenes/inn.test.ts`、`ui2/scenes/gate.test.ts`。

**Interfaces:**
- Consumes：`game.rest()`、`game.notice`、`revive`、`reviveCost`、`innCost`、`FLOORS`、`art.bg`。
- Produces：`class InnScene`、`class GateScene`（皆 `extends FacilityScene`）；`T.ui2.inn = { rest(cost), revive, ask(cost), morning, saved, saveFailed, nobodyDown, revived(name) }`、`T.ui2.gate = { floor(n, name), locked, soon }`。

- [ ] **Step 1: 寫失敗測試**

`inn.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng, memoryStorage } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { InnScene } from './inn';

function setup(storage = memoryStorage()) {
  const game = new Game(constRng(0.5), storage);
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new InnScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity, 0);
  s.enter(root);
  s.onAction('confirm');
  const opts = () => [...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  return { game, root, s, sfx, storage, opts };
}

describe('InnScene', () => {
  afterEach(() => vi.useRealTimers());

  it('rests and saves after a yes', async () => {
    const { game, s, root, storage } = setup();
    game.state.party.roster.scarlet.hp = 1;
    const gold = game.state.gold;
    s.onAction('confirm');                 // 休息
    s.onAction('up');                      // 是
    s.onAction('confirm');
    await vi.waitFor(() => expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('已存檔。'));
    expect(game.state.party.roster.scarlet.hp).toBeGreaterThan(1);
    expect(game.state.gold).toBeLessThan(gold);
    expect(storage.map.get('starlantern-save')).toBeTruthy();
  });

  it('explains when nobody needs reviving', () => {
    const { s, root } = setup();
    s.onAction('down');                    // 復活
    s.onAction('confirm');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('大家都很有精神呢。');
    expect(root.querySelector('.slx-layer')).toBeNull();
  });

  it('revives a fallen member for gold', () => {
    const { game, s } = setup();
    game.state.party.roster.liz.hp = 0;
    s.onAction('down'); s.onAction('confirm');   // 復活
    s.onAction('confirm');                       // 莉茲
    expect(game.state.party.roster.liz.hp).toBeGreaterThan(0);
  });
});
```

`gate.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { GateScene } from './gate';

describe('GateScene', () => {
  it('lists reached floors and locks the rest', () => {
    const game = new Game(constRng(0.5), null);
    game.state.dungeon.reachedFloor = 2;
    const root = document.createElement('div');
    const s = new GateScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');
    s.onAction('confirm');                        // 選擇樓層
    const cards = [...root.querySelectorAll('.slx-floors [role=option]')];
    expect(cards.map((c) => c.getAttribute('aria-disabled'))).toEqual(['false', 'false', 'true']);
    expect(cards[0].querySelector('.slx-label')!.textContent).toBe('第 1 層 林間遺跡');
    s.onAction('confirm');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('下一階段');
  });
});
```

- [ ] **Step 2: 確認失敗**：找不到 `./inn`、`./gate`。

- [ ] **Step 3: 實作**

`text.zh-TW.ts` 的 `ui2` 增加：

```ts
    inn: {
      rest: (cost: number) => `休息（${cost} G）`, revive: '復活', ask: (cost: number) => `住一晚要 ${cost} G，要休息嗎？`,
      morning: '──隔天早上', saved: '已存檔。', saveFailed: '存檔失敗了……瀏覽器不允許儲存。',
      nobodyDown: '大家都很有精神呢。', revived: (name: string) => `${name} 醒過來了！`,
    },
    gate: { choose: '選擇樓層', floor: (n: number, name: string) => `第 ${n} 層 ${name}`, locked: '尚未到達', soon: '迷宮畫面在下一階段開放，敬請期待。' },
```

`ui2/scenes/inn.ts`：

```ts
import { CHARACTERS } from '../../data/characters';
import { T } from '../../data/text.zh-TW';
import { innCost, revive, reviveCost } from '../../engine/town';
import { el } from '../../ui/dom';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

export class InnScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number, private nightMs = 1200) { super(ctx, 'inn', cps); }

  protected commands(): MenuItem[] {
    return [{ id: 'rest', label: T.ui2.inn.rest(innCost(this.ctx.game.state.party)) }, { id: 'revive', label: T.ui2.inn.revive }];
  }

  protected onCommand(id: string): void {
    if (id === 'rest') this.askRest();
    else this.reviveList();
  }

  private askRest(): void {
    const cost = innCost(this.ctx.game.state.party);
    const box = confirmBox(T.ui2.inn.ask(cost), (yes) => {
      this.pop();
      if (!yes) return;
      const r = this.ctx.game.rest();
      if (!r.ok) { this.fail(r.reason); return; }
      void this.night();
    });
    box.view.menu.setCursor(1); box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  private async night(): Promise<void> {
    const veil = el('div', { class: 'slx-night', text: T.ui2.inn.morning });
    this.root.append(veil);
    await new Promise((r) => setTimeout(r, this.nightMs));
    veil.remove();
    this.refresh();
    const ok = this.ctx.game.notice === 'saved';
    this.ctx.game.notice = null;
    void this.say(ok ? T.ui2.inn.saved : T.ui2.inn.saveFailed, ok ? 'happy' : 'normal');
  }

  private reviveList(): void {
    const p = this.ctx.game.state.party;
    const down = p.recruited.filter((id) => p.roster[id].hp <= 0);
    if (!down.length) { void this.say(T.ui2.inn.nobodyDown); return; }
    const v = new MenuView(new Menu(down.map((id) => ({ id, label: CHARACTERS[id].name, right: `${reviveCost(p.roster[id].level)} G` }))), {
      pick: (it) => {
        const r = this.ctx.game.apply(revive(this.ctx.game.state, it.id as never));
        this.popAll();
        if (!r.ok) { this.fail(r.reason); return; }
        this.refresh();
        void this.say(T.ui2.inn.revived(it.label), 'happy');
      },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }
}
```

註：測試裡第一個案例在 `Dialogue` 為 `Infinity` 速度時，`say` 立即顯示全文，`waitFor` 等到夜晚計時結束（`nightMs` 測試傳 0）。

`ui2/scenes/gate.ts`：

```ts
import { FLOORS } from '../../data/floors';
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, win } from '../widgets';
import { FacilityScene } from './facility';

export class GateScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'gate', cps); }

  protected commands(): MenuItem[] {
    return [{ id: 'floors', label: T.ui2.gate.choose }];
  }

  protected onCommand(): void {
    const reached = this.ctx.game.state.dungeon.reachedFloor;
    const items = FLOORS.map((f) => ({
      id: String(f.id), label: T.ui2.gate.floor(f.id, f.name), disabled: f.id > reached,
      icon: this.ctx.art.has(art.bg(f.id)) ? art.bg(f.id) : undefined, right: f.id > reached ? T.ui2.gate.locked : '',
    }));
    const v = new MenuView(new Menu(items), {
      pick: () => { this.ctx.sfx.confirm(); void this.say(T.ui2.gate.soon); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    });
    this.push({ el: win('slx-floors', [v.el]), onAction: (a) => v.onAction(a) });
  }
}
```

`_starlantern-ui.scss` 追加：

```scss
.slx-night { position: absolute; inset: 0; display: grid; place-items: center; background: #000; color: $slx-ink; font-size: 16px; animation: slx-night 1.2s ease-in-out both; }
@keyframes slx-night { 0% { opacity: 0; } 25%, 75% { opacity: 1; } 100% { opacity: 0; } }
.slx-floors { left: 150px; top: 56px; width: 260px; }
.slx-floors .slx-opt { padding: 4px 6px 4px 16px; }
.slx-floors .slx-ico { width: 64px; height: 36px; object-fit: cover; }
@media (prefers-reduced-motion: reduce) { .slx-night { animation: none; } }
```

- [ ] **Step 4: 確認通過**：`npx vitest run src/scripts/games/starlantern/ui2` → 全過。

- [ ] **Step 5: Commit**：`feat(starlantern): inn with rest-and-save and revive, labyrinth gate floor cards`。

---

### Task 5: 接上城鎮、場景路由與 e2e

**Files:** Modify `ui2/scenes/town.ts`、`ui2/main.ts`、`ui2/scenes/town.test.ts`、`tests/e2e/starlantern-next.spec.ts`。

- [ ] **Step 1: 改寫城鎮測試（先失敗）**：`town.test.ts` 第二個案例改為「選冒險者公會 → `go` 被呼叫 `'guild'`；設定仍顯示製作中」：

```ts
  it('enters a facility, keeps settings as a not-yet line, and returns to title on cancel', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');               // greeting closes
    s.onAction('confirm');               // 冒險者公會
    expect(go).toHaveBeenCalledWith('guild');
    for (let i = 0; i < 4; i++) s.onAction('down');
    s.onAction('confirm');               // 設定
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('設定');
    s.onAction('confirm');
    s.onAction('cancel');
    expect(go).toHaveBeenCalledWith('title');
  });
```

Run → FAIL（目前選公會只會說話）。

- [ ] **Step 2: 實作**：`town.ts` 的 `pick` 改為接收 `id`：

```ts
    this.view = new MenuView(menu, { pick: (it) => this.pick(it.id, it.label), moved: () => this.ctx.sfx.cursor(), cancel: () => { this.ctx.sfx.cancel(); this.ctx.go('title'); } });
```

```ts
  private pick(id: string, label: string): void {
    this.ctx.sfx.confirm();
    if (id === 'guild' || id === 'shop' || id === 'inn' || id === 'gate') { this.ctx.go(id); return; }
    void this.talk.say('', T.ui2.town.soon(label));
  }
```

`main.ts` 的 `make` 改為：

```ts
  const make = (name: SceneName, ctx: Parameters<ConstructorParameters<typeof Router>[1]>[1]) => {
    switch (name) {
      case 'title': return new TitleScene(ctx);
      case 'town': return new TownScene(ctx);
      case 'guild': return new GuildScene(ctx);
      case 'shop': return new ShopScene(ctx);
      case 'inn': return new InnScene(ctx);
      case 'gate': return new GateScene(ctx);
    }
  };
```

並 import 四個場景。

- [ ] **Step 3: e2e 加一段（先跑看它失敗再實作完應通過）**

```ts
  test('walks through the four facilities with the keyboard', async ({ page }) => {
    await page.goto('/games/starlantern-next');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    const closeTalk = async () => { for (let i = 0; i < 4 && (await page.locator('.slx-talk').isVisible()); i++) await page.keyboard.press('z'); };
    await page.keyboard.press('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    await closeTalk();
    await page.keyboard.press('Enter');                       // 冒險者公會
    await expect(page.locator('.slx-guild')).toBeVisible();
    await closeTalk();
    await page.keyboard.press('Enter');                       // 編隊
    await expect(page.locator('.slx-formation [role=option]')).toHaveCount(5);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');                      // back to town
    await expect(page.locator('.slx-town')).toBeVisible();
    await closeTalk();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');                       // 旅館
    await expect(page.locator('.slx-inn')).toBeVisible();
    await closeTalk();
    await page.keyboard.press('Enter');                       // 休息
    await page.keyboard.press('ArrowUp');                     // 是
    await page.keyboard.press('Enter');
    await expect(page.locator('.slx-talk .slx-text')).toHaveText('已存檔。', { timeout: 5000 });
    expect(await page.evaluate(() => !!localStorage.getItem('starlantern-save'))).toBe(true);
    expect(await page.locator('#sl-screen button, #sl-screen select').count()).toBe(0);
  });
```

Run：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern-next.spec.ts --project=chromium` → 全過。

- [ ] **Step 4: 實機截圖**：headless 截公會（編隊視窗開著）、道具店（購買清單）、旅館、迷宮入口（樓層卡片）四張，逐張看版面是否重疊、字是否被切。

- [ ] **Step 5: 全套驗證**：`npx vitest run`、兩個 e2e spec、`tsc`、`!important`／`style=`／`.style.` 掃描。

- [ ] **Step 6: Commit**：`feat(starlantern): town enters the four facilities`。

---

### Task 6: 剩下 9 張設施美術（使用者核准）

- [ ] 剩下的 `scene-shop`、`scene-inn`、`scene-gate`、`npc-shop(-happy)`、`npc-inn(-happy)`、`npc-gate(-happy)` 已在背景生成（計畫三 A 樣張核准後啟動）。逐張用 Read 檢查與 QA；照計畫三 A 的方式暫時套進預覽頁截圖（截完移除並還原 manifest），做審核頁給使用者；核准後 `approve` → `publish --approved` → 全套測試 → Commit：`art(starlantern): facility scenes and npcs`。
