#!/usr/bin/env python3
"""
Video Transcription Tool using WhisperX (Enhanced Version)
Features:
- 4x faster transcription via faster-whisper
- Speaker diarization (identifies who said what)
- Word-level timestamps for precise sync
- Runs 100% locally, no API costs

Usage:
    # Activate venv first:
    source .venv/bin/activate

    # Basic transcription (no speaker ID)
    python video_transcribe_whisperx.py /path/to/video.mp4

    # With speaker diarization (requires HuggingFace token)
    python video_transcribe_whisperx.py /path/to/video.mp4 --diarize --hf-token YOUR_TOKEN

    # Specify model size
    python video_transcribe_whisperx.py /path/to/video.mp4 --model large-v3
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from datetime import timedelta

# Check for whisperx
try:
    import whisperx
    WHISPERX_AVAILABLE = True
except ImportError:
    WHISPERX_AVAILABLE = False
    print("Error: whisperx not installed. Run: source .venv/bin/activate && pip install whisperx")
    sys.exit(1)

import torch

# Fix PyTorch 2.6+ weights_only compatibility issue
# WhisperX/pyannote models were saved with older PyTorch and need weights_only=False
# This is safe since we're loading from trusted HuggingFace models
import typing

# Monkey-patch torch.load to use weights_only=False for pyannote models
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    # Default to weights_only=False for compatibility with pyannote/whisperx
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load


def get_device():
    """Determine best device for processing."""
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def get_compute_type(device):
    """Get appropriate compute type for device."""
    if device == "cuda":
        return "float16"
    return "int8"  # Faster on CPU


def extract_audio(video_path: str, output_path: str = None) -> str:
    """Extract audio from video using FFmpeg."""
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav")

    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn",                    # No video
        "-acodec", "pcm_s16le",   # WAV format
        "-ar", "16000",           # 16kHz sample rate
        "-ac", "1",               # Mono
        "-loglevel", "error",
        output_path
    ]

    subprocess.run(cmd, check=True, capture_output=True)
    return output_path


def format_timestamp(seconds: float) -> str:
    """Format seconds as HH:MM:SS.mmm"""
    td = timedelta(seconds=seconds)
    hours, remainder = divmod(int(seconds), 3600)
    minutes, secs = divmod(remainder, 60)
    ms = int((seconds % 1) * 1000)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"
    return f"{minutes:02d}:{secs:02d}.{ms:03d}"


def transcribe_with_whisperx(
    audio_path: str,
    model_name: str = "base",
    device: str = None,
    compute_type: str = None,
    enable_diarization: bool = False,
    hf_token: str = None,
    min_speakers: int = None,
    max_speakers: int = None
) -> dict:
    """
    Transcribe audio using WhisperX with optional speaker diarization.

    Args:
        audio_path: Path to audio file
        model_name: Whisper model (tiny, base, small, medium, large-v2, large-v3)
        device: cuda or cpu (auto-detected if None)
        compute_type: float16, int8, etc. (auto-selected if None)
        enable_diarization: Whether to identify speakers
        hf_token: HuggingFace token (required for diarization)
        min_speakers: Minimum expected speakers
        max_speakers: Maximum expected speakers

    Returns:
        dict with transcript, segments, and optional speaker info
    """
    if device is None:
        device = get_device()
    if compute_type is None:
        compute_type = get_compute_type(device)

    print(f"Device: {device}, Compute type: {compute_type}")
    print(f"Loading WhisperX model '{model_name}'...")

    # Load model
    model = whisperx.load_model(
        model_name,
        device=device,
        compute_type=compute_type
    )

    # Load audio
    print("Loading audio...")
    audio = whisperx.load_audio(audio_path)

    # Transcribe
    print("Transcribing (this is 4x faster than standard Whisper)...")
    result = model.transcribe(audio, batch_size=16)

    detected_language = result.get("language", "en")
    print(f"Detected language: {detected_language}")

    # Align whisper output for word-level timestamps
    print("Aligning timestamps...")
    model_a, metadata = whisperx.load_align_model(
        language_code=detected_language,
        device=device
    )
    result = whisperx.align(
        result["segments"],
        model_a,
        metadata,
        audio,
        device,
        return_char_alignments=False
    )

    # Speaker diarization (optional)
    if enable_diarization:
        if not hf_token:
            print("Warning: Speaker diarization requires HuggingFace token. Skipping.")
        else:
            print("Running speaker diarization...")
            try:
                diarize_model = whisperx.DiarizationPipeline(
                    use_auth_token=hf_token,
                    device=device
                )
                diarize_segments = diarize_model(
                    audio,
                    min_speakers=min_speakers,
                    max_speakers=max_speakers
                )
                result = whisperx.assign_word_speakers(diarize_segments, result)
                print("Speaker diarization complete!")
            except Exception as e:
                print(f"Warning: Diarization failed: {e}")
                print("Continuing without speaker identification...")

    return result, detected_language


def process_video(
    video_path: str,
    model_name: str = "base",
    output_dir: str = None,
    enable_diarization: bool = False,
    hf_token: str = None,
    min_speakers: int = None,
    max_speakers: int = None
) -> dict:
    """
    Main processing function - extracts audio and transcribes with WhisperX.
    """
    video_path = Path(video_path).resolve()

    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    if output_dir is None:
        output_dir = video_path.parent
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

    base_name = video_path.stem

    print(f"\n{'='*60}")
    print(f"WhisperX Video Transcription")
    print(f"{'='*60}")
    print(f"File: {video_path.name}")
    print(f"Model: {model_name}")
    print(f"Diarization: {'Enabled' if enable_diarization else 'Disabled'}")
    print(f"{'='*60}\n")

    # Extract audio
    print("Extracting audio from video...")
    audio_path = str(output_dir / f"{base_name}_audio.wav")
    extract_audio(str(video_path), audio_path)
    print(f"Audio saved: {audio_path}")

    # Transcribe with WhisperX
    result, language = transcribe_with_whisperx(
        audio_path,
        model_name=model_name,
        enable_diarization=enable_diarization,
        hf_token=hf_token,
        min_speakers=min_speakers,
        max_speakers=max_speakers
    )

    # Process segments
    segments = []
    full_text_parts = []
    speakers_found = set()

    for seg in result.get("segments", []):
        speaker = seg.get("speaker", "UNKNOWN")
        speakers_found.add(speaker)

        segment_data = {
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "start_formatted": format_timestamp(seg["start"]),
            "end_formatted": format_timestamp(seg["end"]),
            "text": seg["text"].strip(),
            "speaker": speaker
        }

        # Include word-level timestamps if available
        if "words" in seg:
            segment_data["words"] = [
                {
                    "word": w.get("word", ""),
                    "start": round(w.get("start", 0), 3),
                    "end": round(w.get("end", 0), 3),
                    "score": round(w.get("score", 0), 3)
                }
                for w in seg["words"]
            ]

        segments.append(segment_data)

        if enable_diarization and speaker != "UNKNOWN":
            full_text_parts.append(f"[{speaker}]: {seg['text'].strip()}")
        else:
            full_text_parts.append(seg["text"].strip())

    # Build output
    output = {
        "video_file": str(video_path),
        "language": language,
        "model_used": model_name,
        "transcription_engine": "whisperx",
        "speakers": list(speakers_found) if enable_diarization else [],
        "speaker_count": len(speakers_found) if enable_diarization else 0,
        "transcript": " ".join(full_text_parts),
        "transcript_with_speakers": "\n".join(full_text_parts) if enable_diarization else None,
        "segments": segments,
        "segment_count": len(segments)
    }

    # Save JSON
    json_path = output_dir / f"{base_name}_whisperx_transcript.json"
    with open(json_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nJSON saved: {json_path}")

    # Save plain text
    txt_path = output_dir / f"{base_name}_whisperx_transcript.txt"
    with open(txt_path, "w") as f:
        f.write(f"Video: {video_path.name}\n")
        f.write(f"Language: {language}\n")
        f.write(f"Model: {model_name} (WhisperX)\n")
        if enable_diarization:
            f.write(f"Speakers detected: {len(speakers_found)}\n")
        f.write("="*60 + "\n\n")

        for seg in segments:
            timestamp = f"[{seg['start_formatted']} - {seg['end_formatted']}]"
            if enable_diarization and seg.get('speaker') != 'UNKNOWN':
                f.write(f"{timestamp} [{seg['speaker']}]\n")
            else:
                f.write(f"{timestamp}\n")
            f.write(f"{seg['text']}\n\n")

    print(f"Text saved: {txt_path}")

    # Print summary
    print(f"\n{'='*60}")
    print("TRANSCRIPTION COMPLETE")
    print(f"{'='*60}")
    print(f"Language: {language}")
    print(f"Segments: {len(segments)}")
    if enable_diarization:
        print(f"Speakers: {list(speakers_found)}")
    print(f"\nTranscript preview:\n")
    preview = output["transcript"][:1500]
    print(preview + ("..." if len(output["transcript"]) > 1500 else ""))
    print(f"\n{'='*60}\n")

    return output


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe video with WhisperX (4x faster + speaker diarization)"
    )
    parser.add_argument(
        "video_path",
        help="Path to video file (MP4, MPEG, MOV, etc.)"
    )
    parser.add_argument(
        "--model", "-m",
        default="base",
        choices=["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        help="Model size (default: base)"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output directory (default: same as video)"
    )
    parser.add_argument(
        "--diarize", "-d",
        action="store_true",
        help="Enable speaker diarization (requires --hf-token)"
    )
    parser.add_argument(
        "--hf-token",
        help="HuggingFace token for speaker diarization"
    )
    parser.add_argument(
        "--min-speakers",
        type=int,
        help="Minimum number of speakers expected"
    )
    parser.add_argument(
        "--max-speakers",
        type=int,
        help="Maximum number of speakers expected"
    )

    args = parser.parse_args()

    # Check for HF token in environment if not provided
    hf_token = args.hf_token or os.environ.get("HF_TOKEN")

    if args.diarize and not hf_token:
        print("Warning: --diarize requires a HuggingFace token.")
        print("Get one free at: https://huggingface.co/settings/tokens")
        print("Then run with: --hf-token YOUR_TOKEN")
        print("Or set HF_TOKEN environment variable")
        print("\nContinuing without speaker diarization...\n")
        args.diarize = False

    try:
        result = process_video(
            args.video_path,
            model_name=args.model,
            output_dir=args.output,
            enable_diarization=args.diarize,
            hf_token=hf_token,
            min_speakers=args.min_speakers,
            max_speakers=args.max_speakers
        )
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
