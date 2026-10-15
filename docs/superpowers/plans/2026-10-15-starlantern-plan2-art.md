# 《星燈迷宮》計畫二：美術與平衡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把計畫一的色塊換成 codex 生成、經使用者核准的靜態美術，加上程式動態效果，並把數值調到 30–60 分鐘能通關。

**Architecture:** 生圖與後處理是 Python 工具（`art-factory/starlantern/tools/`），用登錄表 `registry.json` 管每張圖的狀態，只有核准的圖會發布到 `public/assets/games/starlantern/`，並寫出 `manifest.json`。遊戲端先讀 manifest，只載入已發布的圖；沒有圖的地方維持計畫一的色塊（規格第 7 節的素材載入失敗處理）。數值平衡用引擎層的模擬測試鎖住目標。

**Tech Stack:** Python 3 + numpy + Pillow + pytest（工具）、codex CLI 0.162 的 image_gen、PixiJS 8.18、TypeScript、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-14-starlantern-drpg-design.md`（第 4、5、7、8、9 節）。前一份計畫：`docs/superpowers/plans/2026-10-14-starlantern-plan1-core.md`。

## Global Constraints

- 全部用 codex 生成靜態圖（`codex_still.py`，背景用 magenta 去背），不使用 PixelLab。
- 流程：asset contract → codex 生成原圖 → 程式切圖、去背 → 機械 QA（去背殘留、半透明、尺寸、拼接）→ 使用者核准 → 發布到 `public/assets/games/starlantern/`。
- 被退件的素材不能留在 runtime 路徑。
- 不使用逐幀動畫；所有動態由程式產生：受擊閃白加震動、傷害數字、輪到誰時頭貼亮起、受傷切換表情、敵人死亡時碎裂淡出，再疊上單張特效圖。
- 「倒下」由程式把一般頭貼轉灰階，不另外畫。
- 角色必須原創，不得近似既有作品角色；以 `art-factory/starlantern/reference/` 的 lineup1、lineup2 造型為準，服裝收斂成一般冒險服。
- 圖片內不得烘焙可翻譯的介面文字。
- 素材載入失敗：顯示替代色塊並記錄到 console，遊戲仍可操作。
- SCSS 禁 `!important`、禁行內樣式。無 prettier/eslint。
- 測試：`npx vitest run`（不可用 `npm run test`）；e2e 用 `E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`（4002 被別的 worktree 佔用）；Python 工具用 `python -m pytest art-factory/starlantern/tools -q`。
- 瀏覽器一律 headless 並加 `--mute-audio`，不得操作使用者桌面。
- 不動智能合約、不 push、不 merge；commit 署名 `Co-Authored-By: Claude <noreply@anthropic.com>`。
- 大型原圖（codex 原始輸出）放 repo 外的 `C:\Users\bag57\art-refs\starlantern\raw\`，repo 只收 prompt、gen/gate 紀錄、處理後成品與登錄表。

## Review Focus

1. 只發布了部分素材（例如角色有圖、敵人沒有）時，畫面要混用圖片與色塊，不能報錯或空白。→ Task 5、7 的測試釘住「manifest 只列部分 URL」。
2. manifest 不存在、格式壞掉、或列出 base 以外的 URL：要當成「沒有素材」，不能載入任意網址。→ Task 4 的 `parseManifest` 測試。
3. 去背後殘留 magenta、半透明霧邊、主體被切到畫布邊、主體內部被挖洞。→ Task 1 的 `alpha_qa` 測試逐項覆蓋。
4. 被退件的圖已經在 runtime 路徑時，退件必須把它移走並從 manifest 拿掉。→ Task 1 的 `reject` 測試。
5. 數值：第一場戰鬥就讓全隊升級（計畫一實際觀察到）。→ Task 13 的平衡測試第一條。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `art-factory/starlantern/tools/codex_still.py`、`sprite_grid.py` | 從 `C:\Users\bag57\projects\xiantu-desktop\tools\` 原樣複製；codex 呼叫、magenta 校正、像素網格偵測 |
| `art-factory/starlantern/tools/sl_art.py` | 本專案後處理：去背、alpha QA、縮回像素尺寸、格狀切圖、拼接分數、登錄表、核准／退件／發布、manifest |
| `art-factory/starlantern/tools/test_sl_art.py` | pytest |
| `art-factory/starlantern/contract.md` | asset contract：每類素材的尺寸、去背規格、prompt 範本、runtime 路徑 |
| `art-factory/starlantern/registry.json` | 每個素材 id 的狀態與路徑（單一事實來源） |
| `art-factory/starlantern/prompts/*.txt` | 每張圖的 prompt |
| `art-factory/starlantern/work/<id>/` | gen.json、gate.json、qa.json、處理後成品（原圖在 repo 外） |
| `src/scripts/games/starlantern/render/artPaths.ts` | 純函式：URL 規則、tile/特效/表情對應、manifest 解析 |
| `src/scripts/games/starlantern/render/textures.ts` | `TextureBank`：依 manifest 預載、失敗回 null |
| `src/scripts/games/starlantern/ui/art.ts` | DOM 用的頭貼、立繪、圖示 `<img>` |
| `src/scripts/games/starlantern/engine/sim.ts` | 平衡模擬（只給測試用） |
| `public/assets/games/starlantern/**` | 已發布素材與 `manifest.json` |

素材 id 與 runtime 路徑（`artPaths.ts` 與 `registry.json` 必須一致，Task 4 有測試）：

| 類別 | id | runtime 路徑（相對 `public`） | 去背 | 像素尺寸（美術像素） |
|---|---|---|---|---|
| 立繪 | `char-<cid>-standee` | `/assets/games/starlantern/char/<cid>-standee.png` | 透明 | 高 88–120 |
| 頭貼 | `char-<cid>-portrait`、`char-<cid>-portrait-hurt` | `/assets/games/starlantern/char/<cid>-portrait.png`、`-portrait-hurt.png` | 透明 | 48×48 方框內 |
| 地圖隊伍 | `map-party-<dir>` | `/assets/games/starlantern/map/party-<dir>.png` | 透明 | 高 20–28 |
| 圖塊 | `tile-f<n>-<tile>` | `/assets/games/starlantern/tiles/f<n>-<tile>.png` | 不透明 | 32×32 |
| 戰鬥背景 | `bg-f<n>` | `/assets/games/starlantern/bg/f<n>.png` | 不透明 | 寬 320–480，16:9 |
| 敵人 | `enemy-<eid>` | `/assets/games/starlantern/enemy/<eid>.png` | 透明 | 高 48–112；頭目 120–200 |
| 圖示 | `icon-<id>` | `/assets/games/starlantern/icon/<id>.png` | 透明 | 24×24 方框內 |
| 特效 | `fx-<key>` | `/assets/games/starlantern/fx/<key>.png` | 透明 | 高 32–96 |
| 介面框 | `ui-frame` | `/assets/games/starlantern/ui/frame.png` | 不透明 | 48×48，角 16 |

- `<cid>`：noel、chizuru、liz、sylvie、scarlet、selene、safira、bobby。
- `<eid>`：slime、bat、wolf、beetle、wisp、lizard、golem、shade、lanterneater。
- `<tile>`：wall、floor、door、up、down、chest、chest-open、entrance、boss（每層 9 張，從一張 3×3 圖塊表切出）。
- `<key>`：slash、pierce、strike、fire、ice、thunder、heal、buff。
- 圖示 id = 技能 27 + 道具 5 + 裝備 15 + 素材 10 = 57 個，分 3 張 5×4 圖示表：表 1 技能前 20 個；表 2 技能後 7 個＋道具 5 個＋素材前 8 個；表 3 素材後 2 個＋裝備 15 個（共 17 格，剩 3 格留空）。順序依 `data/skills.ts`、`data/items.ts`、`data/materials.ts`、`data/equipment.ts` 的宣告順序。

---

### Task 1: 美術後處理工具與登錄表

**Files:**
- Create: `art-factory/starlantern/tools/codex_still.py`、`art-factory/starlantern/tools/sprite_grid.py`（複製）
- Create: `art-factory/starlantern/tools/sl_art.py`
- Test: `art-factory/starlantern/tools/test_sl_art.py`

**Interfaces:**
- Produces（Python）：`cutout(img) -> Image(RGBA)`、`alpha_qa(rgba, allow_holes=0) -> dict`、`to_art_pixels(rgba, block) -> Image`、`slice_grid(img, cols, rows) -> list[Image]`、`seam_score(rgb) -> float`、`Registry(path)`（`.set(id, **fields)`、`.get(id)`、`.approve(id)`、`.reject(id, reason, public_root)`、`.publish(id, public_root)`、`.write_manifest(public_root)`）。
- CLI：`python art-factory/starlantern/tools/sl_art.py process --id ID --raw RAW --kind sprite|opaque|tile-sheet|icon-sheet [--ids a,b,c] [--cols N --rows N]`、`approve --id ID`、`reject --id ID --reason TEXT`、`publish --approved`、`status`。

- [ ] **Step 1: 複製工具**

```bash
mkdir -p art-factory/starlantern/tools
cp /c/Users/bag57/projects/xiantu-desktop/tools/codex_still.py /c/Users/bag57/projects/xiantu-desktop/tools/sprite_grid.py art-factory/starlantern/tools/
python art-factory/starlantern/tools/codex_still.py generate --help
```
Expected: 印出 `usage: codex_still generate ...`。

- [ ] **Step 2: 寫失敗測試**

`art-factory/starlantern/tools/test_sl_art.py`：

```python
import json
from pathlib import Path
import numpy as np
import pytest
from PIL import Image
import sl_art as A

M = (255, 0, 255)


def canvas(w, h, color=M):
    return Image.new('RGB', (w, h), color)


def blob(w=40, h=40, box=(10, 10, 30, 30), color=(40, 120, 200)):
    img = canvas(w, h); arr = np.asarray(img).copy()
    x0, y0, x1, y1 = box; arr[y0:y1, x0:x1] = color
    return Image.fromarray(arr, 'RGB')


def test_cutout_makes_magenta_transparent_and_keeps_subject_opaque():
    out = A.cutout(blob())
    a = np.asarray(out)[..., 3]
    assert a[0, 0] == 0 and a[20, 20] == 255
    assert A.alpha_qa(out)['pass']


def test_cutout_removes_near_magenta_fringe():
    arr = np.asarray(blob()).copy(); arr[9, 10:30] = (235, 20, 230)
    out = A.cutout(Image.fromarray(arr, 'RGB'))
    assert np.asarray(out)[9, 15, 3] == 0


def test_alpha_qa_flags_residue_semi_alpha_edge_and_holes():
    rgba = np.zeros((40, 40, 4), np.uint8)
    rgba[10:30, 10:30] = (40, 120, 200, 255)
    rgba[12, 12] = (250, 10, 250, 255)          # magenta residue
    rgba[13, 13, 3] = 128                       # semi alpha
    rgba[0, 20] = (40, 120, 200, 255)           # touches edge
    rgba[20, 20, 3] = 0                         # enclosed hole
    r = A.alpha_qa(Image.fromarray(rgba, 'RGBA'))
    assert not r['pass']
    assert r['residue'] == 1 and r['semi'] == 1 and r['edge'] >= 1 and r['holes'] == 1


def test_alpha_qa_allows_declared_holes():
    rgba = np.zeros((40, 40, 4), np.uint8); rgba[10:30, 10:30] = (9, 9, 9, 255); rgba[20, 20, 3] = 0
    assert A.alpha_qa(Image.fromarray(rgba, 'RGBA'), allow_holes=1)['pass']


def test_to_art_pixels_samples_block_centres():
    big = Image.new('RGBA', (8, 4), (0, 0, 0, 0)); arr = np.asarray(big).copy()
    arr[:, :4] = (255, 0, 0, 255); arr[:, 4:] = (0, 0, 255, 255)
    small = A.to_art_pixels(Image.fromarray(arr, 'RGBA'), 4)
    assert small.size == (2, 1)
    assert tuple(np.asarray(small)[0, 0]) == (255, 0, 0, 255)


def test_slice_grid_splits_on_magenta_gutters():
    img = canvas(70, 46); arr = np.asarray(img).copy()
    for cx in (2, 36):
        for cy in (2, 24):
            arr[cy:cy + 20, cx:cx + 32] = (10, 200, 10)
    cells = A.slice_grid(Image.fromarray(arr, 'RGB'), 2, 2)
    assert len(cells) == 4 and all(c.size == (32, 20) for c in cells)


def test_slice_grid_rejects_wrong_count():
    with pytest.raises(ValueError):
        A.slice_grid(blob(), 2, 2)


def test_seam_score_zero_for_wrapping_tile_and_high_for_hard_edge():
    flat = Image.new('RGB', (8, 8), (90, 90, 90))
    assert A.seam_score(flat) == 0
    arr = np.zeros((8, 8, 3), np.uint8); arr[:, 4:] = 255
    assert A.seam_score(Image.fromarray(arr, 'RGB')) > 100


def test_registry_publish_requires_approval_and_writes_manifest(tmp_path):
    reg = A.Registry(tmp_path / 'registry.json')
    final = tmp_path / 'final.png'; Image.new('RGBA', (4, 4), (1, 2, 3, 255)).save(final)
    reg.set('enemy-slime', kind='sprite', status='qa_passed', final=str(final), runtime='/assets/games/starlantern/enemy/slime.png')
    public = tmp_path / 'public'
    with pytest.raises(PermissionError):
        reg.publish('enemy-slime', public)
    reg.approve('enemy-slime'); reg.publish('enemy-slime', public)
    assert (public / 'assets/games/starlantern/enemy/slime.png').exists()
    reg.write_manifest(public)
    manifest = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))
    assert manifest == {'version': 1, 'urls': ['/assets/games/starlantern/enemy/slime.png']}
    assert A.Registry(tmp_path / 'registry.json').get('enemy-slime')['status'] == 'published'


def test_approve_refuses_assets_that_failed_qa(tmp_path):
    reg = A.Registry(tmp_path / 'r.json'); reg.set('x', status='qa_failed')
    with pytest.raises(PermissionError):
        reg.approve('x')


def test_reject_removes_runtime_file_and_manifest_entry(tmp_path):
    reg = A.Registry(tmp_path / 'r.json'); public = tmp_path / 'public'
    final = tmp_path / 'f.png'; Image.new('RGBA', (2, 2)).save(final)
    reg.set('bg-f1', status='qa_passed', final=str(final), runtime='/assets/games/starlantern/bg/f1.png')
    reg.approve('bg-f1'); reg.publish('bg-f1', public); reg.write_manifest(public)
    reg.reject('bg-f1', 'palette clash', public)
    assert not (public / 'assets/games/starlantern/bg/f1.png').exists()
    manifest = json.loads((public / 'assets/games/starlantern/manifest.json').read_text(encoding='utf-8'))
    assert manifest['urls'] == []
    assert reg.get('bg-f1')['status'] == 'rejected' and reg.get('bg-f1')['reason'] == 'palette clash'


def test_runtime_path_must_stay_under_starlantern_base(tmp_path):
    reg = A.Registry(tmp_path / 'r.json')
    with pytest.raises(ValueError):
        reg.set('evil', runtime='/assets/games/other/x.png')
```

- [ ] **Step 3: 確認測試失敗**

Run: `cd art-factory/starlantern/tools && python -m pytest -q`
Expected: FAIL，`ModuleNotFoundError: No module named 'sl_art'`。

- [ ] **Step 4: 實作 `sl_art.py`**

```python
"""Starlantern art postprocess: cutout, alpha QA, art-pixel downscale, grid slicing, seam score, registry/publish."""
from pathlib import Path
import argparse, json, shutil, sys
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprite_grid as G  # noqa: E402

BASE = '/assets/games/starlantern/'
MAGENTA = np.array([255, 0, 255], np.int16)
ROOT = Path(__file__).resolve().parents[1]


def _near_magenta(rgb, margin):
    d = np.abs(rgb.astype(np.int16) - MAGENTA).max(axis=-1)
    return d <= margin


def cutout(img, margin=70):
    """Magenta (and near-magenta fringe) -> alpha 0; everything else alpha 255. No semi-alpha is produced."""
    rgb = np.asarray(img.convert('RGB'))
    alpha = np.where(_near_magenta(rgb, margin), 0, 255).astype(np.uint8)
    out = np.dstack([rgb, alpha]); out[alpha == 0, :3] = 0
    return Image.fromarray(out, 'RGBA')


def _enclosed_transparent(alpha):
    """Transparent pixels not reachable from the border through transparent pixels."""
    h, w = alpha.shape; clear = alpha == 0; seen = np.zeros_like(clear)
    stack = [(y, x) for y in range(h) for x in (0, w - 1) if clear[y, x]] + [(y, x) for x in range(w) for y in (0, h - 1) if clear[y, x]]
    while stack:
        y, x = stack.pop()
        if seen[y, x]: continue
        seen[y, x] = True
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and clear[ny, nx] and not seen[ny, nx]: stack.append((ny, nx))
    return int((clear & ~seen).sum())


def alpha_qa(img, allow_holes=0):
    arr = np.asarray(img.convert('RGBA')); a = arr[..., 3]
    opaque = a == 255
    residue = int((opaque & _near_magenta(arr[..., :3], 90)).sum())
    semi = int(((a > 0) & (a < 255)).sum())
    border = np.zeros_like(opaque); border[0, :] = border[-1, :] = True; border[:, 0] = border[:, -1] = True
    edge = int((opaque & border).sum())
    holes = _enclosed_transparent(a)
    reasons = [r for r, bad in (('magenta residue', residue), ('semi alpha', semi), ('touches edge', edge),
                                ('enclosed holes', holes > allow_holes)) if bad]
    return {'pass': not reasons, 'reasons': reasons, 'residue': residue, 'semi': semi, 'edge': edge, 'holes': holes}


def to_art_pixels(img, block):
    """Nearest-sample the centre of each block x block cell."""
    arr = np.asarray(img); h, w = arr.shape[:2]; b = float(block)
    ys = np.minimum((np.arange(int(round(h / b))) * b + b / 2).astype(int), h - 1)
    xs = np.minimum((np.arange(int(round(w / b))) * b + b / 2).astype(int), w - 1)
    return Image.fromarray(arr[ys][:, xs], img.mode)


def _runs(active):
    edges = np.flatnonzero(np.diff(np.r_[False, active, False]))
    return [(int(a), int(b)) for a, b in edges.reshape(-1, 2)]


def slice_grid(img, cols, rows):
    """Cells separated by full-magenta gutters, row-major. Raises ValueError when the count differs."""
    rgb = np.asarray(img.convert('RGB')); fg = ~_near_magenta(rgb, 45)
    xs, ys = _runs(fg.any(axis=0)), _runs(fg.any(axis=1))
    if len(xs) != cols or len(ys) != rows:
        raise ValueError(f'expected {cols}x{rows} cells, found {len(xs)}x{len(ys)}')
    return [img.crop((x0, y0, x1, y1)) for y0, y1 in ys for x0, x1 in xs]


def seam_score(img):
    """Mean absolute difference between opposite edges (0 = wraps perfectly)."""
    a = np.asarray(img.convert('RGB'), np.int16)
    return float((np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()) / 2)


class Registry:
    def __init__(self, path):
        self.path = Path(path)
        self.data = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {'assets': {}}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    def get(self, aid):
        return self.data['assets'][aid]

    def set(self, aid, **fields):
        if 'runtime' in fields and not str(fields['runtime']).startswith(BASE):
            raise ValueError(f'runtime path must start with {BASE}')
        self.data['assets'].setdefault(aid, {}).update(fields); self._save()

    def approve(self, aid):
        if self.get(aid).get('status') not in ('qa_passed', 'published'):
            raise PermissionError(f'{aid} has not passed QA')
        self.set(aid, status='approved')

    def _target(self, aid, public_root):
        return Path(public_root) / self.get(aid)['runtime'].lstrip('/')

    def publish(self, aid, public_root):
        if self.get(aid).get('status') != 'approved':
            raise PermissionError(f'{aid} is not approved')
        dst = self._target(aid, public_root); dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self.get(aid)['final'], dst); self.set(aid, status='published')

    def reject(self, aid, reason, public_root):
        if self.get(aid).get('runtime'):
            dst = self._target(aid, public_root)
            if dst.exists(): dst.unlink()
        self.set(aid, status='rejected', reason=reason)
        self.write_manifest(public_root)

    def write_manifest(self, public_root):
        urls = sorted(a['runtime'] for a in self.data['assets'].values() if a.get('status') == 'published')
        out = Path(public_root) / BASE.strip('/') / 'manifest.json'; out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({'version': 1, 'urls': urls}, indent=2) + '\n', encoding='utf-8')


def process(reg, aid, raw, kind, ids=None, cols=None, rows=None, workdir=None):
    """Postprocess one raw codex PNG into final file(s) under art-factory/starlantern/work/<aid>/ and record QA."""
    workdir = Path(workdir or ROOT / 'work' / aid); workdir.mkdir(parents=True, exist_ok=True)
    img = Image.open(raw).convert('RGB')
    if kind in ('tile-sheet', 'icon-sheet'):
        cells = slice_grid(img, cols, rows)
        targets = ids or []
        results = {}
        for cell, cid in zip(cells, targets):
            results[cid] = _finish(reg, cid, cell, 'opaque' if kind == 'tile-sheet' else 'sprite', workdir, raw)
        reg.set(aid, status='processed', raw=str(raw), parts=targets)
        return results
    return {aid: _finish(reg, aid, img, kind, workdir, raw)}


def _finish(reg, aid, img, kind, workdir, raw):
    probe = img if kind == 'opaque' else img.crop(cutout(img).getbbox() or (0, 0, img.width, img.height))
    info = G.detect_grid(np.asarray(probe, np.int16), 3.0, max(24.0, probe.height / 8))
    block = max(1, round((info['block_x'] + info['block_y']) / 2))
    if kind == 'opaque':
        final = to_art_pixels(img.convert('RGBA'), block)
        qa = {'pass': True, 'reasons': [], 'seam': seam_score(final)}
    else:
        cut = cutout(img)
        bbox = cut.getbbox()
        if bbox is None:
            final, qa = cut, {'pass': False, 'reasons': ['no foreground']}
        else:
            subject = cut.crop(bbox)
            pad = Image.new('RGBA', (subject.width + 2 * block, subject.height + 2 * block))
            pad.paste(subject, (block, block))
            final = to_art_pixels(pad, block)
            qa = alpha_qa(final, reg.data['assets'].get(aid, {}).get('allow_holes', 0))
    qa.update(block=block, size=list(final.size))
    out = Path(workdir) / f'{aid}.png'; final.save(out)
    (Path(workdir) / f'{aid}.qa.json').write_text(json.dumps(qa, indent=2), encoding='utf-8')
    repo = ROOT.parents[1]
    final_path = out.relative_to(repo).as_posix() if out.is_relative_to(repo) else str(out)
    reg.set(aid, final=final_path, raw=str(raw), qa=qa, status='qa_passed' if qa['pass'] else 'qa_failed')
    return qa


def main(argv=None):
    ap = argparse.ArgumentParser(prog='sl_art'); sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('process'); p.add_argument('--id', required=True); p.add_argument('--raw', required=True, type=Path)
    p.add_argument('--kind', required=True, choices=['sprite', 'opaque', 'tile-sheet', 'icon-sheet'])
    p.add_argument('--ids'); p.add_argument('--cols', type=int); p.add_argument('--rows', type=int)
    a = sub.add_parser('approve'); a.add_argument('--id', required=True)
    r = sub.add_parser('reject'); r.add_argument('--id', required=True); r.add_argument('--reason', required=True)
    pub = sub.add_parser('publish'); pub.add_argument('--approved', action='store_true', required=True)
    sub.add_parser('status')
    args = ap.parse_args(argv)
    reg = Registry(ROOT / 'registry.json'); public = ROOT.parents[1] / 'public'
    if args.cmd == 'process':
        out = process(reg, args.id, args.raw, args.kind, args.ids.split(',') if args.ids else None, args.cols, args.rows)
        print(json.dumps(out, ensure_ascii=False)); return 0 if all(q['pass'] for q in out.values()) else 1
    if args.cmd == 'approve': reg.approve(args.id)
    if args.cmd == 'reject': reg.reject(args.id, args.reason, public)
    if args.cmd == 'publish':
        for aid, a in reg.data['assets'].items():
            if a.get('status') == 'approved': reg.publish(aid, public)
        reg.write_manifest(public)
    if args.cmd == 'status':
        counts = {}
        for a in reg.data['assets'].values(): counts[a.get('status', 'todo')] = counts.get(a.get('status', 'todo'), 0) + 1
        print(json.dumps(counts, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

註：`process`／`_finish` 沒有單元測試（像素網格偵測要用真的 codex 輸出才有意義），由 Task 3 的實際樣張當整合驗證：Task 3 Step 3 的尺寸檢查不符時，先查 `block` 是否偵測錯，再查 prompt。`final` 存成相對 repo 根目錄的路徑，`publish` 在 repo 根目錄執行。

- [ ] **Step 5: 確認通過**

Run: `cd art-factory/starlantern/tools && python -m pytest -q`
Expected: `12 passed`。

- [ ] **Step 6: Commit**

```bash
git add art-factory/starlantern/tools
git commit -m "feat(starlantern): art postprocess tools and registry

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Asset contract、登錄表初始內容、參考圖裁切

**Files:**
- Create: `art-factory/starlantern/contract.md`
- Create: `art-factory/starlantern/registry.json`
- Create: `art-factory/starlantern/tools/seed_registry.py`
- Create: `art-factory/starlantern/reference/crops/<cid>.png`（8 張）
- Modify: `art-factory/starlantern/README.md`
- Test: `art-factory/starlantern/tools/test_sl_art.py`（加一個測試）

**Interfaces:**
- Produces：`registry.json` 內 133 個 runtime 素材 id（立繪 8＋頭貼 16＋地圖 4＋圖塊 27＋背景 3＋敵人 9＋特效 8＋框 1＋圖示 57），另有 6 個不發布的 sheet id（3 張圖塊表、3 張圖示表），每個都有 `kind`、`runtime`（sheet 除外）、`status: "todo"`。Task 4 的 vitest 會讀這個檔比對 `artPaths.ts`。

- [ ] **Step 1: 寫失敗測試**（加在 `test_sl_art.py` 末尾）

```python
def test_seeded_registry_covers_every_runtime_asset():
    import seed_registry
    reg = seed_registry.build()
    assets = reg['assets']
    runtime = [a['runtime'] for a in assets.values() if 'runtime' in a]
    assert len(runtime) == 133 and len(set(runtime)) == 133
    assert all(r.startswith(A.BASE) for r in runtime)
    assert assets['char-scarlet-portrait-hurt']['runtime'] == '/assets/games/starlantern/char/scarlet-portrait-hurt.png'
    assert assets['tile-f2-chest-open']['runtime'] == '/assets/games/starlantern/tiles/f2-chest-open.png'
    assert assets['sheet-icons-1']['parts'][0] == 'icon-fire-star'
    assert len(assets['sheet-icons-3']['parts']) == 17
```

Run: `cd art-factory/starlantern/tools && python -m pytest -q -k seeded`
Expected: FAIL，`No module named 'seed_registry'`。

- [ ] **Step 2: 實作 `seed_registry.py`**

id 清單直接從 TS 資料檔用正規式讀出，避免手抄：

```python
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


def ids_in(file, pattern=r"\bid: '([a-z0-9-]+)'"):
    return re.findall(pattern, (DATA / file).read_text(encoding='utf-8'))


def build():
    a = {}
    def put(aid, kind, runtime=None, **extra):
        a[aid] = {'kind': kind, 'status': 'todo', **({'runtime': BASE + runtime} if runtime else {}), **extra}
    for c in CHARS:
        put(f'char-{c}-standee', 'sprite', f'char/{c}-standee.png')
        put(f'char-{c}-portrait', 'sprite', f'char/{c}-portrait.png')
        put(f'char-{c}-portrait-hurt', 'sprite', f'char/{c}-portrait-hurt.png')
    for d in DIRS: put(f'map-party-{d}', 'sprite', f'map/party-{d}.png')
    for n in (1, 2, 3):
        put(f'sheet-tiles-f{n}', 'tile-sheet', parts=[f'tile-f{n}-{t}' for t in TILES], cols=3, rows=3)
        for t in TILES: put(f'tile-f{n}-{t}', 'opaque', f'tiles/f{n}-{t}.png')
        put(f'bg-f{n}', 'opaque', f'bg/f{n}.png')
    for e in ids_in('enemies.ts'): put(f'enemy-{e}', 'sprite', f'enemy/{e}.png')
    for k in FX: put(f'fx-{k}', 'sprite', f'fx/{k}.png')
    put('ui-frame', 'opaque', 'ui/frame.png')
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
```

資料檔的寫法是 `const LIST = [{ id: 'fire-star', ... }]`，所以 `ids_in` 依宣告順序取得 id；`enemies.ts` 的掉落物欄位是 `mat:`、不是 `id:`，不會混進來。先確認：`python -c "import sys; sys.path.insert(0,'art-factory/starlantern/tools'); import seed_registry as s; print([len(s.ids_in(f)) for f in ('skills.ts','items.ts','materials.ts','equipment.ts','enemies.ts')])"` 應印出 `[27, 5, 10, 15, 9]`。`sheet-icons-3` 只有 17 格：圖示表生成時最後 3 格留空，`slice_grid` 用 `cols=5, rows=4` 會因少格而報錯，所以第 3 張用 `--cols 5 --rows 4` 時要求 codex 在空格放「空白小石板」佔位，切出後只取前 17 格（`process` 的 `zip` 自然丟掉多出的格子）。

Run: `python art-factory/starlantern/tools/seed_registry.py && cd art-factory/starlantern/tools && python -m pytest -q`
Expected: `13 passed`，並產生 `registry.json`。

- [ ] **Step 3: 裁切 8 位角色參考圖**

用 Read 工具看 `art-factory/starlantern/reference/lineup1.png`、`lineup2.png`，依規格第 3 節的定位（魔女、巫女槍兵、尋寶獵人、遊俠、火焰騎士、月之法師、沙漠舞劍士、技師）認出每一位，把外接框寫進 `contract.md` 的「參考圖對照」表，再用以下指令裁出：

```bash
python - <<'EOF'
from PIL import Image
from pathlib import Path
REF = Path('art-factory/starlantern/reference'); out = REF / 'crops'; out.mkdir(exist_ok=True)
BOXES = {  # cid: (file, x0, y0, x1, y1)  ← 依實際看到的位置填寫，八筆都要有
}
assert len(BOXES) == 8, 'fill all eight boxes from the lineup images first'
for cid, (f, *box) in BOXES.items():
    Image.open(REF / f).crop(tuple(box)).save(out / f'{cid}.png')
EOF
```

Expected: `reference/crops/` 有 8 張 PNG。若 lineup 無法辨認某位角色，停下來把 lineup 圖放到可開的網址問使用者，不要猜。

- [ ] **Step 4: 寫 `contract.md`**

內容固定為以下段落（數值照抄本計畫的「素材 id 與 runtime 路徑」表）：

```markdown
# 星燈迷宮 asset contract

## 共通
- 生成：`python art-factory/starlantern/tools/codex_still.py generate --workdir C:/Users/bag57/art-refs/starlantern/raw/<id> --name <id>-a<N>.png --prompt-file art-factory/starlantern/prompts/<id>.txt [--image ...]`；每次重試換新檔名（a1、a2…），每個 id 最多 3 次，超過就回報。
- 後處理：`python art-factory/starlantern/tools/sl_art.py process --id <id> --raw <raw> --kind <kind> [...]`。
- 風格：16-bit 日式 RPG 像素畫、粗輪廓 1 px 深色線、有限色盤（每張 ≤ 32 色）、無抗鋸齒、無文字、無浮水印。
- 背景：透明素材一律畫在純 #FF00FF 上，主體四周至少留 8% 空白；不透明素材滿版。
- 原創：不得模仿既有作品角色、標誌、商標；prompt 裡不寫任何作品名或畫師名。
- 原圖保存在 `C:\Users\bag57\art-refs\starlantern\raw\<id>\`；repo 內保存 prompt、gen.json、gate.json、qa.json 與成品。

## 各類規格
（貼上本計畫「素材 id 與 runtime 路徑」表，並補上下列 prompt 範本）

## Prompt 範本
- 立繪：`Full-body pixel art character sprite of <角色描述>, standing three-quarter view, <服裝>, plain adventurer outfit, 16-bit JRPG style, crisp 1px dark outline, limited palette, centred on a flat pure magenta #FF00FF background, no text, no shadow on the ground.` 附 `--image reference/crops/<cid>.png`。
- 頭貼：`Square bust portrait in pixel art of the same character as the reference, <表情>, facing slightly left, 16-bit JRPG style, flat pure magenta #FF00FF background, no frame, no text.` 附該角色已核准立繪；受傷版附一般頭貼，表情寫 `wincing in pain, a small scratch on the cheek, hair slightly messy`。
- 圖塊表：`A 3 by 3 grid of nine square top-down pixel art dungeon tiles for <地形>, separated by thick flat pure magenta #FF00FF gutters. Row 1: stone wall, walkable floor, wooden door. Row 2: stairs going up, stairs going down, closed treasure chest on floor. Row 3: opened empty treasure chest on floor, glowing entrance circle on floor, ominous sealed boss gate. Floor and wall tiles must tile seamlessly. Each tile fills its square edge to edge. No text.`
- 戰鬥背景：`Wide 16:9 pixel art battle backdrop of <地形>, first-person view down a corridor, empty foreground for monsters, 16-bit JRPG style, no characters, no text.`
- 敵人：`Pixel art monster sprite of <敵人描述>, facing the viewer, full body, 16-bit JRPG battle sprite, crisp 1px dark outline, flat pure magenta #FF00FF background, no text.`
- 圖示表：`A 5 by 4 grid of twenty small pixel art RPG icons separated by thick flat pure magenta #FF00FF gutters, each icon on magenta, in this order left to right, top to bottom: <清單>. No text.`
- 特效：`Single pixel art battle effect of <效果>, bold shapes, no soft glow gradients, flat pure magenta #FF00FF background, no text.`
- 介面框：`A 48 by 48 pixel art UI panel frame, dark navy fill, ornate brass border 16 pixels wide with star-lantern motif corners, edges designed to repeat, fills the canvas edge to edge, no text.`

## 地形與敵人描述
- f1 林間遺跡：mossy forest ruins, green and grey stone, roots, soft daylight.
- f2 水晶洞窟：dark blue crystal cave, glowing cyan crystals, wet rock.
- f3 星燈神殿：ancient star temple, deep violet stone, gold trim, floating lantern lights.
- slime 苔蘚史萊姆：a round green moss slime with tiny leaves on top.（其餘 8 隻依 `data/enemies.ts` 的名稱寫一句外觀，寫在這裡）

## 參考圖對照
| cid | 檔案 | 外接框 | 外觀要點（髮色、武器、配色） |
|---|---|---|---|
（Step 3 填寫）

## 審核狀態
以 `registry.json` 為準；`python art-factory/starlantern/tools/sl_art.py status` 印出各狀態數量。
```

`README.md` 加一行：「asset contract 見 `contract.md`；登錄表見 `registry.json`。」

- [ ] **Step 5: Commit**

```bash
git add art-factory/starlantern
git commit -m "docs(starlantern): asset contract, seeded registry, reference crops

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 風格樣張（使用者核准關卡）

**Files:**
- Create: `art-factory/starlantern/prompts/{char-scarlet-standee,char-scarlet-portrait,char-scarlet-portrait-hurt,enemy-slime,sheet-tiles-f1,bg-f1}.txt`
- Create: `art-factory/starlantern/work/...`（工具產出）
- Modify: `art-factory/starlantern/registry.json`
- Create（scratchpad，不入庫）：`review-1.html`

**Interfaces:**
- Consumes：Task 1 工具、Task 2 contract 與登錄表。
- Produces：6 個 id 的 `qa_passed` 成品＋一份給使用者看的審核頁。

- [ ] **Step 1: 寫 6 份 prompt**，依 contract 範本填入。絲嘉蕾＝火焰騎士，前排，紅髮或依參考圖；史萊姆、林間遺跡依 contract 描述。

- [ ] **Step 2: 生成**（依序執行，每張一次 codex 呼叫；頭貼要等立繪 QA 通過後才生成，因為要拿立繪當參考）

```bash
RAW=/c/Users/bag57/art-refs/starlantern/raw
T=art-factory/starlantern/tools
python $T/codex_still.py generate --workdir $RAW/char-scarlet-standee --name char-scarlet-standee-a1.png --prompt-file art-factory/starlantern/prompts/char-scarlet-standee.txt --image art-factory/starlantern/reference/crops/scarlet.png
python $T/sl_art.py process --id char-scarlet-standee --raw $RAW/char-scarlet-standee/char-scarlet-standee-a1.png --kind sprite
```

其餘 5 張同樣兩行（圖塊表用 `--kind tile-sheet --cols 3 --rows 3 --ids tile-f1-wall,tile-f1-floor,tile-f1-door,tile-f1-up,tile-f1-down,tile-f1-chest,tile-f1-chest-open,tile-f1-entrance,tile-f1-boss`；背景用 `--kind opaque`）。
Expected：每次 `process` 印出 `"pass": true`；失敗時看 `reasons`，改 prompt 換新檔名重試，最多 3 次。

- [ ] **Step 3: 尺寸與拼接檢查**

```bash
python - <<'EOF'
import json; r = json.load(open('art-factory/starlantern/registry.json', encoding='utf-8'))['assets']
for k in ['char-scarlet-standee','char-scarlet-portrait','char-scarlet-portrait-hurt','enemy-slime','bg-f1','tile-f1-floor','tile-f1-wall']:
    q = r[k].get('qa', {}); print(k, r[k]['status'], q.get('size'), q.get('seam'))
EOF
```

Expected：立繪高 88–120、頭貼兩邊 ≤ 48、史萊姆高 48–112、圖塊 32×32、地板與牆 `seam` ≤ 24、背景寬 320–480。不符就把 `status` 設回 `qa_failed`（`python -c` 呼叫 `Registry.set`），改 prompt 重生。

- [ ] **Step 4: 做審核頁並給使用者看**

在 scratchpad 寫 `review-1.html`：每張成品以 `image-rendering: pixelated` 放大 4 倍顯示在深色底，旁邊列 id、尺寸、QA 結果；另放一格「實際遊戲比例」的拼接預覽（用林間遺跡的 9 張圖塊照 `data/floors.ts` 第 1 層前 6 列排出），讓使用者看到地圖整體感。用 headless 瀏覽器（`--mute-audio`）截圖確認頁面正常後，用 Artifact 工具發布（icon 用 `image`），把連結給使用者。

- [ ] **Step 5: 停下來等使用者核准風格**

這是規格第 9 節第 4 點要求的關卡。訊息要問：整體風格、角色、敵人、圖塊各自是否可以；不可以的請說要改哪裡。
- 核准：對每個核准的 id 跑 `python $T/sl_art.py approve --id <id>`。
- 要求修改：依意見改 contract 的風格段落與 prompt，重生、重做審核頁，再問一次。
- Task 4–8 是程式工作，不依賴核准結果，等待期間可以先做；Task 9 起的量產一定要等核准。

- [ ] **Step 6: Commit**（prompt、work 紀錄、registry）

```bash
git add art-factory/starlantern
git commit -m "art(starlantern): style samples for approval

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 素材路徑規則與 manifest 解析

**Files:**
- Create: `src/scripts/games/starlantern/render/artPaths.ts`
- Test: `src/scripts/games/starlantern/render/artPaths.test.ts`

**Interfaces:**
- Consumes：`Tile`、`Dir`（`engine/map.ts`）、`BattleEvent`（`engine/combatant.ts`）、`CHARACTER_IDS`、`ENEMIES`、`SKILLS`、`ITEMS`、`EQUIPMENT`、`MATERIALS`。
- Produces：
  - `ART_BASE = '/assets/games/starlantern'`、`MANIFEST_URL`
  - `type TileKey = Tile | 'chest-open'`、`type FxKey = 'slash'|'pierce'|'strike'|'fire'|'ice'|'thunder'|'heal'|'buff'`、`type Mood = 'normal'|'hurt'`
  - `art = { tile(floor, key), party(dir), bg(floor), enemy(id), fx(key), portrait(cid, mood), standee(cid), icon(id), frame }`
  - `tileKey(t: Tile, opened: boolean): TileKey`
  - `moodFor(hp: number, max: number): Mood`
  - `effectFor(ev: BattleEvent, actorDefId: string | null): FxKey | null`
  - `allArtUrls(): string[]`
  - `parseManifest(json: unknown): Set<string>`

- [ ] **Step 1: 寫失敗測試**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { ART_BASE, allArtUrls, art, effectFor, moodFor, parseManifest, tileKey } from './artPaths';

describe('artPaths', () => {
  it('builds urls under the starlantern base', () => {
    expect(art.portrait('scarlet', 'hurt')).toBe(`${ART_BASE}/char/scarlet-portrait-hurt.png`);
    expect(art.portrait('scarlet', 'normal')).toBe(`${ART_BASE}/char/scarlet-portrait.png`);
    expect(art.tile(2, 'chest-open')).toBe(`${ART_BASE}/tiles/f2-chest-open.png`);
    expect(art.icon('fire-star')).toBe(`${ART_BASE}/icon/fire-star.png`);
  });

  it('lists one url per asset with no duplicates', () => {
    const urls = allArtUrls();
    expect(urls).toHaveLength(133);
    expect(new Set(urls).size).toBe(133);
    for (const id of CHARACTER_IDS) expect(urls).toContain(art.standee(id));
    for (const id of Object.keys(ENEMIES)) expect(urls).toContain(art.enemy(id));
  });

  it('matches the art registry runtime paths exactly', () => {
    const reg = JSON.parse(readFileSync('art-factory/starlantern/registry.json', 'utf8')) as { assets: Record<string, { runtime?: string }> };
    const runtime = Object.values(reg.assets).flatMap((a) => (a.runtime ? [a.runtime] : [])).sort();
    expect(runtime).toEqual([...allArtUrls()].sort());
  });

  it('maps an opened chest to its own tile', () => {
    expect(tileKey('chest', true)).toBe('chest-open');
    expect(tileKey('chest', false)).toBe('chest');
    expect(tileKey('wall', true)).toBe('wall');
  });

  it('switches to the hurt face at 30% hp but not when down', () => {
    expect(moodFor(30, 100)).toBe('hurt');
    expect(moodFor(31, 100)).toBe('normal');
    expect(moodFor(0, 100)).toBe('normal');
  });

  it('picks an effect per event', () => {
    const dmg = (element: 'phys' | 'fire' | 'ice' | 'thunder') => ({ type: 'damage', target: 'e0', amount: 5, element, mult: 1 }) as const;
    expect(effectFor(dmg('fire'), 'noel')).toBe('fire');
    expect(effectFor(dmg('thunder'), 'noel')).toBe('thunder');
    expect(effectFor(dmg('phys'), 'chizuru')).toBe('pierce');
    expect(effectFor(dmg('phys'), 'sylvie')).toBe('pierce');
    expect(effectFor(dmg('phys'), 'scarlet')).toBe('slash');
    expect(effectFor(dmg('phys'), 'slime')).toBe('strike');
    expect(effectFor(dmg('phys'), null)).toBe('strike');
    expect(effectFor({ type: 'heal', target: 'liz', amount: 9 }, 'selene')).toBe('heal');
    expect(effectFor({ type: 'revive', target: 'liz' }, 'selene')).toBe('heal');
    expect(effectFor({ type: 'buff', target: 'liz', stat: 'atk', pct: 25 }, 'safira')).toBe('buff');
    expect(effectFor({ type: 'buff', target: 'e0', stat: 'atk', pct: -25 }, 'noel')).toBeNull();
    expect(effectFor({ type: 'ko', target: 'e0' }, 'liz')).toBeNull();
  });

  it('accepts only base urls from a well-formed manifest', () => {
    expect(parseManifest({ version: 1, urls: [art.enemy('slime'), 'https://evil.example/x.png', '/assets/games/other/a.png', 3] }))
      .toEqual(new Set([art.enemy('slime')]));
    expect(parseManifest(null).size).toBe(0);
    expect(parseManifest({ version: 2, urls: [art.enemy('slime')] }).size).toBe(0);
    expect(parseManifest({ version: 1, urls: 'nope' }).size).toBe(0);
  });
});
```

- [ ] **Step 2: 確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/render/artPaths.test.ts`
Expected: FAIL，`Failed to resolve import "./artPaths"`。

- [ ] **Step 3: 實作**

```ts
import { CHARACTER_IDS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { SKILLS } from '../data/skills';
import type { BattleEvent } from '../engine/combatant';
import type { Dir, Tile } from '../engine/map';

export const ART_BASE = '/assets/games/starlantern';
export const MANIFEST_URL = `${ART_BASE}/manifest.json`;
export type TileKey = Tile | 'chest-open';
export type FxKey = 'slash' | 'pierce' | 'strike' | 'fire' | 'ice' | 'thunder' | 'heal' | 'buff';
export type Mood = 'normal' | 'hurt';

export const TILE_KEYS: TileKey[] = ['wall', 'floor', 'door', 'up', 'down', 'chest', 'chest-open', 'entrance', 'boss'];
export const FX_KEYS: FxKey[] = ['slash', 'pierce', 'strike', 'fire', 'ice', 'thunder', 'heal', 'buff'];
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const PIERCERS = new Set(['chizuru', 'sylvie']);
const SLASHERS = new Set<string>(CHARACTER_IDS.filter((id) => !PIERCERS.has(id)));

export const art = {
  tile: (floor: number, key: TileKey) => `${ART_BASE}/tiles/f${floor}-${key}.png`,
  party: (dir: Dir) => `${ART_BASE}/map/party-${dir}.png`,
  bg: (floor: number) => `${ART_BASE}/bg/f${floor}.png`,
  enemy: (id: string) => `${ART_BASE}/enemy/${id}.png`,
  fx: (key: FxKey) => `${ART_BASE}/fx/${key}.png`,
  portrait: (cid: string, mood: Mood) => `${ART_BASE}/char/${cid}-portrait${mood === 'hurt' ? '-hurt' : ''}.png`,
  standee: (cid: string) => `${ART_BASE}/char/${cid}-standee.png`,
  icon: (id: string) => `${ART_BASE}/icon/${id}.png`,
  frame: `${ART_BASE}/ui/frame.png`,
};

export function tileKey(t: Tile, opened: boolean): TileKey {
  return t === 'chest' && opened ? 'chest-open' : t;
}

export function moodFor(hp: number, max: number): Mood {
  return hp > 0 && hp <= max * 0.3 ? 'hurt' : 'normal';
}

export function effectFor(ev: BattleEvent, actorDefId: string | null): FxKey | null {
  if (ev.type === 'damage') {
    if (ev.element !== 'phys') return ev.element;
    if (actorDefId && PIERCERS.has(actorDefId)) return 'pierce';
    return actorDefId && SLASHERS.has(actorDefId) ? 'slash' : 'strike';
  }
  if (ev.type === 'heal' || ev.type === 'revive' || ev.type === 'cure') return 'heal';
  if (ev.type === 'buff') return ev.pct > 0 ? 'buff' : null;
  return null;
}

export function allArtUrls(): string[] {
  const urls: string[] = [];
  for (const id of CHARACTER_IDS) urls.push(art.standee(id), art.portrait(id, 'normal'), art.portrait(id, 'hurt'));
  for (const d of DIRS) urls.push(art.party(d));
  for (const f of [1, 2, 3]) { for (const k of TILE_KEYS) urls.push(art.tile(f, k)); urls.push(art.bg(f)); }
  for (const id of Object.keys(ENEMIES)) urls.push(art.enemy(id));
  for (const k of FX_KEYS) urls.push(art.fx(k));
  urls.push(art.frame);
  for (const id of [...Object.keys(SKILLS), ...Object.keys(ITEMS), ...Object.keys(MATERIALS), ...Object.keys(EQUIPMENT)]) urls.push(art.icon(id));
  return urls;
}

export function parseManifest(json: unknown): Set<string> {
  if (!json || typeof json !== 'object') return new Set();
  const m = json as { version?: unknown; urls?: unknown };
  if (m.version !== 1 || !Array.isArray(m.urls)) return new Set();
  return new Set(m.urls.filter((u): u is string => typeof u === 'string' && u.startsWith(`${ART_BASE}/`) && !u.includes('..')));
}
```

註：`ENEMIES`、`SKILLS`、`ITEMS`、`MATERIALS`、`EQUIPMENT` 在計畫一是 `Record<string, …>`；若某個是陣列，改用 `.map((x) => x.id)`，並以「133 個不重複」那條測試為準。

- [ ] **Step 4: 確認通過**

Run: `npx vitest run src/scripts/games/starlantern/render/artPaths.test.ts`
Expected: 7 passed。

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/starlantern/render/artPaths.ts src/scripts/games/starlantern/render/artPaths.test.ts
git commit -m "feat(starlantern): art url rules and manifest parsing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: TextureBank 與開場載入

**Files:**
- Create: `src/scripts/games/starlantern/render/textures.ts`
- Test: `src/scripts/games/starlantern/render/textures.test.ts`
- Modify: `src/scripts/games/starlantern/client.ts:36-50`

**Interfaces:**
- Consumes：`MANIFEST_URL`、`parseManifest`（Task 4）。
- Produces：
  - `interface ArtIndex { has(url: string): boolean }`、`NO_ART: ArtIndex`
  - `class TextureBank implements ArtIndex`：`constructor(load?: (url: string) => Promise<Texture>)`、`preload(urls: Iterable<string>): Promise<void>`、`get(url: string): Texture | null`、`has(url: string): boolean`
  - `loadManifest(fetchFn?: typeof fetch): Promise<Set<string>>`

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Texture } from 'pixi.js';
import { MANIFEST_URL } from './artPaths';
import { TextureBank, loadManifest } from './textures';

const fakeTex = () => ({ source: { scaleMode: 'linear' } }) as unknown as Texture;

describe('TextureBank', () => {
  it('keeps loaded textures pixel-sharp and returns null for failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bank = new TextureBank(async (u) => { if (u.endsWith('bad.png')) throw new Error('404'); return fakeTex(); });
    await bank.preload(['/assets/games/starlantern/a.png', '/assets/games/starlantern/bad.png']);
    expect(bank.get('/assets/games/starlantern/a.png')?.source.scaleMode).toBe('nearest');
    expect(bank.has('/assets/games/starlantern/a.png')).toBe(true);
    expect(bank.get('/assets/games/starlantern/bad.png')).toBeNull();
    expect(bank.has('/assets/games/starlantern/bad.png')).toBe(false);
    expect(bank.get('/never/asked.png')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('loadManifest', () => {
  it('returns the listed urls', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ version: 1, urls: ['/assets/games/starlantern/enemy/slime.png'] })));
    expect(await loadManifest(f as unknown as typeof fetch)).toEqual(new Set(['/assets/games/starlantern/enemy/slime.png']));
    expect(f).toHaveBeenCalledWith(MANIFEST_URL, { cache: 'no-cache' });
  });

  it('treats a missing or broken manifest as no art', async () => {
    expect((await loadManifest((async () => new Response('', { status: 404 })) as unknown as typeof fetch)).size).toBe(0);
    expect((await loadManifest((async () => new Response('{oops')) as unknown as typeof fetch)).size).toBe(0);
    expect((await loadManifest((async () => { throw new Error('offline'); }) as unknown as typeof fetch)).size).toBe(0);
  });
});
```

- [ ] **Step 2: 確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/render/textures.test.ts`
Expected: FAIL，`Failed to resolve import "./textures"`。

- [ ] **Step 3: 實作**

```ts
import { Assets, type Texture } from 'pixi.js';
import { MANIFEST_URL, parseManifest } from './artPaths';

export interface ArtIndex { has(url: string): boolean }
export const NO_ART: ArtIndex = { has: () => false };

export class TextureBank implements ArtIndex {
  private textures = new Map<string, Texture>();

  constructor(private load: (url: string) => Promise<Texture> = (u) => Assets.load<Texture>(u)) {}

  async preload(urls: Iterable<string>): Promise<void> {
    await Promise.all([...urls].map(async (u) => {
      try {
        const t = await this.load(u);
        t.source.scaleMode = 'nearest';
        this.textures.set(u, t);
      } catch (err) {
        console.warn('[starlantern] art failed to load; using a placeholder', u, err);
      }
    }));
  }

  get(url: string): Texture | null { return this.textures.get(url) ?? null; }
  has(url: string): boolean { return this.textures.has(url); }
}

export async function loadManifest(fetchFn: typeof fetch = fetch): Promise<Set<string>> {
  try {
    const res = await fetchFn(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) return new Set();
    return parseManifest(await res.json());
  } catch {
    return new Set();
  }
}
```

- [ ] **Step 4: 接進 `client.ts`**

在 `const sfx = new SoundManager();` 之後加：

```ts
  const bank = new TextureBank();
  await bank.preload(await loadManifest());
```

並把 `new MapView()`、`new BattleView(fast)` 改成 `new MapView(bank)`、`new BattleView(fast, bank)`（建構子參數在 Task 6、7 加；本 Task 先只加 import 與這兩行預載，建構子呼叫留到 Task 6、7 改，避免型別錯誤）。`hooks` 加 `art: bank`（`UiHooks` 的欄位在 Task 8 加，本 Task 不動）。

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/scripts/games/starlantern`
Expected: 全部通過（計畫一的 137 個＋本計畫新增）。

- [ ] **Step 6: Commit**

```bash
git add src/scripts/games/starlantern/render/textures.ts src/scripts/games/starlantern/render/textures.test.ts src/scripts/games/starlantern/client.ts
git commit -m "feat(starlantern): texture bank with manifest-driven preload

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 地圖圖塊、隊伍朝向、移動彈跳

**Files:**
- Modify: `src/scripts/games/starlantern/engine/game.ts`（加 `facing`）
- Test: `src/scripts/games/starlantern/engine/game.test.ts`（加測試）
- Modify: `src/scripts/games/starlantern/render/MapView.ts`（整檔改寫，見下）
- Modify: `src/scripts/games/starlantern/client.ts`（`new MapView(bank)`）

**Interfaces:**
- Consumes：`TextureBank`（Task 5）、`art`、`tileKey`（Task 4）。
- Produces：`Game.facing: Dir`（預設 `'down'`；`move()` 不論是否撞牆都會更新；`depart()` 重設為 `'down'`）。`MapView` 建構子 `constructor(bank: TextureBank | null = null)`，其餘 API 不變。

- [ ] **Step 1: 寫失敗測試**（加進 `game.test.ts`，沿用該檔既有的建立 `Game` 的寫法）

```ts
  it('turns to face the move direction even when blocked, and faces down on departure', () => {
    const g = new Game(calm(), null);
    expect(g.depart(1)).toEqual({ ok: true });
    expect(g.facing).toBe('down');
    g.move('up'); // the entrance on floor 1 has a wall above it
    expect(g.facing).toBe('up');
    g.move('right');
    expect(g.facing).toBe('right');
  });
```

`calm()` 是 `game.test.ts` 既有的不遇敵亂數。第 1 層入口 `E` 的正上方是牆（地圖第 0 列全是 `#`，入口在第 1 列）。

- [ ] **Step 2: 確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/engine/game.test.ts`
Expected: FAIL，`expected undefined to be 'down'`。

- [ ] **Step 3: 實作**

`game.ts`：類別欄位加 `facing: Dir = 'down';`；`depart()` 在 `this.pos = ...` 後加 `this.facing = 'down';`；`move()` 在 `if (this.phase !== 'map') return { kind: 'ignored' };` 後加 `this.facing = dir;`。

- [ ] **Step 4: 確認通過**

Run: `npx vitest run src/scripts/games/starlantern/engine/game.test.ts`
Expected: 全部通過。

- [ ] **Step 5: 改寫 `MapView.ts`**

```ts
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Game } from '../engine/game';
import type { Tile } from '../engine/map';
import { art, tileKey } from './artPaths';
import type { TextureBank } from './textures';

const COLORS: Record<Tile, number> = {
  wall: 0x2a2d3a, floor: 0x5b6150, door: 0x9c6644, up: 0x8ecae6, down: 0x219ebc, chest: 0xe9c46a, entrance: 0x90be6d, boss: 0xd62828,
};
const FOG = 0x05060a;
const HOP_FRAMES = 10;

export class MapView {
  readonly root = new Container();
  private tiles = new Container();
  private blocks = new Graphics();
  private fog = new Graphics();
  private marker = new Container();
  private dot = new Graphics();
  private icon = new Sprite();
  private target = { x: 0, y: 0 };
  private cell = 0;
  private hop = 0;

  constructor(private bank: TextureBank | null = null) {
    this.marker.addChild(this.dot, this.icon);
    this.root.addChild(this.blocks, this.tiles, this.fog, this.marker);
  }

  draw(game: Game, size: { width: number; height: number }): void {
    const map = game.map();
    const seen = new Set(game.state.dungeon.explored[String(game.floor)] ?? []);
    const cell = Math.max(8, Math.floor(Math.min(size.width / map.width, size.height / map.height)));
    this.cell = cell;
    this.root.x = Math.floor((size.width - cell * map.width) / 2);
    this.root.y = Math.floor((size.height - cell * map.height) / 2);
    this.blocks.clear();
    this.fog.clear();
    for (const s of this.tiles.removeChildren()) s.destroy();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.tiles[y][x];
        const opened = t === 'chest' && game.state.dungeon.opened.includes(`${game.floor}:${x},${y}`);
        if (!seen.has(`${x},${y}`)) { this.fog.rect(x * cell, y * cell, cell, cell).fill(FOG); continue; }
        const tex = this.bank?.get(art.tile(game.floor, tileKey(t, opened))) ?? null;
        if (tex) {
          const s = new Sprite(tex);
          s.x = x * cell; s.y = y * cell; s.width = cell; s.height = cell;
          this.tiles.addChild(s);
        } else {
          this.blocks.rect(x * cell, y * cell, cell, cell).fill(COLORS[opened ? 'floor' : t]);
        }
      }
    }
    const tex = this.bank?.get(art.party(game.facing)) ?? null;
    this.dot.clear();
    this.icon.visible = !!tex;
    if (tex) {
      this.icon.texture = tex;
      const k = (cell * 0.9) / Math.max(tex.width, tex.height);
      this.icon.scale.set(k);
      this.icon.anchor.set(0.5, 1);
      this.icon.x = cell / 2; this.icon.y = cell * 0.95;
    } else {
      this.dot.circle(cell / 2, cell / 2, cell * 0.35).fill(0xffd166).stroke({ width: 2, color: 0x1d1d1d });
    }
    const tx = game.pos.x * cell, ty = game.pos.y * cell;
    const far = Math.abs(tx - this.marker.x) > cell * 1.5 || Math.abs(ty - this.marker.y) > cell * 1.5;
    if (far) { this.marker.x = tx; this.marker.y = ty; }
    else if (tx !== this.target.x || ty !== this.target.y) this.hop = HOP_FRAMES;
    this.target = { x: tx, y: ty };
  }

  /** Slide toward the tile with a small hop; called from the Pixi ticker. */
  update(dt: number): void {
    const k = Math.min(1, 0.35 * dt);
    this.marker.x += (this.target.x - this.marker.x) * k;
    this.marker.y += (this.target.y - this.marker.y) * k;
    this.hop = Math.max(0, this.hop - dt);
    const lift = Math.sin((this.hop / HOP_FRAMES) * Math.PI) * this.cell * 0.12;
    this.dot.y = -lift;
    this.icon.y = this.cell * 0.95 - lift;
  }
}
```

`client.ts`：`new MapView()` → `new MapView(bank)`。

- [ ] **Step 6: 驗證**

Run: `npx vitest run src/scripts/games/starlantern` 與 `npx tsc --noEmit -p . 2>&1 | grep starlantern`
Expected: 測試全過；tsc 沒有 starlantern 的錯誤。
沒有素材時跑一次 `node tmp/starlantern/shots.mjs tmp/starlantern/shots-t6 http://127.0.0.1:4354`（若 dev server 沒開，在 worktree 用 `npx astro dev --port 4354` 背景啟動），看 `map-start.png` 和計畫一一樣是色塊、`errors` 為空。

