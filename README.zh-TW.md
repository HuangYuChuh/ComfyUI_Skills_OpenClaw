<div align="center">
  <img src="./asset/banner.png" alt="ComfyUI Skills Banner">

  <h1>ComfyUI Skills for OpenClaw</h1>

  <p><strong>更適合 Agent 呼叫的 ComfyUI 工作流技能層，適用於 OpenClaw、Codex、Claude Code 以及其他 Agent。</strong></p>

  <p>
    這個專案可以把 ComfyUI 工作流變成可呼叫的 skill，並以一個更適合 Agent 使用的 CLI 作為主介面，
    同時提供一個視覺化 Web UI，用於更方便地完成設定與測試。
  </p>

  <p>
    <a href="https://huangyuchuh.github.io/ComfyUI_Skills_OpenClaw/"><img src="https://img.shields.io/badge/docs-GitHub_Pages-4F46E5?style=flat&logo=gitbook&logoColor=white" alt="Docs"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/blob/main/LICENSE"><img src="https://img.shields.io/github/license/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat&color=10B981&logo=data%3Aimage/svg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Im0xNiAxNiAzLTggMyA4Yy0uODcuNjUtMS45MiAxLTMgMXMtMi4xMy0uMzUtMy0xWiIvPjxwYXRoIGQ9Im0yIDE2IDMtOCAzIDhjLS44Ny42NS0xLjkyIDEtMyAxcy0yLjEzLS4zNS0zLTFaIi8%2BPHBhdGggZD0iTTcgMjFoMTAiLz48cGF0aCBkPSJNMTIgM3YxOCIvPjxwYXRoIGQ9Ik0zIDdoMmMyIDAgNS0xIDctMiAyIDEgNSAyIDcgMmgyIi8%2BPC9zdmc%2B" alt="License"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/stargazers"><img src="https://img.shields.io/github/stars/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat&color=EAB308&logo=github" alt="GitHub stars"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/network/members"><img src="https://img.shields.io/github/forks/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat&color=F97316&logo=github" alt="GitHub forks"></a>
    <a href="https://www.python.org/"><img src="https://img.shields.io/static/v1?label=Python&message=3.10%2B&color=3B82F6&style=flat&logo=python&logoColor=white" alt="Python 3.10+"></a>
  </p>

  <p>
    <a href="https://www.bilibili.com/video/BV1a6cUzVEE6/">🎬 示範影片</a> ·
    <a href="https://huangyuchuh.github.io/ComfyUI_Skills_OpenClaw/">📘 文件站</a> ·
    <a href="#quick-start">🧭 快速開始</a> ·
    <a href="#web-ui">🖥️ Web UI</a> ·
    <a href="#multi-server-management">🛰️ 多伺服器</a>
  </p>

  <p>
    <a href="./README.md">English</a> ·
    <a href="./README.zh.md">简体中文</a> ·
    <strong>繁體中文</strong> ·
    <a href="./README.ja.md">日本語</a>
  </p>
</div>

---

## 概覽

ComfyUI Skills for OpenClaw 是一個更適合 Agent 呼叫的橋接層，用來把 ComfyUI 工作流封裝成 Agent 可呼叫的技能。

它不是讓 Agent 直接操作原始的 ComfyUI graph，而是透過 CLI 和基於 schema 的參數映射，為每個工作流提供一個更清晰、更可控的呼叫介面。只要 Agent 能執行 Shell 指令，就可以與它配合使用，包括 OpenClaw、Codex、Claude Code 等。

當你想匯入既有的 ComfyUI 工作流、只暴露必要參數、在聊天或 Agent 任務中直接呼叫，並把整個流程統一到一個穩定的工作流層時，這個專案就很適合。

| 適合誰 | 你能得到什麼 |
|--------|--------------|
| OpenClaw、Codex、Claude Code 使用者 | 一個 Agent 可以安全呼叫的 ComfyUI 工作流層 |
| 已有 ComfyUI 工作流的使用者 | 在不暴露完整 graph 的前提下重用已匯出的工作流 |
| 多機部署場景 | 用統一命名空間管理本地與遠端 ComfyUI 伺服器 |
| 希望視覺化設定與測試的使用者 | 一個可選的 Web UI，用來設定、預覽並驗證工作流，再交給 Agent 使用 |

