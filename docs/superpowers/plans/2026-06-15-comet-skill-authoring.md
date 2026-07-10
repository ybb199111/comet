# Comet Manual Skill Authoring Implementation Plan

> 按 TDD 顺序执行。每个任务先写失败测试，再实现最小行为并运行相关测试。

**Goal:** 交付 Plan 3 Manual Authoring CLI、项目 Skill 发现/安装、基于快照的 Run 恢复、
显式升级兼容检查和运行期 Eval。

**Architecture:** `src/skill/` 增加 discovery、installation 和 snapshot reader；
`src/commands/skill.ts` 编排 CLI 用例；`src/engine/` 保持纯状态转换。CLI 输出 pending
action，由当前 Agent/Runtime 执行后通过 resume 提交 outcome。

## Task 1：Skill Discovery

**Files:**

- Create: `src/skill/discovery.ts`
- Create: `test/ts/skill-discovery.test.ts`

- [x] 显式目录优先。
- [x] 项目 `.comet/skills/<name>` 覆盖内置 Skill。
- [x] 无效项目覆盖失败关闭。
- [x] 找不到 Skill 时给出搜索位置。
- [x] 返回 origin、root、package 和 hash。

## Task 2：Project Skill Installation

**Files:**

- Create: `src/skill/install.ts`
- Create: `test/ts/skill-install.test.ts`

- [x] 校验后安装到 `.comet/skills/<name>`。
- [x] 默认拒绝覆盖。
- [x] `overwrite` 原子替换。
- [x] 拒绝源目录符号链接。
- [x] 安装失败不留下半发布目录。

## Task 3：Validate / Inspect CLI

**Files:**

- Create: `src/commands/skill.ts`
- Modify: `src/cli/index.ts`
- Create: `test/ts/skill-command.test.ts`

- [x] 注册 `comet skill` 命令组。
- [x] 实现 install、validate、inspect。
- [x] 文本与 JSON 输出稳定。
- [x] 命令失败设置非零退出语义。

## Task 4：Snapshot Reader

**Files:**

- Modify: `src/skill/snapshot.ts`
- Modify: `test/ts/skill-snapshot.test.ts`

- [x] 从 `<change>/.comet/skill-snapshots/<hash>` 恢复 SkillPackage。
- [x] 校验目录 hash、sha256 和 package 文档。
- [x] 恢复后 script Tool 仍限制在 snapshot 内。
- [x] 腐坏或缺失 snapshot 失败关闭。

## Task 5：Run Service

**Files:**

- Create: `src/engine/manual-run.ts`
- Create: `test/ts/engine-manual-run.test.ts`

- [x] 启动 Run、写 snapshot/state/trajectory/pending。
- [x] 恢复并返回已有 pending action。
- [x] 提交 outcome、合并 Artifacts、推进状态。
- [x] 记录 step/completion Runtime Evals。
- [x] adaptive run 明确失败。
- [x] 重复或错配 outcome 失败关闭。

## Task 6：Run / Resume / Eval CLI

**Files:**

- Modify: `src/commands/skill.ts`
- Modify: `src/cli/index.ts`
- Modify: `test/ts/skill-command.test.ts`
- Create: `test/ts/skill-cli-e2e.test.ts`

- [x] 实现 run。
- [x] 实现无 outcome 的 resume。
- [x] 实现带 outcome/artifact/state 的 resume。
- [x] 实现 runtime eval。
- [x] 覆盖完整两步 deterministic Skill E2E。

## Task 7：Explicit Upgrade

**Files:**

- Modify: `src/engine/manual-run.ts`
- Modify: `src/commands/skill.ts`
- Modify: `test/ts/engine-manual-run.test.ts`
- Modify: `test/ts/skill-command.test.ts`

- [x] pending 时禁止升级。
- [x] 校验名称、Orchestration mode 和当前步骤。
- [x] 生成新 snapshot 并原子更新 hash/version。
- [x] 记录 `manual-skill-upgrade` migration event。
- [x] 相同 hash 为 no-op。

## Task 8：Docs / Release / Verification

**Files:**

- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `assets/manifest.json`

- [x] 中英文 CLI 文档同步。
- [x] 检查远端 master 版本并确定唯一下一版本。
- [x] Changelog 追加行为变更与测试覆盖。
- [x] `pnpm format:check`
- [x] `pnpm lint`
- [x] `pnpm build`
- [x] `pnpm test`
- [x] `pnpm benchmark:classic`
- [x] `git diff --check`

## Execution Handoff

Plan 3 完成后先验证手工 Skill 的真实创建、安装、执行、恢复、升级和 Eval 接口，再编写
Plan 4 `/comet-any` 的详细计划。不要在 Plan 3 中提前实现 `.comet/skills.txt`、Skill
生成、Eval Provider 或 ready 发布门。
