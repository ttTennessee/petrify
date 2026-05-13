# 产品需求文档（PRD）：Petrify — Verifiable Agent Workflow Runtime

**版本**：v2.0（重构版）
**日期**：2026-05-13
**作者**：产品团队
**状态**：草案

> v1.1 名为 *Agent Flow Studio*。v2.0 正式更名为 **Petrify**，并对定位、工作流模型、执行层抽象、里程碑做了结构性调整。详见附录 A。

---

# 1. 产品概述

## 1.1 背景与问题

当前 LLM 已具备较强的任务规划与内容生成能力，但用户在驱动 Agent 完成复杂项目时，依然缺少一种 **可观察、可干预、可恢复、可验证、可调试** 的 Agent 运行与编排系统。

现有方案普遍存在的痛点：

* 规划过程黑盒化，用户无法在执行前介入修正
* 执行状态不可观测，失败定位困难
* 缺乏中断恢复能力，长任务一旦中断便前功尽弃
* Prompt 与 Runtime 耦合严重，迁移成本高
* 缺少形式化验证，"能跑"不等于"跑得对"
* 多 Agent 协作不可控，资源争用与死锁难以发现

与此同时，Agent 执行层生态正在快速成熟（Claude Code、OpenCode、Cursor Agent、各类 ACP/MCP Runtime），但它们仍只是 **单个执行器**，并未解决跨执行器的 **编排、验证与可观测** 问题。

> 为什么这样做：先把痛点列清楚，后续每个核心能力都能被这些痛点回溯解释。

---

## 1.2 产品定位

**Petrify 是一个 Verifiable Agent Workflow Runtime。**

它上承自然语言意图，下接异构 Agent 执行器，中间通过 **Petri 网形式化模型** 把 AI 工作流从"会跑"提升到"可证明会跑对"。

产品位于三层之间：

* 用户意图层
* Workflow 编排与验证层
* Agent Runtime 层

具体形态包括：

* AI Workflow Compiler（把任务蓝图编译为可执行 Plan）
* Verifiable Workflow Engine（基于 Petri 网做静态与动态分析）
* Agent Runtime（带 Checkpoint / Time Travel / 调度）
* Workflow IDE（可视化编辑与调试）

> 为什么这样做：一句话定位避免后续讨论再发散——"可验证"是 Petrify 区别于 LangGraph / Dify / Flowise 的核心标签。

---

## 1.3 名字由来

**Petrify** 字面意为"石化、固化"，恰好对应产品哲学：

> **把 AI 的不确定性，固化为可验证、可调试、可恢复的工程系统。**

同时致敬 **Petri 网**（Carl Adam Petri, 1962）——并发系统形式化验证的奠基模型，也是 Petrify 验证引擎的数学基础。

---

## 1.4 与现有方案对比

| 维度       | LangGraph | Dify / Flowise | Temporal | **Petrify** |
| -------- | --------- | -------------- | -------- | ----------- |
| 自然语言入口   | 部分        | 是              | 否        | **是**       |
| 可视化编辑    | 弱         | 是              | 否        | **是**       |
| 形式化验证    | 否         | 否              | 否        | **是（Petri 网）** |
| Checkpoint / Resume | 部分 | 否 | 是 | **是** |
| Time Travel 调试 | 否 | 否 | 部分 | **是** |
| 多 Agent Adapter | 弱 | 强 | 不适用 | **强** |
| 适用规模     | 单任务       | 简单流水线          | 企业级长事务   | **AI 编排专用** |

> 为什么这样做：直接锚定竞品边界，节省读者自行调研的时间。

---

# 2. 设计哲学

## 2.1 Plan → Verify → Execute

所有 Workflow 必须经过三段式生命周期：

1. **Plan**：从意图生成结构化蓝图
2. **Verify**：用 Petri 网证明蓝图无死锁、可达、资源安全
3. **Execute**：通过 Adapter 调度真实 Agent

