// RewampUI Landscape Orb paths; CSS transitions replace Motion.
// Controlled by Backline's single theme state.
export default function LandscapeOrbToggle({ theme, onToggle, className = '' }) {
  const dark = theme === 'dark'
  const label = dark ? 'Activer le mode clair' : 'Activer le mode sombre'
  return <button type="button" className={`landscape-orb ${className}`} data-night={dark} onClick={onToggle} aria-label={label} title={label}>
    <span className="orb-sky" aria-hidden="true" />
    <svg className="orb-moon" viewBox="0 0 18 18" aria-hidden="true"><path d="M12 2.5A7 7 0 1 0 12 15.5 8.5 8.5 0 0 1 12 2.5Z" fill="currentColor" /></svg>
    <span className="orb-sun" aria-hidden="true" />
    <svg className="orb-hills orb-hills-back" viewBox="0 0 90 40" preserveAspectRatio="none" aria-hidden="true"><path d={dark ? 'M0,16 C20,6 40,24 60,10 C75,0 85,18 90,12 L90,40 L0,40 Z' : 'M0,18 C15,4 30,4 45,16 C60,28 75,28 90,14 L90,40 L0,40 Z'} /></svg>
    <svg className="orb-hills orb-hills-front" viewBox="0 0 90 30" preserveAspectRatio="none" aria-hidden="true"><path d={dark ? 'M0,14 C24,24 45,4 65,18 C78,26 85,12 90,16 L90,30 L0,30 Z' : 'M0,16 C18,26 32,6 50,14 C66,21 78,10 90,18 L90,30 L0,30 Z'} /></svg>
    <span className="orb-gloss" aria-hidden="true" />
  </button>
}
