"""batch.py [--only=prefix,...] [--max-attempts=N] [--reprocess]: write prompts and run codex generation + sl_art processing for Starlantern mass production.

Runs jobs in order, one codex call at a time. Skips ids already qa_passed/approved/published. A job whose dependency
has not passed is skipped. Each run makes at most one new attempt per id (re-run to retry failures).
"""
import json, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
RAW = Path('C:/Users/bag57/art-refs/starlantern/raw')
PROMPTS = AF / 'prompts'
TOOLS = AF / 'tools'
GEN = 'Generate the image once with the image tool; do not post-process, resize, quantize or regenerate it.'
PIX = 'strict square pixel grid, crisp 1px dark outline, limited palette, light from upper left, no anti-aliasing, no blur, no gradients'
ORIGINAL = 'The design must be original and not resemble any existing anime or game character.'

CHARS = {
    'noel': 'a cheerful apprentice witch girl with a short teal bob, blue eyes, a wide-brim purple witch hat with a crescent pin, an oversized purple star-patterned coat over a cream dress, and a crooked wooden staff with a blue orb',
    'chizuru': 'a calm shrine-maiden spear fighter girl with long black hair in a low ponytail with a red and white hair ornament, brown eyes, a red and white layered outfit with sky-blue cords and a naginata',
    'liz': 'a tomboy treasure hunter girl with spiky short blonde hair, blue eyes, brass goggles on her head, an orange scarf, a short brown jacket over a plain cream shirt that covers her midriff, khaki shorts, big boots and a pair of daggers',
    'sylvie': 'a gentle forest ranger girl with a long braided chestnut ponytail, green eyes, a leaf-green hooded cloak, a tan tunic, leather bracers, a quiver and a longbow',
    'selene': 'a sleepy moon mage girl with long pale lavender wavy hair, violet eyes, a navy star-patterned hooded cloak with a crescent hairpin, a cream dress, and a staff topped with a small glowing lantern',
    'safira': 'a dark-skinned desert dancer swordswoman with long white braids, warm brown eyes, a turquoise and gold dancer outfit with a modest long-sleeved top that covers her midriff, a flowing sash, and twin curved scimitars',
    'bobby': 'a cheerful mechanic girl with pink twin-tails, amber eyes, brass goggles on her head, a white shirt with rolled sleeves, yellow work overalls, a tool belt and a giant wrench',
}
ENEMIES = {
    'bat': 'a grey stone-winged ruin bat with glowing amber eyes, wings spread',
    'wolf': 'a lean green-grey wolf with thorny vines growing along its back, snarling',
    'beetle': 'a large beetle whose shell is made of blue crystal plates',
    'wisp': 'a floating ice-crystal spirit with a pale cyan glowing core and sharp crystal shards orbiting it',
    'lizard': 'a stocky cave lizard with dark teal scales and crystal spikes on its back',
    'golem': 'a violet stone temple golem with gold inlay and a glowing star emblem on its chest',
    'shade': 'a hooded dusk shadow mage, faceless dark hood, tattered violet robes, holding a dim violet orb',
    'lanterneater': 'a huge boss monster that devours star lanterns: an imposing dark-furred horned beast with swallowed golden lanterns glowing through cracks in its chest, glowing eyes, claws',
}
TERRAIN = {
    2: ('dark blue crystal cave with glowing cyan crystals and wet rock', 'dark raised blue-black rock with cyan crystal shards on top', 'pale blue-grey smooth cave floor'),
    3: ('ancient star temple of deep violet stone with gold trim and floating lantern lights', 'a solid dark violet stone block filling the whole wall tile edge to edge with gold trim on top, no floor visible in it', 'pale cream marble temple floor with faint gold star inlays'),
}
ICONS = {
    'fire-star': 'a red five-pointed star wrapped in flame', 'ice-star': 'a pale blue five-pointed star made of ice', 'hex': 'a purple curse sigil with a downward arrow',
    'thunder-star': 'a yellow star with a lightning bolt', 'sweep': 'a spear sweeping in a wide arc', 'ward': 'a glowing red and white shrine barrier charm',
    'pierce': 'a spear tip thrusting forward', 'twin-slash': 'two crossed daggers', 'stealth': 'a hooded silhouette fading into shadow',
    'treasure-sense': 'a magnifying glass over a gold coin', 'triple-slash': 'three parallel slash marks', 'aimed-shot': 'an arrow on a crosshair',
    'pin-shot': 'an arrow pinning a boot to the ground', 'arrow-rain': 'many arrows falling from the sky', 'provoke': 'a red angry shout symbol over a shield',
    'flame-burst': 'a sword engulfed in an explosion of fire', 'iron-wall': 'a heavy iron tower shield', 'moonlight': 'a crescent moon shedding healing light',
    'cleanse': 'a water droplet with a sparkle', 'dream': 'a sleepy cloud with Z shapes and a star', 'rebirth': 'a feather glowing under a crescent moon',
    'blade-dance': 'two curved scimitars crossing in a spiral', 'war-dance': 'a flowing turquoise sash with sparkles', 'mirage': 'a blurred double silhouette',
    'turret': 'a small brass cannon turret', 'tinker': 'a wrench and a gear', 'barrier': 'a glowing hexagon shield generator',
    'potion': 'a red healing potion bottle', 'ether': 'a blue magic potion bottle', 'antidote': 'a green antidote vial with a leaf',
    'phoenix': 'a golden phoenix feather', 'return-lamp': 'a small brass lantern with a warm light',
    'moss': 'a clump of glowing green moss', 'bat-wing': 'a grey bat wing membrane', 'thorn-fang': 'a curved fang with thorns',
    'crystal-shell': 'a blue crystal shell fragment', 'ice-crystal': 'a pale cyan ice crystal core', 'lizard-scale': 'a teal lizard scale',
    'star-stone': 'a violet stone with a gold star pattern', 'dusk-cloth': 'a folded dark violet cloth', 'old-coin': 'an ancient silver coin',
    'ancient-gear': 'an old bronze gear', 'wooden-staff': 'a simple wooden staff', 'iron-sword': 'an iron sword', 'hunter-bow': 'a wooden hunting bow',
    'thorn-spear': 'a spear wrapped in thorny vines', 'crystal-blade': 'a sword with a blue crystal blade', 'frost-staff': 'a staff topped with an ice crystal',
    'star-saber': 'a curved saber with a gold star pattern', 'cloth-robe': 'a simple cloth robe', 'leather-vest': 'a brown leather vest',
    'scale-mail': 'a teal scale mail armor', 'dusk-mantle': 'a dark violet hooded mantle', 'moss-charm': 'a round charm with glowing moss',
    'bat-earring': 'a small bat-wing earring', 'crystal-pendant': 'a pendant with a blue crystal core', 'gear-ring': 'a ring shaped like a gear',
}
FX = {
    'slash': 'a single bright white diagonal sword slash arc', 'pierce': 'a sharp straight thrust streak with a star burst at the tip',
    'strike': 'a blunt impact burst with radiating lines', 'fire': 'a burst of orange and red flames', 'ice': 'a cluster of jagged pale blue ice shards',
    'thunder': 'a jagged yellow lightning bolt strike', 'heal': 'rising green and white sparkles with a small plus sign', 'buff': 'an upward golden arrow with sparkles',
}

