"""One codex built-in image_gen call for an opaque material source (model polish 2026-10-16).

Usage: python art-factory/rts/tools/model_polish_codex_texture.py <workdir> <name.png> <prompt.txt>
Writes <name>.prompt.txt, <name>.codex.log and <name>.gen.json (sha256, argv, status) next to the raw image.
Never approves or publishes anything; runtime_publish_allowed stays false until review.
"""
from datetime import datetime, timezone
from pathlib import Path
import hashlib, json, shutil, subprocess, sys, time

GENERATED = Path.home() / '.codex' / 'generated_images'
SUFFIX = ('\nUse your built-in image generation tool to create exactly one image. Then copy the resulting PNG from {gen} '
          '(newest session folder) into the current directory as {name}. Do not create or modify any other files.')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def newest(since):
    found = [p for p in GENERATED.rglob('*.png') if p.stat().st_mtime >= since] if GENERATED.exists() else []
    return max(found, key=lambda p: p.stat().st_mtime) if found else None


def main(workdir, name, prompt_file):
    workdir = Path(workdir); workdir.mkdir(parents=True, exist_ok=True)
    out = workdir / name
    if out.exists():
        raise SystemExit(f'{out} exists; use a new name for a new generation')
    # The npm codex shim is a .cmd file: cmd.exe cuts arguments at the first newline and expands %VAR%, so the prompt
    # is passed as one line (the multi-line original stays in the prompt file for provenance).
    text = Path(prompt_file).read_text(encoding='utf-8')
    assert '%' not in text, 'percent signs are expanded by the .cmd shim'
    prompt = ' '.join(line.strip() for line in text.splitlines() if line.strip()) + SUFFIX.format(gen=GENERATED, name=name)
    (workdir / f'{out.stem}.prompt.txt').write_text(prompt, encoding='utf-8')
    argv = [shutil.which('codex') or 'codex', 'exec', '--skip-git-repo-check', '-s', 'workspace-write', prompt]
    start = time.time(); before = {p.name for p in workdir.glob('*.png')}; adopted = None
    with open(workdir / f'{out.stem}.codex.log', 'w', encoding='utf-8') as log:
        proc = subprocess.run(argv, cwd=str(workdir), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, timeout=1200)
    if not out.exists():
        # codex sometimes copies its own result into the workdir under a name of its choosing; accept it only when
        # exactly one new PNG appeared in this workdir during this call (logged as adopted_from).
        fresh = [p for p in workdir.glob('*.png') if p.name not in before and p.stat().st_mtime >= start - 2]
        if len(fresh) == 1:
            adopted = fresh[0].name; fresh[0].rename(out)
    # No "newest file in generated_images" fallback: other agents generate concurrently into the same folder, and a
    # fallback once picked up an unrelated image (shield-oak-a2, rejected). Only codex's own copy counts.
    record = {'tool': 'codex builtin image_gen', 'name': name,
              'started': datetime.fromtimestamp(start, timezone.utc).isoformat(timespec='seconds'),
              'finished': datetime.now(timezone.utc).isoformat(timespec='seconds'),
              'prompt_file': f'{out.stem}.prompt.txt', 'prompt_sha256': hashlib.sha256(prompt.encode('utf-8')).hexdigest(),
              'returncode': proc.returncode, 'output': name if out.exists() else None,
              'output_sha256': sha(out) if out.exists() else None,
              'status': 'generated' if out.exists() else 'no_output', 'adopted_from': adopted, 'visual_review': 'pending',
              'runtime_publish_allowed': False}
    (workdir / f'{out.stem}.gen.json').write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(record, ensure_ascii=False))
    return 0 if out.exists() else 2


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:4]))
