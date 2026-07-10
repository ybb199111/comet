# Comet Skill Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立不改变 Comet 0.3.8 用户行为的 Skill Engine 基础层，包括 Skill Package、Run 持久化、统一循环、Guardrails、Runtime Evals 和 Runtime Adapter 契约。

**Architecture:** `src/skill/` 负责 Skill Package 加载、校验和快照；`src/engine/` 负责纯函数决策与 Run 数据；`src/runtime/` 只定义平台执行契约。`.comet.yaml` 保存 Run 的权威状态投影，其他文件通过引用保存追加式 Trajectory、Context、Artifacts 和 Checkpoint。

**Tech Stack:** TypeScript ESM、Node.js 20+、`yaml`、Vitest、现有 Bash 状态脚本。

---

## 范围

本计划交付内部 Foundation，不切换现役 `/comet` Skill，不创建 `/comet-any`，不把 shell
状态机改成门面，也不修改 Superpowers/OpenSpec Skill。

## 文件结构

```text
src/
  skill/
    types.ts          # Skill Package 领域类型
    load.ts           # 读取 skill.yaml / guardrails.yaml / evals.yaml
    validate.ts       # 结构、引用、边界校验
    snapshot.ts       # 规范化序列化、sha256、快照
  engine/
    types.ts          # Run、Action、Outcome、EvalResult
    state.ts          # .comet.yaml 投影读写，保留 legacy 字段
    run-store.ts      # Trajectory/Context/Artifacts/Checkpoint/Pending Action
    guardrails.ts     # 动作授权与预算检查
    evals.ts          # 确定性 Runtime Evals
    loop.ts           # start/decide/accept/record/complete 纯函数
  runtime/
    types.ts          # Runtime Adapter 接口，不含平台实现
test/ts/
  skill-load.test.ts
  skill-validate.test.ts
  skill-snapshot.test.ts
  engine-state.test.ts
  engine-run-store.test.ts
  engine-guardrails.test.ts
  engine-evals.test.ts
  engine-loop.test.ts
  runtime-contract.test.ts
```

## 固定契约

Skill Package：

```text
<skill>/
  SKILL.md
  comet/
    skill.yaml
    guardrails.yaml   # optional
    evals.yaml        # optional, Runtime Evals
  scripts/            # optional, 只可作为显式 Tool 来源
```

Run 文件：

```text
<change>/
  .comet.yaml
  .comet/
    trajectory.jsonl
    context.md
    artifacts.json
    checkpoint.json
    pending-action.json
    skill-snapshot/
```

`.comet.yaml` 新增顶层字段：

```yaml
run_id: <uuid>
skill: <name>
skill_version: <version>
skill_hash: <sha256>
orchestration: deterministic
current_step: <step-id>
iteration: 0
pending: null
pending_ref: .comet/pending-action.json
trajectory_ref: .comet/trajectory.jsonl
context_ref: .comet/context.md
artifacts_ref: .comet/artifacts.json
checkpoint_ref: .comet/checkpoint.json
run_status: running
run_retries: "{}"
```

所有引用路径必须是 change 目录内的相对路径。

### Task 1: 添加 YAML 依赖并建立目录骨架

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/skill/types.ts`
- Create: `src/engine/types.ts`
- Create: `src/runtime/types.ts`

- [x] **Step 1: 安装 YAML 解析器**

Run:

```bash
pnpm add yaml
```

Expected: `package.json` 的 dependencies 新增 `yaml`，lockfile 更新。

- [x] **Step 2: 写 Skill 领域类型**

Create `src/skill/types.ts`:

```typescript
export type OrchestrationMode = 'deterministic' | 'adaptive';
export type ActionType = 'invoke_skill' | 'call_tool' | 'handoff' | 'ask_user' | 'checkpoint';

export interface NamedContract {
  name: string;
  description: string;
  required?: boolean;
}

export interface SkillReference {
  id: string;
  source?: string;
  version?: string;
}

export interface AgentDefinition {
  id: string;
  role: string;
  instructions?: string;
}

export interface ToolDefinition {
  id: string;
  kind: 'function' | 'mcp' | 'script' | 'agent';
  source: string;
  sideEffect: 'none' | 'read' | 'write' | 'external';
  requiresConfirmation?: boolean;
}

export interface StepAction {
  type: ActionType;
  ref?: string;
  prompt?: string;
  question?: string;
  options?: string[];
}

export interface SkillStep {
  id: string;
  action: StepAction;
  next?: string;
  completionEvals?: string[];
}

export interface SkillDefinition {
  apiVersion: 'comet/v1alpha1';
  kind: 'Skill';
  metadata: {
    name: string;
    version: string;
    description: string;
  };
  goal: {
    statement: string;
    inputs: NamedContract[];
    outputs: NamedContract[];
    success: string[];
  };
  orchestration: {
    mode: OrchestrationMode;
    entry?: string;
    steps?: SkillStep[];
  };
  skills: SkillReference[];
  agents: AgentDefinition[];
  tools: ToolDefinition[];
}

export interface GuardrailDefinition {
  allowedSkills: string[];
  allowedAgents: string[];
  allowedTools: string[];
  maxIterations: number;
  maxRetriesPerAction: number;
  confirmationRequiredFor: string[];
}

export interface RuntimeEvalDefinition {
  id: string;
  scope: 'progress' | 'step' | 'completion';
  type: 'artifact_exists' | 'state_equals';
  artifact?: string;
  field?: string;
  equals?: string;
}

export interface SkillPackage {
  root: string;
  definition: SkillDefinition;
  guardrails: GuardrailDefinition;
  evals: RuntimeEvalDefinition[];
}
```

- [x] **Step 3: 写 Engine 与 Runtime 契约类型**

Create `src/engine/types.ts`:

```typescript
import type { OrchestrationMode, StepAction } from '../skill/types.js';

export type RunStatus = 'running' | 'waiting' | 'completed' | 'failed';

export interface RunState {
  runId: string;
  skill: string;
  skillVersion: string;
  skillHash: string;
  orchestration: OrchestrationMode;
  currentStep: string | null;
  iteration: number;
  pending: string | null;
  pendingRef: string;
  trajectoryRef: string;
  contextRef: string;
  artifactsRef: string;
  checkpointRef: string;
  status: RunStatus;
  retries: Record<string, number>;
}

export interface EngineAction extends StepAction {
  id: string;
  stepId: string | null;
}

export interface ActionOutcome {
  actionId: string;
  status: 'succeeded' | 'failed';
  summary: string;
  artifacts?: Record<string, string>;
  state?: Record<string, string>;
}

export interface TrajectoryEvent {
  sequence: number;
  timestamp: string;
  type: 'run_started' | 'action_proposed' | 'action_completed' | 'eval_completed' | 'checkpoint';
  runId: string;
  data: Record<string, unknown>;
}

export interface EvalResult {
  evalId: string;
  passed: boolean;
  evidence: string;
}

export interface Checkpoint {
  runId: string;
  stateVersion: number;
  trajectoryOffset: number;
  contextHash: string | null;
  artifactsHash: string;
  createdAt: string;
}
```

Create `src/runtime/types.ts`:

```typescript
import type { ActionOutcome, EngineAction, RunState } from '../engine/types.js';

export interface RuntimeContext {
  changeDir: string;
  state: RunState;
}

export interface RuntimeAdapter {
  readonly id: string;
  supports(action: EngineAction): boolean;
  execute(action: EngineAction, context: RuntimeContext): Promise<ActionOutcome>;
}
```

- [x] **Step 4: 编译确认类型成立**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: exit 0。

- [x] **Step 5: 提交**

```bash
git add package.json pnpm-lock.yaml src/skill/types.ts src/engine/types.ts src/runtime/types.ts
git commit -m "feat(engine): add Skill Engine domain contracts"
```

### Task 2: 加载和规范化 Skill Package

**Files:**
- Create: `src/skill/load.ts`
- Create: `test/ts/skill-load.test.ts`

- [x] **Step 1: 写失败测试**

Create `test/ts/skill-load.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadSkillPackage } from '../../src/skill/load.js';

