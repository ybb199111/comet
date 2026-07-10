# Comet Any Dogfood Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/comet-any` dogfoodable end to end: real local Skill preferences resolve through CLI-backed recovery, generated Comet-native Skills carry useful workflow guidance and eval metadata, and review/publish summaries expose evidence and blockers.

**Architecture:** Keep `/comet-any` as the user entry and keep Bundle Factory state as the authoring source of truth. Extend current `domains/bundle/*` and `domains/factory/*` modules rather than introducing a second state model; generated entry Skills embed Engine files under `skills/<entry>/comet/`, while Bundle-level `engine.enabled` remains outside the Factory main path.

**Tech Stack:** TypeScript ESM, Node.js 20+, Commander, YAML, Vitest, existing Bundle Factory and Skill Engine modules.

## Global Constraints

- `/comet-any` Skill 文案中不要求用户手动运行 Bundle CLI 主流程。
- `.comet/skills.txt` 偏好必须解析为本地真实 Skill 内容。
- `.comet/skills.txt` 的行顺序是推荐调用顺序；偏离时必须说明原因。
- Agent 不手写 Factory state JSON；候选恢复必须通过 `factory-resolve` 更新 metadata。
- `/comet-any` 不得执行候选 Skill 的脚本，只能读取和总结。
- ready publish 必须绑定当前 draft hash、eval evidence 和 review approval。
- skip eval 可以保留 draft，但不能发布 ready。
- capability gap 和 executable disclosure 继续阻塞分发。
- Factory 当前以 entry Skill 内嵌 Engine 文件为主，不应假设 Bundle-level `engine.enabled` 已是主实现路径。
- 中文 Skill 改动先行，用户确认后再同步英文。

---

## File Structure

- `domains/factory/package.ts`: enrich generated `SKILL.md`, write `comet/eval.yaml`, and keep `reference/resolved-skills.json` as structured evidence.
- `domains/factory/types.ts`: add `evalManifestPath` to generated package output for Factory eval manifest evidence.
- `domains/bundle/review-summary.ts`: add readiness summary, blockers, warnings, evidence paths, and call-order deviations.
- `domains/bundle/publish.ts`: keep current hash-bound eval/review gates and add Factory-specific generated package checks before ready publish.
- `domains/bundle/factory.ts`: ensure generated package invalidation and current hash semantics remain correct after Factory generation.
- `test/domains/factory/factory-package.test.ts`: cover richer generated Skill guidance and eval manifest output.
- `test/domains/bundle/bundle-cli-e2e.test.ts`: expand dogfood CLI path for missing, ambiguous, resolved, eval-plan, review-summary, and publish blockers.
- `test/domains/bundle/bundle-publish.test.ts`: cover Factory-specific publish blockers and current hash requirements.
- `test/domains/bundle/bundle-review-summary.test.ts`: create focused review summary tests.
- `assets/skills-zh/comet-any/SKILL.md` and references: update Chinese user-facing workflow after behavior lands.
- `assets/skills/comet-any/SKILL.md` and references: English parity after Chinese approval.

## Tasks

### Task 1: Review Summary Readiness Contract

**Files:**
- Modify: `domains/bundle/review-summary.ts`
- Create: `test/domains/bundle/bundle-review-summary.test.ts`

**Interfaces:**
- Produces: `BundleReviewSummary.readiness: { state: "blocked" | "reviewable" | "publishable"; blockers: string[]; warnings: string[]; evidence: Record<string, string> }`.
- Consumes: `BundleAuthoringState.factory`, `eval`, `review`, `ready`, `currentHash`, `draftPath`, and compile/eval plans.

- [x] **Step 1: Write failing review summary tests**

Create `test/domains/bundle/bundle-review-summary.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createBundleDraft } from '../../../domains/bundle/draft.js';
import { buildBundleReviewSummary } from '../../../domains/bundle/review-summary.js';
import { writeBundleAuthoringState } from '../../../domains/bundle/state.js';
import type { BundleAuthoringState } from '../../../domains/bundle/types.js';

async function writeMinimalBundle(root: string, name: string): Promise<void> {
  await fs.mkdir(path.join(root, 'skills', name), { recursive: true });
  await fs.writeFile(
    path.join(root, 'skills', name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Demo.\n---\n\n# ${name}\n`,
  );
  await fs.writeFile(
    path.join(root, 'bundle.yaml'),
    `apiVersion: comet/v1alpha1
kind: SkillBundle
metadata:
  name: ${name}
  version: 1.0.0
  description: Demo
  defaultLocale: en
  locales: [en]
skills:
  - id: ${name}
    path: skills/${name}
    visibility: entry
resources:
  rules: []
  hooks: []
  references: []
  scripts: []
  assets: []
platforms:
  requires: [skills]
  optional: []
  overrides: []
engine:
  enabled: false
`,
  );
}

