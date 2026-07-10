# Comet Stable Composed Skill Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/comet-any` generated output into a stable composed Skill Bundle with a compiled no-cycle Plan, required scripts/rules/hooks, runtime checks, Eval validation, and fail-closed distribution behavior.

**Architecture:** Keep Bundle as the distribution source of truth and keep the existing Engine-native Skill package format as the runtime source of truth. Add a composition compiler that expands source Skill `comet/flow.yaml` files at creation time, then generate a complete control plane under the entry Skill and declare `skills/scripts/rules/hooks/references` as required Bundle capabilities. Preserve compatibility by retaining the existing flat `callChain` view and by loading old `evals.yaml` while new packages write `checks.yaml`.

**Tech Stack:** TypeScript, Node.js ESM scripts, YAML, Vitest, Commander CLI, existing Comet Bundle/Engine/Eval domains, Markdown docs and Skill assets.

---

## Global Constraints

- 回复和用户文档优先中文；英文 Skill/docs 在行为确定后保持结构对齐。
- 不新增第二套发布状态；Bundle authoring state 仍是 `/comet-any` 生成、评估、审核、发布的事实源。
- 不改 Classic Comet `.comet.yaml` 状态机。
- 不把 `hooks/*.yaml` 当作平台原生配置；它只是 Comet portable hook descriptor。
- 稳定组合 Bundle 必须声明 `skills/scripts/rules/hooks/references` 为 required capability。
- 目标平台无法表达 required hook/rule/script 时必须 fail closed。
- 新生成物写 `comet/checks.yaml`；迁移期 loader 继续读取旧 `comet/evals.yaml`。
- 组合展开在创建阶段完成；运行时只执行最终 `comet/skill.yaml`。
- 代码变更完成后更新 `CHANGELOG.md`，英文描述用户可见行为。
- 需要决定版本时先查 `master` 的 `package.json` version；如果当前分支已经高于 master，则追加当前版本 changelog。

## File Map

### Runtime checks naming

- Modify: `domains/skill/load.ts`
  - Load `comet/checks.yaml` first.
  - Fall back to `comet/evals.yaml`.
  - Throw a validation warning/error when both exist, depending on existing test style.
- Modify: `domains/factory/package.ts`
  - Generate `checks.yaml` instead of `evals.yaml`.
- Modify: `test/domains/skill/skill-load.test.ts`
  - Cover `checks.yaml`, old `evals.yaml`, and both-files behavior.
- Modify: `test/domains/factory/factory-package.test.ts`
  - Assert generated packages include `checks.yaml` and do not create new `evals.yaml`.

### Composition compiler

- Create: `domains/bundle/factory-compose.ts`
  - Parse source Skill `comet/flow.yaml`.
  - Expand `use` steps.
  - Resolve `choose` blocks.
  - Detect cycles.
  - Produce linear `callChain` plus structured `composition`.
- Modify: `domains/bundle/types.ts`
  - Add `BundleFactoryComposition`, `BundleFactoryCompositionStep`, `BundleFactoryCompositionChoice`, and `BundleFactoryCompositionIssue`.
  - Add `composition?: BundleFactoryComposition` to `BundleFactoryMetadata`.
- Modify: `domains/factory/types.ts`
  - Add compatible `FactoryComposition` types for package generation.
- Create: `test/domains/bundle/bundle-factory-compose.test.ts`
  - Cover atomic Skill, nested flow, choice resolution, unresolved choice, and cycle path.

### Factory integration

- Modify: `domains/bundle/factory.ts`
  - Compose final callChain from preferences and source flows.
  - Persist `composition`.
  - Generate full control-plane Bundle manifest.
- Modify: `domains/bundle/factory-resolve.ts`
  - Invalidate `composition` and generated package when a candidate is resolved or ignored.
  - Block ignoring a Skill if it breaks an already selected composition step.
- Modify: `test/domains/bundle/bundle-command.test.ts`
- Modify: `test/domains/bundle/bundle-cli-e2e.test.ts`
  - Cover generated Bundle required capabilities and unresolved composition blockers.

### Control plane generation

- Modify: `domains/factory/package.ts`
  - Generate `reference/composition-report.md`.
  - Generate `scripts/comet-plan.mjs`.
  - Generate `scripts/comet-check.mjs`.
  - Generate `scripts/comet-hook-guard.mjs`.
  - Generate `rules/<entry>-orchestration.md` through Bundle factory path.
  - Generate `hooks/<entry>-guard.yaml` through Bundle factory path.
- Modify: `domains/factory/types.ts`
  - Extend `GeneratedFactorySkillPackage` with control-plane paths.
- Modify: `test/domains/factory/factory-package.test.ts`
  - Assert all generated files and package validity.

### Eval, review, publish, distribute checks

- Modify: `domains/bundle/eval.ts`
  - Add static control-plane validation helpers used when recording eval evidence.
- Modify: `domains/bundle/review-summary.ts`
  - Surface control-plane readiness evidence and blockers.
- Modify: `domains/bundle/publish.ts`
  - Require control-plane validation for factory-generated stable composed bundles.
- Modify: `domains/bundle/distribute.ts`
  - Preserve required capability fail-closed behavior and improve result evidence.
- Modify: `domains/bundle/platform.ts`
  - Ensure executable disclosure names Skill-local scripts clearly.
- Modify: `test/domains/bundle/bundle-eval.test.ts`
- Modify: `test/domains/bundle/bundle-review-summary.test.ts`
- Modify: `test/domains/bundle/bundle-publish.test.ts`
- Modify: `test/domains/bundle/bundle-distribute.test.ts`
- Modify: `test/domains/bundle/bundle-platform.test.ts`

### Docs and Skills

- Modify: `assets/skills-zh/comet-any/SKILL.md`
- Modify: `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills-zh/comet-any/reference/eval-provider.md`
- Modify: `assets/skills/comet-any/SKILL.md`
- Modify: `assets/skills/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills/comet-any/reference/eval-provider.md`
- Modify: `docs/operations/SKILL-CREATION-ZH.md`
- Modify: `docs/operations/EVAL-USAGE-ZH.md`
- Modify: `README-zh.md`
- Modify: `README.md`
- Modify: `test/ts/comet-any-skill.test.ts`
- Modify: `test/ts/readme.test.ts`

### Release bookkeeping

- Modify: `CHANGELOG.md`
- Check: `package.json`
- Check: `git show master:package.json`

---

### Task 1: Rename Runtime Checks From `evals.yaml` to `checks.yaml`

**Files:**

- Modify: `domains/skill/load.ts`
- Modify: `domains/factory/package.ts`
- Modify: `test/domains/skill/skill-load.test.ts`
- Modify: `test/domains/factory/factory-package.test.ts`

**Interfaces:**

- `loadSkillPackage(root)` must prefer `comet/checks.yaml`.
- Old packages with only `comet/evals.yaml` must still load.
- New factory packages must write `comet/checks.yaml` and `comet/eval.yaml`.

- [x] **Step 1: Write failing loader tests**

Add tests to `test/domains/skill/skill-load.test.ts`:

```ts
it('loads runtime checks from comet/checks.yaml', async () => {
  const root = await writeSkillPackage({
    runtimeChecksFile: 'checks.yaml',
    runtimeChecks: `runtime:
  - id: completed
    scope: completion
    type: state_equals
    field: status
    equals: completed
`,
  });

  const pkg = await loadSkillPackage(root);

  expect(pkg.evals).toEqual([
    {
      id: 'completed',
      scope: 'completion',
      type: 'state_equals',
      field: 'status',
      equals: 'completed',
    },
  ]);
});

it('keeps loading legacy comet/evals.yaml during migration', async () => {
  const root = await writeSkillPackage({
    runtimeChecksFile: 'evals.yaml',
    runtimeChecks: `runtime:
  - id: legacy-completed
    scope: completion
    type: state_equals
    field: status
    equals: completed
`,
  });

  const pkg = await loadSkillPackage(root);

  expect(pkg.evals.map((entry) => entry.id)).toEqual(['legacy-completed']);
});

it('rejects packages that define both checks.yaml and evals.yaml', async () => {
  const root = await writeSkillPackage({
    runtimeChecksFile: 'checks.yaml',
    runtimeChecks: `runtime: []\n`,
  });
  await fs.writeFile(path.join(root, 'comet', 'evals.yaml'), 'runtime: []\n');

  await expect(loadSkillPackage(root)).rejects.toThrow(/checks.yaml.*evals.yaml/);
});
```

If `writeSkillPackage` does not currently accept `runtimeChecksFile`, add that helper parameter in the test file:

```ts
async function writeSkillPackage(options: {
  runtimeChecksFile?: 'checks.yaml' | 'evals.yaml';
  runtimeChecks?: string;
} = {}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-skill-load-'));
  const cometRoot = path.join(root, 'comet');
  await fs.mkdir(cometRoot, { recursive: true });
  await fs.writeFile(path.join(root, 'SKILL.md'), '# Demo\n');
  await fs.writeFile(path.join(cometRoot, 'skill.yaml'), baseSkillYaml(), 'utf8');
  await fs.writeFile(path.join(cometRoot, 'guardrails.yaml'), 'allowedSkills: []\n', 'utf8');
  if (options.runtimeChecksFile && options.runtimeChecks) {
    await fs.writeFile(
      path.join(cometRoot, options.runtimeChecksFile),
      options.runtimeChecks,
      'utf8',
    );
  }
  return root;
}
```

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run test/domains/skill/skill-load.test.ts test/domains/factory/factory-package.test.ts
```

Expected: fail because `loadSkillPackage` only reads `evals.yaml` and factory still writes `evals.yaml`.

- [x] **Step 3: Implement checks loader**

Modify `domains/skill/load.ts` by replacing the single `evalsPath` branch with:

```ts
async function readRuntimeChecks(cometRoot: string): Promise<{
  document: { runtime?: RuntimeEvalDefinition[] } | null;
  sourcePath: string | null;
}> {
  const checksPath = path.join(cometRoot, 'checks.yaml');
  const evalsPath = path.join(cometRoot, 'evals.yaml');
  const rawChecks = await readOptionalYaml(checksPath);
  const rawEvals = await readOptionalYaml(evalsPath);

  if (rawChecks !== null && rawEvals !== null) {
    throw new Error(`${checksPath}: checks.yaml and evals.yaml cannot both be present`);
  }
  if (rawChecks !== null) {
    return { document: narrowEvalDocument(rawChecks, checksPath), sourcePath: checksPath };
  }
  if (rawEvals !== null) {
    return { document: narrowEvalDocument(rawEvals, evalsPath), sourcePath: evalsPath };
  }
  return { document: null, sourcePath: null };
}
```

Then use it in `loadSkillPackage`:

```ts
const runtimeChecks = await readRuntimeChecks(cometRoot);

return {
  root: packageRoot,
  definition,
  guardrails: {
    ...defaultGuardrails,
    ...guardrailDocument,
  },
  evals: runtimeChecks.document?.runtime ?? [],
};
```

- [x] **Step 4: Update factory package generation**

Modify `domains/factory/package.ts`:

```ts
await fs.writeFile(path.join(cometRoot, 'checks.yaml'), stringify(runtimeEvals()), 'utf8');
await fs.writeFile(path.join(cometRoot, 'eval.yaml'), stringify(evalManifest(plan)), 'utf8');
```

Remove the new-generation write to `evals.yaml`.

- [x] **Step 5: Update factory package assertions**

In `test/domains/factory/factory-package.test.ts`, add:

```ts
await expect(fs.access(path.join(output.packageRoot, 'comet', 'checks.yaml'))).resolves.toBeUndefined();
await expect(fs.access(path.join(output.packageRoot, 'comet', 'evals.yaml'))).rejects.toMatchObject({
  code: 'ENOENT',
});
expect(output.evalManifestPath).toBe(path.join(output.packageRoot, 'comet', 'eval.yaml'));
```

- [x] **Step 6: Run GREEN**

Run:

```bash
npx vitest run test/domains/skill/skill-load.test.ts test/domains/factory/factory-package.test.ts test/domains/engine
```

Expected: pass.

- [x] **Step 7: Commit**

Run:

```bash
git add domains/skill/load.ts domains/factory/package.ts test/domains/skill/skill-load.test.ts test/domains/factory/factory-package.test.ts
git commit -m "feat: load runtime checks from checks yaml"
```

---

### Task 2: Add Factory Composition Compiler

**Files:**

- Create: `domains/bundle/factory-compose.ts`
- Modify: `domains/bundle/types.ts`
- Modify: `domains/factory/types.ts`
- Create: `test/domains/bundle/bundle-factory-compose.test.ts`

**Interfaces:**

Create these exported types in `domains/bundle/factory-compose.ts` or `domains/bundle/types.ts`:

```ts
export interface BundleFactoryCompositionStep {
  id: string;
  skill: string;
  source: 'atomic' | 'flow' | 'choice';
  fromSkill?: string;
  choiceId?: string;
  preferenceIndex: number | null;
}

export interface BundleFactoryCompositionChoice {
  id: string;
  fromSkill: string;
  options: string[];
  selectedSkill: string | null;
  reason: string;
}

export interface BundleFactoryCompositionIssue {
  type: 'unresolved-choice' | 'cycle';
  message: string;
  path?: string[];
  choiceId?: string;
}

