# Comet Runtime Classic Package Design

**日期：** 2026-06-29
**状态：** Draft
**范围：** 本次仅整理当前五阶段流程的内部 runtime package，不设计新的双模式用户入口。

## 1. 背景

当前仓库存在两套内部资产：

```text
assets/skills/comet-classic/
assets/skills-zh/comet-classic/
```

它们被 `assets/manifest.json` 放在 `internalSkills` 中，并不是用户直接调用的 Skill。实际用途是给当前 OpenSpec + Superpowers 五阶段流程提供内部控制面：

- `comet/skill.yaml` 定义 full、hotfix、tweak 的稳定步骤图；
- `comet/guardrails.yaml` 限定 runtime 只能调度公开的阶段 Skill；
- `comet/checks.yaml` 定义完成态 runtime check；
- `SKILL.md` 只是为了满足当前 `loadSkillPackage()` 的包加载合同。

这会造成两个误解：

1. `comet-classic` 位于 skills 顶层，看起来像一个用户可调用 Skill。
2. `SKILL.md` 强化了这种误解，但该包本质上不应该被用户 invoke。

同时，`classic` 不是要消失的概念。它将来会和自研 `native` runtime 形成并列模式。因此本次不把它改成泛化的 `builtin-runtime`，而是把 `classic` 放到 runtime 模式层。

## 2. 目标

1. 将当前内部控制包从顶层 `comet-classic` 移入 `comet/runtime/classic`。
2. 删除内部 runtime package 的 `SKILL.md`，让它成为 YAML-only runtime package。
3. 保持普通用户 Skill 的合同不变，普通 Skill 仍必须包含 `SKILL.md`。
4. 保持现有用户命令面不变：`/comet`、`/comet-open`、`/comet-design`、`/comet-build`、`/comet-verify`、`/comet-archive`、`/comet-hotfix`、`/comet-tweak` 不改名。
5. 保留旧 `comet-classic` 路径和旧状态的兼容读取能力。
6. 为未来并列 `comet/runtime/native` 留出结构空间，但不实现 native mode 或 mode 切换。

## 3. 非目标

- 不新增 `/comet-native`、`/comet-openspec` 或其他用户入口。
- 不重命名现有 `/comet-*` 阶段 Skill。
- 不设计 mode 配置 UX。
- 不改变 OpenSpec + Superpowers 五阶段流程语义。
- 不修改 Superpowers 或 OpenSpec 原始 Skill。
- 不把 `/comet-any` 的 generated internal skills 和 Comet 内置 runtime package 混成同一个概念。

## 4. 目标结构

英文资产：

```text
assets/skills/comet/runtime/classic/
  skill.yaml
  guardrails.yaml
  checks.yaml
```

中文资产：

```text
assets/skills-zh/comet/runtime/classic/
  skill.yaml
  guardrails.yaml
  checks.yaml
```

未来 native runtime 可以自然并列：

```text
assets/skills/comet/runtime/native/
  skill.yaml
  guardrails.yaml
  checks.yaml
```

本次仅创建 `classic`，不创建 `native` 占位目录。

## 5. 命名约定

- 目录名使用 `comet/runtime/classic`。
- `classic` 表示当前 OpenSpec + Superpowers 五阶段 runtime 模式。
- 文件名从 `comet/skill.yaml` 收敛为 `skill.yaml`，不再嵌套一层 `comet/`。
- 运行时内部可以继续复用现有 `SkillDefinition` 类型，但用户可见文案应称它为 runtime package 或 runtime control package。

`metadata.name` 需要谨慎处理。推荐分两步：

1. 本次移动目录和删除 `SKILL.md` 时，保留 `metadata.name: comet-classic`，避免已迁移 Run 立即出现 skill mismatch。
2. 后续单独做 runtime identity migration，再将 `metadata.name` 迁移到类似 `comet-runtime-classic` 或 `comet-classic-runtime`。

如果本次必须同步改 `metadata.name`，则需要同时实现旧 Run 的自动迁移和 snapshot hash 重写。该路径风险更高，不作为本 spec 推荐方案。

## 6. Loader 设计

新增内部 runtime package loader，而不是放宽普通 Skill loader：

- `loadSkillPackage(root)` 保持现状，继续要求 `SKILL.md`。
- 新增 `loadRuntimePackage(root)`，读取 YAML-only runtime package。
- `loadRuntimePackage(root)` 读取：
  - `skill.yaml`
  - `guardrails.yaml`
  - `checks.yaml`
- 两者最终可返回同样的 `SkillPackage` 内部结构，以复用 Engine 的校验、snapshot 和 runtime check 逻辑。

这样可以避免用户 Skill 包悄悄失去 `SKILL.md` 约束。

## 7. Snapshot 设计

当前 snapshot 逻辑强制把 `SKILL.md` 纳入 hash：

```text
snapshotFiles(pkg) -> SKILL.md + script tools
```

需要拆成两类：

- ordinary Skill package snapshot：包含 `SKILL.md` 和 script tools；
- runtime package snapshot：不包含 `SKILL.md`，只包含 runtime package document 和 script tools。

