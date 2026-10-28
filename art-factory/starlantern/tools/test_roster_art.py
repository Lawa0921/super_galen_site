"""roster_art.py and review_roster.py (roster plan PR D, tasks D1, D3, D4; spec §13)."""
import json, re, subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import roster_art as R
import sl_art as A

M = (255, 0, 255)
SHA = re.compile(r'^[0-9a-f]{64}$')


def by_id():
    return {j['id']: j for j in R.jobs()}


# --- D1: rounds, classes, prompts, sheets --------------------------------------------------------------------------------
def test_plan_json_lists_five_rounds_whose_union_is_the_hundred_ids_no_repeats(factory):
    defs = R.roster_defs()
    assert len(defs) == 100 and 'lantern-mother' in defs
    plan = R.plan_data()
    assert list(plan['rounds']) == ['r0', 'r1', 'r2', 'r3', 'r4']
    ids = [e for r in plan['rounds'].values() for e in r]
    assert len(ids) == len(set(ids)) == 100 and set(ids) == set(defs)
    assert [len(r) for r in plan['rounds'].values()] == [5, 13, 27, 28, 27]
    assert plan['rounds']['r0'] == ['paper-moth', 'root-hound', 'bell-watcher', 'false-moon', 'fog-warden']
    R.plan_json([])
    assert json.loads(R.PLAN_PATH.read_text(encoding='utf-8')) == plan


def test_committed_roster_plan_json_is_current():
    committed = json.loads((R.AF / 'roster-plan.json').read_text(encoding='utf-8'))
    assert committed == R.plan_data()


def test_heights_by_class():
    defs = R.roster_defs()
    assert {k: R.cls_of(defs[k]) for k in ('paper-moth', 'root-hound', 'tin-soldier', 'lamp-wight', 'hoarder', 'false-moon',
                                            'toppled-automaton', 'archon-hand', 'rime-pillar', 'fog-warden', 'lantern-mother')} == {
        'paper-moth': 'swarm', 'root-hound': 'normal', 'tin-soldier': 'heavy', 'lamp-wight': 'normal', 'hoarder': 'normal',
        'false-moon': 'warden', 'toppled-automaton': 'warden', 'archon-hand': 'warden', 'rime-pillar': 'warden',
        'fog-warden': 'boss', 'lantern-mother': 'boss'}
    jobs = by_id()
    tall = {'swarm': 'about 56 art pixels tall', 'normal': 'about 72 art pixels tall', 'heavy': 'about 84 art pixels tall',
            'warden': 'about 104 art pixels tall', 'boss': 'about 160 art pixels tall, filling much of the canvas'}
    for e, d in defs.items():
        j = jobs[f'enemy-{e}']; c = R.cls_of(d)
        assert j['height'] == A.ROSTER_HEIGHT[c] == {'swarm': 52, 'normal': 64, 'heavy': 76, 'warden': 96, 'boss': 150}[c], e
        assert f', {tall[c]}, ' in j['prompt'], e


def test_prompts_follow_batch_py_sentence_with_the_anchors(factory):
    jobs = by_id()
    for e, d in R.roster_defs().items():
        j = jobs[f'enemy-{e}']; p = j['prompt']
        assert p.startswith(f'Pixel art monster sprite of {R.DESC[e]}, facing the viewer, full body. '
                            'Match the art style, pixel density, outline and shading of the attached approved monster sprite. '
                            '16-bit JRPG battle sprite, '), e
        assert 'Centred on a perfectly flat solid pure magenta #FF00FF background with empty space around it. No text, no ground shadow, no particles.' in p
        assert 'The design must be original and not resemble any existing anime or game character.' in p
        names = [Path(str(i)).name for i in j['images']]
        assert names[0] == 'enemy-slime-a1.png', e
        assert ('enemy-lanterneater-a1.png' in names) == (R.cls_of(d) in ('warden', 'boss')), e
        # story species never carry a companion's picture (so it is never drawn as her)
        assert not any('crops' in str(i) or 'char-' in str(i) for i in j['images']), e
        mainline = d['home'] is None
        assert (R.MAINLINE_PALETTE in p) == mainline, e
        if d['remnant']: assert R.NO_FACE in p, e
        assert j['r0_anchor'] == (None if j['batch'] == 'r0' else R.R0_ANCHOR_OF(e)), e
    # from R1 on, a sprite of the same kind from the approved R0 set is attached last
    reg = A.Registry(R.REG_PATH)
    reg.data['roster_style_approved'] = '2026-10-27'
    reg.data['roster_style_anchor'] = {e: str(factory / f'raw/enemy-{e}/enemy-{e}-a2.png') for e in R.ROUNDS['r0']}; reg._save()
    imgs = R.images_for(jobs['enemy-lamp-wight'], A.Registry(R.REG_PATH))
    assert [Path(i).name for i in imgs] == ['enemy-slime-a1.png', 'enemy-root-hound-a2.png']
    imgs = R.images_for(jobs['enemy-bell-warden'], A.Registry(R.REG_PATH))
    assert [Path(i).name for i in imgs] == ['enemy-slime-a1.png', 'enemy-lanterneater-a1.png', 'enemy-false-moon-a2.png']
    assert R.R0_ANCHOR_OF('hollow-hunter') == 'bell-watcher' and R.R0_ANCHOR_OF('mist-twin') == 'paper-moth'
    assert R.R0_ANCHOR_OF('silent-bell') == 'fog-warden' and R.R0_ANCHOR_OF('tin-soldier') == 'root-hound'


def test_icon_sheets_are_5_by_4_with_their_parts():
    sheets = [j for j in R.jobs() if j['kind'] == 'icon-sheet']
    mats = R.materials()
    parts = [p for j in sheets for p in j['parts'] if p]
    assert len(parts) == len(set(parts)) == 98 and set(parts) == set(mats)
    for j in sheets:
        assert (j['cols'], j['rows']) == (5, 4) and len(j['parts']) == 20, j['id']
        assert 'A 5 by 4 grid of twenty' in j['prompt'], j['id']
        if None in j['parts']: assert 'plain empty stone slab' in j['prompt'], j['id']
    one = by_id()['sheet-icons-roster-1']
    owners = R.ROUNDS['r0'] + R.ROUNDS['r1']
    assert one['batch'] == 'r0' and one['parts'] == [R.MAT_OF[o] for o in owners] + [None, None]
    assert one['parts'][:5] == ['faded-letter', 'mist-root', 'grey-cord', 'moon-silver', 'fog-gate-plate']
    for p in parts: assert R.round_of(f'icon-{p}') == R.ROUND_OF[mats[p]]


