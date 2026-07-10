# Comet Product UX Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/comet-any -> comet eval -> comet publish` 打磨成普通用户可顺着完成创建、确认、恢复、验证、发布和分发的闭环路径。

**Architecture:** 在现有 Bundle Factory、Skill preference、readiness、publish façade 之上增加用户可读摘要和确认契约，不新增第二套状态机。核心实现集中在 `domains/bundle/*` 的只读 summary、proposal、readiness 和 distribution preview，再由 `app/commands/*` 暴露给 `/comet-any` 使用。中文 Skill/docs 先落地并测试通过，再同步英文和 README。

**Tech Stack:** TypeScript, Vitest, Commander CLI, existing `domains/bundle/*`, `domains/skill/*`, `app/commands/*`, Markdown docs and Skill assets.

## Global Constraints

- 普通用户主路径固定为 `/comet-any -> comet eval -> comet publish`。
- 不开放普通用户手写 `flow.yaml` 的路径。
- 不开放普通用户手写 `comet/skill.yaml`、`guardrails.yaml`、`checks.yaml` 的路径。
- 不新增图形化编排器、复杂 DSL、条件表达式语言或单独的工作流引擎。
- 不删除 `comet bundle` 后端命令；它仍用于高级调试、自动化和兼容。
- 不让 `/comet-any` 自动跳过用户确认、Eval evidence、review readiness 或 executable disclosure。
- 不把 portable `hooks/*.yaml` 直接当作目标平台原生 hook 配置安装。
- 不修改 Superpowers 或 OpenSpec 原始 Skill。
- 项目偏好事实源保持 `.comet/skill-preferences.yaml`。
- 创建和发布状态事实源保持 Bundle Factory / Bundle authoring state。
- 生成物必须继续包含 `SKILL.md`、`scripts/`、`rules/`、`hooks/`、`reference/`、`comet/skill.yaml`、`comet/guardrails.yaml`、`comet/checks.yaml`、`comet/eval.yaml`、`bundle.yaml`。
- 修改 Skill 内容时先改 `assets/skills-zh/`，用户确认中文后再同步 `assets/skills/`。
- 用户可见代码变更完成后更新 `CHANGELOG.md`，版本沿用当前 `package.json` 的 `0.4.0-beta.1` 条目。

---

## Scope Check

这份 spec 覆盖 5 个用户体验主题，但它们不是 5 个独立产品：都围绕同一条 `/comet-any` 创建和发布路径，且复用同一组 Bundle state、factory metadata、readiness 和 distribution 后端。因此用一份 implementation plan 是合理的。

当前代码已经具备这些底座，不要重复实现：

| 已有能力 | 当前位置 |
| --- | --- |
| 项目级偏好解析 | `domains/skill/preferences.ts` |
| 全平台 Skill 扫描和去重 | `domains/skill/find.ts`, `domains/skill/inventory.ts` |
| Bundle candidates | `domains/bundle/candidates.ts` |
| Factory proposal 后端雏形 | `domains/bundle/factory-proposal.ts` |
| Factory state / generate | `domains/bundle/factory.ts` |
| Bundle next action 雏形 | `app/commands/bundle.ts` 内部 `determineNextAction` |
| Readiness blocker/warning/evidence | `domains/bundle/review-summary.ts` |
| `comet publish` façade | `app/commands/publish.ts`, `app/cli/index.ts` |
| Distribution capability / executable disclosure | `domains/bundle/distribute.ts`, `domains/bundle/bundle-platform.ts` |

本计划只补剩余缺口：

- P0: first-use guide and project preference onboarding summary.
- P1: proposal confirmation page fields and persisted confirmation metadata.
- P2: resumable creation summary with user-facing next action.
- P3: readiness user summary that maps internal blockers to actions.
- P4: publish/distribute preview and user-readable distribution summary.

## File Structure

- Create `domains/bundle/next-action.ts`
  - Moves Bundle next action out of `app/commands/bundle.ts`.
  - Produces both backend command and user-facing `comet publish` command where possible.
  - Builds resume summaries from Bundle authoring state.

- Create `domains/bundle/factory-guide.ts`
  - Builds `/comet-any` first-use and resume guide from project preferences, Skill inventory, and active Bundle state.
  - Does not write files.

- Create `domains/bundle/readiness-user-summary.ts`
  - Maps readiness blocker/warning codes to user-facing conclusion, reasons, and next steps.

- Modify `domains/bundle/types.ts`
  - Adds `BundleFactoryProposalSummary`, `BundleFactoryProposalAction`, `BundleFactoryProposalConfirmation`, `BundleResumeSummary`, `BundleReadinessUserSummary`, and preview-related distribution status types.

- Modify `domains/bundle/factory-proposal.ts`
  - Adds user-facing proposal confirmation fields.
  - Adds proposal hash and confirmation actions.

- Modify `domains/bundle/factory.ts`
  - Persists proposal confirmation metadata when `factory-init --confirmed-proposal` is used.
  - Blocks confirmed generation when the proposal still has hard blockers.

- Modify `domains/bundle/review-summary.ts`
  - Adds `userSummary` beside existing machine `readiness`.
  - Keeps existing readiness state and blocker arrays stable.

- Modify `domains/bundle/distribute.ts`
  - Adds dry-run preview mode.
  - Adds planned status and failure/manual-action summary without writing files in preview mode.

- Modify `app/commands/bundle.ts`
  - Uses `domains/bundle/next-action.ts`.
  - Adds `bundleFactoryGuideCommand`.
  - Enhances factory proposal, status, review summary, and distribution text.
  - Passes `preview` and `confirmedProposal` options.

- Modify `app/commands/publish.ts`
  - Keeps façade thin, but allows preview and improved JSON/text to pass through.

- Modify `app/cli/index.ts`
  - Adds `comet bundle factory-guide`.
  - Adds `--confirmed-proposal` to `factory-init`.
  - Adds `--preview` to `publish distribute` and `bundle distribute`.
  - Keeps `comet bundle` described as advanced backend.

- Modify tests:
  - `test/domains/bundle/bundle-next-action.test.ts`
  - `test/domains/bundle/bundle-factory-guide.test.ts`
  - `test/domains/bundle/bundle-command.test.ts`
  - `test/domains/bundle/bundle-review-summary.test.ts`
  - `test/domains/bundle/bundle-distribute.test.ts`
  - `test/domains/bundle/publish-command.test.ts`
  - `test/ts/comet-any-skill.test.ts`
  - `test/ts/readme.test.ts`

- Modify docs and Skill assets:
  - `assets/skills-zh/comet-any/SKILL.md`
  - `assets/skills-zh/comet-any/reference/bundle-authoring.md`
  - `assets/skills-zh/comet-any/reference/eval-provider.md`
  - `assets/skills/comet-any/SKILL.md`
  - `assets/skills/comet-any/reference/bundle-authoring.md`
  - `assets/skills/comet-any/reference/eval-provider.md`
  - `docs/operations/SKILL-CREATION-ZH.md`
  - `docs/operations/EVAL-USAGE-ZH.md`
  - `docs/operations/SKILL-CREATION.md`
  - `docs/operations/EVAL-USAGE.md`
  - `README-zh.md`
  - `README.md`
  - `CHANGELOG.md`

---

### Task 1: Extract Bundle Next Action And Resume Summary

**Files:**
- Create: `domains/bundle/next-action.ts`
- Modify: `app/commands/bundle.ts`
- Test: `test/domains/bundle/bundle-next-action.test.ts`
- Test: `test/domains/bundle/bundle-command.test.ts`
- Test: `test/domains/bundle/publish-command.test.ts`

**Interfaces:**
- Consumes: `BundleAuthoringState` from `domains/bundle/types.ts`
- Produces:
  - `determineBundleNextAction(state: BundleAuthoringState): BundleNextAction`
  - `buildBundleResumeSummary(state: BundleAuthoringState, options?: { currentPreferenceHash?: string | null }): BundleResumeSummary`

- [x] **Step 1: Write failing next-action domain tests**

Create `test/domains/bundle/bundle-next-action.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildBundleResumeSummary,
  determineBundleNextAction,
} from '../../../domains/bundle/next-action.js';
import type { BundleAuthoringState } from '../../../domains/bundle/types.js';

function state(overrides: Partial<BundleAuthoringState> = {}): BundleAuthoringState {
  return {
    schemaVersion: 1,
    name: 'demo-skill',
    mode: 'create',
    status: 'draft',
    draftPath: '/project/.comet/bundle-drafts/demo-skill',
    currentHash: 'a'.repeat(64),
    candidates: [],
    creator: 'native',
    defaultLocale: 'en',
    locales: ['en'],
    engineEnabled: true,
    ...overrides,
  };
}

describe('Bundle next action', () => {
  it('prefers user-facing publish commands after Factory generation', () => {
    const action = determineBundleNextAction(
      state({
        factory: {
          goal: 'Create a demo Skill',
          preferredSkills: ['brainstorming'],
          resolvedSkills: [
            { query: 'brainstorming', preferenceIndex: 0, status: 'available', sources: [] },
          ],
          callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
          deviations: [],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          generatedSkillPackage: {
            entrySkill: 'demo-skill',
            internalSkills: [],
            packageRoot: '/project/.comet/bundle-drafts/demo-skill/skills/demo-skill',
            enginePath: null,
            evalManifestPath:
              '/project/.comet/bundle-drafts/demo-skill/skills/demo-skill/comet/eval.yaml',
          },
        },
      }),
    );

    expect(action).toMatchObject({
      action: 'choose-eval-level',
      category: 'eval',
      userCommand: 'comet eval run --manifest <generated-skill>/comet/eval.yaml --quick --html',
    });
    expect(action.backendCommand).toBe('comet bundle eval-plan demo-skill --level quick');
  });

  it('builds a resume summary with completed and missing steps', () => {
    const summary = buildBundleResumeSummary(
      state({
        factory: {
          goal: 'Create a resumable Skill',
          preferredSkills: ['brainstorming'],
          resolvedSkills: [
            { query: 'brainstorming', preferenceIndex: 0, status: 'available', sources: [] },
          ],
          callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
          deviations: [],
          engineMode: 'deterministic',
          runnerMode: 'standalone',
          preferenceHash: 'old-hash',
          generatedSkillPackage: {
            entrySkill: 'demo-skill',
            internalSkills: [],
            packageRoot: '/draft/skills/demo-skill',
            enginePath: null,
            evalManifestPath: '/draft/skills/demo-skill/comet/eval.yaml',
          },
        },
      }),
      { currentPreferenceHash: 'new-hash' },
    );

    expect(summary).toMatchObject({
      schemaVersion: 1,
      name: 'demo-skill',
      goal: 'Create a resumable Skill',
      currentStep: 'needs-eval',
      preferenceDrift: {
        changed: true,
        storedHash: 'old-hash',
        currentHash: 'new-hash',
      },
      recommendedNextStep: {
        action: 'choose-eval-level',
      },
    });
    expect(summary.completed).toContain('Factory metadata initialized');
    expect(summary.missing).toContain('Passing Eval evidence for the current draft');
  });
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run test/domains/bundle/bundle-next-action.test.ts
```

