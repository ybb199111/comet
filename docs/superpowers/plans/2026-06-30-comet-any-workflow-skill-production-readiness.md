# Comet Any Workflow Skill Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/comet-any` generated workflow Skills ready for publish by enforcing node-attached Output Schemas, augmentation evidence, real Comet overlay state, repository `eval/` evidence, readiness blockers, and platform-native Claude Code agent definitions.

**Architecture:** Keep `domains/workflow-contract` as the protocol source of truth, `domains/factory` as the generated package renderer, `domains/bundle` as review/readiness/eval state, and `eval/` as the only evaluation runner. The plan extends the existing workflow-contract path in vertical slices so generated packages stop looking complete when their schema, state, authored content, eval, or platform-agent contracts are still scaffold-only.

**Tech Stack:** TypeScript, Node.js ESM, Vitest, YAML manifests, generated `.mjs` workflow scripts, repository `eval/` pytest harness, Claude Code platform target.

## Global Constraints

- Implement [docs/superpowers/specs/2026-06-30-comet-any-workflow-skill-production-readiness-design.md](../specs/2026-06-30-comet-any-workflow-skill-production-readiness-design.md).
- Do not modify Superpowers, OpenSpec, or user original Skills.
- Do not copy the original Comet Skill body into generated packages; delegate wrappers stay thin when the backing Skill is real and the added constraints are enforced.
- Keep `Bundle`, `Factory`, and `composition` as internal audit/backend terms; user-facing `/comet-any` wording centers `Customize /comet`, `Create a new Skill`, `Upgrade an existing Skill`, `Validate this Skill`, and `Install preview`.
- `comet-five-phase-overlay` must preserve true Comet `.comet.yaml` phase semantics and must not initialize `.comet/runs/<workflow>/state.json` as the overlay primary state.
- Auxiliary evidence may live under `.comet/workflow-evidence/<change>/<workflow>.json`, but current node detection and phase progression must come from `openspec/changes/<name>/.comet.yaml`.
- `comet-any` generated packages must use the repository `eval/` path; do not add a parallel benchmark system.
- Skill content changes start in `assets/skills-zh/comet-any/`; pause for user confirmation before syncing `assets/skills/comet-any/`.
- Changelog entries are English. Current package version is `0.4.0-beta.1`; implementation work should append user-visible final behavior to the existing `0.4.0-beta.1` changelog section unless `master` changes before execution.
- Tests follow repository ownership: `test/domains/workflow-contract`, `test/domains/factory`, `test/domains/bundle`, `test/app`, `test/domains/skill`, and `eval/local/tests`.

---

## Scope Check

This spec spans several modules, but the changes are not independent products. Output Schema attachment, augmentation enforcement, state adapter behavior, eval evidence, platform agents, and readiness all feed the same generated Skill publish decision. Keep this as one implementation plan with independently reviewable tasks rather than splitting into disconnected plans.

## File Structure

- Modify `domains/workflow-contract/types.ts`: add node patch `outputSchemas`, binding enforcement metadata, and validation finding codes.
- Modify `domains/workflow-contract/normalize.ts`: merge template and patch Output Schemas, normalize binding enforcement, and keep eval required schemas derived from final nodes.
- Modify `domains/workflow-contract/validation.ts`: reject unknown patch schemas and report orphan custom schemas.
- Modify `test/domains/workflow-contract/workflow-contract.test.ts`: cover attached custom schemas, orphan schemas, and enforcement defaults.
- Modify `domains/factory/package.ts`: render augmentations, enforcement labels, wrapper classification, eval manifest fields, platform agent definitions, and overlay-safe generated scripts.
- Modify `domains/factory/artifacts.ts`: allow agent artifacts when generated packages include platform-native agents.
- Modify `domains/factory/types.ts`: expose generated wrapper classification and platform agent metadata.
- Modify `test/domains/factory/factory-package.test.ts`: cover augmentation rendering, handoff output, overlay `.comet.yaml` state behavior, eval manifest expansion, wrapper classification, and generated Claude Code agents.
- Modify `domains/bundle/types.ts`: add agent resources/capability, structured eval evidence, wrapper classification, and platform-agent metadata.
- Modify `domains/bundle/load.ts`: parse optional `resources.agents`.
- Modify `domains/bundle/validate.ts`: validate agent resources and paths.
- Modify `domains/bundle/compiler.ts`: carry agents into `BundleCompilerIr`.
- Modify `domains/bundle/bundle-platform.ts`: add `agents` capability for Claude Code and agent destination planning.
- Modify `domains/bundle/platform.ts`: compile agent resources to `.claude/agents/*.md` for Claude Code and surface unsupported agent capability elsewhere.
- Modify `domains/bundle/factory.ts`: include generated platform agent resources in `bundle.yaml`.
- Modify `domains/bundle/eval.ts`: parse repository eval result evidence and keep compatibility with existing benchmark result shape during migration.
- Modify `domains/bundle/review-summary.ts`: add authored-content scans, schema/augmentation readiness, current-hash eval gating, wrapper classification, and platform-agent blockers.
- Modify `domains/bundle/readiness-user-summary.ts`: rename benchmark guidance to eval guidance while preserving actionable next steps.
- Modify `domains/bundle/next-action.ts` and `app/commands/bundle.ts`: replace benchmark-facing wording with `comet eval` review/readiness wording.
- Modify `eval/scaffold/python/manifests.py`: parse baseline treatments, quality gates, draft metadata, expected evidence, and required output schemas.
- Modify `eval/local/tests/conftest.py`: inject manifest baseline treatments and expected evidence into the dynamic treatment output.
- Modify `eval/local/tests/scaffold/test_conftest_helpers.py`: cover the expanded manifest injection.
- Modify `eval/local/tests/tasks/test_tasks.py`: allow manifest-selected baseline treatments when no `--treatment` override is provided.
- Create `eval/local/tasks/workflow-overlay-contract/`: deterministic overlay contract task.
- Modify `eval/local/tasks/index.yaml`: register the overlay contract task.
- Modify `eval/scaffold/python/validation/authoring_rubric.py`: score generated package contract checks for schemas, augmentations, agents, and pending markers.
- Modify `assets/skills-zh/comet-any/**`: update Chinese `/comet-any` guidance first.
- After user confirmation, modify `assets/skills/comet-any/**`: sync English wording and parity tests.
- Modify `test/domains/bundle/comet-any-skill.test.ts`, `test/domains/bundle/comet-any-skill-contract.test.ts`, and `test/domains/skill/skills.test.ts`: cover new guidance and removed benchmark-provider semantics.
- Modify `CHANGELOG.md` after implementation, only for final user-visible behavior.

### Task 1: Node Patch Output Schema Contract

**Files:**

- Modify: `domains/workflow-contract/types.ts`
- Modify: `domains/workflow-contract/normalize.ts`
- Modify: `domains/workflow-contract/validation.ts`
- Modify: `test/domains/workflow-contract/workflow-contract.test.ts`

**Interfaces:**

- Produces: `WorkflowNodePatch.outputSchemas?: string[]`.
- Produces validation finding code `orphan-output-schema`.
- Consumes existing `WorkflowDefinitionInput.outputSchemas` and `WorkflowNodeTemplate.outputSchemas`.

- [x] **Step 1: Write failing workflow-contract tests**

Add these tests to `test/domains/workflow-contract/workflow-contract.test.ts`:

```ts
it('attaches custom Output Schemas through Node patches', () => {
  const workflow = normalizeWorkflowDefinition({
    ...builtinCometFivePhaseWorkflow({
      name: 'comet-grill-me',
      goal: 'Use grill-me during design, planning, and review.',
    }),
    nodes: {
      design: { outputSchemas: ['comet.grill-me.v1'] },
      plan: { outputSchemas: ['comet.grill-me.v1'] },
      review: { outputSchemas: ['comet.grill-me.v1'] },
    },
    outputSchemas: [
      {
        id: 'comet.grill-me.v1',
        description: 'Grill-me critique evidence.',
        artifacts: [],
        evidence: [{ id: 'grill-summary', required: true }],
      },
    ],
  });

  expect(workflow.protocol.nodes.find((node) => node.id === 'design')?.outputSchemas).toEqual([
    'comet.design.v1',
    'comet.grill-me.v1',
  ]);
  expect(workflow.protocol.evals[0]?.requiredOutputSchemas).toEqual(
    expect.arrayContaining(['comet.grill-me.v1']),
  );
});

it('reports custom Output Schemas that are defined but not attached to any Node', () => {
  const result = validateWorkflowDefinition({
    ...builtinCometFivePhaseWorkflow({
      name: 'orphan-schema',
      goal: 'Define but do not attach a schema.',
    }),
    outputSchemas: [
      {
        id: 'orphan.schema.v1',
        description: 'Unused schema.',
        artifacts: [],
        evidence: [{ id: 'summary', required: true }],
      },
    ],
  });

  expect(result.valid).toBe(false);
  expect(result.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'orphan-output-schema',
        message: expect.stringContaining('orphan.schema.v1'),
      }),
    ]),
  );
});

it('rejects patch Output Schemas that are not defined', () => {
  const result = validateWorkflowDefinition({
    ...builtinCometFivePhaseWorkflow({
      name: 'missing-patch-schema',
      goal: 'Attach a missing schema.',
    }),
    nodes: {
      plan: { outputSchemas: ['missing.schema.v1'] },
    },
  });

  expect(result.valid).toBe(false);
  expect(result.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'missing-output-schema',
        nodeId: 'plan',
        message: expect.stringContaining('missing.schema.v1'),
      }),
    ]),
  );
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/workflow-contract/workflow-contract.test.ts -t "Output Schema"
```

