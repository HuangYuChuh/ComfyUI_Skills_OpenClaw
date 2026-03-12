---
name: comfyui-skill-openclaw
description: |
  Generate images utilizing ComfyUI's powerful node-based workflow capabilities. Supports dynamically loading multiple pre-configured generation workflows from different instances and their corresponding parameter mappings, converting natural language into parameters, driving local or remote ComfyUI services, and ultimately returning the images to the target client.
  
  **Use this Skill when:**
  (1) The user requests to "generate an image", "draw a picture", or "execute a ComfyUI workflow".
  (2) The user has specific stylistic, character, or scene requirements for image generation.
---

# ComfyUI Agent SKILL

## Core Execution Specification

As an OpenClaw Agent equipped with the ComfyUI skill, your objective is to translate the user's conversational requests into strict, structured parameters and hand them over to the underlying Python scripts to execute workflows across multi-server environments.

## Optional References

Read these only when needed:

- Cloud routing, key handling, Cloud docs, or local-vs-cloud target selection:
  [references/cloud-routing.md](./references/cloud-routing.md)
- Cloud example workflows, starter templates, or Cloud template import flow:
  [references/cloud-examples.md](./references/cloud-examples.md)
- Workflow registration, folder layout, schema persistence, or workflow upgrade handling:
  [references/workflow-registration.md](./references/workflow-registration.md)
- Runtime diagnostics, hidden workflow reasons, or execution failures:
  [references/runtime-troubleshooting.md](./references/runtime-troubleshooting.md)
- First-time user handling, empty-registry bootstrap, or zero-context onboarding:
  [references/first-run-onboarding.md](./references/first-run-onboarding.md)

## First-Run Rule

Assume the user does not understand this skill's internal model on the first turn.

Before asking the user about workflow ids, servers, mappings, or setup details:
1. inspect current skill readiness
2. reduce the next step to the smallest user-facing choice
3. prefer doing safe bootstrap work for the user

If the skill has no visible workflows, or the user is clearly new, read [references/first-run-onboarding.md](./references/first-run-onboarding.md).

## Uninitialized Environment Branch

Treat the environment as **uninitialized** if any of these are true:

- `python ./scripts/registry.py list --agent` returns no visible workflows
- `python ./scripts/doctor.py` reports `no_servers` or `no_enabled_servers`
- the user is clearly trying to use the skill for the first time and nothing runnable is available

When the environment is uninitialized, do not continue with normal generation flow yet.

You must do this instead:
1. identify whether the shortest path is:
   - open UI for setup
   - import a starter workflow into an already healthy server
   - guide the user to choose local or Cloud as the runtime
2. translate the problem into user language such as "绘图服务", "示例工作流", or "配置面板"
3. avoid asking for internal ids or implementation details
4. prefer doing the safe bootstrap action yourself

Hard rules in this branch:
- Do not ask the user for `server_id`.
- Do not ask the user for `workflow_id`.
- Do not ask the user to edit `config.json` manually as the first next step.
- Prefer `python3 ./ui/open_ui.py` when the user has no usable server yet.
- If a healthy Cloud server exists but no workflow exists, prefer importing a bundled Cloud starter workflow.
- Only return to normal workflow execution after at least one runnable workflow becomes visible.

### UI Management Shortcut

If the user asks you to open, launch, or bring up the local Web UI for this skill, run:

```bash
python3 ./ui/open_ui.py
```

This command will:
- reuse the UI if it is already running
- start it in the background if it is not running
- try to open the browser to the local dashboard automatically

### Step 0: AI-Native Workflow Auto-Configuration (Optional)

If the user provides you with a new ComfyUI workflow JSON (API format) and asks you to "configure it" or "add it":
1. Read [references/workflow-registration.md](./references/workflow-registration.md).
2. Decide the target server, defaulting to `local` only when no better server choice exists.
3. Save the workflow into the current storage layout.
4. Generate a sensible parameter mapping instead of exposing raw node structure.
5. Tell the user which server received the workflow and whether it was a new save, overwrite, rename, or upgrade.

