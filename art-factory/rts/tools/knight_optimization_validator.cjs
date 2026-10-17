// Run the official Khronos glTF Validator package against both v3 GLBs.
// The validator module is supplied with --module; it is never vendored into
// the art source or runtime tree.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function argument(name) {
  const at = process.argv.indexOf(name);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`Missing ${name}`);
  return path.resolve(process.argv[at + 1]);
}

async function main() {
  const modulePath = argument('--module');
  const run = argument('--run');
  const validator = require(modulePath);
  const version = require(path.join(path.dirname(modulePath), 'package.json')).version;
  const reports = [];
  for (const lod of [0, 1]) {
    const file = path.join(run, 'candidate', `knight-lod${lod}.glb`);
    const bytes = fs.readFileSync(file);
    const validation = await validator.validateBytes(new Uint8Array(bytes), {
      uri: `knight-lod${lod}.glb`, maxIssues: 0,
    });
    const output = path.join(run, 'qa', `validator-lod${lod}.json`);
    fs.writeFileSync(output, JSON.stringify(validation, null, 2) + '\n');
    const report = {
      lod, validator: 'Khronos glTF Validator', version,
      glb_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      errors: validation.issues.numErrors,
      warnings: validation.issues.numWarnings,
      infos: validation.issues.numInfos,
      full_report: path.relative(run, output).replace(/\\/g, '/'),
    };
    reports.push(report);
    if (report.errors !== 0) throw new Error(`LOD${lod}: ${report.errors} validator errors`);
  }
  fs.writeFileSync(path.join(run, 'qa', 'validator-summary.json'), JSON.stringify(reports, null, 2) + '\n');
  console.log(JSON.stringify(reports, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
