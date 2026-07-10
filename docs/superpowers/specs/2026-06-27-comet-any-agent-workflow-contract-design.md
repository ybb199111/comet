# Comet Any Agent Workflow Contract Design

日期：2026-06-27

状态：已按实现落地，作为 `/comet-any` 后续演进的当前规格。

范围：让基于 Comet 现有 Skill 的五阶段定制、任意 Skill workflow、手动 Skill 编排、runtime scripts、eval、review、publish readiness 共享一套 Agent workflow contract。系统尚未上线，本规格直接定义新的事实源，不承担旧草案兼容负担。

## 背景

`/comet-any` 需要支持三类用户目标：

1. 基于 Comet 现有 Skill 的五阶段定制：保留 Comet 主流程控制能力，同时在执行、子代理执行、审查等节点要求项目 Skill 参与。
2. 生成任意 Skill workflow：用户给出业务场景和候选 Skill，系统生成可恢复、可验证、可评估的 workflow。
3. 手动编排 Skill：高级用户直接声明节点、绑定、产物契约和校验规则。

关键判断是：Skill 可以替换，但脚本、eval 和 readiness 不能靠 Skill 名称猜产物。凡是后续流程会读取或校验的结果，都必须通过 Output Schema 声明。

## 目标

- 使用与业界 Agent workflow 对齐的概念：Workflow、Node、Skill Binding、Required Skill Call、Output Schema、Guardrail、Handoff、Evidence。
- 把 Skill implementation 与节点输出契约分离，让替换 Skill 必须满足对应 Output Schema。
- 让 Required Skill Call 表达“必须调用某 Skill”，但不替换节点 implementation。
- 让 Comet 五阶段定制与任意 workflow kernel 共用同一个 Workflow Protocol。
- 让 runtime scripts、eval、review、publish readiness 都读取 `reference/workflow-protocol.json`。
- 保持普通用户路径简单：用户描述场景，系统把它编译成 workflow contract；高级用户可以手写 contract。

## 非目标

- 不修改 Superpowers、OpenSpec 或用户原始 Skill。
- 不让普通用户手写底层 protocol JSON。
- 不为每一次 Skill 替换重写脚本主体。
- 不让 control Node 在普通模式下被替换。
- 不把内部坐标作为用户理解流程的主要入口；用户面对的是 Node label、职责、Skill 调用和 Output Schema。

## 核心模型

所有 `/comet-any` 路径都编译为：

```text
WorkflowDefinition
  = Nodes
  + Edges
  + State model
  + Skill Bindings
  + Output Schemas
  + Guardrails
  + Eval/readiness requirements
```

编译结果是 `WorkflowProtocol`，写入生成 Skill 的 `reference/workflow-protocol.json`，作为运行、评估和发布前检查的共同事实源。

## Node 类型

- `control`：推进主流程状态的节点。普通模式只允许 require/augment，不允许 override。
- `producer`：产出后续节点会读取的 Artifact。允许 override，但必须声明 `satisfies` 的 Output Schema。
- `action`：执行实际工作并记录 evidence。若结果被后续依赖，也必须有 Output Schema。
- `handoff`：委派给子代理或另一个 Agent。必须要求回传 evidence。
- `guardrail`：审查、阻断或确认节点。用于 review、安全、白盒规范等检查。

每个 Node 都必须声明 `responsibility`，用自然语言说明它在 Agent workflow 中承担的职责。用户和 review/readiness 面对的是 responsibility、Skill Binding、Output Schema 和 Guardrail，不面对内部坐标。

## Skill Binding 操作

- `require`：节点执行时必须调用某 Skill，并记录 evidence；不替换节点 implementation。
- `augment`：在节点前、中、后追加辅助 Skill；不改变父节点 Output Schema。
- `override`：替换节点 implementation；仅对允许替换的节点开放，并必须满足 Output Schema。
- `disable`：关闭 optional Node 或 optional binding；不能关闭必需节点或必需产物。

## Output Schema

Output Schema 是脚本、eval、review 和 readiness 可依赖的接口。

每个 schema 至少声明：

- `id`：稳定 schema id，例如 `comet.plan.v1`。
- `artifacts`：必需或可选文件、目录、状态或报告。
- `evidence`：必需或可选证据字段。
- `validations`：`evidence-only`、`artifact-exists`、`artifact-structured`、`semantic`、`state-transition`。

规则：

- Required Skill Call 至少需要 evidence。
- Producer override 必须满足该 producer 节点要求的 schema。
- Control Node 的状态推进由 workflow state 或 Comet state 校验。
- 自定义校验器必须进入 executable disclosure。

## Comet 五阶段定制

基于 Comet 现有 Skill 的五阶段定制覆盖的是现有阶段 Skill，而不是修改 `/comet` 命令本身：

```text
comet-open -> comet-design -> comet-build -> comet-verify -> comet-archive
```

内置节点：

- `open`：control，产出 `comet.intake.v1`。
- `design`：producer，产出 `comet.design.v1`。
- `plan`：producer，产出 `comet.plan.v1`。
- `execute`：control，产出 `comet.execution-evidence.v1`。
- `subagent-execute`：handoff，产出 `comet.handoff.v1`。
- `review`：guardrail，产出 `comet.review.v1`，可选。
- `verify`：control，产出 `comet.verify.v1`。
- `archive`：control，产出 `comet.archive.v1`。

