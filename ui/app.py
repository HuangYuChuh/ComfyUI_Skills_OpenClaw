from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Add scripts to path for shared imports
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root / "scripts"))

try:
    from .models import ConfigModel, CreateServerModel, SchemaModel, ServerModel, ToggleModel
    from .services import UIStorageService
    from .settings import DEFAULT_HOST, DEFAULT_PORT, STATIC_DIR, ensure_runtime_dirs
except ImportError:
    from models import ConfigModel, CreateServerModel, SchemaModel, ServerModel, ToggleModel
    from services import UIStorageService
    from settings import DEFAULT_HOST, DEFAULT_PORT, STATIC_DIR, ensure_runtime_dirs

service = UIStorageService()


def create_app() -> FastAPI:
    ensure_runtime_dirs()

    app = FastAPI(title="ComfyUI OpenClaw Skill Manager")
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

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
    async def delete_server(server_id: str) -> dict:
        try:
            service.delete_server(server_id)
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

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=DEFAULT_HOST, port=DEFAULT_PORT, log_level="info")
