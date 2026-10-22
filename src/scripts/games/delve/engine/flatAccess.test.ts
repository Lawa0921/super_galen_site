// flatAccess.test.ts — 扁平存取清零：除了 World 本身與舊生成器，沒有任何程式直接讀扁平層或拿中央寬做 index 算術。
// 之後儲存換成區塊欄（Task 5）時，扁平欄位會被拿掉；這個測試保證呼叫端都已改走座標 API（getter / window / chunk payload）。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(process.cwd(), 'src', 'scripts', 'games', 'delve');

function listTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listTs(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** 允許直接碰扁平層的檔：World 本身、舊生成器、生成過程的分段繪製、測試 */
function excluded(rel: string): boolean {
  return rel === 'engine/world.ts' || rel === 'engine/worldgen.ts' || rel.startsWith('engine/gen/')
    || rel.endsWith('.test.ts') || rel === 'render/genSection.ts';
}

const R = String.raw`(?:world|w|this\.world|game\.world|g\.world)`;
const LAYERS = 'fg|wall|liquid|liquidType|frozen|half|variant';
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: '① 直接讀扁平層', re: new RegExp(String.raw`\b${R}\.(${LAYERS})\b`, 'g') },
  { name: '② 解構取層', re: new RegExp(String.raw`\{[^}]*\b(${LAYERS})\b[^}]*\}\s*=\s*${R}\b`, 'g') },
  { name: '③ 中央寬 index 算術', re: new RegExp(String.raw`[*%/]\s*${R}\.width\b`, 'g') },
  { name: '④ 中央寬當左右邊界', re: new RegExp(String.raw`${R}\.width\s*-\s*\d|Math\.min\(\s*${R}\.width|${R}\.width\s*\*\s*(S|TILE_SIZE)\b`, 'g') },
  { name: '⑤ 寬度存成別名', re: new RegExp(String.raw`=\s*${R}\.width\s*[,;]`, 'g') },
];

describe('扁平存取清零', () => {
  it('delve 的非測試程式（World / 舊生成器除外）沒有扁平層存取與中央寬 index 算術', () => {
    const hits: string[] = [];
    for (const file of listTs(ROOT)) {
      const rel = relative(ROOT, file).split(sep).join('/');
      if (excluded(rel)) continue;
      const src = readFileSync(file, 'utf8');
      for (const { name, re } of PATTERNS) {
        re.lastIndex = 0;
        for (let m = re.exec(src); m; m = re.exec(src)) {
          const line = src.slice(0, m.index).split('\n').length;
          hits.push(`${rel}:${line} ${name}: ${m[0].replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('掃描本身抓得到違規（樣式自我檢查）', () => {
    const bad = [
      'const a = w.fg[i];',
      'const { fg, wall } = world;',
      'const i = y * w.width + x;',
      'const x = Math.min(w.width - 1, x);',
      'const W = this.world.width;',
    ];
    for (const s of bad) expect(PATTERNS.some(({ re }) => { re.lastIndex = 0; return re.test(s); }), s).toBe(true);
    const ok = ['const n = w.width * w.height;', 'for (let x = 0; x < w.width; x++) {}', 'w.getFg(x, y)', 'const view = w.window(0, 0, 4, 4);'];
    for (const s of ok) expect(PATTERNS.some(({ re }) => { re.lastIndex = 0; return re.test(s); }), s).toBe(false);
  });
});