Expected: failures mention `outputSchemas` not existing on `WorkflowNodePatch` or custom schema not attached.

- [x] **Step 3: Add `WorkflowNodePatch.outputSchemas` and finding code**

In `domains/workflow-contract/types.ts`, update:

```ts
export interface WorkflowNodePatch {
  implementation?: WorkflowSkillBindingInput;
  requiredSkillCalls?: WorkflowSkillBindingInput[];
  augmentations?: WorkflowSkillBindingInput[];
  outputSchemas?: string[];
  satisfies?: string[];
  disabled?: boolean;
}
```

Extend `WorkflowValidationFinding['code']`:

```ts
| 'orphan-output-schema'
```

- [x] **Step 4: Merge patch schemas into normalized nodes**

In `domains/workflow-contract/normalize.ts`, add this field inside the node object returned from the template map:

```ts
outputSchemas: dedupe([...(template.outputSchemas ?? []), ...(patch.outputSchemas ?? [])]),
```

Keep `protocol.evals[].requiredOutputSchemas` unchanged because it already derives from final `nodes.flatMap((node) => node.outputSchemas)`.

- [x] **Step 5: Validate patch schema references and orphan custom schemas**

In `domains/workflow-contract/validation.ts`, after patch binding validation, add:

```ts
for (const schema of patch.outputSchemas ?? []) {
  if (!schemaIds.has(schema)) {
    findings.push({
      code: 'missing-output-schema',
      nodeId,
      message: `${nodeId}: Output Schema ${schema} is not defined`,
    });
  }
}
```

Then after template schema validation, add:

```ts
const attachedSchemas = new Set<string>();
for (const template of byId.values()) {
  for (const schema of template.outputSchemas) attachedSchemas.add(schema);
}
for (const [nodeId, patch] of Object.entries(input.nodes ?? {})) {
  if (!byId.has(nodeId)) continue;
  for (const schema of patch.outputSchemas ?? []) attachedSchemas.add(schema);
}
const builtinSchemas =
  input.kind === 'comet-five-phase-overlay'
    ? new Set(BUILTIN_COMET_OUTPUT_SCHEMAS.map((schema) => schema.id))
    : new Set<string>();
for (const schema of input.outputSchemas ?? []) {
  if (!builtinSchemas.has(schema.id) && !attachedSchemas.has(schema.id)) {
    findings.push({
      code: 'orphan-output-schema',
      message: `Output Schema ${schema.id} is defined but not attached to any Workflow Node`,
    });
  }
}
```

- [x] **Step 6: Verify GREEN**

Run:

```bash
npx vitest run test/domains/workflow-contract/workflow-contract.test.ts
```

Expected: all workflow-contract tests pass.

- [x] **Step 7: Commit**

```bash
git add domains/workflow-contract/types.ts domains/workflow-contract/normalize.ts domains/workflow-contract/validation.ts test/domains/workflow-contract/workflow-contract.test.ts
git commit -m "feat(workflow-contract): attach patch output schemas"
```

### Task 2: Augmentation Enforcement And Rendering

**Files:**

- Modify: `domains/workflow-contract/types.ts`
- Modify: `domains/workflow-contract/normalize.ts`
- Modify: `domains/factory/package.ts`
- Modify: `test/domains/workflow-contract/workflow-contract.test.ts`
- Modify: `test/domains/factory/factory-package.test.ts`

**Interfaces:**

- Produces: `WorkflowEnforcementLevel = 'guarded' | 'handoff-guarded' | 'evidence-only' | 'advisory'`.
- Produces: `WorkflowSkillBinding.enforcement`.
- Consumes: existing `requiredSkillCalls` and `augmentations`.

- [x] **Step 1: Write failing tests for binding enforcement**

Add to `test/domains/workflow-contract/workflow-contract.test.ts`:

```ts
it('normalizes Required Skill Call and augmentation enforcement levels', () => {
  const workflow = normalizeWorkflowDefinition({
    ...builtinCometFivePhaseWorkflow({
      name: 'enforced-comet',
      goal: 'Require and augment a Comet Node.',
    }),
    nodes: {
      execute: {
        requiredSkillCalls: [{ skill: 'elementui' }],
        augmentations: [{ skill: 'grill-me', enforcement: 'guarded' }],
      },
      'subagent-execute': {
        augmentations: [{ skill: 'grill-me', scope: 'handoff' }],
      },
    },
  });

  expect(workflow.protocol.nodes.find((node) => node.id === 'execute')).toMatchObject({
    requiredSkillCalls: [expect.objectContaining({ skill: 'elementui', enforcement: 'guarded' })],
    augmentations: [expect.objectContaining({ skill: 'grill-me', enforcement: 'guarded' })],
  });
  expect(workflow.protocol.nodes.find((node) => node.id === 'subagent-execute')).toMatchObject({
    augmentations: [expect.objectContaining({ skill: 'grill-me', enforcement: 'handoff-guarded' })],
  });
});
```

Add to `test/domains/factory/factory-package.test.ts`:

```ts
it('renders augmentations into entry, node, and handoff outputs', async () => {
  const workflow = normalizeWorkflowDefinition({
    ...builtinCometFivePhaseWorkflow({
      name: 'augmented-comet',
      goal: 'Use grill-me as an enforced review augmentation.',
    }),
    nodes: {
      verify: {
        augmentations: [
          {
            skill: 'grill-me',
            scope: 'review',
            reason: 'Stress-test verification evidence.',
            enforcement: 'guarded',
          },
        ],
      },
    },
  });
  const output = await generateFactorySkillPackage(
    packagePlan({ root, name: 'augmented-comet', workflow }),
  );

  const entry = await fs.readFile(output.skillPath, 'utf8');
  const verifySkill = await fs.readFile(
    path.join(output.packageRoot, '..', 'augmented-comet-verify', 'SKILL.md'),
    'utf8',
  );
  const handoff = await execFileAsync(
    process.execPath,
    [path.join(output.packageRoot, 'scripts', 'workflow-handoff.mjs')],
    { env: { ...process.env, COMET_RUN_ROOT: root } },
  );

  expect(entry).toContain('Augmentations: `grill-me`');
  expect(entry).toContain('guarded');
  expect(verifySkill).toContain('## Augmentations');
  expect(verifySkill).toContain('augmentation:verify.grill-me');
  expect(handoff.stdout).toContain('"augmentations"');
  expect(handoff.stdout).toContain('"grill-me"');
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/workflow-contract/workflow-contract.test.ts test/domains/factory/factory-package.test.ts -t "augmentation|enforcement"
```

Expected: failures mention missing `enforcement`, missing `## Augmentations`, or handoff output lacks augmentations.

- [x] **Step 3: Add enforcement types and normalization**

In `domains/workflow-contract/types.ts`, add:

```ts
export type WorkflowEnforcementLevel = 'guarded' | 'handoff-guarded' | 'evidence-only' | 'advisory';
```

Update `WorkflowSkillBindingInput` and `WorkflowSkillBinding`:

```ts
export interface WorkflowSkillBindingInput {
  skill: string;
  operation?: WorkflowBindingOperation;
  reason?: string;
  scope?: 'main' | 'handoff' | 'review';
  enforcement?: WorkflowEnforcementLevel;
}

export interface WorkflowSkillBinding {
  skill: string;
  operation: WorkflowBindingOperation;
  reason?: string;
  scope: 'main' | 'handoff' | 'review';
  enforcement: WorkflowEnforcementLevel;
}
```

In `domains/workflow-contract/normalize.ts`, replace `normalizeBinding` with:

```ts
function defaultEnforcement(
  operation: WorkflowSkillBinding['operation'],
  scope: WorkflowSkillBinding['scope'],
): WorkflowSkillBinding['enforcement'] {
  if (scope === 'handoff') return 'handoff-guarded';
  if (operation === 'require') return 'guarded';
  if (operation === 'augment') return 'advisory';
  return 'guarded';
}

function normalizeBinding(
  input: WorkflowSkillBindingInput,
  operation: WorkflowSkillBinding['operation'],
): WorkflowSkillBinding {
  const scope = input.scope ?? 'main';
  const normalizedOperation = input.operation ?? operation;
  return {
    skill: input.skill,
    operation: normalizedOperation,
    scope,
    enforcement: input.enforcement ?? defaultEnforcement(normalizedOperation, scope),
    ...(input.reason ? { reason: input.reason } : {}),
  };
}
```

- [x] **Step 4: Render augmentations in generated markdown**

In `domains/factory/package.ts`, add:

```ts
function bindingCheckId(
  kind: 'required-skill' | 'augmentation',
  node: WorkflowNodeProtocol,
  skill: string,
): string {
  return `${kind}:${node.id}.${skill}`;
}

function augmentationMarkdown(node: WorkflowNodeProtocol): string {
  if (node.augmentations.length === 0) return '- This Node has no declared augmentations.';
  return node.augmentations
    .map((binding) => {
      const check = bindingCheckId('augmentation', node, binding.skill);
      const reason = binding.reason ? ` Reason: ${binding.reason}` : '';
      return `- \`${binding.skill}\` (${binding.scope}, ${binding.enforcement}): record completed check \`${check}\`.${reason}`;
    })
    .join('\n');
}
```

Update entry node lines to include:

```ts
const augmentations =
  node.augmentations.length === 0
    ? ''
    : ` Augmentations: ${node.augmentations.map((binding) => `\`${binding.skill}\` (${binding.enforcement})`).join(', ')}.`;
```

Update Skill Bindings lines to include:

```ts
augmentations ${node.augmentations.map((binding) => `\`${binding.skill}\` (${binding.enforcement})`).join(', ') || 'none'}.
```

In `workflowContractNodeMarkdown`, add after `## Required Skill Calls`:

```md
## Augmentations

${augmentationMarkdown(node)}
```

- [x] **Step 5: Include augmentations in handoff and guard checks**

In `workflowContractHandoffScript`, add `augmentations` to each node JSON object:

```js
augmentations: node.augmentations ?? [],
```

In `workflowContractGuardScript`, add:

```js
function missingAugmentationChecks(node, evidence) {
  const values = Array.isArray(evidence?.completedChecks) ? evidence.completedChecks : [];
  return (node.augmentations ?? [])
    .filter((binding) => binding.enforcement && binding.enforcement !== 'advisory')
    .map((binding) => 'augmentation:' + node.id + '.' + binding.skill)
    .filter((check) => !values.includes(check));
}
```

Then before applying exit:

```js
const missingAugmentations = missingAugmentationChecks(node, evidence);
if (missingAugmentations.length > 0) {
  console.error('BLOCKED: missing augmentation evidence: ' + missingAugmentations.join(', '));
  process.exit(1);
}
```

- [x] **Step 6: Verify GREEN**

Run:

```bash
npx vitest run test/domains/workflow-contract/workflow-contract.test.ts test/domains/factory/factory-package.test.ts -t "augmentation|enforcement"
```

Expected: all focused tests pass.

- [x] **Step 7: Commit**

```bash
git add domains/workflow-contract/types.ts domains/workflow-contract/normalize.ts domains/factory/package.ts test/domains/workflow-contract/workflow-contract.test.ts test/domains/factory/factory-package.test.ts
git commit -m "feat(factory): enforce workflow augmentations"
```

### Task 3: Comet Overlay State Adapter

**Files:**

- Modify: `domains/factory/package.ts`
- Modify: `test/domains/factory/factory-package.test.ts`

**Interfaces:**

- Produces generated script behavior for `comet-five-phase-overlay`.
- Consumes `openspec/changes/<name>/.comet.yaml` as primary state.
- Produces auxiliary evidence at `.comet/workflow-evidence/<change>/<workflow>.json`.

- [x] **Step 1: Write failing overlay state tests**

In `test/domains/factory/factory-package.test.ts`, extend the existing generated package test with:

```ts
await expect(execFileAsync(process.execPath, [stateScript, 'init'], { env })).rejects.toThrow(
  /use \/comet-open|active Comet change/iu,
);
await expect(
  fs.access(path.join(runRoot, '.comet', 'runs', 'team-comet', 'state.json')),
).rejects.toMatchObject({
  code: 'ENOENT',
});

const noChangeNext = await execFileAsync(process.execPath, [stateScript, 'status'], { env });
expect(noChangeNext.stdout).toContain('"status": "blocked"');
expect(noChangeNext.stdout).toContain('No active Comet change');
```

Add a separate test:

```ts
it('uses .comet.yaml for comet-five-phase-overlay routing and sidecar evidence', async () => {
  const workflow = normalizeWorkflowDefinition(
    builtinCometFivePhaseWorkflow({
      name: 'overlay-state',
      goal: 'Respect Comet state.',
    }),
  );
  const output = await generateFactorySkillPackage(
    packagePlan({ root, name: 'overlay-state', workflow }),
  );
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-overlay-state-'));
  const changeRoot = path.join(runRoot, 'openspec', 'changes', 'stateful-change');
  await fs.mkdir(changeRoot, { recursive: true });
  await fs.writeFile(
    path.join(changeRoot, '.comet.yaml'),
    'phase: build\nbuild_pause: plan-ready\nreview_mode: standard\n',
    'utf8',
  );
  const env = { ...process.env, COMET_RUN_ROOT: runRoot };
  const stateScript = path.join(output.packageRoot, 'scripts', 'workflow-state.mjs');

  const next = await execFileAsync(process.execPath, [stateScript, 'next'], { env });
  expect(next.stdout).toContain('NODE: plan');

  await execFileAsync(
    process.execPath,
    [stateScript, 'record', 'plan', '{"producer-summary":"done"}'],
    {
      env,
    },
  );
  await expect(
    fs.access(path.join(runRoot, '.comet', 'runs', 'overlay-state', 'state.json')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(
    fs.access(
      path.join(runRoot, '.comet', 'workflow-evidence', 'stateful-change', 'overlay-state.json'),
    ),
  ).resolves.toBeUndefined();

  await fs.rm(runRoot, { recursive: true, force: true });
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts -t "overlay state|workflow contract packages"
```

Expected: generated scripts still create/read `.comet/runs/<workflow>/state.json`.

- [x] **Step 3: Add generated overlay adapter helpers**

In the generated script body helpers inside `domains/factory/package.ts`, add these JavaScript functions to `workflowContractStateScript`, `workflowContractGuardScript`, and `workflowContractHookGuardScript` script templates:

```js
function isCometOverlay(protocol) {
  return protocol.kind === 'comet-five-phase-overlay';
}

function parseSimpleYaml(source) {
  const result = {};
  for (const line of String(source).split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (!match) continue;
    const raw = match[2].trim();
    result[match[1]] =
      raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : raw;
  }
  return result;
}

async function activeCometChanges() {
  const changesRoot = path.join(runRoot, 'openspec', 'changes');
  let entries = [];
  try {
    entries = await fs.readdir(changesRoot, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }
  const active = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stateFile = path.join(changesRoot, entry.name, '.comet.yaml');
    try {
      const state = parseSimpleYaml(await fs.readFile(stateFile, 'utf8'));
      if (state.archived === true || state.archived === 'true') continue;
      active.push({ name: entry.name, root: path.join(changesRoot, entry.name), stateFile, state });
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return active;
}

async function resolveCometOverlayChange() {
  const active = await activeCometChanges();
  if (active.length === 0) {
    throw new Error(
      'No active Comet change; use /comet-open or the original /comet entry to create one.',
    );
  }
  if (active.length > 1) {
    throw new Error(
      'Multiple active Comet changes: ' +
        active.map((item) => item.name).join(', ') +
        '. Ask the user which change to resume.',
    );
  }
  return active[0];
}

function overlayNodeFromState(state) {
  const phase = String(state.phase ?? '');
  if (phase === 'open') return 'open';
  if (phase === 'design') return 'design';
  if (phase === 'build') {
    if (state.build_pause === 'plan-ready' || !state.plan) return 'plan';
    return state.review_mode && state.review_mode !== 'off' ? 'review' : 'execute';
  }
  if (phase === 'verify') return state.verify_result === 'fail' ? 'verify' : 'verify';
  if (phase === 'archive') return 'archive';
  return null;
}

function evidencePathFor(protocol, change) {
  return path.join(runRoot, '.comet', 'workflow-evidence', change.name, protocol.name + '.json');
}
```

- [x] **Step 4: Route overlay status/next/record through `.comet.yaml`**

In `workflowContractStateScript`, when `isCometOverlay(protocol)` is true:

```js
if (command === 'init') {
  throw new Error(
    'Comet overlay state is created by /comet-open; use the original /comet entry to start a change.',
  );
}
if (command === 'status') {
  try {
    const change = await resolveCometOverlayChange();
    console.log(
      JSON.stringify(
        {
          status: 'running',
          change: change.name,
          statePath: path.relative(runRoot, change.stateFile).replaceAll('\\', '/'),
          currentNode: overlayNodeFromState(change.state),
          phase: change.state.phase ?? null,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.log(JSON.stringify({ status: 'blocked', reason: error.message }, null, 2));
  }
  return;
}
if (command === 'next') {
  const change = await resolveCometOverlayChange();
  const node =
    route(protocol).find((item) => item.id === overlayNodeFromState(change.state)) ?? null;
  printNext(protocol, node);
  return;
}
if (command === 'record') {
  const change = await resolveCometOverlayChange();
  const nodeId = process.argv[3];
  const node = route(protocol).find(
    (item) => item.id === nodeId || generatedNodeSkillName(protocol, item.id) === nodeId,
  );
  if (!node) throw new Error('Unknown workflow Node: ' + nodeId);
  const evidenceFile = evidencePathFor(protocol, change);
  let evidence = {};
  try {
    evidence = JSON.parse(await fs.readFile(evidenceFile, 'utf8'));
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
  }
  evidence[node.id] = {
    ...parseEvidence(process.argv.slice(4).join(' ')),
    recordedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(evidenceFile), { recursive: true });
  await fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('EVIDENCE: ' + node.id);
  printNext(
    protocol,
    route(protocol).find((item) => item.id === overlayNodeFromState(change.state)) ?? null,
  );
  return;
}
```

