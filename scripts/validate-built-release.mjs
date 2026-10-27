// Run real checks against a built Windows package; all GUI tests isolate user data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
if(process.platform!=='win32')throw Error('This validation sequence requires Windows. Unit tests/builds are cross-platform.');
const root=path.resolve('.'),version=JSON.parse(await fs.readFile('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Expected a numeric release version.');
const folder=path.join(root,'release',`Pinwheel-${version}-win-x64`),exe=path.join(folder,'pinwheel.exe');
await fs.access(path.join(root,'release',`Pinwheel-${version}-win-x64-Setup.exe`));await fs.access(exe);
await fs.mkdir('.cache',{recursive:true});await fs.mkdir('test-results',{recursive:true});
const run=promisify(execFile),env={...process.env,MOYE_PACKAGED_EXECUTABLE:exe,NO_COLOR:'1'};delete env.FORCE_COLOR;
const core=await run(process.execPath,['--test','--test-reporter=spec','tests/*.test.mjs'],{cwd:root,env,windowsHide:true,maxBuffer:16*1024*1024});
await fs.writeFile('.cache/core-'+version.replaceAll('.','')+'.log',core.stdout+core.stderr);
const match=core.stdout.match(/\bpass\s+(\d+)/);if(!match)throw Error('Test count missing');const count=Number(match[1]);console.log('Core tests passed:',count);
for(const test of ['language-ui','rename-migration-ui','security-ui','encryption-ui','pet-studio-ui','desktop','windows-installer']){
 if(test==='windows-installer'&&process.env.PINWHEEL_INSTALLER_READY_FILE){
  const deadline=Date.now()+600000;console.log('Waiting for installer build completion marker.');
  while(!await fs.stat(process.env.PINWHEEL_INSTALLER_READY_FILE).catch(()=>null)){if(Date.now()>deadline)throw Error('Installer build completion timed out');await new Promise(resolve=>setTimeout(resolve,1000));}
 }
 console.log('Running:',test);const result=await run(process.execPath,['tests/'+test+'.mjs'],{cwd:root,env,windowsHide:true,maxBuffer:16*1024*1024});
 await fs.writeFile('.cache/verify-'+test+'-'+version+'.log',result.stdout+result.stderr);console.log(result.stdout.trim());
}
const checks=[];
for(const prefix of ['language-','rename-migration-','security-ui-','encryption-ui-','pet-studio-','installer-']){
 const names=(await fs.readdir('test-results')).filter(n=>n.startsWith(prefix)&&/^\d+$/.test(n.slice(prefix.length))).sort((a,b)=>Number(b.slice(prefix.length))-Number(a.slice(prefix.length)));
 const file=path.join('test-results',names[0],'result.json'),receipt=JSON.parse(await fs.readFile(file,'utf8'));if(!receipt.passed || prefix!=='installer-'&&!receipt.packaged)throw Error('Failed or unpackaged receipt: '+file);checks.push(file.replaceAll('\\','/'));
}
const desktop='test-results/packaged/desktop-results.json',receipt=JSON.parse(await fs.readFile(desktop,'utf8'));if(!receipt.passed||!receipt.packaged||receipt.errors.length||receipt.consoleErrors.length)throw Error('Desktop validation failed');checks.push(desktop);
const sha=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const result={version,passed:true,coreTests:count,checks,executableSha256:await sha(exe),mainSha256:await sha(path.join(folder,'resources/app/desktop/main.mjs')),dataIsolation:true,legalClearance:false};
await fs.writeFile(`test-results/release-validation-${version}.json`,JSON.stringify(result,null,2)+'\n');console.log('Verified release:',version);
