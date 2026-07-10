# Comet Any Workflow Skill Production Readiness Design

日期：2026-06-30

状态：设计稿，待实现。

范围：本文是对既有 `comet-any` / Skill Factory 设计的质量加固增补。它不取代 `2026-06-27-comet-any-agent-workflow-contract-design.md`、`2026-06-28-comet-any-authoring-protocol-design.md` 或 `2026-06-28-comet-any-authored-content-zone-design.md`，而是基于 `comet-grill-me` 生成实测，补齐 Comet overlay 生成物在状态、证据、augmentation、eval 和 readiness 上的断层。

## 背景

通过 `/comet-any` 生成 `comet-grill-me` 后，对比原始 `/comet` 发现：当前生成器已经能产出完整 Bundle 结构，包括 entry Skill、node Skills、`workflow-protocol.json`、scripts、rules、hooks 和 eval manifest。但生成物仍偏 scaffold，不能直接假设它像手写 Comet Skill 一样可靠。

问题不在于 Skill 薄。对于 `comet-five-phase-overlay`，薄 delegate wrapper 是合理的，因为每个节点实际委托给已有的 `comet-open`、`comet-design`、`comet-build`、`comet-verify` 和 `comet-archive`。真正的问题是薄 wrapper 背后的协议、状态机、证据和 readiness 没有完全接住新增行为。

本次实测暴露了八个断层：

1. 自定义 Output Schema 可以进入 protocol，但当前 node patch 不能把它挂到具体 node，导致 guard/eval/readiness 不会强制它。
2. `augmentations` 会进入 protocol，但生成的 node Skill、handoff 脚本、guard 和 eval 主要只消费 `requiredSkillCalls`。
3. `comet-five-phase-overlay` 在 protocol 里声明 `.comet.yaml`，但生成脚本遇到 wildcard state path 会 fallback 到 `.comet/runs/<workflow>/state.json`，形成旁路状态机。
4. entry `Decision Core` 缺 authored 内容时只留下 placeholder，readiness 没有把它作为 blocker。
5. 生成物没有明确区分“薄但可靠的 delegate wrapper”和“不完整 scaffold”，用户容易把未完成的 scaffold 当成可发布 workflow。
6. 生成的 `comet/eval.yaml` 已能被仓库 `eval/` 系统读取，但当前推荐任务偏 authoring smoke / route conformance；组合 Skill 还没有系统性映射到现有 task suite、baseline treatment、pass@k 报告和 readiness 回写。
7. `comet-any` Skill 文档仍保留旧 benchmark provider 语义，尤其是 `reference/eval-provider.md`、`bundle-authoring.md` 和部分 subagent brief 仍提到 `skill-creator` provider、`benchmark-plan` / `benchmark-record` 或 `benchmark evidence`，与新的仓库 `eval/` 主路径不一致。
8. `reference/subagents/*.md` 当前只是 Comet-any authoring lane 的 portable role brief，不是 Claude Code 可自动发现的 custom agent 定义；它们缺少 `name` / `description` 等 agent frontmatter，也没有位于 `.claude/agents/`、用户 agents 目录或插件 `agents/` 目录中，容易让实现者误以为已经提供了平台原生 subagent。

## 目标

- 让自定义 Output Schema 必须挂到具体 Workflow Node，并进入 guard、eval 和 readiness。
- 让 `augmentations` 成为可见、可交接、可验证的一等契约。
- 让 `comet-five-phase-overlay` 保留真实 Comet `.comet.yaml` 状态语义，不创建旁路状态机。
- 让 entry Decision Core 和 authored content 缺失成为 readiness blocker。
- 让生成包明确区分“薄但可靠的 delegate wrapper”和“不完整 scaffold”。
- 让 `comet-any` 生成包通过仓库 `eval/` 系统评估，而不是维护独立的内部 benchmark。
- 让组合 Skill 能作为动态 treatment 跑现有 Comet / generic task suite，并与 `CONTROL`、原生 Comet 等 baseline 对比。
- 让 eval 结果绑定当前 draft hash，并被 review summary 消费用于 readiness 判断。
- 清理 `comet-any` Skill 文档中的旧 benchmark provider 语义，统一改成仓库 `eval/` 主路径。
- 明确区分 portable authoring lane brief 与平台原生 custom agent；为 Claude Code 输出符合其 agent schema 和目录约定的可安装 agent 定义。
- 为上述行为补回归测试，防止再次生成看似完整但约束未生效的 Bundle。

