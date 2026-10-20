"""Plan 5d (with the 10-19 addendum): gear, material, skill and frame jobs; pick, approve, publish, silhouettes."""
import json, re, subprocess
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
    # No part is drawn twice anywhere, except the starlit overlay, which its own one-piece job redraws (ruling 2026-10-20).
    assert sorted(p for p in set(every) if every.count(p) > 1) == ['starlit']
    assert [j['id'] for j in jobs if 'starlit' in j['parts']] == [G.FRAME_SHEET_ID, G.STARLIT_SHEET_ID]
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


def test_sample_is_the_g1_redo_jobs():
    # Addendum S3: Scarlet's skill sheet moved to the skills batch. Addendum 2: the 4 x 2 frame sheet replaces the 3 x 2 one.
    # Controller ruling 2026-10-20 (after Task E): the starlit overlay is redrawn as its own one-piece job.
    assert G.SAMPLE == ('sheet-gear-1', 'sheet-mat-1', 'sheet-rarity-frames-2', 'sheet-starlit-1', 'scene-forge', 'npc-forge')
    assert 'sheet-rarity-frames' not in [j['id'] for j in G.jobs()]
    assert tuple(j['id'] for j in G.jobs() if j['batch'] == 'sample') == G.SAMPLE
    main = [j['id'] for j in G.jobs() if j['batch'] == 'main-gear']
    assert main == [f'sheet-gear-{k}' for k in range(2, 9)] + ['sheet-mat-2', 'npc-forge-happy']
    skills = [j['id'] for j in G.jobs() if j['batch'] == 'skills']
    assert len(skills) == 14 and 'sheet-skill-scarlet' in skills
    parts = {b: len(set(a for j in G.jobs() if j['batch'] == b for p in j['parts'] for a in G.assets_of(j, p))) for b in G.BATCHES}
    assert parts == {'sample': 34, 'main-gear': 127, 'skills': 78}
    assert len(G.batch_assets('sample')) == 34 == len(set(G.batch_assets('sample')))      # ui-starlit once, from either job


@pytest.mark.parametrize('batch', ['main-gear', 'skills'])
def test_gen_refuses_later_batches_before_the_style_is_approved(factory, monkeypatch, batch):
    # Review minor (c): isolated paths, and the specific refusal (not any PermissionError).
    A.Registry(G.REG_PATH).set('x', status='todo')
    monkeypatch.setattr(G.subprocess, 'run', lambda *a, **k: pytest.fail('codex must not run'))
    with pytest.raises(PermissionError, match='style sample is not approved'):
        G.gen([f'--batch={batch}'])
    with pytest.raises(PermissionError, match=r"style sample is not approved.*sheet-gear-2"):   # naming a later sheet is gated too
        G.gen(['--only=sheet-gear-2'])
    assert not (factory / 'raw').exists() and not G.PROMPTS.exists()             # nothing was drawn or written


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
    assert set(G.FRAME_DESC) == {'magic', 'rare', 'epic', 'legendary', 'unique', 'set', 'glow-legendary', 'starlit'}
    # Addendum S5: 晶刃 is a dagger and 星紋軍刀 a scimitar (the hero's weapon mastery reads them at 24 px). Addendum 2: every
    # item has the same long edge, so the short blades are told apart by proportion; "sword" appears only as the comparison.
    for d in ('crystal-blade', 'shade-silent-blade'):
        desc = G.GEAR_DESC[d]
        assert 'a stubby dagger: a short broad blade and a large hilt, clearly stubbier in proportion than a sword' in desc, d
        assert 'half the length' not in desc and 'sword' not in desc.replace('than a sword', ''), d
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
    assert G.runtime('ui-rarity-epic') == b + 'ui/rarity-epic.png'
    assert G.runtime('ui-starlit') == b + 'ui/starlit.png'
    assert G.runtime('icon-essence-rare') == b + 'icon/essence-rare.png'
    assert G.runtime('scene-forge') == b + 'scene/forge.png'
    assert G.runtime('npc-forge-happy') == b + 'npc/forge-happy.png'
    assert G.runtime('char-noel-standee') is None


def _sheet(path, cols=3, rows=3, cell=120, gap=40, item='octagon'):
    """A synthetic codex sheet: one coloured item per cell on flat magenta gutters. item='octagon' (default) is a chunky
    shape that passes the addendum 2 size gate for every slot (short edge 0.9 of the long one, mass about 0.58);
    item='rect' is the old 60 x 100 bar (too narrow for most slots)."""
    from PIL import ImageDraw
    w, h = gap + cols * (cell + gap), gap + rows * (cell + gap)
    img = Image.new('RGB', (w, h), M); d = ImageDraw.Draw(img)
    for r in range(rows):
        for c in range(cols):
            x, y = gap + c * (cell + gap), gap + r * (cell + gap); col = (40 + 20 * c, 90, 60 + 40 * r)
            if item == 'rect':
                d.rectangle((x + 30, y + 10, x + cell - 31, y + cell - 11), fill=col); continue
            L = cell - 20; W = round(L * 0.9); k = round(L * 0.4); x0, y0 = x + (cell - W) // 2, y + 10
            d.polygon([(x0 + k, y0), (x0 + W - 1 - k, y0), (x0 + W - 1, y0 + k), (x0 + W - 1, y0 + L - 1 - k), (x0 + W - 1 - k, y0 + L - 1),
                       (x0 + k, y0 + L - 1), (x0, y0 + L - 1 - k), (x0, y0 + k)], fill=col)
    path.parent.mkdir(parents=True, exist_ok=True); img.save(path); return path


@pytest.fixture
def factory(tmp_path, monkeypatch):
    # Every path a test can write or delete points into tmp_path, the style anchor included: approve re-makes or removes
    # it, and the real one is attached to every production sheet codex draws.
    for name, p in {'REG_PATH': tmp_path / 'registry.json', 'RAW': tmp_path / 'raw', 'WORK': tmp_path / 'work',
                    'PUBLIC': tmp_path / 'public', 'PLAN_PATH': tmp_path / 'gear-plan.json',
                    'GEAR_ANCHOR': tmp_path / 'raw/gear-refs/gear-anchor.png', 'PROMPTS': tmp_path / 'prompts'}.items():
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


def _spilled_sheet(path, cols=3, rows=2, cell=120, gap=40):
    """Like _sheet (the old rectangles), but every item's outline is a 4 px band blended into the magenta key."""
    _sheet(path, cols, rows, cell, gap, item='rect'); arr = np.asarray(Image.open(path)).copy()
    for r in range(rows):
        for c in range(cols):
            x, y = gap + c * (cell + gap) + 30, gap + r * (cell + gap) + 10
            arr[y:y + 4, x:x + cell - 60] = (110, 20, 120); arr[y:y + cell - 20, x:x + 4] = (250, 42, 136)
    Image.fromarray(arr, 'RGB').save(path); return path


@pytest.mark.parametrize('sid', ['sheet-mat-1', 'sheet-gear-8', 'sheet-rarity-frames-2', 'npc-forge'])
def test_every_plan5d_kind_despills_and_reports_magenta_spill(factory, sid):
    job = by_id()[sid]
    raw = factory / 'raw.png'
    if job['kind'] == 'sprite':
        arr = np.zeros((400, 300, 3), np.uint8); arr[:] = M; arr[60:400, 60:240] = (60, 50, 40)
        arr[60:64, 60:240] = (110, 20, 120); arr[60:400, 60:64] = (250, 42, 136)
        Image.fromarray(arr, 'RGB').save(raw)
    else:
        _spilled_sheet(raw, job['cols'], job['rows'])
    res = G.process_attempt(A.Registry(factory / 'r.json'), job, raw, factory / 'w')
    assert res and all('magenta_spill' in q and q['magenta_spill'] <= A.MAGENTA_SPILL_MAX for q in res.values()), res
    assert all(A.magenta_spill_count(Image.open(factory / 'w' / f'{aid}.png')) <= A.MAGENTA_SPILL_MAX for aid in res)


def test_note_records_why_an_attempt_was_not_chosen(factory):
    G.note(['--id', 'sheet-gear-1', '--attempt', '2', '--reason', 'swords too thin at 24 px'])
    assert A.Registry(factory / 'registry.json').get('sheet-gear-1')['rejected_attempts'] == {'a2': 'swords too thin at 24 px'}


def _png(path, size=(26, 26)):
    rgba = np.zeros((size[1], size[0], 4), np.uint8); rgba[4:size[1] - 4, 6:size[0] - 6] = (180, 40, 40, 255)
    path.parent.mkdir(parents=True, exist_ok=True); Image.fromarray(rgba, 'RGBA').save(path); return str(path)


def _fill(factory, batch, attempt=lambda aid: 'a1'):
    """Every part of a batch picked and qa_passed, each with a small final PNG of its own."""
    reg = A.Registry(G.REG_PATH)
    for j in G.jobs():
        if j['batch'] != batch: continue
        for p in j['parts']:
            for aid in G.assets_of(j, p):
                size = (64, 64) if aid.endswith('-large') else (26, 26)
                reg.set(aid, status='qa_passed', batch=G.label(batch), chosen_attempt=attempt(aid), source_id=j['id'],
                        final=_png(factory / 'work' / j['id'] / f'{aid}.png', size))
    if batch == 'sample':   # the starlit pick the sample may be approved with: the corner-only redraw
        reg.set('ui-starlit', source_id=G.STARLIT_SHEET_ID, qa={'pass': True, 'reasons': [], 'role': 'corners'})
    return reg


@pytest.fixture
def review(factory, monkeypatch):
    import review_gear as R
    monkeypatch.setattr(R, 'OUT', factory / 'review')
    return R


def test_publish_requires_approval_and_writes_runtime_then_retires_replaced_base_icons(factory, review):
    public = factory / 'public'; old = public / 'assets/games/starlantern/icon/iron-sword.png'
    old.parent.mkdir(parents=True); Image.new('RGBA', (4, 4), (1, 2, 3, 255)).save(old)
    subprocess.run(['git', 'init', '-q'], cwd=public, check=True)
    subprocess.run(['git', 'add', 'assets/games/starlantern/icon/iron-sword.png'], cwd=public, check=True)
    reg = _fill(factory, 'sample')
    reg.set('icon-iron-sword', status='published', runtime='/assets/games/starlantern/icon/iron-sword.png')
    reg.set('icon-moss', status='published', runtime='/assets/games/starlantern/icon/moss.png')
    reg.set('icon-flame-wave', status='qa_passed', batch='gear-5d-skills', final=_png(factory / 'work/icon-flame-wave.png'))
    review.main('sample')

    with pytest.raises(PermissionError):
        G.do_publish(A.Registry(factory / 'registry.json'), 'sample', public)       # no user approval yet
    with pytest.raises(ValueError):
        G.do_approve(A.Registry(factory / 'registry.json'), 'sample', 'looks fine')  # the user's words need a date
    with pytest.raises(PermissionError):
        G.do_approve(A.Registry(factory / 'registry.json'), 'skills', 'user 2026-10-20: ok')   # style first

    done = G.do_approve(A.Registry(factory / 'registry.json'), 'sample', 'user 2026-10-20: 可以')
    assert len(done) == 34
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
    assert (public / 'assets/games/starlantern/ui/rarity-set.png').exists() and (public / 'assets/games/starlantern/scene/forge.png').exists()


