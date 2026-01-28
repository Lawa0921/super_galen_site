/**
 * i18n 模組單元測試
 */
import { describe, it, expect } from 'vitest';
import {
  languages,
  defaultLang,
  getLangFromUrl,
  getLocalizedPath,
  getAlternateLanguages,
  t,
  useTranslations,
} from './index';

describe('i18n 語言配置', () => {
  it('應該有 5 種支援的語言', () => {
    expect(Object.keys(languages)).toHaveLength(5);
  });

  it('應該包含正確的語言代碼', () => {
    expect(languages).toHaveProperty('zh-TW');
    expect(languages).toHaveProperty('zh-CN');
    expect(languages).toHaveProperty('en');
    expect(languages).toHaveProperty('ja');
    expect(languages).toHaveProperty('ko');
  });

  it('預設語言應該是 zh-TW', () => {
    expect(defaultLang).toBe('zh-TW');
  });
});

describe('getLangFromUrl', () => {
  it('應該從 URL 中提取語言代碼', () => {
    const url = new URL('https://example.com/zh-TW/blog/post-1');
    expect(getLangFromUrl(url)).toBe('zh-TW');
  });

  it('應該支援所有語言', () => {
    expect(getLangFromUrl(new URL('https://example.com/en/'))).toBe('en');
    expect(getLangFromUrl(new URL('https://example.com/ja/blog'))).toBe('ja');
    expect(getLangFromUrl(new URL('https://example.com/ko/about'))).toBe('ko');
  });

  it('找不到語言時應該回傳預設語言', () => {
    const url = new URL('https://example.com/invalid/page');
    expect(getLangFromUrl(url)).toBe('zh-TW');
  });

  it('根路徑應該回傳預設語言', () => {
    const url = new URL('https://example.com/');
    expect(getLangFromUrl(url)).toBe('zh-TW');
  });
});

describe('getLocalizedPath', () => {
  it('應該為路徑添加語言前綴', () => {
    expect(getLocalizedPath('/blog/post-1', 'en')).toBe('/en/blog/post-1');
  });

  it('應該替換現有的語言前綴', () => {
    expect(getLocalizedPath('/zh-TW/blog/post-1', 'ja')).toBe('/ja/blog/post-1');
  });

  it('應該處理根路徑', () => {
    expect(getLocalizedPath('/', 'ko')).toBe('/ko/');
  });

  it('應該處理沒有開頭斜線的路徑', () => {
    expect(getLocalizedPath('blog/post-1', 'zh-CN')).toBe('/zh-CN/blog/post-1');
  });
});

describe('getAlternateLanguages', () => {
  it('應該回傳所有語言版本的 URL', () => {
    const alternatives = getAlternateLanguages('/blog/post-1');
    expect(alternatives).toHaveLength(5);
    expect(alternatives.map((a) => a.lang)).toEqual(['zh-TW', 'zh-CN', 'en', 'ja', 'ko']);
  });

  it('每個替代語言都應該有正確的 URL', () => {
    const alternatives = getAlternateLanguages('/blog/post-1');
    const enAlt = alternatives.find((a) => a.lang === 'en');
    expect(enAlt?.url).toBe('/en/blog/post-1');
  });
});

describe('t() 翻譯函數', () => {
  it('應該能取得翻譯值', () => {
    const result = t('common.confirm', 'zh-TW');
    expect(result).toBe('確認');
  });

  it('應該支援多層巢狀路徑', () => {
    const result = t('achievements.title', 'zh-TW');
    expect(result).toBe('成就系統');
  });

  it('找不到翻譯時應該回傳 key', () => {
    const result = t('nonexistent.key', 'zh-TW');
    expect(result).toBe('nonexistent.key');
  });

  it('應該支援不同語言', () => {
    expect(t('common.confirm', 'en')).toBe('Confirm');
    expect(t('common.confirm', 'ja')).toBe('確認');
  });
});

describe('useTranslations()', () => {
  it('應該回傳翻譯工具物件', () => {
    const { t: translate, lang, langName, all } = useTranslations('zh-TW');

    expect(lang).toBe('zh-TW');
    expect(langName).toBe('繁體中文');
    expect(typeof translate).toBe('function');
    expect(all).toBeDefined();
  });

  it('t 函數應該綁定到指定語言', () => {
    const { t: translate } = useTranslations('en');
    expect(translate('common.cancel')).toBe('Cancel');
  });

  it('all 應該包含完整翻譯物件', () => {
    const { all } = useTranslations('zh-TW');
    expect(all.common.confirm).toBe('確認');
    expect(all.site.title).toBe("SuperGalen's Dungeon");
  });
});
