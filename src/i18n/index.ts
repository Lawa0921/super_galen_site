/**
 * i18n 核心模組
 * 管理多語言支援與翻譯功能
 */

export const languages = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
} as const;

export type Language = keyof typeof languages;

export const defaultLang: Language = 'zh-TW';

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
 */
export function getLocalizedPath(path: string, lang: Language): string {
  // 移除開頭的斜線（如果有的話）
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // 檢查路徑是否已經包含語言前綴
  const pathParts = cleanPath.split('/');
  if (pathParts[0] in languages) {
    // 替換語言前綴
    pathParts[0] = lang;
    return '/' + pathParts.join('/');
  }

  // 添加語言前綴
  return `/${lang}/${cleanPath}`;
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
