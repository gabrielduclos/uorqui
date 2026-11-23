# UI kit

[Português (Brasil)](../pt-BR/ui-kit.md) · [README](../../README.md)

The shared UI kit uses black, white and neutral grays in light and dark themes. React components use Tailwind and shadcn/ui conventions with Radix dialogs. The global tokens in [styles.css](../../apps/web/src/styles.css) are the source of truth and can be imported into tweakcn.

| Token | Light | Dark |
| --- | --- | --- |
| Background / sidebar | `#f5f5f5` | `#0a0a0a` |
| Foreground | `#171717` | `#fafafa` |
| Card / popover | `#ffffff` | `#141414` |
| Primary | `#171717` | `#fafafa` |
| Primary foreground | `#ffffff` | `#0a0a0a` |
| Muted | `#ededed` | `#262626` |
| Muted foreground | `#5c5c5c` | `#a3a3a3` |
| Accent | `#e5e5e5` | `#303030` |
| Border / input | `#d9d9d9` | `#333333` |
| Ring | `#737373` | `#fafafa` |

Secondary, popover and sidebar tokens reference the shared semantic palette. Error feedback uses a labeled message, weight and neutral contrast. Readable text communicates the state.

## Components and layout

| Component | Rules |
| --- | --- |
| Buttons | Primary, outline and ghost variants. Disabled state reduces opacity and blocks input. |
| Dialogs | Radix focus management, visible title, close label and Escape support. |
| Forms | Persistent labels, 16 px input text, visible focus and translated validation. |
| Team navigation | 68 px vertical rail, 46 px initials buttons, team name on hover and accessible label. Active team uses inverse contrast and a side marker. Add-team action follows the list. |
| Channel navigation | Compact sidebar beside the team rail. Private channels show a lock. |
| Mobile | 58 px team rail, 42 × 44 px buttons. Channels and conversation occupy alternating views. |
| Messages | Author, time, body and thread action use shared tokens. Threads appear alongside the conversation where space allows. |

Use a 4 px spacing scale and the shared 10 px radius token. The rail scrolls independently for long team lists. Team navigation supports Tab, Shift+Tab and Enter or Space. Focus uses a visible 2 px ring. Reduced-motion preferences disable transitions.

Both themes and languages apply to dialogs, account forms, empty states and channel navigation. Enter sends a message and Shift+Enter adds a line.

Keep static interface structure visible while data loads. Skeletons reserve space for teams, channel names, messages and composer content. Background refresh retains existing data. Loading regions have accessible labels and reduced-motion support. Pending forms retain their submit labels.

Backend action buttons use the shared loading spinner with aria-busy and disabled interaction. Labels stay visible. Form submissions, message sending, pagination, retries and sign-out restore the ready state on success or error. Async click handlers automatically receive this feedback.

The message composer uses one line and grows with its contents. Pending messages display immediately. Own delivered messages expose edit and unsend actions with shared pending feedback. Edited text has an edited label. Unsent text is replaced by a placeholder and the thread remains available.

The team rail starts with direct messages. The team heading exposes owner settings. The top-bar avatar opens profile settings; author names open a profile. Profiles and management use shared dialogs, skeleton fields and pending action buttons in both themes and languages. Mobile direct messages alternate between list and conversation.

Signup reserves an @ prefix beside the username input and normalizes typed handles to lowercase. The main composer’s (+) popover provides gallery, camera, files and location, with voice recording beside the textarea and local previews. One-line composition still grows with text. The shared loading state spans metadata reservation, upload and message confirmation; pending media stays optimistic and retryable.
