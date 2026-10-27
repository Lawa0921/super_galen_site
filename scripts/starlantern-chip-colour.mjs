#!/usr/bin/env node
/**
 * 星燈迷宮: the search for a new ailment chip colour (roster plan B9, the coordinator's ruling on forget, 2026-10-26).
 *
 *   node scripts/starlantern-chip-colour.mjs [ailment-key-to-replace=forget]
 *
 * The search itself is src/scripts/games/starlantern/render/chipColour.ts (pure; its words give every condition, the hue
 * window inclusive at both ends), held by render/chipColour.test.ts. This reads the chips from the stylesheet and the
 * affix ink from render/ailmentStyle.ts, and prints the ten candidates nearest the art's colour (#8FD9B6), best first,
 * each with its three nearest chips; the first is the pick. Needs Node 23.6 or later (it imports the .ts directly).
 */
import { readFileSync } from 'node:fs';
import { chipCandidates, chipSetOf, lchOf } from '../src/scripts/games/starlantern/render/chipColour.ts';

const ART = '8fd9b6';
const key = process.argv[2] ?? 'forget';
const scss = readFileSync('src/styles/_starlantern-ui.scss', 'utf8');
const affix = Number.parseInt(/AFFIX_FILL = 0x([0-9a-f]{6})/.exec(readFileSync('src/scripts/games/starlantern/render/ailmentStyle.ts', 'utf8'))[1], 16);
const out = chipCandidates(chipSetOf(scss, affix, key, ART));
const [artL, artC] = lchOf(ART);
console.log(`art #${ART}: L* ${artL.toFixed(1)} C* ${artC.toFixed(1)}; ${out.length} candidates`);
for (const c of out.slice(0, 10)) {
  console.log(`#${c.hex} ΔE to art ${c.art.toFixed(1)}  L*${c.L.toFixed(1)} C*${c.C.toFixed(1)} h${c.H.toFixed(0)}  nearest: ${c.near.map(([k, d]) => `${k} ${d.toFixed(1)}`).join(', ')}`);
}
