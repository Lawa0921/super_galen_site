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
  ui2: {
    title: { newGame: '新遊戲', cont: '繼續', settings: '設定', overwrite: '已有存檔，開始新遊戲會覆蓋它。要繼續嗎？' },
    town: {
      place: '邊境小鎮 露米亞',
      facilities: { guild: '冒險者公會', shop: '道具店', inn: '旅館', gate: '迷宮入口', settings: '設定' },
      lines: ['暮霧又濃了些。冒險者們，今天要往哪裡去？', '聽說迷宮深處有星燈的光。', '補給品記得在出發前備齊。'],
      soon: (name: string) => `${name}的新介面正在製作中，下一階段開放。`,
    },
    facility: {
      guild: { place: '冒險者公會', npc: '安娜', greet: ['歡迎回來，要整頓隊伍嗎？', '今天也請平安歸來。'] },
      shop: { place: '道具店', npc: '歐里克', greet: ['歡迎光臨！看看有什麼需要的。', '剛進了新貨喔。'] },
      inn: { place: '月影旅館', npc: '瑪莎', greet: ['辛苦了，要休息一下嗎？', '熱湯已經準備好了。'] },
      gate: { place: '迷宮入口', npc: '葛倫', greet: ['要下去了嗎？別逞強。', '裂口今天也在發光。'] },
      leave: '離開',
    },
    dungeon: {
      status: '隊伍狀態', items: '道具', lamp: (n: number) => `歸還之燈 ×${n}`, close: '關閉', askTown: '要回到城鎮嗎？',
      noItems: '沒有可以使用的道具。', used: (item: string, who: string) => `${who} 使用了${item}。`, menuHint: '選單',
    },
    inn: {
      rest: (cost: number) => `休息（${cost} G）`, revive: '復活', ask: (cost: number) => `住一晚要 ${cost} G，要休息嗎？`,
      morning: '──隔天早上', saved: '已存檔。', saveFailed: '存檔失敗了……瀏覽器不允許儲存。',
      nobodyDown: '大家都很有精神呢。', revived: (name: string) => `${name} 醒過來了！`,
    },
    gate: { choose: '選擇樓層', floor: (n: number, name: string) => `第 ${n} 層 ${name}`, locked: '尚未到達', soon: '迷宮畫面在下一階段開放，敬請期待。', ask: (n: number, name: string) => `要前往第 ${n} 層 ${name} 嗎？` },
    shop: {
      buy: '購買', sell: '販賣', owned: (n: number) => `持有 ${n}`, needs: (text: string) => `需要 ${text}`,
      bought: (name: string, n: number) => `${name} ×${n}，謝謝惠顧！`, sold: (name: string, n: number, g: number) => `收下 ${name} ×${n}，這是 ${g} G。`,
      unlocked: (names: string) => `託你的福，現在可以做出 ${names} 了！`, nothing: '沒有可以賣的素材。', canEquip: '能裝備', cannot: '不能裝備',
    },
    guild: {
      formation: '編隊', recruit: '招募', equip: '裝備', status: '狀態', empty: '（空）', unequip: '（卸下）',
      front: (i: number, name: string) => `前排 ${i}：${name}`, back: (i: number, name: string) => `後排 ${i}：${name}`,
      slot: (slot: string, name: string) => `${slot}：${name}`, none: '（未裝備）',
      ask: (name: string) => `要讓 ${name} 加入隊伍嗎？`, recruited: (name: string) => `${name} 加入了隊伍！`, equipped: '裝備好了。',
      learnedAt: (lv: number) => `Lv ${lv} 習得`, ultimate: '絕技', gauge: (n: number) => `量表 ${n}%`,
      roles: {
        noel: '後排。火、冰、雷攻擊；降低敵人能力、毒。', chizuru: '前排。全體攻擊；我方減傷。', liz: '前或後。多段攻擊；降低遇敵、素材掉落加成。',
        sylvie: '後排。單體高傷；先制攻擊、提高逃跑率。', scarlet: '前排。吸引攻擊、替隊友擋傷；消耗 HP 打火屬性大傷害。',
        selene: '後排。治療、復活、解毒；催眠。', safira: '前排。多段攻擊、提高閃避；全隊增益。', bobby: '後排。放置砲台每回合攻擊；道具效果加倍、護盾。',
      } as Record<string, string>,
    },
  },
  clear: { title: '星燈重新亮起', body: '燈喰之獸倒下了。暮霧散去，露米亞迎來久違的晨光。', back: '回到城鎮' },
};
