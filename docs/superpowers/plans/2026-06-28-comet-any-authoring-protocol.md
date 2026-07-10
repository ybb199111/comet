# 实现计划：Comet Any 创作协议化

日期：2026-06-28

依据 spec：`docs/superpowers/specs/2026-06-28-comet-any-authoring-protocol-design.md`。

每阶段结束都要 `pnpm format:check && pnpm lint && pnpm build && pnpm test`（或对应子集）保持绿。改 `domains/factory/**` 或 `domains/bundle/**` 后无需重建 classic-runtime（那是 comet-classic 专属），但 CLI 走 `dist/`，需 `pnpm build`。

## Phase 0 — 止血（文档 + 生成器诚实化 + 契约测试）

0.1 **生成器诚实化** `domains/factory/package.ts`
- `skill-review.md`（约 968-972）：删除 `Result: approved by deterministic workflow contract checks.`，改为占位说明：未记录 LLM 审查时写 `Evidence source: deterministic-check-only`（明确不是审查通过）。
- `authoring-lanes.json`（约 973-985）：`review.passed` 不再硬编码 `true`。无 authoringReview 时写 `passed: null`、`evidenceSource: 'deterministic-check-only'`、`note: 'No LLM authoring review recorded'`。

0.2 **修 find-skill（H1）** `assets/skills/comet-any/SKILL.md` + `assets/skills-zh/comet-any/SKILL.md`
- en step 2：`use find-skill` → `use comet bundle candidates --json to discover real Skills, then comet skill show <name> --json to read real content and hash`。
- zh 对应行同步。

0.3 **对齐脚本清单（H2）** `assets/skills/comet-any/reference/bundle-authoring.md`、`subagents/script-author.md`、`subagents/skill-reviewer.md`（+ zh 镜像）
- "Generated Package" / script-author "Must cover" / skill-reviewer blocking 条件：从 3 个 workflow-* 扩到 6 个（加 comet-plan/comet-check/comet-hook-guard）。说明 comet-plan/comet-check/comet-hook-guard 由确定性生成器产出，script-author 产它们的 **契约描述**，skill-reviewer 校验其存在。

0.4 **契约测试（M5）** `test/domains/bundle/comet-any-skill-contract.test.ts`（新）
- 解析 `app/cli/index.ts` 注册命令名集合（静态读取或构造 program 遍历）。
- 断言 SKILL.md/reference 里出现的 `comet bundle <x>` / `comet publish <x>` / `comet skill <x>` 引用 ⊆ 注册命令。
- 断言全文不含 `find-skill`。
- 断言 comet-any 声明的产物清单 == `generateFactorySkillPackage` 实际产物路径集合（跑一次生成，对比 artifact paths）。
- 断言生成物 `skill-review.md` 不含 `approved by deterministic`，`authoring-lanes.json.review.passed` 在无 authoringReview 时为 `null`。

**Phase 0 验收**：契约测试绿；format/lint/build/test 绿。

## Phase 1 — 创作协议化 + content-merge

1.1 **类型** `domains/factory/types.ts`：`FactorySkillPackagePlan` 加 `contentDrafts?: Record<string,string>`。
`domains/bundle/types.ts`：`BundleFactoryMetadata` 加 `authoringContent?: Record<string,string>` 与 `authoringReview?`（形状见 spec）。

1.2 **创作域** `domains/bundle/authoring.ts`（新）
- `loadBuiltinAuthoringProtocol()`：读 comet-any skill 自带 `reference/authoring-protocol.json`（定位方式同 candidates 发现 skill 根）。
- `buildAuthoringPlan({projectRoot,name,depth})`：读 factory state + 内置 protocol，校验 `protocolHash`，输出 `{depth, dag, lanes[], expectedClaims}`。
- `recordAuthoringLane({projectRoot,name,lane,file})`：按 lane 查 schema（用 zod 校验）；status≠BLOCKED/NEEDS_CONTEXT、关键 claim 存在；把 `artifacts[].content`（仅 contentLeaves path）并入 `state.factory.authoringContent`；lane=skill-review 写 `authoringReview`；落盘。
- `hashAuthoringProtocol(canonicalJson)`：sha256。

1.3 **schema 文件** `assets/skills/comet-any/reference/schemas/{script-lane,reference-lane,workflow-entry-lane,skill-core-lane,pause-points-lane,skill-review-lane}.schema.json` + zh 镜像。统一形态见 spec。

1.4 **authoring-protocol.json** `assets/skills/comet-any/reference/authoring-protocol.json` + zh 镜像。内容见 spec。

1.5 **content-merge 生成器** `domains/factory/package.ts`
- 对 contentLeaves artifact：`plan.contentDrafts?.[path] ?? <template>`；backbone 永远 template。
- entry/node markdown 函数接收可选 draft。
- `skill-review.md` 渲染真实 `authoringReview`（由 factory.ts 注入 plan）。

1.6 **factory.ts 注入**：构造 plan 时加 `contentDrafts: factory.authoringContent`，透传 `authoringReview`。

1.7 **命令** `app/commands/bundle.ts` + `app/cli/index.ts`：`authoring-plan <name> --depth --json`、`authoring-record <name> --lane --file --json`；BundleCommandOptions 扩 `lane?`。

1.8 **测试** `test/domains/bundle/authoring.test.ts`：plan→record(skill-core 带 content)→generate→断言 node SKILL 用 draft、backbone 未被覆盖；record BLOCKED 抛错；record skill-review。

**Phase 1 验收**：content-merge 生效；schema 拒绝非法 lane；命令可用；测试绿。

## Phase 2 — 真·多视角审查

2.1 **review-summary 接入** `domains/bundle/review-summary.ts`：读 authoringReview（缺失→warning；deterministic→warning；passed:false→blocker；passed:true+llm→evidence）。

2.2 **skill-reviewer 多视角** 更新 `subagents/skill-reviewer.md`（+zh）：full 派 N=3 独立 lens 投票 + loop-until-dry；quick 单作者；输出统一 review 对象经 authoring-record 落盘。

2.3 **readiness 门禁** 确认 authoringReview.passed=false 时 review-summary blocker → 拒绝 ready；加测试。

2.4 **测试** 扩 authoring.test.ts：passed=true → evidence 含 LLM 通过；passed=false → blocker。

**Phase 2 验收**：审查证据真实；passed=false 阻塞 ready；测试绿。

## Phase 3 — DAG 并发

3.1 **SKILL/authoring-subagents 指导**（+zh）：新增"Dispatch by DAG"段（wave1 并发/内联，wave2 依赖 script，barrier 汇聚，dispatchMode 留痕；Claude Code 可选委托 Workflow，注明非契约）；与 CLAUDE.md 触发规范对齐（单节点状态驱动加载可用 `**Immediately execute:**`，禁止 entry 多节点清单）。

3.2 **authoring-plan 输出 dag**（1.2 已含）补断言。

3.3 **生成器 node markdown 表述** 审视对齐触发规范。

**Phase 3 验收**：DAG 文档化；中英同步；测试绿。

## 收尾

- format/lint/build/test 全绿。
- 派 code-reviewer + architect 子代理 review 完整性，修复缺口。
- 临时目录真实验证 3 场景。
- CHANGELOG（英文）+ 版本号（当前 0.4.0-beta.1，待定 0.4.0-beta.2）；中英 skill 同步。