def test_each_later_round_has_two_icon_sheets_and_two_unique_sheets_as_the_plan_numbers_them():
    """Plan E2-E4: R2 sheet-icons-roster-2, -3 and sheet-gear-roster-2, -3; R3 -4, -5; R4 -6, -7 (two sheets a round, not
    sheets of two). R0's sheets (which hold R1's parts) are unchanged."""
    icons, gear = R.icon_sheets(), R.gear_sheets()
    assert list(icons) == [f'sheet-icons-roster-{k}' for k in range(1, 8)] and list(gear) == [f'sheet-gear-roster-{k}' for k in range(1, 8)]
    for k, r in zip(range(2, 8), ('r2', 'r2', 'r3', 'r3', 'r4', 'r4')):
        assert icons[f'sheet-icons-roster-{k}'][0] == r and gear[f'sheet-gear-roster-{k}'][0] == r
    for r in ('r2', 'r3', 'r4'):
        mats = [R.MAT_OF[o] for o in R.ROUNDS[r] if o in R.MAT_OF]; uns = [R.UNIQUE_OF[o] for o in R.ROUNDS[r] if o in R.UNIQUE_OF]
        drawn = [[p for p in ps if p] for rr, ps in icons.values() if rr == r]
        assert [p for ps in drawn for p in ps] == mats and max(map(len, drawn)) - min(map(len, drawn)) <= 1, r
        drawn = [[p for p in ps if p] for rr, ps in gear.values() if rr == r]
        assert [p for ps in drawn for p in ps] == uns and max(map(len, drawn)) - min(map(len, drawn)) <= 1, r
    assert icons['sheet-icons-roster-1'] == ('r0', [R.MAT_OF[o] for o in R.ROUNDS['r0'] + R.ROUNDS['r1']] + [None, None])
    assert gear['sheet-gear-roster-1'] == ('r0', ['moonless-mirror', 'fog-halberd', 'silent-chime', 'borrowed-blade', 'unrung-clapper', None])


def test_only_selects_exact_job_ids_never_by_prefix():
    """`--only=sheet-icons-roster-1` once matched -10 and up by prefix (E1, 2026-10-26): ids are exact, comma separated."""
    assert [j['id'] for j in R.selected(['--only=sheet-icons-roster-1'])] == ['sheet-icons-roster-1']
    assert [j['id'] for j in R.selected(['--only=enemy-silent-bell,enemy-bell-warden'])] == ['enemy-silent-bell', 'enemy-bell-warden']
    for bad in ('enemy-', 'enemy-silent', 'sheet-icons-roster-1,sheet-icons'):   # a prefix or a typo selects nothing: it stops
        with pytest.raises(ValueError, match='unknown job id'):
            R.selected([f'--only={bad}'])


def test_gear_sheets_reuse_gear_art_layout_and_the_5d_anchor():
    import gear_art as G
    sheets = [j for j in R.jobs() if j['kind'] == 'gear-sheet']
    parts = [p for j in sheets for p in j['parts'] if p]
    uniques = R.uniques()
    assert len(parts) == len(set(parts)) == 39 and set(parts) == set(uniques)
    one = by_id()['sheet-gear-roster-1']
    assert one['parts'] == ['moonless-mirror', 'fog-halberd', 'silent-chime', 'borrowed-blade', 'unrung-clapper', None]
    for j in sheets:
        assert (j['cols'], j['rows']) == (3, 2) and j['images'][0] == G.GEAR_ANCHOR and G.ICONS_OLD in j['images']
        assert G.REFS_MAIN in j['prompt'] and 'thick magenta gutters between the items' in j['prompt']
    assert uniques['fog-halberd'] == {'owner': 'fog-warden', 'slot': 'weapon', 'kind': 'spear'}
    assert uniques['moonless-mirror'] == {'owner': 'false-moon', 'slot': 'offhand', 'kind': None}
    assert R.assets_of(one, 'fog-halberd') == ['gear-fog-halberd-large', 'gear-fog-halberd']


def test_the_forget_icon_is_a_g4_chip():
    j = by_id()['sheet-ail-roster-1']
    assert j['batch'] == 'r0' and j['parts'] == ['ail-forget'] and R.assets_of(j, 'ail-forget') == ['icon-ail-forget-14']
    assert 'Never draw letters, numbers or Z shapes.' in j['prompt'] and R.FORGET_COLOUR in j['prompt']
    # controller ruling 27: drawn with R0, but it waits for B9's `forget` in AilmentShown and publishes in E1c on its own
    assert R.round_of('icon-ail-forget-14') == 'forget' and 'icon-ail-forget-14' not in R.batch_assets('r0')
    assert R.batch_assets('forget') == ['icon-ail-forget-14'] and R.label('forget') == 'roster-forget'


def test_no_text_in_icons():
    for m in ('iou-slip', 'hymn-sheet', 'torn-page', 'ash-page', 'epitaph-stone'):
        assert 'blank' in R.MAT_DESC[m] and 'unreadable marks, no letters' in R.MAT_DESC[m], m
    for j in R.jobs():
        assert 'No text' in j['prompt'] or 'Never draw letters' in j['prompt'], j['id']


def test_descriptions_cover_every_id_material_and_unique():
    defs = R.roster_defs()
    assert set(R.DESC) == set(defs) and all(len(v) > 20 for v in R.DESC.values())
    assert set(R.MAT_DESC) == set(R.materials()) and set(R.UNIQUE_DESC) == set(R.uniques())
    assert set(R.STORY) <= set(defs) and len(R.STORY) == 42
    for e, (gates, never) in R.STORY.items():
        assert never, e


def test_gen_refuses_r1_to_r4_without_roster_style_approved(factory, monkeypatch):
    monkeypatch.setattr(R.subprocess, 'run', lambda *a, **k: pytest.fail('codex must not run'))
    for b in ('r1', 'r2', 'r3', 'r4'):
        with pytest.raises(PermissionError, match='roster_style_approved'):
            R.gen([f'--batch={b}'])


def test_gen_stops_at_the_attempt_cap(factory, monkeypatch):
    monkeypatch.setattr(R.subprocess, 'run', lambda *a, **k: pytest.fail('codex must not run'))
    _sprite(factory / 'raw/enemy-slime/enemy-slime-a1.png')                   # its reference is there
    for k in (1, 2, 3): _sprite(factory / f'raw/enemy-paper-moth/enemy-paper-moth-a{k}.png')
    with pytest.raises(PermissionError, match='cap'):
        R.gen(['--only=enemy-paper-moth', '--n=4'])


