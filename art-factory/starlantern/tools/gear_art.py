"""gear_art.py: plan 5d art (gear, materials, tree skills, rarity frames, the forge), with the 2026-10-19 addendum.

  gen  [--only=prefix,...] [--n=2] [--batch=sample|main-gear|skills] [--extra=TEXT]
                                         generate codex attempts (one at a time) until each sheet has N raw attempts
  cand [--only=prefix,...]               postprocess every raw attempt into work/<sheet>/cand/a<N>/ (scratch registry)
  pick --id SHEET --attempt N [--part P] postprocess the chosen attempt into the registry (qa_passed / qa_failed, no runtime)
  note --id SHEET --attempt N --reason R record why an attempt was not chosen (registry `rejected_attempts`)
  approve --batch B --by TEXT            after the USER approved the batch on its review page: qa_passed -> approved
  silhouettes                            derive the 18 silhouettes from approved icons (status approved, `derived from`)
  publish --batch B                      write runtime, copy to public/, retire replaced base icons, rewrite the manifest
  plan-json                              write art-factory/starlantern/gear-plan.json (cross-checked by gearArt.test.ts)

Batches (addendum S3): `sample` (the style: 34 parts since addendum 2), `main-gear` (127 parts), `skills` (78 icons). Every batch needs the
user's approval on its review page before `approve` and `publish` (addendum S4); `gen` refuses the later batches until
the sample is approved (`style_approved` at the registry root). Run from the repo root.
"""
import datetime, json, re, shutil, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402
import portal as P  # noqa: E402
from batch import JP, ORIGINAL as CHAR_ORIGINAL  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
RAW = Path('C:/Users/bag57/art-refs/starlantern/raw')
PROMPTS = AF / 'prompts'
TOOLS = AF / 'tools'
WORK = AF / 'work'
REG_PATH = AF / 'registry.json'
PUBLIC = REPO / 'public'
PLAN_PATH = AF / 'gear-plan.json'
GEN, PIX = P.GEN, P.PIX
ORIGINAL = 'The design must be original and not resemble any existing game item.'

BATCHES = ('sample', 'main-gear', 'skills')
FRAME_SHEET_ID = 'sheet-rarity-frames-2'   # addendum 2: 4 x 2 (the six tier frames, the inner glow, the starlit overlay)
SAMPLE = ('sheet-gear-1', 'sheet-mat-1', FRAME_SHEET_ID, 'scene-forge', 'npc-forge')
LARGE, ICON = (56, 64), (22, 26)        # gear: (longer side exactly, canvas) for the large image and the bag icon (addendum 2 §1)
ICON_HEIGHT = 32                        # materials and skills: the contract's icon row (--height 32)
NPC_HEIGHT = 180
SCENE_SIZE = P.SCENE_SIZE

# Addendum 2 §2: the tier colours (frame hue QA; the game's text colours follow plan 5g) and the starlit light.
RARITY_PALETTE = {'common': '#c9c9d4', 'magic': '#3f7fff', 'rare': '#ffe03a', 'epic': '#8a5cff', 'legendary': '#ff7a14',
                  'unique': '#d8283a', 'set': '#3fd05a'}
STARLIT = ('#e8fbff', '#7fe6ff')
GLOW_HUE = A.GLOW_HUE                   # 35: soft pale yellow-orange light
FRAMED_RARITIES = [r for r in RARITY_PALETTE if r != 'common']   # common has no frame


def _hex_rgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


FRAME_HUE = {r: round(A.band_hue([_hex_rgb(RARITY_PALETTE[r])])) for r in FRAMED_RARITIES}
# Provisional art ids (addendum 2 §3; plan 5g owns the final contract): a rename is this one table, and runtime()
# derives the public path from the id (`ui-<x>` -> ui/<x>.png).
FRAME_ASSET = {**{r: f'ui-rarity-{r}' for r in FRAMED_RARITIES}, 'glow-legendary': 'ui-glow-legendary', 'starlit': 'ui-starlit'}
# (role, size, slice, pad) for nine_slice; the glow is a 12 x 12 ring padded to 16 x 16 so it sits inside the slot.
FRAME_ROLE = {'glow-legendary': ('glow', 16, 5, 2), 'starlit': ('overlay', 16, 5, 0)}


def frame_role(part):
    return FRAME_ROLE.get(part, ('frame', 16, 5, 0))


def frame_defringe(part):
    # UI frames use the strong defringe (contract), except a tier whose own colour lies within its reach of the key:
    # epic #8A5CFF is 117 from magenta, so the strong pass would peel the 2 px band from the outside in.
    c = RARITY_PALETTE.get(part)
    near = c is not None and bool(A._near_magenta(A.np.array([_hex_rgb(c)]), A.STRONG_DEFRINGE).any())
    return 'default' if near else 'strong'


def ref(rel):
    """Reference copies outside the repo (raw/<...>), as plan 4 keeps them."""
    return RAW / rel


ICONS_OLD = ref('portal-refs/icons-old-x8.png')       # the approved icons, nearest-upscaled x8 (plan 4)
GEAR_ANCHOR = ref('gear-refs/gear-anchor.png')        # the approved sheet-gear-1 raw at half size (made by `gen`)
CROPS = AF / 'reference/crops'                        # the eight lineup crops (palette and weapon of each owner)

# --- the gear sheets (plan 5d "工作表"); sets stay on one sheet so their colours and crest match -----------------------
GEAR_SHEETS = {
    'sheet-gear-1': ['iron-sword', 'wooden-buckler', 'leather-cap', 'lg-chizuru', 'blaze-heart-sword', 'iron-unbroken-shield',
                     'set-blaze-weapon', 'set-blaze-body', 'set-blaze-hands'],
    'sheet-gear-2': ['wooden-staff', 'hunter-bow', 'thorn-spear', 'crystal-blade', 'frost-staff', 'star-saber', 'crystal-aegis',
                     'scale-helm', 'cloth-gloves'],
    'sheet-gear-3': ['thorn-gauntlets', 'straw-sandals', 'bat-boots', 'cloth-robe', 'leather-vest', 'scale-mail', 'dusk-mantle',
                     'moss-charm', 'bat-earring'],
    'sheet-gear-4': ['crystal-pendant', 'gear-ring', 'copper-ring', 'star-ring', 'lg-noel', 'lg-liz', 'lg-sylvie', 'lg-scarlet',
                     'lg-selene'],
    'sheet-gear-5': ['lg-safira', 'lg-bobby', 'frost-bloom-neck', 'storm-thunder-bow', 'mire-whisper-gloves', 'shade-silent-blade',
                     'iron-bulwark-plate', 'blaze-ember-ring', 'frost-winter-staff'],
    'sheet-gear-6': ['set-blaze-ring', 'set-frost-weapon', 'set-frost-head', 'set-frost-neck', 'set-frost-ring', 'set-storm-weapon',
                     'set-storm-hands', 'set-storm-feet', 'set-storm-ring'],
    'sheet-gear-7': ['set-mire-head', 'set-mire-body', 'set-mire-feet', 'set-mire-neck', 'set-shade-weapon', 'set-shade-head',
                     'set-shade-hands', 'set-shade-feet', 'storm-swift-boots'],
    'sheet-gear-8': ['set-iron-offhand', 'set-iron-head', 'set-iron-body', 'set-iron-feet', 'mire-miasma-mask', 'shade-raven-cloak'],
}
GEAR_GRID = {'sheet-gear-8': (3, 2)}

