# Comet IntentFrame Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Classic `/comet` entry routing from prompt-only preset detection to a structured, testable `CometIntentFrame` router.

**Current status:** Implementation, runtime bundle, bilingual Skill sync, changelog, and verification are complete. Commit-only checkpoints remain unchecked until these changes are committed and the final clean-status check passes.

**Architecture:** Agent-facing Skill prose fills a structured intent frame, while the Node Classic runtime validates that frame and deterministically resolves `full`, `hotfix`, `tweak`, `resume`, `ask_user`, or `out_of_scope`. Existing `.comet.yaml` workflow values and `classic-resolver.ts` phase routing remain unchanged after entry routing selects the workflow.

**Tech Stack:** TypeScript, Node.js ESM, Vitest, esbuild classic runtime bundle, bundled Comet Skill assets, `assets/manifest.json`.

## Global Constraints

- Do not include `/comet-any` in this implementation; it will get a separate authoring intent frame later.
- Do not add LangExtract, Python runtime, cloud NLU services, or external model dependencies.
- Runtime must not call an LLM; it only validates Agent-filled JSON and applies deterministic rules.
- Keep `.comet.yaml.workflow` limited to `full | hotfix | tweak`.
- Script launchers stay under `assets/skills/comet/scripts/`; there is no `assets/skills-zh/comet/scripts/` directory in the current asset layout.
- For Skill content, update `assets/skills-zh/` first, pause for user confirmation, then sync `assets/skills/`.
- Changelog is English. Current master `package.json` version is `0.3.11`, and the active changelog/package line is `0.4.0-beta.1`; append this user-visible change to `0.4.0-beta.1` unless implementation-time checks show a different already-bumped branch version.
- Existing unstaged `package.json` and `package-lock.json` changes predate this plan; do not stage or overwrite them unless the user explicitly includes them.

---

## File Structure

- Create `domains/comet-classic/classic-intent.ts`: owns `CometIntentFrame` types, validation, route scoring, and route diagnostics.
- Create `domains/comet-classic/classic-intent-command.ts`: exposes `intent route` for the bundled runtime.
- Modify `domains/comet-classic/classic-cli.ts`: register the `intent` Classic command.
- Modify `domains/comet-classic/index.ts`: export the intent module and command.
- Create `test/domains/comet-classic/classic-intent.test.ts`: focused unit coverage for validation and route scoring.
- Modify `test/domains/comet-classic/classic-runtime.test.ts`: CLI and bundled runtime coverage for `intent`.
- Modify `test/domains/comet-classic/comet-scripts.test.ts`: launcher contract and temp-copy list include `comet-intent.mjs`.
- Create `assets/skills/comet/scripts/comet-intent.mjs`: thin launcher delegating to `comet-runtime.mjs`.
- Modify `assets/manifest.json`: ship the new launcher.
- Modify `assets/skills-zh/comet/SKILL.md`: Step 0 uses `CometIntentFrame` and runtime routing.
- Modify `assets/skills-zh/comet/reference/scripts.md`: add `COMET_INTENT`.
- Modify `assets/skills-zh/comet-hotfix/SKILL.md` and `assets/skills-zh/comet-tweak/SKILL.md`: mention intent-frame risk signal recheck only.
- After user confirms Chinese wording, modify the English counterparts under `assets/skills/`.
- Modify `test/domains/skill/skills.test.ts`: regression assertions for the new entry routing contract and script locator.
- Modify `CHANGELOG.md`: add user-visible entry-routing behavior change and test coverage under `0.4.0-beta.1`.

### Task 1: Intent Model And Deterministic Scorer

**Files:**

- Create: `domains/comet-classic/classic-intent.ts`
- Create: `test/domains/comet-classic/classic-intent.test.ts`
- Modify: `domains/comet-classic/index.ts`

**Interfaces:**

- Produces: `CometIntentFrame`, `CometIntentRoute`, `CometIntentValidationError`, `resolveCometIntentRoute(input: unknown): CometIntentRouteResolution`.
- Consumes: no new project modules; this task is pure TypeScript and has no filesystem side effects.

- [x] **Step 1: Write the failing scorer tests**

