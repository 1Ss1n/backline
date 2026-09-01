# Backline — Karaoké IA

Application de karaoké permettant de déposer un morceau MP3, d'isoler la voix et l'instrumental, d'identifier le morceau, de récupérer les paroles synchronisées et de contrôler séparément le volume de la voix et de l'instrumental.

---

## Architecture

```text
                         ┌─────────────────────┐
                         │       React         │
                         │       Vite          │
                         │   localhost:5173    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Node / Express   │
                         │   localhost:4000    │
                         └──────┬────────┬─────┘
                                │        │
                    ┌───────────┘        └──────────────┐
                    ▼                                   ▼
          ┌──────────────────┐                ┌──────────────────┐
          │ FastAPI / Python │                │      AudD        │
          │ localhost:8000   │                │ Identification   │
          └────────┬─────────┘                └──────────────────┘
                   │
                   ▼
          ┌──────────────────┐
          │ Docker / Spleeter│
          │ Vocal / Instru   │
          └──────────────────┘

                         Node
                           │
                           ▼
                       LRCLIB
                    Paroles synchronisées
```

---

# 1. Prérequis

Sur le nouvel ordinateur, installer :

* Git
* Node.js
* Python 3.11
* Docker Desktop

> **Important :** le projet Python utilise actuellement Python 3.11. Ne pas utiliser Python 3.14 pour créer le nouvel environnement virtuel.

---

# 2. Récupérer le projet

Cloner le dépôt :

```bash
git clone <URL_DU_REPOSITORY>
```

Puis :

```bash
cd karaoke-app
```

La structure doit être similaire à :

```text
karaoke-app/
├── backend/
├── frontend/
├── python-service/
├── spleeter-test/
└── README.md
```

---

# 3. Installer et démarrer Docker

Installer Docker Desktop puis le lancer.

Vérifier :

```bash
docker --version
```

Puis :

```bash
docker ps
```

Si `docker ps` fonctionne, Docker est prêt.

### macOS

Si le terminal indique :

```text
zsh: command not found: docker
```

vérifier que Docker Desktop est installé.

Le CLI Docker peut se trouver ici :

```text
/Applications/Docker.app/Contents/Resources/bin/docker
```

Ajouter temporairement Docker au PATH :

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

Pour rendre le changement permanent :

```bash
echo 'export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"' >> ~/.zshrc
```

Puis :

```bash
source ~/.zshrc
```

Vérifier :

```bash
which docker
docker --version
```

---

# 4. Service Python / FastAPI

Entrer dans le dossier :

```bash
cd python-service
```

## Créer l'environnement virtuel

Avec Python 3.11 :

```bash
python3.11 -m venv .venv
```

Activer l'environnement :

```bash
source .venv/bin/activate
```

Le terminal doit maintenant afficher :

```text
(.venv)
```

Vérifier :

```bash
python --version
```

Résultat attendu :

```text
Python 3.11.x
```

---

## Installer les dépendances

```bash
pip install --upgrade pip
```

Puis :

```bash
pip install -r requirements.txt
```

Vérifier PyTorch :

```bash
python -c "import torch; print(torch.__version__)"
```

---

# 5. Vérifier Spleeter / Docker

Avant de lancer FastAPI, vérifier que Docker fonctionne :

```bash
docker ps
```

Le conteneur Spleeter n'a pas besoin d'être lancé manuellement en permanence.

Le service Python lance automatiquement Docker/Spleeter lorsqu'une séparation est demandée.

---

# 6. Lancer FastAPI

Toujours dans :

```text
python-service/
```

avec `.venv` activé :

```bash
uvicorn main:app --reload --port 8000
```

Le service est maintenant disponible à :

```text
http://localhost:8000
```

## Vérifier le service

Dans un autre terminal :

```bash
curl http://localhost:8000/health
```

Résultat attendu :

```json
{
  "ok": true,
  "mock_mode": false,
  "engine": "spleeter"
}
```

Le point important est :

```text
"mock_mode": false
```

et :

```text
"engine": "spleeter"
```

---

# 7. Tester Spleeter directement

Créer un dossier de test :

```bash
mkdir -p test-input
mkdir -p test-output
```

