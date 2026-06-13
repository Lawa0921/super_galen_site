# Dungeon Arcade BGM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用既有 Gemini key（Lyria 3）生成 `/games` 街機 BGM，預生成 mp3 commit 進 repo，網頁用預設靜音＋🔊 開關的 `ArcadeBgm` 元件播放。

**Architecture:** 一個純 Node skill（`gemini-music-gen`）呼叫 Lyria 3 `:generateContent`（`responseModalities:['AUDIO']`）直接取得 mp3，可選用 ffmpeg 做響度正規化／防 click；mp3 存進 `public/assets/games/bgm/`。網頁端一個自我封裝的 `ArcadeBgm.astro`（fixed 右下角霓虹 toggle + `<audio loop>` + localStorage + 淡入淡出），各 /games 頁傳入自己的 track。

**Tech Stack:** Node 內建 fetch / `node:test` / Astro 元件 + scoped CSS + vanilla JS / Playwright e2e / ffmpeg(libmp3lame)。

**Phase 0（可行性探針）已完成**：`lyria-3-clip-preview:generateContent` + `{contents:[{parts:[{text}]}],generationConfig:{responseModalities:['AUDIO']}}` → 回傳 `candidates[0].content.parts[]`（一個 text + 一個 `inlineData` `mimeType:"audio/mpeg"` 的 base64），實測為 stereo 44.1kHz / ~30.8s / ~193kbps 的合法 mp3。探針檔在 `.research/lyria-probe.mjs`（scratch，不 commit）。

---

## File Structure

**新增**
- `.claude/skills/gemini-music-gen/scripts/generate-music.mjs` — CLI + 可單元測試的純函式（`parseArgs`/`resolveOutputPath`/`loadKey`/`buildBody`/`extractAudioPart`）+ `main()`。
- `.claude/skills/gemini-music-gen/scripts/generate-music.test.mjs` — `node:test` 純函式測試（不打網路）。
- `.claude/skills/gemini-music-gen/SKILL.md` — frontmatter + 用法。
- `src/components/ArcadeBgm.astro` — 播放器元件（toggle + audio + script）。
- `tests/e2e/games-bgm.spec.ts` — 播放器 e2e。
- `public/assets/games/bgm/arcade.mp3`（Task 2）、`tetris.mp3`/`bomber.mp3`/`witchrun.mp3`（Task 6）。

**修改**
- `src/pages/games/index.astro`（Task 5）、`tetris.astro`/`bomber.astro`/`witchrun.astro`（Task 6）— 加入 `<ArcadeBgm>`。

---

## Task 1: skill 純函式 + 單元測試（TDD）

**Files:**
- Create: `.claude/skills/gemini-music-gen/scripts/generate-music.mjs`
- Test: `.claude/skills/gemini-music-gen/scripts/generate-music.test.mjs`

- [ ] **Step 1: 先寫純函式骨架（只 export，main 之後補）**

寫入 `generate-music.mjs`：

```js
#!/usr/bin/env node
// Gemini / Lyria 3 音樂生成 CLI。Lyria 3 經 :generateContent 直接回傳 audio/mpeg(mp3)。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const MODELS = { clip: 'lyria-3-clip-preview', pro: 'lyria-3-pro-preview' };
export const DEFAULT_DIR = 'public/assets/games/bgm';

export function parseArgs(argv) {
  const a = { _: [], model: 'clip', mp3Bitrate: '192k', webloop: false, normalize: false, keepRaw: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--model') a.model = argv[++i];
    else if (t === '--seed') a.seed = Number(argv[++i]);
    else if (t === '--negative') a.negative = argv[++i];
    else if (t === '--key') a.key = argv[++i];
    else if (t === '--mp3-bitrate') a.mp3Bitrate = argv[++i];
    else if (t === '--webloop') a.webloop = true;
    else if (t === '--normalize') a.normalize = true;
    else if (t === '--keep-raw') a.keepRaw = true;
    else if (t === '--help' || t === '-h') a.help = true;
    else a._.push(t);
  }
  return a;
}

export function resolveOutputPath(arg, cwd = process.cwd()) {
  if (path.isAbsolute(arg)) return arg;
  if (arg.includes('/')) return path.resolve(cwd, arg);
  return path.resolve(cwd, DEFAULT_DIR, arg);
}

export function loadKey(explicit, homedir = os.homedir()) {
  if (explicit) return explicit;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const txt = fs.readFileSync(path.join(homedir, '.gemini', '.env'), 'utf-8');
  const m = txt.match(/GEMINI_API_KEY=(.*)/);
  if (!m) throw new Error('GEMINI_API_KEY not found (--key / env / ~/.gemini/.env)');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

export function buildBody(prompt, { negative, seed } = {}) {
  const text = negative ? `${prompt}. Avoid: ${negative}.` : prompt;
  const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'] } };
  if (typeof seed === 'number' && !Number.isNaN(seed)) body.generationConfig.seed = seed;
  return body;
}

export function extractAudioPart(json) {
  if (json && json.error) throw new Error('API error: ' + JSON.stringify(json.error));
  const parts = (json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
  const audio = parts.find((p) => p.inlineData && /audio|mpeg|mp3|wav|pcm/i.test(p.inlineData.mimeType || ''));
  if (!audio) throw new Error('no audio part in response');
  return { buffer: Buffer.from(audio.inlineData.data, 'base64'), mime: audio.inlineData.mimeType };
}
```