Expected: fail with module not found for `domains/bundle/next-action.js`.

- [x] **Step 3: Add `domains/bundle/next-action.ts`**

Create `domains/bundle/next-action.ts` with these exports:

```ts
import type { BundleAuthoringState } from './types.js';

export type BundleNextActionKind =
  | 'resolve-candidates'
  | 'fix-composition'
  | 'generate-factory-package'
  | 'choose-eval-level'
  | 'request-review'
  | 'publish'
  | 'ask-distribution'
  | 'done';

export type BundleNextActionCategory =
  | 'factory'
  | 'eval'
  | 'review'
  | 'publish'
  | 'distribute'
  | 'complete';

export interface BundleNextAction {
  action: BundleNextActionKind;
  category: BundleNextActionCategory;
  userLabel: string;
  reason: string;
  backendCommand: string;
  userCommand: string;
  requiresUserConfirmation: boolean;
}

export interface BundleResumeSummary {
  schemaVersion: 1;
  name: string;
  goal: string | null;
  status: BundleAuthoringState['status'];
  currentStep:
    | 'needs-candidate-resolution'
    | 'needs-composition-fix'
    | 'needs-generation'
    | 'needs-eval'
    | 'needs-review'
    | 'needs-publish'
    | 'needs-distribution'
    | 'complete';
  completed: string[];
  missing: string[];
  evidencePaths: Record<string, string>;
  preferenceDrift: {
    changed: boolean;
    storedHash: string | null;
    currentHash: string | null;
  };
  recommendedNextStep: BundleNextAction;
  choices: Array<{ id: 'continue' | 'view-details' | 'abandon'; label: string }>;
}

function factoryPackagePath(state: BundleAuthoringState): string | null {
  return state.factory?.generatedSkillPackage?.packageRoot ?? null;
}

function generatedEvalManifest(state: BundleAuthoringState): string | null {
  return state.factory?.generatedSkillPackage?.evalManifestPath ?? null;
}

export function determineBundleNextAction(state: BundleAuthoringState): BundleNextAction {
  const unresolved =
    state.factory?.resolvedSkills.filter(
      (skill) => skill.status === 'missing' || skill.status === 'ambiguous',
    ) ?? [];
  if (unresolved.length > 0) {
    const first = unresolved[0];
    return {
      action: 'resolve-candidates',
      category: 'factory',
      userLabel: 'Resolve missing or ambiguous Skill candidates',
      reason: `${unresolved.length} unresolved Factory candidate(s) remain`,
      backendCommand: `comet bundle factory-resolve ${state.name} --candidate ${first.query}`,
      userCommand: `Ask /comet-any to resolve ${first.query}`,
      requiresUserConfirmation: true,
    };
  }

  const compositionIssues = state.factory?.composition?.issues ?? [];
  if (compositionIssues.length > 0) {
    const first = compositionIssues[0];
    return {
      action: 'fix-composition',
      category: 'factory',
      userLabel: 'Fix the composition plan',
      reason: `Factory composition has ${compositionIssues.length} issue(s): ${first.message}`,
      backendCommand: `comet bundle review-summary ${state.name} --platform <reference-platform>`,
      userCommand: 'Ask /comet-any to revise the composition proposal',
      requiresUserConfirmation: true,
    };
  }

  if (state.factory && !state.factory.generatedSkillPackage) {
    return {
      action: 'generate-factory-package',
      category: 'factory',
      userLabel: 'Generate the Comet-native Skill package',
      reason: 'Factory metadata exists but no generated Skill package is recorded yet',
      backendCommand: `comet bundle factory-generate ${state.name}`,
      userCommand: 'Ask /comet-any to continue generation',
      requiresUserConfirmation: false,
    };
  }

  if (!state.eval || state.eval.hash !== state.currentHash || !state.eval.passed) {
    const manifest = generatedEvalManifest(state);
    return {
      action: 'choose-eval-level',
      category: 'eval',
      userLabel: 'Run Eval for the generated Skill',
      reason: 'Current draft hash is missing passing Eval evidence',
      backendCommand: `comet bundle eval-plan ${state.name} --level quick`,
      userCommand: manifest
        ? `comet eval run --manifest ${manifest} --quick --html`
        : 'comet eval run --skill-path <generated-skill> --quick --html',
      requiresUserConfirmation: true,
    };
  }

  if (!state.review || state.review.hash !== state.currentHash) {
    return {
      action: 'request-review',
      category: 'review',
      userLabel: 'Review readiness before approval',
      reason: 'Current draft hash is missing review approval',
      backendCommand: `comet bundle review-summary ${state.name} --platform <reference-platform>`,
      userCommand: `comet publish review ${state.name} --platform <reference-platform>`,
      requiresUserConfirmation: true,
    };
  }

  if (state.status === 'review-approved' && !state.ready) {
    return {
      action: 'publish',
      category: 'publish',
      userLabel: 'Publish the approved candidate',
      reason: 'Eval and review are present; the draft is ready to publish',
      backendCommand: `comet bundle publish ${state.name} --platform <reference-platform>`,
      userCommand: `comet publish run ${state.name} --platform <reference-platform>`,
      requiresUserConfirmation: true,
    };
  }

  if (state.ready) {
    return {
      action: 'ask-distribution',
      category: 'distribute',
      userLabel: 'Preview distribution before installing into Agent platforms',
      reason: 'Ready Bundle exists; the next step is distribution after user confirmation',
      backendCommand: `comet bundle distribute ${state.name} --platform <platform> --scope project --preview`,
      userCommand: `comet publish distribute ${state.name} --platform <platform> --scope project --preview`,
      requiresUserConfirmation: true,
    };
  }

  return {
    action: 'done',
    category: 'complete',
    userLabel: 'No further action required',
    reason: 'No further automatic Bundle action is required',
    backendCommand: 'none',
    userCommand: 'none',
    requiresUserConfirmation: false,
  };
}

export function buildBundleResumeSummary(
  state: BundleAuthoringState,
  options: { currentPreferenceHash?: string | null } = {},
): BundleResumeSummary {
  const nextAction = determineBundleNextAction(state);
  const currentStepByAction: Record<BundleNextActionKind, BundleResumeSummary['currentStep']> = {
    'resolve-candidates': 'needs-candidate-resolution',
    'fix-composition': 'needs-composition-fix',
    'generate-factory-package': 'needs-generation',
    'choose-eval-level': 'needs-eval',
    'request-review': 'needs-review',
    publish: 'needs-publish',
    'ask-distribution': 'needs-distribution',
    done: 'complete',
  };
  const completed: string[] = [];
  const missing: string[] = [];
  if (state.factory) completed.push('Factory metadata initialized');
  else missing.push('Factory metadata');
  if (state.factory?.generatedSkillPackage) completed.push('Generated Skill package recorded');
  else if (state.factory) missing.push('Generated Skill package');
  if (state.eval?.hash === state.currentHash && state.eval.passed) completed.push('Passing Eval evidence');
  else missing.push('Passing Eval evidence for the current draft');
  if (state.review?.hash === state.currentHash && state.review.decision === 'approved') {
    completed.push('Review approval for the current draft');
  } else {
    missing.push('Review approval for the current draft');
  }
  if (state.ready?.hash === state.currentHash) completed.push('Published Bundle');
  else if (state.status === 'review-approved') missing.push('Published Bundle');

  const storedHash = state.factory?.preferenceHash ?? null;
  const currentHash = options.currentPreferenceHash ?? null;
  return {
    schemaVersion: 1,
    name: state.name,
    goal: state.factory?.goal ?? null,
    status: state.status,
    currentStep: currentStepByAction[nextAction.action],
    completed,
    missing,
    evidencePaths: {
      draft: state.draftPath,
      ...(factoryPackagePath(state) ? { generatedSkill: factoryPackagePath(state)! } : {}),
      ...(generatedEvalManifest(state) ? { evalManifest: generatedEvalManifest(state)! } : {}),
      ...(state.eval?.resultPath ? { evalResult: state.eval.resultPath } : {}),
      ...(state.ready?.path ? { publishedBundle: state.ready.path } : {}),
    },
    preferenceDrift: {
      changed: Boolean(storedHash && currentHash && storedHash !== currentHash),
      storedHash,
      currentHash,
    },
    recommendedNextStep: nextAction,
    choices: [
      { id: 'continue', label: 'Continue' },
      { id: 'view-details', label: 'View details' },
      { id: 'abandon', label: 'Abandon this flow' },
    ],
  };
}
```

- [x] **Step 4: Replace the private command-layer next action**

Modify `app/commands/bundle.ts`:

```ts
import {
  buildBundleResumeSummary,
  determineBundleNextAction,
  type BundleNextAction,
} from '../../domains/bundle/next-action.js';
import { readProjectSkillPreferences } from '../../domains/skill/preferences.js';
```

