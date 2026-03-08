# ComfyUI Skills for OpenClaw

![ComfyUI Skills Banner](./asset/banner.jpg)
<p>
  <a href="./README.zh.md">
    <img src="https://img.shields.io/badge/简体中文-README.zh.md-blue?style=flat-square" alt="简体中文" />
  </a>
</p>

This project is a ComfyUI skill integration layer for OpenClaw and other LLM agents. It turns the workflows you build and export from ComfyUI (API format) into callable skills that agents can trigger with natural language.

It converts natural language requests into structured skill arguments, maps them to ComfyUI workflow inputs, submits jobs to ComfyUI, waits for completion, then pulls generated images back to local disk.

---

## Current Project Structure

```text
ComfyUI_Skills_OpenClaw/
├── SKILL.md                    # Agent instruction spec (how to call registry/client)
├── README.md                   # 英文主页
├── README.zh.md                # 中文说明
├── LICENSE
├── .gitignore
├── requirements.txt            # Python deps (FastAPI, requests, etc.)
├── config.example.json         # Example runtime config
├── config.json                 # Actual local runtime config (gitignored)
├── data/
│   ├── workflows/
│   │   └── test.json           # ComfyUI workflow API export (current demo workflow)
│   └── schemas/
│       └── test.json           # Exposed parameter mapping for workflow "test"
├── scripts/
│   ├── registry.py             # List workflows + exposed parameters for agent
│   └── comfyui_client.py       # Inject args, queue prompt, poll history, download images
├── ui/
│   ├── app.py                  # FastAPI app (local dashboard backend)
│   ├── run_ui.sh               # Start UI (macOS/Linux)
│   ├── run_ui.command          # Double-click launcher (macOS)
│   ├── run_ui.bat              # Launcher (Windows)
│   └── static/                 # Pure Vanilla HTML/JS/CSS frontend served by FastAPI
└── outputs/
    ├── .gitkeep
    └── *.png                   # Generated images
```

---

## What This Skill Can Do

- **[AI-Native Feature] Zero-Touch Auto-Configuration**: Drop a ComfyUI workflow JSON directly to the Agent, and it will autonomously analyze nodes, extract parameters, and generate the schema for you!
- Discover available workflows and required parameters (`registry.py`)
- Convert agent/user args into ComfyUI node input values (`schema -> node_id/field` mapping)
- Queue generation jobs via ComfyUI HTTP API (`/prompt`)
- Poll completion via `/history/{prompt_id}`
- Download output images via `/view` to local `outputs/`

---

## Requirements

- Python 3.10+
- A running ComfyUI server (default: `http://127.0.0.1:8188`)

Install dependencies:

```bash
pip install -r requirements.txt
```

---

## Configuration

`config.json` (local):

```json
{
  "comfyui_server_url": "http://127.0.0.1:8188",
  "output_dir": "./outputs"
}
```

> Tip: Keep `config.json` local-only. Use `config.example.json` as a template.

---

## Quick Start

### 1) Check available workflows

```bash
python scripts/registry.py list
```

Current demo workflow: `test`

Exposed params:
- `prompt` (required)
- `size` (optional)
- `seed` (optional)

### 2) Run one generation job

```bash
python scripts/comfyui_client.py \
  --workflow test \
  --args '{"prompt":"A premium product photo on aged driftwood, warm cinematic light","size":"3:4,1728x2304","seed":20260307}'
```

If successful, output JSON includes local image path(s), e.g.:

```json
{
  "status": "success",
  "prompt_id": "...",
  "images": ["./outputs/<prompt_id>_...png"]
}
```

---

## Local Dashboard (UI)

Start dashboard:

- macOS/Linux:
  ```bash
  ./ui/run_ui.sh
  ```
  or double-click `ui/run_ui.command`
- Windows:
  ```bat
  ui\run_ui.bat
  ```

Then open:

- `http://localhost:8189`

Use it to configure ComfyUI server URL and manage workflow/schema mapping.

Implementation is split for easier maintenance across `ui/app.py`, `ui/services.py`, `ui/static/styles.css`, and `ui/static/js/`.

---

## OpenClaw Integration Notes

To make OpenClaw pick up this skill in a workspace session, keep it under:

- `<workspace>/skills/comfyui-skill-openclaw/`

OpenClaw reads `SKILL.md` and then uses:
- `scripts/registry.py list --agent`
- `scripts/comfyui_client.py --workflow ... --args '...json...'`

---

## Workflow Requirements (Important)

To ensure a workflow can be executed by this project reliably:

1. **Export ComfyUI workflow in API format**
   - In ComfyUI, click **Save (API Format)**.
   - Use that exported JSON in `data/workflows/<workflow_id>.json`.

2. **The final output path should include a `Save Image` node**
   - The current client downloads generated results from ComfyUI output images.
   - Without a `Save Image` node (or equivalent image output in history), the tool may finish but return no downloadable image.

In short: **API-format workflow + Save Image output node** are required for stable usage.

---

## Known Caveats

- If ComfyUI returns HTTP 400 on `/prompt`, the workflow payload or parameter value is usually invalid.
- `size` must match values accepted by the underlying node (e.g. `3:4,1728x2304`).
- If `config.json` points to the wrong server URL, job queueing will fail.

---

## Roadmap (next)

- Multi-workflow management beyond `test`
- Better schema validation before queueing
- Richer error reporting from ComfyUI node errors
- Optional batch generation / multi-seed helpers
