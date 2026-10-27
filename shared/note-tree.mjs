export function noteTree(notes, directories = []) {
  const root = { path: '', name: '', children: new Map() };
  for (const directory of directories) {
    let parent = root, path = '';
    for (const name of directory.split('/').filter(Boolean)) {
      path += (path ? '/' : '') + name;
      if (!parent.children.has(name)) parent.children.set(name, { path, name, children: new Map() });
      parent = parent.children.get(name);
    }
  }
  for (const note of notes) {
    const segments = note.path.split('/'); let parent = root, path = '';
    for (const name of segments.slice(0, -1)) {
      path += (path ? '/' : '') + name;
      if (!parent.children.has(name)) parent.children.set(name, { path, name, children: new Map() });
      parent = parent.children.get(name);
    }
    parent.children.set(segments.at(-1), { path: note.path, name: note.name, note });
  }
  const sorted = folder => [...folder.children.values()].sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name, 'zh-CN', { numeric: true })).map(node => node.children ? { ...node, children: sorted(node) } : node);
  return sorted(root);
}
