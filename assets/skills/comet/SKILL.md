---
name: comet
description: "Comet — OpenSpec + Superpowers dual-star development workflow. Start with /comet for automatic phase detection and dispatch to subcommands. Five phases: open → design → build → verify → archive."
---

# Comet — OpenSpec + Superpowers Dual-Star Development Workflow

OpenSpec and Superpowers orbit the same goal like a binary star system. OpenSpec handles WHAT, Superpowers handles HOW.

```
OpenSpec handles WHAT  — outline, proposal, spec lifecycle, archive
Superpowers handles HOW — technical design, planning, execution, closing
```

**Core principle: brainstorming cannot be skipped. Every change must undergo deep design (except hotfix and tweak presets).**

<IMPORTANT>
## Phase Transitions

A single `/comet` invocation starts from the detected phase and prompts or advances to the next phase when exit conditions are met.

Flow chain: open → design → build → verify → archive

Nodes requiring user participation:
1. Confirm design approach during brainstorming
2. Select execution mode during build phase
3. Decide to fix or accept deviation when verify fails
4. Choose branch handling method for finishing-branch
5. Encounter upgrade conditions (hotfix/tweak → full workflow)

Agents should not skip these decision points; other unambiguous phase transitions can proceed automatically.
</IMPORTANT>

## Automatic Phase Detection

### Step 0: Active Change Discovery

**Execute immediately:**

1. Run `openspec list --json` to get all active changes
2. For each change, check `docs/superpowers/specs/` and `docs/superpowers/plans/` for associated files to determine phase and progress

**Branch logic:**

| Situation | Action |
|-----------|--------|
| No active change | → Invoke `/comet-open` |
| Exactly 1 active change | → Auto-select, enter phase determination (Step 1) |
| Multiple active changes | → List for user selection |

**Multi-change selection**: Display using AskUserQuestion, example format:

```
| # | Change Name | Current Phase | Task Progress |
|---|-------------|---------------|---------------|
| 1 | xxx-feature | Build | 3/5 tasks |
| 2 | yyy-fix | Design | No design doc |
```

After user selection, enter phase determination for the selected change.

**Preset detection**:
- If user explicitly describes as bug fix / hotfix and hotfix conditions are met, directly invoke `/comet-hotfix` (skip selection).
- If user explicitly describes as copy, config, docs, prompt, or small non-bug adjustment and tweak conditions are met, directly invoke `/comet-tweak` (skip selection).

### Step 1: Comet State Metadata Reading

Prefer reading `openspec/changes/<name>/.comet.yaml`. If not available, fall back to `openspec status --change "<name>" --json`, `tasks.md`, and `docs/superpowers/` file checks.

Recommended metadata structure:

```yaml
workflow: full
phase: build
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
build_mode: subagent-driven-development
isolation: branch
verify_mode: light
verify_result: pending
verified_at: null
archived: false
```

Field meanings:

| Field | Meaning |
|-------|---------|
| `workflow` | `full`, `hotfix`, or `tweak` |
| `phase` | Current phase: `open`, `design`, `build`, `verify`, `archive` |
| `design_doc` | Associated Superpowers Design Doc path, can be empty |
| `plan` | Associated Superpowers Plan path, can be empty |
| `build_mode` | Selected execution mode, can be empty |
| `isolation` | `branch` or `worktree`, workspace isolation method, defaults to `branch` |
| `verify_mode` | `light` or `full`, can be empty |
| `verify_result` | `pending`, `pass`, or `fail` |
| `verified_at` | Verification pass time, can be empty |
| `archived` | Whether change is archived |

### Step 2: Phase Determination

For the selected change, determine current state in the following order:

1. **`archived: true` or change moved to archive** → Workflow complete
2. **`verify_result: pass` and `archived` is not `true`** → Invoke `/comet-archive`
3. **`phase: verify` or tasks.md all checked** → Invoke `/comet-verify`
4. **`phase: build` or has Design Doc but plan/execution incomplete** → Invoke `/comet-build`
5. **`phase: design` or has change but no Design Doc** → Invoke `/comet-design`
6. **No active change or state undeterminable** → Invoke `/comet-open`

If metadata conflicts with file state, use verifiable file state as source of truth and correct `.comet.yaml` before continuing phase.