### Step 1: Query Available Workflows (Registry)

Before attempting to generate any image, you must **first query the registry** to understand which workflows are currently supported and enabled:
```bash
python ./scripts/registry.py list --agent
```

If you suspect the skill is misconfigured or the expected workflow is missing, run:
```bash
python ./scripts/doctor.py
```

**Return Format Parsing**:
You will receive a JSON containing logical workflows. A single logical `workflow_id` may expose multiple deployable targets under `targets`.

Additional handling rules:
- For parameters with `required: true`, if the user hasn't provided them, you must **ask the user to provide them**.
- For parameters with `required: false`, you can infer and generate them yourself based on the user's description (e.g., translating and optimizing the user's scene), or simply use empty values/random numbers (e.g., `seed` = random number).
- Never expose underlying node information to the user (do not mention Node IDs); only ask about business parameter names (e.g., prompt, style).
- If multiple logical workflows match the user prompt, you may list them as candidates, OR simply pick the most relevant one and execute it directly.
- If this is a first-run or empty-registry situation, read [references/first-run-onboarding.md](./references/first-run-onboarding.md) before turning the problem back to the user.
- If target routing matters, or the user explicitly mentions local vs cloud, read [references/cloud-routing.md](./references/cloud-routing.md).
- If the user asks for example Cloud workflows or starter templates, read [references/cloud-examples.md](./references/cloud-examples.md).

### Step 2: Parameter Assembly and Interaction

Once you have identified the workflow to use and collected/generated all necessary parameters, you need to assemble them into a compact JSON string.
For example, if the schema exposes `prompt` and `seed`, you need to construct:
`{"prompt": "A beautiful landscape, high quality, masterpiece", "seed": 40128491}`

*If critical parameters are missing, politely ask the user using `notify_user`. For example: "To generate the image you need, would you like a specific person or animal? Do you have an expected visual style?"*

### Step 3: Trigger the Image Generation Task

Once the complete parameters are collected, execute the workflow client in a command-line environment (ensure your current working directory is the project root, or navigate to it first).

Use one of these forms:
- Explicit target: `<server_id>/<workflow_id>` when the user asked for a specific server or environment
- Logical workflow only: `<workflow_id>` when the same workflow exists on multiple servers and you want the client to auto-pick a healthy target

> **Note**: Outer curly braces must be wrapped in single quotes to prevent bash from incorrectly parsing JSON double quotes.

```bash
python ./scripts/comfyui_client.py --workflow <server_id>/<workflow_id> --args '{"key1": "value1", "key2": 123}'
```

**Blocking and Result Retrieval**:
- This script will automatically submit the task to the matched server and **poll to wait** for ComfyUI to finish rendering, then download the image locally.
- If executed successfully, the standard output of the script will finally provide a JSON containing an `images` list, where the absolute paths are the generated image files.

### Step 4: Send the Image to the User

Once you obtain the absolute local path to the generated image, use your native capabilities to present the file to the user (e.g., in an OpenClaw environment, returning the path allows the client to intercept it and convert it into rich text or an image preview).

## Common Troubleshooting & Notices
1. Start with `python ./scripts/registry.py list --agent`.
2. If runtime readiness is questionable, run `python ./scripts/doctor.py`.
3. If a workflow seems missing, run `python ./scripts/registry.py list --agent --all --debug`.
4. If execution arguments fail to apply, verify the JSON passed to `--args` is valid and wrapped in single quotes.
5. For detailed execution or visibility failures, read [references/runtime-troubleshooting.md](./references/runtime-troubleshooting.md).
6. For Cloud or multi-target routing issues, read [references/cloud-routing.md](./references/cloud-routing.md).
7. For Cloud example workflow import issues, read [references/cloud-examples.md](./references/cloud-examples.md).
8. For workflow save, overwrite, rename, or upgrade issues, read [references/workflow-registration.md](./references/workflow-registration.md).
9. For first-time-user setup, empty registry, or "how do I even start" situations, read [references/first-run-onboarding.md](./references/first-run-onboarding.md).
