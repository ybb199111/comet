# Comet Any Skill Bundle Creator 设计

**日期：** 2026-06-15
**状态：** 已完成
**范围：** Plan 4 - `/comet-any`
 
## 1. 目标

Plan 4 提供宿主 Agent 驱动的 Skill Bundle 创建器。用户描述目标并选择候选 Skill 后，
`/comet-any` 读取候选实现、交互澄清、调用原生 `skill-creator` 或经用户同意使用 Comet
fallback，最终生成一个平台无关、可编译和跨平台分发的 Skill Bundle。

Skill Bundle 可以包含：

- 多个用户入口 Skill
- 内部辅助 Skill
- 共享 rules、hooks、references、scripts 和 assets
- 平台能力声明和必要的平台覆盖
- 可选的 Comet Engine 编排元数据

分发后的 Skills 由目标平台原生运行，不要求用户通过 Comet Engine 启动。Comet Engine
在 Plan 4 中主要提供编译 IR、静态验证、Eval，以及需要时的可选高级编排。

本阶段交付：

- `/comet-any` 中文和英文 Skill
- 平台无关 Skill Bundle manifest 和目录模型
- `.comet/skills.txt` 候选偏好池
- 新建和优化已有 Bundle
- Bundle compiler、静态验证和平台能力分析
- draft、Eval、人工评审、ready 生命周期
- `quick` / `full` 创建期 Eval 档位
- 独立生命周期 CLI
- ready Bundle 的跨平台分发
- 当前 Comet Bundle 兼容基准

## 2. 核心决策

- `/comet-any` 生成 Skill Bundle，不生成强绑定 Engine 的单一 Skill Package。
- Bundle 是平台无关源码，分发时编译为目标平台目录和配置。
- Bundle 可声明多个用户入口 Skill 和内部辅助 Skill。
- 目标平台原生运行编译后的 Skills，不依赖 Comet Engine。
- Engine 元数据仅在用户需要持久化 Run、Guardrails 或复杂编排时生成。
- 普通 Bundle 使用临时编译 IR 完成验证和 Eval，不携带 Engine 运行时依赖。
- rules 和 hooks 使用规范化语义，可提供显式平台覆盖。
- 平台不支持某项能力时，展示差异并让用户选择跳过或取消，不静默降级。
- 含 hooks 或可执行 scripts 时，分发前必须展示命令、副作用和目标平台，并明确确认。
- Eval 和 `ready` 是 Bundle 整体发布门，同时记录每个入口 Skill 的结果。
- 当前 Comet 必须能由 Bundle 模型表达并重新生成，作为首个兼容基准。
- 创建由宿主 Agent 驱动，CLI 不直接配置或调用模型 API。
- 优先使用当前平台原生 `skill-creator`。
- 原生 creator 不可用时，必须询问用户是否启用 Comet fallback。
- 创建期 Eval 必须由用户选择跳过、`quick` 或 `full`，执行前展示 token 工作量。
- 跳过或未通过 Eval 时保持 `draft`；Eval 通过后仍须用户人工批准。
- Bundle 默认跟随用户语言，可显式指定，不强制生成多语言版本。
- Plan 4 同时支持新建和优化已有 Bundle。

## 3. 非目标

- 不要求平台通过 Comet Engine 运行生成 Skill。
- 不把 `comet/skill.yaml` 作为所有生成产物的必需文件。
- 不让 CLI 猜测用户意图或自主调用 LLM。
- 不把 Bundle 创建生命周期写入 `.comet.yaml` 或建模为 change Run。
- 不把创建期 Eval 与运行期 Runtime Evals 混为一体。
- 不在未获用户同意时自动消耗 token 执行 Eval。
- 不在缺少原生 creator 时静默启用 fallback。
- 不把各平台成品目录直接保存为 Bundle 源码。
- 不修改 Superpowers 或 OpenSpec 的原始 Skill。

## 4. 产品模型

