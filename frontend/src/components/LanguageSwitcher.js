import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'th', name: 'ไทย', flag: '🇹🇭' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
    { code: 'my', name: 'မြန်မာ', flag: '🇲🇲' },
    { code: 'lo', name: 'ລາວ', flag: '🇱🇦' },
    { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' }
  ];

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const changeLanguage = (langCode) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:bg-[#00A9CE]/10 hover:text-[#00A9CE] text-gray-800 font-semibold"
        data-testid="language-switcher-btn"
      >
        <Globe className="w-5 h-5" />
        <span className="hidden md:inline">{currentLanguage.flag} {currentLanguage.name}</span>
        <span className="md:hidden">{currentLanguage.flag}</span>
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div 
            className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-2xl border-2 border-[#00A9CE]/20 z-50 overflow-hidden"
            data-testid="language-dropdown"
          >
            <div className="py-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#00A9CE]/10 transition-colors ${
                    i18n.language === lang.code ? 'bg-[#00A9CE]/15 font-bold text-[#005A73]' : 'text-gray-700 font-medium'
                  }`}
                  data-testid={`lang-option-${lang.code}`}
                >
                  <span className="text-2xl">{lang.flag}</span>
                  <span>{lang.name}</span>
                  {i18n.language === lang.code && (
                    <span className="ml-auto text-[#00A9CE]">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageSwitcher;
