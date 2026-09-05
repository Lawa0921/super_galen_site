import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publicScripts = resolve(process.cwd(), 'public/scripts');

function loadPublicScript(name: string): void {
  const source = readFileSync(resolve(publicScripts, name), 'utf8');
  new Function(source).call(window);
}

describe('首頁 HP click 消耗', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="gold-display"><span id="gold-amount"></span></div>
      <div class="sp-bar resource-bar"><div class="bar-fill"></div><span class="bar-text"></span></div>
      <div class="hp-bar resource-bar"><div class="bar-fill"></div><span class="bar-text"></span></div>
      <button class="tab-btn" data-tab="status">第一個按鈕</button>
      <button class="tab-btn" data-tab="skills">第二個按鈕</button>
      <button id="language-current">語言</button>
      <div class="tab-panel" id="status-tab"></div>
      <div class="tab-panel" id="skills-tab"></div>
      <div id="inventory-tab"></div>
    `;

    // i18n-manager.js 會在語言按鈕上阻止冒泡，main 的 target listener 仍須扣一次。
    document.getElementById('language-current')!.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    window.i18n = { currentTranslations: { inventory: { items: {} } } } as never;
    window.LazyLoader = { loadTabModule: vi.fn(() => Promise.resolve()) } as never;
    window.initSummonSystem = vi.fn();
    window.DebugUtils = { isDevelopment: () => false } as never;
    window.unifiedWalletManager = {} as never;
    globalThis.IntersectionObserver = class {
      observe(): void {}
    } as never;

    loadPublicScript('gamestate.js');
    window.GameState.setHP(1000);
    window.GameState.setSP(0);
    window.GameState.setGold(100000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('重複初始化後，兩次快速不同 click 各只消耗一次 HP', async () => {
    const resourcePopup = vi.spyOn(window.GameState, 'createResourceDamagePopup').mockImplementation(() => {});
    const criticalPopup = vi.spyOn(window.GameState, 'createCriticalDamagePopup').mockImplementation(() => {});

    loadPublicScript('inventory.js');
    loadPublicScript('main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.runAllTicks();

    // 模擬初始化流程重入；同一頁仍只能保留一個全域 click handler。
    window.initGoldSystem();

    document.querySelector<HTMLButtonElement>('[data-tab="status"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-tab="skills"]')!.click();
    document.getElementById('language-current')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(resourcePopup.mock.calls.length + criticalPopup.mock.calls.length).toBe(3);
    expect(window.GameState.getState().gold).toBeGreaterThan(100000);
  });
});
