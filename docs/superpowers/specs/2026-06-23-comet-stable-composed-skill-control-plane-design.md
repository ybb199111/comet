# Comet 稳定组合 Skill 控制面设计

日期：2026-06-23

## 背景

当前 `/comet-any` 已经开始承担“从用户目标生成可评估、可发布 Skill”的职责，但现有 factory 仍偏向生成一个线性的 `callChain`：

- 生成入口 `SKILL.md`。
- 生成 `comet/skill.yaml`、`comet/guardrails.yaml`、`comet/evals.yaml`、`comet/eval.yaml`。
- 记录 resolved Skill 证据。
- 通过 Bundle 生命周期进入 eval、review、ready、distribute。

这已经验证了方向，但还不足以支撑稳定的“组合 Skill 自动推进”。主要缺口是：

- 组合仍是扁平调用链，不能表达来源 Skill 自己的小流程。
- 来源 Skill 如果引用其他 Skill 或提供多个候选 Skill，当前没有统一展开、选择和环路检查。
- `scripts`、`rules`、`hooks` 还被当成 Bundle 可选能力，而不是稳定自动推进的核心控制面。
- `evals.yaml` 与 `eval.yaml` 命名容易混淆。
- 用户主路径仍容易被 `skill`、`bundle`、`eval`、`publish` 等底层概念打散。

本设计将 `/comet-any` 生成物收束为一类明确产物：**稳定组合 Skill Bundle**。它不是单独的 `SKILL.md`，而是一套包含入口文档、Engine 计划、脚本、规则、hook、运行检查、评估 manifest 和分发声明的完整控制面。

## 目标

1. `/comet-any` 生成的 Skill 默认具备稳定自动推进、断点恢复和越界阻断能力。
2. 组合 Skill 的运行时只执行最终编译出的无环执行计划，不在运行时递归展开来源 Skill。
3. 生成 Bundle 必须包含 `scripts`、`rules`、`hooks`，并把它们声明为 required capability。
4. `hooks/*.yaml` 明确作为 Comet portable hook descriptor，由 `comet publish distribute` 编译为各平台原生配置。
5. 将运行时检查文件从 `evals.yaml` 收束为更清晰的 `checks.yaml`，保留 `eval.yaml` 作为 Eval 平台 manifest。
6. 用户路径收束为 `/comet-any -> comet eval -> comet publish -> distribute`，底层 `skill` / `bundle` CLI 保持高级调试定位。

## 非目标

- 不开放手动编排 Skill 的新用户路径。
- 不要求所有已有手写 Skill 立即迁移到稳定组合 Bundle。
- 不把 Comet portable hook descriptor 当作平台原生 hook 配置直接安装。
- 不让目标平台在缺少 required hook/rule/script 能力时静默降级。
- 不改变内置 Classic Comet 的 `.comet.yaml` 状态机事实源。

## 核心概念

### 稳定组合 Skill Bundle

`/comet-any` 生成的默认产物。它包含：

- 用户入口 Skill。
- 最终无环执行计划。
- 用于推进和恢复的 scripts。
- 用于约束 Agent 的 rules。
- 用于强制检查的 hooks。
- 用于运行时检查的 checks。
- 用于平台评估的 eval manifest。
- 用于分发的 bundle manifest。

### Plan

最终执行计划。Plan 是创建阶段的编译结果，不是用户手写的首要接口。运行时只读取 Plan，不重新解释来源 Skill 的小流程。

### Step

Plan 内的一个执行步骤。Step 可以调用 Skill、调用工具、请求确认、检查点或交接。

### Choice

创建阶段遇到多个候选 Skill 时的选择点。Choice 必须在生成最终 Plan 前解决。运行时不保留未解决 Choice。

### Control Plane

稳定组合 Skill 的控制面，由 `skill.yaml`、`guardrails.yaml`、`checks.yaml`、scripts、rules、hooks 和状态文件共同组成。它的职责是让 Agent 按计划执行、可恢复、可验证，并在越界时阻断。