# The set slots (data/gear.ts SET_DEFS) and the first piece of each set, which stands for the set in the codex.
SET_SLOTS = {
    'set-blaze': ['weapon', 'body', 'hands', 'ring'], 'set-frost': ['weapon', 'head', 'neck', 'ring'],
    'set-storm': ['weapon', 'hands', 'feet', 'ring'], 'set-mire': ['head', 'body', 'feet', 'neck'],
    'set-shade': ['weapon', 'head', 'hands', 'feet'], 'set-iron': ['offhand', 'head', 'body', 'feet'],
}
SET_FIRST = {sid: f'{sid}-{slots[0]}' for sid, slots in SET_SLOTS.items()}
# The slot of every gear cell (data/equipment.ts and data/gear.ts; gearArt.test.ts cross-checks gear-plan.json `slots`):
# the size gate's short-edge floor and mass band follow it (sl_art.SUBJECT_CLASS).
GEAR_SLOT = {
    'wooden-staff': 'weapon', 'iron-sword': 'weapon', 'hunter-bow': 'weapon', 'thorn-spear': 'weapon', 'crystal-blade': 'weapon',
    'frost-staff': 'weapon', 'star-saber': 'weapon', 'cloth-robe': 'body', 'leather-vest': 'body', 'scale-mail': 'body',
    'dusk-mantle': 'body', 'moss-charm': 'neck', 'bat-earring': 'neck', 'crystal-pendant': 'neck', 'gear-ring': 'ring',
    'wooden-buckler': 'offhand', 'crystal-aegis': 'offhand', 'leather-cap': 'head', 'scale-helm': 'head', 'cloth-gloves': 'hands',
    'thorn-gauntlets': 'hands', 'straw-sandals': 'feet', 'bat-boots': 'feet', 'copper-ring': 'ring', 'star-ring': 'ring',
    'lg-noel': 'ring', 'lg-chizuru': 'weapon', 'lg-liz': 'weapon', 'lg-sylvie': 'offhand', 'lg-scarlet': 'neck', 'lg-selene': 'head',
    'lg-safira': 'feet', 'lg-bobby': 'hands',
    'blaze-heart-sword': 'weapon', 'blaze-ember-ring': 'ring', 'frost-winter-staff': 'weapon', 'frost-bloom-neck': 'neck',
    'storm-thunder-bow': 'weapon', 'storm-swift-boots': 'feet', 'mire-miasma-mask': 'head', 'mire-whisper-gloves': 'hands',
    'shade-silent-blade': 'weapon', 'shade-raven-cloak': 'body', 'iron-unbroken-shield': 'offhand', 'iron-bulwark-plate': 'body',
    **{f'{sid}-{slot}': slot for sid, slots in SET_SLOTS.items() for slot in slots},
}
# data/gear.ts regionSpecials(): each region's legendary and unique (the portal card lists them; unowned ones show a silhouette).
REGION_LIMITED = ('blaze-heart-sword', 'blaze-ember-ring', 'frost-winter-staff', 'frost-bloom-neck', 'storm-thunder-bow',
                  'storm-swift-boots', 'mire-miasma-mask', 'mire-whisper-gloves', 'shade-silent-blade', 'shade-raven-cloak',
                  'iron-unbroken-shield', 'iron-bulwark-plate')

# --- descriptions ------------------------------------------------------------------------------------------------------
BASE_TONE = 'plain everyday materials, low saturation, no glow'
# Addendum 2: every subject gets the same long edge, so a short blade is told apart by proportion, not by length.
STUBBY_DAGGER = 'a stubby dagger: a short broad blade and a large hilt, clearly stubbier in proportion than a sword'
LEGEND_TONE = 'a few small hard-edged bright orange ember highlights'
UNIQUE_TONE = 'fine gold filigree'
GEAR_BASE = {
    'wooden-staff': 'a plain wooden staff with a knotted head and a leather-wrapped grip, no gem',
    'iron-sword': 'a plain iron straight sword with a simple cross guard and a leather-wrapped grip',
    'hunter-bow': 'a plain wooden hunting bow with a taut string and a leather grip',
    'thorn-spear': 'a long spear with a wooden shaft wrapped in dark green thorny vines and an iron leaf-shaped head',
    # Addendum S5: the hero's weapon mastery follows these kinds, so they must read as a dagger and a scimitar at 24 px.
    'crystal-blade': f'{STUBBY_DAGGER}, with a pale blue crystal blade and a plain iron hilt',
    'frost-staff': 'a wooden staff topped with a pale ice-crystal shard bound in iron wire',
    'star-saber': 'a scimitar with a strongly curved single-edged steel blade etched with a faint star pattern and a brass guard',
    'cloth-robe': 'a plain undyed cloth robe with wide sleeves and a rope belt',
    'leather-vest': 'a plain brown leather vest with stitched seams and two buckles',
    'scale-mail': 'a sleeveless body armour of overlapping teal lizard scales on leather',
    'dusk-mantle': 'a hooded mantle of dark slate-violet cloth with a plain iron clasp',
    'moss-charm': 'a round wooden charm on a cord holding a tuft of soft green moss',
    'bat-earring': 'a small iron earring shaped like a folded grey bat wing',
    'crystal-pendant': 'a cord pendant holding a small pale blue crystal core in an iron setting',
    'gear-ring': 'an old bronze ring shaped like a small cog wheel',
    'wooden-buckler': 'a small round wooden buckler shield with an iron rim and a central iron boss',
    'crystal-aegis': 'a kite shield faced with pale blue crystal plates in an iron frame',
    'leather-cap': 'a simple brown leather cap with a stitched brim',
    'scale-helm': 'an open-face helm covered in overlapping teal scales',
    'cloth-gloves': 'a pair of plain undyed cloth gloves',
    'thorn-gauntlets': 'a pair of leather gauntlets with dark green thorn spikes along the knuckles and forearms',
    'straw-sandals': 'a pair of woven straw sandals with cloth straps',
    'bat-boots': 'a pair of grey leather boots with small bat-wing flaps at the ankles',
    'copper-ring': 'a plain copper band ring',
    'star-ring': 'a silver ring set with a small star-patterned stone',
}
GEAR_LEGEND = {   # character legendaries: base skeleton + the owner's motif and colours (crop attached)
    'lg-noel': "a ring whose band is a strip of night sky full of tiny stars, with a small star-shaped stone (Noel's purple, teal and star motifs)",
    'lg-chizuru': "a naginata spear whose head is a double crescent-moon blade, a red and white shaft with sky-blue cords (Chizuru's colours)",
    'lg-liz': "a short three-pronged trident spear with a brass grip and an orange scarf ribbon tied below the prongs (Liz's colours)",
    'lg-sylvie': "a leaf-green leather quiver of armour-piercing arrows with grooved steel heads (Sylvie's colours)",
    'lg-scarlet': "a crimson and black challenger's crest medallion on a gold chain (Scarlet's colours)",
    'lg-selene': "a silver circlet crown set with a round full-moon pearl and two crescent ornaments, navy blue accents (Selene's colours)",
    'lg-safira': "a pair of turquoise and gold dancer's boots with small bells and a flowing ribbon (Safira's colours)",
    'lg-bobby': "a pair of yellow work gloves fitted with brass gears and coiled springs on the back (Bobby's colours)",
    # region legendaries
    'blaze-heart-sword': 'a straight longsword of dark steel whose blade holds a glowing molten-orange heart core in its middle',
    'frost-bloom-neck': 'a silver necklace with an ice-flower pendant blooming with pale cyan crystal petals',
    'storm-thunder-bow': 'a dark indigo recurve bow whose string is a crackling bright yellow lightning line',
    'mire-whisper-gloves': 'a pair of dark olive gloves with toxic green rune stitching on the fingertips',
    'shade-silent-blade': f'{STUBBY_DAGGER}, all black with a deep indigo edge and a cloth-wrapped hilt',
    'iron-bulwark-plate': 'a heavy gunmetal breastplate with a broad wall-like front plate and rows of rivets',
}
GEAR_UNIQUE = {   # gold filigree and one story motif
    'blaze-ember-ring': 'a ring holding a single dim glowing ember stone; story motif: the last warm ember left after a fire',
    'frost-winter-staff': 'a staff crowned with a ring of frozen ice spikes; story motif: a season stopped on its coldest day',
    'storm-swift-boots': 'a pair of boots with small lightning-bolt wings at the heels; story motif: arriving before the thunder',
    'mire-miasma-mask': 'a bronze mask with breathing vents leaking thin green miasma; story motif: even poison grew polite inside it',
    'shade-raven-cloak': 'a black feathered raven cloak; story motif: when it spreads, only a shadow of feathers is left',
    'iron-unbroken-shield': 'a tall steel tower shield whose face is flawless with not a single scratch, while dents crowd its rim; story motif: the shield face that took a thousand blows without a crack',
}
SET_STYLE = {
    'set-blaze': 'crimson and black with a flame crest', 'set-frost': 'silver-blue with a snowflake crest',
    'set-storm': 'indigo and bright yellow with a lightning crest', 'set-mire': 'olive green and bronze with a leaf-vein crest',
    'set-shade': 'deep purple and black with a crescent-moon crest', 'set-iron': 'gunmetal grey and rust red with a riveted gear crest',
}
SET_NOUN = {'weapon': 'a straight sword', 'offhand': 'a shield', 'head': 'a helm', 'body': 'a chunky front-facing breastplate',
            'hands': 'a pair of chunky gauntlets side by side',
            'feet': 'a pair of boots', 'neck': 'a necklace', 'ring': 'a ring'}
