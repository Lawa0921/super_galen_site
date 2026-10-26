// determinism.test.ts — gen2 的確定性規則（原 chunkgen.test.ts (6) 的 gen2 / genPrims 部分，改成遞迴掃描）：
// engine/gen2/**（含 draw/、structures/）與 engine/genPrims.ts 的非測試檔不得用 Math.random / 浮點超越函數 / 次方運算子；
// gen2 不 import legacy（gen2.perf.test.ts 例外：效能測試拿 v1 OuterGen 當分母）；draw/ 與 structures/ 不 import blueprint.ts。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const GEN2 = __dirname;
const GEN_PRIMS = join(GEN2, '..', 'genPrims.ts');
const BANNED = /Math\.random|Math\.sin|Math\.cos|Math\.pow|Math\.exp|Math\.log|Math\.sqrt|Math\.hypot|\*\*/;
// M1 chunkgen.test.ts 的同一個 regex（單 / 雙引號都抓）
const LEGACY_IMPORT = /from\s+['"][^'"]*legacy\//;

const gen2Files = (): string[] => (readdirSync(GEN2, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).map((f) => join(GEN2, f));
// 非測試檔（testUtil.ts 照樣掃）
const gen2SourceFiles = (): string[] => gen2Files().filter((p) => !p.endsWith('.test.ts'));
const gen2TestFiles = (): string[] => gen2Files().filter((p) => p.endsWith('.test.ts'));
const read = (p: string): string => readFileSync(p, 'utf8');

describe('gen2 確定性掃描', () => {
  it('engine/gen2/**（遞迴，含 draw/、structures/）與 engine/genPrims.ts 沒有禁用 API；gen2 不 import legacy；draw/ 與 structures/ 不 import blueprint.ts', () => {
    const files = gen2SourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(files.some((p) => /[\\/]structures[\\/]cabin\.ts$/.test(p))).toBe(true);
    expect(files.some((p) => p.endsWith('testUtil.ts'))).toBe(true);
    for (const f of [...files, GEN_PRIMS]) expect(BANNED.exec(read(f))?.[0] ?? null, f).toBeNull();
    for (const f of files) expect(LEGACY_IMPORT.test(read(f)), f).toBe(false);
    for (const f of files.filter((p) => /[\\/](draw|structures)[\\/]/.test(p))) expect(/from '\.\.\/blueprint'/.test(read(f)), f).toBe(false);
  });
  it('gen2 的測試檔也不 import legacy（gen2.perf.test.ts 例外）——legacy 在 M2a 還在', () => {
    const tests = gen2TestFiles().filter((p) => !p.endsWith('gen2.perf.test.ts'));
    expect(tests.length).toBeGreaterThanOrEqual(10);
    for (const f of tests) expect(LEGACY_IMPORT.test(read(f)), f).toBe(false);
  });
  it('掃描本身抓得到違規（regex 不是永遠不中）', () => {
    expect(BANNED.test('const a = 2 ** 3;')).toBe(true); expect(BANNED.test('Math.sqrt(2)')).toBe(true); expect(BANNED.test('// x ** y')).toBe(true);
    // 字串拆開拼，免得本檔自己被第二個測試抓到
    expect(LEGACY_IMPORT.test(['import { OuterGen } from', "'../legacy/chunkgen';"].join(' '))).toBe(true);
    expect(read(join(GEN2, 'gen2.perf.test.ts'))).toMatch(LEGACY_IMPORT);
  });
});
