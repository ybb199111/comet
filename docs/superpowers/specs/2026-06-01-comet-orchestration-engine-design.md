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
| 5 | 条件/退出门表达 | **v1 不自研 DSL**：内建少量谓词 + `run:` shell 逃生口（退出码）+ `classify:` 交 Agent 语义判断 |
| 6 | 引擎实现基座 | **TS CLI 自建薄引擎**（纯函数，随 npm 分发）；借鉴 statechart 概念但**不引入 XState 等外部 FSM 库**；shell 仅作 guard 逃生口 |
| 7 | 自动触发门控 | **合并为单一 stop policy**：每个推进点三选一 `auto` / `gate` / `hitl` |

**硬约束**：skill 本质是 Agent 通过 Skill 工具触发的 markdown 提示词，没有任何 CLI 能在代码里"跑完一个 skill"。Agent 永远在回路里亲手触发每个 skill（"真正触发，不是看起来像触发"）。因此引擎只做**决策**，不做 skill **执行**。

### 2.1 为何自建薄引擎而非依赖 XState（build vs buy）

曾考虑直接用 XState（statecharts）做内核。结论是**只借概念、不引库**，原因：comet 的流很简单（基本线性 + 少量分支 + 人在回路），用不上 statechart 的重武器（并行区域 / 深层嵌套 / 定时转换 / 子 actor，这些正是本设计的非目标）：

| XState 卖点 | 在 comet 里的真实成本 | 自建替代 |
|---|---|---|
| compound 层级状态=阶段 | 需 YAML→machine 编译 + guard 注册表 + 迁就它的 config 形状 | **点号 key 分组**（纯展示）就够，执行仍扁平 |
| history state = 恢复 | 我们无深层嵌套，用不上 | 状态只有单个 `current_node`，**恢复 = 读出重算 next**，几行 |
| persisted snapshot | — | `.comet.yaml` **本身就是** snapshot，已有 |
| 可视化 | 绑定 Stately 生态 | 从自己的 node/edge 吐 mermaid，~50 行 |

引入 XState 反而要写 YAML↔machine 适配层、guard 注册、贡献者学 statechart 语义，胶水成本 **大于** 自己写这个小引擎；且 comet 是小 npm CLI，多一个重依赖增加安装体积与供应链面。

- **引擎 = 一组纯函数**（`next/advance/resume/guard`），不依赖外部 FSM 库。
- **只偷概念不偷库**：状态文件即 snapshot、guards、context 这些 statechart 思路照搬。
- **恢复不需专门机制**：`current_node` + context 是唯一真相，`next` 是状态纯函数 → 恢复 = 重算。
- **逆转点**：哪天真需并行/深层嵌套（明确 YAGNI）再换 XState，那时再迁不迟。

**硬约束**：skill 本质是 Agent 通过 Skill 工具触发的 markdown，仅作决策不作执行（同上）。

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
| 退出机制 | 每个 node 的 `exit:` guard，不满足拒绝 `advance` | `exit: var verify_result == pass` |
| 意图识别 | `router` 节点：声明候选意图（自然语言判据）→ **引擎请 Agent 做语义分类** → 按结果路由 | `router:` + `intents:`（`when` 为自然语言） |
| HITL | node/transition 上 `hitl:` 块，引擎返回"必须问用户" | `hitl: { question, options }` |
| 断点恢复 | 状态文件持久化 current_node+artifacts；`next` 为状态纯函数 → 恢复=重算 | 引擎内建 |

将原本散落在散文里的 blocking points / Step 0 意图检测 / resume 规则，全部下沉为**数据 + 引擎逻辑**。

## 5. 推进门控：单一 stop policy（auto / gate / hitl）

### 5.1 为何合并为一个轴

早期曾拆成两个正交轴（节点级 `auto_invoke` + 边级 `auto`/`gate`），用户要在两处想。复盘后统一为每个**推进点的单一 stop policy**，心智更简单：

| policy | 语义 | 引擎 `next` 返回 |
|---|---|---|
| `auto` | 门通过即自动推进/触发，不停 | `invoke_skill` 或直推 |
| `gate` | 暂停，等用户一句"继续"（非选择题） | `await_confirm` |
| `hitl` | 决策点，用户在多选项里选，影响路由/行为 | `ask_user` |

