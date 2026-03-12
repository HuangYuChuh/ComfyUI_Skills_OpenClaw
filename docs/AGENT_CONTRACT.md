# Agent Contract

This document describes the runtime contract that OpenClaw or any other agent consumes from this skill.

## Discovery

The skill must expose a root-level `SKILL.md`.

At runtime, the agent discovers callable workflows through:

```bash
python ./scripts/registry.py list --agent
```

### Success shape

```json
{
  "status": "success",
  "workflows": [
    {
      "server_id": "local",
      "server_name": "Local Mac",
      "workflow_id": "product-photo",
      "description": "Generate premium product shots",
      "target_count": 2,
      "targets": [
        {
          "server_id": "local",
          "server_name": "Local Mac",
          "visible": true
        },
        {
          "server_id": "cloud",
          "server_name": "Cloud GPU",
          "visible": true
        }
      ],
      "parameters": {
        "prompt": {
          "type": "string",
          "required": true,
          "description": "Positive prompt",
          "default": "studio product photo",
          "example": "premium watch on dark stone"
        }
      }
    }
  ]
}
```

### Debugging discovery

To inspect hidden workflows and invalid schema reasons:

```bash
python ./scripts/registry.py list --agent --all --debug
```

To diagnose full skill readiness:

```bash
python ./scripts/doctor.py
```

## Uninitialized Runtime State

Agents must treat the skill as **uninitialized** if any of these are true:

- `python ./scripts/registry.py list --agent` returns no visible workflows
- `python ./scripts/doctor.py` reports `no_servers`
- `python ./scripts/doctor.py` reports `no_enabled_servers`
- the user is clearly attempting first-time use and nothing runnable is available

In this state, the correct next step is **bootstrap**, not normal workflow execution.

Required behavior:

1. Do not ask the user for internal ids such as `server_id` or `workflow_id`.
2. Do not ask the user to edit `config.json` manually as the first next step.
3. Prefer opening the local UI with:
   ```bash
   python3 ./ui/open_ui.py
   ```
4. If a healthy server exists but no runnable workflow exists, prefer importing a starter workflow instead of pushing setup burden back to the user.
5. Only resume normal execution flow after at least one runnable workflow is visible in registry output.

User-facing framing should stay in business language such as:
- "绘图服务"
- "示例工作流"
- "配置面板"

## Execution

The agent executes a selected workflow through:

```bash
python ./scripts/comfyui_client.py --workflow <server_id>/<workflow_id> --args '{...json...}'
python ./scripts/comfyui_client.py --workflow <workflow_id> --args '{...json...}'
```

When only `<workflow_id>` is provided, the client resolves a healthy target across all visible server deployments for that logical workflow.

Normal execution assumes the skill is already initialized. If no runnable workflow is visible, the agent should return to bootstrap behavior instead of guessing a workflow id.

### Success shape

```json
{
  "status": "success",
  "server": "local",
  "server_type": "comfyui",
  "prompt_id": "abc123",
  "images": [
    "/abs/path/to/output.png"
  ]
}
```

### Failure shape

```json
{
  "error": "Human-readable failure message"
}
```

## Schema contract

Each workflow schema lives at `data/<server_id>/<workflow_id>/schema.json`.

Stable workflow-level fields:

- `workflow_id`
- `description`
- `enabled`
- `parameters`

Stable parameter-level fields:

- `node_id`
- `field`
- `type`
- `required`
- `description`

Optional parameter-level fields supported by the registry:

- `default`
- `example`
- `choices`

## Visibility rules

A workflow is agent-visible only if all of these are true:

- its server is enabled
- the workflow schema is enabled
- the schema is valid JSON
- the matching workflow file exists

If any of these fail, `registry.py list --agent` hides the workflow by default and `doctor.py` explains why.

If zero workflows remain visible after these rules are applied, the runtime should be treated as uninitialized from the agent's perspective.
