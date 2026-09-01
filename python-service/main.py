import base64
import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
import soundfile as sf


app = FastAPI(title="Backline Stem Separation Service")

SPLEETER_IMAGE = os.getenv(
    "SPLEETER_IMAGE",
    "researchdeezer/spleeter"
)


def run_spleeter(input_file: Path, output_dir: Path):
    """
    Lance Spleeter dans Docker et produit :
      vocals.wav
      accompaniment.wav
    """

    output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        "docker",
        "run",
        "--rm",

        # Entrée audio
        "-v",
        f"{input_file.parent}:/input",

        # Sortie
        "-v",
        f"{output_dir}:/output",

        SPLEETER_IMAGE,

        "separate",
        "-p",
        "spleeter:2stems",
        "-o",
        "/output",
        "-i",
        f"/input/{input_file.name}",
    ]

    print("[spleeter] lancement :", " ".join(command))

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
    )

    if result.stdout:
        print("[spleeter]", result.stdout)

    if result.stderr:
        print("[spleeter]", result.stderr)

    if result.returncode != 0:
        raise RuntimeError(
            f"Spleeter Docker a échoué avec le code "
            f"{result.returncode}"
        )

    # Spleeter crée un dossier portant le nom du fichier
    # sans son extension.
    song_dir = output_dir / input_file.stem

    vocals = song_dir / "vocals.wav"
    accompaniment = song_dir / "accompaniment.wav"

    if not vocals.exists():
        raise FileNotFoundError(
            f"Stem vocal introuvable : {vocals}"
        )

    if not accompaniment.exists():
        raise FileNotFoundError(
            f"Stem instrumental introuvable : {accompaniment}"
        )

    return vocals, accompaniment


def wav_to_base64(file_path: Path):
    """Convertit un WAV en base64."""

    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


@app.post("/separate")
async def separate(file: UploadFile = File(...)):

    filename = file.filename or ""

    if not filename.lower().endswith((".mp3", ".wav")):
        raise HTTPException(
            status_code=400,
            detail="Seuls les fichiers MP3/WAV sont acceptés."
        )

    raw = await file.read()

    with tempfile.TemporaryDirectory() as temp_dir:

        temp_path = Path(temp_dir)

        input_file = temp_path / filename

        with open(input_file, "wb") as f:
            f.write(raw)

        output_dir = temp_path / "output"

        try:
            vocals_path, accompaniment_path = run_spleeter(
                input_file,
                output_dir
            )

            vocal_base64 = wav_to_base64(vocals_path)
            instru_base64 = wav_to_base64(accompaniment_path)

        except Exception as e:
            print("[spleeter] ERREUR :", repr(e))

            raise HTTPException(
                status_code=502,
                detail="La séparation audio avec Spleeter a échoué."
            )

    return {
        "vocal_base64": vocal_base64,
        "instru_base64": instru_base64,
        "format": "wav",
        "mock": False,
        "engine": "spleeter",
    }


@app.get("/health")
async def health():
    return {
        "ok": True,
        "mock_mode": False,
        "engine": "spleeter",
    }