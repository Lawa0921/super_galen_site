import type { MaterialDef } from '../engine/types';
import { ROSTER_MATERIALS } from './materials.roster';

const LIST: MaterialDef[] = [
  { id: 'moss', name: '發光苔', price: 6, kind: 'monster' },
  { id: 'bat-wing', name: '蝙蝠翼膜', price: 7, kind: 'monster' },
  { id: 'thorn-fang', name: '荊棘牙', price: 10, kind: 'monster' },
  { id: 'crystal-shell', name: '晶殼碎片', price: 16, kind: 'monster' },
  { id: 'ice-crystal', name: '冰晶核', price: 18, kind: 'monster' },
  { id: 'lizard-scale', name: '蜥蜴鱗', price: 18, kind: 'monster' },
  { id: 'star-stone', name: '星紋石', price: 30, kind: 'monster' },
  { id: 'dusk-cloth', name: '暮影布', price: 32, kind: 'monster' },
  { id: 'old-coin', name: '古代銀幣', price: 40, kind: 'junk' },
  { id: 'ancient-gear', name: '古代齒輪', price: 60, kind: 'rare' },
  { id: 'star-tear', name: '星燈之淚', price: 80, kind: 'rare' },
  { id: 'king-scale', name: '王者之鱗', price: 100, kind: 'rare' },
  { id: 'blaze-core', name: '火焰核', price: 25, kind: 'region' },
  { id: 'frost-heart', name: '霜之心', price: 25, kind: 'region' },
  { id: 'storm-stone', name: '雷鳴石', price: 25, kind: 'region' },
  { id: 'mire-gland', name: '毒腺', price: 25, kind: 'region' },
  { id: 'shade-crystal', name: '暗影結晶', price: 25, kind: 'region' },
  { id: 'iron-shard', name: '鋼鐵碎片', price: 25, kind: 'region' },
  { id: 'essence-common', name: '普通精華', price: 4, kind: 'essence' },
  { id: 'essence-magic', name: '魔法精華', price: 12, kind: 'essence' },
  { id: 'essence-rare', name: '稀有精華', price: 30, kind: 'essence' },
  { id: 'essence-legendary', name: '傳說精華', price: 80, kind: 'essence' },
];

/** Every material by id: the 22 above, then the monster roster's 98 (data/materials.roster.ts). */
export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries([...LIST, ...ROSTER_MATERIALS].map((m) => [m.id, m]));