```text
用户目标 + 候选 Skill
          |
          v
     /comet-any
          |
          +--> 原生 skill-creator
          |       或
          +--> 用户批准的 Comet fallback
          |
          v
  Comet Bundle Authoring Adapter
          |
          v
 .comet/bundle-drafts/<name>/
          |
          v
  Compiler -> Validate -> Optional Eval -> Human Review -> Publish
          |
          v
      .comet/bundles/<name>/
          |
          v
   Platform Compiler / Distributor
          |
          +--> Claude native Skills/rules/hooks
          +--> Codex native Skills/rules
          +--> Cursor native Skills/rules/hooks
          +--> other supported platforms
```

宿主 Agent 负责自然语言交互、读取候选实现、调用 creator、生成或优化 Bundle，以及执行
用户选择的创建期 Eval。CLI 负责确定性状态、编译、验证、结构化证据、发布门和分发。

## 5. Skill Bundle 结构

```text
<bundle-name>/
  bundle.yaml
  skills/
    <entry-a>/
      SKILL.md
      references/
      scripts/
      assets/
    <entry-b>/
      SKILL.md
    <helper>/
      SKILL.md
  rules/
  hooks/
  references/
  scripts/
  assets/
  engine/                 # 可选
    skill.yaml
    guardrails.yaml
    evals.yaml
  evals/                  # 创建期 Eval 资产，可选
    evals.json
  locales/                # 多语言变体，可选
    zh/
    en/
```

Bundle 只保存一份平台无关源码，不包含 `.claude/`、`.codex/`、`.cursor/` 等平台安装目录。

### 5.1 Bundle Manifest

`bundle.yaml` 至少声明：

- schema version
- Bundle 名、版本、描述和语言
- 默认语言和可选语言变体
- 用户入口 Skills
- 内部辅助 Skills
- 共享 resources
- rules 和 hooks
- scripts 及其副作用
- 平台能力要求
- 显式平台覆盖
- 可选 Engine 模式

概念示例：

```yaml
apiVersion: comet/v1alpha1
kind: SkillBundle
metadata:
  name: example-workflow
  version: 1.0.0
  description: Example multi-skill workflow
  defaultLocale: zh
  locales: [zh]
skills:
  - id: example
    path: skills/example
    visibility: entry
  - id: example-verify
    path: skills/example-verify
    visibility: entry
  - id: example-helper
    path: skills/example-helper
    visibility: internal
resources:
  rules:
    - rules/workflow.md
  hooks:
    - hooks/protect-writes.yaml
  references:
    - references/state.md
  scripts:
    - id: verify-state
      path: scripts/verify-state.mjs
      sideEffect: read
platforms:
  requires:
    - skills
  optional:
    - rules
    - hooks
engine:
  enabled: false
```

最终 schema 在实施计划中按现有类型模式细化，但必须保持上述职责边界。

### 5.2 Skills

- Bundle 可以声明多个 `entry` Skill。
- `internal` Skill 不作为默认用户入口，但可被 Bundle 内其他 Skill 引用。
- 每个 Skill 是普通平台 Skill，至少包含 `SKILL.md`。
- Skill 可以拥有局部 references、scripts 和 assets。
- 共享资源放在 Bundle 顶层，由 compiler 按平台复制或重写引用。
- Skill 描述、触发条件和引用必须在编译后仍保持可读和有效。

### 5.3 语言变体

- Bundle 可以只有一个默认语言，也可以声明多个 locale。
- 单语言 Bundle 直接使用根目录下的 Skills 和共享资源。
- 多语言 Bundle 的 `locales/<locale>/` 只保存需要本地化的覆盖内容，未覆盖资源回退到
  Bundle 根目录。
- manifest、scripts 和二进制 assets 默认共享；Skill 描述、rules、references 和面向用户
  的文本可以按 locale 覆盖。
- 分发时由用户选定 locale；未指定时使用 `defaultLocale`。
- `/comet-any` 默认只生成用户选择的语言，不因 Bundle 模型支持多语言而强制增加 token
  成本。

当前 Comet 的中英文资源集必须能够映射为同一 Bundle 的 `zh` 和 `en` locale。

### 5.4 Rules

rules 使用平台无关语义，至少描述：

