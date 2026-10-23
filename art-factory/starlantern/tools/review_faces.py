"""review_faces.py: build art-factory/starlantern/runs/<run>/review.html for talking-face candidates (faces.py).

  python review_faces.py RUN ID [ID ...]

Every postprocessed candidate (work/<id>/cand/a<N>/) beside that character's published normal portrait, at natural size
and at 2x pixelated, with the mood it covers, one story line it would go with, and its QA (sl_art) and match QA (faces).
Images are copied into runs/<run>/img/ so the page opens from disk. Read-only for public/ and the registry.
"""
import html, json, shutil, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
PUB = REPO / 'public/assets/games/starlantern/char'
NAMES = {'scarlet': '絲嘉蕾', 'chizuru': '千鶴', 'selene': '瑟蕾', 'safira': '莎菲拉', 'sylvie': '希爾薇', 'noel': '諾艾兒', 'bobby': '波比', 'liz': '莉茲'}
MOOD = {'serious': 'serious 嚴肅', 'sad': 'sad 難過'}
# One story line per face (data/story.zh-TW.ts; scene in brackets) and the hidden lines it would unhide (survey).
LINES = {
    'char-scarlet-portrait-serious': ('「洛恩，從今天起，我站這裡。」', 'mem:scarlet:5', 18),
    'char-scarlet-portrait-sad': ('「我立誓守護的人，是公主殿下。她總是不讓我這樣叫她。」', 'mem:scarlet:4', 3),
    'char-chizuru-portrait-serious': ('「道歉不必。但請容我，生氣一刻鐘。」', 'banter:bobby-chizuru:2', 5),
    'char-chizuru-portrait-sad': ('「封印……沒有念完。最後一句，凍在嘴裡了。」', 'mem:chizuru:2', 4),
}
CSS = """
:root{color-scheme:dark;--bg:#16182a;--card:#22253a;--ink:#e6e6f0;--dim:#9a9cb4;--ok:#7fd49a;--bad:#ff8a8a;--warn:#ffd27a}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Noto Sans TC",sans-serif}
h1{font-size:20px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}p.note{color:var(--dim);margin:0 0 12px;max-width:70em}
.card{background:var(--card);border-radius:8px;padding:12px;margin:0 0 14px}
.pair{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end}
figure{margin:0;text-align:center}figcaption{color:var(--dim);font-size:13px}
.px{image-rendering:pixelated}.chk{background:repeating-conic-gradient(#2c2f48 0 25%,#262940 0 50%) 0 0/16px 16px;display:inline-block;padding:6px}
.line{margin:10px 0 2px;font-size:16px}.qa{font-size:13px;color:var(--dim)}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
"""


def _copy(src, dst_dir, name):
    shutil.copyfile(src, dst_dir / name); return f'img/{name}'


def _fig(src, w, h, label):
    return (f'<figure><div class="chk"><img class="px" src="{src}" width="{w}" height="{h}" alt="{html.escape(label)}"></div>'
            f'<figcaption>{html.escape(label)}</figcaption></figure>')


def _qa(q, m):
    def mark(ok): return '<span class="ok">通過</span>' if ok else '<span class="bad">未通過</span>'
    w = (q.get('warnings') or []) + (m.get('warnings') or [])
    return (f'機械 QA {mark(q["pass"])}{"（" + "、".join(q["reasons"]) + "）" if q["reasons"] else ""}：magenta 殘留 {q.get("residue")}、半透明 {q.get("semi")}、'
            f'碰邊 {q.get("edge")}（只允許底邊）、封閉洞 {q.get("holes")}｜對照 normal {mark(m["pass"])}'
            f'{"（" + "、".join(m["reasons"]) + "）" if m["reasons"] else ""}：尺寸 {q["size"][0]}×{q["size"][1]}，normal {m["base_size"][0]}×{m["base_size"][1]}'
            f'（差 {m["size_delta"][0]:+d}, {m["size_delta"][1]:+d}），block {m["block"]}／{m["base_block"]}，normal 色盤佔 {m["palette_share"]:.0%}'
            + (f'｜<span class="warn">警告：{"、".join(w)}</span>' if w else ''))


def main(run, ids):
    out = AF / 'runs' / run; img = out / 'img'; img.mkdir(parents=True, exist_ok=True)
    body = []
    for aid in ids:
        cid, mood = aid.split('-')[1], aid.rsplit('-', 1)[1]
        base = PUB / f'{cid}-portrait.png'
        from PIL import Image
        bw, bh = Image.open(base).size; bsrc = _copy(base, img, f'{cid}-portrait.png')
        text, scene, hidden = LINES[aid]
        cands = sorted((AF / 'work' / aid / 'cand').glob('a*'), key=lambda p: int(p.name[1:])) if (AF / 'work' / aid / 'cand').exists() else []
        body.append(f'<h2>{NAMES[cid]}｜{MOOD[mood]}</h2>')
        if not any((c / f'{aid}.png').exists() for c in cands):
            body.append(f'<div class="card"><div class="pair">{_fig(bsrc, bw, bh, "normal（已發佈）原尺寸")}{_fig(bsrc, bw * 2, bh * 2, "normal 2×")}</div>'
                        f'<p class="line">表情：{MOOD[mood]}｜搭配台詞：{html.escape(text)} <span class="qa">（{scene}；這個表情目前隱藏 {hidden} 句）</span></p>'
                        '<p class="qa bad">還沒有候選：codex 這次沒有產出圖片（原因見同資料夾的 notes.md）。</p></div>')
        for c in cands:
            png = c / f'{aid}.png'
            if not png.exists(): continue
            q = json.loads((c / f'{aid}.qa.json').read_text(encoding='utf-8')); m = json.loads((c / f'{aid}.match.json').read_text(encoding='utf-8'))
            w, h = Image.open(png).size; src = _copy(png, img, f'{aid}-{c.name}.png')
            figs = [_fig(bsrc, bw, bh, 'normal（已發佈）原尺寸'), _fig(src, w, h, f'{mood} {c.name} 原尺寸'),
                    _fig(bsrc, bw * 2, bh * 2, 'normal 2×'), _fig(src, w * 2, h * 2, f'{mood} {c.name} 2×')]
            body.append(f'<div class="card"><div class="pair">{"".join(figs)}</div>'
                        f'<p class="line">表情：{MOOD[mood]}｜搭配台詞：{html.escape(text)} <span class="qa">（{scene}；這個表情目前隱藏 {hidden} 句）</span></p>'
                        f'<p class="qa">{_qa(q, m)}</p></div>')
    page = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>對話表情樣本</title><style>{CSS}</style></head><body>'
            '<h1>星燈迷宮｜夥伴對話表情樣本（serious、sad）</h1>'
            '<p class="note">每張候選的左邊是同一個人已發佈的 normal 頭貼。請看：是不是同一個人（臉、髮型、服裝、配色）、大小與構圖是否一致、表情配上那句台詞對不對。'
            '這些圖還沒進遊戲（不在 public/），選定與核准後才發佈。</p>' + ''.join(body) + '</body></html>')
    (out / 'review.html').write_text(page, encoding='utf-8'); print(out / 'review.html')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
