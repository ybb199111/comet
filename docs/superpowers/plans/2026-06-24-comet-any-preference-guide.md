# Comet Any Preference Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the project-level Skill preference guide for `/comet-any`, replacing the unpublished `.comet/skills.txt` user path with `.comet/skill-preferences.yaml`, inventory-driven recommendations, proposal confirmation, and preference-aware readiness.

**Architecture:** Add a narrow `domains/skill` preference and inventory layer, then thread that normalized model through Bundle Factory plan initialization, proposal preview, generated evidence, and review summary. Keep Bundle authoring state as the publish/distribute source of truth; do not add a second lifecycle state model. Update Chinese docs/Skill first, then English parity.

**Tech Stack:** TypeScript, Vitest, YAML parsing via `yaml`, Commander CLI, existing `domains/bundle/*`, `domains/factory/*`, `app/commands/*`, Markdown docs and Skill assets.

---

## Scope Check

This plan implements one vertical feature: project-level Skill preferences for `/comet-any`. It touches several modules, but each task produces a working, testable slice:

1. Parse `.comet/skill-preferences.yaml`.
2. Build user-facing Skill inventory.
3. Replace `.comet/skills.txt` default preference flow.
4. Add Factory proposal and metadata support.
5. Enforce advisory/strict policies in generation and review.
6. Update generated evidence, docs, and bilingual `/comet-any` guidance.

Historical design docs under `docs/superpowers/specs/` are not rewritten except for the new spec already created. Active user docs, README, Skill assets, tests, and runtime code are updated.

## File Structure

- Create `domains/skill/preferences.ts`
  - Parses and normalizes `.comet/skill-preferences.yaml`.
  - Exposes preference defaults, warnings, stable hash, and conversion to `SkillPreferenceEntry[]`.

- Create `domains/skill/inventory.ts`
  - Builds a user-facing inventory from `findPreferredSkills({ preferences: null })`.
  - Groups by Skill name, content hash, source platform, and capability group.

- Modify `domains/skill/find.ts`
  - Remove default `.comet/skills.txt` reading.
  - Preserve explicit `preferences` input and scan-all behavior.
  - Keep path traversal protections and deterministic hashing.

- Modify `domains/bundle/preferences.ts`
  - Bridge Bundle Factory to the new project preference model.
  - Return preferred Skill names plus mode, policies, required Skills, warnings, path, and hash.

- Modify `domains/bundle/types.ts`
  - Add preference metadata fields to `BundleFactoryMetadata`.
  - Add `BundleFactoryProposal` types.

- Modify `domains/bundle/factory-plan.ts`
  - Normalize plans against `.comet/skill-preferences.yaml`.
  - Preserve explicit plan `preferredSkills` when supplied.

- Create `domains/bundle/factory-proposal.ts`
  - Build a dry-run proposal without writing Bundle authoring state or draft files.
  - Reuse candidate discovery and composition logic.

- Modify `domains/bundle/factory.ts`
  - Thread preference metadata into Factory state.
  - Enforce scripts/hooks deny and strict required candidate blockers.
  - Save preference hash for drift detection.

- Modify `domains/bundle/review-summary.ts`
  - Surface preference hash, preference mode, policy blockers, and drift warnings/blockers.

- Modify `app/commands/bundle.ts` and `app/cli/index.ts`
  - Add `comet bundle factory-propose <name> --file <plan.json> --json` as `/comet-any` backend.
  - Update candidates command to use new preference source.

- Modify `domains/factory/package.ts`
  - Include preference source and policy evidence in `resolved-skills.json` and `composition-report.md`.

- Modify tests:
  - `test/domains/skill/skill-preferences.test.ts`
  - `test/domains/skill/skill-inventory.test.ts`
  - `test/domains/skill/skill-find.test.ts`
  - `test/domains/bundle/bundle-candidates.test.ts`
  - `test/domains/bundle/bundle-factory-plan.test.ts`
  - `test/domains/bundle/bundle-command.test.ts`
  - `test/domains/bundle/bundle-cli-e2e.test.ts`
  - `test/domains/bundle/bundle-review-summary.test.ts`
  - `test/domains/factory/factory-package.test.ts`
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
  - `README-zh.md`
  - `README.md`
  - `CHANGELOG.md`

---

### Task 1: Project Skill Preference Parser

**Files:**
- Create: `domains/skill/preferences.ts`
- Test: `test/domains/skill/skill-preferences.test.ts`

- [x] **Step 1: Write failing tests for normalized project preferences**

Create `test/domains/skill/skill-preferences.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  readProjectSkillPreferences,
  skillPreferenceEntries,
  normalizeSkillPreferencesDocument,
} from '../../../domains/skill/preferences.js';

describe('project skill preferences', () => {
  let root: string;
  let projectRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-skill-preferences-'));
    projectRoot = path.join(root, 'project');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns null when .comet/skill-preferences.yaml is missing', async () => {
    await expect(readProjectSkillPreferences(projectRoot)).resolves.toBeNull();
  });

  it('normalizes mode, preferences, required Skills, policies and hash', async () => {
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      `version: 1
mode: strict
prefer:
  - brainstorming
  - writing-plans
  - brainstorming
require:
  - verification-before-completion
policies:
  missing: fail
  ambiguous: ask
  deviation: fail
  scripts: disclose
  hooks: deny
`,
    );

    const result = await readProjectSkillPreferences(projectRoot);

    expect(result).toMatchObject({
      path: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
      preferences: {
        version: 1,
        mode: 'strict',
        prefer: ['brainstorming', 'writing-plans'],
        require: ['verification-before-completion'],
        policies: {
          missing: 'fail',
          ambiguous: 'ask',
          deviation: 'fail',
          scripts: 'disclose',
          hooks: 'deny',
        },
      },
      warnings: [
        {
          code: 'duplicate-prefer',
          message: 'Duplicate prefer Skill ignored: brainstorming',
          skill: 'brainstorming',
        },
      ],
    });
    expect(result?.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(skillPreferenceEntries(result!.preferences)).toEqual([
      { query: 'brainstorming', preferenceIndex: 0 },
      { query: 'writing-plans', preferenceIndex: 1 },
      { query: 'verification-before-completion', preferenceIndex: 2 },
    ]);
  });

  it('applies defaults for optional fields', () => {
    const result = normalizeSkillPreferencesDocument({ version: 1 }, '.comet/skill-preferences.yaml');

    expect(result).toEqual({
      preferences: {
        version: 1,
        mode: 'advisory',
        prefer: [],
        require: [],
        policies: {
          missing: 'ask',
          ambiguous: 'ask',
          deviation: 'explain',
          scripts: 'disclose',
          hooks: 'disclose',
        },
      },
      warnings: [],
    });
  });

  it('rejects invalid version, mode and policy values', () => {
    expect(() =>
      normalizeSkillPreferencesDocument({ version: 2 }, '.comet/skill-preferences.yaml'),
    ).toThrow(/version must be 1/iu);
    expect(() =>
      normalizeSkillPreferencesDocument(
        { version: 1, mode: 'locked' },
        '.comet/skill-preferences.yaml',
      ),
    ).toThrow(/mode must be advisory or strict/iu);
    expect(() =>
      normalizeSkillPreferencesDocument(
        { version: 1, policies: { hooks: 'maybe' } },
        '.comet/skill-preferences.yaml',
      ),
    ).toThrow(/policies\.hooks/iu);
  });

  it('warns on unknown fields without blocking v1 parsing', () => {
    const result = normalizeSkillPreferencesDocument(
      { version: 1, prefer: ['brainstorming'], extra: true },
      '.comet/skill-preferences.yaml',
    );

    expect(result.warnings).toEqual([
      {
        code: 'unknown-field',
        message: 'Unknown top-level field ignored: extra',
        field: 'extra',
      },
    ]);
  });
});
```

