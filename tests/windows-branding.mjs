import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {windowsAssociationEntries} from '../shared/windows-association.mjs';import {verifyWindowsBranding} from '../scripts/windows-branding.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export async function checkNativeBranding(executable,output){
 await fs.mkdir(output,{recursive:true});const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,icon=path.join(root,'assets/pinwheel.ico');
 const resources=verifyWindowsBranding(await fs.readFile(executable),await fs.readFile(icon),version,await fs.readFile(path.join(root,'node_modules/electron/dist/electron.exe')));
 const payload=path.join(output,'branding-input.json');await fs.writeFile(payload,JSON.stringify({executable,icon,preview:path.join(output,'native-icon.png'),entries:windowsAssociationEntries(executable)}));
 const script=await fs.readFile(path.join(root,'tests/windows-branding.ps1'),'utf8'),command=Buffer.from(script,'utf16le').toString('base64');
 const result=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',command],{env:{...process.env,PINWHEEL_BRANDING_TEST:payload},windowsHide:true,maxBuffer:1024*1024}).catch(async e=>{await fs.writeFile(path.join(output,'native-error.txt'),e.stderr||String(e));throw Error('Native branding test failed; see '+path.join(output,'native-error.txt'));});
 const native=JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());if(!native.passed)throw Error('Native Windows branding failed');const receipt={version,...native,resources};await fs.writeFile(path.join(output,'branding-result.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;console.log(JSON.stringify(await checkNativeBranding(process.argv[2]||path.join(root,`release/Pinwheel-${version}-win-x64/pinwheel.exe`),path.join(root,'test-results','windows-branding-'+Date.now()))));}