def _refused(factory, batch='sample'):
    """approve refuses and changes nothing: no approvals, no style flag, no batch record."""
    before = G.REG_PATH.read_bytes()
    with pytest.raises(PermissionError):
        G.do_approve(A.Registry(G.REG_PATH), batch, 'user 2026-10-20: ok')
    reg = A.Registry(G.REG_PATH)
    assert G.REG_PATH.read_bytes() == before
    assert 'style_approved' not in reg.data and 'approved_batches' not in reg.data and 'style_anchor' not in reg.data


def test_approve_refuses_without_the_review_page_record(factory):
    _fill(factory, 'sample'); _refused(factory)


def test_approve_refuses_when_nothing_was_picked(factory, review):
    A.Registry(factory / 'registry.json').set('x', status='todo'); review.main('sample'); _refused(factory)


def test_approve_refuses_an_unpicked_part(factory, review):
    reg = _fill(factory, 'sample'); reg.data['assets'].pop('icon-king-scale'); reg._save()
    review.main('sample'); _refused(factory)


def test_approve_refuses_a_part_that_failed_qa(factory, review):
    reg = _fill(factory, 'sample'); reg.set('ui-rarity-set', status='qa_failed')
    review.main('sample'); _refused(factory)


def test_approve_refuses_a_part_changed_after_the_review_page(factory, review):
    _fill(factory, 'sample'); review.main('sample')
    _png(factory / 'work/sheet-gear-1/gear-iron-sword.png', (24, 24))     # a re-pick after the user looked
    _refused(factory)
    review.main('sample')                                                   # shown again: now it may be approved
    assert G.do_approve(A.Registry(factory / 'registry.json'), 'sample', 'user 2026-10-21: ok')


def test_sample_approval_records_the_style_anchor_attempt_and_the_anchor_uses_it(factory, review):
    reg = _fill(factory, 'sample', attempt=lambda aid: 'a2' if aid.startswith(('gear-iron-sword', 'gear-leather-cap')) else 'a3')
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a2.png', cell=60); _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a3.png')
    with pytest.raises(PermissionError):
        G.make_anchor(reg, factory / 'anchor.png')                          # nothing approved yet
    review.main('sample'); G.do_approve(A.Registry(factory / 'registry.json'), 'sample', 'user 2026-10-20: ok')
    reg = A.Registry(factory / 'registry.json')
    assert reg.data['style_anchor']['attempt'] == 'a3'                      # most of sheet-gear-1 came from a3
    out = G.make_anchor(reg, factory / 'anchor.png')
    src = Image.open(factory / 'raw/sheet-gear-1/sheet-gear-1-a3.png')
    assert Image.open(out).size == (src.width // 2, src.height // 2)


def test_repick_of_an_approved_or_published_part_needs_reopen(factory):
    public = factory / 'public'
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a1.png'); _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a2.png')
    G.pick(['--id', 'sheet-gear-1', '--attempt', '1'])
    reg = A.Registry(factory / 'registry.json')
    reg.set('gear-iron-sword-large', status='approved', approved_by='user 2026-10-20: ok')
    rel = 'assets/games/starlantern/gear/iron-sword.png'; (public / rel).parent.mkdir(parents=True); Image.new('RGBA', (2, 2)).save(public / rel)
    subprocess.run(['git', 'init', '-q'], cwd=public, check=True); subprocess.run(['git', 'add', rel], cwd=public, check=True)
    reg.set('gear-iron-sword', status='published', runtime='/' + rel, approved_by='user 2026-10-20: ok')
    reg.set('gear-blaze-heart-sword', status='published', runtime='/assets/games/starlantern/gear/blaze-heart-sword.png')
    reg.write_manifest(public)
    before = (factory / 'registry.json').read_bytes()
    with pytest.raises(PermissionError):
        G.pick(['--id', 'sheet-gear-1', '--attempt', '2', '--part', 'iron-sword'])
    assert (factory / 'registry.json').read_bytes() == before and (public / rel).exists()
    G.pick(['--id', 'sheet-gear-1', '--attempt', '2', '--part', 'iron-sword', '--reopen'])
    reg = A.Registry(factory / 'registry.json')
    for aid in ('gear-iron-sword', 'gear-iron-sword-large'):
        e = reg.get(aid)
        assert e['status'] == 'qa_passed' and e['chosen_attempt'] == 'a2' and 'runtime' not in e and 'approved_by' not in e, aid
        assert e['history'][-1]['status'] in ('approved', 'published') and 'retired_runtime' not in e
    assert reg.get('gear-iron-sword')['history'][-1]['runtime'] == '/' + rel
    assert not (public / rel).exists()
    urls = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))['urls']
    assert urls == ['/assets/games/starlantern/gear/blaze-heart-sword.png']
    assert reg.get('gear-blaze-heart-sword')['status'] == 'published'          # other parts are untouched


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
    assert '尚未核准、未發布' in page and 'qa_passed，' not in page               # plain title (G2 visual check)
    assert 'img/sil-blaze-heart-sword.png' in page                  # silhouette preview made in the page, not the registry
    assert Image.open(factory / 'review/img/sil-blaze-heart-sword.png').size == (28, 28)
    assert re.search(r'\.li\{\{?zoom:2;', page) and not re.search(r'\.li\{[^}]*width', page)    # shown at 2x its native 28 px
    shown = json.loads(G.shown_path('sample').read_text(encoding='utf-8'))['parts']
    assert set(shown) == {'gear-iron-sword', 'gear-iron-sword-large', 'gear-blaze-heart-sword', 'gear-blaze-heart-sword-large',
                          'gear-set-blaze-weapon', 'gear-set-blaze-weapon-large', 'ui-rarity-rare'}       # only files that exist
    assert shown['gear-iron-sword'] == G.sha256(factory / 'work/gear-iron-sword.png')
    assert (factory / 'registry.json').read_bytes() == before        # read-only for the registry
    assert 'gear-blaze-heart-sword-silhouette' not in A.Registry(factory / 'registry.json').data['assets']


# --- fix round 2: nothing the user did not see can be published --------------------------------------------------------
@pytest.fixture
def rooted(factory, monkeypatch):
    """sl_art's own CLI paths point into the temp factory: registry at ROOT/registry.json, public at ROOT/../../public."""
    monkeypatch.setattr(A, 'ROOT', factory / 'af' / 'sl'); monkeypatch.setattr(G, 'REG_PATH', factory / 'af/sl/registry.json')
    public = factory / 'public'; public.mkdir(parents=True, exist_ok=True)
    subprocess.run(['git', 'init', '-q'], cwd=public, check=True)
    return public


def _reg():
    return A.Registry(G.REG_PATH)


def _track(public):
    subprocess.run(['git', 'add', '-A'], cwd=public, check=True)


def _approved_and_published(factory, review, public):
    _fill(factory, 'sample'); review.main('sample')
    G.do_approve(_reg(), 'sample', 'user 2026-10-20: ok'); G.do_publish(_reg(), 'sample', public); _track(public)


def test_reopen_repick_then_old_approve_and_publish_cannot_ship_an_unseen_image(factory, review, rooted):
    public = rooted; gear = public / 'assets/games/starlantern/gear/iron-sword.png'
    _approved_and_published(factory, review, public)
    assert gear.exists() and _reg().get('gear-iron-sword')['status'] == 'published'
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a2.png')
    G.pick(['--id', 'sheet-gear-1', '--attempt', '2', '--part', 'iron-sword', '--reopen'])     # 1 reopen, 2 re-pick
    reg = _reg()
    assert 'sample' not in reg.data.get('approved_batches', {})                                  # the batch approval is stale
    assert reg.data['stale_approvals'][-1]['batch'] == 'sample' and not gear.exists()
    with pytest.raises(PermissionError):
        A.main(['approve', '--id', 'gear-iron-sword'])                                           # 3 the old per-id approve
    reg.set('gear-iron-sword', status='approved')                                                # even if it got through
    with pytest.raises(PermissionError):
        A.main(['publish', '--approved'])                                                        # the old publish
    with pytest.raises(PermissionError):
        G.do_publish(_reg(), 'sample', public)                                                   # 4 no current approval
    reg = _reg(); reg.data['approved_batches'] = {'sample': reg.data['stale_approvals'][-1]}; reg._save()
    with pytest.raises(PermissionError):
        G.do_publish(_reg(), 'sample', public)                                                   # an old approval: wrong hash
    assert not gear.exists() and _reg().get('gear-iron-sword')['status'] != 'published'


def test_publish_rehashes_every_file_and_refuses_the_whole_batch_on_a_mismatch(factory, review, rooted):
    public = rooted
    _fill(factory, 'sample'); review.main('sample'); G.do_approve(_reg(), 'sample', 'user 2026-10-20: ok')
    _png(factory / 'work/sheet-gear-1/gear-leather-cap.png', (24, 24))          # changed after the user approved
    before = G.REG_PATH.read_bytes()
    with pytest.raises(PermissionError, match='gear-leather-cap'):
        G.do_publish(_reg(), 'sample', public)
    assert G.REG_PATH.read_bytes() == before and not (public / 'assets').exists()      # atomic: nothing went out
    reg = _reg(); reg.data['approved_batches']['sample'].pop('shown'); reg._save()   # an approval without the image record
    _png(factory / 'work/sheet-gear-1/gear-leather-cap.png')
    with pytest.raises(PermissionError):
        G.do_publish(_reg(), 'sample', public)
    assert not (public / 'assets').exists()


def test_publish_refuses_a_silhouette_not_derived_from_the_approved_icon(factory, review, rooted):
    public = rooted
    _fill(factory, 'sample'); review.main('sample'); G.do_approve(_reg(), 'sample', 'user 2026-10-20: ok')
    assert 'gear-blaze-heart-sword-silhouette' in G.do_silhouettes(_reg())
    sil = A._final_path(_reg().get('gear-blaze-heart-sword-silhouette')['final']); _png(sil, (28, 28))
    with pytest.raises(PermissionError, match='silhouette'):
        G.do_publish(_reg(), 'sample', public)
    assert not (public / 'assets').exists()


def test_old_sl_art_approve_and_publish_refuse_plan5d_parts(factory, rooted):
    public = rooted; reg = _reg()
    reg.set('gear-x', status='qa_passed', batch='gear-5d-sample', final=_png(factory / 'work/x.png'))
    reg.set('gear-y', status='published', batch='gear-5d-sample', runtime='/assets/games/starlantern/gear/y.png')
    for aid in ('gear-x', 'gear-y'):                         # qa_passed -> approved and published -> approved
        with pytest.raises(PermissionError, match='gear_art.py'):
            reg.approve(aid)
    assert reg.get('gear-y')['status'] == 'published'
    reg.set('bg-f9', status='approved', final=_png(factory / 'work/f9.png'), runtime='/assets/games/starlantern/bg/f9.png')
    reg.set('gear-z', status='approved', batch='gear-5d-main-gear', final=_png(factory / 'work/z.png'))   # no runtime yet
    with pytest.raises(PermissionError, match='gear_art.py'):
        A.main(['publish', '--approved'])
    assert not (public / 'assets/games/starlantern/bg/f9.png').exists() and _reg().get('bg-f9')['status'] == 'approved'
    with pytest.raises(PermissionError):
        _reg().publish('gear-z', public)
    with pytest.raises(ValueError, match='runtime'):         # a clear error, not a KeyError
        _reg().publish('gear-z', public, plan5d=True)