# Animated effects: four frames per effect (wind-up, impact, spread, fade), generated as one strip.
FX_ANIM = {
    'slash': ('a thin bright glint line appearing at the upper right', 'a wide crescent sword arc slicing diagonally, white-hot core with a pale cyan edge', 'the arc bursting into a sharp X-shaped slash flash with flying white shards', 'thin fading arc fragments and a few small sparkles'),
    'pierce': ('a small converging point of light with short speed lines', 'a long straight thrust streak piercing horizontally with a star burst at the tip', 'the star burst opening into a ring of sharp spikes while the streak thins', 'scattered small diamond-shaped sparks and a broken thin line'),
    'strike': ('a small compressed white impact flash', 'a huge jagged starburst impact with thick radiating lines', 'an expanding shockwave ring with rock-like debris chunks flying outward', 'a thin broken ring and a few small dust puffs'),
    'fire': ('a small ember spark igniting', 'a big explosion of orange and red flames with a yellow-white core', 'flames billowing outward into tongues of fire with flying embers', 'thin dark smoke wisps and a few small dying embers'),
    'ice': ('a few small frost crystals forming in a ring', 'a cluster of large jagged pale blue ice shards erupting upward', 'the ice shards shattering outward into sharp fragments with frosty puffs', 'small glittering ice flakes drifting down'),
    'thunder': ('a crackle of small electric sparks at the top', 'a thick jagged yellow-white lightning bolt striking straight down', 'a bright electric burst at the impact point with branching sparks', 'fading thin static zigzags and a few sparks'),
    'heal': ('a few small green glimmers rising from below', 'a bright column of green and white light with a big plus-shaped sparkle', 'many green and white sparkles and small plus signs spiralling upward', 'a few faint twinkles fading near the top'),
    'buff': ('a golden ring of light forming at the bottom', 'a bright upward golden arrow surge with a radiant aura', 'golden rings and sparkles rising and spreading outward', 'a few small golden twinkles fading near the top'),
}