export interface BundleFactoryComposition {
  schemaVersion: 1;
  entrySkills: string[];
  steps: BundleFactoryCompositionStep[];
  choices: BundleFactoryCompositionChoice[];
  issues: BundleFactoryCompositionIssue[];
}
```

- [x] **Step 1: Write failing composition tests**

Create `test/domains/bundle/bundle-factory-compose.test.ts` with fixtures that write source Skill roots:

```ts
async function writeSkill(root: string, name: string, flow?: string): Promise<BundleCandidateSource> {
  const skillRoot = path.join(root, 'skills', name);
  await fs.mkdir(path.join(skillRoot, 'comet'), { recursive: true });
  await fs.writeFile(path.join(skillRoot, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n`);
  if (flow) await fs.writeFile(path.join(skillRoot, 'comet', 'flow.yaml'), flow);
  return {
    name,
    preferenceIndex: null,
    platform: 'codex',
    scope: 'project',
    origin: 'project',
    factory: { query: name },
    root: skillRoot,
    description: name,
    skillMd: `# ${name}\n`,
    hash: name.padEnd(64, 'a').slice(0, 64),
  };
}
```

Test atomic fallback:

```ts
it('treats a Skill without flow.yaml as an atomic step', async () => {
  const source = await writeSkill(root, 'brainstorming');

  const result = await composeBundleFactoryPlan({
    preferredSkills: ['brainstorming'],
    resolvedSkills: [
      { query: 'brainstorming', preferenceIndex: 0, status: 'available', sources: [source] },
    ],
  });

  expect(result.callChain).toEqual([{ skill: 'brainstorming', preferenceIndex: 0 }]);
  expect(result.composition.steps).toEqual([
    expect.objectContaining({ skill: 'brainstorming', source: 'atomic' }),
  ]);
});
```

Test nested flow:

```ts
it('expands source Skill flow.yaml into a final call chain', async () => {
  const review = await writeSkill(
    root,
    'review-workflow',
    `steps:
  - use: brainstorming
  - use: writing-plans
`,
  );
  const brainstorming = await writeSkill(root, 'brainstorming');
  const writingPlans = await writeSkill(root, 'writing-plans');

  const result = await composeBundleFactoryPlan({
    preferredSkills: ['review-workflow', 'brainstorming', 'writing-plans'],
    resolvedSkills: [
      { query: 'review-workflow', preferenceIndex: 0, status: 'available', sources: [review] },
      { query: 'brainstorming', preferenceIndex: 1, status: 'available', sources: [brainstorming] },
      { query: 'writing-plans', preferenceIndex: 2, status: 'available', sources: [writingPlans] },
    ],
  });

  expect(result.callChain.map((item) => item.skill)).toEqual(['brainstorming', 'writing-plans']);
  expect(result.composition.issues).toEqual([]);
});
```

Test choice resolution:

```ts
it('selects the preferred available option for a choose block', async () => {
  const author = await writeSkill(
    root,
    'authoring',
    `steps:
  - choose:
      id: review
      options:
        - team-review
        - requesting-code-review
`,
  );
  const codeReview = await writeSkill(root, 'requesting-code-review');
  const teamReview = await writeSkill(root, 'team-review');

  const result = await composeBundleFactoryPlan({
    preferredSkills: ['authoring', 'requesting-code-review', 'team-review'],
    resolvedSkills: [
      { query: 'authoring', preferenceIndex: 0, status: 'available', sources: [author] },
      { query: 'requesting-code-review', preferenceIndex: 1, status: 'available', sources: [codeReview] },
      { query: 'team-review', preferenceIndex: 2, status: 'available', sources: [teamReview] },
    ],
  });

  expect(result.callChain.map((item) => item.skill)).toEqual(['requesting-code-review']);
  expect(result.composition.choices).toEqual([
    expect.objectContaining({
      id: 'review',
      selectedSkill: 'requesting-code-review',
      reason: expect.stringContaining('preferredSkills'),
    }),
  ]);
});
```

Test unresolved choice:

```ts
expect(result.composition.issues).toEqual([
  expect.objectContaining({ type: 'unresolved-choice', choiceId: 'review' }),
]);
```

Test cycle:

```ts
expect(result.composition.issues).toEqual([
  expect.objectContaining({ type: 'cycle', path: ['a', 'b', 'a'] }),
]);
```

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run test/domains/bundle/bundle-factory-compose.test.ts
```

Expected: fail because `factory-compose.ts` does not exist.

- [x] **Step 3: Implement flow parser and composer**

Create `domains/bundle/factory-compose.ts` with:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'yaml';
import type {
  BundleFactoryCallChainItem,
  BundleFactoryComposition,
  BundleFactoryResolvedSkill,
} from './types.js';

export interface ComposeBundleFactoryPlanInput {
  preferredSkills: string[];
  resolvedSkills: BundleFactoryResolvedSkill[];
}

export interface ComposeBundleFactoryPlanResult {
  callChain: BundleFactoryCallChainItem[];
  composition: BundleFactoryComposition;
}
```

Implement these helpers:

```ts
async function readFlowSteps(root: string): Promise<Array<{ use: string } | { choose: { id: string; options: string[] } }> | null> {
  const flowPath = path.join(root, 'comet', 'flow.yaml');
  let source: string;
  try {
    source = await fs.readFile(flowPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const document = parse(source) as unknown;
  return narrowFlowDocument(document, flowPath);
}
```

Implement `narrowFlowDocument` with strict validation:

```ts
function narrowFlowDocument(
  document: unknown,
  filePath: string,
): Array<{ use: string } | { choose: { id: string; options: string[] } }> {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`${filePath}: document must be an object`);
  }
  const steps = (document as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) throw new Error(`${filePath}: steps must be an array`);
  return steps.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`${filePath}: steps[${index}] must be an object`);
    }
    const value = step as Record<string, unknown>;
    if (typeof value.use === 'string') return { use: value.use };
    if (value.choose && typeof value.choose === 'object' && !Array.isArray(value.choose)) {
      const choose = value.choose as Record<string, unknown>;
      if (typeof choose.id !== 'string') throw new Error(`${filePath}: steps[${index}].choose.id must be a string`);
      if (!Array.isArray(choose.options) || choose.options.some((item) => typeof item !== 'string')) {
        throw new Error(`${filePath}: steps[${index}].choose.options must be a string array`);
      }
      return { choose: { id: choose.id, options: choose.options as string[] } };
    }
    throw new Error(`${filePath}: steps[${index}] must define use or choose`);
  });
}
```

Implement `composeBundleFactoryPlan(input)`:

- Build a `Map<string, BundleFactoryResolvedSkill>`.
- Pick only `status === 'available'` and exactly one selected source for expansion.
- Expand each `preferredSkills` entry in order.
- Maintain a recursion stack of skill names.
- On stack re-entry, append a cycle issue with `path`.
- For `choose`, select:
  - the available option with the lowest index in `preferredSkills`, or
  - the only available option when exactly one option is available.
- If no selected option, append `unresolved-choice`.
- Deduplicate final callChain by first occurrence.

- [x] **Step 4: Add composition types**

Modify `domains/bundle/types.ts`:

```ts
export interface BundleFactoryCompositionStep {
  id: string;
  skill: string;
  source: 'atomic' | 'flow' | 'choice';
  fromSkill?: string;
  choiceId?: string;
  preferenceIndex: number | null;
}

export interface BundleFactoryCompositionChoice {
  id: string;
  fromSkill: string;
  options: string[];
  selectedSkill: string | null;
  reason: string;
}

export interface BundleFactoryCompositionIssue {
  type: 'unresolved-choice' | 'cycle';
  message: string;
  path?: string[];
  choiceId?: string;
}

export interface BundleFactoryComposition {
  schemaVersion: 1;
  entrySkills: string[];
  steps: BundleFactoryCompositionStep[];
  choices: BundleFactoryCompositionChoice[];
  issues: BundleFactoryCompositionIssue[];
}
```

Add to `BundleFactoryMetadata`:

```ts
composition?: BundleFactoryComposition;
```

Add matching package-level types to `domains/factory/types.ts` so factory generation can receive `composition`.

- [x] **Step 5: Run GREEN**

Run:

```bash
npx vitest run test/domains/bundle/bundle-factory-compose.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

