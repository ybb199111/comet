# News

## 0.4.0-beta.1 — 2026-07-06

这是 0.4.0 的首个 beta。相对 0.3.9，Comet 从一个依赖 Bash/WSL 的工作流脚本层，升级为跨平台 Node 运行时，并从 `/comet` 工作流 bundle 扩展成覆盖**工作流执行、Skill 创建、Skill 评估、发布分发和本地可视化诊断**的平台。下面只列 0.3.9 用户升级后能感知到的最终形态，不记录分支开发过程。

### 跨平台 Classic 运行时

内置 `/comet` 工作流脚本现在由薄 `.mjs` launcher 调用 TypeScript Classic 运行时生成的共享 `comet-runtime.mjs`。同一套 `/comet`、`/comet-open`、`/comet-build`、`/comet-verify` 等命令可以在 Windows、macOS、Linux 上运行，不再要求 Git Bash、WSL 或 Bash 兼容 shell。

Classic 控制元数据迁到 `comet/runtime/classic`，命令脚本继续保持原有行为；机器侧运行检查点从 `.comet.yaml` 分离到 `.comet/run-state.json`，用户可编辑的工作流字段仍保留在 YAML 中。阶段变化还会写入 `.comet/state-events.jsonl`，便于审计和恢复。

### 组合任意 Skill（`/comet-any`）

`/comet-any` 成为创建或升级可复用 Skill 的主路径。它的核心是**不限于 Comet 自带工作流**：你可以把 Comet 的、第三方的或自己写的 Skill，用 Workflow Nodes、Skill Bindings、Output Schemas、Guardrails、Handoffs 和 Required Skill Calls 组装成一个新的多步工作流，让它像真正编排好的 Skill 一样运行，而不是一个薄包装。

这条链路覆盖候选发现、可确认提案、Skill bundle 生成、决策区/指导区编写、authoring lanes、当前草稿 eval 就绪检查、评审批准、发布和分发预览。配套新增 `.comet/skill-preferences.yaml`，让项目可以声明偏好的 Skill、排序和 Skill Creator 提案，不必手工编辑内部 bundle 文件。

### Skill 创建、运行与发布命令

新增面向普通用户的 Skill Creator CLI 和本地 Skill 工具：

- **`comet creator`**：创建或恢复 Skill 创建流程，把普通创作路径和后端 Bundle 操作分开。
- **`comet publish`**：检查评审批准状态、执行发布，并在写入目标平台前预览分发结果。
- **`comet skill add|show|run|continue|check`**：安装、查看、运行、恢复和确定性检查本地 Skill 包，用快照把 Skill 执行从纯对话变成可审计流程。

### 评估任意 Skill（`comet eval`）

新增 `comet eval [target]`，既能评估 Comet 工作流，也能通过 `--skill-path` 评估任意本地 Skill 包。它会生成 manifest、任务 profile、HTML 报告、token/成本归因、Skill 调用证据检查、可配置模拟用户提示、回归检查，以及 pass@k / pass^k 指标，把"这个 Skill 到底行不行"变成可量化、可回归的判断。

评估能力也扩展到更完整的 Comet 工作流基准：内置任务增加到 20 个，覆盖依赖混淆、分层流式处理、持久化、审批、噪声抵抗、跨文件重构、可观测性配置、图执行审查、Agent memory 路由和框架选择等场景，用于更强的 CONTROL、0.3.9、0.4.0 对比。

### Eval 报告与追踪

Eval 结果现在区分 raw、analysis-set、flagged 和 excluded runs；CONTROL 作为业务能力基线处理；报告同时展示 overall、business、workflow 三组 pass@k / pass^k 视图，并生成带指标解释、rubric 维度解释、源码证据、失败归因、居中表格、中英文切换、Python 优先图表和 SVG fallback 的论文风格 Markdown/HTML 报告。

LLM-as-judge 现在要求显式配置 `BENCH_JUDGE_MODEL`，并使用独立的 `BENCH_JUDGE_*` provider 设置；缺少 judge 配置时报告 skipped，不再静默复用被测模型、endpoint 或凭据。LangSmith 运行也改为从主 `LANGSMITH_*` 配置派生 Claude Code tracing plugin 设置，trace 保持在配置的基础 project 中，hook logs 会保存到 artifact，必要时自动构建 tracing plugin 到 eval cache。