未通过 Verify 的工作流不允许进入 Execute（可显式 override）。

---

## 2.2 Human-in-the-loop First

AI 负责生成，人类负责确认与控制。任何关键节点（高成本、外部副作用、不可逆操作）默认需要人工 Gate。

---

## 2.3 Observable by Default

所有 Agent 行为默认全链路可观测：Prompt / Tool Call / Output / Retry / Token 消耗 / Runtime Event / 资源占用。

---

## 2.4 Verifiable Workflow

每一个 Workflow 都可被自动翻译为 Petri 网并验证：

* 死锁（Deadlock-freeness）
* 活性（Liveness）
* 可达性（Reachability）
* 资源安全（Boundedness）
* 终止性（Termination，针对循环节点）

---

## 2.5 Adapter-based Runtime Decoupling

Petrify 不绑定任何模型或 Agent。所有执行器都通过 **AgentAdapter** 接入。ACP 协议只是 Adapter 的一种实现，与 Claude Code CLI、OpenCode、自定义 Runtime 同级。

> 为什么这样做：ACP 生态尚未成型，过早绑定单一协议会限制产品演进路径。

---

## 2.6 非目标（Non-goals）

Petrify **不做** 以下事情，以保持范围聚焦：

* 不做模型训练 / 微调 / 蒸馏
* 不做向量检索 / RAG 框架（可通过 Adapter 接入外部 RAG）
* 不做 Agent SDK（不与 LangGraph / AutoGen 抢"如何写 Agent"的位）
* 不内置 LLM 推理（Import-first，规划由外部 LLM 完成）
* 不做团队协作 / 多人实时编辑（MVP 单用户单租户）
* 不做云托管服务（MVP 自托管优先）

> 为什么这样做：明确边界后，技术决策与功能取舍才有锚点。

---

# 3. 用户角色与场景

## 3.1 普通用户

* 输入任务目标
* 审查并调整生成的工作流
* 启停、监控与重试执行

## 3.2 高级用户

* 注册自定义工具与 Adapter
* 编写规划模板与 Prompt 模板
* 调整调度策略与资源配额

## 3.3 系统管理员

* 管理 Adapter 注册表与凭据
* 监控 Runtime 资源使用
* 查看审计日志、配置安全策略

## 3.4 典型场景

* 长文创作 / 研究报告生成（顺序为主、偶有分支）
* 代码重构 / 多文件协同（高并发、强资源争用）
* 数据 ETL + 报告（条件分支、循环）
* 多 Agent 协作（异构 Adapter、需要资源调度）

---

# 4. 核心功能需求

## 4.1 项目创建与意图捕获

### 输入字段

| 字段              | 类型       | 必填 | 描述                       |
| --------------- | -------- | -- | ------------------------ |
| goal            | string   | 是  | 项目目标（≤ 2000 字）            |
| description     | string   | 否  | 补充说明（≤ 8000 字）            |
| constraints     | object   | 否  | 执行约束（如最大节点数、预算上限）       |
| preferred_tools | string[] | 否  | 倾向 Adapter（如 claude-code） |
| runtime_policy  | object   | 否  | 全局 Runtime 策略             |

### 系统行为

* 创建 `draft` 状态 Project
* 初始化 Runtime Context（见 4.5）
* 生成可下载的 Prompt Template，供外部 LLM 生成蓝图

---

## 4.2 任务规划：Import-first

Petrify 默认 **不内置模型调用**，专注规划与 Runtime。任务蓝图通过以下方式获得：

* 复制 Prompt Template → 外部 LLM 生成 JSON
* 粘贴 / 拖拽 / 文件导入 JSON
* （可选）通过 Adapter 调用外部 LLM 自动生成

### 编译流程

```
Natural Language / JSON
   → Task IR（中间表示）
   → Workflow Graph（含 Place/Transition/Arc）
   → Petri Net Verification
   → Executable Runtime Plan
```

