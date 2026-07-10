# Comet Runtime Classic Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the current internal Classic control package from top-level `comet-classic` into `comet/runtime/classic`, remove its `SKILL.md`, and keep ordinary user Skills plus existing Classic Runs compatible.

**Architecture:** Add a YAML-only runtime package loader next to the existing user Skill loader instead of weakening `loadSkillPackage()`. Runtime package snapshots skip `SKILL.md`, while existing migrated Runs can still validate their own immutable old snapshots when their stored hash differs from the newly installed runtime package. The Classic runtime lookup prefers `comet/runtime/classic`, keeps old paths as compatibility fallbacks, and user command names stay unchanged.

**Tech Stack:** TypeScript, Node.js ESM, YAML parser, Vitest, esbuild classic runtime bundle, Comet asset manifest.

---

## File Structure

- Modify: `domains/skill/types.ts`
  - Add a lightweight package kind marker so snapshot logic can distinguish ordinary Skills from YAML-only runtime packages.
- Modify: `domains/skill/load.ts`
  - Keep `loadSkillPackage()` strict with `SKILL.md`.
  - Add `loadRuntimePackage()` for root-level `skill.yaml`, `guardrails.yaml`, and `checks.yaml`.
  - Teach `loadSkillPackageDocument()` to restore the package kind from snapshots.
- Modify: `domains/skill/snapshot.ts`
  - Skip `SKILL.md` only for runtime packages.
  - Persist `packageKind: runtime` in runtime snapshot `package.json`.
- Modify: `domains/comet-classic/classic-runtime-run.ts`
  - Prefer `COMET_RUNTIME_CLASSIC_ROOT` and `assets/skills/comet/runtime/classic`.
  - Retain `COMET_CLASSIC_SKILL_ROOT` and old `assets/skills/comet-classic` fallback.
  - Load new layout with `loadRuntimePackage()` and old layout with `loadSkillPackage()`.
- Modify: `domains/comet-classic/classic-migrate.ts`
  - For existing Runs, accept a valid existing snapshot when the installed runtime package hash differs.
  - New migrations continue to snapshot the currently installed runtime package.
- Move/Delete:
  - Move `assets/skills/comet-classic/comet/*.yaml` to `assets/skills/comet/runtime/classic/*.yaml`.
  - Move `assets/skills-zh/comet-classic/comet/*.yaml` to `assets/skills-zh/comet/runtime/classic/*.yaml`.
  - Delete both old `comet-classic/SKILL.md` files.
- Modify: `assets/manifest.json`
  - Replace `comet-classic/...` internal paths with `comet/runtime/classic/...`.
- Modify tests:
  - `test/domains/skill/skill-load.test.ts`
  - `test/domains/skill/skill-snapshot.test.ts`
  - `test/domains/skill/internal-skills.test.ts`
  - `test/domains/comet-classic/comet-classic-package.test.ts`
  - `test/domains/comet-classic/classic-migrate.test.ts`
  - `test/helpers/comet-test-utils.ts`
  - Classic script tests that define `classicSkillRoot`.
- Modify benchmark/eval mirrors:
  - `scripts/benchmark/classic-baseline-regression.mjs`
  - `eval/local/skills/benchmarks/comet/scripts/comet-runtime.mjs`
  - `eval/local/skills/benchmarks/comet/runtime/classic/*.yaml`
  - `eval/local/treatments/comet/comet_full.yaml` comments or runtime asset hints if needed.
- Modify docs/changelog after implementation:
  - `CHANGELOG.md`
  - README/architecture references only when they mention top-level `comet-classic`.

## Task 1: Add YAML-Only Runtime Package Loading

**Files:**
- Modify: `domains/skill/types.ts`
- Modify: `domains/skill/load.ts`
- Test: `test/domains/skill/skill-load.test.ts`

- [ ] **Step 1: Write failing loader tests**

Append these tests inside `describe('loadSkillPackage', () => { ... })` in `test/domains/skill/skill-load.test.ts`, and update the import to include `loadRuntimePackage`:

```ts
import { loadRuntimePackage, loadSkillPackage } from '../../../domains/skill/load.js';
```

Add these test cases near the existing default-loading tests:

```ts
  it('keeps ordinary Skill packages strict about SKILL.md', async () => {
    await fs.rm(path.join(skillRoot, 'SKILL.md'));

    await expect(loadSkillPackage(skillRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('loads a YAML-only runtime package from root-level control files', async () => {
    const runtimeRoot = path.join(tmpDir, 'runtime', 'classic');
    await fs.mkdir(runtimeRoot, { recursive: true });
    await fs.writeFile(path.join(runtimeRoot, 'skill.yaml'), skillDefinition);
    await fs.writeFile(
      path.join(runtimeRoot, 'guardrails.yaml'),
      `allowedSkills:
  - writing-plans