describe('Bundle review summary readiness', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-review-summary-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('blocks unresolved Factory candidates and missing eval evidence', async () => {
    const state = await createBundleDraft({
      projectRoot,
      name: 'factory-demo',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
      factory: {
        goal: 'Demo',
        preferredSkills: ['missing-skill'],
        resolvedSkills: [{ query: 'missing-skill', preferenceIndex: 0, status: 'missing', sources: [] }],
        callChain: [{ skill: 'missing-skill', preferenceIndex: 0 }],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });
    await writeMinimalBundle(state.draftPath, 'factory-demo');

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-demo',
      platform: 'claude',
    });

    expect(summary.readiness.state).toBe('blocked');
    expect(summary.readiness.blockers).toContain('Unresolved Factory candidates: missing-skill (missing)');
    expect(summary.readiness.blockers).toContain('Eval evidence for the current draft hash is missing');
  });

  it('is publishable only when eval and review match the current hash', async () => {
    const state = await createBundleDraft({
      projectRoot,
      name: 'factory-ready',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
    });
    await writeMinimalBundle(state.draftPath, 'factory-ready');
    const readyState: BundleAuthoringState = {
      ...state,
      status: 'review-approved',
      currentHash: 'a'.repeat(64),
      eval: { level: 'quick', hash: 'a'.repeat(64), resultPath: 'eval.json', passed: true },
      review: {
        hash: 'a'.repeat(64),
        decision: 'approved',
        reviewer: 'alice',
        at: '2026-06-22T00:00:00.000Z',
      },
    };
    await writeBundleAuthoringState(projectRoot, readyState);

    const summary = await buildBundleReviewSummary({
      projectRoot,
      name: 'factory-ready',
      platform: 'claude',
    });

    expect(summary.readiness.state).toBe('publishable');
    expect(summary.readiness.blockers).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run test/domains/bundle/bundle-review-summary.test.ts
```

Expected: failure because `readiness` is not present on `BundleReviewSummary`.

- [x] **Step 3: Add readiness model**

In `domains/bundle/review-summary.ts`, add:

```ts
export interface BundleReviewReadiness {
  state: 'blocked' | 'reviewable' | 'publishable';
  blockers: string[];
  warnings: string[];
  evidence: Record<string, string>;
}
```

Add `readiness: BundleReviewReadiness;` to `BundleReviewSummary`.

Add helper:

```ts
function buildReadiness(state: BundleAuthoringState): BundleReviewReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const unresolved = state.factory?.resolvedSkills.filter(
    (skill) => skill.status === 'missing' || skill.status === 'ambiguous',
  ) ?? [];
  if (unresolved.length > 0) {
    blockers.push(
      `Unresolved Factory candidates: ${unresolved
        .map((skill) => `${skill.query} (${skill.status})`)
        .join(', ')}`,
    );
  }
  if (!state.currentHash) blockers.push('Current draft hash is missing');
  if (!state.eval || state.eval.hash !== state.currentHash || !state.eval.passed) {
    blockers.push('Eval evidence for the current draft hash is missing');
  }
  if (state.eval?.passed && (!state.review || state.review.hash !== state.currentHash)) {
    warnings.push('Review approval for the current draft hash is missing');
  }
  const publishable =
    blockers.length === 0 &&
    state.status === 'review-approved' &&
    state.review?.hash === state.currentHash &&
    state.review.decision === 'approved';
  return {
    state: publishable ? 'publishable' : blockers.length === 0 ? 'reviewable' : 'blocked',
    blockers,
    warnings,
    evidence: {
      draftPath: state.draftPath,
      ...(state.factory?.generatedSkillPackage?.packageRoot
        ? { generatedPackage: state.factory.generatedSkillPackage.packageRoot }
        : {}),
      ...(state.eval?.resultPath ? { evalResult: state.eval.resultPath } : {}),
      ...(state.factory?.planPath ? { factoryPlan: state.factory.planPath } : {}),
    },
  };
}
```

Include it in the returned summary:

```ts
readiness: buildReadiness(state),
```

- [x] **Step 4: Run focused tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-review-summary.test.ts
```

Expected: all selected tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add domains/bundle/review-summary.ts test/domains/bundle/bundle-review-summary.test.ts
git commit -m "feat(bundle): summarize factory readiness"
```

Expected: commit succeeds.

### Task 2: Dogfood CLI E2E for Missing, Ambiguous, and Resolved Candidates

**Files:**
- Modify: `test/domains/bundle/bundle-cli-e2e.test.ts`

**Interfaces:**
- Consumes: existing CLI commands `factory-init`, `factory-resolve`, `factory-generate`, `compile`, `eval-plan`, and `review-summary`.
- Produces: one E2E test proving state JSON is only mutated by CLI commands.

- [x] **Step 1: Add missing-candidate dogfood path**

Extend `test/domains/bundle/bundle-cli-e2e.test.ts` with a new test:

```ts
it('recovers missing Factory candidates through factory-resolve and keeps generated state invalidated', async () => {
  await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, '.comet', 'skills.txt'), 'factory-alpha\nmissing-skill\n');
  await fs.mkdir(path.join(projectRoot, '.claude', 'skills', 'factory-alpha'), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, '.claude', 'skills', 'factory-alpha', 'SKILL.md'),
    '---\nname: factory-alpha\ndescription: Alpha factory step.\n---\n# Alpha\n',
  );
  const planFile = path.join(root, 'factory-plan.json');
  await fs.writeFile(
    planFile,
    JSON.stringify(
      {
        goal: 'Create a review-oriented Skill.',
        preferredSkills: ['factory-alpha', 'missing-skill'],
        callChain: ['factory-alpha', 'missing-skill'],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
        defaultLocale: 'zh',
        locales: ['zh', 'en'],
        creator: 'native',
        engineEnabled: true,
      },
      null,
      2,
    ),
  );

  const initialized = runJson('bundle', 'factory-init', 'factory-missing', '--project', projectRoot, '--file', planFile);
  expect(initialized).toMatchObject({
    factory: {
      resolvedSkills: [
        { query: 'factory-alpha', status: 'available' },
        { query: 'missing-skill', status: 'missing' },
      ],
    },
  });

  const blocked = runCli('bundle', 'factory-generate', 'factory-missing', '--project', projectRoot, '--json');
  expect(blocked.status).not.toBe(0);
  expect(blocked.stderr).toContain('unresolved factory Skill candidates');

  const resolved = runJson(
    'bundle',
    'factory-resolve',
    'factory-missing',
    '--project',
    projectRoot,
    '--candidate',
    'missing-skill',
    '--ignore-missing',
    '--reason',
    'The target workflow can proceed with factory-alpha only.',
  );
  expect(resolved.factory.deviations).toContainEqual(
    expect.objectContaining({ skill: 'missing-skill', actualIndex: -1 }),
  );

  const generated = runJson('bundle', 'factory-generate', 'factory-missing', '--project', projectRoot);
  const summary = runJson('bundle', 'review-summary', 'factory-missing', '--project', projectRoot, '--platform', 'claude');
  expect(generated.factory.generatedSkillPackage.entrySkill).toBe('factory-missing');
  expect(summary.readiness.blockers).toContain('Eval evidence for the current draft hash is missing');
});
```

- [x] **Step 2: Run test to verify current behavior**

Run:

```bash
npx vitest run test/domains/bundle/bundle-cli-e2e.test.ts
```

Expected: the new test fails until the review summary readiness task is implemented; after Task 1 it should pass or reveal a real CLI recovery gap.

- [x] **Step 3: Fix any missing CLI behavior in current modules**

If the test exposes missing behavior, change only these files:

```text
domains/bundle/factory-resolve.ts
app/commands/bundle.ts
app/cli/index.ts
```

Required behavior:

```ts
// factory-resolve must invalidate generated/eval/review/ready data after changing candidates.
delete updated.factory.generatedSkillPackage;
delete updated.eval;
delete updated.review;
delete updated.ready;
delete updated.conflict;
```

The CLI parser must require exactly one of `--source` or `--ignore-missing`, and must require `--reason` for `--ignore-missing`.

- [x] **Step 4: Run focused E2E**

Run:

```bash
npx vitest run test/domains/bundle/bundle-cli-e2e.test.ts
```

Expected: all Bundle CLI E2E tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add test/domains/bundle/bundle-cli-e2e.test.ts domains/bundle/factory-resolve.ts app/commands/bundle.ts app/cli/index.ts
git commit -m "test(bundle): dogfood factory recovery"
```

