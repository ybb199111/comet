# Comet Any Skill Factory 设计

**日期：** 2026-06-21
**状态：** 已完成主体实现（Factory 后端、候选解析、生成、review/eval/publish/distribute、standalone run 与 readiness 基础已落地；后续体验闭环由 2026-06-23 UX spec 继续追踪）
**范围：** `/comet-any` 体验重定位与 Engine 闭环设计

## 1. 背景

现有 `/comet-any` 设计把它定位为 Skill Bundle Creator：用户通过 Skill 引导创建 Bundle，
CLI 负责候选发现、草稿、Eval、发布和分发。这个设计已经能表达平台无关的多 Skill
Bundle，但用户体验仍偏向“高级用户知道 Bundle 生命周期”，且 Engine 只作为可选元数据。

新的产品目标是：`/comet-any` 本身就是用户的创作入口。用户不需要学习 `comet bundle`
命令，也不需要知道 Engine CLI 的细节；用户只调用 `/comet-any`，描述目标或偏好，
Agent 读取本地真实 Skill 内容，组合并生成一个类似 `/comet` 的 Comet-native Skill，
再由 `/comet-any` 内部调用 CLI 完成校验、发布和跨平台分发。

因此，本设计将 `/comet-any` 从“Bundle CLI 使用指南”重定位为
**Comet Skill Factory**：一个面向用户的 Skill 创作体验，内部使用 Bundle 后端和
Skill Engine 保证确定性、可恢复、可审计和可分发。

## 2. 目标

本阶段目标：

- `/comet-any` 作为唯一用户入口完成 Skill 创作、验证、发布和可选分发。
- 用户只需要调用 Skill，不需要手动执行 `comet bundle` 或 `comet skill` 命令。
- `.comet/skills.txt` 表示用户偏好和推荐调用顺序，`/comet-any` 必须本地查找真实 Skill
  内容，而不是只按名字推测。
- 产物默认是 Comet-native Skill：包含 `SKILL.md`、references、scripts，并可包含
  `comet/skill.yaml`、guardrails 和 runtime evals。
- 生成的 Skill 可以像 `/comet` 一样被分发到 Comet 支持的平台。
- CLI 是内部后端：负责状态、编译、校验、Eval、发布、分发和安全检查。
- Engine 是运行语义底座：负责生成 Skill 的结构化编排、guardrails、恢复和 eval 合同。
- 平台原生 Skill 仍是入口，但入口应指示 Agent 使用 Comet 生成的 Skill 语义；需要持久化时通过
  Engine runner 间接驱动。

## 3. 非目标

- 不要求普通用户理解或手动调用 Bundle 生命周期 CLI。
- 不让 CLI 直接调用 LLM 或替 Agent 做自然语言创作。
- 不把 Superpowers 或 OpenSpec 原始 Skill 改写成 Comet 私有版本。
- 不在没有用户确认时执行创建期 Eval 或跨平台分发。
- 不把 `.comet/skills.txt` 解释为严格白名单；它是偏好输入和顺序信号。
- 不在第一版实现完全 adaptive 的自动规划 Agent runtime。
- 不让平台 Hook 或脚本绕过现有能力缺口检查和可执行披露确认。

## 4. 核心决策

- `/comet-any` 是产品界面，CLI 是内部实现细节。
- 生成物优先是 Comet-native Skill Package，再通过 Bundle 包装为跨平台分发单元。
- Bundle 不再只是“平台原生文件集合”；它应能承载 Engine-aware Skill 源码。
- Engine 不只是可选描述字段。对于需要恢复、guardrails、runtime evals 或多步骤协议的产物，
  Engine metadata 是默认生成内容。
- 平台分发后仍安装为平台原生 Skill，但 Skill 文案和脚本应知道如何定位 Comet runtime 或说明
  如何由当前 Agent 走 Engine action/outcome 协议。
- 用户偏好 Skill 必须通过本地 `find-skill` 解析为真实路径、内容、hash 和来源。
- `.comet/skills.txt` 的行顺序是用户偏好的推荐调用顺序。Factory 应尽量按该顺序设计
  entry/internal Skill 的调用链；如果因为目标、依赖、风险或平台限制偏离顺序，必须在评审摘要中说明原因。
