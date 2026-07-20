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
    art: '/assets/games/caravan/enemy-goblin-scout.webp',
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
    art: '/assets/games/caravan/enemy-wolf.webp',
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
    art: '/assets/games/caravan/enemy-bandit-thug.webp',
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
    art: '/assets/games/caravan/enemy-bandit-medic.webp',
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
  applyStatus: { kind: 'poison', duration: 2, potency: 2 }, // M7：毒牙見血封喉
  narration: '{actor}以毒牙刺向{target}，造成 {amount} 點傷害！',
};

function makeMineSpider(id: string): EnemyUnit {
  return {
    id, name: '礦坑蜘蛛',
    stats: { str: 10, dex: 16, int: 2, cha: 2, con: 10 },
    art: '/assets/games/caravan/enemy-mine-spider.webp',
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
    art: '/assets/games/caravan/enemy-goblin-raider.webp',
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
    art: '/assets/games/caravan/enemy-mine-overseer.webp',
    maxHp: 30, hp: 30, defense: 15,
    moves: [overseerWhip, overseerSlam],
    intents: [
      { weight: 2, moveId: 'overseer-whip' },
      { weight: 1, moveId: 'overseer-slam' },
    ],
    enrage: { threshold: 0.5, potency: 2 }, // M10：半血激怒
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
    art: '/assets/games/caravan/enemy-goblin-den-chief.webp',
    maxHp: 28, hp: 28, defense: 14,
    moves: [chiefAxe, chiefHowl],
    intents: [
      { weight: 3, moveId: 'chief-axe' },
      { weight: 1, moveId: 'chief-howl' },
    ],
    enrage: { threshold: 0.5, potency: 2 }, // M10：半血激怒
    loot: { gold: [35, 55], itemId: 'den-idol', itemChance: 0.9 },
  };
}

// ---------------------------------------------------------------------------
// M5 內容擴充遭遇：霧嶺山賊／鹽晶魔物／古戰場亡靈（各 2 型）＋鹽晶洞窟 boss
// （帶 guard 招，驗證 enemyAct 架盾 AI 路徑——engine 本已支援，見 combat.ts
// performMove 的 guard 分支不吃 target 參數，無需修改）。
// ---------------------------------------------------------------------------

const ridgeSlash: Move = {
  id: 'ridge-slash', name: '彎刀斜劈', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 8, bonusStat: 'str' },
  narration: '{actor}持彎刀斜劈向{target}，造成 {amount} 點傷害！',
};

function makeRidgeSkirmisher(id: string): EnemyUnit {
  return {
    id, name: '山嵐游擊手',
    stats: { str: 13, dex: 14, int: 8, cha: 8, con: 11 },
    art: '/assets/games/caravan/enemy-ridge-skirmisher.webp',
    maxHp: 13, hp: 13, defense: 13,
    moves: [ridgeSlash],
    intents: [{ weight: 1, moveId: 'ridge-slash' }],
    loot: { gold: [4, 9], itemId: 'tattered-map', itemChance: 0.15 },
  };
}

const ridgeArrow: Move = {
  id: 'ridge-arrow', name: '山嵐箭', kind: 'attack', target: 'enemy', hitStat: 'dex',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' },
  narration: '{actor}拉弓疾射，箭矢自迷霧中射向{target}，造成 {amount} 點傷害！',
};

function makeRidgeArcher(id: string): EnemyUnit {
  return {
    id, name: '山嵐弓手',
    stats: { str: 9, dex: 16, int: 9, cha: 8, con: 9 },
    art: '/assets/games/caravan/enemy-ridge-archer.webp',
    maxHp: 10, hp: 10, defense: 12,
    moves: [ridgeArrow],
    intents: [{ weight: 1, moveId: 'ridge-arrow' }],
    loot: { gold: [3, 8] },
  };
}

const saltShardThrow: Move = {
  id: 'salt-shard-throw', name: '鹽刃投擲', kind: 'attack', target: 'enemy', hitStat: 'dex',
  damage: { dice: 1, sides: 8, bonusStat: 'dex' },
  narration: '{actor}甩手擲出鋒利的鹽晶碎片，狠狠扎入{target}，造成 {amount} 點傷害！',
};

function makeSaltWraith(id: string): EnemyUnit {
  return {
    id, name: '鹽晶亡魂',
    stats: { str: 8, dex: 15, int: 12, cha: 6, con: 12 },
    art: '/assets/games/caravan/enemy-salt-wraith.webp',
    maxHp: 14, hp: 14, defense: 14,
    moves: [saltShardThrow],
    intents: [{ weight: 1, moveId: 'salt-shard-throw' }],
    loot: { gold: [5, 10], itemId: 'salt', itemChance: 0.35 },
  };
}

