# Comet Any Factory Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the next `/comet-any` Skill Factory slice: dogfood coverage, deterministic candidate resolution, richer generated Skill synthesis, and standalone Engine Run support.

**Architecture:** Keep `/comet-any` conversational and CLI-backed. Add narrow backend commands and services rather than a second state model: Bundle Factory state remains the source for candidate resolution and generated drafts, while the existing Skill Engine run store gains a project-scoped standalone run directory path.

**Tech Stack:** TypeScript ESM, Node.js 20+, Commander, YAML, Vitest, existing Bundle and Skill Engine modules.

---

## File Structure

- `test/ts/bundle-cli-e2e.test.ts`: extend the real factory CLI path so dogfood covers unresolved resolution, generated evidence, compile, eval planning, and review summary.
- `src/bundle/factory-resolve.ts`: update stored Factory metadata by selecting one ambiguous source or intentionally ignoring a missing preference.
- `src/commands/bundle.ts` and `src/cli/index.ts`: expose `comet bundle factory-resolve` as an internal `/comet-any` recovery backend.
- `src/factory/package.ts`: turn resolved Skill Markdown into concise generated workflow sections instead of only listing hashes.
- `src/engine/standalone-run.ts`: derive `.comet/runs/<run-id>` directories and wrap existing manual run services.
- `src/commands/skill.ts` and `src/cli/index.ts`: add `--run-id` support for `skill run`, `resume`, and `eval` without breaking `--change`.
- `assets/skills-zh/comet-any/*` and `assets/skills/comet-any/*`: document the recovery and standalone runner path with bilingual parity.
- `README-zh.md`, `README.md`, `CHANGELOG.md`: add concise user-visible notes after behavior lands.

## Tasks

- [x] **Task 1: Dogfood regression.** Write a failing CLI E2E test that starts with an ambiguous Skill from `.comet/skills.txt`, resolves it, generates a Bundle draft, checks `reference/resolved-skills.json`, compiles, produces Eval plans, and builds a review summary.
- [x] **Task 2: Factory resolve backend.** Implement `factory-resolve` so `/comet-any` can recover from `missing` and `ambiguous` candidates without hand-editing state JSON.
- [x] **Task 3: Rich generated Skill synthesis.** Write failing package tests for summary sections extracted from resolved `SKILL.md`, then add deterministic extraction into generated `SKILL.md` and `reference/resolved-skills.json`.
- [x] **Task 4: Standalone runner.** Write failing engine and CLI tests for `.comet/runs/<run-id>`, then add project-scoped `--run-id` support while preserving the existing `--change` path.
- [x] **Task 5: Bilingual docs and `/comet-any`.** Update Chinese first, then English, covering `factory-resolve`, richer evidence, and standalone run usage as an internal backend.
- [x] **Task 6: Verification and commit.** Run focused tests, `pnpm format:check`, `pnpm lint`, `pnpm build`, `npx vitest run test/ts/comet-scripts.test.ts`, full `npx vitest run`, `git diff --check`, then commit.

## Self-Review

- Scope matches the user's requested sequence: dogfood first, then recovery, generation quality, and standalone runner.
- No separate lifecycle state is introduced; all new behavior routes through Bundle Factory state or existing Skill Engine state.
- Each behavior change has a red-first test target.
- `/comet-any` remains the user entry; CLI commands are internal recovery and audit backends.
