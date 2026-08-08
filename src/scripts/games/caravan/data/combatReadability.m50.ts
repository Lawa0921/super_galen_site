import type { Move, PartyMember } from '../combat';
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
 * isMystic 由 M41/M44 的 arcana 真實規則提供，避免用元素外觀猜測魔法。
 */
export function combatMoveForecast(
  actor: PartyMember,
  move: Move,
  isMystic = false,
): CombatMoveForecast {
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

  const formation = formationAttackProfile(actor.formationRow, move, isMystic);
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

/**
 * 所有戰鬥頁本來就直接顯示 move.name；M50 在 runtime 讓名稱成為可預判資訊，
 * 因此前線崩潰改變 formationRow 後，下一次 render 也會同步反映新站位。
 */
export function combatMoveDisplayName(
  actor: PartyMember,
  move: Move,
  isMystic = false,
): string {
  const forecast = combatMoveForecast(actor, move, isMystic);
  const baseName = move.kind === 'guard' ? '防禦架勢' : move.name;
  if (move.kind === 'guard') return `${baseName}〔${forecast.shortLabel}〕`;
  if (move.kind === 'attack' && !isMystic && forecast.shortLabel) {
    return `${baseName}〔${forecast.shortLabel}〕`;
  }
  return baseName;
}
