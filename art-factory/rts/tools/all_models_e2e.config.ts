import {defineConfig} from '@playwright/test';
import path from 'node:path';
import base from '../../../playwright.rts.config';
const chromium=base.projects!.find(p=>p.name==='chromium')!;
const run=process.env.RTS_ASSEMBLY_RUN??'art-factory/rts/runs/all-models/2026-10-14-v1';
const output=process.env.RTS_E2E_OUT??run+'/qa';
export default defineConfig({...base,
  testDir:path.resolve('tests/e2e'),
  testMatch:'games-rts*.spec.ts',
  workers:1,retries:0,
  reporter:[['line'],['json',{outputFile:path.resolve(output+'/e2e.json')}]],
  outputDir:path.resolve(output+'/e2e'),
  projects:[{...chromium,use:{...chromium.use,launchOptions:{...chromium.use?.launchOptions,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']}}}],
});
