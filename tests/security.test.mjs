import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import JSZip from 'jszip';
import {NotebookStore,validPackagePath,hash} from '../desktop/store.mjs';
import {readFileBounded} from '../desktop/safe-io.mjs';
import {externalUrl,mayOpenAttachment,trustedRenderer} from '../desktop/security-policy.mjs';
import {loadSafeZip,readZipEntry} from '../shared/zip-safety.mjs';
import {petImageSize} from '../shared/pet-image.mjs';
import {resolvePath} from '../harmony/web/store.mjs';

async function fixture(t){const base=path.resolve('test-results/security-unit');await fs.mkdir(base,{recursive:true});const folder=await fs.mkdtemp(path.join(base,'case-'));t.after(async()=>{assert.ok(path.resolve(folder).startsWith(base+path.sep));await fs.rm(folder,{recursive:true,force:true});});const root=path.join(folder,'notes'),store=await new NotebookStore(root).init();await store.create('note','# Security sample');return{folder,root,store};}
const limits={maxBytes:8*1024*1024,maxExpanded:8*1024*1024,maxEntries:100,validName:n=>validPackagePath(n.replace(/\/$/,''))};

test('note links cannot collect hidden files, internal recovery or alternate data streams',async t=>{
 const {store,root}=await fixture(t);await fs.writeFile(path.join(root,'.env'),'SYNTHETIC-PRIVATE-FIXTURE');await fs.mkdir(path.join(root,'.private'));await fs.writeFile(path.join(root,'.private','image.png'),'sample');
 for(const ref of ['.env','.private/image.png','.notebook/recovery/x.json',pathToFileURL(path.join(root,'note.md:stream.md')).href])await assert.rejects(store.localTarget('note.md',ref));
 const doc=await store.read('note.md');await store.save({...doc,text:'[attachment](.env)',expectedHash:doc.hash});await assert.rejects(store.pack(['note.md']),/隐藏/);
 assert.throws(()=>resolvePath('note.md','.moye/settings.json'),/隐藏/);assert.throws(()=>resolvePath('a/note.md','../.secret/file.png'),/隐藏/);
});

test('explicit external or hidden attachment roots remain usable without granting internal metadata',async t=>{
 const {store,root,folder}=await fixture(t),external=path.join(folder,'external');await fs.mkdir(external);const outside=await new NotebookStore(root,external).init();const a=await outside.ingest(Buffer.from('attachment'),'sample.txt','note.md');assert.equal(await outside.localTarget('note.md',a.url),path.join(external,hash(Buffer.from('attachment'))+'.txt'));
 const hidden=await new NotebookStore(root,path.join(root,'.pictures')).init();const b=await hidden.ingest(Buffer.from('image fixture'),'sample.png','note.md');assert.ok(await hidden.localTarget('note.md',b.url));
 const internal=new NotebookStore(root,path.join(root,'.notebook'));await assert.rejects(internal.ingest(Buffer.from('x'),'sample.txt','note.md'),/内部/);
});

test('static filesystem links cannot redirect private storage or implicit asset permissions',async t=>{
 const {store,root,folder}=await fixture(t),external=path.join(folder,'external');await fs.mkdir(external);await fs.writeFile(path.join(external,'sample.png'),'outside');await fs.writeFile(path.join(root,'.env'),'private');
 await fs.mkdir(path.join(root,'.private'));await fs.writeFile(path.join(root,'.private','sample.png'),'private');
 try {await fs.symlink(external,path.join(root,'assets'),'junction');await fs.symlink(path.join(root,'.private'),path.join(root,'alias'),'junction');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('Host does not permit fixture links; exercise on an enabled filesystem.');return;}throw error;}
 await assert.rejects(store.localTarget('note.md','assets/sample.png'),/符号链接/);await assert.rejects(store.localTarget('note.md','alias/sample.png'),/隐藏/);await assert.rejects(store.ingest(Buffer.from('x'),'x.png','note.md'),/链接/);
 const malicious=path.join(folder,'linked-private');await fs.mkdir(malicious);await fs.symlink(external,path.join(malicious,'.notebook'),'junction');await assert.rejects(new NotebookStore(malicious).init(),/链接/);assert.equal(await fs.readFile(path.join(external,'sample.png'),'utf8'),'outside');
});

