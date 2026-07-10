# Comet CLI Mental Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-facing `comet publish` facade and adjust docs/help so Skill creation, eval, publish, and Bundle backend commands have clearer boundaries.

**Architecture:** Keep `domains/bundle/*` as the single source of truth. Add `app/commands/publish.ts` as a thin facade over existing Bundle command functions, then register `comet publish` in `app/cli/index.ts`. Update docs and `/comet-any` wording to present `comet publish` as the user-facing release path while leaving `comet bundle` available for advanced backend operations.

**Tech Stack:** TypeScript, Commander, Vitest, Markdown docs, existing Comet Skill assets.

## Global Constraints

- Do not delete existing `comet bundle *` commands.
- Do not introduce a second Bundle or publish state model.
- Keep JSON output backward compatible.
- Use `comet eval` as the only general Skill eval path; `comet skill eval` remains deterministic Engine Run runtime eval.
- Update Chinese Skill/docs first; English must stay aligned once behavior is finalized.
- Changelog entries are English and describe user-visible behavior.

---

### Task 1: Add Publish Facade Command Functions

**Files:**

- Create: `app/commands/publish.ts`
- Test: `test/domains/bundle/publish-command.test.ts`

**Interfaces:**

- Consumes: `bundleListCommand`, `bundleStatusCommand`, `bundleReviewSummaryCommand`, `bundleReviewCommand`, `bundlePublishCommand`, `bundleDistributeCommand` from `app/commands/bundle.ts`.
- Produces: `publishListCommand`, `publishStatusCommand`, `publishReviewCommand`, `publishApproveCommand`, `publishRunCommand`, `publishDistributeCommand`.

- [ ] **Step 1: Write failing tests**

Create `test/domains/bundle/publish-command.test.ts` with tests that call publish facade functions and assert they reuse Bundle JSON contracts:

```ts
import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  publishApproveCommand,
  publishListCommand,
  publishRunCommand,
  publishStatusCommand,
} from '../../../app/commands/publish.js';
import {
  bundleDraftOptimizeCommand,
  bundleEvalRecordCommand,
} from '../../../app/commands/bundle.js';
import type { BundleEvalResult } from '../../../domains/bundle/eval.js';

async function captureJson(run: () => Promise<void>): Promise<Record<string, unknown>> {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await run();
    return JSON.parse(log.mock.calls.map((call) => call.join(' ')).join('\n'));
  } finally {
    log.mockRestore();
  }
}

// Write a minimal Bundle fixture, optimize it, verify publish status exposes nextAction,
// then record eval, approve, and publish through the facade.
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/bundle/publish-command.test.ts
```

Expected: fail because `app/commands/publish.ts` does not exist.

- [ ] **Step 3: Implement facade**

Create `app/commands/publish.ts`:

```ts
import {
  bundleDistributeCommand,
  bundleListCommand,
  bundlePublishCommand,
  bundleReviewCommand,
  bundleReviewSummaryCommand,
  bundleStatusCommand,
  type BundleCommandOptions,
} from './bundle.js';

export type PublishCommandOptions = BundleCommandOptions;

export async function publishListCommand(options: PublishCommandOptions = {}): Promise<void> {
  await bundleListCommand(options);
}

export async function publishStatusCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleStatusCommand(name, options);
}

export async function publishReviewCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleReviewSummaryCommand(name, options);
}

export async function publishApproveCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleReviewCommand(name, { ...options, approve: true, reject: false });
}

export async function publishRunCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundlePublishCommand(name, options);
}

export async function publishDistributeCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleDistributeCommand(name, options);
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run test/domains/bundle/publish-command.test.ts
```

Expected: pass.

### Task 2: Register `comet publish` CLI

**Files:**

- Modify: `app/cli/index.ts`
- Test: `test/domains/bundle/bundle-cli-e2e.test.ts`

**Interfaces:**

- Consumes: publish facade functions from Task 1.
- Produces: `comet publish list/status/review/approve/run/distribute`.

- [ ] **Step 1: Write failing CLI tests**

Add tests to `test/domains/bundle/bundle-cli-e2e.test.ts` that:

```ts
const listed = runJson('publish', 'list', '--project', projectRoot);
expect(listed).toMatchObject({ bundles: [{ name: 'recoverable-bundle' }] });

const status = runJson('publish', 'status', 'recoverable-bundle', '--project', projectRoot);
expect(status).toMatchObject({ nextAction: { action: 'choose-eval-level' } });
```