- 规则内容
- 适用范围
- always-on 或按文件/上下文匹配
- 优先级
- 是否为强制约束

Compiler 将规范化规则映射为目标平台支持的 rule 文件、instructions 或等价入口。某平台
无法表达时，必须报告能力差异。

### 5.5 Hooks

hooks 使用规范化事件和动作声明：

- 生命周期事件
- matcher 或作用范围
- 要执行的 Bundle script
- 副作用和失败策略
- 用户确认要求

禁止在 manifest 中嵌入任意 shell。Hook 只能引用 Bundle 内声明并通过路径安全检查的
script。平台事件无法映射时，必须报告差异，不允许静默选择近似事件。

### 5.6 References、Scripts 和 Assets

- references 是可按需加载的文档。
- scripts 必须声明稳定 id、相对路径、副作用和运行时要求。
- assets 是 Skills 或 references 使用的静态资源。
- 所有路径必须规范化并保持在 Bundle 根目录内。
- Bundle 拒绝符号链接，避免编译或分发时逃逸。

### 5.7 可选 Engine 元数据

只有用户需要以下能力时才生成 `engine/`：

- 持久化 Run 和恢复
- deterministic 或 adaptive orchestration
- Engine 强制 Guardrails
- Runtime Evals
- 跨 Skill 的受审计 action protocol

`engine/` 使用现有 Comet Skill Engine 模型，可由 Bundle compiler 生成 Plan 3 可加载的
Skill Package 或等价快照。没有 `engine/` 时，Bundle 仍可完整编译、验证、Eval 和分发。

Engine 是可选运行增强层，不是平台原生 Skill 的启动前提。

## 6. Comet Bundle Authoring Adapter

原生 `skill-creator` 和 Comet fallback 都不是 Bundle 发布器。它们生成普通 Skill 内容、
建议、测试提示或评估资产，必须经过 Bundle Authoring Adapter：

1. 将一个或多个 creator 输出归类为 entry 或 internal Skill。
2. 提取并去重共享 rules、hooks、references、scripts 和 assets。
3. 生成 `bundle.yaml`。
4. 把平台特有写法提升为规范化语义或显式平台覆盖。
5. 根据用户需求决定是否生成 `engine/`。
6. 修正 Skill 内部引用，使其可由 platform compiler 重写。
7. 输出到 `.comet/bundle-drafts/<name>/`。

无法可靠确定入口、资源归属、hook 副作用、平台能力或 Engine 是否必要时，Adapter 必须继续
询问用户或失败关闭，不能直接发布 creator 的原始目录。

## 7. 目录与 Authoring State

```text
.comet/
  skills.txt
  bundle-drafts/<name>/
  bundle-authoring/<name>.json
  bundle-evals/<name>/<bundle-hash>/
  bundles/<name>/
```

### 7.1 Draft

新建 Bundle 写入 `.comet/bundle-drafts/<name>/`。

优化已有 Bundle 时：

1. 从项目 `.comet/bundles/<name>/` 或显式 Bundle 来源复制到 draft。
2. 记录基础 Bundle 的来源、版本和 hash。
3. 允许增删入口 Skill、辅助 Skill、rules、hooks 和其他资源。
4. 只修改 draft，不直接改变已发布 Bundle。
5. 所有结构变化重新经过完整 Eval 和人工评审。

### 7.2 Authoring State

`.comet/bundle-authoring/<name>.json` 至少记录：

- schema version
- Bundle 名和模式：`create | optimize`
- 当前状态
- draft 路径和当前 Bundle hash
- 基础 Bundle 来源、版本和 hash
- 候选 Skill 来源、路径、版本和 hash
- creator provider：`native | comet-fallback`
- Bundle 语言
- 默认 locale 和可用 locale
- entry 和 internal Skill 列表
- 平台能力要求
- Engine 模式
- Eval 档位和证据路径
- 各入口 Skill Eval 摘要
- 人工评审结论、时间和被批准的 hash
- ready hash、发布时间和 Bundle 安装路径