def test_gen_past_the_cap_needs_a_recorded_controller_extension(factory, monkeypatch):
    """Controller ruling 2026-10-26 (R1 review): up to 3 more attempts for a job, recorded in the registry with who, when and
    the review it cites; gen counts them, nothing else does."""
    calls = []
    monkeypatch.setattr(R.subprocess, 'run', lambda argv, **k: calls.append(argv) or subprocess.CompletedProcess(argv, 1, '', ''))
    _sprite(factory / 'raw/enemy-slime/enemy-slime-a1.png')
    for k in (1, 2, 3): _sprite(factory / f'raw/enemy-paper-moth/enemy-paper-moth-a{k}.png')
    with pytest.raises(ValueError, match='date'):
        R.extend_cap(A.Registry(R.REG_PATH), 'enemy-paper-moth', 3, by='controller', review='r1-review.md')
    with pytest.raises(ValueError, match='at most 3'):
        R.extend_cap(A.Registry(R.REG_PATH), 'enemy-paper-moth', 4, by='controller 2026-10-26', review='r1-review.md')
    with pytest.raises(ValueError, match='review'):
        R.extend_cap(A.Registry(R.REG_PATH), 'enemy-paper-moth', 3, by='controller 2026-10-26', review='')
    with pytest.raises(PermissionError, match='cap'):
        R.gen(['--only=enemy-paper-moth', '--n=4'])
    assert not calls
    R.extend_cap(A.Registry(R.REG_PATH), 'enemy-paper-moth', 3, by='controller 2026-10-26', review='r1-review.md')
    ext = A.Registry(R.REG_PATH).data['cap_extensions']['enemy-paper-moth']
    assert ext == [{'extra': 3, 'by': 'controller 2026-10-26', 'review': 'r1-review.md'}] and R.cap_of(A.Registry(R.REG_PATH), 'enemy-paper-moth') == 6
    assert R.gen(['--only=enemy-paper-moth', '--n=4']) is False                  # codex ran for a4 (and gave nothing)
    assert len(calls) == 1 and 'enemy-paper-moth-a4.png' in calls[0]
    for k in (4, 5, 6): _sprite(factory / f'raw/enemy-paper-moth/enemy-paper-moth-a{k}.png')
    with pytest.raises(PermissionError, match='cap'):
        R.gen(['--only=enemy-paper-moth', '--n=7'])
    assert R.cap_of(A.Registry(R.REG_PATH), 'enemy-root-hound') == R.CAP
    # a later review round may extend again (controller 2026-10-27), at most 3 each time and never twice on one record
    with pytest.raises(ValueError, match='already'):
        R.extend_cap(A.Registry(R.REG_PATH), 'enemy-paper-moth', 3, by='controller 2026-10-27', review='r1-review.md')
    R.extend_cap(A.Registry(R.REG_PATH), 'enemy-paper-moth', 3, by='controller 2026-10-27', review='r1-review-round2.md')
    assert R.cap_of(A.Registry(R.REG_PATH), 'enemy-paper-moth') == 9


# --- fixtures and fakes -----------------------------------------------------------------------------------------------------
@pytest.fixture
def factory(tmp_path, monkeypatch):
    for name, p in {'REG_PATH': tmp_path / 'registry.json', 'RAW': tmp_path / 'raw', 'WORK': tmp_path / 'work',
                    'PUBLIC': tmp_path / 'public', 'PLAN_PATH': tmp_path / 'roster-plan.json', 'PROMPTS': tmp_path / 'prompts',
                    'MONSTERS_TS': tmp_path / 'monsters.ts', 'ARTPATHS_TEST': tmp_path / 'artPaths.test.ts',
                    'E2E_SPEC': tmp_path / 'starlantern.spec.ts'}.items():
        monkeypatch.setattr(R, name, p)
    return tmp_path


