/**
 * SEO 索引規則單元測試
 * 未翻譯的語系頁（內容仍是繁中來源）不應被索引，也不應進 sitemap
 */
import { describe, it, expect } from 'vitest';
import { isUntranslatedLocalePath, guildTranslationKey, guildHeadTags } from './seo';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from './translations';

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

describe('首頁 meta description 在地化', () => {
  const OLD = [
    '這是我的個人部落格，展示作品集、履歷和有趣的互動專案',
    '這是我的個人部落格，展示作品集、履歷和有趣的互動专案',
    'My personal blog showcasing portfolio, resume, and interactive projects',
    'ポートフォリオ、履歴書、インタラクティブなプロジェクトを紹介する個人ブログ',
    '포트폴리오, 이력서, 인터랙티브 프로젝트를 소개하는 개인 블로그',
  ];
  const RANGE: Record<string, [number, number]> = {
    en: [140, 160],
    ja: [70, 100],
    'zh-CN': [70, 100],
    ko: [80, 110],
  };
  const langs = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const;
  const fromTs = (l: (typeof langs)[number]) => translations[l].site.description;
  const fromJson = (l: string) =>
    JSON.parse(readFileSync(resolve(process.cwd(), `public/assets/i18n/${l}.json`), 'utf8')).site.description as string;

  it('ts 與 json 同步', () => {
    for (const l of langs) expect(fromJson(l)).toBe(fromTs(l));
  });

  it('五語系互不相同且皆非舊文案', () => {
    const all = langs.map(fromTs);
    expect(new Set(all).size).toBe(langs.length);
    for (const d of all) expect(OLD).not.toContain(d);
  });

  it('長度落在各語系建議範圍', () => {
    for (const [l, [min, max]] of Object.entries(RANGE)) {
      const len = [...fromTs(l as (typeof langs)[number])].length;
      expect(len, `${l} 長度 ${len}`).toBeGreaterThanOrEqual(min);
      expect(len, `${l} 長度 ${len}`).toBeLessThanOrEqual(max);
    }
  });

  it('保留品牌名與核心關鍵字', () => {
    for (const l of langs) {
      const d = fromTs(l);
      expect(d).toMatch(/Galen/);
      expect(d).toMatch(/AI/);
      expect(d).toMatch(/Codex/);
    }
  });
});
