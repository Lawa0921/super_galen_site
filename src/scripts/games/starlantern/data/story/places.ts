// The location cards (story staging S6), moved out of data/story.zh-TW.ts (bond plan ruling 7) so the bond's text can
// use them too: a leaf module, types only in, no script. data/story.zh-TW.ts re-exports `Place`, `NIGHT_PLACE` and
// `DAWN_PLACE` as before. A new card (the bond's night walk, say) goes in this one table.

/** The published town pictures a place can stand on (render/artPaths `art.scene`): the town's streets and its facilities. */
export type Backdrop = 'town' | 'guild' | 'shop' | 'inn' | 'gate' | 'forge';
/**
 * A scene's location card (story staging S6). Review of bond plan Task 22: `backdrop`, the published picture the place stands
 * on; `at`, the facility whose own hall it is (its keeper stands there). A bond scene opened from a facility plays over its
 * place's picture, the facility's keeper away unless the place is her hall (ui2/story `stagingOf`).
 */
export interface Place { text: string; night?: true; backdrop?: Backdrop; at?: Exclude<Backdrop, 'town'> }

/**
 * The location cards (story staging S6), each where the scene's own narration names the place. Night dims the screen: the
 * deep nights and the dark before dawn.
 */
export const PL = {
  plazaPredawn: { text: '傳送門廣場・黎明前' }, plaza: { text: '傳送門廣場' }, plazaNight: { text: '傳送門廣場・夜', night: true },
  plazaDeepNight: { text: '傳送門廣場・深夜', night: true }, plazaBeforeDawn: { text: '傳送門廣場・天亮前', night: true },
  plazaMorning: { text: '傳送門廣場・清晨', backdrop: 'gate' },
  guild: { text: '冒險者公會', backdrop: 'guild', at: 'guild' }, guildCellar: { text: '冒險者公會・地下室' }, guildClosed: { text: '冒險者公會・打烊以後' },
  inn: { text: '月影旅館', backdrop: 'inn', at: 'inn' }, innNight: { text: '月影旅館・夜', night: true }, innDeepNight: { text: '月影旅館・深夜', night: true },
  innDawn: { text: '月影旅館・清晨' }, innBeforeDawn: { text: '月影旅館・天亮前', night: true }, innDinner: { text: '月影旅館・晚飯' },
  innKitchen: { text: '月影旅館・廚房', backdrop: 'inn' }, innYard: { text: '月影旅館・後院', backdrop: 'inn' }, innDoor: { text: '月影旅館・門口' },
  innRoof: { text: '月影旅館屋頂・深夜', night: true }, innHall: { text: '旅館走廊・夜', night: true },
  innRoofDay: { text: '月影旅館屋頂', backdrop: 'inn' }, shrine: { text: '鎮邊小祠', backdrop: 'town' },   // bond plan Task 17: a bond scene by day
  innLot: { text: '旅館旁的空地', backdrop: 'town' },   // bond plan Task 18: Sylvie's sapling
  nightWalk: { text: '鎮上的夜路', night: true, backdrop: 'town' },   // bond plan Tasks 20-21: the night walk (lore ledger I-205), no moon in its words
  roofNight: { text: '屋頂・夜', night: true },
  shopClosed: { text: '道具店・打烊以後' }, shopEvening: { text: '道具店・傍晚', backdrop: 'shop' }, forge: { text: '鍛造屋', backdrop: 'forge', at: 'forge' }, forgeDoor: { text: '鍛造屋門口' },
  edgeMorning: { text: '鎮邊・清晨', backdrop: 'town' }, shrineSpringNight: { text: '鎮邊小祠・春祭之夜', night: true }, squareDusk: { text: '廣場・黃昏', backdrop: 'town' }, square: { text: '廣場', backdrop: 'town' }, festival: { text: '廣場・星燈祭之夜', night: true },   // no backdrop: the festival (epilogue) is frozen (frozenScenes.test.ts)
  depth16: { text: '本道第十六層' }, depth30: { text: '第三十層・燈前' }, lampBase: { text: '星燈之底' },
} satisfies Record<string, Place>;
