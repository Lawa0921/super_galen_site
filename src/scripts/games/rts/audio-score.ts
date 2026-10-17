/** Original sound design: small acoustic layers, authored envelopes and intervals.
 * No downloaded recordings or external instrument samples are used.
 */
export type AudioCue='order'|'gather'|'build'|'repair'|'attack'|'bolt'|'shell'|'impact'|'spell'|'heal'|'banner'|'complete'|'death'|'warning'|'victory'|'draw'|'defeat'
  |'sunburst'|'radiance'|'daybreak'|'volley'|'sprint'|'mark'|'blast';
/**
 * Preview-roster abilities (曦光賢者, 遊俠隊長 and the 曦光法師 autocast). The
 * shipped commander skills keep their original cues (attack / heal / banner).
 */
export const ABILITY_CUES:Partial<Record<'cleave'|'mend'|'banner'|'sunburst'|'radiance'|'daybreak'|'volley'|'sprint'|'mark'|'blast',AudioCue>>=
  {sunburst:'sunburst',radiance:'radiance',daybreak:'daybreak',volley:'volley',sprint:'sprint',mark:'mark',blast:'blast'};
export const ABILITY_CUE_SET:ReadonlySet<AudioCue>=new Set(Object.values(ABILITY_CUES));
/** At most this many ability voices sound at once, so a mass cast never stacks into a loud wall. */
export const ABILITY_VOICE_LIMIT=3;
export interface SoundLayer {
  wave:'sine'|'triangle'|'noise';frequency:number;endFrequency?:number;
  offset:number;duration:number;attack:number;gain:number;filter?:'lowpass'|'highpass'|'bandpass';q?:number;
}
export const RESULT_CUES:ReadonlySet<AudioCue>=new Set(['victory','draw','defeat']);
export const CUE_INTERVAL:Record<AudioCue,number>={order:.06,gather:.22,build:.18,repair:.22,attack:.075,bolt:.09,shell:.18,impact:.07,spell:.12,heal:.25,banner:.5,complete:.2,death:.2,warning:3,victory:2,draw:2,defeat:2,
  sunburst:.3,radiance:.5,daybreak:1,volley:.4,sprint:.6,mark:.4,blast:.25};
export function cuePriority(kind:AudioCue){return RESULT_CUES.has(kind)?4:kind==='warning'?3:kind==='order'||kind==='complete'?2:1;}

