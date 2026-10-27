// Only public dependency names/versions are submitted; no source or notes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const lockBytes=await fs.readFile('package-lock.json'),lock=JSON.parse(lockBytes),payload={};
for(const [location,pkg] of Object.entries(lock.packages)){
 if(!location||!pkg.version)continue;const name=pkg.name||location.split('node_modules/').at(-1);
 (payload[name]??=[]).includes(pkg.version)||payload[name].push(pkg.version);
}
const endpoint='https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('npm advisory endpoint returned '+response.status);
const advisories=await response.json();if(!advisories||Array.isArray(advisories)||typeof advisories!=='object')throw Error('Invalid advisory response');
const result={version:lock.version,checkedAt:new Date().toISOString(),endpoint,lockSha256:createHash('sha256').update(lockBytes).digest('hex'),packageNames:Object.keys(payload).length,packageVersions:Object.values(payload).reduce((n,v)=>n+v.length,0),returnedAdvisoryPackages:Object.keys(advisories).length,passed:Object.keys(advisories).length===0,advisories,scope:'Locked public npm package names/versions including optional platform packages. No source-code, runtime exploit, unpublished vulnerability, or complete Chromium/OS component assessment.'};
const output=path.resolve(process.argv[2]||'test-results/dependency-security.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,packageNames:result.packageNames,packageVersions:result.packageVersions,advisoryPackages:result.returnedAdvisoryPackages}));if(!result.passed)process.exitCode=1;