- [ ] **Step 7: Commit**

```bash
git add src/scripts/games/starlantern/engine/game.ts src/scripts/games/starlantern/engine/game.test.ts src/scripts/games/starlantern/render/MapView.ts src/scripts/games/starlantern/client.ts
git commit -m "feat(starlantern): textured map tiles, party facing and hop

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 戰鬥畫面：背景、敵人圖、閃白、特效、碎裂、隊伍頭貼反應

**Files:**
- Modify: `src/scripts/games/starlantern/render/BattleView.ts`（整檔改寫）
- Create: `src/scripts/games/starlantern/render/battleCues.ts`
- Test: `src/scripts/games/starlantern/render/battleCues.test.ts`
- Modify: `src/scripts/games/starlantern/client.ts`（`setup` 多傳 floor；`play` 多傳 party 回呼）
- Modify: `src/scripts/games/starlantern/ui/battleMenu.ts`（`partyBar` 的卡片加 `data-key`）
- Test: `src/scripts/games/starlantern/ui/battleMenu.test.ts`（加測試）
- Modify: `src/styles/_starlantern.scss`（`sl-member--hit`、`sl-member--acting`）

**Interfaces:**
- Consumes：`TextureBank`、`art`、`effectFor`、`FxKey`。
- Produces：
  - `battleCues(log: BattleEvent[], defIdOf: (key: string) => string | null): Cue[]`，`Cue = { kind: 'act'; key: string } | { kind: 'hit'; key: string; amount: number; weak: boolean; fx: FxKey | null } | { kind: 'fx'; key: string; fx: FxKey } | { kind: 'ko'; key: string } | { kind: 'wait'; ms: number }`
  - `BattleView.constructor(fast = false, bank: TextureBank | null = null)`、`setup(state, size, floor: number)`、`play(state, sfx, onParty?: (key: string, cue: 'acting' | 'hit') => void)`
  - 隊伍卡片 DOM：`div.sl-member[data-key="<cid>"]`

- [ ] **Step 1: 寫失敗測試**

`battleCues.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '../engine/combatant';
import { battleCues } from './battleCues';

