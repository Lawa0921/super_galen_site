import numpy as np
import pytest
from PIL import Image
import faces as F


def bust(w, h, color=(180, 40, 40)):
    a = np.zeros((h, w, 4), np.uint8); a[2:, 2:w - 2] = (*color, 255)
    return Image.fromarray(a, 'RGBA')


def test_match_qa_passes_same_canvas_same_block_same_palette(tmp_path):
    bust(108, 115).save(tmp_path / 'base.png'); bust(110, 115).save(tmp_path / 'new.png')
    m = F.match_qa(tmp_path / 'new.png', tmp_path / 'base.png', base_block=11, block=11)
    assert m['pass'] and m['reasons'] == []
    assert m['size_delta'] == [2, 0] and m['palette_share'] == 1.0


def test_match_qa_fails_a_canvas_far_from_the_base(tmp_path):
    bust(108, 115).save(tmp_path / 'base.png'); bust(108, 96).save(tmp_path / 'new.png')
    m = F.match_qa(tmp_path / 'new.png', tmp_path / 'base.png', base_block=11, block=11)
    assert not m['pass'] and 'canvas differs from the base portrait' in m['reasons']


def test_match_qa_fails_a_different_pixel_scale(tmp_path):
    bust(108, 115).save(tmp_path / 'base.png'); bust(108, 115).save(tmp_path / 'new.png')
    m = F.match_qa(tmp_path / 'new.png', tmp_path / 'base.png', base_block=11, block=10)
    assert not m['pass'] and 'pixel scale differs from the base portrait' in m['reasons']


def test_match_qa_warns_on_a_foreign_palette(tmp_path):
    bust(108, 115).save(tmp_path / 'base.png'); bust(108, 115, color=(20, 200, 60)).save(tmp_path / 'new.png')
    m = F.match_qa(tmp_path / 'new.png', tmp_path / 'base.png', base_block=11, block=11)
    assert m['pass'] and m['palette_share'] == 0.0 and 'palette far from the base portrait' in m['warnings']


def test_jobs_chain_each_face_to_the_published_base_and_use_its_scale():
    reg = {'char-scarlet-portrait': {'raw': 'C:/raw/p.png', 'final': 'w/p.png', 'qa': {'block': 11}},
           'char-scarlet-standee': {'raw': 'C:/raw/s.png'}}
    job = next(j for j in F.jobs(reg, ['scarlet']) if j['id'] == 'char-scarlet-portrait-sad')
    assert [str(p).replace('\\', '/') for p in job['images']] == ['C:/raw/p.png', 'C:/raw/s.png']
    assert job['block'] == 11 and job['batch'] == 'faces-scarlet' and job['base'] == 'char-scarlet-portrait'
    assert job['deps'] == ['char-scarlet-portrait', 'char-scarlet-standee']
    assert '\n' not in job['prompt'] and 'quietly sad' in job['prompt'] and 'first attached portrait' in job['prompt']


def test_jobs_skip_a_character_without_a_published_base():
    assert F.jobs({}, ['scarlet']) == []


def test_each_attempt_gets_its_own_empty_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(F, 'RAW', tmp_path)
    d = F.attempt_dir('char-x-portrait-sad', 1)
    assert d == tmp_path / 'char-x-portrait-sad' / 'a1' and not d.exists()
    d.mkdir(parents=True); (d / 'junk.png').write_bytes(b'x')
    with pytest.raises(FileExistsError):
        F.attempt_dir('char-x-portrait-sad', 1)


def test_codex_still_passes_a_model_only_when_asked(tmp_path):
    import codex_still as C
    seen = []
    def runner(argv, **kw):
        seen.append(argv); return type('P', (), {'returncode': 0})()
    C.run_codex('draw', tmp_path / 'a', 'x.png', runner=runner, codex='codex', generated_root=tmp_path / 'none')
    rec = C.run_codex('draw', tmp_path / 'b', 'x.png', runner=runner, codex='codex', generated_root=tmp_path / 'none', model='gpt-6-luna')
    assert '-m' not in seen[0]
    assert seen[1][seen[1].index('-m') + 1] == 'gpt-6-luna' and seen[1][-1].startswith('draw')
    assert rec['model'] == 'gpt-6-luna'


def test_faces_gen_reads_the_model_option():
    assert F._model(['--only=x', '--model=gpt-6-luna']) == 'gpt-6-luna' and F._model([]) is None


def test_a_failed_attempt_keeps_its_folder_and_the_next_one_takes_a_new_number(tmp_path, monkeypatch):
    monkeypatch.setattr(F, 'RAW', tmp_path)
    (tmp_path / 'char-x-portrait-sad' / 'a1').mkdir(parents=True)
    (tmp_path / 'char-x-portrait-sad' / 'a1' / 'char-x-portrait-sad-a1.codex.log').write_text('refused')
    assert F.next_attempt('char-x-portrait-sad') == 2 and F.attempts('char-x-portrait-sad') == []
    assert F.next_attempt('char-y-portrait-sad') == 1
