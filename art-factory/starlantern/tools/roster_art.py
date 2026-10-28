"""roster_art.py: the monster roster's art (roster plan PR D; spec §13): 100 foes, 98 material icons, 39 own uniques, the
forget chip. Structure as gear_art.py (plan 5d).

  gen  [--batch=r0..r4] [--only=id,...] [--n=N] [--extra=TEXT]
                                         codex attempts, one at a time, until each job has N raws (R0 foes 2, else 1; cap 3)
  cand [--batch=..] [--only=..]          postprocess every raw attempt into work/<job>/cand/a<N>/ (scratch registry)
  pick --id JOB --attempt N [--part P] [--reopen]
                                         postprocess the chosen attempt into the registry (qa_passed / qa_failed, no runtime)
  note --id JOB --attempt N --reason R [--plain P]
                                         why an attempt was not used (registry `rejected_attempts`, `plain_reasons`)
  extend-cap --id JOB --extra N --by TEXT --review PATH
                                         a controller's cap extension (at most 3 more attempts, one per review; who and the date in
                                         --by, the review record it cites); gen counts it
  approve --batch r0 --by TEXT           R0 only: the USER's words and the date, after the review page (writes
                                         roster_style_approved and roster_style_anchor)
  approve --batch rN --review PATH [--review PATH ...]
                                         R1-R4 (ruling 21): independent fresh-context review records (one per review round)
                                         whose 通過 lines together cover every image's current sha256; no user approval is
                                         asked for or accepted
  publish --batch rN                     runtime, copy to public/, manifest, the round's ids into ROSTER_ART (data/monsters.ts)
                                         and the url count in render/artPaths.test.ts, all in the working tree
  plan-json                              write art-factory/starlantern/roster-plan.json (the exact lists per round)
  repair-outliers --id ASSET --with rN   a roster asset's pink outliers (key residue) repaired by postprocess only, recorded
                                         as a pending `repair`; reviewed, approved and published with round rN

Rounds (spec §13.5): r0 the style sample (5 foes, the R0+R1 icon sheet, the R0+R1 unique sheet, the forget chip), r1-r4 the
rest; the forget chip drawn with r0 is approved and published as its own round `forget` in E1c (ruling 27). Every asset belongs to the round of its owner (an R1 foe's icon drawn on the R0 sheet is published with R1), so a
published round always has a foe's sprite, its icon and its unique together. Run from the repo root.
"""
import datetime, json, os, re, shutil, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402
import portal as P  # noqa: E402
import gear_art as G  # noqa: E402
import g4_art as G4  # noqa: E402
from batch import ORIGINAL as CHAR_ORIGINAL, PIX, GEN  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
RAW = Path('C:/Users/bag57/art-refs/starlantern/raw')
PROMPTS = AF / 'prompts'
TOOLS = AF / 'tools'
WORK = AF / 'work'
REG_PATH = AF / 'registry.json'
PUBLIC = REPO / 'public'
PLAN_PATH = AF / 'roster-plan.json'
GAME = REPO / 'src/scripts/games/starlantern'
ENEMIES_TS = GAME / 'data/enemies.roster.ts'
MATERIALS_TS = GAME / 'data/materials.roster.ts'
GEAR_TS = GAME / 'data/gear.roster.ts'
MONSTERS_TS = GAME / 'data/monsters.ts'
ARTPATHS_TEST = GAME / 'render/artPaths.test.ts'
E2E_SPEC = REPO / 'tests/e2e/starlantern.spec.ts'   # its manifest count follows every publish (PR D review, Low 5)

CAP = 3   # contract: at most 3 codex attempts per id, then stop and report (never a substitute)

# --- the rounds (spec §13.5; plan table E1-E4) -----------------------------------------------------------------------------
ROUNDS = {
    'r0': ['paper-moth', 'root-hound', 'bell-watcher', 'false-moon', 'fog-warden'],
    'r1': ['lamp-wight', 'tin-soldier', 'dust-mimic', 'market-ghost', 'tongueless-bell', 'hollow-hunter', 'mist-twin', 'moon-crow',
           'sleepwalker', 'hoarder', 'silent-bell', 'hollow-champion', 'bell-warden'],
    'r2': ['old-city-sentinel', 'requiem-choir', 'lantern-larva', 'epitaph-golem', 'ancestor-automaton', 'ash-archivist',
           'wick-shade', 'keeper-echo', 'ember-maw', 'sorrow-crystal', 'deep-tendril',
           'music-box', 'paper-cranes', 'lost-shadow', 'returning-light', 'gilded-hoarder',
           'old-city-archon', 'gorged-beast', 'lantern-mother', 'forgotten-festival', 'starless-whale', 'stopped-clock', 'first-lantern',
           'archon-hand', 'toppled-automaton', 'requiem-conductor', 'lantern-brood'],
    'r3': ['cinder-imp', 'forge-hound', 'ash-mourner', 'mirage-dancer', 'sand-scorpion',
           'frost-doll', 'glacier-tortoise', 'snow-caller', 'ice-komainu', 'frozen-pilgrim',
           'thunder-kite', 'storm-totem', 'charge-jelly', 'star-ember', 'stolen-tome',
           'ember-tyrant', 'sandstorm-maw', 'mirage-city', 'rime-sovereign', 'white-silence', 'rift-maw',
           'thunder-roc', 'storm-conductor', 'starfire-colossus', 'mirage-lead', 'ice-shrine', 'burning-page', 'rime-pillar'],
    'r4': ['bog-mother', 'rot-lily', 'leech-knight', 'ashen-treant', 'spore-moth',
           'mirror-thief', 'veil-stalker', 'hush-acolyte', 'vault-mimic', 'debt-collector',
           'rivet-golem', 'siege-crab', 'herald-engine', 'fallen-knight', 'banner-bearer',
           'mire-hydra', 'grey-blight', 'bog-leviathan', 'faceless-host', 'vault-dragon', 'shadow-parade',
           'fortress-colossus', 'siege-titan', 'last-commander', 'grey-elder', 'locked-vault', 'gate-breaker'],
}
ROUND_OF = {e: r for r, ids in ROUNDS.items() for e in ids}

# --- the game's data (read, never written, except ROSTER_ART by publish) -----------------------------------------------------
_CACHE = {}


def roster_defs():
    """{id: {name, arch, rank, home, lore, remnant, band}} for the hundred roster foes, parsed from data/enemies.roster.ts (the
    lantern-mother is the lantern-eater in her own shape: a main-road boss)."""
    if 'defs' in _CACHE: return _CACHE['defs']
    src = ENEMIES_TS.read_text(encoding='utf-8')
    starts = [(m.start(), m.group(1)) for m in re.finditer(r"\['([a-z0-9-]+)', \{ name: ", src)]
    out = {}
    for (a, eid), (b, _) in zip(starts, starts[1:] + [(len(src), '')]):
        chunk = src[a:b]
        def f(k, chunk=chunk):
            m = re.search(rf"\b{k}: '([^']+)'", chunk); return m.group(1) if m else None
        out[eid] = {'name': f('name'), 'arch': f('arch'), 'rank': f('rank'), 'home': f('home'), 'lore': f('lore'), 'band': f('band'),
                    'remnant': 'remnant: true' in chunk}
    out['lantern-mother'] = {'name': '燈喰之母', 'arch': 'boss', 'rank': None, 'home': None, 'lore': None, 'band': None, 'remnant': False}
    _CACHE['defs'] = out
    return out


def cls_of(d):
    """The art class (spec §13.1): swarm, normal, heavy, warden (wardens and parts) or boss."""
    if d['arch'] == 'boss': return 'boss'
    if d['rank'] in ('warden', 'part'): return 'warden'
    return {'swarm': 'swarm', 'heavy': 'heavy'}.get(d['arch'], 'normal')


def _rows(path, pattern):
    return re.findall(pattern, path.read_text(encoding='utf-8'))


def materials():
    """{material id: owner foe} of the 98 roster materials (data/materials.roster.ts), in file order."""
    if 'mats' not in _CACHE:
        _CACHE['mats'] = {m: o for m, _, o in _rows(MATERIALS_TS, r"\['([a-z0-9-]+)', '([^']+)', '([a-z0-9-]+)', ")}
    return _CACHE['mats']


def material_names():
    return {m: n for m, n, _ in _rows(MATERIALS_TS, r"\['([a-z0-9-]+)', '([^']+)', '([a-z0-9-]+)', ")}


def uniques():
    """{unique id: {owner, slot, kind}} of the 39 own uniques (data/gear.roster.ts); kind is the weapon kind or None."""
    if 'uniq' not in _CACHE:
        rows = _rows(GEAR_TS, r"\['([a-z0-9-]+)', '([^']+)', '([a-z0-9-]+)', '(?:boss|elite)', '([a-z]+)', \[[^\]]*\], '[^']*'(?:, '([a-z]+)')?\]")
        _CACHE['uniq'] = {u: {'owner': o, 'slot': s, 'kind': k or None} for u, _, o, s, k in rows}
    return _CACHE['uniq']


def unique_names():
    return {u: n for u, n in _rows(GEAR_TS, r"\['([a-z0-9-]+)', '([^']+)', '[a-z0-9-]+', '(?:boss|elite)'")}


def _owner_map(d):
    return {o: k for k, o in d.items()}


class _Lazy(dict):
    def __init__(self, fn): super().__init__(); self.fn = fn
    def _load(self):
        if not dict.__len__(self): dict.update(self, self.fn())
    def __getitem__(self, k): self._load(); return dict.__getitem__(self, k)
    def __contains__(self, k): self._load(); return dict.__contains__(self, k)
    def get(self, k, d=None): self._load(); return dict.get(self, k, d)


MAT_OF = _Lazy(lambda: _owner_map(materials()))                              # owner foe -> its signature, trophy or keepsake
UNIQUE_OF = _Lazy(lambda: {v['owner']: u for u, v in uniques().items()})       # owner foe -> its own unique

