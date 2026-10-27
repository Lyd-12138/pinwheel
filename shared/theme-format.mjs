export const themeFonts = {
  sans: '"Segoe UI","Microsoft YaHei",sans-serif',
  serif: 'Georgia,"SimSun",serif',
  mono: '"Cascadia Code",Consolas,"Microsoft YaHei",monospace',
};
export const backgroundPatterns = ['none', 'paper', 'dots', 'grid', 'waves', 'aurora', 'petals', 'rings'];
export const themeAppearances = ['plain','light','dark','paper','ocean','sakura','mint','sunset','aurora','vinyl','forest','brutalism','ink','blueprint'];
export const themeIconNames = ['pin','brand','panel','book','plus','search','file','folder','settings','export','import','image','link','clock','check','arrow','close','outline','list','code','table','quote','bullets','tasks','lock','copy','rename'];
const hex = value => typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);
export function validateTheme(theme) {
  if (!theme || ![1, 2].includes(theme.themeApiVersion) || typeof theme.name !== 'string' || !theme.name.trim() || !theme.tokens || !['light', 'dark'].includes(theme.colorScheme)) throw Error('主题格式无效，需要版本 1 或 2、name、colorScheme 和 tokens。');
  const tokens = {};
  for (const key of ['bg','sidebar','panel','text','muted','border','accent','accent-bg','hover','code']) {
    if (!hex(theme.tokens[key])) throw Error('主题颜色必须是六位十六进制颜色：' + key);
    tokens[key] = theme.tokens[key];
  }
  const result = { themeApiVersion: theme.themeApiVersion, name: theme.name.trim().slice(0, 40), colorScheme: theme.colorScheme, tokens };
  if (theme.themeApiVersion === 2) {
    if (theme.appearance !== undefined && !themeAppearances.includes(theme.appearance)) throw Error('不支持的主题风格，请使用模板中的 appearance 名称。');
    result.appearance = theme.appearance || 'plain';
    const typography = theme.typography || { body: 'sans', heading: 'sans' };
    if (!Object.hasOwn(themeFonts, typography.body) || !Object.hasOwn(themeFonts, typography.heading)) throw Error('字体请选择 sans、serif 或 mono。');
    if (typography.interface !== undefined && !Object.hasOwn(themeFonts, typography.interface)) throw Error('界面字体请选择 sans、serif 或 mono。');
    result.typography = { body: typography.body, heading: typography.heading, interface: typography.interface || 'sans' };
    const background = theme.background || { pattern: 'none', color: tokens.accent, secondary: tokens.border, opacity: 0.12, size: 48 };
    if (!backgroundPatterns.includes(background.pattern) || !hex(background.color) || !hex(background.secondary) || !Number.isFinite(background.opacity) || background.opacity < 0 || background.opacity > 0.5 || !Number.isFinite(background.size) || background.size < 16 || background.size > 256) throw Error('背景参数无效：请使用模板中的图案、颜色，透明度 0–0.5，间距 16–256。');
    result.background = { pattern: background.pattern, color: background.color, secondary: background.secondary, opacity: background.opacity, size: background.size };
    if (theme.ui !== undefined) {
      if (!theme.ui || typeof theme.ui !== 'object' || Array.isArray(theme.ui)) throw Error('ui 需要是包含 labels 和 icons 的对象。');
      const labels = {}, icons = {};
      if (theme.ui.labels !== undefined) {
        if (!theme.ui.labels || typeof theme.ui.labels !== 'object' || Array.isArray(theme.ui.labels) || Object.keys(theme.ui.labels).length > 200) throw Error('界面文案最多 200 项。');
        for (const [key, value] of Object.entries(theme.ui.labels)) {
          if (!key || key.length > 100 || typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f]/.test(value)) throw Error('界面文案需要是简短的文字。');
          Object.defineProperty(labels, key, { value, enumerable: true });
        }
      }
      if (theme.ui.icons !== undefined) {
        if (!theme.ui.icons || typeof theme.ui.icons !== 'object' || Array.isArray(theme.ui.icons) || Object.keys(theme.ui.icons).length > themeIconNames.length) throw Error('图标配置无效。');
        for (const [key, icon] of Object.entries(theme.ui.icons)) {
          if (!themeIconNames.includes(key)) throw Error('不支持的图标名称：' + key);
          const glyphValid = value => typeof value === 'string' && value.trim() && value.length <= 24 && !/[\x00-\x1f]/.test(value);
          if (typeof icon === 'string') { if (!glyphValid(icon)) throw Error('图标文字过长或为空。'); icons[key] = icon; continue; }
          if (!icon || typeof icon !== 'object' || Array.isArray(icon) || icon.color !== undefined && !hex(icon.color) || icon.strokeWidth !== undefined && (!Number.isFinite(icon.strokeWidth) || icon.strokeWidth < 0.5 || icon.strokeWidth > 4)) throw Error('图标的颜色或线宽无效。');
          const output = {};
          if (icon.glyph !== undefined) { if (!glyphValid(icon.glyph)) throw Error('图标文字无效。'); output.glyph = icon.glyph; }
          else {
            if (!Array.isArray(icon.paths) || !icon.paths.length || icon.paths.length > 8 || icon.paths.some(d => typeof d !== 'string' || !d || d.length > 2048 || !/^[MmLlHhVvCcSsQqTtAaZzEe0-9.,+\-\s]+$/.test(d))) throw Error('SVG 图标请使用 1–8 条有效路径，不包含标签或脚本。');
            output.paths = [...icon.paths];
          }
          if (icon.color) output.color = icon.color;
          if (icon.strokeWidth) output.strokeWidth = icon.strokeWidth;
          icons[key] = output;
        }
      }
      result.ui = { labels, icons };
    }
  }
  return result;
}

