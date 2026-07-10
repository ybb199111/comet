# Comet 普通用户可用性闭环二期 Spec

日期：2026-06-24

状态：草案，待用户确认后进入 implementation plan

范围：把 `/comet-any`、Skill 组合、Eval、Publish/Distribute 的剩余用户体验问题按优先级整理为一套可实现规格

## 背景

Comet 现在已经具备一组关键底座：

- `/comet-any` 已经是普通用户创建 Comet-native Skill 的主入口。
- `.comet/skill-preferences.yaml` 已经成为项目级 Skill 偏好的唯一普通用户文件。
- Bundle Factory 已能扫描候选 Skill、生成组合方案、写入计划和生成物证据。
- 生成物方向已经明确为完整控制面：`SKILL.md`、`scripts/`、`rules/`、`hooks/`、`reference/`、`comet/*.yaml`、Eval manifest 和 Bundle 状态。
- `comet eval` 已经承担用户评估 Skill 的入口。
- `comet publish` / `comet bundle` 的后端能力已经能支持 review、publish、distribute。

但从普通用户视角看，Comet 还没有达到“足够好用”。主要问题不是后端缺能力，而是能力暴露方式仍偏工程化：

- 首次使用 `/comet-any` 时，用户不知道自己应该先描述目标、选择偏好、确认方案，还是先理解 Bundle 命令。
- 组合方案还不像一个可以做决定的确认页，用户难以判断“将会复用哪些 Skill、生成哪些控制面、有什么风险”。
- 断点恢复仍偏状态机语言，用户中途退出后不一定能快速知道上次做到哪里、现在该点哪里。
- readiness、blocker、warning 的语言仍偏内部检查项，不够像产品化发布建议。
- publish/distribute 仍容易暴露 Bundle 概念，用户不容易理解“发布”和“分发到 Agent 平台”之间的区别。

本 spec 承接已有完成项，不回滚现有设计，也不重新开放手写编排路径。目标是把 Comet 打磨成普通用户能顺着 `/comet-any` 一路完成创建、验证、发布和分发的闭环产品。

## 当前判断

Comet 对普通用户的目标状态应该是：

```text
用户只描述想要什么 Skill
  -> /comet-any 发现项目偏好和本机已有 Skill
  -> Comet 给出可确认的组合方案
  -> 用户确认或要求修改
  -> Comet 生成完整控制面 Skill
  -> 用户用 comet eval 验证
  -> 用户用 comet publish 审核、发布、分发
  -> 中途退出后可以从同一条路径恢复
```

普通用户不应该被要求理解：

- `flow.yaml`
- `bundle.yaml`
- `.comet/bundle-authoring/*.json`
- `.comet/bundle-factory-plans/*/plan.json`
- `comet/skill.yaml`
- `comet/guardrails.yaml`
- `comet/checks.yaml`
- portable hook descriptor 与平台原生 hook 的区别

这些文件可以继续存在，但它们是后端状态、生成物或审计证据。用户路径只讲三件事：

```text
/comet-any 创建
comet eval 验证
comet publish 发布和分发
```

## 目标

1. 让首次使用 `/comet-any` 的用户不需要记命令，也不需要理解 Bundle，即可开始创建 Skill。
2. 让 `/comet-any` 在写入生成物前展示一个可决策的组合确认页。
3. 让 `/comet-any` 对中断流程提供清晰恢复，不重复生成、不丢上下文。
4. 让 readiness 从内部检查语变成用户能行动的发布建议。
5. 让 publish/distribute 成为用户可理解的发布助手，而不是 Bundle 后端命令集合。
6. 保持 `.comet/skill-preferences.yaml` 和 Bundle authoring state 作为已有事实源，不新增第二套状态机。
7. 保持 `scripts/`、`rules/`、`hooks/` 作为稳定组合 Skill 的必须生成物和核心控制面。

## 非目标

