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


# --- the full set (user approved the sample style 2026-10-24: answers 1-4) ---------------------------------------------

def test_full_set_covers_every_skill_without_icon_rins_mark_every_ailment_and_the_mechanics():
    parts = F.full_parts()
    assert len(parts) == len(set(parts))
    skills = {p for p in parts if F.kind_of(p) == 'skill'}
    assert skills == G.skills_without_icon() | {'rin-mark'}
    src = (Path(G.REPO) / 'src/scripts/games/starlantern/render/ailmentStyle.ts').read_text(encoding='utf-8')
    import re
    ails = set(re.search(r'AILMENT_FILL[^{]*\{([^}]*)\}', src).group(1).replace(' ', '').replace('\n', '').split(','))
    assert {p[4:] for p in parts if p.startswith('ail-')} == {a.split(':')[0] for a in ails if a}
    assert {p for p in parts if p.startswith('mech-')} == {
        'mech-heat', 'mech-coins', 'mech-embers', 'mech-beat', 'mech-shield', 'mech-aim', 'mech-mark', 'mech-ward', 'mech-purify',
        'mech-thunder', 'mech-moon-first', 'mech-moon-full', 'mech-moon-waning', 'mech-moon-new'}
    for j in F.full_jobs():
        assert j['batch'] == F.FULL_BATCH and len(j['parts']) == 6 and 'No text' in j['prompt'] and j['images'][0].is_file()
        assert all(F.DESC[p] in j['prompt'] for p in j['parts'])
    # The sample's known risks are redrawn: heat is no longer a flame, bleed one strong drop, the beat's stem thick.
    assert 'no flame' in F.DESC['mech-heat-2'] and 'no second drop' in F.DESC['ail-bleed-2'] and 'about 8 art pixels' in F.DESC['mech-beat-2']


def test_full_chip_icons_are_14_only_and_skills_16_and_14():
    assert F.assets_of('mech-ward', full=True) == ['icon-mech-ward-14']
    assert F.assets_of('exorcism-thrust', full=True) == ['icon-exorcism-thrust-16', 'icon-exorcism-thrust-14']
    assert len(F.full_assets()) == 16 * 2 + 21                        # 16 skills x 2 sizes, 21 chips at 14


def test_a_redraw_takes_its_game_id_and_keeps_the_sample_record_as_history(tmp_path):
    job = next(j for j in F.full_jobs() if j['id'] == 'sheet-g4-chip-1')
    reg = A.Registry(tmp_path / 'r.json'); reg.set('icon-mech-heat-14', batch=F.BATCH, status='review', final='x.png')
    raw = _sheet(tmp_path / 'sheet-g4-chip-1-a1.png', 3, 2)
    out = F.process_job(reg, job, raw, tmp_path / 'w', record=True)
    assert sorted(out) == sorted(['icon-ail-sleep-14', 'icon-ail-bleed-14', 'icon-mech-heat-14', 'icon-mech-beat-14', 'icon-mech-aim-14', 'icon-mech-mark-14'])
    e = reg.get('icon-mech-heat-14')
    assert e['batch'] == F.FULL_BATCH and e['drawn_as'] == 'mech-heat-2' and e['history'][0]['batch'] == F.BATCH and e['status'] == 'review'
    assert Image.open(tmp_path / 'w' / 'icon-mech-heat-14.png').size == (14, 14)


def _all_reviewed(reg, tmp_path):
    for a in F.full_assets():
        f = tmp_path / 'w' / f'{a}.png'; f.parent.mkdir(exist_ok=True); Image.new('RGBA', (4, 4), (9, 9, 9, 255)).save(f)
        reg.set(a, status='review', batch=F.BATCH if F.game_part(a[5:].rsplit('-', 1)[0]) in F.SAMPLE_KEPT else F.FULL_BATCH,
                final=str(f), qa={'pass': True, 'reasons': []})


