---
title: Getting Started
description: Install ComfyUI Skills for OpenClaw, connect your first ComfyUI server, upload a workflow, and verify that the skill can generate images.
permalink: /getting-started/
---

<section class="hero">
  <p class="eyebrow">Getting Started</p>
  <h1>Install the skill, connect ComfyUI, and run your first workflow.</h1>
  <p class="lede">
    This page is the shortest reliable path from cloning the repository to
    triggering a real ComfyUI workflow through OpenClaw or the local CLI.
  </p>
  <div class="quick-links">
    <a class="quick-link" href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw">Open Repository</a>
    <a class="quick-link" href="{{ '/use-cases/' | relative_url }}">See Use Cases</a>
    <a class="quick-link" href="{{ '/architecture/' | relative_url }}">View Architecture</a>
  </div>
</section>

<div class="content-stack">
  <section class="section-card">
    <p class="eyebrow-label">Prerequisites</p>
    <h2>What you need before setup</h2>
    <ul class="plain-list">
      <li>Python 3.10 or newer.</li>
      <li>A reachable ComfyUI server, commonly <code>http://127.0.0.1:8188</code>.</li>
      <li>At least one ComfyUI workflow exported in API format.</li>
      <li>A workflow output path that ends in <code>Save Image</code> or another downloadable image output.</li>
    </ul>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Quick Install</p>
    <h2>Install into an OpenClaw workspace</h2>
    <div class="code-panel">
      <pre><code>cd ~/.openclaw/workspace/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
cp config.example.json config.json</code></pre>
    </div>
    <p>If your macOS Python blocks global package changes, keep everything inside the virtual environment above.</p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Recommended Flow</p>
    <h2>Use the local web dashboard first</h2>
    <ol class="step-list">
      <li>Start the UI with <code>./ui/run_ui.sh</code> on macOS or Linux, or <code>ui\run_ui.bat</code> on Windows.</li>
      <li>Open <code>http://localhost:18189</code>.</li>
      <li>Add a ComfyUI server and confirm the server URL is correct.</li>
      <li>Upload a workflow exported from ComfyUI with <strong>Save (API Format)</strong>.</li>
      <li>Select the parameters you want OpenClaw to expose and save the mapping.</li>
    </ol>
    <p class="highlight-line">Best practice: start with the UI once, then automate later with CLI or agent edits.</p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">CLI Verification</p>
    <h2>Confirm the skill can see and call your workflow</h2>
    <div class="split-grid">
      <div>
        <p>First list the registered workflows:</p>
        <div class="code-panel">
          <pre><code>python scripts/registry.py list</code></pre>
        </div>
      </div>
      <div>
        <p>Then run a real generation test:</p>
        <div class="code-panel">
          <pre><code>python scripts/comfyui_client.py \
  --workflow local/Default \
  --args '{"prompt":"A premium product photo"}'</code></pre>
        </div>
      </div>
    </div>
    <p>Successful runs return a <code>prompt_id</code> and one or more local image paths in <code>./outputs</code>.</p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Workflow Files</p>
    <h2>The minimum file layout</h2>
    <div class="code-panel">
      <pre><code>data/local/Default/
  workflow.json
  schema.json</code></pre>
    </div>
    <ul class="plain-list">
      <li><code>workflow.json</code> is the ComfyUI API-format export.</li>
      <li><code>schema.json</code> exposes only the parameters the agent should be allowed to call.</li>
      <li>The workflow identity used by the client is <code>&lt;server_id&gt;/&lt;workflow_id&gt;</code>.</li>
    </ul>
  </section>
</div>
