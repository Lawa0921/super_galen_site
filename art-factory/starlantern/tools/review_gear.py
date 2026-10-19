"""review_gear.py <sample|main-gear|skills>: build tmp/starlantern/review-gear/index.html for a plan 5d batch.

Shows the batch's chosen candidates (registry `final`, status up to qa_passed) in use: the equipment screen (bag and doll
cells with rarity frames and the legendary glow, the 64 px detail image, at 1x and 3x), old base icons beside the new
ones, large/icon pairs from the same cell, portal cards with owned icons and silhouettes (made here in the page, never in
the registry), list rows (shop, forge, loot line), materials, skills beside the character's existing ones, the forge
with Doran, and a gallery of every attempt with its QA and the reason it was not chosen.
Read-only for public/ and the registry; the main conversation publishes the page with the Artifact tool.
"""
import html, json, re, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gear_art as G  # noqa: E402
import sl_art as A  # noqa: E402

REPO = G.REPO
PUB = REPO / 'public/assets/games/starlantern'
OUT = REPO / 'tmp/starlantern/review-gear'
DATA = REPO / 'src/scripts/games/starlantern/data'
RARITY_NAME = {'common': '普通', 'magic': '魔法', 'rare': '稀有', 'legendary': '傳說', 'unique': '獨特', 'set': '套裝'}
FRAMED = ['magic', 'rare', 'legendary', 'unique', 'set']
REGION_NAME = {'blaze': '熾焰之地', 'frost': '霜凍之地', 'storm': '雷鳴之地', 'mire': '腐毒沼澤', 'shade': '暗影迴廊', 'iron': '鋼鐵要塞'}
OLD_MATERIALS = ['moss', 'bat-wing', 'thorn-fang', 'crystal-shell', 'ice-crystal', 'lizard-scale', 'star-stone', 'dusk-cloth', 'old-coin', 'ancient-gear']
OWNER_NAME = {'noel': '諾艾兒', 'chizuru': '千鶴', 'liz': '莉茲', 'sylvie': '希爾薇', 'scarlet': '絲嘉蕾', 'selene': '瑟蕾',
              'safira': '莎菲拉', 'bobby': '波比', 'rin': '凜', 'hero': '洛恩'}


def esc(s): return html.escape(str(s))


def _read(f): return (DATA / f).read_text(encoding='utf-8')


def names():
    """Display names read from the game data (never hand-copied)."""
    n = {}
    for f in ('equipment.ts', 'materials.ts', 'skills.ts', 'items.ts'):
        n.update(re.findall(r"\bid: '([a-z0-9-]+)', name: '([^']+)'", _read(f)))
    g = _read('gear.ts')
    n.update(re.findall(r"\(\['([a-z0-9-]+)', '([^']+)'", g))
    nouns = dict(re.findall(r"(\w+): '(之[^']+)'", g))
    for sid, stem, slots in re.findall(r"\{ id: '(set-[a-z]+)', stem: '([^']+)', region: '[a-z]+', slots: \[([^\]]+)\]", g):
        n[sid] = f'{stem}套裝'
        for slot in re.findall(r"'(\w+)'", slots): n[f'{sid}-{slot}'] = stem + nouns[slot]
    return n


def skill_owners():
    return dict(re.findall(r"\bid: '([a-z0-9-]+)', name: '[^']+', owner: '([a-z-]+)'", _read('skills.ts')))


def rarity_of(part):
    if part in G.GEAR_LEGEND: return 'legendary'
    if part in G.GEAR_UNIQUE: return 'unique'
    if part.startswith('set-'): return 'set'
    return ['common', 'magic', 'rare'][list(G.GEAR_BASE).index(part) % 3]


class Page:
    """Copies files into img/ (only ones that exist) and remembers what it copied."""

    def __init__(self, out, reg):
        self.img = out / 'img'; self.reg = reg

    def copy(self, src, name):
        if not src: return None
        src = Path(src); src = src if src.is_absolute() else REPO / src
        if not src.is_file(): return None
        shutil.copyfile(src, self.img / name); return f'img/{name}'

    def final(self, aid):
        e = self.reg.get(aid, {})
        return self.copy(e.get('final'), f'{aid}.png')

    def pub(self, rel, name=None):
        return self.copy(PUB / rel, name or 'pub-' + rel.replace('/', '-'))

    def silhouette(self, key):
        """Preview only: the pure transform of the candidate icon (the registry gets silhouettes after approval)."""
        src = G.SET_FIRST.get(key, key); f = self.reg.get(f'gear-{src}', {}).get('final')
        if not f: return None
        p = Path(f); p = p if p.is_absolute() else REPO / p
        if not p.is_file(): return None
        from PIL import Image
        A.silhouette_image(Image.open(p)).save(self.img / f'sil-{key}.png'); return f'img/sil-{key}.png'


