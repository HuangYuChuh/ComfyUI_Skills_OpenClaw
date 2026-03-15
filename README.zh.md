# ComfyUI Skills for OpenClaw

![ComfyUI Skills Banner](./asset/banner-ui-20250309.jpg)
这是一个面向 OpenClaw、Codex 和 Claude Code 的 ComfyUI Skill 集成层：支持调用你在 ComfyUI 中自行编排并导出（API格式）的 Workflow，将其封装为可被这些 Agent 通过自然语言触发的 Skills。

它会把自然语言请求转成结构化的 Skill 参数，映射到 ComfyUI 工作流输入后提交执行，等待任务完成并将生成图片下载到本地。

上游 ComfyUI 本地服务路由说明见：[`docs/comfyui-native-routes.zh.md`](./docs/comfyui-native-routes.zh.md)。

---

## 功能特性

### 工作流转 Skill
- 把你在 ComfyUI 里搭好的工作流，直接变成 OpenClaw、Codex、Claude Code 能调用的技能
- 三步完成参数配置：上传工作流 → 选择要暴露的节点 → 设定参数名称和说明
- 上传工作流后自动识别可配置的输入节点，不需要手动逐个查找
- 工作流更新时可以先预览参数变化，已有的映射关系会自动迁移

### 多服务器管理
- 同时管理多台 ComfyUI 服务器，按需把生图任务分发到不同机器
- 服务器和工作流各自有独立开关，只有两者都开启时 Agent 才能看到
- 同名工作流在不同服务器上互不干扰，通过 `服务器/工作流` 的组合 ID 区分
- 可以为每台服务器单独设置输出目录，并指定默认服务器

### 管理界面
- 提供本地 Web 界面，统一管理所有服务器和工作流
- 支持拖拽调整工作流顺序，也可按名称、启用状态等方式排序
- 可跨服务器搜索和筛选工作流
- 支持英文、简体中文、繁体中文三种语言，界面内一键切换

### 配置迁移
- 一键导出当前配置和工作流，打包为一个 JSON 文件
- 导出时可以按需选择，只打包你需要的工作流
- 导入前先预览变更内容，确认无误后再执行
- 可控制是否覆盖已有工作流、是否同步源机器的环境设置

### 工作流执行
- 提交生图任务后自动等待完成，生成的图片直接下载到本地
- 支持单次生成多张图片
- Agent 可通过命令行查询所有可用工作流及其参数，便于自动化调用

### CLI 工具
- 提供完整的命令行工具集，适合无界面环境或脚本化使用
- 涵盖服务器管理、工作流查询、任务执行、配置导入导出四项核心操作

## ComfyUI 原生 API 范围

这个仓库建议按两层来理解：

- ComfyUI 原生服务路由（目标生图服务），例如 `/prompt`、`/history/{prompt_id}`、`/view`、`/ws`、`/queue`
- 本项目自己的管理 API（`/api/*`），用于本地 UI 管理服务器、工作流和配置迁移

当前 Skill 的核心执行链路是：

1. `POST /prompt`
2. `GET /history/{prompt_id}`
3. `GET /view`

更细的路由说明见：[`docs/comfyui-native-routes.zh.md`](./docs/comfyui-native-routes.zh.md)。

---

## 安装

<details>
<summary><strong>ComfyUI Skills for OpenClaw</strong></summary>

手动安装：

```bash
cd ~/.openclaw/workspace/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
cp config.example.json config.json
```



让 OpenClaw 帮你安装：

把下面这段话发给 OpenClaw 即可：

```text
请帮我把这个 ComfyUI skill 安装到我的 OpenClaw workspace 里。

目标路径：
~/.openclaw/workspace/skills/comfyui-skill-openclaw/

要求：
1. 先执行 `cd ~/.openclaw/workspace/skills`。
2. 将这个仓库克隆为 `comfyui-skill-openclaw` 目录。
3. 保留根目录下的 SKILL.md。
4. 安装 requirements.txt 里的 Python 依赖。
5. 执行 `cp config.example.json config.json`。
6. 如果我没有额外指定，就默认把 ComfyUI 地址设置为 http://127.0.0.1:8188。
7. 安装完成后，确保 OpenClaw 可以发现并调用这个 skill。
```

</details>

<details>
<summary><strong>ComfyUI Skills for Claude Code</strong></summary>

手动安装：

```bash
cd ~/.claude/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
cp config.example.json config.json
```



让 Claude Code 帮你安装：

把下面这段话发给 Claude Code 即可：

