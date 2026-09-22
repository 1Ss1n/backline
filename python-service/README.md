# Service audio Backline

Le service FastAPI utilise Spleeter pour extraire les deux stems d'un fichier audio :

- `vocals.wav`
- `accompaniment.wav`

## Démarrage

```powershell
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Docker Desktop doit être lancé : l'endpoint appelle l'image `researchdeezer/spleeter`
à la demande, sans service Docker persistant.

## Endpoint

`POST /separate` — multipart/form-data avec un champ `file` (MP3 ou WAV).

La réponse contient les deux fichiers WAV encodés en base64, avec les clés
`vocal_base64` et `instru_base64`.

## Basic Pitch

Basic Pitch reste isolé dans `python-service/.venv-basic-pitch` pour ne pas
modifier l'environnement FastAPI/Spleeter :

```powershell
..\.venv\Scripts\python.exe -m venv .venv-basic-pitch
.\.venv-basic-pitch\Scripts\python.exe -m pip install --upgrade pip
.\.venv-basic-pitch\Scripts\python.exe -m pip install -r requirements-basic-pitch.txt
```

`POST /analyze-vocals` exécute : audio original → Spleeter → `vocals.wav`
temporaire → Basic Pitch → JSON. Les fichiers temporaires sont supprimés après
chaque requête.
