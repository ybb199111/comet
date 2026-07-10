# Comet Classic 迁移设计

**日期：** 2026-06-14
**状态：** 已完成（2026-06-15 验收）
**范围：** Plan 2 - Classic Migration

## 1. 背景

Plan 1 已经提供最小 Skill Engine：

- Skill 包加载、校验与内容寻址快照；
- Run 状态、Trajectory、Context、Artifact、PendingWork 与 checkpoint；
- 确定性循环、guardrail 和 eval；
- 原子 Run 状态写入。

Comet 0.3.8 的经典流程仍由多个 shell 脚本直接解析和修改
`.comet.yaml`。完整流程、hotfix、tweak、handoff、guard、archive 和 hook
分别持有一部分状态机逻辑，存在以下问题：

- 状态机分散，难以证明行为一致；
- shell 同时承担解析、决策、持久化和用户输出；
- 旧字段与 Run 字段可能发生漂移；
- handoff 和 archive 的中断恢复缺少统一事务模型；
- 无法直接复用 Plan 1 的 Skill、Trajectory、Context、Artifact 和 eval。

Plan 2 的任务不是重新设计用户流程，而是把现有 Classic 行为迁移到
Skill Engine，同时保持用户面对的 Skill 数量、名称和命令不变。

## 2. 目标

1. 保留现有 `/comet`、`/comet-open`、`/comet-design`、`/comet-build`、
   `/comet-verify`、`/comet-archive`、`/comet-hotfix` 和 `/comet-tweak`。
2. 用一个内部 `comet-classic` Skill 描述经典流程的稳定步骤图。
3. 由 TypeScript Classic Resolver 统一决定当前步骤和下一步骤。
4. 任何经典入口都能静默、幂等地迁移 0.3.8 change。
5. 在兼容期内原子同步旧字段和 Run 字段。
6. 将 shell 脚本收敛为薄 facade，不再持有 YAML 解析或状态机规则。
7. 使用结构化 evidence、Trajectory 和 PendingWork 提升长程任务稳定性。
8. 用冻结的 0.3.8 参考实现、差分测试和 benchmark 证明兼容性。

## 3. 非目标

- 不改变用户的经典工作流交互方式。
- 不新增用户可见的 `comet-classic` 命令。
- 不删除 0.3.8 字段；字段移除属于后续独立迁移。
- 不实现 Plan 3 的手动编排作者体验。
- 不实现 Plan 4 的 `/comet-any` agentic Skill 组合。
- 不修改 Superpowers 或 OpenSpec 的原始 Skill。
- 不把 Classic 特有概念反向写进 Engine Core。

## 4. 核心原则

### 4.1 Engine Core 保持通用

Core 只增加一个可注入的确定性 resolver 边界。默认实现仍使用
`step.next`，因此 Plan 1 行为不变。Classic Resolver 位于 `src/compat/`，
Core 不导入 Classic 类型、字段或规则。

### 4.2 一个状态事实，两种兼容投影

迁移期内 `.comet.yaml` 同时包含：

- 0.3.8 旧字段；
- Plan 1 Run 字段；
- `classic_profile`；
- `classic_migration`。

所有写入先在内存中计算完整文档，再通过临时文件和 rename 一次提交。
不存在只更新旧字段或只更新 Run 字段的公共写入路径。

### 4.3 静默、幂等、失败关闭

每个经典入口先调用 `ensureClassicRun()`：

- 已迁移 change 直接复用原 run；
- 未迁移 change 自动创建 Run 投影；
- 重复调用不改变 YAML、不生成新 run、不重复写迁移事件；
- 状态缺失、矛盾或无法验证时停止执行，不猜测下一步。

### 4.4 用户命令面保持不变

`comet-classic` 是内部 Skill。manifest 新增 `internalSkills`：

- 安装、更新、doctor、卸载同时管理 `skills` 和 `internalSkills`；
- 用户命令生成只读取 `skills`；
- 因此用户可见 Skill 的数量和名字不变。

## 5. 总体架构