Expected: commit succeeds with only files that changed staged.

### Task 3: Generated Skill Guidance Quality

**Files:**
- Modify: `domains/factory/package.ts`
- Modify: `test/domains/factory/factory-package.test.ts`

**Interfaces:**
- Consumes: `FactorySkillPackagePlan.resolvedSkills`, `callChain`, `deviations`, `engineMode`.
- Produces: generated `SKILL.md` sections for composed workflow, stop points, risks, internal Skill usage, capability loss, and evidence.

- [x] **Step 1: Write failing generated-guidance assertions**

Append to `test/domains/factory/factory-package.test.ts`:

```ts
it('explains stop points, risks, and internal Skill usage', async () => {
  const output = await generateFactorySkillPackage({
    root,
    name: 'quality-workflow',
    version: '1.0.0',
    description: 'Quality workflow generated from preferred Skills.',
    goal: 'Create a quality-oriented workflow.',
    defaultLocale: 'zh',
    callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
    resolvedSkills: [
      {
        query: 'brainstorming',
        preferenceIndex: 0,
        status: 'available',
        sources: [
          {
            name: 'brainstorming',
            preferenceIndex: 0,
            platform: 'codex',
            scope: 'project',
            origin: 'project',
            factory: { query: 'brainstorming' },
            root: path.join(root, '.codex', 'skills', 'brainstorming'),
            description: 'Explore intent before implementation.',
            skillMd: '# Brainstorming\n\nAsk questions before changing behavior.\n',
            hash: 'b'.repeat(64),
          },
        ],
      },
    ],
    deviations: [],
    engineMode: 'deterministic',
  });

  const skill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
  expect(skill).toContain('## 停止点');
  expect(skill).toContain('## 风险');
  expect(skill).toContain('## 内部 Skill 使用方式');
  expect(skill).toContain('brainstorming');
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts
```

