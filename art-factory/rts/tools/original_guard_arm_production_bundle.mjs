import {buildSync} from 'esbuild';
buildSync({entryPoints:['art-factory/rts/tools/original_guard_arm_production_viewer.mjs'],
  outfile:'art-factory/rts/runs/original-guard-arm-production/2026-10-05/viewer.js',
  bundle:true,minify:true,format:'esm',platform:'browser',supported:{'template-literal':false}});