# --- descriptions (spec §13.3; the rest from §5's names and traits, shown on the review page) --------------------------------
DESC = {
    # spec §13.3, verbatim
    'paper-moth': 'a small moth folded from an old yellowed letter, faded unreadable marks on its paper wings, a tiny wax-seal body',
    'bell-watcher': 'a hooded watcher in a long grey robe with only mist under the hood, a small dull bronze bell hanging at its belt, a short staff',
    'hollow-hunter': 'an empty suit of adventurer leather armour with a hood and nothing inside, holding a short sword, faint mist where the face should be',
    'ancestor-automaton': 'a tall old bronze automaton with a round glass eye and riveted plates, a mark on its chest shaped like a lantern, moss in its joints',
    'keeper-echo': 'a tall faceless figure in a long travelling cloak holding up a star lantern, translucent and pale gold',
    'deep-tendril': 'a pale glowing tendril rising from dark ground, ending in a lantern-shaped bud, faintly translucent',
    'mirage-dancer': 'a dancer-shaped figure made of rippling heat haze and bronze sequins, no face, one arm raised mid-twirl',
    'ice-komainu': 'a guardian lion-dog statue carved from blue ice, a cracked rope with paper streamers around its neck',
    'frozen-pilgrim': 'a pilgrim figure in straw cape and hat sealed inside a block of clear ice, only a silhouette visible',
    'star-ember': 'a floating blue-white star-shaped flame with tiny sparks, a cold core',
    'stolen-tome': 'a flying old spellbook with a star set into its cover, pages flapping like wings, no readable text',
    'ashen-treant': 'a grey dead tree creature with tiny arrow marks carved along its bark, roots like legs, a few green buds left',
    'vault-mimic': 'a heavy iron-banded treasure vault door with a huge padlock that opens like a hungry mouth, coins spilling',
    'debt-collector': 'a thin shadow in a long coat holding a lantern and a blank yellowed slip of paper, no face',
    'fallen-knight': "an empty dented knight's armour with a red tattered tabard, grey mist rising from the neck, a broken sword",
    'banner-bearer': 'an armoured shadow holding a tall pole with a torn red flag, mist instead of a face',
    'false-moon': 'a large floating crescent-and-full moon made of pale crystal, half of it dark, soft silver light',
    'bell-warden': 'a tall grey-robed gatekeeper of mist with a great bronze bell hanging from a yoke on its shoulders, faceless hood',
    'toppled-automaton': 'a huge old bronze automaton half collapsed on one knee, sparks in its joints, a lantern mark on its chest plate',
    'requiem-conductor': 'a tall marble figure in a ruined ceremonial robe raising a dusk-coloured baton, small hooded singers floating around it',
    'lantern-brood': 'a pulsing nest of pale lantern-shaped eggs on dark roots, faint glow inside each egg',
    'mirage-lead': 'a tall heat-haze dancer with flowing veils of light and a copper anklet, faceless, two faint mirror copies behind it',
    'ice-shrine': 'a small wooden shrine hall frozen inside a pillar of ice, a rope and paper streamers across its front, two ice lion-dogs at its steps',
    'burning-page': 'a single huge torn book page burning with blue-white star fire, no readable text, embers drifting',
    'grey-elder': 'an ancient grey tree with a hollow face-like knot, arrow marks carved in its bark, one glowing acorn among dead branches',
    'locked-vault': 'a giant locked vault with a starving thin frame, gold coins bulging from its seams, chains',
    'gate-breaker': 'a huge hunched shadow creature carrying a battering ram made of a tree trunk, climbing mist around its legs',
    'fog-warden': 'a towering gatekeeper of grey fog wearing heavy stone gate plates as armour, holding a great lantern halberd',
    'silent-bell': 'a colossal cracked bronze bell hanging from chains with a hollow mouth, violet runes, small bells orbiting it',
    'hollow-champion': 'a huge empty suit of heroic armour with many different swords stuck in its back like a fan, mist instead of a face',
    'old-city-archon': 'a seated colossal marble ruler statue with a gold star crown and a cracked face, no hands, glowing eyes',
    'archon-hand': 'a giant floating marble hand with gold rings and a glowing star in the palm',
    'gorged-beast': 'an enormous bloated lantern-devouring beast, dozens of swallowed lanterns glowing through its stretched hide',
    'lantern-mother': 'a vast dim shadow of a fading star lantern shaped like a veiled mother figure cradling a guttering light, sorrowful rather than monstrous',
    'forgotten-festival': 'a giant paper festival lantern float with a painted smiling mask, small paper lanterns orbiting, faded colours',
    'starless-whale': 'a huge whale swimming through dark mist, its body like a night sky with all the stars gone out',
    'stopped-clock': 'a giant brass clock heart with frozen hands and broken springs, gears floating around it',
    'first-lantern': 'a primitive ancient stone lantern on a pillar holding a small eternal flame, older and simpler than all others, carved with worn patterns',
    'ember-tyrant': 'a giant crowned figure made of burning city ruins and flame, holding a melted sceptre',
    'sandstorm-maw': 'a towering whirl of sand with a huge mouth of glassy teeth, bits of a caravan swirling inside',
    'mirage-city': 'a floating desert city of domes made of heat haze, half of it on fire, faint dancers on its walls',
    'rime-sovereign': 'a frozen queen-like figure sealed inside a tall ice throne, cold blue light',
    'rime-pillar': 'a tall jagged ice pillar with a faint glowing rune core',
    'white-silence': 'a vast white snow spirit with no features, a blizzard trailing from its sleeves',
    'rift-maw': 'a jagged crack in the air rimmed with ice, a dark maw inside, a spear stuck in the ice at its edge',
    'thunder-roc': 'a huge roc bird with storm-cloud feathers and lightning crackling across its wings',
    'storm-conductor': 'a tall figure of copper rods and storm clouds raising a lightning baton',
    'starfire-colossus': 'a colossus made of blue-white star fire and floating book pages, a star at its core',
    'mire-hydra': 'a swamp hydra with three heads of different sizes, rotting green scales, poison dripping',
    'grey-blight': 'a creeping mass of grey ash and fungus with pale spore pods around it, dead branches inside',
    'bog-leviathan': 'an enormous swamp maw rising from black water, moss-covered lips, small eyes',
    'faceless-host': 'a tall figure in a black coat whose face is a blank oval mirror, mirror shards orbiting it',
    'vault-dragon': 'a lean dragon coiled around a hoard of gold, coins embedded in its scales',
    'shadow-parade': 'a long procession of small shadow figures carrying lanterns, led by a tall masked shadow',
    'fortress-colossus': 'a walking fortress tower colossus with cannon arms and rivet plates',
    'siege-titan': 'a huge beast with iron-plated hide climbing out of fog, claws gripping a stone wall fragment',
    'last-commander': "an empty grand knight commander's armour with a red cape and a horn at its belt, mist rising from the collar",
    # the rest, from spec §5.3-§5.4 (names and traits)
    'lamp-wight': 'a small floating wisp of pale mist carrying a little brass hand lantern with a warm kind light, a short cloak trailing into vapour',
    'root-hound': 'a lean hound made of pale twisted mist roots and grey bark, glowing pale eyes, crouched low and ready to pounce, root tendrils trailing from its legs',
    'tin-soldier': 'a stout toy tin soldier grown to fighting size, a drum-shaped body of dented pale tin, a tall plumed hat, a wind-up key in its back and a small tin shield',
    'dust-mimic': 'an old dusty wooden storage crate with iron corners whose lid opens like a mouth of splintered teeth, cobwebs, two small eyes peeking from the gap',
    'market-ghost': 'a cheerful round ghost of market chatter, pale ivory vapour shaped like a stall keeper in an apron with a big open calling mouth, a small coin pouch',
    'tongueless-bell': 'a floating old bronze hand bell with no clapper inside, its mouth an empty dark hollow, faint pale lilac rings of soundless sound around it',
    'mist-twin': 'a small pale mist creature shaped like a fox kit with a long wispy tail and a thin glowing thread tied around its neck',
    'moon-crow': 'a crow whose feathers are small mirror plates reflecting pale moonlight, a silver beak, wings half spread',
    'sleepwalker': 'a big hulking sleeper in a long ivory nightgown and a floppy nightcap, eyes closed, arms stretched out in front, dream sand glittering from its sleeves',
    'old-city-sentinel': 'a heavy pale marble guardian statue in old-city armour with a tall stone shield, a carved sun disc on its chest, cracks and gold trim',
    'requiem-choir': 'three small floating hooded singers in grey robes holding blank sheets, mouths open in song, only mist under the hoods',
    'lantern-larva': 'a fat pale grub-like larva with a soft glowing lantern sac on its back and tiny mandibles, warm light showing through its skin',
    'epitaph-golem': 'a slow hulking golem built of stacked grey grave tablets with worn blank carvings, moss in the cracks, small glowing eyes',
    'ash-archivist': 'a thin floating scribe of grey ash in a tattered ivory robe, an ember quill and an open book whose pages crumble into ash, no readable text',
    'wick-shade': 'a small flickering shadow shaped like a candle wick with a tiny pale flame on its head and stubby arms',
    'ember-maw': 'a heavy round furnace-like creature of pale stone with a huge glowing mouth full of embers, cracks of warm light, short stubby legs',
    'sorrow-crystal': 'a floating cluster of pale lilac crystals shaped like a falling tear, small droplet shards orbiting it, soft inner light',
    'music-box': 'a wooden music box with its lid open, a tiny ivory dancer frozen mid-spin on top, brass comb teeth showing, small notes of light around it',
    'paper-cranes': 'a small flock of three folded paper cranes of ivory paper flying together, crisp creases, no writing',
    'lost-shadow': 'a child-sized grey shadow figure standing alone, its outline wavering like smoke, a loose thread of shadow trailing from one hand, no face',
    'returning-light': 'a gentle floating orb of warm pale gold light shaped like a lantern flame with two soft wing-like rays',
    'hoarder': 'a small round grey mouse carrying a bulging sack of shiny trinkets on its back, big round ears, bright eyes',
    'gilded-hoarder': 'a small round mouse covered in flaking gold leaf, carrying a bulging golden sack, big round ears, smug bright eyes',
    'cinder-imp': 'a small mischievous imp made of glowing cinders and black ash, tiny horns, a grin of embers',
    'forge-hound': 'a stocky hound with molten orange cracks in a dark iron hide, a forge glow in its throat, sparks at its paws',
    'ash-mourner': 'a tall thin figure in a grey mourning veil and long ash-coloured robes holding a small smoking censer, no face under the veil',
    'sand-scorpion': 'a large sand-gold desert scorpion with a curved glowing stinger and heavy pincers',
    'frost-doll': 'a heavy porcelain doll the size of a man with a cracked white face, an icy blue dress and frost creeping over its joints',
    'glacier-tortoise': 'a huge tortoise whose shell is a jagged glacier of blue ice, a stubborn old face, frost on its legs',
    'snow-caller': 'a slender snow spirit in a pale blue hooded cloak with long sleeves trailing snowflakes, cupping a glowing snowball',
    'thunder-kite': 'a small sharp-winged kite bird with slate-grey feathers and bright yellow lightning streaks along its wings',
    'storm-totem': 'a tall carved stone totem pillar banded with copper rings, a small lightning rod on top crackling with yellow sparks',
    'charge-jelly': 'a floating jellyfish of translucent indigo with bright yellow electric veins and dangling sparking tentacles',
    'bog-mother': 'a huge heap of dark swamp mud and moss with a wide mouth and small eyes, little slime blobs bubbling out of her sides',
    'rot-lily': 'a tall rotten lily with drooping olive petals and a sickly glowing green centre, roots in murky water',
    'leech-knight': 'a knight in armour of glossy dark green leech plates with a sucker-tipped lance and an olive cape',
    'spore-moth': 'a fat fuzzy moth with olive-green wings dusted with glowing spores, round pale spore sacs on its body',
    'mirror-thief': 'a slim thief of dark mirror shards in a hooded cloak, a reflected dagger in hand, its face a cracked mirror',
    'veil-stalker': 'a crouching stalker wrapped in layers of black veils with two curved daggers and cold violet glints, no face',
    'hush-acolyte': 'a small hooded acolyte in dark violet robes holding a tiny bell with its mouth tied shut, mist under the hood instead of a face',
    'rivet-golem': 'a heavy gunmetal golem of riveted steel plates with a round furnace eye, rust along the seams',
    'siege-crab': 'a massive armoured crab with siege-engine pincers of riveted iron and shell plates like a fortress wall',
    'herald-engine': 'a tall clockwork herald machine of brass and steel with a big brass horn for a head and a drum on its chest',
}