def test_pick_reopen_validates_before_it_changes_anything(factory, rooted):
    public = rooted
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a1.png'); _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a2.png')
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a3.png', cols=2, rows=2)          # a raw that does not slice 3x3
    G.pick(['--id', 'sheet-gear-1', '--attempt', '1'])
    rel = 'assets/games/starlantern/gear/iron-sword.png'; (public / rel).parent.mkdir(parents=True); Image.new('RGBA', (2, 2)).save(public / rel)
    reg = _reg(); reg.set('gear-iron-sword', status='published', runtime='/' + rel)    # not tracked by git
    reg.set('gear-iron-sword-large', status='approved'); reg.set('gear-leather-cap', status='approved')
    reg.data['approved_batches'] = {'sample': {'by': 'user 2026-10-20', 'shown': {}}}; reg._save()
    before = G.REG_PATH.read_bytes()
    with pytest.raises(PermissionError, match='not tracked'):
        G.pick(['--id', 'sheet-gear-1', '--attempt', '2', '--part', 'iron-sword', '--reopen'])
    assert G.REG_PATH.read_bytes() == before and (public / rel).exists()
    with pytest.raises(ValueError, match='expected 3x3'):
        G.pick(['--id', 'sheet-gear-1', '--attempt', '3', '--part', 'leather-cap', '--reopen'])
    assert G.REG_PATH.read_bytes() == before


def test_reopening_a_published_base_gear_icon_brings_back_the_old_icon(factory, review, rooted):
    public = rooted; old = public / 'assets/games/starlantern/icon/iron-sword.png'
    old.parent.mkdir(parents=True); Image.new('RGBA', (4, 4), (9, 9, 9, 255)).save(old); _track(public)
    _reg().set('icon-iron-sword', status='published', runtime='/assets/games/starlantern/icon/iron-sword.png',
               final=_png(factory / 'work/sheet-icons-3/icon-iron-sword.png', (35, 37)))
    _approved_and_published(factory, review, public)
    assert _reg().get('icon-iron-sword')['status'] == 'retired' and not old.exists()
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a2.png')
    G.pick(['--id', 'sheet-gear-1', '--attempt', '2', '--part', 'iron-sword', '--reopen'])
    e = _reg().get('icon-iron-sword')
    assert e['status'] == 'published' and e['runtime'] == '/assets/games/starlantern/icon/iron-sword.png' and 'retired_runtime' not in e
    assert old.exists() and e['history'][-1]['restored_because'] == 'gear-iron-sword reopened (plan 5d)'
    urls = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))['urls']
    assert '/assets/games/starlantern/icon/iron-sword.png' in urls and '/assets/games/starlantern/gear/iron-sword.png' not in urls
    assert '/assets/games/starlantern/gear/leather-cap.png' in urls                  # the rest of the batch stays out there


