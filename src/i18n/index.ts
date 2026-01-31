/**
 * i18n 核心模組
 * 管理多語言支援與翻譯功能
 */

import translations from './translations';

export const languages = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
} as const;

export type Language = keyof typeof languages;

export const defaultLang: Language = 'zh-TW';

// 重新匯出翻譯內容
export { translations };
export type { Translations } from './translations';

/**
 * 取得指定語言的翻譯物件
 */
export function getTranslations(lang: Language) {
  return translations[lang] || translations[defaultLang];
}

/**
 * 使用點記法路徑取得翻譯值
 * 例如：t('achievements.title', 'zh-TW') => '成就系統'
 */
export function t(key: string, lang: Language): string {
  const translation = getTranslations(lang);

  // 使用點記法分割路徑
  const keys = key.split('.');
  let result: unknown = translation;

  for (const k of keys) {
    if (result && typeof result === 'object' && k in result) {
      result = (result as Record<string, unknown>)[k];
    } else {
      // 找不到翻譯，回傳 key 本身作為 fallback
      console.warn(`Translation not found: ${key} (${lang})`);
      return key;
    }
  }

  return typeof result === 'string' ? result : key;
}

/**
 * 建立綁定特定語言的翻譯函數
 * 用於在組件中簡化翻譯呼叫
 */
export function useTranslations(lang: Language) {
  const translation = getTranslations(lang);

  return {
    /**
     * 完整的翻譯物件
     */
    all: translation,

    /**
     * 使用點記法路徑取得翻譯
     */
    t: (key: string) => t(key, lang),

    /**
     * 目前語言
     */
    lang,

    /**
     * 語言顯示名稱
     */
    langName: languages[lang],
  };
}

/**
 * 從 URL 路徑中提取語言代碼
 */
export function getLangFromUrl(url: URL): Language {
  const [, lang] = url.pathname.split('/');
  if (lang && lang in languages) {
    return lang as Language;
  }
  return defaultLang;
}

/**
 * 生成本地化路徑
 * 注意：預設語言 (zh-TW) 不使用語言前綴（prefixDefaultLocale: false）
 */
export function getLocalizedPath(path: string, lang: Language): string {
  // 移除開頭的斜線（如果有的話）
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // 移除可能存在的語言前綴
  const pathParts = cleanPath.split('/');
  let pathWithoutLang = cleanPath;
  if (pathParts[0] in languages) {
    pathParts.shift();
    pathWithoutLang = pathParts.join('/');
  }

  // 預設語言不加前綴
  if (lang === defaultLang) {
    return '/' + pathWithoutLang;
  }

  // 其他語言加上前綴
  return `/${lang}/${pathWithoutLang}`;
}

/**
 * 獲取替代語言版本的 URL（用於 SEO hreflang）
 */
export function getAlternateLanguages(currentPath: string): Array<{ lang: Language; url: string }> {
  return Object.keys(languages).map((lang) => ({
    lang: lang as Language,
    url: getLocalizedPath(currentPath, lang as Language),
  }));
}