Expected: new assertions fail until generated `SKILL.md` is enriched.

- [x] **Step 3: Enrich generated markdown**

In `domains/factory/package.ts`, extend `skillMarkdown(plan)` with these sections after `## 真实 Skill 证据`:

```ts
const stopPoints = [
  '- 当候选 Skill 缺失、歧义或偏离用户偏好顺序且没有记录原因时，停止并要求恢复。',
  '- 当生成脚本、hook 或外部副作用时，停止并要求用户确认。',
  '- 当 Eval 被跳过或失败时，不发布 ready Bundle。',
].join('\n');

const risks = [
  '- 生成内容来自候选 Skill 摘要，不能声称完整复制原 Skill 的所有隐含经验。',
  '- Engine 文件表达运行语义，但当前平台入口仍由 Agent 执行 action/outcome 协议。',
  '- 偏离 `.comet/skills.txt` 顺序会降低用户偏好可预测性，必须在 review summary 中解释。',
].join('\n');

const internalUsage =
  plan.callChain.length === 0
    ? '无内部 Skill。'
    : plan.callChain
        .map((item, index) => `${index + 1}. 调用 \`${item.skill}\` 处理该步骤的专门协议。`)
        .join('\n');
```

Insert into the returned markdown:

```md
## 停止点

${stopPoints}

## 风险

${risks}

## 内部 Skill 使用方式

${internalUsage}
```

- [x] **Step 4: Run focused tests**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts
```

