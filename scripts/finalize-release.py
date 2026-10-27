"""Verify built outputs and isolated test receipts, then make a portable ZIP/manifest."""
from pathlib import Path
import os
import json,zipfile,hashlib,stat,plistlib,re
root=Path.cwd().resolve();version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
assert re.fullmatch(r'\d+\.\d+\.\d+',version)
release=root/'release'/f'Pinwheel-{version}-win-x64'
def digest(file):
 h=hashlib.sha256()
 with file.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def latest(prefix):
 paths=sorted((root/'test-results').glob(prefix+'*/result.json'),key=lambda p:int(p.parent.name.rsplit('-',1)[1]),reverse=True)
 assert paths,prefix
 data=json.loads(paths[0].read_text(encoding='utf-8'));assert data['passed'] and not data.get('errors'),str(paths[0])
 return paths[0],data
proof=json.loads((root/f'test-results/release-validation-{version}.json').read_text(encoding='utf-8'))
assert proof['passed'] and proof['version']==version and proof['executableSha256']==digest(release/'pinwheel.exe') and proof['mainSha256']==digest(release/'resources/app/desktop/main.mjs')
core_count=proof['coreTests'];core=(root/f'.cache/core-{version.replace(".", "")}.log').read_text(encoding='utf-8');assert f'pass {core_count}' in core and 'fail 0' in core
checks=[]
for prefix in ['language-','rename-migration-','security-ui-','encryption-ui-','pet-studio-']:
 p,data=latest(prefix);assert data['packaged'];checks.append(p.relative_to(root).as_posix())
p,data=latest('installer-');assert data['version']==version;checks.append(p.relative_to(root).as_posix())
desktop=root/'test-results/packaged/desktop-results.json';data=json.loads(desktop.read_text());assert data['passed'] and data['packaged'] and not data['errors'] and not data['consoleErrors'];checks.append(desktop.relative_to(root).as_posix())
sources=json.loads((root/'third-party/source-manifest.json').read_text());assert len(sources['components'])==19
for component in sources['components']:
 assert digest(release/'third-party/sources'/component['file'])==component['sha256']