Run:

```bash
git add domains/bundle/factory-compose.ts domains/bundle/types.ts domains/factory/types.ts test/domains/bundle/bundle-factory-compose.test.ts
git commit -m "feat: compose factory skill flows"
```

---

### Task 3: Integrate Composition Into Factory State and Generation Blocking

**Files:**

- Modify: `domains/bundle/factory.ts`
- Modify: `domains/bundle/factory-resolve.ts`
- Modify: `domains/bundle/review-summary.ts`
- Modify: `test/domains/bundle/bundle-command.test.ts`
- Modify: `test/domains/bundle/bundle-cli-e2e.test.ts`
- Modify: `test/domains/bundle/bundle-review-summary.test.ts`

**Interfaces:**

- `initializeBundleFactoryState` must store `factory.composition`.
- `generateBundleDraftFromFactoryState` must refuse to generate when `composition.issues` is non-empty.
- Review summary must surface composition issues as blockers.
- Existing flat `factory.callChain` must remain populated from composed steps.

- [x] **Step 1: Write failing factory integration tests**

In `test/domains/bundle/bundle-command.test.ts`, add a fixture Skill with flow:

```ts
await fs.mkdir(path.join(skillRoot, 'comet'), { recursive: true });
await fs.writeFile(
  path.join(skillRoot, 'comet', 'flow.yaml'),
  `steps:
  - use: brainstorming
  - use: writing-plans
`,
);
```

Add a test:

```ts
it('stores composed flow metadata and uses it as the generated call chain', async () => {
  await writeFactoryPlan(projectRoot, {
    goal: 'Create a planned workflow.',
    preferredSkills: ['review-workflow', 'brainstorming', 'writing-plans'],
    callChain: ['review-workflow'],
  });

  const state = await bundleFactoryInitCommand('review-bundle', {
    project: projectRoot,
    file: factoryPlanPath,
    json: true,
  });

  expect(state.factory.callChain.map((item) => item.skill)).toEqual([
    'brainstorming',
    'writing-plans',
  ]);
  expect(state.factory.composition).toMatchObject({
    schemaVersion: 1,
    entrySkills: ['review-workflow'],
    issues: [],
  });
});
```

Add a test for unresolved choice:

```ts
await expect(
  bundleFactoryGenerateCommand('choice-bundle', { project: projectRoot, json: true }),
).rejects.toThrow(/unresolved choice/i);
```

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-review-summary.test.ts
```

Expected: fail because factory state does not compose flows or block composition issues.

- [x] **Step 3: Compose in `initializeBundleFactoryState`**

Modify `domains/bundle/factory.ts`:

```ts
import { composeBundleFactoryPlan } from './factory-compose.js';
```

After initial candidate discovery:

```ts
const composed = await composeBundleFactoryPlan({
  preferredSkills: plan.preferredSkills,
  resolvedSkills: resolvedSkills.map((candidate) => ({
    query: candidate.name,
    preferenceIndex: candidate.preferenceIndex,
    status: candidate.status,
    sources: candidate.sources,
  })),
});
```

Use composed values in metadata:

```ts
const factory: BundleFactoryMetadata = {
  goal: plan.goal,
  preferredSkills: plan.preferredSkills,
  resolvedSkills: resolvedSkills.map((candidate) => ({
    query: candidate.name,
    preferenceIndex: candidate.preferenceIndex,
    status: candidate.status,
    sources: candidate.sources,
  })),
  callChain: composed.callChain.length > 0 ? composed.callChain : plan.callChain,
  deviations: structuredClone(plan.deviations),
  composition: composed.composition,
  engineMode: plan.engineMode,
  runnerMode: plan.runnerMode,
  planPath: planArtifact.planPath,
  planHash: planArtifact.planHash,
};
```

- [x] **Step 4: Block draft generation on composition issues**

Modify `generateBundleDraftFromFactoryState`:

```ts
function assertFactoryCompositionReady(state: BundleAuthoringState): void {
  const issues = state.factory?.composition?.issues ?? [];
  if (issues.length === 0) return;
  throw new Error(
    `Bundle ${state.name} has unresolved factory composition issues: ${issues
      .map((issue) => issue.message)
      .join('; ')}`,
  );
}
```

Call it after `assertFactoryCandidatesResolved(state)`.

- [x] **Step 5: Invalidate composition on manual candidate resolution**

Modify `domains/bundle/factory-resolve.ts` to clear `composition` when a user resolves or ignores a candidate:

```ts
if (updated.factory) {
  delete updated.factory.generatedSkillPackage;
  delete updated.factory.composition;
}
```

This is intentionally conservative. The next `factory-init` pass recomputes composition from the updated candidate state.

- [x] **Step 6: Surface composition blockers in review summary**

Modify `buildReadiness` in `domains/bundle/review-summary.ts`:

```ts
const compositionIssues = state.factory?.composition?.issues ?? [];
for (const issue of compositionIssues) {
  blockers.push(`[composition] ${issue.message}`);
}
```

Add evidence:

```ts
...(state.factory?.composition ? { composition: 'factory.composition' } : {}),
```

- [x] **Step 7: Run GREEN**

Run:

```bash
npx vitest run test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts test/domains/bundle/bundle-review-summary.test.ts
```

Expected: pass.

- [x] **Step 8: Commit**

Run:

```bash
git add domains/bundle/factory.ts domains/bundle/factory-resolve.ts domains/bundle/review-summary.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts test/domains/bundle/bundle-review-summary.test.ts
git commit -m "feat: store composed factory plans"
```

---

### Task 4: Generate Required Control Plane Resources

**Files:**

- Modify: `domains/factory/types.ts`
- Modify: `domains/factory/package.ts`
- Modify: `domains/bundle/factory.ts`
- Modify: `test/domains/factory/factory-package.test.ts`
- Modify: `test/domains/bundle/bundle-command.test.ts`
- Modify: `test/domains/bundle/bundle-compiler.test.ts`

**Interfaces:**

Generated stable composed Bundle must include:

```text
skills/<entry>/SKILL.md
skills/<entry>/comet/skill.yaml
skills/<entry>/comet/guardrails.yaml
skills/<entry>/comet/checks.yaml
skills/<entry>/comet/eval.yaml
skills/<entry>/reference/resolved-skills.json
skills/<entry>/reference/composition-report.md
skills/<entry>/scripts/comet-plan.mjs
skills/<entry>/scripts/comet-check.mjs
skills/<entry>/scripts/comet-hook-guard.mjs
rules/<entry>-orchestration.md
hooks/<entry>-guard.yaml
bundle.yaml
```

- [x] **Step 1: Write failing package generation tests**

In `test/domains/factory/factory-package.test.ts`, add:

```ts
it('generates the required stable composition control plane files', async () => {
  const output = await generateFactorySkillPackage({
    root,
    name: 'stable-workflow',
    version: '1.0.0',
    description: 'Stable workflow.',
    goal: 'Create a stable workflow.',
    defaultLocale: 'zh',
    callChain: [{ skill: 'brainstorming', preferenceIndex: 0 }],
    resolvedSkills: [],
    deviations: [],
    composition: {
      schemaVersion: 1,
      entrySkills: ['stable-workflow'],
      steps: [
        {
          id: 'step-1-brainstorming',
          skill: 'brainstorming',
          source: 'atomic',
          preferenceIndex: 0,
        },
      ],
      choices: [],
      issues: [],
    },
    engineMode: 'deterministic',
  });

  await expect(fs.access(path.join(output.packageRoot, 'reference', 'composition-report.md'))).resolves.toBeUndefined();
  await expect(fs.access(path.join(output.packageRoot, 'scripts', 'comet-plan.mjs'))).resolves.toBeUndefined();
  await expect(fs.access(path.join(output.packageRoot, 'scripts', 'comet-check.mjs'))).resolves.toBeUndefined();
  await expect(fs.access(path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs'))).resolves.toBeUndefined();
  expect(output.controlPlane).toMatchObject({
    scripts: expect.arrayContaining([
      expect.stringContaining('comet-plan.mjs'),
      expect.stringContaining('comet-check.mjs'),
      expect.stringContaining('comet-hook-guard.mjs'),
    ]),
  });
});
```

In `test/domains/bundle/bundle-command.test.ts`, assert generated `bundle.yaml` contains:

```ts
expect(bundleYaml).toContain('requires: [skills, scripts, rules, hooks, references]');
expect(bundleYaml).toContain('rules:');
expect(bundleYaml).toContain('hooks:');
expect(bundleYaml).toContain('scripts:');
```

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-compiler.test.ts
```

Expected: fail because package generation does not emit scripts/rules/hooks/composition report.

- [x] **Step 3: Extend package output types**

Modify `domains/factory/types.ts`:

```ts
export interface FactoryControlPlaneOutput {
  checksPath: string | null;
  evalManifestPath: string | null;
  compositionReportPath: string;
  scripts: string[];
}

export interface GeneratedFactorySkillPackage {
  packageRoot: string;
  skillPath: string;
  enginePath: string | null;
  evalManifestPath: string | null;
  controlPlane: FactoryControlPlaneOutput;
}
```

Add `composition?: FactoryComposition` to `FactorySkillPackagePlan`.

- [x] **Step 4: Generate composition report**

In `domains/factory/package.ts`, add:

```ts
function compositionReport(plan: FactorySkillPackagePlan): string {
  const composition = plan.composition;
  if (!composition) return '# Composition Report\n\nNo composition metadata was recorded.\n';
  const steps = composition.steps
    .map((step, index) => `${index + 1}. ${step.skill} (${step.source})`)
    .join('\n');
  const choices =
    composition.choices.length === 0
      ? 'No choices were resolved.'
      : composition.choices
          .map((choice) => `- ${choice.id}: ${choice.selectedSkill ?? 'unresolved'} - ${choice.reason}`)
          .join('\n');
  const issues =
    composition.issues.length === 0
      ? 'No composition issues.'
      : composition.issues.map((issue) => `- ${issue.type}: ${issue.message}`).join('\n');
  return `# Composition Report

## Entry Skills

${composition.entrySkills.map((skill) => `- ${skill}`).join('\n')}

## Steps

${steps || 'No steps.'}

## Choices

${choices}

## Issues

${issues}
`;
}
```

Write it:

```ts
await fs.writeFile(
  path.join(referenceRoot, 'composition-report.md'),
  compositionReport(plan),
  'utf8',
);
```

- [x] **Step 5: Generate scripts**

Add script string functions in `domains/factory/package.ts`:

```ts
function planScript(): string {
  return `#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const command = process.argv[2] ?? 'status';
const statePath = path.resolve(process.cwd(), '.comet', 'runs', 'state.json');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\\n', 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  if (command === 'status') {
    try {
      console.log(JSON.stringify(await readJson(statePath), null, 2));
    } catch {
      console.log(JSON.stringify({ status: 'not-started' }, null, 2));
    }
    return;
  }
  if (command === 'init') {
    const skillYaml = await fs.readFile(path.resolve(process.cwd(), 'comet', 'skill.yaml'), 'utf8');
    await writeJson(statePath, {
      schemaVersion: 1,
      status: 'running',
      currentStep: null,
      completedSteps: [],
      planHash: sha256(skillYaml),
    });
    return;
  }
  if (command === 'complete-step') {
    const step = process.argv[3];
    if (!step) throw new Error('complete-step requires a step id');
    const state = await readJson(statePath);
    state.completedSteps = [...new Set([...(state.completedSteps ?? []), step])];
    state.currentStep = null;
    await writeJson(statePath, state);
    return;
  }
  throw new Error('Unknown command: ' + command);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
}
```

Add `checkScript()` and `hookGuardScript()` with explicit checks for required files:

```ts
const required = [
  'SKILL.md',
  'comet/skill.yaml',
  'comet/guardrails.yaml',
  'comet/checks.yaml',
  'comet/eval.yaml',
  'reference/resolved-skills.json',
  'reference/composition-report.md',
  'scripts/comet-plan.mjs',
  'scripts/comet-check.mjs',
  'scripts/comet-hook-guard.mjs',
];
```

The first implementation may check file presence and hash consistency only. It must exit non-zero when a required file is missing.

- [x] **Step 6: Generate hook descriptor and rule via Bundle factory**

Modify `bundleManifest(state, skillId)` in `domains/bundle/factory.ts`:

```ts
resources: {
  rules: [
    {
      id: `${skillId}-orchestration`,
      path: `rules/${skillId}-orchestration.md`,
      mode: 'always',
      required: true,
    },
  ],
  hooks: [
    {
      id: `${skillId}-guard`,
      path: `hooks/${skillId}-guard.yaml`,
    },
  ],
  references: [
    `skills/${skillId}/reference/resolved-skills.json`,
    `skills/${skillId}/reference/composition-report.md`,
  ],
  scripts: [
    {
      id: 'comet-plan',
      path: `skills/${skillId}/scripts/comet-plan.mjs`,
      sideEffect: 'write',
      runtime: 'node',
    },
    {
      id: 'comet-check',
      path: `skills/${skillId}/scripts/comet-check.mjs`,
      sideEffect: 'read',
      runtime: 'node',
    },
    {
      id: 'comet-hook-guard',
      path: `skills/${skillId}/scripts/comet-hook-guard.mjs`,
      sideEffect: 'read',
      runtime: 'node',
    },
  ],
  assets: [],
},
platforms: {
  requires: ['skills', 'scripts', 'rules', 'hooks', 'references'],
  optional: [],
  overrides: [],
},
```

After package generation, write:

```ts
await fs.mkdir(path.join(state.draftPath, 'rules'), { recursive: true });
await fs.writeFile(
  path.join(state.draftPath, 'rules', `${skillId}-orchestration.md`),
  orchestrationRule(skillId),
  'utf8',
);
await fs.mkdir(path.join(state.draftPath, 'hooks'), { recursive: true });
await fs.writeFile(
  path.join(state.draftPath, 'hooks', `${skillId}-guard.yaml`),
  `event: before_write
matcher: Write|Edit
script: comet-hook-guard
failure: block
requiresConfirmation: false
`,
  'utf8',
);
```

- [x] **Step 7: Run GREEN**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-compiler.test.ts
```

