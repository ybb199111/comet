# Comet Skill Engine - 设计文档

- 初稿日期：2026-06-01
- 重构日期：2026-06-13
- 状态：已实现主体能力并完成术语修订（Foundation、Manual Authoring、Classic 运行时与 `/comet-any` 主线已落地；后续 Engine-native 收敛由 2026-06-22/23 specs 追踪）
- 目标版本基线：Comet 0.3.8

## 1. 背景

原设计希望把 Comet 从固定的 OpenSpec + Superpowers 五阶段流程，改造成由 YAML
状态图驱动的通用 Skill 编排引擎。

该方向抓住了“编排不应硬编码在 Skill 散文中”的问题，但在分支开发期间，master
已经补齐了大量稳定性能力：

- `comet-state.sh transition/next/check --recover`
- `auto_transition`
- plan-ready 暂停与恢复
- full/hotfix/tweak 路由与升级
- context snapshot、hash 与上下文压缩
- anti-drift rule 与写入 hook
- TDD、debug、review、verification gate
- delegated agent durable checkpoint
- lightweight/full verification
- branch handling 与 archive confirmation
- 多平台 Skill、rule、hook 分发

因此，原计划中“另建 `.comet.flow.yaml`，再让新引擎逐步替代现有流程”的方案已经
不再成立。它会造成两套状态源、两套恢复逻辑和两套稳定性契约。

本设计重新定义目标：

> Comet 不只是一个手工 workflow 引擎，而是一个创建、执行、恢复和评估复杂 Skill
> 的通用运行时。用户既可手工编排，也可通过 `/comet-any` 让 Agent 根据目标和现有
> Skill 自主组合，但两条路径最终交付同一种可验证的 Comet Skill。

## 2. 产品概念

对外只引入一个核心概念：**Comet Skill**。

- **Manual Skill**：高级用户手工定义内部 Skill Spec。
- **Agentic Skill**：由 `/comet-any` 通过交互澄清、能力探索和 Agent 组合生成。
- **Comet Skill Engine**：执行、约束、持久化、恢复和评估 Comet Skill 的底层引擎。
- **Skill Eval**：创建期 benchmark、grader、人工评审及触发准确率评估。

不把 Orbit、ReAct、Flow 或 Loop 塑造成新的用户级产品名词。ReAct 和 Loop Engineering
仅作为内部架构思想：

```text
Observe -> Decide -> Act -> Record -> Evaluate
   ^                                  |
   +----- continue / replan / wait ---+
```

## 3. 设计目标

### 3.1 双创建路径

```text
手工编排 ------------------+
                           +-> Comet Skill -> Eval -> Ready
/comet-any Agentic 组合 ---+
```

两种方式必须：

- 生成相同结构的 Skill。
- 使用同一个运行时。
- 使用同一个状态模型。
- 经过同一套静态验证、安全检查和评估发布门。

### 3.2 长程稳定运行

Comet Skill 必须能在上下文压缩、进程中断、模型切换和能力来源变化后恢复。稳定性不能
依赖 Agent 记住之前的对话。

### 3.3 受约束的动态规划

Agentic Skill 不是固定状态图。Agent 可以根据观察结果选择能力、追加步骤、重排计划
或回退重试，但不能绕过：

- 权限和能力白名单
- 预算和重试上限
- 用户决策点
- 不可跳过的质量门
- 完成条件与运行期 Evals

### 3.4 可评估和可迭代

新 Skill 不能只凭“看起来合理”发布。必须有测试提示、基线对照、可量化 assertion、
人工评审和 benchmark 结果。

## 4. 非目标

- 不要求用户手写复杂状态图。
- 不把任意内联 shell 作为扩展机制。
- 不在 v1 支持并行状态区域或通用分布式任务调度。
- 不复制或直接修改 Superpowers、OpenSpec 的原始 Skill。
- 不维护 classic 与自定义 Skill 两套运行时。
- 不让 Agent 在没有 Guardrails 和 Evals 的情况下无限自主循环。

## 5. Comet Skill 内部模型

Comet Skill 对外仍是普通 Skill 目录，对内增加由引擎消费的机器描述。

```text
<skill-name>/
  SKILL.md
  comet/
    skill.yaml
    guardrails.yaml
    evals.yaml          # 运行期 Evals
  evals/
    evals.json          # 创建期 Skill Eval
  scripts/
  references/
  assets/
```

并非每个 Skill 都必须拥有所有可选目录。`/comet-any` 根据实际需求生成最小结构。

