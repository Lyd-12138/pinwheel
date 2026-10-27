// Technical distribution checks; this is not trademark, patent or legal clearance.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { collectRepository, privateFindings } from './repository-files.mjs';
const root=path.resolve('.'), files=await collectRepository(root), findings=[], oversized=[];
for(const file of files){
 if(file.bytes>=100*1024*1024)oversized.push(file.path);
 if(/\.(?:mjs|cjs|jsx?|tsx?|ets|json5?|md|py|ps1|nsi|html|css|ya?ml|txt)$|(?:^|\/)(?:LICENSE|\.npmrc)$/i.test(file.path))for(const finding of privateFindings(await fs.readFile(file.full,'utf8')))findings.push({file:file.path,...finding});
}
const source=JSON.parse(await fs.readFile('third-party/source-manifest.json','utf8')), sourceChecks=[];
for(const component of source.components){const bytes=await fs.readFile(path.join('third-party/sources',component.file));sourceChecks.push({file:component.file,passed:bytes.length===component.bytes&&createHash('sha256').update(bytes).digest('hex')===component.sha256});}
const pkg=JSON.parse(await fs.readFile('package.json','utf8')),lock=JSON.parse(await fs.readFile('package-lock.json','utf8'));
const notices=await fs.readFile('THIRD-PARTY-NOTICES.md','utf8'),license=await fs.readFile('LICENSE','utf8');
const required=['SIL OPEN FONT LICENSE Version 1.1','EPL-2.0','Eclipse Public License - v 1.0','SOURCE-CODE.md','Apache License'];
const missingNotices=required.filter(value=>!notices.includes(value));
const dependencyInventory=await fs.readFile('docs/security-2026-10-26/dependency-inventory.json','utf8').catch(error=>{if(error.code==='ENOENT')return fs.readFile('docs/audit-2026-10-26/dependency-inventory.json','utf8');throw error;});
const dependencies=JSON.parse(dependencyInventory);
const missingPackages=dependencies.filter(p=>!notices.includes('## '+p.name+'@'+p.version+'\n')).map(p=>p.name+'@'+p.version);
const passed=!findings.length&&!oversized.length&&!missingNotices.length&&!missingPackages.length&&sourceChecks.every(s=>s.passed)&&pkg.version===lock.version&&pkg.license==='MIT'&&lock.packages[''].license==='MIT'&&license.includes('pinwheel contributors');
const result={version:pkg.version,date:process.env.PINWHEEL_RELEASE_DATE||new Date().toISOString().slice(0,10),technicalChecksPassed:passed,legalClearance:false,repositoryFiles:files.length,repositoryBytes:files.reduce((n,f)=>n+f.bytes,0),secretsAndPersonalPaths:findings,filesOverGitHub100MiB:oversized,missingNoticeMarkers:missingNotices,sourceArchiveChecks:sourceChecks,openItems:['Name/trademark clearance not completed; existing Pinwheel software found.','No private Typora source or patent claim comparison.','Historical Java/GWT engine build not independently reproduced; melk SNAPSHOT input not pinned.','Chromium transitive component rights not exhaustively independently reviewed.'],scope:'Allowlisted repository snapshot, high-confidence secret/path patterns, own MIT metadata, notice presence and archived-source hashes; archive integrity and installed application files checked separately.'};
result.dependencyNoticeCoverage={packages:dependencies.length,missing:missingPackages};
const checkOutput=await fs.stat('docs/security-2026-10-26/dependency-inventory.json').then(()=>'docs/security-2026-10-26/release-checks.json').catch(error=>{if(error.code==='ENOENT')return 'docs/audit-2026-10-26/release-checks.json';throw error;});
await fs.writeFile(checkOutput,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed,files:files.length,bytes:result.repositoryBytes,findings,oversized,missingNotices,sourceArchives:sourceChecks.length}));if(!passed)process.exitCode=1;
