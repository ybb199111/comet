---
name: comet-build
description: "Comet 阶段 3：计划与构建。用 /comet-build 调用。制定计划并通过 subagent-driven-development 执行实施。"
---

# Comet 阶段 3：计划与构建（Build）

## 前置条件

- Design Doc 已创建（阶段 2 完成）
- 活跃 change 存在

## 步骤

### 0. 入口状态验证（Entry Check）

在执行任何操作之前，读取并验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/.comet.yaml` 存在
2. `phase` 字段的值为 `"build"`
3. `design_doc` 字段非 null 且非空
4. `design_doc` 引用的文件存在（例如 `docs/superpowers/specs/YYYY-MM-DD-topic-design.md`）
5. `openspec/changes/<name>/proposal.md` 存在且非空
6. `openspec/changes/<name>/tasks.md` 存在且非空

**验证方式：**
- `cat openspec/changes/<name>/.comet.yaml` 读取全部字段
- 用 `ls` 或 `test -f` 确认 design_doc 文件存在

**失败输出：**
```
[HARD STOP] Entry check failed for comet-build
  Expected: phase=build, design_doc=<path> exists
  Actual:   phase=<实际值>, design_doc=<实际值或文件不存在>
  Suggestion: Run comet-design first, or verify design_doc file exists.
```

验证通过后才进入步骤 1。

### 1. 制定计划

**立即执行：** 使用 Skill 工具加载 `superpowers:writing-plans` 技能。禁止跳过此步骤。

技能加载后，按其指引制定计划。计划要求：
- 保存至 `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- 引用设计文档，拆分为可执行任务
- **Plan 文件头必须包含关联元数据**：

```yaml
---
change: <openspec-change-name>
design-doc: docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
---
```

### 2. 更新计划状态

在 `openspec/changes/<name>/.comet.yaml` 中合并更新以下字段（保留其他字段不变）：

```yaml
phase: build
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
```

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 plan 行的值为 "docs/superpowers/plans/YYYY-MM-DD-feature.md"
  如不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。

### 3. 工作区隔离

计划已写入当前分支。在开始执行前，选择工作区隔离方式：

| 选项 | 方式 | 说明 |
|------|------|------|
| A | 创建分支 | 在当前仓库创建新分支，简单快速 |
| B | 创建 Worktree | 隔离工作区，完全独立，适合并行开发 |

**推荐规则**：
- 变更涉及 ≤ 3 个文件 → 推荐 A
- 需要并行开发、当前分支有未提交工作 → 推荐 B

用户选择后，在 `openspec/changes/<name>/.comet.yaml` 中合并更新 `isolation`（保留其他字段不变）。`isolation` 只允许以下值之一：

- `branch`
- `worktree`

Few-shot 示例：

```yaml
# 用户选择创建分支 / A
isolation: branch
```

```yaml
# 用户选择创建 worktree / B
isolation: worktree
```

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 isolation 行的值为 "<branch 或 worktree>"
  如不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。

**执行隔离**：

- **branch**：执行 `git checkout -b <change-name>`，后续工作在新分支上进行
- **worktree**：调用 `superpowers:using-git-worktrees` 技能或使用原生 `EnterWorktree` 工具创建隔离工作区

创建隔离后，确认计划文件可访问（分支方式天然可访问；worktree 方式需确认计划已提交）。

### 4. 选择执行方式

向用户展示计划摘要（任务数、涉及模块），然后询问执行方式：

| 选项 | 技能 | 适用场景 |
|------|------|---------|
| A | `superpowers:subagent-driven-development` | 任务独立、复杂度高、需要双阶段审查 |
| B | `superpowers:executing-plans` | 任务简单、无子agent环境、轻量快速 |

**推荐规则**：
- 任务数 ≥ 3 → 推荐 A
- 任务数 ≤ 2 且无跨模块依赖 → 推荐 B
- 来自 hotfix 路径 → 推荐 B

用户选择后，在 `openspec/changes/<name>/.comet.yaml` 中合并更新 `build_mode`（保留其他字段不变）。`build_mode` 只允许以下值之一：

- `subagent-driven-development`
- `executing-plans`
- `direct`（仅 hotfix preset 使用）

Few-shot 示例：

```yaml
# 用户选择稳健模式 / A
build_mode: subagent-driven-development
```

```yaml
# 用户选择快速模式 / B
build_mode: executing-plans
```

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 build_mode 行的值为 "<subagent-driven-development 或 executing-plans 或 direct>"
  如不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。

然后，**立即执行：** 使用 Skill 工具加载对应技能。禁止跳过此步骤。

如所选 Superpowers 技能不可用，停止流程并提示安装或启用对应技能，不要用普通对话替代该步骤。

技能加载后，按其指引执行：
- 按计划执行任务
- 完成 tasks.md 勾选（`- [ ]` → `- [x]`）
- 每个任务完成后提交代码

### 5. Spec 增量更新

实施过程中发现初版 spec 不完整时，按变更规模分级处理：

| 规模 | 触发条件 | 做法 |
|------|---------|------|
| 小 | 遗漏验收场景、边界条件 | 直接编辑 delta spec + design.md，追加 tasks.md 任务 |
| 中 | 接口变更、新增组件、数据流变化 | 重新 `superpowers:brainstorming` 更新 Design Doc + delta spec |
| 大 | 全新 capability 需求 | `/opsx:new` 创建独立 change |

**50% 阈值判定**：以 tasks.md 初始任务总数为基准，若新增任务数超过该总数的一半，视为超出原计划范围，应考虑拆分为新 change。

**原则**：
- delta spec 是活文档，本阶段期间随时可修改
- 每次更新应提交，commit message 说明变更原因
- 不提前同步到 main spec，归档时统一同步
- 如增量任务超过原 tasks.md 初始任务总数 50%，考虑拆分为新 change
- 小规模增量直接改 delta spec 时，应在 commit message 中注明，便于归档时判断 design doc 漂移

## 退出条件

- tasks.md 全部勾选
- 代码已提交
- 测试通过
- `.comet.yaml` 中 `phase` 已更新为 `verify`
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> build`，全部 PASS 后才允许流转

退出前在 `.comet.yaml` 中合并更新以下字段（保留其他字段不变）：

```yaml
phase: verify
verify_result: pending
```

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 phase 行的值为 "verify"
  确认 verify_result 行的值为 "pending"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。

## 自动流转

退出条件满足后，**无需等待用户再次输入**，直接执行下一阶段：

> **REQUIRED NEXT SKILL:** 调用 `comet-verify` skill 进入验证与收尾阶段。
