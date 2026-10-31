import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

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

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(false);
    if (player.current) {
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
    try { await audio.play(); setError(false); }
    catch { setError(true); setPlaying(false); }
  }

  return <div className="mt-1 flex w-full max-w-[340px] min-w-[min(280px,100%)] flex-col gap-1 border border-current/15 bg-black/10 px-2.5 py-2 text-current" aria-label="Mensagem de áudio">
    <audio ref={player} src={src} preload="metadata"
      onLoadedMetadata={event => { const value = event.currentTarget.duration; setDuration(Number.isFinite(value) ? value : 0); event.currentTarget.playbackRate = rate; }}
      onDurationChange={event => { const value = event.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); }}
      onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onError={() => { setError(true); setPlaying(false); }} />
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={() => void toggle()} aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'} className="grid size-9 shrink-0 place-items-center border border-current/15 bg-current/10 hover:bg-current/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <input type="range" min={0} max={Math.max(duration, 0.1)} step={0.1} value={Math.min(currentTime, duration || 0)}
          aria-label="Posição do áudio" onChange={event => { const value = Number(event.target.value); if (player.current) player.current.currentTime = value; setCurrentTime(value); }}
          className="block h-5 w-full cursor-pointer accent-current" />
        <div className="flex justify-between gap-1 text-[10px] tabular-nums opacity-75">
          <span>{audioTime(currentTime)}</span><span>{audioTime(duration)}</span>
        </div>
      </div>
      <button type="button" onClick={() => setRate(previous => RATES[(RATES.indexOf(previous) + 1) % RATES.length])} aria-label={'Alterar velocidade do áudio, atual ' + String(rate) + ' vezes'} title="Velocidade" className="h-9 min-w-11 shrink-0 border border-current/20 px-1 text-xs font-semibold tabular-nums hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-ring">{rate}×</button>
    </div>
    {error && <p role="alert" className="text-xs">Não foi possível reproduzir este áudio.</p>}
  </div>;
}

