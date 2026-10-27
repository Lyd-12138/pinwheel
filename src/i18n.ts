import { useSyncExternalStore } from 'react';
import { t, getLanguage, subscribeLanguage, setLanguage, brandName } from '../shared/i18n.mjs';
export { t, setLanguage, brandName, getLanguage };
export const useLanguage = () => useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
