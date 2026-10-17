"""Integration tests for the resumable Hunyuan checkpoint downloader."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SCRIPT = Path(__file__).with_name("hunyuan_guard_range.py")
PAYLOAD = bytes((index * 17) % 251 for index in range(150_123))


class RangeHandler(BaseHTTPRequestHandler):
    malformed = False

    def do_GET(self) -> None:  # noqa: N802 - stdlib API name
        requested = self.headers.get("Range", "")
        unit, values = requested.split("=", 1)
        start_text, end_text = values.split("-", 1)
        start, end = int(start_text), int(end_text)
        body = PAYLOAD[start : end + 1]
        self.send_response(206)
        self.send_header("Content-Length", str(len(body)))
        if self.malformed:
            self.send_header("Content-Range", f"{unit} 0-{len(body) - 1}/{len(PAYLOAD)}")
        else:
            self.send_header("Content-Range", f"{unit} {start}-{end}/{len(PAYLOAD)}")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        return


class RangeDownloaderTests(unittest.TestCase):
    def start_server(self, malformed: bool = False) -> tuple[ThreadingHTTPServer, str]:
        handler = type("ConfiguredRangeHandler", (RangeHandler,), {"malformed": malformed})
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, f"http://127.0.0.1:{server.server_port}/model.ckpt"

    def run_download(self, root: Path, url: str) -> subprocess.CompletedProcess[str]:
        digest = hashlib.sha256(PAYLOAD).hexdigest()
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--url",
                url,
                "--output",
                str(root / "model.ckpt"),
                "--expected-sha256",
                digest,
                "--expected-bytes",
                str(len(PAYLOAD)),
                "--chunk-bytes",
                "32768",
                "--max-workers",
                "2",
                "--timeout",
                "5",
                "--retries",
                "1",
                "--report",
                str(root / "report.json"),
            ],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_downloads_valid_ranges_and_reuses_completed_parts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            server, url = self.start_server()
            try:
                first = self.run_download(root, url)
                self.assertEqual(first.returncode, 0, first.stderr)
                self.assertEqual((root / "model.ckpt").read_bytes(), PAYLOAD)

                (root / "model.ckpt").unlink()
                second = self.run_download(root, url)
                self.assertEqual(second.returncode, 0, second.stderr)
                report = json.loads((root / "report.json").read_text("utf-8"))
                self.assertEqual(report["status"], "verified")
                self.assertEqual(report["bytes_received_this_run"], 0)
                self.assertEqual(report["bytes_reused"], len(PAYLOAD))
                self.assertEqual(report["final_hosts"], ["127.0.0.1"])
                self.assertNotIn("url", json.dumps(report).lower())
            finally:
                server.shutdown()
                server.server_close()

    def test_rejects_wrong_content_range_without_publishing_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            server, url = self.start_server(malformed=True)
            try:
                result = self.run_download(root, url)
                self.assertEqual(result.returncode, 4, result.stderr)
                self.assertFalse((root / "model.ckpt").exists())
                report = json.loads((root / "report.json").read_text("utf-8"))
                self.assertEqual(report["status"], "download_failed")
                self.assertEqual(report["error_type"], "RangeValidationError")
                self.assertNotIn("?", json.dumps(report))
            finally:
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
