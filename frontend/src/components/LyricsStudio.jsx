import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Download, Pause, Play, Redo2, Save, Scissors, Undo2 } from 'lucide-react'
import { cloneLyrics, formatLyricsTime, lineId, splitLine, validateLocalLines } from '../utils/lyricsEditor.js'
import { parseLRC } from '../utils/lrc.js'
import './LyricsStudio.css'

const audioUrl = (value) => value ? (/^https?:/i.test(value) ? value : `${import.meta.env.VITE_API_URL || ''}${value}`) : ''
const round = (value) => Number(Math.max(0, value).toFixed(3))
const waveformCache = new Map()

function WaveTimeline({ sourceUrl, duration, currentTime, lines, selectedId, onSelect, onSeek }) {
  const canvasRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [peaks, setPeaks] = useState([])
  const [waveformRequested, setWaveformRequested] = useState(false)
  const [waveformLoading, setWaveformLoading] = useState(false)
  const windowDuration = duration ? duration / zoom : 1
  const start = Math.max(0, Math.min(currentTime - windowDuration / 2, duration - windowDuration))
  useEffect(() => {
    if (!sourceUrl || !waveformRequested) return undefined
    if (waveformCache.has(sourceUrl)) { setPeaks(waveformCache.get(sourceUrl)); return undefined }
    let cancelled = false
    setWaveformLoading(true)
    const context = new AudioContext()
    fetch(sourceUrl).then((response) => response.arrayBuffer()).then((buffer) => context.decodeAudioData(buffer)).then((audioBuffer) => {
      const channel = audioBuffer.getChannelData(0); const count = 1400; const block = Math.max(1, Math.floor(channel.length / count)); const next = []
      for (let i = 0; i < channel.length; i += block) { let peak = 0; for (let j = i; j < Math.min(channel.length, i + block); j += 1) peak = Math.max(peak, Math.abs(channel[j])); next.push(peak) }
      waveformCache.set(sourceUrl, next); if (!cancelled) setPeaks(next)
    }).catch(() => { if (!cancelled) setPeaks([]) }).finally(() => { if (!cancelled) setWaveformLoading(false) })
    return () => { cancelled = true; context.close() }
  }, [sourceUrl, waveformRequested])
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const draw = () => {
      const width = canvas.clientWidth || 800; const height = canvas.clientHeight || 92; const ratio = window.devicePixelRatio || 1
      canvas.width = width * ratio; canvas.height = height * ratio
      const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(151,255,75,.09)'; ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = 'rgba(151,255,75,.55)'; ctx.lineWidth = 1
      const from = Math.floor((start / Math.max(duration, 1)) * peaks.length); const to = Math.max(from + 1, Math.ceil(((start + windowDuration) / Math.max(duration, 1)) * peaks.length)); const visible = peaks.slice(from, to)
      ctx.beginPath(); for (let x = 0; x < width; x += 2) { const peak = visible[Math.min(visible.length - 1, Math.floor((x / width) * visible.length))] || .05; const amp = Math.max(2, peak * height * .43); ctx.moveTo(x, height / 2 - amp); ctx.lineTo(x, height / 2 + amp) } ctx.stroke()
    }
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas); return () => observer.disconnect()
  }, [zoom, peaks, start, duration, windowDuration])
  const percentage = (time) => Math.max(0, Math.min(100, ((time - start) / windowDuration) * 100))
  return <section className="lyrics-wave"><div className="lyrics-wave-toolbar"><b>Timeline</b><span>{!waveformRequested && <button type="button" onClick={() => setWaveformRequested(true)}>Charger la waveform</button>}{waveformLoading && 'Analyse audio…'}</span><label>Zoom <input type="range" min="1" max="12" step="1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label></div><div className="lyrics-wave-canvas" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onSeek(start + ((event.clientX - rect.left) / rect.width) * windowDuration) }}><canvas ref={canvasRef} /><div className="lyrics-segments">{lines.map((line) => { const left = percentage(line.start); return <button type="button" key={line.id} className={line.id === selectedId ? 'selected' : ''} style={{ left: `${left}%`, width: `${Math.max(1, percentage(line.end) - left)}%` }} onClick={(event) => { event.stopPropagation(); onSelect(line.id) }} title={line.text || 'Ligne vide'}>{line.text || '—'}</button> })}</div><i style={{ left: `${percentage(currentTime)}%` }} /></div><small>Cliquer pour déplacer la lecture · les segments représentent les lignes.</small></section>
}

