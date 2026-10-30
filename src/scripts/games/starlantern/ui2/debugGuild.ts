import { GUILD_SWITCH } from '../data/guild';
import { GUILD_TEXT } from '../data/guild.zh-TW';

/**
 * The guild board's switch on the debug handle (guild quests PR B), so the e2e can open the board while GUILD_LIVE is still
 * off, and its words' registry, so the e2e can measure the detail with the longest note PR C may write (review of PR B). A
 * dev build's only (`import.meta.env.DEV`; the e2e runs the Astro dev server), as the roster's switches are: a production
 * console must never turn on what is not released (roster PR C review L1).
 */
export function guildHandle(dev: boolean): { guild?: { GUILD_SWITCH: typeof GUILD_SWITCH; GUILD_TEXT: typeof GUILD_TEXT } } {
  return dev ? { guild: { GUILD_SWITCH, GUILD_TEXT } } : {};
}