# --- the prompt (spec §13.3: batch.py's enemy sentence verbatim, then the roster's own sentences) ----------------------------
TALL = {'swarm': 'about 56 art pixels tall', 'normal': 'about 72 art pixels tall', 'heavy': 'about 84 art pixels tall',
        'warden': 'about 104 art pixels tall', 'boss': 'about 160 art pixels tall, filling much of the canvas'}
MAINLINE_PALETTE = ('Colour it in neutral, fairly light tones (greys, ivory, pale lilac, pale gold) with clear light and shadow, '
                    'never mostly dark, because the game recolours it for each region.')
REGION_PALETTE = {'blaze': 'warm reds, oranges and sand gold', 'frost': 'icy blues, white and pale cyan',
                  'storm': 'slate grey, indigo and bright electric yellow', 'mire': 'swamp greens, olive and murky brown',
                  'shade': 'deep violet, indigo and black with cold pale highlights, never pink or magenta',
                  'iron': 'gunmetal grey, steel blue and rust red'}
NO_FACE = 'It is a memory given shape, made of mist, light and material: no clear face and no recognisable real person.'
BOSS_REF = 'The second attached sprite is the approved boss of this game: match how its larger size carries more detail.'
R0_REF = 'The last attached sprite is an approved monster of this same new set: match its style most closely.'
SWARM = 'It is small and compact: three of them stand side by side in a fight.'
NO_FACE_IDS = {'lantern-mother', 'requiem-choir', 'requiem-conductor', 'ash-mourner', 'lost-shadow', 'veil-stalker'}


def _no_face(e, d):
    return d['remnant'] or e in NO_FACE_IDS


def enemy_prompt(e):
    d = roster_defs()[e]; c = cls_of(d)
    extra = ([BOSS_REF] if c in ('warden', 'boss') else []) + ([R0_REF] if ROUND_OF[e] != 'r0' else [])
    extra.append(MAINLINE_PALETTE if d['home'] is None else f"Colour it in its home region's palette: {REGION_PALETTE[d['home']]}.")
    if _no_face(e, d): extra.append(NO_FACE)
    if c == 'swarm': extra.append(SWARM)
    return (f'Pixel art monster sprite of {DESC[e]}, facing the viewer, full body. '
            'Match the art style, pixel density, outline and shading of the attached approved monster sprite. '
            f'16-bit JRPG battle sprite, {TALL[c]}, {PIX}. ' + ' '.join(extra) + ' '
            'Centred on a perfectly flat solid pure magenta #FF00FF background with empty space around it. No text, no ground shadow, no particles. '
            f'{CHAR_ORIGINAL}')


def R0_ANCHOR_OF(e):
    """The R0 foe whose approved sprite is attached last from R1 on (spec §13.3: one R0 sprite of the same kind)."""
    d = roster_defs()[e]; c = cls_of(d)
    if c == 'boss': return 'fog-warden'
    if c == 'warden': return 'false-moon'
    if c == 'swarm': return 'paper-moth'
    return 'bell-watcher' if _no_face(e, d) else 'root-hound'


# --- material icons and own uniques ----------------------------------------------------------------------------------------
UNREADABLE = 'blank, with only faint unreadable marks, no letters'
MAT_DESC = {
    'faded-letter': f'a folded old letter of yellowed paper with a red wax seal, {UNREADABLE}',
    'wight-wick': 'a short lantern wick with a pale blue-white flame', 'mist-root': 'a twisted pale grey root wrapped in a curl of mist',
    'tin-key': 'a brass wind-up key with a round bow', 'mimic-hinge': 'an old iron hinge with a splinter of dark wood still attached',
    'market-token': 'a round bronze market token with a punched hole, no letters', 'bell-shard': 'a curved shard of an old bronze bell with green patina',
    'hollow-buckle': 'a worn brown leather belt buckle with an empty iron frame', 'twin-thread': 'two pale silver threads twisted together into a loop',
    'mirror-feather': 'a long crow feather made of a polished mirror plate', 'grey-cord': 'a knotted loop of plain grey rope',
    'dream-sand': 'a small pile of glittering pale violet sand with a star sparkle', 'marble-shard': 'a chunk of white marble with a strip of gold trim',
    'hymn-sheet': f'a rolled sheet of music paper tied with a ribbon, {UNREADABLE}, no notes',
    'larva-glow': 'a soft round glowing sac of warm pale light', 'epitaph-stone': f'a chipped little grey grave tablet, {UNREADABLE}',
    'old-cog': 'an old bronze cog wheel with moss in its teeth', 'ash-ink': 'a small glass ink bottle of grey ash ink with a cork',
    'spent-wick': 'a burnt-out black candle wick curled in a tiny dish of wax', 'lantern-ash': 'a small heap of pale gold ash with one glowing ember',
    'ember-tooth': 'a big curved tooth glowing with ember cracks', 'sorrow-shard': 'a teardrop-shaped shard of pale lilac crystal',
    'pale-tendril': 'a curled pale glowing tendril tip like a sprout', 'music-comb': 'a small brass music-box comb with a row of tuned teeth',
    'crane-paper': 'a neat square of folded ivory paper with crease lines, no writing', 'shadow-thread': 'a small spool of dark grey shadow thread',
    'homeward-glow': 'a small bead of warm golden light inside a glass drop',
    'glitter-scrap': 'a little heap of shiny trinket scraps: a button, a bead and a twist of foil', 'gilded-scrap': 'a crumpled flake of shiny gold leaf',
    'cinder-dust': 'a small heap of glowing orange cinder dust', 'forge-slag': 'a lump of dark slag with molten orange veins',
    'mourning-veil': 'a folded grey lace mourning veil', 'mirage-sequin': 'a large bronze sequin shimmering with heat haze',
    'scorpion-stinger': 'a curved sand-gold scorpion stinger with a glowing drop', 'porcelain-chip': 'a white porcelain shard with a pale blue painted edge',
    'glacier-scute': 'a hexagonal shell plate of blue glacier ice', 'snow-voice': 'a smooth pale blue stone with ripple rings like an echo',
    'komainu-fang': 'a big curved fang of blue ice', 'prayer-rope': 'a short twisted straw shrine rope coated in ice with a white paper zigzag streamer',
    'kite-plume': 'a slate-grey feather with a bright yellow lightning stripe', 'copper-band': 'a thick copper ring band with rivets',
    'jelly-cell': 'a translucent indigo jelly sac with a yellow spark inside', 'blue-ember': 'a floating blue-white star-shaped ember',
    'torn-page': f'a torn old book page with a burnt corner, {UNREADABLE}', 'bog-peat': 'a dark brown block of peat with moss on top',
    'rot-petal': 'a drooping olive-green lily petal with a sickly glow', 'leech-plate': 'a glossy dark green armour plate shaped like a leech',
    'carved-bark': 'a slab of grey bark with small arrow-shaped carvings', 'spore-sac': 'a round pale spore pod with olive spots',
    'mirror-sliver': 'a sharp sliver of dark mirror glass with a violet glint', 'black-veil': 'a folded length of sheer black cloth',
    'hush-bell': 'a tiny silver bell tied shut with a dark ribbon', 'vault-lock': 'a heavy iron padlock with a big keyhole',
    'iou-slip': f'a small yellowed slip of paper folded once, {UNREADABLE}', 'rivet': 'a big steel rivet with a domed head',
    'crab-plate': 'a curved riveted iron crab shell plate', 'herald-horn': 'a small brass herald horn',
    'knight-crest': 'a dented steel crest badge with a red enamel field, no letters', 'red-pennant': 'a torn red cloth pennant on a short stick',
    # keepsakes
    'moon-silver': 'a small crescent of pale shining silver', 'tower-dust': 'a little glass vial of grey dust from an old bell tower',
    'automaton-core': 'a round bronze machine core with a glowing glass centre', 'copper-anklet': 'a thin copper anklet with tiny bells',
    'shrine-rope': 'a short thick braided straw shrine rope with a white paper zigzag streamer',
    'ash-page': f'the burnt corner of a book page, {UNREADABLE}', 'ashen-acorn': 'a grey ash-covered acorn with a tiny green sprout',
    'vault-coin': 'a large old gold coin stamped with a keyhole, no letters', 'gate-splinter': 'a long splinter of dark oak gate wood with an iron nail',
    # trophies
    'dusk-baton': "a conductor's baton of dusk-violet wood with a gold tip", 'brood-shell': 'a curved piece of pale glowing egg shell',
    'fog-gate-plate': 'a heavy grey stone armour plate wreathed in fog', 'silent-bronze': 'a thick chunk of cracked bronze with violet rune marks, no letters',
    'hundred-hilts': 'a bundle of several different sword hilts tied together', 'archon-gold': 'a broken piece of a gold star crown',
    'gorged-lantern': 'a dented little lantern with a faint light still inside', 'mother-light': 'a soft fading orb of pale lantern light in a dark veil',
    'festival-paper': 'a folded piece of faded red festival lantern paper, no writing', 'starless-ambergris': 'a smooth dark grey ambergris lump with no shine',
    'clock-spring': 'a coiled brass clock spring', 'first-flame': 'a tiny eternal flame in a rough stone cup',
    'tyrant-cinder': 'a crown-shaped glowing cinder', 'storm-glass': 'a swirl of sand fused into amber glass',
    'mirage-brick': 'a sand-gold brick shimmering with heat haze', 'rime-crown-shard': 'a spiked shard of a blue ice crown',
    'silence-snow': 'a perfectly round white snowball that does not melt', 'rift-ice': 'a jagged dark ice shard with a crack of darkness inside',
    'roc-plume': 'a huge storm-cloud grey plume with a lightning edge', 'conductor-rod': 'a copper lightning rod with a crackling tip',
    'starfire-core': 'a blue-white star fire core in a small cage', 'hydra-scale': 'a big rotten-green serpent scale',
    'blight-ash': 'a small heap of grey blight ash with pale spores', 'leviathan-tooth': 'a huge mossy fang from a swamp maw',
    'blank-mirror': 'a small oval mirror reflecting nothing', 'dragon-gold': 'a dragon scale of solid gold with a coin stuck in it',
    'parade-lantern': 'a small black paper procession lantern with a pale light, no writing', 'colossus-bolt': 'a giant steel bolt with a hex head',
    'titan-hide': 'a rolled piece of iron-plated beast hide', 'commander-medal': 'a worn bronze commander medal on a red ribbon, no letters',
}
UNIQUE_DESC = {
    'moonless-mirror': 'a round hand mirror carried as a small shield, its silver face showing a pale moon that is not in the sky',
    'unrung-clapper': 'a pendant made of a bronze bell clapper on a grey cord',
    'ancestor-gauntlet': 'a pair of chunky bronze machine gauntlets with small cogs at the knuckles side by side',
    'requiem-staff': "a long dusk-violet conductor's staff topped with a gold baton tip and a small white ribbon",
    'brood-lantern': 'a pendant lantern made of a pale glowing egg shell',
    'last-dance-veil': "a flowing turquoise and copper dancer's veil robe with tiny bells along its hem",
    'ninety-nine-steps': 'a pair of sturdy stone-grey boots whose soles are carved like shrine steps, tied with red cord',
    'starbound-tome': 'a closed spellbook bound shut by bands of starlight with a star on its cover, no text',
    'arrowmark-bow': 'a grey wooden longbow covered in small carved arrow marks with a green leaf charm',
    'hungry-purse': 'a ring shaped like a tiny gold purse with an open mouth',
    'gatewarden-shield': 'a heavy dark oak gate-plank shield with iron bands, battered but unbroken',
    'fog-halberd': 'a long halberd with a grey stone axe blade and a small lantern hanging under the blade, fog curling around it',
    'silent-chime': 'a pendant of a small cracked bronze bell with violet runes, no letters',
    'borrowed-blade': 'a straight sword whose hilt is wrapped in several different mismatched grips',
    'archon-crown': 'a pale marble crown with a gold star in front, chipped',
    'glutton-gauntlet': 'a pair of chunky gauntlets shaped like fanged beast maws side by side',
    'cradled-light': 'a pendant cradling a tiny warm light in two curved silver hands',
    'festival-mask': 'a painted smiling festival mask of red and white paper with a tassel',
    'whale-song-ring': 'a dark blue ring with a tiny whale tail curling around a pearl',
    'still-hand-boots': 'a pair of brass-trimmed boots with a small stopped clock face on each ankle, no numbers',
    'first-lantern-staff': 'a rough stone staff topped with a tiny eternal flame in a stone cup',
    'burning-crown-ring': 'a ring shaped like a tiny burning crown',
    'sand-veil-boots': 'a pair of sand-gold wrapped boots with flowing veils at the ankles',
    'troupe-drum': 'a round turquoise and gold hand drum with ribbons',
    'everwinter-veil': 'a pale blue ice-lace robe with frost patterns',
    'snowmute-ring': 'a silver ring set with a white snowflake crystal',
    'sealing-spear': 'a long spear with a pale ice blade wrapped in old paper charm strips, no writing',
    'roc-feather-boots': 'a pair of boots with big storm-grey feathers at the heels',
    'conductor-ring': 'a copper ring with a tiny lightning rod jewel',
    'starfire-tiara': 'a silver tiara with a blue-white star flame in front',
    'hydra-fang': f'{G.STUBBY_DAGGER}, its blade a green serpent fang with two grooves',
    'greenward-cloak': 'a leaf-green hooded forest cloak with a wooden clasp',
    'bog-ring': 'a heavy dark green stone ring with moss',
    'faceless-mask': 'a smooth blank oval mask of dark mirror with no features',
    'gilded-mail': 'a chunky front-facing gold-plated breastplate with coin-shaped scales',
    'parade-boots': 'a pair of soft black boots with small lantern charms',
    'colossus-gauntlet': 'a pair of chunky gunmetal gauntlets with big rivets side by side',
    'wallclimber-boots': 'a pair of iron-spiked climbing boots',
    'red-horn': 'a small red-lacquered war horn on a cord',
}
GEAR_DESC = {k: f'{v}, with {G.UNIQUE_TONE}' for k, v in UNIQUE_DESC.items()}

