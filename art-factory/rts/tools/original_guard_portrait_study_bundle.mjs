import {buildSync} from 'esbuild';
buildSync({entryPoints:['art-factory/rts/tools/original_guard_portrait_study_viewer.ts'],outfile:'art-factory/rts/runs/original-guard-portrait-study/2026-10-05/viewer.js',bundle:true,minify:true,format:'iife',platform:'browser',supported:{'template-literal':false}});
