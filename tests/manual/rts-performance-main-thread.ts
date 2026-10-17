/** Test-only release monitor. RAF gaps are not equivalent to main-thread freezes. */
export function installMainThreadMonitor(){
  const audit=(globalThis as any).__rtsPerf;if(!audit)throw new Error('Main-thread monitor requires the isolated performance fixture');
  const periodMs=25;let previous=0,timer:ReturnType<typeof setInterval>|undefined,observer:PerformanceObserver|undefined;
  const monitor={valid:true,startedAt:null as number|null,endedAt:null as number|null,elapsedMs:0,heartbeatCount:0,maxHeartbeatLatenessMs:0,maxLongTaskMs:0,
    heartbeats:[] as Array<{timestamp:number;delta:number;lateness:number}>,longTasks:[] as Array<{startTime:number;duration:number}>,invalidReasons:[] as string[],
    start(){
      if(monitor.startedAt!==null)throw new Error('Main-thread measurement already started');
      monitor.startedAt=previous=performance.now();visibility();document.addEventListener('visibilitychange',visibility);
      if(typeof PerformanceObserver==='undefined'||!PerformanceObserver.supportedEntryTypes?.includes('longtask'))invalidate('Long Tasks observer unavailable');
      else{observer=new PerformanceObserver(list=>recordTasks(list.getEntries()));observer.observe({type:'longtask'});}
      timer=setInterval(()=>heartbeat(performance.now()),periodMs);
    },
    finish(){
      if(monitor.startedAt===null||monitor.endedAt!==null)return;
      const end=performance.now();visibility();
      if(end-previous>periodMs)heartbeat(end);
      if(observer)recordTasks(observer.takeRecords(),end);
      monitor.endedAt=end;monitor.elapsedMs=end-monitor.startedAt;
      clearInterval(timer);observer?.disconnect();document.removeEventListener('visibilitychange',visibility);
    },
  };
  function invalidate(reason:string){monitor.valid=false;if(!monitor.invalidReasons.includes(reason))monitor.invalidReasons.push(reason);}
  function visibility(){if(document.visibilityState!=='visible')invalidate('Page was not visible throughout measurement');}
  function heartbeat(timestamp:number){
    if(monitor.endedAt!==null)return;
    const delta=timestamp-previous,lateness=Math.max(0,delta-periodMs);previous=timestamp;monitor.heartbeatCount++;
    monitor.maxHeartbeatLatenessMs=Math.max(monitor.maxHeartbeatLatenessMs,lateness);
    if(monitor.heartbeats.length<10000)monitor.heartbeats.push({timestamp,delta,lateness});else invalidate('Heartbeat evidence limit exceeded');
  }
  function recordTasks(entries:PerformanceEntry[],end=Infinity){
    if(monitor.startedAt===null||monitor.endedAt!==null)return;
    for(const entry of entries){
      const startTime=Math.max(monitor.startedAt,entry.startTime),duration=Math.min(end,entry.startTime+entry.duration)-startTime;
      if(duration<=0)continue;
      monitor.maxLongTaskMs=Math.max(monitor.maxLongTaskMs,duration);
      if(monitor.longTasks.length<10000)monitor.longTasks.push({startTime,duration});else invalidate('Long Task evidence limit exceeded');
    }
  }
  audit.mainThreadMonitor=monitor;
}

export function performanceGates(frame:{medianFps:number;p95Ms:number;maxMs:number},monitor:{valid:boolean;elapsedMs:number;heartbeatCount:number;maxHeartbeatLatenessMs:number;maxLongTaskMs:number}){
  const checks={medianFps:frame.medianFps>=55,p95FrameTime:frame.p95Ms<33,completeMeasurement:monitor.valid&&monitor.heartbeatCount>0&&monitor.elapsedMs>=60000,
    timerResponsiveness:Number.isFinite(monitor.maxHeartbeatLatenessMs)&&monitor.maxHeartbeatLatenessMs<500,longTasks:Number.isFinite(monitor.maxLongTaskMs)&&monitor.maxLongTaskMs<500};
  return {passed:Object.values(checks).every(Boolean),checks};
}
