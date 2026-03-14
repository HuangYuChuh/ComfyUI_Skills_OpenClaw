---
title: Use Cases
description: Common use cases for ComfyUI Skills for OpenClaw, including local image generation, multi-server routing, schema-based workflow reuse, and agent-managed setup.
permalink: /use-cases/
---

<section class="hero">
  <p class="eyebrow">Use Cases</p>
  <h1>Where this repository fits in a real ComfyUI and agent workflow.</h1>
  <p class="lede">
    These are the main user intents this project serves well. They also map
    directly to the keywords and search patterns people use to discover the repository.
  </p>
</section>

<div class="mini-grid">
  <section class="mini-card">
    <h3>OpenClaw image generation</h3>
    <p>Trigger existing ComfyUI workflows from chat instead of opening the graph every time.</p>
  </section>
  <section class="mini-card">
    <h3>Schema-based reuse</h3>
    <p>Expose a clean parameter surface instead of making the agent reason about every node.</p>
  </section>
  <section class="mini-card">
    <h3>Multi-server routing</h3>
    <p>Keep local and remote ComfyUI machines under one workflow namespace.</p>
  </section>
</div>

<div class="content-stack">
  <section class="section-card">
    <p class="eyebrow-label">Use Case 1</p>
    <h2>Turn a local ComfyUI workflow into a callable skill</h2>
    <p>
      The most direct use case is taking a workflow you already exported from ComfyUI,
      wrapping it with <code>schema.json</code>, and letting OpenClaw call it with
      natural-language-derived arguments. This is useful when the workflow logic is stable
      but the prompts or seeds change from request to request.
    </p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Use Case 2</p>
    <h2>Route jobs across different ComfyUI servers</h2>
    <p>
      Many users have more than one generation target: a local GPU box, a remote workstation,
      or a higher-memory machine for heavier checkpoints. This repository lets you keep those
      workflows under a single skill system with server-level and workflow-level enable switches.
    </p>
    <p>
      The result is a cleaner namespace such as <code>local/sdxl-base</code> and <code>remote-a100/sdxl-base</code>
      without losing the original workflow identity.
    </p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Use Case 3</p>
    <h2>Standardize what the agent is allowed to change</h2>
    <p>
      Raw ComfyUI graphs are powerful but noisy. The schema layer gives you a stable contract:
      which parameters are visible, which are required, which types are expected, and how they map
      into node fields. That makes the repository useful as a safety layer between an LLM and a graph.
    </p>
  </section>

  <section class="section-card">
    <p class="eyebrow-label">Use Case 4</p>
    <h2>Let an agent manage configuration for you</h2>
    <p>
      Because the repository is structured around predictable files and CLI entry points,
      OpenClaw or another coding agent can help create servers, write workflow mappings,
      and verify the setup. This is especially helpful when moving the same skill pack across machines.
    </p>
    <div class="card-cta">
      <a class="button primary" href="{{ '/getting-started/' | relative_url }}">Start Setup</a>
      <a class="button secondary" href="{{ '/faq/' | relative_url }}">Read FAQ</a>
    </div>
  </section>
</div>
