import type { MaterialDef, MaterialKind } from '../engine/types';

/**
 * The monster roster's materials (roster plan Task A3, spec §7.1, ruling 12): each ordinary species' signature (`monster`),
 * each boss's and warden's trophy (`trophy`), and the nine companions' keepsakes (`keepsake`, the wardens of their stories).
 * `owner` is the foe that drops it. Merged into MATERIALS; its icon is listed once the owner's art is published (ROSTER_ART).
 *
 * Prices: a signature by its species' band (B 20, C 30, D 40, E 50, F 60; a regional native turns up from depth 4, the B
 * band); a trophy or keepsake 120 from a warden, 200 from a boss.
 */
const BAND = { B: 20, C: 30, D: 40, E: 50, F: 60 } as const;
const WARDEN = 120, BOSS = 200;

type Row = [id: string, name: string, owner: string, price: number];
const of = (kind: MaterialKind) => ([id, name, owner, price]: Row): MaterialDef => ({ id, name, price, kind, owner });

const SIGNATURES: Row[] = [
  // the main road (spec §5.3)
  ['faded-letter', '褪色信紙', 'paper-moth', BAND.B],
  ['wight-wick', '幽影燈芯', 'lamp-wight', BAND.B],
  ['mist-root', '霧根', 'root-hound', BAND.B],
  ['tin-key', '發條鑰匙', 'tin-soldier', BAND.B],
  ['mimic-hinge', '木箱鉸鍊', 'dust-mimic', BAND.B],
  ['market-token', '市集籌碼', 'market-ghost', BAND.B],
  ['bell-shard', '啞鐘碎片', 'tongueless-bell', BAND.C],
  ['hollow-buckle', '空殼的皮扣', 'hollow-hunter', BAND.C],
  ['twin-thread', '雙生線', 'mist-twin', BAND.C],
  ['mirror-feather', '鏡羽', 'moon-crow', BAND.C],
  ['grey-cord', '灰繩結', 'bell-watcher', BAND.C],
  ['dream-sand', '夢砂', 'sleepwalker', BAND.C],
  ['marble-shard', '白石碎片', 'old-city-sentinel', BAND.D],
  ['hymn-sheet', '無字歌譜', 'requiem-choir', BAND.D],
  ['larva-glow', '幼體光囊', 'lantern-larva', BAND.D],
  ['epitaph-stone', '碑文石', 'epitaph-golem', BAND.D],
  ['old-cog', '古機齒輪', 'ancestor-automaton', BAND.D],
  ['ash-ink', '灰墨', 'ash-archivist', BAND.D],
  ['spent-wick', '燃盡的燭芯', 'wick-shade', BAND.E],
  ['lantern-ash', '提燈的灰', 'keeper-echo', BAND.E],
  ['ember-tooth', '餘燼之牙', 'ember-maw', BAND.E],
  ['sorrow-shard', '悲傷結晶片', 'sorrow-crystal', BAND.E],
  ['pale-tendril', '蒼白觸鬚', 'deep-tendril', BAND.E],
  ['music-comb', '音梳', 'music-box', BAND.F],
  ['crane-paper', '紙鶴紙', 'paper-cranes', BAND.F],
  ['shadow-thread', '影線', 'lost-shadow', BAND.F],
  ['homeward-glow', '歸途微光', 'returning-light', BAND.F],
  ['glitter-scrap', '閃光碎屑', 'hoarder', BAND.B],
  ['gilded-scrap', '金箔碎屑', 'gilded-hoarder', BAND.E],
  // the regions (spec §5.4)
  ['cinder-dust', '灰燼塵', 'cinder-imp', BAND.B],
  ['forge-slag', '爐渣', 'forge-hound', BAND.B],
  ['mourning-veil', '弔者面紗', 'ash-mourner', BAND.B],
  ['mirage-sequin', '蜃樓亮片', 'mirage-dancer', BAND.B],
  ['scorpion-stinger', '蠍尾針', 'sand-scorpion', BAND.B],
  ['porcelain-chip', '瓷片', 'frost-doll', BAND.B],
  ['glacier-scute', '冰河甲片', 'glacier-tortoise', BAND.B],
  ['snow-voice', '回音雪石', 'snow-caller', BAND.B],
  ['komainu-fang', '狛犬牙', 'ice-komainu', BAND.B],
  ['prayer-rope', '結冰的注連繩', 'frozen-pilgrim', BAND.B],
  ['kite-plume', '雷鳶羽', 'thunder-kite', BAND.B],
  ['copper-band', '銅箍', 'storm-totem', BAND.B],
  ['jelly-cell', '水母電囊', 'charge-jelly', BAND.B],
  ['blue-ember', '藍白餘火', 'star-ember', BAND.B],
  ['torn-page', '撕下的書頁', 'stolen-tome', BAND.B],
  ['bog-peat', '沼泥炭', 'bog-mother', BAND.B],
  ['rot-petal', '腐花瓣', 'rot-lily', BAND.B],
  ['leech-plate', '蛭甲片', 'leech-knight', BAND.B],
  ['carved-bark', '刻痕樹皮', 'ashen-treant', BAND.B],
  ['spore-sac', '孢子囊', 'spore-moth', BAND.B],
  ['mirror-sliver', '鏡片', 'mirror-thief', BAND.B],
  ['black-veil', '黑紗', 'veil-stalker', BAND.B],
  ['hush-bell', '無聲小鈴', 'hush-acolyte', BAND.B],
  ['vault-lock', '寶庫的鎖', 'vault-mimic', BAND.B],
  ['iou-slip', '泛黃的紙條', 'debt-collector', BAND.B],
  ['rivet', '鉚釘', 'rivet-golem', BAND.B],
  ['crab-plate', '蟹甲', 'siege-crab', BAND.B],
  ['herald-horn', '號令喇叭', 'herald-engine', BAND.B],
  ['knight-crest', '騎士團紋章', 'fallen-knight', BAND.B],
  ['red-pennant', '紅旗布', 'banner-bearer', BAND.B],
];

