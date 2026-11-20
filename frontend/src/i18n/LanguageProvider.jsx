import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGES, messages } from './messages';

const STORAGE_KEY = 'superball.lang';
const LanguageContext = createContext(null);

function readStoredLanguage() {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE; // Storage blocked; fall back without failing the page.
  }
}

export function format(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    Object.hasOwn(params, key) ? String(params[key]) : match
  ));
}

export function LanguageProvider({ children, initialLanguage }) {
  const [language, setLanguage] = useState(() => initialLanguage || readStoredLanguage());

  useEffect(() => {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, language); } catch { /* ignore */ }
    if (typeof document !== 'undefined') document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const t = useCallback((key, params) => {
    const table = messages[language] || messages[DEFAULT_LANGUAGE];
    const template = table[key] ?? messages[DEFAULT_LANGUAGE][key] ?? key;
    return format(template, params);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage((current) => (current === 'zh' ? 'en' : 'zh')),
    t,
    // Application statuses come from the API in English. Chinese shows the API
    // value plus a label; English shows the API value alone.
    statusLabel: (status) => (language === 'zh'
      ? `${status} · ${messages.zh[`status.${status}`] || status}`
      : status),
    statusName: (status) => (language === 'zh'
      ? messages.zh[`status.${status}`] || status
      : status),
  }), [language, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// Components are also rendered on their own in unit tests. Without a provider
// they fall back to the default language instead of throwing, which keeps each
// component independently testable; the real app always mounts the provider.
const FALLBACK = {
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key, params) => format(messages[DEFAULT_LANGUAGE][key] ?? key, params),
  statusLabel: (status) => `${status} · ${messages[DEFAULT_LANGUAGE][`status.${status}`] || status}`,
  statusName: (status) => messages[DEFAULT_LANGUAGE][`status.${status}`] || status,
};

export function useI18n() {
  return useContext(LanguageContext) || FALLBACK;
}