describe('loadSkillPackage', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-skill-load-'));
    await fs.mkdir(path.join(root, 'comet'), { recursive: true });
    await fs.writeFile(path.join(root, 'SKILL.md'), '# Demo\n');
    await fs.writeFile(
      path.join(root, 'comet', 'skill.yaml'),
      [
        'apiVersion: comet/v1alpha1',
        'kind: Skill',
        'metadata:',
        '  name: demo',
        '  version: 1.0.0',
        '  description: Demo skill',
        'goal:',
        '  statement: Produce a report',
        '  inputs: []',
        '  outputs: []',
        '  success: [report exists]',
        'orchestration:',
        '  mode: deterministic',
        '  entry: write',
        '  steps:',
        '    - id: write',
        '      action: { type: invoke_skill, ref: writing-plans }',
        'skills: [{ id: writing-plans }]',
        'agents: []',
        'tools: []',
        '',
      ].join('\n'),
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('loads defaults when optional files are absent', async () => {
    const pkg = await loadSkillPackage(root);
    expect(pkg.definition.metadata.name).toBe('demo');
    expect(pkg.guardrails.maxIterations).toBe(50);
    expect(pkg.guardrails.allowedSkills).toEqual(['writing-plans']);
    expect(pkg.evals).toEqual([]);
  });

  it('loads explicit guardrails and runtime evals', async () => {
    await fs.writeFile(
      path.join(root, 'comet', 'guardrails.yaml'),
      'allowedSkills: [writing-plans]\nallowedAgents: []\nallowedTools: []\nmaxIterations: 8\nmaxRetriesPerAction: 2\nconfirmationRequiredFor: []\n',
    );
    await fs.writeFile(
      path.join(root, 'comet', 'evals.yaml'),
      'runtime:\n  - { id: report, scope: completion, type: artifact_exists, artifact: report }\n',
    );

    const pkg = await loadSkillPackage(root);
    expect(pkg.guardrails.maxIterations).toBe(8);
    expect(pkg.evals[0].id).toBe('report');
  });
});
```

- [x] **Step 2: 运行并确认失败**

Run:

```bash
pnpm exec vitest run test/ts/skill-load.test.ts
```

Expected: FAIL，模块 `src/skill/load.ts` 不存在。

- [x] **Step 3: 实现加载器**

Create `src/skill/load.ts`:

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'yaml';
import type {
  GuardrailDefinition,
  RuntimeEvalDefinition,
  SkillDefinition,
  SkillPackage,
} from './types.js';

async function readYaml<T>(file: string): Promise<T> {
  return parse(await fs.readFile(file, 'utf8')) as T;
}

async function readOptionalYaml<T>(file: string): Promise<T | null> {
  try {
    return await readYaml<T>(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function loadSkillPackage(root: string): Promise<SkillPackage> {
  const resolvedRoot = path.resolve(root);
  await fs.access(path.join(resolvedRoot, 'SKILL.md'));

  const definition = await readYaml<SkillDefinition>(
    path.join(resolvedRoot, 'comet', 'skill.yaml'),
  );
  const explicitGuardrails = await readOptionalYaml<Partial<GuardrailDefinition>>(
    path.join(resolvedRoot, 'comet', 'guardrails.yaml'),
  );
  const evalDocument = await readOptionalYaml<{ runtime?: RuntimeEvalDefinition[] }>(
    path.join(resolvedRoot, 'comet', 'evals.yaml'),
  );

  const guardrails: GuardrailDefinition = {
    allowedSkills: definition.skills.map((skill) => skill.id),
    allowedAgents: definition.agents.map((agent) => agent.id),
    allowedTools: definition.tools.map((tool) => tool.id),
    maxIterations: 50,
    maxRetriesPerAction: 3,
    confirmationRequiredFor: definition.tools
      .filter((tool) => tool.requiresConfirmation)
      .map((tool) => tool.id),
    ...explicitGuardrails,
  };

  return {
    root: resolvedRoot,
    definition,
    guardrails,
    evals: evalDocument?.runtime ?? [],
  };
}
```

- [x] **Step 4: 运行并确认通过**

Run:

```bash
pnpm exec vitest run test/ts/skill-load.test.ts
```

Expected: PASS，2 tests。

- [x] **Step 5: 提交**

```bash
git add src/skill/load.ts test/ts/skill-load.test.ts
git commit -m "feat(engine): load Comet Skill packages"
```

### Task 3: 校验 Skill、Agent、Tool 和 Eval 引用

**Files:**
- Create: `src/skill/validate.ts`
- Create: `test/ts/skill-validate.test.ts`

- [x] **Step 1: 写失败测试**

Create `test/ts/skill-validate.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { validateSkillPackage } from '../../src/skill/validate.js';
import type { SkillPackage } from '../../src/skill/types.js';

function pkg(): SkillPackage {
  return {
    root: '/repo/demo',
    definition: {
      apiVersion: 'comet/v1alpha1',
      kind: 'Skill',
      metadata: { name: 'demo', version: '1.0.0', description: 'Demo' },
      goal: { statement: 'Done', inputs: [], outputs: [], success: ['done'] },
      orchestration: {
        mode: 'deterministic',
        entry: 'start',
        steps: [
          {
            id: 'start',
            action: { type: 'invoke_skill', ref: 'writing-plans' },
          },
        ],
      },
      skills: [{ id: 'writing-plans' }],
      agents: [],
      tools: [],
    },
    guardrails: {
      allowedSkills: ['writing-plans'],
      allowedAgents: [],
      allowedTools: [],
      maxIterations: 10,
      maxRetriesPerAction: 2,
      confirmationRequiredFor: [],
    },
    evals: [],
  };
}

describe('validateSkillPackage', () => {
  it('accepts a minimal deterministic package', () => {
    expect(validateSkillPackage(pkg())).toEqual([]);
  });

  it('rejects duplicate steps, unknown refs and invalid entry', () => {
    const value = pkg();
    value.definition.orchestration.entry = 'missing';
    value.definition.orchestration.steps!.push({
      id: 'start',
      action: { type: 'call_tool', ref: 'unknown' },
    });
    expect(validateSkillPackage(value)).toEqual(
      expect.arrayContaining([
        'orchestration.entry references unknown step: missing',
        'duplicate step id: start',
        'step start references undeclared tool: unknown',
      ]),
    );
  });

  it('requires adaptive packages to omit deterministic steps', () => {
    const value = pkg();
    value.definition.orchestration.mode = 'adaptive';
    expect(validateSkillPackage(value)).toContain(
      'adaptive orchestration must not define entry or steps',
    );
  });

  it('rejects inline script commands and escaping script paths', () => {
    const value = pkg();
    value.definition.tools.push({
      id: 'unsafe',
      kind: 'script',
      source: '../outside.sh',
      sideEffect: 'write',
    });
    value.guardrails.allowedTools.push('unsafe');
    expect(validateSkillPackage(value)).toContain(
      'script tool unsafe must reference a relative path inside the Skill package',
    );
  });
});
```

- [x] **Step 2: 运行并确认失败**

Run:

```bash
pnpm exec vitest run test/ts/skill-validate.test.ts
```

Expected: FAIL，`validateSkillPackage` 不存在。

- [x] **Step 3: 实现校验器**

Create `src/skill/validate.ts`:

```typescript
import path from 'path';
import type { SkillPackage, StepAction } from './types.js';

function validatesAction(action: StepAction, pkg: SkillPackage, errors: string[], stepId: string): void {
  if (action.type === 'invoke_skill' && !pkg.definition.skills.some((item) => item.id === action.ref)) {
    errors.push(`step ${stepId} references undeclared skill: ${action.ref ?? '(missing)'}`);
  }
  if (action.type === 'call_tool' && !pkg.definition.tools.some((item) => item.id === action.ref)) {
    errors.push(`step ${stepId} references undeclared tool: ${action.ref ?? '(missing)'}`);
  }
  if (action.type === 'handoff' && !pkg.definition.agents.some((item) => item.id === action.ref)) {
    errors.push(`step ${stepId} references undeclared agent: ${action.ref ?? '(missing)'}`);
  }
  if (action.type === 'ask_user' && !action.question) {
    errors.push(`step ${stepId} ask_user action requires question`);
  }
}

export function validateSkillPackage(pkg: SkillPackage): string[] {
  const errors: string[] = [];
  const { definition, guardrails, evals } = pkg;

  if (definition.apiVersion !== 'comet/v1alpha1') errors.push('unsupported apiVersion');
  if (definition.kind !== 'Skill') errors.push('kind must be Skill');
  if (!definition.metadata.name) errors.push('metadata.name is required');
  if (!definition.goal.statement) errors.push('goal.statement is required');
  if (guardrails.maxIterations < 1) errors.push('maxIterations must be at least 1');
  if (guardrails.maxRetriesPerAction < 0) errors.push('maxRetriesPerAction must not be negative');

  const steps = definition.orchestration.steps ?? [];
  if (definition.orchestration.mode === 'adaptive') {
    if (definition.orchestration.entry || steps.length > 0) {
      errors.push('adaptive orchestration must not define entry or steps');
    }
  } else {
    const ids = new Set<string>();
    for (const step of steps) {
      if (ids.has(step.id)) errors.push(`duplicate step id: ${step.id}`);
      ids.add(step.id);
      validatesAction(step.action, pkg, errors, step.id);
    }
    if (!definition.orchestration.entry || !ids.has(definition.orchestration.entry)) {
      errors.push(
        `orchestration.entry references unknown step: ${definition.orchestration.entry ?? '(missing)'}`,
      );
    }
    for (const step of steps) {
      if (step.next && !ids.has(step.next)) errors.push(`step ${step.id} has unknown next step: ${step.next}`);
      for (const evalId of step.completionEvals ?? []) {
        if (!evals.some((item) => item.id === evalId)) {
          errors.push(`step ${step.id} references unknown eval: ${evalId}`);
        }
      }
    }
  }

  for (const tool of definition.tools) {
    if (tool.kind !== 'script') continue;
    const normalized = path.posix.normalize(tool.source.replaceAll('\\', '/'));
    if (path.isAbsolute(tool.source) || normalized === '..' || normalized.startsWith('../')) {
      errors.push(`script tool ${tool.id} must reference a relative path inside the Skill package`);
    }
  }

  for (const id of guardrails.allowedSkills) {
    if (!definition.skills.some((item) => item.id === id)) errors.push(`guardrails allow undeclared skill: ${id}`);
  }
  for (const id of guardrails.allowedAgents) {
    if (!definition.agents.some((item) => item.id === id)) errors.push(`guardrails allow undeclared agent: ${id}`);
  }
  for (const id of guardrails.allowedTools) {
    if (!definition.tools.some((item) => item.id === id)) errors.push(`guardrails allow undeclared tool: ${id}`);
  }

  return errors;
}
```

- [x] **Step 4: 运行并确认通过**

Run:

```bash
pnpm exec vitest run test/ts/skill-validate.test.ts
```

Expected: PASS，4 tests。

- [x] **Step 5: 提交**

```bash
git add src/skill/validate.ts test/ts/skill-validate.test.ts
git commit -m "feat(engine): validate Skill package boundaries"
```

### Task 4: 生成稳定 Skill hash 和运行快照

**Files:**
- Create: `src/skill/snapshot.ts`
- Create: `test/ts/skill-snapshot.test.ts`

- [x] **Step 1: 写失败测试**

Create `test/ts/skill-snapshot.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createSkillSnapshot, hashSkillPackage } from '../../src/skill/snapshot.js';
import type { SkillPackage } from '../../src/skill/types.js';

const pkg = (root: string): SkillPackage => ({
  root,
  definition: {
    apiVersion: 'comet/v1alpha1',
    kind: 'Skill',
    metadata: { name: 'demo', version: '1', description: 'Demo' },
    goal: { statement: 'Done', inputs: [], outputs: [], success: ['done'] },
    orchestration: { mode: 'adaptive' },
    skills: [],
    agents: [],
    tools: [],
  },
  guardrails: {
    allowedSkills: [],
    allowedAgents: [],
    allowedTools: [],
    maxIterations: 5,
    maxRetriesPerAction: 1,
    confirmationRequiredFor: [],
  },
  evals: [],
});

describe('Skill snapshots', () => {
  let root: string;
  let changeDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-snapshot-'));
    changeDir = path.join(root, 'change');
    await fs.mkdir(path.join(root, 'skill'), { recursive: true });
    await fs.writeFile(path.join(root, 'skill', 'SKILL.md'), '# Demo\n');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('is stable across object key order', () => {
    const first = pkg(path.join(root, 'skill'));
    const second = structuredClone(first);
    second.guardrails = {
      maxRetriesPerAction: 1,
      maxIterations: 5,
      allowedTools: [],
      allowedSkills: [],
      allowedAgents: [],
      confirmationRequiredFor: [],
    };
    expect(hashSkillPackage(first)).toBe(hashSkillPackage(second));
  });

  it('writes a self-contained normalized snapshot', async () => {
    const result = await createSkillSnapshot(pkg(path.join(root, 'skill')), changeDir);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.access(path.join(result.snapshotDir, 'package.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(result.snapshotDir, 'SKILL.md'))).resolves.toBeUndefined();
  });
});
```

- [x] **Step 2: 运行并确认失败**

Run:

```bash
pnpm exec vitest run test/ts/skill-snapshot.test.ts
```

Expected: FAIL，snapshot 模块不存在。

- [x] **Step 3: 实现规范化 hash 和快照**

Create `src/skill/snapshot.ts`:

```typescript
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { SkillPackage } from './types.js';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function hashSkillPackage(pkg: SkillPackage): string {
  const payload = JSON.stringify(
    stable({ definition: pkg.definition, guardrails: pkg.guardrails, evals: pkg.evals }),
  );
  return createHash('sha256').update(payload).digest('hex');
}

export async function createSkillSnapshot(
  pkg: SkillPackage,
  changeDir: string,
): Promise<{ hash: string; snapshotDir: string }> {
  const hash = hashSkillPackage(pkg);
  const snapshotDir = path.join(changeDir, '.comet', 'skill-snapshot');
  await fs.mkdir(snapshotDir, { recursive: true });
  await fs.copyFile(path.join(pkg.root, 'SKILL.md'), path.join(snapshotDir, 'SKILL.md'));
  await fs.writeFile(
    path.join(snapshotDir, 'package.json'),
    JSON.stringify(stable({ definition: pkg.definition, guardrails: pkg.guardrails, evals: pkg.evals }), null, 2) + '\n',
  );
  await fs.writeFile(path.join(snapshotDir, 'sha256'), hash + '\n');
  return { hash, snapshotDir };
}
```

- [x] **Step 4: 运行并确认通过**

Run:

```bash
pnpm exec vitest run test/ts/skill-snapshot.test.ts
```

Expected: PASS，2 tests。

- [x] **Step 5: 提交**

```bash
git add src/skill/snapshot.ts test/ts/skill-snapshot.test.ts
git commit -m "feat(engine): snapshot and hash Skill packages"
```