GEAR_DESC = {
    **{k: f'{v} ({BASE_TONE})' for k, v in GEAR_BASE.items()},
    **{k: f'{v}, with {LEGEND_TONE}' for k, v in GEAR_LEGEND.items()},
    **{k: f'{v}, with {UNIQUE_TONE}' for k, v in GEAR_UNIQUE.items()},
    **{f'{sid}-{slot}': f'{SET_NOUN[slot]} of a matching armour set: {SET_STYLE[sid]}' for sid, slots in SET_SLOTS.items() for slot in slots},
}
# Legendaries of a character carry that character's lineup crop.
GEAR_OWNER = {'lg-noel': 'noel', 'lg-chizuru': 'chizuru', 'lg-liz': 'liz', 'lg-sylvie': 'sylvie', 'lg-scarlet': 'scarlet',
              'lg-selene': 'selene', 'lg-safira': 'safira', 'lg-bobby': 'bobby'}

MAT_SHEETS = {
    'sheet-mat-1': ['essence-common', 'essence-magic', 'essence-rare', 'essence-legendary', 'star-tear', 'king-scale'],
    'sheet-mat-2': ['blaze-core', 'frost-heart', 'storm-stone', 'mire-gland', 'shade-crystal', 'iron-shard'],
}
MAT_DESC = {
    'essence-common': 'common essence: a small faceted crystal droplet in pale grey-white, simple and plain',
    'essence-magic': 'magic essence: the same crystal droplet in clear blue with one small sparkle',
    'essence-rare': 'rare essence: the same crystal droplet in bright yellow with a small gold cap and two sparkles',
    'essence-legendary': 'legendary essence: the same crystal droplet in vivid orange inside an ornate gold cage, with hard-edged ember glints',
    'star-tear': 'star-lantern tear: a teardrop of warm pale-gold lantern light with a tiny star inside it',
    'king-scale': "king's scale: one large regal dark teal scale with a gold rim and a crown-like ridge",
    # region materials follow portal.py TRAITS colours
    'blaze-core': 'blaze core: a glowing molten core stone, yellow-white centre, orange body and deep red cracks',
    'frost-heart': 'frost heart: a heart-shaped ice crystal in white and pale cyan with deep blue shading',
    'storm-stone': 'storm stone: a dark slate stone split by one bright yellow zig-zag lightning vein',
    'mire-gland': 'poison gland: a toxic green gland sac with one bubble on top and dark olive shading',
    'shade-crystal': 'shade crystal: a jagged deep blue-violet crystal with a cold blue-white rim light (never pink)',
    'iron-shard': 'iron shard: a jagged shard of riveted steel plate with a bright metal highlight and a little rust',
}

