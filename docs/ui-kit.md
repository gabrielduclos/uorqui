# Uorqui UI Kit

Open the living UI Kit at /?ui-kit=1 (publicly accessible).

## Design tokens and themes

Dark is the default; light is available through the header sun/moon toggle. Tokens in apps/web/src/styles.css include:

| Token | Purpose |
| --- | --- |
| --background, --foreground | Page backgrounds and text |
| --card, --card-foreground | Cards |
| --popover, --popover-foreground | Menus and overlays |
| --primary, --primary-foreground | Primary controls |
| --secondary, --secondary-foreground | Secondary controls |
| --muted, --muted-foreground | Subdued surfaces |
| --accent, --accent-foreground | Hover and active surfaces |
| --border, --input, --ring | Borders, inputs and focus |
| --destructive | Destructive actions |

Prefer semantic Tailwind classes (bg-card, text-foreground, border-border) to literal colors.

## Locale

The header flag displays 🇧🇷 for Portuguese (Brazil) or 🇺🇸 for English. Click to switch. Use UorquiPreferences.tsx and its useUorquiPreferences hook in React components. The hook exposes t, locale, theme, setLocale and setTheme.

Use Portuguese strings as keys in t('...'); provide the matching English translation centrally in the en dictionary. Do not translate user-generated messages, personal identifiers, or file names. Language changes update the HTML lang attribute.

## Reusability

Components use apps/web/src/components/ui primitives (Button, Badge, Card, Input, Avatar, Separator). The UI Kit showcases semantic colors, type hierarchy, button variants, badges, forms, alerts, and chat examples, with responsive layouts.

## Persistence

Theme and language preferences are stored locally under uorqui:theme and uorqui:language. Initial theme is dark. Browser languages starting with pt default to Portuguese; other browser languages default to English. If storage is unavailable, the controls work for the current page only.

No backend or authentication schema changes are required for these settings.
