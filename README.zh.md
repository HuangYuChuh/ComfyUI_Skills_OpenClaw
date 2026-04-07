<div align="center">
  <img src="./asset/banner.png" alt="ComfyUI Skills Banner">

  <h1>ComfyUI Skills for OpenClaw</h1>

  <p><strong>更适合 Agent 调用的 ComfyUI 工作流技能层，适用于 OpenClaw、Codex、Claude Code 以及其他 Agent。</strong></p>

  <p>
    这个项目可以把 ComfyUI 工作流变成可调用的 skill，并以一个更适合 Agent 使用的 CLI 作为主接口，
    同时提供一个可视化 Web UI 用于更方便地完成配置和测试。
  </p>

  <p>
    <a href="https://huangyuchuh.github.io/ComfyUI_Skills_OpenClaw/"><img src="https://img.shields.io/badge/docs-GitHub_Pages-0A7EA4?style=flat" alt="Docs"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/blob/main/LICENSE"><img src="https://img.shields.io/github/license/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat" alt="License"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/stargazers"><img src="https://img.shields.io/github/stars/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat" alt="GitHub stars"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/network/members"><img src="https://img.shields.io/github/forks/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat" alt="GitHub forks"></a>
    <a href="https://www.python.org/"><img src="https://img.shields.io/static/v1?label=Python&message=3.10%2B&color=3776AB&style=flat&logo=python&logoColor=white" alt="Python 3.10+"></a>
  </p>

  <p>
    <a href="https://www.bilibili.com/video/BV1a6cUzVEE6/">🎬 演示视频</a> ·
    <a href="https://huangyuchuh.github.io/ComfyUI_Skills_OpenClaw/">📘 文档站</a> ·
    <a href="#quick-start">🧭 快速开始</a> ·
    <a href="#web-ui">🖥️ Web UI</a> ·
    <a href="#multi-server-management">🛰️ 多服务器</a>
  </p>

  <p>
    <a href="./README.md">English</a> ·
    <strong>简体中文</strong> ·
    <a href="./README.zh-TW.md">繁體中文</a> ·
    <a href="./README.ja.md">日本語</a>
  </p>
</div>

---

## 概览

ComfyUI Skills for OpenClaw 是一个更适合 Agent 调用的桥接层，用来把 ComfyUI 工作流封装成 Agent 可调用的技能。

它不是让 Agent 直接去操作原始的 ComfyUI graph，而是通过 CLI 和基于 schema 的参数映射，为每个工作流提供一个更清晰、更可控的调用接口。只要 Agent 能执行 Shell 命令，就可以与它配合使用，包括 OpenClaw、Codex、Claude Code 等。

当你想导入已有的 ComfyUI 工作流、只暴露必要参数、在聊天或 Agent 任务中直接调用，并把整个调用流程统一到一个稳定的工作流层时，这个项目就很适合。

| 适合谁 | 你能得到什么 |
|--------|--------------|
| OpenClaw、Codex、Claude Code 用户 | 一个 Agent 可以安全调用的 ComfyUI 工作流层 |
| 已有 ComfyUI 工作流的用户 | 不暴露完整 graph 的前提下复用导出工作流 |
| 多机部署场景 | 用统一命名空间管理本地和远程 ComfyUI 服务器 |
| 希望可视化配置和测试的用户 | 一个可选的 Web UI，用来配置、预览和验证工作流，再交给 Agent 使用 |

## 为什么做这个项目

直接使用 ComfyUI 很强大，但并不适合 Agent 驱动的执行方式。

原始工作流 graph 信息量大、结构噪声多，而且对 Agent 来说不够安全。直接调用 ComfyUI API 也意味着你需要自己处理参数注入、工作流命名、服务器选择、依赖检查和输出回收等问题。这个项目在 ComfyUI 之上加了一层更稳定的抽象，让 Agent 可以发现工作流、用结构化参数调用，并获得更可预测的结果。

