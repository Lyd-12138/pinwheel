import fs from 'node:fs/promises';
import path from 'node:path';
export const repositoryRoots=['src','shared','desktop','scripts','tests','themes','pet-examples','assets','third-party','harmony','.github','docs/images','docs/audit-2026-10-26','docs/security-2026-10-26'];
export const repositoryFiles=['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore','.gitattributes','.npmrc','pnpm-workspace.yaml','download-runtime.mjs','README.md','LICENSE','NOTICE.md','CONTRIBUTING.md','SECURITY.md','THIRD-PARTY-NOTICES.md','docs/GITHUB-PUBLISH.md','docs/BRANDING.md'];
export async function collectRepository(root){
 const result=[];
 const walk=async relative=>{
  const full=path.resolve(root,relative);if(!full.startsWith(path.resolve(root)+path.sep))throw Error('Outside repository');
  const stat=await fs.lstat(full);if(stat.isSymbolicLink())throw Error('Symlink in repository snapshot: '+relative);
  if(stat.isDirectory()){
   if(['node_modules','oh_modules','.hvigor','.idea','build','.git','.cache','test-results','release','__pycache__'].includes(path.basename(relative))||relative==='harmony/entry/src/main/resources/rawfile/web')return;
   for(const name of (await fs.readdir(full)).sort())await walk(relative+'/'+name);
  }else if(stat.isFile()){
   if(/(?:^|\/)(?:local\.properties|\.env(?:\..*)?)$|\.(?:p12|pfx|pem|key|log)$/i.test(relative))throw Error('Private configuration in source selection: '+relative);
   result.push({path:relative,full,bytes:stat.size});
  }
 };
 for(const item of [...repositoryRoots,...repositoryFiles])await walk(item);
 return result.sort((a,b)=>a.path.localeCompare(b.path));
}
export function privateFindings(text){
 const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,})\b/g],['openai-key',/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/g],['aws-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],['credential-url',/https?:\/\/[^\s/:]+:[^\s/@]+@/g],['personal-home',/[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9_.-]+[\\/]/gi]];
 return rules.flatMap(([rule,regex])=>[...text.matchAll(regex)].map(match=>({rule,line:text.slice(0,match.index).split('\n').length})));
}
