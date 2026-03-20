from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

from shared.frontend_update import FrontendReleaseUpdateProvider

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = REPO_ROOT / "ui" / "static"


def _format_success_message(component: str, before: str | None, after: str | None) -> str:
    label = "System" if component == "system" else "Frontend"
    short_before = (before or "")[:8]
    short_after = (after or "")[:8]
    if short_before and short_after and short_before != short_after:
        return f"{label} updated ({short_before} -> {short_after})"
    if short_after:
        return f"{label} updated to {short_after}"
    return f"{label} updated"


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

    def _current_branch(self) -> str | None:
        try:
            r = self._run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
            branch = r.stdout.strip()
            if r.returncode == 0 and branch and branch != "HEAD":
                return branch
            return None
        except (OSError, subprocess.TimeoutExpired):
            return None

    def _remote_commit(self) -> str | None:
        branch = self._current_branch() or "main"
        try:
            r = self._run(["git", "ls-remote", "origin", f"refs/heads/{branch}"])
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
        branch = self._current_branch()
        if not branch:
            return {"success": False, "message": "Current checkout is not on a local branch"}

        try:
            r = self._run(["git", "pull", "--ff-only", "origin", branch], timeout=60)
            if r.returncode != 0:
                msg = r.stderr.strip() or r.stdout.strip() or "git pull failed"
                logger.error("git pull failed: %s", msg)
                return {"success": False, "message": msg}

            commit_after = self._local_commit()
            return {
                "success": True,
                "component": "system",
                "commit_before": (commit_before or "")[:8],
                "commit_after": (commit_after or "")[:8],
                "message": _format_success_message("system", commit_before, commit_after),
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "message": "git pull timed out"}
        except OSError as e:
            return {"success": False, "message": str(e)}


class CompositeUpdateProvider(UpdateProvider):
    """Prefer project updates, but fall back to standalone frontend updates."""

    def __init__(
        self,
        system_provider: UpdateProvider | None = None,
        frontend_provider: UpdateProvider | None = None,
    ) -> None:
        self._system = system_provider or GitUpdateProvider()
        self._frontend = frontend_provider or FrontendReleaseUpdateProvider(STATIC_DIR)

    def check(self) -> dict:
        system_result = self._system.check()
        frontend_result = self._frontend.check()

        if system_result.get("has_update"):
            return self._build_check_response(system_result, frontend_result, "system")

        if frontend_result.get("has_update"):
            return self._build_check_response(frontend_result, system_result, "frontend")

        error = system_result.get("error") or frontend_result.get("error")
        result = {
            "has_update": False,
            "components": {
                "system": system_result,
                "frontend": frontend_result,
            },
        }
        if error:
            result["error"] = error
        return result

    def update(self) -> dict:
        system_check = self._system.check()
        frontend_check = self._frontend.check()

        if system_check.get("has_update"):
            system_result = self._system.update()
            if system_result.get("success"):
                return self._build_update_response(system_result, frontend_check, "system")

            if frontend_check.get("has_update"):
                frontend_result = self._frontend.update()
                if frontend_result.get("success"):
                    return self._build_update_response(
                        frontend_result,
                        system_check,
                        "frontend",
                        warning=system_result.get("message"),
                    )
            return self._build_failed_update(system_result, frontend_check)

        if frontend_check.get("has_update"):
            frontend_result = self._frontend.update()
            if frontend_result.get("success"):
                return self._build_update_response(frontend_result, system_check, "frontend")
            return self._build_failed_update(frontend_result, system_check)

        return {"success": True, "message": "Already up to date"}

    def _build_check_response(self, primary: dict, secondary: dict, target: str) -> dict:
        result = {
            "has_update": True,
            "local_commit": primary.get("local_commit", ""),
            "remote_commit": primary.get("remote_commit", ""),
            "target": target,
            "components": {
                target: primary,
                "frontend" if target == "system" else "system": secondary,
            },
        }
        if primary.get("error"):
            result["error"] = primary["error"]
        return result

    def _build_update_response(
        self,
        primary: dict,
        secondary: dict,
        target: str,
        warning: str | None = None,
    ) -> dict:
        message = primary.get("message")
        if warning:
            message = f"Updated {target}, but another update path failed: {warning}"
        elif not message:
            message = _format_success_message(
                target,
                str(primary.get("commit_before", "")),
                str(primary.get("commit_after", "")),
            )

        result = {
            "success": True,
            "component": target,
            "commit_before": primary.get("commit_before", ""),
            "commit_after": primary.get("commit_after", ""),
            "components": {
                target: primary,
                "frontend" if target == "system" else "system": secondary,
            },
        }
        if message:
            result["message"] = message
        return result

    def _build_failed_update(self, primary: dict, secondary: dict) -> dict:
        message = primary.get("message") or secondary.get("message") or "Update failed"
        return {
            "success": False,
            "message": message,
            "components": {
                "primary": primary,
                "secondary": secondary,
            },
        }


_provider = CompositeUpdateProvider()


def check_update() -> dict:
    return _provider.check()


def perform_update() -> dict:
    return _provider.update()


def restart_server() -> None:
    """Replace the current process with a fresh instance."""
    logger.info("Restarting server...")
    os.execv(sys.executable, [sys.executable] + sys.argv)
