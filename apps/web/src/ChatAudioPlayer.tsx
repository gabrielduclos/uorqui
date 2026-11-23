import { useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from './components/ui/controls'

export function ChatAudioPlayer({ src, locale = 'pt-BR' }: { src: string; locale?: string }) {
  const pt = locale === 'pt-BR'
  const player = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [rate, setRate] = useState(1)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  return <div className="audio-player" aria-label={pt ? 'Mensagem de áudio' : 'Voice message'}>
    <audio ref={player} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onWaiting={() => setLoading(true)} onCanPlay={() => setLoading(false)}
      onError={() => { setError(true); setLoading(false) }} onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration) }} />
    <Button variant="outline" aria-label={playing ? (pt ? 'Pausar áudio' : 'Pause audio') : (pt ? 'Reproduzir áudio' : 'Play audio')}
      loading={loading} onClick={async () => {
        if (!player.current) return
        setError(false)
        if (playing) { player.current.pause(); return }
        setLoading(true)
        try { await player.current.play() } catch { setError(true) } finally { setLoading(false) }
      }}>{playing ? <Pause size={16} /> : <Play size={16} />}</Button>
    <div className="min-w-0 flex-1"><input type="range" min={0} max={Math.max(duration, position, 1)} step={0.1} value={position}
      aria-label={pt ? 'Posição do áudio' : 'Audio position'} onChange={(event) => {
        if (player.current) player.current.currentTime = Number(event.target.value)
        setPosition(Number(event.target.value))
      }} /><small>{time(position)} / {time(duration)}</small></div>
    <Button variant="ghost" aria-label={pt ? 'Velocidade do áudio' : 'Playback speed'} onClick={() => {
      const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1
      setRate(next); if (player.current) player.current.playbackRate = next
    }}>{rate}×</Button>
    {error && <p role="alert">{pt ? 'Não foi possível reproduzir este áudio.' : 'Could not play this audio.'}</p>}
  </div>
}