Placer un fichier MP3 dans :

```text
python-service/test-input/
```

Par exemple :

```text
test-input/
└── test.mp3
```

Puis tester directement Spleeter :

```bash
docker run --rm \
  -v "$(pwd)/test-input:/input" \
  -v "$(pwd)/test-output:/output" \
  researchdeezer/spleeter \
  separate \
  -p spleeter:2stems \
  -o /output \
  -i "/input/test.mp3"
```

Si tout fonctionne, on doit obtenir :

```text
test-output/
└── test/
    ├── vocals.wav
    └── accompaniment.wav
```

---

# 8. Tester Spleeter via FastAPI

Avec FastAPI toujours lancé :

```bash
curl -X POST \
  -F "file=@/chemin/vers/test.mp3" \
  http://localhost:8000/separate \
  -o /tmp/separation.json
```

Ne pas afficher directement le résultat dans le terminal.

Le résultat contient des fichiers audio encodés en Base64 et peut donc être très volumineux.

Vérifier simplement :

```bash
python -c "import json; d=json.load(open('/tmp/separation.json')); print('Mock:', d['mock']); print('Engine:', d['engine']); print('Format:', d['format'])"
```

Résultat attendu :

```text
Mock: False
Engine: spleeter
Format: wav
```

---

# 9. Backend Node.js

Ouvrir un nouveau terminal.

Entrer dans :

```bash
cd karaoke-app/backend
```

Installer les dépendances :

```bash
npm install
```

---

# 10. Configuration du backend

Créer le fichier :

```text
backend/.env
```

À partir du fichier exemple :

```bash
cp .env.example .env
```

Puis ouvrir :

```bash
nano .env
```

Ajouter notamment :

```env
AUDD_API_TOKEN=VOTRE_TOKEN_AUDD
STEM_SERVICE_URL=http://localhost:8000
```

### AudD

L'application utilise AudD pour identifier les morceaux.

Il faut donc renseigner :

```env
AUDD_API_TOKEN=...
```

Ne jamais mettre cette clé directement dans le frontend.

---

# 11. Lancer le backend

Depuis :

```text
backend/
```

lancer :

```bash
npm run dev
```

Le backend doit être disponible sur :

```text
http://localhost:4000
```

---

# 12. Tester l'identification

Avec le backend lancé :

```bash
curl -X POST \
  -F "audio=@/chemin/vers/test.mp3" \
  http://localhost:4000/api/recognize
```

Résultat attendu :

```json
{
  "title": "...",
  "artist": "...",
  "album": "..."
}
```

---

# 13. Tester les paroles

Exemple :

```bash
curl "http://localhost:4000/api/lyrics?title=Creep&artist=Radiohead"
```

Si LRCLIB possède les paroles synchronisées :

```json
{
  "syncedLyrics": "...",
  "plainLyrics": "...",
  "source": "lrclib"
}
```

LRCLIB ne nécessite pas de clé API.

---

# 14. Tester la séparation complète via Node

Avec :

* Docker lancé
* FastAPI lancé sur `8000`
* Backend lancé sur `4000`

exécuter :

```bash
curl -X POST \
  -F "audio=@/chemin/vers/test.mp3" \
  http://localhost:4000/api/separate \
  -o /tmp/backline-separate.json
```

Puis :

```bash
python -c "import json; d=json.load(open('/tmp/backline-separate.json')); print(d['vocalUrl']); print(d['instruUrl'])"
```

Résultat attendu :

```text
/stems/xxxxxxxx-vocal.wav
/stems/xxxxxxxx-instru.wav
```

---

# 15. Frontend React

Ouvrir un nouveau terminal :

```bash
cd karaoke-app/frontend
```

Installer les dépendances :

```bash
npm install
```

Puis lancer :

```bash
npm run dev
```

Vite doit afficher une adresse similaire à :

```text
http://localhost:5173/
```

Ouvrir cette adresse dans le navigateur.

---

# 16. Ordre de démarrage habituel

À chaque fois que tu veux travailler sur Backline, il faut lancer **3 terminaux**.

### Terminal 1 — FastAPI

