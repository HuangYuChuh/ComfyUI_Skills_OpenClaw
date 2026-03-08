from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

try:
    from .models import ConfigModel, SchemaModel, ToggleModel
    from .services import UIStorageService
    from .settings import DEFAULT_HOST, DEFAULT_PORT, STATIC_DIR, ensure_runtime_dirs
except ImportError:
    from models import ConfigModel, SchemaModel, ToggleModel
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

    @app.get("/api/config")
    async def get_config() -> dict[str, str]:
        return service.get_config()

    @app.post("/api/config")
    async def save_config(config: ConfigModel) -> dict[str, object]:
        saved_config = service.save_config(config.model_dump())
        return {"status": "success", "config": saved_config}

    @app.get("/api/workflows")
    async def list_workflows() -> dict[str, object]:
        workflows = [workflow.to_dict() for workflow in service.list_workflows()]
        return {"workflows": workflows}

    @app.get("/api/workflow/{workflow_id}")
    async def get_workflow_detail(workflow_id: str) -> dict[str, object]:
        try:
            return service.get_workflow_detail(workflow_id)
        except FileNotFoundError as error:
            raise HTTPException(status_code=404, detail="Workflow not found") from error
        except ValueError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

    @app.post("/api/workflow/save")
    async def save_workflow(data: SchemaModel) -> dict[str, str]:
        try:
            service.save_workflow(
                workflow_id=data.workflow_id,
                original_workflow_id=data.original_workflow_id,
                overwrite_existing=data.overwrite_existing,
                description=data.description,
                workflow_data=data.workflow_data,
                schema_params=data.schema_params,
            )
        except FileExistsError as error:
            raise HTTPException(
                status_code=409,
                detail=f'Workflow ID "{data.workflow_id}" already exists',
            ) from error
        return {"status": "success", "workflow_id": data.workflow_id}

    @app.post("/api/workflow/{workflow_id}/toggle")
    async def toggle_workflow(workflow_id: str, data: ToggleModel) -> dict[str, object]:
        try:
            service.toggle_workflow(workflow_id=workflow_id, enabled=data.enabled)
        except FileNotFoundError as error:
            raise HTTPException(status_code=404, detail="Workflow schema not found") from error
        return {"status": "success", "enabled": data.enabled}

    @app.delete("/api/workflow/{workflow_id}")
    async def delete_workflow(workflow_id: str) -> dict[str, str]:
        service.delete_workflow(workflow_id)
        return {"status": "success"}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=DEFAULT_HOST, port=DEFAULT_PORT, log_level="info")
