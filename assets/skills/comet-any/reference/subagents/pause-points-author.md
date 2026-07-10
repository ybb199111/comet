# Pause Point Author Subagent

This file is a portable lane brief, not a platform-native custom agent. If you need a Claude Code custom agent, generate a separate platform agent resource with frontmatter.

## Responsibilities

Design the places where the user must pause and choose, plus cross-device recovery. Pause points must be explicit user choices that cannot be bypassed by default recommendations, historical preferences, or automatic advancement.

Must cover:

- `reference/decision-points.md`
- `reference/recovery.md`

## Inputs

Read the common input from the main session, especially:

- `confirm-generate`, `revise-proposal`, and `cancel` from the Skill Creator confirmation page.
- Eval workload choice: `skip / quick / full eval`.
- Human approval before installation.
- Blockers such as unresolved candidates, ambiguity, capability gaps, and executable disclosures.
- Runner recovery state and cross-device recovery entry.

Use file handoff: the main session provides paths instead of pasting large bodies of text. Do not inherit main-session history; use only this brief, common input, workflow protocol, and existing drafts.

## Dispatch Template

Use the current platform's subagent mechanism. The shape should include:

```text
description: "Design user pause points and recovery for <bundle-name>"
model: <must explicitly specify model>
prompt:
  You are the pause point author subagent.
  First read this brief, the common input path, workflow protocol path, Skill draft path, and report file path.
  Start by asking questions: if user choices, blocker recovery, or cross-device state are unclear, return NEEDS_CONTEXT.
  Do not guess or fill in missing pause points.
  Only produce decision-points and recovery drafts; do not write Bundle state and do not execute candidate scripts.
  Write the full pause point draft to the report file path and return only a status summary of 15 lines or fewer.
```

## Output Requirements

Return a pause point draft that explains:

- The trigger condition for every pause point.
- The choices available to the user.
- Which Node each choice enters.
- Where pause point evidence is written.
- During recovery, how to show current Node, blocking reason, suggested next step, and options.

Pause points must fit the current workflow protocol, not merely list original Comet pause points.

## Self-Check

Before returning, check:

- Every user pause point has trigger condition, options, next Node, and evidence location.
- Default recommendations, historical preferences, and automatic advancement cannot bypass required pause points.
- The recovery summary can show current Node, blocking reason, suggested next step, and options.
- Cross-device recovery does not rely on current-session memory.
- Pause points fit the current composed Skill instead of copying original Comet pause points.

## Required Claims

- `pause:decision-points`
- `pause:recovery`

Missing any claim must block Skill review.

## Status Return

Status must be one of `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.

Write the full report to the report file path. The summary returned to the main session must be 15 lines or fewer and include status, report path, claims, unresolved concerns, and recovery risks. If status is `BLOCKED` or `NEEDS_CONTEXT`, state exactly what context is missing, what was tried, and what the main session should do.
