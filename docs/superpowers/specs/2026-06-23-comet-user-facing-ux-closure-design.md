# Comet 用户可用性闭环 Spec

**日期：** 2026-06-23
**状态：** 已实现并按当前代码打勾
**范围：** 梳理当前 Comet 在 Skill、`/comet-any`、Eval 与打包后 CLI 用户路径上的剩余优化项

## 1. 背景

Comet 0.4.0-beta.1 已经完成了几条关键用户能力链：

- Classic runtime 已迁移到纯 Node runtime。
- `status`、`doctor`、guard 与 runtime eval 正在共用同一条诊断证据路径。
- `/comet-any` 已经从 Bundle CLI 使用说明转为 Comet Skill Factory 用户入口。
- Bundle review summary 已能输出 readiness、blockers、warnings 和 evidence。
- Eval harness 已支持任意本地 Skill、生成 Skill manifest、profile、自动用户交互和失败归因。

这些能力说明方向是正确的，但用户体验还没有完全闭环。当前主要问题不是“缺一个大功能”，而是几个已存在的系统在真实用户路径上仍有摩擦：

- 构建后的 CLI 对 `assets` 的查找路径存在错位，可能直接破坏 `doctor`、`init`、`update` 等用户命令。
- `/comet-any` 的内部门禁已经存在，但用户和 Agent 仍需要理解较多 Bundle 子命令才能判断下一步。
- Eval 能力已经足够强，但入口仍是 pytest 参数矩阵，像维护者工具而不是产品能力。
- README 和 CLI help 已列出命令，但缺少面向任务的“我现在要做什么”路径。

本 spec 目标是把这些问题整理成可执行的用户体验闭环工作集，为后续 implementation plan 提供边界。

## 2. 当前事实

### 2.1 已经比较方便的部分

- `comet status` 能给出活跃 change 和下一步工作流状态；没有活跃 change 时能清晰返回。
- `comet bundle review-summary` 文本模式已经展示 readiness、blockers、warnings 和 evidence。
- `/comet-any` 中英文 Skill 已明确要求发布前读取 review summary readiness，并在 Eval 缺失或 readiness 非 publishable 时停止发布。
- Eval README 已提供任意本地 Skill 和 generated Skill manifest 的运行方式。
- Eval profile 已包括 `generic`、`comet-workflow`、`authoring-skill`，可以区分普通 Skill、Comet workflow 和 `/comet-any` 产物。

### 2.2 仍然不方便的部分

- 用户首次接触 `/comet-any` 时，README 会展示完整 Bundle CLI 生命周期，容易误以为自己需要手动串起所有命令。
- Bundle 状态输出虽然比之前更明确，但还没有一个稳定的 `next action` 聚合字段或命令，Agent 仍要从 status/review-summary/eval-plan/publish 错误中推断下一步。
- Eval 入口依赖 `cd eval && uv run pytest ...`，参数包括 task、treatment、profile、skill-path、eval-manifest、interaction-mode、max-turns、report-config；能力完整但认知成本高。
- CLI help 是命令枚举，缺少任务式入口，例如“创建 Skill”“评估 Skill”“修复 readiness blocker”“发布 Bundle”。
- 打包后 CLI 没有足够的烟测覆盖，导致 `dist` 资源路径问题能通过源码层测试但在 `bin/comet.js` 用户路径上暴露。

### 2.3 已确认的高风险问题

当前构建流程会清理 `dist` 并编译 TypeScript，但不会复制 `assets` 到 `dist`。同时 `domains/skill/platform-install.ts` 中的 `getAssetsDir()` 基于编译后模块目录推导资源目录：

```ts
return path.resolve(__dirname, '..', '..', 'assets');
```

在编译后运行 `bin/comet.js` 时，这会解析到 `dist/assets`，而不是仓库根目录的 `assets`。当前本地验证中：

- `assets/manifest.json` 存在。
- `dist/assets/manifest.json` 不存在。
- `node bin/comet.js doctor . --scope project` 会因找不到 `dist/assets/manifest.json` 失败。

这不是文案问题，而是会直接影响用户命令的发布级风险。

## 3. 目标

- 修复构建后 CLI 对资源目录的解析，使 npm 包和本地 `bin/comet.js` 用户路径稳定可用。
- 让 `/comet-any` 的下一步恢复、Eval、review 和 publish 判断更直接，减少 Agent 推理成本。
- 给 Eval 提供产品化 CLI 入口，保留 pytest harness 作为底层执行器。
- 让 README 和 CLI help 按用户任务组织入口，而不是只展示命令全集。
- 补齐打包后烟测，确保源码测试通过不等于用户 CLI 可用这个风险被持续覆盖。

