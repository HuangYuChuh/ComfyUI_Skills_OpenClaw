# ComfyUI Skills for OpenClaw

![ComfyUI Skills Banner](./asset/banner-ui-dashboard-20260322.png)

Turn your ComfyUI workflows into callable skills for AI agents. Any agent that can run shell commands — Claude Code, Codex, OpenClaw — can discover, execute, and manage ComfyUI workflows through a single CLI.

<a href="./README.zh.md"><img src="https://img.shields.io/badge/简体中文-README.zh.md-blue?style=flat-square" alt="简体中文" /></a>

[Demo Video](https://www.bilibili.com/video/BV1a6cUzVEE6/) · [Install](#install) · [CLI Usage](#cli-usage) · [Web UI](#web-ui-optional) · [Workflow Setup](#workflow-setup) · [Multi-Server](#multi-server-management)

---

## Install

### Step 1: Clone the project

<details>
<summary><strong>For OpenClaw</strong></summary>

```bash
cd ~/.openclaw/workspace/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw
cp config.example.json config.json
```

</details>

<details>
<summary><strong>For Claude Code</strong></summary>

```bash
cd ~/.claude/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
cp config.example.json config.json
```

</details>

<details>
<summary><strong>For Codex</strong></summary>

```bash
cd ~/.codex/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
cp config.example.json config.json
```

</details>

### Step 2: Install the CLI

```bash
pipx install comfyui-skill-cli
```

Or with pip:

```bash
pip install comfyui-skill-cli
```

### Step 3: Verify

```bash
comfyui-skill server status
comfyui-skill list
```

That's it. The CLI reads `config.json` and `data/` from the project directory.

> **Web UI dependencies** (optional, only needed if you want the management interface):
> ```bash
> pip install -r requirements.txt
> ```

---

## CLI Usage

The CLI is the primary way to interact with ComfyUI Skills. All commands support `--json` for structured output.

### Quick Start

```bash
# Check server
comfyui-skill server status

# List workflows
comfyui-skill list

# Execute a workflow
comfyui-skill run local/txt2img --args '{"prompt": "a white cat"}'

# Import a new workflow from JSON
comfyui-skill workflow import ./my-workflow.json --check-deps

# Upload an image for img2img workflows
comfyui-skill upload ./photo.png
```

### Full Command Reference

| Category | Command | Description |
|----------|---------|-------------|
| **Discovery** | `comfyui-skill list` | List all workflows with parameters |
| | `comfyui-skill info <workflow_id>` | Show workflow details and parameter schema |
| **Execution** | `comfyui-skill run <workflow_id> --args '{...}'` | Execute workflow (blocking) |
| | `comfyui-skill submit <workflow_id> --args '{...}'` | Submit workflow (non-blocking) |
| | `comfyui-skill status <prompt_id>` | Check execution status |
| | `comfyui-skill upload <image_path>` | Upload image to ComfyUI |
| **Workflow** | `comfyui-skill workflow import <json_path>` | Import from local JSON (auto-detect format) |
| | `comfyui-skill workflow import --from-server` | Import from ComfyUI server |
| | `comfyui-skill workflow enable/disable <workflow_id>` | Toggle workflow |
| | `comfyui-skill workflow delete <workflow_id>` | Delete workflow |
| **Server** | `comfyui-skill server list` | List servers |
| | `comfyui-skill server status [<server_id>]` | Check server health |
| | `comfyui-skill server add --id <server_id> --url <url>` | Add server |
| | `comfyui-skill server enable/disable <server_id>` | Toggle server |
| | `comfyui-skill server remove <server_id>` | Remove server |
| **Dependencies** | `comfyui-skill deps check <workflow_id>` | Check missing nodes and models |
| | `comfyui-skill deps install <workflow_id> --all` | Install all missing deps |
| **Config** | `comfyui-skill config export --output <path>` | Export config bundle |
| | `comfyui-skill config import <path>` | Import config bundle |
| **History** | `comfyui-skill history list <workflow_id>` | List execution history |
| | `comfyui-skill history show <workflow_id> <run_id>` | Show run details |

> `<workflow_id>` format: `server_id/workflow_name` (e.g. `local/txt2img`). Omit the server prefix to use the default server.

For full CLI documentation, see [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI).

---

## Web UI (Optional)

A local web interface for visual workflow management. Not required for Agent usage — the CLI covers all functionality.

### Launch

```bash
pip install -r requirements.txt   # first time only
./ui/run_ui.sh                    # macOS/Linux
# or: ui\run_ui.bat               # Windows
```

Visit `http://localhost:18189`.

### Capabilities

- Upload workflows exported from ComfyUI (API Format)
- Configure parameter mappings with a visual editor
- Manage multiple servers and workflows in one place
- Drag to reorder, search and filter across servers
- Available in English, Simplified Chinese, and Traditional Chinese

Frontend source lives in a [separate repository](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend).

---

## Workflow Setup

Before you start, make sure your ComfyUI server is running (default: `http://127.0.0.1:8188`).

### Option A: Import via CLI (Recommended)

```bash
# Import a workflow JSON — auto-detects format, converts if needed, generates schema
comfyui-skill workflow import ./my-workflow.json

# Check and install dependencies
comfyui-skill deps check local/my-workflow
comfyui-skill deps install local/my-workflow --all

# Verify
comfyui-skill run local/my-workflow --args '{"prompt": "test"}'
```

### Option B: Import via Web UI

1. Open the Web UI at `http://localhost:18189`
2. Upload a workflow JSON exported from ComfyUI with **Save (API Format)**
3. Select which parameters to expose to agents
4. Save the mapping

### Option C: Manual Setup

<details>
<summary>Expand for manual config file setup</summary>

#### 1) Edit `config.json`

```jsonc
{
  "servers": [
    {
      "id": "local",
      "name": "Local",
      "url": "http://127.0.0.1:8188",
      "enabled": true,
      "output_dir": "./outputs"
    }
  ],
  "default_server": "local"
}
```

#### 2) Place workflow files

```
data/local/my-workflow/
  workflow.json  # ComfyUI API-format export
  schema.json    # Parameter mapping
```

#### 3) Write `schema.json`

```jsonc
{
  "description": "My workflow",
  "enabled": true,
  "parameters": {
    "prompt": {
      "node_id": 10,
      "field": "prompt",
      "required": true,
      "type": "string",
      "description": "Prompt text"
    }
  }
}
```

</details>

### Workflow Requirements

- **Must be exported in ComfyUI API format** (click **Save (API Format)** in ComfyUI)
- **Must end with a `Save Image` node** (or equivalent image output node)

---

## Multi-Server Management

Manage multiple ComfyUI servers and route jobs to different hardware.

### Core Concepts

- **Dual-layer toggles**: Both servers and workflows have independent enable/disable. Agents only see workflows where both are enabled.
- **Namespacing**: Workflows are identified as `<server_id>/<workflow_id>` (e.g. `local/txt2img` vs `remote-a100/txt2img`).

### CLI

```bash
comfyui-skill server add --id remote --name "Remote GPU" --url http://10.0.0.1:8188
comfyui-skill server list
comfyui-skill server disable remote
```

### Configuration Migration

```bash
# Export
comfyui-skill config export --output ./backup.json

# Preview import
comfyui-skill config import ./backup.json --dry-run

# Apply import
comfyui-skill config import ./backup.json
```

*All server settings can also be managed through the Web UI.*

---

## Updating

```bash
./update.sh
```

This pulls the latest code, syncs frontend assets, and installs new dependencies. You can also run `git pull` manually.

To update the CLI:

```bash
pipx upgrade comfyui-skill-cli
```

---

## Common Issues

- **HTTP 400 on `/prompt`**: The workflow payload or parameter values are invalid.
- **No images returned**: The workflow is missing a `Save Image` node.
- **Connection failed**: Check that `config.json` has the correct server URL.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.

---

## Project Structure

```text
ComfyUI_Skills_OpenClaw/
├── SKILL.md                    # Agent instruction spec
├── config.example.json         # Example config
├── config.json                 # Local config (gitignored)
├── requirements.txt            # Python deps for Web UI only
├── data/
│   └── <server_id>/
│       └── <workflow_id>/
│           ├── workflow.json   # ComfyUI API-format workflow
│           └── schema.json     # Parameter mapping
├── scripts/
│   ├── update_frontend.sh      # Pull latest frontend build
│   └── shared/                 # Shared utils (Web UI backend)
├── ui/
│   ├── app.py                  # FastAPI backend
│   ├── open_ui.py              # UI launcher
│   └── static/                 # Frontend (HTML/CSS/JS)
└── outputs/
```

---

<details>
<summary>Project Keywords And Resources</summary>

### Project Keywords

- OpenClaw · ComfyUI · ComfyUI Skills · ComfyUI workflow automation
- AI image generation skill · OpenClaw ComfyUI integration

### Core Files

- `SKILL.md` — Agent execution contract
- `docs/llms.txt` / `docs/llms-full.txt` — LLM-oriented summaries

</details>