export function backgroundStyle(background) {
  const off = { image: 'none', size: 'auto', opacity: '0' };
  if (!background || !backgroundPatterns.includes(background.pattern) || !hex(background.color) || !hex(background.secondary)) return off;
  const a = background.color, b = background.secondary, gap = Math.max(16, Math.min(256, background.size || 48));
  const images = {
    none: 'none',
    paper: `repeating-linear-gradient(0deg,transparent 0px,transparent 3px,${a} 4px,transparent 5px),repeating-linear-gradient(90deg,transparent 0px,transparent 7px,${b} 8px,transparent 9px)`,
    dots: `radial-gradient(circle,${a} 1px,transparent 1.5px)`,
    grid: `linear-gradient(${a} 1px,transparent 1px),linear-gradient(90deg,${b} 1px,transparent 1px)`,
    waves: `radial-gradient(ellipse at 5% 100%,${a} 0%,transparent 55%),radial-gradient(ellipse at 100% 0%,${b} 0%,transparent 60%)`,
    aurora: `radial-gradient(ellipse at 0% 0%,${a} 0%,transparent 55%),radial-gradient(ellipse at 100% 100%,${b} 0%,transparent 55%),linear-gradient(125deg,transparent 25%,${a} 50%,transparent 75%)`,
    petals: `radial-gradient(ellipse 5px 9px at 25% 30%,${a} 95%,transparent),radial-gradient(ellipse 7px 4px at 75% 75%,${b} 95%,transparent)`,
    rings: `repeating-radial-gradient(circle at 100% 100%,transparent 0px,transparent 34px,${a} 35px,transparent 36px,transparent 68px,${b} 69px,transparent 70px)`,
  };
  return { image: images[background.pattern], size: ['dots','grid','petals'].includes(background.pattern) ? `${gap}px ${gap}px` : '100% 100%', opacity: String(Math.max(0, Math.min(0.5, background.opacity || 0))) };
}

export function themeTemplate(theme) {
  const font = theme.font?.includes('SimSun') ? 'serif' : 'sans';
  return validateTheme({ themeApiVersion: 2, name: theme.name, colorScheme: theme.colorScheme, tokens: theme.tokens,
    appearance: theme.appearance || 'plain',
    typography: theme.typography || { body: font, heading: font, interface: 'sans' },
    background: theme.background || { pattern: 'none', color: theme.tokens.accent, secondary: theme.tokens.border, opacity: 0.12, size: 48 },
    ui: theme.ui || { labels: { '风车笔记': '风车笔记', 'pinwheel': 'pinwheel', '笔记': '笔记', '大纲': '大纲', '设置': '设置' }, icons: {} },
  });
}
