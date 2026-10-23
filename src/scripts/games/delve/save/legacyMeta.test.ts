// legacyMeta.test.ts — Task 16：舊世界的生成附帶資料（LegacyMeta）JSON 往返、壞資料 = SaveFormatError
import { describe, expect, it } from 'vitest';
import { DelveGame } from '../engine/game';
import { SaveFormatError } from './serialize';
import { decodeLegacyMeta, encodeLegacyMeta, type LegacyMetaJSON } from './legacyMeta';

describe('LegacyMeta', { timeout: 120_000 }, () => {
  const L = new DelveGame({ seed: 'fixture-v11' });
  const j = encodeLegacyMeta(L);

  it('LegacyMeta 往返與壞資料', () => {
    const m = decodeLegacyMeta(JSON.parse(JSON.stringify(j)));
    expect(m).toEqual(decodeLegacyMeta(j));
    expect(m.surface).toHaveLength(4200);
    expect(m.regions).toHaveLength(L.regions.length);
    for (const bad of [{ ...j, surface: j.surface.slice(4) }, { ...j, villages: 'x' }, { ...j, frame: null }]) {
      expect(() => decodeLegacyMeta(bad)).toThrow(SaveFormatError);
    }
  });

  it('內容與舊世界遊戲相同（陣列、層線、生成資訊、陶罐、地區）', () => {
    const m = decodeLegacyMeta(j), w = L.world;
    expect([...m.surface]).toEqual([...w.surface]);
    expect([...m.biome]).toEqual([...w.biome]);
    for (const k of ['rock', 'deep', 'molten'] as const) expect([...m.layers[k]]).toEqual([...L.layers![k]]);
    expect([m.surfaceY, m.rockY, m.cavernY, m.moltenY]).toEqual([w.surfaceY, w.rockY, w.cavernY, w.moltenY]);
    expect(m.frame).toEqual({ width: 4200, height: 1200, edgeL: w.surface[0], edgeR: w.surface[4199], cavernY: w.cavernY, moltenY: w.moltenY });
    expect(m.spawn).toEqual(L.spawn);
    expect(m.villages).toEqual(L.villages); expect(m.halls).toEqual(L.halls); expect(m.landmarks).toEqual(L.landmarks);
    expect(m.dungeon).toEqual(L.dungeon); expect(m.structures).toEqual(L.structures); expect(m.springs).toEqual(L.springs);
    expect(m.tablets).toEqual(L.tablets); expect(m.relics).toEqual(L.relics); expect(m.biomes).toEqual(L.biomes);
    expect(m.landforms).toEqual(L.landforms); expect(m.dungeonZone).toEqual(L.dungeonZone);
    expect(m.potDrops).toEqual([...w.potDrops]);
    expect(m.regions.map((r) => r.id)).toEqual(L.regions.map((r) => r.id));
  });

  it('更多壞資料：層線長度、地區、陶罐、型別', () => {
    const bads: unknown[] = [
      null, 'x', { ...j, layers: { ...j.layers, deep: j.layers.rock.slice(8) } },
      { ...j, regions: [{ ...j.regions[0], shape: null }] }, { ...j, potDrops: [[1, [{ item: 'no_such_item', n: 1 }]]] },
      { ...j, spawn: { x: 'a', y: 1 } }, { ...j, dungeon: 3 }, { ...j, structures: [{ kind: 'cabin' }] },
      { ...j, frame: { ...j.frame, width: 0 } }, { ...j, surface: '!!!' },
    ];
    for (const bad of bads) expect(() => decodeLegacyMeta(bad as LegacyMetaJSON)).toThrow(SaveFormatError);
  });
});
