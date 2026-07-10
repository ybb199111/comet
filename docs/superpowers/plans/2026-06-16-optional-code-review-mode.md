# Optional Code Review Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Comet code review dispatch user-selectable so simple tasks do not get trapped in repeated review loops.

**Architecture:** Add a durable `review_mode` state field with `off`, `standard`, and `thorough` values. Wire it into shell validation/state display, then update the Chinese Comet skill contract first so the user can review wording before English sync and changelog.

**Tech Stack:** Bash scripts under `assets/skills/comet/scripts/`, Markdown skill docs under `assets/skills-zh/`, Vitest tests under `test/ts/`.

---

## Files

- Modify: `test/ts/comet-scripts.test.ts`
- Modify: `test/ts/skills.test.ts`
- Modify: `assets/skills/comet/scripts/comet-state.sh`
- Modify: `assets/skills/comet/scripts/comet-yaml-validate.sh`
- Modify: `assets/skills-zh/comet-build/SKILL.md`
- Modify: `assets/skills-zh/comet-verify/SKILL.md`
- Modify: `assets/skills-zh/comet-hotfix/SKILL.md`
- Modify: `assets/skills-zh/comet/reference/subagent-dispatch.md`

### Task 1: Add Failing Script-State Tests

- [x] **Step 1: Write tests that expect `review_mode` defaults and validation**

Add Vitest coverage in `test/ts/comet-scripts.test.ts`:

```ts
it('initializes review_mode as null for full workflow', async () => {
  const result = runBash(tmpDir, stateScript, ['init', 'review-mode-defaults', 'full']);
  const yaml = await fs.readFile(
    path.join(tmpDir, 'openspec', 'changes', 'review-mode-defaults', '.comet.yaml'),
    'utf-8',
  );

  expect(result.status).toBe(0);
  expect(yaml).toContain('review_mode: null');
});

it('allows setting review_mode to off, standard, and thorough', async () => {
  runBash(tmpDir, stateScript, ['init', 'review-mode-set', 'full']);

  for (const value of ['off', 'standard', 'thorough']) {
    const set = runBash(tmpDir, stateScript, ['set', 'review-mode-set', 'review_mode', value]);
    const get = runBash(tmpDir, stateScript, ['get', 'review-mode-set', 'review_mode']);

    expect(set.status).toBe(0);
    expect(get.stdout.trim()).toBe(value);
  }
});

it('rejects invalid review_mode values during schema validation', async () => {
  await createChange(
    tmpDir,
    'invalid-review-mode',
    [
      'workflow: full',
      'phase: build',
      'review_mode: noisy',
      'build_mode: executing-plans',
      'build_pause: null',
      'subagent_dispatch: null',
      'tdd_mode: tdd',
      'isolation: branch',
      'verify_mode: null',
      'design_doc: null',
      'plan: null',
      'verify_result: pending',
      'verification_report: null',
      'branch_status: pending',
      'created_at: 2026-06-16',
      'verified_at: null',
      'archived: false',
      '',
    ].join('\n'),
  );

  const validateScript = path.join(tmpDir, 'scripts', 'comet-yaml-validate.sh');
  const result = runBash(tmpDir, validateScript, ['invalid-review-mode']);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("review_mode='noisy' is not valid");
});
```

- [x] **Step 2: Run focused script tests and verify RED**

Run: `npx vitest run test/ts/comet-scripts.test.ts`

Expected: FAIL because `review_mode` is not initialized, not accepted by `set`, or not schema-validated.

### Task 2: Implement `review_mode` State Support

- [x] **Step 1: Add the field to `comet-state.sh` initialization and setter validation**

Add `review_mode: null` near `tdd_mode` and allow values:

```bash
review_mode: null
```

```bash
review_mode)
  validate_enum "$value" "off" "standard" "thorough"
  ;;
```

- [x] **Step 2: Add the field to YAML validation**

Update `comet-yaml-validate.sh` to parse and validate:

```bash
review_mode=$(field_value "review_mode")
validate_enum "review_mode" "$review_mode" "off standard thorough"
```

Add `review_mode` to `KNOWN_KEYS`.

- [x] **Step 3: Run focused script tests and verify GREEN**