def test_reapproving_the_sample_with_another_anchor_rebuilds_the_anchor(factory, review, monkeypatch):
    anchor = factory / 'raw/gear-refs/gear-anchor.png'; monkeypatch.setattr(G, 'GEAR_ANCHOR', anchor)
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a2.png', cell=60); _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a3.png')
    a2, a3 = (Image.open(factory / f'raw/sheet-gear-1/sheet-gear-1-a{k}.png').size for k in (2, 3))
    _fill(factory, 'sample', attempt=lambda aid: 'a3'); review.main('sample')
    G.do_approve(_reg(), 'sample', 'user 2026-10-20: ok'); G.make_anchor(_reg())      # gen builds it from the record
    assert Image.open(anchor).size == (a3[0] // 2, a3[1] // 2)
    reg = _reg()
    for p in G.GEAR_SHEETS['sheet-gear-1']:
        for aid in (f'gear-{p}', f'gear-{p}-large'): reg.set(aid, chosen_attempt='a2')
    review.main('sample'); G.do_approve(_reg(), 'sample', 'user 2026-10-21: the a2 sheet')
    assert _reg().data['style_anchor']['attempt'] == 'a2' and Image.open(anchor).size == (a2[0] // 2, a2[1] // 2)


def test_sample_review_page_opens_with_the_decisions_and_shows_honest_previews(factory, review, monkeypatch):
    import re
    real = json.loads((G.AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    reg = _fill(factory, 'sample')
    for b in G.GEAR_BASE:                          # the 15 old base icons, as in the real registry
        if f'icon-{b}' in real: reg.set(f'icon-{b}', **{k: real[f'icon-{b}'][k] for k in ('status', 'runtime', 'final') if k in real[f'icon-{b}']})
    page = review.main('sample').read_text(encoding='utf-8')
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    # Addendum 2 §6: the G1 redo asks three questions; style, Doran and the 15 old icons were decided on 2026-10-20.
    for q in ('圖示大小是否一致', '七階外框與星輝', '傳說光暈改在格內', '已決定（2026-10-20）', '多蘭的外型', '15 件舊底材圖示全部換新'):
        assert q in head, q
    for s in ('#size', '#s1', '#frames', '#glow'):
        assert f'href="{s}"' in head and f'id="{s[1:]}"' in page
    for risk in ('短寬刃、大握柄', '戒指、項鍊', '緋紅', '偏粉的紫', '不再伸進隔壁格'):
        assert risk in head, risk
    olds = re.findall(r'data-old-icon="([a-z-]+)"', page)
    assert len(olds) == 15 and len(set(olds)) == 15
    assert '本批換掉 1 件舊底材圖示' in page                                          # plain §2 note (G2 visual check)
    assert '>G<' not in page and '40 G' in page                                   # iron sword's real price
    assert re.search(r'\.screen\{[^}]*flex-wrap:wrap', page) and '<div class="scroll"><div class="zoom3"><div class="screen">' in page   # 3x scrolls in its own box
    # Addendum 2: the glow sits inside the slot (inset 0) under the icon; the frame and the starlit overlay go over it.
    assert re.search(r'\.rg\{[^}]*inset:0', page) and 'inset:-3px' not in page and 'class="glow-pair' in page
    assert re.search(r'\.rf\{[^}]*border-image-repeat:repeat', page) and 'border-image-repeat:round' not in page
    cell = re.search(r'<div class="cell bag"[^>]*>(.*?)</div>', page[page.index('class="glow-pair'):], re.S).group(1)
    assert cell.index('class="rg"') < cell.index('class="px gi"') < cell.index('class="rf"')


def test_skills_review_page_shows_all_78_icons_each_under_its_owner(factory, review):
    import re
    _fill(factory, 'skills')
    page = review.main('skills').read_text(encoding='utf-8')
    names = review.names()
    figs = re.findall(r'<figure data-skill="([a-z0-9-]+)" data-owner="([a-z]+)"><img class="px" src="(img/[^"]+)"', page)
    assert len(figs) == 78
    want = {s: o for o, (_, ids) in G.SKILL_OWNERS.items() for s in ids}
    assert {s: o for s, o, _ in figs} == want
    for s in ('abyss-sword', 'abyss-guard', 'abyss-star', 'abyss-light', 'abyss-chain'):      # `abyss: true` comes before `name`
        assert names[s] and want[s] == 'hero' and review.skill_owners()[s] == 'hero'
    assert all(names.get(s) for s in want)
    assert names['abyss-sword'] in page


# --- plan 5d addendum 2, Task C: uniform gear prompt, slots, seven-tier frames, starlit -----------------------------------
def test_frame_sheet_is_four_by_two_with_epic_and_starlit():
    job = by_id()[G.FRAME_SHEET_ID]
    assert G.FRAME_SHEET_ID == 'sheet-rarity-frames-2' and (job['cols'], job['rows']) == (4, 2) and job['batch'] == 'sample'
    assert job['parts'] == ['magic', 'rare', 'epic', 'legendary', 'unique', 'set', 'glow-legendary', 'starlit']
    ids = [a for p in job['parts'] for a in G.assets_of(job, p)]
    assert ids == ['ui-rarity-magic', 'ui-rarity-rare', 'ui-rarity-epic', 'ui-rarity-legendary', 'ui-rarity-unique', 'ui-rarity-set',
                   'ui-glow-legendary', 'ui-starlit']
    assert len(G.batch_assets('sample')) == 34
    assert G.FRAME_ROLE == {'glow-legendary': ('glow', 16, 5, 2), 'starlit': ('overlay', 16, 5, 0)}
    assert all(G.frame_role(p) == ('frame', 16, 5, 0) for p in job['parts'][:6])
    assert G.LARGE == (56, 64) and G.ICON == (22, 26)


def test_every_gear_part_has_a_slot():
    gear = {p for j in G.jobs() if j['kind'] == 'gear-sheet' for p in j['parts']}
    assert set(G.GEAR_SLOT) == gear and len(gear) == 69
    for sid, slots in G.SET_SLOTS.items():
        for slot in slots:
            assert G.GEAR_SLOT[f'{sid}-{slot}'] == slot
    assert set(G.GEAR_SLOT.values()) <= set(A.SUBJECT_CLASS)
    assert G.GEAR_SLOT['lg-sylvie'] == 'offhand' and G.GEAR_SLOT['iron-unbroken-shield'] == 'offhand'   # a quiver; a shield
    assert G.plan_data()['slots'] == G.GEAR_SLOT


def test_gear_prompt_asks_for_uniform_chunky_items():
    for j in G.jobs():
        if j['kind'] != 'gear-sheet': continue
        for phrase in ('same scale', 'nine tenths', '2-pixel dark outline', 'magenta lanes', 'at least three quarters as wide as it is tall'):
            assert phrase in j['prompt'], (j['id'], phrase)
        assert 'reads at 24 pixels' not in j['prompt'] and 'about 64 by 64 art pixels each' in j['prompt']
    assert G.SET_NOUN['body'] == 'a chunky front-facing breastplate' and G.SET_NOUN['hands'] == 'a pair of chunky gauntlets side by side'


def test_frame_prompt_names_each_tier_colour_and_ornament():
    prompt = by_id()[G.FRAME_SHEET_ID]['prompt']
    for r in ('magic', 'rare', 'epic', 'legendary', 'unique', 'set'):
        assert G.RARITY_PALETTE[r].upper() in prompt, r
    assert 'never magenta' in prompt and '16 by 16 big pixels' in prompt and 'A 4 by 2 grid of eight' in prompt
    assert 'four-pointed cyan-white star' in prompt and '12 by 12 big-pixel square ring' in prompt
    assert prompt.index('#3F7FFF') < prompt.index('#FFE03A') < prompt.index('#8A5CFF') < prompt.index('#FF7A14') < prompt.index('#D8283A')


def _rgb(hexc):
    return tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5))


def test_palette_is_distinct_and_epic_stays_off_the_key():
    assert list(G.RARITY_PALETTE) == ['common', 'magic', 'rare', 'epic', 'legendary', 'unique', 'set']
    framed = {r: _rgb(c) for r, c in G.RARITY_PALETTE.items() if r != 'common'}
    assert not any(A.frames_distinct(framed).values())
    des = sorted(A.delta_e(framed[a], framed[b]) for i, a in enumerate(framed) for b in list(framed)[i + 1:])
    assert des[0] >= A.DISTINCT_DE and des[0] == pytest.approx(32.9, abs=0.5)
    assert 250 <= A.band_hue(np.array([framed['epic']], np.uint8)) <= 272
    rgba = np.array([[(*_rgb(c), 255) for c in [*G.RARITY_PALETTE.values(), *G.STARLIT]]], np.uint8)
    assert not A._magenta_tint(rgba[..., :3]).any() and not A.magenta_spill(rgba).any()
    assert {r: round(A.band_hue(np.array([c], np.uint8))) for r, c in framed.items()} == G.FRAME_HUE
    assert G.FRAME_HUE == {'magic': 220, 'rare': 51, 'epic': 257, 'legendary': 26, 'unique': 354, 'set': 131} and G.GLOW_HUE == 35


def test_process_attempt_gives_each_gear_cell_its_slot(factory, monkeypatch):
    seen = {}
    def fake(reg, gid, cell, workdir, raw, large=None, icon=None, slot='missing', kind='missing'):
        seen[gid] = (slot, kind, large, icon); return {f'gear-{gid}': {'pass': True, 'reasons': []}}
    monkeypatch.setattr(A, 'process_gear_cell', fake)
    raw = _sheet(factory / 'raw.png')
    G.process_attempt(A.Registry(factory / 'r.json'), by_id()['sheet-gear-1'], raw, factory / 'w')
    assert seen == {p: (G.GEAR_SLOT[p], G.GEAR_KIND.get(p), G.LARGE, G.ICON) for p in G.GEAR_SHEETS['sheet-gear-1']}
    assert seen['lg-chizuru'][1] == 'spear' and seen['iron-sword'][1] == 'sword' and seen['leather-cap'][1] is None


STAR_CORE, STAR_ARM = (232, 251, 255), (127, 230, 255)


def _frame_art(part, colour):
    """Art-pixel map {(y, x): rgb} of one frame-sheet cell (10 raw px per art px)."""
    art = {}
    if part == 'glow-legendary':
        for i in range(12):
            for k in (0, 11): art[(k, i)] = colour; art[(i, k)] = colour
    elif part == 'starlit':
        for cy, cx in ((2, 2), (2, 13), (13, 2), (13, 13)):
            for d in (-2, -1, 1, 2): art[(cy + d, cx)] = STAR_ARM; art[(cy, cx + d)] = STAR_ARM
            art[(cy, cx)] = STAR_CORE
        for y, x in ((1, 8), (14, 7), (8, 1), (7, 14)): art[(y, x)] = STAR_CORE
    else:
        for i in range(16):
            for k in (0, 1, 14, 15): art[(k, i)] = colour; art[(i, k)] = colour
    return art


def _frame_sheet(path, colours):
    """A synthetic 4 x 2 frame sheet: each cell drawn on a 200 px pitch, 10 raw px per art pixel, magenta gutters."""
    arr = np.zeros((40 + 2 * 200, 40 + 4 * 200, 3), np.uint8); arr[:] = M
    for k, part in enumerate(G.job_by_id(G.FRAME_SHEET_ID)['parts']):
        oy, ox = 40 + (k // 4) * 200, 40 + (k % 4) * 200
        for (y, x), c in _frame_art(part, colours.get(part, (255, 200, 120))).items():
            arr[oy + y * 10:oy + y * 10 + 10, ox + x * 10:ox + x * 10 + 10] = c
    path.parent.mkdir(parents=True, exist_ok=True); Image.fromarray(arr, 'RGB').save(path); return path


def test_frame_sheet_passes_seven_tiers_glow_and_starlit_with_their_roles(factory):
    colours = {r: _rgb(c) for r, c in G.RARITY_PALETTE.items()}
    res = G.process_attempt(A.Registry(factory / 'r.json'), by_id()[G.FRAME_SHEET_ID], _frame_sheet(factory / 'raw.png', colours), factory / 'w')
    assert set(res) == {'ui-rarity-magic', 'ui-rarity-rare', 'ui-rarity-epic', 'ui-rarity-legendary', 'ui-rarity-unique', 'ui-rarity-set',
                        'ui-glow-legendary', 'ui-starlit'}
    assert all(q['pass'] for q in res.values()), {a: q['reasons'] for a, q in res.items()}
    assert res['ui-glow-legendary']['role'] == 'glow' and res['ui-glow-legendary']['pad'] == 2 and res['ui-starlit']['role'] == 'overlay'
    assert res['ui-rarity-epic']['tier_hue'] == 257 and res['ui-rarity-legendary']['tier_hue'] == 26


def test_frames_the_strong_defringe_would_peel_use_the_default_one(factory):
    # #8A5CFF is 117 from the key on its worst channel: the strong UI defringe (near-magenta 120, 3 passes) would eat the
    # 2 px epic band from the outside in. Every other tier colour is far from the key and keeps the strong defringe.
    assert {p: G.frame_defringe(p) for p in G.job_by_id(G.FRAME_SHEET_ID)['parts']} == {
        'magic': 'strong', 'rare': 'strong', 'epic': 'default', 'legendary': 'strong', 'unique': 'strong', 'set': 'strong',
        'glow-legendary': 'strong', 'starlit': 'strong'}
    colours = {r: _rgb(c) for r, c in G.RARITY_PALETTE.items()}
    reg = A.Registry(factory / 'r.json')
    G.process_attempt(reg, by_id()[G.FRAME_SHEET_ID], _frame_sheet(factory / 'raw.png', colours), factory / 'w')
    assert reg.get('ui-rarity-epic')['defringe'] == 'default' and reg.get('ui-rarity-magic')['defringe'] == 'strong'
    assert reg.get('ui-rarity-epic')['qa']['stroke'] == [2, 2]


def test_frame_sheet_marks_two_close_frames_failed(factory):
    colours = {r: _rgb(c) for r, c in G.RARITY_PALETTE.items()}
    colours.update(rare=(255, 170, 30), legendary=(255, 175, 40))     # both inside their own hue window, nearly the same colour
    reg = A.Registry(factory / 'r.json')
    res = G.process_attempt(reg, by_id()[G.FRAME_SHEET_ID], _frame_sheet(factory / 'raw.png', colours), factory / 'w')
    for aid, other in (('ui-rarity-rare', 'ui-rarity-legendary'), ('ui-rarity-legendary', 'ui-rarity-rare')):
        assert any(r.startswith(f'too close to {other} (ΔE ') for r in res[aid]['reasons']) and not res[aid]['pass'], res[aid]
        assert reg.get(aid)['status'] == 'qa_failed'
        saved = json.loads((factory / 'w' / f'{aid}.qa.json').read_text(encoding='utf-8'))
        assert saved['reasons'] == res[aid]['reasons'] and not saved['pass']
    assert res['ui-rarity-magic']['pass'] and reg.get('ui-rarity-magic')['status'] == 'qa_passed'


# --- plan 5d addendum 2, Task D: size-consistency grid, seven-tier frames, contained glow ---------------------------------
def _icon_entry(factory, part, batch='gear-5d-sample', status='qa_passed', reasons=(), box=(2, 4, 24, 22)):
    long_, short = max(box[2] - box[0], box[3] - box[1]), min(box[2] - box[0], box[3] - box[1])
    qa = {'pass': not reasons, 'reasons': list(reasons), 'size': [26, 26], 'scale': 9.1,
          'subject': {'long': long_, 'short': short, 'mass': 0.61, 'box': list(box), 'centre_off': 0.0}}
    return dict(status=status, batch=batch, final=_png(factory / f'work/gear-{part}.png'), qa=qa, chosen_attempt='a5')


def _size_page(factory, reg_assets):
    import review_gear as R
    out = factory / 'review'; (out / 'img').mkdir(parents=True, exist_ok=True)
    return R.size_grid(R.Page(out, reg_assets), reg_assets)


def _size_cells(page):
    import re
    return re.findall(r'<figure class="([^"]*)" data-size-cell="([a-z0-9-]+)">(.*?)</figure>', page, re.S)


def test_size_grid_boxes_every_gear_icon_at_1x_and_3x(factory):
    reg = {'gear-iron-sword': _icon_entry(factory, 'iron-sword'), 'gear-leather-cap': _icon_entry(factory, 'leather-cap'),
           'gear-iron-unbroken-shield': _icon_entry(factory, 'iron-unbroken-shield', status='qa_failed', reasons=['subject too narrow'],
                                                    box=(7, 2, 18, 24)),
           'gear-iron-sword-large': {**_icon_entry(factory, 'iron-sword-large'), 'final': _png(factory / 'work/gear-iron-sword-large.png', (64, 64))}}
    page = _size_page(factory, reg)
    assert page.startswith('<section id="size">')
    cells = _size_cells(page)
    for p in ('iron-sword', 'leather-cap', 'iron-unbroken-shield'):
        mine = [c for c in cells if c[1] == p]
        assert len(mine) == 2 and all('class="bbox"' in body and 'class="target"' in body for _, _, body in mine), p
    assert {c[1] for c in cells} == {'iron-sword', 'leather-cap', 'iron-unbroken-shield'}      # the large image is its own row
    assert all('out' in cls.split() for cls, p, _ in cells if p == 'iron-unbroken-shield')
    assert not any('out' in cls.split() for cls, p, _ in cells if p != 'iron-unbroken-shield')
    assert 'left:7px;top:2px;width:11px;height:22px' in page and 'left:21px;top:6px;width:33px;height:66px' in page   # 1x and 3x
    assert 'data-size-large="iron-sword"' in page and 'data-size-sil="iron-sword"' in page
    shield = next(body for cls, p, body in cells if p == 'iron-unbroken-shield')
    assert '22' in shield and '11' in shield and '0.61' in shield


def test_size_grid_includes_other_batches_and_old_icons(factory):
    reg = {'gear-iron-sword': _icon_entry(factory, 'iron-sword'),
           'gear-thorn-spear': _icon_entry(factory, 'thorn-spear', batch='gear-5d-main-gear'),
           'gear-star-ring': _icon_entry(factory, 'star-ring', batch='gear-5d-main-gear', status='retired'),
           'gear-moss-charm': _icon_entry(factory, 'moss-charm', batch='gear-5d-main-gear', status='rejected'),
           'icon-iron-sword': {'status': 'published', 'runtime': '/assets/games/starlantern/icon/iron-sword.png',
                               'final': _png(factory / 'work/sheet-icons-3/icon-iron-sword.png', (35, 37))}}
    page = _size_page(factory, reg)
    parts = {p for _, p, _ in _size_cells(page)}
    assert parts == {'iron-sword', 'thorn-spear'}
    assert 'data-old="iron-sword"' in page and page.count('data-old=') == 1


def test_frames_section_shows_seven_tiers_and_starlit_on_three(factory, review):
    import re
    _fill(factory, 'sample')
    page = review.main('sample').read_text(encoding='utf-8')
    sec = page[page.index('<section id="frames">'):]
    sec = sec[:sec.index('</section>')]
    assert re.findall(r'data-tier="([a-z]+)"', sec) == ['common', 'magic', 'rare', 'epic', 'legendary', 'unique', 'set']
    assert re.findall(r'data-starlit="([a-z]+)"', sec) == ['legendary', 'unique', 'set']
    for r in ('magic', 'rare', 'epic', 'legendary', 'unique', 'set'):
        assert G.RARITY_PALETTE[r] in sec, r
    assert 'class="rs"' in sec and 'img/ui-starlit.png' in sec
    common = re.search(r'data-tier="common".*?</figure>', sec, re.S).group(0)
    assert 'class="rf' not in common                                       # common has no frame


def test_sample_decisions_are_the_g1_redo_questions(factory, review):
    import re
    _fill(factory, 'sample')
    page = review.main('sample').read_text(encoding='utf-8')
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    asked = head[:head.index('已決定（2026-10-20）')]
    assert re.findall(r'<li><b>([^<]+)</b>', asked) == ['圖示大小是否一致', '七階外框與星輝', '傳說光暈改在格內']
    decided = head[head.index('已決定（2026-10-20）'):]
    assert len(re.findall(r'<li>', decided)) == 4                  # + materials unchanged (controller ruling 2026-10-20)
    for s in ('#size', '#s1', '#frames', '#glow'):
        assert f'href="{s}"' in head and f'id="{s[1:]}"' in page, s
    assert 'gear_art.py approve --batch sample' in head


# --- addendum 2 fix round 1 -----------------------------------------------------------------------------------------------
def _outlined_frame(colour, layers, box=160, margin=8):
    arr = np.zeros((box + 2 * margin, box + 2 * margin, 3), np.uint8); arr[:] = M; r = arr[margin:margin + box, margin:margin + box]
    d = 0
    for t, c in layers + [(20, colour)]:
        r[d:d + t, d:box - d] = c; r[box - d - t:box - d, d:box - d] = c; r[d:box - d, d:d + t] = c; r[d:box - d, box - d - t:box - d] = c
        d += t
    return Image.fromarray(arr, 'RGB')


@pytest.mark.parametrize('outline', [(22, 16, 30), (8, 6, 12)])
def test_every_tier_with_a_dark_outer_outline_passes_hue_and_distinctness(tmp_path, outline):
    """Fix round 1: a 1 art-px near-black outline outside the 2 px tier band must not become the measured colour."""
    colours = {}
    for r in G.FRAMED_RARITIES:
        aid = G.FRAME_ASSET[r]; reg = A.Registry(tmp_path / f'{r}.json'); reg.set(aid, defringe=G.frame_defringe(r))
        q = A.nine_slice(reg, aid, _outlined_frame(_rgb(G.RARITY_PALETTE[r]), [(10, outline)]), tmp_path / 'w', tmp_path / 'raw.png',
                         16, 5, hue=G.FRAME_HUE[r])
        assert q['pass'] and q['stroke'] == [3, 3] and q['stroke_colour'] == list(_rgb(G.RARITY_PALETTE[r])), (r, q['reasons'], q['stroke_colour'])
        colours[aid] = tuple(q['stroke_colour'])
    assert not any(A.frames_distinct(colours).values())


def _frames_raw(factory, k, **override):
    colours = {r: _rgb(c) for r, c in G.RARITY_PALETTE.items()}; colours.update(override)
    return _frame_sheet(factory / f'raw/{G.FRAME_SHEET_ID}/{G.FRAME_SHEET_ID}-a{k}.png', colours)


def test_distinctness_covers_the_whole_frame_set_whatever_the_pick_order(factory):
    _frames_raw(factory, 1); _frames_raw(factory, 2, legendary=(255, 214, 66))     # a2's legendary is almost the a1 rare
    G.pick(['--id', G.FRAME_SHEET_ID, '--attempt', '1'])
    assert all(A.Registry(G.REG_PATH).get(G.FRAME_ASSET[r])['status'] == 'qa_passed' for r in G.FRAMED_RARITIES)
    G.pick(['--id', G.FRAME_SHEET_ID, '--attempt', '2', '--part', 'legendary'])
    reg = A.Registry(G.REG_PATH)
    for aid, other in (('ui-rarity-rare', 'ui-rarity-legendary'), ('ui-rarity-legendary', 'ui-rarity-rare')):
        e = reg.get(aid)
        assert e['status'] == 'qa_failed' and any(r.startswith(f'too close to {other}') for r in e['qa']['reasons']), (aid, e['qa']['reasons'])
        saved = json.loads(A._final_path(e['final']).with_suffix('.qa.json').read_text(encoding='utf-8'))
        assert saved['reasons'] == e['qa']['reasons']
    assert reg.get('ui-rarity-rare')['chosen_attempt'] == 'a1'                       # the earlier pick failed too, not re-picked
    G.pick(['--id', G.FRAME_SHEET_ID, '--attempt', '1', '--part', 'legendary'])      # back to a distinct legendary
    reg = A.Registry(G.REG_PATH)
    for r in G.FRAMED_RARITIES:
        e = reg.get(G.FRAME_ASSET[r])
        assert e['status'] == 'qa_passed' and not any(x.startswith('too close to') for x in e['qa']['reasons']), (r, e['qa'])


def _close_frames(reg):
    """Every tier frame passed QA on its own, but legendary's band colour is almost the rare yellow."""
    for r in G.FRAMED_RARITIES:
        reg.set(G.FRAME_ASSET[r], qa={'pass': True, 'reasons': [], 'stroke_colour': list(_rgb(G.RARITY_PALETTE[r]))})
    reg.set('ui-rarity-legendary', qa={'pass': True, 'reasons': [], 'stroke_colour': [255, 220, 62]})


def test_approve_rechecks_distinctness_over_the_whole_frame_set(factory, review):
    reg = _fill(factory, 'sample'); _close_frames(reg)
    review.main('sample')
    with pytest.raises(PermissionError, match='too close'):
        G.do_approve(A.Registry(G.REG_PATH), 'sample', 'user 2026-10-21: ok')
    assert 'approved_batches' not in A.Registry(G.REG_PATH).data


def test_review_page_flags_close_frames(factory, review):
    import re
    reg = _fill(factory, 'sample'); _close_frames(reg)
    page = review.main('sample').read_text(encoding='utf-8')
    sec = page[page.index('<section id="frames">'):]; sec = sec[:sec.index('</section>')]
    assert sorted(re.findall(r'data-close="([a-z-]+)"', sec)) == ['ui-rarity-legendary', 'ui-rarity-rare']
    assert 'too close to ui-rarity-rare' in sec and 'too close to ui-rarity-legendary' in sec


def test_committed_gear_plan_json_is_current(factory):
    G.plan_json([])
    fresh = json.loads((factory / 'gear-plan.json').read_text(encoding='utf-8'))
    committed = json.loads((Path(G.AF) / 'gear-plan.json').read_text(encoding='utf-8'))
    assert fresh == committed
    assert set(fresh) == {'sheets', 'batches', 'regionLimited', 'setFirst', 'slots', 'kinds'}
    assert fresh['slots'] == G.GEAR_SLOT and fresh['kinds'] == G.GEAR_KIND
    assert fresh['sheets']['sheet-skill-noel'][-1] is None
    assert b'\r\n' not in (Path(G.AF) / 'gear-plan.json').read_bytes()


# --- controller rulings after Task E (2026-10-20): polearm floor, stale QA, starlit redesign, decision block ---------------------
WEAPON_KINDS = ('sword', 'spear', 'dagger', 'bow', 'staff', 'tome', 'scimitar', 'wrench')   # engine/types.ts WeaponKind


def test_every_weapon_cell_has_a_weapon_kind_and_the_plan_carries_it():
    weapons = {p for p, s in G.GEAR_SLOT.items() if s == 'weapon'}
    assert set(G.GEAR_KIND) == weapons and set(G.GEAR_KIND.values()) <= set(WEAPON_KINDS)
    assert G.plan_data()['kinds'] == G.GEAR_KIND                    # gearArt.test.ts checks every value against the game data
    assert {p for p, k in G.GEAR_KIND.items() if A.subject_class('weapon', k) == 'thin'} == {'thorn-spear', 'lg-chizuru', 'lg-liz',
                                                                                            'hunter-bow', 'storm-thunder-bow'}


def test_approve_refuses_a_pick_whose_qa_is_from_an_older_spec(factory, review):
    reg = _fill(factory, 'sample')
    reg.set('gear-lg-chizuru', kind='gear-cell', qa={'pass': True, 'reasons': []})          # picked before the spec stamp
    review.main('sample'); _refused(factory)
    reg = A.Registry(G.REG_PATH); q = reg.get('gear-lg-chizuru')['qa']
    reg.set('gear-lg-chizuru', qa={**q, 'spec': A.qa_spec('gear-cell')})
    review.main('sample')
    assert G.do_approve(A.Registry(G.REG_PATH), 'sample', 'user 2026-10-21: ok')


def test_pick_and_requa_record_qa_under_the_current_spec(factory):
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a1.png'); _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a2.png')
    G.pick(['--id', 'sheet-gear-1', '--attempt', '1']); G.pick(['--id', 'sheet-gear-1', '--attempt', '2', '--part', 'iron-sword'])
    reg = A.Registry(G.REG_PATH)
    assert all(not A.qa_stale(reg.get(a)) for p in G.GEAR_SHEETS['sheet-gear-1'] for a in (f'gear-{p}', f'gear-{p}-large'))
    for a in ('gear-iron-sword', 'gear-leather-cap-large'):                                 # as if QA'd under an older spec
        e = reg.get(a); reg.set(a, qa={k: v for k, v in e['qa'].items() if k != 'spec'})
    before = {a: reg.get(a).get('final') for a in reg.data['assets']}
    _png(factory / 'work/sheet-gear-1/gear-leather-cap-large.png', (64, 64))              # its final drifted from its QA
    old_sha = G.sha256(factory / 'work/sheet-gear-1/gear-leather-cap-large.png')
    out = G.do_requa(A.Registry(G.REG_PATH), 'sample')
    reg = A.Registry(G.REG_PATH)
    done = out['requa']
    assert set(done) == {'gear-iron-sword', 'gear-iron-sword-large', 'gear-leather-cap', 'gear-leather-cap-large'}
    new_sha = G.sha256(factory / 'work/sheet-gear-1/gear-leather-cap-large.png')
    assert out['changed'] == {'gear-leather-cap-large': {'old': old_sha, 'new': new_sha}} and old_sha != new_sha
    log = reg.data['requa_log'][-1]
    assert log['batch'] == 'sample' and log['requa'] == done and log['changed'] == out['changed'] and re.fullmatch(r'\d{4}-\d{2}-\d{2}', log['on'])
    assert not any(A.qa_stale(e) for e in reg.data['assets'].values())
    assert reg.get('gear-iron-sword')['chosen_attempt'] == 'a2' and reg.get('gear-leather-cap')['chosen_attempt'] == 'a1'
    assert {a: reg.get(a).get('final') for a in reg.data['assets']} == before


def test_requa_never_touches_approved_or_published_parts(factory):
    _sheet(factory / 'raw/sheet-gear-1/sheet-gear-1-a1.png'); G.pick(['--id', 'sheet-gear-1', '--attempt', '1'])
    reg = A.Registry(G.REG_PATH); e = reg.get('gear-iron-sword')
    reg.set('gear-iron-sword', status='approved', qa={k: v for k, v in e['qa'].items() if k != 'spec'})
    with pytest.raises(PermissionError, match='approved or published'):
        G.do_requa(A.Registry(G.REG_PATH), 'sample')


def _corner_stars(path, dots=False, cross=False):
    """A one-piece starlit raw: 14 x 14 art px at 40 raw px each on a 1024 magenta canvas, a 4 x 4 four-point star in
    each corner (2 x 2 white core, 2 px points: the round glint, a2) or, cross=True, a 3 x 3 cross (one white core pixel,
    four cyan arms: the sharp cross, a3); dots=True adds side dots (must fail)."""
    arr = np.zeros((1024, 1024, 3), np.uint8); arr[:] = M; o = 232
    art = {}
    for oy, ox in ((0, 0), (0, 10), (10, 0), (10, 10)):
        if cross:
            cy, cx = oy + (1 if oy == 0 else 2), ox + (1 if ox == 0 else 2); art[(cy, cx)] = STAR_CORE
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)): art[(cy + dy, cx + dx)] = STAR_ARM
            continue
        for y, x in ((1, 1), (1, 2), (2, 1), (2, 2)): art[(oy + y, ox + x)] = STAR_CORE
        for y, x in ((0, 1), (0, 2), (3, 1), (3, 2), (1, 0), (2, 0), (1, 3), (2, 3)): art[(oy + y, ox + x)] = STAR_ARM
    if dots:
        for y, x in ((0, 7), (13, 6), (7, 0), (6, 13)): art[(y, x)] = STAR_CORE
    for (y, x), c in art.items(): arr[o + y * 40:o + y * 40 + 40, o + x * 40:o + x * 40 + 40] = c
    path.parent.mkdir(parents=True, exist_ok=True); Image.fromarray(arr, 'RGB').save(path); return path


