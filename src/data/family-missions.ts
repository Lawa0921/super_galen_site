/**
 * 雙羽任務所的靜態內容都集中在這裡。
 *
 * 新增任務時：
 * 1. 在對應孩子的 tasks 陣列複製一個任務物件。
 * 2. 換成全站不重複的 id，填入文案、三步任務口訣與一項或多項能力。
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
  /** 給孩子看的三步任務口訣；維持短句，方便在任務卡上逐步揭曉。 */
  steps: readonly [string, string, string];
  /** 任務可以同時鍛鍊一項或多項能力；完成後每項能力各加一顆能力星。 */
  abilityIds: AbilityId[];
  estimatedMinutes: string;
  difficulty: '輕鬆' | '小挑戰' | '大挑戰';
  skillTag: string;
  /** 主線影響每日榮譽星；自由挑戰只給收藏與能力成長。 */
  kind: 'main' | 'free';
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
  /** 每顆能力星前進一小步，21 顆走完「萌芽」到「閃耀」七階段。 */
  baseAbilityStars: Record<AbilityId, number>;
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

/**
 * 能力階級共有 7 個兒童可理解的階段，每階 3 個小步。
 * 每完成一項涉及該能力的任務，就增加 1 顆能力星並前進一段。
 */
export const abilityStages = ['萌芽', '練習', '熟悉', '穩定', '熟練', '自主', '閃耀'] as const;
export const abilityGrades = abilityStages.flatMap((stage) => [
  `${stage} 1`,
  `${stage} 2`,
  `${stage} 3`,
]) as readonly string[];

type RankSeed = readonly [name: string, gift: string];

const rankChapterSeeds: ReadonlyArray<{
  id: string;
  name: string;
  subtitle: string;
  symbol: string;
  ranks: readonly RankSeed[];
}> = [
  {
    id: 'rookie-camp', name: '新兵啟程', subtitle: '先學會照顧自己，也勇敢接受小任務', symbol: '🌱',
    ranks: [
      ['小兵', '領取自己的任務手冊'],
      ['大兵', '解鎖個人任務徽章'],
      ['初級偵查兵', '可以自己選一項每日任務'],
      ['中級偵查兵', '能準備自己的小裝備'],
      ['高級偵查兵', '能規劃一件家庭小任務'],
    ],
  },
  {
    id: 'forest-path', name: '森林探路', subtitle: '觀察環境、找到方法，再把事情做完', symbol: '🧭',
    ranks: [
      ['初級探路兵', '練習發現生活裡的小線索'],
      ['中級探路兵', '能照步驟完成兩件小事'],
      ['高級探路兵', '出發前會自己檢查物品'],
      ['菁英探路兵', '遇到問題會換一個方法'],
      ['森林探路隊長', '能帶家人完成一次尋寶任務'],
    ],
  },
  {
    id: 'puzzle-library', name: '知識解謎', subtitle: '用閱讀、數字和語言解開生活謎題', symbol: '📚',
    ranks: [
      ['初級解謎兵', '願意開口問一個好問題'],
      ['中級解謎兵', '能說出自己找到的答案'],
      ['高級解謎兵', '會把大問題分成小步驟'],
      ['菁英解謎兵', '能比較兩種不同的方法'],
      ['星光解謎隊長', '可以設計一道題目給家人'],
    ],
  },
  {
    id: 'kindness-garden', name: '溫暖守護', subtitle: '懂得禮貌、分享，也看見別人的感受', symbol: '💛',
    ranks: [
      ['初級守護兵', '記得使用請、謝謝與對不起'],
      ['中級守護兵', '願意輪流、分享與等待'],
      ['高級守護兵', '能好好說出自己的感受'],
      ['菁英守護兵', '主動發現別人需要幫忙'],
      ['暖心守護隊長', '能化解一次小小的爭執'],
    ],
  },
  {
    id: 'brave-expedition', name: '勇氣遠征', subtitle: '面對新挑戰，試著多走勇敢的一步', symbol: '🦋',
    ranks: [
      ['初級遠征兵', '願意試一次不熟悉的小事'],
      ['中級遠征兵', '做錯時願意再試一次'],
      ['高級遠征兵', '能完成需要耐心的挑戰'],
      ['菁英遠征兵', '遇到害怕會說出需要什麼'],
      ['勇氣遠征隊長', '能鼓勵家人一起挑戰'],
    ],
  },
  {
    id: 'independent-base', name: '自主管理', subtitle: '安排自己的事情，對約定負責', symbol: '🎒',
    ranks: [
      ['初級自主兵', '能自己完成固定的生活工作'],
      ['中級自主兵', '會記得今天答應的事情'],
      ['高級自主兵', '能先做完再安心玩耍'],
      ['菁英自主兵', '會自己檢查任務是否完成'],
      ['自主行動隊長', '能安排一段自己的任務時間'],
    ],
  },
  {
    id: 'star-map', name: '星圖規劃', subtitle: '學著判斷先後順序，為目標做準備', symbol: '🗺️',
    ranks: [
      ['初級星圖兵', '能說出任務的第一步'],
      ['中級星圖兵', '能排出三件事的先後順序'],
      ['高級星圖兵', '會先準備需要的工具'],
      ['菁英星圖兵', '知道何時需要請人幫忙'],
      ['星圖規劃隊長', '能規劃半天的家庭小行程'],
    ],
  },
  {
    id: 'team-camp', name: '團隊協作', subtitle: '一起討論、分工，也完成共同目標', symbol: '🤝',
    ranks: [
      ['初級協作兵', '能聽完別人的想法'],
      ['中級協作兵', '願意接受公平的分工'],
      ['高級協作兵', '完成自己負責的部分'],
      ['菁英協作兵', '夥伴卡住時願意幫忙'],
      ['星光協作隊長', '能帶領一次家庭合作任務'],
    ],
  },
  {
    id: 'dawn-guide', name: '晨光領航', subtitle: '不只照顧自己，也能帶給身邊的人力量', symbol: '🌤️',
    ranks: [
      ['初級領航員', '能示範一件自己擅長的事'],
      ['中級領航員', '會用溫柔方式提醒別人'],
      ['高級領航員', '能照顧比自己小的夥伴'],
      ['菁英領航員', '遇到變化也能重新安排'],
      ['晨光領航隊長', '能帶大家完成一日小目標'],
    ],
  },
  {
    id: 'twinwing-legend', name: '雙羽傳奇', subtitle: '把成熟、知識與溫暖變成真正的影響力', symbol: '🌟',
    ranks: [
      ['初級星光領航員', '建立自己的長期成長目標'],
      ['中級星光領航員', '能主動追蹤目標進度'],
      ['高級星光領航員', '遇到困難會調整而不放棄'],
      ['榮耀星光領航員', '完成一項值得紀念的大挑戰'],
      ['雙羽星光總隊長', '完成 500 星成長路徑'],
    ],
  },
] as const;

