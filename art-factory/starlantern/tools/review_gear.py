"""review_gear.py <sample|main-gear|skills>: build tmp/starlantern/review-gear/index.html for a plan 5d batch.

Shows the batch's chosen candidates (registry `final`, status up to qa_passed) in use: the equipment screen (bag and doll
cells with rarity frames and the legendary glow, the 64 px detail image, at 1x and 3x), old base icons beside the new
ones, large/icon pairs from the same cell, portal cards with owned icons and silhouettes (made here in the page, never in
the registry), list rows (shop, forge, loot line), materials, skills beside the character's existing ones, the forge
with Doran, and a gallery of every attempt with its QA and the reason it was not chosen.
Read-only for public/ and the registry. It records the sha256 of every final it shows in work/review/<batch>-shown.json;
`gear_art.py approve` refuses parts whose file changed since. The main conversation publishes the page with the Artifact tool.
"""
import datetime, html, json, re, shutil, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gear_art as G  # noqa: E402
import sl_art as A  # noqa: E402

REPO = G.REPO
PUB = REPO / 'public/assets/games/starlantern'
OUT = REPO / 'tmp/starlantern/review-gear'


def out_dir(batch):
    """The review folder of a batch: the sample (G1) keeps OUT; main-gear (G2) and skills (G3) get their own, so building
    one batch's page never overwrites another batch's published page."""
    return OUT if batch == 'sample' else OUT.with_name(OUT.name + {'main-gear': '-g2', 'skills': '-g3'}[batch])
DATA = REPO / 'src/scripts/games/starlantern/data'
RARITY_NAME = {'common': '普通', 'magic': '魔法', 'rare': '稀有', 'epic': '史詩', 'legendary': '傳說', 'unique': '獨特', 'set': '套裝'}
FRAMED = G.FRAMED_RARITIES                  # addendum 2: six frames (common has none)
STARLIT_ON = ['legendary', 'unique', 'set']   # the tiers a starlit drop can have (plan 5g STARLIT_RARITIES)
SLOT_ORDER = list(A.SUBJECT_CLASS) + ['other']
SLOT_NAME = {'weapon': '武器', 'offhand': '副手', 'head': '頭', 'body': '身體', 'hands': '手', 'feet': '腳', 'neck': '頸', 'ring': '戒指',
             'other': '其他'}
REGION_NAME = {'blaze': '熾焰之地', 'frost': '霜凍之地', 'storm': '雷鳴之地', 'mire': '腐毒沼澤', 'shade': '暗影迴廊', 'iron': '鋼鐵要塞'}
OLD_MATERIALS = ['moss', 'bat-wing', 'thorn-fang', 'crystal-shell', 'ice-crystal', 'lizard-scale', 'star-stone', 'dusk-cloth', 'old-coin', 'ancient-gear']
OWNER_NAME = {'noel': '諾艾兒', 'chizuru': '千鶴', 'liz': '莉茲', 'sylvie': '希爾薇', 'scarlet': '絲嘉蕾', 'selene': '瑟蕾',
              'safira': '莎菲拉', 'bobby': '波比', 'rin': '凜', 'hero': '洛恩'}


def esc(s): return html.escape(str(s))


def _read(f): return (DATA / f).read_text(encoding='utf-8')


def _objects(src):
    """{id: the text of that `{ id: '...' ... }` object up to the next one}, so other keys may come in any order
    (the abyss skills put `abyss: true` before `name`)."""
    starts = [(m.start(), m.group(1)) for m in re.finditer(r"\{ id: '([a-z0-9-]+)'", src)]
    return {i: src[a:b] for (a, i), (b, _) in zip(starts, starts[1:] + [(len(src), '')])}


def _field(text, key):
    m = re.search(rf"\b{key}: '([^']*)'", text); return m.group(1) if m else None


def names():
    """Display names read from the game data (never hand-copied)."""
    n = {}
    for f in ('equipment.ts', 'materials.ts', 'skills.ts', 'items.ts'):
        n.update({i: _field(t, 'name') for i, t in _objects(_read(f)).items() if _field(t, 'name')})
    g = _read('gear.ts')
    n.update(re.findall(r"\(\['([a-z0-9-]+)', '([^']+)'", g))
    nouns = dict(re.findall(r"(\w+): '(之[^']+)'", g))
    for sid, stem, slots in re.findall(r"\{ id: '(set-[a-z]+)', stem: '([^']+)', region: '[a-z]+', slots: \[([^\]]+)\]", g):
        n[sid] = f'{stem}套裝'
        for slot in re.findall(r"'(\w+)'", slots): n[f'{sid}-{slot}'] = stem + nouns[slot]
    return n


def prices():
    return {i: int(m.group(1)) for i, t in _objects(_read('equipment.ts')).items() if (m := re.search(r'\bprice: (\d+)', t))}


# The questions each batch puts to the user (addendum §4), with links to the sections that answer them and the known
# risks written out plainly (from the independent visual check), so the user decides with the problems in view.
# (question, links, known risks, explanation). The sample's block is plan 5d addendum 2 §6 (the G1 redo).
DECISIONS = {
    # Controller rulings 2026-10-20 (after Task E): the real state of the G1 redo. 〔最接近〕 and 〔星輝〕 are filled from the
    # registry when the page is built (live_text), so the page never claims a pick it does not show.
    'sample': [
        ('圖示大小是否一致', ['#size', '#s1'], [
            '短刃與劍現在一樣長，靠「短寬刃、大握柄」的比例區分。',
            '戒指、項鍊放大到和鎧甲同一份量後，看起來會比以前大（在 G2）。',
            '長柄武器與弓在格子裡看起來比劍細一點：這是它們的份量下限放寬到 0.20 的結果。'],
         '已經做到：所有裝備圖示畫在同一個 26×26 畫布上，主體長邊統一是 22（大圖 56），請看尺寸一致性格。盾、鎧甲、手甲另外要求夠寬、'
         '夠飽滿，不合格的會被機械閘門擋下重畫。份量下限：一般武器 0.28；長柄武器（遊戲資料裡的槍類，例如雙月槍）是一根細桿加槍頭、'
         '弓是一道細弧加一條弦，份量天生較輕，下限放寬為 0.20；杖與其他部位不變。'),
        ('七階外框與星輝', ['#frames', '#s1'], [
            '獨特由金色改成緋紅（和稀有黃、傳說橘分開），遊戲內的文字色要一起改。',
            '史詩只能用偏藍的紫，不能用偏粉的紫，因為生成用的是洋紅去背。'],
         '普通沒有外框。魔法藍、稀有黃、史詩藍紫、傳說橘、獨特緋紅、套裝綠，造型逐階增加：素邊 → 鉚釘 → 切角寶石 → 火舌 → 雕花角飾 → 葉徽。'
         '有外框的六階（普通沒有外框）兩兩之間的 15 組色差都在門檻 25 以上，〔最接近〕。'
         '獨特沒有金色內緣線：生成的細金線縮到 16 格後會斷成雜點，已接受只用緋紅邊帶加雕花角飾（緋紅和稀有黃、傳說橘的色差足夠）。'
         '星輝改版：只在外框四角各放一顆小角星，邊與中間全透明，所以不會沿著邊連成虛線；只疊在擲出星輝的傳說、獨特、套裝上。'
         '角星的造型請看下一題。〔星輝〕'),
        ('傳說光暈改在格內', ['#glow'], [],
         '光暈改成外框內側一圈 1px 淡橘光，加四角火花，畫在圖示下層，不再伸進隔壁格。請看兩件傳說相鄰的示範。'),
    ],
    # Plan 5d Task 9 (G2, addendum 1 gate table): 〔未通過〕 is filled from the registry when the page is built.
    'main-gear': [
        ('60 件裝備逐件確認', ['#size', '#s1', '#s3', '#s5'], [
            '〔未通過〕', '〔只數外緣〕', '〔多版〕', '〔採用版備註〕', '〔未採用版〕', '〔容易搞混〕',
            '細長武器（槍、弓）允許看起來比較瘦：它們的份量下限是 0.20，其他武器 0.28。'],
         '和 G1 同一套規則：同一個 26×26 畫布、主體長邊統一 22，盾與鎧甲夠寬；細長武器（槍、弓）允許看起來比較瘦，杖照一般武器。'
         '請在尺寸一致性格裡一起看 G1 的 9 件與本批 60 件，份量是不是一致。'),
        ('套裝每套 4 件是否一眼看得出同一套', ['#s1', '#s4'], [], '五套新套裝（霜凍、雷鳴、腐毒、暗影、鋼鐵）各 4 件，熾焰套裝的戒指也在本批，和 G1 已核准的 3 件配成一套。'),
        ('6 種地區素材與多蘭笑臉', ['#s6', '#s8'], [], '地區素材和舊素材圖示並排；多蘭笑臉和 G1 已核准的多蘭是同一個人。'),
    ],
    # Plan 5d G3 (skills): 〔...〕 are filled from the registry when the page is built.
    'skills': [
        ('78 個技能圖示和同角色既有圖示一致嗎', ['#s7'], [
            '〔未通過〕', '〔多版〕', '〔採用版備註〕', '〔未採用版〕', '〔容易搞混〕',
            '遊戲裡技能列用 16px、技能樹用 14px 顯示，會把約 32px 的圖示縮小（不是整數倍），細節會變糊；請看 7. 技能 的「遊戲實際大小」那一列。'],
         '每位夥伴的新技能圖示和他現有的技能圖示放在一起（放大 2 倍與遊戲實際的 16px、14px），配色、描邊、大小是不是一致。'),
        ('洛恩與凜的技能圖示（沒有舊圖示可對照）', ['#s7'], ['凜的技能多是深色細刀，在深色面板上 16px、14px 偏暗，不容易看清楚。'],
         '洛恩 21 個、凜 10 個技能以前都沒有圖示，生成時參考他們已發布的立繪配色。請看是否像同一個角色的技能、彼此分得出來。'),
    ],
}
DECIDED = {   # addendum 2 §6: decided on 2026-10-20, not asked again
    'skills': ('已決定（G1、G2，2026-10-20）', [
        '畫風：G1 已核准；裝備 G2 已核准並發布。',
        '技能圖示沿用既有 27 個技能圖示的大小（高約 32）與畫風，遊戲裡照現有的 16px、14px 顯示。']),
    'main-gear': ('已決定（G1，2026-10-20）', [
        '畫風、大小（主體長邊 22）、七階外框、星輝圓點光、格內光暈：G1 已核准，本批照同一套規則。',
        '15 件舊底材圖示全部換新：〔舊底材〕。']),
    'sample': ('已決定（2026-10-20）', [
        '畫風與大小比例的方向：「可以」。',
        '多蘭的外型：照目前的版本（本批未重畫，和上次看到的是同一張）。',
        '素材 6 件：照上次的版本（本批未重畫）。',
        '15 件舊底材圖示全部換新：正式版會換掉全部 15 件；〔舊底材〕，其餘在 G2。']),
}