## 非目标

- 不修改 Superpowers、OpenSpec 或用户原始 Skill。
- 不把原始 Comet Skill 全量复制进生成包。
- 不要求所有 delegate node 都写成长篇 Skill。
- 不重写整个 `comet-any` authoring pipeline。
- 不改变 `workflow-kernel` 的基础状态模型。
- 不把普通用户暴露到内部 factory/composition 术语中。
- 不新增一套与 `eval/` 平行的评测系统。
- 不直接搬运 `skill-creator` benchmark 目录结构；如需借鉴，只通过仓库 eval profile、task、report 抽象承接。
- 不在本轮直接删除 `eval-provider.md`；先在中文 Skill 中改写或重命名，确认后再同步英文版本。
- 不把 `reference/subagents/*.md` 直接冒充为 Claude Code custom agents；它们可以继续作为跨平台 role brief，但平台原生 agent 必须单独生成。

## 核心判断

薄 wrapper 可以发布，但必须满足三条边界：

1. 它委托的 Skill 是真实可加载的富 Skill。
2. 它新增的约束能通过 Output Schema、completed check 或 guard 被验证。
3. 它的入口决策、恢复、阻塞点和状态语义是明确 authored 的，不是 placeholder。

不满足这些条件时，生成物应被标记为 scaffold，并被 readiness 阻塞。

## 设计

### 1. Node Patch 支持 Output Schema

`WorkflowNodePatch` 增加字段：

```ts
interface WorkflowNodePatch {
  implementation?: WorkflowSkillBindingInput;
  requiredSkillCalls?: WorkflowSkillBindingInput[];
  augmentations?: WorkflowSkillBindingInput[];
  outputSchemas?: string[];
  satisfies?: string[];
  disabled?: boolean;
}
```

归一化规则：

- template node 的 `outputSchemas` 与 patch 的 `outputSchemas` 合并去重。
- 合并后的 node output schemas 是 guard/eval/readiness 的唯一强制来源。
- `workflow.outputSchemas` 仍用于定义 schema body，但仅定义不代表生效。

校验规则：

- patch 引用未知 schema 时，返回 validation finding。
- workflow 定义了自定义 schema 但没有任何 node 使用时，返回 `orphan-output-schema` finding。
- `protocol.evals[].requiredOutputSchemas` 从最终 node output schemas 计算，不能只包含内置 schema。

用户效果：

用户要求 `grill-me` 在 `design/plan/review` 产出 `comet.grill-me.v1` 时，plan 可以这样表达：

```json
{
  "workflow": {
    "kind": "comet-five-phase-overlay",
    "nodes": {
      "design": {
        "requiredSkillCalls": [{ "skill": "grill-me" }],
        "outputSchemas": ["comet.grill-me.v1"]
      },
      "plan": {
        "requiredSkillCalls": [{ "skill": "grill-me" }],
        "outputSchemas": ["comet.grill-me.v1"]
      },
      "review": {
        "requiredSkillCalls": [{ "skill": "grill-me", "scope": "review" }],
        "outputSchemas": ["comet.grill-me.v1"]
      }
    }
  }
}
```

这样 `comet.grill-me.v1` 不再只是 protocol 中的全局定义，而是每个相关 node 的退出条件。

### 2. Augmentation Contract

`augmentations` 不能只是 protocol 的附加字段。生成器必须把它渲染到人类可读产物和交接脚本中。

Entry Skill：

