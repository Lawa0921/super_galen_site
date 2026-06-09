// characters.ts
import type { CharacterId, CharacterProfile } from './types';

export const CHARACTERS: Record<CharacterId, CharacterProfile> = {
  lena: {
    id: 'lena',
    name: '蕾娜',
    start: { lives: 4, fireRange: 1, maxBombs: 2, speedLevel: 0 },
    caps:  { lives: 5, fireRange: 5, maxBombs: 8, speedLevel: 2 },
    ability: { id: 'carpet', name: '地毯轟炸', desc: '身邊十字範圍瞬間放下多顆炸彈', cooldownMs: 12000 },
  },
  mira: {
    id: 'mira',
    name: '米拉',
    start: { lives: 2, fireRange: 2, maxBombs: 1, speedLevel: 1 },
    caps:  { lives: 3, fireRange: 8, maxBombs: 4, speedLevel: 4 },
    ability: { id: 'inferno', name: '爆炎術', desc: '以自身為中心瞬發大範圍爆炎', cooldownMs: 14000 },
  },
  aya: {
    id: 'aya',
    name: '綾',
    start: { lives: 2, fireRange: 1, maxBombs: 1, speedLevel: 2 },
    caps:  { lives: 3, fireRange: 6, maxBombs: 5, speedLevel: 4 },
    ability: { id: 'blink', name: '瞬步', desc: '朝面向瞬移到最遠空格', cooldownMs: 8000 },
  },
  rosa: {
    id: 'rosa',
    name: '蘿莎',
    start: { lives: 4, fireRange: 2, maxBombs: 2, speedLevel: 0 },
    caps:  { lives: 6, fireRange: 5, maxBombs: 5, speedLevel: 2 },
    ability: { id: 'bulwark', name: '鐵壁', desc: '數秒無敵護盾', cooldownMs: 14000 },
  },
};

export function getCharacter(id: CharacterId): CharacterProfile {
  return CHARACTERS[id];
}
