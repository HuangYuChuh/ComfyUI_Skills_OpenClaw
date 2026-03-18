from __future__ import annotations

import json
import logging
import shutil
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

FRONTEND_REPO = "HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend"
GITHUB_API_URL = f"https://api.github.com/repos/{FRONTEND_REPO}/releases/tags/latest"
FRONTEND_ARCHIVE_NAME = "frontend-dist.tar.gz"
VERSION_ASSET_NAME = "version.json"
CACHE_TTL = 600  # 10 minutes

_cache: dict[str, object] = {}


class FrontendReleaseUpdateProvider:
    """Update prebuilt frontend assets from the rolling GitHub release."""

    def __init__(self, static_dir: Path) -> None:
        self._static_dir = static_dir

    def check(self) -> dict:
        return check_frontend_update(self._static_dir)

    def update(self) -> dict:
        return perform_frontend_update(self._static_dir)


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


def perform_frontend_update(static_dir: Path) -> dict:
    """Download the latest frontend build and replace ui/static atomically."""
    local = _read_local_version(static_dir) or {}
    release = _fetch_release()
    if not release:
        return {"success": False, "message": "Failed to fetch latest frontend release"}

    asset = next(
        (item for item in release.get("assets", []) if item.get("name") == FRONTEND_ARCHIVE_NAME),
        None,
    )
    if not asset:
        return {"success": False, "message": f"{FRONTEND_ARCHIVE_NAME} not found in latest release"}

    download_url = asset.get("browser_download_url")
    if not download_url:
        return {"success": False, "message": f"{FRONTEND_ARCHIVE_NAME} has no download URL"}

    parent_dir = static_dir.parent
    parent_dir.mkdir(parents=True, exist_ok=True)
    backup_dir = parent_dir / f"{static_dir.name}.bak"
    swap_dir = parent_dir / f"{static_dir.name}.next"

    try:
        with tempfile.TemporaryDirectory(prefix="openclaw-frontend-") as tmpdir:
            tmp_path = Path(tmpdir)
            archive_path = tmp_path / FRONTEND_ARCHIVE_NAME
            extract_dir = tmp_path / "static"

            _download_to_path(download_url, archive_path)
            extract_dir.mkdir()
            _extract_archive(archive_path, extract_dir)
            _validate_static_dir(extract_dir)
            _swap_static_dir(extract_dir, static_dir, swap_dir, backup_dir)
    except (OSError, tarfile.TarError, ValueError, urllib.error.URLError) as exc:
        logger.error("Failed to update frontend assets: %s", exc)
        return {"success": False, "message": str(exc)}

    updated = _read_local_version(static_dir) or {}
    return {
        "success": True,
        "component": "frontend",
        "commit_before": str(local.get("commit", ""))[:8],
        "commit_after": str(updated.get("commit", ""))[:8],
        "message": "Frontend assets updated",
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
    release = _fetch_release()
    if not release:
        return None

    now = time.monotonic()

    # Try to find version.json in release assets
    assets = release.get("assets", [])
    version_asset = next(
        (item for item in assets if item.get("name") == VERSION_ASSET_NAME),
        None,
    )

    if version_asset:
        try:
            download_url = version_asset["browser_download_url"]
            result = _download_json(download_url)
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


def _fetch_release() -> dict | None:
    now = time.monotonic()
    cached = _cache.get("release")
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

    _cache["release"] = release
    _cache["cached_at"] = now
    return release


def _download_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _download_to_path(url: str, path: Path) -> None:
    req = urllib.request.Request(url, headers={"Accept": "application/octet-stream"})
    with urllib.request.urlopen(req, timeout=60) as resp, path.open("wb") as out:
        shutil.copyfileobj(resp, out)


def _extract_archive(archive_path: Path, extract_dir: Path) -> None:
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            target_path = (extract_dir / member.name).resolve()
            if not str(target_path).startswith(str(extract_dir.resolve())):
                raise ValueError(f"Unsafe archive entry: {member.name}")
        archive.extractall(extract_dir)


def _validate_static_dir(static_dir: Path) -> None:
    index_file = static_dir / "index.html"
    if not index_file.is_file():
        raise ValueError("Downloaded frontend bundle is missing index.html")


def _swap_static_dir(source_dir: Path, target_dir: Path, swap_dir: Path, backup_dir: Path) -> None:
    shutil.rmtree(swap_dir, ignore_errors=True)
    shutil.rmtree(backup_dir, ignore_errors=True)
    shutil.copytree(source_dir, swap_dir, dirs_exist_ok=True)

    try:
        if target_dir.exists():
            target_dir.rename(backup_dir)
        swap_dir.rename(target_dir)
        shutil.rmtree(backup_dir, ignore_errors=True)
    except OSError:
        if backup_dir.exists() and not target_dir.exists():
            backup_dir.rename(target_dir)
        raise