def tightest_frames(reg):
    """The closest pair of picked tier frames by band colour: (ΔE, tier a, tier b), or None when fewer than two are picked."""
    tier = {G.FRAME_ASSET[r]: r for r in G.FRAMED_RARITIES}
    cols = {a: tuple(e['qa']['stroke_colour']) for a in G.TIER_FRAMES if (e := reg.get(a)) and (e.get('qa') or {}).get('stroke_colour')
            and e.get('status') not in ('rejected', 'retired')}
    pairs = [(A.delta_e(cols[a], cols[b]), tier[a], tier[b]) for i, a in enumerate(cols) for b in list(cols)[i + 1:]]
    return min(pairs) if pairs else None


def live_text(s, reg):
    """Fill the decision block's measured parts from the registry."""
    tp = tightest_frames(reg)
    near = (f'最接近的一對是{RARITY_NAME[tp[1]]}與{RARITY_NAME[tp[2]]}（ΔE {tp[0]:.1f}）' if tp
            else '最接近的一對要等七階外框挑齊才算得出 ΔE')
    e = reg.get('ui-starlit', {})
    star = (f'頁面上的星輝是新版角星（第 {e.get("chosen_attempt", "")[1:]} 版）。' if e.get('source_id') == G.STARLIT_SHEET_ID
            else '新版星輝尚未生成：頁面暫時顯示舊版（邊上的星點在遊戲裡會重複成虛線），新版生成並通過 QA 後會換上。')
    return s.replace('〔最接近〕', near).replace('〔星輝〕', star)
AFTER_APPROVAL = {
    'skills': '核准後的動作：執行 gear_art.py approve --batch skills --by "<你對這頁的原話> <YYYY-MM-DD>"，然後照 5d Task 10 的方式發布技能圖示。',
    'main-gear': '核准後的動作：執行 gear_art.py approve --batch main-gear --by "<你對這頁的原話> <YYYY-MM-DD>"、gear_art.py silhouettes，然後照 5d Task 10 發布。',
    'sample': '核准後的動作：執行 gear_art.py approve --batch sample --by "<你對這頁的原話> <YYYY-MM-DD>"，然後照 5d Task 8（已依補遺 2 §4 修改）發布。',
}
SECTION_NAME = {'#s1': '1. 裝備頁情境', '#s2': '2. 新舊對照', '#s3': '3. 大圖與小圖示', '#s4': '4. 傳送門卡片', '#s5': '5. 清單情境', '#s6': '6. 素材',
                '#s7': '7. 技能', '#s8': '8. 鍛造屋', '#glow': '光暈改在格內', '#size': '尺寸一致性', '#frames': '七階外框與星輝',
                '#starlit-alts': '星輝角星比較'}
SHAPE_NAME = {'round': '圓點光', 'cross': '十字星'}
GATE_NAME = {'sample': 'G1', 'main-gear': 'G2', 'skills': 'G3'}
# Items the G2 visual check found easy to confuse at 1x (controller ruling 2026-10-20: shown to the user as risks, not redrawn).
CONFUSABLES = {'main-gear': [('set-shade-feet', 'set-storm-feet'), ('set-shade-hands', 'set-storm-hands'),
                             ('set-frost-weapon', 'set-storm-weapon', 'set-shade-weapon', 'shade-silent-blade'),
                             ('crystal-pendant', 'frost-bloom-neck', 'set-frost-neck'), ('set-frost-ring', 'star-ring'),
                             ('copper-ring', 'blaze-ember-ring'), ('mire-miasma-mask', 'set-mire-head')],
               # G3 (skills): found at the in-game 16 / 14 px by the art agent's 1x check
               'skills': [('quickstep', 'phantom-step'), ('sand-cyclone', 'thousand-shadows', 'veil-dance', 'sirocco'),
                          ('hero-flare', 'hero-frost', 'hero-spark')]}


SHAPE_RISK = {'round': '1 倍下看起來是一顆圓圓的亮點，不是尖的閃光。', 'cross': '十字星只有 5 個像素，1 倍下很小，像一個細細的十字。'}
ORNAMENT_RISK = '角星蓋在外框四角，會蓋掉傳說火舌、獨特雕花、套裝葉徽這些角飾（邊上的顏色不受影響）。'


def starlit_question(alts, fails, plain=None):
    """The G1 question on the starlit corner-star shape (controller rulings 2026-10-20), from the passing candidates:
    (question, links, risks, explanation, options). Failed candidates are explained with their plain-words note
    (gear_art note --plain), never with raw QA strings."""
    if not alts: return None
    plain = plain or {}
    names = {k: SHAPE_NAME[v['shape']] for k, v in alts.items()}
    failed = '；'.join(f'{k} 沒通過：{plain.get(k) or "機械檢查沒通過（細節在「星輝角星比較」的技術細節）"}' for k in fails)
    risks = [SHAPE_RISK[v['shape']] for v in {v['shape']: v for v in alts.values()}.values()] + [ORNAMENT_RISK]
    if len(alts) == 1:
        k = next(iter(alts)); other = SHAPE_NAME['cross' if alts[k]['shape'] == 'round' else 'round']
        return (f'星輝角星：只有{names[k]}（{k}）通過，要用嗎？', ['#starlit-alts'], risks,
                f'只有 {k} 通過 QA，所以只放這一版。' + (failed + '。' if failed else ''),
                [f'A 接受 {k} {names[k]}', 'B 先不要星輝角星圖（只用文字光）', f'C 另開新版重畫{other}（需要再給嘗試次數）'])
    letters = 'ABCDEFG'
    opts = [f'{letters[i]} 用 {k} {names[k]}' for i, k in enumerate(alts)] + [f'{letters[len(alts)]} 先不要星輝角星圖（只用文字光）']
    why = ('兩種角星造型並排在 28px 背包格與 38px 人形格裡（疊在傳說、獨特、套裝外框上，1 倍與 3 倍）：'
           '圓點光是 4×4、白心 2×2，1 倍下像一顆圓圓的亮點；十字星是 3×3、白心 1 格加四個青白尖端，1 倍下像一顆尖尖的閃光。'
           '你選哪一版就用哪一版，兩版都已記在審核紀錄裡。' + (failed + '。' if failed else ''))
    return ('星輝角星：' + '或'.join(f'{names[k]}（{k}）' for k in alts) + '？', ['#starlit-alts'], risks, why, opts)


