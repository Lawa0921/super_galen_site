/** Test-only lossless PCM tap. Never emits the captured signal into the output. */
class RtsPcmCapture extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [
    {name:'captureFrameLow',defaultValue:-1,minValue:-1,maxValue:1048576,automationRate:'a-rate'},
    {name:'captureFrameEpoch',defaultValue:-1,minValue:-1,maxValue:2147483647,automationRate:'a-rate'}
  ];}
  constructor(options) {
    super();
    this.batchFrames=Math.max(128,Math.min(65536,options.processorOptions?.batchFrames??8192));
    this.sequence=0;this.channels=0;this.count=0;this.firstFrame=null;this.endFrame=null;this.inactiveInputFrames=0;this.batchInactiveFrames=0;
    this.stopRequested=false;this.stopped=false;this.buffer=null;this.armed=options.processorOptions?.startArmed===true;
    this.renderQuanta=[];this.globalFrameAnomalies=0;this.quantumCount=0;
    this.port.onmessage=event=>{if(event.data?.type==='stop')this.stopRequested=true;
      if(event.data?.type==='start'&&!this.stopRequested&&!this.stopped)this.armed=true;};
  }
  flush() {
    if(!this.count)return;
    const pcm=this.buffer.slice(0,this.count*this.channels);
    this.port.postMessage({type:'pcm',sequence:this.sequence++,startFrame:this.batchStart,
      frameCount:this.count,channelCount:this.channels,sampleRate,inactiveInputFrames:this.batchInactiveFrames,renderQuanta:this.renderQuanta,buffer:pcm.buffer},[pcm.buffer]);
    this.count=0;this.batchInactiveFrames=0;this.renderQuanta=[];
  }
  process(inputs,outputs,parameters={}) {
    const entryFrame=currentFrame;
    for(const output of outputs)for(const channel of output)channel.fill(0);
    if(this.stopped)return false;
    if(this.stopRequested){
      this.flush();this.stopped=true;
      this.port.postMessage({type:'stopAck',firstFrame:this.firstFrame,lastFrameExclusive:this.endFrame,nextSequence:this.sequence,inactiveInputFrames:this.inactiveInputFrames,
        quantumCount:this.quantumCount,globalFrameAnomalies:this.globalFrameAnomalies,frameClock:'native-a-rate-low20-epoch'});
      return false;
    }
    if(!this.armed)return true;
    const input=inputs[0];
    const inactive=Array.isArray(input)&&input.length===0;
    const channels=inactive?(this.channels||outputs[0]?.length):input?.length;
    const frames=inactive?outputs[0]?.[0]?.length:input?.[0]?.length;
    if(!Array.isArray(input)||!channels||channels>2||!frames||frames>this.batchFrames||
        (!inactive&&input.some(channel=>channel.length!==frames))||(this.channels&&channels!==this.channels)){
      this.port.postMessage({type:'error',message:'Missing or changed PCM input channel shape',frame:currentFrame,inputChannels:input?.length,inputFrames:input?.map(channel=>channel.length)});
      this.stopRequested=true;return true;
    }
    const low=parameters.captureFrameLow,epoch=parameters.captureFrameEpoch;
    const value=(array,index)=>array?.[array.length===1?0:index];
    const nativeStart=value(epoch,0)*1048576+Math.round(value(low,0));
    let maximumClockDecodeError=0;
    for(let frame=0;frame<frames;frame++){
      const lo=value(low,frame),hi=value(epoch,frame),decoded=Math.round(lo),decodeError=Math.abs(lo-decoded),actual=hi*1048576+decoded;
      maximumClockDecodeError=Math.max(maximumClockDecodeError,decodeError);
      // Decode the float32 timeline measurement only inside a strict, unambiguous
      // eighth-frame precision budget. Never round or resample any PCM value.
      if(!Number.isFinite(lo)||decodeError>.125||lo<0||lo>1048576||!Number.isSafeInteger(hi)||hi<0||
        !Number.isSafeInteger(actual)||actual!==nativeStart+frame){
        this.flush();this.port.postMessage({type:'error',message:'Invalid or discontinuous native frame clock',globalFrame:entryFrame,frameOffset:frame,low:lo,epoch:hi});
        this.stopRequested=true;return true;
      }
    }
    if(this.endFrame!==null&&nativeStart!==this.endFrame){
      this.flush();this.port.postMessage({type:'error',message:'PCM frame discontinuity',expectedFrame:this.endFrame,actualFrame:nativeStart,globalFrame:entryFrame});
    }
    if(this.firstFrame===null)this.firstFrame=nativeStart;
    if(!this.channels){this.channels=channels;this.buffer=new Float32Array(this.batchFrames*this.channels);}
    if(this.count+frames>this.batchFrames)this.flush();
    if(entryFrame!==nativeStart)this.globalFrameAnomalies++;
    this.quantumCount++;
    this.renderQuanta.push({startFrame:nativeStart,frameCount:frames,globalFrame:entryFrame,
      nativeLowFirst:value(low,0),nativeEpochFirst:value(epoch,0),nativeLowLast:value(low,frames-1),nativeEpochLast:value(epoch,frames-1),
      maximumClockDecodeError,nativeEverySampleValidated:true,inactiveInput:inactive});
    // W3C: inputs[0]=[] only when no upstream node is actively processing this quantum.
    // Record only this native-render-clock-witnessed quantum. Never fill any frame gap.
    for(let frame=0;frame<frames;frame++){
      if(!this.count)this.batchStart=nativeStart+frame;
      for(let channel=0;channel<this.channels;channel++)this.buffer[this.count*this.channels+channel]=inactive?0:input[channel][frame];
      if(inactive){this.batchInactiveFrames++;this.inactiveInputFrames++;}
      this.count++;
    }
    this.endFrame=nativeStart+frames;
    if(this.count===this.batchFrames)this.flush();
    return true;
  }
}
registerProcessor('rts-pcm-capture',RtsPcmCapture);
