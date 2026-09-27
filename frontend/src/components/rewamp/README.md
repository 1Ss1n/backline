# Backline × RewampUI

Integration inspected against the public RewampUI showcase on 2026-09-25.
RewampUI credits Palak / palakonweb and describes its showcase as inspired by
other creators. Source links below preserve provenance; no npm package named
"rewampui" or undocumented component API is assumed.

## Published sources inspected

- [Catalog](https://rewampui.com/assets/ComponentsPage-DQnxaloO.js)
- [Soft Aurora](https://rewampui.com/assets/SoftAuroraShowcase-Bw7_QbCj.js)
- [Word By Word Text](https://rewampui.com/assets/WordByWordTextShowcase-Db7t8EHD.js)
- [Landscape Orb Toggle](https://rewampui.com/assets/LandscapeOrbToggleShowcase-DaSUBoLV.js)
- [Folder Tab Card](https://rewampui.com/assets/FolderTabCardShowcase-CAP0djFQ.js)

The published examples use React, Motion and Tailwind utility classes.
Backline uses React 18 and plain CSS. These are local adaptations of the source,
not imports of a fictitious package. Motion transitions and utility classes are
ported to scoped CSS; no new runtime dependency is needed. Existing Lucide
icons and Obsidian ArrowFillButton are reused. Playwright is test-only.

## Components

| Component / file | Used in | Backline adaptation |
| --- | --- | --- |
| SoftAurora.jsx | Auth and StudioApp | Original sine-wave shader, Backline palette, baked at resize/theme change; CSS transform drift instead of a perpetual WebGL loop |
| LandscapeOrbToggle.jsx | Sidebar brand / auth | Original hill paths, sun/moon and gloss; 40px globe, controlled theme prop |
| WordByWord.jsx | KaraokeLyrics, both players | Word opacity/vertical reveal derived from audio time, not Motion's automatic index delay |
| FolderTabCard.jsx | Mes morceaux / Mes performances | Original asymmetric SVG folder sheet; real cover or record fallback; one accessible button navigates through existing callbacks |

## Design system

RewampTheme.css is loaded last in main.jsx to provide one explicit redesign layer
over the preserved legacy styles. Tokens cover background, surfaces, border,
foreground, muted foreground, accent, secondary accent, status colors and shadows.
Outfit / DM Sans / DM Mono remain the typography.

- Dark: charcoal surfaces, burgundy #990539 actions with white labels; lighter #ff8db5 accent text for contrast.
- Light: white and blush-tinted surfaces, burgundy #990539 accents and warm dark text.
- Studio: display heading and upload focal area, understated real processing steps.
- Player: current lyric dominant, previous/next quieter, separate mixing console.
- Profile, auth and Lyrics Studio use the same surface and type hierarchy.
- The profile fills the main layout width and height (no max-width card wrapper).
- Collapsed navigation targets are compact 44 × 44px rounded squares.
- Sidebar remains a collapsed rail, expanding on hover or keyboard focus and
  resizing the desktop content in sync. Phones keep an overlay drawer instead.
  Escape closes the drawer; focus stays inside while open.
- Changing views returns the main scrolling area to the top.

## Aurora performance

The original shader's wave/mask calculation is retained, with configurable RGB
uniforms instead of fixed lilac. Render resolution is capped at 640px (320px
on mobile). No state update, interval or requestAnimationFrame drives it.
Only the cached canvas is transformed by a slow CSS animation.
The player freezes and dims it; Lyrics Studio is quieter still.
Mobile and prefers-reduced-motion freeze it. A CSS gradient remains if WebGL
is unavailable. Buffers, shaders, program and ResizeObserver are cleaned up.

## One theme

hooks/useTheme.js owns the theme at AuthApp, passing it into StudioApp.
It keeps the existing backline-theme key and dark first-visit default.
Storage exceptions do not break rendering; storage events synchronize tabs.
The same theme covers login/register, app, profile and editors.

## Word timing

utils/lyricPresentation.js builds an immutable presentation timeline once when
lyrics/duration change. Current line is found with binary search.
Player supplies its audio ref and the existing user lyric offset;
PerformancePlayer supplies the instrumental audio ref. An isolated RAF reads actual
currentTime and updates only word CSS variables. React updates the active line only
at a boundary, not every frame. Pause/end/hidden tabs stop the RAF; seek and offset
changes refresh immediately. Neither source
audio, playback rate nor pitch/scoring logic is modified.

- A matching line.words array with valid start/end/word (or text) uses real
  absolute second timestamps. Stale word metadata after text edits is rejected.
- Line-only lyrics use interpolation inside the line's known window, bounded
  by end / next start / audio duration. This is explicitly presentation-only
  visual estimation, never written to session data.
- Without any known last-line end, show the line without inventing duration.
- Blank lines and explicit gaps stay silent instead of replaying older lyrics.
- Rendering has no independent clock, transition or stagger to continue during
  pause; forward/backward seek, restart and song changes recompute immediately.
- Reduced motion removes movement but keeps synchronized word emphasis.

## Cards

Real session title, artist, cover and available creation/recording date are shown.
No invented scores, ranks or percentages. Cover failures get a record illustration.
The whole native button handles Enter/Space and calls openSession/openPerformance.
No folder expansion, nested action button or alternate routing layer.
Existing performance sharing actions remain below the collection.

## Verification

From frontend:

    npm test
    npm run test:ui
    npm run build

Browser tests use Chromium, intercepted APIs, generated WAV fixtures and a fake
microphone. They never modify real accounts, stems, lyrics or recordings.
Screenshots/traces are written under ignored test-output/browser.
Widths: 1440, 1024, 768 and 390, both themes, including auth, import, collections,
karaoke, Perfect Pitch, editor and profile.

This does not validate real microphone hardware, production API/network behavior,
separation/recognition services or physical iOS/Safari rendering. Pitch algorithms,
scoring and backend code are deliberately unchanged. The existing Vite 8 /
React plugin 4 deprecation warnings are outside this UI migration.
