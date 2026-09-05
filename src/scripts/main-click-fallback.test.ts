import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publicScripts = resolve(process.cwd(), 'public/scripts');

function loadMainScript(): void {
  const source = readFileSync(resolve(publicScripts, 'main.js'), 'utf8');
  new Function(source).call(window);
}

describe('main.js 無 GameState 時的 click fallback', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="hp-bar resource-bar"><div class="bar-fill"></div><span class="bar-text"></span></div>
      <button class="btn" id="fallback-click">點擊</button>
    `;
    delete window.GameState;
    window.DebugUtils = { isDevelopment: () => false } as never;
    window.unifiedWalletManager = {} as never;
    globalThis.IntersectionObserver = class {
      observe(): void {}
    } as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('仍保留本地資源 fallback，click 會更新 HP 顯示', () => {
    loadMainScript();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const barText = document.querySelector('.hp-bar .bar-text')!;
    expect(barText.textContent).toBe('1000/1000');

    document.getElementById('fallback-click')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(barText.textContent).not.toBe('1000/1000');
  });
});