### Task 5: 扩展 `.comet.yaml` schema 并实现保留式读写

**Files:**
- Create: `src/engine/state.ts`
- Create: `test/ts/engine-state.test.ts`
- Modify: `assets/skills/comet/scripts/comet-state.sh`
- Modify: `assets/skills/comet/scripts/comet-yaml-validate.sh`
- Modify: `src/commands/doctor.ts`
- Modify: `test/ts/comet-scripts.test.ts`
- Modify: `test/ts/doctor.test.ts`
- Create: `test/ts/engine-schema-compat.test.ts`

- [x] **Step 1: 写 TS 状态读写失败测试**

Create `test/ts/engine-state.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { readRunState, writeRunState } from '../../src/engine/state.js';
import type { RunState } from '../../src/engine/types.js';

describe('engine state projection', () => {
  let changeDir: string;

  beforeEach(async () => {
    changeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-engine-state-'));
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      'workflow: full\nphase: build\ncustom_user_field: keep-me\n',
    );
  });

  afterEach(async () => {
    await fs.rm(changeDir, { recursive: true, force: true });
  });

  it('round-trips run fields and preserves legacy and unknown fields', async () => {
    const state: RunState = {
      runId: 'run-1',
      skill: 'demo',
      skillVersion: '1',
      skillHash: 'a'.repeat(64),
      orchestration: 'deterministic',
      currentStep: 'start',
      iteration: 0,
      pending: null,
      pendingRef: '.comet/pending-action.json',
      trajectoryRef: '.comet/trajectory.jsonl',
      contextRef: '.comet/context.md',
      artifactsRef: '.comet/artifacts.json',
      checkpointRef: '.comet/checkpoint.json',
      status: 'running',
      retries: {},
    };
    await writeRunState(changeDir, state);
    expect(await readRunState(changeDir)).toEqual(state);
    const raw = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');
    expect(raw).toContain('workflow: full');
    expect(raw).toContain('custom_user_field: keep-me');
  });
});
```

- [x] **Step 2: 运行并确认失败**

Run:

```bash
pnpm exec vitest run test/ts/engine-state.test.ts
```

Expected: FAIL，state 模块不存在。

- [x] **Step 3: 实现原子、保留式状态读写**

Create `src/engine/state.ts`:

```typescript
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { parse, stringify } from 'yaml';
import type { RunState } from './types.js';

type StateDocument = Record<string, unknown>;

const field = (doc: StateDocument, key: string): string | null => {
  const value = doc[key];
  return value === null || value === undefined ? null : String(value);
};

export async function readRunState(changeDir: string): Promise<RunState | null> {
  const file = path.join(changeDir, '.comet.yaml');
  const doc = parse(await fs.readFile(file, 'utf8')) as StateDocument;
  if (!doc.run_id) return null;
  return {
    runId: String(doc.run_id),
    skill: String(doc.skill),
    skillVersion: String(doc.skill_version),
    skillHash: String(doc.skill_hash),
    orchestration: doc.orchestration as RunState['orchestration'],
    currentStep: field(doc, 'current_step'),
    iteration: Number(doc.iteration ?? 0),
    pending: field(doc, 'pending'),
    pendingRef: String(doc.pending_ref),
    trajectoryRef: String(doc.trajectory_ref),
    contextRef: String(doc.context_ref),
    artifactsRef: String(doc.artifacts_ref),
    checkpointRef: String(doc.checkpoint_ref),
    status: (doc.run_status ?? 'running') as RunState['status'],
    retries: doc.run_retries ? JSON.parse(String(doc.run_retries)) : {},
  };
}

export async function writeRunState(changeDir: string, state: RunState): Promise<void> {
  const file = path.join(changeDir, '.comet.yaml');
  const raw = await fs.readFile(file, 'utf8').catch(() => '');
  const doc = (raw ? parse(raw) : {}) as StateDocument;
  Object.assign(doc, {
    run_id: state.runId,
    skill: state.skill,
    skill_version: state.skillVersion,
    skill_hash: state.skillHash,
    orchestration: state.orchestration,
    current_step: state.currentStep,
    iteration: state.iteration,
    pending: state.pending,
    pending_ref: state.pendingRef,
    trajectory_ref: state.trajectoryRef,
    context_ref: state.contextRef,
    artifacts_ref: state.artifactsRef,
    checkpoint_ref: state.checkpointRef,
    run_status: state.status,
    run_retries: JSON.stringify(state.retries),
  });

  await fs.mkdir(changeDir, { recursive: true });
  const temporary = path.join(changeDir, `.comet.yaml.${randomUUID()}.tmp`);
  await fs.writeFile(temporary, stringify(doc), 'utf8');
  await fs.rename(temporary, file);
}
```

- [x] **Step 4: 运行 TS 测试确认通过**

Run:

```bash
pnpm exec vitest run test/ts/engine-state.test.ts
```

Expected: PASS。

- [x] **Step 5: 同步 shell 和 doctor schema**

在 `comet-state.sh` 的 `cmd_set` 白名单加入：

```text
run_id skill skill_version skill_hash orchestration current_step iteration pending
pending_ref trajectory_ref context_ref artifacts_ref checkpoint_ref run_status run_retries
```

并增加以下验证：

```bash
orchestration) validate_enum "$value" "deterministic" "adaptive" ;;
run_status) validate_enum "$value" "running" "waiting" "completed" "failed" ;;
skill_hash)
  if [[ ! "$value" =~ ^[a-f0-9]{64}$ ]]; then
    red "ERROR: skill_hash must be a sha256 hex digest" >&2
    exit 1
  fi
  ;;
iteration)
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    red "ERROR: iteration must be a non-negative integer" >&2
    exit 1
  fi
  ;;
pending_ref|trajectory_ref|context_ref|artifacts_ref|checkpoint_ref)
  validate_path_field "$value" "$field"
  ;;
```

在 `comet-yaml-validate.sh` 的 `KNOWN_KEYS` 和 `src/commands/doctor.ts` 的
`VALID_YAML_FIELDS` 加入同一字段集合；validator 对 `orchestration`、`run_status`、
`skill_hash`、`iteration` 和五个引用路径执行同等校验。新字段是渐进字段，不加入
`REQUIRED_FIELDS`，保证 0.3.8 change 继续有效。

- [x] **Step 6: 增加 shell schema 兼容测试**

