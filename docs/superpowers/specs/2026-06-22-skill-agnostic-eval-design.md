# Skill Agnostic Eval 设计

**日期：** 2026-06-22
**状态：** 已完成主体实现（当前代码已支持 Skill-agnostic profile、manifest、interaction 配置、source/hash metadata 与 local/LangSmith 共享 pytest runner）
**范围：** 将 Comet eval 从 Comet 专用 benchmark 扩展为可评估任意 Skill 的共享评估框架

## 1. 背景

当前 `eval/` 已经能比较 Comet skill 的不同 treatment，并通过 pytest、Docker、Claude Code
和本地验证脚本生成实验日志。LangSmith suite 也已经复用 local 的 pytest runner，只在
`conftest.py` 中切换 tracing、日志目录和环境变量。

这个结构适合继续演进，但当前语义仍强绑定 Comet：

- treatment 目录只加载 `common` 和 `comet` 分类。
- Skill 来源默认是 `eval/local/skills/benchmarks` 或 `eval/local/skills/main`。
- 多轮模拟用户只在 pytest node id 包含 `comet` 时启用。
- 测试结束后固定追加 `comet_rubric_validator`，rubric 内容绑定 Comet 五阶段流程。
- 报告中的关键指标默认围绕 Comet phase、OpenSpec artifact、guard、archive、state recovery。

随着 `/comet-any` 产出越来越多类似 Comet 的 Skill，Eval 需要成为 Skill 质量闭环的一部分。
用户不应该只能评估 Comet 本身，也不应该为了评估一个新 Skill 手写一整套 pytest suite。

本设计目标是把 `eval/` 抽成 **skill-agnostic eval core**：Comet 继续作为一个强 profile
被支持，同时任意本地 Skill、`/comet-any` 产物和未来 registry Skill 都能通过同一套
pytest runner 在 local 和 LangSmith 下执行。

## 2. 目标

- 支持评估任意 Skill，而不要求 Skill 位于 Comet benchmark 目录。
- 保留现有 Comet eval 的行为、task corpus、rubric 和比较报告能力。
- local 和 LangSmith 继续共用同一套 pytest task runner。
- 允许 `/comet-any` 产出的 Skill 携带 eval manifest，用户可直接执行推荐评估。
- 将多轮模拟用户从 Comet 专用启发式改成 profile/task/manifest 可配置能力。
- 引入通用 `generic` profile，能评估任意 Skill 的基础表现。
- 将 Comet 专属评分保留为 `comet-workflow` profile，而不是默认全局行为。
- 记录 Skill 来源、hash、profile、task、interaction 配置和验证结果，方便复现与比较。
- 为未来迁移到更完整的 LangSmith 数据集和 evaluator 模型保留 pytest 兼容路径。

## 3. 非目标

- 不重写 pytest runner，也不引入 local 和 LangSmith 两套独立执行逻辑。
- 不要求第一版支持所有平台的在线 registry 或远程 Skill 下载。
- 不让 eval runner 自己创建 Skill。Skill 创作仍由 `/comet-any`、CLI 或用户提供的路径完成。
- 不把 Comet 五阶段 rubric 强行套到所有 Skill。
- 不让自然语言 judge 结果成为唯一发布门。规则验证和 artifact evidence 仍是基础。
- 不在未获用户明确选择时自动执行高成本 eval 或 LangSmith tracing。
- 不改变现有 Comet benchmark treatment 的语义和默认对比方式。

## 4. 核心决策

- pytest runner 是唯一执行入口。local 和 LangSmith 都通过 pytest 运行同一套 task/treatment
  组合，LangSmith 只增加 tracing 和报告目录。
- shared scaffold 是抽象边界。Skill 解析、profile 选择、interaction driver、rubric 分发、
  结果归一化都应在 `eval/scaffold/python/` 中实现。
- Comet eval 变成一个 profile。`comet_rubric_validator` 不再被所有 task 固定追加，而是由
  `evaluation.profile = "comet-workflow"` 或 treatment/CLI override 触发。
- 任意 Skill eval 默认走 `generic` profile。它只要求可验证任务完成、目标 Skill 被调用、
  产物存在、成本可记录、行为未明显违反约束。
- Skill 来源用结构化 `SkillSource` 描述，不再只依赖 benchmark skill 目录。
- `/comet-any` 产物通过 eval manifest 接入，而不是要求用户理解 treatment YAML。
- 多轮 user simulator 是 `InteractionConfig`，由 task/profile/manifest/CLI 决定是否启用，
  simulator prompt 也应可配置。
