import {Quaternion} from 'three';
/** Select keys against actual glTF LINEAR (quaternion slerp) interpolation. */
export function adaptiveTrsKeys(times, values, limits={position:1e-6,rotation:1e-6,scale:1e-6}) {
  if(times.length<2||values.length!==times.length*10||times.some((t,i)=>!Number.isFinite(t)||(i&&t<=times[i-1])))throw Error('Strictly increasing finite times required');
  if(values.some(v=>!Number.isFinite(v)))throw Error('Finite TRS values required');
  if(Object.values(limits).some(v=>!Number.isFinite(v)||v<=0))throw Error('Positive tolerances required');
  const kept=new Set([0,times.length-1]),stack=[[0,times.length-1]],q0=[],q1=[],q=[];
  while(stack.length){
    const [start,end]=stack.pop();if(end-start<=1)continue;
    for(let c=0;c<4;c++){q0[c]=values[start*10+3+c];q1[c]=values[end*10+3+c];}
    let worst=1,split;
    for(let i=start+1;i<end;i++){
      const alpha=(times[i]-times[start])/(times[end]-times[start]);
      let position=0,scale=0;
      for(let c=0;c<3;c++){
        const p=values[i*10+c]-((1-alpha)*values[start*10+c]+alpha*values[end*10+c]);position+=p*p;
        const s=values[i*10+7+c]-((1-alpha)*values[start*10+7+c]+alpha*values[end*10+7+c]);scale+=s*s;
      }
      Quaternion.slerpFlat(q,0,q0,0,q1,0,alpha);
      let minus=0,plus=0;for(let c=0;c<4;c++){minus+=(q[c]-values[i*10+3+c])**2;plus+=(q[c]+values[i*10+3+c])**2;}
      const error=Math.max(Math.sqrt(position)/limits.position,Math.sqrt(scale)/limits.scale,Math.sqrt(Math.min(minus,plus))/limits.rotation);
      if(error>worst){worst=error;split=i;}
    }
    if(split!==undefined){kept.add(split);stack.push([start,split],[split,end]);}
  }
  return [...kept].sort((a,b)=>a-b);
}
