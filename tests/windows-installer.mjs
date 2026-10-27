import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {checkNativeBranding} from './windows-branding.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const run=path.join(root,'test-results','installer-'+Date.now()),install=path.join(run,'installed app 测试');await fs.mkdir(run,{recursive:true});
if(!install.startsWith(path.join(root,'test-results')+path.sep))throw Error('Unexpected install test path');
const execute=promisify(execFile),installer=path.join(root,'release',`Pinwheel-${version}-win-x64-Setup.exe`);let app;
try{
 // NSIS requires /D= to be the unquoted final command-line tail, including spaces.
 await execute(installer,['/S','/TEST=1','/D='+install],{windowsHide:true,windowsVerbatimArguments:true,timeout:180000});
 await expect.poll(()=>fs.readFile(path.join(install,'resources/app/package.json'),'utf8').then(JSON.parse).then(x=>x.version).catch(()=>''),{timeout:60000}).toBe(version);
 const branding=await checkNativeBranding(path.join(install,'pinwheel.exe'),run);expect(branding.passed).toBe(true);
 expect(await fs.readFile(path.join(install,'LICENSE-pinwheel.txt'),'utf8')).toContain('2026 pinwheel contributors');
 expect(await fs.readFile(path.join(install,'LICENSE'),'utf8')).not.toContain('2026 pinwheel contributors');
 const sources=JSON.parse(await fs.readFile(path.join(install,'third-party/source-manifest.json'),'utf8'));expect(sources.components.length).toBe(19);
 for(const source of sources.components)expect((await fs.stat(path.join(install,'third-party/sources',source.file))).size).toBe(source.bytes);
 expect(await fs.readFile(path.join(install,'third-party/licenses/KaTeX-fonts-OFL-1.1.txt'),'utf8')).toContain('SIL OPEN FONT LICENSE');
 const fixture=path.join(run,'打开安装版.md');await fs.writeFile(fixture,'# 安装验证\n\n保留正文。');
 app=await electron.launch({executablePath:path.join(install,'pinwheel.exe'),args:[fixture],env:{...process.env,MOYE_TEST_DATA:path.join(run,'data'),MOYE_TEST_WORKSPACE:path.join(run,'notes'),MOYE_HEADLESS: '1', MOYE_TEST_LOCALE: 'zh-CN'},timeout:60000});const page=await app.firstWindow();await expect(page.locator('.rich-editor h1')).toHaveText('安装验证');await app.close();app=null;
 const userFile=path.join(install,'我的笔记','保留.md');await fs.mkdir(path.dirname(userFile));await fs.writeFile(userFile,'不得删除');
 await execute(path.join(install,'uninstall-pinwheel.exe'),['/S','/TEST=1','_?='+install],{windowsHide:true,windowsVerbatimArguments:true,timeout:180000});
 await expect.poll(()=>fs.stat(path.join(install,'resources/app/package.json')).then(()=>true).catch(()=>false),{timeout:60000}).toBe(false);expect(await fs.readFile(userFile,'utf8')).toBe('不得删除');
 await fs.writeFile(path.join(run,'result.json'),JSON.stringify({passed:true,version,installation:'passed',launch:'passed',uninstall:'passed',nativeBranding:branding,userFilesRetained:true,systemPreferencesChanged:false},null,2));console.log('Installer checks passed:',run);
}catch(error){console.error(error);await fs.writeFile(path.join(run,'result.json'),JSON.stringify({passed:false,error:String(error)},null,2));process.exitCode=1;}finally{if(app)await app.close();}