状态文件通过临时文件加 rename 原子写入。自然语言 creator 输出不能直接改变生命周期
状态，必须通过 CLI 的结构化命令提交。

### 7.3 生命周期

```text
draft -> eval-passed -> review-approved -> ready
```

- 静态验证成功不改变 `draft` 发布状态。
- Eval 跳过或失败时保持 `draft`。
- 所有必需 Bundle Eval 和入口 Skill Eval 通过后进入 `eval-passed`。
- 用户明确批准整个 Bundle 后进入 `review-approved`。
- `publish` 通过最终编译和验证后进入 `ready`。
- 任一 Skill、manifest 或共享资源变化都会使 Eval、review 和 ready 失效。
- 旧 Eval 证据保留用于审计，但不能用于新 hash 的发布。

## 8. 候选 Skill 偏好与发现

`.comet/skills.txt` 一行一个偏好 Skill 名：

```text
brainstorming
writing-plans
test-driven-development
requesting-code-review
```

语义：

- 表示 `/comet-any` 优先探索的候选，不是固定顺序或严格白名单。
- 空行和以 `#` 开头的注释忽略。
- 重复项去重并保留首次出现顺序。
- 文件不存在时，扫描当前平台可用 Skill 并让用户选择。

候选处理：

- 缺失 Skill：让用户选择安装、替代或忽略。
- 同名多来源：展示来源、绝对路径和描述，由用户消歧。
- 必须读取最终候选的实际 `SKILL.md`，不能根据名字推测能力。
- 最终候选来源、路径、版本和 hash 固定到 authoring state。
- authoring 启动后，`.comet/skills.txt` 的变化不会自动改变当前 draft。

平台 Skill 扫描使用现有 29 个平台的项目级和全局目录映射，但候选发现不修改平台文件。

## 9. `/comet-any` 创建流程

### 9.1 启动

`/comet-any` 首先询问：

- 新建 Bundle 或优化已有 Bundle
- 目标或待优化 Bundle
- 预期的一个或多个用户入口
- 输出语言；默认跟随用户语言
- 是否需要 Engine 高级运行能力

然后读取 `.comet/skills.txt`；不存在时扫描当前平台可用 Skill 并让用户选择候选。

### 9.2 实现探索与澄清

对最终候选：

1. 读取 `SKILL.md` 和必要的直接引用文件。
2. 提取真实能力、触发方式、输入输出、约束和依赖。
3. 交互澄清目标、入口、输入输出、非目标、风险、成功标准和预算。
4. 规划 entry/internal Skills 和共享资源边界。
5. 只有需要 Engine 时才选择 `deterministic` 或 `adaptive` Orchestration。
6. 根据任务风险选择性注入持久化、决策点、TDD、debug、review、verification、
   bounded retry、Agent checkpoint 等已验证模式。

这些稳定性能力不是固定五阶段模板，只在目标和风险需要时进入生成 Bundle。

### 9.3 Creator 选择

1. 检测当前平台是否提供原生 `skill-creator`。
2. 可用时优先调用原生 creator。
3. 不可用时说明能力差异并询问是否使用 Comet fallback。
4. 用户拒绝 fallback 时停止，不创建伪造 draft。
5. Creator 结果只能作为 Bundle Authoring Adapter 的输入，不能直接进入 Eval 或发布门。

### 9.4 编译与静态验证

draft 生成或修改后执行：

- Bundle manifest 结构和语义校验
- entry/internal Skill 路径和唯一性校验
- Skill 描述、引用和共享资源一致性检查
- rule/hook 规范化语义校验
- hook/script 副作用和确认要求校验
- 路径、realpath 和符号链接安全检查
- 可选 Engine 元数据校验
- 至少一个参考平台的 dry-run 编译
- Bundle 内容 hash 计算

静态校验失败时保持 `draft`，输出可操作错误，不进入创建期 Eval。

## 10. Bundle Compiler

Compiler 输入平台无关 Bundle 和目标平台，输出平台原生安装计划。

### 10.1 编译 IR

所有 Bundle 都先转换为临时 IR：

