const palette = (bg, sidebar, panel, text, muted, border, accent, accentBg, hover, code) => ({ bg, sidebar, panel, text, muted, border, accent, 'accent-bg': accentBg, hover, code });
const sans = '"Segoe UI","Microsoft YaHei",sans-serif';
const serif = 'Georgia,"SimSun",serif';
const presets = [
  { id: 'simple', name: '素白', mood: '纯色 · 安静书写', colorScheme: 'light', font: sans, tokens: palette('#ffffff','#f5f6f8','#f7f8fa','#30343b','#79818d','#e5e8ee','#586779','#edf0f4','#eef1f5','#f5f6f8') },
  { id: 'light', name: '晨光', mood: '日光棱镜 · 暖色艺廊', colorScheme: 'light', font: sans, tokens: palette('#fffaf2','#2a203c','#fff1e1','#392c48','#82677c','#e8d7cc','#bc473f','#ffe2cc','#f8eada','#f7eadb') },
  { id: 'dark', name: '夜色', mood: '酸绿信号 · 午夜终端', colorScheme: 'dark', font: sans, tokens: palette('#101522','#090e19','#182033','#e4eefa','#9caec4','#35425a','#b8ff65','#283e27','#233044','#182335') },
  { id: 'paper', name: '纸笺', mood: '勃艮第红 · 复古书刊', colorScheme: 'light', font: serif, tokens: palette('#fff2d9','#571e2c','#f8e7c8','#4c302c','#876c54','#d3b99a','#a23238','#f0d3bb','#f6e5c7','#f0dfbf') },
  { id: 'ocean', name: '潮汐蓝', mood: '深海蓝调 · 流光水域', colorScheme: 'dark', font: sans, tokens: palette('#081f36','#052b45','#10344b','#ddf5ff','#91bbce','#265269','#66e7ef','#144956','#163b53','#102f46') },
  { id: 'sakura', name: '樱花手札', mood: '玫瑰幻梦 · 花瓣来信', colorScheme: 'light', font: serif, tokens: palette('#fff6fc','#f6d9ef','#ffe9f6','#5d2b50','#956181','#e8bad8','#b72077','#f8cbe6','#f8dced','#fae8f5') },
  { id: 'mint', name: '薄荷汽水', mood: '酸橙波普 · 灵感爆炸', colorScheme: 'light', font: sans, tokens: palette('#f5ffe9','#caf779','#e9f8d6','#203c30','#597650','#a1bd84','#385bc2','#d9e1ff','#e4f2ce','#e9f3d9') },
  { id: 'sunset', name: '落日影院', mood: '橘红胶片 · 日落放映', colorScheme: 'dark', font: sans, tokens: palette('#291626','#391a30','#3d2333','#ffe9db','#d4a39d','#744453','#ffb65e','#65372f','#4d2a3c','#382330') },
  { id: 'aurora', name: '极光夜航', mood: '紫电青芒 · 霓虹宇宙', colorScheme: 'dark', font: sans, tokens: palette('#100e29','#191337','#201d40','#edf0ff','#a6a3cd','#4b3f76','#65f3d6','#254846','#312952','#1c203c') },
  { id: 'vinyl', name: '黑胶爵士', mood: '香槟黑金 · 深夜唱片', colorScheme: 'dark', font: serif, tokens: palette('#1b1814','#0f0e0c','#29241c','#f2e3c5','#b7a482','#655334','#edc36e','#443720','#342d20','#272219') },
  { id: 'forest', name: '苔原来信', mood: '植物森系 · 林间标本', colorScheme: 'light', font: serif, tokens: palette('#f2f5e9','#dce5d0','#e6eddc','#304d39','#657a60','#bacaaa','#3d7251','#d3e5ca','#dde9d4','#e3eadb') },
  { id: 'brutalism', name: '红黑宣言', mood: '极简海报 · 锐利网格', colorScheme: 'light', font: sans, tokens: palette('#faf8f1','#ee4434','#f0ede3','#171717','#656058','#beb8a9','#b52b22','#f8d9ca','#e9e5da','#eeebe1') },
  { id: 'ink', name: '水墨山岚', mood: '东方意境 · 留白远山', colorScheme: 'light', font: serif, tokens: palette('#f5f4ed','#e3e6df','#e9ebe4','#263c3b','#647773','#bfc9c1','#9c3c32','#eee0d3','#dde5db','#e6e9e1') },
  { id: 'blueprint', name: '蓝图工坊', mood: '工程蓝图 · 精密构想', colorScheme: 'dark', font: sans, tokens: palette('#113b76','#082c60','#194881','#e9f3ff','#a5c5e6','#4d78ab','#b8eeff','#275487','#204b7c','#123565') },
];

