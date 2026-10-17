"""One logged codex built-in image_gen call for roster-expansion reference inputs.

Never approves art and never writes runtime paths. Mirrors the unit-inputs
`builtin-imagegen` source mode: the prompt, codex log, reference SHA and output
SHA are recorded next to the generated PNG for the art-factory manifest.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

GENERATED = Path.home() / '.codex' / 'generated_images'
SUFFIX = ('\nThen copy the resulting PNG (keep its alpha channel) from {gen} (newest session folder) into the '
          'current directory as {name}. Do not create or modify any other files.')


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def newest(since):
    found = [p for p in GENERATED.rglob('*.png') if p.stat().st_mtime >= since] if GENERATED.exists() else []
    return max(found, key=lambda p: p.stat().st_mtime) if found else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workdir', type=Path, required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--prompt-file', type=Path, required=True)
    parser.add_argument('--image', type=Path, action='append', default=[])
    args = parser.parse_args()
    work = args.workdir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    out = work / args.name
    if out.exists():
        raise FileExistsError(f'{out} exists; use a new name for a new generation')
    prompt = args.prompt_file.read_text(encoding='utf-8').rstrip() + SUFFIX.format(gen=GENERATED, name=args.name)
    stem = Path(args.name).stem
    (work / f'{stem}.prompt.txt').write_text(prompt, encoding='utf-8', newline='\n')
    codex = shutil.which('codex') or 'codex'
    argv = [codex, 'exec', '--skip-git-repo-check', '-s', 'workspace-write']
    argv += [f'--image={p.resolve()}' for p in args.image]
    start = time.time()
    with (work / f'{stem}.codex.log').open('w', encoding='utf-8') as log:
        proc = subprocess.run(argv + [prompt], cwd=str(work), stdin=subprocess.DEVNULL, stdout=log,
                              stderr=subprocess.STDOUT, timeout=1200)
    if not out.exists():
        fallback = newest(start - 2)
        if fallback is not None:
            shutil.copyfile(fallback, out)
    record = {'tool': 'codex builtin image_gen', 'source_mode': 'builtin-imagegen', 'name': args.name,
              'started': datetime.fromtimestamp(start, timezone.utc).isoformat(timespec='seconds'),
              'finished': datetime.now(timezone.utc).isoformat(timespec='seconds'),
              'argv_without_prompt': [Path(argv[0]).name, *argv[1:]], 'prompt_file': f'{stem}.prompt.txt',
              'prompt_sha256': hashlib.sha256(prompt.encode('utf-8')).hexdigest(),
              'inputs': [{'path': p.as_posix(), 'sha256': sha256(p)} for p in args.image],
              'returncode': proc.returncode, 'output': args.name if out.exists() else None,
              'output_sha256': sha256(out) if out.exists() else None,
              'status': 'generated' if out.exists() else 'no_output', 'visual_review': 'pending',
              'runtime_publish_allowed': False}
    (work / f'{stem}.gen.json').write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'status': record['status'], 'output': record['output']}))
    raise SystemExit(0 if out.exists() else 1)


if __name__ == '__main__':
    main()
