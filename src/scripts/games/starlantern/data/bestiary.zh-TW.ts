import type { StoryGate } from './story/scenes';

/**
 * The bestiary's words (roster plan Tasks C1, C5, C6; spec §7.2, §10): the two characters an inscribed piece is named
 * after, each roster foe's bestiary text, and the page's own strings.
 */

/** One line of a foe's entry; `after`, the story it waits for (engine/story/events.ts gateOpen). */
export interface BestiaryLine { text: string; after?: StoryGate }
/**
 * A roster foe's entry (plan Task C5, the W steps): `trait`, how it fights, shown once seen; `lines[0]`, shown once felled;
 * a story foe's later lines each behind their `after` (ruling 20). Handbook text: no 「……」, no Latin letters or digits,
 * full-width punctuation, at most sixty characters a line (data/bestiary.test.ts).
 */
export interface BestiaryText { trait: string; lines: BestiaryLine[] }

/**
 * The entries, by enemy id. Each L task writes its foes' entries (its W steps), at the latest in the commit that puts them
 * live (every live foe must have one; data/bestiary.test.ts). An animal is 牠, a thing 它, a person's remnant 他.
 */
export const BESTIARY: Partial<Record<string, BestiaryText>> = {
  // ---- roster plan Task L1a: the shallow road (B 4–9, C 10–15), its bosses at 5, 10, 15 and its wardens at 8 and 13
  'paper-moth': {
    trait: '總是三隻一起飛來，撲下的鱗粉能讓同一排的人一起打瞌睡。用範圍招式一次收乾淨最省事。',
    lines: [{ text: '沒寄出去的信，在霧裡長出了翅膀。翅膀上的字早就糊了，只剩信封上的地址還看得清楚。' }],
  },
  'lamp-wight': {
    trait: '它會把燈光分給傷得最重的同伴。不先熄掉這盞燈，前面的敵人怎麼打都打不完。',
    lines: [{ text: '一盞替晚歸的人留著的燈，等得太久，連提燈的手都等成了影子。到現在，它還在照顧別人。' }],
  },
  'root-hound': {
    trait: '看到牠伏低身子，下一回合就會撲上來。先防禦，或趁牠蹲著的時候把牠打倒。',
    lines: [{ text: '霧裡的樹根盤成了狗的形狀，連搖尾巴都學得很像。可惜牠搖尾巴的時候，通常是準備咬人了。' }],
  },
  'tin-soldier': {
    trait: '喊完列隊，它就會擋在受傷的同伴前面，單體招式全被它接走。改用範圍招式，或先拆了它。',
    lines: [{ text: '不知道哪個孩子玩丟的錫兵，在霧裡長得跟人一樣高。發條還在轉，它還在等解散的口令。' }],
  },
  'dust-mimic': {
    trait: '名牌寫著「寶箱？」，第一回合會搶先狠咬一口，先防禦接住。被打中一下就會現形，之後只是個會咬人的箱子。',
    lines: [{ text: '閣樓上沒人打開過的木箱，在霧裡學會了自己張嘴。裡面只有灰塵，和一點點被遺忘的不甘心。' }],
  },
  'market-ghost': {
    trait: '被它打中，錢包就會變輕。只要在這一戰裡打倒它，被摸走的金幣會一枚不少地回來。',
    lines: [{ text: '市集收攤以後，還留在空攤子上的吆喝聲。它記得怎麼喊價，也改不掉找錢時總要少找一枚的老毛病。' }],
  },
  'tongueless-bell': {
    trait: '鐘聲聽不見，聽過的那一排卻會叫不出技能的名字，下一回合只能用攻擊。趁早把它敲下來。',
    lines: [{ text: '鐘舌被拔掉的鐘，張著空空的嘴晃來晃去。它好像很不甘心，所以也要別人話到嘴邊說不出來。' }],
  },
  'hollow-hunter': {
    trait: '他會記住最後打中他的那一下，用同樣的屬性還給出手的人。用強力的屬性技能打他之前，先想想對方接不接得住。',
    lines: [
      { text: '霧把好幾位冒險者的記憶塞進了同一副身體。哪一段才是自己的，他已經分不清，只會學別人出招。' },
      { text: '打倒他時，會聽見一句：接下來是什麼？那是某位冒險者留在霧裡的話，說話的人早就走遠了。' },
    ],
  },
  'mist-twin': {
    trait: '一定成對出現。倒下一隻，另一隻就會氣得變兇。先把兩隻的體力削到差不多，再一口氣收掉。',
    lines: [{ text: '霧把一段兩個人一起走過的記憶摺成了兩半。少了另一半的那一隻，總是特別生氣。' }],
  },
  'moon-crow': {
    trait: '牠的弱點每回合都換，四種屬性輪著來。先看名牌上現在弱什麼，再決定這一回合誰出手。',
    lines: [{ text: '羽毛像一面面小鏡子，會照出別人眼裡的月亮。所以每個人看牠，看到的顏色都不太一樣。' }],
  },
  'bell-watcher': {
    trait: '他一點名，下一回合他的同夥就會圍著那個人打。被點到的人先防禦，或讓隊友用挑釁把攻擊引開。',
    lines: [
      { text: '提著小燈、拄著長杖，在霧裡來回巡邏的影子。他每走完一圈，就會抬頭聽一聽有沒有鐘聲。' },
      { text: '被靜鐘會派進迷宮的巡守，有不少沒有回來。霧記住的只有他們巡邏的樣子，人已經不在這裡。', after: { seen: ['act3'] } },
    ],
  },
  sleepwalker: {
    trait: '開戰時還在睡，挨了打或睡飽了都會醒，起床氣非常重。範圍招式也會吵醒他，先收拾別隻再說。',
    lines: [{ text: '一個怎麼也醒不過來的夜晚，在霧裡自己走了起來。他揮拳的樣子，像在夢裡趕走什麼東西。' }],
  },
  hoarder: {
    trait: '撐不了幾回合就會溜走，溜走了什麼都不留。看到牠，全隊先打牠準沒錯。',
    lines: [{ text: '專撿閃閃發亮的東西，記憶碎片也照撿不誤。窩裡堆滿了別人的寶貝，打倒牠的人常常能分到一點。' }],
  },
  'fog-warden': {
    trait: '霧門升起的那一回合是預告，下一回合整扇門就會砸向全隊。看到意圖，大家先防禦。',
    lines: [{ text: '守著第五層霧門的大個子。門後面有什麼沒人知道，牠大概也不知道，但牠守得非常認真。' }],
  },
  'silent-bell': {
    trait: '無聲的轟鳴震得那一排耳鳴不止，一時想不起技能怎麼用。它傷過一半就鳴得更兇，回復交給另一排或道具。',
    lines: [{ text: '鐘身從頂到底裂了一道縫，敲下去只會悶悶地震一下。據說把耳朵貼在裂縫上，還聽得到它最後響的那一聲。' }],
  },
  'hollow-champion': {
    trait: '他會用最後打中他的那一下回敬出手的人，讓耐打的隊員最後出手。快倒下時會連出好幾劍，留一個人專心回復。',
    lines: [
      { text: '盔甲上的刀痕一道疊著一道，每一道都出自不同的劍法。劍法多到數不清，卻沒有一招是他自己的。' },
      { text: '倒下之前，他好像想說一個名字。說到一半，就換成了別人的。' },
    ],
  },
  'false-moon': {
    trait: '月明時它只顧著回復加防，趁機把隊伍整頓好；月蝕時冰雨落向全隊，它也不再回復，正好全力進攻。',
    lines: [
      { text: '一輪不在天上的月亮，在明與蝕之間換來換去，從來不肯停在其中一邊。' },
      { text: '瑟蕾說過，滿月的水盆裡映出了一個好亮好暖的結局。這輪月亮亮起來的時候，有一點像那一晚。', after: { seen: ['mem:selene:2'] } },
      { text: '她也說過，結局不只一種。所以這輪月亮一下明、一下蝕，誰也不替誰選。', after: { seen: ['mem:selene:3'] } },
    ],
  },
  'bell-warden': {
    trait: '他會點名，也會敲鐘打亂那一排的手腳，讓技能使不出來。鐘聲變急就是他快撐不住了，被點名的人先防禦。',
    lines: [
      { text: '站在一扇霧裡看不見的門前，手裡的鐘槌從來沒有放下過。他守得太久，久到忘了門後是什麼。' },
      { text: '他也是靜鐘會派進迷宮的人，一直沒有回來。霧連他靴底那兩個站穿的洞，都記得清清楚楚。', after: { seen: ['act3'] } },
    ],
  },
};

