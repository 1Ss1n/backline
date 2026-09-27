// Display-only helpers: original MIDI pitches still go to scoring unchanged.
export const PITCH_WINDOW_SECONDS = 8

export function getVisiblePitchNotes(notes, time, windowSeconds = PITCH_WINDOW_SECONDS) {
  const start = time - windowSeconds / 2
  const end = time + windowSeconds / 2
  return notes.filter(note => Number.isFinite(note.midi) && Number.isFinite(note.start) &&
    Number.isFinite(note.end) && note.end > note.start && note.end > start && note.start < end)
}

export function getVisiblePitchPoints(points, time, windowSeconds = PITCH_WINDOW_SECONDS) {
  const start = time - windowSeconds / 2
  const end = time + windowSeconds / 2
  return points.filter(point => Number.isFinite(point.midi) && Number.isFinite(point.time) &&
    point.time >= start && point.time <= end)
}

export function getPitchViewport(notes, points) {
  let low = Infinity, high = -Infinity
  for (const item of [...notes, ...points]) {
    if (!Number.isFinite(item.midi)) continue
    low = Math.min(low, item.midi)
    high = Math.max(high, item.midi)
  }
  if (!Number.isFinite(low)) return { low: 54, high: 66 }
  // Quantized padding avoids tiny microphone fluctuations moving the view.
  // No upper span cap: every visible note (even several octaves apart) fits.
  low = Math.floor(low / 2) * 2 - 2
  high = Math.ceil(high / 2) * 2 + 2
  if (high - low < 12) {
    const center = Math.round((low + high) / 2)
    low = center - 6
    high = center + 6
  }
  return { low, high }
}

export function pitchVerticalPosition(midi, range) {
  // Reserve 8% above/below, including at the extreme MIDI values.
  return 8 + (range.high - midi) / (range.high - range.low) * 84
}

export function pitchNoteRect(note, time, windowSeconds = PITCH_WINDOW_SECONDS) {
  const start = time - windowSeconds / 2
  const left = Math.max(0, (note.start - start) / windowSeconds * 100)
  const right = Math.min(100, (note.end - start) / windowSeconds * 100)
  return { left, width: Math.max(0, right - left) }
}
