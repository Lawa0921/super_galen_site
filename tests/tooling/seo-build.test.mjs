/**
 * SEO 建置產物檢查（需先 `npm run build`；或用 `npm run test:seo` 一次跑完）
 * 檢查 dist/client 的 HTML / sitemap / robots 與 .vercel/output/config.json 的轉址
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(root, 'dist', 'client');
const ORIGIN = 'https://www.supergalen.com';
const NON_DEFAULT = ['zh-CN', 'en', 'ja', 'ko'];
const skip = existsSync(join(dist, 'index.html')) ? false : 'dist/client 不存在，請先 npm run build';

function walkHtml(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (name === 'index.html') out.push(full);
  }
  return out;
}

/** dist 檔案 → 網址路徑（/en/journal/x/） */
function toUrlPath(file) {
  const rel = relative(dist, file).split(sep).join('/');
  return '/' + rel.replace(/index\.html$/, '');
}

/** 網址路徑 → dist 中的 index.html；不存在回傳 null */
function htmlFor(urlPath) {
  const file = join(dist, ...urlPath.split('/').filter(Boolean), 'index.html');
  return existsSync(file) ? file : null;
}

const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
const canonicalOf = (html) => attr((html.match(/<link rel="canonical"[^>]*>/) || [''])[0], 'href');
const alternatesOf = (html) =>
  (html.match(/<link rel="alternate" hreflang="[^"]*"[^>]*>/g) || []).map((tag) => ({
    hreflang: attr(tag, 'hreflang'),
    href: attr(tag, 'href'),
  }));
const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);