Create `test/ts/engine-schema-compat.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

const sourceScripts = path.resolve('assets', 'skills', 'comet', 'scripts');

function bash(): string | null {
  const candidates = [
    process.env.COMET_TEST_BASH,
    process.env.COMET_BASH,
    'bash',
    ...(process.platform === 'win32'
      ? [
          'C:\\Program Files\\Git\\bin\\bash.exe',
          'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
        ]
      : []),
  ].filter((value): value is string => Boolean(value));
  return (
    [...new Set(candidates)].find((candidate) => {
      const result = spawnSync(candidate, ['-lc', 'uname -s'], { encoding: 'utf8' });
      return result.status === 0 && !(
        process.platform === 'win32' && /linux/i.test(result.stdout)
      );
    }) ?? null
  );
}

function bashPath(value: string): string {
  const normalized = path.resolve(value).replaceAll('\\', '/');
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!drive) return normalized;
  return `/${drive[1].toLowerCase()}/${drive[2]}`;
}

describe.skipIf(!bash())('Skill Engine shell schema compatibility', () => {
  let root: string;
  let stateScript: string;
  let validateScript: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-engine-shell-'));
    await fs.mkdir(path.join(root, 'assets'), { recursive: true });
    for (const name of ['comet-state.sh', 'comet-yaml-validate.sh']) {
      await fs.copyFile(path.join(sourceScripts, name), path.join(root, 'assets', name));
    }
    stateScript = bashPath(path.join(root, 'assets', 'comet-state.sh'));
    validateScript = bashPath(path.join(root, 'assets', 'comet-yaml-validate.sh'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function run(script: string, args: string[]) {
    return spawnSync(bash()!, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  }

  it('sets and validates every Skill Engine projection field', () => {
    expect(run(stateScript, ['init', 'demo', 'full']).status).toBe(0);
    const values: Record<string, string> = {
      run_id: 'run-1',
      skill: 'demo',
      skill_version: '1',
      skill_hash: 'a'.repeat(64),
      orchestration: 'deterministic',
      current_step: 'start',
      iteration: '0',
      pending: 'null',
      pending_ref: '.comet/pending-action.json',
      trajectory_ref: '.comet/trajectory.jsonl',
      context_ref: '.comet/context.md',
      artifacts_ref: '.comet/artifacts.json',
      checkpoint_ref: '.comet/checkpoint.json',
      run_status: 'running',
      run_retries: '"{}"',
    };
    for (const [field, value] of Object.entries(values)) {
      expect(run(stateScript, ['set', 'demo', field, value]).status, field).toBe(0);
    }
    const result = run(validateScript, ['demo']);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('unknown field');
  });

  it.each([
    ['orchestration', 'freeform'],
    ['iteration', '-1'],
    ['trajectory_ref', '../outside.jsonl'],
  ])('rejects invalid %s=%s', (field, value) => {
    expect(run(stateScript, ['init', 'demo', 'full']).status).toBe(0);
    expect(run(stateScript, ['set', 'demo', field, value]).status).not.toBe(0);
  });
});
```

在 `test/ts/comet-scripts.test.ts` 中所有代表完整 `.comet.yaml` 的 fixture 增加
`run_id` 至 `run_retries` 字段，确保现有脚本测试不会把新 schema 当成未知字段。

在 `test/ts/doctor.test.ts` 的有效 YAML fixture 增加同一组字段，并断言 schema check
仍为 pass。

- [x] **Step 7: 运行状态相关测试**

Run:

```bash
npx vitest run test/ts/engine-state.test.ts test/ts/engine-schema-compat.test.ts test/ts/comet-scripts.test.ts test/ts/doctor.test.ts
```

Expected: PASS。

- [x] **Step 8: 提交**

```bash
git add src/engine/state.ts test/ts/engine-state.test.ts test/ts/engine-schema-compat.test.ts assets/skills/comet/scripts/comet-state.sh assets/skills/comet/scripts/comet-yaml-validate.sh src/commands/doctor.ts test/ts/comet-scripts.test.ts test/ts/doctor.test.ts
git commit -m "feat(engine): persist Run state in .comet.yaml"
```

### Task 6: 持久化 Trajectory、Context、Artifacts、Pending Action 和 Checkpoint

**Files:**
- Create: `src/engine/run-store.ts`
- Create: `test/ts/engine-run-store.test.ts`

- [x] **Step 1: 写失败测试**

Create `test/ts/engine-run-store.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  appendTrajectory,
  readArtifacts,
  readPendingAction,
  writeArtifacts,
  writeCheckpoint,
  writeContext,
  writePendingAction,
} from '../../src/engine/run-store.js';
import type { Checkpoint, EngineAction, TrajectoryEvent } from '../../src/engine/types.js';

describe('run store', () => {
  let changeDir: string;

  beforeEach(async () => {
    changeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-run-store-'));
  });

  afterEach(async () => {
    await fs.rm(changeDir, { recursive: true, force: true });
  });

  it('appends trajectory events and atomically round-trips run files', async () => {
    const event: TrajectoryEvent = {
      sequence: 1,
      timestamp: '2026-06-13T00:00:00.000Z',
      type: 'run_started',
      runId: 'run-1',
      data: {},
    };
    const action: EngineAction = {
      id: 'action-1',
      stepId: 'start',
      type: 'invoke_skill',
      ref: 'writing-plans',
    };
    const checkpoint: Checkpoint = {
      runId: 'run-1',
      stateVersion: 1,
      trajectoryOffset: 1,
      contextHash: null,
      artifactsHash: 'a'.repeat(64),
      createdAt: '2026-06-13T00:00:00.000Z',
    };

    await appendTrajectory(changeDir, '.comet/trajectory.jsonl', event);
    await writeArtifacts(changeDir, '.comet/artifacts.json', { report: 'report.md' });
    await writeContext(changeDir, '.comet/context.md', '# Context\n');
    await writePendingAction(changeDir, '.comet/pending-action.json', action);
    await writeCheckpoint(changeDir, '.comet/checkpoint.json', checkpoint);

    expect(await readArtifacts(changeDir, '.comet/artifacts.json')).toEqual({ report: 'report.md' });
    expect(await readPendingAction(changeDir, '.comet/pending-action.json')).toEqual(action);
    expect((await fs.readFile(path.join(changeDir, '.comet/trajectory.jsonl'), 'utf8')).trim()).toBe(JSON.stringify(event));
  });

  it('rejects paths outside the change directory', async () => {
    await expect(writeContext(changeDir, '../outside.md', 'x')).rejects.toThrow(
      'Run path must stay inside the change directory',
    );
  });
});
```

- [x] **Step 2: 运行并确认失败**

Run:

```bash
pnpm exec vitest run test/ts/engine-run-store.test.ts
```

Expected: FAIL。

- [x] **Step 3: 实现 Run Store**

Create `src/engine/run-store.ts`:

```typescript
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { Checkpoint, EngineAction, TrajectoryEvent } from './types.js';

function resolveRunPath(changeDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error('Run path must stay inside the change directory');
  const root = path.resolve(changeDir);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Run path must stay inside the change directory');
  }
  return target;
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, 'utf8');
  await fs.rename(temporary, file);
}

export async function appendTrajectory(
  changeDir: string,
  relativePath: string,
  event: TrajectoryEvent,
): Promise<void> {
  const file = resolveRunPath(changeDir, relativePath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8');
}

export async function readArtifacts(
  changeDir: string,
  relativePath: string,
): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(resolveRunPath(changeDir, relativePath), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeArtifacts(
  changeDir: string,
  relativePath: string,
  artifacts: Record<string, string>,
): Promise<void> {
  await atomicWrite(resolveRunPath(changeDir, relativePath), JSON.stringify(artifacts, null, 2) + '\n');
}

export async function writeContext(
  changeDir: string,
  relativePath: string,
  context: string,
): Promise<void> {
  await atomicWrite(resolveRunPath(changeDir, relativePath), context);
}

export async function writePendingAction(
  changeDir: string,
  relativePath: string,
  action: EngineAction,
): Promise<void> {
  await atomicWrite(resolveRunPath(changeDir, relativePath), JSON.stringify(action, null, 2) + '\n');
}

export async function readPendingAction(
  changeDir: string,
  relativePath: string,
): Promise<EngineAction | null> {
  try {
    return JSON.parse(await fs.readFile(resolveRunPath(changeDir, relativePath), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeCheckpoint(
  changeDir: string,
  relativePath: string,
  checkpoint: Checkpoint,
): Promise<void> {
  await atomicWrite(resolveRunPath(changeDir, relativePath), JSON.stringify(checkpoint, null, 2) + '\n');
}
```

- [x] **Step 4: 运行并确认通过**

Run:

```bash
pnpm exec vitest run test/ts/engine-run-store.test.ts
```

Expected: PASS，2 tests。

- [x] **Step 5: 提交**

```bash
git add src/engine/run-store.ts test/ts/engine-run-store.test.ts
git commit -m "feat(engine): persist Run trajectory and checkpoints"
```

### Task 7: 实现 Guardrails 和确定性 Runtime Evals

