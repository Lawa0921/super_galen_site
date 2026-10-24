"""Wave 3 of the talking faces: the five heavy lines of Safira and Noel that still show no portrait, and one more try at
Selene's wistful (2026-10-24)."""
import faces as F

ARTS = F.COMPANIONS + ['hero', 'rin', 'rin-oath']
REG = {f'char-{c}-{k}': {'raw': f'C:/raw/{c}-{k}.png', 'final': f'w/{c}.png', 'qa': {'block': 11}}
       for c in ARTS for k in ('portrait', 'standee')}


def by_id():
    return {j['id']: j for j in F.jobs(REG, wave=3)}


def test_wave3_is_safira_serious_noel_pout_and_one_more_selene_wistful():
    assert sorted(by_id()) == sorted(['char-safira-portrait-serious', 'char-noel-portrait-pout', 'char-selene-portrait-wistful'])


def test_waves_1_and_2_are_unchanged():
    assert len(F.jobs(REG)) == 18 and len(F.jobs(REG, wave=2)) == 10


def test_new_faces_chain_to_their_own_normal_and_say_the_smile_is_gone():
    j = by_id()
    s, p = j['char-safira-portrait-serious'], j['char-noel-portrait-pout']
    assert s['base'] == 'char-safira-portrait' and s['deps'] == ['char-safira-portrait', 'char-safira-standee'] and s['batch'] == 'faces-safira'
    assert p['base'] == 'char-noel-portrait' and p['batch'] == 'faces-noel'
    for x in (s, p):
        assert 'same girl' in x['prompt'] and 'around her' in x['prompt'] and 'no smile' in x['prompt']
        assert 'small size' in x['prompt'] and '\n' not in x['prompt']
    assert 'pout' in p['prompt'] and 'no blush' in p['prompt']
    assert 'lips pressed' in s['prompt']


def test_selene_third_wistful_asks_for_a_visible_smile_and_a_downcast_gaze():
    w = by_id()['char-selene-portrait-wistful']['prompt']
    assert 'corners of the mouth turned up' in w and 'looking down' in w and 'no tears' in w
    assert 'different from' in w and 'small size' in w and '\n' not in w
    # wave 2's redo prompt for the same id stays what it was
    w2 = next(x for x in F.jobs(REG, wave=2) if x['id'] == 'char-selene-portrait-wistful')['prompt']
    assert w2 != w and 'half-smile' in w2


def test_attempt_caps_two_for_a_new_face_three_for_selene():
    j = by_id()
    assert j['char-safira-portrait-serious']['max_attempts'] == 2 and j['char-noel-portrait-pout']['max_attempts'] == 2
    assert j['char-selene-portrait-wistful']['max_attempts'] == 3
    assert F.target(j['char-selene-portrait-wistful'], 5) == 3 and F.target(j['char-noel-portrait-pout'], 1) == 1
    assert F.target({'id': 'x'}, 4) == 4   # waves 1 and 2 keep --n as given


def test_review_lists_the_five_hidden_lines_each_with_the_face_that_shows_it():
    import review_faces as R
    assert len(R.WAVE3_HIDDEN) == 5
    for scene, who, mood, text, face in R.WAVE3_HIDDEN:
        assert who in ('safira', 'noel') and text.startswith('「') and face in by_id()
        assert face == f'char-{who}-portrait-{"serious" if who == "safira" else "pout"}'
    assert sum(1 for h in R.WAVE3_HIDDEN if h[1] == 'noel') == 4
