import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * i18n-manager.js 是掛在 window 上的傳統 IIFE，無法 import。
 * 這裡以假 window/document 注入執行原始碼，驗證語言檔的 fetch URL 策略：
 * 正式環境必須可被瀏覽器快取（不帶 cache-busting 參數），開發環境保留強制重載。
 */
const source = readFileSync(
  resolve(process.cwd(), 'public/scripts/i18n-manager.js'),
  'utf-8'
);

function loadI18nManager(hostname: string) {
  const win: Record<string, unknown> = {
    location: { pathname: '/en/', hostname },
  };
  const doc = {
    readyState: 'loading',
    addEventListener: () => {},
  };
  const storage = { getItem: () => null, setItem: () => {} };
  const nav = { language: 'en-US' };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ site: { title: 'test' } }),
  }));

  new Function('window', 'document', 'localStorage', 'navigator', 'fetch', source)(
    win, doc, storage, nav, fetchMock
  );

  return { i18n: win.i18n as { loadLanguage: (lang: string) => Promise<unknown> }, fetchMock };
}

describe('i18n-manager 語言檔快取策略', () => {
  it('正式環境 fetch 不帶 cache-busting 參數（讓瀏覽器/CDN 可快取）', async () => {
    const { i18n, fetchMock } = loadI18nManager('supergalen.com');
    await i18n.loadLanguage('en');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/assets/i18n/en.json');
  });

  it('開發環境（localhost）保留 cache-busting 強制重載', async () => {
    const { i18n, fetchMock } = loadI18nManager('localhost');
    await i18n.loadLanguage('en');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^\/assets\/i18n\/en\.json\?t=\d+$/);
  });
});