## 為什麼做這個專案

直接使用 ComfyUI 很強大，但並不適合 Agent 驅動的執行方式。

原始工作流 graph 資訊量大、結構噪音多，而且對 Agent 來說不夠安全。直接呼叫 ComfyUI API 也代表你需要自己處理參數注入、工作流命名、伺服器選擇、依賴檢查與輸出回收等問題。這個專案在 ComfyUI 之上加了一層更穩定的抽象，讓 Agent 可以發現工作流、用結構化參數呼叫，並獲得更可預測的結果。

相比直接使用 ComfyUI 工作流或更底層的互動方式，這個專案的 CLI 明顯更偏向 Agent 友善：輸入更清晰、參數暴露更安全、工作流發現更直接，執行結果也更穩定可預測。

它特別適合這些需求：

- 把現有的 ComfyUI 工作流變成 Agent 工具
- 只暴露安全、可控的參數介面，而不是整個 graph
- 在多台 ComfyUI 伺服器之間調度工作流
- 在 OpenClaw、Codex、Claude Code 等不同 Agent 環境中重用同一套工作流設定

## 功能特性

| 能力 | 價值 |
|------|------|
| **面向 Agent 的 CLI** | 這個 CLI 的設計重點不是只方便人手動操作，而是更適合 Agent 呼叫。相比直接面對原始 ComfyUI graph 或更底層的 ComfyUI 互動方式，它提供了更清晰的輸入與更可靠的呼叫介面。 |
| **基於 schema 的參數映射** | 只暴露你希望 Agent 控制的欄位，並為參數提供別名、型別與描述。 |
| **ComfyUI 工作流匯入** | 匯入工作流 JSON，自動識別格式，並生成 Agent 可用的映射層。 |
| **多伺服器路由** | 用統一命名空間管理本地與遠端 ComfyUI 伺服器，並把任務送到正確的機器上。 |
| **依賴檢查與安裝** | 在執行前檢查缺失的節點與模型，並透過 CLI 安裝支援的依賴。 |
| **可選 Web UI** | 一個用於設定與測試的視覺化層。它不取代 CLI，面向 Agent 的能力仍然對應同一套 CLI 工作流。 |

<a id="quick-start"></a>
## 快速開始

幾分鐘內跑通 ComfyUI Skills。

開始之前，請先確認你已具備：

- Python 3.10+
- 一台正在執行的 ComfyUI 伺服器
- 如果想立刻測試執行，請先準備一個 ComfyUI API 格式匯出的工作流

### 1. 複製專案

根據你的 Agent 環境選擇對應目錄。

<details>
<summary><strong>用於 OpenClaw</strong></summary>

```bash
cd ~/.openclaw/workspace/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw
```

</details>

<details>
<summary><strong>用於 Claude Code</strong></summary>

```bash
cd ~/.claude/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
```

</details>

<details>
<summary><strong>用於 Codex</strong></summary>

```bash
cd ~/.codex/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
```

</details>

### 2. 建立本地設定

```bash
cp config.example.json config.json
```

### 3. 安裝 CLI

```bash
pipx install comfyui-skill-cli
```

或者：

```bash
pip install comfyui-skill-cli
```

如果你已經安裝過 CLI，升級命令如下：

```bash
# 如果你是用 pipx 安裝的
pipx upgrade comfyui-skill-cli

# 如果你是用 pip 安裝的
python3 -m pip install -U comfyui-skill-cli
```

### 4. 驗證環境

```bash
comfyui-skill server status
comfyui-skill list
```

### 5. 匯入並執行第一個工作流

```bash
comfyui-skill workflow import /absolute/path/to/my-workflow.json
comfyui-skill deps check local/my-workflow
comfyui-skill run local/my-workflow --args '{"prompt": "a white cat"}'
```

手動使用 CLI 匯入時，推薦直接傳 workflow JSON 的絕對路徑，這樣最不容易出錯，也不會引入額外的目錄規範。

例如：

```bash
comfyui-skill workflow import /Users/yourname/Downloads/my-workflow.json
```

匯入完成後，CLI 會把標準化後的工作流和 schema 儲存到 `data/<server_id>/<workflow_id>/` 下，例如 `data/local/my-workflow/workflow.json` 和 `data/local/my-workflow/schema.json`。

