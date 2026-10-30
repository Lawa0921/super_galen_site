"""gather_art.py: the gathering art (gathering plan PR E, Task E1; spec §12, §15): ten gathering-point map tiles, fourteen
material icons and two tool icons. Structure as roster_art.py.

  plan-json                              write art-factory/starlantern/gather-plan.json (batches, jobs, assets)
  gen  [--batch=t0|t1|i1] [--only=id,...] [--n=N] [--extra=TEXT]
                                         codex attempts, one at a time, until each job has N raws (default 1; cap 3).
                                         t1 (the tiles) is refused until the user approved the t0 sample.
  qa   --id JOB --attempt N              postprocess the chosen attempt into the registry with the mechanical QA (status
                                         qa_passed / qa_failed, batch gather-<b>, never a runtime path)
  qa   [--batch=..] [--only=..] --cand   every raw attempt into work/<job>/cand/a<N>/ (a scratch registry), for choosing
  approve --batch t0 --by TEXT --direction object|ground
                                         the USER's words and the date after the sample page (review_gather.py t0): writes
                                         gather_tile_style_approved and gather_tile_style_anchor (the chosen direction's raw)
  approve --batch t1|i1 --review PATH [--review PATH ...]
                                         an independent fresh-context review record whose lines `- <id> <sha256> 通過`
                                         cover every asset of the batch (roster ruling 21); never the user's words
  publish --batch t1|i1                  copy to public/, runtime, manifest; all or nothing. The t0 sample is never published.
                                         GATHER_ART, artPaths and the url counts are the plan's E3 Step 3 (by hand).

Batches: t0 the style sample (spec §15: the ten points in two directions, `object` and `ground`, and six icons in the
approved 5d icon style), t1 the ten tiles in the approved direction, i1 the fourteen material icons and two tool icons.
Tiles follow the event tiles (`sheet-event-tiles`): 62 x 62 transparent canvas, subject centred, one shared block per
sheet. Icons follow the roster material icons (`process_roster_icon`: height 32, inside 36 x 36). Run from the repo root.
"""
import datetime, hashlib, json, os, re, shutil, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402
import gear_art as G  # noqa: E402
import roster_art as R  # noqa: E402
from batch import PIX, GEN  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
RAW = Path('C:/Users/bag57/art-refs/starlantern/raw')
PROMPTS = AF / 'prompts'
TOOLS = AF / 'tools'
WORK = AF / 'work'
REG_PATH = AF / 'registry.json'
PUBLIC = REPO / 'public'
PLAN_PATH = AF / 'gather-plan.json'
GATHER_TS = REPO / 'src/scripts/games/starlantern/data/gather.ts'