const defIdOf = (k: string) => ({ scarlet: 'scarlet', sylvie: 'sylvie', e0: 'slime' } as Record<string, string>)[k] ?? null;

describe('battleCues', () => {
  it('tags hits with the acting character and its effect', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'sylvie', label: '射擊' },
      { type: 'damage', target: 'e0', amount: 12, element: 'phys', mult: 1.5 },
      { type: 'act', actor: 'e0', label: '攻擊' },
      { type: 'damage', target: 'scarlet', amount: 4, element: 'phys', mult: 1 },
      { type: 'ko', target: 'e0' },
    ];
    expect(battleCues(log, defIdOf)).toEqual([
      { kind: 'act', key: 'sylvie' }, { kind: 'wait', ms: 260 },
      { kind: 'hit', key: 'e0', amount: 12, weak: true, fx: 'pierce' }, { kind: 'wait', ms: 160 },
      { kind: 'act', key: 'e0' }, { kind: 'wait', ms: 260 },
      { kind: 'hit', key: 'scarlet', amount: 4, weak: false, fx: 'strike' }, { kind: 'wait', ms: 160 },
      { kind: 'ko', key: 'e0' }, { kind: 'wait', ms: 160 },
    ]);
  });

  it('turns heals and buffs into effect cues and skips events without visuals', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'scarlet', label: '鐵壁' },
      { type: 'buff', target: 'scarlet', stat: 'def', pct: 30 },
      { type: 'resist', target: 'e0' },
    ];
    expect(battleCues(log, defIdOf)).toEqual([
      { kind: 'act', key: 'scarlet' }, { kind: 'wait', ms: 260 },
      { kind: 'fx', key: 'scarlet', fx: 'buff' }, { kind: 'wait', ms: 160 },
      { kind: 'wait', ms: 160 },
    ]);
  });
});
```

`battleMenu.test.ts` 加（沿用該檔既有建立選單的方式）：

```ts
  it('marks each party card with its combatant key', () => {
    // render the menu for a battle the same way the other tests in this file do, then:
    const cards = [...root.querySelectorAll<HTMLElement>('.sl-party .sl-member')];
    expect(cards.map((c) => c.dataset.key)).toEqual(state.party.map((c) => c.key));
  });
