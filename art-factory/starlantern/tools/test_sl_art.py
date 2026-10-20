import json, re, sys
from pathlib import Path
import numpy as np
import pytest
from PIL import Image
import sl_art as A

M = (255, 0, 255)


def canvas(w, h, color=M):
    return Image.new('RGB', (w, h), color)


def blob(w=40, h=40, box=(10, 10, 30, 30), color=(40, 120, 200)):
    img = canvas(w, h); arr = np.asarray(img).copy()
    x0, y0, x1, y1 = box; arr[y0:y1, x0:x1] = color
    return Image.fromarray(arr, 'RGB')


def test_cutout_makes_magenta_transparent_and_keeps_subject_opaque():
    out = A.cutout(blob())
    a = np.asarray(out)[..., 3]
    assert a[0, 0] == 0 and a[20, 20] == 255
    assert A.alpha_qa(out)['pass']


def test_cutout_removes_near_magenta_fringe():
    arr = np.asarray(blob()).copy(); arr[9, 10:30] = (235, 20, 230)
    out = A.cutout(Image.fromarray(arr, 'RGB'))
    assert np.asarray(out)[9, 15, 3] == 0


def test_alpha_qa_flags_residue_semi_alpha_edge_and_holes():
    rgba = np.zeros((40, 40, 4), np.uint8)
    rgba[10:30, 10:30] = (40, 120, 200, 255)
    rgba[12, 12] = (250, 10, 250, 255)          # magenta residue
    rgba[13, 13, 3] = 128                       # semi alpha
    rgba[0, 20] = (40, 120, 200, 255)           # touches edge
    rgba[20, 20, 3] = 0                         # enclosed hole
    r = A.alpha_qa(Image.fromarray(rgba, 'RGBA'))
    assert not r['pass']
    assert r['residue'] == 1 and r['semi'] == 1 and r['edge'] >= 1 and r['holes'] == 1
    assert 'enclosed holes' not in r['reasons'] and r['warnings'] == ['enclosed holes']


def test_alpha_qa_allows_declared_holes():
    rgba = np.zeros((40, 40, 4), np.uint8); rgba[10:30, 10:30] = (9, 9, 9, 255); rgba[20, 20, 3] = 0
    assert A.alpha_qa(Image.fromarray(rgba, 'RGBA'), allow_holes=1)['pass']


def test_to_art_pixels_samples_block_centres():
    big = Image.new('RGBA', (8, 4), (0, 0, 0, 0)); arr = np.asarray(big).copy()
    arr[:, :4] = (255, 0, 0, 255); arr[:, 4:] = (0, 0, 255, 255)
    small = A.to_art_pixels(Image.fromarray(arr, 'RGBA'), 4)
    assert small.size == (2, 1)
    assert tuple(np.asarray(small)[0, 0]) == (255, 0, 0, 255)


def test_slice_grid_splits_on_magenta_gutters():
    img = canvas(70, 46); arr = np.asarray(img).copy()
    for cx in (2, 36):
        for cy in (2, 24):
            arr[cy:cy + 20, cx:cx + 32] = (10, 200, 10)
    cells = A.slice_grid(Image.fromarray(arr, 'RGB'), 2, 2)
    assert len(cells) == 4 and all(c.size == (32, 20) for c in cells)


def test_slice_grid_rejects_wrong_count():
    with pytest.raises(ValueError):
        A.slice_grid(blob(), 2, 2)


def test_seam_score_zero_for_wrapping_tile_and_high_for_hard_edge():
    flat = Image.new('RGB', (8, 8), (90, 90, 90))
    assert A.seam_score(flat) == 0
    arr = np.zeros((8, 8, 3), np.uint8); arr[:, 4:] = 255
    assert A.seam_score(Image.fromarray(arr, 'RGB')) > 100


def test_registry_publish_requires_approval_and_writes_manifest(tmp_path):
    reg = A.Registry(tmp_path / 'registry.json')
    final = tmp_path / 'final.png'; Image.new('RGBA', (4, 4), (1, 2, 3, 255)).save(final)
    reg.set('enemy-slime', kind='sprite', status='qa_passed', final=str(final), runtime='/assets/games/starlantern/enemy/slime.png')
    public = tmp_path / 'public'
    with pytest.raises(PermissionError):
        reg.publish('enemy-slime', public)
    reg.approve('enemy-slime'); reg.publish('enemy-slime', public)
    assert (public / 'assets/games/starlantern/enemy/slime.png').exists()
    reg.write_manifest(public)
    manifest = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))
    assert manifest == {'version': 1, 'urls': ['/assets/games/starlantern/enemy/slime.png']}
    assert A.Registry(tmp_path / 'registry.json').get('enemy-slime')['status'] == 'published'


def test_approve_refuses_assets_that_failed_qa(tmp_path):
    reg = A.Registry(tmp_path / 'r.json'); reg.set('x', status='qa_failed')
    with pytest.raises(PermissionError):
        reg.approve('x')


def test_reject_removes_runtime_file_and_manifest_entry(tmp_path):
    reg = A.Registry(tmp_path / 'r.json'); public = tmp_path / 'public'
    final = tmp_path / 'f.png'; Image.new('RGBA', (2, 2)).save(final)
    reg.set('bg-f1', status='qa_passed', final=str(final), runtime='/assets/games/starlantern/bg/f1.png')
    reg.approve('bg-f1'); reg.publish('bg-f1', public); reg.write_manifest(public)
    reg.reject('bg-f1', 'palette clash', public)
    assert not (public / 'assets/games/starlantern/bg/f1.png').exists()
    manifest = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))
    assert manifest['urls'] == []
    assert reg.get('bg-f1')['status'] == 'rejected' and reg.get('bg-f1')['reason'] == 'palette clash'


def test_runtime_path_must_stay_under_starlantern_base(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    with pytest.raises(ValueError):
        reg.set('evil', runtime='/assets/games/other/x.png')


def test_seeded_registry_covers_every_runtime_asset():
    import seed_registry
    reg = seed_registry.build()
    assets = reg['assets']
    runtime = [a['runtime'] for a in assets.values() if 'runtime' in a]
    # 189 (plan 4) + plan 5b tree-skill icons and plan 5c material icons, seeded as todo for plan 5d = 252,
    # + plan 6a skill icons (10 Rin, 21 hero) seeded from skills.ts = 283
    assert len(runtime) == 283 and len(set(runtime)) == 283
    assert assets['npc-guild-happy']['runtime'] == '/assets/games/starlantern/npc/guild-happy.png'
    assert assets['scene-title']['runtime'] == '/assets/games/starlantern/scene/title.png'
    for m in ('attack', 'hit', 'dying', 'down', 'ultimate'):
        assert assets[f'char-liz-portrait-{m}']['runtime'] == f'/assets/games/starlantern/char/liz-portrait-{m}.png'
    assert 'char-liz-portrait-hurt' not in assets
    assert assets['map-fog']['runtime'] == '/assets/games/starlantern/map/fog.png'
    assert all(r.startswith(A.BASE) for r in runtime)
    assert assets['tile-f2-chest-open']['runtime'] == '/assets/games/starlantern/tiles/f2-chest-open.png'
    assert assets['sheet-icons-1']['parts'][0] == 'icon-fire-star'
    assert len(assets['sheet-icons-3']['parts']) == 39  # 23 + plan 5c materials (essences, region, rare)


def test_cutout_removes_magenta_tinted_fringe_but_keeps_pinks_and_purples():
    arr = np.asarray(blob(w=60, h=20, box=(5, 5, 55, 15))).copy()
    arr[10, 10] = (185, 80, 175)    # anti-aliased magenta fringe (distance 80)
    arr[10, 20] = (240, 150, 190)   # pink hair
    arr[10, 30] = (120, 40, 160)    # deep purple cloth
    arr[10, 40] = (200, 180, 230)   # lavender hair
    a = np.asarray(A.cutout(Image.fromarray(arr, 'RGB')))[..., 3]
    assert a[10, 10] == 0
    assert a[10, 20] == 255 and a[10, 30] == 255 and a[10, 40] == 255


def test_alpha_qa_ignores_large_enclosed_gaps_like_arm_gaps():
    rgba = np.zeros((40, 40, 4), np.uint8); rgba[5:35, 5:35] = (9, 9, 9, 255)
    rgba[12:20, 12:20, 3] = 0       # 64 px gap between arm and body
    r = A.alpha_qa(Image.fromarray(rgba, 'RGBA'))
    assert r['pass'] and r['holes'] == 0


def test_alpha_qa_ignores_pockets_that_were_pure_magenta_in_the_source():
    rgba = np.zeros((40, 40, 4), np.uint8); rgba[10:30, 10:30] = (9, 9, 9, 255); rgba[20, 20, 3] = 0
    hint = np.zeros((40, 40), bool); hint[20, 20] = True
    assert A.alpha_qa(Image.fromarray(rgba, 'RGBA'), bg_hint=hint)['pass']


def test_finish_counts_only_erased_colour_as_holes(tmp_path):
    big = np.zeros((40, 40, 3), np.uint8); big[:] = (255, 0, 255)
    big[8:32, 8:32] = (20, 120, 60)
    big[16:20, 16:20] = (255, 0, 255)     # real 1-art-px gap of pure magenta
    big[24:28, 24:28] = (190, 75, 180)    # magenta-ish fringe colour inside the body: erased
    raw = tmp_path / 'raw.png'; Image.fromarray(big, 'RGB').save(raw)
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'enemy-x', raw, 'sprite', workdir=tmp_path / 'w', block=4)['enemy-x']
    assert q['holes'] == 1 and q['warnings'] == ['enclosed holes'] and q['pass']


def test_slice_grid_trims_anti_aliased_magenta_edges_from_cells():
    img = canvas(46, 24); arr = np.asarray(img).copy()
    arr[2:22, 2:22] = (90, 140, 90); arr[2:22, 22] = (200, 70, 190)     # fringe column on the right of cell 1
    arr[2:22, 24:44] = (90, 140, 90); arr[1, 24:44] = (210, 60, 200)    # fringe row above cell 2
    cells = A.slice_grid(Image.fromarray(arr, 'RGB'), 2, 1)
    assert [c.size for c in cells] == [(20, 20), (20, 20)]


def test_holes_alone_do_not_fail_qa_but_are_flagged_for_review():
    rgba = np.zeros((40, 40, 4), np.uint8); rgba[10:30, 10:30] = (9, 9, 9, 255); rgba[20, 20, 3] = 0
    r = A.alpha_qa(Image.fromarray(rgba, 'RGBA'))
    assert r['pass'] and r['warnings'] == ['enclosed holes']


def test_finish_scales_sprites_to_a_target_art_height(tmp_path):
    big = np.zeros((300, 200, 3), np.uint8); big[:] = (255, 0, 255); big[50:250, 50:150] = (20, 120, 60)
    raw = tmp_path / 'raw.png'; Image.fromarray(big, 'RGB').save(raw)
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'char-x', raw, 'sprite', workdir=tmp_path / 'w', height=50)['char-x']
    assert q['block'] == 4 and q['size'] == [27, 52]


def test_cutout_strips_near_magenta_fringe_on_the_edge_but_keeps_it_inside():
    arr = np.asarray(blob(w=40, h=40, box=(10, 10, 30, 30))).copy()
    arr[10, 15] = (167, 81, 176)   # fringe on the subject's edge, touching the background
    arr[20, 20] = (167, 81, 176)   # same purple deep inside the subject
    a = np.asarray(A.cutout(Image.fromarray(arr, 'RGB')))[..., 3]
    assert a[10, 15] == 0 and a[20, 20] == 255


def test_defringe_clears_near_magenta_pixels_on_the_alpha_edge():
    rgba = np.zeros((10, 10, 4), np.uint8); rgba[2:8, 2:8] = (20, 120, 60, 255)
    rgba[2, 4] = (165, 84, 203, 255); rgba[5, 5] = (165, 84, 203, 255)
    out = np.asarray(A.defringe(Image.fromarray(rgba, 'RGBA')))
    assert out[2, 4, 3] == 0 and out[5, 5, 3] == 255


def test_alpha_qa_allows_declared_in_palette_magenta_like_pixels():
    rgba = np.zeros((10, 10, 4), np.uint8); rgba[2:8, 2:8] = (20, 120, 60, 255); rgba[5, 5] = (231, 89, 172, 255)
    assert not A.alpha_qa(Image.fromarray(rgba, 'RGBA'))['pass']
    assert A.alpha_qa(Image.fromarray(rgba, 'RGBA'), allow_residue=1)['pass']


def test_slice_grid_trims_edge_lines_blended_with_magenta():
    img = canvas(28, 24); arr = np.asarray(img).copy()
    arr[2:22, 2:22] = (120, 140, 110)
    arr[2:22, 22] = (162, 88, 156)                  # right column blended with the gutter
    arr[21, 2:22] = (170, 95, 160)                  # bottom row blended too
    arr[5, 22] = (120, 140, 110)                    # a few real pixels in that column do not keep it
    assert A.slice_grid(Image.fromarray(arr, 'RGB'), 1, 1)[0].size == (21, 20)      # icons: untouched
    assert A.slice_grid(Image.fromarray(arr, 'RGB'), 1, 1, trim=True)[0].size == (20, 19)


