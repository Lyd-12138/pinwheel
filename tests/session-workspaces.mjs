import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), packaged = process.env.MOYE_PACKAGED_EXECUTABLE;
const run = path.join(root, 'test-results', 'session-workspaces-' + Date.now()), a = path.join(run, '目录甲'), b = path.join(run, '目录乙');
for (const folder of [a, b]) { await fs.mkdir(folder, { recursive: true }); await fs.writeFile(path.join(folder, '首页.md'), '# 首页'); await fs.writeFile(path.join(folder, '长文.md'), '# ' + path.basename(folder) + '\n\n' + Array.from({ length: 80 }, (_, i) => `## 章节 ${i}\n\n记住阅读进度，文字始终保留。\n\n`).join('')); }
const options = { ...(packaged ? { executablePath: packaged } : {}), args: packaged ? [] : [root], env: { ...process.env, MOYE_HEADLESS: '1', MOYE_TEST_LOCALE: 'zh-CN', MOYE_TEST_DATA: path.join(run, 'data'), MOYE_TEST_WORKSPACE: a }, timeout: 60000 };
let app; const errors = [];
try {
  app = await electron.launch(options); let page = await app.firstWindow(); page.on('pageerror', e => errors.push(String(e)));
  await page.locator('.note-item[data-path="长文.md"]').click(); await expect(page.locator('.rich-editor h1')).toHaveText('目录甲'); await page.waitForTimeout(500); await page.locator('.rich-host').evaluate(el => { el.scrollTop = 1200; });
  const choose = async folder => { await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, folder); await page.locator('.workspace-button').click(); };
  await choose(b); await page.locator('.note-item[data-path="长文.md"]').click(); await expect(page.locator('.rich-editor h1')).toHaveText('目录乙'); await page.getByRole('button', { name: '源码', exact: true }).click(); await page.waitForTimeout(500); await page.locator('.cm-scroller').evaluate(el => { el.scrollTop = 2100; });
  await choose(a); await expect(page.locator('.rich-editor h1')).toHaveText('目录甲'); await expect(page.getByRole('button', { name: 'Markdown', exact: true })).toHaveClass('selected'); await expect.poll(() => page.locator('.rich-host').evaluate(el => Math.abs(el.scrollTop - 1200))).toBeLessThanOrEqual(4);
  await choose(b); await expect(page.getByRole('button', { name: '源码', exact: true })).toHaveClass('selected'); await expect.poll(() => page.locator('.cm-scroller').evaluate(el => Math.abs(el.scrollTop - 2100))).toBeLessThanOrEqual(4);
  await app.close(); app = await electron.launch({ ...options, env: { ...options.env, MOYE_TEST_WORKSPACE: '' } }); page = await app.firstWindow(); page.on('pageerror', e => errors.push(String(e))); await expect(page.locator('.breadcrumb strong')).toHaveText('长文'); await expect(page.locator('.workspace-button>span')).toContainText('目录乙'); await expect(page.getByRole('button', { name: '源码', exact: true })).toHaveClass('selected'); await expect.poll(() => page.locator('.cm-scroller').evaluate(el => Math.abs(el.scrollTop - 2100))).toBeLessThanOrEqual(4);
  // A pet enabled at exit must return without replacing the main window.
  await page.evaluate(() => window.notebook.call('petSettings', { enabled: true })); await expect.poll(() => app.windows().length).toBe(2); await app.close(); app = await electron.launch({ ...options, env: { ...options.env, MOYE_TEST_WORKSPACE: '' } }); page = await app.firstWindow(); await expect(page.locator('.breadcrumb strong')).toHaveText('长文'); await expect.poll(() => app.windows().length).toBe(2); const pet = app.windows().find(p => p.url().includes('pet=1')); await expect(pet.locator('.pet-figure')).toHaveAttribute('aria-label', '与云朵猫互动');
  await page.evaluate(() => window.notebook.call('petSettings', { enabled: false })); await expect.poll(() => app.windows().length).toBe(1);
  expect(errors).toEqual([]); await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: true, packaged: Boolean(packaged), errors }, null, 2)); console.log('Per-workspace and pet restart checks passed:', run);
} catch (error) { console.error(error); await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: false, errors, error: String(error) }, null, 2)); process.exitCode = 1; }
finally { if (app) await app.close(); }
