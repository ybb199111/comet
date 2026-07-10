# Classic Engine Native Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Progressively make Classic `/comet` workflow Engine-native by sharing Resolver evidence across status, doctor, guard, and runtime eval without changing the familiar user entry commands.

**Architecture:** Keep `.comet.yaml` as the user-visible projection and `.comet/run-state.json` as the machine-owned Run state. Add a shared Classic diagnostics layer that reads the migrated projection, collected evidence, resolver step id, and runtime eval readiness; then route status, doctor, and guard through that same layer before expanding Engine-driven behavior.

**Tech Stack:** TypeScript ESM, Node.js 20+, YAML, Vitest, existing Classic runtime generator, existing Engine Run state and resolver modules.

## Global Constraints

- Engine-native 迁移必须兼容现有 change，不允许要求用户手动迁移。
- 旧 change 首次读取时懒迁移，重复读取必须幂等。
- `.comet.yaml` 仍保留用户字段，但 `run-state.json` 持有 machine-owned run 字段。
- Classic Resolver 成为 `comet status`、guard、next-step hint、doctor 的共同事实源。
- 旧字段只作为 Classic projection，不再新增工作流事实。
- `.mjs` launcher 只负责定位 runtime 和分发命令；业务决策不得回流到 launcher。
- 新共享工具只能放在 `domains/comet-classic/` 或 Engine 共享模块。
- Engine-native 迁移不能让现有 change 无法恢复或归档。
- Frozen 0.3.9 fixture 差分兼容测试继续通过。
- Classic runtime 共享逻辑必须来自 `domains/comet-classic/`，修改后运行 `pnpm build:classic-runtime`。

---

## File Structure

- `domains/comet-classic/classic-diagnostics.ts`: create shared diagnostics for Classic state, evidence, resolver step, next command, runtime mode, and fail-closed errors.
- `domains/comet-classic/classic-runtime-evals.ts`: map Classic resolver steps to required evidence codes and runtime eval status.
- `domains/comet-classic/index.ts`: export new diagnostics/eval helpers.
- `app/commands/status.ts`: consume Classic diagnostics instead of independently projecting state and next command.
- `app/commands/doctor.ts`: consume Classic diagnostics for `.comet.yaml` checks and current step messages.
- `domains/comet-classic/classic-guard.ts`: expose diagnostics in JSON mode and use shared runtime eval readiness for phase-exit messaging.
- `domains/comet-classic/classic-state-command.ts`: keep `next` output aligned with resolver diagnostics.
- `assets/skills/comet/scripts/comet-runtime.mjs`: generated output after `pnpm build:classic-runtime`.
- `test/domains/comet-classic/classic-diagnostics.test.ts`: cover shared diagnostics and malformed-state behavior.
- `test/app/status.test.ts`: cover status JSON fields from shared diagnostics.
- `test/app/doctor.test.ts`: cover doctor messages from shared diagnostics.
- `test/domains/comet-classic/classic-guard.test.ts`: cover guard JSON diagnostics and runtime eval readiness.
- `test/domains/comet-classic/classic-migrate.test.ts`: add old change lazy migration idempotency checks.
- `test/domains/comet-classic/comet-scripts.test.ts`: ensure generated runtime still works.

## Tasks

### Task 1: Shared Classic Diagnostics

**Files:**
- Create: `domains/comet-classic/classic-diagnostics.ts`
- Modify: `domains/comet-classic/index.ts`
- Test: `test/domains/comet-classic/classic-diagnostics.test.ts`

**Interfaces:**
- Produces: `ClassicDiagnostic`.
- Produces: `inspectClassicChange(changeDir: string, name: string) -> Promise<ClassicDiagnostic>`.
- Consumes: `ensureStrictClassicRuntimeRun`, `collectClassicEvidence`, `resolveClassicStepId`, `ClassicState`, and `RunState`.

- [x] **Step 1: Write failing diagnostics tests**

