const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');

function worklet(batchFrames=256,startArmed=true){
  const file=path.join(__dirname,'rts-audio-capture-worklet.js');
  let Processor;
  const messages=[];
  const context=vm.createContext({Float32Array,ArrayBuffer,currentFrame:0,sampleRate:48000,
    AudioWorkletProcessor:class{constructor(){this.port={postMessage:(data,transfer=[])=>messages.push({data,transfer})};}},
    registerProcessor:(name,type)=>{assert.equal(name,'rts-pcm-capture');Processor=type;}});
  if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),context);
  assert.equal(typeof Processor,'function','lossless PCM worklet must be registered');
  const processor=new Processor({processorOptions:{batchFrames,startArmed}});
  return {messages,processor,step(frame,channels=[new Float32Array(128).fill(.25),new Float32Array(128).fill(-.5)],nativeFrame=frame){
    context.currentFrame=frame;const outputs=[[new Float32Array(128).fill(1),new Float32Array(128).fill(1)]];
    const low=new Float32Array(128),epoch=new Float32Array(128);
    for(let i=0;i<128;i++){const f=nativeFrame+i;low[i]=f%(1<<20);epoch[i]=Math.floor(f/(1<<20));}
    const alive=processor.process([channels],outputs,{captureFrameLow:low,captureFrameEpoch:epoch});return {alive,outputs};
  },stop(){processor.port.onmessage({data:{type:'stop'}});}};
}
function guards(){
  const source=fs.readFileSync(path.join(__dirname,'rts-audio-capture-browser.js'),'utf8');
  const context=vm.createContext({Float32Array,ArrayBuffer});
  vm.runInContext(source.split('const main=')[0],context);
  assert.equal(typeof context.acceptPcmPacket,'function','main must validate lossless frame metadata');
  return context;
}
function record(){return {firstFrame:null,endFrame:null,nextSequence:0,frames:0,channels:null,sampleRate:48000,errors:[],chunks:[],queuedBytes:0,maxQueuedBytes:1048576};}
function packet(startFrame=100,sequence=0){return {type:'pcm',startFrame,sequence,frameCount:128,channelCount:2,sampleRate:48000,buffer:new Float32Array(256).buffer};}

