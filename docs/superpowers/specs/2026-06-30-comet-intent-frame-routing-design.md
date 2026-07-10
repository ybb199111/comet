# Comet IntentFrame 路由升级设计

日期：2026-06-30

## 背景

Classic `/comet` 当前入口路由主要写在 `assets/skills-zh/comet/SKILL.md` 的 Step 0 中，由 Agent 根据自然语言规则判断用户请求应进入 full、hotfix、tweak 或恢复已有 change。进入 `.comet.yaml` 之后，`domains/comet-classic/classic-resolver.ts` 已经通过确定性状态机路由后续阶段。

这个边界说明当前不稳定点不是阶段恢复和状态推进，而是“新请求进门时的 workflow 判定”。继续在 `SKILL.md` 里追加自然语言规则会让判断不可测、不可解释，也难以和 hotfix/tweak 的升级判定保持一致。

## 目标

1. 将 Classic `/comet` 的入口意图识别升级为结构化 `CometIntentFrame`。
2. 字段命名尽量对齐业界 NLU 和 Agent Router 常用术语，例如 `intent`、`entities`、`slots`、`confidence`、`evidence`、`route`、`fallback`。
3. 让 Agent 负责从用户请求和本地状态中填充 frame，让 Node runtime 负责校验、确定性打分和输出路由建议。
4. 保持后续 `.comet.yaml`、classic resolver 和阶段 Skill 的确定性行为，不把已稳定的阶段路由重新 prompt 化。
5. 对低置信度、多个 active change、用户意图和风险信号冲突等情况显式输出 `ask_user`，不得静默猜测。

## 非目标

- 不在首版升级 `/comet-any` 的 Skill 创作意图识别。`comet-any` 后续应拥有独立的 authoring intent frame。
- 不引入 LangExtract、Python runtime、云端 NLU 服务或外部模型依赖。
- 不让 runtime 直接调用 LLM。runtime 只校验 Agent 填写的结构化 frame 并执行确定性路由。
- 不改变 full、hotfix、tweak 的状态机定义和阶段流转顺序。
- 不把 `comet-open`、`comet-design`、`comet-build`、`comet-verify`、`comet-archive` 改造成意图识别 Skill。

## 核心设计

### CometIntentFrame

`CometIntentFrame` 是 Classic `/comet` 入口的结构化意图载体。Agent 在读取用户请求、active changes、必要仓库状态后填写最小 frame，然后调用 runtime 命令进行校验、补默认值和路由。

Agent-facing 最小输入只需要路由必需字段；runtime 归一化后会补齐 `locale`、`entities`、`slots.target_area`、`slots.scope`、`context.dirty_worktree` 以及 `proposed_route` 的派生字段。

```ts
type CometIntentFrame = {
  schema_version: 'comet.intent.v1';
  utterance: string;
  locale?: string;

  intent: {
    name: 'start_change' | 'resume_change' | 'fix_bug' | 'make_tweak' | 'ask_question' | 'unknown';
    confidence: number;
  };

  entities?: Array<{
    type:
      | 'change_id'
      | 'workflow'
      | 'file_path'
      | 'command'
      | 'capability'
      | 'bug_signal'
      | 'risk_signal';
    value: string;
    text: string;
  }>;

  slots: {
    requested_action:
      | 'start'
      | 'resume'
      | 'continue'
      | 'fix'
      | 'modify'
      | 'create'
      | 'verify'
      | 'archive'
      | 'question'
      | 'unknown';
    workflow_candidate: 'full' | 'hotfix' | 'tweak' | null;
    user_explicit_workflow: 'full' | 'hotfix' | 'tweak' | null;
    change_id: string | null;
    target_area?: string | null;
    scope?: 'small' | 'medium' | 'large' | 'unknown';
    existing_behavior: boolean | null;
    new_capability: boolean | null;
    public_api_change: boolean | null;
    schema_change: boolean | null;
    cross_module_change: boolean | null;
  };

  context: {
    active_changes_count: number;
    active_change_names: string[];
    dirty_worktree?: boolean | null;
  };

  evidence: Array<{
    field: string;
    quote: string;
    source: 'user' | 'repo' | 'state';
  }>;

  proposed_route: {
    name: 'full' | 'hotfix' | 'tweak' | 'resume' | 'ask_user' | 'out_of_scope';
    next_skill?:
      | 'comet-open'
      | 'comet-hotfix'
      | 'comet-tweak'
      | 'comet-design'
      | 'comet-build'
      | 'comet-verify'
      | 'comet-archive'
      | null;
    confidence: number;
    requires_confirmation?: boolean;
    fallback_reason?: string | null;
  };
};
```