def skill_owners():
    """Owner of every skill in skills.ts; the plan 5d skills are grouped by gear_art.SKILL_OWNERS, which drives the sheets."""
    own = {i: _field(t, 'owner') for i, t in _objects(_read('skills.ts')).items() if _field(t, 'owner')}
    own.update({s: o for o, (_, ids) in G.SKILL_OWNERS.items() for s in ids})
    return own


def rarity_of(part):
    if part in G.GEAR_LEGEND: return 'legendary'
    if part in G.GEAR_UNIQUE: return 'unique'
    if part.startswith('set-'): return 'set'
    return ['common', 'magic', 'rare', 'epic'][list(G.GEAR_BASE).index(part) % 4]   # base items show each lower tier


class Page:
    """Copies files into img/ (only ones that exist) and remembers what it copied."""

    def __init__(self, out, reg):
        self.img = out / 'img'; self.reg = reg

    def copy(self, src, name):
        if not src: return None
        src = A._final_path(src)   # registry finals are relative to the repo root that sl_art writes them under
        if not src.is_file(): return None
        shutil.copyfile(src, self.img / name); return f'img/{name}'

    def display(self, src, name, width=600, colours=128):
        """A small display copy of a raw sheet for the page only (about `width` px wide, palette PNG); the raw itself is
        only read."""
        from PIL import Image
        src = Path(src)
        if not src.is_file(): return None
        im = Image.open(src).convert('RGB')
        if im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.quantize(colors=colours).save(self.img / name, optimize=True)
        return f'img/{name}'

    def final(self, aid):
        e = self.reg.get(aid, {})
        return self.copy(e.get('final'), f'{aid}.png')

    def pub(self, rel, name=None):
        return self.copy(PUB / rel, name or 'pub-' + rel.replace('/', '-'))

    def silhouette(self, key):
        """Preview only: the pure transform of the candidate icon (the registry gets silhouettes after approval)."""
        src = G.SET_FIRST.get(key, key); f = self.reg.get(f'gear-{src}', {}).get('final')
        if not f: return None
        p = A._final_path(f)
        if not p.is_file(): return None
        from PIL import Image
        A.silhouette_image(Image.open(p)).save(self.img / f'sil-{key}.png'); return f'img/sil-{key}.png'


def img(src, cls='px', style='', alt=''):
    return f'<img class="{cls}" src="{src}" alt="{esc(alt)}" loading="lazy"{f" style={chr(34)}{style}{chr(34)}" if style else ""}>' if src else ''


def qa_line(q):
    if not q: return ''
    bits = ['通過' if q.get('pass') else '未通過 ' + '、'.join(q.get('reasons', []))]
    if q.get('warnings'): bits.append('警告 ' + '、'.join(q['warnings']))
    for k in ('size', 'subject', 'scale', 'block', 'residue', 'semi', 'holes', 'magenta_spill', 'center_clear', 'ring_closed', 'edge_repeat',
              'stroke', 'reach', 'hue'):
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
            thumb = pg.display(magenta if magenta.exists() else raw, f'raw-{sid}-{k}.png')
            used = [a for a, c in chosen.items() if c == k and pg.reg.get(a, {}).get('source_id', sid) == sid]
            finals = []   # per-part verdicts as text: the artifact host keeps at most 511 files, so no crop image per part
            for a in aids:
                qf = wd / f'{a}.qa.json'
                if not qf.exists(): continue
                q = json.loads(qf.read_text(encoding='utf-8'))
                verdict = '通過' if q.get('pass') else '未通過：' + '、'.join(q.get('reasons', []))
                finals.append(f'<li><b>{esc(a)}</b>：{esc(verdict)}'
                              f'<details class="tech"><summary>技術細節</summary>{esc(qa_line(q))}</details></li>')
            reason = rej.get(k, ''); plain = pg.reg.get(sid, {}).get('plain_reasons', {}).get(k, '')
            why = (f'<p class=rej>{esc(plain)}</p>' if plain else '') + (
                f'<details class="tech"><summary>{"技術細節" if plain else "採用／未採用原因"}</summary>{esc(reason)}</details>' if reason else '')
            cells.append(f'<div class="att"><h4>{esc(sid)} {k} <span class="ok">{esc("採用：" + "、".join(used) if used else "")}</span></h4>'
                         f'<details class="rawbox"><summary>原圖（縮小到 600px 寬）</summary>{img(thumb, "raw")}</details>{why}'
                         f'<ul class="finals">{"".join(finals)}</ul></div>')
        rows.append(f'<section class="gal"><h3>{esc(sid)}</h3>{"".join(cells) or "<p>尚未生成。</p>"}</section>')
    return ''.join(rows)


def _measured(path, e, target):
    """Size metrics of a final: the QA record when it has them, else measured on the file (older finals)."""
    from PIL import Image
    q = e.get('qa') or {}
    if isinstance(q.get('subject'), dict): return q['subject']
    return A.subject_metrics(Image.open(path).convert('RGBA'), target)


def _gate_failed(e, m, target, slot, kind=None):
    q = e.get('qa') or {}
    if isinstance(q.get('subject'), dict):
        return any(r.startswith('subject ') or r == 'cell too small to sample' for r in q.get('reasons', []))
    return bool(A.subject_gate(m, target, None if slot == 'other' else slot, kind))


