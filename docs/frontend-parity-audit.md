# Frontend Parity Audit

Date: 2026-03-12

## Scope

This audit compares the current React frontend in `frontend/src` against the last static frontend implementation preserved in git history under `ui/static/*`.

Reference sources used during review:

- Current frontend:
  - `frontend/src/App.tsx`
  - `frontend/src/features/servers/ServerManager.tsx`
  - `frontend/src/features/workflows/WorkflowManager.tsx`
  - `frontend/src/features/editor/EditorView.tsx`
  - `frontend/src/components/ui/Modal.tsx`
  - `frontend/src/components/ui/ConfirmDialog.tsx`
  - `frontend/src/components/ui/CustomSelect.tsx`
  - `frontend/src/styles.css`
- Historical static frontend reviewed from git history:
  - `git show HEAD:ui/static/index.html`
  - `git show HEAD:ui/static/styles.css`
  - `git show HEAD:ui/static/js/app.js`
  - `git show HEAD:ui/static/js/workflow-list-view.js`
  - `git show HEAD:ui/static/js/mapping-editor-view.js`
  - `git show HEAD:ui/static/js/custom-select.js`

## Automated Validation

Validated successfully on the current React frontend:

- `cd frontend && npm test`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

Current automated coverage includes:

- main editor flow
- save shortcut guard
- upload -> mapping transition
- workflow more-menu behavior
- drag reorder behavior
- server delete confirm branches
- server modal rendering and focus behavior

## Browser-Level Validation

An actual local browser pass was completed against the running FastAPI-served UI at `http://127.0.0.1:8189`.

Captured screenshots:

- [main-dashboard.png](/Users/lgldl/Desktop/work/ComfyUI_Skills_OpenClaw/docs/parity-screenshots/main-dashboard.png)
- [add-server-modal.png](/Users/lgldl/Desktop/work/ComfyUI_Skills_OpenClaw/docs/parity-screenshots/add-server-modal.png)
- [editor-mapped.png](/Users/lgldl/Desktop/work/ComfyUI_Skills_OpenClaw/docs/parity-screenshots/editor-mapped.png)
- [confirm-leave-modal.png](/Users/lgldl/Desktop/work/ComfyUI_Skills_OpenClaw/docs/parity-screenshots/confirm-leave-modal.png)

Verified in-browser:

- main dashboard visual structure matches the historical layout direction:
  - branded header
  - server manager card
  - workflow manager card
  - dark glass surface styling
- editor flow renders as expected:
  - back nav
  - three-step stepper
  - upload zone
  - mapping toolbar
  - node cards
  - save bar
- confirm dialog styling and overlay behavior render correctly in a real browser
- add-server modal focus was browser-verified to land on the server ID field after the follow-up parity fix

Follow-up parity fixes applied after the initial browser pass:

- modal initial focus now matches the historical behavior:
  - add-server modal focuses the server ID field
  - edit-server modal focuses the server name field
  - confirm dialog focuses the confirm action
- modal rendering now uses a body-level portal with a higher overlay layer, preventing the page cards from visually covering the dialog

## Parity Status

### Confirmed Aligned

- Main page structure is still split into the same two user-facing views:
  - dashboard view
  - workflow editor view
- Header, branding, language switcher, server manager card, workflow manager card, editor stepper, upload zone, mapping toolbar, node cards, save bar, modal shells, confirm dialog, toast rail, and pixel background all remain present in the React implementation.
- Workflow list behavior remains aligned:
  - search
  - sort modes
  - drag reorder in custom mode only
  - enable / disable toggle
  - edit
  - more-menu with upload-new-version and delete
- Editor behavior remains aligned:
  - upload workflow JSON
  - auto-suggest workflow ID
  - node and parameter filtering
  - expose / unexpose batch actions
  - collapse / expand nodes
  - save confirmation branches
  - `/` focus search and `Esc` clear search
- Custom select behavior is functionally preserved:
  - trigger button
  - body-level menu portal/attachment
  - outside click close
  - `Escape` close
  - arrow-key cycling
  - host z-index elevation
- Recent parity fixes already applied:
  - server name now falls back to server ID on submit
  - server edit now blocks empty URL at the frontend
  - mapping empty state now distinguishes true-empty vs filtered-empty
  - modal autofocus now matches the historical static frontend flow
  - modal stacking now renders above page cards instead of inside page-level stacking contexts

### Remaining Non-1:1 Differences

#### 1. Visual parity is not yet proven by baseline regression evidence

What exists:

- source review
- unit/integration tests
- successful production build
- browser screenshots of current key states

What is still missing:

- screenshot regression tests against a fixed baseline
- DOM snapshot comparison against the historical static frontend
- Playwright-style interaction proof for layout and focus order

Impact:

- current status can be described as "source-aligned and behaviorally close"
- but not "visually proven 1:1"

## Recommended Next Steps

1. Add screenshot regression tests against a committed baseline.
2. Add a lightweight browser-level parity pass:
   - screenshot key states
   - verify tab order for modal and toolbar controls

## Bottom Line

The current frontend is now close to historical parity for the core local workflow UI, and the previously confirmed functional mismatches have been fixed.

It is still not accurate to call the frontend strict `1:1` parity because visual parity has not yet been proven with baseline regression checks.
