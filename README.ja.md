<div align="center">
  <img src="./asset/banner.png" alt="ComfyUI Skills Banner">

  <h1>ComfyUI Skills for OpenClaw</h1>

  <p><strong>OpenClaw、Codex、Claude Code、その他の Agent 向けに最適化された、Agent-friendly な ComfyUI ワークフロースキル層です。</strong></p>

  <p>
    このプロジェクトは ComfyUI ワークフローを呼び出し可能な skill に変換し、
    Agent 向けに扱いやすい CLI を主インターフェースとして提供しつつ、
    設定とテストをより簡単にするための視覚的な Web UI も用意しています。
  </p>

  <p>
    <a href="https://huangyuchuh.github.io/ComfyUI_Skills_OpenClaw/">
      <img src="https://img.shields.io/badge/docs-GitHub_Pages-0A7EA4?style=flat" alt="Docs">
    </a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat" alt="License">
    </a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/stargazers">
      <img src="https://img.shields.io/github/stars/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat" alt="GitHub stars">
    </a>
  </p>

  <p>
    <a href="https://www.bilibili.com/video/BV1a6cUzVEE6/">🎬 Demo Video</a> ·
    <a href="https://huangyuchuh.github.io/ComfyUI_Skills_OpenClaw/">📘 Docs</a> ·
    <a href="#quick-start">🧭 クイックスタート</a> ·
    <a href="#web-ui">🖥️ Web UI</a> ·
    <a href="#multi-server-management">🛰️ マルチサーバー</a>
  </p>

  <p>
    <a href="./README.md">English</a> ·
    <a href="./README.zh.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a> ·
    <strong>日本語</strong>
  </p>
</div>

---

## 概要

ComfyUI Skills for OpenClaw は、ComfyUI ワークフローを Agent から呼び出せる skill に変換するための、Agent-friendly なブリッジ層です。

Agent に生の ComfyUI graph を直接扱わせるのではなく、CLI と schema ベースのパラメータマッピングによって、各ワークフローに対してより明確で制御しやすい呼び出しインターフェースを提供します。Shell コマンドを実行できる Agent であれば、OpenClaw、Codex、Claude Code などを含めて利用できます。

既存の ComfyUI ワークフローを取り込み、必要なパラメータだけを公開し、チャットや Agent タスクから直接呼び出し、全体を一貫したワークフロー層として管理したい場合に適しています。

| 対象ユーザー | 得られるもの |
|--------------|--------------|
| OpenClaw、Codex、Claude Code のユーザー | Agent が安全に呼び出せる ComfyUI ワークフロー層 |
| 既存の ComfyUI ワークフローを持つユーザー | 完全な graph を公開せずにエクスポート済みワークフローを再利用する方法 |
| 複数マシン構成のユーザー | ローカルとリモートの ComfyUI サーバーを統一ネームスペースで管理する仕組み |
| 視覚的な設定とテストを行いたいユーザー | Agent に渡す前にワークフローを設定・プレビュー・検証できるオプションの Web UI |

## このプロジェクトが必要な理由

ComfyUI を直接使う方法は強力ですが、Agent 主導の実行には向いていません。

生のワークフロー graph は情報量が多く、ノイズも大きいため、Agent が安全に扱うには不向きです。ComfyUI API を直接叩く場合も、パラメータ注入、ワークフロー命名、サーバー選択、依存関係チェック、出力の回収などを自分で処理する必要があります。このプロジェクトは ComfyUI の上に安定した抽象化レイヤーを追加し、Agent がワークフローを発見し、構造化された引数で呼び出し、予測しやすい結果を得られるようにします。

ComfyUI ワークフローやより低レベルな操作方法を直接扱う場合と比べると、このプロジェクトの CLI は明らかに Agent 向きです。入力がより明確で、パラメータ公開も安全で、ワークフローの発見もしやすく、実行結果もより安定して予測可能です。

特に次のようなニーズに向いています。

