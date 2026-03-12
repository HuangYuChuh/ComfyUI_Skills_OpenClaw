# ComfyUI Skills for OpenClaw

![ComfyUI Skills Banner](./asset/banner-ui-20250309.jpg)
这是一个面向 OpenClaw 的 ComfyUI Skill 封装层。

它不负责替代 ComfyUI，而是负责把你已经在 ComfyUI 中搭好的工作流，整理成一个可被 Agent 稳定发现、理解和调用的 skill 运行契约：

- OpenClaw 通过 `SKILL.md` 发现这个 skill
- Agent 通过 `scripts/registry.py list --agent` 获取可调用工作流
- Agent 通过 `scripts/comfyui_client.py` 执行目标工作流
- 本项目负责把 agent 侧参数映射到 ComfyUI 工作流输入，提交任务、等待完成并下载结果

换句话说，你只需要继续在 ComfyUI 里搭图，这个项目负责把它变成 OpenClaw 能调用的工具。

## Skill 运行契约

从 Agent 的视角，这个 skill 只暴露两类运行入口：

- `scripts/registry.py list --agent`
  返回当前 Agent 可以看到并调用的工作流清单。
- `scripts/comfyui_client.py --workflow <server_id>/<workflow_id> --args '{...json...}'`
  执行某个工作流，并以 JSON 返回生成文件路径。

这个仓库里的其他部分，都是为这两个入口服务的：

- `SKILL.md`：告诉 OpenClaw 应该如何使用这个 skill
- `config.json`：定义有哪些 ComfyUI 或 Comfy Cloud 服务器
- `data/<server_id>/<workflow_id>/workflow.json`：保存工作流 payload
- `data/<server_id>/<workflow_id>/schema.json`：保存面向 Agent 的参数映射
- `ui/`：用于维护这些配置和映射的管理面板
- `scripts/doctor.py`：诊断为什么 skill 还不能用，或者 workflow 为什么被隐藏

## 这个 Skill 适合做什么

- 把现成的 ComfyUI 工作流封装成可复用的 Agent 工具
- 让一个 Agent 把图像任务分发到多个 ComfyUI 服务器
- 给 Agent 暴露一个很小、很明确的参数面，而不是整个节点图
- 上传一次工作流后长期复用，不必每次重新手工对接节点参数
- 同时支持本地 / 自托管 ComfyUI 和 Comfy Cloud

## 以 Skill 为目标的快速接入

如果你的目标很明确，就是“让 OpenClaw 能把这个仓库当 skill 调起来”，最短路径如下：

1. 把仓库放到 `~/.openclaw/workspace/skills/<skill_name>/`
2. 安装 `requirements.txt` 中的 Python 依赖
3. 在 `config.json` 或 Web UI 中配置至少一个服务器
4. 上传一个通过 **Save (API Format)** 导出的 ComfyUI 工作流
5. 暴露 Agent 需要控制的参数
6. 确认 `python scripts/registry.py list --agent` 能返回至少一个工作流
7. 运行 `python scripts/doctor.py`
8. 确认 `python scripts/comfyui_client.py --workflow ... --args '{...}'` 能成功执行一次

---

## 安装

### 1）环境要求

- Python 3.10+
- 正在运行的 ComfyUI 服务（默认：`http://127.0.0.1:8188`）

### 2）克隆项目并安装依赖

```bash
git clone <你的仓库地址> comfyui-skill-openclaw
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
      "server_type": "comfyui",
      "url": "http://127.0.0.1:8188",
      "enabled": true,
      "output_dir": "./outputs",
      "api_key": "",
      "api_key_env": "",
      "use_api_key_for_partner_nodes": false
    },
    {
      "id": "comfy-cloud",
      "name": "Comfy Cloud",
      "server_type": "comfy_cloud",
      "url": "https://cloud.comfy.org",
      "enabled": false,
      "output_dir": "./outputs",
      "api_key": "",
      "api_key_env": "COMFY_CLOUD_API_KEY",
      "use_api_key_for_partner_nodes": true
    }
  ],
  "default_server": "local"
}
```

对于 Comfy Cloud，建议优先使用 `api_key_env` 而不是 `api_key`，这样真实密钥不会写进 `config.json`。


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

- `http://localhost:18189`

前端开发工作流：

- 用户不需要 Node，也不需要手动执行前端构建
- 已提交的构建产物会直接由 `ui/static/` 提供
- 前端源码位于 `frontend/`

```bash
cd frontend
npm install
npm test
npm run build
```

`npm run build` 会重新生成 `ui/static/`，供 FastAPI 直接服务。

### 5）添加第一个服务器和工作流

在 UI 里完成这几步：

1. 如果你还没有在 `config.json` 里配置服务器，就先添加一个 ComfyUI 服务器。
2. 上传从 ComfyUI 导出的工作流 JSON，格式必须是 **Save (API Format)**。
3. 选择需要暴露给 OpenClaw 的参数。
4. 保存工作流映射。

### 6）验证 skill 契约是否可用

查看 Agent 实际能看到的工作流：

```bash
python scripts/registry.py list --agent
```

执行一次测试调用：

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

执行一次 readiness 诊断：

