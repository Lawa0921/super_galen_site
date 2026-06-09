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
  aya: {
    id: 'aya',
    name: '綾',
    start: { lives: 2, fireRange: 1, maxBombs: 1, speedLevel: 2 },
    caps:  { lives: 3, fireRange: 6, maxBombs: 5, speedLevel: 4 },
  },
  rosa: {
    id: 'rosa',
    name: '蘿莎',
    start: { lives: 4, fireRange: 2, maxBombs: 2, speedLevel: 0 },
    caps:  { lives: 6, fireRange: 5, maxBombs: 5, speedLevel: 2 },
  },
};

export function getCharacter(id: CharacterId): CharacterProfile {
  return CHARACTERS[id];
}
