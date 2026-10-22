import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync('art-factory/cs/manifests/development_fixtures.json', 'utf8'));
const fixtures: { path: string; bytes: number; sha256: string; contract: string }[] = manifest.fixtures;
const consumer = readFileSync(manifest.consumer, 'utf8');
const contractIds: Record<string, string> = {
  'sole-weights-v1.glb': 'browser-cs-character-gait-v7',
  'calibration-v17-thumb-patch.json': 'browser-cs-rifle-grip-v7',
  'vest-half-v2.u16': 'browser-cs-character-lod-v7',
  'body-compact-v1.json': 'browser-cs-cmu-body-track-v7',
};

describe('CS development fixture portability', () => {
  it('covers every pinned asset imported by the development loader', () => {
    const imports = [...consumer.matchAll(/from ['"]([^'"]+)\?url['"]/g)].map(match =>
      relative(process.cwd(), resolve(dirname(manifest.consumer), match[1])).replaceAll('\\', '/'));
    expect(imports).toHaveLength(4);
    expect(fixtures.map(fixture => fixture.path).sort()).toEqual(imports.sort());
  });

  it.each(fixtures)('retains the exact bytes and pending contract for $path', fixture => {
    const bytes = readFileSync(fixture.path);
    expect(bytes.length).toBe(fixture.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
    expect(consumer).toContain(fixture.sha256);
    const contractText = readFileSync(fixture.contract, 'utf8');
    expect(contractText).toContain(fixture.path);
    // The grip contract pins its calibration path; the other three contracts
    // also seal the candidate hash. All four hashes are sealed by the loader.
    if (!fixture.path.endsWith('/calibration-v17-thumb-patch.json')) expect(contractText).toContain(fixture.sha256);
    expect(JSON.parse(contractText)).toMatchObject({
      asset_id: contractIds[basename(fixture.path)],
      runtime_publish_allowed: false, external_deployment_allowed: false, assembly_human_review: 'pending',
    });
  });

  it('includes the sealed bytes in the Git index when running from a checkout', () => {
    // A source archive has no Git metadata; the unconditional checks above
    // verify its actual contents. In a checkout, local ignored files must not
    // make the suite pass while the next checkout would lose the fixtures.
    if (!existsSync('.git')) return;
    const result = spawnSync('git', ['ls-files', '--stage', '-z', '--', ...fixtures.map(fixture => fixture.path)], {
      encoding: 'utf8', windowsHide: true,
    });
    expect(result.status, result.error?.message ?? result.stderr).toBe(0);
    const entries = new Map(result.stdout.split('\0').filter(Boolean).map(entry => {
      const [metadata, path] = entry.split('\t');
      const [mode, object, stage] = metadata.split(' ');
      return [path, { mode, object, stage }];
    }));
    for (const fixture of fixtures) {
      const entry = entries.get(fixture.path);
      expect(entry, `Required development fixture is not in Git: ${fixture.path}`).toBeDefined();
      expect(entry).toMatchObject({ mode: '100644', stage: '0' });
      const bytes = readFileSync(fixture.path);
      const object = createHash(entry!.object.length === 64 ? 'sha256' : 'sha1')
        .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      expect(entry!.object, `Git contains different fixture bytes: ${fixture.path}`).toBe(object);
    }
  });
});
