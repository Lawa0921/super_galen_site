import type { EquipDef, GearSlot, Slot } from '../engine/types';

/** Plan 5a transition: the old three-slot model. Task 4 deletes this with every caller. */
export function legacySlot(g: GearSlot): Slot {
  if (g === 'weapon') return 'weapon';
  return g === 'neck' || g === 'ring' ? 'accessory' : 'armor';
}

const LIST: EquipDef[] = [
  { id: 'wooden-staff', name: '木杖', slot: 'weapon', ilvl: 1, price: 30, bonus: { mag: 3 } },
  { id: 'iron-sword', name: '鐵劍', slot: 'weapon', ilvl: 1, price: 40, bonus: { atk: 4 } },
  { id: 'hunter-bow', name: '獵弓', slot: 'weapon', ilvl: 1, price: 40, bonus: { atk: 4 } },
  { id: 'thorn-spear', name: '荊棘槍', slot: 'weapon', ilvl: 5, price: 90, bonus: { atk: 7 }, unlock: [{ mat: 'thorn-fang', qty: 4 }] },
  { id: 'crystal-blade', name: '晶刃', slot: 'weapon', ilvl: 7, price: 160, bonus: { atk: 9 }, unlock: [{ mat: 'crystal-shell', qty: 3 }] },
  { id: 'frost-staff', name: '霜杖', slot: 'weapon', ilvl: 7, price: 160, bonus: { mag: 9 }, unlock: [{ mat: 'ice-crystal', qty: 3 }] },
  { id: 'star-saber', name: '星紋軍刀', slot: 'weapon', ilvl: 10, price: 320, bonus: { atk: 15 }, unlock: [{ mat: 'star-stone', qty: 3 }] },
  { id: 'cloth-robe', name: '布袍', slot: 'body', ilvl: 1, price: 30, bonus: { def: 2, res: 3 } },
  { id: 'leather-vest', name: '皮背心', slot: 'body', ilvl: 1, price: 40, bonus: { def: 4 } },
  { id: 'scale-mail', name: '鱗甲', slot: 'body', ilvl: 7, price: 180, bonus: { def: 9 }, unlock: [{ mat: 'lizard-scale', qty: 3 }] },
  { id: 'dusk-mantle', name: '暮影斗篷', slot: 'body', ilvl: 10, price: 300, bonus: { def: 6, res: 10 }, unlock: [{ mat: 'dusk-cloth', qty: 3 }] },
  { id: 'moss-charm', name: '苔光護符', slot: 'neck', ilvl: 2, price: 50, bonus: { hp: 15 }, unlock: [{ mat: 'moss', qty: 3 }] },
  { id: 'bat-earring', name: '蝠翼耳飾', slot: 'neck', ilvl: 3, price: 60, bonus: { spd: 3 }, unlock: [{ mat: 'bat-wing', qty: 3 }] },
  { id: 'crystal-pendant', name: '晶核墜飾', slot: 'neck', ilvl: 7, price: 140, bonus: { res: 6 }, unlock: [{ mat: 'ice-crystal', qty: 2 }] },
  { id: 'gear-ring', name: '齒輪戒指', slot: 'ring', ilvl: 10, price: 200, bonus: { tp: 10 }, unlock: [{ mat: 'ancient-gear', qty: 1 }] },
  { id: 'wooden-buckler', name: '木圓盾', slot: 'offhand', ilvl: 1, price: 30, bonus: { def: 2 } },
  { id: 'crystal-aegis', name: '晶盾', slot: 'offhand', ilvl: 8, price: 150, bonus: { def: 5, res: 3 }, unlock: [{ mat: 'crystal-shell', qty: 4 }] },
  { id: 'leather-cap', name: '皮帽', slot: 'head', ilvl: 1, price: 25, bonus: { def: 1, res: 1 } },
  { id: 'scale-helm', name: '鱗盔', slot: 'head', ilvl: 7, price: 140, bonus: { def: 4, res: 2 }, unlock: [{ mat: 'lizard-scale', qty: 4 }] },
  { id: 'cloth-gloves', name: '布手套', slot: 'hands', ilvl: 1, price: 25, bonus: { atk: 1, def: 1 } },
  { id: 'thorn-gauntlets', name: '荊棘臂甲', slot: 'hands', ilvl: 5, price: 100, bonus: { atk: 3, def: 2 }, unlock: [{ mat: 'thorn-fang', qty: 6 }] },
  { id: 'straw-sandals', name: '草鞋', slot: 'feet', ilvl: 1, price: 25, bonus: { spd: 1 } },
  { id: 'bat-boots', name: '蝠翼靴', slot: 'feet', ilvl: 4, price: 90, bonus: { spd: 3, def: 1 }, unlock: [{ mat: 'bat-wing', qty: 6 }] },
  { id: 'copper-ring', name: '銅戒', slot: 'ring', ilvl: 1, price: 30, bonus: { hp: 8 } },
  { id: 'star-ring', name: '星紋戒', slot: 'ring', ilvl: 10, price: 260, bonus: { atk: 4, mag: 4 }, unlock: [{ mat: 'star-stone', qty: 5 }] },
];

export const EQUIPMENT: Record<string, EquipDef> = Object.fromEntries(LIST.map((e) => [e.id, e]));
