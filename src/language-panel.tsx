import React from 'react';
import { t, setLanguage } from './i18n';
import { call, type Settings } from './types';
export function LanguagePanel({ settings, onChange, report }: { settings: Settings; onChange(s: Settings): void; report(s: string): void }) {
  return <section className="language-panel"><label className="field" htmlFor="app-language">{t('应用语言')}</label><select id="app-language" aria-label={t('应用语言')} value={settings.language || 'system'} onChange={event => { const language = event.target.value; void call<Settings>('settings', { language }).then(value => { setLanguage(value.language || 'system', value.systemLanguage || navigator.language); onChange(value); }).catch(error => report(error.message)); }}><option value="system">{t('跟随系统')}</option><option value="zh-CN">简体中文</option><option value="en">English</option></select><p className="hint">{t('默认跟随系统语言，不支持的系统语言使用英语。')}</p><p className="hint">{t('立即生效，重新打开后保留你的选择。')}</p></section>;
}