def img(src, cls='px', style='', alt=''):
    return f'<img class="{cls}" src="{src}" alt="{esc(alt)}"{f" style={chr(34)}{style}{chr(34)}" if style else ""}>' if src else ''


def qa_line(q):
    if not q: return ''
    bits = ['通過' if q.get('pass') else '未通過 ' + '、'.join(q.get('reasons', []))]
    if q.get('warnings'): bits.append('警告 ' + '、'.join(q['warnings']))
    for k in ('size', 'subject', 'block', 'residue', 'semi', 'holes', 'center_clear', 'ring_closed', 'edge_repeat'):
        if k in q: bits.append(f'{k} {q[k]}')
    return '｜'.join(bits)


def gallery(pg, js):
    rows = []
    for job in js:
        sid = job['id']; aids = [a for p in job['parts'] for a in G.assets_of(job, p)]
        chosen = {a: pg.reg.get(a, {}).get('chosen_attempt') for a in aids}
        rej = pg.reg.get(sid, {}).get('rejected_attempts', {})
        cells = []
        for raw in G.attempts(sid):
            k = 'a' + raw.stem.rsplit('-a', 1)[1]; wd = G.WORK / sid / 'cand' / k
            magenta = raw.parent / f'{raw.stem}-magenta.png'
            thumb = pg.copy(magenta if magenta.exists() else raw, f'raw-{sid}-{k}.png')
            used = [a for a, c in chosen.items() if c == k]
            finals = []
            for a in aids:
                src = pg.copy(wd / f'{a}.png', f'cand-{a}-{k}.png')
                if not src: continue
                qf = wd / f'{a}.qa.json'; q = json.loads(qf.read_text(encoding='utf-8')) if qf.exists() else {}
                finals.append(f'<figure class="c">{img(src)}<figcaption>{esc(a)}<br>{esc(qa_line(q))}</figcaption></figure>')
            reason = rej.get(k, '')
            cells.append(f'<div class="att"><h4>{esc(sid)} {k} <span class="ok">{esc("採用：" + "、".join(used) if used else "")}</span></h4>'
                         f'{img(thumb, "raw")}{"<p class=rej>淘汰／未採用原因：" + esc(reason) + "</p>" if reason else ""}'
                         f'<div class="finals">{"".join(finals)}</div></div>')
        rows.append(f'<section class="gal"><h3>{esc(sid)}</h3>{"".join(cells) or "<p>尚未生成。</p>"}</section>')
    return ''.join(rows)