Create `test/domains/comet-classic/classic-intent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CometIntentValidationError,
  resolveCometIntentRoute,
  type CometIntentFrame,
} from '../../../domains/comet-classic/classic-intent.js';

function frame(overrides: Partial<CometIntentFrame> = {}): CometIntentFrame {
  const base: CometIntentFrame = {
    schema_version: 'comet.intent.v1',
    utterance: 'fix the failing comet guard regression',
    locale: 'en',
    intent: { name: 'fix_bug', confidence: 0.91 },
    entities: [{ type: 'bug_signal', value: 'regression', text: 'regression' }],
    slots: {
      requested_action: 'fix',
      workflow_candidate: 'hotfix',
      user_explicit_workflow: null,
      change_id: null,
      target_area: 'comet guard',
      scope: 'small',
      existing_behavior: true,
      new_capability: false,
      public_api_change: false,
      schema_change: false,
      cross_module_change: false,
    },
    context: {
      active_changes_count: 0,
      active_change_names: [],
      dirty_worktree: false,
    },
    evidence: [
      { field: 'intent.name', quote: 'fix', source: 'user' },
      { field: 'slots.workflow_candidate', quote: 'regression', source: 'user' },
    ],
    proposed_route: {
      name: 'hotfix',
      next_skill: 'comet-hotfix',
      confidence: 0.9,
      requires_confirmation: false,
      fallback_reason: null,
    },
  };
  return {
    ...base,
    ...overrides,
    intent: { ...base.intent, ...overrides.intent },
    slots: { ...base.slots, ...overrides.slots },
    context: { ...base.context, ...overrides.context },
    proposed_route: { ...base.proposed_route, ...overrides.proposed_route },
  };
}

describe('resolveCometIntentRoute', () => {
  it('routes existing bug fixes to hotfix', () => {
    const result = resolveCometIntentRoute(frame());

    expect(result.route).toMatchObject({
      name: 'hotfix',
      next_skill: 'comet-hotfix',
      requires_confirmation: false,
    });
  });

  it('routes doc, config, and prompt changes to tweak', () => {
    const result = resolveCometIntentRoute(
      frame({
        utterance: 'tweak the comet prompt wording',
        intent: { name: 'make_tweak', confidence: 0.89 },
        entities: [{ type: 'file_path', value: 'assets/skills-zh/comet/SKILL.md', text: 'prompt' }],
        slots: {
          requested_action: 'modify',
          workflow_candidate: 'tweak',
          existing_behavior: null,
          target_area: 'prompt wording',
        },
        evidence: [
          { field: 'intent.name', quote: 'tweak', source: 'user' },
          { field: 'slots.workflow_candidate', quote: 'prompt wording', source: 'user' },
        ],
        proposed_route: { name: 'tweak', next_skill: 'comet-tweak', confidence: 0.88 },
      }),
    );

    expect(result.route).toMatchObject({ name: 'tweak', next_skill: 'comet-tweak' });
  });

  it('routes new capability and public API risk signals to full', () => {
    const result = resolveCometIntentRoute(
      frame({
        utterance: 'add a public API for intent routing',
        intent: { name: 'start_change', confidence: 0.93 },
        entities: [{ type: 'risk_signal', value: 'public_api_change', text: 'public API' }],
        slots: {
          requested_action: 'create',
          workflow_candidate: 'full',
          scope: 'large',
          existing_behavior: false,
          new_capability: true,
          public_api_change: true,
        },
        evidence: [
          { field: 'intent.name', quote: 'add', source: 'user' },
          { field: 'slots.public_api_change', quote: 'public API', source: 'user' },
        ],
        proposed_route: { name: 'full', next_skill: 'comet-open', confidence: 0.93 },
      }),
    );

    expect(result.route).toMatchObject({ name: 'full', next_skill: 'comet-open' });
  });

  it('asks the user when explicit hotfix conflicts with risk signals', () => {
    const result = resolveCometIntentRoute(
      frame({
        utterance: 'use hotfix but add a public API',
        slots: {
          user_explicit_workflow: 'hotfix',
          workflow_candidate: 'hotfix',
          new_capability: true,
          public_api_change: true,
        },
        entities: [{ type: 'workflow', value: 'hotfix', text: 'hotfix' }],
        evidence: [
          { field: 'slots.user_explicit_workflow', quote: 'hotfix', source: 'user' },
          { field: 'slots.public_api_change', quote: 'public API', source: 'user' },
        ],
      }),
    );

    expect(result.route.name).toBe('ask_user');
    expect(result.route.fallback_reason).toContain('conflicts with risk signals');
  });

  it('asks the user when multiple active changes are possible and no change id is provided', () => {
    const result = resolveCometIntentRoute(
      frame({
        utterance: 'continue comet',
        intent: { name: 'resume_change', confidence: 0.9 },
        slots: { requested_action: 'continue', workflow_candidate: null },
        context: { active_changes_count: 2, active_change_names: ['a', 'b'] },
        evidence: [{ field: 'intent.name', quote: 'continue', source: 'user' }],
      }),
    );

    expect(result.route.name).toBe('ask_user');
    expect(result.route.fallback_reason).toContain('multiple active changes');
  });

  it('routes explicit resume with a matching change id to resume', () => {
    const result = resolveCometIntentRoute(
      frame({
        utterance: 'resume change intent-frame-routing',
        intent: { name: 'resume_change', confidence: 0.92 },
        slots: {
          requested_action: 'resume',
          workflow_candidate: null,
          change_id: 'intent-frame-routing',
        },
        context: {
          active_changes_count: 2,
          active_change_names: ['intent-frame-routing', 'other-change'],
        },
        evidence: [
          { field: 'intent.name', quote: 'resume', source: 'user' },
          { field: 'slots.change_id', quote: 'intent-frame-routing', source: 'user' },
        ],
      }),
    );

    expect(result.route).toMatchObject({ name: 'resume', next_skill: null });
  });

  it('asks the user when confidence is too low', () => {
    const result = resolveCometIntentRoute(
      frame({ intent: { name: 'fix_bug', confidence: 0.49 } }),
    );

    expect(result.route.name).toBe('ask_user');
    expect(result.route.fallback_reason).toContain('confidence');
  });

  it('throws a readable validation error for invalid schema', () => {
    expect(() => resolveCometIntentRoute({ schema_version: 'wrong' })).toThrow(
      CometIntentValidationError,
    );
  });
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-intent.test.ts
```

Expected: FAIL because `domains/comet-classic/classic-intent.ts` does not exist.

- [x] **Step 3: Implement the model, validator, and scorer**

Create `domains/comet-classic/classic-intent.ts`:

