---
title: ComfyUI 原生本地路由
---

# ComfyUI 原生本地路由

本文档说明本项目依赖的 ComfyUI 原生 HTTP / WebSocket 路由，并与本仓库的管理 API（`/api/*`）区分开。

- ComfyUI 原生路由：运行在目标 ComfyUI 服务（如 `http://127.0.0.1:8188`）
- 本项目管理 API：运行在本仓库 UI 服务（`ui/app.py`）

官方参考：
- https://docs.comfy.org/development/comfyui-server/comms_overview
- https://docs.comfy.org/development/comfyui-server/comms_routes

## 当前核心调用链路

As of 2026-03-14，当前实现（[`scripts/comfyui_client.py`](../scripts/comfyui_client.py)）使用以下三步：

1. `POST /prompt`：提交工作流
2. `GET /history/{prompt_id}`：轮询执行完成
3. `GET /view`：下载输出图片

## 常见路由分组（与当前状态）

状态标签定义：
- `Used now`：当前实现已使用
- `Candidate`：当前未使用，但有明确接入价值
- `Not used`：当前不在范围内，暂无计划
- `Not used directly`：上游存在，但当前链路不会直接调用

### 执行相关

- `/prompt` `POST` — 提交任务（Used now）
- `/history/{prompt_id}` `GET` — 查询单次历史（Used now）
- `/queue` `GET/POST` — 查看/管理队列（Candidate）
- `/interrupt` `POST` — 中断执行（Candidate）
- `/ws` `WS` — 实时进度（Candidate）

### 文件相关

- `/view` `GET` — 下载输出图（Used now）
- `/upload/image` `POST` — 上传参考图（Candidate）
- `/upload/mask` `POST` — 上传蒙版（Candidate）

### 发现与能力探测

- `/object_info` `GET` — 节点定义（Candidate）
- `/models` `GET` — 模型列表（Candidate）
- `/system_stats` `GET` — 系统资源信息（Candidate）

## 与本项目 `/api/*` 的边界

以下属于本仓库管理 API，不是 ComfyUI 原生路由：

- `/api/config`
- `/api/servers`
- `/api/workflows`
- `/api/transfer/export/preview`

这些接口用于管理配置与工作流元数据；真正执行工作流仍依赖 ComfyUI 原生路由。