**Files:**
- Create: `src/engine/guardrails.ts`
- Create: `src/engine/evals.ts`
- Create: `test/ts/engine-guardrails.test.ts`
- Create: `test/ts/engine-evals.test.ts`

- [x] **Step 1: 写 Guardrails 失败测试**

Create `test/ts/engine-guardrails.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { checkAction } from '../../src/engine/guardrails.js';
import type { EngineAction, RunState } from '../../src/engine/types.js';
import type { GuardrailDefinition } from '../../src/skill/types.js';

const guardrails: GuardrailDefinition = {
  allowedSkills: ['writing-plans'],
  allowedAgents: ['reviewer'],
  allowedTools: ['read-only'],
  maxIterations: 2,
  maxRetriesPerAction: 1,
  confirmationRequiredFor: ['read-only'],
};

const state = (): RunState => ({
  runId: 'r',
  skill: 'demo',
  skillVersion: '1',
  skillHash: 'a'.repeat(64),
  orchestration: 'adaptive',
  currentStep: null,
  iteration: 0,
  pending: null,
  pendingRef: '.comet/pending-action.json',
  trajectoryRef: '.comet/trajectory.jsonl',
  contextRef: '.comet/context.md',
  artifactsRef: '.comet/artifacts.json',
  checkpointRef: '.comet/checkpoint.json',
  status: 'running',
  retries: {},
});

const action = (over: Partial<EngineAction> = {}): EngineAction => ({
  id: 'a1',
  stepId: null,
  type: 'invoke_skill',
  ref: 'writing-plans',
  ...over,
});

describe('checkAction', () => {
  it('allows authorized actions', () => {
    expect(checkAction(action(), state(), guardrails, new Set())).toEqual({ allowed: true });
  });

  it('rejects unauthorized refs, budgets and missing confirmation', () => {
    expect(checkAction(action({ ref: 'unknown' }), state(), guardrails, new Set())).toEqual({
      allowed: false,
      reason: 'Skill is not allowed: unknown',
    });
    expect(checkAction(action(), { ...state(), iteration: 2 }, guardrails, new Set()).allowed).toBe(false);
    expect(
      checkAction(action({ type: 'call_tool', ref: 'read-only' }), state(), guardrails, new Set()),
    ).toEqual({ allowed: false, reason: 'User confirmation required for: read-only' });
    expect(
      checkAction(action({ type: 'handoff', ref: 'unknown' }), state(), guardrails, new Set()),
    ).toEqual({ allowed: false, reason: 'Agent is not allowed: unknown' });
  });
});
```

- [x] **Step 2: 写 Runtime Evals 失败测试**

Create `test/ts/engine-evals.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { evaluateRuntime } from '../../src/engine/evals.js';
import type { RunState } from '../../src/engine/types.js';
import type { RuntimeEvalDefinition } from '../../src/skill/types.js';

const state = { currentStep: 'done', status: 'running' } as RunState;

describe('evaluateRuntime', () => {
  it('returns evidence for artifact and state checks', () => {
    const defs: RuntimeEvalDefinition[] = [
      { id: 'report', scope: 'completion', type: 'artifact_exists', artifact: 'report' },
      { id: 'step', scope: 'completion', type: 'state_equals', field: 'currentStep', equals: 'done' },
    ];
    expect(evaluateRuntime(defs, 'completion', state, { report: 'report.md' })).toEqual([
      { evalId: 'report', passed: true, evidence: 'artifact report -> report.md' },
      { evalId: 'step', passed: true, evidence: 'state.currentStep = done' },
    ]);
  });
});
```

- [x] **Step 3: 运行并确认失败**

Run:

```bash
pnpm exec vitest run test/ts/engine-guardrails.test.ts test/ts/engine-evals.test.ts
```

Expected: FAIL。

- [x] **Step 4: 实现 Guardrails**

Create `src/engine/guardrails.ts`:

```typescript
import type { EngineAction, RunState } from './types.js';
import type { GuardrailDefinition } from '../skill/types.js';

export type GuardrailResult = { allowed: true } | { allowed: false; reason: string };

export function checkAction(
  action: EngineAction,
  state: RunState,
  guardrails: GuardrailDefinition,
  confirmations: ReadonlySet<string>,
): GuardrailResult {
  if (state.iteration >= guardrails.maxIterations) {
    return { allowed: false, reason: `Iteration budget exhausted: ${guardrails.maxIterations}` };
  }
  if (action.type === 'invoke_skill' && !guardrails.allowedSkills.includes(action.ref ?? '')) {
    return { allowed: false, reason: `Skill is not allowed: ${action.ref ?? '(missing)'}` };
  }
  if (action.type === 'call_tool' && !guardrails.allowedTools.includes(action.ref ?? '')) {
    return { allowed: false, reason: `Tool is not allowed: ${action.ref ?? '(missing)'}` };
  }
  if (action.type === 'handoff' && !guardrails.allowedAgents.includes(action.ref ?? '')) {
    return { allowed: false, reason: `Agent is not allowed: ${action.ref ?? '(missing)'}` };
  }
  if (
    action.ref &&
    guardrails.confirmationRequiredFor.includes(action.ref) &&
    !confirmations.has(action.ref)
  ) {
    return { allowed: false, reason: `User confirmation required for: ${action.ref}` };
  }
  const retries = state.retries[action.id] ?? 0;
  if (retries > guardrails.maxRetriesPerAction) {
    return { allowed: false, reason: `Retry budget exhausted for action: ${action.id}` };
  }
  return { allowed: true };
}
```

- [x] **Step 5: 实现 Runtime Evals**

Create `src/engine/evals.ts`:

```typescript
import type { EvalResult, RunState } from './types.js';
import type { RuntimeEvalDefinition } from '../skill/types.js';

export function evaluateRuntime(
  definitions: RuntimeEvalDefinition[],
  scope: RuntimeEvalDefinition['scope'],
  state: RunState,
  artifacts: Record<string, string>,
): EvalResult[] {
  return definitions
    .filter((definition) => definition.scope === scope)
    .map((definition) => {
      if (definition.type === 'artifact_exists') {
        const value = definition.artifact ? artifacts[definition.artifact] : undefined;
        return {
          evalId: definition.id,
          passed: Boolean(value),
          evidence: value
            ? `artifact ${definition.artifact} -> ${value}`
            : `artifact ${definition.artifact ?? '(missing)'} not found`,
        };
      }
      const value = definition.field
        ? (state as unknown as Record<string, unknown>)[definition.field]
        : undefined;
      return {
        evalId: definition.id,
        passed: String(value) === definition.equals,
        evidence: `state.${definition.field ?? '(missing)'} = ${String(value)}`,
      };
    });
}
```

- [x] **Step 6: 运行并确认通过**

Run:

```bash
pnpm exec vitest run test/ts/engine-guardrails.test.ts test/ts/engine-evals.test.ts
```

Expected: PASS，3 tests。

- [x] **Step 7: 提交**

```bash
git add src/engine/guardrails.ts src/engine/evals.ts test/ts/engine-guardrails.test.ts test/ts/engine-evals.test.ts
git commit -m "feat(engine): enforce guardrails and runtime evals"
```

### Task 8: 实现 deterministic/adaptive 共用循环

**Files:**
- Create: `src/engine/loop.ts`
- Create: `test/ts/engine-loop.test.ts`

- [x] **Step 1: 写失败测试**

