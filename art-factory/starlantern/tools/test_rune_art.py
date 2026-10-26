"""Art step 9 (G4): the rune-icon sample sheet, its native 16 / 14 icons and the stop-at-cap rule."""
import json

import numpy as np
import pytest
from PIL import Image

import gear_art as G
import rune_art as R
import sl_art as A

M = (255, 0, 255)


def test_sample_sheet_holds_the_two_slot_states_and_four_runes_in_order():
    job = R.sample_job()
    assert job['id'] == 'sheet-rune-sample' and (job['cols'], job['rows']) == (3, 2)
    assert job['parts'] == ['rune-slot-empty', 'rune-slot-filled', 'rune-flame', 'rune-spread', 'rune-on-crit', 'rune-twin-cast']
    p = job['prompt']
    # Every cell is described, in sheet order, and the sheet keeps the factory's global constraints.
    at = [p.index(R.RUNE_DESC[part]) for part in job['parts']]
    assert at == sorted(at)
    for must in ('#FF00FF', 'No text', 'no numbers', R.STONE, G.ORIGINAL):
        assert must in p, must
    # The approved 5d style anchor and the plan 4 icons are the references (no character art).
    assert job['images'] == [G.GEAR_ANCHOR, G.ICONS_OLD]


def test_a_rune_part_gives_a_battle_and_a_workshop_icon():
    assert R.assets_of('rune-flame') == ['icon-rune-flame-16', 'icon-rune-flame-14']
    assert (A.SKILL_TAB, A.SKILL_TREE) == ((14, 16), (12, 14))


def _sheet(tmp_path):
    """A 3 x 2 magenta sheet of six outlined round stones (the shape the prompt asks for)."""
    img = np.zeros((640, 960, 3), np.uint8); img[:] = M
    yy, xx = np.mgrid[0:200, 0:200]
    disc = (yy - 100) ** 2 + (xx - 100) ** 2
    for r in range(2):
        for c in range(3):
            y0, x0 = 80 + r * 280, 80 + c * 300
            cell = img[y0:y0 + 200, x0:x0 + 200]
            cell[disc <= 96 ** 2] = (20, 20, 30)
            cell[disc <= 84 ** 2] = (90, 100, 130)
            cell[(abs(yy - 100) < 20) & (abs(xx - 100) < 50)] = (240, 200, 90)
    raw = tmp_path / 'sheet-rune-sample-a1.png'; Image.fromarray(img, 'RGB').save(raw)
    return raw


def test_processing_a_sheet_writes_native_icons_that_pass_qa(tmp_path):
    raw = _sheet(tmp_path); reg = A.Registry(tmp_path / 'r.json')
    out = R.process_sheet(reg, raw, tmp_path / 'w', batch='rune-sample')
    assert sorted(out) == sorted(a for p in R.sample_job()['parts'] for a in R.assets_of(p))
    for aid, qa in out.items():
        assert qa['pass'], (aid, qa['reasons'])
        size = 16 if aid.endswith('-16') else 14
        assert Image.open(tmp_path / 'w' / f'{aid}.png').size == (size, size)
        e = reg.get(aid)
        assert e['kind'] == 'skill-cell' and e['batch'] == 'rune-sample' and e['status'] == 'qa_passed' and 'runtime' not in e


def test_consistency_flags_a_rune_far_from_the_skill_icons():
    skills = [{'long': 14, 'short': 13, 'mass': 0.63}, {'long': 14, 'short': 12, 'mass': 0.6}]
    ok = R.consistency({'icon-rune-a-16': {'long': 14, 'short': 13, 'mass': 0.66}}, skills)
    assert ok['icon-rune-a-16']['flags'] == []
    thin = R.consistency({'icon-rune-b-16': {'long': 14, 'short': 7, 'mass': 0.3}}, skills)
    assert set(thin['icon-rune-b-16']['flags']) == {'short side far from the skill icons', 'mass far from the skill icons'}


