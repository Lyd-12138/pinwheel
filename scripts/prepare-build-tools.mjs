// Explicit downloads of verified official packaging inputs. No account or token needed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const runtime=path.resolve('.cache/runtime'); await fs.mkdir(runtime,{recursive:true});
const electron=JSON.parse(await fs.readFile('node_modules/electron/package.json','utf8'));
const sums=JSON.parse(await fs.readFile('node_modules/electron/checksums.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const jobs=[];
if(process.argv.includes('--mac')) for(const arch of ['arm64','x64']) { const name=`electron-v${electron.version}-darwin-${arch}.zip`;jobs.push({name,url:`https://github.com/electron/electron/releases/download/v${electron.version}/${name}`,sha:sums[name]}); }
if(process.argv.includes('--nsis')) jobs.push({name:'nsis-bundle-3.12.tar.gz',url:'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis%402.0.2/nsis-bundle-3.12.tar.gz',sha:'83d80ee578cb19008b2a99e4fccfb5e7c023cc9bb791eb38f6048fccc875f62c'});
if(!jobs.length) throw Error('Choose --mac and/or --nsis.');
for(const job of jobs){
 if(!job.sha)throw Error('Missing official checksum: '+job.name);
 const file=path.join(runtime,job.name),cached=await fs.readFile(file).catch(()=>null);
 if(!cached || hash(cached)!==job.sha){
  const response=await fetch(job.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Download failed: '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==job.sha)throw Error('Checksum mismatch: '+job.name);
  await fs.writeFile(file,bytes);
 }
 console.log('Verified:',job.name);
 if(job.name.startsWith('nsis-')){
  const target=path.resolve('.cache/build-tools');await fs.mkdir(target,{recursive:true});
  const run=promisify(execFile),list=await run('tar',['-tzf',file],{windowsHide:true,maxBuffer:8*1024*1024});
  for(const entry of list.stdout.split(/\r?\n/).filter(Boolean))if(/^[\\/]|^[a-z]:/i.test(entry)||entry.replaceAll('\\','/').split('/').includes('..'))throw Error('Unsafe archive path');
  // Reuse an identical compiler instead of overwriting an executable in use.
  const relative='nsis-bundle/windows/makensis.exe',existing=await fs.readFile(path.join(target,relative)).catch(()=>null);
  if(existing){
   const original=await run('tar',['-xOf',file,relative],{windowsHide:true,encoding:'buffer',maxBuffer:16*1024*1024});
   if(hash(existing)===hash(original.stdout)){console.log('Verified existing NSIS compiler');continue;}
   throw Error('Existing NSIS compiler differs from the verified archive; preserve and move that tool folder before preparing a fresh one.');
  }
  await run('tar',['-xzf',file,'-C',target],{windowsHide:true});
  console.log('NSIS extracted to',target);
 }
}
