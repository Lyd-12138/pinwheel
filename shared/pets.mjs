import { validateAppearance, validateActions, validateBehavior } from './pet-format.mjs';
import { t } from './i18n.mjs';
export const petKinds = [
  { id: 'cat', name: '云朵猫', color: '#a899ed' },
  { id: 'fox', name: '橘子狐', color: '#ef9b61' },
  { id: 'rabbit', name: '月亮兔', color: '#eaa4c1' },
  { id: 'robot', name: '星际机器人', color: '#6cbeba' },
  { id: 'slime', name: '果冻精灵', color: '#86bc83' },
];
export function initialPets() {
  return { enabled: false, selected: 'starter-cat', size: 160, motion: true, items: petKinds.map(k => ({ id: 'starter-' + k.id, kind: k.id, name: t(k.name), color: k.color })) };
}
export function validatePet(input) {
  if (!input || typeof input !== 'object') throw Error('宠物资料无效。');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 40 || /[\x00-\x1f]/.test(name)) throw Error('请输入 1～40 字的宠物名称。');
  if (!petKinds.some(k => k.id === input.kind) && input.kind !== 'image') throw Error('请选择宠物样式。');
  if (!/^#[\da-f]{6}$/i.test(input.color || '')) throw Error('请选择有效颜色。');
  const actions = validateActions(input.actions);
  return { name, kind: input.kind, color: input.color, appearance: validateAppearance(input.appearance), actions, behavior: validateBehavior(input.behavior, actions) };
}
export function removePet(state, id) {
  if (!state.items.some(p => p.id === id)) throw Error('宠物不存在。');
  state.items = state.items.filter(p => p.id !== id);
  if (state.selected === id) state.selected = state.items[0]?.id || '';
  if (!state.items.length) state.enabled = false;
  return state;
}
export function petPosition(position, area, width, height) {
  const x = Number.isFinite(position?.x) ? position.x : area.x + area.width - width - 24;
  const y = Number.isFinite(position?.y) ? position.y : area.y + area.height - height - 12;
  return { x: Math.round(Math.min(Math.max(area.x, x), Math.max(area.x, area.x + area.width - width))), y: Math.round(Math.min(Math.max(area.y, y), Math.max(area.y, area.y + area.height - height))) };
}
