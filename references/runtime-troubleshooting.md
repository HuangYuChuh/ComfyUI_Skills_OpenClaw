# Runtime Troubleshooting Reference

Read this file when:
- workflow execution fails
- the registry is missing a workflow you expected
- a configured server appears offline or unreachable
- a Cloud server refuses authentication
- a workflow is hidden from `registry.py list --agent`

## First-Line Diagnostics

Start with these two commands:

```bash
python ./scripts/registry.py list --agent
python ./scripts/doctor.py
```

Use deeper inspection when needed:

```bash
python ./scripts/registry.py list --agent --all --debug
python ./scripts/doctor.py --json
```

Use them in this order:
1. `registry.py list --agent` to see what the agent can currently use
2. `doctor.py` to see whether server health or config issues are blocking execution
3. `registry.py list --agent --all --debug` when a workflow seems to exist on disk but is hidden

## How To Read `doctor.py`

`doctor.py` checks two major things:

- server readiness
- workflow registry visibility

Typical server-side error codes:

- `server_url_missing`
- `server_unreachable`
- `server_http_error`
- `cloud_api_key_env_missing`
- `cloud_api_key_missing`
- `cloud_unreachable`
- `cloud_http_error`
- `server_disabled`
- `no_servers`
- `no_enabled_servers`

Interpretation:

- local server errors usually mean the ComfyUI instance is not running or the URL is wrong
- Cloud key errors usually mean `api_key_env` is unset or the configured key is invalid
- disabled server warnings mean the server exists but is intentionally excluded from routing

## How To Read Hidden Workflow Reasons

`registry.py list --agent --all --debug` exposes hidden workflows and their reasons.

Common hidden reasons:

- `server_disabled`
- `workflow_disabled`
- `workflow_missing`
- `invalid_schema`

Interpretation:

- `server_disabled`:
  the workflow exists on disk but its server is disabled
- `workflow_disabled`:
  the schema exists but the workflow is intentionally disabled
- `workflow_missing`:
  the schema exists but `workflow.json` is missing
- `invalid_schema`:
  `schema.json` could not be parsed or its structure is invalid

## Common Failure Cases

### Local ComfyUI Offline

Symptoms:
- connection errors against local ComfyUI
- `server_unreachable`
- `server_http_error`

Actions:
1. Check the configured local server URL.
2. Ask the user to start ComfyUI if it is not running.
3. If a healthy Cloud target exists for the same logical workflow and the user did not insist on local, prefer that Cloud target.

### Cloud Auth Failure

Symptoms:
- `cloud_api_key_missing`
- `cloud_api_key_env_missing`
- `cloud_http_error`
- Cloud calls fail at `/api/user` or workflow submit time

Actions:
1. Check the configured `comfy_cloud` server entry in `config.json`.
2. Prefer `api_key_env` over direct `api_key`.
3. Do not ask the user to paste secrets into chat.
4. Point the user to the local UI to fix the Cloud server config.

### Workflow Missing From Registry

Symptoms:
- user expects a workflow that is not shown in `registry.py list --agent`

Actions:
1. Run `python ./scripts/registry.py list --agent --all --debug`.
2. Check whether the workflow folder contains both `workflow.json` and `schema.json`.
3. Check whether the schema is valid.
4. Check whether the workflow or its server is disabled.

### Schema Problems

Symptoms:
- workflow hidden due to `invalid_schema`
- runtime cannot map user args to workflow inputs

Actions:
1. Re-open the saved workflow in the UI editor if possible.
2. Verify `schema.json` contains valid `parameters`.
3. If needed, regenerate the mapping using the workflow registration flow.

### Wrong Target Selected

Symptoms:
- the job ran on local when the user expected Cloud
- the job ran on Cloud when the user expected local

Actions:
1. If the user explicitly asked for an environment, use explicit `<server_id>/<workflow_id>`.
2. If the user did not care about environment, bare logical `workflow_id` is valid.
3. For more routing detail, read `references/cloud-routing.md`.

## Escalation Guidance

Use the local UI when:
- the user needs to fix server config
- a workflow mapping needs to be re-edited
- a workflow is present but its schema needs manual cleanup

Use workflow re-registration when:
- `workflow.json` and `schema.json` are out of sync
- the workflow was upgraded and old mappings are no longer safe
- the workflow folder exists but the schema is clearly invalid
