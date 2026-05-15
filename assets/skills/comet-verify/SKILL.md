---
name: comet-verify
description: "Comet 阶段 4：验证与收尾。用 /comet-verify 调用。验证实现符合设计，处理开发分支。"
---

# Comet 阶段 4：验证与收尾（Verify）

## 前置条件

- 代码已提交（阶段 3 完成）
- tasks.md 全部任务已完成

## 步骤

### 1. 改动规模评估

根据以下指标判定改动规模：

| 指标 | 小（轻量验证） | 大（完整验证） |
|------|---------------|---------------|
| tasks.md 任务数 | ≤ 3 | > 3 |
| 变更文件数（git diff --stat） | ≤ 5 | > 5 |
| 是否有 delta spec | 无 | 有 |
| 是否新增 capability | 否 | 是 |

**判定规则**：任一指标命中"大" → 完整验证。全部命中"小" → 轻量验证。

判定完成后，在 `openspec/changes/<name>/.openspec.yaml` 中记录实际验证模式。`verify_mode` 只允许以下值之一：

- `light`
- `full`

Few-shot 示例：

```yaml
# 全部指标命中“小”
comet:
  phase: verify
  verify_mode: light
  verify_result: pending
```

```yaml
# 任一指标命中“大”
comet:
  phase: verify
  verify_mode: full
  verify_result: pending
```

### 2a. 轻量验证（小改动）

当规模评估结果为"小"时，跳过 `openspec-verify-change`，直接执行以下检查：

1. tasks.md 全部任务已完成 `[x]`
2. 改动文件与 tasks.md 描述一致（`git diff --stat` 对照 tasks 内容）
3. 编译通过（Maven 项目先执行 `mvn spotless:apply`，再执行 `mvn compile` 或等效命令）
4. 相关测试通过
5. 无明显安全问题（无硬编码密钥、无新增 unsafe 操作）

**通过标准**：5 项全部 OK，无 CRITICAL 问题。

**报告格式**：简表列出 5 项检查结果 + PASS/FAIL。

**跳过项**（不在轻量验证中检查）：
- spec scenario 覆盖率
- design doc 一致性深度比对
- code pattern consistency 建议
- delta spec 与 design doc 漂移检测

### 2b. 完整验证（大改动）

当规模评估结果为"大"时：

**立即执行：** 使用 Skill 工具加载 `openspec-verify-change` 技能。禁止跳过此步骤。

技能加载后，按其指引验证。检查项：
1. tasks.md 全部任务已完成（`[x]`）
2. 实现符合 design.md 设计决策
3. 实现符合 brainstorming 设计文档
4. 能力规格场景全部通过
5. proposal.md 目标已满足
6. delta spec 与 design doc 无矛盾（若 Build 阶段有增量修改 spec，检查 design doc 是否有对应记录）
7. `docs/superpowers/specs/` 关联的设计文档可定位（文件存在且与当前 change 相关）

验证不通过时：报告缺失项，返回阶段 3 补充（调用 `/comet-build`）。

**Spec 漂移处理**：
- 若检查项 6 发现矛盾（delta spec 有内容但 design doc 未体现），提示用户：
  - 选项 A：在 design doc 追加 "Implementation Divergence" 节记录偏差原因
  - 选项 B：回退到 Build 阶段，补充 brainstorming 更新 design doc
  - 选项 C：确认偏差可接受，继续验证（归档时 design doc 将标记为 `superseded-by-main-spec`）

### 3. 收尾（Superpowers）

**立即执行：** 使用 Skill 工具加载 `superpowers:finishing-a-development-branch` 技能。禁止跳过此步骤。

如 `superpowers:finishing-a-development-branch` 不可用，停止流程并提示安装或启用 Superpowers 技能，不要用普通对话替代该步骤。

技能加载后，按其指引收尾。分支处理选项：
1. 本地合并到主分支
2. 推送并创建 PR
3. 保持分支（稍后处理）
4. 丢弃工作

**确认项**：
- Maven 测试或构建命令前已执行 `mvn spotless:apply`
- 全部测试通过
- 无遗留的 spotless 格式问题
- 无硬编码密钥或安全问题

## 退出条件

- 验证报告通过
- 分支已处理
- `.openspec.yaml` 中 `comet.verify_result` 已记录为 `pass`
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> verify`，全部 PASS 后才允许流转

退出前合并更新：

```yaml
comet:
  phase: archive
  verify_result: pass
  verified_at: YYYY-MM-DD
```

## 自动流转

退出条件满足后，**无需等待用户再次输入**，直接执行下一阶段：

> **REQUIRED NEXT SKILL:** 调用 `comet-archive` skill 进入归档阶段。
