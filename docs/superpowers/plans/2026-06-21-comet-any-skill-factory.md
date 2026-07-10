# Comet Any Skill Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/comet-any` into a user-facing Comet Skill Factory that resolves real local preferred Skills, preserves preferred call order, generates Engine-aware Comet-native Skill packages, and uses Bundle/Skill CLI services as internal backends.

**Architecture:** Add a shared `find-skill` layer under `src/skill/`, bridge existing Bundle candidate discovery onto it, extend Bundle authoring state with Factory metadata, add a focused Factory generator for Engine-aware package files, then update `/comet-any` bilingual Skill guidance. Keep existing `comet bundle` and `comet skill` commands working; new behavior layers on top of current Bundle and Skill Engine services.

**Tech Stack:** TypeScript ESM, Node.js 20+, YAML, Vitest, existing `src/skill`, `src/bundle`, `src/engine`, and Markdown Skill assets.

---

## Scope

This plan implements the first practical slice of the Skill Factory design:

- Resolve `.comet/skills.txt` entries into real local Skill implementations with `preferenceIndex`.
- Preserve preferred order through candidate discovery and Factory metadata.
- Generate a minimal valid Comet-native Skill package from a Factory plan.
- Record ordered call-chain deviations with explicit reasons.
- Update `/comet-any` so users see Skill-only creation while CLI remains an internal backend.

This plan does not implement a full LLM creator, full adaptive runtime, or real platform-specific Engine runner execution. Runner support is represented as generated Skill guidance and package metadata; runtime execution continues through the existing `comet skill run/resume` contract, and dedicated runner execution belongs to a separate follow-up plan.

## File Structure

- `src/skill/find.ts`: shared local Skill finder. Reads preference files, searches explicit paths/project/global/builtin/platform roots, reads `SKILL.md`, computes directory hash, and reports missing/ambiguous/available results.
- `src/bundle/preferences.ts`: compatibility wrapper around the new preference parser.
- `src/bundle/candidates.ts`: delegates candidate discovery to `src/skill/find.ts`, preserving the existing Bundle candidate output shape plus `preferenceIndex`.
- `src/bundle/types.ts`: adds optional Factory metadata to `BundleCandidateSource` and `BundleAuthoringState`.
- `src/bundle/draft.ts`: accepts Factory metadata when creating or optimizing drafts.
- `src/factory/types.ts`: small Factory domain types for call-chain planning and deviation reasons.
- `src/factory/package.ts`: writes a minimal Comet-native Skill package from a Factory package plan.
- `src/commands/bundle.ts`: includes preference order and source details in JSON output; no interactive model behavior.
- `assets/skills-zh/comet-any/SKILL.md` and references: Chinese Skill Factory workflow.
- `assets/skills/comet-any/SKILL.md` and references: English parity after Chinese behavior is settled.
- `test/ts/skill-find.test.ts`: direct finder coverage.
- `test/ts/bundle-candidates.test.ts`: compatibility coverage for Bundle candidate discovery.
- `test/ts/bundle-authoring.test.ts`: Factory metadata persistence.
- `test/ts/factory-package.test.ts`: generated Skill package validation.
- `test/ts/comet-any-skill.test.ts`: bilingual Skill guidance contract.

## Task 1: Shared Skill Preference Finder

**Files:**
- Create: `src/skill/find.ts`
- Modify: `src/bundle/preferences.ts`
- Test: `test/ts/skill-find.test.ts`

- [x] **Step 1: Write the failing finder tests**

Create `test/ts/skill-find.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  findPreferredSkills,
  readSkillPreferenceEntries,
  type SkillSearchRoot,
} from '../../src/skill/find.js';

async function writeMarkdownSkill(root: string, name: string, description: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, 'SKILL.md'),
    `---
name: ${name}
description: ${description}
---

# ${name}

Read the nearby reference when needed.
`,
  );
  await fs.mkdir(path.join(root, 'reference'), { recursive: true });
  await fs.writeFile(path.join(root, 'reference', 'notes.md'), `# ${name} notes\n`);
}

