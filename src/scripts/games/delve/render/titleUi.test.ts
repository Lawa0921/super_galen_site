// titleUi.test.ts — 標題面板（DOM，happy-dom）：加入朋友的世界面板（parent = worlds）、角色列的「待同步」徽章（co-op C1）
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TitleUi, type TitleHandlers } from './titleUi';
import { createCharacter } from '../save/character';
import { previewOf, type CharacterMeta } from '../save/storage';
import { normalizeAppearance } from '../engine/appearance';
import type { SoundManager } from '../audio/SoundManager';

const quiet = { ensure() {}, uiMove() {}, uiDice() {}, uiBack() {}, uiConfirm() {} } as unknown as SoundManager;

function handlers(over: Partial<TitleHandlers> = {}): TitleHandlers {
  const nop = (): void => {};
  return {
    onContinue: nop, onImport: nop, onStart: nop, onPickCharacter: nop, onCreateCharacter: async () => null,
    onDeleteCharacter: nop, onPickWorld: nop, onCreateWorld: nop, onDeleteWorld: nop, onExportWorld: nop,
    onHelp: nop, onPressStart: nop, onLook: nop, onBody: nop, onJoin: nop, ...over,
  };
}

function mount(h: TitleHandlers): { root: HTMLElement; ui: TitleUi } {
  document.body.innerHTML = `
    <main id="delve-root" data-phase="title" data-title="menu">
      <section id="delve-title">
        <nav id="delve-tmenu"><button class="delve-ti" id="delve-start" type="button">開始遊戲</button></nav>
        <p id="delve-title-msg"></p>
        <section class="delve-tpanel" id="delve-charpanel" data-tpanel="chars" hidden>
          <div class="delve-tlist" id="delve-charlist"></div>
          <button id="delve-chars-back" type="button" data-nav>返回</button>
        </section>
        <section class="delve-tpanel" id="delve-worldpanel" data-tpanel="worlds" hidden>
          <div class="delve-tlist" id="delve-worldlist"></div>
          <button id="delve-worlds-back" type="button" data-nav>回角色列表</button>
          <button id="delve-new" type="button" data-nav>新世界</button>
          <button class="delve-btn" id="delve-join-open" type="button" data-nav>加入朋友的世界</button>
        </section>
        <section class="delve-tpanel" data-tpanel="join" id="delve-joinpanel" hidden role="dialog">
          <input class="delve-input" id="delve-room" maxlength="5" autocomplete="off" placeholder="房號">
          <button class="delve-btn" id="delve-join" type="button">加入</button>
          <p class="delve-msg" id="delve-join-msg"></p>
          <button id="delve-join-back" type="button">返回</button>
        </section>
        <button id="delve-zp-dec" type="button"></button><button id="delve-zp-inc" type="button"></button>
      </section>
    </main>`;
  const root = document.getElementById('delve-root')!;
  return { root, ui: new TitleUi(root, h, { reducedMotion: true, storage: undefined, sound: quiet, peaceful: false }) };
}

const esc = (root: HTMLElement): void => { root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); };
const panel = (id: string): HTMLElement => document.getElementById(id)!;

function meta(nick: string, pendingWorld?: string): CharacterMeta {
  const c = createCharacter(nick, normalizeAppearance(undefined), 1);
  return { id: c.id, nick, savedAt: 1, rev: 1, ...previewOf(c), ...(pendingWorld ? { pendingWorld } : {}) };
}

describe('TitleUi：加入朋友的世界', () => {
  let onJoin: Mock<(room: string) => void>;
  let m: ReturnType<typeof mount>;
  beforeEach(() => {
    onJoin = vi.fn<(room: string) => void>();
    m = mount(handlers({ onJoin: (r) => onJoin(r) }));
  });

  it('join 面板：Esc 回到 worlds', () => {
    m.ui.showPanel('worlds');
    panel('delve-join-open').click();
    expect(m.root.dataset.tpanel).toBe('join');
    expect(panel('delve-joinpanel').hidden).toBe(false);
    expect(panel('delve-worldpanel').hidden).toBe(true);
    expect(document.activeElement).toBe(panel('delve-room'));
    esc(m.root);
    expect(m.root.dataset.tpanel).toBe('worlds');
    expect(panel('delve-joinpanel').hidden).toBe(true);
    expect(panel('delve-worldpanel').hidden).toBe(false);
    // 焦點回到打開它的按鈕
    expect(document.activeElement).toBe(panel('delve-join-open'));
  });

  it('打開時清掉上次的房號與訊息；按「加入」或 Enter → onJoin(原始輸入)', () => {
    m.ui.showPanel('worlds');
    (panel('delve-room') as HTMLInputElement).value = 'OLD';
    panel('delve-join-msg').textContent = '舊訊息';
    panel('delve-join-open').click();
    expect((panel('delve-room') as HTMLInputElement).value).toBe('');
    expect(panel('delve-join-msg').textContent).toBe('');
    (panel('delve-room') as HTMLInputElement).value = ' abcde ';
    panel('delve-join').click();
    expect(onJoin).toHaveBeenLastCalledWith(' abcde ');
    panel('delve-room').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onJoin).toHaveBeenCalledTimes(2);
  });

  it('setJoinMsg 寫進 #delve-join-msg', () => {
    m.ui.setJoinMsg('房號是 5 個英數字');
    expect(panel('delve-join-msg').textContent).toBe('房號是 5 個英數字');
  });
});

describe('TitleUi：角色列', () => {
  it('pendingWorld 的角色列有待同步徽章', () => {
    const m = mount(handlers());
    m.ui.setCharacters([meta('甲', 'w-1'), meta('乙')]);
    const rows = [...document.querySelectorAll<HTMLElement>('#delve-charlist .delve-char-row')];
    expect(rows).toHaveLength(2);
    const badge = rows[0].querySelector('span.delve-trow-badge');
    expect(badge?.textContent).toBe('待同步');
    expect(rows[1].querySelector('.delve-trow-badge')).toBeNull();
  });
});