- `Workflow Nodes` 列出 required skills 和 augmentations。
- `Skill Bindings` 对每个 node 分别展示 implementation、required calls、augmentations。
- 若 augmentation 没有绑定 Output Schema 或 evidence，标记为 advisory。

Node Skill：

- 新增 `## Augmentations` 段落。
- 对每个 augmentation 说明触发时机、scope、reason、需要记录的 evidence。
- `Evidence Record` 示例中包含 augmentation completed checks 或 schema evidence。

Handoff script：

- `workflow-handoff.mjs` 输出 `requiredSkillCalls`、`augmentations` 和 `outputSchemas`。
- handoff scope 的 augmentation 必须出现在子代理交接上下文中。

Readiness：

- 对没有 evidence contract 的 augmentation 给 warning：`[workflow] <node>: augmentation <skill> is advisory only`。
- 若 augmentation 被声明为必须影响完成判定，但没有 Output Schema 或 completed check，给 blocker。

### 3. Comet Overlay State Adapter

`comet-five-phase-overlay` 不能把 `.comet/runs/<workflow>/state.json` 作为主状态源。该 fallback 适合 `workflow-kernel`，不适合 Comet overlay。

Overlay state adapter 行为：

1. 检测 active OpenSpec changes。
2. 若没有 active change，返回阻塞信息，提示通过 `/comet-open` 或原 Comet 入口创建 change。
3. 若恰好一个 active change，读取 `openspec/changes/<name>/.comet.yaml`。
4. 若多个 active changes，阻塞并要求用户选择。
5. 读取和推进阶段时使用原 Comet `.comet.yaml` 字段语义。
6. 不自动初始化 `.comet/runs/<workflow>/state.json` 作为 overlay 主状态。

兼容字段：

- `phase`
- `build_pause`
- `plan`
- `isolation`
- `build_mode`
- `tdd_mode`
- `review_mode`
- `verify_result`
- `branch_status`
- `archived`

生成脚本的责任边界：

- overlay 脚本只做路由、补充 evidence 和 guard 检查。
- 原 Comet 的阶段推进仍由对应 `comet-*` Skill 与 classic runtime 脚本处理。
- 如果 overlay 无法安全映射到 `.comet.yaml`，必须阻塞，不得创建旁路 workflow state。

### 4. Overlay Decision Core

`comet-five-phase-overlay` 的 entry `Decision Core` 必须 authored。它至少覆盖：

- 如何恢复 active change。
- 如何根据 `.comet.yaml` 判断当前阶段。
- 如何处理 `build_pause: plan-ready`。
- 如何尊重 `build_mode`、`tdd_mode`、`review_mode`。
- 如何处理 `verify_result: fail`。
- 如何处理多个 active changes。
- 哪些节点必须暂停等待用户确认。
- 新增 required calls / augmentations 在何处执行。
- 哪些情况说明生成包只是 scaffold，不能继续。

该内容可以薄，但不能缺失。若缺失，readiness 必须阻塞。

### 5. Authored Content Readiness

Readiness 增加 deterministic scan：

- 任意生成文件包含 `<!-- AUTHORING PENDING -->` → blocker。
- entry Skill 的 `Decision Core` 仍为 placeholder → blocker。
- substance node 缺 authored content → 继续使用现有 blocker。
- delegate node 可薄，但不能含 pending marker。
- `reference/decision-points.md` 或 `reference/recovery.md` 只有默认泛化内容时，至少 warning；如果 workflow kind 是 `comet-five-phase-overlay`，应 blocker，除非 authoring review 明确接受。

新的 readiness 消息示例：

```text
[authoring] Entry Decision Core is not authored
[authoring] Generated package still contains AUTHORING PENDING markers
[workflow] design: custom Output Schema comet.grill-me.v1 is defined but not attached to any Node
[workflow] verify: augmentation grill-me is advisory only; no evidence contract will enforce it
```

### 6. Eval System Integration

