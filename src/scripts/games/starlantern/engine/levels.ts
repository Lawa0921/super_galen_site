/** The party level a depth is tuned for (spec §3.7): 2, 6, 10, 14 … Bottom of the import graph: nothing else may be pulled in here. */
export const depthLevel = (depth: number): number => 2 + 4 * (depth - 1);