- [ ] **Step 2: 寫失敗測試**

寫入 `generate-music.test.mjs`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseArgs, resolveOutputPath, buildBody, extractAudioPart, MODELS } from './generate-music.mjs';

test('parseArgs 解析旗標與位置參數', () => {
  const a = parseArgs(['my prompt', 'arcade.mp3', '--model', 'pro', '--seed', '7', '--webloop', '--normalize']);
  assert.deepEqual(a._, ['my prompt', 'arcade.mp3']);
  assert.equal(a.model, 'pro');
  assert.equal(a.seed, 7);
  assert.equal(a.webloop, true);
  assert.equal(a.normalize, true);
});

test('resolveOutputPath：裸檔名 → 預設 bgm 目錄', () => {
  assert.equal(resolveOutputPath('arcade.mp3', '/proj'), path.resolve('/proj/public/assets/games/bgm/arcade.mp3'));
});
test('resolveOutputPath：相對路徑 → 從 cwd', () => {
  assert.equal(resolveOutputPath('tmp/x.mp3', '/proj'), path.resolve('/proj/tmp/x.mp3'));
});
test('resolveOutputPath：絕對路徑照用', () => {
  assert.equal(resolveOutputPath('/abs/x.mp3', '/proj'), '/abs/x.mp3');
});

test('buildBody：基本形狀 + responseModalities AUDIO', () => {
  const b = buildBody('hello');
  assert.deepEqual(b.contents[0].parts[0], { text: 'hello' });
  assert.deepEqual(b.generationConfig.responseModalities, ['AUDIO']);
});
test('buildBody：negative 併入文字、seed 進 generationConfig', () => {
  const b = buildBody('hello', { negative: 'vocals', seed: 3 });
  assert.match(b.contents[0].parts[0].text, /Avoid: vocals/);
  assert.equal(b.generationConfig.seed, 3);
});

test('extractAudioPart：抓出 inlineData 音訊', () => {
  const b64 = Buffer.from('ID3test').toString('base64');
  const json = { candidates: [{ content: { parts: [{ text: 'desc' }, { inlineData: { mimeType: 'audio/mpeg', data: b64 } }] } }] };
  const { buffer, mime } = extractAudioPart(json);
  assert.equal(mime, 'audio/mpeg');
  assert.equal(buffer.toString(), 'ID3test');
});
test('extractAudioPart：無音訊則丟錯', () => {
  assert.throws(() => extractAudioPart({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }), /no audio/);
});

test('MODELS 別名', () => {
  assert.equal(MODELS.clip, 'lyria-3-clip-preview');
  assert.equal(MODELS.pro, 'lyria-3-pro-preview');
});
```

- [ ] **Step 3: 跑測試確認通過**

Run: `node --test .claude/skills/gemini-music-gen/scripts/generate-music.test.mjs`
Expected: 全部 PASS（純函式已在 Step 1 寫好；若有 fail 依訊息修 `generate-music.mjs`）。

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/gemini-music-gen/scripts/generate-music.mjs .claude/skills/gemini-music-gen/scripts/generate-music.test.mjs
git commit -m "feat(skill): gemini-music-gen 純函式 + node:test 單元測試"
```

---

## Task 2: skill main() + 產出 arcade.mp3

**Files:**
- Modify: `.claude/skills/gemini-music-gen/scripts/generate-music.mjs`（補 `generate()`/`main()`）
- Create: `public/assets/games/bgm/arcade.mp3`

- [ ] **Step 1: 在 generate-music.mjs 末端補上 generate() 與 main()**