- Skills 和 visibility
- 局部与共享资源
- rules 语义
- hooks 语义
- scripts、副作用和运行时要求
- 平台能力要求和覆盖
- 可选 Engine 声明

IR 用于验证、能力差异分析、Eval 和目标平台编译。普通 Bundle 的 IR 不持久化为运行时
依赖。

### 10.2 平台能力分析

Compiler 对每个目标平台输出：

- 支持的 Skills、rules、hooks 和 scripts
- 可等价映射的能力
- 不支持的能力
- 将使用的平台覆盖
- 目标路径和待写文件
- hooks/scripts 的命令与副作用

若能力不支持，交互模式让用户选择：

- 跳过该能力并继续
- 取消该平台分发

JSON/非交互模式必须通过显式选项提供选择，不能静默跳过。

### 10.3 平台覆盖

manifest 可为无法统一表达的能力声明显式平台覆盖。覆盖必须：

- 指定平台 id
- 说明替代的规范化能力
- 通过目标平台 schema 校验
- 不放宽 Bundle 的安全声明
- 参与 Bundle hash、Eval 和人工评审

### 10.4 当前 Comet 兼容基准

当前 Comet 作为首个 Bundle compiler 基准：

- 多个用户入口和辅助 Skills
- 中文与英文资源集
- rules
- hooks
- references
- scripts
- assets
- 29 平台路径和配置适配

基准要求 Bundle 模型可以表达当前 Comet 的分发意图，并由 compiler 重新生成等价的受管
产物。对随机路径顺序、格式化或非行为元数据可以规范化比较；Skill、rule、hook、reference
和 script 的行为合同必须匹配。

Plan 4 不要求立即把仓库现有 `assets/skills*` 删除或切换为新 Bundle 源码。先建立并通过
兼容 benchmark，再决定后续迁移。

## 11. 创建期 Eval

### 11.1 用户选择

静态验证通过后，`/comet-any` 必须询问：

- 跳过 Eval
- `quick`
- `full`

执行前展示预计组件、运行次数和 token 工作量。估计是范围提示，不承诺精确 token 数。

### 11.2 Quick

`quick` 至少覆盖：

- manifest、编译和安全检查
- 每个 entry Skill 的少量代表性提示
- with-skill 与 baseline 对照
- assertion grading
- 至少一个目标平台的编译结果
- pass rate、token、耗时和失败摘要

### 11.3 Full

`full` 包含 quick 的全部内容，并增加：

- 更完整的 entry Skill benchmark
- 多轮执行和方差
- 描述触发准确率
- entry Skill 之间的路由或重叠测试
- rules/hooks 对行为的影响验证
- 多目标平台编译和能力差异分析
- 失败案例分析
- blind comparison 或等效偏差控制
- 优化建议

### 11.4 Eval Provider

原生 `skill-creator` 的 benchmark、grader、viewer、触发优化和盲测能力作为首选 Provider。
Comet fallback Provider 只在用户明确同意后使用。

Provider 必须输出统一结构化结果，至少包含：

- provider 和档位
- Bundle hash
- entry Skill 结果
- Bundle 级编译和安全结果
- benchmark cases
- baseline 与 with-skill 结果
- assertions 和 grading evidence
- token、耗时、pass rate 和方差
- 总结与失败原因

CLI 通过 `eval-record` 校验并保存结果到
`.comet/bundle-evals/<name>/<bundle-hash>/`。只有结果属于当前 Bundle hash，所有必需
entry Skill 和 Bundle 级门槛通过时，authoring state 才进入 `eval-passed`。

## 12. 人工评审与发布

### 12.1 Review

Eval 通过后，`/comet-any` 展示：

- Bundle manifest 和入口摘要
- entry/internal Skill 列表
- 候选依赖和来源
- rules、hooks、scripts 和副作用
- 平台能力要求和差异
- 可选 Engine 元数据
- Bundle 级和各 entry Skill Eval
- token、耗时与失败案例

用户必须明确批准整个 Bundle。`comet bundle review <name> --approve` 记录批准人、时间和
Bundle hash。拒绝或要求修改时保持未发布状态；任何文件修改后旧批准自动失效。

