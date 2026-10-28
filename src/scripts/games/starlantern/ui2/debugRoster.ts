import { ROSTER_ART, ROSTER_LIVE } from '../data/monsters';

/**
 * The roster's switches on the debug handle (roster plan Task C6), so the e2e can put a foe live for one page. A dev build's
 * only (`import.meta.env.DEV`; the e2e runs the Astro dev server): a production console must never turn on unreleased
 * foes (PR C review L1).
 */
export function rosterHandle(dev: boolean): { roster?: { ROSTER_ART: ReadonlySet<string>; ROSTER_LIVE: ReadonlySet<string> } } {
  return dev ? { roster: { ROSTER_ART, ROSTER_LIVE } } : {};
}
