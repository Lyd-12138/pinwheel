// Source-only review archive; never packages stale binaries or user data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {collectRepository,privateFindings} from './repository-files.mjs';
const root=path.resolve('.'),version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const report=JSON.parse(await fs.readFile('docs/security-2026-10-26/verification.json','utf8'));if(!report.passed||report.version!==version)throw Error('Matching security verification is required.');
const output=path.join(root,'release',`Pinwheel-${version}-security-source.zip`);if(await fs.stat(output).catch(()=>null))throw Error('Output already exists; do not overwrite a published archive.');
const zip=new JSZip(),prefix=`pinwheel-${version}/`,manifest=[],sha=data=>createHash('sha256').update(data).digest('hex');
for(const file of await collectRepository(root)){
 const bytes=await fs.readFile(file.full);if(/\.(?:mjs|cjs|jsx?|tsx?|ets|json5?|md|py|ps1|nsi|html|css|ya?ml|txt)$|(?:^|\/)(?:LICENSE|\.npmrc)$/i.test(file.path)&&privateFindings(bytes.toString('utf8')).length)throw Error('Possible private material: '+file.path);
 zip.file(prefix+file.path,bytes);manifest.push({file:file.path,bytes:bytes.length,sha256:sha(bytes)});
}
zip.file(prefix+'SOURCE-MANIFEST.json',JSON.stringify({version,sourceOnly:true,binariesIncluded:false,files:manifest},null,2)+'\n');
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),check=await JSZip.loadAsync(bytes,{checkCRC32:true});
for(const file of manifest)if(sha(await check.file(prefix+file.file).async('nodebuffer'))!==file.sha256)throw Error('Source archive mismatch: '+file.file);
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,bytes,{flag:'wx'});await fs.writeFile(output+'.sha256',sha(bytes)+'  '+path.basename(output)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:path.basename(output),sourceFiles:manifest.length+1,bytes:bytes.length,sha256:sha(bytes),sourceOnly:true}));