def _sprite(path, h=320, w=200):
    """A codex-like monster raw: a shaded body with a dark outline on flat magenta."""
    from PIL import ImageDraw
    img = Image.new('RGB', (400, 400), M); d = ImageDraw.Draw(img); x0, y0 = (400 - w) // 2, (400 - h) // 2
    d.rectangle((x0, y0, x0 + w - 1, y0 + h - 1), fill=(30, 28, 40))
    for k in range(8):
        v = 80 + 22 * k
        d.rectangle((x0 + 6, y0 + 6 + k * (h - 12) // 8, x0 + w - 7, y0 + 6 + (k + 1) * (h - 12) // 8 - 1), fill=(v, v, v - 10))
    path.parent.mkdir(parents=True, exist_ok=True); img.save(path); return path


def _sheet(path, cols, rows, cell=120, gap=40):
    from PIL import ImageDraw
    w, h = gap + cols * (cell + gap), gap + rows * (cell + gap)
    img = Image.new('RGB', (w, h), M); d = ImageDraw.Draw(img)
    for r in range(rows):
        for c in range(cols):
            x, y = gap + c * (cell + gap), gap + r * (cell + gap); L = cell - 20; W = round(L * 0.9); k = round(L * 0.4)
            x0, y0 = x + (cell - W) // 2, y + 10
            d.polygon([(x0 + k, y0), (x0 + W - 1 - k, y0), (x0 + W - 1, y0 + k), (x0 + W - 1, y0 + L - 1 - k), (x0 + W - 1 - k, y0 + L - 1),
                       (x0 + k, y0 + L - 1), (x0, y0 + L - 1 - k), (x0, y0 + k)], fill=(30, 28, 40))
            d.polygon([(x0 + k + 4, y0 + 6), (x0 + W - 5 - k, y0 + 6), (x0 + W - 7, y0 + k), (x0 + W - 7, y0 + L - 1 - k),
                       (x0 + W - 5 - k, y0 + L - 7), (x0 + k + 4, y0 + L - 7), (x0 + 6, y0 + L - 1 - k), (x0 + 6, y0 + k)],
                      fill=(60 + 30 * c, 140, 90 + 30 * r))
    path.parent.mkdir(parents=True, exist_ok=True); img.save(path); return path


def _png(path, size=(26, 26), colour=(180, 40, 40)):
    rgba = np.zeros((size[1], size[0], 4), np.uint8); rgba[2:size[1] - 2, 2:size[0] - 2] = (*colour, 255)
    path.parent.mkdir(parents=True, exist_ok=True); Image.fromarray(rgba, 'RGBA').save(path); return str(path)


def _fill(factory, rnd, status='qa_passed'):
    """Every asset of a round picked, with a small final of its own."""
    reg = A.Registry(R.REG_PATH)
    for j in R.jobs():
        for p in j['parts']:
            for aid in R.assets_of(j, p):
                if R.round_of(aid) != rnd: continue
                size = (64, 64) if aid.endswith('-large') else (60, 64) if aid.startswith('enemy-') else (26, 26)
                reg.set(aid, status=status, batch=R.label(rnd), chosen_attempt='a1', source_id=j['id'], kind=R.KIND_OF(aid),
                        qa={'pass': True, 'reasons': [], 'spec': A.qa_spec(R.KIND_OF(aid))} if R.KIND_OF(aid) in A.SPEC_INPUTS else {'pass': True, 'reasons': []},
                        raw=str(factory / 'raw' / j['id'] / f'{j["id"]}-a1.png'),
                        final=_png(factory / 'work' / j['id'] / f'{aid}.png', size, colour=(40 + len(aid) % 200, 90, 120)))
    return reg


@pytest.fixture
def review(factory, monkeypatch):
    import review_roster as V
    monkeypatch.setattr(V, 'OUT', factory / 'review')
    return V


def _refused(factory, rnd, **kw):
    before = R.REG_PATH.read_bytes()
    with pytest.raises((PermissionError, ValueError)):
        R.do_approve(A.Registry(R.REG_PATH), rnd, **kw)
    assert R.REG_PATH.read_bytes() == before


# --- D1: pick, approve ------------------------------------------------------------------------------------------------------
def test_pick_never_writes_runtime_and_labels_each_asset_by_its_owners_round(factory):
    _sprite(factory / 'raw/enemy-root-hound/enemy-root-hound-a1.png')
    R.pick(['--id', 'enemy-root-hound', '--attempt', '1'])
    e = A.Registry(R.REG_PATH).get('enemy-root-hound')
    assert e['status'] == 'qa_passed' and 'runtime' not in e and e['batch'] == 'roster-r0' and e['chosen_attempt'] == 'a1', e
    assert e['kind'] == 'roster-sprite' and e['roster_class'] == 'normal' and e['qa']['height'] == 64
    _sheet(factory / 'raw/sheet-icons-roster-1/sheet-icons-roster-1-a1.png', 5, 4)
    R.pick(['--id', 'sheet-icons-roster-1', '--attempt', '1'])
    reg = A.Registry(R.REG_PATH)
    assert reg.get('icon-faded-letter')['batch'] == 'roster-r0' and reg.get('icon-wight-wick')['batch'] == 'roster-r1'
    assert reg.get('icon-faded-letter')['kind'] == 'roster-icon' and 'runtime' not in reg.get('icon-faded-letter')
    assert not any(k.startswith('icon-None') for k in reg.data['assets'])
    reg.set('enemy-root-hound', status='approved')
    with pytest.raises(PermissionError, match='reopen'):
        R.pick(['--id', 'enemy-root-hound', '--attempt', '1'])


def test_approve_refuses_without_the_shown_hashes_a_date_or_with_any_part_not_qa_passed(factory, review):
    _fill(factory, 'r0')
    _refused(factory, 'r0', by='user: 可以 2026-10-27')                     # no review page record yet
    review.main('r0')
    _refused(factory, 'r0', by='user: 可以')                                # no date
    reg = A.Registry(R.REG_PATH); reg.set('enemy-paper-moth', status='qa_failed')
    _refused(factory, 'r0', by='user: 可以 2026-10-27')                     # a part did not pass
    reg.set('enemy-paper-moth', status='qa_passed'); reg.data['assets'].pop('icon-mist-root'); reg._save()
    _refused(factory, 'r0', by='user: 可以 2026-10-27')                     # a part not picked
    _fill(factory, 'r0'); review.main('r0')
    _png(factory / 'work/enemy-fog-warden/enemy-fog-warden.png', (60, 70))  # re-picked after the page was built
    _refused(factory, 'r0', by='user: 可以 2026-10-27')


def test_the_forget_chip_on_the_review_page_wears_the_games_colour(factory, review):
    """E1c (B2 merged, 2026-10-27): the game draws 遺忘 in AILMENT_FILL.forget (#66B87E, spec §0 items 17 and 19), not the art's
    #8FD9B6, so the review page shows the chip icon in front of the word in the game's own colour, read from ailmentStyle.ts."""
    _fill(factory, 'forget'); page = review.main('forget')
    html = Path(page).read_text(encoding='utf-8').lower()
    game = re.search(r'forget: 0x([0-9a-f]{6})', (R.GAME / 'render/ailmentStyle.ts').read_text(encoding='utf-8')).group(1)
    assert game == '66b87e'
    assert f'color:#{game}' in html and '8fd9b6' not in html
    assert '<span class="chip"><img src="img/icon-ail-forget-14.png"' in html


def test_r0_needs_the_users_words_in_by(factory, review):
    _fill(factory, 'r0'); review.main('r0')
    _refused(factory, 'r0', review=str(factory / 'rec.md'))                 # an agent review cannot approve the style
    _refused(factory, 'r0', by='2026-10-27')                               # a date alone is not the user's words
    done = R.do_approve(A.Registry(R.REG_PATH), 'r0', by='user: 可以，照這風格 2026-10-27')
    reg = A.Registry(R.REG_PATH)
    assert set(done) == set(R.batch_assets('r0')) and reg.get('enemy-root-hound')['status'] == 'approved'
    assert reg.data['roster_style_approved'] and set(reg.data['roster_style_anchor']) == set(R.ROUNDS['r0'])
    assert reg.data['roster_style_anchor']['root-hound'].endswith('enemy-root-hound-a1.png')
    rec = reg.data['approved_batches']['roster-r0']
    assert rec['by'] == 'user: 可以，照這風格 2026-10-27' and all(SHA.match(h) for h in rec['shown'].values())
    assert rec['record'] == 'art-factory/starlantern/work/review/roster-r0-shown.json'                # PR D review, Medium 3
    assert 'style_approved' not in reg.data                                 # the 5d gear flag is not touched


def test_r1_to_r4_need_an_independent_review_record_instead(factory, review):
    _fill(factory, 'r1'); review.main('r1')
    _refused(factory, 'r1', review=str(factory / 'rec.md'))                 # the style is not approved yet
    reg = A.Registry(R.REG_PATH); reg.data['roster_style_approved'] = '2026-10-27'; reg._save()
    _refused(factory, 'r1', by='user: 可以 2026-10-27')                     # R1-R4 take no user approval (ruling 21)
    shown = json.loads(R.shown_path('r1').read_text(encoding='utf-8'))['parts']
    lines = [f'- {a} {h} 通過' for a, h in shown.items()]
    rec = factory / 'rec.md'
    rec.write_text('\n'.join(lines[:-1]) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(rec))                                # one image not in the record
    rec.write_text('\n'.join(lines[:-1] + [lines[-1].replace('通過', '不通過')]) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(rec))                                # one image failed the review
    bad = lines[:-1] + [re.sub(r'[0-9a-f]{64}', '0' * 64, lines[-1])]
    rec.write_text('\n'.join(bad) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(rec))                                # the review saw other bytes
    rec.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    done = R.do_approve(A.Registry(R.REG_PATH), 'r1', review=str(rec))
    reg = A.Registry(R.REG_PATH)
    assert set(done) == set(R.batch_assets('r1'))
    rb = reg.data['approved_batches']['roster-r1']
    kept = R.WORK / 'review' / 'roster-r1-review.md'
    assert kept.read_bytes() == rec.read_bytes() and rb['review_sha256'] == R.sha256(rec)              # PR D review, Medium 3
    assert rb['review'] == 'art-factory/starlantern/work/review/roster-r1-review.md'
    assert rb['record'] == 'art-factory/starlantern/work/review/roster-r1-shown.json'
    assert not any(':' in str(v) or str(v).startswith('/') for v in (rb['review'], rb['record']))         # never an absolute path
    assert reg.get('enemy-lamp-wight')['approved_by'].startswith('independent review art-factory/starlantern/work/review/roster-r1-review.md')


# --- D3: the review page ----------------------------------------------------------------------------------------------------
def _legacy_and_bg(factory, monkeypatch, review):
    pub = factory / 'pubart'
    for e in review.LEGACY:
        _png(pub / f'enemy/{e}.png', (50, 60) if e != 'lanterneater' else (147, 154), colour=(90, 120, 80))
    for n in (1, 2, 3):
        p = pub / f'bg/f{n}.png'; p.parent.mkdir(parents=True, exist_ok=True); Image.new('RGB', (480, 270), (40, 50, 60 + 30 * n)).save(p)
    monkeypatch.setattr(review, 'PUB', pub)


def test_review_page_writes_shown_hashes_and_the_eight_sections_without_silhouettes(factory, review, monkeypatch):
    _legacy_and_bg(factory, monkeypatch, review)
    reg = _fill(factory, 'r0')
    reg.set('enemy-paper-moth', rejected_attempts={'a2': 'too dark'}, plain_reasons={'a2': '太暗'})
    before = R.REG_PATH.read_bytes()
    page_path = review.main('r0')
    page = page_path.read_text(encoding='utf-8')
    assert R.REG_PATH.read_bytes() == before                                 # read-only for the registry
    shown = json.loads(R.shown_path('r0').read_text(encoding='utf-8'))['parts']
    assert set(shown) == set(R.batch_assets('r0'))
    for aid, h in shown.items(): assert h == R.sha256(A._final_path(A.Registry(R.REG_PATH).get(aid)['final'])), aid
    for sec in ('battle', 'legacy', 'tints', 'groups', 'icons', 'story', 'qa', 'rejected'):
        assert f'id="sec-{sec}"' in page, sec
    assert page.count('<section') == 8 and 'silhouette' not in page.lower() and '剪影' not in page
    srcs = re.findall(r'src="([^"]*)"', page)
    assert srcs and all(s.startswith('img/') and (page_path.parent / s).is_file() for s in srcs)
    assert '太暗' in page and 'too dark' in page                              # the rejected attempt and why
    for e in ('bell-watcher', 'false-moon'):
        assert f'data-story="{e}"' in page, e                                 # gates and never-draw list beside a story foe
    assert 'data-story="root-hound"' not in page
    assert 'style=' not in page                                             # classes only
    for n in (1, 2, 3): assert (page_path.parent / f'img/battle-f{n}.png').is_file()


def test_battle_scene_follows_the_game_layout():
    """BattleView.setup: 640 x 360 stage, left 150, bottom 70; a foe is fitted to 45% (a boss 62%) of the usable height
    and 90% of its slot width, feet on the ground 28 px above the party bar."""
    import review_roster as V
    sprite = Image.new('RGBA', (60, 64), (200, 200, 200, 255))
    k, box = V.placement(sprite.size, i=0, n=1, boss=False)
    assert abs(k - 290 * 0.45 / 64) < 1e-9 and box[3] == 262 and box[0] + box[2] == 2 * (150 + 245)
    kb, _ = V.placement((147, 154), i=0, n=1, boss=True)
    assert abs(kb - 290 * 0.62 / 154) < 1e-9
    kw, _ = V.placement((300, 64), i=0, n=3, boss=False)                     # three wide foes: the slot width wins
    assert abs(kw - (490 / 4) * 0.9 / 300) < 1e-9
    out = V.battle_scene(Image.new('RGB', (480, 270), (10, 20, 30)), [sprite, sprite, sprite], [False] * 3)
    assert out.size == (640, 360)


def test_contact_sheet_of_a_round_without_sheets_shows_its_own_icons_and_uniques(factory, review, monkeypatch):
    """R1's icons and uniques are drawn on R0's sheets but approved with R1, so R1's contact sheet shows them (and R0's
    still shows everything its sheets drew, R1's parts included)."""
    _legacy_and_bg(factory, monkeypatch, review)
    _fill(factory, 'r0'); reg = _fill(factory, 'r1')
    r1_items = {a for a in R.batch_assets('r1') if not a.startswith('enemy-')}
    assert r1_items and set(review.drawn_assets(reg, 'r1')) == r1_items
    assert r1_items < set(review.drawn_assets(reg, 'r0'))
    out = factory / 'r1-contact.png'
    review.main('r1', contact=str(out))
    assert out.is_file() and Image.open(out).height > 360 * 3


# --- D4: publish --------------------------------------------------------------------------------------------------------------
MONSTERS = '''export const LEGACY_ENEMY_IDS: readonly string[] = ['slime'];
/**
 * Roster ids whose art is published.
 */
export const ROSTER_ART: ReadonlySet<string> = new Set<string>([]);
/** live */
export const ROSTER_LIVE: ReadonlySet<string> = new Set<string>([]);
'''
ARTPATHS = '''  it('lists one url per asset with no duplicates', () => {
    const urls = allArtUrls();
    // + faces wave 4 (affinity plan Task A; user approval 2026-10-24 「可以，照這風格」): nine blush, both Rin looks' averted,
    //   Sylvie's unguarded, Noel's smug, Bobby's excited = 722
    expect(urls).toHaveLength(722);
    expect(new Set(urls).size).toBe(722);
'''


@pytest.fixture
def rooted(factory, monkeypatch):
    monkeypatch.setattr(A, 'ROOT', factory / 'af' / 'sl'); monkeypatch.setattr(R, 'REG_PATH', factory / 'af/sl/registry.json')
    public = factory / 'public'; public.mkdir(parents=True, exist_ok=True)
    subprocess.run(['git', 'init', '-q'], cwd=public, check=True)
    R.MONSTERS_TS.write_text(MONSTERS, encoding='utf-8', newline='\n')
    R.ARTPATHS_TEST.write_bytes(ARTPATHS.replace('\n', '\r\n').encode('utf-8'))
    R.E2E_SPEC.write_bytes(E2E.encode('utf-8'))
    return public


def test_publish_refuses_an_unapproved_batch(factory, review, rooted):
    _fill(factory, 'r0'); review.main('r0')
    with pytest.raises(PermissionError, match='approval'):
        R.do_publish(A.Registry(R.REG_PATH), 'r0', rooted)
    assert not (rooted / 'assets').exists() and R.MONSTERS_TS.read_text(encoding='utf-8') == MONSTERS


def test_publish_with_a_fake_approved_batch_writes_runtime_manifest_and_roster_art_and_the_count_line(factory, review, rooted):
    public = rooted
    _fill(factory, 'r0'); review.main('r0')
    R.do_approve(A.Registry(R.REG_PATH), 'r0', by='user: 可以 2026-10-27')
    _png(factory / 'work/enemy-fog-warden/enemy-fog-warden.png', (61, 70))   # changed after approval: the whole batch waits
    with pytest.raises(PermissionError, match='enemy-fog-warden'):
        R.do_publish(A.Registry(R.REG_PATH), 'r0', public)
    assert not (public / 'assets').exists() and R.MONSTERS_TS.read_text(encoding='utf-8') == MONSTERS
    _fill(factory, 'r0'); review.main('r0')
    reg = A.Registry(R.REG_PATH); reg.data.pop('approved_batches'); reg.data.pop('roster_style_approved'); reg._save()
    R.do_approve(A.Registry(R.REG_PATH), 'r0', by='user: 可以 2026-10-27')
    done = R.do_publish(A.Registry(R.REG_PATH), 'r0', public)
    reg = A.Registry(R.REG_PATH)
    assert set(done) == set(R.batch_assets('r0'))
    e = reg.get('enemy-paper-moth')
    assert e['status'] == 'published' and e['runtime'] == '/assets/games/starlantern/enemy/paper-moth.png'
    assert (public / 'assets/games/starlantern/enemy/paper-moth.png').is_file()
    assert reg.get('icon-faded-letter')['runtime'] == '/assets/games/starlantern/icon/faded-letter.png'
    assert reg.get('gear-fog-halberd-large')['runtime'] == '/assets/games/starlantern/gear/fog-halberd-large.png'
    assert 'icon-ail-forget-14' not in reg.data['assets']                    # the forget chip waits for E1c (ruling 27)
    assert 'icon-wight-wick' not in reg.data['assets']                       # an R1 owner's icon waits for R1
    urls = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))['urls']
    assert '/assets/games/starlantern/enemy/paper-moth.png' in urls and len(urls) == len(done)
    ts = R.MONSTERS_TS.read_text(encoding='utf-8')
    assert "new Set<string>([\n  'paper-moth', 'root-hound', 'bell-watcher', 'false-moon', 'fog-warden',\n])" in ts
    assert "export const ROSTER_LIVE: ReadonlySet<string> = new Set<string>([]);" in ts       # live is never touched
    raw = R.ARTPATHS_TEST.read_bytes()
    assert b'\r\n' in raw and b'\n' not in raw.replace(b'\r\n', b'')                           # its CRLF kept
    t = raw.decode('utf-8')
    n = 722 + 5 + 5 + 2 * 2
    assert f'expect(urls).toHaveLength({n});' in t and f'expect(new Set(urls).size).toBe({n});' in t
    assert f'// + roster R0 (user: 可以 2026-10-27): 5 foes, 5 material icons, 2 own uniques x 2 = {n}' in t
    assert R.roster_art_ids(R.MONSTERS_TS) == R.ROUNDS['r0']
    with pytest.raises(PermissionError):
        R.do_publish(A.Registry(R.REG_PATH), 'r1', public)                    # nothing approved there


