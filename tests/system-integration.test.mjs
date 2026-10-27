import {test} from 'node:test';
import assert from 'node:assert/strict';
import {systemIntegration} from '../desktop/system-integration.mjs';
test('login items use identical executable/arguments and can be disabled without changing other settings',()=>{
 const writes=[],reads=[];let enabled=false;const app={isPackaged:true,getLoginItemSettings:o=>{reads.push(o);return{openAtLogin:enabled}},setLoginItemSettings:o=>{writes.push(o);enabled=o.openAtLogin}};
 const system=systemIntegration(app,{}, {platform:'win32',executable:'C:\\Apps\\pinwheel.exe'});assert.equal(system.get().openAtLogin,false);assert.equal(system.setLogin(true).openAtLogin,true);assert.equal(system.setLogin(false).openAtLogin,false);assert.deepEqual(writes.map(x=>x.args),[['--login'],['--login']]);assert.ok(reads.every(x=>x.path==='C:\\Apps\\pinwheel.exe'));assert.equal(writes[1].name,'Pinwheel');
 assert.throws(()=>system.setLogin('true'));assert.throws(()=>systemIntegration({...app,isPackaged:false},{},{platform:'win32'}).setLogin(true),/安装/);
});
test('Windows file association registers OpenWith candidates without overriding UserChoice',async()=>{
 const calls=[],urls=[];const system=systemIntegration({isPackaged:true},{openExternal:async url=>urls.push(url)},{platform:'win32',executable:'C:\\App With Spaces\\pinwheel.exe',run:async(file,args)=>calls.push({file,args})});await system.associate();
 assert.ok(calls.some(x=>x.args.includes('HKCU\\Software\\Classes\\.md\\OpenWithProgids')));assert.ok(calls.some(x=>x.args.includes('"C:\\App With Spaces\\pinwheel.exe" "%1"')));assert.ok(calls.every(x=>!JSON.stringify(x).includes('UserChoice')));assert.deepEqual(urls,['ms-settings:defaultapps']);
 assert.ok(calls.some(x=>x.args.includes('FriendlyAppName')&&x.args.includes('@C:\\App With Spaces\\pinwheel.exe,-56001')));assert.ok(calls.some(x=>x.args.includes('HKCU\\Software\\Classes\\Applications\\pinwheel.exe\\SupportedTypes')&&x.args.includes('.md')));assert.ok(calls.some(x=>x.args.includes('HKCU\\Software\\RegisteredApplications')));assert.ok(calls.some(x=>x.file==='powershell.exe'));
});