```ts
export const COMET_INTENT_SCHEMA_VERSION = 'comet.intent.v1' as const;
export const COMET_INTENT_CONFIDENCE_THRESHOLD = 0.7;

const INTENT_NAMES = [
  'start_change',
  'resume_change',
  'fix_bug',
  'make_tweak',
  'ask_question',
  'unknown',
] as const;
const ENTITY_TYPES = [
  'change_id',
  'workflow',
  'file_path',
  'command',
  'capability',
  'bug_signal',
  'risk_signal',
] as const;
const REQUESTED_ACTIONS = [
  'start',
  'resume',
  'continue',
  'fix',
  'modify',
  'create',
  'verify',
  'archive',
  'question',
  'unknown',
] as const;
const WORKFLOWS = ['full', 'hotfix', 'tweak'] as const;
const SCOPES = ['small', 'medium', 'large', 'unknown'] as const;
const ROUTES = ['full', 'hotfix', 'tweak', 'resume', 'ask_user', 'out_of_scope'] as const;
const NEXT_SKILLS = [
  'comet-open',
  'comet-hotfix',
  'comet-tweak',
  'comet-design',
  'comet-build',
  'comet-verify',
  'comet-archive',
] as const;
const EVIDENCE_SOURCES = ['user', 'repo', 'state'] as const;

type ValueOf<T extends readonly string[]> = T[number];

export type CometIntentName = ValueOf<typeof INTENT_NAMES>;
export type CometIntentEntityType = ValueOf<typeof ENTITY_TYPES>;
export type CometIntentRequestedAction = ValueOf<typeof REQUESTED_ACTIONS>;
export type CometIntentWorkflow = ValueOf<typeof WORKFLOWS>;
export type CometIntentScope = ValueOf<typeof SCOPES>;
export type CometIntentRouteName = ValueOf<typeof ROUTES>;
export type CometIntentNextSkill = ValueOf<typeof NEXT_SKILLS>;
export type CometIntentEvidenceSource = ValueOf<typeof EVIDENCE_SOURCES>;

export interface CometIntentFrame {
  schema_version: typeof COMET_INTENT_SCHEMA_VERSION;
  utterance: string;
  locale: string;
  intent: { name: CometIntentName; confidence: number };
  entities: Array<{ type: CometIntentEntityType; value: string; text: string }>;
  slots: {
    requested_action: CometIntentRequestedAction;
    workflow_candidate: CometIntentWorkflow | null;
    user_explicit_workflow: CometIntentWorkflow | null;
    change_id: string | null;
    target_area: string | null;
    scope: CometIntentScope;
    existing_behavior: boolean | null;
    new_capability: boolean | null;
    public_api_change: boolean | null;
    schema_change: boolean | null;
    cross_module_change: boolean | null;
  };
  context: {
    active_changes_count: number;
    active_change_names: string[];
    dirty_worktree: boolean | null;
  };
  evidence: Array<{ field: string; quote: string; source: CometIntentEvidenceSource }>;
  proposed_route: CometIntentRoute;
}

export interface CometIntentNormalizedFrame extends CometIntentFrame {
  route: CometIntentRoute;
}

export interface CometIntentRoute {
  name: CometIntentRouteName;
  next_skill: CometIntentNextSkill | null;
  confidence: number;
  requires_confirmation: boolean;
  fallback_reason: string | null;
}

export interface CometIntentRouteResolution {
  route: CometIntentRoute;
  diagnostics: string[];
  normalizedFrame: CometIntentNormalizedFrame;
}

export class CometIntentValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid CometIntentFrame:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
  issues: string[],
): ValueOf<T> | null {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    issues.push(`${field} must be one of: ${allowed.join(', ')}`);
    return null;
  }
  return value as ValueOf<T>;
}

function optionalEnumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
  issues: string[],
): ValueOf<T> | null {
  if (value === null) return null;
  return enumValue(value, allowed, field, issues);
}

function stringValue(value: unknown, field: string, issues: string[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${field} must be a non-empty string`);
    return '';
  }
  return value;
}

