import json, sys
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
    assert len(runtime) == 183 and len(set(runtime)) == 183
    assert assets['npc-guild-happy']['runtime'] == '/assets/games/starlantern/npc/guild-happy.png'
    assert assets['scene-title']['runtime'] == '/assets/games/starlantern/scene/title.png'
    for m in ('attack', 'hit', 'dying', 'down', 'ultimate'):
        assert assets[f'char-liz-portrait-{m}']['runtime'] == f'/assets/games/starlantern/char/liz-portrait-{m}.png'
    assert 'char-liz-portrait-hurt' not in assets
    assert assets['map-fog']['runtime'] == '/assets/games/starlantern/map/fog.png'
    assert all(r.startswith(A.BASE) for r in runtime)
    assert assets['tile-f2-chest-open']['runtime'] == '/assets/games/starlantern/tiles/f2-chest-open.png'
    assert assets['sheet-icons-1']['parts'][0] == 'icon-fire-star'
    assert len(assets['sheet-icons-3']['parts']) == 17


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
