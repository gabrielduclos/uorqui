function richPostUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return value;
    const postId = String(url.searchParams.get('post') || '').trim();
    if (!postId) return value;
    return new URL(`/share/${encodeURIComponent(postId)}`, window.location.origin).toString();
  } catch {
    return value;
  }
}

try {
  const originalShare = typeof navigator.share === 'function' ? navigator.share.bind(navigator) : null;
  if (originalShare) {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData = {}) => originalShare({
        ...data,
        url: data.url ? richPostUrl(String(data.url)) : data.url
      })
    });
  }
} catch {}

try {
  const clipboard = navigator.clipboard;
  const originalWriteText = clipboard && typeof clipboard.writeText === 'function'
    ? clipboard.writeText.bind(clipboard)
    : null;
  if (clipboard && originalWriteText) {
    Object.defineProperty(clipboard, 'writeText', {
      configurable: true,
      value: (text: string) => originalWriteText(richPostUrl(String(text || '')))
    });
  }
} catch {}
