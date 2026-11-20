import { render } from '@testing-library/react';
import { LanguageProvider } from './i18n/LanguageProvider';

function ChineseLanguage({ children }) {
  return <LanguageProvider initialLanguage="zh">{children}</LanguageProvider>;
}

export function renderInChinese(component) {
  return render(component, { wrapper: ChineseLanguage });
}