const backgrounds = {
  simple: { pattern: 'none', color: '#ffffff', secondary: '#ffffff', opacity: 0, size: 48 },
  light: { pattern: 'waves', color: '#ffbd78', secondary: '#efb8da', opacity: 0.32, size: 48 },
  dark: { pattern: 'grid', color: '#4a658b', secondary: '#304c68', opacity: 0.12, size: 48 },
  paper: { pattern: 'paper', color: '#b8976d', secondary: '#b7a17b', opacity: 0.12, size: 48 },
  ocean: { pattern: 'waves', color: '#1469a8', secondary: '#18b6bd', opacity: 0.45, size: 48 },
  sakura: { pattern: 'petals', color: '#d364a7', secondary: '#ab83d4', opacity: 0.22, size: 136 },
  mint: { pattern: 'grid', color: '#68a34b', secondary: '#88b95c', opacity: 0.13, size: 32 },
  sunset: { pattern: 'waves', color: '#b3395e', secondary: '#d46e3e', opacity: 0.48, size: 48 },
  aurora: { pattern: 'aurora', color: '#176b75', secondary: '#8639bf', opacity: 0.42, size: 48 },
  vinyl: { pattern: 'rings', color: '#c9a058', secondary: '#82613a', opacity: 0.2, size: 48 },
  forest: { pattern: 'paper', color: '#769267', secondary: '#9aab80', opacity: 0.1, size: 48 },
  brutalism: { pattern: 'none', color: '#b52b22', secondary: '#171717', opacity: 0, size: 48 },
  ink: { pattern: 'paper', color: '#8e9e91', secondary: '#c0c6bc', opacity: 0.08, size: 48 },
  blueprint: { pattern: 'grid', color: '#8fbee0', secondary: '#8fbee0', opacity: 0.2, size: 24 },
};
export const themeFamilies = [
  { id:'minimal', name:'简洁纯色', description:'干净、专注与日常书写' },
  { id:'landscape', name:'光影风景', description:'棱镜、海洋与日落' },
  { id:'nature', name:'自然手帐', description:'花瓣与森林植物' },
  { id:'heritage', name:'复古典藏', description:'书刊与黑胶唱片' },
  { id:'graphic', name:'平面设计', description:'波普撞色与海报' },
  { id:'cyber', name:'科幻数码', description:'午夜终端与霓虹' },
  { id:'oriental', name:'东方意境', description:'水墨、远山与留白' },
  { id:'engineering', name:'工程蓝图', description:'网格与技术制图' },
];
const families = { simple:'minimal', light:'landscape', ocean:'landscape', sunset:'landscape', sakura:'nature', forest:'nature', paper:'heritage', vinyl:'heritage', mint:'graphic', brutalism:'graphic', dark:'cyber', aurora:'cyber', ink:'oriental', blueprint:'engineering' };
export const builtInThemes = presets.map(preset => ({ ...preset, appearance: preset.id === 'simple' ? 'plain' : preset.id,
  family: families[preset.id],
  typography: { body: preset.font === serif ? 'serif' : 'sans', heading: ['light','paper','sakura','vinyl'].includes(preset.id) ? 'serif' : 'sans', interface: 'sans' },
  background: backgrounds[preset.id] }));