這也是 Web UI 和 Agent/OpenClaw 匯入時遵循的正式目錄規範：

```bash
data/<server_id>/<workflow_id>/
  workflow.json
  schema.json
  history/
```

到這裡，CLI 就會讀取本地 `config.json`、發現可用工作流，並透過你的 ComfyUI 伺服器執行它們。

如果你更希望用視覺化方式完成設定與測試，可以繼續看下方的 [Web UI](#web-ui) 章節。

## 設定路徑

根據你的使用方式選擇對應路徑。

### OpenClaw

如果你希望 OpenClaw 自動發現並執行 ComfyUI 工作流技能，就走這條路徑。

- 把倉庫複製到 `~/.openclaw/workspace/skills`
- 安裝 `comfyui-skill-cli`
- 設定 `config.json`
- 匯入工作流並暴露 Agent 可安全使用的參數

### Codex 或 Claude Code

如果你希望編碼類 Agent 透過 Shell 指令呼叫 ComfyUI 工作流，就走這條路徑。

- 把倉庫複製到 Agent 的 skills 目錄
- 安裝 CLI
- 用 `comfyui-skill list` 驗證環境
- 用結構化的 `--args` 執行工作流

### Web UI

如果你希望透過一個視覺化介面完成設定、檢查與測試，同時仍然以 CLI 作為 Agent 的主介面，就走這條路徑。

```bash
./ui/run_ui.sh
```

啟動腳本會在需要時自動建立專案級 `.venv`，並把 UI 依賴安裝到這個虛擬環境中。

然後開啟：

```text
http://localhost:18189
```

### 手動設定

如果你想直接控制 `config.json`、`workflow.json` 和 `schema.json`，就走這條路徑。

<details>
<summary><strong>展開查看手動設定範例</strong></summary>

#### 1）編輯 `config.json`

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

#### 2）放置工作流檔案

```text
data/local/my-workflow/
  workflow.json  # ComfyUI API 格式匯出
  schema.json    # 參數映射
```

#### 3）編寫 `schema.json`

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
      "description": "提示詞"
    }
  }
}
```

</details>

## 運作原理

這個專案在 Agent 與 ComfyUI 工作流之間增加了一層受控執行層。

1. 從 ComfyUI 以 API 格式匯出工作流。
2. 匯入工作流，並定義哪些參數需要對外暴露。
3. 把映射關係保存到 `schema.json`。
4. 透過 `comfyui-skill` 用結構化參數呼叫工作流。
5. 把任務提交到目標 ComfyUI 伺服器，並回傳生成結果。

實際流程大致如下：

```text
ComfyUI workflow.json
  -> schema.json 參數映射
  -> comfyui-skill CLI
  -> ComfyUI server
  -> 生成圖片輸出