Remove the local `BundleNextAction` interface and `determineNextAction()` function from `app/commands/bundle.ts`.

Replace callers:

```ts
const nextAction = determineBundleNextAction(state);
```

In `bundleStatusCommand`, also compute current preference hash:

```ts
const currentPreferences = await readProjectSkillPreferences(projectRoot(options));
const resumeSummary = buildBundleResumeSummary(state, {
  currentPreferenceHash: currentPreferences?.hash ?? null,
});
emit({ ...state, nextAction, resumeSummary }, options.json, formatStatusText(state, resumeSummary));
```

In `bundleListCommand`, attach `resumeSummary` for each state:

```ts
const root = projectRoot(options);
const currentPreferences = await readProjectSkillPreferences(root);
const states = (await listBundleAuthoringStates(root)).map((state) => ({
  ...state,
  nextAction: determineBundleNextAction(state),
  resumeSummary: buildBundleResumeSummary(state, {
    currentPreferenceHash: currentPreferences?.hash ?? null,
  }),
}));
```

- [x] **Step 5: Update status/list text to include resume summary**

Change `formatStatusText` signature:

```ts
function formatStatusText(
  state: Awaited<ReturnType<typeof reconcileBundleAuthoringState>>,
  resumeSummary: ReturnType<typeof buildBundleResumeSummary>,
): string
```

Include user-facing fields:

```ts
`Current step: ${resumeSummary.currentStep}`,
`User next step: ${resumeSummary.recommendedNextStep.userLabel}`,
`Suggested user command: ${resumeSummary.recommendedNextStep.userCommand}`,
...(resumeSummary.preferenceDrift.changed
  ? ['Preference drift: project Skill preferences changed after this flow started']
  : []),
```

Keep backend command visible for advanced debugging:

```ts
`Backend command: ${resumeSummary.recommendedNextStep.backendCommand}`,
```

- [x] **Step 6: Run focused tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-next-action.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/publish-command.test.ts
```

Expected: all pass. Existing assertions expecting `nextAction.action` should continue to pass because the field remains stable.

- [x] **Step 7: Commit Task 1**

```bash
git add domains/bundle/next-action.ts app/commands/bundle.ts test/domains/bundle/bundle-next-action.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/publish-command.test.ts
git commit -m "feat: add bundle resume summaries"
```

---

### Task 2: Add Factory First-Use Guide

**Files:**
- Create: `domains/bundle/factory-guide.ts`
- Modify: `app/commands/bundle.ts`
- Modify: `app/cli/index.ts`
- Test: `test/domains/bundle/bundle-factory-guide.test.ts`
- Test: `test/domains/bundle/bundle-command.test.ts`

**Interfaces:**
- Consumes:
  - `buildSkillInventory(options)` from `domains/skill/inventory.ts`
  - `readProjectSkillPreferences(projectRoot)` from `domains/skill/preferences.ts`
  - `listBundleAuthoringStates(projectRoot)` from `domains/bundle/state.ts`
  - `buildBundleResumeSummary(state, options)` from Task 1
- Produces:
  - `buildBundleFactoryGuide(options: { projectRoot: string; homeDir?: string; builtinRoot?: string }): Promise<BundleFactoryGuide>`
  - CLI backend `comet bundle factory-guide --json`

- [x] **Step 1: Write failing guide tests**

Create `test/domains/bundle/bundle-factory-guide.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { buildBundleFactoryGuide } from '../../../domains/bundle/factory-guide.js';
import { createBundleDraft } from '../../../domains/bundle/draft.js';

async function writeSkill(root: string, name: string, description: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, 'SKILL.md'),
    `---
name: ${name}
description: ${description}
---

# ${name}
`,
  );
}

describe('Bundle Factory first-use guide', () => {
  let root: string;
  let projectRoot: string;
  let homeDir: string;
  let builtinRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-factory-guide-'));
    projectRoot = path.join(root, 'project');
    homeDir = path.join(root, 'home');
    builtinRoot = path.join(root, 'builtin');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('guides first-use projects without saved preferences', async () => {
    await writeSkill(
      path.join(projectRoot, '.codex', 'skills', 'brainstorming'),
      'brainstorming',
      'Explore intent before implementation.',
    );
    await writeSkill(
      path.join(homeDir, '.codex', 'skills', 'writing-plans'),
      'writing-plans',
      'Write implementation plans.',
    );

    const guide = await buildBundleFactoryGuide({ projectRoot, homeDir, builtinRoot });

    expect(guide).toMatchObject({
      schemaVersion: 1,
      preference: {
        state: 'missing',
        path: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      },
      firstRun: true,
      userMessage: {
        title: 'Start with /comet-any',
      },
    });
    expect(guide.inventory.recommended.map((item) => item.name)).toEqual([
      'brainstorming',
      'writing-plans',
    ]);
    expect(guide.nextQuestions).toContain('What Skill do you want to create or optimize?');
    expect(guide.nextQuestions).toContain(
      'Should Comet save these preferences to .comet/skill-preferences.yaml?',
    );
  });

  it('surfaces resumable Factory flows before starting a new one', async () => {
    await createBundleDraft({
      projectRoot,
      name: 'half-built',
      candidates: [],
      creator: 'native',
      defaultLocale: 'en',
      locales: ['en'],
      engineEnabled: true,
      factory: {
        goal: 'Create a half-built Skill',
        preferredSkills: ['brainstorming'],
        resolvedSkills: [
          { query: 'brainstorming', preferenceIndex: 0, status: 'available', sources: [] },
        ],
        callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
        deviations: [],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
    });

    const guide = await buildBundleFactoryGuide({ projectRoot, homeDir, builtinRoot });

    expect(guide.firstRun).toBe(false);
    expect(guide.resumable).toEqual([
      expect.objectContaining({
        name: 'half-built',
        goal: 'Create a half-built Skill',
        currentStep: 'needs-generation',
        recommendedNextStep: expect.objectContaining({
          action: 'generate-factory-package',
        }),
      }),
    ]);
    expect(guide.userMessage.summary).toContain('unfinished Skill creation flow');
  });
});
```

- [x] **Step 2: Run the focused guide test and verify it fails**

Run:

```bash
npx vitest run test/domains/bundle/bundle-factory-guide.test.ts
```

Expected: fail with module not found for `domains/bundle/factory-guide.js`.

- [x] **Step 3: Implement `domains/bundle/factory-guide.ts`**

Create `domains/bundle/factory-guide.ts`:

```ts
import path from 'path';
import { buildSkillInventory, type SkillInventoryItem } from '../skill/inventory.js';
import {
  readProjectSkillPreferences,
  skillPreferencesPath,
  type ProjectSkillPreferences,
} from '../skill/preferences.js';
import { listBundleAuthoringStates } from './state.js';
import { buildBundleResumeSummary, type BundleResumeSummary } from './next-action.js';

export interface BundleFactoryGuide {
  schemaVersion: 1;
  projectRoot: string;
  firstRun: boolean;
  preference: {
    state: 'missing' | 'present' | 'invalid';
    path: string;
    mode: 'advisory' | 'strict' | null;
    hash: string | null;
    prefer: string[];
    require: string[];
    warnings: unknown[];
    error: string | null;
  };
  inventory: {
    total: number;
    recommended: SkillInventoryItem[];
    ambiguous: SkillInventoryItem[];
    duplicateInstalls: SkillInventoryItem[];
    groups: Record<string, string[]>;
  };
  resumable: BundleResumeSummary[];
  nextQuestions: string[];
  userMessage: {
    title: string;
    summary: string;
    nextStep: string;
  };
}

function groups(items: SkillInventoryItem[]): Record<string, string[]> {
  return items.reduce<Record<string, string[]>>((acc, item) => {
    acc[item.capabilityGroup] = [...(acc[item.capabilityGroup] ?? []), item.name];
    return acc;
  }, {});
}

async function readPreferencesSafely(projectRoot: string): Promise<{
  value: ProjectSkillPreferences | null;
  error: string | null;
}> {
  try {
    return { value: await readProjectSkillPreferences(projectRoot), error: null };
  } catch (error) {
    return { value: null, error: (error as Error).message };
  }
}

export async function buildBundleFactoryGuide(options: {
  projectRoot: string;
  homeDir?: string;
  builtinRoot?: string;
}): Promise<BundleFactoryGuide> {
  const projectRoot = path.resolve(options.projectRoot);
  const [preferencesResult, inventory, states] = await Promise.all([
    readPreferencesSafely(projectRoot),
    buildSkillInventory({
      projectRoot,
      homeDir: options.homeDir,
      builtinRoot: options.builtinRoot,
    }),
    listBundleAuthoringStates(projectRoot),
  ]);
  const preferences = preferencesResult.value;
  const resumable = states
    .filter((state) => state.status !== 'ready' || state.ready)
    .map((state) =>
      buildBundleResumeSummary(state, {
        currentPreferenceHash: preferences?.hash ?? null,
      }),
    );
  const recommended = inventory.filter((item) => item.recommended);
  const ambiguous = inventory.filter((item) => item.status === 'ambiguous');
  const duplicateInstalls = inventory.filter((item) => item.duplicateInstall);
  const hasPreferences = Boolean(preferences);
  const hasInvalidPreferences = Boolean(preferencesResult.error);
  const hasResumable = resumable.length > 0;

  return {
    schemaVersion: 1,
    projectRoot,
    firstRun: !hasPreferences && !hasInvalidPreferences && !hasResumable,
    preference: {
      state: hasInvalidPreferences ? 'invalid' : hasPreferences ? 'present' : 'missing',
      path: preferences?.path ?? skillPreferencesPath(projectRoot),
      mode: preferences?.preferences.mode ?? null,
      hash: preferences?.hash ?? null,
      prefer: preferences?.preferences.prefer ?? [],
      require: preferences?.preferences.require ?? [],
      warnings: preferences?.warnings ?? [],
      error: preferencesResult.error,
    },
    inventory: {
      total: inventory.length,
      recommended,
      ambiguous,
      duplicateInstalls,
      groups: groups(inventory),
    },
    resumable,
    nextQuestions: [
      'What Skill do you want to create or optimize?',
      'Which discovered Skills should Comet prefer?',
      'Should Comet save these preferences to .comet/skill-preferences.yaml?',
      'May Comet generate scripts, rules, and hooks as the control plane?',
    ],
    userMessage: hasResumable
      ? {
          title: 'Resume /comet-any',
          summary: `Found ${resumable.length} unfinished Skill creation flow(s).`,
          nextStep: 'Resume one flow before starting a new Skill unless the user explicitly starts over.',
        }
      : hasPreferences
        ? {
            title: 'Start with saved project preferences',
            summary: `Using ${preferences!.preferences.prefer.length + preferences!.preferences.require.length} saved Skill preference(s).`,
            nextStep: 'Ask for the Skill goal, then build a composition proposal.',
          }
        : {
            title: 'Start with /comet-any',
            summary: 'No project Skill preferences are saved yet.',
            nextStep: 'Show discovered recommended Skills and ask whether to save project preferences.',
          },
  };
}
```

- [x] **Step 4: Add `bundleFactoryGuideCommand`**

Modify `app/commands/bundle.ts` imports:

```ts
import { buildBundleFactoryGuide } from '../../domains/bundle/factory-guide.js';
```

Add formatter:

```ts
function formatFactoryGuideText(guide: Awaited<ReturnType<typeof buildBundleFactoryGuide>>): string {
  return [
    guide.userMessage.title,
    guide.userMessage.summary,
    `Preference file: ${guide.preference.state} (${guide.preference.path})`,
    `Discovered Skills: ${guide.inventory.total}`,
    ...formatOptionalSection(
      'Recommended Skills:',
      guide.inventory.recommended.map((item) => `${item.name} - ${item.reason}`),
    ),
    ...formatOptionalSection(
      'Ambiguous Skills:',
      guide.inventory.ambiguous.map(
        (item) => `${item.name} (${item.sources.map((source) => source.platform ?? source.origin).join(', ')})`,
      ),
    ),
    ...formatOptionalSection(
      'Resumable flows:',
      guide.resumable.map(
        (item) => `${item.name}: ${item.currentStep}; next ${item.recommendedNextStep.userLabel}`,
      ),
    ),
    `Next step: ${guide.userMessage.nextStep}`,
  ].join('\n');
}
```

Add command:

```ts
export async function bundleFactoryGuideCommand(
  options: BundleCommandOptions = {},
): Promise<void> {
  const guide = await buildBundleFactoryGuide({ projectRoot: projectRoot(options) });
  emit(guide, options.json, formatFactoryGuideText(guide));
}
```

- [x] **Step 5: Register the CLI command**

Modify `app/cli/index.ts` imports:

```ts
bundleFactoryGuideCommand,
```

Register under `bundle` before `factory-propose`:

```ts
bundle
  .command('factory-guide')
  .description('Summarize /comet-any first-use, preferences, and resumable Factory flows')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await bundleFactoryGuideCommand(options);
  });
