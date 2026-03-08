# ComfyUI Skills for OpenClaw（中文说明）

![ComfyUI Skills Banner](./asset/banner.jpg)
这是一个面向 OpenClaw / 其他 Agent 的 ComfyUI Skill 集成层：支持调用你在 ComfyUI 中自行编排并导出（API Format）的 Workflow，将其封装为可被 OpenClaw/Agent 通过自然语言触发的 Skills。

它会把自然语言请求转成结构化的技能参数，映射到 ComfyUI 工作流输入后提交执行，等待任务完成并将生成图片下载到本地。

---

## 当前项目结构

```text
ComfyUI_Skills_OpenClaw/
├── SKILL.md                    # Agent 指令规范（如何调用 registry/client）
├── README.md                   # 英文主页
├── README.zh.md                # 中文说明
├── LICENSE
├── .gitignore
├── requirements.txt            # Python 依赖（FastAPI、requests 等）
├── config.example.json         # 配置示例
├── config.json                 # 本地实际配置（默认 gitignore）
├── data/
│   ├── workflows/
│   │   └── test.json           # ComfyUI API 格式工作流（当前演示）
│   └── schemas/
│       └── test.json           # workflow "test" 对外参数映射
├── scripts/
│   ├── registry.py             # 列出可用工作流及参数
│   └── comfyui_client.py       # 注入参数、提交任务、轮询完成、下载图片
├── ui/
│   ├── app.py                  # FastAPI 本地管理面板后端
│   ├── run_ui.sh               # 启动脚本（macOS/Linux）
│   ├── run_ui.command          # macOS 双击启动
│   ├── run_ui.bat              # Windows 启动
│   └── static/                 # 前端构建产物
└── outputs/
    ├── .gitkeep
    └── *.png                   # 生成图片输出目录
```

---

## 这个 Skill 能做什么

- **[AI Native 特性] 零干预工作流自动配置**：直接将导出的工作流 JSON 交给 Agent，它可以自主分析节点、提取参数并直接生成配置 Schema 供后续调度！
- 发现可用工作流和参数要求（`registry.py`）
- 按 schema 把参数映射到 ComfyUI 节点输入（`node_id/field`）
- 通过 ComfyUI HTTP API 提交任务（`/prompt`）
- 轮询任务状态（`/history/{prompt_id}`）
- 下载输出图片（`/view`）到本地 `outputs/`

---

## 环境要求

- Python 3.10+
- 正在运行的 ComfyUI 服务（默认：`http://127.0.0.1:8188`）

安装依赖：

```bash
pip install -r requirements.txt
```

---

## 配置

本地 `config.json` 示例：

```json
{
  "comfyui_server_url": "http://127.0.0.1:8188",
  "output_dir": "./outputs"
}
```

> 建议：`config.json` 只保留在本地，版本库里保留 `config.example.json` 即可。

---

## 快速开始

### 1）查看可用工作流

```bash
python scripts/registry.py list
```

当前示例工作流：`test`

对外参数：
- `prompt`（必填）
- `size`（可选）
- `seed`（可选）

### 2）执行一次生图

```bash
python scripts/comfyui_client.py \
  --workflow test \
  --args '{"prompt":"一张高质感产品摄影图，温暖电影级光影","size":"3:4,1728x2304","seed":20260307}'
```

成功后会返回类似：

```json
{
  "status": "success",
  "prompt_id": "...",
  "images": ["./outputs/<prompt_id>_...png"]
}
```

---

## 本地管理面板（UI）

启动方式：

- macOS/Linux：
  ```bash
  ./ui/run_ui.sh
  ```
  或双击 `ui/run_ui.command`
- Windows：
  ```bat
  ui\run_ui.bat
  ```

访问地址：

- `http://localhost:8189`

可用于配置 ComfyUI 地址，以及管理 workflow/schema 映射。

当前 UI 代码已按职责拆分，便于维护：`ui/app.py`、`ui/services.py`、`ui/static/styles.css`、`ui/static/js/`。

---

## OpenClaw 集成说明

要在 OpenClaw 工作区会话中自动识别此 Skill，请放到：

- `<workspace>/skills/comfyui-skill-openclaw/`

OpenClaw 会读取 `SKILL.md`，并调用：
- `scripts/registry.py list --agent`
- `scripts/comfyui_client.py --workflow ... --args '...json...'`

---

## 工作流要求（重要）

为了稳定执行，请确保：

1. **工作流必须导出为 ComfyUI API 格式**
   - 在 ComfyUI 中点击 **Save (API Format)**
   - 将导出的 JSON 放到 `data/workflows/<workflow_id>.json`

2. **工作流末端必须包含 `Save Image` 节点**
   - 当前客户端是从 ComfyUI 的输出图像中下载结果
   - 如果没有 `Save Image`（或等价的图像输出），可能会“执行成功但拿不到图片”

一句话：**API 格式工作流 + Save Image 输出节点** 是稳定可用的基础要求。

---

## 常见问题

- `/prompt` 返回 HTTP 400：通常是工作流 payload 或参数值不合法。
- `size` 值必须符合目标节点支持的枚举（例如 `3:4,1728x2304`）。
- `config.json` 里的 ComfyUI 地址错误会导致无法提交任务。

---

## 后续计划

- 支持多个 workflow（不止 `test`）
- 增强提交前参数校验
- 更清晰展示 ComfyUI 返回的节点错误
- 支持批量多 seed 生成
