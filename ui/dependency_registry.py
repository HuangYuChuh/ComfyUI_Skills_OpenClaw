from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

EXTENSION_NODE_MAP_URL = (
    "https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager"
    "/main/extension-node-map.json"
)
CUSTOM_NODE_LIST_URL = (
    "https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager"
    "/main/custom-node-list.json"
)

_DEFAULT_CACHE_TTL = 86400  # 24 hours
_REQUEST_TIMEOUT = 30


class NodeRegistry:
    """Manages ComfyUI Manager node mapping data with local caching.

    Provides reverse lookup from ``class_type`` to source repository URL so
    that missing custom nodes can be traced back to their installation package.
    """

    def __init__(self, cache_dir: str | Path, cache_ttl: int = _DEFAULT_CACHE_TTL):
        self._cache_dir = Path(cache_dir)
        self._cache_ttl = cache_ttl
        self._reverse_index: dict[str, str] | None = None
        self._node_list: dict[str, dict[str, Any]] | None = None

    # ── public API ───────────────────────────────────────────

    def resolve_node_source(self, class_type: str) -> tuple[str | None, str | None]:
        """Return ``(repo_url, package_title)`` for a given *class_type*.

        Returns ``(None, None)`` when the class_type is not found in the
        registry.
        """
        index = self._get_reverse_index()
        repo_url = index.get(class_type)
        if repo_url is None:
            return None, None

        node_list = self._get_node_list()
        metadata = node_list.get(repo_url, {})
        return repo_url, metadata.get("title")

    def resolve_many(
        self, class_types: set[str]
    ) -> dict[str, tuple[str | None, str | None]]:
        """Batch resolve multiple *class_types* at once."""
        index = self._get_reverse_index()
        node_list = self._get_node_list()
        result: dict[str, tuple[str | None, str | None]] = {}
        for ct in class_types:
            repo_url = index.get(ct)
            if repo_url is None:
                result[ct] = (None, None)
            else:
                title = node_list.get(repo_url, {}).get("title")
                result[ct] = (repo_url, title)
        return result

    def search_cloud_registry(self, class_type: str) -> dict[str, Any] | None:
        """Search the ComfyUI Registry (registry.comfy.org) for a node by name.

        Returns a dict with ``name``, ``repository``, ``description`` if found,
        or ``None`` if not found or the API is unreachable.
        """
        try:
            resp = requests.get(
                "https://api.comfy.org/nodes/search",
                params={"search": class_type, "limit": 3},
                timeout=10,
            )
            if resp.status_code != 200:
                return None

            data = resp.json()
            nodes = data.get("nodes", []) if isinstance(data, dict) else []
            if not nodes:
                return None

            # Return the best match — check if any node contains this class_type
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                return {
                    "name": node.get("name", ""),
                    "repository": node.get("repository", ""),
                    "description": node.get("description", ""),
                    "id": node.get("id", ""),
                }
            return None

        except (requests.RequestException, ValueError) as exc:
            logger.debug("ComfyUI Registry search failed for '%s': %s", class_type, exc)
            return None

    # ── internal data loading ────────────────────────────────

    def _get_reverse_index(self) -> dict[str, str]:
        if self._reverse_index is not None:
            return self._reverse_index

        raw = self._load_cached_json("extension-node-map.json", EXTENSION_NODE_MAP_URL)
        self._reverse_index = self._build_reverse_index(raw)
        return self._reverse_index

    def _get_node_list(self) -> dict[str, dict[str, Any]]:
        if self._node_list is not None:
            return self._node_list

        raw = self._load_cached_json("custom-node-list.json", CUSTOM_NODE_LIST_URL)
        self._node_list = self._build_node_list_index(raw)
        return self._node_list

    @staticmethod
    def _build_reverse_index(raw: dict[str, Any]) -> dict[str, str]:
        """Build ``{class_type: repo_url}`` from extension-node-map.json.

        The raw format is ``{repo_url: [[class_type, ...], {meta}]}``.
        """
        index: dict[str, str] = {}
        for repo_url, value in raw.items():
            if not isinstance(value, list) or len(value) < 1:
                continue
            class_types = value[0]
            if not isinstance(class_types, list):
                continue
            for ct in class_types:
                if isinstance(ct, str) and ct:
                    index[ct] = repo_url
        return index

    @staticmethod
    def _build_node_list_index(raw: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """Build ``{repo_url: metadata}`` from custom-node-list.json.

        The raw format has ``{"custom_nodes": [{...}, ...]}``.
        """
        index: dict[str, dict[str, Any]] = {}
        nodes = raw.get("custom_nodes", [])
        if not isinstance(nodes, list):
            return index
        for entry in nodes:
            if not isinstance(entry, dict):
                continue
            reference = entry.get("reference", "")
            files = entry.get("files", [])
            urls = [reference] if reference else []
            if isinstance(files, list):
                urls.extend(f for f in files if isinstance(f, str))
            for url in urls:
                if url:
                    index[url] = entry
        return index

    # ── cache management ─────────────────────────────────────

    def _load_cached_json(self, filename: str, remote_url: str) -> dict[str, Any]:
        """Load JSON data from local cache or fetch from remote."""
        cache_path = self._cache_dir / filename
        meta_path = self._cache_dir / f"{filename}.meta"

        # Check cache freshness
        if cache_path.exists() and meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                fetched_at = meta.get("fetched_at", 0)
                if time.time() - fetched_at < self._cache_ttl:
                    data = json.loads(cache_path.read_text(encoding="utf-8"))
                    if isinstance(data, dict):
                        return data
            except (json.JSONDecodeError, OSError) as exc:
                logger.debug("Cache read failed for %s: %s", filename, exc)

        # Fetch from remote
        data = self._fetch_remote(remote_url)
        if data is not None:
            self._write_cache(cache_path, meta_path, data)
            return data

        # Fallback: use stale cache if available
        if cache_path.exists():
            try:
                data = json.loads(cache_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    logger.warning("Using stale cache for %s", filename)
                    return data
            except (json.JSONDecodeError, OSError):
                pass

        logger.warning("No data available for %s", filename)
        return {}

    def _fetch_remote(self, url: str) -> dict[str, Any] | None:
        """Fetch JSON from a remote URL."""
        try:
            response = requests.get(url, timeout=_REQUEST_TIMEOUT)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict):
                return data
            logger.warning("Unexpected response type from %s", url)
            return None
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Failed to fetch %s: %s", url, exc)
            return None

    def _write_cache(
        self, cache_path: Path, meta_path: Path, data: dict[str, Any]
    ) -> None:
        """Write data and metadata to cache files."""
        try:
            self._cache_dir.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(
                json.dumps(data, ensure_ascii=False), encoding="utf-8"
            )
            meta_path.write_text(
                json.dumps({"fetched_at": time.time()}), encoding="utf-8"
            )
        except OSError as exc:
            logger.warning("Failed to write cache %s: %s", cache_path, exc)
