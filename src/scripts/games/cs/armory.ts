import { WEAPONS, type Match, type WeaponId } from './engine';
import { GRENADES, MAX_GRENADES, grenadeCount, type GrenadeId } from './grenades';

export const ARMORY: readonly { id: WeaponId; code: string; category: string; role: string }[] = [
  { id: 'pistol', code: '01', category: 'SIDEARM', role: '輕裝起手 · 精準點射' },
  { id: 'smg', code: '02', category: 'CLOSE QUARTERS', role: '近距突破 · 高速壓制' },
  { id: 'rifle', code: '03', category: 'ASSAULT', role: '中距交火 · 點射與短連發' },
  { id: 'sniper', code: '04', category: 'PRECISION', role: '遠距架點 · 瞄準鏡射擊' },
];
export const UTILITY: readonly { id: GrenadeId; category: string; role: string }[] = [
  { id: 'he', category: 'FRAG', role: '1.6 秒引信 · 範圍傷害，不穿牆' },
  { id: 'flash', category: 'FLASH', role: '面向越正越久 · 敵我都會被閃' },
  { id: 'smoke', category: 'SMOKE', role: '落地靜止後展開 · 遮蔽約 17 秒' },
];
export const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`;
const isGrenade = (item: string): item is GrenadeId => Object.hasOwn(GRENADES, item);
export function armoryOffer(match: Match, item: WeaponId | 'armor' | GrenadeId) {
  const player = match.actors[0], price = item === 'armor' ? 650 : isGrenade(item) ? GRENADES[item].price : WEAPONS[item].price;
  const balance = player.money - price, carried = isGrenade(item) ? player.grenades?.[item] ?? 0 : undefined;
  if (player.hp <= 0 || match.phase !== 'buy') return { enabled: false, state: 'closed', label: '準備階段開放', balance, carried };
  if (isGrenade(item)) {
    if (carried! >= GRENADES[item].max) return { enabled: false, state: 'full', label: `已達上限 ${GRENADES[item].max}`, balance, carried };
    if (grenadeCount(player) >= MAX_GRENADES) return { enabled: false, state: 'full', label: `投擲物上限 ${MAX_GRENADES}`, balance, carried };
  } else if (item === 'armor' ? player.armor >= 100 : player.weapon === item) return { enabled: false, state: 'equipped', label: '已裝備', balance };
  if (balance < 0) return { enabled: false, state: 'unaffordable', label: `還差 ${currency(-balance)}`, balance, carried };
  return { enabled: true, state: 'available', label: price === 0 ? '免費裝備' : `購買後剩 ${currency(balance)}`, balance, carried };
}
