/**
 * RSS Feed 生成
 * 為每種語言生成獨立的 RSS feed
 */
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { languages, type Language } from '@i18n/index';

const supportedLangs = Object.keys(languages) as Language[];

export function getStaticPaths() {
  return supportedLangs.map((lang) => ({
    params: { lang },
  }));
}

export async function GET(context: APIContext) {
  const lang = context.params.lang as Language;

  // 取得所有文章並按日期排序
  const posts = await getCollection('blog');
  const sortedPosts = posts.sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
  );

  // 語言對應的標題
  const titles: Record<Language, string> = {
    'zh-TW': "SuperGalen's Dungeon - 冒險日誌",
    'zh-CN': "SuperGalen's Dungeon - 冒险日志",
    'en': "SuperGalen's Dungeon - Adventure Journal",
    'ja': "SuperGalen's Dungeon - 冒険日記",
    'ko': "SuperGalen's Dungeon - 모험 일지",
  };

  const descriptions: Record<Language, string> = {
    'zh-TW': 'RPG 風格技術部落格 - 全端開發、區塊鏈與遊戲化介面',
    'zh-CN': 'RPG 风格技术博客 - 全栈开发、区块链与游戏化界面',
    'en': 'RPG-style tech blog - Full-stack development, blockchain & gamified interfaces',
    'ja': 'RPG スタイル技術ブログ - フルスタック開発、ブロックチェーン＆ゲーム化インターフェース',
    'ko': 'RPG 스타일 기술 블로그 - 풀스택 개발, 블록체인 및 게이미피케이션 인터페이스',
  };

  return rss({
    title: titles[lang],
    description: descriptions[lang],
    site: context.site!,
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description || '',
      link: `/${lang}/blog/${post.id}/`,
      categories: post.data.categories,
      author: post.data.author || 'Galen',
    })),
    customData: `<language>${lang}</language>`,
  });
}
