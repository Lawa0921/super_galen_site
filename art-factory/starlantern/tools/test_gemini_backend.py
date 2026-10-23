"""Gemini backend of codex_still (user ruling 2026-10-23: codex has no image tool on this account). No network: the
HTTP call is always replaced."""
import base64, io, json
import pytest
from PIL import Image
import codex_still as C
import faces as F

SECRET = 'test-key-SECRET-123'


def png_bytes(w=64, h=64):
    im = Image.new('RGB', (w, h), (255, 0, 255)); im.paste((200, 40, 40), (16, 16, 48, 64))
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


def ok_response(data=None):
    return {'candidates': [{'content': {'parts': [{'text': 'here'}, {'inlineData': {'mimeType': 'image/png', 'data': base64.b64encode(data or png_bytes()).decode()}}]}}],
            'usageMetadata': {'promptTokenCount': 1200, 'candidatesTokenCount': 1290, 'totalTokenCount': 2490}, 'modelVersion': 'gemini-x-image'}


@pytest.fixture
def refs(tmp_path):
    a, b = tmp_path / 'p.png', tmp_path / 's.png'
    a.write_bytes(png_bytes()); b.write_bytes(png_bytes(32, 64)); return [a, b]


def test_gemini_request_carries_the_prompt_and_the_references_in_order(tmp_path, refs, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', SECRET); seen = {}
    def http(url, body, headers):
        seen.update(url=url, body=body, headers=headers); return ok_response()
    rec = C.run_gemini('draw her', tmp_path / 'w', 'x-a1.png', refs, model='gemini-x-image', http=http)
    parts = seen['body']['contents'][0]['parts']
    assert parts[0] == {'text': 'draw her'}
    assert [base64.b64decode(p['inline_data']['data']) for p in parts[1:]] == [r.read_bytes() for r in refs]
    assert 'IMAGE' in seen['body']['generationConfig']['responseModalities']
    assert seen['url'].endswith('/models/gemini-x-image:generateContent') and seen['headers']['x-goog-api-key'] == SECRET
    assert rec['status'] == 'generated' and rec['tool'] == 'gemini' and rec['model'] == 'gemini-x-image'
    assert rec['generator'] == 'gemini/gemini-x-image' and rec['usage']['totalTokenCount'] == 2490


def test_gemini_keeps_the_codex_records_and_never_writes_the_key(tmp_path, refs, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', SECRET)
    C.run_gemini('draw', tmp_path / 'w', 'x-a1.png', refs, model='m-image', http=lambda u, b, h: ok_response())
    names = sorted(p.name for p in (tmp_path / 'w').iterdir())
    assert names == ['x-a1.gemini.log', 'x-a1.gen.json', 'x-a1.png', 'x-a1.prompt.txt']
    gen = json.loads((tmp_path / 'w' / 'x-a1.gen.json').read_text(encoding='utf-8'))
    assert gen['output_sha256'] == C._sha(tmp_path / 'w' / 'x-a1.png') and len(gen['inputs']) == 2
    for p in (tmp_path / 'w').iterdir():
        assert SECRET.encode() not in p.read_bytes()
    log = json.loads((tmp_path / 'w' / 'x-a1.gemini.log').read_text(encoding='utf-8'))
    img = log['response']['candidates'][0]['content']['parts'][1]['inlineData']
    assert 'data' not in img and img['sha256'] == gen['output_sha256'] and '"data"' not in json.dumps(log['request'])


def test_gemini_without_an_image_is_no_output(tmp_path, refs, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', SECRET)
    rec = C.run_gemini('draw', tmp_path / 'w', 'x-a1.png', refs, model='m', http=lambda u, b, h: {'candidates': [{'finishReason': 'SAFETY'}]})
    assert rec['status'] == 'no_output' and rec['output'] is None and not (tmp_path / 'w' / 'x-a1.png').exists()


def test_gemini_refuses_a_used_name(tmp_path, refs, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', SECRET)
    (tmp_path / 'w').mkdir(); (tmp_path / 'w' / 'x-a1.png').write_bytes(b'x')
    with pytest.raises(FileExistsError):
        C.run_gemini('draw', tmp_path / 'w', 'x-a1.png', refs, model='m', http=lambda u, b, h: ok_response())


def test_main_picks_the_backend(tmp_path, refs, monkeypatch):
    calls = []
    def fake(kind):
        def f(prompt, workdir, name, images, **kw):
            calls.append((kind, kw.get('model'))); (workdir).mkdir(parents=True, exist_ok=True)
            (workdir / name).write_bytes(png_bytes()); return {'output': name}
        return f
    monkeypatch.setattr(C, 'run_codex', fake('codex')); monkeypatch.setattr(C, 'run_gemini', fake('gemini'))
    pf = tmp_path / 'p.txt'; pf.write_text('draw', encoding='utf-8')
    C.main(['generate', '--workdir', str(tmp_path / 'a'), '--name', 'x.png', '--prompt-file', str(pf)])
    C.main(['generate', '--workdir', str(tmp_path / 'b'), '--name', 'x.png', '--prompt-file', str(pf), '--backend', 'gemini', '--model', 'm-image'])
    assert calls == [('codex', None), ('gemini', 'm-image')]


def test_the_key_comes_from_the_env_or_the_gemini_env_file(tmp_path, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    env = tmp_path / '.env'; env.write_text('OTHER=1\nGEMINI_API_KEY="abc"\n', encoding='utf-8')
    assert C.gemini_key(env) == 'abc'
    monkeypatch.setenv('GEMINI_API_KEY', 'fromenv')
    assert C.gemini_key(env) == 'fromenv'


def test_faces_gemini_prompt_drops_the_codex_tool_sentence_and_scales_the_block():
    reg = {'char-scarlet-portrait': {'raw': 'C:/raw/p.png', 'final': 'w/p.png', 'qa': {'block': 11}},
           'char-scarlet-standee': {'raw': 'C:/raw/s.png'}}
    job = F.jobs(reg, ['scarlet'])[0]
    assert 'image tool' not in F.prompt_text(job, 'gemini') and 'image tool' in F.prompt_text(job, 'codex')
    assert F.scaled_block(11, base_width=1254, raw_width=1254) == 11
    assert F.scaled_block(11, base_width=1254, raw_width=1024) == 9
    assert F.scaled_block(11, base_width=1254, raw_width=2048) == 18


def test_faces_gen_reads_the_backend_option():
    assert F._backend(['--backend=gemini']) == 'gemini' and F._backend([]) == 'codex'


def test_gemini_raws_get_the_strong_defringe_and_tint_repair():
    """Gemini outlines carry ~4x the key spill of the codex base portraits (2026-10-23 sample: 264 vs 56); the registry's
    existing opt-in repairs bring it back to the base level (71)."""
    assert F.postprocess_flags('gemini/gemini-3-pro-image') == {'defringe': 'strong', 'neutralize_tint': True}
    assert F.postprocess_flags('codex') == {} and F.postprocess_flags('codex/gpt-6-luna') == {}
