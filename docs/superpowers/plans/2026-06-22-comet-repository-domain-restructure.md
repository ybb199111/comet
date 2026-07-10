# Comet Repository Domain Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Comet 仓库从 `src/` 技术层结构重组为顶层 `app / domains / platform / assets / eval / scripts / test / docs` 的领域结构，同时保持 CLI 对外行为和安装到用户目录后的结果兼容。

**Architecture:** 先引入统一的仓库路径注册表与过渡期构建配置，再按依赖链迁移 `platform`、`domains/comet-classic`、`domains/skill`、`domains/integrations`、`domains/engine`、`domains/bundle`、`domains/factory` 和 `app`。Classic runtime 的源码入口迁移到新域，但输出路径继续保持为 `assets/skills/comet/scripts/comet-runtime.mjs`。最后按新领域镜像重组 `test/`、`scripts/` 和 `docs/`，并删除旧 `src/` 目录。

**Tech Stack:** TypeScript ESM、Node.js 20+、Commander、esbuild、Vitest、YAML、现有 `assets/manifest.json` 资源发布链。

## Global Constraints

- 保持 `comet` CLI 对外命令名、参数名和行为不变。
- 保持安装到用户平台目录后的 `skills/`、`rules/`、`hooks/` 结构兼容。
- 本次不改变 classic runtime 的最终产物相对路径。
- 本次不把 `eval/` 降级为脚本目录；`eval/` 继续是一级工作区主题。
- 先收口路径定位，再进行目录迁移；禁止直接依赖全仓库搜索替换硬编码路径完成重组。
- 每次迁移一个依赖链切片后，先跑对应窄测试，再继续下一切片。
- 每个 `git mv` 切片必须在同一任务内修正被迁移文件内部的跨域相对 imports，再运行测试；不能只改入口文件 imports。
- `pnpm build`、`pnpm lint`、`npx vitest run` 必须在最终阶段全部通过。

---

## File Structure

### Final repository layout

```text
app/
  cli/
  commands/
domains/
  comet-classic/
  skill/
  engine/
  bundle/
  factory/
  eval/
  integrations/
platform/
  fs/
  install/
  paths/
  process/
  version/
assets/
eval/
scripts/
  build/
  benchmark/
  install/
  release/
test/
  app/
  domains/
  platform/
  fixtures/
docs/
  architecture/
  operations/
  superpowers/
```

### Transitional repository layout

在删除 `src/` 前，TypeScript 会短暂同时编译旧根和新根：

```text
src/
app/
domains/
platform/
```

这样可以让每个切片通过 `git mv` 迁移并即时修正 imports，而不是一次性断掉全部入口。

---

## Task 1: 建立路径注册表和过渡期构建配置

**Files:**
- Create: `config/repository-layout.json`
- Create: `platform/paths/repository-layout.ts`
- Create: `scripts/lib/repository-layout.mjs`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Test: `test/ts/repository-layout.test.ts`

**Contracts:**
- Produces: `config/repository-layout.json` as the single declarative source of repo path facts.
- Produces: `readRepositoryLayout()` and `resolveRepositoryPath()` for TypeScript runtime code.
- Produces: `readRepositoryLayout()` for Node build scripts under `scripts/`.
- Preserves: classic runtime output path `assets/skills/comet/scripts/comet-runtime.mjs`.
- Enables: compiling both `src/**` and new top-level `app/**`, `domains/**`, `platform/**` during migration.

- [x] **Step 1: Write failing repository-layout contract tests**

Create `test/ts/repository-layout.test.ts`:

```typescript
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  readRepositoryLayout,
  resolveRepositoryPath,
} from '../../platform/paths/repository-layout.js';

describe('repository layout registry', () => {
  it('resolves the manifest and classic runtime output paths', () => {
    const layout = readRepositoryLayout();

    expect(layout.assetsRoot).toBe('assets');
    expect(layout.manifestPath).toBe('assets/manifest.json');
    expect(layout.classicRuntime.output).toBe('assets/skills/comet/scripts/comet-runtime.mjs');
    expect(resolveRepositoryPath(layout.classicRuntime.output)).toBe(
      path.resolve('assets', 'skills', 'comet', 'scripts', 'comet-runtime.mjs'),
    );
  });

  it('tracks all transitional source roots', () => {
    const layout = readRepositoryLayout();

    expect(layout.sourceRoots).toEqual(['src', 'app', 'domains', 'platform']);
  });
});
```

- [x] **Step 2: Run the new contract test and verify failure**

Run:

```bash
npx vitest run test/ts/repository-layout.test.ts
```

Expected: fail with module resolution error for `platform/paths/repository-layout.js`.

- [x] **Step 3: Add the declarative layout file**

Create `config/repository-layout.json`:

```json
{
  "assetsRoot": "assets",
  "manifestPath": "assets/manifest.json",
  "skillsRoots": {
    "en": "assets/skills",
    "zh": "assets/skills-zh"
  },
  "classicRuntime": {
    "entry": "domains/comet-classic/classic-cli.ts",
    "output": "assets/skills/comet/scripts/comet-runtime.mjs"
  },
  "sourceRoots": ["src", "app", "domains", "platform"],
  "testRoots": ["test"]
}
```

- [x] **Step 4: Add TypeScript and Node readers for the layout registry**

Create `platform/paths/repository-layout.ts`:

```typescript
import path from 'path';
import layout from '../../config/repository-layout.json' with { type: 'json' };

export interface RepositoryLayout {
  assetsRoot: string;
  manifestPath: string;
  skillsRoots: { en: string; zh: string };
  classicRuntime: { entry: string; output: string };
  sourceRoots: string[];
  testRoots: string[];
}

const repositoryLayout = layout as RepositoryLayout;

export function readRepositoryLayout(): RepositoryLayout {
  return repositoryLayout;
}

export function resolveRepositoryPath(relativePath: string): string {
  return path.resolve(...relativePath.split('/'));
}
```

