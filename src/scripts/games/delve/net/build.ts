// build.ts — 建置版本號：房主與客人必須是同一次部署（協定／世界生成才一致）。
// Vercel 上是 commit SHA；本機與 vitest 是 'dev'。
export const DELVE_BUILD: string = typeof __DELVE_BUILD__ === 'string' ? __DELVE_BUILD__ : 'dev';
