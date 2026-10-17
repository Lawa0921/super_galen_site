/** Test-only PCM protocol guards, also exercised by Node VM tests. */
function schedulePcmFrameClock(tap,rate,now,horizonSeconds=7200){
  // Only future automation: scheduling at t=0 after resume clamps the event to now.
  // Values stay within float32's exact integer range, including after many minutes.
  const period=1048576,anchorFrame=Math.ceil((now+.1)*rate/128)*128;
  const low=tap.parameters.get('captureFrameLow'),epoch=tap.parameters.get('captureFrameEpoch');
  const firstEpoch=Math.floor(anchorFrame/period),lastEpoch=Math.ceil((anchorFrame+horizonSeconds*rate)/period);
  low.setValueAtTime(anchorFrame-firstEpoch*period,anchorFrame/rate);
  epoch.setValueAtTime(firstEpoch,anchorFrame/rate);
  const sampleEventTime=frame=>{
    // AudioParam set events select ceil(time * sampleRate). Division can round
    // just above the integer sample, so place the event strictly within its bin.
    const time=(frame-.0001)/rate;
    if(Math.ceil(time*rate)!==frame)throw new Error('Native clock event cannot target its exact integer sample');
    return time;
  };
  for(let next=firstEpoch+1;next<=lastEpoch;next++){
    const boundary=next*period;
    low.linearRampToValueAtTime(period,boundary/rate);
    // The boundary sample uses preceding epoch + period, then next sample uses next epoch +1.
    // Separating ramp/reset by one sample avoids same-time event ordering ambiguity.
    low.setValueAtTime(1,sampleEventTime(boundary+1));
    epoch.setValueAtTime(next,sampleEventTime(boundary+1));
  }
  return {mode:'native-a-rate-low20-epoch',period,anchorFrame,horizonFrame:lastEpoch*period+1,horizonSeconds,
    evidence:'Native AudioParam timeline uses AudioDestinationHandler.CurrentSampleFrame; global currentFrame retained only as a diagnostic.'};
}
function acceptPcmPacket(r,data){
  const fail=message=>r.errors.push(message);
  if(data.type!=='pcm'||!Number.isSafeInteger(data.startFrame)||data.startFrame<0||
    !Number.isSafeInteger(data.sequence)||data.sequence<0||!Number.isSafeInteger(data.frameCount)||data.frameCount<=0||
    ![1,2].includes(data.channelCount)||data.sampleRate!==r.sampleRate||!(data.buffer instanceof ArrayBuffer)||
    data.buffer.byteLength!==data.frameCount*data.channelCount*4||!Number.isSafeInteger(data.inactiveInputFrames??0)||(data.inactiveInputFrames??0)<0||(data.inactiveInputFrames??0)>data.frameCount){fail('Invalid PCM packet shape');return false;}
  if(r.requiresNativeFrameClock){
    if(!Array.isArray(data.renderQuanta)||!data.renderQuanta.length){fail('Missing native frame witness');return false;}
    let expected=data.startFrame,quantums=0,anomalies=0;
    for(const q of data.renderQuanta){
      const first=q.nativeEpochFirst*1048576+Math.round(q.nativeLowFirst),last=q.nativeEpochLast*1048576+Math.round(q.nativeLowLast);
      if(!Number.isSafeInteger(q.startFrame)||q.startFrame!==expected||!Number.isSafeInteger(q.frameCount)||q.frameCount<=0||
        q.nativeEverySampleValidated!==true||first!==expected||last!==expected+q.frameCount-1||
        !Number.isFinite(q.maximumClockDecodeError)||q.maximumClockDecodeError<0||q.maximumClockDecodeError>.125||
        Math.abs(q.nativeLowFirst-Math.round(q.nativeLowFirst))>.125||Math.abs(q.nativeLowLast-Math.round(q.nativeLowLast))>.125||
        !Number.isSafeInteger(q.globalFrame)||q.globalFrame<0){fail('Invalid native frame witness');return false;}
      expected+=q.frameCount;quantums++;if(q.globalFrame!==q.startFrame)anomalies++;
    }
    if(expected!==data.startFrame+data.frameCount){fail('Native frame witness does not span PCM packet');return false;}
    r.quantumCount=(r.quantumCount??0)+quantums;r.globalFrameAnomalies=(r.globalFrameAnomalies??0)+anomalies;
  }
  if(data.sequence!==r.nextSequence)fail(`PCM sequence discontinuity: ${r.nextSequence} -> ${data.sequence}`);
  if(r.endFrame!==null&&data.startFrame!==r.endFrame)fail(`PCM frame discontinuity: ${r.endFrame} -> ${data.startFrame}`);
  if(r.channels!==null&&data.channelCount!==r.channels){fail('PCM channel count changed');return false;}
  if(r.firstFrame===null)r.firstFrame=data.startFrame;
  r.channels=data.channelCount;r.endFrame=data.startFrame+data.frameCount;r.nextSequence=data.sequence+1;
  if(r.queuedBytes+data.buffer.byteLength>r.maxQueuedBytes){fail('PCM queue exceeded bounded memory budget; capture invalid');return false;}
  r.inactiveInputFrames=(r.inactiveInputFrames??0)+(data.inactiveInputFrames??0);r.frames+=data.frameCount;r.chunks.push(data);r.queuedBytes+=data.buffer.byteLength;
  r.maximumQueuedBytes=Math.max(r.maximumQueuedBytes??0,r.queuedBytes);
  return true;
}
function acknowledgePcmStop(r,data){
  r.stopAck=data;
  if(r.firstFrame===null||!r.frames)r.errors.push('Empty PCM capture');
  if(data.firstFrame!==r.firstFrame||data.lastFrameExclusive!==r.endFrame||data.nextSequence!==r.nextSequence||
      data.lastFrameExclusive-data.firstFrame!==r.frames||(data.inactiveInputFrames!==undefined&&data.inactiveInputFrames!==(r.inactiveInputFrames??0)))r.errors.push('PCM stopAck does not match exact received frame interval');
  if(r.requiresNativeFrameClock&&(data.frameClock!=='native-a-rate-low20-epoch'||data.quantumCount!==r.quantumCount||data.globalFrameAnomalies!==r.globalFrameAnomalies))r.errors.push('PCM stopAck does not match native frame witness totals');
}
const main=await (await fetch('/src/scripts/games/rts/main.ts')).text();
    const path=main.match(/from\s+["']([^"']*\/audio\.ts[^"']*)["']/)?.[1];
    if(!path)throw new Error('Cannot resolve the exact runtime audio module');
    const audioSource=await (await fetch(path)).text();
    const scorePath=audioSource.match(/from\s+["']([^"']*\/audio-score\.ts[^"']*)["']/)?.[1];
    const uiPath=main.match(/from\s+["']([^"']*\/ui\.ts[^"']*)["']/)?.[1];
    if(!scorePath||!uiPath)throw new Error('Missing served audio dependencies');
    const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
    const servedModules=await Promise.all([
      ['src/scripts/games/rts/main.ts','/src/scripts/games/rts/main.ts',main],
      ['src/scripts/games/rts/audio.ts',path,audioSource],
      ['src/scripts/games/rts/audio-score.ts',scorePath,null],
      ['src/scripts/games/rts/ui.ts',uiPath,null]
    ].map(async ([localPath,url,body])=>{
      const content=body??await (await fetch(url)).text();
      const encoded=content.match(/sourceMappingURL=data:application\/json;base64,([^\s]+)/)?.[1];
      if(!encoded)throw new Error(`No source identity map: ${url}`);
      const map=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),x=>x.charCodeAt(0))));
      if(map.sourcesContent?.length!==1||typeof map.sourcesContent[0]!=='string')throw new Error(`Ambiguous source identity: ${url}`);
      return {localPath,url,responseSha256:await digest(content),originalSourceSha256:await digest(map.sourcesContent[0])};
    }));