Create `test/domains/comet-classic/classic-diagnostics.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { inspectClassicChange } from '../../../domains/comet-classic/classic-diagnostics.js';
import { runClassicCli } from '../../../domains/comet-classic/classic-cli.js';

describe('Classic diagnostics', () => {
  let projectRoot: string;
  let changeDir: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'classic-diagnostics-'));
    changeDir = path.join(projectRoot, 'openspec', 'changes', 'demo');
    await fs.mkdir(changeDir, { recursive: true });
    process.chdir(projectRoot);
    await runClassicCli(['state', 'init', 'demo', 'full']);
    await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Proposal\n');
    await fs.writeFile(path.join(changeDir, 'design.md'), '# Design\n');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [x] build\n');
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('returns resolver step, evidence, and next command from one source', async () => {
    const diagnostic = await inspectClassicChange(changeDir, 'demo');

    expect(diagnostic.name).toBe('demo');
    expect(diagnostic.valid).toBe(true);
    expect(diagnostic.phase).toBe('open');
    expect(diagnostic.currentStep).toBe('full.open');
    expect(diagnostic.nextCommand).toBe('/comet-open');
    expect(diagnostic.evidence.some((item) => item.code === 'openspec.proposal')).toBe(true);
    expect(diagnostic.runtimeMode).toBe('engine-projection');
  });

  it('fails closed with an error instead of throwing to callers', async () => {
    await fs.appendFile(path.join(changeDir, '.comet.yaml'), '\nunknown_field: true\n');

    const diagnostic = await inspectClassicChange(changeDir, 'demo');

    expect(diagnostic.valid).toBe(false);
    expect(diagnostic.error).toContain('unknown field');
    expect(diagnostic.currentStep).toBeNull();
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-diagnostics.test.ts
```

Expected: failure because `classic-diagnostics.ts` does not exist.

- [x] **Step 3: Implement diagnostics module**

Create `domains/comet-classic/classic-diagnostics.ts`:

```ts
import type { ClassicEvidence } from './classic-evidence.js';
import { collectClassicEvidence } from './classic-evidence.js';
import { ensureStrictClassicRuntimeRun } from './classic-runtime-run.js';
import { resolveClassicStepId } from './classic-resolver.js';

export interface ClassicDiagnostic {
  name: string;
  valid: boolean;
  workflow: string;
  phase: string;
  currentStep: string | null;
  nextCommand: string | null;
  runtimeMode: 'engine-projection' | 'invalid';
  evidence: ClassicEvidence[];
  error?: string;
}

function nextCommandForPhase(phase: string): string | null {
  switch (phase) {
    case 'open':
      return '/comet-open';
    case 'design':
      return '/comet-design';
    case 'build':
      return '/comet-build';
    case 'verify':
      return '/comet-verify';
    case 'archive':
      return '/comet-archive';
    default:
      return null;
  }
}

export async function inspectClassicChange(
  changeDir: string,
  name: string,
): Promise<ClassicDiagnostic> {
  try {
    const runtime = await ensureStrictClassicRuntimeRun(changeDir);
    const evidence = await collectClassicEvidence(changeDir, {
      classic: runtime.classic,
      run: runtime.run,
      unknownKeys: [],
    });
    const currentStep = resolveClassicStepId(runtime.classic, evidence);
    return {
      name,
      valid: true,
      workflow: runtime.classic.workflow,
      phase: runtime.classic.phase,
      currentStep,
      nextCommand: nextCommandForPhase(runtime.classic.phase),
      runtimeMode: 'engine-projection',
      evidence,
    };
  } catch (error) {
    return {
      name,
      valid: false,
      workflow: 'unknown',
      phase: 'invalid',
      currentStep: null,
      nextCommand: null,
      runtimeMode: 'invalid',
      evidence: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

Export from `domains/comet-classic/index.ts`:

```ts
export * from './classic-diagnostics.js';
```

- [x] **Step 4: Run focused tests**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-diagnostics.test.ts
```

