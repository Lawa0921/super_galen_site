"""review_portal.py: build tmp/starlantern/review-portal/index.html for the portal-dungeon art candidates.

Shows the chosen candidates in use (plaza with three portal cards, the seven cards side by side, event tiles on a 5x3
dungeon floor at map size and at 3x, trait icons on a dark panel next to the old icons of the same kind) and a gallery
of every attempt with its QA and the reason it was not chosen. Read-only for public/ and the registry.
"""
import html, json, shutil
from pathlib import Path

import portal as P

REPO = P.REPO
AF = P.AF
PUB = REPO / 'public/assets/games/starlantern'
OUT = REPO / 'tmp/starlantern/review-portal'
IMG = OUT / 'img'
REGION_NAME = {'mainline': '星燈迷宮・本道', 'blaze': '熾焰之地', 'frost': '霜凍之地', 'storm': '雷鳴之地', 'mire': '腐毒沼澤', 'shade': '暗影迴廊', 'iron': '鋼鐵要塞'}
TRAIT_NAME = {'fire': '火', 'ice': '冰', 'thunder': '雷', 'poison': '毒', 'shade': '影', 'iron': '鋼'}
REGION_TRAIT = {'blaze': 'fire', 'frost': 'ice', 'storm': 'thunder', 'mire': 'poison', 'shade': 'shade', 'iron': 'iron'}
OLD_ICON = {'fire': 'fire-star', 'ice': 'ice-star', 'thunder': 'thunder-star', 'poison': 'antidote', 'shade': 'stealth', 'iron': 'iron-wall'}
EVENT_NAME = {'fountain': '泉水', 'merchant': '流浪商人', 'altar': '祭壇', 'elite': '精英標記', 'vault': '寶庫（關）', 'vault-open': '寶庫（開）', 'key': '鑰匙', 'trap': '陷阱（觸發後）'}
# 5x3 demo room: events placed on floor cells, '.' = plain floor.
ROOM = [['fountain', '.', 'merchant', '.', 'altar'],
        ['.', 'elite', '.', 'key', '.'],
        ['vault', '.', 'trap', '.', 'vault-open']]


def copy(src, name):
    src = Path(src); src = src if src.is_absolute() else REPO / src
    if not src.exists(): return None
    shutil.copyfile(src, IMG / name); return f'img/{name}'


def final(reg, aid):
    e = reg.get(aid, {})
    return copy(e['final'], f'{aid}.png') if e.get('final') else None


def esc(s): return html.escape(str(s))


def qa_line(q):
    if not q: return ''
    bits = ['通過' if q.get('pass') else '未通過 ' + '、'.join(q.get('reasons', []))]
    if q.get('warnings'): bits.append('警告 ' + '、'.join(q['warnings']))
    for k in ('size', 'subject', 'block', 'residue', 'semi', 'edge', 'holes'):
        if k in q: bits.append(f'{k} {q[k]}')
    return '｜'.join(bits)


def gallery(reg):
    rows = []
    for job in P.jobs():
        aid = job['id']; parts = job.get('parts') or [aid]
        chosen = {p: reg.get(p, {}).get('chosen_attempt') for p in parts}
        rej = reg.get(aid, {}).get('rejected_attempts', {})
        cells = []
        for raw in P.attempts(aid):
            k = 'a' + raw.stem.rsplit('-a', 1)[1]; wd = AF / 'work' / aid / 'cand' / k
            magenta = raw.parent / f'{raw.stem}-magenta.png'
            thumb = copy(magenta if magenta.exists() else raw, f'raw-{aid}-{k}.png')
            used = [p for p, c in chosen.items() if c == k]
            label = ('採用：' + '、'.join(p.split('-', 2)[-1] for p in used)) if used else ''
            reason = rej.get(k, '')
            finals = []
            for p in parts:
                f = wd / f'{p}.png'
                if f.exists():
                    src = copy(f, f'cand-{p}-{k}.png'); q = json.loads((wd / f'{p}.qa.json').read_text(encoding='utf-8')) if (wd / f'{p}.qa.json').exists() else {}
                    finals.append(f'<figure class="c"><img class="px" src="{src}" alt=""><figcaption>{esc(p)}<br>{esc(qa_line(q))}</figcaption></figure>')
            cells.append(f'<div class="att"><h4>{esc(aid)} {k} <span class="ok">{esc(label)}</span></h4>'
                         f'<img class="raw" src="{thumb}" alt="">{"<p class=rej>淘汰／未採用原因：" + esc(reason) + "</p>" if reason else ""}'
                         f'<div class="finals">{"".join(finals)}</div></div>')
        rows.append(f'<section class="gal"><h3>{esc(aid)}</h3>{"".join(cells) or "<p>尚未生成。</p>"}</section>')
    return ''.join(rows)