def test_old_sl_art_approve_and_publish_refuse_roster_parts(factory, rooted):
    reg = A.Registry(R.REG_PATH)
    reg.set('enemy-x', status='qa_passed', batch='roster-r0', final=_png(factory / 'work/x.png'))
    with pytest.raises(PermissionError, match='roster_art.py'):
        reg.approve('enemy-x')
    reg.set('enemy-x', status='approved', runtime='/assets/games/starlantern/enemy/x.png')
    with pytest.raises(PermissionError, match='roster_art.py'):
        A.main(['publish', '--approved'])
    with pytest.raises(PermissionError, match='roster_art.py'):
        A.Registry(R.REG_PATH).publish('enemy-x', rooted)
    assert not (rooted / 'assets/games/starlantern/enemy/x.png').exists()


# --- PR D review (2026-10-26): Medium 2, Low 5, Low 7 -------------------------------------------------------------------------
def _r1_record(factory, review):
    _fill(factory, 'r1'); review.main('r1')
    reg = A.Registry(R.REG_PATH); reg.data['roster_style_approved'] = '2026-10-27'; reg._save()
    shown = json.loads(R.shown_path('r1').read_text(encoding='utf-8'))['parts']
    return [f'- {a} {h} 通過' for a, h in shown.items()]


@pytest.mark.parametrize('verdict', ['未通過', '沒有通過', '無法通過：輪廓不清', '通過？否', '不通過', '通過 ', '通過（有疑慮）', 'PASS'])
def test_a_review_line_passes_only_in_the_strict_format(factory, review, verdict):
    lines = _r1_record(factory, review)
    rec = factory / 'rec.md'
    rec.write_text('\n'.join(lines[:-1] + [lines[-1][:-len('通過')] + verdict]) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(rec))
    assert not (R.WORK / 'review' / 'roster-r1-review.md').exists()