# Per-effect additions after a rejected attempt (heal a1: faded grey-pink speckles that blend into the magenta key).
FX_ANIM_NOTE = {
    'heal': ' Every pixel is a solid, fully opaque, saturated green, white or pale yellow; fading is shown only by fewer and smaller sparkles, never by greyish, pinkish or translucent-looking pixels. No grey dust or speckle noise.',
}


# Target art-pixel heights per category; scarlet's approved sprites set the standee (283) and portrait (115) scale.
HEIGHT = {'npc': 180, 'logo': 90, 'cursor': 12, 'standee': 280, 'portrait': 115, 'party': 32, 'enemy': 64, 'boss': 150, 'icon': 32, 'fx': 64}


# The five extra faces (spec section 5); each is generated from the character's normal portrait.
MOOD_FACES = {
    'hit': 'wincing in pain at the moment of being hit, one eye squeezed shut, a small scratch on the cheek, hair slightly messy',
    'attack': 'shouting a fierce battle cry, mouth open, sharp determined eyes, leaning forward into an attack',
    'dying': 'badly hurt and exhausted, bruised and dirty face, torn collar, sweat, half-closed eyes, breathing heavily',
    'down': 'knocked out and collapsed, eyes closed, head tilted down, battered and dusty, hair dishevelled',
    'ultimate': 'unleashing her ultimate technique: intense heroic expression, glowing eyes, wind-swept hair, a burst of colourful aura behind her',
}


UI_SCENES = {
    'title': 'Title screen landscape: the frontier town of Lumia at dusk wrapped in thick evening mist, seen from a hill, with a huge glowing crack in the ground beyond the town where star-lantern light spills out',
    'town': 'Main street of the frontier town of Lumia at dusk: stone-paved road, timber-framed houses with warm lit windows, hanging lanterns, evening mist, the glowing labyrinth crack visible far away',
    'guild': "Interior of an adventurers' guild hall: a long wooden reception counter on the left, a notice board with pinned papers, hanging oil lamps, wooden beams, the right third of the picture kept fairly plain for a character to stand in front of",
    'shop': 'Interior of a cosy item shop: shelves of potions, bottles and gear, a wooden counter, herbs hanging from the ceiling, warm lamplight, the right third kept fairly plain',
    'inn': 'Interior of a warm inn lobby: fireplace, wooden stairs to the rooms, a front desk with a bell, rugs, evening light, the right third kept fairly plain',
    'gate': "Adventurers' camp at the edge of the glowing labyrinth crack: wooden palisade, a guard post, torches, supply crates, mist, the right third kept fairly plain",
}
# Japanese anime-style character design rendered as pixel art (user: keep pixel art, but the art style behind it should feel Japanese).
JP = 'Japanese anime-style JRPG character design rendered as detailed pixel art, like a classic Japanese console RPG portrait: anime proportions, large expressive eyes, clean facial lines, stylised anime hair'
UI_NPCS = {
    'guild': (f'{JP}; the guild receptionist, a capable gentle young woman with short chestnut hair, a neat dark green vest uniform with a guild badge', 'guild hall'),
    'shop': (f'{JP}; the item shop keeper, a cheerful youthful-looking man in his thirties with messy ash-blond hair tied back, narrow smiling eyes, round glasses, a brown apron full of pockets with potion bottles', 'item shop'),
    'inn': (f'{JP}; the innkeeper, a kind young-looking woman with long auburn hair in a loose side braid, gentle eyes, a cream blouse and a striped apron', 'inn'),
    'gate': (f'{JP}; the gate guard, a stern handsome veteran knight in his thirties with short silver hair, a small scar on the cheek, a red scarf, steel and leather armour, holding a spear', 'camp'),
}


