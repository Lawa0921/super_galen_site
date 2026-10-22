// 建置時由 astro.config.mjs 的 vite.define 注入；vitest 沒有 define，所以可能是 undefined
declare const __DELVE_BUILD__: string | undefined;