### 合法性校验

ref 存在性 / DAG 性（控制边维度）/ Schema 合法 / 资源声明合法 / Adapter 可用性。

---

## 4.3 工作流模型（扩展版）

为了让 Petri 网验证真正发挥作用，Petrify 的工作流元模型在传统 DAG 之上扩展：

| 元素        | Petri 网映射          | 说明                |
| --------- | ------------------ | ----------------- |
| **Node**       | Transition         | 执行单元（调用 Adapter）  |
| **Variable / Artifact 槽** | Place              | 数据/产物的容器          |
| **Resource Token** | Token              | 配额、文件锁、并发槽        |
| **Control Edge**   | 控制 Arc             | 表达执行先后            |
| **Data Edge**      | 数据 Arc             | 表达输入输出依赖          |
| **Resource Edge**  | 资源 Arc             | 申请/释放资源           |
| **Guard**          | Transition 守卫      | 条件分支（XOR-split）   |
| **Join**           | AND-join Transition | 并发同步              |
| **Loop**           | 带回边的子网            | 必须声明退出条件          |

> 为什么这样做：原 PRD 的纯 DAG 模型让 Petri 网无用武之地。引入资源 Token、条件、循环之后，死锁/活性/边界分析才有真实意义。

---

## 4.4 可视化编辑

### 技术方案

React Flow 实现交互式 DAG 编辑器。Petri 网子结构（Place / Token）作为节点附属信息呈现，不暴露完整 Petri 网图（避免认知负担）。

### 节点展示

标题 / 绑定 Adapter / Runtime 状态 / Retry 次数 / Token 消耗 / 断点状态 / 资源占用。

### 节点详情面板

Prompt / Tool Binding / Input / Output Schema / Runtime Policy / Retry Policy / Timeout / Sandbox / 资源声明 / on_failure 钩子。

### 操作

* 图编辑：增删、连线、自动布局、子图折叠、批量选择
* 调试：断点、单步、Continue、Retry、Force Skip、手动注入输出
* 高亮：可执行/阻塞/死锁/运行中/异常节点

---

## 4.5 Runtime Context

### 子模块作用域表

| 子模块             | 作用域       | 生命周期    | 可变性 | 持久化策略           |
| --------------- | --------- | ------- | --- | --------------- |
| Variables       | 全局        | Project | 读写  | Checkpoint      |
| Memory          | 全局 / 节点本地 | Project | 追加  | Checkpoint      |
| Artifacts       | 全局        | Project | 不可变 | Artifact Store  |
| Env             | 全局        | Run     | 只读  | 不持久化（运行时注入）     |
| Prompt Snapshot | 节点        | 节点执行    | 只读  | Trace（含历史）      |

### Artifact 类型

markdown / json / code / image / directory / log / binary。

> 为什么这样做：原 PRD 五个子模块边界模糊，明确作用域与生命周期后，实现时不易产生概念冲突。

---

## 4.6 Petri 网验证

### 静态分析

* **死锁检测**：是否存在不可继续的状态
* **活性分析**：每个 Transition 是否可点火
* **可达性**：终止状态是否可达
* **资源边界**：Token 是否会无界增长（内存/配额溢出）
* **终止性**：循环子网是否一定退出
* **资源死锁**：多个节点竞争 Token 时的死锁

### Dry Run

不调用真实 Adapter，用 Mock Token 流模拟执行，给出：

* 预估总耗时
* 关键路径
* 资源高峰
* 失败可能性分析（基于历史 Trace）

### 结果展示

高亮问题节点/边、修复建议、Runtime 风险等级（Low / Medium / High / Blocking）。

### 示例：资源死锁检测

考虑两个并发节点 A、B，分别需要 `llm_quota` 与 `file_lock` 两个资源，但申请顺序相反：

