import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packaged = process.env.MOYE_PACKAGED_EXECUTABLE;
const output = path.join(root, 'test-results', ...(packaged ? ['packaged'] : [])); await fs.mkdir(output, { recursive: true });
const run = path.join(output, 'run-' + Date.now()); await fs.mkdir(run, { recursive: true });
const errors = [], consoleErrors = [];
let application;
try {
  application = await electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: packaged ? [] : [root], env: { ...process.env, MOYE_TEST_DATA: path.join(run, 'data'), MOYE_TEST_WORKSPACE: path.join(run, 'notes'), MOYE_HEADLESS: '1', MOYE_TEST_LOCALE: 'zh-CN', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }, timeout: 60000 });
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await expect(page.getByRole('button', { name: '欢迎来到风车笔记 Markdown 笔记' })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.rich-editor h1')).not.toHaveCount(0);
  await expect(page.locator('.outline button')).not.toHaveCount(0);
  await expect(page.locator('.mode-switch button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Markdown', exact: true })).toHaveClass('selected');
  if (!packaged) await page.screenshot({ path: path.join(output, '01-writing.png') });
  // Every view mode reads the same document; switching must not alter text.
  const before = await page.evaluate(() => window.notebook.call('read', { path: '欢迎来到风车笔记.md' }));
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('欢迎来到风车笔记');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('.rich-editor h1')).toHaveText('欢迎来到风车笔记');
  await expect(page.locator('.rich-editor .katex')).not.toHaveCount(0);
  await expect(page.locator('.rich-editor svg')).not.toHaveCount(0, { timeout: 20000 });
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const unchanged = await page.evaluate(() => window.notebook.call('read', { path: '欢迎来到风车笔记.md' }));
  expect(unchanged.hash).toBe(before.hash);
  // Editing a styled heading must never reveal Markdown markers.
  await page.locator('.rich-editor h1').click();
  await page.keyboard.press('End'); await page.keyboard.insertText('直接编辑');
  await expect(page.locator('.rich-editor h1')).toHaveText('欢迎来到风车笔记直接编辑');
  await expect(page.locator('.rich-editor')).not.toContainText('# 欢迎');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.rich-editor h1')).toHaveText('欢迎来到风车笔记');
  await page.locator('.rich-editor strong').first().click();
  await page.keyboard.insertText('加粗输入');
  await expect(page.locator('.rich-editor strong').first()).toContainText('加粗输入');
  await page.keyboard.press('Control+z');
  // Direct table cell editing and task toggles retain their displayed form.
  await page.locator('.rich-editor td').first().click();
  await page.keyboard.insertText('单元格编辑');
  await expect(page.locator('.rich-editor td').first()).toContainText('单元格编辑');
  await page.keyboard.press('Control+z');
  const task = page.locator('.rich-editor input[type=checkbox]').first();
  await task.uncheck(); await expect(task).not.toBeChecked();
  await page.locator('.rich-editor h1').click(); await page.keyboard.press('Control+z');
  await expect(task).toBeChecked();

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '夜色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '关闭对话框' }).click();
  if (!packaged) await page.screenshot({ path: path.join(output, '02-dark.png') });
  await page.locator('.note-list').click({ button: 'right', position: { x: 30, y: 10 } });
  await page.getByRole('menuitem', { name: '新建文件', exact: true }).click();
  await page.getByPlaceholder('例如：今天的灵感').fill('交互测试');
  await page.getByRole('button', { name: '创建文件', exact: true }).click();
  await expect(page.locator('.breadcrumb strong')).toHaveText('交互测试');
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('中文输入与自动保存。\n\n- [ ] 待办事项\n');
  await expect(page.locator('.save-status')).toContainText('已保存', { timeout: 10000 });
  const saved = await page.evaluate(() => window.notebook.call('read', { path: '交互测试.md' }));
  expect(saved.text).toContain('中文输入与自动保存。');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.locator('.rich-editor p').filter({ hasText: '中文输入与自动保存。' }).click();
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.getByTitle('粗体 Ctrl+B', { exact: true }).click();
  await expect(page.locator('.rich-editor strong')).toHaveText('中文输入与自动保存。');
  await page.keyboard.press('ArrowRight'); await page.keyboard.insertText('样式内继续输入');
  await expect(page.locator('.rich-editor strong')).toContainText('样式内继续输入');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status')).toContainText('已保存');
  const richSaved = await page.evaluate(() => window.notebook.call('read', { path: '交互测试.md' }));
  expect(richSaved.text).toContain('**中文输入与自动保存。样式内继续输入**');
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('**中文输入与自动保存。样式内继续输入**');
  // Insert binary image through the same bridge used by paste/drop.
  const inserted = await page.evaluate(async () => window.notebook.call('attachBytes', { path: '交互测试.md', name: '测试图.png', bytes: Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0)) }));
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+End');
  await page.keyboard.insertText(`\n![图片](${inserted.url})\n`);
  await expect(page.locator('.save-status')).toContainText('已保存');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('.rich-editor img[src]')).toBeVisible();
  await expect.poll(() => page.locator('.rich-editor img[src]').evaluate(img => img.naturalWidth)).toBe(1);
  // Undo still works across view changes.
  await page.locator('.rich-editor').click(); await page.keyboard.press('Control+z');
  await expect(page.locator('.rich-editor img[src]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.locator('.rich-editor img[src]')).toHaveCount(1);
  await page.getByRole('button', { name: '历史版本' }).click();
  await expect(page.locator('.history-layout button')).not.toHaveCount(0);
  await page.getByRole('button', { name: '关闭对话框' }).click();
  // Intercept native dialogs only inside this test process.
  await page.locator('.rich-editor').click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
  await page.getByTitle('插入表格', { exact: true }).click();
  await page.getByRole('textbox', { name: '第1行第1列' }).fill('测试列');
  await page.getByRole('textbox', { name: '第2行第1列' }).fill('保留 | 竖线');
  await page.getByRole('button', { name: '应用表格' }).click();
  await expect(page.locator('.rich-editor th')).toContainText(['测试列']);
  await page.locator('.rich-editor td').filter({ hasText: '保留 | 竖线' }).click();
  await page.getByTitle('插入表格', { exact: true }).click();
  await page.getByRole('button', { name: '应用表格' }).click();
  await expect(page.locator('.rich-editor td').first()).toHaveText('保留 | 竖线');
  await expect(page.locator('.save-status')).toContainText('已保存');
  const newAssets = path.join(run, 'custom-assets'); await fs.mkdir(newAssets);
  await application.evaluate(({ dialog }, dest) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dest] }); }, newAssets);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
  await expect(page.locator('.path-setting')).toContainText('custom-assets');
  await page.getByRole('button', { name: '将本篇附件整理到当前文件夹' }).click();
  await expect(page.locator('.toast')).toContainText('已整理');
  expect((await fs.readdir(newAssets)).length).toBeGreaterThan(0);
  await application.evaluate(({ dialog }, src) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [src] }); }, path.join(root, 'themes/ink-blue.json'));
  await page.getByRole('button', { name: '导入主题 JSON' }).click();
  await expect(page.getByRole('button', { name: '蓝墨', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('html').evaluate(el => el.style.getPropertyValue('--accent'))).toBe('#4f759a');
  if (!packaged) await page.screenshot({ path: path.join(output, '03-settings.png') });
  await page.getByRole('button', { name: '关闭对话框' }).click();
  await expect(page.locator('.save-status')).toContainText('已保存');
  await expect.poll(() => page.locator('.rich-editor img[src]').evaluate(img => img.naturalWidth)).toBe(1);
  await application.evaluate(({ dialog }, dest) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: dest }); }, path.join(run, 'test.notepack'));
  const exported = await page.evaluate(async () => { const d = await window.notebook.call('read', { path: '交互测试.md' }); return window.notebook.call('export', { ...d, format: 'pack' }); });
  expect((await fs.stat(exported.path)).size).toBeGreaterThan(100);
  await application.evaluate(({ dialog }, src) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [src] }); }, exported.path);
  const imported = await page.evaluate(() => window.notebook.call('import'));
  expect(imported.count).toBe(1);
  // Verify PDF and HTML production exports, including resource embedding.
  for (const format of ['html', 'pdf']) {
    const dest = path.join(run, 'document.' + format);
    await application.evaluate(({ dialog }, dest) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: dest }); }, dest);
    await page.evaluate(async format => { const d = await window.notebook.call('read', { path: '交互测试.md' }); return window.notebook.call('export', { ...d, format }); }, format);
    expect((await fs.stat(dest)).size).toBeGreaterThan(100);
  }
  await application.evaluate(({ dialog }, dest) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: dest }); }, path.join(run, 'welcome.pdf'));
  await page.evaluate(async () => { const d = await window.notebook.call('read', { path: '欢迎来到风车笔记.md' }); return window.notebook.call('export', { ...d, format: 'pdf' }); });
  expect(errors, 'renderer errors').toEqual([]);
  await fs.writeFile(path.join(output, 'desktop-results.json'), JSON.stringify({ passed: true, packaged: Boolean(packaged), errors, consoleErrors, run }, null, 2));
  console.log('Desktop checks passed: editing, rendering, themes, save, image, undo, history, package import/export, HTML/PDF.');
} catch (error) {
  console.error(error);
  if (application) { try { const page = await application.firstWindow(); await page.screenshot({ path: path.join(output, 'failure.png') }); console.error(await page.locator('body').innerText()); } catch {} }
  await fs.writeFile(path.join(output, 'desktop-results.json'), JSON.stringify({ passed: false, error: String(error), errors, consoleErrors, run }, null, 2));
  process.exitCode = 1;
} finally { if (application) await application.close(); }
