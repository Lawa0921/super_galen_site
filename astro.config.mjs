// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { includeInSitemap } from './src/utils/sitemapFilter';
import { isExcludedFromSitemap, listGuildTranslations } from './src/i18n/seo.ts';

const guildTranslations = listGuildTranslations();

// https://astro.build/config
export default defineConfig({
  // 正式網域為 www（apex 會 308 轉到 www）；canonical / hreflang / sitemap 都以此為準
  site: 'https://www.supergalen.com',
  output: 'static',
  adapter: vercel(),
  // Keep the development toolbar from covering fixed game controls and HUDs.
  devToolbar: { enabled: false },

  // i18n 路由配置
  i18n: {
    defaultLocale: 'zh-TW',
    locales: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'],
    routing: {
      prefixDefaultLocale: false, // 預設語言不加前綴，與 Jekyll 一致
    },
  },

  // /zh-TW/* 與無前綴頁內容相同：301 轉址寫在 vercel.json（Astro 產生的轉址規則不吃結尾斜線）

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
          // ponytail: 函式形式（Rolldown/Astro 7 不接受物件形式）；把 ethers 收進 web3 chunk
          manualChunks(id) {
            if (id.includes('node_modules/ethers')) return 'web3';
          },
        },
      },
    },
  },

  // 整合
  integrations: [
    sitemap({
      // 未發布的星燈迷宮、未翻譯的語系頁與 /privacy/ 等 noindex 頁不進 sitemap
      filter: (page) => includeInSitemap(page) && !isExcludedFromSitemap(page, guildTranslations),
    }),
  ],

  // 建構輸出
  build: {
    assets: 'assets',
    inlineStylesheets: 'auto',
  },
});
