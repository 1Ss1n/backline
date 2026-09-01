# Service de séparation de stems

FastAPI + Mel-Band RoFormer pour extraire voix / instrumental d'un MP3.

## Démarrage rapide (mode simulation, sans GPU)

```bash
pip install fastapi uvicorn python-multipart soundfile numpy
uvicorn main:app --reload --port 8000
```

En mode `MOCK_MODE=true` (par défaut), le service ne fait pas de vraie
séparation — il renvoie une version atténuée du signal pour chaque piste,
juste pour permettre de développer et tester le frontend/backend de bout
en bout sans avoir besoin d'un GPU.

## Brancher le vrai modèle

1. Récupérer une implémentation de Mel-Band RoFormer avec poids pré-entraînés.
   Options courantes dans la communauté séparation audio :
   - https://github.com/ZFTurbo/Music-Source-Separation-Training (contient
     des configs Mel-Band RoFormer prêtes à l'emploi + poids)
   - Repo original du papier (https://arxiv.org/abs/2310.01809)
2. Adapter `load_model()` dans `main.py` pour charger le checkpoint.
3. Adapter `run_inference()` pour appeler le modèle réel.
4. Mettre `MOCK_MODE=false` dans l'environnement.
5. Déployer sur une machine GPU (ex: Runpod, Modal, Lambda, ou serveur dédié).
   Une inférence sur un morceau de 3-4 minutes prend quelques secondes sur
   un GPU récent (T4/A10 suffisent), plusieurs minutes sur CPU.

## Endpoint

`POST /separate` — multipart/form-data avec un champ `file` (mp3/wav).

Réponse :
```json
{
  "vocal_base64": "...",
  "instru_base64": "...",
  "format": "wav",
  "mock": true
}
```
