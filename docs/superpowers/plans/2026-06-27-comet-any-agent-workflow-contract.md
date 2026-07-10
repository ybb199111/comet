# Comet Any Agent Workflow Contract Implementation Plan

> **For agentic workers:** implement task by task and keep verification evidence fresh. This plan is the current architecture direction for `/comet-any`.

**Goal:** Replace `/comet-any` internals with a single Agent workflow contract model shared by customization based on existing Comet five-phase Skills, arbitrary Skill workflows, manual orchestration, runtime scripts, eval, review, and publish readiness.

**Architecture:** Add `domains/workflow-contract` as the deep module for WorkflowDefinition, Nodes, Skill Bindings, Output Schemas, Guardrails, normalization, validation, hashing, and built-in Comet five-phase templates. Keep `domains/bundle` as orchestration/state, `domains/factory` as package rendering, and eval/readiness as consumers of the same protocol.

## Spec Source

Implement [docs/superpowers/specs/2026-06-27-comet-any-agent-workflow-contract-design.md](../specs/2026-06-27-comet-any-agent-workflow-contract-design.md).

## Tasks

- [x] Create `domains/workflow-contract` with public types, built-ins, normalization, validation, hashing, and exports.
- [x] Register `workflow-contract` in repository architecture config and tests.
- [x] Move factory plan input to `workflow` and normalize through `domains/workflow-contract`.
- [x] Render generated packages from `WorkflowProtocol` instead of package-specific route structures.
- [x] Generate `reference/workflow-protocol.json`, `reference/resolved-skills.json`, `reference/decision-points.md`, `reference/recovery.md`, `reference/authoring-lanes.json`, `reference/skill-review.md`, and `reference/composition-report.md`.
- [x] Generate protocol-aware scripts: `comet-plan.mjs`, `comet-check.mjs`, `comet-hook-guard.mjs`, `workflow-state.mjs`, `workflow-guard.mjs`, and `workflow-handoff.mjs`.
- [x] Make review summary and readiness surface workflow evidence, required Skill calls, Output Schemas, and invalid producer/control overrides.
- [x] Make eval collect and validate generated workflow Skill packages using workflow-aware control-plane checks.
- [x] Update `/comet-any` Chinese Skill instructions first, then sync English instructions.
- [x] Update operation docs, architecture docs, changelog, CLI/help tests, bundle tests, factory tests, eval tests, and workflow-contract tests.
- [x] Delete unpublished draft modules and tests that no longer match the workflow contract architecture.
- [x] Verify the generated path with custom project Skills such as `elementui`, `whitebox-code-standard`, planning, research, writer, and manual-review Skills.

## Current File Shape

Created:

- `domains/workflow-contract/types.ts`
- `domains/workflow-contract/builtins.ts`
- `domains/workflow-contract/normalize.ts`
- `domains/workflow-contract/validation.ts`
- `domains/workflow-contract/hash.ts`
- `domains/workflow-contract/index.ts`
- `test/domains/workflow-contract/workflow-contract.test.ts`
- `test/helpers/workflow-plan.ts`
- `eval/local/tasks/workflow-route-conformance/**`

Key modified areas:

- `domains/bundle/**`
- `domains/factory/**`
- `eval/**`
- `app/commands/**`
- `assets/skills-zh/comet-any/**`
- `assets/skills/comet-any/**`
- `docs/operations/**`
- `docs/architecture/ARCHITECTURE.md`
- `CHANGELOG.md`

## Verification Checklist

- [x] `npx prettier --check app/ domains/ platform/`
- [x] `npx eslint app/ domains/ platform/`
- [x] `node scripts/lint/architecture.mjs`
- [x] `node build.js`
- [x] `npx vitest run`
- [x] Search active implementation and user-facing docs for retired draft vocabulary.

## Follow-Up Acceptance Notes

- The only public composition contract is Workflow Contract.
- There is no migration mode or alternate old-path compatibility branch.
- Comet five-phase customization is described as “基于 Comet 现有 Skill 的五阶段定制”.
- Required Skill Call is an evidence-backed obligation inside a Workflow Node.
- Producer replacement is gated by Output Schema.
- Control Node replacement is rejected in ordinary mode.
- Arbitrary Skill workflow and manual orchestration use the same Node/Binding/Schema model.
