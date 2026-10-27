import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { NotebookStore, hash } from '../desktop/store.mjs';
async function setup(t) { const base=path.resolve('test-results/unit');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'files-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,store:await new NotebookStore(root).init()}; }
test('rename keeps document bytes, history and recovery; collision does not overwrite',async t=>{
  const {root,store}=await setup(t);let doc=await store.create('旧名称','\uFEFF# 正文\r\n');await store.save({...doc,text:doc.text+'第二版',expectedHash:doc.hash});doc=await store.read(doc.path);await store.recovery(doc.path,'未完成');
  const before=await fs.readFile(path.join(root,doc.path));await store.rename(doc.path,'新名称');
  assert.deepEqual(await fs.readFile(path.join(root,'新名称.md')),before);assert.equal(await fs.stat(path.join(root,doc.path)).catch(()=>null),null);
  assert.equal((await store.history('新名称.md')).length,1);assert.equal((await store.getRecovery('新名称.md')).text,'未完成');
  await store.create('已有','不覆盖');await assert.rejects(store.rename('新名称.md','已有'),/已存在/);assert.equal((await store.read('已有.md')).text,'不覆盖');
  await assert.rejects(store.rename('新名称.md','../bad'));await assert.rejects(store.rename('.notebook','bad'));await assert.rejects(store.rename('','root'));
});
test('folder rename preserves encrypted documents and their history; duplicate stays ciphertext',async t=>{
  const {root,store}=await setup(t);await store.createFolder('分类');let doc=await store.create('私密','# 秘密','分类');await store.save({...doc,text:'# 秘密\n第二版',expectedHash:doc.hash});doc=await store.read(doc.path);doc=await store.encrypt(doc.path,'long-password-for-files',doc.hash);await store.recovery(doc.path,'秘密恢复');
  const original=await fs.readFile(path.join(root,doc.path));await store.rename('分类','归档');
  assert.equal((await store.read('归档/私密.md')).locked,true);await store.unlock('归档/私密.md','long-password-for-files');assert.equal((await store.history('归档/私密.md')).length,1);assert.equal((await store.getRecovery('归档/私密.md')).text,'秘密恢复');
  const copy=await store.duplicate('归档/私密.md');assert.equal(copy.path,'归档/私密-副本.md');assert.deepEqual(await fs.readFile(path.join(root,copy.path)),original);assert.equal((await store.read(copy.path)).locked,true);assert.equal((await store.unlock(copy.path,'long-password-for-files')).text,doc.text);
  assert.equal((await store.duplicate('归档/私密.md')).path,'归档/私密-副本2.md');await assert.rejects(store.duplicate('归档'),/请选择/);
});
test('staged rename resumes after a crash; attachment roots cannot be renamed',async t=>{
  const {root,store}=await setup(t);const doc=await store.create('before','recover this document');const info=await fs.lstat(path.join(root,doc.path),{bigint:true});const stage=path.join(root,'.notebook/renames',randomUUID());await fs.mkdir(stage,{recursive:true});
  const journal={file:doc.path,target:'after.md',notes:[doc.path],content:{dev:String(info.dev),ino:String(info.ino),folder:false,digest:hash(await fs.readFile(path.join(root,doc.path)))},metadata:[]};await fs.writeFile(path.join(stage,'commit.json'),JSON.stringify(journal));await fs.rename(path.join(root,doc.path),path.join(stage,'content'));
  const recovered=await new NotebookStore(root).init();assert.equal((await recovered.read('after.md')).text,doc.text);assert.equal((await fs.readdir(path.join(root,'.notebook/renames'))).length,0);
  await store.createFolder('项目');await fs.mkdir(path.join(root,'项目/附件'));store.assetRoot=path.join(root,'项目/附件');await assert.rejects(store.rename('项目','其他'),/附件目录/);
});
