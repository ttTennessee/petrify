# Petrify

[![CI](https://github.com/ttTennessee/petrify/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ttTennessee/petrify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**可验证的 AI 智能体工作流运行时** — 位于用户意图与异构 AI 智能体之间，使用 Petri 网形式化模型使工作流可证明正确，而非仅仅可运行。

[English](./README.md)

---

## 什么是 Petrify？

Petrify 是一个用于编排 AI 智能体工作流的自托管运行时。与普通 DAG 执行器不同，Petrify 会将每个工作流编译为 Petri 网，并在调用任何智能体之前运行**静态验证**（无死锁、活性、可达性、有界性、终止性）。生命周期严格执行：**规划 → 验证 → 执行**。未经验证的工作流不能进入执行阶段（除非显式覆盖）。

Petrify **以导入为先、与模型无关**：不内嵌 LLM 推理能力。蓝图以 JSON 形式传入（粘贴、导入，或由外部 LLM 生成）。模型参与执行的唯一途径是通过可插拔的 **AgentAdapter**。

---

## 为什么做 Petrify？

AI 智能体工具领域已经百花齐放——Claude Code、Codex、Cursor、OpenClaw、Hermes，以及更多层出不穷的工具。没有必要再花精力去做一个同类竞品。这些工具各有所长，各自拥有完善的 skill 生态、MCP 服务器和插件体系。Petrify 不打算取代它们中的任何一个，而是换了一个角度来思考问题：**如果可以把它们全部协同调度，会怎样？**

Petrify 站在单个智能体工具的上一层。你继续使用自己最顺手的工具，Petrify 负责调度、串联，并在它们之间验证工作流的正确性。你已有的 skill、MCP 集成和插件照常工作——Petrify 只是协调每个工具在什么时机、以什么方式运行。

**这个项目的起点。** 最初只是一个很私人的需求：我想用 AI 来写小说。具体来说，我想让多个章节并行生成，最后再合并成完整的作品。最笨的方法——提示一个智能体，等它完成，再提示下一个——实在太慢。我想要真正的并发。但越想越觉得，问题的本质根本不是写小说，而是被一个工具绑死了。既然任务可以拆分，为什么要让整个流程卡在同一个智能体上？

**ACP（智能体通信协议）的出现**让更好的答案成为可能。有了标准的通信层，Petrify 可以同时向多个异构智能体分发任务——这里跑一个写作智能体，那里跑一个审阅智能体，未来甚至可以把文生图、图生视频的工具作为工作流中的普通节点来调用。

**关于代码本身。** 坦白说，我的编程能力只是普通水平。当前版本的 Petrify 几乎完全由 Claude Code 编写，我的贡献是想法、架构判断和产品思路。我提这件事，不是在推卸责任，而是因为这本身就是这个项目想说明的事情：AI 工具已经足够强大，瓶颈不再是写代码，而是知道要做什么。

**关于当前状态。** Petrify 目前可以可靠地处理结构清晰的简单工作流。复杂的多分支、高并发场景尚未经过严格测试，还有不少需要完善的地方。这是一个持续迭代的作品——我会继续努力把它做好，也真诚欢迎各种反馈和贡献。

---

## 核心特性

- **形式化验证** — Petri 网静态分析在运行前捕获死锁、活锁和无界循环
- **规划 → 验证 → 执行生命周期** — 在编写与执行之间强制设置验证关卡
- **可插拔 Adapter** — 支持 ACP（智能体通信协议）、Mock（测试），以及 `claude-code-cli`、`openai-tools` 或任意自定义 Adapter
- **检查点 / 恢复 / 时间旅行** — 在任意节点边界保存和恢复工作流状态；可在执行历史中回溯
- **工作流 IDE** — 基于 React Flow 的编辑器，包含节点属性面板、事件流查看器和断点调试器
- **双语示例蓝图** — 四个可直接导入的工作流示例，提供中英文版本

---

## 架构

```
┌──────────────────────────────────────────────────────┐
│  Web IDE  (React 19 + React Flow + Zustand)          │
│  — DAG 编辑器、验证面板、运行控制                     │
│  — 事件流、时间线拖拽器、断点调试                     │
└───────────────────────┬──────────────────────────────┘
                        │ REST + WebSocket
┌───────────────────────▼──────────────────────────────┐
│  运行时  (Node.js + Express)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   编译器    │  │   调度器     │  │   验证器    │ │
│  │ JSON → PN   │  │  依赖解析    │  │  Petri 网   │ │
│  │  + 执行计划 │  │             │  │  静态分析   │ │
│  └─────────────┘  └──────────────┘  └─────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │  检查点管理器  |  资源池                         │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────┬──────────────────────────────┘
                        │ AgentAdapter 接口
           ┌────────────┼────────────┐
    ┌──────▼──────┐ ┌───▼───┐ ┌─────▼──────┐
    │  ACP 智能体 │ │ Mock  │ │  (自定义)  │
    └─────────────┘ └───────┘ └────────────┘
```

---

## 快速开始

### 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本

### 安装

```bash
git clone https://github.com/<你的组织>/petrify.git
cd petrify
npm install
```

### 启动（开发模式）

```bash
npm run dev
```

- 后端：`http://localhost:4000`
- 前端：`http://localhost:5173`

### 构建（生产环境）

```bash
npm run build
npm --workspace @petrify/server start
```

---

## 使用示例

1. 在浏览器中打开 `http://localhost:5173`。
2. 点击**新建项目**，然后选择**导入蓝图**。
3. 粘贴 `examples/` 目录中任意文件的内容（例如 `blog-post-pipeline-zh.json`）。
4. 点击**验证**运行 Petri 网分析。
5. 在设置 → Adapter 中连接一个 Adapter，然后点击**运行**。

### ACP Adapter

**方式 A — 通过 UI 配置（推荐）：** 打开 Settings → Adapters，点击 **Add Adapter**，填入启动 ACP 兼容智能体的命令（例如 `opencode`），启用即可，无需重启服务。

**方式 B — 通过环境变量：** 启动服务前设置 `PETRIFY_ACP_CMD`，服务启动时会自动注册一个 ACP adapter：

```bash
PETRIFY_ACP_CMD=opencode npm run dev
```

---

## 项目结构

```
petrify/
├── packages/
│   ├── server/          # Node.js 运行时（Express、SQLite、WebSocket）
│   │   └── src/
│   │       ├── runtime/ # 编译器、调度器、验证器、检查点
│   │       ├── adapters/ # AgentAdapter 接口 + ACP / Mock 实现
│   │       └── routes/  # REST API
│   ├── web/             # React 19 单页应用（Vite）
│   │   └── src/
│   │       ├── routes/  # 页面级组件
│   │       ├── components/ # DAG 画布、面板、shadcn/ui 基础组件
│   │       └── store/   # Zustand 状态
│   └── shared/          # 服务端与前端共享的 Zod 类型定义
├── examples/            # 双语 JSON 工作流蓝图
└── CLAUDE.md            # AI 辅助开发指南
```

---

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 以监听模式启动所有包 |
| `npm run build` | 生产构建（服务端 + 前端） |
| `npm run typecheck` | 检查所有包的类型 |
| `npm --workspace @petrify/server run test` | 运行后端单元测试 |
| `npm --workspace @petrify/server run test:watch` | 测试监听模式 |

所有包均启用 TypeScript 严格模式。

---

## 贡献指南

欢迎贡献代码。请遵循以下约定：

1. 在提出修改前，请阅读 `CLAUDE.md` 了解产品范围和架构约束。
2. 将修改定位到对应的里程碑层级，避免将后期里程碑的语义引入核心路径。
3. 对于运行时修改，在 `packages/server/src/**/*.test.ts` 中添加或更新测试。
4. 遵循现有的 TypeScript 严格模式规范，所有边界校验使用 `zod`。

重大修改请先开 Issue 讨论方案。

---

## 安全问题

发现安全漏洞？请**不要**直接开 Issue，请按 [SECURITY.md](./SECURITY.md) 的私密披露流程上报。

---

## 致谢

Petrify 站在众多优秀开源项目的肩膀上，特别感谢：

- **[React Flow](https://reactflow.dev/)**（`@xyflow/react`）— Workflow IDE 节点编辑器的底层。
- **[shadcn/ui](https://ui.shadcn.com/)** 与 **[Radix UI](https://www.radix-ui.com/)** — 仓库内 `components/ui/` 的可访问 UI 原语。
- **[Tailwind CSS](https://tailwindcss.com/)**、**[Zustand](https://github.com/pmndrs/zustand)**、**[TanStack Query](https://tanstack.com/query)** — 前端技术栈。
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)**、**[Express](https://expressjs.com/)**、**[zod](https://zod.dev/)**、**[ws](https://github.com/websockets/ws)** — 后端技术栈。
- **[OpenTelemetry](https://opentelemetry.io/)** — 厂商中立的可观测性方案。
- **[Agent Communication Protocol (ACP)](https://github.com/agentclientprotocol)** — 让异构 Agent 运行时成为可能的标准。

架构上同样受到 Petri 网相关文献以及 Temporal、Inngest、LangGraph、Prefect 等已有工作流系统的启发——Petrify 的取舍不同，但这些项目塑造了我们需要回答的设计问题。

---

## 许可证

[MIT](./LICENSE) © 2026 Yujie Jin &lt;devilimp0@gmail.com&gt;
