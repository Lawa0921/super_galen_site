import type { AnyStat, GearSlot, WeaponKind } from '../engine/types';
import type { SpecialDef } from './gear';

/**
 * The monster roster's own uniques (roster plan Task A3, spec §5.5–§5.6, ruling 14): one for each boss and warden, its
 * `owner`. Merged into SPECIALS for lookups, but never in a drop pool (`regionSpecials`, `generalLegendaries`,
 * `pickSpecial` leave any `owner` out) and never silhouetted (`region: null`). It comes by replacing a legendary-tier drop
 * in its owner's fight, or by crafting once its owner has fallen (plan C). The `lore` lines are neutral until the bestiary
 * writing rewrites them (the W steps; L1a wrote the first wave's five: the false moon's, the bell warden's and the shallow
 * road's three bosses'; L2a the deep road's ten: its three wardens', its six bosses' and the lantern-mother's; L3a the
 * fire, frost and storm lands' twelve: their three wardens' and their nine bosses'; L4a the mire, shade and iron lands'
 * twelve, the same).
 */
type Row = [id: string, name: string, owner: string, source: 'boss' | 'elite', slot: GearSlot, fixed: AnyStat[], lore: string, weaponKind?: WeaponKind];

const ROWS: Row[] = [
  // the wardens (spec §5.5)
  ['moonless-mirror', '無月之鏡', 'false-moon', 'elite', 'offhand', ['res', 'heal', 'int'], '鏡子裡掛著一輪天上沒有的月亮。它從不預告明天，只陪照鏡子的人把頭髮梳好。'],
  ['unrung-clapper', '不響的鐘舌', 'bell-warden', 'elite', 'neck', ['sleepRes', 'tpCost', 'wil'], '守門人只用鐘槌敲，這根鐘舌一次也沒響過。掛在頸上沉甸甸的，夜裡倒是睡得特別安穩。'],
  ['ancestor-gauntlet', '祖傳的手甲', 'toppled-automaton', 'elite', 'hands', ['armor', 'atk', 'int'], '機兵的手甲，關節裡的齒輪會跟著握拳轉一圈。戴上它，扛起重物時心裡也踏實一點。'],
  ['requiem-staff', '鎮魂之杖', 'requiem-conductor', 'elite', 'weapon', ['mag', 'heal', 'wil'], '指揮棒長成了一根杖。揮下去的時候，傷口會先安靜下來，再慢慢合起。', 'staff'],
  ['brood-lantern', '巢燈', 'lantern-brood', 'elite', 'neck', ['hp', 'res', 'gauge'], '巢殼磨成的小燈，裡面的東西早就孵走了，只留下一點餘溫。掛在胸前，心跳會跟著它慢下來。'],
  ['last-dance-veil', '最後一支舞的紗', 'mirage-lead', 'elite', 'body', ['agi', 'gauge', 'res'], '領舞者肩上的紗，輕得像一口熱風。披著它出手，腳下會自己找到拍子，絕技也攢得比較快。'],
  ['ninety-nine-steps', '九十九級石階', 'ice-shrine', 'elite', 'feet', ['def', 'wil', 'iceRes'], '鞋底刻著九十九級石階的紋路。穿上它走路，每一步都踩得很穩，冰面也滑不倒人。'],
  ['starbound-tome', '星封之書', 'burning-page', 'elite', 'offhand', ['mag', 'int', 'tp'], '被星光封住的書，翻不開，念咒前卻會微微發熱。它好像在提醒拿書的人，別念不該念的那一頁。'],
  ['arrowmark-bow', '刻痕長弓', 'grey-elder', 'elite', 'weapon', ['agi', 'crit', 'critDmg'], '灰化老樹最硬的一根枝幹彎成的弓，弓身的刻痕是年輪裂開留下的。拉滿了放手，箭總會找到要害。', 'bow'],
  ['hungry-purse', '空腹的錢袋', 'locked-vault', 'elite', 'ring', ['goldFind', 'matFind', 'agi'], '從金庫的鎖孔裡勾出來的小錢袋，縮得只剩一圈。它老是嫌自己不夠飽，走到哪裡都想多撿一點金幣和素材。'],
  ['gatewarden-shield', '守門者之盾', 'gate-breaker', 'elite', 'offhand', ['block', 'def', 'hp'], '巨影撞了無數次都沒撞穿的盾，盾心凹進去一大塊。舉著它站在前面，身後的人連一點碎石都淋不到。'],
  // the main road's bosses (spec §5.6)
  ['fog-halberd', '霧門長戟', 'fog-warden', 'boss', 'weapon', ['atk', 'str', 'eliteDmg'], '戟刃一揮，霧就自己讓出一條路。守了一輩子門的傢伙，開起路來也很在行。', 'spear'],
  ['silent-chime', '無聲鐘墜', 'silent-bell', 'boss', 'neck', ['sleepRes', 'tpCost', 'res'], '一顆不會響的小鐘。戴著它念咒，聲音會放得很輕，力氣也省下不少。'],
  ['borrowed-blade', '借來的劍', 'hollow-champion', 'boss', 'weapon', ['multi', 'critDmg', 'str'], '劍柄上磨出了好幾種握法。握得久了，總有一種會變成你自己的。', 'sword'],
  ['archon-crown', '古城之冠', 'old-city-archon', 'boss', 'head', ['res', 'tpCost', 'int'], '執政像頭上的金冠。戴上它說話會不自覺慢半拍，每個字都想清楚了才出口。'],
  ['glutton-gauntlet', '飽食手甲', 'gorged-beast', 'boss', 'hands', ['atk', 'crit', 'def'], '用飽食之獸的爪與皮縫成的手甲，握拳時會發出滿足的咕嚕聲。打得越重，它越開心。'],
  ['cradled-light', '搖籃之光', 'lantern-mother', 'boss', 'neck', ['heal', 'wil', 'gauge'], '一小團光蜷在鍊墜裡，像嬰兒睡在搖籃裡。戴著它替人回復時，手心會暖起來。'],
  ['festival-mask', '祭典面具', 'forgotten-festival', 'boss', 'head', ['goldFind', 'evasion', 'agi'], '狐狸面具的笑臉從來不變。戴著它在人群裡鑽來鑽去，總會撿到誰掉的零錢。'],
  ['whale-song-ring', '鯨歌指環', 'starless-whale', 'boss', 'ring', ['tp', 'tpRegen', 'mag'], '貼在耳邊聽得見遠方的低鳴。那首歌唱得很慢，慢到念完一段咒語，力氣又回來了一點。'],
  ['still-hand-boots', '停針之靴', 'stopped-clock', 'boss', 'feet', ['spd', 'evasion', 'agi'], '鞋跟上嵌著一根停住的指針。穿上它的人總比別人早一步動起來，好像偷到了一秒。'],
  ['first-lantern-staff', '最初的燈杖', 'first-lantern', 'boss', 'weapon', ['mag', 'fireDmg', 'int'], '杖頂的火苗小得像一顆豆子，卻從來沒有熄過。念起火咒的時候，它會跟著跳一下。', 'staff'],
  // the regions' bosses (spec §5.6)
  ['burning-crown-ring', '焚冠之戒', 'ember-tyrant', 'boss', 'ring', ['fireDmg', 'atk', 'crit'], '焚城之焰留下的戒指，戒圈還燙手。戴著它出拳，火會順著指節竄出去，脾氣也跟著大一點。'],
  ['sand-veil-boots', '沙幕之靴', 'sandstorm-maw', 'boss', 'feet', ['evasion', 'fireRes', 'agi'], '沙暴之口吐出來的靴子，抖一抖還會掉沙。穿著它閃身，熱浪和刀子都慢半步才追上來。'],
  ['troupe-drum', '舞團的鼓', 'mirage-city', 'boss', 'offhand', ['tp', 'heal', 'agi'], '蜃樓之城裡的皮鼓，鼓面上留著拍子敲出的凹痕。敲一下，身邊的人腳步會輕起來，傷也好得快一點。'],
  ['everwinter-veil', '永冬之紗', 'rime-sovereign', 'boss', 'body', ['iceRes', 'res', 'hp'], '永凍之守王座後垂下的一幅紗，結滿了細細的冰花。披上它，寒氣鑽不進衣領，咒語也擋得住幾分。'],
  ['snowmute-ring', '無聲雪戒', 'white-silence', 'boss', 'ring', ['tp', 'iceDmg', 'int'], '指環裡下著一場不會停的小雪。戴著它念冰的咒語，聲音一點也傳不出去，冰卻凍得特別深。'],
  ['sealing-spear', '封印之槍', 'rift-maw', 'boss', 'weapon', ['atk', 'iceDmg', 'wil'], '槍尖纏著舊紙籤，籤上的字被冰泡得發白。刺出去時，寒氣會跟著槍尖收攏，像一句念完的祝詞。', 'spear'],
  ['roc-feather-boots', '鵬羽之靴', 'thunder-roc', 'boss', 'feet', ['spd', 'thunderRes', 'agi'], '巨鵬的羽毛縫成的靴子，走起來比腳步聲還快。雷劈下來的時候，總是落在剛才站的地方。'],
  ['conductor-ring', '指揮者之戒', 'storm-conductor', 'boss', 'ring', ['thunderDmg', 'crit', 'mag'], '雷霆指揮者的戒指。舉起手，雷聲會乖乖等你數到三，再照你指的方向劈下去。'],
  ['starfire-tiara', '星火頭冠', 'starfire-colossus', 'boss', 'head', ['int', 'tp', 'tpCost'], '巨像胸口那顆核的碎片，鑲成了頭冠。戴著它想事情，腦袋會微微發熱，念起咒來也比較省事。'],
  ['hydra-fang', '蛇牙短刃', 'mire-hydra', 'boss', 'weapon', ['crit', 'vuln', 'agi'], '多頭蛇其中一個頭的牙，磨成了短刃。刃上兩道細溝，刺進去時像一口咬了兩下，專找破綻下手。', 'dagger'],
  ['greenward-cloak', '護林斗篷', 'grey-blight', 'boss', 'body', ['hp', 'wil', 'res'], '從灰枯身上抖下來的斗篷，拍掉灰以後，底下竟是青綠色的。披上它，毒霧和咒語都得先繞過這片綠。'],
  ['bog-ring', '沼底指環', 'bog-leviathan', 'boss', 'ring', ['tp', 'wil', 'tpRegen'], '在沼底巨口的肚子裡泡了很久的指環，沉甸甸的，還帶著泥土的味道。念咒用掉的氣回得特別快，心也跟著靜下來。'],
  ['faceless-mask', '無面面具', 'faceless-host', 'boss', 'head', ['evasion', 'int', 'res'], '無面之主拿來當臉的那張空白面具。戴上它，誰都看不出你在想什麼，打過來的招式也常常偏掉。'],
  ['gilded-mail', '鍍金之鎧', 'vault-dragon', 'boss', 'body', ['armor', 'hp', 'def'], '金庫之龍蛻下的鱗片，片片被金幣磨得發亮，串成了一件鎧甲。敵人第一眼先看金光，回過神來，刀已經砍在鱗片上了。'],
  ['parade-boots', '夜行之靴', 'shadow-parade', 'boss', 'feet', ['agi', 'evasion', 'spd'], '影之行列裡某道影子穿過的鞋，鞋底薄得像一層夜色。穿著它走進人群，腳步聲會混進別人的腳步聲裡，身子也輕了。'],
  ['colossus-gauntlet', '巨像手甲', 'fortress-colossus', 'boss', 'hands', ['armor', 'def', 'str'], '要塞巨像的鐵拳改成的手甲，指節上還留著擋下攻城槌的凹痕。握起拳頭時喀的一聲，聽起來就很可靠。'],
  ['wallclimber-boots', '攀牆之靴', 'siege-titan', 'boss', 'feet', ['def', 'spd', 'str'], '攻城巨獸的爪尖打成了鞋釘，一踩就咬進石縫。站穩了再出手，力道會從腳底一路頂上來，人也不容易被推倒。'],
  ['red-horn', '紅色號角', 'last-commander', 'boss', 'neck', ['gauge', 'hp', 'wil'], '指揮官掛在胸前的那一支，紅漆褪了大半，皮繩也磨得發亮。吹響的時候，連自己的心跳都會跟著穩下來。'],
];

export const ROSTER_SPECIALS: SpecialDef[] = ROWS.map(([id, name, owner, source, slot, fixed, lore, weaponKind]) => ({
  id, name, rarity: 'unique', slot, region: null, source, fixed, lore, owner, ...(weaponKind ? { weaponKind } : {}),
}));