由于当前 classic runtime package 没有 script tools，hash 主要由 `skill.yaml`、`guardrails.yaml`、`checks.yaml` 归一化后的 package document 决定。

## 8. Runtime 查找

`classicSkillRoot()` 应改为优先查找新路径：

1. `COMET_RUNTIME_CLASSIC_ROOT`
2. runtime bundle 相邻路径：`../runtime/classic`
3. 仓库资产路径：`assets/skills/comet/runtime/classic`
4. 旧环境变量：`COMET_CLASSIC_SKILL_ROOT`
5. 旧路径：`assets/skills/comet-classic`

错误信息应从 `Comet Classic internal Skill package is not installed` 调整为 `Comet classic runtime package is not installed`。

旧环境变量保留，是为了测试、benchmark 和外部脚本短期兼容。

## 9. Manifest 和安装

`assets/manifest.json` 的 `internalSkills` 改为新路径：

```json
[
  "comet/runtime/classic/skill.yaml",
  "comet/runtime/classic/guardrails.yaml",
  "comet/runtime/classic/checks.yaml"
]
```

安装器仍应把 `internalSkills` 纳入 managed lifecycle，但用户可见 Skill 名列表仍只能来自 `skills`。

OpenCode/Pi 这类命令生成逻辑继续只读取 `manifest.skills`，因此不会为 runtime package 生成用户命令。

## 10. Eval 和 Benchmark

需要同步以下位置：

- `scripts/benchmark/classic-baseline-regression.mjs` 的 runtime root；
- `eval/local/skills/benchmarks/comet` 中的 runtime bundle；
- `eval/local/treatments/comet/comet_full.yaml` 对 runtime 资产的注入或路径假设；
- 所有使用 `COMET_CLASSIC_SKILL_ROOT` 的测试 helper。

目标是让 `COMET_FULL` eval 不依赖仓库偶然路径，也能找到 `comet/runtime/classic`。

0.3.9 baseline 里的 `comet-classic-039` 只是冻结对照 fixture，本次不重命名。

## 11. `/comet-any` 影响

`/comet-any` 生成的 internal skills 属于 Bundle/Factory 产物，不是 Comet 内置 runtime package。本次不改 `/comet-any` 的用户流程。

需要做的只是回归测试：

- generated internal skills 仍使用 Bundle manifest 的 `visibility: internal`；
- Comet 内置 runtime package 仍使用 `assets/manifest.json` 的 `internalSkills`；
- 两套概念在文档和测试里不要互相借名。

## 12. 测试计划

新增或更新测试：

1. `test/domains/skill/skill-load.test.ts`
   - 普通 Skill 缺少 `SKILL.md` 仍失败；
   - runtime package 缺少 `SKILL.md` 可以通过 `loadRuntimePackage()` 加载；
   - runtime package 读取 `checks.yaml`，拒绝旧 `evals.yaml`。

2. `test/domains/comet-classic/comet-classic-package.test.ts`
   - 改为覆盖 `comet/runtime/classic`；
   - 断言目录不存在 `SKILL.md`；
   - 断言步骤图、guardrails、checks 与现有行为一致；
   - 中英文 YAML 控制面保持结构一致。

3. `test/domains/skill/internal-skills.test.ts`
   - `internalSkills` 列表使用新路径；
   - 用户可见 Skill 名不包含 `comet-classic`，也不包含 `runtime`。

4. Classic runtime 测试
   - `COMET_RUNTIME_CLASSIC_ROOT` 可注入新路径；
   - `COMET_CLASSIC_SKILL_ROOT` 旧变量仍可工作；
   - generated `comet-runtime.mjs` 与源码新路径一致。

5. Eval/benchmark smoke
   - `pnpm run benchmark:classic` 或对应子集能找到新 runtime package；
   - `COMET_FULL` treatment 不因删除 `SKILL.md` 失败。

推荐验证命令：

```bash
pnpm build:classic-runtime
npx vitest run test/domains/skill/skill-load.test.ts test/domains/skill/internal-skills.test.ts
npx vitest run test/domains/comet-classic/comet-classic-package.test.ts
npx vitest run test/domains/comet-classic/comet-scripts.test.ts
pnpm lint
pnpm build
npx vitest run
```

## 13. Changelog

本次实现后需要更新 `CHANGELOG.md`，归入当前 `package.json` 版本对应条目。描述应从用户视角写：

- 内部 Classic runtime 控制包不再作为顶层 Skill-like 目录分发；
- runtime package 改为 `comet/runtime/classic` 下的 YAML-only 控制面；
- 用户命令和五阶段行为不变。

如果本次只写设计 spec，不改 runtime 资产或源码，则不写 Changelog。

## 14. 验收标准

1. 安装后的用户可见 Skill 列表不出现 `comet-classic`。
2. `assets/skills/comet-classic` 和 `assets/skills-zh/comet-classic` 被移除。
3. `comet/runtime/classic` 没有 `SKILL.md`。
4. 当前五阶段流程行为不变。
5. 旧路径和旧环境变量在兼容期内仍可用。
6. 普通用户 Skill 仍必须有 `SKILL.md`。
7. Classic runtime、benchmark、eval、manifest 和安装测试通过。
