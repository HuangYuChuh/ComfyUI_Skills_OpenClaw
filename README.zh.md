# ComfyUI Skills for OpenClaw

![ComfyUI Skills Banner](./asset/banner-ui-dashboard-20260322.png)

把 ComfyUI 工作流变成 AI Agent 可调用的技能。任何能执行 Shell 命令的 Agent — Claude Code、Codex、OpenClaw — 都可以通过一个 CLI 发现、执行和管理 ComfyUI 工作流。

[演示视频](https://www.bilibili.com/video/BV1a6cUzVEE6/) · [安装](#安装) · [CLI 使用](#cli-使用) · [Web UI](#web-ui可选) · [工作流配置](#工作流配置) · [多服务器](#多服务器管理)

---

## 安装

### 第一步：克隆项目

<details>
<summary><strong>用于 OpenClaw</strong></summary>

```bash
cd ~/.openclaw/workspace/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw
cp config.example.json config.json
```

</details>

<details>
<summary><strong>用于 Claude Code</strong></summary>

```bash
cd ~/.claude/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
cp config.example.json config.json
```

</details>

<details>
<summary><strong>用于 Codex</strong></summary>

```bash
cd ~/.codex/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
cp config.example.json config.json
```

</details>

### 第二步：安装 CLI

```bash
pipx install comfyui-skill-cli
```

或用 pip：

```bash
pip install comfyui-skill-cli
```

### 第三步：验证

```bash
comfyui-skill server status
comfyui-skill list
```

搞定。CLI 会从项目目录读取 `config.json` 和 `data/`。

> **Web UI 依赖**（可选，仅在需要管理界面时安装）：
> ```bash
> pip install -r requirements.txt
> ```

---

## CLI 使用

CLI 是与 ComfyUI Skills 交互的主要方式。所有命令支持 `--json` 输出结构化数据。

### 快速开始

```bash
# 检查服务器
comfyui-skill server status

# 列出工作流
comfyui-skill list

# 执行工作流
comfyui-skill run local/txt2img --args '{"prompt": "a white cat"}'

# 从 JSON 导入新工作流
comfyui-skill workflow import ./my-workflow.json --check-deps

# 上传图片（用于图生图工作流）
comfyui-skill upload ./photo.png
```

### 完整命令参考

| 分类 | 命令 | 说明 |
|------|------|------|
| **发现** | `comfyui-skill list` | 列出所有工作流及参数 |
| | `comfyui-skill info <workflow_id>` | 查看工作流详情和参数 schema |
| **执行** | `comfyui-skill run <workflow_id> --args '{...}'` | 执行工作流（阻塞等待） |
| | `comfyui-skill submit <workflow_id> --args '{...}'` | 提交工作流（非阻塞） |
| | `comfyui-skill status <prompt_id>` | 查询执行状态 |
| | `comfyui-skill upload <image_path>` | 上传图片到 ComfyUI |
| **工作流** | `comfyui-skill workflow import <json_path>` | 从本地 JSON 导入（自动检测格式） |
| | `comfyui-skill workflow import --from-server` | 从 ComfyUI 服务器导入 |
| | `comfyui-skill workflow enable/disable <workflow_id>` | 启用/禁用工作流 |
| | `comfyui-skill workflow delete <workflow_id>` | 删除工作流 |
| **服务器** | `comfyui-skill server list` | 列出服务器 |
| | `comfyui-skill server status [<server_id>]` | 检查服务器状态 |
| | `comfyui-skill server add --id <server_id> --url <url>` | 添加服务器 |
| | `comfyui-skill server enable/disable <server_id>` | 启用/禁用服务器 |
| | `comfyui-skill server remove <server_id>` | 移除服务器 |
| **依赖** | `comfyui-skill deps check <workflow_id>` | 检查缺失的节点和模型 |
| | `comfyui-skill deps install <workflow_id> --all` | 安装所有缺失依赖 |
| **配置** | `comfyui-skill config export --output <path>` | 导出配置 |
| | `comfyui-skill config import <path>` | 导入配置 |
| **历史** | `comfyui-skill history list <workflow_id>` | 查看执行历史 |
| | `comfyui-skill history show <workflow_id> <run_id>` | 查看运行详情 |

> `<workflow_id>` 格式：`服务器ID/工作流名称`（如 `local/txt2img`）。省略服务器前缀则使用默认服务器。

完整 CLI 文档见 [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI)。

---

## Web UI（可选）

本地 Web 管理界面，用于可视化管理工作流。Agent 使用不需要 Web UI — CLI 已覆盖全部功能。

### 启动

```bash
pip install -r requirements.txt   # 仅首次需要
./ui/run_ui.sh                    # macOS/Linux
# 或: ui\run_ui.bat               # Windows
```

访问 `http://localhost:18189`。

### 功能

- 上传从 ComfyUI 导出的工作流（API 格式）
- 可视化编辑参数映射
- 统一管理多台服务器和工作流
- 拖拽排序、跨服务器搜索和筛选
- 支持英文、简体中文、繁体中文

前端源码位于[独立仓库](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend)。

---

## 工作流配置

开始前请确保 ComfyUI 服务已运行（默认地址：`http://127.0.0.1:8188`）。

### 方式一：通过 CLI 导入（推荐）

```bash
# 导入工作流 JSON — 自动检测格式、自动转换、自动生成 schema
comfyui-skill workflow import ./my-workflow.json

# 检查并安装依赖
comfyui-skill deps check local/my-workflow
comfyui-skill deps install local/my-workflow --all

# 验证
comfyui-skill run local/my-workflow --args '{"prompt": "test"}'
```

### 方式二：通过 Web UI 导入

1. 打开 `http://localhost:18189`
2. 上传从 ComfyUI 导出的工作流 JSON（**Save (API Format)**）
3. 选择要暴露给 Agent 的参数
4. 保存映射

### 方式三：手动配置

<details>
<summary>展开查看手动配置步骤</summary>

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

```
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

### 工作流要求

- **必须导出为 ComfyUI API 格式**（在 ComfyUI 中点击 **Save (API Format)**）
- **末端必须包含 `Save Image` 节点**（否则可能执行成功但拿不到图片）

---

## 多服务器管理

管理多台 ComfyUI 服务器，将任务分发到不同算力。

### 核心概念

- **双层开关**：服务器和工作流各有独立的启用/禁用开关，Agent 只能看到两者都启用的工作流。
- **命名空间**：工作流以 `<server_id>/<workflow_id>` 格式标识（如 `local/txt2img` 与 `remote-a100/txt2img` 互不干扰）。

### CLI

```bash
comfyui-skill server add --id remote --name "Remote GPU" --url http://10.0.0.1:8188
comfyui-skill server list
comfyui-skill server disable remote
```

### 配置迁移

```bash
# 导出
comfyui-skill config export --output ./backup.json

# 预览导入
comfyui-skill config import ./backup.json --dry-run

# 执行导入
comfyui-skill config import ./backup.json
```

*所有服务器配置也可以通过 Web UI 管理。*

---

## 更新

```bash
./update.sh
```

更新 CLI：

```bash
pipx upgrade comfyui-skill-cli
```

---

## 常见问题

- **`/prompt` 返回 HTTP 400**：工作流 payload 或参数值不合法。
- **没有返回图片**：工作流缺少 `Save Image` 节点。
- **连接失败**：检查 `config.json` 中的服务器地址是否正确。

---

## 更新日志

完整版本记录见 [CHANGELOG.zh.md](./CHANGELOG.zh.md)。

---

## 项目结构

```text
ComfyUI_Skills_OpenClaw/
├── SKILL.md                    # Agent 指令规范
├── config.example.json         # 配置示例
├── config.json                 # 本地配置（gitignored）
├── requirements.txt            # Web UI 的 Python 依赖
├── data/
│   └── <server_id>/
│       └── <workflow_id>/
│           ├── workflow.json   # ComfyUI API 格式工作流
│           └── schema.json     # 参数映射
├── scripts/
│   ├── update_frontend.sh      # 拉取最新前端构建
│   └── shared/                 # 共用工具（Web UI 后端使用）
├── ui/
│   ├── app.py                  # FastAPI 后端
│   ├── open_ui.py              # UI 启动器
│   └── static/                 # 前端（HTML/CSS/JS）
└── outputs/
```

---

<details>
<summary>项目关键词与资料</summary>

### 项目关键词

- OpenClaw · ComfyUI · ComfyUI Skills · ComfyUI 工作流自动化
- AI 生图技能 · OpenClaw + ComfyUI 集成

### 核心文件

- `SKILL.md` — Agent 调用规范
- `docs/llms.txt` / `docs/llms-full.txt` — 面向 LLM 的摘要

</details>