`comet-any` 的验证必须接入仓库现有 `eval/` 系统。`comet-any` 只负责生成被测对象和 manifest；`eval/` 负责隔离执行、task/treatment 编排、rubric、pass@k、报告和失败归因；`review-summary` 负责读取结构化结果并决定 readiness。

职责边界：

- `comet-any` 生成 `comet/eval.yaml`，声明 entry Skill、generated node skills、recommended tasks、required skills、expected artifacts、interaction、profile、baseline treatments 和 quality gates。
- `eval/` 通过 `uv run pytest local/tests/tasks/test_tasks.py --eval-manifest <path>` 把生成包作为 `DYNAMIC_SKILL` treatment 注入，复制 entry Skill 与 generated node skills 到隔离工作区。
- `eval/` 对同一批 task 同时运行 `CONTROL`、原生 Comet treatment 和动态组合 Skill treatment，产出 pass@k / pass^k / weighted rubric / failure attribution / report paths。
- `comet-any` 或 bundle CLI 把 eval 结果记录回 draft state，必须包含 draft hash、eval manifest hash、任务列表、treatment 列表、profile、count、通过率、rubric 分、失败原因和报告路径。
- `review-summary` 只消费当前 draft hash 对应的 eval 结果；hash 不匹配、缺失、失败或低于阈值时阻塞 ready。

Manifest 扩展方向：

```yaml
evaluation:
  recommendedTasks:
    - authoring-skill-smoke
    - workflow-route-conformance
    - comet-full-workflow
    - comet-fix-median
  baselineTreatments:
    - CONTROL
    - COMET_FULL
  requiredSkills:
    - comet-grill-me
    - grill-me
  qualityGates:
    minWeightedScore: 0.80
    minPassAt1: 0.60
    maxInstabilityGap: 0.40
```

Task selection rules：

- `workflow-kernel` 默认推荐 `generic-skill-smoke`、`authoring-skill-smoke`、`workflow-route-conformance`，并允许用户显式绑定 domain task。
- `comet-five-phase-overlay` 默认推荐 authoring smoke、route conformance 和一组现有 Comet workflow tasks，例如 `comet-full-workflow`、`comet-fix-median`、`comet-refactor-counter`、`comet-api-cache-ttl`。
- 如果 overlay 引入 required skill call 或 augmentation，manifest 必须追加至少一个能观察该行为的 task 或 rubric criterion。例如 `grill-me` overlay 需要验证相关 node 是否调用 `grill-me` 并把结论写入 evidence / artifact。
- quick eval 可以只跑 authoring smoke + route conformance；ready/publish eval 必须跑 workflow/domain task suite 和 baseline 对比。

Readiness rules：

- 当前 draft hash 没有 eval evidence → blocker。
- 只有 quick eval，没有 ready/publish 所需 task suite → blocker 或 explicit warning，由 publish mode 决定。
- `DYNAMIC_SKILL` 低于 quality gates → blocker。
- 组合 Skill 相对原生 baseline 明显退化，且用户目标不是实验性探索 → blocker。
- eval runner 自身失败且无法归因到 task/model → blocker，避免把 harness 失败误判为 Skill 质量。

### 7. Subagent Role Briefs vs Claude Code Agents

`reference/subagents/*.md` 是跨平台 authoring lane role brief，不是平台原生 custom agent。它们可以继续作为 Skill 内部参考资料，但不能被当作 Claude Code custom subagent 包发布。

结构分层：

- `reference/subagents/*.md`：保留为 portable role brief，描述 lane 职责、输入、输出、claim、阻塞条件和 fallback 语义。
- 平台原生 agent 产物：由 factory / publish distribute 针对目标平台生成，例如 Claude Code 输出到 `.claude/agents/`、用户 agents 目录或插件 `agents/` 目录。
- `reference/authoring-lanes.json`：记录某个 lane 实际使用 `subagent`、`inline` 还是 `platform-agent` dispatch mode，以及使用的 agent id / model / tools。

Claude Code agent definition 必须包含平台 schema，而不是只有 brief 正文：