- `/comet-any` 允许推荐不启用 Engine 的轻量 Skill，但必须显式说明能力损失。

### 4.1 当前实现对齐状态（2026-06-23）

本设计仍是 `/comet-any` Skill Factory 的产品和验收参考。当前代码已完成主体后端闭环；剩余差距集中在用户主路径、输出解释、README 任务路径和更细粒度 readiness 证据上，继续由 2026-06-23 UX spec 追踪。

已与当前代码吻合的部分：

- `assets/skills/comet-any/SKILL.md` 与 `assets/skills-zh/comet-any/SKILL.md` 已把 `/comet-any` 定位为用户入口，CLI 是内部确定性后端。
- `domains/skill/find.ts` 和 `domains/bundle/candidates.ts` 已能从本地真实 Skill 解析候选，保留 `preferenceIndex`、`skillMd`、references、scripts、hash、missing 和 ambiguous 信息。
- `app/cli/index.ts` 与 Bundle command 已暴露 `factory-init`、`factory-generate`、`factory-resolve`、`eval-plan`、`eval-record`、`review-summary`、`publish` 和 `distribute` 等后端入口。
- `domains/bundle/factory-plan.ts`、`domains/bundle/factory.ts` 和 `domains/bundle/factory-resolve.ts` 已持久化 factory goal、preferred/resolved skills、plan hash、engine mode、runner mode，并在 resolve 后使旧 generated package 失效。
- `domains/factory/package.ts` 已生成 entry Skill、`reference/resolved-skills.json`、source summaries，并按 `engineMode` 输出 `comet/skill.yaml`、`guardrails.yaml`、`evals.yaml`。
- `domains/engine/standalone-run.ts` 与 `--run-id` 支持独立 `.comet/runs/<run-id>` 运行目录。

仍需由后续 UX 闭环继续推进的部分：

- 旧设计中的 `src/*` 路径已不再代表当前代码位置；实现应使用 `domains/*` 与 `app/*` 下的现有模块。
- Bundle-level `engine.enabled` 当前不是 Factory 主路径。Factory 主要通过生成 entry Skill 内的 `comet/` Engine 文件表达 Engine 语义。
- 生成的 Skill synthesis、guardrails、runtime evals 已具备最小可用形态，但仍需要更多真实 dogfood 来提升默认质量。
- review/eval/publish readiness 已有后端形态；仍需在用户输出中更清楚地区分阻塞类型、报告路径和下一步动作。

因此，本设计仍建议参考其中的产品模型、安全规则、用户流程和验收标准；具体文件路径、实现切分和完成度判断应以当前代码与 `2026-06-22-comet-priority-improvements-design.md` 为准。

## 5. 产品模型

```text
用户调用 /comet-any
        |
        v
读取目标、偏好、上下文
        |
        v
find-skill 解析本地真实 Skill
        |
        v
Agent 探索候选能力与组合方式
        |
        v
生成 Comet-native Skill 源码
        |
        +--> SKILL.md / references / scripts
        +--> comet/skill.yaml / guardrails.yaml / evals.yaml
        |
        v
内部 Bundle 后端
        |
        +--> 静态校验
        +--> 创建期 Eval
        +--> 人工评审
        +--> 发布 ready Bundle
        |
        v
询问用户是否分发
        |
        v
分发到 Claude / Codex / Gemini / Qwen / ... 等平台
```

用户看到的是 Skill 创作流程；CLI 只在 `/comet-any` 内部作为确定性工具运行。高级用户仍可通过
CLI 审计或恢复，但这不是主路径。

## 6. `find-skill` 偏好解析

### 6.1 输入

`/comet-any` 优先读取项目 `.comet/skills.txt`：

```text
brainstorming
writing-plans
test-driven-development
requesting-code-review
```

每一行可以是：

- Skill 名称，如 `brainstorming`。
- 带插件前缀的名称，如 `github:yeet`。
- 相对或绝对路径。
- 未来可扩展的标签或查询词。

文件顺序有语义：越靠前表示用户越希望先被考虑或先被调用。这个顺序不是强制执行顺序，
因为目标可能要求先执行依赖检查、上下文恢复或安全确认；但 Agent 偏离该顺序时必须记录理由。

### 6.2 查找范围

`find-skill` 必须从本地真实目录查找，不依赖固定平台假设：