def test_starlit_job_is_one_piece_with_corner_stars_only_and_its_own_cap():
    j = G.job_by_id('sheet-starlit-1')
    assert (j['kind'], j['cols'], j['rows'], j['parts'], j['batch']) == ('frame-sheet', 1, 1, ['starlit'], 'sample')
    assert G.assets_of(j, 'starlit') == ['ui-starlit'] and G.ATTEMPT_CAP['sheet-starlit-1'] == 3
    assert G.frame_role('starlit', j) == ('corners', 16, 5, 1)          # drawn 14 x 14, padded 1: stars stay off the tile edge
    assert G.frame_role('starlit', G.job_by_id(G.FRAME_SHEET_ID)) == ('overlay', 16, 5, 0)     # the frames sheet is unchanged
    assert G.ATTEMPT_CAP['sheet-gear-1'] == 9 and G.ATTEMPT_CAP[G.FRAME_SHEET_ID] == 5
    pr = j['prompt']
    # Controller ruling 2026-10-20: the a3 redraw is a 3 x 3 cross (one white core pixel, four cyan arms, empty diagonals).
    for s in ('four-pointed star', '14 by 14', '3 by 3', 'one white', 'four corner squares', 'corner', 'fully transparent',
              'nothing along the sides', '#FF00FF', 'No text', 'original'):
        assert s in pr, s


