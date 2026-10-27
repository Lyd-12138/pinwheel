import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createNotices } from '../scripts/notices.mjs';
test('third-party notices retain missing README licenses, font OFL and source directions',async()=>{
 const output=path.resolve('test-results/notices-'+Date.now()+'.md');const count=await createNotices(path.resolve('node_modules'),output),text=await fs.readFile(output,'utf8');
 assert.ok(count>300);for(const value of ['Copyright (c) 2013 Julian Gruber','Copyright (c) 2017 Junyoung Choi','Copyright 2010 - 2014 Sami Samhuri','Jean-loup Gailly','SIL OPEN FONT LICENSE Version 1.1','Reserved Font Name KaTeX_AMS','SOURCE-CODE.md','kieler/elkjs'])assert.ok(text.includes(value),value);
 assert.ok(text.includes('EPL-2.0'));assert.ok(text.includes('(MIT OR GPL-3.0-or-later)'));assert.ok(text.includes('does not license the application itself'));
});
