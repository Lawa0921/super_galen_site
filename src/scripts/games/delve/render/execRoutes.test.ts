// execRoutes.test.ts — UI 只透過指令匯流排改狀態（co-op M-B2，計畫 B1）：
// render/ 與 input/ 的非測試程式不直接呼叫 mutator，一律 game.act({ op, … })。
// M-B3 的客人模式只在 exec 加 replica 分支；漏網的直接呼叫會在客人端偷改本地狀態，這裡先擋掉。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(process.cwd(), 'src', 'scripts', 'games', 'delve');

function listTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listTs(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const MUTATORS = [
  'craft', 'takeChestSlot', 'takeAllFromChest', 'depositToChest', 'closeChest', 'closeMirror',
  'equipFromInventory', 'equipVanityFromInventory', 'unequip', 'unequipVanity', 'setHideArmor', 'recolorWorn',
  'setBodyLook', 'rebirth', 'toggleLock', 'salvage', 'salvageAll', 'reroll', 'upgrade', 'ascend', 'deepforge',
  'buy', 'sell', 'service', 'residentService', 'folkBuy', 'folkSell', 'folkService',
  'acceptQuest', 'turnInQuest', 'refreshQuests', 'learnSkill', 'respecSkills', 'useSkill',
  'talkNearest', 'talkAtPx', 'travel', 'travelStone', 'setSpawnCore', 'toggleMarker', 'tossSlot', 'tryPlace',
];
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b(?:game|g|this\.game|scene\?\.game)\.(${MUTATORS.join('|')})\(`, 'g'),
  /\.inventory\.swap\(/g,
];

function scan(src: string, rel: string): string[] {
  const hits: string[] = [];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const line = src.slice(0, m.index).split('\n').length;
      hits.push(`${rel}:${line} ${m[0]}`);
    }
  }
  return hits;
}

describe('render/ 與 input/ 走指令匯流排', () => {
  it('render/ 與 input/ 不直接呼叫 mutator', () => {
    const hits: string[] = [];
    for (const dir of ['render', 'input']) {
      for (const file of listTs(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split(sep).join('/');
        hits.push(...scan(readFileSync(file, 'utf8'), rel));
      }
    }
    expect(hits).toEqual([]);
  });

  it('掃描本身抓得到違規（樣式自我檢查）', () => {
    const bad = [
      'game.craft(id);', 'this.game.takeChestSlot(i)', 'g.useSkill("dash")', 'scene?.game.talkNearest()',
      'game.inventory.swap(a, b)', 'this.game.inventory.swap(this.picked, i)', 'g.tossSlot(0)',
    ];
    for (const s of bad) expect(scan(s, 'x').length, s).toBeGreaterThan(0);
    const ok = [
      "game.act({ op: 'craft', recipe: id })", 'game.selectSlot(3)', 'game.setAppearance(look)',
      'game.crafted()', 'inventory.swapped', 'game.inventory.get(0)',
    ];
    for (const s of ok) expect(scan(s, 'x'), s).toEqual([]);
  });
});