- 项目级 Comet Skill：`<project>/.comet/skills/`。
- Comet 内置 Skill：`assets/skills/`、`assets/skills-zh/`。
- 当前平台项目级 Skill：`.codex/skills/`、`.agents/skills/`、`.claude/skills/` 等。
- 当前用户全局 Skill：`~/.codex/skills/`、`~/.agents/skills/`、`~/.claude/skills/` 等。
- 插件缓存贡献的 Skill。
- 现有 `PLATFORMS` 注册表能覆盖的项目级和全局目录。

### 6.3 输出

每个候选输出结构化结果：

```ts
interface FoundSkill {
  query: string;
  preferenceIndex: number | null;
  name: string;
  root: string;
  origin: 'project' | 'global' | 'builtin' | 'plugin' | 'explicit';
  platform?: string;
  description: string;
  skillMd: string;
  references: Array<{ path: string; contentHash: string }>;
  scripts: Array<{ path: string; sideEffect: 'unknown' | 'none' | 'read' | 'write' | 'external' }>;
  hash: string;
}
```

缺失和歧义必须展示给用户。歧义时不得替用户选择；缺失时可以建议安装、忽略或替代。

当同一个 Skill 来自扫描而非 `.comet/skills.txt` 时，`preferenceIndex` 为 `null`。当来自
`.comet/skills.txt` 时，`preferenceIndex` 必须保留去重后的首次出现顺序，用于后续调用链建模。

## 7. Skill Factory 输出

`/comet-any` 生成的源码目录应以 Comet-native Skill 为中心：

```text
<factory-output>/
  bundle.yaml
  skills/
    <entry-skill>/
      SKILL.md
      reference/
      scripts/
      comet/
        skill.yaml
        guardrails.yaml
        evals.yaml
    <internal-skill>/
      SKILL.md
      reference/
  references/
  scripts/
  assets/
  evals/
```

### 7.1 Entry Skill

Entry Skill 是用户实际调用的 Skill。它必须：

- 用自然语言说明目标、适用场景和停止点。
- 明确说明使用哪些 internal Skill、脚本和 guardrails。
- 对用户隐藏 Bundle CLI 细节。
- 在需要持久化/恢复时，指导 Agent 通过 Engine runner 启动或恢复 Run。

### 7.2 Internal Skill

Internal Skill 是组合后的辅助能力，不作为用户默认入口。它可以承载：

- 从偏好 Skill 中抽取出的稳定流程。
- 共享检查、评审、调试、测试、发布等子协议。
- 特定平台差异或资源引用。

### 7.3 Engine Package

当生成物包含多步骤流程、可恢复状态、guardrails、runtime evals 或脚本副作用时，必须生成
`comet/` 目录：

- `skill.yaml`：声明 goal、inputs、outputs、orchestration、skills、agents、tools。
- `guardrails.yaml`：限制可调用 Skill、Agent、Tool、迭代次数和确认要求。
- `evals.yaml`：声明 runtime evals，用于运行期验证。

轻量单步 Skill 可以不启用 Engine，但 `/comet-any` 必须说明这会失去 Run 恢复和 runtime eval。

## 8. Engine Runner

### 8.1 运行模型

生成 Skill 的平台入口不直接实现复杂状态机，而是间接使用 Engine：

```text
平台原生 Skill
      |
      v
定位 Comet runtime / CLI
      |
      v
comet skill run 或 resume
      |
      v
Engine 产生 pending action
      |
      v
当前 Agent 执行动作
      |
      v
comet skill resume --status ... --summary ...
```

CLI 仍不直接调用 LLM。Agent 执行动作，然后把 outcome 提交给 Engine。

### 8.2 Run 目录策略

生成 Skill 不能假设一定存在 OpenSpec change。需要支持两类运行目录：

- Change 绑定：用户在 Comet change 内运行时，使用 `openspec/changes/<name>/`。
- 独立运行：无 change 时，使用 `.comet/runs/<run-id>/`。

第一版可以优先实现 change 绑定，并在无 change 时让 `/comet-any` 生成的 Skill 创建独立 run
目录。两种模式必须共享同一 Run state、trajectory、artifacts 和 snapshot 语义。

### 8.3 Runner 脚本

需要新增一个薄 runner 脚本或 runtime 子命令：