- [x] **Step 2: Run the failing parser tests**

Run:

```bash
npx vitest run test/domains/skill/skill-preferences.test.ts
```

Expected: FAIL because `domains/skill/preferences.ts` does not exist.

- [x] **Step 3: Implement `domains/skill/preferences.ts`**

Create `domains/skill/preferences.ts`:

```ts
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'yaml';
import type { SkillPreferenceEntry } from './find.js';

export type SkillPreferenceMode = 'advisory' | 'strict';
export type MissingSkillPolicy = 'ask' | 'fail';
export type AmbiguousSkillPolicy = 'ask' | 'fail';
export type DeviationPolicy = 'explain' | 'fail';
export type CapabilityPolicy = 'allow' | 'disclose' | 'deny';

export interface SkillPreferencePolicies {
  missing: MissingSkillPolicy;
  ambiguous: AmbiguousSkillPolicy;
  deviation: DeviationPolicy;
  scripts: CapabilityPolicy;
  hooks: CapabilityPolicy;
}

export interface NormalizedSkillPreferences {
  version: 1;
  mode: SkillPreferenceMode;
  prefer: string[];
  require: string[];
  policies: SkillPreferencePolicies;
}

export type SkillPreferenceWarning =
  | { code: 'duplicate-prefer' | 'duplicate-require'; message: string; skill: string }
  | { code: 'unknown-field'; message: string; field: string };

export interface NormalizedSkillPreferenceDocument {
  preferences: NormalizedSkillPreferences;
  warnings: SkillPreferenceWarning[];
}

export interface ProjectSkillPreferences extends NormalizedSkillPreferenceDocument {
  path: string;
  hash: string;
}

const DEFAULT_POLICIES: SkillPreferencePolicies = {
  missing: 'ask',
  ambiguous: 'ask',
  deviation: 'explain',
  scripts: 'disclose',
  hooks: 'disclose',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertStringArray(value: unknown, file: string, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${file}: ${field} must be a string array`);
  const invalid = value.findIndex((item) => typeof item !== 'string' || item.length === 0);
  if (invalid !== -1) throw new Error(`${file}: ${field}[${invalid}] must be a non-empty string`);
  return value;
}

