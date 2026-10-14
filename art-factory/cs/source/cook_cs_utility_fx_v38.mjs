// V38 utility FX atlas: deterministic channel-pack of six Kenney "Particle Pack" CC0 masks.
// Usage: node art-factory/cs/source/cook_cs_utility_fx_v38.mjs
// Each source is a white sprite with alpha; its mask = alpha * luminance. Masks are
// Lanczos-resized to 256 px, auto-levelled to peak 255 and packed into RGB (no alpha, so browser premultiplication
// cannot destroy packed channels): tile 0 = smoke_07 / smoke_04 / smoke_10 (ring),
// tile 1 = dirt_02 / scorch_01 / fire_02. Output: lossless WebP 512x256, linear data.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const run = 'art-factory/cs/runs/run-20261010-v38-utility-fx';
const raw = `${run}/raw/third-party/kenney-particle-pack`;
const output = 'public/assets/games/cs/fx/utility-masks.webp';
const TILE = 256, LAYOUT = [['smoke_07', 'smoke_04', 'smoke_10'], ['dirt_02', 'scorch_01', 'fire_02']];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const atlas = Buffer.alloc(TILE * 2 * TILE * 3);
const sources = {}, masks = {};
for (let tile = 0; tile < 2; tile++) for (let channel = 0; channel < 3; channel++) {
  const name = LAYOUT[tile][channel], file = `${raw}/${name}.png`, bytes = await readFile(file);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    mask[i] = Math.round(a * (.2126 * r + .7152 * g + .0722 * b) / 255);
  }
  const small = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } }).resize(TILE, TILE, { kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer();
  if (small.length !== TILE * TILE) throw Error(`${name}: unexpected channel count`);
  // Auto-level: stretch each mask so its peak is 255 (the soft smoke sprites peak near
  // 150-170), keeping 8-bit precision; opacity is set by the shader, not the texture.
  const sourcePeak = small.reduce((m, v) => Math.max(m, v), 0);
  for (let i = 0; i < small.length; i++) small[i] = Math.min(255, Math.round(small[i] * 255 / sourcePeak));
  let border = 0, sum = 0, covered = 0;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const v = small[y * TILE + x]; sum += v; if (v > 8) covered++;
    if (x < 4 || y < 4 || x >= TILE - 4 || y >= TILE - 4) border = Math.max(border, v);
    atlas[(y * TILE * 2 + tile * TILE + x) * 3 + channel] = v;
  }
  sources[name] = { path: file, sha256: sha(bytes), bytes: bytes.length, size: [info.width, info.height] };
  masks[name] = { tile, source_peak: sourcePeak, channel: 'rgb'[channel], border_max: border, mean: +(sum / TILE / TILE).toFixed(2), coverage: +(covered / TILE / TILE).toFixed(4), peak: small.reduce((m, v) => Math.max(m, v), 0) };
}
const webp = await sharp(atlas, { raw: { width: TILE * 2, height: TILE, channels: 3 } }).webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
// Round-trip: lossless must decode to the exact packed bytes.
const decoded = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
const exact = decoded.info.channels === 3 && decoded.data.equals(atlas);
await writeFile(output, webp);
await mkdir(`${run}/qa`, { recursive: true });
const preview = Buffer.alloc(TILE * 6 * TILE * 3);
for (let k = 0; k < 6; k++) for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
  const v = atlas[(y * TILE * 2 + Math.floor(k / 3) * TILE + x) * 3 + k % 3];
  for (let c = 0; c < 3; c++) preview[(y * TILE * 6 + k * TILE + x) * 3 + c] = v;
}
await sharp(preview, { raw: { width: TILE * 6, height: TILE, channels: 3 } }).png().toFile(`${run}/qa/utility-masks-preview.png`);
const gates = {
  dimensions: decoded.info.width === 512 && decoded.info.height === 256,
  lossless_round_trip: exact,
  no_edge_touching: Object.values(masks).every(m => m.border_max <= 6),
  non_empty: Object.values(masks).every(m => m.peak >= 200 && m.coverage > .05),
  budget_bytes: webp.length <= 200_000,
};
const report = { asset: output, bytes: webp.length, sha256: sha(webp), color_space: 'linear data (THREE.NoColorSpace)', layout: LAYOUT, sources, masks, gates, pass: Object.values(gates).every(Boolean) };
await writeFile(`${run}/qa/mechanical-qa.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ bytes: report.bytes, sha256: report.sha256, gates, masks }, null, 1));
if (!report.pass) process.exitCode = 1;