相比直接使用 ComfyUI 工作流或更底层的交互方式，这个项目的 CLI 明显更偏向 Agent 友好：输入更清晰、参数暴露更安全、工作流发现更直接，执行结果也更稳定可预测。

它尤其适合这些需求：

- 把现有的 ComfyUI 工作流变成 Agent 工具
- 只暴露安全、可控的参数接口，而不是整个 graph
- 在多台 ComfyUI 服务器之间调度工作流
- 在 OpenClaw、Codex、Claude Code 等不同 Agent 环境中复用同一套工作流配置

## 功能特性

| 能力 | 价值 |
|------|------|
| **面向 Agent 的 CLI** | 这个 CLI 的设计重点不是只方便人手动操作，而是更适合 Agent 调用。相比直接面对原始 ComfyUI graph 或更底层的 ComfyUI 交互方式，它提供了更清晰的输入和更可靠的调用接口。 |
| **基于 schema 的参数映射** | 只暴露你希望 Agent 控制的字段，并为参数提供别名、类型和描述。 |
| **ComfyUI 工作流导入** | 导入工作流 JSON，自动识别格式，并生成 Agent 可用的映射层。 |
| **多服务器路由** | 用统一命名空间管理本地和远程 ComfyUI 服务器，并把任务发到正确的机器上。 |
| **依赖检查与安装** | 在执行前检查缺失的节点和模型，并通过 CLI 安装支持的依赖。 |
| **可选 Web UI** | 一个用于配置和测试的可视化层。它不替代 CLI，面向 Agent 的能力仍然对应同一套 CLI 工作流。 |

<a id="quick-start"></a>
## 快速开始

几分钟内跑通 ComfyUI Skills。

开始之前，请确保你已经具备：

- Python 3.10+
- 一台正在运行的 ComfyUI 服务器
- 如果想立刻测试执行，准备一个 ComfyUI API 格式导出的工作流

### 1. 克隆项目

根据你的 Agent 环境选择对应目录。

<details>
<summary><strong>用于 OpenClaw</strong></summary>

```bash
cd ~/.openclaw/workspace/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw
```

</details>

<details>
<summary><strong>用于 Claude Code</strong></summary>

```bash
cd ~/.claude/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
```

</details>

<details>
<summary><strong>用于 Codex</strong></summary>

```bash
cd ~/.codex/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
```

</details>

### 2. 创建本地配置

```bash
cp config.example.json config.json
```

### 3. 安装 CLI

```bash
pipx install comfyui-skill-cli
```

或者：

```bash
pip install comfyui-skill-cli
```

如果你已经安装过 CLI，升级命令如下：

```bash
# 如果你是用 pipx 安装的
pipx upgrade comfyui-skill-cli

# 如果你是用 pip 安装的
python3 -m pip install -U comfyui-skill-cli
```

### 4. 验证环境

```bash
comfyui-skill server status
comfyui-skill list
```

### 5. 导入并运行第一个工作流

```bash
comfyui-skill workflow import /absolute/path/to/my-workflow.json
comfyui-skill deps check local/my-workflow
comfyui-skill run local/my-workflow --args '{"prompt": "a white cat"}'
```

手动使用 CLI 导入时，推荐直接传 workflow JSON 的绝对路径，这样最不容易出错，也不会引入额外的目录规范。

例如：

```bash
comfyui-skill workflow import /Users/yourname/Downloads/my-workflow.json
```

导入完成后，CLI 会把标准化后的工作流和 schema 保存到 `data/<server_id>/<workflow_id>/` 下，例如 `data/local/my-workflow/workflow.json` 和 `data/local/my-workflow/schema.json`。

这也是 Web UI 和 Agent/OpenClaw 导入时遵循的正式目录规范：

```bash
data/<server_id>/<workflow_id>/
  workflow.json
  schema.json
  history/
```

到这里，CLI 就会读取本地 `config.json`，发现可用工作流，并通过你的 ComfyUI 服务器执行它们。