ICON_SHEET = (
    'A 5 by 4 grid of twenty small square pixel art RPG crafting material icons separated by thick flat pure magenta #FF00FF gutters, '
    'with a wide magenta margin around the grid; nothing touches the image edges. Each icon sits alone on magenta and every icon has '
    'the same size, about 28 by 28 art pixels: one bold readable object filling its square, with a crisp dark outline, two or three '
    'hard-edged shading tones and a bright highlight from the upper left. In this order, left to right, top to bottom: {listing}. '
    'Match the drawing style, scale, outline, shading and palette of the attached approved equipment sheet (the style anchor) and of '
    'the attached approved material icons from the same game (shown enlarged). 16-bit JRPG item icon style, ' + PIX + '. '
    'No text, no numbers, no letters, no frames, no badge or circle behind the item. ' + G.ORIGINAL)
MAT_REF_IDS = ['essence-common', 'essence-magic', 'essence-rare', 'essence-legendary', 'star-tear', 'king-scale',
               'blaze-core', 'frost-heart', 'storm-stone', 'mire-gland', 'shade-crystal', 'iron-shard']   # 5d's approved materials


def mat_ref():
    """raw/roster-refs/mat-icons-x8.png (outside the repo): the twelve published 5d material icons in a row, enlarged x8."""
    return RAW / 'roster-refs' / 'mat-icons-x8.png'


def make_mat_ref(out=None, public=None):
    from PIL import Image
    out = Path(out or mat_ref()); src = Path(public or PUBLIC) / A.BASE.strip('/') / 'icon'
    ims = [Image.open(src / f'{m}.png').convert('RGBA') for m in MAT_REF_IDS]
    h = max(i.height for i in ims); sheet = Image.new('RGB', (sum(i.width + 4 for i in ims) * 8, h * 8 + 64), (255, 0, 255))
    x = 16
    for i in ims:
        big = i.resize((i.width * 8, i.height * 8), Image.NEAREST); sheet.paste(big, (x, 32 + (h - i.height) * 8), big); x += big.width + 32
    out.parent.mkdir(parents=True, exist_ok=True); sheet.save(out)
    return out


# --- the forget chip (ruling 22: G4's small icon tool, as the ailment icons) -------------------------------------------------
CHIP = (12, 14)                       # G4 full set: chip icons are 14 x 14, long edge 12
FORGET = 'ail-forget'
FORGET_ASSET = f'icon-{FORGET}-{CHIP[1]}'
# Controller ruling 27 (2026-10-26): drawn with R0, but the game only lists it once B9 adds `forget` to AilmentShown, so it is
# its own round: approved on an independent review record and published in E1c, with `forget` added to AILMENT_ICON_IDS.
FORGET_ROUND = 'forget'
FORGET_COLOUR = '#8FD9B6'             # misty sea green, the art's colour; the game's label is AILMENT_FILL.forget #66B87E (B2, spec §0 17, 19)
FORGET_DESC = (f'one soft round thought cloud in misty sea green {FORGET_COLOUR} with a thick dark diagonal band wiping across it, '
               'as if the thought were being erased')
CHIP_PROMPT = ('One small square pixel art status ailment icon, alone on a perfectly flat pure magenta #FF00FF background with a wide '
               f'magenta margin; nothing touches the image edges. The icon: {FORGET_DESC}. ' + G4.CHIP_RULES + G4.FULL_CHIP_RULES +
               G4.FULL_REFS + '16-bit JRPG status icon style, ' + PIX + '. No text, no numbers, no frames, no badge or circle behind '
               'the symbol. ' + G.ORIGINAL)