- 不开放普通用户手写 `flow.yaml` 的路径。
- 不开放普通用户手写 `comet/skill.yaml`、`guardrails.yaml`、`checks.yaml` 的路径。
- 不新增图形化编排器、复杂 DSL、条件表达式语言或单独的工作流引擎。
- 不删除 `comet bundle` 后端命令；它仍用于高级调试、自动化和兼容。
- 不让 `/comet-any` 自动跳过用户确认、Eval evidence、review readiness 或 executable disclosure。
- 不把 portable `hooks/*.yaml` 直接当作目标平台原生 hook 配置安装。
- 不修改 Superpowers 或 OpenSpec 原始 Skill。

## 优先级总览

状态说明：`[ ]` 尚未实现；`[~]` 可在现有能力上增强；`[x]` 已完成。本文只列需要继续做的内容。

| 优先级 | 状态 | 主题 | 用户问题 | 目标状态 |
| --- | --- | --- | --- | --- |
| P0 | [x] | 首次使用向导化 | 用户不知道从哪里开始，也不想记命令 | `/comet-any` 自动发现上下文、引导偏好、保存项目偏好 |
| P1 | [x] | 组合方案确认页 | 用户看不懂将要组合什么、生成什么、风险是什么 | 写入前展示可确认、可修改、可拒绝的方案 |
| P2 | [x] | 断点恢复体验 | 中途退出后不知道上次做到哪里 | `/comet-any` 优先恢复进行中流程，并说明下一步 |
| P3 | [x] | readiness 用户语 | blocker/warning 太像内部诊断 | 输出“能不能发布、为什么、怎么修、下一步” |
| P4 | [x] | 发布和分发助手 | `bundle`、`publish`、`distribute` 心智混乱 | `comet publish` 收口为用户发布助手，`bundle` 退为高级后端 |

## 设计原则

### 1. 用户只走一条主路径

普通用户入口固定为：

```text
/comet-any -> comet eval -> comet publish
```

`comet bundle`、`factory-*`、内部 plan、Bundle authoring state 仍保留，但不作为 README 和 `/comet-any` 主线要求用户记忆。

### 2. 后端复杂，前端摘要简单

后端可以继续保存详细状态和证据，但对用户输出必须稳定成四类摘要：

- 创建摘要：我现在要帮你创建什么。
- 组合方案：我将复用什么、生成什么、需要你确认什么。
- 恢复摘要：上次做到哪里，现在下一步是什么。
- 发布摘要：现在能不能发布，不能的话怎么修。

这些摘要可以由 CLI 输出，也可以由 `/comet-any` Skill 消化后转述给用户；但字段和语义必须稳定，避免每次靠 Agent 自己猜。

### 3. 不新增第二套事实源

事实源保持不变：

- 项目偏好：`.comet/skill-preferences.yaml`
- 创建状态：Bundle Factory / Bundle authoring state
- 发布状态：Bundle authoring state
- 生成物：draft bundle 目录
- Eval evidence：现有 eval report / evidence 记录

新的用户体验只在这些事实源上生成更清楚的摘要和下一步，不另建平行状态机。

### 4. 控制面必须完整生成

`/comet-any` 的目标不是只产出一个 `SKILL.md`。默认生成物必须包含：

```text
SKILL.md
scripts/
rules/
hooks/
reference/
comet/skill.yaml
comet/guardrails.yaml
comet/checks.yaml
comet/eval.yaml
bundle.yaml
```

如果某个目标平台不支持其中一类能力，publish/distribute 阶段必须明确披露，而不是静默降级。

## P0：首次使用向导化

### 用户问题

用户第一次使用 `/comet-any` 时，真实问题通常是：

```text
我想创建一个像 comet 一样能稳定推进流程的 Skill。
我有一些偏好的 Skill，但不想每次都手写一串命令。
我不知道当前项目里有没有保存过偏好。
```

当前能力已经支持项目级偏好和候选扫描，但 `/comet-any` 还需要把这些能力包装成自然的首次使用流程。

### 用户体验

当用户调用 `/comet-any` 时，它应先判断当前项目状态：

1. 如果存在未完成的创建流程，优先进入 P2 的恢复流程。
2. 如果没有 `.comet/skill-preferences.yaml`，进入首次使用向导。
3. 如果已有项目偏好，读取偏好并展示简短摘要。
4. 如果用户明确要求重设偏好，再进入偏好更新流程。