```
A: acquire(llm_quota) → acquire(file_lock) → run
B: acquire(file_lock) → acquire(llm_quota) → run
pool: llm_quota=1, file_lock=1
```

对应 Petri 网中存在状态 `{A holds llm_quota, B holds file_lock}`，从该 marking 出发，两个 Transition 都无法点火——验证器报告 **Deadlock at marking M3**，并建议 *统一资源申请顺序* 或 *提升资源池容量*。

> 为什么这样做：用一个最小可复现的例子说明 Petri 网验证不是口号，而是能落到具体 marking 上的能力。

---

## 4.7 执行 Runtime

### 执行模式

* 全量执行（按拓扑+守卫推进）
* 单步调试
* 选中子集执行
* Continue Until Breakpoint

### Runtime Engine 职责

Dependency Resolution / Scheduling / Retry / Checkpoint / Recovery / Event Streaming / 资源（Token）调度。

### 节点状态机

| 状态        | 描述     |
| --------- | ------ |
| idle      | 未执行    |
| pending   | 等待调度   |
| running   | 正在运行   |
| completed | 成功     |
| failed    | 失败     |
| blocked   | 被资源阻塞  |
| skipped   | 已跳过    |
| compensating | 补偿中 |

### Runtime Event（节选）

NodeStarted / ToolCalled / OutputGenerated / RetryTriggered / DependencyResolved / ResourceAcquired / ResourceReleased / CheckpointSaved / BreakpointHit / CompensationTriggered。

---

## 4.8 Agent Adapter 层

### 接口

```ts
interface AgentAdapter {
  manifest(): AdapterManifest;     // 能力/工具/限制声明
  invoke(req: InvokeRequest): AsyncIterable<RuntimeEvent>;
  cancel(invocationId: string): Promise<void>;
  checkpoint(invocationId: string): Promise<CheckpointBlob>;
  restore(blob: CheckpointBlob): Promise<string>;
}
```

### 首发 Adapter

* `claude-code-cli`：本地 CLI 子进程
* `acp-adapter`：通用 ACP 协议（远程）
* `openai-tools`：直连 OpenAI Tool Use
* `mock-adapter`：测试用

### Adapter Manifest 内容

能力（tools / 多模态 / 并发上限）、资源消耗模型（token 计费 / 时间）、Sandbox 能力、Checkpoint 支持级别。

### Checkpoint 能力分级

不同 Adapter 的可快照程度差异巨大，必须显式声明：

| 级别              | 含义                                  | 典型 Adapter            | Resume 粒度      |
| --------------- | ----------------------------------- | --------------------- | -------------- |
| `none`          | 不支持快照                               | mock-adapter（调试）      | 仅整图重跑          |
| `boundary-only` | 仅在节点边界可恢复，节点内部状态丢失                  | claude-code-cli、openai-tools | 失败节点重新执行       |
| `soft`          | 可保存对话历史与 Tool Call 流，但不保证完全可复现       | acp-adapter           | 失败节点从最近 Tool Call 继续 |
| `full`          | 进程级快照，可逐步重放                         | 自研沙箱 Adapter          | 任意指令级恢复        |

`none` / `boundary-only` 是 MVP 必须可工作的退化路径——Petrify 自身的 Runtime Checkpoint 不依赖 Adapter 配合，最差也能保证"节点边界恢复"。

> 为什么这样做：ACP 仅是其中一种实现，避免被未成型协议绑架；显式声明 checkpoint 分级让 Resume 行为可预期。

---

## 4.9 失败语义与补偿

### 节点级失败策略

`retry(maxAttempts, backoff)` / `skip` / `abort` / `compensate(on_failure)`。

### 工作流级传播策略

* `fail-fast`：任一节点失败 → 整图终止
* `partial-continue`：仅终止下游，未受影响分支继续
* `branch-isolation`：失败仅影响所在子图

### 补偿（Saga）

每个节点可声明 `on_failure` 钩子，触发反向操作（删除已创建的文件、撤回外部调用等）。

