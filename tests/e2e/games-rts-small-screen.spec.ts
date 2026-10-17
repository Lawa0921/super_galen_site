import {test,expect} from '@playwright/test';

// The first RTS release supports desktop mouse/keyboard play. Mobile browsers
// must retain the small-screen explanation and a working route back to games.
test('small screens explain desktop controls and return to the arcade',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/games/rts');
  await expect(page.getByText('請使用桌上型電腦與滑鼠鍵盤')).toBeVisible();
  await expect(page.getByRole('button',{name:'開始戰役'})).not.toBeVisible();
  await page.getByRole('link',{name:'返回遊戲廳',exact:true}).click();
  await expect(page).toHaveURL(/\/games\/?$/);
  await expect(page.getByText('DUNGEON ARCADE')).toBeVisible();
});