接在 `extractAudioPart` 之後新增：

```js
function probeDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString().trim();
  return parseFloat(out);
}

function ffmpegPost(input, output, opts) {
  const filters = [];
  if (opts.webloop) {
    const dur = probeDuration(input);
    const outStart = Math.max(0, dur - 0.25);
    filters.push('afade=t=in:st=0:d=0.03', `afade=t=out:st=${outStart.toFixed(3)}:d=0.25`);
  }
  if (opts.normalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  const args = ['-y', '-i', input];
  if (filters.length) args.push('-af', filters.join(','));
  args.push('-c:a', 'libmp3lame', '-b:a', opts.mp3Bitrate, output);
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}

export async function generate(prompt, outPath, opts) {
  const key = loadKey(opts.key);
  const model = MODELS[opts.model] || opts.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody(prompt, opts)),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json.error || json).slice(0, 300)}`);
  const { buffer, mime } = extractAudioPart(json);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const needPost = opts.webloop || opts.normalize || mime !== 'audio/mpeg';
  if (needPost) {
    const raw = outPath + '.raw.mp3';
    fs.writeFileSync(raw, buffer);
    ffmpegPost(raw, outPath, opts);
    if (!opts.keepRaw) fs.unlinkSync(raw);
  } else {
    fs.writeFileSync(outPath, buffer);
  }
  return { outPath, bytes: fs.statSync(outPath).size };
}

