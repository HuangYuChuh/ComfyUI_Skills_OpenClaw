<div align="center">
  <img src="./asset/banner.png" alt="ComfyUI Skills Banner">

  <h1>ComfyUI Skills for OpenClaw</h1>

  <p><strong>OpenClaw、Codex、Claude Code などのエージェントから呼び出しやすい、ComfyUI ワークフロー用のスキルレイヤーです。</strong></p>

  <p>
    このプロジェクトは ComfyUI ワークフローを呼び出し可能なスキルとして整備し、
    エージェントに扱いやすい CLI を主なインターフェースとして提供します。
    あわせて、設定やテストを進めやすい Web UI も利用できます。
  </p>

  <p>
    <a href="https://huangyuchuh.github.io/ComfyUI_Skills_OpenClaw/"><img src="https://img.shields.io/badge/docs-GitHub_Pages-4F46E5?style=flat&logo=gitbook&logoColor=white" alt="Docs"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/blob/main/LICENSE"><img src="https://img.shields.io/github/license/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat&color=10B981&logo=data%3Aimage/svg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Im0xNiAxNiAzLTggMyA4Yy0uODcuNjUtMS45MiAxLTMgMXMtMi4xMy0uMzUtMy0xWiIvPjxwYXRoIGQ9Im0yIDE2IDMtOCAzIDhjLS44Ny42NS0xLjkyIDEtMyAxcy0yLjEzLS4zNS0zLTFaIi8%2BPHBhdGggZD0iTTcgMjFoMTAiLz48cGF0aCBkPSJNMTIgM3YxOCIvPjxwYXRoIGQ9Ik0zIDdoMmMyIDAgNS0xIDctMiAyIDEgNSAyIDcgMmgyIi8%2BPC9zdmc%2B" alt="License"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/stargazers"><img src="https://img.shields.io/github/stars/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat&color=EAB308&logo=github" alt="GitHub stars"></a>
    <a href="https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw/network/members"><img src="https://img.shields.io/github/forks/HuangYuChuh/ComfyUI_Skills_OpenClaw?style=flat&color=F97316&logo=github" alt="GitHub forks"></a>
    <a href="https://www.python.org/"><img src="https://img.shields.io/static/v1?label=Python&message=3.10%2B&color=3B82F6&style=flat&logo=python&logoColor=white" alt="Python 3.10+"></a>
  </p>

  <p>
    <a href="https://www.bilibili.com/video/BV1a6cUzVEE6/">🎬 デモ動画</a> ·
    <a href="https://huangyuchuh.github.io/ComfyUI_Skills_OpenClaw/">📘 ドキュメント</a> ·
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

ComfyUI Skills for OpenClaw は、ComfyUI ワークフローをエージェントから呼び出せるスキルとして扱えるようにするための橋渡しレイヤーです。

エージェントに生の ComfyUI グラフを直接扱わせるのではなく、CLI とスキーマベースのパラメータマッピングによって、各ワークフローに対して明確で制御しやすい呼び出しインターフェースを提供します。Shell コマンドを実行できるエージェントであれば、OpenClaw、Codex、Claude Code などを含めて利用できます。

既存の ComfyUI ワークフローを取り込み、必要なパラメータだけを公開し、チャットやエージェントタスクから直接呼び出し、全体を一貫したワークフロー層として管理したい場合に適しています。

| 対象ユーザー | 得られるもの |
|--------------|--------------|
| OpenClaw、Codex、Claude Code のユーザー | エージェントが安全に呼び出せる ComfyUI ワークフロー層 |
| 既存の ComfyUI ワークフローを持つユーザー | 完全なグラフを公開せずにエクスポート済みワークフローを再利用する方法 |
| 複数マシン構成のユーザー | ローカルとリモートの ComfyUI サーバーを統一ネームスペースで管理する仕組み |
| 視覚的な設定とテストを行いたいユーザー | エージェントに渡す前にワークフローを設定・プレビュー・検証できるオプションの Web UI |

