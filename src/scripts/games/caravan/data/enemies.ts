import type { Move, EnemyUnit } from '../combat';

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
