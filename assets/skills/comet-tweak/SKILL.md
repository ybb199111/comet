---
name: comet-tweak
description: "Comet 预设路径：非 bug 的小改动（tweak）。跳过 brainstorming 和完整 plan，直接 open → lightweight build → light verify → archive。适用于文案、配置、文档或 prompt 的局部优化。"
---

# Comet 预设路径：Tweak

Tweak 是 Comet 五阶段能力的预设工作流，不是独立的平行流程。它复用 open、build、verify、archive 能力，仅跳过 brainstorming 和完整 plan。

适用于非 bug 的小范围变更，例如文案调整、配置调整、文档或 prompt 的局部优化。

**适用条件**（必须全部满足）：
1. 不新增 capability
2. 不改变架构
3. 不涉及接口变化
4. 通常不超过 3 个 tasks、5 个文件

**不适用**：如变更过程中发现需要 capability、架构或接口调整，应升级为完整 `/comet` 流程。

---

## 流程（preset workflow，4 阶段）

执行链路：open → lightweight build → light verify → archive。Tweak 为每个阶段提供默认决策：精简开启、轻量构建、轻量验证、验证通过后归档。

### 1. 快速开启（preset open）

复用 Comet open 能力创建 change，但使用 tweak 默认值：不执行 `openspec-explore` 长探索，直接进入精简 change 创建。

**立即执行：** 使用 Skill 工具加载 `openspec-new-change` 技能。禁止跳过此步骤。

技能加载后，按其指引创建精简版产物：
  - `proposal.md` — 变更动机 + 目标 + 范围
  - `design.md` — 简短实现说明（无需方案对比）
  - `tasks.md` — 不超过 3 个任务
- **无需 delta spec**（除非变更改变了已有 spec 的验收场景；一旦需要 delta spec，升级为完整 `/comet`）

在 `openspec/changes/<name>/.openspec.yaml` 中写入或合并 tweak 状态：

```yaml
comet:
  workflow: tweak
  phase: build
  design_doc: null
  plan: null
  build_mode: direct
  verify_mode: light
  verify_result: pending
  verified_at: null
  archived: false
```

### 2. 轻量构建（preset build）

使用 tweak 默认值：`build_mode: direct`。跳过 `superpowers:brainstorming` 和 `superpowers:writing-plans`。

**立即执行：** 按 tasks.md 逐个执行任务：

1. 读取 `openspec/changes/<name>/tasks.md`，获取未完成任务列表
2. 对每个未完成任务：
   - 根据任务描述修改目标文件
   - 运行 `mvn spotless:apply` 格式化
   - 运行相关测试确认通过
   - 将 tasks.md 中对应 `- [ ]` 勾选为 `- [x]`
   - 提交代码，commit message 格式：`tweak: <简述变更>`
3. 全部任务完成后进入验证

### 3. 轻量验证（preset verify）

复用 `/comet-verify`。Tweak 必须保持轻量验证条件：≤ 3 tasks、≤ 5 files、无 delta spec、无新 capability。

**立即执行：** 使用 Skill 工具加载 `comet-verify` 技能。禁止跳过此步骤。

如规模评估进入完整验证路径，停止 tweak，升级为完整 `/comet`。

验证通过后，按 `/comet-verify` 的规则将 `comet.verify_result` 记录为 `pass`，归档前不得跳过该状态。

### 4. 归档（preset archive）

复用 `/comet-archive`。归档前必须满足 `comet.verify_result: pass`。

**立即执行：** 使用 Skill 工具加载 `comet-archive` 技能进行归档。禁止跳过此步骤。

---

## 连续执行模式

<IMPORTANT>
Tweak 流程为 **一次性连续执行**。调用 `/comet-tweak` 后，agent 必须自动走完全部 4 个阶段，中间不停顿等待用户输入（除非遇到升级条件需要用户确认）。

执行顺序：快速开启 → 轻量构建 → 轻量验证 → 归档 → 完成

每个阶段完成后立即进入下一阶段，无需用户再次输入。阶段内部仍必须按上文要求调用对应 Comet/OpenSpec/Superpowers skill。
</IMPORTANT>

---

## 升级条件

执行过程中出现以下情况时，停止 tweak 流程，升级为完整 `/comet`：

1. 需要新增 capability
2. 需要架构调整
3. 需要接口变化
4. 影响范围扩大到 > 5 个文件
5. 任务数超过 3 个
6. 需要 delta spec

升级方式：在当前 change 基础上补充 Design Doc（执行 `/comet-design`），后续正常走完整流程。

---

## 退出条件

- 小改动已完成，测试通过
- change 已归档
- 未新增 capability、架构调整或接口变化
- **阶段守卫**：build → verify 前运行 `bash $COMET_GUARD <change-name> build`，verify → archive 前运行 `bash $COMET_GUARD <change-name> verify`