def test_finish_fails_a_subject_cut_off_by_the_raw_canvas_unless_that_side_is_allowed(tmp_path):
    big = np.zeros((120, 80, 3), np.uint8); big[:] = (255, 0, 255); big[20:120, 20:60] = (20, 120, 60)   # feet cut at the bottom
    raw = tmp_path / 'raw.png'; Image.fromarray(big, 'RGB').save(raw)
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'char-x', raw, 'sprite', workdir=tmp_path / 'w', block=4)['char-x']
    assert not q['pass'] and 'subject cut by the canvas edge' in q['reasons']
    reg.set('char-y', allow_edge=['bottom'])
    assert A.process(reg, 'char-y', raw, 'sprite', workdir=tmp_path / 'w2', block=4)['char-y']['pass']


def test_defringe_also_clears_dark_magenta_blended_into_outlines():
    rgba = np.zeros((10, 10, 4), np.uint8); rgba[2:8, 2:8] = (20, 20, 20, 255)
    rgba[2, 4] = (174, 7, 145, 255); rgba[5, 5] = (174, 7, 145, 255); rgba[2, 6] = (120, 40, 160, 255)
    out = np.asarray(A.defringe(Image.fromarray(rgba, 'RGBA'), strong=True))
    assert out[2, 4, 3] == 0          # edge: dark magenta fringe
    assert out[5, 5, 3] == 255        # inside: kept
    assert out[2, 6, 3] == 255        # edge but a real deep purple (green channel present): kept


def test_defringe_peels_a_two_pixel_thick_fringe():
    rgba = np.zeros((10, 12, 4), np.uint8); rgba[2:8, 2:10] = (20, 20, 20, 255)
    rgba[2:8, 2] = (174, 7, 145, 255); rgba[2:8, 3] = (160, 10, 130, 255)
    out = np.asarray(A.defringe(Image.fromarray(rgba, 'RGBA'), strong=True))
    assert (out[2:8, 2:4, 3] == 0).all() and (out[2:8, 4:10, 3] == 255).all()


def test_defringe_clears_bright_pink_fringe_but_keeps_pink_hair_on_the_edge():
    rgba = np.zeros((10, 10, 4), np.uint8); rgba[2:8, 2:8] = (20, 20, 20, 255)
    rgba[2, 3] = (241, 101, 181, 255); rgba[2, 6] = (240, 150, 190, 255)
    out = np.asarray(A.defringe(Image.fromarray(rgba, 'RGBA'), strong=True))
    assert out[2, 3, 3] == 0 and out[2, 6, 3] == 255


def test_default_defringe_keeps_real_purples_and_pinks_on_the_edge():
    rgba = np.zeros((10, 14, 4), np.uint8); rgba[2:8, 2:12] = (20, 20, 20, 255)
    for x, c in [(3, (180, 110, 220)), (5, (150, 100, 230)), (7, (120, 0, 120)), (9, (241, 101, 181))]:
        rgba[2, x] = (*c, 255)
    out = np.asarray(A.defringe(Image.fromarray(rgba, 'RGBA')))
    assert all(out[2, x, 3] == 255 for x in (3, 5, 7, 9))
    rgba[2, 11] = (230, 40, 220, 255)               # near-magenta fringe is still removed by default
    assert np.asarray(A.defringe(Image.fromarray(rgba, 'RGBA')))[2, 11, 3] == 0


# --- Animated battle effects (fx-anim): one codex strip of 4 frames -> one transparent sheet of equal cells ---

def fx_strip(gaps=(60, 60, 60), sizes=((20, 20), (40, 50), (60, 70), (30, 30)), w=None, h=120, colors=None):
    """Four blobs left to right on magenta, separated by the given gutter widths, vertically centred."""
    colors = colors or [(250, 240, 120), (250, 160, 40), (220, 60, 20), (120, 40, 20)]
    w = w or 20 + sum(s[0] for s in sizes) + sum(gaps) + 20
    arr = np.zeros((h, w, 3), np.uint8); arr[:] = M; x = 20
    for k, ((bw, bh), c) in enumerate(zip(sizes, colors)):
        y0 = (h - bh) // 2; arr[y0:y0 + bh, x:x + bw] = c; x += bw + (gaps[k] if k < len(gaps) else 0)
    return Image.fromarray(arr, 'RGB')


def test_split_frames_cuts_at_the_widest_magenta_gutters():
    # frame 3 has an internal 10 px gap (scattered sparks); the three 60 px gutters still win
    img = fx_strip(); arr = np.asarray(img).copy()
    arr[55:60, 200:210] = M
    spans = A.split_frames(Image.fromarray(arr, 'RGB'), 4)
    assert len(spans) == 4 and spans[0][0] == 0 and spans[-1][1] == img.width
    assert all(a[1] == b[0] for a, b in zip(spans, spans[1:]))


def test_split_frames_rejects_a_strip_with_too_few_gutters():
    with pytest.raises(ValueError):
        A.split_frames(fx_strip(gaps=(60, 0, 60), sizes=((20, 20), (40, 50), (60, 70), (30, 30))), 4)


def test_process_fx_anim_builds_equal_cells_with_one_shared_scale(tmp_path):
    raw = tmp_path / 'raw.png'; fx_strip().resize((fx_strip().width * 4, 480), Image.NEAREST).save(raw)
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'fx-fire-anim', raw, 'fx-anim', workdir=tmp_path / 'w', frames=4, height=35)['fx-fire-anim']
    assert q['pass'], q
    sheet = Image.open(tmp_path / 'w' / 'fx-fire-anim.png')
    fw, fh = q['frame_size']
    assert sheet.size == (fw * 4, fh) and q['frames'] == 4
    assert q['block'] == 8                       # tallest frame 280 raw px / 35 art px, shared by every frame
    a = np.asarray(sheet)[..., 3]
    assert set(np.unique(a)) <= {0, 255}
    for k in range(4):                           # every cell holds art and leaves a clear border
        cell = a[:, k * fw:(k + 1) * fw]
        assert cell.any() and not cell[0].any() and not cell[-1].any() and not cell[:, 0].any() and not cell[:, -1].any()
    e = reg.get('fx-fire-anim')
    assert e['status'] == 'qa_passed' and e['kind'] == 'fx-anim' and e['frames'] == 4
    assert e['runtime'] == '/assets/games/starlantern/fx/fire-anim.png'


def test_process_fx_anim_keeps_each_frame_anchored_to_its_cell():
    # The same blob drawn lower in frame 2 must stay lower after processing (no per-frame re-centring).
    img = fx_strip(sizes=((20, 20),) * 4); arr = np.asarray(img).copy()
    x2 = 20 + 20 + 60; arr[:, x2:x2 + 20] = M; arr[80:100, x2:x2 + 20] = (250, 160, 40)
    frames, block, _ = A.fx_frames(Image.fromarray(arr, 'RGB'), 4, height=None, block=1)
    tops = [np.flatnonzero(np.asarray(f)[..., 3].any(axis=1))[0] for f in frames]
    assert tops[1] > tops[0] and tops[0] == tops[2] == tops[3]


def test_process_fx_anim_fails_identical_frames_and_canvas_cuts(tmp_path):
    same = fx_strip(sizes=((30, 30),) * 4, colors=[(250, 200, 60)] * 4)
    raw = tmp_path / 'same.png'; same.save(raw); reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'fx-x-anim', raw, 'fx-anim', workdir=tmp_path / 'w', frames=4, block=2)['fx-x-anim']
    assert not q['pass'] and 'frames identical' in q['reasons']
    arr = np.asarray(fx_strip()).copy(); arr[0:70, 20:40] = (250, 240, 120)        # frame 1 runs off the top
    raw2 = tmp_path / 'cut.png'; Image.fromarray(arr, 'RGB').save(raw2)
    q2 = A.process(reg, 'fx-y-anim', raw2, 'fx-anim', workdir=tmp_path / 'w2', frames=4, block=2)['fx-y-anim']
    assert not q2['pass'] and 'subject cut by the canvas edge' in q2['reasons']
    assert reg.get('fx-x-anim')['status'] == 'qa_failed'


def test_process_fx_anim_runs_alpha_qa_on_the_whole_sheet(tmp_path):
    raw = tmp_path / 'r.png'; fx_strip().save(raw); reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'fx-z-anim', raw, 'fx-anim', workdir=tmp_path / 'w', frames=4, block=2)['fx-z-anim']
    assert {'residue', 'semi', 'edge', 'holes', 'per_frame_edge'} <= set(q) and q['pass']


def test_codex_runs_without_a_console_window(tmp_path):
    import codex_still as C
    seen = {}
    def runner(argv, **kw):
        seen.update(kw); return type('P', (), {'returncode': 0})()
    C.run_codex('draw', tmp_path, 'x.png', runner=runner, codex='codex', generated_root=tmp_path / 'none')
    if sys.platform == 'win32':
        assert seen['creationflags'] & 0x08000000      # CREATE_NO_WINDOW
    assert seen['stdin'] is not None


def test_batch_has_one_fx_anim_job_per_effect_with_its_old_still_as_reference():
    import batch
    jobs = {j['id']: j for j in batch.jobs() if j['kind'] == 'fx-anim'}
    assert sorted(jobs) == sorted(f'fx-{k}-anim' for k in batch.FX)
    for k in batch.FX:
        j = jobs[f'fx-{k}-anim']
        assert j['frames'] == 4 and j['height'] == batch.HEIGHT['fx']
        text = (batch.PROMPTS / f'fx-{k}-anim.txt').read_text(encoding='utf-8')
        assert '#FF00FF' in text and 'four' in text.lower() and 'no text' in text.lower()


def test_magenta_blend_finds_pixels_mixed_with_the_key_next_to_their_source_colour():
    rgba = np.zeros((6, 8, 4), np.uint8); rgba[1:5, 1:7] = (255, 230, 0, 255)       # yellow bolt
    rgba[2, 3] = (243, 89, 152, 255)            # ~60% magenta + yellow: blend
    rgba[2, 5] = (60, 30, 70, 255); rgba[3, 5] = (89, 36, 94, 255)                 # real dark purple smoke
    m = A.magenta_blend(Image.fromarray(rgba, 'RGBA'))
    assert m[2, 3] and not m[3, 5] and not m[2, 5] and m.sum() == 1


def test_deblend_restores_the_source_colour_and_clears_the_qa_count():
    rgba = np.zeros((6, 8, 4), np.uint8); rgba[1:5, 1:7] = (40, 200, 40, 255)
    rgba[2, 2] = (146, 90, 146, 255); rgba[2, 3] = (150, 100, 150, 255)             # two-pixel pink cluster in green
    out = np.asarray(A.deblend(Image.fromarray(rgba, 'RGBA')))
    assert tuple(out[2, 2, :3]) == (40, 200, 40) and tuple(out[2, 3, :3]) == (40, 200, 40)
    assert not A.magenta_blend(Image.fromarray(out, 'RGBA')).any()


def test_process_fx_anim_fails_leftover_magenta_blend(tmp_path):
    arr = np.asarray(fx_strip()).copy()
    arr[30:34, 130:134] = (150, 95, 150)        # an isolated pink speck: no source colour to restore it to
    arr[29, 129:135] = (40, 40, 40); arr[34, 129:135] = (40, 40, 40); arr[30:34, 129] = (40, 40, 40); arr[30:34, 134] = (40, 40, 40)
    raw = tmp_path / 'r.png'; Image.fromarray(arr, 'RGB').save(raw); reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'fx-b-anim', raw, 'fx-anim', workdir=tmp_path / 'w', frames=4, block=1)['fx-b-anim']
    assert q['tint'] > 0 and 'magenta tint' in q['reasons'] and not q['pass']


# --- tile-wrap: auto-tiling wall tops (wrap x and y) and wall faces (wrap x) ---

def noise_tile(w=40, h=40, seed=1, wrap=True):
    """Smooth sine texture at art-pixel scale; wrap=True uses whole periods so opposite edges continue each other."""
    rng = np.random.default_rng(seed); y, x = np.mgrid[0:h, 0:w].astype(float)
    arr = np.full((h, w, 3), 90.0)
    for c in range(3):
        for _ in range(3):
            kx, ky = rng.integers(1, 4, 2) * (1.0 if wrap else 1.37); ph = rng.uniform(0, 2 * np.pi)
            arr[..., c] += 12 * np.sin(2 * np.pi * (kx * x / w + ky * y / h) + ph)
    return Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8), 'RGB')


def test_wrap_seam_is_low_for_a_periodic_tile_and_high_for_a_mismatched_edge():
    good = A.wrap_seam(noise_tile(), 'xy')
    assert set(good) == {'x', 'y'}
    assert good['x']['ratio'] <= A.SEAM_RATIO_MAX and good['y']['ratio'] <= A.SEAM_RATIO_MAX
    bad = A.wrap_seam(noise_tile(wrap=False), 'xy')
    assert bad['x']['ratio'] > 2 and bad['y']['ratio'] > 2
    assert bad['x']['seam'] > good['x']['seam']


def test_wrap_seam_only_measures_the_requested_axes():
    assert set(A.wrap_seam(noise_tile(), 'x')) == {'x'}