```text
请帮我把这个 ComfyUI skill 安装到我的 Claude Code skills 目录里。

目标路径：
~/.claude/skills/comfyui-skill/

要求：
1. 先执行 `cd ~/.claude/skills`（如果目录不存在请先创建）。
2. 将这个仓库克隆为 `comfyui-skill` 目录。
3. 保留根目录下的 SKILL.md。
4. 安装 requirements.txt 里的 Python 依赖。
5. 执行 `cp config.example.json config.json`。
6. 如果我没有额外指定，就默认把 ComfyUI 地址设置为 http://127.0.0.1:8188。
7. 安装完成后，确保 Claude Code 可以发现并调用这个 skill。
```

</details>

<details>
<summary><strong>ComfyUI Skills for Codex</strong></summary>

手动安装：

```bash
cd ~/.codex/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
cp config.example.json config.json
```



让 Codex 帮你安装：

把下面这段话发给 Codex 即可：

```text
请帮我把这个 ComfyUI skill 安装到我的 Codex skills 目录里。

目标路径：
~/.codex/skills/comfyui-skill/

要求：
1. 先执行 `cd ~/.codex/skills`（如果目录不存在请先创建）。
2. 将这个仓库克隆为 `comfyui-skill` 目录。
3. 保留根目录下的 SKILL.md。
4. 安装 requirements.txt 里的 Python 依赖。
5. 执行 `cp config.example.json config.json`。
6. 如果我没有额外指定，就默认把 ComfyUI 地址设置为 http://127.0.0.1:8188。
7. 安装完成后，确保 Codex 可以发现并调用这个 skill。
```

</details>

## 配置 ComfyUI 工作流

开始配置前，请先确保 ComfyUI 服务已经运行，本地 ComfyUI 默认地址是 `http://127.0.0.1:8188`。

### 通过 UI 配置（推荐）

- macOS/Linux：`./ui/run_ui.sh`，或双击 `ui/run_ui.command`
- Windows：`ui\run_ui.bat`
- 访问：`http://localhost:18189`
- 上传从 ComfyUI 导出的工作流 JSON，格式必须是 **Save (API Format)**
- 在 UI 中添加第一个 ComfyUI 服务器
- 选择要暴露给 OpenClaw 的参数并保存映射

### 通过配置文件配置

#### 1）编辑 `config.json`

先配置服务器信息。最小示例如下：

```jsonc
{
  "servers": [
    {
      "id": "local",                  // 服务器 ID，后面会作为目录名和工作流调用前缀
      "name": "Local",                // 服务器显示名称
      "url": "http://127.0.0.1:8188", // ComfyUI 服务地址
      "enabled": true,                // 是否启用这个服务器
      "output_dir": "./outputs"       // 图片输出目录
    }
  ],
  "default_server": "local"           // 默认服务器 ID
}
```

#### 2）放置工作流文件

每个工作流使用一个独立目录，例如：

```bash
data/local/Default/
  workflow.json  # 从 ComfyUI 导出的 API 格式工作流
  schema.json    # 对外暴露给 OpenClaw/Agent 的参数映射
```

#### 3）编写 `schema.json`

`schema.json` 至少需要包含：

- `description`
- `enabled`
- `parameters`

最小示例如下：

```jsonc
{
  "description": "默认测试工作流", // 给 OpenClaw/Agent 看的工作流说明
  "enabled": true,               // 是否启用这个工作流
  "parameters": {
    "prompt": {                  // 暴露给 OpenClaw/Agent 的参数名
      "node_id": 10,             // workflow.json 里的节点 ID
      "field": "prompt",         // 该节点 inputs 里的字段名
      "required": true,          // 是否必填
      "type": "string",          // 参数类型
      "description": "提示词"     // 参数说明
    },
    "seed": {
      "node_id": 10,
      "field": "seed",
      "required": false,
      "type": "int",
      "description": "随机种子"
    }
  }
}
```

说明：

- 工作流 ID 直接由目录名决定；例如目录是 `data/local/Default/`，工作流 ID 就是 `Default`
- `parameters` 里的每个字段，表示一个要暴露给 OpenClaw/Agent 的输入参数
- `node_id` 和 `field` 需要对应到 `workflow.json` 里实际的节点和输入字段

如果你想看完整示例，可以直接参考仓库里的现成文件：

- `data/local/Default/workflow.json`
- `data/local/Default/schema.json`
- 这两个文件是通用示例；运行前请先把 `workflow.json` 里节点 `4` 的 `ckpt_name` 改成你本地 ComfyUI 可用的 checkpoint 名称

