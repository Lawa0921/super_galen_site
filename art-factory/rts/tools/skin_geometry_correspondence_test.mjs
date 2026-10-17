import test from 'node:test';
import assert from 'node:assert/strict';
import {verifySkinGeometry} from './skin_geometry_correspondence.mjs';
const vertex=(x,y,weight=1)=>({position:[x,y,0],weights:[['Bone',weight],...weight<1?[['Other',1-weight]]:[]]});
const source=()=>({vertices:[vertex(0,0),vertex(1,0),vertex(0,1),vertex(.2,.2)],triangles:[[0,1,3],[1,2,3],[2,0,3]]});
test('Allows normal/UV seam splits while covering all source skin tuples and faces',()=>{
 const s=source(),e=structuredClone(s);e.vertices.push(structuredClone(e.vertices[0]));e.triangles[2][1]=4;
 const r=verifySkinGeometry(s,e);assert.equal(r.sourceTupleCount,4);assert.equal(r.exportedVertices,5);assert.equal(r.maxPositionErrorM,0);
});
test('An internal vertex shift is rejected despite unchanged outer bounds',()=>{
 const s=source(),e=structuredClone(s);e.vertices[3].position[0]+=.01;assert.throws(()=>verifySkinGeometry(s,e),/vertex|tuple/i);
});
test('An internal wrong bone weight is rejected despite unchanged rest geometry',()=>{
 const s=source(),e=structuredClone(s);e.vertices[3]=vertex(.2,.2,.5);assert.throws(()=>verifySkinGeometry(s,e),/vertex|tuple/i);
});
test('Tiny omitted influence is measured in the conservative error budget',()=>{
 const s=source(),e=structuredClone(s);s.vertices[3]=vertex(.2,.2,1-3e-7);
 const r=verifySkinGeometry(s,e);assert.ok(Math.abs(r.maxWeightL1Error-6e-7)<1e-12);
});
test('Reversed or missing internal triangles are rejected',()=>{
 const s=source(),e=structuredClone(s);e.triangles[0].reverse();assert.throws(()=>verifySkinGeometry(s,e),/triangle/i);
 const missing=structuredClone(s);missing.triangles.pop();assert.throws(()=>verifySkinGeometry(s,missing),/triangle/i);
});
test('Unreferenced source tuple omission fails coverage',()=>{
 const s=source();s.vertices.push(vertex(.3,.3));assert.throws(()=>verifySkinGeometry(s,source()),/coverage/i);
});
test('Explicit source IDs preserve split-vertex topology and reject wrong identity',()=>{
 const s=source(),e=structuredClone(s);e.vertices.forEach((v,i)=>v.sourceIndex=i);
 assert.equal(verifySkinGeometry(s,e).explicitSourceIdentity,true);
 e.vertices[0].sourceIndex=1;assert.throws(()=>verifySkinGeometry(s,e),/identity/i);
});