```text
现有用户入口 / shell facade / status / doctor
                         |
                         v
                 ensureClassicRun()
                         |
          +--------------+---------------+
          |                              |
          v                              v
  Classic State/Store            Classic Evidence
          |                              |
          +--------------+---------------+
                         v
                 Classic Resolver
                         |
                         v
              Plan 1 Skill Engine / Run Store
                         |
          +--------------+---------------+
          |              |               |
      Trajectory       Context        Artifact /
                                      PendingWork
```

新增模块：

```text
src/compat/
  classic-state.ts
  classic-store.ts
  classic-evidence.ts
  classic-resolver.ts
  classic-migrate.ts
  classic-guard.ts
  classic-handoff.ts
  classic-archive.ts
  classic-hook-guard.ts
  classic-cli.ts
  index.ts
```

## 6. 通用 Resolver 扩展点

新增 `src/engine/resolver.ts`：

```ts
export interface DeterministicResolver<TContext> {
  resolveStep(input: {
    pkg: LoadedSkillPackage;
    state: Readonly<RunState>;
    context: Readonly<TContext>;
  }): SkillStep | undefined;

  resolveNext(input: {
    pkg: LoadedSkillPackage;
    state: Readonly<RunState>;
    step: Readonly<SkillStep>;
    outcome: Readonly<ActionOutcome>;
    context: Readonly<TContext>;
  }): string | null;
}
```

Engine 提供：

- `staticDeterministicResolver`；
- `decideWithResolver()`；
- `recordOutcomeWithResolver()`。

原有 `decide()` 和 `recordOutcome()` 继续调用静态 resolver，保持向后兼容。
resolver 返回未知步骤时必须失败关闭。

Trajectory 使用通用事件名：

- `state_migrated`；
- `state_transitioned`；
- `recovery_reconciled`。

Classic 身份放在 `event.data.kind` 中，而不是增加 Core 专用事件类型。

## 7. Classic 状态模型

`classic-state.ts` 定义唯一的 YAML schema 和领域类型。所有 TypeScript
命令、doctor、status 和 runtime 共用该定义，禁止继续维护重复 key 白名单。

新增字段：

```yaml
skill: comet-classic
classic_profile: full | hotfix | tweak
classic_migration: 1
run_id: <stable-id>
skill_version: "1"
skill_hash: <sha256>
orchestration: deterministic
current_step: <stable-step-id>
iteration: <number>
run_status: running | waiting | completed | failed
```

旧字段全部保留并同步，包括 workflow、phase、构建配置、验证结果、
branch 状态、handoff、归档和时间字段。

YAML 必须通过结构化 parser 读取，禁止按行切分。非法 enum、矛盾投影和
格式错误均产生明确诊断。Hook、Status、Doctor 等严格入口拒绝未知字段；
legacy `validate` 为保持 0.3.8 输出合同，仍将未知字段报告为 warning。

## 8. 内部 `comet-classic` Skill

双语言包：

```text
assets/skills-zh/comet-classic/
  SKILL.md
  comet/
    skill.yaml
    guardrails.yaml
    evals.yaml

assets/skills/comet-classic/
  SKILL.md
  comet/
    skill.yaml
    guardrails.yaml
    evals.yaml
```

按仓库规则，先完成中文版本并由用户确认，再同步英文版本。

Skill 声明现有经典 Skill 为 capability：

- `comet-open`
- `comet-design`
- `comet-build`
- `comet-verify`
- `comet-archive`
- `comet-hotfix`
- `comet-tweak`

稳定步骤 ID：

```text
full.open
full.design.handoff
full.design.document
full.build.plan
full.build.plan-ready
full.build.configure
full.build.execute
full.build.complete
full.build.fix
full.verify.run
full.verify.branch
full.archive.confirm
full.archive.execute
completed
```

hotfix 和 tweak 使用同一命名规则定义对应子集。步骤 ID 是持久化协议，
发布后不能随提示词措辞任意变化。

Skill YAML 描述允许执行的 action、capability、guardrail 和 completion
eval；实际分支选择由 Classic Resolver 根据状态和 evidence 决定。

## 9. Classic Resolver

Resolver 是纯函数，不直接读取文件、执行命令或写状态。输入包括：

- 已校验的 Classic 状态；
- 已校验的 `comet-classic` Skill 包；
- 结构化 evidence；
- 当前 action outcome。