```bash
comet skill start-or-resume <skill> --run-dir <dir> --json
```

或在现有命令上封装：

```bash
comet skill run <skill> --change <dir> --json
comet skill resume --change <dir> --json
```

平台 Skill 只负责说明和调用这个入口；真实状态推进仍由 Engine 完成。

## 9. Bundle 后端

`comet bundle` 继续存在，但角色调整为内部后端：

- `/comet-any` 调用 `draft create/optimize` 初始化状态。
- `/comet-any` 写入生成的 Skill Factory 源码。
- CLI 做结构校验、hash、compile、eval-record、review、publish、distribute。
- 用户只看到摘要、风险、能力缺口和确认问题。

CLI 文档应面向高级用户和自动化，但 `/comet-any` Skill 文案不应把 CLI 操作作为用户主流程。

## 10. `/comet-any` 用户流程

1. 恢复已有 factory 状态。
2. 询问用户目标：新建 Skill、优化已有 Skill，或组合偏好 Skill。
3. 读取 `.comet/skills.txt`，通过 `find-skill` 查找真实 Skill。
4. 展示缺失/歧义候选并等待用户处理。
5. 读取最终候选的 `SKILL.md`、直接 reference、rules、scripts 和 hooks；不执行候选脚本。
6. 总结候选能力、冲突、适用边界、组合机会和偏好顺序。
7. 先按 `.comet/skills.txt` 顺序提出默认调用链；如需要调整，列出每个调整的原因。
8. 与用户确认新 Skill 的入口、目标、非目标、成功标准、恢复需求、Eval 档位和分发平台。
9. 生成 Comet-native Skill 源码和可选 internal Skill。
10. 生成 Engine Package：`skill.yaml`、guardrails、runtime evals。
11. 内部调用 Bundle 后端编译并校验。
12. 展示 Eval 工作量，让用户选择 skip/quick/full。
13. 记录 Eval 证据；skip 或失败不得发布。
14. 展示评审摘要，等待用户显式批准。
15. 发布 ready Bundle。
16. 询问是否分发到 Comet 支持的平台。
17. 展示能力缺口和可执行披露，等待确认。
18. 内部调用分发后端写入平台原生 Skill/rules/hooks/scripts。

## 11. 安全与检查

- `/comet-any` 不得静默执行候选 Skill 脚本。
- 缺失或歧义 Skill 必须由用户处理。
- 生成 scripts 必须声明副作用；写入或外部副作用必须要求确认。
- 生成的调用链若偏离 `.comet/skills.txt` 顺序，必须在评审摘要中说明偏离项和原因。
- Engine guardrails 必须限制生成 Skill 可调用的 Skill、Agent 和 Tool。
- 创建期 Eval 必须绑定当前 Bundle/Skill hash。
- 旧 hash 的 Eval 或人工批准不得用于发布新内容。
- 分发 hooks/scripts 前必须展示可执行披露。
- CLI 内部状态文件只能由 CLI 写入，Agent 不得手写状态推进字段。
- 平台能力缺口不得静默降级。

## 12. 与现有设计的调整

需要修改上一版 `/comet-any` 设计中的以下假设：

- 将“Engine 只作为可选元数据或未来运行时信息”改为“Engine 是 Comet-native Skill 的运行语义底座，按流程复杂度默认生成”。
- 将“用户可手工调用 Bundle CLI 恢复流程”降级为高级审计能力；主路径必须由 `/comet-any` 自动调用。
- 将 `.comet/skills.txt` 从“名字列表”升级为“偏好查询输入”，由 `find-skill` 解析真实内容。
- 将 `.comet/skills.txt` 的行顺序升级为推荐调用顺序，生成调用链时尽量遵守；偏离必须解释。
- 将 Bundle 产物从“平台原生 Skill 集合”升级为“Comet-native Skill Package + 跨平台 Bundle 包装”。
- 将平台入口从“完全原生执行”调整为“原生入口 + Engine-aware 指引/runner”。

## 13. 实施切分

### 13.1 Find Skill

- 继续扩展 `domains/skill/find.ts`，不要新建第二套 Skill 解析器。
- 支持多根目录、插件 Skill、显式路径、歧义报告、hash、reference 摘要。
- 通过 `domains/bundle/candidates.ts` 桥接 Bundle candidates 与 Skill finder，保持 `.comet/skills.txt` 偏好顺序。