```markdown
---
name: comet-any-script-author
description: Use when authoring workflow script contracts for a confirmed comet-any bundle draft.
tools: Read, Write, Glob, Grep
model: inherit
---

# Script Author Agent

You author the script contract for one comet-any authoring lane...
```

生成规则：

- `name` 必须稳定、唯一、可 slug 化，建议前缀 `comet-any-`。
- `description` 必须说明何时调用该 agent，不能只写角色名称。
- `tools` 必须最小化；authoring agent 默认只读/写指定报告路径，不得拥有 publish、install 或 destructive 权限。
- `model` 必须显式记录；如果平台不支持选择，`authoring-lanes.json` 记录为 `platform-default`。
- 正文可以引用 portable role brief，但必须把关键职责内联到 agent prompt，避免目标平台只看到一个路径而无法执行。
- 生成目录由 platform compiler 决定；Skill reference 目录不得伪装为 `.claude/agents/`。

Readiness 规则：

- 如果 proposal 声称使用 Claude Code custom agents，但 package 里没有生成对应 agent definitions → blocker。
- 如果 generated agent 缺少 `name`、`description` 或正文 prompt → blocker。
- 如果 agent tools 超出 lane 职责，例如允许 publish/distribute/install → blocker 或 executable disclosure。
- 如果只存在 `reference/subagents/*.md`，则只能标记为 portable brief / inline fallback，不能声称已经提供 platform-native agent。

### 8. Overlay-Specific Eval

为 `comet-five-phase-overlay` 增加 eval 检查项：

- custom output schema 会进入 expected artifacts/evidence。
- required skill call 缺 completed check 时，exit guard 阻塞。
- augmentation 在 node Skill 和 handoff context 中可见。
- no active change 时，overlay state adapter 阻塞，而不是创建旁路 state。
- entry Skill 不含 `AUTHORING PENDING`。
- `review` 节点如果受 `review_mode` 影响，eval 覆盖 `off`、`standard`、`thorough` 三种路径的说明一致性。

### 9. Confirmation Page Enforcement Column

`/comet-any` 展示确认页时，每个新增 binding 或 schema 必须显示 enforcement 级别：

- `guarded`：退出 guard 会强制检查。
- `handoff-guarded`：交接上下文强制包含，返回 evidence 后再检查。
- `evidence-only`：必须记录 evidence，但没有 artifact。
- `advisory`：只作为提示，不会阻塞流程。

如果用户的目标语义是“必须”，但生成方案只能做到 `advisory`，必须暂停并说明风险，不能直接生成。

### 10. Thin Wrapper Classification

生成包在 `composition-report.md` 和 review summary 中标注 wrapper 质量：

- `delegate-complete`：薄 delegate wrapper，真实 Skill 可加载，新增约束都有 evidence contract。
- `delegate-advisory`：薄 delegate wrapper，但部分 augmentations 只是提示。
- `scaffold-blocked`：存在 pending authored content 或状态语义未完成。
- `kernel-authored`：workflow-kernel substance node 已有 authored content。

`scaffold-blocked` 不能进入 ready。

## 模块改动

### `eval/`

- `eval/scaffold/python/manifests.py`：扩展 manifest 字段，支持 baseline treatments、quality gates、task suite hints 和 draft hash metadata。
- `eval/local/tests/conftest.py`：确保 `--eval-manifest` 动态 treatment 同时注入 entry Skill、generated node skills、required skill hints、expected artifacts 和 interaction 配置。
- `eval/local/tasks/`：新增 overlay 行为任务，覆盖 required skill call / augmentation 是否真实发生。
- `eval/scaffold/python/validation/authoring_rubric.py`：把 authoring smoke 从结构检查扩展到组合 Skill contract 检查。
- `eval/scaffold/python/report_outputs.py` 或实验日志层：输出可被 `review-summary` 消费的结构化 eval evidence。

### `domains/workflow-contract`

