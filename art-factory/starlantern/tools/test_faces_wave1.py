"""Wave 1 of the companion talking faces (runs/expressions-proposal.md; user picked codex 2026-10-23)."""
import faces as F

REG = {f'char-{c}-{k}': {'raw': f'C:/raw/{c}-{k}.png', 'final': f'w/{c}.png', 'qa': {'block': 10}}
       for c in F.COMPANIONS for k in ('portrait', 'standee')}


def moods(cid):
    return [j['mood'] for j in F.jobs(REG, [cid])]


def test_wave1_is_the_eighteen_faces_of_the_proposal():
    assert moods('scarlet') == ['serious', 'sad', 'vow', 'shaken']
    assert moods('chizuru') == ['serious', 'sad', 'solemn']
    assert moods('sylvie') == ['serious', 'sad'] and moods('bobby') == ['serious', 'sad']
    assert moods('selene') == ['sad', 'wistful'] and moods('liz') == ['serious', 'sad', 'hushed']
    assert moods('safira') == ['sad'] and moods('noel') == ['sad']
    assert len(F.jobs(REG)) == 18


def test_sad_asks_for_the_cues_that_still_read_at_game_size():
    p = next(j for j in F.jobs(REG, ['safira']) if j['mood'] == 'sad')['prompt']
    for cue in ('inner ends of the eyebrows raised', 'corners of the mouth clearly turned down', 'single small tear', 'head tilted slightly down', 'small size'):
        assert cue in p
    assert '\n' not in p


def test_hushed_and_shaken_carry_the_stronger_cues_too():
    hushed = F.FACES['hushed']; shaken = F.FACES['shaken']
    assert 'inner ends of the eyebrows raised' in hushed and 'turned down' in hushed
    assert 'inner ends of the eyebrows raised' in shaken and 'small size' in shaken


def test_a_codex_pick_clears_the_gemini_repair_flags():
    assert F.registry_fields('codex') == {'generator': 'codex', 'defringe': None, 'neutralize_tint': None}
    assert F.registry_fields('gemini/m') == {'generator': 'gemini/m', 'defringe': 'strong', 'neutralize_tint': True}


def test_a_codex_raw_names_the_model_its_log_reports(tmp_path):
    import json
    raw = tmp_path / 'x-a1.png'; raw.write_bytes(b'')
    (tmp_path / 'x-a1.gen.json').write_text(json.dumps({'tool': 'codex', 'model': None}), encoding='utf-8')
    (tmp_path / 'x-a1.codex.log').write_text('OpenAI Codex v0.164.0\n--------\nworkdir: C:/w\nmodel: gpt-6-astra\nprovider: openai\n', encoding='utf-8')
    assert F.generator_of(raw) == 'codex/gpt-6-astra'
    (tmp_path / 'x-a1.codex.log').unlink()
    assert F.generator_of(raw) == 'codex'