Create `scripts/lib/repository-layout.mjs`:

```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const layoutPath = path.join(repoRoot, 'config', 'repository-layout.json');

export function readRepositoryLayout() {
  return JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
}

export function resolveRepositoryPath(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}
```

- [x] **Step 5: Broaden build, lint, and test config for the transition**

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "lib": ["ES2022"],
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*", "app/**/*", "domains/**/*", "platform/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

Update `vitest.config.ts` coverage and include paths:

```typescript
export default defineConfig({
  test: {
    testTimeout: 30000,
    include: ['test/**/*.test.ts'],
    exclude: [
      'test/**/context-compression-benchmark.test.ts',
      'test/**/context-execution-benchmark.test.ts',
    ],
    coverage: {
      include: ['src/**/*.ts', 'app/**/*.ts', 'domains/**/*.ts', 'platform/**/*.ts'],
      exclude: ['app/cli/**', 'app/commands/**', 'src/cli/**', 'src/commands/**'],
      thresholds: { branches: 70, functions: 80, lines: 80, statements: 80 },
    },
  },
});
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "lint": "eslint src/ app/ domains/ platform/",
    "lint:fix": "eslint src/ app/ domains/ platform/ --fix",
    "format": "prettier --write src/ app/ domains/ platform/",
    "format:check": "prettier --check src/ app/ domains/ platform/"
  }
}
```

- [x] **Step 6: Run the contract test and the existing runtime freshness check**

Run:

```bash
npx vitest run test/ts/repository-layout.test.ts test/ts/classic-runtime.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit the layout foundation**

```bash
git add config/repository-layout.json platform/paths/repository-layout.ts scripts/lib/repository-layout.mjs tsconfig.json vitest.config.ts package.json test/ts/repository-layout.test.ts
git commit -m "refactor: add repository layout registry"
```

---

## Task 2: 迁移 platform 层并统一共享 imports

**Files:**
- Create: `platform/fs/file-system.ts`
- Create: `platform/install/detect.ts`
- Create: `platform/install/platforms.ts`
- Create: `platform/process/command-error.ts`
- Create: `platform/process/shell-quote.ts`
- Create: `platform/version/version.ts`
- Modify: `src/commands/init.ts`
- Modify: `src/commands/update.ts`
- Modify: `src/commands/uninstall.ts`
- Modify: `src/core/skills.ts`
- Test: `test/ts/detect.test.ts`
- Test: `test/ts/init.test.ts`
- Test: `test/ts/update.test.ts`

**Contracts:**
- Produces: `platform/*` as the only home for environment-level helpers.
- Preserves: all platform detection behavior and install target resolution semantics.
- Removes: new call sites to `src/core/platforms.ts`, `src/core/detect.ts`, and `src/utils/file-system.ts`.

- [x] **Step 1: Move the platform files without renaming behavior**

Run:

```bash
git mv src/utils/file-system.ts platform/fs/file-system.ts
git mv src/core/detect.ts platform/install/detect.ts
git mv src/core/platforms.ts platform/install/platforms.ts
git mv src/core/command-error.ts platform/process/command-error.ts
git mv src/core/shell-quote.ts platform/process/shell-quote.ts
git mv src/core/version.ts platform/version/version.ts
```

- [x] **Step 2: Rewrite imports in the existing command and skill-surface files**

Update `src/commands/init.ts` imports:

```typescript
import { PLATFORMS, getPlatformSkillsDir, type Platform } from '../../platform/install/platforms.js';
import { detectPlatforms, hasSkills, getBaseDir, type InstallScope } from '../../platform/install/detect.js';
import { printVersionInfo } from '../../platform/version/version.js';
```

Update `src/commands/update.ts` imports:

```typescript
import { fileExists, readDir, readJson } from '../../platform/fs/file-system.js';
import { getBaseDir } from '../../platform/install/detect.js';
import { PLATFORMS, getPlatformSkillsDir, type Platform } from '../../platform/install/platforms.js';
import { printVersionInfo } from '../../platform/version/version.js';
```

Update `src/core/skills.ts` imports:

```typescript
import { fileExists, readJson, copyFile, ensureDir } from '../../platform/fs/file-system.js';
import { getPlatformSkillsDir, type Platform } from '../../platform/install/platforms.js';
```

- [x] **Step 3: Run focused platform and install tests**

Run:

```bash
npx vitest run test/ts/detect.test.ts test/ts/init.test.ts test/ts/update.test.ts test/ts/uninstall.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit the platform slice**

```bash
git add platform src/commands/init.ts src/commands/update.ts src/commands/uninstall.ts src/core/skills.ts
git commit -m "refactor: move shared platform utilities to top-level platform"
```

---

## Task 3: 迁移 `domains/comet-classic` 并保持 runtime 产物路径稳定

**Files:**
- Create: `domains/comet-classic/classic-archive.ts`
- Create: `domains/comet-classic/classic-cli.ts`
- Create: `domains/comet-classic/classic-evidence.ts`
- Create: `domains/comet-classic/classic-guard.ts`
- Create: `domains/comet-classic/classic-handoff.ts`
- Create: `domains/comet-classic/classic-hook-guard.ts`
- Create: `domains/comet-classic/classic-migrate.ts`
- Create: `domains/comet-classic/classic-paths.ts`
- Create: `domains/comet-classic/classic-resolver.ts`
- Create: `domains/comet-classic/classic-runtime-run.ts`
- Create: `domains/comet-classic/classic-state-command.ts`
- Create: `domains/comet-classic/classic-state.ts`
- Create: `domains/comet-classic/classic-store.ts`
- Create: `domains/comet-classic/classic-validate-command.ts`
- Create: `domains/comet-classic/index.ts`
- Modify: `scripts/build-classic-runtime.mjs`
- Modify: `build.js`
- Modify: `test/ts/classic-archive.test.ts`
- Modify: `test/ts/classic-contract.test.ts`
- Modify: `test/ts/classic-evidence.test.ts`
- Modify: `test/ts/classic-guard.test.ts`
- Modify: `test/ts/classic-handoff.test.ts`
- Modify: `test/ts/classic-hook-guard.test.ts`
- Modify: `test/ts/classic-migrate.test.ts`
- Modify: `test/ts/classic-resolver.test.ts`
- Modify: `test/ts/classic-runtime.test.ts`
- Modify: `test/ts/classic-state.test.ts`
- Modify: `test/ts/comet-scripts-guard.test.ts`
- Modify: `test/ts/comet-scripts-hook-guard.test.ts`
- Modify: `test/ts/comet-scripts-recovery.test.ts`
- Modify: `test/ts/comet-scripts.test.ts`
- Modify: `test/ts/helpers/comet-test-utils.ts`

**Contracts:**
- Produces: `domains/comet-classic/` as the new source root for classic runtime logic.
- Preserves: output file `assets/skills/comet/scripts/comet-runtime.mjs`.
- Preserves: all classic command dispatch semantics and freshness checks.
- Removes: moved classic files continuing to import sibling modules through stale `src/compat/*` relative paths.

- [x] **Step 1: Move the classic source files into the new domain root**

Run:

```bash
git mv src/compat/classic-archive.ts domains/comet-classic/classic-archive.ts
git mv src/compat/classic-cli.ts domains/comet-classic/classic-cli.ts
git mv src/compat/classic-evidence.ts domains/comet-classic/classic-evidence.ts
git mv src/compat/classic-guard.ts domains/comet-classic/classic-guard.ts
git mv src/compat/classic-handoff.ts domains/comet-classic/classic-handoff.ts
git mv src/compat/classic-hook-guard.ts domains/comet-classic/classic-hook-guard.ts
git mv src/compat/classic-migrate.ts domains/comet-classic/classic-migrate.ts
git mv src/compat/classic-paths.ts domains/comet-classic/classic-paths.ts
git mv src/compat/classic-resolver.ts domains/comet-classic/classic-resolver.ts
git mv src/compat/classic-runtime-run.ts domains/comet-classic/classic-runtime-run.ts
git mv src/compat/classic-state-command.ts domains/comet-classic/classic-state-command.ts
git mv src/compat/classic-state.ts domains/comet-classic/classic-state.ts
git mv src/compat/classic-store.ts domains/comet-classic/classic-store.ts
git mv src/compat/classic-validate-command.ts domains/comet-classic/classic-validate-command.ts
git mv src/compat/index.ts domains/comet-classic/index.ts
```

- [x] **Step 2: Point the runtime build script at the registry entry instead of hardcoding `src/compat`**

- [x] **Step 2: Rewrite moved classic-file imports before touching tests**

Inside `domains/comet-classic/*`, rewrite every import that still points at `../engine/*` or `../skill/*` from the old `src/compat` depth so the moved files compile from their new location. At minimum, this includes the imports currently present in:

- `classic-archive.ts`
- `classic-handoff.ts`
- `classic-migrate.ts`
- `classic-resolver.ts`
- `classic-runtime-run.ts`
- `classic-state.ts`
- `classic-state-command.ts`
- `classic-store.ts`

Use `../../domains/engine/*` and `../../domains/skill/*` only where the moved file now truly crosses domains; keep `./classic-*` imports local within `domains/comet-classic/`.

- [x] **Step 3: Point the runtime build script at the registry entry instead of hardcoding `src/compat`**

Update `scripts/build-classic-runtime.mjs`:

```javascript
#!/usr/bin/env node

import { build } from 'esbuild';
import { promises as fs } from 'fs';
import { readRepositoryLayout, resolveRepositoryPath } from './lib/repository-layout.mjs';

const layout = readRepositoryLayout();
const outputFile = resolveRepositoryPath(layout.classicRuntime.output);
const entryPoint = layout.classicRuntime.entry;

async function bundledRuntime() {
  const result = await build({
    absWorkingDir: resolveRepositoryPath('.'),
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: ['node20'],
    packages: 'bundle',
    sourcemap: false,
    legalComments: 'none',
    charset: 'utf8',
    treeShaking: true,
    banner: {
      js: [
        '#!/usr/bin/env node',
        "import { createRequire as __cometCreateRequire } from 'module';",
        'const require = __cometCreateRequire(import.meta.url);',
      ].join('\n'),
    },
  });
  return result.outputFiles[0].contents;
}
```

- [x] **Step 4: Rewrite classic test imports to the new domain path**

Update these files and only these files in this slice:

- `test/ts/classic-evidence.test.ts`
- `test/ts/classic-migrate.test.ts`
- `test/ts/classic-resolver.test.ts`
- `test/ts/classic-runtime.test.ts`
- `test/ts/classic-state.test.ts`

Required replacements:

```typescript
// test/ts/classic-evidence.test.ts
import { collectClassicEvidence, evidenceSatisfied } from '../../domains/comet-classic/classic-evidence.js';
import type { ClassicStateProjection } from '../../domains/comet-classic/classic-state.js';

// test/ts/classic-migrate.test.ts
import { ensureClassicRun } from '../../domains/comet-classic/classic-migrate.js';
import { readClassicState, writeClassicState } from '../../domains/comet-classic/classic-store.js';
import type { ClassicState } from '../../domains/comet-classic/classic-state.js';

// test/ts/classic-resolver.test.ts
import { resolveClassicNextStep } from '../../domains/comet-classic/classic-resolver.js';
import type { ClassicEvidence } from '../../domains/comet-classic/classic-evidence.js';
import type { ClassicState } from '../../domains/comet-classic/classic-state.js';

// test/ts/classic-state.test.ts
import { readClassicState, writeClassicState } from '../../domains/comet-classic/classic-store.js';
import type { ClassicState } from '../../domains/comet-classic/classic-state.js';

// test/ts/classic-runtime.test.ts
const { runClassicCli } = await import('../../domains/comet-classic/classic-cli.js');
```

- [x] **Step 5: Run the classic-focused test slice**

Run:

```bash
npx vitest run test/ts/classic-runtime.test.ts test/ts/classic-contract.test.ts test/ts/classic-guard.test.ts test/ts/classic-handoff.test.ts test/ts/classic-archive.test.ts test/ts/comet-scripts.test.ts test/ts/comet-scripts-recovery.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit the classic migration slice**

```bash
git add domains/comet-classic scripts/build-classic-runtime.mjs build.js test/ts test/ts/helpers/comet-test-utils.ts
git commit -m "refactor: move classic runtime into comet-classic domain"
```

---

## Task 4: 迁移 `domains/skill` 与 `domains/integrations`

**Files:**
- Create: `domains/skill/discovery.ts`
- Create: `domains/skill/find.ts`
- Create: `domains/skill/install.ts`
- Create: `domains/skill/load.ts`
- Create: `domains/skill/platform-install.ts`
- Create: `domains/skill/snapshot.ts`
- Create: `domains/skill/types.ts`
- Create: `domains/skill/validate.ts`
- Create: `domains/integrations/openspec.ts`
- Create: `domains/integrations/superpowers.ts`
- Create: `domains/integrations/codegraph.ts`
- Modify: `src/commands/skill.ts`
- Modify: `src/commands/init.ts`
- Modify: `src/commands/update.ts`
- Modify: `src/commands/status.ts`
- Modify: `src/commands/doctor.ts`
- Modify: `src/commands/bundle.ts`
- Test: `test/ts/skill-*.test.ts`
- Test: `test/ts/skills.test.ts`
- Test: `test/ts/init.test.ts`
- Test: `test/ts/update.test.ts`

**Contracts:**
- Produces: `domains/skill/` as the home of discovery, install, load, validate, and snapshot.
- Produces: `domains/integrations/*` as the home of OpenSpec, Superpowers, and Codegraph logic.
- Removes: runtime imports from `src/skill/*` and `src/core/{skills,openspec,superpowers,codegraph}.ts`.

- [x] **Step 1: Move the skill package files**

Run:

```bash
git mv src/skill/discovery.ts domains/skill/discovery.ts
git mv src/skill/find.ts domains/skill/find.ts
git mv src/skill/install.ts domains/skill/install.ts
git mv src/skill/load.ts domains/skill/load.ts
git mv src/skill/snapshot.ts domains/skill/snapshot.ts
git mv src/skill/types.ts domains/skill/types.ts
git mv src/skill/validate.ts domains/skill/validate.ts
git mv src/core/skills.ts domains/skill/platform-install.ts
git mv src/core/openspec.ts domains/integrations/openspec.ts
git mv src/core/superpowers.ts domains/integrations/superpowers.ts
git mv src/core/codegraph.ts domains/integrations/codegraph.ts
```

- [x] **Step 2: Rewrite command imports to the new domain entrypoints**

Update `src/commands/skill.ts` imports:

```typescript
import { resolveSkill } from '../../domains/skill/discovery.js';
import { installProjectSkill } from '../../domains/skill/install.js';
```

Update `src/commands/init.ts` imports:

```typescript
import {
  copyCometSkillsForPlatform,
  copyCometRulesForPlatform,
  installCometHooksForPlatform,
  createWorkingDirs,
  type LanguageConfig,
} from '../../domains/skill/platform-install.js';
import { installOpenSpec, isCommandAvailable } from '../../domains/integrations/openspec.js';
import { installSuperpowersForPlatforms } from '../../domains/integrations/superpowers.js';
import {
  hasCodegraphProjectIndex,
  installCodegraph,
  resolveCodegraphCommand,
} from '../../domains/integrations/codegraph.js';
```

Update `src/commands/update.ts` imports similarly:

```typescript
import {
  copyCometSkillsForPlatform,
  copyCometRulesForPlatform,
  installCometHooksForPlatform,
  getManifestSkills,
} from '../../domains/skill/platform-install.js';
import { hasCodegraphProjectIndex, installCodegraph } from '../../domains/integrations/codegraph.js';
```

Update `src/commands/doctor.ts` imports:

```typescript
import { isCommandAvailable } from '../../domains/integrations/openspec.js';
import { hasCodegraphProjectIndex, resolveCodegraphCommand } from '../../domains/integrations/codegraph.js';
import { readManifest, getAssetsDir, getManagedSkillPaths } from '../../domains/skill/platform-install.js';
```

- [x] **Step 3: Run the skill and install/update test slice**

Run:

```bash
npx vitest run test/ts/skill-discovery.test.ts test/ts/skill-install.test.ts test/ts/skill-load.test.ts test/ts/skill-snapshot.test.ts test/ts/skill-validate.test.ts test/ts/skills.test.ts test/ts/init.test.ts test/ts/update.test.ts test/ts/doctor.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit the skill and integration slice**

```bash
git add domains/skill domains/integrations src/commands/skill.ts src/commands/init.ts src/commands/update.ts src/commands/status.ts src/commands/doctor.ts src/commands/bundle.ts
git commit -m "refactor: move skill and integration modules into domains"
```

---

## Task 5: 迁移 `domains/engine`、`domains/bundle`、`domains/factory` 并引入 `domains/eval` 边界

**Files:**
- Create: `domains/engine/evals.ts`
- Create: `domains/engine/guardrails.ts`
- Create: `domains/engine/loop.ts`
- Create: `domains/engine/manual-run.ts`
- Create: `domains/engine/resolver.ts`
- Create: `domains/engine/run-store.ts`
- Create: `domains/engine/standalone-run.ts`
- Create: `domains/engine/state.ts`
- Create: `domains/engine/types.ts`
- Create: `domains/bundle/bundle-platform.ts`
- Create: `domains/bundle/candidates.ts`
- Create: `domains/bundle/compatibility-benchmark.ts`
- Create: `domains/bundle/compiler.ts`
- Create: `domains/bundle/distribute.ts`
- Create: `domains/bundle/draft.ts`
- Create: `domains/bundle/eval.ts`
- Create: `domains/bundle/factory-plan.ts`
- Create: `domains/bundle/factory-resolve.ts`
- Create: `domains/bundle/factory.ts`
- Create: `domains/bundle/hash.ts`
- Create: `domains/bundle/load.ts`
- Create: `domains/bundle/platform.ts`
- Create: `domains/bundle/preferences.ts`
- Create: `domains/bundle/publish.ts`
- Create: `domains/bundle/review-summary.ts`
- Create: `domains/bundle/state.ts`
- Create: `domains/bundle/types.ts`
- Create: `domains/bundle/validate.ts`
- Create: `domains/factory/package.ts`
- Create: `domains/factory/types.ts`
- Create: `domains/eval/index.ts`
- Create: `domains/eval/repository-benchmarks.ts`
- Modify: `src/commands/bundle.ts`
- Modify: `src/commands/status.ts`
- Modify: `src/commands/doctor.ts`
- Test: `test/ts/engine-*.test.ts`
- Test: `test/ts/bundle-*.test.ts`
- Test: `test/ts/factory-package.test.ts`

**Contracts:**
- Produces: engine, bundle, and factory top-level domains.
- Produces: a minimal `domains/eval` TypeScript boundary for repository-owned benchmark orchestration without moving Python scaffold out of `eval/`.
- Removes: new imports from `src/engine`, `src/bundle`, and `src/factory`.
- Removes: moved engine/bundle/factory files continuing to resolve peers through stale `../*` paths that only worked under `src/`.

- [x] **Step 1: Move the engine, bundle, and factory source trees**

Run:

```bash
git mv src/engine domains/engine
git mv src/bundle domains/bundle
git mv src/factory domains/factory
git mv src/core/bundle-platform.ts domains/bundle/bundle-platform.ts
```

- [x] **Step 2: Add a thin repository eval boundary without disturbing `eval/` workspace layout**

Create `domains/eval/index.ts`:

```typescript
import { readRepositoryLayout, resolveRepositoryPath } from '../../platform/paths/repository-layout.js';

export interface RepositoryEvalWorkspace {
  root: string;
  localRoot: string;
  langsmithRoot: string;
}

export function resolveRepositoryEvalWorkspace(): RepositoryEvalWorkspace {
  const layout = readRepositoryLayout();
  void layout;
  return {
    root: resolveRepositoryPath('eval'),
    localRoot: resolveRepositoryPath('eval/local'),
    langsmithRoot: resolveRepositoryPath('eval/langsmith'),
  };
}
```

Create `domains/eval/repository-benchmarks.ts`:

```typescript
import { resolveRepositoryEvalWorkspace } from './index.js';

export function resolveBenchmarkPaths() {
  const workspace = resolveRepositoryEvalWorkspace();
  return {
    contextCompression: `${workspace.root}/local/tests`,
    contextExecution: `${workspace.root}/local/tests`,
    regressionBaseline: `${workspace.root}/local/regression_baseline.json`,
  };
}
```

- [x] **Step 3: Rewrite moved engine, bundle, and factory imports before command rewiring**

After the `git mv`, update imports inside the moved trees so they compile from `domains/` instead of `src/`. This includes, at minimum:

- `domains/engine/*` imports that still point to `../skill/*`
- `domains/bundle/*` imports that still point to `../skill/*`, `../factory/*`, or `../core/bundle-platform.js`
- `domains/factory/*` imports that need to stay local under `./`

If a bundle module still needs the former `src/core/bundle-platform.ts`, switch it to `domains/bundle/bundle-platform.ts` in this same slice rather than deferring to a later cleanup.

- [x] **Step 4: Rewrite bundle and runtime command imports to the new domain roots**

Update `src/commands/bundle.ts` imports:

```typescript
import { discoverBundleCandidates } from '../../domains/bundle/candidates.js';
import {
  generateBundleDraftFromFactoryState,
  initializeBundleFactoryState,
} from '../../domains/bundle/factory.js';
import { resolveBundleFactoryCandidate } from '../../domains/bundle/factory-resolve.js';
import { readSkillPreferences } from '../../domains/bundle/preferences.js';
import { createBundleDraft, optimizeBundleDraft } from '../../domains/bundle/draft.js';
import { loadBundle } from '../../domains/bundle/load.js';
import { reconcileBundleAuthoringState } from '../../domains/bundle/state.js';
import { compileBundleIr } from '../../domains/bundle/compiler.js';
import { compileBundleForPlatform } from '../../domains/bundle/platform.js';
import { buildBundleReviewSummary } from '../../domains/bundle/review-summary.js';
import { listBundlePlatformTargets } from '../../domains/bundle/bundle-platform.js';
import { planBundleEval, recordBundleEval } from '../../domains/bundle/eval.js';
import { publishBundle, reviewBundle } from '../../domains/bundle/publish.js';
import { distributeBundle } from '../../domains/bundle/distribute.js';
import type { BundleCapability } from '../../domains/bundle/types.js';
```

- [x] **Step 5: Run the engine and bundle test slice**

Run:

```bash
npx vitest run test/ts/engine-state.test.ts test/ts/engine-run-store.test.ts test/ts/engine-guardrails.test.ts test/ts/engine-evals.test.ts test/ts/engine-loop.test.ts test/ts/engine-manual-run.test.ts test/ts/engine-standalone-run.test.ts test/ts/bundle-command.test.ts test/ts/bundle-compiler.test.ts test/ts/bundle-distribute.test.ts test/ts/bundle-publish.test.ts test/ts/factory-package.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit the remaining domain slice**

```bash
git add domains/engine domains/bundle domains/factory domains/eval src/commands/bundle.ts src/commands/status.ts src/commands/doctor.ts
git commit -m "refactor: move engine bundle and factory into domains"
```

---

## Task 6: 迁移 `app/` 入口层并切断对 `src/` 的运行时依赖

**Files:**
- Create: `app/cli/index.ts`
- Create: `app/commands/bundle.ts`
- Create: `app/commands/doctor.ts`
- Create: `app/commands/i18n.ts`
- Create: `app/commands/init.ts`
- Create: `app/commands/platform-select-prompt.ts`
- Create: `app/commands/skill.ts`
- Create: `app/commands/status.ts`
- Create: `app/commands/uninstall.ts`
- Create: `app/commands/update.ts`
- Modify: `bin/comet.js`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `test/ts/helpers/ensure-cli-built.ts`
- Test: `test/ts/skill-command.test.ts`
- Test: `test/ts/status.test.ts`
- Test: `test/ts/doctor.test.ts`
- Test: `test/ts/update.test.ts`
- Test: `test/ts/init-e2e.test.ts`

**Contracts:**
- Produces: `app/` as the only command-entry source root.
- Preserves: `bin/comet.js` command surface.
- Removes: runtime dependency on `src/cli` and `src/commands`.
- Preserves: CLI E2E build freshness checks after the compiled entry moves to `dist/app/cli/index.js`.

- [x] **Step 1: Move the CLI and command sources into `app/`**

Run:

```bash
git mv src/cli app/cli
git mv src/commands app/commands
```

- [x] **Step 2: Update the binary entry to the new dist location**

Update `bin/comet.js`:

```javascript
#!/usr/bin/env node

import '../dist/app/cli/index.js';
```

- [x] **Step 3: Rewrite the new app-layer imports to point at domains and platform**

Update `app/cli/index.ts` imports:

```typescript
import { initCommand } from '../commands/init.js';
import { statusCommand } from '../commands/status.js';
import { doctorCommand } from '../commands/doctor.js';
import { updateCommand } from '../commands/update.js';
import { uninstallCommand } from '../commands/uninstall.js';
```

Update `app/commands/skill.ts` imports:

```typescript
import {
  evaluateManualRun,
  resumeManualRun,
  startManualRun,
  upgradeManualRun,
} from '../../domains/engine/manual-run.js';
import {
  evaluateStandaloneRun,
  resumeStandaloneRun,
  startStandaloneRun,
  upgradeStandaloneRun,
} from '../../domains/engine/standalone-run.js';
import { resolveSkill } from '../../domains/skill/discovery.js';
import { installProjectSkill } from '../../domains/skill/install.js';
```

Keep the rest of `app/commands/*.ts` imports unchanged relative to Task 2-5 unless a move in this task changes only the `../commands/*` local references. Because `src/commands/*` and `app/commands/*` are both two levels below repo root, all already-rewritten `../../domains/*` and `../../platform/*` imports should remain valid after the move.

- [x] **Step 4: Update CLI build probes and helpers to the new compiled entry**

Update `test/ts/helpers/ensure-cli-built.ts` so the freshness check looks for `dist/app/cli/index.js` after the app-layer move. In this same slice, search for any remaining repository-owned references to `dist/cli/index.js` and update them if they are part of the CLI build/test path.

- [x] **Step 5: Remove `src/**` from compiler, lint, and coverage roots**

Update `tsconfig.json` include section:

```json
"include": ["app/**/*", "domains/**/*", "platform/**/*"]
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "lint": "eslint app/ domains/ platform/",
    "lint:fix": "eslint app/ domains/ platform/ --fix",
    "format": "prettier --write app/ domains/ platform/",
    "format:check": "prettier --check app/ domains/ platform/"
  }
}
```

Update `vitest.config.ts` coverage include:

```typescript
coverage: {
  include: ['app/**/*.ts', 'domains/**/*.ts', 'platform/**/*.ts'],
  exclude: ['app/cli/**', 'app/commands/**'],
  thresholds: { branches: 70, functions: 80, lines: 80, statements: 80 },
}
```

- [x] **Step 6: Run the command-surface test slice**

Run:

```bash
npx vitest run test/ts/skill-command.test.ts test/ts/status.test.ts test/ts/doctor.test.ts test/ts/update.test.ts test/ts/init.test.ts test/ts/init-e2e.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit the app migration**

