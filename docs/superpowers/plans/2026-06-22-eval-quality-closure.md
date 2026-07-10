# Eval Quality Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the P0 eval evidence loop so Comet and generated Skills produce reproducible reports with profile, Skill source, artifact references, failure attribution, and `/comet-any` authoring quality checks.

**Architecture:** Keep `eval/scaffold/python/` as the shared eval boundary and keep pytest as the only runner. Add small scaffold modules for artifact references and failure attribution, extend the existing `authoring-skill` profile with generated-package checks, and make comparison reports consume the structured metadata instead of relying only on regex heuristics.

**Tech Stack:** Python 3.11+, pytest, PyYAML, existing `eval/scaffold/python` modules, existing local/LangSmith pytest suites.

## Global Constraints

- Eval 后续改进以 `eval/scaffold/python/` 为共享边界，不新增第二套 runner。
- 每个 report 记录 `profile`、`skill_sources`、Skill hash、task、interaction config、run id、report output config。
- 任何 pass/fail 结论都能回到原始 stdout/stderr、events、reports 和 artifacts。
- 对比报告中明确区分 `workflow`、`task`、`model`、`harness` 四类归因。
- `/comet-any` 产物走 `authoring-skill` profile，第一版可以复用 generic，但必须增加生成物结构和 review evidence 检查。
- Markdown 是默认输出；HTML、JSON summary、对比报告输出通过 `report_outputs` 配置启用。
- CI 或回归门禁只依赖机器可读数据，不依赖 HTML。
- LangSmith 只能作为增强 tracing，不应成为 local eval 的硬依赖。
- 不把高成本 eval 变成默认自动动作。

---

## File Structure

- `eval/scaffold/python/evidence.py`: create artifact-reference helpers used by local and LangSmith suites.
- `eval/scaffold/python/attribution.py`: create structured failure attribution for `harness`, `workflow`, `task`, and `model`.
- `eval/scaffold/python/validation/authoring_rubric.py`: create `/comet-any` generated Skill package checks for the `authoring-skill` profile.
- `eval/scaffold/python/profiles.py`: route `authoring-skill` to the new authoring rubric and expose its rubric dimensions.
- `eval/local/tests/conftest.py`: write artifact references and failure attribution into per-run report JSON and `TreatmentResult.events_summary`.
- `eval/local/tests/tasks/test_tasks.py`: pass `skill_package_path`, `required_skills`, `expected_artifacts`, profile, and interaction metadata into profile rubrics.
- `eval/local/scripts/compare_baselines.py`: display source evidence, report paths, run ids, and structured attribution; keep existing regex fallback for legacy reports.
- `eval/local/tests/scaffold/test_evidence.py`: cover artifact-reference path generation.
- `eval/local/tests/scaffold/test_attribution.py`: cover structured failure buckets.
- `eval/local/tests/scaffold/test_profiles.py`: cover `authoring-skill` generated package checks.
- `eval/local/tests/scaffold/test_logging.py`: cover report metadata and output config metadata.
- `eval/local/tests/scaffold/test_compare_baselines.py`: cover comparison report evidence and attribution sections.
- `eval/README.md` and `eval/local/README.md`: document the quick eval evidence contract.

## Tasks

### Task 1: Report Artifact References

**Files:**
- Create: `eval/scaffold/python/evidence.py`
- Modify: `eval/local/tests/conftest.py`
- Test: `eval/local/tests/scaffold/test_evidence.py`
- Test: `eval/local/tests/scaffold/test_logging.py`

**Interfaces:**
- Produces: `EvalArtifactReference(kind: str, path: str)`.
- Produces: `build_eval_artifact_references(base_dir: Path, treatment_name: str, rep: int) -> dict[str, str]`.
- Consumes: existing `save_events`, `save_raw`, `save_report`, and `_save_artifacts` output layout.

- [x] **Step 1: Write failing artifact-reference tests**

Create `eval/local/tests/scaffold/test_evidence.py`:

```python
from pathlib import Path

from scaffold.python.evidence import build_eval_artifact_references


def test_build_eval_artifact_references_uses_existing_report_layout(tmp_path: Path):
    base = tmp_path / "experiments" / "demo"
    refs = build_eval_artifact_references(base, "DYNAMIC_SKILL", 2)

    assert refs == {
        "events": str(base / "events" / "dynamic_skill_rep2.json"),
        "raw_stdout": str(base / "raw" / "dynamic_skill_rep2_stdout.json"),
        "raw_stderr": str(base / "raw" / "dynamic_skill_rep2_stderr.txt"),
        "report": str(base / "reports" / "dynamic_skill_rep2_report.json"),
        "artifacts": str(base / "artifacts" / "dynamic_skill_rep2"),
    }
```

Append to `eval/local/tests/scaffold/test_logging.py`:

```python
from scaffold.python.logging import TreatmentResult


def test_treatment_result_can_carry_artifact_references():
    result = TreatmentResult(
        name="DYNAMIC_SKILL",
        passed=True,
        checks_passed=[],
        checks_failed=[],
        events_summary={
            "artifact_references": {
                "events": "events/dynamic_skill_rep1.json",
                "report": "reports/dynamic_skill_rep1_report.json",
            }
        },
    )

    assert result.events_summary["artifact_references"]["report"].endswith("_report.json")
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_evidence.py local/tests/scaffold/test_logging.py -q
```

Expected: `test_evidence.py` fails because `scaffold.python.evidence` does not exist.

- [x] **Step 3: Implement artifact references**

Create `eval/scaffold/python/evidence.py`:

```python
"""Evidence references for eval reports."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class EvalArtifactReference:
    kind: str
    path: str


def _safe_name(treatment_name: str) -> str:
    return treatment_name.lower().replace("-", "_")


def build_eval_artifact_references(
    base_dir: Path,
    treatment_name: str,
    rep: int,
) -> dict[str, str]:
    name = _safe_name(treatment_name)
    return {
        "events": str(base_dir / "events" / f"{name}_rep{rep}.json"),
        "raw_stdout": str(base_dir / "raw" / f"{name}_rep{rep}_stdout.json"),
        "raw_stderr": str(base_dir / "raw" / f"{name}_rep{rep}_stderr.txt"),
        "report": str(base_dir / "reports" / f"{name}_rep{rep}_report.json"),
        "artifacts": str(base_dir / "artifacts" / f"{name}_rep{rep}"),
    }
```

In `eval/local/tests/conftest.py`, import it:

```python
from scaffold.python.evidence import build_eval_artifact_references
```

Inside `record_result._record()`, immediately after `_save_artifacts(...)`, add:

```python
artifact_references = build_eval_artifact_references(base_dir, treatment_name, rep)
```

Add this value to `report["events_summary"]` and `TreatmentResult.events_summary`:

```python
"artifact_references": artifact_references,
```

- [x] **Step 4: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_evidence.py local/tests/scaffold/test_logging.py -q
```

Expected: all selected tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add eval/scaffold/python/evidence.py eval/local/tests/conftest.py eval/local/tests/scaffold/test_evidence.py eval/local/tests/scaffold/test_logging.py
git commit -m "feat(eval): record artifact references"
```

Expected: commit succeeds.

### Task 2: Structured Failure Attribution

**Files:**
- Create: `eval/scaffold/python/attribution.py`
- Modify: `eval/local/tests/conftest.py`
- Modify: `eval/local/scripts/compare_baselines.py`
- Test: `eval/local/tests/scaffold/test_attribution.py`
- Test: `eval/local/tests/scaffold/test_compare_baselines.py`

**Interfaces:**
- Produces: `FailureAttribution(bucket: Literal["harness", "workflow", "task", "model"], check: str, reason: str)`.
- Produces: `classify_failures(failed: list[str], events: dict, profile: str | None) -> list[dict[str, str]]`.
- Consumes: report `checks_failed`, `events_summary.skills_invoked`, `events_summary.profile`, and legacy failed-check strings.

- [x] **Step 1: Write failing attribution tests**

Create `eval/local/tests/scaffold/test_attribution.py`:

```python
from scaffold.python.attribution import classify_failures


def test_classifies_missing_skill_as_harness_when_no_skill_invoked():
    result = classify_failures(
        ["Required skill not invoked: comet"],
        {"skills_invoked": [], "commands_run": []},
        "comet-workflow",
    )

    assert result == [
        {
            "bucket": "harness",
            "check": "Required skill not invoked: comet",
            "reason": "target Skill was never invoked, so workflow quality is not observable",
        }
    ]


def test_classifies_state_failures_as_workflow_after_skill_invocation():
    result = classify_failures(
        [".comet.yaml missing"],
        {"skills_invoked": ["comet"], "commands_run": []},
        "comet-workflow",
    )

    assert result[0]["bucket"] == "workflow"


def test_classifies_validator_path_mismatch_as_task():
    result = classify_failures(
        ["artifact path not found in archive"],
        {"skills_invoked": ["comet"], "commands_run": []},
        "comet-workflow",
    )

    assert result[0]["bucket"] == "task"
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_attribution.py -q
```

Expected: failure because `scaffold.python.attribution` does not exist.

- [x] **Step 3: Implement attribution module**

Create `eval/scaffold/python/attribution.py`:

```python
"""Failure attribution for eval reports."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Literal

FailureBucket = Literal["harness", "workflow", "task", "model"]


@dataclass(frozen=True)
class FailureAttribution:
    bucket: FailureBucket
    check: str
    reason: str


def classify_failure(check: str, events: dict, profile: str | None) -> FailureAttribution:
    skills_invoked = events.get("skills_invoked") or []
    if re.search(r"Required skill not invoked|skill.*not invoked", check, re.I):
        if not skills_invoked:
            return FailureAttribution(
                "harness",
                check,
                "target Skill was never invoked, so workflow quality is not observable",
            )
        return FailureAttribution("workflow", check, "Skill invocation contract failed")

    if re.search(r"artifact path|not found in archive|validator|task directory", check, re.I):
        return FailureAttribution("task", check, "task or validator path assumption failed")

    if re.search(r"\.comet\.yaml|guard|state|transition|archive", check, re.I):
        return FailureAttribution("workflow", check, "workflow state or guard evidence failed")

    if profile == "generic" and not skills_invoked:
        return FailureAttribution("harness", check, "generic Skill target did not run")

    return FailureAttribution("model", check, "task failed after observable workflow execution")


def classify_failures(failed: list[str], events: dict, profile: str | None) -> list[dict[str, str]]:
    return [asdict(classify_failure(check, events, profile)) for check in failed]
```

In `eval/local/tests/conftest.py`, import and record:

```python
from scaffold.python.attribution import classify_failures
```

Inside `record_result._record()`, before building `report`, add:

```python
failure_attribution = classify_failures(
    failed,
    events,
    events.get("profile"),
)
```

Add to `report["events_summary"]` and `TreatmentResult.events_summary`:

```python
"failure_attribution": failure_attribution,
```

- [x] **Step 4: Prefer structured attribution in comparison reports**

In `eval/local/scripts/compare_baselines.py`, replace `_attributions()` body with structured-first logic:

```python
def _attributions(reports: list[dict]) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = defaultdict(list)
    for rep in reports:
        structured = rep.get("events_summary", {}).get("failure_attribution") or []
        if structured:
            for item in structured:
                bucket = item.get("bucket", "model")
                buckets[bucket].append(
                    f"{item.get('check', '')}  ->  [{bucket}] {item.get('reason', '')}"
                )
            continue
        for fail in rep.get("checks_failed", []):
            if "[RUBRIC]" in fail:
                continue
            bucket, reason = _attribute_failure(fail)
            buckets[bucket].append(f"{fail}  ->  [{bucket}] {reason}")
    return buckets
```

Update the attribution section text to mention `harness`:

```python
"**harness** (runner/trigger issue), **workflow** (skill guidance issue), "
"**task** (task/validator issue), or **model** (LLM capability issue)."
```

Iterate buckets in this order:

```python
for bucket in ("harness", "workflow", "task", "model"):
```

- [x] **Step 5: Add comparison-report test**

Append to `eval/local/tests/scaffold/test_compare_baselines.py`:

```python
def test_compare_report_uses_structured_failure_attribution(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    workflow = {
        "name": "comet-full-workflow-COMET_FULL",
        "passed": False,
        "checks_passed": [],
        "checks_failed": ["Required skill not invoked: comet"],
        "events_summary": {
            "total_tokens": 200,
            "total_cost_usd": 0.02,
            "failure_attribution": [
                {
                    "bucket": "harness",
                    "check": "Required skill not invoked: comet",
                    "reason": "target Skill was never invoked",
                }
            ],
        },
    }
    (reports / "comet_full_report.json").write_text(json.dumps(workflow))

    report = build_report(experiment)

    assert "**harness**" in report
    assert "[harness] target Skill was never invoked" in report
```

- [x] **Step 6: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_attribution.py local/tests/scaffold/test_compare_baselines.py -q
```

Expected: all selected tests pass.

- [x] **Step 7: Commit**

Run:

```bash
git add eval/scaffold/python/attribution.py eval/local/tests/conftest.py eval/local/scripts/compare_baselines.py eval/local/tests/scaffold/test_attribution.py eval/local/tests/scaffold/test_compare_baselines.py
git commit -m "feat(eval): classify failure attribution"
```

Expected: commit succeeds.

### Task 3: Authoring-Skill Profile Quality Checks

**Files:**
- Create: `eval/scaffold/python/validation/authoring_rubric.py`
- Modify: `eval/scaffold/python/profiles.py`
- Modify: `eval/local/tests/tasks/test_tasks.py`
- Test: `eval/local/tests/scaffold/test_profiles.py`

**Interfaces:**
- Produces: `AUTHORING_RUBRIC_DIMENSIONS`.
- Produces: `authoring_skill_rubric_validator(test_dir: Path, outputs: dict) -> tuple[list[str], list[str]]`.
- Consumes: `outputs["skill_package_path"]`, `outputs["eval_manifest"]`, `outputs["required_skills"]`, `outputs["completion"]`, and existing generic rubric.

- [x] **Step 1: Write failing authoring rubric tests**

Append to `eval/local/tests/scaffold/test_profiles.py`:

```python
from scaffold.python.profiles import run_profile_rubric


def test_authoring_skill_profile_checks_generated_package(tmp_path: Path):
    package = tmp_path / "generated-skill"
    (package / "reference").mkdir(parents=True)
    (package / "comet").mkdir()
    (package / "SKILL.md").write_text(
        "# Generated\n\n## 调用链\n1. demo\n\n## 停止点\nAsk before publish.\n",
        encoding="utf-8",
    )
    (package / "reference" / "resolved-skills.json").write_text(
        '{"schemaVersion":1,"sourceSummaries":[{"query":"demo","summary":"Demo"}]}',
        encoding="utf-8",
    )
    (package / "comet" / "skill.yaml").write_text("apiVersion: comet/v1alpha1\nkind: Skill\n")
    (package / "comet" / "guardrails.yaml").write_text("allowedSkills: [demo]\n")
    (package / "comet" / "evals.yaml").write_text("runtime: []\n")

    passed, failed = run_profile_rubric(
        "authoring-skill",
        tmp_path,
        {
            "skill_package_path": str(package),
            "required_skills": ["demo"],
            "events": {"skills_invoked": ["demo"], "tool_calls": [], "commands_run": []},
            "completion": {"passed": ["validator ok"], "failed": []},
            "interaction": {"mode": "none"},
        },
    )

    assert failed == []
    assert any("[RUBRIC] generated_package: 1.00" in item for item in passed)
    assert any("[RUBRIC] resolved_skill_evidence: 1.00" in item for item in passed)
    assert any("[RUBRIC] engine_contract: 1.00" in item for item in passed)