test('full quantum preserves interleaved real PCM and frame metadata',()=>{
  const w=worklet();w.step(100);w.step(228);assert.equal(w.messages.length,1);
  const p=w.messages[0];assert.equal(p.data.startFrame,100);assert.equal(p.data.frameCount,256);
  assert.equal(p.data.channelCount,2);assert.equal(p.data.sampleRate,48000);assert.equal(p.data.sequence,0);
  assert.deepEqual(Array.from(new Float32Array(p.data.buffer).slice(0,4)),[.25,-.5,.25,-.5]);
  assert.equal(p.transfer[0],p.data.buffer);
});
test('next-quantum stop flushes partial tail then exact stopAck and stops',()=>{
  const w=worklet();w.step(0);w.step(128);w.step(256);w.stop();const final=w.step(384);
  assert.equal(final.alive,false);assert.deepEqual(w.messages.map(m=>m.data.type),['pcm','pcm','stopAck']);
  assert.equal(w.messages[1].data.frameCount,128);assert.equal(w.messages[1].data.startFrame,256);
  assert.equal(w.messages[2].data.lastFrameExclusive,384);assert.equal(w.messages[2].data.firstFrame,0);
  assert.equal(w.messages[2].data.nextSequence,2);assert.equal(w.step(512).alive,false);assert.equal(w.messages.length,3);
});
test('each transferred batch owns a fresh buffer and output is always zero',()=>{
  const w=worklet(128);const a=w.step(0);w.step(128);
  assert.notEqual(w.messages[0].data.buffer,w.messages[1].data.buffer);
  assert.deepEqual(Array.from(new Float32Array(w.messages[0].data.buffer).slice(0,2)),[.25,-.5]);
  assert(a.outputs.flat().every(channel=>channel.every(x=>x===0)));
});
test('worklet reports input frame gap instead of filling it',()=>{
  const w=worklet();w.step(0);w.step(256);assert(w.messages.some(m=>m.data.type==='error'&&m.data.message.includes('frame discontinuity')));
});
test('stale Chromium global frame is observed, while native render PCM remains lossless',()=>{
  const w=worklet();w.step(0,undefined,0);w.step(0,undefined,128);w.step(256,undefined,256);w.stop();w.step(384);
  assert.equal(w.messages.filter(m=>m.data.type==='error').length,0);
  const chunks=w.messages.filter(m=>m.data.type==='pcm').map(m=>m.data);
  assert.equal(chunks.reduce((n,m)=>n+m.frameCount,0),384);
  assert.equal(chunks[0].startFrame,0);assert.equal(chunks[1].startFrame,256);
  assert.equal(w.messages.at(-1).data.globalFrameAnomalies,1);
  assert.deepEqual(Array.from(chunks[0].renderQuanta,q=>q.globalFrame),[0,0]);
  assert.deepEqual(Array.from(chunks[0].renderQuanta,q=>q.startFrame),[0,128]);
  assert.deepEqual(Array.from(new Float32Array(chunks[0].buffer).slice(0,4)),[.25,-.5,.25,-.5]);
});
test('native clock epoch boundary preserves all samples and integer frame coordinates',()=>{
  const w=worklet();const boundary=1<<20;w.step(boundary-128);w.step(boundary);w.stop();w.step(boundary+128);
  const pcm=w.messages.find(m=>m.data.type==='pcm').data;
  assert.equal(pcm.startFrame,boundary-128);assert.equal(pcm.frameCount,256);
  assert.equal(pcm.renderQuanta[1].startFrame,boundary);
  assert.equal(w.messages.filter(m=>m.data.type==='error').length,0);
});
test('missing or non-integer native clock never falls back to guessed global frame',()=>{
  const w=worklet();w.processor.process([[new Float32Array(128),new Float32Array(128)]],[[new Float32Array(128),new Float32Array(128)]],{});
  assert(w.messages.some(m=>m.data.type==='error'&&m.data.message.includes('native frame clock')));
  assert.equal(w.messages.filter(m=>m.data.type==='pcm').length,0);
});
test('tap does not begin its interval before native clock anchor and explicit arm',()=>{
  const w=worklet(128,false);
  w.processor.process([[]],[[new Float32Array(128),new Float32Array(128)]],{});
  assert.equal(w.messages.length,0);
  w.processor.port.onmessage({data:{type:'start'}});w.step(512);w.stop();w.step(640);
  assert.equal(w.messages[0].data.startFrame,512);
  assert.equal(w.messages.at(-1).data.firstFrame,512);
  assert.equal(w.messages.filter(m=>m.data.type==='error').length,0);
});
test('fractional native clock samples invalidate without rounding or relabeling',()=>{
  const w=worklet();w.step(0,undefined,.25);
  assert(w.messages.some(m=>m.data.type==='error'&&m.data.message.includes('native frame clock')));
  assert.equal(w.messages.filter(m=>m.data.type==='pcm').length,0);
});
test('native clock float32 quantization is decoded only within an unambiguous eighth-frame bound',()=>{
  const w=worklet();w.step(0,undefined,.0625);w.stop();w.step(128);
  assert.equal(w.messages.filter(m=>m.data.type==='error').length,0);
  const packet=w.messages.find(m=>m.data.type==='pcm').data;
  assert.equal(packet.startFrame,0);assert.equal(packet.renderQuanta[0].maximumClockDecodeError,.0625);
  assert.equal(packet.renderQuanta[0].nativeLowFirst,.0625);
});
test('malformed input and changed channel shape invalidate rather than synthesize PCM',()=>{
  const w=worklet();w.step(0);w.step(128,null);assert(w.messages.some(m=>m.data.type==='error'));
  const v=worklet();v.step(0);v.step(128,[new Float32Array(128)]);assert(v.messages.some(m=>m.data.type==='error'));
});
test('inactive upstream empty array is current-quantum silence, then real PCM resumes',()=>{
  const w=worklet();w.step(0);w.step(128,[]);w.step(256);w.stop();w.step(384);
  assert.equal(w.messages.filter(m=>m.data.type==='error').length,0);
  const chunks=w.messages.filter(m=>m.data.type==='pcm').map(m=>m.data);
  assert.deepEqual(Array.from(new Float32Array(chunks[0].buffer).slice(256)),Array(256).fill(0));
  assert.equal(chunks[0].inactiveInputFrames,128);assert.equal(chunks[1].inactiveInputFrames,0);
  assert.deepEqual(Array.from(new Float32Array(chunks[1].buffer).slice(0,2)),[.25,-.5]);
  assert.equal(w.messages.at(-1).data.lastFrameExclusive,384);
});
test('inactive input never fills a skipped currentFrame quantum',()=>{
  const w=worklet();w.step(0,[]);w.step(256,[]);w.stop();w.step(384);
  assert(w.messages.some(m=>m.data.type==='error'&&m.data.message.includes('frame discontinuity')));
  assert.equal(w.messages.filter(m=>m.data.type==='pcm').reduce((n,m)=>n+m.data.frameCount,0),256);
});
test('stopping before input yields explicit empty-capture ack, no PCM',()=>{
  const w=worklet();w.stop();assert.equal(w.step(0).alive,false);assert.equal(w.messages.length,1);
  assert.equal(w.messages[0].data.firstFrame,null);assert.equal(w.messages[0].data.lastFrameExclusive,null);
});
test('main accepts contiguous packets and acknowledges exact tail',()=>{
  const g=guards(),r=record();g.acceptPcmPacket(r,packet());g.acceptPcmPacket(r,packet(228,1));
  g.acknowledgePcmStop(r,{firstFrame:100,lastFrameExclusive:356,nextSequence:2});
  assert.equal(r.frames,256);assert.equal(r.errors.length,0);assert.equal(r.stopAck.lastFrameExclusive,356);
});
for(const [name,start,sequence] of [['gap',229,1],['overlap',227,1],['sequence skip',228,2]]){
  test(`main rejects ${name} without hiding invalid evidence`,()=>{
    const g=guards(),r=record();g.acceptPcmPacket(r,packet());g.acceptPcmPacket(r,packet(start,sequence));assert(r.errors.length>0);
  });
}
test('main rejects stopAck tail mismatch and empty capture',()=>{
  const g=guards(),r=record();g.acceptPcmPacket(r,packet());g.acknowledgePcmStop(r,{firstFrame:100,lastFrameExclusive:229,nextSequence:1});assert(r.errors.length>0);
  const empty=record();g.acknowledgePcmStop(empty,{firstFrame:null,lastFrameExclusive:null,nextSequence:0});assert(empty.errors.length>0);
});
test('main validates payload size and bounds queued memory with explicit failure',()=>{
  const g=guards(),r=record();const p=packet();p.frameCount=129;g.acceptPcmPacket(r,p);assert(r.errors.length>0);
  const limited=record();limited.maxQueuedBytes=1;g.acceptPcmPacket(limited,packet());assert(limited.errors.length>0);assert.equal(limited.queuedBytes,0);
});
test('main requires native frame witnesses and detects witness disagreement',()=>{
  const g=guards(),missing=record();missing.requiresNativeFrameClock=true;
  assert.equal(g.acceptPcmPacket(missing,packet()),false);
  const invalid=record();invalid.requiresNativeFrameClock=true;const p=packet();
  p.renderQuanta=[{startFrame:101,frameCount:128,globalFrame:100,nativeLowFirst:101,nativeEpochFirst:0,nativeLowLast:228,nativeEpochLast:0,nativeEverySampleValidated:true}];
  assert.equal(g.acceptPcmPacket(invalid,p),false);
});
test('clock scheduling uses future integer anchor, exact low20 ramp and separated epoch reset',()=>{
  const g=guards(),events={captureFrameLow:[],captureFrameEpoch:[]};
  const tap={parameters:new Map(Object.entries(events).map(([key,value])=>[key,{setValueAtTime:(v,t)=>value.push(['set',v,t]),linearRampToValueAtTime:(v,t)=>value.push(['ramp',v,t])}]))};
  const plan=g.schedulePcmFrameClock(tap,48000,5,60);
  assert(plan.anchorFrame>=Math.ceil(5.1*48000));assert.equal(plan.anchorFrame%128,0);
  const low=events.captureFrameLow,epoch=events.captureFrameEpoch;
  assert.equal(low[0][1],plan.anchorFrame);assert(Math.abs(low[0][2]*48000-plan.anchorFrame)<1e-8);
  assert.equal(low[1][1],1<<20);assert.equal(low[2][1],1);
  assert.equal(Math.ceil(low[2][2]*48000),(1<<20)+1);
  assert.equal(epoch[1][2],low[2][2]);
});
test('clock resets are assigned to their exact native sample despite double division overshoot',()=>{
  const g=guards(),events={captureFrameLow:[],captureFrameEpoch:[]};
  const tap={parameters:new Map(Object.entries(events).map(([key,value])=>[key,{setValueAtTime:(v,t)=>value.push(['set',v,t]),linearRampToValueAtTime:(v,t)=>value.push(['ramp',v,t])}]))};
  g.schedulePcmFrameClock(tap,48000,0,90);
  for(const [kind,value,time] of events.captureFrameEpoch.slice(1)){
    assert.equal(kind,'set');assert.equal(Math.ceil(time*48000),value*(1<<20)+1);
  }
});

const waveformFixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'rts-pcm-waveform-'));
function waveformFixture(name,mutate=()=>{},sample=.1,frames=1000){
  const folder=path.join(waveformFixtureRoot,name);
  fs.mkdirSync(folder,{recursive:true});
  const bytes=frames*8,wav=Buffer.alloc(56+bytes),h=wav;
  h.write('RIFF');h.writeUInt32LE(48+bytes,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(3,20);
  h.writeUInt16LE(2,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(48000*8,28);h.writeUInt16LE(8,32);h.writeUInt16LE(32,34);
  h.write('fact',36);h.writeUInt32LE(4,40);h.writeUInt32LE(frames,44);h.write('data',48);h.writeUInt32LE(bytes,52);
  for(let i=56;i<h.length;i+=4)h.writeFloatLE(sample,i);
  const param={masterGain:.7,threshold:-10,knee:12,ratio:5,attack:.003,release:.12};
  const capture={status:'passed_lossless_capture',format:'IEEE_FLOAT32_WAV',audioFile:'battle-audio.wav',
    audioSha256:createHash('sha256').update(wav).digest('hex'),sampleRate:48000,channelCount:2,
    frames,writtenFrames:frames,firstFrame:100,lastFrameExclusive:100+frames,nextSequence:frames?1:0,audioSeconds:frames/48000,
    stopAck:{firstFrame:100,lastFrameExclusive:100+frames,nextSequence:frames?1:0},
    pcmLedger:frames?[{sequence:0,startFrame:100,frameCount:frames,channelCount:2,sampleRate:48000,bytes,accepted:true}]:[],
    mainParameters:{before:param,afterConnect:param,beforeDisconnect:param,afterDisconnect:param},errors:[],events:[{kind:'order',scheduled:true,voices:1,sources:1,audioTime:100/48000}]};
  mutate(capture);fs.writeFileSync(path.join(folder,'battle-audio.wav'),wav);fs.writeFileSync(path.join(folder,'capture.json'),JSON.stringify(capture));
  const result=spawnSync('python',[path.join(__dirname,'rts-audio-waveform.py'),folder],{encoding:'utf8',windowsHide:true});
  const reportPath=path.join(folder,'waveform-qa.json');assert(fs.existsSync(reportPath),result.stderr);
  return {result,report:JSON.parse(fs.readFileSync(reportPath,'utf8'))};
}
test('waveform verifies direct float32 WAV and exact integer frame interval',()=>{
  const {result,report}=waveformFixture('valid');assert.equal(result.status,0,result.stderr);assert.equal(report.frames,1000);assert.equal(report.duration_difference_seconds,0);
});
test('waveform rejects even a single missing frame rather than using duration tolerance',()=>{
  const {result,report}=waveformFixture('one-frame-mismatch',c=>c.writtenFrames--);assert.equal(result.status,1);assert(report.errors.some(e=>e.includes('frame count mismatch')));
});
test('waveform rejects ledger gap despite matching total frames and duration',()=>{
  const {result,report}=waveformFixture('ledger-gap',c=>c.pcmLedger[0].startFrame++);assert.equal(result.status,1);assert(report.errors.some(e=>e.includes('discontinuity')));
});
test('waveform rejects silent PCM',()=>{const {result,report}=waveformFixture('silent',()=>{},0);assert.equal(result.status,1);assert.equal(report.peak,0);});
test('waveform rejects empty/no-context capture and preserves failure report',()=>{
  const {result,report}=waveformFixture('empty',c=>{c.status='invalid';c.firstFrame=null;c.lastFrameExclusive=null;c.stopAck=null;},0,0);
  assert.equal(result.status,1);assert.equal(report.frames,0);assert.equal(report.status,'failed_signal_mechanics');
});
test('waveform exposes source float NaNs and clipping without lossy encoding',()=>{
  const nan=waveformFixture('nan',()=>{},NaN);assert.equal(nan.result.status,1);assert.equal(nan.report.invalid_samples,2000);
  const clipped=waveformFixture('clipped',()=>{},1);assert.equal(clipped.result.status,1);assert.equal(clipped.report.clipped_samples,2000);
});
test('waveform rejects changed main parameters',()=>{
  const {result,report}=waveformFixture('parameter-change',c=>{c.mainParameters.afterDisconnect={...c.mainParameters.before,masterGain:.8};});
  assert.equal(result.status,1);assert(report.errors.some(e=>e.includes('parameters')));
});
test('waveform rejects cue scheduled outside the actual captured PCM interval',()=>{
  const {result,report}=waveformFixture('outside-cue',c=>{c.events[0].audioTime=10;});
  assert.equal(result.status,1);assert.equal(report.scheduled_cues_with_nonzero_pcm.length,0);
});
test('waveform rejects nonzero PCM without naturally scheduled cues',()=>{
  const {result}=waveformFixture('no-cue',c=>{c.events=[];});assert.equal(result.status,1);
});
test('waveform rejects native clock capture with missing quantum witnesses',()=>{
  const {result,report}=waveformFixture('missing-native-witness',c=>{c.frameClock={mode:'native-a-rate-low20-epoch',period:1<<20};});
  assert.equal(result.status,1);assert(report.errors.some(e=>e.includes('native frame witness')));
});
function nativeFixture(c){
  c.frameClock={mode:'native-a-rate-low20-epoch',period:1<<20};c.quantumCount=1;c.globalFrameAnomalies=1;
  c.stopAck.quantumCount=1;c.stopAck.globalFrameAnomalies=1;c.stopAck.frameClock=c.frameClock.mode;
  c.pcmLedger[0].renderQuanta=[{startFrame:100,frameCount:1000,globalFrame:0,nativeLowFirst:100.0625,nativeEpochFirst:0,nativeLowLast:1099.0625,nativeEpochLast:0,maximumClockDecodeError:.0625,nativeEverySampleValidated:true}];
}
test('waveform independently validates actual native witness frame span and decode bounds',()=>{
  const {result,report}=waveformFixture('native-valid',nativeFixture);
  assert.equal(result.status,0,result.stderr);assert.equal(report.native_render_quantums,1);
  assert.equal(report.global_frame_anomalies,1);assert.equal(report.maximum_native_clock_decode_error_frames,.0625);
});
test('waveform rejects native witness tail mismatch even when WAV and packet totals match',()=>{
  const {result,report}=waveformFixture('native-bad-tail',c=>{nativeFixture(c);c.pcmLedger[0].renderQuanta[0].nativeLowLast++;});
  assert.equal(result.status,1);assert(report.errors.some(e=>e.includes('native frame witness')));
});