## 用户主路径

用户面只讲四步：

```text
/comet-any 创建 Skill
  -> comet eval 验证 Skill
  -> comet publish review/approve/run
  -> comet publish distribute 分发到目标 Agent 平台
```

底层命令定位：

- `comet skill`: 检查、安装、运行单个 Engine-native Skill 的低层工具。
- `comet bundle`: 检查、编译、调试 Bundle 的低层工具。
- `comet eval`: 用户可见的评估入口。
- `comet publish`: 用户可见的发布与分发入口。

README 和用户文档应以 `/comet-any -> eval -> publish` 为主线。手动 YAML、手动 Bundle、手动 hook descriptor 不进入新用户路径。

## 生成物目录

稳定组合 Skill Bundle 的目标目录结构：

```text
<bundle-draft>/
  bundle.yaml

  skills/<entry-skill>/
    SKILL.md
    comet/
      skill.yaml
      guardrails.yaml
      checks.yaml
      eval.yaml
    reference/
      resolved-skills.json
      composition-report.md
    scripts/
      comet-plan.mjs
      comet-check.mjs
      comet-hook-guard.mjs

  rules/
    <entry-skill>-orchestration.md

  hooks/
    <entry-skill>-guard.yaml
```

可选资源可以继续存在，例如 assets 或额外 references，但 `skills`、`scripts`、`rules`、`hooks`、`references` 是稳定组合 Skill Bundle 的 required capabilities。

## YAML 文件职责

### `bundle.yaml`

Bundle 的分发 manifest。它声明哪些资源属于该 Bundle，以及目标平台必须支持哪些能力。

稳定组合 Skill Bundle 应默认生成：

```yaml
apiVersion: comet/v1alpha1
kind: SkillBundle
metadata:
  name: my-workflow
  version: 1.0.0
  description: Generated stable composed Skill
  defaultLocale: zh
  locales: [zh]
skills:
  - id: my-workflow
    path: skills/my-workflow
    visibility: entry
resources:
  rules:
    - id: my-workflow-orchestration
      path: rules/my-workflow-orchestration.md
      mode: always
      required: true
  hooks:
    - id: my-workflow-guard
      path: hooks/my-workflow-guard.yaml
  references:
    - skills/my-workflow/reference/resolved-skills.json
    - skills/my-workflow/reference/composition-report.md
  scripts:
    - id: comet-plan
      path: skills/my-workflow/scripts/comet-plan.mjs
      sideEffect: write
      runtime: node
    - id: comet-check
      path: skills/my-workflow/scripts/comet-check.mjs
      sideEffect: read
      runtime: node
    - id: comet-hook-guard
      path: skills/my-workflow/scripts/comet-hook-guard.mjs
      sideEffect: read
      runtime: node
  assets: []
platforms:
  requires: [skills, scripts, rules, hooks, references]
  optional: []
  overrides: []
engine:
  enabled: false
```

`engine.enabled: false` 仍可保留当前 factory 的兼容策略：Engine 文件嵌在入口 Skill 目录内，而不是 Bundle 顶层 legacy engine channel。

### `skills/<entry-skill>/comet/skill.yaml`

最终执行计划。它由 `/comet-any` 编译生成，运行时读取它推进 Step。

要求：

- 必须是无环 Plan。
- 必须不包含未解决 Choice。
- 必须列出所有允许调用的 Skill、Agent 和 Tool。
- 不允许要求运行时递归读取其他 Skill 的 `flow.yaml`。

### `skills/<entry-skill>/comet/guardrails.yaml`

运行边界。它定义允许调用范围、最大迭代、重试限制、哪些 action 需要确认。

要求：

- `allowedSkills` 必须等于最终 Plan 可调用 Skill 集合。
- 对 scripts、tools、external action 使用最小权限。
- hook/script 检查不得放宽 guardrails。

### `skills/<entry-skill>/comet/checks.yaml`

运行时检查，替代当前 `evals.yaml`。

职责：

