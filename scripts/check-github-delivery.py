"""Independent ZIP/SHA check after creating a GitHub-ready release bundle."""
from pathlib import Path, PurePosixPath
import hashlib,json,re,zipfile
root=Path.cwd().resolve();version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
ready=root/'release'/f'Pinwheel-{version}-GitHub-ready';source=root/'release'/f'Pinwheel-{version}-source.zip';prefix=f'pinwheel-{version}/'
def digest(file):
 h=hashlib.sha256()
 with file.open('rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
with zipfile.ZipFile(source) as z:
 assert z.testzip() is None
 manifest=json.loads(z.read(prefix+'SOURCE-MANIFEST.json'));names=set(z.namelist())
 assert manifest['version']==version
 for item in manifest['files']:
  data=z.read(prefix+item['file']);assert len(data)==item['bytes'] and hashlib.sha256(data).hexdigest()==item['sha256'],item['file']
  assert not re.search(r'(^|/)(node_modules|test-results|\.cache|\.git|release)(/|$)',item['file'])
  assert (ready/'repository'/item['file']).read_bytes()==data,item['file']
 assert len([i for i in z.infolist() if not i.is_dir()])==len(manifest['files'])+1
 for file in ['README.md','docs/GITHUB-PUBLISH.md','SECURITY.md']:
  for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)',z.read(prefix+file).decode('utf-8-sig')):
   if '://' in link or link.startswith('#'):continue
   target=str(PurePosixPath(file).parent/link.split('#')[0]);assert prefix+target in names,(file,target)
 assert json.loads(z.read(prefix+'package.json'))['license']=='MIT'
 for report in ['docs/security-2026-10-26/release-checks.json',f'docs/security-2026-10-26/source-build-smoke-{version}.json',f'docs/security-2026-10-26/release-verification-{version}.json']:
  data=json.loads(z.read(prefix+report));assert data.get('passed',data.get('technicalChecksPassed')) and data['version']==version,report
 assert prefix+'.github/workflows/ci.yml' in names
checks=json.loads((ready/'UPLOAD-CHECKS.json').read_text(encoding='utf-8'));assert checks['technicalChecksPassed'] and not checks['legalClearance'] and not checks['githubPublished']
assets=[]
for line in (ready/'release-assets/SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
 expected,name=line.split('  ',1);assert Path(name).name==name and digest(ready/'release-assets'/name)==expected,name;assets.append(name)
outer=root/'release'/f'Pinwheel-{version}-GitHub-ready.zip'
expected_files={p.relative_to(ready).as_posix() for p in ready.rglob('*') if p.is_file()}
with zipfile.ZipFile(outer) as z:
 assert z.testzip() is None and len(z.infolist())==len(expected_files)
 assert {n.removeprefix(ready.name+'/') for n in z.namelist()}==expected_files
 for item in z.infolist():
  file=ready/item.filename.removeprefix(ready.name+'/');h=hashlib.sha256()
  with z.open(item) as stream:
   for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
  assert h.hexdigest()==digest(file),item.filename
result={'passed':True,'version':version,'sourceFiles':len(manifest['files'])+1,'outerBundleEntries':len(expected_files),'releaseAssetsHashVerified':len(assets),'sourceManifestAllHashesVerified':True,'relativeReadmeLinksVerified':True,'privateRuntimeTreesExcluded':True,'bundleSha256':digest(outer),'legalClearance':False,'githubPublished':False}
(root/'test-results'/f'github-final-check-{version}.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
