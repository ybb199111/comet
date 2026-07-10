# Comet Skill Engine Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用分阶段、可验证的方式把 Comet 0.3.8 演进为同时支持确定性编排和 Agentic 编排的 Comet Skill Engine。

**Architecture:** 以 Comet Skill 为唯一组合单元，以 `.comet.yaml` 为唯一状态真相源；每次执行产生持久化 Run，包含 State、Trajectory、Context、Artifacts 与 Checkpoints。Skills、Agents、Tools 保持不同职责，通过 Runtime Adapter 执行，并由 Guardrails 与 Evals 约束。

**Tech Stack:** TypeScript ESM、Node.js 20+、Commander、YAML、Vitest、现有跨平台 shell 兼容层。

---

## 设计来源

实施前必须阅读：

- `docs/superpowers/specs/2026-06-01-comet-orchestration-engine-design.md`

旧计划中的以下方案已废弃，不得实现：

- 独立 `.comet.flow.yaml`
- 面向用户的 `*.flow.yaml` 产品模型
- 把 Skill、Tool、MCP、subagent、script 统一成 Capability
- 允许定义内联任意 shell 条件
- 先写一套新状态机，再在后续迁移 classic

## 为什么拆成四份计划

批准的设计包含四个可独立验证的子系统。一次性锁定全部实现会让 `/comet-any` 和 Eval
Provider 依赖尚未经过 classic 迁移验证的接口，因此按以下顺序实施：

1. **Engine Foundation**：领域模型、Skill Package、Run 持久化、循环、Guardrails、
   Runtime Evals 与 Runtime Adapter 契约。
2. **Classic Migration**：固化 0.3.8 契约、自动迁移旧 change、shell 门面转发、内置
   `comet-classic` Skill 和 baseline benchmark。
3. **Manual Authoring**：`comet skill validate/inspect/run/resume/eval`、项目 Skill
   发现、快照与安装。
4. **`/comet-any`**：`.comet/skills.txt`、候选 Skill 实现探索、交互澄清、生成、
   Eval Provider、人工评审与 ready 发布门。

每阶段都必须产生可测试的软件，并在下一阶段计划编写前重新核对真实接口。

## Plan 1：Engine Foundation

详细执行计划：

- `docs/superpowers/plans/2026-06-13-comet-skill-engine-foundation.md`

完成门：

- Skill Package 可加载、校验和生成稳定 hash。
- `.comet.yaml` 可保存新 Run 投影，同时完整保留 0.3.8 字段。
- Trajectory、Context、Artifacts、Checkpoint 可原子持久化和恢复。
- deterministic 与 adaptive 使用同一循环和动作协议。
- Guardrails 能拒绝未授权 Skill/Tool、超预算动作和缺失确认。
- Runtime Evals 能给出带证据的进展/完成结论。
- 尚不改变用户现有 classic 行为。

## Plan 2：Classic Migration

在 Plan 1 合并且接口稳定后新建：

- `docs/superpowers/plans/2026-06-13-comet-classic-migration.md`

必须覆盖：

- 0.3.8 full/hotfix/tweak 契约测试。
- 旧 `.comet.yaml` 自动、幂等迁移。
- `comet-state.sh`、guard、handoff、archive 改为 TS 引擎兼容门面。
- Context Snapshot 兼容现有 `handoff_context/handoff_hash`。
- plan-ready、auto-transition、verify-fail、branch handling、archive confirm、
  context recovery、delegated agent checkpoint 全量保留。
- classic baseline benchmark。

## Plan 3：Manual Authoring（已完成）

详细执行计划：

- `docs/superpowers/plans/2026-06-15-comet-skill-authoring.md`

必须覆盖：

- `comet skill validate`
- `comet skill inspect`
- `comet skill run`
- `comet skill resume`
- `comet skill eval`
- 内置 Skill 与项目 `.comet/skills/` 的发现和覆盖规则。
- Skill 快照、显式升级与兼容检查。

## Plan 4：`/comet-any`（已完成）

详细执行计划：

- `docs/superpowers/plans/2026-06-15-comet-any.md`

实现必须通过 `pnpm benchmark:bundle`，证明 Bundle compiler 在全部已注册平台上保持当前
Comet 的 Skill、rule、hook、reference 与目标路径合同。

必须覆盖：

- `.comet/skills.txt` 一行一个偏好 Skill 名。
- 缺失 Skill 和同名多来源的交互消歧。
- 读取候选 Skill 实现，而不是按名称猜测。
- 交互澄清、draft 生成、静态校验、安全检查。
- 原生 skill-creator 优先、Comet fallback 的 Eval Provider。
- benchmark、grader、人工评审、迭代优化。
- `draft -> eval -> review -> ready` 发布门。

## 跨阶段规则

- `.comet.yaml` 始终是唯一状态真相源。
- Checkpoint 只记录一致性边界和 hash，不复制可独立修改的 State。
- Memory 仅表示可选的跨 Run 长期记忆，首版不实现 Memory Provider。
- MCP 是 Tool 的来源/协议，不与 Tool 平级成为编排节点。
- subagent 是 Agent 间关系；Agent Team 由 Agents 与 Orchestration 表达。
- 只有 Comet 需要编排、授权、快照、平台映射、审计或评估的依赖才进入 Skill Spec。
- 不直接修改 Superpowers 或 OpenSpec 原始 Skill。
- Skill 内容变更必须中文先行、用户确认后同步英文。
- 每阶段代码变更都更新同一个高于 master 的 Changelog 版本，除非 master 已前进。

## 版本策略

当前 master 基线为 `0.3.8`。Plan 1 首次引入引擎代码时将版本提升为 `0.4.0`；Plan 2-4
若仍基于 master `0.3.8`，继续追加 `0.4.0` Changelog，不重复提升版本。若实施期间
master 版本变化，执行者必须先重新读取 master 的 `package.json` 再按仓库规则调整。