- 结果必须包含 target Skill 的来源和 hash。评估结果不能只说 treatment 名称，否则无法追踪
  用户本地 Skill 的版本。

## 5. 当前绑定点

需要改造的现有绑定点：

- `eval/scaffold/python/treatments.py`
  - `TREATMENT_CATEGORIES = {"common", "comet"}` 限制了可发现 treatment 分类。
  - `_build_skill_config()` 假设 base 为 `benchmarks` 或 `main`。
  - treatment YAML 无法表达本地绝对路径、bundle manifest 或 eval manifest。
- `eval/local/tests/conftest.py`
  - `use_loop = "comet" in node_id.lower()` 将多轮 driver 绑定到 task 名称。
  - CLI options 只有 task、treatment、count，缺少 skill/profile/manifest override。
- `eval/local/tests/tasks/test_tasks.py`
  - 固定导入并追加 `comet_rubric_validator`。
  - 结果 metadata 只记录 treatment，不记录 Skill source/hash/profile。
- `eval/scaffold/shell/run-claude-loop.sh`
  - simulator prompt 固定为 Comet workflow 用户。
  - decision point detection 是通用英文启发式，但没有 task/profile 配置。
- `eval/scaffold/python/validation/rubric.py`
  - rubric 文件和函数名都绑定 Comet。
  - 评分维度依赖 OpenSpec、Comet phase、guard、archive 和 `.comet.yaml`。

这些都可以通过增加共享契约来改造，不需要推翻当前 eval tree。

## 6. 概念模型

```text
Eval Suite
  |
  +--> TaskContract
  |       +--> instruction.md
  |       +--> task.toml
  |       +--> environment/
  |       +--> validation/
  |       +--> evaluation profile + interaction hints
  |
  +--> EvalTarget
  |       +--> SkillSource
  |       +--> Skill hash
  |       +--> optional eval manifest
  |
  +--> EvalProfile
  |       +--> prompt policy
  |       +--> interaction mode
  |       +--> validators
  |       +--> rubric dimensions
  |
  +--> Pytest Runner
          +--> setup skill context
          +--> run Claude Code once or with user simulator
          +--> parse events
          +--> run task validators
          +--> run profile rubric
          +--> write local or LangSmith-compatible result metadata
```

### 6.1 SkillSource

`SkillSource` 描述被评估 Skill 从哪里来、如何复制到测试环境、如何记录版本。

概念接口：

```python
@dataclass
class SkillSource:
    name: str
    source_type: str  # benchmark | main | path | bundle | manifest | content
    path: Path | None
    content: str | None
    scripts_dir: Path | None
    script_filter: str | None
    hash: str
    metadata: dict[str, Any]
```

第一版支持：

- `benchmark`：现有 `eval/local/skills/benchmarks/<skill>`。
- `main`：现有 `eval/local/skills/main/<skill>`。
- `path`：用户传入的本地 Skill 目录或 `SKILL.md`。
- `content`：现有 treatment inline content。
- `manifest`：读取 `/comet-any` 产物的 eval manifest，再解析其中的 Skill 路径。

后续可扩展：

- `bundle`：直接读取 `.comet/bundles/<name>` 或 bundle draft。
- `registry`：从远程或本地 registry 解析。
- `find-skill`：按用户偏好名在本地平台目录查找真实 Skill。

### 6.2 EvalTarget

`EvalTarget` 是一次评估的目标，比 treatment 更接近用户视角。

```python
@dataclass
class EvalTarget:
    name: str
    description: str
    skills: dict[str, SkillSource]
    claude_md: str | None
    profile: str | None
    manifest_path: Path | None
```

现有 treatment 可以被转换为 `EvalTarget`，从而保持兼容。命令行传入 `--skill-path` 时，
runner 动态创建一个临时 `EvalTarget`。

### 6.3 EvalProfile

`EvalProfile` 描述“如何评价这个 Skill”。profile 是 Comet eval 变通用的核心。

第一版 profile：

- `generic`
  - 面向任意 Skill。
  - 评分重点是任务完成、目标 Skill 调用、产物存在、约束遵守、成本效率。
- `comet-workflow`
  - 保留现有 Comet 五阶段和 OpenSpec 相关评分。
  - 只在 Comet treatment、Comet task 或显式配置下启用。
- `authoring-skill`
  - 面向 `/comet-any` 产出的 Skill creator/factory 类 Skill。
  - 第一版可以作为 `generic` 的别名加额外 artifact 检查，后续再强化。

概念接口：

```python
@dataclass
class EvalProfile:
    name: str
    default_interaction: InteractionConfig
    rubric: Callable[[Path, dict[str, Any]], tuple[list[str], list[str]]]
    result_metadata: dict[str, Any]
```