- `types.ts`：`WorkflowNodePatch.outputSchemas?: string[]`。
- `validation.ts`：校验 patch output schemas、orphan custom schemas。
- `normalize.ts`：合并 node output schemas；eval required output schemas 从最终 node 计算。
- `workflow-contract.test.ts`：增加 custom schema attached/unattached、augmentation evidence contract 测试。

### `domains/factory`

- `package.ts`：entry/node markdown 渲染 augmentations。
- `package.ts`：`workflow-handoff.mjs` 输出 augmentations。
- `package.ts`：overlay state script 使用 Comet state adapter，不 fallback 到 `.comet/runs`。
- `package.ts`：eval manifest 记录 required evidence，不只记录 artifacts。
- `package.ts`：eval manifest 为 `comet-five-phase-overlay` 选择现有 Comet task suite、baseline treatments 和 publish quality gates。
- platform compiler：为 Claude Code 目标生成真正的 custom agent definitions，而不是只复制 `reference/subagents/*.md`。
- package/review metadata：记录每个 authoring lane 是 portable brief、inline fallback 还是 platform agent dispatch。
- `factory-package.test.ts`：覆盖 augmentation 渲染、handoff 输出、pending marker readiness 相关产物。

### `domains/bundle`

- `review-summary.ts`：增加 pending marker scan、orphan schema blocker、advisory augmentation warning。
- `review-summary.ts`：读取当前 draft hash 对应的 eval evidence，展示 task/treatment/pass@k/rubric/report，并在缺失或低于阈值时阻塞 readiness。
- `review-summary.ts`：如果 package 声称支持 Claude Code custom agents，但缺少 agent frontmatter、description、prompt 或目录输出，阻塞 readiness。
- `eval.ts`：把 bundle eval plan 映射为仓库 `eval/` runner 命令和 manifest 参数，不再只生成内部 smoke 说明。
- `authoring.ts`：确保 workflow-entry lane 对 overlay entry Decision Core 是必需内容。

### `assets/skills-zh/comet-any` 与 `assets/skills/comet-any`

先修改中文版本，确认后再同步英文版本。

文档需要新增：

- Output Schema 必须挂到 node 才算生效。
- augmentations 的 enforcement 语义。
- overlay 不允许旁路 `.comet.yaml` 状态。
- 生成前确认页必须展示 enforcement。
- pending authored content 会阻塞 publish readiness。

## 测试计划

重点测试：

```bash
npx vitest run test/domains/workflow-contract/workflow-contract.test.ts
npx vitest run test/domains/factory/factory-package.test.ts
npx vitest run test/domains/bundle/bundle-review-summary.test.ts
npx vitest run test/domains/bundle/comet-any-skill.test.ts
npx vitest run test/domains/bundle/comet-any-skill-contract.test.ts
cd eval && uv run pytest local/tests/tasks/test_tasks.py --eval-manifest <generated>/comet/eval.yaml --count=2 -v
```

新增或更新测试场景：

1. `WorkflowNodePatch.outputSchemas` 能把 custom schema 挂到内置 Comet node。
2. 定义 custom schema 但没有任何 node 使用时 validation 失败。
3. custom schema 进入 `protocol.evals[].requiredOutputSchemas`。
4. node Skill 渲染 `## Augmentations`。
5. `workflow-handoff.mjs` 输出 augmentations。
6. required skill call 缺 evidence 时 guard 阻塞。
7. attached custom schema 缺 required evidence/artifact 时 guard 阻塞。
8. overlay state adapter 在无 active change 时阻塞。
9. 生成包含 `AUTHORING PENDING` 时 readiness blocked。
10. `comet-any` 中英文文档都说明 enforcement 级别和 node-attached Output Schema。
11. `--eval-manifest` 能把生成包作为 `DYNAMIC_SKILL` treatment 注入 eval runner。
12. `comet-five-phase-overlay` manifest 默认包含 Comet workflow task suite 和 baseline treatments。
13. review summary 能读取结构化 eval evidence，并因 hash mismatch、缺失结果或低于 quality gate 阻塞。
14. `comet-any` 中文 Skill 文档不再把 `skill-creator` provider 或 bundle benchmark 命令描述为主验证路径。
15. Claude Code target package 生成带 `name`、`description`、正文 prompt 的 agent definitions，而不是把 `reference/subagents/*.md` 当成可发现 agent。
16. readiness 能区分 portable role brief、inline fallback 和 platform-native custom agent。

