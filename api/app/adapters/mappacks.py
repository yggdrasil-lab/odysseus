"""PMTiles CLI adapter for extracting bounded offline regional map packs."""

import os
from pathlib import Path
import subprocess
from typing import Protocol
import uuid

from app.domain.errors import DomainUpstreamError
from app.domain.places import validate_https_url


class MapPackBuilderAdapter(Protocol):
    """Port for extracting bounded .pmtiles archives from a Protomaps source URL."""

    def extract(
        self,
        source_url: str,
        output_path: Path,
        bbox: tuple[float, float, float, float],
        max_zoom: int,
    ) -> None:
        """Extract a bounded .pmtiles archive to output_path."""


class PmtilesCliAdapter:
    """Subprocess adapter invoking the bundled go-pmtiles CLI binary."""

    def __init__(self, pmtiles_bin: str = "pmtiles", timeout_seconds: int = 180) -> None:
        self.pmtiles_bin = pmtiles_bin
        self.timeout_seconds = timeout_seconds

    def extract(
        self,
        source_url: str,
        output_path: Path,
        bbox: tuple[float, float, float, float],
        max_zoom: int,
    ) -> None:
        """Invoke `pmtiles extract` into a temp file and atomically replace output_path."""
        validated_url = validate_https_url(source_url)
        west, south, east, north = bbox
        output_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = output_path.parent / f".{output_path.stem}-{uuid.uuid4().hex}.tmp.pmtiles"
        cmd = [
            self.pmtiles_bin,
            "extract",
            validated_url,
            str(tmp_path),
            f"--bbox={west},{south},{east},{north}",
            f"--maxzoom={max_zoom}",
        ]
        try:
            self._run_extract(cmd, tmp_path)
            os.replace(tmp_path, output_path)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

    def _run_extract(self, cmd: list[str], tmp_path: Path) -> None:
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise DomainUpstreamError(
                f"pmtiles CLI binary not found: {self.pmtiles_bin}"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise DomainUpstreamError(
                f"pmtiles extract timed out after {self.timeout_seconds}s"
            ) from exc

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "unknown error").strip()
            raise DomainUpstreamError(
                f"pmtiles extract failed (exit {result.returncode}): {detail}"
            )
        if not tmp_path.is_file() or tmp_path.stat().st_size <= 0:
            raise DomainUpstreamError("pmtiles extract produced an empty archive.")
