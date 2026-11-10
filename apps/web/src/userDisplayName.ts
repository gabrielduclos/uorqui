/**
 * Use first + last name on app surfaces. Keep the original displayName
 * unchanged in account data and on profile pages.
 */
export function compactUserName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return parts[0] + ' ' + parts[parts.length - 1];
}
