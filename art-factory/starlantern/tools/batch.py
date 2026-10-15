"""batch.py [--only=prefix,...] [--max-attempts=N] [--reprocess]: write prompts and run codex generation + sl_art processing for Starlantern mass production.

Runs jobs in order, one codex call at a time. Skips ids already qa_passed/approved/published. A job whose dependency
has not passed is skipped. Each run makes at most one new attempt per id (re-run to retry failures).
"""
import json, subprocess, sys
from pathlib import Path

REPO = Path('C:/Users/bag57/.codex/worktrees/4182/super_galen_site')
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


# Target art-pixel heights per category; scarlet's approved sprites set the standee (283) and portrait (115) scale.
HEIGHT = {'standee': 280, 'portrait': 115, 'party': 32, 'enemy': 64, 'boss': 150, 'icon': 32, 'fx': 64}


# The five extra faces (spec section 5); each is generated from the character's normal portrait.
MOOD_FACES = {
    'hit': 'wincing in pain at the moment of being hit, one eye squeezed shut, a small scratch on the cheek, hair slightly messy',
    'attack': 'shouting a fierce battle cry, mouth open, sharp determined eyes, leaning forward into an attack',
    'dying': 'badly hurt and exhausted, bruised and dirty face, torn collar, sweat, half-closed eyes, breathing heavily',
    'down': 'knocked out and collapsed, eyes closed, head tilted down, battered and dusty, hair dishevelled',
    'ultimate': 'unleashing her ultimate technique: intense heroic expression, glowing eyes, wind-swept hair, a burst of colourful aura behind her',
}


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
    write('ui-frame', 'A square pixel art UI panel frame, 48 by 48 art pixels: dark navy fill, ornate brass border 16 art pixels wide with small star-lantern motifs in the four corners, the straight edge segments between the corners are plain and designed to repeat, fills the canvas edge to edge. 16-bit JRPG menu window style, strict square pixel grid, limited palette, no anti-aliasing. No text.')
    out.append(dict(id='ui-frame', images=[], kind='opaque'))
    return out


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
        if job.get('block'): args += ['--block', str(job['block'])]
        if job.get('height'): args += ['--height', str(job['height'])]
        p = subprocess.run(proc + args, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print(f'[{aid} a{n}] {(p.stdout or p.stderr).strip()[-600:]}', flush=True)


if __name__ == '__main__':
    main()