function optionalStringValue(value: unknown, field: string, issues: string[]): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${field} must be a non-empty string or null`);
    return null;
  }
  return value;
}

function optionalBooleanValue(value: unknown, field: string, issues: string[]): boolean | null {
  if (value === null) return null;
  if (typeof value !== 'boolean') {
    issues.push(`${field} must be boolean or null`);
    return null;
  }
  return value;
}

function confidenceValue(value: unknown, field: string, issues: string[]): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    issues.push(`${field} must be a number between 0 and 1`);
    return 0;
  }
  return value;
}

function validateFrame(input: unknown): CometIntentFrame {
  const issues: string[] = [];
  if (!isRecord(input)) throw new CometIntentValidationError(['frame must be an object']);

  const intent = isRecord(input.intent) ? input.intent : {};
  if (!isRecord(input.intent)) issues.push('intent must be an object');
  const slots = isRecord(input.slots) ? input.slots : {};
  if (!isRecord(input.slots)) issues.push('slots must be an object');
  const context = isRecord(input.context) ? input.context : {};
  if (!isRecord(input.context)) issues.push('context must be an object');
  const proposedRouteInput = isRecord(input.proposed_route) ? input.proposed_route : {};
  if (!isRecord(input.proposed_route)) issues.push('proposed_route must be an object');

  const entities = Array.isArray(input.entities) ? input.entities : [];
  if (!Array.isArray(input.entities)) issues.push('entities must be an array');
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  if (!Array.isArray(input.evidence)) issues.push('evidence must be an array');

  const frame: CometIntentFrame = {
    schema_version: enumValue(
      input.schema_version,
      [COMET_INTENT_SCHEMA_VERSION] as const,
      'schema_version',
      issues,
    ) as typeof COMET_INTENT_SCHEMA_VERSION,
    utterance: stringValue(input.utterance, 'utterance', issues),
    locale: stringValue(input.locale, 'locale', issues),
    intent: {
      name: enumValue(intent.name, INTENT_NAMES, 'intent.name', issues) ?? 'unknown',
      confidence: confidenceValue(intent.confidence, 'intent.confidence', issues),
    },
    entities: entities.map((entity, index) => {
      const record = isRecord(entity) ? entity : {};
      if (!isRecord(entity)) issues.push(`entities[${index}] must be an object`);
      return {
        type:
          enumValue(record.type, ENTITY_TYPES, `entities[${index}].type`, issues) ?? 'risk_signal',
        value: stringValue(record.value, `entities[${index}].value`, issues),
        text: stringValue(record.text, `entities[${index}].text`, issues),
      };
    }),
    slots: {
      requested_action:
        enumValue(slots.requested_action, REQUESTED_ACTIONS, 'slots.requested_action', issues) ??
        'unknown',
      workflow_candidate: optionalEnumValue(
        slots.workflow_candidate,
        WORKFLOWS,
        'slots.workflow_candidate',
        issues,
      ),
      user_explicit_workflow: optionalEnumValue(
        slots.user_explicit_workflow,
        WORKFLOWS,
        'slots.user_explicit_workflow',
        issues,
      ),
      change_id: optionalStringValue(slots.change_id, 'slots.change_id', issues),
      target_area: optionalStringValue(slots.target_area, 'slots.target_area', issues),
      scope: enumValue(slots.scope, SCOPES, 'slots.scope', issues) ?? 'unknown',
      existing_behavior: optionalBooleanValue(
        slots.existing_behavior,
        'slots.existing_behavior',
        issues,
      ),
      new_capability: optionalBooleanValue(slots.new_capability, 'slots.new_capability', issues),
      public_api_change: optionalBooleanValue(
        slots.public_api_change,
        'slots.public_api_change',
        issues,
      ),
      schema_change: optionalBooleanValue(slots.schema_change, 'slots.schema_change', issues),
      cross_module_change: optionalBooleanValue(
        slots.cross_module_change,
        'slots.cross_module_change',
        issues,
      ),
    },
    context: {
      active_changes_count:
        typeof context.active_changes_count === 'number' && context.active_changes_count >= 0
          ? context.active_changes_count
          : 0,
      active_change_names: Array.isArray(context.active_change_names)
        ? context.active_change_names.filter((value): value is string => typeof value === 'string')
        : [],
      dirty_worktree: optionalBooleanValue(
        context.dirty_worktree,
        'context.dirty_worktree',
        issues,
      ),
    },
    evidence: evidence.map((item, index) => {
      const record = isRecord(item) ? item : {};
      if (!isRecord(item)) issues.push(`evidence[${index}] must be an object`);
      return {
        field: stringValue(record.field, `evidence[${index}].field`, issues),
        quote: stringValue(record.quote, `evidence[${index}].quote`, issues),
        source:
          enumValue(record.source, EVIDENCE_SOURCES, `evidence[${index}].source`, issues) ?? 'user',
      };
    }),
    proposed_route: {
      name: enumValue(proposedRouteInput.name, ROUTES, 'proposed_route.name', issues) ?? 'ask_user',
      next_skill: optionalEnumValue(
        proposedRouteInput.next_skill,
        NEXT_SKILLS,
        'proposed_route.next_skill',
        issues,
      ),
      confidence: confidenceValue(
        proposedRouteInput.confidence,
        'proposed_route.confidence',
        issues,
      ),
      requires_confirmation:
        typeof proposedRouteInput.requires_confirmation === 'boolean'
          ? proposedRouteInput.requires_confirmation
          : true,
      fallback_reason: optionalStringValue(
        proposedRouteInput.fallback_reason,
        'proposed_route.fallback_reason',
        issues,
      ),
    },
  };

  if (issues.length > 0) throw new CometIntentValidationError(issues);
  return frame;
}

function hasEvidence(frame: CometIntentFrame, field: string): boolean {
  return frame.evidence.some((item) => item.field === field && item.quote.trim() !== '');
}

function hasRiskSignal(frame: CometIntentFrame): boolean {
  return (
    frame.slots.new_capability === true ||
    frame.slots.public_api_change === true ||
    frame.slots.schema_change === true ||
    frame.slots.cross_module_change === true
  );
}

function route(
  name: CometIntentRouteName,
  confidence: number,
  fallback_reason: string | null = null,
): CometIntentRoute {
  const nextSkill: Record<CometIntentRouteName, CometIntentNextSkill | null> = {
    full: 'comet-open',
    hotfix: 'comet-hotfix',
    tweak: 'comet-tweak',
    resume: null,
    ask_user: null,
    out_of_scope: null,
  };
  return {
    name,
    next_skill: nextSkill[name],
    confidence,
    requires_confirmation: name === 'ask_user' || name === 'out_of_scope',
    fallback_reason,
  };
}

function askUser(reason: string): CometIntentRoute {
  return route('ask_user', 0.5, reason);
}

function workflowRoute(workflow: CometIntentWorkflow, confidence: number): CometIntentRoute {
  return route(workflow, confidence);
}

export function resolveCometIntentRoute(input: unknown): CometIntentRouteResolution {
  const frame = validateFrame(input);
  const diagnostics: string[] = [];
  const confidence = frame.intent.confidence;

  let resolved: CometIntentRoute;
  if (frame.intent.confidence < COMET_INTENT_CONFIDENCE_THRESHOLD) {
    resolved = askUser(
      `intent confidence ${frame.intent.confidence} is below ${COMET_INTENT_CONFIDENCE_THRESHOLD}`,
    );
  } else if (
    (frame.intent.name === 'resume_change' ||
      frame.slots.requested_action === 'resume' ||
      frame.slots.requested_action === 'continue') &&
    !frame.slots.change_id &&
    frame.context.active_changes_count > 1
  ) {
    resolved = askUser('multiple active changes require an explicit change_id');
  } else if (
    (frame.intent.name === 'resume_change' ||
      frame.slots.requested_action === 'resume' ||
      frame.slots.requested_action === 'continue') &&
    frame.slots.change_id
  ) {
    resolved = frame.context.active_change_names.includes(frame.slots.change_id)
      ? route('resume', confidence)
      : askUser(`change_id '${frame.slots.change_id}' is not in active_change_names`);
  } else if (frame.intent.name === 'ask_question' || frame.slots.requested_action === 'question') {
    resolved = route(
      'out_of_scope',
      confidence,
      'user asked a question without requesting a Comet workflow',
    );
  } else if (
    frame.slots.user_explicit_workflow &&
    frame.slots.user_explicit_workflow !== 'full' &&
    hasRiskSignal(frame)
  ) {
    resolved = askUser(
      `explicit workflow '${frame.slots.user_explicit_workflow}' conflicts with risk signals`,
    );
  } else if (frame.slots.user_explicit_workflow) {
    resolved = workflowRoute(frame.slots.user_explicit_workflow, confidence);
  } else if (hasRiskSignal(frame)) {
    resolved = route('full', confidence);
  } else if (
    frame.intent.name === 'fix_bug' &&
    frame.slots.existing_behavior === true &&
    hasEvidence(frame, 'slots.workflow_candidate')
  ) {
    resolved = route('hotfix', confidence);
  } else if (
    frame.intent.name === 'make_tweak' &&
    frame.slots.workflow_candidate === 'tweak' &&
    hasEvidence(frame, 'slots.workflow_candidate')
  ) {
    resolved = route('tweak', confidence);
  } else if (frame.slots.workflow_candidate && hasEvidence(frame, 'slots.workflow_candidate')) {
    resolved = workflowRoute(frame.slots.workflow_candidate, confidence);
  } else {
    resolved = askUser('workflow_candidate evidence is missing or route is ambiguous');
  }

  if (resolved.name !== frame.proposed_route.name) {
    diagnostics.push(
      `agent proposed_route '${frame.proposed_route.name}' normalized to '${resolved.name}'`,
    );
  }

  return {
    route: resolved,
    diagnostics,
    normalizedFrame: { ...frame, route: resolved },
  };
}
```

- [x] **Step 4: Export the new module**

Add this line to `domains/comet-classic/index.ts`:

```ts
export * from './classic-intent.js';
```

- [x] **Step 5: Run the focused test and verify it passes**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-intent.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit Task 1 (covered by consolidated commit)**

```bash
git add domains/comet-classic/classic-intent.ts domains/comet-classic/index.ts test/domains/comet-classic/classic-intent.test.ts
git commit -m "feat: add comet intent frame scorer"
```

### Task 2: Classic Runtime Intent Command

**Files:**

- Create: `domains/comet-classic/classic-intent-command.ts`
- Modify: `domains/comet-classic/classic-cli.ts`
- Modify: `domains/comet-classic/index.ts`
- Modify: `test/domains/comet-classic/classic-runtime.test.ts`

