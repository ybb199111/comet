---
name: comet-tweak
description: "Comet preset path: Non-bug small changes (tweak). Skip brainstorming and full plan, directly open → lightweight build → light verify → archive. Applicable for copy, configuration, documentation or prompt local optimization."
---

# Comet Preset Path: Tweak

Tweak is a preset workflow of Comet's five-phase capabilities, not a separate parallel process. It reuses open, build, verify, archive capabilities, only skipping brainstorming and full plan.

Applicable for small-scale non-bug changes, such as copy adjustments, configuration adjustments, documentation or prompt local optimization.

**Applicable conditions** (all must be met):
1. No new capability
2. No architecture changes
3. No interface changes involved
4. Usually not exceeding 3 tasks, 5 files

**Not applicable**: If change process discovers need for capability, architecture, or interface adjustments, should upgrade to full `/comet` workflow.

---

## Process (preset workflow, 4 phases)

### 0. Entry State Verification (Entry Check)

Before performing any operations, verify current state:

**Checklist:**
1. `openspec/changes/<name>/` directory does not exist, or directory exists but `.comet.yaml` does not exist (no conflict)

**Verification method:**
- `test -d openspec/changes/<name>` to check directory
- If directory exists, `test -f openspec/changes/<name>/.comet.yaml` to check config file
- If `.comet.yaml` exists, read `phase` to check if it's an incomplete tweak

**Failure output (has conflict):**
```
[HARD STOP] Entry check failed for comet-tweak
  Expected: openspec/changes/<name>/.comet.yaml does not exist (new change)
  Actual:   .comet.yaml exists with phase=<actual-value>
  Suggestion: Pick a different change name, or check if an existing tweak is in progress.
```

Proceed to process steps only after verification passes.

Execution chain: open → lightweight build → light verify → archive. Tweak provides default decisions for each phase: streamlined open, lightweight build, lightweight verification, archive after verification passes.

### 1. Quick Open (preset open)

Reuse Comet open capability to create change, but use tweak defaults: do not execute `openspec-explore` long exploration, directly enter streamlined change creation.

**Immediately execute:** Use the Skill tool to load the `openspec-new-change` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to create streamlined artifacts:
  - `proposal.md` — change motivation + goals + scope
  - `design.md` — brief implementation description (no solution comparison needed)
  - `tasks.md` — not exceeding 3 tasks
- **No delta spec needed** (unless change changes existing spec acceptance scenarios; once delta spec needed, upgrade to full `/comet`)

Create independent `.comet.yaml` file under `openspec/changes/<name>/`:

```yaml
workflow: tweak
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
  Confirm workflow line value is "tweak"
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

### 2. Lightweight Build (preset build)

Use tweak defaults: `build_mode: direct`. Skip `superpowers:brainstorming` and `superpowers:writing-plans`.

**Immediately execute:** Execute tasks one by one according to tasks.md:

1. Read `openspec/changes/<name>/tasks.md`, get incomplete task list
2. For each incomplete task:
   - Modify target file according to task description
   - Run `mvn spotless:apply` to format
   - Run related tests to confirm pass
   - Check corresponding `- [ ]` to `- [x]` in tasks.md
   - Commit code, commit message format: `tweak: <brief change description>`
3. After all tasks complete, enter verification

### 3. Lightweight Verification (preset verify)

Reuse `/comet-verify`. Tweak must maintain lightweight verification conditions: ≤ 3 tasks, ≤ 5 files, no delta spec, no new capability.

**Immediately execute:** Use the Skill tool to load the `comet-verify` skill. Skipping this step is prohibited.

If scale assessment enters full verification path, stop tweak, upgrade to full `/comet`.

After verification passes, record `.comet.yaml` `verify_result` as `pass` according to `/comet-verify` rules, must not skip this status before archiving.

### 4. Archive (preset archive)

Reuse `/comet-archive`. Must satisfy `verify_result: pass` in `.comet.yaml` before archiving.

**Immediately execute:** Use the Skill tool to load the `comet-archive` skill to archive. Skipping this step is prohibited.

---

## Continuous Execution Mode

<IMPORTANT>
Tweak workflow is **one-time continuous execution**. After invoking `/comet-tweak`, agent must automatically complete all 4 phases, without pausing to wait for user input mid-way (unless encountering upgrade conditions requiring user confirmation).

Execution order: quick open → lightweight build → lightweight verification → archive → complete

After each phase completes, immediately enter next phase, no need for user input again. Within each phase, must still call corresponding Comet/OpenSpec/Superpowers skill according to above requirements.
</IMPORTANT>

---

## Upgrade Conditions

When the following situations occur during execution, stop tweak workflow, upgrade to full `/comet`:

1. Need new capability
2. Need architecture adjustments
3. Need interface changes
4. Impact scope expands to > 5 files
5. Task count exceeds 3
6. Need delta spec

Upgrade method: On current change basis, supplement Design Doc (execute `/comet-design`), then proceed normally with full workflow.

---

## Exit Conditions

- Small change completed, tests pass
- Change archived
- No new capability, architecture adjustments, or interface changes
- **Phase guard**: Before build → verify run `bash $COMET_GUARD <change-name> build`, before verify → archive run `bash $COMET_GUARD <change-name> verify`
