"""Plan 5d (with the 10-19 addendum): gear, material, skill and frame jobs; pick, approve, publish, silhouettes."""
import json, subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import gear_art as G
import sl_art as A

M = (255, 0, 255)


def by_id():
    return {j['id']: j for j in G.jobs()}


def test_every_gear_part_appears_once_and_sheets_match_their_grid():
    jobs = G.jobs()
    gear = [p for j in jobs if j['kind'] == 'gear-sheet' for p in j['parts']]
    assert len(gear) == 69 and len(set(gear)) == 69 and None not in gear
    every = [p for j in jobs for p in j['parts'] if p is not None]
    assert len(every) == len(set(every))                          # no part is drawn twice anywhere
    for j in jobs:
        assert len(j['parts']) == j['cols'] * j['rows'], j['id']
    # Discarded cells (drawn as a plain stone slab and thrown away), as sheet-icons-3 did.
    gaps = {j['id']: j['parts'].count(None) for j in jobs if None in j['parts']}
    assert gaps == {'sheet-skill-noel': 1, 'sheet-skill-rin-2': 2, 'sheet-skill-hero-4': 3}
    mats = [p for j in jobs if j['id'].startswith('sheet-mat-') for p in j['parts']]
    skills = [p for j in jobs if j['id'].startswith('sheet-skill-') for p in j['parts'] if p]
    assert len(mats) == 12 and len(skills) == 78                   # addendum S2: 47 tree + 10 Rin + 21 hero
    assert all(j['kind'] in ('gear-sheet', 'icon-sheet', 'frame-sheet', 'opaque', 'sprite') for j in jobs)
    assert all(j['batch'] in G.BATCHES for j in jobs)


def test_sample_batch_is_the_five_style_jobs():
    # Addendum S3: Scarlet's skill sheet moved to the skills batch.
    assert G.SAMPLE == ('sheet-gear-1', 'sheet-mat-1', 'sheet-rarity-frames', 'scene-forge', 'npc-forge')
    assert tuple(j['id'] for j in G.jobs() if j['batch'] == 'sample') == G.SAMPLE
    main = [j['id'] for j in G.jobs() if j['batch'] == 'main-gear']
    assert main == [f'sheet-gear-{k}' for k in range(2, 9)] + ['sheet-mat-2', 'npc-forge-happy']
    skills = [j['id'] for j in G.jobs() if j['batch'] == 'skills']
    assert len(skills) == 14 and 'sheet-skill-scarlet' in skills
    parts = {b: sum(len(G.assets_of(j, p)) for j in G.jobs() if j['batch'] == b for p in j['parts']) for b in G.BATCHES}
    assert parts == {'sample': 32, 'main-gear': 127, 'skills': 78}


@pytest.mark.parametrize('batch', ['main-gear', 'skills'])
def test_gen_refuses_later_batches_before_the_style_is_approved(tmp_path, monkeypatch, batch):
    reg = A.Registry(tmp_path / 'registry.json'); reg.set('x', status='todo')
    monkeypatch.setattr(G, 'REG_PATH', tmp_path / 'registry.json')
    monkeypatch.setattr(G.subprocess, 'run', lambda *a, **k: pytest.fail('codex must not run'))
    with pytest.raises(PermissionError):
        G.gen([f'--batch={batch}'])
    with pytest.raises(PermissionError):                         # naming a later sheet directly is gated too
        G.gen(['--only=sheet-gear-2'])


def test_set_pieces_share_a_sheet_except_blaze_ring_which_references_sheet_one():
    sheet_of = {p: j['id'] for j in G.jobs() if j['kind'] == 'gear-sheet' for p in j['parts']}
    for sid, first in G.SET_FIRST.items():
        pieces = [p for p in sheet_of if p.startswith(sid + '-')]
        assert len(pieces) == 4 and first == pieces[0] == f'{sid}-{G.SET_SLOTS[sid][0]}'
        sheets = {sheet_of[p] for p in pieces}
        if sid == 'set-blaze':
            assert {sheet_of[p] for p in pieces if p != 'set-blaze-ring'} == {'sheet-gear-1'}
            assert sheet_of['set-blaze-ring'] == 'sheet-gear-6'
        else:
            assert len(sheets) == 1, sid
    six = by_id()['sheet-gear-6']
    assert six['deps'] == ['gear-set-blaze-weapon']                # the approved sheet-one raw is attached
    assert 'attached approved' in six['prompt']


