import type { AnyStat, GearSlot, WeaponKind } from '../engine/types';
import type { SpecialDef } from './gear';

/**
 * The monster roster's own uniques (roster plan Task A3, spec §5.5–§5.6, ruling 14): one for each boss and warden, its
 * `owner`. Merged into SPECIALS for lookups, but never in a drop pool (`regionSpecials`, `generalLegendaries`,
 * `pickSpecial` leave any `owner` out) and never silhouetted (`region: null`). It comes by replacing a legendary-tier drop
 * in its owner's fight, or by crafting once its owner has fallen (plan C). The `lore` lines are neutral until the bestiary
 * writing rewrites them (the W steps).
 */
type Row = [id: string, name: string, owner: string, source: 'boss' | 'elite', slot: GearSlot, fixed: AnyStat[], lore: string, weaponKind?: WeaponKind];

const ROWS: Row[] = [
  // the wardens (spec §5.5)
  ['moonless-mirror', '無月之鏡', 'false-moon', 'elite', 'offhand', ['res', 'heal', 'int'], '鏡面映著一輪不在天上的月，照久了，連影子都變得溫柔。'],
  ['unrung-clapper', '不響的鐘舌', 'bell-warden', 'elite', 'neck', ['sleepRes', 'tpCost', 'wil'], '從沒敲響過的鐘舌，掛在胸前卻意外地讓人安心。'],
  ['ancestor-gauntlet', '祖傳的手甲', 'toppled-automaton', 'elite', 'hands', ['armor', 'atk', 'int'], '關節裡的齒輪還在轉，彷彿記得上一個主人的握力。'],
  ['requiem-staff', '鎮魂之杖', 'requiem-conductor', 'elite', 'weapon', ['mag', 'heal', 'wil'], '杖頭一揮，四周的雜音便安靜下來，只剩一段慢板。', 'staff'],
  ['brood-lantern', '巢燈', 'lantern-brood', 'elite', 'neck', ['hp', 'res', 'gauge'], '殼裡透出暖光，提在手上像抱著一顆小小的心跳。'],
  ['last-dance-veil', '最後一支舞的紗', 'mirage-lead', 'elite', 'body', ['agi', 'gauge', 'res'], '紗一揚起，腳步就自己踩上了拍子。'],
  ['ninety-nine-steps', '九十九級石階', 'ice-shrine', 'elite', 'feet', ['def', 'wil', 'iceRes'], '鞋底刻著石階的紋路，每一步都走得很穩。'],
  ['starbound-tome', '星封之書', 'burning-page', 'elite', 'offhand', ['mag', 'int', 'tp'], '書頁被星光封住，翻不開，卻總在需要的時候發熱。'],
  ['arrowmark-bow', '刻痕長弓', 'grey-elder', 'elite', 'weapon', ['agi', 'crit', 'critDmg'], '弓身滿是小小的刻痕，每一道都指著同一個方向。', 'bow'],
  ['hungry-purse', '空腹的錢袋', 'locked-vault', 'elite', 'ring', ['goldFind', 'matFind', 'agi'], '錢袋永遠覺得自己不夠飽，所以總能多撿一點。'],
  ['gatewarden-shield', '守門者之盾', 'gate-breaker', 'elite', 'offhand', ['block', 'def', 'hp'], '盾面坑坑疤疤，卻一次也沒讓身後的人受傷。'],
  // the main road's bosses (spec §5.6)
  ['fog-halberd', '霧門長戟', 'fog-warden', 'boss', 'weapon', ['atk', 'str', 'eliteDmg'], '戟刃揮過的地方，霧會自己讓出一條路。', 'spear'],
  ['silent-chime', '無聲鐘墜', 'silent-bell', 'boss', 'neck', ['sleepRes', 'tpCost', 'res'], '輕輕一晃也沒有聲音，心卻跟著靜了下來。'],
  ['borrowed-blade', '借來的劍', 'hollow-champion', 'boss', 'weapon', ['multi', 'critDmg', 'str'], '劍柄上留著好幾種握法的痕跡，借來的招式也能變成自己的。', 'sword'],
  ['archon-crown', '古城之冠', 'old-city-archon', 'boss', 'head', ['res', 'tpCost', 'int'], '冠上的金漆斑駁，戴上它的人說話都慢了半拍。'],
  ['glutton-gauntlet', '飽食手甲', 'gorged-beast', 'boss', 'hands', ['atk', 'crit', 'def'], '吃得多、打得重，手甲本人似乎很滿意這個安排。'],
  ['cradled-light', '搖籃之光', 'lantern-mother', 'boss', 'neck', ['heal', 'wil', 'gauge'], '一小團光蜷在鍊墜裡，像在等誰把它抱回家。'],
  ['festival-mask', '祭典面具', 'forgotten-festival', 'boss', 'head', ['goldFind', 'evasion', 'agi'], '面具的笑臉一直沒變，戴上它的人也跟著想笑。'],
  ['whale-song-ring', '鯨歌指環', 'starless-whale', 'boss', 'ring', ['tp', 'tpRegen', 'mag'], '貼近耳朵，能聽見很遠很遠的低鳴。'],
  ['still-hand-boots', '停針之靴', 'stopped-clock', 'boss', 'feet', ['spd', 'evasion', 'agi'], '穿上它的人，總覺得時間替自己多停了一秒。'],
  ['first-lantern-staff', '最初的燈杖', 'first-lantern', 'boss', 'weapon', ['mag', 'fireDmg', 'int'], '杖頂的火苗很小，卻從來沒有熄過。', 'staff'],
  // the regions' bosses (spec §5.6)
  ['burning-crown-ring', '焚冠之戒', 'ember-tyrant', 'boss', 'ring', ['fireDmg', 'atk', 'crit'], '戒圈燙手，脾氣也不太好，但打起架來很可靠。'],
  ['sand-veil-boots', '沙幕之靴', 'sandstorm-maw', 'boss', 'feet', ['evasion', 'fireRes', 'agi'], '靴底永遠倒得出一點沙，走過的路都被風抹平。'],
  ['troupe-drum', '舞團的鼓', 'mirage-city', 'boss', 'offhand', ['tp', 'heal', 'agi'], '鼓面一響，連最怕跳舞的人都會踏兩步。'],
  ['everwinter-veil', '永冬之紗', 'rime-sovereign', 'boss', 'body', ['iceRes', 'res', 'hp'], '披上它便不怕冷，只是說話時會冒出白氣。'],
  ['snowmute-ring', '無聲雪戒', 'white-silence', 'boss', 'ring', ['tp', 'iceDmg', 'int'], '指環裡下著一場不會停的小雪。'],
  ['sealing-spear', '封印之槍', 'rift-maw', 'boss', 'weapon', ['atk', 'iceDmg', 'wil'], '槍尖纏著舊舊的紙籤，一刺出去，寒氣就跟著收攏。', 'spear'],
  ['roc-feather-boots', '鵬羽之靴', 'thunder-roc', 'boss', 'feet', ['spd', 'thunderRes', 'agi'], '腳步輕得像羽毛，落地時卻帶著一聲雷。'],
  ['conductor-ring', '指揮者之戒', 'storm-conductor', 'boss', 'ring', ['thunderDmg', 'crit', 'mag'], '舉起手的時候，雷聲會乖乖等你數到三。'],
  ['starfire-tiara', '星火頭冠', 'starfire-colossus', 'boss', 'head', ['int', 'tp', 'tpCost'], '頭冠上的星火一閃一閃，想事情的時候閃得特別快。'],
  ['hydra-fang', '蛇牙短刃', 'mire-hydra', 'boss', 'weapon', ['crit', 'vuln', 'agi'], '刃上有兩道細溝，總是一次咬兩口。', 'dagger'],
  ['greenward-cloak', '護林斗篷', 'grey-blight', 'boss', 'body', ['hp', 'wil', 'res'], '斗篷沾著青草的味道，雨水一碰就滑走了。'],
  ['bog-ring', '沼底指環', 'bog-leviathan', 'boss', 'ring', ['tp', 'wil', 'tpRegen'], '指環沉甸甸的，戴久了反而覺得踏實。'],
  ['faceless-mask', '無面面具', 'faceless-host', 'boss', 'head', ['evasion', 'int', 'res'], '面具上沒有表情，所以戴上它的人想要什麼表情都行。'],
  ['gilded-mail', '鍍金之鎧', 'vault-dragon', 'boss', 'body', ['armor', 'hp', 'def'], '金光閃閃，敵人第一眼都會先看錢，再看人。'],
  ['parade-boots', '夜行之靴', 'shadow-parade', 'boss', 'feet', ['agi', 'evasion', 'spd'], '走在夜裡，腳步聲會混進別人的腳步聲裡。'],
  ['colossus-gauntlet', '巨像手甲', 'fortress-colossus', 'boss', 'hands', ['armor', 'def', 'str'], '螺栓一顆都沒少，握拳時會發出很可靠的喀聲。'],
  ['wallclimber-boots', '攀牆之靴', 'siege-titan', 'boss', 'feet', ['def', 'spd', 'str'], '鞋尖的鐵釘專咬石縫，再高的牆也爬得上去。'],
  ['red-horn', '紅色號角', 'last-commander', 'boss', 'neck', ['gauge', 'hp', 'wil'], '號角的紅漆已經褪了，吹起來的聲音卻還很響亮。'],
];

export const ROSTER_SPECIALS: SpecialDef[] = ROWS.map(([id, name, owner, source, slot, fixed, lore, weaponKind]) => ({
  id, name, rarity: 'unique', slot, region: null, source, fixed, lore, owner, ...(weaponKind ? { weaponKind } : {}),
}));
