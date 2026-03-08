# GitHub and Search Discoverability Checklist (OpenClaw + ComfyUI + Skills + Xiao Long Xia)

> Goal: Improve visibility and click-through performance in Google Search, GitHub Search, and AI assistant retrieval.

## 1. Repository Metadata (Highest Priority)

- Write a complete, searchable sentence in GitHub `About`:
  - `ComfyUI Skills for OpenClaw: turn ComfyUI workflows into callable AI agent skills.`
- Configure repository topics (recommended: 8-12):
  - `openclaw`
  - `comfyui`
  - `comfyui-workflow`
  - `ai-agent`
  - `image-generation`
  - `skill`
  - `llm-tools`
  - `python`
  - `openclaw-skills`
  - `comfyui-skills`

## 2. README Structure

- Ensure core keywords appear naturally within the first 120 lines: `OpenClaw`, `ComfyUI`, `Skills`, `Xiao Long Xia`.
- Keep bilingual README files with cross-links between English and Chinese versions.
- Expand long-tail phrase coverage in `Use Cases` and `FAQ` sections (for example, `ComfyUI workflow automation`).

## 3. AI Assistant Retrieval Readiness

- Keep `docs/llms.txt` and `docs/llms-full.txt` aligned with the codebase.
- Update these files at every release:
  - Feature summary
  - Entry-point commands
  - Directory structure changes
- Link both files explicitly in README for easier model and indexer access.

## 4. Content and Release Cadence

- Publish a small release every 1-2 weeks (`Release` + `Changelog`).
- Include in every release:
  - One real workflow case (input parameters + output sample image)
  - One troubleshooting case (for example, handling `/prompt` 400 errors)
- Keep relevant keywords in commit messages (for example, `feat(comfyui-skill): add multi-server workflow routing`).

## 5. External Signals (Important for Google)

- Publish backlinking content on:
  - Personal blog (one full tutorial)
  - Chinese technical platforms (one Chinese tutorial)
  - X / Reddit / Discord community posts (English project intro)
- Build stable keyword and project-name co-occurrence:
  - `OpenClaw ComfyUI Skills`
  - `Xiao Long Xia ComfyUI Skills`

## 6. Measurable Metrics (Monthly Review)

- GitHub:
  - Whether target keywords appear in `Traffic -> Top search terms`
  - Star / Fork / Clone trends
- Google:
  - Number of indexed external articles
  - Whether branded queries rank in top 10 results
- AI assistants:
  - Whether tools such as ChatGPT / Claude / Gemini can correctly reference project name and core capabilities

## 7. Suggested 30-Day Execution Order

1. Finalize GitHub `About`, `Topics`, and social preview image.
2. Lock the first 120 README lines with clear keywords and value proposition.
3. Publish a `v0.x` release including one complete workflow example.
4. Publish two external posts (one Chinese, one English) with backlinks to GitHub.
5. Review GitHub traffic and adjust keyword phrasing at month end.