Create `test/ts/engine-loop.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { acceptAdaptiveAction, decide, recordOutcome, startRun } from '../../src/engine/loop.js';
import type { SkillPackage } from '../../src/skill/types.js';

function deterministic(): SkillPackage {
  return {
    root: '/repo/demo',
    definition: {
      apiVersion: 'comet/v1alpha1',
      kind: 'Skill',
      metadata: { name: 'demo', version: '1', description: 'Demo' },
      goal: { statement: 'Done', inputs: [], outputs: [], success: ['done'] },
      orchestration: {
        mode: 'deterministic',
        entry: 'plan',
        steps: [
          {
            id: 'plan',
            action: { type: 'invoke_skill', ref: 'writing-plans' },
            next: 'finish',
          },
          { id: 'finish', action: { type: 'checkpoint' } },
        ],
      },
      skills: [{ id: 'writing-plans' }],
      agents: [],
      tools: [],
    },
    guardrails: {
      allowedSkills: ['writing-plans'],
      allowedAgents: [],
      allowedTools: [],
      maxIterations: 10,
      maxRetriesPerAction: 1,
      confirmationRequiredFor: [],
    },
    evals: [],
  };
}

describe('Skill Engine loop', () => {
  it('uses one loop for deterministic steps', () => {
    const pkg = deterministic();
    let state = startRun(pkg, 'run-1', 'a'.repeat(64));
    const first = decide(pkg, state, new Set());
    expect(first.action).toMatchObject({ type: 'invoke_skill', ref: 'writing-plans', stepId: 'plan' });
    state = first.state;
    state = recordOutcome(pkg, state, {
      actionId: first.action!.id,
      status: 'succeeded',
      summary: 'plan written',
    });
    expect(state.currentStep).toBe('finish');
    expect(state.iteration).toBe(1);
  });

  it('accepts a guardrail-checked adaptive candidate', () => {
    const pkg = deterministic();
    pkg.definition.orchestration = { mode: 'adaptive' };
    const state = startRun(pkg, 'run-2', 'b'.repeat(64));
    const result = acceptAdaptiveAction(
      pkg,
      state,
      { id: 'candidate', stepId: null, type: 'invoke_skill', ref: 'writing-plans' },
      new Set(),
    );
    expect(result.action?.id).toBe('candidate');
    expect(result.state.pending).toBe('candidate');
  });

  it('fails closed when a candidate violates guardrails', () => {
    const pkg = deterministic();
    pkg.definition.orchestration = { mode: 'adaptive' };
    const state = startRun(pkg, 'run-3', 'c'.repeat(64));
    const result = acceptAdaptiveAction(
      pkg,
      state,
      { id: 'candidate', stepId: null, type: 'invoke_skill', ref: 'unknown' },
      new Set(),
    );
    expect(result.action).toBeNull();
    expect(result.reason).toBe('Skill is not allowed: unknown');
  });
});
```

- [x] **Step 2: 运行并确认失败**

Run:

```bash
pnpm exec vitest run test/ts/engine-loop.test.ts
```

Expected: FAIL。

- [x] **Step 3: 实现共用循环**

Create `src/engine/loop.ts`:

```typescript
import { createHash } from 'crypto';
import type { ActionOutcome, EngineAction, RunState } from './types.js';
import { checkAction } from './guardrails.js';
import type { SkillPackage, SkillStep } from '../skill/types.js';

export interface Decision {
  state: RunState;
  action: EngineAction | null;
  reason?: string;
}

function actionId(runId: string, iteration: number, stepId: string | null): string {
  return createHash('sha256')
    .update(`${runId}:${iteration}:${stepId ?? 'adaptive'}`)
    .digest('hex')
    .slice(0, 16);
}

function stepFor(pkg: SkillPackage, id: string | null): SkillStep | undefined {
  return pkg.definition.orchestration.steps?.find((step) => step.id === id);
}

export function startRun(pkg: SkillPackage, runId: string, skillHash: string): RunState {
  return {
    runId,
    skill: pkg.definition.metadata.name,
    skillVersion: pkg.definition.metadata.version,
    skillHash,
    orchestration: pkg.definition.orchestration.mode,
    currentStep: pkg.definition.orchestration.entry ?? null,
    iteration: 0,
    pending: null,
    pendingRef: '.comet/pending-action.json',
    trajectoryRef: '.comet/trajectory.jsonl',
    contextRef: '.comet/context.md',
    artifactsRef: '.comet/artifacts.json',
    checkpointRef: '.comet/checkpoint.json',
    status: 'running',
    retries: {},
  };
}

export function decide(
  pkg: SkillPackage,
  state: RunState,
  confirmations: ReadonlySet<string>,
): Decision {
  if (state.status !== 'running') return { state, action: null, reason: `Run is ${state.status}` };
  if (state.pending) return { state, action: null, reason: `Action already pending: ${state.pending}` };
  if (state.orchestration === 'adaptive') {
    return { state, action: null, reason: 'Adaptive orchestration requires an Agent candidate' };
  }
  const step = stepFor(pkg, state.currentStep);
  if (!step) return { state: { ...state, status: 'completed' }, action: null };
  const action: EngineAction = {
    ...step.action,
    id: actionId(state.runId, state.iteration, step.id),
    stepId: step.id,
  };
  return acceptAction(pkg, state, action, confirmations);
}

function acceptAction(
  pkg: SkillPackage,
  state: RunState,
  action: EngineAction,
  confirmations: ReadonlySet<string>,
): Decision {
  const guard = checkAction(action, state, pkg.guardrails, confirmations);
  if (!guard.allowed) return { state, action: null, reason: guard.reason };
  return { state: { ...state, pending: action.id, status: 'waiting' }, action };
}

export function acceptAdaptiveAction(
  pkg: SkillPackage,
  state: RunState,
  action: EngineAction,
  confirmations: ReadonlySet<string>,
): Decision {
  if (state.orchestration !== 'adaptive') {
    return { state, action: null, reason: 'Run is not adaptive' };
  }
  return acceptAction(pkg, state, action, confirmations);
}

export function recordOutcome(
  pkg: SkillPackage,
  state: RunState,
  outcome: ActionOutcome,
): RunState {
  if (!state.pending || state.pending !== outcome.actionId) {
    throw new Error(`Outcome does not match pending action: ${outcome.actionId}`);
  }
  if (outcome.status === 'failed') {
    const retries = { ...state.retries, [outcome.actionId]: (state.retries[outcome.actionId] ?? 0) + 1 };
    return { ...state, pending: null, status: 'running', retries };
  }
  const step = stepFor(pkg, state.currentStep);
  const next = state.orchestration === 'deterministic' ? step?.next ?? null : state.currentStep;
  return {
    ...state,
    currentStep: next,
    iteration: state.iteration + 1,
    pending: null,
    status: next === null && state.orchestration === 'deterministic' ? 'completed' : 'running',
  };
}
```

- [x] **Step 4: 运行并确认通过**

Run:

```bash
pnpm exec vitest run test/ts/engine-loop.test.ts
```

Expected: PASS，3 tests。

- [x] **Step 5: 提交**

```bash
git add src/engine/loop.ts test/ts/engine-loop.test.ts
git commit -m "feat(engine): add deterministic and adaptive Skill loop"
```

### Task 9: 固化 Runtime Adapter 契约和 Foundation 垂直切片

**Files:**
- Create: `test/ts/runtime-contract.test.ts`
- Create: `test/ts/engine-foundation.integration.test.ts`

- [x] **Step 1: 写 Runtime Adapter 契约测试**

Create `test/ts/runtime-contract.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { RuntimeAdapter } from '../../src/runtime/types.js';

describe('RuntimeAdapter contract', () => {
  it('keeps platform execution outside the engine', async () => {
    const calls: string[] = [];
    const adapter: RuntimeAdapter = {
      id: 'test',
      supports: (action) => action.type === 'invoke_skill',
      execute: async (action) => {
        calls.push(action.ref ?? '');
        return { actionId: action.id, status: 'succeeded', summary: 'ok' };
      },
    };
    expect(adapter.supports({ id: 'a', stepId: null, type: 'invoke_skill', ref: 'demo' })).toBe(true);
    await adapter.execute(
      { id: 'a', stepId: null, type: 'invoke_skill', ref: 'demo' },
      { changeDir: '.', state: {} as never },
    );
    expect(calls).toEqual(['demo']);
  });
});
```