### 可视化每一个 change（`comet dashboard`）

新增 `comet dashboard`，启动本地只读浏览器看板，把当前项目下所有进行中和已归档的 change 一屏看清：阶段进度、artifact 分组、任务进度、verify 状态、下一步建议、风险信号、Git 上下文，以及带 metadata 的 artifact 预览。`--json` 输出同一份快照供 CI/脚本使用，`--port` 固定端口，`--no-open` 用于 SSH/容器环境，`GET /api/dashboard` 暴露同样的数据结构给其他工具消费。

### 平台、安装与项目配置

- **新增平台**：加入 ZCode、MimoCode、Trae CN 和 Antigravity 2.0 支持。Antigravity 2.0 全局安装使用 `~/.gemini/config/skills/`，ZCode 和 MimoCode 使用 OpenCode 兼容布局，Trae CN 使用 `.trae-cn/skills`。
- **Skill 安装模式**：`comet init` 和 `comet update` 支持从共享 `.comet/skills/` store 复制安装，也支持 symlink/junction 安装。
- **Artifact 语言配置**：`comet init` 会把项目 artifact 语言（`en` 或 `zh-CN`）写入 `.comet/config.yaml`，新 change 会快照到 `.comet.yaml`。OpenSpec 和 Superpowers artifact 按这个配置输出，而不是按触发请求的语言漂移；guard 会拒绝明显不符合配置语言的 workflow artifact，并忽略 fenced code block，避免命令、路径或 hash 误判。
- **项目配置合并**：`comet init` 和 `comet update` 对 `.comet/config.yaml` 做字段级合并，保留用户已有值，补齐缺失的托管字段，刷新注释，保留额外字段；损坏 YAML 会安全回退到默认值。

### 工作流语义变化

- **产品定位**：README、CLI help 和 Skill guidance 现在把 Comet 表达为工作流与 Skill 平台：运行引导式工作流、创建 Skill、评估 Skill、发布 Skill、诊断卡住的 change。
- **`/comet` 路由**：`/comet` 使用显式 intent-frame 路由模型，区分 full、hotfix、tweak、resume 和 ambiguous 请求。`/comet-tweak` 收敛为 tweak-only 的 OpenSpec action path；完整 `/comet` 仍走 Superpowers design/plan/build 路径。
- **Hotfix/tweak 升级判断**：hotfix 和 tweak 工作流新增定性升级信号；文件数量阈值现在暂停让用户确认，而不是自动强制升级为 full workflow。
- **Review workflow**：full workflow 的 `review_mode` 默认改为 `standard`，`off`、`standard`、`thorough` 形成更清晰的审查强度梯度。Comet 统一拥有 review dispatch policy，避免用户为 Superpowers 和 Comet 的重叠审查循环重复付费。
- **交互式决策点**：Comet 决策点优先使用 Claude Code 的结构化问题 UI，其他平台使用文本 fallback。
- **异常调试协议**：Debug Gate 可以先并行调查相互独立的失败组，再按配置的 review flow 串行应用修复。

### 仓库、文档与 CI

- **仓库结构**：源码按 `app/`、`domains/`、`platform/`、`scripts/` 分层，测试移动到对应的 `test/app/`、`test/domains/`、`test/platform/`、`test/scripts/`、`test/repository/` 根目录，方便按责任维护。
- **CI smoke 入口**：新增 `test:script-smoke` package script，GitHub Actions 也走同一个 Classic launcher smoke suite，贡献者和 CI 运行同一组脚本冒烟检查。
- **README eval 证据**：README 现在直接展示 pass@5 / pass^5 和核心 rubric/judge 指标，让 no-Comet、0.3.9、0.4.0 的基线对比不必打开完整 eval 报告也能看见。
- **README 格式策略**：根 README 从 Prettier 检查中排除，避免用户可见文案和精确术语被 formatter 自动换行改写。

### 修复