- [x] **Step 5: Route overlay guard evidence through the sidecar**

In `workflowContractGuardScript`, replace direct `statePath(protocol)` reads when overlay is true with:

```js
const change = isCometOverlay(protocol) ? await resolveCometOverlayChange() : null;
const evidenceState = change
  ? { evidence: await readEvidenceSidecar(protocol, change), completedNodes: [] }
  : await readJson(file);
```

Add:

```js
async function readEvidenceSidecar(protocol, change) {
  try {
    return JSON.parse(await fs.readFile(evidencePathFor(protocol, change), 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return {};
    throw error;
  }
}
```

For overlay `--apply`, do not mutate `.comet.yaml`; print:

```js
console.log('ALL CHECKS PASSED');
console.log(
  'COMET STATE: unchanged; phase progression remains owned by the original Comet runtime.',
);
```

- [x] **Step 6: Verify GREEN**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts -t "overlay state|workflow contract packages"
```

Expected: tests pass and no generated `.comet/runs/<workflow>/state.json` exists for overlay packages.

- [x] **Step 7: Commit**

```bash
git add domains/factory/package.ts test/domains/factory/factory-package.test.ts
git commit -m "feat(factory): use comet overlay state adapter"
```

### Task 4: Authored Content Readiness And Wrapper Classification

**Files:**

- Modify: `domains/factory/package.ts`
- Modify: `domains/factory/types.ts`
- Modify: `domains/bundle/types.ts`
- Modify: `domains/bundle/review-summary.ts`
- Modify: `test/domains/factory/factory-package.test.ts`
- Modify: `test/domains/bundle/bundle-review-summary.test.ts`

**Interfaces:**

- Produces: `BundleGeneratedSkillPackage.wrapperClassification`.
- Produces readiness blockers for `AUTHORING PENDING` and entry Decision Core placeholders.
- Produces wrapper labels `delegate-complete`, `delegate-advisory`, `scaffold-blocked`, `kernel-authored`.

- [x] **Step 1: Write failing tests**

Add to `test/domains/factory/factory-package.test.ts`:

```ts
it('classifies scaffolded overlay packages when the Decision Core is not authored', async () => {
  const workflow = normalizeWorkflowDefinition(
    builtinCometFivePhaseWorkflow({
      name: 'unwritten-entry',
      goal: 'Generate without authored entry content.',
    }),
  );
  const output = await generateFactorySkillPackage(
    packagePlan({ root, name: 'unwritten-entry', workflow }),
  );

  expect(output.wrapperClassification).toBe('scaffold-blocked');
  const report = await fs.readFile(
    path.join(output.packageRoot, 'reference', 'composition-report.md'),
    'utf8',
  );
  expect(report).toContain('Wrapper classification: scaffold-blocked');
});
```

Add to `test/domains/bundle/bundle-review-summary.test.ts`:

```ts
it('blocks readiness when generated packages still contain authoring pending markers', async () => {
  const state = await createFactoryStateWithGeneratedPackage(projectRoot, 'pending-authoring');

  const summary = await buildBundleReviewSummary({
    projectRoot,
    name: state.name,
    platform: 'claude',
  });

  expect(summary.readiness.blockers).toEqual(
    expect.arrayContaining([
      '[authoring] Entry Decision Core is not authored',
      '[authoring] Generated package still contains AUTHORING PENDING markers',
    ]),
  );
  expect(summary.readiness.evidence.wrapperClassification).toBe('scaffold-blocked');
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-review-summary.test.ts -t "authoring pending|classification|scaffold"
```

Expected: missing `wrapperClassification` and missing blockers.

- [x] **Step 3: Add wrapper classification to generated package metadata**

In `domains/factory/types.ts` and `domains/bundle/types.ts`, add:

```ts
export type GeneratedWrapperClassification =
  | 'delegate-complete'
  | 'delegate-advisory'
  | 'scaffold-blocked'
  | 'kernel-authored';
```

Add `wrapperClassification?: GeneratedWrapperClassification` to generated package interfaces.

In `domains/factory/package.ts`, add:

```ts
function wrapperClassification(plan: FactorySkillPackagePlan): GeneratedWrapperClassification {
  const protocol = plan.workflowProtocol;
  if (!protocol) return 'scaffold-blocked';
  const hasPendingEntry = plan.contentDrafts?.['SKILL.md'] === undefined;
  const hasUnauthoredSubstance = computeUnauthoredSubstanceNodes(plan).length > 0;
  const hasAdvisoryAugmentation = protocol.nodes.some((node) =>
    node.augmentations.some((binding) => binding.enforcement === 'advisory'),
  );
  if (hasPendingEntry || hasUnauthoredSubstance) return 'scaffold-blocked';
  if (protocol.kind === 'workflow-kernel') return 'kernel-authored';
  return hasAdvisoryAugmentation ? 'delegate-advisory' : 'delegate-complete';
}
```

Thread the value into `GeneratedFactorySkillPackage` and `BundleGeneratedSkillPackage`.

- [x] **Step 4: Render classification in composition report**

In `workflowContractCompositionReport`, add:

```md
- Wrapper classification: ${wrapperClassification(plan)}
```

- [x] **Step 5: Scan generated packages during readiness**

In `domains/bundle/review-summary.ts`, add a helper:

```ts
async function generatedPackageContains(root: string, needle: string): Promise<boolean> {
  async function walk(directory: string): Promise<boolean> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (await walk(target)) return true;
      } else if (entry.isFile() && (await fs.readFile(target, 'utf8')).includes(needle)) {
        return true;
      }
    }
    return false;
  }
  return walk(root);
}
```

Convert `buildReadiness` to `async`, await this scan when `generatedPackage` exists, and push:

```ts
if (generatedPackage.wrapperClassification === 'scaffold-blocked') {
  blockers.push('[authoring] Entry Decision Core is not authored');
}
if (await generatedPackageContains(generatedPackage.packageRoot, '<!-- AUTHORING PENDING -->')) {
  blockers.push('[authoring] Generated package still contains AUTHORING PENDING markers');
}
```

Add evidence:

```ts
wrapperClassification: generatedPackage.wrapperClassification ?? 'unknown',
```

- [x] **Step 6: Verify GREEN**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-review-summary.test.ts -t "authoring pending|classification|scaffold"
```

Expected: focused tests pass.

- [x] **Step 7: Commit**

```bash
git add domains/factory/package.ts domains/factory/types.ts domains/bundle/types.ts domains/bundle/review-summary.ts test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-review-summary.test.ts
git commit -m "feat(bundle): block scaffolded generated skills"
```

### Task 5: Repository Eval Manifest And Structured Evidence

**Files:**

- Modify: `domains/factory/package.ts`
- Modify: `eval/scaffold/python/manifests.py`
- Modify: `eval/local/tests/conftest.py`
- Modify: `eval/local/tests/scaffold/test_conftest_helpers.py`
- Modify: `eval/local/tests/tasks/test_tasks.py`
- Create: `eval/local/tasks/workflow-overlay-contract/task.toml`
- Create: `eval/local/tasks/workflow-overlay-contract/instruction.md`
- Create: `eval/local/tasks/workflow-overlay-contract/environment/Dockerfile`
- Create: `eval/local/tasks/workflow-overlay-contract/validation/test_workflow_overlay_contract.py`
- Modify: `eval/local/tasks/index.yaml`
- Modify: `eval/scaffold/python/validation/authoring_rubric.py`
- Modify: `test/domains/factory/factory-package.test.ts`

**Interfaces:**

- Produces manifest fields `evaluation.baselineTreatments`, `evaluation.qualityGates`, `evaluation.requiredOutputSchemas`, `evaluation.expectedEvidence`, and `metadata.draftHash`.
- Produces eval task `workflow-overlay-contract`.
- Consumes generated `comet/eval.yaml` through existing `--eval-manifest`.

- [x] **Step 1: Write failing manifest parser tests**

In `eval/local/tests/scaffold/test_conftest_helpers.py`, extend `test_dynamic_treatment_config_from_eval_manifest` manifest fixture with:

```yaml
metadata:
  name: manifest-skill
  draftHash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
evaluation:
  recommendedTasks:
    - generic-skill-smoke
    - workflow-route-conformance
    - workflow-overlay-contract
  baselineTreatments:
    - CONTROL
    - COMET_FULL
  qualityGates:
    minWeightedScore: 0.8
    minPassAt1: 0.6
    maxInstabilityGap: 0.4
  requiredOutputSchemas:
    - comet.grill-me.v1
  expectedEvidence:
    - node: design
      check: augmentation:design.grill-me
```