## 4. 非目标

- 不重写现有 Bundle、Skill Engine、Classic runtime 或 Eval harness。
- 不把高成本 Eval 或跨平台分发设为默认自动动作。
- 不让 `/comet-any` 自动跳过人工 approval、Eval evidence 或 executable disclosure。
- 不修改 Superpowers 或 OpenSpec 原始 Skill。
- 不把 pytest runner 替换成另一套 Eval runtime；产品化 CLI 应封装现有 harness。
- 不要求轻量单步 Skill 必须接入完整 Engine。

## 5. 优先级总览

状态说明：`[x]` 已完成；`[~]` 部分完成；`[ ]` 尚未完成。

| 优先级 | 状态 | 问题 | 用户影响 | 目标状态 |
|--------|------|------|----------|----------|
| P0 | [x] | 构建后 CLI 找不到 `assets` | `doctor`、`init`、`update` 等命令可能直接失败 | `bin/comet.js` 在构建后和 npm 包内都能稳定定位 manifest 与 Skill assets |
| P0 | [x] | 缺少打包级 CLI 烟测 | 源码测试无法覆盖真实用户入口 | CI 或本地测试能验证构建后的 CLI 关键命令 |
| P1 | [x] | `/comet-any` 下一步不够显性 | 用户或 Agent 需要理解多个 Bundle 子命令 | Bundle 状态提供稳定 next action 和恢复说明 |
| P1 | [x] | Eval 入口过于维护者化 | 用户需要记 pytest 参数组合 | `comet eval` 封装常用 Skill eval、manifest eval、quick smoke 和 HTML 报告 |
| P2 | [x] | 文档与 CLI help 偏命令全集 | 新用户不知道从哪条路径开始 | README/help 提供任务式 quickstart |
| P2 | [x] | `comet skill run/resume/eval` 文本输出偏底层 | deterministic run 不容易被普通用户理解 | 文本输出包含下一步、pending action、artifact/eval 线索 |

## 6. P0：构建后 CLI 资源路径闭环

### 6.1 问题

当前 `getAssetsDir()` 以编译后模块位置推导 `assets`。源码测试从 TypeScript 源目录导入模块时可以工作，但用户通过 `bin/comet.js` 运行编译产物时，路径会变成 `dist/assets`。

这会影响所有依赖 `assets/manifest.json` 或内置 Skill 文件的命令，包括：

- `comet doctor`
- `comet init`
- `comet update`
- `comet uninstall`
- `copyCometSkillsForPlatform`
- `getManifestSkills`
- `copyCometRulesForPlatform`

### 6.2 设计方向

后续实现应选择一种明确策略，并用测试固定：

1. **构建复制策略**
   - `pnpm build` 后复制 `assets/` 到 `dist/assets/`。
   - 编译后代码继续从 `dist/assets` 读取资源。
   - 优点：当前 `getAssetsDir()` 逻辑改动小。
   - 风险：npm package 同时包含根 `assets` 和 `dist/assets` 时可能重复打包，需要调整 `files` 或打包策略。

2. **包根解析策略**
   - 编译后代码从包根目录解析 `assets/`，而不是从 `dist` 内部解析。
   - 优点：不复制大型资源，符合当前 `package.json` 已发布根 `assets` 的结构。
   - 风险：需要可靠识别包根，不能依赖当前工作目录。

推荐优先采用 **包根解析策略**，因为当前 `package.json` 的 `files` 已包含根 `assets`，避免重复资源更清晰。若实现成本高，可先采用构建复制策略作为短期修复，但必须避免 npm 包膨胀和资源漂移。

### 6.3 验收标准

- [x] `pnpm build` 后，`node bin/comet.js doctor . --scope project` 不因 `manifest.json` 缺失失败。
- [x] `node bin/comet.js init --help`、`doctor --help`、`update --help` 在构建后可运行。
- [x] 至少一个测试通过真实 `bin/comet.js` 或编译产物入口执行，而不是只导入 TypeScript 源码。
- [x] npm pack dry-run 或等价打包检查能确认 `assets/manifest.json` 被发布，且运行时代码能定位它。

## 7. P0：打包级 CLI 烟测

### 7.1 问题

当前测试覆盖了大量源码模块、Classic runtime 和 CLI command 函数，但缺少构建后入口烟测。结果是资源路径、`bin/comet.js`、package files、post-build 布局这类问题容易漏掉。

### 7.2 设计方向