# Auto-tiling walls (wall-top tiles in x and y, wall-face tiles in x). Theme words follow the approved f<n> wall/floor.
WALLS = {
    1: ('mossy forest ruins', 'rough grey-green ruin stones packed tightly together, patches of bright moss, small leaves and thin roots creeping across the stones',
        'grey-green ruin stone bricks in straight horizontal courses with moss in the joints and a few hanging leaves'),
    2: ('dark blue crystal cave', 'dark blue-black cave rock with uneven cracks and small clusters of glowing cyan crystal shards scattered across it',
        'dark blue-black layered cave rock in rough horizontal bands with a few small glowing cyan crystals embedded in it'),
    3: ('ancient star temple', 'deep violet stone slabs laid in an irregular pattern with a few small gold star studs, no straight lines along the tile edges',
        'deep violet temple stone blocks in straight horizontal courses with a thin gold inlay line running straight across'),
}
TILES = REPO / 'public/assets/games/starlantern/tiles'
WALL_SIZE = 62  # art pixels; matches the approved f<n>-floor / f<n>-wall tiles


def tile_ref(name, scale=8):
    """Nearest-upscaled copy of a runtime tile (outside the repo) so codex can read its pixels as a style reference."""
    from PIL import Image
    out = RAW / 'tile-refs' / f'{name}-x{scale}.png'
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(TILES / f'{name}.png').convert('RGB'); im.resize((im.width * scale, im.height * scale), Image.NEAREST).save(out)
    return out


def wall_jobs():
    out = []
    for n, (place, top, face) in WALLS.items():
        style = (f'Match the pixel density, palette, colour values, lighting (light from upper left) and shading of the attached approved wall and floor tiles of this {place} area; '
                 f'the wall must stay clearly darker and more solid than the floor tile so walls and walkways read apart. 16-bit JRPG style, strict square pixel grid, limited palette, no anti-aliasing, no blur. No text.')
        tid, fid = f'tile-f{n}-wall-top', f'tile-f{n}-wall-face'
        write(tid, f'One square top-down pixel art map tile of the flat top surface of a thick dungeon wall in a {place}, seen from directly above: {top}. '
                   f'This is a seamless repeating texture: it must tile perfectly when the same tile is placed to its left, right, top and bottom, so every stone, crack and moss patch runs off one edge and continues on the opposite edge. '
                   f'No border, no frame, no outline around the tile, no rim, no edge highlight or edge shadow, no corner ornaments, nothing centred. Fill the whole square edge to edge, about {WALL_SIZE} by {WALL_SIZE} art pixels. {style}')
        write(fid, f'One square pixel art map tile of the vertical south-facing front of a thick dungeon wall in a {place}, as seen in a top-down JRPG map where the wall face stands toward the viewer: {face}. '
                   f'It must tile seamlessly left and right: the courses run straight across and continue off both side edges, with no pillar, no side border and no vertical line at the left or right edge. '
                   f'Top edge: a thin capstone lip whose colours continue directly from the first attached image (the wall-top texture), because this tile sits right below it. '
                   f'Bottom edge: the foot of the wall, a slightly darker base course with a thin dark contact shadow along the very bottom; do not draw any floor. '
                   f'Fill the whole square edge to edge, about {WALL_SIZE} by {WALL_SIZE} art pixels. {style}')
        refs = [tile_ref(f'f{n}-wall'), tile_ref(f'f{n}-floor')]
        out += [dict(id=tid, images=refs, kind='tile-wrap', wrap='xy', size=WALL_SIZE),
                dict(id=fid, images=[('dep', tid)] + refs, kind='tile-wrap', wrap='x', size=WALL_SIZE, dep=tid)]
    return out


def newest(aid):
    files = sorted((RAW / aid).glob(f'{aid}-a*.png'), key=lambda p: p.stat().st_mtime)
    files = [f for f in files if not f.stem.endswith('-magenta')]
    return files[-1] if files else None


