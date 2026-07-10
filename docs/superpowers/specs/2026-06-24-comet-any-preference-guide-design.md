# Comet Any 项目级 Skill 偏好向导设计

日期：2026-06-24

## 背景

`/comet-any` 的目标已经从“生成一个 Skill 文件”升级为“帮助用户创建像 `/comet` 一样完整、可验证、可恢复、可分发的 Comet-native Skill”。当前已经具备 Bundle Factory、候选解析、组合调用链、Eval、review、publish、distribute 等后端能力，但用户心智仍容易被多个内部概念打散：

- `.comet/skills.txt` 曾被设计成偏好输入，但尚未正式上线，表达力也偏弱。
- `flow.yaml` 适合作为内部组合语义或高级作者产物，不适合作为普通用户入口。
- `comet/skill.yaml`、`guardrails.yaml`、`checks.yaml`、`eval.yaml` 是生成物和运行控制面，不应要求用户手写。
- 用户有时偏好的 Skill 很多，不能要求每次在对话输入框里重新列出。

新的设计应把用户心智收敛为：

```text
用户描述目标和偏好
  -> /comet-any 扫描真实 Skill 并生成组合方案
  -> 用户确认
  -> Comet 固化 plan / metadata / guardrails / checks / eval / Bundle 状态
  -> eval / publish / distribute
```

## 目标

1. `/comet-any` 成为创建、优化、组合、验证和分发 Skill 的唯一普通用户入口。
2. 提供一个项目级、可手写、可由 `/comet-any` 维护的 Skill 偏好文件：`.comet/skill-preferences.yaml`。
3. 删除 `.comet/skills.txt` 作为用户路径，避免多个偏好入口并存。
4. 保留 `find skill` 全平台扫描能力，并增加面向用户的分组、去重和歧义展示。
5. `/comet-any` 首次使用时能扫描本地 Skill、推荐默认偏好，并询问是否保存为项目偏好。
6. `/comet-any` 每次生成 Skill 前必须展示组合方案，用户确认后才写入 Bundle Factory metadata 并生成产物。
7. 生成物必须具备完整控制面：`SKILL.md`、`scripts/`、`rules/`、`hooks/`、`reference/`、`comet/*.yaml`、Eval manifest 和 Bundle 状态。
8. 支持 `advisory` 和 `strict` 两种偏好执行模式。

## 非目标

- 不开放普通用户手写 `flow.yaml` 的路径。
- 不开放普通用户手写 `comet/skill.yaml`、`guardrails.yaml`、`checks.yaml` 的路径。
- 不引入复杂工作流语言、图编辑器、条件表达式 DSL 或新的独立编排引擎。
- 不让 `/comet-any` 自动跳过 Eval、人工 approval 或 scripts/hooks executable disclosure。
- 不引入第二套 publish/distribute 状态机；Bundle authoring state 仍是发布事实源。
- 不要求所有历史 Bundle 或手写 Skill 立即迁移。

## 用户心智

普通用户只需要理解三个概念：

```text
.comet/config.yaml              Comet 项目配置
.comet/skill-preferences.yaml   项目 Skill 使用偏好
/comet-any                      Skill 创建向导
```

用户可以选择两种使用方式：

1. **向导式**：直接调用 `/comet-any`，让它扫描、推荐、询问并保存偏好。
2. **手写式**：直接编辑 `.comet/skill-preferences.yaml`，再让 `/comet-any` 使用项目偏好创建 Skill。

普通用户不需要理解这些内部产物：

- `.comet/bundle-authoring/*.json`
- `.comet/bundle-factory-plans/*/plan.json`
- `flow.yaml`
- `comet/skill.yaml`
- `comet/guardrails.yaml`
- `comet/checks.yaml`
- `bundle.yaml`

这些文件仍然可以存在，但它们是后端状态、审计证据或生成物。

## 项目级偏好文件

### 路径

```text
.comet/skill-preferences.yaml
```

该文件与 `.comet/config.yaml` 同级，因为它表达的是项目级 Skill 使用偏好，而不是 `/comet-any` 的私有状态。

### Schema v1

第一版保持极简：

