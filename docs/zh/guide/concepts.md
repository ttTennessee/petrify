> 本文翻译自英文版，英文为权威版本（可能领先于中文）：[en/guide/concepts.md](../../en/guide/concepts.md)

# 核心概念：Plan → Verify → Execute

Petrify 是一个**可验证的 Agent 工作流运行时**。它不写 Agent，也不做模型推理，而是站在"用户意图"和"异构 Agent 执行器"之间，用形式化模型（Petri 网）让 AI 工作流**可证明正确**，而不只是能跑起来。

理解 Petrify，只需要抓住三件事：**一个生命周期、一个数据模型、一个执行边界。**

---

## 1. 生命周期：Plan → Verify → Execute

Petrify 把每个工作流的生命周期固化为三个阶段。**未经验证的工作流不会进入执行**（除非用户显式覆盖）。

```
   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │   Plan   │ ───▶ │  Verify  │ ───▶ │ Execute  │
   └──────────┘      └──────────┘      └──────────┘
        │                 │                  │
   编辑/导入           静态分析             调度/重试
   JSON Blueprint       Dry Run            Checkpoint
                                          Time Travel
```

### Plan — 把意图变成图

- 输入：自然语言、JSON、模板，或外部 LLM 通过 **Prompt Template** 产生的 Blueprint。
- 输出：一张 **Workflow Graph**（节点 = Transition，槽位 = Place，资源/配额 = Token）。
- 关键点：**Petrify 自身不做模型推理。** LLM 只通过 Adapter 边界进入运行时；图是用户态产物，可以粘贴、导入、手编。

### Verify — 在执行前回答"这图能跑吗"

静态验证回答四类问题：

| 性质 | 直觉描述 |
|---|---|
| **Deadlock** | 是否存在永远拿不到资源/前置条件的节点？ |
| **Liveness** | 是否每个节点最终都有机会被触发？ |
| **Reachability** | 终止状态是否真的可达？ |
| **Boundedness** | Token 数量是否有界（资源池是否会无限堆积）？ |
| **Termination** | 循环是否声明了退出条件？ |

外加 **Dry Run**：不调用真实 Adapter，用模拟 Token 走一遍图，预演调度顺序、资源争用、分支选择。

### Execute — 带着可观测性跑起来

执行期不只是"按拓扑序调一遍"。Runtime 提供：

- **Scheduling**：DAG + 并发同步（AND-join）+ 条件分支（XOR-split）。
- **Retry / Skip / Abort / Compensate**：节点级失败处理；Compensation 是 Saga 风格。
- **Checkpoint & Resume**：在节点边界落盘状态，崩溃后从断点继续，而不是从头重跑。
- **Time Travel & Breakpoints**：回到任一历史时刻、设断点、单步调试。
- **Event Stream**：OpenTelemetry 兼容的 Trace，对接 Langfuse / Tempo / Jaeger。

---

## 2. 数据模型：DAG + Petri 网扩展

Petrify 的图**不是纯 DAG**。这是它和 LangGraph、AutoGen 等"DAG 优先"框架的根本差异。

| Petri 网概念 | Petrify 中的映射 |
|---|---|
| **Transition** | 节点（一次 Agent 调用、一段工具执行） |
| **Place** | 变量槽、Artifact 槽（节点的输入/输出） |
| **Token** | 数据值、资源配额、锁 |
| **Arc** | 边，带 `kind`：`control` / `data` / `resource` |

为什么不退回纯 DAG？因为下列语义只有 PN 扩展才能精确表达：

- **资源池**：多个节点共享一个限流配额，资源边指向 `pool:<name>`。
- **AND-join**：多个上游必须全部到齐，下游才能触发（拓扑序里这只是一个点，没有 Token 概念无法定义"到齐"）。
- **XOR-split**：守卫表达式（Guard）决定走哪条分支。
- **循环 + 退出条件**：循环必须声明退出，否则验证阶段就拒绝。

这些语义让验证有真实的内容可分析。如果把它简化回纯 DAG，验证就只剩下"有没有环"这种平凡问题。

> **不要**为了"看起来简单"在 UI 里画 Petri 网。PN 是节点的**元数据子结构**，前端只展示 React Flow 风格的 DAG 视图。这是有意为之的认知负担管理。