def size_grid(pg, reg):
    """Addendum 2 §1: every gear icon in the registry (any batch, with a final, not rejected or retired) on one grid,
    one row per slot, at 1x and 3x, each with its subject bbox (`.bbox`, from qa.subject.box) and the centred 22 x 22
    target (`.target`); cells that fail the size gate get `out`. Then the large images (target 56), the silhouettes
    (28) and the old base icons (`data-old`, not gated). The boxes are review-page markup, not game art."""
    from PIL import Image
    icon_target, large_target = G.ICON[0], G.LARGE[0]
    live = lambda e: e.get('final') and e.get('status') not in ('rejected', 'retired') and A._final_path(e['final']).is_file()
    parts = [a[5:] for a, e in reg.items() if a.startswith('gear-') and not a.endswith(('-large', '-silhouette')) and live(e)]
    by_slot = {}
    for p in parts: by_slot.setdefault(G.GEAR_SLOT.get(p, 'other'), []).append(p)
    nm = names()

    def box_cell(attr, part, aid, target, z):
        e = reg[aid]; path = A._final_path(e['final']); src = pg.copy(e['final'], f'size-{aid}.png')
        W, H = Image.open(path).size; m = _measured(path, e, target)
        out = ' out' if _gate_failed(e, m, target, G.GEAR_SLOT.get(part, 'other'), G.GEAR_KIND.get(part)) else ''
        x0, y0, x1, y1 = m['box']; tx, ty = (W - target) // 2, (H - target) // 2
        return (f'<figure class="sz{out}" {attr}="{esc(part)}"><div class="szbox" style="width:{W * z}px;height:{H * z}px">'
                f'{img(src, "px", f"width:{W * z}px;height:{H * z}px", nm.get(part, part))}'
                f'<span class="bbox" style="left:{x0 * z}px;top:{y0 * z}px;width:{(x1 - x0) * z}px;height:{(y1 - y0) * z}px"></span>'
                f'<span class="target" style="left:{tx * z}px;top:{ty * z}px;width:{target * z}px;height:{target * z}px"></span></div>'
                f'<figcaption>{esc(nm.get(part, part))}<br>長 {m["long"]}／短 {m["short"]}／份量 {m["mass"]:.2f}</figcaption></figure>')

    def rows(make):
        return ''.join(f'<div class="szrow"><span class="szlab">{SLOT_NAME.get(s, s)}</span>{"".join(make(p) for p in by_slot[s])}</div>'
                       for s in SLOT_ORDER if s in by_slot)
    grids = ''.join(f'<h3>{z} 倍</h3>' + rows(lambda p, z=z: box_cell('data-size-cell', p, f'gear-{p}', icon_target, z)) for z in (1, 3))
    large = rows(lambda p: box_cell('data-size-large', p, f'gear-{p}-large', large_target, 1)
                 if f'gear-{p}-large' in reg and live(reg[f'gear-{p}-large']) else '')

    def sil(p):
        name = f'size-sil-{p}.png'
        A.silhouette_image(Image.open(A._final_path(reg[f'gear-{p}']['final']))).save(pg.img / name)
        return f'<figure class="sz" data-size-sil="{esc(p)}">{img(f"img/{name}", "px")}<figcaption>{esc(nm.get(p, p))}</figcaption></figure>'
    sils = rows(sil)

    old_long = []

    def old(b):
        e = reg[f'icon-{b}']
        src = pg.pub(f'icon/{b}.png', f'size-old-icon-{b}.png') or pg.copy(e.get('final'), f'size-old-icon-{b}.png')
        if not src: return ''
        w, h = Image.open(pg.img / src[4:]).size
        old_long.append(A.subject_metrics(Image.open(pg.img / src[4:]).convert('RGBA'), icon_target)['long'])
        return (f'<figure class="sz old" data-old="{esc(b)}">{img(src, "px")}{img(src, "px", f"width:{w * 3}px;height:{h * 3}px")}'
                f'<figcaption>舊 {esc(nm.get(b, b))} {w}×{h}</figcaption></figure>')
    olds = ''.join(old(b) for b in G.GEAR_BASE if f'icon-{b}' in reg)
    verdict = (f'<p class="note"><b>結論：舊圖示主體長邊 {min(old_long)}～{max(old_long)} px 不等，新圖示統一 {icon_target}。</b></p>'
               if old_long else '')
    return (f'<section id="size"><h2>尺寸一致性：全部 {len(parts)} 件裝備小圖示（不分批次），依部位排列</h2>'
            f'<p class="note">每格是 26×26 原圖（1 倍）或整數倍放大；紅框是物品實際佔的範圍，青色虛線是中央 {icon_target}×{icon_target} 的目標框。'
            f'紅底的格子沒過尺寸檢查（長邊、置中、夠不夠寬、份量）。「份量」是物品佔滿目標框的比例。框線是審核頁的標示，不在圖片裡。</p>'
            f'{grids or "<p>登錄表還沒有裝備小圖示。</p>"}'
            f'<h3>大圖 64（目標框 {large_target}）</h3>{large or "<p>沒有大圖。</p>"}'
            f'<h3>剪影預覽 28（由小圖示即時轉出，不寫入登錄表）</h3>{sils or "<p>沒有小圖示。</p>"}'
            f'<h3>舊底材圖示對照（不計入檢查）</h3>{verdict}<div class="szrow">{olds or "<small>沒有舊底材圖示。</small>"}</div></section>')


def frames_section(pg, reg, frame, glow, starlit, icon, gear, nm, cell):
    """Addendum 2 §2: one demo slot per tier (common has no frame), legendary / unique / set again with the starlit
    overlay, then each frame image at 4x with its palette swatch and QA (stroke, hue, nearest ΔE)."""
    demo = lambda r: next((p for p in gear if rarity_of(p) == r and icon.get(p)), next((p for p in gear if icon.get(p)), None))
    tiers = ''.join(f'<figure data-tier="{r}">{cell(demo(r), 38, "dollc", tier=r)}<figcaption>{RARITY_NAME[r]}<br>{G.RARITY_PALETTE[r]}</figcaption></figure>'
                    for r in RARITY_NAME)
    stars = ''.join(f'<figure data-starlit="{r}">{cell(demo(r), 38, "dollc", tier=r, star=True)}<figcaption>{RARITY_NAME[r]}＋星輝</figcaption></figure>'
                    for r in STARLIT_ON)
    qa = {r: (reg.get(G.FRAME_ASSET[r], {}).get('qa') or {}) for r in FRAMED}
    cols = {r: tuple(q['stroke_colour']) for r, q in qa.items() if q.get('stroke_colour')}

    def nearest(r):
        if r not in cols: return '—'
        de = [(A.delta_e(cols[r], c), o) for o, c in cols.items() if o != r]
        return f'{min(de)[0]:.1f}（{RARITY_NAME[min(de)[1]]}）' if de else '—'
    close = G.frames_too_close(reg)   # the whole tier-frame set, whatever order the frames were picked in

    def raw_fig(r):
        aid = G.FRAME_ASSET[r]; bad = close.get(aid)
        return (f'<figure{f" class={chr(34)}close{chr(34)} data-close={chr(34)}{aid}{chr(34)}" if bad else ""}>'
                f'{img(frame.get(r), "px", "width:64px;height:64px")}<figcaption>{aid}<br>'
                f'<span class="sw" style="background:{G.RARITY_PALETTE[r]}"></span>{G.RARITY_PALETTE[r]}<br>'
                f'stroke {qa[r].get("stroke", "—")}｜hue {qa[r].get("hue", "—")}｜ΔE {nearest(r)}'
                f'{"<br><b class=bad>" + esc("；".join(bad)) + "</b>" if bad else ""}</figcaption></figure>')
    raws = ''.join(raw_fig(r) for r in FRAMED)
    for key, src in (('glow-legendary', glow), ('starlit', starlit)):
        q = reg.get(G.FRAME_ASSET[key], {}).get('qa') or {}
        sw = ''.join(f'<span class="sw" style="background:{c}"></span>{c} ' for c in (G.STARLIT if key == 'starlit' else ()))
        raws += (f'<figure>{img(src, "px", "width:64px;height:64px")}<figcaption>{G.FRAME_ASSET[key]}<br>{sw}'
                 f'hue {q.get("hue", "—")}｜{"通過" if q.get("pass") else "、".join(q.get("reasons", [])) or "未產生"}</figcaption></figure>')
    return (f'<section id="frames"><h2>七階外框與星輝</h2>'
            f'<p class="note">人形格 38px，1 倍。普通沒有外框；魔法到套裝各一格；傳說、獨特、套裝再各放一格帶星輝的（星輝疊在外框之上）。</p>'
            f'<div class="row dark">{tiers}</div><div class="row dark">{stars}</div>'
            f'<h3>同上，放大 3 倍（有星輝與沒有星輝並排）</h3><div class="scroll"><div class="zoom3"><div class="row dark" data-tiers-zoom="3">'
            f'{tiers.replace(" data-tier=", " data-tier3=")}{stars.replace(" data-starlit=", " data-starlit3=")}</div></div></div>'
            f'<h3>外框、光暈、星輝原圖（放大 4 倍），色票與 QA</h3><div class="row dark">{raws}</div></section>')


