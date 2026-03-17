from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]


class UpdateProvider:
    """Base interface for update providers."""

    def check(self) -> dict:
        raise NotImplementedError

    def update(self) -> dict:
        raise NotImplementedError


class GitUpdateProvider(UpdateProvider):
    """Update via git pull. Requires the project to be installed via git clone."""

    def __init__(self, repo_root: Path = REPO_ROOT) -> None:
        self._root = repo_root

    def _run(self, args: list[str], timeout: int = 15) -> subprocess.CompletedProcess:
        return subprocess.run(
            args,
            cwd=self._root,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

    def _local_commit(self) -> str | None:
        try:
            r = self._run(["git", "rev-parse", "HEAD"])
            return r.stdout.strip() if r.returncode == 0 else None
        except (OSError, subprocess.TimeoutExpired):
            return None

    def _remote_commit(self) -> str | None:
        try:
            r = self._run(["git", "ls-remote", "origin", "HEAD"])
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.split()[0]
            return None
        except (OSError, subprocess.TimeoutExpired):
            return None

    def check(self) -> dict:
        local = self._local_commit()
        if not local:
            return {"has_update": False, "error": "not_git_repo"}

        remote = self._remote_commit()
        if not remote:
            return {"has_update": False, "error": "fetch_failed"}

        has_update = local != remote
        return {
            "has_update": has_update,
            "local_commit": local[:8],
            "remote_commit": remote[:8],
        }

    def update(self) -> dict:
        commit_before = self._local_commit()
        try:
            r = self._run(["git", "fetch", "origin", "main:main"], timeout=60)
            if r.returncode != 0:
                msg = r.stderr.strip() or r.stdout.strip()
                logger.error("git pull failed: %s", msg)
                return {"success": False, "message": msg}

            commit_after = self._local_commit()
            return {
                "success": True,
                "commit_before": (commit_before or "")[:8],
                "commit_after": (commit_after or "")[:8],
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "message": "git pull timed out"}
        except OSError as e:
            return {"success": False, "message": str(e)}


_provider = GitUpdateProvider()


def check_update() -> dict:
    return _provider.check()


def perform_update() -> dict:
    return _provider.update()


def restart_server() -> None:
    """Replace the current process with a fresh instance."""
    logger.info("Restarting server...")
    os.execv(sys.executable, [sys.executable] + sys.argv)