# --- story species (spec §4.2): the review page lists each one's gate and what must never be drawn ---------------------------
_FACE = '清楚可辨認的臉（故人只是霧、光與材質構成的輪廓）'
_CHAR = '任何夥伴本人（不附立繪）'
STORY = {
    'false-moon': ('mem:selene:2 → mem:selene:3', ['滿月、新月的字樣或符號', '瑟蕾本人']),
    'bell-watcher': ('act3', ['凜、鐘守（凜的師父）', '刺客的武器或代號記號', _FACE]),
    'bell-warden': ('act3', ['凜', '石門、出口的畫面', _FACE]),
    'hush-acolyte': ('act3', ['凜', _FACE]),
    'hollow-hunter': ('不需閘門', [_FACE + '（空殼裡只有霧）']),
    'hollow-champion': ('不需閘門', [_FACE + '（空殼裡只有霧）']),
    'ancestor-automaton': ('mem:bobby:4', ['燈芯機構、閥', '波比本人']),
    'toppled-automaton': ('mem:bobby:4', ['燈芯機構、閥', '波比本人']),
    'old-city-sentinel': ('act4', ['艾斯特拉的文字或紋章字樣']),
    'requiem-choir': ('act4', ['艾斯特拉的文字', '可讀的歌譜', _FACE]),
    'requiem-conductor': ('act4', ['艾斯特拉的文字', _FACE]),
    'old-city-archon': ('act4', ['艾斯特拉的文字或紋章字樣']),
    'keeper-echo': ('act4 → mem:hero:9', ['劍', '燈鑰', '洛恩本人', _FACE]),
    'lantern-larva': ('finale', ['燈喰之母本人']),
    'deep-tendril': ('finale', ['燈喰之母本人']),
    'lantern-brood': ('finale', ['燈喰之母本人']),
    'gorged-beast': ('finale', ['燈喰之母本人']),
    'lantern-mother': ('finale', [_FACE, '怪物化的獠牙（她是熄滅中的燈，悲傷而不是兇惡）']),
    'mirage-dancer': ('mem:safira:1', ['莎菲拉本人', '團長', _FACE]),
    'mirage-lead': ('mem:safira:1', ['莎菲拉本人', '團長', _FACE]),
    'mirage-city': ('mem:safira:5', ['團長', '牆上舞者的臉']),
    'sand-scorpion': ('mem:safira:5', ['莎菲拉本人']),
    'sandstorm-maw': ('mem:safira:5', ['莎菲拉本人', '商隊裡的人臉']),
    'ice-komainu': ('不需閘門', ['千鶴本人', '鈴']),
    'frozen-pilgrim': ('不需閘門', ['千鶴本人', _FACE + '（冰裡只看得到輪廓）']),
    'ice-shrine': ('mem:chizuru:4', ['千鶴本人', '鈴']),
    'rift-maw': ('mem:chizuru:2', ['千鶴本人', '鈴']),
    'star-ember': ('不需閘門', ['諾艾兒本人']),
    'stolen-tome': ('不需閘門', ['可讀的文字', '諾艾兒本人']),
    'burning-page': ('mem:noel:3 → mem:noel:4', ['可讀的文字', '老師本人', '商人']),
    'starfire-colossus': ('不需閘門', ['可讀的文字', '諾艾兒本人']),
    'ashen-treant': ('mem:sylvie:1', ['希爾薇本人']),
    'grey-elder': ('mem:sylvie:5', ['希爾薇本人', '人臉（只是像臉的樹瘤）']),
    'grey-blight': ('mem:sylvie:2', ['希爾薇本人']),
    'vault-mimic': ('mem:liz:4', ['道具店、露米亞、歐里克的任何標記', '莉茲本人']),
    'locked-vault': ('mem:liz:3', ['道具店、露米亞、歐里克的任何標記', '莉茲本人']),
    'debt-collector': ('mem:liz:2', ['道具店、露米亞、歐里克的任何標記', '紙條上的字（紙條是空白的）', _FACE]),
    'fallen-knight': ('mem:scarlet:2', ['公主', '撤退的姿態', '絲嘉蕾本人', _FACE]),
    'banner-bearer': ('不需閘門', ['公主', '撤退的姿態', '絲嘉蕾本人', _FACE]),
    'gate-breaker': ('mem:scarlet:3', ['公主', '絲嘉蕾本人']),
    'siege-titan': ('不需閘門', ['公主', '絲嘉蕾本人']),
    'last-commander': ('mem:scarlet:5', ['公主', '撤退的姿態、吹號撤退', '絲嘉蕾本人', _FACE]),
}

# --- jobs ---------------------------------------------------------------------------------------------------------------------
def _ref(eid):
    return RAW / f'enemy-{eid}' / f'enemy-{eid}-a1.png'   # the approved legacy sprites' raws (plan 2)


def _chunks(seq, n):
    """`seq` in n chunks as even as possible, in order (the first ones one longer): two sheets a round, not sheets of two."""
    q, extra = divmod(len(seq), n); out = []; i = 0
    for c in range(n):
        size = q + (c < extra); out.append(seq[i:i + size]); i += size
    return [c for c in out if c]


def icon_sheets():
    """{sheet id: (round, 20 parts)}: R0+R1's 18 materials on sheet 1 (two empty slabs), then each later round's on two sheets."""
    out = {'sheet-icons-roster-1': ('r0', [MAT_OF[o] for o in ROUNDS['r0'] + ROUNDS['r1']] + [None, None])}
    k = 2
    for r in ('r2', 'r3', 'r4'):
        for chunk in _chunks([MAT_OF[o] for o in ROUNDS[r] if o in MAT_OF], 2):
            out[f'sheet-icons-roster-{k}'] = (r, chunk + [None] * (20 - len(chunk))); k += 1
    return out


def gear_sheets():
    """{sheet id: (round, 6 parts)}: 3 x 2 sheets as gear_art's sheet-gear-8; R0+R1's five uniques on sheet 1."""
    out = {'sheet-gear-roster-1': ('r0', [UNIQUE_OF[o] for o in ROUNDS['r0'] + ROUNDS['r1'] if o in UNIQUE_OF] + [None])}
    k = 2
    for r in ('r2', 'r3', 'r4'):
        for chunk in _chunks([UNIQUE_OF[o] for o in ROUNDS[r] if o in UNIQUE_OF], 2):
            out[f'sheet-gear-roster-{k}'] = (r, chunk + [None] * (6 - len(chunk))); k += 1
    return out


def jobs():
    """Every roster job. Foes: kind sprite, the legacy slime (and the lantern-eater for wardens and bosses) attached, from R1 on
    an approved R0 sprite of the same kind too (`r0_anchor`, resolved at gen time). Sheets: icons 5 x 4, uniques 3 x 2, the
    forget chip one piece."""
    defs = roster_defs(); out = []
    for r, ids in ROUNDS.items():
        for e in ids:
            c = cls_of(defs[e])
            out.append(dict(id=f'enemy-{e}', kind='sprite', batch=r, owner=e, cls=c, height=A.ROSTER_HEIGHT[c], parts=[e],
                            images=[_ref('slime')] + ([_ref('lanterneater')] if c in ('warden', 'boss') else []),
                            r0_anchor=None if r == 'r0' else R0_ANCHOR_OF(e), prompt=enemy_prompt(e)))
    for sid, (r, parts) in icon_sheets().items():
        out.append(dict(id=sid, kind='icon-sheet', batch=r, cols=5, rows=4, parts=parts, images=[G.GEAR_ANCHOR, mat_ref()], r0_anchor=None,
                        prompt=ICON_SHEET.format(listing=G._listing(parts, MAT_DESC))))
    for sid, (r, parts) in gear_sheets().items():
        out.append(dict(id=sid, kind='gear-sheet', batch=r, cols=3, rows=2, parts=parts, images=[G.GEAR_ANCHOR, G.ICONS_OLD], r0_anchor=None,
                        prompt=G.GEAR_SHEET.format(cols=3, rows=2, n=6, listing=G._listing(parts, GEAR_DESC), refs=G.REFS_MAIN)))
    out.append(dict(id='sheet-ail-roster-1', kind='chip-sheet', batch='r0', cols=1, rows=1, parts=[FORGET], r0_anchor=None,
                    images=[G4.SAMPLE_RAWS['sheet-g4-ailment-sample'], G.GEAR_ANCHOR], prompt=CHIP_PROMPT))
    return out


def job_by_id(sid):
    return next(j for j in jobs() if j['id'] == sid)


def assets_of(job, part):
    if part is None: return []
    if job['kind'] == 'sprite': return [f'enemy-{part}']
    if job['kind'] == 'gear-sheet': return [f'gear-{part}-large', f'gear-{part}']
    if job['kind'] == 'chip-sheet': return [FORGET_ASSET]
    return [f'icon-{part}']


def KIND_OF(aid):
    if aid.startswith('enemy-'): return 'roster-sprite'
    if aid == FORGET_ASSET: return 'skill-cell'
    if aid.startswith('gear-'): return 'roster-gear'
    return 'roster-icon'


def round_of(aid):
    """The round an asset is approved and published with: its owner foe's (the forget chip: its own, ruling 27)."""
    if aid == FORGET_ASSET: return FORGET_ROUND
    if aid.startswith('enemy-'): return ROUND_OF[aid[len('enemy-'):]]
    if aid.startswith('icon-'): return ROUND_OF[materials()[aid[len('icon-'):]]]
    u = aid[len('gear-'):]; u = u[:-len('-large')] if u.endswith('-large') else u
    return ROUND_OF[uniques()[u]['owner']]


def label(rnd):
    if rnd not in ROUNDS and rnd != FORGET_ROUND: raise ValueError(f'batch must be one of {list(ROUNDS) + [FORGET_ROUND]}')
    return f'roster-{rnd}'


def batch_assets(rnd):
    label(rnd)
    return list(dict.fromkeys(a for j in jobs() for p in j['parts'] for a in assets_of(j, p) if round_of(a) == rnd))


def runtime(aid):
    b = A.BASE
    if aid.startswith('enemy-'): return f'{b}enemy/{aid[len("enemy-"):]}.png'
    if aid.startswith('gear-'): return f'{b}gear/{aid[len("gear-"):]}.png'
    return f'{b}icon/{aid[len("icon-"):]}.png'


def _registry():
    return A.Registry(REG_PATH)


def images_for(job, reg):
    """What codex gets for a job: its fixed references, and from R1 on the approved R0 sprite of the same kind (last)."""
    imgs = list(job['images'])
    if job.get('r0_anchor'):
        anchor = (reg.data.get('roster_style_anchor') or {}).get(job['r0_anchor'])
        if not reg.data.get('roster_style_approved') or not anchor:
            raise PermissionError('roster_style_approved is missing: the user has not approved the R0 style sample yet')
        imgs.append(Path(anchor))
    return imgs


# --- generation ---------------------------------------------------------------------------------------------------------------
def attempts(sid):
    files = [p for p in (RAW / sid).glob(f'{sid}-a*.png') if not p.stem.endswith('-magenta') and re.fullmatch(rf'{re.escape(sid)}-a\d+', p.stem)]
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def selected(argv):
    """The jobs a command works on: --only lists exact job ids (never prefixes: `sheet-icons-roster-1` once matched -10 and
    up), --batch a round; an unknown id stops before anything runs."""
    only = G._opt(argv, 'only'); batch = G._opt(argv, 'batch')
    if batch: label(batch)
    ids = [o for o in only.split(',') if o] if only else None
    known = {j['id'] for j in jobs()}
    if ids is not None and (bad := [o for o in ids if o not in known]): raise ValueError(f'unknown job id {bad} (--only takes exact ids)')
    return [j for j in jobs() if (ids is None or j['id'] in ids) and (not batch or j['batch'] == batch)]


CAP_EXTRA_MAX = 3   # controller rulings 2026-10-26/27 (R1 reviews): at most 3 more attempts per extension, one per review record


def extend_cap(reg, sid, extra, by, review):
    """Record a controller's cap extension for job `sid` (registry `cap_extensions`): `by` names who and the date, `review`
    the review record it cites. At most CAP_EXTRA_MAX more attempts per extension, and one extension per review record."""
    job_by_id(sid)
    if not DATE.search(by or ''): raise ValueError('--by needs who and the date (YYYY-MM-DD)')
    if not review: raise ValueError('--review: the review record the extension cites')
    past = reg.data.get('cap_extensions', {}).get(sid, [])
    if int(extra) < 1 or int(extra) > CAP_EXTRA_MAX: raise ValueError(f'a cap extension is at most {CAP_EXTRA_MAX} more attempts')
    if any(x['review'] == str(review) for x in past): raise ValueError(f'{sid} was already extended on {review}: a new extension cites a new review')
    reg.data.setdefault('cap_extensions', {}).setdefault(sid, []).append({'extra': int(extra), 'by': by, 'review': str(review)})
    reg._save()


