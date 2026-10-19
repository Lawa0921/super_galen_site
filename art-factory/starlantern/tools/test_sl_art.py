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
    assert A.magenta_spill_count(Image.fromarray(out, 'RGBA')) == 1      # only the deliberate inside pixel is left


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


def test_gear_cell_fails_magenta_left_inside_the_subject_unless_the_registry_allows_it(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    q = A.process_gear_cell(reg, 'iron-sword', _spilled_cell(inside=True), tmp_path / 'w', tmp_path / 'raw.png')['gear-iron-sword-large']
    assert not q['pass'] and 'magenta spill' in q['reasons'] and q['magenta_spill'] > 0
    reg.set('gear-iron-sword-large', allow_magenta_spill=q['magenta_spill'])
    assert A.process_gear_cell(reg, 'iron-sword', _spilled_cell(inside=True), tmp_path / 'w', tmp_path / 'raw.png')['gear-iron-sword-large']['pass']


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
    """A frame whose 1 art-px bar is one colour plus codec jitter of +-3 per art pixel (what codex frames look like after
    sampling). jump=(x0, x1, colour): a block of another colour on the top bar, so the repeated edge shows a joint."""
    rng = np.random.default_rng(seed); arr = np.asarray(canvas(176, 176)).copy(); r = arr[8:168, 8:168]
    jitter = lambda: np.clip(np.array((70, 110, 170)) + rng.integers(-3, 4, 3), 0, 255)
    for i in range(16):                      # 16 art px of 10 raw px each; the bar is the outer art pixel
        for sl in (np.s_[:10, i * 10:(i + 1) * 10], np.s_[-10:, i * 10:(i + 1) * 10], np.s_[i * 10:(i + 1) * 10, :10], np.s_[i * 10:(i + 1) * 10, -10:]):
            r[sl] = jitter()
    if jump: r[:10, jump[0]:jump[1]] = jump[2]
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
def test_nine_slice_passes_the_edges_of_the_real_a3_frame_sheet(tmp_path):
    import portal as P
    cells = P.sheet_cells(Image.open(A3_FRAMES).convert('RGB'), 3, 2)
    for cell, (aid, size, sl) in zip(cells, [('ui-rarity-magic', 16, 5), ('ui-rarity-rare', 16, 5), ('ui-rarity-legendary', 16, 5),
                                             ('ui-rarity-unique', 16, 5), ('ui-rarity-set', 16, 5), ('ui-glow-legendary', 20, 7)]):
        reg = A.Registry(tmp_path / f'{aid}.json'); reg.set(aid, defringe='strong')
        q = A.nine_slice(reg, aid, cell, tmp_path / 'w', A3_FRAMES, size, sl)
        assert 'edge does not repeat' not in q['reasons'], (aid, q['edge_repeat'], q['edge_steps'])


def _thick_ring(hole=False, colour=(180, 140, 60)):
    """160 px frame with a 54 px border: sampled to 12 x 12 it is a 4 art-px ring around a 4 x 4 (16 px) centre."""
    arr = np.asarray(canvas(176, 176)).copy(); r = arr[8:168, 8:168]
    r[:54, :] = colour; r[-54:, :] = colour; r[:, :54] = colour; r[:, -54:] = colour
    if hole: r[16:26, 80:94] = M          # one art pixel erased inside the top band (art row 1, column 6)
    return Image.fromarray(arr, 'RGB')


def test_nine_slice_does_not_count_its_transparent_centre_as_a_hole(tmp_path):
    q = A.nine_slice(A.Registry(tmp_path / 'r.json'), 'ui-rarity-rare', _thick_ring(), tmp_path / 'w', tmp_path / 'raw.png', 12, 4)
    assert q['center_clear'] and q['pass'] and q['holes'] == 0 and q['warnings'] == [], q


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


def test_retire_cli_calls_the_registry(monkeypatch):
    calls = []
    monkeypatch.setattr(A.Registry, 'retire', lambda self, aid, public, reason: calls.append((aid, reason)))
    assert A.main(['retire', '--id', 'icon-iron-sword', '--reason', 'replaced']) == 0
    assert calls == [('icon-iron-sword', 'replaced')]
