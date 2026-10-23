"""faces.py: talking-face candidates for the eight companions (plan 5e; spec 2026-10-18 affinity-expressions section 10).

  gen  [--only=prefix,...] [--n=N] [--model=M] generate codex attempts one at a time until each id has N raw attempts
  cand [--only=prefix,...]                  postprocess every raw attempt into work/<id>/cand/a<N>/ (scratch registry) + match QA
  pick --id ID --attempt N                  postprocess the chosen attempt into the real registry (qa_passed / qa_failed)
  note --id ID --attempt N --reason R       record why an attempt was not chosen (registry `rejected_attempts`)

Same chain as party.py's mood portraits: each face <- the character's published normal portrait (raw, first image) and
standee (raw, second image), with the sentence of spec 10.5. Differences from party.py:
- every attempt runs codex in its own new, empty folder `raw/<id>/a<N>/` (codex sometimes saves under its own name;
  an empty folder makes that stray file the only candidate for `party.recover`);
- the downscale uses the base portrait's own block, not `--height 115`, so a face has exactly the base's pixel scale,
  and `match_qa` checks the result against the base portrait (canvas size, scale, palette).
Nothing here approves or publishes.
"""
import json, subprocess, sys, time
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402
import party as P  # noqa: E402

REPO, AF, RAW, PROMPTS, TOOLS = P.REPO, P.AF, P.RAW, P.PROMPTS, P.TOOLS
COMPANIONS = ['selene', 'chizuru', 'safira', 'sylvie', 'noel', 'bobby', 'liz', 'scarlet']
# Spec 10.5: `sad` reuses the published hero / Rin sentence; `serious` is the spec's core sentence.
FACES = {
    'serious': 'a firm, focused look, brows level and slightly lowered, lips pressed together, steady eyes looking straight ahead',
    'sad': P.FACES['sad'],
}
SIZE_TOL = 6          # art pixels the face's canvas may differ from the base portrait's on either axis
PALETTE_DIST = 24     # RGB distance under which a colour counts as one of the base portrait's
PALETTE_SHARE = 0.8   # below this share of base-palette pixels the face is flagged for the reviewer (warning only)


def _registry():
    return json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets']


def jobs(reg=None, cids=COMPANIONS):
    reg = _registry() if reg is None else reg
    out = []
    for c in cids:
        pid, sid = f'char-{c}-portrait', f'char-{c}-standee'
        if not (reg.get(pid, {}).get('raw') and reg.get(sid, {}).get('raw')): continue
        for m, face in FACES.items():
            out.append(dict(id=f'{pid}-{m}', cid=c, mood=m, base=pid, deps=[pid, sid], batch=f'faces-{c}',
                            images=[Path(reg[pid]['raw']), Path(reg[sid]['raw'])], block=reg[pid]['qa']['block'], prompt=(
                f'Square bust portrait in pixel art of exactly the same girl as the first attached portrait, same framing, head size, palette, hair and outfit '
                f'(the second attached image is the same character in full body, for reference only), but {face}. '
                f'Keep the face recognisably the same person. 16-bit JRPG dialogue portrait style, {P.PIX}. '
                'Perfectly flat solid pure magenta #FF00FF background around her with empty margin at the top and sides; the body is cut off by the bottom edge. No frame, no text.')))
    return out


def attempt_dir(aid, k):
    d = RAW / aid / f'a{k}'
    if d.exists() and any(d.iterdir()): raise FileExistsError(f'{d} is not empty; every attempt needs a new, empty folder')
    return d


def next_attempt(aid):
    """The next attempt number: after every a<N> folder, including failed ones (their logs stay as evidence)."""
    ks = [int(d.name[1:]) for d in (RAW / aid).glob('a*') if d.is_dir() and d.name[1:].isdigit()]
    return max(ks + [0]) + 1


def attempts(aid):
    files = [p for p in (RAW / aid).glob(f'a*/{aid}-a*.png') if not p.stem.endswith('-magenta')]
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def _opaque_rgb(png):
    a = np.asarray(Image.open(png).convert('RGBA')).reshape(-1, 4)
    return a[a[:, 3] == 255][:, :3].astype(np.int32)


