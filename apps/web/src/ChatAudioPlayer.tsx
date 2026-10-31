import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useCachedChatMedia } from './chatMediaCache';

const RATES = [1, 1.5, 2] as const;
type Rate = (typeof RATES)[number];

function audioTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}

export function ChatAudioPlayer({ src }: { src: string; name?: string }) {
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<Rate>(1);
  const [error, setError] = useState(false);
  const [requestedCache,setRequestedCache] = useState(false);
  const cachedSrc=useCachedChatMedia(src,requestedCache);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(false);
    setRequestedCache(false);
    if (player.current) {
      player.current.src=src;
      player.current.pause();
      player.current.playbackRate = rate;
    }
  }, [src]);

  useEffect(() => {
    if (player.current) player.current.playbackRate = rate;
  }, [rate]);

  async function toggle() {
    const audio = player.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    setRequestedCache(true);
    // Do not interrupt playing audio when cache fetch finishes. Reuse the
    // completed private Blob URL on the next explicit Play gesture.
    if(cachedSrc && audio.getAttribute('src')!==cachedSrc){
      const resumeAt=audio.currentTime;
      audio.src=cachedSrc;
      audio.load();
      if(Number.isFinite(resumeAt) && resumeAt>0)audio.currentTime=resumeAt;
    }
    try { await audio.play(); setError(false); }
    catch { setError(true); setPlaying(false); }
  }

  return <div className="mt-1 flex w-full max-w-[340px] min-w-[min(280px,100%)] flex-col gap-2 border border-border bg-card px-3 py-2.5 text-foreground shadow-sm" aria-label="Mensagem de áudio">
    <audio ref={player} src={src} preload="metadata"
      onLoadedMetadata={event => { const value = event.currentTarget.duration; setDuration(Number.isFinite(value) ? value : 0); event.currentTarget.playbackRate = rate; }}
      onDurationChange={event => { const value = event.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); }}
      onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onError={() => { setError(true); setPlaying(false); }} />
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={() => void toggle()} aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'} className="grid size-10 shrink-0 place-items-center rounded-md border border-primary bg-primary text-primary-foreground shadow-sm hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <input type="range" min={0} max={Math.max(duration, 0.1)} step={0.1} value={Math.min(currentTime, duration || 0)}
          aria-label="Posição do áudio" onChange={event => { const value = Number(event.target.value); if (player.current) player.current.currentTime = value; setCurrentTime(value); }}
          className="block h-6 w-full cursor-pointer accent-primary" />
        <div className="flex justify-between gap-1 text-[11px] font-semibold tabular-nums text-foreground">
          <span>{audioTime(currentTime)}</span><span>{audioTime(duration)}</span>
        </div>
      </div>
      <button type="button" onClick={() => setRate(previous => RATES[(RATES.indexOf(previous) + 1) % RATES.length])} aria-label={'Alterar velocidade do áudio, atual ' + String(rate) + ' vezes'} title="Velocidade" className="h-10 min-w-12 shrink-0 rounded-md border border-border bg-secondary px-2 text-xs font-bold tabular-nums text-secondary-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{rate}×</button>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">Não foi possível reproduzir este áudio.</p>}
  </div>;
}

