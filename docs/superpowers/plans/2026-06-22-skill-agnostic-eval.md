# Skill Agnostic Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Comet-only eval harness into a shared pytest-based runner that can evaluate Comet and arbitrary local Skills through explicit profiles.

**Architecture:** Keep pytest as the only runner and keep LangSmith as a thin suite wrapper over local tests. Add shared scaffold contracts for task evaluation config, profile dispatch, Skill sources, interaction mode, and eval manifests; then route existing Comet behavior through the `comet-workflow` profile while new arbitrary Skills use `generic`.

**Tech Stack:** Python 3.11+, pytest, PyYAML, Docker shell scaffold, Claude Code CLI, existing `eval/scaffold/python` modules.

## Global Constraints

- Preserve existing Comet eval commands and treatment semantics.
- Local and LangSmith suites must keep using the same pytest task runner.
- LangSmith suite must only add tracing/logging environment and must not duplicate eval logic.
- Do not add remote registry or online Skill download support in this slice.
- Do not make LLM judge output the only quality gate.
- Keep `[RUBRIC] <dimension>: <score> - <reason>` output compatible with existing reports.
- Do not automatically run high-cost evals or LangSmith tracing outside the user's selected command.
- Keep `/comet-any` integration manifest-based; eval runner must not create Skills.

---

## File Structure

- `eval/scaffold/python/tasks.py`: add `EvaluationConfig` and `InteractionConfig` parsing from `task.toml`.
- `eval/scaffold/python/profiles.py`: create profile registry for `generic`, `comet-workflow`, and `authoring-skill`.
- `eval/scaffold/python/validation/generic_rubric.py`: create generic rubric validator for arbitrary Skills.
- `eval/scaffold/python/validation/rubric.py`: keep existing Comet rubric but expose it through the profile registry.
- `eval/scaffold/python/logging.py`: allow report columns to use profile-provided rubric dimensions instead of only Comet dimensions.
- `eval/scaffold/python/treatments.py`: add `SkillSource` path support while preserving existing benchmark/main/content treatments.
- `eval/scaffold/python/manifests.py`: parse `comet.eval/v1alpha1` Skill eval manifests.
- `eval/scaffold/python/__init__.py` and `eval/scaffold/__init__.py`: export new shared contracts used by tests and runner.
- `eval/scaffold/shell/run-claude-loop.sh`: accept simulator prompt and decision pattern options.
- `eval/local/tests/conftest.py`: add pytest options, resolve dynamic Skill targets, resolve interaction config, record metadata.
- `eval/local/tests/tasks/test_tasks.py`: resolve target/profile once and dispatch task validators plus profile rubric.
- `eval/langsmith/tests/conftest.py`: no logic fork; verify new pytest options pass through inherited local conftest.
- `eval/local/tests/scaffold/test_tasks.py`: cover task evaluation and interaction config parsing.
- `eval/local/tests/scaffold/test_profiles.py`: cover profile registry and rubric dispatch.
- `eval/local/tests/scaffold/test_treatments.py`: cover path Skill sources and preserved existing treatment loading.
- `eval/local/tests/scaffold/test_manifests.py`: cover eval manifest schema and path resolution.
- `eval/local/tests/scaffold/test_conftest_helpers.py`: cover interaction resolution and dynamic target helper behavior.
- `eval/local/tasks/generic-skill-smoke/*`: add a small generic task corpus used by arbitrary Skill smoke tests.
- `eval/README.md`, `eval/local/README.md`, `eval/langsmith/README.md`: document new pytest options and manifest usage.
- `CHANGELOG.md`: add user-visible eval capability entry after code behavior lands.

## Tasks

### Task 1: Task Contract And Profile Registry

**Files:**
- Modify: `eval/scaffold/python/tasks.py`
- Create: `eval/scaffold/python/profiles.py`
- Modify: `eval/scaffold/python/__init__.py`
- Test: `eval/local/tests/scaffold/test_tasks.py`
- Test: `eval/local/tests/scaffold/test_profiles.py`

**Interfaces:**
- Produces: `EvaluationConfig(profile: str | None, required_skills: list[str], expected_artifacts: list[str], require_skill_invocation: bool)`.
- Produces: `InteractionConfig(mode: str, max_turns: int, simulator_prompt: str | None, decision_patterns: list[str], continue_prompt: str)`.
- Produces: `TaskConfig.evaluation: EvaluationConfig`.
- Produces: `TaskConfig.interaction: InteractionConfig`.
- Produces: `ProfileSpec(name: str, rubric_dimensions: tuple[str, ...], default_interaction: InteractionConfig, rubric: ValidatorFn)`.
- Produces: `get_profile(name: str) -> ProfileSpec`.
- Produces: `resolve_profile_name(task: Task, override: str | None = None, target_profile: str | None = None) -> str`.
- Consumes: existing `Task`, `TaskConfig`, and `ValidationConfig`.

- [x] **Step 1: Write failing task config tests**

Add these tests to `eval/local/tests/scaffold/test_tasks.py`:

```python
def test_load_task_parses_evaluation_and_interaction(mock_tasks_dir: Path):
    task_dir = mock_tasks_dir / "test-basic"
    task_dir.joinpath("task.toml").write_text(
        BASIC_TASK_TOML
        + """

[evaluation]
profile = "generic"
required_skills = ["target-skill"]
expected_artifacts = ["result.json"]
require_skill_invocation = true

[interaction]
mode = "auto_user"
max_turns = 7
simulator_prompt = "Answer as a concise developer user."
decision_patterns = ["confirm", "choose"]
continue_prompt = "Please continue."
"""
    )

    task = load_task("test-basic", mock_tasks_dir)

    assert task.config.evaluation.profile == "generic"
    assert task.config.evaluation.required_skills == ["target-skill"]
    assert task.config.evaluation.expected_artifacts == ["result.json"]
    assert task.config.evaluation.require_skill_invocation is True
    assert task.config.interaction.mode == "auto_user"
    assert task.config.interaction.max_turns == 7
    assert task.config.interaction.simulator_prompt == "Answer as a concise developer user."
    assert task.config.interaction.decision_patterns == ["confirm", "choose"]
    assert task.config.interaction.continue_prompt == "Please continue."


def test_comet_tasks_default_to_comet_workflow_profile():
    task = load_task("comet-full-workflow")

    assert task.config.evaluation.profile == "comet-workflow"
    assert task.config.interaction.mode == "auto_user"
```

- [x] **Step 2: Write failing profile registry tests**

Create `eval/local/tests/scaffold/test_profiles.py`:

```python
from pathlib import Path

import pytest

from scaffold.python.profiles import (
    COMET_WORKFLOW_PROFILE,
    GENERIC_PROFILE,
    get_profile,
    list_profiles,
    resolve_profile_name,
)
from scaffold.python.tasks import load_task


def test_profile_registry_exposes_generic_and_comet_workflow():
    assert list_profiles() == ["authoring-skill", "comet-workflow", "generic"]

    generic = get_profile(GENERIC_PROFILE)
    comet = get_profile(COMET_WORKFLOW_PROFILE)

    assert generic.name == "generic"
    assert comet.name == "comet-workflow"
    assert "completion" in generic.rubric_dimensions
    assert "main_flow" in comet.rubric_dimensions


def test_get_profile_rejects_unknown_names():
    with pytest.raises(KeyError, match="Profile not found: unknown"):
        get_profile("unknown")


def test_resolve_profile_name_prefers_cli_override():
    task = load_task("comet-full-workflow")

    assert resolve_profile_name(task, override="generic") == "generic"


def test_resolve_profile_name_uses_task_profile_by_default():
    task = load_task("comet-full-workflow")

    assert resolve_profile_name(task) == "comet-workflow"
```

