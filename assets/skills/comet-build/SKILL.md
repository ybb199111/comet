---
name: comet-build
description: "Comet 阶段 3：计划与构建。用 /comet-build 调用。制定计划并通过 subagent-driven-development 执行实施。"
---

# Comet 阶段 3：计划与构建（Build）

## 前置条件

- Design Doc 已创建（阶段 2 完成）
- 活跃 change 存在

## 步骤

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

在 `openspec/changes/<name>/.openspec.yaml` 中合并更新：

```yaml
comet:
  phase: build
  plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
```

### 3. 选择执行方式

向用户展示计划摘要（任务数、涉及模块），然后询问执行方式：

| 选项 | 技能 | 适用场景 |
|------|------|---------|
| A | `superpowers:subagent-driven-development` | 任务独立、复杂度高、需要双阶段审查 |
| B | `superpowers:executing-plans` | 任务简单、无子agent环境、轻量快速 |

**推荐规则**：
- 任务数 ≥ 3 → 推荐 A
- 任务数 ≤ 2 且无跨模块依赖 → 推荐 B
- 来自 hotfix 路径 → 推荐 B

用户选择后，在 `openspec/changes/<name>/.openspec.yaml` 中记录实际执行方式。`build_mode` 只允许以下值之一：

- `subagent-driven-development`
- `executing-plans`
- `direct`（仅 hotfix preset 使用）

Few-shot 示例：

```yaml
# 用户选择稳健模式 / A
comet:
  build_mode: subagent-driven-development
```

```yaml
# 用户选择快速模式 / B
comet:
  build_mode: executing-plans
```

然后，**立即执行：** 使用 Skill 工具加载对应技能。禁止跳过此步骤。

如所选 Superpowers 技能不可用，停止流程并提示安装或启用对应技能，不要用普通对话替代该步骤。

技能加载后，按其指引执行：
- 按计划执行任务
- 完成 tasks.md 勾选（`- [ ]` → `- [x]`）
- 每个任务完成后提交代码

### 4. Spec 增量更新

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
- `.openspec.yaml` 中 `comet.phase` 已更新为 `verify`
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> build`，全部 PASS 后才允许流转

退出前合并更新：

```yaml
comet:
  phase: verify
  verify_result: pending
```

## 自动流转

退出条件满足后，**无需等待用户再次输入**，直接执行下一阶段：

> **REQUIRED NEXT SKILL:** 调用 `comet-verify` skill 进入验证与收尾阶段。
