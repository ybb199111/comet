# Comet 通用 Skill 编排引擎 — 设计文档

- 日期：2026-06-01
- 状态：草案（待用户审阅）
- 作者：brainstorming 协作产出

## 1. 背景与问题

Comet 当前是 **OpenSpec + Superpowers 专用编排器**：

- 编排逻辑**硬编码在 `assets/skills/comet/SKILL.md` 的散文 + 决策表**里，Agent 靠"阅读理解"驱动 5 阶段流程（open → design → build → verify → archive）。
- 状态机写死在 `comet-state.sh`，`.comet.yaml` 的字段（`phase`/`build_mode`/`verify_result` 等）和 enum 不可扩展。
- HITL 阻塞点、意图检测、resume 规则散落在 SKILL.md 的散文里。
- CLI（`init`/`status`/`doctor`/`update`）只负责安装 skill，不驱动工作流。

**痛点**：流程固定、编排写死在 skill 源码里。用户想新增/替换 skill、调整流程时，必须大量修改 skill 源码，成本高。而市面上优秀的高星 skill 很多，价值在于**灵活编排复用它们**，而非每个能力都自己写。

**目标**：把 Comet 的稳定性特性（状态机、退出机制、意图识别、HITL、断点恢复）**原子组件化**，让用户**只编排 YAML/JSON + 用 CLI 操作**就能组合任意 skill，并稳定可靠地触发 skill 链路。架构原子化、高扩展。

## 2. 核心决策（已与用户确认）

| # | 决策 | 选择 |
|---|---|---|
| 1 | 引擎与现有 5 阶段的关系 | 引擎通用；现有 5 阶段**降级为内置"经典模式"预设**，用新引擎重写 |
| 2 | 执行模型（谁做控制流决策） | **C：引擎(CLI)决策 + Agent 执行**。CLI 算"下一步"，Agent 忠实触发 skill / 问用户 |
| 3 | workflow 拓扑模型 | **状态图**：nodes + 条件 transitions（支持分支/循环/跳转） |
| 4 | 外部 skill 接入方式 | **轻量 adapter 描述符**（触发指令 / 产物 / done-check），外部 skill 零侵入 |
| 5 | 条件/退出门表达 | **声明式 DSL + shell 逃生口**（退出码作真假） |
| 6 | 引擎实现基座 | **TS CLI**（随 npm 分发）；shell 仅作用户自定义 guard 逃生口 |
| 7 | 自动触发门控 | **独立于 HITL 的两个原子组件**：节点级 `auto_invoke` + 边级 `auto`/`gate` |

**硬约束**：skill 本质是 Agent 通过 Skill 工具触发的 markdown 提示词，没有任何 CLI 能在代码里"跑完一个 skill"。Agent 永远在回路里亲手触发每个 skill（"真正触发，不是看起来像触发"）。因此引擎只做**决策**，不做 skill **执行**。

## 3. 分层架构

四层，自上而下耦合度递减，每层可独立测试。

```
① 编排层 (用户编辑)        *.flow.yaml 状态图 + skill adapters
② 引擎层 (TS CLI 纯函数)   next / advance / DSL求值 / 意图路由 / resume
③ 状态层 (引擎读写)        .comet.yaml: current_node + artifacts + vars + history
④ 驱动层 (固定瘦 SKILL.md) next → 触发skill/问用户 → advance → 循环
```

| 层 | 内容 | 谁改 | 换/加工作流时是否变 |
|---|---|---|---|
| ① 编排层 | `*.flow.yaml` + adapters | 用户/编排者 | **变**（唯一变的层） |
| ② 引擎层 | TS CLI 决策纯函数 | comet 维护者 | 不变 |
| ③ 状态层 | `.comet.yaml` 运行时实例 | 引擎写 | 实例不同，结构不变 |
| ④ 驱动层 | 瘦 SKILL.md 驱动循环 | 几乎不动 | **不变** |

**关键不变量**：换/加工作流时只动 ① 层 YAML；②③④ 全不变。这是"加 skill 不用改源码"的结构保证。

### 隔离与可测试性

- **引擎层 = 纯函数**：给定 (workflow 定义 + 状态文件)，算出下一步动作 / 校验转换 / 计算 resume。无需 Agent，可纯单测。
- **adapters = 纯数据**：schema 校验即可。
- **驱动层 = 瘦层**：固定循环逻辑，行为不随工作流变化。

## 4. 五大稳定性特性 → 引擎原子组件

