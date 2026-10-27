import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), run = path.join(root, 'test-results', 'always-on-top-' + Date.now());
const notes = path.join(run, 'notes'), data = path.join(run, 'data'); await fs.mkdir(notes, { recursive: true });
await fs.writeFile(path.join(notes, '置顶检查.md'), '# 窗口置顶\n\n这篇笔记不会因切换置顶而变化。\n');
const executablePath = process.env.MOYE_PACKAGED_EXECUTABLE;
const options = { ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : [root], env: { ...process.env, MOYE_TEST_DATA: data, MOYE_TEST_WORKSPACE: notes, MOYE_HEADLESS: '1', MOYE_TEST_LOCALE: 'zh-CN' } };
let app, page; const errors = [];
const start = async () => { app = await electron.launch(options); page = await app.firstWindow(); page.on('pageerror', e => errors.push(String(e))); await expect(page.locator('.rich-editor h1')).toHaveText('窗口置顶'); };
const state = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html')).isAlwaysOnTop());
try {
  await start(); expect(await state()).toBe(false); const pin = () => page.getByRole('button', { name: '保持最前', exact: true });
  await expect(pin()).toHaveAttribute('aria-pressed', 'false'); await pin().click(); await expect(pin()).toHaveAttribute('aria-pressed', 'true'); expect(await state()).toBe(true);
  await page.getByRole('button', { name: '设置', exact: true }).click(); await expect(page.getByRole('checkbox', { name: '保持最前', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click(); await app.close(); app = null;
  await start(); expect(await state()).toBe(true); await expect(pin()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('checkbox', { name: '保持最前', exact: true }).uncheck(); await expect(page.getByRole('checkbox', { name: '保持最前', exact: true })).not.toBeChecked(); expect(await state()).toBe(false);
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click(); await expect(pin()).toHaveAttribute('aria-pressed', 'false');
  const invalid = await page.evaluate(() => window.notebook.call('setAlwaysOnTop', { enabled: 'yes' }).then(() => '').catch(e => e.message)); expect(invalid).toContain('无效'); expect(await state()).toBe(false);
  await app.close(); app = null; await start(); expect(await state()).toBe(false); await expect(pin()).toHaveAttribute('aria-pressed', 'false');
  expect(await fs.readFile(path.join(notes, '置顶检查.md'), 'utf8')).toBe('# 窗口置顶\n\n这篇笔记不会因切换置顶而变化。\n'); expect(errors).toEqual([]);
  await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: true, packaged: Boolean(executablePath), errors, checks: ['default off', 'toolbar on', 'settings synced', 'restart on', 'settings off', 'toolbar synced', 'invalid request rejected', 'restart off', 'document unchanged'] }, null, 2)); console.log(run);
} catch (error) { await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: false, errors, error: String(error) }, null, 2)); throw error; }
finally { if (app) await app.close(); }
