/** Same cell-centre disk as the scalar visibility rule, filled in row spans.
 * Endpoint checks retain the original inclusive boundary under FP rounding.
 */
export function revealSightDisk(visible:Uint8Array,explored:Uint8Array,width:number,height:number,x:number,z:number,radius:number):void {
 const squared=radius*radius;
 for(let row=Math.max(0,Math.floor(z-radius));row<=Math.min(height-1,Math.ceil(z+radius));row++){
  const dz=(row+.5-z)**2,remaining=squared-dz;if(remaining<0)continue;
  const reach=Math.sqrt(remaining);
  let left=Math.max(0,Math.ceil(x-reach-.5)),right=Math.min(width-1,Math.floor(x+reach-.5));
  const inside=(col:number)=>(col+.5-x)**2+dz<=squared;
  if(left>0&&inside(left-1))left--;if(right<width-1&&inside(right+1))right++;
  if(left<=right&&!inside(left))left++;if(left<=right&&!inside(right))right--;
  if(left<=right){const start=row*width+left,end=row*width+right+1;visible.fill(1,start,end);explored.fill(1,start,end);}
 }
}
