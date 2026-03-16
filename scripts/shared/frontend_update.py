from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

FRONTEND_REPO = "HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend"
GITHUB_API_URL = f"https://api.github.com/repos/{FRONTEND_REPO}/releases/tags/latest"
CACHE_TTL = 600  # 10 minutes

_cache: dict[str, object] = {}


def check_frontend_update(static_dir: Path) -> dict:
    """Compare local frontend version against the latest rolling release."""
    local = _read_local_version(static_dir)
    if not local:
        return {"has_update": False, "error": "no_local_version"}

    remote = _fetch_remote_version()
    if not remote:
        return {"has_update": False, "error": "fetch_failed"}

    local_commit = local.get("commit", "")
    remote_commit = remote.get("commit", "")

    if not local_commit or not remote_commit:
        return {"has_update": False, "error": "missing_commit"}

    has_update = local_commit != remote_commit
    return {
        "has_update": has_update,
        "local_commit": local_commit[:8],
        "remote_commit": remote_commit[:8],
        "remote_date": remote.get("date", ""),
    }


def _read_local_version(static_dir: Path) -> dict | None:
    version_file = static_dir / "version.json"
    if not version_file.is_file():
        return None
    try:
        return json.loads(version_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _fetch_remote_version() -> dict | None:
    now = time.monotonic()
    cached = _cache.get("remote_version")
    cached_at = _cache.get("cached_at", 0.0)
    if cached and isinstance(cached_at, float) and now - cached_at < CACHE_TTL:
        return cached  # type: ignore[return-value]

    try:
        req = urllib.request.Request(
            GITHUB_API_URL,
            headers={"Accept": "application/vnd.github+json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            release = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
        logger.debug("Failed to fetch latest release: %s", exc)
        return None

    # Try to find version.json in release assets
    assets = release.get("assets", [])
    version_asset = next(
        (a for a in assets if a.get("name") == "version.json"),
        None,
    )

    if version_asset:
        try:
            download_url = version_asset["browser_download_url"]
            req = urllib.request.Request(download_url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                _cache["remote_version"] = result
                _cache["cached_at"] = now
                return result
        except (urllib.error.URLError, OSError, json.JSONDecodeError, KeyError) as exc:
            logger.debug("Failed to download version.json asset: %s", exc)

    # Fallback: parse commit from release body
    body = release.get("body", "")
    for line in body.splitlines():
        if "Commit:" in line:
            commit = line.split("`")[-2] if "`" in line else line.split(":")[-1].strip()
            result = {"commit": commit, "date": release.get("published_at", "")}
            _cache["remote_version"] = result
            _cache["cached_at"] = now
            return result

    return None