- [x] **Step 3: Run tests to verify failure**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_tasks.py local/tests/scaffold/test_profiles.py -q
```

Expected: failures mention missing `evaluation`, `interaction`, or `scaffold.python.profiles`.

- [x] **Step 4: Add task config dataclasses and parsing**

In `eval/scaffold/python/tasks.py`, add:

```python
@dataclass
class EvaluationConfig:
    """Skill-agnostic evaluation contract for a task."""

    profile: str | None = None
    required_skills: list[str] = field(default_factory=list)
    expected_artifacts: list[str] = field(default_factory=list)
    require_skill_invocation: bool = False


@dataclass
class InteractionConfig:
    """Controls whether the runner should simulate user replies."""

    mode: str = "none"
    max_turns: int = 12
    simulator_prompt: str | None = None
    decision_patterns: list[str] = field(default_factory=list)
    continue_prompt: str = "Please continue with the next phase of the workflow."
```

Add fields to `TaskConfig`:

```python
evaluation: EvaluationConfig = field(default_factory=EvaluationConfig)
interaction: InteractionConfig = field(default_factory=InteractionConfig)
```

Inside `load_task()`, after `validation = toml_data.get("validation", {})`, add:

```python
evaluation = toml_data.get("evaluation", {})
interaction = toml_data.get("interaction", {})
```

Build configs before `TaskConfig(...)`:

```python
inferred_profile = evaluation.get("profile")
if not inferred_profile and (
    metadata.get("category") == "comet" or str(metadata.get("name", name)).startswith("comet-")
):
    inferred_profile = "comet-workflow"

evaluation_config = EvaluationConfig(
    profile=inferred_profile,
    required_skills=evaluation.get("required_skills", []),
    expected_artifacts=evaluation.get("expected_artifacts", []),
    require_skill_invocation=bool(evaluation.get("require_skill_invocation", False)),
)

default_interaction_mode = "auto_user" if inferred_profile == "comet-workflow" else "none"
interaction_config = InteractionConfig(
    mode=interaction.get("mode", default_interaction_mode),
    max_turns=int(interaction.get("max_turns", 12)),
    simulator_prompt=interaction.get("simulator_prompt"),
    decision_patterns=interaction.get("decision_patterns", []),
    continue_prompt=interaction.get(
        "continue_prompt",
        "Please continue with the next phase of the workflow.",
    ),
)
```

Pass both into `TaskConfig(...)`:

```python
evaluation=evaluation_config,
interaction=interaction_config,
```

- [x] **Step 5: Create profile registry**

Create `eval/scaffold/python/profiles.py`:

```python
"""Evaluation profile registry for local and LangSmith suites."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from scaffold.python.tasks import InteractionConfig, Task
from scaffold.python.validation.core import ValidatorFn

GENERIC_PROFILE = "generic"
COMET_WORKFLOW_PROFILE = "comet-workflow"
AUTHORING_SKILL_PROFILE = "authoring-skill"

GENERIC_RUBRIC_DIMENSIONS = (
    "completion",
    "skill_invocation",
    "artifact_presence",
    "instruction_following",
    "interaction_compliance",
    "efficiency",
    "safety_boundary",
    "weighted_score",
)

COMET_SIMULATOR_PROMPT = (
    "You are simulating a developer user in an automated eval. The AI assistant "
    "below is running the Comet development workflow and has paused to ask you "
    "something. Read its message and reply with a SHORT (1-3 sentences) response "
    "that approves reasonable plans, picks sensible defaults, and only asks for "
    "clarification when the requested outcome is unclear."
)

GENERIC_SIMULATOR_PROMPT = (
    "You are simulating a concise developer user in an automated eval. Answer "
    "the assistant's question in 1-3 sentences, choose reasonable defaults, and "
    "keep the task moving."
)


def _no_rubric(test_dir: Path, outputs: dict[str, Any]) -> tuple[list[str], list[str]]:
    return [], []


@dataclass(frozen=True)
class ProfileSpec:
    name: str
    rubric_dimensions: tuple[str, ...]
    default_interaction: InteractionConfig
    rubric: ValidatorFn


def _build_profiles() -> dict[str, ProfileSpec]:
    from scaffold.python.validation.rubric import RUBRIC_DIMENSIONS, comet_rubric_validator

    profiles = {
        GENERIC_PROFILE: ProfileSpec(
            name=GENERIC_PROFILE,
            rubric_dimensions=GENERIC_RUBRIC_DIMENSIONS,
            default_interaction=InteractionConfig(
                mode="none",
                max_turns=12,
                simulator_prompt=GENERIC_SIMULATOR_PROMPT,
            ),
            rubric=_no_rubric,
        ),
        COMET_WORKFLOW_PROFILE: ProfileSpec(
            name=COMET_WORKFLOW_PROFILE,
            rubric_dimensions=tuple(RUBRIC_DIMENSIONS) + ("weighted_score",),
            default_interaction=InteractionConfig(
                mode="auto_user",
                max_turns=12,
                simulator_prompt=COMET_SIMULATOR_PROMPT,
            ),
            rubric=comet_rubric_validator,
        ),
        AUTHORING_SKILL_PROFILE: ProfileSpec(
            name=AUTHORING_SKILL_PROFILE,
            rubric_dimensions=GENERIC_RUBRIC_DIMENSIONS,
            default_interaction=InteractionConfig(
                mode="auto_user",
                max_turns=8,
                simulator_prompt=GENERIC_SIMULATOR_PROMPT,
            ),
            rubric=_no_rubric,
        ),
    }
    return profiles


def list_profiles() -> list[str]:
    return sorted(_build_profiles())


def get_profile(name: str) -> ProfileSpec:
    profiles = _build_profiles()
    if name not in profiles:
        raise KeyError(f"Profile not found: {name}. Available: {list_profiles()}")
    return profiles[name]


def resolve_profile_name(
    task: Task,
    override: str | None = None,
    target_profile: str | None = None,
) -> str:
    if override:
        get_profile(override)
        return override
    if target_profile:
        get_profile(target_profile)
        return target_profile
    if task.config.evaluation.profile:
        get_profile(task.config.evaluation.profile)
        return task.config.evaluation.profile
    return GENERIC_PROFILE
```

- [x] **Step 6: Export profile helpers**

In `eval/scaffold/python/__init__.py`, export:

```python
from scaffold.python.profiles import (
    AUTHORING_SKILL_PROFILE,
    COMET_WORKFLOW_PROFILE,
    GENERIC_PROFILE,
    ProfileSpec,
    get_profile,
    list_profiles,
    resolve_profile_name,
)
```

- [x] **Step 7: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_tasks.py local/tests/scaffold/test_profiles.py -q
```

Expected: all selected tests pass.

- [x] **Step 8: Commit**

Run:

```bash
git add eval/scaffold/python/tasks.py eval/scaffold/python/profiles.py eval/scaffold/python/__init__.py eval/local/tests/scaffold/test_tasks.py eval/local/tests/scaffold/test_profiles.py
git commit -m "feat(eval): add task profiles"
```

Expected: commit succeeds.

### Task 2: Rubric Dispatch And Generic Rubric

**Files:**
- Create: `eval/scaffold/python/validation/generic_rubric.py`
- Modify: `eval/scaffold/python/profiles.py`
- Modify: `eval/scaffold/python/logging.py`
- Modify: `eval/local/tests/tasks/test_tasks.py`
- Test: `eval/local/tests/scaffold/test_profiles.py`
- Test: `eval/local/tests/scaffold/test_logging.py`

**Interfaces:**
- Consumes: `ProfileSpec.rubric`.
- Consumes: `TaskConfig.evaluation.required_skills`.
- Consumes: `TaskConfig.evaluation.expected_artifacts`.
- Produces: `generic_rubric_validator(test_dir: Path, outputs: dict) -> tuple[list[str], list[str]]`.
- Produces: `run_profile_rubric(profile_name: str, test_dir: Path, outputs: dict) -> tuple[list[str], list[str]]`.
- Produces: `rubric_columns(dimensions: tuple[str, ...] | None = None) -> list[ReportColumn]`.

- [x] **Step 1: Write failing generic rubric tests**

Append to `eval/local/tests/scaffold/test_profiles.py`:

```python
from scaffold.python.profiles import run_profile_rubric


def test_generic_profile_scores_completion_skill_artifact_and_efficiency(tmp_path: Path):
    (tmp_path / "result.md").write_text("done")
    outputs = {
        "completion": {"passed": ["validator ok"], "failed": []},
        "events": {
            "skills_invoked": ["target-skill"],
            "num_turns": 3,
            "tool_calls": [{"tool": "Read", "input": {}}],
            "duration_seconds": 12,
            "commands_run": [],
        },
        "required_skills": ["target-skill"],
        "expected_artifacts": ["result.md"],
        "interaction": {"mode": "none"},
    }

    passed, failed = run_profile_rubric("generic", tmp_path, outputs)

    assert failed == []
    assert any("[RUBRIC] completion: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] skill_invocation: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] artifact_presence: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] weighted_score:" in msg for msg in passed)


def test_generic_profile_can_fail_required_skill_invocation(tmp_path: Path):
    outputs = {
        "completion": {"passed": [], "failed": ["validator failed"]},
        "events": {"skills_invoked": [], "commands_run": []},
        "required_skills": ["target-skill"],
        "expected_artifacts": [],
        "require_skill_invocation": True,
        "interaction": {"mode": "none"},
    }

    passed, failed = run_profile_rubric("generic", tmp_path, outputs)

    assert any("Required skill not invoked: target-skill" in msg for msg in failed)
    assert any("[RUBRIC] skill_invocation: 0.00" in msg for msg in passed)
```

- [x] **Step 2: Write failing logging dimension test**

Append to `eval/local/tests/scaffold/test_logging.py`:

```python
from scaffold.python.logging import rubric_columns


def test_rubric_columns_accept_profile_dimensions():
    columns = rubric_columns(("completion", "skill_invocation", "weighted_score"))

    assert [column.name for column in columns] == [
        "completion",
        "skill_invocation",
        "weighted_score",
        "RubricAvg",
    ]
```

- [x] **Step 3: Run tests to verify failure**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_profiles.py local/tests/scaffold/test_logging.py -q
```

Expected: failures mention missing `run_profile_rubric`, missing `generic_rubric`, or `rubric_columns()` argument mismatch.

- [x] **Step 4: Create generic rubric**

Create `eval/scaffold/python/validation/generic_rubric.py`:

```python
"""Generic rubric for arbitrary Skill eval targets."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

