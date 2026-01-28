/**
 * Content Collections 配置
 * 定義部落格文章的 schema
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 自定義 transform 處理 string | string[] 的情況
const stringOrArray = z.union([z.string(), z.array(z.string())]).transform((val) => {
  if (typeof val === 'string') {
    return val.split(',').map((s) => s.trim());
  }
  return val;
});

const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    // 支援 string 或 array 格式
    categories: stringOrArray.optional().default([]),
    tags: stringOrArray.optional().default([]),
    author: z.string().default('Galen'),
    // Jekyll 相容欄位
    layout: z.string().optional(),
  }),
});

export const collections = {
  blog: blogCollection,
};