def main():
    reg = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    if OUT.exists(): shutil.rmtree(OUT)
    IMG.mkdir(parents=True)
    plaza = final(reg, 'scene-portal-plaza'); old_gate = copy(PUB / 'scene/gate.png', 'old-scene-gate.png')
    cards = {r: final(reg, f'portal-card-{r}') for r in P.REGIONS}
    icons = {t: final(reg, f'icon-trait-{t}') for t in P.TRAITS}
    olds = {t: copy(PUB / f'icon/{n}.png', f'old-icon-{n}.png') for t, n in OLD_ICON.items()}
    events = {e: final(reg, f'tile-event-{e}') for e in P.EVENTS}
    floors = {n: copy(PUB / f'tiles/f{n}-floor.png', f'f{n}-floor.png') for n in (1, 2, 3)}
    old_tiles = {t: copy(PUB / f'tiles/f1-{t}.png', f'old-f1-{t}.png') for t in ('chest', 'chest-open', 'entrance')}

    def card(r, w=270):
        t = REGION_TRAIT.get(r); ic = f'<img class="px ic" src="{icons[t]}" alt="">' if t and icons.get(t) else ''
        img = f'<img class="px art" src="{cards[r]}" alt="" style="width:{w}px;height:{round(w * 110 / 180)}px">' if cards.get(r) else '<div class="art missing">未產生</div>'
        return f'<div class="card" style="width:{w}px">{img}<div class="cap">{ic}<span>{REGION_NAME[r]}</span></div></div>'

    def plaza_mock(trio):
        bg = f'<img class="px" src="{plaza}" alt="" style="width:960px;height:540px">' if plaza else '<div class="missing" style="width:960px;height:540px">場景未產生</div>'
        return f'<div class="plaza">{bg}<div class="trio">{"".join(card(r) for r in trio)}</div></div>'

    def room(floor, scale):
        size = 62 * scale if scale else 48
        cells = []
        for row in ROOM:
            for e in row:
                ov = f'<img class="px ov" src="{events[e]}" alt="" style="width:{size}px;height:{size}px">' if e != '.' and events.get(e) else ''
                cells.append(f'<div class="cell" style="width:{size}px;height:{size}px;background-image:url({floor})">{ov}</div>')
        return f'<div class="room" style="grid-template-columns:repeat(5,{size}px)">{"".join(cells)}</div>'

    def icon_row(t):
        new = f'<img class="px" src="{icons[t]}" alt="">' if icons.get(t) else '—'
        sizes = ''.join(f'<img class="px" src="{icons[t]}" alt="" style="height:{h}px">' for h in (32, 64, 128)) if icons.get(t) else ''
        old = ''.join(f'<img class="px" src="{olds[t]}" alt="" style="height:{h}px">' for h in (32, 64, 128)) if olds.get(t) else ''
        return (f'<tr><th>{TRAIT_NAME[t]}<br><small>icon-trait-{t}</small></th><td class="dark">{sizes}</td>'
                f'<td class="dark old">{old}<br><small>舊：{OLD_ICON[t]}</small></td>'
                f'<td class="dark"><span class="chip">{new}{TRAIT_NAME[t]}屬性</span></td></tr>')

    ev_list = ''.join(f'<figure><div class="cell big" style="background-image:url({floors[1]})">'
                      f'{"<img class=px src=" + events[e] + " alt=>" if events.get(e) else ""}</div><figcaption>{EVENT_NAME[e]}<br><small>tile-event-{e}</small></figcaption></figure>' for e in P.EVENTS)
    old_ev = ''.join(f'<figure><img class="px" src="{s}" alt="" style="width:186px;height:186px"><figcaption>舊 f1-{t}</figcaption></figure>' for t, s in old_tiles.items() if s)

    page = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>傳送門美術審核</title><style>