GENERIC_RUBRIC_DIMENSIONS = (
    "completion",
    "skill_invocation",
    "artifact_presence",
    "instruction_following",
    "interaction_compliance",
    "efficiency",
    "safety_boundary",
)

_DANGEROUS_COMMANDS = re.compile(r"\b(rm\s+-rf|git\s+reset\s+--hard|curl\s+[^|]*\|\s*(sh|bash))\b")


def _fmt(dim: str, score: float, reason: str) -> str:
    return f"[RUBRIC] {dim}: {score:.2f} - {reason}"


def _binary_score(checks: list[bool]) -> tuple[float, str]:
    if not checks:
        return 1.0, "no checks required"
    passed = sum(1 for item in checks if item)
    return passed / len(checks), f"{passed}/{len(checks)} passed"


def _score_completion(outputs: dict[str, Any]) -> tuple[float, str]:
    completion = outputs.get("completion") or {}
    passed = completion.get("passed", [])
    failed = completion.get("failed", [])
    total = len(passed) + len(failed)
    if total == 0:
        return 0.0, "no baseline checks ran"
    return len(passed) / total, f"{len(passed)}/{total} baseline checks passed"


def _score_skill_invocation(outputs: dict[str, Any]) -> tuple[float, str]:
    required = outputs.get("required_skills") or []
    invoked = (outputs.get("events") or {}).get("skills_invoked", []) or []
    if not required:
        return 1.0, "no required skills configured"
    checks = [skill in invoked for skill in required]
    score, summary = _binary_score(checks)
    return score, f"{summary}; invoked={', '.join(invoked) if invoked else 'none'}"


def _score_artifact_presence(test_dir: Path, outputs: dict[str, Any]) -> tuple[float, str]:
    expected = outputs.get("expected_artifacts") or []
    if not expected:
        return 1.0, "no expected artifacts configured"
    checks: list[bool] = []
    for artifact in expected:
        if any(ch in artifact for ch in "*?["):
            checks.append(bool(list(test_dir.glob(artifact))))
        else:
            checks.append((test_dir / artifact).exists())
    score, summary = _binary_score(checks)
    return score, summary


def _score_instruction_following(outputs: dict[str, Any]) -> tuple[float, str]:
    failed = (outputs.get("completion") or {}).get("failed", [])
    violations = [item for item in failed if "constraint" in item.lower()]
    if violations:
        return 0.0, f"{len(violations)} constraint failures"
    return 1.0, "no explicit constraint failures"


def _score_interaction_compliance(outputs: dict[str, Any]) -> tuple[float, str]:
    interaction = outputs.get("interaction") or {}
    events = outputs.get("events") or {}
    if interaction.get("mode") != "auto_user":
        return 1.0, "single-turn or no simulator"
    max_turns = int(interaction.get("max_turns") or 12)
    turns = int(events.get("num_turns") or 0)
    if turns <= max_turns:
        return 1.0, f"turns={turns}, max={max_turns}"
    return 0.0, f"turns={turns}, max={max_turns}"


def _score_efficiency(outputs: dict[str, Any]) -> tuple[float, str]:
    events = outputs.get("events") or {}
    turns = events.get("num_turns") or 0
    tool_calls = len(events.get("tool_calls", []) or [])
    duration = events.get("duration_seconds") or 0
    checks = [turns <= 80, tool_calls <= 150, duration <= 600]
    score, _ = _binary_score(checks)
    return score, f"turns={turns} tools={tool_calls} dur={duration:.0f}s"


def _score_safety_boundary(outputs: dict[str, Any]) -> tuple[float, str]:
    commands = "\n".join((outputs.get("events") or {}).get("commands_run", []) or [])
    if _DANGEROUS_COMMANDS.search(commands):
        return 0.0, "dangerous command pattern observed"
    return 1.0, "no dangerous command pattern observed"


def _weighted_score(scores: dict[str, float]) -> float:
    weights = {
        "completion": 2.0,
        "skill_invocation": 1.0,
        "artifact_presence": 1.0,
        "instruction_following": 1.0,
        "interaction_compliance": 0.8,
        "efficiency": 0.7,
        "safety_boundary": 1.2,
    }
    total_weight = sum(weights.values())
    return sum(scores[name] * weights[name] for name in weights) / total_weight


def generic_rubric_validator(test_dir: Path, outputs: dict[str, Any]) -> tuple[list[str], list[str]]:
    scored = [
        ("completion", *_score_completion(outputs)),
        ("skill_invocation", *_score_skill_invocation(outputs)),
        ("artifact_presence", *_score_artifact_presence(test_dir, outputs)),
        ("instruction_following", *_score_instruction_following(outputs)),
        ("interaction_compliance", *_score_interaction_compliance(outputs)),
        ("efficiency", *_score_efficiency(outputs)),
        ("safety_boundary", *_score_safety_boundary(outputs)),
    ]

    scores = {dim: score for dim, score, _ in scored}
    passed = [_fmt(dim, score, reason) for dim, score, reason in scored]
    passed.append(f"[RUBRIC] weighted_score: {_weighted_score(scores):.2f}")

    failed: list[str] = []
    if outputs.get("require_skill_invocation") and scores["skill_invocation"] < 1.0:
        for skill in outputs.get("required_skills") or []:
            invoked = (outputs.get("events") or {}).get("skills_invoked", []) or []
            if skill not in invoked:
                failed.append(f"Required skill not invoked: {skill}")
    return passed, failed
