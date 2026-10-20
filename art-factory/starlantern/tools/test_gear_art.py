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


def test_sample_is_the_g1_redo_jobs():
    # Addendum S3: Scarlet's skill sheet moved to the skills batch. Addendum 2: the 4 x 2 frame sheet replaces the 3 x 2 one.
    assert G.SAMPLE == ('sheet-gear-1', 'sheet-mat-1', 'sheet-rarity-frames-2', 'scene-forge', 'npc-forge')
    assert 'sheet-rarity-frames' not in [j['id'] for j in G.jobs()]
    assert tuple(j['id'] for j in G.jobs() if j['batch'] == 'sample') == G.SAMPLE
    main = [j['id'] for j in G.jobs() if j['batch'] == 'main-gear']
    assert main == [f'sheet-gear-{k}' for k in range(2, 9)] + ['sheet-mat-2', 'npc-forge-happy']
    skills = [j['id'] for j in G.jobs() if j['batch'] == 'skills']
    assert len(skills) == 14 and 'sheet-skill-scarlet' in skills
    parts = {b: sum(len(G.assets_of(j, p)) for j in G.jobs() if j['batch'] == b for p in j['parts']) for b in G.BATCHES}
    assert parts == {'sample': 34, 'main-gear': 127, 'skills': 78}


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
    assert 'qa_passed，尚未核准、未發布' in page
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
    for q in ('裝備圖的畫風與大小比例', '稀有度外框與傳說光暈', '多蘭的外型', '15 件舊底材圖示'):
        assert q in head, q
    for s in ('#s1', '#s2', '#s3', '#s8'):
        assert f'href="{s}"' in head and f'id="{s[1:]}"' in page
    for risk in ('焰紋之鎧', '雙月槍', '不破之盾', '1px', '色相', '3px', '紅髮', '圍裙', '35×37'):
        assert risk in head, risk
    olds = re.findall(r'data-old-icon="([a-z-]+)"', page)
    assert len(olds) == 15 and len(set(olds)) == 15
    assert '本批只有鐵劍有新樣本' in page
    assert '>G<' not in page and '40 G' in page                                   # iron sword's real price
    assert re.search(r'\.screen\{[^}]*flex-wrap:wrap', page) and re.search(r'\.zoom3 \.screen\{[^}]*max-width:440px', page)
    assert re.search(r'\.rg\{[^}]*z-index:2', page) and 'class="glow-pair' in page   # the glow's overlap is shown, not hidden


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
    def fake(reg, gid, cell, workdir, raw, large=None, icon=None, slot='missing'):
        seen[gid] = (slot, large, icon); return {f'gear-{gid}': {'pass': True, 'reasons': []}}
    monkeypatch.setattr(A, 'process_gear_cell', fake)
    raw = _sheet(factory / 'raw.png')
    G.process_attempt(A.Registry(factory / 'r.json'), by_id()['sheet-gear-1'], raw, factory / 'w')
    assert seen == {p: (G.GEAR_SLOT[p], G.LARGE, G.ICON) for p in G.GEAR_SHEETS['sheet-gear-1']}


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


def test_committed_gear_plan_json_is_current(factory):
    G.plan_json([])
    fresh = json.loads((factory / 'gear-plan.json').read_text(encoding='utf-8'))
    committed = json.loads((Path(G.AF) / 'gear-plan.json').read_text(encoding='utf-8'))
    assert fresh == committed
    assert set(fresh) == {'sheets', 'batches', 'regionLimited', 'setFirst', 'slots'}
    assert fresh['slots'] == G.GEAR_SLOT
    assert fresh['sheets']['sheet-skill-noel'][-1] is None
    assert b'\r\n' not in (Path(G.AF) / 'gear-plan.json').read_bytes()
