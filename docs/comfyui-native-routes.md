---
title: ComfyUI Native Local Routes
---

# ComfyUI Native Local Routes

This page documents the native HTTP and WebSocket routes exposed by a local ComfyUI server, with emphasis on the subset that matters to this skill.

It is intentionally separate from this repository's own manager API in `ui/app.py`. If you are looking for routes such as `/api/servers` or `/api/transfer/*`, those belong to this project, not to upstream ComfyUI.

Official ComfyUI references:

- [Server Overview](https://docs.comfy.org/development/comfyui-server/comms_overview)
- [Routes](https://docs.comfy.org/development/comfyui-server/comms_routes)

The official links in this document intentionally use the English documentation only.

This document is intentionally limited to the local ComfyUI server documentation under `development/comfyui-server/*`.

It does not use `api-reference/cloud/*`, `api-reference/registry/*`, or other official API-reference sections, even if some route names overlap.

## Scope

This skill is an execution-oriented ComfyUI client. It does not attempt to expose every upstream ComfyUI capability through the agent contract.

Today, the critical native routes for this repository are:

- `POST /prompt`
- `GET /history/{prompt_id}`
- `GET /view`

These are the routes used to submit a workflow, wait for completion, and download generated images.

## Core Calling Patterns

Assume a local ComfyUI server at `http://127.0.0.1:8188`.

### Submit A Workflow

Route:

- `POST /prompt`

How to call:

- Content type: `application/json`
- Body shape:

```json
{
  "prompt": {
    "3": {
      "inputs": {
        "seed": 1,
        "steps": 20,
        "cfg": 8,
        "sampler_name": "euler",
        "scheduler": "normal",
        "denoise": 1,
        "model": ["4", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["5", 0]
      },
      "class_type": "KSampler"
    }
  },
  "client_id": "optional-client-id"
}
```

Example:

```bash
curl -X POST http://127.0.0.1:8188/prompt \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": {
      "3": {
        "inputs": {
          "seed": 1,
          "steps": 20
        },
        "class_type": "KSampler"
      }
    },
    "client_id": "openclaw-skill"
  }'
```

Expected response:

- Success: returns `prompt_id` and queue `number`
- Failure: returns `error` and `node_errors`

Official docs:

- [Routes](https://docs.comfy.org/development/comfyui-server/comms_routes)

### Poll For Completion

Route:

- `GET /history/{prompt_id}`

How to call:

- Replace `{prompt_id}` with the value returned by `POST /prompt`
- No request body

Example:

```bash
curl http://127.0.0.1:8188/history/<prompt_id>
```

What to look for:

- A history object keyed by `prompt_id`
- `outputs` containing generated image entries
- Each image entry usually includes `filename`, `subfolder`, and `type`

Official docs:

- [Routes](https://docs.comfy.org/development/comfyui-server/comms_routes)

### Download An Output Image

Route:

- `GET /view`

How to call:

- Query parameters typically include:
- `filename`
- `subfolder`
- `type`

Example:

```bash
curl "http://127.0.0.1:8188/view?filename=ComfyUI_00001_.png&subfolder=&type=output" \
  --output result.png
```

Official docs:

- [Routes](https://docs.comfy.org/development/comfyui-server/comms_routes)
- Note: the official page says `/view` has many options and points readers to the upstream `server.py` handler for details.

### Receive Live Status

Route:

- `WS /ws`

How to call:

- Open a WebSocket connection to `/ws`
- Receive JSON messages such as `status`, `execution_start`, `executing`, `progress`, and `executed`

Official docs:

- [Routes](https://docs.comfy.org/development/comfyui-server/comms_routes)

## Route Groups

Skill status labels in the tables below use this convention:

- `Used now`: actively used by the current implementation.
- `Candidate`: not used yet, but a realistic near/mid-term integration target.
- `Not used`: currently out of scope, with no active integration plan.
- `Not used directly`: available upstream, but not called directly in the current execution path.

### Execution

| Route | Method | Purpose | Call shape | Skill status |
| --- | --- | --- | --- | --- |
| `/prompt` | `POST` | Submit a workflow to the execution queue. Returns `prompt_id` on success or validation errors on failure. | JSON body with `prompt`, optional `client_id` | Used now |
| `/prompt` | `GET` | Inspect current prompt queue status and execution information. | No body | Not used |
| `/history` | `GET` | Read execution history for finished or recorded runs. | No body | Not used directly |
| `/history/{prompt_id}` | `GET` | Read the history entry for one run. This is how the client polls for completion. | Path param `prompt_id` | Used now |
| `/history` | `POST` | Clear history or delete a history item. | JSON body, operation-specific | Not used |
| `/queue` | `GET` | Inspect the current execution queue. | No body | Not used |
| `/queue` | `POST` | Manage queue operations such as clearing pending or running work. | JSON body, operation-specific | Candidate |
| `/interrupt` | `POST` | Stop the currently running workflow. | Usually empty body | Candidate |
| `/ws` | `WS` | Real-time execution progress, status changes, and node events. | WebSocket connection | Candidate |
| `/free` | `POST` | Free memory by unloading specified models. | JSON body, operation-specific | Candidate |

### Assets And Files

| Route | Method | Purpose | Call shape | Skill status |
| --- | --- | --- | --- | --- |
| `/view` | `GET` | Download or inspect an output image by filename, subfolder, and type. | Query params such as `filename`, `subfolder`, `type` | Used now |
| `/upload/image` | `POST` | Upload an image into ComfyUI-managed storage. Useful for image-to-image or reference-image workflows. | Multipart form upload | Candidate |
| `/upload/mask` | `POST` | Upload a mask for inpainting-style workflows. | Multipart form upload | Candidate |
| `/view_metadata` | `GET` | Retrieve metadata for a model or asset. | Query params | Not used |
| `/userdata` and `/v2/userdata` | `GET` | List user data files. | Query params, route-specific | Not used |
| `/userdata/{file}` | `GET/POST/DELETE` | Read, write, or delete specific user data files. | Path param plus body for upload/update | Not used |

### Discovery And Introspection

| Route | Method | Purpose | Call shape | Skill status |
| --- | --- | --- | --- | --- |
| `/object_info` | `GET` | Return details for all node types. Useful for building smarter workflow/schema tooling. | No body | Candidate |
| `/object_info/{node_class}` | `GET` | Return details for one node type. | Path param `node_class` | Candidate |
| `/models` | `GET` | Return available model folders or model types. | No body | Candidate |
| `/models/{folder}` | `GET` | Return models within a specific folder. | Path param `folder` | Candidate |
| `/embeddings` | `GET` | Return available embeddings. | No body | Candidate |
| `/features` | `GET` | Return server capabilities and feature flags. | No body | Candidate |
| `/system_stats` | `GET` | Return system information such as devices and VRAM. | No body | Candidate |
| `/workflow_templates` | `GET` | Return template workflows exposed by custom node modules. | No body | Not used |
| `/extensions` | `GET` | Return registered web extensions. | No body | Not used |

## What This Repository Uses Today

As of 2026-03-14, the current CLI client in [`scripts/comfyui_client.py`](../scripts/comfyui_client.py) follows a minimal three-step native ComfyUI flow:

1. `POST /prompt` to queue the workflow.
2. `GET /history/{prompt_id}` until the run appears in history.
3. `GET /view` for each generated image returned by the history entry.

That design keeps the skill narrow and reliable. It only depends on the routes required to run a prepared workflow and fetch the resulting files.

## What Could Be Added Next

If this skill expands beyond basic workflow execution, the most valuable native ComfyUI routes to integrate next are:

- `/ws` for real-time progress updates instead of polling-only completion checks.
- `/interrupt` so the agent or UI can cancel long-running jobs.
- `/queue` so the manager can inspect backlog and surface queue state.
- `/upload/image` and `/upload/mask` for image-to-image, control, and inpainting workflows.
- `/object_info` for smarter schema generation and validation against upstream node definitions.
- `/models` and `/system_stats` for server capability discovery before dispatching a workflow.

## Native ComfyUI Routes vs Project Manager API

Use this distinction consistently:

- ComfyUI native routes: upstream routes on the target ComfyUI server, usually something like `http://127.0.0.1:8188`.
- Project manager API: this repository's FastAPI routes under `/api/*`, served by `ui/app.py`, used to manage saved servers, workflows, and transfer bundles.

Examples of project manager routes:

- `/api/config`
- `/api/servers`
- `/api/workflows`
- `/api/transfer/export/preview`

These project routes orchestrate local configuration and workflow metadata. They do not replace the upstream ComfyUI server routes used for actual workflow execution.
