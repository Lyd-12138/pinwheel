import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = path.join(root, 'test-results', 'window-theme-' + Date.now()), notes = path.join(run, 'notes');
await fs.mkdir(notes, { recursive: true });
const fixture = '# 给文字一片天空\n\n> 慢慢写，让每一次落笔都成为新的开始。\n\n## 今日灵感\n\n窗外的光落在书桌上。整理想法、记录片刻，也为下一次灵感留一点空间。笔记随窗口展开，主题为写作添一份心情。\n\n- [x] 留下一段值得记住的文字\n- [ ] 为新的想法起个名字\n\n## 一点结构\n\n```javascript\nconst inspiration = {\n  title: "今天的微光",\n  keepWriting: true\n};\n```\n\n' + '| ' + Array.from({ length: 10 }, (_, i) => '栏目 ' + i).join(' | ') + ' |\n|' + ' --- |'.repeat(10) + '\n|' + ' 内容可自动换行 |'.repeat(10) + '\n\n## 长行检查\n\n' + 'longword'.repeat(120) + '\n\n```python\nmessage = "' + 'longword'.repeat(120) + '"\n```\n';
await fs.writeFile(path.join(notes, '随笔.md'), fixture);
const packaged = process.env.PINWHEEL_PACKAGED_EXECUTABLE;
const options = { ...(packaged ? { executablePath: packaged } : {}), args: packaged ? [] : [root], env: { ...process.env, PINWHEEL_TEST_DATA: path.join(run, 'data'), PINWHEEL_TEST_WORKSPACE: notes, PINWHEEL_HEADLESS: '1', PINWHEEL_TEST_LOCALE: 'zh-CN' }, timeout: 60000 };
let app; const errors = [];
try {
  app = await electron.launch(options); let page = await app.firstWindow(); page.on('pageerror', e => errors.push(String(e)));
  await expect(page.locator('.rich-editor h1')).toHaveText('给文字一片天空');
  const before = await page.evaluate(() => window.notebook.call('read', { path: '随笔.md' }));
  const sizes = [];
  for (const [width, height] of [[1920,1080], [1380,900], [920,700], [720,520]]) {
    await app.evaluate(({ BrowserWindow }, { width, height }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html')).setSize(width, height), { width, height });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThanOrEqual(width);
    await expect.poll(() => page.locator('.rich-editor').evaluate(el => Math.abs(el.clientWidth - document.querySelector('.rich-host').clientWidth))).toBeLessThan(3);
    const metrics = await page.evaluate(() => {
      const rich = document.querySelector('.rich-editor'), toolbar = document.querySelector('.toolbar');
      return { viewport: innerWidth, editor: rich.clientWidth, overflow: rich.scrollWidth > rich.clientWidth + 2, toolbarOverflow: toolbar.scrollWidth > toolbar.clientWidth + 2,
        codeOverflow: [...document.querySelectorAll('.rich-editor pre')].some(el => el.scrollWidth > el.clientWidth + 2),
        footerBottom: document.querySelector('.statusbar').getBoundingClientRect().bottom, height: innerHeight };
    });
    expect(metrics.overflow).toBe(false); expect(metrics.toolbarOverflow).toBe(false); expect(metrics.codeOverflow).toBe(false); expect(metrics.footerBottom).toBeLessThanOrEqual(metrics.height + 1); sizes.push(metrics);
  }
  await page.getByRole('button', { name: '隐藏笔记栏', exact: true }).click();
  expect(await page.locator('.rich-editor').evaluate(el => el.clientWidth)).toBeGreaterThan(650);
  await page.getByRole('button', { name: '源码', exact: true }).click();
  expect(await page.locator('.cm-scroller').evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.getByRole('button', { name: '显示笔记栏', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '极光夜航', exact: true }).click();
  await page.getByRole('button', { name: '关闭对话框' }).click();
  expect(await page.locator('.editor-column').evaluate(el => getComputedStyle(el, ':before').backgroundImage)).toContain('gradient');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1380,900));
  await page.getByRole('tab', { name: '大纲', exact: true }).click();
  if (!packaged) await page.screenshot({ path: path.join(run, 'aurora-background.png'), animations: 'disabled', timeout: 15000 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await app.evaluate(({ dialog }, dest) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: dest }); }, path.join(run, 'exported-theme.json'));
  await page.getByRole('button', { name: '导出主题模板', exact: true }).click();
  await expect.poll(() => fs.readFile(path.join(run, 'exported-theme.json'), 'utf8').then(JSON.parse).then(theme => theme.themeApiVersion).catch(() => null)).toBe(2);
  const exported = JSON.parse(await fs.readFile(path.join(run, 'exported-theme.json'), 'utf8'));
  expect(exported.background.pattern).toBe('aurora'); expect(exported.workspace).toBeUndefined();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.join(root, 'themes/theme-template.json'));
  await page.getByRole('button', { name: '导入主题 JSON', exact: true }).click();
  await expect(page.getByRole('button', { name: '我的海盐手帐', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭对话框' }).click();
  expect(await page.locator('html').evaluate(el => el.style.getPropertyValue('--canvas-opacity'))).toBe('0.2');
  expect(await page.locator('html').evaluate(el => el.style.getPropertyValue('--heading-font'))).toContain('Georgia');
  if (!packaged) await page.screenshot({ path: path.join(run, 'custom-background.png'), animations: 'disabled', timeout: 15000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(720,520));
  if (!packaged) await page.screenshot({ path: path.join(run, 'small-window.png'), animations: 'disabled', timeout: 15000 });
  expect((await page.evaluate(() => window.notebook.call('read', { path: '随笔.md' }))).hash).toBe(before.hash);
  await app.close(); app = await electron.launch(options); page = await app.firstWindow(); page.on('pageerror', e => errors.push(String(e)));
  await expect.poll(() => page.locator('html').evaluate(el => el.style.getPropertyValue('--canvas-opacity'))).toBe('0.2');
  await expect(page.locator('.rich-editor h1')).toHaveText('给文字一片天空');
  expect(errors).toEqual([]);
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: true, packaged: Boolean(packaged), errors, sizes }, null, 2));
  console.log('Window/theme checks passed:', run);
} catch (error) { console.error(error); await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: false, errors, error: String(error) }, null, 2)); process.exitCode=1; }
finally { if(app) await app.close(); }
