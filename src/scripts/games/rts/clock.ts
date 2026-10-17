export class SimulationClock {
  private last:number|null=null;
  private accumulator=0;
  private paused=false;
  private disposed=false;
  constructor(private readonly tick:()=>void){}
  get interpolation():number{return Math.max(0,Math.min(1,this.accumulator/.05));}
  frame(now:number):void{
    if(this.disposed||!Number.isFinite(now))return;
    if(this.last===null){this.last=now;return;}
    const delta=Math.max(0,Math.min(.25,(now-this.last)/1000));this.last=now;
    if(this.paused)return;this.accumulator+=delta;
    while(this.accumulator+1e-9>=.05){this.accumulator-=.05;this.tick();}
  }
  setPaused(paused:boolean):void{this.paused=paused;this.last=null;this.accumulator=0;}
  dispose():void{this.disposed=true;this.last=null;this.accumulator=0;}
}