```bash
cd ~/Desktop/Projets/karaoke-app/python-service
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Terminal 2 — Backend

```bash
cd ~/Desktop/Projets/karaoke-app/backend
npm run dev
```

### Terminal 3 — Frontend

```bash
cd ~/Desktop/Projets/karaoke-app/frontend
npm run dev
```

Puis ouvrir :

```text
http://localhost:5173
```

---

# 17. Vérification rapide

Avant de tester l'application, vérifier :

### Docker

```bash
docker ps
```

### Python

```bash
cd python-service
source .venv/bin/activate
python --version
```

Doit être :

```text
Python 3.11.x
```

### FastAPI

```bash
curl http://localhost:8000/health
```

Doit retourner :

```json
{
  "ok": true,
  "mock_mode": false,
  "engine": "spleeter"
}
```

### Backend

```text
http://localhost:4000
```

### Frontend

```text
http://localhost:5173
```

---

# 18. Fonctionnement complet

Une fois les trois services lancés :

```text
Utilisateur
    │
    │ MP3
    ▼
React :5173
    │
    ▼
Express :4000
    │
    ├──────────────► AudD
    │                 │
    │                 ▼
    │             Artiste / Titre
    │
    ├──────────────► LRCLIB
    │                 │
    │                 ▼
    │             Paroles LRC
    │
    └──────────────► FastAPI :8000
                       │
                       ▼
                    Docker
                       │
                       ▼
                   Spleeter
                    /      \
                   ▼        ▼
               Vocals    Instru
                   │        │
                   └────┬───┘
                        ▼
                      React
                        │
                        ▼
                  Lecteur Karaoké
```

---

# 19. Problèmes fréquents

## `python: command not found`

Activer l'environnement :

```bash
source .venv/bin/activate
```

---

## `ModuleNotFoundError`

Vérifier que `.venv` est activé :

```bash
which python
```

Le résultat doit pointer vers :

```text
python-service/.venv/bin/python
```

Puis réinstaller :

```bash
pip install -r requirements.txt
```

---

## `docker: command not found`

Vérifier Docker Desktop puis :

```bash
which docker
```

Si nécessaire :

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

---

## FastAPI retourne `502`

Regarder le terminal dans lequel tourne :

```bash
uvicorn main:app --reload --port 8000
```

L'erreur détaillée y sera affichée.

---

## AudD retourne une erreur

Vérifier :

```text
backend/.env
```

et notamment :

```env
AUDD_API_TOKEN=...
```

Puis redémarrer le backend.

---

## Le frontend ne démarre pas

Dans `frontend/` :

```bash
npm install
npm run dev
```

---

# 20. Arrêter l'application

Pour arrêter chaque service :

```text
Ctrl + C
```

Faire cela dans chacun des trois terminaux.

Il n'est **pas nécessaire de réinstaller les dépendances** à chaque fois.

---

# 21. Relancer plus tard

Une fois le projet installé, il n'est pas nécessaire de refaire toute l'installation.

Il suffit de :

### Docker

Lancer Docker Desktop.

### FastAPI

```bash
cd ~/Desktop/Projets/karaoke-app/python-service
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Backend

```bash
cd ~/Desktop/Projets/karaoke-app/backend
npm run dev
```

### Frontend

```bash
cd ~/Desktop/Projets/karaoke-app/frontend
npm run dev
```

Puis :

```text
http://localhost:5173
```

---

# 22. Sécurité

Ne jamais commit le fichier :

```text
backend/.env
```

Ajouter dans `.gitignore` :

```text
.env
.venv/
node_modules/
storage/
__pycache__/
*.pyc
```

Le token AudD doit rester uniquement côté backend.

---

# 23. Résumé

Pour installer Backline sur un nouvel ordinateur :

```text
1. Installer Git
2. Installer Node.js
3. Installer Python 3.11
4. Installer Docker Desktop
5. Cloner le projet
6. Créer python-service/.venv
7. Installer les dépendances Python
8. Configurer backend/.env
9. Installer les dépendances Node
10. Lancer FastAPI
11. Lancer Express
12. Lancer React
13. Ouvrir localhost:5173
```

Une fois cette installation effectuée, les prochaines sessions nécessitent uniquement de lancer les trois services.