如果你更希望通过可视化方式完成配置和测试，可以继续看下方的 [Web UI](#web-ui) 章节。

## 配置路径

根据你的使用方式选择对应路径。

### OpenClaw

如果你希望 OpenClaw 自动发现并执行 ComfyUI 工作流技能，就走这条路径。

- 把仓库克隆到 `~/.openclaw/workspace/skills`
- 安装 `comfyui-skill-cli`
- 配置 `config.json`
- 导入工作流并暴露 Agent 可安全使用的参数

### Codex 或 Claude Code

如果你希望编码类 Agent 通过 Shell 命令调用 ComfyUI 工作流，就走这条路径。

- 把仓库克隆到 Agent 的 skills 目录
- 安装 CLI
- 用 `comfyui-skill list` 验证环境
- 用结构化的 `--args` 执行工作流

### Web UI

如果你希望通过一个可视化界面完成配置、查看和测试，同时仍然以 CLI 作为 Agent 的主接口，就走这条路径。

```bash
./ui/run_ui.sh
```

启动脚本会在需要时自动创建项目级 `.venv`，并把 UI 依赖安装到这个虚拟环境里。

然后打开：

```text
http://localhost:18189
```

### 手动配置

如果你想直接控制 `config.json`、`workflow.json` 和 `schema.json`，就走这条路径。

<details>
<summary><strong>展开查看手动配置示例</strong></summary>

#### 1）编辑 `config.json`

```jsonc
{
  "servers": [
    {
      "id": "local",
      "name": "Local",
      "url": "http://127.0.0.1:8188",
      "enabled": true,
      "output_dir": "./outputs"
    }
  ],
  "default_server": "local"
}
```

#### 2）放置工作流文件

```text
data/local/my-workflow/
  workflow.json  # ComfyUI API 格式导出
  schema.json    # 参数映射
```

#### 3）编写 `schema.json`

```jsonc
{
  "description": "我的工作流",
  "enabled": true,
  "parameters": {
    "prompt": {
      "node_id": 10,
      "field": "prompt",
      "required": true,
      "type": "string",
      "description": "提示词"
    }
  }
}
```

</details>

## 工作原理

这个项目在 Agent 和 ComfyUI 工作流之间增加了一层受控执行层。

1. 从 ComfyUI 以 API 格式导出工作流。
2. 导入工作流，并定义哪些参数需要对外暴露。
3. 把映射关系保存到 `schema.json`。
4. 通过 `comfyui-skill` 用结构化参数调用工作流。
5. 把任务提交到目标 ComfyUI 服务器，并返回生成结果。

实际流程大致如下：

```text
ComfyUI workflow.json
  -> schema.json 参数映射
  -> comfyui-skill CLI
  -> ComfyUI server
  -> 生成图片输出
```

这种结构让 Agent 面对的是一个稳定的调用契约，而不是直接去理解原始的 ComfyUI graph 节点。

## 常用命令

下面这些命令覆盖了最常见的使用场景。

### 发现工作流

```bash
comfyui-skill list
comfyui-skill info local/txt2img
```

### 执行工作流

```bash
comfyui-skill run local/txt2img --args '{"prompt": "a white cat"}'
```

### 异步提交工作流

```bash
comfyui-skill submit local/txt2img --args '{"prompt": "a white cat"}'
comfyui-skill status <prompt_id>
```

### 导入工作流

```bash
comfyui-skill workflow import /absolute/path/to/my-workflow.json --check-deps
```

推荐手动 CLI 导入时直接传绝对路径。导入成功后，正式文件会写入 `data/<server_id>/<workflow_id>/`。

### 检查依赖

```bash
comfyui-skill deps check local/my-workflow
comfyui-skill deps install local/my-workflow --all
```

### 管理服务器

```bash
comfyui-skill server list
comfyui-skill server add --id remote --url http://10.0.0.1:8188
comfyui-skill server status
```

完整 CLI 文档见 [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI)。

## 工作流要求

为了让项目稳定运行，每个工作流最好满足以下条件。

- 工作流必须以 ComfyUI API 格式导出。
- 工作流里应包含 `Save Image` 这类输出节点。
- 需要有一个 `schema.json` 映射层，方便 Agent 通过清晰参数接口调用。
- 目标 ComfyUI 服务器需要提前安装好对应的自定义节点和模型。

如果你使用 `comfyui-skill workflow import`，CLI 可以帮助生成映射并在执行前检查依赖。

<a id="multi-server-management"></a>
## 多服务器管理

这个项目从设计上就支持多台 ComfyUI 服务器。

你可以把本地和远程的 ComfyUI 实例统一放到一个配置里，通过命名空间来路由工作流。这很适合不同机器承担不同任务的场景，比如本地轻量测试、大显存机器跑重任务，或者按模型环境拆分服务器。

例如：

```bash
comfyui-skill server add --id local --url http://127.0.0.1:8188
comfyui-skill server add --id remote-a100 --url http://10.0.0.20:8188
comfyui-skill server list
```

工作流使用下面这种格式标识：

```text
<server_id>/<workflow_id>
```

例如：

```text
local/txt2img
remote-a100/sdxl-base
```

服务器和工作流都支持启用/禁用开关，所以 Agent 只能看到当前可用的工作流。

你也可以通过下面这些命令在不同机器之间迁移配置：

```bash
comfyui-skill config export --output ./backup.json
comfyui-skill config import ./backup.json --dry-run
comfyui-skill config import ./backup.json
```

<a id="web-ui"></a>
## Web UI

项目提供了一个本地 Web 界面，用于可视化配置和测试。它是可选的，存在的目的主要是让 setup、检查和验证更直观；这个 skill 本身仍然是为 Agent 通过 CLI 调用而设计的。

### 启动

```bash
./ui/run_ui.sh                    # macOS/Linux
# 或: ui\run_ui.bat               # Windows
```

启动脚本会在需要时自动创建项目级 `.venv`，并把 UI 依赖安装到这个虚拟环境中，不需要全局安装 Web UI 依赖。

访问 `http://localhost:18189`。

### 你可以在 Web UI 里做什么

- 上传从 ComfyUI 导出的工作流
- 用可视化编辑器配置参数映射
- 统一管理多台服务器和工作流
- 搜索、排序和查看工作流定义
- 在交给 Agent 使用之前，对工作流配置进行测试和验证
- 在英文、简体中文和繁体中文之间切换界面语言

Web UI 中的配置最终都会映射回同一套底层 CLI 流程。它是配置和测试的可视化辅助层，不是另一套独立的执行模型。

前端源码位于[独立仓库](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend)。

## 常见问题

### `/prompt` 返回 HTTP 400

工作流 payload 或注入后的某个参数值不合法。

请检查：

- 工作流是否以 API 格式导出
- schema 映射是否指向了正确的节点和字段
- 传入参数的类型是否和 schema 定义一致

### 没有返回图片

工作流里可能缺少有效的输出节点，例如 `Save Image`。

### 连接失败

请检查：

- ComfyUI 服务器是否已经启动
- `config.json` 中的服务器 URL 是否正确
- 当前选择的服务器是否处于启用状态

### 缺少节点或模型

运行：

```bash
comfyui-skill deps check <workflow_id>
```

然后按需安装支持的依赖。

## 更新日志

最近的重要更新：

- **v0.3.1**：新增 ComfyUI API Key 支持，可用于 Kling、Sora、Nano Banana 等云 API 节点。
- **v0.3.0**：新增依赖检查与安装、非阻塞 `submit` / `status`、图片上传、导入预览和执行历史。
- **v0.2.0**：将前端源码拆分到独立仓库，并加入前端自动同步能力。

完整版本记录见 [CHANGELOG.zh.md](./CHANGELOG.zh.md)。

## 相关资源

- [English README](./README.md)
- [简体中文 README](./README.zh.md)
- [繁體中文 README](./README.zh-TW.md)
- [日本語 README](./README.ja.md)
- [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI)
- [Frontend Repository](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend)
