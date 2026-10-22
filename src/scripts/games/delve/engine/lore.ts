// lore.ts — 古碑碑文：關於「燈脈人」（遠古礦工）往地底尋找心火的故事。全部原創。
// id 即陣列索引（存檔裡存的是 id）。worldgen 依主題把每一篇放到對應的地點（見 LORE_SITES）。

export interface LoreEntry { title: string; text: string; }

export const LORE: readonly LoreEntry[] = [
  { title: '第一盞燈', text: '我們是燈脈人。祖先說，地底有一顆不會熄的心火，誰挖到它，誰就不再怕黑。於是我們拿起鎬，一代一代往下。' },
  { title: '礦工守則', text: '一、火把要比鎬先進洞。二、聽見石頭在唱歌就停手。三、別在裂紋石後面藏太多東西——遲早有人會敲開它。' },
  { title: '銅與鐵', text: '銅是孩子的金屬，柔軟、溫順。鐵是大人的金屬，冷而誠實。至於金子……金子只會讓人往更深的地方走。' },
  { title: '晶洞之歌', text: '水晶在最安靜的地方生長。我們在那裡低聲說話，回聲會在晶面上停留很久，像是石頭替我們記住了什麼。' },
  { title: '藍色的路', text: '螢光菇不需要太陽。老人說它們吃的是黑暗本身。我們跟著藍光走，從來沒有在菇林裡迷路過。' },
  { title: '離地的山', text: '長老唱起晶石之歌，整塊山岩就離開了地面。我們在雲上蓋了小屋，存放那些不想被地底記得的東西。' },
  { title: '磚之城', text: '我們用燒過的磚築起地下城，把鑰匙藏在沒有上鎖的房間裡——鎖是給貪心的人看的，鑰匙是給有耐心的人找的。' },
  { title: '守門人', text: '守門人一輩子只做一件事：記住哪扇門通往哪裡。他走了以後，我們把他的鐵鍊掛在牢房裡，好讓那些門不會寂寞。' },
  { title: '會流汗的石頭', text: '越往下，石頭越暖。到了最後一層，岩石會發光、會流汗。我們在那裡第一次聽見心火的脈搏。' },
  { title: '斷樑', text: '第七坑道塌了。我們沒有把木樑修好，只在入口留下一支火把，給還沒回來的人照路。' },
  { title: '冰下之冰', text: '雪原底下是冰，冰底下還是冰。冷到連鎬都會哭。可是冰洞裡的回聲最乾淨，最適合練習晶石之歌。' },
  { title: '沙之淚', text: '沙漠底下的砂岩像一滴往下流的淚。我們在淚裡挖出細長的通道，說那是大地哭過的痕跡。' },
  { title: '深處的鏡子', text: '我們挖到了心火，才發現它只是一面很深很深的鏡子。鏡子裡是我們自己：拿著鎬，站在最開始的那片草地上。' },
  { title: '給後來的人', text: '如果你讀到這塊碑，代表你和我們一樣不怕往下走。帶上繩索，帶上床，記得回家的路。地底還有很多名字等你去發現。' },
];

/** 每篇碑文的主題地點（worldgen 依此擺放；找不到該地點時退回任一大洞窟的地板） */
export type LoreSite = 'spawn' | 'secret' | 'cabin' | 'crystal' | 'mushroom' | 'sky' | 'dungeon_tower' | 'dungeon_shrine'
  | 'molten' | 'mineshaft' | 'snow' | 'desert' | 'dungeon_treasure' | 'ruin';
export const LORE_SITES: readonly LoreSite[] = [
  'spawn', 'secret', 'cabin', 'crystal', 'mushroom', 'sky', 'dungeon_tower', 'dungeon_shrine',
  'molten', 'mineshaft', 'snow', 'desert', 'dungeon_treasure', 'ruin',
];

export function loreEntry(id: number): LoreEntry {
  return LORE[((id % LORE.length) + LORE.length) % LORE.length];
}
