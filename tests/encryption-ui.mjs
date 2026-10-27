import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), packaged = process.env.MOYE_PACKAGED_EXECUTABLE;
const run = path.join(root, 'test-results', 'encryption-ui-' + Date.now()); await fs.mkdir(run, { recursive: true });
const password = '墨页-长密码-2026-private', marker = '正文密文验证_秘密内容_76189';
const exported = path.join(run, 'protected.moye'), errors = []; let app;
async function launch(suffix = '') {
  app = await electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: packaged ? [] : [root], env: { ...process.env, MOYE_TEST_DATA: path.join(run, 'data' + suffix), MOYE_TEST_WORKSPACE: path.join(run, 'notes' + suffix), MOYE_HEADLESS: '1', MOYE_TEST_LOCALE: 'zh-CN' }, timeout: 60000 });
  const page = await app.firstWindow(); page.on('pageerror', e => errors.push(String(e))); return page;
}
async function unlock(page, pass = password) {
  await page.getByRole('button', { name: '输入密码解锁', exact: true }).click();
  await page.getByLabel('文档密码', { exact: true }).fill(pass); await page.getByRole('button', { name: '解锁', exact: true }).click();
}
async function allFiles(dir) { const out = []; for (const f of await fs.readdir(dir, { withFileTypes: true })) { const full = path.join(dir, f.name); if (f.isDirectory()) out.push(...await allFiles(full)); else out.push(full); } return out; }
try {
  let page = await launch(); await expect(page.locator('.rich-editor h1')).toBeVisible();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText('# 机密文档\n\n' + marker + '\n');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => window.notebook.call('read', { path: '欢迎来到风车笔记.md' })).then(d => d.text)).toContain(marker);
  await page.evaluate(marker => window.notebook.call('recovery', { path: '欢迎来到风车笔记.md', text: '# 机密文档\n\n' + marker + '\n' }), marker);
  await page.getByRole('button', { name: '加密文档', exact: true }).click();
  await page.getByLabel('文档密码', { exact: true }).fill(password); await page.getByLabel('确认密码', { exact: true }).fill('mismatch');
  await page.getByRole('button', { name: '加密正文', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('不一致');
  await page.getByLabel('确认密码', { exact: true }).fill(password); await page.getByRole('button', { name: '加密正文', exact: true }).click();
  await expect(page.getByRole('button', { name: '锁定文档', exact: true })).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const file of await allFiles(path.join(run, 'notes'))) expect((await fs.readFile(file)).includes(Buffer.from(marker)), file).toBe(false);
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('加密后的自动保存');
  await expect(page.locator('.save-status')).toContainText('已保存', { timeout: 10000 });
  await expect.poll(() => page.evaluate(() => window.notebook.call('read', { path: '欢迎来到风车笔记.md' })).then(d => d.text)).toContain('加密后的自动保存');
  await page.getByRole('button', { name: '锁定文档', exact: true }).click(); await expect(page.locator('.locked-document')).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveCount(0); expect(await page.locator('body').textContent()).not.toContain(marker);
  await unlock(page, 'wrong-password'); await expect(page.getByRole('alert')).toContainText('密码错误');
  await page.getByLabel('文档密码', { exact: true }).fill(password); await page.getByRole('button', { name: '解锁', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText(marker);
  await page.getByRole('button', { name: '历史版本', exact: true }).click(); await expect(page.locator('.history-layout button')).not.toHaveCount(0); await page.locator('.history-layout button').first().click(); await expect(page.locator('.history-layout pre')).toContainText(marker); await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  const otherRoot = path.join(run, 'notes-other'); await fs.mkdir(otherRoot); await fs.writeFile(path.join(otherRoot, '欢迎来到风车笔记.md'), '# 另一笔记库\n');
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, otherRoot);
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('切换前的未保存输入');
  await page.locator('.workspace-button').click(); await expect(page.locator('.cm-content')).toContainText('另一笔记库');
  await page.waitForTimeout(350); // Cross the recovery timer boundary after switching libraries.
  for (const file of await allFiles(otherRoot)) expect((await fs.readFile(file)).includes(Buffer.from(marker)), file).toBe(false);
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, path.join(run, 'notes'));
  await page.locator('.workspace-button').click(); await expect(page.locator('.locked-document')).toBeVisible(); await unlock(page); await expect(page.locator('.cm-content')).toContainText('切换前的未保存输入');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, exported);
  await page.getByRole('button', { name: '导出', exact: true }).click(); await expect(page.locator('.export-options label')).toHaveCount(1); await expect(page.locator('.export-options')).toContainText('加密文档 .moye'); await page.getByRole('dialog').getByRole('button', { name: '导出', exact: true }).click();
  await expect.poll(() => fs.readFile(exported).then(b => b.subarray(0, 8).toString('hex')).catch(() => '')).toBe(Buffer.from('MOYEENC\x01').toString('hex'));
  expect(await fs.readFile(exported)).toEqual(await fs.readFile(path.join(run, 'notes/欢迎来到风车笔记.md')));
  await app.close(); app = null; page = await launch(); await expect(page.locator('.locked-document')).toBeVisible(); expect(await page.locator('body').textContent()).not.toContain(marker);
  await unlock(page); await expect(page.locator('.rich-editor')).toContainText(marker);
  await page.getByRole('button', { name: '锁定文档', exact: true }).click();
  if (!packaged) await page.screenshot({ path: path.join(run, 'locked-document.png'), animations: 'disabled', timeout: 15000 });
  await app.close(); app = null;
  page = await launch('-recipient'); await expect(page.locator('.rich-editor h1')).toBeVisible();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, exported);
  await page.getByRole('button', { name: '导入笔记', exact: true }).click(); const imported = page.locator('.note-item[data-path$=".moye"]'); await expect(imported).toHaveCount(1); await imported.click();
  await expect(page.locator('.locked-document')).toBeVisible(); await unlock(page); await expect(page.locator('.rich-editor')).toContainText(marker); await expect(page.locator('.rich-editor')).toContainText('加密后的自动保存');
  const searchResult = await page.evaluate(marker => window.notebook.call('search', { query: marker }), marker); expect(searchResult).toEqual([]);
  expect(errors).toEqual([]); await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: true, packaged: Boolean(packaged), errors }, null, 2)); console.log('Encryption UI checks passed:', run);
} catch (error) { console.error(error); await fs.writeFile(path.join(run, 'result.json'), JSON.stringify({ passed: false, errors, error: String(error) }, null, 2)); process.exitCode = 1; }
finally { if (app) await app.close(); }