Expected: pass.

- [x] **Step 8: Commit**

Run:

```bash
git add domains/factory/types.ts domains/factory/package.ts domains/bundle/factory.ts test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-compiler.test.ts
git commit -m "feat: generate factory control plane resources"
```

---

### Task 5: Add Runtime Script Behavior Tests

**Files:**

- Modify: `test/domains/factory/factory-package.test.ts`
- Create: `test/domains/factory/factory-control-plane-scripts.test.ts`
- Modify: `domains/factory/package.ts`

**Interfaces:**

- `comet-check.mjs` must exit 0 when required files exist.
- `comet-check.mjs` must exit non-zero when a required file is missing.
- `comet-plan.mjs init/status/complete-step` must write and read deterministic state.
- `comet-hook-guard.mjs` must fail closed when state is absent or invalid.

- [x] **Step 1: Write failing script tests**

Create `test/domains/factory/factory-control-plane-scripts.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import { generateFactorySkillPackage } from '../../../domains/factory/package.js';

function node(script: string, args: string[], cwd: string) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

describe('generated factory control-plane scripts', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-control-plane-scripts-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('validates required generated files with comet-check.mjs', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const script = path.join(output.packageRoot, 'scripts', 'comet-check.mjs');

    const result = node(script, ['verify'], output.packageRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('control-plane-ok');
  });

  it('fails closed when a required file is missing', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    await fs.rm(path.join(output.packageRoot, 'comet', 'skill.yaml'));

    const result = node(path.join(output.packageRoot, 'scripts', 'comet-check.mjs'), ['verify'], output.packageRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('comet/skill.yaml');
  });

  it('supports init, status, and complete-step state operations', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const script = path.join(output.packageRoot, 'scripts', 'comet-plan.mjs');

    expect(node(script, ['init'], output.packageRoot).status).toBe(0);
    const status = node(script, ['status'], output.packageRoot);
    expect(status.stdout).toContain('"status": "running"');
    expect(node(script, ['complete-step', 'step-1-brainstorming'], output.packageRoot).status).toBe(0);
    const completed = node(script, ['status'], output.packageRoot);
    expect(completed.stdout).toContain('step-1-brainstorming');
  });

  it('blocks hook execution when state is missing', async () => {
    const output = await generateFactorySkillPackage(basePlan(root));
    const result = node(path.join(output.packageRoot, 'scripts', 'comet-hook-guard.mjs'), ['before_write'], output.packageRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('state');
  });
});
```

Define `basePlan(root)` in the test file with the same minimal package plan used in `factory-package.test.ts`.

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run test/domains/factory/factory-control-plane-scripts.test.ts
```

Expected: fail until generated scripts implement the commands and messages.

- [x] **Step 3: Implement script commands exactly to test contract**

Update generated scripts in `domains/factory/package.ts`:

- `comet-check.mjs verify`:
  - reads required relative paths.
  - prints `control-plane-ok` on success.
  - prints missing path to stderr and exits 1 on failure.
- `comet-plan.mjs init/status/complete-step`:
  - stores state at `.comet/runs/state.json` under the Skill package cwd.
  - includes `schemaVersion`, `status`, `planHash`, `currentStep`, `completedSteps`.
- `comet-hook-guard.mjs before_write`:
  - reads `.comet/runs/state.json`.
  - exits 1 when missing.
  - exits 1 when `status` is not `running`.

- [x] **Step 4: Run GREEN**

Run:

```bash
npx vitest run test/domains/factory/factory-control-plane-scripts.test.ts test/domains/factory/factory-package.test.ts
```

Expected: pass.

- [x] **Step 5: Commit**

Run:

```bash
git add domains/factory/package.ts test/domains/factory/factory-control-plane-scripts.test.ts test/domains/factory/factory-package.test.ts
git commit -m "feat: add generated control plane scripts"
```

---

### Task 6: Enforce Control Plane in Eval, Review, and Publish

**Files:**

- Modify: `domains/bundle/eval.ts`
- Modify: `domains/bundle/review-summary.ts`
- Modify: `domains/bundle/publish.ts`
- Modify: `test/domains/bundle/bundle-eval.test.ts`
- Modify: `test/domains/bundle/bundle-review-summary.test.ts`
- Modify: `test/domains/bundle/bundle-publish.test.ts`

**Interfaces:**

Add a shared validation helper in `domains/bundle/eval.ts`:

```ts
export interface BundleControlPlaneValidation {
  passed: boolean;
  evidence: string[];
  errors: string[];
}

export async function validateStableFactoryControlPlane(
  state: BundleAuthoringState,
): Promise<BundleControlPlaneValidation>
```

- [x] **Step 1: Write failing eval validation tests**

In `test/domains/bundle/bundle-eval.test.ts`, add:

```ts
it('rejects passing eval evidence when a factory Bundle lacks required control-plane files', async () => {
  const state = await createFactoryStateWithGeneratedPackage(projectRoot, 'stable-missing-control');
  await fs.rm(path.join(state.draftPath, 'skills', 'stable-missing-control', 'scripts', 'comet-check.mjs'));
  const resultFile = await writePassingEvalResult(projectRoot, state.currentHash!, ['stable-missing-control']);

  await expect(recordBundleEval(projectRoot, 'stable-missing-control', resultFile)).rejects.toThrow(
    /control plane/i,
  );
});
```

In `test/domains/bundle/bundle-review-summary.test.ts`, assert blockers:

```ts
expect(summary.readiness.blockers).toEqual(
  expect.arrayContaining([expect.stringContaining('[control-plane]')]),
);
```

In `test/domains/bundle/bundle-publish.test.ts`, assert publish refusal:

```ts
await expect(
  publishBundle({ projectRoot, name: 'stable-missing-control', referencePlatform: 'claude' }),
).rejects.toThrow(/control plane/i);
```

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run test/domains/bundle/bundle-eval.test.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-publish.test.ts
```

Expected: fail because control-plane validation is not enforced.

- [x] **Step 3: Implement validation helper**

In `domains/bundle/eval.ts`, add:

```ts
const REQUIRED_FACTORY_CONTROL_PLANE = [
  'SKILL.md',
  'comet/skill.yaml',
  'comet/guardrails.yaml',
  'comet/checks.yaml',
  'comet/eval.yaml',
  'reference/resolved-skills.json',
  'reference/composition-report.md',
  'scripts/comet-plan.mjs',
  'scripts/comet-check.mjs',
  'scripts/comet-hook-guard.mjs',
] as const;

export async function validateStableFactoryControlPlane(
  state: BundleAuthoringState,
): Promise<BundleControlPlaneValidation> {
  const generated = state.factory?.generatedSkillPackage;
  if (!generated) return { passed: true, evidence: ['not a generated factory package'], errors: [] };

  const errors: string[] = [];
  const evidence: string[] = [];
  for (const relative of REQUIRED_FACTORY_CONTROL_PLANE) {
    const target = path.join(generated.packageRoot, relative);
    try {
      await fs.access(target);
      evidence.push(relative);
    } catch {
      errors.push(`missing ${relative}`);
    }
  }
  return {
    passed: errors.length === 0,
    evidence,
    errors,
  };
}
```

