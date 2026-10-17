import {buildSync} from 'esbuild';
buildSync({entryPoints:['art-factory/rts/tools/original_guard_tabard_viewer.ts'],
 outfile:'art-factory/rts/runs/original-guard-tabard/2026-10-05/viewer.js',
 bundle:true,minify:true,format:'iife',platform:'browser',
 // Preserve shader string contents with escaped newlines in the generated file.
 supported:{'template-literal':false}});