三种停顿语义清晰分离：**自动直推 / 确认门 / 决策**。`hitl` 仍是独立的原语（只是现在和 auto/gate 同位于一个 `policy` 字段下，而非另起两个布尔）。

### 5.2 粒度与默认

- 在**推进点**（到达节点是否触发 skill、离开节点是否推进下一跳）上写单个 `policy`。
- 工作流级默认 `defaults.policy: auto`，可在单个 node/边覆盖为 `gate`/`hitl`。
- HITL 与"是否自动"仍是正交语义，只是收别进同一枚三值字段，避免用户记两套开关。

### 5.3 引擎 `next` 判定（短路）

按推进点 `policy` 直接映射：`hitl` → `ask_user`；`gate` → `await_confirm`；`auto` → `invoke_skill` 或直推（连续流）。

## 6. YAML 模型

```yaml
# classic.flow.yaml （示意）
name: classic                 # 工作流唯一标识（供 run/list/graph 使用）
defaults:
  policy: auto                # 默认推进策略：到达节点自动触发 skill、门通过自动推进下一跳

entry:
  router:                     # 工作流入口路由器：决定从哪个入口节点开始
    classify_by: agent        # 由 Agent 做语义分类；引擎只负责校验并路由
    intents:
      - id: hotfix            # 候选意图 ID（会传给 classify_intent 动作）
        when: "用户在描述一个 bug 修复/紧急修复，且范围小（单函数或单模块）"
        to: hotfix_build      # 命中后跳转的入口节点
      - id: tweak
        when: "用户在描述文案/配置/文档/提示词的小调整"
        to: tweak_build
      - id: full
        default: true         # 兜底分支：无明显意图时走完整流程
        to: open
    # match: 可作为确定性快路径/逃生口（可选）；默认仍以 agent 语义分类为主

nodes:                        # 1 node = 1 skill（原子单位）。key 用 "阶段.步骤" 命名：
                              # 阶段 = key 第一个点之前的前缀；无点的 key 即单 skill 阶段（阶段名 == key）
  open:                       # 无点：单 skill 阶段，阶段名 == open
    skill: openspec/opsx-new  # 触发的 skill 标识（交给 adapter 解析为 invoke 指令）
    exit:                     # 列表=隐式 AND；每项是内建谓词（未满足时不能 advance）
      - artifact proposal exists
      - artifact tasks exists
    policy: hitl              # 推进点策略：出节点前走 HITL 决策
    hitl: { question: "确认提案/设计/任务？", options: [继续, 调整] }
    produces: [proposal, design, tasks]  # 本节点声明会产出的命名工件

  design:
    skill: superpowers/brainstorming
    entry: artifact proposal exists        # 进入门：不满足则 next 不会把当前节点定为可执行
    policy: gate                           # 节点级覆盖：先停在确认门，等用户“继续”再触发
    prompt: |                              # 编排者自定义提示词：作为 handoff.prompt 传给 skill
      重点关注与现有 OpenSpec 提案的一致性；
      设计必须给出 2-3 个方案对比并显式推荐其一。
    exit: artifact design_doc exists
    produces: [design_doc]

  # build.* 4 个 node 同属 build 阶段：从 key 前缀一眼可见，无需逐个读字段
  build.plan:
    skill: superpowers/writing-plans
    exit: artifact plan exists
    produces: [plan]
  build.tdd:
    skill: superpowers/test-driven-development
    policy: auto                           # 到达后自动触发（继承默认，此处显式写出）
  build.review:
    skill: common/code-reviewer
    policy: gate                           # 人工审阅节点：到 review 先确认再触发
  build.commit:
    skill: common/git-workflow
    exit: var tasks_all_checked == true    # 阶段收口：build 所有 node 完成才允许离开
    produces: [code_commits]

  verify:
    skill: comet/verify
    exit: var verify_result != pending     # 验证产出了结论（pass/fail）才可离开
    produces: [verification_report]

  archive:
    skill: openspec/archive
    terminal: true                         # 终止节点：进入后工作流结束

transitions:                 # 有向边：描述节点间推进顺序、条件和推进策略
  - { from: open,          to: design,        policy: auto }
  - { from: design,        to: build.plan,    policy: auto }
  # 阶段内多 skill 串联（build.* 同属 build 阶段），每步都可独立控制 policy
  - { from: build.plan,    to: build.tdd,     policy: auto }
  - { from: build.tdd,     to: build.review,  policy: auto }
  - { from: build.review,  to: build.commit,  policy: auto }
  - { from: build.commit,  to: verify,        policy: gate }         # 出 build 阶段确认门：要求人工确认
  - { from: verify,        to: archive, on: "var verify_result == pass", policy: auto }  # 验证通过自动归档
  - from: verify
    to: build.plan
    on: "var verify_result == fail"                                 # 验证失败回退到 build 入口重做
    policy: hitl
    hitl: { question: "修复还是接受偏差？", options: [修复, 接受] }   # 真 HITL

adapters:                   # skill 适配描述符：描述“怎么触发/何时算完成”
  superpowers/brainstorming:
    invoke: "Skill(superpowers:brainstorming)"      # 触发命令模板
    done_check: artifact design_doc exists           # 完成判据（供 advance 校验）
    produces:
      design_doc: "docs/superpowers/specs/*-design.md"  # 工件落盘路径模式
  superpowers/writing-plans:
    invoke: "Skill(superpowers:writing-plans)"
    done_check: artifact plan exists
  common/code-reviewer:
    invoke: "Skill(common:code-reviewer)"
    done_check: true          # 无硬产物，触发即认完成
```

