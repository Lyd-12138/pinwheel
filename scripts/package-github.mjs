import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { collectRepository, privateFindings } from './repository-files.mjs';
const root=path.resolve('.'),version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const releaseDate=process.env.PINWHEEL_RELEASE_DATE||new Date().toISOString().slice(0,10);
const harmonyVersion=JSON.parse(await fs.readFile('harmony/AppScope/app.json5','utf8')).app.versionName;
await import('./audit-release.mjs');
const audit=JSON.parse(await fs.readFile('docs/security-2026-10-26/release-checks.json','utf8').catch(error=>{if(error.code==='ENOENT')return fs.readFile('docs/audit-2026-10-26/release-checks.json','utf8');throw error;}));
if(!audit.technicalChecksPassed)throw Error('Source audit failed; inspect release-checks.json.');
const release=path.join(root,'release'),bundle=path.join(release,`Pinwheel-${version}-GitHub-ready`),sourceZip=path.join(release,`Pinwheel-${version}-source.zip`);
for(const target of [bundle,sourceZip])if(await fs.stat(target).catch(()=>null))throw Error('Output already exists: '+target);
const manifest=JSON.parse(await fs.readFile(path.join(release,`Pinwheel-${version}-manifest.json`),'utf8'));
if(manifest.version!==version||!manifest.validation.passed)throw Error('Matching verified binary manifest required.');
const repo=path.join(bundle,'repository'),assets=path.join(bundle,'release-assets');await fs.mkdir(repo,{recursive:true});await fs.mkdir(assets,{recursive:true});
const files=await collectRepository(root),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceManifest=[];
const zip=new JSZip(),prefix=`pinwheel-${version}/`;
for(const file of files){
 const bytes=await fs.readFile(file.full);
 if(/\.(?:mjs|cjs|jsx?|tsx?|ets|json5?|md|py|ps1|nsi|html|css|ya?ml|txt)$|(?:^|\/)(?:LICENSE|\.npmrc)$/i.test(file.path)&&privateFindings(bytes.toString('utf8')).length)throw Error('Private content in snapshot: '+file.path);
 const target=path.join(repo,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
 zip.file(prefix+file.path,bytes);sourceManifest.push({file:file.path,bytes:bytes.length,sha256:hash(bytes)});
}
const inventory=JSON.stringify({version,date:releaseDate,files:sourceManifest},null,2)+'\n';await fs.writeFile(path.join(repo,'SOURCE-MANIFEST.json'),inventory);zip.file(prefix+'SOURCE-MANIFEST.json',inventory);
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});await fs.writeFile(sourceZip,bytes,{flag:'wx'});
const verified=await JSZip.loadAsync(bytes,{checkCRC32:true});for(const file of sourceManifest)if(hash(await verified.file(prefix+file.file).async('nodebuffer'))!==file.sha256)throw Error('Source ZIP differs: '+file.file);
const artifacts=[...manifest.artifacts,{file:path.basename(sourceZip),bytes:bytes.length,sha256:hash(bytes)}];
for(const artifact of artifacts){
 if(path.basename(artifact.file)!==artifact.file)throw Error('Invalid artifact name');
 const full=path.join(release,artifact.file),data=await fs.readFile(full);if(data.length!==artifact.bytes||hash(data)!==artifact.sha256)throw Error('Artifact hash mismatch: '+artifact.file);
 if(data.length>=2*1024**3)throw Error('Artifact exceeds 2 GiB');
 await fs.copyFile(full,path.join(assets,artifact.file));
}
await fs.writeFile(sourceZip+'.sha256',hash(bytes)+'  '+path.basename(sourceZip)+'\n',{flag:'wx'});
const sums=artifacts.map(a=>a.sha256+'  '+a.file).join('\n')+'\n';await fs.writeFile(path.join(assets,'SHA256SUMS.txt'),sums);
await fs.copyFile(path.join(release,`Pinwheel-${version}-manifest.json`),path.join(assets,`Pinwheel-${version}-manifest.json`));
await fs.writeFile(path.join(assets,'RELEASE-NOTES.md'),`# 风车笔记 / pinwheel ${version} — development preview\n\n- 自有代码采用 MIT；保留第三方许可、数学字体 OFL 与 ELK 来源/源码材料。\n- 修复 Windows 打开方式中的名称和图标，嵌入中英文资源，并通过原生 Windows 名称与图标接口验证。\n- 包含隐藏文件收集、附件打开策略、压缩包限制及 KaTeX 依赖修复，详见 docs/security-2026-10-26/REPORT.md。\n- Windows 安装、启动、卸载及界面测试以当前版本随附 manifest 为准；旧版验证不能代替本版验证。\n- Mac 包尚未实机测试、Apple 签名或公证。鸿蒙包为 ${harmonyVersion} 工程源码，没有 HAP。\n- 品牌商标核验和上游历史构建追溯仍有未确认事项，详见源码 docs/audit-2026-10-26/REPORT.md。此说明不代表已排除侵权或安全风险。\n\n验证下载文件可对照 SHA256SUMS.txt；保留 third-party 目录与许可材料。\n`);
await fs.writeFile(path.join(bundle,'先读我-上传说明.md'),'# GitHub 上传材料\n\nrepository/ 的内容提交到仓库根目录（包含隐藏文件）；release-assets/ 的文件作为 GitHub Release 附件上传。不要把整个准备包提交到 Git 历史。\n\n名称/商标尚未清查通过，已发现同名软件；技术检查不代表无侵权。先阅读 repository/docs/audit-2026-10-26/REPORT.md 与 repository/docs/GITHUB-PUBLISH.md。未替你创建或公开 GitHub 仓库。\n');
await fs.writeFile(path.join(bundle,'UPLOAD-CHECKS.json'),JSON.stringify({version,technicalChecksPassed:true,legalClearance:false,repositoryFiles:sourceManifest.length+1,repositoryBytes:audit.repositoryBytes,sourceArchiveVerified:true,artifacts:artifacts.map(a=>({file:a.file,sha256:a.sha256})),githubRepositoryCreated:false,githubPublished:false},null,2));
await promisify(execFile)(process.env.PYTHON||'python',['scripts/zip-github-bundle.py',bundle],{windowsHide:true,maxBuffer:4*1024*1024});
console.log(JSON.stringify({sourceZip,bundle,archive:bundle+'.zip',sourceFiles:sourceManifest.length+1,artifacts:artifacts.length,legalClearance:false}));
