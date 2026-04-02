---
name: comfyui-skill-openclaw
description: |
  Run ComfyUI workflows from any AI agent (Claude Code, OpenClaw, Codex) via a single CLI. Import workflows, manage dependencies, execute across multiple servers, and track history — all through shell commands.

  **Use this Skill when:**
  (1) The user requests to "generate an image", "draw a picture", or "execute a ComfyUI workflow".
  (2) The user has specific stylistic, character, or scene requirements for image generation.
  (3) The user asks you to import, register, sync, or configure saved ComfyUI workflows for later reuse.
---

# ComfyUI Agent SKILL

## Core Execution Specification

As an Agent equipped with the ComfyUI skill, your objective is to translate the user's conversational requests into strict, structured parameters and execute workflows across multi-server environments.

> **Prerequisites**: Install the CLI tool once: `pip install comfyui-skill-cli`. All commands must be run from this project's root directory.

### Quick Reference

| Command | Purpose |
|---------|---------|
| `comfyui-skill --json server status` | Check if ComfyUI server is online |
| `comfyui-skill --json list` | List all available workflows and parameters |
| `comfyui-skill --json info <id>` | Show workflow details and parameter schema |
| `comfyui-skill --json submit <id> --args '{...}'` | Submit a workflow (non-blocking) |
| `comfyui-skill --json status <prompt_id>` | Check execution status |
| `comfyui-skill --json run <id> --args '{...}'` | Execute a workflow (blocking) |
| `comfyui-skill --json deps check <id>` | Check missing dependencies |
| `comfyui-skill --json deps install <id> --repos '[...]'` | Install missing custom nodes |

Skill IDs use the format `<server_id>/<workflow_id>` (e.g., `local/txt2img`).

### UI Management Shortcut

If the user asks you to open, launch, or bring up the local Web UI for this skill, run:

```bash
python3 ./ui/open_ui.py
```

This command will:
- reuse the UI if it is already running
- start it in the background if it is not running
- try to open the browser to the local dashboard automatically

### Server Health Check

Before running a workflow, check whether the target ComfyUI server is online:

```bash
comfyui-skill --json server status
```

This returns JSON with `"status": "online"` or `"status": "offline"`.

**Recommended agent flow:** Before Step 3 (Trigger Image Generation), run a server status check. If offline, ask the user to start ComfyUI and retry once it is online.

### Step 0: Workflow Onboarding and Import (Optional)

Use the manager UI/API when the user wants to register workflows into this skill instead of running them immediately.

- For bulk import from ComfyUI `/userdata`, local files, manager API routes, and import result semantics, read [`references/workflow-import.md`](./references/workflow-import.md).
- Prefer the bulk import flow when the user wants to sync many saved workflows at once.
- Use single-workflow configuration only when the user gives one workflow and wants a targeted setup.

#### Single-workflow auto-configuration

If the user provides you with one new ComfyUI workflow JSON (API format) and asks you to "configure it" or "add it":
1. Check the existing server configurations or default to `local`.
2. Save the provided JSON file to `./data/<server_id>/<new_workflow_id>/workflow.json`.
3. Analyze the JSON structure (look for `inputs` inside node definitions, e.g., `KSampler`'s `seed`, `CLIPTextEncode`'s `text` for positive/negative prompts, `EmptyLatentImage` for width/height).
4. Automatically generate a schema mapping file and save it to `./data/<server_id>/<new_workflow_id>/schema.json`. The schema format must follow:
   ```json
   {
     "workflow_id": "<new_workflow_id>",
     "server_id": "<server_id>",
     "description": "Auto-configured by Agent",
     "enabled": true,
     "parameters": {
       "prompt": { "node_id": "3", "field": "text", "required": true, "type": "string", "description": "Positive prompt" }
     }
   }
   ```
5. Tell the user that the new workflow on the specific server is successfully configured and ready to be used.

### Step 1: Query Available Workflows (Registry)

Before attempting to generate any image, you must **first query the registry** to understand which workflows are currently supported and enabled:
```bash
comfyui-skill --json list
```

**Return Format Parsing**:
You will receive a JSON array containing all available workflows. Each is uniquely identified by the combination of `server_id` and `workflow_id` (or path format `<server_id>/<workflow_id>`):
- For parameters with `required: true`, if the user hasn't provided them, you must **ask the user to provide them**.
- For parameters with `required: false`, you can infer and generate them yourself based on the user's description (e.g., translating and optimizing the user's scene), or simply use empty values/random numbers (e.g., `seed` = random number).
- Never expose underlying node information to the user (do not mention Node IDs); only ask about business parameter names (e.g., prompt, style).
- If multiple workflows match the user prompt across different servers, you may list them acting as candidates, OR simply pick the most relevant one and execute it directly to provide the best user experience.

### Step 2: Parameter Assembly and Interaction

Once you have identified the workflow to use and collected/generated all necessary parameters, you need to assemble them into a compact JSON string.
For example, if the schema exposes `prompt` and `seed`, you need to construct:
`{"prompt": "A beautiful landscape, high quality, masterpiece", "seed": 40128491}`

*If critical parameters are missing, politely ask the user. For example: "To generate the image you need, would you like a specific person or animal? Do you have an expected visual style?"*

### Step 2.5: Pre-flight Dependency Check (Automatic)

Before executing a workflow, **always** run a dependency check to verify that all required custom nodes and models are available on the ComfyUI server:

```bash
comfyui-skill --json deps check <server_id>/<workflow_id>
```

