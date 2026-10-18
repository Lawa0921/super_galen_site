import { describe, it, expect } from 'vitest';
import { CHARACTER_IDS } from '../characters';
import { ITEMS } from '../items';
import { MATERIALS } from '../materials';
import { REGIONS } from '../regions';
import { STORY, PLACEHOLDERS, NPC_NAMES } from '../story.zh-TW';
import { CHAINS, HERO_TOPUP, chainLength, whenHolds } from './chains';
import { TOWN_FRAGMENTS, shardGrade, isFragmentItem, fragmentName, SHARD_PRICE, SHARD_DROP, TOWN_DROP, PERKS, ABSORB_GAIN } from './fragments';
import { ACT_DEPTHS, CHAT_COUNT, SCENE_IDS, STAGES, MAJOR_SCENES, isSceneId, lineCap, memScene, sceneKind } from './scenes';

const COMPANIONS = CHARACTER_IDS.filter((id) => id !== 'hero' && id !== 'rin');

describe('story data', () => {
  it('every chain is as long as the spec says', () => {
    expect(chainLength('hero')).toBe(10);
    expect(chainLength('rin')).toBe(7);
    for (const id of COMPANIONS) expect(chainLength(id)).toBe(5);
    expect(CHARACTER_IDS.reduce((n, id) => n + chainLength(id), 0)).toBe(57);
  });

  it("the story chains open in the spec's order of depth", () => {
    const depths = [4, 6, 9, 12, 15, 18, 21, 24, 25, 30];
    expect(CHAINS.hero.pieces.map((p) => p.minDepth)).toEqual(depths);
    expect(CHAINS.hero.pieces[8].bossOnly).toBe(true);
    expect(CHAINS.hero.pieces[9].bossOnly).toBe(true);
    expect(HERO_TOPUP.map((t) => t.depth)).toEqual([depths[8], depths[9]]);
    expect(CHAINS.rin.pieces.map((p) => p.minDepth)).toEqual([1, 3, 4, 6, 8, 10, 15]);
    expect(CHAINS.rin.pieces[6].minDepth).toBeGreaterThan(ACT_DEPTHS.act3);
    expect(CHAINS.hero.key && CHAINS.rin.key).toBe(true);
  });

  it("a companion's last two pieces wait for depth 6", () => {
    for (const id of COMPANIONS) {
      const p = CHAINS[id].pieces;
      expect(p.slice(0, 3).map((x) => x.minDepth)).toEqual([1, 1, 1]);
      expect(p[3].minDepth).toBeGreaterThanOrEqual(6);
      expect(p[4].minDepth).toBeGreaterThanOrEqual(6);
      expect(CHAINS[id].key).toBe(false);
    }
  });

  it('the hero and Rin drop only on the main road; every chain names a real region', () => {
    for (const id of ['hero', 'rin'] as const) for (const p of CHAINS[id].pieces) expect(p.regions).toEqual(['mainline']);
    for (const id of CHARACTER_IDS) {
      for (const p of CHAINS[id].pieces) {
        expect(p.regions.length).toBeGreaterThan(0);
        for (const r of p.regions) expect(REGIONS[r]).toBeDefined();
      }
    }
  });

  it('companion chains drop every piece from all of their regions, and gain the spec stat', () => {
    const spec: Record<string, { regions: string[]; gain: Record<string, number> }> = {
      selene: { regions: ['mainline', 'frost'], gain: { wil: 2 } }, chizuru: { regions: ['frost', 'mainline'], gain: { str: 2 } },
      safira: { regions: ['blaze'], gain: { agi: 2 } }, sylvie: { regions: ['mire'], gain: { agi: 2 } },
      noel: { regions: ['storm'], gain: { int: 2 } }, bobby: { regions: ['mainline', 'iron'], gain: { int: 2 } },
      liz: { regions: ['shade'], gain: { agi: 2 } }, scarlet: { regions: ['iron'], gain: { str: 2 } },
    };
    for (const [id, want] of Object.entries(spec)) {
      const chain = CHAINS[id as keyof typeof CHAINS];
      for (const p of chain.pieces) expect(p.regions).toEqual(want.regions);
      expect(chain.gain).toEqual(want.gain);
    }
    expect(CHAINS.hero.gain).toEqual({ str: 1, int: 1, agi: 1, wil: 1 });
    expect(CHAINS.rin.gain).toEqual({ agi: 2 });
  });

  it('the fragment tables match the brief', () => {
    expect(SHARD_PRICE).toEqual({ dim: 30, clear: 80, vivid: 200 });
    expect(SHARD_DROP).toEqual({ boss: 1, elite: 0.5, chest: 0.08, vault: 0.5 });
    expect(TOWN_DROP).toEqual({ boss: 0.25, elite: 0.15, chest: 0.03, vault: 0.2 });
    expect(PERKS).toEqual({ shopDiscountPct: 10, meal: { stat: 'def', pct: 5 }, shardPriceMul: 1.25, setRecipeLess: 2 });
    expect(ABSORB_GAIN.dim).toEqual({ hp: 6, tp: 2, atk: 1, def: 1, mag: 1, res: 1, spd: 1 });
    expect(ABSORB_GAIN.clear).toEqual({ hp: 12, tp: 4, atk: 2, def: 2, mag: 2, res: 2, spd: 2 });
    expect(ABSORB_GAIN.vivid).toEqual({ hp: 18, tp: 6, atk: 3, def: 3, mag: 3, res: 3, spd: 3 });
    const row = (id: string) => TOWN_FRAGMENTS.find((f) => f.id === id)!;
    expect(TOWN_FRAGMENTS.map((f) => f.id)).toEqual(['orik', 'marta', 'anna', 'glen', 'doran']);
    expect([row('orik').regions, row('orik').minDepth, row('orik').reward, row('orik').perk, row('orik').questHook]).toEqual([['shade'], 4, { gold: 300 }, 'shop-discount', 'orik-hat']);
    expect([row('marta').regions, row('marta').minDepth, row('marta').reward, row('marta').perk, row('marta').questHook]).toEqual([['mainline'], 5, { items: { phoenix: 2 } }, 'inn-meal', 'marta-diary']);
    expect([row('anna').regions, row('anna').minDepth, row('anna').reward, row('anna').perk, row('anna').questHook]).toEqual(['any', 8, { items: { 'star-tear': 1 } }, 'shard-price', 'anna-name']);
    expect([row('glen').regions, row('glen').minDepth, row('glen').reward, row('glen').perk, row('glen').questHook]).toEqual([['mainline'], 15, { gold: 500 }, 'portal-reroll', 'glen-first']);
    expect([row('doran').regions, row('doran').minDepth, row('doran').reward, row('doran').perk, row('doran').questHook]).toEqual([['iron'], 4, { items: { 'king-scale': 1 } }, 'set-recipe', 'doran-master']);
  });

  it('when always holds before the calendar exists', () => {
    const p = CHAINS.selene.pieces;
    expect(p[1].when?.moon).toEqual(['full']);
    expect(p[3].when?.moon).toEqual(['full']);
    expect(p[4].when?.moon).toEqual(['new']);
    for (const i of [1, 3, 4]) expect(whenHolds(p[i].when)).toBe(true);
    expect(whenHolds(undefined)).toBe(true);
  });

  it('the catalogue covers 57 memories, the acts, Rin, the finale, chats and returns', () => {
    expect(SCENE_IDS.filter((s) => s.startsWith('mem:')).length).toBe(57);
    const chats = CHARACTER_IDS.reduce((n, id) => n + CHAT_COUNT[id], 0);
    expect(SCENE_IDS.filter((s) => s.startsWith('chat:')).length).toBe(chats);
    expect(SCENE_IDS.filter((s) => s.startsWith('town:')).length).toBe(5);
    for (const s of ['prologue', 'act1-after', 'act2', 'act3', 'act4', 'rin-reveal', 'finale'] as const) expect(SCENE_IDS).toContain(s);
    expect(new Set(SCENE_IDS).size).toBe(SCENE_IDS.length);
    expect(memScene('rin', 3)).toBe('mem:rin:3');
    expect(MAJOR_SCENES.every((s) => sceneKind(s) === 'major')).toBe(true);
  });

  it('isSceneId rejects what the catalogue lacks', () => {
    for (const v of ['mem:hero:11', 'mem:rin:0', 'chat:noel:3', 'town:x', 'nope', 3, null]) expect(isSceneId(v)).toBe(false);
    for (const s of SCENE_IDS) expect(isSceneId(s)).toBe(true);
  });

  it('every scene has a title, a summary and lines within its cap', () => {
    const speakers = new Set<string>([...CHARACTER_IDS, ...Object.keys(NPC_NAMES), 'narrator']);
    expect(lineCap('act1-after')).toBe(3);
    expect(lineCap('mem:hero:9')).toBe(12);
    expect(lineCap('mem:rin:7')).toBe(12);
    expect(lineCap('mem:hero:1')).toBe(4);
    expect(lineCap('chat:noel:1')).toBe(3);
    expect(lineCap('town:orik')).toBe(8);
    expect(lineCap('act2')).toBe(12);
    for (const id of SCENE_IDS) {
      const sc = STORY.scenes[id];
      expect(sc.title.trim()).not.toBe('');
      expect(sc.summary.trim()).not.toBe('');
      expect(sc.summary).not.toMatch(/TODO/);
      expect(sc.lines.length).toBeGreaterThanOrEqual(1);
      expect(sc.lines.length).toBeLessThanOrEqual(lineCap(id));
      for (const l of sc.lines) {
        expect(l.text.trim()).not.toBe('');
        expect(l.text).not.toMatch(/TODO/);
        expect(speakers.has(l.who)).toBe(true);
      }
    }
  });

  it('every town fragment has a person, a story, a result and a quest hook', () => {
    expect(TOWN_FRAGMENTS.length).toBe(5);
    for (const f of TOWN_FRAGMENTS) {
      expect(f.item).toBe(`tf-${f.id}`);
      expect(f.npc.trim()).not.toBe('');
      expect(f.reward.gold !== undefined || Object.keys(f.reward.items ?? {}).length > 0).toBe(true);
      for (const it of Object.keys(f.reward.items ?? {})) expect(ITEMS[it] ?? MATERIALS[it]).toBeDefined();
      expect(STORY.town[f.id].lost.trim()).not.toBe('');
      expect(STORY.town[f.id].after.trim()).not.toBe('');
      expect(f.questHook.trim()).not.toBe('');
      expect(SCENE_IDS).toContain(`town:${f.id}`);
    }
  });

  it('every stage has town lines and every facility greets in every stage', () => {
    for (const st of STAGES) {
      expect(STORY.townLines[st].length).toBeGreaterThanOrEqual(3);
      for (const f of ['guild', 'shop', 'inn', 'gate', 'forge'] as const) expect(STORY.greet[f][st].length).toBeGreaterThanOrEqual(2);
      expect(STORY.truths[st].trim()).not.toBe('');
    }
    expect(STORY.absorb.length).toBeGreaterThanOrEqual(1);
    for (const id of CHARACTER_IDS) expect(STORY.people[id].length).toBe(3);
  });

  it('town lines and greetings start from the current copy (as literals, not references)', () => {
    expect(STORY.townLines.prologue.slice(0, 3)).toEqual(['暮霧又濃了些。冒險者們，今天要往哪裡去？', '聽說迷宮深處有星燈的光。', '補給品記得在出發前備齊。']);
    expect(STORY.greet.guild.act1).toEqual(['歡迎回來，要整頓隊伍嗎？', '今天也請平安歸來。']);
    expect(STORY.greet.forge.after).toEqual(['爐火正旺。要拆、要打，還是要重新鍛一回？', '帶素材來了嗎？好鐵配好手藝。']);
    expect(STORY.greet.guild.act1).not.toBe(STORY.greet.guild.act2);
  });

  it('shards deepen with depth', () => {
    for (const r of [0, 0.5, 0.99]) expect(shardGrade(1, r)).toBe('dim');
    expect(shardGrade(40, 0)).toBe('vivid');
    expect(shardGrade(8, 0.1)).toBe('clear');
  });

  it('fragment items are recognised and named', () => {
    expect(isFragmentItem('shard-dim')).toBe(true);
    expect(isFragmentItem('tf-anna')).toBe(true);
    expect(isFragmentItem('phoenix')).toBe(false);
    expect(fragmentName('shard-vivid')).toBe('鮮明的碎片');
    expect(fragmentName('tf-orik')).toBe(`${TOWN_FRAGMENTS[0].npc}的記憶碎片`);
    expect(fragmentName('phoenix')).toBeUndefined();
  });

  it('placeholders are registered', () => {
    expect(PLACEHOLDERS.size).toBeGreaterThan(0);
    expect(PLACEHOLDERS.has(STORY.scenes.prologue.lines[0].text)).toBe(true);
  });

  it('the milestone cards and the survive line are story copy, found by the placeholder sweep', () => {
    for (const t of [STORY.survived, STORY.act1Card.title, STORY.act1Card.body, STORY.endingTitle]) expect(PLACEHOLDERS.has(t), t).toBe(true);
  });
});