> 为什么这样做：长任务失败语义如果不显式建模，Recovery 与 Time Travel 都站不住脚。

---

## 4.10 Checkpoint 与 Time Travel

### Checkpoint

自动保存 Workflow 状态 + Runtime Context + Artifact 引用 + 事件日志。支持手动 Checkpoint 命名。

### Resume

从任意 Checkpoint 恢复执行。Adapter 必须实现 `restore` 才可恢复其内部状态，否则只能从节点边界恢复。

### Time Travel

回退到历史节点、保留 Artifact 重新执行、对比两次执行的 Trace。

---

## 4.11 成本与配额

* 项目级 Token 预算（软上限警告 / 硬上限阻断）
* 全局并发上限（Adapter / 节点 / 资源维度）
* 节点超时上限（默认 5min，可覆盖至 1h）
* 单 Run 最大事件数（防爆量）

实时显示当前消耗与预算余量。

---

## 4.12 安全模型

* **Adapter Sandbox**：进程隔离、FS chroot、网络出站白名单、CPU/内存限额
* **Secret 注入**：通过 Env 引用 Vault，Secret 永不进入 Prompt Snapshot 或 Artifact
* **API Key 后端存储**，前端通过短期 Token 间接访问
* **审计日志**：所有 Secret 引用、外部调用、人工干预均落库

---

## 4.13 可观测性

* Runtime Trace 以 **OpenTelemetry** 兼容格式导出
* 内置对接：Langfuse / Grafana Tempo / 自托管 Jaeger
* Metrics：节点耗时、Adapter QPS、Token 速率、失败率、Resume 次数
* Trace 视图与 DAG 视图双向跳转

---

## 4.14 模板系统（M5）

保存 / 导出 / 分享 / 二次编辑 Workflow Template，含 Runtime Policy 与 Adapter 绑定。

---

# 5. 系统架构

```text
┌──────────────────────────────────────┐
│   Product & Interaction Layer        │
│   React Web UI / Workflow IDE        │
└──────────────────────────────────────┘
                  │ REST / WebSocket
                  ▼
┌──────────────────────────────────────┐
│   Workflow Runtime Layer             │
│   - Workflow Compiler                │
│   - Petri Net Analyzer               │
│   - DAG / Petri Net Manager          │
│   - Runtime Scheduler                │
│   - Event Stream                     │
│   - Checkpoint Manager               │
│   - Adapter Registry                 │
└──────────────────────────────────────┘
                  │ AgentAdapter API
                  ▼
┌──────────────────────────────────────┐
│   Agent Execution Layer              │
│   claude-code-cli │ acp │ openai │…  │
└──────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│   Infrastructure Layer               │
│   SQLite │ FS │ Artifact Store │ OTel│
└──────────────────────────────────────┘
```

---

# 6. 数据规范

## 6.1 用户输入

```json
{
  "goal": "创作一部赛博朋克侦探小说",
  "description": "黑暗风格，高科技低生活",
  "constraints": { "max_tasks": 10, "max_tokens": 200000 },
  "preferred_tools": ["claude-code-cli"]
}
```

## 6.2 Runtime Context

```json
{
  "context": {
    "variables": {},
    "memory": { "global": {}, "per_node": {} },
    "artifacts": [],
    "env": {},
    "prompt_snapshots": {}
  }
}
```

## 6.3 Workflow Node

```json
{
  "id": "uuid",
  "ref": "world_building",
  "title": "构建世界观",
  "adapter": { "name": "claude-code-cli", "version": "^1.0" },
  "dependencies": ["intro"],
  "inputs":  { "theme": "$.variables.theme" },
  "outputs": { "world": "artifact://world.md" },
  "condition": null,
  "loop": null,
  "resources": [{ "name": "llm_quota", "amount": 1 }],
  "runtime": { "timeout": 300, "retries": 2, "checkpoint": true },
  "prompt": { "system_prompt": "...", "task_prompt": "..." },
  "schema": { "input": {}, "output": {} },
  "on_failure": { "strategy": "retry" },
  "status": "idle"
}
```

