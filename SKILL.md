---
name: comfyui-skill-openclaw
description: |
  Run ComfyUI workflows from any AI agent (Claude Code, OpenClaw, Codex) via a single CLI.
  Import workflows, manage dependencies, execute across multiple servers, and track history
  — all through shell commands.

  **Use this Skill when:**
  (1) The user requests to "generate an image", "draw a picture", or "execute a ComfyUI workflow".
  (2) The user has specific stylistic, character, or scene requirements for image generation.
  (3) The user asks you to import, register, sync, or configure saved ComfyUI workflows for later reuse.
metadata:
  requires:
    bins: ["comfyui-skill"]
  cliHelp: "comfyui-skill --help"
---

# ComfyUI Agent SKILL

> **Prerequisites**: Install the CLI: `pip install -U comfyui-skill-cli`. All commands must run from this project's root directory (where this `SKILL.md` is located).
>
> [!IMPORTANT]
> **Directory Sensitivity**: The CLI reads `config.json` and `data/` from the current directory.
> You **MUST** `cd` into the project root before running any command.
> **Symptom**: `list` returns `[]` or `server status` reports not found → you are in the wrong directory.

## Quick Decision

- User says "generate image / draw a picture" → **Execution Flow (Step 1–4)**
- User says "import workflow / add workflow" → `comfyui-skill --json workflow import <path>`
- User says "img2img / use this image" → first `comfyui-skill --json upload <image>`, then execute
- User says "show previous results" → `comfyui-skill --json history list <id>`
- User says "open management UI" → `python3 ./ui/open_ui.py`

## Core Concepts

- **Skill ID**: `<server_id>/<workflow_id>` (e.g., `local/txt2img`). If server is omitted, the default server is used.
- **Schema**: Each workflow has a `schema.json` that maps business parameter names (e.g., `prompt`, `seed`) to internal ComfyUI node fields. Never expose node IDs to the user.
- **Server**: One or more ComfyUI instances configured in `config.json`. Check health with `server status`.

## Command Reference

| Command | Purpose |
|---------|---------|
| `comfyui-skill --json server status` | Check if ComfyUI server is online |
| `comfyui-skill --json list` | List all available workflows and parameters |
| `comfyui-skill --json info <id>` | Show workflow details and parameter schema |
| `comfyui-skill --json submit <id> --args '{...}'` | Submit a workflow (non-blocking) |
| `comfyui-skill --json status <prompt_id>` | Check execution status |
| `comfyui-skill --json run <id> --args '{...}'` | Execute a workflow (blocking) |
| `comfyui-skill --json upload <image_path>` | Upload image to ComfyUI (for img2img workflows) |
| `comfyui-skill --json deps check <id>` | Check missing dependencies |
| `comfyui-skill --json deps install <id> --repos '[...]'` | Install missing custom nodes |
| `comfyui-skill --json workflow import <path>` | Import workflow (auto-detect format, auto-generate schema) |
| `comfyui-skill --json history list <id>` | List execution history for a workflow |
| `comfyui-skill --json history show <id> <run_id>` | Show details of a specific run |

---

## Execution Flow

### Step 1: Query Available Workflows

```bash
comfyui-skill --json list
```

Returns a JSON array of all enabled workflows with their parameters.

- `required: true` parameters → **ask the user** if not provided.
- `required: false` parameters → infer from context (e.g., `seed` = random number), or omit.
- Never expose node IDs; only use business parameter names (e.g., prompt, style).
- If multiple workflows match, pick the most relevant one or list candidates.

### Step 2: Parameter Assembly

Assemble parameters into a JSON string. Example:
```
{"prompt": "A beautiful landscape, high quality, masterpiece", "seed": 40128491}
```

If critical parameters are missing, ask the user (e.g., "What visual style would you like?").

### Step 3: Pre-flight Dependency Check

**Always** run before first execution of a workflow:

```bash
comfyui-skill --json deps check <server_id>/<workflow_id>
```

- If `is_ready` is `true` → proceed to Step 4.
- If `is_ready` is `false`:
  1. Present missing nodes and models to the user.
  2. If user agrees to install, run:
     ```bash
     comfyui-skill --json deps install <id> --repos '["https://github.com/repo1"]'
     ```
     Use `source_repo` URLs from the check report as `--repos` values.
  3. If `needs_restart` is `true`, inform the user to restart ComfyUI, then re-check.
  4. Missing models must be downloaded manually — tell the user which folder to place them in (e.g., `checkpoints`).

### Step 4: Execute the Workflow

> **Note**: JSON args must be wrapped in single quotes to prevent bash from parsing double quotes.

Choose the execution mode based on your environment:

#### Interactive mode: `submit` + `status` (recommended for chat)

**Step 4a — Submit:**
```bash
comfyui-skill --json submit <id> --args '{"prompt": "..."}'
```
Returns: `{"status": "submitted", "prompt_id": "..."}`. Tell the user generation has started.

**Step 4b — Poll:**
```bash
comfyui-skill --json status <prompt_id>
```

Status values: `queued` (with `position`) → `running` → `success` (with `outputs`) or `error`.

**Polling pattern — critical for real-time feedback:**

Each `status` call must be a **separate tool invocation** (a separate bash command). Do NOT write a shell loop. The correct pattern is:

1. Run `status` as a standalone bash command.
2. Read the returned JSON.
3. If `queued` or `running`: **send a text message to the user** with progress, then run `status` again.
4. If `success`: proceed to Step 5.
5. If `error`: report the error.

#### Non-interactive mode: one-shot blocking (for scripts/CI)

```bash
comfyui-skill --json run <id> --args '{"prompt": "..."}'
```
Blocks until finished. Returns the same result format as `status` with `success`.

### Step 5: Present Results

On success, the result contains an `outputs` array with file references (`filename`, `subfolder`, `type`).
Use your native capabilities to present the files to the user (e.g., image preview, file path).

---

## Workflow Import

When the user wants to add new workflows (not execute existing ones):

```bash
comfyui-skill --json workflow import <json_path> --check-deps
```

- Supports both API format and editor format (auto-detected, auto-converted).
- Automatically generates `schema.json` with smart parameter extraction.
- Use `--check-deps` to verify dependencies immediately after import.

For bulk import from ComfyUI server or local folders, see [`references/workflow-import.md`](./references/workflow-import.md).

## Troubleshooting

1. **ComfyUI Offline**: Run `comfyui-skill --json server status`. If offline, ask the user to start ComfyUI.
2. **Workflow Not Found**: Run `comfyui-skill --json list` to see available workflows. If missing, the user needs to import it first.
3. **Parameter Format Error**: Ensure `--args` is valid JSON wrapped in single quotes.
4. **Cloud Node Unauthorized**: Workflow uses cloud API nodes (Kling, Sora, etc.). Guide user to: (1) Generate an API Key at https://platform.comfy.org, (2) Open Web UI → Server Settings → fill in "ComfyUI API Key".