function dedupeSkills(
  values: string[],
  code: 'duplicate-prefer' | 'duplicate-require',
  label: 'prefer' | 'require',
  warnings: SkillPreferenceWarning[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      warnings.push({
        code,
        message: `Duplicate ${label} Skill ignored: ${value}`,
        skill: value,
      });
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function policyValue<T extends string>(
  value: unknown,
  file: string,
  field: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${file}: ${field} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

export function normalizeSkillPreferencesDocument(
  value: unknown,
  file = '.comet/skill-preferences.yaml',
): NormalizedSkillPreferenceDocument {
  if (!isRecord(value)) throw new Error(`${file}: document must be an object`);
  if (value.version !== 1) throw new Error(`${file}: version must be 1`);

  const warnings: SkillPreferenceWarning[] = [];
  for (const key of Object.keys(value)) {
    if (!['version', 'mode', 'prefer', 'require', 'policies'].includes(key)) {
      warnings.push({
        code: 'unknown-field',
        message: `Unknown top-level field ignored: ${key}`,
        field: key,
      });
    }
  }

  const mode = policyValue(value.mode, file, 'mode', ['advisory', 'strict'] as const, 'advisory');
  const policiesRecord = isRecord(value.policies) ? value.policies : {};
  const policies: SkillPreferencePolicies = {
    missing: policyValue(
      policiesRecord.missing,
      file,
      'policies.missing',
      ['ask', 'fail'] as const,
      DEFAULT_POLICIES.missing,
    ),
    ambiguous: policyValue(
      policiesRecord.ambiguous,
      file,
      'policies.ambiguous',
      ['ask', 'fail'] as const,
      DEFAULT_POLICIES.ambiguous,
    ),
    deviation: policyValue(
      policiesRecord.deviation,
      file,
      'policies.deviation',
      ['explain', 'fail'] as const,
      DEFAULT_POLICIES.deviation,
    ),
    scripts: policyValue(
      policiesRecord.scripts,
      file,
      'policies.scripts',
      ['allow', 'disclose', 'deny'] as const,
      DEFAULT_POLICIES.scripts,
    ),
    hooks: policyValue(
      policiesRecord.hooks,
      file,
      'policies.hooks',
      ['allow', 'disclose', 'deny'] as const,
      DEFAULT_POLICIES.hooks,
    ),
  };

  const prefer = dedupeSkills(
    assertStringArray(value.prefer, file, 'prefer'),
    'duplicate-prefer',
    'prefer',
    warnings,
  );
  const required = dedupeSkills(
    assertStringArray(value.require, file, 'require'),
    'duplicate-require',
    'require',
    warnings,
  );

  return {
    preferences: { version: 1, mode, prefer, require: required, policies },
    warnings,
  };
}

export function skillPreferenceEntries(
  preferences: NormalizedSkillPreferences,
): SkillPreferenceEntry[] {
  const seen = new Set<string>();
  const entries: SkillPreferenceEntry[] = [];
  for (const query of [...preferences.prefer, ...preferences.require]) {
    if (seen.has(query)) continue;
    seen.add(query);
    entries.push({ query, preferenceIndex: entries.length });
  }
  return entries;
}

export function skillPreferencesPath(projectRoot: string): string {
  return path.resolve(projectRoot, '.comet', 'skill-preferences.yaml');
}

export async function readProjectSkillPreferences(
  projectRoot: string,
): Promise<ProjectSkillPreferences | null> {
  const file = skillPreferencesPath(projectRoot);
  let source: string;
  try {
    source = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const parsed = parse(source) as unknown;
  return {
    path: file,
    hash: createHash('sha256').update(source).digest('hex'),
    ...normalizeSkillPreferencesDocument(parsed, file),
  };
}
```

- [x] **Step 4: Run the parser tests**

Run:

```bash
npx vitest run test/domains/skill/skill-preferences.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit Task 1**

```bash
git add domains/skill/preferences.ts test/domains/skill/skill-preferences.test.ts
git commit -m "feat: add project skill preference parser"
```

---

### Task 2: Skill Finder Cleanup and Inventory

**Files:**
- Modify: `domains/skill/find.ts`
- Create: `domains/skill/inventory.ts`
- Modify: `test/domains/skill/skill-find.test.ts`
- Create: `test/domains/skill/skill-inventory.test.ts`

- [x] **Step 1: Update Skill finder tests to remove `.comet/skills.txt` default behavior**

Modify `test/domains/skill/skill-find.test.ts`:

- Remove the import and tests for `readSkillPreferenceEntries`.
- Add this test:

```ts
it('scans all Skill roots when preferences are omitted instead of reading .comet/skills.txt', async () => {
  await fs.writeFile(path.join(projectRoot, '.comet', 'skills.txt'), 'ignored-skill\n');
  await writeMarkdownSkill(
    path.join(projectRoot, '.codex', 'skills', 'actual-skill'),
    'actual-skill',
    'Actual project Skill.',
  );

  const result = await findPreferredSkills({
    projectRoot,
    homeDir,
    builtinRoot,
  });

  expect(result.map((skill) => skill.query)).toEqual(['actual-skill']);
  expect(result[0]).toMatchObject({
    preferenceIndex: null,
    status: 'available',
  });
});
```

- [x] **Step 2: Write failing inventory tests**

Create `test/domains/skill/skill-inventory.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { buildSkillInventory } from '../../../domains/skill/inventory.js';

async function writeSkill(root: string, name: string, description: string, extra = ''): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, 'SKILL.md'),
    `---
name: ${name}
description: ${description}
---

# ${name}

${extra}
`,
  );
}

describe('skill inventory', () => {
  let root: string;
  let projectRoot: string;
  let homeDir: string;
  let builtinRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-skill-inventory-'));
    projectRoot = path.join(root, 'project');
    homeDir = path.join(root, 'home');
    builtinRoot = path.join(root, 'builtin');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('groups scanned Skills into user-facing inventory items', async () => {
    await writeSkill(
      path.join(projectRoot, '.codex', 'skills', 'brainstorming'),
      'brainstorming',
      'Explore intent before implementation.',
    );
    await writeSkill(
      path.join(homeDir, '.codex', 'skills', 'verification-before-completion'),
      'verification-before-completion',
      'Verify evidence before completion.',
    );

    const inventory = await buildSkillInventory({ projectRoot, homeDir, builtinRoot });

    expect(inventory.map((item) => item.name)).toEqual([
      'brainstorming',
      'verification-before-completion',
    ]);
    expect(inventory[0]).toMatchObject({
      capabilityGroup: 'discovery',
      status: 'available',
      recommended: true,
      duplicateInstall: false,
    });
    expect(inventory[1]).toMatchObject({
      capabilityGroup: 'verification',
      status: 'available',
      recommended: true,
    });
  });

  it('marks same-name same-hash installs as duplicate installs', async () => {
    const source = `---
name: reviewing
description: Review code.
---

# reviewing
`;
    await fs.mkdir(path.join(projectRoot, '.codex', 'skills', 'reviewing'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, '.codex', 'skills', 'reviewing', 'SKILL.md'), source);
    await fs.mkdir(path.join(homeDir, '.codex', 'skills', 'reviewing'), { recursive: true });
    await fs.writeFile(path.join(homeDir, '.codex', 'skills', 'reviewing', 'SKILL.md'), source);

    const inventory = await buildSkillInventory({ projectRoot, homeDir, builtinRoot });

    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      name: 'reviewing',
      status: 'available',
      duplicateInstall: true,
    });
    expect(inventory[0].sources).toHaveLength(2);
    expect(inventory[0].hashes).toHaveLength(1);
  });

  it('marks same-name different-hash installs as ambiguous', async () => {
    await writeSkill(
      path.join(projectRoot, '.codex', 'skills', 'reviewing'),
      'reviewing',
      'Project reviewer.',
      'project',
    );
    await writeSkill(
      path.join(homeDir, '.codex', 'skills', 'reviewing'),
      'reviewing',
      'Global reviewer.',
      'global',
    );

    const inventory = await buildSkillInventory({ projectRoot, homeDir, builtinRoot });

    expect(inventory).toEqual([
      expect.objectContaining({
        name: 'reviewing',
        status: 'ambiguous',
        duplicateInstall: false,
        hashes: expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/u)]),
      }),
    ]);
    expect(inventory[0].hashes).toHaveLength(2);
  });
});
```

- [x] **Step 3: Run the failing finder and inventory tests**

Run:

```bash
npx vitest run test/domains/skill/skill-find.test.ts test/domains/skill/skill-inventory.test.ts
```

Expected: FAIL because finder still reads `.comet/skills.txt` and inventory does not exist.

- [x] **Step 4: Modify `domains/skill/find.ts`**

Remove `readSkillPreferenceEntries`. Change `findPreferredSkills` preference handling to:

```ts
  const preferences = options.preferences ?? null;
  const entries = preferences ?? (await discoveredPreferenceEntries(roots));
  const scannedMode = preferences === null;
```

Keep `SkillPreferenceEntry`, explicit path support, `discoveredPreferenceEntries`, `dedupeSources`, hashing, and traversal protections unchanged.

- [x] **Step 5: Implement `domains/skill/inventory.ts`**

Create `domains/skill/inventory.ts`:

```ts
import { findPreferredSkills, type FoundSkillSource } from './find.js';

export type SkillInventoryStatus = 'available' | 'ambiguous' | 'missing';

export interface SkillInventoryItem {
  name: string;
  description: string;
  capabilityGroup: string;
  sources: FoundSkillSource[];
  hashes: string[];
  status: SkillInventoryStatus;
  duplicateInstall: boolean;
  recommended: boolean;
  reason: string;
}

const RECOMMENDED = new Set([
  'brainstorming',
  'writing-plans',
  'systematic-debugging',
  'test-driven-development',
  'verification-before-completion',
  'requesting-code-review',
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function groupFor(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes('brainstorm') || text.includes('intent') || text.includes('clarif')) {
    return 'discovery';
  }
  if (text.includes('plan') || text.includes('tdd') || text.includes('implement')) {
    return 'planning';
  }
  if (text.includes('debug') || text.includes('fix')) return 'debugging';
  if (text.includes('review')) return 'review';
  if (text.includes('verify') || text.includes('completion')) return 'verification';
  if (text.includes('skill')) return 'skill-authoring';
  return 'other';
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

export async function buildSkillInventory(options: {
  projectRoot: string;
  homeDir?: string;
  builtinRoot?: string;
}): Promise<SkillInventoryItem[]> {
  const found = await findPreferredSkills({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    builtinRoot: options.builtinRoot,
    preferences: null,
  });

  return found
    .map((skill): SkillInventoryItem => {
      const hashes = uniqueSorted(skill.sources.map((source) => source.hash));
      const first = skill.sources[0];
      const status = hashes.length > 1 ? 'ambiguous' : skill.status;
      const duplicateInstall = skill.sources.length > 1 && hashes.length === 1;
      const recommended = RECOMMENDED.has(skill.query);
      return {
        name: skill.query,
        description: first?.description ?? '',
        capabilityGroup: groupFor(skill.query, first?.description ?? ''),
        sources: skill.sources,
        hashes,
        status,
        duplicateInstall,
        recommended,
        reason: recommended
          ? 'Recommended default Skill for Comet-style guided workflows.'
          : 'Discovered from supported local Skill roots.',
      };
    })
    .sort((left, right) => compareText(left.name, right.name));
}
```

- [x] **Step 6: Run finder and inventory tests**

Run:

```bash
npx vitest run test/domains/skill/skill-find.test.ts test/domains/skill/skill-inventory.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit Task 2**

```bash
git add domains/skill/find.ts domains/skill/inventory.ts test/domains/skill/skill-find.test.ts test/domains/skill/skill-inventory.test.ts
git commit -m "feat: add skill inventory discovery"
```

---

### Task 3: Bundle Preference Bridge

**Files:**
- Modify: `domains/bundle/preferences.ts`
- Modify: `domains/bundle/candidates.ts`
- Modify: `test/domains/bundle/bundle-candidates.test.ts`

- [x] **Step 1: Rewrite Bundle candidate tests around `.comet/skill-preferences.yaml`**

Modify `test/domains/bundle/bundle-candidates.test.ts`:

- Replace `.comet/skills.txt` fixture writes with `.comet/skill-preferences.yaml`.
- Add a test that `readBundleSkillPreferences(projectRoot)` returns preference metadata:

```ts
import { readBundleSkillPreferences } from '../../../domains/bundle/preferences.js';

it('reads project Skill preferences from .comet/skill-preferences.yaml', async () => {
  await fs.writeFile(
    path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    `version: 1
mode: strict
prefer:
  - brainstorming
  - writing-plans
require:
  - verification-before-completion
policies:
  missing: fail
`,
  );

  const result = await readBundleSkillPreferences(projectRoot);

  expect(result).toMatchObject({
    names: ['brainstorming', 'writing-plans', 'verification-before-completion'],
    preferences: {
      mode: 'strict',
      prefer: ['brainstorming', 'writing-plans'],
      require: ['verification-before-completion'],
      policies: expect.objectContaining({ missing: 'fail' }),
    },
    hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });
});
```

- Keep tests for explicit path sources, missing, ambiguous, and scan-all when preferences are absent.

- [x] **Step 2: Run failing Bundle candidate tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-candidates.test.ts
```

Expected: FAIL because `readBundleSkillPreferences` does not exist and `.comet/skills.txt` behavior changed.

- [x] **Step 3: Implement `domains/bundle/preferences.ts` bridge**

Replace the current file with:

```ts
import {
  readProjectSkillPreferences,
  skillPreferenceEntries,
  type NormalizedSkillPreferences,
  type SkillPreferenceWarning,
} from '../skill/preferences.js';

export interface BundleSkillPreferences {
  names: string[];
  preferences: NormalizedSkillPreferences;
  path: string;
  hash: string;
  warnings: SkillPreferenceWarning[];
}

export async function readBundleSkillPreferences(
  projectRoot: string,
): Promise<BundleSkillPreferences | null> {
  const projectPreferences = await readProjectSkillPreferences(projectRoot);
  if (!projectPreferences) return null;
  return {
    names: skillPreferenceEntries(projectPreferences.preferences).map((entry) => entry.query),
    preferences: projectPreferences.preferences,
    path: projectPreferences.path,
    hash: projectPreferences.hash,
    warnings: projectPreferences.warnings,
  };
}

export async function readSkillPreferences(projectRoot: string): Promise<string[] | null> {
  return (await readBundleSkillPreferences(projectRoot))?.names ?? null;
}
```

- [x] **Step 4: Keep `domains/bundle/candidates.ts` input contract stable**

Leave `discoverBundleCandidates({ preferences?: string[] | null })` stable. It should receive names from `readBundleSkillPreferences` or explicit plan values. No `.comet/skills.txt` reading should happen inside candidate discovery.

- [x] **Step 5: Run Bundle candidate tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-candidates.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit Task 3**

```bash
git add domains/bundle/preferences.ts domains/bundle/candidates.ts test/domains/bundle/bundle-candidates.test.ts
git commit -m "feat: read bundle preferences from project yaml"
```

---

### Task 4: Factory Metadata for Preferences

**Files:**
- Modify: `domains/bundle/types.ts`
- Modify: `domains/bundle/factory-plan.ts`
- Modify: `domains/bundle/factory.ts`
- Modify: `test/domains/bundle/bundle-factory-plan.test.ts`
- Modify: `test/domains/bundle/bundle-command.test.ts`

- [x] **Step 1: Add tests for project preference metadata in Factory state**

In `test/domains/bundle/bundle-command.test.ts`, add:

```ts
it('persists project Skill preference metadata in Factory state', async () => {
  await fs.writeFile(
    path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    `version: 1
mode: strict
prefer:
  - factory-alpha
require:
  - factory-beta
policies:
  missing: fail
  ambiguous: ask
  deviation: fail
  scripts: disclose
  hooks: disclose
`,
  );
  await writeFactorySkill(projectRoot, 'factory-alpha');
  await writeFactorySkill(projectRoot, 'factory-beta');
  const planFile = path.join(root, 'factory-preference-plan.json');
  await fs.writeFile(
    planFile,
    JSON.stringify(
      {
        goal: 'Create a preference-backed workflow.',
        callChain: ['factory-alpha'],
      },
      null,
      2,
    ),
  );

  await bundleFactoryInitCommand('preference-backed-factory', {
    project: projectRoot,
    file: planFile,
    json: true,
  });

  const state = await readBundleAuthoringState(projectRoot, 'preference-backed-factory');
  expect(state.factory).toMatchObject({
    preferredSkills: ['factory-alpha', 'factory-beta'],
    requiredSkills: ['factory-beta'],
    preferenceMode: 'strict',
    preferencePolicies: {
      missing: 'fail',
      ambiguous: 'ask',
      deviation: 'fail',
      scripts: 'disclose',
      hooks: 'disclose',
    },
    preferencePath: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    preferenceHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });
});
```

Add this strict policy test:

```ts
it('blocks Factory init when preferences deny generated scripts or hooks', async () => {
  await fs.writeFile(
    path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    `version: 1
mode: strict
prefer:
  - factory-alpha
policies:
  scripts: deny
  hooks: disclose
`,
  );
  await writeFactorySkill(projectRoot, 'factory-alpha');
  const planFile = path.join(root, 'factory-deny-scripts-plan.json');
  await fs.writeFile(
    planFile,
    JSON.stringify({ goal: 'Create a denied workflow.', callChain: ['factory-alpha'] }),
  );

  await expect(
    bundleFactoryInitCommand('deny-scripts-factory', {
      project: projectRoot,
      file: planFile,
      json: true,
    }),
  ).rejects.toThrow(/preference policy denies scripts/iu);
});
```

- [x] **Step 2: Run failing Factory tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-factory-plan.test.ts test/domains/bundle/bundle-command.test.ts -t "preference|denies"
```

Expected: FAIL because metadata fields and policy enforcement do not exist.

- [x] **Step 3: Extend `BundleFactoryMetadata`**

Modify `domains/bundle/types.ts` imports and interface:

```ts
import type {
  NormalizedSkillPreferences,
  SkillPreferencePolicies,
  SkillPreferenceWarning,
} from '../skill/preferences.js';
```

Add fields to `BundleFactoryMetadata`:

```ts
  requiredSkills?: string[];
  preferenceMode?: NormalizedSkillPreferences['mode'];
  preferencePolicies?: SkillPreferencePolicies;
  preferencePath?: string;
  preferenceHash?: string;
  preferenceWarnings?: SkillPreferenceWarning[];
```

- [x] **Step 4: Thread project preferences through `factory-plan.ts`**

Modify `normalizeBundleFactoryPlan` so explicit `plan.preferredSkills` wins, otherwise project preferences seed the list:

```ts
const projectPreferred = options.projectPreferredSkills ?? [];
const preferredSkills = dedupe([
  ...(plan.preferredSkills ?? projectPreferred),
  ...plan.callChain
    .map((item) => (typeof item === 'string' ? item : item.skill))
    .filter((skill) => skill.length > 0),
]);
```

Keep current call-chain normalization behavior.

- [x] **Step 5: Update `initializeBundleFactoryState` to use `readBundleSkillPreferences`**

In `domains/bundle/factory.ts`, replace `readSkillPreferences` import with `readBundleSkillPreferences`.

Add helper:

```ts
function assertPreferenceCapabilitiesAllowed(
  preferences: Awaited<ReturnType<typeof readBundleSkillPreferences>> | null,
): void {
  const policies = preferences?.preferences.policies;
  if (!policies) return;
  if (policies.scripts === 'deny') {
    throw new Error('Project Skill preference policy denies scripts required by generated Factory output');
  }
  if (policies.hooks === 'deny') {
    throw new Error('Project Skill preference policy denies hooks required by generated Factory output');
  }
}
```

Then in `initializeBundleFactoryState`:

```ts
const projectPreferences = await readBundleSkillPreferences(projectRoot);
assertPreferenceCapabilitiesAllowed(projectPreferences);
const plan = normalizeBundleFactoryPlan({
  plan: await readBundleFactoryPlan(path.resolve(options.filePath)),
  projectPreferredSkills: projectPreferences?.names ?? null,
});
```

When creating `factory`, include:

```ts
requiredSkills: projectPreferences?.preferences.require ?? [],
preferenceMode: projectPreferences?.preferences.mode,
preferencePolicies: projectPreferences?.preferences.policies,
preferencePath: projectPreferences?.path,
preferenceHash: projectPreferences?.hash,
preferenceWarnings: projectPreferences?.warnings ?? [],
```

- [x] **Step 6: Run Factory metadata tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-factory-plan.test.ts test/domains/bundle/bundle-command.test.ts -t "preference|denies"
```

Expected: PASS.

- [x] **Step 7: Commit Task 4**

```bash
git add domains/bundle/types.ts domains/bundle/factory-plan.ts domains/bundle/factory.ts test/domains/bundle/bundle-factory-plan.test.ts test/domains/bundle/bundle-command.test.ts
git commit -m "feat: persist factory skill preferences"
```

---

### Task 5: Factory Proposal Preview

**Files:**
- Create: `domains/bundle/factory-proposal.ts`
- Modify: `app/commands/bundle.ts`
- Modify: `app/cli/index.ts`
- Modify: `test/domains/bundle/bundle-command.test.ts`
- Modify: `test/domains/bundle/bundle-cli-e2e.test.ts`

- [x] **Step 1: Write failing domain and CLI tests for dry-run proposal**

In `test/domains/bundle/bundle-command.test.ts`, add:

```ts
it('builds a Factory proposal without writing Bundle authoring state', async () => {
  await fs.writeFile(
    path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    `version: 1
mode: advisory
prefer:
  - factory-alpha
`,
  );
  await writeFactorySkill(projectRoot, 'factory-alpha');
  const planFile = path.join(root, 'factory-proposal-plan.json');
  await fs.writeFile(
    planFile,
    JSON.stringify({ goal: 'Create a proposal first.', callChain: ['factory-alpha'] }),
  );

  await bundleFactoryProposeCommand('proposal-factory', {
    project: projectRoot,
    file: planFile,
    json: true,
  });

  await expect(
    readBundleAuthoringState(projectRoot, 'proposal-factory'),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});
```

In `test/domains/bundle/bundle-cli-e2e.test.ts`, add:

```ts
it('prints a JSON Factory proposal before draft creation', async () => {
  await writeFactorySkill(projectRoot, 'factory-alpha');
  await fs.writeFile(
    path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    `version: 1
prefer:
  - factory-alpha
`,
  );
  const planFile = path.join(root, 'proposal-plan.json');
  await fs.writeFile(
    planFile,
    JSON.stringify({ goal: 'Create a proposal.', callChain: ['factory-alpha'] }),
  );

  const result = runJson(
    'bundle',
    'factory-propose',
    'proposal-factory',
    '--file',
    planFile,
    '--project',
    projectRoot,
  );

  expect(result).toMatchObject({
    name: 'proposal-factory',
    goal: 'Create a proposal.',
    preference: {
      mode: 'advisory',
      source: path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    },
    callChain: [{ skill: 'factory-alpha', preferenceIndex: 0 }],
    resolvedSkills: [{ query: 'factory-alpha', status: 'available' }],
    canGenerate: true,
  });
});
```

- [x] **Step 2: Run failing proposal tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts -t "proposal"
```

Expected: FAIL because proposal domain and CLI command do not exist.

- [x] **Step 3: Create `domains/bundle/factory-proposal.ts`**

Implement:

```ts
import path from 'path';
import { discoverBundleCandidates } from './candidates.js';
import { composeBundleFactoryPlan } from './factory-compose.js';
import { normalizeBundleFactoryPlan, readBundleFactoryPlan } from './factory-plan.js';
import { readBundleSkillPreferences } from './preferences.js';
import type { BundleFactoryCallChainItem, BundleFactoryResolvedSkill } from './types.js';

export interface BundleFactoryProposal {
  schemaVersion: 1;
  name: string;
  goal: string;
  preference: {
    mode: 'advisory' | 'strict';
    source: string | null;
    hash: string | null;
    warnings: unknown[];
  };
  callChain: BundleFactoryCallChainItem[];
  resolvedSkills: BundleFactoryResolvedSkill[];
  composition: Awaited<ReturnType<typeof composeBundleFactoryPlan>>['composition'];
  blockers: string[];
  warnings: string[];
  canGenerate: boolean;
}

export async function buildBundleFactoryProposal(options: {
  projectRoot: string;
  name: string;
  filePath: string;
}): Promise<BundleFactoryProposal> {
  const projectRoot = path.resolve(options.projectRoot);
  const projectPreferences = await readBundleSkillPreferences(projectRoot);
  const plan = normalizeBundleFactoryPlan({
    plan: await readBundleFactoryPlan(path.resolve(options.filePath)),
    projectPreferredSkills: projectPreferences?.names ?? null,
  });
  const candidates = await discoverBundleCandidates({
    projectRoot,
    preferences: plan.preferredSkills.length > 0 ? plan.preferredSkills : null,
  });
  const resolvedSkills = candidates.map((candidate) => ({
    query: candidate.name,
    preferenceIndex: candidate.preferenceIndex,
    status: candidate.status,
    sources: candidate.sources,
  }));
  const composed = await composeBundleFactoryPlan({
    entrySkills: plan.callChain.map((item) => item.skill),
    preferredSkills: plan.preferredSkills,
    resolvedSkills,
  });
  const blockers = [
    ...resolvedSkills
      .filter((skill) => skill.status === 'missing' || skill.status === 'ambiguous')
      .map((skill) => `[candidate] ${skill.query} (${skill.status})`),
    ...composed.composition.issues.map((issue) => `[composition] ${issue.message}`),
  ];
  const policies = projectPreferences?.preferences.policies;
  if (policies?.scripts === 'deny') blockers.push('[policy] preference policy denies scripts');
  if (policies?.hooks === 'deny') blockers.push('[policy] preference policy denies hooks');
  return {
    schemaVersion: 1,
    name: options.name,
    goal: plan.goal,
    preference: {
      mode: projectPreferences?.preferences.mode ?? 'advisory',
      source: projectPreferences?.path ?? null,
      hash: projectPreferences?.hash ?? null,
      warnings: projectPreferences?.warnings ?? [],
    },
    callChain: composed.callChain.length > 0 ? composed.callChain : plan.callChain,
    resolvedSkills,
    composition: composed.composition,
    blockers,
    warnings: plan.deviations.map((item) => `[deviation] ${item.skill}: ${item.reason}`),
    canGenerate: blockers.length === 0,
  };
}
```

- [x] **Step 4: Add command wrapper in `app/commands/bundle.ts`**

Import `buildBundleFactoryProposal` and add:

```ts
export async function bundleFactoryProposeCommand(
  name: string,
  options: BundleCommandOptions & { file: string },
): Promise<void> {
  const root = projectRoot(options.project);
  const proposal = await buildBundleFactoryProposal({
    projectRoot: root,
    name,
    filePath: options.file,
  });
  if (options.json) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }
  console.log(`Factory proposal ${proposal.name}`);
  console.log(`Goal: ${proposal.goal}`);
  console.log(`Preference mode: ${proposal.preference.mode}`);
  console.log(`Can generate: ${proposal.canGenerate ? 'yes' : 'no'}`);
  if (proposal.blockers.length > 0) {
    console.log('Blockers:');
    for (const blocker of proposal.blockers) console.log(`- ${blocker}`);
  }
}
```

- [x] **Step 5: Register CLI command in `app/cli/index.ts`**

Under `bundle` commands, add:

```ts
bundle
  .command('factory-propose <name>')
  .description('Preview a /comet-any Factory proposal without writing Bundle state')
  .requiredOption('--file <path>', 'Factory plan JSON file')
  .option('--project <path>', 'Project root')
  .option('--json', 'Print JSON')
  .action((name, options) => run(() => bundleFactoryProposeCommand(name, options)));
```

- [x] **Step 6: Run proposal tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts -t "proposal"
```

Expected: PASS.

- [x] **Step 7: Commit Task 5**

```bash
git add domains/bundle/factory-proposal.ts app/commands/bundle.ts app/cli/index.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts
git commit -m "feat: preview comet-any factory proposals"
```

---

### Task 6: Preference Policy Readiness and Drift

**Files:**
- Modify: `domains/bundle/review-summary.ts`
- Modify: `domains/bundle/factory.ts`
- Modify: `test/domains/bundle/bundle-review-summary.test.ts`
- Modify: `test/domains/bundle/bundle-command.test.ts`

- [x] **Step 1: Write failing readiness tests**

In `test/domains/bundle/bundle-review-summary.test.ts`, add:

```ts
it('surfaces preference hash evidence and drift warnings', async () => {
  const state = await preparedReviewableFactoryState('preference-drift');
  await fs.writeFile(
    path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    `version: 1
mode: advisory
prefer:
  - changed-skill
`,
  );

  const summary = await buildBundleReviewSummary({
    projectRoot,
    name: state.name,
    platform: 'claude-code',
  });

  expect(summary.readiness.evidence).toHaveProperty('preferenceHash');
  expect(summary.readiness.warnings).toContain(
    '[preference] Project Skill preferences changed after Factory initialization',
  );
});

it('blocks strict preference drift', async () => {
  const state = await preparedReviewableFactoryState('strict-preference-drift', {
    preferenceMode: 'strict',
  });
  await fs.writeFile(
    path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
    `version: 1
mode: strict
prefer:
  - changed-skill
`,
  );

  const summary = await buildBundleReviewSummary({
    projectRoot,
    name: state.name,
    platform: 'claude-code',
  });

  expect(summary.readiness.blockers).toContain(
    '[preference] Project Skill preferences changed after Factory initialization',
  );
});
```

Use existing helper patterns in `bundle-review-summary.test.ts`; add an optional `factory` override parameter if needed.

- [x] **Step 2: Run failing readiness tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-review-summary.test.ts -t "preference"
```

Expected: FAIL because review summary does not compare preference hashes.

- [x] **Step 3: Add drift comparison in `review-summary.ts`**

Import `readProjectSkillPreferences` from `domains/skill/preferences.ts`.

In `buildBundleReviewSummary`, read current preference hash:

```ts
const currentPreferences = await readProjectSkillPreferences(options.projectRoot);
```

Pass it into `buildReadiness`:

```ts
readiness: buildReadiness(state, controlPlane, compile, currentPreferences?.hash ?? null),
```

Extend `buildReadiness` signature and add:

```ts
const storedPreferenceHash = state.factory?.preferenceHash ?? null;
if (storedPreferenceHash) {
  const drifted = currentPreferenceHash !== storedPreferenceHash;
  if (drifted) {
    const message = '[preference] Project Skill preferences changed after Factory initialization';
    if (state.factory?.preferenceMode === 'strict') blockers.push(message);
    else warnings.push(message);
  }
}
```

Add evidence:

```ts
...(state.factory?.preferenceHash ? { preferenceHash: state.factory.preferenceHash } : {}),
...(state.factory?.preferenceMode ? { preferenceMode: state.factory.preferenceMode } : {}),
```

- [x] **Step 4: Add strict required candidate blockers**

In `buildReadiness`, add:

```ts
const required = new Set(state.factory?.requiredSkills ?? []);
const unresolvedRequired = unresolved.filter((skill) => required.has(skill.query));
if (state.factory?.preferenceMode === 'strict' && unresolvedRequired.length > 0) {
  blockers.push(
    `[preference] Required Skill candidates are unresolved: ${unresolvedRequired
      .map((skill) => `${skill.query} (${skill.status})`)
      .join(', ')}`,
  );
}
```

- [x] **Step 5: Run readiness tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-review-summary.test.ts -t "preference|readiness"
```

Expected: PASS.

- [x] **Step 6: Commit Task 6**

```bash
git add domains/bundle/review-summary.ts domains/bundle/factory.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/bundle/bundle-command.test.ts
git commit -m "feat: surface skill preference readiness"
```

---

### Task 7: Generated Evidence Includes Preferences

**Files:**
- Modify: `domains/factory/package.ts`
- Modify: `domains/bundle/factory.ts`
- Modify: `test/domains/factory/factory-package.test.ts`
- Modify: `test/domains/bundle/bundle-command.test.ts`

- [x] **Step 1: Write failing generated evidence tests**

In `test/domains/factory/factory-package.test.ts`, extend the generated package test:

```ts
expect(resolved).toMatchObject({
  preference: {
    mode: 'strict',
    requiredSkills: ['verification-before-completion'],
    sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
  },
});
expect(compositionReport).toContain('Preference mode: strict');
expect(compositionReport).toContain('Required Skills');
expect(compositionReport).toContain('verification-before-completion');
```

- [x] **Step 2: Run failing factory package tests**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-command.test.ts -t "preference|resolved-skills|composition-report"
```

Expected: FAIL because generated evidence does not include preference metadata.

- [x] **Step 3: Extend `generateFactorySkillPackage` input**

In `domains/factory/package.ts`, add input fields:

```ts
preference?: {
  mode?: 'advisory' | 'strict';
  policies?: Record<string, string>;
  requiredSkills?: string[];
  sourcePath?: string;
  sourceHash?: string;
  warnings?: unknown[];
};
```

Add the `preference` object to `resolved-skills.json`:

```ts
preference: options.preference ?? null,
```

Add a section to `composition-report.md`:

```md
## Project Skill Preference

- Preference mode: ${options.preference?.mode ?? 'advisory'}
- Preference source: ${options.preference?.sourcePath ?? 'none'}
- Preference hash: ${options.preference?.sourceHash ?? 'none'}
- Required Skills: ${(options.preference?.requiredSkills ?? []).join(', ') || 'none'}
```

- [x] **Step 4: Pass preference metadata from `factory.ts`**

In `generateBundleDraftFromFactoryState`, pass:

```ts
preference: {
  mode: factory.preferenceMode,
  policies: factory.preferencePolicies,
  requiredSkills: factory.requiredSkills,
  sourcePath: factory.preferencePath,
  sourceHash: factory.preferenceHash,
  warnings: factory.preferenceWarnings,
},
```

- [x] **Step 5: Run factory package tests**

Run:

```bash
npx vitest run test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-command.test.ts -t "preference|resolved-skills|composition-report"
```

Expected: PASS.

- [x] **Step 6: Commit Task 7**

```bash
git add domains/factory/package.ts domains/bundle/factory.ts test/domains/factory/factory-package.test.ts test/domains/bundle/bundle-command.test.ts
git commit -m "feat: include skill preferences in factory evidence"
```

---

### Task 8: Remove `.comet/skills.txt` User Path From Active Docs and Skill Assets

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
- Modify: `test/ts/comet-any-skill.test.ts`
- Modify: `test/ts/readme.test.ts`

- [x] **Step 1: Update Skill asset tests first**

Modify `test/ts/comet-any-skill.test.ts`:

- Replace expectations for `.comet/skills.txt` with `.comet/skill-preferences.yaml`.
- Add expectations for:
  - `Skill 创建向导`
  - `组合方案`
  - `advisory`
  - `strict`
  - `factory-propose`
  - `preferenceHash`
  - `项目级偏好`
- Add negative expectation:

```ts
expect(combined).not.toContain('.comet/skills.txt');
```

Modify bilingual parity to include English equivalents:

```ts
{ zh: '.comet/skill-preferences.yaml', en: '.comet/skill-preferences.yaml' },
{ zh: '项目级偏好', en: 'project-level preferences' },
{ zh: '组合方案', en: 'composition proposal' },
{ zh: 'advisory', en: 'advisory' },
{ zh: 'strict', en: 'strict' },
{ zh: 'preferenceHash', en: 'preferenceHash' },
```

- [x] **Step 2: Run failing Skill asset tests**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: FAIL because assets still mention `.comet/skills.txt`.

- [x] **Step 3: Update Chinese `/comet-any` Skill assets**

Edit Chinese files first:

- `assets/skills-zh/comet-any/SKILL.md`
- `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- `assets/skills-zh/comet-any/reference/eval-provider.md`

Required wording changes:

- Describe `/comet-any` as “Skill 创建向导”.
- Replace `.comet/skills.txt` with `.comet/skill-preferences.yaml`.
- Explain that the file is project-level, user-editable, and can be generated by `/comet-any`.
- Add `comet bundle factory-propose <name> --file <plan.json> --json` before `factory-init`.
- Require showing composition proposal before draft generation.
- Require saving `preferenceHash` in Factory metadata.
- Explain `advisory` vs `strict`.
- Keep `/comet-any -> comet eval -> comet publish -> distribute`.
- Keep scripts/rules/hooks as required control plane.

- [x] **Step 4: Update English `/comet-any` Skill assets**

Apply structurally equivalent changes to:

- `assets/skills/comet-any/SKILL.md`
- `assets/skills/comet-any/reference/bundle-authoring.md`
- `assets/skills/comet-any/reference/eval-provider.md`

Keep terminology aligned:

- `Skill creation guide`
- `project-level preferences`
- `composition proposal`
- `advisory`
- `strict`
- `preferenceHash`

- [x] **Step 5: Update active docs and README**

Update:

- `docs/operations/SKILL-CREATION-ZH.md`
- `docs/operations/EVAL-USAGE-ZH.md`
- `README-zh.md`
- `README.md`

Required content:

- README keeps a short `/comet-any` note and links to operation docs.
- `SKILL-CREATION-ZH.md` covers:
  - one-sentence creation
  - first preference setup
  - hand-written `.comet/skill-preferences.yaml`
  - proposal preview
  - Eval
  - Publish
  - Distribute
  - recovery
- `EVAL-USAGE-ZH.md` keeps eval as evidence and mentions preference-aware review readiness.
- Remove active-doc main-flow references to `.comet/skills.txt`.

- [x] **Step 6: Run docs and Skill tests**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts test/ts/readme.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit Task 8**

```bash
git add assets/skills-zh/comet-any assets/skills/comet-any docs/operations/SKILL-CREATION-ZH.md docs/operations/EVAL-USAGE-ZH.md README-zh.md README.md test/ts/comet-any-skill.test.ts test/ts/readme.test.ts
git commit -m "docs: guide comet-any through skill preferences"
```

---

### Task 9: Replace Remaining `.comet/skills.txt` Test Fixtures

**Files:**
- Modify: `test/domains/bundle/bundle-command.test.ts`
- Modify: `test/domains/bundle/bundle-cli-e2e.test.ts`
- Modify: any active test found by `rg -n "skills\\.txt" test domains app assets docs README*.md`

- [x] **Step 1: Search active references**

Run:

```bash
rg -n "skills\\.txt" test domains app assets docs/operations README.md README-zh.md
```

Expected: references remain only in tests that have not yet been migrated, or no output.

- [x] **Step 2: Replace Bundle command fixtures**

For each test that writes:

```ts
await fs.writeFile(path.join(projectRoot, '.comet', 'skills.txt'), 'factory-alpha\n');
```

replace with:

```ts
await fs.writeFile(
  path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
  `version: 1
prefer:
  - factory-alpha
`,
);
```

For missing Skill tests, use:

```ts
await fs.writeFile(
  path.join(projectRoot, '.comet', 'skill-preferences.yaml'),
  `version: 1
prefer:
  - missing-skill
`,
);
```

- [x] **Step 3: Run migrated Bundle tests**

Run:

```bash
npx vitest run test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts
```

Expected: PASS.

- [x] **Step 4: Verify no active main-flow `skills.txt` references**

Run:

```bash
rg -n "skills\\.txt" domains app assets docs/operations README.md README-zh.md test
```

Expected: no output. If historical specs under `docs/superpowers/specs/` still mention `skills.txt`, leave them unchanged unless a test explicitly covers those historical files.

- [x] **Step 5: Commit Task 9**

```bash
git add test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts
git commit -m "test: migrate factory preferences fixtures"
```

---

### Task 10: Changelog and Verification

**Files:**
- Modify: `CHANGELOG.md`
- Check: `package.json`

- [x] **Step 1: Determine version entry**

Run:

```bash
git show origin/master:package.json
```

Expected: output includes the master branch version. Compare with local `package.json`.

Run:

```bash
Get-Content -LiteralPath package.json
```

Expected: local version is either the same as master or already one patch/minor/beta ahead. If local `CHANGELOG.md` already has the current local version entry, append to it. If not, add a top entry matching `package.json`.

- [x] **Step 2: Add user-visible changelog entry**

Add to `CHANGELOG.md` under the current version:

```md
### Changed

- **Comet Any preferences**: Replaced the unpublished `.comet/skills.txt` user path with project-level `.comet/skill-preferences.yaml`, inventory-backed preference setup, proposal preview, and preference-aware review readiness so users can create Comet-style Skills without learning internal Bundle files.

### Tests

- **Comet Any preference guide**: Added coverage for preference parsing, Skill inventory grouping, Factory proposal previews, strict/advisory policy readiness, generated preference evidence, and bilingual `/comet-any` docs.
```

Do not add changelog entries for intermediate development-only fixes in the same branch.

- [x] **Step 3: Run targeted verification**

Run:

```bash
npx vitest run test/domains/skill/skill-preferences.test.ts test/domains/skill/skill-inventory.test.ts test/domains/skill/skill-find.test.ts test/domains/bundle/bundle-candidates.test.ts test/domains/bundle/bundle-factory-plan.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/bundle-cli-e2e.test.ts test/domains/bundle/bundle-review-summary.test.ts test/domains/factory/factory-package.test.ts test/ts/comet-any-skill.test.ts test/ts/readme.test.ts
```

Expected: all listed suites pass.

- [x] **Step 4: Run required quality checks**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

Expected:

- `pnpm format:check`: passes. If Windows CRLF reports untouched legacy files, inspect whether failures are from edited files before fixing.
- `pnpm lint`: passes.
- `pnpm build`: passes.
- `pnpm test`: passes.

- [x] **Step 5: Commit Task 10**

```bash
git add CHANGELOG.md package.json
git commit -m "chore: document comet-any preference guide changes"
```

If `package.json` does not change, omit it from `git add`.

---

## Execution Notes

- Implementation was completed in one continuous working tree pass; per-task commit checklist items are marked as completed for delivery tracking, with actual committing left to the final repository workflow.


- Do not edit Superpowers or OpenSpec upstream Skill sources.
- For Skill content, update Chinese assets first, then English parity.
- Keep `comet bundle` as the advanced backend; do not make it the ordinary user path.
- Keep `flow.yaml` as internal or advanced authoring content only.
- Do not add `skill-preferences.yaml` under `.comet/comet-any/`; the accepted project-level path is `.comet/skill-preferences.yaml`.
- `comet bundle factory-propose` is a dry-run backend for `/comet-any`; it must not write `.comet/bundle-authoring` state.
- Bundle authoring state remains the source of truth for publish/distribute readiness.

## Self-Review

- Spec coverage:
  - Project preference parser: Task 1.
  - Remove `.comet/skills.txt`: Tasks 2, 3, 8, 9.
  - Full-platform Skill inventory and user-level dedupe: Task 2.
  - `/comet-any` proposal confirmation backend: Task 5.
  - Advisory/strict policies and readiness: Tasks 4, 6.
  - Preference evidence in generated files: Task 7.
  - Eval/review/publish/distribute docs and readiness: Tasks 6, 8, 10.
  - Tests and docs: Tasks 1 through 10.
- Placeholder scan: no open-ended implementation placeholders are intentionally left; every task lists concrete files, tests, commands, and expected outcomes.
- Type consistency:
  - `NormalizedSkillPreferences`, `SkillPreferencePolicies`, and `SkillPreferenceWarning` originate in `domains/skill/preferences.ts`.
  - Bundle metadata fields use `preferenceMode`, `preferencePolicies`, `preferencePath`, `preferenceHash`, `preferenceWarnings`, and `requiredSkills`.
  - Proposal command is consistently named `factory-propose`.
