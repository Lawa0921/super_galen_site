/** The party level a depth is tuned for (spec §3.7): 2, 6, 10, 14 … Bottom of the import graph: nothing else may be pulled in here. */
export const depthLevel = (depth: number): number => 2 + 4 * (depth - 1);

/** Far above any depth the game reaches (a depth-50 boss drops item level 202); bounds hostile saves. */
export const MAX_ILVL = 999;
/** The deepest depth a save may claim: the last whose `depthLevel` is still within MAX_ILVL. */
export const MAX_REACHED = Math.floor((MAX_ILVL - 2) / 4) + 1;