```

（`root`、`state` 用該檔既有測試的同名變數；若名稱不同，照該檔改名。）

- [ ] **Step 2: 確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/render/battleCues.test.ts src/scripts/games/starlantern/ui/battleMenu.test.ts`
Expected: battleCues 因找不到模組失敗；battleMenu 新測試因 `data-key` 為 undefined 失敗。

- [ ] **Step 3: 實作 `battleCues.ts`**

```ts
import type { BattleEvent } from '../engine/combatant';
import { effectFor, type FxKey } from './artPaths';

export type Cue =
  | { kind: 'act'; key: string }
  | { kind: 'hit'; key: string; amount: number; weak: boolean; fx: FxKey | null }
  | { kind: 'fx'; key: string; fx: FxKey }
  | { kind: 'ko'; key: string }
  | { kind: 'wait'; ms: number };

export function battleCues(log: BattleEvent[], defIdOf: (key: string) => string | null): Cue[] {
  const out: Cue[] = [];
  let actor: string | null = null;
  for (const ev of log) {
    if (ev.type === 'act') {
      actor = defIdOf(ev.actor);
      out.push({ kind: 'act', key: ev.actor }, { kind: 'wait', ms: 260 });
      continue;
    }
    if (ev.type === 'damage') out.push({ kind: 'hit', key: ev.target, amount: ev.amount, weak: ev.mult > 1, fx: effectFor(ev, actor) });
    else if (ev.type === 'ko') out.push({ kind: 'ko', key: ev.target });
    else if ('target' in ev) {
      const fx = effectFor(ev, actor);
      if (fx) out.push({ kind: 'fx', key: ev.target, fx });
    }
    out.push({ kind: 'wait', ms: 160 });
  }
  return out;
}
```