### 12.2 Publish

`comet bundle publish <name>`：

1. 重新计算 Bundle hash。
2. 校验当前 hash 已通过 Eval。
3. 校验人工批准绑定同一 hash。
4. 重新运行静态、安全和参考平台 dry-run 编译。
5. 原子复制到 `.comet/bundles/<name>/`。
6. 记录 ready hash、发布时间和安装路径。

只有 hash 未漂移的 `ready` Bundle 可以分发。项目发布默认不覆盖已有同名 Bundle，除非
显式 `--overwrite`；覆盖仍必须满足当前 draft 的完整发布门。

## 13. 生命周期 CLI

Plan 4 提供独立、可恢复的 Bundle CLI：

- `comet bundle draft create <name>`
- `comet bundle draft optimize <bundle>`
- `comet bundle status <name>`
- `comet bundle compile <name> --platform <id>`
- `comet bundle eval-record <name> --result <file>`
- `comet bundle review <name> --approve|--reject`
- `comet bundle publish <name> [--overwrite]`
- `comet bundle distribute <name>`

`/comet-any` 使用这些命令持久化确定性状态。高级用户也可以手工调用它们恢复或审计流程。
所有命令支持 `--json`。

`draft create/optimize` 只初始化目录和 authoring state，不生成自然语言内容。Bundle 内容由
宿主 Agent、creator 和 Bundle Authoring Adapter 写入 draft。

现有 `comet skill` 命令继续管理单个 Comet Engine Skill Package，不与 Bundle CLI 混用。

## 14. 跨平台分发

`comet bundle distribute <name>` 复用 `comet init` 的平台检测、交互选择、scope、路径映射
和安全复制机制。

支持：

- `--scope project|global`
- 可重复 `--platform <id>`
- `--overwrite`
- `--json`

规则：

- 只分发 hash 未漂移的 `ready` Bundle。
- 默认使用与 `comet init` 一致的交互平台选择。
- 项目和全局目标路径使用现有 29 个平台映射。
- 只安装编译计划中的 Skills、rules、hooks、scripts、references 和 assets。
- 不复制 `.comet/bundle-authoring`、Eval 证据或工作目录。
- 平台能力不足时让用户选择跳过能力或取消该平台。
- 含 hooks 或可执行 scripts 时，展示命令、副作用、目标路径和平台，并要求明确确认。
- 目标已存在时默认跳过或交互确认；非交互覆盖必须显式 `--overwrite`。
- 部分平台失败时保留已成功分发结果，返回逐平台状态，不做跨平台回滚。
- `/comet-any` 发布成功后仅询问是否调用分发，不自动执行。

## 15. Hash 漂移

authoring status、publish 和 distribute 都重新计算完整 Bundle hash。

当 ready Bundle 被手工修改：

1. 当前 ready hash 与文件内容不一致。
2. 如果保留的 draft 仍等于已发布 hash，将修改后的 ready Bundle 原子移回 draft，并撤销
   ready 安装。
3. 如果 draft 也已独立变化，保留两份目录并记录 drift conflict，不自动覆盖任一份内容；
   publish 和 distribute 失败关闭，直到用户明确选择后续来源。
4. authoring state 退回 `draft`。
5. Bundle Eval、entry Skill Eval 和人工批准全部失效，但历史证据保留。
6. 用户必须重新 Eval、评审和发布。

单侧漂移保留实际修改内容，双侧漂移失败关闭，不进行隐式合并。

## 16. 错误处理与安全

- 无效 Bundle/Skill 名、目录逃逸和不安全来源失败关闭。
- draft、发布和分发源目录拒绝符号链接。
- manifest、rules 和 hooks 使用结构化 parser，不通过字符串拼接生成配置。
- 禁止 manifest 或 hook 中的任意内联 shell。
- scripts 必须声明副作用，并在分发前确认可执行内容。
- Eval 证据必须是结构化 JSON，绑定当前 Bundle hash。
- provider、档位和结果 schema 必须校验。
- 自然语言结果不能直接改变 `eval-passed`、`review-approved` 或 `ready` 状态。
- 缺失 Eval、Eval 失败、未人工批准或 hash 漂移均禁止发布。
- 平台扫描只读取 Skill，不执行 Skill 内容或脚本。
- fallback creator 和 fallback Eval Provider 必须由用户分别明确同意。
- 平台能力缺失不得静默降级。

