"""Dashboard generation module for API operation status reports."""

import time
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, List

# Dashboard output directory
DASHBOARD_DIR = Path("/opt/clawd/projects/.preview/dashboards")
DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)

# Cost estimates for various operations
COST_ESTIMATES = {
    "image_generation": {
        "openai_standard_1024": 0.04,
        "openai_hd_1024": 0.08,
        "openai_standard_1792": 0.08,
        "openai_hd_1792": 0.12,
    },
    "tts": {
        "edge_tts": 0.0,
        "piper": 0.0,
        "elevenlabs_per_1k_chars": 0.015,
    },
    "ocr": {"tesseract": 0.0},
    "pdf": {"weasyprint": 0.0},
    "whisper": {"local": 0.0},
    "sqlite": {"local": 0.0},
}


def estimate_cost(operation_type: str, params: dict) -> str:
    """Estimate cost for an operation."""
    if operation_type == "image_generation":
        quality = params.get("quality", "standard")
        size = params.get("size", "1024x1024")
        key = f"openai_{quality}_{size.split('x')[0]}"
        cost = COST_ESTIMATES["image_generation"].get(key, 0.08)
        return f"~${cost:.2f}"
    elif operation_type == "tts":
        provider = params.get("provider", "edge_tts")
        if provider == "elevenlabs":
            chars = len(params.get("text", ""))
            cost = (chars / 1000) * COST_ESTIMATES["tts"]["elevenlabs_per_1k_chars"]
            return f"~${cost:.3f}"
        return "Free"
    return "Free"