- 检查状态字段。
- 检查必要 artifact 是否存在。
- 检查 Step outcome 是否满足完成条件。
- 检查 Plan hash 与运行状态是否一致。

兼容要求：

- 新生成物写 `checks.yaml`。
- loader 在迁移期可以读取旧 `evals.yaml` 作为别名。
- 文档和新测试只使用 `checks.yaml`。

### `skills/<entry-skill>/comet/eval.yaml`

Eval 平台 manifest。它不是运行时检查文件，而是告诉 `comet eval` 如何评估这个 Skill。

职责：

- 指定 Skill 名称和 source。
- 指定推荐任务。
- 指定 required skills。
- 指定 expected artifacts。
- 指定 interaction mode 和 max turns。

命名规则：

- `checks.yaml`: runtime self-checks。
- `eval.yaml`: external evaluation manifest。
- 不再同时使用 `evals.yaml` 和 `eval.yaml` 作为新生成命名。

### `hooks/*.yaml`

Comet portable hook descriptor。它不是任何平台的原生配置。

示例：

```yaml
event: before_write
matcher: Write|Edit
script: comet-hook-guard
failure: block
requiresConfirmation: false
```

分发流程：

```text
hooks/*.yaml
  -> bundle compiler
  -> platform adapter
  -> .claude/settings.local.json 或 .gemini/settings.json 或 hooks.json 等平台原生配置
```

如果目标平台不能表达 required hook，`distribute` 必须失败并说明原因。

## 来源 Skill 的组合声明

来源 Skill 可以选择提供：

```text
source-skill/
  SKILL.md
  comet/
    flow.yaml
```

`flow.yaml` 是创建阶段输入，不是运行时事实源。

最小格式：

```yaml
steps:
  - use: brainstorming
  - use: writing-plans
  - choose:
      id: review
      options:
        - requesting-code-review
        - team-review-skill
  - use: verification-before-completion
```

规则：

- 没有 `flow.yaml` 的来源 Skill 被视为原子 Skill。
- 有 `flow.yaml` 的来源 Skill 被视为组合模板，展开为其 steps。
- Choice 必须在生成最终 Plan 前解决。
- 展开时必须检查环路，例如 `A -> B -> A`。
- 最终 `skill.yaml` 不保留 `flow.yaml` 的递归语义。

## 组合编译流程

`/comet-any` 的创建阶段应执行：

```text
读取用户目标
  -> 读取 .comet/skills.txt 和用户偏好
  -> 发现候选 Skill
  -> 读取候选 SKILL.md / comet/flow.yaml / references / scripts
  -> 展开来源 Skill 小流程
  -> 解决 Choice
  -> 检查环路
  -> 编译最终 Plan
  -> 生成稳定组合 Skill Bundle
```

编译输出必须包括：

- `callChain` 兼容视图，供现有 review summary 和旧测试逐步迁移。
- 新的 `composition` 元数据，记录展开来源、选择原因、环路检查结果和偏离用户偏好顺序的原因。
- `composition-report.md`，供用户 review。
- `resolved-skills.json`，供 eval 和 publish 门禁验证。

## scripts 职责

稳定组合 Skill Bundle 必须生成至少三个脚本：

### `comet-plan.mjs`

职责：

- 初始化运行状态。
- 读取当前 Step。
- 写入 Step outcome。
- 推进到下一 Step。
- 支持断点恢复。
- 校验 Plan hash。

### `comet-check.mjs`

职责：

- 校验生成物完整性。
- 校验 required scripts/rules/hooks/references 是否存在。
- 校验来源 Skill hash 是否漂移。
- 校验当前状态是否可恢复。
- 提供 eval 和 publish 可复用的检查入口。

### `comet-hook-guard.mjs`

职责：

- 供平台 hook 调用。
- 在 before_write / before_tool 等事件检查当前 Plan 和状态。
- 阻断越过当前 Step 的写入或工具调用。
- 在缺少状态、hash 不一致或 Plan 不可读时 fail closed。

## rules 职责

