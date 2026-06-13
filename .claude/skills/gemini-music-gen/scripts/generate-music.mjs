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
