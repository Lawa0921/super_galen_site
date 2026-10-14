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
];

export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(LIST.map((m) => [m.id, m]));
