from __future__ import annotations

"""Dependency installer for ComfyUI custom nodes and models.

Installation strategies for nodes (priority order):
1. ComfyUI Manager queue API (/manager/queue/install)
2. cm-cli.py command-line
3. Direct git clone into custom_nodes/

Model downloads via Manager /manager/queue/install_model.
"""

import logging
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import requests

logger = logging.getLogger(__name__)

_REQUEST_TIMEOUT = 120  # Manager installs can be slow
_QUEUE_POLL_INTERVAL = 2  # seconds between queue status checks
_QUEUE_POLL_MAX = 150  # max polls (~5 minutes)


@dataclass(slots=True)
class InstallResult:
    """Result of a single package installation attempt."""

    success: bool
    package_name: str
    source: str  # repo URL or model filename
    message: str
    method: str = ""  # "manager_queue" | "cm_cli" | "git_clone" | "manager_model"
    needs_restart: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "package_name": self.package_name,
            "source": self.source,
            "message": self.message,
            "method": self.method,
            "needs_restart": self.needs_restart,
        }


@dataclass(slots=True)
class InstallReport:
    """Aggregated installation results."""

    results: list[InstallResult] = field(default_factory=list)
    needs_restart: bool = False

    def to_dict(self) -> dict[str, Any]:
        succeeded = sum(1 for r in self.results if r.success)
        failed = sum(1 for r in self.results if not r.success)
        return {
            "results": [r.to_dict() for r in self.results],
            "needs_restart": self.needs_restart,
            "summary": {
                "total": len(self.results),
                "succeeded": succeeded,
                "failed": failed,
            },
        }

    def format_text(self, locale: str = "zh") -> str:
        """Format install results as plain text."""
        succeeded = [r for r in self.results if r.success]
        failed = [r for r in self.results if not r.success]
        lines: list[str] = []

        if locale == "zh":
            header = "安装报告"
            ok_label = "成功"
            fail_label = "失败"
            restart_hint = "需要重启 ComfyUI 以加载新安装的节点"
        else:
            header = "Install Report"
            ok_label = "ok"
            fail_label = "failed"
            restart_hint = "ComfyUI restart required to load newly installed nodes"

        sep = "─" * 50
        lines.append(f"── {header} {sep[:50 - len(header) - 4]}")
        lines.append(f"   {len(succeeded)} {ok_label} · {len(failed)} {fail_label}")
        lines.append("")

        for r in succeeded:
            lines.append(f"   [+] {r.package_name:<36s} {r.method}")
        for r in failed:
            lines.append(f"   [x] {r.package_name:<36s} {r.message[:40]}")

        if self.needs_restart:
            lines.append("")
            lines.append(sep)
            lines.append(f"   {restart_hint}")

        return "\n".join(lines)


