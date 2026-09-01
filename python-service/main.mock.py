"""
Micro-service d'inférence pour la séparation voix / instrumental.

Ce service expose un unique endpoint POST /separate qui prend un MP3 en
entrée et renvoie les deux stems encodés en base64. L'inférence réelle
tourne via Mel-Band RoFormer (https://arxiv.org/abs/2310.01809), un
modèle de séparation audio state-of-the-art.

⚠️ Ce service doit tourner sur une machine avec GPU pour des temps
   d'inférence raisonnables (quelques secondes par morceau de 3-4 min
   sur GPU, contre plusieurs minutes sur CPU).

Pour brancher le vrai modèle :
  1. Récupérer les poids pré-entraînés (voir README.md de ce dossier)
  2. Compléter `load_model()` et `run_inference()` ci-dessous
  3. Retirer MOCK_MODE des variables d'environnement

Tant que MOCK_MODE=true, le service simule la séparation (utile pour
développer/tester tout le reste du pipeline sans GPU).
"""

import base64
import io
import os
import tempfile

from fastapi import FastAPI, UploadFile, File, HTTPException
import soundfile as sf
import numpy as np

app = FastAPI(title="Backline Stem Separation Service")

MOCK_MODE = os.getenv("MOCK_MODE", "true").lower() == "true"

_model = None


def load_model():
    """Charge Mel-Band RoFormer une seule fois (lazy loading)."""
    global _model
    if _model is not None:
        return _model

    if MOCK_MODE:
        return None

    # --- À compléter avec le vrai chargement du modèle ---
    # import torch
    # from mel_band_roformer import MelBandRoformer  # selon le repo choisi
    # _model = MelBandRoformer.from_pretrained("checkpoint.ckpt")
    # _model.eval().to("cuda")
    raise NotImplementedError(
        "Branche ici le chargement réel de Mel-Band RoFormer, "
        "ou laisse MOCK_MODE=true pour développer sans GPU."
    )


def run_inference(audio: np.ndarray, sample_rate: int):
    """Retourne (vocal_audio, instru_audio) en numpy arrays."""
    if MOCK_MODE:
        # Simulation grossière juste pour valider le pipeline de bout en bout :
        # "voix" = signal atténué, "instru" = signal original.
        # À ne surtout pas garder en production.
        vocal = audio * 0.6
        instru = audio * 0.9
        return vocal, instru

    model = load_model()
    # --- À compléter avec l'inférence réelle ---
    # with torch.no_grad():
    #     stems = model.separate(audio, sample_rate)
    # return stems["vocals"], stems["instrumental"]
    raise NotImplementedError


@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".mp3", ".wav")):
        raise HTTPException(400, "Seuls les fichiers MP3/WAV sont acceptés.")

    raw = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
        tmp.write(raw)
        tmp.flush()
        audio, sample_rate = sf.read(tmp.name, dtype="float32", always_2d=False)

    vocal, instru = run_inference(audio, sample_rate)

    def to_base64_wav(arr, sr):
        buf = io.BytesIO()
        sf.write(buf, arr, sr, format="WAV")
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "vocal_base64": to_base64_wav(vocal, sample_rate),
        "instru_base64": to_base64_wav(instru, sample_rate),
        "format": "wav",
        "mock": MOCK_MODE,
    }


@app.get("/health")
async def health():
    return {"ok": True, "mock_mode": MOCK_MODE}