首次使用向导只问必要问题，不要求用户记命令：

```text
你想创建什么 Skill？
你希望优先复用哪些已有 Skill？
这些偏好是否保存到 .comet/skill-preferences.yaml？
是否允许生成 scripts/rules/hooks 作为控制面？
```

Skill 发现应扫描 Comet 支持的平台 Skill，并按去重后的用户可读名称展示。遇到同名 Skill 时，不直接让用户看内部路径列表，而是用来源分组说明：

```text
brainstorming
  - 项目内 Skill
  - 用户全局 Skill
  - Agent 平台内置 Skill
```

### 功能要求

- `/comet-any` 必须先读取 `.comet/skill-preferences.yaml`，没有时再生成推荐。
- 推荐偏好必须来自真实扫描结果，不能写死为固定列表。
- Skill 去重必须同时保留来源证据，避免隐藏同名冲突。
- 首次向导保存偏好前必须让用户确认。
- 保存后的偏好文件必须与 `.comet/config.yaml` 同级。
- 如果用户不想保存偏好，本次仍可使用临时偏好继续创建。
- 如果偏好缺失或冲突，按 `policies.missing`、`policies.ambiguous` 执行。

### 后端边界

- 复用现有 Skill inventory / preference parser。
- 允许增强 `factory-propose` 或新增轻量只读摘要命令。
- 不新增 `.comet/skills.txt`。
- 不让用户手写 `flow.yaml`。

### 验收标准

- [x] 无偏好文件时，`/comet-any` 能解释它将扫描 Skill 并创建项目偏好。
- [x] 用户可以不记任何 `comet bundle` 命令完成首次偏好确认。
- [x] `.comet/skill-preferences.yaml` 保存前有明确确认。
- [x] 同名 Skill 展示来源差异，并按策略要求用户选择或失败。
- [x] 文档明确说明用户可以手写 `.comet/skill-preferences.yaml`，但不是必须。

## P1：组合方案确认页

### 用户问题

现在 `/comet-any` 的后端可以生成 plan 和 metadata，但用户真正需要的是一个确认页：

```text
这个 Skill 会解决什么问题？
它会复用哪些 Skill？
它会生成哪些文件？
它会安装或分发哪些 scripts/rules/hooks？
它会用什么方式验证？
有什么风险需要我确认？
```

如果用户看不懂方案，就无法对生成结果负责。

### 用户体验

在写入 draft 或进入不可逆步骤前，`/comet-any` 必须展示组合方案确认页。确认页应该像这样组织：

```text
目标
  创建一个用于 <任务> 的 Comet-native Skill

将复用的 Skill
  1. brainstorming - 用于需求澄清
  2. writing-plans - 用于执行计划
  3. verification-before-completion - 用于完成前验证

将生成的控制面
  - SKILL.md
  - scripts/comet-plan.mjs
  - rules/<name>-orchestration.md
  - hooks/<name>-guard.yaml
  - comet/checks.yaml
  - comet/eval.yaml

验证计划
  - quick smoke eval
  - generated Skill manifest eval
  - readiness review

需要确认
  - 是否允许生成脚本
  - 是否允许生成 hook descriptor
  - 是否接受某个偏好 Skill 缺失后的替代方案
```

用户必须有三个选择：

```text
确认生成
修改方案
取消
```

### 功能要求

- 组合方案必须在生成最终 draft 前展示。
- 方案必须包含来源 Skill、生成物、scripts/rules/hooks、Eval、readiness 风险。
- 方案必须标记哪些内容来自项目偏好，哪些是 Comet 推荐补足。
- 方案必须解释偏离偏好的原因。
- `strict` 模式下，偏离 `require` 必须阻止确认。
- 文本输出给人看；JSON 输出给 `/comet-any` 和自动化使用。
- 确认结果必须写入 Bundle Factory metadata，作为后续 review evidence。

### 后端边界

