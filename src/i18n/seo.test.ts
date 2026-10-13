/**
 * SEO 索引規則單元測試
 * 未翻譯的語系頁（內容仍是繁中來源）不應被索引，也不應進 sitemap
 */
import { describe, it, expect } from 'vitest';
import { isUntranslatedLocalePath, guildTranslationKey, guildHeadTags } from './seo';

const translated = new Set([guildTranslationKey('ja', 'tyou')]);

describe('isUntranslatedLocalePath', () => {
  it('非預設語系的日誌文章一律視為未翻譯（blog collection 沒有各語系版本）', () => {
    expect(isUntranslatedLocalePath('/en/journal/2026-07-18-gpt56-codex-guide/', translated)).toBe(true);
    expect(isUntranslatedLocalePath('/zh-CN/journal/some-post/', translated)).toBe(true);
  });

  it('沒有翻譯檔的公會成員語系頁視為未翻譯', () => {
    expect(isUntranslatedLocalePath('/en/guild/tyou/', translated)).toBe(true);
    expect(isUntranslatedLocalePath('/ko/guild/naomiao77/', translated)).toBe(true);
  });

  it('有翻譯檔（member.lang.html）的公會成員語系頁可索引', () => {
    expect(isUntranslatedLocalePath('/ja/guild/tyou/', translated)).toBe(false);
  });

  it('預設語系與 UI 已翻譯的列表 / 首頁可索引', () => {
    for (const p of ['/', '/journal/x/', '/guild/tyou/', '/en/', '/ja/journal/', '/ko/guild/', '/games/']) {
      expect(isUntranslatedLocalePath(p, translated)).toBe(false);
    }
  });

  it('接受完整 URL 與不含結尾斜線的路徑', () => {
    expect(isUntranslatedLocalePath('https://www.supergalen.com/en/journal/x/', translated)).toBe(true);
    expect(isUntranslatedLocalePath('/en/guild/tyou', translated)).toBe(true);
  });
});

describe('guildHeadTags', () => {
  const siteUrl = 'https://www.supergalen.com';

  it('未翻譯頁只輸出 noindex', () => {
    expect(guildHeadTags({ siteUrl, member: 'tyou', lang: 'en', translatedLangs: ['ja'], untranslated: true }))
      .toBe('<meta name="robots" content="noindex, follow">');
  });

  it('沒有翻譯版的預設語系頁只有自我 canonical', () => {
    const tags = guildHeadTags({ siteUrl, member: 'vic', lang: 'zh-TW', translatedLangs: [], untranslated: false });
    expect(tags).toBe('<link rel="canonical" href="https://www.supergalen.com/guild/vic/">');
  });

  it('有翻譯版時輸出完整 hreflang，x-default 指向無前綴網址', () => {
    const tags = guildHeadTags({ siteUrl, member: 'tyou', lang: 'ja', translatedLangs: ['ja'], untranslated: false });
    expect(tags).toContain('<link rel="canonical" href="https://www.supergalen.com/ja/guild/tyou/">');
    expect(tags).toContain('hreflang="zh-TW" href="https://www.supergalen.com/guild/tyou/"');
    expect(tags).toContain('hreflang="ja" href="https://www.supergalen.com/ja/guild/tyou/"');
    expect(tags).toContain('hreflang="x-default" href="https://www.supergalen.com/guild/tyou/"');
    expect(tags).not.toContain('/zh-TW/');
  });
});