assert (release/'LICENSE-pinwheel.txt').read_bytes()==(root/'LICENSE').read_bytes()
assert (release/'LICENSE').read_bytes()==(root/'node_modules/electron/dist/LICENSE').read_bytes()
assert (release/'LICENSES.chromium.html').read_bytes()==(root/'node_modules/electron/dist/LICENSES.chromium.html').read_bytes()
assert digest(root/'.cache/main-bundle/main.mjs')==digest(release/'resources/app/desktop/main.mjs')
expected={p.relative_to(root/'dist').as_posix():digest(p) for p in (root/'dist').rglob('*') if p.is_file()}
actual={p.relative_to(release/'resources/app/dist').as_posix():digest(p) for p in (release/'resources/app/dist').rglob('*') if p.is_file()};assert expected==actual
font_sources={digest(p) for directory in (root/'node_modules').glob('**/katex/dist/fonts') for p in directory.iterdir() if p.is_file()}
fonts=[p for p in (release/'resources/app/dist').rglob('*') if p.suffix in ['.ttf','.woff','.woff2','.otf']]
assert fonts and all(digest(p) in font_sources for p in fonts)
electron=json.loads((root/'node_modules/electron/package.json').read_text())['version']
runtime=root/'.cache/runtime'/f'electron-v{electron}-win32-x64.zip';expected_runtime=json.loads((root/'node_modules/electron/checksums.json').read_text())[runtime.name]
assert digest(runtime)==expected_runtime
with zipfile.ZipFile(runtime) as z:assert hashlib.sha256(z.read('electron.exe')).hexdigest()==digest(root/'node_modules/electron/dist/electron.exe')
branding=json.loads((release/'windows-branding.json').read_text(encoding='utf-8'));assert branding['passed'] and branding['version']==version and branding['nonResourceSectionsUnchanged'] and branding['executableSha256']==digest(release/'pinwheel.exe') and branding['originalExecutableSha256']==digest(root/'node_modules/electron/dist/electron.exe')
_,installer_evidence=latest('installer-');native=installer_evidence['nativeBranding'];assert native['passed'] and native['nativeIconPixelsMatch'] and native['associationRegistryIsolated'] and native['resources']['executableSha256']==digest(release/'pinwheel.exe')
validation={'product':'风车笔记 / pinwheel','version':version,'date':os.environ.get('PINWHEEL_RELEASE_DATE','2026-10-27'),'passed':True,'coreTests':core_count,'checks':checks,'windowsInstalledLaunchUninstallTested':True,'windowsCleanVmTested':False,'windowsInstallerTestMode':True,'windowsRegistryAssociationAndLoginRebootTested':False,'windowsSigned':False,'windowsRuntimeChecksumVerified':True,'fontFilesMappedToKaTeX':len(fonts),'sourceArchivesVerified':19,'ownLicense':'MIT','macRuntimeTested':False,'appleSignedOrNotarized':False,'harmonyHapBuilt':False,'harmonyDeviceTested':False,'legalClearance':False}
validation.update(windowsExecutableResourcesCustomized=True,windowsNativeNameAndIconVerified=True,windowsNativeAssociationQueryIsolated=True)
(release/'validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2),encoding='utf-8')
portable=root/'release'/f'Pinwheel-{version}-win-x64.zip';assert not portable.exists()
with zipfile.ZipFile(portable,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for file in sorted(release.rglob('*')):
  if file.is_file():z.write(file,release.name+'/'+file.relative_to(release).as_posix())
with zipfile.ZipFile(portable) as z:assert z.testzip() is None
harmony_version=json.loads((root/'harmony/AppScope/app.json5').read_text())['app']['versionName']
artifacts=[]
for file in [root/'release'/f'Pinwheel-{version}-win-x64-Setup.exe',portable,*[root/'release'/f'Pinwheel-{version}-mac-{a}.zip' for a in ['arm64','x64']],root/'release'/f'Pinwheel-{harmony_version}-harmony-source.zip']:
 assert file.stat().st_size>1000000
 if '-mac-' in file.name:
  with zipfile.ZipFile(file) as z:
   assert z.testzip() is None
   app=next(n.rsplit('Contents/Info.plist',1)[0] for n in z.namelist() if n.endswith('pinwheel.app/Contents/Info.plist'))
   info=plistlib.loads(z.read(app+'Contents/Info.plist'));assert info['CFBundleIdentifier']=='org.pinwheel.notes' and info['CFBundleShortVersionString']==version
   assert info['CFBundleName']=='pinwheel' and info['CFBundleLocalizations']==['en','zh-Hans']
   for name in ['pinwheel.icns','LICENSE','LICENSES.chromium.html','LICENSE-pinwheel.txt','NOTICE.md','THIRD-PARTY-NOTICES.md','third-party/licenses/KaTeX-fonts-OFL-1.1.txt','zh-Hans.lproj/InfoPlist.strings']:assert app+'Contents/Resources/'+name in z.namelist(),name
   assert z.read(app+'Contents/Resources/LICENSE-pinwheel.txt')==(root/'LICENSE').read_bytes()
   assert hashlib.sha256(z.read(app+'Contents/Resources/app/desktop/main.mjs')).hexdigest()==digest(root/'.cache/main-bundle/main.mjs')
   for component in sources['components']:assert hashlib.sha256(z.read(app+'Contents/Resources/third-party/sources/'+component['file'])).hexdigest()==component['sha256']
   assert len([i for i in z.infolist() if stat.S_ISLNK(i.external_attr>>16)])==14
 sha=digest(file);Path(str(file)+'.sha256').write_text(sha+'  '+file.name+'\n');artifacts.append({'file':file.name,'bytes':file.stat().st_size,'sha256':sha})
manifest=root/'release'/f'Pinwheel-{version}-manifest.json';assert not manifest.exists()
manifest.write_text(json.dumps({'product':'风车笔记 / pinwheel','version':version,'validation':validation,'artifacts':artifacts},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':True,'validation':validation,'artifacts':artifacts},ensure_ascii=False),flush=True)
