from pathlib import Path
import zipfile,sys,hashlib,json
root=Path.cwd().resolve();folder=Path(sys.argv[1]).resolve()
assert folder.parent==root/'release' and folder.name.endswith('-GitHub-ready')
target=Path(str(folder)+'.zip');assert not target.exists()
files=sorted(p for p in folder.rglob('*') if p.is_file())
with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for file in files:
  assert not file.is_symlink()
  # Precompressed release archives/EXEs are stored to avoid redundant compression.
  kind=zipfile.ZIP_STORED if file.suffix in ['.zip','.exe','.jar'] else zipfile.ZIP_DEFLATED
  z.write(file,folder.name+'/'+file.relative_to(folder).as_posix(),compress_type=kind)
with zipfile.ZipFile(target) as z:
 assert len(z.infolist())==len(files) and z.testzip() is None
digest=hashlib.sha256()
with target.open('rb') as f:
 for block in iter(lambda:f.read(1024*1024),b''):digest.update(block)
Path(str(target)+'.sha256').write_text(digest.hexdigest()+'  '+target.name+'\n',encoding='utf-8')
print(json.dumps({'bundle':str(target),'bytes':target.stat().st_size,'files':len(files),'sha256':digest.hexdigest(),'crcVerified':True}))
