---
name: comet-hotfix
description: "Comet preset path: Bug fix / hotfix. Skip brainstorming, directly open → build → verify → archive. Applicable for behavior fixes, scenarios not involving new capability design."
---

# Comet Preset Path: Hotfix

Hotfix is a preset workflow of Comet's five-phase capabilities, not a separate parallel process. It reuses open, build, verify, archive capabilities, only skipping brainstorming and full plan.

Applicable for bug fixes, hotfixes, small-scale behavior corrections. Does not involve new capability design, does not require deep brainstorming.

**Applicable conditions** (all must be met):
1. Fix bugs in existing functionality, no new capability
2. No interface changes or architecture adjustments
3. Change scope is predictable (usually < 5 files)

**Not applicable**: If fix process discovers need for architecture adjustments, should upgrade to full `/comet` workflow.

---

## Process (preset workflow, 4 phases)

### 0. Entry State Verification (Entry Check)

Before performing any operations, verify current state:

**Checklist:**
1. `openspec/changes/<name>/` directory does not exist, or directory exists but `.comet.yaml` does not exist (no conflict)

**Verification method:**
- `test -d openspec/changes/<name>` to check directory
- If directory exists, `test -f openspec/changes/<name>/.comet.yaml` to check config file
- If `.comet.yaml` exists, read `phase` to check if it's an incomplete hotfix

**Failure output (has conflict):**
```
[HARD STOP] Entry check failed for comet-hotfix
  Expected: openspec/changes/<name>/.comet.yaml does not exist (new change)
  Actual:   .comet.yaml exists with phase=<actual-value>
  Suggestion: Pick a different change name, or check if an existing hotfix is in progress.
```

Proceed to process steps only after verification passes.

Execution chain: open → build → verify → archive. Hotfix provides default decisions for each phase: streamlined open, direct build, scale-based verification, archive after verification passes.

### 1. Quick Open (preset open)

Reuse Comet open capability to create change, but use hotfix defaults: do not execute `openspec-explore` long exploration, directly enter streamlined change creation.

**Immediately execute:** Use the Skill tool to load the `openspec-new-change` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to create streamlined artifacts:
  - `proposal.md` — problem description + root cause analysis + fix goal (no solution comparison needed)
  - `design.md` — fix solution (one is enough, no multi-solution comparison needed)
  - `tasks.md` — fix task list
- **No delta spec needed** (unless fix changes existing spec acceptance scenarios)

Create independent `.comet.yaml` file under `openspec/changes/<name>/`:

```yaml
workflow: hotfix
phase: build
design_doc: null
plan: null
build_mode: direct
isolation: branch
verify_mode: light
verify_result: pending
verified_at: null
archived: false
```

【Write verification】After creation completion, must verify:
  cat openspec/changes/<name>/.comet.yaml
  Confirm workflow line value is "hotfix"
  Confirm phase line value is "build"
  Confirm design_doc line value is "null"
  Confirm plan line value is "null"
  Confirm build_mode line value is "direct"
  Confirm isolation line value is "branch"
  Confirm verify_mode line value is "light"
  Confirm verify_result line value is "pending"
  Confirm verified_at line value is "null"
  Confirm archived line value is "false"
  If any field does not match, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

### 2. Direct Build (preset build)

Use hotfix defaults: `build_mode: direct`. Skip `superpowers:brainstorming` and `superpowers:writing-plans` (unless tasks > 3; if exceeds 3 tasks, transfer to `/comet-build`'s plan and execution method selection).

**Immediately execute:** Execute tasks one by one according to tasks.md:

1. Read `openspec/changes/<name>/tasks.md`, get incomplete task list
2. For each incomplete task:
   - Modify code according to task description
   - Run `mvn spotless:apply` to format
   - Run related tests to confirm pass
   - Check corresponding `- [ ]` to `- [x]` in tasks.md
   - Commit code, commit message format: `fix: <brief fix description>`
3. After all tasks complete, enter verification

**If fix affects existing spec acceptance scenarios**:
- Create delta spec in `openspec/changes/<name>/specs/<capability>/spec.md`
- Only include `## MODIFIED Requirements` section

### 3. Verification (preset verify)

Reuse `/comet-verify`, with comet-verify's scale assessment deciding lightweight or full verification.

**Immediately execute:** Use the Skill tool to load the `comet-verify` skill. Skipping this step is prohibited.

Small-scale hotfixes without delta spec usually meet lightweight verification conditions (≤ 3 tasks, ≤ 5 files), comet-verify's scale assessment will select lightweight verification path (5 quick checks). If hotfix created delta spec, enter full verification path according to comet-verify's scale assessment rules.

**Additional Hotfix-Exclusive Checks** (execute after comet-verify lightweight verification passes):

1. **Root cause elimination**: Compare proposal.md's root cause analysis, confirm problem code eliminated
   - Read bug description and root cause in proposal.md
   - Search and verify problem code no longer exists
   - If root cause not eliminated, return to Step 2 to continue fix

**Verification phase upgrade conditions**:
- Regression testing reveals deep architecture issues → Stop hotfix, upgrade to `/comet`
- Fix requires additional interface changes → Stop hotfix, upgrade to `/comet`

After verification passes, record `.comet.yaml` `verify_result` as `pass` according to `/comet-verify` rules, must not skip this status before archiving.

### 4. Archive (preset archive)

Reuse `/comet-archive`. Must satisfy `verify_result: pass` in `.comet.yaml` before archiving.

**Immediately execute:** Use the Skill tool to load the `comet-archive` skill to archive. Skipping this step is prohibited.
If there is delta spec, sync to main spec according to comet-archive rules, and handle associated Design Doc and Plan archiving annotations.

---

## Continuous Execution Mode

<IMPORTANT>
Hotfix workflow is **one-time continuous execution**. After invoking `/comet-hotfix`, agent must automatically complete all 4 phases, without pausing to wait for user input mid-way (unless encountering upgrade conditions requiring user confirmation).

Execution order: quick open → direct build → verification → archive → complete

After each phase completes, immediately enter next phase, no need for user input again. Within each phase, must still call corresponding Comet/OpenSpec/Superpowers skill according to above requirements.
</IMPORTANT>

---

## Upgrade Conditions

When the following situations occur during fix process, stop hotfix workflow, upgrade to full `/comet`:

1. Root cause discovered involves architecture defects
2. Fix requires new interfaces or components
3. Impact scope expands to > 10 files
4. Needs new capability spec

Upgrade method: On current change basis, supplement Design Doc (execute `/comet-design`), then proceed normally with full workflow.

---

## Exit Conditions

- Bug fixed, tests pass
- Change archived
- If spec changes, synced to main spec
- **Phase guard**: Before build → verify run `bash $COMET_GUARD <change-name> build`, before verify → archive run `bash $COMET_GUARD <change-name> verify`
