// @vitest-environment node
import {describe,expect,it} from 'vitest';
import path from 'node:path';
import {bundlePerfFixture} from '../../../../tests/manual/rts-perf-bundle';

describe('production performance harness bundle',()=>{
  it('provides Vite-style import.meta.env as a production build (DEV=false) so main.ts does not crash',async()=>{
    const code=await bundlePerfFixture("export const env=[import.meta.env.DEV,import.meta.env.PROD,import.meta.env.MODE,import.meta.env.SSR];",path.resolve('tests/manual'));
    const text=new TextDecoder().decode(code);expect(text).not.toContain('import.meta.env');
    const mod=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')) as {env:unknown[]};
    expect(mod.env).toEqual([false,true,'production',false]);
  });
  it('strips the dev-only debug hook branch from the bundled game entry',async()=>{
    const code=new TextDecoder().decode(await bundlePerfFixture("import {mountRts} from '../../src/scripts/games/rts/main';export {mountRts};",path.resolve('tests/manual')));
    expect(code).not.toContain('import.meta.env');expect(code).not.toContain('__rtsDebug');
  },60000);
});
