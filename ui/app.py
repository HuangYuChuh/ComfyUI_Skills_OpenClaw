from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

# Add scripts to path for shared imports
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root / "scripts"))

try:
    from .models import (
        CheckDependencyModel,
        ConfigModel,
        CreateServerModel,
        LocalWorkflowImportModel,
        RunWorkflowModel,
        SchemaModel,
        ServerModel,
        WorkflowBatchDeleteModel,
        TransferExportModel,
        ToggleModel,
        TransferImportModel,
        TransferPreviewModel,
        WorkflowOrderModel,
    )
    from .services import UIStorageService
    from .settings import DEFAULT_HOST, DEFAULT_PORT, STATIC_DIR, ensure_runtime_dirs
except ImportError:
    from models import (
        CheckDependencyModel,
        ConfigModel,
        CreateServerModel,
        LocalWorkflowImportModel,
        RunWorkflowModel,
        SchemaModel,
        ServerModel,
        WorkflowBatchDeleteModel,
        TransferExportModel,
        ToggleModel,
        TransferImportModel,
        TransferPreviewModel,
        WorkflowOrderModel,
    )
    from services import UIStorageService
    from settings import DEFAULT_HOST, DEFAULT_PORT, STATIC_DIR, ensure_runtime_dirs

from shared.health import check_server_health, test_server_connection
def execute_workflow_by_ids(server_id: str, workflow_id: str, input_args: dict) -> dict:
    """Bridge to CLI: run workflow via comfyui-skill CLI subprocess."""
    import subprocess
    args_json = json.dumps(input_args, ensure_ascii=False)
    try:
        result = subprocess.run(
            ["comfyui-skill", "--json", "run", f"{server_id}/{workflow_id}", "--args", args_json],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
        error_msg = result.stderr.strip() or result.stdout.strip() or "CLI execution failed"
        try:
            err_data = json.loads(error_msg)
            return {"status": "error", "error": err_data.get("error", {}).get("message", error_msg)}
        except (json.JSONDecodeError, TypeError):
            return {"status": "error", "error": error_msg}
    except FileNotFoundError:
        return {"status": "error", "error": "comfyui-skill CLI not installed. Run: pip install comfyui-skill-cli"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "Workflow execution timed out (300s)"}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
from shared.runtime_config import get_server_by_id

try:
    from .dependency_checker import DependencyCheckError, check_dependencies
    from .dependency_installer import DependencyInstaller
    from .comfyui_userdata import ComfyUIClientError
except ImportError:
    from dependency_checker import DependencyCheckError, check_dependencies
    from dependency_installer import DependencyInstaller
    from comfyui_userdata import ComfyUIClientError
from shared.transfer_bundle import (
    BundleValidationError,
    apply_bundle_import,
    build_export_bundle,
    preview_bundle_import,
    summarize_export_bundle,
)
from shared.updater import check_update, perform_update, restart_server

service = UIStorageService()
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    ensure_runtime_dirs()

    app = FastAPI(title="ComfyUI OpenClaw Skill Manager")
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.middleware("http")
    async def add_update_safe_cache_headers(request: Request, call_next):
        response = await call_next(request)
        if request.url.path in {"/", "/index.html", "/static/index.html", "/static/version.json"}:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = jsonable_encoder(exc.errors())
        logger.warning(
            "Validation failed for %s %s: %s",
            request.method,
            request.url.path,
            errors,
        )
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.get("/")
    async def read_index() -> FileResponse:
        return FileResponse(Path(STATIC_DIR) / "index.html")

    # ── Config ────────────────────────────────────────────────────

    @app.get("/api/config")
    async def get_config() -> dict:
        return service.get_config()

    @app.post("/api/config")
    async def save_config(config: ConfigModel) -> dict:
        saved = service.save_config(config.model_dump())
        return {"status": "success", "config": saved}

    # ── Server CRUD ───────────────────────────────────────────────

    @app.get("/api/servers")
    async def list_servers() -> dict:
        servers = service.list_servers()
        config = service.get_config()
        return {"servers": servers, "default_server": config.get("default_server", "")}

    @app.post("/api/servers")
    async def add_server(server: CreateServerModel) -> dict:
        try:
            created = service.add_server(server.model_dump())
            return {"status": "success", "server": created}
        except FileExistsError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @app.put("/api/servers/{server_id}")
    async def update_server(server_id: str, server: ServerModel) -> dict:
        try:
            updated = service.update_server(server_id, server.model_dump())
            return {"status": "success", "server": updated}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

    @app.post("/api/servers/{server_id}/toggle")
    async def toggle_server(server_id: str, data: ToggleModel) -> dict:
        try:
            service.toggle_server(server_id, data.enabled)
            return {"status": "success", "enabled": data.enabled}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

    @app.delete("/api/servers/{server_id}")
    async def delete_server(server_id: str, delete_data: bool = Query(False)) -> dict:
        try:
            service.delete_server(server_id, delete_data=delete_data)
            return {"status": "success"}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

    # ── Server Health ────────────────────────────────────────────

    @app.get("/api/servers/{server_id}/status")
    async def server_status(server_id: str) -> dict:
        servers = service.list_servers()
        server = next((s for s in servers if s["id"] == server_id), None)
        if server is None:
            raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")
        url = server.get("url", "")
        auth = server.get("auth", "")
        online = (await asyncio.to_thread(check_server_health, url, auth)) if url else False
        return {"server_id": server_id, "status": "online" if online else "offline", "url": url}

    @app.post("/api/servers/test-connection")
    async def test_connection(body: dict) -> dict:
        url = str(body.get("url") or "").strip()
        auth = str(body.get("auth") or "").strip()
        if not url:
            return {"status": "offline", "message": "URL is empty"}
        ok, message = await asyncio.to_thread(test_server_connection, url, auth)
        result: dict = {"status": "online" if ok else "offline"}
        if not ok:
            result["message"] = message
        return result

    # ── Workflow CRUD ─────────────────────────────────────────────

    @app.get("/api/servers/{server_id}/workflows")
    async def list_workflows(server_id: str) -> dict:
        workflows = [wf.to_dict() for wf in service.list_workflows(server_id)]
        return {"workflows": workflows}

    @app.get("/api/workflows")
    async def list_all_workflows() -> dict:
        workflows = [wf.to_dict() for wf in service.list_workflows()]
        return {"workflows": workflows}

    @app.get("/api/servers/{server_id}/workflow/{workflow_id}")
    async def get_workflow_detail(server_id: str, workflow_id: str) -> dict:
        try:
            return service.get_workflow_detail(server_id, workflow_id)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail="Workflow not found") from e
        except ValueError as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/servers/{server_id}/workflow/save")
    async def save_workflow(server_id: str, data: SchemaModel) -> dict:
        try:
            service.save_workflow(
                server_id=server_id,
                workflow_id=data.workflow_id,
                original_workflow_id=data.original_workflow_id,
                overwrite_existing=data.overwrite_existing,
                description=data.description,
                workflow_data=data.workflow_data,
                schema_params=data.schema_params,
                ui_schema_params=data.ui_schema_params,
            )
        except FileExistsError as e:
            raise HTTPException(
                status_code=409,
                detail=f'Workflow ID "{data.workflow_id}" already exists',
            ) from e
        return {"status": "success", "workflow_id": data.workflow_id}

    @app.post("/api/servers/{server_id}/workflow/{workflow_id}/toggle")
    async def toggle_workflow(server_id: str, workflow_id: str, data: ToggleModel) -> dict:
        try:
            service.toggle_workflow(server_id=server_id, workflow_id=workflow_id, enabled=data.enabled)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail="Workflow schema not found") from e
        return {"status": "success", "enabled": data.enabled}

    @app.delete("/api/servers/{server_id}/workflow/{workflow_id}")
    async def delete_workflow(server_id: str, workflow_id: str) -> dict:
        service.delete_workflow(server_id, workflow_id)
        return {"status": "success"}

    @app.post("/api/servers/{server_id}/workflows/batch-delete")
    async def batch_delete_workflows(server_id: str, data: WorkflowBatchDeleteModel) -> dict:
        try:
            result = service.delete_workflows(server_id, data.workflow_ids)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        return {"status": "success", **result}

    @app.post("/api/servers/{server_id}/workflow/{workflow_id}/run")
    async def run_workflow(server_id: str, workflow_id: str, data: RunWorkflowModel) -> dict:
        try:
            service.get_workflow_detail(server_id, workflow_id)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail="Workflow not found") from e
        except ValueError as e:
            raise HTTPException(status_code=500, detail=str(e)) from e
        result = await asyncio.to_thread(execute_workflow_by_ids, server_id, workflow_id, data.args)
        return {"status": result.get("status", "error"), "result": result}

    @app.post("/api/servers/{server_id}/upload/image")
    async def upload_image_to_comfyui(server_id: str, image: UploadFile = File(...)) -> dict:
        server = get_server_by_id(server_id)
        if not server:
            raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")
        server_url = str(server.get("url", "")).rstrip("/")
        if not server_url:
            raise HTTPException(status_code=400, detail="Server has no URL configured")
        server_auth = str(server.get("auth", ""))

        content = await image.read()

        import urllib.request
        import urllib.error

        boundary = f"----ComfyUIBoundary{id(content)}"
        filename = image.filename or "upload.png"
        content_type = image.content_type or "image/png"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")

        req = urllib.request.Request(
            f"{server_url}/upload/image",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        if server_auth:
            req.add_header("Authorization", f"Bearer {server_auth}")

        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            raise HTTPException(status_code=exc.code, detail="ComfyUI upload failed") from exc
        except urllib.error.URLError as exc:
            raise HTTPException(status_code=502, detail=f"Cannot connect to ComfyUI: {exc.reason}") from exc

    @app.get("/api/servers/{server_id}/workflow/{workflow_id}/history")
    async def list_workflow_history(server_id: str, workflow_id: str) -> dict:
        try:
            entries = service.list_workflow_history(server_id, workflow_id)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail="Workflow not found") from e
        return {"history": entries}

    @app.get("/api/servers/{server_id}/workflow/{workflow_id}/history/{run_id}")
    async def get_workflow_history_entry(server_id: str, workflow_id: str, run_id: str) -> dict:
        try:
            return service.get_workflow_history_entry(server_id, workflow_id, run_id)
        except FileNotFoundError as e:
            detail = "Workflow history entry not found" if e.args and e.args[0] == run_id else "Workflow not found"
            raise HTTPException(status_code=404, detail=detail) from e

    @app.get("/api/servers/{server_id}/workflow/{workflow_id}/history/{run_id}/images/{image_index}")
    async def get_workflow_history_image(server_id: str, workflow_id: str, run_id: str, image_index: int) -> FileResponse:
        try:
            image_path = service.get_workflow_history_image_path(server_id, workflow_id, run_id, image_index)
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e)) from e
        except FileNotFoundError as e:
            detail = "Workflow not found" if e.args and e.args[0] == workflow_id else "Workflow history image not found"
            raise HTTPException(status_code=404, detail=detail) from e
        return FileResponse(image_path)

    @app.delete("/api/servers/{server_id}/workflow/{workflow_id}/history/{run_id}")
    async def delete_workflow_history_entry(server_id: str, workflow_id: str, run_id: str) -> dict:
        try:
            service.delete_workflow_history_entry(server_id, workflow_id, run_id)
        except FileNotFoundError as e:
            detail = "Workflow history entry not found" if e.args and e.args[0] == run_id else "Workflow not found"
            raise HTTPException(status_code=404, detail=detail) from e
        return {"status": "success"}

    @app.delete("/api/servers/{server_id}/workflow/{workflow_id}/history")
    async def clear_workflow_history(server_id: str, workflow_id: str) -> dict:
        try:
            deleted = service.clear_workflow_history(server_id, workflow_id)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail="Workflow not found") from e
        return {"status": "success", "deleted": deleted}

    @app.post("/api/servers/{server_id}/workflows/reorder")
    async def reorder_workflows(server_id: str, data: WorkflowOrderModel) -> dict:
        try:
            workflow_order = service.reorder_workflows(server_id, data.workflow_ids)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        return {"status": "success", "workflow_order": workflow_order}

    @app.post("/api/servers/{server_id}/workflows/import/comfyui")
    async def import_workflows_from_comfyui(server_id: str) -> dict:
        try:
            report = service.import_workflows_from_comfyui(server_id)
            return {"status": "success", "report": report}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except (RuntimeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @app.get("/api/servers/{server_id}/workflows/import/comfyui/preview")
    async def preview_workflows_from_comfyui(server_id: str) -> dict:
        try:
            preview = service.preview_workflows_from_comfyui(server_id)
            return {"status": "success", "preview": preview}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except (RuntimeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @app.post("/api/servers/{server_id}/workflows/import/local")
    async def import_local_workflows(server_id: str, data: LocalWorkflowImportModel) -> dict:
        try:
            report = service.import_local_workflows(
                server_id,
                [{"file_name": item.file_name, "content": item.content} for item in data.files],
            )
            return {"status": "success", "report": report}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    # ── Dependency Check ────────────────────────────────────────

    @app.post("/api/servers/{server_id}/workflows/check-dependencies")
    async def check_workflow_dependencies(server_id: str, data: CheckDependencyModel) -> dict:
        """Check an uploaded workflow JSON for missing nodes and models."""
        if data.workflow_data is None:
            raise HTTPException(status_code=400, detail="workflow_data is required")
        try:
            server = get_server_by_id(server_id)
            if server is None:
                raise FileNotFoundError(f"Server '{server_id}' not found")
            report = await asyncio.to_thread(
                check_dependencies,
                server["url"],
                server.get("auth", ""),
                data.workflow_data,
                None,
                data.locale,
            )
            return {"status": "success", "report": report.to_dict()}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except DependencyCheckError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except ComfyUIClientError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        except Exception as e:
            logger.exception("Unexpected error in check_workflow_dependencies")
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/servers/{server_id}/workflows/{workflow_id}/check-dependencies")
    async def check_saved_workflow_dependencies(
        server_id: str, workflow_id: str, locale: str = "zh"
    ) -> dict:
        """Check an already-saved workflow for missing nodes and models."""
        try:
            server = get_server_by_id(server_id)
            if server is None:
                raise FileNotFoundError(f"Server '{server_id}' not found")
            detail = service.get_workflow_detail(server_id, workflow_id)
            workflow_data = detail["workflow_data"]
            report = await asyncio.to_thread(
                check_dependencies,
                server["url"],
                server.get("auth", ""),
                workflow_data,
                None,
                locale,
            )
            return {"status": "success", "report": report.to_dict()}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except DependencyCheckError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except ComfyUIClientError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        except Exception as e:
            logger.exception("Unexpected error in check_saved_workflow_dependencies")
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/servers/{server_id}/install-dependencies")
    async def install_dependencies(server_id: str, data: dict) -> dict:
        """Install missing custom nodes and/or models."""
        repo_urls = data.get("repo_urls", [])
        models = data.get("models", [])
        locale = data.get("locale", "zh")
        if not repo_urls and not models:
            raise HTTPException(
                status_code=400,
                detail="repo_urls list or models list is required",
            )
        try:
            server = get_server_by_id(server_id)
            if server is None:
                raise FileNotFoundError(f"Server '{server_id}' not found")
            installer = DependencyInstaller(server["url"], server.get("auth", ""))
            report = await asyncio.to_thread(
                installer.install_all, repo_urls, models or None
            )
            result = report.to_dict()
            result["text_report"] = report.format_text(locale)
            return {"status": "success", "report": result}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except ComfyUIClientError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    # ── System Update ────────────────────────────────────────────

    @app.get("/api/system/check-update")
    async def system_check_update() -> dict:
        return await asyncio.to_thread(check_update)

    @app.post("/api/system/update")
    async def system_update() -> dict:
        return await asyncio.to_thread(perform_update)

    @app.post("/api/system/restart")
    async def system_restart() -> dict:
        loop = asyncio.get_event_loop()
        loop.call_later(0.3, restart_server)
        return {"status": "restarting"}

    # ── Transfer Bundle ───────────────────────────────────────────

    @app.get("/api/transfer/export")
    async def export_transfer_bundle() -> Response:
        bundle, warnings = build_export_bundle()
        payload = json.dumps(bundle, ensure_ascii=False, indent=2) + "\n"
        headers = {
            "Content-Disposition": 'attachment; filename="openclaw-skill-export.json"',
        }
        if warnings:
            headers["X-Export-Warnings"] = str(len(warnings))
        return Response(content=payload, media_type="application/json", headers=headers)

    @app.get("/api/transfer/export/preview")
    async def preview_transfer_export() -> dict:
        bundle, warnings = build_export_bundle()
        return summarize_export_bundle(bundle, warnings)

    @app.post("/api/transfer/export/build")
    async def build_transfer_export(data: TransferExportModel) -> dict:
        bundle, warnings = build_export_bundle(
            selection=data.selection,
        )
        return {
            "bundle": bundle,
            "preview": summarize_export_bundle(bundle, warnings),
        }

    @app.post("/api/transfer/import/preview")
    async def preview_transfer_import(data: TransferPreviewModel) -> dict:
        preview = preview_bundle_import(
            data.bundle,
            apply_environment=data.apply_environment,
            overwrite_workflows=data.overwrite_workflows,
        )
        if not preview.validation.valid:
            raise HTTPException(status_code=400, detail=preview.validation.to_dict())
        return preview.to_dict()

    @app.post("/api/transfer/import")
    async def import_transfer_bundle(data: TransferImportModel) -> dict:
        try:
            report = apply_bundle_import(
                data.bundle,
                apply_environment=data.apply_environment,
                overwrite_workflows=data.overwrite_workflows,
            )
        except BundleValidationError as e:
            raise HTTPException(status_code=400, detail=e.result.to_dict()) from e
        except RuntimeError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        return report.to_dict()

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=DEFAULT_HOST, port=DEFAULT_PORT, log_level="info")
