import { useEffect, useRef, useState } from 'react'
import { Clock3, Pause, Play, RotateCcw, Upload } from 'lucide-react'
import './SeparationLabPage.css'

const formatTime = (seconds = 0) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const apiUrl = (value) => /^https?:/i.test(value || '') ? value : `${import.meta.env.VITE_API_URL || ''}${value || ''}`

function AudioPlayer({ label, src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) { try { await audio.play(); setPlaying(true) } catch {} } else { audio.pause(); setPlaying(false) }
  }
  return <article className="lab-player"><b>{label}</b><div><button type="button" onClick={toggle} aria-label={playing ? 'Mettre en pause' : `Lire ${label}`}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><span>{formatTime(currentTime)}</span><input aria-label={`Position ${label}`} type="range" min="0" max={duration || 0} step="0.05" value={Math.min(currentTime, duration || currentTime)} onChange={event => { const value = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = value; setCurrentTime(value) }} /><span>{formatTime(duration)}</span></div><audio ref={audioRef} src={apiUrl(src)} onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)} onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)} onEnded={() => setPlaying(false)} /></article>
}

export default function SeparationLabPage() {
  const [file, setFile] = useState(null)
  const [jobId, setJobId] = useState('')
  const [result, setResult] = useState(null)
  const [duration, setDuration] = useState(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!running) return undefined
    const started = Date.now(); const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 250)
    return () => clearInterval(timer)
  }, [running])
  const upload = async () => {
    const form = new FormData(); form.append('audio', file)
    const response = await fetch('/api/separation-lab/upload', { method: 'POST', body: form })
    const data = await response.json()
    if (!response.ok) throw Error(data.error || 'Import impossible.')
    setJobId(data.jobId); setDuration(data.durationSeconds)
    return data.jobId
  }
  const testSpleeter = async () => {
    if (!file) return
    setRunning(true); setElapsed(0); setError('')
    try {
      const id = jobId || await upload()
      const response = await fetch(`/api/separation-lab/${id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset: 'spleeter' }) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'La séparation Spleeter a échoué.')
      setResult(data)
    } catch (caught) { setError(caught.message) } finally { setRunning(false) }
  }
  const changeFile = nextFile => { setFile(nextFile); setJobId(''); setResult(null); setDuration(null); setError('') }
  const metric = (value, suffix = '') => value === null || value === undefined ? '—' : `${value}${suffix}`

  return <main className="separation-lab-page"><header className="separation-lab-header"><a href="/">← Studio</a><div><span>Backline · outil technique</span><h1>Separation Lab</h1><p>Testez la séparation locale Spleeter sur un fichier unique.</p></div></header>
    <section className="lab-simple-layout"><section className="lab-track"><p className="eyebrow">Track</p><h2>{file?.name || 'Choisissez un morceau'}</h2><p>{file ? `${(file.size / 1024 / 1024).toFixed(1)} Mo${duration ? ` · ${formatTime(duration)}` : ''}` : 'MP3, WAV ou M4A · 30 Mo maximum'}</p><label className="separation-lab-dropzone"><Upload size={23} /><b>{file ? 'Changer de fichier' : 'Importer un fichier'}</b><input type="file" accept=".mp3,.wav,.m4a" onChange={event => changeFile(event.target.files?.[0] || null)} /></label>{file && <button className="lab-reset" type="button" onClick={() => changeFile(null)}><RotateCcw size={14} />Retirer ce fichier</button>}</section>
      <section className="lab-separator"><p className="eyebrow">Separator</p><div className="lab-spleeter-mark"><span>SP</span><div><h2>Spleeter</h2><p>Local / Docker · 2 stems</p></div></div><button type="button" onClick={testSpleeter} disabled={!file || running}>{running ? `Traitement · ${formatTime(elapsed)}` : result ? 'Retester Spleeter' : 'Tester Spleeter'}</button>{error && <p className="separation-lab-error">{error}</p>}</section></section>
    {result && <section className="separation-lab-results"><div className="lab-results-title"><div><p className="eyebrow">Result</p><h2>Spleeter</h2></div><span><Clock3 size={14} />Mesures réelles</span></div><div className="lab-metrics"><div><small>Durée audio</small><b>{metric(result.audioDurationSeconds, ' s')}</b></div><div><small>Processing time</small><b>{metric(result.processingTimeSeconds, ' s')}</b></div><div><small>RTF</small><b>{metric(result.realTimeFactor)}</b></div><div><small>Speed</small><b>{metric(result.speedRatio, '×')}</b></div></div><div className="lab-players"><AudioPlayer label="Original" src={result.originalUrl} /><AudioPlayer label="Vocals" src={result.vocalsUrl} /><AudioPlayer label="Instrumental" src={result.accompanimentUrl} /></div></section>}
  </main>
}
