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
1. Check the existing server configurations or default to `local`.
2. Save the provided JSON file to `./data/<server_id>/workflows/<new_workflow_id>.json`.
3. Analyze the JSON structure (look for `inputs` inside node definitions, e.g., `KSampler`'s `seed`, `CLIPTextEncode`'s `text` for positive/negative prompts, `EmptyLatentImage` for width/height).
4. Automatically generate a schema mapping file and save it to `./data/<server_id>/schemas/<new_workflow_id>.json`. The schema format must follow:
   ```json
   {
     "workflow_id": "<new_workflow_id>",
     "server_id": "<server_id>",
     "description": "Auto-configured by OpenClaw",
     "enabled": true,
     "parameters": {
       "prompt": { "node_id": "3", "field": "text", "required": true, "type": "string", "description": "Positive prompt" }
       // Add other sensible parameters that the user might want to tweak
     }
   }
   ```
5. Tell the user that the new workflow on the specific server is successfully configured and ready to be used.

### Step 1: Query Available Workflows (Registry)

Before attempting to generate any image, you must **first query the registry** to understand which workflows are currently supported and enabled:
```bash
python ./scripts/registry.py list --agent
```

**Return Format Parsing**:
You will receive a JSON containing all available workflows. Notice they are uniquely identified by a combination of `server_id` and `id` (or path format `<server_id>/<workflow_id>`):
- For parameters with `required: true`, if the user hasn't provided them, you must **ask the user to provide them**.
- For parameters with `required: false`, you can infer and generate them yourself based on the user's description (e.g., translating and optimizing the user's scene), or simply use empty values/random numbers (e.g., `seed` = random number).
- Never expose underlying node information to the user (do not mention Node IDs); only ask about business parameter names (e.g., prompt, style).
- If multiple workflows match the user prompt across different servers, you may list them acting as candidates, OR simply pick the most relevant one and execute it directly to provide the best user experience.

### Step 2: Parameter Assembly and Interaction

Once you have identified the workflow to use and collected/generated all necessary parameters, you need to assemble them into a compact JSON string.
For example, if the schema exposes `prompt` and `seed`, you need to construct:
`{"prompt": "A beautiful landscape, high quality, masterpiece", "seed": 40128491}`

*If critical parameters are missing, politely ask the user using `notify_user`. For example: "To generate the image you need, would you like a specific person or animal? Do you have an expected visual style?"*

### Step 3: Trigger the Image Generation Task

Once the complete parameters are collected, execute the workflow client in a command-line environment (ensure your current working directory is the project root, or navigate to it first).

Pass the full identifier as `<server_id>/<workflow_id>`.

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
1. **ComfyUI Offline**: If the script returns "Error connecting to ComfyUI", remind the user to check if the ComfyUI service is running on the specific server, or go to the Web UI panel (start with `python3 ./ui/open_ui.py`, `python3 ui/app.py`, or `./run_ui.sh`) to adjust the server configuration URLs.
2. **Schema Not Found**: If you directly called a workflow the user mentioned verbally, but the script reports a missing Schema, perform Step 1 `registry.py` and tell the user they need to first go to the Web UI panel to upload and configure the mapping for that workflow on the desired server.
3. **Parameter Format Error**: Ensure that the JSON passed via `--args` is a valid JSON string wrapped in single quotes.