def test_prompts_carry_magenta_no_text_and_originality():
    banned = ['final fantasy', 'dragon quest', 'diablo', 'zelda', 'pokemon', 'octopath', 'chrono', 'ghibli', 'toriyama', 'amano']
    for j in G.jobs():
        assert '#FF00FF' in j['prompt'] and 'No text' in j['prompt'] and 'original' in j['prompt'], j['id']
        assert not any(b in j['prompt'].lower() for b in banned), j['id']


def test_descriptions_cover_every_part_and_weapons_follow_their_kind():
    gear = [p for j in G.jobs() if j['kind'] == 'gear-sheet' for p in j['parts']]
    assert set(G.GEAR_DESC) == set(gear)
    assert set(G.MAT_DESC) == {p for j in G.jobs() if j['id'].startswith('sheet-mat-') for p in j['parts']}
    assert set(G.SKILL_DESC) == {p for j in G.jobs() if j['id'].startswith('sheet-skill-') for p in j['parts'] if p}
    assert set(G.FRAME_DESC) == {'magic', 'rare', 'legendary', 'unique', 'set', 'glow-legendary'}
    # Addendum S5: 晶刃 is a dagger and 星紋軍刀 a scimitar (the hero's weapon mastery reads them at 24 px).
    assert 'dagger' in G.GEAR_DESC['crystal-blade'] and 'sword' not in G.GEAR_DESC['crystal-blade']
    assert 'scimitar' in G.GEAR_DESC['star-saber']
    hero = by_id()['sheet-skill-hero-1']
    assert hero['deps'] == ['char-hero-standee'] and by_id()['sheet-skill-rin-1']['deps'] == ['char-rin-standee']


def test_runtime_paths_follow_the_contract():
    b = '/assets/games/starlantern/'
    assert G.runtime('gear-iron-sword') == b + 'gear/iron-sword.png'
    assert G.runtime('gear-iron-sword-large') == b + 'gear/iron-sword-large.png'
    assert G.runtime('gear-set-blaze-silhouette') == b + 'gear/set-blaze-silhouette.png'
    assert G.runtime('ui-rarity-set') == b + 'ui/rarity-set.png'
    assert G.runtime('ui-glow-legendary') == b + 'ui/glow-legendary.png'
    assert G.runtime('icon-essence-rare') == b + 'icon/essence-rare.png'
    assert G.runtime('scene-forge') == b + 'scene/forge.png'
    assert G.runtime('npc-forge-happy') == b + 'npc/forge-happy.png'
    assert G.runtime('char-noel-standee') is None


def _sheet(path, cols=3, rows=3, cell=120, gap=40):
    """A synthetic codex sheet: one coloured item per cell on flat magenta gutters."""
    w, h = gap + cols * (cell + gap), gap + rows * (cell + gap)
    arr = np.zeros((h, w, 3), np.uint8); arr[:] = M
    for r in range(rows):
        for c in range(cols):
            x, y = gap + c * (cell + gap), gap + r * (cell + gap)
            arr[y + 10:y + cell - 10, x + 30:x + cell - 30] = (40 + 20 * c, 90, 60 + 40 * r)
    path.parent.mkdir(parents=True, exist_ok=True); Image.fromarray(arr, 'RGB').save(path); return path


@pytest.fixture
def factory(tmp_path, monkeypatch):
    for name, p in {'REG_PATH': tmp_path / 'registry.json', 'RAW': tmp_path / 'raw', 'WORK': tmp_path / 'work',
                    'PUBLIC': tmp_path / 'public', 'PLAN_PATH': tmp_path / 'gear-plan.json'}.items():
        monkeypatch.setattr(G, name, p)
    return tmp_path