## なぜこのプロジェクトか

ComfyUI を直接使う方法は強力ですが、エージェント主導の実行には向いていません。

生のワークフローグラフは情報量が多く、ノイズも大きいため、エージェントが安全に扱うには不向きです。ComfyUI API を直接叩く場合も、パラメータ注入、ワークフロー命名、サーバー選択、依存関係チェック、出力の回収などを自分で処理する必要があります。このプロジェクトは ComfyUI の上に安定した抽象化レイヤーを追加し、エージェントがワークフローを見つけ、構造化された引数で呼び出し、予測しやすい結果を得られるようにします。

ComfyUI ワークフローやより低レベルな操作方法を直接扱う場合と比べると、このプロジェクトの CLI は明らかにエージェント向きです。入力がより明確で、公開するパラメータも安全に絞り込めて、ワークフローの発見もしやすく、実行結果もより安定して予測しやすくなります。

特に次のようなニーズに向いています。

- 既存の ComfyUI ワークフローをエージェント用ツールにしたい
- グラフ全体ではなく、安全で制御しやすいパラメータインターフェースだけを公開したい
- 複数の ComfyUI サーバー間でワークフローを振り分けたい
- OpenClaw、Codex、Claude Code など複数のエージェント環境で同じワークフロー設定を再利用したい

## 主な機能

| 機能 | 価値 |
|------|------|
| **エージェント向け CLI** | 人手の操作だけでなく、エージェントからの呼び出しを前提に設計されています。生の ComfyUI グラフや低レベルな操作を直接扱うよりも、明確な入力と信頼しやすい呼び出しインターフェースを提供します。 |
| **スキーマベースのパラメータマッピング** | エージェントに制御させたい項目だけを公開し、エイリアス・型・説明を持たせられます。 |
| **ComfyUI ワークフローのインポート** | ワークフロー JSON を取り込み、形式を自動判別し、エージェント向けのマッピング層を生成します。 |
| **マルチサーバールーティング** | ローカルおよびリモートの ComfyUI サーバーを統一ネームスペースで管理し、適切なマシンへジョブを送れます。 |
| **依存関係のチェックとインストール** | 実行前に不足しているノードやモデルを確認し、CLI から対応する依存関係をインストールできます。 |
| **オプションの Web UI** | 設定とテストのための視覚レイヤーです。CLI を置き換えるものではなく、エージェント向け機能は同じ CLI ワークフローに対応しています。 |

<a id="quick-start"></a>
## クイックスタート

数分で ComfyUI Skills を使い始められます。

始める前に、次を確認してください。

- Python 3.10+
- 動作中の ComfyUI サーバー
- すぐに実行テストしたい場合は、ComfyUI API 形式でエクスポートしたワークフロー

### 1. プロジェクトをクローンする

利用するエージェント環境に合ったディレクトリを選んでください。

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

手動で CLI からインポートする場合は、ワークフロー JSON の絶対パスをそのまま渡す方法を推奨します。その方が分かりやすく、余計なディレクトリ規約も増えません。

例:

```bash
comfyui-skill workflow import /Users/yourname/Downloads/my-workflow.json
```

インポート後、CLI は正規化されたワークフローとスキーマを `data/<server_id>/<workflow_id>/` に保存します。たとえば `data/local/my-workflow/workflow.json` と `data/local/my-workflow/schema.json` です。

これは Web UI とエージェント / OpenClaw によるインポートでも共通の正式レイアウトです:

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
- ワークフローをインポートし、エージェントが安全に使えるパラメータだけを公開する

### Codex または Claude Code

コード系エージェントから Shell コマンド経由で ComfyUI ワークフローを呼び出したい場合はこちらです。

- リポジトリをエージェントの skills ディレクトリにクローンする
- CLI をインストールする
- `comfyui-skill list` で環境を確認する
- 構造化された `--args` でワークフローを実行する

### Web UI

