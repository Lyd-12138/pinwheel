import { renderMarkdown, headings, isRemote } from '../shared/markdown.mjs';
self.onmessage = event => {
  const { text, note, revision } = event.data;
  try {
    const html = renderMarkdown(text, (url: string, type: string) => {
      if (type === 'image') return isRemote(url) ? '' : 'mnote://asset?note=' + encodeURIComponent(note) + '&url=' + encodeURIComponent(url);
      return url;
    });
    self.postMessage({ revision, html, headings: headings(text.replaceAll('\r\n', '\n')) });
  } catch (e) { self.postMessage({ revision, error: String(e) }); }
};
