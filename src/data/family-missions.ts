/**
 * 雙羽任務所的靜態內容都集中在這裡。
 *
 * 新增任務時：
 * 1. 在對應孩子的 tasks 陣列複製一個任務物件。
 * 2. 換成全站不重複的 id，並填入文案、主能力與獎勵。
 * 3. 重新執行靜態部署，頁面就會出現新任務。
 *
 * id 一旦上線請不要修改，否則裝置上既有的完成紀錄會認成新任務。
 */

export type AbilityId = 'language' | 'math' | 'english' | 'manners' | 'kindness' | 'responsibility';
export type ScoutId = 'apple' | 'amy';

export interface MissionTask {
  id: string;
  icon: string;
  title: string;
  story: string;
  description: string;
  abilityId: AbilityId;
  rewardStars: number;
  abilityXp: number;
  estimatedMinutes: string;
  difficulty: '輕鬆' | '小挑戰' | '大挑戰';
  skillTag: string;
}

export interface ScoutProfile {
  id: ScoutId;
  name: string;
  shortName: string;
  callSign: string;
  symbol: string;
  portrait: string;
  portraitAlt: string;
  theme: ScoutId;
  startingStars: number;
  greeting: string;
  story: string;
  baseAbilityXp: Record<AbilityId, number>;
  tasks: MissionTask[];
}

export const abilityCatalog = {
  language: {
    id: 'language',
    name: '國文',
    icon: '📚',
    color: '#f28779',
    softColor: '#fff0eb',
    description: '閱讀、表達與理解故事',
    growthNames: ['小書芽', '故事苗', '閱讀花', '文字樹'],
  },
  math: {
    id: 'math',
    name: '數學',
    icon: '🧩',
    color: '#5b9ee6',
    softColor: '#eaf5ff',
    description: '數數、觀察與解決問題',
    growthNames: ['數字芽', '規律苗', '解題花', '智慧樹'],
  },
  english: {
    id: 'english',
    name: '英文',
    icon: '🌎',
    color: '#8b72d9',
    softColor: '#f1edff',
    description: '聆聽、單字與勇敢開口',
    growthNames: ['聲音芽', '單字苗', '對話花', '世界樹'],
  },
  manners: {
    id: 'manners',
    name: '禮儀',
    icon: '🎀',
    color: '#d66b9b',
    softColor: '#fff0f7',
    description: '尊重、傾聽與禮貌表達',
    growthNames: ['禮貌芽', '傾聽苗', '尊重花', '優雅樹'],
  },
  kindness: {
    id: 'kindness',
    name: '友善',
    icon: '💛',
    color: '#d89a20',
    softColor: '#fff8da',
    description: '分享、關心與幫助別人',
    growthNames: ['暖心芽', '分享苗', '善意花', '愛心樹'],
  },
  responsibility: {
    id: 'responsibility',
    name: '責任',
    icon: '🎒',
    color: '#4b9f7c',
    softColor: '#eaf8f1',
    description: '自理、整理與完成約定',
    growthNames: ['自理芽', '整理苗', '可靠花', '責任樹'],
  },
} as const;

export const rankSteps = [
  { stars: 0, name: '小兵', symbol: '🌱', gift: '領取第一本任務手冊' },
  { stars: 30, name: '大兵', symbol: '🎒', gift: '解鎖自己的探險背包' },
  { stars: 80, name: '初級偵查兵', symbol: '🔎', gift: '解鎖星光放大鏡' },
  { stars: 150, name: '中級偵查兵', symbol: '🗺️', gift: '可以規劃一個家庭任務' },
  { stars: 240, name: '高級偵查兵', symbol: '🪶', gift: '獲得金色羽毛徽章' },
  { stars: 360, name: '星光領航員', symbol: '🌟', gift: '帶領一次家庭小冒險' },
] as const;

export const growthBadges = [
  { id: 'self-care', name: '自理小達人', icon: '🧺', unlockStars: 20, description: '會照顧自己的物品與日常需要' },
  { id: 'helper', name: '溫柔小幫手', icon: '🤲', unlockStars: 60, description: '看見別人需要時願意伸出手' },
  { id: 'reader', name: '故事探險家', icon: '📖', unlockStars: 100, description: '能讀完故事並分享自己的發現' },
  { id: 'brave-heart', name: '勇氣發光者', icon: '🦋', unlockStars: 180, description: '遇到新挑戰也願意試一小步' },
] as const;