Run: `npx vitest run test/ts/comet-scripts.test.ts`

Expected: PASS for the new `review_mode` script tests.

### Task 3: Add Failing Chinese Skill Contract Tests

- [x] **Step 1: Update `test/ts/skills.test.ts` Chinese expectations**

Replace hard-review expectations with `review_mode` expectations:

```ts
expect(zhBuild).toContain('review_mode');
expect(zhBuild).toContain('`off`：不自动派发代码审查');
expect(zhBuild).toContain('`standard`：只在任务完成后运行一次最终轻量代码审查');
expect(zhBuild).toContain('`thorough`：按批次或风险边界运行合并审查，最后再运行一次完整审查');
expect(zhVerify).toContain('当 `review_mode: standard` 或 `thorough` 时');
expect(zhVerify).toContain('当 `review_mode: off` 时跳过自动代码审查');
expect(zhHotfix).toContain('默认 `review_mode: off`');
expect(zhDispatch).toContain('当 `review_mode: standard` 时');
expect(zhDispatch).toContain('当 `review_mode: thorough` 时');
expect(zhDispatch).toContain('当 `review_mode: off` 时');
```

- [x] **Step 2: Run skill tests and verify RED**

Run: `npx vitest run test/ts/skills.test.ts`

Expected: FAIL because Chinese docs do not yet describe `review_mode`.

### Task 4: Update Chinese Skill Docs

- [x] **Step 1: Update `/comet-build` decision point and exit conditions**

Add review mode selection beside execution and TDD mode:

```markdown
**代码审查模式**：

| 选项 | 含义 | 适用场景 |
|------|------|---------|
| `off` | 不自动派发代码审查 | 文档、配置、文案、小范围低风险任务 |
| `standard` | 只在任务完成后运行一次最终轻量代码审查；若发现问题，最多自动修复一轮，然后交给用户决策 | 默认推荐，适合大多数普通改动 |
| `thorough` | 按批次或风险边界运行合并审查，最后再运行一次完整审查 | 高风险、多模块、架构或安全相关改动 |
```

Record with:

```bash
"$COMET_BASH" "$COMET_STATE" set <name> review_mode <off|standard|thorough>
```

Change the executing-plans review gate so it runs only for `standard` or `thorough`.

- [x] **Step 2: Update subagent dispatch reference**

Make review behavior conditional:

```markdown
- `review_mode: standard`: 每个 task 由 implementer 自测和提交；所有 task 勾选前运行一次最终轻量代码审查。若发现 CRITICAL 或 IMPORTANT 问题，只自动派发一轮修复 agent 并复查；仍未通过时暂停交给用户。
- `review_mode: thorough`: 不执行每 task 双审查；按最多 3 个 task 一批或风险边界运行合并审查，最后再运行一次完整审查。批次和最终审查各最多 2 轮审查-修复。
- `review_mode: off`: 不自动派发 reviewer 或 fix reviewer；task 完成依据测试、构建、定向勾选验证和用户要求。
```

- [x] **Step 3: Update `/comet-verify` and `/comet-hotfix`**

Make lightweight code review conditional:

```markdown
6. 代码审查策略：当 `review_mode: standard` 或 `thorough` 时，使用 Superpowers `requesting-code-review` 请求轻量代码审查；当 `review_mode: off` 时跳过自动代码审查，并在验证报告中记录跳过原因。
```

Hotfix default:

```markdown
Hotfix 默认 `review_mode: off`，避免小范围 bug fix 被额外审查循环拖慢；用户可在验证前手动设置为 `light` 或 `standard`。
```

- [x] **Step 4: Run skill tests and verify GREEN for Chinese expectations**

Run: `npx vitest run test/ts/skills.test.ts`

Expected: Chinese `review_mode` assertions pass. English assertions may still require the later sync pass.

### Task 5: Stop for Chinese Review

- [x] **Step 1: Report changed Chinese contract and test status**

Do not update English skill docs or `CHANGELOG.md` yet, because repo instructions require Chinese Skill changes to be confirmed before English sync, and changelog waits until bilingual Skill content is complete.

- [x] **Step 2: Ask user to confirm Chinese wording**

Ask for confirmation to sync English versions, add changelog/version changes, and run final verification.