def test_pick_never_writes_runtime(factory):
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a1.png'); _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a2.png')
    G.pick(['--id', 'sheet-gear-1', '--attempt', '1'])
    reg = A.Registry(factory / 'registry.json')
    for p in by_id()['sheet-gear-1']['parts']:
        for aid in (f'gear-{p}', f'gear-{p}-large'):
            e = reg.get(aid)
            assert 'runtime' not in e and e['batch'] == 'gear-5d-sample' and e['status'] == 'qa_passed', aid
            assert e['chosen_attempt'] == 'a1' and e['source_id'] == 'sheet-gear-1'
    G.pick(['--id', 'sheet-gear-1', '--attempt', '2', '--part', 'leather-cap'])
    reg = A.Registry(factory / 'registry.json')
    assert reg.get('gear-leather-cap')['chosen_attempt'] == 'a2' and reg.get('gear-leather-cap-large')['chosen_attempt'] == 'a2'
    assert reg.get('gear-iron-sword')['chosen_attempt'] == 'a1'
    _sheet(factory / 'raw/sheet-skill-noel/sheet-skill-noel-a1.png', rows=2)
    G.pick(['--id', 'sheet-skill-noel', '--attempt', '1'])
    reg = A.Registry(factory / 'registry.json')
    assert reg.get('icon-flame-wave')['batch'] == 'gear-5d-skills' and 'runtime' not in reg.get('icon-flame-wave')
    assert not any(k.startswith('icon-None') for k in reg.data['assets'])     # the discarded cell is not recorded


def test_note_records_why_an_attempt_was_not_chosen(factory):
    G.note(['--id', 'sheet-gear-1', '--attempt', '2', '--reason', 'swords too thin at 24 px'])
    assert A.Registry(factory / 'registry.json').get('sheet-gear-1')['rejected_attempts'] == {'a2': 'swords too thin at 24 px'}


def _png(path, size=(26, 26)):
    rgba = np.zeros((size[1], size[0], 4), np.uint8); rgba[4:size[1] - 4, 6:size[0] - 6] = (180, 40, 40, 255)
    path.parent.mkdir(parents=True, exist_ok=True); Image.fromarray(rgba, 'RGBA').save(path); return str(path)


def test_publish_requires_approval_and_writes_runtime_then_retires_replaced_base_icons(factory):
    public = factory / 'public'; old = public / 'assets/games/starlantern/icon/iron-sword.png'
    old.parent.mkdir(parents=True); Image.new('RGBA', (4, 4), (1, 2, 3, 255)).save(old)
    subprocess.run(['git', 'init', '-q'], cwd=public, check=True)
    subprocess.run(['git', 'add', 'assets/games/starlantern/icon/iron-sword.png'], cwd=public, check=True)
    reg = A.Registry(factory / 'registry.json')
    reg.set('icon-iron-sword', status='published', runtime='/assets/games/starlantern/icon/iron-sword.png')
    reg.set('icon-moss', status='published', runtime='/assets/games/starlantern/icon/moss.png')
    for aid, size in (('gear-iron-sword', (26, 26)), ('gear-iron-sword-large', (64, 64))):
        reg.set(aid, status='qa_passed', batch='gear-5d-sample', final=_png(factory / 'work' / f'{aid}.png', size))
    reg.set('icon-flame-wave', status='qa_passed', batch='gear-5d-skills', final=_png(factory / 'work/icon-flame-wave.png'))

    with pytest.raises(PermissionError):
        G.do_publish(A.Registry(factory / 'registry.json'), 'sample', public)       # no user approval yet
    with pytest.raises(ValueError):
        G.do_approve(A.Registry(factory / 'registry.json'), 'sample', 'looks fine')  # the user's words need a date
    with pytest.raises(PermissionError):
        G.do_approve(A.Registry(factory / 'registry.json'), 'skills', 'user 2026-10-20: ok')   # style first

    G.do_approve(A.Registry(factory / 'registry.json'), 'sample', 'user 2026-10-20: 可以')
    reg = A.Registry(factory / 'registry.json')
    assert reg.data['style_approved'] and reg.data['approved_batches']['sample']['by'] == 'user 2026-10-20: 可以'
    assert reg.get('gear-iron-sword')['status'] == 'approved' and reg.get('gear-iron-sword')['approved_by'] == 'user 2026-10-20: 可以'
    assert reg.get('icon-flame-wave')['status'] == 'qa_passed'                       # another batch is untouched

    G.do_publish(reg, 'sample', public)
    reg = A.Registry(factory / 'registry.json')
    e = reg.get('gear-iron-sword')
    assert e['status'] == 'published' and e['runtime'] == '/assets/games/starlantern/gear/iron-sword.png'
    assert (public / 'assets/games/starlantern/gear/iron-sword.png').exists()
    assert (public / 'assets/games/starlantern/gear/iron-sword-large.png').exists()
    old_e = reg.get('icon-iron-sword')
    assert old_e['status'] == 'retired' and old_e['retired_reason'] == 'replaced by gear-iron-sword (plan 5d)'
    assert not old.exists() and reg.get('icon-moss')['status'] == 'published'
    urls = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))['urls']
    assert '/assets/games/starlantern/gear/iron-sword.png' in urls and '/assets/games/starlantern/icon/iron-sword.png' not in urls
    assert 'runtime' not in reg.get('icon-flame-wave')


