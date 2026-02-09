#!/usr/bin/env python3
"""
Video Transcription Tool using faster-whisper
- 4x faster than standard Whisper
- Runs locally, no API costs
- Uses simpler Silero VAD (no PyTorch loading issues)

Usage:
    source .venv/bin/activate
    python video_transcribe_fast.py /path/to/video.mp4 --model base
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from datetime import timedelta

try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    print("Error: faster-whisper not installed.")
    print("Run: source .venv/bin/activate && pip install faster-whisper")
    sys.exit(1)


def get_device():
    """Determine best device."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass
    return "cpu"


def get_compute_type(device):
    """Get compute type for device."""
    return "float16" if device == "cuda" else "int8"


def extract_audio(video_path: str, output_path: str = None) -> str:
    """Extract audio from video using FFmpeg."""
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav")

    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        "-loglevel", "error",
        output_path
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return output_path


def format_timestamp(seconds: float) -> str:
    """Format seconds as MM:SS.mmm"""
    minutes, secs = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    ms = int((seconds % 1) * 1000)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"
    return f"{minutes:02d}:{secs:02d}.{ms:03d}"


def transcribe_video(
    video_path: str,
    model_name: str = "base",
    output_dir: str = None
) -> dict:
    """Transcribe video using faster-whisper."""

    video_path = Path(video_path).resolve()
    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    if output_dir is None:
        output_dir = video_path.parent
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

    base_name = video_path.stem
    device = get_device()
    compute_type = get_compute_type(device)

    print(f"\n{'='*60}")
    print(f"faster-whisper Video Transcription")
    print(f"{'='*60}")
    print(f"File: {video_path.name}")
    print(f"Model: {model_name}")
    print(f"Device: {device} ({compute_type})")
    print(f"{'='*60}\n")

    # Extract audio
    print("Extracting audio...")
    audio_path = str(output_dir / f"{base_name}_audio.wav")
    extract_audio(str(video_path), audio_path)
    print(f"Audio saved: {audio_path}")

    # Load model
    print(f"\nLoading faster-whisper model '{model_name}'...")
    model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type
    )

    # Transcribe
    print("Transcribing (4x faster than standard Whisper)...")
    segments_generator, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True,  # Uses Silero VAD - no compatibility issues
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200
        )
    )

    print(f"Detected language: {info.language} (confidence: {info.language_probability:.2f})")

    # Process segments
    segments = []
    full_text_parts = []

    for seg in segments_generator:
        segment_data = {
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "start_formatted": format_timestamp(seg.start),
            "end_formatted": format_timestamp(seg.end),
            "text": seg.text.strip(),
        }

        # Include word-level timestamps if available
        if seg.words:
            segment_data["words"] = [
                {
                    "word": w.word,
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "probability": round(w.probability, 3)
                }
                for w in seg.words
            ]

        segments.append(segment_data)
        full_text_parts.append(seg.text.strip())
        print(f"  [{segment_data['start_formatted']}] {seg.text.strip()[:50]}...")

    # Build output
    full_transcript = " ".join(full_text_parts)
    output = {
        "video_file": str(video_path),
        "language": info.language,
        "language_confidence": round(info.language_probability, 3),
        "duration": round(info.duration, 2),
        "model_used": model_name,
        "transcription_engine": "faster-whisper",
        "transcript": full_transcript,
        "segments": segments,
        "segment_count": len(segments)
    }

    # Save JSON
    json_path = output_dir / f"{base_name}_transcript.json"
    with open(json_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nJSON saved: {json_path}")

    # Save text
    txt_path = output_dir / f"{base_name}_transcript.txt"
    with open(txt_path, "w") as f:
        f.write(f"Video: {video_path.name}\n")
        f.write(f"Language: {info.language}\n")
        f.write(f"Model: {model_name} (faster-whisper)\n")
        f.write(f"Duration: {format_timestamp(info.duration)}\n")
        f.write("="*60 + "\n\n")

        for seg in segments:
            f.write(f"[{seg['start_formatted']} - {seg['end_formatted']}]\n")
            f.write(f"{seg['text']}\n\n")
    print(f"Text saved: {txt_path}")

    # Summary
    print(f"\n{'='*60}")
    print("TRANSCRIPTION COMPLETE")
    print(f"{'='*60}")
    print(f"Language: {info.language}")
    print(f"Duration: {format_timestamp(info.duration)}")
    print(f"Segments: {len(segments)}")
    print(f"\nTranscript:\n")
    print(full_transcript[:1500] + ("..." if len(full_transcript) > 1500 else ""))
    print(f"\n{'='*60}\n")

    return output


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe video with faster-whisper (4x faster than standard Whisper)"
    )
    parser.add_argument("video_path", help="Path to video file")
    parser.add_argument(
        "--model", "-m",
        default="base",
        choices=["tiny", "tiny.en", "base", "base.en", "small", "small.en",
                 "medium", "medium.en", "large-v1", "large-v2", "large-v3"],
        help="Model size (default: base)"
    )
    parser.add_argument("--output", "-o", help="Output directory")

    args = parser.parse_args()

    try:
        result = transcribe_video(
            args.video_path,
            model_name=args.model,
            output_dir=args.output
        )
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
