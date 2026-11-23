# UI kit

[Português (Brasil)](../pt-BR/ui-kit.md) · [README](../../README.md)

The editable light and dark shadcn/ui tokens are in [styles.css](../../apps/web/src/styles.css). Import the token definitions into tweakcn when changing the palette, then apply the exported token values to the same file. The workspace, dialogs and forms share these tokens.

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#f5f7f6` | `#111b18` |
| Foreground | `#172b25` | `#e8f4ef` |
| Card | `#ffffff` | `#172420` |
| Primary | `#176450` | `#99e1c8` |
| Accent | `#dbece5` | `#23463a` |

The channel list uses a compact sidebar on desktop and a dedicated view on mobile. Threads sit alongside the conversation where space allows. The composer supports Enter to send and Shift+Enter to add a line. Dialogs support keyboard focus and Escape.