# --- tree skills (addendum S2: 47 companion tree skills + Rin 10 + hero 21 = 78), in skills.ts order ------------------
SKILL_DESC = {
    'flame-wave': 'a wide wave of orange flame rolling sideways under a small purple star',
    'inferno': 'a towering pillar of deep red and orange hellfire with a small purple star at its heart',
    'frost-bind': 'a pale blue ice star bound by chains of ice',
    'blizzard': 'a swirling white and pale blue snowstorm spiral with ice shards and a small star',
    'judgement': 'a huge yellow-white lightning bolt striking down through a purple star',
    'spiral-spear': 'a naginata spinning in a red and white circular arc',
    'thousand-spear': 'a fan of many spear tips thrusting outward in red and white',
    'sacred-sake': 'a small white ceramic sake flask tied with a red cord, a sky-blue healing sparkle above it',
    'great-barrier': 'a large red and white shrine charm in front of a sky-blue hexagon barrier',
    'thunder-thrust': 'a spear tip thrusting forward wrapped in a yellow lightning bolt',
    'heaven-spear': 'a tall sacred spear plunging straight down out of a burst of gold light',
    'shadow-flurry': 'six crossing dagger slash marks around a dark blur, orange highlights',
    'smoke-bomb': 'a round black bomb with a lit fuse bursting into a grey smoke cloud',
    'fortune-strike': 'a dagger striking a spinning gold coin with a four-leaf sparkle',
    'quickstep': 'a brown boot with orange speed lines and a small wind swirl',
    'venom-edge': 'a dagger blade dripping toxic green poison drops',
    'phantom-step': 'a brown boot leaving three solid darker afterimages behind it, orange speed lines',
    'heart-shot': 'an arrow piercing the centre of a green target ring',
    'starfall-arrow': 'a glowing arrow falling like a shooting star with a gold star trail',
    'snare-shot': 'an arrow trailing a looped rope snare',
    'hunters-mark': 'a green arrow over a red crosshair that cracks an armour plate',
    'fire-arrow': 'three arrows with flaming orange heads raining down',
    'storm-volley': 'two arrows crackling with yellow lightning flying side by side',
    'guardian-roar': 'a black and gold shield with crimson shout waves radiating from it',
    'unbreakable': 'a black and gold tower shield standing firm inside a crimson aura, small sparks bouncing off it',
    'blaze-ring': 'a broad sword swept in a full ring of crimson and orange fire',
    'crimson-end': 'a broad sword plunged downward into a huge crimson fire burst',
    'shield-bash': 'a shield slamming forward with a crimson impact burst',
    'fortress': 'a small black stone castle tower with gold trim behind a crimson shield',
    'moon-rain': 'drops of silver moonlight falling from a crescent moon',
    'full-moon': 'a bright full moon ringed by stepped silver light bands with a small healing sparkle',
    'blessing': 'a small navy and silver lantern shining rays of blessing light',
    'sanctuary': 'a circle of silver light pillars under a crescent moon',
    'moon-arrow': 'a thin pale cyan arrow of moonlight shaped like a crescent',
    'lunar-eclipse': 'a dark eclipsed moon ringed with pale cyan ice light and small drifting snowflakes',
    'sand-cyclone': 'a turquoise and gold sand whirlwind with two scimitars spinning inside it',
    'thousand-shadows': 'a burst of many curved scimitar slash arcs in turquoise and gold',
    'veil-dance': 'a flowing turquoise veil sash curling into a protective curve',
    'desert-festival': 'a golden sun over crossed scimitars with festive turquoise ribbons',
    'shadow-step': 'a scimitar slash springing from a dark footprint',
    'sirocco': 'a hot orange wind gust swirling with sparks and sand',
    'cannon': 'a heavy brass cannon firing a round shot with a burst',
    'repair-kit': 'a yellow toolbox with a wrench and a small green healing cross',
    'overclock': 'a brass gear with yellow speed lines and a lightning spark',
    'emergency-repair': 'a large wrench crossed with a bandage roll over a green sparkle',
    'shock-mine': 'a round metal mine crackling with yellow lightning',
    'tesla-coil': 'a brass tesla coil tower shooting yellow-white electric arcs',
    'rin-needle': 'two thin silver throwing needles flying side by side',
    'rin-fan': 'a fan of five silver throwing needles spreading outward',
    'rin-venom-needle': 'a silver needle with a toxic green poison drop at its tip',
    'rin-storm': 'a storm of many silver needles raining down in two waves',
    'rin-backstab': 'a short dagger stabbing out of a dark charcoal shadow',
    'rin-veil': 'a charcoal hooded cloak melting into dark stepped shadow',
    'rin-shadowless': 'a dagger thrust drawn as one thin bright silver line cutting through darkness',
    'rin-mark': 'a silver needle pinning a cracked red target mark',
    'rin-execute': 'a dagger held in a reverse grip with a sharp red critical star burst',
    'rin-deathblow': 'two crossed daggers over a large red and silver critical burst',
    'hero-slash': 'a straight rune longsword cutting one pale gold arc',
    'hero-cleave': 'a rune longsword sweeping a full circular arc',
    'hero-sunder': 'a rune longsword cracking a steel armour plate',
    'abyss-sword': 'a rune longsword wreathed in deep abyssal indigo-black flame with pale gold runes',
    'hero-guard': 'a longsword raised in front of a midnight-blue shield',
    'hero-aegis': 'a midnight-blue shield giving off a pale gold protective dome',
    'hero-rally': 'a raised banner with a small lantern emblem and pale gold rays',
    'abyss-guard': 'a midnight-blue shield over an abyssal indigo-black rune circle',
    'hero-flare': 'a small lantern bursting into an orange star of fire',
    'hero-frost': 'a pale blue snowflake star bursting out of a lantern',
    'hero-spark': 'a yellow lightning spark star shooting out of a lantern',
    'abyss-star': 'a dark abyssal star crackling with yellow lightning and pale gold runes',
    'hero-mend': 'a warm lantern glow with a green healing cross',
    'hero-prayer': 'two hands clasped in prayer under a warm lantern glow',
    'hero-purify': 'pale gold lantern light washing a water droplet clean',
    'abyss-light': 'a lantern of abyssal indigo glass shining warm gold healing light',
    'hero-shackle': 'a pale gold rune shackle closing around a fist',
    'hero-slow': 'a cracked hourglass marked with pale gold runes',
    'hero-expose': 'a pale gold rune eye spotting a crack in an armour plate',
    'hero-sleep': 'a closed eye under a small crescent moon and a lantern',
    'abyss-chain': 'abyssal indigo-black chains wrapped around a pale gold rune circle',
}
SKILL_OWNERS = {   # owner -> (skills in skills.ts order, colour scheme, reference)
    'noel': ('purple, teal and blue with star motifs', ['flame-wave', 'inferno', 'frost-bind', 'blizzard', 'judgement']),
    'chizuru': ('red and white with sky-blue cords', ['spiral-spear', 'thousand-spear', 'sacred-sake', 'great-barrier', 'thunder-thrust', 'heaven-spear']),
    'liz': ('orange, brass and brown', ['shadow-flurry', 'smoke-bomb', 'fortune-strike', 'quickstep', 'venom-edge', 'phantom-step']),
    'sylvie': ('leaf green, tan and wood brown', ['heart-shot', 'starfall-arrow', 'snare-shot', 'hunters-mark', 'fire-arrow', 'storm-volley']),
    'scarlet': ('crimson, black and gold', ['guardian-roar', 'unbreakable', 'blaze-ring', 'crimson-end', 'shield-bash', 'fortress']),
    'selene': ('navy blue, silver-white and pale cyan moonlight with a little pale gold', ['moon-rain', 'full-moon', 'blessing', 'sanctuary', 'moon-arrow', 'lunar-eclipse']),
    'safira': ('turquoise, gold and sand', ['sand-cyclone', 'thousand-shadows', 'veil-dance', 'desert-festival', 'shadow-step', 'sirocco']),
    'bobby': ('yellow, brass and steel', ['cannon', 'repair-kit', 'overclock', 'emergency-repair', 'shock-mine', 'tesla-coil']),
    'rin': ('charcoal, black, silver and dull bronze', ['rin-needle', 'rin-fan', 'rin-venom-needle', 'rin-storm', 'rin-backstab', 'rin-veil',
                                                        'rin-shadowless', 'rin-mark', 'rin-execute', 'rin-deathblow']),
    'hero': ('midnight blue, steel and pale gold runes; the abyss skills add deep indigo-black', [
        'hero-slash', 'hero-cleave', 'hero-sunder', 'abyss-sword', 'hero-guard', 'hero-aegis', 'hero-rally', 'abyss-guard',
        'hero-flare', 'hero-frost', 'hero-spark', 'abyss-star', 'hero-mend', 'hero-prayer', 'hero-purify', 'abyss-light',
        'hero-shackle', 'hero-slow', 'hero-expose', 'hero-sleep', 'abyss-chain']),
}
# No lineup crop for the hero and Rin (addendum S2): their approved standees (Rin before her oath) carry the colours.
SKILL_REF_DEP = {'hero': 'char-hero-standee', 'rin': 'char-rin-standee'}
EMPTY_CELL = 'plain empty stone slab'

FRAME_DESC = {   # addendum 2 §2: one hue per tier and an ornament ladder that grows tier by tier
    'magic': 'royal blue #3F7FFF, a plain band with square corners, no ornament',
    'rare': 'bright lemon yellow #FFE03A, the band plus one 2 by 2 rivet in each corner',
    'epic': ('blue-violet #8A5CFF (a cool violet leaning to blue, never pink, never magenta), the band with each corner cut at 45 degrees '
             'and a small diamond gem in each corner'),
    'legendary': 'vivid orange #FF7A14, the band plus a small flame-tongue ornament in each corner',
    'unique': 'deep crimson red #D8283A, the band with a thin gold inner edge line and a carved filigree ornament in each corner',
    'set': 'leaf green #3FD05A, the band plus a small leaf emblem in each corner',
    'glow-legendary': ('a 12 by 12 big-pixel square ring of soft pale yellow-orange light only 1 big pixel wide with a 2 by 2 spark at each '
                       'corner, no other ornament'),
    'starlit': ('a 16 by 16 big-pixel starlight overlay: a small four-pointed cyan-white star (at most 5 by 5) sitting on each of the four '
                'corners, and only a few single-pixel cyan-white star dots spaced along each side, everything else magenta'),
}

# --- prompt templates (plan 5d "Prompt 策略") -----------------------------------------------------------------------------
GEAR_SHEET = (
    'A {cols} by {rows} grid of {n} pixel art RPG equipment item icons for a 16-bit Japanese console RPG, with flat pure magenta #FF00FF gutters and margin: '
    'thick magenta gutters between the items and a wide magenta margin around the grid; nothing touches the image edges. '
    # Addendum 2: one size for every item (the size gate normalises the long edge; the prompt asks for full, chunky shapes).
    'Every item is drawn alone, centred in its own square cell and filling about nine tenths of the cell in its longest direction; '
    'all items at the same scale so they look equally big, about 64 by 64 art pixels each. '
    'Long weapons lie on the diagonal with the hilt lower left and the tip upper right, with thick chunky blades and shafts at least 6 art pixels wide. '
    'Shields, armour, helms, gloves and boots are drawn front-facing as broad, chunky, simple shapes that fill the cell in both directions: '
    'a shield is at least three quarters as wide as it is tall; a pair of gloves or boots stands side by side, overlapping. '
    'Rings and necklaces are drawn large, filling the cell like any other item. '
    'Design for the 24-pixel icon: a 2-pixel dark outline, big flat colour areas with at most three tones per material, one large crest instead of patterns, '
    'and no detail smaller than 3 art pixels. '
    'Keep every item inside its own cell with straight magenta lanes at least 60 pixels wide between columns and rows; nothing crosses a lane. '
    'Light from the upper left. '
    'Rarity sets the tone: plain base items use plain materials (wood, iron, leather, cloth, scale), low saturation and no glow, and items of the same kind have clearly different outlines; '
    'legendary items keep a base-item shape and add a character or region motif with small hard-edged orange ember highlights; '
    'unique items have fine gold filigree and one story motif; set items share their set colours and crest. '
    'In this order, left to right, top to bottom: {listing}. {refs}'
    '16-bit JRPG item icon style, ' + PIX + '. No text, no numbers, no frames, no badge or circle behind the item. ' + ORIGINAL)
REFS_SAMPLE = ('Match the pixel density, outline, shading and saturation of the attached existing icons from the same game (shown enlarged), '
               'but draw every item new, larger and more detailed. ')
