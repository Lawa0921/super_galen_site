import type { Move, EnemyUnit } from '../combat';
import { registerEncounters } from '../expedition';

// ---------------------------------------------------------------------------
// 訓練場（M2，維持不變）
// ---------------------------------------------------------------------------

const dagger: Move = {
  id: 'dagger', name: '短刀', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 6, bonusStat: 'str' },
  narration: '{actor}欺身欺近，短刀刺向{target}，造成 {amount} 點傷害！',
};

function makeGoblinScout(id: string): EnemyUnit {
  return {
    id, name: '哥布林斥候',
    stats: { str: 10, dex: 14, int: 8, cha: 8, con: 10 },
    maxHp: 8, hp: 8, defense: 11,
    moves: [dagger],
    intents: [{ weight: 1, moveId: 'dagger' }], // 只有一招，意圖全攻擊
  };
}

/** 訓練場的固定遭遇：哥布林斥候 x2。每次呼叫回傳全新物件，不共用可變狀態 */
export const TRAINING_ENCOUNTER = (): EnemyUnit[] => [
  makeGoblinScout('goblin-scout-1'),
  makeGoblinScout('goblin-scout-2'),
];

// ---------------------------------------------------------------------------
// M3 遠征遭遇：狼／盜匪（含治療師）／礦坑蜘蛛／哥布林掠奪者／兩隻 boss
// 數值量級比照訓練場哥布林（HP8/def11），boss 落在 HP25-35。
// ---------------------------------------------------------------------------

const wolfBite: Move = {
  id: 'wolf-bite', name: '狼咬', kind: 'attack', target: 'enemy', hitStat: 'dex',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' },
  narration: '{actor}低吼著撲上，獠牙咬向{target}，造成 {amount} 點傷害！',
};

function makeWolf(id: string): EnemyUnit {
  return {
    id, name: '荒野孤狼',
    stats: { str: 12, dex: 15, int: 4, cha: 4, con: 11 },
    maxHp: 10, hp: 10, defense: 12,
    moves: [wolfBite],
    intents: [{ weight: 1, moveId: 'wolf-bite' }],
    loot: { gold: [3, 8] },
  };
}

const banditSlash: Move = {
  id: 'bandit-slash', name: '劈砍', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 8, bonusStat: 'str' },
  narration: '{actor}揮刀劈向{target}，造成 {amount} 點傷害！',
};

function makeBanditThug(id: string): EnemyUnit {
  return {
    id, name: '盜匪打手',
    stats: { str: 13, dex: 12, int: 8, cha: 8, con: 12 },
    maxHp: 12, hp: 12, defense: 13,
    moves: [banditSlash],
    intents: [{ weight: 1, moveId: 'bandit-slash' }],
    loot: { gold: [5, 12], itemId: 'tattered-map', itemChance: 0.15 },
  };
}

const banditMend: Move = {
  id: 'bandit-mend', name: '禁咒止血', kind: 'support', target: 'ally', hitStat: 'cha',
  heal: { dice: 1, sides: 6, bonusStat: 'cha' },
  narration: '{actor}低聲吟誦禁咒，為{target}止住血流，恢復 {amount} 點生命。',
};

const banditDagger: Move = {
  id: 'bandit-dagger', name: '短刃', kind: 'attack', target: 'enemy', hitStat: 'dex',
  damage: { dice: 1, sides: 4, bonusStat: 'dex' },
  narration: '{actor}抽出短刃劃向{target}，造成 {amount} 點傷害！',
};

/** 盜匪的隨隊治療師：意圖在治療同伴與攻擊之間交替（驗證 enemyAct 的 support 目標修繕） */
function makeBanditMedic(id: string): EnemyUnit {
  return {
    id, name: '盜匪祭司',
    stats: { str: 9, dex: 12, int: 10, cha: 14, con: 10 },
    maxHp: 9, hp: 9, defense: 11,
    moves: [banditMend, banditDagger],
    intents: [
      { weight: 1, moveId: 'bandit-mend' },
      { weight: 1, moveId: 'bandit-dagger' },
    ],
    loot: { gold: [4, 9] },
  };
}

const spiderBite: Move = {
  id: 'spider-bite', name: '毒牙', kind: 'attack', target: 'enemy', hitStat: 'dex',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' },
  narration: '{actor}以毒牙刺向{target}，造成 {amount} 點傷害！',
};