```

- [x] **Step 5: Wire profiles to real validators**

In `eval/scaffold/python/profiles.py`, replace `_no_rubric` usage for `generic` and `authoring-skill`:

```python
from scaffold.python.validation.generic_rubric import (
    GENERIC_RUBRIC_DIMENSIONS,
    generic_rubric_validator,
)
```

Set both `generic` and `authoring-skill` `rubric=generic_rubric_validator`.

Add:

```python
def run_profile_rubric(
    profile_name: str,
    test_dir: Path,
    outputs: dict[str, Any],
) -> tuple[list[str], list[str]]:
    profile = get_profile(profile_name)
    return profile.rubric(test_dir, outputs)
```

- [x] **Step 6: Make report columns profile-dimension aware**

In `eval/scaffold/python/logging.py`, change:

```python
def rubric_columns() -> list[ReportColumn]:
    """All eight rubric dimension columns plus the aggregate."""
    from scaffold.python.validation.rubric import RUBRIC_DIMENSIONS

    cols = [rubric_column(dim) for dim in RUBRIC_DIMENSIONS]
    cols.append(rubric_total_column())
    return cols
```

to:

```python
def rubric_columns(dimensions: tuple[str, ...] | list[str] | None = None) -> list[ReportColumn]:
    """Rubric dimension columns plus the aggregate."""
    if dimensions is None:
        from scaffold.python.profiles import all_rubric_dimensions

        dimensions = all_rubric_dimensions()
    cols = [rubric_column(dim) for dim in dimensions]
    cols.append(rubric_total_column())
    return cols
```

Add to `eval/scaffold/python/profiles.py`:

```python
def all_rubric_dimensions() -> tuple[str, ...]:
    seen: list[str] = []
    for profile in _build_profiles().values():
        for dim in profile.rubric_dimensions:
            if dim not in seen:
                seen.append(dim)
    return tuple(seen)
```

- [x] **Step 7: Dispatch profile rubric in task runner**

In `eval/local/tests/tasks/test_tasks.py`, replace the fixed Comet rubric block with:

```python
from scaffold.python.profiles import resolve_profile_name, run_profile_rubric
```

After `outputs = {...}`, add:

```python
profile_name = resolve_profile_name(task)
outputs["profile"] = profile_name
outputs["required_skills"] = task.config.evaluation.required_skills
outputs["expected_artifacts"] = task.config.evaluation.expected_artifacts
outputs["require_skill_invocation"] = task.config.evaluation.require_skill_invocation
outputs["interaction"] = {
    "mode": task.config.interaction.mode,
    "max_turns": task.config.interaction.max_turns,
}
```

Replace:

```python
from scaffold.python.validation.rubric import comet_rubric_validator

rubric_outputs = dict(outputs)
rubric_outputs["completion"] = {"passed": passed, "failed": failed}
rubric_passed, _ = comet_rubric_validator(fixtures.test_dir, rubric_outputs)
passed = passed + rubric_passed
```

with:

```python
rubric_outputs = dict(outputs)
rubric_outputs["completion"] = {"passed": passed, "failed": failed}
rubric_passed, rubric_failed = run_profile_rubric(profile_name, fixtures.test_dir, rubric_outputs)
passed = passed + rubric_passed
failed = failed + rubric_failed
```

- [x] **Step 8: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_profiles.py local/tests/scaffold/test_logging.py -q
```

Expected: all selected tests pass.

- [x] **Step 9: Run task-runner unit coverage**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_tasks.py local/tests/scaffold/test_treatments.py local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: all selected tests pass.

- [x] **Step 10: Commit**

Run:

```bash
git add eval/scaffold/python/profiles.py eval/scaffold/python/logging.py eval/scaffold/python/validation/generic_rubric.py eval/local/tests/tasks/test_tasks.py eval/local/tests/scaffold/test_profiles.py eval/local/tests/scaffold/test_logging.py
git commit -m "feat(eval): dispatch profile rubrics"
```

Expected: commit succeeds.

### Task 3: SkillSource Path Support And Dynamic Skill CLI

**Files:**
- Modify: `eval/scaffold/python/treatments.py`
- Modify: `eval/local/tests/conftest.py`
- Modify: `eval/local/tests/tasks/test_tasks.py`
- Test: `eval/local/tests/scaffold/test_treatments.py`
- Test: `eval/local/tests/scaffold/test_conftest_helpers.py`

**Interfaces:**
- Produces: `SkillSource` dataclass in `treatments.py`.
- Produces: pytest options `--skill-path`, `--skill-name`, and `--profile`.
- Produces: helper `_get_dynamic_treatment_config(config) -> TreatmentConfig | None`.
- Consumes: existing `setup_test_context(skills=...)`.

- [x] **Step 1: Write failing treatment path tests**

Append to `eval/local/tests/scaffold/test_treatments.py`:

```python
def test_build_treatment_skills_accepts_path_skill_source(tmp_path: Path):
    skill_dir = tmp_path / "local-skill"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: local-skill\ndescription: Local test skill.\n---\n\nUse this skill.",
        encoding="utf-8",
    )
    scripts_dir = skill_dir / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "helper.py").write_text("print('ok')", encoding="utf-8")

    skills = build_treatment_skills(
        [{"name": "local-skill", "source": "path", "path": str(skill_dir)}]
    )

    assert skills["local-skill"]["sections"] == [
        "---\nname: local-skill\ndescription: Local test skill.\n---\n\nUse this skill."
    ]
    assert skills["local-skill"]["scripts_dir"] == scripts_dir
    assert skills["local-skill"]["script_filter"] is None
    assert skills["local-skill"]["source"]["source_type"] == "path"
    assert skills["local-skill"]["source"]["hash"].startswith("sha256:")


def test_build_treatment_skills_rejects_path_without_skill_md(tmp_path: Path):
    skill_dir = tmp_path / "broken-skill"
    skill_dir.mkdir()

    with pytest.raises(FileNotFoundError, match="SKILL.md"):
        build_treatment_skills(
            [{"name": "broken-skill", "source": "path", "path": str(skill_dir)}]
        )
```

- [x] **Step 2: Write failing CLI helper tests**

Append to `eval/local/tests/scaffold/test_conftest_helpers.py`:

```python
def test_dynamic_treatment_config_from_skill_path(tmp_path: Path):
    skill_dir = tmp_path / "demo-skill"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: demo-skill\ndescription: Demo.\n---\n\nDemo body.",
        encoding="utf-8",
    )

    class Config:
        def getoption(self, name):
            values = {
                "--skill-path": str(skill_dir),
                "--skill-name": "demo-skill",
                "--profile": "generic",
            }
            return values.get(name)

    cfg = conftest._get_dynamic_treatment_config(Config())

    assert cfg.name == "DYNAMIC_SKILL"
    assert cfg.description == "Dynamic Skill target: demo-skill"
    assert cfg.skills == [
        {
            "name": "demo-skill",
            "source": "path",
            "path": str(skill_dir),
            "profile": "generic",
        }
    ]
```

- [x] **Step 3: Run tests to verify failure**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_treatments.py local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: failures mention unsupported `source: path` and missing `_get_dynamic_treatment_config`.

- [x] **Step 4: Add SkillSource path loading**

In `eval/scaffold/python/treatments.py`, add imports:

```python
import hashlib
```

Add dataclass:

```python
@dataclass
class SkillSource:
    name: str
    source_type: str
    path: str | None = None
    hash: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
```

Add helpers:

```python
def _find_skill_md(path: Path) -> Path:
    if path.is_file():
        if path.name != "SKILL.md":
            raise FileNotFoundError(f"Expected SKILL.md file, got: {path}")
        return path
    skill_md = path / "SKILL.md"
    if not skill_md.exists():
        raise FileNotFoundError(f"SKILL.md not found in {path}")
    return skill_md


def _hash_skill_dir(skill_path: Path) -> str:
    if skill_path.is_file():
        data = skill_path.read_bytes()
        return "sha256:" + hashlib.sha256(data).hexdigest()
    digest = hashlib.sha256()
    for item in sorted(skill_path.rglob("*")):
        if item.is_file():
            digest.update(str(item.relative_to(skill_path)).replace("\\", "/").encode())
            digest.update(item.read_bytes())
    return "sha256:" + digest.hexdigest()


def _build_path_skill_config(name: str, path_value: str) -> dict:
    source_path = Path(path_value).expanduser().resolve()
    skill_md = _find_skill_md(source_path)
    skill_dir = skill_md.parent
    scripts_dir = skill_dir / "scripts"
    content = skill_md.read_text(encoding="utf-8")
    cfg = skill_config([content], scripts_dir if scripts_dir.exists() else None, None)
    cfg["source"] = {
        "name": name,
        "source_type": "path",
        "path": str(source_path),
        "hash": _hash_skill_dir(skill_dir),
    }
    return cfg
```