### 字段命名原则

- `intent` 表示用户高层意图，取值保持通用，不直接绑定 Comet 内部阶段名。
- `entities` 表示从原始文本或状态中抽出的实体，保留 `text` 作为源文片段；最小输入可省略，runtime 默认 `[]`。
- `slots` 表示归一化后的业务槽位，负责承接 workflow 和风险信号等路由特征；`target_area`、`scope` 是解释和未来扩展字段，最小输入可省略。
- `context` 表示运行时上下文，例如 active change 数量和工作区状态；入口路由必填 active change 数量与名称，`dirty_worktree` 由后续专门协议处理，最小输入可省略。
- `evidence` 记录字段依据，要求关键路由结论能追溯到用户话语、仓库状态或 `.comet.yaml` 状态。
- `proposed_route` 是 agent 提交的候选路由；最小输入只需 `name` 和 `confidence`，runtime 会复核并输出最终 `route`。`proposed_route.confidence` 只用于诊断 agent 候选路由，不参与低置信度 fallback；低置信度安全判定以 `intent.confidence`、关键 evidence 和风险冲突为准。

### 路由规则

runtime scorer 基于 frame 输出唯一 `route.name`：

1. 用户明确要求恢复、继续或指定 active change，且存在匹配 change 时，输出 `resume`。
2. 用户请求修复已有异常、回归、错误行为，且 `new_capability`、`public_api_change`、`schema_change`、`cross_module_change` 均不为 `true` 时，输出 `hotfix`。
3. 用户请求文案、配置、文档、prompt 或可收敛为单一 OpenSpec change 的轻中量修改，且不需要完整设计时，输出 `tweak`。
4. 用户请求新增能力、架构调整、public API、schema 变更或跨模块协作时，输出 `full`。
5. 多个 active change 且用户未明确 change 时，输出 `ask_user`。
6. `intent.confidence` 低于阈值，或关键槽位缺少 evidence 时，输出 `ask_user`。`proposed_route.confidence` 是 agent 候选路由的诊断输入，不作为 workflow 自动选择依据。
7. 用户只是问问题且没有要求启动或恢复 Comet change 时，输出 `out_of_scope` 或 `ask_user`，由入口 Skill 解释不启动工作流。

用户显式 workflow 优先级高于推断 workflow，但显式 workflow 与风险信号冲突时不得直接执行。例如用户说“走 hotfix，但要新增 public API”，runtime 应输出 `ask_user`，fallback reason 指出冲突。

## 组件改动

### `domains/comet-classic/classic-intent.ts`

新增 Classic intent 领域模块：

- 导出 `CometIntentFrame` 类型。
- 校验 schema version、枚举、置信度范围、evidence 必填约束。
- 提供 `resolveCometIntentRoute(frame)`，返回规范化 route 和诊断信息。
- 提供轻量 explain 信息，便于 Skill 给用户展示“为什么需要确认”。

### Classic runtime launcher

新增薄 launcher，例如：

```text
assets/skills/comet/scripts/comet-intent.mjs
```

launcher 继续保持薄封装，只 import 生成后的 `comet-runtime.mjs` 并调用 intent 命令。业务逻辑保留在 `domains/comet-classic/`。中英文 Skill 共用 `assets/skills/comet/scripts/comet-intent.mjs`；中文资产只更新脚本定位引用，不新增 `assets/skills-zh/comet/scripts/`。

### `assets/skills-zh/comet/SKILL.md`

将 Step 0 从自然语言预设检测改为：

1. 读取用户请求和 active change 列表。
2. 填写 `CometIntentFrame`。
3. 优先用 `node "$COMET_INTENT" route --stdin` 传入 frame JSON，避免用户原话里的引号破坏 shell 参数。
4. 根据 runtime route 进入 `/comet-hotfix`、`/comet-tweak`、`/comet-open` 或用户确认点。

Skill 文档保留人类可读规则，但规则只用于意图识别槽位提取，而不是最终事实源。主入口 Skill 必须包含紧凑 `CometIntentFrame` 骨架，骨架使用 `proposed_route` 表示 agent 候选路由，避免 agent 只能通过 validation error 反推必填字段。完整字段说明放在 `comet/reference/intent-frame.md`，由中英文 Skill 渐进式加载，避免主入口变成 schema reference。

### `assets/skills-zh/comet-hotfix/SKILL.md`

只做最小同步：

