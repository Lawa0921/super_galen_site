/** Pinned lineage binaries for the unit provenance chain.
 *  Pre-publication backup GLBs and assembly .blend sources are tens of MB and stay local (not committed). Their exact
 *  sha256 (and, for GLBs, a digest of the order-independent geometry fingerprints) is pinned in
 *  art-factory/rts/manifests/unit-lineage-binaries.json. A present file must match its pin byte for byte; an absent file
 *  resolves to its pin only when it is listed, so a clean clone verifies the chain and a forged local file never passes. */
import {createHash} from 'node:crypto';
import type {PrimitiveFingerprint} from './geometry_fingerprint';

export interface LineageBinary {path:string;sha256:string;bytes:number;role:'backup'|'source';glb_fingerprints_sha256?:string}
export interface LineageManifest {schema:'rts-unit-lineage-binaries/v1';policy:string;files:LineageBinary[]}
export interface LineageFs {exists(rel:string):boolean;read(rel:string):Buffer}
export interface LineageResolution {path:string;sha256:string;present:boolean;bytes?:Buffer;entry?:LineageBinary}

const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

export function fingerprintDigest(fingerprints:PrimitiveFingerprint[]):string {
  return sha256(Buffer.from(JSON.stringify(fingerprints)));
}

export function resolveLineageFile(rel:string,manifest:LineageManifest,fs:LineageFs):LineageResolution {
  const entry=manifest.files.find(file=>file.path===rel);
  if(fs.exists(rel)){
    const bytes=fs.read(rel),digest=sha256(bytes);
    if(entry&&entry.sha256!==digest)throw new Error(`${rel}: local bytes ${digest} differ from the pinned sha256 ${entry.sha256}`);
    return entry?{path:rel,sha256:digest,present:true,bytes,entry}:{path:rel,sha256:digest,present:true,bytes};
  }
  if(!entry)throw new Error(`${rel}: lineage file is neither present nor pinned in the lineage manifest`);
  return {path:rel,sha256:entry.sha256,present:false,entry};
}