### 5.1 Goal

定义：

- Skill 的目标
- 输入和输出
- 成功标准
- 明确非目标
- 可观察的完成条件

Goal 是运行期 Evals 判断完成的依据，不能只写成模糊自然语言愿望。

### 5.2 Orchestration

Orchestration 描述任务如何推进：

- `deterministic`：按 Skill 定义的步骤、分支和确认点执行。
- `adaptive`：由 Agent 根据 Goal、当前 Run 和 Guardrails 动态决定下一步。

两者使用同一个执行循环。手工创建和 `/comet-any` 创建是 Skill 的来源，不是两套运行
模式；任一来源都可以选择 deterministic 或 adaptive Orchestration。

### 5.3 Skills

Skills 是 Comet 的唯一可组合行为单元。一个 Skill 可以依赖其他 Skill，但只有当 Comet
需要发现、选择、排序、版本锁定或单独评估该依赖时，才把它声明到 Skill Spec。

Skill 内部自行使用的 Tool 或 MCP 不会自动提升为编排节点。Comet 不把所有底层能力
摊平成同一种抽象，避免 Skill 的实现细节泄漏到引擎。

声明的 Skill 依赖至少包含：

- 稳定标识
- 实际来源和版本信息
- 输入与输出契约
- 触发或调用条件
- 失败语义

### 5.4 Agents

Agents 描述由谁执行和协作，可以是单 Agent，也可以是 Agent Team。Skill Spec 可声明
角色、职责、协作拓扑和控制权转移规则，但不把 `subagent` 作为独立能力类型：

- subagent 是一个 Agent 相对于当前 Agent 的执行关系；
- Agent Team 是多个 Agent 的协作结构；
- `handoff` 专指把控制权移交给另一个 Agent；
- agent-as-tool 作为 Tool 调用，不发生控制权移交。

平台不支持多 Agent 时，Runtime Adapter 可以把角色映射为同一 Agent 的不同执行上下文，
但不得改变 Skill 的 Guardrails 和完成条件。

### 5.5 Tools

Tools 是 Agent 可调用的外部操作接口，包括：

- function tool
- MCP 暴露的 tool
- repository script
- agent-as-tool

MCP 是 Tool 的连接协议和来源，不与 Tool 平级成为编排节点。只有当 Comet 需要对 Tool
做发现、授权、平台映射、重试或审计时，Skill Spec 才显式声明它；否则它仍是 Skill
内部实现细节。

声明的 Tool 必须包含稳定标识、来源、输入输出、权限、副作用、超时、重试和确认要求。
禁止使用 Skill Spec 中的内联任意 shell 代替 Tool 声明。

### 5.6 Run

每次执行 Comet Skill 都产生一个 Run。Run 包含：

- **State**：当前步骤、状态、迭代、预算和 pending action。
- **Trajectory**：追加写入的动作、观察、结果、决策和 Evals 证据。
- **Context**：当前 Agent 调用所需的有效上下文，可由 Trajectory 压缩生成。
- **Artifacts**：设计、计划、代码、报告等带路径和 hash 的产物。
- **Checkpoints**：可恢复的一致性边界，记录 State 版本、Trajectory 偏移以及 Context
  Snapshot 和 Artifacts 的 hash。

这些数据必须持久化，不能只存在于聊天上下文。现有 `handoff_context` 表达的是上下文
快照而不是 Agent 控制权移交；新模型称为 **Context Snapshot**，兼容层继续读写旧字段。
Checkpoint 不复制另一份可独立修改的 State，`.comet.yaml` 始终是唯一状态真相源。

### 5.7 Memory

Memory 只使用业界常见含义：跨 Run、跨会话保留的 Agent 长期记忆。它是可选 Provider，
可以保存用户偏好、稳定事实或历史经验，但不是 Run 的状态源，也不能替代 Trajectory、
Artifacts 或 Checkpoints。

首版引擎不要求提供 Memory Provider。没有 Memory 时，长程恢复仍必须仅依赖持久化 Run。

### 5.8 Guardrails

Guardrails 定义 Agent 和 Orchestration 不得自行改写的边界：

- Skill 和 Tool 允许列表
- 文件和命令权限
- 用户确认点
- 最大迭代、重试、token、时间或成本预算
- TDD、debug、review、verification 等质量门
- 允许或禁止的计划变更
- 停止、降级和人工接管条件

### 5.9 Runtime Evals

运行期 Evals 判断：