Expected: all diagnostics tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add domains/comet-classic/classic-diagnostics.ts domains/comet-classic/index.ts test/domains/comet-classic/classic-diagnostics.test.ts
git commit -m "feat(classic): add shared diagnostics"
```

Expected: commit succeeds.

### Task 2: Status and Doctor Use Shared Diagnostics

**Files:**
- Modify: `app/commands/status.ts`
- Modify: `app/commands/doctor.ts`
- Test: `test/app/status.test.ts`
- Test: `test/app/doctor.test.ts`

**Interfaces:**
- Consumes: `inspectClassicChange(changeDir, name)`.
- Produces: status JSON field `runtimeMode`.
- Produces: doctor `.comet.yaml` message `valid (step: <step>, mode: engine-projection)`.

- [x] **Step 1: Write failing status test**

Append to `test/app/status.test.ts`:

```ts
it('reports Classic runtime mode from shared diagnostics', async () => {
  const changeDir = path.join(tmpDir, 'openspec', 'changes', 'demo');
  state(tmpDir, 'init', 'demo', 'full');
  await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Proposal\n');
  await fs.writeFile(path.join(changeDir, 'design.md'), '# Design\n');
  await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [x] build\n');

  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  let json = '';
  try {
    await statusCommand(tmpDir, { json: true });
    json = log.mock.calls.map((call) => call.join(' ')).join('\n');
  } finally {
    log.mockRestore();
  }
  const payload = JSON.parse(json);

  expect(payload.changes[0]).toMatchObject({
    name: 'demo',
    currentStep: 'full.open',
    runtimeMode: 'engine-projection',
  });
});
```

- [x] **Step 2: Write failing doctor test**

Append to `test/app/doctor.test.ts`:

```ts
it('uses Classic diagnostics for comet yaml validity messages', async () => {
  const changeDir = path.join(tmpDir, 'openspec', 'changes', 'demo');
  state(tmpDir, 'init', 'demo', 'full');

  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  let json = '';
  try {
    await doctorCommand(tmpDir, { json: true });
    json = log.mock.calls.map((call) => call.join(' ')).join('\n');
  } finally {
    log.mockRestore();
  }
  const payload = JSON.parse(json);
  const cometYaml = payload.results.find((item: { check: string }) =>
    item.check === '.comet.yaml: demo',
  );

  expect(cometYaml.message).toContain('step: full.open');
  expect(cometYaml.message).toContain('mode: engine-projection');
});
```

- [x] **Step 3: Run tests to verify failure**

Run:

```bash
npx vitest run test/app/status.test.ts test/app/doctor.test.ts
```

Expected: failures because status and doctor do not expose `runtimeMode` or the new message.

- [x] **Step 4: Route status through diagnostics**

In `app/commands/status.ts`, remove the local `getNextCommand()` helper and replace `ensureStrictClassicRuntimeRun(changeDir)` with:

```ts
const diagnostic = await inspectClassicChange(changeDir, entry);
if (!diagnostic.valid) {
  changes.push({
    name: entry,
    workflow: diagnostic.workflow,
    phase: diagnostic.phase,
    buildMode: 'null',
    isolation: 'null',
    verifyMode: 'null',
    verifyResult: 'pending',
    designDoc: null,
    plan: null,
    tasksCompleted: 0,
    tasksTotal: 0,
    nextCommand: null,
    currentStep: null,
    runtimeMode: diagnostic.runtimeMode,
    error: diagnostic.error,
  });
  continue;
}
```

For valid changes, set:

```ts
nextCommand: diagnostic.nextCommand,
currentStep: diagnostic.currentStep,
runtimeMode: diagnostic.runtimeMode,
```

Add `runtimeMode: string;` to `ChangeStatus`.

- [x] **Step 5: Route doctor through diagnostics**

In `app/commands/doctor.ts`, replace the `.comet.yaml` check body with:

```ts
const diagnostic = await inspectClassicChange(changeDir, entry);
results.push(
  diagnostic.valid
    ? {
        check: `.comet.yaml: ${entry}`,
        status: 'pass',
        message: `valid (step: ${diagnostic.currentStep ?? 'completed'}, mode: ${diagnostic.runtimeMode})`,
      }
    : {
        check: `.comet.yaml: ${entry}`,
        status: 'fail',
        message: diagnostic.error ?? 'invalid Classic state',
      },
);
```

- [x] **Step 6: Run focused tests**

Run:

```bash
npx vitest run test/app/status.test.ts test/app/doctor.test.ts
```

Expected: all selected tests pass.

- [x] **Step 7: Commit**

Run:

```bash
git add app/commands/status.ts app/commands/doctor.ts test/app/status.test.ts test/app/doctor.test.ts
git commit -m "feat(classic): share status doctor diagnostics"
```

Expected: commit succeeds.

### Task 3: Classic Runtime Eval Readiness

**Files:**
- Create: `domains/comet-classic/classic-runtime-evals.ts`
- Modify: `domains/comet-classic/classic-diagnostics.ts`
- Modify: `domains/comet-classic/index.ts`
- Test: `test/domains/comet-classic/classic-runtime-evals.test.ts`
- Test: `test/domains/comet-classic/classic-diagnostics.test.ts`

**Interfaces:**
- Produces: `ClassicRuntimeEvalStatus`.
- Produces: `evaluateClassicRuntimeStep(stepId: string, evidence: ClassicEvidence[]) -> ClassicRuntimeEvalStatus`.
- Adds: `ClassicDiagnostic.runtimeEval`.

- [x] **Step 1: Write failing runtime eval tests**

Create `test/domains/comet-classic/classic-runtime-evals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateClassicRuntimeStep } from '../../../domains/comet-classic/classic-runtime-evals.js';