export const rankChapters = rankChapterSeeds.map((chapter, chapterIndex) => ({
  ...chapter,
  startStars: chapterIndex * 50 + 10,
  endStars: (chapterIndex + 1) * 50,
  ranks: chapter.ranks.map(([name, gift], rankIndex) => ({
    level: chapterIndex * 5 + rankIndex + 1,
    stars: (chapterIndex * 5 + rankIndex + 1) * 10,
    name,
    gift,
    symbol: chapter.symbol,
    chapterId: chapter.id,
  })),
}));

export const rankSteps = rankChapters.flatMap((chapter) => chapter.ranks);

export const growthBadges = [
  { id: 'self-care', name: '自理小達人', icon: '🧺', unlockStars: 50, description: '完成新兵啟程，會照顧自己的物品與日常需要' },
  { id: 'pathfinder', name: '森林探路家', icon: '🧭', unlockStars: 100, description: '完成森林探路，懂得觀察、準備與找方法' },
  { id: 'puzzle', name: '故事解謎家', icon: '📖', unlockStars: 150, description: '完成知識解謎，能用學到的事解決問題' },
  { id: 'helper', name: '溫柔守護者', icon: '🤲', unlockStars: 200, description: '完成溫暖守護，願意分享並關心別人的感受' },
  { id: 'brave-heart', name: '勇氣發光者', icon: '🦋', unlockStars: 250, description: '完成勇氣遠征，遇到新挑戰也願意試一小步' },
  { id: 'independent', name: '自主行動家', icon: '🎒', unlockStars: 300, description: '完成自主管理，能安排事情並對約定負責' },
  { id: 'planner', name: '星圖規劃家', icon: '🗺️', unlockStars: 350, description: '完成星圖規劃，能替目標準備與安排步驟' },
  { id: 'teammate', name: '最佳小隊友', icon: '🤝', unlockStars: 400, description: '完成團隊協作，懂得討論、分工與互相幫忙' },
  { id: 'guide', name: '晨光領航員', icon: '🌤️', unlockStars: 450, description: '完成晨光領航，能照顧夥伴並帶來好影響' },
  { id: 'legend', name: '雙羽星光傳奇', icon: '🌟', unlockStars: 500, description: '走完全程 500 星，成為雙羽星光總隊長' },
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
    startingStars: 39,
    greeting: '今天也來完成一件厲害的小事吧！',
    story: 'Apple 擅長看懂線索，也開始學著照顧身邊的人。今天，她要替星光營地找回五顆散落在生活裡的任務星。',
    baseAbilityStars: {
      language: 8,
      math: 7,
      english: 5,
      manners: 7,
      kindness: 8,
      responsibility: 8,
    },
    tasks: [
      {
        id: 'apple-tidy',
        icon: '🎒',
        title: '整理自己的物品',
        story: '迷路的物品想回家',
        description: '把今天用過的書、玩具或衣物放回固定的位置。',
        steps: ['先找出三樣沒回家的物品', '一樣一樣放回固定位置', '回頭檢查桌面和地板'],
        abilityIds: ['responsibility'],
        estimatedMinutes: '5 分鐘',
        difficulty: '輕鬆',
        skillTag: '自理',
        kind: 'main',
      },
      {
        id: 'apple-reading',
        icon: '📖',
        title: '小小閱讀偵探',
        story: '故事書裡藏著一條線索',
        description: '自己讀一小段故事，再說出最喜歡的角色或情節。',
        steps: ['挑一本今天想探索的書', '慢慢讀完一小段', '說出最喜歡的角色和原因'],
        abilityIds: ['language', 'responsibility'],
        estimatedMinutes: '10 分鐘',
        difficulty: '小挑戰',
        skillTag: '表達',
        kind: 'main',
      },
      {
        id: 'apple-english-hunt',
        icon: '🔤',
        title: '英文尋寶任務',
        story: '找出藏在家裡的英文密碼',
        description: '找出三個看得到的英文單字，試著讀出來並說出意思。',
        steps: ['張大眼睛找英文字樣', '選三個單字讀出來', '猜猜看它們代表什麼'],
        abilityIds: ['english', 'responsibility'],
        estimatedMinutes: '8 分鐘',
        difficulty: '小挑戰',
        skillTag: '觀察',
        kind: 'main',
      },
      {
        id: 'apple-kindness',
        icon: '🤝',
        title: '家庭暖心小幫手',
        story: '營地需要一雙主動的手',
        description: '不用提醒，主動幫家人或妹妹完成一件小事。',
        steps: ['先觀察誰正需要幫忙', '問一句「我可以幫什麼？」', '完成後送上一個笑容'],
        abilityIds: ['kindness', 'responsibility'],
        estimatedMinutes: '隨時',
        difficulty: '大挑戰',
        skillTag: '主動',
        kind: 'free',
      },
      {
        id: 'apple-feelings',
        icon: '💬',
        title: '好好說出我的感受',
        story: '把心裡的雲變成一句話',
        description: '遇到開心或不開心的事，用完整的一句話告訴家人。',
        steps: ['先停一下感覺心裡的天氣', '用「我覺得……」開頭', '再說「我希望……」'],
        abilityIds: ['language', 'manners', 'kindness'],
        estimatedMinutes: '3 分鐘',
        difficulty: '小挑戰',
        skillTag: '溝通',
        kind: 'free',
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
    startingStars: 11,
    greeting: '選一個任務，完成後回來蓋章！',
    story: 'Amy 帶著放大鏡尋找生活裡的小驚喜。每完成一件自己做得到的事，就會有一朵新的能力花慢慢長大。',
    baseAbilityStars: {
      language: 4,
      math: 5,
      english: 3,
      manners: 4,
      kindness: 5,
      responsibility: 4,
    },
    tasks: [
      {
        id: 'amy-toys',
        icon: '🧸',
        title: '玩具回家任務',
        story: '每個玩具都在找自己的家',
        description: '玩完以後，把玩具一個一個送回固定的位置。',
        steps: ['先找到玩具的家', '一次拿一個慢慢收', '最後數三下完成檢查'],
        abilityIds: ['responsibility'],
        estimatedMinutes: '5 分鐘',
        difficulty: '輕鬆',
        skillTag: '自理',
        kind: 'main',
      },
      {
        id: 'amy-counting',
        icon: '🔢',
        title: '尋找數字小隊',
        story: '放大鏡發現了一群數字',
        description: '找一種喜歡的東西，指著它們慢慢數到十。',
        steps: ['挑一種想數的東西', '手指一個就數一個', '數完再說一次總數'],
        abilityIds: ['math', 'responsibility'],
        estimatedMinutes: '5 分鐘',
        difficulty: '輕鬆',
        skillTag: '數數',
        kind: 'main',
      },
      {
        id: 'amy-english-ears',
        icon: '🎵',
        title: '英文小耳朵',
        story: '聽見一個來自遠方的聲音',
        description: '聽一首英文歌，跟著說出或唱出一個聽見的單字。',
        steps: ['挑一首喜歡的英文歌', '聽到熟悉的聲音就指出來', '跟著唱出一個單字'],
        abilityIds: ['english', 'language'],
        estimatedMinutes: '5 分鐘',
        difficulty: '小挑戰',
        skillTag: '聆聽',
        kind: 'main',
      },
      {
        id: 'amy-manners',
        icon: '🎀',
        title: '魔法禮貌語',
        story: '有三句話能打開禮貌之門',
        description: '今天主動說一次「請、謝謝或對不起」。',
        steps: ['看見需要幫忙時說「請」', '收到幫忙後說「謝謝」', '不小心時勇敢說「對不起」'],
        abilityIds: ['manners', 'kindness'],
        estimatedMinutes: '隨時',
        difficulty: '輕鬆',
        skillTag: '禮貌',
        kind: 'free',
      },
      {
        id: 'amy-sharing',
        icon: '💛',
        title: '分享一點點',
        story: '兩個人一起玩，快樂會變大',
        description: '和姊姊或家人分享一樣東西，或輪流玩一次。',
        steps: ['挑一樣願意分享的東西', '問對方想不想一起玩', '輪流時等對方完成再接手'],
        abilityIds: ['kindness', 'manners'],
        estimatedMinutes: '隨時',
        difficulty: '大挑戰',
        skillTag: '分享',
        kind: 'free',
      },
    ],
  },
};