REFS_MAIN = ('Match the drawing style, scale, outline, shading and palette of the attached approved equipment sheet (the style anchor) '
             'and the attached existing icons from the same game. ')
REFS_CROPS = "The attached character pictures show only the colours and weapon of each character legendary's owner; do not draw the characters. "
REFS_BLAZE = ("Item 1 belongs to the crimson-and-black flame-crest set drawn on the attached approved sheet: match those set pieces' colours, "
              'crest and finish exactly. ')
ICON_SHEET = (
    'A 3 by 2 grid of six small square pixel art RPG {what} icons, with flat pure magenta #FF00FF gutters and margin: thick magenta gutters between the icons '
    'and a wide magenta margin around the grid; nothing touches the image edges. Each icon sits alone on magenta, all the same size, about 28 by 28 art pixels, '
    '{shape}, with a crisp dark outline, two or three hard-edged shading tones and a bright highlight from the upper left. {extra}'
    'In this order, left to right, top to bottom: {listing}. '
    'Match the pixel density, outline, shading and saturation of the attached existing icons from the same game (shown enlarged). {refs}'
    '16-bit JRPG item icon style, ' + PIX + '. No text, no numbers, no frames, no badge or circle behind the {noun}. ' + ORIGINAL)
ESSENCES = ('The four essences are one crystal droplet shape in four grades (pale grey-white, blue, yellow, orange), each grade a little more ornate. ')
FRAME_SHEET = (   # addendum 2 §2; the closing style, no-text and originality sentences are the plan's global constraints
    'A 4 by 2 grid of eight square pixel art item-slot frame pieces for a 16-bit Japanese console RPG, with flat pure magenta #FF00FF gutters and margin '
    'and straight magenta lanes at least 60 pixels wide between them. Draw each big pixel as a solid square. '
    "The six frames are each exactly 16 by 16 big pixels with a perfectly flat magenta inside; each frame's border is one solid band exactly 2 big pixels thick "
    "(one eighth of the frame's width) running straight along all four sides; corner ornaments stay inside a 4 by 4 big-pixel corner square; "
    'the middle of every side is plain so it can repeat. Each frame uses one hue only, with a darker and a lighter tone of it. '
    'In this order: {listing}. '
    '16-bit JRPG menu frame style, ' + PIX + '. No text, no numbers, no items inside the frames, no background inside the frames. ' + ORIGINAL)
FORGE_SCENE = (
    "Interior of a blacksmith's forge: a glowing furnace on the left, an anvil, racks of blades and shields, hanging tools, warm orange firelight and soot-dark beams, "
    'the right third of the picture kept fairly plain for a character to stand in front of. '
    'Match the pixel art style, palette and pixel density of the attached approved backdrop. 16:9 pixel art scene, 16-bit JRPG style, strict square pixel grid, '
    'limited palette, no anti-aliasing, no blur. No text, no letters, no signs with writing, no people. Fill the whole canvas edge to edge. '
    'Do not use pure magenta #FF00FF anywhere in the picture. The design must be original.')
DORAN = ('the town blacksmith 多蘭 (Doran), a sturdy cheerful woman in her late twenties with short dark-red hair tied up in a bandana, soot on one cheek, '
         'a heavy leather apron over a rolled-sleeve work shirt, thick gloves, holding a forging hammer on her shoulder')


def _npc_prompt(face, same=''):
    return (f'Pixel art half-body portrait (from the waist up) of an original character: {JP}; {DORAN}, {face}, facing slightly left, standing in a blacksmith forge.{same} '
            'Match the art style, pixel density, outline and colouring of the attached approved sprite (a different character). '
            f'16-bit JRPG style, {PIX}. Perfectly flat solid pure magenta #FF00FF background around the figure; the body may be cut off by the bottom edge. '
            f'No text. {CHAR_ORIGINAL}')


def _listing(parts, desc):
    return '; '.join(f'{i + 1}) {desc[p] if p else EMPTY_CELL}' for i, p in enumerate(parts))


def _skill_sheets():
    out = []
    for owner, (palette, ids) in SKILL_OWNERS.items():
        chunks = [ids[i:i + 6] for i in range(0, len(ids), 6)]
        for k, chunk in enumerate(chunks, 1):
            sid = f'sheet-skill-{owner}' if len(chunks) == 1 else f'sheet-skill-{owner}-{k}'
            out.append((sid, owner, palette, chunk + [None] * (6 - len(chunk))))
    return out


def jobs():
    """Every plan 5d job. parts are bare ids (None = a discarded cell); `assets_of` maps a part to registry ids;
    deps are registry ids whose chosen raw is attached first at `gen` time."""
    out = []
    for sid, parts in GEAR_SHEETS.items():
        cols, rows = GEAR_GRID.get(sid, (3, 3)); sample = sid in SAMPLE
        owners = [GEAR_OWNER[p] for p in parts if p in GEAR_OWNER]
        deps = ['gear-set-blaze-weapon'] if 'set-blaze-ring' in parts else []
        refs = (REFS_SAMPLE if sample else REFS_MAIN) + (REFS_CROPS if owners else '') + (REFS_BLAZE if deps else '')
        images = ([] if sample else [GEAR_ANCHOR]) + [ICONS_OLD] + [CROPS / f'{c}.png' for c in owners]
        out.append(dict(id=sid, kind='gear-sheet', cols=cols, rows=rows, parts=list(parts), batch='sample' if sample else 'main-gear',
                        images=images, deps=deps, prompt=GEAR_SHEET.format(cols=cols, rows=rows, n=len(parts), listing=_listing(parts, GEAR_DESC), refs=refs)))
    for sid, parts in MAT_SHEETS.items():
        sample = sid in SAMPLE
        out.append(dict(id=sid, kind='icon-sheet', cols=3, rows=2, parts=list(parts), batch='sample' if sample else 'main-gear',
                        images=([] if sample else [GEAR_ANCHOR]) + [ICONS_OLD], deps=[], prompt=ICON_SHEET.format(
                            what='crafting material', shape='one bold readable object', extra=ESSENCES if sample else '',
                            listing=_listing(parts, MAT_DESC), refs='' if sample else REFS_MAIN, noun='item')))
    frames = list(FRAME_DESC)
    out.append(dict(id=FRAME_SHEET_ID, kind='frame-sheet', cols=4, rows=2, parts=frames, batch='sample', images=[], deps=[],
                    prompt=FRAME_SHEET.format(listing=_listing(frames, FRAME_DESC))))
    out.append(dict(id='scene-forge', kind='opaque', cols=1, rows=1, parts=['scene-forge'], batch='sample', images=[], deps=['bg-f1'],
                    prompt=FORGE_SCENE))
    out.append(dict(id='npc-forge', kind='sprite', cols=1, rows=1, parts=['npc-forge'], batch='sample', images=[], deps=['char-scarlet-standee'],
                    prompt=_npc_prompt('calm friendly expression')))
    out.append(dict(id='npc-forge-happy', kind='sprite', cols=1, rows=1, parts=['npc-forge-happy'], batch='main-gear', images=[], deps=['npc-forge'],
                    prompt=_npc_prompt('bright happy smile, eyes slightly closed', ' Keep exactly the same outfit, colours and accessories as the attached portrait '
                                       'of this same person, and keep both arms and hands fully inside the canvas.')))
    for sid, owner, palette, parts in _skill_sheets():
        crop = [] if owner in SKILL_REF_DEP else [CROPS / f'{owner}.png']
        out.append(dict(id=sid, kind='icon-sheet', cols=3, rows=2, parts=parts, batch='skills', images=[ICONS_OLD] + crop,
                        deps=[SKILL_REF_DEP[owner]] if owner in SKILL_REF_DEP else [], prompt=ICON_SHEET.format(
                            what='skill', shape='one bold emblem that reads instantly at small size', extra=f'Colour scheme for this character: {palette}. ',
                            listing=_listing(parts, SKILL_DESC), noun='emblem',
                            refs='The attached character picture shows only the colours and weapon to use; do not draw the character. ')))
    return out


