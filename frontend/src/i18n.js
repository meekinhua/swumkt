import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationTH from './locales/th/translation.json';
import translationEN from './locales/en/translation.json';
import translationZH from './locales/zh/translation.json';
import translationJA from './locales/ja/translation.json';
import translationKO from './locales/ko/translation.json';
import translationMY from './locales/my/translation.json';
import translationLO from './locales/lo/translation.json';
import translationVI from './locales/vi/translation.json';

const resources = {
  th: { translation: translationTH },
  en: { translation: translationEN },
  zh: { translation: translationZH },
  ja: { translation: translationJA },
  ko: { translation: translationKO },
  my: { translation: translationMY },
  lo: { translation: translationLO },
  vi: { translation: translationVI }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'th',
    lng: 'th',
    debug: false,
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