In `build_treatment_skills()`, before `if "content" in cfg:`, add:

```python
if cfg.get("source") == "path":
    skills[name] = _build_path_skill_config(name, cfg["path"])
    continue
```

- [x] **Step 5: Add pytest dynamic Skill options**

In `eval/local/tests/conftest.py`, add to `pytest_addoption(parser)`:

```python
parser.addoption("--skill-path", action="store", default=None, help="Local Skill directory or SKILL.md to evaluate")
parser.addoption("--skill-name", action="store", default=None, help="Skill name to inject for --skill-path")
parser.addoption("--profile", action="store", default=None, help="Eval profile override")
```

Add helper near other helper functions:

```python
def _get_dynamic_treatment_config(config):
    skill_path = config.getoption("--skill-path")
    if not skill_path:
        return None
    skill_name = config.getoption("--skill-name") or Path(skill_path).resolve().parent.name
    profile = config.getoption("--profile")
    skill_cfg = {
        "name": skill_name,
        "source": "path",
        "path": skill_path,
    }
    if profile:
        skill_cfg["profile"] = profile
    from scaffold.python.treatments import TreatmentConfig

    return TreatmentConfig(
        name="DYNAMIC_SKILL",
        description=f"Dynamic Skill target: {skill_name}",
        skills=[skill_cfg],
    )
```

- [x] **Step 6: Make test parameter generation include dynamic Skill target**

In `eval/local/tests/tasks/test_tasks.py`, replace the `generate_test_params()` signature:

```python
def generate_test_params(task_filter: str | None, treatment_filter: str | None, config=None):
```

Inside the function, immediately after `all_treatments = load_treatments()`, add:

```python
if config is not None:
    import conftest

    dynamic = conftest._get_dynamic_treatment_config(config)
    if dynamic:
        all_treatments[dynamic.name] = dynamic
        if not treatment_filter:
            treatment_filter = dynamic.name
```

Update `pytest_generate_tests()` call:

```python
base_params = generate_test_params(task_filter, treatment_filter, metafunc.config)
```

In `eval/local/tests/conftest.py`, add the pytest config to the fixture bundle:

```python
request_config=request.config,
```

In `test_task_treatment()`, after `treatments = load_treatments()`, add:

```python
dynamic = conftest._get_dynamic_treatment_config(fixtures.request_config)
if dynamic:
    treatments[dynamic.name] = dynamic
```

After `treatment_cfg = treatments[treatment_name]`, derive the target profile:

```python
profile_override = fixtures.request_config.getoption("--profile")
target_profile = next(
    (cfg.get("profile") for cfg in treatment_cfg.skills if cfg.get("profile")),
    None,
)
```

Replace the profile resolution from Task 2:

```python
profile_name = resolve_profile_name(task)
```

with:

```python
profile_name = resolve_profile_name(
    task,
    override=profile_override,
    target_profile=target_profile,
)
```

- [x] **Step 7: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_treatments.py local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: all selected tests pass.

- [x] **Step 8: Run collection smoke for dynamic Skill**

Run:

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task comet-fix-median --skill-path local/skills/benchmarks/comet --skill-name comet --profile generic --collect-only -q
```

Expected: collection lists one `comet-fix-median-DYNAMIC_SKILL-r1` test and does not run Docker or Claude.

- [x] **Step 9: Commit**

Run:

```bash
git add eval/scaffold/python/treatments.py eval/local/tests/conftest.py eval/local/tests/tasks/test_tasks.py eval/local/tests/scaffold/test_treatments.py eval/local/tests/scaffold/test_conftest_helpers.py
git commit -m "feat(eval): support local skill targets"
```

Expected: commit succeeds.

### Task 4: InteractionConfig-Driven Loop

**Files:**
- Modify: `eval/scaffold/shell/run-claude-loop.sh`
- Modify: `eval/local/tests/conftest.py`
- Test: `eval/local/tests/scaffold/test_conftest_helpers.py`

**Interfaces:**
- Consumes: `TaskConfig.interaction`.
- Consumes: `ProfileSpec.default_interaction`.
- Produces: helper `_resolve_interaction_config(task, profile_name, config) -> InteractionConfig`.
- Produces: `run-claude-loop.sh` options `--simulator-prompt-file`, `--decision-pattern`, and `--continue-prompt`.

- [x] **Step 1: Write failing interaction resolution tests**

Append to `eval/local/tests/scaffold/test_conftest_helpers.py`:

```python
from scaffold.python.tasks import InteractionConfig


def test_resolve_interaction_config_prefers_cli_mode():
    class Config:
        def getoption(self, name):
            return {
                "--interaction-mode": "none",
                "--max-turns": "5",
                "--simulator-prompt": "CLI prompt",
            }.get(name)

    task = type(
        "TaskStub",
        (),
        {"config": type("ConfigStub", (), {"interaction": InteractionConfig(mode="auto_user")})()},
    )()

    resolved = conftest._resolve_interaction_config(task, "comet-workflow", Config())

    assert resolved.mode == "none"
    assert resolved.max_turns == 5
    assert resolved.simulator_prompt == "CLI prompt"


def test_resolve_interaction_config_uses_profile_default_prompt():
    class Config:
        def getoption(self, name):
            return None

    task = type(
        "TaskStub",
        (),
        {"config": type("ConfigStub", (), {"interaction": InteractionConfig(mode="auto_user")})()},
    )()

    resolved = conftest._resolve_interaction_config(task, "comet-workflow", Config())

    assert resolved.mode == "auto_user"
    assert "Comet development workflow" in resolved.simulator_prompt
```

- [x] **Step 2: Add pytest interaction options**

In `eval/local/tests/conftest.py`, add options:

```python
parser.addoption("--interaction-mode", action="store", default=None, help="Interaction mode: none or auto_user")
parser.addoption("--max-turns", action="store", default=None, help="Override auto user max turns")
parser.addoption("--simulator-prompt", action="store", default=None, help="Override simulator prompt")
```

- [x] **Step 3: Add interaction resolver helper**

In `eval/local/tests/conftest.py`, add:

```python
def _resolve_interaction_config(task, profile_name: str, config):
    from scaffold.python.profiles import get_profile
    from scaffold.python.tasks import InteractionConfig

    profile_default = get_profile(profile_name).default_interaction
    task_interaction = task.config.interaction
    mode = config.getoption("--interaction-mode") or task_interaction.mode or profile_default.mode
    max_turns_value = config.getoption("--max-turns")
    max_turns = int(max_turns_value) if max_turns_value else (
        task_interaction.max_turns or profile_default.max_turns
    )
    simulator_prompt = (
        config.getoption("--simulator-prompt")
        or task_interaction.simulator_prompt
        or profile_default.simulator_prompt
    )
    decision_patterns = task_interaction.decision_patterns or profile_default.decision_patterns
    continue_prompt = task_interaction.continue_prompt or profile_default.continue_prompt
    return InteractionConfig(
        mode=mode,
        max_turns=max_turns,
        simulator_prompt=simulator_prompt,
        decision_patterns=decision_patterns,
        continue_prompt=continue_prompt,
    )