Also test that `publish review`, `publish approve`, and `publish run` can complete the same lifecycle as the existing Bundle commands.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/domains/bundle/bundle-cli-e2e.test.ts
```

Expected: fail because `comet publish` is not registered.

- [ ] **Step 3: Register commands**

Modify `app/cli/index.ts` to import publish functions and register:

```ts
const publish = program
  .command('publish')
  .description('Review, publish, and distribute /comet-any Skill publish candidates');
```

Register `list`, `status`, `review`, `approve`, `run`, and `distribute` with the same options as the mapped Bundle commands.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run test/domains/bundle/bundle-cli-e2e.test.ts
```

Expected: pass.

### Task 3: Clarify Help Text

**Files:**

- Modify: `app/cli/index.ts`
- Test: `test/domains/bundle/bundle-cli-e2e.test.ts` or `test/app/cli-help.test.ts`

**Interfaces:**

- Consumes: Commander help output.
- Produces: clearer descriptions for `comet bundle` and `comet skill eval`.

- [ ] **Step 1: Write failing help tests**

Add a CLI help test that runs:

```bash
node bin/comet.js bundle --help
node bin/comet.js skill eval --help
```

Assert:

```ts
expect(bundleHelp.stdout).toContain('advanced Bundle backend');
expect(skillEvalHelp.stdout).toContain('Use comet eval run for general Skill evals');
```

- [ ] **Step 2: Verify RED**

Run the help test and confirm current descriptions do not contain those phrases.

- [ ] **Step 3: Update help descriptions**

Modify command descriptions:

```ts
const bundle = program
  .command('bundle')
  .description('Advanced Bundle backend for Skill publish candidates');

skill
  .command('eval')
  .description(
    'Evaluate deterministic Engine Run runtime checks. Use comet eval run for general Skill evals',
  );
```

- [ ] **Step 4: Verify GREEN**

Run the help tests again and confirm they pass.

### Task 4: Update User-Facing Docs and `/comet-any`

**Files:**

- Modify: `README-zh.md`
- Modify: `README.md`
- Modify: `docs/operations/SKILL-CREATION-ZH.md`
- Modify: `docs/operations/EVAL-USAGE-ZH.md`
- Modify: `assets/skills-zh/comet-any/SKILL.md`
- Modify: `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills/comet-any/SKILL.md`
- Modify: `assets/skills/comet-any/reference/bundle-authoring.md`
- Test: `test/ts/comet-any-skill.test.ts`
- Test: `test/ts/readme.test.ts`

**Interfaces:**

- Consumes: new `comet publish` CLI surface.
- Produces: user-facing docs where `/comet-any -> comet eval -> comet publish` is the normal path and `comet bundle` is advanced backend.

- [ ] **Step 1: Write failing docs tests**

Update tests so they expect:

```ts
expect(combined).toContain('comet publish status');
expect(combined).toContain('comet publish review');
expect(combined).toContain('comet publish run');
expect(combined).toContain('comet publish distribute');
expect(readmeZh).toContain('`comet publish`');
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts test/ts/readme.test.ts
```

Expected: fail until docs are updated.

- [ ] **Step 3: Update docs and Skills**

Replace ordinary-user instructions that say `comet bundle review-summary/publish/distribute` with `comet publish review/run/distribute`. Keep backend sections mentioning `comet bundle` as advanced/internal deterministic backend.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts test/ts/readme.test.ts
```

Expected: pass.

### Task 5: Changelog and Final Verification

**Files:**

- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: current `package.json` version.
- Produces: English changelog entry for the user-visible CLI mental model change.

- [ ] **Step 1: Update changelog**

Under the current unreleased version, add:

```md
### Added

- **Publish CLI facade**: Added `comet publish` as the user-facing release path for `/comet-any` publish candidates while keeping `comet bundle` as the advanced backend.

### Changed

- **CLI mental model**: Clarified Skill, Eval, Publish, and Bundle command boundaries in help text and docs so users do not need to learn Bundle internals for the normal `/comet-any` flow.
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
npx vitest run test/domains/bundle/publish-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts test/ts/comet-any-skill.test.ts test/ts/readme.test.ts
pnpm build
pnpm format:check
pnpm lint
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Commit**

Run:

```bash
git add app/cli/index.ts app/commands/publish.ts test/domains/bundle/publish-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts test/ts/comet-any-skill.test.ts test/ts/readme.test.ts README-zh.md README.md docs/operations/SKILL-CREATION-ZH.md docs/operations/EVAL-USAGE-ZH.md assets/skills-zh/comet-any/SKILL.md assets/skills-zh/comet-any/reference/bundle-authoring.md assets/skills/comet-any/SKILL.md assets/skills/comet-any/reference/bundle-authoring.md CHANGELOG.md docs/superpowers/plans/2026-06-23-comet-cli-mental-model.md
git commit -m "feat: add publish CLI facade"
```
