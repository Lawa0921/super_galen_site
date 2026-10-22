// Pages that must stay out of sitemap.xml until they are released.
// 星燈迷宮 (/games/starlantern, /games/starlantern-next) stays hidden until the
// whole game is finished: no /games card, noindex, and no sitemap entry.
const HIDDEN_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/starlantern(?:[-/]|$)/i;

const toPathname = (page: string): string => {
  try {
    return new URL(page, 'https://supergalen.com').pathname;
  } catch {
    return page;
  }
};

export function includeInSitemap(page: string): boolean {
  return !HIDDEN_PATH.test(toPathname(page));
}