- 优先增强现有 `comet bundle factory-propose` 输出。
- 不要求新增 Web UI；“确认页”可以是结构化 Markdown / CLI 文本。
- 不让 Agent 仅凭自然语言记忆用户确认，必须有可追溯 metadata。

### 验收标准

- [x] `/comet-any` 在写入前展示完整组合方案。
- [x] 用户能在同一流程中选择确认、修改或取消。
- [x] 方案中能看出每个生成物的作用，尤其是 `scripts/`、`rules/`、`hooks/`。
- [x] 偏好缺失、同名冲突、策略偏离都有用户可读解释。
- [x] 确认后的 metadata 能被 review-summary 或 publish 阶段读取。

## P2：断点恢复体验

### 用户问题

用户可能做到一半中断：

- 偏好刚保存，还没生成方案。
- 方案已生成，尚未确认。
- draft 已生成，Eval 尚未跑。
- Eval 已跑，但 readiness 有 blocker。
- publish 已准备好，distribute 尚未执行。

如果恢复时只显示内部状态，用户仍然不知道该继续做什么。

### 用户体验

`/comet-any` 启动时应优先检查是否存在未完成流程，并给出恢复摘要：

```text
找到一个未完成的 Skill 创建流程：

目标：创建 <skill-name>
上次进度：组合方案已确认，draft 已生成
已完成：
  - 项目偏好已读取
  - 组合方案已确认
  - 控制面文件已生成
还缺：
  - 运行 eval
  - 处理 readiness review

建议下一步：
  运行 comet eval 验证这个 Skill

你可以：
  继续
  查看详情
  放弃这个流程
```

恢复流程要避免重复生成。如果用户输入的目标或偏好发生变化，Comet 应解释这是继续旧流程还是创建新流程。

### 功能要求

- `/comet-any` 必须在创建新流程前检查 active Bundle Factory / authoring state。
- 恢复摘要必须包含目标、当前阶段、已完成、未完成、建议下一步。
- 恢复摘要必须包含关键证据路径，但不把路径作为主要用户语言。
- 如果偏好 hash 或目标摘要变化，必须提示用户选择继续旧流程或开始新流程。
- 放弃流程必须是显式动作，不能因重新调用 `/comet-any` 自动覆盖。
- JSON 输出必须保留机器可判定的 `nextAction`，文本输出必须是用户可读行动建议。

### 后端边界

- 复用 Bundle authoring state，不新增 `.comet/comet-any-state.yaml`。
- 可以增强 state summary / next action 聚合。
- 对旧状态做兼容读取，缺字段时降级为保守恢复提示。

### 验收标准

- [x] 中断后再次调用 `/comet-any`，默认展示恢复摘要而不是直接新建。
- [x] 用户能清楚看到上次做到哪里、还缺什么、下一步做什么。
- [x] 目标或偏好变化时不会静默覆盖旧流程。
- [x] 放弃流程需要明确确认。
- [x] 恢复摘要在文本和 JSON 模式下都有稳定字段。

## P3：readiness 用户语

### 用户问题

readiness 目前能表达 blockers、warnings、evidence，但普通用户更关心：

```text
现在能不能发布？
为什么不能？
我该怎么修？
修完后跑什么？
```

如果输出主要是内部检查项，用户仍要靠 Agent 解读。

### 用户体验

readiness 输出应分成两层：

1. 用户结论。
2. 证据详情。

用户结论示例：

```text
当前不能发布。

原因：
  1. 还没有 Eval 证据。
     下一步：运行 comet eval run --skill-path <draft-skill>

  2. 生成物声明了 hooks，但尚未确认目标平台支持。
     下一步：运行 comet publish distribute --preview

修完后：
  重新运行 comet publish review
```

对于可发布但有 warning 的情况：

```text
当前可以发布，但需要你确认 1 个风险：

  目标平台不支持某个 hook，分发时会阻止安装到该平台。

建议：
  先执行 distribute preview，确认平台差异。
```

### 功能要求