```yaml
version: 1
mode: advisory

prefer:
  - brainstorming
  - writing-plans
  - systematic-debugging
  - test-driven-development
  - requesting-code-review
  - verification-before-completion

require:
  - verification-before-completion

policies:
  missing: ask
  ambiguous: ask
  deviation: explain
  scripts: disclose
  hooks: disclose
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `version` | 偏好文件 schema 版本。第一版固定为 `1`。 |
| `mode` | `advisory` 或 `strict`。 |
| `prefer` | 用户希望优先复用的 Skill，顺序代表偏好优先级。 |
| `require` | 创建组合 Skill 时必须满足的 Skill 偏好。 |
| `policies.missing` | 偏好 Skill 缺失时的行为：`ask` 或 `fail`。 |
| `policies.ambiguous` | 同名 Skill 有多个来源时的行为：`ask` 或 `fail`。 |
| `policies.deviation` | 组合方案偏离偏好时的行为：`explain` 或 `fail`。 |
| `policies.scripts` | 生成或分发 scripts 时的行为：`allow`、`disclose` 或 `deny`。 |
| `policies.hooks` | 生成或分发 hooks 时的行为：`allow`、`disclose` 或 `deny`。 |

### 默认值

如果文件不存在，`/comet-any` 不应报错。它应该进入首次偏好建立流程。

如果文件存在但省略可选字段，默认值为：

```yaml
mode: advisory
prefer: []
require: []
policies:
  missing: ask
  ambiguous: ask
  deviation: explain
  scripts: disclose
  hooks: disclose
```

### 校验规则

- `version` 必须为 `1`。
- `mode` 只能是 `advisory` 或 `strict`。
- `prefer` 和 `require` 必须是非空字符串数组；数组本身可以为空。
- 同一个 Skill 在同一数组内重复出现时只保留第一次，并给出 warning。
- `require` 中的 Skill 如果不在 `prefer` 中，仍然有效；组合方案必须把它标记为 required 来源。
- 未知字段默认报 warning，不阻塞；后续 strict schema 可以升级为 fail。

## 移除 `.comet/skills.txt`

`.comet/skills.txt` 尚未作为稳定用户功能上线，且只能表达一维顺序偏好，无法自然扩展到 strict mode、required Skill、缺失策略、歧义策略、scripts/hooks 策略。

本设计要求：

- 删除 README、docs、`/comet-any` Skill 文案中的 `.comet/skills.txt` 主路径。
- 删除或迁移 `readSkillPreferenceEntries` 对 `.comet/skills.txt` 的默认读取。
- 如果测试中需要偏好输入，应改为 `.comet/skill-preferences.yaml`。
- 如果为了内部过渡保留兼容读取，也只能作为 deprecated fallback，不能出现在用户文档主路径。

## Skill Inventory 与 Find Skill

现有 `find skill` 已经能扫描 Comet 支持的平台目录，包括 project/global 平台 Skill、`.comet/skills`、内置 Skill、额外 roots 和 `~/.agents/skills`。新设计不需要重写扫描基础能力，但需要在其上增加用户级 inventory。

### Inventory 目标

`/comet-any` 首次建立偏好时，应展示“可复用能力”，而不是直接把所有目录名倾倒给用户。

示例展示：

```text
我发现这些可复用 Skill：

需求澄清
  1. brainstorming

计划与执行
  2. writing-plans
  3. test-driven-development

调试与验证
  4. systematic-debugging
  5. verification-before-completion

代码评审
  6. requesting-code-review

