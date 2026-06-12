// relics.ts
import type { RelicId, RelicDef, Modifiers } from './types';

export const RELICS: Record<RelicId, RelicDef> = {
  // ── common（9 種既有） ──
  split:     { id: 'split',     name: '裂變魔彈', desc: '魔彈命中後分裂出 2 顆斜向小彈',          rarity: 'common' },
  familiar:  { id: 'familiar',  name: '影子使魔', desc: '僚機複製本體 50% 攻擊',                  rarity: 'common' },
  magnet:    { id: 'magnet',    name: '貪婪磁石', desc: '金幣拾取範圍大幅擴大',                   rarity: 'common' },
  moonlight: { id: 'moonlight', name: '月光護符', desc: '殘機 +1（立即生效）',                    rarity: 'common' },
  feather:   { id: 'feather',   name: '咒速羽毛', desc: '移速 +20%、被彈判定 -15%',               rarity: 'common' },
  catalyst:  { id: 'catalyst',  name: '爆炎觸媒', desc: '爆炎 +1，爆炎後留下火場',               rarity: 'common' },
  echo:      { id: 'echo',      name: '回音鈴',   desc: 'OVERDRIVE 持續 +50%',                    rarity: 'common' },
  pact:      { id: 'pact',      name: '血色契約', desc: '攻擊 +50%，殘機上限 -1',                 rarity: 'common' },
  stardust:  { id: 'stardust',  name: '星屑掃帚', desc: '低速模式擦彈累積 +30%',                  rarity: 'common' },
  // ── rare（6 種新增） ──
  pierce:    { id: 'pierce',    name: '貫通魔彈', desc: '自機彈可穿透 1 個敵人',                  rarity: 'rare'   },
  homing:    { id: 'homing',    name: '追蹤使魔', desc: '使魔彈自動瞄準最近敵人（附加使魔效果）', rarity: 'rare'   },
  chronos:   { id: 'chronos',   name: '時停懷錶', desc: 'OVERDRIVE 引爆瞬間全場敵彈凍結 1.5 秒', rarity: 'rare'   },
  pendulum:  { id: 'pendulum',  name: '鐘擺護符', desc: '爆炎術無敵時間 +1.2 秒',                 rarity: 'rare'   },
  starshard: { id: 'starshard', name: '星之碎片', desc: '每 5 次擦彈額外噴 1 金幣',               rarity: 'rare'   },
  bloodmoon: { id: 'bloodmoon', name: '血月之眼', desc: '10% 機率暴擊（傷害 ×2）',               rarity: 'rare'   },
};

export const BASE_MODIFIERS: Modifiers = {
  splitShot: false, familiar: false, magnet: false,
  speedMult: 1, hitboxMult: 1, fireField: false,
  overdriveDurMult: 1, atkMult: 1, lifeCapDelta: 0, focusGrazeBonus: 0,
  // F4 新增欄位預設
  pierce: false, homingFamiliar: false, freezeOnOverdrive: false,
  infernoInvulnBonus: 0, grazeCoinEvery: 0, critChance: 0,
};

/**
 * 稀有度分組抽選（F4）：
 * - 3 個 slot，每 slot 先 rng() < 0.25 決定嘗試 rare 池
 * - rare 池抽空則 fallback 到 common 池（反之亦然）
 * - 不重複、排除已持有、最多 3 個
 */
export function draftRelics(rng: () => number, owned: RelicId[]): RelicId[] {
  const allIds = Object.keys(RELICS) as RelicId[];
  const available = allIds.filter((id) => !owned.includes(id));

  const rarePool = available.filter((id) => RELICS[id].rarity === 'rare');
  const commonPool = available.filter((id) => RELICS[id].rarity === 'common');

  // Fisher–Yates 洗牌各池
  function shuffle(arr: RelicId[]): RelicId[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffledRare = shuffle(rarePool);
  const shuffledCommon = shuffle(commonPool);
  let ri = 0; // rare 池指標
  let ci = 0; // common 池指標

  const picks: RelicId[] = [];
  for (let slot = 0; slot < 3; slot++) {
    if (picks.length >= available.length) break; // 可選用完
    const wantRare = rng() < 0.25;
    if (wantRare) {
      // 嘗試 rare，抽空則 fallback common
      if (ri < shuffledRare.length) {
        picks.push(shuffledRare[ri++]);
      } else if (ci < shuffledCommon.length) {
        picks.push(shuffledCommon[ci++]);
      }
    } else {
      // 嘗試 common，抽空則 fallback rare
      if (ci < shuffledCommon.length) {
        picks.push(shuffledCommon[ci++]);
      } else if (ri < shuffledRare.length) {
        picks.push(shuffledRare[ri++]);
      }
    }
  }
  return picks;
}

/** 聚合持有遺物為單一修正值物件。moonlight/catalyst 的即時資源效果由 game.ts 在拾取當下處理。 */
export function computeModifiers(owned: RelicId[]): Modifiers {
  const m: Modifiers = { ...BASE_MODIFIERS };
  for (const id of owned) {
    if (id === 'split') m.splitShot = true;
    else if (id === 'familiar') m.familiar = true;
    else if (id === 'magnet') m.magnet = true;
    else if (id === 'feather') { m.speedMult *= 1.2; m.hitboxMult *= 0.85; }
    else if (id === 'catalyst') m.fireField = true;
    else if (id === 'echo') m.overdriveDurMult *= 1.5;
    else if (id === 'pact') { m.atkMult *= 1.5; m.lifeCapDelta -= 1; }
    else if (id === 'stardust') m.focusGrazeBonus += 0.3;
    // moonlight：純即時效果（+1 命），無持續修正
    // ── F4 rare ──
    else if (id === 'pierce') m.pierce = true;
    else if (id === 'homing') { m.familiar = true; m.homingFamiliar = true; }
    else if (id === 'chronos') m.freezeOnOverdrive = true;
    else if (id === 'pendulum') m.infernoInvulnBonus += 1200;
    else if (id === 'starshard') m.grazeCoinEvery = 5;
    else if (id === 'bloodmoon') m.critChance += 0.1;
  }
  return m;
}