def test_authoring_skill_profile_fails_missing_resolved_skill_evidence(tmp_path: Path):
    package = tmp_path / "generated-skill"
    package.mkdir()
    (package / "SKILL.md").write_text("# Generated\n", encoding="utf-8")

    passed, failed = run_profile_rubric(
        "authoring-skill",
        tmp_path,
        {
            "skill_package_path": str(package),
            "events": {"skills_invoked": [], "tool_calls": [], "commands_run": []},
            "completion": {"passed": ["validator ok"], "failed": []},
            "interaction": {"mode": "none"},
        },
    )

    assert any("resolved-skills.json missing" in item for item in failed)
    assert any("[RUBRIC] resolved_skill_evidence: 0.00" in item for item in passed)
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_profiles.py -q
```

Expected: failures because `authoring-skill` still uses the generic rubric.

- [x] **Step 3: Implement authoring rubric**

Create `eval/scaffold/python/validation/authoring_rubric.py`:

```python
"""Rubric for generated `/comet-any` authoring Skill packages."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scaffold.python.validation.generic_rubric import generic_rubric_validator

AUTHORING_RUBRIC_DIMENSIONS = (
    "completion",
    "skill_invocation",
    "artifact_presence",
    "generated_package",
    "resolved_skill_evidence",
    "engine_contract",
    "review_readiness",
    "safety_boundary",
)


def _fmt(dim: str, score: float, reason: str) -> str:
    return f"[RUBRIC] {dim}: {score:.2f} - {reason}"


def _package_path(outputs: dict[str, Any]) -> Path | None:
    raw = outputs.get("skill_package_path")
    return Path(raw) if raw else None


def _check_package(package: Path | None) -> tuple[float, str, list[str]]:
    if not package:
        return 0.0, "skill_package_path missing", ["skill_package_path missing"]
    skill = package / "SKILL.md"
    if not skill.exists():
        return 0.0, "SKILL.md missing", ["SKILL.md missing"]
    text = skill.read_text(encoding="utf-8")
    checks = [
        ("调用链" in text or "call chain" in text.lower(), "call-chain section missing"),
        ("停止点" in text or "stop" in text.lower(), "stop-point guidance missing"),
    ]
    failures = [reason for passed, reason in checks if not passed]
    score = (len(checks) - len(failures)) / len(checks)
    return score, f"{len(checks) - len(failures)}/{len(checks)} package checks passed", failures


def _check_resolved_evidence(package: Path | None) -> tuple[float, str, list[str]]:
    if not package:
        return 0.0, "skill_package_path missing", ["skill_package_path missing"]
    evidence = package / "reference" / "resolved-skills.json"
    if not evidence.exists():
        return 0.0, "resolved-skills.json missing", ["resolved-skills.json missing"]
    data = json.loads(evidence.read_text(encoding="utf-8"))
    summaries = data.get("sourceSummaries") or []
    if not summaries:
        return 0.0, "sourceSummaries empty", ["sourceSummaries empty"]
    return 1.0, f"{len(summaries)} source summaries", []


def _check_engine_contract(package: Path | None) -> tuple[float, str, list[str]]:
    if not package:
        return 0.0, "skill_package_path missing", ["skill_package_path missing"]
    comet = package / "comet"
    expected = ["skill.yaml", "guardrails.yaml", "evals.yaml"]
    present = [name for name in expected if (comet / name).exists()]
    missing = [f"{name} missing" for name in expected if name not in present]
    if not present and not comet.exists():
        return 1.0, "Engine disabled for lightweight package", []
    return len(present) / len(expected), f"{len(present)}/{len(expected)} engine files present", missing


def _weighted(scores: dict[str, float]) -> float:
    weights = {
        "completion": 1.5,
        "skill_invocation": 1.0,
        "artifact_presence": 1.0,
        "generated_package": 1.5,
        "resolved_skill_evidence": 1.5,
        "engine_contract": 1.0,
        "review_readiness": 1.0,
        "safety_boundary": 1.2,
    }
    return sum(scores[key] * weights[key] for key in weights) / sum(weights.values())


def authoring_skill_rubric_validator(
    test_dir: Path,
    outputs: dict[str, Any],
) -> tuple[list[str], list[str]]:
    generic_passed, generic_failed = generic_rubric_validator(test_dir, outputs)
    generic_scores = {}
    for item in generic_passed:
        if item.startswith("[RUBRIC] "):
            name, score = item.removeprefix("[RUBRIC] ").split(":", 1)
            if name in {"completion", "skill_invocation", "artifact_presence", "safety_boundary"}:
                generic_scores[name] = float(score.strip().split(" ", 1)[0])

    package = _package_path(outputs)
    package_score, package_reason, package_failures = _check_package(package)
    evidence_score, evidence_reason, evidence_failures = _check_resolved_evidence(package)
    engine_score, engine_reason, engine_failures = _check_engine_contract(package)
    review_score = 1.0 if not outputs.get("checks_failed") else 0.0
    review_reason = "no hard validation failures" if review_score == 1.0 else "hard failures present"

    scores = {
        "completion": generic_scores.get("completion", 0.0),
        "skill_invocation": generic_scores.get("skill_invocation", 0.0),
        "artifact_presence": generic_scores.get("artifact_presence", 0.0),
        "generated_package": package_score,
        "resolved_skill_evidence": evidence_score,
        "engine_contract": engine_score,
        "review_readiness": review_score,
        "safety_boundary": generic_scores.get("safety_boundary", 0.0),
    }
    passed = [
        _fmt("completion", scores["completion"], "baseline completion score"),
        _fmt("skill_invocation", scores["skill_invocation"], "required Skill invocation score"),
        _fmt("artifact_presence", scores["artifact_presence"], "expected artifact score"),
        _fmt("generated_package", package_score, package_reason),
        _fmt("resolved_skill_evidence", evidence_score, evidence_reason),
        _fmt("engine_contract", engine_score, engine_reason),
        _fmt("review_readiness", review_score, review_reason),
        _fmt("safety_boundary", scores["safety_boundary"], "generic safety score"),
        f"[RUBRIC] weighted_score: {_weighted(scores):.2f}",
    ]
    failed = generic_failed + package_failures + evidence_failures + engine_failures
    return passed, failed
```

In `eval/scaffold/python/profiles.py`, import and route:

```python
from scaffold.python.validation.authoring_rubric import (
    AUTHORING_RUBRIC_DIMENSIONS,
    authoring_skill_rubric_validator,
)
```

Change the `AUTHORING_SKILL_PROFILE` entry:

```python
AUTHORING_SKILL_PROFILE: ProfileSpec(
    name=AUTHORING_SKILL_PROFILE,
    rubric_dimensions=AUTHORING_RUBRIC_DIMENSIONS + ("weighted_score",),
    default_interaction=InteractionConfig(
        mode="auto_user",
        max_turns=8,
        simulator_prompt=GENERIC_SIMULATOR_PROMPT,
    ),
    rubric=authoring_skill_rubric_validator,
),
```

In `eval/local/tests/tasks/test_tasks.py`, add to `outputs`:

```python
"skill_package_path": skill_hints.get("path"),
```

- [x] **Step 4: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_profiles.py -q
```

Expected: all selected tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add eval/scaffold/python/validation/authoring_rubric.py eval/scaffold/python/profiles.py eval/local/tests/tasks/test_tasks.py eval/local/tests/scaffold/test_profiles.py
git commit -m "feat(eval): score authoring skill packages"
```

Expected: commit succeeds.

### Task 4: Compare Report Source Evidence

**Files:**
- Modify: `eval/local/scripts/compare_baselines.py`
- Test: `eval/local/tests/scaffold/test_compare_baselines.py`

**Interfaces:**
- Consumes: report `run_id`, `events_summary.profile`, `events_summary.skill_sources`, `events_summary.eval_manifest`, and `events_summary.artifact_references`.
- Produces: comparison report sections `Source evidence` and structured attribution with report paths.

- [x] **Step 1: Write failing source-evidence test**

Append to `eval/local/tests/scaffold/test_compare_baselines.py`:

```python
def test_compare_report_lists_source_evidence(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    workflow = {
        "name": "comet-full-workflow-COMET_FULL",
        "passed": True,
        "run_id": "run-123",
        "checks_passed": ["[RUBRIC] weighted_score: 1.00 - ok"],
        "checks_failed": [],
        "events_summary": {
            "profile": "comet-workflow",
            "skill_sources": [{"name": "comet", "hash": "sha256:abc"}],
            "eval_manifest": "demo/comet/eval.yaml",
            "artifact_references": {"report": "reports/comet_full_report.json"},
            "total_tokens": 200,
            "total_cost_usd": 0.02,
        },
    }
    (reports / "comet_full_report.json").write_text(json.dumps(workflow))

    report = build_report(experiment)

    assert "## Source evidence" in report
    assert "`run-123`" in report
    assert "comet-workflow" in report
    assert "sha256:abc" in report
    assert "reports/comet_full_report.json" in report
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
```

Expected: new source-evidence test fails.

- [x] **Step 3: Add source evidence section**

In `eval/local/scripts/compare_baselines.py`, add helper:

```python
def _source_summary(report: dict) -> str:
    events = report.get("events_summary", {})
    run_id = report.get("run_id") or "n/a"
    profile = events.get("profile") or "n/a"
    sources = events.get("skill_sources") or []
    source_text = ", ".join(
        f"{item.get('name', 'skill')}@{item.get('hash', item.get('path', 'unknown'))}"
        if isinstance(item, dict)
        else str(item)
        for item in sources
    ) or "none"
    manifest = events.get("eval_manifest") or "none"
    refs = events.get("artifact_references") or {}
    report_ref = refs.get("report", "none")
    return f"| `{run_id}` | {profile} | {source_text} | {manifest} | {report_ref} |"
```

In `build_report()`, after the spend summary, insert:

```python
lines.append("## Source evidence")
lines.append("")
lines.append("| Run | Profile | Skill sources | Eval manifest | Report |")
lines.append("|-----|---------|---------------|---------------|--------|")
for treatment in TREATMENTS:
    for rep in by_treatment.get(treatment, []):
        lines.append(_source_summary(rep))
lines.append("")
```

- [x] **Step 4: Run focused tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
```

Expected: all selected tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add eval/local/scripts/compare_baselines.py eval/local/tests/scaffold/test_compare_baselines.py
git commit -m "feat(eval): add compare source evidence"
```

Expected: commit succeeds.

### Task 5: Authoring Skill Smoke Task

**Files:**
- Create: `eval/local/tasks/authoring-skill-smoke/task.toml`
- Create: `eval/local/tasks/authoring-skill-smoke/instruction.md`
- Create: `eval/local/tasks/authoring-skill-smoke/environment/Dockerfile`
- Create: `eval/local/tasks/authoring-skill-smoke/validation/test_authoring_skill_smoke.py`
- Modify: `eval/local/tasks/index.yaml`
- Test: `eval/local/tests/scaffold/test_tasks.py`

**Interfaces:**
- Produces: task id `authoring-skill-smoke`.
- Consumes: generated Skill package passed through `--eval-manifest` or `--skill-path`.
- Produces: validation checks for `SKILL.md`, `reference/resolved-skills.json`, and optional `comet/` Engine files.

- [x] **Step 1: Add task files**

Create `eval/local/tasks/authoring-skill-smoke/task.toml`:

```toml
[metadata]
name = "authoring-skill-smoke"
description = "Smoke task for generated Comet-native Skill packages."
difficulty = "easy"
category = "generic"
tags = ["authoring", "skill", "comet-any"]
default_treatments = ["CONTROL"]

[environment]
description = "Workspace for generated Skill package inspection."
dockerfile = "environment/Dockerfile"
timeout_sec = 600

[validation]
test_scripts = ["test_authoring_skill_smoke.py"]
target_artifacts = []
timeout = 60

[evaluation]
profile = "authoring-skill"
expected_artifacts = []
```

Create `eval/local/tasks/authoring-skill-smoke/instruction.md`:

```markdown
Inspect the generated Skill package available in this eval run.

Confirm that the package has user-facing guidance, resolved Skill evidence, and Engine files when the package enables Engine semantics.
```

Create `eval/local/tasks/authoring-skill-smoke/environment/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /workspace
```

Create `eval/local/tasks/authoring-skill-smoke/validation/test_authoring_skill_smoke.py`:

```python
from pathlib import Path

from scaffold.python.validation.core import write_test_results


def main():
    passed = []
    failed = []
    skill_files = list(Path(".").rglob("SKILL.md"))
    if skill_files:
        passed.append("SKILL.md present")
    else:
        failed.append("SKILL.md missing")

    if list(Path(".").rglob("reference/resolved-skills.json")):
        passed.append("resolved-skills.json present")
    else:
        failed.append("resolved-skills.json missing")

    engine_roots = [path.parent for path in Path(".").rglob("comet/skill.yaml")]
    for root in engine_roots:
        if (root / "guardrails.yaml").exists() and (root / "evals.yaml").exists():
            passed.append("Engine package files present")
        else:
            failed.append(f"Engine package incomplete at {root}")

    write_test_results({"passed": passed, "failed": failed})


if __name__ == "__main__":
    main()
```

Add to `eval/local/tasks/index.yaml`:

```yaml
  - name: authoring-skill-smoke
    category: generic
    default_treatments:
      - CONTROL
    description: Smoke task for generated Comet-native Skill packages.
```

- [x] **Step 2: Update task index test**

In `eval/local/tests/scaffold/test_tasks.py`, add `authoring-skill-smoke` to the expected task name set.

- [x] **Step 3: Run focused task tests**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold/test_tasks.py -q
uv run pytest local/tests/tasks/test_tasks.py --task=authoring-skill-smoke --treatment=CONTROL --collect-only -q
```

Expected: scaffold tests pass and collection includes one authoring smoke case.

- [x] **Step 4: Commit**

Run:

```bash
git add eval/local/tasks/authoring-skill-smoke eval/local/tasks/index.yaml eval/local/tests/scaffold/test_tasks.py
git commit -m "feat(eval): add authoring skill smoke task"
```

Expected: commit succeeds.

### Task 6: Docs And Final Verification

**Files:**
- Modify: `eval/README.md`
- Modify: `eval/local/README.md`

**Interfaces:**
- Documents: `--profile=authoring-skill`, `--eval-manifest`, artifact references, and attribution buckets.

- [x] **Step 1: Update eval docs**

Add this section to `eval/README.md`:

```markdown
### Evidence and Attribution

Each local eval report records the selected profile, Skill source/hash metadata, interaction config,
run id, report output config, artifact references, and structured failure attribution. Attribution
uses four buckets: `harness`, `workflow`, `task`, and `model`.
```

Add this command to `eval/local/README.md`:

```bash
uv run pytest local/tests/tasks/test_tasks.py \
  --task=authoring-skill-smoke \
  --eval-manifest=/path/to/generated-skill/comet/eval.yaml \
  --profile=authoring-skill -v
```

- [x] **Step 2: Run focused verification**

Run:

```bash
cd eval
uv run pytest local/tests/scaffold -q
uv run pytest local/tests/tasks/test_tasks.py --task=authoring-skill-smoke --treatment=CONTROL --collect-only -q
uv run pytest local/tests/tasks/test_tasks.py --task=generic-skill-smoke --treatment=CONTROL --collect-only -q
```

Expected: all scaffold tests pass and both task collection commands collect one test.

- [x] **Step 3: Run repository whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [x] **Step 4: Commit**

Run:

```bash
git add eval/README.md eval/local/README.md
git commit -m "docs(eval): document evidence attribution"
```

Expected: commit succeeds.

## Final Verification

- [x] Run the full eval scaffold suite:

```bash
cd eval
uv run pytest local/tests/scaffold -q
```

Expected: all scaffold tests pass.

- [x] Run task collection for generic and authoring profiles:

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task=generic-skill-smoke --treatment=CONTROL --collect-only -q
uv run pytest local/tests/tasks/test_tasks.py --task=authoring-skill-smoke --treatment=CONTROL --collect-only -q
```

Expected: each command collects one test.

- [x] Run the comparison report unit tests:

```bash
cd eval
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
```

Expected: all tests pass.

- [x] Run whitespace check:

```bash
git diff --check
```

Expected: no output.

## Self-Review

- Spec coverage: Tasks cover evidence completeness, failure attribution, `authoring-skill` profile checks, source report links, manifest-driven quick eval entry, configurable report outputs, and local-first verification.
- Placeholder scan: No unresolved marker words or unspecified implementation steps remain.
- Type consistency: `artifact_references`, `failure_attribution`, `skill_package_path`, and `authoring-skill` are used consistently across tests, runner outputs, rubrics, and reports.
- Risk control: Existing `comet-workflow` and `generic` behavior remains routed through current profile dispatch; new attribution and evidence fields are additive.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-eval-quality-closure.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
