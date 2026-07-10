# News

## 0.3.9 — 2026-06-16

### 阶段守护加固

补齐 `open → build`（跳过 `design`）的检测漏洞：`comet-state.sh` 在每次阶段前进时强制证据校验，`comet-hook-guard.sh` 在 `design_doc` 为空时直接拦截源码写入，`comet-phase-guard` 规则新增前置制品自检。Hook 守卫按 change 隔离，避免旧 change 的 phase 误拦新 change 的写入。

### 可选 npm 依赖

`comet init` / `comet update` 不再强制安装 OpenSpec、Superpowers、CodeGraph CLI，改为多选提示：未检测到的依赖默认勾选，已存在的默认不勾（用户可自主升级）。Superpowers 项额外推荐安装 v6.0.0+（速度快约 2 倍，节省约 50% token）。

### CLI 国际化

`comet init` 新增 `--language en|zh` 选项；`update` 命令完整支持中英文提示（横幅、npm 更新进度、摘要、CodeGraph 提示等）。新增 `src/commands/i18n.ts` 共享翻译表。

### Review Mode

新增 `review_mode: off|standard|thorough`，用于控制 Build / Verify 阶段的自动代码审查强度；full workflow 在离开 Build 前必须选择模式，hotfix/tweak 默认 `off`。项目级 `.comet/config.yaml` 也可配置默认值，新建 full workflow change 时会快照到 `.comet.yaml`。

| 模式 | 审查强度 | 含义 | 适用场景 |
| --- | --- | --- | --- |
| `off` | 最低 | 不自动派发代码审查、reviewer 或 review-fix agent；任务完成依赖实现者自测、构建/测试证据、工作树确认和 task 勾选验证。 | 文档、配置、文案、小范围低风险改动；hotfix/tweak 默认值。 |
| `standard` | 中等 | 所有任务完成后运行一次最终轻量代码审查，只检查正确性、安全和边界条件；CRITICAL/IMPORTANT 问题最多自动修复并复查 1 轮，仍未通过则交给用户决策。 | 默认推荐，适合大多数普通功能或修复。 |
| `thorough` | 最高 | 按批次或风险边界运行合并审查，最后再运行一次完整审查；批次审查和最终审查各最多 2 轮审查-修复，仍未通过则暂停交给用户。 | 高风险、多模块、架构或安全相关改动。 |

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

| 优化项 | 节省效果 |
|--------|---------|
| TDD skill 单次加载 | ~44K tokens / 10-task workflow |
| Brainstorming checkpoint | 压缩恢复点，防止决策丢失 |
| Plan 创建子代理卸载 | 主会话上下文释放 |
| Verify skill 去重 | 消除冗余 skill 内容 |
| tasks.md 增量扫描 | grep 替代全文读取 |
| Hash 按需读取 | 跳过未变更的 OpenSpec 制品 |


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
