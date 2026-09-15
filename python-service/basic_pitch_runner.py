"""Isolated Basic Pitch worker used by the experimental /pitch-test endpoint."""
import json
import math
import sys
from pathlib import Path

import soundfile as sf
from basic_pitch.inference import predict


NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def midi_to_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def run(audio_path: Path, output_path: Path) -> None:
    audio_info = sf.info(str(audio_path))
    _, _, note_events = predict(str(audio_path))
    notes = []
    # Basic Pitch emits (start_sec, end_sec, midi, amplitude, pitch_bend).
    for event in note_events:
        start, end, midi = float(event[0]), float(event[1]), int(round(event[2]))
        note = {
            "start": round(start, 4),
            "end": round(end, 4),
            "midi": midi,
            "note": midi_to_name(midi),
            "frequency": round(440 * math.pow(2, (midi - 69) / 12), 4),
        }
        # Basic Pitch's fourth value is an amplitude, not a calibrated per-note confidence.
        if len(event) > 3 and event[3] is not None:
            note["amplitude"] = round(float(event[3]), 5)
        notes.append(note)
    output_path.write_text(json.dumps({"duration": round(audio_info.duration, 4), "notes": notes}), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: basic_pitch_runner.py INPUT_VOCALS.wav OUTPUT.json")
    run(Path(sys.argv[1]), Path(sys.argv[2]))