### 6.4 TaskContract

现有 `task.toml` 已经表达 metadata、environment、validation 和 setup。需要增加
`[evaluation]` 与 `[interaction]` 两段。

示例：

```toml
[metadata]
name = "generic-small-change"
description = "Implement a small code change using a target skill."
default_treatments = ["CONTROL"]

[evaluation]
profile = "generic"
required_skills = ["target"]
expected_artifacts = ["CHANGELOG.md"]
completion_weight = 2.0
skill_invocation_weight = 1.0

[interaction]
mode = "auto_user"
max_turns = 8
simulator_prompt = "You are a concise developer user. Approve reasonable plans and choose defaults unless the request is ambiguous."
```

`[evaluation]` 只描述任务和评分契约，不描述具体 Skill 来源。具体 Skill 来源来自 treatment、
CLI 或 manifest。

### 6.5 InteractionConfig

`InteractionConfig` 控制是否使用多轮模拟用户。

```python
@dataclass
class InteractionConfig:
    mode: str  # none | auto_user
    max_turns: int
    simulator_prompt: str | None
    decision_patterns: list[str]
    continue_prompt: str
```

配置优先级：

1. CLI override。
2. eval manifest。
3. task.toml。
4. profile 默认值。
5. runner 默认值。

这样 Comet 仍可默认使用多轮 driver，普通 Skill 默认单轮。需要用户确认、分阶段执行或
多轮探索的 Skill 可以显式打开 `auto_user`。

## 7. Eval Manifest

`/comet-any` 产出的 Skill 应携带一个轻量 eval manifest，让用户不必手写 treatment。

建议路径：

```text
<skill-package>/
  SKILL.md
  references/
  scripts/
  comet/
    eval.yaml
```

概念格式：

```yaml
apiVersion: comet.eval/v1alpha1
kind: SkillEvalManifest
metadata:
  name: my-generated-skill
  description: Evaluates the generated skill on recommended tasks.

skill:
  name: my-generated-skill
  source: ..
  profile: generic

evaluation:
  recommendedTasks:
    - generic-small-change
    - skill-invocation-smoke
  requiredSkills:
    - my-generated-skill
  expectedArtifacts:
    - "*.md"

interaction:
  mode: auto_user
  maxTurns: 8
  simulatorPrompt: >
    You are a practical developer user. Keep answers short, approve reasonable
    defaults, and only ask for clarification when the requested outcome is unclear.
```

Manifest 只声明推荐评估和运行偏好，不保存历史结果。结果仍写入 local 或 LangSmith suite 的
logs 目录，并带上 manifest path 与 Skill hash。

## 8. Pytest CLI

保留现有参数：

```bash
uv run pytest local/tests/tasks/test_tasks.py --task comet-full-workflow --treatment COMET_FULL -v
```

新增参数：

```bash
--skill-path <path>          # 本地 SKILL.md 或 Skill 目录
--skill-name <name>          # 注入测试环境时使用的 Skill 名
--profile <name>             # generic | comet-workflow | authoring-skill
--eval-manifest <path>       # 读取 comet/eval.yaml
--interaction-mode <mode>    # none | auto_user
--max-turns <n>              # 覆盖自动用户最大轮数
--simulator-prompt <text>    # 覆盖模拟用户角色 prompt
```

使用示例：

```bash
uv run pytest local/tests/tasks/test_tasks.py \
  --task generic-small-change \
  --skill-path D:/Project/example-skill \
  --skill-name example-skill \
  --profile generic -v
```

LangSmith 使用同样参数：

```bash
uv run pytest langsmith/tests/tasks/test_tasks.py \
  --task generic-small-change \
  --eval-manifest D:/Project/example-skill/comet/eval.yaml -v
```

pytest 仍然是 LangSmith 兼容层。LangSmith suite 不需要复制 runner，只继承 local runner 并打开
tracing。

## 9. 执行流程

### 9.1 现有 Comet eval

```text
pytest options
  |
  v
load task comet-full-workflow
  |
  v
load treatment COMET_FULL
  |
  v
profile resolves to comet-workflow
  |
  v
setup Comet skills and environment
  |
  v
run auto_user interaction
  |
  v
task validators
  |
  v
comet-workflow rubric
  |
  v
record result
```

默认行为应与当前 eval 一致。差异只体现在内部 profile 分发，而不是用户命令。

### 9.2 任意本地 Skill eval

