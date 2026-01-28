/**
 * Content Collections 配置
 * 定義部落格文章的 schema
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    categories: z.array(z.string()).optional().default([]),
    tags: z.array(z.string()).optional().default([]),
    author: z.string().default('Galen'),
    // Jekyll 相容欄位
    layout: z.string().optional(),
  }),
});

export const collections = {
  blog: blogCollection,
};
