import type { MouseEvent } from 'react';

/** The browser and some proxy layers can serialize the @ sign as %40. */
export function publicProfileHandle(pathname: string): string | null {
  let path = pathname;
  try { path = decodeURIComponent(pathname); } catch { return null; }
  return /^\/@([a-z][a-z0-9_]{2,31})\/?$/i.exec(path)?.[1]?.toLowerCase() ?? null;
}

export function navigateToPublicProfile(event: MouseEvent<HTMLAnchorElement>, handle: string) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
      event.shiftKey || event.altKey || event.currentTarget.target === '_blank') return;
  event.preventDefault();
  const normalized = handle.toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(normalized)) return;
  window.history.pushState({ uorquiInternalProfile: true }, '', '/@' + normalized);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function navigateBackFromPublicProfile(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
      event.shiftKey || event.altKey || event.currentTarget.target === '_blank') return;
  event.preventDefault();
  if (window.history.state?.uorquiInternalProfile) {
    window.history.back();
  } else {
    // Direct links, bookmarks and reloads do not have an in-app entry to return to.
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