```text
pytest --skill-path <path> --profile generic
  |
  v
create dynamic EvalTarget
  |
  v
copy target Skill into test context
  |
  v
load generic task
  |
  v
run Claude Code once or with configured auto_user
  |
  v
task validators
  |
  v
generic rubric
  |
  v
record result with skill hash
```

用户只需要提供 Skill 路径和任务。后续 `/comet-any` 可以替用户生成这些参数。

### 9.3 `/comet-any` 产物 eval

```text
/comet-any generates Skill + comet/eval.yaml
  |
  v
user or /comet-any runs pytest --eval-manifest
  |
  v
manifest resolves SkillSource, profile, tasks, interaction
  |
  v
shared runner executes local or LangSmith suite
  |
  v
result recorded against skill hash and manifest path
```

`/comet-any` 可以把这一步封装成用户命令或内部 CLI 调用，但底层仍然是 pytest。

## 10. Generic Rubric

`generic` profile 的第一版应足够保守，避免假装理解所有 Skill 的领域质量。

建议维度：

- `completion`
  - 直接来自 task validators 的通过率。
- `skill_invocation`
  - 目标 Skill 是否出现在 parsed events 的 `skills_invoked` 中。
- `artifact_presence`
  - task 或 manifest 声明的 expected artifacts 是否存在。
- `instruction_following`
  - 是否明显违反任务约束，例如要求不写文件却写文件、要求输出 JSON 却不是 JSON。
- `interaction_compliance`
  - 启用 auto_user 时，是否没有陷入反复追问或无限继续。
- `efficiency`
  - turns、tool calls、duration、tokens 是否在 profile 阈值内。
- `safety_boundary`
  - 是否执行了未声明的外部网络、危险命令或越界路径写入。第一版可基于 captured commands
    和 Docker test dir 做启发式检查。

输出格式复用现有 `[RUBRIC]` 消息，方便 compare/report 继续解析：

```text
[RUBRIC] completion: 1.00 - 4/4 baseline checks passed
[RUBRIC] skill_invocation: 1.00 - target skill invoked
[RUBRIC] weighted_score: 0.86
```

Comet profile 也继续输出 `[RUBRIC]`，但维度名保持现有 Comet 语义。

## 11. Result Metadata

每次 run 的 report 应新增 metadata：

```json
{
  "task_name": "generic-small-change",
  "treatment_name": "DYNAMIC_SKILL",
  "profile": "generic",
  "skill_sources": [
    {
      "name": "example-skill",
      "source_type": "path",
      "path": "D:/Project/example-skill",
      "hash": "sha256:..."
    }
  ],
  "eval_manifest": "D:/Project/example-skill/comet/eval.yaml",
  "interaction": {
    "mode": "auto_user",
    "max_turns": 8
  }
}
```

Local report 和 LangSmith tracing 都应携带这些字段。这样后续比较时可以区分：

- 同一个 Skill 不同版本。
- 同一个 task 不同 profile。
- 同一个 profile 在 local 与 LangSmith 下的表现。

## 12. LangSmith 兼容性

LangSmith 迁移原则：

- 不复制 task runner。
- 不复制 treatment loader。
- 不复制 profile/rubric 逻辑。
- pytest 参数在 local 和 LangSmith 下保持一致。
- LangSmith suite 只负责设置：
  - `BENCH_SUITE_ROOT`
  - `BENCH_TASKS_DIR`
  - `BENCH_TREATMENTS_DIR`
  - `BENCH_SKILLS_DIR`
  - `BENCH_LOGS_DIR`
  - tracing 环境变量

当未来 LangSmith 使用 dataset/evaluator API 更深入时，也应先从 pytest 输出的 normalized
result 生成 LangSmith evaluator payload，而不是绕过 pytest runner。

## 13. 错误处理

- `--skill-path` 不存在：pytest collection 阶段报错，提示路径和支持格式。
- `--skill-path` 指向目录但缺少 `SKILL.md`：报错并提示期望结构。
- `--eval-manifest` schema 无效：报错并显示字段路径。
- manifest 声明 task 不存在：报错并列出可用 task。
- profile 不存在：报错并列出可用 profile。
- interaction mode 为 `auto_user` 但 simulator prompt 为空：使用 profile 默认 prompt。
- target Skill 未被调用：generic rubric 降分，不直接导致 pytest 失败，除非 task 显式设置
  `require_skill_invocation = true`。
- Comet task 使用 generic profile：允许，但报告中标记 profile mismatch warning。
- 非 Comet task 使用 `comet-workflow` profile：允许显式执行，但 rubric 可能低分，报告中标记
  no Comet artifacts。

## 14. 迁移策略

### Phase 1：抽 profile 分发，不改变行为

