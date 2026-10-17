/** Official Khronos validator; install its pinned package in an isolated tool cache.
 * API: https://github.com/KhronosGroup/glTF-Validator/blob/main/node/README.md
 * node validate_glbs.mjs <validator-package-path> <report.json> <asset.glb>...
 */
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const [modulePath,reportPath,...files]=process.argv.slice(2);
if(!modulePath||!reportPath||!files.length)throw new Error('Expected validator module, report path, and at least one GLB');
const validator=createRequire(import.meta.url)(path.resolve(modulePath));
const assets=[];
for(const file of files){
  const bytes=await readFile(file);
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(file),format:'glb',maxIssues:0,writeTimestamp:false});
  assets.push({file:path.relative(process.cwd(),file).replaceAll('\\','/'),sha256:createHash('sha256').update(bytes).digest('hex'),...report});
}
const summary={validator:validator.version(),source:'https://github.com/KhronosGroup/glTF-Validator',assets,
  errors:assets.reduce((n,a)=>n+a.issues.numErrors,0),warnings:assets.reduce((n,a)=>n+a.issues.numWarnings,0)};
await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({validator:summary.validator,files:files.length,errors:summary.errors,warnings:summary.warnings,report:reportPath}));
if(summary.errors)process.exitCode=1;