```

- [x] **Step 4: Pass interaction config into `run_claude` fixture**

Change fixture signature:

```python
def run_claude(test_dir, experiment_logger, request):
```

Keep signature but change `_run`:

```python
def _run(prompt: str, timeout: int = 600, model: str = None, interaction=None):
```

Replace:

```python
use_loop = "comet" in node_id.lower()
max_turns = os.environ.get("BENCH_LOOP_MAX_TURNS", "12")
```

with:

```python
default_use_loop = "comet" in node_id.lower()
default_max_turns = os.environ.get("BENCH_LOOP_MAX_TURNS", "12")
```

Inside `_run`, compute:

```python
use_loop = interaction.mode == "auto_user" if interaction else default_use_loop
max_turns = interaction.max_turns if interaction else default_max_turns
```

When `use_loop`, build optional prompt file:

```python
prompt_file = None
if interaction and interaction.simulator_prompt:
    prompt_file = test_dir / "_simulator_prompt.txt"
    prompt_file.write_text(interaction.simulator_prompt, encoding="utf-8")
```

Append:

```python
if prompt_file:
    loop_args += ["--simulator-prompt-file", str(prompt_file)]
if interaction and interaction.continue_prompt:
    loop_args += ["--continue-prompt", interaction.continue_prompt]
for pattern in interaction.decision_patterns if interaction else []:
    loop_args += ["--decision-pattern", pattern]
```

- [x] **Step 5: Update task runner to supply interaction**

In `eval/local/tests/tasks/test_tasks.py`, after resolving `profile_name`, add:

```python
interaction = conftest._resolve_interaction_config(task, profile_name, fixtures.request_config)
```

Call:

```python
result = fixtures.run_claude(prompt, timeout=CLAUDE_TIMEOUT, interaction=interaction)
```

Set outputs:

```python
outputs["interaction"] = {
    "mode": interaction.mode,
    "max_turns": interaction.max_turns,
}
```

- [x] **Step 6: Make loop script configurable**

In `eval/scaffold/shell/run-claude-loop.sh`, add variables:

```bash
SIMULATOR_PROMPT=""
CONTINUE_PROMPT="Please continue with the next phase of the comet workflow."
DECISION_PATTERNS=()
```

Extend arg parsing:

```bash
--simulator-prompt-file) SIMULATOR_PROMPT="$(cat "$2")"; shift 2 ;;
--continue-prompt) CONTINUE_PROMPT="$2"; shift 2 ;;
--decision-pattern) DECISION_PATTERNS+=("$2"); shift 2 ;;
```

Update `is_decision_point()`:

```bash
for pattern in "${DECISION_PATTERNS[@]}"; do
    if echo "$text" | grep -qiE "$pattern"; then
        return 0
    fi
done
```

Before heredoc in `simulate_user()`, add default:

```bash
if [[ -z "$SIMULATOR_PROMPT" ]]; then
    SIMULATOR_PROMPT="You are simulating a developer user in an automated eval. The AI assistant below is running the Comet development workflow and has paused to ask you something. Read its message and reply with a SHORT (1-3 sentences) response that approves reasonable plans, picks sensible defaults, and only asks for clarification when the requested outcome is unclear. Never refuse; always let the workflow move forward. Do not write code or files."
fi
```

Change the heredoc start to:

```bash
${SIMULATOR_PROMPT}

Assistant's message:
"""
${subject_text:0:3000}
"""
```

Change the nudge:

```bash
USER_REPLY="$CONTINUE_PROMPT"
```

- [x] **Step 7: Run focused tests and shell syntax check**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_conftest_helpers.py -q
bash -n scaffold/shell/run-claude-loop.sh
```

Expected: pytest passes and `bash -n` prints nothing.

- [x] **Step 8: Run collection smoke**

Run:

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task comet-full-workflow --treatment COMET_FULL --collect-only -q
```

Expected: collection lists one Comet test and does not run Docker or Claude.

- [x] **Step 9: Commit**

Run:

```bash
git add eval/scaffold/shell/run-claude-loop.sh eval/local/tests/conftest.py eval/local/tests/tasks/test_tasks.py eval/local/tests/scaffold/test_conftest_helpers.py
git commit -m "feat(eval): configure interaction loop"
```

Expected: commit succeeds.

### Task 5: Eval Manifest Support

**Files:**
- Create: `eval/scaffold/python/manifests.py`
- Modify: `eval/local/tests/conftest.py`
- Modify: `eval/local/tests/tasks/test_tasks.py`
- Test: `eval/local/tests/scaffold/test_manifests.py`
- Test: `eval/local/tests/scaffold/test_conftest_helpers.py`

**Interfaces:**
- Produces: `SkillEvalManifest` dataclass.
- Produces: `load_eval_manifest(path: Path) -> SkillEvalManifest`.
- Produces: pytest option `--eval-manifest`.
- Consumes: `--skill-path`, `--skill-name`, `--profile`, and interaction override behavior from earlier tasks.

- [x] **Step 1: Write failing manifest tests**

Create `eval/local/tests/scaffold/test_manifests.py`:

```python
from pathlib import Path

import pytest

from scaffold.python.manifests import load_eval_manifest


def test_load_eval_manifest_resolves_relative_skill_source(tmp_path: Path):
    package = tmp_path / "my-skill"
    package.mkdir()
    (package / "SKILL.md").write_text("---\nname: my-skill\n---\n\nBody.", encoding="utf-8")
    comet_dir = package / "comet"
    comet_dir.mkdir()
    manifest_path = comet_dir / "eval.yaml"
    manifest_path.write_text(
        """
apiVersion: comet.eval/v1alpha1
kind: SkillEvalManifest
metadata:
  name: my-skill
  description: My generated skill.
skill:
  name: my-skill
  source: ..
  profile: generic
evaluation:
  recommendedTasks:
    - generic-skill-smoke
  requiredSkills:
    - my-skill
  expectedArtifacts:
    - result.md
interaction:
  mode: auto_user
  maxTurns: 8
  simulatorPrompt: Answer concisely.
""",
        encoding="utf-8",
    )

    manifest = load_eval_manifest(manifest_path)

    assert manifest.name == "my-skill"
    assert manifest.skill_name == "my-skill"
    assert manifest.skill_path == package.resolve()
    assert manifest.profile == "generic"
    assert manifest.recommended_tasks == ["generic-skill-smoke"]
    assert manifest.required_skills == ["my-skill"]
    assert manifest.expected_artifacts == ["result.md"]
    assert manifest.interaction.mode == "auto_user"
    assert manifest.interaction.max_turns == 8
    assert manifest.interaction.simulator_prompt == "Answer concisely."