- [x] **Step 4: Enforce validation on eval record**

In `recordBundleEval`, before `stateWithEval`:

```ts
const controlPlane = await validateStableFactoryControlPlane(state);
if (!controlPlane.passed) {
  await writeEvidence(projectRoot, name, result);
  throw new Error(`Bundle control plane is incomplete: ${controlPlane.errors.join(', ')}`);
}
```

Also require `result.bundle.safetyPassed` to remain true; do not let control-plane validation replace existing eval evidence.

- [x] **Step 5: Surface review blockers**

In `domains/bundle/review-summary.ts`, import the validation helper and make `buildReadiness` async, or compute validation before calling it. Add blocker strings:

```ts
for (const error of controlPlane.errors) {
  blockers.push(`[control-plane] ${error}`);
}
```

If converting `buildReadiness` to async creates too much churn, compute a `controlPlane` argument in `buildBundleReviewSummary` and pass it into `buildReadiness`.

- [x] **Step 6: Enforce publish validation**

In `publishBundle`, after `assertValidBundle(bundle)`:

```ts
const controlPlane = await validateStableFactoryControlPlane(state);
if (!controlPlane.passed) {
  throw new Error(`Bundle control plane is incomplete: ${controlPlane.errors.join(', ')}`);
}
```

- [x] **Step 7: Run GREEN**

Run:

```bash
npx vitest run test/domains/bundle/bundle-eval.test.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-publish.test.ts
```

Expected: pass.

- [x] **Step 8: Commit**

Run:

```bash
git add domains/bundle/eval.ts domains/bundle/review-summary.ts domains/bundle/publish.ts test/domains/bundle/bundle-eval.test.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-publish.test.ts
git commit -m "feat: enforce factory control plane validation"
```

---

### Task 7: Strengthen Distribution Disclosure and Required Capability Failure

**Files:**

- Modify: `domains/bundle/distribute.ts`
- Modify: `domains/bundle/platform.ts`
- Modify: `app/commands/publish.ts`
- Modify: `app/commands/bundle.ts`
- Modify: `test/domains/bundle/bundle-distribute.test.ts`
- Modify: `test/domains/bundle/bundle-platform.test.ts`
- Modify: `test/domains/bundle/publish-command.test.ts`

**Interfaces:**

- Distribution result must expose planned skills/rules/hooks/scripts before or during JSON output.
- Required unsupported capabilities already cancel per platform; tests must guarantee stable composed bundles cannot silently install without hooks.
- Executable disclosures must show hook id, script command, side effect, and destination.

- [x] **Step 1: Write failing distribution tests**

In `test/domains/bundle/bundle-distribute.test.ts`, add:

```ts
it('fails closed for stable composed bundles on platforms without required hooks', async () => {
  await createReadyStableComposedBundle(projectRoot, 'stable-control');

  const result = await distributeBundle({
    projectRoot,
    name: 'stable-control',
    platforms: ['kimicode'],
    scope: 'project',
    confirmedExecutables: true,
  });

  expect(result.platforms).toEqual([
    expect.objectContaining({
      platform: 'kimicode',
      status: 'cancelled',
      error: expect.stringContaining('hooks'),
      unsupported: expect.arrayContaining([
        expect.objectContaining({ capability: 'hooks', required: true }),
      ]),
    }),
  ]);
});
```

In `test/domains/bundle/publish-command.test.ts`, assert JSON output includes disclosure fields:

```ts
expect(json.platforms[0]).toMatchObject({
  platform: 'claude',
  executableDisclosures: [
    expect.objectContaining({
      id: expect.stringContaining('guard'),
      sideEffect: 'read',
    }),
  ],
});
```

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run test/domains/bundle/bundle-distribute.test.ts test/domains/bundle/bundle-platform.test.ts test/domains/bundle/publish-command.test.ts
```

Expected: any missing disclosure fields fail.

- [x] **Step 3: Extend result shape**

Modify `BundleDistributionResult.platforms[]` in `domains/bundle/distribute.ts`:

```ts
executableDisclosures: PlatformCompileReport['executableDisclosures'];
plannedFiles: Array<{
  kind: PlatformInstallFile['kind'];
  destination: string;
}>;
```

Populate both for installed, skipped, cancelled, and failed results.

- [x] **Step 4: Preserve fail-closed behavior**

Keep this existing behavior:

```ts
const blocking = blockingUnsupported(report, skipCapabilities);
if (blocking.length > 0) {
  results.push({
    platform: item.id,
    status: 'cancelled',
    written: [],
    skipped: [],
    unsupported: report.unsupported,
    executableDisclosures: report.executableDisclosures,
    plannedFiles: report.files.map((file) => ({ kind: file.kind, destination: file.destination })),
    error: `Unsupported capabilities require a decision: ${blocking
      .map((unsupported) => unsupported.capability)
      .join(', ')}`,
  });
  continue;
}
```

Do not allow `skipCapabilities` to suppress required capabilities.

- [x] **Step 5: Update command JSON formatting**

Update `app/commands/bundle.ts` and `app/commands/publish.ts` JSON paths to preserve new fields. In text mode, add a concise disclosure block:

```text
Executable hooks:
  - <id>: <command> (<sideEffect>) -> <destination>