def test_starlit_job_pick_replaces_the_overlay_only_when_it_is_corner_stars(factory):
    _corner_stars(factory / 'raw/sheet-starlit-1/sheet-starlit-1-a1.png')
    _corner_stars(factory / 'raw/sheet-starlit-1/sheet-starlit-1-a2.png', dots=True)
    res = G.pick(['--id', 'sheet-starlit-1', '--attempt', '1'])
    q = res['ui-starlit']
    assert q['pass'] and q['role'] == 'corners' and q['size'] == [16, 16], q
    e = A.Registry(G.REG_PATH).get('ui-starlit')
    assert e['source_id'] == 'sheet-starlit-1' and e['chosen_attempt'] == 'a1' and not A.qa_stale(e)
    q = G.pick(['--id', 'sheet-starlit-1', '--attempt', '2'])['ui-starlit']
    assert 'starlit outside its corners' in q['reasons'] and not q['pass']


def test_gen_stops_at_the_attempt_cap(factory, monkeypatch):
    monkeypatch.setattr(G.subprocess, 'run', lambda *a, **k: pytest.fail('codex must not run'))
    for k in (1, 2, 3): _corner_stars(factory / f'raw/sheet-starlit-1/sheet-starlit-1-a{k}.png')
    with pytest.raises(PermissionError, match='a3'):
        G.gen(['--only=sheet-starlit-1', '--n=4'])
    G.gen(['--only=sheet-starlit-1', '--n=3'])                                               # nothing to do, nothing run


def test_sample_decisions_tell_the_real_state(factory, review):
    import re
    reg = _fill(factory, 'sample')
    reg.set('ui-starlit', source_id=G.FRAME_SHEET_ID)                      # the old a5 overlay is still the pick
    page = review.main('sample').read_text(encoding='utf-8')
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    asked = head[:head.index('已決定')]
    assert re.findall(r'<li><b>([^<]+)</b>', asked) == ['圖示大小是否一致', '七階外框與星輝', '傳說光暈改在格內']
    for s in ('長柄', '弓', '0.20', '0.28',                   # the thin-weapon floor (polearms and bows), explained
              '有外框的六階', '15 組',                         # six framed tiers (common has none), 15 pairs
              '獨特沒有金色內緣線', '已接受',                  # unique without the gold line, plainly
              '最接近的一對', 'ΔE',                           # the tightest pair, measured
              '四角', '邊與中間全透明'):                       # the starlit redesign
        assert s in asked, s
    assert '新版星輝尚未生成' in asked                         # this registry's ui-starlit is not from sheet-starlit-1
    decided = head[head.index('已決定'):]
    for s in ('多蘭', '素材', '本批未重畫', '15 件舊底材圖示', '正式版'):
        assert s in decided, s
    reg = A.Registry(G.REG_PATH); reg.set('ui-starlit', source_id='sheet-starlit-1')
    head = review.main('sample').read_text(encoding='utf-8')
    assert '新版星輝尚未生成' not in head


def test_review_page_flags_stale_qa_in_the_checklist(factory, review):
    reg = _fill(factory, 'sample'); reg.set('gear-lg-chizuru', kind='gear-cell', qa={'pass': True, 'reasons': []})
    page = review.main('sample').read_text(encoding='utf-8')
    row = page[page.index('data-part="lg-chizuru"'):]; row = row[:row.index('</tr>')]
    assert 'QA 過期' in row and 'QA 過期' not in page[page.index('data-part="iron-sword"'):][:400]


def test_approve_refuses_unless_the_starlit_is_the_corner_redraw(factory, review):
    reg = _fill(factory, 'sample')
    reg.set('ui-starlit', source_id=G.FRAME_SHEET_ID, qa={'pass': True, 'reasons': [], 'role': 'overlay'})   # the dashed a5 overlay
    review.main('sample'); _refused(factory)
    reg = A.Registry(G.REG_PATH); reg.set('ui-starlit', source_id=G.STARLIT_SHEET_ID, qa={'pass': True, 'reasons': [], 'role': 'overlay'})
    review.main('sample'); _refused(factory)                                              # right job, wrong role
    reg = A.Registry(G.REG_PATH); reg.set('ui-starlit', qa={'pass': True, 'reasons': [], 'role': 'corners'})
    review.main('sample')
    assert G.do_approve(A.Registry(G.REG_PATH), 'sample', 'user 2026-10-21: ok')


def _starlit_attempts(factory, *kinds):
    """Raws a1.. of sheet-starlit-1 ('round' 4 x 4 glint, 'cross' 3 x 3, 'dots' fails QA) and their candidates."""
    for k, kind in enumerate(kinds, 1):
        _corner_stars(factory / f'raw/sheet-starlit-1/sheet-starlit-1-a{k}.png', dots=kind == 'dots', cross=kind == 'cross')
    G.cand(['--only=sheet-starlit-1'])


def test_review_page_offers_both_starlit_shapes_and_either_may_be_approved(factory, review):
    import re
    _fill(factory, 'sample')
    _starlit_attempts(factory, 'dots', 'round', 'cross')
    alts = G.starlit_alternatives()
    assert list(alts) == ['a2', 'a3'] and {k: v['shape'] for k, v in alts.items()} == {'a2': 'round', 'a3': 'cross'}
    G.pick(['--id', 'sheet-starlit-1', '--attempt', '3'])
    page = review.main('sample').read_text(encoding='utf-8')
    sec = page[page.index('id="starlit-alts"'):]; sec = sec[:sec.index('</section>')]
    for k in ('a2', 'a3'):
        fig = re.findall(rf'data-starlit-alt="{k}"[^>]*data-size="(\d+)"[^>]*data-zoom="(\d)"[^>]*data-tier="([a-z]+)"', sec)
        assert sorted(fig) == sorted((s, z, r) for s in ('28', '38') for z in ('1', '3') for r in ('legendary', 'unique', 'set')), (k, fig)
    assert 'data-starlit-alt="a1"' not in sec and 'starlit outside its corners' in sec        # a1 failed and says why
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    asked = head[:head.index('已決定')]
    assert re.findall(r'<li><b>([^<]+)</b>', asked) == ['圖示大小是否一致', '七階外框與星輝', '星輝角星：圓點光（a2）或十字星（a3）？', '傳說光暈改在格內']
    for opt in ('A 用 a2 圓點光', 'B 用 a3 十字星', 'C 先不要星輝角星圖（只用文字光）'):
        assert opt in asked, opt
    assert '直接回覆每題的選擇，例如：1 可以、2 可以、3 A、4 可以' in head
    assert 'href="#starlit-alts"' in asked
    shown = json.loads(G.shown_path('sample').read_text(encoding='utf-8'))
    assert shown['alternatives']['ui-starlit'] == {k: v['sha'] for k, v in alts.items()}
    assert G.do_approve(A.Registry(G.REG_PATH), 'sample', 'user 2026-10-21: 十字星')
    reg = A.Registry(G.REG_PATH)
    assert reg.data['approved_batches']['sample']['shown']['ui-starlit'] == alts['a3']['sha']