- 既存の ComfyUI ワークフローを Agent 用ツールにしたい
- graph 全体ではなく、安全で制御しやすいパラメータインターフェースだけを公開したい
- 複数の ComfyUI サーバー間でワークフローを振り分けたい
- OpenClaw、Codex、Claude Code など複数の Agent 環境で同じワークフロー設定を再利用したい

## 主な機能

| 機能 | 価値 |
|------|------|
| **Agent-friendly CLI** | 人間の手作業だけでなく Agent 呼び出しに適した設計です。生の ComfyUI graph や低レベルな ComfyUI の操作を直接扱うよりも、より明確な入力と信頼しやすい呼び出しインターフェースを提供します。 |
| **schema ベースのパラメータマッピング** | Agent に制御させたい項目だけを公開し、エイリアス・型・説明を持たせられます。 |
| **ComfyUI ワークフローのインポート** | ワークフロー JSON を取り込み、形式を自動判別し、Agent 向けのマッピング層を生成します。 |
| **マルチサーバールーティング** | ローカルおよびリモートの ComfyUI サーバーを統一ネームスペースで管理し、適切なマシンへジョブを送れます。 |
| **依存関係のチェックとインストール** | 実行前に不足しているノードやモデルを確認し、CLI から対応する依存関係をインストールできます。 |
| **オプションの Web UI** | 設定とテストのための視覚レイヤーです。CLI を置き換えるものではなく、Agent 向け機能は同じ CLI ワークフローに対応しています。 |

<a id="quick-start"></a>
## クイックスタート

数分で ComfyUI Skills を動かせます。

始める前に、次を確認してください。

- Python 3.10+
- 動作中の ComfyUI サーバー
- すぐに実行テストしたい場合は、ComfyUI API 形式でエクスポートしたワークフロー

### 1. プロジェクトをクローンする

利用する Agent 環境に合ったディレクトリを選んでください。

<details>
<summary><strong>OpenClaw 用</strong></summary>

```bash
cd ~/.openclaw/workspace/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill-openclaw
cd comfyui-skill-openclaw
```

</details>

<details>
<summary><strong>Claude Code 用</strong></summary>

```bash
cd ~/.claude/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
```

</details>

<details>
<summary><strong>Codex 用</strong></summary>

```bash
cd ~/.codex/skills
git clone https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw.git comfyui-skill
cd comfyui-skill
```

</details>

### 2. ローカル設定を作成する

```bash
cp config.example.json config.json
```

### 3. CLI をインストールする

```bash
pipx install comfyui-skill-cli
```

または:

```bash
pip install comfyui-skill-cli
```

すでに CLI をインストール済みの場合は、次のコマンドで更新できます。

```bash
# pipx でインストールした場合
pipx upgrade comfyui-skill-cli

# pip でインストールした場合
python3 -m pip install -U comfyui-skill-cli
```

### 4. セットアップを確認する

```bash
comfyui-skill server status
comfyui-skill list
```

### 5. 最初のワークフローをインポートして実行する

```bash
comfyui-skill workflow import /absolute/path/to/my-workflow.json
comfyui-skill deps check local/my-workflow
comfyui-skill run local/my-workflow --args '{"prompt": "a white cat"}'
```

手動で CLI からインポートする場合は、workflow JSON の絶対パスをそのまま渡す方法を推奨します。その方が分かりやすく、余計なディレクトリ規約も増えません。

例:

```bash
comfyui-skill workflow import /Users/yourname/Downloads/my-workflow.json
```

インポート後、CLI は正規化された workflow と schema を `data/<server_id>/<workflow_id>/` に保存します。たとえば `data/local/my-workflow/workflow.json` と `data/local/my-workflow/schema.json` です。

これは Web UI と Agent/OpenClaw によるインポートでも共通の正式レイアウトです:

```bash
data/<server_id>/<workflow_id>/
  workflow.json
  schema.json
  history/
```

ここまでで、CLI はローカルの `config.json` を読み込み、利用可能なワークフローを発見し、ComfyUI サーバー経由で実行します。

