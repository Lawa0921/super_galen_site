"""review_gather.py: the review page of a gathering art batch (gathering plan PR E; spec §12, §15).

  python art-factory/starlantern/tools/review_gather.py <t0|t1|i1> [--out DIR]

Writes DIR/index.html (default tmp/starlantern/review-gather/<batch>/) with every image copied beside it (relative paths
only), and records the sha256 of every final it shows in work/review/gather-<batch>-shown.json; `gather_art.py approve`
binds the approval to those bytes. Read-only for the registry and public/.

Sections: each tile at 1x and at integer zoom on the floor, side by side with the published event tiles and chest; a map
room per direction and floor at the game's cell size (48 px) and at 2x; the rich point's program effect (a preview, not
art); the icons at 1x, 2x, 3x beside published material icons and in a list row; QA numbers and the raw sheets.
"""
import html, json, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gather_art as GA  # noqa: E402
import sl_art as A  # noqa: E402

OUT = GA.REPO / 'tmp/starlantern/review-gather'
MAP_CELL = 48   # render/MapView.ts MAP_CELL: a 62-px tile is drawn in a 48-px cell
COMPARE_EVENTS = ('fountain', 'altar', 'key', 'trap')
COMPARE_ICONS = ('moss', 'thorn-fang', 'blaze-core', 'storm-stone', 'iron-shard', 'star-tear')
DIRECTION_TEXT = {'object': ('方向 A：獨立物件', '和寶箱、泉水一樣，一個站在地上的東西，只有腳下一小塊陰影。輪廓清楚、遠看就認得出來；每一層、每一種地板都能用同一張。'),
                  'ground': ('方向 B：地面一塊', '貼在地上的一片（礦石從裂縫冒出來、藥草長在石縫間），比較低、比較寬，上面有兩三顆小星光當「可以採」的記號。比較融入地圖，但會帶一點自己的碎石地面。')}
CSS = """
:root { color-scheme: dark; --bg: #0d1220; --panel: #161d31; --line: #2a3452; --text: #e8e6f0; --dim: #9aa3bd; --gold: #f2c94c; --bad: #ff7a7a; --ok: #7ad69a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif; }
main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 19px; margin: 40px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
h3 { font-size: 16px; margin: 20px 0 6px; } p { margin: 6px 0; } .dim { color: var(--dim); font-size: 13px; }
img { image-rendering: pixelated; image-rendering: crisp-edges; display: block; }
.ask { background: #22304f; border: 1px solid #3b4c78; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
.card .name { font-weight: 600; margin-bottom: 6px; } .row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.cap { font-size: 12px; color: var(--dim); text-align: center; margin-top: 2px; }
.floor { background-repeat: repeat; image-rendering: pixelated; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } @media (max-width: 760px) { .pair { grid-template-columns: 1fr; } }
.room { display: grid; gap: 0; width: max-content; border: 2px solid #000; }
.room .c { position: relative; background-size: 100% 100%; image-rendering: pixelated; }
.room .c img { position: absolute; inset: 0; width: 100%; height: 100%; }
.rich { filter: drop-shadow(0 0 1px #ffe08a) drop-shadow(0 0 3px #f2c94c) brightness(1.12); }
.strip { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.listrow { display: flex; align-items: center; gap: 8px; background: #1d2540; border: 1px solid var(--line); padding: 4px 10px; width: 280px; font-size: 12px; }
.listrow .p { margin-left: auto; color: var(--gold); }
table { border-collapse: collapse; width: 100%; font-size: 13px; } td, th { border-bottom: 1px solid var(--line); padding: 4px 6px; text-align: left; }
.ok { color: var(--ok); } .bad { color: var(--bad); } .mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.raw img { max-width: 100%; height: auto; image-rendering: auto; }
"""


def esc(s):
    return html.escape(str(s))


def _name(aid):
    for pre in ('sample-gather-object-', 'sample-gather-ground-', 'tile-gather-'):
        if aid.startswith(pre): return GA.TILE_NAMES[aid[len(pre):]]
    for pre in ('sample-icon-', 'icon-'):
        if aid.startswith(pre): return GA.ICON_NAMES.get(aid[len(pre):], aid)
    return aid


