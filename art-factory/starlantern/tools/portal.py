"""portal.py: art candidates for the portal roguelike dungeon (plan 4, Task 10, items 1-4).

  gen  [--only=prefix,...] [--n=N]      generate codex attempts (one at a time) until each id has N raw attempts
  cand [--only=prefix,...]              postprocess every raw attempt into work/<id>/cand/a<N>/ (scratch registry)
  pick --id ID --attempt N [--part P]   postprocess the chosen attempt into the real registry (status qa_passed/failed)
  note --id ID --attempt N --reason R   record why an attempt was not chosen (registry `rejected_attempts`)

Assets: scene-portal-plaza (opaque, 418x235 like the other scenes), portal-card-<region> (opaque 180x110),
sheet-trait-icons -> icon-trait-<k> (transparent, 32 high), sheet-event-tiles -> tile-event-<k> (transparent, centred on
a 62x62 canvas = one map cell, one shared scale per sheet). Nothing here approves or publishes.
"""
import json, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
RAW = Path('C:/Users/bag57/art-refs/starlantern/raw')
REFS = RAW / 'portal-refs'
PROMPTS = AF / 'prompts'
TOOLS = AF / 'tools'
GEN = 'Generate the image once with the image tool; do not post-process, resize, quantize or regenerate it.'
PIX = 'strict square pixel grid, crisp 1px dark outline, limited palette, light from upper left, no anti-aliasing, no blur, no gradients'

SCENE_SIZE = (418, 235)   # the approved scene-*.png size
CARD_SIZE = (180, 110)
EVENT_CANVAS = 62         # one map cell (f<n>-floor is 62x62 art pixels)
# Parts with no intended purple or pink: strip key fringe harder and repair key-mixed shadows and glows
# (registry flags `defringe: strong`, `deblend`, `neutralize_tint`; see contract).
STRONG_DEFRINGE = {'icon-trait-fire', 'icon-trait-ice', 'icon-trait-thunder', 'icon-trait-iron'} | {f'tile-event-{k}' for k in ('fountain', 'merchant', 'altar', 'elite', 'vault', 'vault-open', 'key', 'trap')}
EVENT_MAX = 50            # largest event object side in art pixels (sets the shared block of an event sheet)

PLAZA = (
    'Night scene of an ancient stone plaza at the edge of a frontier town, where adventurers depart through magic portals. '
    'Three tall ancient stone portal arches stand side by side across the middle of the picture on a low raised stone terrace with two or three wide steps, evenly spaced, the middle arch slightly taller. '
    'Each arch has its own character: the left arch is pale grey weathered stone with ivy and leaf carvings; the middle arch is dark stone with gold star-lantern ornaments and a small star at the keystone; the right arch is dark basalt with angular carved runes. '
    'Inside each arch spins a glowing magic vortex drawn with hard-edged stepped colour bands: the left one teal and cyan, the middle one warm gold and amber, the right one deep indigo and violet. '
    'The vortex light spills in soft pools onto the stone in front of each arch. Deep blue night sky full of small stars above, distant silhouettes of forest hills and a ruined tower, two stone lanterns with warm flames beside the terrace, a few floating motes of light. '
    'Composition: the arches fill the upper-middle band of the picture and their bases sit at about 55 percent of the image height; '
    'the lower 40 percent of the picture is an open, calm, fairly plain stretch of worn flagstone paving with no objects on it, '
    'and the left quarter of the picture is quiet and dark with little detail (dark trees and a plain old wall), because interface cards will be laid over the bottom and the left. '
    'Eye-level view looking straight at the arches. '
    'Match the pixel art style, palette depth, outline treatment and pixel density of the attached approved scenes of the same game. '
    '16:9 pixel art scene, 16-bit Japanese console RPG style, strict square pixel grid, limited palette, no anti-aliasing, no blur. '
    'No people, no text, no letters, no signs with writing. Fill the whole canvas edge to edge.')

