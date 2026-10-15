import json
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
    assert len(runtime) == 166 and len(set(runtime)) == 166
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