输出包括：

- 当前稳定步骤；
- 下一稳定步骤；
- 需要执行的 Classic action；
- 无法继续时的结构化错误。

Resolver 必须覆盖：

- full、hotfix、tweak 的正常路径；
- build 失败后的 fix/retry；
- verification 失败后的回退；
- handoff resume；
- archive pending/recovery；
- completed；
- 状态矛盾和证据缺失。

## 10. 结构化 Evidence

`classic-evidence.ts` 负责文件系统观察，返回数据而不是用户文案：

```ts
interface ClassicEvidence {
  code: string;
  satisfied: boolean;
  source?: string;
  detail?: string;
}
```

Evidence 至少覆盖：

- OpenSpec proposal/design/spec/tasks 是否存在且有效；
- Design Doc 和 implementation plan 是否存在；
- 设计与计划是否已确认；
- `tasks.md` 是否全部完成；
- build completion；
- verification report 和结果；
- branch 状态；
- handoff context/hash；
- PendingWork、Artifact 和 checkpoint；
- archive confirmation、pending marker 和恢复状态。

guard、resolver 和 benchmark 使用同一 evidence，不各自重复扫描规则。

## 11. 迁移算法

`ensureClassicRun(changeDir)`：

1. 读取并完整校验 `.comet.yaml`。
2. 如果已迁移，校验双投影一致性并返回现有 Run。
3. 根据 workflow 和旧字段推断 `classic_profile`。
4. 收集 evidence，由 Resolver 计算当前稳定步骤。
5. 加载并快照 `comet-classic` Skill。
6. 创建稳定 run ID 和 Run 存储目录。
7. 将 handoff 文本导入 Context。
8. 将 subagent 进度导入 Artifact/checkpoint。
9. 在内存中生成旧字段与 Run 字段的完整同步投影。
10. 原子写入 `.comet.yaml`。
11. 追加 `run_started` 和 `state_migrated`。

`state_migrated.data` 至少包含：

```json
{
  "kind": "classic",
  "migrationVersion": 1,
  "profile": "full",
  "source": "0.3.8"
}
```

迁移前任何失败都不能留下 run 目录、半写 YAML 或部分事件。迁移后的
重复调用必须无副作用。

## 12. Handoff 与长程任务

Classic handoff 映射为：

- handoff 文本：Context；
- 未完成工作：PendingWork；
- subagent 或阶段产物：Artifact；
- 可恢复进度：checkpoint hash；
- 旧 `handoff_context`、`handoff_hash`：兼容投影。

恢复时对账 PendingWork、Context、Artifact、checkpoint 和当前步骤。
已完成 handoff 的重复调用校验产物 hash 后直接返回；源文件变化导致
handoff hash 过期时失败关闭，不自动覆盖新状态。成功 handoff 将 Run 从
`full.design.handoff` 推进到 `full.design.document`。

## 13. Archive 事务与恢复

归档前先写 PendingWork，记录目标、源 change、预期步骤和操作状态。

流程：

1. 校验 archive confirmation 和 verification evidence；
2. 写 archive pending；
3. 执行 spec 同步与目录移动；
4. 更新旧字段和 Run 状态；
5. 写 Artifact/Trajectory；
6. 清除 pending。

进程中断后，下一入口检查 pending 和文件系统事实：

- 未执行：安全重试；
- 已部分执行：根据目录与 pending 事实继续补全；
- 已完成但未记账：补写状态和事件；
- 无法判定：停止并给出恢复诊断。

恢复完成写 `recovery_reconciled`，其中
`data.kind = "classic-archive"`。

## 14. Shell Facade 与 Runtime

保留现有脚本名和参数协议：

- `comet-state.sh`
- `comet-yaml-validate.sh`
- `comet-guard.sh`
- `comet-handoff.sh`
- `comet-archive.sh`
- `comet-hook-guard.sh`

脚本只负责：

1. 定位 `comet-env.sh`；
2. 组装 runtime 路径；
3. `exec node "$COMET_RUNTIME" <command> "$@"`。

禁止在 facade 中继续保留：

