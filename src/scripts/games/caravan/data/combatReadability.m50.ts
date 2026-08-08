import type { Move, PartyMember } from '../combat';
import { mysticRuleForMove } from './arcana';
import { formationAttackProfile } from './martialEngagement.m49';

export interface CombatMoveForecast {
  shortLabel: string;
  hint: string;
  penalized: boolean;
}

const ROW_LABEL: Record<'front' | 'back', string> = {
  front: '前排',
  back: '後排',
};

/**
 * M50：把 M49 已經存在的站位規則在玩家按下招式前就說清楚。
 * 只讀 runtime 狀態，不改戰鬥數值；真正結算仍由 combat.ts 使用同一份 M49 規則。
 */
export function combatMoveForecast(actor: PartyMember, move: Move): CombatMoveForecast {
  const row = actor.formationRow === 'back' ? 'back' : 'front';

  if (move.kind === 'guard') {
    return row === 'front'
      ? {
          shortLabel: '守勢・可護衛',
          hint: '防禦 +4；位於前排時可替隊友攔截敵方單體攻擊。',
          penalized: false,
        }
      : {
          shortLabel: '守勢・自保',
          hint: '防禦 +4；後排守勢只能保護自己，不能隔空替前排隊友攔截。',
          penalized: false,
        };
  }

  if (move.kind !== 'attack') {
    return { shortLabel: '', hint: '', penalized: false };
  }

  const mystic = !!mysticRuleForMove(move);
  const formation = formationAttackProfile(actor.formationRow, move, mystic);
  const rowLabel = ROW_LABEL[row];

  if (formation.engagement === 'mystic') {
    return {
      shortLabel: '魔法・站位自由',
      hint: `${rowLabel}施法：真正的秘法／神術不受近戰與遠程的站位命中懲罰。`,
      penalized: false,
    };
  }

  const kindLabel = formation.engagement === 'ranged' ? '遠程' : '近戰';
  if (formation.hitModifier < 0) {
    return {
      shortLabel: `${kindLabel}・命中 ${formation.hitModifier}`,
      hint: formation.message,
      penalized: true,
    };
  }

  return {
    shortLabel: `${kindLabel}・站位適配`,
    hint: `${rowLabel}${kindLabel}：目前站位不會受到額外命中懲罰。`,
    penalized: false,
  };
}