## 验收标准

- `comet.grill-me.v1` 这类 schema 可以挂到 `design`、`plan`、`review`，并进入 guard/eval/readiness。
- `subagent-execute` 和 `verify` 的 augmentations 在生成 node Skill 和 handoff 输出中可见。
- `comet-five-phase-overlay` 运行时只使用真实 `.comet.yaml` 或明确阻塞。
- 含 `AUTHORING PENDING` 的生成包不能进入 `reviewable` 或 `ready`。
- 重新生成 `comet-grill-me` 后，node Skills 可以保持薄 delegate 形式，但新增约束必须可见、可验证、可恢复。
- 用户确认页能区分 `guarded`、`handoff-guarded`、`evidence-only` 和 `advisory`。
- readiness 能清楚告诉用户生成包是 `delegate-complete`、`delegate-advisory` 还是 `scaffold-blocked`。
- `comet-any` 生成包可以通过 `eval/` 的 `--eval-manifest` 路径作为任意 Skill treatment 被评估。
- ready/publish 判断使用当前 draft hash 的 eval evidence，包含 pass@k、weighted rubric、baseline comparison 和报告路径。
- `comet-grill-me` 这类组合 Skill 至少能与 `CONTROL` 和原生 `COMET_FULL` 在相同任务上对比，不能只依赖 authoring smoke。
- Claude Code 分发预览能展示 planned agent files；缺少 `description` 或 prompt 的 agent 不能进入 ready。

## 开放问题

1. `review` node 是否应继续作为独立 optional node，还是在 Comet overlay 中映射为 `review_mode` 下的 build/verify 附加检查？
2. overlay state adapter 是否直接复用 classic runtime 的 state 命令，还是新增轻量 wrapper？
3. `augmentations` 是否需要新增 `requiredEvidence` 字段，还是统一通过 `outputSchemas` 表达？
4. `reference/decision-points.md` 的默认泛化内容在 overlay 中是否一律 blocker，还是允许 authoring review 降级为 warning？
5. ready/publish 的默认 quality gates 应该按 workflow kind 固定，还是允许项目级 `.comet/skill-preferences.yaml` 覆盖？
6. baseline regression 阈值如何定义：要求组合 Skill 优于原生 Comet，还是只要求不显著退化且新增约束生效？
7. Claude Code custom agent 是作为 project `.claude/agents/` 产物分发，还是作为插件 `agents/` 产物分发，是否需要两种 target compiler？
8. portable role brief 与 platform-native agent 是否一一对应，还是允许多个 lane 共用一个 agent definition？

## 推荐实施顺序

1. 扩展 workflow contract：node patch output schemas、orphan schema validation、eval required schemas。
2. 扩展 factory 渲染：augmentations、handoff、eval manifest。
3. 打通仓库 `eval/`：manifest 扩展、动态 treatment、task suite、baseline comparison、结构化 evidence 输出。
4. 设计并生成平台原生 authoring agents：保留 portable role brief，同时为 Claude Code target 输出符合 custom agent schema 的 agent definitions。
5. 增加 readiness blockers：pending marker、entry Decision Core、orphan schema、advisory augmentation、缺失或失败 eval evidence、缺失或无效 platform agent definition。
6. 实现 overlay state adapter，移除 overlay 主路径中的 fallback state。
7. 更新 `comet-any` 中文 Skill 文档，清理旧 benchmark provider 语义和 subagent/custom agent 边界，确认后同步英文。
8. 重新生成 `comet-grill-me` 作为回归样例，并运行 quick eval、ready eval 和 baseline comparison。