def test_gen_stops_at_the_attempt_cap_and_never_loops(tmp_path, monkeypatch):
    monkeypatch.setattr(R, 'RAW', tmp_path)
    d = tmp_path / 'sheet-rune-sample'; d.mkdir()
    for k in range(1, R.ATTEMPT_CAP + 1):
        Image.new('RGB', (4, 4), M).save(d / f'sheet-rune-sample-a{k}.png')
    calls = []
    monkeypatch.setattr(R.subprocess, 'run', lambda *a, **k: calls.append(a))
    with pytest.raises(PermissionError, match='attempt cap'):
        R.gen([f'--n={R.ATTEMPT_CAP + 1}'])
    assert calls == []


# --- the full set (user approved the sample style 2026-10-24: 「可以」) -------------------------------------------------

import re
from pathlib import Path


def ts_rune_ids():
    src = (Path(R.REPO) / 'src/scripts/games/starlantern/data/runes.ts').read_text(encoding='utf-8')
    block = src[src.index('export const RUNE_NUMBERS'):]
    block = block[:block.index('\n};')]
    return re.findall(r"^\s+'?([a-z][a-z-]*)'?: \{ tier:", block, re.M)


def test_full_set_draws_every_game_rune_and_both_slot_states_once():
    jobs = R.full_jobs()
    assert [j['id'] for j in jobs] == [f'sheet-rune-{k}' for k in range(1, 7)]
    parts = [p for j in jobs for p in j['parts']]
    drawn = [p for p in parts if p is not None]
    assert len(drawn) == len(set(drawn)) == 34
    assert sorted(drawn) == sorted(['rune-slot-empty', 'rune-slot-filled'] + [f'rune-{i}' for i in ts_rune_ids()])
    assert len(ts_rune_ids()) == 32
    for j in jobs:
        assert len(j['parts']) == j['cols'] * j['rows'] == 6
        assert R.STONE.split(R.SLOT_SENTENCE)[1] in j['prompt'] and R.FULL_RULES in j['prompt'] and 'No text' in j['prompt']
        assert (R.SLOT_SENTENCE in j['prompt']) == ('rune-slot-empty' in j['parts'])
        assert all(R.RUNE_FULL[p] in j['prompt'] for p in j['parts'] if p)
        assert j['images'] == [R.SAMPLE_RAW, G.GEAR_ANCHOR]


def test_redrawn_parts_drop_what_failed_at_14px():
    assert 'no gold edge' in R.RUNE_FULL['rune-twin-cast']


def test_gen_uses_a_new_empty_folder_per_attempt_and_stops_at_two(tmp_path, monkeypatch):
    monkeypatch.setattr(R, 'RAW', tmp_path)
    seen = []

    def fake_run(argv, **kw):
        wd = Path(argv[argv.index('--workdir') + 1]); seen.append((wd, sorted(p.name for p in wd.iterdir()) if wd.exists() else None))
        wd.mkdir(parents=True, exist_ok=True); Image.new('RGB', (4, 4), M).save(wd / argv[argv.index('--name') + 1])
        return type('P', (), {'returncode': 0, 'stdout': '', 'stderr': ''})()
    monkeypatch.setattr(R.subprocess, 'run', fake_run)
    R.gen_full(['--only=sheet-rune-2'])
    R.gen_full(['--only=sheet-rune-2'])
    assert [(w.name, c) for w, c in seen] == [('a1', None), ('a2', None)]
    assert (tmp_path / 'sheet-rune-2' / 'a2' / 'sheet-rune-2-a2.png').exists()
    with pytest.raises(PermissionError, match='attempt cap'):
        R.gen_full(['--only=sheet-rune-2'])
    assert len(seen) == 2


def _icon14(symbol):
    """A 14 x 14 stone (blue-grey, dark outline) with a symbol mask painted in a glow colour."""
    a = np.zeros((14, 14, 4), np.uint8)
    a[1:13, 1:13] = (84, 104, 124, 255)
    a[1, 1:13] = a[12, 1:13] = (10, 12, 22, 255); a[1:13, 1] = a[1:13, 12] = (10, 12, 22, 255)
    for y, x in symbol: a[y, x] = (250, 200, 60, 255)
    return Image.fromarray(a, 'RGBA')