- **Windows 路径含空格**：修复 `comet init` / `comet update` 调 OpenSpec 时项目路径含空格导致失败的问题。
- **Git submodule 脚本定位**：Agent 在 Git submodule 内工作时，Comet hook 和 runtime script 会使用包含它的项目根目录查找脚本，避免 `.claude/skills/comet/scripts/*` 只在父项目存在时失败。
- **Superpowers workspace 写入**：阶段写入保护允许 Superpowers 写入自己的 `.superpowers/` workspace，不再把进度文件误判为受保护阶段的源码写入。
- **`comet doctor` 诊断**：版本、project/global scope、malformed state、缺失证据和恢复建议更清晰，用户能区分真实缺失的项目安装、有效的全局安装和当前 `.comet.yaml` 状态问题。
- **Review mode 一致性**：英文、中文、共享规则和恢复指导现在都使用一致的 `review_mode` 语义，不再描述与运行时 guard/state 检查冲突的旧双重审查流程。
- **安装结果汇总**：`comet init` 把部分失败的平台移出 `Installed`，并在 `Failed` 中标出失败组件，例如 `OpenCode (OpenSpec failed)`。
- **Classic runtime 安装载荷**：发布 manifest 现在包含共享 `comet-runtime.mjs`，`comet init` 会安装可运行的 Classic launcher，而不是只复制 launcher、漏掉 runtime 依赖。
- **Trae CN 初始化**：Trae CN 仍使用 `.trae-cn/skills`，但 OpenSpec 初始化会复用受支持的 `trae` tool id，`comet init --platform trae-cn` 不再因为 unsupported OpenSpec tool value 失败。
- **Skill Creator source selection**：`comet creator resolve` 在需要时按物理路径匹配已选择的 source path，避免 macOS `/var` 与 `/private/var` 临时目录别名让已有 Skill source 看起来丢失。
- **pre-commit 可执行位**：`.husky/pre-commit` 现在以可执行模式发布，避免 clone/checkout 后 Git 静默跳过 husky + lint-staged 自动格式化。

### 移除

- **Bash-first Classic scripts**：不再要求内置 Classic 工作流脚本通过 Bash 兼容 shell 运行，Node launcher 和跨平台运行时成为默认契约。

### 安全

- **Dependabot 依赖告警**：npm 和 pnpm lockfile 中的测试工具链固定到修复后的 Vite 和 esbuild 版本，清理 Vite path traversal、launch-editor 和 esbuild dev-server 告警，不改变 Comet runtime 依赖。

## 0.3.9 — 2026-06-16

### 阶段守护加固

补齐 `open → build`（跳过 `design`）的检测漏洞：`comet-state.sh` 在每次阶段前进时强制证据校验，`comet-hook-guard.sh` 在 `design_doc` 为空时直接拦截源码写入，`comet-phase-guard` 规则新增前置制品自检。Hook 守卫按 change 隔离，避免旧 change 的 phase 误拦新 change 的写入。

### 可选 npm 依赖

`comet init` / `comet update` 不再强制安装 OpenSpec、Superpowers、CodeGraph CLI，改为多选提示：未检测到的依赖默认勾选，已存在的默认不勾（用户可自主升级）。Superpowers 项额外推荐安装 v6.0.0+（速度快约 2 倍，节省约 50% token）。

### CLI 国际化

`comet init` 新增 `--language en|zh` 选项；`update` 命令完整支持中英文提示（横幅、npm 更新进度、摘要、CodeGraph 提示等）。新增 `app/commands/i18n.ts` 共享翻译表。

### Review Mode

新增 `review_mode: off|standard|thorough`，用于控制 Build / Verify 阶段的自动代码审查强度；full workflow 在离开 Build 前必须选择模式，hotfix/tweak 默认 `off`。项目级 `.comet/config.yaml` 也可配置默认值，新建 full workflow change 时会快照到 `.comet.yaml`。

