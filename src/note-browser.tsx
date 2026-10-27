import React, { useMemo } from 'react';
import type { Note } from './types';
import { Icon, useThemeUI } from './ui';
import { noteTree } from '../shared/note-tree.mjs';

type Entry = { path: string; name: string; children?: Entry[]; note?: Note };
type Props = { notes: Note[]; directories?: string[]; selected?: string; collapsed: Set<string>; onToggle: (path: string) => void; onOpen: (path: string) => void; searching: boolean };
export function NoteTree({ notes, directories, selected, collapsed, onToggle, onOpen, searching }: Props) {
  const { text } = useThemeUI();
  const tree = useMemo(() => noteTree(notes, searching ? [] : directories) as Entry[], [notes, directories, searching]);
  const render = (entries: Entry[], depth: number): React.ReactNode => entries.map(entry => {
    const folder = !!entry.children, expanded = searching || !collapsed.has(entry.path);
    return <li key={entry.path} role="none">
      <button role="treeitem" aria-level={depth + 1} aria-expanded={folder ? expanded : undefined} aria-selected={!folder ? selected === entry.path : undefined} data-path={entry.path} data-parent={entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : ''} title={entry.path} className={folder ? 'folder-row' : 'note-item tree-note' + (selected === entry.path ? ' active' : '')} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => folder ? onToggle(entry.path) : onOpen(entry.path)}>
        {folder ? <><span className={'folder-chevron' + (expanded ? ' expanded' : '')}><Icon name="arrow" size={12}/></span><span className="folder-symbol"><Icon name="folder" size={16}/></span></> : <span className="tree-file-symbol"><Icon name={entry.note?.encrypted ? 'lock' : 'file'} size={16}/></span>}
        <span>{entry.name}</span>
      </button>
      {folder && expanded && <ul role="group">{render(entry.children!, depth + 1)}</ul>}
    </li>;
  });
  return <ul className="file-tree" role="tree" aria-label={text('笔记文件树')} onKeyDown={event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[role=treeitem]'); if (!target) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=treeitem]')], index = items.indexOf(target);
    const expanded = target.getAttribute('aria-expanded');
    if (event.key === 'ArrowDown') { event.preventDefault(); items[Math.min(items.length - 1, index + 1)]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[Math.max(0, index - 1)]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); items[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); items.at(-1)?.focus(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); if (expanded === 'false') onToggle(target.dataset.path!); else if (expanded === 'true') items[index + 1]?.focus(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); if (expanded === 'true' && !searching) onToggle(target.dataset.path!); else items.find(item => item.dataset.path === target.dataset.parent)?.focus(); }
  }}>{render(tree, 0)}</ul>;
}
