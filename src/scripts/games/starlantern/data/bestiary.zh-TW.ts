/**
 * The bestiary's words (roster plan Tasks C1, C5, C6; spec §7.2, §10): the two characters an inscribed piece is named
 * after, and (from C5) each roster foe's bestiary text and the page's own strings.
 */

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
