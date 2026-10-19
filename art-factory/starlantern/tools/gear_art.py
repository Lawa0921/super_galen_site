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

Batches (addendum S3): `sample` (the style: 32 parts), `main-gear` (127 parts), `skills` (78 icons). Every batch needs the
user's approval on its review page before `approve` and `publish` (addendum S4); `gen` refuses the later batches until
the sample is approved (`style_approved` at the registry root). Run from the repo root.
"""
import datetime, json, re, subprocess, sys, time
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
SAMPLE = ('sheet-gear-1', 'sheet-mat-1', 'sheet-rarity-frames', 'scene-forge', 'npc-forge')
LARGE, ICON = (60, 64), (24, 26)        # gear: (longer side, canvas) for the large image and the bag icon
ICON_HEIGHT = 32                        # materials and skills: the contract's icon row (--height 32)
NPC_HEIGHT = 180
SCENE_SIZE = P.SCENE_SIZE
FRAME_SIZE = {'glow-legendary': (20, 7)}   # (size, slice); every rarity frame is (16, 5)


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
# data/gear.ts regionSpecials(): each region's legendary and unique (the portal card lists them; unowned ones show a silhouette).
REGION_LIMITED = ('blaze-heart-sword', 'blaze-ember-ring', 'frost-winter-staff', 'frost-bloom-neck', 'storm-thunder-bow',
                  'storm-swift-boots', 'mire-miasma-mask', 'mire-whisper-gloves', 'shade-silent-blade', 'shade-raven-cloak',
                  'iron-unbroken-shield', 'iron-bulwark-plate')

# --- descriptions ------------------------------------------------------------------------------------------------------
BASE_TONE = 'plain everyday materials, low saturation, no glow'
LEGEND_TONE = 'a few small hard-edged bright orange ember highlights'
UNIQUE_TONE = 'fine gold filigree'
GEAR_BASE = {
    'wooden-staff': 'a plain wooden staff with a knotted head and a leather-wrapped grip, no gem',
    'iron-sword': 'a plain iron straight sword with a simple cross guard and a leather-wrapped grip',
    'hunter-bow': 'a plain wooden hunting bow with a taut string and a leather grip',
    'thorn-spear': 'a long spear with a wooden shaft wrapped in dark green thorny vines and an iron leaf-shaped head',
    # Addendum S5: the hero's weapon mastery follows these kinds, so they must read as a dagger and a scimitar at 24 px.
    'crystal-blade': 'a short dagger, clearly half the length of a normal blade, with a pale blue crystal blade and a plain iron hilt',
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
    'shade-silent-blade': 'a slim black dagger, half the length of a sword, with a deep indigo edge and a cloth-wrapped hilt',
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
SET_NOUN = {'weapon': 'a straight sword', 'offhand': 'a shield', 'head': 'a helm', 'body': 'a breastplate', 'hands': 'a pair of gauntlets',
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

FRAME_DESC = {
    'magic': 'magic: a steel-blue frame',
    'rare': 'rare: a bright yellow frame',
    'legendary': 'legendary: an orange frame with small flame-tongue corner ornaments',
    'unique': 'unique: a gold frame with carved filigree corner ornaments',
    'set': 'set: a green frame with a small leaf-shaped set emblem in each of the four corners',
    'glow-legendary': ('legendary glow: a square ring of orange glow 3 pixels wide, drawn as two or three hard-edged stepped colour bands '
                       '(bright yellow-orange inside, deep orange outside), never a soft gradient'),
}

# --- prompt templates (plan 5d "Prompt 策略") -----------------------------------------------------------------------------
GEAR_SHEET = (
    'A {cols} by {rows} grid of {n} pixel art RPG equipment item icons for a 16-bit Japanese console RPG, with flat pure magenta #FF00FF gutters and margin: '
    'thick magenta gutters between the items and a wide magenta margin around the grid; nothing touches the image edges. '
    'Each item drawn alone, about 64 by 64 art pixels, three-quarter item-icon view, long weapons on the diagonal with the hilt lower left and the tip upper right, '
    'light from the upper left, a bold readable silhouette that still reads at 24 pixels. '
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
FRAME_SHEET = (
    'A 3 by 2 grid of six square pixel art item-slot frames for a 16-bit Japanese console RPG, with flat pure magenta #FF00FF gutters and margin. '
    'Six square pixel-art item-slot frames, each a thin 2-pixel border with small ornamental corners, the inside of each frame perfectly flat magenta, '
    'straight edge segments designed to repeat; every frame the same square size. In this order, left to right, top to bottom: {listing}. '
    'Strict square pixel grid, crisp outline, limited palette, no anti-aliasing, no blur. No text, no numbers, no items inside the frames, '
    'no background inside the frames. ' + ORIGINAL)
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
    out.append(dict(id='sheet-rarity-frames', kind='frame-sheet', cols=3, rows=2, parts=frames, batch='sample', images=[], deps=[],
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
    if job['kind'] == 'frame-sheet': return ['ui-glow-legendary' if part == 'glow-legendary' else f'ui-rarity-{part}']
    return [part]


def silhouette_ids():
    return [f'gear-{k}-silhouette' for k in (*REGION_LIMITED, *SET_FIRST)]


def runtime(aid):
    """The contract path of a plan 5d asset (written only by `publish`)."""
    b = A.BASE
    if aid.startswith('gear-'): return f'{b}gear/{aid[5:]}.png'
    if aid.startswith('icon-'): return f'{b}icon/{aid[5:]}.png'
    if aid.startswith('ui-rarity-') or aid == 'ui-glow-legendary': return f'{b}ui/{aid[3:]}.png'
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


def make_anchor(reg):
    """raw/gear-refs/gear-anchor.png: the approved sheet-gear-1 raw at half size (plan 5d Task 9 Step 1)."""
    from PIL import Image
    src = chosen_raw(reg, 'gear-iron-sword')
    if src is None: raise PermissionError('sheet-gear-1 is not approved yet; the main-gear style anchor needs it')
    GEAR_ANCHOR.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGB'); im.resize((im.width // 2, im.height // 2), Image.NEAREST).save(GEAR_ANCHOR)


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
        if GEAR_ANCHOR in job['images'] and not GEAR_ANCHOR.exists(): make_anchor(reg)
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
        return {job['id']: A._finish(reg, job['id'], img, 'sprite', workdir, raw, height=NPC_HEIGHT)}
    # sheet_cells pads every inner cell with key pixels, so `subject cut by the canvas edge` only fires when the sheet cut it.
    cells = P.sheet_cells(img, job['cols'], job['rows'])
    out = {}
    for cell, part in zip(cells, job['parts']):
        if part is None or (parts and part not in parts): continue
        if job['kind'] == 'gear-sheet':
            out.update(A.process_gear_cell(reg, part, cell, workdir, raw, large=LARGE, icon=ICON))
        elif job['kind'] == 'icon-sheet':
            out[f'icon-{part}'] = A._finish(reg, f'icon-{part}', cell, 'sprite', workdir, raw, height=ICON_HEIGHT)
        else:
            aid = assets_of(job, part)[0]; size, sl = FRAME_SIZE.get(part, (16, 5))
            if 'defringe' not in reg.data['assets'].get(aid, {}): reg.set(aid, defringe='strong')   # UI frames (contract)
            out[aid] = A.nine_slice(reg, aid, cell, workdir, raw, size, sl)
    return out


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


def pick(argv):
    sid, k, part = _arg(argv, '--id'), _arg(argv, '--attempt'), _arg(argv, '--part')
    job = job_by_id(sid); reg = _registry()
    if part and part not in job['parts']: raise ValueError(f'{part} is not a part of {sid}')
    res = process_attempt(reg, job, RAW / sid / f'{sid}-a{k}.png', WORK / sid, parts=[part] if part else None)
    for aid in res:   # never `runtime`: that is written by publish, in the same commit as the artPaths change
        reg.set(aid, chosen_attempt=f'a{k}', source_id=sid, batch=label(job['batch']))
    print(json.dumps(res, ensure_ascii=False))
    return res


def note(argv):
    sid, k, reason = _arg(argv, '--id'), _arg(argv, '--attempt'), _arg(argv, '--reason')
    reg = _registry(); e = reg.data['assets'].setdefault(sid, {}); rej = e.get('rejected_attempts', {}); rej[f'a{k}'] = reason
    reg.set(sid, rejected_attempts=rej)


# --- approval and publishing -------------------------------------------------------------------------------------------

def do_approve(reg, batch, by):
    """Record the USER's approval of a batch (their words and the date in `by`): its qa_passed parts become approved."""
    lab = label(batch)
    if not by or not re.search(r'\d{4}-\d{2}-\d{2}', by):
        raise ValueError("--by must quote the user's approval and carry its date (YYYY-MM-DD)")
    if batch != 'sample' and not reg.data.get('style_approved'):
        raise PermissionError('the style sample is not approved yet')
    done = []
    for aid, e in reg.data['assets'].items():
        if e.get('batch') == lab and e.get('status') == 'qa_passed':
            e['status'] = 'approved'; e['approved_by'] = by; done.append(aid)
    today = datetime.date.today().isoformat()
    reg.data.setdefault('approved_batches', {})[batch] = {'by': by, 'date': today}
    if batch == 'sample': reg.data['style_approved'] = today
    reg._save()
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
    if batch not in reg.data.get('approved_batches', {}):
        raise PermissionError(f'batch {batch} has no recorded user approval; run approve after the user approves its review page')
    done = []
    for aid in sorted(a for a, e in reg.data['assets'].items() if e.get('batch') == lab and e.get('status') == 'approved'):
        rt = runtime(aid)
        if not rt: raise ValueError(f'{aid} has no plan 5d runtime path')
        reg.set(aid, runtime=rt); reg.publish(aid, public); done.append(aid)
        base = aid[5:] if aid.startswith('gear-') and not aid.endswith(('-large', '-silhouette')) else None
        if base and reg.data['assets'].get(f'icon-{base}', {}).get('status') == 'published':
            reg.retire(f'icon-{base}', public, f'replaced by gear-{base} (plan 5d)')
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
            'regionLimited': list(REGION_LIMITED), 'setFirst': dict(SET_FIRST)}


def plan_json(argv):
    PLAN_PATH.write_text(json.dumps(plan_data(), indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    print(PLAN_PATH)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    {'gen': gen, 'cand': cand, 'pick': pick, 'note': note, 'approve': approve, 'silhouettes': silhouettes, 'publish': publish,
     'plan-json': plan_json}[cmd](sys.argv[2:])
