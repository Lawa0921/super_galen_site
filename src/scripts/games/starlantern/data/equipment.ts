import type { EquipDef } from '../engine/types';

const LIST: EquipDef[] = [
  { id: 'wooden-staff', name: '木杖', slot: 'weapon', price: 30, bonus: { mag: 3 } },
  { id: 'iron-sword', name: '鐵劍', slot: 'weapon', price: 40, bonus: { atk: 4 } },
  { id: 'hunter-bow', name: '獵弓', slot: 'weapon', price: 40, bonus: { atk: 4 } },
  { id: 'thorn-spear', name: '荊棘槍', slot: 'weapon', price: 90, bonus: { atk: 7 }, unlock: [{ mat: 'thorn-fang', qty: 4 }] },
  { id: 'crystal-blade', name: '晶刃', slot: 'weapon', price: 160, bonus: { atk: 9 }, unlock: [{ mat: 'crystal-shell', qty: 3 }] },
  { id: 'frost-staff', name: '霜杖', slot: 'weapon', price: 160, bonus: { mag: 9 }, unlock: [{ mat: 'ice-crystal', qty: 3 }] },
  { id: 'star-saber', name: '星紋軍刀', slot: 'weapon', price: 320, bonus: { atk: 15 }, unlock: [{ mat: 'star-stone', qty: 3 }] },
  { id: 'cloth-robe', name: '布袍', slot: 'armor', price: 30, bonus: { def: 2, res: 3 } },
  { id: 'leather-vest', name: '皮背心', slot: 'armor', price: 40, bonus: { def: 4 } },
  { id: 'scale-mail', name: '鱗甲', slot: 'armor', price: 180, bonus: { def: 9 }, unlock: [{ mat: 'lizard-scale', qty: 3 }] },
  { id: 'dusk-mantle', name: '暮影斗篷', slot: 'armor', price: 300, bonus: { def: 6, res: 10 }, unlock: [{ mat: 'dusk-cloth', qty: 3 }] },
  { id: 'moss-charm', name: '苔光護符', slot: 'accessory', price: 50, bonus: { hp: 15 }, unlock: [{ mat: 'moss', qty: 3 }] },
  { id: 'bat-earring', name: '蝠翼耳飾', slot: 'accessory', price: 60, bonus: { spd: 3 }, unlock: [{ mat: 'bat-wing', qty: 3 }] },
  { id: 'crystal-pendant', name: '晶核墜飾', slot: 'accessory', price: 140, bonus: { res: 6 }, unlock: [{ mat: 'ice-crystal', qty: 2 }] },
  { id: 'gear-ring', name: '齒輪戒指', slot: 'accessory', price: 200, bonus: { tp: 10 }, unlock: [{ mat: 'ancient-gear', qty: 1 }] },
];

export const EQUIPMENT: Record<string, EquipDef> = Object.fromEntries(LIST.map((e) => [e.id, e]));