### 13.2 Factory State

- 继续使用并扩展 Bundle authoring state 中的 factory 语义：
  - `factoryGoal`
  - `preferredSkills`
  - `resolvedSkills`
  - `generatedSkillPackage`
  - `engineMode`
  - `runnerMode`
- 保持由 CLI 原子写入，不手写 JSON。

### 13.3 Engine Package Generator

- 继续扩展 `domains/factory/package.ts` 中从候选 Skill 和用户目标生成 entry Skill 与 `comet/skill.yaml` 草稿的适配层。
- 校验生成的 Skill Package 能被 `comet skill validate` 加载。
- 生成 guardrails 和 evals 的最小安全默认值。

### 13.4 Runner

- 基于 `domains/engine/standalone-run.ts` 继续完善 `.comet/runs/<run-id>` 或通用 `--run-dir`。
- 提供平台入口可调用的薄 runner 命令，并与 `/comet-any` 生成的 entry Skill 文案对齐。
- 确保 runner 不直接执行 LLM，只产生/接收 action outcome。

### 13.5 `/comet-any` Skill 文案

- 中文先改。
- 用户确认后同步英文。
- 删除“不得声称生成 Skill 需要 Engine 执行”的旧约束。
- 强调“用户不需要直接使用 CLI；CLI 是内部确定性后端”。

### 13.6 文档与 Changelog

- README 保持克制，只增加 `/comet-any` Skill Factory 的简短说明并链接 docs。
- 详细行为写入 docs。
- 中英文文档同步后再写 Changelog。

## 14. 测试策略

- `find-skill`：
  - `.comet/skills.txt` 注释、去重、顺序和 `preferenceIndex`。
  - 显式路径解析。
  - 项目/全局/内置/插件多来源歧义。
  - 缺失候选。
  - 读取真实 `SKILL.md` 和直接 reference 摘要。

- Factory generator：
  - 生成 entry/internal Skill。
  - 生成 `comet/skill.yaml`、guardrails、evals。
  - 默认调用链尽量遵守 `preferenceIndex`。
  - 偏离偏好顺序时输出结构化原因。
  - 生成物可通过 `comet skill validate`。
  - script Tool 路径安全和副作用声明。

- Runner：
  - change 绑定 run。
  - 独立 `.comet/runs/<run-id>` run。
  - start/resume 幂等。
  - pending action 不匹配失败关闭。

- `/comet-any` Skill：
  - 用户主流程不要求手动 CLI。
  - 明确读取本地真实 Skill。
  - 明确 CLI 是内部后端。
  - 明确 Engine-aware 产物。
  - 中英文行为对等。

- Bundle 分发：
  - 生成的 Comet-native Skill 能编译到至少一个参考平台。
  - 分发不复制 authoring/eval 状态。
  - hooks/scripts 仍要求确认。
  - 能力缺口仍阻塞或要求 skip。

## 15. 验收标准

1. 用户可以只调用 `/comet-any` 创建一个新的 Comet-style Skill。
2. 用户不需要手动运行 `comet bundle` 或 `comet skill` 才能完成主流程。
3. `.comet/skills.txt` 中的偏好会被解析为本地真实 Skill 内容。
4. `.comet/skills.txt` 的顺序会作为推荐调用顺序进入生成逻辑。
5. 生成物尽量遵守偏好顺序；无法遵守时必须输出偏离原因。
6. 缺失和歧义偏好会展示给用户处理。
7. 生成物包含可分发的 entry Skill。
8. 多步骤或高风险生成物包含 Engine Package。
9. 生成物可通过 `comet skill validate`。
10. 生成物可通过 Bundle 后端发布为 ready。
11. 用户确认后可分发到 Comet 支持的平台。
12. 分发后的平台 Skill 能引导 Agent 使用生成的 Skill，而不是要求用户学习 CLI。
13. 需要恢复或 guardrails 的流程能通过 Engine runner start/resume。
14. 创建期 Eval、人工评审、可执行披露和能力缺口检查不回归。
15. 中文和英文 `/comet-any` 行为一致。
16. Classic workflow 和现有 `comet bundle` CLI 行为不回归。