:root{{color-scheme:dark}}
body{{margin:0;padding:16px;background:#121318;color:#e8e6df;font:14px/1.6 system-ui,"Noto Sans TC",sans-serif}}
h1{{font-size:20px}} h2{{font-size:17px;margin:32px 0 8px;border-top:1px solid #333;padding-top:12px}} h3{{font-size:15px;margin:18px 0 6px}}
.note{{color:#b9b4a6}} .px{{image-rendering:pixelated}} figure{{margin:0}} figcaption{{color:#b9b4a6;font-size:12px}}
.row{{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}}
.plaza{{position:relative;width:960px;height:540px;overflow:hidden;border:2px solid #3a3424}}
.plaza>img{{display:block}} .trio{{position:absolute;left:0;right:0;bottom:16px;display:flex;justify-content:center;gap:22px}}
.card{{background:#1b1d2a;border:3px solid #b08a3e;box-shadow:0 0 0 2px #151520,0 6px 14px #0009;border-radius:3px}}
.card .art{{display:block}} .card .cap{{display:flex;align-items:center;gap:6px;padding:3px 8px;font-weight:600;color:#f1e3b8;font-size:14px}}
.card .ic{{width:24px;height:24px;object-fit:contain}} .missing{{background:#333;color:#999;display:flex;align-items:center;justify-content:center}}
.room{{display:grid;gap:0;line-height:0;border:2px solid #444}} .cell{{position:relative;background-size:100% 100%;image-rendering:pixelated}}
.cell .ov{{position:absolute;left:0;top:0}} .cell.big{{width:186px;height:186px}} .cell.big img{{width:186px;height:186px;position:absolute}}
table{{border-collapse:collapse}} td,th{{padding:8px 12px;border-bottom:1px solid #2b2b33;vertical-align:middle;text-align:left}}
td.dark{{background:#191b29}} td img{{margin-right:10px;vertical-align:middle}} td.old{{opacity:.95}}
.chip{{display:inline-flex;align-items:center;gap:6px;background:#262840;border:1px solid #4d4f78;border-radius:4px;padding:2px 8px 2px 4px}}
.chip img{{height:24px;margin:0}}
.gal .att{{display:inline-block;vertical-align:top;margin:0 16px 16px 0;max-width:460px}} .gal h4{{margin:4px 0;font-size:13px}}
.gal .raw{{max-width:440px;max-height:300px;display:block;border:1px solid #333}} .ok{{color:#9fd77f}} .rej{{color:#e6a07a;margin:4px 0}}
.finals{{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}} .finals .c img{{max-width:200px;max-height:130px;min-height:48px}} .finals figcaption{{max-width:200px}}
</style></head><body>
<h1>星燈迷宮 傳送門 roguelike 美術候選（qa_passed，尚未核准、未發布）</h1>
<p class="note">本頁所有像素圖以最近鄰放大顯示。卡片下方的地區名稱與框是 HTML 示意，不在圖片裡。登錄狀態最多到 qa_passed，核准與發布要等你確認。</p>

<h2>1. 傳送門廣場：場景＋3 張卡片示意（場景 418×235 放大到 960×540，卡片 180×110 放大 1.5 倍）</h2>
<div class="row">{plaza_mock(['mainline', 'blaze', 'frost'])}</div>
<h3>另一組隨機地區</h3><div class="row">{plaza_mock(['storm', 'mainline', 'shade'])}</div>
<h3>廣場場景原尺寸（640×360 顯示）與目前的迷宮入口場景</h3>
<div class="row"><figure><img class="px" src="{plaza or ''}" alt="" style="width:640px;height:360px"><figcaption>新：scene-portal-plaza</figcaption></figure>
<figure><img class="px" src="{old_gate}" alt="" style="width:640px;height:360px"><figcaption>舊：scene/gate.png</figcaption></figure></div>

<h2>2. 7 張傳送門卡片並排（180×110 原尺寸 ×2）</h2>
<div class="row">{"".join(card(r, 360) for r in P.REGIONS)}</div>
<h3>原尺寸 1×</h3><div class="row">{"".join(card(r, 180) for r in P.REGIONS)}</div>

<h2>3. 事件圖示疊在迷宮地板上</h2>
<p class="note">地圖格 62×62 美術像素，遊戲中以 48px 顯示。下列 5×3 小地圖用現有 f1／f2／f3 地板。</p>
<h3>實際地圖大小（每格 48px）</h3><div class="row">{room(floors[1], 0)}{room(floors[2], 0)}{room(floors[3], 0)}</div>
<h3>放大 3 倍（f1 地板）</h3><div class="row">{room(floors[1], 3)}</div>
<h3>放大 3 倍（f3 地板）</h3><div class="row">{room(floors[3], 3)}</div>
<h3>逐一檢視（3 倍）與舊版同類地磚</h3><div class="row">{ev_list}</div><div class="row" style="margin-top:12px">{old_ev}</div>

<h2>4. 屬性圖示（深色介面上，32／64／128px）與舊版同類圖示</h2>
<table><tr><th>屬性</th><th>新版</th><th>舊版同類</th><th>介面示意</th></tr>{"".join(icon_row(t) for t in P.TRAITS)}</table>

<h2>5. 全部生成版本與淘汰原因</h2>
<p class="note">原圖為 codex 輸出（已把背景校正為純洋紅）；右側為該版後處理結果與機械 QA。</p>
{gallery(reg)}
</body></html>'''
    (OUT / 'index.html').write_text(page, encoding='utf-8')
    print(OUT / 'index.html')


if __name__ == '__main__':
    main()
