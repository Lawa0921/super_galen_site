// relics.ts
import type { RelicId, RelicDef, Modifiers } from './types';

export const RELICS: Record<RelicId, RelicDef> = {
  split:     { id: 'split',     name: '裂變魔彈', desc: '魔彈命中後分裂出 2 顆斜向小彈' },
  familiar:  { id: 'familiar',  name: '影子使魔', desc: '僚機複製本體 50% 攻擊' },
  magnet:    { id: 'magnet',    name: '貪婪磁石', desc: '金幣拾取範圍大幅擴大' },
  moonlight: { id: 'moonlight', name: '月光護符', desc: '殘機 +1（立即生效）' },
  feather:   { id: 'feather',   name: '咒速羽毛', desc: '移速 +20%、被彈判定 -15%' },
  catalyst:  { id: 'catalyst',  name: '爆炎觸媒', desc: '爆炎 +1，爆炎後留下火場' },
  echo:      { id: 'echo',      name: '回音鈴',   desc: 'OVERDRIVE 持續 +50%' },
  pact:      { id: 'pact',      name: '血色契約', desc: '攻擊 +50%，殘機上限 -1' },
  stardust:  { id: 'stardust',  name: '星屑掃帚', desc: '低速模式擦彈累積 +30%' },
};

export const BASE_MODIFIERS: Modifiers = {
  splitShot: false, familiar: false, magnet: false,
  speedMult: 1, hitboxMult: 1, fireField: false,
  overdriveDurMult: 1, atkMult: 1, lifeCapDelta: 0, focusGrazeBonus: 0,
};

/** 從未持有的遺物中抽 3 個（不足則全給）。Fisher–Yates 取前段。 */
export function draftRelics(rng: () => number, owned: RelicId[]): RelicId[] {
  const pool = (Object.keys(RELICS) as RelicId[]).filter((id) => !owned.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
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
  }
  return m;
}
