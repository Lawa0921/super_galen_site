// The location cards (story staging S6), moved out of data/story.zh-TW.ts (bond plan ruling 7) so the bond's text can
// use them too: a leaf module, types only in, no script. data/story.zh-TW.ts re-exports `Place`, `NIGHT_PLACE` and
// `DAWN_PLACE` as before. A new card (the bond's night walk, say) goes in this one table.

/** A scene's location card (story staging S6). */
export interface Place { text: string; night?: true }

/**
 * The location cards (story staging S6), each where the scene's own narration names the place. Night dims the screen: the
 * deep nights and the dark before dawn.
 */
export const PL = {
  plazaPredawn: { text: '傳送門廣場・黎明前' }, plaza: { text: '傳送門廣場' }, plazaNight: { text: '傳送門廣場・夜', night: true },
  plazaDeepNight: { text: '傳送門廣場・深夜', night: true }, plazaBeforeDawn: { text: '傳送門廣場・天亮前', night: true },
  plazaMorning: { text: '傳送門廣場・清晨' },
  guild: { text: '冒險者公會' }, guildCellar: { text: '冒險者公會・地下室' }, guildClosed: { text: '冒險者公會・打烊以後' },
  inn: { text: '月影旅館' }, innNight: { text: '月影旅館・夜', night: true }, innDeepNight: { text: '月影旅館・深夜', night: true },
  innDawn: { text: '月影旅館・清晨' }, innBeforeDawn: { text: '月影旅館・天亮前', night: true }, innDinner: { text: '月影旅館・晚飯' },
  innKitchen: { text: '月影旅館・廚房' }, innYard: { text: '月影旅館・後院' }, innDoor: { text: '月影旅館・門口' },
  innRoof: { text: '月影旅館屋頂・深夜', night: true }, innHall: { text: '旅館走廊・夜', night: true },
  roofNight: { text: '屋頂・夜', night: true },
  shopClosed: { text: '道具店・打烊以後' }, shopEvening: { text: '道具店・傍晚' }, forge: { text: '鍛造屋' }, forgeDoor: { text: '鍛造屋門口' },
  edgeMorning: { text: '鎮邊・清晨' }, shrineSpringNight: { text: '鎮邊小祠・春祭之夜', night: true }, squareDusk: { text: '廣場・黃昏' }, square: { text: '廣場' }, festival: { text: '廣場・星燈祭之夜', night: true },
  depth16: { text: '本道第十六層' }, depth30: { text: '第三十層・燈前' }, lampBase: { text: '星燈之底' },
} satisfies Record<string, Place>;
