# Comet Any 创作协议化设计（Authoring Protocol）

日期：2026-06-28

状态：设计稿，待实现。本文取代 `/comet-any` 创作侧"散文 + 手搓 JSON"的现状，作为 Phase 0–3 的统一规格。

范围：把 `/comet-any` 自己的创作过程从"模型自由发挥"升级为"协议驱动"，并修复审查证据伪造、命令引用失真、产物清单不一致等问题，目标是让生成物达到 comet 手写 skill 的可用度。不修改 Superpowers / OpenSpec / 用户原始 Skill；不改变 runtime 侧已有的 `workflow-protocol.json` 契约。

## 背景

审查 `assets/skills/comet-any/**` 与后端（`domains/bundle/factory.ts`、`domains/factory/package.ts`、`domains/workflow-contract/builtins.ts`、`app/cli/index.ts`）后发现一个核心矛盾与若干脱节：

1. **核心矛盾（CRITICAL）**：SKILL 与 `authoring-subagents.md` 描述了一条 6 角色 subagent 创作管线，声称子代理草稿"流入 authoring-lanes.json / skill-review.md / 最终 Bundle"。但确定性生成器 `generateFactorySkillPackage`（`domains/factory/package.ts:1102`）从 `plan.workflowProtocol` 独自渲染全部产物，`FactorySkillPackagePlan`（`domains/factory/types.ts:78`）没有任何字段承载子代理草稿；`factory.ts:351` 在生成前 `clearDirectory` 还会清空 draft 目录。更糟的是生成器硬编码 `review:{passed:true}`（`package.ts:973-985`）与一行式 `skill-review.md`（`package.ts:968-972`）——审查证据是伪造的。
2. **find-skill 命令不存在（HIGH）**：SKILL 指示 agent `use find-skill`，但 CLI 无此命令，实际是 `comet bundle candidates` / `comet skill show`。
3. **脚本清单三方不一致（HIGH）**：生成器产出 6 个脚本（comet-plan/comet-check/comet-hook-guard/workflow-state/workflow-guard/workflow-handoff），但 SKILL、bundle-authoring、script-author、skill-reviewer 只认 3 个 workflow-*。
4. **生成内容薄（MEDIUM）**：entry/node skill 是公式化模板，缺乏 comet 的领域智能。
5. **缺契约测试（MEDIUM）**：现有测试只校验"文档包含词汇"，不校验命令/产物清单一致性。

关键判断：comet-any 已在 **runtime 侧** 用对了"protocol 驱动"模式（`workflow-protocol.json` 是确定性事实源，脚本只解释它）；但 **创作侧** 没用同一套思想。本设计把 runtime 侧已验证的模式反向应用到创作侧。

## 设计思想（去工具化的 dynamic workflow 原则）

本设计借鉴 dynamic workflow 的编排哲学，但 **不依赖任何平台专属工具**（`Workflow` 工具只是 Claude Code 上的可选加速器）。落地 7 条原则：

1. **确定性编排优于模型自由驱动**：控制流写进一份声明，模型只执行叶子。
2. **边界 schema 校验**：阶段间交接的是被校验过的结构化对象。
3. **显式 pipeline vs barrier**：只在真正需要汇聚时同步。
4. **对抗式验证 + 视角多样性**：独立怀疑者多视角投票，"通过"是挣来的。
5. **loop-until-dry + 完备性批判**：扫到连续 K 轮无新发现才停。
6. **确定性脊梁 + LLM 叶子分离**：可复现骨架不交给模型，模型只做生成性叶子。
7. **预算感知 + 不静默截断**：深度按 quick/full 缩放，跳过必留痕。

## 目标

- 让 `/comet-any` 的创作过程由 `authoring-protocol.json`（确定性事实源）驱动，主会话"解释执行"它，对称于 runtime 侧的 `workflow-protocol.json`。
- 让生成的 Bundle 区分 **确定性脊梁**（protocol/scripts/manifest/comet yaml，永远模板化、可复现）与 **LLM 内容叶子**（entry/node SKILL.md、decision-points、recovery，优先采用子代理草稿），通过 content-merge 合并。
- 让 `skill-review.md` / `authoring-lanes.json` 的审查结论成为 **真实的多视角投票结果**，消灭伪造证据；`factory-generate` / readiness 据此阻塞。
- 修复 find-skill、脚本清单等失真；补契约测试，防止回归。
- 全程平台无关：协议是契约（跨平台），平台 subagent / `Workflow` 工具只是可选加速器。