describe('Classic runtime eval readiness', () => {
  it('requires proposal and tasks evidence for full.open', () => {
    expect(
      evaluateClassicRuntimeStep('full.open', [
        { code: 'openspec.proposal', satisfied: true },
        { code: 'openspec.tasks', satisfied: false },
      ]),
    ).toEqual({
      stepId: 'full.open',
      passed: false,
      requiredEvidence: ['openspec.proposal', 'openspec.tasks'],
      missingEvidence: ['openspec.tasks'],
    });
  });

  it('passes when all required evidence is satisfied', () => {
    expect(
      evaluateClassicRuntimeStep('full.verify.branch', [
        { code: 'verification.report', satisfied: true },
      ]),
    ).toMatchObject({ stepId: 'full.verify.branch', passed: true, missingEvidence: [] });
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-runtime-evals.test.ts
```

Expected: failure because `classic-runtime-evals.ts` does not exist.

- [x] **Step 3: Implement runtime eval helper**

Create `domains/comet-classic/classic-runtime-evals.ts`:

```ts
import type { ClassicEvidence } from './classic-evidence.js';
import { evidenceSatisfied } from './classic-evidence.js';

export interface ClassicRuntimeEvalStatus {
  stepId: string;
  passed: boolean;
  requiredEvidence: string[];
  missingEvidence: string[];
}

const STEP_EVIDENCE: Record<string, string[]> = {
  'full.open': ['openspec.proposal', 'openspec.tasks'],
  'full.design.handoff': ['openspec.proposal', 'openspec.design', 'openspec.tasks'],
  'full.design.document': ['design.handoff'],
  'full.build.plan': ['openspec.tasks'],
  'full.build.plan-ready': ['build.plan'],
  'full.build.configure': ['build.plan'],
  'full.build.execute': ['build.plan'],
  'full.build.complete': ['build.tasks-complete'],
  'full.verify.run': ['build.tasks-complete'],
  'full.verify.branch': ['verification.report'],
  'full.archive.confirm': ['verification.report'],
  'full.archive.execute': ['archive.confirmed'],
};

function requirementsFor(stepId: string): string[] {
  if (STEP_EVIDENCE[stepId]) return STEP_EVIDENCE[stepId];
  if (stepId.endsWith('.open')) return ['openspec.proposal', 'openspec.tasks'];
  if (stepId.endsWith('.build.execute')) return [];
  if (stepId.endsWith('.build.complete')) return ['build.tasks-complete'];
  if (stepId.endsWith('.verify.run')) return ['build.tasks-complete'];
  if (stepId.endsWith('.verify.branch')) return ['verification.report'];
  if (stepId.endsWith('.archive.confirm')) return ['verification.report'];
  if (stepId.endsWith('.archive.execute')) return ['archive.confirmed'];
  return [];
}

export function evaluateClassicRuntimeStep(
  stepId: string,
  evidence: readonly ClassicEvidence[],
): ClassicRuntimeEvalStatus {
  const requiredEvidence = requirementsFor(stepId);
  const missingEvidence = requiredEvidence.filter((code) => !evidenceSatisfied(evidence, code));
  return {
    stepId,
    passed: missingEvidence.length === 0,
    requiredEvidence,
    missingEvidence,
  };
}
```

Export it from `domains/comet-classic/index.ts`:

```ts
export * from './classic-runtime-evals.js';
```

- [x] **Step 4: Attach runtime eval to diagnostics**

In `domains/comet-classic/classic-diagnostics.ts`, import:

```ts
import { evaluateClassicRuntimeStep, type ClassicRuntimeEvalStatus } from './classic-runtime-evals.js';
```

Add to `ClassicDiagnostic`:

```ts
runtimeEval: ClassicRuntimeEvalStatus | null;
```

For valid diagnostics:

```ts
runtimeEval: evaluateClassicRuntimeStep(currentStep, evidence),
```

For invalid diagnostics:

```ts
runtimeEval: null,
```

Extend `classic-diagnostics.test.ts`:

```ts
expect(diagnostic.runtimeEval).toMatchObject({
  stepId: 'full.open',
  requiredEvidence: ['openspec.proposal', 'openspec.tasks'],
});
```

- [x] **Step 5: Run focused tests**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-runtime-evals.test.ts test/domains/comet-classic/classic-diagnostics.test.ts
```

Expected: all selected tests pass.

- [x] **Step 6: Commit**

Run:

```bash
git add domains/comet-classic/classic-runtime-evals.ts domains/comet-classic/classic-diagnostics.ts domains/comet-classic/index.ts test/domains/comet-classic/classic-runtime-evals.test.ts test/domains/comet-classic/classic-diagnostics.test.ts
git commit -m "feat(classic): evaluate runtime step evidence"
```

Expected: commit succeeds.

### Task 4: Guard JSON Diagnostics

**Files:**
- Modify: `domains/comet-classic/classic-guard.ts`
- Test: `test/domains/comet-classic/classic-guard.test.ts`

**Interfaces:**
- Consumes: `ClassicCommandOptions.json`.
- Produces: JSON payload `{ phase, change, currentStep, runtimeEval, blocked, checks }` when `comet-runtime guard <change> <phase> --json` is used.
- Preserves: existing stderr output and exit codes for non-JSON guard calls.

- [x] **Step 1: Write failing guard JSON test**

Append to `test/domains/comet-classic/classic-guard.test.ts`:

```ts
it('returns resolver diagnostics in json mode', async () => {
  expect(run(dir, 'state', 'init', 'demo', 'full').status).toBe(0);
  await fs.writeFile(path.join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# Proposal\n');
  await fs.writeFile(path.join(dir, 'openspec', 'changes', 'demo', 'design.md'), '# Design\n');
  await fs.writeFile(path.join(dir, 'openspec', 'changes', 'demo', 'tasks.md'), '- [x] build\n');

  const result = run(dir, 'guard', 'demo', 'open', '--json');
  const wrapper = JSON.parse(result.stdout);
  const payload = JSON.parse(wrapper.stdout);

  expect(payload.diagnostics).toMatchObject({
    change: 'demo',
    phase: 'open',
    currentStep: 'full.open',
    runtimeEval: { stepId: 'full.open' },
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-guard.test.ts
```

Expected: new JSON diagnostics assertion fails.

- [x] **Step 3: Add diagnostics to guard output**

In `domains/comet-classic/classic-guard.ts`, import:

```ts
import { inspectClassicChange } from './classic-diagnostics.js';
```

Extend `GuardOutput`:

```ts
diagnostics?: Record<string, unknown>;

toResult(exitCode = 0): ClassicCommandResult {
  return {
    exitCode,
    ...(this.stderr.length > 0 ? { stderr: this.stderr.join('\n') + '\n' } : {}),
    ...(this.diagnostics ? { stdout: JSON.stringify({ diagnostics: this.diagnostics }) + '\n' } : {}),
  };
}
```

After `const runContext = await ensureClassicRuntimeRun(changeDir);`, set diagnostics when `options.json`:

```ts
const diagnostic = await inspectClassicChange(changeDir, change);
if (options.json) {
  output.diagnostics = {
    change,
    phase,
    currentStep: diagnostic.currentStep,
    runtimeEval: diagnostic.runtimeEval,
  };
}
```

Keep non-JSON stderr unchanged. If `runClassicCli --json` currently wraps handler stdout/stderr, update the test expectation to read the wrapped `stdout` string and parse the nested payload.

- [x] **Step 4: Run focused guard tests**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-guard.test.ts
```

Expected: all selected tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add domains/comet-classic/classic-guard.ts test/domains/comet-classic/classic-guard.test.ts
git commit -m "feat(classic): expose guard diagnostics"
```

Expected: commit succeeds.

### Task 5: Lazy Migration Idempotency Audit

**Files:**
- Modify: `test/domains/comet-classic/classic-migrate.test.ts`
- Modify: `domains/comet-classic/classic-migrate.ts` only when the idempotency test proves the current migration rewrites state on repeated reads.

**Interfaces:**
- Consumes: legacy `.comet.yaml` without `classic_profile`, `classic_migration`, and Run fields.
- Produces: idempotent migrated projection where repeated reads do not rewrite state or change run id.

- [x] **Step 1: Add idempotency test**

Append to `test/domains/comet-classic/classic-migrate.test.ts`:

```ts
it('migrates old Classic state idempotently on repeated reads', async () => {
  await fs.writeFile(
    path.join(changeDir, '.comet.yaml'),
    `workflow: full
phase: build
context_compression: off
build_mode: executing-plans
build_pause: null
subagent_dispatch: null
tdd_mode: tdd
isolation: worktree
verify_mode: full
auto_transition: true
base_ref: null
design_doc: null
plan: docs/superpowers/plans/demo.md
verify_result: pending
verification_report: null
branch_status: pending
created_at: 2026-06-22
verified_at: null
archived: false
direct_override: null
build_command: null
verify_command: null
handoff_context: null
handoff_hash: null
`,
  );

  const first = await ensureClassicRun(changeDir, { skillPackage: pkg });
  const afterFirst = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');
  const second = await ensureClassicRun(changeDir, { skillPackage: pkg });
  const afterSecond = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');

  expect(second.run.runId).toBe(first.run.runId);
  expect(afterSecond).toBe(afterFirst);
});
```

- [x] **Step 2: Run tests to verify current behavior**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-migrate.test.ts
```

Expected: pass if migration is already idempotent; fail if repeated reads rewrite state.

- [x] **Step 3: Fix migration only if test fails**

If the idempotency test fails, update `domains/comet-classic/classic-migrate.ts` so `ensureClassicRun()` returns the existing run when `classic_migration` is current:

```ts
if (classic.classicMigration === CLASSIC_MIGRATION_VERSION && projection.run) {
  return {
    classic,
    run: projection.run,
  };
}
```

Do not add new `.comet.yaml` fields.

- [x] **Step 4: Commit**

Run:

```bash
git add test/domains/comet-classic/classic-migrate.test.ts domains/comet-classic/classic-migrate.ts
git commit -m "test(classic): cover migration idempotency"
```

Expected: commit succeeds with only changed files staged.

### Task 6: Runtime Build, Compatibility, and Docs

**Files:**
- Modify: `assets/skills/comet/scripts/comet-runtime.mjs`
- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `docs/superpowers/specs/2026-06-22-comet-priority-improvements-design.md` if implementation reveals a spec correction.

**Interfaces:**
- Produces: generated Classic runtime with diagnostics and runtime eval support.
- Documents: Classic is progressively Engine-native; lightweight compatibility entrypoints remain.

- [x] **Step 1: Rebuild generated Classic runtime**

Run:

```bash
pnpm build:classic-runtime
```

Expected: `assets/skills/comet/scripts/comet-runtime.mjs` updates only if generated runtime content changed.

- [x] **Step 2: Run focused Classic tests**

Run:

```bash
npx vitest run \
  test/domains/comet-classic/classic-diagnostics.test.ts \
  test/domains/comet-classic/classic-runtime-evals.test.ts \
  test/domains/comet-classic/classic-resolver.test.ts \
  test/domains/comet-classic/classic-migrate.test.ts \
  test/domains/comet-classic/classic-guard.test.ts \
  test/domains/comet-classic/comet-scripts.test.ts \
  test/app/status.test.ts \
  test/app/doctor.test.ts
```

Expected: all selected tests pass.

- [x] **Step 3: Run required Classic script test**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-scripts.test.ts
```

Expected: script launcher behavior remains compatible.

- [x] **Step 4: Update architecture docs**

Add to `docs/architecture/ARCHITECTURE.md`:

```markdown
### Classic Engine-Native Convergence

Classic `/comet` commands keep their existing user-facing entrypoints, but status, doctor, guard,
and runtime transitions share the Classic Resolver as the current workflow fact source. `.comet.yaml`
remains the user-visible projection, while `.comet/run-state.json` owns machine run state and
trajectory. Lightweight compatibility paths stay available for simple workflows; long-running,
recoverable, or review/eval-bound workflows should use Engine-backed diagnostics and evidence.
```

- [x] **Step 5: Run repository checks**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
git diff --check
```

Expected: all commands exit 0 and whitespace check has no output.

- [x] **Step 6: Commit**

Run:

```bash
git add assets/skills/comet/scripts/comet-runtime.mjs docs/architecture/ARCHITECTURE.md
git commit -m "docs(classic): document engine-native convergence"
```

Expected: commit succeeds with only files that changed staged.

## Final Verification

- [x] Run Classic focused tests:

```bash
npx vitest run \
  test/domains/comet-classic/classic-diagnostics.test.ts \
  test/domains/comet-classic/classic-runtime-evals.test.ts \
  test/domains/comet-classic/classic-resolver.test.ts \
  test/domains/comet-classic/classic-migrate.test.ts \
  test/domains/comet-classic/classic-guard.test.ts \
  test/domains/comet-classic/comet-scripts.test.ts \
  test/app/status.test.ts \
  test/app/doctor.test.ts
```

Expected: all selected tests pass.

- [x] Run full repository verification:

```bash
pnpm format:check
pnpm lint
pnpm build
npx vitest run
```

Expected: all commands pass. If unrelated failures appear, capture exact failing tests and do not change unrelated code.

- [x] Run whitespace check:

```bash
git diff --check
```

Expected: no output.

## Self-Review

- Spec coverage: Tasks cover resolver-first status/doctor/guard convergence, runtime eval evidence, lazy idempotent migration, launcher-as-adapter by rebuilding generated runtime, and user-visible compatibility.
- Placeholder scan: No unresolved marker words or unspecified implementation work remains.
- Type consistency: `ClassicDiagnostic`, `runtimeMode`, `runtimeEval`, `ClassicRuntimeEvalStatus`, and `inspectClassicChange` are used consistently across app commands, Classic runtime, and tests.
- Risk control: Existing `.comet.yaml` projection remains; no new user state field is added; 0.3.9 compatibility and generated runtime freshness are verified.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-classic-engine-native-convergence.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