/** The bestiary page's own strings (roster plan Task C6): the handbook's 圖鑑 tab, its three filters and a foe's detail. */
export const BESTIARY_UI = {
  /** A foe not met yet: its name is not known, only where it is met (ruling 18: no silhouette either). */
  unknown: '？？？',
  filters: { road: '魔物・本道', lands: '魔物・各地區', bosses: '魔物・頭目與守關者' },
  /** A filter row's right column: how many of its kinds were met, of all it lists. */
  count: (seen: number, total: number) => `${seen}／${total}`,
  haunts: {
    main: '本道',
    /** An old kind: met on every road. */
    everywhere: '本道與各地區',
    /** The lantern-eater: a boss wherever no other has come yet. */
    bossFloors: '各地的頭目層',
    road: (lo: number, hi?: number) => (hi === undefined ? `本道 ${lo} 層以下` : `本道 ${lo}–${hi} 層`),
    depth: (place: string, depth: number) => `${place} 第 ${depth} 層`,
    from: (place: string, depth: number) => `${place} 第 ${depth} 層起`,
    finale: '本道的最深處',
    deep: '迷宮深處',
  },
  where: (place: string) => `出沒：${place}`,
  tally: (seen: number, felled: number) => `見過 ${seen} 次・擊倒 ${felled} 次`,
  /** A list row's right column. */
  felledRow: (n: number) => `擊倒 ${n}`,
  seenRow: '見過',
  /** A weakness that turns (M5): never one element for long. */
  prism: '弱點：輪替',
  mats: (names: string) => `素材：${names}`,
  inscription: (stat: string, held: boolean) => `銘文：${stat}${held ? '（已取得）' : ''}`,
  own: (name: string, got: boolean) => `專屬裝備：${name}（${got ? '已取得' : '未取得'}）`,
  /** Seen, not felled yet: the rest of the entry waits. */
  later: '擊倒之後，會知道更多。',
};