```

這種結構讓 Agent 面對的是一個穩定的呼叫契約，而不是直接去理解原始的 ComfyUI graph 節點。

## 常用命令

下面這些命令覆蓋了最常見的使用場景。

### 發現工作流

```bash
comfyui-skill list
comfyui-skill info local/txt2img
```

### 執行工作流

```bash
comfyui-skill run local/txt2img --args '{"prompt": "a white cat"}'
```

### 非同步提交工作流

```bash
comfyui-skill submit local/txt2img --args '{"prompt": "a white cat"}'
comfyui-skill status <prompt_id>
```

### 匯入工作流

```bash
comfyui-skill workflow import /absolute/path/to/my-workflow.json --check-deps
```

推薦手動 CLI 匯入時直接傳絕對路徑。匯入成功後，正式檔案會寫入 `data/<server_id>/<workflow_id>/`。

### 檢查依賴

```bash
comfyui-skill deps check local/my-workflow
comfyui-skill deps install local/my-workflow --all
```

### 管理伺服器

```bash
comfyui-skill server list
comfyui-skill server add --id remote --url http://10.0.0.1:8188
comfyui-skill server status
```

完整 CLI 文件見 [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI)。

## 工作流要求

為了讓專案穩定執行，每個工作流最好滿足以下條件。

- 工作流必須以 ComfyUI API 格式匯出。
- 工作流內應包含 `Save Image` 這類輸出節點。
- 需要有一個 `schema.json` 映射層，方便 Agent 透過清晰參數介面呼叫。
- 目標 ComfyUI 伺服器需要提前安裝好對應的自定義節點與模型。

如果你使用 `comfyui-skill workflow import`，CLI 可以幫助生成映射並在執行前檢查依賴。

<a id="multi-server-management"></a>
## 多伺服器管理

這個專案從設計上就支援多台 ComfyUI 伺服器。

你可以把本地與遠端的 ComfyUI 實例統一放到同一個設定中，透過命名空間來路由工作流。這很適合不同機器負責不同任務的場景，例如本地輕量測試、大顯存機器跑重任務，或按模型環境拆分伺服器。

例如：

```bash
comfyui-skill server add --id local --url http://127.0.0.1:8188
comfyui-skill server add --id remote-a100 --url http://10.0.0.20:8188
comfyui-skill server list
```

工作流使用下面這種格式標識：

```text
<server_id>/<workflow_id>
```

例如：

```text
local/txt2img
remote-a100/sdxl-base
```

伺服器與工作流都支援啟用/停用開關，所以 Agent 只能看到目前可用的工作流。

你也可以透過下面這些命令在不同機器之間遷移設定：

```bash
comfyui-skill config export --output ./backup.json
comfyui-skill config import ./backup.json --dry-run
comfyui-skill config import ./backup.json
```

<a id="web-ui"></a>
## Web UI

專案提供了一個本地 Web 介面，用於視覺化設定與測試。它是可選的，存在的主要目的是讓 setup、檢查與驗證更直觀；這個 skill 本身仍然是為 Agent 透過 CLI 呼叫而設計的。

### 啟動

```bash
./ui/run_ui.sh                    # macOS/Linux
# 或: ui\run_ui.bat               # Windows
```

啟動腳本會在需要時自動建立專案級 `.venv`，並把 UI 依賴安裝到這個虛擬環境中，不需要全域安裝 Web UI 依賴。

開啟 `http://localhost:18189`。

### 你可以在 Web UI 裡做什麼

- 上傳從 ComfyUI 匯出的工作流
- 用視覺化編輯器設定參數映射
- 統一管理多台伺服器與工作流
- 搜尋、排序與查看工作流定義
- 在交給 Agent 使用之前，對工作流設定進行測試與驗證
- 在英文、簡體中文與繁體中文之間切換介面語言

Web UI 中的設定最終都會映射回同一套底層 CLI 流程。它是設定與測試的視覺化輔助層，不是另一套獨立的執行模型。

前端原始碼位於[獨立倉庫](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend)。

## 常見問題

### `/prompt` 回傳 HTTP 400

工作流 payload 或注入後的某個參數值不合法。

請檢查：

- 工作流是否以 API 格式匯出
- schema 映射是否指向了正確的節點與欄位
- 傳入參數的型別是否與 schema 定義一致

### 沒有回傳圖片

工作流裡可能缺少有效的輸出節點，例如 `Save Image`。

### 連線失敗

請檢查：

- ComfyUI 伺服器是否已經啟動
- `config.json` 中的伺服器 URL 是否正確
- 目前選擇的伺服器是否處於啟用狀態

### 缺少節點或模型

執行：

```bash
comfyui-skill deps check <workflow_id>
```

然後按需安裝支援的依賴。

## 更新日誌

最近的重要更新：

- **v0.4.0**：遷移至 [CLI 優先架構](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI) — 所有工作流操作（`run`、`submit`、`status`、`import`、`deps`）統一透過獨立 CLI 執行，舊版 Python 腳本已移除。
- **v0.3.1**：新增 ComfyUI API Key 支援，可用於 Kling、Sora、Nano Banana 等雲 API 節點。
- **v0.3.0**：新增依賴檢查與安裝、非阻塞 `submit` / `status`、圖片上傳、匯入預覽與執行歷史。

完整版本記錄見 [CHANGELOG.zh.md](./CHANGELOG.zh.md)。

## 相關資源

- [English README](./README.md)
- [简体中文 README](./README.zh.md)
- [繁體中文 README](./README.zh-TW.md)
- [日本語 README](./README.ja.md)
- [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI)
- [Frontend Repository](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend)
