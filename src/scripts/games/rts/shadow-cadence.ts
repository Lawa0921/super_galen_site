export class ShadowCadence {
  private first=true;
  private elapsed=0;
  /** Only distant shadow maps run at 30Hz; geometry and animation keep the
   * display cadence. Actual shadow age also includes render-frame timing. */
  update(dt:number,dirty=false,closeUp=false):boolean {
    const delta=Number.isFinite(dt)&&dt>0?dt:0,period=1/30;
    if(this.first||dirty||closeUp&&delta>0){this.first=false;this.elapsed=0;return true;}
    this.elapsed+=delta;
    if(this.elapsed+1e-10<period)return false;
    this.elapsed%=period;if(period-this.elapsed<1e-10)this.elapsed=0;
    return true;
  }
}