- readiness 必须输出用户结论：`可以发布`、`不能发布`、`可以继续但需确认`。
- 每个 blocker 必须包含：原因、影响、下一步动作、证据位置。
- 每个 warning 必须包含：风险、是否阻塞、建议动作。
- 内部 readiness code 保留，用于 JSON 和自动化判断。
- 文本输出不应要求用户理解 `publishable`、`blocker`、`evidence` 等内部术语。
- `/comet-any` 必须把 readiness 作为发布前停顿点，而不是自动越过。

### 后端边界

- 优先增强 `review-summary` / `publish review` 的展示层。
- 不改变 readiness 判定核心规则，除非发现规则本身缺失。
- 不减少 JSON 的机器字段。

### 验收标准

- [x] 每个 readiness blocker 都有用户可执行的下一步。
- [x] 文本输出第一屏能看懂“能不能发布”。
- [x] JSON 输出保留原有自动化字段，并新增或稳定用户摘要字段。
- [x] `/comet-any` 在 readiness 非可发布时停止，并转述用户结论。
- [x] README / docs 中展示新 readiness 输出示例。

## P4：发布和分发助手

### 用户问题

用户不应该先理解 `bundle` 才能发布 Skill。他们需要的是：

```text
我已经生成并验证了 Skill。
现在我想审核它、发布它、分发到我的 Agent 平台。
```

`bundle` 是后端对象，不应成为普通用户主路径。

### 用户体验

普通用户主路径应收敛到 `comet publish`：

```bash
comet publish status
comet publish review
comet publish approve
comet publish run
comet publish distribute --preview
comet publish distribute
```

这些命令可以继续调用现有 Bundle 后端，但输出必须讲发布语义：

- `status`：现在处于发布流程哪一步。
- `review`：能不能发布，缺什么。
- `approve`：记录用户已确认生成物和执行性能力。
- `run`：生成发布候选或完成发布动作。
- `distribute --preview`：展示会写入哪些平台、哪些文件、哪些 hook/rule/script。
- `distribute`：在确认后执行分发。

`comet bundle` 仍保留，但定位为：

```text
高级调试 / 自动化 / 兼容后端
```

### 功能要求

- README 和 `/comet-any` 文档主线使用 `comet publish`，不要求普通用户记 `comet bundle`。
- `comet publish` 不新增状态机，只包装 Bundle authoring state。
- 分发前必须 preview scripts/rules/hooks 的目标平台写入计划。
- 如果目标平台不支持 required capability，必须阻止或要求用户明确处理。
- portable hook descriptor 必须由 Comet 编译/映射到平台原生配置，不能直接假装所有平台都能识别。
- 分发动作必须保留 rollback 或失败摘要，避免半安装后用户不知道状态。

### 后端边界

- `comet bundle` 命令保持兼容。
- 可以新增或增强 `comet publish` façade。
- 不自动向外部平台写入，除非用户已经确认目标和执行性能力。
- 不在 README 主线展开 Bundle 内部命令。

### 验收标准

- [x] 用户能通过 `comet publish status/review/approve/run/distribute` 理解发布流程。
- [x] `/comet-any` 的发布指引只暴露 `comet publish` 主路径。
- [x] `distribute --preview` 明确列出目标平台、写入文件、scripts/rules/hooks、unsupported capability。
- [x] 分发失败时输出已写入、已回滚、需要人工处理的内容。
- [x] `comet bundle` help 明确为高级后端，不再作为普通用户 quickstart 主线。

## 跨优先级数据契约

### 项目偏好

`.comet/skill-preferences.yaml` 是项目级偏好的事实源。P0-P2 都必须读取它，并在需要时记录偏好 hash，用于判断恢复流程是否仍匹配当前输入。

### 创建状态

Bundle Factory / Bundle authoring state 是创建状态事实源。新增用户摘要字段时，应优先从现有状态派生，不把同一状态复制到新文件。

### 组合确认

组合确认必须留下 metadata，至少包含：

- 用户确认时间。
- 确认的目标摘要。
- 使用的项目偏好 hash。
- 选中的来源 Skill。
- 接受的 scripts/rules/hooks 生成计划。
- 已知 warnings 或偏离说明。

### Eval evidence

