/** Username changes are allowed at most once per rolling 15-day period. */
export const USERNAME_COOLDOWN_DAYS = 15;
const cooldownMs = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export function nextUsernameChangeAt(lastChange: Date | string | null | undefined): string | null {
  if (!lastChange) return null;
  const timestamp = new Date(lastChange).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp + cooldownMs).toISOString() : null;
}