export const scoutProfiles: Record<ScoutId, ScoutProfile> = {
  apple: {
    id: 'apple',
    name: '林芮羽 Apple',
    shortName: 'Apple',
    callSign: '星圖偵查員',
    symbol: '🍎',
    portrait: '/assets/img/family-missions/apple-scout.webp',
    portraitAlt: 'Apple 星圖偵查員的童書插畫',
    theme: 'apple',
    startingStars: 80,
    greeting: '今天也來完成一件厲害的小事吧！',
    story: 'Apple 擅長看懂線索，也開始學著照顧身邊的人。今天，她要替星光營地找回五顆散落在生活裡的任務星。',
    baseAbilityXp: {
      language: 36,
      math: 32,
      english: 25,
      manners: 31,
      kindness: 39,
      responsibility: 38,
    },
    tasks: [
      {
        id: 'apple-tidy',
        icon: '🎒',
        title: '整理自己的物品',
        story: '迷路的物品想回家',
        description: '把今天用過的書、玩具或衣物放回固定的位置。',
        abilityId: 'responsibility',
        rewardStars: 2,
        abilityXp: 6,
        estimatedMinutes: '5 分鐘',
        difficulty: '輕鬆',
        skillTag: '自理',
      },
      {
        id: 'apple-reading',
        icon: '📖',
        title: '小小閱讀偵探',
        story: '故事書裡藏著一條線索',
        description: '自己讀一小段故事，再說出最喜歡的角色或情節。',
        abilityId: 'language',
        rewardStars: 2,
        abilityXp: 6,
        estimatedMinutes: '10 分鐘',
        difficulty: '小挑戰',
        skillTag: '表達',
      },
      {
        id: 'apple-english-hunt',
        icon: '🔤',
        title: '英文尋寶任務',
        story: '找出藏在家裡的英文密碼',
        description: '找出三個看得到的英文單字，試著讀出來並說出意思。',
        abilityId: 'english',
        rewardStars: 2,
        abilityXp: 6,
        estimatedMinutes: '8 分鐘',
        difficulty: '小挑戰',
        skillTag: '觀察',
      },
      {
        id: 'apple-kindness',
        icon: '🤝',
        title: '家庭暖心小幫手',
        story: '營地需要一雙主動的手',
        description: '不用提醒，主動幫家人或妹妹完成一件小事。',
        abilityId: 'kindness',
        rewardStars: 3,
        abilityXp: 8,
        estimatedMinutes: '隨時',
        difficulty: '大挑戰',
        skillTag: '主動',
      },
      {
        id: 'apple-feelings',
        icon: '💬',
        title: '好好說出我的感受',
        story: '把心裡的雲變成一句話',
        description: '遇到開心或不開心的事，用完整的一句話告訴家人。',
        abilityId: 'manners',
        rewardStars: 2,
        abilityXp: 6,
        estimatedMinutes: '3 分鐘',
        difficulty: '小挑戰',
        skillTag: '溝通',
      },
    ],
  },
  amy: {
    id: 'amy',
    name: '林彥羽 Amy',
    shortName: 'Amy',
    callSign: '花園偵查員',
    symbol: '🌼',
    portrait: '/assets/img/family-missions/amy-scout.webp',
    portraitAlt: 'Amy 花園偵查員的童書插畫',
    theme: 'amy',
    startingStars: 0,
    greeting: '選一個任務，完成後回來蓋章！',
    story: 'Amy 帶著放大鏡尋找生活裡的小驚喜。每完成一件自己做得到的事，就會有一朵新的能力花慢慢長大。',
    baseAbilityXp: {
      language: 14,
      math: 17,
      english: 10,
      manners: 20,
      kindness: 22,
      responsibility: 16,
    },
    tasks: [
      {
        id: 'amy-toys',
        icon: '🧸',
        title: '玩具回家任務',
        story: '每個玩具都在找自己的家',
        description: '玩完以後，把玩具一個一個送回固定的位置。',
        abilityId: 'responsibility',
        rewardStars: 2,
        abilityXp: 7,
        estimatedMinutes: '5 分鐘',
        difficulty: '輕鬆',
        skillTag: '自理',
      },
      {
        id: 'amy-counting',
        icon: '🔢',
        title: '尋找數字小隊',
        story: '放大鏡發現了一群數字',
        description: '找一種喜歡的東西，指著它們慢慢數到十。',
        abilityId: 'math',
        rewardStars: 2,
        abilityXp: 7,
        estimatedMinutes: '5 分鐘',
        difficulty: '輕鬆',
        skillTag: '數數',
      },
      {
        id: 'amy-english-ears',
        icon: '🎵',
        title: '英文小耳朵',
        story: '聽見一個來自遠方的聲音',
        description: '聽一首英文歌，跟著說出或唱出一個聽見的單字。',
        abilityId: 'english',
        rewardStars: 2,
        abilityXp: 7,
        estimatedMinutes: '5 分鐘',
        difficulty: '小挑戰',
        skillTag: '聆聽',
      },
      {
        id: 'amy-manners',
        icon: '🎀',
        title: '魔法禮貌語',
        story: '有三句話能打開禮貌之門',
        description: '今天主動說一次「請、謝謝或對不起」。',
        abilityId: 'manners',
        rewardStars: 2,
        abilityXp: 7,
        estimatedMinutes: '隨時',
        difficulty: '輕鬆',
        skillTag: '禮貌',
      },
      {
        id: 'amy-sharing',
        icon: '💛',
        title: '分享一點點',
        story: '兩個人一起玩，快樂會變大',
        description: '和姊姊或家人分享一樣東西，或輪流玩一次。',
        abilityId: 'kindness',
        rewardStars: 3,
        abilityXp: 8,
        estimatedMinutes: '隨時',
        difficulty: '大挑戰',
        skillTag: '分享',
      },
    ],
  },
};