def test_the_other_shown_starlit_may_be_picked_after_the_page_without_a_rebuild(factory, review):
    _fill(factory, 'sample'); _starlit_attempts(factory, 'round', 'cross')
    G.pick(['--id', 'sheet-starlit-1', '--attempt', '2']); review.main('sample')
    G.pick(['--id', 'sheet-starlit-1', '--attempt', '1'])                                 # the user chose the round glint
    assert G.do_approve(A.Registry(G.REG_PATH), 'sample', 'user 2026-10-21: 圓點光')
    assert A.Registry(G.REG_PATH).data['approved_batches']['sample']['shown']['ui-starlit'] == G.starlit_alternatives()['a1']['sha']


def test_an_unshown_starlit_is_still_refused(factory, review):
    _fill(factory, 'sample'); _starlit_attempts(factory, 'round')
    G.pick(['--id', 'sheet-starlit-1', '--attempt', '1']); review.main('sample')
    _corner_stars(factory / 'raw/sheet-starlit-1/sheet-starlit-1-a2.png', cross=True)      # made after the page
    G.pick(['--id', 'sheet-starlit-1', '--attempt', '2'])
    _refused(factory)


def test_only_one_passing_starlit_is_shown_alone_with_why_the_other_failed(factory, review):
    import re
    _fill(factory, 'sample'); _starlit_attempts(factory, 'round', 'dots')
    G.pick(['--id', 'sheet-starlit-1', '--attempt', '1'])
    page = review.main('sample').read_text(encoding='utf-8')
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    q = re.findall(r'<li><b>(星輝角星[^<]+)</b>', head)
    assert q == ['星輝角星：只有圓點光（a1）通過，要用嗎？'] and '只有 a1 通過 QA' in head and 'a2' in head
    star_q = head[head.index('星輝角星'):]; star_q = star_q[:star_q.index('傳說光暈改在格內')]
    assert '圓圓的亮點' in star_q and '蓋掉傳說火舌' in star_q                     # 1x reads as a round glint; covers the ornaments
    for opt in ('A 接受 a1 圓點光', 'B 先不要星輝角星圖（只用文字光）', 'C 另開新版重畫十字星（需要再給嘗試次數）'):
        assert opt in star_q, opt
    G.note(['--id', 'sheet-starlit-1', '--attempt', '2', '--reason', 'raw reason', '--plain', '邊上多畫了星點，遊戲裡會連成虛線'])
    page = review.main('sample').read_text(encoding='utf-8')
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    star_q = head[head.index('星輝角星'):]; star_q = star_q[:star_q.index('傳說光暈改在格內')]
    assert '邊上多畫了星點，遊戲裡會連成虛線' in star_q and 'starlit outside its corners' not in star_q    # plain words, not QA strings
    sec = page[page.index('id="starlit-alts"'):]; sec = sec[:sec.index('</section>')]
    assert '邊上多畫了星點' in sec and 'starlit outside its corners' in sec                          # the technical note keeps both


# --- visual check round (2026-10-20): the page must be honest and readable on a phone -----------------------------------------
def test_candidate_images_of_two_sheets_never_overwrite_each_other(factory, review):
    _fill(factory, 'sample')
    colours = {r: _rgb(c) for r, c in G.RARITY_PALETTE.items()}
    _frame_sheet(factory / 'raw/sheet-rarity-frames-2/sheet-rarity-frames-2-a1.png', colours)
    _starlit_attempts(factory, 'round')
    G.cand(['--only=sheet-rarity-frames-2'])
    page = review.main('sample').read_text(encoding='utf-8')
    # §9 shows verdicts as text now (artifact file limit); each sheet's attempt lists its own ui-starlit verdict, never the other's
    gal = page[page.index('id="s9"'):]
    for sid in (G.FRAME_SHEET_ID, G.STARLIT_SHEET_ID):
        att = gal[gal.index(f'<h4>{sid} a1'):]; att = att[:att.index('</ul>')]
        q = json.loads((factory / f'work/{sid}/cand/a1/ui-starlit.qa.json').read_text(encoding='utf-8'))
        assert '<b>ui-starlit</b>：' + ('通過' if q['pass'] else '未通過') in att, sid
    assert 'img/cand-' not in page


def test_used_label_matches_the_sheet_as_well_as_the_attempt(factory, review):
    _fill(factory, 'sample')                                               # ui-starlit: a1 of sheet-starlit-1, not of the frames sheet
    colours = {r: _rgb(c) for r, c in G.RARITY_PALETTE.items()}
    _frame_sheet(factory / 'raw/sheet-rarity-frames-2/sheet-rarity-frames-2-a1.png', colours)
    _starlit_attempts(factory, 'round')
    page = review.main('sample').read_text(encoding='utf-8')
    head = lambda sid: page[page.index(f'<h4>{sid} a1'):][:400]
    assert '採用：' in head(G.FRAME_SHEET_ID) and 'ui-starlit' not in head(G.FRAME_SHEET_ID).split('</h4>')[0]
    assert 'ui-starlit' in head(G.STARLIT_SHEET_ID).split('</h4>')[0]


def test_note_records_a_plain_reason_beside_the_technical_one(factory):
    A.Registry(G.REG_PATH).set('x', status='todo')
    G.note(['--id', 'sheet-starlit-1', '--attempt', '3', '--reason', 'starlit corner star cut or too small', '--plain', '整張畫太寬，尖端在縮小時不見了'])
    e = A.Registry(G.REG_PATH).get('sheet-starlit-1')
    assert e['rejected_attempts']['a3'] == 'starlit corner star cut or too small' and e['plain_reasons']['a3'] == '整張畫太寬，尖端在縮小時不見了'