/** The nine keepsakes: the warden of each companion's story drops it (ruling 12); giftable, unlike a trophy (ruling 13). */
const KEEPSAKES: Row[] = [
  ['moon-silver', '月影銀', 'false-moon', WARDEN],
  ['tower-dust', '鐘樓的灰', 'bell-warden', WARDEN],
  ['automaton-core', '機兵核心', 'toppled-automaton', WARDEN],
  ['copper-anklet', '銅腳環', 'mirage-lead', WARDEN],
  ['shrine-rope', '拜殿的繩', 'ice-shrine', WARDEN],
  ['ash-page', '燒剩的書角', 'burning-page', WARDEN],
  ['ashen-acorn', '灰橡實', 'grey-elder', WARDEN],
  ['vault-coin', '寶庫金幣', 'locked-vault', WARDEN],
  ['gate-splinter', '城門的木片', 'gate-breaker', WARDEN],
];

const TROPHIES: Row[] = [
  ['dusk-baton', '暮色指揮棒', 'requiem-conductor', WARDEN],
  ['brood-shell', '巢殼', 'lantern-brood', WARDEN],
  ['fog-gate-plate', '霧門鎧片', 'fog-warden', BOSS],
  ['silent-bronze', '啞鐘青銅', 'silent-bell', BOSS],
  ['hundred-hilts', '百劍之柄', 'hollow-champion', BOSS],
  ['archon-gold', '執政金冠片', 'old-city-archon', BOSS],
  ['gorged-lantern', '被吞的提燈', 'gorged-beast', BOSS],
  ['mother-light', '母燈殘光', 'lantern-mother', BOSS],
  ['festival-paper', '祭典燈籠紙', 'forgotten-festival', BOSS],
  ['starless-ambergris', '無星龍涎', 'starless-whale', BOSS],
  ['clock-spring', '鐘心發條', 'stopped-clock', BOSS],
  ['first-flame', '最初的火種', 'first-lantern', BOSS],
  ['tyrant-cinder', '暴君餘燼', 'ember-tyrant', BOSS],
  ['storm-glass', '沙暴琉璃', 'sandstorm-maw', BOSS],
  ['mirage-brick', '蜃樓磚', 'mirage-city', BOSS],
  ['rime-crown-shard', '永凍冠片', 'rime-sovereign', BOSS],
  ['silence-snow', '寂靜之雪', 'white-silence', BOSS],
  ['rift-ice', '裂口之冰', 'rift-maw', BOSS],
  ['roc-plume', '巨鵬羽', 'thunder-roc', BOSS],
  ['conductor-rod', '導雷桿', 'storm-conductor', BOSS],
  ['starfire-core', '星火核', 'starfire-colossus', BOSS],
  ['hydra-scale', '多頭蛇鱗', 'mire-hydra', BOSS],
  ['blight-ash', '灰枯之塵', 'grey-blight', BOSS],
  ['leviathan-tooth', '巨口之牙', 'bog-leviathan', BOSS],
  ['blank-mirror', '無面之鏡', 'faceless-host', BOSS],
  ['dragon-gold', '龍藏金', 'vault-dragon', BOSS],
  ['parade-lantern', '行列的燈', 'shadow-parade', BOSS],
  ['colossus-bolt', '巨像螺栓', 'fortress-colossus', BOSS],
  ['titan-hide', '巨獸皮', 'siege-titan', BOSS],
  ['commander-medal', '指揮官的勳章', 'last-commander', BOSS],
];

export const ROSTER_MATERIALS: MaterialDef[] = [
  ...SIGNATURES.map(of('monster')), ...KEEPSAKES.map(of('keepsake')), ...TROPHIES.map(of('trophy')),
];
