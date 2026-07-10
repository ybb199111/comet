# Comet Manual Skill Authoring 设计

**日期：** 2026-06-15
**状态：** 已完成
**范围：** Plan 3 - Manual Authoring

## 1. 目标

Plan 3 让高级用户可以把普通 Skill 目录扩展为 Comet Skill Package，并通过 CLI
完成发现、安装、校验、检查、启动、恢复和运行期评估。

本阶段交付：

- `comet skill install`
- `comet skill validate`
- `comet skill inspect`
- `comet skill run`
- `comet skill resume`
- `comet skill eval`
- 内置 Skill 与项目 `.comet/skills/` 的发现和覆盖规则
- Run 启动快照、从快照恢复、显式升级和兼容检查

## 2. 非目标

- 不实现 `/comet-any`、`.comet/skills.txt` 或 Agentic Skill 生成。
- 不实现创建期 benchmark、grader、人工 review 或 `ready` 发布门。
- 不让 CLI 猜测或模拟平台上的 Skill、MCP、Agent 或 function tool 执行。
- 不新增第二份 Run 状态文件。
- 不修改 Superpowers 或 OpenSpec 的原始 Skill。
- 不开放任意内联 shell。

## 3. Skill 选择与发现

命令的 `<skill>` 参数既可以是目录路径，也可以是 Skill 名。

解析顺序：

1. 参数解析为现有目录时，按显式路径加载。
2. `<project>/.comet/skills/<name>`。
3. Comet 内置 `assets/skills/<name>`。

项目 Skill 可以按名称覆盖内置 Skill。覆盖项存在但无效时失败关闭，不回退到同名内置
Skill，避免用户以为正在运行项目版本，实际却静默运行内置版本。

发现结果记录：

- `name`
- `origin`: `explicit | project | builtin`
- `root`
- `version`
- `hash`

## 4. 项目安装

`comet skill install <path> [--project <dir>] [--overwrite]`：

1. 加载并校验源 Skill。
2. 拒绝源目录中的符号链接。
3. 原子复制到 `<project>/.comet/skills/<metadata.name>`。
4. 目标已存在时默认失败；只有 `--overwrite` 才替换。
5. 替换时先发布到临时目录，再 rename，避免半安装状态。

安装不改变平台级 Skill 目录。平台分发仍由现有 `comet init/update` 管理。

## 5. CLI 输出契约

所有子命令支持 `--json`。JSON 模式输出一个完整 JSON 文档，不混入进度日志。

### 5.1 validate

`comet skill validate <skill> [--project <dir>]`

- 加载结构化 YAML。
- 执行语义校验和路径安全检查。
- 成功返回 Skill 来源、版本和 hash。
- 失败列出全部可收集的语义错误；结构错误直接报告文件和字段路径。

### 5.2 inspect

`comet skill inspect <skill> [--project <dir>]`

输出来源、Goal、Orchestration、步骤、依赖、Agents、Tools、Guardrails、Runtime Evals
和稳定 hash。inspect 只读，不创建快照或 Run。

### 5.3 run

`comet skill run <skill> --change <dir> [--project <dir>]`

1. 解析、加载并校验 Skill。
2. 在 change 中创建内容寻址快照。
3. 创建 Run 并写入 `.comet.yaml`。
4. 追加 `run_started`。
5. 对 deterministic Skill 产生第一个 pending action，写入 pending 文件和 Trajectory。
6. 输出当前 Run 与 action。

Plan 3 的 adaptive Skill 可以 validate/inspect，但 `run` 失败关闭，提示 adaptive 候选动作
由 Plan 4 的 Agentic Runtime 提供。

### 5.4 resume

`comet skill resume --change <dir>`

- 没有 outcome 参数时，读取快照并返回当前 pending action；没有 pending 时产生下一动作。
- 使用 `--status succeeded|failed --summary <text>` 提交当前 pending action 的 outcome。
- `--artifact key=path` 合并 Artifacts。
- `--state key=value` 记录 outcome 的状态证据。
- outcome 写入后清除 pending，运行步骤/完成 Evals，再产生下一动作。

CLI 不直接执行 `invoke_skill`、`call_tool`、`handoff` 或 `ask_user`。当前 Agent 或平台
Runtime 执行动作，再把可审计 outcome 提交给 `resume`。

### 5.5 eval

`comet skill eval --change <dir> [--scope progress|step|completion]`

从 Run 固定的 Skill 快照读取 Runtime Evals，对当前 State 和 Artifacts 求值并输出证据。
这是运行期 Eval；创建期 Skill Eval Provider 属于 Plan 4。

## 6. 快照恢复

Run 恢复必须只依赖 `.comet.yaml` 中的 `skill_hash` 和
`.comet/skill-snapshots/<hash>/package.json`，不得重新加载已变化的源 Skill。

Snapshot reader：

- 校验目录名、`sha256` 文件和 package 文档一致。
- 恢复 `SkillPackage`。
- 将 snapshot 目录作为 package root，使脚本 Tool 继续受目录边界约束。

## 7. 显式升级

`comet skill resume --change <dir> --upgrade <skill>`：

- 只能在没有 pending action 时升级。
- 新旧 `metadata.name` 必须一致。
- Orchestration mode 必须一致。
- deterministic Run 的当前步骤必须存在于新 Skill。
- 新包必须通过完整校验并生成新快照。
- hash 未变化时返回 no-op。
- 成功后原子更新 `skill_version` 和 `skill_hash`，追加 `state_migrated` 事件，其中
  `data.kind = "manual-skill-upgrade"`。

升级不自动重写当前步骤、迭代、Artifacts 或历史 Trajectory。

## 8. 状态和事务顺序

启动：

1. 发布 Skill snapshot。
2. 写初始 Run State。
3. 追加 `run_started`。
4. 产生 action。
5. 写 pending action。
6. 写 waiting State。
7. 追加 `action_proposed`。

恢复 outcome：

1. 校验 pending action 与 outcome。
2. 合并 Artifacts。
3. 追加 `action_completed`。
4. 计算下一 State。
5. 清除 pending 文件。
6. 写 State。
7. 运行并记录 Evals。
8. 产生下一 action。

重复提交已经完成的 action 必须失败关闭，不得重复推进。

## 9. 安全边界

- 所有 Run 引用继续限制在 change 目录内。
- 项目安装拒绝符号链接和目标逃逸。
- script Tool 继续由 snapshot 的 realpath 边界校验保护。
- 项目覆盖不允许静默回退。
- source Skill 的后续修改不能改变正在运行的 Run。
- `resume` 只接受当前 pending action 的 outcome。

## 10. 验收标准

1. 六个 `comet skill` 子命令均提供文本和 JSON 输出。
2. 显式路径、项目 Skill、内置 Skill 的发现顺序有测试覆盖。
3. 项目同名覆盖无效时失败关闭。
4. 项目安装原子、默认不覆盖并拒绝符号链接。
5. validate/inspect 不修改文件。
6. deterministic Skill 可启动、提交 outcome、恢复并完成。
7. 恢复使用固定 snapshot，不跟随源 Skill 修改。
8. 显式升级执行名称、模式、步骤和 pending 兼容检查。
9. Runtime Evals 输出可审计证据。
10. adaptive run 在 Plan 3 中给出明确不支持诊断。
11. Classic workflow 合同和 benchmark 不回归。
12. format、lint、build 和全量测试通过。