def test_a_review_record_needs_every_asset_of_the_round_and_nothing_else_on_its_lines(factory, review):
    lines = _r1_record(factory, review); rec = factory / 'rec.md'
    rec.write_text('# R1 review\n\n' + '\n'.join(lines[:-1]) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(rec))                                # an asset of the round is missing
    rec.write_text('\n'.join(lines + [lines[0] + ' 但臉太清楚']) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(rec))                                # a line in any other form is not a pass
    rec.write_text('# R1 review, fresh-context agent\n\nnotes are free text\n\n' + '\n'.join(lines) + '\n', encoding='utf-8')
    assert set(R.do_approve(A.Registry(R.REG_PATH), 'r1', review=str(rec))) == set(R.batch_assets('r1'))


E2E = ("  test('every published art file loads', async ({ page }) => {\r\n"
       "    // Sylvie's unguarded, Noel's smug, Bobby's excited = 722\n"
       "    expect(manifest.length).toBe(722);\n"
       "    // Every file the manifest lists answers 200.\r\n")


def test_publish_moves_the_e2e_manifest_count_with_the_url_total(factory, review, rooted):
    R.E2E_SPEC.write_bytes(E2E.encode('utf-8'))
    _fill(factory, 'r0'); review.main('r0'); R.do_approve(A.Registry(R.REG_PATH), 'r0', by='user: 可以 2026-10-27')
    R.do_publish(A.Registry(R.REG_PATH), 'r0', rooted)
    raw = R.E2E_SPEC.read_bytes()
    assert b'    expect(manifest.length).toBe(736);\n' in raw and b'= 736\n' in raw              # that line's own LF kept
    assert raw.startswith(E2E.split('\n')[0].encode('utf-8')) and raw.endswith(b'answers 200.\r\n')   # the CRLF lines untouched
    assert R.url_totals() == (736, 736)


def test_publish_is_all_or_nothing_and_a_retry_is_a_no_op(factory, review, rooted, monkeypatch):
    public = rooted; R.E2E_SPEC.write_bytes(E2E.encode('utf-8'))
    _fill(factory, 'r0'); review.main('r0'); R.do_approve(A.Registry(R.REG_PATH), 'r0', by='user: 可以 2026-10-27')
    before = (R.REG_PATH.read_bytes(), R.MONSTERS_TS.read_bytes(), R.ARTPATHS_TEST.read_bytes(), R.E2E_SPEC.read_bytes())
    real = R.shutil.copyfile; calls = []
    def flaky(src, dst, *a, **k):
        calls.append(dst)
        if len(calls) == 3: raise OSError('disk full')
        return real(src, dst, *a, **k)
    monkeypatch.setattr(R.shutil, 'copyfile', flaky)
    with pytest.raises(OSError):
        R.do_publish(A.Registry(R.REG_PATH), 'r0', public)
    assert (R.REG_PATH.read_bytes(), R.MONSTERS_TS.read_bytes(), R.ARTPATHS_TEST.read_bytes(), R.E2E_SPEC.read_bytes()) == before
    assert not [p for p in public.rglob('*') if p.is_file() and '.git' not in p.parts]            # no file, no temp file left
    monkeypatch.setattr(R.shutil, 'copyfile', real)
    done = R.do_publish(A.Registry(R.REG_PATH), 'r0', public)
    after = (R.REG_PATH.read_bytes(), R.MONSTERS_TS.read_bytes(), R.ARTPATHS_TEST.read_bytes(), R.E2E_SPEC.read_bytes())
    assert set(done) == set(R.batch_assets('r0'))
    assert R.do_publish(A.Registry(R.REG_PATH), 'r0', public) == []                                # a retry changes nothing
    assert (R.REG_PATH.read_bytes(), R.MONSTERS_TS.read_bytes(), R.ARTPATHS_TEST.read_bytes(), R.E2E_SPEC.read_bytes()) == after


def test_an_id_on_two_pass_lines_refuses_the_round(factory, review):
    """Confirmation review nit: one image, one verdict; a second pass line for the same id refuses the whole round."""
    lines = _r1_record(factory, review); rec = factory / 'rec.md'
    rec.write_text('\n'.join(lines + [lines[0]]) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(rec))
    assert not R.review_copy('r1').exists()


# --- controller ruling 2026-10-28: repair-outliers (the two published R0 pink outliers are key residue) ------------------------
REAL_REG = Path(__file__).resolve().parents[1] / 'registry.json'


def _real_entry(factory, aid):
    """The real registry entry of a published roster asset, its final copied into the test factory."""
    import copy, shutil
    e = copy.deepcopy(json.loads(REAL_REG.read_text(encoding='utf-8'))['assets'][aid])
    if (e.get('repair') or {}).get('status') == 'published':   # once R3 published the repair: the entry as it was before
        last = e['history'][-1]; e.update(final=last['final'], qa=last['qa']); e.pop('repair'); e.pop('history')
    dst = factory / 'work' / 'real' / f'{aid}.png'; dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(A._final_path(e['final']), dst); e['final'] = str(dst)
    reg = A.Registry(R.REG_PATH); reg.data['assets'][aid] = e; reg._save()
    return e