- 是否取得进展
- 是否偏离 Goal
- 是否重复无效动作
- 当前输出是否满足质量门
- 是否需要重规划、重试、询问用户或停止
- 是否满足最终完成标准

Evals 既可使用确定性检查，也可使用 Agent 判断。主观判断必须留下证据和结论，
不能只返回无解释的布尔值。

### 5.10 概念提升原则

Comet 不追求把 Skill 内所有概念面面俱到地建模。只有引擎需要拥有以下职责时，概念
才进入 Skill Spec：

- 编排、版本锁定或单独评估的行为声明为 Skill 依赖。
- 控制权、角色或团队拓扑需要由运行时管理时声明 Agents。
- 发现、授权、平台映射或审计需要由运行时管理时声明 Tools。
- 必须跨步骤强制执行的边界声明为 Guardrails。
- 必须影响继续、重规划或完成判断的检查声明为 Runtime Evals。

其余实现细节保持在被调用 Skill 内部。这样既保留扩展性，也避免为了覆盖所有平台
能力而把核心模型做成庞大的统一抽象。

## 6. Comet Skill Engine

### 6.1 核心循环

引擎每轮执行：

1. **Observe**：读取 State、Trajectory、Context、Artifacts、预算和外部变化。
2. **Decide**：由 Orchestration 产生候选动作。
3. **Guardrail Check**：校验权限、确认点、预算和不可跳过规则。
4. **Act**：调用 Skill 或 Tool，或在 Agents 之间 handoff。
5. **Record**：追加 Trajectory，并更新 State、Artifacts 和必要的 Checkpoint。
6. **Evaluate**：判断继续、重规划、等待用户、失败或完成。

### 6.2 引擎动作

动作协议保持小而稳定：

- `invoke_skill`
- `call_tool`
- `handoff`
- `ask_user`
- `checkpoint`
- `replan`
- `complete`

Agents、Tools 和平台执行环境的差异由 Runtime Adapter 处理，不扩散到核心状态机。

### 6.3 单一写入者

Comet Skill Engine 是 `.comet.yaml` 的唯一状态写入者。

旧 shell 命令暂时保留，但只作为兼容门面调用新引擎，不再实现独立状态转换。

## 7. 状态模型

`.comet.yaml` 继续是唯一运行状态文件，保留 0.3.8 的现有字段，并渐进增加：

```yaml
skill: comet-classic
run_id: <uuid>
skill_version: 1
skill_hash: <sha256>
orchestration: deterministic
current_step: build.plan
iteration: 4
pending: null
trajectory_ref: .comet/trajectory.jsonl
context_ref: .comet/context.md
artifacts_ref: .comet/artifacts.json
checkpoint_ref: .comet/checkpoint.json
```

现有字段如 `workflow`、`phase`、`build_mode`、`build_pause`、`verify_result`、
`handoff_context` 等继续存在。经典 Skill 运行时由引擎同步这些兼容投影，其中
`handoff_context` 映射为 Context Snapshot，不占用 Agent handoff 的术语。

### 7.1 Skill 快照

Skill 启动时将以下信息快照到 change 的 `.comet/`：

- 解析后的 Skill Spec
- Skill 依赖、Agent/Team 配置及 Tool 来源和版本
- Guardrails 与 Runtime Evals
- Skill hash

恢复时读取快照，不自动跟随后来修改的 Skill 或 `.comet/skills.txt`。升级运行中 Skill
必须走显式升级和兼容校验。

### 7.2 旧 change 自动迁移

首次由新引擎读取旧 change 时：

1. 根据 `workflow` 选择 classic full/hotfix/tweak Skill。
2. 根据 `phase`、`verify_result`、`build_pause`、任务状态等推导 `current_step`。
3. 保存 classic Skill 快照和 hash。
4. 保留 Context Snapshot、branch、review、verification、context compression 和
   delegated agent checkpoint。
5. 写入迁移版本，确保迁移幂等。

用户无需运行单独的 migrate 命令。

## 8. 项目 Skill 偏好池

项目可创建：

```text
.comet/skills.txt
```

格式为一行一个 Skill 名：

```text
brainstorming
writing-plans
test-driven-development
requesting-code-review
```

语义：

- 表示 `/comet-any` 应优先探索和组合的 Skill。
- 不表示固定顺序。
- 不是严格白名单。
- 稳定性或目标需要时，Agent 可以建议并补充其他 Skill。

解析规则：