Then assert:

```py
assert cfg.skills[0]["baseline_treatments"] == ["CONTROL", "COMET_FULL"]
assert cfg.skills[0]["quality_gates"]["minWeightedScore"] == 0.8
assert cfg.skills[0]["required_output_schemas"] == ["comet.grill-me.v1"]
assert cfg.skills[0]["expected_evidence"][0]["check"] == "augmentation:design.grill-me"
```

- [x] **Step 2: Write failing factory manifest test**

In `test/domains/factory/factory-package.test.ts`, add:

```ts
it('writes overlay eval manifests with task suite, baselines, gates, and evidence requirements', async () => {
  const workflow = normalizeWorkflowDefinition({
    ...builtinCometFivePhaseWorkflow({
      name: 'eval-ready-overlay',
      goal: 'Evaluate generated overlay skills.',
    }),
    nodes: {
      design: {
        augmentations: [{ skill: 'grill-me', enforcement: 'guarded' }],
        outputSchemas: ['comet.grill-me.v1'],
      },
    },
    outputSchemas: [
      {
        id: 'comet.grill-me.v1',
        description: 'Grill evidence.',
        artifacts: [],
        evidence: [{ id: 'grill-summary', required: true }],
      },
    ],
  });
  const output = await generateFactorySkillPackage(
    packagePlan({ root, name: 'eval-ready-overlay', workflow }),
  );
  const manifest = parse(
    await fs.readFile(path.join(output.packageRoot, 'comet', 'eval.yaml'), 'utf8'),
  ) as { evaluation?: Record<string, unknown> };

  expect(manifest.evaluation?.recommendedTasks).toEqual(
    expect.arrayContaining([
      'workflow-overlay-contract',
      'comet-full-workflow',
      'comet-fix-median',
    ]),
  );
  expect(manifest.evaluation?.baselineTreatments).toEqual(['CONTROL', 'COMET_FULL']);
  expect(manifest.evaluation?.qualityGates).toMatchObject({
    minWeightedScore: 0.8,
    minPassAt1: 0.6,
    maxInstabilityGap: 0.4,
  });
  expect(manifest.evaluation?.requiredOutputSchemas).toEqual(
    expect.arrayContaining(['comet.grill-me.v1']),
  );
});
```

- [x] **Step 3: Verify RED**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts -t "eval manifests"
cd eval && uv run pytest local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: parser and manifest field assertions fail.

- [x] **Step 4: Extend `SkillEvalManifest`**

In `eval/scaffold/python/manifests.py`, add dataclass fields:

```py
draft_hash: str | None = None
baseline_treatments: list[str] = field(default_factory=list)
quality_gates: dict[str, float] = field(default_factory=dict)
required_output_schemas: list[str] = field(default_factory=list)
expected_evidence: list[dict] = field(default_factory=list)
```

In `load_eval_manifest`, return:

```py
draft_hash=metadata.get("draftHash") or metadata.get("draft_hash"),
baseline_treatments=list(evaluation.get("baselineTreatments") or []),
quality_gates=dict(evaluation.get("qualityGates") or {}),
required_output_schemas=list(evaluation.get("requiredOutputSchemas") or []),
expected_evidence=list(evaluation.get("expectedEvidence") or []),
```

- [x] **Step 5: Inject manifest details into dynamic treatment**

In `eval/local/tests/conftest.py`, add keys to the manifest skill config:

```py
"baseline_treatments": manifest.baseline_treatments,
"quality_gates": manifest.quality_gates,
"required_output_schemas": manifest.required_output_schemas,
"expected_evidence": manifest.expected_evidence,
"draft_hash": manifest.draft_hash,
```

In `eval/local/tests/tasks/test_tasks.py`, when `--eval-manifest` exists and no explicit `--treatment` was passed, include manifest baseline treatments before `DYNAMIC_SKILL`:

```py
if dynamic and manifest_tasks and not treatment_filter:
    treatment_list = [
        *[name for name in dynamic.skills[0].get("baseline_treatments", []) if name in all_treatments],
        dynamic.name,
    ]
```

- [x] **Step 6: Extend generated eval manifests**

In `workflowContractEvalManifest`, compute:

```ts
const requiredOutputSchemas = protocol.evals[0]?.requiredOutputSchemas ?? [];
const overlayTasks =
  protocol.kind === 'comet-five-phase-overlay'
    ? [
        'authoring-skill-smoke',
        'workflow-route-conformance',
        'workflow-overlay-contract',
        'comet-full-workflow',
        'comet-fix-median',
        'comet-refactor-counter',
        'comet-api-cache-ttl',
      ]
    : ['generic-skill-smoke', 'authoring-skill-smoke', 'workflow-route-conformance'];
```

Add to `evaluation`:

```ts
recommendedTasks: overlayTasks,
baselineTreatments: protocol.kind === 'comet-five-phase-overlay' ? ['CONTROL', 'COMET_FULL'] : ['CONTROL'],
qualityGates: {
  minWeightedScore: 0.8,
  minPassAt1: 0.6,
  maxInstabilityGap: 0.4,
},
requiredOutputSchemas,
expectedEvidence: protocol.nodes.flatMap((node) => [
  ...node.requiredSkillCalls.map((binding) => ({
    node: node.id,
    check: `required-skill:${node.id}.${binding.skill}`,
    enforcement: binding.enforcement,
  })),
  ...node.augmentations.map((binding) => ({
    node: node.id,
    check: `augmentation:${node.id}.${binding.skill}`,
    enforcement: binding.enforcement,
  })),
]),
```

- [x] **Step 7: Add overlay contract eval task**

Create `eval/local/tasks/workflow-overlay-contract/task.toml`:

```toml
name = "workflow-overlay-contract"
description = "Verify generated comet-five-phase-overlay packages preserve Comet state and evidence contracts."
tags = ["authoring", "workflow", "comet-any", "overlay"]
profile = "authoring-skill"
test_scripts = ["test_workflow_overlay_contract.py"]
default_treatments = ["DYNAMIC_SKILL"]
```

Create `eval/local/tasks/workflow-overlay-contract/instruction.md`:

```md
Run the provided generated Skill package as an installed Skill. Inspect its workflow protocol, state script, guard script, handoff script, and eval manifest. Do not create a second workflow state for Comet overlays.
```

Create `eval/local/tasks/workflow-overlay-contract/environment/Dockerfile`:

```dockerfile
FROM python:3.12-slim
WORKDIR /workspace
```

Create `eval/local/tasks/workflow-overlay-contract/validation/test_workflow_overlay_contract.py`:

```py
from pathlib import Path


def test_overlay_package_contract(skill_package_path: str, required_output_schemas: list[str], expected_evidence: list[dict]):
    package = Path(skill_package_path)
    protocol = package / "reference" / "workflow-protocol.json"
    state_script = package / "scripts" / "workflow-state.mjs"
    guard_script = package / "scripts" / "workflow-guard.mjs"
    handoff_script = package / "scripts" / "workflow-handoff.mjs"
    eval_manifest = package / "comet" / "eval.yaml"

    assert protocol.exists(), "workflow-protocol.json missing"
    assert state_script.exists(), "workflow-state.mjs missing"
    assert guard_script.exists(), "workflow-guard.mjs missing"
    assert handoff_script.exists(), "workflow-handoff.mjs missing"
    assert eval_manifest.exists(), "comet/eval.yaml missing"

    state_source = state_script.read_text(encoding="utf-8")
    guard_source = guard_script.read_text(encoding="utf-8")
    handoff_source = handoff_script.read_text(encoding="utf-8")

    assert "activeCometChanges" in state_source
    assert ".comet/runs/" not in state_source or "protocol.kind === 'comet-five-phase-overlay'" in state_source
    assert "missing augmentation evidence" in guard_source
    assert "augmentations" in handoff_source
    assert required_output_schemas, "manifest did not expose required output schemas"
    assert expected_evidence, "manifest did not expose required evidence checks"
```

Register in `eval/local/tasks/index.yaml`:

```yaml
- workflow-overlay-contract
```

