import { describe, it, expect } from 'vitest';
import { CHARACTER_IDS } from '../characters';
import { ITEMS } from '../items';
import { MATERIALS } from '../materials';
import { REGIONS } from '../regions';
import { STORY, PLACEHOLDERS, NPC_NAMES } from '../story.zh-TW';
import { CHAINS, HERO_TOPUP, chainLength, whenHolds } from './chains';
import { TOWN_FRAGMENTS, shardGrade, isFragmentItem, fragmentName } from './fragments';
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
});