- 缺失 Skill：让用户选择安装、替代或忽略。
- 同名多来源：展示路径和描述，由用户消歧。
- 最终选择的来源和版本写入生成 Skill 的依赖快照。
- 已生成 Skill 不随偏好文件变化。

## 9. `/comet-any`

`/comet-any` 是 Agentic Skill 创建器，不是临时 workflow runner。

### 9.1 创建流程

1. 读取用户描述和 `.comet/skills.txt`。
2. 发现候选 Skill，并识别当前平台可用的 Agents 和 Tools。
3. 读取候选 Skill 实现，而不只根据名字猜测能力。
4. 交互澄清目标、输入输出、边界、风险和成功标准。
5. 选择 `deterministic` 或 `adaptive` Orchestration。
6. 生成 Comet Skill draft。
7. 静态验证 Skill Spec、依赖、Guardrails 和路径安全。
8. 运行 Eval Provider。
9. 展示 benchmark 和人工评审界面。
10. 根据反馈迭代，直到通过发布门。
11. 标记 `ready` 并安装到目标平台。

### 9.2 稳定性实践注入

`/comet-any` 根据任务风险和长度选择性注入 Comet 已验证的能力：

- 状态持久化和断点恢复
- 上下文压缩与 Context Snapshot
- 用户决策阻塞点
- 防漂移规则
- TDD、systematic debugging、review 和 verification
- bounded retry
- delegated agent 或 Agent Team checkpoint
- 预算和停止条件
- branch 和 archive 等资源收尾

这些不是固定五阶段模板。Agent 应根据 Goal 配置适当 Guardrails，并在 eval 中验证
约束确实提高结果。

## 10. Skill Eval

### 10.1 发布状态

```text
draft -> eval -> review -> ready
```

未完成 benchmark 和人工评审的 Skill 不得标记为 `ready`。

### 10.2 Eval Provider

提供统一 Eval Provider 接口：

- 优先调用当前平台原生的高级 `skill-creator`。
- 平台缺失完整评估能力时，使用 Comet 兼容 Provider。
- Provider 输出统一格式，至少覆盖：
  - `evals/evals.json`
  - with-skill 与 baseline 结果
  - assertion grading
  - token 和耗时
  - pass rate 与方差
  - benchmark JSON/Markdown
  - 人工评审反馈

Claude 官方 `skill-creator` 的 benchmark、grader、viewer、描述触发优化和盲测能力作为
首个参考 Provider。

### 10.3 两类 Evals

- **创建期 Skill Eval**：判断 Skill 相比 baseline 是否有效，决定能否发布。
- **运行期 Evals**：判断单次 Run 是否进展、漂移、失败或完成。

两者共享 assertion 和证据理念，但生命周期不同，不能混为一个模块。

## 11. 经典 Comet Skill

现有 OpenSpec + Superpowers 流程改造成首个内置 Comet Skill。

要求：

- 首先完整兼容 0.3.8 行为。
- full、hotfix、tweak 通过同一引擎执行。
- plan-ready、verify-fail、finishing branch、archive confirm、preset upgrade 等决策点
  显式进入 Guardrails/Orchestration。
- Context Snapshot、context recovery、hook、Agent handoff 和 delegated agent checkpoint
  等能力继续保留。
- 建立 baseline benchmark，测量当前经典流程的成功率、token、耗时、恢复能力和漂移。
- 根据评估结果改进经典 Skill，而不是假设现有流程已经完善。

经典 Skill 同时承担：

- 兼容迁移目标
- 引擎参考实现
- `/comet-any` 生成长程 Skill 时的稳定性模式样本
- Comet 自身能力的回归基准

## 12. 安全模型

- 禁止 Skill Spec 中内联任意 shell。
- repository script Tool 只能引用允许根目录内的仓库文件。
- 路径必须解析、规范化并进行目录边界校验。
- 显式 Tool 必须声明副作用和所需权限。
- 高风险动作必须由 Guardrails 转为用户确认。
- 动态重规划不得增加未授权 Skill/Tool 或放宽 Guardrails。
- 预算耗尽、重复无进展、Runtime Evals 持续失败时必须停止或请求人工介入。
- Skill 创建与运行的 Trajectory 必须可审计。

## 13. 分层架构

```text
                    +----------------------+
手工 Skill Spec --->|                      |
                    |  Comet Skill Package |---> Eval Provider ---> Ready
/comet-any -------->|                      |
                    +----------+-----------+
                               |
                    +----------v-----------+
                    |  Comet Skill Engine  |
                    +----------+-----------+
                               |
        +----------------------+----------------------+
        |                      |                      |
 Skills / Agents / Tools       Run Model          Guardrails / Evals
  Runtime Adapters       state/trajectory/context   review/progress/done
```