- 若由 `/comet` 入口传入 intent frame，hotfix build 前复核 `risk_signal` 和升级信号。
- 若发现新增 capability、public API、schema 变更、跨模块协调等信号，进入现有升级决策点。
- 不重新实现入口意图识别。

### `assets/skills-zh/comet-tweak/SKILL.md`

只做最小同步：

- 若由 `/comet` 入口传入 intent frame，tweak build 前复核 `risk_signal` 和升级信号。
- delta spec 仍是 tweak 的正常产物，不因存在 delta spec 自动升级。
- 不重新实现入口意图识别。

### 英文 Skill 同步

按仓库规则，先完成中文 Skill 调整并确认语义，再同步 `assets/skills/` 英文版本。不能只改英文或只改发布生成物。

## 数据流

```text
用户输入
  -> /comet Skill 读取 active changes 和必要状态
  -> Agent 填写 CometIntentFrame
  -> comet-intent runtime 校验 frame
  -> runtime scorer 输出 route
  -> /comet 根据 route 调用对应 Skill 或进入用户确认点
  -> .comet.yaml 初始化 workflow
  -> classic resolver 继续确定性阶段路由
```

## 错误处理

- frame JSON 无效：输出校验错误，入口 Skill 修正 frame 后重试一次；仍失败则向用户报告无法判定。
- 缺少关键 evidence：输出 `ask_user`，说明缺失字段。
- 用户显式 workflow 与风险信号冲突：输出 `ask_user`，列出冲突。
- active change 状态读取失败：回到现有 `openspec list --json` 错误处理。
- route 指向不存在 Skill：停止流程，提示安装或启用对应 Skill。

## 测试策略

新增或扩展 `test/domains/comet-classic/` 覆盖：

- 明确 bug 修复路由到 `hotfix`。
- 文档、配置、prompt 小改路由到 `tweak`。
- 新增 capability、public API、schema change、跨模块协调路由到 `full`。
- 用户显式 workflow 与风险信号冲突时路由到 `ask_user`。
- 多个 active change 且用户未指定 change 时路由到 `ask_user`。
- 用户明确 resume 且指定 change 时路由到 `resume`。
- 低置信度或缺少 evidence 时路由到 `ask_user`。
- invalid frame schema 返回可读错误。
- launcher 被加入 Classic runtime 脚本测试拷贝列表和 manifest。

## 发布与兼容

- 这是用户可见行为变化，需要写入 `CHANGELOG.md`。
- 新版本号与 `package.json` 保持一致，并按 master 当前版本只提升一个版本。
- 新增 runtime 源码后必须运行 `pnpm build:classic-runtime` 同步 `assets/skills/comet/scripts/comet-runtime.mjs`。
- 新增 launcher 或 runtime 文件必须加入 `assets/manifest.json` 和 `test/domains/comet-classic/comet-scripts.test.ts` 的相关拷贝列表。
- 现有 `.comet.yaml.workflow` 枚举保持 `full | hotfix | tweak`，不新增 workflow 值。

## 验收标准

- [x] `/comet` 入口不再把 hotfix/tweak 预设检测只写成自然语言规则，而是要求填充并校验 `CometIntentFrame`。
- [x] intent runtime 对同一 frame 输出确定性 route。
- [x] 低置信度、证据不足和冲突场景不会自动选择 workflow。
- [x] hotfix/tweak 阶段 Skill 不重复入口识别，只复核升级信号。
- [x] Classic resolver 的阶段路由行为保持不变。
- [x] 中英文 Skill 在确认后同步。
- [x] Classic runtime 生成物、manifest 和脚本测试全部同步。
- [x] Changelog 只描述最终用户可感知的入口路由升级，不记录开发过程。

## 风险

- Agent 仍负责填充 frame，首版不能完全消除模型判断差异；runtime 校验和 evidence 要尽量把差异压到 `ask_user`。
- 过多槽位会让入口 Skill 变重；首版字段应只覆盖 full/hotfix/tweak/resume/ask_user 必需信息。
- 如果 Skill 文档继续保留过多旧自然语言判断，可能形成双事实源；修改时应明确 `CometIntentFrame + runtime scorer` 是事实源。
- 如果后续把 `comet-any` 合进同一 frame，会污染 Classic workflow 语义；应另起 authoring intent frame。

## 结论

Classic `/comet` 应将入口意图识别从 prompt-only 规则升级为：

```text
Agent 填槽
  + evidence
  + Node runtime 校验
  + 确定性 scorer
  + ask_user fallback
```

这能在不引入外部依赖、不扰动稳定状态机的前提下，让 full、hotfix、tweak 和 resume 的入口判定更可解释、可测试、可演进。