推荐默认偏好：1, 2, 4, 5
```

### 去重与歧义

底层 source 去重只能避免同一路径重复出现；用户级展示还需要：

- 按 Skill name 聚合来源。
- 按 content hash 识别同名同内容副本。
- 同名不同 hash 时标记为 ambiguous。
- 同名同 hash 但不同平台时标记为 duplicated install，而不是多个独立能力。
- 对 ambiguous Skill，不替用户选择；`/comet-any` 根据 policy 询问或失败。

### 输出给 `/comet-any` 的结构化信息

Inventory 至少应提供：

- `name`
- `description`
- `capabilityGroup`
- `sources`
- `hashes`
- `status`: `available`、`ambiguous`、`missing`
- `duplicateInstall`
- `recommended`
- `reason`

## `/comet-any` 用户流程

### 1. 恢复已有流程

如果存在可恢复 Bundle authoring state，`/comet-any` 应先展示：

- 名称
- 当前状态
- next action
- blockers
- 上次确认的组合方案摘要

用户可以选择继续、重新生成组合方案或开始新 Skill。

### 2. 读取项目偏好

读取 `.comet/skill-preferences.yaml`。

如果不存在：

1. 扫描 Skill inventory。
2. 展示分组推荐。
3. 询问用户是否保存推荐偏好。
4. 用户确认后写入 `.comet/skill-preferences.yaml`。

如果存在但无效：

- `advisory` 模式下展示错误并询问是否修复。
- `strict` 模式下直接阻塞，要求用户修复或允许 `/comet-any` 重写。

### 3. 获取用户目标

用户可以用自然语言描述：

```text
/comet-any 帮我创建一个 PR Review Skill，像 /comet 一样严谨。
```

也可以引用已有 Skill 风格：

```text
基于 /comet 的工作方式，创建一个 bugfix Skill。
```

### 4. 生成组合方案

`/comet-any` 必须在写文件前展示组合方案：

- 新 Skill 名称。
- 目标场景。
- 预计复用的 Skill。
- 每个 Skill 的作用。
- 调用顺序。
- 哪些来自 `prefer`。
- 哪些来自 `require`。
- 哪些由目标语义自动补充。
- 缺失和歧义候选。
- 偏离偏好的原因。
- scripts/hooks 风险和披露。
- 将生成的文件清单。

### 5. 用户确认

用户可选择：

- 使用方案。
- 调整偏好。
- 选择歧义来源。
- 移除或替换缺失 Skill。
- 改成 `strict` 或 `advisory`。
- 取消。

未经用户确认，不得生成 Bundle draft。

### 6. 固化状态

用户确认后：

- 写入 Bundle Factory metadata。
- 写入 `.comet/bundle-factory-plans/<name>/plan.json`。
- 保存 resolved Skill 证据。
- 记录偏好文件 hash，用于恢复时检测偏好变化。

## Advisory 与 Strict

### Advisory

`advisory` 是默认模式：

- 可以偏离 `prefer` 顺序。
- 可以自动补充目标需要但偏好中未列出的 Skill。
- 偏离必须在组合方案和 review summary 中解释。
- 缺失和歧义仍按 policy 处理。

### Strict

`strict` 用于团队标准化工作流：

- `require` 中的 Skill 缺失时必须阻塞。
- ambiguous Skill 不能自动选择。
- 偏离 `require` 必须阻塞。
- 如果 `policies.deviation: fail`，偏离 `prefer` 也必须阻塞。
- `scripts: deny` 或 `hooks: deny` 时，不得生成需要对应 capability 的 Bundle。

## 生成物要求

确认后的 `/comet-any` 产物必须包含：

```text
<bundle-draft>/
  bundle.yaml
  skills/<entry-skill>/
    SKILL.md
    comet/
      skill.yaml
      guardrails.yaml
      checks.yaml
      eval.yaml
    reference/
      resolved-skills.json
      composition-report.md
    scripts/
  rules/
  hooks/