## 非目标

- 不改 runtime 侧 `workflow-protocol.json` 的 schema 与脚本读取契约。
- 不把 `/comet-any` 绑定到 Claude Code 的 `Workflow` 工具。
- 不重写已稳定的确定性生成器主体；只在其上加 content-merge 层与真实审查证据接入。
- 不为单次 Skill 替换重写脚本主体。

## 核心模型

### 三 protocol 对称

```
runtime 侧：reference/workflow-protocol.json  →  runtime scripts 解释        （已有）
创作侧  ：reference/authoring-protocol.json   →  主会话 + 生成器解释        （新增）
评估侧  ：读 workflow-protocol.json                                        （已有）
```

`authoring-protocol.json` 是 comet-any skill 自带的 **固定创作契约**（随 skill 发布），描述"一次创作如何编排"。每个生成 Bundle 的具体执行记录仍写入 Bundle 内的 `reference/authoring-lanes.json`（已有，扩展）。

### authoring-protocol.json 结构

```jsonc
{
  "schemaVersion": 1,
  "protocolHash": "<sha256 of canonical json>",
  "depth": "quick",                       // quick | full，对应现有 benchmark 等级
  "dag": {
    "wave1": ["script", "reference", "pause-points"],   // 互不依赖，可并发
    "wave2": ["workflow-entry", "skill-core"],          // 依赖 script 契约
    "barrier": ["skill-review"]                          // 唯一汇聚点
  },
  "lanes": {
    "script": {
      "brief": "reference/subagents/script-author.md",
      "outputSchema": "reference/schemas/script-lane.schema.json",
      "claims": [
        "script:workflow-state", "script:workflow-guard", "script:workflow-handoff",
        "script:comet-plan", "script:comet-check", "script:comet-hook-guard"
      ],
      "producesContentLeaves": [],
      "producesBackbone": ["scripts/*"]
    }
    // reference / pause-points / workflow-entry / skill-core / skill-review 同构
    // skill-core.producesContentLeaves = ["../<node-skill>/SKILL.md"]
    // workflow-entry.producesContentLeaves = ["SKILL.md"]
    // pause-points.producesContentLeaves = ["reference/decision-points.md","reference/recovery.md"]
  },
  "verify": {
    "voters": "full ? 3 : 1",
    "lenses": ["contract-fit", "usability", "evidence-trace", "self-consistency"],
    "loopUntilDry": { "maxRounds": "full ? 4 : 1", "dryThreshold": 2 }
  },
  "merge": {
    "deterministicBackbone": [
      "reference/workflow-protocol.json",
      "scripts/workflow-state.mjs", "scripts/workflow-guard.mjs", "scripts/workflow-handoff.mjs",
      "scripts/comet-check.mjs", "scripts/comet-hook-guard.mjs", "scripts/comet-plan.mjs",
      "bundle.yaml", "comet/skill.yaml", "comet/guardrails.yaml", "comet/checks.yaml", "comet/eval.yaml",
      "reference/resolved-skills.json", "reference/composition-report.md",
      "reference/authoring-lanes.json"
    ],
    "contentLeaves": ["SKILL.md", "../<node-skill>/SKILL.md",
                      "reference/decision-points.md", "reference/recovery.md", "reference/skill-review.md"]
  }
}
```

字段规则：

- `protocolHash`：规范 JSON 的 sha256，`comet bundle authoring-plan` 校验其与 skill 自带版本一致。
- `depth`：`quick` = 每 lane 单作者 + 单审查 + 确定性校验；`full` = 多视角投票 + loop-until-dry。
- `dag`：依赖图。`wave1` 无相互依赖可并发；`wave2` 依赖 script 契约；`barrier` 是 skill-review，必须读全部产物。
- `lanes.<id>.outputSchema`：该 lane 输出的 JSON Schema 路径，主会话/CLI 据此校验。
- `lanes.<id>.claims`：必须产出的 claim id；缺失在 skill-review 阻塞。
- `merge.deterministicBackbone`：生成器永远用确定性模板，**不接受** contentDraft 覆盖。
- `merge.contentLeaves`：生成器优先用 contentDrafts[path]，缺省回退确定性模板。

### Lane 输出 schema（统一形态）

每个 lane 返回并被 `reference/schemas/<lane>.schema.json` 校验的对象：

