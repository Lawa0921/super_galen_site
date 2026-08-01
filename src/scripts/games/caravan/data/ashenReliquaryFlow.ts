import type { SaveData } from '../save';
import {
  ashenReliquaryState,
  resolveAshenReliquary,
  type AshenReliquaryState,
  type ReliquaryResolution,
  type ReliquaryRoute,
  type ReliquaryRouteId,
  type ReliquaryStage,
  type ReliquaryStageId,
} from './ashenReliquary';
import {
  RELIQUARY_BATTLE_NAMES,
  reliquaryBattleCleared,
} from './ashenReliquaryCombat';

export type CombatReliquaryStage = ReliquaryStage & {
  battleName: string;
  battleCleared: boolean;
};

export type CombatReliquaryState = Omit<AshenReliquaryState, 'stages'> & {
  stages: CombatReliquaryStage[];
};

function battleGate(route: ReliquaryRoute, battleName: string): ReliquaryRoute {
  return {
    ...route,
    inventoryCost: { ...route.inventoryCost },
    reward: { ...route.reward, inventory: { ...route.reward.inventory } },
    blockers: [...route.blockers, `必須先在「${battleName}」中獲勝。`],
    eligible: false,
  };
}

/** 玩家實際流程：每幕先戰鬥，再從能力、物資與世界立場中選擇一條解法。 */
export function combatGatedReliquaryState(save: SaveData): CombatReliquaryState {
  const base = ashenReliquaryState(save);
  return {
    ...base,
    stages: base.stages.map((stage) => {
      const battleName = RELIQUARY_BATTLE_NAMES[stage.id];
      const battleCleared = reliquaryBattleCleared(save, stage.id);
      return {
        ...stage,
        battleName,
        battleCleared,
        routes: battleCleared
          ? stage.routes.map((route) => ({
              ...route,
              inventoryCost: { ...route.inventoryCost },
              reward: { ...route.reward, inventory: { ...route.reward.inventory } },
              blockers: [...route.blockers],
            }))
          : stage.routes.map((route) => battleGate(route, battleName)),
      };
    }),
  };
}

/** 防止從玩家頁或過期分頁略過該幕正式戰鬥。 */
export function resolveCombatGatedReliquary(
  save: SaveData,
  stageId: ReliquaryStageId,
  routeId: ReliquaryRouteId,
): ReliquaryResolution {
  if (!reliquaryBattleCleared(save, stageId)) {
    throw new Error(`必須先在「${RELIQUARY_BATTLE_NAMES[stageId]}」中獲勝。`);
  }
  return resolveAshenReliquary(save, stageId, routeId);
}