```

- [x] **Step 6: Add command-level assertions**

In `test/domains/bundle/bundle-command.test.ts`, add:

```ts
it('prints the Factory first-use guide for /comet-any', async () => {
  await writeFactorySkill(projectRoot, 'brainstorming', {
    description: 'Explore intent before implementation.',
  });

  const result = await captureJson(() =>
    bundleFactoryGuideCommand({ project: projectRoot, json: true }),
  );

  expect(result).toMatchObject({
    schemaVersion: 1,
    preference: { state: 'missing' },
    userMessage: { title: 'Start with /comet-any' },
  });

  const text = await captureText(() => bundleFactoryGuideCommand({ project: projectRoot }));
  expect(text).toContain('Preference file: missing');
  expect(text).toContain('Next step:');
});
```

Update the import list in that test:

```ts
bundleFactoryGuideCommand,
```

- [x] **Step 7: Run focused tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-factory-guide.test.ts test/domains/bundle/bundle-command.test.ts
```

Expected: all pass.

- [x] **Step 8: Commit Task 2**

```bash
git add domains/bundle/factory-guide.ts app/commands/bundle.ts app/cli/index.ts test/domains/bundle/bundle-factory-guide.test.ts test/domains/bundle/bundle-command.test.ts
git commit -m "feat: add comet-any factory guide"
```

---

### Task 3: Make Factory Proposal A Confirmable User Decision

**Files:**
- Modify: `domains/bundle/types.ts`
- Modify: `domains/bundle/factory-proposal.ts`
- Modify: `domains/bundle/factory.ts`
- Modify: `app/commands/bundle.ts`
- Modify: `app/cli/index.ts`
- Test: `test/domains/bundle/bundle-command.test.ts`
- Test: `test/domains/bundle/bundle-authoring.test.ts`

**Interfaces:**
- Consumes:
  - `buildBundleFactoryProposal(options)` from `domains/bundle/factory-proposal.ts`
  - `initializeBundleFactoryState(options)` from `domains/bundle/factory.ts`
- Produces:
  - `BundleFactoryProposal.userSummary`
  - `BundleFactoryProposal.actions`
  - `BundleFactoryProposal.proposalHash`
  - `BundleFactoryMetadata.proposalConfirmation`
  - CLI flag `comet bundle factory-init <name> --confirmed-proposal`

- [x] **Step 1: Add failing proposal JSON/text tests**

In `test/domains/bundle/bundle-command.test.ts`, extend the existing `factory-propose` coverage or add:

```ts
it('prints a user-decision Factory proposal before initialization', async () => {
  await writeFactorySkill(projectRoot, 'brainstorming', {
    description: 'Explore intent before implementation.',
  });
  const planFile = path.join(root, 'factory-plan.json');
  await fs.writeFile(
    planFile,
    JSON.stringify(
      {
        goal: 'Create a guided planning Skill',
        preferredSkills: ['brainstorming'],
        callChain: [{ skill: 'brainstorming' }],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
      null,
      2,
    ),
  );

  const proposal = await captureJson(() =>
    bundleFactoryProposeCommand('guided-planning', {
      project: projectRoot,
      file: planFile,
      json: true,
    }),
  );

  expect(proposal).toMatchObject({
    schemaVersion: 1,
    name: 'guided-planning',
    canGenerate: true,
    userSummary: {
      title: 'Create guided-planning as a Comet-native Skill',
      generatedControlPlane: expect.arrayContaining([
        'SKILL.md',
        'scripts/',
        'rules/',
        'hooks/',
        'comet/checks.yaml',
        'comet/eval.yaml',
      ]),
      requiredConfirmations: expect.arrayContaining([
        expect.objectContaining({ id: 'generate-scripts' }),
        expect.objectContaining({ id: 'generate-hooks' }),
      ]),
    },
    actions: expect.arrayContaining([
      expect.objectContaining({ id: 'confirm-generate' }),
      expect.objectContaining({ id: 'revise-proposal' }),
      expect.objectContaining({ id: 'cancel' }),
    ]),
    proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });

  const text = await captureText(() =>
    bundleFactoryProposeCommand('guided-planning', {
      project: projectRoot,
      file: planFile,
    }),
  );
  expect(text).toContain('Will reuse Skills:');
  expect(text).toContain('Will generate control plane:');
  expect(text).toContain('Required confirmations:');
  expect(text).toContain('Actions:');
});
```

- [x] **Step 2: Add failing confirmation metadata test**

In `test/domains/bundle/bundle-authoring.test.ts`, add:

```ts
it('records user proposal confirmation metadata during Factory initialization', async () => {
  await writeFactorySkill(projectRoot, 'brainstorming', {
    description: 'Explore intent before implementation.',
  });
  const planFile = path.join(root, 'confirmed-plan.json');
  await fs.writeFile(
    planFile,
    JSON.stringify(
      {
        goal: 'Create a confirmed Skill',
        preferredSkills: ['brainstorming'],
        callChain: [{ skill: 'brainstorming' }],
        engineMode: 'deterministic',
        runnerMode: 'standalone',
      },
      null,
      2,
    ),
  );

  const state = await initializeBundleFactoryState({
    projectRoot,
    name: 'confirmed-skill',
    filePath: planFile,
    confirmedProposal: true,
  });

  expect(state.factory?.proposalConfirmation).toMatchObject({
    confirmed: true,
    proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    acceptedCapabilities: ['skills', 'scripts', 'rules', 'hooks', 'references'],
  });
  expect(state.factory?.proposalConfirmation?.confirmedAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T/u,
  );
});
```

Update imports in the test if needed:

```ts
import { initializeBundleFactoryState } from '../../../domains/bundle/factory.js';
```

- [x] **Step 3: Extend types**

Modify `domains/bundle/types.ts`:

```ts
export interface BundleFactoryProposalConfirmationItem {
  id:
    | 'generate-scripts'
    | 'generate-rules'
    | 'generate-hooks'
    | 'run-eval'
    | 'accept-preference-deviation';
  label: string;
  required: boolean;
  reason: string;
}

export interface BundleFactoryProposalAction {
  id: 'confirm-generate' | 'revise-proposal' | 'cancel';
  label: string;
  command: string;
  writesState: boolean;
}

export interface BundleFactoryProposalSummary {
  title: string;
  goal: string;
  reusedSkills: Array<{
    skill: string;
    status: BundleFactoryResolvedSkill['status'];
    sourceCount: number;
    preferenceIndex: number | null;
    fromProjectPreference: boolean;
  }>;
  generatedControlPlane: string[];
  validationPlan: string[];
  requiredConfirmations: BundleFactoryProposalConfirmationItem[];
  preferenceNotes: string[];
}

export interface BundleFactoryProposalConfirmation {
  confirmed: boolean;
  confirmedAt: string;
  proposalHash: string;
  preferenceHash: string | null;
  acceptedCapabilities: Array<'skills' | 'scripts' | 'rules' | 'hooks' | 'references'>;
  warnings: string[];
}
```