**Interfaces:**

- Consumes: `resolveCometIntentRoute(input: unknown)` from Task 1.
- Produces: Classic command `intent route <frame-json>` and `intent route --stdin`.

- [x] **Step 1: Add failing CLI adapter tests**

In `test/domains/comet-classic/classic-runtime.test.ts`, add these tests inside `describe('Classic runtime CLI adapter', ...)`:

```ts
it('routes intent frames through the Classic CLI', async () => {
  const { runClassicCli } = await import('../../../domains/comet-classic/classic-cli.js');
  const frame = {
    schema_version: 'comet.intent.v1',
    utterance: 'fix the broken guard',
    locale: 'en',
    intent: { name: 'fix_bug', confidence: 0.92 },
    entities: [{ type: 'bug_signal', value: 'broken', text: 'broken' }],
    slots: {
      requested_action: 'fix',
      workflow_candidate: 'hotfix',
      user_explicit_workflow: null,
      change_id: null,
      target_area: 'guard',
      scope: 'small',
      existing_behavior: true,
      new_capability: false,
      public_api_change: false,
      schema_change: false,
      cross_module_change: false,
    },
    context: { active_changes_count: 0, active_change_names: [], dirty_worktree: false },
    evidence: [
      { field: 'intent.name', quote: 'fix', source: 'user' },
      { field: 'slots.workflow_candidate', quote: 'broken', source: 'user' },
    ],
    route: {
      name: 'hotfix',
      next_skill: 'comet-hotfix',
      confidence: 0.9,
      requires_confirmation: false,
      fallback_reason: null,
    },
  };

  const result = await runClassicCli(['intent', 'route', JSON.stringify(frame)]);

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout ?? '')).toMatchObject({
    route: { name: 'hotfix', next_skill: 'comet-hotfix' },
  });
});

it('returns readable intent validation errors', async () => {
  const { runClassicCli } = await import('../../../domains/comet-classic/classic-cli.js');

  const result = await runClassicCli(['intent', 'route', '{"schema_version":"wrong"}']);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('Invalid CometIntentFrame');
});
```

- [x] **Step 2: Run the CLI adapter tests and verify they fail**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-runtime.test.ts
```

Expected: FAIL because `intent` is an unknown Classic command.

- [x] **Step 3: Implement the intent command**

Create `domains/comet-classic/classic-intent-command.ts`:

```ts
import type { ClassicCommandHandler, ClassicCommandResult } from './classic-cli.js';
import { CometIntentValidationError, resolveCometIntentRoute } from './classic-intent.js';

function result(exitCode: number, stdout?: string, stderr?: string): ClassicCommandResult {
  return {
    exitCode,
    ...(stdout === undefined ? {} : { stdout }),
    ...(stderr === undefined ? {} : { stderr }),
  };
}

