import type { MaterialDef } from '../engine/types';

const LIST: MaterialDef[] = [
  { id: 'moss', name: '發光苔', price: 6 },
  { id: 'bat-wing', name: '蝙蝠翼膜', price: 7 },
  { id: 'thorn-fang', name: '荊棘牙', price: 10 },
  { id: 'crystal-shell', name: '晶殼碎片', price: 16 },
  { id: 'ice-crystal', name: '冰晶核', price: 18 },
  { id: 'lizard-scale', name: '蜥蜴鱗', price: 18 },
  { id: 'star-stone', name: '星紋石', price: 30 },
  { id: 'dusk-cloth', name: '暮影布', price: 32 },
  { id: 'old-coin', name: '古代銀幣', price: 40 },
  { id: 'ancient-gear', name: '古代齒輪', price: 60 },
  { id: 'blaze-core', name: '火焰核', price: 0 },
  { id: 'frost-heart', name: '霜之心', price: 0 },
  { id: 'storm-stone', name: '雷鳴石', price: 0 },
  { id: 'mire-gland', name: '毒腺', price: 0 },
  { id: 'shade-crystal', name: '暗影結晶', price: 0 },
  { id: 'iron-shard', name: '鋼鐵碎片', price: 0 },
];

export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(LIST.map((m) => [m.id, m]));
