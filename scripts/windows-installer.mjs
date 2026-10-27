import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {windowsAssociationEntries} from '../shared/windows-association.mjs';
const root=path.resolve('.'), version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const source=path.join(root,'release',`Pinwheel-${version}-win-x64`),output=path.join(root,'release',`Pinwheel-${version}-win-x64-Setup.exe`);
if(await fs.stat(output).catch(()=>null)){
  if(!process.argv.includes('--refresh-unpublished')||version!=='0.7.0'||await fs.stat(path.join(root,'release',`Pinwheel-${version}-win-x64.zip`)).catch(()=>null))throw Error('Installer already exists');
  if(!output.startsWith(root+path.sep))throw Error('Unexpected installer path');
  await fs.rename(output,path.join(root,'.cache',`previous-070-setup-${Date.now()}.exe`));
}
const files=[],directories=[];const walk=async(dir)=>{for(const item of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory()){directories.push(path.relative(source,full));await walk(full);}else files.push(path.relative(source,full));}};await walk(source);
const safe=value=>value.replaceAll('$',()=>'$$').replaceAll('"','$\\"');
const registryText=value=>safe(value).replaceAll('$$INSTDIR','$INSTDIR').replaceAll('$$(MarkdownType)','$(MarkdownType)').replaceAll('$$(EncryptedType)','$(EncryptedType)').replaceAll('$$(PackageType)','$(PackageType)');
const associationLines=windowsAssociationEntries('$INSTDIR\\pinwheel.exe',{typeNames:['$(MarkdownType)','$(EncryptedType)','$(PackageType)']}).map(e=>`WriteReg${e.type==='REG_EXPAND_SZ'?'ExpandStr':'Str'} HKCU "${registryText(e.key)}" "${registryText(e.name)}" "${registryText(e.value)}"`);
const associationInclude=path.join(root,'.cache','windows-associations.nsh');await fs.writeFile(associationInclude,'\ufeff'+associationLines.join('\r\n')+'\r\n');
const lines=[...files.map(file=>`Delete "$INSTDIR\\${safe(file)}"`),...directories.sort((a,b)=>b.length-a.length).map(dir=>`RMDir "$INSTDIR\\${safe(dir)}"`)];
const include=path.join(root,'.cache','uninstall-files.nsh');await fs.writeFile(include,'\ufeff'+lines.join('\r\n')+'\r\n');
const compiler=path.join(root,'.cache/build-tools/nsis-bundle/windows/makensis.exe');
const script=path.join(root,'.cache/installer-main.nsi');await fs.writeFile(script,'\ufeff'+await fs.readFile('scripts/windows-installer.nsi','utf8'));
const result=await promisify(execFile)(compiler,['/V2',`/DMOYE_VERSION=${version}`,`/DMOYE_SOURCE=${source}`,`/DMOYE_OUTPUT=${output}`,`/DMOYE_ICON=${path.join(root,'assets/pinwheel.ico')}`,`/DMOYE_UNINSTALL_LIST=${include}`,`/DMOYE_ASSOCIATIONS=${associationInclude}`,script],{windowsHide:true,env:{...process.env,NSISDIR:path.dirname(compiler)},maxBuffer:4*1024*1024});
if(result.stdout)console.log(result.stdout);if(result.stderr)console.error(result.stderr);console.log(output);