def test_approve_records_the_users_answers_and_refuses_an_incomplete_set(tmp_path):
    reg = A.Registry(tmp_path / 'r.json'); _all_reviewed(reg, tmp_path)
    reg.set('icon-ail-burn-12', status='review', batch=F.BATCH, final='x', qa={'pass': True})
    reg.set('icon-mech-moon-new-14', qa={'pass': False, 'reasons': ['interior erased']})
    with pytest.raises(PermissionError, match='mech-moon-new'):
        F.do_approve(reg, F.APPROVED_BY, F.FULL_BY)
    assert reg.get('icon-pickpocket-16')['status'] == 'review'                       # nothing changed
    reg.set('icon-mech-moon-new-14', qa={'pass': True, 'reasons': []})
    reg.set('sheet-g4-chip-2', status='review', batch=F.FULL_BATCH); reg.set('sheet-g4-mech-sample', status='review', batch=F.BATCH)
    F.do_approve(reg, F.APPROVED_BY, F.FULL_BY, today='2026-10-24')
    assert reg.get('sheet-g4-chip-2')['approved_by'] == F.FULL_BY and reg.get('sheet-g4-mech-sample')['approved_by'] == F.APPROVED_BY
    assert reg.get('icon-pickpocket-16')['approved_by'] == F.APPROVED_BY and reg.get('icon-rin-mark-14')['approved_by'] == F.FULL_BY
    for n in ('(1)', '(2)', '(3)', '(4)', '14x14', 'chill'): assert n in F.APPROVED_BY
    assert reg.get('icon-ail-burn-12')['status'] == 'unused'


def test_publish_writes_runtime_icon_paths_and_the_manifest(tmp_path):
    reg = A.Registry(tmp_path / 'r.json'); _all_reviewed(reg, tmp_path)
    with pytest.raises(PermissionError): F.do_publish(reg, tmp_path / 'public')
    F.do_approve(reg, F.APPROVED_BY, F.FULL_BY); F.do_publish(reg, tmp_path / 'public')
    icon = tmp_path / 'public/assets/games/starlantern/icon'
    assert (icon / 'ail-sleep-14.png').is_file() and (icon / 'exorcism-thrust-16.png').is_file() and not (icon / 'ail-burn-12.png').exists()
    import json
    urls = json.loads((tmp_path / 'public/assets/games/starlantern/manifest.json').read_text())['urls']
    assert '/assets/games/starlantern/icon/mech-ward-14.png' in urls and len(urls) == len(F.full_assets())


def test_retire_takes_the_removed_and_the_replaced_plan4_skill_icons_out_of_the_game(tmp_path):
    import subprocess
    public = tmp_path / 'public'; icon = public / 'assets/games/starlantern/icon'; icon.mkdir(parents=True)
    reg = A.Registry(tmp_path / 'r.json')
    for sid in ('triple-slash', 'fire-star', 'potion'):
        Image.new('RGBA', (4, 4)).save(icon / f'{sid}.png')
        reg.set(f'icon-{sid}', status='published', runtime=f'/assets/games/starlantern/icon/{sid}.png', final='x')
    subprocess.run(['git', 'init', '-q'], cwd=public, check=True); subprocess.run(['git', 'add', '-A'], cwd=public, check=True)
    done = F.do_retire(reg, public)
    assert set(done) == {'icon-triple-slash', 'icon-fire-star'}
    assert not (icon / 'triple-slash.png').exists() and not (icon / 'fire-star.png').exists() and (icon / 'potion.png').exists()
    e = reg.get('icon-triple-slash')
    assert e['status'] == 'retired' and 'runtime' not in e and e['retired_runtime'].endswith('triple-slash.png') and 'removed' in e['retired_reason']
    assert 'icon-fire-star-16' in reg.get('icon-fire-star')['retired_reason'] and e['final'] == 'x'      # the source stays
    assert F.do_retire(reg, public) == []                                                          # idempotent


def test_the_published_beat_icon_has_a_stem_at_least_two_pixels_wide():
    """Coordinator 2026-10-24: 拍子's stem at least 2 px at 14. In the rows between the flag and the note head (4-6),
    the stem (each row's first run of coloured, not outline-dark, pixels) is 2+ wide; the sample's a1 had 1, 2, 1."""
    reg = A.Registry(G.REG_PATH)
    a = np.asarray(Image.open(A._final_path(reg.get('icon-mech-beat-14')['final'])).convert('RGBA')).astype(int)
    colour = (a[..., 3] == 255) & (a[..., :3].sum(axis=2) >= 150)

    def first_run(row):
        xs = np.nonzero(row)[0]
        if not len(xs): return 0
        n = 1
        while xs[0] + n < len(row) and row[xs[0] + n]: n += 1
        return n
    assert min(first_run(r) for r in colour[4:7]) >= 2