```jsonc
{
  "lane": "skill-core",
  "status": "DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED",
  "dispatchMode": "subagent | inline",
  "model": "<explicit model> | platform-default",
  "artifacts": [
    { "path": "../team-comet-execute/SKILL.md", "kind": "skill", "content": "..." }
  ],
  "claims": [
    { "id": "node-skill:team-comet-execute", "kind": "skill", "paths": ["../team-comet-execute/SKILL.md"], "summary": "..." }
  ],
  "findings": [
    { "severity": "critical|important|minor", "path": "...", "claim": "...", "problem": "...", "impact": "...", "fix": "..." }
  ]
}
```

校验失败（schema 不合规、status 为 BLOCKED/NEEDS_CONTEXT、缺关键 claim）时，`comet bundle authoring-record` 拒绝落盘并要求补上下文。

### skill-review lane（多视角，Phase 2）

skill-review 不再是单个主观审查者。`depth=full` 时主会话派 N=3 个独立审查者，各持一个 lens（互不见结论）：

- `contract-fit`：是否满足确认的目标、protocol、requiredSkillCalls、claim、节点推进、script guard、pause、recovery。
- `usability`：是否如 comet 般清晰、可恢复、可审计、不过曝内部元数据。
- `evidence-trace`：每条 claim 是否能追溯到真实 artifact 路径。
- `self-consistency`：交叉校验生成物引用的命令可解析、声明产物 == 实际产物、无 find-skill 类失真。

findings 跨审查者去重后投票：多数判 critical/important 才成立。再跑 loop-until-dry（连续 `dryThreshold` 轮无新 critical/important 才停，上限 `maxRounds`）。最终写入：

```jsonc
{
  "lane": "skill-review",
  "status": "DONE",
  "review": {
    "passed": true,                         // 真：无 critical/important 才为 true
    "evidenceSource": "llm-multivote",      // quick 单作者为 "llm-single"
    "voters": 3, "lenses": ["contract-fit","usability","evidence-trace","self-consistency"],
    "rounds": 2,
    "verdicts": { "contractFit": "pass", "usability": "pass" },
    "findings": [ /* 仅 minor，或空 */ ]
  }
}
```

`quick` depth：单审查者单轮，`evidenceSource: "llm-single"`。

## content-merge 生成器（Phase 1）

`FactorySkillPackagePlan` 增加可选字段：

```ts
interface FactorySkillPackagePlan {
  // ...既有字段
  contentDrafts?: Record<string, string>;   // path -> 内容，仅对 contentLeaves 生效
}
```

`BundleFactoryMetadata` 增加可选字段（持久化到 authoring state）：

```ts
interface BundleFactoryMetadata {
  // ...既有字段
  authoringContent?: Record<string, string>;   // 来自 authoring-record 的内容叶子
  authoringReview?: {
    passed: boolean;
    evidenceSource: 'deterministic-check-only' | 'llm-single' | 'llm-multivote';
    voters?: number;
    lenses?: string[];
    rounds?: number;
    findings: Array<{ severity: 'critical'|'important'|'minor'; path?: string; problem: string; fix?: string }>;
    reviewedAt: string;
  };
}
```

生成器改动（`domains/factory/package.ts`）：

- `workflowContractEntryMarkdown` / `workflowContractNodeMarkdown` / decision-points / recovery / skill-review 的 artifact 构造：若 `plan.contentDrafts[path]` 存在则用之，否则回退现有确定性模板。
- `deterministicBackbone` 列表内的 artifact **永远**用确定性模板，忽略 contentDrafts。
- 生成的 `skill-review.md`：若 `authoringReview` 存在，渲染真实审查摘要（evidenceSource、voters、findings）；否则渲染 `evidenceSource: deterministic-check-only` 的诚实占位（**不再**写 `Result: approved`）。
- 生成的 `authoring-lanes.json`：`review.passed` 与 `blockingFindings` 来自 `authoringReview`，而非硬编码。

## 命令面（Phase 1/2）

新增两个命令（镜像现有 `benchmark-plan` / `benchmark-record`）：

```bash
comet bundle authoring-plan <name> --depth quick|full --json
#   读 Bundle factory 元数据 + skill 自带 authoring-protocol.json，
#   产出本次创作的 dag/lane 清单/depth/expected-claims，校验 protocolHash。

comet bundle authoring-record <name> --lane <id> --file <out.json> [--json]
#   校验 lane 输出符合 reference/schemas/<lane>.schema.json；
#   把 artifacts[].content 并入 state.factory.authoringContent（仅 contentLeaves）；
#   若 lane=skill-review，把 review 写入 state.factory.authoringReview；
#   校验失败或 status BLOCKED/NEEDS_CONTEXT 拒绝落盘。
```

