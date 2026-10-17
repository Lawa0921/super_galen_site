import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const referencePaths = process.argv.slice(2, 4);
const mergedPaths = process.argv.slice(4, 6);
if (referencePaths.length !== 2 || mergedPaths.length !== 2) {
  throw new Error("Usage: node original_guard_assembly_merge_parity.mjs <source-lod0> <source-lod1> <merged-lod0> <merged-lod1>");
}
const bundled = await build({
  stdin: {
    contents: 'import * as THREE from "three"; import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"; globalThis.THREE = THREE; globalThis.GLTFLoader = GLTFLoader;',
    resolveDir: repoRoot,
    sourcefile: "original_guard_merge_parity_entry.js",
    loader: "js",
  },
  bundle: true, platform: "browser", format: "iife", write: false,
});
const files = new Map();
const hashes = [];
for (let lod = 0; lod < 2; lod++) {
  const sourceBytes=fs.readFileSync(referencePaths[lod]);
  const mergedBytes=fs.readFileSync(mergedPaths[lod]);
  const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
  files.set(`/source-lod${lod}.glb`, sourceBytes);
  files.set(`/merged-lod${lod}.glb`, mergedBytes);
  hashes.push({lod,source_sha256:sha256(sourceBytes),merged_sha256:sha256(mergedBytes)});
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("http://guard-merge.test/**", async route => {
    const name = new URL(route.request().url()).pathname;
    const body = files.get(name);
    if (!body) return route.fulfill({ status: 404, body: "missing GLB" });
    return route.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body,
    });
  });
  await page.setContent("<!doctype html><title>GLB numerical parity</title>");
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const reports = await page.evaluate(async () => {
    const THREE = globalThis.THREE;
    const Loader = globalThis.GLTFLoader;
    const loader = new Loader();
    const loaded = {};
    for (const variant of ["source", "merged"]) for (let lod=0; lod<2; lod++) {
      loaded[`${variant}${lod}`] = await loader.loadAsync(`http://guard-merge.test/${variant}-lod${lod}.glb`);
    }
    const canonical = ["Idle", "Walk", "Attack", "Hurt", "Death"];
    function clipsFor(gltf) {
      const byName = new Map(gltf.animations.map(clip => [clip.name.toLowerCase(), clip]));
      const out = {};
      for (const name of canonical) {
        const clip = byName.get(name.toLowerCase());
        if (!clip || !(clip.duration > 0)) throw new Error(`Missing/invalid ${name} clip; found ${[...byName.keys()].join(",")}`);
        out[name] = clip;
      }
      return out;
    }
    function vertexSignature(root) {
      root.updateMatrixWorld(true);
      const entries = [];
      let vertices = 0;
      root.traverse(obj => {
        if (!obj.isSkinnedMesh) return;
        obj.skeleton.update();
        const position = new THREE.Vector3();
        for (let i=0; i<obj.geometry.attributes.position.count; i++) {
          obj.getVertexPosition(i, position);
          obj.localToWorld(position);
          const quant = [position.x,position.y,position.z].map(v => Math.round(v*1e5));
          entries.push(quant.join(","));
          vertices++;
        }
      });
      entries.sort();
      return { value: entries.join(";"), vertices };
    }
    function materialNames(gltf) {
      return [...new Set(gltf.parser.json.materials.map(m => m.name ?? ""))].sort();
    }
    function materialGroupSummary(gltf) {
      const rows={};
      gltf.scene.traverse(obj=>{
        if(!obj.isMesh)return;
        const materials=Array.isArray(obj.material)?obj.material:[obj.material];
        const groups=obj.geometry.groups.length?obj.geometry.groups:[{start:0,count:obj.geometry.index?.count??obj.geometry.attributes.position.count,materialIndex:0}];
        for(const g of groups){const name=materials[g.materialIndex]?.name??"";rows[name]=(rows[name]??0)+g.count;}
      });
      return rows;
    }
    function meshDebug(gltf) {
      const rows=[];
      gltf.scene.traverse(obj=>{
        if(!obj.isMesh)return;
        const materials=Array.isArray(obj.material)?obj.material:[obj.material];
        rows.push({name:obj.name,vertices:obj.geometry.attributes.position.count,indexCount:obj.geometry.index?.count??0,
          groups:obj.geometry.groups.map(g=>({start:g.start,count:g.count,materialIndex:g.materialIndex,material:materials[g.materialIndex]?.name})),
          materials:materials.map(m=>m?.name)});
      });
      return rows;
    }
    function renderedAttributeSignature(gltf) {
      const rows = new Map();
      const component = (attribute, i) => {
        const size = attribute.itemSize;
        const values = [];
        for (let k=0;k<size;k++) values.push(attribute.getComponent(i,k));
        return values.map(value => Math.round(value*1e7)).join(",");
      };
      gltf.scene.traverse(obj => {
        if (!obj.isMesh) return;
        const geometry=obj.geometry, position=geometry.attributes.position;
        const index=geometry.index;
        const attributes=["position","normal","uv","skinIndex","skinWeight"].map(name => geometry.attributes[name]);
        if (!position || attributes.some(attribute => !attribute)) throw new Error("GLTFLoader mesh lacks a required parity attribute");
        const materialArray=Array.isArray(obj.material) ? obj.material : [obj.material];
        const groups=geometry.groups.length ? geometry.groups : [{start:0,count:index ? index.count : position.count,materialIndex:0}];
        for (const group of groups) {
          if (group.count%3!==0) throw new Error("GLTFLoader material group is not whole indexed triangles");
          const material=materialArray[group.materialIndex];
          const name=material?.name ?? "";
          if (!name) throw new Error("GLTFLoader returned an unnamed render material group");
          const triangles=rows.get(name) ?? [];
          for (let offset=group.start; offset<group.start+group.count; offset+=3) {
            const corners=[];
            for (let corner=0;corner<3;corner++) {
              const vertex=index ? index.getX(offset+corner) : offset+corner;
              corners.push(attributes.map(attribute => component(attribute,vertex)).join("|"));
            }
            triangles.push(corners.join(" > "));
          }
          rows.set(name,triangles);
        }
      });
      return [...rows.entries()].sort(([a],[b])=>a.localeCompare(b))
        .map(([name,triangles])=>[name,triangles.sort().join(";")]);
    }
    const reports = [];
    for (let lod=0; lod<2; lod++) {
      const a=loaded[`source${lod}`], b=loaded[`merged${lod}`];
      const clipsA=clipsFor(a), clipsB=clipsFor(b);
      const preservedTables=["materials","textures","images","samplers","skins","animations"];
      for (const key of preservedTables) {
        if (JSON.stringify(a.parser.json[key]??[]) !== JSON.stringify(b.parser.json[key]??[])) throw new Error(`LOD${lod} ${key} table changed`);
      }
      if (materialNames(a).join("|") !== materialNames(b).join("|")) throw new Error(`LOD${lod} material table changed`);
      const attrsA=renderedAttributeSignature(a), attrsB=renderedAttributeSignature(b);
      if (JSON.stringify(attrsA) !== JSON.stringify(attrsB)) {
        const byA=new Map(attrsA), byB=new Map(attrsB);
        const keys=[...new Set([...byA.keys(),...byB.keys()])].sort();
        const differences=keys.filter(key=>byA.get(key)!==byB.get(key)).map(key=>{const aa=(byA.get(key)??"").split(";"),bb=(byB.get(key)??"").split(";");let i=0;while(i<aa.length&&i<bb.length&&aa[i]===bb[i])i++;return {material:key,sourceVertices:aa.length,mergedVertices:bb.length,firstDiff:i,sourceValue:aa[i]?.slice(0,180),mergedValue:bb[i]?.slice(0,180)};});
        throw new Error(`LOD${lod} GLTFLoader material-grouped values changed: ${JSON.stringify({differences,sourceCounts:materialGroupSummary(a),mergedCounts:materialGroupSummary(b),sourceMeshes:meshDebug(a),mergedMeshes:meshDebug(b)})}`);
      }
      const jointsA=a.parser.json.skins[0].joints.length;
      const jointsB=b.parser.json.skins[0].joints.length;
      if (jointsA !== jointsB) throw new Error(`LOD${lod} skin joint count changed ${jointsA} -> ${jointsB}`);
      const lodReport={lod, skinJointCount:jointsA, materials:materialNames(a), clips:[]};
      for (const name of canonical) {
        const ca=clipsA[name], cb=clipsB[name];
        if (Math.abs(ca.duration-cb.duration)>1e-9) throw new Error(`LOD${lod} ${name} duration changed`);
        const fractions=[0,0.25,0.5,0.75,1];
        for (const fraction of fractions) {
          const time=ca.duration*fraction;
          const rootA=a.scene, rootB=b.scene;
          rootA.updateMatrixWorld(true); rootB.updateMatrixWorld(true);
          const mixerA=new THREE.AnimationMixer(rootA), mixerB=new THREE.AnimationMixer(rootB);
          mixerA.clipAction(ca).play(); mixerB.clipAction(cb).play();
          mixerA.setTime(time); mixerB.setTime(time);
          rootA.updateMatrixWorld(true); rootB.updateMatrixWorld(true);
          const sigA=vertexSignature(rootA), sigB=vertexSignature(rootB);
          if (sigA.vertices !== sigB.vertices || sigA.value !== sigB.value) {
            throw new Error(`LOD${lod} ${name} at ${time.toFixed(4)}s: skinned world-position signature differs (${sigA.vertices} vs ${sigB.vertices} verts)`);
          }
          lodReport.clips.push({name,time_s:Number(time.toFixed(6)),vertices:sigA.vertices,positionParity:true});
          mixerA.stopAllAction(); mixerB.stopAllAction();
        }
      }
      reports.push(lodReport);
    }
    return reports;
  });
  console.log(JSON.stringify({ ok:true, runtime:"Three.js GLTFLoader + indexed material triangle corners and SkinnedMesh.getVertexPosition", hashes, reports }, null, 2));
} finally {
  await browser.close();
}