視覚的な設定やテストを使いたい場合は、下の [Web UI](#web-ui) セクションを参照してください。

## セットアップの選択肢

利用方法に応じて適切なパスを選んでください。

### OpenClaw

OpenClaw に ComfyUI ワークフロースキルを自動で検出・実行させたい場合はこちらです。

- リポジトリを `~/.openclaw/workspace/skills` にクローンする
- `comfyui-skill-cli` をインストールする
- `config.json` を設定する
- ワークフローをインポートし、Agent が安全に使えるパラメータだけを公開する

### Codex または Claude Code

コード系 Agent から Shell コマンド経由で ComfyUI ワークフローを呼び出したい場合はこちらです。

- リポジトリを Agent の skills ディレクトリにクローンする
- CLI をインストールする
- `comfyui-skill list` で環境を確認する
- 構造化された `--args` でワークフローを実行する

### Web UI

CLI を Agent の主インターフェースとして保ちつつ、設定・確認・テストを視覚的に行いたい場合はこちらです。

```bash
./ui/run_ui.sh
```

起動スクリプトは必要に応じてプロジェクト用の `.venv` を自動作成し、その仮想環境に UI 依存関係をインストールします。

その後、次を開いてください。

```text
http://localhost:18189
```

### 手動設定

`config.json`、`workflow.json`、`schema.json` を直接管理したい場合はこちらです。

<details>
<summary><strong>手動設定例を展開</strong></summary>

#### 1) `config.json` を編集する

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

#### 2) ワークフローファイルを配置する

```text
data/local/my-workflow/
  workflow.json  # ComfyUI API 形式でエクスポート
  schema.json    # パラメータマッピング
```

#### 3) `schema.json` を書く

```jsonc
{
  "description": "My workflow",
  "enabled": true,
  "parameters": {
    "prompt": {
      "node_id": 10,
      "field": "prompt",
      "required": true,
      "type": "string",
      "description": "Prompt text"
    }
  }
}
```

</details>

## 仕組み

このプロジェクトは、Agent と ComfyUI ワークフローの間に制御された実行レイヤーを追加します。

1. ComfyUI からワークフローを API 形式でエクスポートする
2. ワークフローをインポートし、公開するパラメータを定義する
3. そのマッピングを `schema.json` に保存する
4. `comfyui-skill` を使って構造化された引数でワークフローを呼び出す
5. 対象の ComfyUI サーバーにジョブを送信し、生成結果を返す

実際の流れは次のようになります。

```text
ComfyUI workflow.json
  -> schema.json parameter mapping
  -> comfyui-skill CLI
  -> ComfyUI server
  -> generated image outputs
```

この構造により、Agent は生の ComfyUI graph ノードを理解する代わりに、安定した呼び出し契約を扱うことができます。

## よく使うコマンド

以下は最も一般的な操作に使うコマンドです。

### ワークフローを一覧する

```bash
comfyui-skill list
comfyui-skill info local/txt2img
```

### ワークフローを実行する

```bash
comfyui-skill run local/txt2img --args '{"prompt": "a white cat"}'
```

### 非同期でワークフローを送信する

```bash
comfyui-skill submit local/txt2img --args '{"prompt": "a white cat"}'
comfyui-skill status <prompt_id>
```

### ワークフローをインポートする

```bash
comfyui-skill workflow import /absolute/path/to/my-workflow.json --check-deps
```

手動 CLI インポートでは、絶対パスを直接渡す方法を推奨します。インポート成功後、正式ファイルは `data/<server_id>/<workflow_id>/` に保存されます。

### 依存関係を確認する

```bash
comfyui-skill deps check local/my-workflow
comfyui-skill deps install local/my-workflow --all
```

### サーバーを管理する

```bash
comfyui-skill server list
comfyui-skill server add --id remote --url http://10.0.0.1:8188
comfyui-skill server status
```

CLI の完全なリファレンスは [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI) を参照してください。

## ワークフロー要件

このプロジェクトで安定して動かすには、各ワークフローが次の条件を満たしている必要があります。

- ワークフローは ComfyUI の API 形式でエクスポートされていること
- `Save Image` のような出力ノードを含んでいること
- Agent が明確なパラメータインターフェースを使えるように `schema.json` のマッピングがあること
- 対象の ComfyUI サーバーに必要なカスタムノードやモデルがインストールされていること

`comfyui-skill workflow import` を使えば、CLI がマッピング生成や実行前の依存関係チェックを支援できます。

<a id="multi-server-management"></a>
## マルチサーバー管理

このプロジェクトは複数の ComfyUI サーバーで動くことを前提に設計されています。

ローカルやリモートの ComfyUI インスタンスを 1 つの設定にまとめ、ネームスペースでワークフローを振り分けられます。軽量なローカルテスト、大容量 GPU での重いジョブ、モデルごとの環境分離などに向いています。

例:

```bash
comfyui-skill server add --id local --url http://127.0.0.1:8188
comfyui-skill server add --id remote-a100 --url http://10.0.0.20:8188
comfyui-skill server list
```

ワークフローは次の形式で識別します。

```text
<server_id>/<workflow_id>
```

例:

```text
local/txt2img
remote-a100/sdxl-base
```

サーバーとワークフローの両方に有効/無効スイッチがあるため、Agent には現在利用可能なワークフローだけが見えます。

設定は次のコマンドで別マシンへ移行できます。

```bash
comfyui-skill config export --output ./backup.json
comfyui-skill config import ./backup.json --dry-run
comfyui-skill config import ./backup.json
```

<a id="web-ui"></a>
## Web UI

ローカルの Web インターフェースが用意されており、視覚的な設定とテストに利用できます。これはオプションであり、セットアップ・確認・検証をより簡単にするためのものです。skill 自体は引き続き CLI 経由で Agent が使う前提で設計されています。

### 起動

```bash
./ui/run_ui.sh                    # macOS/Linux
# or: ui\run_ui.bat               # Windows
```

起動スクリプトは必要に応じてプロジェクト用の `.venv` を作成し、その仮想環境に UI 依存関係をインストールします。Web UI 用の依存関係をグローバルにインストールする必要はありません。

`http://localhost:18189` を開いてください。

### Web UI でできること

- ComfyUI からエクスポートしたワークフローをアップロードする
- 視覚的なエディタでパラメータマッピングを設定する
- 複数のサーバーとワークフローを一元管理する
- ワークフロー定義を検索・並べ替え・確認する
- Agent に渡す前にワークフロー設定をテスト・検証する
- インターフェース言語を English / 简体中文 / 繁體中文 で切り替える

Web UI で行う設定は、すべて同じ CLI ベースのワークフローに対応しています。別の実行モデルではなく、セットアップとテストのための視覚的な補助レイヤーです。

フロントエンドのソースは [Frontend Repository](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend) にあります。

## よくある問題

### `/prompt` が HTTP 400 を返す

ワークフローの payload または注入されたパラメータ値のいずれかが不正です。

確認事項:

- ワークフローが API 形式でエクスポートされているか
- schema のマッピングが正しいノードとフィールドを指しているか
- 渡している引数の型が schema 定義と一致しているか

### 画像が返ってこない

`Save Image` のような有効な出力ノードがワークフローに含まれていない可能性があります。

### 接続に失敗する

確認事項:

- ComfyUI サーバーが起動しているか
- `config.json` のサーバー URL が正しいか
- 選択したサーバーが有効になっているか

### ノードやモデルが不足している

次を実行してください:

```bash
comfyui-skill deps check <workflow_id>
```

その後、必要に応じて対応する依存関係をインストールします。

## 変更履歴

最近の主な更新:

- **v0.3.1**: Kling、Sora、Nano Banana などのクラウド API ノード向けに ComfyUI API Key サポートを追加
- **v0.3.0**: 依存関係チェックとインストール、非同期 `submit` / `status`、画像アップロード、インポートプレビュー、実行履歴を追加
- **v0.2.0**: フロントエンドのソースコードを別リポジトリへ移し、自動同期フローを追加

完全な変更履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。

## 関連リソース

- [English README](./README.md)
- [简体中文 README](./README.zh.md)
- [繁體中文 README](./README.zh-TW.md)
- [日本語 README](./README.ja.md)
- [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI)
- [Frontend Repository](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend)