def test_edge_frame_flags_a_border_ring_but_not_plain_texture():
    assert max(A.edge_frame(noise_tile(), 'xy').values()) < 16
    arr = np.asarray(noise_tile()).copy(); arr[0, :] = arr[-1, :] = arr[:, 0] = arr[:, -1] = (5, 5, 5)
    framed = A.edge_frame(Image.fromarray(arr, 'RGB'), 'xy')
    assert framed['x'] >= 16 and framed['y'] >= 16
    # A wall face only wraps in x: its distinct top lip and base must not count as a frame.
    arr2 = np.asarray(noise_tile()).copy(); arr2[:3] = (230, 230, 200); arr2[-3:] = (5, 5, 5)
    assert A.edge_frame(Image.fromarray(arr2, 'RGB'), 'x')['x'] < 16


def test_make_seamless_cuts_an_overlap_so_the_tile_wraps_without_new_colours():
    src = noise_tile(48, 48, wrap=False)
    fixed, info = A.make_seamless(src, 'xy', overlap=6)
    assert fixed.size == (42, 42)                       # the overlap is consumed on each repaired axis
    m = A.wrap_seam(fixed, 'xy')
    assert m['x']['ratio'] <= A.SEAM_RATIO_MAX and m['y']['ratio'] <= A.SEAM_RATIO_MAX
    before = {tuple(c) for c in np.asarray(src).reshape(-1, 3)}
    after = {tuple(c) for c in np.asarray(fixed).reshape(-1, 3)}
    assert after <= before                              # a cut, never a blend: no new colours
    assert set(info) == {'x', 'y'} and all(v['cut_ratio'] >= 0 for v in info.values())


def test_make_seamless_keeps_the_body_of_the_tile_unchanged():
    src = np.asarray(noise_tile(48, 48, wrap=False))
    fixed, _ = A.make_seamless(Image.fromarray(src, 'RGB'), 'y', overlap=6)
    out = np.asarray(fixed)
    assert out.shape == (42, 48, 3)
    assert (out[:30] == src[6:36]).all()                # rows outside the overlap are the source rows, shifted


def test_make_seamless_x_only_keeps_the_height_and_the_top_and_bottom_rows():
    src = np.asarray(noise_tile(48, 48, wrap=False)); fixed, info = A.make_seamless(Image.fromarray(src, 'RGB'), 'x', overlap=6)
    out = np.asarray(fixed)
    assert out.shape == (48, 42, 3) and set(info) == {'x'}
    assert (out[:, :30] == src[:, 6:36]).all()


def _wrap_raw(tmp_path, tile, scale=6, name='raw.png'):
    raw = tmp_path / name; tile.resize((tile.width * scale, tile.height * scale), Image.NEAREST).save(raw); return raw


def test_process_tile_wrap_downscales_to_the_tile_size_and_records_seam_qa(tmp_path):
    raw = _wrap_raw(tmp_path, noise_tile(62, 62))
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'tile-f1-wall-top', raw, 'tile-wrap', workdir=tmp_path / 'w', wrap='xy', size=62)['tile-f1-wall-top']
    out = Image.open(tmp_path / 'w' / 'tile-f1-wall-top.png')
    assert out.size == (62, 62) and out.mode == 'RGB'
    assert set(q['seam']) == {'x', 'y'} and 'raw_seam' in q and 'frame' in q
    e = reg.get('tile-f1-wall-top')
    assert e['kind'] == 'tile-wrap' and e['wrap'] == 'xy'
    assert e['runtime'] == '/assets/games/starlantern/tiles/f1-wall-top.png'
    assert e['status'] in ('qa_passed', 'qa_failed')


def test_process_tile_wrap_repairs_a_bad_seam_and_reports_the_method(tmp_path):
    raw = _wrap_raw(tmp_path, noise_tile(62, 62, seed=3, wrap=False))
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'tile-f2-wall-face', raw, 'tile-wrap', workdir=tmp_path / 'w', wrap='x', size=62)['tile-f2-wall-face']
    assert q['raw_seam']['x']['ratio'] > A.SEAM_RATIO_MAX
    assert q['seamless_fix'] == 'overlap-cut' and q['seam']['x']['ratio'] <= A.SEAM_RATIO_MAX
    assert q['size'] == [62, 62] and 'x' in q['cut']
    assert set(q['seam']) == {'x'} and q['pass']
    assert reg.get('tile-f2-wall-face')['status'] == 'qa_passed'


def test_process_tile_wrap_fails_a_framed_wall_top(tmp_path):
    arr = np.asarray(noise_tile(62, 62)).copy(); arr[:2, :] = arr[-2:, :] = arr[:, :2] = arr[:, -2:] = (250, 240, 200)
    raw = _wrap_raw(tmp_path, Image.fromarray(arr, 'RGB'))
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process(reg, 'tile-f3-wall-top', raw, 'tile-wrap', workdir=tmp_path / 'w', wrap='xy', size=62)['tile-f3-wall-top']
    assert not q['pass'] and 'edge frame' in q['reasons']
    assert reg.get('tile-f3-wall-top')['status'] == 'qa_failed'