def generate_dashboard(
    operation_type: str,
    title: str,
    subtitle: str,
    status: str,  # "success", "failure", "pending"
    status_items: List[Dict[str, Any]],
    metadata: Dict[str, str],
    input_params: Dict[str, Any],
    output_data: Optional[Dict[str, Any]] = None,
    timing: Optional[Dict[str, float]] = None,
    download: Optional[Dict[str, str]] = None,
    preview_image: Optional[str] = None,
    hal_message: Optional[str] = None,
) -> str:
    """
    Generate a status dashboard HTML file.

    Returns the URL path to the dashboard (e.g., "/dashboards/image-gen-abc123.html")
    """
    dashboard_id = f"{operation_type}-{uuid.uuid4().hex[:8]}"
    filename = f"{dashboard_id}.html"
    filepath = DASHBOARD_DIR / filename

    # Status indicator colors
    status_colors = {
        "success": ("#00ff00", "#00aa00", "#003300"),
        "failure": ("#ff0000", "#aa0000", "#330000"),
        "pending": ("#ffaa00", "#aa7700", "#332200"),
    }
    colors = status_colors.get(status, status_colors["pending"])

    # Generate status items HTML
    status_items_html = ""
    for item in status_items:
        icon_class = "pass" if item.get("passed", True) else "fail"
        icon = "✓" if item.get("passed", True) else "✗"
        status_items_html += f'''
            <div class="check-item">
                <span class="check-icon {icon_class}">{icon}</span>
                <span>{item["text"]}</span>
            </div>'''

    # Generate metadata grid HTML
    metadata_html = ""
    for key, value in metadata.items():
        metadata_html += f'''
                <div class="meta-item">
                    <div class="meta-label">{key}</div>
                    <div class="meta-value">{value}</div>
                </div>'''

    # Generate input params HTML
    input_html = ""
    for key, value in input_params.items():
        display_value = str(value)
        if len(display_value) > 200:
            display_value = display_value[:200] + "..."
        input_html += f'<div><strong>{key}:</strong> {display_value}</div>'

    # Generate output HTML
    output_html = ""
    if output_data:
        for key, value in output_data.items():
            display_value = str(value)
            if len(display_value) > 300:
                display_value = display_value[:300] + "..."
            output_html += f'<div><strong>{key}:</strong> {display_value}</div>'

    # Preview section
    preview_section = ""
    if preview_image:
        preview_section = f'''
        <div class="image-showcase">
            <img src="{preview_image}" alt="Generated Result" class="generated-image">
            {f'<a href="{download["url"]}" download="{download.get("filename", "download")}" class="download-btn">Download ({download.get("size_display", "")})</a>' if download else ''}
        </div>'''

    # Timing section
    timing_html = ""
    if timing:
        started = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timing.get("started", time.time())))
        duration = timing.get("duration_seconds", 0)
        timing_html = f'''
        <div class="timing-info">
            <span>Started: {started}</span>
            <span>Duration: {duration:.1f}s</span>
        </div>'''

    # HAL message
    hal_section = ""
    if hal_message:
        hal_section = f'''
        <div class="hal-message">
            {hal_message}
        </div>'''

    # Generate full HTML
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            background: linear-gradient(135deg, #0a0a1a 0%, #1a0a2a 50%, #0a1a2a 100%);
            min-height: 100vh;
            font-family: 'Courier New', monospace;
            color: #00ffff;
            padding: 40px;
        }}
        .container {{ max-width: 1100px; margin: 0 auto; }}
        h1 {{
            text-align: center;
            font-size: 2.2rem;
            margin-bottom: 10px;
            text-shadow: 0 0 30px #00ffff, 0 0 60px #ff00ff;
            letter-spacing: 6px;
        }}
        .subtitle {{
            text-align: center;
            color: {colors[0]};
            margin-bottom: 30px;
            font-size: 1rem;
        }}
        .hal-eye {{
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            background: radial-gradient(circle, {colors[0]} 0%, {colors[1]} 40%, {colors[2]} 70%, #000 100%);
            border-radius: 50%;
            box-shadow: 0 0 40px {colors[0]}, 0 0 80px {colors[0]}80;
            animation: pulse 3s ease-in-out infinite;
        }}
        @keyframes pulse {{
            0%, 100% {{ box-shadow: 0 0 40px {colors[0]}, 0 0 80px {colors[0]}80; }}
            50% {{ box-shadow: 0 0 60px {colors[0]}, 0 0 120px {colors[0]}80; }}
        }}
        .image-showcase {{
            background: rgba(0, 20, 40, 0.8);
            border: 2px solid #00ffff60;
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 25px;
            text-align: center;
        }}
        .generated-image {{
            max-width: 100%;
            width: 700px;
            border-radius: 10px;
            box-shadow: 0 0 40px #00ffff40, 0 0 80px #ff00ff30;
            margin-bottom: 20px;
        }}
        .status-panel {{
            background: rgba(0, 20, 40, 0.8);
            border: 1px solid #00ffff40;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 20px;
        }}
        .status-header {{
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 15px;
            padding-bottom: 12px;
            border-bottom: 1px solid #00ffff30;
        }}
        .status-indicator {{
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: {colors[0]};
            box-shadow: 0 0 10px {colors[0]};
        }}
        .status-title {{ font-size: 1.1rem; }}
        .check-item {{
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid #00ffff15;
        }}
        .check-icon {{ font-size: 1.1rem; }}
        .check-icon.pass {{ color: #00ff00; }}
        .check-icon.fail {{ color: #ff4444; }}
        .meta-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }}
        .meta-item {{
            background: rgba(0, 30, 50, 0.6);
            padding: 12px;
            border-radius: 6px;
            text-align: center;
        }}
        .meta-label {{
            color: #888;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
        }}
        .meta-value {{ color: #00ffff; font-size: 0.95rem; }}
        .prompt-box {{
            background: rgba(0, 40, 60, 0.5);
            border: 1px solid #ff00ff40;
            border-radius: 8px;
            padding: 20px;
            margin-top: 15px;
        }}
        .prompt-label {{
            color: #ff00ff;
            font-size: 0.75rem;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 2px;
        }}
        .prompt-text {{
            color: #cccccc;
            line-height: 1.5;
            font-size: 0.9rem;
        }}
        .hal-message {{
            text-align: center;
            padding: 25px;
            color: #00ff88;
            font-size: 1.05rem;
            line-height: 1.8;
        }}
        .download-btn {{
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #00ffff40, #ff00ff40);
            border: 1px solid #00ffff;
            color: #00ffff;
            font-family: inherit;
            font-size: 0.9rem;
            cursor: pointer;
            border-radius: 5px;
            text-decoration: none;
            transition: all 0.3s;
            margin-top: 15px;
        }}
        .download-btn:hover {{
            background: linear-gradient(135deg, #00ffff60, #ff00ff60);
            box-shadow: 0 0 20px #00ffff40;
        }}
        .timing-info {{
            display: flex;
            justify-content: space-between;
            padding: 15px;
            background: rgba(0, 20, 40, 0.5);
            border-radius: 6px;
            margin-top: 15px;
            font-size: 0.85rem;
            color: #888;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="hal-eye"></div>
        <h1>{title.upper()}</h1>
        <p class="subtitle">{subtitle}</p>

        {preview_section}

        <div class="status-panel">
            <div class="status-header">
                <div class="status-indicator"></div>
                <span class="status-title">Status: {status.title()}</span>
            </div>
            {status_items_html}

            <div class="meta-grid">
                {metadata_html}
            </div>

            <div class="prompt-box">
                <div class="prompt-label">Input Parameters</div>
                <div class="prompt-text">{input_html}</div>
            </div>

            {f'<div class="prompt-box" style="border-color: #00ffff40;"><div class="prompt-label" style="color: #00ffff;">Output</div><div class="prompt-text">{output_html}</div></div>' if output_html else ''}

            {timing_html}
        </div>

        {hal_section}
    </div>
</body>
</html>'''

    # Write the dashboard file
    filepath.write_text(html)

    # Return the URL path
    return f"http://127.0.0.1:8800/dashboards/{filename}"
