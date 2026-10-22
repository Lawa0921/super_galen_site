/**
 * SEO 索引規則
 * - blog collection 只有一份（繁中）來源，/[lang]/journal/[slug]/ 只翻譯外框，文章本體未翻譯
 * - guild 成員頁只有存在 `member.lang.html` 時才是翻譯版，否則直接沿用繁中來源
 * 未翻譯的語系頁加 noindex，並從 sitemap 排除（見 astro.config.mjs）
 */
import fs from 'node:fs';
import path from 'node:path';

const NON_DEFAULT_LANGS = ['zh-CN', 'en', 'ja', 'ko'] as const;
const LANG_GROUP = NON_DEFAULT_LANGS.join('|');
const JOURNAL_POST = new RegExp(`^/(${LANG_GROUP})/journal/[^/]+/?$`);
const GUILD_MEMBER = new RegExp(`^/(${LANG_GROUP})/guild/([^/]+)/?$`);

export function guildTranslationKey(lang: string, member: string): string {
  return `${lang}/${member}`;
}

/** 掃描 src/content/guild 中的 `member.lang.html`，回傳已翻譯的 `lang/member` 集合 */
export function listGuildTranslations(guildDir = path.join(process.cwd(), 'src/content/guild')): Set<string> {
  const keys = new Set<string>();
  for (const file of fs.readdirSync(guildDir)) {
    const match = file.match(new RegExp(`^(.+)\\.(${LANG_GROUP})\\.html$`));
    if (match) keys.add(guildTranslationKey(match[2], match[1]));
  }
  return keys;
}

/** 判斷語系頁的內容是否其實未翻譯（應 noindex、排除於 sitemap） */
export function isUntranslatedLocalePath(urlOrPath: string, guildTranslations: Set<string>): boolean {
  const pathname = urlOrPath.startsWith('http') ? new URL(urlOrPath).pathname : urlOrPath;
  if (JOURNAL_POST.test(pathname)) return true;
  const guild = pathname.match(GUILD_MEMBER);
  if (guild) return !guildTranslations.has(guildTranslationKey(guild[1], guild[2]));
  return false;
}

/** 公開但 noindex 的獨立頁（例：隱私權政策），不進 sitemap */
const NOINDEX_PAGES = ['/privacy/'];

/** sitemap filter：未翻譯語系頁與 NOINDEX_PAGES 皆排除 */
export function isExcludedFromSitemap(urlOrPath: string, guildTranslations: Set<string>): boolean {
  const pathname = urlOrPath.startsWith('http') ? new URL(urlOrPath).pathname : urlOrPath;
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return NOINDEX_PAGES.includes(normalized) || isUntranslatedLocalePath(pathname, guildTranslations);
}

/**
 * 公會成員頁（原始 HTML）要注入 <head> 的 SEO 標籤
 * - 未翻譯：noindex（內容即繁中來源）
 * - 其餘：自我 canonical；有翻譯版時輸出 hreflang（zh-TW 與 x-default 為無前綴網址）
 */
export function guildHeadTags(options: {
  siteUrl: string;
  member: string;
  lang: string;
  translatedLangs: string[];
  untranslated: boolean;
}): string {
  const { siteUrl, member, lang, translatedLangs, untranslated } = options;
  if (untranslated) return '<meta name="robots" content="noindex, follow">';
  const urlFor = (code: string) =>
    new URL(code === 'zh-TW' ? `/guild/${member}/` : `/${code}/guild/${member}/`, siteUrl).toString();
  const tags = [`<link rel="canonical" href="${urlFor(lang)}">`];
  if (translatedLangs.length > 0) {
    for (const code of ['zh-TW', ...translatedLangs]) {
      tags.push(`<link rel="alternate" hreflang="${code}" href="${urlFor(code)}">`);
    }
    tags.push(`<link rel="alternate" hreflang="x-default" href="${urlFor('zh-TW')}">`);
  }
  return tags.join('\n  ');
}