主要代码边界：

- `src/skill/`：Skill Spec、加载、校验、快照和发现。
- `src/engine/`：循环、状态转换、Trajectory、Context、Checkpoints、Guardrails 和
  Runtime Evals。
- `src/runtime/`：Agents、Tools 和平台 Runtime Adapter。
- `src/eval/`：Skill Eval Provider 适配和统一 benchmark 结果。
- `src/compat/`：0.3.8 状态映射和 shell 兼容。
- `src/commands/skill.ts`：validate、inspect、run、resume、eval。

最终文件名在实施计划中按当前仓库模式进一步细化。
Memory Provider 仅保留扩展接口，首版不要求实现或建立独立代码模块。

## 14. 实施顺序

### 阶段 A：Engine Foundation

- 定义 Skill Spec，以及 Skills、Agents、Tools 的最小声明边界。
- 建立 `.comet.yaml` 增量 schema、Trajectory、Context、Artifacts 和 Checkpoints。
- 实现 deterministic/adaptive Orchestration 接口。
- 实现 Guardrails、Runtime Evals 和受限动作协议。

### 阶段 B：Classic Migration

- 把 0.3.8 行为写成兼容契约测试。
- 实现旧 change 自动迁移。
- 将 shell 状态机改为兼容门面。
- 迁移 full/hotfix/tweak 到 classic Skill。
- 建立 classic baseline benchmark。

### 阶段 C：Manual Authoring

- 提供手工 Skill Spec。
- 实现 validate、inspect、run、resume、eval。
- 提供项目级 Skill 发现和安装。

### 阶段 D：`/comet-any`

- 实现 `.comet/skills.txt`。
- 能力发现、实现探索和交互消歧。
- 生成 Skill draft。
- 接入 Eval Provider、人工评审和发布门。
- 支持已有 Comet Skill 的增量优化和重新评估。

每个阶段都必须独立可测试和可回滚，不在一次发布中直接删除全部旧脚本。

## 15. 原计划调整结论

原实施计划不能直接执行，应整体重写。具体变化：

| 原计划 | 新设计 |
|---|---|
| `*.flow.yaml` 是产品核心 | Comet Skill 是产品核心，Skill Spec 是内部 IR |
| 用户主要手写 workflow | 同时支持手工定义和 `/comet-any` Agentic 创建 |
| node = one skill | Skill 是组合单位；Agents 与 Tools 是声明依赖，不强制成为节点 |
| 固定状态图决定下一步 | deterministic 或受 Guardrails 约束的 adaptive Orchestration |
| `.comet.flow.yaml` 独立状态 | 扩展现有 `.comet.yaml`，保持单一真相源 |
| shell 状态机与新引擎共存 | TS 引擎唯一写状态，shell 仅兼容转发 |
| context handoff 等留到后续 | Context Snapshot 等作为 0.3.8 兼容基线，首轮必须保留 |
| classic 只是 YAML 示例 | classic 是内置 Skill、迁移目标和 benchmark 基准 |
| 测试只覆盖引擎函数 | 增加 baseline、grader、benchmark、人工评审与恢复测试 |
| Skill 生成后即可交付 | 强制 `draft -> eval -> review -> ready` |

旧计划中的纯函数引擎、图校验、状态快照和跨平台 adapter 思想仍可复用，但任务拆分、
数据结构、CLI、状态文件和 classic 迁移方案必须按本设计重新制定。

## 16. 成功标准

- 现有 0.3.8 classic change 可自动迁移并继续运行。
- classic 行为拥有兼容契约和 benchmark，不依赖人工目测。
- 用户可以手工创建并运行 Comet Skill。
- 用户可以通过 `/comet-any` 仅描述目标和候选 Skill，获得可安装的 Comet Skill。
- `/comet-any` 会读取候选 Skill 实现，而不是仅按名称排列。
- 新 Skill 未通过 eval 和人工评审时不能发布为 ready。
- 长程任务可在上下文压缩或进程中断后从持久化 Run 恢复。
- Agent 动态重规划不能绕过 Guardrails、预算、确认点和 Runtime Evals。
- Skill 可以组合其他 Skill，并按需声明 Agent/Team 与 Tool 依赖，而不暴露无关实现细节。