- [x] **Step 8: Verify GREEN**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts -t "eval manifests"
cd eval && uv run pytest local/tests/scaffold/test_conftest_helpers.py -q
cd eval && uv run pytest local/tests/tasks/test_tasks.py --task=workflow-overlay-contract --eval-manifest ../<generated-package>/comet/eval.yaml --collect-only -q
```

Expected: unit tests pass; collect-only can discover `DYNAMIC_SKILL` and baseline treatments.

- [x] **Step 9: Commit**

```bash
git add domains/factory/package.ts eval/scaffold/python/manifests.py eval/local/tests/conftest.py eval/local/tests/scaffold/test_conftest_helpers.py eval/local/tests/tasks/test_tasks.py eval/local/tasks/workflow-overlay-contract eval/local/tasks/index.yaml eval/scaffold/python/validation/authoring_rubric.py test/domains/factory/factory-package.test.ts
git commit -m "feat(eval): evaluate generated workflow contracts"
```

### Task 6: Readiness Consumes Eval Evidence

**Files:**

- Modify: `domains/bundle/eval.ts`
- Modify: `domains/bundle/review-summary.ts`
- Modify: `domains/bundle/readiness-user-summary.ts`
- Modify: `domains/bundle/next-action.ts`
- Modify: `app/commands/bundle.ts`
- Modify: `test/domains/bundle/bundle-eval.test.ts`
- Modify: `test/domains/bundle/bundle-review-summary.test.ts`
- Modify: `test/domains/bundle/bundle-command.test.ts`
- Modify: `test/domains/bundle/bundle-cli-e2e.test.ts`

**Interfaces:**

- Produces structured eval evidence parser for current draft hash.
- Maintains compatibility with existing `native-skill-creator` benchmark result JSON during migration.
- Produces readiness blocker code `[eval]`.

- [x] **Step 1: Write failing eval evidence tests**

In `test/domains/bundle/bundle-eval.test.ts`, add:

```ts
it('records repository eval evidence for the current draft hash', async () => {
  const state = await createBundleDraft({
    projectRoot,
    name: 'repo-eval',
    candidates: [],
    creator: 'native',
    defaultLocale: 'en',
    locales: ['en'],
    engineEnabled: true,
  });
  await writeMinimalBundle(state.draftPath, 'repo-eval');
  const current = await reconcileBundleAuthoringState(projectRoot, 'repo-eval');
  const resultFile = path.join(projectRoot, 'repo-eval-result.json');
  await fs.writeFile(
    resultFile,
    JSON.stringify(
      {
        schemaVersion: 2,
        provider: 'comet-eval',
        level: 'full',
        draftHash: current.currentHash,
        evalManifestHash: 'b'.repeat(64),
        tasks: ['workflow-overlay-contract', 'comet-full-workflow'],
        treatments: ['CONTROL', 'COMET_FULL', 'DYNAMIC_SKILL'],
        passAtK: { DYNAMIC_SKILL: 0.7 },
        weightedScore: { DYNAMIC_SKILL: 0.82 },
        instabilityGap: { DYNAMIC_SKILL: 0.2 },
        failures: [],
        reports: ['logs/experiments/workflow-overlay-contract/summary.md'],
        passed: true,
        summary: 'Repository eval passed.',
      },
      null,
      2,
    ),
    'utf8',
  );

  const updated = await recordBundleEval(projectRoot, 'repo-eval', resultFile);

  expect(updated.eval).toMatchObject({
    level: 'full',
    hash: current.currentHash,
    passed: true,
  });
});
```

In `test/domains/bundle/bundle-review-summary.test.ts`, update the missing eval expectation:

```ts
expect(summary.readiness.blockers).toContain(
  '[eval] Eval evidence for the current draft hash is missing',
);
```

Add:

```ts
it('blocks readiness when repository eval evidence is below quality gates', async () => {
  const state = await createFactoryStateWithGeneratedPackage(projectRoot, 'eval-gated');
  const resultPath = path.join(projectRoot, 'failed-eval.json');
  await fs.writeFile(
    resultPath,
    JSON.stringify({
      schemaVersion: 2,
      provider: 'comet-eval',
      level: 'full',
      draftHash: state.currentHash,
      evalManifestHash: 'c'.repeat(64),
      tasks: ['workflow-overlay-contract'],
      treatments: ['DYNAMIC_SKILL'],
      passAtK: { DYNAMIC_SKILL: 0.3 },
      weightedScore: { DYNAMIC_SKILL: 0.5 },
      instabilityGap: { DYNAMIC_SKILL: 0.5 },
      failures: ['DYNAMIC_SKILL below minWeightedScore 0.8'],
      reports: ['logs/experiments/workflow-overlay-contract/summary.md'],
      passed: false,
      summary: 'Repository eval failed.',
    }),
    'utf8',
  );
  await writeBundleAuthoringState(projectRoot, {
    ...state,
    eval: { level: 'full', hash: state.currentHash!, resultPath, passed: false },
  });

  const summary = await buildBundleReviewSummary({
    projectRoot,
    name: state.name,
    platform: 'claude',
  });

  expect(summary.readiness.blockers).toEqual(
    expect.arrayContaining([expect.stringContaining('[eval]')]),
  );
  expect(summary.readiness.evidence.evalResult).toBe(resultPath);
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/bundle/bundle-eval.test.ts test/domains/bundle/bundle-review-summary.test.ts -t "eval"
```

Expected: parser rejects provider `comet-eval` or readiness still emits `[benchmark]`.

- [x] **Step 3: Add structured eval result support**

In `domains/bundle/eval.ts`, add:

```ts
export interface RepositoryEvalResult {
  schemaVersion: 2;
  provider: 'comet-eval';
  level: 'quick' | 'full';
  draftHash: string;
  evalManifestHash: string;
  tasks: string[];
  treatments: string[];
  passAtK: Record<string, number>;
  weightedScore: Record<string, number>;
  instabilityGap: Record<string, number>;
  failures: string[];
  reports: string[];
  passed: boolean;
  summary: string;
}
```

Update `parseEvalResult` to accept either existing `BundleEvalResult` or `RepositoryEvalResult`. For the new result, enforce SHA-256 hashes and rate ranges for `passAtK`, `weightedScore`, and `instabilityGap`.

Update `stateWithEval`:

```ts
const hash = 'draftHash' in result ? result.draftHash : result.bundleHash;
const gatesPassed =
  'draftHash' in result
    ? result.passed && result.failures.length === 0
    : result.passed &&
      result.entries.every((entry) => entry.passed) &&
      result.bundle.compilePassed &&
      result.bundle.safetyPassed;
```

- [x] **Step 4: Rename readiness blocker from benchmark to eval**

In `domains/bundle/review-summary.ts`, replace:

```ts
blockers.push('[benchmark] Benchmark evidence for the current draft hash is missing');
```

with:

```ts
blockers.push('[eval] Eval evidence for the current draft hash is missing');
```

If `state.eval?.resultPath` exists and the parsed repository result is failed, add:

```ts
blockers.push(`[eval] Eval evidence is below publish quality gates: ${result.summary}`);
```

- [x] **Step 5: Update user-facing next-action wording**

In `domains/bundle/readiness-user-summary.ts`, replace `benchmark` code with `eval` in the code union and `codeOf` allowlist.

Use this advice:

```ts
case 'eval':
  return {
    impact: 'There is no passing eval evidence for the current generated Skill draft.',
    label: 'Run repository eval for the generated Skill',
    command: 'comet eval <generated-skill>/comet/eval.yaml --quick --html',
  };
```

Update `domains/bundle/next-action.ts` and `app/commands/bundle.ts` text from benchmark to eval while keeping command suggestions on `comet eval`.

- [x] **Step 6: Update tests from benchmark wording to eval wording**

Update affected assertions in:

- `test/domains/bundle/bundle-command.test.ts`
- `test/domains/bundle/bundle-cli-e2e.test.ts`
- `test/domains/bundle/bundle-review-summary.test.ts`
- `test/domains/bundle/bundle-eval.test.ts`

Use exact text:

```text
[eval] Eval evidence for the current draft hash is missing
```

And next action:

```text
Run repository eval for the generated Skill
```

- [x] **Step 7: Verify GREEN**

Run:

```bash
npx vitest run test/domains/bundle/bundle-eval.test.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts
```

Expected: all bundle eval/readiness/command tests pass.

- [x] **Step 8: Commit**

```bash
git add domains/bundle/eval.ts domains/bundle/review-summary.ts domains/bundle/readiness-user-summary.ts domains/bundle/next-action.ts app/commands/bundle.ts test/domains/bundle/bundle-eval.test.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts
git commit -m "feat(bundle): gate readiness on eval evidence"
```

### Task 7: Claude Code Platform Agent Definitions

**Files:**

- Modify: `domains/bundle/types.ts`
- Modify: `domains/bundle/load.ts`
- Modify: `domains/bundle/validate.ts`
- Modify: `domains/bundle/compiler.ts`
- Modify: `domains/bundle/bundle-platform.ts`
- Modify: `domains/bundle/platform.ts`
- Modify: `domains/bundle/factory.ts`
- Modify: `domains/factory/artifacts.ts`
- Modify: `domains/factory/package.ts`
- Modify: `domains/factory/types.ts`
- Modify: `test/domains/bundle/bundle-distribute.test.ts`
- Modify: `test/domains/bundle/bundle-review-summary.test.ts`
- Modify: `test/domains/factory/factory-package.test.ts`

**Interfaces:**

- Produces: `BundleCapability` value `agents`.
- Produces: `BundleAgentDefinition`.
- Produces Claude Code destination `.claude/agents/<agent-id>.md`.
- Consumes portable briefs under `reference/subagents/*.md` only as source material, not as platform-native agents.

- [x] **Step 1: Write failing factory and platform tests**

In `test/domains/factory/factory-package.test.ts`, add:

```ts
it('generates Claude Code custom agent definitions separately from portable role briefs', async () => {
  const workflow = normalizeWorkflowDefinition(
    builtinCometFivePhaseWorkflow({
      name: 'agent-ready',
      goal: 'Generate native authoring agents.',
    }),
  );
  const output = await generateFactorySkillPackage(
    packagePlan({ root, name: 'agent-ready', workflow }),
  );

  const agentPath = path.join(output.packageRoot, 'agents', 'claude', 'comet-any-script-author.md');
  const agent = await fs.readFile(agentPath, 'utf8');
  expect(agent).toContain('---\nname: comet-any-script-author');
  expect(agent).toContain('description: Use when authoring workflow script contracts');
  expect(agent).toContain('tools: Read, Write, Glob, Grep');
  expect(agent).toContain('model: inherit');
  expect(agent).toContain('# Script Author Agent');

  const lanes = JSON.parse(
    await fs.readFile(path.join(output.packageRoot, 'reference', 'authoring-lanes.json'), 'utf8'),
  ) as { lanes: unknown[] };
  expect(JSON.stringify(lanes)).toContain('platform-agent');
});
```

In `test/domains/bundle/bundle-distribute.test.ts`, add:

```ts
it('installs declared Claude Code agents into .claude/agents', async () => {
  await makeReady({ name: 'agent-bundle' });
  const readyRoot = path.join(projectRoot, '.comet', 'bundles', 'agent-bundle');
  await fs.mkdir(path.join(readyRoot, 'agents', 'claude'), { recursive: true });
  await fs.writeFile(
    path.join(readyRoot, 'agents', 'claude', 'agent-bundle-reviewer.md'),
    '---\nname: agent-bundle-reviewer\ndescription: Use when reviewing agent-bundle.\ntools: Read\nmodel: inherit\n---\n\n# Reviewer\n',
    'utf8',
  );
  const manifestPath = path.join(readyRoot, 'bundle.yaml');
  const manifest = parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  const resources = manifest.resources as Record<string, unknown>;
  resources.agents = [
    {
      id: 'agent-bundle-reviewer',
      path: 'agents/claude/agent-bundle-reviewer.md',
      platform: 'claude',
      required: true,
    },
  ];
  manifest.platforms = {
    ...(manifest.platforms as Record<string, unknown>),
    requires: ['skills', 'agents'],
  };
  await fs.writeFile(manifestPath, stringify(manifest), 'utf8');

  await distributeBundle({
    projectRoot,
    name: 'agent-bundle',
    platforms: ['claude'],
    scope: 'project',
  });

  await expect(
    fs.access(path.join(projectRoot, '.claude', 'agents', 'agent-bundle-reviewer.md')),
  ).resolves.toBeUndefined();
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-distribute.test.ts -t "agent"
```

Expected: manifest parser rejects `agents`, platform compile does not install `.claude/agents`, and factory does not generate agent definitions.

- [x] **Step 3: Add bundle agent resource model**

In `domains/bundle/types.ts`, update:

```ts
export type BundleCapability =
  | 'skills'
  | 'rules'
  | 'hooks'
  | 'scripts'
  | 'references'
  | 'assets'
  | 'agents';

export interface BundleAgentDefinition {
  id: string;
  path: string;
  platform: 'claude';
  required: boolean;
}
```

Add `agents: BundleAgentDefinition[]` to `BundleManifest.resources`, `BundleCompilerIr`, and `PlatformInstallFile['kind']`.

- [x] **Step 4: Parse, validate, hash, and compile agent resources**

In `domains/bundle/load.ts`, add `agents` to `CAPABILITIES` and parse `resources.agents` with:

```ts
function narrowAgent(value: unknown, filePath: string, index: number): BundleAgentDefinition {
  const fieldPath = `resources.agents[${index}]`;
  assertObject(value, filePath, fieldPath);
  assertString(value.id, filePath, `${fieldPath}.id`);
  assertString(value.path, filePath, `${fieldPath}.path`);
  assertEnum(value.platform, ['claude'], filePath, `${fieldPath}.platform`);
  assertBoolean(value.required, filePath, `${fieldPath}.required`);
  return {
    id: value.id,
    path: normalizeResourcePath(value.path),
    platform: value.platform,
    required: value.required,
  };
}
```

In `domains/bundle/validate.ts`, add agent declared paths and validate Claude frontmatter:

```ts
if (!source.includes('name:') || !source.includes('description:') || !source.includes('---')) {
  errors.push(`resources.agents[${index}] must contain Claude Code agent frontmatter`);
}
```

In `domains/bundle/compiler.ts`, add `agents`:

```ts
const agents = bundle.manifest.resources.agents
  .map((agent) => ({ ...agent, source: requiredSource(resolved.files, agent.path) }))
  .sort((left, right) => compareText(left.id, right.id));
```

- [x] **Step 5: Add Claude platform support**

In `domains/bundle/bundle-platform.ts`, include `agents` capability only for Claude Code:

```ts
if (platform.id === 'claude') capabilities.add('agents');
```

Add `agentsRoot` to `PlatformBundleLayout`:

```ts
agentsRoot: platform.id === 'claude' ? path.join(platformRoot, 'agents') : null,
```

In `domains/bundle/platform.ts`, plan agent files:

```ts
for (const agent of ir.agents) {
  if (agent.platform !== target.id || !target.layout.agentsRoot) {
    addUnsupported(report, ir, 'agents', `Platform ${target.id} cannot express agent ${agent.id}`);
    continue;
  }
  report.files.push({
    source: agent.source,
    destination: path.join(target.layout.agentsRoot, `${agent.id}.md`),
    kind: 'agent',
  });
}
```

- [x] **Step 6: Generate Claude agent definitions from factory packages**

In `domains/factory/artifacts.ts`, extend:

```ts
export type FactoryPackageArtifactKind = 'skill' | 'script' | 'reference' | 'engine' | 'agent';
```

In `domains/factory/package.ts`, add:

```ts
function claudeAgentDefinition(options: {
  name: string;
  description: string;
  tools: string;
  title: string;
  body: string;
}): string {
  return `---
name: ${options.name}
description: ${options.description}
tools: ${options.tools}
model: inherit
---

# ${options.title}

${options.body}
`;
}
```

Add at least these artifacts:

```ts
artifact(
  'agents/claude/comet-any-script-author.md',
  'agent',
  claudeAgentDefinition({
    name: 'comet-any-script-author',
    description: 'Use when authoring workflow script contracts for a confirmed comet-any bundle draft.',
    tools: 'Read, Write, Glob, Grep',
    title: 'Script Author Agent',
    body: 'Author the script contract for one comet-any authoring lane. Read the portable brief, write only the assigned report path, and do not publish, install, or run destructive commands.',
  }),
),
```

Add bundle manifest resources in `domains/bundle/factory.ts`:

```ts
agents: [
  {
    id: 'comet-any-script-author',
    path: `skills/${skillId}/agents/claude/comet-any-script-author.md`,
    platform: 'claude',
    required: true,
  },
],
```

Add `agents` to required capabilities for factory output.

- [x] **Step 7: Add readiness blockers for invalid platform agents**

In `domains/bundle/review-summary.ts`, when compile reports unsupported required `agents`, existing capability blocker handles it. Add a generated package scan for agent source files:

```ts
if (
  state.factory?.generatedSkillPackage?.platformAgents?.some((agent) => agent.platform === 'claude')
) {
  const missing = compile.files.filter((file) => file.kind === 'agent').length === 0;
  if (missing)
    blockers.push('[agent] Claude Code custom agent definitions are missing from platform preview');
}
```

Add `agent` code to `readiness-user-summary.ts` with next action `comet publish distribute <name> --platform claude --scope project --preview`.

- [x] **Step 8: Verify GREEN**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-distribute.test.ts test/domains/bundle/bundle-review-summary.test.ts -t "agent"
```

Expected: generated package includes `agents/claude/*.md`, bundle parser accepts it, and Claude distribute preview/installation targets `.claude/agents/*.md`.

- [x] **Step 9: Commit**

```bash
git add domains/bundle/types.ts domains/bundle/load.ts domains/bundle/validate.ts domains/bundle/compiler.ts domains/bundle/bundle-platform.ts domains/bundle/platform.ts domains/bundle/factory.ts domains/factory/artifacts.ts domains/factory/package.ts domains/factory/types.ts test/domains/bundle/bundle-distribute.test.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/factory/factory-package.test.ts
git commit -m "feat(bundle): distribute claude custom agents"
```

### Task 8: Chinese Skill Guidance, Then English Sync

**Files:**

- Modify first: `assets/skills-zh/comet-any/SKILL.md`
- Modify first: `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- Modify first: `assets/skills-zh/comet-any/reference/eval-provider.md`
- Modify first: `assets/skills-zh/comet-any/reference/authoring-subagents.md`
- Modify first: `assets/skills-zh/comet-any/reference/subagents/*.md`
- Modify after user confirmation: `assets/skills/comet-any/SKILL.md`
- Modify after user confirmation: `assets/skills/comet-any/reference/bundle-authoring.md`
- Modify after user confirmation: `assets/skills/comet-any/reference/eval-provider.md`
- Modify after user confirmation: `assets/skills/comet-any/reference/authoring-subagents.md`
- Modify after user confirmation: `assets/skills/comet-any/reference/subagents/*.md`
- Modify: `test/domains/bundle/comet-any-skill.test.ts`
- Modify: `test/domains/bundle/comet-any-skill-contract.test.ts`
- Modify: `test/domains/skill/skills.test.ts`

**Interfaces:**

- Produces Chinese guidance for node-attached Output Schemas, augmentation enforcement, overlay state, eval evidence, readiness blockers, and platform-native agents.
- Produces English parity only after user confirmation.

- [x] **Step 1: Write failing Chinese guidance tests**

In `test/domains/bundle/comet-any-skill-contract.test.ts`, add assertions:

```ts
expect(zhSkill).toContain('Output Schema 必须挂到具体 Workflow Node 才算生效');
expect(zhSkill).toContain('guarded');
expect(zhSkill).toContain('handoff-guarded');
expect(zhSkill).toContain('evidence-only');
expect(zhSkill).toContain('advisory');
expect(zhSkill).toContain('不得创建 `.comet/runs/<workflow>/state.json` 作为 Comet overlay 主状态');
expect(zhSkill).toContain('当前 draft hash 的 eval evidence');
expect(zhSkill).toContain('platform-native custom agent');
```

In `test/domains/bundle/comet-any-skill.test.ts`, add absence checks:

```ts
expect(zhEvalProvider).not.toContain('skill-creator provider');
expect(zhEvalProvider).not.toContain('benchmark provider');
expect(zhEvalProvider).not.toContain('benchmark-plan');
expect(zhEvalProvider).not.toContain('benchmark-record');
```

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/bundle/comet-any-skill.test.ts test/domains/bundle/comet-any-skill-contract.test.ts -t "comet-any|Output Schema|eval|agent"
```

Expected: Chinese guidance strings are missing or old benchmark text remains.

- [x] **Step 3: Update Chinese Skill guidance**

Make these exact content changes in Chinese files:

- `assets/skills-zh/comet-any/SKILL.md`: confirmation page step lists `enforcement` for every binding/schema and says mandatory semantics cannot proceed as `advisory`.
- `assets/skills-zh/comet-any/reference/bundle-authoring.md`: document `workflow.nodes.<node>.outputSchemas`, `augmentations[].enforcement`, overlay `.comet.yaml` primary state, and wrapper classification.
- `assets/skills-zh/comet-any/reference/eval-provider.md`: replace benchmark-provider framing with repository `comet eval <generated-skill>/comet/eval.yaml --quick|--full --html` and current draft hash evidence.
- `assets/skills-zh/comet-any/reference/authoring-subagents.md`: state that `reference/subagents/*.md` are portable lane briefs, not platform-native custom agents.
- `assets/skills-zh/comet-any/reference/subagents/*.md`: remove provider-prefix examples and replace benchmark wording with eval evidence wording.

Use these anchor phrases:

```md
Output Schema 必须挂到具体 Workflow Node 才算生效；只定义在 `workflow.outputSchemas` 里不会触发 guard、eval 或 readiness。

确认页必须为每个新增 binding 或 schema 显示 enforcement：`guarded`、`handoff-guarded`、`evidence-only` 或 `advisory`。

`comet-five-phase-overlay` 的主状态只来自 `openspec/changes/<name>/.comet.yaml`；没有 active change 或多个 active changes 时必须阻塞并请用户选择。

`reference/subagents/*.md` 是跨平台 lane brief；Claude Code custom agent 必须单独生成到平台 agent 资源，并带 `name`、`description`、`tools`、`model` frontmatter。
```

- [x] **Step 4: Verify Chinese GREEN**

Run:

```bash
npx vitest run test/domains/bundle/comet-any-skill.test.ts test/domains/bundle/comet-any-skill-contract.test.ts
```

Expected: Chinese tests pass.

- [x] **Step 5: Pause for user confirmation**

Stop and show the Chinese guidance diff summary. Do not modify `assets/skills/comet-any/**` until the user confirms.

- [x] **Step 6: Sync English after confirmation**

After confirmation, mirror the Chinese changes in:

- `assets/skills/comet-any/SKILL.md`
- `assets/skills/comet-any/reference/bundle-authoring.md`
- `assets/skills/comet-any/reference/eval-provider.md`
- `assets/skills/comet-any/reference/authoring-subagents.md`
- `assets/skills/comet-any/reference/subagents/*.md`

Use the English phrase `phase gate`, `check`, or `blocker` naturally; do not change English technical terms such as `Debug Gate` when not part of Chinese translation.

- [x] **Step 7: Verify bilingual parity**

Run:

```bash
npx vitest run test/domains/bundle/comet-any-skill.test.ts test/domains/bundle/comet-any-skill-contract.test.ts test/domains/skill/skills.test.ts -t "comet-any|Skill"
```

Expected: Chinese and English guidance tests pass, and old benchmark-provider wording is absent.

- [x] **Step 8: Commit**

```bash
git add assets/skills-zh/comet-any assets/skills/comet-any test/domains/bundle/comet-any-skill.test.ts test/domains/bundle/comet-any-skill-contract.test.ts test/domains/skill/skills.test.ts
git commit -m "docs(skill): clarify comet-any readiness contracts"
```

### Task 9: Final Verification, Changelog, And Regression Sample

**Files:**

- Modify: `CHANGELOG.md`
- Optionally modify: generated regression fixture files if the implementation creates a checked-in sample.

**Interfaces:**

- Produces final user-visible changelog entries under `0.4.0-beta.1`.
- Produces verification evidence for focused tests, build, lint, and full test.

- [x] **Step 1: Check version and changelog target**

Run:

```bash
git fetch origin master
git show origin/master:package.json
rg -n "What's Changed \\[0\\.4\\.0-beta\\.1\\]|What's Changed" CHANGELOG.md package.json
```

Expected: current branch `package.json` remains `0.4.0-beta.1`. If `origin/master` changed to a different released version, update this plan section before writing the changelog.

- [x] **Step 2: Add changelog entries**

Append under `## What's Changed [0.4.0-beta.1] - 2026-06-27`:

```md
### Changed

- **Comet Any readiness**: Generated workflow Skills now distinguish publishable delegate wrappers from scaffolded packages, blocking ready/publish when authored entry content, Output Schema attachment, augmentation evidence, eval results, or platform agent definitions are missing.
- **Comet Any eval path**: Generated `comet/eval.yaml` manifests now use the repository eval runner with task suites, baseline treatments, quality gates, and current draft hash evidence instead of a separate benchmark-provider path.
- **Claude Code agent distribution**: Comet Any packages can preview and distribute platform-native Claude Code custom agents separately from portable authoring lane briefs.

### Tests

- **Comet Any production readiness**: Added workflow-contract, factory package, bundle readiness, eval manifest, platform agent, bilingual Skill guidance, and overlay state adapter coverage for generated workflow Skill readiness.
```

- [x] **Step 3: Run focused verification**

Run:

```bash
npx vitest run test/domains/workflow-contract/workflow-contract.test.ts
npx vitest run test/domains/factory/factory-package.test.ts
npx vitest run test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-eval.test.ts
npx vitest run test/domains/bundle/comet-any-skill.test.ts test/domains/bundle/comet-any-skill-contract.test.ts
cd eval && uv run pytest local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: all focused checks pass.

- [x] **Step 4: Run repository verification**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

Expected: all repository checks pass. If Windows CRLF affects unrelated old files during `pnpm format:check`, inspect whether those files were modified in this branch before changing them.

- [x] **Step 5: Run generated package eval collect-only**

Generate or reuse a local `comet-grill-me` package, then run:

```bash
cd eval && uv run pytest local/tests/tasks/test_tasks.py --eval-manifest <generated>/comet/eval.yaml --collect-only -q
```

Expected: collection includes `DYNAMIC_SKILL`, `CONTROL`, and `COMET_FULL` for `comet-five-phase-overlay` manifests.

- [x] **Step 6: Inspect worktree**

Run:

```bash
git status --short
```

Expected: only intentional implementation, tests, docs, and changelog files are modified.

- [x] **Step 7: Commit**

```bash
git add CHANGELOG.md
git add domains eval app assets test
git commit -m "feat(comet-any): harden generated workflow readiness"
```

## Self-Review

- Spec coverage: Task 1 covers node-attached Output Schemas and orphan schemas. Task 2 covers augmentations, handoff, and guard evidence. Task 3 covers real `.comet.yaml` overlay state. Task 4 covers authored content and wrapper classification. Tasks 5 and 6 cover repository eval integration, baseline treatments, quality gates, current draft hash evidence, and readiness. Task 7 covers portable briefs versus platform-native Claude Code agents. Task 8 covers bilingual `/comet-any` guidance and old benchmark-provider cleanup. Task 9 covers changelog and verification.
- Placeholder scan: No implementation step uses banned placeholder wording from the writing-plans checklist. Every task names files, tests, commands, and expected results.
- Type consistency: `WorkflowNodePatch.outputSchemas`, `WorkflowEnforcementLevel`, `BundleAgentDefinition`, `GeneratedWrapperClassification`, and repository eval result fields are introduced before later tasks consume them.

Plan complete and saved to `docs/superpowers/plans/2026-06-30-comet-any-workflow-skill-production-readiness.md`.

Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using `executing-plans`, batch execution with checkpoints.