/**
 * Roster plan ruling 16: an inscribed piece is named 「〇〇・紙蛾銘」, after two characters of its species' name (the
 * spec's example 「紙蛾銘」 takes the two that read as the creature, so each row here is picked, not cut).
 */
export const INSCRIPTION_NAME: Record<string, string> = {
  // the main road (spec §5.3)
  'paper-moth': '紙蛾', 'lamp-wight': '幽影', 'root-hound': '獵犬', 'tin-soldier': '錫兵', 'dust-mimic': '木箱',
  'market-ghost': '吆喝', 'tongueless-bell': '無舌', 'hollow-hunter': '空殼', 'mist-twin': '雙子', 'moon-crow': '映月',
  'bell-watcher': '巡守', sleepwalker: '夢遊', 'old-city-sentinel': '衛像', 'requiem-choir': '歌隊', 'lantern-larva': '幼體',
  'epitaph-golem': '碑文', 'ancestor-automaton': '古代', 'ash-archivist': '書記', 'wick-shade': '燭芯', 'keeper-echo': '提燈',
  'ember-maw': '餘燼', 'sorrow-crystal': '悲傷', 'deep-tendril': '燈鬚', 'music-box': '樂盒', 'paper-cranes': '紙鶴',
  'lost-shadow': '走失', 'returning-light': '歸途', hoarder: '拾憶', 'gilded-hoarder': '金箔',
  // the regions (spec §5.4)
  'cinder-imp': '小鬼', 'forge-hound': '熔爐', 'ash-mourner': '弔者', 'mirage-dancer': '舞者', 'sand-scorpion': '沙蠍',
  'frost-doll': '人偶', 'glacier-tortoise': '冰河', 'snow-caller': '雪中', 'ice-komainu': '狛犬', 'frozen-pilgrim': '參拜',
  'thunder-kite': '雷鳶', 'storm-totem': '石柱', 'charge-jelly': '水母', 'star-ember': '星屑', 'stolen-tome': '魔書',
  'bog-mother': '泥沼', 'rot-lily': '百合', 'leech-knight': '蛭甲', 'ashen-treant': '樹人', 'spore-moth': '孢子',
  'mirror-thief': '竊影', 'veil-stalker': '帷幕', 'hush-acolyte': '靜默', 'vault-mimic': '寶庫', 'debt-collector': '敲門',
  'rivet-golem': '鉚釘', 'siege-crab': '攻城', 'herald-engine': '號令', 'fallen-knight': '騎士', 'banner-bearer': '紅旗',
};
