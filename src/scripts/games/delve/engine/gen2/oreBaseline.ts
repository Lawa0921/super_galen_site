// oreBaseline.ts — 舊生成器（legacy generateWorld）的礦物密度基準（M2a Task 13；spec §4.4「每種礦在對應深度帶的密度落在舊生成器 ±30%」）。
// 量法（legacy/oreBaseline.measure.test.ts 與 gen2/ores.test.ts 同一份，testUtil.oreTally）：
//   深度帶相對該欄的層線：dirt = [surface, rock)、rock = [rock, deep)、deep = [deep, molten)、molten = [molten, H)；
//   密度 = 該帶內礦格數 ÷ 該帶總格數（含洞穴與結構，千分比），x ∈ [100, 4100)、每個種子各算一次再取 3 個種子的平均。
// 量測：commit f606bacca（legacy 輸出自 M2a 起逐位元不變），種子 alpha / beta / gamma。M2b 刪 legacy 時量測測試跟著刪，這些常數留著（gen2 測試的基準）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。

export type OreKind = 'copper' | 'iron' | 'silver' | 'gold';
export type OreBand = 'dirt' | 'rock' | 'deep' | 'molten';
export const ORES4: readonly OreKind[] = ['copper', 'iron', 'silver', 'gold'];
export const BANDS4: readonly OreBand[] = ['dirt', 'rock', 'deep', 'molten'];
export type OreDensity = Readonly<Record<OreKind, Readonly<Record<OreBand, number>>>>;

// 量測值（千分比）
export const LEGACY_ORE_DENSITY: OreDensity = {
  copper: { dirt: 13.397, rock: 11.47, deep: 0.001, molten: 0 },
  iron: { dirt: 0.012, rock: 5.937, deep: 1.988, molten: 0 },
  silver: { dirt: 0, rock: 0.802, deep: 1.954, molten: 0 },
  gold: { dirt: 0, rock: 0, deep: 2.445, molten: 0.514 },
};
