"""review_walls.py: build tmp/starlantern/review-walls/index.html for the auto-tiling wall candidates (tile-wrap).

Copies the candidate finals and the current runtime wall/floor tiles into img/ and lays out, per floor, a 7x5 maze
drawn the new way (wall-top, wall-face where the south neighbour is floor) next to the old way (every wall f<n>-wall),
plus 2x2 / 1x3 repeat previews and the QA numbers. Read-only for public/ and the registry.
"""
import html, json, shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
TILES = REPO / 'public/assets/games/starlantern/tiles'
OUT = REPO / 'tmp/starlantern/review-walls'
SCALE = 3
# 7x5 demo: outer ring of wall, a cross-shaped corridor around one free-standing wall block in the middle.
MAZE = ['#######',
        '##...##',
        '#..#..#',
        '##...##',
        '#######']
THEME = {1: '第 1 層 林間遺跡', 2: '第 2 層 水晶洞窟', 3: '第 3 層 星燈神殿'}


def cell_kind(r, c):
    if MAZE[r][c] == '.': return 'floor'
    return 'face' if r + 1 < len(MAZE) and MAZE[r + 1][c] == '.' else 'top'


def grid(srcs, cols, size=62):
    imgs = ''.join(f'<img src="{s}" alt="">' for s in srcs)
    return f'<div class="grid" style="grid-template-columns:repeat({cols},{size * SCALE}px)">{imgs}</div>'


def qa_text(q):
    seam = ', '.join(f"{ax}: 比值 {m['ratio']}（接縫 {m['seam']} / 內部 {m['interior']}）" for ax, m in q['seam'].items())
    raw = ', '.join(f"{ax} {m['ratio']}" for ax, m in q['raw_seam'].items())
    frame = ', '.join(f'{ax} {v}' for ax, v in q['frame'].items())
    join = f"；接牆頂 比值 {q['top_join']['ratio']}" if 'top_join' in q else ''
    return (f"{'通過' if q['pass'] else '未通過 ' + '、'.join(q['reasons'])}｜無縫 {seam}｜修補前 {raw}｜"
            f"修補 {q['seamless_fix']}｜外框差 {frame}{join}")


def main():
    reg = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    img = OUT / 'img'; img.mkdir(parents=True, exist_ok=True)
    sections = []
    for n in (1, 2, 3):
        for t in ('wall', 'floor'): shutil.copyfile(TILES / f'f{n}-{t}.png', img / f'old-f{n}-{t}.png')
        parts, qas = {}, []
        for k in ('top', 'face'):
            aid = f'tile-f{n}-wall-{k}'; e = reg.get(aid, {})
            if not e.get('final'): parts[k] = None; continue
            src = Path(e['final']); src = src if src.is_absolute() else REPO / src
            shutil.copyfile(src, img / f'f{n}-wall-{k}.png'); parts[k] = f'img/f{n}-wall-{k}.png'
            qas.append(f'<li><b>{aid}</b>（{html.escape(e.get("status", ""))}）：{html.escape(qa_text(e["qa"]))}</li>')
        if not all(parts.values()):
            sections.append(f'<section><h2>{THEME[n]}</h2><p>候選尚未產生。</p></section>'); continue
        floor, old = f'img/old-f{n}-floor.png', f'img/old-f{n}-wall.png'
        cells = [(r, c) for r in range(len(MAZE)) for c in range(len(MAZE[0]))]
        new = [floor if cell_kind(r, c) == 'floor' else parts[cell_kind(r, c)] for r, c in cells]
        prev = [floor if MAZE[r][c] == '.' else old for r, c in cells]
        sections.append(f'''<section><h2>{THEME[n]}</h2>
<div class="pair"><figure><figcaption>新版：牆頂＋牆面</figcaption>{grid(new, 7)}</figure>
<figure><figcaption>舊版：每格 f{n}-wall</figcaption>{grid(prev, 7)}</figure></div>
<div class="pair"><figure><figcaption>牆頂 2×2 平鋪</figcaption>{grid([parts['top']] * 4, 2)}</figure>
<figure><figcaption>牆面 1×3 平鋪（上接牆頂、下接地板）</figcaption>{grid([parts['top']] * 3 + [parts['face']] * 3 + [floor] * 3, 3)}</figure>
<figure><figcaption>牆面 2×2 平鋪</figcaption>{grid([parts['face']] * 4, 2)}</figure></div>
<ul class="qa">{''.join(qas)}</ul></section>''')
    page = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>星燈迷宮 可拼接牆審核</title><style>
body{{margin:0;padding:16px;background:#14161c;color:#e8e6df;font:14px/1.6 system-ui,sans-serif}}
h1{{font-size:20px}} h2{{font-size:17px;margin:28px 0 8px}} section{{border-top:1px solid #333;padding-top:8px}}
.pair{{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}} figure{{margin:0}} figcaption{{color:#b9b4a6;margin-bottom:4px}}
.grid{{display:grid;gap:0;line-height:0}} .grid img{{width:{62 * SCALE}px;height:{62 * SCALE}px;image-rendering:pixelated;display:block}}
.qa{{color:#cfc9b8;font-size:13px}} .note{{color:#b9b4a6}}
</style></head><body><h1>星燈迷宮 可拼接牆候選（尚未核准、未發布）</h1>
<p class="note">規則：牆格畫 wall-top；南側鄰格是地板的牆格畫 wall-face；地板格畫 floor。放大 {SCALE} 倍、pixelated。比值 = 接縫兩側平均色差 ÷ 圖內相鄰欄（列）平均色差，≤ 1.25 為通過；外框差 ≤ 16。</p>
{''.join(sections)}</body></html>'''
    (OUT / 'index.html').write_text(page, encoding='utf-8')
    print(OUT / 'index.html')


if __name__ == '__main__':
    main()