```bash
git add app bin/comet.js tsconfig.json vitest.config.ts package.json test/ts/helpers/ensure-cli-built.ts
git commit -m "refactor: move CLI entrypoints into app layer"
```

---

## Task 7: 重组 `scripts/`、`test/`、`docs/` 并删除旧 `src/`

**Files:**
- Create: `scripts/build/*`
- Create: `scripts/benchmark/*`
- Create: `scripts/install/*`
- Create: `scripts/release/*`
- Create: `test/app/*`
- Create: `test/domains/*`
- Create: `test/platform/*`
- Create: `docs/architecture/*`
- Create: `docs/operations/*`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CONTRIBUTING-zh.md`
- Delete: `src/`

**Contracts:**
- Produces: test layout that mirrors app/domains/platform boundaries.
- Produces: script layout that distinguishes build, benchmark, install, and release concerns.
- Preserves: all test behavior and benchmark command behavior.
- Removes: the final old `src/` directory and old flat script organization.

- [x] **Step 1: Move scripts into grouped directories and update package.json commands**

Run:

```bash
git mv scripts/build-classic-runtime.mjs scripts/build/build-classic-runtime.mjs
git mv scripts/classic-baseline-regression.mjs scripts/benchmark/classic-baseline-regression.mjs
git mv scripts/comet-bundle-compatibility-benchmark.mjs scripts/benchmark/comet-bundle-compatibility-benchmark.mjs
git mv scripts/context-compression-benchmark.mjs scripts/benchmark/context-compression-benchmark.mjs
git mv scripts/context-execution-benchmark.mjs scripts/benchmark/context-execution-benchmark.mjs
git mv scripts/postinstall.js scripts/install/postinstall.js
git mv scripts/prepublish-check.js scripts/release/prepublish-check.js
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "build:classic-runtime": "node scripts/build/build-classic-runtime.mjs",
    "benchmark:context": "node scripts/benchmark/context-compression-benchmark.mjs",
    "benchmark:execution": "node scripts/benchmark/context-execution-benchmark.mjs",
    "benchmark:classic": "node scripts/benchmark/classic-baseline-regression.mjs",
    "benchmark:bundle": "pnpm build && node scripts/benchmark/comet-bundle-compatibility-benchmark.mjs",
    "prepublishOnly": "node scripts/release/prepublish-check.js && pnpm run build",
    "postinstall": "node scripts/install/postinstall.js"
  }
}
```

Also update `package.json` packaging metadata in the same commit:

```json
{
  "files": [
    "dist",
    "bin",
    "assets",
    "scripts/install/postinstall.js",
    "!dist/**/*.test.js",
    "!dist/**/__tests__"
  ],
  "lint-staged": {
    "src/**/*.{ts,tsx,js,mjs,cjs,json,md,yaml,yml}": "prettier --write",
    "app/**/*.{ts,tsx,js,mjs,cjs,json,md,yaml,yml}": "prettier --write",
    "domains/**/*.{ts,tsx,js,mjs,cjs,json,md,yaml,yml}": "prettier --write",
    "platform/**/*.{ts,tsx,js,mjs,cjs,json,md,yaml,yml}": "prettier --write"
  }
}
```

- [x] **Step 2: Move tests into app/domains/platform mirrors**

Run these exact moves:

```bash
git mv test/ts/detect.test.ts test/platform/detect.test.ts
git mv test/ts/file-system.test.ts test/platform/file-system.test.ts
git mv test/ts/platform-select-prompt.test.ts test/platform/platform-select-prompt.test.ts
git mv test/ts/runtime-contract.test.ts test/platform/runtime-contract.test.ts
git mv test/ts/shell-quote.test.ts test/platform/shell-quote.test.ts
git mv test/ts/version.test.ts test/platform/version.test.ts
git mv test/ts/init.test.ts test/app/init.test.ts
git mv test/ts/init-e2e.test.ts test/app/init-e2e.test.ts
git mv test/ts/update.test.ts test/app/update.test.ts
git mv test/ts/status.test.ts test/app/status.test.ts
git mv test/ts/doctor.test.ts test/app/doctor.test.ts
git mv test/ts/skill-command.test.ts test/app/skill-command.test.ts
git mv test/ts/uninstall.test.ts test/app/uninstall.test.ts
git mv test/ts/classic-archive.test.ts test/domains/comet-classic/classic-archive.test.ts
git mv test/ts/classic-contract.test.ts test/domains/comet-classic/classic-contract.test.ts
git mv test/ts/classic-evidence.test.ts test/domains/comet-classic/classic-evidence.test.ts
git mv test/ts/classic-guard.test.ts test/domains/comet-classic/classic-guard.test.ts
git mv test/ts/classic-handoff.test.ts test/domains/comet-classic/classic-handoff.test.ts
git mv test/ts/classic-hook-guard.test.ts test/domains/comet-classic/classic-hook-guard.test.ts
git mv test/ts/classic-migrate.test.ts test/domains/comet-classic/classic-migrate.test.ts
git mv test/ts/classic-resolver.test.ts test/domains/comet-classic/classic-resolver.test.ts
git mv test/ts/classic-runtime.test.ts test/domains/comet-classic/classic-runtime.test.ts
git mv test/ts/classic-state.test.ts test/domains/comet-classic/classic-state.test.ts
git mv test/ts/engine-evals.test.ts test/domains/engine/engine-evals.test.ts
git mv test/ts/engine-foundation.integration.test.ts test/domains/engine/engine-foundation.integration.test.ts
git mv test/ts/engine-guardrails.test.ts test/domains/engine/engine-guardrails.test.ts
git mv test/ts/engine-loop.test.ts test/domains/engine/engine-loop.test.ts
git mv test/ts/engine-manual-run.test.ts test/domains/engine/engine-manual-run.test.ts
git mv test/ts/engine-resolver.test.ts test/domains/engine/engine-resolver.test.ts
git mv test/ts/engine-run-store.test.ts test/domains/engine/engine-run-store.test.ts
git mv test/ts/engine-schema-compat.test.ts test/domains/engine/engine-schema-compat.test.ts
git mv test/ts/engine-standalone-run.test.ts test/domains/engine/engine-standalone-run.test.ts
git mv test/ts/engine-state.test.ts test/domains/engine/engine-state.test.ts
git mv test/ts/bundle-authoring.test.ts test/domains/bundle/bundle-authoring.test.ts
git mv test/ts/bundle-candidates.test.ts test/domains/bundle/bundle-candidates.test.ts
git mv test/ts/bundle-cli-e2e.test.ts test/domains/bundle/bundle-cli-e2e.test.ts
git mv test/ts/bundle-command.test.ts test/domains/bundle/bundle-command.test.ts
git mv test/ts/bundle-compiler.test.ts test/domains/bundle/bundle-compiler.test.ts
git mv test/ts/bundle-distribute.test.ts test/domains/bundle/bundle-distribute.test.ts
git mv test/ts/bundle-eval.test.ts test/domains/bundle/bundle-eval.test.ts
git mv test/ts/bundle-factory-plan.test.ts test/domains/bundle/bundle-factory-plan.test.ts
git mv test/ts/bundle-hash.test.ts test/domains/bundle/bundle-hash.test.ts
git mv test/ts/bundle-load.test.ts test/domains/bundle/bundle-load.test.ts
git mv test/ts/bundle-locale.test.ts test/domains/bundle/bundle-locale.test.ts
git mv test/ts/bundle-platform.test.ts test/domains/bundle/bundle-platform.test.ts
git mv test/ts/bundle-publish.test.ts test/domains/bundle/bundle-publish.test.ts
git mv test/ts/bundle-validate.test.ts test/domains/bundle/bundle-validate.test.ts
git mv test/ts/factory-package.test.ts test/domains/factory/factory-package.test.ts
git mv test/ts/skill-cli-e2e.test.ts test/domains/skill/skill-cli-e2e.test.ts
git mv test/ts/skill-discovery.test.ts test/domains/skill/skill-discovery.test.ts
git mv test/ts/skill-find.test.ts test/domains/skill/skill-find.test.ts
git mv test/ts/skill-install.test.ts test/domains/skill/skill-install.test.ts
git mv test/ts/skill-load.test.ts test/domains/skill/skill-load.test.ts
git mv test/ts/skill-snapshot.test.ts test/domains/skill/skill-snapshot.test.ts
git mv test/ts/skill-validate.test.ts test/domains/skill/skill-validate.test.ts
git mv test/ts/helpers test/helpers
```

Update `vitest.config.ts` test include:

```typescript
include: ['test/**/*.test.ts'],
exclude: [
  'test/**/context-compression-benchmark.test.ts',
  'test/**/context-execution-benchmark.test.ts',
],
```

- [x] **Step 3: Move docs into architecture/operations groupings and update repo guidance**

Run:

```bash
git mv docs/ARCHITECTURE.md docs/architecture/ARCHITECTURE.md
git mv docs/AUTO-TRANSITION.md docs/operations/AUTO-TRANSITION.md
git mv docs/CONTEXT-COMPRESSION.md docs/operations/CONTEXT-COMPRESSION.md
```

Update `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and `CONTRIBUTING-zh.md` references from `src/compat/` and `scripts/build-classic-runtime.mjs` to the new paths:

```text
domains/comet-classic/*
scripts/build/build-classic-runtime.mjs
app/
domains/
platform/
```

- [x] **Step 4: Delete the final old source tree**

Run:

```bash
git rm -r src
```

Only do this after `tsc`, Vitest, and runtime build all resolve exclusively from `app/`, `domains/`, and `platform/`.

- [x] **Step 5: Run the full project verification suite**

Run:

```bash
pnpm build
pnpm lint
pnpm format:check
npx vitest run
```

Expected: all commands exit successfully.

- [x] **Step 6: Commit the final restructure**

```bash
git add scripts test docs AGENTS.md CLAUDE.md CONTRIBUTING.md CONTRIBUTING-zh.md package.json vitest.config.ts
git commit -m "refactor: reorganize repository by domain"
```

---

## Task 8: Post-migration audit and compatibility proof

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `NEWS.md`
- Test: `test/ts/readme.test.ts`
- Test: `test/ts/ci-workflows.test.ts`

**Contracts:**
- Produces: user-visible changelog entry for the repository restructure.
- Produces: updated README references for top-level source layout where necessary.
- Produces: updated release-note and contributor-facing references where old internal source paths were previously documented.
- Proves: install/update/runtime compatibility after internal path reorganization.

- [x] **Step 1: Add a user-visible changelog entry once behavior is stable**