## 17. 测试策略

### 17.1 Manifest 与 Compiler

- 多 entry/internal Skill manifest
- 共享和局部资源
- rule/hook 规范化语义
- script 副作用和路径安全
- 平台覆盖
- 可选 Engine 元数据
- dry-run 编译 IR 和确定性输出

### 17.2 候选发现

- `.comet/skills.txt` 解析、注释、去重和顺序
- 文件不存在时的平台 Skill 扫描
- 缺失候选的安装、替代、忽略信息
- 同名多来源的路径和描述消歧
- 实际 `SKILL.md` 内容读取

### 17.3 生命周期

- create 与 optimize draft
- 增删 entry/internal Skill、rules 和 hooks
- authoring state 原子写入和恢复
- current、Eval、review 和 ready hash 绑定
- Bundle 漂移和双侧 drift conflict
- 无效状态转换失败关闭

### 17.4 Eval 与评审

- quick/full schema 和门槛
- token 工作量估计展示
- skipped/failed Eval 保持 `draft`
- 各 entry Skill 和 Bundle 级结果
- 非当前 hash 证据拒绝
- 用户批准和拒绝
- 修改后审批失效

### 17.5 发布与分发

- 原子发布和默认不覆盖
- 只有 ready Bundle 可分发
- 29 个平台的项目级和全局路径
- 交互选择、显式平台、scope 和 overwrite
- 平台能力差异选择
- hooks/scripts 明确确认
- 部分失败的逐平台 JSON 结果
- 不复制 authoring 和 Eval 工作目录

### 17.6 当前 Comet 兼容基准

- 当前多 Skill 入口和辅助关系
- 中英文 locale 及其共享/覆盖内容
- rules、hooks、references、scripts 和 assets
- 29 平台路径和配置
- 规范化后行为合同匹配

### 17.7 Skill 内容

- `/comet-any` 中文版先实现并由用户确认
- 确认后同步英文版
- 原生 creator 优先和 fallback 用户确认
- creator 输出经过 Bundle Authoring Adapter
- Eval 可选且执行前提示 token 消耗
- 多入口 Bundle 规划和人工发布门
- Engine 元数据仅按需生成

### 17.8 回归

- `pnpm format:check`
- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `pnpm benchmark:classic`
- `git diff --check`

## 18. 验收标准

1. `/comet-any` 能新建或优化平台无关 Skill Bundle。
2. Bundle 可包含多个用户入口 Skill 和内部辅助 Skill。
3. Bundle 可表达共享 rules、hooks、references、scripts 和 assets。
4. 平台原生运行编译后的 Skills，不依赖 Comet Engine。
5. Engine 元数据只在用户需要高级运行能力时生成。
6. `.comet/skills.txt` 缺失时可扫描平台 Skill 并让用户选择。
7. 原生 creator 缺失时不会自动启用 fallback。
8. Eval 必须由用户选择，支持跳过、quick 和 full。
9. 跳过或失败 Eval 的 Bundle 保持 `draft`。
10. Eval 通过后仍须用户批准整个 Bundle。
11. Bundle 和各 entry Skill 的 Eval 结果绑定同一 Bundle hash。
12. 任一 Skill 或共享资源变化都会撤销 ready 并禁止分发。
13. Compiler 能展示平台能力差异并要求用户选择。
14. hooks/scripts 分发前必须展示副作用并确认。
15. ready Bundle 可复用现有 29 平台机制进行项目级或全局分发。
16. 当前 Comet 可由 Bundle 模型表达并重新生成等价受管产物。
17. 中文和英文 `/comet-any` 行为一致。
18. Classic workflow 合同和 benchmark 不回归。