`battleMenu.ts` 的 `partyBar`：`el('div', { class: cls }, ...)` 改成 `el('div', { class: cls, attrs: { 'data-key': c.key } }, ...)`。

- [ ] **Step 4: 確認通過**

Run: `npx vitest run src/scripts/games/starlantern/render/battleCues.test.ts src/scripts/games/starlantern/ui/battleMenu.test.ts`
Expected: 全過。

- [ ] **Step 5: 改寫 `BattleView.ts`**

```ts
import { ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { SoundManager } from '../audio/SoundManager';
import type { BattleState } from '../engine/battle';
import { art } from './artPaths';
import { battleCues } from './battleCues';
import type { TextureBank } from './textures';

const PALETTE = [0x7fb069, 0x8e7dbe, 0xd1495b, 0x66a1d2, 0xe0a458, 0x5c946e, 0xb56576, 0x6d6875, 0xc44536];

function colorFor(defId: string): number {
  let h = 0;
  for (const ch of defId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface Slot { box: Container; body: Container; texture: Texture | null }

export class BattleView {
  readonly root = new Container();
  private slots = new Map<string, Slot>();
  private defIds = new Map<string, string>();

  constructor(private fast = false, private bank: TextureBank | null = null) {}

  setup(state: BattleState, size: { width: number; height: number }, floor: number): void {
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.slots.clear();
    this.defIds.clear();
    for (const c of [...state.party, ...state.enemies]) this.defIds.set(c.key, c.defId);
    const bg = this.bank?.get(art.bg(floor)) ?? null;
    if (bg) {
      const s = new Sprite(bg);
      const k = Math.max(size.width / bg.width, size.height / bg.height);
      s.scale.set(k);
      s.x = (size.width - bg.width * k) / 2; s.y = (size.height - bg.height * k) / 2;
      this.root.addChild(s);
    } else {
      this.root.addChild(new Graphics().rect(0, 0, size.width, size.height).fill(0x141826));
    }
    const n = state.enemies.length;
    const slotW = size.width / (n + 1);
    state.enemies.forEach((e, i) => {
      const box = new Container();
      const body = new Container();
      const tex = this.bank?.get(art.enemy(e.defId)) ?? null;
      const maxH = size.height * (e.boss ? 0.7 : 0.45);
      if (tex) {
        const s = new Sprite(tex);
        const k = Math.min(maxH / tex.height, (slotW * 0.9) / tex.width);
        s.scale.set(k); s.anchor.set(0.5, 1);
        body.addChild(s);
      } else {
        const w = Math.min(160, slotW), h = w * 1.2;
        body.addChild(new Graphics().roundRect(-w / 2, -h, w, h, 12).fill(colorFor(e.defId)));
      }
      const label = new Text({ text: e.name, style: { fill: 0xffffff, fontSize: 14, stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5, 0);
      box.addChild(body, label);
      box.x = slotW * (i + 1);
      box.y = size.height * 0.85;
      box.alpha = e.alive ? 1 : 0;
      this.root.addChild(box);
      this.slots.set(e.key, { box, body, texture: tex });
    });
  }

  async play(state: BattleState, sfx: SoundManager, onParty?: (key: string, cue: 'acting' | 'hit') => void): Promise<void> {
    for (const cue of battleCues(state.log, (k) => this.defIds.get(k) ?? null)) {
      if (cue.kind === 'wait') { await this.wait(cue.ms); continue; }
      const slot = this.slots.get(cue.key);
      if (cue.kind === 'act') { if (!slot) onParty?.(cue.key, 'acting'); continue; }
      if (cue.kind === 'hit') {
        if (cue.weak) sfx.weak(); else sfx.hit();
        if (slot) { this.flash(slot); this.popup(slot, String(cue.amount), cue.weak ? 0xffd166 : 0xffffff); }
        else onParty?.(cue.key, 'hit');
      }
      if (cue.kind === 'fx' && cue.fx === 'heal') sfx.heal();
      if ((cue.kind === 'hit' || cue.kind === 'fx') && cue.fx && slot) this.effect(slot, cue.fx);
      if (cue.kind === 'ko') { sfx.ko(); if (slot) this.shatter(slot); }
    }
    for (const e of state.enemies) {
      const s = this.slots.get(e.key);
      if (s && !e.alive) s.box.alpha = 0;
    }
  }

  private flash(slot: Slot): void {
    const f = new ColorMatrixFilter();
    f.brightness(3, false);
    slot.body.filters = [f];
    const x0 = slot.box.x;
    slot.box.x = x0 + 6;
    this.later(60, () => { slot.box.x = x0; });
    this.later(90, () => { slot.body.filters = []; });
  }

  private effect(slot: Slot, key: Parameters<typeof art.fx>[0]): void {
    const tex = this.bank?.get(art.fx(key)) ?? null;
    if (!tex) return;
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.y = -slot.body.height / 2;
    s.scale.set(Math.min(2, (slot.body.width * 0.8) / tex.width));
    slot.box.addChild(s);
    this.later(220, () => { slot.box.removeChild(s); s.destroy(); });
  }

  private shatter(slot: Slot): void {
    const tex = slot.texture;
    const sprite = slot.body.children[0];
    if (!tex || !(sprite instanceof Sprite) || this.fast) { slot.box.alpha = this.fast ? 0 : 0.15; return; }
    const { width: w, height: h } = tex.frame;
    const k = sprite.scale.x;
    sprite.visible = false;
    const pieces = [0, 1, 2, 3].map((i) => {
      const fx = (i % 2) * (w / 2), fy = Math.floor(i / 2) * (h / 2);
      const t = new Texture({ source: tex.source, frame: new Rectangle(tex.frame.x + fx, tex.frame.y + fy, w / 2, h / 2) });
      const p = new Sprite(t);
      p.scale.set(k);
      p.x = (fx - w / 2) * k; p.y = (fy - h) * k;
      slot.body.addChild(p);
      return { p, vx: (i % 2 ? 1 : -1) * 2.5, vy: i < 2 ? -2 : 1 };
    });
    let frame = 0;
    const tick = () => {
      frame++;
      for (const { p, vx, vy } of pieces) { p.x += vx; p.y += vy + frame * 0.3; p.alpha = Math.max(0, 1 - frame / 24); }
      if (frame < 24) requestAnimationFrame(tick); else slot.box.alpha = 0;
    };
    requestAnimationFrame(tick);
  }

  private popup(slot: Slot, text: string, color: number): void {
    const t = new Text({ text, style: { fill: color, fontSize: 22, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } } });
    t.anchor.set(0.5);
    t.y = -slot.body.height - 12;
    slot.box.addChild(t);
    this.later(500, () => { slot.box.removeChild(t); t.destroy(); });
  }

  private later(ms: number, fn: () => void): void {
    setTimeout(fn, this.fast ? 0 : ms);
  }

  private wait(ms: number): Promise<void> {
    return this.fast ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
  }
}
```