CARD = (
    'A small landscape illustration for a dungeon portal card in a 16-bit Japanese console RPG, pixel art, wide 18 by 11 format. Subject: {desc}. '
    'Fixed composition shared by the whole card set: eye-level view standing at the start of a path; the path or open ground begins at the bottom centre and leads the eye to one clear landmark in the middle distance slightly right of centre; '
    'darker framing shapes at the left and right edges; sky or ceiling fills the top quarter; light comes from the upper left; slightly darker corners. '
    'Bold, readable shapes that still read when the picture is shown only 180 by 110 pixels: large simple masses, strong value contrast between the landmark and the background, chunky pixel clusters, no tiny noisy detail. '
    'Match the pixel art style, palette depth and outline treatment of the attached approved scene from the same game. '
    'Strict square pixel grid, limited palette, no anti-aliasing, no blur. No people, no monsters, no text, no letters, no frame, no border. Fill the whole canvas edge to edge.')

REGIONS = {
    'mainline': 'the main Star-Lantern Labyrinth: the entrance of a mossy forest ruin, a crumbling stone archway half swallowed by roots and ferns, a dark stairway descending inside it with a warm gold star-lantern glow rising from below, green forest canopy, soft late-afternoon light; palette of moss green, grey stone and warm gold',
    'blaze': 'the Land of Blaze: a volcanic canyon of black basalt cliffs with rivers of glowing orange lava, a jagged volcano erupting in the distance, ember sparks in a smoky red sky; palette of crimson, orange, yellow and charcoal',
    'frost': 'the Frozen Land: a snowy glacier valley with tall pale blue ice spires and a frozen waterfall, a frost-covered ruined stone pillar, drifting snowflakes under a pale dawn sky; palette of white, ice blue and pale lilac',
    'storm': 'the Thundering Land: a high rocky plateau with broken rock spires and an old stone bridge, dark storm clouds with a bright yellow lightning bolt striking a tall stone obelisk, wind-bent grass; palette of slate blue, indigo and electric yellow',
    'mire': 'the Poison Mire: a murky swamp of sickly green water among twisted dead trees and giant toadstools, bubbling toxic pools, a half-sunken ruined shrine in the distance, thick yellow-green miasma; palette of olive, toxic green and murky purple',
    'shade': 'the Shadow Corridor: an endless dark colonnade of black stone pillars receding into darkness, pale violet ghost-lights floating in the air, a faint doorway of dim cold light at the far end, long shadows on a polished stone floor; palette of near-black, deep violet and cold silver',
    'iron': 'the Iron Fortress: a massive steel-plated fortress gate in a rocky mountain pass, riveted iron walls with a large gear emblem, chains and watch towers, smoke from chimneys, warm forge-orange windows; palette of gunmetal grey, rust brown and forge orange',
}

TRAITS = {
    'fire': 'fire: one bold flame with a yellow-white core, an orange body and deep red outer tongues',
    'ice': 'ice: a six-pointed ice crystal snowflake in white and pale cyan with deep blue shading',
    'thunder': 'thunder: one thick zig-zag lightning bolt in bright yellow with a white core and orange shading',
    'poison': 'poison: a toxic green droplet with two small bubbles rising beside it and dark purple shading at its base',
    'shade': 'shade: a dark indigo-violet crescent of shadow wrapped around a glowing pale lavender eye (deep indigo and lavender, never pink)',
    'iron': 'iron: a sturdy steel heater shield with a riveted rim and a cross-shaped iron band, bright metal highlight',
}
ICONS = (
    'A 3 by 2 grid of six small square pixel art RPG element icons separated by thick flat pure magenta #FF00FF gutters, with a wide magenta margin around the grid. '
    'Each icon sits alone on magenta, all the same size, about 28 by 28 art pixels, drawn as one bold emblem that reads instantly at small size, with a crisp dark outline, two or three hard-edged shading tones and a bright highlight from the upper left. '
    'No badge, no frame, no circle or square background behind the emblems. In this order, left to right, top to bottom: {listing}. '
    'Match the pixel density, outline, shading and saturation of the attached existing icons from the same game, but do not copy their star shapes. '
    '16-bit JRPG item icon style, ' + PIX + '. No text, no numbers, no frames.')