## 6.4 Workflow Edge

```json
{ "from": "a", "to": "b", "kind": "control" }
{ "from": "a", "to": "b", "kind": "data", "binding": "$.outputs.world" }
{ "from": "a", "to": "pool:llm_quota", "kind": "resource", "amount": 1 }
```

## 6.5 Runtime Event

```json
{
  "event_id": "uuid",
  "node_id": "uuid",
  "type": "ToolCalled",
  "timestamp": 1710000000,
  "payload": {}
}
```

`type` 为枚举：`NodeStarted | ToolCalled | OutputGenerated | RetryTriggered | DependencyResolved | ResourceAcquired | ResourceReleased | CheckpointSaved | BreakpointHit | CompensationTriggered | NodeCompleted | NodeFailed | NodeSkipped`。

## 6.6 Adapter Manifest

```json
{
  "name": "claude-code-cli",
  "version": "1.2.0",
  "capabilities": ["tool_use", "streaming", "checkpoint:soft"],
  "concurrency": { "max": 4 },
  "resources": { "token_per_call_est": 4000 },
  "sandbox": { "fs": "chroot", "net": "allowlist" }
}
```

---

# 7. 用户工作流程

1. **创建项目**：输入目标与约束
2. **生成或导入蓝图**：使用 Prompt Template → 外部 LLM → JSON 导入
3. **审查与编辑**：DAG Editor 修改、补全资源声明
4. **验证**：DAG 校验 + Petri 网分析 + Dry Run
5. **执行**：通过 Adapter 调度
6. **监控与调试**：Trace / Retry / Resume / Time Travel / Breakpoint
7. **导出**：Workflow / Artifact / Trace / Template

---

# 8. 技术选型

## 8.1 前端

| 模块               | 技术             |
| ---------------- | -------------- |
| Framework        | React 19       |
| Workflow Editor  | React Flow     |
| State Management | Zustand        |
| UI               | Tailwind CSS   |
| Data Fetching    | TanStack Query |

## 8.2 后端（MVP）

| 模块         | 技术                  |
| ---------- | ------------------- |
| Runtime    | Node.js 20          |
| HTTP       | Express             |
| Validation | zod                 |
| DB         | better-sqlite3      |
| ID         | nanoid              |
| Realtime   | ws                  |
| Tracing    | OpenTelemetry SDK   |
| Petri 网    | 自研（基于 boundedness 算法） |

## 8.3 扩展方向

* Runtime 重构：Rust / Go / JVM
* 分布式执行：Redis Queue / BullMQ / NATS
* Petri 网求解器：替换为 LoLA / TAPAAL（高级用户）

---

# 9. 非功能性需求

| 类别    | 要求                                |
| ----- | --------------------------------- |
| 安全性   | API Key 后端存储，Secret 不入 Snapshot   |
| 可靠性   | Checkpoint + Recovery + Saga 补偿   |
| 可观测性  | 全链路 Trace，OpenTelemetry 兼容        |
| 响应性   | 流式状态更新 < 200ms，全量刷新 < 2s          |
| 可扩展性  | Adapter 可插拔，Petri 网求解器可替换         |
| 易用性   | 模板与引导 UI，验证错误提供修复建议               |
| 可移植性  | Workflow 导出/导入跨实例可执行              |

---

# 10. 里程碑

