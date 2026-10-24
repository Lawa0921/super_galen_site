"""Art step 9 (G4) sample: new skill icons, ailment icons and mechanic counters; native sizes, status `review`, the cap."""
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import g4_art as F
import gear_art as G
import sl_art as A

M = (255, 0, 255)


def test_three_sample_sheets_in_order_with_their_grids():
    jobs = F.sample_jobs()
    assert [j['id'] for j in jobs] == ['sheet-g4-skill-sample', 'sheet-g4-ailment-sample', 'sheet-g4-mech-sample']
    assert [(j['cols'], j['rows']) for j in jobs] == [(2, 2), (3, 2), (3, 2)]
    for j in jobs:
        assert len(j['parts']) == j['cols'] * j['rows'] and None not in j['parts']
        p = j['prompt']
        at = [p.index(F.DESC[part]) for part in j['parts']]
        assert at == sorted(at), j['id']                      # every cell described, in sheet order
        for must in ('#FF00FF', 'No text', 'no numbers', G.ORIGINAL):
            assert must in p, (j['id'], must)
        assert j['images'] == [G.GEAR_ANCHOR, G.ICONS_OLD] and j['batch'] == F.BATCH
    skill, ail, mech = (j['parts'] for j in jobs)
    assert skill and set(skill) <= G.skills_without_icon()       # new skills only, never one that has an icon
    assert {'ail-burn', 'ail-freeze', 'ail-chill', 'ail-shock', 'ail-bleed'} <= set(ail)
    assert 4 <= len(mech) and all(p.startswith('mech-') for p in mech)
    assert 'A 2 by 2 grid of four' in jobs[0]['prompt'] and '3 by 2' not in jobs[0]['prompt']


def test_every_ailment_part_names_a_game_ailment_and_its_label_colour():
    src = (Path(G.REPO) / 'src/scripts/games/starlantern/render/ailmentStyle.ts').read_text(encoding='utf-8')
    for part in F.AILMENTS:
        aid = part[len('ail-'):]
        assert f'{aid}: 0x{F.AIL_COLOUR[part][1:].lower()}' in src, part   # the chip's own colour (AILMENT_FILL)
    src = (Path(G.REPO) / 'src/scripts/games/starlantern/render/mechStyle.ts').read_text(encoding='utf-8')
    for part, tone in F.MECH_TONE.items():
        assert f'{tone}: 0x{F.MECH_COLOUR[part][1:].lower()}' in src, part


def test_native_sizes_per_kind():
    assert F.assets_of('pickpocket') == ['icon-pickpocket-16', 'icon-pickpocket-14']
    assert F.assets_of('ail-burn') == ['icon-ail-burn-14', 'icon-ail-burn-12']
    assert F.assets_of('mech-heat') == ['icon-mech-heat-14', 'icon-mech-heat-12']
    assert F.sizes_of('pickpocket') == ((14, 16), (12, 14)) and F.sizes_of('ail-burn') == ((12, 14), (10, 12))


def _sheet(path, cols, rows):
    img = np.zeros((rows * 280 + 80, cols * 300 + 80, 3), np.uint8); img[:] = M
    yy, xx = np.mgrid[0:200, 0:200]; disc = (yy - 100) ** 2 + (xx - 100) ** 2
    for r in range(rows):
        for c in range(cols):
            y0, x0 = 80 + r * 280, 80 + c * 300
            cell = img[y0:y0 + 200, x0:x0 + 200]
            cell[disc <= 96 ** 2] = (20, 20, 30); cell[disc <= 84 ** 2] = (230, 120, 60)
    path.parent.mkdir(parents=True, exist_ok=True); Image.fromarray(img, 'RGB').save(path); return path