- 新增 profile registry。
- 将 `comet_rubric_validator` 注册为 `comet-workflow`。
- 现有 Comet task 默认 profile 为 `comet-workflow`。
- `test_tasks.py` 从固定调用 Comet rubric 改为按 profile 调用。
- 所有现有 eval 命令应保持结果语义基本一致。

### Phase 2：SkillSource 和动态 Skill path

- 增加 `SkillSource` loader。
- treatment loader 支持 `source: path`。
- pytest 支持 `--skill-path`、`--skill-name`、`--profile`。
- 新增 fixture Skill 和 generic smoke task。

### Phase 3：InteractionConfig

- 将 `run-claude-loop` 启用条件从 task 名称改成 interaction config。
- 支持 simulator prompt override。
- Comet profile 默认沿用现有 simulator prompt。
- generic profile 默认 `mode = none`。

### Phase 4：Eval Manifest

- 增加 `comet.eval/v1alpha1` manifest parser。
- pytest 支持 `--eval-manifest`。
- `/comet-any` 产物可声明 recommended tasks、profile 和 interaction。

### Phase 5：LangSmith metadata 和报告增强

- local report 和 LangSmith report 写入 profile、skill source、hash、manifest。
- compare script 支持按 profile 和 skill hash 分组。
- LangSmith tracing 附带同样 metadata。

## 15. 测试计划

单元测试：

- `SkillSource` 从 benchmark/main/path/content/manifest 正确解析。
- path Skill 缺少 `SKILL.md` 时错误清楚。
- profile registry 能解析 `generic` 和 `comet-workflow`。
- `task.toml` 新增 `[evaluation]` 和 `[interaction]` 字段能被加载。
- CLI override 优先级高于 manifest、task 和 profile 默认值。
- `run_claude` fixture 根据 interaction config 选择单轮或 loop。
- generic rubric 能输出固定 `[RUBRIC]` 维度。
- Comet rubric 只在 `comet-workflow` profile 下执行。

集成测试：

- 现有 `comet-full-workflow + COMET_FULL` 仍能 collection 并执行到相同路径。
- 新增 fixture Skill 通过 `--skill-path` 注入测试环境。
- generic smoke task 能验证目标 artifact 并记录 target Skill hash。
- LangSmith tests 继续 import local runner，并接受新增 CLI 参数。
- `--eval-manifest` 能解析一个 `/comet-any` 风格 Skill package。

回归测试：

- `eval/local/tests/scaffold/test_treatments.py`
- `eval/local/tests/scaffold/test_tasks.py`
- `eval/local/tests/tasks/test_validation_scripts.py`
- 现有 Comet benchmark 的 targeted pytest collection。

## 16. 用户体验

普通用户不需要知道 treatment YAML。理想体验：

```bash
comet eval skill ./my-skill
```

或者在底层 pytest 中：

```bash
uv run pytest local/tests/tasks/test_tasks.py --eval-manifest ./my-skill/comet/eval.yaml -v
```

`/comet-any` 的体验是：

1. 生成 Skill。
2. 生成或更新 `comet/eval.yaml`。
3. 询问用户是否运行 quick eval 或 full eval。
4. 内部调用 pytest local suite。
5. 可选将同一 manifest 跑到 LangSmith suite。
6. 将结果写回 Bundle authoring/eval evidence，而不是让用户手动整理。

## 17. 实现边界

第一版实现应尽量小：

- 不做远程 registry。
- 不做复杂自然语言 judge。
- 不做 UI。
- 不要求所有已有 task 都迁移到 `[evaluation]` 字段。缺省时按现有 Comet 任务推断。
- 不要求 compare_baselines 第一版完全理解所有 profile，只要保留 `[RUBRIC]` 解析和 metadata
  透传。

最重要的是先把边界切对：

- `eval/scaffold/python/` 负责通用契约。
- `eval/local/` 负责本地 suite 数据和日志。
- `eval/langsmith/` 负责 LangSmith 环境和 tracing。
- Comet 只是一个 profile，不再是 eval runner 的默认假设。

## 18. 成功标准

- 现有 Comet eval 命令继续可用。
- 一个不在 `eval/local/skills/benchmarks` 中的本地 Skill 可以通过 `--skill-path` 被评估。
- 同一个本地 Skill eval 可以用相同参数在 local 和 LangSmith pytest 入口运行。
- 评估结果能记录 Skill path/hash/profile/manifest。
- `generic` profile 能输出可比较的基础 rubric。
- `comet-workflow` profile 保留现有 Comet 五阶段评分能力。
- `/comet-any` 能生成 eval manifest，并用它触发至少一个 quick eval。