`client.ts`：
- `new BattleView(fast)` → `new BattleView(fast, bank)`
- `battleView.setup(game.battle!, size())` → `battleView.setup(game.battle!, size(), game.floor)`
- `await battleView.play(r.battle, sfx)` → `await battleView.play(r.battle, sfx, pulseCard)`，並在 `say` 下方定義：

```ts
  const pulseCard = (key: string, cue: 'acting' | 'hit') => {
    const card = document.querySelector<HTMLElement>(`#sl-battle .sl-member[data-key="${key}"]`);
    if (!card) return;
    const cls = `sl-member--${cue}`;
    card.classList.remove(cls);
    void card.offsetWidth;
    card.classList.add(cls);
    setTimeout(() => card.classList.remove(cls), fast ? 0 : 320);
  };
```

`_starlantern.scss` 在 `.sl-member--down` 規則後加：

```scss
.sl-member--acting { box-shadow: 0 0 0 2px $sl-gold; }
.sl-member--hit { animation: sl-hit 0.2s steps(2) 1; }
@keyframes sl-hit {
  0% { transform: translateX(-4px); filter: brightness(2); }
  100% { transform: translateX(4px); filter: none; }
}
```

- [ ] **Step 6: 驗證**

Run: `npx vitest run src/scripts/games/starlantern`、`npx tsc --noEmit -p . 2>&1 | grep starlantern`、`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`
Expected: 全過、無 starlantern 型別錯誤、e2e 2 passed。

- [ ] **Step 7: Commit**

```bash
git add src/scripts/games/starlantern src/styles/_starlantern.scss
git commit -m "feat(starlantern): battle art, hit flash, effects, shatter and party card cues

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: DOM 頭貼、立繪、圖示與九宮格介面框

**Files:**
- Create: `src/scripts/games/starlantern/ui/art.ts`
- Test: `src/scripts/games/starlantern/ui/art.test.ts`
- Modify: `src/scripts/games/starlantern/ui/dom.ts`（`UiHooks` 加 `art: ArtIndex`）
- Modify: `src/scripts/games/starlantern/ui/hud.ts`、`ui/battleMenu.ts`、`ui/town.ts`（插入圖）
- Modify: 各 UI 測試的 hooks 假物件加 `art: NO_ART`
- Modify: `src/scripts/games/starlantern/client.ts`（`hooks` 加 `art: bank`；`BattleMenu` 若自己持有 hooks 以外的參數，同樣傳 `bank`）
- Modify: `src/styles/_starlantern.scss`

**Interfaces:**
- Consumes：`ArtIndex`、`NO_ART`（Task 5）、`art`、`moodFor`（Task 4）。
- Produces：
  - `portraitImg(index: ArtIndex, cid: string, hp: number, max: number): HTMLImageElement | null`（class `sl-portrait`，倒下時加 `sl-portrait--down`；`alt=""`）
  - `standeeImg(index: ArtIndex, cid: string): HTMLImageElement | null`（class `sl-standee`）
  - `iconImg(index: ArtIndex, id: string): HTMLImageElement | null`（class `sl-icon`）
  - 沒有該圖時回傳 `null`，呼叫端直接略過（顯示純文字，和計畫一相同）。

- [ ] **Step 1: 寫失敗測試**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { art } from '../render/artPaths';
import { NO_ART } from '../render/textures';
import { iconImg, portraitImg, standeeImg } from './art';

const some = (...urls: string[]) => ({ has: (u: string) => urls.includes(u) });