```

职责：

- `SKILL.md`：用户入口，说明何时使用、如何推进、何时停止询问。
- `reference/resolved-skills.json`：真实 Skill 来源、hash、摘要、选择原因、偏好来源。
- `reference/composition-report.md`：组合方案、偏离解释、风险、review evidence。
- `comet/skill.yaml`：内部运行计划，不作为用户手写入口。
- `comet/guardrails.yaml`：由偏好和风险策略生成的约束。
- `comet/checks.yaml`：运行完成度和 required Skill 检查。
- `comet/eval.yaml`：Eval manifest。
- `scripts/`、`rules/`、`hooks/`：稳定推进流程的 required control plane。

## Eval、Review、Publish、Distribute

`/comet-any` 生成后，普通用户路径保持：

```text
/comet-any -> comet eval -> comet publish -> distribute
```

要求：

- Eval 结果必须绑定当前 draft hash。
- Review summary 必须展示偏好文件 hash、组合方案、偏离原因、resolved Skill 证据、Eval evidence、readiness。
- 没有当前 hash 的 Eval evidence 时不得 publish。
- 没有人工 approval 时不得 publish。
- required capability gap 存在时不得 publish。
- scripts/hooks 分发前必须披露 executable consequence，并根据 policy 允许、询问或阻塞。

## 恢复与漂移检测

恢复时 `/comet-any` 必须检查：

- Bundle Factory state 是否存在。
- draft hash 是否变化。
- `.comet/skill-preferences.yaml` hash 是否变化。
- resolved Skill hash 是否变化。
- Eval evidence 是否仍匹配当前 hash。
- approval 是否仍匹配当前 hash。

如果偏好或 Skill 来源发生变化，应提示：

```text
项目 Skill 偏好或本地 Skill 内容已变化。
你可以继续使用旧组合方案，或重新生成组合方案。
```

`strict` 模式下，默认应阻塞并要求用户确认继续或重新生成。

## 文档更新要求

### README

README 只保留主心智：

```text
/comet-any 是 Skill 创建向导。它读取项目 Skill 偏好，扫描真实本地 Skill，生成可评审、可 Eval、可发布、可分发的完整 Skill Bundle。
```

README 不展示 Bundle CLI 生命周期细节。

### `/comet-any` Skill

中英文 `/comet-any` Skill 必须同步更新：

- 删除 `.comet/skills.txt` 主路径。
- 说明 `.comet/skill-preferences.yaml` 是项目级偏好。
- 说明用户可以手写，也可以由 `/comet-any` 首次扫描后生成。
- 强调组合方案必须先确认。
- 强调内部 CLI 是确定性后端，不是用户主流程。

### Operations Docs

`docs/operations/SKILL-CREATION-ZH.md` 应重写为：

- 一句话创建。
- 首次建立偏好。
- 手写 `.comet/skill-preferences.yaml`。
- 查看组合方案。
- Eval。
- Publish。
- Distribute。
- 恢复中断流程。

英文文档在中文确认后同步。

## 测试要求

需要覆盖：

1. `.comet/skill-preferences.yaml` 解析、默认值、非法字段、重复项。
2. `.comet/skills.txt` 不再作为默认用户偏好入口。
3. Inventory 扫描所有平台 project/global Skill。
4. 用户级去重：同名同 hash、同名不同 hash、同路径重复。
5. Advisory 允许偏离但记录原因。
6. Strict 阻塞 missing、ambiguous、required 缺失和禁止的 scripts/hooks。
7. `/comet-any` 文案要求先展示组合方案再生成。
8. Bundle Factory metadata 记录偏好文件 hash、组合方案和 resolved Skill 证据。
9. 恢复时检测偏好文件变化并提示重新生成。
10. README 与 docs 不再把 `skills.txt` 当作主流程。

## 验收标准

- 新用户可以只调用 `/comet-any`，不手写文件，也能创建完整 Skill。
- 高级用户可以手写 `.comet/skill-preferences.yaml`，`/comet-any` 能正确读取并应用。
- 用户不需要理解 `flow.yaml`、`skill.yaml`、Bundle authoring state 或 factory plan。
- `/comet-any` 首次使用能扫描、推荐并保存项目偏好。
- `/comet-any` 每次生成前都会展示组合方案并等待确认。
- `strict` 模式下，缺失 required Skill、歧义来源、禁止 scripts/hooks 等情况会阻塞。
- Review summary 能解释“为什么这样组合”以及“是否偏离项目偏好”。
- Eval、approval、publish、distribute 继续复用现有 Bundle 后端，不产生第二套状态。

## 实现状态

- [x] 新增 `.comet/skill-preferences.yaml` 项目级偏好解析、默认值、warning、hash 和严格枚举校验。
- [x] 移除 `.comet/skills.txt` 作为用户主路径，active 代码、文档、README 和测试 fixture 已迁移。
- [x] 保留 `find skill` 全平台扫描能力，并新增面向用户的 Skill inventory 分组、去重、歧义和推荐标记。
- [x] `/comet-any` 后端新增 Factory proposal dry-run，生成前展示组合方案，不写 Bundle authoring state。
- [x] Factory metadata 记录偏好模式、策略、required Skill、`preferenceHash`、warning 和 resolved Skill 证据。
- [x] `advisory` / `strict` readiness 已覆盖：偏好漂移、required 缺失、scripts/hooks deny 和 unresolved candidates 会进入 warning 或 blocker。
- [x] Factory 生成物包含 `SKILL.md`、`scripts/`、`rules/`、`hooks/`、`reference/`、`comet/*.yaml`、Eval manifest 和 Bundle 状态；生成证据写入偏好信息。
- [x] Review summary 展示偏好 hash、模式、组合方案证据、Eval evidence 和 readiness。
- [x] `/comet-any` 中英文 Skill、operations 文档和 README 已按新用户心智更新。
- [x] 已完成至少一次实现后 review，并修复 review 发现的偏好解析校验问题。
- [x] 已通过目标测试、格式检查、lint、build 和全量测试验证。
