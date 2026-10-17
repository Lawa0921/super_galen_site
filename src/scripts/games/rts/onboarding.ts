import type {Command} from './types';
import {browserStorage} from './settings';
type Store=Pick<Storage,'getItem'|'setItem'>;
export const TUTORIAL_KEY='rts.tutorial.v1';
export const TUTORIAL_STEPS=[
  {id:'select',title:'選取工人',text:'左鍵點選一名工人，或按住左鍵拖曳框選多名工人。'},
  {id:'gather',title:'採集資源',text:'選取工人後，右鍵點擊金礦或林地開始採集。'},
  {id:'build',title:'建立據點',text:'按 B 開啟建造選單，選擇民居或兵營，再以左鍵放置。'},
  {id:'train',title:'訓練部隊',text:'兵營完工後選取它，點擊王國衛兵（或按 Q）開始訓練。'},
  {id:'attack',title:'發起進攻',text:'選取部隊，按 A 再左鍵指定目的地，或直接右鍵點擊敵人。'},
] as const;
export type TutorialEvent={type:'select';kinds:string[]}|{type:'command';command:Command};
const met:Record<(typeof TUTORIAL_STEPS)[number]['id'],(e:TutorialEvent)=>boolean>={
  select:e=>e.type==='select'&&e.kinds.includes('worker'),
  gather:e=>e.type==='command'&&e.command.type==='gather',
  build:e=>e.type==='command'&&e.command.type==='build',
  train:e=>e.type==='command'&&e.command.type==='train'&&e.command.unit!=='worker',
  attack:e=>e.type==='command'&&(e.command.type==='attack'||e.command.type==='move'&&!!e.command.attackMove),
};
/** First-match tips that advance only when the player actually performs each step; finishing or skipping is remembered. */
export class Onboarding {
  private step:number;
  private panel:HTMLElement|null=null;
  constructor(private store:Store|null=browserStorage()){let seen=false;try{seen=store?.getItem(TUTORIAL_KEY)==='done';}catch{/* Show it again. */}this.step=seen?TUTORIAL_STEPS.length:0;}
  get current(){return TUTORIAL_STEPS[this.step]??null;}
  get finished(){return this.step>=TUTORIAL_STEPS.length;}
  attach(panel:HTMLElement|null){this.panel=panel;panel?.querySelector('[data-tutorial-skip]')?.addEventListener('click',()=>this.dismiss());this.render();}
  /** Returns true when the event completed the current tip. */
  observe(event:TutorialEvent):boolean{const step=this.current;if(!step||!met[step.id](event))return false;this.step++;if(this.finished)this.save();this.render();return true;}
  dismiss(){this.step=TUTORIAL_STEPS.length;this.save();this.render();}
  private save(){try{this.store?.setItem(TUTORIAL_KEY,'done');}catch{/* Not remembered this session. */}}
  private render(){const panel=this.panel,step=this.current;if(!panel)return;panel.hidden=!step;if(!step)return;
    const set=(name:string,text:string)=>{const node=panel.querySelector(`[data-tutorial-${name}]`);if(node)node.textContent=text;};
    set('step',`${this.step+1} / ${TUTORIAL_STEPS.length}`);set('title',step.title);set('text',step.text);}
}
