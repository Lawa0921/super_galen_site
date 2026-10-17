"""Resumable, hash-pinned HTTP Range downloader for one Hunyuan checkpoint.

The report records hostnames and byte counts only. Redirect URLs and query strings
are never printed or persisted.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests


class RangeValidationError(RuntimeError):
    """A server response did not match the requested byte range."""


class DownloadError(RuntimeError):
    """A range could not be downloaded within the bounded retry policy."""


@dataclass(frozen=True)
class Chunk:
    index: int
    start: int
    end: int

    @property
    def size(self) -> int:
        return self.end - self.start + 1


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def chunks_for(total: int, chunk_bytes: int) -> list[Chunk]:
    return [
        Chunk(index, start, min(start + chunk_bytes, total) - 1)
        for index, start in enumerate(range(0, total, chunk_bytes))
    ]


def part_path(parts_dir: Path, chunk: Chunk) -> Path:
    return parts_dir / f"{chunk.index:06d}-{chunk.start}-{chunk.end}.part"


def download_chunk(
    url: str,
    parts_dir: Path,
    chunk: Chunk,
    total: int,
    timeout: float,
    retries: int,
) -> dict[str, Any]:
    destination = part_path(parts_dir, chunk)
    if destination.is_file() and destination.stat().st_size == chunk.size:
        return {"bytes_received": 0, "bytes_reused": chunk.size, "host": None, "attempts": 0}

    expected_range = f"bytes {chunk.start}-{chunk.end}/{total}"
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        temporary = destination.with_suffix(destination.suffix + ".download")
        try:
            with requests.get(
                url,
                headers={"Range": f"bytes={chunk.start}-{chunk.end}"},
                timeout=(min(15.0, timeout), timeout),
                stream=True,
                allow_redirects=True,
            ) as response:
                if response.status_code != 206:
                    raise RangeValidationError(f"unexpected HTTP status {response.status_code}")
                if response.headers.get("Content-Range") != expected_range:
                    raise RangeValidationError("Content-Range did not match requested bytes")
                declared = response.headers.get("Content-Length")
                if declared is not None and int(declared) != chunk.size:
                    raise RangeValidationError("Content-Length did not match requested bytes")

                received = 0
                with temporary.open("wb") as handle:
                    for block in response.iter_content(1024 * 1024):
                        if block:
                            handle.write(block)
                            received += len(block)
                if received != chunk.size:
                    raise RangeValidationError("response body length did not match requested bytes")
                os.replace(temporary, destination)
                return {
                    "bytes_received": received,
                    "bytes_reused": 0,
                    "host": urlparse(response.url).hostname,
                    "attempts": attempt + 1,
                }
        except (requests.RequestException, OSError, ValueError, RangeValidationError) as error:
            last_error = error
            if temporary.exists():
                temporary.unlink()

    if isinstance(last_error, RangeValidationError):
        raise last_error
    raise DownloadError(type(last_error).__name__ if last_error else "unknown download failure")


def write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def assemble(parts_dir: Path, output: Path, chunks: list[Chunk]) -> None:
    temporary = output.with_suffix(output.suffix + ".assembling")
    output.parent.mkdir(parents=True, exist_ok=True)
    with temporary.open("wb") as combined:
        for chunk in chunks:
            with part_path(parts_dir, chunk).open("rb") as source:
                for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
                    combined.write(block)
    os.replace(temporary, output)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--expected-bytes", type=int, required=True)
    parser.add_argument("--chunk-bytes", type=int, default=32 * 1024 * 1024)
    parser.add_argument("--max-workers", type=int, default=4)
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.expected_bytes <= 0 or args.chunk_bytes <= 0:
        raise SystemExit("expected bytes and chunk bytes must be positive")
    if not 1 <= args.max_workers <= 4:
        raise SystemExit("max workers must be between 1 and 4")
    if not 0 <= args.retries <= 1:
        raise SystemExit("retries must be zero or one")

    parts_dir = args.output.parent / f"{args.output.name}.parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    chunks = chunks_for(args.expected_bytes, args.chunk_bytes)
    requested_host = urlparse(args.url).hostname
    report: dict[str, Any] = {
        "status": "downloading",
        "requested_host": requested_host,
        "final_hosts": [requested_host] if requested_host else [],
        "expected_bytes": args.expected_bytes,
        "expected_sha256": args.expected_sha256,
        "chunk_bytes": args.chunk_bytes,
        "chunk_count": len(chunks),
        "max_workers": args.max_workers,
        "timeout_seconds": args.timeout,
        "retries_per_chunk": args.retries,
        "bytes_received_this_run": 0,
        "bytes_reused": 0,
    }

    try:
        with ThreadPoolExecutor(max_workers=args.max_workers) as executor:
            futures = {
                executor.submit(
                    download_chunk,
                    args.url,
                    parts_dir,
                    chunk,
                    args.expected_bytes,
                    args.timeout,
                    args.retries,
                ): chunk
                for chunk in chunks
            }
            for future in as_completed(futures):
                result = future.result()
                report["bytes_received_this_run"] += result["bytes_received"]
                report["bytes_reused"] += result["bytes_reused"]
                if result["host"]:
                    report["final_hosts"].append(result["host"])

        report["final_hosts"] = sorted(set(report["final_hosts"]))
        assemble(parts_dir, args.output, chunks)
        actual_sha256 = sha256(args.output)
        if args.output.stat().st_size != args.expected_bytes:
            raise RangeValidationError("assembled size did not match expected bytes")
        if actual_sha256 != args.expected_sha256:
            raise RangeValidationError("assembled SHA-256 did not match expected digest")
        report.update(status="verified", actual_sha256=actual_sha256)
        write_report(args.report, report)
        print(json.dumps({"status": "verified", "bytes": args.expected_bytes}))
        return 0
    except Exception as error:
        report.update(status="download_failed", error_type=type(error).__name__)
        report["final_hosts"] = sorted(set(report["final_hosts"]))
        write_report(args.report, report)
        print(json.dumps({"status": "download_failed", "error_type": type(error).__name__}))
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