Add to `BundleFactoryMetadata`:

```ts
  proposalConfirmation?: BundleFactoryProposalConfirmation;
```

- [x] **Step 4: Add proposal hash and user summary**

Modify `domains/bundle/factory-proposal.ts`:

```ts
import { createHash } from 'crypto';
import type {
  BundleFactoryProposalAction,
  BundleFactoryProposalSummary,
} from './types.js';
```

Update `BundleFactoryProposal`:

```ts
  userSummary: BundleFactoryProposalSummary;
  actions: BundleFactoryProposalAction[];
  proposalHash: string;
```

Add helpers:

```ts
function proposalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function generatedControlPlane(): string[] {
  return [
    'SKILL.md',
    'scripts/',
    'rules/',
    'hooks/',
    'reference/',
    'comet/skill.yaml',
    'comet/guardrails.yaml',
    'comet/checks.yaml',
    'comet/eval.yaml',
    'bundle.yaml',
  ];
}

function validationPlan(): string[] {
  return ['quick smoke eval', 'generated Skill manifest eval', 'publish readiness review'];
}
```

Build `userSummary` before return:

```ts
const userSummary: BundleFactoryProposalSummary = {
  title: `Create ${options.name} as a Comet-native Skill`,
  goal: plan.goal,
  reusedSkills: resolvedSkills.map((skill) => ({
    skill: skill.query,
    status: skill.status,
    sourceCount: skill.sources.length,
    preferenceIndex: skill.preferenceIndex,
    fromProjectPreference: skill.preferenceIndex !== null,
  })),
  generatedControlPlane: generatedControlPlane(),
  validationPlan: validationPlan(),
  requiredConfirmations: [
    {
      id: 'generate-scripts',
      label: 'Allow Comet to generate scripts as part of the control plane',
      required: true,
      reason: 'Scripts let the generated Skill perform deterministic checks and recovery steps.',
    },
    {
      id: 'generate-rules',
      label: 'Allow Comet to generate orchestration rules',
      required: true,
      reason: 'Rules keep the Agent aligned with the generated workflow.',
    },
    {
      id: 'generate-hooks',
      label: 'Allow Comet to generate portable hook descriptors',
      required: true,
      reason: 'Hooks guard unsafe progression and are compiled per target platform during distribution.',
    },
    {
      id: 'run-eval',
      label: 'Run Eval before publish',
      required: true,
      reason: 'Eval evidence is required before the candidate can become publishable.',
    },
  ],
  preferenceNotes: [
    ...plan.deviations.map((item) => `${item.skill}: ${item.reason}`),
    ...blockers.filter((item) => item.startsWith('[policy]')),
  ],
};
const actions: BundleFactoryProposalAction[] = [
  {
    id: 'confirm-generate',
    label: 'Confirm and initialize generation',
    command: `comet bundle factory-init ${options.name} --file ${path.resolve(options.filePath)} --confirmed-proposal`,
    writesState: true,
  },
  {
    id: 'revise-proposal',
    label: 'Revise the plan before generating',
    command: 'Ask /comet-any to revise the goal, preferences, or candidate choices',
    writesState: false,
  },
  {
    id: 'cancel',
    label: 'Cancel without writing Bundle state',
    command: 'No command',
    writesState: false,
  },
];
```

Return:

```ts
const proposal = {
  schemaVersion: 1,
  name: options.name,
  goal: plan.goal,
  preference: { ... },
  callChain: composed.callChain.length > 0 ? composed.callChain : plan.callChain,
  resolvedSkills,
  composition: composed.composition,
  blockers,
  warnings: plan.deviations.map((item) => `[deviation] ${item.skill}: ${item.reason}`),
  canGenerate: blockers.length === 0,
  userSummary,
  actions,
};
return { ...proposal, proposalHash: proposalHash(proposal) };
```

- [x] **Step 5: Persist confirmation metadata**

Modify `domains/bundle/factory.ts` option type for `initializeBundleFactoryState`:

```ts
confirmedProposal?: boolean;
```

Import proposal builder:

```ts
import { buildBundleFactoryProposal } from './factory-proposal.js';
```

Inside `initializeBundleFactoryState`, after plan normalization and before `createBundleDraft`, compute:

```ts
const proposal = await buildBundleFactoryProposal({
  projectRoot,
  name: options.name,
  filePath: options.filePath,
});
if (options.confirmedProposal && !proposal.canGenerate) {
  throw new Error(`Cannot confirm blocked Factory proposal: ${proposal.blockers.join('; ')}`);
}
```

When constructing `factory`, add:

```ts
proposalConfirmation: options.confirmedProposal
  ? {
      confirmed: true,
      confirmedAt: new Date().toISOString(),
      proposalHash: proposal.proposalHash,
      preferenceHash: proposal.preference.hash,
      acceptedCapabilities: ['skills', 'scripts', 'rules', 'hooks', 'references'],
      warnings: [...proposal.warnings, ...proposal.blockers],
    }
  : undefined,
```

- [x] **Step 6: Wire `--confirmed-proposal` through the command layer**

Modify `BundleCommandOptions` in `app/commands/bundle.ts`:

```ts
  confirmedProposal?: boolean;
```

Modify `bundleFactoryInitCommand`:

```ts
const updated = await initializeBundleFactoryState({
  projectRoot: projectRoot(options),
  name,
  filePath: options.file,
  confirmedProposal: options.confirmedProposal,
});
```

Modify `app/cli/index.ts` `factory-init` command:

```ts
.option('--confirmed-proposal', 'Record that the user approved the Factory proposal')
```

- [x] **Step 7: Enhance proposal text output**

Modify `formatFactoryProposalText` or inline text in `bundleFactoryProposeCommand`:

```ts
[
  `Factory proposal ${proposal.name}`,
  proposal.userSummary.title,
  `Goal: ${proposal.goal}`,
  `Preference mode: ${proposal.preference.mode}`,
  `Can generate: ${proposal.canGenerate ? 'yes' : 'no'}`,
  ...formatOptionalSection(
    'Will reuse Skills:',
    proposal.userSummary.reusedSkills.map(
      (item) => `${item.skill}: ${item.status}; ${item.sourceCount} source(s)`,
    ),
  ),
  ...formatOptionalSection('Will generate control plane:', proposal.userSummary.generatedControlPlane),
  ...formatOptionalSection('Validation plan:', proposal.userSummary.validationPlan),
  ...formatOptionalSection(
    'Required confirmations:',
    proposal.userSummary.requiredConfirmations.map((item) => `${item.label} - ${item.reason}`),
  ),
  ...formatOptionalSection('Blockers:', proposal.blockers),
  ...formatOptionalSection(
    'Actions:',
    proposal.actions.map((action) => `${action.id}: ${action.command}`),
  ),
].join('\n')
```

- [x] **Step 8: Run focused tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-authoring.test.ts
```

Expected: all pass.

- [x] **Step 9: Commit Task 3**

```bash
git add domains/bundle/types.ts domains/bundle/factory-proposal.ts domains/bundle/factory.ts app/commands/bundle.ts app/cli/index.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-authoring.test.ts
git commit -m "feat: add confirmable factory proposals"
```

---

### Task 4: Surface Resume Summary In Status And Publish Facade

**Files:**
- Modify: `app/commands/bundle.ts`
- Modify: `app/commands/publish.ts`
- Test: `test/domains/bundle/bundle-command.test.ts`
- Test: `test/domains/bundle/publish-command.test.ts`

**Interfaces:**
- Consumes:
  - `BundleResumeSummary` from Task 1
  - `determineBundleNextAction` from Task 1
- Produces:
  - JSON `resumeSummary` on `comet bundle status`, `comet bundle list`, `comet publish status`, `comet publish list`
  - Text sections `Current step`, `Already done`, `Still missing`, `Suggested user command`

- [x] **Step 1: Add failing status/list output tests**

In `test/domains/bundle/bundle-command.test.ts`, extend `lists recoverable Bundle authoring states with next actions`:

```ts
expect(result).toMatchObject({
  bundles: [
    expect.objectContaining({
      resumeSummary: expect.objectContaining({
        schemaVersion: 1,
        currentStep: 'needs-eval',
        recommendedNextStep: expect.objectContaining({
          userCommand: expect.stringContaining('comet eval run'),
        }),
      }),
    }),
    expect.objectContaining({
      resumeSummary: expect.objectContaining({
        schemaVersion: 1,
      }),
    }),
  ],
});
expect(text).toContain('Next action:');
expect(text).toContain('Suggested user command:');
```

In `test/domains/bundle/publish-command.test.ts`, extend `lists and inspects publish candidates through the facade`:

```ts
expect(listed).toMatchObject({
  bundles: [
    expect.objectContaining({
      resumeSummary: expect.objectContaining({
        currentStep: 'needs-eval',
      }),
    }),
  ],
});
expect(status).toMatchObject({
  resumeSummary: expect.objectContaining({
    recommendedNextStep: expect.objectContaining({
      category: 'eval',
    }),
  }),
});

const text = await captureText(() =>
  publishStatusCommand('publish-facade', { project: projectRoot }),
);
expect(text).toContain('Current step: needs-eval');
expect(text).toContain('Suggested user command:');
```

- [x] **Step 2: Update `formatListText`**

Modify `app/commands/bundle.ts` `formatListText` item body:

```ts
`Current step: ${state.resumeSummary.currentStep}`,
`Suggested user command: ${state.resumeSummary.recommendedNextStep.userCommand}`,
```

Keep existing `Next action` line:

```ts
`Next action: ${state.nextAction.action}`,
```

- [x] **Step 3: Update `formatStatusText` with completed/missing sections**

In `app/commands/bundle.ts`, append:

```ts
...formatOptionalSection('Already done:', resumeSummary.completed),
...formatOptionalSection('Still missing:', resumeSummary.missing),
```

Use `resumeSummary.recommendedNextStep.userCommand` for the user command and `backendCommand` for backend detail.

- [x] **Step 4: Keep publish façade thin**

No extra logic belongs in `app/commands/publish.ts`. It should continue calling:

```ts
await bundleListCommand(options);
await bundleStatusCommand(name, options);
```

The publish façade gets `resumeSummary` automatically from the bundle command.

- [x] **Step 5: Run focused tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-command.test.ts test/domains/bundle/publish-command.test.ts
```