- YAML parser；
- key 白名单；
- enum 校验；
- transition table；
- hash/evidence 决策；
-状态写入；
- archive 恢复逻辑。

`src/compat/classic-cli.ts` 构建为单文件、自包含的 Node 20 ESM runtime：

```text
assets/skills/comet/scripts/comet-runtime.mjs
```

只生成这一份。Comet 安装器对所有语言均从 `assets/skills` 获取 `/scripts/`
资源，因此无需在中文资源树重复生成。

runtime 加入 manifest，并提供 stale check：重新构建结果必须与已提交文件
逐字节一致。

## 15. CLI、Status 与 Doctor

Classic runtime 提供内部子命令：

- `state`
- `validate`
- `guard`
- `handoff`
- `archive`
- `hook-guard`

shell facade 保持原 stdout、stderr 和退出码。

`status` 和 `doctor` 不再按行解析 YAML：

- status 先调用 `ensureClassicRun()`，再展示兼容 phase 和 Run step；
- doctor 复用 Classic schema，并通过迁移入口校验双投影与 Skill snapshot；
- 读取失败不进行修复性写入。

## 16. 兼容性验证

冻结 commit `367887e` 的 0.3.8 脚本到
`test/fixtures/classic-0.3.8/`，作为行为参考。

差分 harness 对同一 fixture 分别运行旧实现和新 facade，比较：

- 退出码；
- stdout/stderr；
- `.comet.yaml` 行为字段；
- 创建的文件；
- pending/recovery 状态；
- guard、handoff、archive 和 hook 结果。

仅归一化临时绝对路径、时间、生成 run ID 和受临时路径影响的 hash。
不得归一化业务状态或用户可见错误。

新增 deterministic Classic benchmark，指标：

- transition accuracy；
- migration success rate；
- idempotency rate；
- contract match rate；
- duration。

前四项必须为 `1.0`，duration 只记录，不设置不稳定的机器阈值。
当前基线包含 7 个本地 fixture：full、hotfix、tweak、retry/fix、
handoff resume、archive recovery 和 malformed-state rejection；不调用
LLM、网络或真实 OpenSpec。

## 17. 失败模型

| 场景 | 行为 |
|---|---|
| YAML 格式错误 | 报错并保持文件不变 |
| 未知字段 | strict 入口失败关闭；legacy validate 保持 warning 合同 |
| 非法 enum | 失败关闭 |
| 旧字段与 Run 字段矛盾 | 报告 divergence，不猜测 |
| Skill snapshot 不存在或 hash 不符 | 停止执行 |
| Resolver 返回未知步骤 | Engine 拒绝 |
| handoff hash 过期 | 拒绝恢复 |
| archive 中断 | 通过 PendingWork 对账 |
| 原子 rename 失败 | 保留原文件并清理临时文件 |
| 重复迁移 | 返回原 Run，无新增事件 |

## 18. 发布与版本

Plan 1 分支已经是 `0.4.0`。完成实现时重新检查 master：

- master 仍为 `0.3.8`：继续追加同一个 `0.4.0` Changelog；
- master 已升级：本分支版本只能比 master 大一个版本；
- 中英文 Skill 完全同步后再写 Changelog。

Changelog 聚焦行为变化：

- 新增内部 Classic Skill 和 resolver；
- Classic 命令迁移到原子双投影；
- handoff/archive 支持恢复；
- 增加 0.3.8 差分测试和 benchmark。

## 19. 验收标准

1. 用户可见 Skill 数量、名字和入口命令不变。
2. 0.3.8 的 full/hotfix/tweak change 可从任意经典入口自动迁移。
3. 重复迁移完全幂等。
4. 旧字段与 Run 字段无法通过公共路径单独更新。
5. 所有 Classic 决策集中于 TypeScript schema、evidence 和 resolver。
6. shell 脚本不再包含状态机或 YAML 解析。
7. handoff 和 archive 中断可以确定性恢复或失败关闭。
8. 冻结差分合同全部通过。
9. Classic benchmark 的四项确定性比率均为 `1.0`。
10. `format:check`、lint、build、全量测试通过。
11. 未修改原始 Superpowers/OpenSpec Skill。
12. 未经用户明确同意，不创建 PR 或在 GitHub 评论。
