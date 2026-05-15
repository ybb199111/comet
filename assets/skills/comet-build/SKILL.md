---
name: comet-build
description: "Comet Phase 3: Plan and Build. Invoke with /comet-build. Create plans and execute implementation through subagent-driven-development."
---

# Comet Phase 3: Plan and Build (Build)

## Prerequisites

- Design Doc has been created (Phase 2 complete)
- Active change exists

## Steps

### 0. Entry State Verification (Entry Check)

Before performing any operations, read and verify the current state:

**Checklist:**
1. `openspec/changes/<name>/.comet.yaml` exists
2. `phase` field value is `"build"`
3. `design_doc` field is non-null and non-empty
4. File referenced by `design_doc` exists (e.g., `docs/superpowers/specs/YYYY-MM-DD-topic-design.md`)
5. `openspec/changes/<name>/proposal.md` exists and is non-empty
6. `openspec/changes/<name>/tasks.md` exists and is non-empty

**Verification method:**
- `cat openspec/changes/<name>/.comet.yaml` to read all fields
- Use `ls` or `test -f` to confirm design_doc file exists

**Failure output:**
```
[HARD STOP] Entry check failed for comet-build
  Expected: phase=build, design_doc=<path> exists
  Actual:   phase=<actual-value>, design_doc=<actual-value or file does not exist>
  Suggestion: Run comet-design first, or verify design_doc file exists.
```

Proceed to Step 1 only after verification passes.

### 1. Create Plan

**Immediately execute:** Use the Skill tool to load the `superpowers:writing-plans` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to create a plan. Plan requirements:
- Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- Reference design document, break down into executable tasks
- **Plan file header must contain associated metadata**:

```yaml
---
change: <openspec-change-name>
design-doc: docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
---
```

### 2. Update Plan Status

Merge and update the following fields in `openspec/changes/<name>/.comet.yaml` (keep other fields unchanged):

```yaml
phase: build
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
```

【Write verification】After update completion, must verify:
  cat openspec/changes/<name>/.comet.yaml
  Confirm plan line value is "docs/superpowers/plans/YYYY-MM-DD-feature.md"
  If not matching, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

### 3. Workspace Isolation

Plan has been written to the current branch. Before starting execution, choose workspace isolation method:

| Option | Method | Description |
|--------|--------|-------------|
| A | Create branch | Create a new branch in the current repo, simple and fast |
| B | Create Worktree | Isolated workspace, fully independent, suitable for parallel development |

**Recommendation rules**:
- Change involves ≤ 3 files → Recommend A
- Need parallel development, current branch has uncommitted work → Recommend B

After user selection, merge and update `isolation` in `openspec/changes/<name>/.comet.yaml` (keep other fields unchanged). `isolation` only allows one of the following values:

- `branch`
- `worktree`

Few-shot examples:

```yaml
# User selects create branch / A
isolation: branch
```

```yaml
# User selects create worktree / B
isolation: worktree
```

【Write verification】After update completion, must verify:
  cat openspec/changes/<name>/.comet.yaml
  Confirm isolation line value is "<branch or worktree>"
  If not matching, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

**Execute isolation**:

- **branch**: Run `git checkout -b <change-name>`, subsequent work on the new branch
- **worktree**: Invoke `superpowers:using-git-worktrees` skill or use native `EnterWorktree` tool to create isolated workspace

After creating isolation, confirm plan file is accessible (naturally accessible with branch method; for worktree method, confirm plan has been committed).

### 4. Select Execution Method

Present plan summary to user (task count, involved modules), then ask for execution method:

| Option | Skill | Applicable Scenario |
|------|------|-------------------|
| A | `superpowers:subagent-driven-development` | Independent tasks, high complexity, requires two-phase review |
| B | `superpowers:executing-plans` | Simple tasks, no subagent environment, lightweight and fast |

**Recommendation rules**:
- Task count ≥ 3 → Recommend A
- Task count ≤ 2 and no cross-module dependencies → Recommend B
- From hotfix path → Recommend B

After user selection, merge and update `build_mode` in `openspec/changes/<name>/.comet.yaml` (keep other fields unchanged). `build_mode` only allows one of the following values:

- `subagent-driven-development`
- `executing-plans`
- `direct` (only for hotfix preset use)

Few-shot examples:

```yaml
# User selects robust mode / A
build_mode: subagent-driven-development
```

```yaml
# User selects fast mode / B
build_mode: executing-plans
```

【Write verification】After update completion, must verify:
  cat openspec/changes/<name>/.comet.yaml
  Confirm build_mode line value is "<subagent-driven-development or executing-plans or direct>"
  If not matching, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

Then, **immediately execute:** Use the Skill tool to load the corresponding skill. Skipping this step is prohibited.

If the selected Superpowers skill is unavailable, stop the process and prompt to install or enable the corresponding skill. Do not substitute this step with normal conversation.

After the skill loads, follow its guidance to execute:
- Execute tasks according to plan
- Complete tasks.md check (`- [ ]` → `- [x]`)
- Commit code after each task completion

### 5. Spec Incremental Updates

When the initial spec is found incomplete during implementation, handle by scale:

| Scale | Trigger Conditions | Approach |
|------|-------------------|----------|
| Small | Missing acceptance scenarios, edge cases | Directly edit delta spec + design.md, append tasks.md tasks |
| Medium | Interface changes, new components, data flow changes | Re-run `superpowers:brainstorming` to update Design Doc + delta spec |
| Large | Brand-new capability requirements | `/opsx:new` to create independent change |

**50% Threshold Determination**: Using initial task count in tasks.md as baseline, if new tasks exceed half of that total, it's considered outside original plan scope, should consider splitting into new change.

**Principles**:
- Delta spec is a living document, can be modified at any time during this phase
- Each update should be committed with commit message explaining the change reason
- Do not sync to main spec in advance, sync uniformly during archiving
- If incremental tasks exceed 50% of initial tasks.md total task count, consider splitting into new change
- For small-scale incremental direct delta spec edits, note in commit message to facilitate design doc drift assessment during archiving

## Exit Conditions

- All tasks.md checked
- Code committed
- Tests pass
- `.comet.yaml` `phase` updated to `verify`
- **Phase guard**: Run `bash $COMET_GUARD <change-name> build`, allow transition only after all PASS

Before exit, merge and update the following fields in `.comet.yaml` (keep other fields unchanged):

```yaml
phase: verify
verify_result: pending
```

【Write verification】After update completion, must verify:
  cat openspec/changes/<name>/.comet.yaml
  Confirm phase line value is "verify"
  Confirm verify_result line value is "pending"
  If any field does not match, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

## Automatic Transition

After exit conditions are met, **proceed immediately to the next phase without waiting for user input**:

> **REQUIRED NEXT SKILL:** Invoke `comet-verify` skill to enter the verification and completion phase.
