// tooltip.ts — 道具說明文字（純函式，HUD 的滑鼠懸停 / 長按提示用）與生命愛心換算。
import { ITEMS, ARMOR_SETS, type ItemId } from '../engine/items';
import { SET_BONUS, LIFE_CORE_HP } from '../engine/combat';
import { POTION_HEAL, POTION_COOLDOWN } from '../engine/game';

const SET_NAME = { wood: '木製', copper: '銅製', iron: '鐵製', gold: '金製', bone: '骸衛', molten: '熔心' } as const;
const KIND_NAME = { sword: '劍', broadsword: '大劍', spear: '矛', bow: '弓', throw: '投擲', boomerang: '迴旋', staff: '法杖' } as const;
const ACC_TEXT: Record<string, string> = {
  jump: '跳得更高、安全落下高度 +8 格',
  run: '跑速 +45%',
  night: '身邊一圈微光',
  magnet: '撿拾半徑 5 → 12 格、伸手距離 +3 格',
  compass: '顯示東西座標（放背包也有效）',
  depth: '顯示深度（放背包也有效）',
  map: '地圖顯示所有地標（放背包也有效）',
  nofall: '不受摔落傷害',
  lavaward: '熔岩不傷身、不會著火',
};

export function speedLabel(useTime: number): string {
  return useTime <= 0.32 ? '很快' : useTime <= 0.45 ? '普通' : '慢';
}
const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** 道具說明（第一行 = 名稱） */
export function itemTooltip(item: ItemId): string[] {
  const d = ITEMS[item];
  const out = [`${d.name.zh}  ${d.name.en}`];
  if (d.weapon) {
    const w = d.weapon;
    out.push(`${KIND_NAME[w.kind]}・傷害 ${w.damage}・速度 ${speedLabel(w.useTime)}（${w.useTime.toFixed(2)} 秒）`);
    out.push(`擊退 ${Math.round(w.knockback / 40)}・暴擊 ${pct(w.crit)}`);
    if (w.ammo) out.push('需要箭（木箭 / 火焰箭）');
    if (w.mana) out.push(`耗魔 ${w.mana}`);
    if (w.wave) out.push('揮擊時放出光刃');
    if (w.kind === 'throw') out.push('投出後消耗');
    if (w.kind === 'boomerang') out.push('會飛回手上');
  }
  if (d.ammo) out.push(`彈藥・傷害 +${d.ammo.damage}${d.ammo.flame ? '・點燃目標' : ''}`);
  if (d.vanity) {
    const where = { head: '頭', body: '身', legs: '腿', back: '背', acc: '飾品' }[d.vanity.slot];
    out.push(`時裝・外觀欄（${where}）`);
    out.push(d.vanity.slot === 'acc' ? '只改樣子、沒有數值；戴帽子 / 頭盔時頭飾會收起來（眼鏡照戴）' : '只改樣子、沒有數值；會蓋過同部位防具的樣子');
  }
  if (d.armor) {
    const a = d.armor;
    out.push(`${a.slot === 'head' ? '頭部' : a.slot === 'body' ? '身體' : '腿部'}防具・防禦 ${a.defense}`);
    out.push(`${SET_NAME[a.set]}套裝（${ARMOR_SETS[a.set].length} 件）：${SET_BONUS[a.set].text}`);
  }
  if (d.accessory) {
    out.push('飾品' + (d.accessory === 'compass' || d.accessory === 'depth' || d.accessory === 'map' ? '' : '（裝在飾品槽才有效）'));
    const s = d.stats;
    if (s) {
      const parts: string[] = [];
      if (s.defense) parts.push(`防禦 +${s.defense}`);
      if (s.maxHp) parts.push(`生命上限 +${s.maxHp}`);
      if (s.damage) parts.push(`傷害 +${pct(s.damage)}`);
      if (s.crit) parts.push(`暴擊 +${pct(s.crit)}`);
      if (s.regen) parts.push(`回血 +${pct(s.regen)}`);
      out.push(parts.join('・'));
    }
    if (ACC_TEXT[d.accessory]) out.push(ACC_TEXT[d.accessory]);
  }
  if (d.pick) out.push(`鎬・挖掘速度 ${d.pick.speed}・等級 ${d.pick.tier}`);
  switch (d.use) {
    case 'life': out.push(`使用：生命上限永久 +${LIFE_CORE_HP}`); break;
    case 'heal': out.push(`使用：回復 ${POTION_HEAL} 生命（冷卻 ${POTION_COOLDOWN} 秒）`); break;
    case 'summon': out.push('使用：召喚燈脈守望者（夜晚或洞穴層以下）'); break;
    case 'recall': out.push('使用：引導後傳送回重生點'); break;
    case 'boat': out.push('使用：在水面上上船（不會用掉）；按跳下船'); break;
    case 'scoop': out.push('使用：舀起瞄準格的水 / 熔岩 / 蜂蜜'); break;
    case 'pour': out.push('使用：把整桶倒在瞄準格（水碰熔岩會變黑曜石）'); break;
    case 'sponge': out.push('使用：吸掉瞄準格附近的水 / 蜂蜜（按住連續吸）'); break;
    case 'fish': out.push('使用：拋竿 / 收竿；浮標沉下去時再按一次把魚拉起來'); break;
    case 'eat': out.push(`使用：吃掉，回復 ${d.food ?? 0} 生命`); break;
    case 'rebirth': out.push('使用：選一個新的種族並換上（被動數值跟著變）；換族才會消耗，取消或選同一族不消耗'); break;
    case 'crate': out.push('使用：打開木箱'); break;
    default: break;
  }
  if (d.rod) out.push(`釣竿・釣力 ${d.rod.power}${d.rod.lava ? '・可以在熔岩裡釣' : ''}（要帶魚餌）`);
  if (d.bait) out.push(`魚餌・釣力 +${d.bait}`);
  if (d.fish) out.push('魚（營火 / 熔爐旁可以料理）');
  if (d.place !== undefined && !d.weapon) out.push('可放置');
  if (d.unique) out.push('珍寶');
  return out;
}

/** 生命愛心：每顆 20，回傳每顆填滿比例（0 / 0.25 / 0.5 / 0.75 / 1） */
export function heartFills(hp: number, maxHp: number): number[] {
  const n = Math.ceil(maxHp / 20);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(20, hp - i * 20)) / 20;
    out.push(Math.floor(v * 4 + 1e-9) / 4);
  }
  return out;
}