```bash
python scripts/doctor.py
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

### 被 OpenClaw 正确发现的检查清单

只有当下面这些条件同时成立时，OpenClaw 才能稳定使用这个 skill：

1. 项目放在 `~/.openclaw/workspace/skills/` 下面
2. 根目录存在 `SKILL.md`
3. Python 依赖已经安装
4. `config.json` 中至少有一个可访问且已启用的服务器
5. `data/<server_id>/` 下至少存在一个已启用的工作流 / schema 对
6. `scripts/registry.py list --agent` 返回了你预期的工作流
7. `scripts/doctor.py` 没有报告阻塞性错误

### OpenClaw 实际会怎么调用

Agent 侧的交互链路是：

1. 读取 `SKILL.md`
2. 调用 `python ./scripts/registry.py list --agent`
3. 根据用户意图和暴露参数选择工作流
4. 组装 JSON 参数
5. 调用 `python ./scripts/comfyui_client.py --workflow <server_id>/<workflow_id> --args '{...}'`
6. 读取返回 JSON，并使用里面的图片路径

如果你在排查“为什么 OpenClaw 调不起来这个 skill”，优先检查的就是这条链路。

如果你要看更严格的集成契约，参见 [docs/AGENT_CONTRACT.md](./docs/AGENT_CONTRACT.md)。

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

- `http://localhost:18189`

可用于配置多个 ComfyUI 服务器地址、输出目录，以及管理工作流及 Schema 映射。

当前已经支持：

- 多服务器管理，以及服务器和工作流的双层开关
- 独立的 `Comfy Cloud` 配置 tab，支持直接 API Key 或环境变量鉴权
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
python scripts/server_manager.py add --id comfy-cloud --type comfy_cloud --api-key-env COMFY_CLOUD_API_KEY
python scripts/server_manager.py disable cloud
```
*所有服务器配置依然可以通过前端 Web UI 界面来进行图形化无缝管理。*

### Comfy Cloud 配置
当你在 Web UI 中新增或编辑服务器时，切到 `Comfy Cloud` tab。该 tab 会保存 Cloud 基础地址，以及以下二选一的鉴权方式：

- `api_key`：直接写入 `config.json`
- `api_key_env`：读取环境变量名，例如 `COMFY_CLOUD_API_KEY`

可选项：

- `use_api_key_for_partner_nodes: true`，把同一个 key 继续透传到 `extra_data.api_key_comfy_org`

运行时调用链路如下：

1. `POST /api/prompt`
2. `GET /api/job/{prompt_id}/status`
3. `GET /api/history_v2/{prompt_id}`（必要时回退到列表查询）
4. `GET /api/view`，并跟随签名重定向下载结果

开箱即用的 Cloud 工作流支持：

- 新增 `comfy_cloud` 服务器时，OpenClaw 会自动为该服务器安装一组内置 starter 工作流。
- 这些默认工作流会以 `Bundled Cloud` / 云端内置来源的形式出现在 registry 和 UI 元数据里。
- 也可以手动查看或导入模板：

```bash
python scripts/cloud_templates.py list --source bundled
python scripts/cloud_templates.py list --source official
python scripts/cloud_templates.py import --server comfy-cloud --source bundled --template text_to_image_square
python scripts/cloud_templates.py import --server comfy-cloud --source official --template text_to_image --workflow-id official-text-to-image
```

说明：

- 官方 Comfy Cloud 的 `global_subgraphs` 本质上是蓝图 / 子图定义，不是可以直接执行的 API-format workflow。
- OpenClaw 当前会提供它们的发现能力，并且只对少量经过整理的模板开放“直接可运行导入”，例如 `text_to_image`。

---

## 工作流要求（重要）

为了让这个 skill 稳定执行，请确保：

1. **工作流必须导出为 ComfyUI API 格式**
   - 在 ComfyUI 中点击 **Save (API Format)**
   - 将导出的 JSON 放到 `data/<server_id>/<workflow_id>/workflow.json`

2. **只暴露 Agent 真正需要控制的参数**
   - Schema 映射最好是 `prompt`、`seed`、`size`、`style`、`negative_prompt` 这类业务字段
   - 不要把纯实现细节节点字段一股脑暴露给 Agent，除非它真的需要
   - Registry 现在也支持可选的 `default`、`example`、`choices` 元数据，帮助 Agent 更稳定地选值

3. **工作流末端必须产生可下载的输出元数据**
   - 对本地 ComfyUI 来说，最常见的是 `Save Image`
   - 对 Comfy Cloud 或其他工作流来说，执行历史中也必须能拿到可下载文件的信息
   - 如果没有输出元数据，任务即使执行成功，skill 也无法返回文件

一句话：**API 格式工作流 + 清晰的 schema 参数面 + 可下载输出**，才是稳定的 Agent skill 基础。

---

## 常见问题

- 如果 `scripts/registry.py list --agent` 没有返回任何工作流，Agent 就没有任何可调用项。
- 可以用 `python scripts/registry.py list --agent --all --debug` 查看被隐藏的 workflow 及原因。
- `/prompt` 返回 HTTP 400：通常是工作流 payload 或参数值不合法。
- `size` 值必须符合目标节点支持的枚举（例如 `3:4,1728x2304`）。
- `config.json` 里的 ComfyUI 地址错误会导致无法提交任务。
- 如果服务器或工作流被禁用，它会从 Agent 可见清单里消失，即使磁盘上的文件还在。

## 示例

`examples/` 目录里提供了面向 skill 契约的示例资产：

- `examples/workflow_api.example.json`
- `examples/schema.example.json`
- `examples/registry-agent-output.example.json`
- `examples/doctor-output.example.txt`

这些示例主要用于说明 skill 契约形状，不保证在所有 ComfyUI 环境中都能直接执行。

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
│   └── static/                 # FastAPI 直接服务的前端构建产物
├── frontend/                   # React + TypeScript + Vite 前端源码
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