allowedAgents: []
allowedTools: []
maxIterations: 12
maxRetriesPerAction: 2
confirmationRequiredFor: []
`,
    );
    await fs.writeFile(
      path.join(runtimeRoot, 'checks.yaml'),
      `runtime:
  - id: completed
    scope: completion
    type: state_equals
    field: status
    equals: completed
`,
    );

    const pkg = await loadRuntimePackage(runtimeRoot);

    expect(pkg.packageKind).toBe('runtime');
    expect(pkg.root).toBe(path.resolve(runtimeRoot));
    expect(pkg.definition.metadata.name).toBe('demo');
    expect(pkg.guardrails).toMatchObject({
      allowedSkills: ['writing-plans'],
      maxIterations: 12,
      maxRetriesPerAction: 2,
    });
    expect(pkg.evals).toContainEqual({
      id: 'completed',
      scope: 'completion',
      type: 'state_equals',
      field: 'status',
      equals: 'completed',
    });
  });

  it('rejects legacy evals.yaml in YAML-only runtime packages', async () => {
    const runtimeRoot = path.join(tmpDir, 'runtime-evals');
    await fs.mkdir(runtimeRoot, { recursive: true });
    await fs.writeFile(path.join(runtimeRoot, 'skill.yaml'), skillDefinition);
    await fs.writeFile(path.join(runtimeRoot, 'evals.yaml'), 'runtime: []\n');

    await expect(loadRuntimePackage(runtimeRoot)).rejects.toThrow(
      /evals\.yaml is no longer supported.*checks\.yaml/,
    );
  });
```

- [ ] **Step 2: Run loader tests and verify failure**

Run:

```bash
npx vitest run test/domains/skill/skill-load.test.ts
```

Expected: FAIL because `loadRuntimePackage` is not exported and `SkillPackage` has no `packageKind`.

- [ ] **Step 3: Add the package kind type**

Modify `domains/skill/types.ts`:

```ts
export type SkillPackageKind = 'skill' | 'runtime';
```

Change `SkillPackage` to:

```ts
export interface SkillPackage {
  root: string;
  packageKind?: SkillPackageKind;
  definition: SkillDefinition;
  guardrails: GuardrailDefinition;
  evals: RuntimeEvalDefinition[];
}
```

The marker is optional so existing object literals in tests and engine code keep compiling; missing means ordinary Skill package.

- [ ] **Step 4: Refactor package loading with an explicit layout**

In `domains/skill/load.ts`, add this helper after `readRuntimeChecks`:

```ts
async function loadPackageFromLayout(options: {
  root: string;
  controlRoot: string;
  packageKind: 'skill' | 'runtime';
  requireSkillMarkdown: boolean;
}): Promise<SkillPackage> {
  const packageRoot = path.resolve(options.root);
  const controlRoot = path.resolve(options.controlRoot);

  if (options.requireSkillMarkdown) {
    await fs.access(path.join(packageRoot, 'SKILL.md'));
  }

  const skillPath = path.join(controlRoot, 'skill.yaml');
  const guardrailsPath = path.join(controlRoot, 'guardrails.yaml');
  const definition = narrowSkillDefinition(await readYaml(skillPath), skillPath);
  const rawGuardrails = await readOptionalYaml(guardrailsPath);
  const guardrailDocument =
    rawGuardrails === null ? null : narrowGuardrails(rawGuardrails, guardrailsPath);
  const runtimeChecks = await readRuntimeChecks(controlRoot);

  const defaultGuardrails: GuardrailDefinition = {
    allowedSkills: definition.skills.map((skill) => skill.id),
    allowedAgents: definition.agents.map((agent) => agent.id),
    allowedTools: definition.tools.map((tool) => tool.id),
    maxIterations: 50,
    maxRetriesPerAction: 3,
    confirmationRequiredFor: definition.tools
      .filter((tool) => tool.requiresConfirmation)
      .map((tool) => tool.id),
  };

  return {
    root: packageRoot,
    packageKind: options.packageKind === 'runtime' ? 'runtime' : undefined,
    definition,
    guardrails: {
      ...defaultGuardrails,
      ...guardrailDocument,
    },
    evals: runtimeChecks.document?.runtime ?? [],
  };
}
```

Replace `loadSkillPackage()` with:

```ts
export async function loadSkillPackage(root: string): Promise<SkillPackage> {
  const packageRoot = path.resolve(root);
  return loadPackageFromLayout({
    root: packageRoot,
    controlRoot: path.join(packageRoot, 'comet'),
    packageKind: 'skill',
    requireSkillMarkdown: true,
  });
}
```