export function soundLayers(kind:AudioCue,variation=0):SoundLayer[]{
  const layers:SoundLayer[]=[];
  // A five-step, deterministic pitch variation keeps a group of workers from
  // striking exactly the same resonator, without changing interface melodies.
  const pitch=[1,.965,1.035,.985,1.02][variation%5];
  const tone=(frequency:number,duration:number,gain:number,offset=0,wave:'sine'|'triangle'='sine',endFrequency=frequency,attack=.004)=>layers.push({wave,frequency,endFrequency,offset,duration,attack,gain});
  const noise=(frequency:number,duration:number,gain:number,offset=0,filter:'lowpass'|'highpass'|'bandpass'='bandpass',q=.7)=>layers.push({wave:'noise',frequency,offset,duration,attack:.002,gain,filter,q});
  const bell=(frequency:number,offset=0,gain=.04)=>{tone(frequency,.48,gain,offset);tone(frequency*2.71,.17,gain*.25,offset);};
  const horn=(frequency:number,offset:number,duration:number,gain=.048)=>{tone(frequency,duration,gain,offset,'triangle',frequency,.055);tone(frequency*2,duration*.87,gain*.25,offset,'sine',frequency*2,.04);};
  switch(kind){
    case 'order':tone(520,.085,.033);tone(780,.11,.02,.026);break;
    case 'gather':noise(1700,.065,.047);tone(175*pitch,.12,.05,0,'sine',120*pitch);tone(410*pitch,.065,.025,.009);break;
    case 'build':case 'repair':
      noise(1100,.055,.065);tone(105*pitch,.17,.071,0,'sine',64*pitch);tone(320*pitch,.095,.021,.012);if(kind==='build')noise(380,.13,.02,.045);break;
    case 'attack':noise(3300,.095,.043,0,'highpass');tone(870*pitch,.11,.035,.01);tone(1560*pitch,.085,.018,.012);break;
    case 'bolt':tone(245*pitch,.075,.046,0,'triangle',110*pitch);tone(760*pitch,.038,.017);noise(4400,.16,.035,.016,'highpass');break;
    case 'shell':noise(460,.21,.085,0,'lowpass');tone(84*pitch,.33,.082,0,'sine',36);tone(165*pitch,.12,.03,.015);break;
    case 'impact':noise(1250,.105,.075);tone(145*pitch,.12,.05,0,'sine',70);tone(1940*pitch,.072,.018,.005);break;
    case 'spell':noise(2400,.2,.043);tone(610*pitch,.18,.025,0,'triangle',305*pitch,.02);break;
    case 'heal':bell(659,0,.026);bell(988,.11,.024);noise(2800,.3,.01,.035);break;
    case 'banner':horn(262,0,.36,.036);horn(392,.18,.6,.04);noise(700,.3,.018,0,'lowpass');break;
    case 'complete':bell(523,0,.035);bell(784,.12,.035);bell(1047,.24,.026);break;
    case 'death':noise(520,.32,.07,.01,'lowpass');tone(105,.26,.055,0,'sine',42);break;
    case 'warning':horn(220,0,.27,.038);horn(196,.34,.36,.042);break;
    case 'victory':
      horn(262,0,.27);horn(330,.28,.27);horn(392,.56,.3);
      horn(523,.9,.85,.04);horn(392,.9,.85,.028);horn(330,.9,.85,.026);bell(1047,.91,.025);break;
    case 'draw':horn(294,0,.45,.04);horn(330,.47,.45,.04);horn(294,.94,.65,.04);horn(440,.94,.65,.021);break;
    // 曦光爆裂: a rising shimmer, then a bright flash with a soft thump on landing.
    case 'sunburst':tone(520,.14,.028,0,'triangle',1040,.03);noise(3600,.18,.034,.12,'highpass');tone(130,.22,.045,.12,'sine',58);bell(1319,.13,.022);break;
    // 晨輝療癒: a slow-blooming major chord with an airy wash, warmer than the priest's two bells.
    case 'radiance':tone(523,.62,.022,0,'sine',523,.12);tone(659,.58,.02,.06,'sine',659,.12);tone(784,.54,.019,.12,'sine',784,.12);bell(1568,.2,.012);noise(5200,.45,.008,.05,'highpass');break;
    // 破曉: a long charging sweep that breaks into a deep boom and a high ring.
    case 'daybreak':tone(220,.45,.03,0,'triangle',880,.2);noise(1800,.4,.012,.05);noise(480,.42,.05,.45,'lowpass');tone(72,.55,.05,.45,'sine',30);bell(784,.47,.026);bell(1568,.5,.016);break;
    // 箭雨: a ripple of bowstrings, the hiss of arrows overhead, then scattered strikes.
    case 'volley':for(const [i,at] of [0,.045,.09].entries())tone((300-i*22)*pitch,.07,.03,at,'triangle',140*pitch);
      noise(5200,.26,.022,.1,'bandpass',3);noise(1000,.06,.04,.38);noise(900,.06,.034,.44);noise(1100,.06,.03,.5);break;
    // 疾行號令: two quick rising horn calls over a rush of wind.
    case 'sprint':horn(392,0,.12,.034);horn(587,.12,.2,.036);noise(1400,.32,.02,.04,'bandpass',1.4);break;
    // 獵殺標記: a cold, slightly dissonant ping with a low warning tone.
    case 'mark':tone(1760,.28,.026);tone(1865,.22,.01,.004);noise(6400,.03,.028,0,'highpass');tone(233,.3,.026,.02,'sine',196,.03);break;
    // 曦光術 (mage autocast): a short, falling flare; lighter than 曦光爆裂.
    case 'blast':tone(740*pitch,.12,.026,0,'triangle',370*pitch,.01);noise(2900,.14,.03,.02);tone(180*pitch,.16,.036,.07,'sine',90*pitch);break;
    case 'defeat':horn(294,0,.42,.04);horn(262,.43,.42,.04);horn(196,.86,.95,.043);horn(147,.86,.95,.025);break;
  }
  return layers;
}
