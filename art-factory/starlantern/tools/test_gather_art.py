"""gather_art.py and review_gather.py (gathering plan PR E, Task E1; spec §12, §15)."""
import json, re
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

import gather_art as GA
import sl_art as A

M = (255, 0, 255)
SHA = re.compile(r'^[0-9a-f]{64}$')


@pytest.fixture
def factory(tmp_path, monkeypatch):
    for name, p in {'REG_PATH': tmp_path / 'registry.json', 'RAW': tmp_path / 'raw', 'WORK': tmp_path / 'work',
                    'PUBLIC': tmp_path / 'public', 'PLAN_PATH': tmp_path / 'gather-plan.json', 'PROMPTS': tmp_path / 'prompts'}.items():
        monkeypatch.setattr(GA, name, p)
    return tmp_path


def by_id():
    return {j['id']: j for j in GA.jobs()}


def _object(d, x0, y0, w, h, body=(120, 110, 96), inner=None):
    """A codex-like map object: a dark outline, a shaded body, a light top."""
    d.rectangle((x0, y0, x0 + w - 1, y0 + h - 1), fill=(28, 24, 30))
    for k in range(6):
        v = tuple(max(0, min(255, c + 18 * k - 40)) for c in body)
        d.rectangle((x0 + 7, y0 + 7 + k * (h - 14) // 6, x0 + w - 8, y0 + 7 + (k + 1) * (h - 14) // 6 - 1), fill=v)
    if inner: inner(d, x0, y0, w, h)


def _sheet(path, cols, rows, cell=300, gap=80, size=None, inner=None, edge=False):
    """A magenta sheet of cols x rows objects. size(i) -> (w, h) of object i; inner(i) draws into object i; edge=True
    pushes the first object against the top-left edge of the canvas (cut by the canvas)."""
    w, h = gap + cols * (cell + gap), gap + rows * (cell + gap)
    img = Image.new('RGB', (w, h), M); d = ImageDraw.Draw(img)
    for i in range(cols * rows):
        r, c = divmod(i, cols)
        ow, oh = size(i) if size else (cell - 40, cell - 60)
        x0 = gap + c * (cell + gap) + (cell - ow) // 2; y0 = gap + r * (cell + gap) + (cell - oh) // 2
        if edge and i == 0: x0, y0 = 0, 0
        _object(d, x0, y0, ow, oh, inner=(lambda dd, *b, i=i: inner(i, dd, *b)) if inner else None)
    path.parent.mkdir(parents=True, exist_ok=True); img.save(path); return path


# --- the plan: batches, parts, prompts -----------------------------------------------------------------------------------
def test_plan_lists_three_batches_with_the_ten_tiles_and_sixteen_icons(factory):
    plan = GA.plan_data()
    assert list(plan['batches']) == ['t0', 't1', 'i1']
    assert plan['batches']['t1']['assets'] == [f'tile-gather-{k}' for k in
                                               ('vein', 'herb', 'fungus', 'crystal', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron')]
    icons = plan['batches']['i1']['assets']
    assert len(icons) == len(set(icons)) == 16 and icons[-2:] == ['icon-tool-1', 'icon-tool-2']
    assert set(icons[:14]) == {f'icon-{m}' for m in GA.game_material_ids()}
    t0 = plan['batches']['t0']['assets']
    assert [a for a in t0 if a.startswith('sample-gather-object-')] == [f'sample-gather-object-{k}' for k in GA.TILE_KEYS]
    assert [a for a in t0 if a.startswith('sample-gather-ground-')] == [f'sample-gather-ground-{k}' for k in GA.TILE_KEYS]
    assert [a for a in t0 if a.startswith('sample-icon-')] == [f'sample-icon-{p}' for p in GA.SAMPLE_ICONS]
    for a in t0: assert GA.runtime(a) is None, a           # the sample is never published
    assert GA.runtime('tile-gather-vein') == '/assets/games/starlantern/tiles/gather-vein.png'
    assert GA.runtime('icon-copper-ore') == '/assets/games/starlantern/icon/copper-ore.png'
    assert GA.runtime('icon-tool-2') == '/assets/games/starlantern/icon/tool-2.png'
    GA.plan_json([])
    assert json.loads(GA.PLAN_PATH.read_text(encoding='utf-8')) == plan


def test_committed_gather_plan_json_is_current():
    assert json.loads((GA.AF / 'gather-plan.json').read_text(encoding='utf-8')) == GA.plan_data()


def test_the_materials_are_the_games_fourteen_in_its_order():
    assert GA.game_material_ids() == list(GA.MATS)
    assert len(GA.MATS) == 14 and set(GA.MAT_DESC) == set(GA.MATS) | set(GA.TOOL_IDS)


def test_sheets_layout_and_references():
    j = by_id()
    for sid in ('sheet-gather-sample-object', 'sheet-gather-sample-ground', 'sheet-gather-tiles'):
        assert (j[sid]['cols'], j[sid]['rows'], j[sid]['kind']) == (5, 2, 'tile-sheet'), sid
        assert [Path(p).name for p in j[sid]['images']][:2] == ['tiles-f1-x6.png', 'event-tiles-x6.png'], sid
    assert (j['sheet-gather-icons-sample']['cols'], j['sheet-gather-icons-sample']['rows']) == (3, 2)
    assert (j['sheet-gather-icons-1']['cols'], j['sheet-gather-icons-1']['rows']) == (4, 4)
    assert j['sheet-gather-icons-1']['parts'] == [f'icon-{p}' for p in list(GA.MATS) + list(GA.TOOL_IDS)]
    assert j['sheet-gather-tiles']['batch'] == 't1' and j['sheet-gather-icons-1']['batch'] == 'i1'


def test_prompts_have_no_text_magenta_key_and_keep_the_secret_words_out():
    for d in ('object', 'ground'):
        p = GA.tile_prompt(d)
        assert 'pure magenta #FF00FF' in p and 'No text' in p and '5 by 2 grid of ten' in p, d
        low = p.lower()
        for word in ('sand', 'tree', 'forest', 'wood', 'shrine', 'stair', 'steps', 'torii'):   # spec §5.1: the homes' secrets
            assert not re.search(rf'\b{word}', low), (d, word)
    assert GA.tile_prompt('object') != GA.tile_prompt('ground')
    for sid in ('sheet-gather-icons-sample', 'sheet-gather-icons-1'):
        p = by_id()[sid]['prompt']
        assert 'pure magenta #FF00FF' in p and 'No text' in p, sid


# --- gen ------------------------------------------------------------------------------------------------------------------
class _Codex:
    """Stands in for codex_still.py: writes the asked-for png, records each call."""
    def __init__(self, factory): self.calls = []; self.factory = factory

    def __call__(self, argv, **kw):
        self.calls.append(argv)
        wd = Path(argv[argv.index('--workdir') + 1]); name = argv[argv.index('--name') + 1]
        wd.mkdir(parents=True, exist_ok=True); Image.new('RGB', (64, 64), M).save(wd / name)

        class R: returncode = 0; stdout = 'ok'
        return R()


@pytest.fixture
def codex(factory, monkeypatch):
    c = _Codex(factory)
    Image.new('RGB', (8, 8), M).save(factory / 'ref.png')
    monkeypatch.setattr(GA.subprocess, 'run', c)
    monkeypatch.setattr(GA, 'ensure_refs', lambda job: None)
    monkeypatch.setattr(GA, 'images_for', lambda job, reg: [factory / 'ref.png'] + ([Path(GA.anchor_of(reg))] if job['batch'] == 't1' else []))
    return c


def test_gen_t1_refuses_without_the_users_sample_approval_and_calls_nothing(factory, codex):
    with pytest.raises(PermissionError, match='gather_tile_style_approved'):
        GA.gen(['--batch=t1'])
    assert codex.calls == []


def test_gen_t0_and_i1_run_without_approval_one_attempt_each(factory, codex):
    assert GA.gen(['--batch=t0'])
    assert sorted(Path(a[a.index('--name') + 1]).name for a in codex.calls) == [
        'sheet-gather-icons-sample-a1.png', 'sheet-gather-sample-ground-a1.png', 'sheet-gather-sample-object-a1.png']
    assert GA.gen(['--batch=i1']) and Path(codex.calls[-1][codex.calls[-1].index('--name') + 1]).name == 'sheet-gather-icons-1-a1.png'
    prompt = (GA.PROMPTS / 'sheet-gather-sample-ground.txt').read_text(encoding='utf-8')
    assert prompt.startswith(GA.tile_prompt('ground').strip()) and GA.GEN in prompt


def test_gen_stops_at_the_attempt_cap(factory, codex):
    GA.gen(['--only=sheet-gather-icons-1', '--n=3'])
    with pytest.raises(PermissionError, match='cap'):
        GA.gen(['--only=sheet-gather-icons-1', '--n=4'])
    assert len(codex.calls) == 3


def test_gen_t1_after_approval_uses_the_chosen_direction_and_its_anchor(factory, codex):
    reg = A.Registry(GA.REG_PATH)
    reg.data['gather_tile_style_approved'] = '2026-10-30'
    reg.data['gather_tile_style_anchor'] = {'direction': 'ground', 'raw': str(factory / 'raw/x/anchor.png')}; reg._save()
    (factory / 'raw/x').mkdir(parents=True); Image.new('RGB', (8, 8), M).save(factory / 'raw/x/anchor.png')
    GA.gen(['--batch=t1'])
    argv = codex.calls[-1]
    assert argv[argv.index('--image', argv.index('--image') + 1) + 1].endswith('anchor.png')
    prompt = (GA.PROMPTS / 'sheet-gather-tiles.txt').read_text(encoding='utf-8')
    assert prompt.startswith(GA.tile_prompt('ground', anchored=True).strip()) and 'attached approved sample sheet' in prompt


# --- qa: sizes and the mechanical gates -----------------------------------------------------------------------------------
def test_a_tile_sheet_becomes_ten_62_px_cells_one_shared_scale_centred(factory):
    sizes = [(260, 240), (200, 120)] + [(220, 200)] * 8
    _sheet(factory / 'raw/sheet-gather-sample-object/sheet-gather-sample-object-a1.png', 5, 2, size=lambda i: sizes[i])
    res = GA.qa(['--id', 'sheet-gather-sample-object', '--attempt', '1'])
    reg = A.Registry(GA.REG_PATH)
    assert list(res) == [f'sample-gather-object-{k}' for k in GA.TILE_KEYS]
    blocks = {q['block'] for q in res.values()}
    assert len(blocks) == 1                                   # one block for the whole sheet: sizes stay in proportion
    for aid, q in res.items():
        assert q['pass'], (aid, q)
        e = reg.get(aid); im = Image.open(A._final_path(e['final']))
        assert im.size == (62, 62) and im.mode == 'RGBA', aid
        box = im.getbbox(); cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        assert abs(cx - 31) <= 1 and abs(cy - 31) <= 1, (aid, box)
        a = im.getchannel('A'); assert set(a.getdata()) <= {0, 255}, aid       # no semi alpha (haze)
        assert e['batch'] == 'gather-t0' and e['chosen_attempt'] == 'a1' and 'runtime' not in e
        assert e['kind'] == 'gather-tile' and e['qa']['spec'] == GA.tile_spec()
    assert max(res['sample-gather-object-vein']['subject']) == pytest.approx(GA.EVENT_MAX, abs=3)
    assert max(res['sample-gather-object-herb']['subject']) < max(res['sample-gather-object-vein']['subject'])


def test_tile_qa_fails_key_residue_inside_the_subject(factory):
    def inner(i, d, x0, y0, w, h):
        if i == 2: d.rectangle((x0 + 60, y0 + 60, x0 + 120, y0 + 120), fill=(150, 8, 140))   # the key darkened in a crack
    _sheet(factory / 'raw/sheet-gather-sample-object/sheet-gather-sample-object-a1.png', 5, 2, inner=inner)
    res = GA.qa(['--id', 'sheet-gather-sample-object', '--attempt', '1'])
    assert 'magenta residue' in res['sample-gather-object-fungus']['reasons']
    assert res['sample-gather-object-vein']['pass']


def test_tile_qa_fails_an_over_erased_interior(factory):
    def inner(i, d, x0, y0, w, h):
        if i == 3: d.rectangle((x0 + 50, y0 + 50, x0 + 150, y0 + 150), fill=(205, 55, 205))   # violet art the cutout takes for key
    _sheet(factory / 'raw/sheet-gather-sample-object/sheet-gather-sample-object-a1.png', 5, 2, inner=inner)
    res = GA.qa(['--id', 'sheet-gather-sample-object', '--attempt', '1'])
    assert 'interior erased' in res['sample-gather-object-crystal']['reasons'] and res['sample-gather-object-crystal']['erased'] > 8


def test_tile_qa_fails_a_subject_cut_by_the_raw_canvas_edge(factory):
    _sheet(factory / 'raw/sheet-gather-sample-object/sheet-gather-sample-object-a1.png', 5, 2, edge=True)
    res = GA.qa(['--id', 'sheet-gather-sample-object', '--attempt', '1'])
    assert 'subject cut by the canvas edge' in res['sample-gather-object-vein']['reasons']


def test_a_soft_pink_haze_is_cut_or_despilled_never_left_semi_transparent_or_pink(factory):
    body = (120, 110, 96)
    def inner(i, d, x0, y0, w, h):
        if i == 4:   # a soft halo of the key fading into the object (rings of t * key + (1 - t) * body), outside its outline
            for k, t in reversed(list(enumerate((0.25, 0.4, 0.55, 0.7, 0.85)))):   # fading out to the key, outermost first
                c = tuple(round(t * m + (1 - t) * b) for m, b in zip(M, body)); e = 8 * (k + 1)
                d.rectangle((x0 - e, y0 - e, x0 + w - 1 + e, y0 + h - 1 + e), fill=c)
            _object(d, x0, y0, w, h)
    _sheet(factory / 'raw/sheet-gather-sample-object/sheet-gather-sample-object-a1.png', 5, 2, inner=inner)
    res = GA.qa(['--id', 'sheet-gather-sample-object', '--attempt', '1'])
    q = res['sample-gather-object-blaze']
    final = Image.open(A._final_path(A.Registry(GA.REG_PATH).get('sample-gather-object-blaze')['final'])).convert('RGBA')
    assert set(final.getchannel('A').getdata()) <= {0, 255}
    assert q['pass'] and A.magenta_spill_count(final) == 0 and A.roster_key_tint_count(final) == 0, q


def test_an_icon_sheet_becomes_icons_inside_the_36_box(factory):
    _sheet(factory / 'raw/sheet-gather-icons-sample/sheet-gather-icons-sample-a1.png', 3, 2, cell=200, size=lambda i: (150, 160))
    res = GA.qa(['--id', 'sheet-gather-icons-sample', '--attempt', '1'])
    assert list(res) == [f'sample-icon-{p}' for p in GA.SAMPLE_ICONS]
    reg = A.Registry(GA.REG_PATH)
    for aid, q in res.items():
        assert q['pass'], (aid, q)
        im = Image.open(A._final_path(reg.get(aid)['final']))
        assert max(im.size) <= 36 and 30 <= im.size[1] <= 36, (aid, im.size)
        assert reg.get(aid)['batch'] == 'gather-t0'


def test_cand_writes_every_attempt_to_a_scratch_registry_only(factory):
    _sheet(factory / 'raw/sheet-gather-sample-ground/sheet-gather-sample-ground-a1.png', 5, 2)
    GA.qa(['--batch=t0', '--cand'])
    assert (factory / 'work/sheet-gather-sample-ground/cand/a1/cand-registry.json').exists()
    assert not GA.REG_PATH.exists()


# --- approve and publish --------------------------------------------------------------------------------------------------
def _t0_ready(factory, review_out):
    import review_gather as V
    _sheet(factory / 'raw/sheet-gather-sample-object/sheet-gather-sample-object-a1.png', 5, 2)
    _sheet(factory / 'raw/sheet-gather-sample-ground/sheet-gather-sample-ground-a1.png', 5, 2)
    _sheet(factory / 'raw/sheet-gather-icons-sample/sheet-gather-icons-sample-a1.png', 3, 2, cell=200, size=lambda i: (150, 160))
    for sid in ('sheet-gather-sample-object', 'sheet-gather-sample-ground', 'sheet-gather-icons-sample'):
        GA.qa(['--id', sid, '--attempt', '1'])
    V.build('t0', review_out, public=factory / 'nopublic')


def _refused(fn):
    before = GA.REG_PATH.read_bytes()
    with pytest.raises((PermissionError, ValueError)):
        fn()
    assert GA.REG_PATH.read_bytes() == before


def test_review_page_records_the_shown_hashes_and_keeps_its_images_beside_it(factory):
    out = factory / 'page'
    _t0_ready(factory, out)
    shown = json.loads(GA.shown_path('t0').read_text(encoding='utf-8'))
    assert shown['batch'] == 't0' and set(shown['parts']) == set(GA.batch_assets('t0'))
    assert all(SHA.match(h) for h in shown['parts'].values())
    html = (out / 'index.html').read_text(encoding='utf-8')
    for src in re.findall(r'src="([^"]+)"', html):
        assert not src.startswith(('http', '/', 'file:')) and (out / src).is_file(), src
    assert 'image-rendering: pixelated' in html and '方向 A' in html and '方向 B' in html


def test_t0_needs_the_users_words_a_date_and_a_direction(factory):
    _t0_ready(factory, factory / 'page')
    reg = lambda: A.Registry(GA.REG_PATH)
    _refused(lambda: GA.do_approve(reg(), 't0', by='2026-10-30', direction='object'))            # no words
    _refused(lambda: GA.do_approve(reg(), 't0', by='可以，用 A 2026-10-30', direction='side'))    # no such direction
    _refused(lambda: GA.do_approve(reg(), 't0', by='可以，用 A', direction='object'))            # no date
    _refused(lambda: GA.do_approve(reg(), 't0', review=str(factory / 'r.md'), direction='object'))
    GA.do_approve(reg(), 't0', by='可以，用 A 2026-10-30', direction='object')
    r = reg()
    assert r.data['gather_tile_style_approved'] and r.data['gather_tile_style_anchor']['direction'] == 'object'
    assert r.data['gather_tile_style_anchor']['raw'].endswith('sheet-gather-sample-object-a1.png')
    assert r.data['approved_batches']['gather-t0']['by'] == '可以，用 A 2026-10-30'


def test_t0_refuses_a_sample_changed_after_the_page(factory):
    _t0_ready(factory, factory / 'page')
    e = A.Registry(GA.REG_PATH).get('sample-gather-object-vein')
    Image.new('RGBA', (62, 62), (1, 2, 3, 255)).save(A._final_path(e['final']))
    _refused(lambda: GA.do_approve(A.Registry(GA.REG_PATH), 't0', by='可以 2026-10-30', direction='object'))


def test_t0_is_never_published(factory):
    _t0_ready(factory, factory / 'page')
    GA.do_approve(A.Registry(GA.REG_PATH), 't0', by='可以 2026-10-30', direction='object')
    with pytest.raises(ValueError, match='never published'):
        GA.do_publish(A.Registry(GA.REG_PATH), 't0', public=factory / 'public')
    assert not (factory / 'public').exists()


def _i1_ready(factory):
    import review_gather as V
    _sheet(factory / 'raw/sheet-gather-icons-1/sheet-gather-icons-1-a1.png', 4, 4, cell=200, size=lambda i: (150, 160))
    GA.qa(['--id', 'sheet-gather-icons-1', '--attempt', '1'])
    V.build('i1', factory / 'page-i1', public=factory / 'nopublic')
    return json.loads(GA.shown_path('i1').read_text(encoding='utf-8'))['parts']


def test_i1_needs_an_independent_review_passing_every_icon(factory):
    shown = _i1_ready(factory)
    rec = factory / 'review.md'
    lines = [f'- {a} {h} 通過' for a, h in shown.items()]
    rec.write_text('審核\n' + '\n'.join(lines[:-1]) + '\n', encoding='utf-8')                  # one missing
    _refused(lambda: GA.do_approve(A.Registry(GA.REG_PATH), 'i1', review=str(rec)))
    rec.write_text('\n'.join(lines[:-1] + [lines[-1].replace('通過', '未通過')]) + '\n', encoding='utf-8')
    _refused(lambda: GA.do_approve(A.Registry(GA.REG_PATH), 'i1', review=str(rec)))
    _refused(lambda: GA.do_approve(A.Registry(GA.REG_PATH), 'i1', by='好 2026-10-30'))          # the user's words are not it
    rec.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    GA.do_approve(A.Registry(GA.REG_PATH), 'i1', review=str(rec))
    reg = A.Registry(GA.REG_PATH)
    assert all(reg.get(a)['status'] == 'approved' for a in shown)
    assert reg.data['approved_batches']['gather-i1']['review'].endswith('gather-i1-review.md')


def test_publish_refuses_an_unapproved_batch_and_sends_an_approved_one_with_its_manifest(factory):
    shown = _i1_ready(factory)
    with pytest.raises(PermissionError):
        GA.do_publish(A.Registry(GA.REG_PATH), 'i1', public=factory / 'public')
    assert not (factory / 'public').exists()
    rec = factory / 'review.md'; rec.write_text('\n'.join(f'- {a} {h} 通過' for a, h in shown.items()) + '\n', encoding='utf-8')
    GA.do_approve(A.Registry(GA.REG_PATH), 'i1', review=str(rec))
    sent = GA.do_publish(A.Registry(GA.REG_PATH), 'i1', public=factory / 'public')
    assert sorted(sent) == sorted(shown)
    reg = A.Registry(GA.REG_PATH)
    for a in shown:
        e = reg.get(a); f = factory / 'public' / e['runtime'].lstrip('/')
        assert e['status'] == 'published' and f.is_file() and GA.sha256(f) == shown[a]
    urls = json.loads((factory / 'public/assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))['urls']
    assert '/assets/games/starlantern/icon/tool-1.png' in urls and '/assets/games/starlantern/icon/copper-ore.png' in urls
    assert GA.do_publish(A.Registry(GA.REG_PATH), 'i1', public=factory / 'public') == []   # a retry is a no-op


def test_publish_refuses_when_a_file_changed_after_approval(factory):
    shown = _i1_ready(factory)
    rec = factory / 'review.md'; rec.write_text('\n'.join(f'- {a} {h} 通過' for a, h in shown.items()) + '\n', encoding='utf-8')
    GA.do_approve(A.Registry(GA.REG_PATH), 'i1', review=str(rec))
    e = A.Registry(GA.REG_PATH).get('icon-copper-ore')
    Image.new('RGBA', (30, 32), (1, 2, 3, 255)).save(A._final_path(e['final']))
    with pytest.raises(PermissionError):
        GA.do_publish(A.Registry(GA.REG_PATH), 'i1', public=factory / 'public')
    assert not (factory / 'public/assets/games/starlantern/icon').exists()


def test_old_sl_art_approve_and_publish_refuse_gathering_art(factory):
    _i1_ready(factory)
    reg = A.Registry(GA.REG_PATH)
    with pytest.raises(PermissionError, match='gather_art'):
        reg.approve('icon-copper-ore')
    reg.data['assets']['icon-copper-ore']['status'] = 'approved'; reg.data['assets']['icon-copper-ore']['runtime'] = GA.runtime('icon-copper-ore')
    with pytest.raises(PermissionError, match='gather_art'):
        reg.publish('icon-copper-ore', factory / 'public')
