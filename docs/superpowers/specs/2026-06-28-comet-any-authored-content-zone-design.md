# Comet Any 内容创作区设计（Authored Content Zone）

日期：2026-06-28

状态：设计增补，待实现。本文修正 `2026-06-28-comet-any-authoring-protocol-design.md` 的一个偏差：生成模板不应试图"写满"skill，领域决策内容必须由 agent 动态创作。

## 背景

authoring-protocol 设计落地后，实测产物（`team-comet-execute/SKILL.md` 约 45 行）与 comet 原始 skill（`comet-build/SKILL.md` 326 行、`comet/SKILL.md` 237 行）差距很大。根因不是"模板不够丰富"，而是**方向错了**：再大的静态模板也写不出领域决策（不知道 elementui 的 API、项目组件约定、具体 workflow 取舍）。comet 的质量来自**人类作者写的领域决策**，脚本是控制面兜底。comet-any 要达到同等质量，应**用 LLM agent 替代人类作者**，而不是把模板做大。

content-merge 管道已就绪，但生成器**在没有 agent 草稿时也产出"看起来完整"的薄 skill**，让 agent 创作变成可选项——这正是最初 review 的 CRITICAL（subagent 创作与生成器脱节）只修了一半的体现。

## 目标

- 每个 SKILL.md 显式分 **Auto 区**（确定性脚手架）与 **Authored 区**（agent 动态创作的领域决策）。
- Auto 区只承载不变的控制面；Authored 区由 agent 创作，模板绝不伪造。
- 区分节点类型：**delegates**（委托给已安装富 skill，薄是对的）vs **substance**（自身就是决策主体，必须有 agent 创作）。
- **substance 节点缺少 Authored 内容时，包不得 ready**（确定性门禁，不只靠 LLM 判断）。
- 创作 brief 以 comet 真实 skill 为质量标尺。

## 非目标

- 不让模板承担领域散文（模板只做控制面 + 章节大纲）。
- 不要求 delegates 节点强制创作（复制富 skill 反而违反"禁止整段复制"）。
- 不改变 runtime 侧 workflow-protocol.json 契约与脚本读取逻辑。

## 模型

### 节点 SKILL.md 结构（两区）

```text
---frontmatter（Auto：name/description）---
# {label}（Auto）
## Node Goal（Auto：responsibility）
## Guidance（Authored：agent 决策内容；草稿注入）
## Entry Check（Auto：bootstrap + 脚本调用）
## Skill Implementation（Auto：implementation 指针）
## Required Skill Calls（Auto：何时调/记什么）
## Output Schemas（Auto：完成判定 + 证据）
## Evidence Record（Auto：记录格式）
## Guardrails（Auto：阻断条件）
## Exit Check（Auto：退出脚本）
## Recovery（Auto：恢复入口）
```

### entry SKILL.md 结构（两区）

```text
---frontmatter（Auto）---
# {name}（Auto）
## Decision Core（Authored：agent 写——如何判断当前节点/何时暂停/Red Flags）
## Workflow Nodes（Auto：路由表）
## Skill Bindings（Auto）
## Guardrails And Evidence（Auto）
## Runtime And Recovery（Auto：bootstrap）
```

### nodeAuthoringMode 派生（确定性）

- `workflowProtocol.kind === 'comet-five-phase-overlay'` → 所有节点 `delegates`。
- `workflow-kernel` → 节点默认 `substance`。

Authored 区渲染规则：

| 模式 | 有草稿 | 无草稿 |
|---|---|---|
| delegates | 注入 agent 内容 | 薄委托注："本节点委托 `<skill>`；加载它，按下方的 required skill calls 与证据要求记录。" |
| substance | 注入 agent 内容 | **待创作桩**：`⚠ Not yet authored. This substance node requires skill-core draft.` + 机读标记 `<!-- AUTHORING PENDING -->` |

### 草稿语义变化

agent 的草稿是 **Authored 区的内容**（决策散文），不是整个文件。生成器组装 `Auto 区 + Authored 区`。frontmatter、bootstrap、证据格式等控制面由 Auto 区提供，agent 不需要也不应重写。

## 强制创作门禁

生成器输出 `unauthoredSubstanceNodes: string[]`（缺 Authored 草稿的 substance 节点列表）。factory 透传到 `generatedSkillPackage`。`review-summary`：factory 包的 `unauthoredSubstanceNodes` 非空 → readiness blocker `[authoring] Substance nodes lack authored content: ...`。缺创作内容的包**不得 ready / 不得 publish**。

## 模块划分

- `domains/factory/types.ts`：`GeneratedFactorySkillPackage.unauthoredSubstanceNodes?`。
- `domains/bundle/types.ts`：`BundleGeneratedSkillPackage.unauthoredSubstanceNodes?`。
- `domains/factory/package.ts`：`nodeAuthoringMode()`；node/entry markdown 拆 Auto/Authored；`generateFactorySkillPackage` 返回 unauthoredSubstanceNodes。
- `domains/bundle/factory.ts`：透传。
- `domains/bundle/review-summary.ts`：门禁。
- 创作 brief（`subagents/skill-core-author.md`、`workflow-entry-author.md`，en+zh）：只创作 Authored 区，以 comet 真实 skill 为质量标尺 + 章节大纲。

## 验收标准

- 生成的 node/entry SKILL.md 含明确 Auto 区与 Authored 区。
- delegates 节点无草稿 → 薄委托注（非伪造完整）。
- substance 节点无草稿 → 显式待创作桩 + 机读标记；该节点出现在 `unauthoredSubstanceNodes`；`review-summary` 据此阻塞 ready。
- substance 节点有草稿 → Authored 区注入真实决策内容，Auto 区保持模板化。
- 富草稿 e2e：给 kernel 主体节点喂 80-120 行决策内容，产物在该节点具备 comet 级决策核心。
- 既有全量测试保持绿（content-merge 测试按"区"语义更新）。