Add the runtime loader:

```ts
export async function loadRuntimePackage(root: string): Promise<SkillPackage> {
  const packageRoot = path.resolve(root);
  return loadPackageFromLayout({
    root: packageRoot,
    controlRoot: packageRoot,
    packageKind: 'runtime',
    requireSkillMarkdown: false,
  });
}
```

- [ ] **Step 5: Restore package kind from snapshot documents**

In `loadSkillPackageDocument()`, read the marker before returning:

```ts
  const packageKind = document.packageKind === 'runtime' ? 'runtime' : undefined;
```

Return it:

```ts
  return {
    root: path.resolve(root),
    packageKind,
    definition,
    guardrails: {
      ...defaultGuardrails,
      ...guardrailDocument,
    },
    evals,
  };
```

- [ ] **Step 6: Run loader tests and verify pass**

Run:

```bash
npx vitest run test/domains/skill/skill-load.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add domains/skill/types.ts domains/skill/load.ts test/domains/skill/skill-load.test.ts
git commit -m "feat(skill): load yaml-only runtime packages"
```

## Task 2: Support Runtime Package Snapshots Without SKILL.md

**Files:**
- Modify: `domains/skill/snapshot.ts`
- Test: `test/domains/skill/skill-snapshot.test.ts`

- [ ] **Step 1: Write failing snapshot tests**

In `test/domains/skill/skill-snapshot.test.ts`, add this helper after `pkg()`:

```ts
const runtimePkg = (root: string): SkillPackage => ({
  ...pkg(root),
  packageKind: 'runtime',
});
```

Append these tests inside `describe('Skill snapshots', () => { ... })`:

```ts
  it('snapshots YAML-only runtime packages without SKILL.md', async () => {
    const runtimeRoot = path.join(root, 'runtime-classic');
    await fs.mkdir(runtimeRoot, { recursive: true });
    const value = runtimePkg(runtimeRoot);

    const snapshot = await createSkillSnapshot(value, changeDir);

    expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.access(path.join(snapshot.snapshotDir, 'SKILL.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const document = JSON.parse(
      await fs.readFile(path.join(snapshot.snapshotDir, 'package.json'), 'utf8'),
    );
    expect(document.packageKind).toBe('runtime');
  });

  it('restores runtime package snapshots without requiring SKILL.md', async () => {
    const runtimeRoot = path.join(root, 'runtime-restore');
    await fs.mkdir(runtimeRoot, { recursive: true });
    const value = runtimePkg(runtimeRoot);
    const snapshot = await createSkillSnapshot(value, changeDir);

    const restored = await readSkillSnapshot(changeDir, snapshot.hash);

    expect(restored.packageKind).toBe('runtime');
    expect(restored.definition.metadata.name).toBe(value.definition.metadata.name);
    await expect(fs.access(path.join(restored.root, 'SKILL.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('still rejects ordinary Skill snapshots when SKILL.md is missing', async () => {
    const value = pkg(path.join(root, 'skill'));
    await fs.rm(path.join(value.root, 'SKILL.md'));

    await expect(createSkillSnapshot(value, changeDir)).rejects.toThrow(
      'SKILL.md does not exist: SKILL.md',
    );
  });
```

- [ ] **Step 2: Run snapshot tests and verify failure**

Run:

```bash
npx vitest run test/domains/skill/skill-snapshot.test.ts
```

Expected: FAIL because `snapshotFiles()` always reads `SKILL.md`.

- [ ] **Step 3: Persist packageKind only for runtime packages**

In `domains/skill/snapshot.ts`, replace `packageDocument()` with:

```ts
function packageDocument(pkg: SkillPackage): unknown {
  return stable({
    ...(pkg.packageKind === 'runtime' ? { packageKind: 'runtime' } : {}),
    definition: pkg.definition,
    guardrails: pkg.guardrails,
    evals: pkg.evals,
  });
}
```

- [ ] **Step 4: Skip SKILL.md only for runtime packages**

Replace `snapshotFiles()` with:

```ts
async function snapshotFiles(pkg: SkillPackage): Promise<SnapshotFile[]> {
  const root = await fs.realpath(pkg.root);
  const files =
    pkg.packageKind === 'runtime' ? [] : [await readPackageFile(root, 'SKILL.md', 'SKILL.md')];
  for (const tool of pkg.definition.tools) {
    if (tool.kind !== 'script') continue;
    files.push(await readPackageFile(root, tool.source, `Script tool ${tool.id}`));
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}
```

