"""Build the initial registry.json from the game's data files (ids are read, never hand-copied)."""
from pathlib import Path
import json, re, sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT.parents[1] / 'src/scripts/games/starlantern/data'
BASE = '/assets/games/starlantern/'
CHARS = ['noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby']
TILES = ['wall', 'floor', 'door', 'up', 'down', 'chest', 'chest-open', 'entrance', 'boss']
FX = ['slash', 'pierce', 'strike', 'fire', 'ice', 'thunder', 'heal', 'buff']
DIRS = ['up', 'down', 'left', 'right']
# Portrait moods besides the normal face (spec section 5: six faces per character).
MOODS = ['attack', 'hit', 'dying', 'down', 'ultimate']


def ids_in(file, pattern=r"\bid: '([a-z0-9-]+)'"):
    return re.findall(pattern, (DATA / file).read_text(encoding='utf-8'))


def build():
    a = {}
    def put(aid, kind, runtime=None, **extra):
        a[aid] = {'kind': kind, 'status': 'todo', **({'runtime': BASE + runtime} if runtime else {}), **extra}
    for c in CHARS:
        put(f'char-{c}-standee', 'sprite', f'char/{c}-standee.png')
        put(f'char-{c}-portrait', 'sprite', f'char/{c}-portrait.png')
        for m in MOODS: put(f'char-{c}-portrait-{m}', 'sprite', f'char/{c}-portrait-{m}.png')
    for d in DIRS: put(f'map-party-{d}', 'sprite', f'map/party-{d}.png')
    put('map-fog', 'opaque', 'map/fog.png')
    for n in (1, 2, 3):
        put(f'sheet-tiles-f{n}', 'tile-sheet', parts=[f'tile-f{n}-{t}' for t in TILES], cols=3, rows=3)
        for t in TILES: put(f'tile-f{n}-{t}', 'opaque', f'tiles/f{n}-{t}.png')
        put(f'bg-f{n}', 'opaque', f'bg/f{n}.png')
    # An enemy with a `look` borrows that character's standee (render/artPaths.ts enemyArt) and has no sprite of its own.
    for e in ids_in('enemies.ts', r"\bid: '([a-z0-9-]+)'(?![^\n]*\blook: ')"): put(f'enemy-{e}', 'sprite', f'enemy/{e}.png')
    for k in FX: put(f'fx-{k}', 'sprite', f'fx/{k}.png')
    put('ui-frame', 'opaque', 'ui/frame.png')
    # Game UI (plan 3): scenes, NPC busts, logo, window frame and cursor.
    for s in ['title', 'town', 'guild', 'shop', 'inn', 'gate']: put(f'scene-{s}', 'opaque', f'scene/{s}.png')
    for n in ['guild', 'shop', 'inn', 'gate']:
        put(f'npc-{n}', 'sprite', f'npc/{n}.png', allow_edge=['bottom'])
        put(f'npc-{n}-happy', 'sprite', f'npc/{n}-happy.png', allow_edge=['bottom'])
    put('ui-logo', 'sprite', 'ui/logo.png')
    put('ui-window', 'sprite', 'ui/window.png', allow_edge=['left', 'top', 'right', 'bottom'])
    put('ui-cursor', 'sprite', 'ui/cursor.png')
    skills, items, mats, equips = ids_in('skills.ts'), ids_in('items.ts'), ids_in('materials.ts'), ids_in('equipment.ts')
    icons = [f'icon-{i}' for i in skills + items + mats + equips]
    for i in icons: put(i, 'sprite', f'icon/{i[5:]}.png')
    sheets = [skills[:20], skills[20:] + items + mats[:8], mats[8:] + equips]
    for k, ids in enumerate(sheets, 1):
        put(f'sheet-icons-{k}', 'icon-sheet', parts=[f'icon-{i}' for i in ids], cols=5, rows=4)
    return {'assets': a}


if __name__ == '__main__':
    out = ROOT / 'registry.json'
    if out.exists() and '--force' not in sys.argv: sys.exit(f'{out} exists; pass --force to rebuild')
    out.write_text(json.dumps(build(), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
