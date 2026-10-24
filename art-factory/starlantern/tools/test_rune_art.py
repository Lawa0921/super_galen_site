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
