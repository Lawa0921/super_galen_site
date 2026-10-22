import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { includeInSitemap } from './sitemapFilter';

const readPage = (rel: string) =>
  readFileSync(path.resolve(__dirname, '../pages', rel), 'utf8');

describe('includeInSitemap', () => {
  it.each([
    'https://supergalen.com/games/starlantern',
    'https://supergalen.com/games/starlantern/',
    'https://supergalen.com/games/starlantern-next',
    'https://supergalen.com/games/starlantern-next/',
    '/games/starlantern/',
    '/en/games/starlantern/',
  ])('excludes unreleased 星燈迷宮 URL %s', (page) => {
    expect(includeInSitemap(page)).toBe(false);
  });

  it.each([
    'https://supergalen.com/',
    'https://supergalen.com/games/',
    'https://supergalen.com/games/tetris/',
    'https://supergalen.com/games/delve/',
    '/',
    '/blog/starlantern-notes/',
  ])('keeps public page %s', (page) => {
    expect(includeInSitemap(page)).toBe(true);
  });
});

describe('星燈迷宮 stays hidden until release', () => {
  it('has no card or link on the /games index', () => {
    expect(readPage('games/index.astro')).not.toMatch(/starlantern/i);
  });

  it.each(['games/starlantern.astro', 'games/starlantern-next.astro'])(
    '%s is marked noindex',
    (rel) => {
      expect(readPage(rel)).toMatch(/<meta\s+name="robots"\s+content="noindex"\s*\/?>/);
    },
  );
});
