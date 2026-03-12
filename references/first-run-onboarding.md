# First-Run Onboarding Reference

Read this file when:
- the agent has no prior context about this skill instance
- the user is clearly using the skill for the first time
- the user asks to generate an image but no visible workflows are ready
- the user does not know what server, workflow, or mapping means

## Goal

Reduce first-run friction.

For first-time users, treat `Comfy Cloud` as:
- Comfy 官方提供的远程服务器
- a hosted cloud runtime, not the user's local ComfyUI process
- a different setup choice from self-hosted remote ComfyUI machines

The user should not need to understand:
- `registry.py`
- `schema.json`
- server ids
- logical workflow vs deployment target
- ComfyUI API format

Your job is to translate the current skill state into the smallest possible next step.

## Silent Bootstrap Sequence

Before asking the user anything substantial:

1. Run:
   ```bash
   python ./scripts/registry.py list --agent
   ```
2. If the result looks empty, broken, or suspicious, run:
   ```bash
   python ./scripts/doctor.py
   ```
3. Only expose the minimum useful conclusion to the user.

Do not dump raw diagnostics unless the user explicitly asks for them.

## First-Run Decision Tree

### Case 1: At least one visible workflow exists

Do this:
1. Pick the most relevant workflow from registry output.
2. Ask only for missing business parameters.
3. Execute the run.

Preferred user-facing style:
- "我可以直接帮你生成。你想要什么画面风格/主体？"
- not:
  "请选择 server_id 和 workflow_id。"

### Case 2: No visible workflows, but a healthy Cloud server exists

Do this:
1. Prefer a bundled Cloud starter template.
2. Import it.
3. Confirm it appears in the registry.
4. Offer to run it immediately.

Preferred user-facing style:
- "当前还没有可直接调用的工作流。我可以先帮你导入一个 Comfy Cloud 示例工作流，然后直接开始生成。"
- If clarification helps:
  "这里的 Comfy Cloud 指的是 Comfy 官方提供的云端服务器，不是你自己本地启动的 ComfyUI。"

Do not make the user manually understand templates unless they ask.

### Case 3: A server exists, but no workflow is configured

Do this:
1. Offer two simple next steps:
   - import a starter workflow
   - upload an existing ComfyUI API-format workflow
2. If the user does not know what to upload, prefer the starter workflow path.

Preferred user-facing style:
- "现在服务器已经有了，但还没有可调用工作流。我可以先导入一个示例工作流，或者你给我一个 ComfyUI 的 API 格式工作流。"

### Case 4: No usable server exists

Do this:
1. Say the environment is not ready yet.
2. Offer the shortest setup path.
3. Prefer opening the local UI when setup is needed.
4. Do not continue into workflow selection or parameter collection yet.

Preferred user-facing style:
- "现在还没有可用的绘图服务。我可以先帮你打开配置面板，你添加本地 ComfyUI 或 Comfy Cloud 后我再继续。"
- If the user looks unsure what Cloud means:
  "Comfy Cloud 就是 Comfy 官方提供的远程 / 云端服务器；如果你是自己部署的机器，通常应当按普通 ComfyUI 服务器来配置。"

If the user explicitly prefers Cloud, guide toward Cloud.
If the user explicitly prefers local, guide toward local.

This is a hard branch, not a soft suggestion.
If there is no usable server, the next action should be setup, not generation.

## Conversation Rules

When the user is new:

- Do not start by asking them for `server_id`.
- Do not start by asking them for `workflow_id`.
- Do not start by asking them to read docs.
- Do not mention `schema` unless you are already in a maintenance/debugging conversation.

Instead, translate to user language:

- `server` -> "绘图服务" / "运行环境"
- `workflow` -> "可调用模板" / "绘图流程"
- `mapping` -> "我可以控制的参数"

## Minimal First Reply Pattern

If the user says something broad like "帮我生成一张图":

1. silently inspect registry readiness
2. choose one of these replies:

- ready-to-run:
  "可以，我直接帮你生成。你想画什么主体，偏什么风格？"
- import-starter:
  "现在还没有现成可调用流程，我可以先导入一个示例工作流，然后直接帮你生成。"
- setup-needed:
  "当前还没有可用绘图服务。我可以先帮你打开配置面板，把本地 ComfyUI 或 Comfy Cloud 接好。"

When `setup-needed` applies, do not ask for prompts, style, or workflow choice first.

## Preferred Automation Bias

When the path is safe, prefer doing the setup work for the user instead of turning setup into homework.

Good examples:
- import a bundled Cloud starter template automatically
- open the local UI automatically when setup is required
- choose a healthy target automatically when the user does not care about environment

Bad examples:
- asking the user to manually inspect `config.json`
- asking the user to choose among internal workflow ids on the first turn
- forcing the user to understand storage layout before any image can be generated