生成的 rule 应持续约束 Agent：

- 必须读取并遵守 `comet/skill.yaml`。
- 每个 Step 完成后必须通过 `comet-plan.mjs` 写入 outcome。
- 恢复时必须先读取当前状态，不得凭记忆继续。
- 不得运行时递归展开来源 Skill 的 `flow.yaml`。
- 不得绕过 required hooks/scripts。
- 遇到 hook/script 阻断时必须停止并报告原因。

rule 是 Agent 可读约束，script/hook 是可执行约束。二者缺一不可。

## hooks 职责

生成的 hook 应至少覆盖：

- 写入前检查当前 Step 是否允许写入。
- 调用工具前检查是否越过 Plan。
- 状态缺失或 hash 不一致时阻断。
- required script 缺失时阻断。

hook 的具体平台落地由 `comet publish distribute` 完成。源 YAML 不直接安装。

## Eval 门禁

对稳定组合 Skill Bundle，`comet eval` 至少应验证：

1. `bundle.yaml` 声明 required `skills/scripts/rules/hooks/references`。
2. `SKILL.md` 存在并引用最终工作方式。
3. `comet/skill.yaml` 是无环 Plan。
4. `comet/guardrails.yaml` 只允许 Plan 中声明的 Skill/Tool/Agent。
5. `comet/checks.yaml` 存在并可加载。
6. `comet/eval.yaml` 存在并可被 eval harness 发现。
7. required scripts 存在并通过基本执行检查。
8. required rules/hooks 存在并能被 Bundle compiler 编译。
9. 目标平台不支持 required hook 时，distribution preflight 明确失败。
10. 断点恢复可以从中间 Step 继续。
11. 越界写入或越界工具调用会被 hook/script 阻断。
12. `composition-report.md` 与 `resolved-skills.json` 能解释来源、选择和偏离。

`publish ready` 必须依赖 Eval 通过。Eval 失败时不能进入 ready。

## 分发门禁

`comet publish distribute` 写入前必须展示：

- 将安装哪些 entry Skill。
- 将复制哪些 scripts。
- 将写入哪些 rules。
- 将注册哪些 hooks。
- 哪些 hook 会调用哪些 script。
- 每个 script 的 side effect。
- 哪些目标平台能力不支持。
- 是否需要用户确认 executable hook。

当 required capability 不被支持：

- 非交互模式必须失败。
- 交互模式可以让用户选择其他目标平台，但不能把该 Bundle 以稳定自动推进模式降级安装。

当写入失败：

- 已有平台 install plan 应尽量 rollback。
- 至少要输出可恢复状态和已写入文件列表。

## 兼容策略

### `evals.yaml` 到 `checks.yaml`

- 新生成物只写 `checks.yaml`。
- loader 迁移期同时支持 `checks.yaml` 和旧 `evals.yaml`。
- 如果两者同时存在，优先 `checks.yaml`，并在 validate 中提示重复配置。
- 现有测试逐步改到 `checks.yaml`。

### 旧 flat `callChain`

- 继续保留 `callChain` 作为兼容视图。
- 新增 `composition` 元数据作为真实组合解释。
- factory package 生成可先把 Plan steps 编译回现有 `SkillStep[]`，减少一次性重构风险。

### 现有 Bundle 分发层

- 继续复用现有 Bundle manifest、compiler、platform adapter、preview/distribute 分离能力。
- 不把平台 hook 生成逻辑放入 `/comet-any`。
- `/comet-any` 只生成 portable descriptors 和 required capability。

## 设计取舍

### 为什么 scripts/rules/hooks 必须生成

稳定自动推进不能只依赖 `SKILL.md`。`SKILL.md` 能指导 Agent，但不能保证：

- 恢复时读取正确状态。
- 每一步都写 outcome。
- 越界写入被阻断。
- Plan hash 漂移被发现。
- 分发后平台行为真的生效。

Comet 自身稳定的经验是 `Skill 文档 + scripts + rules + hooks` 形成闭环。`/comet-any` 生成的稳定组合 Skill 也应继承这套机制。