#### 4）验证配置是否成功

查看工作流列表：

```bash
python scripts/registry.py list
```

执行一次测试生图：

```bash
python scripts/comfyui_client.py \
  --workflow <server_id>/<workflow_id> \
  --args '{"prompt":"test"}'
```

例如：

```bash
python scripts/comfyui_client.py \
  --workflow local/Default \
  --args '{"prompt":"一张高质感产品摄影图"}'
```

成功后会返回类似：

```json
{
  "status": "success",
  "prompt_id": "...",
  "images": ["./outputs/<prompt_id>_...png"]
}
```

### 通过 Agent 配置

- 让 OpenClaw 或其他 Agent 帮你编辑 `config.json`
- 让 Agent 将 workflow JSON 和 schema JSON 写入对应目录
- 写入完成后，再让 Agent 帮你执行一次验证

### 工作流要求

**API 格式工作流 + Save Image 输出节点** 是稳定可用的基础要求。为了稳定执行，请确保：

1. **工作流必须导出为 ComfyUI API 格式**
   - 在 ComfyUI 中点击 **Save (API Format)**
   - 将导出的 JSON 放到 `data/<server_id>/<workflow_id>/workflow.json`

2. **工作流末端必须包含 `Save Image` 节点**
   - 当前客户端是从 ComfyUI 的输出图像中下载结果
   - 如果没有 `Save Image`（或等价的图像输出），可能会“执行成功但拿不到图片”


---

## 多服务器管理

可以配置多个不同的 ComfyUI 服务器，方便 OpenClaw/Agent 将生图任务分发到不同算力节点（例如本机 GPU、远程实例等）。

### 核心概念
- **双层控制开关**：`服务器` 和 `独立工作流` 均有各自的开启/关闭状态。OpenClaw 只能发现**两者均开启**的工作流。
- **命名空间组合**：OpenClaw 识别工作流的唯一标识为 `<server_id>/<workflow_id>` 的复合格式（例如：`local/test` 与 `remote/test`）。

### 命令行工具配置
在无 GUI 的 Linux 机器部署时，可使用内置的 CLI 工具（`scripts/server_manager.py`）进行管理：
```bash
python scripts/server_manager.py list
python scripts/server_manager.py add --id remote --name "Remote Node" --url http://10.0.0.1:8188
python scripts/server_manager.py disable remote
```
*所有服务器配置依然可以通过前端 Web UI 界面来进行图形化无缝管理。*

### 配置迁移

如果你更换了部署路径，或者想把当前 Skill 的工作流映射迁移到另一台机器，可以直接使用内置的 bundle 机制。

UI 方式：

- 在主界面点击 `导出配置`，浏览器会下载一个 `openclaw-skill-export.json`
- 导出前可以按服务器展开，并取消勾选不想导出的 workflow；默认全部选中，服务器默认折叠
- 在目标机器打开 UI，点击 `导入配置`
- 选择刚才导出的 JSON 文件
- 系统会先显示预检结果，再确认是否同时应用源机器的默认服务器、URL 和输出目录

CLI 方式：

```bash
python scripts/transfer_manager.py export --output ./openclaw-skill-export.json
python scripts/transfer_manager.py import --input ./openclaw-skill-export.json --dry-run
python scripts/transfer_manager.py import --input ./openclaw-skill-export.json
```

可选参数：

- `--apply-environment`：导入时同时应用 bundle 中的环境配置
- `--no-overwrite`：导入时如果工作流已存在，则跳过而不是覆盖

默认导入策略：

- 同名工作流默认覆盖
- 已存在服务器会做合并导入
- 默认保留目标机器当前的 `url`、`output_dir` 和 `default_server`

---

## 常见问题

- `/prompt` 返回 HTTP 400：通常是工作流 payload 或参数值不合法。
- `size` 值必须符合目标节点支持的枚举（例如 `3:4,1728x2304`）。
- `config.json` 里的 ComfyUI 地址错误会导致无法提交任务。

---

## 路线图

- [ ] 支持工作流版本历史和回滚
- [x] 上传新版本前先预览参数变化
- [x] 工作流升级时支持参数迁移
- [ ] 增强提交前参数校验
- [ ] 更清晰展示 ComfyUI 返回的节点错误
- [ ] 支持批量多 seed 生成

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
│   │   └── <workflow_id>/
│   │       ├── workflow.json       # ComfyUI API 格式工作流
│   │       └── schema.json         # 对外参数映射
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
