# Workflow Registration Reference

Read this file when:
- the user gives you a new ComfyUI workflow JSON and asks to configure, add, or register it
- you need to save or update a workflow in local skill storage
- you need to understand workflow folder layout
- you need to reason about `schema_params` vs `ui_schema_params`
- you need to rename, overwrite, or upgrade an existing workflow

## Storage Layout

Workflows are stored per server and per workflow:

- `data/<server_id>/<workflow_id>/workflow.json`
- `data/<server_id>/<workflow_id>/schema.json`

This is the current layout. Do not use the old `data/<server_id>/workflows/` or `data/<server_id>/schemas/` layout for new writes.

`workflow.json` stores the ComfyUI API-format workflow payload.

`schema.json` stores:
- workflow description
- enabled state
- agent-facing parameter mapping
- UI-facing parameter mapping
- optional metadata such as workflow origin, tags, or deployment metadata

## Server And Workflow Identity

- `server_id` identifies the runtime target environment.
- `workflow_id` identifies the deployment inside that server namespace.
- Runtime execution can use explicit `<server_id>/<workflow_id>` or a bare logical `workflow_id` depending on routing needs.

For registration, always decide the target server first.

Use this rule:
1. If the user explicitly names a server, use it.
2. If the user is working on a currently selected server in the UI, use that server.
3. Otherwise default to `local`.

Do not invent a Cloud server implicitly if none is configured.

## What To Save

When registering a new workflow:

1. Save the API-format workflow JSON as `workflow.json`.
2. Generate an agent-facing parameter mapping.
3. Generate or preserve a UI-facing mapping if available.
4. Save both into `schema.json`.

The minimal schema content is:

```json
{
  "description": "Auto-configured by OpenClaw",
  "enabled": true,
  "parameters": {},
  "ui_parameters": {}
}
```

## `schema_params` vs `ui_schema_params`

These two concepts are related but not identical:

- `schema_params`:
  compact agent-facing mapping used by runtime execution
- `ui_schema_params`:
  richer UI mapping used by the editor for exposed state, aliases, defaults, examples, and editing experience

When saving through the backend API:

- `schema_params` becomes `parameters` in `schema.json`
- `ui_schema_params` becomes `ui_parameters` in `schema.json`

When loading workflow detail:

- the UI reads `ui_parameters` first
- if `ui_parameters` is missing, it falls back to `parameters`

If you only have one mapping, write it to `parameters` and keep `ui_parameters` empty or aligned.

## Suggested Parameter Extraction

For auto-registration, inspect common editable inputs such as:

- positive prompt text
- negative prompt text
- seed
- steps
- cfg
- denoise
- width
- height
- batch size
- filename prefix
- uploaded image or mask inputs

Expose only parameters the user is likely to control. Do not dump every node input into the schema.

Never ask the user about raw node ids. Use business names like `prompt`, `negative_prompt`, `seed`, or `image`.

## Save And Update Behavior

The save API is:

```text
POST /api/servers/{server_id}/workflow/save
```

Relevant fields:

- `workflow_id`: target workflow id
- `server_id`: target server id
- `original_workflow_id`: existing workflow id when renaming or upgrading
- `overwrite_existing`: whether replacing a conflicting target is allowed
- `workflow_data`: workflow payload
- `schema_params`: runtime mapping
- `ui_schema_params`: editor mapping

Behavior rules:

- New save to a new id:
  writes a new workflow folder
- Save to an existing id without overwrite:
  returns a conflict
- Save with `original_workflow_id` equal to the old id and a new `workflow_id`:
  behaves like rename / replacement and removes the old folder after success
- Save with `overwrite_existing=true`:
  replaces the target deployment

## Workflow Upgrade Handling

If the user uploads a new version of an existing workflow:

1. Load the old workflow detail first if available.
2. Rebuild schema candidates from the new workflow.
3. Preserve compatible mappings when possible.
4. Mark uncertain matches for review instead of silently misbinding them.

If the workflow structure changed significantly, prefer preserving only safe mappings and telling the user that some parameters may need review.

## Cloud Template Imports

Cloud template import also ends up creating workflow folders in the same storage layout.

That means bundled templates, official Cloud templates, and local uploads all converge into the same local registry format after import.

Treat imported Cloud templates as regular stored workflows with additional metadata, not as a separate storage system.

## Common Mistakes

- Writing into legacy `workflows/` or `schemas/` directories
- Saving editor-only mapping as the only runtime mapping without preserving `parameters`
- Treating `workflow_id` as globally unique across all servers
- Overwriting an existing workflow without explicit intent
- Renaming a workflow but leaving the old folder behind
