
import { useRef, useState, useCallback } from 'react'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 Mo

export default function Uploader({ onFileSelected }) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)

  const inputRef = useRef(null)

  const validateAndSelect = useCallback(
    (file) => {
      setError('')

      if (!file) return

      const isMp3 =
        file.type === 'audio/mpeg' ||
        file.name.toLowerCase().endsWith('.mp3')

      if (!isMp3) {
        setError('Format invalide. Seuls les fichiers MP3 sont acceptés.')
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        setError('Fichier trop volumineux. La taille maximale est de 20 Mo.')
        return
      }

      setSelectedFile(file)
      onFileSelected(file)
    },
    [onFileSelected]
  )

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()

      setDragOver(false)

      const file = e.dataTransfer.files?.[0]

      validateAndSelect(file)
    },
    [validateAndSelect]
  )

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0]

      validateAndSelect(file)

      // Permet de sélectionner à nouveau exactement le même fichier
      e.target.value = ''
    },
    [validateAndSelect]
  )

  const openFilePicker = () => {
    inputRef.current?.click()
  }

  return (
    <div className="uploader">
      <div className="eyebrow">Étape 1</div>

      <h1>Dépose ton morceau</h1>

      <p className="sub">
        MP3 — on isole la voix, on affiche les paroles, tu règles le mix.
      </p>

      <div
        className={`dropzone ${dragOver ? 'drag-over' : ''} ${
          selectedFile ? 'has-file' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
        }}
        onDrop={handleDrop}
      >
        {selectedFile ? (
          <>
            <div className="cta">
              {selectedFile.name}
            </div>

            <div className="icon">
              {(selectedFile.size / (1024 * 1024)).toFixed(1)} Mo · MP3
            </div>

            <button
              type="button"
              className="choose-button"
              onClick={openFilePicker}
            >
              Choisir un autre morceau
            </button>
          </>
        ) : (
          <>
            <div className="cta">
              Glisse un fichier .mp3 ici
            </div>

            <div className="or">
              ou
            </div>

            <button
              type="button"
              className="choose-button"
              onClick={openFilePicker}
            >
              Choisir un fichier
            </button>

            <div className="icon">
              FORMAT ACCEPTÉ · MP3 · MAX 20 MO
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,.mp3"
          onChange={handleFileChange}
          hidden
        />
      </div>

      {error && (
        <div className="upload-error">
          {error}
        </div>
      )}
    </div>
  )
}