def starlit_alts_section(pg, alts, fails, icon, gear, nm, cell, notes=None, plain=None):
    """The starlit corner-star shapes side by side (controller ruling 2026-10-20): every passing sheet-starlit-1 candidate
    in the runtime 28 px bag slot and 38 px equip slot, over the legendary, unique and set frames, at 1x and 3x; failed
    candidates are listed with their QA reasons and, when one was recorded (gear_art note), why in plain words."""
    demo = lambda r: next((p for p in gear if rarity_of(p) == r and icon.get(p)), next((p for p in gear if icon.get(p)), None))
    groups = ''
    for k, v in alts.items():
        src = pg.copy(str(v['path']), f'starlit-alt-{k}.png')
        def wrap(z, inner):
            return f'<div class="scroll"><div class="zoom3">{inner}</div></div>' if z == 3 else f'<div>{inner}</div>'
        figs = ''.join(f'<figure data-starlit-alt="{k}" data-size="{size}" data-zoom="{z}" data-tier="{r}">'
                       f'{wrap(z, cell(demo(r), size, "bag" if size == 28 else "dollc", tier=r, star=True, starlit_src=src))}</figure>'
                       for z in (1, 3) for size in (28, 38) for r in STARLIT_ON)
        stars = v['qa'].get('stars', [{}])
        groups += (f'<div class="alt"><h3>{k}：{SHAPE_NAME[v["shape"]]}</h3><p class="note">每角 {stars[0].get("w")}×{stars[0].get("h")}、'
                   f'白心 {stars[0].get("core")} 格、{stars[0].get("arms")} 個尖端；通過檢查。</p><div class="row dark">{figs}</div>'
                   f'<figure class="raw16">{img(src, "px", "width:64px;height:64px")}<figcaption>原圖 16×16，放大 4 倍</figcaption></figure>'
                   f'<details class="tech"><summary>技術細節</summary>挑選：gear_art.py pick --id {G.STARLIT_SHEET_ID} --attempt {k[1:]}</details></div>')
    plain = plain or {}
    failed = ''.join(f'<p class="note">{k} 沒通過，不列入：{esc(plain.get(k) or "機械檢查沒通過")}'
                     f'<details class="tech"><summary>技術細節</summary>{esc("、".join(r))}'
                     f'{"<br>" + esc((notes or {})[k]) if (notes or {}).get(k) else ""}</details></p>' for k, r in fails.items())
    return (f'<section id="starlit-alts"><h2>星輝角星比較</h2><p class="note">遊戲裡的實際格子（28px 背包格、38px 人形格），'
            f'1 倍與 3 倍，疊在傳說、獨特、套裝外框上。</p>{groups or "<p>還沒有通過 QA 的角星候選。</p>"}{failed}'
            f'<details class="tech"><summary>技術細節</summary>外框與星輝都是 border-image（slice 5、repeat）。</details></section>')


