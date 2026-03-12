# Cloud Example Workflows Reference

Read this file when:
- the user asks for example Cloud workflows
- the user wants starter workflows or runnable Cloud templates
- you need to import a Cloud example before execution

## Template Sources

Use these sources:

- `bundled`: curated starter templates that ship with this repo and usually import cleanly
- `official`: broader template catalog sourced from Comfy Cloud docs / APIs

Prefer `bundled` first unless the user explicitly wants the official catalog or a specific documented template.

## List Available Templates

```bash
python ./scripts/cloud_templates.py list --source bundled
python ./scripts/cloud_templates.py list --source official
```

If the user wants examples for a specific Cloud server, make sure the server exists in `config.json` and is a `comfy_cloud` target.

## Import a Runnable Template

Bundled example:

```bash
python ./scripts/cloud_templates.py import --server <server_id> --source bundled --template text_to_image_square
```

Official example:

```bash
python ./scripts/cloud_templates.py import --server <server_id> --source official --template <template_id>
```

After import:
1. Refresh the registry or workflow list.
2. Confirm the imported workflow is visible and enabled.
3. Run it through `comfyui_client.py`.

## Execution Guidance

After import, decide whether to run with:

- explicit target: `<server_id>/<workflow_id>`
- logical workflow only: `<workflow_id>`

Use explicit target when the user explicitly asked for Cloud or a named server.
Use logical workflow only when the imported workflow shares the same logical identity across multiple servers and the user did not specify environment.

## Interpretation Rules

Explain imported workflows like this:

- `server-specific deployment`: only one target exists for that logical workflow
- `multi-target logical workflow`: the same logical workflow is deployable on multiple servers

If a bundled or official Cloud template ends up sharing a logical workflow id with a local workflow, keep the logical workflow identity stable and route by target at execution time.

## Common Failures

- `Cloud Template Missing`:
  Check both bundled and official lists before concluding the example does not exist.
- `Import Conflict`:
  Re-run import with overwrite only when the user clearly wants to replace the existing deployment.
- `Imported But Not Runnable`:
  Refresh registry output and inspect the target server health before retrying execution.