describe('findPreferredSkills', () => {
  let root: string;
  let projectRoot: string;
  let homeDir: string;
  let builtinRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-skill-find-'));
    projectRoot = path.join(root, 'project');
    homeDir = path.join(root, 'home');
    builtinRoot = path.join(root, 'builtin');
    await fs.mkdir(path.join(projectRoot, '.comet'), { recursive: true });
    await fs.mkdir(homeDir, { recursive: true });
    await fs.mkdir(builtinRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('parses preference order, comments, duplicates and explicit paths', async () => {
    const explicit = path.join(root, 'explicit-skill');
    await writeMarkdownSkill(explicit, 'explicit-skill', 'Explicit path skill.');
    await fs.writeFile(
      path.join(projectRoot, '.comet', 'skills.txt'),
      `
# preferred call chain
brainstorming
writing-plans
brainstorming
${explicit}
`,
    );

    await expect(readSkillPreferenceEntries(projectRoot)).resolves.toEqual([
      { query: 'brainstorming', preferenceIndex: 0 },
      { query: 'writing-plans', preferenceIndex: 1 },
      { query: explicit, preferenceIndex: 2 },
    ]);
  });

  it('finds real local Skills and preserves preferenceIndex', async () => {
    await writeMarkdownSkill(
      path.join(projectRoot, '.codex', 'skills', 'brainstorming'),
      'brainstorming',
      'Explore intent before implementation.',
    );
    await writeMarkdownSkill(
      path.join(homeDir, '.agents', 'skills', 'writing-plans'),
      'writing-plans',
      'Write implementation plans.',
    );

    const result = await findPreferredSkills({
      projectRoot,
      homeDir,
      builtinRoot,
      preferences: [
        { query: 'brainstorming', preferenceIndex: 0 },
        { query: 'writing-plans', preferenceIndex: 1 },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({
        query: 'brainstorming',
        preferenceIndex: 0,
        status: 'available',
        sources: [
          expect.objectContaining({
            name: 'brainstorming',
            origin: 'project',
            platform: 'codex',
            description: 'Explore intent before implementation.',
            skillMd: expect.stringContaining('# brainstorming'),
            references: [expect.objectContaining({ path: 'reference/notes.md' })],
            hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          }),
        ],
      }),
      expect.objectContaining({
        query: 'writing-plans',
        preferenceIndex: 1,
        status: 'available',
        sources: [expect.objectContaining({ origin: 'global', platform: 'agents' })],
      }),
    ]);
  });

  it('reports ambiguous and missing preferences without choosing for the user', async () => {
    await writeMarkdownSkill(
      path.join(projectRoot, '.codex', 'skills', 'reviewing'),
      'reviewing',
      'Project reviewer.',
    );
    await writeMarkdownSkill(
      path.join(homeDir, '.codex', 'skills', 'reviewing'),
      'reviewing',
      'Global reviewer.',
    );

    const result = await findPreferredSkills({
      projectRoot,
      homeDir,
      builtinRoot,
      preferences: [
        { query: 'reviewing', preferenceIndex: 0 },
        { query: 'missing-skill', preferenceIndex: 1 },
      ],
    });

    expect(result[0]).toMatchObject({
      query: 'reviewing',
      preferenceIndex: 0,
      status: 'ambiguous',
    });
    expect(result[0].sources).toHaveLength(2);
    expect(result[1]).toMatchObject({
      query: 'missing-skill',
      preferenceIndex: 1,
      status: 'missing',
      sources: [],
    });
  });

  it('can scan supplied roots when preferences are absent', async () => {
    const customRoot = path.join(root, 'custom-skills');
    await writeMarkdownSkill(path.join(customRoot, 'alpha'), 'alpha', 'Alpha skill.');
    const roots: SkillSearchRoot[] = [
      { root: customRoot, origin: 'project', platform: 'custom' },
    ];

    const result = await findPreferredSkills({
      projectRoot,
      homeDir,
      builtinRoot,
      preferences: null,
      extraRoots: roots,
    });

    expect(result).toEqual([
      expect.objectContaining({
        query: 'alpha',
        preferenceIndex: null,
        status: 'available',
      }),
    ]);
  });
});
```

- [x] **Step 2: Run the finder tests and verify RED**

Run:

```bash
npx vitest run test/ts/skill-find.test.ts
```

Expected: FAIL because `src/skill/find.ts` does not exist.

- [x] **Step 3: Implement the shared finder**

Create `src/skill/find.ts`:

```ts
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import type { Dirent } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { getPlatformSkillsDir, PLATFORMS } from '../core/platforms.js';

export interface SkillPreferenceEntry {
  query: string;
  preferenceIndex: number;
}

export interface SkillSearchRoot {
  root: string;
  origin: 'project' | 'global' | 'builtin' | 'plugin' | 'explicit';
  platform?: string;
}

export interface FoundSkillSource {
  name: string;
  root: string;
  origin: SkillSearchRoot['origin'];
  platform?: string;
  description: string;
  skillMd: string;
  references: Array<{ path: string; contentHash: string }>;
  scripts: Array<{
    path: string;
    sideEffect: 'unknown' | 'none' | 'read' | 'write' | 'external';
  }>;
  hash: string;
}

export interface FoundSkill {
  query: string;
  preferenceIndex: number | null;
  status: 'available' | 'missing' | 'ambiguous';
  sources: FoundSkillSource[];
}

interface FindPreferredSkillsOptions {
  projectRoot: string;
  homeDir?: string;
  builtinRoot?: string;
  preferences?: SkillPreferenceEntry[] | null;
  extraRoots?: SkillSearchRoot[];
}

interface HashedFile {
  relativePath: string;
  kind: 'file' | 'symlink';
  content: Buffer;
}

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

function defaultBuiltinRoot(): string {
  return path.resolve(moduleDirectory, '..', '..', 'assets', 'skills');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validSkillName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(name);
}

function looksLikePath(query: string): boolean {
  return (
    path.isAbsolute(query) ||
    query.startsWith('.') ||
    query.includes('/') ||
    query.includes('\\')
  );
}

export async function readSkillPreferenceEntries(
  projectRoot: string,
): Promise<SkillPreferenceEntry[] | null> {
  const preferencesPath = path.resolve(projectRoot, '.comet', 'skills.txt');
  let source: string;
  try {
    source = await fs.readFile(preferencesPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const seen = new Set<string>();
  const entries: SkillPreferenceEntry[] = [];
  for (const line of source.split(/\r?\n/u)) {
    const query = line.trim();
    if (!query || query.startsWith('#') || seen.has(query)) continue;
    seen.add(query);
    entries.push({ query, preferenceIndex: entries.length });
  }
  return entries;
}

function platformRoots(projectRoot: string, homeDir: string): SkillSearchRoot[] {
  const roots: SkillSearchRoot[] = [];
  for (const platform of PLATFORMS) {
    roots.push({
      root: path.resolve(projectRoot, platform.skillsDir, 'skills'),
      origin: 'project',
      platform: platform.id === 'claude' ? 'claude-code' : platform.id,
    });
    roots.push({
      root: path.resolve(homeDir, getPlatformSkillsDir(platform, 'global'), 'skills'),
      origin: 'global',
      platform: platform.id === 'claude' ? 'claude-code' : platform.id,
    });
  }
  roots.push({
    root: path.resolve(homeDir, '.agents', 'skills'),
    origin: 'global',
    platform: 'agents',
  });
  return roots;
}

function searchRoots(options: Required<Pick<FindPreferredSkillsOptions, 'projectRoot'>> & {
  homeDir: string;
  builtinRoot: string;
  extraRoots: SkillSearchRoot[];
}): SkillSearchRoot[] {
  return [
    { root: path.resolve(options.projectRoot, '.comet', 'skills'), origin: 'project' },
    ...platformRoots(options.projectRoot, options.homeDir),
    { root: options.builtinRoot, origin: 'builtin', platform: 'comet' },
    ...options.extraRoots,
  ];
}

async function directoryEntries(root: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function collectHashFiles(root: string, relative = ''): Promise<HashedFile[]> {
  const directory = path.join(root, ...relative.split('/').filter(Boolean));
  const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((left, right) =>
    compareText(left.name, right.name),
  );
  const files: HashedFile[] = [];
  for (const entry of entries) {
    const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHashFiles(root, relativePath)));
    } else if (entry.isSymbolicLink()) {
      files.push({ relativePath, kind: 'symlink', content: Buffer.from(await fs.readlink(target)) });
    } else if (entry.isFile()) {
      files.push({ relativePath, kind: 'file', content: await fs.readFile(target) });
    }
  }
  return files;
}

async function hashSkillDirectory(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of await collectHashFiles(root)) {
    const pathBuffer = Buffer.from(file.relativePath.replaceAll('\\', '/'));
    hash.update(file.kind);
    hash.update('\0');
    hash.update(String(pathBuffer.length));
    hash.update('\0');
    hash.update(pathBuffer);
    hash.update('\0');
    hash.update(String(file.content.length));
    hash.update('\0');
    hash.update(file.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function skillDescription(skillMd: string): string {
  const match = skillMd.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) return '';
  const document = parse(match[1]) as unknown;
  if (
    document &&
    typeof document === 'object' &&
    !Array.isArray(document) &&
    typeof (document as Record<string, unknown>).description === 'string'
  ) {
    return (document as Record<string, string>).description;
  }
  return '';
}

async function collectReferenceHashes(root: string): Promise<FoundSkillSource['references']> {
  const referencesRoot = path.join(root, 'reference');
  const result: FoundSkillSource['references'] = [];
  for (const file of await collectExistingFiles(referencesRoot, 'reference')) {
    result.push({
      path: file.relativePath,
      contentHash: createHash('sha256').update(file.content).digest('hex'),
    });
  }
  return result.sort((left, right) => compareText(left.path, right.path));
}

async function collectExistingFiles(root: string, prefix: string): Promise<HashedFile[]> {
  try {
    return await collectHashFiles(path.dirname(root), prefix);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function collectScripts(root: string): Promise<FoundSkillSource['scripts']> {
  const scripts = await collectExistingFiles(path.join(root, 'scripts'), 'scripts');
  return scripts
    .filter((file) => file.kind === 'file')
    .map((file) => ({ path: file.relativePath, sideEffect: 'unknown' as const }))
    .sort((left, right) => compareText(left.path, right.path));
}

async function readSkillSource(
  name: string,
  root: SkillSearchRoot,
): Promise<FoundSkillSource | null> {
  const candidatePath = path.resolve(root.root, name);
  const relative = path.relative(root.root, candidatePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }

  let realRoot: string;
  let skillMd: string;
  try {
    realRoot = await fs.realpath(candidatePath);
    if (!(await fs.stat(realRoot)).isDirectory()) return null;
    skillMd = await fs.readFile(path.join(realRoot, 'SKILL.md'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  return {
    name,
    root: realRoot,
    origin: root.origin,
    ...(root.platform ? { platform: root.platform } : {}),
    description: skillDescription(skillMd),
    skillMd,
    references: await collectReferenceHashes(realRoot),
    scripts: await collectScripts(realRoot),
    hash: await hashSkillDirectory(realRoot),
  };
}

async function explicitSource(query: string): Promise<FoundSkillSource | null> {
  if (!looksLikePath(query)) return null;
  const target = path.resolve(query);
  const name = path.basename(target);
  return readSkillSource(name, { root: path.dirname(target), origin: 'explicit' });
}

async function discoveredPreferenceEntries(roots: SkillSearchRoot[]): Promise<SkillPreferenceEntry[]> {
  const names = new Set<string>();
  for (const root of roots) {
    for (const entry of await directoryEntries(root.root)) {
      if (entry.isDirectory() && validSkillName(entry.name)) names.add(entry.name);
    }
  }
  return [...names].sort(compareText).map((query, index) => ({ query, preferenceIndex: index }));
}

function dedupeSources(sources: FoundSkillSource[]): FoundSkillSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = process.platform === 'win32' ? source.root.toLocaleLowerCase('en-US') : source.root;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function findPreferredSkills(
  options: FindPreferredSkillsOptions,
): Promise<FoundSkill[]> {
  const roots = searchRoots({
    projectRoot: path.resolve(options.projectRoot),
    homeDir: options.homeDir ?? os.homedir(),
    builtinRoot: path.resolve(options.builtinRoot ?? defaultBuiltinRoot()),
    extraRoots: options.extraRoots ?? [],
  });
  const preferences =
    options.preferences === undefined
      ? await readSkillPreferenceEntries(options.projectRoot)
      : options.preferences;
  const entries = preferences ?? (await discoveredPreferenceEntries(roots));

  const result: FoundSkill[] = [];
  for (const entry of entries) {
    const explicit = await explicitSource(entry.query);
    const sources = explicit ? [explicit] : [];
    if (!explicit && validSkillName(entry.query)) {
      for (const root of roots) {
        const source = await readSkillSource(entry.query, root);
        if (source) sources.push(source);
      }
    }
    const uniqueSources = dedupeSources(sources);
    result.push({
      query: entry.query,
      preferenceIndex: preferences ? entry.preferenceIndex : null,
      status:
        uniqueSources.length === 0
          ? 'missing'
          : uniqueSources.length === 1
            ? 'available'
            : 'ambiguous',
      sources: uniqueSources,
    });
  }
  return result;
}
```

- [x] **Step 4: Keep the old preference API as a compatibility wrapper**

Replace `src/bundle/preferences.ts` with:

```ts
import { readSkillPreferenceEntries } from '../skill/find.js';

export async function readSkillPreferences(projectRoot: string): Promise<string[] | null> {
  const entries = await readSkillPreferenceEntries(projectRoot);
  return entries?.map((entry) => entry.query) ?? null;
}

export { readSkillPreferenceEntries };
```

- [x] **Step 5: Run finder tests and verify GREEN**

Run:

```bash
npx vitest run test/ts/skill-find.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/skill/find.ts src/bundle/preferences.ts test/ts/skill-find.test.ts
git commit -m "feat: resolve local preferred skills"
```

## Task 2: Bridge Bundle Candidates to `find-skill`

**Files:**
- Modify: `src/bundle/types.ts`
- Modify: `src/bundle/candidates.ts`
- Modify: `src/commands/bundle.ts`
- Modify: `test/ts/bundle-candidates.test.ts`

- [x] **Step 1: Write failing compatibility assertions for preference order**

Add this test to `test/ts/bundle-candidates.test.ts`:

```ts
it('preserves preference order metadata in Bundle candidate discovery', async () => {
  await writeSkill(
    path.join(projectRoot, '.codex', 'skills', 'brainstorming'),
    'brainstorming',
    'Explore first.',
  );
  await writeSkill(
    path.join(projectRoot, '.codex', 'skills', 'writing-plans'),
    'writing-plans',
    'Plan second.',
  );

  const result = await discoverBundleCandidates({
    projectRoot,
    homeDir,
    preferences: ['brainstorming', 'writing-plans'],
  });

  expect(result).toEqual([
    expect.objectContaining({
      name: 'brainstorming',
      preferenceIndex: 0,
      status: 'available',
      sources: [expect.objectContaining({ preferenceIndex: 0 })],
    }),
    expect.objectContaining({
      name: 'writing-plans',
      preferenceIndex: 1,
      status: 'available',
      sources: [expect.objectContaining({ preferenceIndex: 1 })],
    }),
  ]);
});
```

- [x] **Step 2: Run candidate tests and verify RED**

Run:

```bash
npx vitest run test/ts/bundle-candidates.test.ts
```

Expected: FAIL because `preferenceIndex` is not exposed by Bundle candidates.

- [x] **Step 3: Extend Bundle candidate types**

In `src/bundle/candidates.ts`, add `preferenceIndex` to both interfaces:

```ts
export interface BundleCandidateSource {
  name: string;
  preferenceIndex: number | null;
  platform: string;
  scope: 'project' | 'global' | 'builtin' | 'plugin' | 'explicit';
  root: string;
  description: string;
  skillMd: string;
  hash: string;
}

export interface BundleCandidate {
  name: string;
  preferenceIndex: number | null;
  status: 'available' | 'missing' | 'ambiguous';
  sources: BundleCandidateSource[];
}
```

- [x] **Step 4: Delegate candidate discovery to `findPreferredSkills`**

Replace the body of `src/bundle/candidates.ts` with a thin adapter:

```ts
import os from 'os';
import { findPreferredSkills } from '../skill/find.js';

export interface BundleCandidateSource {
  name: string;
  preferenceIndex: number | null;
  platform: string;
  scope: 'project' | 'global' | 'builtin' | 'plugin' | 'explicit';
  root: string;
  description: string;
  skillMd: string;
  hash: string;
}

export interface BundleCandidate {
  name: string;
  preferenceIndex: number | null;
  status: 'available' | 'missing' | 'ambiguous';
  sources: BundleCandidateSource[];
}

function bundleScope(origin: BundleCandidateSource['scope']): BundleCandidateSource['scope'] {
  return origin;
}

export async function discoverBundleCandidates(options: {
  projectRoot: string;
  homeDir?: string;
  preferences?: string[] | null;
}): Promise<BundleCandidate[]> {
  const preferences =
    options.preferences === undefined
      ? undefined
      : options.preferences?.map((query, preferenceIndex) => ({ query, preferenceIndex })) ?? null;
  const found = await findPreferredSkills({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir ?? os.homedir(),
    preferences,
  });
  return found.map((candidate) => ({
    name: candidate.query,
    preferenceIndex: candidate.preferenceIndex,
    status: candidate.status,
    sources: candidate.sources.map((source) => ({
      name: source.name,
      preferenceIndex: candidate.preferenceIndex,
      platform: source.platform ?? source.origin,
      scope: bundleScope(source.origin),
      root: source.root,
      description: source.description,
      skillMd: source.skillMd,
      hash: source.hash,
    })),
  }));
}
```

- [x] **Step 5: Update candidate tests for the new scope values**

In `test/ts/bundle-candidates.test.ts`, replace assertions that assume `scope: 'project' | 'global'` only with broader exact values:

```ts
expect.objectContaining({
  platform: 'claude-code',
  scope: 'project',
})
```

and keep explicit missing assertions unchanged:

```ts
{ name: 'missing', preferenceIndex: 1, status: 'missing', sources: [] }
```

- [x] **Step 6: Run candidate and command tests**

Run:

```bash
npx vitest run test/ts/skill-find.test.ts test/ts/bundle-candidates.test.ts test/ts/bundle-command.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/bundle/candidates.ts src/bundle/types.ts src/commands/bundle.ts test/ts/bundle-candidates.test.ts
git commit -m "feat: preserve preferred skill order in bundles"
```

## Task 3: Persist Factory Metadata in Bundle Authoring State

**Files:**
- Modify: `src/bundle/types.ts`
- Modify: `src/bundle/draft.ts`
- Modify: `src/bundle/state.ts`
- Test: `test/ts/bundle-authoring.test.ts`

- [x] **Step 1: Write failing Factory metadata persistence test**

Add this test to `test/ts/bundle-authoring.test.ts`:

```ts
it('persists Skill Factory metadata without invalidating draft state', async () => {
  const state = await createBundleDraft({
    projectRoot,
    name: 'factory-bundle',
    candidates: [],
    creator: null,
    defaultLocale: 'zh',
    locales: ['zh'],
    engineEnabled: true,
    factory: {
      goal: 'Create a review workflow',
      preferredSkills: [
        { query: 'brainstorming', preferenceIndex: 0 },
        { query: 'writing-plans', preferenceIndex: 1 },
      ],
      resolvedSkills: [
        {
          query: 'brainstorming',
          preferenceIndex: 0,
          name: 'brainstorming',
          root: '/skills/brainstorming',
          hash: 'a'.repeat(64),
        },
      ],
      generatedSkillPackage: 'skills/review-workflow',
      engineMode: 'deterministic',
      runnerMode: 'engine-aware-guidance',
      callChain: [
        { skill: 'brainstorming', preferenceIndex: 0 },
        { skill: 'writing-plans', preferenceIndex: 1 },
      ],
      deviations: [
        {
          skill: 'writing-plans',
          expectedIndex: 1,
          actualIndex: 0,
          reason: 'The generated workflow needs a plan before asking for implementation details.',
        },
      ],
    },
  });

  await expect(readBundleAuthoringState(projectRoot, 'factory-bundle')).resolves.toMatchObject({
    name: 'factory-bundle',
    status: 'draft',
    factory: state.factory,
  });
});
```

- [x] **Step 2: Run authoring tests and verify RED**

Run:

```bash
npx vitest run test/ts/bundle-authoring.test.ts
```

Expected: FAIL because draft options and state types do not accept `factory`.

- [x] **Step 3: Extend Bundle authoring types**

In `src/bundle/types.ts`, add:

```ts
export interface BundleFactoryMetadata {
  goal: string;
  preferredSkills: Array<{ query: string; preferenceIndex: number }>;
  resolvedSkills: Array<{
    query: string;
    preferenceIndex: number | null;
    name: string;
    root: string;
    hash: string;
  }>;
  generatedSkillPackage: string | null;
  engineMode: 'none' | 'deterministic' | 'adaptive';
  runnerMode: 'none' | 'engine-aware-guidance' | 'engine-runner';
  callChain: Array<{ skill: string; preferenceIndex: number | null }>;
  deviations: Array<{
    skill: string;
    expectedIndex: number;
    actualIndex: number;
    reason: string;
  }>;
}
```

Then add this optional field to `BundleAuthoringState`:

```ts
factory?: BundleFactoryMetadata;
```

- [x] **Step 4: Accept Factory metadata in draft creation**

In `src/bundle/draft.ts`, extend `CreateBundleDraftOptions` and `OptimizeBundleDraftOptions`:

```ts
factory?: BundleFactoryMetadata;
```

When constructing state, include:

```ts
...(options.factory ? { factory: options.factory } : {}),
```

- [x] **Step 5: Validate Factory metadata shape when reading state**

In `src/bundle/state.ts`, add a focused guard inside `assertState`:

```ts
if ('factory' in state && state.factory !== undefined) {
  const factory = state.factory as Record<string, unknown>;
  if (!factory || typeof factory !== 'object' || Array.isArray(factory)) {
    throw new Error(`${file}: factory must be an object`);
  }
  if (typeof factory.goal !== 'string') {
    throw new Error(`${file}: factory.goal must be a string`);
  }
  if (!Array.isArray(factory.preferredSkills)) {
    throw new Error(`${file}: factory.preferredSkills must be an array`);
  }
  if (!Array.isArray(factory.deviations)) {
    throw new Error(`${file}: factory.deviations must be an array`);
  }
}
```

- [x] **Step 6: Run authoring tests and verify GREEN**

Run:

```bash
npx vitest run test/ts/bundle-authoring.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/bundle/types.ts src/bundle/draft.ts src/bundle/state.ts test/ts/bundle-authoring.test.ts
git commit -m "feat: persist skill factory metadata"
```

## Task 4: Generate Minimal Comet-native Skill Packages

**Files:**
- Create: `src/factory/types.ts`
- Create: `src/factory/package.ts`
- Test: `test/ts/factory-package.test.ts`

- [x] **Step 1: Write failing package generation tests**

Create `test/ts/factory-package.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { generateFactorySkillPackage } from '../../src/factory/package.js';
import { loadSkillPackage } from '../../src/skill/load.js';
import { validateSkillPackage } from '../../src/skill/validate.js';

describe('generateFactorySkillPackage', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-factory-package-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes a valid deterministic Comet-native Skill package', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'review-workflow',
      version: '1.0.0',
      description: 'Review workflow generated from preferred Skills.',
      goal: 'Review code changes before merge.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'brainstorming', preferenceIndex: 0 },
        { skill: 'writing-plans', preferenceIndex: 1 },
        { skill: 'requesting-code-review', preferenceIndex: 2 },
      ],
      deviations: [],
      engineMode: 'deterministic',
    });

    expect(output.packageRoot).toBe(path.join(root, 'skills', 'review-workflow'));
    const pkg = await loadSkillPackage(output.packageRoot);
    expect(validateSkillPackage(pkg)).toEqual([]);
    expect(pkg.definition.orchestration.steps?.map((step) => step.id)).toEqual([
      'step-1-brainstorming',
      'step-2-writing-plans',
      'step-3-requesting-code-review',
    ]);
    expect(await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8')).toContain(
      'CLI 是内部后端',
    );
  });

  it('records deviation reasons in the generated Skill guidance', async () => {
    const output = await generateFactorySkillPackage({
      root,
      name: 'shifted-workflow',
      version: '1.0.0',
      description: 'Workflow with a justified order adjustment.',
      goal: 'Create a safer workflow.',
      defaultLocale: 'zh',
      callChain: [
        { skill: 'writing-plans', preferenceIndex: 1 },
        { skill: 'brainstorming', preferenceIndex: 0 },
      ],
      deviations: [
        {
          skill: 'writing-plans',
          expectedIndex: 1,
          actualIndex: 0,
          reason: 'The user already supplied enough requirements, so planning can happen before more exploration.',
        },
      ],
      engineMode: 'deterministic',
    });

    const skill = await fs.readFile(path.join(output.packageRoot, 'SKILL.md'), 'utf8');
    expect(skill).toContain('偏离偏好顺序');
    expect(skill).toContain('The user already supplied enough requirements');
  });
});
```

- [x] **Step 2: Run package tests and verify RED**

Run:

```bash
npx vitest run test/ts/factory-package.test.ts
```

Expected: FAIL because `src/factory/package.ts` does not exist.

- [x] **Step 3: Add Factory package types**

Create `src/factory/types.ts`:

```ts
export interface FactoryCallChainItem {
  skill: string;
  preferenceIndex: number | null;
}

export interface FactoryOrderDeviation {
  skill: string;
  expectedIndex: number;
  actualIndex: number;
  reason: string;
}

export interface FactorySkillPackagePlan {
  root: string;
  name: string;
  version: string;
  description: string;
  goal: string;
  defaultLocale: string;
  callChain: FactoryCallChainItem[];
  deviations: FactoryOrderDeviation[];
  engineMode: 'none' | 'deterministic' | 'adaptive';
}

export interface GeneratedFactorySkillPackage {
  packageRoot: string;
  skillPath: string;
  enginePath: string | null;
}
```

- [x] **Step 4: Implement deterministic package generation**

Create `src/factory/package.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { stringify } from 'yaml';
import type {
  FactorySkillPackagePlan,
  GeneratedFactorySkillPackage,
} from './types.js';

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function stepId(index: number, skill: string): string {
  return `step-${index + 1}-${slug(skill)}`;
}

function skillMarkdown(plan: FactorySkillPackagePlan): string {
  const chain = plan.callChain
    .map((item, index) => `${index + 1}. ${item.skill}`)
    .join('\n');
  const deviations =
    plan.deviations.length === 0
      ? '无。'
      : plan.deviations
          .map(
            (item) =>
              `- ${item.skill}: expected ${item.expectedIndex}, actual ${item.actualIndex}. ${item.reason}`,
          )
          .join('\n');
  return `---
name: ${plan.name}
description: ${plan.description}
---

# ${plan.name}

${plan.description}

## 目标

${plan.goal}

## 调用链

${chain}

## 偏离偏好顺序

${deviations}

## 运行方式

用户只需要调用本 Skill。CLI 是内部后端；需要持久化、恢复或运行期评估时，当前 Agent 应通过 Comet Engine action/outcome 协议推进。
`;
}

function skillDefinition(plan: FactorySkillPackagePlan): unknown {
  const steps = plan.callChain.map((item, index) => ({
    id: stepId(index, item.skill),
    action: { type: 'invoke_skill', ref: item.skill },
    ...(index + 1 < plan.callChain.length
      ? { next: stepId(index + 1, plan.callChain[index + 1].skill) }
      : {}),
  }));
  return {
    apiVersion: 'comet/v1alpha1',
    kind: 'Skill',
    metadata: {
      name: plan.name,
      version: plan.version,
      description: plan.description,
    },
    goal: {
      statement: plan.goal,
      inputs: [],
      outputs: [{ name: 'result', description: 'Generated workflow result' }],
      success: ['The generated workflow completes according to its call chain'],
    },
    orchestration: {
      mode: 'deterministic',
      entry: steps[0]?.id ?? 'complete',
      steps: steps.length > 0 ? steps : [{ id: 'complete', action: { type: 'checkpoint' } }],
    },
    skills: plan.callChain.map((item) => ({ id: item.skill })),
    agents: [],
    tools: [],
  };
}

export async function generateFactorySkillPackage(
  plan: FactorySkillPackagePlan,
): Promise<GeneratedFactorySkillPackage> {
  const packageRoot = path.resolve(plan.root, 'skills', plan.name);
  const cometRoot = path.join(packageRoot, 'comet');
  await fs.mkdir(cometRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'SKILL.md'), skillMarkdown(plan));

  if (plan.engineMode !== 'none') {
    await fs.writeFile(path.join(cometRoot, 'skill.yaml'), stringify(skillDefinition(plan)));
    await fs.writeFile(
      path.join(cometRoot, 'guardrails.yaml'),
      stringify({
        allowedSkills: plan.callChain.map((item) => item.skill),
        allowedAgents: [],
        allowedTools: [],
        maxIterations: Math.max(plan.callChain.length + 2, 5),
        maxRetriesPerAction: 2,
        confirmationRequiredFor: [],
      }),
    );
    await fs.writeFile(
      path.join(cometRoot, 'evals.yaml'),
      stringify({
        runtime: [
          {
            id: 'completed',
            scope: 'completion',
            type: 'state_equals',
            field: 'status',
            equals: 'completed',
          },
        ],
      }),
    );
  }

  return {
    packageRoot,
    skillPath: path.join(packageRoot, 'SKILL.md'),
    enginePath: plan.engineMode === 'none' ? null : cometRoot,
  };
}
```

- [x] **Step 5: Run package tests and verify GREEN**

Run:

```bash
npx vitest run test/ts/factory-package.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/factory/types.ts src/factory/package.ts test/ts/factory-package.test.ts
git commit -m "feat: generate factory skill packages"
```

## Task 5: Add Factory Guidance to `/comet-any` Chinese Skill

**Files:**
- Modify: `assets/skills-zh/comet-any/SKILL.md`
- Modify: `assets/skills-zh/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills-zh/comet-any/reference/eval-provider.md`
- Modify: `test/ts/comet-any-skill.test.ts`

- [x] **Step 1: Write failing Chinese Skill contract assertions**

In `test/ts/comet-any-skill.test.ts`, add these expected Chinese phrases to the first test:

```ts
for (const expected of [
  '用户只需要调用本 Skill',
  'CLI 是内部确定性后端',
  'Comet-native Skill',
  'find-skill',
  '推荐调用顺序',
  '偏离偏好顺序',
  '必须说明原因',
  'Engine 是运行语义底座',
  '生成 `comet/skill.yaml`',
]) {
  expect(combined).toContain(expected);
}
```

Update the ordered workflow list to include:

```ts
'读取偏好并解析真实 Skill',
'提出默认调用链',
'记录偏离原因',
'生成 Comet-native Skill 源码',
'生成 Engine Package',
```

- [x] **Step 2: Run comet-any tests and verify RED**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: FAIL because the Chinese Skill still describes Bundle creator behavior.

- [x] **Step 3: Update Chinese `/comet-any` Skill**

Modify `assets/skills-zh/comet-any/SKILL.md` so the opening model reads:

```markdown
`/comet-any` 是 Comet Skill Factory。用户只需要调用本 Skill，描述想创建或优化的工作流；
本 Skill 会读取用户偏好、用 `find-skill` 查找本地真实 Skill 内容，组合出 Comet-native
Skill，并在内部调用 CLI 后端完成校验、Eval、发布和可选分发。CLI 是内部确定性后端，
不是用户主流程。
```

Replace the old Engine warning with:

```markdown
<IMPORTANT>
Engine 是生成 Skill 的运行语义底座。多步骤、需要恢复、需要 guardrails、需要 runtime evals
或包含脚本副作用的生成物，必须生成 `comet/skill.yaml`、`guardrails.yaml` 和 `evals.yaml`。
轻量单步 Skill 可以不启用 Engine，但必须向用户说明会失去 Run 恢复和 runtime eval。
</IMPORTANT>
```

Add a hard rule:

```markdown
- `.comet/skills.txt` 的行顺序是推荐调用顺序；生成调用链时应尽量遵守，偏离时必须在评审摘要中说明偏离项和原因。
```

Update the workflow steps to include:

```markdown
### 3. 读取偏好并解析真实 Skill

读取 `.comet/skills.txt` 后调用 `find-skill`。不得只按名字推测能力；必须读取最终候选的真实
`SKILL.md`、直接 reference、rules、scripts 和 hooks。

### 6. 提出默认调用链

先按 `.comet/skills.txt` 顺序提出默认调用链。若目标、依赖、风险、上下文恢复、安全确认或平台限制要求调整顺序，列出偏离项和原因。

### 9. 生成 Comet-native Skill 源码

生成 entry Skill、internal Skill、references 和 scripts。用户不需要手动运行 `comet bundle`
或 `comet skill`。

### 10. 生成 Engine Package

为多步骤或高风险生成物生成 `comet/skill.yaml`、`guardrails.yaml` 和 `evals.yaml`。
```

- [x] **Step 4: Update Chinese references**

In `assets/skills-zh/comet-any/reference/bundle-authoring.md`, add:

```markdown
## Skill Factory 后端

`comet bundle` 是 `/comet-any` 的内部确定性后端。用户不需要直接执行 Bundle CLI。
本 Skill 必须把 creator 输出适配为 Comet-native Skill Package，再交给 Bundle 后端编译、
Eval、发布和分发。

`.comet/skills.txt` 的顺序必须作为推荐调用顺序传递到 Factory metadata。若生成调用链偏离该顺序，
评审摘要必须包含偏离原因。
```

- [x] **Step 5: Run Chinese comet-any tests**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: PASS for Chinese assertions and FAIL only if English parity assertions still expect old wording. If English parity fails, update parity in Task 6 instead of weakening the Chinese test.

- [x] **Step 6: Commit Chinese Factory guidance**

```bash
git add assets/skills-zh/comet-any test/ts/comet-any-skill.test.ts
git commit -m "feat: update chinese comet-any factory flow"
```

## Task 6: Sync English `/comet-any` Behavior

**Files:**
- Modify: `assets/skills/comet-any/SKILL.md`
- Modify: `assets/skills/comet-any/reference/bundle-authoring.md`
- Modify: `assets/skills/comet-any/reference/eval-provider.md`
- Modify: `test/ts/comet-any-skill.test.ts`

- [x] **Step 1: Add English parity assertions**

In `test/ts/comet-any-skill.test.ts`, extend the parity table:

```ts
const parity: Array<{ zh: string; en: string }> = [
  { zh: '用户只需要调用本 Skill', en: 'the user only invokes this Skill' },
  { zh: 'CLI 是内部确定性后端', en: 'CLI is the internal deterministic backend' },
  { zh: 'Comet-native Skill', en: 'Comet-native Skill' },
  { zh: 'find-skill', en: 'find-skill' },
  { zh: '推荐调用顺序', en: 'recommended call order' },
  { zh: '偏离偏好顺序', en: 'deviates from the preferred order' },
  { zh: '必须说明原因', en: 'must explain why' },
  { zh: 'Engine 是运行语义底座', en: 'Engine is the runtime semantic foundation' },
  { zh: '生成 `comet/skill.yaml`', en: 'generate `comet/skill.yaml`' },
];
```

- [x] **Step 2: Run parity tests and verify RED**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: FAIL because English files still describe the old Bundle creator model.

- [x] **Step 3: Update English `/comet-any` Skill**

Modify `assets/skills/comet-any/SKILL.md` with the English equivalent:

```markdown
`/comet-any` is the Comet Skill Factory. The user only invokes this Skill and describes the
workflow they want to create or optimize. This Skill reads user preferences, uses `find-skill`
to locate real local Skill contents, composes a Comet-native Skill, and internally calls CLI
backends for validation, Eval, publishing, and optional distribution. CLI is the internal
deterministic backend, not the user-facing workflow.
```

Replace the old Engine warning with:

```markdown
<IMPORTANT>
Engine is the runtime semantic foundation for generated Skills. Generated workflows with multiple
steps, recovery needs, guardrails, runtime evals, or script side effects must generate
`comet/skill.yaml`, `guardrails.yaml`, and `evals.yaml`. A lightweight single-step Skill may skip
Engine, but the user must be told that Run recovery and runtime evals will be unavailable.
</IMPORTANT>
```

Add the order rule:

```markdown
- The line order in `.comet/skills.txt` is the recommended call order. The generated call chain should follow it when possible; if it deviates from the preferred order, the review summary must explain why.
```

- [x] **Step 4: Update English references**

In `assets/skills/comet-any/reference/bundle-authoring.md`, add:

```markdown
## Skill Factory Backend

`comet bundle` is the internal deterministic backend for `/comet-any`. The user does not need to run
Bundle CLI directly. This Skill must adapt creator output into a Comet-native Skill Package before
passing it to the Bundle backend for compile, Eval, publish, and distribution.

The order in `.comet/skills.txt` must be preserved as Factory metadata. If the generated call chain
deviates from that order, the review summary must include the reason.
```

- [x] **Step 5: Run comet-any parity tests**

Run:

```bash
npx vitest run test/ts/comet-any-skill.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit English parity**

```bash
git add assets/skills/comet-any test/ts/comet-any-skill.test.ts
git commit -m "feat: sync english comet-any factory flow"
```

## Task 7: Documentation, Changelog, and Version Check

**Files:**
- Modify: `README-zh.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify if needed: `package.json`
- Modify if needed: `assets/manifest.json`

- [x] **Step 1: Check master version**

Run:

```bash
git show origin/master:package.json
```

Expected: identify the current master version. If the current branch already has a version exactly one increment above master, append to that version's top changelog entry. If not, update `package.json` and `assets/manifest.json` to exactly one version above master.

- [x] **Step 2: Add concise README-zh note**

In `README-zh.md`, add a short `/comet-any` note near existing Skill/Bundle documentation:

```markdown
`/comet-any` 是 Comet Skill Factory：用户只调用 Skill，描述想创建或优化的工作流；
Comet 会读取 `.comet/skills.txt` 偏好、查找本地真实 Skill 内容、尽量遵守推荐调用顺序，
并在内部使用 CLI 后端完成校验、Eval、发布和可选分发。
```

- [x] **Step 3: Add concise README note**

In `README.md`, add the English equivalent:

```markdown
`/comet-any` is the Comet Skill Factory: users invoke the Skill and describe the workflow they want
to create or optimize. Comet reads `.comet/skills.txt`, locates real local Skill contents, preserves
the recommended call order when possible, and internally uses CLI backends for validation, Eval,
publishing, and optional distribution.
```

- [x] **Step 4: Add Changelog entry**

At the top matching version in `CHANGELOG.md`, add:

```markdown
### Changed

- **`/comet-any` Skill Factory**: Repositions `/comet-any` as the user-facing Skill creation flow instead of a CLI-oriented Bundle guide. It now treats `.comet/skills.txt` as ordered preference input, resolves real local Skill contents through the shared finder, generates Comet-native Skill packages with Engine-aware semantics when needed, and requires review summaries to explain any call-order deviations.

### Tests

- **Skill Factory coverage**: Adds finder, preference-order, Factory metadata, generated Skill package, and bilingual `/comet-any` contract coverage so ordered local Skill preferences and Engine-aware generated Skills remain stable.
```

- [x] **Step 5: Run documentation tests**

Run:

```bash
npx vitest run test/ts/readme.test.ts test/ts/comet-any-skill.test.ts
git diff --check
```

Expected: PASS and no whitespace errors.

- [x] **Step 6: Commit docs and changelog**

```bash
git add README.md README-zh.md CHANGELOG.md package.json assets/manifest.json
git commit -m "docs: document comet-any skill factory"
```

## Task 8: Focused and Full Verification

**Files:**
- No source edits expected.

- [x] **Step 1: Run focused test suite**

Run:

```bash
npx vitest run \
  test/ts/skill-find.test.ts \
  test/ts/bundle-candidates.test.ts \
  test/ts/bundle-authoring.test.ts \
  test/ts/factory-package.test.ts \
  test/ts/comet-any-skill.test.ts \
  test/ts/bundle-command.test.ts
```

Expected: PASS.

- [x] **Step 2: Run required build checks**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
```

Expected: all exit 0.

- [x] **Step 3: Run required tests**

Run:

```bash
npx vitest run test/ts/comet-scripts.test.ts
npx vitest run
```

Expected: all tests pass. If unrelated failures appear, capture exact failing test names and compare with current branch status before changing unrelated code.

- [x] **Step 4: Check generated runtime freshness if compat files changed**

Run this only if `src/compat/*` was modified:

```bash
pnpm build:classic-runtime
git diff -- assets/skills/comet/scripts/comet-runtime.mjs
```

Expected: no unexpected stale runtime diff. This plan should not require `src/compat/*` edits.

- [x] **Step 5: Final diff audit**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Changed files should be limited to Skill Factory source, tests, `/comet-any` assets, README, changelog, and version files if version bump was required.

## Self-Review

- Spec coverage: Tasks 1-2 cover `find-skill`, real local Skill contents, and `preferenceIndex`; Task 3 covers Factory metadata; Task 4 covers Comet-native Skill Package generation; Tasks 5-6 cover user-facing `/comet-any` behavior; Task 7 covers docs and changelog; Task 8 covers verification.
- Preferred order: The plan preserves `.comet/skills.txt` order through finder output, Bundle candidates, Factory state, generated package call chains, Skill review guidance, tests, and acceptance criteria.
- Engine behavior: The plan generates Engine package files for deterministic call chains and leaves full runner execution to existing `comet skill run/resume`, matching the first-slice scope.
- Placeholder scan: No unresolved placeholder markers are present. All code steps contain concrete snippets or exact commands.
- Type consistency: `preferenceIndex`, `FactorySkillPackagePlan`, `FactoryOrderDeviation`, and `BundleFactoryMetadata` use the same field names across tasks.

## Execution Handoff

Plan complete once this file is saved. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
