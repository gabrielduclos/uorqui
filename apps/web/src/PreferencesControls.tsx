import { Moon, Sun } from 'lucide-react';
import { useUorquiPreferences } from './UorquiPreferences';

export function PreferencesControls() {
  const { locale, theme, setLocale, setTheme, t } = useUorquiPreferences();
  const newLocale = locale === 'pt-BR' ? 'en' : 'pt-BR';
  return <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t('Idioma')}>
    <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={theme === 'dark' ? t('Modo claro') : t('Modo escuro')}
      aria-label={theme === 'dark' ? t('Modo claro') : t('Modo escuro')}
      className="grid size-9 place-items-center rounded-lg border border-border text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:size-10">
      {theme === 'dark' ? <Sun aria-hidden="true" className="size-[18px]" /> : <Moon aria-hidden="true" className="size-[18px]" />}
    </button>
    <button type="button" onClick={() => setLocale(newLocale)}
      title={newLocale === 'en' ? t('Trocar para inglês') : t('Trocar para português')}
      aria-label={newLocale === 'en' ? t('Trocar para inglês') : t('Trocar para português')}
      className="flex h-9 items-center gap-1 rounded-lg border border-border px-2 text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10"
      lang={locale}>
      <span aria-hidden="true" className="text-lg leading-none">{locale === 'pt-BR' ? '🇧🇷' : '🇺🇸'}</span>
      <span className="text-[10px] font-semibold tracking-wide">{locale === 'pt-BR' ? 'PT' : 'EN'}</span>
    </button>
  </div>;
}
