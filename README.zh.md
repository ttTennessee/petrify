# Petrify

[![CI](https://github.com/ttTennessee/petrify/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ttTennessee/petrify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**可验证的 AI 智能体工作流运行时** — 通过 Petri 网形式化模型编排异构 AI 智能体，让工作流可证明正确，而不仅仅是可运行。

[English](./README.md)

---

## 演示

**配置 Adapter**

![Adapter 设置](./docs/assets/images/adapter-set.gif)

**创建项目并执行**

![创建项目并运行](./docs/assets/images/create-and-run.gif)

**Time Travel 回放**

![Time Travel 回放](./docs/assets/images/time-travel.gif)

> **当前状态：** Petrify 正处于开发与测试阶段，**尚未发布任何二进制或 Docker 镜像**，目前唯一支持的运行方式是 **clone 仓库后 `npm run dev` 启动**（详见下文 [快速开始](#快速开始)）。结构清晰的简单工作流已可稳定运行；复杂的多分支、高并发场景仍有待打磨。欢迎反馈与贡献。

---

## 什么是 Petrify？

Petrify 是一个自托管运行时，**站在单个智能体工具的上一层**（Claude Code、Codex、Cursor、ACP 兼容工具……）。你继续使用最顺手的智能体，Petrify 负责调度、串联，并在它们之间验证工作流。

每个工作流都会被编译成 Petri 网，并在执行前完成**死锁、活性、可达性、有界性、终止性**的静态检查。生命周期严格遵循：**规划 → 验证 → 执行**。

Petrify **以导入为先、与模型无关**——不内嵌 LLM 推理。蓝图以 JSON 形式传入（粘贴、导入，或由外部 LLM 生成）。模型只能通过可插拔的 **AgentAdapter**（ACP、Mock 或自定义）参与执行。

---

## 核心特性

- **形式化验证** — Petri 网静态分析在运行前捕获死锁、活锁和无界循环
- **规划 → 验证 → 执行** 生命周期，由运行时强制
- **可插拔 Adapter** — ACP、Mock，并可扩展为 `claude-code-cli`、`openai-tools` 或任意自定义 Adapter
- **检查点 / 恢复 / 时间旅行** — 在节点边界保存状态，可在执行历史中回溯
- **工作流 IDE** — 基于 React Flow，含验证面板、事件流查看器与断点调试器

---

## 快速开始

> 需要 Node.js 20+ 与 npm 10+。

```bash
git clone https://github.com/<your-org>/petrify.git
cd petrify
npm install
npm run dev
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:4000`

接着：

1. 打开前端，点击 **新建项目** → **导入蓝图**。
2. 粘贴 `examples/` 目录下任一文件（例如 `blog-post-pipeline-zh.json`）。
3. 点击 **验证**，在 **Settings → Adapters** 中配置一个 Adapter，然后点击 **运行**。

### ACP Adapter

可在 UI 中配置（**Settings → Adapters → Add Adapter**），也可通过环境变量启动：

```bash
PETRIFY_ACP_CMD=opencode npm run dev
```

---

## 架构

```
┌──────────────────────────────────────────────────────┐
│  Web IDE（React 19 + React Flow + Zustand）          │
│  — DAG 编辑器、验证面板、运行控制                    │
│  — 事件流、时间线、断点                              │
└───────────────────────┬──────────────────────────────┘
                        │ REST + WebSocket
┌───────────────────────▼──────────────────────────────┐
│  Runtime（Node.js + Express）                        │
│  编译器 · 调度器 · 验证器                            │
│  检查点管理 · 资源池                                 │
└───────────────────────┬──────────────────────────────┘
                        │ AgentAdapter 接口
           ┌────────────┼────────────┐
       ACP Agent      Mock        (自定义)
```

---

## 项目结构

```
petrify/
├── packages/
│   ├── server/    # Node.js 运行时：编译器、调度器、验证器、Adapter、REST
│   ├── web/       # React 19 SPA（Vite）
│   └── shared/    # 前后端共享的 Zod schema
├── examples/      # 中英双语 JSON 工作流蓝图
└── CLAUDE.md      # AI 辅助开发的项目指引
```

---

## 开发

| 命令 | 说明 |
|------|------|
| `npm run dev` | 所有包以 watch 模式启动 |
| `npm run build` | 生产构建 |
| `npm run typecheck` | 类型检查 |
| `npm --workspace @petrify/server run test` | 后端单元测试 |

所有包均启用 TypeScript strict 模式。

---

## 贡献

提交改动前请先阅读 `CLAUDE.md`，了解产品范围与架构约束。非琐碎改动建议先开 issue 讨论。

## 安全

发现漏洞？请**不要**公开提交 issue —— 参见 [SECURITY.md](./SECURITY.md)。

## 致谢

基于 [React Flow](https://reactflow.dev/)、[shadcn/ui](https://ui.shadcn.com/) + [Radix](https://www.radix-ui.com/)、[Tailwind](https://tailwindcss.com/)、[Zustand](https://github.com/pmndrs/zustand)、[TanStack Query](https://tanstack.com/query)、[Express](https://expressjs.com/)、[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)、[zod](https://zod.dev/)、[ws](https://github.com/websockets/ws)、[OpenTelemetry](https://opentelemetry.io/) 与 [Agent Communication Protocol](https://github.com/agentclientprotocol) 构建。

## 许可证

[MIT](./LICENSE) © 2026 Yujie Jin &lt;devilimp0@gmail.com&gt;
