import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), packaged = process.env.PINWHEEL_PACKAGED_EXECUTABLE;
const run = path.join(root, 'test-results', 'session-long-line-' + Date.now()), notes = path.join(run, 'notes'); await fs.mkdir(notes, {recursive:true}); await fs.writeFile(path.join(notes,'长段落.md'),'# 长段落\n\n'+'自动换行的长段落，保留阅读位置。'.repeat(2200));
const options = { ...(packaged ? { executablePath: packaged } : {}), args: packaged ? [] : [root], env: { ...process.env, PINWHEEL_HEADLESS: '1', PINWHEEL_TEST_LOCALE: 'zh-CN',PINWHEEL_TEST_DATA:path.join(run,'data'),PINWHEEL_TEST_WORKSPACE:notes},timeout:60000 };
let app;
try {
  app=await electron.launch(options);let page=await app.firstWindow();await expect(page.locator('.rich-editor h1')).toHaveText('长段落');await page.getByRole('button',{name:'源码',exact:true}).click();await page.waitForTimeout(700);await page.locator('.cm-scroller').evaluate(el=>{el.scrollTop=3500;});await page.waitForTimeout(900);const top=await page.locator('.cm-scroller').evaluate(el=>el.scrollTop);expect(top).toBeGreaterThan(1500);
  await app.close();app=await electron.launch(options);page=await app.firstWindow();await expect(page.getByRole('button',{name:'源码',exact:true})).toHaveClass('selected');await expect.poll(()=>page.locator('.cm-scroller').evaluate((el,target)=>Math.abs(el.scrollTop-target),top)).toBeLessThanOrEqual(8);
  await fs.writeFile(path.join(run,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),top},null,2));console.log('Long wrapped line session checks passed:',run);
}catch(error){console.error(error);await fs.writeFile(path.join(run,'result.json'),JSON.stringify({passed:false,error:String(error)},null,2));process.exitCode=1;}finally{if(app)await app.close();}