def test_legibility_passes_a_big_bold_symbol():
    bold = [(y, x) for y in range(3, 12) for x in range(3, 12) if abs(y - 7) <= 1 or abs(x - 7) <= 1]
    assert R.legibility(_icon14(bold), 'rune-x')['reasons'] == []


def test_legibility_passes_a_symbol_of_two_deliberate_parts():
    slashes = [(y, x) for y in range(3, 12) for x in range(3, 12) if x - y in (-4, -3, -2, 2, 3, 4)]
    assert R.legibility(_icon14(slashes), 'rune-x')['reasons'] == []


def test_legibility_fails_specks_a_small_symbol_and_a_frame_like_edge():
    specks = [(3, 3), (3, 9), (9, 3), (9, 9), (6, 6), (5, 10), (10, 5)]
    assert 'symbol too small at 14px' in R.legibility(_icon14(specks), 'rune-x')['reasons']
    ell = [(y, x) for y in (9, 10) for x in range(3, 11)] + [(y, x) for y in range(3, 9) for x in (3, 4)]
    dust = ell + [(y, x) for y in (3, 5, 7) for x in (6, 8, 10)]
    assert 'symbol broken into bits at 14px' in R.legibility(_icon14(dust), 'rune-x')['reasons']
    ring = [(y, x) for y in range(2, 12) for x in range(2, 12) if y in (2, 3, 10, 11) or x in (2, 3, 10, 11)]
    assert 'symbol runs along the edge like a frame' in R.legibility(_icon14(ring), 'rune-x')['reasons']


def test_publish_needs_the_recorded_approval_and_writes_the_runtime_paths(tmp_path):
    reg = A.Registry(tmp_path / 'r.json'); public = tmp_path / 'public'
    f = tmp_path / 'f.png'; Image.new('RGBA', (16, 16)).save(f)
    for aid in ('icon-rune-flame-16', 'icon-rune-flame-14'):
        reg.set(aid, final=str(f), status='qa_passed', batch=R.FULL_BATCH, qa={'pass': True}, legible={'reasons': []})
    with pytest.raises(PermissionError):
        R.do_publish(reg, public)
    R.do_approve(reg, by='使用者 2026-10-24「可以」')
    R.do_publish(reg, public)
    e = reg.get('icon-rune-flame-16')
    assert e['status'] == 'published' and e['runtime'] == '/assets/games/starlantern/icon/rune-flame-16.png'
    assert e['approved_by'] == '使用者 2026-10-24「可以」'
    assert (public / 'assets/games/starlantern/icon/rune-flame-14.png').exists()
    assert '/assets/games/starlantern/icon/rune-flame-16.png' in json.loads((public / 'assets/games/starlantern/manifest.json').read_text())['urls']


def test_approve_refuses_an_icon_that_failed_qa_or_legibility(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    reg.set('icon-rune-a-14', status='qa_passed', batch=R.FULL_BATCH, qa={'pass': True}, legible={'reasons': ['symbol too small at 14px']})
    with pytest.raises(PermissionError, match='icon-rune-a-14'):
        R.do_approve(reg, by='x')


def test_the_filled_slot_needs_a_star_larger_than_the_samples():
    def slot(star):
        img = np.asarray(_icon14([])).copy()
        for y, x in star: img[y, x] = (235, 253, 253, 255)
        return Image.fromarray(img, 'RGBA')
    big = [(y, x) for y in range(3, 11) for x in range(3, 11) if abs(y - 6.5) + abs(x - 6.5) <= 3.5]
    small = [(y, x) for y in range(5, 9) for x in range(5, 9) if abs(y - 6.5) + abs(x - 6.5) <= 2]
    assert R.legibility(slot(big), 'rune-slot-filled')['reasons'] == []
    assert R.legibility(slot(small), 'rune-slot-filled')['reasons'] == ['slot star too small at 14px']
