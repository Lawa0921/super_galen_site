#!/usr/bin/env node
// Gemini / Lyria 3 音樂生成 CLI。Lyria 3 經 :generateContent 直接回傳 audio/mpeg(mp3)。
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** node:https-based POST that bypasses undici/fetch WSL2 IPv6 timeout issues */
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
          const sc = res.statusCode;
          resolve({ status: sc, ok: sc >= 200 && sc < 300, json: () => JSON.parse(Buffer.concat(chunks).toString()) });
        });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

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
  const res = await httpsPost(url, buildBody(prompt, opts));
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