EVENTS = {
    'fountain': 'fountain: a small round stone spring basin with glowing turquoise water and a few bright sparkles above it',
    'merchant': 'merchant: a small travelling merchant stall, a red and cream striped cloth awning on wooden poles over stacked wooden crates, sacks and a few potion bottles, no person',
    'altar': 'altar: a low carved stone altar block on a stone step, with a softly glowing pale gold rune orb resting on top',
    'elite': 'elite mark: a crimson glowing magic circle drawn on the ground with jagged rune marks and a small horned skull in the middle',
    'vault': 'vault: a large ornate locked treasure chest, iron-banded dark wood with gold trim and a big padlock on the front, clearly bigger and grander than a normal chest',
    'vault-open': 'vault opened: exactly the same large chest as the vault, now with the lid raised, gold coins and gems glittering inside, the padlock hanging open',
    'key': 'key: an ornate golden key lying on the ground with a small ring of golden light around it',
    'trap': 'sprung trap: a few broken, cracked floor stones with sharp iron spikes that have just sprung up through them',
}
EVENT_SHEET = (
    'A 4 by 2 grid of eight top-down pixel art map objects for a dungeon map in a 16-bit Japanese console RPG, separated by thick flat pure magenta #FF00FF gutters, with a wide magenta margin around the grid. '
    'Each object sits alone on magenta: no floor and no ground tile drawn around it, only a small dark contact shadow directly under the object. '
    'All objects use the same high three-quarter top-down map view, the same scale and the same pixel density as the treasure chest in the attached approved map tiles (the floor tile there is 62 art pixels wide): '
    'every object fits inside a 48 by 48 art-pixel square; the two vault chests are about 44 art pixels wide, the key about 24, the others 34 to 46. '
    'Glows are drawn with hard-edged solid stepped colour pixels, never a soft halo fading into the background. '
    'In this order, left to right, top to bottom: {listing}. '
    '16-bit JRPG map sprite style, ' + PIX + '. No text, no numbers, no frames.')


# Revisions after the first two attempts (visual review), appended to the prompt from attempt 3 on.
NOTES = {
    'scene-portal-plaza': ' Revision: place the group of three arches exactly in the horizontal centre of the picture with equal empty space to their left and right; draw each vortex as clearly stepped flat colour bands (pixel art spiral), not a smooth airbrushed swirl.',
    'portal-card-mainline': ' Revision: make the ruined stone archway the big clear focal point, filling about the middle third of the picture, with a strong warm gold glow from the stairway inside it against the cooler green surroundings; keep the foreground simple.',
    'portal-card-frost': ' Revision: a clear snowy footpath must start at the bottom centre and lead toward the frozen waterfall landmark slightly right of centre, like the other cards of the set; keep the frost-covered ruined pillar as a secondary shape on the left.',
    'portal-card-mire': ' Revision: the picture must stay readable when tiny: a clear pale path in the foreground, one strongly glowing toxic-green sunken shrine as the bright focal point, darker silhouetted dead trees framing the sides, fewer small objects, stronger light and dark contrast.',
    # a3 tried a black-indigo shade icon: it vanished on the dark UI; a4 keeps the readable crescent but in blue-violet.
    'sheet-trait-icons': (' Revision for icon 5 (shade): a swirling crescent of shadow in deep blue-violet (clearly more blue than red) with a bright cold blue-white rim light '
                          'along its outer edge so it stands out on a dark navy interface, wrapped around a glowing white and pale cyan eye with a dark slit pupil; '
                          'solid flat colours, no scattered specks or loose particles. Do not use lavender, pink or magenta anywhere in the icon set.'),
    'sheet-event-tiles': (' Revision: every contact shadow is a dark grey-brown solid colour, never purple or pink. '
                          'Key: a bold golden key with a dark outline and a ring of solid warm-gold light under it, no pink, no scattered sparkles. '
                          'Sprung trap: a square pit of broken dark floor slabs with five or six tall sharp steel spikes thrusting straight up, each spike with a bright white highlight and a dark outline so it reads clearly against a light stone floor; no loose speckles.'),
}