- [ ] **Step 5: Run snapshot tests and verify pass**

Run:

```bash
npx vitest run test/domains/skill/skill-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add domains/skill/snapshot.ts test/domains/skill/skill-snapshot.test.ts
git commit -m "feat(skill): snapshot runtime packages without skill markdown"
```

## Task 3: Move Classic Runtime Assets Under comet/runtime/classic

**Files:**
- Move/Delete: `assets/skills/comet-classic/**`
- Move/Delete: `assets/skills-zh/comet-classic/**`
- Modify: `assets/manifest.json`
- Test: `test/domains/comet-classic/comet-classic-package.test.ts`
- Test: `test/domains/skill/internal-skills.test.ts`

- [ ] **Step 1: Update package contract tests to point at runtime/classic**

In `test/domains/comet-classic/comet-classic-package.test.ts`, change imports:

```ts
import { loadRuntimePackage } from '../../../domains/skill/load.js';
```

Replace the package roots:

```ts
const chinesePackageRoot = path.resolve('assets', 'skills-zh', 'comet', 'runtime', 'classic');
const englishPackageRoot = path.resolve('assets', 'skills', 'comet', 'runtime', 'classic');
```

Replace every `loadSkillPackage(...)` call with `loadRuntimePackage(...)`.

Replace the two documentation tests with file absence tests:

```ts
  it('is a YAML-only runtime package without a user-facing SKILL.md', async () => {
    await expect(fs.access(path.join(chinesePackageRoot, 'SKILL.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
```

and:

```ts
  it('is a YAML-only runtime package without a user-facing English SKILL.md', async () => {
    await expect(fs.access(path.join(englishPackageRoot, 'SKILL.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
```

Keep the assertions for metadata, stable steps, guardrails, and completion checks unchanged.

- [ ] **Step 2: Update internal manifest tests**

In `test/domains/skill/internal-skills.test.ts`, change the local manifest fixture to:

```ts
const manifest: Manifest = {
  version: '1.0.0',
  skills: ['comet/SKILL.md', 'comet-open/SKILL.md', 'comet/scripts/runtime.mjs'],
  internalSkills: ['comet/runtime/classic/skill.yaml'],
};
```

Update the expected managed paths:

```ts
    expect(getManagedSkillPaths(manifest)).toEqual([
      'comet/SKILL.md',
      'comet-open/SKILL.md',
      'comet/scripts/runtime.mjs',
      'comet/runtime/classic/skill.yaml',
    ]);
```

Update the shipped manifest assertion:

```ts
    expect(shipped.internalSkills).toEqual([
      'comet/runtime/classic/skill.yaml',
      'comet/runtime/classic/guardrails.yaml',
      'comet/runtime/classic/checks.yaml',
    ]);
    expect(getUserFacingSkillNames(shipped)).not.toContain('comet-classic');
    expect(getUserFacingSkillNames(shipped)).not.toContain('runtime');
```

- [ ] **Step 3: Run asset tests and verify failure before moving files**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-classic-package.test.ts test/domains/skill/internal-skills.test.ts
```

Expected: FAIL because `comet/runtime/classic` does not exist and manifest still points at `comet-classic`.

- [ ] **Step 4: Move English runtime YAML files**

Run:

```bash
mkdir -p assets/skills/comet/runtime/classic
git mv assets/skills/comet-classic/comet/skill.yaml assets/skills/comet/runtime/classic/skill.yaml
git mv assets/skills/comet-classic/comet/guardrails.yaml assets/skills/comet/runtime/classic/guardrails.yaml
git mv assets/skills/comet-classic/comet/checks.yaml assets/skills/comet/runtime/classic/checks.yaml
git rm assets/skills/comet-classic/SKILL.md
```

If the empty `assets/skills/comet-classic/comet` directory remains, remove it from the filesystem after `git mv` has moved all tracked files:

```bash
rmdir assets/skills/comet-classic/comet
rmdir assets/skills/comet-classic
```

- [ ] **Step 5: Move Chinese runtime YAML files**

Run:

```bash
mkdir -p assets/skills-zh/comet/runtime/classic
git mv assets/skills-zh/comet-classic/comet/skill.yaml assets/skills-zh/comet/runtime/classic/skill.yaml
git mv assets/skills-zh/comet-classic/comet/guardrails.yaml assets/skills-zh/comet/runtime/classic/guardrails.yaml
git mv assets/skills-zh/comet-classic/comet/checks.yaml assets/skills-zh/comet/runtime/classic/checks.yaml
git rm assets/skills-zh/comet-classic/SKILL.md
```

Remove empty directories if they remain:

```bash
rmdir assets/skills-zh/comet-classic/comet
rmdir assets/skills-zh/comet-classic
```

- [ ] **Step 6: Update shipped manifest**

In `assets/manifest.json`, replace:

```json
  "internalSkills": [
    "comet-classic/SKILL.md",
    "comet-classic/comet/skill.yaml",
    "comet-classic/comet/guardrails.yaml",
    "comet-classic/comet/checks.yaml"
  ],
