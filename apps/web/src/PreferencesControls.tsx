import { Moon, Sun } from 'lucide-react';
import { useUorquiPreferences } from './UorquiPreferences';

/**
 * Draw flags as SVG rather than system emoji: some desktop browsers and fonts
 * render the country-code letters or no glyph at all.
 */
function LanguageFlag({ language }: { language: 'pt-BR' | 'en' }) {
  if (language === 'pt-BR') {
    return <svg aria-hidden="true" viewBox="0 0 28 20" width="24" height="17" className="block shrink-0 overflow-hidden rounded-[2px] shadow-sm">
      <rect width="28" height="20" fill="#189447" />
      <path d="M14 2.1 26 10 14 17.9 2 10Z" fill="#FFDF00" />
      <circle cx="14" cy="10" r="5" fill="#002776" />
      <path d="M9.2 8.6q5.7-.9 9.4 3.1" fill="none" stroke="#fff" strokeWidth="1.15" />
    </svg>;
  }

  return <svg aria-hidden="true" viewBox="0 0 28 20" width="24" height="17" className="block shrink-0 overflow-hidden rounded-[2px] shadow-sm">
    <rect width="28" height="20" fill="#fff" />
    {Array.from({ length: 7 }, (_, index) => <rect key={index} y={index * 40 / 13} width="28" height={20 / 13} fill="#B22234" />)}
    <rect width="12" height={20 * 7 / 13} fill="#3C3B6E" />
    {Array.from({ length: 4 }, (_, row) => Array.from({ length: 5 }, (_, column) =>
      <circle key={row + '-' + column} cx={1.5 + column * 2.25} cy={1.3 + row * 2.2} r=".45" fill="#fff" />))}
  </svg>;
}

export function PreferencesControls() {
  const { locale, theme, setLocale, setTheme, t } = useUorquiPreferences();
  const nextLanguage = locale === 'pt-BR' ? 'en' : 'pt-BR';
  return <div className="flex shrink-0 items-center gap-2" role="group" aria-label={t('Idioma')}>
    <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={theme === 'dark' ? t('Modo claro') : t('Modo escuro')}
      aria-label={theme === 'dark' ? t('Modo claro') : t('Modo escuro')}
      className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:size-10">
      {theme === 'dark' ? <Sun aria-hidden="true" className="size-[18px]" /> : <Moon aria-hidden="true" className="size-[18px]" />}
    </button>
    <button type="button" onClick={() => setLocale(nextLanguage)}
      title={nextLanguage === 'en' ? t('Trocar para inglês') : t('Trocar para português')}
      aria-label={nextLanguage === 'en' ? t('Trocar para inglês') : t('Trocar para português')}
      className="inline-flex h-9 min-w-[66px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10 sm:min-w-[75px]"
      lang={locale}>
      <LanguageFlag language={locale} />
      <span className="text-xs font-semibold tracking-wide">{locale === 'pt-BR' ? 'PT' : 'EN'}</span>
    </button>
  </div>;
}
