#!/usr/bin/env python3
"""
Video Transcription Tool for Relay/Axion
Extracts audio from video files and transcribes speech to text using Whisper.

Usage:
    python video_transcribe.py /path/to/video.mp4
    python video_transcribe.py /path/to/video.mp4 --model medium --output transcript.json

Outputs:
    - JSON file with timestamped transcript segments
    - Plain text transcript
    - Optionally combined with frame extraction for full video analysis
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from datetime import timedelta

# Check for whisper availability
try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    print("Warning: openai-whisper not installed. Install with: pip install openai-whisper")


def extract_audio(video_path: str, output_path: str = None) -> str:
    """Extract audio from video using FFmpeg."""
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav")

    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn",                    # No video
        "-acodec", "pcm_s16le",   # WAV format
        "-ar", "16000",           # 16kHz sample rate (optimal for Whisper)
        "-ac", "1",               # Mono
        "-loglevel", "error",
        output_path
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"Error extracting audio: {e.stderr.decode()}")
        raise


def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds using FFprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return float(result.stdout.strip())


def format_timestamp(seconds: float) -> str:
    """Format seconds as HH:MM:SS."""
    td = timedelta(seconds=seconds)
    hours, remainder = divmod(td.seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def transcribe_audio(audio_path: str, model_name: str = "base") -> dict:
    """Transcribe audio using Whisper."""
    if not WHISPER_AVAILABLE:
        raise RuntimeError("Whisper not available. Install with: pip install openai-whisper")

    print(f"Loading Whisper model '{model_name}'...")
    model = whisper.load_model(model_name)

    print("Transcribing audio...")
    result = model.transcribe(
        audio_path,
        verbose=False,
        word_timestamps=True,
        fp16=False  # Use FP32 for CPU compatibility
    )

    return result


def process_video(video_path: str, model_name: str = "base", output_dir: str = None) -> dict:
    """
    Main processing function - extracts audio and transcribes.

    Returns a dict with:
        - transcript: Full text transcript
        - segments: List of timestamped segments
        - duration: Video duration
        - language: Detected language
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
    print(f"Processing: {video_path.name}")
    print(f"{'='*60}\n")

    # Get video info
    duration = get_video_duration(str(video_path))
    print(f"Video duration: {format_timestamp(duration)}")

    # Extract audio
    print("\nExtracting audio...")
    audio_path = str(output_dir / f"{base_name}_audio.wav")
    extract_audio(str(video_path), audio_path)
    print(f"Audio saved to: {audio_path}")

    # Transcribe
    print(f"\nTranscribing with Whisper ({model_name} model)...")
    result = transcribe_audio(audio_path, model_name)

    # Process segments
    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": seg["start"],
            "end": seg["end"],
            "start_formatted": format_timestamp(seg["start"]),
            "end_formatted": format_timestamp(seg["end"]),
            "text": seg["text"].strip(),
        })

    # Build output
    output = {
        "video_file": str(video_path),
        "duration": duration,
        "duration_formatted": format_timestamp(duration),
        "language": result.get("language", "unknown"),
        "transcript": result.get("text", "").strip(),
        "segments": segments,
        "segment_count": len(segments),
        "model_used": model_name
    }

    # Save JSON output
    json_path = output_dir / f"{base_name}_transcript.json"
    with open(json_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nJSON transcript saved to: {json_path}")

    # Save plain text transcript
    txt_path = output_dir / f"{base_name}_transcript.txt"
    with open(txt_path, "w") as f:
        f.write(f"Video: {video_path.name}\n")
        f.write(f"Duration: {format_timestamp(duration)}\n")
        f.write(f"Language: {result.get('language', 'unknown')}\n")
        f.write("="*60 + "\n\n")

        for seg in segments:
            f.write(f"[{seg['start_formatted']} - {seg['end_formatted']}]\n")
            f.write(f"{seg['text']}\n\n")
    print(f"Text transcript saved to: {txt_path}")

    # Cleanup temp audio file (optional - keep for debugging)
    # os.remove(audio_path)

    # Print summary
    print(f"\n{'='*60}")
    print("TRANSCRIPT SUMMARY")
    print(f"{'='*60}")
    print(f"Language detected: {result.get('language', 'unknown')}")
    print(f"Segments: {len(segments)}")
    print(f"\nFull transcript:\n")
    print(output["transcript"][:2000] + ("..." if len(output["transcript"]) > 2000 else ""))
    print(f"\n{'='*60}\n")

    return output


def format_for_claude(result: dict) -> str:
    """
    Format the transcript result for use with Claude.
    Returns a markdown-formatted string that can be injected into context.
    """
    lines = [
        f"## Video Transcript: {Path(result['video_file']).name}",
        f"**Duration:** {result['duration_formatted']}",
        f"**Language:** {result['language']}",
        f"**Segments:** {result['segment_count']}",
        "",
        "### Full Transcript",
        result['transcript'],
        "",
        "### Timestamped Segments",
    ]

    for seg in result['segments']:
        lines.append(f"**[{seg['start_formatted']}]** {seg['text']}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe speech from video files using Whisper"
    )
    parser.add_argument(
        "video_path",
        help="Path to the video file (MP4, MPEG, MOV, etc.)"
    )
    parser.add_argument(
        "--model", "-m",
        default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size (default: base). Larger = more accurate but slower."
    )
    parser.add_argument(
        "--output", "-o",
        help="Output directory for transcript files (default: same as video)"
    )
    parser.add_argument(
        "--claude-format", "-c",
        action="store_true",
        help="Print Claude-formatted transcript to stdout"
    )

    args = parser.parse_args()

    try:
        result = process_video(args.video_path, args.model, args.output)

        if args.claude_format:
            print("\n" + "="*60)
            print("CLAUDE-FORMATTED OUTPUT (copy/paste into context):")
            print("="*60 + "\n")
            print(format_for_claude(result))

        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