```

with:

```json
  "internalSkills": [
    "comet/runtime/classic/skill.yaml",
    "comet/runtime/classic/guardrails.yaml",
    "comet/runtime/classic/checks.yaml"
  ],
```

- [ ] **Step 7: Run asset tests and verify pass**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-classic-package.test.ts test/domains/skill/internal-skills.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add assets/manifest.json assets/skills assets/skills-zh test/domains/comet-classic/comet-classic-package.test.ts test/domains/skill/internal-skills.test.ts
git commit -m "refactor(comet): move classic runtime package under comet runtime"
```

## Task 4: Update Classic Runtime Package Lookup

**Files:**
- Modify: `domains/comet-classic/classic-runtime-run.ts`
- Modify: `test/helpers/comet-test-utils.ts`
- Modify: `test/domains/comet-classic/comet-scripts.test.ts`
- Modify: `test/domains/comet-classic/comet-scripts-guard.test.ts`
- Modify: `test/domains/comet-classic/comet-scripts-hook-guard.test.ts`
- Modify: `test/domains/comet-classic/comet-scripts-recovery.test.ts`
- Modify: `test/domains/comet-classic/classic-contract.test.ts`
- Modify: `scripts/benchmark/classic-baseline-regression.mjs`

- [ ] **Step 1: Update test helpers to the new environment variable**

In `test/helpers/comet-test-utils.ts`, replace:

```ts
export const classicSkillRoot = path.resolve('assets', 'skills', 'comet-classic');
```

with:

```ts
export const classicRuntimeRoot = path.resolve(
  'assets',
  'skills',
  'comet',
  'runtime',
  'classic',
);
export const classicSkillRoot = classicRuntimeRoot;
```

Replace the env object in `runNode()` and `runHookGuard()` with:

```ts
    env: {
      ...process.env,
      COMET_RUNTIME_CLASSIC_ROOT: classicRuntimeRoot,
      COMET_CLASSIC_SKILL_ROOT: classicRuntimeRoot,
      ...env,
    },
```

In test files that define their own `classicSkillRoot`, change it to:

```ts
const classicRuntimeRoot = path.resolve('assets', 'skills', 'comet', 'runtime', 'classic');
const classicSkillRoot = classicRuntimeRoot;
```

and include both env variables when spawning scripts.

- [ ] **Step 2: Update benchmark runtime root**

In `scripts/benchmark/classic-baseline-regression.mjs`, replace:

```js
const CLASSIC_SKILL_ROOT = path.join(REPO_ROOT, 'assets', 'skills', 'comet-classic');
```

with:

```js
const CLASSIC_RUNTIME_ROOT = path.join(
  REPO_ROOT,
  'assets',
  'skills',
  'comet',
  'runtime',
  'classic',
);
```

Update the `env` block in `run()`:

```js
      COMET_RUNTIME_CLASSIC_ROOT: CLASSIC_RUNTIME_ROOT,
      COMET_CLASSIC_SKILL_ROOT: CLASSIC_RUNTIME_ROOT,
```

- [ ] **Step 3: Add runtime lookup tests**

In `test/domains/comet-classic/comet-scripts.test.ts`, add a test near the state command tests:

```ts
  it('loads the classic runtime package from COMET_RUNTIME_CLASSIC_ROOT', async () => {
    const result = runNode(tmpDir, stateScript, ['init', 'runtime-root', 'full'], {
      COMET_RUNTIME_CLASSIC_ROOT: classicRuntimeRoot,
      COMET_CLASSIC_SKILL_ROOT: '',
    });

    expect(result.status).toBe(0);
    const runState = await fs.readFile(
      path.join(tmpDir, 'openspec', 'changes', 'runtime-root', '.comet', 'run-state.json'),
      'utf8',
    );
    expect(JSON.parse(runState)).toMatchObject({ skill: 'comet-classic' });
  }, 20_000);
```

Add a fallback test:

```ts
  it('keeps COMET_CLASSIC_SKILL_ROOT as a compatibility fallback', async () => {
    const result = runNode(tmpDir, stateScript, ['init', 'legacy-root', 'full'], {
      COMET_RUNTIME_CLASSIC_ROOT: '',
      COMET_CLASSIC_SKILL_ROOT: classicRuntimeRoot,
    });

    expect(result.status).toBe(0);
  }, 20_000);
```