def main(batch='sample'):
    lab = G.label(batch)
    reg = json.loads(G.REG_PATH.read_text(encoding='utf-8'))['assets'] if G.REG_PATH.exists() else {}
    if OUT.exists(): shutil.rmtree(OUT)
    (OUT / 'img').mkdir(parents=True)
    pg = Page(OUT, reg); nm = names(); owners = skill_owners()
    js = [j for j in G.jobs() if j['batch'] == batch]
    gear = [p for j in js if j['kind'] == 'gear-sheet' for p in j['parts']]
    mats = [p for j in js if j['id'].startswith('sheet-mat-') for p in j['parts']]
    skills = [p for j in js if j['id'].startswith('sheet-skill-') for p in j['parts'] if p]
    icon = {p: pg.final(f'gear-{p}') for p in gear}; large = {p: pg.final(f'gear-{p}-large') for p in gear}
    frame = {r: pg.final(f'ui-rarity-{r}') or pg.pub(f'ui/rarity-{r}.png') for r in FRAMED}
    glow = pg.final('ui-glow-legendary') or pg.pub('ui/glow-legendary.png')

    # 0. checklist: every part of the batch exactly once
    def status_row(job, p):
        aids = G.assets_of(job, p)
        st = '；'.join(f'{a}：{reg.get(a, {}).get("status", "未挑選")} {reg.get(a, {}).get("chosen_attempt", "")}' for a in aids)
        qa = '；'.join(qa_line(reg.get(a, {}).get('qa')) for a in aids if reg.get(a, {}).get('qa'))
        return f'<tr data-part="{esc(p)}"><td>{esc(p)}</td><td>{esc(nm.get(p, ""))}</td><td>{esc(job["id"])}</td><td>{esc(st)}</td><td class="small">{esc(qa)}</td></tr>'
    checklist = ''.join(status_row(j, p) for j in js for p in j['parts'] if p is not None)

    # 1. equipment screen
    def cell(p, px, cls='bag'):
        if p is None: return f'<div class="cell {cls}" style="width:{px}px;height:{px}px"></div>'
        r = rarity_of(p); fr = frame.get(r) if r != 'common' else None
        ico = img(icon.get(p), 'px gi', alt=nm.get(p, p)) or f'<span class="short">{esc(nm.get(p, p)[:4])}</span>'
        g = f'<span class="rg" style="border-image-source:url({glow})"></span>' if r == 'legendary' and glow else ''
        f = f'<span class="rf" style="border-image-source:url({fr})"></span>' if fr else ''
        return f'<div class="cell {cls}" title="{esc(nm.get(p, p))}（{RARITY_NAME[r]}）" style="width:{px}px;height:{px}px">{g}{ico}{f}</div>'

    def equip_screen():
        bag = (gear + [None] * 20)[:20]
        doll = (gear + [None] * 9)[:9]
        pick = next((p for p in gear if rarity_of(p) == 'legendary'), gear[0] if gear else None)
        det = ''
        if pick:
            r = rarity_of(pick); fr = frame.get(r) if r != 'common' else None
            f = f'<span class="rf big" style="border-image-source:url({fr})"></span>' if fr else ''
            det = (f'<div class="detail"><div class="artbox">{img(large.get(pick), "px", "width:64px;height:64px")}{f}</div>'
                   f'<div><b>{esc(nm.get(pick, pick))}</b><br><small>{RARITY_NAME[r]}・詳情欄 64px 大圖</small></div></div>')
        return (f'<div class="screen"><div><div class="bag-grid">{"".join(cell(p, 28) for p in bag)}</div>'
                f'<div class="doll">{"".join(cell(p, 38, "dollc") for p in doll)}</div></div>{det}</div>')
    eq = (f'<h3>1 倍</h3>{equip_screen()}<h3>3 倍</h3><div class="zoom3">{equip_screen()}</div>' if gear else '<p>本批沒有裝備。</p>')
    rarity_row = ''.join(f'<figure>{cell(p, 28)}<figcaption>{RARITY_NAME[r]}<br>{esc(nm.get(p, p))}</figcaption></figure>'
                         for r in ['common', 'magic', 'rare', 'legendary', 'unique', 'set'] for p in [next((q for q in gear if rarity_of(q) == r), None)] if p)
    frames_row = ''.join(f'<figure>{img(frame.get(r), "px", "width:64px;height:64px")}<figcaption>ui-rarity-{r}</figcaption></figure>' for r in FRAMED)
    frames_row += f'<figure>{img(glow, "px", "width:80px;height:80px")}<figcaption>ui-glow-legendary</figcaption></figure>'

    # 2. old base icons beside the new gear icons
    olds = [(p, pg.pub(f'icon/{p}.png', f'old-icon-{p}.png')) for p in gear if p in G.GEAR_BASE]
    old_rows = ''.join(f'<tr><th>{esc(nm.get(p, p))}<br><small>{p}</small></th><td class="dark">{img(o)}{img(o, "px", "zoom:3")}<br><small>舊 icon/{p}.png</small></td>'
                       f'<td class="dark">{img(icon.get(p))}{img(icon.get(p), "px", "zoom:3")}<br><small>新 gear/{p}.png</small></td></tr>'
                       for p, o in olds if o)

    # 3. large and icon from the same cell
    def pair(p):
        a, b = reg.get(f'gear-{p}-large', {}), reg.get(f'gear-{p}', {})
        same = a.get('source') and a.get('source') == b.get('source')
        return (f'<tr><th>{esc(nm.get(p, p))}<br><small>{p}</small></th><td class="dark">{img(large.get(p))}{img(large.get(p), "px", "zoom:3")}</td>'
                f'<td class="dark">{img(icon.get(p))}{img(icon.get(p), "px", "zoom:3")}</td>'
                f'<td>{"同一格 ✓ " + esc(a["source"].get("cell")) if same else "source 不同或未挑選"}</td></tr>')
    pairs = ''.join(pair(p) for p in gear)

    # 4. portal cards: owned icon and unowned silhouette, side by side
    def card(region):
        keys = [k for k in G.REGION_LIMITED if k.startswith(region + '-')] + [f'set-{region}']
        shown = [k for k in keys if G.SET_FIRST.get(k, k) in gear]
        if not shown: return ''
        art = pg.pub(f'portal/{region}.png')
        items = ''.join(f'<div class="lim"><span class="ttl">{esc(nm.get(k, k))}</span>'
                        f'<span>已取得 {img(pg.final(f"gear-{G.SET_FIRST.get(k, k)}"), "px li")}</span>'
                        f'<span>未取得 {img(pg.silhouette(k), "px li")}</span></div>' for k in shown)
        return (f'<div class="card">{img(art, "px art", "width:270px;height:165px")}<div class="cap">{REGION_NAME[region]}</div>'
                f'<div class="lims">{items}</div></div>')
    cards = ''.join(card(r) for r in REGION_NAME)

    # 5. list rows: shop, forge, loot line
    def row(p, extra=''):
        return f'<div class="lrow">{img(icon.get(p), "px gi", alt=nm.get(p, p))}<span>{esc(nm.get(p, p))}</span>{extra}</div>'
    shop = ''.join(row(p, '<span class="price">G</span>') for p in gear if p in G.GEAR_BASE)
    forge = ''.join(row(p, f'<span class="tag">{RARITY_NAME[rarity_of(p)]}</span>') for p in gear if p not in G.GEAR_BASE)
    loot = ''.join(f'<p class="loot">獲得了 {img(icon.get(p), "px gi")}<span class="r-{rarity_of(p)}">{esc(nm.get(p, p))}</span>！</p>' for p in gear[:4])

    # 6. materials
    def mat_row(p, src, old=False):
        sizes = ''.join(img(src, 'px', f'height:{h}px') for h in (32, 64, 128))
        return f'<tr><th>{esc(nm.get(p, p))}<br><small>{"舊 " if old else ""}icon-{p}</small></th><td class="dark">{sizes}</td></tr>'
    mat_new = ''.join(mat_row(p, pg.final(f'icon-{p}')) for p in mats)
    mat_old = ''.join(mat_row(p, pg.pub(f'icon/{p}.png', f'old-icon-{p}.png'), True) for p in OLD_MATERIALS) if mats else ''

    # 7. skills beside the character's existing icons
    def owner_block(o):
        new = [p for p in skills if owners.get(p) == o]
        if not new: return ''
        old = [s for s, w in owners.items() if w == o and s not in G.SKILL_DESC]
        cells = ''.join(f'<figure>{img(pg.final(f"icon-{s}"), "px", "height:64px")}<figcaption>{esc(nm.get(s, s))}<br><small>新 {s}</small></figcaption></figure>' for s in new)
        olds_ = ''.join(f'<figure>{img(pg.pub(f"icon/{s}.png", f"old-icon-{s}.png"), "px", "height:64px")}<figcaption>{esc(nm.get(s, s))}<br><small>現有 {s}</small></figcaption></figure>' for s in old)
        return f'<h3>{OWNER_NAME.get(o, o)}</h3><div class="row dark">{cells}</div><div class="row dark">{olds_ or "<small>這個角色還沒有現有技能圖示。</small>"}</div>'
    skill_html = ''.join(owner_block(o) for o in G.SKILL_OWNERS)

    # 8. the forge with Doran, beside the published item shop
    def facility(scene, npc, label_):
        bg = img(scene, 'px', 'width:960px;height:540px') or '<div class="missing" style="width:960px;height:540px">場景未產生</div>'
        return f'<figure><div class="fac">{bg}{img(npc, "px npc")}</div><figcaption>{label_}</figcaption></figure>'
    forge_html = ''
    if 'scene-forge' in [j['id'] for j in js] or 'npc-forge-happy' in [j['id'] for j in js]:
        sc = pg.final('scene-forge') or pg.pub('scene/forge.png')
        forge_html = (facility(sc, pg.final('npc-forge') or pg.pub('npc/forge.png'), '鍛造屋（新）：scene-forge＋npc-forge，照 facility 的位置（右下、高 330px）')
                      + (facility(sc, pg.final('npc-forge-happy'), '笑臉 npc-forge-happy') if pg.reg.get('npc-forge-happy', {}).get('final') else '')
                      + facility(pg.pub('scene/shop.png'), pg.pub('npc/shop.png'), '已發布的道具店（對照）'))

    page = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>裝備美術審核</title><style>