class DependencyInstaller:
    """Installs missing ComfyUI custom nodes and models.

    For nodes: Manager queue API -> cm-cli -> git clone
    For models: Manager /manager/queue/install_model
    """

    def __init__(self, server_url: str, server_auth: str = ""):
        self.server_url = server_url.rstrip("/")
        self.server_auth = server_auth
        self._headers: dict[str, str] = {"Content-Type": "application/json"}
        if server_auth:
            self._headers["Authorization"] = server_auth

    # ── Public API ────────────────────────────────────────────

    def install_nodes(
        self,
        repo_urls: list[str],
        on_progress: Callable[[int, int, str], None] | None = None,
    ) -> InstallReport:
        """Install custom nodes from the given repository URLs."""
        report = InstallReport()

        for i, repo_url in enumerate(repo_urls):
            pkg_name = _extract_package_name(repo_url)
            if on_progress:
                on_progress(i + 1, len(repo_urls), pkg_name)

            result = self._install_single_node(repo_url, pkg_name)
            report.results.append(result)
            if result.needs_restart:
                report.needs_restart = True

        return report

    def install_models(
        self,
        models: list[dict[str, str]],
        on_progress: Callable[[int, int, str], None] | None = None,
    ) -> InstallReport:
        """Install models via Manager's model download API.

        Each model dict should have: filename, folder, and optionally url.
        """
        report = InstallReport()

        for i, model in enumerate(models):
            filename = model.get("filename", "")
            if on_progress:
                on_progress(i + 1, len(models), filename)

            result = self._install_single_model(model)
            report.results.append(result)

        return report

    def install_all(
        self,
        repo_urls: list[str],
        models: list[dict[str, str]] | None = None,
        on_progress: Callable[[int, int, str], None] | None = None,
    ) -> InstallReport:
        """Install both nodes and models in one call."""
        total = len(repo_urls) + (len(models) if models else 0)
        report = InstallReport()
        idx = 0

        for repo_url in repo_urls:
            idx += 1
            pkg_name = _extract_package_name(repo_url)
            if on_progress:
                on_progress(idx, total, pkg_name)
            result = self._install_single_node(repo_url, pkg_name)
            report.results.append(result)
            if result.needs_restart:
                report.needs_restart = True

        if models:
            for model in models:
                idx += 1
                filename = model.get("filename", "")
                if on_progress:
                    on_progress(idx, total, filename)
                result = self._install_single_model(model)
                report.results.append(result)

        return report

    def check_manager_available(self) -> bool:
        """Check if ComfyUI Manager is accessible."""
        try:
            resp = requests.get(
                f"{self.server_url}/manager/queue/status",
                headers=self._headers,
                timeout=10,
            )
            return resp.status_code < 500
        except requests.RequestException:
            return False

    # ── Node installation strategies ──────────────────────────

    def _install_single_node(self, repo_url: str, pkg_name: str) -> InstallResult:
        """Try installing a single node package with cascading fallback."""
        # Strategy 1: Manager queue API
        result = self._try_manager_queue(repo_url, pkg_name)
        if result is not None:
            return result

        # Strategy 2: cm-cli.py
        result = self._try_cm_cli(repo_url, pkg_name)
        if result is not None:
            return result

        # Strategy 3: Direct git clone
        result = self._try_git_clone(repo_url, pkg_name)
        if result is not None:
            return result

        return InstallResult(
            success=False,
            package_name=pkg_name,
            source=repo_url,
            message="all methods failed",
            needs_restart=False,
        )

    def _try_manager_queue(self, repo_url: str, pkg_name: str) -> InstallResult | None:
        """Install via Manager queue API (/manager/queue/install)."""
        try:
            # First, ensure queue worker is started
            requests.get(
                f"{self.server_url}/manager/queue/start",
                headers=self._headers,
                timeout=10,
            )

            # Queue the install
            payload = {
                "id": pkg_name,
                "url": repo_url,
                "install_type": "git-clone",
            }
            resp = requests.post(
                f"{self.server_url}/manager/queue/install",
                headers=self._headers,
                json=payload,
                timeout=30,
            )

            if resp.status_code == 404:
                logger.debug("Manager queue API not available")
                return None

            if resp.status_code >= 400:
                return InstallResult(
                    success=False,
                    package_name=pkg_name,
                    source=repo_url,
                    message=f"Manager API error: {resp.status_code}",
                    method="manager_queue",
                    needs_restart=True,
                )

            # Poll queue status until done
            success = self._wait_for_queue()

            return InstallResult(
                success=success,
                package_name=pkg_name,
                source=repo_url,
                message="installed via Manager" if success else "Manager queue failed",
                method="manager_queue",
                needs_restart=True,
            )

        except requests.RequestException as exc:
            logger.debug("Manager queue install failed for %s: %s", pkg_name, exc)
            return None

    def _wait_for_queue(self) -> bool:
        """Poll /manager/queue/status until all tasks are done."""
        for _ in range(_QUEUE_POLL_MAX):
            time.sleep(_QUEUE_POLL_INTERVAL)
            try:
                resp = requests.get(
                    f"{self.server_url}/manager/queue/status",
                    headers=self._headers,
                    timeout=10,
                )
                if resp.status_code != 200:
                    continue
                data = resp.json()
                total = data.get("total", 0)
                done = data.get("done", 0)
                if total > 0 and done >= total:
                    return True
            except (requests.RequestException, ValueError):
                continue
        return False

    def _try_cm_cli(self, repo_url: str, pkg_name: str) -> InstallResult | None:
        """Attempt installation via cm-cli.py command line."""
        cm_cli_paths = [
            Path(self._guess_comfyui_path()) / "custom_nodes" / "ComfyUI-Manager" / "cm-cli.py",
        ]

        cm_cli = None
        for path in cm_cli_paths:
            if path.exists():
                cm_cli = path
                break

        if cm_cli is None:
            return None

        try:
            result = subprocess.run(
                ["python", str(cm_cli), "install", pkg_name],
                capture_output=True,
                text=True,
                timeout=300,
                cwd=cm_cli.parent.parent.parent,
            )

            if result.returncode == 0:
                return InstallResult(
                    success=True,
                    package_name=pkg_name,
                    source=repo_url,
                    message="installed via cm-cli",
                    method="cm_cli",
                    needs_restart=True,
                )
            else:
                return InstallResult(
                    success=False,
                    package_name=pkg_name,
                    source=repo_url,
                    message=f"cm-cli failed: {result.stderr[:200]}",
                    method="cm_cli",
                    needs_restart=False,
                )
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as exc:
            logger.debug("cm-cli failed for %s: %s", pkg_name, exc)
            return None

    def _try_git_clone(self, repo_url: str, pkg_name: str) -> InstallResult | None:
        """Attempt installation via direct git clone."""
        custom_nodes_dir = Path(self._guess_comfyui_path()) / "custom_nodes"
        if not custom_nodes_dir.is_dir():
            return None

        target_dir = custom_nodes_dir / pkg_name
        if target_dir.exists():
            return InstallResult(
                success=True,
                package_name=pkg_name,
                source=repo_url,
                message="directory already exists",
                method="git_clone",
                needs_restart=True,
            )

        try:
            result = subprocess.run(
                ["git", "clone", repo_url, str(target_dir)],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                return InstallResult(
                    success=False,
                    package_name=pkg_name,
                    source=repo_url,
                    message=f"git clone failed: {result.stderr[:200]}",
                    method="git_clone",
                    needs_restart=False,
                )

            # Install pip requirements if present
            req_file = target_dir / "requirements.txt"
            if req_file.exists():
                subprocess.run(
                    ["pip", "install", "-r", str(req_file)],
                    capture_output=True, text=True, timeout=300,
                )

            return InstallResult(
                success=True,
                package_name=pkg_name,
                source=repo_url,
                message="installed via git clone",
                method="git_clone",
                needs_restart=True,
            )

        except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as exc:
            return InstallResult(
                success=False,
                package_name=pkg_name,
                source=repo_url,
                message=f"git clone error: {exc}",
                method="git_clone",
                needs_restart=False,
            )

    # ── Model installation ────────────────────────────────────

    def _install_single_model(self, model: dict[str, str]) -> InstallResult:
        """Install a model via Manager's model download queue."""
        filename = model.get("filename", "")
        folder = model.get("folder", "")
        url = model.get("url", "")

        if not url:
            return InstallResult(
                success=False,
                package_name=filename,
                source="",
                message="no download URL available",
                method="",
                needs_restart=False,
            )

        try:
            # Ensure queue worker is started
            requests.get(
                f"{self.server_url}/manager/queue/start",
                headers=self._headers,
                timeout=10,
            )

            payload = {
                "name": filename,
                "url": url,
                "filename": filename,
                "type": folder,
            }
            resp = requests.post(
                f"{self.server_url}/manager/queue/install_model",
                headers=self._headers,
                json=payload,
                timeout=30,
            )

            if resp.status_code == 404:
                return InstallResult(
                    success=False,
                    package_name=filename,
                    source=url,
                    message="Manager model install not available",
                    method="",
                    needs_restart=False,
                )

            if resp.status_code >= 400:
                return InstallResult(
                    success=False,
                    package_name=filename,
                    source=url,
                    message=f"Manager error: {resp.status_code}",
                    method="manager_model",
                    needs_restart=False,
                )

            # Poll queue
            success = self._wait_for_queue()
            return InstallResult(
                success=success,
                package_name=filename,
                source=url,
                message="downloaded via Manager" if success else "download queue timeout",
                method="manager_model",
                needs_restart=False,
            )

        except requests.RequestException as exc:
            return InstallResult(
                success=False,
                package_name=filename,
                source=url,
                message=f"download failed: {exc}",
                method="manager_model",
                needs_restart=False,
            )

    # ── Helpers ───────────────────────────────────────────────

    def _guess_comfyui_path(self) -> str:
        """Guess the ComfyUI installation path."""
        common_paths = [
            Path.home() / "ComfyUI",
            Path("/workspace/ComfyUI"),
            Path("/app/ComfyUI"),
        ]
        for path in common_paths:
            if path.is_dir():
                return str(path)
        return str(Path.home() / "ComfyUI")


def _extract_package_name(repo_url: str) -> str:
    """Extract a human-readable package name from a repo URL."""
    url = repo_url.rstrip("/")
    return url.rsplit("/", 1)[-1] if "/" in url else url
