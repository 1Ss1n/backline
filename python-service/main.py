import base64
import io
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
import soundfile as sf
from whisper_service import transcribe_vocals


app = FastAPI(title="Backline Stem Separation Service")

SPLEETER_IMAGE = os.getenv(
    "SPLEETER_IMAGE",
    "researchdeezer/spleeter"
)
BASIC_PITCH_PYTHON = os.getenv("BASIC_PITCH_PYTHON", str(Path(__file__).parent / ".venv-basic-pitch" / "Scripts" / "python.exe"))
BASIC_PITCH_RUNNER = Path(__file__).parent / "basic_pitch_runner.py"


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


@app.post("/analyze-vocals")
async def analyze_vocals(file: UploadFile = File(...)):
    """Experimental pipeline: original audio -> Spleeter vocals -> Basic Pitch -> JSON."""
    filename = file.filename or "audio.mp3"
    if not filename.lower().endswith((".mp3", ".wav")):
        raise HTTPException(status_code=400, detail="Seuls les fichiers MP3/WAV sont acceptés.")
    if not Path(BASIC_PITCH_PYTHON).exists():
        raise HTTPException(status_code=503, detail="Basic Pitch n'est pas installé dans son environnement isolé.")

    started_at = time.perf_counter()
    job_id = uuid.uuid4().hex
    print(f"[pitch-test] analyse démarrée job={job_id}")
    raw = await file.read()
    with tempfile.TemporaryDirectory(prefix=f"backline-pitch-{job_id}-") as temp_dir:
        temp_path = Path(temp_dir)
        input_file = temp_path / filename
        input_file.write_bytes(raw)
        try:
            vocals_path, _ = run_spleeter(input_file, temp_path / "output")
            print(f"[pitch-test] piste vocale prête job={job_id}")
            result_path = temp_path / "notes.json"
            print(f"[basic-pitch] analyse démarrée job={job_id}")
            result = subprocess.run([BASIC_PITCH_PYTHON, str(BASIC_PITCH_RUNNER), str(vocals_path), str(result_path)], capture_output=True, text=True, timeout=900)
            if result.returncode != 0:
                print(f"[basic-pitch] erreur job={job_id}: {result.stderr[-800:]}")
                raise RuntimeError("Basic Pitch n'a pas pu analyser la piste vocale.")
            payload = json.loads(result_path.read_text(encoding="utf-8"))
            print(f"[basic-pitch] {len(payload['notes'])} notes détectées job={job_id}")
        except HTTPException:
            raise
        except Exception as error:
            print(f"[pitch-test] erreur job={job_id}: {error!r}")
            raise HTTPException(status_code=502, detail="Le pipeline expérimental Spleeter/Basic Pitch a échoué.")
    payload["experimental"] = True
    # Preserve the unmodified Basic Pitch events; normalization is a frontend-only
    # display/scoring view and must never overwrite this reference data.
    payload["rawNotes"] = payload["notes"]
    payload["elapsedSeconds"] = round(time.perf_counter() - started_at, 2)
    print(f"[pitch-test] analyse terminée job={job_id} en {payload['elapsedSeconds']} s")
    return payload


@app.post("/transcribe-vocals")
async def transcribe_vocals_route(file: UploadFile = File(...)):
    """Local fallback transcription for a Spleeter-generated vocal WAV."""
    filename = file.filename or "vocals.wav"
    if not filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Un stem vocal WAV est requis.")
    try:
        raw = await file.read()
        with tempfile.TemporaryDirectory(prefix="backline-whisper-") as temp_dir:
            vocal_path = Path(temp_dir) / "vocals.wav"
            vocal_path.write_bytes(raw)
            return transcribe_vocals(vocal_path)
    except Exception as error:
        # A failed optional fallback must never break karaoke creation.
        print(f"[whisper] erreur: {error!r}")
        return {"plainLyrics": "", "segments": [], "source": "none"}
