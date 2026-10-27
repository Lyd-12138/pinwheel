import { builtInThemes } from './themes.mjs';

export const systemFonts = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
export const codeFonts = 'ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas, "PingFang SC", "Microsoft YaHei", "Apple Color Emoji", "Segoe UI Emoji", monospace';
export function validateFont(value) {
  if (typeof value !== 'string' || value.length > 100 || /[\x00-\x1f\x7f<>]/.test(value)) throw Error('字体名称无效。');
  return value.trim();
}
export function fontStack(value, code = false) {
  const family = validateFont(value || '');
  return (family ? JSON.stringify(family) + ', ' : '') + (code ? codeFonts : systemFonts);
}
export function migrateThemes(config, id) {
  if (!Array.isArray(config.customThemes)) config.customThemes = config.customTheme ? [{ id, theme: config.customTheme }] : [];
  return config;
}
export function removeTheme(config, id) {
  if (id === 'system' || id === 'simple') throw Error('默认素白主题不能删除。');
  if (builtInThemes.some(t => t.id === id)) {
    config.deletedThemes = [...new Set([...(config.deletedThemes || []), id])];
    if (config.theme === id) config.theme = 'simple';
    return config;
  }
  const found = config.customThemes?.find(t => t.id === id);
  if (!found) throw Error('自定义主题不存在。');
  config.customThemes = config.customThemes.filter(t => t.id !== id);
  if (config.theme === id || config.theme === 'custom' && config.customTheme === found.theme) { config.theme = 'simple'; delete config.customTheme; }
  return config;
}