def assets_of(job, part):
    """Registry ids one part of a job produces."""
    if part is None: return []
    if job['kind'] == 'gear-sheet': return [f'gear-{part}-large', f'gear-{part}']
    if job['kind'] == 'icon-sheet': return [f'icon-{part}']
    if job['kind'] == 'frame-sheet': return [FRAME_ASSET[part]]
    return [part]


def silhouette_ids():
    return [f'gear-{k}-silhouette' for k in (*REGION_LIMITED, *SET_FIRST)]


def runtime(aid):
    """The contract path of a plan 5d asset (written only by `publish`)."""
    b = A.BASE
    if aid.startswith('gear-'): return f'{b}gear/{aid[5:]}.png'
    if aid.startswith('icon-'): return f'{b}icon/{aid[5:]}.png'
    if aid in FRAME_ASSET.values(): return f'{b}ui/{aid[3:]}.png'
    if aid == 'scene-forge': return f'{b}scene/forge.png'
    if aid in ('npc-forge', 'npc-forge-happy'): return f'{b}npc/{aid[4:]}.png'
    return None


def label(batch):
    if batch not in BATCHES: raise ValueError(f'batch must be one of {BATCHES}')
    return f'gear-5d-{batch}'


def job_by_id(sid):
    return next(j for j in jobs() if j['id'] == sid)


def _registry():
    return A.Registry(REG_PATH)


# --- generation ----------------------------------------------------------------------------------------------------------

def attempts(sid):
    files = [p for p in (RAW / sid).glob(f'{sid}-a*.png') if not p.stem.endswith('-magenta')]
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def chosen_raw(reg, aid):
    """The raw of an approved (or published) chosen attempt, used as a reference for later jobs."""
    e = reg.data['assets'].get(aid, {})
    return Path(e['raw']) if e.get('raw') and e.get('status') in ('approved', 'published') else None


def anchor_attempt(reg):
    """The sheet-gear-1 attempt most of its approved-to-be parts were picked from (ties: the lower attempt)."""
    picks = [reg.data['assets'].get(a, {}).get('chosen_attempt') for p in GEAR_SHEETS['sheet-gear-1'] for a in (f'gear-{p}', f'gear-{p}-large')]
    picks = [k for k in picks if k]
    if not picks: return None
    return sorted(set(picks), key=lambda k: (-picks.count(k), int(k[1:])))[0]