def cap_of(reg, sid):
    return CAP + sum(x['extra'] for x in reg.data.get('cap_extensions', {}).get(sid, []))


def extend_cap_cli(argv):
    extend_cap(_registry(), G._arg(argv, '--id'), G._arg(argv, '--extra'), G._arg(argv, '--by'), G._arg(argv, '--review'))


QUOTA_WORDS = ('usage limit', 'rate limit', 'quota', 'out of credits', 'insufficient credits', 'purchase more credits')


def _quota_hit(sid, k):
    log = RAW / sid / f'{sid}-a{k}.codex.log'
    text = log.read_text(encoding='utf-8', errors='replace').lower() if log.is_file() else ''
    return next((w for w in QUOTA_WORDS if w in text), None)


def gen(argv):
    """Codex attempts, one call at a time, until each selected job has N raws (R0 foes 2, else 1; --n overrides); never past
    CAP. Refuses any R1-R4 job before the R0 style is approved. Stops at the first call that gives no image (a usage limit
    or a failed call) and says which."""
    n_opt = G._opt(argv, 'n'); extra = G._opt(argv, 'extra', '')
    reg = _registry(); todo = selected(argv)
    later = [j['id'] for j in todo if j['batch'] != 'r0']
    if later and not reg.data.get('roster_style_approved'):
        raise PermissionError(f'roster_style_approved is missing (the user has not approved the R0 style sample); refusing {later[:5]}...')
    for job in todo:
        n = int(n_opt) if n_opt else (2 if job['kind'] == 'sprite' and job['batch'] == 'r0' else 1)
        imgs = images_for(job, reg)
        if G.GEAR_ANCHOR in imgs: G.make_anchor(G._registry())          # always from the recorded 5d anchor, never a stale file
        if mat_ref() in imgs and not mat_ref().exists(): make_mat_ref()
        missing = [str(p) for p in imgs if not Path(p).exists()]
        if missing: print(f'[skip] {job["id"]}: missing reference {missing}', flush=True); continue
        while len(attempts(job['id'])) < n:
            have = attempts(job['id'])
            cap = cap_of(reg, job['id'])
            if len(have) >= cap: raise PermissionError(f'{job["id"]} is at its attempt cap a{cap}; stop and report (never a substitute)')
            k = max([int(p.stem.rsplit('-a', 1)[1]) for p in have] + [0]) + 1
            PROMPTS.mkdir(parents=True, exist_ok=True)
            pf = PROMPTS / f'{job["id"]}.txt'
            pf.write_text(job['prompt'].strip() + ((' ' + extra) if extra else '') + ' ' + GEN + '\n', encoding='utf-8')
            argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(RAW / job['id']), '--name', f'{job["id"]}-a{k}.png',
                     '--prompt-file', str(pf)]
            for im in imgs: argv2 += ['--image', str(im)]
            start = time.time()
            g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
            print(f'[gen {job["id"]} a{k}] rc={g.returncode} {g.stdout.strip()[-200:]}', flush=True)
            if (RAW / job['id'] / f'{job["id"]}-a{k}.png').exists():
                import party
                fixed = party.recover(RAW / job['id'], f'{job["id"]}-a{k}.png', start, time.time())
                if fixed: print(f'[recovered {job["id"]} a{k}] codex saved {fixed}', flush=True)
            else:
                hit = _quota_hit(job['id'], k)
                print(f'[no output] {job["id"]} a{k}' + (f': codex says "{hit}" (quota)' if hit else '') + '; stopping', flush=True)
                return False
    return True


# --- postprocess --------------------------------------------------------------------------------------------------------------
def process_attempt(reg, job, raw, workdir, parts=None):
    """Postprocess one raw attempt into finals and QA. Returns {registry id: qa}."""
    from PIL import Image
    workdir = Path(workdir); workdir.mkdir(parents=True, exist_ok=True)
    img = Image.open(raw).convert('RGB')
    if job['kind'] == 'sprite':
        d = roster_defs()[job['owner']]
        return {job['id']: A.process_roster_sprite(reg, job['id'], img, workdir, raw, cls_of(d), d['home'] is None)}
    if job['kind'] == 'chip-sheet':   # one piece (its parts may not share a column run): the whole raw is the cell
        res = A.process_skill_cell(reg, FORGET, img, workdir, raw, tab=CHIP, tree=CHIP)
        for aid, q in res.items():
            q['interior_holes'] = G4.interior_holes(Path(workdir) / f'{aid}.png')
            if q['interior_holes'] > G4.HOLE_MAX and 'interior erased' not in q['reasons']: q['reasons'].append('interior erased')
            q['pass'] = not q['reasons']
            (Path(workdir) / f'{aid}.qa.json').write_text(json.dumps(q, indent=2), encoding='utf-8')
            reg.set(aid, qa=q, status='qa_passed' if q['pass'] else 'qa_failed')
        return res
    out = {}
    for cell, part in zip(P.sheet_cells(img, job['cols'], job['rows']), job['parts']):
        if part is None or (parts and part not in parts): continue
        if job['kind'] == 'gear-sheet':
            u = uniques()[part]
            out.update(A.process_roster_gear_cell(reg, part, cell, workdir, raw, slot=u['slot'], kind=u['kind'], large=G.LARGE, icon=G.ICON))
        else:
            out[f'icon-{part}'] = A.process_roster_icon(reg, f'icon-{part}', cell, workdir, raw)
    return out


def cand(argv):
    for job in selected(argv):
        for raw in attempts(job['id']):
            k = raw.stem.rsplit('-a', 1)[1]; wd = WORK / job['id'] / 'cand' / f'a{k}'
            reg = A.Registry(wd / 'cand-registry.json')
            try:
                res = process_attempt(reg, job, raw, wd)
            except ValueError as e:
                print(f'[cand {job["id"]} a{k}] FAILED: {e}', flush=True); continue
            for aid, q in res.items():
                nums = {x: q.get(x) for x in ('height', 'width', 'colours', 'lum', 'erased', 'size') if x in q}
                print(f'[cand {job["id"]} a{k}] {aid}: {"pass" if q["pass"] else q["reasons"]} {nums}'
                      + (f' warn {q["warnings"]}' if q.get('warnings') else ''), flush=True)


def do_pick(reg, sid, k, part=None, allow_reopen=False):
    """Pick attempt a<k> of job `sid` (one part or all): QA runs again under the current spec, every time. Approved parts
    need --reopen (their round's approval goes stale); a published part is never re-picked here."""
    job = job_by_id(sid)
    if part and part not in job['parts']: raise ValueError(f'{part} is not a part of {sid}')
    targets = [a for p in job['parts'] if p is not None and (not part or p == part) for a in assets_of(job, p)]
    status = {a: reg.data['assets'].get(a, {}).get('status') for a in targets}
    published = [a for a in targets if status[a] == 'published']
    if published:
        raise PermissionError(f'{published} are published; swapping a published roster image is a separate step (not built in PR D)')
    locked = [a for a in targets if status[a] == 'approved']
    if locked and not allow_reopen: raise PermissionError(f'{locked} are approved; pass --reopen to take them back to review')
    raw = RAW / sid / f'{sid}-a{k}.png'
    if not raw.is_file(): raise FileNotFoundError(raw)
    today = datetime.date.today().isoformat()
    for a in locked:   # the round must be reviewed and approved again before anything of it is published
        e = reg.data['assets'][a]; e.setdefault('history', []).append({k2: e[k2] for k2 in ('status', 'approved_by', 'chosen_attempt') if k2 in e} | {'reopened_on': today})
        e.pop('approved_by', None)
        rec = reg.data.get('approved_batches', {}).pop(label(round_of(a)), None)
        if rec: reg.data.setdefault('stale_approvals', []).append({**rec, 'batch': label(round_of(a)), 'stale_on': today, 'because': f'{a} reopened'})
    if locked: reg._save()
    res = process_attempt(reg, job, raw, WORK / sid, parts=[part] if part else None)
    for aid in res:   # never `runtime`: publish writes it
        reg.set(aid, chosen_attempt=f'a{k}', source_id=sid, batch=label(round_of(aid)))
    return res


def pick(argv):
    res = do_pick(_registry(), G._arg(argv, '--id'), G._arg(argv, '--attempt'), G._arg(argv, '--part'), allow_reopen='--reopen' in argv)
    print(json.dumps({a: (q['pass'], q['reasons']) for a, q in res.items()}, ensure_ascii=False))
    return res


def note(argv):
    sid, k, reason, plain = G._arg(argv, '--id'), G._arg(argv, '--attempt'), G._arg(argv, '--reason'), G._arg(argv, '--plain')
    reg = _registry(); e = reg.data['assets'].setdefault(sid, {})
    reg.set(sid, rejected_attempts={**e.get('rejected_attempts', {}), f'a{k}': reason})
    if plain: reg.set(sid, plain_reasons={**e.get('plain_reasons', {}), f'a{k}': plain})


# --- repair-outliers (controller ruling 2026-10-28) -----------------------------------------------------------------------------
REPAIR_RULE = ('pink_outlier key residue only: each such pixel takes the rounded per-channel median of its opaque 8-neighbours '
               '(sl_art.repair_pink_outliers), its alpha kept; no other pixel changes')
COLOUR_REASONS = ('magenta residue', 'magenta spill', 'too flat to tint', 'too dark to tint')


def regate(entry, img):
    """Every roster gate that reads colour, run again on a repaired final under the current stamp. The repair keeps the
    alpha, so the alpha-only numbers of the entry's QA (size, height band, holes, edge, semi alpha, erased, the gear sizes
    and mass) carry over unchanged."""
    import copy
    kind = entry.get('kind'); q = copy.deepcopy(entry.get('qa') or {})
    q['reasons'] = [r for r in q.get('reasons', []) if r not in COLOUR_REASONS]
    q['residue'] = A.alpha_qa(img)['residue']
    if q['residue'] > entry.get('allow_residue', 0): q['reasons'].append('magenta residue')
    q['magenta_spill'] = A.magenta_spill_count(img)
    if q['magenta_spill'] > entry.get('allow_magenta_spill', A.MAGENTA_SPILL_MAX): q['reasons'].append('magenta spill')
    if kind == 'roster-sprite':
        q['reasons'] += [r for r in A.lum_range(img, bool(entry.get('mainline'))) if r not in q['reasons']]
        q.update(colours=A.palette_count(img), lum=list(A.lum_stats(img)), palette_over=bool(A.palette_max(img)))
    q['pass'] = not q['reasons']
    A.roster_key_tint_gate(q, img)
    q['pass'] = not q['reasons']; q['spec'] = A.qa_spec(kind)
    return q


