/** Test-only instrumentation, serialized into the isolated performance page. */
export function installStallTrace(options:{finish?:boolean}={}){
  const target=globalThis as any,audit=target.__rtsPerf,hooks=target.__rtsTimingHooks;
  if(!audit||!hooks)throw new Error('Stall trace requires the isolated production fixture');
  const undo:Array<()=>void>=[];
  const trace={frames:[] as Array<{index:number;timestamp:number;callbackAt:number;delta:number}>,tasks:[] as Array<{phase:string;start:number;duration:number}>,heartbeats:[] as Array<{timestamp:number;delta:number}>,gpuFinishes:[] as Array<{start:number;duration:number}>,droppedFrames:0,droppedTasks:0,droppedHeartbeats:0,droppedGpuFinishes:0,installedAt:performance.now(),disposed:false,dispose(){if(trace.disposed)return;trace.disposed=true;for(const restore of undo.reverse())restore();}};
  audit.stallTrace=trace;
  let previousHeartbeat=performance.now();
  const heartbeat=setInterval(()=>{
    const timestamp=performance.now(),delta=timestamp-previousHeartbeat;previousHeartbeat=timestamp;
    if(!audit.recording)return;
    if(trace.heartbeats.length<10000)trace.heartbeats.push({timestamp,delta});else trace.droppedHeartbeats++;
  },25);
  undo.push(()=>clearInterval(heartbeat));
  const push=audit.samples.push,descriptor=Object.getOwnPropertyDescriptor(audit.samples,'push');
  Object.defineProperty(audit.samples,'push',{configurable:true,writable:true,value:function(...values:number[]){
    for(const [offset,delta] of values.entries()){
      const frame={index:this.length+offset,timestamp:audit.previous+delta,callbackAt:performance.now(),delta};
      if(trace.frames.length<10000)trace.frames.push(frame);else trace.droppedFrames++;
    }
    return push.apply(this,values);
  }});
  undo.push(()=>{if(descriptor)Object.defineProperty(audit.samples,'push',descriptor);else delete audit.samples.push;});
  for(const [name,key] of [['SimulationClock','frame'],['Battlefield','render'],['Hud','render']]){
    const object=hooks[name].prototype,original=object[key],own=Object.hasOwn(object,key);
    object[key]=function(...args:unknown[]){
      const recording=audit.recording,start=performance.now();
      let result;
      try{result=original.apply(this,args);}
      finally{const duration=performance.now()-start;if(recording&&duration>=50){
        if(trace.tasks.length<10000)trace.tasks.push({phase:`${name}.${key}`,start,duration});else trace.droppedTasks++;
      }}
      if(options.finish&&name==='Battlefield'){
        const start=performance.now();this.renderer.getContext().finish();const duration=performance.now()-start;
        if(recording){if(trace.gpuFinishes.length<10000)trace.gpuFinishes.push({start,duration});else trace.droppedGpuFinishes++;}
      }
      return result;
    };
    undo.push(()=>{if(own)object[key]=original;else delete object[key];});
  }
}
