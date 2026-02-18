"""HTTP server with caching for the relay system."""

import json
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs

from .config import (
    TEMPLATES_DIR, SCREENSHOTS_DIR, API_CACHE_HEADERS, DEFAULT_PORT, HTML_CACHE_ENABLED
)
from .utils import compute_etag
from .api_handlers import APIHandler


# Pre-computed HTML cache
_HTML_CACHE = {
    "bytes": None,
    "etag": None
}


def load_html_template() -> str:
    """Load and assemble the HTML template with CSS and JS."""
    html_path = TEMPLATES_DIR / "index.html"
    css_path = TEMPLATES_DIR / "styles.css"
    js_path = TEMPLATES_DIR / "app.js"

    html = html_path.read_text()
    css = css_path.read_text() if css_path.exists() else ""
    js = js_path.read_text() if js_path.exists() else ""

    # Replace placeholders
    html = html.replace("{{CSS_PLACEHOLDER}}", css)
    html = html.replace("{{JS_PLACEHOLDER}}", js)

    return html


def init_html_cache():
    """Initialize the HTML cache with pre-encoded content and ETag."""
    global _HTML_CACHE
    html = load_html_template()
    _HTML_CACHE["bytes"] = html.encode('utf-8')
    _HTML_CACHE["etag"] = compute_etag(_HTML_CACHE["bytes"])


def get_cached_html():
    """Get cached HTML bytes and ETag.

    When HTML_CACHE_ENABLED is False, always reload from disk for fresh content.
    """
    if not HTML_CACHE_ENABLED or _HTML_CACHE["bytes"] is None:
        init_html_cache()
    return _HTML_CACHE["bytes"], _HTML_CACHE["etag"]