const {RtsAudio}=await import(path),prototype=RtsAudio.prototype;
const start=prototype.start,play=prototype.play,dispose=prototype.dispose;
const state={events:[],errors:[],contexts:[],restored:false,recording:null};
const parameters=audio=>({masterGain:audio.master.gain.value,threshold:audio.compressor.threshold.value,knee:audio.compressor.knee.value,
  ratio:audio.compressor.ratio.value,attack:audio.compressor.attack.value,release:audio.compressor.release.value});
const measure=audio=>({voices:audio.voices?.length??0,sources:audio.voices?.reduce((n,v)=>n+v.sources.length,0)??0});
const workletUrl=URL.createObjectURL(new Blob([window.__rtsPcmWorkletSource],{type:'text/javascript'}));
async function attach(audio){
  const context=audio.ctx;
  const r=state.recording={context,audio,compressor:audio.compressor,sampleRate:context.sampleRate,firstFrame:null,endFrame:null,
    channels:null,frames:0,nextSequence:0,errors:[],chunks:[],ledger:[],queuedBytes:0,maxQueuedBytes:8*1024*1024,maximumQueuedBytes:0,
    stopAck:null,stopResolve:null,wallStart:performance.now(),audioStart:context.currentTime,graphCreationParameters:parameters(audio),contextTransitions:[],requiresNativeFrameClock:true};
  r.observeState=()=>r.contextTransitions.push({state:context.state,wall:performance.now(),audio:context.currentTime});
  context.addEventListener('statechange',r.observeState);r.observeState();
  r.ack=new Promise(resolve=>{r.stopResolve=resolve;});
  try{
    await context.audioWorklet.addModule(workletUrl);
    // AudioParam.value reflects scheduled runtime initialization only after natural resume/render.
    const deadline=performance.now()+10000;
    while(context.state!=='running'||context.currentTime===0){
      if(context.state==='closed'||performance.now()>deadline)throw new Error('Natural audio context did not resume/render');
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    r.parametersBefore=parameters(audio);
    const tap=new AudioWorkletNode(context,'rts-pcm-capture',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',channelInterpretation:'speakers',outputChannelCount:[2],processorOptions:{batchFrames:8192}});
    r.frameClock=schedulePcmFrameClock(tap,context.sampleRate,context.currentTime);
    const pull=context.createGain();pull.gain.setValueAtTime(0,context.currentTime);r.tap=tap;r.pull=pull;
    tap.onprocessorerror=()=>{r.errors.push('AudioWorklet processorerror');r.stopResolve();};
    tap.port.onmessage=event=>{
      const data=event.data;
      if(data.type==='pcm'){
        const accepted=acceptPcmPacket(r,data);
        r.ledger.push({sequence:data.sequence,startFrame:data.startFrame,frameCount:data.frameCount,channelCount:data.channelCount,sampleRate:data.sampleRate,inactiveInputFrames:data.inactiveInputFrames,renderQuanta:data.renderQuanta,bytes:data.buffer?.byteLength,accepted});
        if(!accepted)tap.port.postMessage({type:'stop'});
      }else if(data.type==='stopAck'){acknowledgePcmStop(r,data);r.stopResolve();}
      else if(data.type==='error'){r.errors.push(JSON.stringify(data));tap.port.postMessage({type:'stop'});}
      else r.errors.push('Unknown PCM message');
    };
    while(context.currentTime<r.frameClock.anchorFrame/context.sampleRate){
      if(context.state==='closed'||performance.now()>deadline)throw new Error('Native PCM frame-clock anchor did not render');
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    audio.compressor.connect(tap);tap.connect(pull);pull.connect(context.destination);
    tap.port.postMessage({type:'start'});
    r.parametersAfterConnect=parameters(audio);r.tapReady={wall:performance.now(),audio:context.currentTime};
  }catch(error){r.errors.push(`Cannot attach lossless tap: ${error}`);r.stopResolve();}
}
prototype.start=function(...args){
  const result=start.apply(this,args),context=this.ctx;
  if(context&&!state.contexts.includes(context)){
    state.contexts.push(context);
    if(state.recording)state.errors.push('Audio capture expects one naturally created match');
    else state.attaching=attach(this);
  }
  return result;
};
prototype.play=function(kind){
  const before=this.last?.get(kind),context=this.ctx,result=play.call(this,kind);
  state.events.push({kind,wallMs:performance.now(),audioTime:context?.currentTime??null,contextState:context?.state??null,
    scheduled:this.last?.get(kind)!==before,...measure(this)});return result;
};
prototype.dispose=function(...args){
  const before=measure(this);
  if(state.recording&&!state.restored)state.recording.errors.push('Runtime disposed the captured graph before lossless stopAck');
  const result=dispose.apply(this,args);state.events.push({kind:'dispose',wallMs:performance.now(),before,...measure(this)});return result;
};
window.rtsAudioCapture={
  servedModules,isFinished(){return state.restored;},
  takeChunks(limit=4){
    const r=state.recording;if(!r)return [];
    return r.chunks.splice(0,Math.min(4,Math.max(1,limit))).map(data=>{
      const bytes=new Uint8Array(data.buffer);r.queuedBytes-=bytes.byteLength;
      let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return {base64:btoa(binary),sequence:data.sequence,startFrame:data.startFrame,frameCount:data.frameCount,channelCount:data.channelCount,sampleRate:data.sampleRate};
    });
  },
  async finish(){
    if(state.finishing)return state.finishing;
    state.finishing=(async()=>{
      if(state.attaching)await state.attaching;
      const r=state.recording;
      try{
        if(!r){state.errors.push('No live audio graph was captured');return {errors:state.errors,servedModules,status:'invalid',events:state.events};}
        r.stopRequested={wall:performance.now(),audio:r.context.currentTime};
        if(r.tap){r.tap.port.postMessage({type:'stop'});let timer;
          await Promise.race([r.ack,new Promise(resolve=>{timer=setTimeout(()=>{r.errors.push('PCM stopAck timeout; incomplete capture');resolve();},5000);})]);clearTimeout(timer);
        }
        if(!r.stopAck)r.errors.push('No PCM stopAck received');
        r.stopAcknowledged={wall:performance.now(),audio:r.context.currentTime};
        if(r.audio.master&&r.audio.compressor)r.parametersBeforeDisconnect=parameters(r.audio);
        if(r.tap){try{r.compressor.disconnect(r.tap);}catch(error){r.errors.push(`Tap disconnect: ${error}`);}r.tap.disconnect();r.pull.disconnect();}
        if(r.audio.master&&r.audio.compressor)r.parametersAfterDisconnect=parameters(r.audio);
        const before=JSON.stringify(r.parametersBefore);
        if([r.parametersAfterConnect,r.parametersBeforeDisconnect,r.parametersAfterDisconnect].some(p=>JSON.stringify(p)!==before))r.errors.push('Main master/compressor parameters changed during capture');
        return {format:'IEEE_FLOAT32_WAV',sampleRate:r.sampleRate,channelCount:r.channels,frames:r.frames,firstFrame:r.firstFrame,lastFrameExclusive:r.endFrame,
          nextSequence:r.nextSequence,inactiveInputFrames:r.inactiveInputFrames??0,stopAck:r.stopAck,pcmLedger:r.ledger,maximumQueuedBytes:r.maximumQueuedBytes,maxQueuedBytes:r.maxQueuedBytes,
          frameClock:{...r.frameClock,maximumDecodeErrorFrames:.125},globalFrameAnomalies:r.globalFrameAnomalies,quantumCount:r.quantumCount,contextTransitions:r.contextTransitions,
          wallSeconds:(r.stopRequested.wall-r.wallStart)/1000,audioSeconds:r.frames/r.sampleRate,
          contextElapsedSeconds:r.stopRequested.audio-r.audioStart,
          recordingClocks:{startRequested:{wall:r.wallStart,audio:r.audioStart},tapReady:r.tapReady,
            firstPcmFrameSeconds:r.firstFrame===null?null:r.firstFrame/r.sampleRate,stopRequested:r.stopRequested,stopAcknowledged:r.stopAcknowledged},
          mainParameters:{before:r.parametersBefore,afterConnect:r.parametersAfterConnect,beforeDisconnect:r.parametersBeforeDisconnect,afterDisconnect:r.parametersAfterDisconnect},
          graphCreationParameters:r.graphCreationParameters,tapChannelContract:'explicit 2-channel speakers; inputs[0] contains standard Web Audio mixing; source compressor and destination unchanged',contextState:r.context.state,events:state.events,errors:[...state.errors,...r.errors],servedModules,
          clock:'real wall clock; no Playwright clock installed',source:'Additional compressor -> AudioWorklet PCM tap -> Gain(0) -> destination; original compressor -> destination remains connected',
          gameplayStateInjection:false,artisticListeningApproved:false,
          limitations:['Capture interval begins at first actual worklet input frame after asynchronous addModule and future native-clock anchor; earlier runtime audio is outside this interval.','Signal mechanics do not constitute artistic listening approval.']};
      }finally{
        if(r?.observeState)r.context.removeEventListener('statechange',r.observeState);
        prototype.start=start;prototype.play=play;prototype.dispose=dispose;state.restored=true;URL.revokeObjectURL(workletUrl);
      }
    })();
    return state.finishing;
  }
};