def test_repair_outliers_records_a_pending_postprocess_repair_and_touches_nothing_published(factory):
    e = _real_entry(factory, 'enemy-fog-warden'); before = dict(e)
    rec = R.repair_outliers(A.Registry(R.REG_PATH), 'enemy-fog-warden', 'r3')
    reg = A.Registry(R.REG_PATH); now = reg.get('enemy-fog-warden')
    for k in ('final', 'status', 'runtime', 'qa', 'batch'): assert now[k] == before[k], k       # the published record stays
    rep = now['repair']; assert rep == rec
    f = A._final_path(rep['final'])
    assert f.is_file() and f.parent == R.WORK / 'repair'
    assert rep['from_sha256'] == R.sha256(e['final']) and rep['to_sha256'] == R.sha256(f)
    assert rep['pixels'] == [{'x': 34, 'y': 60, 'from': [188, 28, 147], 'to': rep['pixels'][0]['to']}] and rep['skipped'] == []
    assert rep['postprocess_only'] is True and rep['publish_with'] == 'r3' and rep['status'] == 'pending'
    old, new = np.asarray(Image.open(e['final']).convert('RGBA')), np.asarray(Image.open(f).convert('RGBA'))
    assert int((old != new).any(axis=-1).sum()) == 1 and rep['changed_pixels'] == 1
    q = rep['qa']
    assert q['pass'] and q['reasons'] == [] and q['pink_outlier'] == 0 and q['bright_key'] == 0
    assert q['spec'] == A.qa_spec('roster-sprite')
    assert q['height'] == before['qa']['height'] and q['erased'] == before['qa']['erased']   # the alpha is the same
    snap = R.REG_PATH.read_bytes(); same = f.read_bytes()
    assert R.repair_outliers(A.Registry(R.REG_PATH), 'enemy-fog-warden', 'r3') == rec          # idempotent
    assert R.REG_PATH.read_bytes() == snap and f.read_bytes() == same


def test_repair_outliers_on_the_real_icon_regates_it_as_a_roster_icon(factory):
    _real_entry(factory, 'icon-fog-gate-plate')
    rep = R.repair_outliers(A.Registry(R.REG_PATH), 'icon-fog-gate-plate', 'r3')
    assert [(p['x'], p['y'], p['from']) for p in rep['pixels']] == [(27, 21, [205, 6, 146])] and rep['changed_pixels'] == 1
    assert rep['qa']['pass'] and rep['qa']['pink_outlier'] == 0 and rep['qa']['spec'] == A.qa_spec('roster-icon')


def _pinked(path, xy=(12, 12), colour=(192, 42, 145)):
    im = Image.open(path).convert('RGBA'); im.putpixel(xy, (*colour, 255)); im.save(path); return path


def test_repair_outliers_reports_a_pixel_it_cannot_repair_and_records_nothing(factory):
    reg = A.Registry(R.REG_PATH)
    arr = np.zeros((26, 26, 4), np.uint8); arr[5, 5] = (192, 42, 145, 255); arr[5, 6] = arr[6, 5] = (60, 80, 100, 255)
    p = factory / 'work/x/icon-fog-gate-plate.png'; p.parent.mkdir(parents=True); Image.fromarray(arr, 'RGBA').save(p)
    reg.set('icon-fog-gate-plate', status='published', batch='roster-r0', kind='roster-icon', final=str(p),
            runtime='/assets/games/starlantern/icon/fog-gate-plate.png', qa={'pass': True, 'reasons': []})
    snap = R.REG_PATH.read_bytes()
    with pytest.raises(PermissionError, match=r'\(5, 5'):
        R.repair_outliers(A.Registry(R.REG_PATH), 'icon-fog-gate-plate', 'r3')
    assert R.REG_PATH.read_bytes() == snap and not (R.WORK / 'repair').exists()
    clean = factory / 'work/x/clean.png'; _png(clean)
    reg = A.Registry(R.REG_PATH); reg.set('icon-fog-gate-plate', final=str(clean)); snap = R.REG_PATH.read_bytes()
    with pytest.raises(ValueError, match='no pink outlier'):
        R.repair_outliers(A.Registry(R.REG_PATH), 'icon-fog-gate-plate', 'r3')
    assert R.REG_PATH.read_bytes() == snap


def test_a_pending_repair_is_approved_with_its_round_and_published_over_the_old_runtime_file(factory, review, rooted):
    public = rooted
    _fill(factory, 'r0'); reg = A.Registry(R.REG_PATH); _pinked(A._final_path(reg.get('icon-fog-gate-plate')['final']))
    review.main('r0'); R.do_approve(A.Registry(R.REG_PATH), 'r0', by='user: 可以 2026-10-27')
    R.do_publish(A.Registry(R.REG_PATH), 'r0', public)
    dst = public / 'assets/games/starlantern/icon/fog-gate-plate.png'; old_sha = R.sha256(dst)
    rep = R.repair_outliers(A.Registry(R.REG_PATH), 'icon-fog-gate-plate', 'r1')
    assert R.sha256(dst) == old_sha                                                        # nothing published yet
    lines = _r1_record(factory, review); rec = factory / 'rec.md'
    rec.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(rec))                                              # the repair was not reviewed
    rec.write_text('\n'.join(lines + [f'- icon-fog-gate-plate {rep["to_sha256"]} 通過']) + '\n', encoding='utf-8')
    R.do_approve(A.Registry(R.REG_PATH), 'r1', review=str(rec))
    reg = A.Registry(R.REG_PATH)
    assert reg.get('icon-fog-gate-plate')['repair']['status'] == 'approved'
    assert reg.data['approved_batches']['roster-r1']['repairs'] == {'icon-fog-gate-plate': rep['to_sha256']}
    total0 = R.url_totals()
    done = R.do_publish(A.Registry(R.REG_PATH), 'r1', public)
    reg = A.Registry(R.REG_PATH); e = reg.get('icon-fog-gate-plate')
    assert set(done) == set(R.batch_assets('r1')) and R.sha256(dst) == rep['to_sha256']
    assert R.sha256(A._final_path(e['final'])) == rep['to_sha256'] and e['qa'] == rep['qa'] and e['status'] == 'published'
    assert e['repair']['status'] == 'published' and e['history'][-1]['final_sha256'] == old_sha
    r0 = reg.data['approved_batches']['roster-r0']
    assert r0['shown']['icon-fog-gate-plate'] == rep['to_sha256']
    assert r0['repaired']['icon-fog-gate-plate'] == {'from': old_sha, 'to': rep['to_sha256'], 'with': 'roster-r1'}
    assert R.url_totals() == (total0[0] + len(done), total0[1] + len(done))              # same url: no count for the repair
    urls = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))['urls']
    assert urls.count('/assets/games/starlantern/icon/fog-gate-plate.png') == 1
    snap = R.REG_PATH.read_bytes()
    assert R.do_publish(A.Registry(R.REG_PATH), 'r1', public) == [] and R.REG_PATH.read_bytes() == snap


