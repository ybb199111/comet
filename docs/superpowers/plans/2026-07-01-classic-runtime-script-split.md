# Classic Runtime Script Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the shipped `comet-runtime.mjs` dispatcher and generate independent Classic command scripts.

**Architecture:** Keep command behavior in `domains/comet-classic/`, add focused command entrypoints, and make `scripts/build/build-classic-runtime.mjs` build multiple output assets. Sync tests, eval mirrors, benchmark callers, docs, manifest, and changelog to the new script shape.

**Tech Stack:** TypeScript, esbuild, Node.js ESM, Vitest.

---

### Task 1: Lock The New Contract With Tests

**Files:**
- Modify: `test/domains/comet-classic/comet-scripts.test.ts`
- Modify: `test/domains/comet-classic/classic-runtime.test.ts`
- Modify: `test/domains/engine/engine-schema-compat.test.ts`
- Modify: `test/app/status.test.ts`
- Modify: `test/app/doctor.test.ts`

- [ ] Change script contract tests so Classic command scripts must not import `./comet-runtime.mjs`.
- [ ] Remove temp-copy requirements for `comet-runtime.mjs`.
- [ ] Change runtime freshness tests to assert all generated command scripts are fresh and the manifest omits `comet-runtime.mjs`.
- [ ] Change app, engine, and benchmark-facing tests to call concrete scripts.
- [ ] Run targeted tests and confirm they fail because the current assets still depend on `comet-runtime.mjs`.

### Task 2: Build Independent Script Bundles

**Files:**
- Create: `domains/comet-classic/classic-script-entry.ts`
- Create: `domains/comet-classic/classic-state-entry.ts`
- Create: `domains/comet-classic/classic-validate-entry.ts`
- Create: `domains/comet-classic/classic-guard-entry.ts`
- Create: `domains/comet-classic/classic-handoff-entry.ts`
- Create: `domains/comet-classic/classic-archive-entry.ts`
- Create: `domains/comet-classic/classic-hook-guard-entry.ts`
- Create: `domains/comet-classic/classic-intent-entry.ts`
- Modify: `scripts/build/build-classic-runtime.mjs`
- Modify: `config/repository-layout.json`

- [ ] Add shared entry helper that runs one `ClassicCommandHandler` with `--json` output handling.
- [ ] Add one command entrypoint per shipped Classic script.
- [ ] Replace the single-output build script with multi-entry generation and multi-file `--check`.
- [ ] Run targeted tests and confirm generated assets are stale until rebuilt.

### Task 3: Regenerate Assets And Sync Eval Mirror

**Files:**
- Modify generated: `assets/skills/comet/scripts/*.mjs`
- Delete generated: `assets/skills/comet/scripts/comet-runtime.mjs`
- Modify mirror: `eval/local/skills/benchmarks/comet/scripts/*.mjs`
- Delete mirror: `eval/local/skills/benchmarks/comet/scripts/comet-runtime.mjs`
- Modify: `assets/manifest.json`
- Modify: `eval/local/treatments/comet/comet_full.yaml`

- [ ] Run `pnpm build:classic-runtime`.
- [ ] Remove `comet-runtime.mjs` from shipped and eval script directories.
- [ ] Copy regenerated Classic scripts into the eval benchmark mirror.
- [ ] Remove runtime bundle wording from eval treatment metadata.

### Task 4: Update Callers And Docs

**Files:**
- Modify: `scripts/benchmark/classic-baseline-regression.mjs`
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `assets/skills/comet/reference/scripts.md`
- Modify: `assets/skills-zh/comet/reference/scripts.md`
- Modify: `docs/architecture/ARCHITECTURE.md`

- [ ] Update benchmark helpers to call concrete scripts.
- [ ] Update English and Chinese docs to describe independent Node scripts.
- [ ] Keep README wording concise and user-facing.

### Task 5: Verify And Changelog

**Files:**
- Modify: `CHANGELOG.md`
- Maybe modify: `package.json` version if master requires a bump

- [ ] Check current master package version before deciding changelog/version.
- [ ] Run `npx vitest run test/domains/comet-classic/comet-scripts.test.ts`.
- [ ] Run targeted affected tests for app, engine, bundle, and runtime.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test` if time and environment allow.
- [ ] Add a user-visible changelog entry for the Classic runtime asset split.