### 为什么 hook YAML 不是平台配置

各 Agent 平台 hook 格式不同。Comet 必须保留一个 portable descriptor，然后由分发层编译成平台原生配置。这样可以：

- 统一 review。
- 统一 eval。
- 统一 unsupported capability 报告。
- 避免用户手动复制不生效的 YAML。

### 为什么运行时不递归展开来源 Skill

递归展开会导致：

- 运行时不可预测。
- 容易出现环路。
- 断点恢复难以绑定 hash。
- Eval 难以判断真正执行计划。

因此所有展开、选择、环路检查都在创建阶段完成。运行时只执行最终 Plan。

## 实施优先级

### P0：收束命名和用户路径

- 文档主路径改为 `/comet-any -> comet eval -> comet publish`。
- 新文档避免把 `skill` / `bundle` 作为普通用户主入口。
- 将 `evals.yaml` 新命名设计为 `checks.yaml`。

### P1：生成完整控制面

- factory 生成 required scripts/rules/hooks/references。
- `bundle.yaml` 默认 requires `skills/scripts/rules/hooks/references`。
- review summary 显示控制面完整性。

### P2：组合编译

- 增加 `flow.yaml` 读取。
- 展开来源 Skill 小流程。
- 解决 Choice。
- 检查环路。
- 输出 `composition` 元数据和 `composition-report.md`。

### P3：断点恢复

- 生成 `comet-plan.mjs`。
- 保存当前 Step、outcome、Plan hash、source hash。
- 恢复时从状态继续。

### P4：Eval 发布门禁

- 扩展 eval manifest 和检查项。
- Eval 验证 required control plane。
- Eval 验证断点恢复和越界阻断。

### P5：分发强披露

- distribute preflight 展示 Skill/rule/hook/script 写入计划。
- required capability 不支持时 fail closed。
- executable hook 需要明确确认。

## 验收标准

- [x] `/comet-any` 生成的新 Bundle 包含完整 required control plane。
- [x] 新 Bundle 的 `bundle.yaml` 将 `skills/scripts/rules/hooks/references` 声明为 required。
- [x] 新 Bundle 使用 `checks.yaml`，不再新写 `evals.yaml`。
- [x] 旧 `evals.yaml` Skill 在迁移期仍可加载。
- [x] 组合 Skill 能展开来源 `flow.yaml`，并在环路时给出明确错误路径。
- [x] 未解决 Choice 会阻止生成最终 ready Bundle。
- [x] `comet eval` 能验证控制面完整性。
- [x] `comet publish distribute` 能把 hook descriptor 编译到支持的平台，并在不支持的平台 fail closed。
- [x] 文档只把 `/comet-any -> eval -> publish -> distribute` 作为普通用户主路径。
- [x] `comet skill` 和 `comet bundle` 的帮助文案明确为低层调试/高级入口。

## 风险

- required hooks 会降低部分平台的可安装范围，但这是稳定自动推进必须付出的诚实成本。
- 同时支持 `checks.yaml` 和 `evals.yaml` 会带来短期 loader 复杂度，需要明确迁移期和优先级。
- 生成 scripts/rules/hooks 后，Eval 和 publish 门禁必须同步加强，否则用户会获得看似完整但未验证的控制面。
- `flow.yaml` 若过早暴露给用户，会把复杂性推回用户侧。首版应只作为来源 Skill 的高级声明，不作为普通用户文档主路径。

## 结论

Comet 下一步优化的核心不是新增更多命令，而是把 `/comet-any` 生成物升级为稳定组合 Skill Bundle：

```text
SKILL.md
  + final Plan
  + guardrails
  + checks
  + eval manifest
  + scripts
  + rules
  + hooks
  + references
  + bundle manifest
```

这让 Comet 的用户体验从“生成一个 Skill 文档”升级为“生成、验证、发布、分发一套可恢复、可阻断、可评估的自动化 Skill 系统”。