---

## 3. 执行边界：AgentAdapter 是唯一入口

Petrify 自己不知道怎么调 Claude、不知道怎么跑 `claude-code-cli`、也不知道 ACP 协议长什么样。**所有执行能力都通过 Adapter 注入。**

```
        Runtime Engine
              │
              ▼
       ┌─────────────┐
       │ AgentAdapter│   ← 唯一边界
       └─────────────┘
        │     │     │
        ▼     ▼     ▼
       ACP   CLI   Mock     openai-tools  …
```

Adapter 接口只有四件事：

- `manifest` — 自我描述（能力、Checkpoint 级别、需要的 Env 等）
- `invoke` — 返回 `AsyncIterable<RuntimeEvent>` 的执行函数
- `cancel` — 中断执行
- `checkpoint / restore` — 持久化/恢复（按 Manifest 声明的级别）

### Checkpoint 是"声明的"，不是"假设的"

Adapter 必须在 Manifest 里声明自己的 Checkpoint 能力级别：

| 级别 | 含义 |
|---|---|
| `none` | 不支持 Checkpoint，崩溃后整图重跑 |
| `boundary-only` | 只能在节点边界落盘，从失败节点起重跑该节点 |
| `soft` | 节点内部有粗粒度断点（如工具调用之间） |
| `full` | 完整可恢复，可在任意指令处续跑 |

Petrify 的 Runtime Checkpoint 必须在 `none` 也能工作（降级到整图重跑）。**永远不要写默默假设 `soft`/`full` 的恢复逻辑。**

> ACP、`claude-code-cli`、`openai-tools`、`mock` 是**同级**的 Adapter，**ACP 不是特权协议**。如果你看到代码里 ACP 被特殊对待，那是 bug 不是 feature。

---

## 4. Runtime Context：四种作用域

执行期的状态被切成四种作用域，**生命周期各不相同**：

| 作用域 | 生命周期 | 是否进 Checkpoint | 是否进 Artifact | 是否进 Prompt Snapshot |
|---|---|---|---|---|
| **Variables / Memory** | 整个工作流执行 | ✅ | ❌ | 可配置 |
| **Artifacts** | 不可变，长期 | ✅（引用） | ✅ | 通常 ❌ |
| **Env**（含 Secrets） | 进程注入，不落盘 | ❌ | ❌ | **绝不**❌ |
| **Prompt Snapshot** | 单次节点执行的 trace 条目 | ✅（trace） | ❌ | — |

**安全不变量**：从 Env 解析出的 Secret **绝不能**进入 Prompt Snapshot 或 Artifact。这是硬约束，不是建议。

---

## 5. 失败语义是显式的

很多框架对"出错了怎么办"留白，让用户在 try/catch 里自由发挥。Petrify 把它放到模型里：

**节点级策略**（在 Node Schema 的 `on_failure` 里声明）：

- `retry` — 按退避策略重试
- `skip` — 跳过，下游按"上游未产出"处理
- `abort` — 终止整图
- `compensate` — 触发 Saga 风格的补偿事务

**图级策略**：

- `fail-fast` — 任一节点失败，立刻中止
- `partial-continue` — 失败的分支隔离，其他分支继续
- `branch-isolation` — 失败不向上传播，但同分支后续节点跳过

Time Travel、Resume、Compensation 都建立在这套显式语义上。**不要绕过它写临时的 try/catch。**

---

## 6. 不做什么（Non-goals）

为了让边界清晰，Petrify 明确**不做**这些事，遇到这类请求要拒绝范围蔓延：

- ❌ 模型训练 / fine-tuning
- ❌ 内置 RAG / 向量库
- ❌ Agent SDK（不和 LangGraph / AutoGen 在"怎么写 Agent"上竞争）
- ❌ 内置 LLM 推理
- ❌ MVP 阶段的多用户协作
- ❌ 托管云服务（先做好自托管）

---

## 接下来读什么

- 想动手跑一个：[Getting Started](./getting-started.md)
- 想看节点/边的精确字段定义：[Workflow Schema](../reference/workflow-schema.md)
- 想接入自己的执行器：[AgentAdapter Overview](../adapters/overview.md)
- 想理解 PN 扩展的形式化语义：[Petri-net Model](../architecture/petri-net-model.md)
