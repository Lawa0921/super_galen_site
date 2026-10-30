/**
 * Gathering spec §9.2: the words slots, all empty in the first version (the story is not settled; 2026-10-30 the user paused
 * the story work). An empty slot says nothing: no name plate, no face, no stand-in. Filling a slot later is story work
 * (the v6 plan's W1-W7) and changes no code: who speaks and which line are already ruled in engine/gather.ts.
 *   remarks.<c>.<kind>: the first gathering of a dive, said by the first companion on the field who fits (`REMARK_TYPES`);
 *   inner.first / inner.deep: Lorne's inner voice, the first gathering ever / the first deep material ever;
 *   doran.tools / made1 / made2: Doran, the tools list opened / the first tool made / the second tool made.
 */
export interface GatherText {
  remarks: {
    sylvie: { herb: string[]; fungus: string[] };
    bobby: { vein: string[]; crystal: string[] };
    liz: { crystal: string[]; spot: string[] };
    rin: { any: string[] };
  };
  inner: { first: string[]; deep: string[] };
  doran: { tools: string[]; made1: string[]; made2: string[] };
}

export const GATHER_TEXT: GatherText = {
  remarks: {
    sylvie: { herb: [], fungus: [] },
    bobby: { vein: [], crystal: [] },
    liz: { crystal: [], spot: [] },
    rin: { any: [] },
  },
  inner: { first: [], deep: [] },
  doran: { tools: [], made1: [], made2: [] },
};
