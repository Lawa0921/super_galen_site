"""Wave 2 of the talking faces: Lorne's and Rin's grave faces, and one redo of four weak wave-1 faces (user 2026-10-24)."""
import faces as F

ARTS = F.COMPANIONS + ['hero', 'rin', 'rin-oath']
REG = {f'char-{c}-{k}': {'raw': f'C:/raw/{c}-{k}.png', 'final': f'w/{c}.png', 'qa': {'block': 11}}
       for c in ARTS for k in ('portrait', 'standee')}


def by_id(wave=2):
    return {j['id']: j for j in F.jobs(REG, wave=wave)}


def test_wave2_is_lornes_and_both_rin_sets_grave_faces_plus_four_redos():
    assert sorted(by_id()) == sorted([
        'char-hero-portrait-serious', 'char-hero-portrait-distant',
        'char-rin-portrait-serious', 'char-rin-portrait-guarded',
        'char-rin-oath-portrait-serious', 'char-rin-oath-portrait-guarded',
        'char-scarlet-portrait-vow', 'char-selene-portrait-wistful', 'char-noel-portrait-sad', 'char-bobby-portrait-sad'])


def test_wave1_is_unchanged_by_the_wave_argument():
    assert len(F.jobs(REG)) == 18 and len(F.jobs(REG, wave=1)) == 18


def test_each_rin_set_uses_its_own_normal_portrait_and_standee():
    j = by_id()['char-rin-oath-portrait-guarded']
    assert j['base'] == 'char-rin-oath-portrait' and j['deps'] == ['char-rin-oath-portrait', 'char-rin-oath-standee']
    assert [str(p).replace('\\', '/') for p in j['images']] == ['C:/raw/rin-oath-portrait.png', 'C:/raw/rin-oath-standee.png']
    assert 'flattened' in j['prompt'] and 'crack' not in j['prompt'].split('flattened')[0][-200:]
    assert 'cracked' in by_id()['char-rin-portrait-guarded']['prompt']


def test_lorne_is_a_young_man_without_a_sword_and_his_serious_face_drops_the_smile():
    j = by_id()['char-hero-portrait-serious']
    p = j['prompt']
    assert 'same young man' in p and 'around him' in p and ' girl' not in p
    assert 'no sword' in p and 'no smile' in p
    assert 'faraway voice' in by_id()['char-hero-portrait-distant']['prompt']


def test_rin_guarded_and_every_new_face_must_read_at_game_size():
    assert 'half-lidded' in by_id()['char-rin-portrait-guarded']['prompt']
    for aid in ('char-hero-portrait-serious', 'char-hero-portrait-distant', 'char-rin-portrait-serious', 'char-rin-portrait-guarded'):
        assert 'small size' in by_id()[aid]['prompt'] and '\n' not in by_id()[aid]['prompt']


def test_redos_ask_for_what_wave1_missed_and_stay_one_line():
    j = by_id()
    assert 'hand pressed flat over her heart' in j['char-scarlet-portrait-vow']['prompt']
    w = j['char-selene-portrait-wistful']['prompt']
    assert 'half-smile' in w and 'no tears' in w
    for aid in ('char-noel-portrait-sad', 'char-bobby-portrait-sad'):
        assert 'tear' in j[aid]['prompt'] and 'clearly' in j[aid]['prompt'] and 'no trace of a smile' in j[aid]['prompt']
    assert all('\n' not in x['prompt'] for x in j.values())
    # the wave-1 prompt of the same id stays what it was
    assert 'hand pressed flat' not in next(x for x in F.jobs(REG) if x['id'] == 'char-scarlet-portrait-vow')['prompt']


def test_redos_get_exactly_one_more_attempt():
    assert F.REDO_ATTEMPTS == 2


def test_review_has_a_real_line_for_every_new_face():
    import review_faces as R
    for aid in by_id():
        assert aid in R.WAVE2_LINES and R.WAVE2_LINES[aid][1].startswith('「')


def test_second_attempts_carry_the_revision_from_reviewing_the_first():
    j = by_id()
    assert 'Revision:' in j['char-hero-portrait-distant']['prompt'] and 'not downward' in j['char-hero-portrait-distant']['prompt']
    assert 'Revision:' in j['char-rin-oath-portrait-serious']['prompt']
    assert 'Revision:' not in j['char-rin-portrait-serious']['prompt']
