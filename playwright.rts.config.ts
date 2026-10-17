import {defineConfig} from '@playwright/test';
import base from './playwright.config';

/** Dedicated desktop RTS preview; RTS_PORT keeps concurrent worktrees separate. */
const port=Number(process.env.RTS_PORT??4321);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('RTS_PORT must be an integer from 1024 to 65535');
const baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({...base,
  testMatch:'games-rts*.spec.ts',workers:1,
  outputDir:'tmp/rts/e2e-results',
  reporter:[['list'],['json',{outputFile:'tmp/rts/e2e-report.json'}]],
  use:{...base.use,baseURL},
  // Keep the established --project=chromium shortcut for focused RTS checks.
  projects:base.projects?.filter(project=>['chromium-rts','firefox','webkit'].includes(project.name!)).map(project=>
    project.name==='chromium-rts'?{...project,name:'chromium'}:project),
  webServer:{command:`node node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --port ${port}`,env:{ASTRO_DEV_BACKGROUND:'1'},url:baseURL,reuseExistingServer:!process.env.CI,
    // A cold astro dev start (dependency re-optimisation) measured 178s on a CPU-saturated host.
    timeout:300000}
});