def jobs():
    out = [dict(id='scene-portal-plaza', prompt=PLAZA, images=[REFS / 'scene-gate-x4.png', REFS / 'scene-town-x4.png'], kind='opaque', fit=SCENE_SIZE)]
    for r, desc in REGIONS.items():
        out.append(dict(id=f'portal-card-{r}', prompt=CARD.format(desc=desc), images=[REFS / 'scene-gate-x4.png'], kind='opaque', fit=CARD_SIZE))
    listing = '; '.join(f'{i + 1}) {d}' for i, d in enumerate(TRAITS.values()))
    out.append(dict(id='sheet-trait-icons', prompt=ICONS.format(listing=listing), images=[REFS / 'icons-old-x8.png'], kind='icon-sheet',
                    cols=3, rows=2, parts=[f'icon-trait-{k}' for k in TRAITS], height=32))
    listing = '; '.join(f'{i + 1}) {d}' for i, d in enumerate(EVENTS.values()))
    out.append(dict(id='sheet-event-tiles', prompt=EVENT_SHEET.format(listing=listing), images=[REFS / 'tiles-f1-x6.png'], kind='event-sheet',
                    cols=4, rows=2, parts=[f'tile-event-{k}' for k in EVENTS], canvas=EVENT_CANVAS))
    return out


def attempts(aid):
    files = [p for p in (RAW / aid).glob(f'{aid}-a*.png') if not p.stem.endswith('-magenta')]
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def write_prompt(job, extra=''):
    PROMPTS.mkdir(exist_ok=True)
    (PROMPTS / f'{job["id"]}.txt').write_text(job['prompt'].strip() + extra + ' ' + GEN + '\n', encoding='utf-8')


def selected(argv):
    only = next((a.split('=', 1)[1].split(',') for a in argv if a.startswith('--only=')), None)
    return [j for j in jobs() if not only or any(j['id'].startswith(o) for o in only)]


def gen(argv):
    n = int(next((a.split('=', 1)[1] for a in argv if a.startswith('--n=')), 2))
    extra = next((a.split('=', 1)[1] for a in argv if a.startswith('--extra=')), '')
    for job in selected(argv):
        while len(attempts(job['id'])) < n:
            k = max([int(p.stem.rsplit('-a', 1)[1]) for p in attempts(job['id'])] + [0]) + 1
            write_prompt(job, (NOTES.get(job['id'], '') if k >= 3 else '') + ((' ' + extra) if extra else ''))
            argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(RAW / job['id']), '--name', f'{job["id"]}-a{k}.png',
                     '--prompt-file', str(PROMPTS / f'{job["id"]}.txt')]
            for im in job['images']: argv2 += ['--image', str(im)]
            g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
            print(f'[gen {job["id"]} a{k}] rc={g.returncode} {g.stdout.strip()[-200:]}', flush=True)
            if not (RAW / job['id'] / f'{job["id"]}-a{k}.png').exists():
                print(f'[no output] {job["id"]} a{k}; stopping this id', flush=True); break


def sheet_cells(img, cols, rows, pad=8):
    """Cells of a magenta-gutter sheet (as A.slice_grid), each padded with `pad` key pixels unless the cell already
    touches the sheet edge (then the subject really was cut by the canvas and QA must say so)."""
    import numpy as np
    from PIL import Image
    rgb = np.asarray(img.convert('RGB')); fg = ~(A._near_magenta(rgb, 45) | A._magenta_tint(rgb))
    xs, ys = A._runs(fg.any(axis=0)), A._runs(fg.any(axis=1))
    if len(xs) != cols or len(ys) != rows: raise ValueError(f'expected {cols}x{rows} cells, found {len(xs)}x{len(ys)}')
    out = []
    for y0, y1 in ys:
        for x0, x1 in xs:
            cell = img.crop((x0, y0, x1, y1))
            if x0 == 0 or y0 == 0 or x1 == img.width or y1 == img.height: out.append(cell); continue
            padded = Image.new('RGB', (cell.width + 2 * pad, cell.height + 2 * pad), (255, 0, 255)); padded.paste(cell, (pad, pad)); out.append(padded)
    return out