---

## Subcommands

| Command | Phase | Owner | Artifacts |
|---------|-------|-------|-----------|
| `/comet-open` | 1. Open | OpenSpec | proposal.md、design.md、tasks.md |
| `/comet-design` | 2. Deep Design | Superpowers | Design Doc、delta spec |
| `/comet-build` | 3. Plan & Build | Superpowers | Implementation plan、code commits |
| `/comet-verify` | 4. Verify & Close | Both | Verification report、branch handling |
| `/comet-archive` | 5. Archive | OpenSpec | delta→main spec sync、design doc markup、archive |
| `/comet-hotfix` | Preset path | Both | Quick fix (skip brainstorming) |
| `/comet-tweak` | Preset path | Both | Small change (skip brainstorming and full plan) |

---

## Flow Diagram

```
/comet
  ↓ Auto-detect
/comet-open ──→ /comet-design ──→ /comet-build ──→ /comet-verify ──→ /comet-archive
  (OpenSpec)      (Superpowers)     (Superpowers)     (Both)          (OpenSpec)

/comet-hotfix（preset path, skip brainstorming）
  open ──→ build ──→ verify ──→ archive
    ↑ If upgrade triggered → supplement Design Doc → return to full workflow

/comet-tweak（preset path, skip brainstorming and full plan）
  open ──→ lightweight build ──→ light verify ──→ archive
    ↑ If upgrade triggered → supplement Design Doc → return to full workflow
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| `openspec list --json` fails | Check if openspec is installed, prompt user to run `openspec init` |
| Sub-skill unavailable (e.g., `superpowers:brainstorming`) | Stop workflow, prompt to install or enable corresponding skill |
| `.comet.yaml` malformed or missing | Use file state as source of truth (tasks.md、docs/superpowers/), correct metadata then continue |
| Maven compile/test fails | Return to build phase for fixes, do not enter verify |
| Incomplete change directory structure | Fill missing files according to `comet-open` artifact requirements |

---

## Quick Reference

### Script Location

Comet phase guard script `comet-guard.sh` is distributed with the skill package, located in `comet/scripts/` directory.
**Do not hardcode platform paths**, self-locate at runtime with:

```bash
COMET_GUARD=$(find . -path '*/comet/scripts/comet-guard.sh' -type f -print -quit)
bash "$COMET_GUARD" <change-name> <phase>
```

In subsequent documentation, `bash $COMET_GUARD <change> <phase>` refers to this command. After loading comet, agents should cache `COMET_GUARD` path in shell environment to avoid repeated `find`.

### File Structure

```
openspec/                              # OpenSpec — WHAT
├── config.yaml
├── changes/
│   ├── <name>/                        # Active change
│   │   ├── .openspec.yaml
│   │   ├── .comet.yaml
│   │   ├── proposal.md                # Why + What
│   │   ├── design.md                  # High-level architecture decisions
│   │   ├── specs/<capability>/spec.md # Delta capability spec
│   │   └── tasks.md                   # Task checklist
│   └── archive/YYYY-MM-DD-<name>/     # Archived
└── specs/<capability>/spec.md         # Main specs (sync from delta at archive)

docs/superpowers/                      # Superpowers — HOW
├── specs/YYYY-MM-DD-<topic>-design.md # Design doc (technical RFC, mark status at archive)
└── plans/YYYY-MM-DD-<feature>.md      # Implementation plan (file header contains change association metadata)
```

### Best Practices

1. **brainstorming cannot be skipped** — Every change must undergo deep design (except hotfix and tweak)
2. **delta spec is a living document** — Freely modify during phase 3, sync at archive
3. **Keep tasks.md in sync** — Check off each completed task
4. **Commit frequently** — One commit per task, message reflects design intent
5. **Verify before archive** — Execute `/comet-archive` only after `/comet-verify` passes
6. **Classify incremental updates** — Small edits, medium brainstorming, large new changes
7. **Plan must associate with change** — File header contains `change:` and `design-doc:` metadata
8. **Archive closure** — design doc and plan must mark `archived-with` status
9. **Incremental modification of existing features** — Create delta spec baseline based on main spec, not from scratch
10. **Preset has limits** — Switch to full workflow promptly when hotfix/tweak meet upgrade conditions
