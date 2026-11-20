import { useI18n } from './LanguageProvider';

export default function LanguageToggle() {
  const { toggleLanguage, t } = useI18n();
  return (
    <button
      type="button"
      className="language-toggle"
      onClick={toggleLanguage}
      aria-label={t('app.languageToggle')}
      title={t('app.languageToggle')}
    >
      {t('app.languageShort')}
    </button>
  );
}