CAP = 3                 # contract: at most 3 codex attempts per job, then stop and report (never a substitute)
EVENT_CANVAS = 62       # one map cell, as the event tiles
EVENT_MAX = 50          # the largest subject side on a tile sheet, in art pixels (portal.EVENT_MAX)
BATCHES = ('t0', 't1', 'i1')
DIRECTIONS = ('object', 'ground')
TILE_KEYS = ('vein', 'herb', 'fungus', 'crystal', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron')
TILE_NAMES = {'vein': '礦脈', 'herb': '藥草叢', 'fungus': '菇叢', 'crystal': '晶脈', 'blaze': '琉璃結塊（熾焰）', 'frost': '霜苔岩（霜凍）',
              'storm': '帶電礦脈（雷鳴）', 'mire': '沼脂池（腐毒）', 'shade': '影繭（暗影）', 'iron': '廢鐵堆（鋼鐵）'}
MATS = ('copper-ore', 'silver-ore', 'stanch-herb', 'moonbell-herb', 'cap-mushroom', 'glow-mushroom', 'quartz-chip', 'deep-quartz',
        'ember-glass', 'rime-moss', 'charged-ore', 'bog-resin', 'shade-silk', 'scrap-iron')
TOOL_IDS = ('tool-1', 'tool-2')
SAMPLE_ICONS = ('copper-ore', 'stanch-herb', 'cap-mushroom', 'ember-glass', 'tool-1', 'tool-2')
ICON_NAMES = {'copper-ore': '銅礦石', 'silver-ore': '銀礦石', 'stanch-herb': '止血草', 'moonbell-herb': '月鈴草', 'cap-mushroom': '灰帽菇',
              'glow-mushroom': '螢光菇', 'quartz-chip': '石英碎晶', 'deep-quartz': '深藍晶', 'ember-glass': '焰琉璃', 'rime-moss': '霜苔',
              'charged-ore': '帶電礦石', 'bog-resin': '黑沼脂', 'shade-silk': '影繭絲', 'scrap-iron': '廢鐵塊',
              'tool-1': '鐵鎬與鐮刀', 'tool-2': '精工採集工具'}
ORIGINAL = 'The design must be original and not resemble any existing game item.'
NOT_PINK = 'Contact shadows and dark tones are grey-brown or blue-black, never purple or pink; no magenta anywhere in the art.'

# Spec §5.1: no point or material hints at a companion's home (no sand for the fire region, no trees or woods for the mire,
# no shrine or stone steps for the frost region): the tests keep these words out of every tile prompt.
TILE_DESC = {
    'object': {
        'vein': 'copper vein: a knee-high grey boulder split open, chunky copper-orange ore nuggets embedded in it and a few loose ore chips at its base',
        'herb': 'herb clump: a low round clump of broad bright green medicinal leaves with a few tiny white flowers',
        'fungus': 'mushroom cluster: five or six plump mushrooms with grey caps and cream stems, of different sizes, growing from a small mossy rock',
        'crystal': 'crystal outcrop: a cluster of clear pale quartz crystal points jutting up from a grey rock, with white highlights',
        'blaze': 'glass nodules (fire region): a lump of black volcanic rock studded with glossy orange-red glass nodules that glow from within, two small ember sparks above it',
        'frost': 'frost-moss boulder (ice region): a rounded boulder under a thick blanket of pale blue-white frozen moss with small ice crystals',
        'storm': 'charged vein (storm region): a dark slate rock outcrop with steel-blue ore veins and small zig-zag yellow electric sparks jumping between them',
        'mire': 'tar pool (poison region): a small round pool of glossy black tar with a dark green sheen and two fat bubbles, rimmed with dark mud',
        'shade': 'shadow cocoons (shadow region): three dark indigo-blue silk cocoons bound to a black stone with fine silver threads, a faint cold blue gleam on the silk',
        'iron': 'scrap heap (iron region): a heap of rusty scrap iron, bent plates, a broken cog wheel and loose bolts',
    },
    'ground': {
        'vein': 'copper vein: cracked floor stones with chunky copper-orange ore nuggets breaking through the cracks',
        'herb': 'herb patch: a low spread of broad bright green medicinal leaves with tiny white flowers growing between broken floor stones',
        'fungus': 'mushroom patch: a ring of small grey-capped mushrooms with cream stems sprouting from a patch of dark moss',
        'crystal': 'crystal bed: short clear pale quartz crystal points poking out of cracked floor stones',
        'blaze': 'glass crust (fire region): a crust of black cooled lava with glossy orange-red glass nodules glowing in its cracks',
        'frost': 'frost moss (ice region): a patch of pale blue-white frozen moss with small ice crystals over flat stones',
        'storm': 'charged vein (storm region): cracked dark slate stones with steel-blue ore veins and small zig-zag yellow electric sparks',
        'mire': 'tar seep (poison region): a flat puddle of glossy black tar with a dark green sheen and one fat bubble, rimmed with dark mud',
        'shade': 'shadow cocoons (shadow region): two small dark indigo-blue silk cocoons lying in a web of fine silver threads over dark stones',
        'iron': 'scrap pile (iron region): a low scatter of rusty bent plates, a broken cog wheel and loose bolts',
    },
}
TILE_SHEET = (
    'A 5 by 2 grid of ten top-down pixel art gathering points for a dungeon map in a 16-bit Japanese console RPG, separated by '
    'thick flat pure magenta #FF00FF gutters, with a wide magenta margin around the grid; nothing touches the image edges. {body} '
    'All ten use the same high three-quarter top-down map view, the same scale and the same pixel density as the treasure chest '
    'in the attached approved map tiles (the floor tile there is 62 art pixels wide) and the attached approved event objects of '
    'the same map{anchor}. Each one reads at a glance as a place to gather materials from: a bold silhouette, strong light and '
    'dark contrast, and a bright highlight on the gatherable material. Glows are drawn with hard-edged solid stepped colour '
    'pixels, never a soft halo fading into the background. ' + NOT_PINK + ' In this order, left to right, top to bottom: '
    '{listing}. 16-bit JRPG map sprite style, ' + PIX + '. No text, no numbers, no letters, no frames. ' + ORIGINAL)
TILE_BODY = {
    'object': ('Each point is one standalone object sitting alone on magenta: no floor and no ground tile drawn around it, only '
               'a small dark contact shadow directly under it. Every object fits inside a 48 by 48 art-pixel square and is 36 '
               'to 46 art pixels wide.'),
    'ground': ('Each point is a low, flat patch lying on the dungeon floor, not a standing object: the material spread over or '
               'breaking through a small irregular patch of broken floor stones and bare earth. Each patch is wide and low, about '
               '44 to 48 art pixels wide and 26 to 34 art pixels deep, and nothing on it rises more than about 10 art pixels; its '
               'outer edge is irregular rubble that ends crisply against the magenta, never fading out. Every patch carries the '
               'same small marker so the player knows it can be gathered: two or three tiny hard-edged four-point white-gold '
               'sparkles just above the material.'),
}
ANCHORED = ', and exactly the drawing style, scale and layout of the attached approved sample sheet of these gathering points'

UNREADABLE = 'no letters or marks'
MAT_DESC = {
    'copper-ore': 'copper ore: a chunk of rough grey rock with bright copper-orange ore nuggets',
    'silver-ore': 'silver ore: a chunk of dark rock with gleaming silver-white ore veins',
    'stanch-herb': 'stanch herb: a small bundle of broad green leaves tied with a thin brown cord',
    'moonbell-herb': 'moonbell herb: a sprig of pale blue bell-shaped flowers with silver-green leaves',
    'cap-mushroom': 'grey cap mushrooms: two plump mushrooms with grey caps and cream stems',
    'glow-mushroom': 'glow mushroom: one mushroom with a glowing cyan-green cap dotted with small bright spots',
    'quartz-chip': 'quartz chips: three small clear white quartz shards',
    'deep-quartz': 'deep quartz: one deep blue faceted crystal point with a bright white glint',
    'ember-glass': 'ember glass: a glossy lump of orange-red volcanic glass glowing from within',
    'rime-moss': 'rime moss: a clump of frosty pale blue moss with small ice crystals',
    'charged-ore': 'charged ore: a chunk of steel-blue metallic ore with small yellow sparks jumping between its points',
    'bog-resin': 'bog resin: a glob of glossy black tar with a dark green sheen and one drip',
    'shade-silk': 'shade silk: a small skein of dark indigo-blue silk thread with a cold silver sheen (deep blue, never violet or pink)',
    'scrap-iron': 'scrap iron: a small heap of rusty bolts, nuts and one broken cog',
    'tool-1': 'gathering tools: an iron pickaxe and a short iron sickle with wooden grips crossed in an X',
    'tool-2': 'fine gathering tools: a polished steel pick-hammer with brass fittings crossed with a curved steel sickle, a small leather strap binding them',
}
NUM = {6: 'six', 16: 'sixteen'}
ICON_SHEET = (
    'A {cols} by {rows} grid of {n} small square pixel art RPG crafting material and tool icons separated by thick flat pure '
    'magenta #FF00FF gutters, with a wide magenta margin around the grid; nothing touches the image edges. Each icon sits alone '
    'on magenta and every icon has the same size, about 28 by 28 art pixels: one bold readable object filling its square, with '
    'a crisp dark outline, two or three hard-edged shading tones and a bright highlight from the upper left. In this order, '
    'left to right, top to bottom: {listing}. Match the drawing style, scale, outline, shading and palette of the attached '
    'approved equipment sheet (the style anchor) and of the attached approved material icons from the same game (shown '
    'enlarged). 16-bit JRPG item icon style, ' + PIX + '. ' + NOT_PINK + ' No text, no numbers, no letters, no frames, no badge '
    'or circle behind the item. ' + ORIGINAL)

TILE_RULES = ('one shared block per sheet (largest subject side ~EVENT_MAX); defringe strong, deblend, '
              'despill; centred on an EVENT_CANVAS square; alpha QA (key residue, semi alpha, raw-canvas cut, spill, key tint with '
              '_deep_key, _bright_key and pink_outlier_count); erased interior as the roster sprites, sampled on the same canvas')


def refs():
    return RAW / 'gather-refs'


def tiles_ref():
    return RAW / 'portal-refs' / 'tiles-f1-x6.png'   # the f1 tiles with the chest, enlarged x6 (plan 4)


def event_ref():
    return refs() / 'event-tiles-x6.png'


def make_event_ref(out=None, public=None):
    """raw/gather-refs/event-tiles-x6.png (outside the repo): the published event tiles in a row on magenta, enlarged x6."""
    from PIL import Image
    out = Path(out or event_ref()); src = Path(public or PUBLIC) / A.BASE.strip('/') / 'tiles'
    ims = [Image.open(src / f'event-{k}.png').convert('RGBA') for k in ('fountain', 'altar', 'vault', 'key', 'trap')]
    sheet = Image.new('RGB', (sum(i.width + 8 for i in ims) * 6 + 48, max(i.height for i in ims) * 6 + 96), (255, 0, 255))
    x = 48
    for i in ims:
        big = i.resize((i.width * 6, i.height * 6), Image.NEAREST); sheet.paste(big, (x, 48), big); x += big.width + 48
    out.parent.mkdir(parents=True, exist_ok=True); sheet.save(out)
    return out


def tile_prompt(direction, anchored=False):
    if direction not in DIRECTIONS: raise ValueError(f'direction must be one of {DIRECTIONS}')
    listing = '; '.join(f'{i + 1}) {TILE_DESC[direction][k]}' for i, k in enumerate(TILE_KEYS))
    return TILE_SHEET.format(body=TILE_BODY[direction], anchor=ANCHORED if anchored else '', listing=listing)


def icon_prompt(parts, cols, rows):
    return ICON_SHEET.format(cols=cols, rows=rows, n=NUM[len(parts)], listing=G._listing(parts, MAT_DESC))


def jobs():
    tile_refs = [tiles_ref(), event_ref()]; icon_refs = [G.GEAR_ANCHOR, R.mat_ref()]
    out = [dict(id=f'sheet-gather-sample-{d}', kind='tile-sheet', batch='t0', cols=5, rows=2, direction=d, images=tile_refs,
                parts=[f'sample-gather-{d}-{k}' for k in TILE_KEYS], prompt=tile_prompt(d)) for d in DIRECTIONS]
    out.append(dict(id='sheet-gather-icons-sample', kind='icon-sheet', batch='t0', cols=3, rows=2, images=icon_refs,
                    parts=[f'sample-icon-{p}' for p in SAMPLE_ICONS], prompt=icon_prompt(SAMPLE_ICONS, 3, 2)))
    out.append(dict(id='sheet-gather-tiles', kind='tile-sheet', batch='t1', cols=5, rows=2, direction=None, images=tile_refs,
                    parts=[f'tile-gather-{k}' for k in TILE_KEYS], prompt=None))   # the prompt follows the approved direction
    parts = list(MATS) + list(TOOL_IDS)
    out.append(dict(id='sheet-gather-icons-1', kind='icon-sheet', batch='i1', cols=4, rows=4, images=icon_refs,
                    parts=[f'icon-{p}' for p in parts], prompt=icon_prompt(parts, 4, 4)))
    return out


def job_by_id(sid):
    return next(j for j in jobs() if j['id'] == sid)


def label(batch):
    if batch not in BATCHES: raise ValueError(f'batch must be one of {list(BATCHES)}')
    return f'gather-{batch}'


def batch_assets(batch):
    label(batch)
    return [a for j in jobs() if j['batch'] == batch for a in j['parts']]


def runtime(aid):
    """Where an asset is published; None for the t0 sample (never published)."""
    if aid.startswith('tile-gather-'): return f'{A.BASE}tiles/gather-{aid[len("tile-gather-"):]}.png'
    if aid.startswith('icon-'): return f'{A.BASE}icon/{aid[len("icon-"):]}.png'
    return None


def game_material_ids(path=None):
    """The gathering materials of data/gather.ts (`GATHER_MATERIALS`), in its order."""
    text = Path(path or GATHER_TS).read_text(encoding='utf-8')
    block = re.search(r'export const GATHER_MATERIALS[^=]*=\s*\[(.*?)\];', text, re.S).group(1)
    return re.findall(r"id: '([^']+)'", block)


def plan_data():
    return {'batches': {b: {'label': label(b), 'jobs': [j['id'] for j in jobs() if j['batch'] == b], 'assets': batch_assets(b),
                            'runtime': {a: runtime(a) for a in batch_assets(b) if runtime(a)}} for b in BATCHES},
            'tile_keys': list(TILE_KEYS), 'materials': list(MATS), 'tools': list(TOOL_IDS)}


def plan_json(argv):
    PLAN_PATH.write_text(json.dumps(plan_data(), indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')


def _registry():
    return A.Registry(REG_PATH)


def anchor_of(reg):
    rec = reg.data.get('gather_tile_style_anchor') or {}
    if not reg.data.get('gather_tile_style_approved') or not rec.get('raw'):
        raise PermissionError('gather_tile_style_approved is missing: the user has not approved the t0 sample yet')
    return rec['raw']


def prompt_for(job, reg):
    if job['batch'] == 't1':
        anchor_of(reg)
        return tile_prompt(reg.data['gather_tile_style_anchor']['direction'], anchored=True)
    return job['prompt']


def images_for(job, reg):
    imgs = list(job['images'])
    if job['batch'] == 't1': imgs.append(Path(anchor_of(reg)))
    return imgs


def ensure_refs(job):
    if event_ref() in job['images'] and not event_ref().exists(): make_event_ref()
    if G.GEAR_ANCHOR in job['images']: G.make_anchor(G._registry())       # always from the recorded 5d anchor
    if R.mat_ref() in job['images'] and not R.mat_ref().exists(): R.make_mat_ref()


def attempts(sid):
    files = [p for p in (RAW / sid).glob(f'{sid}-a*.png') if re.fullmatch(rf'{re.escape(sid)}-a\d+', p.stem)]
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def _flag(argv, name, default=None):
    """--name=value or --name value."""
    v = G._opt(argv, name)
    return v if v is not None else (G._arg(argv, f'--{name}') or default)


def selected(argv):
    only = _flag(argv, 'only'); batch = _flag(argv, 'batch')
    if batch: label(batch)
    ids = [o for o in only.split(',') if o] if only else None
    known = {j['id'] for j in jobs()}
    if ids is not None and (bad := [o for o in ids if o not in known]): raise ValueError(f'unknown job id {bad} (--only takes exact ids)')
    return [j for j in jobs() if (ids is None or j['id'] in ids) and (not batch or j['batch'] == batch)]


def gen(argv):
    """Codex attempts, one call at a time, until each selected job has N raws (default 1); never past CAP. Refuses t1 before
    the user approved the t0 sample. Stops at the first call that gives no image (a usage limit or a failed call)."""
    n = int(_flag(argv, 'n', 1)); extra = _flag(argv, 'extra', '')
    reg = _registry(); todo = selected(argv)
    if any(j['batch'] == 't1' for j in todo) and not reg.data.get('gather_tile_style_approved'):
        raise PermissionError('gather_tile_style_approved is missing (the user has not approved the t0 sample); refusing sheet-gather-tiles')
    for job in todo:
        imgs = images_for(job, reg); ensure_refs(job)
        missing = [str(p) for p in imgs if not Path(p).exists()]
        if missing: print(f'[skip] {job["id"]}: missing reference {missing}', flush=True); continue
        prompt = prompt_for(job, reg)
        while len(attempts(job['id'])) < n:
            have = attempts(job['id'])
            if len(have) >= CAP: raise PermissionError(f'{job["id"]} is at its attempt cap a{CAP}; stop and report (never a substitute)')
            k = max([int(p.stem.rsplit('-a', 1)[1]) for p in have] + [0]) + 1
            PROMPTS.mkdir(parents=True, exist_ok=True); pf = PROMPTS / f'{job["id"]}.txt'
            pf.write_text(prompt.strip() + ((' ' + extra) if extra else '') + ' ' + GEN + '\n', encoding='utf-8')
            argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(RAW / job['id']), '--name',
                     f'{job["id"]}-a{k}.png', '--prompt-file', str(pf)]
            for im in imgs: argv2 += ['--image', str(im)]
            g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
            print(f'[gen {job["id"]} a{k}] rc={g.returncode} {g.stdout.strip()[-200:]}', flush=True)
            if not (RAW / job['id'] / f'{job["id"]}-a{k}.png').exists():
                print(f'[no output] {job["id"]} a{k}; stopping', flush=True)
                return False
    return True


# --- postprocess and QA -------------------------------------------------------------------------------------------------------
def tile_spec():
    blob = json.dumps({'EVENT_CANVAS': EVENT_CANVAS, 'EVENT_MAX': EVENT_MAX, 'TILE_RULES': TILE_RULES,
                       'icon': A.qa_spec('roster-icon')}, sort_keys=True)
    return f'gather-tile:{hashlib.sha256(blob.encode()).hexdigest()[:12]}'


def _tile_erased(cell, final, block, canvas):
    """A.erased_count for a tile: the raw sampled with the sheet's block and pad, centred on the canvas like the final."""
    import numpy as np
    from PIL import Image
    cell = cell.convert('RGB'); bbox = A.cutout(cell).getbbox()
    if bbox is None: return 0
    src = Image.new('RGB', (bbox[2] - bbox[0] + 2 * block, bbox[3] - bbox[1] + 2 * block), (255, 0, 255))
    src.paste(cell.crop(bbox), (block, block)); small = A.to_art_pixels(src, block)
    if small.width > canvas or small.height > canvas: return 0
    on = Image.new('RGB', (canvas, canvas), (255, 0, 255)); on.paste(small, ((canvas - small.width) // 2, (canvas - small.height) // 2))
    return A.erased_count(np.asarray(final.convert('RGBA'))[..., 3], np.asarray(on))


def process_tile(reg, aid, cell, workdir, raw, block):
    """One gathering-point tile: the event-tile path (shared block, centred on EVENT_CANVAS, strong defringe and deblend)
    with despill, the roster key tint gate and the erased-interior gate. Stamped tile_spec(), registry kind gather-tile."""
    from PIL import Image
    reg.set(aid, defringe='strong', deblend=True)   # the event tiles' flags, without neutralize_tint (it repaints
    # every purple or pink pixel, so key left inside could never reach the residue gate)
    qa = A._finish(reg, aid, cell, 'sprite', workdir, raw, block=block, canvas=EVENT_CANVAS, despill_=True)
    final = Image.open(A._final_path(reg.get(aid)['final'])).convert('RGBA')
    erased = _tile_erased(cell, final, block, EVENT_CANVAS)
    if erased > A.ROSTER_ERASED_MAX and 'interior erased' not in qa['reasons']: qa['reasons'].append('interior erased')
    A.roster_key_tint_gate(qa, final)
    qa.update({'pass': not qa['reasons'], 'erased': erased, 'spec': tile_spec()})
    A._save_final(reg, aid, final, qa, workdir, raw)
    reg.set(aid, kind='gather-tile')
    return qa


def process_attempt(reg, job, raw, workdir):
    from PIL import Image
    workdir = Path(workdir); workdir.mkdir(parents=True, exist_ok=True)
    img = Image.open(raw).convert('RGB')
    cells = R.roster_cells(img, job['cols'], job['rows'])
    out = {}
    if job['kind'] == 'tile-sheet':
        block = A.shared_block(cells, EVENT_MAX)
        for cell, aid in zip(cells, job['parts']): out[aid] = process_tile(reg, aid, cell, workdir, raw, block)
    else:
        for cell, aid in zip(cells, job['parts']): out[aid] = A.process_roster_icon(reg, aid, cell, workdir, raw)
    return out


def qa(argv):
    """`--id JOB --attempt N`: the attempt into the registry (returns {asset: qa}). `--cand`: every attempt of the selected
    jobs into a scratch registry under work/<job>/cand/a<N>/ (returns {job: {attempt: {asset: qa}}})."""
    if '--cand' in argv:
        res = {}
        for job in selected([a for a in argv if a != '--cand']):
            for raw in attempts(job['id']):
                k = raw.stem.rsplit('-a', 1)[1]; wd = WORK / job['id'] / 'cand' / f'a{k}'
                try:
                    r = process_attempt(A.Registry(wd / 'cand-registry.json'), job, raw, wd)
                except ValueError as e:
                    print(f'[cand {job["id"]} a{k}] FAILED: {e}', flush=True); continue
                res.setdefault(job['id'], {})[f'a{k}'] = r
                for aid, q in r.items():
                    print(f'[cand {job["id"]} a{k}] {aid}: {"pass" if q["pass"] else q["reasons"]} size {q.get("size")} erased {q.get("erased")}', flush=True)
        return res
    sid, k = G._arg(argv, '--id'), G._arg(argv, '--attempt')
    job = job_by_id(sid); raw = RAW / sid / f'{sid}-a{k}.png'
    if not raw.is_file(): raise FileNotFoundError(raw)
    reg = _registry()
    res = process_attempt(reg, job, raw, WORK / sid)
    for aid in res: reg.set(aid, chosen_attempt=f'a{k}', source_id=sid, batch=label(job['batch']))
    return res


# --- approval and publishing --------------------------------------------------------------------------------------------------
def shown_path(batch):
    return WORK / 'review' / f'gather-{batch}-shown.json'


def review_copy(batch):
    return WORK / 'review' / f'gather-{batch}-review.md'


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _repo_path(path):
    p = Path(path).resolve()
    try:
        return p.relative_to(REPO.resolve()).as_posix()
    except ValueError:
        return str(p)


def do_approve(reg, batch, by=None, review=None, direction=None):
    """t0: the USER's approval of the sample (their words and the date in `by`) and the chosen direction; writes
    gather_tile_style_approved and gather_tile_style_anchor. t1, i1: independent review record(s) passing every asset's
    current sha256. Either way every asset approved must be qa_passed and still the bytes the review page recorded. Any miss
    refuses the whole batch and changes nothing."""
    lab = label(batch)
    reviews = [review] if isinstance(review, (str, Path)) else list(review or [])
    if batch == 't0':
        if reviews: raise ValueError('t0 is the style sample: only the user approves it (--by with their words and the date)')
        if not by or not R.DATE.search(by) or not R.DATE.sub('', by).strip(' :：,，;；-—'):
            raise ValueError("--by must quote the user's approval and carry its date (YYYY-MM-DD)")
        if direction not in DIRECTIONS: raise ValueError(f'--direction must be one of {DIRECTIONS}')
        aids = [a for a in batch_assets('t0') if not a.startswith('sample-gather-') or a.startswith(f'sample-gather-{direction}-')]
    else:
        if by: raise ValueError(f'{batch} is approved on an independent review record (--review), not on the user\'s words (ruling 21)')
        if batch == 't1': anchor_of(reg)
        if not reviews or any(not Path(r).is_file() for r in reviews): raise PermissionError(f'no independent review record at {review}')
        aids = batch_assets(batch)
    sp = shown_path(batch)
    if not sp.exists(): raise PermissionError(f'no review page record for {batch} ({sp}); build and show the review page first')
    shown = json.loads(sp.read_text(encoding='utf-8')).get('parts', {})
    passed, bad = {}, []
    for r in reviews:
        p, b = R.review_passes(Path(r).read_text(encoding='utf-8')); bad += b
        for a, h in p.items(): passed.setdefault(a, set()).add(h)
    problems = {}
    if bad: problems['review lines not in the form "- <id> <sha256> 通過"'] = bad
    for aid in aids:
        e = reg.data['assets'].get(aid, {}); f = A._final_path(e['final']) if e.get('final') else None
        if not e.get('chosen_attempt') or f is None or not f.is_file(): problems.setdefault('not picked', []).append(aid); continue
        if e.get('status') not in ('qa_passed', 'approved'): problems.setdefault(f'status {e.get("status")}', []).append(aid); continue
        h = sha256(f)
        if h != shown.get(aid): problems.setdefault('changed since (or missing from) the review page', []).append(aid)
        elif reviews and h not in passed.get(aid, ()): problems.setdefault('not passed by the independent review', []).append(aid)
    if problems: raise PermissionError(f'refusing to approve {batch}: {problems}')
    today = datetime.date.today().isoformat()
    rec = {'date': today, 'record': _repo_path(sp), 'shown': {a: sha256(A._final_path(reg.data['assets'][a]['final'])) for a in aids}}
    if reviews:
        k = review_copy(batch); k.parent.mkdir(parents=True, exist_ok=True)
        if Path(reviews[0]).resolve() != k.resolve(): shutil.copyfile(reviews[0], k)
        rec['review'] = _repo_path(k); rec['review_sha256'] = sha256(k); who = rec['review']
    else:
        rec['by'] = by; rec['direction'] = direction; who = by
    for aid in aids:
        e = reg.data['assets'][aid]
        if e['status'] == 'qa_passed': e['status'] = 'approved'; e['approved_by'] = who
    reg.data.setdefault('approved_batches', {})[lab] = rec
    if batch == 't0':
        reg.data['gather_tile_style_approved'] = today
        reg.data['gather_tile_style_anchor'] = {'direction': direction, 'raw': reg.data['assets'][f'sample-gather-{direction}-vein']['raw']}
    reg._save()
    return aids


def do_publish(reg, batch, public=None):
    """t1, i1: every asset approved and still the approved bytes, then all files copied in (staged beside, renamed only when
    every copy worked), runtime and status written, the manifest rewritten. A batch already out is a no-op."""
    if batch == 't0': raise ValueError('t0 is the style sample: it is never published')
    lab = label(batch); public = Path(public or PUBLIC)
    rec = reg.data.get('approved_batches', {}).get(lab)
    if not rec: raise PermissionError(f'{batch} has no approval record ({lab}); approve it first')
    aids = batch_assets(batch); todo = []
    for aid in aids:
        e = reg.data['assets'].get(aid, {})
        if e.get('status') == 'published': continue
        f = A._final_path(e['final']) if e.get('final') else None
        if e.get('status') != 'approved' or f is None or not f.is_file() or sha256(f) != rec['shown'].get(aid):
            raise PermissionError(f'{aid} is not the approved file of {batch}; refusing the whole batch')
        todo.append((aid, f, public / runtime(aid).lstrip('/')))
    staged = []
    try:
        for aid, f, dst in todo:
            dst.parent.mkdir(parents=True, exist_ok=True); tmp = dst.with_name(dst.name + '.staging')
            shutil.copyfile(f, tmp); staged.append((tmp, dst))
    except OSError:
        for tmp, _ in staged: tmp.unlink(missing_ok=True)
        raise
    for tmp, dst in staged: os.replace(tmp, dst)
    for aid, _, _ in todo:
        reg.data['assets'][aid].update(runtime=runtime(aid), status='published')
    if todo:
        reg._save(); reg.write_manifest(public)
        print(f'[publish {batch}] {len(todo)} files; next (plan E3 Step 3): GATHER_ART, artPaths, url counts', flush=True)
    return [a for a, _, _ in todo]


def approve(argv):
    reviews = [argv[i + 1] for i, a in enumerate(argv) if a == '--review' and i + 1 < len(argv)]
    return do_approve(_registry(), _flag(argv, 'batch'), by=_flag(argv, 'by'), review=reviews or None,
                      direction=_flag(argv, 'direction'))


def publish(argv):
    return do_publish(_registry(), _flag(argv, 'batch'))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    fn = {'plan-json': plan_json, 'gen': gen, 'qa': qa, 'approve': approve, 'publish': publish}.get(cmd)
    if fn is None: sys.exit(__doc__)
    out = fn(sys.argv[2:])
    if cmd == 'qa' and isinstance(out, dict) and '--cand' not in sys.argv:
        for aid, q in out.items(): print(f'{aid}: {"pass" if q["pass"] else q["reasons"]} size {q.get("size")} block {q.get("block")} erased {q.get("erased")}')
    if out is False: sys.exit(1)
