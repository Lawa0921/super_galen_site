/** Map the source frame interval to the exported clip's actual duration. */
export function clipTimeForFrame(frame,start,end,duration){
  if(![frame,start,end,duration].every(Number.isFinite)||end<=start||duration<=0||frame<start||frame>end)
    throw new Error('Valid source frame interval and positive clip duration required');
  return (frame-start)/(end-start)*duration;
}
