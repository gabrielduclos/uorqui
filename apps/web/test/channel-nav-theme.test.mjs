import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const globalCSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const uiKitCSS = readFileSync(new URL('../src/ui-kit/sprintrix.css', import.meta.url), 'utf8');
const channelSelector = '[data-uorqui-ui-kit="sprintrix-v1"] [data-uorqui-channel-nav]';
const shellSource = readFileSync(new URL('../src/SocialShell.tsx', import.meta.url), 'utf8');

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

test('light application canvas, gutter and main menu share one gray surface', () => {
  assert.match(uiKitCSS, /:root\.light\s+\[data-uorqui-ui-kit="sprintrix-v1"\]\s*\{[^}]*--background:#ededed;/);
  assert.match(uiKitCSS, /:root\.light\s+\[data-uorqui-ui-kit="sprintrix-v1"\]\s*\{[^}]*--workspace-rail:#ededed;/);
  assert.match(uiKitCSS, /:root\.light\s+\[data-uorqui-ui-kit="sprintrix-v1"\]\s*\{[^}]*--kit-sidebar:#ededed;/);
  assert.match(uiKitCSS, /:root\.light\s+\[data-uorqui-ui-kit="sprintrix-v1"\]\s*\{[^}]*--kit-panel:#ffffff;/);
  assert.match(uiKitCSS, /\[data-uorqui-ui-kit="sprintrix-v1"\]\s+#uorqui-mobile-nav\s*\{\s*background:var\(--kit-sidebar\);/);
  assert.match(uiKitCSS, /\[data-uorqui-ui-kit="sprintrix-v1"\]\s*\{[^}]*--background:#181818;/,
    'dark theme canvas color must stay unchanged');
  assert.match(uiKitCSS, /\[data-uorqui-ui-kit="sprintrix-v1"\]\s*\{[^}]*--kit-sidebar:#181818;/,
    'dark theme sidebar color must stay unchanged');
});

test('mobile light menu header and hamburger drawer use the shared sidebar gray', () => {
  assert.match(uiKitCSS, /@media\(max-width:767px\)\s*\{[\s\S]*?:root\.light\s+\[data-uorqui-ui-kit="sprintrix-v1"\]\s+\[data-uorqui-main-header\]\s*\{\s*background:var\(--kit-sidebar\);/);
  assert.doesNotMatch(uiKitCSS, /@media\(max-width:767px\)\s*\{[\s\S]*?\[data-uorqui-main-header\]\s*\{\s*background:var\(--kit-panel\);/,
    'the mobile top menu must not use the white reading-panel token');
  assert.match(shellSource, /id="uorqui-mobile-nav"[\s\S]{0,270}?bg-\[var\(--kit-sidebar\)\]/,
    'hamburger drawer should explicitly use the sidebar token instead of generic bg-background');
  assert.match(uiKitCSS, /\[data-uorqui-ui-kit="sprintrix-v1"\]\s+\[data-uorqui-main-header\],[\s\S]{0,120}?\[data-uorqui-context-header\]\s*\{\s*background:var\(--kit-panel\);/,
    'default dark/mobile and desktop header remains on its original panel surface');
  assert.match(uiKitCSS, /--kit-sidebar:#ededed;/);
  assert.match(uiKitCSS, /--kit-panel:#ffffff;/);
});

test('panel tokens and primary menu are still independent in both themes', () => {
  assert.match(uiKitCSS, /--kit-panel:#0a0a0a;/);
  assert.match(uiKitCSS, /--kit-panel:#ffffff;/);
  assert.match(uiKitCSS, /\[data-uorqui-dashboard-sidebar\]\s*\{\s*background:var\(--kit-sidebar\)/);
  assert.match(globalCSS, /\[data-uorqui-sidebar-mode="expanded"\]\s*\[data-uorqui-channel-nav\]\s*\{[^}]*width:\s*15\.5rem;/);
});
