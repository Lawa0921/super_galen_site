/** Test-only lossless tap. No game state, master gain or scheduling changes. */
import type {Page} from '@playwright/test';
import {mkdir,readFile,writeFile,open,mkdtemp,copyFile,unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import type {FileHandle} from 'node:fs/promises';

const sourceFiles=['src/scripts/games/rts/audio.ts','src/scripts/games/rts/audio-score.ts','src/scripts/games/rts/ui.ts','src/scripts/games/rts/main.ts'];
type CaptureState={file:FileHandle;spool:string;sourceRoot:string;timer:ReturnType<typeof setInterval>|null;pending:Promise<void>|null;
  errors:string[];bytes:number;frames:number;channels:number|null;sampleRate:number|null;peak:number;clipped:number;invalid:number;energy:number;samples:number;finalized:boolean};
const captures=new WeakMap<Page,CaptureState>();
async function writeAll(file:FileHandle,buffer:Buffer){
  let offset=0;while(offset<buffer.length){const {bytesWritten}=await file.write(buffer,offset,buffer.length-offset);if(!bytesWritten)throw new Error('PCM spool write made no progress');offset+=bytesWritten;}
}
function wavHeader(bytes:number,frames:number,channels:number,rate:number){
  if(bytes>0xffffffff-48)throw new Error('Capture exceeds RIFF/WAV 32-bit size; raw spool retained');
  const h=Buffer.alloc(56);h.write('RIFF');h.writeUInt32LE(48+bytes,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);
  h.writeUInt16LE(3,20);h.writeUInt16LE(channels,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*channels*4,28);h.writeUInt16LE(channels*4,32);h.writeUInt16LE(32,34);
  h.write('fact',36);h.writeUInt32LE(4,40);h.writeUInt32LE(frames,44);h.write('data',48);h.writeUInt32LE(bytes,52);return h;
}
async function drain(page:Page,c:CaptureState){
  if(c.pending)return c.pending;
  c.pending=(async()=>{
    const packets=await page.evaluate(()=>(window as any).rtsAudioCapture.takeChunks(4));
    for(const packet of packets){
      const bytes=Buffer.from(packet.base64,'base64');
      if(bytes.length!==packet.frameCount*packet.channelCount*4)throw new Error('Browser PCM transfer length mismatch');
      if(c.channels!==null&&(c.channels!==packet.channelCount||c.sampleRate!==packet.sampleRate))throw new Error('Spool format changed');
      c.channels=packet.channelCount;c.sampleRate=packet.sampleRate;
      await writeAll(c.file,bytes);c.bytes+=bytes.length;c.frames+=packet.frameCount;
      for(let i=0;i<bytes.length;i+=4){const v=bytes.readFloatLE(i);c.samples++;if(!Number.isFinite(v)){c.invalid++;continue;}c.peak=Math.max(c.peak,Math.abs(v));if(Math.abs(v)>=1)c.clipped++;c.energy+=v*v;}
    }
  })().catch(error=>{c.errors.push(`PCM spool drain failed: ${error}`);}).finally(()=>{c.pending=null;});
  return c.pending;
}
export async function installAudioCapture(page:Page,options:{sourceRoot?:string;spoolFolder?:string}={}){
  if(captures.has(page))throw new Error('Capture already installed on this page');
  const source=await readFile(new URL('./rts-audio-capture-browser.js',import.meta.url),'utf8');
  const workletSource=await readFile(new URL('./rts-audio-capture-worklet.js',import.meta.url),'utf8');
  await page.evaluate(source=>{(window as any).__rtsPcmWorkletSource=source;},workletSource);
  await page.addScriptTag({content:`window.rtsAudioCaptureReady=(async()=>{${source}\n})();`});
  await page.evaluate(()=>(window as any).rtsAudioCaptureReady);
  if(!await page.evaluate(()=>!!(window as any).rtsAudioCapture))throw new Error('Live audio capture module failed to install');
  const sourceRoot=path.resolve(options.sourceRoot??process.env.RTS_AUDIO_SOURCE_ROOT??'.');
  const served=await page.evaluate(()=>(window as any).rtsAudioCapture.servedModules);
  for(const row of served){
    const local=createHash('sha256').update(await readFile(path.join(sourceRoot,row.localPath))).digest('hex');
    if(local!==row.originalSourceSha256)throw new Error(`Served audio source differs from workspace: ${row.localPath}`);
  }
  const folder=path.resolve(options.spoolFolder??process.env.RTS_AUDIO_SPOOL??process.env.RTS_AUDIO_OUT??'tmp/rts/pcm-spool');
  await mkdir(folder,{recursive:true});const temporary=await mkdtemp(path.join(folder,'capture-'));const spool=path.join(temporary,'battle-audio.wav.part');
  const file=await open(spool,'w+');await writeAll(file,Buffer.alloc(56));
  const c:CaptureState={file,spool,sourceRoot,timer:null,pending:null,errors:[],bytes:0,frames:0,channels:null,sampleRate:null,peak:0,clipped:0,invalid:0,energy:0,samples:0,finalized:false};
  captures.set(page,c);c.timer=setInterval(()=>{void drain(page,c);},100);
}
export async function saveAudioCapture(page:Page,folder:string,match:Record<string,unknown>){
  const c=captures.get(page);if(!c||c.finalized)throw new Error('No open PCM capture for this page');
  c.finalized=true;if(c.timer)clearInterval(c.timer);if(c.pending)await c.pending;
  await mkdir(folder,{recursive:true});
  let report:any;
  try{report=await page.evaluate(()=>(window as any).rtsAudioCapture.finish());}
  catch(error){report={status:'invalid',errors:[`Browser finalization failed: ${error}`],events:[],servedModules:[]};}
  // The stopAck is ordered after the final transferred PCM packet. Drain all queued packets only after that acknowledgement.
  while(await page.evaluate(()=>(window as any).rtsAudioCapture?.takeChunks?((window as any).rtsAudioCapture.isFinished()&&true):false).catch(()=>false)){
    const before=c.frames;await drain(page,c);if(c.frames===before)break;
  }
  const sources=[];
  for(const localPath of sourceFiles){
    try{
      const sha256=createHash('sha256').update(await readFile(path.join(c.sourceRoot,localPath))).digest('hex');sources.push({path:localPath,sha256});
      if(report.servedModules?.find((m:any)=>m.localPath===localPath)?.originalSourceSha256!==sha256)c.errors.push(`Audio source changed during recording: ${localPath}`);
    }catch(error){c.errors.push(`Source recheck failed: ${error}`);}
  }
  if(c.frames!==report.frames||c.frames!==report.lastFrameExclusive-report.firstFrame)c.errors.push('Written WAV frames do not equal acknowledged PCM frame interval');
  if(!report.stopAck)c.errors.push('No worklet stop acknowledgement');
  if(!c.frames||c.peak<=1e-5)c.errors.push('Empty or silent recording');
  if(c.invalid||c.clipped)c.errors.push('Nonfinite or clipped PCM samples');
  const rate=c.sampleRate??report.sampleRate??48000,channels=c.channels??1;
  const header=wavHeader(c.bytes,c.frames,channels,rate);await c.file.write(header,0,header.length,0);await c.file.sync();await c.file.close();
  const output=path.join(folder,'battle-audio.wav');await copyFile(c.spool,output);
  const hash=createHash('sha256');for await(const chunk of createReadStream(output))hash.update(chunk);
  const scheduled=(report.events??[]).filter((event:any)=>event.scheduled);
  if(!scheduled.length)c.errors.push('No naturally scheduled runtime cue was captured');
  const result={bytes:c.bytes+56,wallSeconds:report.wallSeconds??0,audioSeconds:c.frames/rate,scheduledCues:[...new Set(scheduled.map((event:any)=>event.kind))],
    maximumVoices:Math.max(0,...scheduled.map((event:any)=>event.voices)),maximumSources:Math.max(0,...scheduled.map((event:any)=>event.sources)),errors:[...(report.errors??[]),...c.errors]};
  if(result.maximumVoices>12||result.maximumSources>64)result.errors.push('Runtime voice/source bounds exceeded');
  const capture={...report,restored:await page.evaluate(()=>(window as any).rtsAudioCapture.isFinished()).catch(()=>false),
    status:result.errors.length?'invalid':'passed_lossless_capture',match,sources,audioFile:'battle-audio.wav',audioSha256:hash.digest('hex'),
    writtenFrames:c.frames,pcmBytes:c.bytes,wavHeaderBytes:56,streamingNodeMetrics:{peak:c.peak,invalidSamples:c.invalid,clippedSamples:c.clipped,rms:Math.sqrt(c.energy/Math.max(1,c.samples))},
    audioSeconds:c.frames/rate,errors:result.errors,workletSourceSha256:createHash('sha256').update(await readFile(new URL('./rts-audio-capture-worklet.js',import.meta.url))).digest('hex')};
  await writeFile(path.join(folder,'capture.json'),JSON.stringify(capture,null,2)+'\n');
  await unlink(c.spool); // The final WAV and invalid report have already been preserved.
  console.log(JSON.stringify({audioCapture:folder,...result}));
  if(result.errors.length)throw new Error(`Invalid lossless live audio capture: ${JSON.stringify(result)}`);
  return result;
}
