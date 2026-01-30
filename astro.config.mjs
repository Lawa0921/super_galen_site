// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://supergalen.com',
  output: 'static',
  adapter: vercel(),

  // i18n 路由配置
  i18n: {
    defaultLocale: 'zh-TW',
    locales: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'],
    routing: {
      prefixDefaultLocale: false, // 預設語言不加前綴，與 Jekyll 一致
    },
  },

  // Vite 配置
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'web3': ['ethers'],
          },
        },
      },
    },
  },

  // 整合
  integrations: [sitemap()],

  // 建構輸出
  build: {
    assets: 'assets',
    inlineStylesheets: 'auto',
  },
});
