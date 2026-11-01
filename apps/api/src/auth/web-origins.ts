/**
 * Strictly enumerated browser origins for a staged custom-domain cutover.
 * WEB_ORIGIN is the canonical URL for verification links and callbacks.
 * WEB_EXTRA_ORIGINS only permits legacy/preview browser origins during migration;
 * no wildcard, arbitrary callback, path, or insecure production origin is allowed.
 */
export function allowedWebOrigins(): string[] {
  const canonical = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const extras = (process.env.WEB_EXTRA_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (extras.length > 6) throw new Error('Too many WEB_EXTRA_ORIGINS');
  const values = [canonical, ...extras].map(raw => {
    const url = new URL(raw);
    if (url.origin !== raw || url.username || url.password || url.pathname !== '/' ||
        url.search || url.hash || url.hostname.includes('*') ||
        !['http:', 'https:'].includes(url.protocol) ||
        (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
      throw new Error('Invalid WEB_ORIGIN or WEB_EXTRA_ORIGINS');
    }
    return url.origin;
  });
  return [...new Set(values)];
}
