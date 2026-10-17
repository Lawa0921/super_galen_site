/** Bounded test-only CDP trace download; never imported by the game. */
export async function readTraceStream(cdp:{send:(method:string,args:any)=>Promise<any>},handle:string,write:(chunk:Buffer)=>Promise<void>,limit=128*1024*1024):Promise<number>{
  let bytes=0;
  try{
    for(let parts=0;parts<8192;parts++){
      const row=await cdp.send('IO.read',{handle,size:256*1024});
      const chunk=Buffer.from(row.data,row.base64Encoded?'base64':'utf8');bytes+=chunk.length;
      if(bytes>limit)throw new Error('Chrome trace byte limit exceeded');
      if(chunk.length)await write(chunk);if(row.eof)return bytes;
    }
    throw new Error('Chrome trace chunk limit exceeded');
  }finally{await cdp.send('IO.close',{handle});}
}
