# Cloud Routing Reference

Read this file when any of the following is true:
- the user explicitly asks to use Comfy Cloud
- the same logical workflow exists on both local and cloud targets
- you need to decide how to route a run across multiple targets
- you need to reason about Cloud API key handling or Cloud auth failures
- you need Cloud documentation that is not already encoded in this repo

## Registry Interpretation

`python ./scripts/registry.py list --agent` returns logical workflows.

- A logical `workflow_id` may have multiple deployable `targets`.
- The top-level `server_id` / `server_name` is a compatibility default, not an exclusive runtime target.
- Choose the logical workflow first, then choose the target.

Use this routing order:
1. Identify the best logical workflow for the user's goal.
2. Inspect `targets` for deployment options.
3. If the user explicitly asked for cloud, local, or a named server, choose that matching target.
4. If the user did not specify environment, pass the bare logical `workflow_id` and let `comfyui_client.py` resolve a healthy target.

Use explicit `<server_id>/<workflow_id>` when:
- the user explicitly asked for cloud
- the user explicitly asked for local
- the user named a server
- you must force execution into a particular environment

Use bare logical `<workflow_id>` when:
- the same logical workflow exists on multiple servers
- the user did not care where it runs
- you want the runtime to pick a healthy target automatically

## Cloud Target Rules

When the selected target is a `comfy_cloud` server:

1. Treat the URL as `https://cloud.comfy.org` unless the config explicitly points elsewhere.
2. Prefer `api_key_env` over storing `api_key` directly in `config.json`.
3. Never print, echo, summarize, or expose the raw API key.
4. If Cloud auth fails, direct the user to fix the configured Cloud server in the local UI rather than asking them to paste secrets into chat.
5. If partner nodes are involved, rely on the server's `use_api_key_for_partner_nodes` behavior instead of inventing a second auth flow.

## Cloud Fallback Behavior

If the same logical workflow exists on both local and cloud:

- If the user explicitly asked for Cloud, force the Cloud target.
- If the user explicitly asked for Local, force the local target.
- If the user did not specify environment, bare `workflow_id` is preferred.
- If local appears offline and a healthy Cloud target exists for the same logical workflow, prefer Cloud over failing early.

Do not assume the configured default server must run the job. Default server only matters as a tie-breaker when multiple healthy candidates exist and the user gave no routing preference.

## Cloud Documentation Rule

If the user asks for Cloud docs, Cloud API details, or anything that depends on current Comfy docs:

1. Fetch the documentation index first:
   `https://docs.comfy.org/llms.txt`
2. Use that file to discover the relevant Comfy Cloud documentation pages before exploring further.
3. Prefer documentation pages discovered from that index over ad hoc searching.

## Common Failures

- `Cloud Key Misconfiguration`:
  Check whether the selected `comfy_cloud` server has `api_key_env` or `api_key` configured in `config.json`. Recommend `api_key_env`.
- `Wrong Server Chosen`:
  If multiple targets exist, use an explicit `<server_id>/<workflow_id>` for cloud/local-specific requests.
- `Workflow Missing From Registry`:
  Run `python ./scripts/registry.py list --agent --all --debug` or `python ./scripts/doctor.py`.