function makeMineSpider(id: string): EnemyUnit {
  return {
    id, name: '礦坑蜘蛛',
    stats: { str: 10, dex: 16, int: 2, cha: 2, con: 10 },
    maxHp: 11, hp: 11, defense: 13,
    moves: [spiderBite],
    intents: [{ weight: 1, moveId: 'spider-bite' }],
    loot: { gold: [2, 6], itemId: 'spider-silk', itemChance: 0.3 },
  };
}

const raiderClub: Move = {
  id: 'raider-club', name: '狼牙棒', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 6, bonusStat: 'str' },
  narration: '{actor}掄起狼牙棒砸向{target}，造成 {amount} 點傷害！',
};

function makeGoblinRaider(id: string): EnemyUnit {
  return {
    id, name: '哥布林掠奪者',
    stats: { str: 11, dex: 13, int: 8, cha: 8, con: 10 },
    maxHp: 9, hp: 9, defense: 12,
    moves: [raiderClub],
    intents: [{ weight: 1, moveId: 'raider-club' }],
    loot: { gold: [3, 7], itemId: 'goblin-earring', itemChance: 0.2 },
  };
}

const overseerWhip: Move = {
  id: 'overseer-whip', name: '監工鞭', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 8, bonusStat: 'str' },
  narration: '{actor}揮舞監工鞭抽向{target}，造成 {amount} 點傷害！',
};

const overseerSlam: Move = {
  id: 'overseer-slam', name: '鐵鎚重擊', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 2, sides: 6, bonusStat: 'str' },
  narration: '{actor}掄起沉重鐵鎚砸向{target}，造成 {amount} 點傷害！',
};

/** 廢棄礦坑 boss：礦坑監工 */
function makeMineOverseer(): EnemyUnit {
  return {
    id: 'mine-overseer', name: '礦坑監工',
    stats: { str: 16, dex: 9, int: 8, cha: 6, con: 16 },
    maxHp: 30, hp: 30, defense: 15,
    moves: [overseerWhip, overseerSlam],
    intents: [
      { weight: 2, moveId: 'overseer-whip' },
      { weight: 1, moveId: 'overseer-slam' },
    ],
    loot: { gold: [30, 50], itemId: 'overseer-ledger', itemChance: 0.8 },
  };
}

const chiefAxe: Move = {
  id: 'chief-axe', name: '巨斧劈砍', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 10, bonusStat: 'str' },
  narration: '{actor}掄起巨斧劈向{target}，造成 {amount} 點傷害！',
};

const chiefHowl: Move = {
  id: 'chief-howl', name: '狂野嗥叫', kind: 'support', target: 'ally', hitStat: 'con',
  heal: { dice: 1, sides: 8, bonusStat: 'con' },
  narration: '{actor}仰頭長嗥，體內野性甦醒，恢復 {amount} 點生命。',
};

/** 哥布林巢穴 boss：巢穴頭目（單體，狂嗥招式自我療傷） */
function makeGoblinDenChief(): EnemyUnit {
  return {
    id: 'goblin-den-chief', name: '巢穴頭目',
    stats: { str: 15, dex: 12, int: 9, cha: 10, con: 14 },
    maxHp: 28, hp: 28, defense: 14,
    moves: [chiefAxe, chiefHowl],
    intents: [
      { weight: 3, moveId: 'chief-axe' },
      { weight: 1, moveId: 'chief-howl' },
    ],
    loot: { gold: [35, 55], itemId: 'den-idol', itemChance: 0.9 },
  };
}

/** M3 遭遇表：encounterId -> 產生 EnemyUnit[] 的工廠函式。每次呼叫回傳全新物件。 */
export const ENCOUNTERS: Record<string, () => EnemyUnit[]> = {
  enc_wolf_pair: () => [makeWolf('wolf-1'), makeWolf('wolf-2')],
  enc_bandit_raid: () => [makeBanditThug('bandit-thug-1'), makeBanditMedic('bandit-medic-1')],
  enc_mine_spiders: () => [makeMineSpider('mine-spider-1'), makeMineSpider('mine-spider-2')],
  enc_goblin_raiders: () => [
    makeGoblinRaider('goblin-raider-1'),
    makeGoblinRaider('goblin-raider-2'),
  ],
  enc_mine_overseer: () => [makeMineOverseer()],
  enc_goblin_den_chief: () => [makeGoblinDenChief()],
};

registerEncounters(ENCOUNTERS);