Expected: all factory package tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add domains/factory/package.ts test/domains/factory/factory-package.test.ts
git commit -m "feat(factory): enrich generated skill guidance"
```

Expected: commit succeeds.

### Task 4: Factory Eval Manifest Generation

**Files:**
- Modify: `domains/factory/package.ts`
- Modify: `domains/factory/types.ts`
- Modify: `test/domains/factory/factory-package.test.ts`

**Interfaces:**
- Produces: `skills/<entry>/comet/eval.yaml` for Engine-enabled generated packages.
- Produces: `GeneratedFactorySkillPackage.evalManifestPath: string | null`.
- Consumes: eval plan from `2026-06-22-eval-quality-closure.md` where `authoring-skill` profile is supported.

- [x] **Step 1: Write failing eval manifest test**

Append to `test/domains/factory/factory-package.test.ts`:

```ts
it('writes an authoring-skill eval manifest for Engine-enabled generated packages', async () => {
  const output = await generateFactorySkillPackage({
    root,
    name: 'eval-workflow',
    version: '1.0.0',
    description: 'Workflow with eval metadata.',
    goal: 'Create a workflow with eval metadata.',
    defaultLocale: 'zh',
    callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
    resolvedSkills: [],
    deviations: [],
    engineMode: 'deterministic',
  });

  expect(output.evalManifestPath).toBe(path.join(output.packageRoot, 'comet', 'eval.yaml'));
  const manifest = await fs.readFile(output.evalManifestPath!, 'utf8');
  expect(manifest).toContain('apiVersion: comet.eval/v1alpha1');
  expect(manifest).toContain('kind: SkillEvalManifest');
  expect(manifest).toContain('profile: authoring-skill');
  expect(manifest).toContain('authoring-skill-smoke');
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts
```

Expected: failure because `evalManifestPath` and `eval.yaml` do not exist.

- [x] **Step 3: Extend generated package type**

In `domains/factory/types.ts`, add:

```ts
evalManifestPath: string | null;
```

to `GeneratedFactorySkillPackage`.

- [x] **Step 4: Write eval manifest**

In `domains/factory/package.ts`, add:

```ts
function evalManifest(plan: FactorySkillPackagePlan): Record<string, unknown> {
  return {
    apiVersion: 'comet.eval/v1alpha1',
    kind: 'SkillEvalManifest',
    metadata: {
      name: plan.name,
      description: plan.description,
    },
    skill: {
      name: plan.name,
      source: '..',
      profile: 'authoring-skill',
    },
    evaluation: {
      recommendedTasks: ['authoring-skill-smoke'],
      requiredSkills: plan.callChain.map((item) => item.skill),
      expectedArtifacts: ['reference/resolved-skills.json'],
    },
    interaction: {
      mode: 'none',
      maxTurns: 8,
    },
  };
}
```

When `engineMode !== 'none'`, write:

```ts
const evalManifestPath = path.join(cometRoot, 'eval.yaml');
await fs.writeFile(evalManifestPath, stringify(evalManifest(plan)), 'utf8');
```

Return:

```ts
evalManifestPath: plan.engineMode === 'none' ? null : path.join(cometRoot, 'eval.yaml'),
```

- [x] **Step 5: Run focused tests**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts
```

Expected: all selected tests pass.

- [x] **Step 6: Commit**

Run:

```bash
git add domains/factory/package.ts domains/factory/types.ts test/domains/factory/factory-package.test.ts
git commit -m "feat(factory): emit skill eval manifests"
```

Expected: commit succeeds.

### Task 5: Factory Publish Gate Evidence

**Files:**
- Modify: `domains/bundle/publish.ts`
- Modify: `test/domains/bundle/bundle-publish.test.ts`

**Interfaces:**
- Consumes: `state.factory.generatedSkillPackage`, `state.currentHash`, `state.eval`, `state.review`.
- Produces: Factory-specific publish errors for missing generated package evidence or stale hash evidence.

- [x] **Step 1: Write failing publish gate test**

Append to `test/domains/bundle/bundle-publish.test.ts`:

```ts
it('blocks Factory publish when generated package evidence is missing', async () => {
  const state = await createBundleDraft({
    projectRoot,
    name: 'factory-no-generated-package',
    candidates: [],
    creator: 'native',
    defaultLocale: 'en',
    locales: ['en'],
    engineEnabled: true,
    factory: {
      goal: 'Demo',
      preferredSkills: ['demo'],
      resolvedSkills: [],
      callChain: [{ skill: 'demo', preferenceIndex: 0 }],
      deviations: [],
      engineMode: 'deterministic',
      runnerMode: 'standalone',
    },
  });
  await expect(
    publishBundle({
      projectRoot,
      name: state.name,
      referencePlatform: 'claude',
    }),
  ).rejects.toThrow('Factory publish requires generated Skill package evidence');
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run test/domains/bundle/bundle-publish.test.ts
```

Expected: new test fails with the existing generic eval/review error.

- [x] **Step 3: Add Factory-specific publish preflight**

In `domains/bundle/publish.ts`, after loading `state` and before `loadBundle(state.draftPath)`, add:

```ts
if (state.factory && !state.factory.generatedSkillPackage) {
  throw new Error('Factory publish requires generated Skill package evidence');
}
```

Keep the existing current-hash, eval, review, capability and executable checks unchanged.

- [x] **Step 4: Run focused tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-publish.test.ts
```

Expected: all Bundle publish tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add domains/bundle/publish.ts test/domains/bundle/bundle-publish.test.ts
git commit -m "fix(bundle): require factory publish evidence"
```

Expected: commit succeeds.

### Task 6: Bilingual `/comet-any` Skill Guidance

**Files:**
- Modify: `assets/skills-zh/comet-any/SKILL.md`
- Modify: `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills/comet-any/SKILL.md`
- Modify: `assets/skills/comet-any/reference/bundle-authoring.md`
- Modify: `test/ts/comet-any-skill.test.ts`

**Interfaces:**
- Documents: Factory readiness summary, generated eval manifest, authoring quick eval, review blockers, and non-Engine capability loss.

- [x] **Step 1: Add Chinese assertions first**

In `test/ts/comet-any-skill.test.ts`, add Chinese contract phrases:

```ts
for (const expected of [
  'review summary',
  'readiness',
  'authoring-skill',
  'authoring-skill-smoke',
  'comet/eval.yaml',
  'Eval 证据缺失时不得发布 ready',
  '轻量单步 Skill 可以不启用 Engine',
]) {
  expect(combined).toContain(expected);
}
```

- [x] **Step 2: Update Chinese Skill docs**

Add to `assets/skills-zh/comet-any/SKILL.md`:

```markdown
发布前必须读取 review summary 的 readiness：存在 unresolved candidate、缺失当前 hash 的 Eval 证据、
缺失当前 hash 的人工 approval、capability gap 或 executable disclosure 未确认时，不得发布 ready。

生成 Engine-enabled Skill 时，Factory 会写入 `comet/eval.yaml`，默认使用 `authoring-skill`
profile 和 `authoring-skill-smoke` quick eval。Eval 证据缺失时不得发布 ready。

轻量单步 Skill 可以不启用 Engine，但必须说明会失去 Run 恢复、runtime eval、pending action
约束和可复用审批记录。
```

Add equivalent backend detail to `assets/skills-zh/comet-any/reference/bundle-authoring.md`.

- [x] **Step 3: Sync English parity**

Add the matching English assertions and update English files with:

```markdown
Before publishing, read the review summary readiness state. If unresolved candidates, current-hash
Eval evidence, current-hash human approval, capability gaps, or executable disclosures are missing,
do not publish a ready Bundle.

For Engine-enabled generated Skills, Factory writes `comet/eval.yaml` using the `authoring-skill`
profile and `authoring-skill-smoke` quick eval. Missing Eval evidence blocks ready publish.
```

- [x] **Step 4: Run Skill guidance tests**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: Chinese and English behavior assertions pass.

- [x] **Step 5: Commit**

Run:

```bash
git add assets/skills-zh/comet-any assets/skills/comet-any test/ts/comet-any-skill.test.ts
git commit -m "docs(skill): document comet-any readiness gates"
```

Expected: commit succeeds.

## Final Verification

- [x] Run focused Factory and Bundle tests:

```bash
npx vitest run \
  test/domains/factory/factory-package.test.ts \
  test/domains/bundle/bundle-cli-e2e.test.ts \
  test/domains/bundle/bundle-review-summary.test.ts \
  test/domains/bundle/bundle-publish.test.ts \
  test/ts/comet-any-skill.test.ts
```

Expected: all selected tests pass.

- [x] Run build and repository checks:

```bash
pnpm format:check
pnpm lint
pnpm build
git diff --check
```

Expected: all commands exit 0 and whitespace check has no output.

- [x] Run full tests after cross-domain changes:

```bash
npx vitest run
```

Expected: all tests pass. If unrelated failures appear, record exact failing tests before touching unrelated code.

## Self-Review

- Spec coverage: Tasks cover Dogfood E2E, CLI-backed candidate recovery, generated Skill quality, `resolved-skills.json`, eval manifest, review summary readiness, hash-bound publish gates, and bilingual `/comet-any` behavior.
- Placeholder scan: No unresolved marker words or vague "handle edge cases" instructions remain.
- Type consistency: `readiness`, `generatedSkillPackage`, `evalManifestPath`, `authoring-skill`, and `authoring-skill-smoke` are named consistently across plan tasks.
- Risk control: Factory remains inside Bundle authoring state; no second lifecycle state or bundle-level Engine assumption is introduced.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-comet-any-dogfood-quality.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
