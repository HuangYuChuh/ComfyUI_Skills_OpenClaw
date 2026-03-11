# ComfyUI Skills for OpenClaw

![ComfyUI Skills Banner](./asset/banner-ui-20250309.jpg)
这是一个面向 OpenClaw 的 ComfyUI Skill 集成层：支持调用你在 ComfyUI 中自行编排并导出（API格式）的 Workflow，将其封装为可被 OpenClaw 通过自然语言触发的 Skills。

它会把自然语言请求转成结构化的 Skill 参数，映射到 ComfyUI 工作流输入后提交执行，等待任务完成并将生成图片下载到本地。

---

## 这个 Skill 能做什么

- 把你已经在 ComfyUI 里做好的工作流，整理成 OpenClaw 可以直接调用的技能
- 让 OpenClaw 去调用部署在不同 ComfyUI 服务器上的工作流，而不是只绑定在一台机器上
- 把工作流里需要填写的参数整理出来，方便 OpenClaw 更稳定地理解和复用
- 工作流上传一次后，就可以在 UI 里持续管理，而不是每次都重新手动整理
- 提交任务、等待完成、拉回生成结果，这条链路可以直接复用到日常使用里

---

## 安装

### 1）环境要求

- Python 3.10+
- 正在运行的 ComfyUI 服务（默认：`http://127.0.0.1:8188`）

### 2）克隆项目并安装依赖

```bash
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw
pip install -r requirements.txt
```

### 3）准备运行配置

`config.json` 是这个项目的运行时配置。CLI、UI 和 OpenClaw 调用脚本都会读取它。

你可以二选一：

- 手动方式：根据 `config.example.json` 创建 `config.json`，并自己填好第一个服务器
- UI 方式（推荐）：先启动 UI，再在界面里添加第一个服务器，UI 会自动把配置写回 `config.json`

`config.json` 示例：

```json
{
  "servers": [
    {
      "id": "local",
      "name": "Local Mac",
      "url": "http://127.0.0.1:8188",
      "enabled": true,
      "output_dir": "./outputs"
    }
  ],
  "default_server": "local"
}
```


### 4）启动本地 UI

- macOS/Linux：
  ```bash
  ./ui/run_ui.sh
  ```
  或双击 `ui/run_ui.command`
- Windows：
  ```bat
  ui\run_ui.bat
  ```

打开：

- `http://localhost:8189`

### 5）添加第一个服务器和工作流

在 UI 里完成这几步：

1. 如果你还没有在 `config.json` 里配置服务器，就先添加一个 ComfyUI 服务器。
2. 上传从 ComfyUI 导出的工作流 JSON，格式必须是 **Save (API Format)**。
3. 选择需要暴露给 OpenClaw 的参数。
4. 保存工作流映射。

### 6）验证是否安装成功

查看工作流列表：

```bash
python scripts/registry.py list
```

执行一次测试生图：

```bash
python scripts/comfyui_client.py \
  --workflow local/test \
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

## 作为 OpenClaw Skill 安装

把这个项目放到 OpenClaw 工作区的 skill 目录下面：

- `~/.openclaw/workspace/skills/<skill_name>/`

例如：

- `~/.openclaw/workspace/skills/comfyui-agent/`

OpenClaw 会读取 `SKILL.md`，并调用：

- `scripts/registry.py list --agent`
- `scripts/comfyui_client.py --workflow ... --args '...json...'`

最小检查清单：

1. 项目放在 `~/.openclaw/workspace/skills/` 下面
2. 根目录存在 `SKILL.md`
3. Python 依赖已经安装
4. `config.json` 指向可访问的 ComfyUI 服务
5. 至少已经配置了一个工作流和对应参数映射

### 让 OpenClaw 帮你安装

把下面这段话发给 OpenClaw 即可：

```text
请帮我把这个 ComfyUI skill 安装到我的 OpenClaw workspace 里。

目标路径：
~/.openclaw/workspace/skills/comfyui-agent/

