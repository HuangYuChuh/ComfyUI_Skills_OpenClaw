# Workflow Import Reference

Use this reference only when the user is asking to register workflows into the skill instead of executing an already configured workflow.

## When to use which path

- Use ComfyUI bulk import when the user wants all saved workflows from a configured ComfyUI server.
- Use local bulk import when the user already has multiple JSON files or a local folder.
- Use single-workflow configuration when the user provides one workflow and wants a targeted setup.

## Manager API routes

### Import all saved workflows from ComfyUI

```http
POST /api/servers/{server_id}/workflows/import/comfyui
```

Preconditions:

- The target server must already exist in manager config.
- The server must have a valid `url`.
- The ComfyUI server should be reachable because editor-format conversion depends on `/object_info`.

Behavior:

- Reads saved workflow JSON files from ComfyUI `/userdata`.
- Accepts both API workflow JSON and editor workflow JSON.
- Converts editor workflow JSON to API workflow JSON through ComfyUI `/object_info`.
- Extracts a recommended schema automatically.
- Auto-renames conflicting workflow IDs instead of overwriting silently.
- Persists import metadata such as origin and source label.

### Import local JSON files

```http
POST /api/servers/{server_id}/workflows/import/local
Content-Type: application/json

{
  "files": [
    {
      "file_name": "my-workflow.json",
      "content": "{...raw json string...}"
    }
  ]
}
```

Behavior:

- Applies the same workflow normalization as the ComfyUI bulk import route.
- Processes files independently so partial success is allowed.
- Fails only the individual files that have invalid JSON or unsupported workflow data.
- Prefer this route over manual file placement when the JSON content is already available.

## UI entry points

- Server section: `Import All from ComfyUI`
- Workflow section: `Import Local Files`
- Workflow section: `Import Local Folder`

## Import report semantics

The bulk import response returns a report with summary counts and per-item results.

- `created`: imported with the suggested workflow ID
- `renamed`: imported after auto-renaming due to an ID conflict
- `skipped`: nothing importable was found for that source
- `failed`: the source could not be parsed, normalized, or saved

## Agent guidance

- If the user says "import all my saved workflows", prefer the ComfyUI bulk import route.
- If the user uploads a folder or several JSON files, prefer the local bulk import route.
- If the user only wants to execute a workflow, do not import first unless configuration is actually missing.
- Do not expose node IDs to the user unless they explicitly ask for internal workflow details.
