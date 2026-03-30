# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.1] - 2026-03-30

### Added

- **ComfyUI API Key support** — New API Key field in server settings enables authentication for cloud API nodes such as Kling, Sora, and Nano Banana (#81, #83)

## [0.3.0] - 2026-03-30

### Added

- **Workflow dependency check & install** — Automatically detect missing custom nodes and models before execution, with one-click install (#76)
- **Non-blocking execution** — New `submit` + `status` commands with real-time progress feedback (#69)
- **Image upload API** — Upload images for use in workflows via the API layer (#64)
- **Batch workflow deletion** — Delete multiple workflows at once (#62)
- **Import preview** — Preview workflow content and parameters before importing from ComfyUI (#57)
- **Execution history** — Full records of each run including parameters, results, and timing (#43)

### Fixed

- **Parameters ignored** — User-supplied parameters (prompt, seed, etc.) were silently dropped; workflows always ran with defaults (#75)
- **Unmatched parameter warning** — Agent now receives a warning when passing parameter names not in the workflow schema (#71)
- **Subgraph node ID compatibility** — Fixed schema extraction failure for ComfyUI subgraph workflow exports (#63)
- **Queued job disappears** — History now correctly marks cancelled queued jobs as failed (#60)
- **UI startup recovery** — Auto-recover when UI fails to start after an update (#51)
- **Frontend cache stale** — Browser no longer loads outdated UI after an update (#49)
- **Python version detection** — Automatically find and use a compatible Python 3.10+ interpreter for UI startup (#58)
- **Merge conflict markers in JS** — Clean up leftover conflict markers in frontend bundles (#73)

### Improved

- Frontend assets continuously synced from upstream (#45 ~ #68, 12 syncs total)
- CI automation for frontend sync pipeline
- Update script now cleans up stale generated files

## [0.2.0] - 2026-03-16

### Changed

- Frontend source code moved to a [separate repository](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend). The main repo now ships only pre-built assets in `ui/static/`.

### Added

- `scripts/update_frontend.sh` — download the latest frontend build from GitHub Releases.

## [0.1.0] - 2025-03-09

Initial release.
