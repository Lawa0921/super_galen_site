import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, resolveOutputPath, buildBody, extractAudioPart, loadKey, MODELS } from './generate-music.mjs';

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

test('loadKey：explicit/--key 優先', () => {
  assert.equal(loadKey('abc'), 'abc');
});

test('loadKey：從 homedir 的 .gemini/.env 讀並去除外層引號', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmgen-'));
  fs.mkdirSync(path.join(dir, '.gemini'));
  fs.writeFileSync(path.join(dir, '.gemini', '.env'), 'GEMINI_API_KEY="quoted-key-123"\n');
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY; // 避免被環境變數搶先
  try {
    assert.equal(loadKey(undefined, dir), 'quoted-key-123');
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