- [ ] **Step 4: Run classic script tests and verify failure**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-scripts.test.ts
```

Expected: FAIL because `classic-runtime-run.ts` still calls `loadSkillPackage()` on the old path.

- [ ] **Step 5: Implement new lookup and old-layout fallback**

In `domains/comet-classic/classic-runtime-run.ts`, change the import:

```ts
import { loadRuntimePackage, loadSkillPackage } from '../../domains/skill/load.js';
```

Add a file existence helper after `directoryExists()`:

```ts
async function fileExists(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
```

Replace `classicSkillRoot()` with:

```ts
async function classicRuntimeRoot(): Promise<string> {
  const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.COMET_RUNTIME_CLASSIC_ROOT,
    path.resolve(runtimeDirectory, '..', 'runtime', 'classic'),
    path.resolve(runtimeDirectory, '..', '..', 'comet', 'runtime', 'classic'),
    path.resolve(runtimeDirectory, '..', '..', 'assets', 'skills', 'comet', 'runtime', 'classic'),
    path.resolve('assets', 'skills', 'comet', 'runtime', 'classic'),
    process.env.COMET_CLASSIC_SKILL_ROOT,
    path.resolve(runtimeDirectory, '..', '..', 'comet-classic'),
    path.resolve(runtimeDirectory, '..', '..', 'assets', 'skills', 'comet-classic'),
    path.resolve('assets', 'skills', 'comet-classic'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await directoryExists(candidate)) return candidate;
  }
  throw new Error('Comet classic runtime package is not installed');
}
```

Add a loader helper:

```ts
async function loadClassicRuntimePackage(root: string) {
  if (await fileExists(path.join(root, 'skill.yaml'))) {
    return loadRuntimePackage(root);
  }
  return loadSkillPackage(root);
}
```

Update `ensureClassicRuntimeRun()`:

```ts
export async function ensureClassicRuntimeRun(changeDir: string): Promise<ClassicRunContext> {
  const root = await classicRuntimeRoot();
  return ensureClassicRun(changeDir, {
    skillPackage: await loadClassicRuntimePackage(root),
  });
}
```

- [ ] **Step 6: Run classic script tests and verify pass**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-scripts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add domains/comet-classic/classic-runtime-run.ts test/helpers/comet-test-utils.ts test/domains/comet-classic scripts/benchmark/classic-baseline-regression.mjs
git commit -m "fix(classic): resolve classic runtime package from comet runtime"
```

## Task 5: Preserve Existing Run Snapshot Compatibility

**Files:**
- Modify: `domains/comet-classic/classic-migrate.ts`
- Test: `test/domains/comet-classic/classic-migrate.test.ts`

- [ ] **Step 1: Write failing compatibility test**

In `test/domains/comet-classic/classic-migrate.test.ts`, update imports:

```ts
import { createSkillSnapshot } from '../../../domains/skill/snapshot.js';
import type { RunState } from '../../../domains/engine/types.js';
```

Append this test inside `describe('Classic legacy migration', () => { ... })`:

```ts
  it('accepts an existing Run whose stored hash points to its immutable old snapshot', async () => {
    await writeClassicState(changeDir, { classic: classic(), run: null });
    const first = await ensureClassicRun(changeDir, {
      skillPackage: pkg,
      runId: () => 'run-existing-snapshot',
      now: () => new Date('2026-06-14T00:00:00.000Z'),
    });

    const runtimeRoot = path.join(projectRoot, 'runtime-package');
    await fs.mkdir(runtimeRoot, { recursive: true });
    const runtimePackage: SkillPackage = {
      ...classicPackage(runtimeRoot),
      packageKind: 'runtime',
    };

    const second = await ensureClassicRun(changeDir, {
      skillPackage: runtimePackage,
      now: () => new Date('2026-06-15T00:00:00.000Z'),
    });

    expect(second.migrated).toBe(false);
    expect(second.run.runId).toBe(first.run.runId);
    expect(second.run.skillHash).toBe(first.run.skillHash);
    expect(second.snapshotDir).toBe(path.join(changeDir, '.comet', 'skill-snapshots', first.run.skillHash));
  });
```

If TypeScript reports an unused import, remove `RunState`; the test only needs `createSkillSnapshot` if the final assertion is expanded to inspect the snapshot directly.

