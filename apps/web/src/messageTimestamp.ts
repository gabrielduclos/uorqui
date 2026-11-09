import { useEffect, useState } from 'react';

/** Dates are compared using the viewer's local calendar, never UTC days. */
export function localDayKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

/** Today: time. Older: date + time, with year for another calendar year. */
export function formatMessageTimestamp(
  value: string | null | undefined, locale: string, todayKey: string,
): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (localDayKey(date) === todayKey) return time;
  const includeYear = date.getFullYear() !== Number(todayKey.slice(0, 4));
  const dateLabel = date.toLocaleDateString(locale, {
    day: '2-digit', month: '2-digit', ...(includeYear ? { year: 'numeric' } : {}),
  });
  return dateLabel + ' ' + time;
}

/** Schedule the transition at local midnight, even across DST changes. */
export function delayToNextLocalDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(100, next.getTime() - now.getTime() + 50);
}

/** Shared by a message list: no timer is attached to individual bubbles.
 * Reconcile on focus/visibility because PWAs can suspend background timers.
 */
export function useLocalDayKey(): string {
  const [todayKey, setTodayKey] = useState(() => localDayKey(new Date()));
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const now = new Date();
      const key = localDayKey(now);
      setTodayKey(previous => previous === key ? previous : key);
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = setTimeout(update, delayToNextLocalDay(now));
    };
    const resume = () => { if (document.visibilityState === 'visible') update(); };
    update();
    window.addEventListener('focus', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', resume);
    return () => {
      if (timeout !== undefined) clearTimeout(timeout);
      window.removeEventListener('focus', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  return todayKey;
}