| 阶段 | 目标                              | 交付物                                  | 单独发布是否有完整价值 |
| -- | ------------------------------- | ------------------------------------ | ---------- |
| M1 | **端到端最小闭环**：导入 + 编辑 + 顺序执行（Node Schema **完整版**，但仅消费 dependencies/inputs/outputs，condition/loop/resources 仅声明不解释） | 单用户 MVP，可跑通一次任务 | ✅          |
| M2 | Runtime Engine + Checkpoint + Resume（boundary-only 起步） | 可恢复 Runtime                          | ✅          |
| M3 | Petri 网验证 + Dry Run，**启用** condition/loop/resources 语义     | Workflow Compiler                    | ✅          |
| M4 | Time Travel + 调试器 + 断点           | Runtime Debugger                     | ✅          |
| M5 | Adapter 生态 + 模板市场                | Adapter Marketplace                  | ✅          |

> 为什么这样做：原 M1 仅有"导入+可视化"无法独立给出用户价值。改为端到端最小闭环后，每个里程碑都能独立发布。

---

# 11. 术语表

| 术语                    | 描述                              |
| --------------------- | ------------------------------- |
| DAG                   | 有向无环图                           |
| Petri Net             | 并发系统形式化验证模型                     |
| Place / Transition / Token / Arc | Petri 网四要素              |
| Adapter               | 接入 Agent 执行器的统一抽象               |
| ACP                   | Agent Communication Protocol，Adapter 的一种实现 |
| Runtime Context       | 执行上下文                           |
| Artifact              | Agent 生成的文件或结果                  |
| Workflow Compiler     | 将任务规划编译为可执行 Runtime Plan 的系统    |
| Time Travel Debugging | 回退历史状态重新执行                      |
| Saga                  | 失败时反向操作的补偿事务模式                  |
| Adapter Manifest      | Adapter 自描述清单                   |

---

# 12. 附录 A：v1.1 → v2.0 变更摘要

| 项         | v1.1                       | v2.0                                  |
| --------- | -------------------------- | ------------------------------------- |
| 产品名       | Agent Flow Studio          | **Petrify**                           |
| 定位        | Agent Workflow IDE         | **Verifiable Agent Workflow Runtime** |
| 工作流模型     | 纯 DAG                      | DAG + Place/Token/Guard/Loop（Petri 网友好） |
| 执行层抽象     | ACP 为核心                    | **AgentAdapter** 为核心，ACP 是其一种实现       |
| Runtime Context | 五个并列模块                 | 加作用域/生命周期/可见性矩阵                    |
| 失败语义      | 隐式                         | 显式（retry/skip/abort/compensate + Saga） |
| 安全模型      | 未定义                        | Sandbox / Secret / 审计完整章节             |
| 成本控制      | 未定义                        | Token 预算 / 并发 / 超时上限                  |
| 可观测性      | "全链路 Trace"口号              | **OpenTelemetry 兼容 + 对接 Langfuse**    |
| 里程碑       | M1 仅"导入+编辑"无 Runtime（空壳）   | 每个 M 单独可发布，M1 即端到端闭环                  |
| 非功能指标     | 状态更新 < 2s                  | 流式 < 200ms / 全量 < 2s                  |

---

# 13. 附录 B：与 LangGraph / Temporal 的关键差异

* **vs LangGraph**：LangGraph 是 LLM 编排 SDK，Petrify 是带 IDE 的可验证 Runtime；LangGraph 无形式化验证，无 Time Travel UI。
* **vs Temporal**：Temporal 是通用长事务编排，强一致性但无 AI 语义；Petrify 专注 Agent 编排，内置 Prompt/Artifact/Adapter 抽象，开发者无需自行建模。
* **vs Dify / Flowise**：后者面向"低代码 LLM 应用"，Petrify 面向"可验证 Agent 工作流"，重在调试、恢复与正确性证明。

---

# 14. 总结

Petrify 的核心目标不是"自动化 AI"，而是：

> **把 AI 的不确定性，固化为可验证、可调试、可恢复的工程系统。**

它既是 Workflow IDE，也是 Agent Runtime，更是 AI 原生时代的一种新型软件工程基础设施——**让 Agent 工作流像传统代码一样，能被审查、能被证明、能被调试。**