| 模式       | 审查强度 | 含义                                                                                                                                           | 适用场景                                                  |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `off`      | 最低     | 不自动派发代码审查、reviewer 或 review-fix agent；任务完成依赖实现者自测、构建/测试证据、工作树确认和 task 勾选验证。                          | 文档、配置、文案、小范围低风险改动；hotfix/tweak 默认值。 |
| `standard` | 中等     | 所有任务完成后运行一次最终轻量代码审查，只检查正确性、安全和边界条件；CRITICAL/IMPORTANT 问题最多自动修复并复查 1 轮，仍未通过则交给用户决策。 | 默认推荐，适合大多数普通功能或修复。                      |
| `thorough` | 最高     | 按批次或风险边界运行合并审查，最后再运行一次完整审查；批次审查和最终审查各最多 2 轮审查-修复，仍未通过则暂停交给用户。                         | 高风险、多模块、架构或安全相关改动。                      |

`review_mode: off` 只跳过自动代码审查，不跳过构建、测试、安全检查或异常调试协议。

### 其他

- `comet init` 检测 Codex 插件缓存中已安装的 Superpowers（`~/.codex/plugins/cache/...`），避免重复安装（[#115](https://github.com/rpamis/comet/pull/115)）。
- 中文术语规范化：`gate` 不再直译为"门"。
- `comet uninstall` 多平台场景改为 checkbox 选择。
- macOS 上 `bin/comet.js` 等脚本权限修复为 `100755`。

## 0.3.8 — 2026-06-13

### Kimi Code CLI 支持

新增 Kimi Code 为第 29 个支持平台，覆盖 `.kimi-code/` 下的项目/全局 skill 安装、OpenSpec `kimi` 工具集成、Superpowers `kimi-code-cli` 映射与检测（[#90](https://github.com/rpamis/comet/pull/90)）。

### `comet uninstall` 命令

新增 `comet uninstall [path]` 安全移除 Comet 分发的 skills、rules、hooks，支持 `--scope`、`--force`、`--json`。覆盖 29 个平台、7 种 hook 格式、3 种 rule 格式，仅清理 Comet 管理的产物（[#95](https://github.com/rpamis/comet/issues/95)）。

### 子代理调度扩展

把内联的子代理调度协议抽到 `comet/reference/subagent-dispatch.md`（中英双语），基于 Superpowers `subagent-driven-development` 沉淀 Comet 扩展：真实后台调度、每任务持久化 checkpoint、协调者独占源码执行、TDD 由后台代理负责、有限轮次 review-fix、连续执行不暂停。新增 `comet-state task-checkoff <file> <task-text>` 用于任务勾选验证。

### Hook 合并保护

Claude Code / Codex / Amazon Q / Qwen / Qoder / Gemini / Windsurf 的 hook 配置在 init/update 时保留用户已有 hook，按 matcher/event 区分；Comet 自己的命令按 manifest 路径识别并原地替换，避免重复累积。

### 其他

- `comet update --registry https://registry.npmjs.org` 强制走官方源（[#100](https://github.com/rpamis/comet/issues/100)）。
- 启动时显示版本并检查 npm registry 是否有新版本（[#99](https://github.com/rpamis/comet/issues/99)）。
- 抽取 `decision-point.md` / `debug-gate.md` / `auto-transition.md` / `context-recovery.md` 等共享参考文档，按需加载降低每次调用的 token 开销。
- husky + lint-staged pre-commit 自动 prettier。
- OpenSpec 制品按 `openspec instructions ... --json` 加载 context/rules/template（[#66](https://github.com/rpamis/comet/issues/66)）。
- Pi slash 命令注册与生命周期（[#89](https://github.com/rpamis/comet/issues/89)）。
- 符号链接安全的卸载与文件复制（[#85](https://github.com/rpamis/comet/issues/85)）。

## 0.3.7 — 2026-06-07

### CodeGraph 语义代码索引

`comet init` 和 `comet update` 现在支持一键安装 [CodeGraph](https://github.com/colbymchenry/codegraph)（`@colbymchenry/codegraph`），为 Agent 提供语义代码索引能力。自动检测 7 个支持平台（Claude Code、Cursor、Codex、OpenCode、Gemini、Kiro、Antigravity），安装 CLI 并初始化项目索引。`comet doctor` 可检查 CodeGraph 状态。

官方数据：成本降低约 **16%**，工具调用减少约 **58%**。

### 上下文压缩（Beta）

Design → Build 阶段交接时的 spec 投影压缩。启用后 Build 阶段输入 token 降低 **25–30%**，大型任务绝对节省可达 15,000 tokens。Beta 模式使用全文投影（`cat`），支持中英文 Spec，无需求关键词依赖。

启用：`.comet.yaml` 设置 `context_compression: beta`

详见 [CONTEXT-COMPRESSION.md](docs/CONTEXT-COMPRESSION.md)。

### 主动上下文压缩机制

Design 阶段新增 Step 1e 主动式上下文压缩：Brainstorming 完成后、创建 Design Doc 前，Agent 主动触发平台原生上下文压缩（如 Claude Code 的 compact），释放读取 Spec 和 brainstorming 消耗的上下文，为后续 Build 阶段保留窗口。压缩后自动重新加载 handoff 文件继续执行。不支持程序化触发的平台会暂停提示用户手动压缩。

### 自动流转（Auto Transition）

`auto_transition` 控制阶段推进后是否自动调用下一个 Skill，还是暂停等待用户手动触发。默认 `true`（全自动），设为 `false` 可在阶段间暂停审查。支持三层配置优先级：环境变量 `COMET_AUTO_TRANSITION` > `.comet/config.yaml`（项目级）> `.comet.yaml`（change 级）。适用于所有工作流类型（full / hotfix / tweak）。

详见 [AUTO-TRANSITION.md](docs/AUTO-TRANSITION.md)。

### Token 优化套件

6 项独立优化，默认开启，不需要启用 beta 上下文压缩：

| 优化项                   | 节省效果                       |
| ------------------------ | ------------------------------ |
| TDD skill 单次加载       | ~44K tokens / 10-task workflow |
| Brainstorming checkpoint | 压缩恢复点，防止决策丢失       |
| Plan 创建子代理卸载      | 主会话上下文释放               |
| Verify skill 去重        | 消除冗余 skill 内容            |
| tasks.md 增量扫描        | grep 替代全文读取              |
| Hash 按需读取            | 跳过未变更的 OpenSpec 制品     |

### 防漂移阶段守护

长上下文会话中 Agent 容易遗忘当前阶段，导致在 `open`/`design` 阶段误写源码。0.3.7 新增两层防护：

- **Rule（软提醒）**：`.claude/rules/comet-phase-guard.md` 每轮注入阶段感知、Skill 调用规范、脚本执行要求和上下文压缩恢复指令。适用于所有平台。
- **Hook（硬拦截）**：`comet-hook-guard.sh` PreToolUse hook 在 `open`/`design`/`archive` 阶段直接拦截文件写入，白名单 `openspec/*`、`docs/superpowers/*`、`.claude/*`、`.comet/*` 路径。仅 Claude Code 等支持 hook 的平台生效。

### 其他重要变更

- **TDD 模式**：`.comet.yaml` 新增 `tdd_mode`（`tdd`|`direct`），用户可选择是否在 build 阶段强制 TDD
- **子代理调度确认**：`.comet.yaml` 新增 `subagent_dispatch`，确保 `subagent-driven-development` 模式在平台真实支持后台调度后才离开 build 阶段
- **PRD 拆分预检**：`/comet-open` 在创建 OpenSpec 制品前对大型 PRD 进行分流，允许拆分为多个 Comet change
- **验证重试限制**：连续 3 次 verify-fail 后强制用户决策，防止无限重试
- **归档前确认与回退**：`/comet-archive` 在执行归档脚本前暂停等待用户确认，拒绝后可通过 `archive-reopen` 返回 verify 阶段调整，无需手动编辑 `.comet.yaml`
- **系统化调试拦截**：build/hotfix 阶段遇到崩溃或测试失败时必须加载 `systematic-debugging` skill，确保根因定位后才修复
- **验证完成检查**：`/comet-verify` 执行前必须加载 `verification-before-completion` skill，强制基于证据的完成确认
- **50% 范围阈值第三选项**：变更超过 50% 范围时新增"继续在当前 change 中完成"选项，不再强制拆分
- **平台中性确认机制**：去除 `AskUserQuestion` 硬编码，Codex 等非 Claude Code 平台使用各自的确认机制

完整变更列表见 [CHANGELOG.md](CHANGELOG.md)。