const crystalSlam: Move = {
  id: 'crystal-slam', name: '鹽晶重擊', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 8, bonusStat: 'str' },
  narration: '{actor}掄起厚重的鹽晶巨拳砸向{target}，造成 {amount} 點傷害！',
};

function makeSaltGolem(id: string): EnemyUnit {
  return {
    id, name: '鹽晶傀儡',
    stats: { str: 16, dex: 8, int: 4, cha: 4, con: 17 },
    art: '/assets/games/caravan/enemy-salt-golem.webp',
    maxHp: 19, hp: 19, defense: 16,
    moves: [crystalSlam],
    intents: [{ weight: 1, moveId: 'crystal-slam' }],
    loot: { gold: [6, 12], itemId: 'salt', itemChance: 0.4 },
  };
}

const spectralSlash: Move = {
  id: 'spectral-slash', name: '幽魂劍斬', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 10, bonusStat: 'str' },
  narration: '{actor}揮舞透明的劍影斬向{target}，造成 {amount} 點傷害！',
};

function makeRuinsWraith(id: string): EnemyUnit {
  return {
    id, name: '亡靈劍魂',
    stats: { str: 14, dex: 12, int: 9, cha: 6, con: 13 },
    art: '/assets/games/caravan/enemy-ruins-wraith.webp',
    maxHp: 17, hp: 17, defense: 15,
    moves: [spectralSlash],
    intents: [{ weight: 1, moveId: 'spectral-slash' }],
    loot: { gold: [8, 15], itemId: 'ghostflame-staff', itemChance: 0.12 },
  };
}

const boneArrow: Move = {
  id: 'bone-arrow', name: '枯骨箭', kind: 'attack', target: 'enemy', hitStat: 'dex',
  damage: { dice: 1, sides: 8, bonusStat: 'dex' },
  narration: '{actor}拉開枯骨弓，箭矢帶著寒氣射向{target}，造成 {amount} 點傷害！',
};

function makeRuinsArcher(id: string): EnemyUnit {
  return {
    id, name: '折戟遊魂',
    stats: { str: 9, dex: 15, int: 9, cha: 6, con: 12 },
    art: '/assets/games/caravan/enemy-ruins-archer.webp',
    maxHp: 14, hp: 14, defense: 14,
    moves: [boneArrow],
    intents: [{ weight: 1, moveId: 'bone-arrow' }],
    loot: { gold: [7, 13], itemId: 'ashveil-robe', itemChance: 0.12 },
  };
}

const sovereignCrystalCrush: Move = {
  id: 'sovereign-crystal-crush', name: '鹽晶碎壓', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 2, sides: 8, bonusStat: 'str' },
  applyStatus: { kind: 'stun', duration: 1 }, // M7：碎壓震得人眼冒金星
  narration: '{actor}雙拳凝聚鹽晶之力，重重砸向{target}，造成 {amount} 點傷害！',
};

const sovereignBrineWard: Move = {
  id: 'sovereign-brine-ward', name: '鹵殼護體', kind: 'guard', target: 'self', hitStat: 'con',
  narration: '{actor}周身湧起濃稠鹵水，凝成一層堅硬的鹽殼護體。',
};

/** 鹽晶洞窟 boss：鹽晶洞主（單體，鹵殼護體為 guard 招，驗證架盾 AI） */
function makeSaltCavernSovereign(): EnemyUnit {
  return {
    id: 'salt-cavern-sovereign', name: '鹽晶洞主',
    stats: { str: 14, dex: 10, int: 12, cha: 10, con: 18 },
    art: '/assets/games/caravan/enemy-salt-cavern-sovereign.webp',
    maxHp: 38, hp: 38, defense: 16,
    moves: [sovereignCrystalCrush, sovereignBrineWard],
    intents: [
      { weight: 3, moveId: 'sovereign-crystal-crush' },
      { weight: 1, moveId: 'sovereign-brine-ward' },
    ],
    enrage: { threshold: 0.5, potency: 3 }, // M10：半血激怒
    loot: { gold: [40, 65], itemId: 'salt-crystal-core', itemChance: 0.85 },
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
  // ---- M5 內容擴充 ----
  enc_ridge_bandits: () => [makeRidgeSkirmisher('ridge-skirmisher-1'), makeRidgeArcher('ridge-archer-1')],
  enc_salt_crystals: () => [makeSaltWraith('salt-wraith-1'), makeSaltGolem('salt-golem-1')],
  enc_ruins_undead: () => [makeRuinsWraith('ruins-wraith-1'), makeRuinsArcher('ruins-archer-1')],
  enc_salt_cavern_boss: () => [makeSaltCavernSovereign()],
};

registerEncounters(ENCOUNTERS);
