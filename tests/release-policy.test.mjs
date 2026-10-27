import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {collectRepository,privateFindings} from '../scripts/repository-files.mjs';

test('source selection excludes actual populated runtime/test trees and retains legal sources and hidden CI',async()=>{
 const files=await collectRepository(path.resolve('.')),names=files.map(f=>f.path);
 for(const name of ['LICENSE','NOTICE.md','.github/workflows/ci.yml','third-party/source-manifest.json','third-party/sources/elk-pr955.patch'])assert.ok(names.includes(name),name);
 assert.ok(names.some(n=>n.endsWith('-sources.jar')));
 assert.ok(names.every(n=>!/(^|\/)(?:node_modules|test-results|\.cache|release|\.git|__pycache__)(?:\/|$)/.test(n)));
 assert.ok(names.every(n=>!n.startsWith('harmony/entry/src/main/resources/rawfile/web/')));
});
test('secret scanner detects likely credentials without echoing their contents and allows synthetic path examples',()=>{
 const token='ghp_'+'x'.repeat(36),key='AKIA'+'X'.repeat(16),privateKey='-----BEGIN '+'PRIVATE KEY-----';
 const fakeUrl=['https:','','user:password'+'@example.invalid'].join('/');
 const hits=privateFindings([token,key,privateKey,fakeUrl,'C:/Users/'+'someone/note.md'].join('\n'));
 assert.deepEqual(new Set(hits.map(h=>h.rule)),new Set(['github-token','aws-key','private-key','credential-url','personal-home']));
 assert.ok(hits.every(h=>Object.keys(h).sort().join(',')==='line,rule'));
 assert.deepEqual(privateFindings('D:/OldNotes and C:/Apps/pinwheel.exe'),[]);
});