### 6.1 多 skill 阶段（用 key 前缀分组，而非埋在字段里）

一个“大阶段”（如 build）往往需要编排**多个 skill**（plan → tdd → review → commit）。痛点：若只在每个 node 里写 `phase: build`，扫一眼 `nodes:` 列表会误以为有 4 个并列阶段。解决办法是**用 node key 的命名约定表达分组**：

- **命名约定 `阶段.步骤`**：同阶段的 node key 共享前缀，如 `build.plan` / `build.tdd` / `build.review` / `build.commit`，一眼可见它们同属 build。
- **阶段名 = key 第一个点之前的前缀**（引擎从 key 推导，省去 `phase:` 字段）；无点的 key（`open`/`design`/`verify`/`archive`）即单 skill 阶段，阶段名 == key。
- **保持原子不变量**：每个 node 仍是 1 skill = 1 done-check；这只是命名 + 推导规则，**不引入任何新机制**，current_node 仍是单一扁平节点，resume / 意图路由 / 退出门逻辑**零改动**。
- **阶段内每个 skill 都可独立控制**：推进策略（`policy: auto`/`gate`/`hitl`）——完全复用已有原语。
- **阶段级 HITL**（如“确认设计方案”）挂在阶段**最后一个 node 的 `before_advance`** 或出阶段的边上。
- **可选 `phase:` 覆盖**：极少数想让 key 与阶段名不一致时，仍可显式写 `phase:` 覆盖前缀推导（逃生口）。
- **可视化**：`comet flow graph` 按 key 前缀把同阶段 node 渲染成一个 subgraph 簇，视觉上“阶段框里装着多个 skill”。

> 跨工作流**复用同一段 skill 序列**的子图/嵌套能力（原方案 C）当前不做，留作未来扩展（YAGNI）。

### 6.2 用户自定义提示词（`prompt`）

编排者不只是"绑定一个 skill"，还应能**为该节点写自己的提示词**，叠加在 skill 触发之上：

- 节点级 `prompt:` 字段（多行文本），引擎返回 `invoke_skill` 动作时作为 `handoff.prompt` 一并交给 Agent，Agent 触发 skill 时将其作为附加指令。
- 用于：约束该阶段关注点、注入项目特定约定、调整通用 skill 的默认行为，而**无需修改 skill 本身**。
- 可选工作流级 `preamble:`（全局前置提示）作为所有节点的公共上下文。
- 与 adapter 的 `invoke` 正交：adapter 管"怎么触发"，`prompt` 管"触发时额外说什么"。

### 6.3 意图识别（Agent 语义分类，非字面 match）

意图识别**不用字面 `match`/正则**，而是交给 **Agent 做语义判断**——这正是 LLM 擅长的事，也精准契合"引擎决策框架 + Agent 执行判断"的分工：

- `router` 节点声明候选 `intents`，每个带一个**自然语言判据** `when` 和目标节点 `to`。
- 引擎 `next` 遇到 router 节点时返回动作 `classify_intent`，携带候选列表（`{id, when, to}`）+ 用户输入/上下文。
- **Agent 做语义分类**，选出最匹配的 `intent id`，通过 `comet flow classify <id>` 回报。
- 引擎校验 `id ∈ 候选`后路由到对应 `to`，并推进状态。**判断由 Agent，路由控制权仍在引擎**。
- 同机制可用于**流中意图**：某条 transition 用 `classify:`（而非 DSL `on:`）让 Agent 判断升级条件（如 hotfix→full）是否满足。
- 可选逃生口：仍允许 `match:` 正则作为确定性快路径，但默认走 agent 分类。

