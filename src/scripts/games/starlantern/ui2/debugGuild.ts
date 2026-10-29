import { GUILD_SWITCH } from '../data/guild';

/**
 * The guild board's switch on the debug handle (guild quests PR B), so the e2e can open the board while GUILD_LIVE is still
 * off. A dev build's only (`import.meta.env.DEV`; the e2e runs the Astro dev server), as the roster's switches are: a
 * production console must never turn on what is not released (roster PR C review L1).
 */
export function guildHandle(dev: boolean): { guild?: { GUILD_SWITCH: typeof GUILD_SWITCH } } {
  return dev ? { guild: { GUILD_SWITCH } } : {};
}
