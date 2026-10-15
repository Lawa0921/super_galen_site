import type { BuffStat, Slot, StatKey } from '../engine/types';

const STAT: Record<StatKey, string> = { hp: 'HP', tp: 'TP', atk: '攻擊', def: '防禦', mag: '魔力', res: '魔防', spd: '速度' };
const SLOT: Record<Slot, string> = { weapon: '武器', armor: '防具', accessory: '飾品' };

export const T = {
  stat: STAT,
  slot: SLOT,
  gold: (n: number) => `${n} G`,
  tabs: { guild: '公會', shop: '商店', inn: '旅館', depart: '出發' },
  guild: {
    formation: '編隊', front: (i: number) => `前排 ${i}`, back: (i: number) => `後排 ${i}`, none: '（空）',
    recruit: (title: string, name: string) => `招募 ${title} ${name}`, members: '隊員與裝備', unequipped: '（未裝備）',
    level: (lv: number) => `Lv ${lv}`,
  },
  shop: {
    sell: '賣出素材', sellOne: '賣 1 個', sellAll: '全部賣出', buy: '購買', nothing: '沒有可賣的素材',
    needs: (name: string, n: number) => `需賣出 ${name} ×${n}`, price: (name: string, n: number) => `${name}（${n} G）`,
  },
  inn: { rest: (cost: number) => `住宿並存檔（${cost} G）`, revive: (name: string, cost: number) => `復活 ${name}（${cost} G）` },
  departTo: (n: number, name: string) => `前往第 ${n} 層：${name}`,
  reasons: {
    gold: '金錢不足', locked: '尚未解鎖', stock: '數量不足', invalid: '無法執行', phase: '現在不能這麼做',
    'party-down': '出戰成員全部倒下，無法出發', size: '編隊格數錯誤', 'not-recruited': '尚未招募',
    duplicate: '同一人不能重複上陣', empty: '至少要有一人出戰',
  } as Record<string, string>,
  notices: {
    'save-reset': '存檔無法讀取，已開始新遊戲', wipe: '全滅……已回到上次住宿的時間點',
    saved: '已存檔', 'save-failed': '存檔失敗：瀏覽器不允許儲存',
  },
  map: {
    returnTown: '回城', lamp: (n: number) => `歸還之燈 ×${n}`,
    danger: { green: '安全', yellow: '注意', red: '危險' },
    floor: (n: number, name: string) => `第 ${n} 層　${name}`,
    chest: (name: string, qty: number) => `打開寶箱：${name} ×${qty}`,
    dirs: { up: '↑', down: '↓', left: '←', right: '→' },
  },
  cmd: {
    attack: '攻擊', skill: '技能', defend: '防禦', item: '道具', escape: '逃跑', auto: '全員攻擊', back: '返回',
    choose: (name: string) => `${name} 的行動`, target: '選擇目標', tp: (n: number) => `${n} TP`,
    ultimate: (name: string) => `絕技：${name}`, gauge: (n: number) => `絕技 ${n}%`,
  },
  battle: {
    win: '勝利！', lose: '全滅……', fled: '成功逃跑', cont: '繼續', poison: '毒', sleep: '睡眠',
    exp: (n: number) => `經驗值 +${n}`, gold: (n: number) => `金錢 +${n}`, drop: (name: string, n: number) => `${name} ×${n}`,
    levelUp: (name: string, lv: number) => `${name} 升到 Lv ${lv}`, learned: (name: string, skill: string) => `${name} 學會了「${skill}」`,
    weak: (els: string) => `已知弱點：${els}`,
  },
  element: { phys: '物理', fire: '火', ice: '冰', thunder: '雷' },
  log: {
    act: (who: string, label: string) => `${who}：${label}`,
    damage: (who: string, n: number, mult: number) => `${who} 受到 ${n} 傷害${mult > 1 ? '（弱點）' : mult < 1 ? '（抗性）' : ''}`,
    ko: (who: string) => `${who} 倒下了`,
    heal: (who: string, n: number) => `${who} 回復 ${n} HP`,
    tp: (who: string, n: number) => `${who} 回復 ${n} TP`,
    revive: (who: string) => `${who} 復活了`,
    cure: (who: string) => `${who} 的異常狀態解除了`,
    status: (who: string, s: 'poison' | 'sleep') => `${who}${s === 'poison' ? '中毒了' : '睡著了'}`,
    resist: (who: string) => `${who} 沒有受到影響`,
    buff: (who: string, stat: BuffStat, pct: number) => `${who} 的${STAT[stat]}${pct > 0 ? '提升' : '下降'}了`,
    taunt: (who: string) => `${who} 吸引了敵人的注意`,
    turret: (who: string) => `${who} 設置了砲台`,
    asleep: (who: string) => `${who} 正在睡覺`,
    noTp: (who: string) => `${who} 的 TP 不足`,
    noLimit: (who: string) => `${who} 的絕技量表還沒滿`,
    escape: (ok: boolean) => (ok ? '成功逃跑了' : '逃跑失敗'),
    poison: (who: string, n: number) => `${who} 因毒受到 ${n} 傷害`,
  },
  clear: { title: '星燈重新亮起', body: '燈喰之獸倒下了。暮霧散去，露米亞迎來久違的晨光。', back: '回到城鎮' },
};