CLI をエージェントの主インターフェースとして保ちつつ、設定・確認・テストを視覚的に行いたい場合はこちらです。

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
  "description": "マイワークフロー",
  "enabled": true,
  "parameters": {
    "prompt": {
      "node_id": 10,
      "field": "prompt",
      "required": true,
      "type": "string",
      "description": "プロンプト"
    }
  }
}
```

</details>

## 仕組み

このプロジェクトは、エージェントと ComfyUI ワークフローの間に制御された実行レイヤーを追加します。

1. ComfyUI からワークフローを API 形式でエクスポートする
2. ワークフローをインポートし、公開するパラメータを定義する
3. そのマッピングを `schema.json` に保存する
4. `comfyui-skill` を使って構造化された引数でワークフローを呼び出す
5. 対象の ComfyUI サーバーにジョブを送信し、生成結果を返す

実際の流れは次のようになります。

```text
ComfyUI workflow.json
  -> schema.json パラメータマッピング
  -> comfyui-skill CLI
  -> ComfyUI サーバー
  -> 生成画像の出力
```

この構造により、エージェントは生の ComfyUI グラフノードを理解する代わりに、安定した呼び出し契約を扱えるようになります。

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

手動で CLI からインポートする場合は、絶対パスをそのまま渡す方法を推奨します。インポート成功後、正式なファイルは `data/<server_id>/<workflow_id>/` に保存されます。

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
- エージェントが明確なパラメータインターフェースを使えるように `schema.json` のマッピングがあること
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

サーバーとワークフローの両方に有効/無効スイッチがあるため、エージェントには現在利用可能なワークフローだけが見えます。

設定は次のコマンドで別マシンへ移行できます。

```bash
comfyui-skill config export --output ./backup.json
comfyui-skill config import ./backup.json --dry-run
comfyui-skill config import ./backup.json
```

<a id="web-ui"></a>
## Web UI

ローカルの Web インターフェースが用意されており、視覚的な設定とテストに利用できます。これはオプションであり、セットアップ・確認・検証をより簡単にするためのものです。スキル自体は引き続き CLI 経由でエージェントが使う前提で設計されています。

### 起動

```bash
./ui/run_ui.sh                    # macOS/Linux
# または: ui\run_ui.bat           # Windows
```

起動スクリプトは必要に応じてプロジェクト用の `.venv` を作成し、その仮想環境に UI 依存関係をインストールします。Web UI 用の依存関係をグローバルにインストールする必要はありません。

`http://localhost:18189` を開いてください。

### Web UI でできること

- ComfyUI からエクスポートしたワークフローをアップロードする
- 視覚的なエディタでパラメータマッピングを設定する
- 複数のサーバーとワークフローを一元管理する
- ワークフロー定義を検索・並べ替え・確認する
- エージェントに渡す前にワークフロー設定をテスト・検証する
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

- **v0.4.0**: [CLI ファーストアーキテクチャ](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI)へ移行 — すべてのワークフロー操作（`run`、`submit`、`status`、`import`、`deps`）をスタンドアロン CLI に統一、レガシー Python スクリプトを削除
- **v0.3.1**: Kling、Sora、Nano Banana などのクラウド API ノード向けに ComfyUI API Key サポートを追加
- **v0.3.0**: 依存関係チェックとインストール、非同期 `submit` / `status`、画像アップロード、インポートプレビュー、実行履歴を追加

完全な変更履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。

## コントリビューション

コントリビューション歓迎です！PR を送る前に [CONTRIBUTING.md](./CONTRIBUTING.md) をお読みください。

## 関連リソース

- [English README](./README.md)
- [简体中文 README](./README.zh.md)
- [繁體中文 README](./README.zh-TW.md)
- [日本語 README](./README.ja.md)
- [ComfyUI Skill CLI](https://github.com/HuangYuChuh/ComfyUI_Skill_CLI)
- [Frontend Repository](https://github.com/HuangYuChuh/ComfyUI_Skills_OpenClaw-frontend)
