---
title: Architecture
description: Technical overview of how ComfyUI Skills for OpenClaw maps agent input into ComfyUI workflow execution, including the registry, client, web UI, and workflow storage model.
permalink: /architecture/
---

<section class="hero">
  <p class="eyebrow">Architecture</p>
  <h1>How the repository turns agent input into ComfyUI execution.</h1>
  <p class="lede">
    The architecture is intentionally simple: expose workflows, map a small parameter surface,
    queue the job, poll for completion, and download images back to local disk.
  </p>
</section>

<div class="content-stack">
  <section class="section-card">
    <p class="eyebrow-label">System Model</p>
    <h2>Core components</h2>
    <ul class="definition-list">
      <li><strong>SKILL.md</strong>: the agent-facing contract that explains how the skill is discovered and called.</li>
      <li><strong>scripts/registry.py</strong>: lists enabled workflows and the parameters exposed to the agent.</li>
      <li><strong>scripts/comfyui_client.py</strong>: injects args into a workflow, submits the prompt, waits, and downloads images.</li>
      <li><strong>scripts/server_manager.py</strong>: manages multi-server configuration from CLI.</li>
      <li><strong>ui/</strong>: FastAPI plus the local dashboard for servers, workflows, and mapping edits.</li>
    </ul>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Execution Flow</p>
    <h2>From natural language to image file</h2>
    <ol class="step-list">
      <li>The agent asks the registry which workflows are enabled.</li>
      <li>The repository resolves user intent into structured args.</li>
      <li>The client maps those args into ComfyUI node fields using <code>schema.json</code>.</li>
      <li>The client calls native ComfyUI endpoints such as <code>/prompt</code>, <code>/history/{prompt_id}</code>, and <code>/view</code>.</li>
      <li>The output images are downloaded to local storage and returned to the caller.</li>
    </ol>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Storage Model</p>
    <h2>How workflows are organized on disk</h2>
    <div class="code-panel">
      <pre><code>data/
  &lt;server_id&gt;/
    &lt;workflow_id&gt;/
      workflow.json
      schema.json</code></pre>
    </div>
    <p>
      This structure makes workflows portable and easy to inspect. It also gives the repository
      a clean namespace for multi-server execution.
    </p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Why The Schema Layer Matters</p>
    <h2>ComfyUI graphs are flexible, but agents need contracts</h2>
    <p>
      A graph can contain dozens of nodes and many internal fields that should not be exposed directly.
      The schema layer narrows that surface into a predictable interface with aliases, descriptions,
      required flags, and types. That is what makes agent calls more reliable and easier to maintain.
    </p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Related Pages</p>
    <h2>Keep exploring</h2>
    <div class="card-cta">
      <a class="button primary" href="{{ '/getting-started/' | relative_url }}">Getting Started</a>
      <a class="button secondary" href="{{ '/use-cases/' | relative_url }}">Use Cases</a>
      <a class="button secondary" href="{{ '/faq/' | relative_url }}">FAQ</a>
    </div>
  </section>
</div>