:root{{color-scheme:dark}}
body{{margin:0;padding:16px;background:#121318;color:#e8e6df;font:14px/1.6 system-ui,"Noto Sans TC",sans-serif}}
h1{{font-size:20px}} h2{{font-size:17px;margin:32px 0 8px;border-top:1px solid #333;padding-top:12px}} h3{{font-size:15px;margin:18px 0 6px}}
.note{{color:#b9b4a6}} .px,.cell img,.rf,.rg{{image-rendering:pixelated}} figure{{margin:0}} figcaption{{color:#b9b4a6;font-size:12px}}
.row{{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;padding:8px}} .row.top{{align-items:flex-start}} .dark{{background:#191b29}} .small,small{{font-size:12px;color:#b9b4a6}}
table{{border-collapse:collapse}} td,th{{padding:6px 10px;border-bottom:1px solid #2b2b33;vertical-align:middle;text-align:left}} td img{{margin-right:10px;vertical-align:middle}}
.screen{{display:flex;gap:24px;align-items:flex-start;background:#1b1d2a;border:2px solid #3a3f66;padding:10px;width:max-content}}
.bag-grid{{display:grid;grid-template-columns:repeat(10,28px);gap:2px}} .doll{{display:grid;grid-template-columns:repeat(3,38px);gap:4px;margin-top:10px}}
.cell{{position:relative;background:#262840;border:1px solid #3d4068;display:flex;align-items:center;justify-content:center;box-sizing:border-box}}
.cell .gi{{width:24px;height:24px;object-fit:none}} .cell .short{{font-size:9px;line-height:1;text-align:center}}
.rf{{position:absolute;inset:0;pointer-events:none;border:5px solid transparent;border-image-slice:5;border-image-repeat:round}}
.rf.big{{border-width:10px}} .rg{{position:absolute;inset:-3px;pointer-events:none;border:7px solid transparent;border-image-slice:7;border-image-repeat:round}}
.detail{{display:flex;gap:10px;align-items:center}} .artbox{{position:relative;width:64px;height:64px;padding:10px;background:#262840}}
.artbox .rf{{inset:0}} .zoom3{{zoom:3;width:max-content}}
.card{{display:inline-block;vertical-align:top;margin:0 16px 16px 0;background:#1b1d2a;border:3px solid #b08a3e;padding-bottom:6px}}
.card .art{{display:block}} .card .cap{{padding:3px 8px;font-weight:600;color:#f1e3b8}} .lims{{padding:0 8px}}
.lim{{display:flex;gap:12px;align-items:center;font-size:13px}} .lim .ttl{{min-width:6em}} .li{{width:26px;height:26px;zoom:2;vertical-align:middle}}
.lrow{{display:flex;align-items:center;gap:6px;min-height:24px;padding:2px 8px;border-bottom:1px solid #2b2b33;width:320px;background:#1b1d2a}}
.lrow .gi,.loot .gi{{width:24px;height:24px;object-fit:none;vertical-align:middle}} .price,.tag{{margin-left:auto;color:#d9c27a;font-size:12px}}
.loot{{background:#10111a;border:2px solid #3a3f66;padding:6px 10px;width:max-content}}
.r-legendary{{color:#ff9d3c}} .r-unique{{color:#e6c35c}} .r-set{{color:#6fd26f}} .r-magic{{color:#7fa8ff}} .r-rare{{color:#ffe14d}}
.fac{{position:relative;width:960px;height:540px;overflow:hidden;border:2px solid #3a3424}} .fac>img:first-child{{display:block}}
.fac .npc{{position:absolute;right:0;bottom:0;height:330px}} .missing{{background:#333;color:#999;display:flex;align-items:center;justify-content:center}}
.gal .att{{display:inline-block;vertical-align:top;margin:0 16px 16px 0;max-width:460px}} .gal h4{{margin:4px 0;font-size:13px}}
.gal .raw{{max-width:440px;max-height:300px;display:block;border:1px solid #333}} .ok{{color:#9fd77f}} .rej{{color:#e6a07a;margin:4px 0}}
.finals{{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}} .finals .c img{{max-width:200px;max-height:130px;min-height:32px;image-rendering:pixelated}} .finals figcaption{{max-width:200px}}
</style></head><body>
<h1>星燈迷宮 計畫 5d 美術候選・批次 {esc(batch)}（qa_passed，尚未核准、未發布）</h1>
<p class="note">本頁所有像素圖以最近鄰放大顯示。格子、外框位置、名稱與價格是 HTML 示意，不在圖片裡。登錄狀態最多到 qa_passed；核准與發布要等你在這頁確認（補遺 S4）。登錄表批次：{esc(lab)}。</p>

<h2>0. 本批清單（{checklist.count("data-part=")} 件）</h2>
<table><tr><th>id</th><th>名稱</th><th>工作表</th><th>狀態</th><th>QA</th></tr>{checklist}</table>

<h2>1. 裝備頁情境：背包格 28px（10×2）、人形 9 格 38px、詳情欄 64px 大圖，套上候選外框與傳說光暈</h2>
<p class="note">小圖示 26×26 以 1:1 顯示（中央 24×24，不縮放）；外框只壓在格子外緣 5px（slice 5）。沒有圖的格子照遊戲現況只顯示名稱前四字。</p>
{eq}
<h3>每種稀有度各一件</h3><div class="row dark">{rarity_row or "<small>本批沒有裝備。</small>"}</div>
<h3>外框與光暈原圖（放大 4 倍）</h3><div class="row dark">{frames_row}</div>

<h2>2. 新舊對照：舊底材圖示 icon/&lt;id&gt;.png 與新的 gear-&lt;id&gt;</h2>
<table>{old_rows or "<tr><td>本批沒有要換掉的舊底材圖示。</td></tr>"}</table>

<h2>3. 大圖 64 與小圖示 24（1 倍與 3 倍），出自同一格原圖</h2>
<table><tr><th>物品</th><th>大圖 gear-&lt;id&gt;-large</th><th>小圖示 gear-&lt;id&gt;</th><th>source</th></tr>{pairs or "<tr><td>本批沒有裝備。</td></tr>"}</table>

<h2>4. 傳送門卡片情境：已取得顯示圖示，未取得顯示剪影</h2>
<p class="note">剪影在本頁由候選小圖示即時轉出（墨色 #1d1a2e、輪廓光 #8f86b8），不寫入登錄表；核准之後才由 gear_art.py silhouettes 正式產生。</p>
<div>{cards or "<p>本批沒有地區限定裝備。</p>"}</div>

<h2>5. 清單情境：商店、鍛造、戰利品文字行</h2>
<div class="row top"><div><h3>商店清單</h3>{shop or "<small>無</small>"}</div><div><h3>鍛造清單</h3>{forge or "<small>無</small>"}</div><div><h3>戰利品</h3>{loot or "<small>無</small>"}</div></div>

<h2>6. 素材：深色面板上 32／64／128px，與舊素材圖示並排</h2>
<table>{mat_new or "<tr><td>本批沒有素材。</td></tr>"}{mat_old}</table>

<h2>7. 技能：同角色的新技能圖示與現有技能圖示並排</h2>
{skill_html or "<p>本批沒有技能圖示。</p>"}

<h2>8. 鍛造屋：場景 418×235 放大到 960×540，疊上多蘭半身像</h2>
<div class="row">{forge_html or "<p>本批沒有鍛造屋。</p>"}</div>

<h2>9. 全部生成版本與淘汰原因</h2>
<p class="note">原圖為 codex 輸出（已把背景校正為純洋紅）；下方為該版後處理結果與機械 QA。</p>
{gallery(pg, js)}
</body></html>'''
    (OUT / 'index.html').write_text(page, encoding='utf-8', newline='\n')
    print(OUT / 'index.html')
    return OUT / 'index.html'


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'sample')