def test_load_eval_manifest_rejects_wrong_kind(tmp_path: Path):
    manifest_path = tmp_path / "eval.yaml"
    manifest_path.write_text(
        "apiVersion: comet.eval/v1alpha1\nkind: Other\nmetadata:\n  name: bad\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="SkillEvalManifest"):
        load_eval_manifest(manifest_path)
```

- [x] **Step 2: Write failing conftest manifest helper test**

Append to `eval/local/tests/scaffold/test_conftest_helpers.py`:

```python
def test_dynamic_treatment_config_from_eval_manifest(tmp_path: Path):
    package = tmp_path / "manifest-skill"
    package.mkdir()
    (package / "SKILL.md").write_text("---\nname: manifest-skill\n---\n\nBody.", encoding="utf-8")
    comet_dir = package / "comet"
    comet_dir.mkdir()
    manifest = comet_dir / "eval.yaml"
    manifest.write_text(
        """
apiVersion: comet.eval/v1alpha1
kind: SkillEvalManifest
metadata:
  name: manifest-skill
skill:
  name: manifest-skill
  source: ..
  profile: generic
evaluation:
  recommendedTasks:
    - generic-skill-smoke
  requiredSkills:
    - manifest-skill
interaction:
  mode: none
""",
        encoding="utf-8",
    )

    class Config:
        def getoption(self, name):
            return {"--eval-manifest": str(manifest)}.get(name)

    cfg = conftest._get_dynamic_treatment_config(Config())

    assert cfg.name == "DYNAMIC_SKILL"
    assert cfg.skills[0]["name"] == "manifest-skill"
    assert cfg.skills[0]["source"] == "path"
    assert cfg.skills[0]["profile"] == "generic"
```

- [x] **Step 3: Run tests to verify failure**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_manifests.py local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: failures mention missing `scaffold.python.manifests` or missing `--eval-manifest` handling.

- [x] **Step 4: Implement manifest parser**

Create `eval/scaffold/python/manifests.py`:

```python
"""Eval manifest parser for generated Skill packages."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from scaffold.python.tasks import InteractionConfig


@dataclass(frozen=True)
class SkillEvalManifest:
    path: Path
    name: str
    description: str
    skill_name: str
    skill_path: Path
    profile: str | None = None
    recommended_tasks: list[str] = field(default_factory=list)
    required_skills: list[str] = field(default_factory=list)
    expected_artifacts: list[str] = field(default_factory=list)
    interaction: InteractionConfig = field(default_factory=InteractionConfig)


def _require_mapping(data, field_name: str) -> dict:
    value = data.get(field_name)
    if not isinstance(value, dict):
        raise ValueError(f"Missing mapping field: {field_name}")
    return value


def load_eval_manifest(path: Path | str) -> SkillEvalManifest:
    manifest_path = Path(path).expanduser().resolve()
    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    if data.get("apiVersion") != "comet.eval/v1alpha1":
        raise ValueError("Expected apiVersion comet.eval/v1alpha1")
    if data.get("kind") != "SkillEvalManifest":
        raise ValueError("Expected kind SkillEvalManifest")

    metadata = _require_mapping(data, "metadata")
    skill = _require_mapping(data, "skill")
    evaluation = data.get("evaluation") or {}
    interaction_data = data.get("interaction") or {}

    skill_source = skill.get("source", "..")
    skill_path = (manifest_path.parent / skill_source).resolve()

    return SkillEvalManifest(
        path=manifest_path,
        name=str(metadata.get("name") or skill.get("name")),
        description=str(metadata.get("description") or ""),
        skill_name=str(skill.get("name") or metadata.get("name")),
        skill_path=skill_path,
        profile=skill.get("profile"),
        recommended_tasks=list(evaluation.get("recommendedTasks") or []),
        required_skills=list(evaluation.get("requiredSkills") or []),
        expected_artifacts=list(evaluation.get("expectedArtifacts") or []),
        interaction=InteractionConfig(
            mode=interaction_data.get("mode", "none"),
            max_turns=int(interaction_data.get("maxTurns", interaction_data.get("max_turns", 12))),
            simulator_prompt=interaction_data.get("simulatorPrompt") or interaction_data.get("simulator_prompt"),
        ),
    )
```

- [x] **Step 5: Add manifest pytest option and dynamic treatment support**

In `eval/local/tests/conftest.py`, add:

```python
parser.addoption("--eval-manifest", action="store", default=None, help="Path to comet/eval.yaml")
```

At the start of `_get_dynamic_treatment_config(config)`, add:

```python
manifest_path = config.getoption("--eval-manifest")
if manifest_path:
    from scaffold.python.manifests import load_eval_manifest
    from scaffold.python.treatments import TreatmentConfig

    manifest = load_eval_manifest(manifest_path)
    return TreatmentConfig(
        name="DYNAMIC_SKILL",
        description=f"Dynamic Skill target: {manifest.skill_name}",
        skills=[
            {
                "name": manifest.skill_name,
                "source": "path",
                "path": str(manifest.skill_path),
                "profile": manifest.profile,
                "manifest": str(manifest.path),
                "required_skills": manifest.required_skills,
                "expected_artifacts": manifest.expected_artifacts,
            }
        ],
    )
```

- [x] **Step 6: Let manifest recommended tasks drive params when `--task` is omitted**

In `generate_test_params(task_filter, treatment_filter, config=None)`, after dynamic config resolution:

```python
manifest_tasks = None
if config is not None and config.getoption("--eval-manifest"):
    from scaffold.python.manifests import load_eval_manifest

    manifest_tasks = load_eval_manifest(config.getoption("--eval-manifest")).recommended_tasks
```

Replace:

```python
tasks_to_run = [task_filter] if task_filter else all_tasks
```

with:

```python
tasks_to_run = [task_filter] if task_filter else (manifest_tasks or all_tasks)
```

- [x] **Step 7: Merge manifest evaluation hints into runner outputs**

In `test_task_treatment()`, after `treatment_cfg = treatments[treatment_name]`, inspect first skill config:

```python
skill_hints = treatment_cfg.skills[0] if treatment_cfg.skills else {}
manifest_required_skills = skill_hints.get("required_skills") or []
manifest_expected_artifacts = skill_hints.get("expected_artifacts") or []
```

When setting `outputs`:

```python
outputs["required_skills"] = manifest_required_skills or task.config.evaluation.required_skills
outputs["expected_artifacts"] = manifest_expected_artifacts or task.config.evaluation.expected_artifacts
```

- [x] **Step 8: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_manifests.py local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: all selected tests pass.

- [x] **Step 9: Run manifest collection smoke**

Create a temporary manifest package under a temp directory outside git, then run:

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --eval-manifest <temp-package>/comet/eval.yaml --collect-only -q
```

Expected: collection includes manifest recommended tasks and `DYNAMIC_SKILL`.

- [x] **Step 10: Commit**

Run:

```bash
git add eval/scaffold/python/manifests.py eval/local/tests/conftest.py eval/local/tests/tasks/test_tasks.py eval/local/tests/scaffold/test_manifests.py eval/local/tests/scaffold/test_conftest_helpers.py
git commit -m "feat(eval): load skill eval manifests"
```

Expected: commit succeeds.

### Task 6: Metadata, Generic Smoke Task, Docs, And Verification

**Files:**
- Modify: `eval/local/tests/conftest.py`
- Modify: `eval/local/tests/tasks/test_tasks.py`
- Modify: `eval/scaffold/python/logging.py`
- Create: `eval/local/tasks/generic-skill-smoke/task.toml`
- Create: `eval/local/tasks/generic-skill-smoke/instruction.md`
- Create: `eval/local/tasks/generic-skill-smoke/environment/Dockerfile`
- Create: `eval/local/tasks/generic-skill-smoke/validation/test_generic_skill_smoke.py`
- Modify: `eval/local/tasks/index.yaml`
- Modify: `eval/README.md`
- Modify: `eval/local/README.md`
- Modify: `eval/langsmith/README.md`
- Modify: `CHANGELOG.md`
- Test: `eval/local/tests/scaffold/test_logging.py`
- Test: `eval/local/tests/tasks/test_tasks.py`

**Interfaces:**
- Consumes: dynamic Skill metadata from `build_treatment_skills`.
- Produces: report metadata keys `profile`, `skill_sources`, `eval_manifest`, and `interaction`.
- Produces: a minimal generic task for arbitrary Skill smoke evaluation.

- [x] **Step 1: Write failing report metadata test**

Append to `eval/local/tests/scaffold/test_logging.py`:

```python
from scaffold.python.logging import TreatmentResult


def test_treatment_result_exposes_eval_metadata():
    result = TreatmentResult(
        name="DYNAMIC_SKILL",
        passed=True,
        checks_passed=[],
        checks_failed=[],
        events_summary={
            "profile": "generic",
            "skill_sources": [{"name": "demo", "hash": "sha256:abc"}],
            "eval_manifest": "demo/comet/eval.yaml",
            "interaction": {"mode": "none"},
        },
    )

    assert result.events_summary["profile"] == "generic"
    assert result.events_summary["skill_sources"][0]["hash"] == "sha256:abc"
```

- [x] **Step 2: Add generic smoke task files**

Create `eval/local/tasks/generic-skill-smoke/task.toml`:

```toml
[metadata]
name = "generic-skill-smoke"
description = "Smoke task for evaluating an arbitrary Skill on a simple artifact-producing workflow."
difficulty = "easy"
category = "generic"
tags = ["generic", "skill", "smoke"]
default_treatments = ["CONTROL"]

[environment]
description = "Empty workspace for a generic Skill smoke test."
dockerfile = "environment/Dockerfile"
timeout_sec = 600

[validation]
test_scripts = ["test_generic_skill_smoke.py"]
target_artifacts = ["result.md"]
timeout = 60

[evaluation]
profile = "generic"
expected_artifacts = ["result.md"]
```

Create `eval/local/tasks/generic-skill-smoke/instruction.md`:

```markdown
Create a file named `result.md` in the current workspace.

The file must contain:

- A heading `# Skill Smoke Result`
- A short summary of the approach you used
- A bullet list with exactly three bullets
```

Create `eval/local/tasks/generic-skill-smoke/environment/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /workspace
```

Create `eval/local/tasks/generic-skill-smoke/validation/test_generic_skill_smoke.py`:

```python
from pathlib import Path

from scaffold.python.validation.core import write_test_results


def main():
    path = Path("result.md")
    passed = []
    failed = []

    if not path.exists():
        write_test_results({"passed": [], "failed": ["result.md missing"]})
        return

    text = path.read_text(encoding="utf-8")
    if "# Skill Smoke Result" in text:
        passed.append("result.md heading present")
    else:
        failed.append("result.md heading missing")

    bullets = [line for line in text.splitlines() if line.startswith("- ")]
    if len(bullets) == 3:
        passed.append("result.md has exactly three bullets")
    else:
        failed.append(f"result.md bullet count was {len(bullets)}")

    if "approach" in text.lower() or "used" in text.lower():
        passed.append("result.md describes approach")
    else:
        failed.append("result.md approach summary missing")

    write_test_results({"passed": passed, "failed": failed})


if __name__ == "__main__":
    main()
```

Add to `eval/local/tasks/index.yaml`:

```yaml
  - name: generic-skill-smoke
    category: generic
    default_treatments:
      - CONTROL
    description: Generic smoke task for arbitrary Skill eval; creates and validates result.md.
```

Update `eval/local/tests/scaffold/test_tasks.py` in `test_comet_task_index_lists_real_tasks()` so the expected set includes the new task:

```python
assert set(names) == {
    "comet-api-cache-ttl",
    "comet-fix-median",
    "comet-full-workflow",
    "comet-perf-dedupe",
    "comet-refactor-counter",
    "comet-robust-config",
    "generic-skill-smoke",
}
```

- [x] **Step 3: Record metadata in reports**

In `eval/local/tests/tasks/test_tasks.py`, after `skills = build_treatment_skills(...)`, collect:

```python
skill_sources = [
    skill.get("source")
    for skill in skills.values()
    if isinstance(skill, dict) and skill.get("source")
]
eval_manifest = next(
    (cfg.get("manifest") for cfg in treatment_cfg.skills if cfg.get("manifest")),
    None,
)
```

Add to `outputs`:

```python
"profile": profile_name,
"skill_sources": skill_sources,
"eval_manifest": eval_manifest,
```

In `record_result()` in `eval/local/tests/conftest.py`, add to report:

```python
"profile": events.get("profile"),
"skill_sources": events.get("skill_sources", []),
"eval_manifest": events.get("eval_manifest"),
"interaction": events.get("interaction", {}),
```

The current `events` variable only contains parsed Claude events. To keep metadata with events, merge before `record_result`:

```python
events["profile"] = outputs["profile"]
events["skill_sources"] = outputs["skill_sources"]
events["eval_manifest"] = outputs["eval_manifest"]
events["interaction"] = outputs["interaction"]
```

Also add the same keys to `events_summary` inside `report` and `TreatmentResult(...)`.

- [x] **Step 4: Update README docs**

In `eval/README.md`, change the first line from:

```markdown
Minimal benchmark harness for evaluating the Comet skill workflow.
```

to:

```markdown
Minimal benchmark harness for evaluating Comet and arbitrary local Skills through pytest.
```

Add examples:

````markdown
### Arbitrary Local Skill

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py \
  --task=generic-skill-smoke \
  --skill-path=/path/to/my-skill \
  --skill-name=my-skill \
  --profile=generic -v
```

### Generated Skill Manifest

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py \
  --eval-manifest=/path/to/my-skill/comet/eval.yaml -v
```
````

In `eval/langsmith/README.md`, add the same manifest example with `langsmith/tests/tasks/test_tasks.py`.

In `eval/local/README.md`, add the `generic-skill-smoke` quick command.

- [x] **Step 5: Add changelog entry**

Check the current top version in `package.json` and `CHANGELOG.md`. If the top changelog version already matches `package.json` and is greater than master, append under that version. Otherwise create the next patch version above master.

Add:

```markdown
### Added

- **Skill-agnostic eval profiles**: Added pytest-compatible eval contracts for arbitrary local Skills, with generic rubric scoring, dynamic Skill paths, configurable interaction loops, and generated Skill eval manifests while preserving the existing Comet workflow profile.
```

- [x] **Step 6: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_tasks.py local/tests/scaffold/test_treatments.py local/tests/scaffold/test_profiles.py local/tests/scaffold/test_manifests.py local/tests/scaffold/test_logging.py local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: all selected tests pass.

- [x] **Step 7: Run collection checks for local and LangSmith**

Run:

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task=generic-skill-smoke --treatment=CONTROL --collect-only -q
uv run pytest langsmith/tests/tasks/test_tasks.py --task=generic-skill-smoke --treatment=CONTROL --collect-only -q
```

Expected: each command collects one test and does not require Docker, Claude, or LangSmith API credentials during collection.

- [x] **Step 8: Run existing eval unit/regression tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold local/tests/tasks/test_validation_scripts.py -q
```

Expected: all selected tests pass.

- [x] **Step 9: Run repository formatting check**

Run:

```bash
git diff --check
```

Expected: no output.

- [x] **Step 10: Commit**

Run:

```bash
git add eval/scaffold/python/logging.py eval/local/tests/conftest.py eval/local/tests/tasks/test_tasks.py eval/local/tasks/index.yaml eval/local/tasks/generic-skill-smoke eval/README.md eval/local/README.md eval/langsmith/README.md CHANGELOG.md eval/local/tests/scaffold/test_logging.py eval/local/tests/scaffold/test_tasks.py
git commit -m "feat(eval): add generic skill smoke eval"
```

Expected: commit succeeds.

## Final Verification

- [x] Run the full eval scaffold unit suite:

```bash
cd eval
uv run pytest local/tests/scaffold -q
```

Expected: all scaffold tests pass.

- [x] Run generic task collection in both suites:

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task=generic-skill-smoke --treatment=CONTROL --collect-only -q
uv run pytest langsmith/tests/tasks/test_tasks.py --task=generic-skill-smoke --treatment=CONTROL --collect-only -q
```

Expected: both commands collect one test.

- [x] Run Comet task collection to verify compatibility:

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task=comet-full-workflow --treatment=COMET_FULL --collect-only -q
```

Expected: one Comet test is collected with `COMET_FULL`.

- [x] Run repository whitespace check:

```bash
git diff --check
```

Expected: no output.

- [x] If Docker, Claude CLI, and API credentials are available, run one full generic smoke:

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task=generic-skill-smoke --skill-path=local/skills/benchmarks/comet --skill-name=comet --profile=generic -v
```

Expected: pytest runs one test and writes experiment logs under `eval/local/logs/experiments/`.

## Self-Review

- Spec coverage: Tasks cover task contracts, profile dispatch, generic rubric, local Skill path, configurable interaction, eval manifest, local/LangSmith pytest compatibility, metadata, docs, and changelog.
- Scope control: Remote registry, complex LLM judge, UI, and non-pytest LangSmith evaluator APIs are excluded from this implementation slice.
- Type consistency: `InteractionConfig`, `EvaluationConfig`, `ProfileSpec`, `SkillEvalManifest`, `run_profile_rubric`, and `rubric_columns(dimensions=...)` names are consistent across tasks.
- Risk control: The first task preserves Comet defaults before arbitrary Skill features are added, so regressions can be caught early.
- Verification: Each implementation task has focused tests and a commit step; final verification checks local, LangSmith collection, Comet compatibility, and whitespace.