def _final_ref(path):
    """A final as the registry names it (as _save_final does): repo relative when it is inside the repo, else absolute."""
    path = Path(path).resolve(); repo = A.ROOT.parents[1].resolve()
    return path.relative_to(repo).as_posix() if path.is_relative_to(repo) else str(path)


def repair_outliers(reg, aid, publish_with):
    """Repair a roster asset's pink outliers (key residue) as a deterministic postprocess of its current final, for review
    and publishing with round `publish_with`. Writes work/repair/<aid>.png and records registry `repair` (old and new
    sha256, every pixel, the rule, the colour gates run again under the current stamp, status pending). The asset's own
    final, runtime, status and QA do not change until that round publishes. A pixel with too few opaque neighbours is
    reported and nothing is recorded; an asset with no outlier is refused. Running it again changes nothing."""
    from PIL import Image
    import numpy as np
    label(publish_with)
    e = reg.data['assets'].get(aid)
    if not e or not str(e.get('batch', '')).startswith('roster-') or not e.get('final'): raise ValueError(f'{aid} is not a picked roster asset')
    src = A._final_path(e['final']); img = Image.open(src).convert('RGBA')
    new, fixed, skipped = A.repair_pink_outliers(img)
    if skipped: raise PermissionError(f'{aid}: pink outliers with fewer than {A.REPAIR_MIN_NEIGHBOURS} opaque neighbours, not repaired: {skipped}')
    if not fixed: raise ValueError(f'{aid}: no pink outlier to repair')
    a, b = np.asarray(img), np.asarray(new); changed = int((a != b).any(axis=-1).sum())
    if not (a[..., 3] == b[..., 3]).all() or changed != len(fixed): raise RuntimeError(f'{aid}: the repair changed more than its pixels')
    out = WORK / 'repair' / f'{aid}.png'; out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + '.tmp'); new.save(tmp, format='PNG')
    if out.is_file() and out.read_bytes() == tmp.read_bytes(): tmp.unlink()
    else: os.replace(tmp, out)
    rec = {'from_sha256': sha256(src), 'to_sha256': sha256(out), 'final': _final_ref(out),
           'pixels': [{'x': x, 'y': y, 'from': list(o), 'to': list(n)} for x, y, o, n in fixed], 'skipped': [],
           'changed_pixels': changed, 'rule': REPAIR_RULE, 'postprocess_only': True, 'publish_with': publish_with,
           'qa': regate(e, new)}
    old = e.get('repair')
    if old and all(old.get(k) == v for k, v in rec.items()): return old
    rec.update(status='pending', date=datetime.date.today().isoformat())
    e['repair'] = rec; reg._save()
    return rec


def repair_outliers_cli(argv):
    rec = repair_outliers(_registry(), G._arg(argv, '--id'), G._arg(argv, '--with'))
    print(json.dumps({k: rec[k] for k in ('from_sha256', 'to_sha256', 'final', 'pixels', 'changed_pixels', 'status')}, ensure_ascii=False))
    print('qa', json.dumps({k: rec['qa'].get(k) for k in ('pass', 'reasons', 'pink_outlier', 'bright_key', 'key_tint_inside', 'spec')}))


def repairs_with(reg, rnd):
    """{asset: its repair record} for every recorded repair that is reviewed and published with round `rnd`."""
    return {a: e['repair'] for a, e in reg.data['assets'].items() if (e.get('repair') or {}).get('publish_with') == rnd}


# --- approval and publishing ----------------------------------------------------------------------------------------------------
def shown_path(rnd):
    return WORK / 'review' / f'roster-{rnd}-shown.json'


def sha256(path):
    return G.sha256(path)


DATE = re.compile(r'\d{4}-\d{2}-\d{2}')


REVIEW_LINE = re.compile(r'^- (\S+) ([0-9a-f]{64}) 通過$')


def review_passes(text):
    """The images an independent review record passes: {asset id: sha256}, from lines of exactly `- <id> <sha256> 通過`
    (PR D review, Medium 2). Free text may stand on other lines, but a line that starts with `- ` in any other form (another
    verdict, a negation such as 未通過 or 通過？否, words after 通過) is returned in the second value and refuses the round."""
    passed, bad = {}, []
    for ln in text.splitlines():
        if not ln.startswith('- '): continue
        m = REVIEW_LINE.match(ln)
        if m and m.group(1) not in passed: passed[m.group(1)] = m.group(2)
        else: bad.append(ln)   # another form, or a second verdict for the same image (confirmation review nit)
    return passed, bad


def repo_path(path):
    """A file under the art factory as the repo names it (`art-factory/starlantern/...`), never an absolute worktree path."""
    return 'art-factory/starlantern/' + Path(path).resolve().relative_to(WORK.parent.resolve()).as_posix()


def review_copy(rnd):
    """Where approve keeps the R1-R4 review record, committed with the approval (PR D review, Medium 3)."""
    return WORK / 'review' / f'roster-{rnd}-review.md'


def do_approve(reg, rnd, by=None, review=None):
    """R0: the USER's approval of the style sample (their words and the date in `by`). R1-R4 (ruling 21) and the forget
    chip (ruling 27): an independent fresh-context review record (`review`) whose lines `- <id> <sha256> 通過` cover every
    asset of the round; no user words are asked for or taken. The record is kept at work/review/roster-<round>-review.md
    with its sha256.

    Either way approval is tied to what was shown: every asset of the round picked, QA passed under the current spec, and
    its final still the bytes the review page recorded (and, for R1-R4, the bytes the review passed). Any miss refuses the
    whole round and changes nothing."""
    lab = label(rnd)
    reviews = [review] if isinstance(review, (str, Path)) else list(review or [])   # several records: one per review round
    if rnd == 'r0':
        if reviews: raise ValueError('R0 is the style sample: only the user approves it (--by with their words and the date), never a review record')
        if not by or not DATE.search(by) or not DATE.sub('', by).strip(' :：,，;；-—'):
            raise ValueError("--by must quote the user's approval and carry its date (YYYY-MM-DD)")
    else:
        if by: raise ValueError('R1-R4 are approved on an independent review record (--review), not on the user\'s words (ruling 21)')
        if not reg.data.get('roster_style_approved'):
            raise PermissionError('roster_style_approved is missing: the user has not approved the R0 style sample yet')
        if not reviews or any(not Path(r).is_file() for r in reviews): raise PermissionError(f'no independent review record at {review}')
    sp = shown_path(rnd)
    if not sp.exists(): raise PermissionError(f'no review page record for {rnd} ({sp}); build and show the review page first')
    shown = json.loads(sp.read_text(encoding='utf-8')).get('parts', {})
    passed, bad = {}, []   # {asset: every sha256 a record passes}: an asset passes when its current bytes are among them
    for r in reviews:
        ok, wrong = review_passes(Path(r).read_text(encoding='utf-8')); bad += wrong
        for a, h in ok.items(): passed.setdefault(a, set()).add(h)
    aids = batch_assets(rnd); problems = {}
    if not shown: problems['nothing was shown'] = [rnd]
    if bad: problems['review lines not in the form "- <id> <sha256> 通過"'] = bad
    for aid in aids:
        e = reg.data['assets'].get(aid, {}); f = A._final_path(e['final']) if e.get('final') else None
        if not e.get('chosen_attempt') or f is None or not f.is_file(): problems.setdefault('not picked', []).append(aid); continue
        if e.get('status') not in ('qa_passed', 'approved'): problems.setdefault(f'status {e.get("status")}', []).append(aid); continue
        if A.qa_stale(e): problems.setdefault('QA recorded under an older spec (pick it again)', []).append(aid); continue
        h = sha256(f)
        if h != shown.get(aid): problems.setdefault('changed since (or missing from) the review page', []).append(aid)
        elif reviews and h not in passed.get(aid, ()): problems.setdefault('not passed by the independent review (id, sha256, 通過)', []).append(aid)
    reps = {a: r for a, r in repairs_with(reg, rnd).items() if r.get('status') != 'published'}
    for aid, rep in reps.items():
        e = reg.data['assets'][aid]; f = A._final_path(rep['final'])
        if not f.is_file() or sha256(f) != rep['to_sha256']: problems.setdefault('repair file changed since it was recorded', []).append(aid)
        elif sha256(A._final_path(e['final'])) != rep['from_sha256']: problems.setdefault('repair made from another file', []).append(aid)
        elif not rep['qa'].get('pass') or rep['qa'].get('spec') != A.qa_spec(e.get('kind')): problems.setdefault('repair QA', []).append(aid)
        elif not reviews or rep['to_sha256'] not in passed.get(aid, ()):
            problems.setdefault('repair not passed by the independent review (id, sha256, 通過)', []).append(aid)
    if problems: raise PermissionError(f'refusing to approve {rnd}: {problems}')
    today = datetime.date.today().isoformat()
    rec = {'date': today, 'record': repo_path(sp), 'shown': {a: sha256(A._final_path(reg.data['assets'][a]['final'])) for a in aids}}
    if reviews:
        kept = []
        for i, r in enumerate(reviews):
            k = review_copy(rnd) if i == 0 else review_copy(rnd).with_name(f'roster-{rnd}-review-{i + 1}.md')
            k.parent.mkdir(parents=True, exist_ok=True)
            if Path(r).resolve() != k.resolve(): shutil.copyfile(r, k)
            kept.append(k)
        rec.update({'review': repo_path(kept[0]), 'review_sha256': sha256(kept[0])})
        if len(kept) > 1: rec['reviews'] = [{'record': repo_path(k), 'sha256': sha256(k)} for k in kept]
        who = f'independent review {", ".join(repo_path(k) for k in kept)} ({today})'
    else:
        rec['by'] = by; who = by
    done = []
    for aid in aids:
        e = reg.data['assets'][aid]
        if e['status'] == 'qa_passed': e['status'] = 'approved'; e['approved_by'] = who; done.append(aid)
    if reps: rec['repairs'] = {a: r['to_sha256'] for a, r in reps.items()}
    for r in reps.values(): r['status'] = 'approved'
    reg.data.setdefault('approved_batches', {})[lab] = rec
    if rnd == 'r0':
        reg.data['roster_style_approved'] = today
        reg.data['roster_style_anchor'] = {e: reg.data['assets'][f'enemy-{e}']['raw'] for e in ROUNDS['r0']}
    reg._save()
    return done


ART_RE = re.compile(r'(export const ROSTER_ART: ReadonlySet<string> = new Set<string>\(\[)(.*?)(\]\);)', re.S)
COUNT_RE = re.compile(r'expect\(urls\)\.toHaveLength\((\d+)\);')


