import { useRef, useCallback } from 'react'

/**
 * Knob rotatif style console de mixage.
 * value: 0..1 — onChange(value) renvoyé au parent.
 * Interaction: glisser verticalement (haut = augmente), comme un vrai potard.
 */
export default function VolumeKnob({ label, value, onChange, variant = 'instru' }) {
  const dragRef = useRef(null)

  const handlePointerDown = useCallback(
    (e) => {
      const startY = e.clientY
      const startValue = value
      dragRef.current = { startY, startValue }
      e.target.setPointerCapture(e.pointerId)
    },
    [value]
  )

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragRef.current) return
      const deltaY = dragRef.current.startY - e.clientY
      const next = Math.min(1, Math.max(0, dragRef.current.startValue + deltaY / 140))
      onChange(next)
    },
    [onChange]
  )

  const handlePointerUp = useCallback((e) => {
    dragRef.current = null
    e.target.releasePointerCapture?.(e.pointerId)
  }, [])

  // -130deg (min) à 130deg (max), 0 = midi vertical
  const angle = -130 + value * 260

  return (
    <div className={`knob-unit ${variant}`}>
      <div
        className="knob"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(e.key)) e.preventDefault()
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(Math.min(1, value + 0.05))
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(Math.max(0, value - 0.05))
          if (e.key === 'Home') onChange(0)
          if (e.key === 'End') onChange(1)
        }}
      >
        <div className="indicator" style={{ transform: `translateX(-50%) rotate(${angle}deg)` }} />
      </div>
      <div className="knob-label">{label}</div>
      <div className="knob-value">{Math.round(value * 100)}%</div>
    </div>
  )
}