describe('ui art', () => {
  it('shows the normal face, the hurt face at low hp, and a grey face when down', () => {
    const idx = some(art.portrait('liz', 'normal'), art.portrait('liz', 'hurt'));
    expect(portraitImg(idx, 'liz', 50, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
    expect(portraitImg(idx, 'liz', 10, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'hurt'));
    const down = portraitImg(idx, 'liz', 0, 50)!;
    expect(down.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
    expect(down.classList.contains('sl-portrait--down')).toBe(true);
    expect(down.alt).toBe('');
  });

  it('falls back to the normal face when only it is published', () => {
    expect(portraitImg(some(art.portrait('liz', 'normal')), 'liz', 1, 50)!.getAttribute('src')).toBe(art.portrait('liz', 'normal'));
  });

  it('returns null when the art is not published', () => {
    expect(portraitImg(NO_ART, 'liz', 50, 50)).toBeNull();
    expect(standeeImg(NO_ART, 'liz')).toBeNull();
    expect(iconImg(NO_ART, 'potion')).toBeNull();
    expect(iconImg(some(art.icon('potion')), 'potion')!.className).toBe('sl-icon');
    expect(standeeImg(some(art.standee('liz')), 'liz')!.className).toBe('sl-standee');
  });
});
```

另外在 `hud.test.ts` 加一個測試：給 `art: some(art.portrait(id,'normal'))` 的 hooks，`renderHud` 後 `.sl-party .sl-portrait` 數量等於有圖的出戰隊員數；給 `NO_ART` 時為 0（`some` 在該檔內同樣定義）。

- [ ] **Step 2: 確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/ui`
Expected: `art.test.ts` 找不到模組；hud 新測試因沒有 `.sl-portrait` 失敗。

- [ ] **Step 3: 實作 `ui/art.ts`**

```ts
import { art, moodFor } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { el } from './dom';

function img(src: string, cls: string): HTMLImageElement {
  const i = el('img', { class: cls, attrs: { src, alt: '', draggable: 'false' } });
  i.decoding = 'async';
  return i;
}

export function portraitImg(index: ArtIndex, cid: string, hp: number, max: number): HTMLImageElement | null {
  const normal = art.portrait(cid, 'normal');
  if (!index.has(normal)) return null;
  const hurt = art.portrait(cid, 'hurt');
  const src = moodFor(hp, max) === 'hurt' && index.has(hurt) ? hurt : normal;
  return img(src, hp > 0 ? 'sl-portrait' : 'sl-portrait sl-portrait--down');
}

export function standeeImg(index: ArtIndex, cid: string): HTMLImageElement | null {
  const src = art.standee(cid);
  return index.has(src) ? img(src, 'sl-standee') : null;
}

export function iconImg(index: ArtIndex, id: string): HTMLImageElement | null {
  const src = art.icon(id);
  return index.has(src) ? img(src, 'sl-icon') : null;
}
```

接線（每處都是「有圖就放在文字前面，沒圖就和原本一樣」）：
- `dom.ts`：`UiHooks` 加 `art: ArtIndex`（`import type { ArtIndex } from '../render/textures'`）。
- `hud.ts`：隊員卡片 children 最前面加 `portraitImg(ui.art, id, m.hp, st.hp)`，用 `.filter((n): n is HTMLElement => !!n)` 去掉 null。
- `battleMenu.ts`：`partyBar` 卡片最前面加 `portraitImg(...)`（以 `c.defId`、`c.hp`、`c.max.hp`）；技能按鈕與道具按鈕用 `b.prepend(icon)`（有圖時）。`BattleMenu` 需要 `ArtIndex`：若它已持有 `UiHooks`，用 `this.ui.art`；否則在建構子加 `private art: ArtIndex = NO_ART` 參數，`client.ts` 傳 `bank`。
- `town.ts`：公會 `article.sl-card` 最前面加 `standeeImg(ui.art, id)`；招募按鈕 `prepend` 頭貼（`portraitImg(ui.art, id, 1, 1)`）；商店販售列與購買按鈕 `prepend` `iconImg`。裝備 `<select>` 不放圖（`<option>` 不能放圖）。
- 測試裡所有手寫的 hooks 物件加 `art: NO_ART`。

`_starlantern.scss` 加：

```scss
.sl-portrait, .sl-standee, .sl-icon { image-rendering: pixelated; }
.sl-portrait { width: 48px; height: 48px; object-fit: contain; }
.sl-portrait--down { filter: grayscale(1) brightness(0.7); }
.sl-standee { float: left; height: 120px; margin-right: 8px; }
.sl-icon { width: 24px; height: 24px; margin-right: 4px; vertical-align: middle; }
.sl-panel, .sl-card, .sl-member, .sl-log, .sl-notice, .sl-stage {
  border-style: solid;
  border-width: 12px;
  border-image: url('/assets/games/starlantern/ui/frame.png') 16 fill / 12px round;
  image-rendering: pixelated;
}
```

（`border-image` 的圖若尚未發布，瀏覽器會退回原本的 `border` 顏色；先確認原本這些選擇器的 `border: 1px solid $sl-line` 仍保留在前面，`border-width` 會變寬，這是預期。若使用者覺得太粗，改 `border-width` 與斜線後的寬度。）

- [ ] **Step 4: 確認通過**

Run: `npx vitest run src/scripts/games/starlantern` 與 `npx tsc --noEmit -p . 2>&1 | grep starlantern`
Expected: 全過；無型別錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/starlantern src/styles/_starlantern.scss
git commit -m "feat(starlantern): portraits, standees, icons and nine-slice frame in the DOM ui

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 量產角色（需 Task 3 已核准）

**Files:**
- Create: `art-factory/starlantern/prompts/char-<cid>-{standee,portrait,portrait-hurt}.txt`（其餘 7 位）、`map-party.txt`
- Modify: `art-factory/starlantern/registry.json`、`art-factory/starlantern/work/...`

- [ ] **Step 1: 前置檢查**：`python -c "import json;r=json.load(open('art-factory/starlantern/registry.json',encoding='utf-8'))['assets'];print(r['char-scarlet-standee']['status'])"` 必須印出 `approved`。不是的話停下來，回到 Task 3 Step 5。

- [ ] **Step 2: 每位角色依序：立繪 → 一般頭貼（參考立繪）→ 受傷頭貼（參考一般頭貼）**。prompt 照 contract 範本，`--image` 一律同時附上已核准的絲嘉蕾立繪（風格錨點）與該角色的 `reference/crops/<cid>.png`。指令格式同 Task 3 Step 2；每張生成後立即 `process`，不過就改 prompt 換新檔名重試（最多 3 次，超過就記在登錄表 `notes` 並往下做，最後一起回報）。

- [ ] **Step 3: 地圖隊伍圖示**：一次生成一條 4 姿勢的橫條（`codex_still.py generate ... --strip-auto 4`），順序寫在 prompt 裡：面向上（背面）、面向下（正面）、面向左、面向右；角色是「提著星燈的斗篷冒險者」，不是 8 人之一。把 `-frames/0..3.png` 分別 `process --kind sprite --id map-party-up|down|left|right`。

- [ ] **Step 4: 一致性檢查**：

```bash
python - <<'EOF'
import json; r = json.load(open('art-factory/starlantern/registry.json', encoding='utf-8'))['assets']
bad = {k: (v['status'], v.get('qa', {}).get('size')) for k, v in r.items() if (k.startswith('char-') or k.startswith('map-')) and v['status'] not in ('qa_passed', 'approved')}
print(bad or 'all character art passed QA')
EOF
```

Expected: `all character art passed QA`（或列出要回報的少數例外）。

- [ ] **Step 5: Commit**

```bash
git add art-factory/starlantern
git commit -m "art(starlantern): character standees, portraits and map icons (pending approval)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 量產敵人、第 2–3 層圖塊與背景（需 Task 3 已核准）

**Files:** 同 Task 9 的 `prompts/`、`registry.json`、`work/`。

- [ ] **Step 1: 敵人 8 隻**：先在 contract 的「地形與敵人描述」補齊 8 隻的一句外觀（依 `data/enemies.ts` 名稱：遺跡蝙蝠、荊棘狼、…、燈喰之獸）。每隻 `--image` 附已核准的史萊姆當風格錨點。頭目 `lanterneater` 的 prompt 要求「large boss monster that devours star lanterns, imposing」。
- [ ] **Step 2: 第 2、3 層圖塊表**：`--image` 附已核准的第 1 層圖塊表成品；`process --kind tile-sheet --cols 3 --rows 3 --ids tile-f<n>-wall,...`（順序同 Task 3）。檢查 `tile-f<n>-floor`、`tile-f<n>-wall` 的 `seam` ≤ 24。
- [ ] **Step 3: 第 2、3 層戰鬥背景**：`--image` 附已核准的 `bg-f1`。
- [ ] **Step 4: 一致性檢查**：同 Task 9 Step 4，把前綴換成 `enemy-`、`tile-`、`bg-`。
- [ ] **Step 5: Commit**：`art(starlantern): enemies, floor 2-3 tiles and backdrops (pending approval)`。

---

### Task 11: 量產圖示表、特效、介面框（需 Task 3 已核准）

- [ ] **Step 1: 3 張圖示表**：清單直接從登錄表的 `sheet-icons-<k>.parts` 取，在 prompt 裡把每個 id 換成一句英文描述（技能依 `data/skills.ts` 的名稱與屬性，例如 fire-star → `a red five-pointed star wrapped in flame`；道具、素材、裝備依名稱）。`process --id sheet-icons-<k> --kind icon-sheet --cols 5 --rows 4 --ids <parts 以逗號連接>`。第 3 張只有 17 格：prompt 要求最後 3 格畫「plain empty stone slab」，`process` 只會把前 17 格對上 id。
- [ ] **Step 2: 8 張特效**：各自一次生成；`process --kind sprite`。
- [ ] **Step 3: 介面框**：`process --id ui-frame --kind opaque`；額外檢查四條邊中段可以重複：

```bash
python - <<'EOF'
import sys; sys.path.insert(0, 'art-factory/starlantern/tools')
import json; from PIL import Image; import sl_art as A
r = json.load(open('art-factory/starlantern/registry.json', encoding='utf-8'))['assets']['ui-frame']
im = Image.open(r['final']); w, h = im.size
top = im.crop((16, 0, w - 16, 16)); left = im.crop((0, 16, 16, h - 16))
print({'size': im.size, 'top_seam': A.seam_score(top), 'left_seam': A.seam_score(left)})
EOF
```

Expected: `size` 為 `(48, 48)`；兩個 seam 值都 ≤ 24（`seam_score` 同時看左右與上下，中段條帶左右要能接）。
- [ ] **Step 4: Commit**：`art(starlantern): icon sheets, effects and ui frame (pending approval)`。

---

### Task 12: 第二次核准、發布、退件清理（使用者核准關卡）

**Files:**
- Create（scratchpad）：`review-2.html`
- Create: `public/assets/games/starlantern/**`、`public/assets/games/starlantern/manifest.json`
- Create: `src/scripts/games/starlantern/render/published.test.ts`

- [ ] **Step 1: 審核頁**：依類別分頁籤列出所有 `qa_passed` 的圖（放大 4 倍、像素化），每張標 id；加一個「遊戲內預覽」區：把 manifest 暫時指向 work 目錄是不行的，所以改成在審核頁裡用 `<img>` 直接排出地圖（第 2、3 層前幾列）、一場戰鬥（背景＋2 隻敵人＋5 張頭貼）、城鎮卡片（立繪＋框）。headless 截圖確認後用 Artifact 發布，把連結給使用者。

- [ ] **Step 2: 停下來等使用者核准**。問法：「請列出要重做的 id（或類別）；沒列到的就核准。」
- 核准的：`sl_art.py approve --id <id>`。
- 要重做的：改 prompt 重生（回到 Task 9–11 對應步驟），重做的部分再給使用者看一次。
- 使用者明確不要的：`sl_art.py reject --id <id> --reason "<使用者原話>"`。

- [ ] **Step 3: 寫失敗測試**（發布後才會過）

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allArtUrls, parseManifest } from './artPaths';

describe('published starlantern art', () => {
  const manifest = parseManifest(JSON.parse(readFileSync('public/assets/games/starlantern/manifest.json', 'utf8')));

  it('publishes every art url', () => {
    expect([...manifest].sort()).toEqual([...allArtUrls()].sort());
  });

  it('has a file for every manifest entry and nothing unlisted', () => {
    for (const u of manifest) expect(existsSync(`public${u}`), u).toBe(true);
  });
});
```

Run: `npx vitest run src/scripts/games/starlantern/render/published.test.ts`
Expected: FAIL（manifest 不存在）。

- [ ] **Step 4: 發布**

```bash
python art-factory/starlantern/tools/sl_art.py publish --approved
python art-factory/starlantern/tools/sl_art.py status
find public/assets/games/starlantern -type f | wc -l
```

Expected: `status` 只剩 `published`（以及任何使用者同意暫缺而被 reject 的）；檔案數 = 133 + 1（manifest）。若有 reject 的 id，第一條測試會失敗：這代表遊戲還有色塊，回報給使用者並等他決定補做或接受；接受的話把該測試改成「manifest ⊆ allArtUrls 且缺的 id 清單等於登錄表 rejected 清單」，並在 commit 訊息寫明。

- [ ] **Step 5: 確認通過並檢查 runtime 沒有退件或多餘檔案**

```bash
npx vitest run src/scripts/games/starlantern
python - <<'EOF'
import json, pathlib
r = json.load(open('art-factory/starlantern/registry.json', encoding='utf-8'))['assets']
pub = {('/' + str(p.relative_to('public')).replace('\\', '/')) for p in pathlib.Path('public/assets/games/starlantern').rglob('*.png')}
want = {a['runtime'] for a in r.values() if a.get('status') == 'published'}
print('extra:', sorted(pub - want), 'missing:', sorted(want - pub))
EOF
```

Expected: 測試全過；`extra: [] missing: []`。

- [ ] **Step 6: Commit**

```bash
git add public/assets/games/starlantern art-factory/starlantern src/scripts/games/starlantern/render/published.test.ts
git commit -m "art(starlantern): publish approved art and manifest

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: 數值平衡

**Files:**
- Create: `src/scripts/games/starlantern/engine/sim.ts`
- Test: `src/scripts/games/starlantern/engine/balance.test.ts`
- Modify（依測試結果調整）：`data/enemies.ts`、`data/floors.ts`、`data/characters.ts`、`data/equipment.ts`、`engine/party.ts:11`（`expToNext`）、`engine/encounter.ts:4-6`

**Interfaces:**
- Consumes：`createBattle`、`resolveRound`、`rewards`（`engine/battle.ts`）、`newParty`、`newMember`、`statsOf`、`expToNext`、`learnedSkills`（`engine/party.ts`）、`mulberry32`（`engine/rng.ts`）、`FLOORS`、`ENEMIES`、`SKILLS`。
- Produces：`partyAt(level: number): Party`、`simBattle(party: Party, enemyIds: string[], boss: boolean, seed: number): { outcome: Outcome; rounds: number; hpLoss: number }`、`winRate(level, groups, boss, seeds): { rate: number; hpLoss: number }`、`avgExp(floor: number): number`、`fightsToLevel(exp: number, from: number, to: number): number`。

目標（規格：一輪 30–60 分鐘；計畫一觀察到第一場就全隊升級）：

| # | 目標 |
|---|---|
| 1 | 第 1 層任何一組敵人的經驗，都小於 `expToNext(1)`（第一場不會升級） |
| 2 | 只打第 1 層平均經驗，從 Lv1 到 Lv5 需要 10–18 場 |
| 3 | 第 2 層平均經驗，Lv5→Lv8 需要 10–18 場；第 3 層平均經驗，Lv8→Lv11 需要 10–18 場 |
| 4 | 初始 5 人在建議等級（第 1 層 Lv2、第 2 層 Lv6、第 3 層 Lv9）對該層每一組敵人，40 個種子勝率 ≥ 85%，平均 HP 損失 10%–45% |
| 5 | 等級不足時有風險：Lv4 打第 3 層，勝率 ≤ 60% |
| 6 | 頭目：Lv11 勝率 30%–85%；Lv13 勝率 ≥ 70% |

- [ ] **Step 1: 寫 `sim.ts`**

```ts
import { ENEMIES } from '../data/enemies';
import { FLOORS } from '../data/floors';
import { SKILLS } from '../data/skills';
import { createBattle, resolveRound, type Action, type BattleState, type Outcome } from './battle';
import { expToNext, learnedSkills, newMember, newParty, statsOf } from './party';
import { mulberry32 } from './rng';
import type { CharacterId, Party } from './types';

export function partyAt(level: number): Party {
  const p = newParty();
  for (const id of Object.keys(p.roster) as CharacterId[]) {
    const m = { ...newMember(id), level };
    const s = statsOf(m);
    p.roster[id] = { ...m, hp: s.hp, tp: s.tp };
  }
  return p;
}

/** A plain player: heal when someone is under half HP, else the strongest affordable damage skill, else attack. */
function choose(s: BattleState, party: Party): Record<string, Action> {
  const out: Record<string, Action> = {};
  const foes = s.enemies.filter((e) => e.alive);
  const hurt = s.party.filter((c) => c.alive && c.hp < c.max.hp / 2).sort((a, b) => a.hp - b.hp)[0];
  for (const c of s.party.filter((x) => x.alive)) {
    const target = foes[0]?.key ?? '';
    const id = c.key as CharacterId;
    const skills = learnedSkills(id, party.roster[id].level).filter((sk) => !SKILLS[sk].passive && SKILLS[sk].tp <= c.tp);
    const heal = skills.find((sk) => SKILLS[sk].effects.some((e) => e.kind === 'heal'));
    if (hurt && heal) { out[c.key] = { kind: 'skill', skill: heal, target: hurt.key }; continue; }
    const dmg = skills
      .filter((sk) => SKILLS[sk].effects.some((e) => e.kind === 'damage'))
      .sort((a, b) => power(b) - power(a))[0];
    out[c.key] = dmg ? { kind: 'skill', skill: dmg, target } : { kind: 'attack', target };
  }
  return out;
}

function power(id: string): number {
  return SKILLS[id].effects.reduce((n, e) => n + (e.kind === 'damage' ? e.power * (e.hits ?? 1) : 0), 0);
}

export function simBattle(party: Party, enemyIds: string[], boss: boolean, seed: number): { outcome: Outcome; rounds: number; hpLoss: number } {
  const rng = mulberry32(seed);
  let s = createBattle({ party, enemyIds, boss, inventory: {}, revealed: {} });
  const maxHp = s.party.reduce((n, c) => n + c.max.hp, 0);
  let rounds = 0;
  while (s.outcome === 'ongoing' && rounds < 60) { s = resolveRound(s, choose(s, party), rng); rounds++; }
  const left = s.party.reduce((n, c) => n + Math.max(0, c.hp), 0);
  return { outcome: s.outcome, rounds, hpLoss: 1 - left / maxHp };
}

export function winRate(level: number, groups: string[][], boss: boolean, seeds = 40): { rate: number; hpLoss: number } {
  let wins = 0, loss = 0, n = 0;
  for (const g of groups) for (let k = 1; k <= seeds; k++) {
    const r = simBattle(partyAt(level), g, boss, k * 7919);
    n++; loss += r.hpLoss; if (r.outcome === 'win') wins++;
  }
  return { rate: wins / n, hpLoss: loss / n };
}

export function groupExp(g: string[]): number {
  return g.reduce((n, id) => n + ENEMIES[id].exp, 0);
}

export function avgExp(floor: number): number {
  const gs = FLOORS[floor - 1].encounters;
  return gs.reduce((n, g) => n + groupExp(g), 0) / gs.length;
}

export function fightsToLevel(exp: number, from: number, to: number): number {
  let need = 0;
  for (let l = from; l < to; l++) need += expToNext(l);
  return Math.ceil(need / exp);
}
```

（效果欄位 `kind`、`power`、`hits` 對應 `engine/types.ts:13-21` 的 `Effect` 型別。60 回合打不完算平手，`outcome` 仍是 `ongoing`，計為未勝。）

- [ ] **Step 2: 寫平衡測試（會失敗）**

```ts
import { describe, expect, it } from 'vitest';
import { FLOORS } from '../data/floors';
import { expToNext } from './party';
import { avgExp, fightsToLevel, groupExp, winRate } from './sim';

const groups = (f: number) => FLOORS[f - 1].encounters;

describe('balance', () => {
  it('1. no floor-1 fight levels anyone up on its own', () => {
    for (const g of groups(1)) expect(groupExp(g), g.join('+')).toBeLessThan(expToNext(1));
  });

  it('2-3. levelling pace per floor', () => {
    expect(fightsToLevel(avgExp(1), 1, 5)).toBeGreaterThanOrEqual(10);
    expect(fightsToLevel(avgExp(1), 1, 5)).toBeLessThanOrEqual(18);
    for (const [f, a, b] of [[2, 5, 8], [3, 8, 11]] as const) {
      const n = fightsToLevel(avgExp(f), a, b);
      expect(n, `floor ${f}`).toBeGreaterThanOrEqual(10);
      expect(n, `floor ${f}`).toBeLessThanOrEqual(18);
    }
  });

  it('4. a party at the recommended level wins reliably without trivialising', () => {
    for (const [f, lv] of [[1, 2], [2, 6], [3, 9]] as const) {
      const r = winRate(lv, groups(f), false);
      expect(r.rate, `floor ${f}`).toBeGreaterThanOrEqual(0.85);
      expect(r.hpLoss, `floor ${f}`).toBeGreaterThanOrEqual(0.1);
      expect(r.hpLoss, `floor ${f}`).toBeLessThanOrEqual(0.45);
    }
  });

  it('5. under-levelled parties are at risk on floor 3', () => {
    expect(winRate(4, groups(3), false).rate).toBeLessThanOrEqual(0.6);
  });

  it('6. the boss is a real fight', () => {
    const lo = winRate(11, [['lanterneater']], true).rate;
    expect(lo).toBeGreaterThanOrEqual(0.3);
    expect(lo).toBeLessThanOrEqual(0.85);
    expect(winRate(13, [['lanterneater']], true).rate).toBeGreaterThanOrEqual(0.7);
  });
});
```

Run: `npx vitest run src/scripts/games/starlantern/engine/balance.test.ts`
Expected: 至少第 1 條失敗（目前 `['bat','bat','slime']` 經驗 18 ≥ 15）。把每條的實際數值記下來（可暫時加 `console.log`，調完移除）。

- [ ] **Step 3: 調整數值直到全綠**

調整順序（每次只動一類，重跑測試）：
1. `expToNext`（`engine/party.ts:11`）的係數與指數，先滿足第 1–3 條。
2. 各層敵人 `stats`（`data/enemies.ts`），滿足第 4、5 條。
3. 頭目 `stats`，滿足第 6 條。
4. 若第 4 條 HP 損失過低，提高敵人 `atk`；過高則降低。

不改測試的目標數字。若某條在合理範圍內調不出來，停下來回報實際數值與嘗試過的組合，讓使用者決定目標。

- [ ] **Step 4: 全套測試**

Run: `npx vitest run`
Expected: 全過。計畫一有寫死經驗或傷害數值的測試若因此失敗，只改那些測試的期望值，並在 commit 訊息列出被改的測試名稱。

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/starlantern
git commit -m "balance(starlantern): simulation-backed levelling and difficulty targets

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: e2e、實機截圖與交付

**Files:**
- Modify: `tests/e2e/starlantern.spec.ts`
- Modify: `tmp/starlantern/shots.mjs`（不入庫）

- [ ] **Step 1: 在 e2e 主流程加素材檢查（先失敗再過）**

在第一個測試開頭（`page.goto` 前）加：

```ts
  const badArt: string[] = [];
  page.on('response', (r) => { if (r.url().includes('/assets/games/starlantern/') && r.status() >= 400) badArt.push(`${r.status()} ${r.url()}`); });
```

城鎮階段斷言後加：

```ts
  await expect(page.locator('.sl-card .sl-standee').first()).toBeVisible();
```

戰鬥階段（phase 變成 `battle` 之後）加：

```ts
  await expect(page.locator('#sl-battle .sl-portrait').first()).toBeVisible();
```

測試結尾加 `expect(badArt).toEqual([]);`。

先暫時把 `public/assets/games/starlantern/manifest.json` 改名，跑 e2e 確認 `.sl-standee` 斷言失敗（證明測試有效），再改回來。

Run: `E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`
Expected: 改名時 FAIL；改回後 2 passed。

- [ ] **Step 2: 實機截圖**：`node tmp/starlantern/shots.mjs tmp/starlantern/shots-final http://127.0.0.1:4354`（headless、`--mute-audio`），用 Read 看城鎮、地圖、戰鬥、結算、通關 5 張，確認：圖塊拼接無明顯接縫、角色與敵人沒有 magenta 邊、頭貼受傷與倒下狀態正確、介面框不變形。發現問題就回到對應 Task 修正。

- [ ] **Step 3: 全套驗證**

```bash
npx vitest run
python -m pytest art-factory/starlantern/tools -q
npx tsc --noEmit -p . 2>&1 | grep -c starlantern
E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium
grep -rn '!important' src/styles/_starlantern.scss; grep -rn 'style=' src/scripts/games/starlantern src/pages/games/starlantern.astro
```

Expected: vitest 全過；pytest 全過；tsc 計數 0；e2e 2 passed；兩個 grep 沒有輸出。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/starlantern.spec.ts
git commit -m "test(starlantern): e2e checks published art loads without errors

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 5: 交付**：派 fresh-context 審查代理（最強模型）審整個計畫二的 diff，依 executing-plans 的 Final Review 規則處理；之後給使用者 http://127.0.0.1:4354/games/starlantern 試玩連結與截圖，並列出所有 ruling 與延後的小問題。
