import type { PieceType } from '../engine/types';

// ── 型別 ───────────────────────────────────────────────────────────────────
export interface SkinDef {
  id: string;
  name: string;
  unlockLevel: number;
  blockUrl: string;
  /** 選填：per-piece 色調覆蓋（0xRRGGBB 整數）。T3 素材任務填入。 */
  tints?: Partial<Record<PieceType, number>>;
}

// ── 目錄 ───────────────────────────────────────────────────────────────────
export const SKIN_CATALOG: SkinDef[] = [
  {
    id: 'neon',
    name: '霓虹',
    unlockLevel: 0,
    blockUrl: '/assets/games/tetris/block.webp',
  },
  {
    id: 'bit8',
    name: '復古 8-BIT',
    unlockLevel: 2,
    blockUrl: '/assets/games/tetris/skins/bit8.webp',
  },
  {
    id: 'rune',
    name: '符文石磚',
    unlockLevel: 4,
    blockUrl: '/assets/games/tetris/skins/rune.webp',
  },
  {
    id: 'holo',
    name: '全息玻璃',
    unlockLevel: 6,
    blockUrl: '/assets/games/tetris/skins/holo.webp',
  },
  {
    id: 'crystal',
    name: '水晶寶石',
    unlockLevel: 9,
    blockUrl: '/assets/games/tetris/skins/crystal.webp',
  },
];

// ── 工具函式 ───────────────────────────────────────────────────────────────
const NEON = SKIN_CATALOG[0];

/** 取得皮膚選擇用的 localStorage key。addr 正規化為小寫；null/''/undefined → 'guest'。 */
function storageKey(addr?: string | null): string {
  const normalized = addr ? addr.toLowerCase() : 'guest';
  return `tetris-skin:${normalized}`;
}

/** skin.unlockLevel <= level → 已解鎖 */
export function isUnlocked(skin: SkinDef, level: number): boolean {
  return level >= skin.unlockLevel;
}

/**
 * 讀取 localStorage 中玩家選擇的皮膚 id。
 * 若 localStorage 不可用或尚未設定，回傳 'neon'。
 */
export function getSelectedSkin(addr?: string | null): string {
  try {
    const val = localStorage.getItem(storageKey(addr));
    return val ?? 'neon';
  } catch {
    return 'neon';
  }
}

/**
 * 將玩家選擇的皮膚 id 寫入 localStorage。
 * 隱私模式等任何錯誤靜默吸收。
 */
export function setSelectedSkin(id: string, addr?: string | null): void {
  try {
    localStorage.setItem(storageKey(addr), id);
  } catch {
    // 靜默
  }
}

/**
 * 解析皮膚：
 * - 未知 id → neon
 * - level 不足解鎖 → neon
 * - 否則回傳對應 SkinDef
 */
export function resolveSkin(id: string, level: number): SkinDef {
  const skin = SKIN_CATALOG.find((s) => s.id === id);
  if (!skin || !isUnlocked(skin, level)) return NEON;
  return skin;
}