def main(batch='sample'):
    lab = G.label(batch); out = out_dir(batch)
    reg = json.loads(G.REG_PATH.read_text(encoding='utf-8'))['assets'] if G.REG_PATH.exists() else {}
    # Empty the folder rather than delete it: a shell or viewer may hold the folder itself open (Windows refuses rmdir).
    out.mkdir(parents=True, exist_ok=True)
    for child in out.iterdir():
        shutil.rmtree(child) if child.is_dir() else child.unlink()
    (out / 'img').mkdir()
    pg = Page(out, reg); nm = names(); owners = skill_owners()
    js = [j for j in G.jobs() if j['batch'] == batch]
    gear = [p for j in js if j['kind'] == 'gear-sheet' for p in j['parts']]
    mats = [p for j in js if j['id'].startswith('sheet-mat-') for p in j['parts']]
    skills = [p for j in js if j['id'].startswith('sheet-skill-') for p in j['parts'] if p]
    shown = {}
    for a in G.batch_assets(batch):
        f = reg.get(a, {}).get('final'); fp = A._final_path(f) if f else None
        if fp and fp.is_file(): shown[a] = G.sha256(fp)
    icon = {p: pg.final(f'gear-{p}') for p in gear}; large = {p: pg.final(f'gear-{p}-large') for p in gear}
    frame = {r: pg.final(G.FRAME_ASSET[r]) or pg.pub(f'ui/rarity-{r}.png') for r in FRAMED}
    glow = pg.final(G.FRAME_ASSET['glow-legendary']) or pg.pub('ui/glow-legendary.png')
    starlit = pg.final(G.FRAME_ASSET['starlit']) or pg.pub('ui/starlit.png')

    # 0. checklist: every part of the batch exactly once
    def status_row(job, p):
        aids = G.assets_of(job, p)
        ks = sorted({reg.get(a, {}).get('chosen_attempt') for a in aids if reg.get(a, {}).get('chosen_attempt')})
        st = '、'.join(f'已挑選第 {k[1:]} 版' for k in ks) or '未挑選'
        st_tech = '；'.join(f'{a}：{reg.get(a, {}).get("status", "未挑選")} {reg.get(a, {}).get("chosen_attempt", "")}'
                            f'{" sha " + shown[a][:12] if a in shown else ""}' for a in aids)
        qs = [reg.get(a, {}).get('qa') for a in aids if reg.get(a, {}).get('qa')]
        verdict = ('通過' if qs and all(q.get('pass') for q in qs) else '未通過：' + '、'.join(r for q in qs for r in q.get('reasons', []))) if qs else '未挑選'
        qa = verdict
        if any(A.qa_stale(reg.get(a, {})) and reg.get(a, {}).get('status') not in ('approved', 'published') for a in aids):
            st += '（QA 過期：在舊規格下量的，需重新 QA：gear_art.py requa）'   # an approved or published part is final, never "stale"
        tech = '；'.join([st_tech] + [qa_line(q) for q in qs])
        return (f'<tr data-part="{esc(p)}"><td>{esc(p)}</td><td>{esc(nm.get(p, ""))}</td><td>{esc(job["id"])}</td><td>{esc(st)}</td>'
                f'<td class="small">{esc(qa)}{"<details class=tech><summary>技術細節</summary>" + esc(tech) + "</details>" if tech else ""}</td></tr>')
    listed = dict.fromkeys((j['id'], p) for j in js for p in j['parts'] if p is not None)
    first = {}
    for sid, p in listed: first.setdefault(p, sid)            # a part two jobs draw (ui-starlit) is listed once, by its pick
    for p, sid in list(first.items()):
        src = next((reg.get(a, {}).get('source_id') for a in G.assets_of(G.job_by_id(sid), p)), None)
        if src in [j['id'] for j in js]: first[p] = src
    checklist = ''.join(status_row(G.job_by_id(sid), p) for p, sid in first.items())

    # 1. equipment screen
    def cell(p, px, cls='bag', tier=None, star=False, starlit_src=None):
        # Addendum 2 / task-6: [glow under the icon, icon, frame over it, starlit over the frame].
        if p is None: return f'<div class="cell {cls}" style="width:{px}px;height:{px}px"></div>'
        r = tier or rarity_of(p); fr = frame.get(r) if r != 'common' else None
        ico = img(icon.get(p), 'px gi', alt=nm.get(p, p)) or f'<span class="short">{esc(nm.get(p, p)[:4])}</span>'
        g = f'<span class="rg" style="border-image-source:url({glow})"></span>' if r == 'legendary' and glow else ''
        f = f'<span class="rf" style="border-image-source:url({fr})"></span>' if fr else ''
        st_src = starlit_src or starlit
        st = f'<span class="rs" style="border-image-source:url({st_src})"></span>' if star and r in STARLIT_ON and st_src else ''
        return f'<div class="cell {cls}" title="{esc(nm.get(p, p))}（{RARITY_NAME[r]}）" style="width:{px}px;height:{px}px">{g}{ico}{f}{st}</div>'

    def equip_screen():
        bag = gear + [None] * (max(20, -(-len(gear) // 10) * 10) - len(gear))   # every item, rows of 10 (ruling 2026-10-20)
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
    eq = (f'<h3>1 倍</h3><div class="scroll">{equip_screen()}</div><h3>3 倍</h3><div class="scroll"><div class="zoom3">{equip_screen()}</div></div>'
          if gear else '<p>本批沒有裝備。</p>')
    present = [r for r in RARITY_NAME if any(rarity_of(q) == r for q in gear)]
    rarity_row = ''.join(f'<figure>{cell(p, 28)}<figcaption>{RARITY_NAME[r]}<br>{esc(nm.get(p, p))}</figcaption></figure>'
                         for r in present for p in [next(q for q in gear if rarity_of(q) == r)])
    rarity_title = f'本批有的稀有度各舉一件（{"、".join(RARITY_NAME[r] for r in present)}；七階外框全部請看下一段）'
    frames_html = frames_section(pg, reg, frame, glow, starlit, icon, gear, nm, cell) if batch == 'sample' or gear else ''
    alts, fails = (G.starlit_alternatives(), G.starlit_failures()) if batch == 'sample' else ({}, {})
    notes = reg.get(G.STARLIT_SHEET_ID, {}).get('rejected_attempts', {}); plain = reg.get(G.STARLIT_SHEET_ID, {}).get('plain_reasons', {})
    frames_html += starlit_alts_section(pg, alts, fails, icon, gear, nm, cell, notes, plain) if batch == 'sample' else ''
    size_html = size_grid(pg, reg)

    # Two legendaries side by side at the real bag gap (2px): the glow now stays inside each slot (inset 0, under the icon).
    legs = [p for p in gear if rarity_of(p) == 'legendary'][:2]
    if len(legs) == 1: legs *= 2
    glow_pair = ''.join(f'<figure><div class="glow-pair{z}">{"".join(cell(p, 28) for p in legs)}</div><figcaption>{t}</figcaption></figure>'
                        for z, t in (('', '1 倍'), (' x4', '4 倍'))) if legs and glow else ''

    # 2. all old base icons beside the new gear icons (only some have a new sample in a given batch)
    old_bases = [b for b in G.GEAR_BASE if f'icon-{b}' in reg]
    def old_icon(b):
        return pg.pub(f'icon/{b}.png', f'old-icon-{b}.png') or pg.copy(reg[f'icon-{b}'].get('final'), f'old-icon-{b}.png')
    with_new = [b for b in old_bases if b in gear]
    done = {b: GATE_NAME.get(str(reg.get(f'gear-{b}', {}).get('batch', ''))[len('gear-5d-'):], '先前')
            for b in old_bases if b not in gear and reg.get(f'gear-{b}', {}).get('status') == 'published'}
    left = [b for b in old_bases if b not in done]
    done_text = '、'.join(f'{nm.get(b, b)} {g} 已換' for b, g in done.items())
    old_note = ((f'本批換掉 {len(with_new)} 件舊底材圖示（左舊右新）。' if with_new else '本批沒有新的底材樣本。')
                + (f'{done_text}，右欄是已經發布到遊戲裡的新圖示。' if done else ''))
    def new_cell(b):
        if b in gear and icon.get(b):
            return img(icon.get(b)) + img(icon.get(b), 'px', 'zoom:3') + f'<br><small>新 gear/{b}.png</small>'
        if b in done:
            src = pg.pub(f'gear/{b}.png', f'pub-gear-{b}.png')
            return (img(src) + img(src, 'px', 'zoom:3') if src else '') + f'<br><small>{done[b]} 已換上（已發布）</small>'
        return '<small>本批沒有新樣本</small>'
    old_rows = ''.join(f'<tr data-old-icon="{b}"><th>{esc(nm.get(b, b))}<br><small>{b}</small></th>'
                       f'<td class="dark">{img(o := old_icon(b))}{img(o, "px", "zoom:3")}<br><small>舊 icon/{b}.png</small></td>'
                       f'<td class="dark">{new_cell(b)}</td></tr>' for b in old_bases)
    s2_title = f'舊底材圖示 {len(left)} 件' + (f'（{done_text}）' if done else '')

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
    price = prices()
    shop = ''.join(row(p, f'<span class="price">{price[p]} G</span>') for p in gear if p in G.GEAR_BASE and p in price)
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
        cells = ''.join(f'<figure data-skill="{s}" data-owner="{o}">{img(pg.final(f"icon-{s}"), "px", "height:64px")}<figcaption>{esc(nm.get(s, s))}<br><small>新 {s}</small></figcaption></figure>' for s in new)
        olds_ = ''.join(f'<figure>{img(pg.pub(f"icon/{s}.png", f"old-icon-{s}.png"), "px", "height:64px")}<figcaption>{esc(nm.get(s, s))}<br><small>現有 {s}</small></figcaption></figure>' for s in old)
        def ingame(s, src, tag):
            return ''.join(f'<figure class="ingame" data-ingame="{px}" data-skill="{s}" title="{esc(nm.get(s, s))}（{tag}）">'
                           f'{img(src, "px", f"width:{px}px;height:{px}px")}</figure>' for px in (16, 14))
        game = (''.join(ingame(s, pg.final(f'icon-{s}'), '新') for s in new) + '<span class="sep"></span>'
                + ''.join(ingame(s, pg.pub(f'icon/{s}.png', f'old-icon-{s}.png'), '現有') for s in old))
        return (f'<h3>{OWNER_NAME.get(o, o)}</h3><div class="row dark">{cells}</div><div class="row dark">{olds_ or "<small>這個角色還沒有現有技能圖示。</small>"}</div>'
                f'<p class="note">遊戲實際大小（每個圖示依序是技能列 16px、技能樹 14px；分隔線左邊是新的，右邊是現有的）：</p>'
                f'<div class="row dark ingames">{game}</div>')
    skill_html = ''.join(owner_block(o) for o in G.SKILL_OWNERS)

    # 8. the forge with Doran, beside the published item shop
    def facility(scene, npc, label_):
        bg = img(scene, 'px', 'width:960px;height:540px') or '<div class="missing" style="width:960px;height:540px">場景未產生</div>'
        return f'<figure><div class="scroll"><div class="fac">{bg}{img(npc, "px npc")}</div></div><figcaption>{label_}</figcaption></figure>'
    forge_html = ''
    if 'scene-forge' in [j['id'] for j in js] or 'npc-forge-happy' in [j['id'] for j in js]:
        sc = pg.final('scene-forge') or pg.pub('scene/forge.png')
        forge_html = (facility(sc, pg.final('npc-forge') or pg.pub('npc/forge.png'), '鍛造屋（新）：scene-forge＋npc-forge，照 facility 的位置（右下、高 330px）')
                      + (facility(sc, pg.final('npc-forge-happy'), '笑臉 npc-forge-happy') if pg.reg.get('npc-forge-happy', {}).get('final') else '')
                      + facility(pg.pub('scene/shop.png'), pg.pub('npc/shop.png'), '已發布的道具店（對照）'))

    ok = ('qa_passed', 'approved', 'published')
    def passed(e):   # picked, passed and (unless already approved / published) measured under the current spec
        return e.get('status') in ok and e.get('final') and (e.get('status') != 'qa_passed' or not A.qa_stale(e))
    pending = [p for j in js for p in j['parts'] if p is not None and not all(passed(reg.get(a, {})) for a in G.assets_of(j, p))]
    pending_text = (f'還沒通過：{"、".join(nm.get(p, p) for p in pending)}（這些格的圖還沒過機械檢查，頁面上顯示的是目前的一版或空格）' if pending
                    else '本批全部通過機械檢查（尺寸、去背、溢色）。')
    from PIL import Image as _Im
    def inside_spill(a):   # spill-coloured pixels deeper than the outline band: what the edge-only rule lets through
        e = reg.get(a, {}); f = A._final_path(e['final']) if e.get('final') else None
        if not f or not f.is_file(): return 0
        arr = np.asarray(_Im.open(f).convert('RGBA')); return int((A.magenta_spill(arr) & ~A.near_edge(arr[..., 3])).sum())
    edge_only = {p: max(inside_spill(a) for a in G.assets_of(j, p)) for j in js if j['kind'] in ('gear-sheet', 'icon-sheet') for p in j['parts'] if p}
    edge_only = {p: n for p, n in edge_only.items() if n >= 3}
    lo, hi = (min(edge_only.values()), max(edge_only.values())) if edge_only else (0, 0)
    edge_text = (f'{"、".join(nm.get(p, p) for p in edge_only)} 只因新的「溢色只數外緣」規則才通過：主體內有 {lo if lo == hi else f"{lo}～{hi}"} '
                 f'個暗紫或暗紅的陰影像素，舊規則會把它們當成洋紅溢色。請放大看看是不是陰影。') if edge_only else ''
    def tries(j, p):
        k = reg.get(G.assets_of(j, p)[0], {}).get('chosen_attempt')
        if not k: return None
        fails = 0
        for n in range(1, int(k[1:])):
            d = G.WORK / j['id'] / 'cand' / f'a{n}'; qs = [d / f'{a}.qa.json' for a in G.assets_of(j, p)]
            if all(q.is_file() for q in qs) and not all(json.loads(q.read_text(encoding='utf-8')).get('pass') for q in qs): fails += 1
        return (fails, int(k[1:])) if fails >= 2 else None
    many = [(p, r) for j in js if j['kind'] in ('gear-sheet', 'icon-sheet') for p in j['parts'] if p and (r := tries(j, p))]
    many_text = '；'.join(f'{nm.get(p, p)}：試了 {k} 版才採用（其中 {f} 版沒過檢查）' for p, (f, k) in many)
    def picked_from(j, k):   # the parts of job j whose pick is attempt k of that job
        return [p for p in j['parts'] if p and all(reg.get(a, {}).get('chosen_attempt') == k and reg.get(a, {}).get('source_id', j['id']) == j['id']
                                                   for a in G.assets_of(j, p))]
    notes = [(j, k, v) for j in js for k, v in reg.get(j['id'], {}).get('plain_reasons', {}).items()]
    unused_text = '；'.join(f'{nm.get(next(x for x in j["parts"] if x), j["id"])}那張表的第 {k[1:]} 版：{v}' for j, k, v in notes if not picked_from(j, k))
    picked_text = '；'.join(f'{"、".join(nm.get(p, p) for p in picked_from(j, k))}：{v}（這是採用的版本）' for j, k, v in notes if picked_from(j, k))
    conf = [c for c in CONFUSABLES.get(batch, []) if all(x in gear or x in skills for x in c)]
    conf_text = ('1 倍下容易搞混，要不要重畫請你決定：' + '；'.join('／'.join(nm.get(x, x) for x in c) for c in conf)) if conf else ''
    live = lambda s: (live_text(s, reg).replace('〔未通過〕', pending_text).replace('〔只數外緣〕', edge_text).replace('〔多版〕', many_text)
                      .replace('〔採用版備註〕', picked_text).replace('〔未採用版〕', unused_text).replace('〔容易搞混〕', conf_text))
    decision_list = [tuple(d) + ([],) * (5 - len(d)) for d in DECISIONS[batch]]
    sq = starlit_question(alts, fails, plain) if batch == 'sample' else None
    if sq: decision_list.insert(2, sq)   # after the frames question, before the glow
    decisions = ''.join(
        f'<li><b>{esc(q)}</b> <span class="links">看：{"、".join(f"<a href={chr(34)}{s}{chr(34)}>{SECTION_NAME[s]}</a>" for s in links)}</span>'
        f'{"<p class=why>" + esc(live(why)) + "</p>" if why else ""}'
        f'<p class="why">已知風險：</p><ul class="risks">{"".join(f"<li>{esc(live(r))}</li>" for r in risks if live(r)) or "<li>無</li>"}</ul>'
        f'{"<p class=opts>選項：" + esc("／".join(opts)) + "</p>" if opts else ""}</li>'
        for q, links, risks, why, opts in decision_list)
    example = '、'.join(f'{i} {"A" if d[4] else "可以"}' for i, d in enumerate(decision_list, 1))
    no_names = [nm.get(x, x) for x in ('frost-staff', 'bat-earring') if x in gear] or [nm.get(x, x) for x in gear[:2]]
    no_example = f'{min(2, len(decision_list))} 不行：{"、".join(no_names)}重畫' if no_names else ''
    reply = (f'<p class="reply">直接回覆每題的選擇，例如：{esc(example)}。'
             + (f'不行的話寫出哪幾件要重畫，例如：「{esc(no_example)}」。' if no_example else '') + '</p>')
    base_new = [p for p in gear if p in G.GEAR_BASE and p not in old_bases]
    old_fact = ((f'本批只有{nm.get(with_new[0], with_new[0])}是舊底材圖示的新版' if len(with_new) == 1 else
                 f'本批有 {len(with_new)} 件是舊底材圖示的新版（{"、".join(nm.get(b, b) for b in with_new)}）') if with_new else '本批沒有舊底材圖示的新版') + (
        f'；{"、".join(nm.get(b, b) for b in base_new)}是以前沒有圖示的裝備' if base_new else '')
    decided = ''
    if batch in DECIDED:
        title, items = DECIDED[batch]
        decided = f'<div class="decided"><h3>{esc(title)}</h3><ul>{"".join(f"<li>{esc(i.replace(chr(12308) + "舊底材" + chr(12309), old_fact))}</li>" for i in items)}</ul></div>'
    after = (f'<details class="tech after"><summary>技術細節（給主控）</summary>{esc(AFTER_APPROVAL[batch])}</details>'
             if batch in AFTER_APPROVAL else '')
    rarity_css = ''.join(f'.r-{r}{{color:{c}}}' for r, c in G.RARITY_PALETTE.items())

    # Sections show only what the batch has (the skills batch has no gear, materials or forge).
    gear_sections = f'''{size_html}

<h2 id="s1">1. 裝備頁情境：背包格 28px（10×2）、人形 9 格 38px、詳情欄 64px 大圖，套上候選外框與傳說光暈</h2>
<p class="note">小圖示 26×26 以原尺寸顯示（主體長邊 22，不縮放）；外框只壓在格子最外圈，傳說光暈在外框內側、畫在圖示下層，星輝疊在外框之上。格間距照遊戲：背包 2px、人形 4px。沒有圖的格子照遊戲現況只顯示名稱前四字。3 倍版在手機上可以左右捲動。</p>
<details class="tech"><summary>技術細節</summary>外框是 16×16 九宮格（slice 5，邊帶 2px），光暈在格內第 2px（inset 0）。</details>
{eq}
<h3>{esc(rarity_title)}</h3><div class="row dark">{rarity_row or "<small>本批沒有裝備。</small>"}</div>
{frames_html}
<h3 id="glow">光暈改在格內：兩件傳說相鄰，照遊戲的背包間距 2px</h3>
<p class="note">光暈畫在圖示下層、外框內側，不再向格子外面延伸，所以兩格之間的 2px 間距保持乾淨。</p>
<details class="tech"><summary>技術細節</summary>光暈是 16×16、slice 5 的九宮格，inset 0。</details>
<div class="row dark">{glow_pair or "<small>本批沒有傳說裝備。</small>"}</div>

<h2 id="s2">2. 新舊對照：{esc(s2_title)}</h2>
<p class="note">{esc(old_note)}</p>
<div class="scroll"><table>{old_rows or "<tr><td>沒有舊底材圖示。</td></tr>"}</table></div>

<h2 id="s3">3. 大圖 64 與小圖示 26（1 倍與 3 倍），出自同一格原圖</h2>
<div class="scroll"><table><tr><th>物品</th><th>大圖 64</th><th>小圖示 26</th><th>來源</th></tr>{pairs or "<tr><td>本批沒有裝備。</td></tr>"}</table></div>

<h2 id="s4">4. 傳送門卡片情境：已取得顯示圖示，未取得顯示剪影</h2>
<p class="note">剪影在本頁由候選小圖示即時轉出（墨色 #1d1a2e、輪廓光 #8f86b8），不寫入登錄表；核准之後才由 gear_art.py silhouettes 正式產生。</p>
<div>{cards or "<p>本批沒有地區限定裝備。</p>"}</div>

<h2 id="s5">5. 清單情境：商店、鍛造、戰利品文字行</h2>
<div class="row top"><div><h3>商店清單</h3>{shop or "<small>無</small>"}</div><div><h3>鍛造清單</h3>{forge or "<small>無</small>"}</div><div><h3>戰利品</h3>{loot or "<small>無</small>"}</div></div>

''' if gear else ''
    mats_section = f'''<h2 id="s6">6. 素材：深色面板上 32／64／128px，與舊素材圖示並排</h2>
<div class="scroll"><table>{mat_new or "<tr><td>本批沒有素材。</td></tr>"}{mat_old}</table></div>

''' if mats else ''
    forge_section = f'''<h2 id="s8">8. 鍛造屋：場景 418×235 放大到 960×540，疊上多蘭半身像</h2>
<div class="row">{forge_html or "<p>本批沒有鍛造屋。</p>"}</div>

''' if forge_html else ''
    page = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>裝備美術審核</title><style>
:root{{color-scheme:dark}}
body{{margin:0;padding:16px;background:#121318;color:#e8e6df;font:14px/1.6 system-ui,"Noto Sans TC",sans-serif}}
h1{{font-size:20px}} h2{{font-size:17px;margin:32px 0 8px;border-top:1px solid #333;padding-top:12px}} h3{{font-size:15px;margin:18px 0 6px}}
.note{{color:#b9b4a6}} .px,.cell img,.rf,.rg,.rs{{image-rendering:pixelated}} figure{{margin:0;max-width:100%;min-width:0}} figcaption{{color:#b9b4a6;font-size:12px}}
.row{{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;padding:8px}} .row.top{{align-items:flex-start}} .dark{{background:#191b29}} .small,small{{font-size:12px;color:#b9b4a6}}
table{{border-collapse:collapse}} td,th{{padding:6px 10px;border-bottom:1px solid #2b2b33;vertical-align:middle;text-align:left}} td img{{margin-right:10px;vertical-align:middle}}
.screen{{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start;background:#1b1d2a;border:2px solid #3a3f66;padding:10px;max-width:100%;box-sizing:border-box}}
.scroll{{overflow-x:auto;max-width:100%}} .zoom3 .screen{{max-width:none}} details.tech{{font-size:12px;color:#8f8a7e;margin:4px 0}} .reply{{color:#9fd77f;font-weight:600}} .opts{{color:#9fc7ff;margin:4px 0}}
td,th,figcaption,.note{{overflow-wrap:anywhere}}
table.checklist{{min-width:900px}} table.checklist td,table.checklist th{{overflow-wrap:normal;word-break:normal}} table.checklist td:first-child{{white-space:nowrap}}
.bag-grid{{display:grid;grid-template-columns:repeat(10,28px);gap:2px}} .doll{{display:grid;grid-template-columns:repeat(3,38px);gap:4px;margin-top:10px}}
.cell{{position:relative;background:#262840;border:1px solid #3d4068;display:flex;align-items:center;justify-content:center;box-sizing:border-box}}
.cell .gi{{width:26px;height:26px;object-fit:none;position:relative;z-index:1}} .cell .short{{font-size:9px;line-height:1;text-align:center}}
.rf{{position:absolute;inset:0;z-index:2;pointer-events:none;border:5px solid transparent;border-image-slice:5;border-image-repeat:repeat}}
.rf.big{{border-width:10px}} .rg{{position:absolute;inset:0;z-index:0;pointer-events:none;border:5px solid transparent;border-image-slice:5;border-image-repeat:repeat}}
.rs{{position:absolute;inset:0;z-index:3;pointer-events:none;border:5px solid transparent;border-image-slice:5;border-image-repeat:repeat}}
.szrow{{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;padding:6px 8px;background:#191b29;margin-bottom:4px}} .szlab{{width:3em;color:#b9b4a6;font-size:12px;align-self:center}}
.sz figcaption{{font-size:11px;max-width:120px}} .szbox{{position:relative;background:#262840}} .sz.out .szbox{{background:#5a1f2a}} .sz.out figcaption{{color:#ff9a9a}}
.bbox{{position:absolute;box-sizing:border-box;border:1px solid #ff5a5a;pointer-events:none}} .target{{position:absolute;box-sizing:border-box;border:1px dashed #7fe6ff;pointer-events:none}}
.close img{{outline:2px solid #ff5a5a}} .bad{{color:#ff9a9a}} .sw{{display:inline-block;width:12px;height:12px;border:1px solid #000;vertical-align:middle;margin-right:4px}} .decided{{color:#b9b4a6}} .why{{margin:4px 0}}
.glow-pair{{display:grid;grid-template-columns:repeat(2,28px);gap:2px;padding:8px;background:#1b1d2a}} .glow-pair.x4{{zoom:4}}
.decide h2{{border:0;margin:4px 0 8px;padding:0}} .decide{{background:#1d2238;border:2px solid #c9a35a;padding:8px 16px 12px;margin:12px 0}} .decide>ol>li{{margin:10px 0}} .decide a{{color:#9fc7ff}} .risks{{color:#f0c27a;margin:4px 0}} .links{{font-size:12px}}
.detail{{display:flex;gap:10px;align-items:center}} .artbox{{position:relative;width:64px;height:64px;padding:10px;background:#262840}}
.artbox .rf{{inset:0}} .zoom3{{zoom:3}}
.card{{display:inline-block;vertical-align:top;margin:0 16px 16px 0;background:#1b1d2a;border:3px solid #b08a3e;padding-bottom:6px}}
.card .art{{display:block}} .card .cap{{padding:3px 8px;font-weight:600;color:#f1e3b8}} .lims{{padding:0 8px}}
.lim{{display:flex;gap:12px;align-items:center;font-size:13px}} .lim .ttl{{min-width:6em}} .li{{zoom:2;vertical-align:middle}}
.lrow{{display:flex;align-items:center;gap:6px;min-height:24px;padding:2px 8px;border-bottom:1px solid #2b2b33;width:320px;background:#1b1d2a}}
.lrow .gi,.loot .gi{{width:26px;height:26px;object-fit:none;vertical-align:middle}} .price,.tag{{margin-left:auto;color:#d9c27a;font-size:12px}}
.loot{{background:#10111a;border:2px solid #3a3f66;padding:6px 10px;max-width:100%;box-sizing:border-box}} .lrow{{max-width:100%;box-sizing:border-box}}
{rarity_css}
.fac{{position:relative;width:max-content;overflow:hidden;border:2px solid #3a3424}} .fac>img:first-child{{display:block}}
.fac .npc{{position:absolute;right:0;bottom:0;height:330px}} .missing{{background:#333;color:#999;display:flex;align-items:center;justify-content:center}}
.gal .att{{display:inline-block;vertical-align:top;margin:0 16px 16px 0;max-width:min(460px,100%);box-sizing:border-box}} .gal h4{{margin:4px 0;font-size:13px;overflow-wrap:anywhere}}
.gal .raw{{max-width:100%;max-height:300px;display:block;border:1px solid #333}} .ok{{color:#9fd77f}} .rej{{color:#e6a07a;margin:4px 0}}
.ingame{{margin:0}} .ingame img{{object-fit:contain;image-rendering:pixelated;vertical-align:middle}} .ingames{{gap:6px;align-items:center}}
.ingames .sep{{display:inline-block;width:2px;height:20px;background:#4a4f78;margin:0 6px}}
.finals{{margin:6px 0;padding-left:18px;font-size:12px;color:#b9b4a6}} .finals li{{margin:2px 0;overflow-wrap:anywhere}}
</style></head><body>
<h1>星燈迷宮 裝備美術審核・{esc(GATE_NAME.get(batch, batch))}（尚未核准、未發布）</h1>
<p class="note">本頁所有像素圖以最近鄰放大顯示。格子、外框位置、名稱與價格是頁面上的示意，不在圖片裡。這些圖要等你在這頁確認之後，才會放進遊戲。</p>
<details class="tech"><summary>技術細節</summary>登錄狀態最多到 qa_passed；核准與發布要等使用者在這頁確認（補遺 S4）。登錄表批次：{esc(lab)}。</details>

<section class="decide" id="decisions"><h2>請你決定的事</h2>{reply}<ol>{decisions}</ol>{decided}{after}</section>

<h2 id="s0">0. 本批清單（{checklist.count("data-part=")} 件）</h2>
<p class="note">手機上這張表可以在框內左右捲動。</p>
<div class="scroll"><table class="checklist"><tr><th>id</th><th>名稱</th><th>工作表</th><th>狀態</th><th>QA</th></tr>{checklist}</table></div>

{gear_sections}
{mats_section}{('<h2 id="s7">7. 技能：同角色的新技能圖示與現有技能圖示並排</h2>' + skill_html) if skills else ''}

{forge_section}<h2 id="s9">9. 全部生成版本與淘汰原因</h2>
<p class="note">原圖為 codex 輸出（已把背景校正為純洋紅）；下方為該版後處理結果與機械 QA。</p>
{gallery(pg, js)}
</body></html>'''
    (out / 'index.html').write_text(page, encoding='utf-8', newline='\n')
    # What this page showed: `approve` refuses any part whose final no longer has this hash (the user approves pictures).
    sp = G.shown_path(batch); sp.parent.mkdir(parents=True, exist_ok=True)
    record = {'batch': batch, 'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'page': str(out / 'index.html'), 'parts': shown}
    if alts: record['alternatives'] = {'ui-starlit': {k: v['sha'] for k, v in alts.items()}}   # every starlit shape the page showed
    sp.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    print(out / 'index.html')
    return out / 'index.html'


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'sample')