def write(aid, text):
    PROMPTS.mkdir(exist_ok=True)
    (PROMPTS / f'{aid}.txt').write_text(text.strip() + ' ' + GEN + '\n', encoding='utf-8')


def jobs():
    out = []
    anchor = newest('char-scarlet-standee')
    for c, desc in CHARS.items():
        sid, pid = f'char-{c}-standee', f'char-{c}-portrait'
        write(sid, f'Full-body pixel art character sprite of an original heroine: {desc}. Match the art style, proportions, pixel density, outline and colouring of the first attached image, which shows an approved sprite of a different character. Use the second attached image only for this character\'s hair, colours, outfit and weapon. Standing three-quarter view facing the viewer and slightly left, relaxed idle pose, plain practical adventurer outfit, about 5 heads tall. 16-bit JRPG style, {PIX}. Centred on a perfectly flat solid pure magenta #FF00FF background with generous empty space around her. No text, no labels, no ground shadow, no particles. {ORIGINAL}')
        write(pid, f'Square bust portrait in pixel art of the same girl as the attached full-body sprite ({desc}), head and shoulders only, gentle confident expression, facing slightly left. Match the framing and style of a 16-bit JRPG dialogue portrait, {PIX}. Perfectly flat solid pure magenta #FF00FF background around her with empty margin, no frame, no text.')
        for mood, face in MOOD_FACES.items():
            write(f'char-{c}-portrait-{mood}', f'Square bust portrait in pixel art of exactly the same girl as the attached portrait, same framing, size, palette and outfit, but {face}. 16-bit JRPG dialogue portrait style, {PIX}. Perfectly flat solid pure magenta #FF00FF background around her with empty margin, no frame, no text.')
        out += [dict(id=sid, images=[anchor, AF / f'reference/crops/{c}.png'], kind='sprite', height=HEIGHT['standee']),
                dict(id=pid, images=[('dep', sid)], kind='sprite', dep=sid, height=HEIGHT['portrait'])]
        out += [dict(id=f'char-{c}-portrait-{mood}', images=[('dep', pid)], kind='sprite', dep=pid, height=HEIGHT['portrait']) for mood in MOOD_FACES]
    # Scarlet's standee and normal portrait are the approved style samples; only her extra faces are generated here.
    for mood, face in MOOD_FACES.items():
        if mood == 'hit': continue
        write(f'char-scarlet-portrait-{mood}', f'Square bust portrait in pixel art of exactly the same girl as the attached portrait, same framing, size, palette and outfit, but {face}. 16-bit JRPG dialogue portrait style, {PIX}. Perfectly flat solid pure magenta #FF00FF background around her with empty margin, no frame, no text.')
        out.append(dict(id=f'char-scarlet-portrait-{mood}', images=[('dep', 'char-scarlet-portrait')], kind='sprite', dep='char-scarlet-portrait', height=HEIGHT['portrait']))
    write('sheet-map-party', f'Pixel art map icon of one small chibi adventurer in a hooded travelling cloak carrying a glowing star lantern, drawn four times in one row with wide magenta gaps: walking up seen from behind, walking down seen from the front, walking left, walking right. Tiny top-down RPG map sprite, about 24 art pixels tall each, 16-bit JRPG style, {PIX}. Perfectly flat solid pure magenta #FF00FF background. No text. {ORIGINAL}')
    out.append(dict(id='sheet-map-party', images=[], kind='strip', parts=['map-party-up', 'map-party-down', 'map-party-left', 'map-party-right'], height=HEIGHT['party']))
    write('map-fog', f'One square top-down pixel art map tile of unexplored darkness: deep blue-black swirling mist with a few faint wisps, very dark so it hides what is underneath, designed to tile seamlessly when repeated in every direction, fills the square edge to edge, about 32 by 32 art pixels. 16-bit JRPG style, strict square pixel grid, limited palette, no anti-aliasing. No text.')
    out.append(dict(id='map-fog', images=[newest('sheet-tiles-f1')], kind='opaque', block=6))
    slime = newest('enemy-slime')
    for e, desc in ENEMIES.items():
        tall = 'about 160 art pixels tall, filling much of the canvas' if e == 'lanterneater' else 'about 72 art pixels tall'
        write(f'enemy-{e}', f'Pixel art monster sprite of {desc}, facing the viewer, full body. Match the art style, pixel density, outline and shading of the attached approved monster sprite. 16-bit JRPG battle sprite, {tall}, {PIX}. Centred on a perfectly flat solid pure magenta #FF00FF background with empty space around it. No text, no ground shadow, no particles. {ORIGINAL}')
        out.append(dict(id=f'enemy-{e}', images=[slime], kind='sprite', height=HEIGHT['boss' if e == 'lanterneater' else 'enemy']))
    tiles = ['wall', 'floor', 'door', 'up', 'down', 'chest', 'chest-open', 'entrance', 'boss']
    for n, (place, wall, floor) in TERRAIN.items():
        write(f'sheet-tiles-f{n}', f'A 3 by 3 grid of nine square top-down pixel art dungeon map tiles for a {place}, separated by thick flat pure magenta #FF00FF gutters, with a magenta margin around the whole grid. Match the layout, perspective, pixel density and contrast of the attached approved tile sheet, which belongs to a different area. Walls and floors must contrast strongly: walls are {wall} with a dark shadow; floors are a {floor} walkway. Row 1: raised wall block, walkable floor, door set in the floor path. Row 2: stairs going up, stairs going down into a dark hole, closed treasure chest standing on the floor. Row 3: opened empty treasure chest on the floor, softly glowing entrance circle on the floor, ominous sealed boss gate with red runes on the floor. Every tile is the same square size and fills its square edge to edge. 16-bit JRPG style, strict square pixel grid, limited palette, no anti-aliasing, no blur. No text.')
        out.append(dict(id=f'sheet-tiles-f{n}', images=[newest('sheet-tiles-f1')], kind='tile-sheet', parts=[f'tile-f{n}-{t}' for t in tiles], block=6))
        write(f'bg-f{n}', f'Wide 16:9 pixel art battle backdrop of a {place}, first-person view down a corridor, empty open foreground where monsters will stand. Match the art style, pixel density and composition of the attached approved backdrop of a different area. 16-bit JRPG battle background style, strict square pixel grid, limited palette, no anti-aliasing, no blur. No characters, no monsters, no text, no UI. Fill the whole canvas edge to edge.')
        out.append(dict(id=f'bg-f{n}', images=[newest('bg-f1')], kind='opaque', block=4))
    reg = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    for k in (1, 2, 3):
        parts = [p[5:] for p in reg[f'sheet-icons-{k}']['parts']]
        names = list(parts) + ['plain empty stone slab'] * (20 - len(parts))
        listing = '; '.join(f'{i + 1}) {ICONS.get(p, p)}' for i, p in enumerate(names))
        write(f'sheet-icons-{k}', f'A 5 by 4 grid of twenty small square pixel art RPG icons separated by thick flat pure magenta #FF00FF gutters, with a magenta margin around the grid. Each icon sits alone on magenta and has the same size, about 24 by 24 art pixels. In this order, left to right, top to bottom: {listing}. 16-bit JRPG item icon style, {PIX}. No text, no numbers, no frames.')
        out.append(dict(id=f'sheet-icons-{k}', images=[], kind='icon-sheet', parts=[f'icon-{p}' for p in parts], height=HEIGHT['icon']))
    for k, desc in FX.items():
        write(f'fx-{k}', f'Single pixel art battle effect of {desc}, bold flat shapes, no soft glow gradients, no transparency, 16-bit JRPG style, strict square pixel grid, about 64 art pixels tall. Centred on a perfectly flat solid pure magenta #FF00FF background with empty space around it. No text.')
        out.append(dict(id=f'fx-{k}', images=[], kind='sprite', height=HEIGHT['fx']))
    for k, (f1, f2, f3, f4) in FX_ANIM.items():
        write(f'fx-{k}-anim', f'A horizontal animation strip of four pixel art battle effect frames for a classic Japanese 16-bit console RPG: {FX[k]}. Exactly four frames in one row, left to right, each frame alone in its own equal-width cell, separated by wide empty gutters of perfectly flat solid pure magenta #FF00FF, with a magenta margin around the whole strip; nothing touches the image edges and no frame overlaps another. Frame 1 (wind-up): {f1}. Frame 2 (impact): {f2}. Frame 3 (spread): {f3}. Frame 4 (fade): {f4}. The four frames are one effect playing in place: same scale, same centre point in every cell; the impact frame is the biggest, about 64 art pixels tall. Powerful, high-contrast, punchy effect with a strong sense of light: glow is drawn as two or three hard-edged stepped colour bands around a bright white-hot core, with no soft gradients, no blur and no semi-transparency. Keep the colours and motif of the attached earlier single-frame effect but make it bolder. Strict square pixel grid, crisp dark outline where needed, limited palette, no anti-aliasing. The design must be original. No text, no numbers, no cell borders, no grid lines.{FX_ANIM_NOTE.get(k, "")}')
        out.append(dict(id=f'fx-{k}-anim', images=[newest(f'fx-{k}')], kind='fx-anim', frames=4, height=HEIGHT['fx']))
    # --- Game UI (plan 3): scenes, NPC busts, logo, window frame, cursor ---
    bg1, anchor_char = newest('bg-f1'), newest('char-scarlet-standee')
    SCENE = 'Match the pixel art style, palette and pixel density of the attached approved backdrop. 16:9 pixel art scene, 16-bit JRPG style, strict square pixel grid, limited palette, no anti-aliasing, no blur. No people, no text, no letters, no signs with writing. Fill the whole canvas edge to edge.'
    for sid, desc in UI_SCENES.items():
        write(f'scene-{sid}', f'{desc}. {SCENE}')
        out.append(dict(id=f'scene-{sid}', images=[bg1], kind='opaque', block=4))
    for nid, (desc, place) in UI_NPCS.items():
        for mood, face in (('normal', 'calm friendly expression'), ('happy', 'bright happy smile, eyes slightly closed')):
            aid = f'npc-{nid}' if mood == 'normal' else f'npc-{nid}-happy'
            ref = [anchor_char] if mood == 'normal' else [('dep', f'npc-{nid}')]
            same = ' Keep exactly the same outfit, colours and accessories as the attached portrait of this same person, and keep both arms and hands fully inside the canvas.' if mood == 'happy' else ''
            write(aid, f'Pixel art half-body portrait (from the waist up) of an original character: {desc}, {face}, facing slightly left, standing in a {place}.{same} Match the art style, pixel density, outline and colouring of the attached approved sprite (a different character). 16-bit JRPG style, {PIX}. Perfectly flat solid pure magenta #FF00FF background around the figure; the body may be cut off by the bottom edge. No text. {ORIGINAL}')
            out.append(dict(id=aid, images=ref, kind='sprite', height=HEIGHT['npc'], **({'dep': f'npc-{nid}'} if mood == 'happy' else {})))
    write('ui-logo', 'Game title logo reading exactly the four Traditional Chinese characters 星燈迷宮 in large bold pixel art lettering, warm gold letters with a dark outline, a small glowing star lantern ornament woven into the design, 16-bit JRPG title logo style, strict square pixel grid, limited palette, no anti-aliasing. Perfectly flat solid pure magenta #FF00FF background around it. No other text.')
    out.append(dict(id='ui-logo', images=[], kind='sprite', height=HEIGHT['logo']))
    write('ui-window', 'A square pixel art game menu window frame, 48 by 48 art pixels, seen flat on: a thin gold border two pixels wide with a dark navy inner line, small star-lantern ornaments in the four corners, straight edges designed to repeat. The whole inside of the frame is perfectly flat solid pure magenta #FF00FF (it will become transparent). 16-bit JRPG menu window style, strict square pixel grid, no anti-aliasing. No text.')
    out.append(dict(id='ui-window', images=[], kind='sprite', block=4))
    write('ui-cursor', 'A tiny pixel art menu cursor: a gold arrow pointing right with a dark outline, about 12 art pixels tall, 16-bit JRPG style, strict square pixel grid, no anti-aliasing. Centred on a perfectly flat solid pure magenta #FF00FF background with empty space around it. No text.')
    out.append(dict(id='ui-cursor', images=[], kind='sprite', height=HEIGHT['cursor']))
    write('ui-frame', 'A square pixel art UI panel frame, 48 by 48 art pixels: dark navy fill, ornate brass border 16 art pixels wide with small star-lantern motifs in the four corners, the straight edge segments between the corners are plain and designed to repeat, fills the canvas edge to edge. 16-bit JRPG menu window style, strict square pixel grid, limited palette, no anti-aliasing. No text.')
    out.append(dict(id='ui-frame', images=[], kind='opaque'))
    return out + wall_jobs()