export default function LyricsStudio({ sessionId, onBack, onSaved }) {
  const audioRef = useRef(null); const lineAudioTimer = useRef(null); const textRef = useRef(null); const textEditSnapshotRef = useRef(null); const renderedTimeRef = useRef(0)
  const [loading, setLoading] = useState(true); const [original, setOriginal] = useState(null); const [lines, setLines] = useState([]); const [selectedId, setSelectedId] = useState('')
  const [title, setTitle] = useState(''); const [artist, setArtist] = useState(''); const [stems, setStems] = useState({}); const [source, setSource] = useState('vocal')
  const [playing, setPlaying] = useState(false); const [time, setTime] = useState(0); const [duration, setDuration] = useState(0); const [volume, setVolume] = useState(.9)
  const [undo, setUndo] = useState([]); const [redo, setRedo] = useState([]); const [status, setStatus] = useState(''); const [saveError, setSaveError] = useState('')
  const selected = lines.find((line) => line.id === selectedId)
  const issues = useMemo(() => validateLocalLines(lines, duration), [lines, duration])
  const dirty = JSON.stringify(lines) !== JSON.stringify(original?.lines || [])
  const sourceUrl = source === 'vocal' ? audioUrl(stems?.vocalUrl) : ''

  const commit = useCallback((next) => { setUndo((items) => [...items.slice(-49), cloneLyrics(lines)]); setRedo([]); setLines(next); setStatus('Modifications non sauvegardées.') }, [lines])
  const update = (id, patch) => commit(lines.map((line) => line.id === id ? { ...line, ...patch } : line))
  const beginTextEdit = () => { if (!textEditSnapshotRef.current) textEditSnapshotRef.current = cloneLyrics(lines) }
  const updateText = (id, text) => { setLines((items) => items.map((line) => line.id === id ? { ...line, text } : line)); setStatus('Modifications non sauvegardées.') }
  const finishTextEdit = () => {
    if (!textEditSnapshotRef.current) return
    const snapshot = textEditSnapshotRef.current; textEditSnapshotRef.current = null
    if (JSON.stringify(snapshot) !== JSON.stringify(lines)) { setUndo((items) => [...items.slice(-49), snapshot]); setRedo([]) }
  }
  const seek = (next) => { const value = Math.max(0, Math.min(duration || Infinity, Number(next) || 0)); if (audioRef.current) audioRef.current.currentTime = value; setTime(value) }
  const save = async () => {
    if (issues.length) return setSaveError(issues[0])
    setStatus('Sauvegarde en cours…'); setSaveError('')
    try { const response = await fetch(`/api/sessions/${sessionId}/lyrics/edit`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); setOriginal({ lines: cloneLyrics(lines), source: 'user-edited' }); setStatus('Sauvegardé.'); onSaved?.(data.session) } catch (error) { setSaveError(error.message || 'Sauvegarde impossible.'); setStatus('') }
  }
  const restore = async () => {
    if (!window.confirm('Restaurer les paroles d’origine et supprimer la version corrigée sauvegardée ?')) return
    const response = await fetch(`/api/sessions/${sessionId}/lyrics/edit`, { method: 'DELETE' }); const data = await response.json()
    if (!response.ok) return setSaveError(data.error || 'Restauration impossible.')
    const restored = data.active.lines; setLines(restored); setOriginal({ lines: cloneLyrics(restored), source: data.active.source }); setUndo([]); setRedo([]); setStatus('Version d’origine restaurée.'); onSaved?.(data.session)
  }
  const exportLrc = () => { const content = lines.map((line) => `[${formatLyricsTime(line.start).replace('.', ':')}]${line.text}`).join('\n'); const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = `${title || 'lyrics'}.lrc`; link.click(); URL.revokeObjectURL(url) }
  const importLrc = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    try {
      const parsed = parseLRC(await file.text())
      if (!parsed.length) throw Error('Aucune ligne synchronisée valide n’a été trouvée dans ce fichier LRC.')
      if (!window.confirm(`Importer ${parsed.length} lignes et remplacer les modifications en cours ?`)) return
      const imported = parsed.map((line, index) => ({ id: lineId(), start: round(line.time), end: round(parsed[index + 1]?.time ?? line.time + 4), text: line.text }))
      const invalid = validateLocalLines(imported, duration)
      if (invalid.length) throw Error(invalid[0])
      commit(imported); setSelectedId(imported[0]?.id || ''); setSaveError(''); setStatus('Fichier LRC importé — sauvegardez pour l’appliquer.')
    } catch (error) { setSaveError(error.message || 'Import LRC impossible.') }
  }
  const toggle = async () => { if (!audioRef.current) return; if (audioRef.current.paused) { await audioRef.current.play(); setPlaying(true) } else { audioRef.current.pause(); setPlaying(false) } }
  const listenLine = async () => { if (!selected) return; seek(selected.start); await audioRef.current?.play(); setPlaying(true); clearTimeout(lineAudioTimer.current); lineAudioTimer.current = setTimeout(() => { audioRef.current?.pause(); setPlaying(false) }, Math.max(0, (selected.end - selected.start) * 1000)) }
  const addLine = (after) => { const index = Math.max(0, lines.findIndex((line) => line.id === selectedId) + (after ? 1 : 0)); const anchor = lines[Math.min(index, lines.length - 1)]; const start = anchor ? round(after ? anchor.end : Math.max(0, anchor.start - 2)) : round(time); const next = { id: lineId(), start, end: round(start + 2), text: 'Nouvelle ligne' }; commit([...lines.slice(0, index), next, ...lines.slice(index)]); setSelectedId(next.id) }
  useEffect(() => { fetch(`/api/sessions/${sessionId}/lyrics/edit`).then((response) => response.json().then((data) => ({ response, data }))).then(({ response, data }) => { if (!response.ok) throw Error(data.error); const active = data.active || { lines: [] }; setOriginal({ lines: cloneLyrics(active.lines), source: active.source }); setLines(cloneLyrics(active.lines)); setSelectedId(active.lines[0]?.id || ''); setTitle(data.title); setArtist(data.artist); setStems(data.stems || {}) }).catch((error) => setSaveError(error.message)).finally(() => setLoading(false)) }, [sessionId])
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume }, [volume])
  useEffect(() => { const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
  useEffect(() => { const handler = (event) => { const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) { const next = redo[0]; if (next) { setRedo(redo.slice(1)); setUndo([...undo, cloneLyrics(lines)]); setLines(next) } } else { const next = undo.at(-1); if (next) { setUndo(undo.slice(0, -1)); setRedo([cloneLyrics(lines), ...redo]); setLines(next) } } } else if (!typing && event.code === 'Space') { event.preventDefault(); toggle() } else if (!typing && event.key === 'ArrowLeft') seek(time - .1); else if (!typing && event.key === 'ArrowRight') seek(time + .1); else if (!typing && event.key === '[' && selected) update(selected.id, { start: round(time) }); else if (!typing && event.key === ']' && selected) update(selected.id, { end: round(time) }); else if (!typing && event.key === 'ArrowUp') { const i = lines.findIndex((line) => line.id === selectedId); if (i > 0) setSelectedId(lines[i - 1].id) } else if (!typing && event.key === 'ArrowDown') { const i = lines.findIndex((line) => line.id === selectedId); if (i >= 0 && i < lines.length - 1) setSelectedId(lines[i + 1].id) } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [lines, selected, selectedId, time, undo, redo, save])
  if (loading) return <section className="lyrics-studio loading">Chargement des paroles…</section>
  return <main className="lyrics-studio"><header><div><p className="section-kicker">Backline · Lyrics Studio</p><h2>{title} <span>— {artist}</span></h2><p>{original?.source === 'whisper' ? 'Paroles générées automatiquement — vous pouvez corriger le texte et la synchronisation.' : 'Copie éditable des paroles synchronisées.'}</p></div><div className="lyrics-header-actions"><button onClick={() => { if (!dirty || window.confirm('Quitter sans sauvegarder les modifications ?')) onBack() }}><ChevronLeft size={16} />Retour au karaoké</button><button disabled={!undo.length} onClick={() => { const next = undo.at(-1); setUndo(undo.slice(0, -1)); setRedo([cloneLyrics(lines), ...redo]); setLines(next) }}><Undo2 size={15} />Annuler</button><button disabled={!redo.length} onClick={() => { const next = redo[0]; setRedo(redo.slice(1)); setUndo([...undo, cloneLyrics(lines)]); setLines(next) }}><Redo2 size={15} />Rétablir</button><button className="primary" onClick={save}><Save size={15} />Sauvegarder</button></div></header>{saveError && <p className="lyrics-error">{saveError}</p>}
    <section className="lyrics-audio"><div className="lyrics-source"><b>Audio d’édition</b><button className={source === 'vocal' ? 'active' : ''} onClick={() => setSource('vocal')} disabled={!stems?.vocalUrl}>Voix isolée</button><button disabled title="L’original n’est pas conservé dans les sessions existantes.">Original non disponible</button></div><div className="lyrics-transport"><button className="play" onClick={toggle}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><span>{formatLyricsTime(time)}</span><input type="range" min="0" max={duration || 0} step=".01" value={Math.min(time, duration || time)} onChange={(event) => seek(event.target.value)} /><span>{formatLyricsTime(duration)}</span><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></div><audio ref={audioRef} src={sourceUrl} onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)} onTimeUpdate={() => { const next = audioRef.current?.currentTime || 0; if (Math.abs(next - renderedTimeRef.current) >= .05) { renderedTimeRef.current = next; setTime(next) } }} onEnded={() => { renderedTimeRef.current = audioRef.current?.duration || renderedTimeRef.current; setPlaying(false) }} /></section>
    <WaveTimeline sourceUrl={sourceUrl} duration={duration} currentTime={time} lines={lines} selectedId={selectedId} onSelect={setSelectedId} onSeek={seek} />
    <section className="lyrics-editor-grid"><div className="lyrics-lines"><div className="lyrics-list-heading"><b>Timing</b><b>Paroles</b><button onClick={() => addLine(false)}>+ Ajouter</button></div>{lines.map((line) => <button type="button" className={`lyrics-line-row ${line.id === selectedId ? 'selected' : ''}`} key={line.id} onClick={() => setSelectedId(line.id)}><time>{formatLyricsTime(line.start)}</time><span>{line.text}</span></button>)}</div>{selected && <aside className="lyrics-inspector"><p className="section-kicker">Ligne sélectionnée</p><textarea ref={textRef} value={selected.text} onFocus={beginTextEdit} onChange={(event) => updateText(selected.id, event.target.value)} onBlur={finishTextEdit} /><div className="lyrics-time-fields"><label>Début <input type="number" step=".01" value={selected.start} onChange={(event) => update(selected.id, { start: Number(event.target.value) })} /><small>{formatLyricsTime(selected.start)}</small></label><label>Fin <input type="number" step=".01" value={selected.end} onChange={(event) => update(selected.id, { end: Number(event.target.value) })} /><small>{formatLyricsTime(selected.end)}</small></label></div><div className="lyrics-actions"><button onClick={() => update(selected.id, { start: round(time) })}>[ Début = temps courant</button><button onClick={() => update(selected.id, { end: round(time) })}>] Fin = temps courant</button><button onClick={() => listenLine()}>Écouter cette ligne</button></div><div className="lyrics-actions compact">{[-.1, -.01, .01, .1].map((delta) => <button key={delta} onClick={() => update(selected.id, { start: round(selected.start + delta), end: round(selected.end + delta) })}>{delta > 0 ? '+' : ''}{delta * 1000} ms</button>)}</div><div className="lyrics-actions"><button onClick={() => addLine(false)}>Ajouter avant</button><button onClick={() => addLine(true)}>Ajouter après</button><button disabled={lines.findIndex((line) => line.id === selected.id) === lines.length - 1} onClick={() => { const index = lines.findIndex((line) => line.id === selected.id); const next = lines[index + 1]; commit(lines.map((line, i) => i === index ? { ...line, text: `${line.text} ${next.text}`.trim(), end: next.end } : line).filter((_, i) => i !== index + 1)) }}>Fusionner</button><button disabled={selected.text.trim().split(/\s+/).length < 2} onClick={() => { const pair = splitLine(selected, textRef.current?.selectionStart); const index = lines.findIndex((line) => line.id === selected.id); commit([...lines.slice(0, index), ...pair, ...lines.slice(index + 1)]); setSelectedId(pair[0].id) }}><Scissors size={14} />Découper</button><button className="danger" onClick={() => { if (!window.confirm('Supprimer cette ligne ?')) return; const next = lines.filter((line) => line.id !== selected.id); commit(next); setSelectedId(next[0]?.id || '') }}>Supprimer</button></div></aside>}</section>
    {issues.length > 0 && <p className="lyrics-warning">{issues[0]} Les chevauchements restent autorisés pour les chœurs.</p>}<section className="lyrics-preview"><p className="section-kicker">Karaoke preview</p><strong>{lines.find((line) => time >= line.start && time < line.end)?.text || '…'}</strong></section><footer className="lyrics-footer"><button onClick={restore}>Restaurer les paroles d’origine</button><label className="lyrics-import"><input type="file" accept=".lrc,text/plain" onChange={importLrc} />Importer .lrc</label><button onClick={exportLrc}><Download size={15} />Exporter .lrc</button><small>Espace lecture/pause · ←/→ seek 100 ms · [ début · ] fin · Ctrl/Cmd+S sauvegarder.</small><span>{status || (dirty ? 'Modifications non sauvegardées.' : 'Sauvegardé.')}</span></footer>
  </main>
}
