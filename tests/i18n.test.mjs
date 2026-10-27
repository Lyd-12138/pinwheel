import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {resolveLanguage,setLanguage,t,brandName,validLanguagePreference} from '../shared/i18n.mjs';
import {migrateLegacyData} from '../desktop/migration.mjs';
test('language follows supported system language and otherwise falls back to English',()=>{
 for(const value of ['zh-CN','zh_Hans_CN','zh-Hans','zh-SG','zh'])assert.equal(resolveLanguage('system',value),'zh-CN');
 for(const value of ['en-US','fr-FR','ja-JP','zh-TW','zh-Hant','ar','',null])assert.equal(resolveLanguage('system',value),'en');
 assert.equal(resolveLanguage('system',['fr-FR','zh-CN']),'en');assert.equal(resolveLanguage('zh-CN','fr-FR'),'zh-CN');assert.equal(resolveLanguage('en','zh-CN'),'en');assert.equal(validLanguagePreference('fr'),false);
});
test('catalog switches brand and preserves user content inside dynamic messages',()=>{
 setLanguage('en');assert.equal(brandName(),'pinwheel');assert.equal(t('设置'),'Settings');assert.equal(t('已读取 336 个本机字体。'),'Read  336  system fonts.');assert.equal(t('无法收集依赖：学习笔记.md'),'Could not collect a dependency: 学习笔记.md');
 setLanguage('zh-CN');assert.equal(brandName(),'风车笔记');assert.equal(t('设置'),'设置');setLanguage('en');
});
test('legacy migration copies settings and pet assets without changing old data or notebook paths',async()=>{
 const run=path.resolve('test-results/migration-'+Date.now()),legacy=path.join(run,'moye-notes'),dest=path.join(run,'pinwheel');await fs.mkdir(path.join(legacy,'pets'),{recursive:true});const original=JSON.stringify({workspace:'D:/OldNotes',assetBindings:{'D:/OldNotes':'D:/OldAssets'},theme:'aurora',alwaysOnTop:true});await fs.writeFile(path.join(legacy,'settings.json'),original);await fs.writeFile(path.join(legacy,'pets/a.png'),'fixture');
 assert.equal(await migrateLegacyData(dest,[legacy]),legacy);assert.equal(await fs.readFile(path.join(dest,'settings.json'),'utf8'),original);assert.equal(await fs.readFile(path.join(legacy,'settings.json'),'utf8'),original);assert.equal(await fs.readFile(path.join(dest,'pets/a.png'),'utf8'),'fixture');
 await fs.writeFile(path.join(dest,'settings.json'),'{}');assert.equal(await migrateLegacyData(dest,[legacy]),null);assert.equal(await fs.readFile(path.join(dest,'settings.json'),'utf8'),'{}');
});