def test_process_tile_wrap_records_the_join_with_the_wall_top_above(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    A.process(reg, 'tile-f1-wall-top', _wrap_raw(tmp_path, noise_tile(62, 62), name='t.png'), 'tile-wrap', workdir=tmp_path / 'w', wrap='xy', size=62)
    q = A.process(reg, 'tile-f1-wall-face', _wrap_raw(tmp_path, noise_tile(62, 62, seed=2), name='f.png'), 'tile-wrap', workdir=tmp_path / 'w2', wrap='x', size=62)['tile-f1-wall-face']
    assert 'top_join' in q and q['top_join']['ratio'] >= 0


# --- portal dungeon batch: exact-size opaque fit, event tiles on a map-cell canvas, shared sheet scale ---

def test_fit_opaque_centre_crops_to_the_aspect_and_samples_exact_size():
    arr = np.zeros((100, 300, 3), np.uint8); arr[:, :50] = (255, 0, 0); arr[:, 250:] = (0, 0, 255); arr[:, 50:250] = (0, 200, 0)
    out = A.fit_opaque(Image.fromarray(arr, 'RGB'), 18, 11)
    assert out.size == (18, 11)
    o = np.asarray(out)
    # 300x100 cropped to 164x100 around the centre: the red and blue side bands are cut away
    assert (o == (0, 200, 0)).all()


def test_fit_opaque_keeps_only_source_colours():
    rng = np.random.default_rng(1); arr = rng.integers(0, 4, (90, 160, 1)) * np.array([[[60, 50, 40]]])
    img = Image.fromarray(arr.astype(np.uint8), 'RGB')
    src = {tuple(c) for c in np.asarray(img).reshape(-1, 3)}
    out = {tuple(c) for c in np.asarray(A.fit_opaque(img, 41, 23)).reshape(-1, 3)}
    assert out <= src


def test_finish_opaque_with_fit_records_exact_size(tmp_path):
    raw = tmp_path / 'r.png'; Image.new('RGB', (1536, 1024), (30, 60, 90)).save(raw)
    reg = A.Registry(tmp_path / 'r.json')
    q = A._finish(reg, 'portal-card-frost', Image.open(raw).convert('RGB'), 'opaque', tmp_path / 'w', raw, fit=(180, 110))
    assert q['pass'] and q['size'] == [180, 110]
    assert Image.open(tmp_path / 'w' / 'portal-card-frost.png').size == (180, 110)


def test_finish_sprite_on_canvas_centres_the_subject_in_a_map_cell(tmp_path):
    img = blob(200, 200, (60, 80, 140, 120))   # 80x40 px subject, block 2 -> 40x20 art px
    reg = A.Registry(tmp_path / 'r.json')
    q = A._finish(reg, 'tile-event-key', img, 'sprite', tmp_path / 'w', tmp_path / 'raw.png', block=2, canvas=62)
    out = np.asarray(Image.open(tmp_path / 'w' / 'tile-event-key.png'))
    assert q['pass'] and q['size'] == [62, 62] and out.shape[:2] == (62, 62)
    ys, xs = np.nonzero(out[..., 3])
    assert xs.max() - xs.min() + 1 == 40 and ys.max() - ys.min() + 1 == 20
    assert abs((xs.min() + xs.max()) / 2 - 30.5) <= 1 and abs((ys.min() + ys.max()) / 2 - 30.5) <= 1


def test_finish_sprite_on_canvas_fails_when_the_subject_does_not_fit(tmp_path):
    img = blob(400, 400, (20, 20, 380, 380))   # 360 px subject at block 4 -> 90 art px > 62
    reg = A.Registry(tmp_path / 'r.json')
    q = A._finish(reg, 'tile-event-vault', img, 'sprite', tmp_path / 'w', tmp_path / 'raw.png', block=4, canvas=62)
    assert not q['pass'] and 'larger than the canvas' in q['reasons']
    assert reg.get('tile-event-vault')['status'] == 'qa_failed'


def test_shared_block_scales_the_largest_subject_to_the_target_side():
    cells = [blob(300, 300, (50, 50, 250, 150)), blob(300, 300, (100, 100, 160, 160))]   # largest side 200 px
    assert A.shared_block(cells, 50) == 4
    assert A.shared_block([blob(100, 100, (40, 40, 45, 45))], 50) == 1


def test_finish_sprite_with_deblend_flag_repairs_dark_magenta_outline_blends(tmp_path):
    arr = np.asarray(blob(60, 60, (10, 10, 50, 50), (40, 120, 200))).copy()
    arr[10:50, 10] = (20, 15, 30)                # dark outline column
    arr[30, 10] = (101, 10, 109)                 # outline mixed with the magenta key
    img = Image.fromarray(arr, 'RGB')
    reg = A.Registry(tmp_path / 'r.json')
    A._finish(reg, 'icon-x', img, 'sprite', tmp_path / 'w', tmp_path / 'raw.png', block=1)
    plain = np.asarray(Image.open(tmp_path / 'w' / 'icon-x.png'))
    reg.set('icon-y', deblend=True)
    A._finish(reg, 'icon-y', img, 'sprite', tmp_path / 'w', tmp_path / 'raw.png', block=1)
    fixed = np.asarray(Image.open(tmp_path / 'w' / 'icon-y.png'))
    assert tuple(plain[21, 1, :3]) == (101, 10, 109)        # padded by one block: (30,10) -> (21,1) after bbox crop
    assert tuple(fixed[21, 1, :3]) == (20, 15, 30) and fixed[21, 1, 3] == 255


def test_neutralize_key_tint_recolours_purple_shadow_and_pink_glow_from_neighbours():
    rgba = np.zeros((10, 12, 4), np.uint8)
    rgba[2:8, 2:6] = (60, 55, 50, 255)           # dark grey-brown shadow
    rgba[4, 4] = (90, 30, 100, 255)              # shadow mixed with the key: purple
    rgba[2:8, 6:10] = (250, 200, 60, 255)        # gold glow
    rgba[5, 8] = (245, 150, 170, 255)            # glow mixed with the key: pink
    rgba[8, 2:4] = (95, 35, 110, 255)            # purple with no clean neighbour of its own kind nearby... but grey above
    out = np.asarray(A.neutralize_key_tint(Image.fromarray(rgba, 'RGBA')))
    assert tuple(out[4, 4]) == (60, 55, 50, 255)
    assert tuple(out[5, 8]) == (250, 200, 60, 255)
    assert not A._key_tint(out[..., :3])[out[..., 3] == 255].any()
    assert (out[..., 3] == rgba[..., 3]).all()                  # never changes alpha
    assert tuple(out[3, 3]) == (60, 55, 50, 255)                 # clean pixels untouched


def test_neutralize_key_tint_greys_an_isolated_purple_pixel():
    rgba = np.zeros((5, 5, 4), np.uint8); rgba[2, 2] = (90, 30, 100, 255)
    out = np.asarray(A.neutralize_key_tint(Image.fromarray(rgba, 'RGBA')))
    r, g, b, a = map(int, out[2, 2])
    assert a == 255 and r == g == b


def test_finish_sprite_with_neutralize_flag_applies_it(tmp_path):
    arr = np.asarray(blob(60, 60, (10, 10, 50, 50), (60, 55, 50))).copy(); arr[30, 30] = (90, 30, 100)
    reg = A.Registry(tmp_path / 'r.json'); reg.set('tile-event-x', neutralize_tint=True)
    A._finish(reg, 'tile-event-x', Image.fromarray(arr, 'RGB'), 'sprite', tmp_path / 'w', tmp_path / 'raw.png', block=1)
    out = np.asarray(Image.open(tmp_path / 'w' / 'tile-event-x.png'))
    assert not A._key_tint(out[..., :3])[out[..., 3] == 255].any()


def test_neutralize_key_tint_keeps_crimson_and_red_gems():
    rgba = np.zeros((5, 5, 4), np.uint8); rgba[1:4, 1:4] = (200, 20, 40, 255); rgba[2, 2] = (200, 30, 60, 255)
    out = np.asarray(A.neutralize_key_tint(Image.fromarray(rgba, 'RGBA')))
    assert (out == rgba).all()


# --- hero / rin batch (party.py): full id set, identity dependency chain, runtime paths, bust edge allowance ---
def test_party_jobs_cover_spec_set_and_chain():
    import party
    jobs = {j['id']: j for j in party.jobs()}
    moods = ['hit', 'attack', 'dying', 'down', 'ultimate', 'smile', 'sad']
    for cid in ('hero', 'rin', 'rin-oath'):
        ids = [f'char-{cid}-standee', f'char-{cid}-portrait'] + [f'char-{cid}-portrait-{m}' for m in moods]
        assert all(i in jobs for i in ids)
    assert len(jobs) == 27
    assert jobs['char-hero-portrait']['deps'] == ['char-hero-standee']
    assert jobs['char-rin-portrait-sad']['deps'] == ['char-rin-portrait', 'char-rin-standee']
    assert jobs['char-rin-oath-portrait-down']['deps'] == ['char-rin-portrait-down']
    assert jobs['char-hero-standee']['deps'] == []
    assert party.runtime('char-rin-oath-portrait-smile') == '/assets/games/starlantern/char/rin-oath-portrait-smile.png'
    for j in jobs.values():
        assert '#FF00FF' in j['prompt'] and 'text' in j['prompt']


def test_party_portrait_allows_bottom_edge_only(tmp_path):
    import party
    raw = tmp_path / 'raw.png'
    img = Image.new('RGB', (400, 400), (255, 0, 255))
    img.paste((40, 60, 120), (100, 80, 300, 400))  # bust cut by the bottom edge
    img.save(raw)
    job = next(j for j in party.jobs() if j['id'] == 'char-hero-portrait')
    q = party.process_attempt(A.Registry(tmp_path / 'r.json'), job, raw, tmp_path / 'w')['char-hero-portrait']
    assert q['pass'], q
    job = next(j for j in party.jobs() if j['id'] == 'char-hero-standee')
    q = party.process_attempt(A.Registry(tmp_path / 'r2.json'), job, raw, tmp_path / 'w2')['char-hero-standee']
    assert 'subject cut by the canvas edge' in q['reasons']


def test_party_recover_replaces_wrong_fallback_with_codex_own_copy(tmp_path):
    import party, time, codex_still as C
    start = time.time()
    wrong = Image.new('RGB', (64, 64), (255, 0, 255)); wrong.paste((10, 200, 10), (20, 20, 40, 40)); wrong.save(tmp_path / 'x-a2.png')
    real = Image.new('RGB', (64, 64), (255, 0, 255)); real.paste((200, 10, 10), (20, 20, 40, 40)); real.save(tmp_path / 'x-20261017-single.png')
    (tmp_path / 'x-a1.png').write_bytes((tmp_path / 'x-a2.png').read_bytes())  # older attempts never count as strays
    (tmp_path / 'x-a2.gen.json').write_text('{"output_sha256": "old"}', encoding='utf-8')
    assert party.recover(tmp_path, 'x-a2.png', start) == 'x-20261017-single.png'
    assert C._sha(tmp_path / 'x-a2.png') == C._sha(tmp_path / 'x-20261017-single.png')
    rec = json.loads((tmp_path / 'x-a2.gen.json').read_text(encoding='utf-8'))
    assert rec['output_recovered_from'] == 'x-20261017-single.png' and rec['output_sha256'] != 'old'
    assert party.recover(tmp_path, 'x-a2.png', start) is None  # already identical: nothing to do


def test_party_recover_ignores_strays_outside_the_attempt_window(tmp_path):
    import party, time, os
    a1 = Image.new('RGB', (64, 64), (255, 0, 255)); a1.paste((10, 200, 10), (20, 20, 40, 40)); a1.save(tmp_path / 'x-a1.png')
    (tmp_path / 'x-a1.gen.json').write_text('{}', encoding='utf-8')
    later = Image.new('RGB', (64, 64), (255, 0, 255)); later.paste((200, 10, 10), (20, 20, 40, 40)); later.save(tmp_path / 'x-single.png')
    now = time.time(); os.utime(tmp_path / 'x-single.png', (now, now))
    # a1 ran and finished well before the stray appeared (the stray belongs to a later attempt)
    assert party.recover(tmp_path, 'x-a1.png', now - 600, now - 300) is None
    # a stray already copied into another attempt is never reused
    (tmp_path / 'x-a2.png').write_bytes((tmp_path / 'x-single.png').read_bytes())
    assert party.recover(tmp_path, 'x-a1.png', now - 600, now + 10) is None


# --- plan 5d: gear cells (large + icon from one cell), nine-slice rarity frames, silhouettes, retiring old art ---
def test_fit_side_uses_the_longer_side():
    img = blob(100, 100, (30, 40, 70, 60))   # 40 x 20 px subject
    assert A.fit_side(img, 10) == 4
    assert A.fit_side(img, 40) == 1


def _gear_cell(box=(80, 100, 320, 300)):
    arr = np.asarray(blob(400, 400, box, (40, 120, 200))).copy()
    x0, y0, x1, y1 = box; arr[y0:y0 + 40, x0:x1] = (200, 180, 60)   # a second colour band
    return Image.fromarray(arr, 'RGB')


def test_gear_cell_makes_a_large_and_an_icon_from_the_same_cell(tmp_path):
    reg = A.Registry(tmp_path / 'r.json'); raw = tmp_path / 'sheet-gear-1-a1.png'
    out = A.process_gear_cell(reg, 'iron-sword', _gear_cell(), tmp_path / 'w', raw)
    assert set(out) == {'gear-iron-sword-large', 'gear-iron-sword'}
    large, icon = reg.get('gear-iron-sword-large'), reg.get('gear-iron-sword')
    assert out['gear-iron-sword-large']['size'] == [64, 64] and out['gear-iron-sword']['size'] == [26, 26]
    assert Image.open(tmp_path / 'w' / 'gear-iron-sword-large.png').size == (64, 64)
    assert Image.open(tmp_path / 'w' / 'gear-iron-sword.png').size == (26, 26)
    assert large['source'] == icon['source'] == {'raw': str(raw), 'cell': 'iron-sword'}
    assert large['status'] == icon['status'] == 'qa_passed'
    assert 'runtime' not in large and 'runtime' not in icon


def test_gear_cell_fails_both_when_the_subject_is_cut_by_the_canvas(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    out = A.process_gear_cell(reg, 'iron-sword', _gear_cell((0, 100, 240, 300)), tmp_path / 'w', tmp_path / 'raw.png')
    for aid in ('gear-iron-sword-large', 'gear-iron-sword'):
        assert 'subject cut by the canvas edge' in out[aid]['reasons'] and reg.get(aid)['status'] == 'qa_failed'


def _ring(fill_centre=False, gap=False, colour=(180, 140, 60)):
    """A 160 x 160 frame with a 20 px border, on a magenta cell with an 8 px margin (as portal.sheet_cells pads)."""
    arr = np.asarray(canvas(176, 176)).copy(); r = arr[8:168, 8:168]
    r[:20, :] = colour; r[-20:, :] = colour; r[:, :20] = colour; r[:, -20:] = colour
    if fill_centre: r[60:100, 60:100] = colour
    if gap: r[:20, 60:100] = M
    return Image.fromarray(arr, 'RGB')


def test_nine_slice_passes_a_clean_ring_and_samples_exact_size(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    q = A.nine_slice(reg, 'ui-rarity-magic', _ring(), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert q['size'] == [16, 16] and q['center_clear'] and q['ring_closed'] and q['pass'], q
    assert all(v <= A.SEAM_RATIO_MAX for v in q['edge_repeat'].values())
    assert Image.open(tmp_path / 'w' / 'ui-rarity-magic.png').size == (16, 16)
    e = reg.get('ui-rarity-magic')
    assert e['status'] == 'qa_passed' and e['kind'] == 'nine-slice' and e['slice'] == 5 and 'runtime' not in e


def test_nine_slice_fails_a_filled_centre(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-rare', _ring(fill_centre=True), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert not q['pass'] and not q['center_clear'] and 'centre not clear' in q['reasons']


def test_nine_slice_fails_a_broken_ring(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-set', _ring(gap=True), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert not q['pass'] and not q['ring_closed'] and 'ring not closed' in q['reasons']


def test_nine_slice_fails_an_edge_that_does_not_repeat(tmp_path):
    arr = np.asarray(_ring()).copy()
    arr[8:28, 88:148] = (60, 90, 220)     # the right half of the top edge changes colour: repeated, it shows a joint
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-unique', Image.fromarray(arr, 'RGB'), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert not q['pass'] and 'edge does not repeat' in q['reasons']
    assert q['edge_repeat']['top'] > A.SEAM_RATIO_MAX


# --- magenta spill: dark or pink key blends left on the outline (plan 5d style-sample review) ---
def test_magenta_spill_counts_pixels_whose_red_and_blue_stand_well_above_green():
    rgba = np.zeros((4, 6, 4), np.uint8); rgba[..., 3] = 255
    rgba[0, :] = [(137, 52, 136, 255), (48, 4, 56, 255), (250, 42, 136, 255), (65, 3, 93, 255), (20, 15, 25, 255), (200, 20, 40, 255)]
    rgba[1, :] = [(90, 40, 140, 255), (60, 120, 200, 255), (255, 255, 255, 255), (30, 30, 30, 255), (140, 60, 140, 255), (0, 0, 0, 0)]
    m = A.magenta_spill(np.asarray(rgba))
    assert m[0].tolist() == [True, True, True, True, False, False]       # key blends with grey, black, red and dark violet
    assert m[1].tolist() == [False, False, False, False, True, False]    # a real violet (hue 270), blue, white, grey stay out
    assert A.magenta_spill_count(Image.fromarray(rgba, 'RGBA')) == 5


def test_despill_pulls_the_key_out_of_outline_pixels_and_leaves_the_inside_alone():
    rgba = np.zeros((20, 20, 4), np.uint8); rgba[3:17, 3:17] = (20, 15, 25, 255)
    rgba[3, 5] = (48, 4, 56, 255); rgba[3, 8] = (250, 42, 136, 255); rgba[16, 9] = (137, 52, 136, 255)   # outline spill
    rgba[4, 12] = (90, 40, 140, 255)                    # a real violet next to the edge: kept
    rgba[10, 10] = (140, 60, 140, 255)                  # magenta inside the subject, far from the edge: kept
    out = np.asarray(A.despill(Image.fromarray(rgba, 'RGBA')))
    assert tuple(out[3, 5]) == (4, 4, 12, 255) and tuple(out[3, 8]) == (156, 42, 42, 255) and tuple(out[16, 9]) == (53, 52, 52, 255)
    assert tuple(out[4, 12]) == (90, 40, 140, 255) and tuple(out[10, 10]) == (140, 60, 140, 255)
    assert (out[..., 3] == rgba[..., 3]).all()
    assert A.magenta_spill(out).sum() == 1                              # only the deliberate inside pixel is still spill-coloured ...
    assert A.magenta_spill_count(Image.fromarray(out, 'RGBA')) == 0      # ... and the gate counts the outline band only (ruling, G2)


def _spilled_cell(inside=False):
    """A subject whose outline was anti-aliased into the magenta key (dark and pink blends survive cutout)."""
    arr = np.asarray(blob(400, 400, (80, 100, 320, 300), (40, 120, 200))).copy()
    arr[100:300, 80:84] = (120, 30, 125); arr[100:104, 80:320] = (110, 20, 120); arr[296:300, 80:320] = (250, 42, 136)   # 1 art px at block 4
    if inside: arr[180:220, 180:220] = (140, 60, 140)
    return Image.fromarray(arr, 'RGB')


def test_gear_cell_despills_its_outline_and_reports_zero_spill(tmp_path):
    out = A.process_gear_cell(A.Registry(tmp_path / 'r.json'), 'iron-sword', _spilled_cell(), tmp_path / 'w', tmp_path / 'raw.png')
    for aid, q in out.items():
        img = Image.open(tmp_path / 'w' / f'{aid}.png')
        assert q['magenta_spill'] == 0 and A.magenta_spill_count(img) == 0 and q['pass'], (aid, q)


def test_gear_cell_keeps_violet_shading_inside_the_subject_as_art(tmp_path):
    # Controller ruling 2026-10-20 (G2): spill is key colour mixed into the outline; interior grey-violet shading is art
    # (it is far from the key, so the residue gate does not take it either).
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process_gear_cell(reg, 'iron-sword', _spilled_cell(inside=True), tmp_path / 'w', tmp_path / 'raw.png')['gear-iron-sword-large']
    assert q['pass'] and q['magenta_spill'] == 0, q


def test_finish_without_despill_keeps_its_old_behaviour(tmp_path):
    q = A._finish(A.Registry(tmp_path / 'r.json'), 'enemy-x', _spilled_cell(), 'sprite', tmp_path / 'w', tmp_path / 'raw.png', block=4)
    assert 'magenta_spill' not in q and A.magenta_spill_count(Image.open(tmp_path / 'w' / 'enemy-x.png')) > 0


def test_nine_slice_despills_its_ring(tmp_path):
    arr = np.asarray(_ring()).copy(); arr[8:12, 8:168] = (110, 20, 120)        # the outer row blended into the key
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-rare', Image.fromarray(arr, 'RGB'), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert q['magenta_spill'] == 0 and A.magenta_spill_count(Image.open(tmp_path / 'w' / 'ui-rarity-rare.png')) == 0


A3_GEAR = Path('C:/Users/bag57/art-refs/starlantern/raw/sheet-gear-1/sheet-gear-1-a3.png')


@pytest.mark.skipif(not A3_GEAR.exists(), reason='the plan 5d sample sheet lives outside the repo')
def test_real_sample_iron_sword_cell_had_spill_and_now_has_none(tmp_path):
    import portal as P
    cell = P.sheet_cells(Image.open(A3_GEAR).convert('RGB'), 3, 3)[0]
    A._finish(A.Registry(tmp_path / 'old.json'), 'x', cell, 'sprite', tmp_path / 'old', A3_GEAR, block=A.fit_side(cell, 60), canvas=64)
    assert A.magenta_spill_count(Image.open(tmp_path / 'old' / 'x.png')) > 0                  # what the review found
    out = A.process_gear_cell(A.Registry(tmp_path / 'r.json'), 'iron-sword', cell, tmp_path / 'w', A3_GEAR)
    for aid, q in out.items():
        assert q['magenta_spill'] == 0 and A.magenta_spill_count(Image.open(tmp_path / 'w' / f'{aid}.png')) == 0, aid


def _jittered_ring(seed=0, jump=None):
    """A frame whose 2 art-px bar is one colour plus codec jitter of +-3 per art pixel (what codex frames look like after
    sampling). jump=(x0, x1, colour): a block of another colour on the top bar, so the repeated edge shows a joint.
    (Addendum 2: the bar is 2 art px, the thinnest band the frame gate accepts; it was 1 art px before.)"""
    rng = np.random.default_rng(seed); arr = np.asarray(canvas(176, 176)).copy(); r = arr[8:168, 8:168]
    jitter = lambda: np.clip(np.array((70, 110, 170)) + rng.integers(-3, 4, 3), 0, 255)
    for i in range(16):                      # 16 art px of 10 raw px each; the bar is the outer two art pixels
        for k in (0, 1):
            a, b = k * 10, (k + 1) * 10; ia, ib = 160 - b, 160 - a
            for sl in (np.s_[a:b, i * 10:(i + 1) * 10], np.s_[ia:ib, i * 10:(i + 1) * 10], np.s_[i * 10:(i + 1) * 10, a:b], np.s_[i * 10:(i + 1) * 10, ia:ib]):
                r[sl] = jitter()
    if jump: r[:20, jump[0]:jump[1]] = jump[2]
    return Image.fromarray(arr, 'RGB')


@pytest.mark.parametrize('seed', range(8))
def test_nine_slice_passes_a_uniform_bar_with_codec_jitter(tmp_path, seed):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', _jittered_ring(seed), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert 'edge does not repeat' not in q['reasons'] and q['pass'], (q['edge_repeat'], q['edge_steps'])


def test_nine_slice_still_fails_a_real_colour_jump_at_the_joint_of_a_jittered_bar(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', _jittered_ring(jump=(80, 110, (230, 200, 40))), tmp_path / 'w',
                     tmp_path / 'raw.png', 16, 5)
    assert 'edge does not repeat' in q['reasons'] and q['edge_repeat']['top'] > A.SEAM_RATIO_MAX, q['edge_steps']


A3_FRAMES = Path('C:/Users/bag57/art-refs/starlantern/raw/sheet-rarity-frames/sheet-rarity-frames-a3.png')


@pytest.mark.skipif(not A3_FRAMES.exists(), reason='the plan 5d a3 frame sheet lives outside the repo')
def test_real_a3_frames_the_user_saw_fail_the_two_pixel_band_gate(tmp_path):
    """Addendum 2: the G1 a3 frames have a 1 art-px band (what the user found too thin); the band gate catches all five."""
    import portal as P
    cells = P.sheet_cells(Image.open(A3_FRAMES).convert('RGB'), 3, 2)
    for cell, aid in zip(cells, ['ui-rarity-magic', 'ui-rarity-rare', 'ui-rarity-legendary', 'ui-rarity-unique', 'ui-rarity-set']):
        reg = A.Registry(tmp_path / f'{aid}.json'); reg.set(aid, defringe='strong')
        q = A.nine_slice(reg, aid, cell, tmp_path / 'w', A3_FRAMES, 16, 5)
        assert 'band thinner than 2 px' in q['reasons'] and q['stroke'][0] == 1, (aid, q['stroke'])


def _thick_ring(hole=False, colour=(180, 140, 60)):
    """160 px frame with a 54 px border: sampled to 12 x 12 it is a 4 art-px ring around a 4 x 4 (16 px) centre."""
    arr = np.asarray(canvas(176, 176)).copy(); r = arr[8:168, 8:168]
    r[:54, :] = colour; r[-54:, :] = colour; r[:, :54] = colour; r[:, -54:] = colour
    if hole: r[16:26, 80:94] = M          # one art pixel erased inside the top band (art row 1, column 6)
    return Image.fromarray(arr, 'RGB')


def test_nine_slice_does_not_count_its_transparent_centre_as_a_hole(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-rare', _thick_ring(), tmp_path / 'w', tmp_path / 'raw.png', 12, 4)
    assert q['center_clear'] and q['holes'] == 0 and q['warnings'] == [], q
    assert q['reasons'] == ['band reaches into the icon'], q     # addendum 2: a 4 art-px band is now too deep


def test_nine_slice_still_flags_a_hole_in_the_ring(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-rare', _thick_ring(hole=True), tmp_path / 'w', tmp_path / 'raw.png', 12, 4)
    assert q['holes'] >= 1 and q['warnings'] == ['enclosed holes'], q


INK, RIM = (29, 26, 46), (143, 134, 184)


def _approved_icon(tmp_path, status='approved'):
    rgba = np.zeros((26, 26, 4), np.uint8)
    rgba[4:22, 8:18] = (200, 40, 40, 255); rgba[6:10, 10:14] = (250, 220, 90, 255); rgba[12, 12, 3] = 0   # a hole inside
    final = tmp_path / 'gear-blaze-heart-sword.png'; Image.fromarray(rgba, 'RGBA').save(final)
    reg = A.Registry(tmp_path / 'r.json'); reg.set('gear-blaze-heart-sword', status=status, final=str(final))
    return reg, rgba


def test_silhouette_uses_only_ink_and_rim_and_grows_one_pixel(tmp_path):
    reg, src = _approved_icon(tmp_path)
    q = A.silhouette(reg, 'blaze-heart-sword', tmp_path / 'w')
    out = np.asarray(Image.open(tmp_path / 'w' / 'gear-blaze-heart-sword-silhouette.png').convert('RGBA'))
    assert out.shape[:2] == (28, 28) and q['size'] == [28, 28] and q['pass'], q
    op = out[..., 3] == 255
    assert {tuple(int(v) for v in c) for c in out[op][:, :3]} == {INK, RIM}
    assert set(np.unique(out[..., 3]).tolist()) <= {0, 255}
    ys, xs = np.nonzero(src[..., 3] == 255)
    assert all(tuple(int(v) for v in out[y + 1, x + 1, :3]) == INK for y, x in zip(ys, xs))
    assert op.sum() >= (src[..., 3] == 255).sum()
    e = reg.get('gear-blaze-heart-sword-silhouette')
    assert e['kind'] == 'silhouette' and e['status'] == 'qa_passed' and e['source'] == {'from': 'gear-blaze-heart-sword'}
    assert 'runtime' not in e


def test_silhouette_can_name_a_set_after_its_first_piece(tmp_path):
    reg, _ = _approved_icon(tmp_path, status='published')
    A.silhouette(reg, 'blaze-heart-sword', tmp_path / 'w', out='set-blaze')
    assert (tmp_path / 'w' / 'gear-set-blaze-silhouette.png').exists()
    assert reg.get('gear-set-blaze-silhouette')['source'] == {'from': 'gear-blaze-heart-sword'}


def test_silhouette_refuses_unapproved_art(tmp_path):
    reg, _ = _approved_icon(tmp_path, status='qa_passed')
    with pytest.raises(PermissionError):
        A.silhouette(reg, 'blaze-heart-sword', tmp_path / 'w')
    assert not (tmp_path / 'w' / 'gear-blaze-heart-sword-silhouette.png').exists()


def _tracked_public(tmp_path, rel='assets/games/starlantern/icon/iron-sword.png', track=True):
    import subprocess
    public = tmp_path / 'public'; f = public / rel; f.parent.mkdir(parents=True)
    Image.new('RGBA', (4, 4), (1, 2, 3, 255)).save(f)
    subprocess.run(['git', 'init', '-q'], cwd=public, check=True)
    if track: subprocess.run(['git', 'add', rel], cwd=public, check=True)
    return public, f


def test_retire_removes_the_runtime_file_and_url_but_keeps_history(tmp_path):
    public, f = _tracked_public(tmp_path)
    reg = A.Registry(tmp_path / 'r.json'); url = '/assets/games/starlantern/icon/iron-sword.png'
    reg.set('icon-iron-sword', status='published', runtime=url, final='work/x.png', approved_by='user 2026-10-15')
    reg.set('enemy-slime', status='published', runtime='/assets/games/starlantern/enemy/slime.png')
    reg.write_manifest(public)
    reg.retire('icon-iron-sword', public, 'replaced by gear-iron-sword (plan 5d)')
    assert not f.exists()
    e = A.Registry(tmp_path / 'r.json').get('icon-iron-sword')
    assert 'runtime' not in e and e['retired_runtime'] == url and e['status'] == 'retired'
    assert e['retired_reason'] == 'replaced by gear-iron-sword (plan 5d)'
    assert e['final'] == 'work/x.png' and e['approved_by'] == 'user 2026-10-15'      # history kept
    manifest = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))
    assert manifest['urls'] == ['/assets/games/starlantern/enemy/slime.png']


def test_retire_refuses_a_file_git_does_not_track(tmp_path):
    public, f = _tracked_public(tmp_path, track=False)
    reg = A.Registry(tmp_path / 'r.json')
    reg.set('icon-iron-sword', status='published', runtime='/assets/games/starlantern/icon/iron-sword.png')
    with pytest.raises(PermissionError):
        reg.retire('icon-iron-sword', public, 'x')
    assert f.exists() and reg.get('icon-iron-sword')['status'] == 'published'


def test_retire_refuses_a_path_outside_the_starlantern_assets(tmp_path):
    public, f = _tracked_public(tmp_path, rel='assets/games/other/x.png')
    reg = A.Registry(tmp_path / 'r.json')
    reg.set('icon-x', status='published', runtime='/assets/games/starlantern/../other/x.png')
    with pytest.raises(PermissionError):
        reg.retire('icon-x', public, 'x')
    assert f.exists()


def test_retire_cli_calls_the_registry(monkeypatch, tmp_path):
    # Review minor (b): the CLI runs on a temp ROOT, never on the real registry.json or public/.
    root = tmp_path / 'af' / 'sl'; root.mkdir(parents=True); monkeypatch.setattr(A, 'ROOT', root)
    calls = []
    monkeypatch.setattr(A.Registry, 'retire', lambda self, aid, public, reason: calls.append((aid, reason, self.path, public)))
    assert A.main(['retire', '--id', 'icon-iron-sword', '--reason', 'replaced']) == 0
    (aid, reason, reg_path, public), = calls
    assert (aid, reason) == ('icon-iron-sword', 'replaced')
    assert Path(reg_path).is_relative_to(tmp_path) and Path(public).is_relative_to(tmp_path)


# --- plan 5d addendum 2, Task A: one long edge for every gear subject, size gate (short edge, mass, centre) ---
OUTLINE, FILL = (30, 25, 40), (40, 120, 200)


def _shape_cell(w, h, shape='rect', cell=400, width=12):
    """A solid subject with a dark 6 px outline, centred on a magenta cell (what a codex gear cell looks like)."""
    from PIL import ImageDraw
    img = canvas(cell, cell); d = ImageDraw.Draw(img)
    x0, y0 = (cell - w) // 2, (cell - h) // 2; x1, y1 = x0 + w - 1, y0 + h - 1
    if shape == 'rect':
        d.rectangle((x0, y0, x1, y1), fill=OUTLINE); d.rectangle((x0 + 6, y0 + 6, x1 - 6, y1 - 6), fill=FILL)
    elif shape == 'ellipse':
        d.ellipse((x0, y0, x1, y1), fill=OUTLINE); d.ellipse((x0 + 6, y0 + 6, x1 - 6, y1 - 6), fill=FILL)
    else:   # a diagonal blade of length w, hilt lower left, tip upper right
        k = round(w / 2 ** 0.5); c = cell // 2
        d.line((c - k // 2, c + k // 2, c + k // 2, c - k // 2), fill=OUTLINE, width=width)
        d.line((c - k // 2, c + k // 2, c + k // 2, c - k // 2), fill=FILL, width=max(1, width - 6))
    return img


def test_normalize_subject_sets_the_long_edge_exactly():
    img, scale = A.normalize_subject(A.cutout(_shape_cell(300, 120)), 22)
    box = img.getbbox()
    assert (box[2] - box[0], box[3] - box[1]) == (22, 9)
    assert img.size == (24, 11)                                   # one transparent art pixel on every side
    assert scale == pytest.approx(300 / 22, rel=1e-3)
    assert set(np.unique(np.asarray(img)[..., 3])) <= {0, 255}


def test_normalize_subject_refuses_to_upsample():
    with pytest.raises(ValueError, match='cell too small to sample'):
        A.normalize_subject(A.cutout(_shape_cell(40, 30)), 56)


@pytest.mark.parametrize('long', [180, 330])
def test_gear_cell_icon_and_large_hit_their_targets_for_any_raw_size(tmp_path, long):
    out = A.process_gear_cell(A.Registry(tmp_path / 'r.json'), 'x', _shape_cell(long, round(long * 0.9), 'ellipse'), tmp_path / 'w',
                              tmp_path / 'raw.png', slot='body')
    icon, large = out['gear-x'], out['gear-x-large']
    assert icon['subject']['long'] == 22 and large['subject']['long'] == 56, (icon['subject'], large['subject'])
    assert icon['subject']['centre_off'] <= 1 and large['subject']['centre_off'] <= 1
    assert icon['size'] == [26, 26] and large['size'] == [64, 64]
    assert icon['scale'] == pytest.approx(long / 22, rel=1e-2) and large['scale'] == pytest.approx(long / 56, rel=1e-2)


def test_subject_gate_fails_a_sliver_shield(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    out = A.process_gear_cell(reg, 'shield', _shape_cell(300, 150), tmp_path / 'w', tmp_path / 'raw.png', slot='offhand')
    q = out['gear-shield']
    assert q['subject']['short'] == 11 and 'subject too narrow' in q['reasons'] and not q['pass'], q
    assert reg.get('gear-shield')['status'] == 'qa_failed' and reg.get('gear-shield')['slot'] == 'offhand'
    saved = json.loads((tmp_path / 'w' / 'gear-shield.qa.json').read_text(encoding='utf-8'))
    assert 'subject too narrow' in saved['reasons'] and saved['subject'] == q['subject']


def test_subject_gate_fails_a_thin_weapon_below_the_mass_floor(tmp_path):
    out = A.process_gear_cell(A.Registry(tmp_path / 'r.json'), 'sword', _shape_cell(300, 0, 'line', width=12), tmp_path / 'w',
                              tmp_path / 'raw.png', slot='weapon')
    for q in out.values():
        assert 'subject too light' in q['reasons'] and q['subject']['mass'] < A.MASS_BAND['long'][0] and not q['pass'], q


def test_subject_gate_fails_too_heavy(tmp_path):
    out = A.process_gear_cell(A.Registry(tmp_path / 'r.json'), 'sword', _shape_cell(300, 300), tmp_path / 'w', tmp_path / 'raw.png',
                              slot='weapon')
    assert all('subject too heavy' in q['reasons'] and not q['pass'] for q in out.values()), out


def test_subject_gate_passes_a_chunky_breastplate(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    out = A.process_gear_cell(reg, 'plate', _shape_cell(300, 280, 'ellipse'), tmp_path / 'w', tmp_path / 'raw.png', slot='body')
    for aid, q in out.items():
        assert q['pass'] and q['reasons'] == [], (aid, q)
        assert set(q['subject']) == {'long', 'short', 'mass', 'box', 'centre_off'}
        assert reg.get(aid)['status'] == 'qa_passed'


def test_gear_cell_without_slot_checks_only_the_long_edge(tmp_path):
    out = A.process_gear_cell(A.Registry(tmp_path / 'r.json'), 'x', _shape_cell(300, 150), tmp_path / 'w', tmp_path / 'raw.png')
    assert all(q['pass'] and q['subject']['long'] in (22, 56) for q in out.values()), out


def test_normalize_never_upsamples(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    out = A.process_gear_cell(reg, 'x', _shape_cell(40, 36), tmp_path / 'w', tmp_path / 'raw.png', slot='body')
    assert 'cell too small to sample' in out['gear-x-large']['reasons'] and not out['gear-x-large']['pass']
    assert reg.get('gear-x-large')['status'] == 'qa_failed'
    assert 'cell too small to sample' not in out['gear-x']['reasons']       # 40 / 22 >= 1: the icon is a real downsample


def test_subject_gate_thresholds_follow_the_addendum():
    assert A.SUBJECT_CLASS == {'weapon': 'long', 'offhand': 'broad', 'head': 'broad', 'body': 'broad', 'hands': 'broad',
                               'feet': 'broad', 'neck': 'small', 'ring': 'small'}
    assert A.MASS_BAND == {'long': (0.28, 0.65), 'thin': (0.20, 0.65), 'broad': (0.50, 0.92), 'small': (0.35, 0.80)} and A.CENTRE_TOL == 1
    floors = {s: A.short_floor(s, 22) for s in A.MIN_SHORT}
    assert floors == {'weapon': 16, 'offhand': 17, 'head': 15, 'body': 18, 'hands': 16, 'feet': 16, 'neck': 14, 'ring': 14}


def test_subject_gate_without_slot_checks_long_edge_and_centre_only():
    m = {'long': 20, 'short': 3, 'mass': 0.05, 'box': [3, 3, 23, 6], 'centre_off': 1.5}
    assert A.subject_gate(m, 22, None) == ['subject long edge off target', 'subject off centre']
    assert A.subject_gate({**m, 'long': 21, 'centre_off': 0.5}, 22, None) == []
    assert set(A.subject_gate({**m, 'long': 22, 'centre_off': 0}, 22, 'ring')) == {'subject too narrow', 'subject too light'}


# --- plan 5d addendum 2, Task B: coverage sampling keeps a 2 px band; band, hue and distinctness gates; inner glow; starlit ---
MAGIC_BLUE, LEMON, ORANGE_GLOW = (63, 127, 255), (255, 224, 58), (255, 200, 120)


def _band_frame(band, colour=MAGIC_BLUE, box=160, margin=8):
    """A square frame `box` px wide whose border band is `band` px thick, on a magenta cell with a margin."""
    arr = np.asarray(canvas(box + 2 * margin, box + 2 * margin)).copy(); r = arr[margin:margin + box, margin:margin + box]
    r[:band, :] = colour; r[-band:, :] = colour; r[:, :band] = colour; r[:, -band:] = colour
    return Image.fromarray(arr, 'RGB')


def _alpha(path):
    return np.asarray(Image.open(path).convert('RGBA'))[..., 3] == 255


def test_cover_sample_keeps_majority_colour_and_drops_thin_coverage():
    arr = np.zeros((20, 20, 4), np.uint8)
    arr[:10, :10] = (200, 10, 10, 255); arr[:3, :10] = (10, 200, 10, 255)       # block 0,0: 70 red, 30 green -> red
    arr[:10, 10:13] = (10, 10, 200, 255)                                        # block 0,1: 30 % opaque -> transparent
    arr[10:20, 10:20] = (10, 10, 200, 255); arr[10:20, 0:4] = (90, 90, 90, 255) # 1,1 opaque blue; 1,0: 40 % grey -> opaque
    out = np.asarray(A.cover_sample(Image.fromarray(arr, 'RGBA'), 2, 2))
    assert tuple(out[0, 0]) == (200, 10, 10, 255) and out[0, 1, 3] == 0
    assert tuple(out[1, 0]) == (90, 90, 90, 255) and tuple(out[1, 1]) == (10, 10, 200, 255)


def test_cover_sample_keeps_a_two_pixel_band(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', _band_frame(17), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    op = _alpha(tmp_path / 'w' / 'ui-rarity-magic.png')
    assert op[:5, 5:11].sum(axis=0).tolist() == [2] * 6 and op[:2, 5:11].all()
    assert q['stroke'] == [2, 2] and q['pass'], q


def test_frame_gate_fails_a_one_pixel_band(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', _band_frame(8), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert q['stroke'][0] == 1 and 'band thinner than 2 px' in q['reasons'] and not q['pass'], q


def test_frame_gate_fails_a_band_reaching_into_the_icon(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', _band_frame(45), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert q['reach']['edge'] > A.EDGE_REACH_MAX and 'band reaches into the icon' in q['reasons'] and not q['pass'], q


def test_frame_gate_fails_an_ornament_reaching_past_the_corner_square(tmp_path):
    arr = np.asarray(_band_frame(20)).copy(); arr[8 + 40:8 + 50, 8 + 40:8 + 50] = MAGIC_BLUE   # art pixel (4, 4): depth 5
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', Image.fromarray(arr, 'RGB'), tmp_path / 'w', tmp_path / 'raw.png', 16, 5)
    assert q['reach']['corner'] == 5 and 'band reaches into the icon' in q['reasons'], q


def test_frame_gate_checks_the_tier_hue(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'a.json'), 'ui-rarity-legendary', _band_frame(20, LEMON), tmp_path / 'w', tmp_path / 'raw.png',
                     16, 5, hue=26)
    assert 'hue off tier' in q['reasons'] and not q['pass'], q
    q = A.nine_slice(A.Registry(tmp_path / 'b.json'), 'ui-rarity-rare', _band_frame(20, LEMON), tmp_path / 'w', tmp_path / 'raw.png',
                     16, 5, hue=51)
    assert q['pass'] and abs(q['hue'] - 51) <= 1 and q['stroke_colour'] == list(LEMON), q


def test_frame_gate_fails_a_grey_band_for_a_coloured_tier(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', _band_frame(20, (150, 150, 165)), tmp_path / 'w',
                     tmp_path / 'raw.png', 16, 5, hue=220)
    assert 'hue off tier' in q['reasons'], q


def test_band_hue_wraps_around_red():
    rgb = np.array([[(216, 40, 58), (230, 30, 30), (200, 30, 60)]], np.uint8)     # 354, 0, 349 degrees
    assert A.band_hue(rgb) == pytest.approx(354, abs=6)


def test_frames_distinct_fails_two_close_tiers():
    out = A.frames_distinct({'ui-rarity-rare': (0xff, 0xd8, 0x4a), 'ui-rarity-legendary': (0xff, 0xe0, 0x3a)})
    assert any(r.startswith('too close to ui-rarity-legendary (ΔE ') for r in out['ui-rarity-rare'])
    assert any(r.startswith('too close to ui-rarity-rare (ΔE ') for r in out['ui-rarity-legendary'])
    assert not any(A.frames_distinct({'ui-rarity-magic': (0x3f, 0x7f, 0xff), 'ui-rarity-epic': (0x8a, 0x5c, 0xff)}).values())


def test_delta_e_matches_cie76():
    assert A.delta_e((255, 255, 255), (0, 0, 0)) == pytest.approx(100, abs=0.1)
    assert A.delta_e((0x3f, 0x7f, 0xff), (0x8a, 0x5c, 0xff)) == pytest.approx(32.9, abs=0.5)


def _glow(colour=ORANGE_GLOW):
    """A 12 art-px ring of soft orange light 1 art px wide (10 raw px per art px)."""
    return _band_frame(10, colour, box=120)


def test_inner_glow_is_padded_inside_the_slot(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-glow-legendary', _glow(), tmp_path / 'w', tmp_path / 'raw.png', 16, 5,
                     role='glow', pad=2)
    op = _alpha(tmp_path / 'w' / 'ui-glow-legendary.png')
    assert q['size'] == [16, 16] and not op[:2].any() and not op[:, :2].any() and op[2, 2:14].all()
    assert q['pass'] and q['ring_closed'], q


def test_glow_without_its_padding_sits_on_the_frame_band(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-glow-legendary', _glow(), tmp_path / 'w', tmp_path / 'raw.png', 16, 5,
                     role='glow', pad=0)
    assert 'glow outside its ring' in q['reasons'], q


def test_glow_must_be_warm_light(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-glow-legendary', _glow(MAGIC_BLUE), tmp_path / 'w', tmp_path / 'raw.png', 16, 5,
                     role='glow', pad=2)
    assert 'hue off tier' in q['reasons'], q


STAR_CORE, STAR_ARM = (232, 251, 255), (127, 230, 255)


def _starlit(colours=(STAR_CORE, STAR_ARM), solid=False, drop_corner=False, dots=True):
    """16 art px (10 raw px each): a 5 x 5 four-pointed star on every corner and (dots) one dot in each edge middle."""
    core, arm = colours; art = {}
    corners = [(2, 2), (2, 13), (13, 2), (13, 13)][:3 if drop_corner else 4]
    for cy, cx in corners:
        for d in (-2, -1, 1, 2): art[(cy + d, cx)] = arm; art[(cy, cx + d)] = arm
        art[(cy, cx)] = core
    for y, x in ((1, 8), (14, 7), (8, 1), (7, 14))[:4 if dots else 0]: art[(y, x)] = core
    if solid:
        for i in range(16):
            for k in (0, 1, 14, 15): art[(k, i)] = core; art[(i, k)] = core
    arr = np.asarray(canvas(176, 176)).copy()
    for (y, x), c in art.items(): arr[8 + y * 10:18 + y * 10, 8 + x * 10:18 + x * 10] = c
    return Image.fromarray(arr, 'RGB')


def test_starlit_overlay_needs_corners_and_light_edges_but_not_a_closed_ring(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    q = A.nine_slice(reg, 'ui-starlit', _starlit(), tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='overlay')
    assert q['pass'] and not q['ring_closed'], q
    q = A.nine_slice(reg, 'ui-starlit', _starlit(((255, 170, 60), (255, 122, 20))), tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='overlay')
    assert 'not starlight colours' in q['reasons'], q
    q = A.nine_slice(reg, 'ui-starlit', _starlit(solid=True), tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='overlay')
    assert 'overlay hides the frame' in q['reasons'], q


def test_starlit_overlay_needs_all_four_corner_stars(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-starlit', _starlit(drop_corner=True), tmp_path / 'w', tmp_path / 'raw.png',
                     16, 5, role='overlay')
    assert 'starlit corners missing' in q['reasons'], q


# --- addendum 2 fix round 1 -----------------------------------------------------------------------------------------------
OUTLINE_DARK = (22, 16, 30)


def _layered_frame(layers, box=160, margin=8):
    """A square frame whose border is `layers` from the outside in: [(raw px, rgb), ...] (10 raw px = 1 art px at 16)."""
    arr = np.asarray(canvas(box + 2 * margin, box + 2 * margin)).copy(); r = arr[margin:margin + box, margin:margin + box]
    d = 0
    for t, c in layers:
        r[d:d + t, d:box - d] = c; r[box - d - t:box - d, d:box - d] = c
        r[d:box - d, d:d + t] = c; r[d:box - d, box - d - t:box - d] = c
        d += t
    return Image.fromarray(arr, 'RGB')


def test_band_colour_ignores_a_gold_inner_line_on_a_crimson_band(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-unique', _layered_frame([(20, (216, 40, 58)), (10, (232, 186, 52))]),
                     tmp_path / 'w', tmp_path / 'raw.png', 16, 5, hue=354)
    assert abs((q['hue'] - 354 + 180) % 360 - 180) <= 3 and q['stroke_colour'] == [216, 40, 58], q
    assert 'hue off tier' not in q['reasons'] and q['pass'], q


def test_band_colour_ignores_a_dark_outer_outline(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', _layered_frame([(10, OUTLINE_DARK), (20, MAGIC_BLUE)]),
                     tmp_path / 'w', tmp_path / 'raw.png', 16, 5, hue=220)
    assert q['stroke_colour'] == list(MAGIC_BLUE) and abs(q['hue'] - 220) <= 1 and q['pass'], q


def test_band_colour_unreadable_when_the_band_is_mostly_grey_or_dark(tmp_path):
    for layers in ([(20, (150, 150, 165))], [(20, OUTLINE_DARK)]):
        q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-magic', _layered_frame(layers), tmp_path / 'w', tmp_path / 'raw.png',
                         16, 5, hue=220)
        assert 'band colour unreadable' in q['reasons'] and 'hue off tier' in q['reasons'], (layers, q)


def test_subject_bbox_ignores_stray_specks(tmp_path):
    arr = np.asarray(_shape_cell(300, 280, 'ellipse')).copy()
    arr[4:6, 4:6] = (40, 120, 200); arr[390:394, 395:396] = (30, 25, 40)        # a 2 x 2 and a 4 x 1 speck in the corners
    out = A.process_gear_cell(A.Registry(tmp_path / 'r.json'), 'plate', Image.fromarray(arr, 'RGB'), tmp_path / 'w', tmp_path / 'raw.png',
                              slot='body')
    for aid, target in (('gear-plate', 22), ('gear-plate-large', 56)):
        q = out[aid]
        assert q['subject']['long'] == target and q['subject']['centre_off'] <= 1 and q['pass'], (aid, q)
        assert q['scale'] == pytest.approx(300 / target, rel=1e-2)
    final = np.asarray(Image.open(tmp_path / 'w' / 'gear-plate.png')).copy()
    final[0, 0] = (255, 255, 255, 255)                                            # a speck on the final canvas
    assert A.subject_metrics(Image.fromarray(final, 'RGBA'), 22)['box'] == out['gear-plate']['subject']['box']


def test_speckless_box_keeps_everything_when_only_specks_exist():
    op = np.zeros((10, 10), bool); op[1, 1] = op[8, 8] = True
    assert A.speckless_box(op) == (1, 1, 9, 9)


def test_starlit_edge_repeat_judges_the_joint_not_the_seam_ratio(tmp_path):
    def star(dots):
        img = np.asarray(_starlit()).copy()
        for y, x in dots: img[8 + y * 10:18 + y * 10, 8 + x * 10:18 + x * 10] = STAR_CORE
        return Image.fromarray(img, 'RGB')
    reg = A.Registry(tmp_path / 'r.json')
    q = A.nine_slice(reg, 'ui-starlit', star([(0, 5)]), tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='overlay')
    assert 'edge does not repeat' not in q['reasons'] and q['pass'], q             # a dot on the first column of the top edge
    q = A.nine_slice(reg, 'ui-starlit', star([(0, 5), (0, 10)]), tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='overlay')
    assert 'edge does not repeat' in q['reasons'] and q['edge_joint']['top'] == 1, q   # first and last: a 2 px dash at the joint


# --- controller rulings after Task E (2026-10-20): polearm mass floor, stale QA, corner-only starlit -----------------------------
def test_thin_class_comes_from_the_weapon_kind():
    # Controller rulings 2026-10-20: polearms (spear) and, after G2, bows (a thin arc and a string) share the thin floor.
    assert A.THIN_WEAPON_KINDS == ('spear', 'bow') and not hasattr(A, 'POLEARM_KINDS')
    assert A.subject_class('weapon', 'spear') == 'thin' and A.subject_class('weapon', 'bow') == 'thin'
    assert A.subject_class('weapon', 'sword') == 'long' and A.subject_class('weapon', 'staff') == 'long'   # staves keep 0.28
    assert A.subject_class('weapon', None) == 'long' and A.subject_class('offhand', 'spear') == 'broad'
    m = {'long': 22, 'short': 20, 'mass': 0.22, 'box': [2, 2, 24, 22], 'centre_off': 0.0}
    assert A.subject_gate(m, 22, 'weapon', 'spear') == []
    assert A.subject_gate(m, 22, 'weapon', 'sword') == ['subject too light']
    assert A.subject_gate(m, 22, 'weapon') == ['subject too light']
    assert A.subject_gate({**m, 'mass': 0.19}, 22, 'weapon', 'spear') == ['subject too light']


def test_a_spear_at_022_passes_where_a_sword_at_022_still_fails(tmp_path):
    cell = _shape_cell(300, 0, 'line', width=44)                      # mass 0.20-0.23: above the thin floor, below 0.28
    spear = A.process_gear_cell(A.Registry(tmp_path / 'a.json'), 'p', cell, tmp_path / 'a', tmp_path / 'raw.png', slot='weapon', kind='spear')
    sword = A.process_gear_cell(A.Registry(tmp_path / 'b.json'), 'p', cell, tmp_path / 'b', tmp_path / 'raw.png', slot='weapon', kind='sword')
    for aid in spear:
        assert 0.20 <= spear[aid]['subject']['mass'] < 0.28, spear[aid]['subject']          # the shape really is in the gap
        assert spear[aid]['pass'], spear[aid]
        assert 'subject too light' in sword[aid]['reasons'] and not sword[aid]['pass'], sword[aid]
    reg = A.Registry(tmp_path / 'a.json')
    assert reg.get('gear-p')['weapon_kind'] == 'spear' and reg.get('gear-p')['slot'] == 'weapon'


def test_qa_records_its_spec_and_records_from_an_older_spec_are_stale(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    out = A.process_gear_cell(reg, 'plate', _shape_cell(300, 280, 'ellipse'), tmp_path / 'w', tmp_path / 'raw.png', slot='body')
    assert all(q['spec'] == A.qa_spec('gear-cell') for q in out.values())
    assert json.loads((tmp_path / 'w' / 'gear-plate.qa.json').read_text(encoding='utf-8'))['spec'] == A.qa_spec('gear-cell')
    assert not A.qa_stale(reg.get('gear-plate'))
    q = A.nine_slice(reg, 'ui-starlit', _corner_art(), tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='corners', pad=1)
    assert q['pass'] and q['spec'] == A.qa_spec('nine-slice') and not A.qa_stale(reg.get('ui-starlit'))
    old = {k: v for k, v in reg.get('gear-plate')['qa'].items() if k != 'spec'}
    assert A.qa_stale({'kind': 'gear-cell', 'qa': old})                                   # recorded before the stamp
    assert A.qa_stale({'kind': 'nine-slice', 'qa': {**q, 'spec': 0}})
    assert not A.qa_stale({'qa': {'pass': True, 'reasons': []}})                          # unversioned kinds (icons, scenes)
    assert not A.qa_stale({'kind': 'gear-cell'})                                          # nothing recorded: not picked


def _corner_art(shape='star', colours=(STAR_CORE, STAR_ARM), dots=False, drop_corner=False):
    """The redrawn starlit as codex should draw it: 14 x 14 art px (10 raw px each; nine_slice pads 1 to 16), a 4 x 4
    four-point star in each corner (2 x 2 white core, a 2 px point on each side, empty diagonal corners).
    shape='square': a solid 3 x 3 square instead; 'cut': the top-left star has no north point; 'filled': every star
    also has its four bbox corner cells filled (a 4 x 4 block with a white centre)."""
    core, arm = colours; art = {}
    offsets = [(0, 0), (0, 10), (10, 0), (10, 10)][:3 if drop_corner else 4]
    for k, (oy, ox) in enumerate(offsets):
        if shape == 'square':
            for y in range(3):
                for x in range(3): art[(oy + y + (1 if oy else 0), ox + x + (1 if ox else 0))] = core
            continue
        for y, x in ((1, 1), (1, 2), (2, 1), (2, 2)): art[(oy + y, ox + x)] = core
        points = {'n': ((0, 1), (0, 2)), 's': ((3, 1), (3, 2)), 'w': ((1, 0), (2, 0)), 'e': ((1, 3), (2, 3))}
        for side, cells in points.items():
            if shape == 'cut' and k == 0 and side == 'n': continue
            for y, x in cells: art[(oy + y, ox + x)] = arm
        if shape == 'filled':
            for y, x in ((0, 0), (0, 3), (3, 0), (3, 3)): art[(oy + y, ox + x)] = arm
        if shape == 'filled-outer':   # only the corner cell nearest the tile corner: shallow, so no reach reason
            art[(oy + (0 if oy == 0 else 3), ox + (0 if ox == 0 else 3))] = arm
        if shape == 'plus3':          # the controller's 3 x 3 cross: one white core pixel and four cyan arms
            for cell in [c for c in art if oy <= c[0] < oy + 4 and ox <= c[1] < ox + 4]: del art[cell]
            cy, cx = oy + (1 if oy == 0 else 2), ox + (1 if ox == 0 else 2)
            art[(cy, cx)] = core
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)): art[(cy + dy, cx + dx)] = arm
    if dots:
        for y, x in ((0, 7), (13, 6), (7, 0), (6, 13)): art[(y, x)] = core
    arr = np.asarray(canvas(160, 160)).copy()
    for (y, x), c in art.items(): arr[10 + y * 10:20 + y * 10, 10 + x * 10:20 + x * 10] = c
    return Image.fromarray(arr, 'RGB')


def test_corner_starlit_needs_a_star_in_each_corner_and_nothing_else(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    run = lambda img, pad=1: A.nine_slice(reg, 'ui-starlit', img, tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='corners', pad=pad)
    q = run(_corner_art())
    assert q['pass'] and q['outside'] == 0 and len(q['stars']) == 4, q
    assert all(s['arms'] == 4 and not s['edge'] and not s['diagonal'] for s in q['stars']), q['stars']
    assert 'starlit outside its corners' in run(_corner_art(dots=True))['reasons']        # side dots repeat into dashes
    assert 'starlit corners missing' in run(_corner_art(drop_corner=True))['reasons']
    assert 'not starlight colours' in run(_corner_art(colours=((255, 170, 60), (255, 122, 20))))['reasons']
    assert 'starlit star too dim' in run(_corner_art(colours=(STAR_ARM, STAR_ARM)))['reasons']   # no white core


def test_corner_starlit_is_a_four_point_star_not_a_square_or_a_cut_star(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    run = lambda img, pad=1: A.nine_slice(reg, 'ui-starlit', img, tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='corners', pad=pad)
    sq = run(_corner_art('square'))
    assert 'starlit star is not a four-point star' in sq['reasons'] and not sq['pass'], sq
    cut = run(_corner_art('cut'))
    assert 'starlit star is not a four-point star' in cut['reasons'] and cut['stars'][0]['arms'] == 3, cut['stars']
    edge = run(_starlit(dots=False), pad=0)                                                # 5 x 5 stars on the tile's outer edge
    assert 'starlit star touches the tile edge' in edge['reasons'], edge
    blob = run(_corner_art('cut'))                                                        # the a4 case: half a star
    assert not blob['pass']


# --- the QA spec stamp is derived from the constants it covers (review round 2) ----------------------------------------------
NOT_THRESHOLDS = {'G', 'ROOT', 'SPEC_INPUTS'}     # module handles and the stamp machinery itself, not gate values


def _default_names(f):
    """Upper-case module names used as default argument values of f (positional and keyword-only). A default is
    evaluated when the function is defined, so it never shows up in co_names; read it from the source."""
    import ast, inspect, textwrap
    node = ast.parse(textwrap.dedent(inspect.getsource(f))).body[0]
    defaults = list(node.args.defaults) + [d for d in node.args.kw_defaults if d is not None]
    return {n.id for d in defaults for n in ast.walk(d) if isinstance(n, ast.Name) and n.id.lstrip('_').isupper()}


def _constants_read(f, seen=None):
    """Upper-case module names a gate function reads, in its body or as a default argument, following the sl_art
    functions it calls."""
    import types
    seen = set() if seen is None else seen; out = set()
    if f in seen: return out
    seen.add(f); out |= _default_names(f)
    codes = [f.__code__] + [c for c in f.__code__.co_consts if isinstance(c, types.CodeType)]
    for code in codes:
        for n in code.co_names:
            v = getattr(A, n, None)
            if n.lstrip('_').isupper(): out.add(n)
            elif isinstance(v, types.FunctionType) and v.__module__ == 'sl_art': out |= _constants_read(v, seen)
    return out


@pytest.mark.parametrize('kind, gate', [('gear-cell', 'process_gear_cell'), ('nine-slice', 'nine_slice'), ('skill-cell', 'process_skill_cell')])
def test_every_constant_a_gate_reads_is_in_its_stamp(kind, gate):
    assert _constants_read(getattr(A, gate)) - NOT_THRESHOLDS <= set(A.SPEC_INPUTS[kind]), \
        _constants_read(getattr(A, gate)) - NOT_THRESHOLDS - set(A.SPEC_INPUTS[kind])


@pytest.mark.parametrize('kind', ['gear-cell', 'nine-slice', 'skill-cell'])
def test_spec_stamp_is_a_readable_hash_that_moves_with_any_covered_constant(kind, monkeypatch):
    stamp = A.qa_spec(kind)
    assert re.fullmatch(rf'{kind}:[0-9a-f]{{12}}', stamp) and A.qa_spec(kind) == stamp       # deterministic
    entry = {'kind': kind, 'qa': {'pass': True, 'reasons': [], 'spec': stamp}}
    assert not A.qa_stale(entry)
    for name in A.SPEC_INPUTS[kind]:
        with monkeypatch.context() as m:
            m.setattr(A, name, ('changed', repr(getattr(A, name))))
            assert A.qa_spec(kind) != stamp and A.qa_stale(entry), name
    assert A.qa_spec(kind) == stamp
    assert 'DISTINCT_DE' in A.SPEC_INPUTS['nine-slice']                     # read by gear_art.frames_too_close, outside sl_art


def test_the_walker_reads_default_arguments():
    """Review fix round 2: thresholds bound as default arguments (despill's band, the spill step, the speck size, the
    coverage floor, the gear targets) are found by the walker itself, so leaving one out of SPEC_INPUTS fails."""
    gear, nine = _constants_read(A.process_gear_cell), _constants_read(A.nine_slice)
    assert {'SPILL_STEP', 'SPILL_BAND', 'SPECK_MAX', 'GEAR_LARGE', 'GEAR_ICON'} <= gear, gear
    assert {'SPILL_STEP', 'SPILL_BAND', 'COVER_MIN'} <= nine, nine
    assert {'STAR_WHITE_S_MAX', 'STAR_WHITE_V_MIN', 'STARLIGHT_HUE', 'STARLIGHT_S_MIN', 'STARLIGHT_V_MIN', 'STAR_CORNER',
            'EDGE_OUTER_ROWS'} <= nine, nine


def test_spill_band_and_the_white_core_floor_move_the_stamps(monkeypatch):
    gear, nine = A.qa_spec('gear-cell'), A.qa_spec('nine-slice')
    with monkeypatch.context() as m:
        m.setattr(A, 'SPILL_BAND', A.SPILL_BAND + 1)
        assert A.qa_spec('gear-cell') != gear and A.qa_spec('nine-slice') != nine
    with monkeypatch.context() as m:
        m.setattr(A, 'STAR_WHITE_V_MIN', 0.80)
        assert A.qa_spec('nine-slice') != nine and A.qa_spec('gear-cell') == gear
    assert (A.qa_spec('gear-cell'), A.qa_spec('nine-slice')) == (gear, nine)
    assert (A.STAR_WHITE_S_MAX, A.STAR_WHITE_V_MIN, A.STARLIGHT_HUE, A.STARLIGHT_S_MIN, A.STARLIGHT_V_MIN, A.STAR_CORNER,
            A.COVER_MIN, A.EDGE_OUTER_ROWS, A.GEAR_LARGE, A.GEAR_ICON) == (0.15, 0.85, (170, 215), 0.2, 0.7, 5, 0.4, 2, (56, 64), (22, 26))


def test_corner_star_with_filled_bbox_corners_fails_the_diagonal_rule(tmp_path):
    """A 4 x 4 block: white 2 x 2 centre, all four points, and the four corner cells filled cyan. It has every point, so
    only the empty-diagonal rule can reject it."""
    reg = A.Registry(tmp_path / 'r.json')
    q = A.nine_slice(reg, 'ui-starlit', _corner_art('filled'), tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='corners', pad=1)
    assert all(s['arms'] == 4 and s['diagonal'] and not s['edge'] for s in q['stars']), q['stars']
    assert 'starlit star is not a four-point star' in q['reasons'] and not q['pass'], q['reasons']   # its inner corner also reaches too deep
    q = A.nine_slice(reg, 'ui-starlit', _corner_art('filled-outer'), tmp_path / 'w', tmp_path / 'raw.png', 16, 5, role='corners', pad=1)
    assert all(s['arms'] == 4 and s['diagonal'] for s in q['stars']), q['stars']
    assert q['reasons'] == ['starlit star is not a four-point star'], q['reasons']                # the diagonal rule alone


def test_a_three_by_three_cross_is_a_valid_corner_star(tmp_path):
    """Controller ruling 2026-10-20: the sharp cross (one white core pixel, four cyan arms, empty diagonals) passes the
    corner-star QA as it stands."""
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-starlit', _corner_art('plus3'), tmp_path / 'w', tmp_path / 'raw.png', 16, 5,
                     role='corners', pad=1)
    assert q['pass'], q['reasons']
    assert all(s['core'] == 1 and s['arms'] == 4 and not s['diagonal'] and (s['w'], s['h']) == (3, 3) and not s['edge'] for s in q['stars'])


def test_a_bow_at_022_passes_where_a_sword_at_022_still_fails(tmp_path):
    m = {'long': 22, 'short': 21, 'mass': 0.22, 'box': [2, 2, 24, 23], 'centre_off': 0.0}
    assert A.subject_gate(m, 22, 'weapon', 'bow') == [] and A.subject_gate(m, 22, 'weapon', 'sword') == ['subject too light']
    cell = _shape_cell(300, 0, 'line', width=44)
    bow = A.process_gear_cell(A.Registry(tmp_path / 'a.json'), 'b', cell, tmp_path / 'a', tmp_path / 'raw.png', slot='weapon', kind='bow')
    staff = A.process_gear_cell(A.Registry(tmp_path / 'b.json'), 'b', cell, tmp_path / 'b', tmp_path / 'raw.png', slot='weapon', kind='staff')
    for aid in bow:
        assert bow[aid]['pass'] and 'subject too light' in staff[aid]['reasons'], (bow[aid], staff[aid])


def test_the_bow_ruling_moved_the_gear_cell_stamp():
    assert A.qa_spec('gear-cell') != 'gear-cell:6a8d64bae98b'           # the stamp before bows joined the thin class
    # (the frames' stamp did not move for bows; it moved later, with the outline-only spill ruling)


def test_no_test_can_write_the_real_prompts(tmp_path):
    """Review minor (a): batch.jobs() (and every other job builder) writes prompt files; conftest points them all at a
    temp folder for every test, so the real art-factory/starlantern/prompts/ is never rewritten by the suite."""
    import batch, gear_art, party, portal
    for mod in (batch, gear_art, party, portal):
        assert Path(mod.PROMPTS).is_relative_to(tmp_path.parent.parent), (mod.__name__, mod.PROMPTS)
        assert 'art-factory' not in str(mod.PROMPTS), (mod.__name__, mod.PROMPTS)


# --- controller ruling 2026-10-20 (G2): the spill gate counts the outline fringe only -------------------------------------------
def _subject(px, colour):
    """A 24 x 24 dark square on transparency (rows/cols 2..21); `px` pixels painted `colour`."""
    arr = np.zeros((26, 26, 4), np.uint8); arr[2:22, 2:22] = (30, 25, 40, 255)
    for y, x in px: arr[y, x, :3] = colour
    return Image.fromarray(arr, 'RGBA')


def test_spill_gate_still_fails_a_real_outline_fringe():
    img = _subject([(2, 8), (2, 9), (2, 10)], (137, 52, 136))            # on the outline, touching transparency
    q = {'reasons': [], 'pass': True}; A._spill_gate(q, img, {})
    assert q['magenta_spill'] == 3 and 'magenta spill' in q['reasons'] and not q['pass']
    q = {'reasons': [], 'pass': True}; A._spill_gate(q, _subject([(3, 8)], (110, 20, 120)), {})   # the 2nd pixel in: still the band
    assert q['magenta_spill'] == 1
    q = {'reasons': [], 'pass': True}; A._spill_gate(q, _subject([(4, 8)], (110, 20, 120)), {})   # the 3rd pixel in: shading
    assert q['magenta_spill'] == 0


def test_spill_gate_passes_interior_violet_and_maroon_shading():
    img = _subject([(10, 10), (12, 14), (15, 9)], (117, 22, 63))          # the G2 storm / Noel shading tones, deep inside
    img2 = _subject([(10, 10), (11, 11), (12, 12)], (37, 0, 52))
    for im in (img, img2):
        assert A.magenta_spill(np.asarray(im)).sum() == 3                  # the colours are spill-like ...
        q = {'reasons': [], 'pass': True}; A._spill_gate(q, im, {})
        assert q['magenta_spill'] == 0 and q['pass'], q                    # ... but not outline fringe


def test_interior_key_leftover_is_still_caught_by_the_residue_gate():
    img = _subject([(10, 10), (10, 11)], (225, 30, 225))                   # near-key pixels left inside the subject
    q = {'reasons': [], 'pass': True}; A._spill_gate(q, img, {})
    assert q['magenta_spill'] == 0                                         # not the spill gate's job ...
    assert 'magenta residue' in A.alpha_qa(img)['reasons']                 # ... the residue gate takes it


def test_the_spill_ruling_moved_both_stamps():
    assert A.qa_spec('gear-cell') != 'gear-cell:cba070036b9c' and A.qa_spec('nine-slice') != 'nine-slice:2ab30baae894'


# --- controller ruling after the G2 tooling review: key-tinted pixels left inside the subject --------------------------------
def test_interior_key_tint_is_counted_as_residue():
    """Opaque pixels more than 2 px from the edge that look like the key blended dark or bright (_dark_magenta,
    _magenta_tint) are residue: more than KEY_TINT_INSIDE_MAX fails, and the count is recorded."""
    q = {'reasons': [], 'pass': True}; A._spill_gate(q, _subject([(10, 10), (12, 13), (15, 9)], (142, 12, 147)), {})
    assert q['key_tint_inside'] == 3 and 'magenta residue' in q['reasons'] and not q['pass'], q
    q = {'reasons': [], 'pass': True}; A._spill_gate(q, _subject([(10, 10), (12, 13)], (142, 12, 147)), {})
    assert q['key_tint_inside'] == 2 and q['pass'], q                                  # at the limit
    for shade in ((117, 22, 63), (37, 0, 52)):                                         # the art's own dark shading
        q = {'reasons': [], 'pass': True}; A._spill_gate(q, _subject([(10, 10), (12, 13), (15, 9)], shade), {})
        assert q['key_tint_inside'] == 0 and q['pass'], (shade, q)
    q = {'reasons': [], 'pass': True}; A._spill_gate(q, _subject([(2, 8), (2, 9), (2, 10)], (142, 12, 147)), {})
    assert q['key_tint_inside'] == 0                                                   # on the outline it is spill, not this
    assert A.KEY_TINT_INSIDE_MAX == 2 and 'KEY_TINT_INSIDE_MAX' in A.SPEC_INPUTS['gear-cell'] and 'KEY_TINT_INSIDE_MAX' in A.SPEC_INPUTS['nine-slice']


def test_the_interior_key_tint_ruling_moved_both_stamps():
    assert A.qa_spec('gear-cell') != 'gear-cell:9e868455a2f5' and A.qa_spec('nine-slice') != 'nine-slice:0a2593886a43'


# --- controller ruling 2026-10-20 (G3): skill icons are native-size assets like gear --------------------------------------------
def test_skill_cell_makes_native_icons_for_the_tab_and_the_tree(tmp_path):
    """The skill tab shows 16 x 16 and the tree 14 x 14 (statusTabs.ts, .slx-skill-ico): one centre sample each from the
    high-resolution cell, subject long edge exactly 14 / 12 (a 1 px transparent margin), centred, gated."""
    assert A.SKILL_TAB == (14, 16) and A.SKILL_TREE == (12, 14)
    reg = A.Registry(tmp_path / 'r.json')
    out = A.process_skill_cell(reg, 'flame-wave', _shape_cell(300, 210, 'ellipse'), tmp_path / 'w', tmp_path / 'raw.png')
    assert set(out) == {'icon-flame-wave-16', 'icon-flame-wave-14'}
    for aid, (side, size) in (('icon-flame-wave-16', A.SKILL_TAB), ('icon-flame-wave-14', A.SKILL_TREE)):
        q = out[aid]
        assert q['pass'] and q['size'] == [size, size] and q['subject']['long'] == side and q['subject']['centre_off'] <= 1, q
        assert q['spec'] == A.qa_spec('skill-cell') and reg.get(aid)['kind'] == 'skill-cell' and not A.qa_stale(reg.get(aid))
        assert Image.open(tmp_path / 'w' / f'{aid}.png').size == (size, size)


def test_skill_cell_refuses_to_upsample_a_tiny_subject(tmp_path):
    out = A.process_skill_cell(A.Registry(tmp_path / 'r.json'), 'x', _shape_cell(13, 13), tmp_path / 'w', tmp_path / 'raw.png')   # 13 < 14
    assert 'cell too small to sample' in out['icon-x-16']['reasons'] and not out['icon-x-16']['pass']