| 特性 | 原子组件 | YAML 表达 |
|---|---|---|
| 状态机 | 状态图 + 状态文件记 current_node/history | `nodes:` / `transitions:` |
| 退出机制 | 每个 node 的 `exit:` guard，不满足拒绝 `advance` | `exit: state.verify_result == 'pass'` |
| 意图识别 | `router` 节点 / 入口分类器：声明式意图规则 → 选工作流或分支 | `router:` + `intents:` |
| HITL | node/transition 上 `hitl:` 块，引擎返回"必须问用户" | `hitl: { question, options }` |
| 断点恢复 | 状态文件持久化 current_node+artifacts；`next` 为状态纯函数 → 恢复=重算 | 引擎内建 |

将原本散落在散文里的 blocking points / Step 0 意图检测 / resume 规则，全部下沉为**数据 + 引擎逻辑**。

## 5. 自动触发门控（独立于 HITL 的原子组件）

### 5.1 概念区分

HITL 与"自动触发"是**正交**的两个维度，不可混淆：

| 组件 | 语义 | 例子 |
|---|---|---|
| **HITL** | *决策*点：用户在多选项里选，影响路由/行为 | 修复 vs 接受偏差；方案 A vs B |
| **触发门控 (trigger gate)** | *推进策略*：是否自动流向下一步，不涉及分支 | 自动直推 / 暂停等"go" |

**结论**：触发门控独立成一等公民，不复用 HITL。理由：正交性、默认值机制更干净、引擎判定优先级清晰、YAML 可读性更高。

### 5.2 两个粒度

- **节点级 `auto_invoke`**：到达节点时，是否自动触发绑定 skill（"skill 内部是否自动触发"）。
- **边级 `auto` / `gate`**：退出门通过后，是否自动推进到下一节点（"阶段间是否自动触发"）。

两者都有工作流级默认 `defaults.auto_invoke` / `defaults.auto_advance`，可在单个 node/边覆盖。

### 5.3 引擎 `next` 判定优先级（短路）

1. 若当前存在 `hitl` 决策点 → 返回 `ask_user`（必须选择）
2. 否则看门控策略：
   - `auto: true` / `auto_invoke: true` → 返回 `invoke_skill` 或直接推进（连续流）
   - `false`（即 `gate`）→ 返回 `await_confirm`（暂停，等用户一句"继续"，非选择题）

三种停顿语义清晰分离：**决策(HITL) / 确认门(gate) / 自动直推**。

## 6. YAML 模型

```yaml
# classic.flow.yaml （示意）
name: classic
defaults:
  auto_advance: true        # 边级默认：自动直推
  auto_invoke: true         # 节点级默认：到节点自动触发 skill

entry:
  router:                   # 意图识别：选入口/工作流
    intents:
      - match: "hotfix | bug fix"   # 声明式意图规则（可带 shell 逃生口）
        to: hotfix_build
      - match: "copy | config | docs tweak"
        to: tweak_build
      - default: true
        to: open

nodes:
  open:
    skill: openspec/opsx-new
    exit: artifacts.proposal exists && artifacts.tasks exists
    hitl: { when: before_advance, question: "确认提案/设计/任务？", options: [继续, 调整] }
    produces: [proposal, design, tasks]

  design:
    skill: superpowers/brainstorming
    entry: artifacts.proposal exists
    auto_invoke: false      # 节点级覆盖：先问"现在触发设计 skill 吗"
    exit: artifacts.design_doc exists
    hitl: { when: before_advance, question: "确认设计方案？", options: [继续, 调整] }
    produces: [design_doc]

  build:
    skill: superpowers/subagent-driven-development
    exit: state.tasks_all_checked == true
    produces: [code_commits]

  verify:
    skill: comet/verify
    exit: state.verify_result != 'pending'
    produces: [verification_report]

  archive:
    skill: openspec/archive
    terminal: true

transitions:
  - { from: open,   to: design, auto: true }
  - { from: design, to: build,  auto: true }
  - { from: build,  to: verify, auto: false }                       # gate：等用户确认
  - { from: verify, to: archive, on: "state.verify_result == 'pass'", auto: true }
  - from: verify
    to: build
    on: "state.verify_result == 'fail'"                             # 循环回退
    hitl: { question: "修复还是接受偏差？", options: [修复, 接受] }   # 真 HITL

adapters:                   # skill 适配描述符（外部 skill 零侵入）
  superpowers/brainstorming:
    invoke: "Skill(superpowers:brainstorming)"
    done_check: artifacts.design_doc exists
    produces:
      design_doc: "docs/superpowers/specs/*-design.md"
  superpowers/subagent-driven-development:
    invoke: "Skill(superpowers:subagent-driven-development)"
    done_check: state.tasks_all_checked == true
```