test('attachment launching uses a passive-type allowlist and external URLs are normalized',()=>{
 for(const file of ['x.hta','x.cpl','x.exe','x.command','x.sh','x.app','x.desktop','x.svg','x.html','x.psm1','x.unknown','x.PDF.exe'])assert.equal(mayOpenAttachment(file),false,file);
 for(const file of ['x.PDF','x.png','x.docx','x.txt','x.mp4'])assert.equal(mayOpenAttachment(file),true,file);
 for(const url of ['javascript:alert(1)','file:///etc/passwd','ms-msdt:evil','https://example.invalid/\nsecret','https://example.invalid/ bad'])assert.throws(()=>externalUrl(url));
 assert.equal(externalUrl('HTTPS://example.invalid/path'),'https://example.invalid/path');assert.equal(externalUrl('mailto:test@example.invalid'),'mailto:test@example.invalid');
});

test('IPC authorization binds window, main frame, exact application URL and pet role',()=>{
 const file=path.resolve('dist/index.html'),frame={url:pathToFileURL(file).href},contents={mainFrame:frame},window={isDestroyed:()=>false,webContents:contents},event={sender:contents,senderFrame:frame};
 assert.equal(trustedRenderer(event,window,file),true);assert.equal(trustedRenderer({...event,senderFrame:{...frame}},window,file),false);frame.url='https://example.invalid';assert.equal(trustedRenderer(event,window,file),false);frame.url=pathToFileURL(file).href+'?pet=1';assert.equal(trustedRenderer(event,window,file),false);assert.equal(trustedRenderer(event,window,file,true),true);
});

test('bounded file reads reject oversized and nonregular inputs before loading their content',async t=>{
 const {root}=await fixture(t),file=path.join(root,'payload.bin');await fs.writeFile(file,Buffer.alloc(64));await assert.rejects(readFileBounded(file,32),/大小/);await assert.rejects(readFileBounded(root,1000),/普通文件/);assert.equal((await readFileBounded(file,64)).length,64);
});

test('ZIP preflight rejects duplicate names hidden by JSZip and excessive directory counts',async()=>{
 const zip=new JSZip();zip.file('notes/a.md','one');zip.file('notes/b.md','two');const bytes=await zip.generateAsync({type:'nodebuffer'});let offset=0;while((offset=bytes.indexOf('notes/b.md',offset))!==-1){bytes.write('notes/a.md',offset);offset+=10;}
 assert.ok((await JSZip.loadAsync(bytes)).file('notes/a.md'));await assert.rejects(loadSafeZip(bytes,limits),/重复/);
 const original=await zip.generateAsync({type:'nodebuffer'}),end=original.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));original.writeUInt16LE(60000,end+8);original.writeUInt16LE(60000,end+10);await assert.rejects(loadSafeZip(original,limits),/条目数量/);
});

test('actual inflated bytes cannot bypass a forged small ZIP directory size',async()=>{
 const zip=new JSZip();zip.file('payload.txt',Buffer.alloc(4*1024*1024,120));const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 for(let i=0;i<bytes.length-46;i++){const signature=bytes.readUInt32LE(i);if(signature===0x04034b50)bytes.writeUInt32LE(32,i+22);if(signature===0x02014b50)bytes.writeUInt32LE(32,i+24);}
 const loaded=await loadSafeZip(bytes,limits);await assert.rejects(readZipEntry(loaded.file('payload.txt'),1024),/实际解压/);
});

test('pet image dimensions are checked from the header before native bitmap decoding',()=>{
 const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(65535,16);png.writeUInt32BE(65535,20);assert.throws(()=>petImageSize(png,'sample.png'),/4096/);assert.throws(()=>petImageSize(Buffer.from('<svg/>'),'sample.png'));
 const normal=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yCTsAAAAASUVORK5CYII=','base64');assert.deepEqual(petImageSize(normal,'sample.png'),{width:1,height:1});
});
