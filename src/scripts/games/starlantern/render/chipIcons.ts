import { SKILLS } from '../data/skills';
import { T } from '../data/text.zh-TW';
import type { AilmentShown } from '../engine/ailments';
import type { MechWord } from '../engine/mechanics/index';
import { MECH_ICON_KEYS, art, type MechIconKey } from './artPaths';

export { MECH_ICON_KEYS };

/**
 * The 14px icon in front of an ailment or mechanic word (art step 9, G4; user 2026-10-24: 「14×14」). The word stays: the
 * icon is decorative (alt ""), drawn only once its picture is loaded (`ArtIndex.has`), so a missing one leaves the word.
 */
export const CHIP_ICON_PX = 14;
/** The space an icon takes in a word: the icon and the 1 px gap after it. */
export const CHIP_ICON_W = CHIP_ICON_PX + 1;

export const ailmentIconUrl = (id: AilmentShown): string => art.ailmentIcon(id);

/** The words a counter starts with, read from the game's own strings (a number follows). */
const lead = (f: (n: number) => string): string => f(0).slice(0, -1);
const COUNTERS: [MechWord['tone'], string, MechIconKey][] = [
  ['heat', lead(T.mech.heat), 'heat'], ['coins', lead(T.mech.coins), 'coins'], ['embers', lead(T.mech.embers), 'embers'],
  ['beat', lead(T.mech.beat), 'beat'], ['aim', lead(T.mech.aim), 'aim'], ['devices', lead(T.mech.shield), 'shield'],
];
/** 「・雷」: what a barrier that strikes adds to its word. */
const BOLT = T.mech.purify('', true).slice(T.mech.purify('', false).length);
/** A device's word starts with its short name; its icon is its own skill's (the skill whose effect sets that device). */
const DEVICE_SKILL: Record<string, string> = Object.fromEntries(Object.entries(T.mech.deviceShort).map(([kind, short]) => [short,
  Object.values(SKILLS).find((s) => s.effects.some((e) => e.kind === 'device' && e.device === kind))?.id ?? '']));

/**
 * A mechanic word's icons, by what it says (the engine's words carry a tone and their text only): a counter's own icon,
 * a barrier's kind (and the thunder when it strikes), the moon's phase now, a device's skill icon. A cue or a word with
 * no picture of its own (弱點, 隱匿, 估價, 代受, 最後行動) has none.
 */
export function mechIconUrls(w: Pick<MechWord, 'tone' | 'text'>): string[] {
  for (const [tone, head, key] of COUNTERS) if (w.tone === tone && w.text.startsWith(head) && /\d/.test(w.text.charAt(head.length))) return [art.mechIcon(key)];
  if (w.tone === 'mark' && w.text === T.mech.mark) return [art.mechIcon('mark')];
  if (w.tone === 'ward' || w.tone === 'purify') return [art.mechIcon(w.tone), ...(BOLT && w.text.includes(BOLT) ? [art.mechIcon('thunder')] : [])];
  if (w.tone === 'moon') {
    const now = (Object.keys(T.mech.phase) as (keyof typeof T.mech.phase)[]).find((k) => w.text.startsWith(T.mech.moon(T.mech.phase[k], '')));
    return now ? [art.mechIcon(`moon-${now}`)] : [];
  }
  if (w.tone === 'devices') {
    const short = Object.keys(DEVICE_SKILL).find((s) => w.text.startsWith(s));
    return short && DEVICE_SKILL[short] ? [art.skillIcon(DEVICE_SKILL[short], CHIP_ICON_PX)] : [];
  }
  return [];
}
