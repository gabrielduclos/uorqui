import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const globalCSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const uiKitCSS = readFileSync(new URL('../src/ui-kit/sprintrix.css', import.meta.url), 'utf8');
const channelSelector = '[data-uorqui-ui-kit="sprintrix-v1"] [data-uorqui-channel-nav]';

test('workspace UI kit is the sole source of the channel list background', () => {
  assert.ok(uiKitCSS.includes(channelSelector + '{\\n  background:var(--kit-panel);'.replace('\\n', '\n')),
    'channel list must use semantic inset surface in sprintrix.css');
  assert.doesNotMatch(globalCSS,
    /\[data-uorqui-app-shell\]\[data-uorqui-sidebar-mode="expanded"\]\s*\[data-uorqui-channel-nav\]\s*\{[^}]*background\s*:/,
    'desktop expanded-sidebar rule must not override the theme color');
  assert.doesNotMatch(globalCSS,
    /\[data-uorqui-channel-nav\]\s*\{[^}]*background\s*:/,
    'all channel background colors belong to the workspace UI kit');
});

test('panel tokens and primary menu are still independent in both themes', () => {
  assert.match(uiKitCSS, /--kit-panel:#0a0a0a;/);
  assert.match(uiKitCSS, /--kit-panel:#ffffff;/);
  assert.match(uiKitCSS, /\[data-uorqui-dashboard-sidebar\]\s*\{\s*background:var\(--kit-sidebar\)/);
  assert.match(globalCSS, /\[data-uorqui-sidebar-mode="expanded"\]\s*\[data-uorqui-channel-nav\]\s*\{[^}]*width:\s*15\.5rem;/);
});