```yaml
transitions:  # 流中升级判定示例：不是 on DSL，而是 classify 语义判断
  - from: hotfix_build
    to: design                # 升级跳转：补设计后回完整流程
    classify: "本次修复是否越出单函数/模块、涉及 3+ 文件、架构变更或新公开 API？"  # 交给 Agent 语义判断
    hitl: { question: "达到升级条件，转完整流程？", options: [升级, 维持 hotfix] }      # 语义命中后仍需用户确认
```

### 条件表达（v1 不自研 DSL）

自研条件 DSL + 解析器是典型过度设计。v1 只需三种判据：

- **内建少量谓词**（固定形状，非表达式语言）：`artifact <name> exists`、`var <name> == <value>`。
- **逃生口 `run: ./guard.sh`**：以**退出码**作真假，承接复杂/项目特定逻辑。
- **语义判断 `classify:`**：交 Agent（如升级条件这类主观判断）。

把"自研表达式语言"整个从 v1 删除，开放问题少一条。真不够用再引受限表达式库（如 expr-eval / json-logic），也不自己造。

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
                     以 action.handoff（含用户自定义 prompt）为上下文；完成后 → comet flow advance
    "classify_intent": 对 action.candidates 做语义意图识别，选出最匹配 id
                     → comet flow classify <id>
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
| `comet flow classify <intent-id>` | 记录 Agent 语义意图分类结果并路由 |
| `comet flow status` / `comet flow resume` | 查看 / 恢复 |

### 编排时（用户用 CLI 编排）

| 命令 | 作用 |
|---|---|
| `comet flow list` | 列出可用工作流 |
| `comet flow validate <file>` | schema + 图连通性 + adapter 完整性校验 |
| `comet flow new` / `comet flow scaffold` | 交互式生成工作流骨架 |
| `comet flow graph <file>` | 导出**静态拓扑**：mermaid + ASCII 树，看清 skill→skill、分支/循环、每条边的触发策略；按 key 前缀分组的 node 渲染为 subgraph 簇 |
| `comet flow graph --current` | **运行时叠加**：高亮 current_node、已走路径、下一跳候选（可视化断点） |

## 10. 迁移与兼容（呼应"经典模式"）

1. 现有 5 阶段重写为 `classic.flow.yaml`（open→design→build→verify→archive）+ openspec/superpowers 的 adapters；hotfix/tweak 作为同图的**预设入口/子图**（由 router 意图路由进入）。
2. `comet-state.sh` 的状态机逻辑上移进 TS 引擎；shell 脚本保留为**用户自定义 guard 的逃生口**，不再是核心驱动。
3. `.comet.yaml` 字段平滑映射为引擎状态（`phase` → `current_node` 等），老 change 可被引擎读取。
4. 测试分三层：引擎纯函数（图求值 / guard / resume，无需 Agent）、adapters（数据校验）、driver（瘦层）。

## 11. 非目标（YAGNI）

- 不做 DAG/CI 式并发流水线（skill 编排本质是对话式状态推进 + 人在回路，用不上并发触发器）。
- 不要求社区 skill 改造遵守 comet 协议（靠 adapter 适配）。
- 不在 bash 里实现图求值 / guard 求值（交给 TS 引擎，bash 仅作 `run:` guard 逃生口）。
- **不自研表达式 DSL**：v1 只用内建谓词 + `run:` shell + `classify:` 语义判断。
- **不做子图/嵌套工作流**：多 skill 阶段用扁平图 + `phase` 分组标签表达；跨工作流复用同一段 skill 序列的子图能力留作未来扩展。

## 12. 开放问题（留给 plan 阶段细化）

- 内建谓词的最小集与解析实现（固定 `artifact ... exists` / `var ... == ...` 两种，还是留一两个比较符）。
- `.comet.yaml` 新旧字段映射的具体兼容策略与迁移脚本。
- adapter 描述符的存放形态（内联 node vs 独立 `adapters/` 目录 vs 随 skill 分发）。
- handoff hash 校验在引擎中的落地方式。
