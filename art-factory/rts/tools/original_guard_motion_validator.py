"""Run the official Khronos glTF Validator on a motion candidate.

The validator package is fetched into a temporary directory, hash-checked,
and never committed with the art run.
"""

import hashlib
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path


VERSION = "2.0.0-dev.3.10"
PACKAGE_URL = f"https://registry.npmjs.org/gltf-validator/-/gltf-validator-{VERSION}.tgz"
PACKAGE_SHA256 = "4e03dbdc3bc0d1342afd5d2d7ae341a7e3474502ccb872b02dbbaddaee0fdec6"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    run = Path(sys.argv[1]).resolve()
    candidates = [run / "candidate" / f"guard-original-motion-lod{lod}.glb" for lod in (0, 1)]
    with tempfile.TemporaryDirectory(prefix="guard-motion-validator-") as folder:
        temporary = Path(folder)
        package = temporary / "validator.tgz"
        with urllib.request.urlopen(PACKAGE_URL) as response, package.open("wb") as output:
            output.write(response.read())
        if sha256(package) != PACKAGE_SHA256:
            raise AssertionError("Khronos validator package hash mismatch")
        with tarfile.open(package, "r:gz") as archive:
            archive.extractall(temporary, filter="data")
        runner = temporary / "validate.cjs"
        runner.write_text(
            """
const fs = require('fs');
const validator = require(process.argv[2]);
(async () => {
  const results = [];
  for (const file of process.argv.slice(3)) {
    const bytes = fs.readFileSync(file);
    results.push(await validator.validateBytes(new Uint8Array(bytes), {uri: file, maxIssues: 0}));
  }
  process.stdout.write(JSON.stringify(results));
})().catch(error => { console.error(error); process.exit(1); });
""".strip()
            + "\n",
            encoding="utf-8",
        )
        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        completed = subprocess.run(
            ["node", str(runner), str(temporary / "package" / "index.js"), *(str(path) for path in candidates)],
            check=True,
            capture_output=True,
            text=True,
            creationflags=creation_flags,
        )
    validations = json.loads(completed.stdout)
    assets = []
    for lod, (path, validation) in enumerate(zip(candidates, validations)):
        issues = validation["issues"]
        report_path = run / "qa" / f"khronos-validator-lod{lod}.json"
        report_path.write_text(json.dumps(validation, indent=2) + "\n", encoding="utf-8", newline="\n")
        assets.append(
            {
                "lod": lod,
                "path": str(path.relative_to(run)).replace("\\", "/"),
                "sha256": sha256(path),
                "errors": issues["numErrors"],
                "warnings": issues["numWarnings"],
                "infos": issues["numInfos"],
                "full_report": str(report_path.relative_to(run)).replace("\\", "/"),
            }
        )
    result = {
        "validator": "Khronos glTF Validator",
        "version": VERSION,
        "package_url": PACKAGE_URL,
        "package_sha256": PACKAGE_SHA256,
        "package_not_committed": True,
        "assets": assets,
        "status": "pass" if all(asset["errors"] == 0 for asset in assets) else "fail",
        "runtime_publish_allowed": False,
    }
    output = run / "qa" / "khronos-validator.json"
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    if result["status"] != "pass":
        raise AssertionError(f"Validator errors: {assets}")
    print("ORIGINAL_GUARD_KHRONOS_QA=" + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