Update `CHANGELOG.md` at the current version heading with a `### Changed` item:

```md
### Changed

- **Repository layout**: Reorganized the codebase into top-level app, domain, and platform areas while preserving Comet CLI behavior and installed skill output paths.
```

- [x] **Step 2: Update user-facing and release-note references where the old internal paths leaked**

Run:

```bash
rg "src/compat|src/cli|src/commands|scripts/build-classic-runtime\.mjs" README.md README-zh.md NEWS.md
```

If the search returns matches, replace them using only these mappings:

```text
src/compat -> domains/comet-classic
src/cli -> app/cli
src/commands -> app/commands
scripts/build-classic-runtime.mjs -> scripts/build/build-classic-runtime.mjs
```

If the search returns no matches, leave `README.md`, `README-zh.md`, and `NEWS.md` unchanged in this step.

- [x] **Step 3: Run doc and CI-focused validation**

Run:

```bash
npx vitest run test/ts/readme.test.ts test/ts/ci-workflows.test.ts
pnpm build
npx vitest run test/domains/comet-classic/comet-scripts.test.ts test/ts/skills.test.ts test/app/update.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit the audit slice**

```bash
git add CHANGELOG.md README.md README-zh.md NEWS.md
git commit -m "docs: record repository domain restructure"
```

---

## Execution Notes

- Prefer `git mv` for every directory migration so blame and rename detection remain useful.
- Do not mix `scripts/` regrouping with the early domain migrations; wait until all code imports have been cut over.
- If a moved test helper causes broad failures, repair the helper first and rerun the same narrow test slice before touching another domain.
- If any step reveals a hidden hardcoded path outside the registry, add it to the registry in the same slice rather than patching a one-off path.
- Keep classic runtime output stable until all skills, hooks, manifest, and test fixtures are proven against the new registry.

## Final Verification Checklist

- `pnpm build`
- `pnpm lint`
- `pnpm format:check`
- `npx vitest run`
- `node scripts/build/build-classic-runtime.mjs --check`
- `npx vitest run test/domains/comet-classic/comet-scripts.test.ts test/ts/skills.test.ts test/app/update.test.ts`
- Confirm `assets/manifest.json` still ships `comet/scripts/comet-runtime.mjs`
- Confirm `bin/comet.js` resolves `dist/app/cli/index.js`
- Confirm install/update still copy `assets/skills` and `assets/skills-zh` into user platform skills directories unchanged
