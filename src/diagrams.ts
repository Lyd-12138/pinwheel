let pending = Promise.resolve();
export function drawDiagrams(root: HTMLElement) {
  for (const code of root.querySelectorAll('code.language-mermaid')) {
    pending = pending.then(async () => {
      if (!code.isConnected) return;
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.dataset.colorScheme === 'dark' ? 'dark' : 'default' });
      const id = 'diagram-' + crypto.randomUUID().replaceAll('-', '');
      try { const { svg } = await mermaid.render(id, code.textContent || ''); if (code.isConnected) code.parentElement!.innerHTML = svg; }
      catch { document.getElementById('d' + id)?.remove(); }
    }).catch(() => {});
  }
  return pending;
}