示例：

```yaml
workflow:
  kind: comet-five-phase-overlay
  name: team-comet
  goal: Require component-library and whitebox review Skills.
  nodes:
    execute:
      requiredSkillCalls:
        - skill: elementui
          reason: Use the project component library during implementation.
    subagent-execute:
      requiredSkillCalls:
        - skill: elementui
          scope: handoff
    review:
      requiredSkillCalls:
        - skill: whitebox-code-standard
          scope: review
```

这个例子不会替换 Comet 主控制节点；它只要求指定节点必须调用额外 Skill 并记录 evidence。

## 任意 Skill Workflow

任意 workflow 不继承 Comet 的 OpenSpec-specific 语义，而是生成 `workflow-kernel`：

- Nodes 来自用户目标、偏好 Skill、手动定义或自动规划。
- Edges 定义成功、失败、暂停和恢复路径。
- State 写入 `.comet/runs/<workflow>/state.json`。
- Runtime scripts 读取 `reference/workflow-protocol.json`。

这种模式适合研究-写作、设计-实现-审查、数据处理、团队规范检查等非 Comet 流程。

## 手动编排

高级用户可以直接声明：

```yaml
workflow:
  kind: workflow-kernel
  name: research-writer
  goal: Research, draft, and review a document.
  customNodes:
    - id: research
      label: Research
      kind: producer
      responsibility: Collect research notes for the writing workflow.
      implementation:
        skill: research-skill
      outputSchemas:
        - research.notes.v1
      operations:
        - require
        - augment
        - override
      requiredSkillCalls:
        - skill: domain-design
          reason: Reuse the project domain model before writing notes.
```

手动模式必须通过 schema validation；未声明 Output Schema 的 producer override 不能通过。自定义 Node 可以直接声明 `requiredSkillCalls` 和 `augmentations`，这些 binding 会进入 `workflow-protocol.json`、call chain、runtime guard 和 eval manifest。

## Runtime Scripts

生成 Skill 至少包含：

- `workflow-state.mjs`：读写 state、checkpoint 和 evidence。
- `workflow-guard.mjs`：读取 protocol 并校验节点进入/退出条件。
- `workflow-handoff.mjs`：输出跨节点交接上下文。
- `comet-check.mjs`：给 eval/readiness 复用，检查 protocol、schemas、artifacts 和 state。
- `comet-hook-guard.mjs`：在需要 hook guard 的平台上按 protocol 和 state 阻断无效操作。

原则：

- 脚本读取 Workflow Protocol，不猜 Skill 的产物。
- 脚本读取 state，不把节点顺序散落到多个文件。
- 脚本根据 Output Schema 检查 artifacts/evidence。
- 自定义校验器只有在 schema 需要时才生成。

## Eval / Review / Readiness

`comet eval`、review summary、publish readiness 均读取 Workflow Protocol。

它们至少检查：

- protocol 可以加载且 hash 稳定。
- Nodes、Edges、Output Schemas 一致。
- Required Skills 可解析。
- Producer override 满足 Output Schema。
- Required Skill Call 有 evidence 要求。
- Handoff Node 要求子代理返回 evidence。
- Guardrail Node 能记录阻断或通过证据。
- Control Node 没有被普通模式替换。

## 用户体验

普通用户看到的是自然语言总结：

```text
我会这样改：

- 直接执行节点：必须调用 elementui，并记录调用证据。
- 子代理执行节点：派发给子代理时必须要求 elementui，并要求回传证据。
- 审查节点：必须调用 whitebox-code-standard，并把结果纳入 review guardrail。

这不会替换 Comet 主流程，也不会改变计划、验证或归档产物。
```

当用户想替换 producer：

```text
这是计划节点的实现替换。后续执行需要读取可执行计划。

请确认 team-planning 满足 comet.plan.v1，或提供它产出的文件路径和校验方式。
```

## 模块划分

- `domains/workflow-contract`：WorkflowDefinition、WorkflowProtocol、Node、Binding、OutputSchema、Guardrail、normalization、validation、hashing、内置 Comet template。
- `domains/bundle`：读取用户 plan/proposal，管理 factory state、review、readiness、publish。
- `domains/factory`：从 normalized workflow contract 渲染 Skill package、reference、scripts、rules、hooks 和 eval manifest。
- `eval`：执行 workflow-aware 的任务收集、rubric 评分和 HTML 报告。

## 验收标准

- `/comet-any` 用同一套 Workflow Contract 表达 Comet 五阶段定制、任意 workflow 和手动编排。
- 用户可以要求执行和子代理执行节点必调 `elementui`，生成物不替换 Comet 主流程。
- 用户可以要求 review 节点必调白盒规范 Skill，生成物会记录 evidence 并参与 guardrail。
- 用户替换 `design` 或 `plan` 时必须满足对应 Output Schema。
- 普通模式拒绝替换 control Node。
- Runtime scripts、eval、review、publish readiness 共用 `workflow-protocol.json`。
- 生成 Skill 保持 Comet-like 的单入口、自动推进、停顿点、恢复、证据和阻断体验。
