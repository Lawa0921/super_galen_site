/** Correct hemisphere discontinuities introduced by glTF basis decomposition. */
export function canonicalizeRotationQuaternions(bytes) {
  const buffer=Buffer.from(bytes);
  if(buffer.length<28||buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2||buffer.readUInt32LE(8)!==buffer.length)throw Error('Expected complete glTF 2 GLB');
  const jsonLength=buffer.readUInt32LE(12);
  if(buffer.readUInt32LE(16)!==0x4e4f534a||20+jsonLength+8>buffer.length)throw Error('Missing JSON chunk');
  const json=JSON.parse(buffer.subarray(20,20+jsonLength).toString('utf8'));
  const binHeader=20+jsonLength,binStart=binHeader+8,binLength=buffer.readUInt32LE(binHeader);
  if(buffer.readUInt32LE(binHeader+4)!==0x004e4942||binStart+binLength!==buffer.length||json.buffers?.length!==1||json.buffers[0].uri)throw Error('Expected one embedded binary buffer');
  const report={changedKeys:0,rotationAccessors:0,changes:[]},seen=new Map();
  for(const animation of json.animations??[])for(const channel of animation.channels){
    if(channel.target.path!=='rotation')continue;
    const sampler=animation.samplers[channel.sampler],interpolation=sampler.interpolation??'LINEAR';
    if(!['LINEAR','STEP','CUBICSPLINE'].includes(interpolation))throw Error('Unsupported quaternion interpolation');
    if(seen.has(sampler.output)){
      if(seen.get(sampler.output)!==interpolation)throw Error('Shared quaternion accessor with mixed interpolation');
      continue;
    }
    seen.set(sampler.output,interpolation);
    const accessor=json.accessors[sampler.output],input=json.accessors[sampler.input],view=json.bufferViews[accessor.bufferView];
    const cubic=interpolation==='CUBICSPLINE',width=cubic?3:1;
    if(accessor.sparse||accessor.normalized||accessor.componentType!==5126||accessor.type!=='VEC4'||view.buffer!==0||accessor.count!==input.count*width)throw Error('Unsupported quaternion accessor layout');
    const stride=view.byteStride??16,start=binStart+(view.byteOffset??0)+(accessor.byteOffset??0);
    if(stride<16||start<binStart||start+(accessor.count-1)*stride+16>binStart+binLength||
       (accessor.byteOffset??0)+(accessor.count-1)*stride+16>view.byteLength)throw Error('Quaternion accessor out of bounds');
    let previous;
    report.rotationAccessors++;
    for(let key=0;key<input.count;key++){
      const valueRow=key*width+(cubic?1:0);
      const value=Array.from({length:4},(_,c)=>buffer.readFloatLE(start+valueRow*stride+c*4));
      const length=Math.hypot(...value);
      if(!Number.isFinite(length)||length<1e-8)throw Error('Invalid zero/nonfinite quaternion');
      const flip=previous&&value.reduce((n,v,c)=>n+v*previous[c],0)<0;
      // Validate every tangent as well; zero tangent is legal.
      for(let row=key*width;row<(key+1)*width;row++)for(let c=0;c<4;c++){
        const offset=start+row*stride+c*4,v=buffer.readFloatLE(offset);
        if(!Number.isFinite(v))throw Error('Nonfinite quaternion tangent/value');
        if(flip)buffer.writeFloatLE(-v,offset);
      }
      if(flip){report.changedKeys++;report.changes.push({clip:animation.name,node:json.nodes[channel.target.node]?.name,key,interpolation});}
      previous=value.map(v=>v*(flip?-1:1)/length);
    }
  }
  return {buffer,report};
}
