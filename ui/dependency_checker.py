from __future__ import annotations

"""Workflow dependency checker for ComfyUI.

Detects missing custom nodes and model files by querying:
1. ComfyUI /object_info (installed nodes)
2. ComfyUI Manager API (node status + import-fail diagnostics)
3. ComfyUI Registry API (cloud search for unknown nodes)
4. extension-node-map.json (offline fallback)
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests

try:
    from .comfyui_userdata import ComfyUIClientError
    from .dependency_registry import NodeRegistry
    from .workflow_format import is_api_workflow
except ImportError:
    from comfyui_userdata import ComfyUIClientError
    from dependency_registry import NodeRegistry
    from workflow_format import is_api_workflow

logger = logging.getLogger(__name__)

# ── Known model loader mappings ──────────────────────────────
# Maps class_type -> {input_field: model_folder}

MODEL_LOADER_MAP: dict[str, dict[str, str]] = {
    "CheckpointLoaderSimple": {"ckpt_name": "checkpoints"},
    "CheckpointLoader": {"ckpt_name": "checkpoints"},
    "unCLIPCheckpointLoader": {"ckpt_name": "checkpoints"},
    "LoraLoader": {"lora_name": "loras"},
    "LoraLoaderModelOnly": {"lora_name": "loras"},
    "ControlNetLoader": {"control_net_name": "controlnet"},
    "DiffControlNetLoader": {"control_net_name": "controlnet"},
    "VAELoader": {"vae_name": "vae"},
    "UpscaleModelLoader": {"model_name": "upscale_models"},
    "CLIPLoader": {"clip_name": "clip"},
    "DualCLIPLoader": {"clip_name1": "clip", "clip_name2": "clip"},
    "UNETLoader": {"unet_name": "diffusion_models"},
    "StyleModelLoader": {"style_model_name": "style_models"},
    "CLIPVisionLoader": {"clip_name": "clip_vision"},
    "GLIGENLoader": {"gligen_name": "gligen"},
    "HypernetworkLoader": {"hypernetwork_name": "hypernetworks"},
}

# ── i18n strings ─────────────────────────────────────────────

_I18N: dict[str, dict[str, str]] = {
    "zh": {
        "all_ready": "所有依赖已满足，工作流可以运行",
        "missing_pkgs": "{count} 可安装",
        "import_fail": "{count} 加载失败",
        "unknown": "{count} 未知",
        "missing_models": "{count} 模型",
        "status_not_installed": "未安装",
        "status_import_fail": "加载失败: {reason}",
        "status_unknown": "未在 Registry 中找到",
        "hint_import_fail": "已安装但加载失败，可能是 Python 依赖缺失，尝试重新安装或检查日志",
        "hint_unknown": "未在 ComfyUI Manager 和 Registry 中找到，可能是私有节点，请联系工作流作者",
        "section_missing_nodes": "缺失节点",
        "section_import_fail": "加载失败",
        "section_unknown": "未知节点",
        "section_missing_models": "缺失模型",
        "header": "依赖检测报告",
        "footer_install": '回复「安装」自动修复',
        "model_downloadable": "可自动下载",
        "model_manual": "需手动下载",
    },
    "en": {
        "all_ready": "All dependencies satisfied, workflow is ready",
        "missing_pkgs": "{count} installable",
        "import_fail": "{count} import failed",
        "unknown": "{count} unknown",
        "missing_models": "{count} models",
        "status_not_installed": "not installed",
        "status_import_fail": "import failed: {reason}",
        "status_unknown": "not found in Registry",
        "hint_import_fail": "Installed but failed to load, likely missing Python deps. Try reinstalling or check logs",
        "hint_unknown": "Not found in ComfyUI Manager or Registry. May be a private node, contact the workflow author",
        "section_missing_nodes": "MISSING NODES",
        "section_import_fail": "IMPORT FAILED",
        "section_unknown": "UNKNOWN",
        "section_missing_models": "MISSING MODELS",
        "header": "Dependency Report",
        "footer_install": 'Reply "install" to auto-fix',
        "model_downloadable": "auto-downloadable",
        "model_manual": "manual download required",
    },
}


def _t(key: str, locale: str = "zh", **kwargs: Any) -> str:
    """Translate a key with optional interpolation."""
    strings = _I18N.get(locale, _I18N["en"])
    template = strings.get(key, _I18N["en"].get(key, key))
    return template.format(**kwargs) if kwargs else template


class DependencyCheckError(ValueError):
    """Raised when dependency checking encounters an error."""


# ── Data classes ─────────────────────────────────────────────


@dataclass(slots=True)
class ModelRef:
    """A reference to a model file found in a workflow node."""

    filename: str
    folder: str
    loader_node: str
    node_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "folder": self.folder,
            "loader_node": self.loader_node,
            "node_id": self.node_id,
        }


@dataclass(slots=True)
class WorkflowDependency:
    """Extracted dependencies from a workflow."""

    required_nodes: set[str] = field(default_factory=set)
    required_models: dict[str, list[ModelRef]] = field(default_factory=dict)


@dataclass(slots=True)
class MissingNode:
    """A custom node class_type that is not installed."""

    class_type: str
    source_repo: str | None = None
    package_name: str | None = None
    can_auto_install: bool = False
    status: str = "not_installed"  # "not_installed" | "import_fail" | "unknown"
    fail_reason: str = ""
    hint: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "class_type": self.class_type,
            "source_repo": self.source_repo,
            "package_name": self.package_name,
            "can_auto_install": self.can_auto_install,
            "status": self.status,
            "fail_reason": self.fail_reason,
            "hint": self.hint,
        }


@dataclass(slots=True)
class MissingModel:
    """A model file that is not found on the ComfyUI server."""

    filename: str
    folder: str
    loader_node: str
    node_id: str
    can_auto_download: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "folder": self.folder,
            "loader_node": self.loader_node,
            "node_id": self.node_id,
            "can_auto_download": self.can_auto_download,
        }


@dataclass(slots=True)
class DependencyReport:
    """Complete dependency check result."""

    is_ready: bool = True
    missing_nodes: list[MissingNode] = field(default_factory=list)
    missing_models: list[MissingModel] = field(default_factory=list)
    total_nodes_required: int = 0
    total_models_required: int = 0
    summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_ready": self.is_ready,
            "missing_nodes": [n.to_dict() for n in self.missing_nodes],
            "missing_models": [m.to_dict() for m in self.missing_models],
            "total_nodes_required": self.total_nodes_required,
            "total_models_required": self.total_models_required,
            "summary": self.summary,
        }

    def format_text(self, locale: str = "zh") -> str:
        """Format the report as a UNIX-style plain text string."""
        if self.is_ready:
            return _t("all_ready", locale)

        lines: list[str] = []
        sep = "─" * 50

        # Header
        lines.append(f"── {_t('header', locale)} {sep[:50 - len(_t('header', locale)) - 4]}")

        # Stats bar
        stats: list[str] = []
        installable = [n for n in self.missing_nodes if n.status == "not_installed"]
        import_fail = [n for n in self.missing_nodes if n.status == "import_fail"]
        unknown = [n for n in self.missing_nodes if n.status == "unknown"]
        if installable:
            stats.append(_t("missing_pkgs", locale, count=len(installable)))
        if import_fail:
            stats.append(_t("import_fail", locale, count=len(import_fail)))
        if unknown:
            stats.append(_t("unknown", locale, count=len(unknown)))
        if self.missing_models:
            stats.append(_t("missing_models", locale, count=len(self.missing_models)))
        lines.append(f"   {' · '.join(stats)}")
        lines.append("")

        # Missing nodes (auto-installable)
        if installable:
            lines.append(f"   {_t('section_missing_nodes', locale)}")
            for n in installable:
                name = n.package_name or n.class_type
                lines.append(f"   [-] {name:<40s} {_t('status_not_installed', locale)}")
            lines.append("")

        # Import-failed nodes
        if import_fail:
            lines.append(f"   {_t('section_import_fail', locale)}")
            for n in import_fail:
                name = n.package_name or n.class_type
                reason = n.fail_reason or "unknown"
                lines.append(
                    f"   [!] {name:<40s} {_t('status_import_fail', locale, reason=reason)}"
                )
            lines.append("")

        # Unknown nodes
        if unknown:
            lines.append(f"   {_t('section_unknown', locale)}")
            for n in unknown:
                lines.append(
                    f"   [?] {n.class_type:<40s} {_t('status_unknown', locale)}"
                )
            lines.append("")

        # Missing models
        if self.missing_models:
            lines.append(f"   {_t('section_missing_models', locale)}")
            for m in self.missing_models:
                tag = _t("model_downloadable", locale) if m.can_auto_download else m.folder
                lines.append(f"   [>] {m.filename:<40s} {tag}")
            lines.append("")

        # Footer
        has_fixable = installable or import_fail or any(
            m.can_auto_download for m in self.missing_models
        )
        lines.append(sep)
        if has_fixable:
            lines.append(f"   {_t('footer_install', locale)}")

        return "\n".join(lines)


# ── Core functions ───────────────────────────────────────────


def extract_dependencies(workflow_data: dict[str, Any]) -> WorkflowDependency:
    """Extract all required class_types and model references from an API-format workflow."""
    if not is_api_workflow(workflow_data):
        raise DependencyCheckError(
            "Workflow data is not in API format. "
            "Please convert editor-format workflows before checking dependencies."
        )

    required_nodes: set[str] = set()
    required_models: dict[str, list[ModelRef]] = defaultdict(list)

    for node_id, node in workflow_data.items():
        if not isinstance(node, dict):
            continue

        class_type = node.get("class_type", "")
        if not class_type:
            continue

        required_nodes.add(class_type)

        # Check for model file references
        if class_type in MODEL_LOADER_MAP:
            inputs = node.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            for field_name, folder in MODEL_LOADER_MAP[class_type].items():
                model_name = inputs.get(field_name)
                if isinstance(model_name, str) and model_name:
                    required_models[folder].append(
                        ModelRef(
                            filename=model_name,
                            folder=folder,
                            loader_node=class_type,
                            node_id=str(node_id),
                        )
                    )

    return WorkflowDependency(
        required_nodes=required_nodes,
        required_models=dict(required_models),
    )


def check_dependencies(
    server_url: str,
    server_auth: str,
    workflow_data: dict[str, Any],
    registry_cache_dir: str | Path | None = None,
    locale: str = "zh",
) -> DependencyReport:
    """Check a workflow for missing custom nodes and model files.

    Uses a three-tier resolution strategy:
    1. ComfyUI Manager API — node status + import-fail diagnostics
    2. ComfyUI Registry API — cloud search for unknown nodes
    3. extension-node-map.json — offline fallback
    """
    deps = extract_dependencies(workflow_data)

    # 1. Get installed nodes from ComfyUI
    installed_nodes = _fetch_installed_nodes(server_url, server_auth)

    # 2. Compute missing nodes
    missing_class_types = deps.required_nodes - installed_nodes

    if not missing_class_types and not deps.required_models:
        return DependencyReport(
            is_ready=True,
            total_nodes_required=len(deps.required_nodes),
            total_models_required=0,
            summary=_t("all_ready", locale),
        )

    # 3. Resolve missing nodes via Manager API (best), then Registry, then offline map
    manager_info = _fetch_manager_node_info(server_url, server_auth)
    if registry_cache_dir is None:
        registry_cache_dir = Path(__file__).resolve().parent.parent / ".cache"
    registry = NodeRegistry(registry_cache_dir)

    missing_nodes: list[MissingNode] = []
    if missing_class_types:
        for ct in sorted(missing_class_types):
            node = _resolve_single_node(ct, manager_info, registry, locale)
            missing_nodes.append(node)

    # 4. Check model files
    manager_has_model_install = _check_manager_model_support(server_url, server_auth)
    missing_models = _check_missing_models(
        server_url, server_auth, deps.required_models, manager_has_model_install
    )

    # 5. Build summary
    total_models = sum(len(refs) for refs in deps.required_models.values())
    is_ready = len(missing_nodes) == 0 and len(missing_models) == 0

    report = DependencyReport(
        is_ready=is_ready,
        missing_nodes=missing_nodes,
        missing_models=missing_models,
        total_nodes_required=len(deps.required_nodes),
        total_models_required=total_models,
    )
    report.summary = report.format_text(locale)

    return report


# ── Internal helpers ─────────────────────────────────────────


def _fetch_installed_nodes(server_url: str, server_auth: str) -> set[str]:
    """Fetch the set of installed node class_types from ComfyUI /object_info."""
    url = f"{server_url.rstrip('/')}/object_info"
    headers: dict[str, str] = {}
    if server_auth:
        headers["Authorization"] = server_auth

    try:
        response = requests.get(url, headers=headers, timeout=20)
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, dict):
            return set(payload.keys())
        raise ComfyUIClientError("ComfyUI /object_info returned unexpected payload.")
    except requests.RequestException as exc:
        raise ComfyUIClientError(
            f"Failed to fetch /object_info from {server_url}: {exc}"
        ) from exc


def _fetch_manager_node_info(
    server_url: str, server_auth: str
) -> dict[str, Any]:
    """Fetch node mappings and install status from ComfyUI Manager.

    Returns a dict with:
      - "mappings": {class_type: {url, title}} from /customnode/getmappings
      - "import_fails": {cnr_id_or_url: error_msg} from Manager diagnostics
      - "available": True if Manager API responded

    Falls back gracefully if Manager is not installed.
    """
    base_url = server_url.rstrip("/")
    headers: dict[str, str] = {}
    if server_auth:
        headers["Authorization"] = server_auth

    info: dict[str, Any] = {"mappings": {}, "import_fails": {}, "available": False}

    # Try /customnode/getmappings
    try:
        resp = requests.get(
            f"{base_url}/customnode/getmappings", headers=headers, timeout=15
        )
        if resp.status_code == 200:
            info["available"] = True
            raw = resp.json()
            # Format: {url: [[class_types], {meta}]} or similar
            mappings: dict[str, dict[str, str]] = {}
            if isinstance(raw, dict):
                for url_key, value in raw.items():
                    if not isinstance(value, list) or len(value) < 1:
                        continue
                    class_types = value[0] if isinstance(value[0], list) else []
                    for ct in class_types:
                        if isinstance(ct, str):
                            mappings[ct] = {"url": url_key}
            info["mappings"] = mappings
    except (requests.RequestException, ValueError) as exc:
        logger.debug("Manager /customnode/getmappings unavailable: %s", exc)

    # Try /customnode/getlist for install status
    try:
        resp = requests.get(
            f"{base_url}/customnode/getlist", headers=headers, timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            nodes_list = data.get("custom_nodes", []) if isinstance(data, dict) else []
            for entry in nodes_list:
                if not isinstance(entry, dict):
                    continue
                status = entry.get("installed", "")
                if status == "False" or status == "false":
                    # Not installed — already handled by mappings
                    continue
                if status == "Import Failed":
                    # Node installed but failed to load
                    reference = entry.get("reference", "")
                    title = entry.get("title", "")
                    info["import_fails"][reference] = {
                        "title": title,
                        "reference": reference,
                    }
    except (requests.RequestException, ValueError) as exc:
        logger.debug("Manager /customnode/getlist unavailable: %s", exc)

    return info


def _resolve_single_node(
    class_type: str,
    manager_info: dict[str, Any],
    registry: NodeRegistry,
    locale: str,
) -> MissingNode:
    """Resolve a single missing node through the three-tier strategy."""

    mappings = manager_info.get("mappings", {})
    import_fails = manager_info.get("import_fails", {})

    # Tier 1: Manager mappings (local, most authoritative)
    if class_type in mappings:
        url = mappings[class_type].get("url", "")

        # Check if this package is in the import-fail list
        if url in import_fails:
            fail_info = import_fails[url]
            return MissingNode(
                class_type=class_type,
                source_repo=url,
                package_name=fail_info.get("title", ""),
                can_auto_install=True,
                status="import_fail",
                fail_reason=_get_import_fail_reason(
                    url, manager_info, mappings[class_type].get("url", "")
                ),
                hint=_t("hint_import_fail", locale),
            )

        # Normal missing node — resolvable
        # Try to get title from registry offline data
        _, title = registry.resolve_node_source(class_type)
        return MissingNode(
            class_type=class_type,
            source_repo=url,
            package_name=title or url.rsplit("/", 1)[-1] if url else None,
            can_auto_install=True,
            status="not_installed",
        )

    # Tier 2: Offline registry fallback (extension-node-map.json)
    repo_url, title = registry.resolve_node_source(class_type)
    if repo_url:
        return MissingNode(
            class_type=class_type,
            source_repo=repo_url,
            package_name=title,
            can_auto_install=True,
            status="not_installed",
        )

    # Tier 3: ComfyUI Registry cloud search
    cloud_result = registry.search_cloud_registry(class_type)
    if cloud_result:
        return MissingNode(
            class_type=class_type,
            source_repo=cloud_result.get("repository", ""),
            package_name=cloud_result.get("name", ""),
            can_auto_install=bool(cloud_result.get("repository")),
            status="not_installed",
        )

    # Unresolvable
    return MissingNode(
        class_type=class_type,
        source_repo=None,
        package_name=None,
        can_auto_install=False,
        status="unknown",
        hint=_t("hint_unknown", locale),
    )


def _get_import_fail_reason(
    repo_url: str,
    manager_info: dict[str, Any],
    server_url: str,
) -> str:
    """Try to get a detailed import failure reason from Manager."""
    # The Manager API /customnode/import_fail_info can provide details,
    # but it requires the server to be reachable. For now, return a generic reason.
    return "Python dependency"


def _check_manager_model_support(server_url: str, server_auth: str) -> bool:
    """Check if Manager's model download endpoint is available."""
    base_url = server_url.rstrip("/")
    headers: dict[str, str] = {}
    if server_auth:
        headers["Authorization"] = server_auth
    try:
        resp = requests.get(
            f"{base_url}/externalmodel/getlist", headers=headers, timeout=10
        )
        return resp.status_code == 200
    except requests.RequestException:
        return False


def _check_missing_models(
    server_url: str,
    server_auth: str,
    required_models: dict[str, list[ModelRef]],
    manager_has_model_install: bool = False,
) -> list[MissingModel]:
    """Check which required model files are missing from ComfyUI."""
    if not required_models:
        return []

    base_url = server_url.rstrip("/")
    headers: dict[str, str] = {}
    if server_auth:
        headers["Authorization"] = server_auth

    missing: list[MissingModel] = []

    for folder, refs in required_models.items():
        # Fetch available models for this folder
        available: set[str] = set()
        try:
            response = requests.get(
                f"{base_url}/models/{folder}", headers=headers, timeout=20
            )
            if response.status_code < 400:
                data = response.json()
                if isinstance(data, list):
                    available = {str(m) for m in data}
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Failed to list models for folder '%s': %s", folder, exc)

        # Check each required model
        for ref in refs:
            if ref.filename not in available:
                missing.append(
                    MissingModel(
                        filename=ref.filename,
                        folder=ref.folder,
                        loader_node=ref.loader_node,
                        node_id=ref.node_id,
                        can_auto_download=manager_has_model_install,
                    )
                )

    return missing