**Return format:**
```json
{
  "is_ready": false,
  "missing_nodes": [
    {"class_type": "SAMDetectorCombined", "can_auto_install": false}
  ],
  "missing_models": [
    {"filename": "model.safetensors", "folder": "checkpoints", "loader_node": "CheckpointLoaderSimple", "node_id": "4"}
  ],
  "total_nodes_required": 12,
  "total_nodes_installed": 11
}
```

**Agent behavior:**
1. If `is_ready` is `true` → proceed to Step 3 directly.
2. If `is_ready` is `false` → present the dependency report to the user in a clear, formatted message:
   - List missing custom nodes with package names and whether they can be auto-installed.
   - List missing models with filenames and which folder they belong to.
   - Ask the user: "Do you want me to install the missing custom nodes?"
3. If the user agrees to install, run:
   ```bash
   comfyui-skill --json deps install <server_id>/<workflow_id> --repos '["https://github.com/repo1", "https://github.com/repo2"]'
   ```
   Use the `source_repo` URLs from the dependency check report as `--repos` values. This returns installation results for each package. Report the results to the user.
   - If `needs_restart` is `true`, inform the user that ComfyUI needs to restart for changes to take effect.
   - After restart, re-run `check-deps` to confirm everything is resolved, then proceed to Step 3.
4. For missing models: inform the user that models must be downloaded manually, and tell them which folder to place the files in (e.g., "Please download `model.safetensors` and place it in the `checkpoints` folder").

### Step 3: Trigger the Image Generation Task

Once the complete parameters are collected and the dependency check passes, execute the workflow.

> **Note**: Outer curly braces must be wrapped in single quotes to prevent bash from incorrectly parsing JSON double quotes.

There are two execution modes. Choose based on your environment:

- **Interactive** (chat, messaging, or any context where the user is waiting): use `submit` + `status` so you can send progress updates between polls.
- **Non-interactive** (scripted pipelines, CI, or terminal-only): use the blocking one-shot mode for simplicity.

#### Interactive mode: `submit` + `status`

**Step 3a — Submit the job:**
```bash
comfyui-skill --json submit <server_id>/<workflow_id> --args '{"key1": "value1", "key2": 123}'
```
Returns immediately:
```json
{"status": "submitted", "prompt_id": "91f87917-3b0b-4d0f-8768-356f8d18c2e6"}
```

After receiving the response, tell the user that image generation has started.

**Step 3b — Poll for progress:**
```bash
comfyui-skill --json status <prompt_id>
```
Returns immediately with the current state:
- `{"status": "queued", "prompt_id": "...", "position": 2}` — waiting in line
- `{"status": "running", "prompt_id": "..."}` — ComfyUI is actively generating
- `{"status": "success", "prompt_id": "...", "outputs": [{"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"}]}` — done
- `{"status": "not_found", "prompt_id": "..."}` — job not found in queue or history
- `{"status": "error", "prompt_id": "...", "error": "..."}` — generation failed

**Polling pattern — this is critical for real-time feedback:**

Each `status` call must be a **separate tool invocation** (i.e., a separate bash command). Do NOT write a shell loop or combine multiple status checks into one command. The correct pattern is:

1. Run `status` as a standalone bash command.
2. Read the returned JSON.
3. If `"queued"` or `"running"`: **send a text message to the user** with the current progress (e.g., "Queued at position 2…", "Generating…"), then run `status` again as another standalone bash command.
4. If `"success"`: proceed to Step 4.
5. If `"error"`: report the error.

This ensures each progress update is delivered to the user immediately, rather than being batched at the end.

#### Non-interactive mode: one-shot blocking

```bash
comfyui-skill --json run <server_id>/<workflow_id> --args '{"key1": "value1", "key2": 123}'
```
Blocks until ComfyUI finishes, then returns the full result:
```json
{"status": "success", "prompt_id": "...", "outputs": [{"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"}]}
```

**Result format (both modes)**:
- On success: JSON with `prompt_id` and an `outputs` array containing ComfyUI output file references (filename, subfolder, type).
- On error: JSON with `error` code and message.

The manager stores execution history per workflow, including raw args, resolved args, prompt ID, result files, status, timing, and error summary. History records live under `data/<server_id>/<workflow_id>/history/`.

### Step 4: Send the Image to the User

Once you obtain the output filenames from the result, use your native capabilities to present the files to the user (e.g., in an OpenClaw environment, returning the path allows the client to intercept it and convert it into rich text or an image preview).

## Common Troubleshooting & Notices
1. **ComfyUI Offline**: If the CLI returns a connection error, run `comfyui-skill --json server status` and ask the user to start the ComfyUI service before retrying.
2. **Schema Not Found**: If you directly called a workflow the user mentioned verbally, but the CLI reports it not found, run `comfyui-skill --json list` and tell the user they need to first go to the Web UI panel to upload and configure the mapping for that workflow on the desired server.
3. **Parameter Format Error**: Ensure that the JSON passed via `--args` is a valid JSON string wrapped in single quotes.
4. **Cloud Node Unauthorized**: If a workflow fails with "Unauthorized: Please login first to use this node", the workflow uses ComfyUI cloud API nodes (e.g., Kling, Sora, Nano Banana). The user needs to configure a ComfyUI API Key in the server settings. Guide them to: (1) Go to https://platform.comfy.org to generate an API Key, (2) Open the Web UI panel → Server Settings → fill in the "ComfyUI API Key" field.
