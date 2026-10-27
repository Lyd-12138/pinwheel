import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NtExecutable,NtExecutableResource,Data,Resource} from 'resedit';
export const APP_NAME_RESOURCE=56001;
const sha=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const sections=exe=>exe.getAllSections().filter(s=>s.info.name!=='.rsrc').map(s=>({name:s.info.name,rva:s.info.virtualAddress,bytes:s.data?.byteLength||0,sha256:s.data?sha(s.data):null}));
export function verifyWindowsBranding(bytes,iconBytes,version,originalBytes){
 const exe=NtExecutable.from(bytes,{ignoreCert:true}),res=NtExecutableResource.from(exe),versions=Resource.VersionInfo.fromEntries(res.entries),icons=Data.IconFile.from(iconBytes);
 for(const [lang,table,name] of [[0,1033,'pinwheel'],[1033,1033,'pinwheel'],[2052,2052,'风车笔记']]){
  const vi=versions.find(v=>v.lang===lang),values=vi?.getStringValues({lang:table,codepage:1200});
  if(values?.FileDescription!==name||values.ProductName!==name||values.OriginalFilename!=='pinwheel.exe'||values.FileVersion!==version+'.0')throw Error('Windows version branding is missing or incorrect.');
  if(Resource.StringTable.fromEntries(lang,res.entries).getById(APP_NAME_RESOURCE)!==name)throw Error('Windows localized application name is missing.');
 }
 const groups=Resource.IconGroupEntry.fromEntries(res.entries);if(groups.length!==1||groups[0].icons.length!==icons.icons.length)throw Error('Unexpected Windows application icon groups.');
 const iconHash=i=>sha(i.isRaw()?i.bin:i.generate()),actual=groups[0].getIconItemsFromEntries(res.entries).map(iconHash);
 if(JSON.stringify(actual)!==JSON.stringify(icons.icons.map(i=>iconHash(i.data))))throw Error('Embedded Windows icon differs from pinwheel.ico.');
 let unchanged=false;if(originalBytes){const source=NtExecutable.from(originalBytes,{ignoreCert:true});if(JSON.stringify(sections(source))!==JSON.stringify(sections(exe)))throw Error('Branding modified non-resource executable sections.');unchanged=true;}
 return {passed:true,version,iconFrames:icons.icons.length,englishName:'pinwheel',chineseName:'风车笔记',nonResourceSectionsUnchanged:unchanged,...(originalBytes?{originalExecutableSha256:sha(originalBytes)}:{}),executableSha256:sha(bytes),iconSha256:sha(iconBytes)};
}
export function brandWindowsExecutable(originalBytes,iconBytes,version){
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid Windows product version');
 const exe=NtExecutable.from(originalBytes,{ignoreCert:true}),res=NtExecutableResource.from(exe),fixed=Resource.VersionInfo.fromEntries(res.entries)[0]?.fixedInfo||{};
 res.entries=res.entries.filter(e=>![3,14,16].includes(e.type));
 Resource.IconGroupEntry.replaceIconsForResource(res.entries,1,0,Data.IconFile.from(iconBytes).icons.map(i=>i.data));
 const parts=version.split('.').map(Number);
 for(const [lang,table,name] of [[0,1033,'pinwheel'],[1033,1033,'pinwheel'],[2052,2052,'风车笔记']]){
  const vi=Resource.VersionInfo.create(lang,fixed,[]);vi.setFileVersion(...parts,0,table);vi.setProductVersion(...parts,0,table);
  vi.setStringValues({lang:table,codepage:1200},{FileDescription:name,ProductName:name,OriginalFilename:'pinwheel.exe',InternalName:'pinwheel',CompanyName:'pinwheel contributors',LegalCopyright:'pinwheel contributors; Electron contributors (see accompanying licenses)'});vi.outputToResourceEntries(res.entries);
  const strings=Resource.StringTable.fromEntries(lang,res.entries);strings.setById(APP_NAME_RESOURCE,name);strings.replaceStringEntriesForExecutable(res);
 }
 res.outputResource(exe);const bytes=Buffer.from(exe.generate());verifyWindowsBranding(bytes,iconBytes,version,originalBytes);return bytes;
}
export async function brandWindowsFile(file,icon,version){const original=await fs.readFile(file),ico=await fs.readFile(icon),bytes=brandWindowsExecutable(original,ico,version);await fs.writeFile(file,bytes);return verifyWindowsBranding(bytes,ico,version,original);}
