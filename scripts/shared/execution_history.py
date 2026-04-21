from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from shared.config import get_server_history_dir, get_server_history_entry_path
from shared.json_utils import load_json, save_json


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_run_record(
    server_id: str,
    workflow_id: str,
    run_id: str,
    raw_args: dict[str, Any],
    workflow_path: Path,
    schema_path: Path,
) -> dict[str, Any]:
    timestamp = utc_now_iso()
    return {
        "run_id": run_id,
        "server_id": server_id,
        "workflow_id": workflow_id,
        "status": "queued",
        "created_at": timestamp,
        "started_at": None,
        "finished_at": None,
        "duration_ms": None,
        "prompt_id": None,
        "raw_args": raw_args,
        "resolved_args": {},
        "workflow_snapshot": {
            "path": str(workflow_path),
            "sha256": file_sha256(workflow_path),
        },
        "schema_snapshot": {
            "path": str(schema_path),
            "sha256": file_sha256(schema_path),
        },
        "result": {
            "images": [],
            "image_count": 0,
        },
        "error": None,
    }


def save_run_record(server_id: str, workflow_id: str, record: dict[str, Any]) -> None:
    save_json(get_server_history_entry_path(server_id, workflow_id, str(record["run_id"])), record)


def get_run_record(server_id: str, workflow_id: str, run_id: str) -> dict[str, Any]:
    path = get_server_history_entry_path(server_id, workflow_id, run_id)
    if not path.exists():
        raise FileNotFoundError(run_id)
    payload = load_json(path)
    if not isinstance(payload, dict):
        raise ValueError(f"Run history record is invalid: {run_id}")
    return payload


def list_run_records(server_id: str, workflow_id: str) -> list[dict[str, Any]]:
    history_dir = get_server_history_dir(server_id, workflow_id)
    if not history_dir.exists():
        return []

    records: list[dict[str, Any]] = []
    for path in sorted(history_dir.glob("*.json")):
        try:
            payload = load_json(path)
        except Exception:
            continue
        if isinstance(payload, dict):
            records.append(payload)

    records.sort(
        key=lambda item: (
            str(item.get("created_at") or ""),
            str(item.get("run_id") or ""),
        ),
        reverse=True,
    )
    return records


def delete_run_record(server_id: str, workflow_id: str, run_id: str) -> None:
    path = get_server_history_entry_path(server_id, workflow_id, run_id)
    if not path.exists():
        raise FileNotFoundError(run_id)
    path.unlink()


def clear_run_records(server_id: str, workflow_id: str) -> int:
    history_dir = get_server_history_dir(server_id, workflow_id)
    if not history_dir.exists():
        return 0

    deleted = 0
    for path in history_dir.glob("*.json"):
        if path.is_file():
            path.unlink()
            deleted += 1

    try:
        history_dir.rmdir()
    except OSError:
        pass

    return deleted


def summarize_run_record(record: dict[str, Any]) -> dict[str, Any]:
    result = record.get("result") if isinstance(record.get("result"), dict) else {}
    error = record.get("error") if isinstance(record.get("error"), dict) else {}
    return {
        "run_id": record.get("run_id"),
        "server_id": record.get("server_id"),
        "workflow_id": record.get("workflow_id"),
        "status": record.get("status"),
        "created_at": record.get("created_at"),
        "started_at": record.get("started_at"),
        "finished_at": record.get("finished_at"),
        "duration_ms": record.get("duration_ms"),
        "prompt_id": record.get("prompt_id"),
        "raw_args": record.get("raw_args") if isinstance(record.get("raw_args"), dict) else {},
        "resolved_args": record.get("resolved_args") if isinstance(record.get("resolved_args"), dict) else {},
        "image_count": result.get("image_count", 0),
        "images": result.get("images", []) if isinstance(result.get("images"), list) else [],
        "error_message": error.get("message") if isinstance(error.get("message"), str) else "",
    }