### 条件 DSL

- 基本：`state.X == 'v'`、`artifacts.Y exists`、`vars.n >= 3`、布尔 `&& || !`。
- 逃生口：`run: ./guard.sh`，以**退出码**作真假，承接复杂/项目特定逻辑。

### Adapter

引擎只认 adapter 的 `invoke`（怎么触发）/ `done_check`（完成判据）/ `produces`（产物路径），从而把对协议无感知的社区 skill 接入状态图。

## 7. 数据流 / 交接（handoff）

- 状态文件持有 `artifacts`（命名产物路径）与 `vars`（计数器/标志）。
- 节点 `produces:` 在 advance 时由引擎登记进 `artifacts`。
- transition 可声明 `handoff:` 选择把哪些 artifacts/摘录传给下一节点，沿用现有 `comet-handoff.sh` 的"压缩摘录 + hash 校验"思路，升级为引擎可选特性。

跨 skill 上下文从"Agent 记着"变为"引擎按声明交接"。

## 8. 驱动循环（④ 层，固定不变）

SKILL.md 核心伪代码，**永不随工作流变化**：

```
循环:
  action = comet flow next
  switch action.type:
    "invoke_skill":  用 Skill 工具真正触发 action.skill，
                     以 action.handoff 为上下文；完成后 → comet flow advance
    "ask_user":      用 AskUserQuestion 呈现 action.hitl；
                     得到选择 → comet flow answer <choice>
    "await_confirm": 暂停，等用户"继续" → comet flow advance
    "guard_failed":  把 action.reason 交 Agent 修复，修完重试 advance
    "done":          结束
```

引擎是裁判，Agent 是执行者。Agent 不再"理解编排"，只忠实执行引擎指令 —— 脆弱性消失。

## 9. CLI 面

### 运行时（驱动循环 + 用户）

| 命令 | 作用 |
|---|---|
| `comet flow run <flow> [--intent ...]` | 启动实例 |
| `comet flow next` | 返回下一步动作 JSON |
| `comet flow advance [--set k=v]` | 校验 exit guard 并转换状态 |
| `comet flow answer <choice>` | 记录 HITL 决策 |
| `comet flow status` / `comet flow resume` | 查看 / 恢复 |

### 编排时（用户用 CLI 编排）

| 命令 | 作用 |
|---|---|
| `comet flow list` | 列出可用工作流 |
| `comet flow validate <file>` | schema + 图连通性 + adapter 完整性校验 |
| `comet flow new` / `comet flow scaffold` | 交互式生成工作流骨架 |
| `comet flow graph <file>` | 导出**静态拓扑**：mermaid + ASCII 树，看清 skill→skill、分支/循环、每条边的触发策略 |
| `comet flow graph --current` | **运行时叠加**：高亮 current_node、已走路径、下一跳候选（可视化断点） |

## 10. 迁移与兼容（呼应"经典模式"）

1. 现有 5 阶段重写为 `classic.flow.yaml`（open→design→build→verify→archive）+ openspec/superpowers 的 adapters；hotfix/tweak 作为同图的**预设入口/子图**（由 router 意图路由进入）。
2. `comet-state.sh` 的状态机逻辑上移进 TS 引擎；shell 脚本保留为**用户自定义 guard 的逃生口**，不再是核心驱动。
3. `.comet.yaml` 字段平滑映射为引擎状态（`phase` → `current_node` 等），老 change 可被引擎读取。
4. 测试分三层：引擎纯函数（图求值 / DSL / resume，无需 Agent）、adapters（数据校验）、driver（瘦层）。

## 11. 非目标（YAGNI）

- 不做 DAG/CI 式并发流水线（skill 编排本质是对话式状态推进 + 人在回路，用不上并发触发器）。
- 不要求社区 skill 改造遵守 comet 协议（靠 adapter 适配）。
- 不在 bash 里实现图求值 / DSL（交给 TS 引擎，bash 仅作 guard 逃生口）。

## 12. 开放问题（留给 plan 阶段细化）

- DSL 的精确语法与求值器实现选型（自研最小解析 vs 受限表达式库）。
- `.comet.yaml` 新旧字段映射的具体兼容策略与迁移脚本。
- adapter 描述符的存放形态（内联 node vs 独立 `adapters/` 目录 vs 随 skill 分发）。
- handoff hash 校验在引擎中的落地方式。