def test_silhouettes_come_only_from_approved_sources_and_are_marked_derived(factory):
    reg = A.Registry(factory / 'registry.json')
    reg.set('gear-blaze-heart-sword', status='approved', batch='gear-5d-sample', final=_png(factory / 'work/a.png'))
    reg.set('gear-set-blaze-weapon', status='qa_passed', batch='gear-5d-sample', final=_png(factory / 'work/b.png'))
    made = G.do_silhouettes(reg)
    assert made == ['gear-blaze-heart-sword-silhouette']
    reg = A.Registry(factory / 'registry.json'); e = reg.get('gear-blaze-heart-sword-silhouette')
    assert e['status'] == 'approved' and e['approved_by'] == 'derived from gear-blaze-heart-sword'
    assert e['batch'] == 'gear-5d-sample' and 'runtime' not in e
    assert 'gear-set-blaze-silhouette' not in reg.data['assets']
    reg.set('gear-set-blaze-weapon', status='approved')
    assert G.do_silhouettes(A.Registry(factory / 'registry.json')) == ['gear-set-blaze-silhouette']


def test_region_limited_and_set_first_name_the_eighteen_silhouettes():
    assert len(G.REGION_LIMITED) == 12 and len(G.SET_FIRST) == 6
    keys = [*G.REGION_LIMITED, *G.SET_FIRST]
    assert len(G.silhouette_ids()) == 18 and G.silhouette_ids() == [f'gear-{k}-silhouette' for k in keys]


def test_review_page_lists_every_part_of_the_batch_and_copies_only_existing_files(factory, monkeypatch):
    import re
    import review_gear as R
    monkeypatch.setattr(R, 'OUT', factory / 'review')
    reg = A.Registry(factory / 'registry.json')
    for p in ('iron-sword', 'blaze-heart-sword', 'set-blaze-weapon'):     # some parts have candidates, the rest do not
        reg.set(f'gear-{p}', status='qa_passed', batch='gear-5d-sample', final=_png(factory / f'work/gear-{p}.png'),
                source={'raw': 'r.png', 'cell': p}, chosen_attempt='a1')
        reg.set(f'gear-{p}-large', status='qa_passed', batch='gear-5d-sample', final=_png(factory / f'work/gear-{p}-large.png', (64, 64)),
                source={'raw': 'r.png', 'cell': p}, chosen_attempt='a1')
    reg.set('ui-rarity-rare', status='qa_passed', batch='gear-5d-sample', final=_png(factory / 'work/ui-rarity-rare.png', (16, 16)))
    reg.set('icon-essence-rare', status='qa_passed', batch='gear-5d-sample', final=str(factory / 'work/missing.png'))   # final gone
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a1.png')
    before = (factory / 'registry.json').read_bytes()

    page_path = R.main('sample')
    page = page_path.read_text(encoding='utf-8')
    assert page_path == factory / 'review/index.html'
    for j in G.jobs():
        for p in j['parts']:
            if p is None: continue
            assert page.count(f'data-part="{p}"') == (1 if j['batch'] == 'sample' else 0), p
    srcs = re.findall(r'src="([^"]*)"', page)
    assert srcs and all(s.startswith('img/') and (factory / 'review' / s).is_file() for s in srcs), [s for s in srcs if not (factory / 'review' / s).is_file()]
    assert 'qa_passed，尚未核准、未發布' in page
    assert 'img/sil-blaze-heart-sword.png' in page                  # silhouette preview made in the page, not the registry
    assert (factory / 'registry.json').read_bytes() == before        # read-only for the registry
    assert 'gear-blaze-heart-sword-silhouette' not in A.Registry(factory / 'registry.json').data['assets']


def test_committed_gear_plan_json_is_current(factory):
    G.plan_json([])
    fresh = json.loads((factory / 'gear-plan.json').read_text(encoding='utf-8'))
    committed = json.loads((Path(G.AF) / 'gear-plan.json').read_text(encoding='utf-8'))
    assert fresh == committed
    assert set(fresh) == {'sheets', 'batches', 'regionLimited', 'setFirst'}
    assert fresh['sheets']['sheet-skill-noel'][-1] is None
    assert b'\r\n' not in (Path(G.AF) / 'gear-plan.json').read_bytes()
