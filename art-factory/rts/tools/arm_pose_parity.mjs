/** Canonical Blender (+Z up/+Y front) -> glTF (+Y up/-Z front) QA. */
function validatePoints(points) {
  if(!Array.isArray(points)||points.length===0)throw new Error('empty point set');
  if(points.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))throw new Error('finite XYZ points required');
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function sourceNodeName(association,nodes) {
  const index=association?.nodes;
  if(!Number.isInteger(index)||index<0||index>=nodes.length)throw new Error('valid glTF node association required');
  const name=nodes[index]?.name;
  if(typeof name!=='string'||name.length===0)throw new Error('named glTF node required');
  return name;
}
export function canonicalToGltf(points) {
  validatePoints(points);return points.map(([x,y,z])=>[x,z,-y]);
}
export function mapVertices(actual, reference, tolerance=1e-6) {
  validatePoints(actual);validatePoints(reference);
  if(!Number.isFinite(tolerance)||tolerance<=0)throw new Error('positive finite tolerance required');
  const mapping=actual.map(point=>{
    let best=Infinity,index=-1,ambiguous=false;
    for(let i=0;i<reference.length;i++){
      const d=distance(point,reference[i]);
      if(d<best-1e-12){best=d;index=i;ambiguous=false;}
      else if(Math.abs(d-best)<=1e-12){ambiguous=true;}
    }
    if(best>tolerance)throw new Error(`rest distance ${best} exceeds ${tolerance}`);
    if(ambiguous)throw new Error('ambiguous coincident source vertices require additional identity');
    return index;
  });
  if(new Set(mapping).size!==reference.length)throw new Error('incomplete source vertex coverage');
  return mapping;
}
export function comparePose(actual, expected, mapping) {
  validatePoints(actual);validatePoints(expected);
  if(mapping.length!==actual.length)throw new Error('pose count differs from rest map');
  let maxDeviationM=0,worstExportedVertex=0,sumSquares=0;
  actual.forEach((point,i)=>{
    const index=mapping[i];
    if(!Number.isInteger(index)||index<0||index>=expected.length)throw new Error('invalid source vertex index');
    const d=distance(point,expected[index]);sumSquares+=d*d;
    if(d>maxDeviationM){maxDeviationM=d;worstExportedVertex=i;}
  });
  return {vertices:actual.length,maxDeviationM,worstExportedVertex,rmsDeviationM:Math.sqrt(sumSquares/actual.length)};
}