# --- controller ruling 2026-10-28 (R3 rounds): one approval over several review records -------------------------------------
def test_approve_takes_several_review_records_together_and_keeps_each(factory, review):
    lines = _r1_record(factory, review); a, b = factory / 'round1.md', factory / 'round2.md'
    a.write_text('# round 1\n' + '\n'.join(lines[:5]) + '\nFAIL enemy-x 00 nope\n', encoding='utf-8')
    b.write_text('# round 2\n' + '\n'.join(lines[5:]) + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=str(a))                                    # one record alone misses assets
    done = R.do_approve(A.Registry(R.REG_PATH), 'r1', review=[str(a), str(b)])
    assert set(done) == set(R.batch_assets('r1'))
    rec = A.Registry(R.REG_PATH).data['approved_batches']['roster-r1']
    kept = [R.review_copy('r1'), R.review_copy('r1').with_name('roster-r1-review-2.md')]
    assert [x.read_bytes() for x in kept] == [a.read_bytes(), b.read_bytes()]
    assert rec['reviews'] == [{'record': R.repo_path(k), 'sha256': R.sha256(k)} for k in kept]
    assert rec['review'] == R.repo_path(kept[0]) and rec['review_sha256'] == R.sha256(kept[0])


def test_several_records_still_refuse_a_bad_line_or_only_a_stale_hash(factory, review):
    lines = _r1_record(factory, review); a, b = factory / 'round1.md', factory / 'round2.md'
    aid, sha = lines[0].split()[1:3]
    stale = f'- {aid} {"0" * 64} 通過'
    a.write_text('\n'.join([stale] + lines[1:]) + '\n', encoding='utf-8')
    b.write_text(lines[0] + '\n', encoding='utf-8')
    _refused(factory, 'r1', review=[str(a)])                                  # only a stale hash for that asset
    b.write_text(lines[0][:-len('通過')] + '未通過\n', encoding='utf-8')
    _refused(factory, 'r1', review=[str(a), str(b)])                          # a bad line in any record refuses
    b.write_text(lines[0] + '\n', encoding='utf-8')
    assert set(R.do_approve(A.Registry(R.REG_PATH), 'r1', review=[str(a), str(b)])) == set(R.batch_assets('r1'))


def test_the_approve_cli_takes_the_review_flag_more_than_once(factory, review, monkeypatch):
    lines = _r1_record(factory, review); a, b = factory / 'round1.md', factory / 'round2.md'
    a.write_text('\n'.join(lines[:3]) + '\n', encoding='utf-8'); b.write_text('\n'.join(lines[3:]) + '\n', encoding='utf-8')
    monkeypatch.setattr(R, '_registry', lambda: A.Registry(R.REG_PATH))
    R.approve(['--batch', 'r1', '--review', str(a), '--review', str(b)])
    assert len(A.Registry(R.REG_PATH).data['approved_batches']['roster-r1']['reviews']) == 2


# --- controller ruling 2026-10-28 (R3 veil): a recorded deferral of one asset out of a round's approval and publish ----------
def _defer_setup(factory, review):
    lines = _r1_record(factory, review)
    keep = [l for l in lines if l.split()[1] != 'icon-wight-wick']
    rec = factory / 'rec.md'; rec.write_text('\n'.join(keep) + '\n', encoding='utf-8')
    why = factory / 'veil-review.md'; why.write_text('FAIL icon-wight-wick: still unreadable\n', encoding='utf-8')
    return rec, why


def test_approve_defers_a_recorded_asset_and_approves_the_rest(factory, review, rooted):
    rec, why = _defer_setup(factory, review)
    _refused(factory, 'r1', review=str(rec))                                  # without the deferral the round is short
    done = R.do_approve(A.Registry(R.REG_PATH), 'r1', review=str(rec), defer={'icon-wight-wick': str(why)})
    assert set(done) == set(R.batch_assets('r1')) - {'icon-wight-wick'}
    reg = A.Registry(R.REG_PATH); ab = reg.data['approved_batches']['roster-r1']
    kept = R.WORK / 'review' / 'roster-r1-defer-icon-wight-wick.md'
    assert ab['deferred'] == {'icon-wight-wick': {'reason': R.repo_path(kept), 'sha256': R.sha256(why), 'owner': 'lamp-wight'}}
    assert kept.read_bytes() == why.read_bytes()
    e = reg.get('icon-wight-wick')
    assert e['status'] == 'qa_passed' and e['deferred']['batch'] == 'roster-r1' and 'icon-wight-wick' not in ab['shown']


def test_defer_refuses_a_live_owner_an_asset_outside_the_round_or_no_reason(factory, review, rooted):
    rec, why = _defer_setup(factory, review)
    R.MONSTERS_TS.write_text(MONSTERS.replace("ROSTER_LIVE: ReadonlySet<string> = new Set<string>([])",
                                              "ROSTER_LIVE: ReadonlySet<string> = new Set<string>(['lamp-wight'])"), encoding='utf-8')
    _refused(factory, 'r1', review=str(rec), defer={'icon-wight-wick': str(why)})          # its species is live
    R.MONSTERS_TS.write_text(MONSTERS, encoding='utf-8')
    _refused(factory, 'r1', review=str(rec), defer={'icon-wight-wick': str(factory / 'nope.md')})   # no reason record
    _refused(factory, 'r1', review=str(rec), defer={'icon-wight-wick': str(why), 'icon-faded-letter': str(why)})   # not R1's
    assert not (R.WORK / 'review' / 'roster-r1-defer-icon-wight-wick.md').exists()


def test_publish_holds_a_deferred_asset_and_its_owners_other_art_out_of_runtime_manifest_counts_and_roster_art(factory, review, rooted):
    public = rooted; rec, why = _defer_setup(factory, review)
    R.do_approve(A.Registry(R.REG_PATH), 'r1', review=str(rec), defer={'icon-wight-wick': str(why)})
    total0 = R.url_totals()
    done = R.do_publish(A.Registry(R.REG_PATH), 'r1', public)
    reg = A.Registry(R.REG_PATH)
    held = {a for a in R.batch_assets('r1') if R.owner_of(a) == 'lamp-wight'}
    assert held == {'icon-wight-wick', 'enemy-lamp-wight'}
    assert set(done) == set(R.batch_assets('r1')) - held                                # the owner's whole art waits with it
    for a, f in (('icon-wight-wick', 'icon/wight-wick.png'), ('enemy-lamp-wight', 'enemy/lamp-wight.png')):
        assert not (public / 'assets/games/starlantern' / f).exists() and 'runtime' not in reg.get(a)
    assert reg.get('icon-wight-wick')['status'] == 'qa_passed' and reg.get('enemy-lamp-wight')['status'] == 'approved'
    urls = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))['urls']
    assert not [u for u in urls if 'wight-wick' in u or 'lamp-wight' in u] and len(urls) == len(done)
    assert R.url_totals() == (total0[0] + len(done), total0[1] + len(done))
    art = R.roster_art_ids(R.MONSTERS_TS)
    assert 'lamp-wight' not in art and set(art) == set(R.ROUNDS['r1']) - {'lamp-wight'}
    t = R.ARTPATHS_TEST.read_bytes().decode('utf-8')
    assert f'12 foes, 12 material icons, 3 own uniques x 2 (deferred: icon-wight-wick with lamp-wight) = {total0[0] + len(done)}' in t