Expected: all pass.

- [x] **Step 6: Commit Task 4**

```bash
git add app/commands/bundle.ts app/commands/publish.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/publish-command.test.ts
git commit -m "feat: show publish resume summaries"
```

---

### Task 5: Add User-Facing Readiness Summary

**Files:**
- Create: `domains/bundle/readiness-user-summary.ts`
- Modify: `domains/bundle/review-summary.ts`
- Modify: `app/commands/bundle.ts`
- Test: `test/domains/bundle/bundle-review-summary.test.ts`
- Test: `test/domains/bundle/bundle-command.test.ts`
- Test: `test/domains/bundle/publish-command.test.ts`

**Interfaces:**
- Consumes:
  - `BundleReviewReadiness`
  - `BundleReviewSummary`
- Produces:
  - `buildReadinessUserSummary(readiness, options): BundleReadinessUserSummary`
  - `BundleReviewSummary.userSummary`

- [x] **Step 1: Add failing readiness summary tests**

In `test/domains/bundle/bundle-review-summary.test.ts`, extend `classifies readiness blockers by type and exposes all readiness states`:

```ts
expect(blocked.userSummary).toMatchObject({
  conclusion: 'blocked',
  title: 'Cannot publish yet',
});
expect(blocked.userSummary.items).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      code: 'candidate',
      severity: 'blocker',
      nextAction: expect.objectContaining({
        label: expect.stringContaining('Resolve'),
      }),
    }),
    expect.objectContaining({
      code: 'eval',
      severity: 'blocker',
      nextAction: expect.objectContaining({
        command: expect.stringContaining('comet eval run'),
      }),
    }),
  ]),
);

expect(reviewable.userSummary).toMatchObject({
  conclusion: 'needs-confirmation',
  title: 'Ready for review approval',
});

expect(publishable.userSummary).toMatchObject({
  conclusion: 'can-publish',
  title: 'Ready to publish',
});

expect(published.userSummary).toMatchObject({
  conclusion: 'published',
  title: 'Already published',
});
```

In `test/domains/bundle/bundle-command.test.ts`, extend review summary text test:

```ts
expect(text).toContain('Publish readiness:');
expect(text).toContain('User next steps:');
expect(text).not.toContain('Readiness: blocked\nBlockers:\n- [eval]');
```

- [x] **Step 2: Create `domains/bundle/readiness-user-summary.ts`**

Create:

```ts
import type { BundleReviewReadiness } from './review-summary.js';

export type BundleReadinessConclusion =
  | 'blocked'
  | 'needs-confirmation'
  | 'can-publish'
  | 'published';

export interface BundleReadinessUserSummaryItem {
  code:
    | 'candidate'
    | 'preference'
    | 'composition'
    | 'control-plane'
    | 'draft'
    | 'eval'
    | 'review'
    | 'publish'
    | 'capability'
    | 'executable'
    | 'unknown';
  severity: 'blocker' | 'warning';
  message: string;
  impact: string;
  nextAction: {
    label: string;
    command: string;
  };
  evidence: string | null;
}

export interface BundleReadinessUserSummary {
  conclusion: BundleReadinessConclusion;
  title: string;
  summary: string;
  items: BundleReadinessUserSummaryItem[];
  nextSteps: Array<{ label: string; command: string }>;
}

function codeOf(message: string): BundleReadinessUserSummaryItem['code'] {
  const match = message.match(/^\[([a-z-]+)\]/u);
  const value = match?.[1] ?? 'unknown';
  if (
    [
      'candidate',
      'preference',
      'composition',
      'control-plane',
      'draft',
      'eval',
      'review',
      'publish',
      'capability',
      'executable',
    ].includes(value)
  ) {
    return value as BundleReadinessUserSummaryItem['code'];
  }
  return 'unknown';
}

function advice(
  code: BundleReadinessUserSummaryItem['code'],
  bundleName: string,
): { impact: string; label: string; command: string } {
  switch (code) {
    case 'candidate':
      return {
        impact: 'Comet cannot safely compose the Skill until every source Skill is resolved.',
        label: 'Resolve missing or ambiguous Skill candidates',
        command: `comet bundle status ${bundleName}`,
      };
    case 'preference':
      return {
        impact: 'The saved project Skill preferences no longer match this candidate.',
        label: 'Review project Skill preferences and resume /comet-any',
        command: 'Open .comet/skill-preferences.yaml, then run /comet-any again',
      };
    case 'composition':
      return {
        impact: 'The generated Skill plan is not stable enough to publish.',
        label: 'Ask /comet-any to revise the composition proposal',
        command: 'Ask /comet-any to revise the proposal',
      };
    case 'control-plane':
      return {
        impact: 'Required scripts, rules, hooks, or checks are missing from the generated Skill.',
        label: 'Regenerate the Factory package',
        command: `comet bundle factory-generate ${bundleName}`,
      };
    case 'draft':
      return {
        impact: 'The draft cannot be tied to a stable hash.',
        label: 'Reconcile the Bundle status',
        command: `comet publish status ${bundleName}`,
      };
    case 'eval':
      return {
        impact: 'There is no passing Eval evidence for the current draft.',
        label: 'Run Eval for the generated Skill',
        command: 'comet eval run --manifest <generated-skill>/comet/eval.yaml --quick --html',
      };
    case 'review':
      return {
        impact: 'A human has not approved the current draft hash.',
        label: 'Review readiness and approve when acceptable',
        command: `comet publish review ${bundleName} --platform <reference-platform>`,
      };
    case 'publish':
      return {
        impact: 'Published Bundle metadata is incomplete.',
        label: 'Run publish again after review approval',
        command: `comet publish run ${bundleName} --platform <reference-platform>`,
      };
    case 'capability':
      return {
        impact: 'The selected platform cannot support one of the required generated capabilities.',
        label: 'Preview distribution on the target platform',
        command: `comet publish distribute ${bundleName} --platform <platform> --scope project --preview`,
      };
    case 'executable':
      return {
        impact: 'The generated Skill includes executable hooks or scripts that require explicit confirmation.',
        label: 'Review executable disclosures before distribution',
        command: `comet publish distribute ${bundleName} --platform <platform> --scope project --preview`,
      };
    default:
      return {
        impact: 'Comet needs more information before it can publish safely.',
        label: 'Inspect publish readiness',
        command: `comet publish review ${bundleName} --platform <reference-platform>`,
      };
  }
}

export function buildReadinessUserSummary(
  bundleName: string,
  readiness: BundleReviewReadiness,
): BundleReadinessUserSummary {
  const items: BundleReadinessUserSummaryItem[] = [
    ...readiness.blockers.map((message) => ({ message, severity: 'blocker' as const })),
    ...readiness.warnings.map((message) => ({ message, severity: 'warning' as const })),
  ].map((item) => {
    const code = codeOf(item.message);
    const next = advice(code, bundleName);
    return {
      code,
      severity: item.severity,
      message: item.message.replace(/^\[[^\]]+\]\s*/u, ''),
      impact: next.impact,
      nextAction: {
        label: next.label,
        command: next.command,
      },
      evidence: readiness.evidence[code] ?? null,
    };
  });

  const conclusion: BundleReadinessConclusion =
    readiness.state === 'published'
      ? 'published'
      : readiness.state === 'publishable'
        ? 'can-publish'
        : readiness.blockers.length > 0
          ? 'blocked'
          : 'needs-confirmation';
  const title =
    conclusion === 'published'
      ? 'Already published'
      : conclusion === 'can-publish'
        ? 'Ready to publish'
        : conclusion === 'needs-confirmation'
          ? 'Ready for review approval'
          : 'Cannot publish yet';
  return {
    conclusion,
    title,
    summary:
      conclusion === 'blocked'
        ? `${readiness.blockers.length} issue(s) must be fixed before publishing.`
        : conclusion === 'needs-confirmation'
          ? 'No blockers remain, but human review approval is still required.'
          : conclusion === 'can-publish'
            ? 'Eval and review evidence match the current draft.'
            : 'The published Bundle is bound to the current hash.',
    items,
    nextSteps: items.map((item) => item.nextAction),
  };
}
```

- [x] **Step 3: Add user summary to review summary result**

Modify `domains/bundle/review-summary.ts` imports:

```ts
import {
  buildReadinessUserSummary,
  type BundleReadinessUserSummary,
} from './readiness-user-summary.js';
```

Extend `BundleReviewSummary`:

```ts
  userSummary: BundleReadinessUserSummary;
```

In `buildBundleReviewSummary`, compute readiness once:

```ts
const readiness = buildReadiness(state, controlPlane, compile, currentPreferences?.hash ?? null);
return {
  ...
  readiness,
  userSummary: buildReadinessUserSummary(state.name, readiness),
};
```

- [x] **Step 4: Put user conclusion before raw readiness in text output**

Modify `formatReviewSummaryText` in `app/commands/bundle.ts`:

```ts
const userLines = [
  `Publish readiness: ${summary.userSummary.title}`,
  summary.userSummary.summary,
  ...formatOptionalSection(
    'User next steps:',
    summary.userSummary.nextSteps.map((step) => `${step.label}: ${step.command}`),
  ),
];
```

Then return user lines before raw evidence:

