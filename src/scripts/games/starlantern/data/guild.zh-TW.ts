import type { CharacterId } from '../engine/types';
import type { GiverId } from './guild';

/**
 * The guild board's spoken words (guild quests spec §7.2, plan ruling 17): the townsfolk's notes on the board and their
 * thanks, Anna's lines at the board, and a companion's word on a quest turned in her land. PR C writes them (Tasks C1–C3,
 * the W steps; deferred by the user's gameplay-first direction, spec §0 item 24). Until then every slot is empty, and a
 * screen says nothing where a line would go: no placeholder text. Three exceptions say one plain system line instead,
 * each replaced by Anna's own once written: the board before the first act (`T.ui2.board.locked` for `anna.locked`), a
 * full hand (`T.ui2.board.full` for `anna.full`) and the first look (`T.ui2.board.intro` for `anna.intro`).
 * The interface's own words (tabs, buttons, formats) are `T.ui2.board` (data/text.zh-TW.ts).
 */

/**
 * Which note a quest posts (spec §7.2): a bounty by what it is, a delivery by the goods' kind (C1 may rename them); a
 * gathered good's by its point (gathering plan ruling 13): herbs and mushrooms `deliverPantry`, the rest `deliverOre`.
 */
export type NoteKey = 'hunt' | 'sweep' | 'scout' | 'warden' | 'boss' | 'monster' | 'region' | 'trophy' | 'deliverPantry' | 'deliverOre';

export interface GuildText {
  /** A note on the board, a variant a day (`day % 2`); slots {target}, {n} (a numeral) and {place}. */
  notes: Partial<Record<NoteKey, readonly [string, string]>>;
  /** A giver's thanks, passed on by Anna when the quest is turned in (`T.ui2.board.note` before it), a variant a day. */
  thanks: Partial<Record<GiverId, readonly [string, string]>>;
  anna: {
    /** The board before the first act is over (spec §8.1). */
    locked?: string;
    /** The first time the board opens: how it works, a box each. */
    intro: readonly string[];
    /** A note picked with a full hand. */
    full?: string;
    /** Opening a board with no note on it. */
    empty?: string;
    /** A note taken (spec §8.4); without it the guild's box says `T.ui2.board.accepted`. */
    accepted?: string;
    /** As she stamps a new lamp on the card: 1 一燈 to 4 四燈. */
    stamp: Partial<Record<1 | 2 | 3 | 4, string>>;
  };
  /** A companion's word on a quest turned in the land she was found in, while she is on the field. */
  remarks: Partial<Record<CharacterId, string>>;
}

/** Gathering plan ruling 13: the gathered goods' two notes are registered, their words left empty (an empty note says nothing). */
export const GUILD_TEXT: GuildText = { notes: { deliverPantry: ['', ''], deliverOre: ['', ''] }, thanks: {}, anna: { intro: [], stamp: {} }, remarks: {} };
