// stage.ts
import type { StageId, EnemyKind, PathKind, BossId } from './types';
import { FIELD_W } from './constants';

export interface WaveEntry { atMs: number; kind: EnemyKind; x: number; path: PathKind; }
export interface StageDef { name: string; waves: WaveEntry[]; boss: BossId; }

/** 工具：等間隔編隊展開（建表用）。 */
function squad(atMs: number, kind: EnemyKind, path: PathKind, xs: number[], gapMs = 280): WaveEntry[] {
  return xs.map((x, i) => ({ atMs: atMs + i * gapMs, kind, x, path }));
}

export const STAGES: Record<StageId, StageDef> = {
  1: {
    name: 'GRAVEYARD GATE', boss: 'gargoyle',
    waves: [
      ...squad(2000,  'bat',   'descend', [0.3, 0.5, 0.7]),
      ...squad(8000,  'wisp',  'sine',    [0.25, 0.75]),
      ...squad(14000, 'bat',   'swoopR',  [0.1, 0.1, 0.1]),
      ...squad(20000, 'bat',   'swoopL',  [0.9, 0.9, 0.9]),
      ...squad(27000, 'fairy', 'hover',   [0.35, 0.65]),
      ...squad(34000, 'wisp',  'sine',    [0.2, 0.5, 0.8]),
      ...squad(42000, 'bat',   'descend', [0.15, 0.35, 0.55, 0.75]),
      ...squad(50000, 'fairy', 'hover',   [0.5]),
      ...squad(56000, 'bat',   'swoopL',  [0.85, 0.85]),
      ...squad(56000, 'bat',   'swoopR',  [0.15, 0.15]),
      ...squad(64000, 'wisp',  'sine',    [0.3, 0.7]),
      ...squad(70000, 'fairy', 'hover',   [0.25, 0.75]),
      ...squad(78000, 'bat',   'descend', [0.2, 0.4, 0.6, 0.8]),
      ...squad(86000, 'fairy', 'hover',   [0.5]),
      ...squad(92000, 'wisp',  'sine',    [0.4, 0.6]),
    ].sort((a, b) => a.atMs - b.atMs),
  },
  2: {
    name: 'LIBRARY SPIRE', boss: 'grimoire',
    waves: [
      ...squad(2000,  'blade', 'swoopL',  [0.9, 0.9, 0.9]),
      ...squad(7000,  'blade', 'swoopR',  [0.1, 0.1, 0.1]),
      ...squad(13000, 'tome',  'hover',   [0.5]),
      ...squad(20000, 'fairy', 'sine',    [0.3, 0.7]),
      ...squad(27000, 'tome',  'hover',   [0.25, 0.75]),
      ...squad(35000, 'blade', 'descend', [0.2, 0.4, 0.6, 0.8]),
      ...squad(43000, 'tome',  'hover',   [0.5]),
      ...squad(43000, 'fairy', 'sine',    [0.2, 0.8]),
      ...squad(52000, 'blade', 'swoopL',  [0.95, 0.95]),
      ...squad(52000, 'blade', 'swoopR',  [0.05, 0.05]),
      ...squad(60000, 'tome',  'hover',   [0.35, 0.65]),
      ...squad(70000, 'fairy', 'sine',    [0.25, 0.5, 0.75]),
      ...squad(80000, 'tome',  'hover',   [0.2, 0.5, 0.8]),
      ...squad(92000, 'blade', 'descend', [0.3, 0.5, 0.7]),
    ].sort((a, b) => a.atMs - b.atMs),
  },
  3: {
    name: 'CLOCKWORK FOUNDRY', boss: 'bellwright',
    waves: [
      ...squad(2000,  'gear',  'descend', [0.5]),
      ...squad(8000,  'angel', 'sine',    [0.3, 0.7]),
      ...squad(15000, 'gear',  'descend', [0.3, 0.7]),
      ...squad(23000, 'blade', 'swoopL',  [0.9, 0.9, 0.9]),
      ...squad(30000, 'angel', 'sine',    [0.2, 0.5, 0.8]),
      ...squad(38000, 'gear',  'hover',   [0.5]),
      ...squad(46000, 'angel', 'swoopR',  [0.1, 0.1]),
      ...squad(46000, 'blade', 'swoopL',  [0.9, 0.9]),
      ...squad(55000, 'gear',  'descend', [0.25, 0.75]),
      ...squad(64000, 'angel', 'sine',    [0.35, 0.65]),
      ...squad(72000, 'gear',  'hover',   [0.3, 0.7]),
      ...squad(82000, 'blade', 'descend', [0.2, 0.4, 0.6, 0.8]),
      ...squad(92000, 'angel', 'sine',    [0.3, 0.5, 0.7]),
    ].sort((a, b) => a.atMs - b.atMs),
  },
  4: {
    name: 'THE BELFRY', boss: 'deadbell',
    waves: [
      ...squad(2000,  'moth',  'sine',    [0.3, 0.7]),
      ...squad(8000,  'chime', 'hover',   [0.5]),
      ...squad(15000, 'moth',  'swoopL',  [0.9, 0.9, 0.9]),
      ...squad(21000, 'moth',  'swoopR',  [0.1, 0.1, 0.1]),
      ...squad(28000, 'chime', 'hover',   [0.25, 0.75]),
      ...squad(36000, 'fairy', 'sine',    [0.2, 0.5, 0.8]),
      ...squad(44000, 'moth',  'descend', [0.15, 0.35, 0.55, 0.75]),
      ...squad(52000, 'chime', 'hover',   [0.5]),
      ...squad(52000, 'moth',  'sine',    [0.2, 0.8]),
      ...squad(62000, 'chime', 'hover',   [0.35, 0.65]),
      ...squad(72000, 'moth',  'swoopL',  [0.95, 0.95]),
      ...squad(72000, 'moth',  'swoopR',  [0.05, 0.05]),
      ...squad(82000, 'chime', 'hover',   [0.2, 0.5, 0.8]),
      ...squad(94000, 'fairy', 'sine',    [0.3, 0.7]),
    ].sort((a, b) => a.atMs - b.atMs),
  },
};

export interface StageSpawn { kind: EnemyKind; x: number; path: PathKind; }

export class StageRunner {
  readonly stage: StageId;
  private tMs = 0;
  private idx = 0;

  constructor(stage: StageId) { this.stage = stage; }

  get wavesDone(): boolean { return this.idx >= STAGES[this.stage].waves.length; }

  /** 推進時間，回傳本 tick 到期的生成（x 已換算為 px）。 */
  step(dtMs: number): StageSpawn[] {
    this.tMs += dtMs;
    const out: StageSpawn[] = [];
    const waves = STAGES[this.stage].waves;
    while (this.idx < waves.length && waves[this.idx].atMs <= this.tMs) {
      const w = waves[this.idx++];
      out.push({ kind: w.kind, x: w.x * FIELD_W, path: w.path });
    }
    return out;
  }
}
