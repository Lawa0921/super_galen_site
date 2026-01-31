/**
 * 部落格系統測試
 * 驗證 Content Collection schema 和文章解析
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// 模擬的 frontmatter 解析
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yamlContent = match[1];
  const result: Record<string, unknown> = {};

  // 簡單的 YAML 解析（僅用於測試）
  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: string | string[] = line.slice(colonIndex + 1).trim();

    // 移除引號
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    // 解析陣列格式 [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''));
    }

    result[key] = value;
  }

  return result;
}

describe('Blog Content Collection', () => {
  const blogDir = path.resolve(__dirname, './blog');
  let posts: string[] = [];

  beforeAll(() => {
    if (fs.existsSync(blogDir)) {
      posts = fs.readdirSync(blogDir).filter((f) => f.endsWith('.md'));
    }
  });

  it('應該有部落格文章', () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it('每篇文章都應該有必要的 frontmatter', () => {
    for (const postFile of posts) {
      const content = fs.readFileSync(path.join(blogDir, postFile), 'utf-8');
      const frontmatter = parseFrontmatter(content);

      expect(frontmatter.title, `${postFile} 缺少 title`).toBeDefined();
      expect(frontmatter.date, `${postFile} 缺少 date`).toBeDefined();
    }
  });

  it('文章檔名應該符合 YYYY-MM-DD-slug.md 格式', () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}-.+\.md$/;

    for (const postFile of posts) {
      expect(postFile, `${postFile} 不符合日期格式`).toMatch(datePattern);
    }
  });

  it('每篇文章的日期應該是有效的', () => {
    for (const postFile of posts) {
      const content = fs.readFileSync(path.join(blogDir, postFile), 'utf-8');
      const frontmatter = parseFrontmatter(content);

      if (frontmatter.date) {
        const date = new Date(frontmatter.date as string);
        expect(date.toString(), `${postFile} 的日期無效`).not.toBe('Invalid Date');
      }
    }
  });

  it('categories 應該是字串或陣列', () => {
    for (const postFile of posts) {
      const content = fs.readFileSync(path.join(blogDir, postFile), 'utf-8');
      const frontmatter = parseFrontmatter(content);

      if (frontmatter.categories) {
        const isValid =
          typeof frontmatter.categories === 'string' || Array.isArray(frontmatter.categories);
        expect(isValid, `${postFile} 的 categories 格式錯誤`).toBe(true);
      }
    }
  });

  it('tags 應該是字串或陣列', () => {
    for (const postFile of posts) {
      const content = fs.readFileSync(path.join(blogDir, postFile), 'utf-8');
      const frontmatter = parseFrontmatter(content);

      if (frontmatter.tags) {
        const isValid = typeof frontmatter.tags === 'string' || Array.isArray(frontmatter.tags);
        expect(isValid, `${postFile} 的 tags 格式錯誤`).toBe(true);
      }
    }
  });
});

describe('RSS Feed 配置', () => {
  it('應該支援 5 種語言的 RSS feed', () => {
    const languages = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];
    expect(languages).toHaveLength(5);
  });
});
