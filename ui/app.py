from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
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
        ConfigModel,
        CreateServerModel,
        SchemaModel,
        ServerModel,
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
        ConfigModel,
        CreateServerModel,
        SchemaModel,
        ServerModel,
        TransferExportModel,
        ToggleModel,
        TransferImportModel,
        TransferPreviewModel,
        WorkflowOrderModel,
    )
    from services import UIStorageService
    from settings import DEFAULT_HOST, DEFAULT_PORT, STATIC_DIR, ensure_runtime_dirs

from shared.transfer_bundle import (
    BundleValidationError,
    apply_bundle_import,
    build_export_bundle,
    preview_bundle_import,
    summarize_export_bundle,
)

service = UIStorageService()
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    ensure_runtime_dirs()

    app = FastAPI(title="ComfyUI OpenClaw Skill Manager")
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

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

    @app.post("/api/servers/{server_id}/workflows/reorder")
    async def reorder_workflows(server_id: str, data: WorkflowOrderModel) -> dict:
        try:
            workflow_order = service.reorder_workflows(server_id, data.workflow_ids)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        return {"status": "success", "workflow_order": workflow_order}

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
