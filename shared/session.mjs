export function validateSession(input) {
  const validPath = p => typeof p === 'string' && p.length < 1024 && !/^[\\/]|^[a-z]:|[\x00-\x1f]/i.test(p) && !p.split(/[\\/]/).some(c => c === '..' || c === '__proto__' || c === 'constructor');
  if (!input || typeof input !== 'object') throw Error('会话资料无效。');
  const views = Object.create(null);
  for (const [key, value] of Object.entries(input.views || {}).slice(-100)) {
    if (!validPath(key) || !value || typeof value !== 'object') continue;
    const view = { mode: value.mode === 'source' ? 'source' : 'markdown' };
    for (const field of ['richTop', 'sourceTop', 'richAnchor', 'richHead', 'sourceAnchor', 'sourceHead']) view[field] = Number.isFinite(value[field]) ? Math.max(0, Math.min(1e9, value[field])) : 0;
    if (Number.isFinite(value.sourceScrollAnchor)) { view.sourceScrollAnchor = Math.max(0, Math.min(1e9, value.sourceScrollAnchor)); view.sourceScrollOffset = Number.isFinite(value.sourceScrollOffset) ? Math.max(-1e9, Math.min(1e9, value.sourceScrollOffset)) : 0; }
    views[key] = view;
  }
  return { lastPath: validPath(input.lastPath) ? input.lastPath : '', mode: input.mode === 'source' ? 'source' : 'markdown', collapsed: (Array.isArray(input.collapsed) ? input.collapsed : []).filter(validPath).slice(0, 1000), views };
}
