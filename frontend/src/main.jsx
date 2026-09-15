import React from 'react'
import ReactDOM from 'react-dom/client'
import AuthApp from './AuthApp.jsx'
import PitchTestPage from './PitchTestPage.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {window.location.pathname === '/pitch-test' ? <PitchTestPage /> : <AuthApp />}
  </React.StrictMode>
)
