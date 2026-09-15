import os
import time
from pathlib import Path

_model = None


def get_model():
    """Load Faster-Whisper only when the fallback is actually needed."""
    global _model
    if _model is None:
        print("[whisper] chargement du modèle...")
        from faster_whisper import WhisperModel

        _model = WhisperModel(
            os.getenv("WHISPER_MODEL", "small"),
            device="cpu",
            compute_type="int8",
        )
        print("[whisper] modèle prêt")
    return _model


def transcribe_vocals(vocal_path: Path):
    """Return timestamped lyric segments for an already-separated vocal WAV."""
    started_at = time.perf_counter()
    print("[whisper] transcription démarrée")
    model = get_model()
    segments, _info = model.transcribe(
        str(vocal_path),
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    result = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            result.append({"start": round(segment.start, 3), "end": round(segment.end, 3), "text": text})
    print(f"[whisper] {len(result)} segments générés")
    print(f"[whisper] terminé en {time.perf_counter() - started_at:.1f} s")
    return {"plainLyrics": "\n".join(item["text"] for item in result), "segments": result, "source": "whisper"}
