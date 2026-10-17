/** Match seam-split exported skin tuples and oriented triangles to source. */
export function verifySkinGeometry(source, exported) {
  const tolerance=1e-6,cell=5e-6,buckets=new Map(),tuples=[],unique=new Map();
  const normalized=v=>{
    if(v.position.length!==3||v.position.some(x=>!Number.isFinite(x)))throw Error('Invalid vertex position');
    const weights=[...v.weights].sort((a,b)=>a[0].localeCompare(b[0]));
    if(!weights.length||weights.some(([name,w])=>typeof name!=='string'||!Number.isFinite(w)||w<=0)||new Set(weights.map(w=>w[0])).size!==weights.length||Math.abs(weights.reduce((s,w)=>s+w[1],0)-1)>tolerance)throw Error('Invalid skin vertex weights');
    return {position:v.position,weights};
  };
  const sourceIds=source.vertices.map(v=>{
    const row=normalized(v),key=JSON.stringify(row);
    if(unique.has(key))return unique.get(key);
    const id=tuples.length;unique.set(key,id);tuples.push(row);
    const bucket=row.position.map(x=>Math.floor(x/cell)).join(',');
    if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(id);return id;
  });
  let maxPositionErrorM=0,maxWeightL1Error=0,maxRestRadius=0;
  const explicitSourceIdentity=exported.vertices.some(v=>Object.hasOwn(v,'sourceIndex')),coveredIds=new Set();
  const covered=new Set(),exportedIds=exported.vertices.map(vertex=>{
    const row=normalized(vertex),coord=row.position.map(x=>Math.floor(x/cell));
    let best,bestError=Infinity,bestPosition,bestWeights;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const id of buckets.get([coord[0]+x,coord[1]+y,coord[2]+z].join(','))??[]){
      const want=tuples[id],p=Math.hypot(...want.position.map((v,i)=>v-row.position[i]));
      if(p>tolerance)continue;
      const a=new Map(want.weights),b=new Map(row.weights);
      const w=[...new Set([...a.keys(),...b.keys()])].reduce((sum,name)=>sum+Math.abs((a.get(name)??0)-(b.get(name)??0)),0);
      if(w>tolerance)continue;
      if(p+w<bestError){best=id;bestError=p+w;bestPosition=p;bestWeights=w;}
    }
    if(best===undefined){
      let closest,nearest=Infinity;for(const want of tuples){const d=Math.hypot(...want.position.map((v,i)=>v-row.position[i]));if(d<nearest){nearest=d;closest=want;}}
      throw Error('Exported vertex has no matching source skin tuple '+JSON.stringify({exported:row,nearestPositionDistance:nearest,closest}));
    }
    if(explicitSourceIdentity){
      const id=vertex.sourceIndex;
      if(!Number.isInteger(id)||id<0||id>=source.vertices.length||sourceIds[id]!==best)throw Error('Exported source identity disagrees with source skin tuple');
      coveredIds.add(id);
    }
    covered.add(best);maxPositionErrorM=Math.max(maxPositionErrorM,bestPosition);maxWeightL1Error=Math.max(maxWeightL1Error,bestWeights);maxRestRadius=Math.max(maxRestRadius,Math.hypot(...row.position));return best;
  });
  if(covered.size!==tuples.length)throw Error('Incomplete source skin tuple coverage');
  if(explicitSourceIdentity&&coveredIds.size!==source.vertices.length)throw Error('Incomplete explicit source identity coverage');
  const faces=(triangles,mapping)=>{
    const counts=new Map();
    for(const triangle of triangles){
      if(triangle.length!==3||triangle.some(i=>!Number.isInteger(i)||i<0||i>=mapping.length))throw Error('Invalid triangle index');
      const ids=triangle.map(i=>mapping[i]);
      const key=[ids.join(','),[ids[1],ids[2],ids[0]].join(','),[ids[2],ids[0],ids[1]].join(',')].sort()[0];
      counts.set(key,(counts.get(key)??0)+1);
    }
    return counts;
  };
  const expectedFaces=faces(source.triangles,explicitSourceIdentity?source.vertices.map((_,i)=>i):sourceIds),actualFaces=faces(exported.triangles,explicitSourceIdentity?exported.vertices.map(v=>v.sourceIndex):exportedIds);
  if(expectedFaces.size!==actualFaces.size||[...expectedFaces].some(([key,n])=>actualFaces.get(key)!==n))throw Error('Source/export oriented triangle multiset differs');
  return {sourceVertices:source.vertices.length,sourceTupleCount:tuples.length,exportedVertices:exported.vertices.length,triangles:source.triangles.length,maxPositionErrorM,maxWeightL1Error,maxRestRadius,explicitSourceIdentity};
}
