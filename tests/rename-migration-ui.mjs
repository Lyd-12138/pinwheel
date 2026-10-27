import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NotebookStore } from '../desktop/store.mjs';
const root=path.resolve('.'), run=path.join(root,'test-results/rename-migration-'+Date.now()), notes=path.join(run,'original-notes'), legacy=path.join(run,'moye-notes'), data=path.join(run,'pinwheel');
const store=await new NotebookStore(notes).init(); await store.create('原来的笔记','# 原来的笔记\n\n正文保持不变。'); await store.create('保密文档','# 秘密正文');
const before=await store.read('保密文档.md'),password='pinwheel-migration-2026';await store.encrypt(before.path,password,before.hash);store.lockAll();
await fs.mkdir(legacy,{recursive:true});const original=JSON.stringify({workspace:notes,theme:'aurora',alwaysOnTop:true,assetBindings:{[notes]:path.join(notes,'assets')},sessions:{[notes]:{lastPath:'原来的笔记.md',mode:'markdown',collapsed:[],views:{}}}});await fs.writeFile(path.join(legacy,'settings.json'),original);const encryptedBytes=await fs.readFile(path.join(notes,'保密文档.md'));
let app;const checks=[];
try{
 const executablePath=process.env.MOYE_PACKAGED_EXECUTABLE;app=await electron.launch({...(executablePath?{executablePath}:{}),args:executablePath?[]:[root],env:{...process.env,MOYE_HEADLESS:'1',MOYE_TEST_DATA:data,MOYE_TEST_WORKSPACE:'',MOYE_TEST_LEGACY_DATA:legacy,MOYE_TEST_LOCALE:'zh-CN'}});const page=await app.firstWindow();await expect(page.locator('.rich-editor h1')).toHaveText('原来的笔记');await expect(page).toHaveTitle('风车笔记');
 const prefs=await page.evaluate(()=>window.notebook.call('preferences'));expect(prefs.workspace).toBe(notes);expect(prefs.theme).toBe('aurora');expect(prefs.alwaysOnTop).toBe(true);checks.push('legacy workspace, current document, theme and window preference restored');
 const plain=await page.evaluate(password=>window.notebook.call('unlock',{path:'保密文档.md',password}),password);expect(plain.text).toBe('# 秘密正文');expect(await fs.readFile(path.join(notes,'保密文档.md'))).toEqual(encryptedBytes);checks.push('legacy encrypted document unlocks without changing stored ciphertext');
 expect(await fs.readFile(path.join(legacy,'settings.json'),'utf8')).toBe(original);expect(await fs.readFile(path.join(notes,'原来的笔记.md'),'utf8')).toBe('# 原来的笔记\n\n正文保持不变。');checks.push('original settings and notes preserved');
 await fs.writeFile(path.join(run,'result.json'),JSON.stringify({passed:true,packaged:!!executablePath,checks},null,2));console.log(run);
}catch(error){await fs.writeFile(path.join(run,'result.json'),JSON.stringify({passed:false,error:String(error),checks},null,2));throw error;}finally{if(app)await app.close();}
