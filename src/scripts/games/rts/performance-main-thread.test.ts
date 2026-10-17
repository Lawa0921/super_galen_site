import {afterEach,describe,expect,it,vi} from 'vitest';
import {installMainThreadMonitor,performanceGates} from '../../../../tests/manual/rts-performance-main-thread';

afterEach(()=>{(globalThis as any).__rtsPerf?.mainThreadMonitor?.finish();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();delete (globalThis as any).__rtsPerf;});
function setup(supported=true){
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});let time=100;
  vi.spyOn(performance,'now').mockImplementation(()=>time);vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
  let callback:any;const pending:any[]=[];
  class Observer {static supportedEntryTypes=supported?['longtask']:[];constructor(cb:any){callback=cb;}observe(){}disconnect(){}takeRecords(){return pending.splice(0);}}
  vi.stubGlobal('PerformanceObserver',Observer);const audit:any={};(globalThis as any).__rtsPerf=audit;
  installMainThreadMonitor();audit.mainThreadMonitor.start();
  return {monitor:audit.mainThreadMonitor,setTime:(value:number)=>time=value,pending,deliver:(rows:any[])=>callback({getEntries:()=>rows})};
}
const healthy={valid:true,elapsedMs:60000,heartbeatCount:2000,maxHeartbeatLatenessMs:8,maxLongTaskMs:150};
describe('release main-thread freeze contract',()=>{
  it('retains a long RAF gap as a diagnostic when the event loop remains responsive',()=>{
    expect(performanceGates({medianFps:60,p95Ms:24,maxMs:675},healthy).passed).toBe(true);
  });
  it('rejects consecutive sub-500ms work that starves the timer for more than 500ms',()=>{
    expect(performanceGates({medianFps:60,p95Ms:24,maxMs:309},{...healthy,maxHeartbeatLatenessMs:576.1}).passed).toBe(false);
  });
  it('rejects exact 500ms long tasks, invalid monitors, and unchanged FPS/p95 limits',()=>{
    const frame={medianFps:60,p95Ms:24,maxMs:16};
    for(const monitor of [{...healthy,maxLongTaskMs:500},{...healthy,valid:false},{...healthy,heartbeatCount:0},{...healthy,elapsedMs:59000}])expect(performanceGates(frame,monitor).passed).toBe(false);
    expect(performanceGates({...frame,medianFps:54.9},healthy).passed).toBe(false);
    expect(performanceGates({...frame,p95Ms:33},healthy).passed).toBe(false);
  });
  it('measures lateness beyond the 25ms timer period and includes the final unfinished interval',()=>{
    const {monitor,setTime}=setup();setTime(125);vi.advanceTimersByTime(25);setTime(726.1);vi.advanceTimersByTime(25);
    expect(monitor.maxHeartbeatLatenessMs).toBeCloseTo(576.1);expect(monitor.heartbeatCount).toBe(2);
    setTime(1300);monitor.finish();expect(monitor.heartbeats.at(-1).timestamp).toBe(1300);expect(vi.getTimerCount()).toBe(0);
  });
  it('collects buffered long tasks but excludes entries before the measurement window',()=>{
    const {monitor,setTime,pending,deliver}=setup();deliver([{startTime:10,duration:50},{startTime:125,duration:110}]);
    pending.push({startTime:250,duration:510});setTime(800);monitor.finish();
    expect(monitor.longTasks).toEqual([{startTime:125,duration:110},{startTime:250,duration:510}]);expect(monitor.maxLongTaskMs).toBe(510);
  });
  it('counts the part of a task that overlaps the start boundary',()=>{
    const {monitor,setTime,pending}=setup();pending.push({startTime:50,duration:600});setTime(800);monitor.finish();expect(monitor.maxLongTaskMs).toBe(550);
  });
  it('marks a hidden page or unsupported Long Tasks observer invalid',()=>{
    const {monitor}=setup();vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));monitor.finish();expect(monitor.valid).toBe(false);
    const next=setup(false);next.monitor.finish();expect(next.monitor.valid).toBe(false);
  });
  it('stops collecting after finish and bounds evidence without hiding overflow',()=>{
    const {monitor,setTime,deliver}=setup();for(let i=0;i<10002;i++){setTime(125+i*25);vi.advanceTimersByTime(25);}
    expect(monitor.heartbeats).toHaveLength(10000);expect(monitor.valid).toBe(false);monitor.finish();
    const count=monitor.longTasks.length;deliver([{startTime:1000,duration:999}]);expect(monitor.longTasks).toHaveLength(count);
  });
});