- [x] **Step 2: 写 Foundation 集成测试**

Create `test/ts/engine-foundation.integration.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadSkillPackage } from '../../src/skill/load.js';
import { validateSkillPackage } from '../../src/skill/validate.js';
import { createSkillSnapshot } from '../../src/skill/snapshot.js';
import { decide, recordOutcome, startRun } from '../../src/engine/loop.js';
import { readRunState, writeRunState } from '../../src/engine/state.js';
import {
  appendTrajectory,
  readPendingAction,
  writePendingAction,
} from '../../src/engine/run-store.js';
import type { RuntimeAdapter } from '../../src/runtime/types.js';

describe('Skill Engine Foundation integration', () => {
  let root: string;
  let skillDir: string;
  let changeDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-foundation-'));
    skillDir = path.join(root, 'skill');
    changeDir = path.join(root, 'change');
    await fs.mkdir(path.join(skillDir, 'comet'), { recursive: true });
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Demo\n');
    await fs.writeFile(
      path.join(skillDir, 'comet', 'skill.yaml'),
      [
        'apiVersion: comet/v1alpha1',
        'kind: Skill',
        'metadata: { name: demo, version: "1", description: Demo }',
        'goal:',
        '  statement: Produce a plan',
        '  inputs: []',
        '  outputs: []',
        '  success: [plan exists]',
        'orchestration:',
        '  mode: deterministic',
        '  entry: plan',
        '  steps:',
        '    - id: plan',
        '      action: { type: invoke_skill, ref: writing-plans }',
        'skills: [{ id: writing-plans }]',
        'agents: []',
        'tools: []',
        '',
      ].join('\n'),
    );
    await fs.writeFile(path.join(changeDir, '.comet.yaml'), 'workflow: full\nphase: build\n');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('loads, validates, snapshots, persists and resumes one action', async () => {
    const pkg = await loadSkillPackage(skillDir);
    expect(validateSkillPackage(pkg)).toEqual([]);
    const snapshot = await createSkillSnapshot(pkg, changeDir);
    let state = startRun(pkg, 'run-1', snapshot.hash);
    const decision = decide(pkg, state, new Set());
    expect(decision.action).not.toBeNull();
    state = decision.state;

    await writePendingAction(changeDir, state.pendingRef, decision.action!);
    await writeRunState(changeDir, state);
    await appendTrajectory(changeDir, state.trajectoryRef, {
      sequence: 1,
      timestamp: '2026-06-13T00:00:00.000Z',
      type: 'action_proposed',
      runId: state.runId,
      data: { actionId: decision.action!.id },
    });

    const resumed = await readRunState(changeDir);
    const pending = await readPendingAction(changeDir, state.pendingRef);
    expect(resumed).toEqual(state);
    expect(pending).toEqual(decision.action);

    const adapter: RuntimeAdapter = {
      id: 'test',
      supports: () => true,
      execute: async (action) => ({
        actionId: action.id,
        status: 'succeeded',
        summary: 'plan written',
        artifacts: { plan: 'docs/plan.md' },
      }),
    };
    const outcome = await adapter.execute(pending!, { changeDir, state: resumed! });
    state = recordOutcome(pkg, resumed!, outcome);
    await writeRunState(changeDir, state);

    expect(state.iteration).toBe(1);
    expect(state.status).toBe('completed');
    const raw = await fs.readFile(path.join(changeDir, '.comet.yaml'), 'utf8');
    expect(raw).toContain('workflow: full');
    expect(raw).toContain('phase: build');
  });
});
```

- [x] **Step 3: 运行 Foundation 测试集**

Run:

```bash
npx vitest run test/ts/skill-load.test.ts test/ts/skill-validate.test.ts test/ts/skill-snapshot.test.ts test/ts/engine-state.test.ts test/ts/engine-run-store.test.ts test/ts/engine-guardrails.test.ts test/ts/engine-evals.test.ts test/ts/engine-loop.test.ts test/ts/runtime-contract.test.ts test/ts/engine-foundation.integration.test.ts
```

Expected: PASS。

- [x] **Step 4: 提交**

```bash
git add test/ts/runtime-contract.test.ts test/ts/engine-foundation.integration.test.ts
git commit -m "test(engine): cover Foundation recovery slice"
```

### Task 10: Changelog、版本与全量验证

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `assets/manifest.json`

- [x] **Step 1: 确认 master 版本**

Run:

```bash
git show master:package.json
```

Expected: master version 为 `0.3.8`。若不是，停止并按 AGENTS.md 重新计算唯一的下一版本。

- [x] **Step 2: 更新版本**

将 `package.json` 和 `assets/manifest.json` 的 version 更新为 `0.4.0`。不要新增 Skill
资产条目，因为 Foundation 尚未发布新 Skill。

- [x] **Step 3: 写 Changelog**

在 `CHANGELOG.md` 顶部新增或追加：

```markdown
## What's Changed [0.4.0] - 2026-06-13

### Added

- **Comet Skill Engine Foundation**: 新增 Skill Package 加载、边界校验、稳定快照、Run 状态、Trajectory、Context、Artifacts、Checkpoints、Guardrails、Runtime Evals 和 Runtime Adapter 契约，为后续 classic 迁移及 Agentic Skill 编排提供单一运行时基础。

### Changed

- **`.comet.yaml` 运行投影**: 在保留 0.3.8 字段和行为的同时接受 Skill、Orchestration 与 Run 引用字段，使旧 change 和新引擎状态可以渐进共存。

### Tests

- **Foundation 契约覆盖**: 新增加载校验、路径安全、状态保留、原子持久化、动作授权、预算、运行期评估、deterministic/adaptive 循环和中断恢复垂直切片测试。
```

- [x] **Step 4: 格式、静态检查和构建**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
```

Expected: 全部 exit 0。

- [x] **Step 5: shell 与全量测试**

Run:

```bash
npx vitest run test/ts/comet-scripts.test.ts
npx vitest run
```

Expected: 全部 PASS，无 skipped Foundation 测试。

- [x] **Step 6: 检查差异**

Run:

```bash
git diff --check
git status --short
```

Expected: 无 whitespace error；只出现本计划文件、源码、测试、lockfile、版本、manifest
和 Changelog 变更，不包含用户已有的 `AGENTS.md` 修改。

- [x] **Step 7: 提交**

```bash
git add CHANGELOG.md package.json assets/manifest.json
git commit -m "docs: release Skill Engine Foundation in 0.4.0"
```

## Self-Review

- Spec §5：Goal、Orchestration、Skills、Agents、Tools、Run、Guardrails、Runtime Evals
  均有对应类型和测试。
- Spec §6：deterministic/adaptive 共用动作协议；平台执行留在 Runtime Adapter。
- Spec §7：`.comet.yaml` 是唯一 State；其他文件由引用连接；Checkpoint 不复制可修改 State。
- Spec §11：classic 尚未迁移，0.3.8 行为不得改变。
- Spec §12：禁止内联 shell、限制 script Tool 路径、动作先过 Guardrails。
- Memory Provider、CLI、classic 自动迁移、Skill Eval benchmark、`/comet-any` 明确不在本计划。
- 无 `.comet.flow.yaml`、Capability、Policy、Strategy、Evaluator 等废弃模型。

## Execution Handoff

Plan 1 完成后不要直接开始 Plan 2。先验证真实接口和 0.3.8 回归，再编写
`comet-classic-migration` 的详细计划。