```ts
return [
  `Bundle: ${summary.name}`,
  `Status: ${summary.status}`,
  `Hash: ${summary.hash ?? '(invalid)'}`,
  `Platform: ${summary.compile.platform}`,
  ...userLines,
  `Quick Eval runs: ${summary.evalPlans.quick.estimatedRuns}`,
  `Full Eval runs: ${summary.evalPlans.full.estimatedRuns}`,
  ...readinessLines,
].join('\n');
```

- [x] **Step 5: Run focused tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/publish-command.test.ts
```

Expected: all pass.

- [x] **Step 6: Commit Task 5**

```bash
git add domains/bundle/readiness-user-summary.ts domains/bundle/review-summary.ts app/commands/bundle.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/publish-command.test.ts
git commit -m "feat: add user-facing readiness summaries"
```

---

### Task 6: Add Distribution Preview To Publish And Bundle Commands

**Files:**
- Modify: `domains/bundle/distribute.ts`
- Modify: `domains/bundle/types.ts`
- Modify: `app/commands/bundle.ts`
- Modify: `app/cli/index.ts`
- Test: `test/domains/bundle/bundle-distribute.test.ts`
- Test: `test/domains/bundle/publish-command.test.ts`

**Interfaces:**
- Consumes:
  - `distributeBundle(options)`
  - `compileBundleForPlatform(...)`
  - `applyPlatformInstallPlan(...)`
- Produces:
  - `distributeBundle({ preview: true })`
  - CLI `comet publish distribute <name> --preview`
  - CLI `comet bundle distribute <name> --preview`

- [x] **Step 1: Add failing distribution preview tests**

In `test/domains/bundle/bundle-distribute.test.ts`, add:

```ts
it('previews distribution without writing platform files', async () => {
  await makeReady({ name: 'preview-bundle', requiresHooks: true });

  const result = await distributeBundle({
    projectRoot,
    name: 'preview-bundle',
    platforms: ['claude'],
    scope: 'project',
    preview: true,
  });

  expect(result.preview).toBe(true);
  expect(result.platforms[0]).toMatchObject({
    platform: 'claude',
    status: 'planned',
    written: [],
    skipped: [],
    plannedFiles: expect.arrayContaining([
      expect.objectContaining({ kind: 'skill' }),
      expect.objectContaining({ kind: 'hook' }),
      expect.objectContaining({ kind: 'script' }),
    ]),
    executableDisclosures: [
      expect.objectContaining({
        id: 'protect-write',
        sideEffect: 'read',
      }),
    ],
  });
  await expect(
    fs.access(path.join(projectRoot, '.claude', 'skills', 'entry', 'SKILL.md')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});
```

In `test/domains/bundle/publish-command.test.ts`, add:

```ts
it('previews publish distribution through the facade without writing files', async () => {
  const status = await captureJson(() =>
    publishStatusCommand('publish-facade', { project: projectRoot, json: true }),
  );
  const resultFile = path.join(root, 'eval-preview.json');
  await fs.writeFile(resultFile, JSON.stringify(passingResult(String(status.currentHash))));
  await bundleEvalRecordCommand('publish-facade', {
    project: projectRoot,
    result: resultFile,
    json: true,
  });
  await publishApproveCommand('publish-facade', {
    project: projectRoot,
    reviewer: 'alice',
    json: true,
  });
  await publishRunCommand('publish-facade', {
    project: projectRoot,
    platform: 'claude',
    json: true,
  });

  const preview = await captureJson(() =>
    publishDistributeCommand('publish-facade', {
      project: projectRoot,
      platform: ['claude'],
      scope: 'project',
      preview: true,
      json: true,
    }),
  );

  expect(preview).toMatchObject({
    preview: true,
    platforms: [
      expect.objectContaining({
        status: 'planned',
        written: [],
        plannedFiles: expect.arrayContaining([expect.objectContaining({ kind: 'hook' })]),
      }),
    ],
  });

  const text = await captureText(() =>
    publishDistributeCommand('publish-facade', {
      project: projectRoot,
      platform: ['claude'],
      scope: 'project',
      preview: true,
    }),
  );
  expect(text).toContain('Distribution preview');
  expect(text).toContain('No files were written');
});
```

- [x] **Step 2: Extend distribution result status and options**

Modify `domains/bundle/distribute.ts`:

```ts
export interface BundleDistributionResult {
  bundle: string;
  hash: string;
  preview: boolean;
  platforms: Array<{
    platform: string;
    status: 'planned' | 'installed' | 'skipped' | 'failed' | 'cancelled';
    written: string[];
    skipped: string[];
    unsupported: PlatformCompileReport['unsupported'];
    executableDisclosures: PlatformCompileReport['executableDisclosures'];
    plannedFiles: Array<{ kind: PlatformInstallFile['kind']; destination: string }>;
    manualAction?: string;
    error?: string;
  }>;
}
```

Extend options:

```ts
  preview?: boolean;
```

Return `preview: options.preview === true` in every result.

- [x] **Step 3: Short-circuit writes in preview mode**

After executable disclosure check and before applying install plans, add:

```ts
if (options.preview === true) {
  for (const item of planned) {
    results.push({
      platform: item.id,
      status: 'planned',
      written: [],
      skipped: [],
      unsupported: item.report.unsupported,
      executableDisclosures: item.report.executableDisclosures,
      plannedFiles: plannedFiles(item.report),
      manualAction:
        item.report.executableDisclosures.length > 0
          ? 'Review executable disclosures and rerun without --preview plus --confirm-executables when acceptable'
          : 'Rerun without --preview to install',
    });
  }
  const order = new Map(options.platforms.map((id, index) => [id, index]));
  results.sort((left, right) => (order.get(left.platform) ?? 0) - (order.get(right.platform) ?? 0));
  return {
    bundle: options.name,
    hash: currentHash,
    preview: true,
    platforms: results,
  };
}
```

When returning from unconfirmed executable cancellation and final install path, include:

```ts
preview: false,
```

- [x] **Step 4: Add preview option to command type and CLI**

Modify `BundleCommandOptions` in `app/commands/bundle.ts`:

```ts
  preview?: boolean;
```

Pass through:

```ts
preview: options.preview,
```

Modify `app/cli/index.ts` for both `publish distribute` and `bundle distribute`:

```ts
.option('--preview', 'Preview platform writes without installing files')
```

- [x] **Step 5: Improve distribution text**

Modify `formatDistributionText`:

```ts
function formatDistributionText(result: Awaited<ReturnType<typeof distributeBundle>>): string {
  const lines = [
    result.preview ? 'Distribution preview' : 'Distribution result',
    `Bundle: ${result.bundle}`,
    `Hash: ${result.hash}`,
    ...(result.preview ? ['No files were written'] : []),
  ];
  for (const platform of result.platforms) {
    lines.push(`${platform.platform}: ${platform.status}`);
    lines.push(...platform.plannedFiles.map((file) => `  plan ${file.kind}: ${file.destination}`));
    lines.push(...platform.written.map((file) => `  wrote: ${file}`));
    lines.push(...platform.skipped.map((file) => `  skipped: ${file}`));
    for (const unsupported of platform.unsupported) {
      lines.push(
        `  unsupported ${unsupported.capability}${unsupported.required ? ' (required)' : ''}: ${unsupported.reason}`,
      );
    }
    for (const disclosure of platform.executableDisclosures) {
      lines.push(
        `  executable ${disclosure.id}: ${disclosure.command} (${disclosure.sideEffect}) -> ${disclosure.destination}`,
      );
    }
    if (platform.manualAction) lines.push(`  next: ${platform.manualAction}`);
    if (platform.error) lines.push(`  error: ${platform.error}`);
  }
  return lines.join('\n');
}
```

- [x] **Step 6: Run focused tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-distribute.test.ts test/domains/bundle/publish-command.test.ts
```

Expected: all pass.

- [x] **Step 7: Commit Task 6**

```bash
git add domains/bundle/distribute.ts domains/bundle/types.ts app/commands/bundle.ts app/cli/index.ts test/domains/bundle/bundle-distribute.test.ts test/domains/bundle/publish-command.test.ts
git commit -m "feat: add publish distribution preview"
```

---

### Task 7: Update `/comet-any` Chinese Skill And Docs

**Files:**
- Modify: `assets/skills-zh/comet-any/SKILL.md`
- Modify: `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills-zh/comet-any/reference/eval-provider.md`
- Modify: `docs/operations/SKILL-CREATION-ZH.md`
- Modify: `docs/operations/EVAL-USAGE-ZH.md`
- Test: `test/ts/comet-any-skill.test.ts`

**Interfaces:**
- Consumes:
  - `comet bundle factory-guide --json`
  - `comet bundle factory-propose --json`
  - `comet bundle factory-init --confirmed-proposal`
  - `comet publish status/review/approve/run/distribute --preview`
- Produces:
  - Chinese `/comet-any` workflow that prioritizes resume, first-use guide, proposal confirmation, Eval, readiness, and publish preview.

- [x] **Step 1: Update failing Chinese Skill assertions**

Modify `test/ts/comet-any-skill.test.ts` expected phrases. Add these Chinese phrases to the required list:

```ts
'comet bundle factory-guide',
'首次使用向导',
'恢复摘要',
'Current step',
'Suggested user command',
'展示组合方案确认页',
'confirm-generate',
'revise-proposal',
'cancel',
'--confirmed-proposal',
'Publish readiness:',
'User next steps:',
'comet publish distribute',
'--preview',
'Distribution preview',
'No files were written',
```

Update required order:

```ts
const ordered = [
  '恢复现有创作状态',
  '首次使用向导',
  '选择 create/optimize 与语言',
  '读取偏好并解析真实 Skill',
  '展示组合方案并等待确认',
  '通过 CLI 初始化草稿与 Factory metadata',
  '生成 Comet-native Skill 源码',
  '展示 Eval 工作量并询问 skip/quick/full',
  '记录 Eval 证据',
  '展示用户可读 readiness 并等待显式批准',
  '### 15. 发布',
  '### 16. 分发预览',
  '### 17. 询问是否执行分发',
];
```

- [x] **Step 2: Run Skill test and verify it fails**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: fail because Chinese Skill docs do not yet contain the new guide/preview phrases in the required order.

- [x] **Step 3: Update Chinese `/comet-any` workflow**

Modify `assets/skills-zh/comet-any/SKILL.md`:

- Add `comet bundle factory-guide --project . --json` as the first deterministic backend call.
- Say `/comet-any` must resume existing flow before creating a new one unless user explicitly says to start over.
- Say first-use guide must explain `.comet/skill-preferences.yaml` and ask before saving.
- Replace any wording that asks users to remember Bundle commands with “CLI 是内部确定性后端，用户只需要调用本 Skill”。
- Add the proposal decision choices:

```md
用户必须在组合方案确认页做三选一：

1. `confirm-generate` - 确认生成，随后调用 `comet bundle factory-init <name> --file <plan> --confirmed-proposal`
2. `revise-proposal` - 修改目标、偏好、候选或控制面策略后重新 proposal
3. `cancel` - 不写入 Bundle state
```

- Add publish/distribute sequence:

```md
发布前必须展示 `comet publish review <name> --platform <id>` 的 `Publish readiness:` 与 `User next steps:`。
分发前必须先运行 `comet publish distribute <name> --platform <id> --scope project --preview`。
只有用户确认 preview 中的 planned files、unsupported capability 和 executable disclosures 后，才可以移除 `--preview` 执行真实分发。
```

- [x] **Step 4: Update Chinese references**

Modify `assets/skills-zh/comet-any/reference/bundle-authoring.md`:

- Add a section “首次使用和恢复后端”.
- Document `factory-guide` JSON fields: `preference`, `inventory`, `resumable`, `nextQuestions`, `userMessage`.
- Document `factory-propose` user fields: `userSummary`, `actions`, `proposalHash`.
- Document `factory-init --confirmed-proposal`.
- Document `resumeSummary` on status/list.

Modify `assets/skills-zh/comet-any/reference/eval-provider.md`:

- Keep `comet eval` as the only ordinary Eval path.
- Explain readiness user summary and that readiness blockers stop publish.
- Add distribute preview as the required step before execution.

- [x] **Step 5: Update Chinese docs**

Modify `docs/operations/SKILL-CREATION-ZH.md`:

- Put the ordinary path near the top:

```md
/comet-any 创建 -> comet eval 验证 -> comet publish review/approve/run -> comet publish distribute --preview -> comet publish distribute
```

- Add first-use guide explanation.
- Add proposal confirmation example.
- Add recovery example using `Current step` and `Suggested user command`.
- Add publish/distribute preview example.

Modify `docs/operations/EVAL-USAGE-ZH.md`:

- Keep eval commands concise.
- Add “Eval 结果如何进入 publish readiness”.
- Show `comet publish review` after eval.

- [x] **Step 6: Run Chinese Skill/docs tests**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: Chinese assertions pass. English parity assertions may fail until Task 8; if they fail only on English parity, continue to Task 8 before final full test.

- [x] **Step 7: Commit Task 7 only after Chinese content is coherent**

```bash
git add assets/skills-zh/comet-any/SKILL.md assets/skills-zh/comet-any/reference/bundle-authoring.md assets/skills-zh/comet-any/reference/eval-provider.md docs/operations/SKILL-CREATION-ZH.md docs/operations/EVAL-USAGE-ZH.md test/ts/comet-any-skill.test.ts
git commit -m "docs: update chinese comet-any user workflow"
```

---

### Task 8: Sync English Skill, README, Changelog, And Final Checks

**Files:**
- Modify: `assets/skills/comet-any/SKILL.md`
- Modify: `assets/skills/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills/comet-any/reference/eval-provider.md`
- Modify: `docs/operations/SKILL-CREATION.md`
- Modify: `docs/operations/EVAL-USAGE.md`
- Modify: `README-zh.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-06-24-comet-product-ux-closure-priority-design.md`
- Modify: `docs/superpowers/plans/2026-06-24-comet-product-ux-closure-priority.md`
- Test: `test/ts/comet-any-skill.test.ts`
- Test: `test/ts/readme.test.ts`

**Interfaces:**
- Consumes: Chinese docs from Task 7.
- Produces: English parity, concise README references, changelog entry, checked-off spec/plan items after implementation.

- [x] **Step 1: Update English parity assertions**

In `test/ts/comet-any-skill.test.ts`, add parity pairs:

```ts
{ zh: '首次使用向导', en: 'first-use guide' },
{ zh: '恢复摘要', en: 'resume summary' },
{ zh: '展示组合方案确认页', en: 'show the composition confirmation page' },
{ zh: '--confirmed-proposal', en: '--confirmed-proposal' },
{ zh: 'Publish readiness:', en: 'Publish readiness:' },
{ zh: 'User next steps:', en: 'User next steps:' },
{ zh: '--preview', en: '--preview' },
{ zh: 'Distribution preview', en: 'Distribution preview' },
{ zh: 'No files were written', en: 'No files were written' },
```

- [x] **Step 2: Sync English Skill and references**

Update:

- `assets/skills/comet-any/SKILL.md`
- `assets/skills/comet-any/reference/bundle-authoring.md`
- `assets/skills/comet-any/reference/eval-provider.md`

The English workflow must match the Chinese sequence:

```md
1. Resume existing authoring state
2. Run first-use guide
3. Choose create/optimize and language
4. Read preferences and resolve real Skills
5. Show the composition confirmation page and wait for confirmation
6. Initialize Factory metadata with `--confirmed-proposal`
7. Generate the Comet-native Skill
8. Run or record Eval
9. Show user-facing readiness and wait for explicit approval
10. Publish
11. Preview distribution
12. Ask before executing distribution
```

- [x] **Step 3: Sync English docs**

Update:

- `docs/operations/SKILL-CREATION.md`
- `docs/operations/EVAL-USAGE.md`

Keep structure aligned with Chinese docs. Do not add a manual `flow.yaml` path.

- [x] **Step 4: Keep README concise**

Modify `README-zh.md` and `README.md` only where needed:

- Keep the ordinary path sentence.
- Replace any direct ordinary-user `comet bundle distribute` suggestion with `comet publish distribute --preview` followed by confirmed `comet publish distribute`.
- Keep the full `comet bundle` command list inside advanced backend details.
- Link detailed examples to docs rather than expanding README.

- [x] **Step 5: Update changelog under current version**

Modify `CHANGELOG.md` under `## What's Changed [0.4.0-beta.1] - 2026-06-15`.

Add entries:

```md
### Added

- **Comet Any user guidance**: Added a first-use Factory guide, confirmable composition proposals, resume summaries, and distribution preview so `/comet-any` can guide users through creation, Eval, publish, and platform distribution without requiring Bundle CLI knowledge.

### Changed

- **Publish readiness**: Review output now includes user-facing readiness conclusions and next steps before raw blocker evidence, making publish blockers actionable for ordinary users.

### Tests

- **Comet Any lifecycle**: Added coverage for Factory guide output, proposal confirmation metadata, resume summaries, readiness user summaries, and publish distribution preview.
```

If those headings already exist in the top version entry, append to them instead of duplicating headings.

- [x] **Step 6: Check off implemented spec items**

After Tasks 1-8 pass, update `docs/superpowers/specs/2026-06-24-comet-product-ux-closure-priority-design.md`:

- Change P0-P4 priority table status from `[ ]` to `[x]`.
- Change acceptance criteria implemented by this plan from `[ ]` to `[x]`.
- Keep any unimplemented item unchecked only if implementation intentionally deferred and explain it in one sentence.

Update this plan file task checkboxes during execution. At the end all completed implementation tasks should be `[x]`.

- [x] **Step 7: Run focused docs tests**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts test/ts/readme.test.ts
```

Expected: pass.

- [x] **Step 8: Run full required verification**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

Expected: all pass.

- [x] **Step 9: Commit Task 8**

```bash
git add assets/skills/comet-any/SKILL.md assets/skills/comet-any/reference/bundle-authoring.md assets/skills/comet-any/reference/eval-provider.md docs/operations/SKILL-CREATION.md docs/operations/EVAL-USAGE.md README-zh.md README.md CHANGELOG.md docs/superpowers/specs/2026-06-24-comet-product-ux-closure-priority-design.md docs/superpowers/plans/2026-06-24-comet-product-ux-closure-priority.md test/ts/comet-any-skill.test.ts test/ts/readme.test.ts
git commit -m "docs: document comet-any product ux closure"
```

---

## Final Verification

After all tasks are implemented and committed, run:

```bash
npx vitest run test/domains/bundle/bundle-next-action.test.ts
npx vitest run test/domains/bundle/bundle-factory-guide.test.ts
npx vitest run test/domains/bundle/bundle-command.test.ts
npx vitest run test/domains/bundle/bundle-review-summary.test.ts
npx vitest run test/domains/bundle/bundle-distribute.test.ts
npx vitest run test/domains/bundle/publish-command.test.ts
npx vitest run test/ts/comet-any-skill.test.ts
npx vitest run test/ts/readme.test.ts
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

All commands must pass before claiming the implementation is complete.

## Spec Coverage Map

| Spec item | Plan task |
| --- | --- |
| P0 first-use guide | Task 2, Task 7 |
| P1 confirmable proposal | Task 3, Task 7 |
| P2 resume experience | Task 1, Task 4, Task 7 |
| P3 readiness user language | Task 5, Task 7 |
| P4 publish/distribute assistant | Task 6, Task 8 |
| No second state machine | Tasks 1-6 use existing Bundle state |
| Complete control plane remains required | Task 3, Task 5, Task 7 |
| Chinese first, English parity | Task 7, Task 8 |
| Tests and changelog | Task 8 |

## Execution Handoff

Plan complete. Implementation should stop here until the user chooses an execution mode:

1. Subagent-Driven (recommended) - fresh worker per task, review between tasks.
2. Inline Execution - execute tasks in this session with checkpoints.