def build(batch, out=None, public=None):
    """Write the page and the shown record; returns the page path."""
    from PIL import Image
    out = Path(out or OUT / batch); public = Path(public or GA.PUBLIC); base = public / A.BASE.strip('/')
    (out / 'img').mkdir(parents=True, exist_ok=True)
    reg = A.Registry(GA.REG_PATH); finals = {}
    for aid in GA.batch_assets(batch):
        e = reg.data['assets'].get(aid, {})
        if e.get('final') and A._final_path(e['final']).is_file(): finals[aid] = A._final_path(e['final'])
    shown = {a: GA.sha256(f) for a, f in finals.items()}
    sp = GA.shown_path(batch); sp.parent.mkdir(parents=True, exist_ok=True)
    sp.write_text(json.dumps({'batch': batch, 'parts': shown}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    for a, f in finals.items(): shutil.copyfile(f, out / 'img' / f'{a}.png')

    def pub(rel):   # a published file copied beside the page, or None when it is not there
        f = base / rel
        if not f.is_file(): return None
        dst = out / 'img' / ('pub-' + rel.replace('/', '-')); shutil.copyfile(f, dst); return f'img/{dst.name}'

    img = lambda a, z=1, cls='': (f'<img class="{cls}" src="img/{a}.png" width="{Image.open(finals[a]).width * z}" '
                                  f'height="{Image.open(finals[a]).height * z}" alt="{esc(_name(a))}">') if a in finals else '<span class="bad">（沒有成品）</span>'
    floors = {n: pub(f'tiles/f{n}-floor.png') for n in (1, 2, 3)}
    parts = [f'<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
             f'<title>採集美術樣本</title><style>{CSS}</style></head><body><main>',
             f'<h1>星燈迷宮・採集美術{"樣本" if batch == "t0" else "審核"}（{esc(batch)}）</h1>',
             '<p class="dim">所有圖都是 codex 生成、洋紅去背、機械 QA 過的成品；放大一律整數倍、最近鄰（不模糊）。</p>']
    directions = [d for d in GA.DIRECTIONS if any(a.startswith(f'sample-gather-{d}-') for a in finals)]
    tiles = {d: [f'sample-gather-{d}-{k}' for k in GA.TILE_KEYS] for d in directions}
    if batch == 't1': tiles = {'t1': [f'tile-gather-{k}' for k in GA.TILE_KEYS]}
    if batch == 't0':
        parts.append('<div class="ask"><b>要請你決定的只有一件事：</b>採集點地磚要走 <b>方向 A（獨立物件）</b> 還是 <b>方向 B（地面一塊）</b>。'
                     '兩個方向各畫了全部十種點。選定之後，十張正式地磚會照那個方向、以這張樣本當錨點重畫一次。'
                     '素材與工具圖示沿用已核准的 5d 圖示畫風，這裡附上六張讓你一起看。</div>')
    for d, ids in tiles.items():
        title, blurb = DIRECTION_TEXT.get(d, ('正式地磚', ''))
        parts.append(f'<h2>{esc(title)}</h2><p>{esc(blurb)}</p><div class="grid">')
        for a in ids:
            fl = floors[1]
            parts.append(f'<div class="card"><div class="name">{esc(_name(a))}</div><div class="row">'
                         f'<div>{img(a)}<div class="cap">1×</div></div>'
                         f'<div><div class="floor" style="background-image:url({fl});background-size:{62 * 2}px">{img(a, 2)}</div><div class="cap">2×・f1 地板</div></div>'
                         f'</div></div>' if fl else
                         f'<div class="card"><div class="name">{esc(_name(a))}</div><div class="row"><div>{img(a)}<div class="cap">1×</div></div>'
                         f'<div>{img(a, 2)}<div class="cap">2×</div></div></div></div>')
        parts.append('</div>')
        if floors[1]:
            parts.append('<h3>3× 和既有地圖物件並排（f1 地板）</h3><div class="strip">')
            for k in COMPARE_EVENTS:
                p = pub(f'tiles/event-{k}.png')
                if p: parts.append(f'<div><div class="floor" style="background-image:url({floors[1]});background-size:186px"><img src="{p}" width="186" height="186" alt=""></div><div class="cap">既有：事件 {esc(k)}</div></div>')
            ch = pub('tiles/f1-chest.png')
            if ch: parts.append(f'<div><img src="{ch}" width="186" height="186" alt=""><div class="cap">既有：寶箱</div></div>')
            for a in ids[:5]:
                parts.append(f'<div><div class="floor" style="background-image:url({floors[1]});background-size:186px">{img(a, 3)}</div><div class="cap">新：{esc(_name(a))}</div></div>')
            parts.append('</div>')
            parts.append('<h3>其他地板（2×）</h3><div class="strip">')
            for n in (2, 3):
                if not floors[n]: continue
                for a in ids:
                    parts.append(f'<div><div class="floor" style="background-image:url({floors[n]});background-size:124px">{img(a, 2)}</div><div class="cap">f{n}・{esc(_name(a))}</div></div>')
            parts.append('</div>')
    if tiles and floors[1]:
        parts.append('<h2>地圖上的樣子</h2><p class="dim">7×5 的小房間，用遊戲已發布的牆與地板。左邊是遊戲實際大小（每格 48px，62px 的圖縮進一格，和現在事件地磚一樣），'
                     '右邊是 2 倍（每格 96px）。房間裡放了既有的泉水與寶箱對照；金色光暈那一格是「豐點」的程式效果示意（遊戲用 tint 與光暈，不另外畫圖）。</p>')
        for d, ids in tiles.items():
            title = DIRECTION_TEXT.get(d, ('正式地磚',))[0]
            for n in (1, 2, 3):
                if not floors[n]: continue
                rooms = [_room(n, ids, pub, cell) for cell in (MAP_CELL, MAP_CELL * 2)]
                parts.append(f'<h3>{esc(title)}・f{n}</h3><div class="row" style="align-items:flex-start">{rooms[0]}{rooms[1]}</div>')
    icons = [a for a in GA.batch_assets(batch) if a.startswith(('sample-icon-', 'icon-')) and a in finals]
    if icons:
        parts.append('<h2>素材與工具圖示</h2><p class="dim">沿用已核准的 5d 圖示畫風（高 32、36×36 方框內）。左邊是既有圖示，右邊是新圖示。</p>')
        for z in (1, 2, 3):
            parts.append(f'<h3>{z}×</h3><div class="strip">')
            for k in COMPARE_ICONS:
                p = pub(f'icon/{k}.png')
                if p:
                    w, h = Image.open(base / f'icon/{k}.png').size
                    parts.append(f'<div><img src="{p}" width="{w * z}" height="{h * z}" alt=""><div class="cap">既有</div></div>')
            for a in icons: parts.append(f'<div>{img(a, z)}<div class="cap">{esc(_name(a))}</div></div>')
            parts.append('</div>')
        parts.append('<h3>清單列示意（1×）</h3><div class="row">')
        for a in icons: parts.append(f'<div class="listrow">{img(a)}<span>{esc(_name(a))}</span><span class="p">×5</span></div>')
        parts.append('</div>')
    parts.append('<h2>機械 QA</h2><p class="dim">去背後檢查：洋紅殘留（含裂縫裡變暗的洋紅、孤立粉紅點）、半透明霧邊、洋紅溢色、碰到畫布邊或被原圖切到、內部被當成背景擦掉的像素。</p>'
                 '<table><tr><th>素材</th><th>名稱</th><th>畫布</th><th>主體</th><th>block</th><th>擦除</th><th>結果</th><th>sha256</th></tr>')
    for a in GA.batch_assets(batch):
        q = reg.data['assets'].get(a, {}).get('qa') or {}
        res = '<span class="ok">通過</span>' if q.get('pass') else f'<span class="bad">{esc(", ".join(q.get("reasons", ["未處理"])))}</span>'
        warn = f' <span class="dim">（提醒：{esc(", ".join(q["warnings"]))}）</span>' if q.get('warnings') else ''
        parts.append(f'<tr><td class="mono">{esc(a)}</td><td>{esc(_name(a))}</td><td>{esc(q.get("size", "—"))}</td><td>{esc(q.get("subject", "—"))}</td>'
                     f'<td>{esc(q.get("block", "—"))}</td><td>{esc(q.get("erased", "—"))}</td><td>{res}{warn}</td><td class="mono">{shown.get(a, "—")[:12]}</td></tr>')
    parts.append('</table>')
    raws = sorted({reg.data['assets'][a]['raw'] for a in finals if reg.data['assets'][a].get('raw')})
    if raws:
        parts.append('<h2>原圖（縮圖）</h2><div class="raw">')
        for r in raws:
            if not Path(r).is_file(): continue
            im = Image.open(r).convert('RGB'); k = max(1, im.width // 900)
            name = f'raw-{Path(r).stem}.png'; im.resize((im.width // k, im.height // k), Image.LANCZOS).save(out / 'img' / name)
            parts.append(f'<h3 class="mono">{esc(Path(r).name)}</h3><img src="img/{name}" alt="">')
        parts.append('</div>')
    parts.append('</main></body></html>')
    page = out / 'index.html'; page.write_text('\n'.join(parts) + '\n', encoding='utf-8')
    return page


def _room(n, ids, pub, cell):
    """A 7 x 5 room: top walls, their faces, three floor rows; four points (one rich), the fountain, the chest and the party."""
    top, face, floor = pub(f'tiles/f{n}-wall-top.png'), pub(f'tiles/f{n}-wall-face.png'), pub(f'tiles/f{n}-floor.png')
    chest, fountain, party = pub(f'tiles/f{n}-chest.png'), pub('tiles/event-fountain.png'), pub('map/party-s.png')
    pick = {k: a for a in ids for k in GA.TILE_KEYS if a.endswith(f'-{k}')}
    place = {(1, 2): (pick.get('vein'), ''), (3, 3): (pick.get('herb'), 'rich'), (5, 4): (pick.get('crystal'), ''),
             (0, 4): (pick.get('blaze'), ''), (5, 2): (fountain, 'pub'), (2, 4): (chest, 'chest'), (3, 4): (party, 'party')}
    cells = []
    for y in range(5):
        for x in range(7):
            bg = top if y == 0 else face if y == 1 else floor
            what, how = place.get((x, y), (None, ''))
            if how == 'chest' and what: bg = what; what = None
            inner = ''
            if what:
                src = what if how in ('pub', 'party') else f'img/{what}.png'
                inner = f'<img class="{"rich" if how == "rich" else ""}" src="{src}" alt="">'
            cells.append(f'<div class="c" style="width:{cell}px;height:{cell}px;background-image:url({bg})">{inner}</div>')
    return f'<div><div class="room" style="grid-template-columns:repeat(7,{cell}px)">{"".join(cells)}</div><div class="cap">每格 {cell}px</div></div>'


if __name__ == '__main__':
    b = sys.argv[1] if len(sys.argv) > 1 else ''
    o = GA._flag(sys.argv[2:], 'out')
    print(build(b, o))