class ChatRelayHandler(SimpleHTTPRequestHandler):
    """HTTP request handler with caching and API routing."""

    def log_message(self, format, *args):
        pass  # Quiet logging

    def _json(self, data, status=200):
        """Send JSON response with appropriate headers."""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")

        # Add cache header if applicable
        cache_header = API_CACHE_HEADERS.get(self.path, "no-cache")
        self.send_header("Cache-Control", cache_header)

        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_error_json(self, status):
        """Send error as JSON."""
        self._json({"error": f"HTTP {status}"}, status)

    def _send_binary(self, data, content_type="application/octet-stream"):
        """Send binary response (e.g., audio data)."""
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        """Handle GET requests."""
        if self.path == "/" or self.path == "":
            self._serve_html_cached()
        elif self.path == "/favicon.svg" or self.path == "/favicon.ico":
            self._serve_favicon()
        elif self.path.startswith("/api/projects"):
            api = APIHandler(self._json, self._send_error_json)
            api.handle_projects()
        elif self.path == "/api/health":
            api = APIHandler(self._json, self._send_error_json)
            api.handle_health()
        elif self.path == "/api/queue/status" or self.path.startswith("/api/queue/status?"):
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            project_filter = params.get("project", [""])[0]
            api = APIHandler(self._json, self._send_error_json)
            api.handle_queue_status(project=project_filter)
        elif self.path == "/api/jobs/history" or self.path.startswith("/api/jobs/history?"):
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            project_filter = params.get("project", [""])[0]
            status_filter = params.get("status", [""])[0]
            api = APIHandler(self._json, self._send_error_json)
            api.handle_jobs_history(project=project_filter, status=status_filter)
        elif self.path.startswith("/api/history/"):
            project = self.path.split("/api/history/")[1]
            api = APIHandler(self._json, self._send_error_json)
            api.handle_history_get(project)
        elif self.path.startswith("/api/active/"):
            project = self.path.split("/api/active/")[1]
            api = APIHandler(self._json, self._send_error_json)
            api.handle_active_job(project)
        elif self.path.startswith("/screenshots/"):
            self._serve_screenshot()
        elif self.path.startswith("/mockups/"):
            self._serve_mockup()
        elif self.path == "/api/screenshots":
            api = APIHandler(self._json, self._send_error_json)
            api.handle_screenshots_list()
        elif self.path == "/api/tts/voices":
            api = APIHandler(self._json, self._send_error_json)
            api.handle_tts_voices()
        elif self.path == "/api/elevenlabs/voices":
            api = APIHandler(self._json, self._send_error_json)
            api.handle_elevenlabs_voices()
        elif self.path.startswith("/api/sse/status/"):
            self._handle_sse_status()
        elif self.path == "/api/mcp/config":
            api = APIHandler(self._json, self._send_error_json)
            api.handle_mcp_config_get({})
        elif self.path == "/api/mcp/servers":
            api = APIHandler(self._json, self._send_error_json)
            api.handle_mcp_servers_list({})
        else:
            self.send_error(404)

    def do_POST(self):
        """Handle POST requests."""
        content_type = self.headers.get("Content-Type", "")

        # Handle multipart/form-data for file uploads (videos, PDFs)
        if self.path == "/api/upload/video" and "multipart/form-data" in content_type:
            self._handle_video_upload()
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode('utf-8', errors='replace') if length > 0 else "{}"
            data = json.loads(body) if body else {}
        except json.JSONDecodeError as e:
            self._json({"error": f"Invalid JSON: {e}"}, 400)
            return
        except Exception as e:
            self._json({"error": f"Request error: {e}"}, 400)
            return

        api = APIHandler(self._json, self._send_error_json)

        # Route to appropriate handler
        routes = {
            "/api/chat/start": lambda: api.handle_chat_start(data),
            "/api/chat/status": lambda: api.handle_chat_status(data),
            "/api/chat/answers": lambda: api.handle_chat_answers(data),
            "/api/chat/cancel": lambda: api.handle_chat_cancel(data),
            "/api/format/start": lambda: api.handle_format_start(data),
            "/api/format/status": lambda: api.handle_format_status(data),
            "/api/task/save": lambda: api.handle_task_save(data),
            "/api/task/load": lambda: api.handle_task_load(data),
            "/api/file/read": lambda: api.handle_file_read(data),
            "/api/file/list": lambda: api.handle_file_list(data),
            "/api/file/write": lambda: api.handle_file_write(data),
            "/api/file/explain": lambda: api.handle_file_explain(data),
            "/api/file/qa": lambda: api.handle_file_qa(data),
            "/api/file/modify": lambda: api.handle_file_modify(data),
            "/api/axion/messages": lambda: api.handle_axion_messages(data),
            "/api/axion/send": lambda: api.handle_axion_send(data),
            "/api/git/status": lambda: api.handle_git_status(data),
            "/api/git/commit": lambda: api.handle_git_commit(data),
            "/api/git/pull": lambda: api.handle_git_pull(data),
            "/api/git/log": lambda: api.handle_git_log(data),
            "/api/git/commit-files": lambda: api.handle_git_commit_files(data),
            "/api/git/remote": lambda: api.handle_git_remote_info(data),
            "/api/git/branches": lambda: api.handle_git_branches(data),
            "/api/git/checkout": lambda: api.handle_git_checkout(data),
            "/api/git/create-branch": lambda: api.handle_git_create_branch(data),
            "/api/git/delete-branch": lambda: api.handle_git_delete_branch(data),
            "/api/git/push-branch": lambda: api.handle_git_push_branch(data),
            "/api/git/fetch": lambda: api.handle_git_fetch(data),
            "/api/git/merge": lambda: api.handle_git_merge(data),
            "/api/git/stash": lambda: api.handle_git_stash(data),
            "/api/git/revert": lambda: api.handle_git_revert(data),
            "/api/git/conflicts": lambda: api.handle_git_conflicts(data),
            "/api/git/resolve-conflict": lambda: api.handle_git_resolve_conflict(data),
            "/api/git/ai-resolve": lambda: api.handle_git_ai_resolve(data),
            "/api/git/complete-merge": lambda: api.handle_git_complete_merge(data),
            "/api/service/check": lambda: api.handle_service_check(data),
            "/api/history/save": lambda: api.handle_history_save(data),
            "/api/history/delete": lambda: api.handle_history_delete(data),
            "/api/history/clear": lambda: api.handle_history_clear(data),
            "/api/queue/status": api.handle_queue_status,
            "/api/system/reset": lambda: api.handle_system_reset(data),
            "/api/quick-chat": lambda: api.handle_quick_chat(data),
            "/api/tts": lambda: api.handle_tts(data, self._send_binary),
            "/api/tts/piper": lambda: api.handle_piper_tts(data, self._send_binary),
            "/api/elevenlabs/tts": lambda: api.handle_elevenlabs_tts(data, self._send_binary),
            "/api/ocr": lambda: api.handle_ocr(data),
            "/api/pdf/generate": lambda: api.handle_pdf_generate(data, self._send_binary),
            "/api/video/analyze": lambda: api.handle_video_analyze(data),
            "/api/video/transcribe": lambda: api.handle_video_transcribe(data),
            "/api/video/youtube": lambda: api.handle_youtube_download(data),
            "/api/image/generate": lambda: api.handle_dalle_generate(data),
            "/api/sqlite/query": lambda: api.handle_sqlite_query(data),
            "/api/sqlite/tables": lambda: api.handle_sqlite_tables(data),
            "/api/whisper/transcribe": lambda: api.handle_whisper_transcribe(data),
            "/api/mcp/config": lambda: api.handle_mcp_config_set(data),
            "/api/mcp/servers": lambda: api.handle_mcp_servers_list(data),
            "/api/context/save": lambda: api.handle_context_save(data),
            "/api/context/clear": lambda: api.handle_context_clear(data),
            "/api/skills": lambda: api.handle_skills_list(data),
            "/api/skills/info": lambda: api.handle_skill_info(data),
            "/api/project/create": lambda: api.handle_project_create(data),
            "/api/project/delete": lambda: api.handle_project_delete(data),
        }

        handler = routes.get(self.path)
        if handler:
            handler()
        else:
            self.send_error(404)

    def do_DELETE(self):
        """Handle DELETE requests."""
        api = APIHandler(self._json, self._send_error_json)

        if self.path.startswith("/api/screenshots/"):
            filename = unquote(self.path.split("/api/screenshots/")[1])
            api.handle_screenshot_delete(filename)
        else:
            self.send_error(404)

    def _handle_video_upload(self):
        """Handle multipart/form-data video upload."""
        import uuid as _uuid
        import time as _time
        import re as _re

        try:
            content_type = self.headers.get("Content-Type", "")
            content_length = int(self.headers.get("Content-Length", 0))

            # Extract boundary from Content-Type header
            boundary_match = _re.search(r'boundary=(.+)', content_type)
            if not boundary_match:
                self._json({"error": "No multipart boundary found"}, 400)
                return

            boundary = boundary_match.group(1).strip()
            # Remove quotes if present
            if boundary.startswith('"') and boundary.endswith('"'):
                boundary = boundary[1:-1]

            # Read the full body
            body = self.rfile.read(content_length)

            # Parse multipart: split on boundary
            boundary_bytes = f"--{boundary}".encode()
            parts = body.split(boundary_bytes)

            video_data = None
            original_name = 'video.webm'

            for part in parts:
                # Skip empty parts and closing boundary
                if not part or part.strip() == b'--' or part.strip() == b'':
                    continue

                # Split headers from body (separated by \r\n\r\n)
                header_end = part.find(b'\r\n\r\n')
                if header_end == -1:
                    continue

                header_section = part[: header_end].decode('utf-8', errors='replace')
                file_body = part[header_end + 4 :]

                # Strip trailing \r\n
                if file_body.endswith(b'\r\n'):
                    file_body = file_body[:-2]

                # Check if this is the 'video' field
                if 'name="video"' not in header_section:
                    continue

                # Extract filename from Content-Disposition
                fname_match = _re.search(r'filename="([^"]*)"', header_section)
                if fname_match:
                    original_name = fname_match.group(1)

                video_data = file_body
                break

            if video_data is None or len(video_data) == 0:
                self._json({"error": "No video file provided"}, 400)
                return

            # Sanitize filename
            safe_name = "".join(c for c in original_name if c.isalnum() or c in '._- ')
            safe_name = safe_name.replace(' ', '_')

            # Generate unique filename
            unique_id = f"{int(_time.time())}_{_uuid.uuid4().hex[:6]}"
            ext = Path(safe_name).suffix or '.webm'
            filename = f"video_{unique_id}{ext}"

            # Save to screenshots directory
            save_path = Path("/opt/clawd/projects/relay/.screenshots") / filename
            with open(save_path, 'wb') as f:
                f.write(video_data)

            file_size = save_path.stat().st_size

            self._json({
                "success": True,
                "path": str(save_path),
                "filename": filename,
                "url": f"/screenshots/{filename}",
                "original_name": original_name,
                "size": file_size
            })

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._json({"error": f"Upload failed: {str(e)}"}, 500)

    def _handle_sse_status(self):
        """GET /api/sse/status/<job_id> - Stream job status via Server-Sent Events."""
        import time as _time
        job_id = self.path.split("/api/sse/status/")[1]
        if not job_id:
            self.send_error(400)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        queue_dir = Path("/opt/clawd/projects/relay/.queue")
        job_file = queue_dir / f"{job_id}.json"
        result_file = queue_dir / f"{job_id}.result"
        stream_file = queue_dir / f"{job_id}.stream"
        questions_file = queue_dir / f"{job_id}.questions"
        last_stream = ""
        last_activity = ""

        try:
            for _ in range(1800):  # Max 30 minutes (1800 x 1s)
                event_data = {"status": "pending"}

                if result_file.exists():
                    try:
                        result = result_file.read_text()
                        event_data = {"status": "complete", "result": result}
                        self.wfile.write(f"data: {json.dumps(event_data)}\n\n".encode())
                        self.wfile.flush()
                    except Exception:
                        pass
                    break

                if questions_file.exists():
                    try:
                        q_data = json.loads(questions_file.read_text())
                        event_data = {"status": "waiting_for_answers", "questions": q_data.get("questions", []),
                                      "response_so_far": q_data.get("response_so_far", "")}
                    except Exception:
                        pass

                elif job_file.exists():
                    try:
                        jd = json.loads(job_file.read_text())
                        event_data["status"] = jd.get("status", "pending")
                        if jd.get("activity"):
                            event_data["activity"] = jd["activity"]
                    except Exception:
                        pass

                    if stream_file.exists():
                        try:
                            current_stream = stream_file.read_text()
                            if current_stream != last_stream:
                                event_data["stream"] = current_stream
                                last_stream = current_stream
                        except Exception:
                            pass

                self.wfile.write(f"data: {json.dumps(event_data)}\n\n".encode())
                self.wfile.flush()
                _time.sleep(0.5)

        except (BrokenPipeError, ConnectionResetError, OSError):
            pass  # Client disconnected

    def _serve_html_cached(self):
        """Serve HTML page with ETag caching."""
        html_bytes, etag = get_cached_html()

        # Check If-None-Match header for cache validation
        if_none_match = self.headers.get("If-None-Match")
        if if_none_match and if_none_match == etag:
            self.send_response(304)  # Not Modified
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(html_bytes))
        self.send_header("ETag", etag)
        self.send_header("Cache-Control", "no-cache")  # Revalidate each time
        self.end_headers()
        self.wfile.write(html_bytes)

    def _serve_screenshot(self):
        """Serve screenshot files with caching.
        Searches multiple directories to find screenshots from different projects.
        """
        filename = unquote(self.path.split("/screenshots/")[1])

        # Security check
        if ".." in filename:
            self.send_error(403)
            return

        valid_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

        # Build list of directories to search for screenshots
        search_dirs = [
            SCREENSHOTS_DIR,  # Relay's own screenshots
        ]

        # Add all project screenshot directories
        projects_base = Path("/opt/clawd/projects")
        if projects_base.exists():
            for project_dir in projects_base.iterdir():
                if project_dir.is_dir():
                    # Check common screenshot locations
                    for subdir in [".screenshots", "screenshots", "tests/screenshots", "test/screenshots"]:
                        screenshot_dir = project_dir / subdir
                        if screenshot_dir.exists():
                            search_dirs.append(screenshot_dir)

        # Search for the file in all directories
        screenshot_path = None
        for search_dir in search_dirs:
            candidate = search_dir / filename
            if candidate.exists() and candidate.suffix.lower() in valid_extensions:
                screenshot_path = candidate
                break

        if screenshot_path:
            content_types = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            }
            content_type = content_types.get(screenshot_path.suffix.lower(), 'image/png')

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "max-age=86400")  # 24 hours
            self.end_headers()

            with open(screenshot_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404)

    def _serve_favicon(self):
        """Serve the favicon SVG file."""
        favicon_path = TEMPLATES_DIR / "favicon.svg"
        if favicon_path.exists():
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Cache-Control", "max-age=86400")  # 24 hours
            self.end_headers()
            with open(favicon_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404)

    def _serve_mockup(self):
        """Serve HTML mockup files from .temp/ for iframe preview."""
        filename = unquote(self.path.split("/mockups/")[1])

        # Security check
        if ".." in filename:
            self.send_error(403)
            return

        if not filename.endswith('.html'):
            self.send_error(403)
            return

        temp_dir = Path(__file__).parent.parent / ".temp"
        mockup_path = temp_dir / filename

        if mockup_path.exists():
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            with open(mockup_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404)


def run_server(port: int = DEFAULT_PORT):
    """Start the HTTP server."""
    # Initialize HTML cache
    init_html_cache()

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

    print(f"Chat Relay at http://0.0.0.0:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), ChatRelayHandler).serve_forever()


def main():
    """Entry point for the server."""
    parser = argparse.ArgumentParser(description="Chat Relay Server")
    parser.add_argument("-p", "--port", type=int, default=DEFAULT_PORT,
                        help=f"Port to run on (default: {DEFAULT_PORT})")
    args = parser.parse_args()

    run_server(args.port)


if __name__ == "__main__":
    main()
