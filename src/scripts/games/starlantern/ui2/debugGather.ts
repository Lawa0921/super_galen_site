import { GATHER_SWITCH } from '../data/gather';
import { GATHER_TEXT } from '../data/gather.zh-TW';

/**
 * Gathering's switch on the debug handle (gathering plan ruling 12), so the e2e can measure the hint, the window and the forge
 * while GATHER_LIVE is still off, and its words' slots, so a later e2e can measure the longest line written into them. A dev
 * build's only (`import.meta.env.DEV`; the e2e runs the Astro dev server), as the guild's and the roster's are: a production
 * console must never turn on what is not released.
 */
export function gatherHandle(dev: boolean): { gather?: { GATHER_SWITCH: typeof GATHER_SWITCH; GATHER_TEXT: typeof GATHER_TEXT } } {
  return dev ? { gather: { GATHER_SWITCH, GATHER_TEXT } } : {};
}