def _read_keep_eol(path):
    raw = Path(path).read_bytes(); crlf = b'\r\n' in raw
    return raw.decode('utf-8').replace('\r\n', '\n'), crlf


def _write_keep_eol(path, text, crlf):
    Path(path).write_bytes((text.replace('\n', '\r\n') if crlf else text).encode('utf-8'))


def roster_art_ids(path=None):
    text, _ = _read_keep_eol(path or MONSTERS_TS); m = ART_RE.search(text)
    if not m: raise ValueError(f'ROSTER_ART not found in {path or MONSTERS_TS}')
    return re.findall(r"'([a-z0-9-]+)'", m.group(2))


def _art_set_text(ids, width=118):
    if not ids: return ''
    lines, cur = [], '  '
    for i in ids:
        item = f"'{i}',"
        if len(cur) + len(item) + 1 > width and cur.strip(): lines.append(cur.rstrip()); cur = '  '
        cur += item + ' '
    lines.append(cur.rstrip())
    return '\n' + '\n'.join(lines) + '\n'


def add_roster_art(ids, path=None):
    path = path or MONSTERS_TS; text, crlf = _read_keep_eol(path)
    have = roster_art_ids(path); new = have + [i for i in ids if i not in have]
    text = ART_RE.sub(lambda m: m.group(1) + _art_set_text(new) + m.group(3), text, count=1)
    _write_keep_eol(path, text, crlf)
    return new


def bump_art_count(add, note, path=None):
    """artPaths.test.ts: the url total + `add`, with a comment line saying what was added (its line endings kept)."""
    path = path or ARTPATHS_TEST; text, crlf = _read_keep_eol(path)
    m = COUNT_RE.search(text)
    if not m or f'expect(new Set(urls).size).toBe({m.group(1)});' not in text: raise ValueError(f'the url total is not where it was in {path}')
    old = int(m.group(1)); new = old + add
    line_start = text.rfind('\n', 0, m.start()) + 1; indent = text[line_start:m.start()]
    text = text[:line_start] + f'{indent}// + {note} = {new}\n' + text[line_start:]
    text = text.replace(f'expect(urls).toHaveLength({old});', f'expect(urls).toHaveLength({new});', 1)
    text = text.replace(f'expect(new Set(urls).size).toBe({old});', f'expect(new Set(urls).size).toBe({new});', 1)
    _write_keep_eol(path, text, crlf)
    return new


E2E_RE = re.compile(rb'([ \t]*)expect\(manifest\.length\)\.toBe\((\d+)\);(\r?\n)')


def url_totals():
    """(the url total in artPaths.test.ts, the manifest count in the e2e spec): publish moves both by the same amount."""
    a = COUNT_RE.search(_read_keep_eol(ARTPATHS_TEST)[0]); b = E2E_RE.search(E2E_SPEC.read_bytes())
    if not a or not b: raise ValueError('a url total is not where it was (artPaths.test.ts, tests/e2e/starlantern.spec.ts)')
    return int(a.group(1)), int(b.group(2))


def bump_e2e_count(add, note, path=None):
    """The e2e spec's manifest count + `add`, with a comment line; byte-level, so that file's mixed line endings stay as
    they are (the new lines take the ending of the line they stand before)."""
    path = Path(path or E2E_SPEC); raw = path.read_bytes(); m = E2E_RE.search(raw)
    if not m: raise ValueError(f'the manifest count is not where it was in {path}')
    indent, old, eol = m.group(1), int(m.group(2)), m.group(3); new = old + add
    line = indent + f'// + {note} = {new}'.encode('utf-8') + eol + indent + f'expect(manifest.length).toBe({new});'.encode('utf-8') + eol
    path.write_bytes(raw[:m.start()] + line + raw[m.end():])
    return new


def do_publish(reg, rnd, public=None):
    """Publish an approved round, all or nothing (PR D review, Low 7): every asset of it must be approved and still the
    approved bytes, and the game files must be where they were, before anything moves. Each file is copied to a temp name
    next to its runtime path; only when every copy has landed are they renamed into place, and only then do the registry,
    the manifest, ROSTER_ART (data/monsters.ts) and the url counts (render/artPaths.test.ts, the e2e manifest count)
    change. A failed copy leaves no file and no temp behind. A retry after success publishes nothing and changes nothing
    (returns []). Everything stays in the working tree for the implementer to commit."""
    public = Path(public or PUBLIC); lab = label(rnd)
    rec = reg.data.get('approved_batches', {}).get(lab)
    if not rec: raise PermissionError(f'round {rnd} has no current approval; build its review page and approve it first')
    shown = rec.get('shown') if isinstance(rec.get('shown'), dict) else {}
    aids = batch_assets(rnd); problems = {}; todo = []
    for aid in aids:
        e = reg.data['assets'].get(aid, {}); f = A._final_path(e['final']) if e.get('final') else None
        if e.get('status') not in ('approved', 'published'): problems.setdefault(f'status {e.get("status")}', []).append(aid); continue
        if f is None or not f.is_file(): problems.setdefault('final file missing', []).append(aid); continue
        if shown.get(aid) != sha256(f): problems.setdefault('changed since (or missing from) the approval', []).append(aid); continue
        if e['status'] == 'published':   # an earlier publish of this round: it must be exactly what was approved
            dst = public / e.get('runtime', '').lstrip('/')
            if e.get('runtime') != runtime(aid) or not dst.is_file() or sha256(dst) != shown[aid]:
                problems.setdefault('published file is not the approved one', []).append(aid)
            continue
        todo.append(aid)
    rep_todo = []
    for aid, rep in repairs_with(reg, rnd).items():
        if rep.get('status') == 'published': continue
        e = reg.data['assets'][aid]; f = A._final_path(rep['final']); dst = public / str(e.get('runtime', '')).lstrip('/')
        if rep.get('status') != 'approved' or (rec.get('repairs') or {}).get(aid) != rep['to_sha256']:
            problems.setdefault('repair not approved with this round', []).append(aid)
        elif not f.is_file() or sha256(f) != rep['to_sha256']: problems.setdefault('repair file changed since its approval', []).append(aid)
        elif e.get('status') != 'published' or not dst.is_file() or sha256(dst) != rep['from_sha256']:
            problems.setdefault('the published file is not the one the repair was made from', []).append(aid)
        else: rep_todo.append(aid)
    try:
        roster_art_ids(); url_totals()
    except (ValueError, OSError) as err:
        problems.setdefault('cannot update the game files', []).append(str(err))
    if problems: raise PermissionError(f'refusing to publish {rnd}; nothing was published: {problems}')
    if not todo and not rep_todo: return []
    staged = []
    try:
        for aid in todo:
            dst = public / runtime(aid).lstrip('/'); dst.parent.mkdir(parents=True, exist_ok=True)
            tmp = dst.with_name(dst.name + '.publishing'); staged.append((tmp, dst))
            shutil.copyfile(A._final_path(reg.data['assets'][aid]['final']), tmp)
        for aid in rep_todo:
            dst = public / reg.data['assets'][aid]['runtime'].lstrip('/')
            tmp = dst.with_name(dst.name + '.publishing'); staged.append((tmp, dst))
            shutil.copyfile(A._final_path(reg.data['assets'][aid]['repair']['final']), tmp)
    except BaseException:
        for tmp, _ in staged:
            if tmp.exists(): tmp.unlink()
        raise
    for tmp, dst in staged: os.replace(tmp, dst)
    for aid in todo:
        reg.data['assets'][aid].update(runtime=runtime(aid), status='published')
    today = datetime.date.today().isoformat()
    for aid in rep_todo:   # the repaired bytes replace the published ones: final, QA and the owner round's approved hash follow
        e = reg.data['assets'][aid]; rep = e['repair']
        e.setdefault('history', []).append({'final': e['final'], 'final_sha256': rep['from_sha256'], 'qa': e.get('qa'),
                                            'replaced_on': today, 'by': f'repair-outliers, published with {lab}'})
        e['final'] = rep['final']; e['qa'] = rep['qa']; rep.update(status='published', published_on=today)
        own = reg.data.get('approved_batches', {}).get(e['batch'])
        if own is not None:
            if isinstance(own.get('shown'), dict): own['shown'][aid] = rep['to_sha256']
            own.setdefault('repaired', {})[aid] = {'from': rep['from_sha256'], 'to': rep['to_sha256'], 'with': lab}
    reg._save(); reg.write_manifest(public)
    if not todo: return []
    if ROUNDS.get(rnd): add_roster_art(ROUNDS[rnd])
    foes = sum(a.startswith('enemy-') for a in todo); icons = sum(a.startswith('icon-') and a != FORGET_ASSET for a in todo)
    gear = sum(a.startswith('gear-') and not a.endswith('-large') for a in todo)
    who = rec.get('by') or f'independent review {rec.get("date")}'
    note = (f'roster {rnd.upper()} ({who}): {foes} foes, {icons} material icons, {gear} own uniques x 2'
            + (', the forget chip' if FORGET_ASSET in todo else ''))
    bump_art_count(len(todo), note); bump_e2e_count(len(todo), note)
    return todo


def approve(argv):
    reviews = [argv[i + 1] for i, a in enumerate(argv) if a == '--review' and i + 1 < len(argv)]   # --review may repeat
    print(json.dumps(do_approve(_registry(), G._arg(argv, '--batch'), by=G._arg(argv, '--by'), review=reviews or None), ensure_ascii=False))


def publish(argv):
    print(json.dumps(do_publish(_registry(), G._arg(argv, '--batch')), ensure_ascii=False))


def plan_data():
    defs = roster_defs(); js = jobs()
    return {'rounds': {r: list(ids) for r, ids in ROUNDS.items()},
            'classes': {e: cls_of(defs[e]) for r in ROUNDS.values() for e in r},
            'heights': dict(A.ROSTER_HEIGHT),
            'sheets': {j['id']: list(j['parts']) for j in js if j['kind'] != 'sprite'},
            'batches': {j['id']: j['batch'] for j in js},
            'materials': dict(materials()), 'uniques': {u: v['owner'] for u, v in uniques().items()},
            'story': sorted(STORY)}


def plan_json(argv):
    PLAN_PATH.write_text(json.dumps(plan_data(), indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    print(PLAN_PATH)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    {'gen': gen, 'cand': cand, 'pick': pick, 'note': note, 'extend-cap': extend_cap_cli, 'approve': approve, 'publish': publish,
     'plan-json': plan_json, 'repair-outliers': repair_outliers_cli}[cmd](sys.argv[2:])
