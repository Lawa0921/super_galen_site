"""Wave 4 of the talking faces (affinity plan Task A, spec 2026-10-18 section 0 D18): the 14 warm and heart-pact faces, and
this round's style sample of four of them for the user (2026-10-24)."""
import faces as F

ARTS = F.COMPANIONS + ['hero', 'rin', 'rin-oath']
REG = {f'char-{c}-{k}': {'raw': f'C:/raw/{c}-{k}.png', 'final': f'w/{c}.png', 'qa': {'block': 11}}
       for c in ARTS for k in ('portrait', 'standee')}


def by_id():
    return {j['id']: j for j in F.jobs(REG, wave=4)}


def test_task_a_is_fourteen_faces_nine_blush_two_averted_and_three_specials():
    ids = [f'char-{c}-portrait-{m}' for c, ms in F.WAVE4_ALL.items() for m in ms]
    assert len(ids) == len(set(ids)) == 14
    assert sum(1 for i in ids if i.endswith('-blush')) == 9
    assert {i for i in ids if not i.endswith('-blush')} == {
        'char-rin-portrait-averted', 'char-rin-oath-portrait-averted', 'char-sylvie-portrait-unguarded',
        'char-noel-portrait-smug', 'char-bobby-portrait-excited'}
    # Rin's blush is her oath look's: the romance and the heart pact come after her choice (spec 7, 9)
    assert 'rin-oath' in F.WAVE4_ALL and 'blush' in F.WAVE4_ALL['rin-oath'] and 'blush' not in F.WAVE4_ALL['rin']


def test_wave4_runs_only_the_sample_of_four():
    assert sorted(by_id()) == sorted(['char-noel-portrait-blush', 'char-safira-portrait-blush',
                                      'char-rin-oath-portrait-averted', 'char-bobby-portrait-excited'])
    for c, ms in F.WAVE4.items():
        assert set(ms) <= set(F.WAVE4_ALL[c])


def test_earlier_waves_are_unchanged():
    assert len(F.jobs(REG)) == 18 and len(F.jobs(REG, wave=2)) == 10 and len(F.jobs(REG, wave=3)) == 3


def test_sample_prompts_chain_to_their_own_normal_and_carry_the_spec_cues():
    j = by_id()
    for aid, x in j.items():
        c = x['cid']
        assert x['base'] == f'char-{c}-portrait' and x['deps'] == [f'char-{c}-portrait', f'char-{c}-standee'] and x['batch'] == f'faces-{c}'
        assert 'same girl' in x['prompt'] and 'around her' in x['prompt'] and 'small size' in x['prompt'] and '\n' not in x['prompt']
        assert x['max_attempts'] == 2
    for aid in ('char-noel-portrait-blush', 'char-safira-portrait-blush'):
        p = j[aid]['prompt']
        assert 'hard-edged pink pixels' in p and 'no soft gradient' in p and 'smile' in p
    assert 'darker skin' in j['char-safira-portrait-blush']['prompt']      # the blush must read on her skin tone
    assert 'no pout' in j['char-noel-portrait-blush']['prompt']             # and stay apart from her published pout
    a = j['char-rin-oath-portrait-averted']['prompt']
    assert 'looking off to the side' in a and 'no blush' in a and 'no tears' in a
    assert 'flattened into a smooth dented disc' in a                      # the oath look's bell, never the cracked one
    e = j['char-bobby-portrait-excited']['prompt']
    assert 'two hard-edged highlights' in e and 'grin' in e and 'goggles' in e


def test_script_lines_finds_each_face_with_its_scene():
    import review_faces as R
    blush = R.script_lines('noel', 'blush')
    assert len(blush) == 4 and all(t.startswith('「') for _, t, _ in blush)
    assert ('night beat', '「本小姐要睡了。睡著之前，誰都不准先走。」', '') in blush
    av = R.script_lines('rin', 'averted')
    assert any(s == 'mem:rin:4' for s, _, _ in av) and any(cond == 'oath: false' for _, _, cond in av)
    assert R.script_lines('safira', 'blush') == []


def test_review_names_what_each_task_a_face_is_for():
    import review_faces as R
    for c, ms in F.WAVE4_ALL.items():
        for m in ms:
            assert R.WAVE4_USES[(c, m)].strip()
    # Rin's lines name 'rin'; each look takes the lines its state plays, so the oath look's averted says which
    assert 'banter:chizuru-rin:2' in R.WAVE4_USES[('rin-oath', 'averted')] and 'mem:rin:4' in R.WAVE4_USES[('rin', 'averted')]
