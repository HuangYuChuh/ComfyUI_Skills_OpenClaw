---
title: Getting Started
description: Install ComfyUI Skills and the CLI tool in under 5 minutes. Works with OpenClaw, Claude Code, Codex, and any AI agent that can run shell commands.
permalink: /getting-started/
---

<section class="hero">
  <p class="eyebrow">Getting Started</p>
  <h1>Set up ComfyUI Skills in under 5 minutes.</h1>
  <p class="lede">
    Clone the project, install the CLI, and start generating images from any AI agent.
  </p>
</section>

<div class="content-stack">
  <section class="section-card">
    <p class="eyebrow-label">Prerequisites</p>
    <h2>What you need</h2>
    <ul class="definition-list">
      <li><strong>Python 3.10+</strong></li>
      <li><strong>A running ComfyUI server</strong> (default: <code>http://127.0.0.1:8188</code>)</li>
      <li><strong>pipx or pip</strong> for installing the CLI tool</li>
    </ul>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Step 1</p>
    <h2>Clone the project</h2>
    <p>Choose the path that matches your agent platform:</p>
    <div class="code-panel">
      <pre><code># For OpenClaw
cd ~/.openclaw/workspace/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw

# For Claude Code
cd ~/.claude/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill

# For Codex
cd ~/.codex/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill</code></pre>
    </div>
    <p>Then copy the example config:</p>
    <div class="code-panel">
      <pre><code>cp config.example.json config.json</code></pre>
    </div>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Step 2</p>
    <h2>Install the CLI</h2>
    <div class="code-panel">
      <pre><code>pipx install comfyui-skill-cli</code></pre>
    </div>
    <p>Or with pip:</p>
    <div class="code-panel">
      <pre><code>pip install comfyui-skill-cli</code></pre>
    </div>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Step 3</p>
    <h2>Verify the setup</h2>
    <div class="code-panel">
      <pre><code># Check server connectivity
comfyui-skill server status

# List available workflows
comfyui-skill list</code></pre>
    </div>
    <p>
      The CLI reads <code>config.json</code> and <code>data/</code> from the current directory.
      All commands support <code>--json</code> for structured output.
    </p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Step 4</p>
    <h2>Import your first workflow</h2>
    <div class="code-panel">
      <pre><code># Import a workflow JSON (auto-detects format, generates schema)
comfyui-skill workflow import ./my-workflow.json

# Check and install dependencies
comfyui-skill deps check local/my-workflow
comfyui-skill deps install local/my-workflow --all

# Run it
comfyui-skill run local/my-workflow --args '{"prompt": "a white cat"}'</code></pre>
    </div>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Optional</p>
    <h2>Web UI</h2>
    <p>
      A local web interface is available for visual workflow management.
      Not required for agent usage — the CLI covers all functionality.
    </p>
    <div class="code-panel">
      <pre><code># macOS / Linux
./ui/run_ui.sh

# Windows
ui\run_ui.bat</code></pre>
    </div>
    <p>
      The script automatically creates a <code>.venv</code>, installs dependencies, and starts the server.
      Visit <code>http://localhost:18189</code> to manage workflows visually.
    </p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Next Steps</p>
    <h2>Keep exploring</h2>
    <div class="card-cta">
      <a class="button primary" href="{{ '/use-cases/' | relative_url }}">Use Cases</a>
      <a class="button secondary" href="{{ '/architecture/' | relative_url }}">Architecture</a>
      <a class="button secondary" href="{{ '/faq/' | relative_url }}">FAQ</a>
    </div>
  </section>
</div>
