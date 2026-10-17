// Deliberate browser load scenario; no serialized Node helpers.
export {};
import {OrthographicCamera,Vector3} from 'three';
    const devtools=new EventTarget();(window as any).__THREE_DEVTOOLS__=devtools;
    let renderer:any,scene:any;const draws={world:0,portrait:0};devtools.addEventListener('observe',((event:CustomEvent)=>{if(event.detail?.isWebGLRenderer){renderer=event.detail;const render=renderer.render.bind(renderer);renderer.render=(s:any,c:any)=>{if(!s.userData.rtsPortrait)scene=s;const result=render(s,c);draws[s.userData.rtsPortrait?'portrait':'world']=renderer.info.render.calls;return result;};}}) as EventListener);
    const mainPath='/src/scripts/games/rts/main.ts',statePath='/src/scripts/games/rts/state.ts',simulationPath='/src/scripts/games/rts/simulation.ts',visibilityPath='/src/scripts/games/rts/visibility.ts',commandPath='/src/scripts/games/rts/commands.ts';
    const {mountRts}=await import(mainPath),{addUnit,addBuilding}=await import(statePath),{createGame}=await import(simulationPath),{updateVisibility,getTeamView}=await import(visibilityPath),{issueCommand}=await import(commandPath);
    // 60 m: the widest gameplay zoom on the 288 m maps (the 192 m-era fixture used 76 m and a wider layout).
    const camera=new OrthographicCamera(-60*innerWidth/innerHeight/2,60*innerWidth/innerHeight/2,30,-30,.1,250);
    camera.position.set(68,52,83);camera.lookAt(44,0,48);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,(map:'river'|'pass',seed:number)=>{
      const state=createGame(map,20261004);state.aiEnabled=[false,false];state.entities=[];state.map.spawns[0]={x:44,z:48};
      const buildings=['townhall','house','barracks','lumbermill','forge','altar','tower','chapel','stable','workshop'];
      const columns=[17,22.5,28,33.5,39,55,60.5,66,71.5,77];
      for(let i=0;i<20;i++){const b=addBuilding(state,i===19?1:0,buildings[i%10],{x:columns[i%10],z:i<10?27:69},true);b.hp=b.maxHp=1000000;}
      const kinds=['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider'];
      for(let i=0;i<80;i++){const team=i<40?0:1,row=Math.floor(i%40/8),column=i%8;
        const unit=addUnit(state,team,kinds[i%8],{x:team===0?24+column*1.1:35+column*1.1,z:37+row*2.2});unit.hp=unit.maxHp=1000000;
      }
      updateVisibility(state);
      for(const team of [0,1])issueCommand(state,team,{type:'move',unitIds:state.entities.filter((e:any)=>e.category==='unit'&&e.team===team).map((e:any)=>e.id),position:{x:33,z:43},attackMove:true});
      (window as any).__rtsPerf={state,getTeamView,renderer:()=>renderer,scene:()=>scene,draws:()=>({...draws}),samples:[],recording:false,previous:0,screen:(e:any,y=0)=>{const p=new Vector3(e.x,y,e.z).project(camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};}};
      const sample=(now:number)=>{const audit=(window as any).__rtsPerf;if(audit.recording&&audit.previous)audit.samples.push(now-audit.previous);audit.previous=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);
      return state;
    });

(window as any).__rtsPerfFixtureReady=true;
