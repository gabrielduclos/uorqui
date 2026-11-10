/** Shared deadline helpers: the timer never counts a new hour per participant. */
export function meetingSecondsLeft(expiresAt:string|null, now:number=Date.now()):number|null{
  if(!expiresAt)return null;
  const target=Date.parse(expiresAt);
  if(!Number.isFinite(target))return null;
  return Math.max(0,Math.ceil((target-now)/1000));
}

export function formatMeetingCountdown(seconds:number):string{
  const value=Math.max(0,Math.floor(seconds));
  const minutes=Math.floor(value/60);
  return String(minutes).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
}
