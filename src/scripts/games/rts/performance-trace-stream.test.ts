import {describe,expect,it,vi} from 'vitest';
import {readTraceStream} from '../../../../tests/manual/rts-performance-trace-stream';

describe('test-only Chrome trace stream',()=>{
  it('preserves binary and text chunks and closes the stream at EOF',async()=>{
    const chunks:Buffer[]=[],rows=[{data:'AAH/',base64Encoded:true,eof:false},{data:'end',base64Encoded:false,eof:true}];
    const send=vi.fn(async(method:string)=>method==='IO.read'?rows.shift():{});
    expect(await readTraceStream({send},'trace',async chunk=>{chunks.push(chunk);})).toBe(6);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0,1,255,101,110,100]));expect(send).toHaveBeenLastCalledWith('IO.close',{handle:'trace'});
  });
  it('rejects oversized evidence before writing that chunk and still closes the stream',async()=>{
    const write=vi.fn(),send=vi.fn(async(method:string)=>method==='IO.read'?{data:'too large',eof:true}:{});
    await expect(readTraceStream({send},'trace',write,3)).rejects.toThrow('limit');expect(write).not.toHaveBeenCalled();expect(send).toHaveBeenLastCalledWith('IO.close',{handle:'trace'});
  });
  it('retains a stream-read failure while closing its handle',async()=>{
    const send=vi.fn(async(method:string)=>{if(method==='IO.read')throw new Error('read failed');return {};});
    await expect(readTraceStream({send},'trace',async()=>{})).rejects.toThrow('read failed');expect(send).toHaveBeenLastCalledWith('IO.close',{handle:'trace'});
  });
});