def test_decisions_speak_plainly_and_consistently(factory, review):
    import re
    real = json.loads((G.AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    reg = _fill(factory, 'sample')
    for b in G.GEAR_BASE:
        if f'icon-{b}' in real: reg.set(f'icon-{b}', **{k: real[f'icon-{b}'][k] for k in ('status', 'runtime', 'final') if k in real[f'icon-{b}']})
    page = review.main('sample').read_text(encoding='utf-8')
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    user = re.sub(r'<details.*?</details>', '', head, flags=re.S)           # what the user reads, without the technical note
    assert '四芒星' not in user                                             # the shape is the corner star the next question names
    for term in ('gear_art.py', 'sheet-starlit-1', 'slice', 'inset', 'border-image'):
        assert term not in user, term
    decided = head[head.index('已決定'):]
    assert '本批只有鐵劍是舊底材圖示的新版；木圓盾、皮帽是以前沒有圖示的裝備' in decided
    assert '<details' in head and 'gear_art.py approve --batch sample' in head    # the controller's command, tucked away


def test_page_fits_a_phone_width(factory, review):
    import re
    _fill(factory, 'sample')
    page = review.main('sample').read_text(encoding='utf-8')
    css = page[page.index('<style>'):page.index('</style>')]
    assert not re.search(r'\.screen\{[^}]*width:max-content', css) and not re.search(r'\.fac\{[^}]*width:960px', css)
    assert re.search(r'\.scroll\{[^}]*overflow-x:auto', css)
    assert re.search(r'figure\{[^}]*max-width:100%[^}]*min-width:0', css)          # a flex item never grows to its wide content
    body = page[page.index('<body>'):]
    tables = [m.start() for m in re.finditer(r'<table', body)]
    assert tables and all(body.rfind('<div class="scroll">', 0, i) > body.rfind('</div>', 0, i) for i in tables)   # every table scrolls inside
    assert body.count('<div class="zoom3">') and body.count('<div class="scroll"><div class="zoom3">') == body.count('<div class="zoom3">')
    assert body.count('<div class="fac">') == body.count('<div class="scroll"><div class="fac">')


def test_size_section_concludes_old_versus_new_in_measured_numbers(factory, review):
    import re
    real = json.loads((G.AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    reg = _fill(factory, 'sample')
    for b in G.GEAR_BASE:
        if f'icon-{b}' in real: reg.set(f'icon-{b}', **{k: real[f'icon-{b}'][k] for k in ('status', 'runtime', 'final') if k in real[f'icon-{b}']})
    page = review.main('sample').read_text(encoding='utf-8')
    sec = page[page.index('id="size"'):page.index('id="s1"')]
    m = re.search(r'舊圖示主體長邊 (\d+)～(\d+) px 不等，新圖示統一 22', sec)
    assert m and int(m.group(1)) < int(m.group(2)), sec[-600:]
    assert 'mass' not in re.sub(r'<details.*?</details>', '', sec, flags=re.S) and '份量' in sec


def test_page_wording_and_extras(factory, review):
    _fill(factory, 'sample'); _starlit_attempts(factory, 'round')
    page = review.main('sample').read_text(encoding='utf-8')
    assert '每種稀有度各一件' not in page and '本批有的稀有度各舉一件' in page
    assert '小圖示 26' in page[page.index('id="s3"'):page.index('id="s4"')]
    frames = page[page.index('id="frames"'):page.index('</section>', page.index('id="frames"'))]
    assert 'data-tiers-zoom="3"' in frames                                # the seven tiers again at 3x, starlit and plain side by side
    alts = page[page.index('id="starlit-alts"'):]; alts = alts[:alts.index('</section>')]
    assert '原圖 16×16，放大 4 倍' in alts


# --- plan 5d Task 9 (G2): its own review folder and an honest decision block ----------------------------------------------------
def test_each_batch_writes_its_own_review_folder(factory, review):
    _fill(factory, 'sample'); _fill(factory, 'main-gear')
    g1 = review.main('sample'); before = g1.read_bytes()
    g2 = review.main('main-gear')
    assert g1 == factory / 'review/index.html' and g2 == factory / 'review-g2/index.html'
    assert g1.read_bytes() == before and (factory / 'review/img').is_dir() and (factory / 'review-g2/img').is_dir()
    assert json.loads(G.shown_path('main-gear').read_text(encoding='utf-8'))['page'] == str(g2)


def test_g2_decisions_are_honest_about_what_did_not_pass(factory, review):
    import re
    real = json.loads((G.AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    reg = _fill(factory, 'main-gear')
    for b in G.GEAR_BASE:                                   # the old base icons, as in the real registry
        if f'icon-{b}' in real: reg.set(f'icon-{b}', **{k: real[f'icon-{b}'][k] for k in ('status', 'runtime', 'final') if k in real[f'icon-{b}']})
    reg.set('gear-thorn-spear', status='qa_failed'); reg.data['assets'].pop('icon-iron-shard'); reg._save()
    page = review.main('main-gear').read_text(encoding='utf-8')
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    asked = head[:head.index('已決定')]
    assert re.findall(r'<li><b>([^<]+)</b>', asked) == ['60 件裝備逐件確認', '套裝每套 4 件是否一眼看得出同一套', '6 種地區素材與多蘭笑臉']
    assert '24px' not in asked and '26' in asked
    names = review.names()
    assert f'還沒通過：{names["thorn-spear"]}' in asked and names['iron-shard'] in asked          # the real state, not a promise
    assert '直接回覆每題的選擇' in head and 'G1' in head[head.index('已決定'):]
    assert '件是舊底材圖示的新版' in head[head.index('已決定'):]


def test_the_factory_never_points_at_real_reference_files(factory):
    """An approve inside a test once removed the real raw/gear-refs/gear-anchor.png while codex was drawing G2."""
    for name in ('REG_PATH', 'RAW', 'WORK', 'PUBLIC', 'PLAN_PATH', 'GEAR_ANCHOR', 'PROMPTS'):
        assert Path(getattr(G, name)).is_relative_to(factory), name


def test_stale_qa_counts_as_not_passed_but_published_parts_are_never_called_stale(factory, review):
    """Review minor (d): a qa_passed pick whose QA is from an older spec is not passed yet; a published part is final
    and never labelled QA 過期."""
    names = review.names()
    reg = _fill(factory, 'main-gear')
    reg.set('gear-thorn-spear', kind='gear-cell', qa={'pass': True, 'reasons': []})                       # stale, not yet approved
    reg.set('gear-hunter-bow', kind='gear-cell', qa={'pass': True, 'reasons': []}, status='published')    # stale stamp, but published
    page = review.main('main-gear').read_text(encoding='utf-8')
    head = page[page.index('id="decisions"'):page.index('id="s0"')]
    pending = head[head.index('還沒通過：'):]; pending = pending[:pending.index('</li>')]
    assert names['thorn-spear'] in pending and names['hunter-bow'] not in pending
    row = lambda p: page[page.index(f'data-part="{p}"'):][:page[page.index(f'data-part="{p}"'):].index('</tr>')]
    assert 'QA 過期' in row('thorn-spear') and 'QA 過期' not in row('hunter-bow')


def test_checklist_table_stays_readable_on_a_phone(factory, review):
    """Ruling 2026-10-20 (G2): on a 375-390 px phone the §0 table scrolls inside its own box with readable columns
    instead of squeezing every cell to a character wide."""
    import re
    _fill(factory, 'main-gear')
    page = review.main('main-gear').read_text(encoding='utf-8')
    css = page[page.index('<style>'):page.index('</style>')]
    s0 = page[page.index('id="s0"'):page.index('id="size"')]
    assert '<div class="scroll"><table class="checklist">' in s0
    assert re.search(r'table\.checklist\{[^}]*min-width:\s*\d{3}px', css)
    assert re.search(r'table\.checklist (td|th)[^{]*\{[^}]*overflow-wrap:normal', css)


# --- G2 visual check (2026-10-20): honest risks, plain words, a slim page -------------------------------------------------------
def _g2_page(factory, review, extra=None):
    """A filled main-gear registry with the old base icons as in the real registry; extra(reg) adds a scenario."""
    real = json.loads((G.AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    reg = _fill(factory, 'main-gear')
    for b in G.GEAR_BASE:
        if f'icon-{b}' in real: reg.set(f'icon-{b}', **{k: real[f'icon-{b}'][k] for k in ('status', 'runtime', 'final') if k in real[f'icon-{b}']})
    if extra: extra(reg)
    page = review.main('main-gear').read_text(encoding='utf-8')
    return page, page[page.index('id="decisions"'):page.index('id="s0"')]


def test_g2_decisions_state_the_real_risks_in_plain_words(factory, review):
    import re
    names = review.names()

    def scenario(reg):
        # lg-noel: its picked large image carries 3 dark violet shading pixels deep inside (passes only by the edge-only rule)
        arr = np.zeros((64, 64, 4), np.uint8); arr[8:56, 8:56] = (30, 25, 40, 255)
        for y, x in ((30, 30), (31, 33), (34, 29)): arr[y, x, :3] = (117, 22, 63)
        f = factory / 'work/sheet-gear-4/gear-lg-noel-large.png'; Image.fromarray(arr, 'RGBA').save(f)
        reg.set('gear-lg-noel-large', final=str(f))
        # lg-sylvie: picked from a4 after three failed attempts
        for k in ('a1', 'a2', 'a3', 'a4'):
            d = factory / f'work/sheet-gear-4/cand/{k}'; d.mkdir(parents=True, exist_ok=True)
            for a in ('gear-lg-sylvie', 'gear-lg-sylvie-large'):
                (d / f'{a}.qa.json').write_text(json.dumps({'pass': k == 'a4', 'reasons': [] if k == 'a4' else ['subject too light']}), encoding='utf-8')
        for a in ('gear-lg-sylvie', 'gear-lg-sylvie-large'): reg.set(a, chosen_attempt='a4')
        # sheet-gear-2 a2 drawn without the style anchor, noted in plain words
        reg.set('sheet-gear-2', rejected_attempts={'a2': 'anchor missing'}, plain_reasons={'a2': '這一版生成時少了風格參考圖，不採用'})
        # sheet-gear-8 a3 IS the raven cloak's pick; its plain note is a risk about the picked version, not an unused attempt
        reg.set('sheet-gear-8', rejected_attempts={'a3': 'picked'}, plain_reasons={'a3': '1 倍下仍偏暗'})
        for a in ('gear-shade-raven-cloak', 'gear-shade-raven-cloak-large'): reg.set(a, chosen_attempt='a3')
    page, head = _g2_page(factory, review, scenario)
    user = re.sub(r'<details.*?</details>', '', head, flags=re.S)
    assert names['lg-noel'] in user and '只數外緣' in user                           # passes only by the edge-only spill rule
    assert '有 3 個暗紫或暗紅' in user and '3～3' not in user                           # one count, not a range of one
    assert f'{names["lg-sylvie"]}：試了 4 版才採用（其中 3 版沒過檢查）' in user
    assert '這一版生成時少了風格參考圖，不採用' in user
    assert f'{names["shade-raven-cloak"]}：1 倍下仍偏暗（這是採用的版本）' in user and '那張表的第 3 版' not in user
    assert '細長武器（槍、弓）允許看起來比較瘦' in user
    for a, b in (('set-shade-feet', 'set-storm-feet'), ('copper-ring', 'blaze-ember-ring'), ('mire-miasma-mask', 'set-mire-head')):
        assert names[a] in user and names[b] in user, (a, b)                         # the confusable pairs, for the user to rule
    assert '2 不行：' in user and '重畫' in user                                       # how to say no
    for term in ('qa_passed', '補遺 S4', 'gear-5d-', '95d0a90c'):
        assert term not in re.sub(r'<details.*?</details>', '', page, flags=re.S), term


def test_g2_old_icon_section_counts_what_is_left_and_shows_the_published_g1_icon(factory, review):
    import re
    def scenario(reg):
        reg.set('icon-iron-sword', status='retired'); reg.set('gear-iron-sword', status='published', batch='gear-5d-sample')
    page, _ = _g2_page(factory, review, scenario)
    s2 = page[page.index('id="s2"'):page.index('id="s3"')]
    assert '14 件（鐵劍 G1 已換）' in s2
    row = s2[s2.index('data-old-icon="iron-sword"'):]; row = row[:row.index('</tr>')]
    assert 'G1 已換上' in row and '本批沒有新樣本' not in row


def test_g2_page_is_slim_and_lazy(factory, review):
    import re
    _fill(factory, 'main-gear')
    raw = _sheet(factory / 'raw/sheet-gear-2/sheet-gear-2-a1.png', cell=400, gap=120)
    before = raw.read_bytes()
    page = review.main('main-gear').read_text(encoding='utf-8')
    imgs = re.findall(r'<img [^>]*>', page)
    assert imgs and all('loading="lazy"' in i for i in imgs)
    gal = page[page.index('id="s9"'):]
    assert re.search(r'<details[^>]*><summary>[^<]*原圖[^<]*</summary><img [^>]*src="img/raw-sheet-gear-2-a1\.png"', gal)
    disp = Image.open(factory / 'review-g2/img/raw-sheet-gear-2-a1.png')
    assert disp.width <= 600 and disp.mode == 'P'                                     # a small palette display copy
    assert raw.read_bytes() == before                                                 # the raw itself is untouched


def test_g2_page_layout_details(factory, review):
    import re
    page, _ = _g2_page(factory, review)
    css = page[page.index('<style>'):page.index('</style>')]
    assert re.search(r'\.szrow\{[^}]*align-items:flex-start', css)
    assert not re.search(r'份量 0\.\d{3}', page)                                     # mass to two decimals
    assert 'id="s7"' not in page                                                       # no skills in this batch
    s0 = page[page.index('id="s0"'):page.index('id="size"')]
    assert "'box'" not in re.sub(r'<details.*?</details>', '', s0, flags=re.S)         # raw QA dicts only in the details


def test_g2_bag_grid_shows_every_item_framed_with_legendary_glow(factory, review):
    """Ruling 2026-10-20: §1's 28 px bag grid holds every gear item of the batch (all 60 in G2, rows of 10) in a cell with
    its rarity frame, legendaries with the in-cell glow, so all can be judged at 1x."""
    import re
    page, _ = _g2_page(factory, review)
    names = review.names()
    gear = [p for j in G.jobs() if j['batch'] == 'main-gear' and j['kind'] == 'gear-sheet' for p in j['parts']]
    s1 = page[page.index('id="s1"'):]
    grid = s1[s1.index('<div class="bag-grid">'):]; grid = grid[:grid.index('<div class="doll">')]
    titles = re.findall(r'class="cell bag" title="([^"（]+)（', grid)
    assert len(gear) == 60 and set(titles) == {names.get(p, p) for p in gear}
    assert all(names.get(p, p) in titles for p in gear if p.startswith(('lg-', 'set-')))
    legend = [p for p in gear if review.rarity_of(p) == 'legendary']
    assert legend and grid.count('class="rg"') == len(legend)


def test_a_batch_page_stays_under_the_artifact_file_limit(factory, review):
    """The artifact host keeps at most 511 files per version: a batch page references at most 480 distinct images, its img/
    holds exactly those, and §9 lists every attempt's per-part verdicts as text instead of one crop image per part."""
    import re
    _fill(factory, 'main-gear')
    stale = factory / 'review-g2/img/cand-old-crop.png'; stale.parent.mkdir(parents=True); _png(stale)   # left by an older build
    _sheet(factory / 'raw/sheet-gear-2/sheet-gear-2-a1.png', cell=400, gap=120)
    d = factory / 'work/sheet-gear-2/cand/a1'; d.mkdir(parents=True, exist_ok=True)
    _png(d / 'gear-wooden-staff.png'); (d / 'gear-wooden-staff.qa.json').write_text(json.dumps({'pass': False, 'reasons': ['subject too light']}), encoding='utf-8')
    page = review.main('main-gear').read_text(encoding='utf-8')
    refs = set(re.findall(r'src="(img/[^"]+)"', page))
    assert len(refs) <= 480
    assert {f'img/{f.name}' for f in (factory / 'review-g2/img').iterdir()} == refs              # nothing stale, nothing missing
    gal = page[page.index('id="s9"'):]
    assert 'img/cand-' not in gal and 'img/raw-sheet-gear-2-a1.png' in gal
    assert 'gear-wooden-staff' in gal and 'subject too light' in gal                              # the verdict and reason as text
