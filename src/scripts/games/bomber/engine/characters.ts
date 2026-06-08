// characters.ts
import type { CharacterId, CharacterProfile } from './types';

export const CHARACTERS: Record<CharacterId, CharacterProfile> = {
  lena: {
    id: 'lena',
    name: '蕾娜',
    start: { lives: 4, fireRange: 1, maxBombs: 2, speedLevel: 0 },
    caps:  { lives: 5, fireRange: 5, maxBombs: 8, speedLevel: 2 },
  },
  mira: {
    id: 'mira',
    name: '米拉',
    start: { lives: 2, fireRange: 2, maxBombs: 1, speedLevel: 1 },
    caps:  { lives: 3, fireRange: 8, maxBombs: 4, speedLevel: 4 },
  },
};

export function getCharacter(id: CharacterId): CharacterProfile {
  return CHARACTERS[id];
}
