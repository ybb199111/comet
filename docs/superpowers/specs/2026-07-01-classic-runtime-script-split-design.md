# Classic Runtime Script Split Design

## Goal

Remove the generated `comet-runtime.mjs` dispatcher from the shipped Classic runtime assets. Each shipped `comet-*.mjs` script should carry and execute its own command logic, while TypeScript source in `domains/comet-classic/` remains the single source of truth.

## Scope

This change covers the Classic runtime scripts shipped under `assets/skills/comet/scripts/`, the benchmark eval mirror under `eval/local/skills/benchmarks/comet/scripts/`, tests that currently invoke `comet-runtime.mjs`, and documentation that describes the old thin-launcher model.

This change does not redesign `comet-any`. The `comet-any` factory control plane validates its own generated workflow scripts such as `scripts/comet-check.mjs` and `scripts/comet-hook-guard.mjs`; it does not use Classic `comet-runtime.mjs` as a runtime dependency. It still needs regression coverage because manifest and script-resource assumptions can drift together.

## Architecture

The module seam stays in `domains/comet-classic/`: command implementations remain reusable TypeScript modules such as `classic-state-command.ts`, `classic-guard.ts`, and `classic-archive.ts`. The generated asset seam changes from one dispatcher bundle to multiple command bundles.

Each command bundle will have a focused TypeScript entrypoint that imports only the command handler it needs and uses shared CLI output handling. The build script will compile these entries into the existing public script names:

- `comet-state.mjs`
- `comet-yaml-validate.mjs`
- `comet-guard.mjs`
- `comet-handoff.mjs`
- `comet-archive.mjs`
- `comet-hook-guard.mjs`
- `comet-intent.mjs`

`comet-env.mjs` remains a hand-written helper because it only reports the scripts directory. `comet-runtime.mjs` is removed from `assets/manifest.json`, generated assets, eval mirrors, tests, and docs. No compatibility dispatcher is retained because this runtime shape has not shipped.

## Data Flow

Current flow:

1. User runs `node comet-state.mjs init ...`.
2. `comet-state.mjs` imports `main` from `comet-runtime.mjs`.
3. `comet-runtime.mjs` dispatches to the state command.

New flow:

1. User runs `node comet-state.mjs init ...`.
2. `comet-state.mjs` invokes the state command entry directly.
3. Shared command result output handling writes stdout, stderr, and exit code.

Shared helpers still live behind TypeScript imports, so behavior remains centralized where it should be centralized: state parsing, validation, transitions, guard rules, archive merge logic, diagnostics, and runtime package loading.

## Impact

Directly affected:

- `scripts/build/build-classic-runtime.mjs`
- `config/repository-layout.json`
- `assets/manifest.json`
- `assets/skills/comet/scripts/*.mjs`
- `eval/local/skills/benchmarks/comet/scripts/*.mjs`
- `scripts/benchmark/classic-baseline-regression.mjs`
- `test/domains/comet-classic/*runtime*`, `test/domains/comet-classic/comet-scripts*.test.ts`
- `test/app/status.test.ts`, `test/app/doctor.test.ts`
- `test/domains/engine/engine-schema-compat.test.ts`
- README, README-zh, Classic architecture docs, and script references

Indirectly checked:

- `domains/bundle/eval.ts` and `comet-any` contract tests, to confirm generated skill control-plane validation remains independent from the Classic runtime split.

## Testing

Tests should first encode the new contract:

- shipped command scripts do not import `./comet-runtime.mjs`
- `assets/manifest.json` does not list `comet/scripts/comet-runtime.mjs`
- `pnpm build:classic-runtime -- --check` verifies all generated command bundles
- isolated script copies run without `comet-runtime.mjs`
- eval mirror scripts do not reference `comet-runtime.mjs`
- benchmark and app tests call concrete scripts instead of the removed dispatcher
- `comet-any` bundle contract tests still pass

Then run targeted Classic script tests and broader verification.