```

- [x] **Step 6: Run GREEN**

Run:

```bash
npx vitest run test/domains/bundle/bundle-distribute.test.ts test/domains/bundle/bundle-platform.test.ts test/domains/bundle/publish-command.test.ts
```

Expected: pass.

- [x] **Step 7: Commit**

Run:

```bash
git add domains/bundle/distribute.ts domains/bundle/platform.ts app/commands/bundle.ts app/commands/publish.ts test/domains/bundle/bundle-distribute.test.ts test/domains/bundle/bundle-platform.test.ts test/domains/bundle/publish-command.test.ts
git commit -m "feat: disclose stable bundle distribution plan"
```

---

### Task 8: Update `/comet-any`, Eval Docs, README, and CLI Help

**Files:**

- Modify: `assets/skills-zh/comet-any/SKILL.md`
- Modify: `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills-zh/comet-any/reference/eval-provider.md`
- Modify: `assets/skills/comet-any/SKILL.md`
- Modify: `assets/skills/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills/comet-any/reference/eval-provider.md`
- Modify: `docs/operations/SKILL-CREATION-ZH.md`
- Modify: `docs/operations/EVAL-USAGE-ZH.md`
- Modify: `README-zh.md`
- Modify: `README.md`
- Modify: `app/cli/index.ts`
- Modify: `test/ts/comet-any-skill.test.ts`
- Modify: `test/ts/readme.test.ts`
- Modify: `test/app/cli-help.test.ts`

**Interfaces:**

- Ordinary user docs must say `/comet-any -> comet eval -> comet publish -> distribute`.
- Docs must explain generated `scripts/rules/hooks` are required control plane.
- Docs must explain `hooks/*.yaml` is a portable descriptor compiled during distribution.
- CLI help must describe `comet skill` and `comet bundle` as low-level/advanced surfaces.

- [x] **Step 1: Write failing docs tests**

Add assertions:

```ts
expect(zhSkill).toContain('稳定组合 Skill Bundle');
expect(zhSkill).toContain('scripts/rules/hooks');
expect(zhSkill).toContain('portable hook descriptor');
expect(zhSkill).toContain('comet/checks.yaml');
expect(zhSkill).toContain('comet/eval.yaml');
expect(zhSkill).toContain('comet publish distribute');
expect(zhSkill).not.toContain('evals.yaml');
```

For README tests:

```ts
expect(readmeZh).toContain('/comet-any');
expect(readmeZh).toContain('`comet eval`');
expect(readmeZh).toContain('`comet publish`');
expect(readmeZh).toContain('稳定组合 Skill');
```

For CLI help tests:

```ts
expect(bundleHelp.stdout).toContain('advanced Bundle backend');
expect(skillHelp.stdout).toContain('low-level Skill utilities');
```

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts test/ts/readme.test.ts test/app/cli-help.test.ts
```

Expected: fail until docs and help are updated.

- [x] **Step 3: Update Chinese Skill/docs first**

Update Chinese files to say:

```text
/comet-any 生成的是稳定组合 Skill Bundle，不只是 SKILL.md。
生成物包含 SKILL.md、comet/skill.yaml、comet/guardrails.yaml、comet/checks.yaml、comet/eval.yaml、scripts、rules、hooks、reference 和 bundle.yaml。
hooks/*.yaml 是 Comet portable hook descriptor，只有通过 comet publish distribute 编译到目标平台后才会生效。
```

Keep manual flow authoring out of the ordinary-user path. Mention `flow.yaml` only as advanced source Skill metadata when needed.

- [x] **Step 4: Update English Skill/docs**

Mirror the Chinese structure. Use:

```text
/comet-any generates a stable composed Skill Bundle, not just a SKILL.md file.
The Bundle includes SKILL.md, comet/skill.yaml, comet/guardrails.yaml, comet/checks.yaml, comet/eval.yaml, scripts, rules, hooks, references, and bundle.yaml.
hooks/*.yaml files are Comet portable hook descriptors and become active only after comet publish distribute compiles them into a target platform configuration.
```

- [x] **Step 5: Update README conservatively**

In `README-zh.md` and `README.md`, add only a short section or bullet that points to detailed docs:

```md
- `/comet-any` 现在按稳定组合 Skill Bundle 路径工作：创建后通过 `comet eval` 验证，再通过 `comet publish` 审核、发布和分发。完整说明见 `docs/operations/SKILL-CREATION-ZH.md`。
```

Do not turn README into a full Bundle manual.

- [x] **Step 6: Update CLI help**

Modify `app/cli/index.ts` descriptions:

```ts
.description('Low-level Skill utilities for inspecting and running Engine-native packages')
```

```ts
.description('Advanced Bundle backend for Skill publish candidates')
```

Keep `comet publish` as the user-facing publishing path.

- [x] **Step 7: Run GREEN**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts test/ts/readme.test.ts test/app/cli-help.test.ts
```

Expected: pass.

- [x] **Step 8: Commit**

Run:

```bash
git add assets/skills-zh/comet-any/SKILL.md assets/skills-zh/comet-any/reference/bundle-authoring.md assets/skills-zh/comet-any/reference/eval-provider.md assets/skills/comet-any/SKILL.md assets/skills/comet-any/reference/bundle-authoring.md assets/skills/comet-any/reference/eval-provider.md docs/operations/SKILL-CREATION-ZH.md docs/operations/EVAL-USAGE-ZH.md README-zh.md README.md app/cli/index.ts test/ts/comet-any-skill.test.ts test/ts/readme.test.ts test/app/cli-help.test.ts
git commit -m "docs: explain stable composed skill bundles"
```

---

### Task 9: Changelog, Version Check, and Final Verification

**Files:**

- Modify: `CHANGELOG.md`
- Check: `package.json`
- Check: `docs/superpowers/plans/2026-06-23-comet-stable-composed-skill-control-plane.md`

- [x] **Step 1: Check master version**

Run:

```bash
git show master:package.json
Get-Content -LiteralPath package.json
```

Expected: identify whether current `package.json.version` is already one version above master. If it is, append to the existing top changelog entry. If not, update `package.json` and create a new top changelog entry matching the version.

- [x] **Step 2: Update changelog**

Add English changelog entries under the current release:

```md
### Added

- **Stable composed Skill control plane**: Generated `/comet-any` Skill Bundles now include the required scripts, rules, hooks, runtime checks, Eval manifest, and composition evidence needed for resumable and guarded execution.
- **Factory Skill composition**: Added creation-time expansion for source Skill `comet/flow.yaml` files, including choice resolution and cycle detection before compiling the final Plan.

### Changed

- **Runtime checks naming**: New Engine-native packages use `comet/checks.yaml` for runtime checks while retaining legacy `comet/evals.yaml` loading during migration.
- **Bundle distribution disclosure**: Publish distribution output now exposes planned files and executable hook disclosures so required control-plane effects are visible before installation.

### Fixed

- **Stable Bundle readiness**: Factory-generated Bundles cannot be evaluated, reviewed, or published when required control-plane files are missing.

### Tests

- **Stable composed Skill coverage**: Added tests for checks loading, flow composition, generated control-plane files, runtime scripts, Eval readiness, publish validation, fail-closed distribution, and user-facing docs.
```

- [x] **Step 3: Run focused verification**

Run:

```bash
npx vitest run test/domains/skill/skill-load.test.ts test/domains/factory/factory-package.test.ts test/domains/factory/factory-control-plane-scripts.test.ts test/domains/bundle/bundle-factory-compose.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts test/domains/bundle/bundle-eval.test.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-publish.test.ts test/domains/bundle/bundle-distribute.test.ts test/domains/bundle/bundle-platform.test.ts test/ts/comet-any-skill.test.ts test/ts/readme.test.ts test/app/cli-help.test.ts
```

Expected: all pass.

- [x] **Step 4: Run full project checks**

Run:

```bash
pnpm build
pnpm format:check
pnpm lint
npx vitest run
git diff --check
```

Expected: all pass.

- [x] **Step 5: Commit release bookkeeping**

Run:

```bash
git add CHANGELOG.md package.json docs/superpowers/plans/2026-06-23-comet-stable-composed-skill-control-plane.md
git commit -m "chore: document stable composed skill control plane rollout"
```

If `package.json` version does not change, do not include it in `git add`.

---

## Execution Notes

- This plan intentionally keeps `flow.yaml` as source Skill metadata, not a user-facing manual authoring path.
- `callChain` remains a compatibility view until all review and factory tests can consume `composition` directly.
- Required hooks reduce platform coverage. This is expected for stable automatic execution; unsupported platforms must fail clearly.
- If a task exposes that existing helper names differ, update the plan checklist line in the implementation branch before continuing so the executed plan remains accurate.

## Self-Review

- Spec coverage: covered checks naming, required scripts/rules/hooks, portable hook descriptor, composition flow expansion, cycle detection, unresolved choice blocking, Eval validation, publish readiness, distribution disclosure, docs, CLI help, changelog, and verification.
- Placeholder scan: no open placeholder markers are intentionally present.
- Type consistency: the plan uses `BundleFactoryComposition` in Bundle metadata and `FactoryComposition` in package generation, with `callChain` retained as the compatibility projection.