Eval evidence 必须被 readiness 和 publish 读取。用户不需要理解 harness 参数，但需要知道：

- 是否跑过 Eval。
- 最近一次 Eval 是否通过。
- 报告在哪里。
- 失败后下一步是什么。

### 分发证据

分发 preview 和执行结果必须能被 review/status 读取。至少记录：

- 目标平台。
- 写入计划。
- unsupported capability。
- 用户确认。
- 执行结果。
- rollback 或人工处理建议。

## 文档和 Skill 更新范围

本 spec 实现时需要同步：

- `assets/skills-zh/comet-any/SKILL.md`
- `assets/skills/comet-any/SKILL.md`
- `docs/zh/` 下 `/comet-any`、Eval、Publish/Distribute 相关文档
- `docs/` 对应英文文档
- `README-zh.md`
- `README.md`
- CLI help 文案

更新顺序必须符合仓库约定：

1. 先写中文 Skill / docs。
2. 用户确认中文表达后同步英文。
3. README 只保留主路径和关键链接，详细解释放入 docs。
4. 如果产生用户可见版本变更，最后更新 `CHANGELOG.md`。

## 测试要求

实现本 spec 时至少补齐以下测试面：

- 偏好发现：无偏好、已有偏好、同名 Skill、缺失 Skill、strict/advisory 策略。
- 组合方案：文本确认页、JSON 字段、scripts/rules/hooks 展示、偏离说明。
- 恢复流程：不同阶段中断后的 next action、目标变化、偏好 hash 变化、放弃确认。
- readiness：可发布、不可发布、有 warning、缺 Eval、缺控制面、平台能力不支持。
- publish/distribute：preview、确认、unsupported capability、失败摘要、rollback 证据。
- 文档和 Skill：中文/英文关键章节结构一致，README 只展示主路径。
- 打包烟测：构建后 `comet publish --help`、`comet eval --help`、`comet status` 不因资源路径或 help 注册失败。

## 分阶段实现建议

### 第一阶段：P0 + P1

先让 `/comet-any` 的开始和确认闭环可用：

- 首次使用识别。
- 偏好扫描和保存。
- 组合方案确认页。
- 确认 metadata。

这是后续恢复、readiness、publish 的基础。

### 第二阶段：P2

在已有创建状态上补恢复摘要：

- active state 检查。
- next action 聚合。
- 目标/偏好变化检测。
- 放弃流程确认。

### 第三阶段：P3

把 readiness 输出改成用户可行动语言：

- 用户结论。
- blocker 下一步。
- warning 风险说明。
- `/comet-any` 发布前转述。

### 第四阶段：P4

最后收口 publish/distribute：

- `comet publish` façade 完整化。
- distribute preview 和执行摘要。
- README / docs 主路径切换。
- `comet bundle` 高级后端定位。

## 总体验收标准

- [x] 新用户可以只调用 `/comet-any` 开始创建 Skill，不需要先学习 Bundle CLI。
- [x] 用户可以看到并确认组合方案，知道会复用哪些 Skill、生成哪些控制面。
- [x] 中断后再次调用 `/comet-any`，用户能清楚恢复而不是重新开始。
- [x] Eval 和 readiness 的输出能告诉用户是否能发布以及下一步怎么做。
- [x] 用户可以通过 `comet publish` 完成审核、发布、分发，不需要理解 `bundle` 内部命令。
- [x] 生成的 Skill 默认包含 `scripts/`、`rules/`、`hooks/`，并在分发阶段正确披露平台能力差异。
- [x] 中文和英文 Skill/docs 保持结构一致。
- [x] 自动化测试覆盖主要用户路径和失败路径。

## 自检

- 本 spec 没有重新开放手动 `flow.yaml` 编排路径。
- 本 spec 没有新增第二套状态机。
- 本 spec 没有把 `hooks/*.yaml` 视为平台原生 hook。
- 本 spec 没有要求用户学习 `comet bundle` 才能完成普通路径。
- 本 spec 的 P0-P4 可以按顺序实现，也可以在 implementation plan 中进一步拆分任务。
