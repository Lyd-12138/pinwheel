import test from 'node:test';
import assert from 'node:assert/strict';
import { noteTree } from '../shared/note-tree.mjs';

test('file tree preserves nested paths and same named notes, sorting folders first', () => {
  const notes = ['日记/今天.md', '项目/资料/今天.md', '根目录.md', '项目/计划10.md', '项目/计划2.md'].map(path => ({ path, name: path.split('/').at(-1).slice(0, -3), modified: 0 }));
  const tree = noteTree(notes);
  assert.ok(tree[0].children && tree[1].children); assert.equal(tree[2].path, '根目录.md');
  const project = tree.find(n => n.path === '项目');
  assert.equal(project.children[0].path, '项目/资料');
  assert.deepEqual(project.children.slice(1).map(n => n.name), ['计划2', '计划10']);
  assert.equal(project.children[0].children[0].note.path, '项目/资料/今天.md');
});
test('file tree handles special folder names and filtered results without mutating notes', () => {
  const notes = [{ path: '__proto__/笔记.md', name: '笔记', modified: 0 }];
  assert.equal(noteTree(notes)[0].children[0].note, notes[0]);
  assert.deepEqual(notes, [{ path: '__proto__/笔记.md', name: '笔记', modified: 0 }]);
  assert.deepEqual(noteTree([]), []);
  assert.deepEqual(noteTree([], ['新文件夹'])[0], { path: '新文件夹', name: '新文件夹', children: [] });
});