def status(reg, aid):
    return reg['assets'].get(aid, {}).get('status', 'todo')


def passed(reg, job):
    ids = job.get('parts') or [job['id']]
    return all(status(reg, i) in ('qa_passed', 'approved', 'published') for i in ids)


def main():
    only = next((a.split('=', 1)[1].split(',') for a in sys.argv[1:] if a.startswith('--only=')), None)
    reprocess = '--reprocess' in sys.argv
    maxa = int(next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--max-attempts=')), 3))
    for job in jobs():
        aid = job['id']
        if only and not any(aid.startswith(o) for o in only): continue
        reg = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))
        if reprocess:
            if aid.startswith(('char-scarlet', 'enemy-slime', 'sheet-tiles-f1', 'bg-f1')): continue
            n = len([p for p in (RAW / aid).glob(f'{aid}-a*.png') if not p.stem.endswith('-magenta')])
            if n == 0: continue
        elif passed(reg, job): print(f'[skip passed] {aid}', flush=True); continue
        if not reprocess and job.get('dep') and status(reg, job['dep']) not in ('qa_passed', 'approved', 'published'):
            print(f'[skip dep {job["dep"]} not passed] {aid}', flush=True); continue
        if not reprocess:
            n = len([p for p in (RAW / aid).glob(f'{aid}-a*.png') if not p.stem.endswith('-magenta')]) + 1
            if n > maxa: print(f'[give up after {maxa}] {aid}', flush=True); continue
        images = [str(newest(i[1])) if isinstance(i, tuple) else str(i) for i in job['images'] if i]
        argv = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(RAW / aid), '--name', f'{aid}-a{n}.png', '--prompt-file', str(PROMPTS / f'{aid}.txt')]
        for im in images: argv += ['--image', im]
        if job['kind'] == 'strip': argv += ['--strip-auto', str(len(job['parts']))]
        g = subprocess.run(argv, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace') if not reprocess else None
        # codex_still exits 1 when its own gate fails; sl_art re-checks every gate, so its verdict is the one recorded.
        raw = RAW / aid / f'{aid}-a{n}.png'
        if not raw.exists(): print(f'[no output] {aid} a{n}: {g.stdout[-300:] if g else ""}', flush=True); continue
        proc = [sys.executable, str(TOOLS / 'sl_art.py'), 'process']
        if job['kind'] == 'strip':
            frames = RAW / aid / f'{aid}-a{n}-frames'
            if not frames.exists(): print(f'[strip split failed] {aid} a{n}: {g.stdout[-300:] if g else ""}', flush=True); continue
            for k, part in enumerate(job['parts']):
                p = subprocess.run(proc + ['--id', part, '--raw', str(frames / f'{k}.png'), '--kind', 'sprite', '--height', str(job['height'])], cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
                print(f'[{part}] {p.stdout.strip()[-400:]}', flush=True)
            continue
        args = ['--id', aid, '--raw', str(raw), '--kind', job['kind']]
        if job['kind'] in ('tile-sheet', 'icon-sheet'): args += ['--cols', '3' if job['kind'] == 'tile-sheet' else '5', '--rows', '3' if job['kind'] == 'tile-sheet' else '4', '--ids', ','.join(job['parts'])]
        if job['kind'] == 'fx-anim': args += ['--frames', str(job['frames'])]
        if job['kind'] == 'tile-wrap': args += ['--wrap', job['wrap'], '--size', str(job['size'])]
        if job.get('block'): args += ['--block', str(job['block'])]
        if job.get('height'): args += ['--height', str(job['height'])]
        p = subprocess.run(proc + args, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print(f'[{aid} a{n}] {(p.stdout or p.stderr).strip()[-600:]}', flush=True)


if __name__ == '__main__':
    main()