- [ ] **Step 2: Run migration tests and verify failure**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-migrate.test.ts
```

Expected: FAIL with `Classic Run snapshot hash does not match the installed Skill package`.

- [ ] **Step 3: Implement existing snapshot validation**

In `domains/comet-classic/classic-migrate.ts`, update imports:

```ts
import {
  createSkillSnapshot,
  hashSkillPackage,
  readSkillSnapshot,
} from '../../domains/skill/snapshot.js';
```

Inside the `if (projection.run) { ... }` branch, replace:

```ts
    const snapshot = await createSkillSnapshot(options.skillPackage, changeDir);
    if (snapshot.hash !== projection.run.skillHash) {
      throw new Error('Classic Run snapshot hash does not match the installed Skill package');
    }
    return {
      classic,
      run: projection.run,
      evidence: await collectClassicEvidence(changeDir, projection),
      migrated: false,
      snapshotDir: snapshot.snapshotDir,
    };
```

with:

```ts
    const installedHash = await hashSkillPackage(options.skillPackage);
    if (installedHash !== projection.run.skillHash) {
      await readSkillSnapshot(changeDir, projection.run.skillHash);
      return {
        classic,
        run: projection.run,
        evidence: await collectClassicEvidence(changeDir, projection),
        migrated: false,
        snapshotDir: path.join(changeDir, '.comet', 'skill-snapshots', projection.run.skillHash),
      };
    }

    const snapshot = await createSkillSnapshot(options.skillPackage, changeDir);
    return {
      classic,
      run: projection.run,
      evidence: await collectClassicEvidence(changeDir, projection),
      migrated: false,
      snapshotDir: snapshot.snapshotDir,
    };
```

This keeps existing Runs stable when the installed runtime package is intentionally repackaged, while still failing closed if the stored snapshot is missing or corrupt.

- [ ] **Step 4: Run migration tests and verify pass**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-migrate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add domains/comet-classic/classic-migrate.ts test/domains/comet-classic/classic-migrate.test.ts
git commit -m "fix(classic): preserve existing run snapshots across runtime repackaging"
```

## Task 6: Rebuild Runtime Bundle and Sync Eval Mirror

**Files:**
- Modify generated: `assets/skills/comet/scripts/comet-runtime.mjs`
- Modify mirror: `eval/local/skills/benchmarks/comet/scripts/comet-runtime.mjs`
- Create/Modify mirror: `eval/local/skills/benchmarks/comet/runtime/classic/*.yaml`
- Modify: `eval/local/treatments/comet/comet_full.yaml`
- Test: `test/domains/comet-classic/classic-runtime.test.ts`

- [ ] **Step 1: Rebuild classic runtime bundle**

Run:

```bash
pnpm build:classic-runtime
```

Expected: exits 0 and rewrites `assets/skills/comet/scripts/comet-runtime.mjs`.

- [ ] **Step 2: Verify generated runtime freshness**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-runtime.test.ts
```

Expected: PASS, including the `build-classic-runtime.mjs --check` assertion.

- [ ] **Step 3: Sync eval benchmark runtime script**

Copy the generated runtime bundle into the eval benchmark mirror:

```bash
cp assets/skills/comet/scripts/comet-runtime.mjs eval/local/skills/benchmarks/comet/scripts/comet-runtime.mjs
```

If Windows PowerShell is used:

```powershell
Copy-Item assets\skills\comet\scripts\comet-runtime.mjs eval\local\skills\benchmarks\comet\scripts\comet-runtime.mjs
```

- [ ] **Step 4: Sync eval benchmark runtime package assets**

Create the mirror directory and copy YAML files:

```bash
mkdir -p eval/local/skills/benchmarks/comet/runtime/classic
cp assets/skills/comet/runtime/classic/skill.yaml eval/local/skills/benchmarks/comet/runtime/classic/skill.yaml
cp assets/skills/comet/runtime/classic/guardrails.yaml eval/local/skills/benchmarks/comet/runtime/classic/guardrails.yaml
cp assets/skills/comet/runtime/classic/checks.yaml eval/local/skills/benchmarks/comet/runtime/classic/checks.yaml
```

PowerShell equivalent:

```powershell
New-Item -ItemType Directory -Force eval\local\skills\benchmarks\comet\runtime\classic
Copy-Item assets\skills\comet\runtime\classic\skill.yaml eval\local\skills\benchmarks\comet\runtime\classic\skill.yaml
Copy-Item assets\skills\comet\runtime\classic\guardrails.yaml eval\local\skills\benchmarks\comet\runtime\classic\guardrails.yaml
Copy-Item assets\skills\comet\runtime\classic\checks.yaml eval\local\skills\benchmarks\comet\runtime\classic\checks.yaml
```

- [ ] **Step 5: Update eval treatment comment**

In `eval/local/treatments/comet/comet_full.yaml`, change:

```yaml
    # Main dispatcher (carries scripts/ with the .mjs launchers + runtime bundle)
