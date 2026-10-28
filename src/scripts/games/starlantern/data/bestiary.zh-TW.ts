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
  // ---- roster plan Task L2a: the deep road (D 16–24, E 25–30, F 31 on), its bosses at 20 to 50, its wardens at 18, 23, 28,
  // the lantern-mother of the finale and the archon's hand
  'old-city-sentinel': {
    trait: '它舉起天秤，下一回合審判之光就會從前排直直燒到後排。它也會替受傷的同伴擋下只打一人的攻擊，用雷對付它。',
    lines: [
      { text: '古城廣場上的白石像，手裡的天秤從來沒有放平過。誰走到它面前，它都要先秤一秤。' },
      { text: '它原本站在艾斯特拉的法庭門口。當年的人吵架吵不完，就跑來請它秤一秤誰比較有理。', after: { seen: ['act4'] } },
    ],
  },
  'requiem-choir': {
    trait: '它一唱，所有同伴一起回復，還會叫一盞提燈幽影來幫腔。它怕物理，先打倒它，戰鬥才不會越拖越長。',
    lines: [
      { text: '一首唱了太多遍的安魂曲，自己排成了隊。聲部分得清清楚楚，就是沒有誰肯唱低音。' },
      { text: '艾斯特拉打完仗的那些傍晚，廣場上天天都在唱這首歌，唱給回不來的人聽。', after: { seen: ['act4'] } },
    ],
  },
  'lantern-larva': {
    trait: '牠咬中一口，就把吃到的光變成自己的體力；鼓起身子之後，下一口咬得更重。用冰，趁牠還小打倒牠。',
    lines: [
      { text: '圓滾滾的一團光，嘴巴卻大得不像話。牠看到燈就湊上去，咬一口、亮一下，再咬一口。' },
      { text: '燈喰之母生下的孩子之一。牠還太小，只吞得下路邊的燈籠，吞不下天上的星星。', after: { seen: ['finale'] } },
    ],
  },
  'epitaph-golem': {
    trait: '它很慢。可是它一念抹消之文，點到的人和同一排的隊友，防禦都會被擦掉一截，那一排先防禦。它怕火。',
    lines: [{ text: '一塊慢吞吞的石碑，碑上的字它讀一個、擦一個。走過的地方，地上會留下一層細細的石粉。' }],
  },
  'ancestor-automaton': {
    trait: '每回合結束，它都會把自己修回一大截。被雷打中的那一回合它會短路，修不了，所以每回合都用雷敲它一下。',
    lines: [
      { text: '胸口刻著一個看不懂的記號，齒輪轉得比心跳還準。走路時喀噠喀噠，像在替自己數拍子。' },
      { text: '造它的是波比的祖先。所以她在路邊看到倒下的機兵，總會蹲下來，拍拍它的頭。', after: { seen: ['mem:bobby:4'] } },
    ],
  },
  'ash-archivist': {
    trait: '它會把一名隊員身上的加持整個抹下來，貼到自己身上。打倒它之前先別替隊員加持，用冰對付它。',
    lines: [{ text: '這位書記拿灰當墨水，抄下什麼，什麼就從原處淡掉。它的筆記越抄越厚，世界越抄越薄。' }],
  },
  'wick-shade': {
    trait: '每倒一根都會爆開，燒到全隊。一次打倒三根就是連挨三下，一根一根打，中間才有空回復。',
    lines: [{ text: '燒到只剩一小截的燭芯，成群飄著，像一場不肯散場的守夜。湊近一點，還聞得到蠟油的味道。' }],
  },
  'keeper-echo': {
    trait: '他會把我方最後一個打中敵人的招式，照回給出手的人。在他出手前，讓耐打的隊員補上一擊，照回的那一下就會改打這位隊員。',
    lines: [
      { text: '提著燈往下走的影子，一個接一個，從來不回頭。燈照得到腳下，照不到他的臉。' },
      { text: '老人們說，很久以前有個守燈人，把自己點成了燈芯。這些影子提的燈，和傳說裡的一模一樣。', after: { seen: ['act4'] } },
      { text: '每一道影子走路的樣子都一樣，連提燈的手勢都分毫不差。那是同一段路，被走了很多遍的形狀。', after: { seen: ['mem:hero:9'] } },
    ],
  },
  'ember-maw': {
    trait: '它會吐出燭芯之影來幫忙，吐出來的燭芯倒下時一樣會爆。用雷打它，它越早倒下，吐出來的越少。',
    lines: [{ text: '一張燒紅的大嘴，吃什麼都嫌不夠燙。吃剩的燭芯，它會順手吐出來，讓它們自己找事做。' }],
  },
  'sorrow-crystal': {
    trait: '第一下打中它的屬性，它會硬起來抵抗一陣子。它最怕物理，先用火、冰或雷碰它一下，再換物理全力打。',
    lines: [{ text: '哭到一半凍住的眼淚，越長越大，長成了會走路的晶簇。被打中時會叮的一聲，聽起來有點委屈。' }],
  },
  'deep-tendril': {
    trait: '被它碰到的人，施展技能的力氣會被吸走一截，吸乾了就只能攻擊。技能趁早用，用火燒斷它。',
    lines: [
      { text: '從很深的地方伸上來的蒼白觸鬚，摸到什麼都要吸一口。觸鬚的另一頭連到哪裡，沒人敢順著去看。' },
      { text: '它是燈喰之母伸出來的鬚，專門替母親試味道。吸到苦的光會縮一下，吸到甜的就不肯放。', after: { seen: ['finale'] } },
    ],
  },
  'music-box': {
    trait: '它演奏時，同伴每回合都會回復，奏完還會讓點到的人那一排睡著。打中它一下就能打斷，不必急著打倒它。',
    lines: [{ text: '轉了太多年的音樂盒，有幾個音已經走得回不來。發條一鬆，它總停在最好聽的那一段前面。' }],
  },
  'paper-cranes': {
    trait: '倒下的紙鶴會被同伴摺回來一次。用火一口氣把整群燒乾淨，就沒有誰來摺了。',
    lines: [{ text: '有人為了一個願望摺了一千隻紙鶴。願望忘了，紙鶴還在飛，翅膀的邊利得像裁紙刀。' }],
  },
  'lost-shadow': {
    trait: '開戰時，它會照著隊上攻擊最高的人長出力氣，隊伍越強它越兇。它怕物理，趁早打倒它。',
    lines: [{ text: '不知道是誰弄丟的影子，在霧裡一直找主人。它看到誰都想學，學得最像的，總是最強的那一個。' }],
  },
  'returning-light': {
    trait: '它不會攻擊，只會替同伴加防禦。打倒它時，它的光會分給全隊回復體力，所以第一個就打它。',
    lines: [{ text: '一盞替人照亮歸途的小光。追著它走的人，總能走到自己家門口，只有它自己從來沒回過家。' }],
  },
  'gilded-hoarder': {
    trait: '名牌上的倒數歸零，牠就溜走了。牠每被打中一下就更滑溜，用一記重擊，別用連打好幾下的招式。',
    lines: [{ text: '把撿來的金箔一片片貼在毛上，貼得太滿，連打噴嚏都會掉金粉。跟在後面撿，也算一種收穫。' }],
  },
  'old-city-archon': {
    trait: '只要還有一隻手在，打它的傷都會減半。先用火把兩隻手拆掉，再用雷打本體。',
    lines: [
      { text: '坐在古城最高處的執政像，兩隻石手按著整座城。按得太用力，連自己都站不起來。' },
      { text: '它照著艾斯特拉最後一位執政者雕成。戰爭結束那天，排隊把傷心事交給燈的人，都從它腳下走過。', after: { seen: ['act4'] } },
    ],
  },
  'archon-hand': {
    trait: '有它在，執政像受到的傷害都會減半。它怕火，先拆手。',
    lines: [{ text: '執政像的一隻石手，按住東西就不肯放。翻過來看，掌心刻著「穩住」兩個字。' }],
  },
  'gorged-beast': {
    trait: '牠偶爾會吐出一根燭芯之影，那根倒下時一樣會爆。牠啃食咬中的傷害會吃回自己身上，用冰打，被咬的人趕快回復。',
    lines: [
      { text: '吞了太多燈，肚子撐得發亮。牠走路的時候，肚子裡還會傳出別人的笑聲和咳嗽聲。' },
      { text: '燈喰之母的孩子裡最會吃的一個。兄弟姊妹還在學怎麼咬燈，牠已經吃空了半座城的路燈。', after: { seen: ['finale'] } },
    ],
  },
  'lantern-mother': {
    trait: '吞光燒向全隊，碾壓砸向一人，兩招輪著來。用冰打，每次吞光之後，先把大家的體力拉回來。',
    lines: [
      { text: '燈喰之母蜷在最深處的燈底下，吃的是燈裝不下、溢出來的光。一路上那些貪吃的小傢伙，都是牠的孩子。', after: { seen: ['finale'] } },
    ],
  },
  'forgotten-festival': {
    trait: '它會一盞一盞點起提燈幽影，三盞全亮就放出燒向全隊的祭典之火。燈一亮就打熄，別讓它湊滿三盞。',
    lines: [{ text: '一場沒人記得日期的祭典，攤位還在，燈籠也還在，只差客人。你來了它很高興，高興到想請你吃一把火。' }],
  },
  'starless-whale': {
    trait: '看到牠深潛，下一回合整片海會壓向全隊，大家先防禦。牠的鯨歌咬中人時會替自己回復，用雷打牠。',
    lines: [{ text: '在沒有星星的海裡游了太久，背上的星圖都褪成了黑色。牠一唱歌，整層迷宮都跟著輕輕搖晃。' }],
  },
  'stopped-clock': {
    trait: '被它遲滯的人，下一回合會拖到最後才行動，回復別只靠那一個人。它怕物理，把鐘心敲碎。',
    lines: [{ text: '一顆停在某個時刻的鐘心，指針卡在那裡，怎麼撥都撥不動。靠近一點，能聽見它一直在數同一秒。' }],
  },
  'first-lantern': {
    trait: '它放初火時怕冰，換成初冰就怕火，換成初雷就怕物理。看它放哪一招，再決定誰出手。',
    lines: [{ text: '迷宮裡點起的第一盞燈，比後來的每一盞都小，也比每一盞都亮。靠近它的人，影子會被照得很淡。' }],
  },
  'toppled-automaton': {
    trait: '它倒下後會再站起來一次，最強的技能留到它站起來時再用。被雷打中的那一回合，它也不會修補自己。',
    lines: [
      { text: '倒在神殿深處的大機兵，倒下時還張著雙臂，像在擋住什麼。只要有人靠近，它就咔啦咔啦地爬起來。' },
      { text: '它胸口的記號，和波比那半張圖上畫的一模一樣。她說，想讓它好好睡一覺，不用再爬起來。', after: { seen: ['mem:bobby:4'] } },
    ],
  },
  'requiem-conductor': {
    trait: '它自己不替同伴回復，卻會叫來鎮魂歌隊，再揮棒讓大家都變快。它怕物理，在它叫齊歌隊之前打倒它。',
    lines: [
      { text: '指揮棒停在半空，整支歌隊都在等它落下。它其實也忘了，下一個音該是哪一個。' },
      { text: '艾斯特拉的鎮魂祭，每年都由它起拍。台下的人說，它揮棒的樣子，比歌聲還讓人想哭。', after: { seen: ['act4'] } },
    ],
  },
  'lantern-brood': {
    trait: '巢本身不打人，卻每回合孵出一隻燈喰幼體。人手夠就集中用冰打巢，人手不夠就先清幼體。',
    lines: [
      { text: '燈底下一團暖呼呼的殼，摸起來還會微微跳動。裡面一直有東西在敲，想早點出來找燈吃。' },
      { text: '這是燈喰之母留下的巢。殼上的紋路和母親背上的一樣，一圈一圈，像燈芯燒過的痕跡。', after: { seen: ['finale'] } },
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