新增一个轻量打包烟测，不做真实外部安装，不访问网络，不运行高成本流程。它只验证构建后用户入口：

- `node bin/comet.js --help`
- `node bin/comet.js status <tmp-project>`
- `node bin/comet.js doctor <tmp-project> --scope project`
- 可选：`npm pack --dry-run --ignore-scripts --json` 或受控的 pack manifest 检查

烟测应避免写用户目录、避免触发真实依赖安装、避免依赖全局 npm cache。若 npm pack 在本地权限环境不稳定，可以先验证 package `files` 与构建产物布局，再把完整 pack 检查放到 release/prepublish 阶段。

### 7.3 验收标准

- [x] 构建后 smoke test 能在 Windows 本地通过。
- [x] smoke test 失败时能指出是资源布局、bin 入口还是命令运行失败。
- [x] CI 中至少有一个 job 覆盖构建后 CLI 用户入口。

## 8. P1：`/comet-any` 下一步聚合

### 8.1 问题

`/comet-any` 已经通过 Bundle 后端维护确定性状态，也有 readiness blockers。但用户仍可能在这些信息之间来回切换：

- `bundle status`
- `bundle candidates`
- `factory-resolve`
- `factory-generate`
- `eval-plan`
- `eval-record`
- `review-summary`
- `review`
- `publish`
- `distribute`

Agent 能读懂这些命令，但用户体验上仍像高级 CLI，而不是 Skill Factory。

### 8.2 设计方向

在 Bundle 状态层增加稳定的 next-action 合同。可以是新命令，也可以先扩展现有输出：

```text
Next action: resolve-candidates
Reason: 2 unresolved Factory candidates
Suggested command: comet bundle factory-resolve <name> ...
User decision needed: choose one source for "review-flow"
```

建议的 action 枚举：

- `resolve-candidates`
- `generate-factory-package`
- `compile-reference-platform`
- `choose-eval-level`
- `record-eval`
- `request-review`
- `publish`
- `ask-distribution`
- `distribute`
- `done`

`/comet-any` Skill 应读取这个 next action，而不是重新猜测 Bundle 生命周期。JSON 输出应提供机器可读字段，文本输出应提供人类可读说明。

### 8.3 验收标准

- [x] `comet bundle status <name> --json` 或新命令包含 next action。
- [x] 非 JSON 输出能直接说明下一步、原因和是否需要用户决策。
- [x] `/comet-any` 中英文文案都要求读取 next action。
- [x] readiness blocked 时，输出能区分 candidate、eval、review、capability、executable disclosure 等阻塞类型。
- [x] 测试覆盖 blocked、reviewable、publishable、published 四类状态。

## 9. P1：产品化 Eval CLI

### 9.1 问题

