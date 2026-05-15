---
name: comet-archive
description: "Comet 阶段 5：归档。用 /comet-archive 调用。同步 delta spec 到主 spec，归档 change。"
---

# Comet 阶段 5：归档（Archive）

## 前置条件

- 验证已通过（阶段 4 完成）
- 分支已处理
- `openspec/changes/<name>/.openspec.yaml` 中 `comet.verify_result: pass`

## 步骤

### 1. 执行归档

归档前如 `comet.verify_result` 不是 `pass`，停止归档并返回 `/comet-verify`。

**立即执行：** 使用 Skill 工具加载 `openspec-archive-change` 技能。禁止跳过此步骤。

技能加载后，按其指引归档。自动检查：
1. artifact 完成状态（proposal、design、specs、tasks）
2. 所有任务已标记 `[x]`
3. delta specs 同步状态

### 2. Delta Spec 同步

归档时将 delta specs 同步到主 specs：

```
openspec/changes/<name>/specs/<capability>/spec.md
       ↓ 同步
openspec/specs/<capability>/spec.md  ← 主 spec（持久化）
```

### 3. Design Doc & Plan 处理

归档时同步处理 `docs/superpowers/` 下的关联文件。若目标文件已有 YAML frontmatter，将归档字段合并到现有 frontmatter；若没有 frontmatter，才新建一组 frontmatter。

**3a. Design Doc 一致性标注**

查找 `docs/superpowers/specs/` 中与当前 change 关联的设计文档：
- 对比 delta spec 最终版与 design doc 内容
- 如有偏差（实施过程中 spec 发生了增量修改），在 design doc 的 YAML frontmatter 中设置以下元数据：

```yaml
---
archived-with: YYYY-MM-DD-<name>
status: superseded-by-main-spec
implementation-notes: |
  <简述实施过程中偏离原设计的关键变化>
---
```

- 如完全一致，仅设置：

```yaml
---
archived-with: YYYY-MM-DD-<name>
status: final
---
```

**3b. Plan 关联标注**

查找 `docs/superpowers/plans/` 中与当前 change 关联的实施计划，在 YAML frontmatter 中设置相同的 `archived-with` 元数据。

### 4. 归档目录

change 移入归档目录：

```
openspec/changes/archive/YYYY-MM-DD-<name>/
├── .openspec.yaml
├── proposal.md
├── design.md
├── specs/<capability>/spec.md
└── tasks.md
```

### 5. 生命周期闭环

Spec 生命周期在此完成：
```
brainstorming → delta spec → 实施（增量修改）→ 验证 → 主 spec 同步 → design doc 标注 → 归档
```

## 退出条件

- change 已归档（从活跃列表移除）
- 主 specs 已更新（delta → main 同步完成）
- 关联 design doc 已标注归档状态
- 关联 plan 已标注归档状态
- `.openspec.yaml` 中 `comet.archived` 已记录为 `true`
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> archive`，全部 PASS 后确认归档完整

归档完成后，在归档目录的 `.openspec.yaml` 中合并更新：

```yaml
comet:
  phase: archive
  archived: true
```

## 完成

Comet 流程全部完成。如需开始新工作，调用 `/comet` 或 `/comet-open`。