def process_attempt(reg, job, raw, workdir, parts=None):
    """Postprocess one raw attempt. parts limits a sheet to some of its part ids. Returns {id: qa}."""
    from PIL import Image
    workdir = Path(workdir); workdir.mkdir(parents=True, exist_ok=True)
    img = Image.open(raw).convert('RGB')
    if job['kind'] == 'opaque':
        return {job['id']: A._finish(reg, job['id'], img, 'opaque', workdir, raw, fit=job['fit'])}
    # slice_grid crops each cell to its subject, so the cell edge says nothing about the raw canvas; pad with the key
    # colour so `subject cut by the canvas edge` only fires when the sheet itself cut the subject.
    cells = sheet_cells(img, job['cols'], job['rows'])
    block = A.shared_block(cells, EVENT_MAX) if job['kind'] == 'event-sheet' else None
    out = {}
    for cell, pid in zip(cells, job['parts']):
        if parts and pid not in parts: continue
        if pid in STRONG_DEFRINGE: reg.set(pid, defringe='strong', deblend=True, neutralize_tint=True)
        if job['kind'] == 'event-sheet':
            out[pid] = A._finish(reg, pid, cell, 'sprite', workdir, raw, block=block, canvas=job['canvas'])
        else:
            out[pid] = A._finish(reg, pid, cell, 'sprite', workdir, raw, height=job['height'])
    return out


def cand(argv):
    for job in selected(argv):
        for raw in attempts(job['id']):
            k = raw.stem.rsplit('-a', 1)[1]; wd = AF / 'work' / job['id'] / 'cand' / f'a{k}'
            reg = A.Registry(wd / 'cand-registry.json')
            try:
                res = process_attempt(reg, job, raw, wd)
                print(f'[cand {job["id"]} a{k}] ' + ', '.join(f'{i}: {"pass" if q["pass"] else q["reasons"]}{" " + str(q.get("warnings")) if q.get("warnings") else ""} {q.get("size")}' for i, q in res.items()), flush=True)
            except ValueError as e:
                print(f'[cand {job["id"]} a{k}] FAILED: {e}', flush=True)


def _arg(argv, name):
    return next((argv[i + 1] for i, a in enumerate(argv) if a == name and i + 1 < len(argv)), None)


def pick(argv):
    aid, k, part = _arg(argv, '--id'), _arg(argv, '--attempt'), _arg(argv, '--part')
    job = next(j for j in jobs() if j['id'] == aid)
    raw = RAW / aid / f'{aid}-a{k}.png'
    reg = A.Registry(AF / 'registry.json')
    res = process_attempt(reg, job, raw, AF / 'work' / (part or aid), parts=[part] if part else None)
    for i in res:
        reg.set(i, chosen_attempt=f'a{k}', source_id=aid, batch='portal-dungeon', **({'runtime': runtime(i)} if runtime(i) else {}))
    print(json.dumps(res, ensure_ascii=False))


def note(argv):
    aid, k, reason = _arg(argv, '--id'), _arg(argv, '--attempt'), _arg(argv, '--reason')
    reg = A.Registry(AF / 'registry.json')
    e = reg.data['assets'].setdefault(aid, {}); rej = e.get('rejected_attempts', {}); rej[f'a{k}'] = reason
    reg.set(aid, rejected_attempts=rej)


def runtime(aid):
    if aid.startswith('scene-'): return f'{A.BASE}scene/{aid[6:]}.png'
    if aid.startswith('portal-card-'): return f'{A.BASE}portal/{aid[12:]}.png'
    if aid.startswith('icon-'): return f'{A.BASE}icon/{aid[5:]}.png'
    if aid.startswith('tile-event-'): return f'{A.BASE}tiles/event-{aid[11:]}.png'
    return None


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    {'gen': gen, 'cand': cand, 'pick': pick, 'note': note}[cmd](sys.argv[2:])