const pages = skip ? [] : walkHtml(dist).map((file) => ({ file, path: toUrlPath(file), html: readFileSync(file, 'utf8') }));
const sitemapLocs = skip
  ? []
  : readdirSync(dist)
      .filter((f) => /^sitemap-\d+\.xml$/.test(f))
      .flatMap((f) => [...readFileSync(join(dist, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const blogIds = readdirSync(join(root, 'src', 'content', 'blog'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3));
const guildDir = join(root, 'src', 'content', 'guild');
const guildTranslations = new Set(
  readdirSync(guildDir)
    .map((f) => f.match(/^(.+)\.(zh-CN|en|ja|ko)\.html$/))
    .filter(Boolean)
    .map((m) => `${m[2]}/${m[1]}`),
);

describe('SEO build output', { skip }, () => {
  test('robots.txt 指向 www sitemap 且沒有 Crawl-delay', () => {
    const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
    assert.match(robots, new RegExp(`^Sitemap: ${ORIGIN}/sitemap-index\\.xml$`, 'm'));
    assert.doesNotMatch(robots, /Crawl-delay/i);
  });

  test('sitemap 全部使用 www 正式網域', () => {
    const index = readFileSync(join(dist, 'sitemap-index.xml'), 'utf8');
    for (const [, loc] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) assert.ok(loc.startsWith(`${ORIGIN}/`), loc);
    assert.ok(sitemapLocs.length > 0);
    const bad = sitemapLocs.filter((loc) => !loc.startsWith(`${ORIGIN}/`));
    assert.deepEqual(bad, []);
  });

  test('canonical / og:url / JSON-LD 只用 www 正式網域', () => {
    const bad = [];
    for (const { path, html } of pages) {
      const canonical = canonicalOf(html);
      if (canonical && canonical !== `${ORIGIN}${path}`) bad.push(`${path} canonical=${canonical}`);
      const og = attr((html.match(/<meta property="og:url"[^>]*>/) || [''])[0], 'content');
      if (og && og !== `${ORIGIN}${path}`) bad.push(`${path} og:url=${og}`);
      for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        if (json.includes('https://supergalen.com')) bad.push(`${path} JSON-LD uses apex`);
      }
    }
    assert.deepEqual(bad.slice(0, 20), []);
  });

  test('hreflang 只指向存在且可索引的頁面，包含自己，x-default 指向無前綴網址', () => {
    const bad = [];
    for (const { path, html } of pages) {
      const alts = alternatesOf(html);
      if (alts.length === 0) continue;
      if (isNoindex(html)) bad.push(`${path} noindex 頁不應輸出 hreflang`);
      if (!alts.some((a) => a.href === `${ORIGIN}${path}`)) bad.push(`${path} 缺少自我 hreflang`);
      const xDefault = alts.find((a) => a.hreflang === 'x-default');
      const zhTW = alts.find((a) => a.hreflang === 'zh-TW');
      if (!xDefault || !zhTW || xDefault.href !== zhTW.href) bad.push(`${path} x-default 應等於 zh-TW`);
      for (const { hreflang, href } of alts) {
        if (!href.startsWith(`${ORIGIN}/`)) { bad.push(`${path} ${hreflang} 非 www: ${href}`); continue; }
        const target = href.slice(ORIGIN.length);
        if (target.startsWith('/zh-TW/')) bad.push(`${path} ${hreflang} 指向 /zh-TW/: ${href}`);
        const file = htmlFor(target);
        if (!file) bad.push(`${path} ${hreflang} 目標不存在: ${href}`);
        else if (isNoindex(readFileSync(file, 'utf8'))) bad.push(`${path} ${hreflang} 目標為 noindex: ${href}`);
      }
    }
    assert.deepEqual(bad.slice(0, 20), []);
  });

  test('首頁與日誌、公會列表輸出完整 hreflang（五語 + x-default）', () => {
    for (const base of ['/', '/journal/', '/guild/']) {
      const html = readFileSync(htmlFor(base), 'utf8');
      const langs = alternatesOf(html).map((a) => a.hreflang).sort();
      assert.deepEqual(langs, ['en', 'ja', 'ko', 'x-default', 'zh-CN', 'zh-TW'].sort(), base);
    }
  });

  test('/zh-TW/ 重複頁不再產出，改為 301 轉址到無前綴網址', () => {
    assert.equal(existsSync(join(dist, 'zh-TW', 'journal')), false, 'dist/client/zh-TW/journal 不應存在');
    // 用 Vercel 平台同一套 routing-utils 把 vercel.json 的 redirects 轉成實際路由規則
    const { getTransformedRoutes } = createRequire(join(root, 'package.json'))('@vercel/routing-utils');
    const { redirects = [] } = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    const { routes, error } = getTransformedRoutes({ redirects });
    assert.equal(error, null);
    const resolve = (p) => {
      const route = routes.find((r) => new RegExp(r.src).test(p));
      return route && { status: route.status, location: p.replace(new RegExp(route.src), route.headers.Location) };
    };
    const post = blogIds.at(-1);
    for (const [from, to] of [
      ['/zh-TW', '/'],
      ['/zh-TW/', '/'],
      ['/zh-TW/journal/', '/journal/'],
      [`/zh-TW/journal/${post}/`, `/journal/${post}/`],
      ['/zh-TW/guild/', '/guild/'],
      ['/zh-TW/guild/tyou/', '/guild/tyou/'],
    ]) {
      assert.deepEqual(resolve(from), { status: 301, location: to }, from);
      assert.ok(htmlFor(to), `轉址目標 ${to} 不存在`);
    }
    // zh-TW RSS 沒有無前綴版本，不可被轉走；其他路徑不受影響
    assert.equal(resolve('/zh-TW/rss.xml'), undefined);
    assert.ok(existsSync(join(dist, 'zh-TW', 'rss.xml')));
    assert.equal(resolve('/journal/'), undefined);
  });

  test('未翻譯的語系頁 noindex 且不在 sitemap；已翻譯者可索引', () => {
    const post = blogIds.at(-1);
    for (const lang of NON_DEFAULT) {
      const html = readFileSync(htmlFor(`/${lang}/journal/${post}/`), 'utf8');
      assert.ok(isNoindex(html), `/${lang}/journal/${post}/ 應 noindex`);
      assert.equal(alternatesOf(html).length, 0, `/${lang}/journal/${post}/ 不應有 hreflang`);
    }
    const bad = [];
    for (const { path, html } of pages) {
      const m = path.match(/^\/(zh-CN|en|ja|ko)\/guild\/([^/]+)\/$/);
      if (!m) continue;
      const translatedPage = guildTranslations.has(`${m[1]}/${m[2]}`);
      if (translatedPage === isNoindex(html)) bad.push(`${path} translated=${translatedPage}`);
    }
    assert.deepEqual(bad.slice(0, 20), []);
    const leaked = sitemapLocs.filter((loc) => {
      const p = loc.slice(ORIGIN.length);
      if (/^\/(zh-CN|en|ja|ko)\/journal\/[^/]+\/$/.test(p)) return true;
      const m = p.match(/^\/(zh-CN|en|ja|ko)\/guild\/([^/]+)\/$/);
      return Boolean(m && !guildTranslations.has(`${m[1]}/${m[2]}`));
    });
    assert.deepEqual(leaked.slice(0, 20), []);
    for (const key of guildTranslations) {
      const [lang, member] = key.split('/');
      assert.ok(sitemapLocs.includes(`${ORIGIN}/${lang}/guild/${member}/`), `${key} 應在 sitemap`);
    }
  });

  test('sitemap 不含 noindex 頁', () => {
    const bad = sitemapLocs.filter((loc) => {
      const file = htmlFor(loc.slice(ORIGIN.length));
      return file && isNoindex(readFileSync(file, 'utf8'));
    });
    assert.deepEqual(bad.slice(0, 20), []);
  });

  test('首頁（各語系）有且只有一個 h1', () => {
    for (const base of ['/', ...NON_DEFAULT.map((l) => `/${l}/`)]) {
      const html = readFileSync(htmlFor(base), 'utf8');
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, base);
    }
  });

  test('各語系 RSS 的每個連結都對應 dist 中存在且可索引的頁面', () => {
    const feeds = ['zh-TW', ...NON_DEFAULT].map((lang) => join(dist, lang, 'rss.xml'));
    const bad = [];
    for (const feed of feeds) {
      assert.ok(existsSync(feed), `${feed} 不存在`);
      const links = [...readFileSync(feed, 'utf8').matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map((m) => m[1]);
      assert.equal(links.length, blogIds.length, `${feed} 文章數`);
      for (const link of links) {
        if (!link.startsWith(`${ORIGIN}/`)) { bad.push(`${link} 非 www`); continue; }
        const file = htmlFor(link.slice(ORIGIN.length));
        if (!file) bad.push(`${link} 不存在`);
        else if (isNoindex(readFileSync(file, 'utf8'))) bad.push(`${link} 為 noindex`);
      }
    }
    assert.deepEqual(bad.slice(0, 20), []);
  });

  test('首頁 meta description 不再是通用文案', () => {
    const html = readFileSync(htmlFor('/'), 'utf8');
    const desc = attr((html.match(/<meta name="description"[^>]*>/) || [''])[0], 'content');
    assert.notEqual(desc, '這是我的個人部落格，展示作品集、履歷和有趣的互動專案');
    assert.match(desc, /AI/);
  });

  test('每篇日誌文章都在 sitemap 且被 /journal/ 列表連結', () => {
    const list = readFileSync(htmlFor('/journal/'), 'utf8');
    for (const id of blogIds) {
      assert.ok(sitemapLocs.includes(`${ORIGIN}/journal/${id}/`), `${id} 不在 sitemap`);
      assert.ok(list.includes(`href="/journal/${id}/"`), `${id} 未被 /journal/ 連結`);
    }
    assert.ok(readFileSync(htmlFor('/'), 'utf8').includes('href="/journal/"'), '首頁應連到 /journal/');
  });
});
