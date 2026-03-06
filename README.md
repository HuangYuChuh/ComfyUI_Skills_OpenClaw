# ComfyUI_Skills_OpenClaw

`ComfyUI_Skills_OpenClaw` is an open-source project for exposing curated ComfyUI workflows as callable capabilities for OpenClaw.

## Vision

Build a practical bridge between:

- **ComfyUI** (workflow orchestration for image generation and post-processing)
- **OpenClaw** (agent runtime and tool/skill invocation)

So OpenClaw can execute selected ComfyUI workflows reliably through a clean, reusable interface.

## What this repository will contain

- A structured workflow registry (text-to-image, image-to-image, upscaling, utility flows)
- Skill/MCP-facing adapters for invoking ComfyUI workflows
- Parameter schemas and presets for safe invocation
- Runtime helpers (queueing, polling, artifact collection)
- Prompt and style templates for repeatable generation

## Initial scope

1. Register local ComfyUI workflows
2. Define a stable invocation contract for OpenClaw
3. Execute a workflow from OpenClaw and return generated assets
4. Add logging and failure handling for production use

## Status

🚧 Bootstrapping repository.

Core implementation is planned next.

## Planned repository structure

```text
/workflows
/adapters
/skills
/mcp
/examples
/docs
```

## Contribution

Contributions are welcome after the first stable invocation path is published.

## License

To be decided in the first implementation milestone.