要求：
1. 把完整项目复制或克隆到这个目录。
2. 保留根目录下的 SKILL.md。
3. 安装 requirements.txt 里的 Python 依赖。
4. 如果没有 config.json，就根据 config.example.json 创建一份。
5. 如果我没有额外指定，就默认把 ComfyUI 地址设置为 http://127.0.0.1:8188。
6. 安装完成后，确保 OpenClaw 可以发现并调用这个 skill。
```

---

## 本地 UI 管理面板

启动方式：

- 通过 OpenClaw 或其他可执行本地命令的 Agent：
  ```bash
  python3 ./ui/open_ui.py
  ```
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

可用于配置多个 ComfyUI 服务器地址、输出目录，以及管理工作流及 Schema 映射。

当前已经支持：

- 多服务器管理，以及服务器和工作流的双层开关
- 工作流搜索、排序和拖动排序
- 上传工作流 JSON 时自动填充 Workflow ID
- 自定义弹窗、自定义下拉和语言切换

---

## 多服务器管理

你现在可以配置多个不同的 ComfyUI 服务器，方便 OpenClaw 将生图任务分发到不同算力节点（例如本机 GPU、云端实例等）。

### 核心概念
- **双层控制开关**：`服务器` 和 `独立工作流` 均有各自的开启/关闭状态。OpenClaw 只能发现**两者均开启**的工作流。
- **命名空间组合**：OpenClaw 识别工作流的唯一标识为 `<server_id>/<workflow_id>` 的复合格式（例如：`local/test` 与 `cloud/test`）。

### 命令行工具配置
在无 GUI 的 Linux 机器部署时，可使用内置的 CLI 工具（`scripts/server_manager.py`）进行管理：
```bash
python scripts/server_manager.py list
python scripts/server_manager.py add --id cloud --name "Cloud Node" --url http://10.0.0.1:8188
python scripts/server_manager.py disable cloud
```
*所有服务器配置依然可以通过前端 Web UI 界面来进行图形化无缝管理。*

---

## 工作流要求（重要）

为了稳定执行，请确保：

1. **工作流必须导出为 ComfyUI API 格式**
   - 在 ComfyUI 中点击 **Save (API Format)**
   - 将导出的 JSON 放到 `data/<server_id>/workflows/<workflow_id>.json`

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

- 支持工作流版本历史和回滚
- 上传新版本前先预览参数变化
- 工作流升级时支持参数迁移
- 增强提交前参数校验
- 更清晰展示 ComfyUI 返回的节点错误
- 支持批量多 seed 生成

---

## 项目结构

```text
ComfyUI_Skills_OpenClaw/
├── SKILL.md                    # Agent 指令规范（如何调用 registry/client）
├── README.md
├── README.zh.md
├── LICENSE
├── .gitignore
├── requirements.txt            # Python 依赖（FastAPI、requests 等）
├── config.example.json         # 配置示例
├── config.json                 # 本地实际配置（默认 gitignore）
├── asset/
│   └── banner-ui-20250309.jpg
├── data/
│   ├── <server_id>/
│   │   ├── workflows/
│   │   │   └── <workflow_id>.json  # ComfyUI API 格式工作流
│   │   └── schemas/
│   │       └── <workflow_id>.json  # 对外参数映射
├── scripts/
│   ├── server_manager.py       # 管理多服务器配置的 CLI 工具
│   ├── registry.py             # 列出可用工作流及参数
│   ├── comfyui_client.py       # 注入参数、提交任务、轮询完成、下载图片
│   └── shared/                 # 跨脚本共用的配置与 JSON 工具
│       ├── config.py
│       ├── json_utils.py
│       └── runtime_config.py
├── ui/
│   ├── app.py                  # FastAPI 路由层
│   ├── open_ui.py              # 供 Agent 调用的 UI 启动入口
│   ├── services.py             # 业务逻辑（工作流增删改查）
│   ├── models.py               # Pydantic 请求/响应模型
│   ├── json_store.py           # JSON 文件读写封装
│   ├── settings.py             # 应用级配置
│   ├── run_ui.sh               # 启动脚本（macOS/Linux）
│   ├── run_ui.command          # macOS 双击启动
│   ├── run_ui.bat              # Windows 启动
│   └── static/                 # 模块化 ES6 前端（HTML/CSS/JS）
└── outputs/
    └── .gitkeep
```

---

<details>
<summary>项目关键词与资料</summary>

## 项目关键词

本仓库围绕以下检索意图进行内容组织：

- OpenClaw
- ComfyUI
- ComfyUI Skills
- ComfyUI 工作流自动化
- OpenClaw + ComfyUI 集成
- AI 生图技能（Image Generation Skill）
- 小龙虾（项目昵称，Xiao Long Xia / small crawfish）

用于项目理解与检索的核心文件：
- `README.md`（英文说明）
- `README.zh.md`（中文说明）
- `SKILL.md`（Agent 调用规范）
- `docs/llms.txt` 与 `docs/llms-full.txt`（面向 LLM 的摘要文件）

---

## 项目资料

- 项目摘要：`docs/llms.txt`
- 项目扩展上下文：`docs/llms-full.txt`
- 项目传播清单：`docs/PROJECT_DISCOVERY_CHECKLIST.md`

</details>