`comet bundle factory-generate`：把 `state.factory.authoringContent` 作为 `contentDrafts` 传入生成器。

`review-summary` / readiness（Phase 2）：读 `authoringReview`：

- 缺失 → evidence 标 `authoringReview: missing`，warning。
- `evidenceSource: deterministic-check-only` → warning："未执行 LLM 审查"。
- `passed: false` → **blocker**，阻止 ready。
- `passed: true` + `llm-*` → evidence 标 "LLM 审查通过（voters/lenses）"。

现有 human `comet bundle review --approve` 保留，与 LLM 审查 **叠加** 门禁（两者都过才 ready）。

## 仓库契约测试（Phase 0 / M5）

在 `test/domains/bundle/` 与 `test/repository/` 新增：

1. `comet-any-skill-contract.test.ts`：解析 `assets/skills/comet-any/SKILL.md` 与 reference，断言其中引用的每个 `comet <...>` 命令 ⊆ `app/cli/index.ts` 实际注册命令；断言 `find-skill` 不再出现。
2. 断言 comet-any 声明的 "Generated Package" 清单 == `generateFactorySkillPackage` 实际产物（含 6 脚本）。
3. 断言生成的 `skill-review.md` 不含 `Result: approved by deterministic`，且 `authoring-lanes.json` 的 `review.passed` 不再硬编码 true。

## DAG 并发（Phase 3）

- `authoring-plan` 输出 `dag`，主会话据此派发。
- 更新 `assets/skills/comet-any/SKILL.md` 与 `authoring-subagents.md`（中英）：指导主会话——支持 subagent 的平台并发派发 wave1，wave2 依赖 script，barrier 汇聚后审查；无 subagent 平台按 DAG 依赖内联顺序执行，语义不变，`authoring-lanes.json` 记 `dispatchMode`。
- Claude Code 上，主会话 **可** 把某 wave 的 fan-out 委托 `Workflow` 工具（可选加速器，非契约）。

## 用户体验

普通用户视角不变（仍是"描述场景 → 确认 → 生成 → 验证 → 发布预览"）。新增的内部能力对用户表现为：

- 生成物质量更高（内容叶子由 subagent 真创作）。
- 审查结论可信（不再伪造）。
- `publish review` 的 evidence 出现 `Authoring review: passed (llm-multivote, 3 voters)` 或诚实警告。

## 模块划分

- `domains/workflow-contract`：不变。
- `domains/factory/package.ts`：加 content-merge + 真实 review 渲染。
- `domains/factory/types.ts`：`FactorySkillPackagePlan.contentDrafts`。
- `domains/bundle/types.ts`：`BundleFactoryMetadata.authoringContent / authoringReview`。
- `domains/bundle/authoring.ts`（新）：lane schema 校验、authoring-plan 构造、authoring-record 落盘、protocolHash。
- `domains/bundle/review-summary.ts`：接入 authoringReview。
- `app/commands/bundle.ts` + `app/cli/index.ts`：新增两命令注册。
- `assets/skills/comet-any/**` 与 `assets/skills-zh/comet-any/**`：新增 `reference/authoring-protocol.json`、`reference/schemas/*.schema.json`；修订 SKILL.md（find-skill、脚本清单、DAG 指导、触发规范）。
- `test/`：契约测试 + authoring 域测试。

## 验收标准

- comet-any 的 SKILL/reference 引用的命令全部在 CLI 注册；`find-skill` 不再出现。
- comet-any 声明的产物清单与生成器实际产物一致（含 6 脚本）。
- 生成的 `skill-review.md` / `authoring-lanes.json` 审查结论来自真实 `authoringReview`；无 `authoringReview` 时为诚实占位，绝不伪造 `passed:true`。
- `factory-generate` 接受并合并 contentDrafts（contentLeaves），deterministicBackbone 不被覆盖。
- `authoring-record` 对 schema 不合规或缺关键 claim 的 lane 输出拒绝落盘。
- `review-summary`/readiness 对 `authoringReview.passed=false` 阻塞 ready。
- `authoring-plan` 输出 dag；SKILL 指导并发/内联双模式。
- 平台无关：所有能力不依赖 Claude Code 专属工具。
- 在临时目录用 comet-any 真实跑通 customize-comet、new workflow-kernel、upgrade-existing 三类场景，生成物可加载、状态机可推进、审查证据真实。
