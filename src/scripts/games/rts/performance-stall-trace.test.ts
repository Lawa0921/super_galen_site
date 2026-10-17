import {afterEach,describe,expect,it,vi} from 'vitest';
import {installStallTrace} from '../../../../tests/manual/rts-performance-stall-trace';

afterEach(()=>{(globalThis as any).__rtsPerf?.stallTrace?.dispose();vi.useRealTimers();vi.restoreAllMocks();delete (globalThis as any).__rtsPerf;delete (globalThis as any).__rtsTimingHooks;});
function setup(options={}){
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});
  let time=100;vi.spyOn(performance,'now').mockImplementation(()=>time);
  class Phase {renderer={getContext:()=>({finish:()=>{time+=9;}})};frame(dt:number){time+=dt;return dt+1;}render(dt:number){time+=dt;if(dt===99)throw new Error('phase failed');return dt;}}
  const audit={samples:[] as number[],previous:100,recording:true,stallTrace:undefined as any};
  (globalThis as any).__rtsPerf=audit;(globalThis as any).__rtsTimingHooks={SimulationClock:Phase,Battlefield:class extends Phase {},Hud:class extends Phase {}};
  installStallTrace(options);return {audit,phase:new (globalThis as any).__rtsTimingHooks.Battlefield(),setTime:(value:number)=>time=value};
}
describe('test-only correlated stall trace',()=>{
  it('retains the original RAF values and timestamps without changing push semantics',()=>{
    const {audit,setTime}=setup();setTime(122);expect(audit.samples.push(20)).toBe(1);expect(audit.samples).toEqual([20]);
    expect(audit.stallTrace.frames).toEqual([{index:0,timestamp:120,callbackAt:122,delta:20}]);
  });
  it('keeps slow phase return values and exceptions while recording their time interval',()=>{
    const {audit,phase}=setup();expect(phase.frame(75)).toBe(76);expect(()=>phase.render(99)).toThrow('phase failed');
    expect(audit.stallTrace.tasks).toContainEqual({phase:'SimulationClock.frame',start:100,duration:75});
    expect(audit.stallTrace.tasks.some((t:any)=>t.duration===99)).toBe(true);
  });
  it('ignores short and unrecorded work, and restores all wrappers on disposal',()=>{
    const {audit,phase}=setup();phase.frame(20);audit.recording=false;phase.frame(70);expect(audit.stallTrace.tasks).toEqual([]);
    audit.stallTrace.dispose();audit.recording=true;phase.frame(75);audit.samples.push(80);expect(audit.stallTrace.tasks).toEqual([]);expect(audit.stallTrace.frames).toEqual([]);
  });
  it('bounds retained samples and records overflow instead of growing indefinitely',()=>{
    const {audit}=setup();for(let i=0;i<10002;i++)audit.samples.push(16);
    expect(audit.samples).toHaveLength(10002);expect(audit.stallTrace.frames).toHaveLength(10000);expect(audit.stallTrace.droppedFrames).toBe(2);
  });
  it('records independent timer progress only during recording and clears the timer on disposal',()=>{
    const {audit,setTime}=setup();setTime(125);vi.advanceTimersByTime(25);
    expect(audit.stallTrace.heartbeats).toEqual([{timestamp:125,delta:25}]);
    audit.recording=false;setTime(175);vi.advanceTimersByTime(25);
    audit.recording=true;setTime(200);vi.advanceTimersByTime(25);
    expect(audit.stallTrace.heartbeats).toEqual([{timestamp:125,delta:25},{timestamp:200,delta:25}]);
    audit.stallTrace.dispose();setTime(1000);vi.advanceTimersByTime(100);expect(audit.stallTrace.heartbeats).toHaveLength(2);expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds timer evidence even when animation frames stop',()=>{
    const {audit}=setup();vi.advanceTimersByTime(25*10002);
    expect(audit.stallTrace.heartbeats).toHaveLength(10000);expect(audit.stallTrace.droppedHeartbeats).toBe(2);expect(audit.stallTrace.frames).toEqual([]);
  });
  it('measures opt-in GPU completion separately from renderer work without changing its return',()=>{
    const {audit,phase}=setup({finish:true});expect(phase.render(75)).toBe(75);
    expect(audit.stallTrace.tasks).toContainEqual({phase:'Battlefield.render',start:100,duration:75});
    expect(audit.stallTrace.gpuFinishes).toEqual([{start:175,duration:9}]);
    audit.recording=false;phase.render(10);expect(audit.stallTrace.gpuFinishes).toHaveLength(1);
  });
  it('does not request GPU completion by default or after renderer failure',()=>{
    const {audit,phase}=setup();phase.render(75);expect(audit.stallTrace.gpuFinishes).toEqual([]);
    audit.stallTrace.dispose();const next=setup({finish:true});expect(()=>next.phase.render(99)).toThrow('phase failed');expect(next.audit.stallTrace.gpuFinishes).toEqual([]);
  });
});
