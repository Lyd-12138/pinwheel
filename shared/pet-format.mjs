export const petActions = [
  { id: 'idle', name: '待机' }, { id: 'pet', name: '摸摸' }, { id: 'feed', name: '喂食' },
  { id: 'play', name: '玩耍' }, { id: 'sleep', name: '睡觉' }, { id: 'hello', name: '招手' },
  { id: 'drag', name: '拖动' }, { id: 'drop', name: '落地' },
];
export const appearanceDefaults = { accent: '#ffe2e8', outline: '#3f3656', bodyWidth: 1, bodyHeight: 1, earSize: 1, eyeSize: 1, eyeDistance: 1, accessory: 'none', pattern: 'solid', expression: 'round' };
const number = (v, fallback, min, max) => v === undefined ? fallback : Number.isFinite(v) && v >= min && v <= max ? v : (() => { throw Error('宠物参数超出范围。'); })();
const choice = (v, fallback, allowed) => v === undefined ? fallback : allowed.includes(v) ? v : (() => { throw Error('宠物样式参数无效。'); })();
export function validateAppearance(value = {}) {
  const out = { ...appearanceDefaults };
  for (const key of ['accent', 'outline']) { if (value[key] !== undefined && !/^#[a-f\d]{6}$/i.test(value[key])) throw Error('宠物配色无效。'); out[key] = value[key] || out[key]; }
  for (const key of ['bodyWidth', 'bodyHeight', 'earSize', 'eyeSize', 'eyeDistance']) out[key] = number(value[key], 1, .65, 1.3);
  out.accessory = choice(value.accessory, 'none', ['none', 'glasses', 'bow', 'scarf', 'crown']);
  out.pattern = choice(value.pattern, 'solid', ['solid', 'stripes', 'spots']);
  out.expression = choice(value.expression, 'round', ['round', 'happy', 'sleepy']);
  return out;
}
export function validPetAsset(file) { return typeof file === 'string' && file.length <= 180 && /^(?:assets\/)?[^\\\/:*?"<>|\x00-\x1f]+\.(png|jpe?g|gif|webp)$/i.test(file); }
export function validateActions(actions = {}) {
  if (!actions || typeof actions !== 'object' || Array.isArray(actions) || Object.keys(actions).length > 24) throw Error('动作最多 24 组。');
  const out = {};
  for (const [id, value] of Object.entries(actions)) {
    if (!/^[a-z][a-z\d_-]{0,31}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || !value || typeof value !== 'object') throw Error('动作名称无效。');
    const files = value.files;
    if (!Array.isArray(files) || !files.length || files.length > 120 || files.some(file => !validPetAsset(file))) throw Error('每个动作需要 1～120 张有效图片。');
    const kind = choice(value.kind, 'frames', ['frames', 'sheet']);
    const item = { kind, files: [...files], aspectRatio: number(value.aspectRatio, 1, .05, 20), fps: number(value.fps, 8, 1, 60), loop: value.loop === true, duration: number(value.duration, 1800, 200, 30000), label: typeof value.label === 'string' ? value.label.slice(0, 24) : id };
    if (kind === 'sheet') {
      if (files.length !== 1) throw Error('精灵图动作只能使用一张图片。');
      item.columns = number(value.columns, 1, 1, 32); item.rows = number(value.rows, 1, 1, 32);
      item.start = number(value.start, 0, 0, 1023); item.count = number(value.count, 1, 1, 1024);
      if (![item.columns, item.rows, item.start, item.count].every(Number.isInteger) || item.start + item.count > item.columns * item.rows) throw Error('精灵图网格或帧范围无效。');
    }
    out[id] = item;
  }
  return out;
}
export function validateBehavior(value = {}, actions = {}) {
  const choices = [...petActions.map(a => a.id), ...Object.keys(actions)];
  const out = { click: choice(value.click, 'pet', choices), doubleClick: choice(value.doubleClick, 'play', choices), showSpeech: value.showSpeech !== false, messages: {} };
  for (const [key, lines] of Object.entries(value.messages || {})) {
    if (!choices.includes(key) || !Array.isArray(lines) || lines.length > 20 || lines.some(line => typeof line !== 'string' || line.length > 120)) throw Error('互动台词每个动作最多 20 条，每条 120 字。');
    out.messages[key] = [...lines];
  }
  return out;
}
export function petAssetFiles(pet) { return [...new Set([pet.image, ...Object.values(pet.actions || {}).flatMap(a => a.files)].filter(Boolean))]; }
export function actionVisual(pet, action) { return pet.actions?.[action] || pet.actions?.idle || (pet.kind === 'image' && pet.image ? { kind: 'frames', files: [pet.image], fps: 1, loop: true, duration: 1800 } : null); }