@pytest.mark.parametrize('k', [0, 1])
def test_processing_writes_native_icons_marked_review_and_no_runtime(tmp_path, k):
    job = F.sample_jobs()[k]
    raw = _sheet(tmp_path / 'raw.png', job['cols'], job['rows']); reg = A.Registry(tmp_path / 'r.json')
    out = F.process_job(reg, job, raw, tmp_path / 'w', record=True)
    assert sorted(out) == sorted(a for p in job['parts'] for a in F.assets_of(p))
    for aid, qa in out.items():
        assert qa['pass'], (aid, qa['reasons'])
        size = int(aid.rsplit('-', 1)[1])
        assert Image.open(tmp_path / 'w' / f'{aid}.png').size == (size, size)
        e = reg.get(aid)
        assert e['status'] == 'review' and e['batch'] == F.BATCH and e['sheet'] == job['id'] and 'runtime' not in e


def test_a_failed_icon_stays_qa_failed(tmp_path, monkeypatch):
    job = F.sample_jobs()[1]
    raw = _sheet(tmp_path / 'raw.png', job['cols'], job['rows']); reg = A.Registry(tmp_path / 'r.json')
    real = A.process_skill_cell

    def failing(reg, sid, cell, workdir, raw, tab, tree):
        res = real(reg, sid, cell, workdir, raw, tab, tree)
        return {a: dict(q, **{'pass': False, 'reasons': ['magenta residue']}) for a, q in res.items()}
    monkeypatch.setattr(A, 'process_skill_cell', failing)
    F.process_job(reg, job, raw, tmp_path / 'w', record=True)
    assert all(reg.get(a)['status'] == 'qa_failed' for p in job['parts'] for a in F.assets_of(p))


def test_gen_uses_a_new_empty_folder_per_attempt_and_stops_at_two(tmp_path, monkeypatch):
    monkeypatch.setattr(F, 'RAW', tmp_path)
    calls = []

    def fake_run(argv, **kw):
        wd = Path(argv[argv.index('--workdir') + 1]); name = argv[argv.index('--name') + 1]
        calls.append((wd, sorted(p.name for p in wd.iterdir()) if wd.exists() else None))
        wd.mkdir(parents=True, exist_ok=True); Image.new('RGB', (4, 4), M).save(wd / name)
        return type('R', (), {'returncode': 0, 'stdout': '', 'stderr': ''})()
    monkeypatch.setattr(F.subprocess, 'run', fake_run)
    sid = 'sheet-g4-ailment-sample'
    assert F.gen([f'--only={sid}']) and F.gen([f'--only={sid}'])
    assert [c[0].name for c in calls] == ['a1', 'a2'] and all(c[1] in (None, []) for c in calls)
    with pytest.raises(PermissionError, match='attempt cap'):
        F.gen([f'--only={sid}'])
    assert len(calls) == 2


def test_gen_stops_when_codex_gives_no_image(tmp_path, monkeypatch):
    monkeypatch.setattr(F, 'RAW', tmp_path)
    monkeypatch.setattr(F.subprocess, 'run', lambda argv, **kw: type('R', (), {'returncode': 1, 'stdout': '', 'stderr': 'usage limit'})())
    assert F.gen(['--only=sheet-g4-skill-sample']) is False