```

to:

```yaml
    # Main dispatcher (carries scripts/ with the .mjs launchers, runtime bundle, and runtime/classic control package)
```

- [ ] **Step 6: Run benchmark smoke**

Run:

```bash
pnpm run benchmark:classic
```

Expected: JSON report exits 0 with:

```json
"transitionAccuracy": 1,
"migrationSuccessRate": 1,
"idempotencyRate": 1,
"contractMatchRate": 1
```

- [ ] **Step 7: Commit Task 6**

```bash
git add assets/skills/comet/scripts/comet-runtime.mjs eval/local/skills/benchmarks/comet eval/local/treatments/comet/comet_full.yaml
git commit -m "build(classic): sync runtime bundle and eval mirror"
```

## Task 7: Update Documentation References and Changelog

**Files:**
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Search for top-level comet-classic references**

Run:

```bash
rg -n "assets/skills/comet-classic|assets\\\\skills\\\\comet-classic|comet-classic/SKILL.md|comet-classic/comet" README.md README-zh.md docs assets test scripts domains eval -S
```

Expected: output lists only references that need migration or historical references under old completed specs/plans.

- [ ] **Step 2: Keep historical specs unchanged**

Do not edit old `docs/superpowers/specs/*` or `docs/superpowers/plans/*` references that describe already completed historical work. They are archival records.

- [ ] **Step 3: Update user-facing README examples only if they imply a top-level Skill**

If `README.md` or `README-zh.md` says `skill: comet-classic # Resolved Skill package name`, change the comment to clarify it is machine-owned runtime identity:

English:

```yaml
skill: comet-classic # Machine-owned Classic runtime identity
```

Chinese:

```yaml
skill: comet-classic # 机器维护的 Classic runtime 身份
```

Do not add `/comet-native`, `/comet-openspec`, or mode-switching documentation in this task.

- [ ] **Step 4: Update architecture wording**

In `docs/architecture/ARCHITECTURE.md`, replace wording that says top-level `comet-classic` Skill Package with wording like:

```md
- **内部确定性化**：`comet/runtime/classic` runtime package 用确定性 Resolver 覆盖 full/hotfix/tweak，冻结 0.3.8 行为契约做差分测试，保证升级不漂移
```

- [ ] **Step 5: Update Changelog under the current version**

In `CHANGELOG.md`, under the current `## What's Changed [0.4.0-beta.1] - ...` entry, add a `### Changed` bullet if one does not already cover this final behavior:

```md
- **Classic runtime packaging**: Moves the internal Classic control package under `comet/runtime/classic` and makes it YAML-only, so installed assets no longer expose a top-level Skill-like `comet-classic` directory while existing `/comet*` commands keep the same behavior.
```

Do not bump `package.json` unless `git show master:package.json` shows master already has `0.4.0-beta.1` or higher.

- [ ] **Step 6: Commit Task 7**

```bash
git add README.md README-zh.md docs/architecture/ARCHITECTURE.md CHANGELOG.md
git commit -m "docs: clarify classic runtime package layout"
```

## Task 8: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused loader and manifest tests**

Run:

```bash
npx vitest run test/domains/skill/skill-load.test.ts test/domains/skill/skill-snapshot.test.ts test/domains/skill/internal-skills.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused Classic package and migration tests**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-classic-package.test.ts test/domains/comet-classic/classic-migrate.test.ts test/domains/comet-classic/classic-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run Classic script contract tests**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-scripts.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run comet-any contract tests**

Run:

```bash
npx vitest run test/domains/bundle/comet-any-skill.test.ts test/domains/bundle/comet-any-skill-contract.test.ts
```

Expected: PASS. This confirms generated internal skills remain separate from built-in runtime packages.

- [ ] **Step 5: Run repository checks**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
npx vitest run
```

Expected: all commands exit 0.

- [ ] **Step 6: Inspect remaining references**

Run:

```bash
rg -n "assets/skills/comet-classic|assets\\\\skills\\\\comet-classic|comet-classic/SKILL.md|comet-classic/comet" assets domains test scripts eval README.md README-zh.md docs/architecture CHANGELOG.md -S
```

Expected: no active runtime, asset, test, benchmark, README, architecture, or changelog references to the old top-level package paths. Historical specs/plans may still contain old paths and do not need edits.

- [ ] **Step 7: Commit final verification fixes**

If any verification command required small fixes:

```bash
git add <fixed-files>
git commit -m "test: cover classic runtime package relocation"
```

If no fixes were needed, do not create an empty commit.
