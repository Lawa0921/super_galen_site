import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = 'public/assets/games/cs';
const registry = JSON.parse(readFileSync('art-factory/cs/manifests/asset_registry.json', 'utf8'));
const queue = JSON.parse(readFileSync('art-factory/cs/manifests/asset_assembly_review_queue.json', 'utf8'));
const runtimeAssets = registry.assets.filter((asset: any) => asset.runtime_path || asset.candidate_runtime_path);
const runtimePath = (asset: any) => asset.runtime_path ?? asset.candidate_runtime_path;
// Reviewed runtime inventory: removing both a file and its manifest entry must
// still fail. Update this list deliberately when a runtime asset is retired.
const requiredIds = [
  'cs_environment', 'cs_soldier', 'cs_pistol', 'cs_smg', 'cs_rifle', 'cs_sniper',
  'cs_bomb', 'cs_card', 'cs_casing', 'cs_muzzle_flash', 'cs_impact_dust', 'cs_stone_impact',
  'cs_daylight_sky', 'cs_armory_pistol', 'cs_armory_smg', 'cs_armory_rifle', 'cs_armory_sniper',
  'cs_eyewear_punkduck_v33', 'cs_helmet_coating_v33', 'cs_fps_sleeve_fabric_detail_v36',
  'cs-utility-fx-v38', 'cs_grenades_v37', 'cs_hud_he_v37', 'cs_hud_flash_v37',
  'cs_hud_smoke_v37', 'cs_plaster_detail_v37',
];
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const seal = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};

describe('CS runtime asset registry', () => {
  it('retains the reviewed required inventory even if a file and its metadata are removed together', () => {
    expect(runtimeAssets.map((asset: any) => asset.asset_id).sort()).toEqual([...requiredIds].sort());
    expect(files(root)).toHaveLength(30);
  });

  it('seals every local runtime asset and integrated parent against the actual bytes', () => {
    for (const asset of runtimeAssets) {
      const record = asset.runtime_parent_asset_id
        ? registry.assets.find((parent: any) => parent.asset_id === asset.runtime_parent_asset_id) : asset;
      expect(record, asset.asset_id).toBeDefined();
      expect(runtimePath(record), asset.asset_id).toBe(runtimePath(asset));
      expect(record, asset.asset_id).toMatchObject(seal(runtimePath(asset)));
    }
  });

  it('accounts for every physical runtime file exactly once in the bundle total', () => {
    const declared = new Set<string>(registry.supporting_files?.map((file: any) => file.path) ?? []);
    for (const asset of runtimeAssets) {
      declared.add(runtimePath(asset));
      for (const dependency of asset.runtime_dependencies ?? []) declared.add(dependency.path);
    }
    expect([...declared].sort()).toEqual(files(root).sort());
    expect(registry.total_runtime_bytes).toBe([...declared].reduce((total, path) => total + readFileSync(path).length, 0));
    expect(registry.total_runtime_bytes).toBeLessThanOrEqual(34_000_000);
    for (const file of registry.supporting_files ?? []) expect(file).toMatchObject(seal(file.path));
  });

  it('seals every external GLB image dependency, including shared maps added by later revisions', () => {
    for (const asset of runtimeAssets.filter((asset: any) => runtimePath(asset).endsWith('.glb') && !asset.runtime_parent_asset_id)) {
      const path = runtimePath(asset), bytes = readFileSync(path);
      const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      const paths = [...new Set<string>((gltf.images ?? []).filter((image: any) => image.uri && !image.uri.startsWith('data:'))
        .map((image: any) => join(dirname(path), image.uri).replaceAll('\\', '/')))];
      expect((asset.runtime_dependencies ?? []).map((entry: any) => entry.path).sort(), asset.asset_id).toEqual(paths.sort());
      for (const dependency of asset.runtime_dependencies ?? []) expect(dependency).toMatchObject(seal(dependency.path));
    }
  });

  it('keeps runtime candidates visible in the review queue and links existing FX contracts', () => {
    for (const asset of runtimeAssets) {
      expect(queue.assets, asset.asset_id).toContain(asset.asset_id);
      expect(asset.status, asset.asset_id).not.toMatch(/rejected|quarantined|qa_failed/);
    }
    for (const id of ['cs_grenades_v37', 'cs_plaster_detail_v37', 'cs_muzzle_flash', 'cs_impact_dust', 'cs_stone_impact', 'cs_daylight_sky']) {
      const asset = registry.assets.find((entry: any) => entry.asset_id === id);
      expect(asset?.contract, id).toBeTruthy();
      expect(JSON.parse(readFileSync(asset.contract, 'utf8'))).toBeTruthy();
    }
  });

  it('records stage integration authorization without claiming final art or commercial approval', () => {
    expect(registry.external_deployment).toBe(false);
    expect(queue.external_deployment_allowed).toBe(false);
    const utility = registry.assets.find((asset: any) => asset.asset_id === 'cs-utility-fx-v38');
    const utilityContract = JSON.parse(readFileSync(utility.contract, 'utf8'));
    // The user authorized this phase's PR and merge, not final commercial/art acceptance.
    for (const record of [utility, utilityContract, queue.utility_fx_v38]) {
      expect(record).toMatchObject({ runtime_publish_allowed: true, assembly_human_review: 'pending' });
      expect(record.source_approval).toBe('stage-integration-authorized; final source-selection review pending');
      expect(record.stage_delivery).toMatchObject({ authorized: true, commercial_approval: false });
      expect(record.stage_delivery.user_instruction).toBe('先把階段功能發 PR merge 吧，現階段先到這裡');
    }
    for (const record of [registry, queue]) {
      expect(record.stage_delivery.user_instruction).toBe('先把階段功能發 PR merge 吧，現階段先到這裡');
    }
    const grenades = JSON.parse(readFileSync('art-factory/cs/contracts/grenades-v37.asset-contract.json', 'utf8'));
    const grenadeFlags = { runtime_publish_allowed: grenades.runtime_publish_allowed,
      assembly_human_review: grenades.human_review, external_deployment_allowed: false };
    for (const id of ['cs_grenades_v37', 'cs_hud_he_v37', 'cs_hud_flash_v37', 'cs_hud_smoke_v37']) {
      expect(registry.assets.find((asset: any) => asset.asset_id === id), id).toMatchObject(grenadeFlags);
    }
    expect(queue.grenades_v37).toMatchObject(grenadeFlags);
    const plaster = JSON.parse(readFileSync('art-factory/cs/contracts/plaster-detail-v37.asset-contract.json', 'utf8'));
    const plasterFlags = { runtime_publish_allowed: plaster.runtime_publish_allowed,
      assembly_human_review: plaster.assembly_human_review, external_deployment_allowed: plaster.external_deployment_allowed };
    expect(registry.assets.find((asset: any) => asset.asset_id === 'cs_plaster_detail_v37')).toMatchObject(plasterFlags);
    expect(queue.plaster_detail_v37).toMatchObject(plasterFlags);
  });
});
