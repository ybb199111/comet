---
name: comet-open
description: "Comet 阶段 1：开启。用 /comet-open 调用。通过 OpenSpec 探索想法、创建 change 结构（proposal + design + tasks）。"
---

# Comet 阶段 1：开启（Open）

## 前置条件

- 无活跃 change，或用户希望创建新 change

## 步骤

### 1. 探索想法

**立即执行：** 使用 Skill 工具加载 `openspec-explore` 技能。禁止跳过此步骤。

技能加载后，按其指引自由探索问题空间。

### 2. 创建 Change 结构

**立即执行：** 使用 Skill 工具加载 `openspec-new-change` 技能（或 `openspec-propose` 如需先提建议）。

确认以下产物已创建：

```
openspec/changes/<name>/
├── .openspec.yaml
├── proposal.md       # Why + What：问题、目标、范围
├── design.md         # How（高层）：架构决策、方案选型
└── tasks.md          # 任务清单（勾选框）
```

### 2b. 增量修改已有 Capability（可选）

**触发条件**：proposal.md 中提到修改已有 capability，或用户明确要求增量修改。

**适用场景**：对已归档功能做增量修改（而非全新 capability）。

当 proposal.md 目标涉及修改已有 capability 时：
1. 查找 `openspec/specs/<capability>/spec.md` 是否已存在主 spec
2. 如已存在，将主 spec 复制为 delta spec 基线：

```bash
mkdir -p openspec/changes/<name>/specs/<capability>/
cp openspec/specs/<capability>/spec.md openspec/changes/<name>/specs/<capability>/spec.md
```

3. 在复制的 delta spec 中，按 delta 格式组织变更（`## ADDED`、`## MODIFIED`、`## REMOVED`）
4. 在 proposal.md 中注明 `基于已有 capability: <capability-name>` 

**好处**：避免从零编写 delta spec，确保增量修改有完整上下文。

### 3. 初始化 Comet 状态

在 `openspec/changes/<name>/.openspec.yaml` 中写入或合并以下元数据：

```yaml
comet:
  workflow: full
  phase: design
  design_doc: null
  plan: null
  build_mode: null
  verify_mode: null
  verify_result: pending
  verified_at: null
  archived: false
```

### 4. 内容完整性检查

确认三个文档内容完整：
- **proposal.md**：问题背景、目标、范围、非目标
- **design.md**：高层架构决策、方案选型、数据流
- **tasks.md**：任务列表，每个任务有明确描述

## 退出条件

- proposal.md、design.md、tasks.md 均已创建且内容完整
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> open`，全部 PASS 后才允许流转

## 自动流转

退出条件满足后，**无需等待用户再次输入**，直接执行下一阶段：

> **REQUIRED NEXT SKILL:** 调用 `comet-design` skill 进入深度设计阶段。