def make_anchor(reg, out=None):
    """raw/gear-refs/gear-anchor.png: the sheet-gear-1 attempt recorded as the style anchor when the user approved the
    sample (`style_anchor` at the registry root), at half size (plan 5d Task 9 Step 1)."""
    from PIL import Image
    rec = reg.data.get('style_anchor')
    if not rec or not reg.data.get('style_approved'):
        raise PermissionError('no approved style anchor; approve the sample batch first')
    out = Path(out or GEAR_ANCHOR); out.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(rec['raw']).convert('RGB'); im.resize((im.width // 2, im.height // 2), Image.NEAREST).save(out)
    return out


def _opt(argv, name, default=None):
    return next((a.split('=', 1)[1] for a in argv if a.startswith(f'--{name}=')), default)


def selected(argv):
    only = (_opt(argv, 'only') or '').split(',') if _opt(argv, 'only') else None
    batch = _opt(argv, 'batch')
    if batch: label(batch)
    return [j for j in jobs() if (not only or any(j['id'].startswith(o) for o in only)) and (not batch or j['batch'] == batch)]


def gen(argv):
    n = int(_opt(argv, 'n', 2)); extra = _opt(argv, 'extra', '')
    reg = _registry(); todo = selected(argv)
    later = [j['id'] for j in todo if j['batch'] != 'sample']
    if later and not reg.data.get('style_approved'):
        raise PermissionError(f'the style sample is not approved yet (no style_approved in the registry); refusing {later}')
    for job in todo:
        deps = [chosen_raw(reg, d) for d in job['deps']]
        if any(d is None for d in deps):
            print(f'[skip] {job["id"]}: dependency {job["deps"]} is not approved', flush=True); continue
        if GEAR_ANCHOR in job['images']: make_anchor(reg)   # always from the recorded anchor attempt, never a stale file
        missing = [str(p) for p in job['images'] if not Path(p).exists()]
        if missing:
            print(f'[skip] {job["id"]}: missing reference {missing}', flush=True); continue
        while len(attempts(job['id'])) < n:
            k = max([int(p.stem.rsplit('-a', 1)[1]) for p in attempts(job['id'])] + [0]) + 1
            PROMPTS.mkdir(exist_ok=True)
            (PROMPTS / f'{job["id"]}.txt').write_text(job['prompt'].strip() + ((' ' + extra) if extra else '') + ' ' + GEN + '\n', encoding='utf-8')
            argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(RAW / job['id']), '--name', f'{job["id"]}-a{k}.png',
                     '--prompt-file', str(PROMPTS / f'{job["id"]}.txt')]
            for im in deps + job['images']: argv2 += ['--image', str(im)]
            start = time.time()
            g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
            print(f'[gen {job["id"]} a{k}] rc={g.returncode} {g.stdout.strip()[-200:]}', flush=True)
            import party
            fixed = party.recover(RAW / job['id'], f'{job["id"]}-a{k}.png', start, time.time())
            if fixed: print(f'[recovered {job["id"]} a{k}] codex saved {fixed}; the codex_still fallback copy was replaced', flush=True)
            if not (RAW / job['id'] / f'{job["id"]}-a{k}.png').exists():
                print(f'[no output] {job["id"]} a{k}; stopping this id', flush=True); break


# --- postprocess -----------------------------------------------------------------------------------------------------------

def process_attempt(reg, job, raw, workdir, parts=None):
    """Postprocess one raw attempt. parts limits a sheet to some of its bare part ids. Returns {registry id: qa}."""
    from PIL import Image
    workdir = Path(workdir); workdir.mkdir(parents=True, exist_ok=True)
    img = Image.open(raw).convert('RGB')
    if job['kind'] == 'opaque':
        return {job['id']: A._finish(reg, job['id'], img, 'opaque', workdir, raw, fit=SCENE_SIZE)}
    if job['kind'] == 'sprite':
        if 'allow_edge' not in reg.data['assets'].get(job['id'], {}): reg.set(job['id'], allow_edge=['bottom'])
        return {job['id']: A._finish(reg, job['id'], img, 'sprite', workdir, raw, height=NPC_HEIGHT, despill_=True)}
    # sheet_cells pads every inner cell with key pixels, so `subject cut by the canvas edge` only fires when the sheet cut it.
    cells = P.sheet_cells(img, job['cols'], job['rows'])
    out = {}
    for cell, part in zip(cells, job['parts']):
        if part is None or (parts and part not in parts): continue
        if job['kind'] == 'gear-sheet':
            out.update(A.process_gear_cell(reg, part, cell, workdir, raw, large=LARGE, icon=ICON, slot=GEAR_SLOT[part]))
        elif job['kind'] == 'icon-sheet':
            out[f'icon-{part}'] = A._finish(reg, f'icon-{part}', cell, 'sprite', workdir, raw, height=ICON_HEIGHT, despill_=True)
        else:
            aid = assets_of(job, part)[0]; role, size, sl, pad = frame_role(part)
            if 'defringe' not in reg.data['assets'].get(aid, {}): reg.set(aid, defringe=frame_defringe(part))   # UI frames (contract)
            out[aid] = A.nine_slice(reg, aid, cell, workdir, raw, size, sl, role=role, hue=FRAME_HUE.get(part), pad=pad)
    if job['kind'] == 'frame-sheet': _frames_distinct(reg, job, out, workdir)
    return out


TIER_FRAMES = [FRAME_ASSET[r] for r in FRAMED_RARITIES]
CLOSE = 'too close to '


def frames_too_close(assets):
    """Addendum 2 §2 over the whole tier-frame set in a registry (`assets`: {aid: entry}): {aid: reasons} for every
    frame in a pair whose band colours (qa.stroke_colour) are closer than A.DISTINCT_DE. Rejected and retired frames
    are not part of the set."""
    colours = {a: tuple(e['qa']['stroke_colour']) for a in TIER_FRAMES if (e := assets.get(a)) and (e.get('qa') or {}).get('stroke_colour')
               and e.get('status') not in ('rejected', 'retired')}
    return {a: r for a, r in A.frames_distinct(colours).items() if r}


def _frames_distinct(reg, job, out, workdir):
    """Re-run distinctness over the whole tier-frame set after any frame is (re)processed, whatever the pick order: every
    frame of a too-close pair gets `too close to <aid> (ΔE n)` and qa_failed, earlier picks included; an old
    `too close to` that no longer holds is cleared (and the frame goes back to qa_passed when nothing else failed).
    approved / published frames are never changed here. Each changed qa.json beside its final is rewritten."""
    assets = {a: ({**reg.data['assets'].get(a, {}), 'qa': out[a]} if a in out else reg.data['assets'].get(a, {})) for a in TIER_FRAMES}
    close = frames_too_close(assets)
    for aid in TIER_FRAMES:
        e = assets.get(aid) or {}; q = e.get('qa')
        if not q or (aid not in out and e.get('status') not in ('qa_passed', 'qa_failed')): continue
        reasons = [r for r in q.get('reasons', []) if not r.startswith(CLOSE)] + close.get(aid, [])
        if reasons == q.get('reasons', []) and aid not in close: continue
        q = {**q, 'reasons': reasons, 'pass': not reasons}
        if aid in out: out[aid].update(q)
        qf = Path(workdir) / f'{aid}.qa.json' if aid in out else (A._final_path(e['final']).with_suffix('.qa.json') if e.get('final') else None)
        if qf: qf.write_text(json.dumps(q, indent=2), encoding='utf-8')
        reg.set(aid, qa=q, status='qa_passed' if q['pass'] else 'qa_failed')


def cand(argv):
    for job in selected(argv):
        for raw in attempts(job['id']):
            k = raw.stem.rsplit('-a', 1)[1]; wd = WORK / job['id'] / 'cand' / f'a{k}'
            reg = A.Registry(wd / 'cand-registry.json')
            try:
                res = process_attempt(reg, job, raw, wd)
                print(f'[cand {job["id"]} a{k}] ' + ', '.join(f'{i}: {"pass" if q["pass"] else q["reasons"]}{" " + str(q.get("warnings")) if q.get("warnings") else ""} {q.get("size")}'
                                                         for i, q in res.items()), flush=True)
            except ValueError as e:
                print(f'[cand {job["id"]} a{k}] FAILED: {e}', flush=True)


def _arg(argv, name):
    return next((argv[i + 1] for i, a in enumerate(argv) if a == name and i + 1 < len(argv)), None)


def _replaced_icon(reg, aid):
    """`icon-<base>` that publishing this published `gear-<base>` retired, if any (it comes back when gear-<base> is reopened)."""
    e = reg.data['assets'].get(aid, {})
    if e.get('status') != 'published' or not aid.startswith('gear-') or aid.endswith(('-large', '-silhouette')): return None
    base = aid[5:]; icon = reg.data['assets'].get(f'icon-{base}', {})
    ok = icon.get('status') == 'retired' and icon.get('retired_reason') == f'replaced by gear-{base} (plan 5d)'
    return f'icon-{base}' if ok else None


def _reopen_checks(reg, aids, public):
    """Everything `reopen` will do, checked first so a refusal leaves nothing half-reopened."""
    base = (Path(public) / A.BASE.strip('/')).resolve()
    for aid in aids:
        if reg.data['assets'][aid].get('status') == 'published': reg.retire_target(aid, public)
        icon = _replaced_icon(reg, aid)
        if icon:
            ie = reg.data['assets'][icon]; src = A._final_path(ie['final']) if ie.get('final') else None
            dst = (Path(public) / ie['retired_runtime'].lstrip('/')).resolve()
            if src is None or not src.is_file(): raise PermissionError(f'{icon} cannot be restored: its final file is missing')
            if not dst.is_relative_to(base): raise PermissionError(f'{dst} is outside {base}')


def reopen(reg, aid, public=None):
    """Take an approved or published part back to the candidate stage so it can be re-picked (call `_reopen_checks` first).

    - A published file is retired (deleted from public/, url out of the manifest).
    - A published gear-<base> brings back the old icon-<base> it replaced, so the game never lacks an icon.
    - Approval is dropped, the old state goes to `history`, and the batch approval becomes stale: the batch has to be
      shown and approved again before anything of it is published."""
    public = Path(public or PUBLIC)
    e = reg.data['assets'][aid]; old = {k: e[k] for k in ('status', 'runtime', 'approved_by', 'chosen_attempt') if k in e}
    today = datetime.date.today().isoformat(); icon = _replaced_icon(reg, aid)
    if e.get('status') == 'published':
        reg.retire(aid, public, 'reopened for a re-pick (plan 5d)')
    if icon:
        ie = reg.data['assets'][icon]; url = ie['retired_runtime']; dst = public / url.lstrip('/')
        dst.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(A._final_path(ie['final']), dst)
        ie.setdefault('history', []).append({'status': 'retired', 'retired_reason': ie.get('retired_reason'), 'restored_on': today,
                                             'restored_because': f'{aid} reopened (plan 5d)'})
        for k in ('retired_runtime', 'retired_reason', 'retired_on'): ie.pop(k, None)
        ie['runtime'] = url; ie['status'] = 'published'
    for k in ('approved_by', 'retired_runtime', 'retired_reason', 'retired_on', 'runtime'): e.pop(k, None)
    e.setdefault('history', []).append({**old, 'reopened_on': today})
    e['status'] = 'reopened'
    b = str(e.get('batch', ''))[len(A.PLAN5D_BATCH):]
    rec = reg.data.get('approved_batches', {}).pop(b, None)
    if rec: reg.data.setdefault('stale_approvals', []).append({**rec, 'batch': b, 'stale_on': today, 'because': f'{aid} reopened'})
    reg._save(); reg.write_manifest(public)


def pick(argv):
    sid, k, part = _arg(argv, '--id'), _arg(argv, '--attempt'), _arg(argv, '--part')
    job = job_by_id(sid); reg = _registry()
    if part and part not in job['parts']: raise ValueError(f'{part} is not a part of {sid}')
    targets = [a for p in job['parts'] if p is not None and (not part or p == part) for a in assets_of(job, p)]
    # A silhouette made from a re-picked icon is stale too.
    targets += [f'gear-{key}-silhouette' for key in (*REGION_LIMITED, *SET_FIRST) if f'gear-{SET_FIRST.get(key, key)}' in targets]
    locked = [a for a in targets if reg.data['assets'].get(a, {}).get('status') in ('approved', 'published')]
    if locked and '--reopen' not in argv:
        raise PermissionError(f'{locked} are already approved or published; pass --reopen to take them back (a published file is retired)')
    raw = RAW / sid / f'{sid}-a{k}.png'
    if locked:
        # Validate first, mutate after: a raw that cannot be processed, a file that cannot be retired or an icon that
        # cannot be restored refuses before anything is reopened.
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            process_attempt(A.Registry(Path(td) / 'r.json'), job, raw, Path(td), parts=[part] if part else None)
        _reopen_checks(reg, locked, PUBLIC)
        for a in locked: reopen(reg, a, PUBLIC)
    res = process_attempt(reg, job, raw, WORK / sid, parts=[part] if part else None)
    for aid in res:   # never `runtime`: that is written by publish, in the same commit as the artPaths change
        reg.set(aid, chosen_attempt=f'a{k}', source_id=sid, batch=label(job['batch']))
    print(json.dumps(res, ensure_ascii=False))
    return res


def note(argv):
    sid, k, reason = _arg(argv, '--id'), _arg(argv, '--attempt'), _arg(argv, '--reason')
    reg = _registry(); e = reg.data['assets'].setdefault(sid, {}); rej = e.get('rejected_attempts', {}); rej[f'a{k}'] = reason
    reg.set(sid, rejected_attempts=rej)


# --- approval and publishing -------------------------------------------------------------------------------------------

def batch_assets(batch):
    """Every registry id a batch's sheets produce (silhouettes are derived later, not approved here)."""
    return [a for j in jobs() if j['batch'] == batch for p in j['parts'] for a in assets_of(j, p)]


def shown_path(batch):
    """What the review page showed for a batch: {aid: sha256 of its final}, written by review_gear.py."""
    return WORK / 'review' / f'{batch}-shown.json'


def sha256(path):
    import hashlib
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def do_approve(reg, batch, by):
    """Record the USER's approval of a batch (their words and the date in `by`).

    Approval is tied to what the user saw: every part of the batch must be picked, have passed QA, and its final file
    must still have the hash the review page recorded (`work/review/<batch>-shown.json`). Any miss refuses the whole
    batch and changes nothing; only then do the parts become approved (and, for the sample, `style_approved` and the
    style anchor attempt are recorded)."""
    lab = label(batch)
    if not by or not re.search(r'\d{4}-\d{2}-\d{2}', by):
        raise ValueError("--by must quote the user's approval and carry its date (YYYY-MM-DD)")
    if batch != 'sample' and not reg.data.get('style_approved'):
        raise PermissionError('the style sample is not approved yet')
    sp = shown_path(batch)
    if not sp.exists(): raise PermissionError(f'no review page record for {batch} ({sp}); build and show the review page first')
    shown = json.loads(sp.read_text(encoding='utf-8')).get('parts', {})
    aids = batch_assets(batch); problems = {}
    if not shown: problems['nothing was shown'] = [batch]
    close = frames_too_close(reg.data['assets']) if any(a in TIER_FRAMES for a in aids) else {}
    if close: problems['frames too close (addendum 2 distinctness over the whole set)'] = [f'{a}: {"; ".join(r)}' for a, r in close.items()]
    for aid in aids:
        e = reg.data['assets'].get(aid, {}); f = A._final_path(e['final']) if e.get('final') else None
        if not e.get('chosen_attempt') or f is None or not f.is_file(): problems.setdefault('not picked', []).append(aid)
        elif e.get('status') not in ('qa_passed', 'approved', 'published'): problems.setdefault(f'status {e.get("status")}', []).append(aid)
        elif shown.get(aid) != sha256(f): problems.setdefault('changed since (or missing from) the review page', []).append(aid)
    if problems: raise PermissionError(f'refusing to approve {batch}: {problems}')
    done = []
    for aid in aids:
        e = reg.data['assets'][aid]
        if e.get('status') == 'qa_passed': e['status'] = 'approved'; e['approved_by'] = by; done.append(aid)
    today = datetime.date.today().isoformat()
    # The hashes the user approved: publish re-hashes every file against these.
    reg.data.setdefault('approved_batches', {})[batch] = {'by': by, 'date': today, 'record': str(sp), 'shown': {a: shown[a] for a in aids}}
    if batch == 'sample':
        k = anchor_attempt(reg)
        reg.data['style_anchor'] = {'sheet': 'sheet-gear-1', 'attempt': k, 'raw': str(RAW / 'sheet-gear-1' / f'sheet-gear-1-{k}.png')}
        reg.data['style_approved'] = today
    reg._save()
    if batch == 'sample' and GEAR_ANCHOR.exists():
        # A re-approved sample may anchor on another attempt: never leave the old anchor behind.
        if Path(reg.data['style_anchor']['raw']).is_file(): make_anchor(reg)
        else: GEAR_ANCHOR.unlink()
    return done


def do_silhouettes(reg, workdir=None):
    """Silhouettes of the 12 region-limited items and the 6 sets, from approved icons only. A deterministic transform of
    approved art, so a pass is approved at once (`derived from gear-<id>`, the source's batch); a failure stops."""
    workdir = Path(workdir or WORK / 'gear-silhouettes'); made = []
    for key in (*REGION_LIMITED, *SET_FIRST):
        src = SET_FIRST.get(key, key); sid, aid = f'gear-{src}', f'gear-{key}-silhouette'
        se = reg.data['assets'].get(sid, {})
        if se.get('status') not in ('approved', 'published'): continue
        if reg.data['assets'].get(aid, {}).get('status') in ('approved', 'published'): continue
        q = A.silhouette(reg, src, workdir, out=key)
        if not q['pass']: raise RuntimeError(f'{aid} failed QA {q["reasons"]}; stopping (report it, do not publish a substitute)')
        reg.set(aid, status='approved', approved_by=f'derived from {sid}', batch=se.get('batch'), source_id=sid)
        made.append(aid)
    return made


def do_publish(reg, batch, public=None):
    """Publish the approved parts of a batch: runtime, copy to public/, retire `icon-<base>` a gear icon replaces, manifest."""
    public = Path(public or PUBLIC); lab = label(batch)
    rec = reg.data.get('approved_batches', {}).get(batch)
    if not rec:
        raise PermissionError(f'batch {batch} has no current user approval; show its review page and run approve after the user approves it')
    shown = rec.get('shown') if isinstance(rec.get('shown'), dict) else {}
    todo = sorted(a for a, e in reg.data['assets'].items() if e.get('batch') == lab and e.get('status') == 'approved')
    # Check everything first: every file about to go out must be exactly what the user approved.
    problems, retire = {}, []
    for aid in todo:
        e = reg.data['assets'][aid]; f = A._final_path(e['final']) if e.get('final') else None
        if not runtime(aid): problems.setdefault('no plan 5d runtime path', []).append(aid); continue
        if f is None or not f.is_file(): problems.setdefault('final file missing', []).append(aid); continue
        if aid.endswith('-silhouette'):
            src = e.get('source', {}).get('from'); se = reg.data['assets'].get(src, {})
            sf = A._final_path(se['final']) if se.get('final') else None
            from PIL import Image
            import numpy as np
            if not src or sf is None or not sf.is_file() or shown.get(src) != sha256(sf):
                problems.setdefault('silhouette source is not the approved image', []).append(aid)
            elif not np.array_equal(np.asarray(A.silhouette_image(Image.open(sf))), np.asarray(Image.open(f).convert('RGBA'))):
                problems.setdefault('silhouette is not derived from the approved image', []).append(aid)
        elif shown.get(aid) != sha256(f):
            problems.setdefault('changed since (or missing from) the approved review page', []).append(aid)
        base = aid[5:] if aid.startswith('gear-') and not aid.endswith(('-large', '-silhouette')) else None
        if base and reg.data['assets'].get(f'icon-{base}', {}).get('status') == 'published':
            try: reg.retire_target(f'icon-{base}', public); retire.append(base)
            except (PermissionError, ValueError) as err: problems.setdefault('old icon cannot be retired', []).append(f'icon-{base}: {err}')
    if problems: raise PermissionError(f'refusing to publish {batch}; nothing was published: {problems}')
    done = []
    for aid in todo:
        reg.set(aid, runtime=runtime(aid)); reg.publish(aid, public, plan5d=True); done.append(aid)
    for base in retire: reg.retire(f'icon-{base}', public, f'replaced by gear-{base} (plan 5d)')
    reg.write_manifest(public)
    return done


def approve(argv):
    print(json.dumps(do_approve(_registry(), _arg(argv, '--batch'), _arg(argv, '--by')), ensure_ascii=False))


def silhouettes(argv):
    print(json.dumps(do_silhouettes(_registry()), ensure_ascii=False))


def publish(argv):
    print(json.dumps(do_publish(_registry(), _arg(argv, '--batch')), ensure_ascii=False))


def plan_data():
    js = jobs()
    return {'sheets': {j['id']: j['parts'] for j in js}, 'batches': {j['id']: j['batch'] for j in js},
            'regionLimited': list(REGION_LIMITED), 'setFirst': dict(SET_FIRST), 'slots': dict(GEAR_SLOT)}


def plan_json(argv):
    PLAN_PATH.write_text(json.dumps(plan_data(), indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    print(PLAN_PATH)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    {'gen': gen, 'cand': cand, 'pick': pick, 'note': note, 'approve': approve, 'silhouettes': silhouettes, 'publish': publish,
     'plan-json': plan_json}[cmd](sys.argv[2:])