const HELP = `gemini-music-gen — Lyria 3 BGM 生成
用法: node generate-music.mjs "<prompt>" <output> [--model clip|pro] [--seed N]
      [--negative "..."] [--webloop] [--normalize] [--mp3-bitrate 192k] [--key K]
輸出: 裸檔名→public/assets/games/bgm/；相對→cwd；絕對→照用`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts._.length < 2) { console.log(HELP); process.exit(opts.help ? 0 : 1); }
  const [prompt, outArg] = opts._;
  const outPath = resolveOutputPath(outArg);
  console.log(`🎵 generating (${MODELS[opts.model] || opts.model}) → ${outPath}`);
  const { bytes } = await generate(prompt, outPath, opts);
  console.log(`✅ done: ${outPath} (${(bytes / 1024).toFixed(0)} KB)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('❌', e.message); process.exit(1); });
}
```

- [ ] **Step 2: 重跑單元測試確認沒被 main 破壞**

Run: `node --test .claude/skills/gemini-music-gen/scripts/generate-music.test.mjs`
Expected: 仍全部 PASS（`import.meta.url` 守衛確保 import 時不執行 main）。

- [ ] **Step 3: 生成街機廳 BGM**

Run（從 repo 根目錄）：
```bash
node .claude/skills/gemini-music-gen/scripts/generate-music.mjs \
  "Upbeat retro arcade chiptune-synthwave loop, bright square-wave arpeggios, punchy 4-on-the-floor bass, neon insert-coin energy, instrumental, seamless loop, ~30s" \
  arcade.mp3 --normalize
```
Expected: 印出 `✅ done: .../public/assets/games/bgm/arcade.mp3 (約 600-800 KB)`。

- [ ] **Step 4: 驗證輸出是合法 mp3（~30s, stereo）**

Run: `ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,channels -of default=nw=1 public/assets/games/bgm/arcade.mp3`
Expected: `codec_name=mp3`、`channels=2`、`duration` 介於 25–35 秒。
若不滿意曲風：重跑 Step 3（可換 prompt 或加 `--seed`），人工試聽挑版本。

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/gemini-music-gen/scripts/generate-music.mjs public/assets/games/bgm/arcade.mp3
git commit -m "feat(skill): gemini-music-gen 生成端 + 街機廳 BGM"
```

---

## Task 3: SKILL.md

**Files:**
- Create: `.claude/skills/gemini-music-gen/SKILL.md`

- [ ] **Step 1: 寫 SKILL.md**

```markdown
---
name: gemini-music-gen
description: Generate background music (BGM) / instrumental music loops for the SuperGalen site via Google Gemini's Lyria 3 models. Use when the user asks to generate, create, or compose music / BGM / a soundtrack / a looping track (e.g. for the /games arcade or game pages). Pure-Node wrapper around the Lyria 3 generateContent API; outputs ready-to-use mp3. NOT for sound effects (games use Web Audio synthesis) or speech (use a TTS path).
---

# Gemini Music Generation (Lyria 3)

Pure-Node wrapper around Lyria 3 (`lyria-3-clip-preview` / `lyria-3-pro-preview`) via the
Gemini `:generateContent` API. Lyria returns a ready-to-use **mp3** (stereo 44.1kHz, ~30s)
directly — no transcode needed for basic use.

## Pre-flight
- API key chain: `--key` → `process.env.GEMINI_API_KEY` → `~/.gemini/.env` (`GEMINI_API_KEY=…`).
- `ffmpeg`/`ffprobe` only needed for `--normalize` / `--webloop`.
- Run from project root so bare filenames resolve into `public/assets/games/bgm/`.

## Command
\`\`\`bash
node .claude/skills/gemini-music-gen/scripts/generate-music.mjs \
  "<style prompt>" <output> \
  [--model clip|pro] [--seed N] [--negative "..."] \
  [--webloop] [--normalize] [--mp3-bitrate 192k] [--key K]
\`\`\`

- Output path: absolute → as-is; has `/` → from cwd; bare name → `public/assets/games/bgm/`.
- `--model clip` (default, 30s) / `pro` (higher quality).
- `--normalize`: loudnorm to -16 LUFS (consistent levels across tracks).
- `--webloop`: short fade in/out to avoid clicks at the `<audio loop>` seam.
- `--seed`: best-effort reproducibility (may be ignored by the model).

## Prompt tips
Always instrumental + "seamless loop" + a clear genre/mood + tempo feel. Keep tracks in one
sonic palette so a multi-page soundtrack feels unified.

## Tests
`node --test .claude/skills/gemini-music-gen/scripts/generate-music.test.mjs` (pure helpers, no network).
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/gemini-music-gen/SKILL.md
git commit -m "docs(skill): gemini-music-gen SKILL.md"
```

---

## Task 4: ArcadeBgm 播放器元件

**Files:**
- Create: `src/components/ArcadeBgm.astro`

- [ ] **Step 1: 寫元件**

```astro
---
interface Props { track: string; }
const { track } = Astro.props;
---
<div class="arcade-bgm">
  <button class="arcade-bgm-toggle" type="button" aria-pressed="false" aria-label="切換背景音樂 Toggle background music">
    <span class="arcade-bgm-icon" aria-hidden="true">🔇</span>
  </button>
  <audio class="arcade-bgm-audio" loop preload="none" src={track}></audio>
</div>

<style>
  .arcade-bgm { position: fixed; right: 18px; bottom: 18px; z-index: 9000; }
  .arcade-bgm-toggle {
    width: 46px; height: 46px; border-radius: 50%;
    border: 1px solid #36e6ff; background: rgba(8, 14, 22, 0.72);
    color: #36e6ff; cursor: pointer; display: grid; place-items: center;
    font-size: 18px; line-height: 1; opacity: 0.55;
    transition: opacity 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }
  .arcade-bgm-toggle:hover { opacity: 1; }
  .arcade-bgm-toggle[aria-pressed="true"] {
    opacity: 1; background: rgba(54, 230, 255, 0.16);
    box-shadow: 0 0 14px rgba(54, 230, 255, 0.55);
  }
  .arcade-bgm-toggle:focus-visible { outline: 2px solid #36e6ff; outline-offset: 3px; }
</style>

<script>
  const KEY = 'arcade-bgm';
  function initArcadeBgm() {
    const root = document.querySelector('.arcade-bgm');
    if (!root) return;
    const btn = root.querySelector('.arcade-bgm-toggle');
    const audio = root.querySelector('.arcade-bgm-audio');
    const icon = root.querySelector('.arcade-bgm-icon');
    const VOL = 0.5;
    let on = false;
    audio.volume = 0;

    function readPref() { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } }
    function writePref(v) { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {} }

    let raf = 0;
    function fade(target) {
      cancelAnimationFrame(raf);
      const start = audio.volume; const t0 = performance.now(); const dur = 600;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        audio.volume = start + (target - start) * k;
        if (k < 1) raf = requestAnimationFrame(step);
        else if (target === 0) audio.pause();
      };
      raf = requestAnimationFrame(step);
    }
    function paint() {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      icon.textContent = on ? '🔊' : '🔇';
    }
    function setOn(v) {
      on = v; paint();
      if (v) {
        const p = audio.play();
        if (p && p.catch) p.catch(() => { on = false; paint(); });
        fade(VOL);
      } else {
        fade(0);
      }
    }
    btn.addEventListener('click', () => { const next = !on; writePref(next); setOn(next); });
    if (readPref()) setOn(true); // 跨頁延續；被擋住時 catch 還原視覺
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initArcadeBgm);
  else initArcadeBgm();
</script>
```

- [ ] **Step 2: 型別檢查通過（astro check 或 build 不報錯）**

Run: `npx astro check 2>&1 | tail -5`
Expected: 無新增關於 `ArcadeBgm.astro` 的錯誤（既有警告可忽略）。

- [ ] **Step 3: Commit**

```bash
git add src/components/ArcadeBgm.astro
git commit -m "feat(games): ArcadeBgm 播放器元件（toggle + audio + localStorage）"
```

---

## Task 5: e2e（先紅）+ 整合進 /games（後綠）

**Files:**
- Create: `tests/e2e/games-bgm.spec.ts`
- Modify: `src/pages/games/index.astro`

- [ ] **Step 1: 寫失敗 e2e**

寫入 `tests/e2e/games-bgm.spec.ts`：

```ts
import { test, expect } from '@playwright/test';

const BASE = '/games';

test.describe('Dungeon Arcade BGM', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.removeItem('arcade-bgm'); } catch {} });
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
  });

  test('toggle 預設關閉、音訊暫停', async ({ page }) => {
    const btn = page.locator('.arcade-bgm-toggle');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(await page.locator('.arcade-bgm-audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  });

  test('點擊 → 播放 + 寫入 localStorage on', async ({ page }) => {
    const btn = page.locator('.arcade-bgm-toggle');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('arcade-bgm'))).toBe('on');
    await expect.poll(() => page.locator('.arcade-bgm-audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  });

  test('再點擊 → 關閉 + localStorage off', async ({ page }) => {
    const btn = page.locator('.arcade-bgm-toggle');
    await btn.click();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => localStorage.getItem('arcade-bgm'))).toBe('off');
  });

  test('BGM 音檔可載入（200 + audio mime）', async ({ page, request }) => {
    const src = await page.locator('.arcade-bgm-audio').getAttribute('src');
    expect(src).toBeTruthy();
    const res = await request.get(src as string);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/audio|mpeg|octet-stream/);
  });
});
```

- [ ] **Step 2: 跑 e2e 確認失敗**

Run: `npx playwright test games-bgm --project=chromium 2>&1 | tail -15`
Expected: FAIL（`.arcade-bgm-toggle` 不存在，因為還沒整合進頁面）。

- [ ] **Step 3: 把元件加進 games/index.astro**

在 `src/pages/games/index.astro` 第 6-7 行的 import 區塊後加入元件 import：

```astro
import BaseLayout from '@components/layout/BaseLayout.astro';
import ArcadeBgm from '@components/ArcadeBgm.astro';
import { defaultLang, type Language } from '@i18n/index';
```

並在 `</main>` 之後、`</BaseLayout>` 之前插入：

```astro
  </main>

  <ArcadeBgm track="/assets/games/bgm/arcade.mp3" />
</BaseLayout>
```

- [ ] **Step 4: 跑 e2e 確認通過**

Run: `npx playwright test games-bgm --project=chromium 2>&1 | tail -15`
Expected: 4 個測試全 PASS。

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/games-bgm.spec.ts src/pages/games/index.astro
git commit -m "feat(games): /games 街機廳整合 ArcadeBgm + e2e"
```

---

## Task 6: 補三款遊戲曲 + 整合三頁

**Files:**
- Create: `public/assets/games/bgm/tetris.mp3`、`bomber.mp3`、`witchrun.mp3`
- Modify: `src/pages/games/tetris.astro`、`bomber.astro`、`witchrun.astro`
- Modify: `tests/e2e/games-bgm.spec.ts`

- [ ] **Step 1: 生成三首（統一音色、各自情緒）**

```bash
node .claude/skills/gemini-music-gen/scripts/generate-music.mjs \
  "Tense propulsive chiptune-synthwave puzzle loop, driving 4/4 bass, fast hi-hats, focused adrenaline, neon arcade palette, instrumental, seamless loop, ~30s" \
  tetris.mp3 --normalize

node .claude/skills/gemini-music-gen/scripts/generate-music.mjs \
  "Groovy dungeon-crawl chiptune loop, bouncy percussive bass, playful mischievous melody, torch-lit arcade palette, instrumental, seamless loop, ~30s" \
  bomber.mp3 --normalize

node .claude/skills/gemini-music-gen/scripts/generate-music.mjs \
  "Frantic witchy bullet-hell chiptune-synthwave loop, fast minor arpeggios, urgent driving drums, eerie neon energy, instrumental, seamless loop, ~30s" \
  witchrun.mp3 --normalize
```
試聽三首；不滿意的重生。

- [ ] **Step 2: 驗證三檔皆合法 mp3**

Run: `for f in tetris bomber witchrun; do ffprobe -v error -show_entries format=duration -show_entries stream=codec_name -of default=nw=1 public/assets/games/bgm/$f.mp3; done`
Expected: 三檔皆 `codec_name=mp3` 且 duration 25–35 秒。

- [ ] **Step 3: 三頁各加入元件**

三頁皆用 `BaseLayout`（import 自 `@components/layout/BaseLayout.astro`）並以 `</BaseLayout>` 收尾，插法一致。各頁：
（a）在既有 `import BaseLayout ...` 那行之後加：
```astro
import ArcadeBgm from '@components/ArcadeBgm.astro';
```
（b）在 `</BaseLayout>` 那行之前插入對應 track（用 Edit，`old_string` 取該頁的 `</BaseLayout>` 前一行＋`</BaseLayout>` 以定位）：

| 檔案 | BaseLayout import 行 | `</BaseLayout>` 行 | 插入 |
|---|---|---|---|
| `src/pages/games/tetris.astro` | L6 | L226 | `<ArcadeBgm track="/assets/games/bgm/tetris.mp3" />` |
| `src/pages/games/bomber.astro` | L7 | L276 | `<ArcadeBgm track="/assets/games/bgm/bomber.mp3" />` |
| `src/pages/games/witchrun.astro` | L6 | L67 | `<ArcadeBgm track="/assets/games/bgm/witchrun.mp3" />` |

範例（tetris.astro，Edit 前先 `Read` 對齊行號，因前面步驟可能已使行號位移）：
```astro
  <ArcadeBgm track="/assets/games/bgm/tetris.mp3" />
</BaseLayout>
```

- [ ] **Step 4: 擴充 e2e 覆蓋三頁**

在 `tests/e2e/games-bgm.spec.ts` 的 `test.describe(...)` 區塊收尾 `});` **之後**、檔案最末端，新增 top-level 迴圈：

```ts
for (const [name, p] of [['tetris', '/games/tetris'], ['bomber', '/games/bomber'], ['witchrun', '/games/witchrun']] as const) {
  test(`${name} 頁有 BGM toggle 且預設關閉`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.removeItem('arcade-bgm'); } catch {} });
    await page.goto(p);
    await page.waitForLoadState('domcontentloaded');
    const btn = page.locator('.arcade-bgm-toggle');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    const src = await page.locator('.arcade-bgm-audio').getAttribute('src');
    expect(src).toContain(`/assets/games/bgm/${name}.mp3`);
  });
}
```

- [ ] **Step 5: 跑全部 BGM e2e 確認通過**

Run: `npx playwright test games-bgm --project=chromium 2>&1 | tail -20`
Expected: 全 PASS（原 4 個 + 3 個分頁）。

- [ ] **Step 6: Commit**

```bash
git add public/assets/games/bgm/tetris.mp3 public/assets/games/bgm/bomber.mp3 public/assets/games/bgm/witchrun.mp3 \
  src/pages/games/tetris.astro src/pages/games/bomber.astro src/pages/games/witchrun.astro tests/e2e/games-bgm.spec.ts
git commit -m "feat(games): 三款遊戲頁 BGM + e2e 覆蓋"
```

---

## 完成後

- 在 `feat/arcade-bgm` 分支上累積以上 commit。
- 全部完成後跑一次 `npx playwright test games-bgm --project=chromium` + `node --test .claude/skills/gemini-music-gen/scripts/generate-music.test.mjs` 綠燈。
- 提供 `http://localhost:4321/games/` 驗收 URL（點右下角 🔊 試聽）。
- 由使用者決定是否 merge / push（沿用先前流程）。

## 驗證對照（spec coverage）
- skill（Lyria 3, key 鏈, mp3 輸出, normalize/webloop）→ Task 1-3 ✅
- 播放器（預設靜音, 🔊 toggle, localStorage, 淡入淡出, 自動播放降級）→ Task 4 ✅
- 整合 /games + 三頁 → Task 5-6 ✅
- 4 首主題曲 → Task 2 + Task 6 ✅
- TDD（skill 單元測試 + e2e 先紅後綠）→ Task 1 / Task 5 ✅
- 預生成靜態檔 commit → Task 2 / Task 6 commit mp3 ✅
