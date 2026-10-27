import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtInThemes } from '../shared/themes.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), packaged = process.env.MOYE_PACKAGED_EXECUTABLE;
const run = path.join(root, 'test-results', 'theme-art-' + Date.now()), notes = path.join(run, 'notes');
await fs.mkdir(path.join(notes, '灵感收藏'), { recursive: true });
const fixture = '# 把灵感，写成自己的宇宙\n\n在繁忙的世界里，为自己留一处有光的角落。这里收藏偶然的心动、未完成的故事，以及每一个值得认真记录的今天。\n\n> 风格是一种表达。让文字有自己的声音，也让写作拥有自己的颜色。\n\n## 今天，开始一场小小的冒险\n\n- [x] 收集一种新的颜色\n- [ ] 写下一个大胆的想法\n\n```javascript\nconst inspiration = {\n  mood: "stay curious",\n  colors: ["aurora", "sunset", "sakura"],\n  create: () => "make something wonderful"\n};\n```\n\n## 明日来信\n\n下一页，留给尚未发生的故事。\n';
await fs.writeFile(path.join(notes, '今日灵感.md'), fixture);
await fs.writeFile(path.join(notes, '灵感收藏/旅行手记.md'), '# 沿途的光');
const options = { ...(packaged ? { executablePath: packaged } : {}), args: packaged ? [] : [root], env: { ...process.env, MOYE_HEADLESS: '1', MOYE_TEST_LOCALE: 'zh-CN', MOYE_TEST_DATA: path.join(run, 'data'), MOYE_TEST_WORKSPACE: notes }, timeout: 60000 };
let app; const errors = [], metrics = [];
try {
  app = await electron.launch(options); let page = await app.firstWindow(); page.on('pageerror', e => errors.push(String(e)));
  await page.locator('.note-item[data-path="今日灵感.md"]').click(); await expect(page.locator('.rich-editor h1')).toContainText('自己的宇宙');
  await page.getByRole('button', { name: '文件树', exact: true }).click();
  const before = await page.evaluate(() => window.notebook.call('read', { path: '今日灵感.md' }));
  for (const theme of builtInThemes) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: theme.name, exact: true }).click();
    await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme-style', theme.appearance);
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', theme.colorScheme);
    const metric = await page.evaluate(() => {
      const editor = document.querySelector('.rich-editor'), art = getComputedStyle(document.querySelector('.editor-column'), ':after');
      const sidebar = document.querySelector('.sidebar');
      return { style: document.documentElement.dataset.themeStyle, artwork: art.backgroundImage, pointerEvents: art.pointerEvents,
        overflow: editor.scrollWidth > editor.clientWidth + 2, text: getComputedStyle(editor).color, rail: getComputedStyle(sidebar).backgroundImage };
    });
    if (theme.id === 'simple') expect(metric.artwork).toBe('none'); else expect(metric.artwork).toContain('gradient'); expect(metric.pointerEvents).toBe('none'); expect(metric.overflow).toBe(false); metrics.push(metric);
    await page.locator('.rich-editor h1').click(); await page.keyboard.press('End'); await page.keyboard.insertText(' ✦');
    await expect(page.locator('.rich-editor h1')).toContainText(' ✦'); await page.keyboard.press('Control+z');
    await expect(page.locator('.rich-editor h1')).not.toContainText(' ✦');
    await expect(page.locator('.save-status')).toContainText('已保存');
    await page.locator('.rich-host').evaluate(el => { el.scrollTop = 0; });
    if (!packaged) await page.screenshot({ path: path.join(run, theme.id + '.png'), animations: 'disabled', timeout: 15000 });
  }
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '黑胶爵士', exact: true }).click();
  if (!packaged) await page.screenshot({ path: path.join(run, 'theme-picker.png'), animations: 'disabled', timeout: 15000 });
  const exported = path.join(run, 'jazz-theme.json');
  await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, exported);
  await page.getByRole('button', { name: '导出主题模板', exact: true }).click();
  await expect.poll(() => fs.readFile(exported, 'utf8').then(JSON.parse).then(x => x.appearance).catch(() => '')).toBe('vinyl');
  await page.getByRole('button', { name: '晨光', exact: true }).click();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, exported);
  await page.getByRole('button', { name: '导入主题 JSON', exact: true }).click();
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme-style', 'vinyl');
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('button', { name: '极光夜航', exact: true }).click(); await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(720, 520));
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThanOrEqual(720);
  expect(await page.locator('.toolbar').evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  expect(await page.locator('.rich-editor').evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  if (!packaged) await page.screenshot({ path: path.join(run, 'small-aurora.png'), animations: 'disabled', timeout: 15000 });
  const after = await page.evaluate(() => window.notebook.call('read', { path: '今日灵感.md' })); expect(after.text).toBe(before.text);
  await app.close(); app = await electron.launch(options); page = await app.firstWindow(); page.on('pageerror', e => errors.push(String(e)));
  await expect(page.locator('html')).toHaveAttribute('data-theme-style', 'aurora');
  expect(errors).toEqual([]); await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: true, packaged: Boolean(packaged), errors, metrics }, null, 2));
  console.log('Theme art checks passed:', run);
} catch (error) { console.error(error); await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: false, packaged: Boolean(packaged), errors, error: String(error) }, null, 2)); process.exitCode = 1; }
finally { if (app) await app.close(); }