def test_review_page_shows_every_sample_icon_beside_existing_icons_and_copies_only_what_it_uses(tmp_path, monkeypatch):
    import json, re
    import review_g4 as RV
    real = json.loads((G.AF / 'registry.json').read_text(encoding='utf-8'))
    reg = A.Registry(tmp_path / 'registry.json')
    for s, _ in [x for b in RV.G3_BESIDE.values() for x in b]:
        for px in (16, 14): reg.set(f'icon-{s}-{px}', **real['assets'][f'icon-{s}-{px}'])
    qa = {'pass': True, 'reasons': [], 'residue': 0, 'semi': 0, 'magenta_spill': 0, 'size': [14, 14],
          'subject': {'long': 12, 'short': 11, 'mass': 0.6, 'centre_off': 0.0}}
    for p in RV.parts():
        for aid in F.assets_of(p):
            s = int(aid.rsplit('-', 1)[1]); f = tmp_path / 'work' / f'{aid}.png'; f.parent.mkdir(exist_ok=True)
            Image.new('RGBA', (s, s), (200, 80, 40, 255)).save(f)
            reg.set(aid, final=str(f), qa=dict(qa, size=[s, s]), status='review', sheet='x', chosen_attempt='a1')
    monkeypatch.setattr(G, 'REG_PATH', tmp_path / 'registry.json')
    RV.main([f'--out={tmp_path / "out"}'])
    out = tmp_path / 'out'; page = (out / 'review.html').read_text(encoding='utf-8')
    for p in RV.parts():
        for aid in F.assets_of(p): assert f'img/{aid}.png' in page, aid
    srcs = set(re.findall(r'src="img/([^"]+)"', page))
    assert srcs and all((out / 'img' / s).is_file() for s in srcs)
    assert 'g3-ward-16.png' in srcs and 'rune-ignite-14.png' in srcs              # beside the G3 and the rune icons
    assert (out / 'montage-4x.png').is_file() and '請你決定的事' in page
    assert 'No text' not in page and all(e.get('status') == 'review' for a, e in reg.data['assets'].items() if a.startswith('icon-ail-'))


def test_a_chip_icon_with_an_erased_interior_fails(tmp_path):
    """Sample a1 (2026-10-24): codex drew 中毒 in a pink lilac the key took for magenta; the drop came out hollow (13
    enclosed hole pixels at 14 px) yet passed the skill-cell QA, which only warns. A chip icon is one solid symbol, so
    more than HOLE_MAX enclosed pixels fails it; a skill icon keeps the warning."""
    job = F.sample_jobs()[1]
    img = np.zeros((job['rows'] * 280 + 80, job['cols'] * 300 + 80, 3), np.uint8); img[:] = M
    yy, xx = np.mgrid[0:200, 0:200]; disc = (yy - 100) ** 2 + (xx - 100) ** 2
    for r in range(job['rows']):
        for c in range(job['cols']):
            cell = img[80 + r * 280:280 + r * 280, 80 + c * 300:280 + c * 300]
            cell[disc <= 96 ** 2] = (20, 20, 30); cell[disc <= 84 ** 2] = (230, 120, 60)
            if (r, c) == (1, 2): cell[disc <= 60 ** 2] = M                   # 中毒: a hollow drop
    raw = tmp_path / 'raw.png'; Image.fromarray(img, 'RGB').save(raw)
    reg = A.Registry(tmp_path / 'r.json')
    out = F.process_job(reg, job, raw, tmp_path / 'w', record=True)
    assert not out['icon-ail-poison-14']['pass'] and 'interior erased' in out['icon-ail-poison-14']['reasons']
    assert reg.get('icon-ail-poison-14')['status'] == 'qa_failed'
    assert reg.get('icon-ail-poison-14')['qa']['pass'] is False                       # the stored record says so too
    assert reg.get('icon-ail-poison-12')['status'] == 'qa_failed'                     # the same cell: both sizes go
    assert out['icon-ail-burn-14']['pass'] and reg.get('icon-ail-burn-14')['status'] == 'review'


def test_one_part_can_be_taken_from_another_attempt(tmp_path):
    job = F.sample_jobs()[1]
    raw = _sheet(tmp_path / 'raw-a2.png', job['cols'], job['rows']); reg = A.Registry(tmp_path / 'r.json')
    out = F.process_job(reg, job, raw, tmp_path / 'w', record=True, parts=['ail-poison'])
    assert sorted(out) == ['icon-ail-poison-12', 'icon-ail-poison-14'] and reg.get('icon-ail-poison-14')['chosen_attempt'] == 'a2'
    assert 'a2' in F.DESC['ail-poison'] or 'blue-violet' in F.DESC['ail-poison']