def match_qa(final, base, base_block, block):
    """The face against its base portrait: same pixel scale, a canvas within SIZE_TOL, and (warning) the base palette."""
    fw, fh = Image.open(final).size; bw, bh = Image.open(base).size
    m = {'pass': True, 'reasons': [], 'warnings': [], 'base_size': [bw, bh], 'size_delta': [fw - bw, fh - bh],
         'block': block, 'base_block': base_block}
    if block != base_block:
        m['reasons'].append('pixel scale differs from the base portrait')
    if abs(fw - bw) > SIZE_TOL or abs(fh - bh) > SIZE_TOL:
        m['reasons'].append('canvas differs from the base portrait')
    new, pal = _opaque_rgb(final), np.unique(_opaque_rgb(base), axis=0)
    if len(new) and len(pal):
        near = np.zeros(len(new), bool)
        for i in range(0, len(new), 4096):
            d = np.abs(new[i:i + 4096, None, :] - pal[None, :, :]).sum(-1).min(1)
            near[i:i + 4096] = d <= PALETTE_DIST
        m['palette_share'] = round(float(near.mean()), 3)
    else:
        m['palette_share'] = 0.0
    if m['palette_share'] < PALETTE_SHARE: m['warnings'].append('palette far from the base portrait')
    m['pass'] = not m['reasons']
    return m


def write_prompt(job):
    PROMPTS.mkdir(exist_ok=True)
    (PROMPTS / f'{job["id"]}.txt').write_text(job['prompt'].strip() + ' ' + P.GEN + '\n', encoding='utf-8')


def selected(argv):
    only = next((a.split('=', 1)[1].split(',') for a in argv if a.startswith('--only=')), None)
    return [j for j in jobs() if not only or any(j['id'].startswith(o) for o in only)]


def _model(argv):
    return next((a.split('=', 1)[1] for a in argv if a.startswith('--model=')), None)


def gen(argv):
    """Strictly one codex call at a time (codex_still must not run in parallel). --model=NAME overrides the codex config
    model for these calls only (2026-10-23: the config default was refused by the account, see runs/ notes)."""
    model = _model(argv)
    n = int(next((a.split('=', 1)[1] for a in argv if a.startswith('--n=')), 2))
    for job in selected(argv):
        while len(attempts(job['id'])) < n:
            k = next_attempt(job['id'])
            wd, name = attempt_dir(job['id'], k), f'{job["id"]}-a{k}.png'
            write_prompt(job)
            argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(wd), '--name', name,
                     '--prompt-file', str(PROMPTS / f'{job["id"]}.txt')]
            for im in job['images']: argv2 += ['--image', str(im)]
            if model: argv2 += ['--model', model]
            start = time.time()
            g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
            print(f'[gen {job["id"]} a{k}] rc={g.returncode} {g.stdout.strip()[-200:]}', flush=True)
            fixed = P.recover(wd, name, start, time.time())
            if fixed: print(f'[recovered {job["id"]} a{k}] codex saved {fixed}; the fallback copy was replaced', flush=True)
            if not (wd / name).exists():
                print(f'[no output] {job["id"]} a{k}; stopping this id', flush=True); break


def process_attempt(reg, job, raw, workdir):
    if 'allow_edge' not in reg.data['assets'].get(job['id'], {}):
        reg.set(job['id'], allow_edge=['bottom'])
    q = A.process(reg, job['id'], raw, 'sprite', workdir=workdir, block=job['block'])[job['id']]
    base = REPO / _registry()[job['base']]['final']
    m = match_qa(Path(workdir) / f'{job["id"]}.png', base, job['block'], q['block'])
    (Path(workdir) / f'{job["id"]}.match.json').write_text(json.dumps(m, indent=2), encoding='utf-8')
    return q, m


def cand(argv):
    for job in selected(argv):
        for raw in attempts(job['id']):
            k = raw.stem.rsplit('-a', 1)[1]; wd = AF / 'work' / job['id'] / 'cand' / f'a{k}'
            q, m = process_attempt(A.Registry(wd / 'cand-registry.json'), job, raw, wd)
            print(f'[cand {job["id"]} a{k}] qa={"pass" if q["pass"] else q["reasons"]} warn={q.get("warnings")} holes={q.get("holes")} '
                  f'size={q.get("size")} match={"pass" if m["pass"] else m["reasons"]} delta={m["size_delta"]} palette={m["palette_share"]}', flush=True)


def pick(argv):
    aid, k = P._arg(argv, '--id'), P._arg(argv, '--attempt')
    job = next(j for j in jobs() if j['id'] == aid)
    reg = A.Registry(AF / 'registry.json')
    reg.set(aid, kind='sprite')
    raw = RAW / aid / f'a{k}' / f'{aid}-a{k}.png'
    q, m = process_attempt(reg, job, raw, AF / 'work' / aid)
    reg.set(aid, chosen_attempt=f'a{k}', source_id=aid, batch=job['batch'], runtime=P.runtime(aid), depends_on=job['deps'], match=m)
    if not m['pass']: reg.set(aid, status='qa_failed')
    print(json.dumps({'qa': q, 'match': m}, ensure_ascii=False))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    {'gen': gen, 'cand': cand, 'pick': pick, 'note': P.note}[cmd](sys.argv[2:])
