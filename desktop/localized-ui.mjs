import { t } from '../shared/i18n.mjs';
export function localizedOptions(value, userLabels = []) {
  if (Array.isArray(value)) return value.map(item => localizedOptions(item, userLabels));
  if (!value || typeof value !== 'object') return value;
  const result = { ...value };
  for (const [key, item] of Object.entries(value)) {
    if (['label','title','message','detail','buttonLabel','name'].includes(key) && typeof item === 'string') result[key] = userLabels.includes(item) ? item : t(item);
    else if (key === 'buttons' && Array.isArray(item)) result[key] = item.map(t);
    else if (Array.isArray(item)) result[key] = item.map(child => localizedOptions(child, userLabels));
  }
  return result;
}
