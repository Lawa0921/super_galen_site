import type { ItemDef } from '../engine/types';

const LIST: ItemDef[] = [
  { id: 'potion', name: '回復藥', price: 20, target: 'ally', battle: true, desc: '回復 60 HP', effects: [{ kind: 'restore', hp: 60 }] },
  { id: 'ether', name: 'TP 藥', price: 50, target: 'ally', battle: true, desc: '回復 20 TP', effects: [{ kind: 'restore', tp: 20 }] },
  { id: 'antidote', name: '解毒藥', price: 15, target: 'ally', battle: true, desc: '解除毒與睡眠', effects: [{ kind: 'cure' }] },
  { id: 'phoenix', name: '復活羽毛', price: 120, target: 'deadAlly', battle: true, desc: '以一半 HP 復活', effects: [{ kind: 'revive', hpPct: 0.5 }] },
  { id: 'return-lamp', name: '歸還之燈', price: 60, target: null, battle: false, returnToTown: true, desc: '在迷宮中使用，立刻回城', effects: [] },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(LIST.map((i) => [i.id, i]));