Eval 当前能力足够，但入口是 pytest：

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task=generic-skill-smoke --skill-path=... --profile=generic -v
```

这对维护者可接受，但不适合作为 Comet 用户主路径。尤其 `/comet-any` 生成 `comet/eval.yaml` 后，用户期望是“跑这个 Skill 的 quick eval”，而不是理解 pytest suite、task、profile、report-config。

### 9.2 设计方向

新增 `comet eval` 顶层命令，封装现有 harness：

```bash
comet eval run --manifest ./my-skill/comet/eval.yaml --quick
comet eval run --skill-path ./my-skill --skill-name my-skill --profile generic --quick
comet eval collect --manifest ./my-skill/comet/eval.yaml
comet eval compare --baseline COMET_FULL_039 --current COMET_FULL --html
```

第一阶段只做薄封装：

- 仍调用 `uv run pytest` 或现有 Python entrypoint。
- 默认从 `eval/` 目录运行。
- `--quick` 优先选择 manifest recommendedTasks 或 `generic-skill-smoke`。
- `--collect-only` 暴露为 `comet eval collect`，用于低成本发现验证。
- `--html` 自动生成临时 report config 并输出报告路径。

### 9.3 验收标准

- [x] 用户可从仓库根目录运行 `comet eval run --manifest <path>`。
- [x] 命令输出包含 experiment id、profile、task、report path 和失败归因摘要。
- [x] `comet eval collect --manifest <path>` 不运行 Docker/Claude，只验证发现路径。
- [x] README 用 `comet eval` 作为主路径，pytest 命令保留为维护者路径。
- [x] 本地测试覆盖参数转换和错误提示，不需要在单元测试中真实调用 Claude。

## 10. P2：任务式 README 与 CLI help

### 10.1 问题

README 已经覆盖很多命令，但新用户更关心任务：

- 我要安装 Comet。
- 我要开始一个工作流。
- 我要创建或优化一个 Skill。
- 我要评估一个 Skill。
- 我要发布或分发一个 Bundle。
- 我要诊断为什么当前流程卡住。

现在 README 更像命令参考。命令参考仍有价值，但不应压过任务式路径。

### 10.2 设计方向

README 顶部增加简短任务入口：

- **开始 Comet 工作流**：`comet init` → `/comet`
- **创建/优化 Skill**：`/comet-any`
- **评估 Skill**：`comet eval run --manifest ...`
- **诊断卡住状态**：`comet status` → `comet doctor`
- **发布前检查 Bundle**：`comet bundle review-summary`

CLI help 可逐步增加 examples 或 command descriptions，但不需要一次性重写 Commander help。优先在 README、`comet bundle status` 文本输出、`comet eval` 输出里降低入口成本。

### 10.3 验收标准

- [x] README-zh 先更新，用户确认后同步 README。
- [x] 中英文结构保持一致。
- [x] README 不把完整 Bundle CLI 生命周期当作 `/comet-any` 普通用户主流程。
- [x] 命令参考保留，但下沉到 details 或“高级用法”。

## 11. P2：Skill run/resume/eval 文本输出改进

### 11.1 问题

`comet skill run/resume/eval` 是 Engine 能力入口，但普通用户很难从底层字段理解：

- 当前 pending action 是什么？
- 需要 Agent 做什么？
- 用户是否需要确认？
- 哪些 artifact 已记录？
- runtime eval 为什么失败？
- 下一步应该 `resume` 还是修产物？

### 11.2 设计方向

保持 JSON 输出稳定，在文本输出增加简短解释：

```text
Run: demo-run
Skill: my-skill
Status: waiting-for-action
Pending action: invoke_skill review-flow
Next: ask the Agent to complete the pending action, then run comet skill resume ...
Artifacts: report=...
Runtime eval: fail (missing artifact: report)
```

### 11.3 验收标准

- [x] 文本输出包含 run id、status、pending action、next step。
- [x] eval 失败时显示缺失 evidence 或 artifact。
- [x] JSON 输出不破坏现有合同。
- [x] 测试覆盖 run waiting、resume succeeded、eval failed、eval passed。

## 12. 用户故事

- 作为新用户，我运行 `comet doctor` 时不应该因为发布包内部路径缺失而看到 Node stack trace。
- 作为 Skill 作者，我调用 `/comet-any` 后，希望它告诉我下一步要解决候选、跑 eval、等待 review 还是 publish，而不是让我理解所有 Bundle 子命令。
- 作为维护者，我希望任何“已通过 eval”的结论都能追溯到具体 profile、Skill hash、task、report 和 artifact。
- 作为生成 Skill 的用户，我希望用一个 `comet eval run --manifest ...` 命令完成 quick eval，并拿到可打开的报告路径。
- 作为发布者，我希望 ready publish 前能看到明确的 blockers、warnings、evidence 和下一步动作。

## 13. 实施顺序建议

1. [x] 修复资源路径或构建资源复制，并补构建后 CLI 烟测。
2. [x] 在 Bundle state/review-summary 输出中加入 next action 合同。
3. [x] 让 `/comet-any` 中英文 Skill 读取 next action，而不是重新推断生命周期。
4. [x] 增加 `comet eval collect/run` 的薄封装。
5. [x] 更新 README-zh，再同步 README。
6. [x] 增强 `comet skill run/resume/eval` 文本输出。

## 14. 风险与约束

- 资源路径修复不能依赖当前工作目录；用户可能从任意目录运行全局 `comet`。
- Eval CLI 封装不能隐藏高成本行为；quick/full、Docker、Claude、LangSmith 都必须显式。
- `/comet-any` next action 不能成为第二套状态机；它必须从现有 Bundle authoring state 和 review readiness 派生。
- README 改动要克制，详细机制应链接到 docs/specs 或 architecture 文档。
- 中英文 Skill 和 README 的用户行为描述必须同步。

## 15. 完成定义

这个优化集完成时，用户应能做到：

- [x] 安装或构建后运行 `comet doctor` 不遇到资源路径错误。
- [x] 调用 `/comet-any` 后能从输出中看到明确下一步。
- [x] 对生成 Skill 运行 quick eval 时不需要直接记 pytest 命令。
- [x] 发布 Bundle 前能看到机器可读和人类可读的 readiness 证据。
- [x] README 能用任务式路径解释 Skill、`/comet-any` 和 eval 的关系。