function usage(): ClassicCommandResult {
  return result(
    64,
    undefined,
    'Usage: comet-runtime intent route <frame-json>\nUsage: comet-runtime intent route --stdin',
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const classicIntentCommand: ClassicCommandHandler = async (args) => {
  const [subcommand, input] = args;
  if (subcommand !== 'route') return usage();

  const source = input === '--stdin' ? await readStdin() : input;
  if (!source) return usage();

  try {
    const resolution = resolveCometIntentRoute(JSON.parse(source));
    return result(0, `${JSON.stringify(resolution, null, 2)}\n`);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return result(1, undefined, `Invalid JSON: ${error.message}`);
    }
    if (error instanceof CometIntentValidationError) {
      return result(1, undefined, error.message);
    }
    throw error;
  }
};
```

- [x] **Step 4: Register the command**

Modify `domains/comet-classic/classic-cli.ts`:

```ts
import { classicIntentCommand } from './classic-intent-command.js';
```

Add `'intent'` to `CLASSIC_COMMANDS`:

```ts
export const CLASSIC_COMMANDS = [
  'state',
  'validate',
  'guard',
  'handoff',
  'archive',
  'hook-guard',
  'intent',
] as const;
```

Add the handler:

```ts
  intent: classicIntentCommand,
```

Add this line to `domains/comet-classic/index.ts`:

```ts
export * from './classic-intent-command.js';
```

- [x] **Step 5: Run the CLI adapter tests and verify they pass**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-runtime.test.ts test/domains/comet-classic/classic-intent.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit Task 2 (covered by consolidated commit)**

```bash
git add domains/comet-classic/classic-intent-command.ts domains/comet-classic/classic-cli.ts domains/comet-classic/index.ts test/domains/comet-classic/classic-runtime.test.ts
git commit -m "feat: add comet intent runtime command"
```

### Task 3: Launcher, Manifest, And Runtime Bundle

**Files:**

- Create: `assets/skills/comet/scripts/comet-intent.mjs`
- Modify: `assets/manifest.json`
- Modify: `assets/skills/comet/scripts/comet-runtime.mjs`
- Modify: `test/domains/comet-classic/comet-scripts.test.ts`
- Modify: `test/domains/comet-classic/classic-runtime.test.ts`

**Interfaces:**

- Consumes: `intent` Classic command from Task 2.
- Produces: shipped launcher supporting both `node "$COMET_INTENT" route <frame-json>` and the preferred `node "$COMET_INTENT" route --stdin`.

- [x] **Step 1: Add failing launcher and manifest tests**

In `test/domains/comet-classic/comet-scripts.test.ts`, update the `sources` object in `keeps all Classic launchers as runtime-only Node facades`:

```ts
      intent: await fs.readFile(path.join(scriptsDir, 'comet-intent.mjs'), 'utf-8'),
```

In the `beforeEach` copy list, add:

```ts
      'comet-intent.mjs',
```

In `test/domains/comet-classic/classic-runtime.test.ts`, update the manifest assertion:

```ts
expect(manifest.skills).toContain('comet/scripts/comet-runtime.mjs');
expect(manifest.skills).toContain('comet/scripts/comet-intent.mjs');
```

- [x] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-scripts.test.ts test/domains/comet-classic/classic-runtime.test.ts
```

Expected: FAIL because `comet-intent.mjs` is missing and not listed in `assets/manifest.json`.

- [x] **Step 3: Add the thin launcher**

Create `assets/skills/comet/scripts/comet-intent.mjs`:

```js
#!/usr/bin/env node
// comet-intent.mjs — Comet entry intent routing CLI launcher.
// Thin Node facade: delegates to the bundled comet-runtime.mjs so the skill
// never needs bash. Equivalent to `node comet-runtime.mjs intent "$@"`.
import { main } from './comet-runtime.mjs';

process.exitCode = await main(['intent', ...process.argv.slice(2)]);
```

- [x] **Step 4: Ship the launcher in the manifest**

In `assets/manifest.json`, add the script entry next to the other Comet scripts:

```json
    "comet/scripts/comet-intent.mjs",
```

- [x] **Step 5: Rebuild the bundled runtime**

Run:

```bash
pnpm build:classic-runtime
```

Expected: exit 0 and `assets/skills/comet/scripts/comet-runtime.mjs` changes to include the new `intent` command.

- [x] **Step 6: Run launcher/runtime tests**

Run:

```bash
npx vitest run test/domains/comet-classic/comet-scripts.test.ts test/domains/comet-classic/classic-runtime.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit Task 3 (covered by consolidated commit)**

```bash
git add assets/manifest.json assets/skills/comet/scripts/comet-intent.mjs assets/skills/comet/scripts/comet-runtime.mjs test/domains/comet-classic/comet-scripts.test.ts test/domains/comet-classic/classic-runtime.test.ts
git commit -m "feat: ship comet intent launcher"
```

### Task 4: Chinese Skill Contract

**Files:**

- Modify: `assets/skills-zh/comet/SKILL.md`
- Modify: `assets/skills-zh/comet/reference/scripts.md`
- Modify: `assets/skills-zh/comet-hotfix/SKILL.md`
- Modify: `assets/skills-zh/comet-tweak/SKILL.md`
- Modify: `test/domains/skill/skills.test.ts`

**Interfaces:**

- Consumes: `COMET_INTENT` launcher from Task 3.
- Produces: Chinese Skill prose that treats `CometIntentFrame + runtime scorer` as the entry routing source of truth.

- [x] **Step 1: Add failing Chinese Skill contract tests**

In `test/domains/skill/skills.test.ts`, add assertions near the existing Chinese Comet Skill consistency block:

```ts
expect(zhComet).toContain('CometIntentFrame');
expect(zhComet).toContain('node "$COMET_INTENT" route --stdin');
expect(zhComet).toContain('**CometIntentFrame 最小骨架**');
expect(zhComet).toContain('"schema_version": "comet.intent.v1"');
expect(zhComet).toContain('"slots": {');
expect(zhComet).toContain('"context": {');
expect(zhComet).toContain('"evidence": []');
expect(zhComet).toContain('"proposed_route": {');
expect(zhComet).not.toContain('"entities": []');
expect(zhComet).not.toContain('"target_area":');
expect(zhComet).not.toContain('"scope":');
expect(zhComet).not.toContain('"dirty_worktree":');
expect(zhComet).not.toContain('"next_skill": null');
expect(zhComet).not.toContain('"requires_confirmation": true');
expect(zhComet).not.toContain('"fallback_reason": null');
expect(zhComet).toContain('`ask_user`');
expect(zhComet).toContain('`CometIntentFrame + runtime scorer` 是事实源');
expect(zhComet).toContain('`comet/reference/intent-frame.md`');
expect(zhIntentFrame).toContain('`requested_action`');
expect(zhIntentFrame).toContain('`workflow_candidate`');
expect(zhIntentFrame).toContain('`proposed_route`');
expect(zhHotfix).toContain('入口传入 intent frame');
expect(zhHotfix).toContain('复核 `risk_signal` 和升级信号');
expect(zhTweak).toContain('入口传入 intent frame');
expect(zhTweak).toContain('复核 `risk_signal` 和升级信号');
```

In the `ships a shared script locator helper` test, add:

```ts
expect(manifest.skills).toContain('comet/scripts/comet-intent.mjs');
```

In the script locator content checks, add assertions for both language script references:

```ts
expect(zhScripts).toContain('COMET_INTENT="$COMET_SCRIPTS_DIR/comet-intent.mjs"');
```

If the test does not already load `zhScripts`, add this before the assertion:

```ts
const zhScripts = await fs.readFile(
  path.resolve('assets', 'skills-zh', 'comet', 'reference', 'scripts.md'),
  'utf-8',
);
```

- [x] **Step 2: Run Skill tests and verify they fail**

Run:

```bash
npx vitest run test/domains/skill/skills.test.ts
```

Expected: FAIL because the Chinese Skill files do not mention `CometIntentFrame` or `COMET_INTENT` yet.

- [x] **Step 3: Add `COMET_INTENT` to Chinese script locator**

In `assets/skills-zh/comet/reference/scripts.md`, add:

```bash
COMET_INTENT="$COMET_SCRIPTS_DIR/comet-intent.mjs"
```

Place it after `COMET_ARCHIVE="$COMET_SCRIPTS_DIR/comet-archive.mjs"` and before `COMET_RUNTIME`.

Update the sentence after the bootstrap block so it lists `$COMET_INTENT`:

```md
加载 comet 后，agent 应执行以上变量赋值一次，后续全程复用 `$COMET_GUARD`、`$COMET_STATE`、`$COMET_HANDOFF`、`$COMET_ARCHIVE`、`$COMET_INTENT`。
```

- [x] **Step 4: Replace `/comet` Step 0 with IntentFrame routing**

In `assets/skills-zh/comet/SKILL.md`, replace the existing Step 0 preset-detection prose with this structure while keeping the active-change table and later Step 1/Step 2 recovery rules:

```md
**Step 0: 活跃 Change 发现与意图判定**

1. 先按 `comet/reference/scripts.md` 完成脚本定位，确保 `$COMET_INTENT` 可用。
2. 运行 `openspec list --json` 获取所有活跃 change。
3. 根据用户请求、active change 列表和必要仓库状态填写 `CometIntentFrame`。
4. 优先用 `node "$COMET_INTENT" route --stdin` 传入 frame JSON，获取 runtime 规范化路由。`CometIntentFrame + runtime scorer` 是事实源；本节自然语言规则只用于意图识别槽位提取。
5. 按 runtime route 处理：
   - `hotfix` → 直接调用 `/comet-hotfix`
   - `tweak` → 直接调用 `/comet-tweak`
   - `full` → 按活跃 change 表决定 `/comet-open` 或用户确认
   - `resume` → 进入 Step 1 读取对应 change 的 `.comet.yaml`
   - `ask_user` → 按 `comet/reference/decision-point.md` 暂停并等待用户选择
   - `out_of_scope` → 说明本次输入不是 Comet workflow 启动/恢复请求，不初始化 change

**意图识别槽位提取**：

- `fix_bug` + `existing_behavior: true` + 无新增 capability/public API/schema/cross-module 信号 → 倾向 `hotfix`
- 文案、配置、文档、prompt 或单一 OpenSpec change 的轻中量修改 → 倾向 `tweak`
- 新增 capability、public API、schema 变更、跨模块协调或架构调整 → 倾向 `full`
- 多个 active change 且用户未明确 change → `ask_user`
- 置信度不足、关键 evidence 缺失或用户显式 workflow 与风险信号冲突 → `ask_user`
```

同一段落还必须包含紧凑的 `CometIntentFrame 最小骨架`，列出 `schema_version`、`utterance`、`intent`、`slots`、`context`、`evidence` 和 `proposed_route`。不得在最小骨架中暴露 `entities`、`target_area`、`scope`、`dirty_worktree` 或 `proposed_route` 的派生字段；这些由 runtime 默认补齐。字段完整含义放在 `comet/reference/intent-frame.md`，主入口只链接该 reference，不内联完整字段表。

- [x] **Step 5: Add minimal Chinese hotfix/tweak recheck wording**

In `assets/skills-zh/comet-hotfix/SKILL.md`, add this paragraph in the upgrade判定 area:

```md
若由 `/comet` 入口传入 intent frame，hotfix 在 build 前只复核 `risk_signal` 和升级信号：新增 capability、public API、schema 变更、跨模块协调或深层架构问题。命中时进入现有升级决策点；不得重新实现入口意图识别。
```

In `assets/skills-zh/comet-tweak/SKILL.md`, add:

```md
若由 `/comet` 入口传入 intent frame，tweak 在 build 前只复核 `risk_signal` 和升级信号：新增 capability、public API、schema 变更、跨模块协调或深层架构问题。命中时进入现有升级决策点；delta spec 仍是 tweak 的正常产物，不因存在 delta spec 自动升级；不得重新实现入口意图识别。
```

- [x] **Step 6: Run Chinese Skill tests**

Run:

```bash
npx vitest run test/domains/skill/skills.test.ts
```

Expected: PASS.

- [x] **Step 7: Pause for user confirmation before English sync**

Report:

```text
Chinese Skill routing wording is updated and tests pass. Please review the Chinese wording before I sync the English assets.
```

Do not modify `assets/skills/` until the user confirms.

- [x] **Step 8: Commit Task 4 after user confirms the Chinese-only checkpoint is acceptable (covered by consolidated commit)**

```bash
git add assets/skills-zh/comet/SKILL.md assets/skills-zh/comet/reference/scripts.md assets/skills-zh/comet-hotfix/SKILL.md assets/skills-zh/comet-tweak/SKILL.md test/domains/skill/skills.test.ts
git commit -m "feat: document comet intent frame routing zh"
```

### Task 5: English Skill Sync

**Files:**

- Modify: `assets/skills/comet/SKILL.md`
- Modify: `assets/skills/comet/reference/scripts.md`
- Modify: `assets/skills/comet-hotfix/SKILL.md`
- Modify: `assets/skills/comet-tweak/SKILL.md`
- Modify: `test/domains/skill/skills.test.ts`

**Interfaces:**

- Consumes: user-approved Chinese wording from Task 4.
- Produces: English Skill assets with equivalent routing semantics.

- [x] **Step 1: Add English Skill assertions**

In `test/domains/skill/skills.test.ts`, mirror the Chinese assertions:

```ts
expect(enComet).toContain('CometIntentFrame');
expect(enComet).toContain('node "$COMET_INTENT" route --stdin');
expect(enComet).toContain('**Minimal CometIntentFrame Skeleton**');
expect(enComet).toContain('"schema_version": "comet.intent.v1"');
expect(enComet).toContain('"slots": {');
expect(enComet).toContain('"context": {');
expect(enComet).toContain('"evidence": []');
expect(enComet).toContain('"proposed_route": {');
expect(enComet).not.toContain('"entities": []');
expect(enComet).not.toContain('"target_area":');
expect(enComet).not.toContain('"scope":');
expect(enComet).not.toContain('"dirty_worktree":');
expect(enComet).not.toContain('"next_skill": null');
expect(enComet).not.toContain('"requires_confirmation": true');
expect(enComet).not.toContain('"fallback_reason": null');
expect(enComet).toContain('`ask_user`');
expect(enComet).toContain('`CometIntentFrame + runtime scorer` is the source of truth');
expect(enComet).toContain('`comet/reference/intent-frame.md`');
expect(enIntentFrame).toContain('`requested_action`');
expect(enIntentFrame).toContain('`workflow_candidate`');
expect(enIntentFrame).toContain('`proposed_route`');
expect(enHotfix).toContain('intent frame from the entry');
expect(enHotfix).toContain('recheck `risk_signal` and escalation signals');
expect(enTweak).toContain('intent frame from the entry');
expect(enTweak).toContain('recheck `risk_signal` and escalation signals');
```

Add the English scripts reference assertion:

```ts
const enScripts = await fs.readFile(
  path.resolve('assets', 'skills', 'comet', 'reference', 'scripts.md'),
  'utf-8',
);
expect(enScripts).toContain('COMET_INTENT="$COMET_SCRIPTS_DIR/comet-intent.mjs"');
```

- [x] **Step 2: Run Skill tests and verify they fail**

Run:

```bash
npx vitest run test/domains/skill/skills.test.ts
```

Expected: FAIL because English Skill files are not synced yet.

- [x] **Step 3: Add `COMET_INTENT` to English script locator**

In `assets/skills/comet/reference/scripts.md`, add:

```bash
COMET_INTENT="$COMET_SCRIPTS_DIR/comet-intent.mjs"
```

Place it after `COMET_ARCHIVE="$COMET_SCRIPTS_DIR/comet-archive.mjs"` and before `COMET_RUNTIME`.

Update the post-block sentence:

```md
After loading comet, agents should run this bootstrap block once, then reuse `$COMET_GUARD`, `$COMET_STATE`, `$COMET_HANDOFF`, `$COMET_ARCHIVE`, and `$COMET_INTENT` throughout the session.
```

- [x] **Step 4: Sync English `/comet` Step 0**

In `assets/skills/comet/SKILL.md`, apply the English equivalent:

```md
**Step 0: Active Change Discovery and Intent Resolution**

1. First load script locations through `comet/reference/scripts.md` and ensure `$COMET_INTENT` is available.
2. Run `openspec list --json` to collect active changes.
3. Fill a `CometIntentFrame` from the user request, active change list, and necessary repository state.
4. Prefer `node "$COMET_INTENT" route --stdin` to pass the frame JSON and get the runtime-normalized route. `CometIntentFrame + runtime scorer` is the source of truth; this prose is only for intent recognition slot extraction.
5. Handle the runtime route:
   - `hotfix` → invoke `/comet-hotfix`
   - `tweak` → invoke `/comet-tweak`
   - `full` → follow the active-change table to invoke `/comet-open` or ask for confirmation
   - `resume` → continue to Step 1 and read the selected change `.comet.yaml`
   - `ask_user` → pause through `comet/reference/decision-point.md` and wait for the user's choice
   - `out_of_scope` → explain that the input is not a Comet workflow start/resume request and do not initialize a change

**Intent Recognition Slot Extraction**:

- `fix_bug` + `existing_behavior: true` + no new capability/public API/schema/cross-module signal → prefer `hotfix`
- Copy, config, docs, prompt, or a lightweight/medium single OpenSpec change → prefer `tweak`
- New capability, public API, schema change, cross-module coordination, or architecture work → prefer `full`
- Multiple active changes without an explicit change → `ask_user`
- Low confidence, missing key evidence, or explicit workflow conflicting with risk signals → `ask_user`
```

The same section must include a compact `Minimal CometIntentFrame Skeleton` listing `schema_version`, `utterance`, `intent`, `slots`, `context`, `evidence`, and `proposed_route`. Do not expose `entities`, `target_area`, `scope`, `dirty_worktree`, or derived `proposed_route` fields in the minimal skeleton; the runtime fills those defaults. Complete field meanings live in `comet/reference/intent-frame.md`; the entry Skill links that reference instead of inlining the full field table.

- [x] **Step 5: Sync English hotfix/tweak recheck wording**

In `assets/skills/comet-hotfix/SKILL.md`, add:

```md
If `/comet` passes an intent frame from the entry, hotfix only rechecks `risk_signal` and escalation signals before build: new capability, public API, schema change, cross-module coordination, or deep architecture work. When any signal matches, enter the existing escalation decision point; do not reimplement entry intent recognition.
```

In `assets/skills/comet-tweak/SKILL.md`, add:

```md
If `/comet` passes an intent frame from the entry, tweak only rechecks `risk_signal` and escalation signals before build: new capability, public API, schema change, cross-module coordination, or deep architecture work. When any signal matches, enter the existing escalation decision point. Delta spec remains a normal tweak artifact and must not trigger escalation by itself; do not reimplement entry intent recognition.
```

- [x] **Step 6: Run Skill tests**

Run:

```bash
npx vitest run test/domains/skill/skills.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit Task 5 (covered by consolidated commit)**

```bash
git add assets/skills/comet/SKILL.md assets/skills/comet/reference/scripts.md assets/skills/comet-hotfix/SKILL.md assets/skills/comet-tweak/SKILL.md test/domains/skill/skills.test.ts
git commit -m "feat: sync comet intent frame routing en"
```

### Task 6: Changelog And Final Verification

**Files:**

- Modify: `CHANGELOG.md`
- Do not modify: `package.json` or `package-lock.json` unless the user explicitly approves handling their existing unstaged changes.

**Interfaces:**

- Consumes: all implementation tasks.
- Produces: user-facing changelog entry and verification evidence.

- [x] **Step 1: Verify version context without staging user package changes**

Run:

```bash
git show master:package.json
node -e "import('./package.json', { with: { type: 'json' } }).then(m => console.log(m.default.version))"
git status --short
```

Expected:

- `master:package.json` reports `0.3.11`.
- Current package version is already `0.4.0-beta.1`.
- `package.json` and `package-lock.json` may still be unstaged pre-existing changes; do not stage them.

- [x] **Step 2: Update Changelog**

Under `## What's Changed [0.4.0-beta.1] - 2026-06-27`, add this item under `### Changed`:

```md
- **Classic `/comet` intent routing**: Upgrades entry workflow selection from prompt-only preset detection to a structured `CometIntentFrame` contract with deterministic runtime scoring, so full/hotfix/tweak/resume choices become explainable, testable, and safer around low-confidence or conflicting requests.
```

Under `### Tests`, add:

```md
- **Intent routing coverage**: Adds Classic intent-frame scorer, runtime command, launcher, and Skill documentation regression coverage for hotfix, tweak, full, resume, low-confidence, multi-change, and conflict fallback routes.
```

- [x] **Step 3: Run focused verification**

Run:

```bash
npx vitest run test/domains/comet-classic/classic-intent.test.ts test/domains/comet-classic/classic-runtime.test.ts test/domains/comet-classic/comet-scripts.test.ts test/domains/skill/skills.test.ts
pnpm build:classic-runtime --check
```

Expected: PASS and runtime freshness check exits 0.

- [x] **Step 4: Run repository verification**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

Expected: all commands exit 0. If `format:check` reports unrelated CRLF-only issues in untouched old files, do not bulk rewrite; report the exact files and ask for direction.

- [x] **Step 5: Commit Task 6 (covered by consolidated commit)**

```bash
git add CHANGELOG.md
git commit -m "docs: note comet intent frame routing"
```

- [x] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected: no uncommitted files from this implementation remain. Pre-existing `package.json` / `package-lock.json` changes may remain unstaged if they were not part of this implementation.

## Self-Review

- Spec coverage: Tasks cover the structured frame, industry-aligned field names, runtime-only deterministic scoring, `ask_user` fallback, no `/comet-any`, no external dependencies, stage Skill minimal recheck, bilingual Skill sync, runtime bundle, manifest, tests, and changelog.
- Placeholder scan: No placeholder markers, deferred implementation notes, cross-referenced duplicate steps, or unspecified test steps remain.
- Type consistency: `CometIntentFrame`, `CometIntentRoute`, `resolveCometIntentRoute`, `classicIntentCommand`, `intent`, and `COMET_INTENT` are named consistently across tasks.
