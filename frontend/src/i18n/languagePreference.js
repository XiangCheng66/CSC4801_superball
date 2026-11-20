import { DEFAULT_LANGUAGE, LANGUAGES } from './messages';

// Older releases saved the Chinese default even when nobody used the switch.
export const LANGUAGE_STORAGE_KEY = 'superball.language';

export function readStoredLanguage() {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
